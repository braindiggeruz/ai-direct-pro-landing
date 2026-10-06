// The SQL rules of the studio (spec §4.1, §4.3; memory gptbot-d1-read-budget):
// every statement reads or writes by a full key or with a LIMIT, through an
// index, in its own org, without window functions, CTEs, joins or the chat's
// turn tables. tests/studio-d1-budget.test.ts runs it over every SQL string
// in the studio's server code.
import ts from "typescript";
import type { DatabaseSync } from "node:sqlite";

export interface FoundSql {
  line: number;
  sql: string;
}

/** Stands for a `${…}` of a template or a non-literal operand of `+`. */
export const EXPR = "__EXPR__";

const SQL_START = /^\s*(select|insert|update|delete|replace|with|create|alter|drop|pragma|vacuum|attach)\s[\s\S]*?\b(from|into|set|table|index|view|trigger|table_info|database)\b/i;

/** Every string, template or `+` chain of them in `source` that reads as SQL. */
export function findSql(fileName: string, source: string): FoundSql[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: FoundSql[] = [];
  const fold = (node: ts.Node): string | null => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => ` ${EXPR} ${span.literal.text}`).join("");
    if (ts.isParenthesizedExpression(node)) return fold(node.expression);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = fold(node.left);
      const right = fold(node.right);
      if (left === null && right === null) return null;
      return `${left ?? ` ${EXPR} `}${right ?? ` ${EXPR} `}`;
    }
    return null;
  };
  const visit = (node: ts.Node) => {
    const text = fold(node);
    if (text !== null) {
      if (SQL_START.test(text)) found.push({ line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1, sql: text });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Each full key of a table: its primary key, its non-partial unique indexes and rowid. */
export type TableKeys = Record<string, string[][]>;

export function tableKeys(db: DatabaseSync, tables: readonly string[]): TableKeys {
  const keys: TableKeys = {};
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string; pk: number }>;
    if (!columns.length) throw new Error(`no table ${table}`);
    const list: string[][] = [["rowid"]];
    const pk = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk).map((column) => column.name);
    if (pk.length) list.push(pk);
    const indexes = db.prepare(`PRAGMA index_list('${table}')`).all() as Array<{ name: string; unique: number; partial: number }>;
    for (const index of indexes) {
      if (!index.unique || index.partial) continue;
      const info = db.prepare(`PRAGMA index_info('${index.name}')`).all() as Array<{ seqno: number; name: string }>;
      list.push(info.sort((a, b) => a.seqno - b.seqno).map((column) => column.name));
    }
    keys[table] = list;
  }
  return keys;
}

export interface LintOptions {
  /** Tables the studio may touch. */
  tables: TableKeys;
  /** Tables whose rows carry org_id and must be read and written in one org. */
  orgTables: readonly string[];
  /** CREATE … IF NOT EXISTS of studio objects is allowed (schema.ts only). */
  ddl: boolean;
  /** A database with the whole schema, for EXPLAIN QUERY PLAN. */
  db: DatabaseSync;
}

const maskStrings = (sql: string) => sql.replace(/'(?:[^']|'')*'/g, "'_'");
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

interface Scope {
  text: string;
  /** Indexes (into the scope list) of the subqueries replaced by __SUBQn__. */
  subs: number[];
}

/** The statement and each parenthesised SELECT in it, every subquery replaced by __SUBQn__. */
function scopes(sql: string): Scope[] {
  const list: Scope[] = [];
  const cut = (text: string): number => {
    const index = list.length;
    list.push({ text: "", subs: [] });
    let out = "";
    let i = 0;
    while (i < text.length) {
      if (text[i] === "(" && /^\(\s*SELECT\b/i.test(text.slice(i))) {
        let depth = 0;
        let j = i;
        for (; j < text.length; j++) {
          if (text[j] === "(") depth++;
          else if (text[j] === ")" && --depth === 0) break;
        }
        const sub = cut(text.slice(i + 1, j));
        list[index].subs.push(sub);
        out += ` __SUBQ${sub}__ `;
        i = j + 1;
      } else {
        out += text[i++];
      }
    }
    list[index].text = out.replace(/\s+/g, " ").trim();
    return index;
  };
  cut(sql);
  return list;
}

/** The part of `text` at parenthesis depth 0 split on `separator` (a keyword). */
function splitTopLevel(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (depth === 0) {
      const match = separator.exec(text.slice(i));
      if (match && match.index === 0 && /\s/.test(text[i - 1] ?? " ")) {
        parts.push(text.slice(start, i));
        i += match[0].length - 1;
        start = i + 1;
      }
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim());
}

/** The WHERE clause of a scope at depth 0, without ORDER BY, LIMIT, RETURNING and the like. */
function whereClause(text: string): string | null {
  const parts = splitTopLevel(text, /^WHERE\b/i);
  if (parts.length < 2) return null;
  return splitTopLevel(parts.slice(1).join(" WHERE "), /^(GROUP BY|ORDER BY|LIMIT|RETURNING|HAVING)\b/i)[0];
}

const AGGREGATE = /\b(COUNT|SUM|TOTAL|AVG|MIN|MAX|GROUP_CONCAT)\s*\(|\bGROUP BY\b/i;
const EQUALITY = /^(?:\w+\.)?(\w+)\s*(?:==?|IS(?!\s+NOT\b))\s*(\?\d*|:\w+|'_'|-?\d+)$/i;

/** Why `sql` breaks the rules; empty when it keeps them. */
export function lintSql(rawSql: string, options: LintOptions): string[] {
  const problems: string[] = [];
  const sql = maskStrings(stripComments(rawSql)).replace(/\s+/g, " ").trim();
  const head = /^(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? "";

  if (head === "CREATE") {
    if (!options.ddl) return ["DDL outside functions/lib/studio/schema.ts"];
    const ddl = /^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS (\w+)(?: ON (\w+))?/i.exec(sql);
    if (!ddl) return ["only CREATE TABLE / INDEX IF NOT EXISTS"];
    if (!/^(studio_|idx_studio_)/.test(ddl[3]) || (ddl[4] && !ddl[4].startsWith("studio_"))) return [`DDL of a non-studio object ${ddl[3]}`];
    return [];
  }
  if (head === "WITH") return ["CTE (WITH)"];
  if (!["SELECT", "INSERT", "UPDATE", "DELETE"].includes(head)) return [`${head || "this statement"} is not allowed`];

  if (/\bOVER\s*\(|\bWINDOW\b/i.test(sql)) problems.push("window function");
  if (/\bWITH\b|\bRECURSIVE\b/i.test(sql)) problems.push("CTE (WITH)");
  if (/\bJOIN\b/i.test(sql)) problems.push("JOIN: read each table by its key");
  if (/\bFROM \w+(?: (?:AS )?\w+)? ?,/i.test(sql)) problems.push("comma join");
  if (new RegExp(`\\b(FROM|JOIN|INTO|UPDATE|TABLE) ${EXPR}`, "i").test(sql)) problems.push("a table named by an expression");
  if (/\bINSERT OR REPLACE\b/i.test(sql)) problems.push("INSERT OR REPLACE deletes rows silently");

  const tables = [...sql.matchAll(/\b(?:FROM|JOIN|INTO) (\w+)|\bUPDATE (?!SET\b)(?:OR \w+ )?(\w+)/gi)].map((match) => match[1] ?? match[2]);
  for (const table of tables) if (!(table in options.tables)) problems.push(`table ${table} is not one the studio may touch`);
  // A table read twice in one statement is a self-join, unless it is the
  // target of a bounded UPDATE / DELETE … WHERE rowid IN (SELECT rowid …).
  const reads = [...sql.replace(/^DELETE FROM \w+/i, "DELETE").matchAll(/\bFROM (\w+)/gi)].map((match) => match[1]);
  if (new Set(reads).size !== reads.length) problems.push("the same table read twice (self-join)");

  const all = scopes(sql);
  const bounded = new Array<boolean>(all.length).fill(false);
  const inOrg = new Array<boolean>(all.length).fill(false);
  for (let index = all.length - 1; index >= 0; index--) {
    const { text } = all[index];
    const kind = /^(\w+)/.exec(text)?.[1]?.toUpperCase();
    if (kind === "INSERT") {
      const table = /\bINTO (\w+)/i.exec(text)?.[1] ?? "";
      if (!/\bVALUES\b/i.test(text) || /\bSELECT\b/i.test(text.replace(/__SUBQ\d+__/g, ""))) problems.push("INSERT … SELECT: insert VALUES");
      const columns = /\bINTO \w+ ?\(([^)]*)\)/i.exec(text)?.[1]?.split(",").map((column) => column.trim()) ?? [];
      if (options.orgTables.includes(table) && !columns.includes("org_id")) problems.push(`INSERT INTO ${table} without org_id`);
      bounded[index] = true;
      inOrg[index] = true;
      continue;
    }
    const table = kind === "SELECT" ? /\bFROM (\w+)/i.exec(text)?.[1] : kind === "UPDATE" ? /^UPDATE (?:OR \w+ )?(\w+)/i.exec(text)?.[1] : /^DELETE FROM (\w+)/i.exec(text)?.[1];
    if (!table) {
      problems.push(`cannot tell the table of: ${text.slice(0, 60)}`);
      continue;
    }
    const where = whereClause(text);
    const conjuncts = where === null ? [] : splitTopLevel(where, /^AND\b/i);
    const anyOr = where !== null && splitTopLevel(where, /^OR\b/i).length > 1;
    const equal = new Set(anyOr ? [] : conjuncts.flatMap((conjunct) => EQUALITY.exec(conjunct)?.[1] ?? []));
    const viaRowid = anyOr ? [] : conjuncts.flatMap((conjunct) => {
      const match = /^rowid IN __SUBQ(\d+)__$/i.exec(conjunct);
      return match ? [Number(match[1])] : [];
    });
    const keyed = (options.tables[table] ?? []).some((key) => key.every((column) => equal.has(column)));
    const limited = /\bLIMIT (\?\d*|\d+)\b/i.test(text);
    const aggregate = AGGREGATE.test(text);
    bounded[index] = keyed || (limited && !aggregate) || viaRowid.some((sub) => bounded[sub]);
    if (!bounded[index]) problems.push(aggregate && !keyed
      ? `aggregate over ${table}: LIMIT does not bound the rows it reads`
      : `${kind} on ${table} without a LIMIT or a full key`);
    inOrg[index] = equal.has("org_id") || viaRowid.some((sub) => inOrg[sub]);
    if (options.orgTables.includes(table) && !inOrg[index]) problems.push(`${kind} on ${table} outside one org (org_id = ?)`);
  }

  // SQLite's own plan: every table is searched through a key or an index.
  if (!problems.length) {
    try {
      const plan = options.db.prepare(`EXPLAIN QUERY PLAN ${rawSql.replaceAll(EXPR, "?")}`).all() as Array<{ detail: string }>;
      for (const { detail } of plan) {
        if (/^SCAN (?!CONSTANT ROW)/.test(detail)) problems.push(`full scan: ${detail}`);
        // One org holds every row, so an index narrowed by org_id alone still reads them all.
        const narrowed = /^SEARCH \w+ USING .*\(([^()]*)\)$/.exec(detail)?.[1];
        if (narrowed !== undefined && narrowed.split(/ AND /).every((term) => /^org_id=\?$/.test(term.trim())))
          problems.push(`the index narrows by org only: ${detail}`);
      }
    } catch (error) {
      problems.push(`does not prepare: ${(error as Error).message}`);
    }
  }
  return [...new Set(problems)];
}

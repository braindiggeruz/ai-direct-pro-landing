import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export interface RestoreReport {
  status: 'pass';
  sourceSha256: string;
  sourceBytes: number;
  statements: number;
  reorderedStatements: number;
  quickCheck: 'ok';
  integrityCheck: 'ok';
  foreignKeyViolations: 0;
  tables: number;
  indexes: number;
  ledgerRows: number;
  ledgerLast: string;
  aggregates: {
    identities: number;
    organizations: number;
    stores: number;
    memberships: number;
    products: number;
    orders: number;
    handoffs: number;
    auditEvents: number;
    bindingChallenges: number;
  };
}

interface CliOptions {
  dumpPath: string;
  databasePath: string;
}

interface CountRow {
  total: number;
}

interface LedgerRow {
  name: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Split a D1 SQL export without treating semicolons inside strings or comments
 * as statement boundaries. No statement content is logged by this module.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buffer = '';
  let quote: "'" | '"' | '`' | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1] ?? '';
    buffer += current;

    if (lineComment) {
      if (current === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === '*' && next === '/') {
        buffer += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      if (current === quote) {
        if (next === quote) {
          buffer += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (current === '-' && next === '-') {
      buffer += next;
      index += 1;
      lineComment = true;
      continue;
    }
    if (current === '/' && next === '*') {
      buffer += next;
      index += 1;
      blockComment = true;
      continue;
    }
    if (current === "'" || current === '"' || current === '`') {
      quote = current;
      continue;
    }
    if (current === ';') {
      if (buffer.trim()) statements.push(buffer.trim());
      buffer = '';
    }
  }

  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}

function identifiesStatement(statement: string, pattern: RegExp): boolean {
  return pattern.test(statement.replace(/\s+/g, ' ').trim());
}

/**
 * Cloudflare D1 exports can place the existing composite store index after
 * child inserts. Plain SQLite validates the referenced parent key while it
 * prepares those inserts, so the untouched export fails even with FK checks
 * disabled. Move that one existing statement immediately after the parent
 * table DDL; the statement multiset and every data statement remain identical.
 */
export function prepareRestoreStatements(statements: readonly string[]): {
  statements: string[];
  reorderedStatements: number;
} {
  const indexPositions = statements
    .map((statement, index) => identifiesStatement(
      statement,
      /^CREATE UNIQUE INDEX (?:IF NOT EXISTS )?["`]?idx_sotuvchi_stores_org_id["`]?\b/i,
    ) ? index : -1)
    .filter((index) => index >= 0);

  if (indexPositions.length === 0) {
    return { statements: [...statements], reorderedStatements: 0 };
  }
  if (indexPositions.length !== 1) {
    throw new Error('restore_preflight_failed:index_count');
  }

  const tableIndex = statements.findIndex((statement) => identifiesStatement(
    statement,
    /^CREATE TABLE (?:IF NOT EXISTS )?["`]?sotuvchi_stores["`]?\b/i,
  ));
  if (tableIndex < 0) throw new Error('restore_preflight_failed:store_table_missing');

  const indexPosition = indexPositions[0];
  if (indexPosition === tableIndex + 1) {
    return { statements: [...statements], reorderedStatements: 0 };
  }

  const reordered = [...statements];
  const [indexStatement] = reordered.splice(indexPosition, 1);
  const adjustedTableIndex = indexPosition < tableIndex ? tableIndex - 1 : tableIndex;
  reordered.splice(adjustedTableIndex + 1, 0, indexStatement);

  const before = statements.map(sha256).sort().join('\n');
  const after = reordered.map(sha256).sort().join('\n');
  if (before !== after) throw new Error('restore_preflight_failed:statement_drift');

  return { statements: reordered, reorderedStatements: 1 };
}

function count(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as
    | CountRow
    | undefined;
  return Number(row?.total ?? 0);
}

function pragmaValue(db: DatabaseSync, pragma: 'quick_check' | 'integrity_check'): string {
  const row = db.prepare(`PRAGMA ${pragma}`).get() as Record<string, unknown> | undefined;
  return String(row?.[pragma] ?? '');
}

function parseCli(args: readonly string[]): CliOptions {
  const dumpPath = args[0];
  const outputFlag = args.indexOf('--output');
  const databasePath = outputFlag >= 0 ? args[outputFlag + 1] : '';
  if (!dumpPath || !databasePath) {
    throw new Error('usage: d1-export-restore.ts <dump.sql> --output <isolated.sqlite>');
  }
  return {
    dumpPath: path.resolve(dumpPath),
    databasePath: path.resolve(databasePath),
  };
}

export async function restoreD1Export(options: CliOptions): Promise<RestoreReport> {
  if (!existsSync(options.dumpPath)) throw new Error('restore_preflight_failed:dump_missing');
  if (options.dumpPath === options.databasePath) {
    throw new Error('restore_preflight_failed:output_matches_source');
  }

  const dump = await readFile(options.dumpPath, 'utf8');
  const parsed = splitSqlStatements(dump);
  const prepared = prepareRestoreStatements(parsed);
  if (prepared.statements.length === 0) {
    throw new Error('restore_preflight_failed:empty_dump');
  }

  await mkdir(path.dirname(options.databasePath), { recursive: true });
  await rm(options.databasePath, { force: true });
  const db = new DatabaseSync(options.databasePath);

  try {
    for (let index = 0; index < prepared.statements.length; index += 1) {
      try {
        db.exec(prepared.statements[index]);
      } catch {
        throw new Error(`restore_failed:statement_${index + 1}`);
      }
    }

    db.exec('PRAGMA foreign_keys = ON');
    const quickCheck = pragmaValue(db, 'quick_check');
    const integrityCheck = pragmaValue(db, 'integrity_check');
    const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all().length;
    if (quickCheck !== 'ok') throw new Error('restore_validation_failed:quick_check');
    if (integrityCheck !== 'ok') throw new Error('restore_validation_failed:integrity_check');
    if (foreignKeyViolations !== 0) throw new Error('restore_validation_failed:foreign_keys');

    const ledgerLast = db.prepare(
      'SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1',
    ).get() as LedgerRow | undefined;

    return {
      status: 'pass',
      sourceSha256: sha256(dump),
      sourceBytes: Buffer.byteLength(dump),
      statements: prepared.statements.length,
      reorderedStatements: prepared.reorderedStatements,
      quickCheck: 'ok',
      integrityCheck: 'ok',
      foreignKeyViolations: 0,
      tables: Number((db.prepare(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      ).get() as CountRow).total),
      indexes: Number((db.prepare(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'",
      ).get() as CountRow).total),
      ledgerRows: count(db, 'd1_migrations'),
      ledgerLast: String(ledgerLast?.name ?? ''),
      aggregates: {
        identities: count(db, 'identities'),
        organizations: count(db, 'organizations'),
        stores: count(db, 'sotuvchi_stores'),
        memberships: count(db, 'memberships'),
        products: count(db, 'sotuvchi_products'),
        orders: count(db, 'sotuvchi_orders'),
        handoffs: count(db, 'sotuvchi_handoffs'),
        auditEvents: count(db, 'owner_audit_events'),
        bindingChallenges: count(db, 'seller_identity_binding_challenges'),
      },
    };
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const report = await restoreD1Export(parseCli(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'restore_failed:unknown');
    process.exitCode = 1;
  });
}

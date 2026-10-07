// The studio's D1 budget, as a linter (spec §4.1, §4.3): every SQL string in
// the studio's server code reads and writes by a full key or with a LIMIT,
// through an index (SQLite's own EXPLAIN QUERY PLAN), in one org, without
// window functions, CTEs, joins or the chat's turn tables. On 05.10 one
// unbounded agent query read 9.9M rows and took production D1 down (memory
// gptbot-d1-read-budget); a studio query must never be able to do that.
// Real SQLite (tests/helpers/sqlite-d1.ts); no remote database.
// Run: node --import tsx --test tests/studio-d1-budget.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { EXPR, findSql, lintSql, tableKeys, type LintOptions } from "./helpers/studio-sql-lint";
import { ensureSchema } from "../functions/lib/gpt-chat/schema";
import { ensureBillingSchema } from "../functions/lib/gpt-chat/billing-schema";
import {STUDIO_OPERATIONS_DDL} from '../functions/lib/studio/operations-schema';
import {VERIFICATION_SITE_CONCURRENCY,VERIFICATION_IP_CONCURRENCY} from '../functions/lib/studio/verification-store';
import {
  STUDIO_DDL,
  STUDIO_PAYMENT_TABLES,
  STUDIO_PAYMENTS_DDL,
  STUDIO_TABLES,
  ensureStudioPaymentsSchema,
} from "../functions/lib/studio/schema";

const ROOT = path.resolve(import.meta.dirname, "..");
// Reviewed atomic operations need INSERT SELECT / keyed joins. Only these
// exact nine statements are exceptions, never a file or a general SQL shape.
// Snapshot fanout <=11 (base + ten credits); credit COUNT <=10. Verification
// counts <=32 active leases, atomically capped. Reports bound their driving
// subquery BEFORE joining by unique keys (501 refunds, 5001 ledger entries).
// The two triggers look up a unique provider transaction; 0076 parity and
// provider tests prove ownership in both directions. Every query's real
// SQLite plan must still match the independently reviewed indexed plan.
const REVIEWED = JSON.parse(readFileSync(path.join(ROOT,'tests/fixtures/studio-reviewed-sql.json'),'utf8')) as Array<{file:string;sql:string;plan:string[]}>;
const normalizeSql=(sql:string)=>sql.replace(/\s+/g,' ').trim();
function reviewedSql(file:string,sql:string) {return REVIEWED.find(row=>row.file===file&&row.sql===normalizeSql(sql));}
/** The chat's tables the studio reuses unchanged (spec §4.2 header, §5.3). */
const REUSED = [
  "gpt_payment_journal", "gpt_payment_consents", "gpt_fiscal_receipts", "gpt_model_spend",
  "gpt_rate_limits", "gpt_ui_events", "gpt_auth_sessions",
] as const;

async function fullSchema(): Promise<SqliteD1> {
  const db = new SqliteD1();
  const migrations = path.join(ROOT, "migrations");
  for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort())
    db.exec(readFileSync(path.join(migrations, file), "utf8"));
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  await ensureStudioPaymentsSchema(db.asD1());
  return db;
}

let options: LintOptions | null = null;
async function lintOptions(ddl = false): Promise<LintOptions> {
  if (!options) {
    const db = await fullSchema();
    const tables = [...STUDIO_TABLES, ...STUDIO_PAYMENT_TABLES, ...REUSED, ...STUDIO_OPERATIONS_DDL.flatMap(sql=>/^CREATE TABLE IF NOT EXISTS (\w+)/.exec(sql)?.[1]??[])];
    const orgTables = tables.filter((table) =>
      db.rows<{ name: string }>(`PRAGMA table_info('${table}')`).some((column) => column.name === "org_id"));
    options = { tables: tableKeys(db.sqlite, tables), orgTables, ddl: false, db: db.sqlite };
  }
  return { ...options, ddl };
}

/** Server files of the studio: libraries, endpoints, internal endpoints, the Click route of variant B. */
function studioServerFiles(): string[] {
  const walk = (dir: string): string[] =>
    !existsSync(dir) ? [] : readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : name.endsWith(".ts") ? [full] : [];
    });
  const internal = path.join(ROOT, "functions/api/internal");
  return [
    ...walk(path.join(ROOT, "functions/lib/studio")),
    ...walk(path.join(ROOT, "functions/api/studio")),
    ...(existsSync(internal) ? readdirSync(internal).filter((name) => /^studio-.*\.ts$/.test(name)).map((name) => path.join(internal, name)) : []),
    ...[path.join(ROOT, "functions/api/payments/click-studio.ts")].filter(existsSync),
  ];
}

test("every SQL string in the studio's server code keeps the D1 rules", async (context) => {
  const base = await lintOptions();
  const files = studioServerFiles();
  assert.ok(files.some((file) => file.endsWith(path.join("lib", "studio", "schema.ts"))));
  let statements = 0;
  const problems: string[] = [];
  for (const file of files) {
    const relative = path.relative(ROOT, file).replaceAll("\\", "/");
    const found = findSql(relative, readFileSync(file, "utf8"));
    statements += found.length;
    const ddl = ['functions/lib/studio/schema.ts','functions/lib/studio/operations-schema.ts'].includes(relative);
    for (const { line, sql } of found) {
      const reviewed=reviewedSql(relative,sql);
      if(reviewed) {
        const actual=(base.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{detail:string}>).map(row=>row.detail);
        assert.deepEqual(actual,reviewed.plan,`${relative}:${line}: changed physical query plan`);
      } else for (const problem of lintSql(sql, { ...base, ddl })) problems.push(`${relative}:${line}: ${problem}`);
    }
  }
  context.diagnostic(`${statements} SQL string(s) in ${files.length} file(s)`);
  assert.deepEqual(problems, []);
});

test('reviewed SQL is exact, narrowly scoped and never accepts a removed boundary',()=>{
  assert.equal(REVIEWED.length,11);
  assert.equal(VERIFICATION_SITE_CONCURRENCY,32);assert.equal(VERIFICATION_IP_CONCURRENCY,4);
  for(const row of REVIEWED) {
    assert.equal(reviewedSql('elsewhere.ts',row.sql),undefined);
    const changed=row.sql.replace(/org_id/g,'unscoped_id');
    assert.equal(reviewedSql(row.file,changed),undefined);
    for(const [pattern,replacement] of [[/LIMIT 501\b/,''],[/LIMIT 5001\b/,''],[/<10\b/,'<100000'],[/state='paid'/,"state!='paid'"],[/version=\?/,'1=1'],[/NOT EXISTS/,'EXISTS'],[/lease_until>\?/,'1=1']] as const) {
      if(pattern.test(row.sql))assert.equal(reviewedSql(row.file,row.sql.replace(pattern,replacement)),undefined);
    }
    for(const detail of row.plan)if(/^SCAN /.test(detail))assert.match(detail,/^SCAN (CONSTANT ROW|r|j)$/);
  }
});

test("the scan sees the schema's DDL: one SQL string per STUDIO_DDL and STUDIO_PAYMENTS_DDL statement", () => {
  const file = path.join(ROOT, "functions/lib/studio/schema.ts");
  const found = findSql("schema.ts", readFileSync(file, "utf8"));
  assert.equal(found.length, STUDIO_DDL.length + STUDIO_PAYMENTS_DDL.length);
});

test("the studio's code never reads or writes 0073's studio_orders: orders live in studio_orders_v2 (0075)", () => {
  // studio_orders accepts provider 'click' only (its CHECK) and a migration
  // never alters a table, so it stays empty forever (DECISIONS §12).
  const offenders: string[] = [];
  let orderStatements = 0;
  for (const file of studioServerFiles()) {
    const relative = path.relative(ROOT, file).replaceAll("\\", "/");
    if (relative === "functions/lib/studio/schema.ts") continue;
    for (const { line, sql } of findSql(relative, readFileSync(file, "utf8"))) {
      if (/\bstudio_orders\b(?!_v2)/.test(sql)) offenders.push(`${relative}:${line}`);
      if (/\bstudio_orders_v2\b/.test(sql)) orderStatements++;
    }
  }
  assert.deepEqual(offenders, []);
  assert.ok(orderStatements > 0, "the store reads and writes studio_orders_v2");
});

// ── The linter itself ───────────────────────────────────────────────────────

/** The query catalogue of spec §4.3, written out: each must pass. */
const CATALOGUE = [
  "INSERT INTO studio_free_usage(org_id,day,subject,unit,used) VALUES(?,?,?,?,1) ON CONFLICT(org_id,day,subject,unit) DO UPDATE SET used=used+1 WHERE used<? RETURNING used",
  "SELECT id FROM studio_entitlements WHERE org_id=? AND user_id=? AND mode=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>? AND photos_used<photos_limit ORDER BY ends_at,id LIMIT 1",
  "UPDATE studio_entitlements SET photos_used=photos_used+1 WHERE org_id=? AND id=? AND photos_used<photos_limit AND revoked_at IS NULL AND ends_at>? RETURNING id",
  "UPDATE studio_unit_ledger SET parts_done=parts_done|?, fault=NULL, state=CASE WHEN (parts_done|?)=? THEN 'done' ELSE 'delivering' END, settled_at=CASE WHEN (parts_done|?)=? THEN ? ELSE settled_at END WHERE org_id=? AND id=? AND subject=? AND state IN ('reserved','delivering') AND expires_at>? RETURNING state, parts_done",
  "UPDATE studio_unit_ledger SET state='released', reason=?, settled_at=? WHERE org_id=? AND id=? AND (state='reserved' OR (state='delivering' AND fault IS NOT NULL)) RETURNING source, entitlement_id, unit, subject, reserve_day",
  "UPDATE studio_free_usage SET used=used-1 WHERE org_id=? AND day=? AND subject=? AND unit=? AND used>0",
  "UPDATE studio_unit_ledger SET steps=steps+1 WHERE org_id=? AND id=? AND subject=? AND state IN ('reserved','delivering') AND steps<? AND expires_at>? RETURNING steps",
  "SELECT id, plan, ends_at, presentations_limit, presentations_used FROM studio_entitlements WHERE org_id=? AND user_id=? AND mode=? ORDER BY ends_at DESC LIMIT 10",
  "SELECT id, state, plan, created_at FROM studio_orders WHERE org_id=? AND user_id=? ORDER BY created_at DESC LIMIT 1",
  `SELECT order_id, receipt_url FROM gpt_fiscal_receipts WHERE org_id=? AND order_id IN ( ${EXPR} ) LIMIT 20`,
  "SELECT * FROM studio_orders WHERE org_id=? AND id=?",
  "SELECT * FROM studio_orders WHERE org_id=? AND provider=? AND mode=? AND external_id=?",
  "SELECT id, subject, source, entitlement_id FROM studio_unit_ledger WHERE org_id=? AND state IN ('reserved','delivering') AND expires_at<=? ORDER BY expires_at LIMIT 50",
  "UPDATE studio_entitlements SET ends_at=ends_at+?, extended_ms=extended_ms+? WHERE rowid IN (SELECT rowid FROM studio_entitlements WHERE org_id=? AND mode='live' AND ends_at>? AND starts_at<? AND revoked_at IS NULL ORDER BY ends_at LIMIT 200)",
  "UPDATE studio_orders SET gclid=NULL, gbraid=NULL, wbraid=NULL, yclid=NULL, utm_source=NULL, attrib_purged_at=? WHERE rowid IN (SELECT rowid FROM studio_orders WHERE org_id=? AND attrib_purged_at IS NULL AND created_at<? ORDER BY created_at LIMIT 200)",
  "DELETE FROM studio_unit_ledger WHERE rowid IN (SELECT rowid FROM studio_unit_ledger WHERE org_id=? AND created_at<? LIMIT 500)",
  "DELETE FROM studio_free_usage WHERE rowid IN (SELECT rowid FROM studio_free_usage WHERE org_id=? AND day<? LIMIT 500)",
  "SELECT plan, amount, perform_time, owner_test FROM studio_orders WHERE org_id=? AND mode='live' AND state IN ('paid','refunded') AND perform_time BETWEEN ? AND ? ORDER BY perform_time LIMIT 500",
  "INSERT INTO gpt_payment_journal(org_id,id,order_id,actor,method,from_state,to_state,created_at) VALUES(?,?,?,?,?,?,?,?)",
  "INSERT INTO studio_orders(org_id,id,user_id,plan,plan_version,terms_version,provider,click_service_id,mode,request_id,amount,currency,state,created_at,expires_at) VALUES(?,?,?,?,?,?,'click',?,?,?,?,'UZS','pending',?,?)",
  "UPDATE gpt_auth_sessions SET expires_at=? WHERE org_id=? AND token_hash=?",
  "SELECT COUNT(*) AS n FROM studio_free_usage WHERE org_id=? AND day=? AND subject=? AND unit=?",
  // The paid studio (0075): orders, their guarded moves, the statement and the refunds.
  "SELECT * FROM studio_orders_v2 WHERE org_id=? AND id=?",
  "SELECT * FROM studio_orders_v2 WHERE org_id=? AND provider=? AND mode=? AND external_id=?",
  "SELECT * FROM studio_orders_v2 WHERE org_id=? AND user_id=? AND request_id=?",
  "SELECT * FROM studio_orders_v2 WHERE org_id=? AND user_id=? AND mode=? AND state IN ('pending','prepared') LIMIT 1",
  "SELECT * FROM studio_orders_v2 WHERE org_id=? AND user_id=? AND mode=? ORDER BY created_at DESC LIMIT 1",
  "SELECT * FROM studio_orders_v2 WHERE org_id=? AND provider_doc_id=? ORDER BY created_at DESC LIMIT 5",
  "SELECT * FROM studio_orders_v2 WHERE org_id=? AND provider=? AND mode=? AND provider_time>=? AND provider_time<=? AND create_time>0 ORDER BY provider_time,seq LIMIT 500",
  "UPDATE studio_orders_v2 SET state='paid',version=version+1,event_id=?,perform_time=? WHERE org_id=? AND id=? AND version=?",
  "INSERT INTO gpt_payment_journal(org_id,id,order_id,actor,method,from_state,to_state,created_at) VALUES(?,?,(SELECT id FROM studio_orders_v2 WHERE org_id=? AND id=? AND event_id=?),?,?,?,?,?)",
  "INSERT INTO studio_refunds(org_id,id,order_id,amount,method,reference,presentations_unused,photos_unused,receipt_state,requested_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
  "SELECT * FROM studio_refunds WHERE org_id=? AND order_id=?",
  "SELECT * FROM studio_entitlements WHERE org_id=? AND order_id=? LIMIT 20",
  "UPDATE studio_entitlements SET revoked_at=? WHERE rowid IN (SELECT rowid FROM studio_entitlements WHERE org_id=? AND order_id=? AND revoked_at IS NULL LIMIT 20)",
];

test("the query catalogue of spec §4.3 passes the linter", async () => {
  const lint = await lintOptions();
  for (const sql of CATALOGUE) assert.deepEqual(lintSql(sql, lint), [], sql);
});

test("the linter refuses what took D1 down and every other unbounded shape", async () => {
  const lint = await lintOptions();
  const refused: Array<[string, RegExp]> = [
    ["WITH r AS (SELECT created_at t FROM gpt_messages) SELECT * FROM r LIMIT 5", /CTE|not one the studio may touch/],
    ["SELECT id, ROW_NUMBER() OVER (PARTITION BY subject ORDER BY created_at) FROM studio_unit_ledger WHERE org_id=? LIMIT 5", /window function/],
    ["SELECT a.id FROM studio_unit_ledger a JOIN studio_unit_ledger b ON a.subject=b.subject WHERE a.org_id=? LIMIT 5", /JOIN/],
    ["SELECT a.id FROM studio_orders a, studio_entitlements b WHERE a.id=b.order_id AND a.org_id=? LIMIT 5", /comma join/],
    ["SELECT * FROM studio_unit_ledger WHERE org_id=? AND id IN (SELECT regen_of FROM studio_unit_ledger WHERE org_id=? LIMIT 5) LIMIT 5", /self-join/],
    ["SELECT * FROM gpt_messages WHERE id=? LIMIT 1", /gpt_messages is not one the studio may touch/],
    ["SELECT * FROM gpt_turn_reservations WHERE org_id=? AND id=?", /gpt_turn_reservations is not one/],
    ["SELECT * FROM gpt_payment_orders WHERE org_id=? AND id=?", /gpt_payment_orders is not one/],
    ["SELECT * FROM studio_orders WHERE org_id=?", /without a LIMIT or a full key/],
    ["SELECT * FROM studio_orders_v2 WHERE org_id=? AND user_id=?", /without a LIMIT or a full key/],
    ["SELECT * FROM studio_orders_v2 WHERE org_id=? AND gclid=? LIMIT 5", /full scan|org only/],
    ["SELECT * FROM studio_refunds WHERE org_id=? AND amount>? LIMIT 5", /full scan|org only/],
    ["UPDATE studio_refunds SET receipt_state='printed' WHERE order_id=?", /outside one org/],
    ["SELECT * FROM studio_orders WHERE org_id=? AND id=? OR 1=1", /without a LIMIT or a full key/],
    ["SELECT COUNT(*) FROM studio_unit_ledger WHERE org_id=? AND subject=? LIMIT 1", /aggregate/],
    ["SELECT subject, COUNT(*) FROM studio_unit_ledger WHERE org_id=? GROUP BY subject LIMIT 10", /aggregate/],
    ["DELETE FROM studio_free_usage WHERE org_id=? AND day<?", /without a LIMIT or a full key/],
    ["UPDATE studio_entitlements SET photos_used=0 WHERE org_id=?", /without a LIMIT or a full key/],
    ["UPDATE studio_orders SET state='paid' WHERE id=?", /outside one org/],
    ["SELECT * FROM studio_unit_ledger WHERE subject=? LIMIT 5", /outside one org|full scan/],
    ["SELECT * FROM studio_unit_ledger WHERE org_id=? AND model=? LIMIT 5", /full scan|org only/],
    ["SELECT * FROM studio_orders WHERE org_id=? ORDER BY amount LIMIT 5", /full scan|org only/],
    [`SELECT * FROM ${EXPR} WHERE org_id=? AND id=? LIMIT 1`, /table named by an expression/],
    ["INSERT INTO studio_free_usage(org_id,day,subject,unit,used) SELECT org_id,day,subject,unit,used FROM studio_free_usage LIMIT 1", /INSERT … SELECT/],
    ["INSERT INTO studio_free_usage(day,subject,unit,used) VALUES(?,?,?,1)", /without org_id/],
    ["INSERT OR REPLACE INTO studio_free_usage(org_id,day,subject,unit,used) VALUES(?,?,?,?,1)", /OR REPLACE/],
    ["DROP TABLE studio_orders", /not allowed/],
    ["ALTER TABLE studio_orders ADD COLUMN note TEXT", /not allowed/],
    ["PRAGMA table_info('studio_orders')", /not allowed/],
    ["CREATE TABLE IF NOT EXISTS studio_notes (id TEXT)", /DDL outside/],
  ];
  for (const [sql, reason] of refused) {
    const problems = lintSql(sql, lint);
    assert.ok(problems.some((problem) => reason.test(problem)), `${sql}\n  → ${problems.join("; ") || "passed"}`);
  }
});

test("DDL: only CREATE … IF NOT EXISTS of studio objects, and only in schema.ts", async () => {
  const lint = await lintOptions(true);
  assert.deepEqual(lintSql("CREATE TABLE IF NOT EXISTS studio_x (id TEXT)", lint), []);
  assert.deepEqual(lintSql("CREATE INDEX IF NOT EXISTS idx_studio_x ON studio_orders(org_id)", lint), []);
  assert.match(lintSql("CREATE TABLE studio_x (id TEXT)", lint).join(), /IF NOT EXISTS/);
  assert.match(lintSql("CREATE INDEX IF NOT EXISTS idx_gpt_x ON gpt_messages(id)", lint).join(), /non-studio/);
  assert.match(lintSql("CREATE INDEX IF NOT EXISTS idx_studio_x ON gpt_messages(id)", lint).join(), /non-studio/);
  assert.match(lintSql("CREATE TABLE IF NOT EXISTS gpt_studio (id TEXT)", lint).join(), /non-studio/);
  assert.match(lintSql("CREATE VIEW IF NOT EXISTS studio_v AS SELECT 1", lint).join(), /only CREATE TABLE/);
});

test("the scanner reads strings, templates and + chains, and leaves prose alone", () => {
  const source = [
    'const a = "SELECT * FROM studio_orders " + "WHERE org_id=? AND id=?";',
    "const b = `SELECT order_id FROM gpt_fiscal_receipts WHERE org_id=? AND order_id IN (${ids.map(() => '?').join(',')}) LIMIT 20`;",
    "const c = 'SELECT * FROM ' + table + ' WHERE org_id=? LIMIT 1';",
    'const d = "update the counter later"; const e = "Select a plan";',
    "db.prepare(`UPDATE studio_orders SET state='paid' WHERE org_id=? AND id=?`);",
  ].join("\n");
  const found = findSql("x.ts", source).map(({ line, sql }) => [line, sql.replace(/\s+/g, " ").trim()]);
  assert.deepEqual(found, [
    [1, "SELECT * FROM studio_orders WHERE org_id=? AND id=?"],
    [2, `SELECT order_id FROM gpt_fiscal_receipts WHERE org_id=? AND order_id IN ( ${EXPR} ) LIMIT 20`],
    [3, `SELECT * FROM ${EXPR} WHERE org_id=? LIMIT 1`],
    [5, "UPDATE studio_orders SET state='paid' WHERE org_id=? AND id=?"],
  ]);
});

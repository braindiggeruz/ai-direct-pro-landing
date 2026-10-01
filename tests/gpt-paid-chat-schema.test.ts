// migrations/0068 (the paid AI chat, release R4) against its runtime
// bootstrap, and a local rehearsal of applying it to the production shape.
// WP-14 adds the Click fiscal queue columns; WP-15..WP-17 extend the same
// file and this test. Real SQLite (tests/helpers/sqlite-d1.ts); nothing here
// touches a remote database.
// Run: node --import tsx --test tests/gpt-paid-chat-schema.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { ensureSchema } from "../functions/lib/gpt-chat/schema";
import {
  ensureBillingSchema,
  FISCAL_RECEIPT_COLUMNS,
  PAID_CHAT_DDL,
} from "../functions/lib/gpt-chat/billing-schema";

const migration = (name: string) =>
  readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const M0068 = migration("0068_gpt_paid_chat.sql");
/** Everything production has applied before 0068 for the consumer chat. */
const BEFORE_0068 = [
  "0008_gpt_chat.sql",
  "0061_gpt_chat_lead_delivery.sql",
  "0064_gpt_consumer_billing.sql",
  "0065_gpt_uzum_payments.sql",
  "0066_gpt_chat_runtime.sql",
];
const TABLES = ["gpt_fiscal_receipts"];
const SQL_COMMENT = /^\s*--.*$/gm;

function statements(sql: string): string[] {
  return sql
    .replace(SQL_COMMENT, "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function names(sql: string[], pattern: RegExp): string[] {
  return sql.flatMap((statement) => {
    const match = pattern.exec(statement);
    return match ? [match[1]] : [];
  });
}

function productionShape(): SqliteD1 {
  const db = new SqliteD1();
  for (const file of BEFORE_0068) db.exec(migration(file));
  return db;
}

/** Column and index structure, so formatting differences in the DDL text do not matter. */
function shape(db: SqliteD1) {
  const plain = <T>(rows: T[]) => rows.map((row) => ({ ...(row as object) }));
  const indexNames = names(statements(M0068), /CREATE INDEX IF NOT EXISTS (\w+)/i).sort();
  return {
    tables: Object.fromEntries(
      TABLES.map((table) => [table, plain(db.rows(`PRAGMA table_info('${table}')`))]),
    ),
    indexes: Object.fromEntries(
      indexNames.map((index) => [
        index,
        {
          table: db.value("SELECT tbl_name FROM sqlite_master WHERE type='index' AND name=?", index),
          columns: plain(db.rows(`PRAGMA index_info('${index}')`)),
        },
      ]),
    ),
  };
}

function counts(db: SqliteD1): Record<string, number> {
  const tables = db.rows<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return Object.fromEntries(
    tables.map(({ name }) => [name, Number(db.value(`SELECT COUNT(*) FROM "${name}"`))]),
  );
}

/** `wrangler d1 migrations apply` in miniature: a ledger row per file, a recorded file is skipped. */
function apply(db: SqliteD1, name: string, sql: string): "applied" | "skipped" {
  db.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)");
  if (db.value("SELECT COUNT(*) FROM d1_migrations WHERE name=?", name)) return "skipped";
  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.sqlite.prepare("INSERT INTO d1_migrations(name, applied_at) VALUES (?, datetime('now'))").run(name);
    db.exec("COMMIT");
    return "applied";
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

test("0068 lists exactly what the runtime bootstraps, both ways, and only adds", () => {
  const sql = statements(M0068);
  assert.deepEqual(
    sql.flatMap((statement) => {
      const match = /^ALTER TABLE gpt_fiscal_receipts ADD COLUMN (\w+) (.+)$/i.exec(statement);
      return match ? [[match[1], match[2]]] : [];
    }),
    FISCAL_RECEIPT_COLUMNS.map(([name, type]) => [name, type]),
  );
  assert.deepEqual(
    names(sql, /CREATE INDEX IF NOT EXISTS (\w+)/i).sort(),
    names(PAID_CHAT_DDL, /CREATE INDEX IF NOT EXISTS (\w+)/i).sort(),
  );
  for (const ddl of PAID_CHAT_DDL) assert.ok(M0068.replace(/\r\n/g, "\n").includes(`${ddl};`), ddl);
  assert.equal(sql.length, FISCAL_RECEIPT_COLUMNS.length + PAID_CHAT_DDL.length);
  // Additive only: nothing is dropped, deleted or rewritten; financial rows stay.
  const code = M0068.replace(SQL_COMMENT, "");
  assert.doesNotMatch(code, /\b(DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/i);
  assert.doesNotMatch(code, /\bCHECK\b/i);
});

test("0068 on the production shape and the runtime bootstrap on an empty database build the same schema", async () => {
  const migrated = productionShape();
  migrated.exec(M0068);
  const bootstrapped = new SqliteD1();
  await ensureSchema(bootstrapped.asD1());
  await ensureBillingSchema(bootstrapped.asD1());
  const expected = shape(migrated);
  assert.deepEqual(shape(bootstrapped), expected);
  // The six 0064 columns first, then the queue's.
  const columns = expected.tables.gpt_fiscal_receipts as Array<{ name: string }>;
  assert.deepEqual(
    columns.map((column) => column.name),
    ["org_id", "order_id", "kind", "receipt_url", "status_code", "updated_at", ...FISCAL_RECEIPT_COLUMNS.map(([name]) => name)],
  );
  assert.deepEqual(Object.keys(expected.indexes), ["idx_gpt_fiscal_due"]);
});

test("rehearsal: 0068 applied twice through the ledger keeps every row; the bootstrap after it changes nothing", async () => {
  const db = productionShape();
  const now = Date.UTC(2026, 9, 1, 12);
  // A Payme receipt written before 0068: it keeps its values and never joins the queue.
  db.sqlite
    .prepare("INSERT INTO gpt_fiscal_receipts(org_id,order_id,kind,receipt_url,status_code,updated_at) VALUES('gptbot-consumer','pay_a','PERFORM','https://ofd.soliq.uz/epi?r=1',0,?)")
    .run(now);
  const before = counts(db);
  assert.equal(apply(db, "0068_gpt_paid_chat.sql", M0068), "applied");
  const after = counts(db);
  assert.deepEqual(
    Object.fromEntries(Object.entries(after).filter(([table]) => !(table in before))),
    { d1_migrations: 1 },
  );
  for (const [table, n] of Object.entries(before)) assert.equal(after[table], n, table);
  assert.equal(apply(db, "0068_gpt_paid_chat.sql", M0068), "skipped");
  assert.deepEqual(counts(db), after);
  assert.deepEqual(
    { ...db.rows("SELECT * FROM gpt_fiscal_receipts")[0] as object },
    {
      org_id: "gptbot-consumer",
      order_id: "pay_a",
      kind: "PERFORM",
      receipt_url: "https://ofd.soliq.uz/epi?r=1",
      status_code: 0,
      updated_at: now,
      provider: null,
      attempts: 0,
      next_at: 0,
      lease_until: 0,
      payment_id: null,
      last_error: null,
      submitted_at: null,
    },
  );
  const schema = shape(db);
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  assert.deepEqual(shape(db), schema);
  // Outside the ledger the ALTERs are not repeatable: why the header demands
  // the migration before the code.
  assert.throws(() => db.exec(M0068), /duplicate column name/);
});

test("code deployed before 0068: the bootstrap adds the columns, and the migration then refuses (release order)", async () => {
  const db = productionShape();
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  const reference = productionShape();
  reference.exec(M0068);
  assert.deepEqual(shape(db), shape(reference));
  assert.throws(() => apply(db, "0068_gpt_paid_chat.sql", M0068), /duplicate column name/);
  assert.equal(db.value("SELECT COUNT(*) FROM d1_migrations"), 0);
});

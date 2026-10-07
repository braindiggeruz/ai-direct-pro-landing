// migrations/0073_studio.sql against its runtime bootstrap (STUDIO_DDL,
// ensureStudioSchema), a rehearsal of applying it to the production shape,
// and the CHECKs and unique indexes the ledger and the orders rely on; the
// same for the paid studio's 0075_studio_payments.sql (STUDIO_PAYMENTS_DDL,
// ensureStudioPaymentsSchema): studio_orders_v2 and studio_refunds.
// Real SQLite (tests/helpers/sqlite-d1.ts); nothing here touches a remote
// database.
// Run: node --import tsx --test tests/studio-schema.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { SqliteD1 } from "./helpers/sqlite-d1";
import {
  ensureStudioPaymentsSchema,
  ensureStudioSchema,
  STUDIO_DDL,
  STUDIO_ORG,
  STUDIO_PAYMENT_TABLES,
  STUDIO_PAYMENTS_DDL,
  STUDIO_TABLES,
} from "../functions/lib/studio/schema";
import { BILLING_ORG } from "../functions/lib/gpt-chat/billing-config";

const MIGRATIONS = new URL("../migrations/", import.meta.url);
const M0073_NAME = "0073_studio.sql";
const M0073 = readFileSync(new URL(M0073_NAME, MIGRATIONS), "utf8");
/** Every migration production has before 0073, in the order wrangler applies them. */
const BEFORE_0073 = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql") && file < "0073").sort();

/** The SQL without `--` comments (none of the DDL has `--` inside a string). */
const uncommented = (sql: string) => sql.replace(/--[^\n]*/g, "");
const normalize = (sql: string) => uncommented(sql).replace(/\s+/g, " ").replace(/\s*([(),=])\s*/g, "$1").trim();
const statements = (sql: string) => uncommented(sql).split(";").map((part) => part.trim()).filter(Boolean);
const objectName = (statement: string) =>
  /^CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS (\w+)/i.exec(statement)?.[1] ?? null;

function productionShape(): SqliteD1 {
  const db = new SqliteD1();
  for (const file of BEFORE_0073) db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
  return db;
}

/** Tables and indexes of the studio, structurally: column, key and index definitions. */
function shape(db: SqliteD1) {
  const plain = <T>(rows: T[]) => rows.map((row) => ({ ...(row as object) }));
  const objects = db.rows<{ type: string; name: string; tbl_name: string }>(
    "SELECT type, name, tbl_name FROM sqlite_master WHERE tbl_name LIKE 'studio_%' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name",
  );
  return Object.fromEntries(
    objects.map(({ type, name, tbl_name }) => [
      name,
      type === "table"
        ? {
            columns: plain(db.rows(`PRAGMA table_xinfo('${name}')`)),
            indexes: plain(db.rows(`PRAGMA index_list('${name}')`)).map((index) => ({
              ...index,
              columns: plain(db.rows(`PRAGMA index_info('${(index as { name: string }).name}')`)),
            })),
          }
        : { table: tbl_name, columns: plain(db.rows(`PRAGMA index_xinfo('${name}')`)) },
    ]),
  );
}

function counts(db: SqliteD1): Record<string, number> {
  const tables = db.rows<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return Object.fromEntries(tables.map(({ name }) => [name, Number(db.value(`SELECT COUNT(*) FROM "${name}"`))]));
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

test("0073 lists exactly the runtime DDL, statement for statement, and only adds studio objects", () => {
  const sql = statements(M0073);
  assert.deepEqual(sql.map(normalize), STUDIO_DDL.map(normalize));
  // Every object is the studio's own; nothing else is created, altered or written.
  const names = sql.map(objectName);
  assert.ok(names.every((name) => name !== null && /^(studio_|idx_studio_)/.test(name)), names.join(","));
  assert.deepEqual(names.filter((name) => name!.startsWith("studio_")), [...STUDIO_TABLES]);
  const code = uncommented(M0073);
  assert.doesNotMatch(code, /\b(DROP|DELETE|UPDATE|INSERT|REPLACE|TRUNCATE|ALTER|PRAGMA|TRIGGER|VIEW)\b/i);
  // No reference to any chat table or its CHECK(amount=2000000).
  assert.doesNotMatch(code, /\bgpt_\w+/);
  assert.doesNotMatch(code, /amount\s*=\s*2000000/);
  // The header states the order and the rollback.
  assert.match(M0073, /apply BEFORE deploying the code, previews included/);
  assert.match(M0073, /Rollback: roll the application back; tables stay/);
});

test("the studio org is the consumer billing org (one receipt queue)", () => {
  assert.equal(STUDIO_ORG, BILLING_ORG);
});

test("0073 on the production shape and the bootstrap on an empty database build the same schema", async () => {
  const migrated = productionShape();
  migrated.exec(M0073);
  const bootstrapped = new SqliteD1();
  await ensureStudioSchema(bootstrapped.asD1());
  const expected = shape(migrated);
  assert.deepEqual(shape(bootstrapped), expected);
  assert.deepEqual(
    Object.keys(expected).filter((name) => name.startsWith("studio_")),
    [...STUDIO_TABLES].sort(),
  );
  // The orders keep the GA4 outbox and the attribution columns from day one.
  const orderColumns = (expected.studio_orders as unknown as { columns: Array<{ name: string }> }).columns.map((column) => column.name);
  for (const column of ["provider_doc_id", "owner_test", "restored_at", "gclid", "landing_path", "ga_client_id", "ga4_state", "ga4_refund_state"])
    assert.ok(orderColumns.includes(column), column);
  // No content column anywhere: no topic, prompt, answer, photo, phone, e-mail or IP.
  for (const table of STUDIO_TABLES) {
    for (const { name } of (expected[table] as unknown as { columns: Array<{ name: string }> }).columns)
      assert.doesNotMatch(name, /topic|prompt|answer|text|photo_bytes|image_data|phone|email|ip_hash|^ip$/, `${table}.${name}`);
  }
});

test("rehearsal: 0073 applied twice through the ledger keeps every row; the bootstrap after it changes nothing", async () => {
  const db = productionShape();
  const now = Date.UTC(2026, 9, 12, 12);
  // A chat order and a receipt written before 0073 keep their values.
  db.sqlite
    .prepare("INSERT INTO gpt_payment_orders(org_id,id,user_id,provider,mode,request_id,amount,currency,state,external_id,created_at,expires_at) VALUES('gptbot-consumer','pay_a','acct_a','click','live','r1',2000000,'UZS','paid','777',?,?)")
    .run(now, now + 1);
  db.sqlite
    .prepare("INSERT INTO gpt_fiscal_receipts(org_id,order_id,kind,receipt_url,status_code,updated_at) VALUES('gptbot-consumer','pay_a','PERFORM','https://ofd.soliq.uz/epi?r=1',0,?)")
    .run(now);
  const before = counts(db);
  const order = { ...(db.rows("SELECT * FROM gpt_payment_orders")[0] as object) };
  assert.equal(apply(db, M0073_NAME, M0073), "applied");
  const after = counts(db);
  assert.deepEqual(
    Object.fromEntries(Object.entries(after).filter(([table]) => !(table in before))),
    { d1_migrations: 1, studio_entitlements: 0, studio_free_usage: 0, studio_orders: 0, studio_unit_ledger: 0 },
  );
  for (const [table, n] of Object.entries(before)) assert.equal(after[table], n, table);
  assert.deepEqual({ ...(db.rows("SELECT * FROM gpt_payment_orders")[0] as object) }, order);
  // A second run of the ledger skips the file.
  assert.equal(apply(db, M0073_NAME, M0073), "skipped");
  assert.deepEqual(counts(db), after);
  const schema = shape(db);
  await ensureStudioSchema(db.asD1());
  assert.deepEqual(shape(db), schema);
  // Unlike ALTER migrations, every statement is IF NOT EXISTS: re-running the file is harmless too.
  db.exec(M0073);
  assert.deepEqual(shape(db), schema);
});

test("code deployed before 0073: the bootstrap creates the tables and the migration then still applies", async () => {
  const db = productionShape();
  await ensureStudioSchema(db.asD1());
  const reference = productionShape();
  reference.exec(M0073);
  assert.deepEqual(shape(db), shape(reference));
  assert.equal(apply(db, M0073_NAME, M0073), "applied");
  assert.deepEqual(shape(db), shape(reference));
});

test("ensureStudioSchema is idempotent: again on the same binding and on a new binding of the same database", async () => {
  const db = new SqliteD1();
  await ensureStudioSchema(db.asD1());
  await ensureStudioSchema(db.asD1());
  const first = shape(db);
  // A second isolate: a different binding object over the same tables.
  const other = { prepare: db.prepare.bind(db), batch: db.batch.bind(db) } as unknown as D1Database;
  await ensureStudioSchema(other);
  assert.deepEqual(shape(db), first);
});

test("a failed bootstrap is forgotten and retried on the next call", async () => {
  const db = new SqliteD1();
  let failures = 1;
  const flaky = {
    prepare: db.prepare.bind(db),
    batch: (batch: D1PreparedStatement[]) => {
      if (failures-- > 0) return Promise.reject(new Error("D1 unavailable"));
      return db.batch(batch);
    },
  } as unknown as D1Database;
  await assert.rejects(ensureStudioSchema(flaky), /D1 unavailable/);
  await ensureStudioSchema(flaky);
  assert.equal(db.value("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'studio_%'"), 4);
});

// ── CHECKs and unique indexes ───────────────────────────────────────────────

async function studioDb(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureStudioSchema(db.asD1());
  return db;
}

const ORDER = {
  org_id: STUDIO_ORG, id: "stu_00000000000000000000000000000001", user_id: "acct_studio_a", plan: "oylik",
  plan_version: "studio-2026-11-v1", terms_version: "ai-paket-2026-10-v3", provider: "click", click_service_id: "1",
  mode: "live", request_id: "r1", amount: 3_990_000, currency: "UZS", state: "pending", created_at: 1, expires_at: 2,
} as const;

function insert(db: SqliteD1, table: string, row: Record<string, string | number | null>): void {
  const columns = Object.keys(row);
  db.sqlite
    .prepare(`INSERT INTO ${table}(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
    .run(...Object.values(row));
}

test("studio_orders: plan, provider, mode, amount, currency, state and the owner flag are checked", async () => {
  const db = await studioDb();
  insert(db, "studio_orders", { ...ORDER });
  const variant = (changes: Record<string, string | number | null>, n: number) =>
    ({ ...ORDER, id: `stu_${String(n).padStart(32, "0")}`, request_id: `r${n}`, user_id: `acct_studio_${n}`, ...changes });
  const refused: Array<Record<string, string | number | null>> = [
    { plan: "weekly" }, { plan: "credit" }, { provider: "payme" }, { mode: "dev" }, { amount: 0 }, { amount: -590_000 },
    { amount: 100_000_001 }, { currency: "USD" }, { state: "done" }, { owner_test: 2 }, { touch: "middle" },
    { ga4_state: "queued" }, { ga4_refund_state: "x" },
  ];
  refused.forEach((changes, i) =>
    assert.throws(() => insert(db, "studio_orders", variant(changes, i + 2)), /CHECK constraint failed/, JSON.stringify(changes)));
  // No CHECK pins the price: a new tariff needs no rebuilt financial table (spec §4.2).
  insert(db, "studio_orders", variant({ plan: "kunlik", amount: 590_000 }, 50));
  insert(db, "studio_orders", variant({ amount: 4_990_000 }, 51));
  assert.equal(db.value("SELECT ga4_state FROM studio_orders WHERE id=?", ORDER.id), "none");
});

test("studio_orders: one open order per buyer and mode; ids, requests and Click transactions are unique", async () => {
  const db = await studioDb();
  insert(db, "studio_orders", { ...ORDER });
  // A second pending order of the same buyer and mode is refused, in test mode it is another slot.
  assert.throws(() => insert(db, "studio_orders", { ...ORDER, id: "stu_2", request_id: "r2" }), /UNIQUE/);
  insert(db, "studio_orders", { ...ORDER, id: "stu_3", request_id: "r3", mode: "test" });
  // Once paid, a new one may open.
  db.exec(`UPDATE studio_orders SET state='paid', external_id='9001' WHERE id='${ORDER.id}'`);
  insert(db, "studio_orders", { ...ORDER, id: "stu_4", request_id: "r4" });
  assert.throws(() => insert(db, "studio_orders", { ...ORDER, id: "stu_5", request_id: "r4", state: "cancelled" }), /UNIQUE/);
  assert.throws(() => insert(db, "studio_orders", { ...ORDER, id: ORDER.id, request_id: "r6", state: "cancelled" }), /UNIQUE/);
  assert.throws(
    () => insert(db, "studio_orders", { ...ORDER, id: "stu_7", request_id: "r7", state: "paid", external_id: "9001" }),
    /UNIQUE/,
  );
  // merchant_prepare_id is the order's own sequence.
  assert.deepEqual(db.rows("SELECT seq FROM studio_orders ORDER BY seq").map((row) => (row as { seq: number }).seq), [1, 2, 3]);
});

const ENTITLEMENT = {
  org_id: STUDIO_ORG, id: ORDER.id, order_id: ORDER.id, user_id: ORDER.user_id, mode: "live", plan: "oylik",
  plan_version: "studio-2026-11-v1", starts_at: 1, ends_at: 2, presentations_limit: 10, photos_limit: 40,
} as const;

test("studio_entitlements: used never exceeds the limit or drops below zero; a credit is its own plan", async () => {
  const db = await studioDb();
  insert(db, "studio_entitlements", { ...ENTITLEMENT });
  assert.throws(() => insert(db, "studio_entitlements", { ...ENTITLEMENT, id: "e2", presentations_used: 11 }), /CHECK/);
  assert.throws(() => insert(db, "studio_entitlements", { ...ENTITLEMENT, id: "e3", photos_used: -1 }), /CHECK/);
  assert.throws(() => insert(db, "studio_entitlements", { ...ENTITLEMENT, id: "e4", plan: "weekly" }), /CHECK/);
  assert.throws(() => insert(db, "studio_entitlements", { ...ENTITLEMENT, id: "e5", mode: "dev" }), /CHECK/);
  insert(db, "studio_entitlements", { ...ENTITLEMENT, id: `${ORDER.id}_c1`, plan: "credit", presentations_limit: 1, photos_limit: 0 });
  // A spend past the limit fails as a whole, so a guarded UPDATE cannot overdraw.
  db.exec(`UPDATE studio_entitlements SET photos_used=40 WHERE id='${ORDER.id}'`);
  assert.throws(() => db.exec(`UPDATE studio_entitlements SET photos_used=photos_used+1 WHERE id='${ORDER.id}'`), /CHECK/);
  assert.throws(() => insert(db, "studio_entitlements", { ...ENTITLEMENT }), /UNIQUE|PRIMARY KEY/);
});

const JOB = {
  org_id: STUDIO_ORG, id: "sj_1", request_id: "q1", tool: "presentation", unit: "presentation_full",
  source: "entitlement", entitlement_id: ORDER.id, subject: "a:acct_studio_a", input_mac: "m1",
  state: "done", created_at: 1, expires_at: 2,
} as const;

test("studio_unit_ledger: closed vocabularies, one row per subject and request, one live regeneration per job", async () => {
  const db = await studioDb();
  insert(db, "studio_unit_ledger", { ...JOB });
  for (const [column, value] of [["tool", "video"], ["unit", "presentation"], ["source", "gift"], ["state", "charged"]])
    assert.throws(() => insert(db, "studio_unit_ledger", { ...JOB, id: `sj_${column}`, request_id: `q_${column}`, [column]: value }), /CHECK/, column);
  // The same request of the same subject is the same job.
  assert.throws(() => insert(db, "studio_unit_ledger", { ...JOB, id: "sj_dup" }), /UNIQUE/);
  insert(db, "studio_unit_ledger", { ...JOB, id: "sj_other_subject", subject: "b:0123" });
  // A regeneration of sj_1; a second live one is refused, a released one does not count.
  const regen = { ...JOB, source: "regen", regen_of: "sj_1", state: "reserved" } as const;
  insert(db, "studio_unit_ledger", { ...regen, id: "sj_r1", request_id: "q_r1" });
  assert.throws(() => insert(db, "studio_unit_ledger", { ...regen, id: "sj_r2", request_id: "q_r2" }), /UNIQUE/);
  db.exec("UPDATE studio_unit_ledger SET state='released' WHERE id='sj_r1'");
  insert(db, "studio_unit_ledger", { ...regen, id: "sj_r3", request_id: "q_r3" });
  db.exec("UPDATE studio_unit_ledger SET state='done' WHERE id='sj_r3'");
  assert.throws(() => insert(db, "studio_unit_ledger", { ...regen, id: "sj_r4", request_id: "q_r4" }), /UNIQUE/);
  assert.deepEqual(
    { ...(db.rows("SELECT parts_total, parts_done, steps, images, cost_micro, reserved_micro FROM studio_unit_ledger WHERE id='sj_1'")[0] as object) },
    { parts_total: 1, parts_done: 0, steps: 0, images: 0, cost_micro: 0, reserved_micro: 0 },
  );
});

test("studio_free_usage: one counter per day, subject and unit; only the three units", async () => {
  const db = await studioDb();
  const row = { org_id: STUDIO_ORG, day: "2026-10-12", subject: "b:0123", unit: "presentation_free", used: 1 };
  insert(db, "studio_free_usage", row);
  assert.throws(() => insert(db, "studio_free_usage", row), /UNIQUE|PRIMARY KEY/);
  insert(db, "studio_free_usage", { ...row, unit: "returned" });
  insert(db, "studio_free_usage", { ...row, unit: "photo_task" });
  insert(db, "studio_free_usage", { ...row, day: "2026-10-13" });
  assert.throws(() => insert(db, "studio_free_usage", { ...row, unit: "presentation_full" }), /CHECK/);
});

// ── 0075: the paid studio's orders and refunds ──────────────────────────────

const M0075_NAME = "0075_studio_payments.sql";
const M0075 = readFileSync(new URL(M0075_NAME, MIGRATIONS), "utf8");
/** Every migration before 0075 (0073 and Payme's 0074 included), in wrangler's order. */
const BEFORE_0075 = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql") && file < "0075").sort();

function shapeBefore0075(): SqliteD1 {
  const db = new SqliteD1();
  for (const file of BEFORE_0075) db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
  return db;
}

test("0075 lists exactly the runtime DDL, statement for statement, and only adds the two paid-studio tables", () => {
  assert.equal(readdirSync(MIGRATIONS).filter((file) => file.startsWith("0075_")).length, 1, "one migration numbered 0075");
  const sql = statements(M0075);
  assert.deepEqual(sql.map(normalize), STUDIO_PAYMENTS_DDL.map(normalize));
  const names = sql.map(objectName);
  assert.ok(names.every((name) => name !== null && /^(studio_|idx_studio_)/.test(name)), names.join(","));
  assert.deepEqual(names.filter((name) => name!.startsWith("studio_")), [...STUDIO_PAYMENT_TABLES]);
  const code = uncommented(M0075);
  assert.doesNotMatch(code, /\b(DROP|DELETE|UPDATE|INSERT|REPLACE|TRUNCATE|ALTER|PRAGMA|TRIGGER|VIEW)\b/i);
  assert.doesNotMatch(code, /\bgpt_\w+/);
  // 0073's studio_orders is neither altered nor touched: only the new table names appear.
  assert.doesNotMatch(code, /\bstudio_orders\b(?!_v2)/);
  assert.doesNotMatch(code, /amount\s*=\s*2000000/);
  assert.match(M0075, /apply BEFORE deploying the code, previews included/);
  assert.match(M0075, /Rollback: roll the application back; tables stay/);
  assert.match(M0075, /No DROP/);
});

test("0075 on the production shape (0001–0074) and the paid bootstrap on an empty database build the same schema", async () => {
  const migrated = shapeBefore0075();
  migrated.exec(M0075);
  const bootstrapped = new SqliteD1();
  await ensureStudioPaymentsSchema(bootstrapped.asD1());
  const expected = shape(migrated);
  assert.deepEqual(shape(bootstrapped), expected);
  const tables = Object.keys(expected).filter((name) => name.startsWith("studio_"));
  assert.deepEqual(tables, [...STUDIO_TABLES, ...STUDIO_PAYMENT_TABLES].sort());
  // The order table of 0075 is 0073's with the Payme columns, without click_service_id.
  const columns = (table: string) =>
    (expected[table] as unknown as { columns: Array<{ name: string }> }).columns.map((column) => column.name);
  const v1 = columns("studio_orders");
  const v2 = columns("studio_orders_v2");
  assert.deepEqual(v2.filter((name) => !v1.includes(name)), ["service_id", "create_time", "event_id"]);
  assert.deepEqual(v1.filter((name) => !v2.includes(name)), ["click_service_id"]);
  for (const table of STUDIO_PAYMENT_TABLES)
    for (const name of columns(table))
      assert.doesNotMatch(name, /topic|prompt|answer|text|photo_bytes|image_data|phone|email|card|^pan$|ip_hash|^ip$/, `${table}.${name}`);
});

test("the free paths' bootstrap never creates the 0075 tables; the paid one creates 0073 and 0075", async () => {
  const free = new SqliteD1();
  await ensureStudioSchema(free.asD1());
  assert.equal(free.value("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('studio_orders_v2','studio_refunds')"), 0);
  const paid = new SqliteD1();
  await ensureStudioPaymentsSchema(paid.asD1());
  assert.equal(paid.value("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'studio_%'"), 6);
});

test("rehearsal: 0075 applied twice through the ledger keeps every row; the bootstrap and the file again change nothing", async () => {
  const db = shapeBefore0075();
  const now = Date.UTC(2026, 9, 12, 12);
  db.sqlite
    .prepare("INSERT INTO gpt_payment_orders(org_id,id,user_id,provider,mode,request_id,amount,currency,state,external_id,created_at,expires_at) VALUES('gptbot-consumer','pay_a','acct_a','payme','live','r1',2000000,'UZS','paid','6f00a1b2c3d4e5f6a7b8c9d0',?,?)")
    .run(now, now + 1);
  const before = counts(db);
  const order = { ...(db.rows("SELECT * FROM gpt_payment_orders")[0] as object) };
  assert.equal(apply(db, M0075_NAME, M0075), "applied");
  const after = counts(db);
  assert.deepEqual(
    Object.fromEntries(Object.entries(after).filter(([table]) => !(table in before))),
    { d1_migrations: 1, studio_orders_v2: 0, studio_refunds: 0 },
  );
  for (const [table, n] of Object.entries(before)) assert.equal(after[table], n, table);
  assert.deepEqual({ ...(db.rows("SELECT * FROM gpt_payment_orders")[0] as object) }, order);
  assert.equal(apply(db, M0075_NAME, M0075), "skipped");
  const schema = shape(db);
  await ensureStudioPaymentsSchema(db.asD1());
  assert.deepEqual(shape(db), schema);
  db.exec(M0075);
  assert.deepEqual(shape(db), schema);
});

test("code deployed before 0075: the paid bootstrap creates the tables and the migration then still applies", async () => {
  const db = shapeBefore0075();
  await ensureStudioPaymentsSchema(db.asD1());
  const reference = shapeBefore0075();
  reference.exec(M0075);
  assert.deepEqual(shape(db), shape(reference));
  assert.equal(apply(db, M0075_NAME, M0075), "applied");
  assert.deepEqual(shape(db), shape(reference));
});

test("ensureStudioPaymentsSchema is idempotent and a failed run is retried", async () => {
  const db = new SqliteD1();
  let failures = 1;
  const flaky = {
    prepare: db.prepare.bind(db),
    batch: (batch: D1PreparedStatement[]) => {
      if (failures-- > 0) return Promise.reject(new Error("D1 unavailable"));
      return db.batch(batch);
    },
  } as unknown as D1Database;
  await assert.rejects(ensureStudioPaymentsSchema(flaky), /D1 unavailable/);
  await ensureStudioPaymentsSchema(flaky);
  const first = shape(db);
  await ensureStudioPaymentsSchema(flaky);
  await ensureStudioPaymentsSchema(db.asD1());
  assert.deepEqual(shape(db), first);
  assert.equal(db.value("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'studio_%'"), 6);
});

const ORDER_V2 = {
  org_id: STUDIO_ORG, id: "stu_00000000000000000000000000000001", user_id: "acct_studio_a", plan: "oylik",
  plan_version: "studio-2026-11-v1", terms_version: "ai-paket-2026-10-v4", provider: "payme", service_id: null,
  mode: "live", request_id: "r1", amount: 3_990_000, currency: "UZS", state: "pending", created_at: 1, expires_at: 2,
} as const;

async function paidDb(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureStudioPaymentsSchema(db.asD1());
  return db;
}

test("studio_orders_v2: Payme and Click, Payme without a service, the same checks as 0073 otherwise", async () => {
  const db = await paidDb();
  insert(db, "studio_orders_v2", { ...ORDER_V2 });
  const variant = (changes: Record<string, string | number | null>, n: number) =>
    ({ ...ORDER_V2, id: `stu_${String(n).padStart(32, "0")}`, request_id: `r${n}`, user_id: `acct_studio_${n}`, ...changes });
  insert(db, "studio_orders_v2", variant({ provider: "click", service_id: "107999", plan: "kunlik", amount: 590_000 }, 2));
  const refused: Array<Record<string, string | number | null>> = [
    { provider: "uzum" }, { provider: "PAYME" }, { plan: "credit" }, { mode: "dev" }, { amount: 0 }, { amount: 100_000_001 },
    { currency: "USD" }, { state: "done" }, { owner_test: 2 }, { touch: "middle" }, { ga4_state: "queued" },
  ];
  refused.forEach((changes, i) =>
    assert.throws(() => insert(db, "studio_orders_v2", variant(changes, i + 10)), /CHECK constraint failed/, JSON.stringify(changes)));
  const row = db.rows<Record<string, unknown>>("SELECT create_time, version, event_id, ga4_state, owner_test FROM studio_orders_v2 WHERE id=?", ORDER_V2.id)[0];
  assert.deepEqual({ ...row }, { create_time: 0, version: 0, event_id: null, ga4_state: "none", owner_test: 0 });
});

test("studio_orders_v2: one open order per buyer and mode whatever the provider; a provider's transaction id is one order's", async () => {
  const db = await paidDb();
  insert(db, "studio_orders_v2", { ...ORDER_V2 });
  // A Click order of the same buyer and mode while the Payme one is open: refused.
  assert.throws(() => insert(db, "studio_orders_v2", { ...ORDER_V2, id: "stu_2", request_id: "r2", provider: "click", service_id: "1" }), /UNIQUE/);
  insert(db, "studio_orders_v2", { ...ORDER_V2, id: "stu_3", request_id: "r3", mode: "test" });
  db.exec(`UPDATE studio_orders_v2 SET state='prepared', external_id='6f00a1b2c3d4e5f6a7b8c9d0' WHERE id='${ORDER_V2.id}'`);
  assert.throws(() => insert(db, "studio_orders_v2", { ...ORDER_V2, id: "stu_4", request_id: "r4" }), /UNIQUE/);
  db.exec(`UPDATE studio_orders_v2 SET state='paid' WHERE id='${ORDER_V2.id}'`);
  insert(db, "studio_orders_v2", { ...ORDER_V2, id: "stu_5", request_id: "r5" });
  // The same Payme transaction on another order: refused; the same characters at Click are another provider's.
  assert.throws(
    () => insert(db, "studio_orders_v2", { ...ORDER_V2, id: "stu_6", request_id: "r6", user_id: "acct_studio_b", state: "paid", external_id: "6f00a1b2c3d4e5f6a7b8c9d0" }),
    /UNIQUE/,
  );
  insert(db, "studio_orders_v2", { ...ORDER_V2, id: "stu_7", request_id: "r7", user_id: "acct_studio_b", provider: "click", service_id: "1", state: "paid", external_id: "6f00a1b2c3d4e5f6a7b8c9d0" });
  assert.throws(() => insert(db, "studio_orders_v2", { ...ORDER_V2, id: "stu_8", request_id: "r5", state: "cancelled" }), /UNIQUE/);
  // 0073's table is still there, empty.
  assert.equal(db.value("SELECT COUNT(*) FROM studio_orders"), 0);
});

test("studio_refunds: one refund per order, closed vocabularies, a positive amount and unused units", async () => {
  const db = await paidDb();
  const refund = {
    org_id: STUDIO_ORG, id: "sr_1", order_id: ORDER_V2.id, amount: 319_200, method: "transfer", reference: "p2p-1",
    presentations_unused: 1, photos_unused: 0, receipt_state: "due", requested_at: 1, created_at: 1, updated_at: 1,
  } as const;
  insert(db, "studio_refunds", { ...refund });
  assert.throws(() => insert(db, "studio_refunds", { ...refund, id: "sr_2" }), /UNIQUE/);
  const other = (changes: Record<string, string | number | null>, n: number) => ({ ...refund, id: `sr_x${n}`, order_id: `stu_x${n}`, ...changes });
  const refused: Array<Record<string, string | number | null>> = [
    { method: "cash" }, { method: "uzum_refund" }, { receipt_state: "none" }, { amount: 0 }, { amount: 100_000_001 },
    { presentations_unused: -1 }, { photos_unused: -1 },
  ];
  refused.forEach((changes, i) => assert.throws(() => insert(db, "studio_refunds", other(changes, i)), /CHECK constraint failed/, JSON.stringify(changes)));
  for (const [i, method] of ["payme_cancel", "click_reversal", "click_cabinet"].entries())
    insert(db, "studio_refunds", other({ method, receipt_state: "provider", reference: null }, 100 + i));
});

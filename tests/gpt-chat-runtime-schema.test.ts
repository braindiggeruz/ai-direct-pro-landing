// migrations/0066 (chat runtime telemetry, daily spend, limit hits, time
// indexes) against its runtime bootstrap, and a local rehearsal of applying it
// to the production shape. Real SQLite (tests/helpers/sqlite-d1.ts); nothing
// here touches a remote database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SqliteD1 } from './helpers/sqlite-d1';
import { ensureSchema, CHAT_TIME_INDEXES } from '../functions/lib/gpt-chat/schema';
import {
  CHAT_RUNTIME_COLUMNS,
  CHAT_RUNTIME_DDL,
  ensureBillingSchema,
} from '../functions/lib/gpt-chat/billing-schema';

const migration = (name: string) =>
  readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const M0066 = migration('0066_gpt_chat_runtime.sql');
/** Everything production has applied before 0066 for the consumer chat. */
const BEFORE_0066 = [
  '0008_gpt_chat.sql',
  '0061_gpt_chat_lead_delivery.sql',
  '0064_gpt_consumer_billing.sql',
  '0065_gpt_uzum_payments.sql',
];
const TABLES = ['gpt_turn_reservations', 'gpt_model_spend', 'gpt_limit_hits'];

function statements(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
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
  for (const file of BEFORE_0066) db.exec(migration(file));
  return db;
}

/** Column and index structure, so formatting differences in the DDL text do not matter. */
function shape(db: SqliteD1) {
  const plain = <T>(rows: T[]) => rows.map((row) => ({ ...(row as object) }));
  const indexNames = [...names(statements(M0066), /CREATE INDEX IF NOT EXISTS (\w+)/i)].sort();
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
function apply(db: SqliteD1, name: string, sql: string): 'applied' | 'skipped' {
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)');
  if (db.value('SELECT COUNT(*) FROM d1_migrations WHERE name=?', name)) return 'skipped';
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.sqlite.prepare("INSERT INTO d1_migrations(name, applied_at) VALUES (?, datetime('now'))").run(name);
    db.exec('COMMIT');
    return 'applied';
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

test('0066 lists exactly what the runtime bootstraps, both ways', () => {
  const sql = statements(M0066);
  assert.deepEqual(
    sql.flatMap((statement) => {
      const match = /^ALTER TABLE gpt_turn_reservations ADD COLUMN (\w+) (\w+)$/i.exec(statement);
      return match ? [[match[1], match[2]]] : [];
    }),
    CHAT_RUNTIME_COLUMNS.map(([name, type]) => [name, type]),
  );
  const bootstrap = [...CHAT_RUNTIME_DDL, ...CHAT_TIME_INDEXES];
  assert.deepEqual(
    names(sql, /CREATE TABLE IF NOT EXISTS (\w+)/i).sort(),
    names(bootstrap, /CREATE TABLE IF NOT EXISTS (\w+)/i).sort(),
  );
  assert.deepEqual(
    names(sql, /CREATE INDEX IF NOT EXISTS (\w+)/i).sort(),
    names(bootstrap, /CREATE INDEX IF NOT EXISTS (\w+)/i).sort(),
  );
  // Additive only: nothing is dropped, deleted or rewritten.
  assert.equal(sql.length, CHAT_RUNTIME_COLUMNS.length + bootstrap.length);
  assert.doesNotMatch(M0066.replace(/^\s*--.*$/gm, ''), /\b(DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/i);
  // The status CHECK is never rebuilt: columns are only added.
  assert.doesNotMatch(M0066.replace(/^\s*--.*$/gm, ''), /\bCHECK\b/i);
});

test('0066 on the production shape and the runtime bootstrap on an empty database build the same schema', async () => {
  const migrated = productionShape();
  migrated.exec(M0066);
  const bootstrapped = new SqliteD1();
  await ensureSchema(bootstrapped.asD1());
  await ensureBillingSchema(bootstrapped.asD1());
  const expected = shape(migrated);
  assert.deepEqual(shape(bootstrapped), expected);
  // The twelve columns are nullable additions after the original eight.
  const columns = expected.tables.gpt_turn_reservations as Array<{ name: string; notnull: number; dflt_value: unknown }>;
  assert.equal(columns.length, 8 + CHAT_RUNTIME_COLUMNS.length);
  for (const column of columns.slice(8)) assert.deepEqual([column.notnull, column.dflt_value], [0, null], column.name);
  assert.equal(Object.keys(expected.indexes).length, 4);
  assert.ok(Object.values(expected.indexes).every((index) => index.table && index.columns.length));
});

test('rehearsal: 0066 applied twice through the ledger keeps every row; the bootstrap after it changes nothing', async () => {
  const db = productionShape();
  const now = Date.UTC(2026, 8, 30, 12);
  const turn = db.sqlite.prepare(
    "INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at) VALUES('gptbot-consumer',?,?,?,NULL,?,?,?)",
  );
  turn.run('t1', 's1', 'ip1', 'done', now - 60_000, now + 60_000);
  turn.run('t2', 's1', 'ip1', 'released', now - 30_000, now + 90_000);
  turn.run('t3', 's2', 'ip2', 'reserved', now - 10_000, now + 110_000);
  db.sqlite.prepare("INSERT INTO gpt_sessions(id, hashed_ip, locale, created_at) VALUES ('sess_a','ip1','uz',?)").run(new Date(now).toISOString());
  const message = db.sqlite.prepare("INSERT INTO gpt_messages(id, session_id, role, content, created_at) VALUES (?, 'sess_a', ?, 'synthetic', ?)");
  message.run('m1', 'user', new Date(now).toISOString());
  message.run('m2', 'assistant', new Date(now).toISOString());
  db.sqlite.prepare("INSERT INTO gpt_service_alerts(org_id,id,code,created_at) VALUES ('gptbot-consumer','chat_timeout:1',?,?)").run('chat_timeout', now);
  const before = counts(db);

  assert.equal(apply(db, '0066_gpt_chat_runtime.sql', M0066), 'applied');
  const after = counts(db);
  // Only the two new, empty tables and the ledger appear; no row moved.
  assert.deepEqual(
    Object.fromEntries(Object.entries(after).filter(([table]) => !(table in before))),
    { d1_migrations: 1, gpt_limit_hits: 0, gpt_model_spend: 0 },
  );
  for (const [table, n] of Object.entries(before)) assert.equal(after[table], n, table);
  assert.equal(apply(db, '0066_gpt_chat_runtime.sql', M0066), 'skipped');
  assert.deepEqual(counts(db), after);
  // Rows settled before 0066 keep their status and have no outcome.
  assert.deepEqual(
    db.rows<{ id: string; status: string; outcome: null }>('SELECT id, status, outcome FROM gpt_turn_reservations ORDER BY id').map((r) => ({ ...r })),
    [
      { id: 't1', status: 'done', outcome: null },
      { id: 't2', status: 'released', outcome: null },
      { id: 't3', status: 'reserved', outcome: null },
    ],
  );
  // The code deployed after the migration only confirms it (ensureSchema may
  // still add its own bootstrap-only tables, gpt_handoffs and gpt_rate_limits).
  const schema = shape(db);
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  assert.deepEqual(shape(db), schema);
  const settled = counts(db);
  for (const [table, n] of Object.entries(after)) assert.equal(settled[table], n, table);
  // Outside the ledger the ALTERs are not repeatable: why the header demands
  // the migration before the code.
  assert.throws(() => db.exec(M0066), /duplicate column name/);
});

test('code deployed before 0066: the bootstrap adds the columns, and the migration then refuses (release order)', async () => {
  const db = productionShape();
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  const reference = productionShape();
  reference.exec(M0066);
  assert.deepEqual(shape(db), shape(reference));
  assert.throws(() => apply(db, '0066_gpt_chat_runtime.sql', M0066), /duplicate column name/);
  assert.equal(db.value('SELECT COUNT(*) FROM d1_migrations'), 0);
});

test('the bootstrap adds only the missing columns, tolerates another isolate adding them, and retries a failure', async () => {
  // Half-way: one column already exists.
  const partial = productionShape();
  partial.exec('ALTER TABLE gpt_turn_reservations ADD COLUMN outcome TEXT');
  await ensureBillingSchema(partial.asD1());
  const reference = productionShape();
  reference.exec(M0066);
  assert.deepEqual(shape(partial).tables, shape(reference).tables);

  // Another isolate added every column between this one's PRAGMA and ALTERs.
  const raced = productionShape();
  raced.exec(M0066);
  const stale = raced.rows<{ name: string }>("PRAGMA table_info('gpt_turn_reservations')").slice(0, 8);
  const racing = {
    prepare: (sql: string) =>
      sql.startsWith('PRAGMA table_info')
        ? { all: async () => ({ results: stale }) }
        : raced.prepare(sql),
    batch: raced.batch.bind(raced),
  } as unknown as D1Database;
  await ensureBillingSchema(racing);
  assert.deepEqual(shape(raced).tables, shape(reference).tables);

  // Any other ALTER failure is thrown, and the next request bootstraps again.
  const flaky = productionShape();
  let failures = 1;
  const failing = {
    prepare: (sql: string) => {
      if (sql.startsWith('ALTER') && failures > 0) {
        failures--;
        return { run: async () => { throw new Error('D1_ERROR: synthetic storage failure'); } };
      }
      return flaky.prepare(sql);
    },
    batch: flaky.batch.bind(flaky),
  } as unknown as D1Database;
  await assert.rejects(ensureBillingSchema(failing), /synthetic storage failure/);
  await ensureBillingSchema(failing);
  assert.deepEqual(shape(flaky).tables, shape(reference).tables);
});

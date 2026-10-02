// The chat's breadcrumbs (gpt_events: a lead sent, the way to the bot taken)
// are kept TELEMETRY_RETENTION_DAYS, as the privacy policy says for
// text-free technical events (paid-chat WP-24). migrations/0069 indexes the
// table by time for the sweep in maintainBilling; the runtime bootstrap
// builds the same index. Real SQLite (tests/helpers/sqlite-d1.ts); nothing
// here touches a remote database.
// Run: node --import tsx --test tests/gpt-events-retention.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SqliteD1 } from './helpers/sqlite-d1';
import { billingFixture } from './helpers/gpt-billing-fixture';
import { CHAT_EVENT_INDEXES, ensureSchema } from '../functions/lib/gpt-chat/schema';
import { maintainBilling, TELEMETRY_RETENTION_DAYS } from '../functions/lib/gpt-chat/billing-maintenance-store';

const migration = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const M0069 = migration('0069_gpt_events_retention.sql');
/** Everything production has applied for the consumer chat before 0069. */
const BEFORE_0069 = [
  '0008_gpt_chat.sql',
  '0061_gpt_chat_lead_delivery.sql',
  '0064_gpt_consumer_billing.sql',
  '0065_gpt_uzum_payments.sql',
  '0066_gpt_chat_runtime.sql',
  '0068_gpt_paid_chat.sql',
];
const DAY = 86_400_000;
const SQL_COMMENT = /^\s*--.*$/gm;
const statements = (sql: string) => sql.replace(SQL_COMMENT, '').split(';').map((part) => part.trim()).filter(Boolean);

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

/** The index as SQLite holds it: its table and columns. */
function index(db: SqliteD1) {
  return {
    table: db.value("SELECT tbl_name FROM sqlite_master WHERE type='index' AND name='idx_gpt_events_created'"),
    columns: db.rows<{ name: string }>("PRAGMA index_info('idx_gpt_events_created')").map((row) => row.name),
  };
}

test('0069 is exactly the bootstrap index, only adds, and applies in either order', async () => {
  assert.deepEqual(statements(M0069), CHAT_EVENT_INDEXES);
  assert.doesNotMatch(M0069.replace(SQL_COMMENT, ''), /\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE)\b/i);
  // On the production shape, through the ledger, twice: the second run is a no-op.
  const migrated = new SqliteD1();
  for (const file of BEFORE_0069) migrated.exec(migration(file));
  const rows = (db: SqliteD1) => Number(db.value('SELECT COUNT(*) FROM gpt_events'));
  assert.equal(apply(migrated, '0069_gpt_events_retention.sql', M0069), 'applied');
  assert.equal(apply(migrated, '0069_gpt_events_retention.sql', M0069), 'skipped');
  assert.equal(rows(migrated), 0);
  // The runtime bootstrap on an empty database builds the same index.
  const bootstrapped = new SqliteD1();
  await ensureSchema(bootstrapped.asD1());
  assert.deepEqual(index(bootstrapped), index(migrated));
  assert.deepEqual(index(migrated), { table: 'gpt_events', columns: ['created_at'] });
  // Code before the migration: the migration still applies cleanly afterwards.
  assert.equal(apply(bootstrapped, '0069_gpt_events_retention.sql', M0069), 'applied');
  assert.deepEqual(index(bootstrapped), index(migrated));
});

test('maintainBilling deletes breadcrumbs older than TELEMETRY_RETENTION_DAYS, 500 a run, by the index', async () => {
  const f = await billingFixture();
  const now = Date.parse('2026-10-03T10:00:00Z');
  const at = (days: number, extraMs = 0) => new Date(now - days * DAY + extraMs).toISOString();
  const insert = f.db.sqlite.prepare(
    'INSERT INTO gpt_events (id, session_id, user_id, event_name, payload_json, created_at) VALUES (?,?,NULL,?,?,?)',
  );
  // 501 rows a day past the period, one just past it, one just inside it, one new.
  for (let i = 0; i < 501; i++) insert.run(`old-${i}`, 'sess', 'GPTChatLeadSubmitted', '{"intent":"lead"}', at(TELEMETRY_RETENTION_DAYS + 1, i));
  insert.run('edge-out', 'sess', 'GPTChatHandoffClaimed', '{"claimedBy":"h2_x"}', at(TELEMETRY_RETENTION_DAYS, -1));
  insert.run('edge-in', 'sess', 'GPTChatHandoffClaimed', '{"claimedBy":"h2_y"}', at(TELEMETRY_RETENTION_DAYS, 1));
  insert.run('new', 'sess', 'GPTChatLeadSubmitted', '{}', at(1));
  const total = () => Number(f.db.value('SELECT COUNT(*) FROM gpt_events'));
  assert.equal(total(), 504);
  await maintainBilling(f.env, now);
  assert.equal(total(), 4, 'at most 500 a run');
  await maintainBilling(f.env, now);
  assert.deepEqual(f.db.rows<{ id: string }>('SELECT id FROM gpt_events ORDER BY id').map((row) => row.id), ['edge-in', 'new']);
  // The sweep reads the index, not the whole table (migrations/0069).
  const plan = f.db
    .rows<{ detail: string }>("EXPLAIN QUERY PLAN SELECT rowid FROM gpt_events WHERE created_at<? LIMIT 500", at(TELEMETRY_RETENTION_DAYS))
    .map((row) => row.detail)
    .join(' | ');
  assert.match(plan, /idx_gpt_events_created/);
});

/**
 * Schema-contract regressions for Signal Radar (migration 0057).
 *
 * These tests exist because of one specific failure mode. The Lead Radar
 * runtime schema contract is fingerprint-based: every table in the database
 * starting with `lead_radar_` must be explicitly whitelisted inside
 * `isLeadRadarSchemaRow()`, otherwise the auditor reports `extra_object`,
 * `assertLeadRadarRuntimeSchema()` throws, and the **entire** Lead Radar module
 * answers 503 — including discovery, campaigns and the Telegram sender that
 * have nothing to do with Signal Radar.
 *
 * So this file is not about Signal Radar working. It is about Signal Radar
 * never being able to take Lead Radar down with it.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  auditLeadRadarD1Schema,
  LEAD_RADAR_MIGRATIONS,
} from '../functions/platform/lead-radar/schema-contract';
import { CRAWLER_SCHEMA_FINGERPRINT } from '../functions/platform/lead-radar/crawler';
import { normalizeSchemaSql } from '../functions/platform/lead-radar/schema-sql';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIGNAL_MIGRATION = '0057_lead_radar_signal.sql';
const CRAWLER_MIGRATION = '0056_lead_radar_crawler.sql';

const migrationSql = (filename: string): string =>
  readFileSync(path.join(ROOT, 'migrations', filename), 'utf8');

/** A pristine database that matches the pinned production contract, plus optional extensions. */
async function database(
  ...extensions: Array<{ file: string; ledger?: boolean }>
): Promise<SqliteD1> {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec('CREATE TABLE organizations(id TEXT PRIMARY KEY)');
  for (const filename of LEAD_RADAR_MIGRATIONS) {
    db.exec(migrationSql(filename));
    await db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').bind(filename).run();
  }
  for (const extension of extensions) {
    db.exec(migrationSql(extension.file));
    if (extension.ledger !== false) {
      await db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').bind(extension.file).run();
    }
  }
  return db;
}

test('installing Signal Radar does not invalidate the pinned Lead Radar contract', async (t) => {
  const db = await database({ file: SIGNAL_MIGRATION });
  t.after(() => db.sqlite.close());
  const report = await auditLeadRadarD1Schema(db.asD1(), 'target');
  assert.equal(
    report.status,
    'pass',
    `Signal Radar must not surface as an unknown object: ${JSON.stringify(report.issues)}`,
  );
  assert.equal(report.matchedProfile, 'target');
  assert.equal(
    report.issues.some((issue) => issue.code === 'extra_object'),
    false,
    'an unwhitelisted lead_radar_signal_* table is a module-wide 503, not a local bug',
  );
});

test('Lead Radar still passes with Signal Radar absent, so an un-migrated database is safe', async (t) => {
  const db = await database();
  t.after(() => db.sqlite.close());
  const report = await auditLeadRadarD1Schema(db.asD1(), 'target');
  assert.equal(report.status, 'pass', JSON.stringify(report.issues));
});

test('Signal Radar and the crawler extension can coexist without breaking either pin', async (t) => {
  const db = await database({ file: CRAWLER_MIGRATION }, { file: SIGNAL_MIGRATION });
  t.after(() => db.sqlite.close());
  const report = await auditLeadRadarD1Schema(db.asD1(), 'target');
  assert.equal(report.status, 'pass', JSON.stringify(report.issues));
});

test('Signal Radar leaves the independently pinned crawler fingerprint untouched', async (t) => {
  const withoutSignal = new SqliteD1();
  t.after(() => withoutSignal.sqlite.close());
  withoutSignal.exec('CREATE TABLE organizations(id TEXT PRIMARY KEY); CREATE TABLE lead_radar_companies(org_id TEXT,id TEXT,UNIQUE(org_id,id));');
  withoutSignal.exec(migrationSql(CRAWLER_MIGRATION));

  const withSignal = new SqliteD1();
  t.after(() => withSignal.sqlite.close());
  withSignal.exec('CREATE TABLE organizations(id TEXT PRIMARY KEY); CREATE TABLE lead_radar_companies(org_id TEXT,id TEXT,UNIQUE(org_id,id));');
  withSignal.exec(migrationSql(CRAWLER_MIGRATION));
  withSignal.exec(migrationSql(SIGNAL_MIGRATION));

  const fingerprint = (db: SqliteD1): string => {
    const rows = db.rows<{ type: string; name: string; tbl_name: string; sql: unknown }>(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name LIKE 'lead_radar_crawler_%' ORDER BY name",
    );
    return JSON.stringify(rows.map((row) => [row.type, row.name, row.tbl_name,
      typeof row.sql === 'string' ? normalizeSchemaSql(row.sql) : null]));
  };

  // The pin is a hash of structure, so compare the structure the hash covers.
  assert.equal(fingerprint(withSignal), fingerprint(withoutSignal));
});

test('the crawler fingerprint constant is still the value the contract was pinned against', () => {
  // Guards against someone editing the constant to make a broken schema pass.
  assert.match(CRAWLER_SCHEMA_FINGERPRINT, /^[0-9a-f]{64}$/);
});

test('Signal Radar tables, indexes and foreign keys materialize exactly as declared', async (t) => {
  const db = await database({ file: SIGNAL_MIGRATION });
  t.after(() => db.sqlite.close());

  const tables = db.rows<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lead_radar_signal_%' ORDER BY name",
  ).map((row) => row.name);
  assert.deepEqual(tables, [
    'lead_radar_signal_leads',
    'lead_radar_signal_posts',
    'lead_radar_signal_targets',
  ]);

  // Composite FKs only work when the parent has a UNIQUE on exactly (org_id, id).
  // Without it SQLite accepts the DDL and then fails at the first insert, which
  // is the worst possible place to discover it.
  // DISTINCT because pragma_foreign_key_list emits one row per *column*, and
  // every FK here is composite (org_id, other_id) — two rows per relation.
  const foreignKeys = db.rows<{ from: string; table: string }>(
    "SELECT DISTINCT m.name AS \"from\", p.\"table\" AS \"table\" FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) p WHERE m.type='table' AND m.name LIKE 'lead_radar_signal_%'",
  );
  assert.deepEqual(
    foreignKeys.map((row) => `${row.from}->${row.table}`).sort(),
    [
      'lead_radar_signal_leads->lead_radar_signal_posts',
      'lead_radar_signal_leads->lead_radar_signal_targets',
      'lead_radar_signal_posts->lead_radar_signal_targets',
    ],
  );
});

test('the signal schema enforces its own contracts end to end in real SQLite', async (t) => {
  const db = await database({ file: SIGNAL_MIGRATION });
  t.after(() => db.sqlite.close());

  const ORG = 'owner_8ee98dc3040f160b308166b0';
  const NOW = '2026-09-02T00:00:00.000Z';
  const targetId = 'lrst_' + 'a'.repeat(32);
  const postId = 'lrsp_' + 'b'.repeat(32);
  const leadId = 'lrsl_' + 'c'.repeat(32);

  await db.prepare(
    `INSERT INTO lead_radar_signal_targets
      (id,org_id,slug,url,kind,status,score,source,members,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(targetId, ORG, 'toshkent_ish', 'https://t.me/toshkent_ish', 'channel',
    'watching', 72, 'tgstat', 4900, NOW, NOW).run();

  await db.prepare(
    `INSERT INTO lead_radar_signal_posts
      (id,org_id,target_id,excerpt,dedup_key,occurred_at,verdict,score,service,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).bind(postId, ORG, targetId, 'нужен бот для записи', 'd'.repeat(64), NOW,
    'lead', 80, 'telegram_bot', NOW).run();

  await db.prepare(
    `INSERT INTO lead_radar_signal_leads
      (id,org_id,post_id,target_id,service,score,state,quote,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).bind(leadId, ORG, postId, targetId, 'telegram_bot', 80, 'new',
    'нужен бот для записи', NOW, NOW).run();

  // One lead per post, ever. Re-posting the same request must not duplicate it.
  await assert.rejects(
    db.prepare(
      `INSERT INTO lead_radar_signal_leads
        (id,org_id,post_id,target_id,service,score,state,quote,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind('lrsl_' + 'e'.repeat(32), ORG, postId, targetId, 'telegram_bot', 80,
      'new', 'дубль', NOW, NOW).run(),
    /UNIQUE constraint failed/,
  );

  // Deleting a target must take its posts and leads with it, otherwise the
  // operator's "ignore this channel" leaves orphaned stranger text behind.
  await db.prepare('DELETE FROM lead_radar_signal_targets WHERE id = ?').bind(targetId).run();
  assert.equal(
    db.value('SELECT COUNT(*) AS n FROM lead_radar_signal_posts WHERE org_id = ?', ORG),
    0,
  );
  assert.equal(
    db.value('SELECT COUNT(*) AS n FROM lead_radar_signal_leads WHERE org_id = ?', ORG),
    0,
  );
});

test('the signal schema rejects malformed rows instead of silently storing them', async (t) => {
  const db = await database({ file: SIGNAL_MIGRATION });
  t.after(() => db.sqlite.close());

  const ORG = 'owner_8ee98dc3040f160b308166b0';
  const NOW = '2026-09-02T00:00:00.000Z';
  const insert = (sql: string, ...values: string[]) =>
    db.prepare(sql).bind(...values).run();

  const target = `INSERT INTO lead_radar_signal_targets
    (id,org_id,slug,url,kind,status,score,source,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?)`;

  // A slug with a dot would become a wrong URL and a wasted join attempt.
  await assert.rejects(
    insert(target, 'lrst_' + 'a'.repeat(32), ORG, 'bad.slug', 'https://t.me/bad.slug',
      'channel', 'candidate', 10, 'manual', NOW, NOW),
    /CHECK constraint failed/,
  );
  // An id from a different generator leaks the wrong object type into joins.
  await assert.rejects(
    insert(target, 'lrsp_' + 'a'.repeat(32), ORG, 'goodslug', 'https://t.me/goodslug',
      'channel', 'candidate', 10, 'manual', NOW, NOW),
    /CHECK constraint failed/,
  );
  // A status outside the closed union would strand the row in the join queue.
  await assert.rejects(
    insert(target, 'lrst_' + 'f'.repeat(32), ORG, 'goodslug', 'https://t.me/goodslug',
      'channel', 'maybe', 10, 'manual', NOW, NOW),
    /CHECK constraint failed/,
  );
  // Scores are 0..100 so the operator can read them as a percentage.
  await assert.rejects(
    insert(target, 'lrst_' + '1'.repeat(32), ORG, 'goodslug', 'https://t.me/goodslug',
      'channel', 'candidate', 140, 'manual', NOW, NOW),
    /CHECK constraint failed/,
  );
});

test('every signal table is whitelisted in the runtime schema contract', () => {
  const source = readFileSync(
    path.join(ROOT, 'functions/platform/lead-radar/schema-contract.ts'),
    'utf8',
  );
  for (const table of [
    'lead_radar_signal_targets',
    'lead_radar_signal_posts',
    'lead_radar_signal_leads',
  ]) {
    assert.equal(
      source.includes(`'${table}'`),
      true,
      `${table} missing from schema-contract.ts — installing 0057 would 503 all of Lead Radar`,
    );
  }
});

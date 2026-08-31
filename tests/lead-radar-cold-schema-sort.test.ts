import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { auditLeadRadarD1Schema, LEAD_RADAR_MIGRATIONS } from '../functions/platform/lead-radar/schema-contract';
import { telegramCampaignSchemaFingerprint } from '../functions/platform/lead-radar/telegram-campaign-schema';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');

function canonicalLeadRadarDatabase(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const filename of LEAD_RADAR_MIGRATIONS) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', filename), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(filename);
  }
  return db;
}

async function withoutLocaleCompare<T>(operation: () => Promise<T>): Promise<T> {
  const original = String.prototype.localeCompare;
  Object.defineProperty(String.prototype, 'localeCompare', {
    configurable: true,
    writable: true,
    value() { throw new Error('locale initialization is forbidden in a cold schema guard'); },
  });
  try {
    return await operation();
  } finally {
    Object.defineProperty(String.prototype, 'localeCompare', {
      configurable: true,
      writable: true,
      value: original,
    });
  }
}

test('Lead Radar cold runtime schema fingerprint does not initialize locale collation', async (t) => {
  const db = canonicalLeadRadarDatabase();
  t.after(() => db.sqlite.close());
  const report = await withoutLocaleCompare(() => auditLeadRadarD1Schema(db.asD1(), 'target'));
  assert.equal(report.status, 'pass', JSON.stringify(report.issues, null, 2));
  assert.equal(report.matchedProfile, 'target');
});

test('Telegram campaign cold schema fingerprint is locale-free and order-stable', async () => {
  const rows = [
    { type: 'table', name: 'lead_radar_tg_user_accounts', tbl_name: 'lead_radar_tg_user_accounts', sql: 'CREATE TABLE lead_radar_tg_user_accounts (id TEXT)' },
    { type: 'index', name: 'idx_lead_radar_tg_campaigns_status', tbl_name: 'lead_radar_tg_campaigns', sql: 'CREATE INDEX idx_lead_radar_tg_campaigns_status ON lead_radar_tg_campaigns (status)' },
  ];
  const dbFor = (results: typeof rows) => ({
    prepare() { return { all: async () => ({ success: true, results }) }; },
  }) as unknown as D1Database;
  const [forward, reverse] = await withoutLocaleCompare(() => Promise.all([
    telegramCampaignSchemaFingerprint(dbFor(rows)),
    telegramCampaignSchemaFingerprint(dbFor([...rows].reverse())),
  ]));
  assert.match(forward, /^[0-9a-f]{64}$/);
  assert.equal(forward, reverse);
});

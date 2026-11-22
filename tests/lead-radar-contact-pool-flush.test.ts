import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import { LeadRadarStore } from '../functions/platform/lead-radar/store';
import { candidateFromOsmElement } from '../functions/platform/lead-radar/sources';
import { sourceCandidateToStoredLead } from '../functions/platform/lead-radar/service';
import type { StoredLeadInput } from '../functions/platform/lead-radar/types';
import { evaluateTelegramCampaignSelection } from '../functions/platform/lead-radar/telegram-campaign';
import { SqliteD1 } from './helpers/sqlite-d1';

/**
 * Owner audit 22.11.2026 (SC-01): a "Telegram contacts" search must never
 * delete businesses it already discovered. When its candidate pool stops, the
 * unreached remainder becomes inert company rows the owner can export.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATIONS = [
  '0036_lead_radar.sql',
  '0041_lead_radar_search_leases.sql',
  '0042_lead_radar_decision_makers.sql',
  '0043_lead_radar_async_funnel.sql',
  '0044_lead_radar_telegram_business.sql',
  '0045_lead_radar_telegram_campaigns.sql',
  '0046_lead_radar_telegram_campaign_safety.sql',
  '0047_lead_radar_telegram_campaign_media.sql',
  '0048_lead_radar_telegram_media_quota.sql',
  '0050_lead_radar_contact_discovery.sql',
  '0054_lead_radar_candidate_pool_resume.sql',
] as const;
const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = '2026-11-22T12:00:00.000Z';
const SEARCH_ID = 'search_pool_flush';
const DATA_KEY = Buffer.alloc(32, 9).toString('base64url');

const INPUT: LeadRadarSearchInput = {
  niche: 'Стоматология', city: 'Ташкент', country: 'UZ', offer: 'Заявки', desiredCount: 20,
  telegramRequired: false, languages: ['ru', 'uz'], searchGoal: 'telegram_contacts', maxCandidates: 250,
};

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE organizations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL, default_locale TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  for (const orgId of [ORG_A, ORG_B]) {
    db.sqlite.prepare(`INSERT INTO organizations VALUES (?, ?, ?, 'active', 'ru', ?, ?)`).run(orgId, orgId, orgId, NOW, NOW);
  }
  for (const filename of MIGRATIONS) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', filename), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(filename);
  }
  return db;
}

function stored(id: number, tags: Record<string, string>): StoredLeadInput {
  const candidate = candidateFromOsmElement(
    { type: 'node', id, tags: { amenity: 'dentist', 'addr:city': 'Ташкент', ...tags } }, INPUT, 'Стоматология', NOW,
  );
  assert.ok(candidate);
  return sourceCandidateToStoredLead(candidate, NOW);
}

function seed(db: SqliteD1, options: { cursor: number; createdAt?: string; status?: string }) {
  const leads = [
    stored(1, { name: 'Dent One', phone: '+998 90 100 00 01' }),
    stored(2, { name: 'Dent Two', phone: '+998 90 100 00 02' }),
    stored(3, { name: 'Dent Three', phone: '+998 71 200 00 03; +998 93 300 00 03', telegram: 'dent_three_uz' }),
    stored(4, { name: 'Dent Four', phone: '+998 90 100 00 04' }),
    stored(5, { name: 'Dent Five', website: 'https://dentfive.uz' }),
  ];
  db.sqlite.prepare(`INSERT INTO lead_radar_searches (id, org_id, input_json, status, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(SEARCH_ID, ORG_A, JSON.stringify(INPUT), options.status ?? 'running', options.createdAt ?? NOW);
  db.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
    (org_id, search_id, candidates_json, candidate_count, cursor, batch_start, target, created_at, expires_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 20, ?, ?, ?)`)
    .run(ORG_A, SEARCH_ID, JSON.stringify(leads), leads.length, options.cursor, options.cursor, NOW,
      '2026-11-22T13:00:00.000Z', NOW);
  // The first `cursor` candidates were already persisted by normal batches.
  for (const [index, lead] of leads.slice(0, options.cursor).entries()) {
    db.sqlite.prepare(`INSERT INTO lead_radar_companies (
      id, org_id, search_id, canonical_key, name, category, city, country, score, confidence, priority,
      score_components_json, signals_json, discovered_at, last_verified_at, updated_at, enrichment_status
    ) VALUES (?, ?, ?, ?, ?, 'dentist', 'Ташкент', 'UZ', 50, 0.7, 'P2', '[]', '[]', ?, ?, ?, 'enriched')`)
      .run(`lead_done_${index}`, ORG_A, SEARCH_ID, lead.canonicalKey, lead.name, NOW, NOW, NOW);
  }
  return leads;
}

test('a stopped pool keeps its unreached candidates as inert rows: no jobs, terminal, suppression respected', async () => {
  const db = database();
  const leads = seed(db, { cursor: 2 });
  // The owner put Dent Four on the do-not-contact list earlier.
  db.sqlite.prepare(`INSERT INTO lead_radar_suppressions (org_id, canonical_key, suppressed_at) VALUES (?, ?, ?)`)
    .run(ORG_A, leads[3]!.canonicalKey, NOW);
  const store = new LeadRadarStore(db.asD1());

  assert.equal(await store.persistContactPoolRemainder(ORG_B, SEARCH_ID, NOW), 0, 'another org cannot flush this pool');
  assert.equal(await store.persistContactPoolRemainder(ORG_A, SEARCH_ID, NOW), 2);
  assert.equal(await store.persistContactPoolRemainder(ORG_A, SEARCH_ID, NOW), 0, 'a second flush is a no-op');

  const rows = db.rows<{ name: string; enrichment_status: string; enrichment_reason: string | null }>(
    `SELECT name, enrichment_status, enrichment_reason FROM lead_radar_companies WHERE org_id = ? ORDER BY name`, ORG_A,
  );
  assert.deepEqual(rows.map((row) => row.name), ['Dent Five', 'Dent One', 'Dent Three', 'Dent Two']);
  const flushed = rows.filter((row) => ['Dent Three', 'Dent Five'].includes(row.name));
  assert.ok(flushed.every((row) => row.enrichment_status === 'terminal'));
  assert.deepEqual(flushed.map((row) => row.enrichment_reason).sort(), ['no_website', 'retry_exhausted']);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_jobs'), 0, 'nothing is crawled, checked or sent because of them');

  const phones = db.rows<{ value: string }>(`SELECT evidence.value FROM lead_radar_evidence evidence
    JOIN lead_radar_companies company ON company.id = evidence.company_id
    WHERE company.name = 'Dent Three' AND evidence.field_path = 'company_contacts.phone' ORDER BY evidence.value`);
  assert.deepEqual(phones.map((row) => row.value), ['+998712000003', '+998933000003'], 'both numbers of the tag survive');
});

test('the search deadline flushes the remainder before it cancels the pool', async () => {
  const db = database();
  seed(db, { cursor: 1, createdAt: '2026-11-22T10:00:00.000Z' });
  const store = new LeadRadarStore(db.asD1());
  const expired = await store.expireContactSearchIfPastDeadline(ORG_A, SEARCH_ID, '2026-11-22T11:00:00.000Z', NOW);
  assert.equal(expired, true);
  assert.equal(db.value('SELECT candidates_json FROM lead_radar_candidate_pools'), null);
  assert.equal(db.value(`SELECT stop_reason FROM lead_radar_candidate_pools`), 'cancelled');
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_companies WHERE org_id = '${ORG_A}'`), 5, 'all five discovered businesses remain');
});

test('the retention purge path flushes expired pools first', async () => {
  const db = database();
  seed(db, { cursor: 0 });
  const store = new LeadRadarStore(db.asD1());
  assert.equal(await store.flushExpiredContactPools('2026-11-22T12:30:00.000Z'), 0, 'a live pool is left alone');
  assert.equal(await store.flushExpiredContactPools('2026-11-22T13:30:00.000Z'), 5);
});

test('flushed rows are never selected for automatic Telegram outreach', async () => {
  const db = database();
  seed(db, { cursor: 0 });
  const store = new LeadRadarStore(db.asD1());
  await store.persistContactPoolRemainder(ORG_A, SEARCH_ID, NOW);
  const companyIds = db.rows<{ id: string }>(`SELECT id FROM lead_radar_companies WHERE org_id = ?`, ORG_A).map((row) => row.id);
  assert.equal(companyIds.length, 5);
  const selection = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, companyIds, now: new Date(NOW), contactBasis: 'existing_relationship',
  });
  assert.equal(selection.automatic, 0);
  assert.equal(selection.verified, 0);
});

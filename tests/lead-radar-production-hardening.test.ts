import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { LeadRadarStore, type StoredLeadInput, resumeStalledLeadRadarSearches } from '../functions/platform/lead-radar';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = resolve(import.meta.dirname, '..');
const ORG = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = new Date('2026-08-30T12:00:00.000Z');

function storedLead(canonicalKey: string): StoredLeadInput {
  return {
    canonicalKey,
    name: canonicalKey,
    category: 'dentist',
    city: 'Ташкент',
    country: 'UZ',
    address: 'Ташкент',
    website: null,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    enrichmentStatus: 'terminal',
    enrichmentReason: 'no_website',
    enrichmentAttempts: 0,
    score: 10,
    confidence: 0.8,
    priority: 'P3',
    lifecycle: 'new',
    suppressed: false,
    scoreComponents: [],
    signals: [],
    evidence: [],
    discoveredAt: NOW.toISOString(),
    lastVerifiedAt: NOW.toISOString(),
  };
}

function database(): SqliteD1 {
  const fixture = new SqliteD1();
  fixture.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
  for (const filename of [
    '0036_lead_radar.sql',
    '0041_lead_radar_search_leases.sql',
    '0042_lead_radar_decision_makers.sql',
    '0043_lead_radar_async_funnel.sql',
    '0050_lead_radar_contact_discovery.sql',
    '0054_lead_radar_candidate_pool_resume.sql',
  ]) {
    fixture.exec(readFileSync(resolve(ROOT, 'migrations', filename), 'utf8'));
    fixture.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(filename);
  }
  return fixture;
}

function insertRunningSearch(fixture: SqliteD1, searchId: string, createdAt: string): void {
  fixture.sqlite.prepare(`INSERT INTO lead_radar_searches (id, org_id, input_json, status, phase, created_at)
    VALUES (?, ?, '{"niche":"Стоматологии","city":"Ташкент","country":"UZ","desiredCount":5}', 'running', 'enriching', ?)`)
    .run(searchId, ORG, createdAt);
}

function insertDeadJob(fixture: SqliteD1, id: string, key: string, searchId: string, companyId: string, createdAt: string, errorCode: string): void {
  fixture.sqlite.prepare(`INSERT INTO lead_radar_jobs (id,org_id,search_id,company_id,idempotency_key,stage,status,
    attempt_count,max_attempts,available_at,dispatch_status,next_dispatch_at,created_at,updated_at,completed_at,last_error_code)
    VALUES (?, ?, ?, ?, ?, 'enrichment','dead_letter',3,3,?, 'pending', ?, ?, ?, ?, ?)`)
    .run(id, ORG, searchId, companyId, key, createdAt, createdAt, createdAt, createdAt, createdAt, errorCode);
}

function insertPool(fixture: SqliteD1, searchId: string, updatedAt: string = NOW.toISOString()): void {
  fixture.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
    (org_id,search_id,candidates_json,candidate_count,cursor,target,created_at,expires_at,updated_at)
    VALUES (?,?,NULL,25,20,5,?,?,?)`)
    .run(ORG, searchId, NOW.toISOString(), new Date(NOW.getTime() + 3_600_000).toISOString(), updatedAt);
}

test('LR-F-2: a pre-fix dead contact-resolution job is revived once by the watchdog with a fresh 48h window', async () => {
  const fixture = database();
  const store = new LeadRadarStore(fixture.asD1());
  const preFix = '2026-08-29T20:00:00.000Z';
  insertRunningSearch(fixture, 'search_revive', preFix);
  insertPool(fixture, 'search_revive');
  const companyId = await store.insertLead(ORG, 'search_revive', storedLead('revive-company'));
  assert.ok(companyId);
  insertDeadJob(fixture, 'lrjob_' + 'a'.repeat(32), `contact-resolve:search_revive:${companyId}`, 'search_revive', companyId, preFix, 'contact_check_unavailable');
  const resumed = await resumeStalledLeadRadarSearches(fixture.asD1(), NOW);
  assert.equal(resumed, 1);
  const job = fixture.rows<{ status: string; attempt_count: number; created_at: string; dispatch_status: string }>(
    'SELECT status, attempt_count, created_at, dispatch_status FROM lead_radar_jobs WHERE id=?', 'lrjob_' + 'a'.repeat(32))[0];
  assert.equal(job.status, 'queued');
  assert.equal(job.attempt_count, 0);
  assert.equal(job.dispatch_status, 'pending');
  assert.equal(job.created_at, NOW.toISOString(), 'revival must re-arm the 48h regeneration window');
});

test('LR-F-2: contact-resolution rows created after the QR-1 fix are never revived (no endless loop)', async () => {
  const fixture = database();
  const store = new LeadRadarStore(fixture.asD1());
  const recent = new Date(NOW.getTime() - 60 * 60_000).toISOString();
  insertRunningSearch(fixture, 'search_young', recent);
  insertPool(fixture, 'search_young');
  const youngCompanyId = await store.insertLead(ORG, 'search_young', storedLead('young-company'));
  assert.ok(youngCompanyId);
  insertDeadJob(fixture, 'lrjob_' + 'b'.repeat(32), `contact-resolve:search_young:${youngCompanyId}`, 'search_young', youngCompanyId, recent, 'waiting_for_account');
  await resumeStalledLeadRadarSearches(fixture.asD1(), NOW);
  assert.equal(
    fixture.value('SELECT status FROM lead_radar_jobs WHERE id=?', 'lrjob_' + 'b'.repeat(32)),
    'dead_letter',
    'post-fix rows regenerate on their own row for 48h; the cutoff keeps revival one-time',
  );
});

test('LR-F-7: an unpersisted discovery window returns to the pool when its holder changes', async () => {
  const fixture = database();
  const store = new LeadRadarStore(fixture.asD1());
  insertRunningSearch(fixture, 'search_window', NOW.toISOString());
  fixture.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
    (org_id,search_id,candidates_json,candidate_count,cursor,batch_start,batch_job_id,target,created_at,expires_at,updated_at)
    VALUES (?, 'search_window','[]',10,8,3,?,5,?,?,?)`)
    .run(ORG, 'lrjob_holder', NOW.toISOString(), new Date(NOW.getTime() + 3_600_000).toISOString(), NOW.toISOString());
  await store.contactDiscovery.unreserveBatch(ORG, 'search_window', 'lrjob_other', NOW.toISOString());
  assert.equal(fixture.value('SELECT cursor FROM lead_radar_candidate_pools'), 8, 'a foreign job id must not touch the window');
  await store.contactDiscovery.unreserveBatch(ORG, 'search_window', 'lrjob_holder', NOW.toISOString());
  assert.equal(fixture.value('SELECT cursor FROM lead_radar_candidate_pools'), 3);
  assert.equal(fixture.value('SELECT batch_job_id FROM lead_radar_candidate_pools'), null);
});

test('LR-F-20: the watchdog sweep rotates by pool touch time instead of starving on the oldest search', async () => {
  const fixture = database();
  const store = new LeadRadarStore(fixture.asD1());
  insertRunningSearch(fixture, 'search_churning', new Date(NOW.getTime() - 48 * 60 * 60_000).toISOString());
  insertRunningSearch(fixture, 'search_fresh', new Date(NOW.getTime() - 60 * 60_000).toISOString());
  for (const [searchId, touchedAt] of [
    ['search_churning', new Date(NOW.getTime() - 30_000).toISOString()],
    ['search_fresh', new Date(NOW.getTime() - 45 * 60_000).toISOString()],
  ] as const) {
    fixture.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
      (org_id,search_id,candidates_json,candidate_count,cursor,target,created_at,expires_at,updated_at)
      VALUES (?,?,NULL,25,20,5,?,?,?)`)
      .run(ORG, searchId, NOW.toISOString(), new Date(NOW.getTime() + 3_600_000).toISOString(), touchedAt);
  }
  const firstSweep = await store.listRunningSearchesWithPools(1);
  assert.deepEqual(firstSweep.map((row) => row.searchId), ['search_fresh'],
    'the least recently touched pool must be served first, not the oldest search');
  const swept = await resumeStalledLeadRadarSearches(fixture.asD1(), NOW);
  assert.equal(swept, 2, 'the sweep still serves both searches, but newest-touched last');
  // Once the churning search is refreshed (touching its pool), it rotates to
  // the back of the queue instead of permanently occupying a watchdog slot.
  fixture.sqlite.prepare('UPDATE lead_radar_candidate_pools SET updated_at=? WHERE search_id=?')
    .run(new Date(NOW.getTime() - 1_000).toISOString(), 'search_churning');
  const secondSweep = await store.listRunningSearchesWithPools(1);
  assert.deepEqual(secondSweep.map((row) => row.searchId), ['search_fresh']);
});

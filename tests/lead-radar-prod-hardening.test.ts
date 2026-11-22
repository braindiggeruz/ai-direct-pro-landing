import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import { LeadRadarStore } from '../functions/platform/lead-radar/store';
import { classifyHomeFailure, OpenStreetMapLeadSource } from '../functions/platform/lead-radar/sources';
import { contactCheckTtlMs, isLookupOutage } from '../functions/platform/lead-radar/contact-resolution';
import { pauseTelegramLookups, readTelegramLookupPause } from '../functions/platform/lead-radar/telegram-handle-store';
import type { LeadRadarGeocodeStore } from '../functions/platform/lead-radar/types';
import { SqliteD1 } from './helpers/sqlite-d1';

/**
 * Production hardening after the owner's searches of 22.11.2026: a dead site,
 * a waiting Telegram check or a short map-server outage must not stall or end
 * a search, and a broken lookup service must not drain the check budget.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const ORG = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = '2026-11-22T12:00:00.000Z';
const INPUT: LeadRadarSearchInput = {
  niche: 'Стоматология', city: 'Ташкент', country: 'UZ', offer: 'Заявки', desiredCount: 20,
  telegramRequired: false, languages: ['ru', 'uz'], searchGoal: 'telegram_contacts', maxCandidates: 100,
};

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL, default_locale TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  db.sqlite.prepare(`INSERT INTO organizations VALUES (?, ?, ?, 'active', 'ru', ?, ?)`).run(ORG, ORG, ORG, NOW, NOW);
  for (const filename of ['0036_lead_radar.sql', '0041_lead_radar_search_leases.sql', '0042_lead_radar_decision_makers.sql',
    '0043_lead_radar_async_funnel.sql', '0044_lead_radar_telegram_business.sql', '0045_lead_radar_telegram_campaigns.sql',
    '0050_lead_radar_contact_discovery.sql', '0054_lead_radar_candidate_pool_resume.sql']) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', filename), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(filename);
  }
  return db;
}

// ── Dead websites ───────────────────────────────────────────────────────────

test('a dead or wrong website is terminal at once; only 429, 5xx and transport errors retry', () => {
  assert.deepEqual(classifyHomeFailure({ nxdomain: true }), { reason: 'invalid_website', retryable: false });
  assert.deepEqual(classifyHomeFailure({ status: 404 }), { reason: 'invalid_website', retryable: false });
  assert.deepEqual(classifyHomeFailure({ status: 410 }), { reason: 'invalid_website', retryable: false });
  assert.deepEqual(classifyHomeFailure({ status: 403 }), { reason: 'http_blocked', retryable: false });
  assert.deepEqual(classifyHomeFailure({ status: 451 }), { reason: 'http_blocked', retryable: false });
  assert.deepEqual(classifyHomeFailure({ nonHtml: true }), { reason: 'invalid_website', retryable: false });
  assert.deepEqual(classifyHomeFailure({ status: 503 }), { reason: 'source_unavailable', retryable: true });
  assert.deepEqual(classifyHomeFailure({ status: 429 }), { reason: 'source_unavailable', retryable: true });
  assert.deepEqual(classifyHomeFailure({}), { reason: 'source_unavailable', retryable: true });
});

// ── Lookup outages ──────────────────────────────────────────────────────────

test('any lookup failure that is not a short hiccup climbs the ladder; local rejections are not outages', () => {
  const failed = (reason: string) => ({ status: 'failed' as const, username: null, reason, retryAfterSeconds: null });
  assert.equal(isLookupOutage(failed('lookup_unavailable')), true, 'TG Sender vocabulary counts as an outage');
  assert.equal(isLookupOutage(failed('tg_sender_unavailable')), true);
  assert.equal(isLookupOutage(failed('telegram_timeout')), false);
  assert.equal(isLookupOutage(failed('contact_not_found')), false);
  assert.equal(isLookupOutage(failed('daily_check_limit')), false);
  assert.equal(isLookupOutage(failed('business_listing_unavailable')), false);
  assert.equal(isLookupOutage({ status: 'unsupported', username: null, reason: 'not_regular_user', retryAfterSeconds: null }), false);
  // The 28-attempts-in-30-minutes loop of 22.11 becomes 1, 5, 15 minutes, then 2 hours.
  assert.deepEqual([1, 2, 3, 4, 28].map((attempt) => contactCheckTtlMs(failed('lookup_unavailable'), attempt)),
    [60_000, 300_000, 900_000, 7_200_000, 7_200_000]);
  assert.equal(contactCheckTtlMs(failed('bridge_offline'), 5), 60_000, 'a local Bridge hiccup keeps its quick retry');
});

test('an org-wide lookup pause is stored, read back while active and only ever extended', async () => {
  const db = database();
  const at = new Date(NOW);
  assert.equal(await readTelegramLookupPause(db.asD1(), ORG, at), null);
  await pauseTelegramLookups(db.asD1(), ORG, at);
  const until = await readTelegramLookupPause(db.asD1(), ORG, at);
  assert.equal(until, '2026-11-22T12:15:00.000Z');
  await pauseTelegramLookups(db.asD1(), ORG, at, 60_000);
  assert.equal(await readTelegramLookupPause(db.asD1(), ORG, at), until, 'a shorter pause never cuts a longer one');
  assert.equal(await readTelegramLookupPause(db.asD1(), ORG, new Date('2026-11-22T12:16:00.000Z')), null);
  assert.equal(await readTelegramLookupPause(db.asD1(), 'org_other', at), null, 'the pause is per org');
});

// ── Pool flow ───────────────────────────────────────────────────────────────

function seedSearch(db: SqliteD1) {
  db.sqlite.prepare(`INSERT INTO lead_radar_searches (id, org_id, input_json, status, phase, created_at) VALUES ('s1', ?, ?, 'running', 'enriching', ?)`)
    .run(ORG, JSON.stringify(INPUT), NOW);
  db.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
    (org_id, search_id, candidates_json, candidate_count, cursor, batch_start, target, created_at, expires_at, updated_at)
    VALUES (?, 's1', '[]', 30, 10, 0, 20, ?, '2026-11-22T13:00:00.000Z', ?)`).run(ORG, NOW, NOW);
  for (const id of ['c1', 'c2']) {
    db.sqlite.prepare(`INSERT INTO lead_radar_companies (
      id, org_id, search_id, canonical_key, name, category, city, country, score, confidence, priority,
      score_components_json, signals_json, discovered_at, last_verified_at, updated_at, enrichment_status
    ) VALUES (?, ?, 's1', ?, ?, 'dentist', 'Ташкент', 'UZ', 50, 0.7, 'P2', '[]', '[]', ?, ?, ?, 'queued')`)
      .run(id, ORG, `key:${id}`, `Dent ${id}`, NOW, NOW, NOW);
  }
}

function insertJob(db: SqliteD1, input: { id: string; key: string; stage: 'discovery' | 'enrichment'; status: string;
  companyId: string | null; error?: string | null }) {
  const done = ['completed', 'dead_letter'].includes(input.status);
  const running = input.status === 'running';
  db.sqlite.prepare(`INSERT INTO lead_radar_jobs
    (id, org_id, search_id, company_id, idempotency_key, stage, status, attempt_count, max_attempts, available_at,
     dispatch_status, next_dispatch_at, dispatched_at, created_at, updated_at, completed_at, lease_owner, lease_expires_at, last_error_code)
    VALUES (?, ?, 's1', ?, ?, ?, ?, 1, 3, ?, 'sent', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    input.id, ORG, input.companyId, input.key, input.stage, input.status, NOW, NOW, NOW, NOW, NOW,
    done ? NOW : null, running ? 'worker-1' : null, running ? '2026-11-22T12:05:00.000Z' : null, input.error ?? null);
}

test('a site in retry or a waiting Telegram check no longer holds the next batch', async () => {
  const db = database();
  seedSearch(db);
  insertJob(db, { id: 'lrjob_' + 'd'.repeat(32), key: 'discovery:s1', stage: 'discovery', status: 'completed', companyId: null });
  insertJob(db, { id: 'lrjob_' + 'e'.repeat(32), key: 'enrichment:c1', stage: 'enrichment', status: 'retry_wait', companyId: 'c1', error: 'source_unavailable' });
  insertJob(db, { id: 'lrjob_' + 'f'.repeat(32), key: 'contact-resolve:s1:c2', stage: 'enrichment', status: 'queued', companyId: 'c2', error: 'contact_check_pending' });

  await new LeadRadarStore(db.asD1()).refreshSearchFunnel(ORG, 's1', NOW);
  const replenish = db.rows<{ idempotency_key: string; status: string }>(
    `SELECT idempotency_key, status FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-pool:%'`);
  assert.deepEqual(replenish.map((row) => ({ ...row })), [{ idempotency_key: 'contact-pool:s1:10', status: 'queued' }]);
  assert.equal(db.value(`SELECT status FROM lead_radar_searches WHERE id = 's1'`), 'running', 'stragglers still keep the search open');
});

test('a fresh first attempt of the current batch still gates the next one', async () => {
  const db = database();
  seedSearch(db);
  insertJob(db, { id: 'lrjob_' + 'd'.repeat(32), key: 'discovery:s1', stage: 'discovery', status: 'completed', companyId: null });
  insertJob(db, { id: 'lrjob_' + 'e'.repeat(32), key: 'enrichment:c1', stage: 'enrichment', status: 'running', companyId: 'c1' });
  await new LeadRadarStore(db.asD1()).refreshSearchFunnel(ORG, 's1', NOW);
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-pool:%'`), 0);
});

test('discovery diagnostics are kept on the search, deduplicated and capped', async () => {
  const db = database();
  db.sqlite.prepare(`INSERT INTO lead_radar_searches (id, org_id, input_json, status, created_at, warnings_json) VALUES ('s1', ?, '{}', 'running', ?, '["a_warning"]')`)
    .run(ORG, NOW);
  const store = new LeadRadarStore(db.asD1());
  await store.appendSearchWarnings(ORG, 's1', ['discovery_main_http_521', 'discovery_vk_maps_timeout', 'a_warning', 'Bad Code!']);
  const warnings = JSON.parse(String(db.value(`SELECT warnings_json FROM lead_radar_searches WHERE id = 's1'`))) as string[];
  assert.deepEqual([...warnings].sort(), ['a_warning', 'discovery_main_http_521', 'discovery_vk_maps_timeout']);
});

// ── Map answer cache ────────────────────────────────────────────────────────

function memoryStore(): LeadRadarGeocodeStore & { cache: Map<string, { elements: unknown[]; observedAt: string }>; puts: number } {
  const cache = new Map<string, { elements: unknown[]; observedAt: string }>();
  const store = {
    cache,
    puts: 0,
    async getGeocodeBounds() { return [41.2, 69.1, 41.4, 69.4] as [number, number, number, number]; },
    async putGeocodeBounds() { /* cached already */ },
    async acquireGeocoderSlot() { return true; },
    async getOverpassResponse(key: string) { return cache.get(key) ?? null; },
    async putOverpassResponse(key: string, elements: unknown[], observedAt: string) { store.puts += 1; cache.set(key, { elements, observedAt }); },
  };
  return store;
}

const DENTIST = { type: 'node', id: 77, lat: 41.3, lon: 69.27, tags: { name: 'Smile Dent', amenity: 'dentist', phone: '+998901234567' } };

test('a map answer is cached, reused for a day, and used stale when every server is down', async (t) => {
  const store = memoryStore();
  let overpassCalls = 0;
  let serversUp = true;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!/interpreter$/.test(url)) throw new Error(`unexpected ${url}`);
    overpassCalls += 1;
    if (!serversUp) return new Response('gateway timeout', { status: 504 });
    return Response.json({ elements: Array.from({ length: 12 }, (_, index) => ({ ...DENTIST, id: 77 + index, tags: { ...DENTIST.tags, name: `Smile Dent ${index}` } })) });
  });
  const source = new OpenStreetMapLeadSource(store);

  const live = await source.discoverRaw(INPUT);
  assert.ok(live.candidates.length > 0);
  assert.ok(store.puts >= 1, 'the live answer is stored');
  const liveCalls = overpassCalls;

  const fresh = await source.discoverRaw(INPUT);
  assert.equal(overpassCalls, liveCalls, 'a fresh cached answer needs no map server');
  assert.ok(fresh.sourceWarnings.includes('map_cache_fresh'));

  for (const entry of store.cache.values()) entry.observedAt = '2026-11-01T00:00:00.000Z';
  serversUp = false;
  const stale = await source.discoverRaw(INPUT);
  assert.ok(stale.candidates.length > 0, 'an old answer beats a failed search');
  assert.ok(stale.sourceWarnings.some((warning) => /^map_cache_stale_\d+h$/.test(warning)), stale.sourceWarnings.join(','));
});

// ── D1 budget of the real discovery path ───────────────────────────────────

test('contact-mode discovery through the real OSM source, map cache and a 25-lead batch fits the 50-query D1 budget', async (t) => {
  const { enqueueLeadRadarSearch, consumeLeadRadarQueueMessage } = await import('../functions/platform/lead-radar');
  const fixture = database();
  const base = fixture.asD1();
  let statements = 0;
  const counted = new Proxy(base, {
    get(target, property, receiver) {
      if (property === 'prepare') return (sql: string) => { statements += 1; return target.prepare(sql); };
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as D1Database;
  const store = new LeadRadarStore(counted);
  const messages: unknown[] = [];
  const queue = {
    async send(message: unknown) { messages.push(structuredClone(message)); },
    async sendBatch(batch: Array<{ body: unknown }>) { for (const item of batch) messages.push(structuredClone(item.body)); },
  };
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://nominatim.openstreetmap.org/')) {
      return Response.json([{ boundingbox: ['41.17', '41.43', '69.11', '69.43'], lat: '41.3', lon: '69.27', display_name: 'Ташкент', class: 'boundary', type: 'administrative', addresstype: 'city' }]);
    }
    if (/interpreter$/.test(url)) {
      return Response.json({ elements: Array.from({ length: 100 }, (_, index) => ({
        type: 'node', id: 1000 + index, lat: 41.3 + index / 10_000, lon: 69.27,
        tags: { name: `Dent ${index}`, amenity: 'dentist', phone: `+998 90 ${String(1_000_000 + index).slice(-7)}` },
      })) });
    }
    throw new Error(`unexpected ${url}`);
  });
  const at = new Date(NOW);
  await enqueueLeadRadarSearch(store, ORG, { ...INPUT, maxCandidates: 100 }, queue as never, at);
  const discovery = messages.shift();
  assert.ok(discovery);
  statements = 0;
  const outcome = await consumeLeadRadarQueueMessage(counted, discovery as never, queue as never, {
    now: () => at,
    sources: [new OpenStreetMapLeadSource(store)],
    personalDataEnabled: false,
  });
  assert.equal(outcome.outcome, 'completed');
  assert.equal(fixture.value('SELECT candidate_count FROM lead_radar_candidate_pools'), 100);
  assert.equal(fixture.value('SELECT COUNT(*) FROM lead_radar_companies'), 25, 'one batch of 25 is persisted');
  assert.ok(statements <= 50, `discovery used ${statements} D1 statements`);
  assert.ok(statements <= 40, `keep headroom under the 50-query limit: ${statements}`);
});

// ── Lookup pause wiring ─────────────────────────────────────────────────────

test('a hosted lookup outage pauses the org and finishes the company; local answers do not pause', async () => {
  const { contactCheckOutcome } = await import('../functions/platform/lead-radar/contact-resolution-worker');
  const db = database();
  const failed = (reason: string) => ({ status: 'failed' as const, username: null, reason, retryAfterSeconds: null });
  assert.deepEqual(await contactCheckOutcome(db.asD1(), ORG, true, failed('contact_not_found')), { pending: false });
  assert.equal(await readTelegramLookupPause(db.asD1(), ORG), null, 'a local rejection never pauses lookups');
  assert.deepEqual(await contactCheckOutcome(db.asD1(), ORG, true, failed('bridge_offline')),
    { pending: true, reason: 'bridge_offline', retryAfterSeconds: 60 });
  assert.deepEqual(await contactCheckOutcome(db.asD1(), ORG, false, failed('lookup_unavailable')), { pending: true },
    'the local Bridge path keeps its candidate-by-candidate advance');
  assert.equal(await readTelegramLookupPause(db.asD1(), ORG), null);
  assert.deepEqual(await contactCheckOutcome(db.asD1(), ORG, true, failed('lookup_unavailable')), { pending: false });
  assert.ok(await readTelegramLookupPause(db.asD1(), ORG), 'TG Sender outage pauses the whole org');
});

test('while lookups are paused, a contact job finishes before touching the account or TG Sender', async () => {
  const { createContactResolutionQueueDependencies } = await import('../functions/platform/lead-radar/contact-resolution-worker');
  const db = database();
  await pauseTelegramLookups(db.asD1(), ORG);
  const dependencies = createContactResolutionQueueDependencies({
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'tg_sender',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: Buffer.alloc(32, 9).toString('base64url'),
  } as never, db.asD1());
  assert.ok(dependencies.resolveLeadContacts, 'the resolver is configured for TG Sender mode');
  const outcome = await dependencies.resolveLeadContacts!(
    { orgId: ORG, searchId: 's1', companyId: 'c1' } as never,
    { suppressed: false, lifecycle: 'new' } as never,
  );
  assert.deepEqual(outcome, { pending: false });
});

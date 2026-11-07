import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { configuredLeadRadarSources, fanOutDiscovery } from '../functions/platform/lead-radar/discovery-sources';
import { consumeLeadRadarQueueMessage, enqueueLeadRadarSearch } from '../functions/platform/lead-radar/queue';
import { OpenStreetMapLeadSource } from '../functions/platform/lead-radar/sources';
import { LeadRadarStore } from '../functions/platform/lead-radar/store';
import { TwoGisLeadSource } from '../functions/platform/lead-radar/two-gis-source';
import type { LeadRadarQueueMessage, LeadRadarSource, SourceCandidate } from '../functions/platform/lead-radar/types';
import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import { SqliteD1 } from './helpers/sqlite-d1';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const INPUT: LeadRadarSearchInput = {
  niche: 'стоматологии', city: 'Ташкент', country: 'UZ', offer: 'Запись клиентов',
  desiredCount: 5, telegramRequired: false, languages: ['ru', 'uz'],
};

function candidate(id: string, website: string | null = null): SourceCandidate {
  return {
    sourceId: `osm:node/${id}`, sourceUrl: `https://www.openstreetmap.org/node/${id}`,
    name: `Fixture Clinic ${id}`, category: 'dentist', city: INPUT.city, country: 'UZ',
    address: `Fixture street ${id}`, website, phone: null, genericEmail: null,
    telegramUrl: null, telegramContact: null, decisionMakers: [], signals: [],
    enrichmentStatus: website ? 'pending' : 'terminal',
    enrichmentReason: website ? null : 'no_website', enrichmentAttempts: 0,
    evidence: [{
      id: `name-${id}`, fieldPath: 'company.name', value: `Fixture Clinic ${id}`,
      sourceUrl: `https://www.openstreetmap.org/node/${id}`, sourceType: 'openstreetmap',
      observedAt: NOW.toISOString(), confidence: 0.9, classification: 'company_data',
    }],
  };
}

async function setup(t: TestContext, sources?: (store: LeadRadarStore) => LeadRadarSource[]) {
  // These tests exercise real registry/queue wiring. Any unmocked source call
  // fails locally instead of accidentally probing production catalogs.
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected_network_call'); });
  const db = new SqliteD1();
  for (const name of ['0036_lead_radar.sql', '0041_lead_radar_search_leases.sql',
    '0042_lead_radar_decision_makers.sql', '0043_lead_radar_async_funnel.sql']) {
    db.exec(readFileSync(resolve(import.meta.dirname, `../migrations/${name}`), 'utf8'));
  }
  const store = new LeadRadarStore(db.asD1());
  const messages: LeadRadarQueueMessage[] = [];
  const queue = { async send(message: LeadRadarQueueMessage) { messages.push(message); } };
  const result = await enqueueLeadRadarSearch(store, 'org-fixture', INPUT, queue, NOW, 'wiring-fixture-001');
  const message = messages.shift()!;
  const configured = sources?.(store);
  return {
    db, store, result, message, queue,
    consume: (at = NOW) => consumeLeadRadarQueueMessage(db.asD1(), message, queue, {
      now: () => at, ...(configured ? { sources: configured } : {}),
    }),
  };
}

test('production registry calls OSM raw once and leases website enrichment separately', async (t) => {
  const raw = t.mock.method(OpenStreetMapLeadSource.prototype, 'discoverRaw', async () => ({
    candidates: [candidate('1', 'https://fixture.example')], sourceWarnings: [], rawDiscoveredCount: 17,
  }));
  const enriched = t.mock.method(OpenStreetMapLeadSource.prototype, 'discover', async () => {
    throw new Error('inline_enrichment_must_not_run');
  });
  const fixture = await setup(t, (store) => configuredLeadRadarSources(store, {}));
  assert.deepEqual(await fixture.consume(), { outcome: 'completed' });
  assert.equal(raw.mock.callCount(), 1);
  assert.equal(enriched.mock.callCount(), 0);
  assert.equal(fixture.db.value("SELECT status FROM lead_radar_jobs WHERE stage='enrichment'"), 'queued');
  assert.equal(fixture.db.value('SELECT raw_discovered_count FROM lead_radar_searches'), 17);
  assert.equal(fixture.db.value('SELECT enrichment_status FROM lead_radar_companies'), 'queued');
});

test('configured 2GIS still produces leads when OSM fails', async (t) => {
  const raw = t.mock.method(OpenStreetMapLeadSource.prototype, 'discoverRaw', async () => {
    throw new Error('source_timeout');
  });
  const secondary = t.mock.method(TwoGisLeadSource.prototype, 'discoverRaw', async () => ({
    candidates: [candidate('2')], sourceWarnings: ['two_gis_contacts_absent'], rawDiscoveredCount: 3,
  }));
  const fixture = await setup(t, (store) => configuredLeadRadarSources(store, { TWOGIS_API_KEY: 'fixture-only' }));
  assert.deepEqual(await fixture.consume(), { outcome: 'completed' });
  assert.equal(raw.mock.callCount(), 1);
  assert.equal(secondary.mock.callCount(), 1);
  assert.equal(fixture.db.value('SELECT COUNT(*) FROM lead_radar_companies'), 1);
  const warnings = JSON.parse(String(fixture.db.value('SELECT warnings_json FROM lead_radar_searches'))) as string[];
  assert.ok(warnings.includes('discovery_source_unavailable:openstreetmap'));
  assert.ok(warnings.includes('two_gis_contacts_absent'));
  assert.equal(fixture.db.value('SELECT raw_discovered_count FROM lead_radar_searches'), 3);
});

test('all configured sources failing follow the existing bounded retry and dead-letter path', async (t) => {
  t.mock.method(OpenStreetMapLeadSource.prototype, 'discoverRaw', async () => { throw new Error('source_timeout'); });
  t.mock.method(TwoGisLeadSource.prototype, 'discoverRaw', async () => { throw new Error('catalog_unavailable'); });
  const fixture = await setup(t, (store) => configuredLeadRadarSources(store, { TWOGIS_API_KEY: 'fixture-only' }));
  assert.equal((await fixture.consume()).outcome, 'retry_wait');
  assert.equal(fixture.db.value('SELECT last_error_code FROM lead_radar_jobs'), 'source_timeout');
  assert.equal(fixture.db.value('SELECT attempt_count FROM lead_radar_jobs'), 1);
  const secondAt = new Date(String(fixture.db.value('SELECT available_at FROM lead_radar_jobs')));
  assert.equal((await fixture.consume(secondAt)).outcome, 'retry_wait');
  const thirdAt = new Date(String(fixture.db.value('SELECT available_at FROM lead_radar_jobs')));
  assert.deepEqual(await fixture.consume(thirdAt), { outcome: 'dead_letter', errorCode: 'source_timeout' });
  assert.equal(fixture.db.value('SELECT attempt_count FROM lead_radar_jobs'), 3);
  assert.equal(fixture.db.value("SELECT COUNT(*) FROM lead_radar_jobs WHERE stage='enrichment'"), 0);
});

test('a real 2GIS soft failure does not turn a total outage into a successful empty search', async (t) => {
  t.mock.method(OpenStreetMapLeadSource.prototype, 'discoverRaw', async () => { throw new Error('source_timeout'); });
  const fixture = await setup(t, (store) => [
    new OpenStreetMapLeadSource(store),
    new TwoGisLeadSource({ TWOGIS_API_KEY: 'fixture-only' }, {
      fetchImpl: async () => new Response('{}', { status: 503 }),
    }),
  ]);
  assert.equal((await fixture.consume()).outcome, 'retry_wait');
  assert.equal(fixture.db.value('SELECT last_error_code FROM lead_radar_jobs'), 'source_timeout');
  assert.equal(fixture.db.value('SELECT COUNT(*) FROM lead_radar_companies'), 0);
});

test('a real 2GIS successful empty page remains distinct from a soft failure', async (t) => {
  t.mock.method(OpenStreetMapLeadSource.prototype, 'discoverRaw', async () => { throw new Error('source_timeout'); });
  const fixture = await setup(t, (store) => [
    new OpenStreetMapLeadSource(store),
    new TwoGisLeadSource({ TWOGIS_API_KEY: 'fixture-only' }, {
      fetchImpl: async () => new Response(JSON.stringify({ result: { items: [] } }), { status: 200 }),
    }),
  ]);
  assert.deepEqual(await fixture.consume(), { outcome: 'completed' });
  assert.equal(fixture.db.value('SELECT status FROM lead_radar_searches'), 'insufficient_results');
});

test('duplicate registry entries do not duplicate source calls or bypass candidate caps', async (t) => {
  const rows = Array.from({ length: 12 }, (_, index) => candidate(String(index + 1)));
  const raw = t.mock.method(OpenStreetMapLeadSource.prototype, 'discoverRaw', async () => ({
    candidates: rows, sourceWarnings: [], rawDiscoveredCount: 20,
  }));
  const secondary = t.mock.method(TwoGisLeadSource.prototype, 'discoverRaw', async () => ({
    candidates: rows.slice(0, 3), sourceWarnings: [], rawDiscoveredCount: 3,
  }));
  const fixture = await setup(t, (store) => {
    const registry = configuredLeadRadarSources(store, { TWOGIS_API_KEY: 'fixture-only' });
    return [...registry, ...registry];
  });
  assert.deepEqual(await fixture.consume(), { outcome: 'completed' });
  assert.equal(raw.mock.callCount(), 1);
  assert.equal(secondary.mock.callCount(), 1);
  assert.equal(fixture.db.value('SELECT COUNT(*) FROM lead_radar_companies'), INPUT.desiredCount);
  assert.equal(fixture.db.value('SELECT COUNT(DISTINCT canonical_key) FROM lead_radar_companies'), INPUT.desiredCount);
  assert.equal(fixture.db.value('SELECT raw_discovered_count FROM lead_radar_searches'), 23);
});

for (const mode of ['absent', 'empty', 'legacy-extras'] as const) {
  test(`${mode} registry retains exactly one OSM catalog call`, async (t) => {
    const raw = t.mock.method(OpenStreetMapLeadSource.prototype, 'discoverRaw', async () => ({
      candidates: [candidate('1')], sourceWarnings: [],
    }));
    const fixture = await setup(t, mode === 'absent' ? undefined : () => mode === 'empty' ? [] : [{
      id: 'fixture_catalog', async discover() { return { candidates: [], sourceWarnings: [] }; },
    }]);
    assert.deepEqual(await fixture.consume(), { outcome: 'completed' });
    assert.equal(raw.mock.callCount(), 1);
    assert.equal(fixture.db.value('SELECT COUNT(*) FROM lead_radar_companies'), 1);
  });
}

test('an empty successful catalog is not treated as a total source outage', async (t) => {
  t.mock.method(OpenStreetMapLeadSource.prototype, 'discoverRaw', async () => ({ candidates: [], sourceWarnings: [] }));
  t.mock.method(TwoGisLeadSource.prototype, 'discoverRaw', async () => { throw new Error('source_timeout'); });
  const fixture = await setup(t, (store) => configuredLeadRadarSources(store, { TWOGIS_API_KEY: 'fixture-only' }));
  assert.deepEqual(await fixture.consume(), { outcome: 'completed' });
  assert.equal(fixture.db.value('SELECT status FROM lead_radar_searches'), 'insufficient_results');
});

test('direct fan-out preserves enriched discover semantics unless catalog-only is requested', async (t) => {
  const raw = t.mock.method(OpenStreetMapLeadSource.prototype, 'discoverRaw', async () => ({ candidates: [], sourceWarnings: [] }));
  const enriched = t.mock.method(OpenStreetMapLeadSource.prototype, 'discover', async () => ({ candidates: [candidate('1')], sourceWarnings: [] }));
  const result = await fanOutDiscovery(configuredLeadRadarSources(undefined, {}), INPUT);
  assert.equal(result.candidates.length, 1);
  assert.equal(enriched.mock.callCount(), 1);
  assert.equal(raw.mock.callCount(), 0);
});

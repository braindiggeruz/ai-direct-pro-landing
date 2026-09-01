import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import {
  configuredLeadRadarSources,
  fanOutDiscovery,
  mergeCrossSourceCandidates,
} from '../functions/platform/lead-radar/discovery-sources';
import { candidateFromTwoGisItem } from '../functions/platform/lead-radar/two-gis-source';
import type { LeadRadarSource, SourceCandidate } from '../functions/platform/lead-radar/types';

const NOW = '2026-09-01T12:00:00.000Z';

function input(overrides: Partial<LeadRadarSearchInput> = {}): LeadRadarSearchInput {
  return {
    niche: 'стоматология',
    city: 'Ташкент',
    country: 'UZ',
    offer: 'AI-ассистент для записи',
    desiredCount: 25,
    telegramRequired: false,
    languages: ['ru', 'uz'],
    ...overrides,
  };
}

function twoGisItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '70000001098765432',
    type: 'branch',
    name: 'Клиника Улыбка',
    address_name: 'ул. Амира Темура, 15',
    point: { lat: 41.311081, lon: 69.240562 },
    rubrics: [{ name: 'Стоматология' }],
    contact_groups: [{
      contacts: [
        { type: 'phone', value: '+998 90 123 45 67' },
        { type: 'telegram', url: 'https://t.me/ulybka_clinic' },
      ],
    }],
    ...overrides,
  };
}

/** An OSM-shaped candidate: the same clinic, but sourced from the map and
 *  carrying the landline instead of the mobile. */
function osmCandidate(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    sourceId: 'osm:node/12345',
    sourceUrl: 'https://www.openstreetmap.org/node/12345',
    name: 'Клиника Улыбка',
    category: 'dentist',
    city: 'Ташкент',
    country: 'UZ',
    address: 'ул. Амира Темура, 15',
    website: 'https://ulybka.uz',
    phone: '+998711234567',
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    enrichmentStatus: 'pending',
    enrichmentReason: null,
    enrichmentAttempts: 0,
    evidence: [
      {
        id: 'osm-1',
        fieldPath: 'company.name',
        value: 'Клиника Улыбка',
        sourceUrl: 'https://www.openstreetmap.org/node/12345',
        sourceType: 'openstreetmap',
        confidence: 0.9,
        classification: 'fact',
        observedAt: NOW,
      },
      {
        id: 'osm-2',
        fieldPath: 'company_contacts.phone',
        value: '+998711234567',
        sourceUrl: 'https://www.openstreetmap.org/node/12345',
        sourceType: 'openstreetmap',
        confidence: 0.85,
        classification: 'company_data',
        observedAt: NOW,
      },
    ],
    signals: [],
    ...overrides,
  };
}

function twoGisCandidate(overrides: Record<string, unknown> = {}): SourceCandidate {
  const candidate = candidateFromTwoGisItem(twoGisItem(overrides), input(), NOW);
  assert.ok(candidate, 'fixture must produce a candidate');
  return candidate;
}

function fakeSource(id: string, result: SourceCandidate[] | Error): LeadRadarSource {
  return {
    id,
    async discover() {
      if (result instanceof Error) throw result;
      return { candidates: result, sourceWarnings: [] };
    },
  };
}

test('without a key the source list is OpenStreetMap only', () => {
  const sources = configuredLeadRadarSources(undefined, {});
  assert.deepEqual(sources.map((source) => source.id), ['openstreetmap']);
});

test('an empty key is treated as unconfigured, not as a broken key', () => {
  const sources = configuredLeadRadarSources(undefined, { TWOGIS_API_KEY: '   ' });
  assert.deepEqual(sources.map((source) => source.id), ['openstreetmap']);
});

test('with a key the 2GIS catalog joins OSM rather than replacing it', () => {
  const sources = configuredLeadRadarSources(undefined, { TWOGIS_API_KEY: 'key' });
  assert.deepEqual(sources.map((source) => source.id), ['openstreetmap', '2gis_catalog']);
});

test('one business known to two catalogs stays one row', () => {
  const merged = mergeCrossSourceCandidates([osmCandidate(), twoGisCandidate()]);
  assert.equal(merged.length, 1, 'the same clinic is not duplicated');
  const row = merged[0]!;
  // The union of both catalogs is what raises yield: OSM proves the public
  // record, 2GIS adds the mobile and the messenger.
  assert.equal(row.website, 'https://ulybka.uz', 'the website survives the merge');
  assert.ok(row.evidence.some((item) => item.id === 'osm-1'), 'OSM evidence survives');
  assert.ok(row.evidence.some((item) => item.sourceType === 'official_open_data'), '2GIS evidence is added');
  assert.ok(row.evidence.some((item) => item.value === '+998 90 123 45 67'
    || item.value === '+998901234567'), 'the 2GIS mobile is kept as evidence');
  assert.equal(row.telegramContact?.username, 'ulybka_clinic', 'the Telegram contact survives');
});

test('evidence ids stay unique after a merge', () => {
  const a = osmCandidate();
  const b = osmCandidate();
  const merged = mergeCrossSourceCandidates([a, b]);
  const ids = merged[0]!.evidence.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicated evidence id');
});

test('the same name in a different street is a branch and stays separate', () => {
  const main = osmCandidate({ address: 'ул. Амира Темура, 15' });
  const branch = osmCandidate({
    sourceId: 'osm:node/999',
    sourceUrl: 'https://www.openstreetmap.org/node/999',
    address: 'ул. Навои, 3',
    phone: '+998712222222',
  });
  const merged = mergeCrossSourceCandidates([main, branch]);
  assert.equal(merged.length, 2, 'two branches are two leads');
});

test('two points further apart than a block are two businesses', () => {
  const near = candidateFromTwoGisItem(
    twoGisItem({ id: 'a', point: { lat: 41.311081, lon: 69.240562 }, address_name: undefined, address: undefined }),
    input(), NOW,
  )!;
  const far = candidateFromTwoGisItem(
    twoGisItem({ id: 'b', point: { lat: 41.35, lon: 69.24 }, address_name: undefined, address: undefined }),
    input(), NOW,
  )!;
  const merged = mergeCrossSourceCandidates([near, far]);
  assert.equal(merged.length, 2, '1.4 km apart is not the same shopfront');
});

test('two points inside one block without an address are the same business', () => {
  const a = candidateFromTwoGisItem(
    twoGisItem({ id: 'a', point: { lat: 41.311081, lon: 69.240562 }, address_name: undefined, address: undefined }),
    input(), NOW,
  )!;
  const b = candidateFromTwoGisItem(
    twoGisItem({ id: 'b', point: { lat: 41.3112, lon: 69.2407 }, address_name: undefined, address: undefined }),
    input(), NOW,
  )!;
  const merged = mergeCrossSourceCandidates([a, b]);
  assert.equal(merged.length, 1, '30 m apart is the same entrance');
});

test('a merge keeps a pending enrichment so the website still gets crawled', () => {
  const merged = mergeCrossSourceCandidates([
    osmCandidate({ enrichmentStatus: 'terminal', enrichmentReason: 'no_website' }),
    twoGisCandidate(),
  ]);
  assert.equal(merged[0]!.enrichmentStatus, 'pending', 'a website appeared, so enrichment must run');
});

test('a failing source never hides a healthy one', async () => {
  const result = await fanOutDiscovery([
    fakeSource('osm', [osmCandidate()]),
    fakeSource('2gis_catalog', new Error('two_gis_timeout')),
  ], input());
  assert.equal(result.candidates.length, 1, 'the OSM row still arrives');
  assert.equal(result.failures, 1);
  assert.equal(result.errors.length, 1);
});

test('a total failure surfaces the real reason, not a generic one', async () => {
  const boom = new Error('overpass_unavailable');
  const result = await fanOutDiscovery([fakeSource('osm', boom)], input());
  assert.deepEqual(result.candidates, []);
  assert.equal(result.errors[0], boom, 'the original error object is preserved');
});

test('warnings from every source are collected', async () => {
  const source: LeadRadarSource = {
    id: '2gis_catalog',
    async discover() {
      return { candidates: [], sourceWarnings: ['two_gis_contacts_absent'] };
    },
  };
  const result = await fanOutDiscovery([source], input());
  assert.deepEqual(result.warnings, ['two_gis_contacts_absent']);
});

test('a single source is never merged — one-source runs stay unchanged', async () => {
  // Two distinct businesses with the same name and no place data must both
  // survive when only one catalog is in play.
  const a = osmCandidate({ sourceId: 'osm:node/1', sourceUrl: 'https://www.openstreetmap.org/node/1', address: null });
  const b = osmCandidate({ sourceId: 'osm:node/2', sourceUrl: 'https://www.openstreetmap.org/node/2', address: null, phone: '+998712222222' });
  const result = await fanOutDiscovery([fakeSource('osm', [a, b])], input());
  assert.equal(result.candidates.length, 2, 'no cross-catalog merge without a second catalog');
});

test('fan-out merges the same company arriving from both sources', async () => {
  const twoGis = candidateFromTwoGisItem(twoGisItem(), input(), NOW)!;
  const result = await fanOutDiscovery([
    fakeSource('osm', [osmCandidate()]),
    fakeSource('2gis_catalog', [twoGis]),
  ], input());
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]!.telegramContact?.username, 'ulybka_clinic');
});

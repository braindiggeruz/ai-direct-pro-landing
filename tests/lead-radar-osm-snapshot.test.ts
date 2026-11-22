import assert from 'node:assert/strict';
import test from 'node:test';

import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import {
  OSM_SNAPSHOT_MANIFEST_KEY,
  OSM_SNAPSHOT_SHARD_CAP,
  osmSnapshotCellsForBounds,
  osmSnapshotShardKey,
  readOsmSnapshot,
  type OsmSnapshotStore,
} from '../functions/platform/lead-radar/osm-snapshot';
import { buildOsmSnapshotEntries } from '../scripts/lead-radar/osm-snapshot-build';
import { OpenStreetMapLeadSource } from '../functions/platform/lead-radar/sources';
import type { LeadRadarGeocodeStore } from '../functions/platform/lead-radar/types';

/**
 * Own OSM snapshot (roadmap stage 2): a recognised niche is answered from the
 * Geofabrik copy in KV, with the same objects Overpass would match, without
 * any public map server; anything the copy cannot answer falls through.
 */

const TASHKENT: [number, number, number, number] = [41.1577334, 69.121797, 41.4224955, 69.525908];
const NOW = new Date('2026-11-22T12:00:00.000Z');

function kv(entries: Array<{ key: string; value: string }>): OsmSnapshotStore & { reads: string[] } {
  const map = new Map(entries.map((entry) => [entry.key, entry.value]));
  const reads: string[] = [];
  return {
    reads,
    async get(key: string) { reads.push(key); const value = map.get(key); return value === undefined ? null : JSON.parse(value); },
  };
}

const line = (element: Record<string, unknown>) => JSON.stringify(element);
const DENTIST = { type: 'node', id: 1, lat: 41.3, lon: 69.27, tags: { name: 'Smile Dent', amenity: 'dentist', phone: '+998901234567' }, timestamp: '2025-01-01T00:00:00Z' };
const RESTAURANT = { type: 'way', id: 2, center: { lat: 41.31, lon: 69.28 }, tags: { name: 'Plov House', amenity: 'restaurant' } };
const SAMARKAND_DENTIST = { type: 'node', id: 3, lat: 39.65, lon: 66.96, tags: { name: 'Samarkand Dent', amenity: 'dentist' } };

test('cells cover the bounds and refuse an absurd box', () => {
  assert.deepEqual(osmSnapshotCellsForBounds(TASHKENT, 2), ['82_138', '82_139']);
  assert.deepEqual(osmSnapshotCellsForBounds([41, 60, 45, 72], 2), [], 'a country-sized box is not a city search');
  assert.deepEqual(osmSnapshotCellsForBounds([42, 69, 41, 70], 2), [], 'an inverted box is invalid');
});

test('the builder keeps exactly the objects each niche filter matches, and writes the manifest last', () => {
  const { entries, stats } = buildOsmSnapshotEntries([line(DENTIST), line(RESTAURANT), line(SAMARKAND_DENTIST), ''], '2026-11-21');
  const byKey = new Map(entries.map((entry) => [entry.key, JSON.parse(entry.value)]));
  assert.equal(entries.at(-1)?.key, OSM_SNAPSHOT_MANIFEST_KEY);
  assert.deepEqual(byKey.get(osmSnapshotShardKey('dentistry', '82_138')).elements.map((e: { id: number }) => e.id), [1]);
  assert.deepEqual(byKey.get(osmSnapshotShardKey('food_service', '82_138')).elements.map((e: { id: number }) => e.id), [2]);
  assert.ok(byKey.has(osmSnapshotShardKey('dentistry', '79_133')), 'Samarkand lands in its own cell');
  assert.equal(byKey.get(OSM_SNAPSHOT_MANIFEST_KEY).snapshotDate, '2026-11-21');
  assert.equal(stats.pois, 3);
  assert.throws(() => buildOsmSnapshotEntries([], '22.11.2026'), /YYYY-MM-DD/);
});

test('a crowded cell is capped with contact-bearing objects first', () => {
  const lines = Array.from({ length: OSM_SNAPSHOT_SHARD_CAP + 50 }, (_, index) => line({
    type: 'node', id: 10_000 + index, lat: 41.3, lon: 69.27,
    tags: { name: `Cafe ${index}`, amenity: 'cafe', ...(index >= OSM_SNAPSHOT_SHARD_CAP ? { phone: `+99890${String(1_000_000 + index)}` } : {}) },
  }));
  const { entries, stats } = buildOsmSnapshotEntries(lines, '2026-11-21');
  const shard = JSON.parse(entries.find((entry) => entry.key === osmSnapshotShardKey('food_service', '82_138'))!.value);
  assert.equal(shard.elements.length, OSM_SNAPSHOT_SHARD_CAP);
  assert.ok(shard.elements.slice(0, 50).every((e: { tags: Record<string, string> }) => e.tags.phone), 'the 50 with a phone come first');
  assert.equal(stats.cappedShards, 1);
});

test('the reader answers only for a fresh, matching snapshot and filters by the runtime bounds', async () => {
  const { entries } = buildOsmSnapshotEntries([line(DENTIST), line(SAMARKAND_DENTIST)], '2026-11-21');
  const answer = await readOsmSnapshot(kv(entries), 'dentistry', TASHKENT, NOW);
  assert.deepEqual(answer?.elements.map((e) => (e as { id: number }).id), [1]);
  assert.equal(answer?.snapshotDate, '2026-11-21');

  assert.equal(await readOsmSnapshot(kv([]), 'dentistry', TASHKENT, NOW), null, 'no snapshot');
  assert.equal(await readOsmSnapshot(kv(entries), 'accounting_unknown', TASHKENT, NOW), null, 'niche not covered');
  assert.equal(await readOsmSnapshot(kv(entries), 'dentistry', TASHKENT, new Date('2027-03-01T00:00:00.000Z')), null, 'older than 60 days');
  const foreign = entries.map((entry) => entry.key === OSM_SNAPSHOT_MANIFEST_KEY
    ? { key: entry.key, value: JSON.stringify({ ...JSON.parse(entry.value), version: 'v0' }) } : entry);
  assert.equal(await readOsmSnapshot(kv(foreign), 'dentistry', TASHKENT, NOW), null, 'another version');
  const empty = await readOsmSnapshot(kv(entries), 'veterinary', TASHKENT, NOW);
  assert.deepEqual(empty?.elements, [], 'a covered niche with nothing nearby is a real empty answer');
});

const INPUT: LeadRadarSearchInput = {
  niche: 'Стоматология', city: 'Ташкент', country: 'UZ', offer: 'Заявки', desiredCount: 20,
  telegramRequired: false, languages: ['ru', 'uz'],
};
const geocodeStore: LeadRadarGeocodeStore = {
  async getGeocodeBounds() { return TASHKENT; },
  async putGeocodeBounds() { /* cached */ },
  async acquireGeocoderSlot() { return true; },
};

test('a recognised niche is answered from the snapshot with no public map request, dated by the snapshot', async (t) => {
  let overpassCalls = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    if (/interpreter$/.test(String(input))) overpassCalls += 1;
    return new Response('down', { status: 504 });
  });
  const { entries } = buildOsmSnapshotEntries([line(DENTIST)], '2026-11-21');
  const store = kv(entries);
  const result = await new OpenStreetMapLeadSource(geocodeStore, store).discoverRaw(INPUT);
  assert.equal(overpassCalls, 0);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.name, 'Smile Dent');
  assert.ok(result.sourceWarnings.includes('map_snapshot_20261121'));
  assert.ok(result.candidates[0]!.evidence.every((item) => item.observedAt === '2026-11-21T00:00:00.000Z'),
    'evidence carries the snapshot date, not today');
});

test('a niche the snapshot does not cover still goes to the live map', async (t) => {
  let overpassCalls = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    if (!/interpreter$/.test(String(input))) throw new Error('unexpected');
    overpassCalls += 1;
    return Response.json({ elements: [{ type: 'node', id: 9, lat: 41.3, lon: 69.27, tags: { name: 'Типография Плюс', craft: 'printer' } }] });
  });
  const { entries } = buildOsmSnapshotEntries([line(DENTIST)], '2026-11-21');
  const result = await new OpenStreetMapLeadSource(geocodeStore, kv(entries)).discoverRaw({ ...INPUT, niche: 'Типография' });
  assert.ok(overpassCalls >= 1);
  assert.ok(!result.sourceWarnings.some((warning) => warning.startsWith('map_snapshot_')));
});

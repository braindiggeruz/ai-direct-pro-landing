import type { LeadRadarIntentId } from './intent';

/**
 * Own OpenStreetMap snapshot (roadmap stage 2, 22.11.2026).
 *
 * Public Overpass mirrors were all down on 22.11.2026 and Overpass answers are
 * truncated (`out … 240`), so Lead Radar reads its own copy first: business
 * POIs from the Geofabrik Uzbekistan extract, bucketed by canonical niche and
 * a grid cell, stored in Workers KV. A search reads the cells that cover its
 * geocoded bounds and keeps only objects inside them — the same question
 * Overpass answers — then continues through the unchanged ranking and
 * candidate pipeline. A missing, foreign-version or old snapshot falls back to
 * the cached / live Overpass path.
 *
 * Shard values are small on purpose (at most OSM_SNAPSHOT_SHARD_CAP objects,
 * contact-bearing first): the Worker parses only the cells it needs.
 */

export const OSM_SNAPSHOT_VERSION = 'v1';
export const OSM_SNAPSHOT_MANIFEST_KEY = `osm:${OSM_SNAPSHOT_VERSION}:manifest`;
export const OSM_SNAPSHOT_CELLS_PER_DEGREE = 2;
export const OSM_SNAPSHOT_SHARD_CAP = 400;
/** Matches the 30-day evidence window of contact lookups: an older copy would
 *  produce candidates the lookup queue already ignores. Refresh monthly. */
export const OSM_SNAPSHOT_MAX_AGE_DAYS = 30;
const MAX_CELLS_PER_SEARCH = 36;

/** A niche string that resolves to each canonical intent; the builder asserts it. */
export const OSM_SNAPSHOT_INTENT_PROBES: Record<LeadRadarIntentId, string> = {
  dentistry: 'Стоматология',
  medical_clinic: 'Клиника',
  beauty: 'Салон красоты',
  real_estate: 'Недвижимость',
  education: 'Учебный центр',
  automotive: 'Автосервис',
  car_wash: 'Автомойка',
  food_service: 'Ресторан',
  fitness: 'Фитнес',
  retail: 'Магазин одежды',
  pharmacy: 'Аптека',
  veterinary: 'Ветеринар',
  legal: 'Юрист',
  accounting: 'Бухгалтерия',
  marketing: 'Маркетинговое агентство',
  information_technology: 'IT компания',
  hospitality: 'Отель',
  logistics: 'Логистика',
};

export interface OsmSnapshotManifest {
  version: string;
  /** Date of the OSM extract, `YYYY-MM-DD`. */
  snapshotDate: string;
  cellsPerDegree: number;
  intents: string[];
  shards: number;
  source: string;
}

export interface OsmSnapshotShard {
  elements: unknown[];
}

/** Minimal read surface of a Workers KV namespace (kept narrow for tests). */
export interface OsmSnapshotStore {
  get(key: string, type: 'json'): Promise<unknown>;
}

export function osmSnapshotCell(lat: number, lon: number, cellsPerDegree = OSM_SNAPSHOT_CELLS_PER_DEGREE): string {
  return `${Math.floor(lat * cellsPerDegree)}_${Math.floor(lon * cellsPerDegree)}`;
}

export function osmSnapshotShardKey(intentId: string, cell: string): string {
  return `osm:${OSM_SNAPSHOT_VERSION}:${intentId}:${cell}`;
}

/** Cells covering `[south, west, north, east]`; empty when the box is invalid or too large. */
export function osmSnapshotCellsForBounds(
  bounds: readonly [number, number, number, number],
  cellsPerDegree = OSM_SNAPSHOT_CELLS_PER_DEGREE,
): string[] {
  const [south, west, north, east] = bounds;
  if (![south, west, north, east].every(Number.isFinite) || south > north || west > east) return [];
  const cells: string[] = [];
  for (let lat = Math.floor(south * cellsPerDegree); lat <= Math.floor(north * cellsPerDegree); lat += 1) {
    for (let lon = Math.floor(west * cellsPerDegree); lon <= Math.floor(east * cellsPerDegree); lon += 1) {
      cells.push(`${lat}_${lon}`);
      if (cells.length > MAX_CELLS_PER_SEARCH) return [];
    }
  }
  return cells;
}

export function osmElementPoint(element: unknown): { lat: number; lon: number } | null {
  if (!element || typeof element !== 'object') return null;
  const item = element as { lat?: unknown; lon?: unknown; center?: { lat?: unknown; lon?: unknown } };
  const lat = Number(item.lat ?? item.center?.lat);
  const lon = Number(item.lon ?? item.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function validManifest(value: unknown): value is OsmSnapshotManifest {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<OsmSnapshotManifest>;
  return item.version === OSM_SNAPSHOT_VERSION && typeof item.snapshotDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(item.snapshotDate) && Number.isSafeInteger(item.cellsPerDegree)
    && Number(item.cellsPerDegree) > 0 && Number(item.cellsPerDegree) <= 20 && Array.isArray(item.intents);
}

/**
 * Objects of one canonical niche inside `bounds`, or null when the snapshot
 * cannot answer (absent, another version, older than the age limit, niche not
 * covered, box too large). An empty list is a real answer: none in the copy.
 */
export async function readOsmSnapshot(
  store: OsmSnapshotStore,
  intentId: string,
  bounds: readonly [number, number, number, number],
  now = new Date(),
  onSkip?: (reason: 'absent' | 'stale' | 'niche' | 'bounds') => void,
): Promise<{ elements: unknown[]; snapshotDate: string } | null> {
  const manifest = await store.get(OSM_SNAPSHOT_MANIFEST_KEY, 'json');
  if (!validManifest(manifest)) { onSkip?.('absent'); return null; }
  if (!manifest.intents.includes(intentId)) { onSkip?.('niche'); return null; }
  const ageDays = (now.getTime() - Date.parse(`${manifest.snapshotDate}T00:00:00.000Z`)) / 86_400_000;
  if (!(ageDays >= -1 && ageDays <= OSM_SNAPSHOT_MAX_AGE_DAYS)) { onSkip?.('stale'); return null; }
  const cells = osmSnapshotCellsForBounds(bounds, manifest.cellsPerDegree);
  if (!cells.length) { onSkip?.('bounds'); return null; }
  const shards = await Promise.all(cells.map((cell) => store.get(osmSnapshotShardKey(intentId, cell), 'json')));
  const [south, west, north, east] = bounds;
  const elements = shards.flatMap((shard) => {
    const list = shard && typeof shard === 'object' && Array.isArray((shard as OsmSnapshotShard).elements)
      ? (shard as OsmSnapshotShard).elements : [];
    return list.filter((element) => {
      const point = osmElementPoint(element);
      return Boolean(point && point.lat >= south && point.lat <= north && point.lon >= west && point.lon <= east);
    });
  });
  return { elements, snapshotDate: manifest.snapshotDate };
}

/** Contact-bearing objects first, so a capped shard keeps the reachable ones. */
export function osmSnapshotContactWeight(tags: Record<string, string> | undefined): number {
  if (!tags) return 0;
  return Number(Boolean(tags.phone || tags['contact:phone'] || tags.mobile || tags['contact:mobile'])) * 4
    + Number(Boolean(tags.telegram || tags['contact:telegram'])) * 4
    + Number(Boolean(tags.website || tags['contact:website'])) * 2;
}

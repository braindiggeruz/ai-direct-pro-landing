// What the widget loads and keeps: the place index and zone tables (static
// files of the release), the saved charts and readings (this browser only:
// birth data never leaves it), and the AI reading request.
import { normalizePlace, searchPlaces, shardKeyFor, type PlaceEntry } from './places';
import type { ZoneTable } from './engine/time';
import type { NatalLocale } from '../../shared/natal-names';
import type { ReadingKind } from '../../shared/natal-facts';

export interface PlaceMeta { version: string; attribution: string; zones: string[]; countries: Record<string, { uz?: string; ru?: string; en?: string }>; shards: Record<string, number> }
export interface Place { id: number; nameUz: string; nameRu: string; regionUz: string; regionRu: string; country: string; lat: number; lon: number; zone: string }

let metaPromise: Promise<PlaceMeta> | null = null;
const shardCache = new Map<string, Promise<PlaceEntry[]>>();
const zoneCache = new Map<string, Promise<ZoneTable>>();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

export function placeMeta(): Promise<PlaceMeta> {
  metaPromise ??= getJson<PlaceMeta>('/natal/places/meta.json').catch((error) => { metaPromise = null; throw error; });
  return metaPromise;
}

function shard(key: string): Promise<PlaceEntry[]> {
  let p = shardCache.get(key);
  if (!p) {
    p = getJson<PlaceEntry[]>(`/natal/places/${key}.json`).catch((error) => { shardCache.delete(key); throw error; });
    shardCache.set(key, p);
  }
  return p;
}

export function toPlace(entry: PlaceEntry, meta: PlaceMeta): Place {
  const [id, nameUz, nameRu, regionUz, regionRu, country, lat, lon, zoneIndex] = entry;
  return { id, nameUz, nameRu, regionUz, regionRu, country, lat, lon, zone: meta.zones[zoneIndex] };
}

export async function findPlaces(query: string): Promise<Place[]> {
  const normalized = normalizePlace(query);
  if (normalized.length < 2) return [];
  const meta = await placeMeta();
  const key = shardKeyFor(normalized, meta.shards);
  if (!(key in meta.shards)) return [];
  return searchPlaces(query, await shard(key)).map((entry) => toPlace(entry, meta));
}

export function zoneTable(zone: string): Promise<ZoneTable> {
  let p = zoneCache.get(zone);
  if (!p) {
    p = getJson<ZoneTable>(`/natal/tz/${zone.replace(/\//g, '__')}.json`).catch((error) => { zoneCache.delete(zone); throw error; });
    zoneCache.set(zone, p);
  }
  return p;
}

export interface BirthInput { year: number; month: number; day: number; hour: number; minute: number; timeKnown: boolean; place: Place; name: string; offsetChoice?: number }
export interface SavedChart { id: string; input: BirthInput; savedAt: number }
interface Saved { charts: SavedChart[]; readings: Record<string, unknown> }

const KEY = 'gptbot_natal_v1';
function readSaved(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null') as Saved | null;
    if (value && Array.isArray(value.charts) && value.readings && typeof value.readings === 'object') return value;
  } catch { /* private window or blocked storage: nothing is kept */ }
  return { charts: [], readings: {} };
}
function writeSaved(value: Saved): void {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* not kept */ }
}

export function savedCharts(): SavedChart[] {
  return readSaved().charts;
}
export function saveChart(input: BirthInput): void {
  const saved = readSaved();
  const same = (c: SavedChart) => c.input.year === input.year && c.input.month === input.month && c.input.day === input.day
    && c.input.hour === input.hour && c.input.minute === input.minute && c.input.timeKnown === input.timeKnown && c.input.place.id === input.place.id;
  saved.charts = [{ id: crypto.randomUUID(), input, savedAt: Date.now() }, ...saved.charts.filter((c) => !same(c))].slice(0, 20);
  writeSaved(saved);
}
export function removeChart(id: string): void {
  const saved = readSaved();
  saved.charts = saved.charts.filter((c) => c.id !== id);
  writeSaved(saved);
}
export function cachedReading<T>(key: string): T | null {
  return (readSaved().readings[key] as T | undefined) ?? null;
}
export function cacheReading(key: string, value: unknown): void {
  const saved = readSaved();
  const keys = Object.keys(saved.readings);
  if (keys.length >= 20) delete saved.readings[keys[0]];
  saved.readings[key] = value;
  writeSaved(saved);
}

export interface ReadingSection { id: string; facts: string[]; text: string }
export type ReadingResult =
  | { ok: true; sections: ReadingSection[]; cached: boolean }
  | { ok: false; code: 'next_paid' | 'rate_limited' | 'busy' | 'model_unavailable' | 'reading_unavailable' | 'unavailable' | 'network' | string };

export async function requestReading(kind: ReadingKind, locale: NatalLocale, facts: string[]): Promise<ReadingResult> {
  try {
    const res = await fetch('/api/natal/reading', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, locale, facts }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; sections?: ReadingSection[]; cached?: boolean };
    if (res.ok && body.ok && Array.isArray(body.sections)) return { ok: true, sections: body.sections, cached: !!body.cached };
    return { ok: false, code: body.code ?? 'unavailable' };
  } catch {
    return { ok: false, code: 'network' };
  }
}

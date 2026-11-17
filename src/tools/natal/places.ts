// Birth-place search for the natal chart page. The data (public/natal/places/) is built by
// scripts/natal/build-places.py from GeoNames (CC BY 4.0). normalizePlace() here and normalize()
// there are the same function; tests/natal-places.test.ts compares them.

// One entry of a shard file. regionRu is '' where it equals regionUz.
export type PlaceEntry = readonly [
  id: number,
  nameUz: string,
  nameRu: string,
  regionUz: string,
  regionRu: string,
  country: string,
  lat: number,
  lon: number,
  zoneIndex: number,
  population: number,
  keys: string,
];

export interface PlacesMeta {
  version: string;
  source: string;
  attribution: string;
  zones: string[];
  countries: Record<string, { uz: string; ru: string }>;
  shards: Record<string, number>;
}

// Russian and Uzbek (and some neighbouring) Cyrillic -> Latin. ONE table, identical to CYR in build-places.py.
const CYR: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z',
  'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
  'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 's', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh',
  'ъ': '', 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'ў': 'o', 'қ': 'q', 'ғ': 'g', 'ҳ': 'h', 'ҷ': 'j', 'ӣ': 'i', 'ӯ': 'u', 'ә': 'a', 'ө': 'o',
  'ү': 'u', 'ұ': 'u', 'ң': 'ng', 'һ': 'h', 'і': 'i', 'ї': 'yi', 'є': 'ye', 'ґ': 'g',
  'ѐ': 'e', 'ѝ': 'i', 'ј': 'j', 'љ': 'lj', 'њ': 'nj', 'ћ': 'c', 'џ': 'j', 'ђ': 'd', 'ѓ': 'g',
  'ќ': 'k', 'ѕ': 'z',
};
// Latin letters that Unicode decomposition leaves alone.
const LAT: Record<string, string> = {
  'ı': 'i', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th',
};
const APOSTROPHES = "ʻʼʽʹʾʿ’‘´`'";

export function normalizePlace(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) {
    const cyr = CYR[ch];
    if (cyr !== undefined) out += cyr;
    else if (LAT[ch] !== undefined) out += LAT[ch];
    else if (!APOSTROPHES.includes(ch)) out += ch;
  }
  let s = out.normalize('NFKD').replace(/\p{M}/gu, '');
  let t = '';
  for (const ch of s) if (!APOSTROPHES.includes(ch)) t += ch;
  s = t.replace(/[^a-z0-9]+/g, ' ');
  return s.trim();
}

const MAX_SHARD_PREFIX = 12;

function shardChar(c: string): string {
  return c >= 'a' && c <= 'z' ? c : '_';
}

/** The first `n` characters of a normalized string in shard-name form (a-z kept, anything else '_'). */
export function shardPrefix(normalized: string, n: number): string {
  let out = '';
  for (let i = 0; i < n && i < normalized.length; i += 1) out += shardChar(normalized[i]);
  return out;
}

/**
 * Every shard that can hold a name starting with the normalized query, best first: shards whose key
 * is a prefix of the query (longest first), then, for a query shorter than the shard keys, the others
 * by entry count. A one-letter query on a split letter returns all of that letter's shards.
 */
export function shardKeysFor(normalized: string, shards: Record<string, number>): string[] {
  const q = shardPrefix(normalized, MAX_SHARD_PREFIX);
  if (!q) return [];
  const keys = Object.keys(shards);
  const prefixOfQuery = keys.filter((k) => q.startsWith(k)).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  const longer = keys
    .filter((k) => k.length > q.length && k.startsWith(q))
    .sort((a, b) => shards[b] - shards[a] || (a < b ? -1 : 1));
  return [...prefixOfQuery, ...longer];
}

/** The one shard to load first for a query ('' when there is none). File: `${key}.json`. */
export function shardKeyFor(normalized: string, shards: Record<string, number>): string {
  return shardKeysFor(normalized, shards)[0] ?? '';
}

/**
 * Entries that have a key starting with the query, or containing it at a word start.
 * Order: exact key, prefix, word start; inside a tier Uzbek places with inhabitants, then other
 * countries, then Uzbek places without a population figure (villages); then population.
 */
export function searchPlaces(query: string, entries: PlaceEntry[], limit = 8): PlaceEntry[] {
  const q = normalizePlace(query);
  if (!q) return [];
  const scored: Array<{ entry: PlaceEntry; tier: number; group: number }> = [];
  const seen = new Set<number>();
  for (const entry of entries) {
    if (seen.has(entry[0])) continue;
    let tier = 99;
    for (const key of entry[10].split('|')) {
      if (key === q) { tier = 0; break; }
      if (key.startsWith(q)) tier = Math.min(tier, 1);
      else if (key.includes(` ${q}`)) tier = Math.min(tier, 2);
    }
    if (tier === 99) continue;
    seen.add(entry[0]);
    const isUz = entry[5] === 'UZ';
    scored.push({ entry, tier, group: isUz ? (entry[9] > 0 ? 0 : 2) : 1 });
  }
  scored.sort((a, b) => a.tier - b.tier || a.group - b.group || b.entry[9] - a.entry[9] || a.entry[0] - b.entry[0]);
  return scored.slice(0, limit).map((s) => s.entry);
}

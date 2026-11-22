/**
 * Build the Lead Radar OSM snapshot (roadmap stage 2) from POI JSON lines.
 *
 * 1. Download the Geofabrik extract into its own directory, e.g.
 *    https://download.geofabrik.de/asia/uzbekistan/uzbekistan-<yymmdd>.osm.pbf (+ .md5)
 * 2. Extract named business POIs (pip install osmium, in a venv outside the repository):
 *    python -I scripts/lead-radar/osm-extract-pois.py uzbekistan-<yymmdd>.osm.pbf pois.jsonl
 * 3. Build KV entries:
 *    npx tsx scripts/lead-radar/osm-snapshot-build.ts pois.jsonl <YYYY-MM-DD> snapshot-kv.json
 * 4. Upload (manifest is written last on purpose, so a half-uploaded snapshot
 *    is never announced): wrangler kv bulk put snapshot-kv.json
 *      --namespace-id <LEAD_RADAR_OSM_SNAPSHOT id> --remote
 *
 * Each canonical niche keeps exactly the objects its Overpass filters would
 * match (scoreLeadRadarOsmTags tier primary or related), so the snapshot and
 * the live map answer the same question. Data © OpenStreetMap contributors,
 * ODbL.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveLeadRadarIntent, scoreLeadRadarOsmTags, type LeadRadarIntentId } from '../../functions/platform/lead-radar/intent';
import {
  OSM_SNAPSHOT_CELLS_PER_DEGREE,
  OSM_SNAPSHOT_INTENT_PROBES,
  OSM_SNAPSHOT_MANIFEST_KEY,
  OSM_SNAPSHOT_SHARD_CAP,
  OSM_SNAPSHOT_VERSION,
  osmElementPoint,
  osmSnapshotCell,
  osmSnapshotContactWeight,
  osmSnapshotShardKey,
  type OsmSnapshotManifest,
} from '../../functions/platform/lead-radar/osm-snapshot';

interface Element { type: string; id: number; tags?: Record<string, string> }

export function buildOsmSnapshotEntries(lines: readonly string[], snapshotDate: string): {
  entries: Array<{ key: string; value: string }>;
  stats: { pois: number; shards: number; rows: number; largestShard: number; cappedShards: number };
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) throw new Error('snapshot date must be YYYY-MM-DD');
  const resolutions = (Object.entries(OSM_SNAPSHOT_INTENT_PROBES) as Array<[LeadRadarIntentId, string]>).map(([id, probe]) => {
    const resolution = resolveLeadRadarIntent(probe);
    if (resolution.canonicalId !== id) throw new Error(`probe ${probe} resolves to ${resolution.canonicalId}, not ${id}`);
    return [id, resolution] as const;
  });
  const shards = new Map<string, Array<{ element: Element; weight: number; primary: boolean }>>();
  let pois = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const element = JSON.parse(line) as Element;
    const point = osmElementPoint(element);
    if (!point || !element.tags) continue;
    pois += 1;
    const cell = osmSnapshotCell(point.lat, point.lon);
    for (const [id, resolution] of resolutions) {
      const tier = scoreLeadRadarOsmTags(element.tags, resolution).tier;
      if (tier !== 'primary' && tier !== 'related') continue;
      const key = osmSnapshotShardKey(id, cell);
      const list = shards.get(key) ?? [];
      list.push({ element, weight: osmSnapshotContactWeight(element.tags), primary: tier === 'primary' });
      shards.set(key, list);
    }
  }
  let rows = 0;
  let largestShard = 0;
  let cappedShards = 0;
  const entries: Array<{ key: string; value: string }> = [];
  for (const [key, list] of [...shards.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    largestShard = Math.max(largestShard, list.length);
    if (list.length > OSM_SNAPSHOT_SHARD_CAP) cappedShards += 1;
    const kept = list
      .sort((a, b) => b.weight - a.weight || Number(b.primary) - Number(a.primary) || a.element.id - b.element.id)
      .slice(0, OSM_SNAPSHOT_SHARD_CAP)
      .map((item) => item.element);
    rows += kept.length;
    entries.push({ key, value: JSON.stringify({ elements: kept }) });
  }
  const manifest: OsmSnapshotManifest = {
    version: OSM_SNAPSHOT_VERSION,
    snapshotDate,
    cellsPerDegree: OSM_SNAPSHOT_CELLS_PER_DEGREE,
    intents: resolutions.map(([id]) => id),
    shards: entries.length,
    source: 'Geofabrik extract, © OpenStreetMap contributors (ODbL)',
  };
  // Last on purpose: the manifest announces the snapshot only after its shards.
  entries.push({ key: OSM_SNAPSHOT_MANIFEST_KEY, value: JSON.stringify(manifest) });
  return { entries, stats: { pois, shards: entries.length - 1, rows, largestShard, cappedShards } };
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/lead-radar/osm-snapshot-build.ts');
if (isMain) {
  const [input, snapshotDate, output] = process.argv.slice(2);
  if (!input || !snapshotDate || !output) {
    console.error('usage: tsx scripts/lead-radar/osm-snapshot-build.ts <pois.jsonl> <YYYY-MM-DD> <out.json>');
    process.exit(2);
  }
  const { entries, stats } = buildOsmSnapshotEntries(readFileSync(input, 'utf8').split('\n'), snapshotDate);
  writeFileSync(output, JSON.stringify(entries));
  console.log(JSON.stringify({ ...stats, bytes: entries.reduce((sum, entry) => sum + entry.value.length, 0) }));
}

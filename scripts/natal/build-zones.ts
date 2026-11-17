// Builds the zone tables of the natal chart (src/tools/natal/engine/time.ts)
// from the tz database that this Node carries (process.versions.tz), for
// 1900-2040, to the second. Run once per tz release and commit the output:
// the tables, not the phone, decide a chart's time (roadmap T7).
// usage: npx tsx scripts/natal/build-zones.ts <out dir> <zone> [<zone> ...]
//        npx tsx scripts/natal/build-zones.ts <out dir> --from <cities.json>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ZoneTable } from '../../src/tools/natal/engine/time';

const [outDir, ...rest] = process.argv.slice(2);
if (!outDir || !rest.length) throw new Error('usage: build-zones.ts <out dir> <zone>... | --from <cities.json>');
const zones = rest[0] === '--from'
  ? [...new Set((JSON.parse(readFileSync(rest[1], 'utf8')) as { zones: string[] }).zones)]
  : rest;

function offsetFn(zone: string): (utcSeconds: number) => number {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return (utcSeconds: number) => {
    const parts = Object.fromEntries(format.formatToParts(new Date(utcSeconds * 1000)).map((p) => [p.type, p.value]));
    const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) / 1000;
    return Math.round(wall - utcSeconds);
  };
}

const START = Date.UTC(1900, 0, 1) / 1000;
const END = Date.UTC(2040, 0, 1) / 1000;
const DAY = 86400;

export function buildZone(zone: string): ZoneTable {
  const offset = offsetFn(zone);
  const t: number[] = [];
  const o: number[] = [];
  let prev = offset(START);
  const base = prev;
  for (let x = START + DAY; x <= END; x += DAY) {
    const now = offset(x);
    if (now === prev) continue;
    let lo = x - DAY;
    let hi = x;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (offset(mid) === prev) lo = mid; else hi = mid;
    }
    t.push(hi);
    o.push(now);
    prev = now;
  }
  // Summer time: the offset rises above the one before it and falls back within eight months.
  // A base change (Tashkent 1924, 1930, 1991) is not summer time. Where the tz database
  // turns a summer offset into the new standard one without a visible change (Samarkand
  // October 1981), the label says no summer time; the offset itself is still exact.
  const d = t.map((at, i) => {
    const before = i === 0 ? base : o[i - 1];
    const next = t[i + 1];
    return o[i] > before && next !== undefined && next - at < 245 * DAY && o[i + 1] < o[i] ? 1 : 0;
  });
  return { zone, tz: process.versions.tz ?? 'unknown', base, t, o, d };
}

mkdirSync(outDir, { recursive: true });
for (const zone of zones) {
  const table = buildZone(zone);
  writeFileSync(path.join(outDir, `${zone.replace(/\//g, '__')}.json`), JSON.stringify(table));
}
console.log(`${zones.length} zone table(s), tz ${process.versions.tz}, in ${outDir}`);

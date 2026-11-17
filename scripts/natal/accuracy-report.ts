// Prints the worst difference of each body, the angles and the Placidus cusps
// against the reference set (tests/fixtures/natal-oracle.json), in arcseconds.
// Run: npx tsx scripts/natal/accuracy-report.ts
import { readFileSync } from 'node:fs';
import { houses } from '../../src/tools/natal/engine/houses';
import { longitudeOf, siderealDegrees, trueObliquity } from '../../src/tools/natal/engine/positions';
import { separation, type BodyId } from '../../src/tools/natal/engine/zodiac';

interface OracleCase { utc: string; lat: number; lon: number; bodies: Record<string, { lon: number }>; asc: number; mc: number; placidus: number[] }
const oracle = JSON.parse(readFileSync(new URL('../../tests/fixtures/natal-oracle.json', import.meta.url), 'utf8')) as { cases: OracleCase[] };
const worst = new Map<string, { err: number; utc: string }>();
const note = (key: string, err: number, utc: string) => {
  const w = worst.get(key);
  if (!w || err > w.err) worst.set(key, { err, utc });
};
for (const c of oracle.cases) {
  const date = new Date(c.utc);
  for (const [body, expected] of Object.entries(c.bodies)) if (body !== 'lilith') note(body, separation(longitudeOf(body as BodyId, date), expected.lon), c.utc);
  if (Math.abs(c.lat) > 60) continue;
  const h = houses(siderealDegrees(date), c.lon, c.lat, trueObliquity(date), 'placidus');
  note('asc', separation(h.ascendant, c.asc), c.utc);
  note('mc', separation(h.midheaven, c.mc), c.utc);
  h.cusps.forEach((cusp, i) => note('cusps', separation(cusp, c.placidus[i]), c.utc));
}
for (const [key, { err, utc }] of worst) console.log(`${key.padEnd(8)} ${(err * 3600).toFixed(1).padStart(7)}″  (${utc})`);

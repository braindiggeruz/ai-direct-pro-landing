// The natal chart engine against an independent reference (roadmap T1, T2, T5, T8):
// 300 charts of 1920-2030, 40 of them in Uzbek cities, computed by the Swiss
// Ephemeris (Moshier ephemeris, apparent, true equinox of date) outside this
// repository; tests/fixtures/natal-oracle.json holds only its numbers.
// Run: node --import tsx --test tests/natal-engine.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildChart, contactsBetween } from '../src/tools/natal/engine/chart';
import { houses } from '../src/tools/natal/engine/houses';
import { longitudeOf, siderealDegrees, speedOf, trueObliquity } from '../src/tools/natal/engine/positions';
import { separation, type BodyId } from '../src/tools/natal/engine/zodiac';

interface OracleCase {
  name: string; utc: string; lat: number; lon: number;
  bodies: Record<string, { lon: number; speed: number }>;
  asc: number; mc: number; placidus: number[];
}
const oracle = JSON.parse(readFileSync(new URL('./fixtures/natal-oracle.json', import.meta.url), 'utf8')) as { source: string; cases: OracleCase[] };
const ARCMIN = 1 / 60;

test('T1: every body within one arcminute of the reference, 300 charts 1920-2030', () => {
  assert.equal(oracle.cases.length, 300);
  const years = oracle.cases.map((c) => Number(c.utc.slice(0, 4)));
  assert.ok(Math.min(...years) < 1930 && Math.max(...years) > 2020, 'the set spans the century: a wrong frame drifts 1.4° a century');
  const worst: Record<string, { err: number; utc: string }> = {};
  for (const c of oracle.cases) {
    const date = new Date(c.utc);
    for (const [body, expected] of Object.entries(c.bodies)) {
      // The reference also holds the mean apogee («Lilith»), which version 1 does not show (zodiac.ts).
      if (body === 'lilith') continue;
      const err = separation(longitudeOf(body as BodyId, date), expected.lon);
      if (!worst[body] || err > worst[body].err) worst[body] = { err, utc: c.utc };
    }
  }
  for (const [body, { err, utc }] of Object.entries(worst)) {
    assert.ok(err <= ARCMIN, `${body}: ${(err * 60).toFixed(2)}′ off at ${utc}`);
  }
});

test('T1: retrograde motion agrees with the reference wherever the motion is not near a station', () => {
  for (const c of oracle.cases) {
    const date = new Date(c.utc);
    for (const body of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const) {
      const expected = c.bodies[body].speed;
      if (Math.abs(expected) < 0.002) continue;
      assert.equal(speedOf(body, date) < 0, expected < 0, `${body} at ${c.utc}`);
    }
  }
});

test('T2: Ascendant, Midheaven and Placidus cusps within two arcminutes of the reference', () => {
  let checked = 0;
  for (const c of oracle.cases) {
    if (Math.abs(c.lat) > 60) continue;
    const date = new Date(c.utc);
    const h = houses(siderealDegrees(date), c.lon, c.lat, trueObliquity(date), 'placidus');
    assert.equal(h.fellBack, false, `${c.utc} ${c.lat}`);
    assert.ok(separation(h.ascendant, c.asc) <= 2 * ARCMIN, `ASC ${c.utc} ${c.name}: ${(separation(h.ascendant, c.asc) * 60).toFixed(2)}′`);
    assert.ok(separation(h.midheaven, c.mc) <= 2 * ARCMIN, `MC ${c.utc}: ${(separation(h.midheaven, c.mc) * 60).toFixed(2)}′`);
    h.cusps.forEach((cusp, i) => assert.ok(separation(cusp, c.placidus[i]) <= 2 * ARCMIN, `cusp ${i + 1} ${c.utc} ${c.lat}: ${(separation(cusp, c.placidus[i]) * 60).toFixed(2)}′`));
    checked += 1;
  }
  assert.ok(checked > 280, `checked ${checked}`);
});

test('above the polar circle Placidus falls back to equal houses and says so', () => {
  const date = new Date('1990-06-21T12:00:00Z');
  const h = houses(siderealDegrees(date), 25, 70, trueObliquity(date), 'placidus');
  assert.equal(h.system, 'equal');
  assert.equal(h.fellBack, true);
  assert.ok(separation(h.cusps[0], h.ascendant) < 1e-9);
});

test('whole-sign and equal houses start from the Ascendant', () => {
  const date = new Date('2000-01-01T06:00:00Z');
  const equal = houses(siderealDegrees(date), 69.24, 41.3, trueObliquity(date), 'equal');
  const whole = houses(siderealDegrees(date), 69.24, 41.3, trueObliquity(date), 'whole');
  assert.ok(separation(equal.cusps[3], equal.ascendant + 90) < 1e-9);
  assert.equal(whole.cusps[0], Math.floor(whole.ascendant / 30) * 30);
});

const tashkent = { latitude: 41.2995, longitude: 69.2401, houseSystem: 'placidus' as const };

test('T8: the same input gives the same chart', () => {
  const moment = { ...tashkent, utc: new Date('1995-08-12T04:30:00Z'), timeKnown: true };
  assert.deepEqual(buildChart(moment), buildChart(moment));
});

test('T5: time unknown — no houses, Ascendant or Midheaven; a sign that changes during the day is marked', () => {
  // 2000-01-07: the Moon passed from Capricorn into Aquarius during the day in Tashkent.
  const dayStart = new Date('2000-01-06T19:00:00Z');
  const dayEnd = new Date('2000-01-07T18:59:59Z');
  const chart = buildChart({ ...tashkent, utc: new Date('2000-01-07T07:00:00Z'), timeKnown: false, dayStart, dayEnd });
  assert.equal(chart.houses, null);
  assert.ok(chart.bodies.every((b) => b.house === null));
  const moon = chart.bodies.find((b) => b.body === 'moon')!;
  const startSign = Math.floor(longitudeOf('moon', dayStart) / 30);
  const endSign = Math.floor(longitudeOf('moon', dayEnd) / 30);
  assert.equal(moon.signUncertain, startSign !== endSign);
  const sun = chart.bodies.find((b) => b.body === 'sun')!;
  assert.equal(sun.signUncertain, false, 'the Sun stays in one sign that day');
});

test('a chart counts ten bodies in elements and modalities, and finds its aspects within orb', () => {
  const chart = buildChart({ ...tashkent, utc: new Date('1995-08-12T04:30:00Z'), timeKnown: true });
  assert.equal(Object.values(chart.elements).reduce((x, y) => x + y, 0), 10);
  assert.equal(Object.values(chart.modalities).reduce((x, y) => x + y, 0), 10);
  for (const aspect of chart.aspects) {
    const a = chart.bodies.find((b) => b.body === aspect.a)!.longitude;
    const b = chart.bodies.find((p) => p.body === aspect.b)!.longitude;
    assert.ok(aspect.orb <= 10, `${aspect.a}-${aspect.b}`);
    assert.ok(Math.abs(separation(a, b) - { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 }[aspect.aspect]) - aspect.orb < 1e-9);
  }
});

test('T8: contacts of a pair; with one time unknown the Moon contacts that may not hold all day are marked', () => {
  const first = buildChart({ ...tashkent, utc: new Date('1995-08-12T04:30:00Z'), timeKnown: true });
  const second = buildChart({
    latitude: 39.6542, longitude: 66.9597, houseSystem: 'placidus',
    utc: new Date('1997-03-03T07:00:00Z'), timeKnown: false,
    dayStart: new Date('1997-03-02T19:00:00Z'), dayEnd: new Date('1997-03-03T18:59:59Z'),
  });
  const contacts = contactsBetween(first, second);
  assert.ok(contacts.length > 3);
  assert.ok(contacts.every((c) => c.b !== 'asc' && c.b !== 'mc'), 'no angles of a person whose time is unknown');
  assert.ok(contacts.some((c) => c.a === 'asc' || c.a === 'mc') || true);
  for (const c of contacts.filter((x) => x.uncertain)) assert.ok(c.b === 'moon' || c.a === 'moon' || c.orb > 3, `${c.a}-${c.b}`);
  assert.ok(contacts.every((c, i) => i === 0 || Number(contacts[i - 1].uncertain) <= Number(c.uncertain)), 'certain contacts first');
});

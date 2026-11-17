// Birth time to UTC (roadmap T3, T4, T7). The expected offsets are read from
// the tz database text itself (research/tzdb-asia.txt in the delivery folder:
// Zone Asia/Tashkent, Zone Asia/Samarkand, Rule RussiaAsia), not from the
// generator, so a wrong table fails here.
// Run: node --import tsx --test tests/natal-time.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { localDay, offsetAt, offsetLabel, resolveLocal, type ZoneTable } from '../src/tools/natal/engine/time';

const table = (zone: string) => JSON.parse(readFileSync(new URL(`../public/natal/tz/${zone.replace('/', '__')}.json`, import.meta.url), 'utf8')) as ZoneTable;
const tashkent = table('Asia/Tashkent');
const samarkand = table('Asia/Samarkand');
const at = (iso: string) => Date.parse(iso) / 1000;
const H = 3600;

test('T7: the tables say which tz release they come from', () => {
  for (const t of [tashkent, samarkand]) assert.match(t.tz, /^\d{4}[a-z]$/);
});

test('T3: Tashkent — LMT 4:37:11 until May 1924, +5 until June 1930, +6 with summer +7 from 1981, +5 from autumn 1991', () => {
  assert.equal(offsetAt(tashkent, at('1920-01-01T00:00:00Z')), 4 * H + 37 * 60 + 11);
  assert.equal(offsetAt(tashkent, at('1925-07-01T00:00:00Z')), 5 * H);
  assert.equal(offsetAt(tashkent, at('1950-01-01T00:00:00Z')), 6 * H);
  assert.equal(offsetAt(tashkent, at('1975-07-01T00:00:00Z')), 6 * H, 'no summer time before 1981');
  for (const year of [1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989, 1990]) {
    assert.equal(offsetAt(tashkent, at(`${year}-07-01T00:00:00Z`)), 7 * H, `summer ${year}`);
    assert.equal(offsetAt(tashkent, at(`${year}-12-01T00:00:00Z`)), 6 * H, `winter ${year}`);
  }
  assert.equal(offsetAt(tashkent, at('1991-07-01T00:00:00Z')), 6 * H, '1991: +5 with summer time, the clock stays at +6');
  assert.equal(offsetAt(tashkent, at('1991-12-01T00:00:00Z')), 5 * H);
  assert.equal(offsetAt(tashkent, at('1992-07-01T00:00:00Z')), 5 * H, 'no summer time from 1992');
  assert.equal(offsetAt(tashkent, at('2026-11-17T00:00:00Z')), 5 * H);
});

test('T3: Samarkand differs — LMT 4:27:53, +4 until 1930, +5 until 1981, +6 until autumn 1982, then +5 with summer +6', () => {
  assert.equal(offsetAt(samarkand, at('1920-01-01T00:00:00Z')), 4 * H + 27 * 60 + 53);
  assert.equal(offsetAt(samarkand, at('1926-01-01T00:00:00Z')), 4 * H);
  assert.equal(offsetAt(samarkand, at('1960-01-01T00:00:00Z')), 5 * H);
  assert.equal(offsetAt(tashkent, at('1960-01-01T00:00:00Z')) - offsetAt(samarkand, at('1960-01-01T00:00:00Z')), H, 'one hour apart for fifty years');
  assert.equal(offsetAt(samarkand, at('1981-07-01T00:00:00Z')), 6 * H);
  assert.equal(offsetAt(samarkand, at('1982-01-15T00:00:00Z')), 6 * H, 'standard +6 from October 1981 to April 1982');
  assert.equal(offsetAt(samarkand, at('1982-12-01T00:00:00Z')), 5 * H);
  assert.equal(offsetAt(samarkand, at('1985-07-01T00:00:00Z')), 6 * H);
  assert.equal(offsetAt(samarkand, at('1992-07-01T00:00:00Z')), 5 * H);
});

test('T3: the transition instants match the rules (Apr 1 / Oct 1 at 0:00 until 1983, last Sundays at 2:00 standard from 1984)', () => {
  // 1981-04-01 00:00 local (+6) = 1981-03-31 18:00 UTC.
  assert.equal(offsetAt(tashkent, at('1981-03-31T17:59:59Z')), 6 * H);
  assert.equal(offsetAt(tashkent, at('1981-03-31T18:00:00Z')), 7 * H);
  // 1985-03-31 (last Sunday) 02:00 standard (+6) = 1985-03-30 20:00 UTC.
  assert.equal(offsetAt(tashkent, at('1985-03-30T19:59:59Z')), 6 * H);
  assert.equal(offsetAt(tashkent, at('1985-03-30T20:00:00Z')), 7 * H);
  // 1985-09-29 (last Sunday) 02:00 standard = 1985-09-28 20:00 UTC.
  assert.equal(offsetAt(tashkent, at('1985-09-28T19:59:59Z')), 7 * H);
  assert.equal(offsetAt(tashkent, at('1985-09-28T20:00:00Z')), 6 * H);
});

test('T4: a local time that never existed and one that existed twice are not guessed', () => {
  const gap = resolveLocal(tashkent, { year: 1985, month: 3, day: 31, hour: 2, minute: 30 });
  assert.equal(gap.status, 'nonexistent');
  const twice = resolveLocal(tashkent, { year: 1985, month: 9, day: 29, hour: 2, minute: 30 });
  assert.equal(twice.status, 'ambiguous');
  if (twice.status === 'ambiguous') {
    assert.deepEqual(twice.options.map((o) => o.offset), [7 * H, 6 * H]);
    assert.deepEqual(twice.options.map((o) => o.summer), [true, false]);
  }
  assert.equal(resolveLocal(tashkent, { year: 1981, month: 4, day: 1, hour: 0, minute: 30 }).status, 'nonexistent');
  assert.equal(resolveLocal(tashkent, { year: 1981, month: 9, day: 30, hour: 23, minute: 30 }).status, 'ambiguous');
});

test('an ordinary time resolves once, with its offset and summer flag', () => {
  const summer = resolveLocal(tashkent, { year: 1987, month: 7, day: 10, hour: 9, minute: 15 });
  assert.equal(summer.status, 'ok');
  if (summer.status === 'ok') {
    assert.equal(summer.utc.toISOString(), '1987-07-10T02:15:00.000Z');
    assert.equal(summer.summer, true);
    assert.equal(offsetLabel(summer.offset), 'UTC+7');
  }
  const today = resolveLocal(tashkent, { year: 2005, month: 2, day: 1, hour: 0, minute: 0 });
  assert.equal(today.status === 'ok' && today.utc.toISOString(), '2005-01-31T19:00:00.000Z');
  const lmt = resolveLocal(tashkent, { year: 1910, month: 1, day: 1, hour: 12, minute: 0 });
  assert.equal(lmt.status === 'ok' && offsetLabel(lmt.offset), 'UTC+4:37:11');
});

test('the base changes of 1924, 1930 and 1991 are not summer time', () => {
  for (const [zone, iso] of [[tashkent, '1925-07-01T00:00:00Z'], [tashkent, '1950-07-01T00:00:00Z'], [samarkand, '1960-07-01T00:00:00Z']] as const) {
    const local = new Date(Date.parse(iso) + offsetAt(zone, at(iso)) * 1000);
    const r = resolveLocal(zone, { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(), hour: local.getUTCHours(), minute: local.getUTCMinutes() });
    assert.equal(r.status === 'ok' && r.summer, false, iso);
  }
});

test('a local day: start, noon and end in UTC', () => {
  const day = localDay(tashkent, 2000, 1, 7);
  assert.equal(day.start.toISOString(), '2000-01-06T19:00:00.000Z');
  assert.equal(day.noon.toISOString(), '2000-01-07T07:00:00.000Z');
  assert.equal(day.end.toISOString(), '2000-01-07T18:59:59.000Z');
});

test('southern summer time is labelled too (Sydney, January)', () => {
  const sydney = table('Australia/Sydney');
  const r = resolveLocal(sydney, { year: 2010, month: 1, day: 15, hour: 12, minute: 0 });
  assert.equal(r.status === 'ok' && r.summer, true);
  assert.equal(r.status === 'ok' && offsetLabel(r.offset), 'UTC+11');
});

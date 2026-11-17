// The angles and the houses of a chart, from the local sidereal time, the
// true obliquity and the geographic latitude. Placidus by the semi-arc
// iteration; equal houses from the Ascendant; whole signs from the
// Ascendant's sign. Above the polar circles Placidus has no solution for some
// cusps: the chart then falls back to equal houses and says so.
import { norm360 } from './zodiac';

export const HOUSE_SYSTEMS = ['placidus', 'equal', 'whole'] as const;
export type HouseSystem = typeof HOUSE_SYSTEMS[number];

const RAD = Math.PI / 180;
const sin = (d: number) => Math.sin(d * RAD);
const cos = (d: number) => Math.cos(d * RAD);
const tan = (d: number) => Math.tan(d * RAD);
const atan2d = (y: number, x: number) => Math.atan2(y, x) / RAD;

/** Ecliptic longitude of the point on the ecliptic with right ascension `ra`. */
function longitudeFromRa(ra: number, obliquity: number): number {
  return norm360(atan2d(sin(ra), cos(ra) * cos(obliquity)));
}

export function midheaven(ramc: number, obliquity: number): number {
  return longitudeFromRa(ramc, obliquity);
}

export function ascendant(ramc: number, obliquity: number, latitude: number): number {
  return norm360(atan2d(cos(ramc), -(sin(ramc) * cos(obliquity) + tan(latitude) * sin(obliquity))));
}

/**
 * One Placidus cusp: the ecliptic point whose hour angle is the given share
 * of its own semi-arc. `fromAscending` cusps (11, 12) take a share of the
 * diurnal semi-arc past the meridian; the others (2, 3) a share of the
 * nocturnal one before the lower meridian. Returns null when the point never
 * rises or never sets at this latitude.
 */
function placidusCusp(ramc: number, obliquity: number, latitude: number, share: number, diurnal: boolean): number | null {
  let lon = longitudeFromRa(ramc + (diurnal ? share * 90 : 180 - share * 90), obliquity);
  for (let i = 0; i < 60; i++) {
    const declination = Math.asin(sin(obliquity) * sin(lon)) / RAD;
    const x = -tan(latitude) * tan(declination);
    if (x < -1 || x > 1) return null;
    const dsa = Math.acos(x) / RAD;
    const ra = diurnal ? ramc + share * dsa : ramc + 180 - share * (180 - dsa);
    const next = longitudeFromRa(ra, obliquity);
    let d = next - lon;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    lon = next;
    if (Math.abs(d) < 1e-9) break;
  }
  return lon;
}

export interface Houses {
  system: HouseSystem;
  /** The system asked for could not be used here (polar latitude): equal houses instead. */
  fellBack: boolean;
  /** Twelve cusps, cusps[0] is the first house (the Ascendant for Placidus and equal houses). */
  cusps: number[];
  ascendant: number;
  midheaven: number;
}

export function houses(siderealGreenwich: number, longitudeEast: number, latitude: number, obliquity: number, system: HouseSystem): Houses {
  const ramc = norm360(siderealGreenwich + longitudeEast);
  const asc = ascendant(ramc, obliquity, latitude);
  const mc = midheaven(ramc, obliquity);
  const equal = Array.from({ length: 12 }, (_, i) => norm360(asc + 30 * i));
  if (system === 'whole') {
    const first = Math.floor(asc / 30) * 30;
    return { system, fellBack: false, cusps: Array.from({ length: 12 }, (_, i) => norm360(first + 30 * i)), ascendant: asc, midheaven: mc };
  }
  if (system === 'equal') return { system, fellBack: false, cusps: equal, ascendant: asc, midheaven: mc };
  const c11 = placidusCusp(ramc, obliquity, latitude, 1 / 3, true);
  const c12 = placidusCusp(ramc, obliquity, latitude, 2 / 3, true);
  const c2 = placidusCusp(ramc, obliquity, latitude, 2 / 3, false);
  const c3 = placidusCusp(ramc, obliquity, latitude, 1 / 3, false);
  if (c11 === null || c12 === null || c2 === null || c3 === null) return { system: 'equal', fellBack: true, cusps: equal, ascendant: asc, midheaven: mc };
  const ic = norm360(mc + 180);
  const cusps = [asc, c2, c3, ic, norm360(c11 + 180), norm360(c12 + 180), norm360(asc + 180), norm360(c2 + 180), norm360(c3 + 180), mc, c11, c12];
  return { system, fellBack: false, cusps, ascendant: asc, midheaven: mc };
}

/** The house (1..12) a longitude falls in. */
export function houseOf(longitude: number, cusps: readonly number[]): number {
  const lon = norm360(longitude);
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    const span = norm360(end - start);
    if (norm360(lon - start) < span) return i + 1;
  }
  return 12;
}

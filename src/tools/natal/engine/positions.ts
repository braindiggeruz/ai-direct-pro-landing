// Where each body stands, seen from the Earth's centre at one moment (UTC):
// apparent geocentric ecliptic longitude on the true ecliptic and equinox of
// date — the frame signs are counted in. Light time and aberration included
// (GeoVector), precession and nutation by Rotation_EQJ_ECT. The lunar node
// is the mean node of Meeus, Astronomical Algorithms, ch. 47.
import { Body, GeoVector, MakeTime, RotateVector, Rotation_EQD_ECT, Rotation_EQJ_ECT, SiderealTime, SphereFromVector } from '../vendor/astronomy.js';
import { norm360, type BodyId } from './zodiac';

const ENGINE_BODY: Partial<Record<BodyId, Body>> = {
  sun: Body.Sun, moon: Body.Moon, mercury: Body.Mercury, venus: Body.Venus, mars: Body.Mars,
  jupiter: Body.Jupiter, saturn: Body.Saturn, uranus: Body.Uranus, neptune: Body.Neptune, pluto: Body.Pluto,
};

/** Julian centuries of TT from J2000 (the engine's own time scale). */
function centuries(date: Date): number {
  return MakeTime(date).tt / 36525;
}

/** Ecliptic longitude of date, degrees 0..360. */
export function longitudeOf(body: BodyId, date: Date): number {
  if (body === 'node') return meanNode(date);
  const engineBody = ENGINE_BODY[body];
  if (!engineBody) throw new Error(`unknown body ${body}`);
  const time = MakeTime(date);
  const ecliptic = RotateVector(Rotation_EQJ_ECT(time), GeoVector(engineBody, time, true));
  return norm360(SphereFromVector(ecliptic).lon);
}

/** Degrees per day, by a central difference over ±6 hours; negative is retrograde. */
export function speedOf(body: BodyId, date: Date): number {
  const h = 6 * 3_600_000;
  const before = longitudeOf(body, new Date(date.getTime() - h));
  const after = longitudeOf(body, new Date(date.getTime() + h));
  let d = after - before;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d * 2;
}

/** Mean ascending lunar node (Meeus 47.7). */
export function meanNode(date: Date): number {
  const t = centuries(date);
  return norm360(125.0445479 - 1934.1362891 * t + 0.0020754 * t * t + (t * t * t) / 467441 - (t * t * t * t) / 60616000);
}

/** Greenwich apparent sidereal time in degrees. */
export function siderealDegrees(date: Date): number {
  return norm360(SiderealTime(MakeTime(date)) * 15);
}

/** True obliquity of the ecliptic in degrees, read from the engine's own equator-to-ecliptic rotation. */
export function trueObliquity(date: Date): number {
  const r = Rotation_EQD_ECT(MakeTime(date)).rot;
  return (Math.atan2(Math.abs(r[1][2]), r[1][1]) * 180) / Math.PI;
}

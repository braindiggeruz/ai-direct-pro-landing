// One natal chart from a moment (UTC) and a place, and the contacts between
// two charts. Pure functions: the same input gives the same chart (roadmap
// T8). With the birth time unknown the chart is computed for local noon and
// has no houses, Ascendant or Midheaven (T5); a body whose sign changes during
// the birth day is marked uncertain, and so is any aspect that does not hold
// for the whole day.
import { houseOf, houses as computeHouses, type HouseSystem, type Houses } from './houses';
import { longitudeOf, siderealDegrees, speedOf, trueObliquity } from './positions';
import {
  ASPECTS, ASPECT_ANGLE, ASPECT_TONE, BODIES, ELEMENT, LUMINARY_BONUS, MODALITY, NATAL_ORB, PAIR_ORB, READ_BODIES,
  separation, signOf, type AspectId, type BodyId, type SignId,
} from './zodiac';

export interface BirthMoment {
  /** The moment of birth (time known) or local noon of the birth day (time unknown), UTC. */
  utc: Date;
  timeKnown: boolean;
  /** UTC start and end of the local birth day; used only when the time is unknown. */
  dayStart?: Date;
  dayEnd?: Date;
  latitude: number;
  /** East positive. */
  longitude: number;
  houseSystem: HouseSystem;
}

export interface BodyPlacement {
  body: BodyId;
  longitude: number;
  sign: SignId;
  /** Degrees within the sign, 0..30. */
  degree: number;
  retrograde: boolean;
  /** 1..12 when the time is known. */
  house: number | null;
  /** The sign could be different at another hour of the birth day (time unknown). */
  signUncertain: boolean;
}

export interface Aspect {
  a: BodyId | 'asc' | 'mc';
  b: BodyId | 'asc' | 'mc';
  aspect: AspectId;
  /** How far from exact, degrees. */
  orb: number;
  /** The aspect may not hold for the whole birth day (time unknown). */
  uncertain: boolean;
}

export interface Chart {
  moment: BirthMoment;
  bodies: BodyPlacement[];
  houses: Houses | null;
  aspects: Aspect[];
  elements: Record<'fire' | 'earth' | 'air' | 'water', number>;
  modalities: Record<'cardinal' | 'fixed' | 'mutable', number>;
}

function orbFor(a: string, b: string, aspect: AspectId, table: Readonly<Record<AspectId, number>>): number {
  const luminary = a === 'sun' || a === 'moon' || b === 'sun' || b === 'moon';
  return table[aspect] + (luminary && table === NATAL_ORB ? LUMINARY_BONUS : 0);
}

/** The aspect two longitudes make, with its distance from exact; null if none within orb. */
export function aspectBetween(lonA: number, lonB: number, a: string, b: string, table: Readonly<Record<AspectId, number>>): { aspect: AspectId; orb: number } | null {
  const sep = separation(lonA, lonB);
  let best: { aspect: AspectId; orb: number } | null = null;
  for (const aspect of ASPECTS) {
    const orb = Math.abs(sep - ASPECT_ANGLE[aspect]);
    if (orb <= orbFor(a, b, aspect, table) && (!best || orb < best.orb)) best = { aspect, orb };
  }
  return best;
}

export function buildChart(moment: BirthMoment): Chart {
  const lon = (body: BodyId, date: Date) => longitudeOf(body, date);
  const houses = moment.timeKnown
    ? computeHouses(siderealDegrees(moment.utc), moment.longitude, moment.latitude, trueObliquity(moment.utc), moment.houseSystem)
    : null;
  const ends = !moment.timeKnown && moment.dayStart && moment.dayEnd ? [moment.dayStart, moment.dayEnd] : null;
  const bodies: BodyPlacement[] = BODIES.map((body) => {
    const longitude = lon(body, moment.utc);
    const sign = signOf(longitude);
    const signUncertain = ends ? ends.some((date) => signOf(lon(body, date)) !== sign) : false;
    return {
      body,
      longitude,
      sign,
      degree: longitude - Math.floor(longitude / 30) * 30,
      retrograde: body === 'node' ? false : speedOf(body, moment.utc) < 0,
      house: houses ? houseOf(longitude, houses.cusps) : null,
      signUncertain,
    };
  });
  const at = new Map(bodies.map((placement) => [placement.body, placement.longitude]));
  const aspects: Aspect[] = [];
  for (let i = 0; i < READ_BODIES.length; i++) {
    for (let j = i + 1; j < READ_BODIES.length; j++) {
      const a = READ_BODIES[i];
      const b = READ_BODIES[j];
      const found = aspectBetween(at.get(a)!, at.get(b)!, a, b, NATAL_ORB);
      if (!found) continue;
      const uncertain = ends ? ends.some((date) => aspectBetween(lon(a, date), lon(b, date), a, b, NATAL_ORB)?.aspect !== found.aspect) : false;
      aspects.push({ a, b, ...found, uncertain });
    }
  }
  const elements = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalities = { cardinal: 0, fixed: 0, mutable: 0 };
  for (const placement of bodies) {
    if (!READ_BODIES.includes(placement.body)) continue;
    elements[ELEMENT[placement.sign]] += 1;
    modalities[MODALITY[placement.sign]] += 1;
  }
  return { moment, bodies, houses, aspects, elements, modalities };
}

export interface Contact {
  /** A body of the first person, or an angle when the first person's time is known. */
  a: BodyId | 'asc' | 'mc';
  /** A body of the second person, or an angle when the second person's time is known. */
  b: BodyId | 'asc' | 'mc';
  aspect: AspectId;
  tone: 'harmony' | 'tension' | 'blend';
  orb: number;
  /** May not hold for the whole birth day of a person whose time is unknown (roadmap T8). */
  uncertain: boolean;
}

/** The points of a chart that take part in contacts: the ten bodies, and the angles when the time is known. */
function contactPoints(chart: Chart): Array<{ id: BodyId | 'asc' | 'mc'; at: (date: Date | null) => number }> {
  const points: Array<{ id: BodyId | 'asc' | 'mc'; at: (date: Date | null) => number }> = READ_BODIES.map((body) => ({
    id: body,
    at: (date: Date | null) => (date ? longitudeOf(body, date) : chart.bodies.find((p) => p.body === body)!.longitude),
  }));
  if (chart.houses) {
    const { ascendant, midheaven } = chart.houses;
    points.push({ id: 'asc', at: () => ascendant }, { id: 'mc', at: () => midheaven });
  }
  return points;
}

export function contactsBetween(first: Chart, second: Chart): Contact[] {
  const ends = (chart: Chart) => (!chart.moment.timeKnown && chart.moment.dayStart && chart.moment.dayEnd ? [chart.moment.dayStart, chart.moment.dayEnd] : null);
  const firstEnds = ends(first);
  const secondEnds = ends(second);
  const contacts: Contact[] = [];
  for (const p of contactPoints(first)) {
    for (const q of contactPoints(second)) {
      const found = aspectBetween(p.at(null), q.at(null), String(p.id), String(q.id), PAIR_ORB);
      if (!found) continue;
      const checks: Array<[number, number]> = [];
      for (const d of firstEnds ?? []) checks.push([p.at(d), q.at(null)]);
      for (const d of secondEnds ?? []) checks.push([p.at(null), q.at(d)]);
      const uncertain = checks.some(([x, y]) => aspectBetween(x, y, String(p.id), String(q.id), PAIR_ORB)?.aspect !== found.aspect);
      contacts.push({ a: p.id, b: q.id, aspect: found.aspect, tone: ASPECT_TONE[found.aspect], orb: found.orb, uncertain });
    }
  }
  return contacts.sort((x, y) => Number(x.uncertain) - Number(y.uncertain) || x.orb - y.orb);
}

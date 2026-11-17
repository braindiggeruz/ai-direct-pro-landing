// The closed lists of the natal chart: bodies, signs, aspects and their orbs.
// Everything the page shows and everything the AI reading may name comes from
// these ids (roadmap section 3): nothing else is a fact.

// No Lilith in version 1: programs define the «Black Moon» differently (the
// Meeus mean apogee is up to 7′ from the Swiss Ephemeris one), so its position
// would depend on whose formula is used.
export const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'node'] as const;
export type BodyId = typeof BODIES[number];

/** The ten bodies the AI reads in signs and houses; the node is shown, not read, in version 1. */
export const READ_BODIES: readonly BodyId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

export const SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] as const;
export type SignId = typeof SIGNS[number];

export const ELEMENT: Readonly<Record<SignId, 'fire' | 'earth' | 'air' | 'water'>> = {
  aries: 'fire', leo: 'fire', sagittarius: 'fire',
  taurus: 'earth', virgo: 'earth', capricorn: 'earth',
  gemini: 'air', libra: 'air', aquarius: 'air',
  cancer: 'water', scorpio: 'water', pisces: 'water',
};

export const MODALITY: Readonly<Record<SignId, 'cardinal' | 'fixed' | 'mutable'>> = {
  aries: 'cardinal', cancer: 'cardinal', libra: 'cardinal', capricorn: 'cardinal',
  taurus: 'fixed', leo: 'fixed', scorpio: 'fixed', aquarius: 'fixed',
  gemini: 'mutable', virgo: 'mutable', sagittarius: 'mutable', pisces: 'mutable',
};

export const ASPECTS = ['conjunction', 'sextile', 'square', 'trine', 'opposition'] as const;
export type AspectId = typeof ASPECTS[number];

export const ASPECT_ANGLE: Readonly<Record<AspectId, number>> = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 };

/** Harmonious or tense, as the pair's list counts them (no percentage: roadmap T12). */
export const ASPECT_TONE: Readonly<Record<AspectId, 'harmony' | 'tension' | 'blend'>> = {
  conjunction: 'blend', sextile: 'harmony', trine: 'harmony', square: 'tension', opposition: 'tension',
};

/**
 * Orbs in degrees. One chart: the usual table, two degrees more when the Sun
 * or the Moon takes part. Two charts (synastry): tighter, as most schools use.
 */
export const NATAL_ORB: Readonly<Record<AspectId, number>> = { conjunction: 8, sextile: 5, square: 7, trine: 7, opposition: 8 };
export const PAIR_ORB: Readonly<Record<AspectId, number>> = { conjunction: 6, sextile: 4, square: 5, trine: 5, opposition: 6 };
export const LUMINARY_BONUS = 2;

export function signOf(longitude: number): SignId {
  return SIGNS[Math.floor(norm360(longitude) / 30) % 12];
}

export function norm360(x: number): number {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}

/** The smaller angle between two longitudes, 0..180. */
export function separation(a: number, b: number): number {
  const d = Math.abs(norm360(a) - norm360(b)) % 360;
  return d > 180 ? 360 - d : d;
}

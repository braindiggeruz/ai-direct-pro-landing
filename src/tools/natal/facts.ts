// A computed chart (or pair) as the closed fact ids an AI reading may use
// (src/shared/natal-facts.ts). Degrees, dates, places and names never leave
// the browser: only signs, houses and aspects do (roadmap §6).
import type { Chart, Contact } from './engine/chart';
import { READ_BODIES, signOf } from './engine/zodiac';

function dominant<K extends string>(counts: Record<K, number>): K[] {
  const max = Math.max(...Object.values<number>(counts));
  return max >= 3 ? (Object.keys(counts) as K[]).filter((key) => counts[key] === max) : [];
}

export function factsOfChart(chart: Chart, person: 1 | 2, full = true): string[] {
  const facts: string[] = [];
  for (const placement of chart.bodies) {
    if (!READ_BODIES.includes(placement.body)) continue;
    facts.push(`${person}.${placement.signUncertain ? 'signu' : 'sign'}.${placement.body}.${placement.sign}`);
    if (!full) continue;
    if (placement.house !== null) facts.push(`${person}.house.${placement.body}.${placement.house}`);
    if (placement.retrograde && placement.body !== 'sun' && placement.body !== 'moon') facts.push(`${person}.retro.${placement.body}`);
  }
  if (chart.houses) {
    facts.push(`${person}.asc.${signOf(chart.houses.ascendant)}`);
    if (full) facts.push(`${person}.mc.${signOf(chart.houses.midheaven)}`);
  }
  if (!full) return facts;
  for (const aspect of chart.aspects) {
    if (aspect.uncertain || aspect.a === 'asc' || aspect.a === 'mc' || aspect.b === 'asc' || aspect.b === 'mc') continue;
    facts.push(`${person}.aspect.${aspect.a}.${aspect.b}.${aspect.aspect}`);
  }
  for (const element of dominant(chart.elements)) facts.push(`${person}.elem.${element}`);
  for (const modality of dominant(chart.modalities)) facts.push(`${person}.mode.${modality}`);
  return facts;
}

/** A pair: both people's signs (and Ascendants), and the closest contacts between them, at most 24. */
export function factsOfPair(first: Chart, second: Chart, contacts: readonly Contact[]): string[] {
  return [
    ...factsOfChart(first, 1, false),
    ...factsOfChart(second, 2, false),
    ...contacts.slice(0, 24).map((contact) => `${contact.uncertain ? 'xu' : 'x'}.${contact.a}.${contact.b}.${contact.aspect}`),
  ];
}

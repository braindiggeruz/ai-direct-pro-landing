// The facts an AI reading may use (roadmap section 3), as closed ids the page
// computes and the server checks before any model call. The server renders
// every name itself: no text from the browser reaches the model.
//
//   1.sign.sun.leo      a body's sign            (person 1 or 2)
//   1.signu.moon.leo    the same, uncertain (birth time unknown)
//   1.house.sun.10      a body's house           (birth time known)
//   1.asc.virgo         the Ascendant's sign     (birth time known)
//   1.mc.gemini         the Midheaven's sign     (birth time known)
//   1.aspect.sun.moon.trine   an aspect within one chart (bodies in BODIES order)
//   1.elem.fire         the dominant element;  1.mode.fixed  the dominant modality
//   1.retro.mercury     a body in retrograde motion
//   x.venus.mars.trine  a contact between person 1's and person 2's points
//   xu.moon.sun.square  the same, uncertain
import { ASPECTS, BODIES, READ_BODIES, SIGNS, type AspectId, type BodyId, type SignId } from '../tools/natal/engine/zodiac';

export type ReadingKind = 'natal' | 'pair';

const body = `(${READ_BODIES.join('|')})`;
const sign = `(${SIGNS.join('|')})`;
const aspect = `(${ASPECTS.join('|')})`;
const point = `(${READ_BODIES.join('|')}|asc|mc)`;
const PATTERNS: RegExp[] = [
  new RegExp(`^[12]\\.signu?\\.${body}\\.${sign}$`),
  new RegExp(`^[12]\\.house\\.${body}\\.([1-9]|1[0-2])$`),
  new RegExp(`^[12]\\.(asc|mc)\\.${sign}$`),
  new RegExp(`^[12]\\.aspect\\.${body}\\.${body}\\.${aspect}$`),
  /^[12]\.elem\.(fire|earth|air|water)$/,
  /^[12]\.mode\.(cardinal|fixed|mutable)$/,
  new RegExp(`^[12]\\.retro\\.(mercury|venus|mars|jupiter|saturn|uranus|neptune|pluto)$`),
  new RegExp(`^xu?\\.${point}\\.${point}\\.${aspect}$`),
];

export const MAX_FACTS: Readonly<Record<ReadingKind, number>> = { natal: 90, pair: 70 };

export type FactCheck = { ok: true; facts: string[] } | { ok: false; reason: string };

/** The facts of a request, checked against the grammar and the kind; sorted and without duplicates. */
export function checkFacts(kind: ReadingKind, input: unknown): FactCheck {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, reason: 'no_facts' };
  if (input.length > MAX_FACTS[kind]) return { ok: false, reason: 'too_many_facts' };
  const facts = [...new Set(input)];
  for (const fact of facts) {
    if (typeof fact !== 'string' || fact.length > 40 || !PATTERNS.some((pattern) => pattern.test(fact))) return { ok: false, reason: 'bad_fact' };
    if (kind === 'natal' && (fact.startsWith('2.') || fact.startsWith('x'))) return { ok: false, reason: 'bad_fact' };
    if (fact.includes('.aspect.')) {
      const [, , a, b] = fact.split('.');
      if (BODIES.indexOf(a as BodyId) >= BODIES.indexOf(b as BodyId)) return { ok: false, reason: 'bad_fact' };
    }
  }
  const sunSign = facts.find((fact) => /^1\.signu?\.sun\./.test(fact as string));
  if (!sunSign) return { ok: false, reason: 'no_sun' };
  if (kind === 'pair' && !facts.some((fact) => /^2\.signu?\.sun\./.test(fact as string))) return { ok: false, reason: 'no_second_sun' };
  if (kind === 'pair' && !facts.some((fact) => (fact as string).startsWith('x'))) return { ok: false, reason: 'no_contacts' };
  return { ok: true, facts: (facts as string[]).sort() };
}

/** The reading's identity: the kind and its sorted facts (the same chart, the same reading). */
export async function fingerprintOf(kind: ReadingKind, facts: readonly string[]): Promise<string> {
  const bytes = new TextEncoder().encode(`${kind}|${[...facts].sort().join(',')}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type ParsedFact =
  | { kind: 'sign'; person: 1 | 2; body: BodyId; sign: SignId; uncertain: boolean }
  | { kind: 'house'; person: 1 | 2; body: BodyId; house: number }
  | { kind: 'angle'; person: 1 | 2; angle: 'asc' | 'mc'; sign: SignId }
  | { kind: 'aspect'; person: 1 | 2; a: BodyId; b: BodyId; aspect: AspectId }
  | { kind: 'elem'; person: 1 | 2; element: 'fire' | 'earth' | 'air' | 'water' }
  | { kind: 'mode'; person: 1 | 2; modality: 'cardinal' | 'fixed' | 'mutable' }
  | { kind: 'retro'; person: 1 | 2; body: BodyId }
  | { kind: 'contact'; a: BodyId | 'asc' | 'mc'; b: BodyId | 'asc' | 'mc'; aspect: AspectId; uncertain: boolean };

/** A checked fact as data (checkFacts first). */
export function parseFact(fact: string): ParsedFact {
  const parts = fact.split('.');
  if (parts[0] === 'x' || parts[0] === 'xu') {
    return { kind: 'contact', a: parts[1] as BodyId, b: parts[2] as BodyId, aspect: parts[3] as AspectId, uncertain: parts[0] === 'xu' };
  }
  const person = parts[0] === '2' ? 2 : 1;
  switch (parts[1]) {
    case 'sign':
    case 'signu': return { kind: 'sign', person, body: parts[2] as BodyId, sign: parts[3] as SignId, uncertain: parts[1] === 'signu' };
    case 'house': return { kind: 'house', person, body: parts[2] as BodyId, house: Number(parts[3]) };
    case 'asc':
    case 'mc': return { kind: 'angle', person, angle: parts[1], sign: parts[2] as SignId };
    case 'aspect': return { kind: 'aspect', person, a: parts[2] as BodyId, b: parts[3] as BodyId, aspect: parts[4] as AspectId };
    case 'elem': return { kind: 'elem', person, element: parts[2] as 'fire' };
    case 'mode': return { kind: 'mode', person, modality: parts[2] as 'fixed' };
    default: return { kind: 'retro', person, body: parts[2] as BodyId };
  }
}

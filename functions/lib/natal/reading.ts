// The AI reading of a natal chart or a pair: the prompt built from checked
// facts and the table of meanings, and the check of the model's answer
// (roadmap section 3, T9). The model returns sections keyed by fact ids, so
// what a section talks about is checked by construction; its text may carry
// no digits, percentages or degrees (AGENTS.md §5) and no forecast of health,
// death, pregnancy, divorce, money or exams. A broken answer is retried once,
// then refused.
import type { ChatMessage } from '../gpt-chat/prompt';
import { ANGLE_NAME, ASPECT_NAME, BODY_NAME, ELEMENT_NAME, MODALITY_NAME, SIGN_NAME, houseWords, type NatalLocale } from '../../../src/shared/natal-names';
import { parseFact, type ReadingKind } from '../../../src/shared/natal-facts';
import { ASPECT_MEANING, BODY_MEANING, ELEMENT_MEANING, HOUSE_MEANING, MODALITY_MEANING, SIGN_MEANING } from './meanings';

export const NATAL_SECTIONS = ['core', 'mind', 'love', 'growth', 'generation', 'aspects', 'balance', 'advice'] as const;
export const PAIR_SECTIONS = ['overview', 'harmony', 'tension', 'communication', 'advice'] as const;
export type SectionId = typeof NATAL_SECTIONS[number] | typeof PAIR_SECTIONS[number];

export interface ReadingSection { id: SectionId; facts: string[]; text: string }

const SECTION_BRIEF: Readonly<Record<ReadingKind, string>> = {
  natal: [
    'core — the Sun, the Moon and the Ascendant together: who the person is at heart',
    'mind — Mercury: thinking and communication',
    'love — Venus and Mars: love, attraction, drive',
    'growth — Jupiter and Saturn: where growth and maturity come from',
    'generation — Uranus, Neptune, Pluto: briefly, as traits shared with one\'s generation, more personal only through houses',
    'aspects — the most telling aspects between bodies',
    'balance — the dominant element and modality',
    'advice — two or three practical suggestions for self-development drawn from the facts above',
  ].join('; '),
  pair: [
    'overview — the two Sun signs (and Moon signs) side by side: the general feeling of the pair',
    'harmony — the harmonious contacts: where they support each other',
    'tension — the tense contacts: where they will argue and why',
    'communication — contacts of Mercury, the Moon, Venus and Mars: how they talk, feel and love',
    'advice — two or three practical suggestions for the pair drawn from the facts above',
  ].join('; '),
};

const LANGUAGE: Readonly<Record<NatalLocale, string>> = {
  uz: 'Uzbek in the Latin script (use oʻ and gʻ), addressing the reader as «siz»',
  ru: 'Russian, addressing the reader as «вы»',
};

const PERSON: Readonly<Record<NatalLocale, { 1: string; 2: string }>> = {
  uz: { 1: 'Siz', 2: 'Sherigingiz' },
  ru: { 1: 'Вы', 2: 'Партнёр' },
};

/** One fact as a line for the model: id, the words of the page, and the meanings it may use. */
export function factLine(fact: string, locale: NatalLocale, kind: ReadingKind): string {
  const p = parseFact(fact);
  const who = (person: 1 | 2) => (kind === 'pair' ? `${PERSON[locale][person]}: ` : '');
  const pointName = (point: string) => (point === 'asc' || point === 'mc' ? ANGLE_NAME[locale][point] : BODY_NAME[locale][point as keyof typeof BODY_NAME['uz']]);
  const pointMeaning = (point: string) => (point === 'asc' ? 'how one meets the world, first impression' : point === 'mc' ? 'career, public direction' : BODY_MEANING[point as keyof typeof BODY_MEANING]);
  switch (p.kind) {
    case 'sign':
      return `- [${fact}] ${who(p.person)}${BODY_NAME[locale][p.body]} — ${SIGN_NAME[locale][p.sign]}${p.uncertain ? ' (uncertain: birth time unknown)' : ''}. Meaning: ${BODY_MEANING[p.body]}; ${SIGN_MEANING[p.sign]}.`;
    case 'house':
      return `- [${fact}] ${who(p.person)}${BODY_NAME[locale][p.body]} — ${houseWords(locale, p.house)}. Meaning: ${BODY_MEANING[p.body]}; house: ${HOUSE_MEANING[p.house]}.`;
    case 'angle':
      return `- [${fact}] ${who(p.person)}${ANGLE_NAME[locale][p.angle]} — ${SIGN_NAME[locale][p.sign]}. Meaning: ${pointMeaning(p.angle)}; ${SIGN_MEANING[p.sign]}.`;
    case 'aspect':
      return `- [${fact}] ${who(p.person)}${BODY_NAME[locale][p.a]} — ${BODY_NAME[locale][p.b]}: ${ASPECT_NAME[locale][p.aspect]}. Meaning: ${ASPECT_MEANING[p.aspect]}.`;
    case 'elem':
      return `- [${fact}] ${who(p.person)}dominant element: ${ELEMENT_NAME[locale][p.element]}. Meaning: ${ELEMENT_MEANING[p.element]}.`;
    case 'mode':
      return `- [${fact}] ${who(p.person)}dominant modality: ${MODALITY_NAME[locale][p.modality]}. Meaning: ${MODALITY_MEANING[p.modality]}.`;
    case 'retro':
      return `- [${fact}] ${who(p.person)}${BODY_NAME[locale][p.body]} retrograde. Meaning: its themes turn inward, revisited and reworked.`;
    case 'contact':
      return `- [${fact}] ${PERSON[locale][1]}: ${pointName(p.a)} — ${PERSON[locale][2]}: ${pointName(p.b)}: ${ASPECT_NAME[locale][p.aspect]}${p.uncertain ? ' (uncertain: a birth time is unknown)' : ''}. Meaning: ${pointMeaning(p.a)} / ${pointMeaning(p.b)}; ${ASPECT_MEANING[p.aspect]}.`;
  }
}

export function readingMessages(kind: ReadingKind, locale: NatalLocale, facts: readonly string[]): ChatMessage[] {
  const sections = kind === 'natal' ? NATAL_SECTIONS : PAIR_SECTIONS;
  const system = [
    `You write an astrological ${kind === 'natal' ? 'natal chart reading' : 'compatibility reading of two people'} for self-reflection on GPTBot.uz.`,
    'A program calculated the chart from astronomical data; you only explain the facts listed in the user message, with the meanings given there.',
    'Rules:',
    `1. Write in ${LANGUAGE[locale]}. Warm, concrete and practical; no clichés, no flattery.`,
    '2. Use only the listed facts. Do not mention any position, sign, house, aspect or contact that is not listed. Never write degrees, dates, ages, numbers, percentages or timings. Write no digits at all.',
    '3. Astrology is a tradition of symbols, not a science: speak of tendencies («may», «tends to»), never of certainty or fate.',
    '4. Never predict or diagnose health, illness, pregnancy, death, accidents, divorce, money gains or losses, or exam results. Never advise on medical, legal or financial decisions.',
    '5. Where a fact is marked uncertain, say that the birth time is not known, so this part is approximate.',
    kind === 'pair' ? '6. No compatibility score or percentage: describe where the two support each other and where they clash, and how to talk about it.' : '6. Do not judge the person; describe strengths and challenges with equal respect.',
    `7. Answer with JSON only, no other text: {"sections":[{"id":"…","facts":["…"],"text":"…"}]}. Section ids, in this order, each only if some listed fact belongs to it: ${SECTION_BRIEF[kind]}. Allowed ids: ${sections.join(', ')}.`,
    '8. "facts" lists the ids (in square brackets below) that the section explains: at least one, all from the list. "text": two to four sentences, 60 to 500 characters. Keep the whole answer short.',
  ].join('\n');
  const user = ['Facts:', ...facts.map((fact) => factLine(fact, locale, kind))].join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// Whole words only: «oʻlim» (death) but not «yoʻlim», «boʻlim» or «olim»; «болезнь» but not «болезненно».
// The prompt forbids these forecasts; this scan is the last check, so it stays narrow.
const NOT_LETTER_BEFORE = "(?<![\\p{L}ʻʼ'‘’`])";
const NOT_LETTER_AFTER = "(?![\\p{L}])";
const whole = (stems: string) => new RegExp(`${NOT_LETTER_BEFORE}(?:${stems})${NOT_LETTER_AFTER}`, 'iu');
const FORBIDDEN: readonly RegExp[] = [
  /[0-9%°]/,
  whole('смерт[ьиюей]*|умр[её]т[её]?|умр[её]те|беременн\\p{L}*|болезн(?:ь|и|ью|ей|ям|ями|ях)|диагноз\\p{L}*|развод\\p{L}*|лотере\\p{L}*'),
  whole('o[ʻ\'‘’`]lim\\p{L}*|vafot\\p{L}*|homilador\\p{L}*|kasallik\\p{L}*|tashxis\\p{L}*|ajrash\\p{L}*|lotereya\\p{L}*'),
];

export type ReadingCheck = { ok: true; sections: ReadingSection[] } | { ok: false; reason: string };

/** The model's answer as sections, or why it cannot be shown. */
export function checkReading(kind: ReadingKind, content: string | undefined, facts: readonly string[]): ReadingCheck {
  if (!content) return { ok: false, reason: 'empty' };
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, reason: 'not_json' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const list = (parsed as { sections?: unknown }).sections;
  if (!Array.isArray(list) || list.length < 2) return { ok: false, reason: 'no_sections' };
  const allowed = new Set<string>(kind === 'natal' ? NATAL_SECTIONS : PAIR_SECTIONS);
  const known = new Set(facts);
  const seen = new Set<string>();
  const sections: ReadingSection[] = [];
  for (const item of list) {
    const section = item as { id?: unknown; facts?: unknown; text?: unknown };
    if (typeof section.id !== 'string' || !allowed.has(section.id) || seen.has(section.id)) return { ok: false, reason: 'bad_section' };
    if (!Array.isArray(section.facts) || section.facts.length === 0 || !section.facts.every((fact) => typeof fact === 'string' && known.has(fact))) return { ok: false, reason: 'unknown_fact' };
    if (typeof section.text !== 'string') return { ok: false, reason: 'bad_text' };
    const text = section.text.trim().replace(/\s+/g, ' ');
    if (text.length < 40 || text.length > 900) return { ok: false, reason: 'bad_length' };
    if (FORBIDDEN.some((pattern) => pattern.test(text))) return { ok: false, reason: 'forbidden' };
    seen.add(section.id);
    sections.push({ id: section.id as SectionId, facts: [...new Set(section.facts as string[])], text });
  }
  return { ok: true, sections };
}

/** What the model is told when its first answer failed the check. */
export function retryMessage(reason: string): ChatMessage {
  return {
    role: 'user',
    content: `Your answer could not be used (${reason}). Answer again with JSON only, following every rule: only the listed fact ids, no digits, no percentages, no forecasts of health, death, pregnancy, divorce, money or exams.`,
  };
}

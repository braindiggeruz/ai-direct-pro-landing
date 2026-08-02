// Deterministic RU / Uzbek-Latin / mixed voice-query interpretation.
//
// A spoken sentence is not a catalog query: it carries an intent verb, filler,
// a spoken budget and sometimes an attribute. The existing catalog search
// accepts at most CATALOG_LIMITS.queryTokens tokens, so a raw transcript would
// simply be rejected. This module reduces a transcript to the same shape the
// text search already consumes and returns the constraints it removed, so the
// UI can show the user exactly what was understood.
//
// Everything here is pure and offline. The AI layer only produces the
// transcript; grounding, budget parsing and ranking stay deterministic, and a
// failed AI call therefore degrades to plain text search rather than to a
// fabricated result.
import { CATALOG_LIMITS } from '../../agents/sotuvchi/catalog';
import { parseBudget } from '../../agents/sotuvchi/experience';
import { normalizeKnowledgeText } from '../../platform/knowledge';

export type VoiceConstraintKind =
  | 'query'
  | 'budget'
  | 'availability'
  | 'attribute'
  | 'category';

export interface VoiceConstraint {
  kind: VoiceConstraintKind;
  /** Machine value. The client renders the locale-specific label. */
  value: string;
}

export type VoiceClarification = 'budget' | 'empty_query' | null;

export interface VoiceInterpretation {
  /** Bounded query handed to the existing catalog search unchanged. */
  productQuery: string;
  maxPriceMinor: number | null;
  /**
   * A spoken number with no budget cue. It is never applied as a filter; it is
   * carried so the one permitted clarification can offer the exact amount.
   */
  ambiguousPriceMinor: number | null;
  availability: 'available' | null;
  /** Normalized words that may name a real category; grounded by the caller. */
  categoryHint: string | null;
  constraints: readonly VoiceConstraint[];
  clarification: VoiceClarification;
  confidence: 'high' | 'medium' | 'low';
}

export const VOICE_TRANSCRIPT_MAX_CHARS = 240;

/**
 * Spoken cardinals. Written in the shape normalizeKnowledgeText produces, so
 * Uzbek turned tokens are already apostrophe-free (`to‘rt` -> `tort`).
 */
const CARDINALS: ReadonlyMap<string, number> = new Map([
  // Russian nominative.
  ['один', 1], ['одна', 1], ['два', 2], ['две', 2], ['три', 3],
  ['четыре', 4], ['пять', 5], ['шесть', 6], ['семь', 7], ['восемь', 8],
  ['девять', 9], ['десять', 10], ['одиннадцать', 11], ['двенадцать', 12],
  ['тринадцать', 13], ['четырнадцать', 14], ['пятнадцать', 15],
  ['шестнадцать', 16], ['семнадцать', 17], ['восемнадцать', 18],
  ['девятнадцать', 19], ['двадцать', 20], ['тридцать', 30], ['сорок', 40],
  ['пятьдесят', 50], ['шестьдесят', 60], ['семьдесят', 70],
  ['восемьдесят', 80], ['девяносто', 90],
  ['двести', 200], ['триста', 300], ['четыреста', 400], ['пятьсот', 500],
  ['шестьсот', 600], ['семьсот', 700], ['восемьсот', 800], ['девятьсот', 900],
  // Russian oblique forms that survive after «до», «дешевле», «максимум».
  ['двух', 2], ['трех', 3], ['трёх', 3], ['четырех', 4], ['четырёх', 4],
  ['пяти', 5], ['шести', 6], ['семи', 7], ['восьми', 8], ['девяти', 9],
  ['десяти', 10], ['двадцати', 20], ['тридцати', 30], ['сорока', 40],
  ['пятидесяти', 50], ['шестидесяти', 60], ['семидесяти', 70],
  ['восьмидесяти', 80], ['девяноста', 90],
  ['двухсот', 200], ['трехсот', 300], ['трёхсот', 300],
  ['четырехсот', 400], ['четырёхсот', 400], ['пятисот', 500],
  ['шестисот', 600], ['семисот', 700], ['восьмисот', 800], ['девятисот', 900],
  // Uzbek Latin, normalized.
  ['bir', 1], ['ikki', 2], ['uch', 3], ['tort', 4], ['besh', 5],
  ['olti', 6], ['yetti', 7], ['sakkiz', 8], ['toqqiz', 9], ['on', 10],
  ['yigirma', 20], ['ottiz', 30], ['qirq', 40], ['ellik', 50],
  ['oltmish', 60], ['yetmish', 70], ['sakson', 80], ['toqson', 90],
]);

/** Multiplies whatever cardinal precedes it. `ikki yuz` -> 200, `сто` -> 100. */
const HUNDREDS: ReadonlySet<string> = new Set(['сто', 'ста', 'yuz']);

const THOUSANDS: ReadonlySet<string> = new Set([
  'тысяча', 'тысячи', 'тысяч', 'тыс', 'ming',
]);

const MILLIONS: ReadonlySet<string> = new Set([
  'миллион', 'миллиона', 'миллионов', 'млн', 'million',
]);

/**
 * Only unmistakable in-stock phrases set the availability filter. A bare
 * question — «есть?», «bormi?» — stays unfiltered: the speaker is asking, not
 * narrowing, and silently dropping preorder rows would hide real catalog rows.
 */
const AVAILABILITY_CUES: readonly RegExp[] = [
  /(?:^|\s)в наличии(?:\s|$)/u,
  /(?:^|\s)есть в наличии(?:\s|$)/u,
  /(?:^|\s)сейчас есть(?:\s|$)/u,
  /(?:^|\s)mavjud(?:\s|$)/u,
  /(?:^|\s)sotuvda(?:\s|$)/u,
  /(?:^|\s)hozir bor(?:\s|$)/u,
];

/** Colour and condition words worth showing back, kept inside the query. */
const ATTRIBUTES: ReadonlyMap<string, string> = new Map([
  ['черный', 'black'], ['чёрный', 'black'], ['черная', 'black'],
  ['чёрная', 'black'], ['черное', 'black'], ['чёрное', 'black'],
  ['qora', 'black'],
  ['белый', 'white'], ['белая', 'white'], ['белое', 'white'], ['oq', 'white'],
  ['красный', 'red'], ['красная', 'red'], ['qizil', 'red'],
  ['синий', 'blue'], ['синяя', 'blue'], ['kok', 'blue'],
  ['зеленый', 'green'], ['зелёный', 'green'], ['yashil', 'green'],
  ['серый', 'grey'], ['серая', 'grey'], ['kulrang', 'grey'],
  ['золотой', 'gold'], ['серебряный', 'silver'],
  ['большой', 'large'], ['большая', 'large'], ['katta', 'large'],
  ['маленький', 'small'], ['маленькая', 'small'], ['kichik', 'small'],
  ['быстрый', 'fast'], ['быстрая', 'fast'], ['tez', 'fast'],
  ['беспроводной', 'wireless'], ['беспроводные', 'wireless'],
  ['simsiz', 'wireless'],
]);

/**
 * Intent verbs, politeness and budget scaffolding. Removing them keeps the
 * query inside CATALOG_LIMITS.queryTokens and stops guaranteed-unmatched
 * tokens from diluting the existing relevance score.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  // Russian intent and politeness.
  'нужна', 'нужен', 'нужно', 'нужны', 'надо', 'хочу', 'хочется', 'ищу',
  'покажи', 'покажите', 'показать', 'найди', 'найдите', 'найти', 'поищи',
  'посмотреть', 'дай', 'дайте', 'подбери', 'подскажи', 'пожалуйста',
  'желательно', 'можно', 'мне', 'меня', 'вы', 'вас', 'есть', 'ли', 'бы',
  'что', 'чего', 'нибудь', 'какой', 'какая', 'какие', 'какое', 'вообще',
  'примерно', 'около', 'где', 'то', 'а', 'и', 'или', 'но', 'же', 'ну', 'вот',
  'этот', 'эта', 'это', 'для', 'под', 'по', 'на', 'в', 'с', 'из', 'от', 'у',
  'наличии', 'наличие', 'сейчас',
  // Russian budget scaffolding — the amount is already parsed out.
  'до', 'дешевле', 'дороже', 'максимум', 'макс', 'бюджет', 'ценой', 'цена',
  'стоимость', 'стоит', 'сум', 'сума', 'сумов', 'сумма', 'рублей',
  // Uzbek Latin intent and politeness.
  'kerak', 'kerakli', 'menga', 'meni', 'bor', 'bormi', 'bormidi', 'mavjud',
  'mavjudmi', 'sotuvda', 'hozir', 'toping', 'topib', 'bering', 'korsating',
  'korsatingchi', 'iltimos', 'uchun', 'yaxshi', 'boladi', 'bolsa', 'nima',
  'qanday', 'qaysi', 'ham', 'yoki', 'va', 'bu', 'shu', 'oz', 'taxminan',
  // Uzbek budget scaffolding.
  'gacha', 'minggacha', 'arzonroq', 'narxi', 'narx', 'qancha', 'som', 'sum',
  'somdan', 'pul',
]);

/** Typos and dictation artefacts seen in RU/UZ speech-to-text output. */
function repairDictation(value: string): string {
  return value
    .replace(/(?:^|\s)пауэр\s*банк(?=\s|$)/gu, ' power bank')
    .replace(/(?:^|\s)павер\s*банк(?=\s|$)/gu, ' power bank')
    .replace(/(?:^|\s)повербанк(?=\s|$)/gu, ' power bank')
    .replace(/(?:^|\s)пауэрбанк(?=\s|$)/gu, ' power bank')
    .replace(/(?:^|\s)зарядка(?=\s|$)/gu, ' зарядное')
    .replace(/(?:^|\s)ming\s+gacha(?=\s|$)/gu, ' minggacha')
    .replace(/\s+/g, ' ')
    .trim();
}

interface NumeralPass {
  text: string;
  spelled: boolean;
}

/**
 * Rewrites spelled cardinals into digits so the shared UZS budget parser sees
 * the shape it already understands. `до ста тысяч` -> `до 100000`,
 * `ikki yuz ming` -> `200000`.
 */
function digitizeCardinals(normalized: string): NumeralPass {
  const tokens = normalized.split(' ').filter(Boolean);
  const output: string[] = [];
  let total = 0;
  let current = 0;
  let open = false;
  let spelled = false;

  const flush = () => {
    if (!open) return;
    const value = total + current;
    if (value > 0) output.push(String(value));
    total = 0;
    current = 0;
    open = false;
  };

  for (const token of tokens) {
    const cardinal = CARDINALS.get(token);
    if (cardinal !== undefined) {
      current += cardinal;
      open = true;
      spelled = true;
      continue;
    }
    if (HUNDREDS.has(token)) {
      current = (current === 0 ? 1 : current) * 100;
      open = true;
      spelled = true;
      continue;
    }
    if (THOUSANDS.has(token) && open) {
      total += (current === 0 ? 1 : current) * 1_000;
      current = 0;
      spelled = true;
      continue;
    }
    if (MILLIONS.has(token) && open) {
      total += (current === 0 ? 1 : current) * 1_000_000;
      current = 0;
      spelled = true;
      continue;
    }
    flush();
    output.push(token);
  }
  flush();
  return { text: output.join(' '), spelled };
}

function boundedQuery(tokens: readonly string[]): string {
  const selected: string[] = [];
  for (const token of tokens) {
    if (selected.length >= CATALOG_LIMITS.queryTokens) break;
    const next = selected.length === 0 ? token : `${selected.join(' ')} ${token}`;
    if (next.length > CATALOG_LIMITS.queryLength) break;
    selected.push(token);
  }
  return selected.join(' ');
}

function safeBudget(value: string): ReturnType<typeof parseBudget> {
  try {
    return parseBudget(value, value);
  } catch {
    // A malformed amount must not fail the whole search; it stays unconstrained.
    return { status: 'none' };
  }
}

/** Smallest number worth asking about. Below it a digit reads as a model or
 * quantity, not as a UZS price, and is dropped without a question. */
const AMBIGUOUS_AMOUNT_FLOOR = 1_000;

/**
 * A standalone integer that the shared budget parser left unclaimed because no
 * budget cue accompanied it. Reported for clarification only — never applied.
 */
function standaloneAmount(text: string): number | null {
  for (const token of text.split(' ')) {
    if (!/^\d+$/.test(token)) continue;
    const value = Number(token);
    if (
      Number.isSafeInteger(value)
      && value >= AMBIGUOUS_AMOUNT_FLOOR
      && value <= CATALOG_LIMITS.priceMinor
    ) {
      return value;
    }
  }
  return null;
}

/**
 * Interprets one transcript. Never throws: an unusable transcript resolves to
 * an empty query plus a clarification request, which the UI turns into a single
 * short question instead of a dead end.
 */
export function interpretVoiceQuery(raw: unknown): VoiceInterpretation {
  const source = typeof raw === 'string'
    ? raw.slice(0, VOICE_TRANSCRIPT_MAX_CHARS)
    : '';
  const normalized = repairDictation(normalizeKnowledgeText(source));
  if (!normalized) {
    return {
      productQuery: '',
      maxPriceMinor: null,
      ambiguousPriceMinor: null,
      availability: null,
      categoryHint: null,
      constraints: [],
      clarification: 'empty_query',
      confidence: 'low',
    };
  }

  const availability = AVAILABILITY_CUES.some((cue) => cue.test(normalized))
    ? 'available' as const
    : null;

  const digitized = digitizeCardinals(normalized);
  const budget = safeBudget(digitized.text);
  const maxPriceMinor = budget.status === 'explicit' ? budget.maxPriceMinor : null;
  // A number with no budget cue stays ambiguous on purpose: `powerbank 20000`
  // may be a price or a battery capacity, so Bormi asks once instead of
  // guessing — and never applies it as a filter in the meantime.
  const ambiguousPriceMinor = maxPriceMinor === null
    ? budget.status === 'ambiguous'
      ? budget.amountMinor
      : standaloneAmount(digitized.text)
    : null;
  const clarification: VoiceClarification = ambiguousPriceMinor === null
    ? null
    : 'budget';

  const constraints: VoiceConstraint[] = [];
  const attributes: string[] = [];
  const kept: string[] = [];
  for (const token of digitized.text.split(' ').filter(Boolean)) {
    if (/^\d+$/.test(token)) continue;
    if (STOP_WORDS.has(token)) continue;
    const attribute = ATTRIBUTES.get(token);
    if (attribute && !attributes.includes(attribute)) attributes.push(attribute);
    if (!kept.includes(token)) kept.push(token);
  }

  const productQuery = boundedQuery(kept);
  if (productQuery) constraints.push({ kind: 'query', value: productQuery });
  if (maxPriceMinor !== null) {
    constraints.push({ kind: 'budget', value: String(maxPriceMinor) });
  }
  if (availability) constraints.push({ kind: 'availability', value: 'available' });
  for (const attribute of attributes) {
    constraints.push({ kind: 'attribute', value: attribute });
  }

  const confidence = productQuery && (maxPriceMinor !== null || availability)
    ? 'high'
    : productQuery
      ? 'medium'
      : 'low';

  return {
    productQuery,
    maxPriceMinor,
    ambiguousPriceMinor,
    availability,
    categoryHint: productQuery || null,
    constraints,
    // With no product words there is nothing to search, so the one permitted
    // question asks for the product rather than for the budget.
    clarification: productQuery ? clarification : 'empty_query',
    confidence,
  };
}

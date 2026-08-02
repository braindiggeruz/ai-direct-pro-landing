// Turning a sentence into a catalog query.
//
// A shopper does not type «блокнот». They type «Мне нужен блокнот.», and a
// speaker says the same thing out loud. The catalog search accepts at most
// CATALOG_LIMITS.queryTokens tokens and scores every token it is handed, so the
// intent words do two kinds of damage: they dilute the existing relevance score,
// and they come back through `relevance.unmatchedConstraints` as
// «Не нашли по условию: мне, нужен» — an honest answer to a question the shopper
// never asked.
//
// This module owns the shared RU / Uzbek-Latin vocabulary. Voice interpretation
// imports it, and the typed catalog route now runs the same reduction, which is
// what keeps the two paths interchangeable: the documented invariant is that
// voice can never reach a product typed search would not, and giving both the
// identical treatment preserves it rather than weakening it.
//
// Everything here is pure, offline and deterministic. No model decides what a
// shopper meant.
import { CATALOG_LIMITS } from '../agents/sotuvchi/catalog';
import { normalizeKnowledgeText } from '../platform/knowledge';

/**
 * Intent verbs, politeness and budget scaffolding. Removing them keeps the
 * query inside CATALOG_LIMITS.queryTokens and stops guaranteed-unmatched
 * tokens from diluting the existing relevance score.
 */
export const QUERY_STOP_WORDS: ReadonlySet<string> = new Set([
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
export function repairDictation(value: string): string {
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

/** Keeps the query inside the shape the catalog search already accepts. */
export function boundQueryTokens(tokens: readonly string[]): string {
  const selected: string[] = [];
  for (const token of tokens) {
    if (selected.length >= CATALOG_LIMITS.queryTokens) break;
    const next = selected.length === 0 ? token : `${selected.join(' ')} ${token}`;
    if (next.length > CATALOG_LIMITS.queryLength) break;
    selected.push(token);
  }
  return selected.join(' ');
}

export interface ReducedSearchQuery {
  /** Exactly what the catalog search receives. */
  query: string;
  /** Intent words that were dropped. Empty when the query was already clean. */
  removed: readonly string[];
  /** True when the reduction changed nothing, so callers can skip reporting. */
  unchanged: boolean;
}

/**
 * Reduces one typed query.
 *
 * Two deliberate differences from the spoken reduction:
 *
 * 1. **Digits are kept.** A spoken `20000` is genuinely ambiguous — price or
 *    battery capacity — so voice holds it back and asks. A typed `iphone 15` or
 *    `блокнот a5` carries no such doubt, and silently deleting the model number
 *    would be a worse answer than leaving it in.
 * 2. **An empty reduction falls back to the original.** If someone types only
 *    intent words, answering with the whole catalog would look like a match.
 *    The unreduced query is searched instead, so an honest zero result stays a
 *    zero result.
 */
export function reduceSearchQuery(raw: string): ReducedSearchQuery {
  const normalized = repairDictation(normalizeKnowledgeText(raw));
  if (!normalized) return { query: '', removed: [], unchanged: true };

  const kept: string[] = [];
  const removed: string[] = [];
  for (const token of normalized.split(' ').filter(Boolean)) {
    if (QUERY_STOP_WORDS.has(token)) {
      if (!removed.includes(token)) removed.push(token);
      continue;
    }
    if (!kept.includes(token)) kept.push(token);
  }

  const query = boundQueryTokens(kept);
  if (!query) {
    return { query: boundQueryTokens(normalized.split(' ').filter(Boolean)), removed: [], unchanged: true };
  }
  return { query, removed, unchanged: removed.length === 0 && query === normalized };
}

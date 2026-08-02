// Grounding a shopper's sentence in the words the catalog actually knows.
//
// The first attempt at this was a hand-written stop-word list. It cannot work,
// and the reason is worth stating so nobody rebuilds it: Russian and Uzbek
// inflect. The catalog stores «Блокнот»; a shopper says «блокноты», «блокнотов»,
// «bloknotlar». The ranking layer matches by substring, so the stored word is
// found inside «блокноты» but not inside «блокнотов», and the query word comes
// back as an unmatched constraint. No list of filler words fixes that, and no
// list is ever finished — «слушай», «можешь», «дать» were all missing from the
// first one.
//
// The rule here is the other way round: **keep only the words the catalog
// knows**, matched by stem rather than by equality. Filler is dropped not
// because it is on a list but because no product, alias or category contains
// it. Morphology is handled because «блокнотов» and «блокнот» share a stem, and
// the *catalog's* form is what gets searched.
//
// This is deterministic and offline. It never invents a product: every token it
// emits was read out of the storefront a moment earlier.
import { CATALOG_LIMITS } from '../agents/sotuvchi/catalog';
import { normalizeKnowledgeText } from '../platform/knowledge';
import { boundQueryTokens, repairDictation } from './search-query';

export interface CatalogVocabularyInput {
  /** Product names, seller aliases and category names, exactly as stored. */
  terms: readonly string[];
  categories: readonly { id: string; name: string }[];
}

export interface CatalogVocabulary {
  /** Every distinct normalized word the storefront contains. */
  words: readonly string[];
  categories: readonly { id: string; name: string; normalized: string }[];
  /** Bounded, human-readable term list for the AI resolver's closed choice. */
  promptTerms: readonly string[];
}

export interface GroundedQuery {
  /** Only catalog words. This is what `searchPublishedProducts` receives. */
  query: string;
  /** `{ spoken -> catalog }` for every token the stem match rewrote. */
  rewrites: readonly { from: string; to: string }[];
  /**
   * Words no product, alias or category contains. Diagnostic only — it is
   * deliberately **not** shown to the shopper.
   *
   * The old UI accused them: «Не нашли по условию: слушай, можешь, дать». That
   * needs a filler list to be fair, and a filler list is never finished. The
   * honest version needs no list: since the query now contains only catalog
   * words, nothing here was ever applied as a condition, so the shopper is told
   * what Bormi *did* search for instead. A dropped «чёрная» is visible the same
   * way — «Искали: наушники» says colour was not used.
   */
  dropped: readonly string[];
  /** True when at least one token was grounded in the catalog. */
  grounded: boolean;
}

/**
 * The shortest word worth stem-matching. Below this, a shared prefix is
 * coincidence: «дай» and «дата» are not the same word.
 */
const MIN_STEM = 4;

/**
 * How much of the shorter word the shared prefix must cover. Three quarters
 * keeps «блокнот»/«блокнотов» and «лампа»/«лампочка» together while keeping
 * «колонка» and «колонна» apart.
 */
const STEM_RATIO = 0.75;

function commonPrefixLength(left: string, right: string): number {
  const bound = Math.min(left.length, right.length);
  let index = 0;
  while (index < bound && left[index] === right[index]) index += 1;
  return index;
}

/** Same word, different ending. */
export function sharesStem(spoken: string, catalogWord: string): boolean {
  if (spoken === catalogWord) return true;
  const shorter = Math.min(spoken.length, catalogWord.length);
  if (shorter < MIN_STEM) return false;
  const prefix = commonPrefixLength(spoken, catalogWord);
  return prefix >= Math.max(MIN_STEM, Math.ceil(shorter * STEM_RATIO));
}

const MAX_PROMPT_TERMS = 120;

export function buildCatalogVocabulary(
  input: CatalogVocabularyInput,
): CatalogVocabulary {
  const words: string[] = [];
  const add = (raw: string) => {
    for (const token of normalizeKnowledgeText(raw).split(' ')) {
      if (token && !words.includes(token)) words.push(token);
    }
  };
  for (const term of input.terms) add(term);
  for (const category of input.categories) add(category.name);
  const promptTerms: string[] = [];
  for (const term of input.terms) {
    const trimmed = term.trim();
    if (trimmed && !promptTerms.includes(trimmed)) promptTerms.push(trimmed);
    if (promptTerms.length >= MAX_PROMPT_TERMS) break;
  }
  return {
    words,
    categories: input.categories.map((category) => ({
      id: category.id,
      name: category.name,
      normalized: normalizeKnowledgeText(category.name),
    })),
    promptTerms,
  };
}

/**
 * Isolate-local vocabulary cache.
 *
 * A storefront's words change when the seller edits the catalog, which is rare,
 * while search runs on every keystroke-completed query. Reading 100 rows per
 * search would spend the latency budget the fast path was built to protect, so
 * the vocabulary is held per isolate for a minute. It is derived, public
 * catalog data — no price, stock or identity — and a stale minute can only mean
 * a brand-new product name is not yet used for stem matching; it is still found
 * by the catalog search itself.
 */
const VOCABULARY_TTL_MS = 60_000;
const vocabularyCache = new Map<string, { at: number; value: CatalogVocabulary }>();

export function cachedVocabulary(
  storeId: string,
  now: number,
): CatalogVocabulary | null {
  const hit = vocabularyCache.get(storeId);
  if (!hit || now - hit.at > VOCABULARY_TTL_MS) {
    if (hit) vocabularyCache.delete(storeId);
    return null;
  }
  return hit.value;
}

export function rememberVocabulary(
  storeId: string,
  value: CatalogVocabulary,
  now: number,
): void {
  // Bounded so one isolate serving many storefronts cannot grow without limit.
  if (vocabularyCache.size > 32) vocabularyCache.clear();
  vocabularyCache.set(storeId, { at: now, value });
}

/**
 * Rewrites one sentence into catalog words.
 *
 * A token is kept when the catalog contains that exact word, or a word sharing
 * its stem — in which case the **catalog's** form is what gets searched, since
 * that is the form the ranking layer can find. Everything else is dropped from
 * the query; whether it is also reported back depends only on whether it looks
 * like filler, and that judgement never affects what is searched.
 */
export function groundQueryInCatalog(
  raw: string,
  vocabulary: CatalogVocabulary,
): GroundedQuery {
  const normalized = repairDictation(normalizeKnowledgeText(raw));
  if (!normalized) {
    return { query: '', rewrites: [], dropped: [], grounded: false };
  }

  const kept: string[] = [];
  const rewrites: { from: string; to: string }[] = [];
  const dropped: string[] = [];

  for (const token of normalized.split(' ').filter(Boolean)) {
    if (vocabulary.words.includes(token)) {
      if (!kept.includes(token)) kept.push(token);
      continue;
    }
    const stemmed = vocabulary.words.find((word) => sharesStem(token, word));
    if (stemmed !== undefined) {
      if (!kept.includes(stemmed)) kept.push(stemmed);
      rewrites.push({ from: token, to: stemmed });
      continue;
    }
    if (!dropped.includes(token)) dropped.push(token);
  }

  return {
    query: boundQueryTokens(kept),
    rewrites,
    dropped: dropped.slice(0, CATALOG_LIMITS.queryTokens),
    grounded: kept.length > 0,
  };
}

/**
 * Keeps only the terms the storefront really contains. Used on whatever the
 * AI resolver returns, so a model that hallucinates a product name produces an
 * empty query rather than a search for something that does not exist.
 */
export function keepCatalogWords(
  terms: readonly string[],
  vocabulary: CatalogVocabulary,
): string[] {
  const kept: string[] = [];
  for (const term of terms) {
    for (const token of normalizeKnowledgeText(String(term ?? '')).split(' ')) {
      if (!token) continue;
      const exact = vocabulary.words.includes(token) ? token : undefined;
      const resolved = exact
        ?? vocabulary.words.find((word) => sharesStem(token, word));
      if (resolved !== undefined && !kept.includes(resolved)) kept.push(resolved);
    }
  }
  return kept;
}

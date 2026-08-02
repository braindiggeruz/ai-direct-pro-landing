// Semantic search intent, constrained to the catalog.
//
// The deterministic layer in `search-intent.ts` handles the common case: a
// shopper says the product's name in some inflected form and the stem match
// finds it. It cannot handle meaning — «что-нибудь чтобы записывать», «подарок
// маме», «хочу слушать музыку в дороге» contain no catalog word at all.
//
// That is what this module is for, and it is deliberately the *fallback*, not
// the default: most sentences ground instantly and never spend a model call.
//
// The grounding invariant is preserved by construction rather than by trust.
// The model is given the storefront's real terms and real categories and asked
// to choose among them; whatever it answers is then intersected with that same
// vocabulary before anything is searched. A model that invents «блокнот Moleskine»
// produces an empty query, not a search for a product the store does not sell.
// Products still come only from `searchPublishedProducts`.
import {
  AiPolicyResolver,
  createAiFacade,
  createLegacyLlmStructuredDriver,
  type AiFacade,
} from '../platform/ai';
import { CATALOG_LIMITS } from '../agents/sotuvchi/catalog';
import { marketFlag } from '../platform/market/http';
import type { Env } from '../_types';
import {
  keepCatalogWords,
  type CatalogVocabulary,
} from './search-intent';

export const AI_SEARCH_LIMITS = Object.freeze({
  timeoutMs: 4_000,
  maxTerms: 4,
  maxSentenceChars: 240,
});

export interface AiSearchIntent {
  query: string;
  categoryId: string | null;
  maxPriceMinor: number | null;
  availability: 'available' | null;
}

/**
 * Advertised only when it can run: the switch must be on and the shared LLM
 * stack must have at least one credential. Reusing the voice discipline here
 * means a shopper never waits on a call that was always going to fail.
 */
export function aiSearchAvailable(env: Env): boolean {
  return marketFlag(env.MARKET_AI_SEARCH_ENABLED) && Boolean(
    env.GROQ_API_KEY
    || env.CEREBRAS_API_KEY
    || env.MISTRAL_API_KEY
    || env.GEMINI_API_KEY
    || env.OPENROUTER_API_KEY,
  );
}

interface RawIntent {
  terms: string[];
  categoryId: string | null;
  maxPriceMinor: number | null;
  availability: string | null;
}

/**
 * Runtime schema. Shape only — the values are checked against the catalog
 * afterwards, because a schema can say "string" but not "a product this store
 * actually sells".
 */
const INTENT_SCHEMA = {
  parse(value: unknown): RawIntent {
    if (!value || typeof value !== 'object') throw new Error('not_an_object');
    const record = value as Record<string, unknown>;
    const terms = Array.isArray(record.terms)
      ? record.terms.filter((item): item is string => typeof item === 'string')
      : [];
    const categoryId = typeof record.categoryId === 'string' ? record.categoryId : null;
    const maxPriceMinor = typeof record.maxPriceMinor === 'number'
      ? record.maxPriceMinor
      : null;
    const availability = typeof record.availability === 'string'
      ? record.availability
      : null;
    return { terms, categoryId, maxPriceMinor, availability };
  },
};

export function createMarketSearchFacade(env: Env): AiFacade {
  const driver = createLegacyLlmStructuredDriver(env, {
    // `judge` is the existing light, short-JSON route: a small fast model with
    // the shared retry, circuit-breaker and usage accounting already attached.
    featureByTask: { intent: 'judge' },
  });
  return createAiFacade({
    drivers: [driver],
    policy: new AiPolicyResolver([{
      task: 'intent',
      routes: [{ driver: driver.id }],
      timeoutMs: AI_SEARCH_LIMITS.timeoutMs,
      temperature: 0,
    }]),
  });
}

function systemPrompt(vocabulary: CatalogVocabulary): string {
  const categories = vocabulary.categories
    .map((category) => `${category.id} = ${category.name}`)
    .join('\n');
  return [
    'You turn one shopper sentence into a catalog query for a small store.',
    'The shopper may write Russian, Uzbek Latin or a mix, and may ramble.',
    'Work out what product they want, then express it using ONLY the words in',
    'CATALOG TERMS below. Never introduce a brand, model or product the store',
    'does not list. If nothing in the catalog fits, return an empty terms list.',
    '',
    'Answer with JSON only:',
    '{"terms":["..."],"categoryId":null,"maxPriceMinor":null,"availability":null}',
    '',
    `terms: at most ${AI_SEARCH_LIMITS.maxTerms} words taken from CATALOG TERMS.`,
    'categoryId: one id from CATEGORIES, or null.',
    'maxPriceMinor: an integer price ceiling in UZS if the shopper named one, else null.',
    'availability: "available" only if the shopper explicitly asked for in-stock items, else null.',
    '',
    'CATEGORIES:',
    categories || '(none)',
    '',
    'CATALOG TERMS:',
    vocabulary.promptTerms.join(' | '),
  ].join('\n');
}

/**
 * Asks the model once. Any failure — timeout, outage, malformed answer — is
 * swallowed: search must degrade to the deterministic result, never to an
 * error screen.
 */
export async function resolveSearchIntentWithAi(
  facade: AiFacade,
  sentence: string,
  vocabulary: CatalogVocabulary,
): Promise<AiSearchIntent | null> {
  const trimmed = sentence.trim().slice(0, AI_SEARCH_LIMITS.maxSentenceChars);
  if (!trimmed || vocabulary.promptTerms.length === 0) return null;

  let raw: RawIntent;
  try {
    const outcome = await facade.structured(
      {
        messages: [
          { role: 'system', content: systemPrompt(vocabulary) },
          { role: 'user', content: trimmed },
        ],
        temperature: 0,
        timeoutMs: AI_SEARCH_LIMITS.timeoutMs,
      },
      INTENT_SCHEMA,
      { task: 'intent' },
    );
    raw = outcome.value;
  } catch {
    return null;
  }

  // Everything below is the guard: the model proposed, the catalog disposes.
  const terms = keepCatalogWords(
    raw.terms.slice(0, AI_SEARCH_LIMITS.maxTerms),
    vocabulary,
  );
  const categoryId = vocabulary.categories.some(
    (category) => category.id === raw.categoryId,
  )
    ? raw.categoryId
    : null;
  const maxPriceMinor = Number.isSafeInteger(raw.maxPriceMinor)
    && raw.maxPriceMinor !== null
    && raw.maxPriceMinor > 0
    && raw.maxPriceMinor <= CATALOG_LIMITS.priceMinor
    ? raw.maxPriceMinor
    : null;
  const availability = raw.availability === 'available' ? 'available' as const : null;

  if (terms.length === 0 && categoryId === null) return null;
  return {
    query: terms.slice(0, CATALOG_LIMITS.queryTokens).join(' '),
    categoryId,
    maxPriceMinor,
    availability,
  };
}

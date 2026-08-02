import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AiPolicyResolver,
  createAiFacade,
  type AiDriverRegistration,
} from '../functions/platform/ai';
import {
  aiSearchAvailable,
  resolveSearchIntentWithAi,
} from '../functions/market/search-ai';
import {
  buildCatalogVocabulary,
  groundQueryInCatalog,
  keepCatalogWords,
  sharesStem,
} from '../functions/market/search-intent';
import type { Env } from '../functions/_types';

const ROOT = new URL('../', import.meta.url);

function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

/** A storefront shaped like the production one: a few real product names. */
const STORE = buildCatalogVocabulary({
  terms: [
    'Блокнот А5',
    'Блокнот в клетку',
    'Беспроводные наушники AirBeat',
    'Электрический чайник Steel 1.7',
    'Кабель USB-C 100W',
    'Bloknot A4',
  ],
  categories: [
    { id: 'cat-audio', name: 'Аудио' },
    { id: 'cat-office', name: 'Канцелярия' },
  ],
});

function aiEnv(overrides: Partial<Env> = {}): Env {
  return {
    MARKET_AI_SEARCH_ENABLED: 'true',
    GROQ_API_KEY: 'unit-test-only-key',
    ...overrides,
  } as unknown as Env;
}

/** A driver that answers with whatever JSON the test wants to hand back. */
function fakeStructuredDriver(text: string): AiDriverRegistration {
  return {
    id: 'test-structured',
    async structured() {
      return { text };
    },
  };
}

function fakeFacade(text: string) {
  const driver = fakeStructuredDriver(text);
  return createAiFacade({
    drivers: [driver],
    policy: new AiPolicyResolver([
      { task: 'intent', routes: [{ driver: driver.id }] },
    ]),
  });
}

test('an inflected word finds the form the catalog actually stores', () => {
  // The whole point: no list of endings, no list of filler.
  assert.equal(groundQueryInCatalog('блокнотов', STORE).query, 'блокнот');
  assert.equal(groundQueryInCatalog('блокноты', STORE).query, 'блокнот');
  assert.equal(groundQueryInCatalog('наушниками', STORE).query, 'наушники');
  assert.equal(groundQueryInCatalog('bloknotlar', STORE).query, 'bloknot');
});

test("the owner's sentence reaches the catalog as one word", () => {
  const grounded = groundQueryInCatalog(
    'Слушай, мне нужны блокноты, можешь дать блокнотов',
    STORE,
  );
  assert.equal(grounded.query, 'блокнот');
  assert.equal(grounded.grounded, true);
  // «слушай», «можешь», «дать» are gone because no product contains them —
  // not because anyone remembered to add them to a list.
  assert.deepEqual(
    [...grounded.dropped],
    ['слушай', 'мне', 'нужны', 'можешь', 'дать'],
  );
});

test('a condition the store cannot meet is dropped, and the shopper can see it', () => {
  // «чёрная» is a genuine request the catalog has no field for. It is not
  // applied and not accused: the honest signal is the positive one — the client
  // shows «Искали: наушники», so the shopper sees colour was not part of it.
  const grounded = groundQueryInCatalog('чёрная наушники', STORE);
  assert.equal(grounded.query, 'наушники');
  assert.deepEqual([...grounded.dropped], ['чёрная']);
});

test('the dropped list is diagnostic and never reaches the client', async () => {
  const router = await source('functions/market/router.ts');
  assert.doesNotMatch(router, /dropped/);
  assert.doesNotMatch(router, /notUnderstood/);
  const buyer = await source('apps/market-mini-app/src/screens/BuyerApp.tsx');
  // The accusing line is gone; what replaced it states what actually ran.
  assert.doesNotMatch(buyer, /'unmatched'\)/);
  assert.match(buyer, /t\(locale, 'searchedFor'\)/);
});

test('a sentence with nothing from the catalog grounds nothing', () => {
  const grounded = groundQueryInCatalog('хочу что-нибудь для записей', STORE);
  assert.equal(grounded.query, '');
  assert.equal(grounded.grounded, false);
});

test('stem matching does not merge merely similar words', () => {
  assert.equal(sharesStem('блокнотов', 'блокнот'), true);
  assert.equal(sharesStem('лампочка', 'лампа'), true);
  assert.equal(sharesStem('колонка', 'колонна'), false);
  assert.equal(sharesStem('дай', 'дата'), false);
  assert.equal(sharesStem('мне', 'мяч'), false);
});

test('grounding is idempotent, so the voice route may pay for it twice', () => {
  const once = groundQueryInCatalog('нужны блокноты', STORE);
  const twice = groundQueryInCatalog(once.query, STORE);
  assert.equal(twice.query, once.query);
});

test('the model may only select words the store really sells', async () => {
  const kept = keepCatalogWords(
    ['блокнот', 'Moleskine Classic', 'iphone'],
    STORE,
  );
  assert.deepEqual(kept, ['блокнот']);
});

test('a hallucinated product resolves to nothing, never to a search', async () => {
  const intent = await resolveSearchIntentWithAi(
    fakeFacade('{"terms":["Moleskine"],"categoryId":"cat-fake","maxPriceMinor":null,"availability":null}'),
    'хочу что-нибудь для записей',
    STORE,
  );
  assert.equal(intent, null);
});

test('a grounded model answer becomes a real catalog query', async () => {
  const intent = await resolveSearchIntentWithAi(
    fakeFacade('{"terms":["блокнот"],"categoryId":"cat-office","maxPriceMinor":50000,"availability":"available"}'),
    'хочу что-нибудь чтобы записывать',
    STORE,
  );
  assert.ok(intent);
  assert.equal(intent.query, 'блокнот');
  assert.equal(intent.categoryId, 'cat-office');
  assert.equal(intent.maxPriceMinor, 50_000);
  assert.equal(intent.availability, 'available');
});

test('a broken or absurd model answer degrades to the deterministic result', async () => {
  assert.equal(
    await resolveSearchIntentWithAi(fakeFacade('not json at all'), 'что-нибудь', STORE),
    null,
  );
  const negative = await resolveSearchIntentWithAi(
    fakeFacade('{"terms":["блокнот"],"categoryId":null,"maxPriceMinor":-5,"availability":"maybe"}'),
    'что-нибудь',
    STORE,
  );
  assert.ok(negative);
  assert.equal(negative.maxPriceMinor, null);
  assert.equal(negative.availability, null);
});

test('AI search is advertised only when it can actually run', () => {
  assert.equal(aiSearchAvailable(aiEnv()), true);
  assert.equal(aiSearchAvailable(aiEnv({ MARKET_AI_SEARCH_ENABLED: 'false' })), false);
  assert.equal(
    aiSearchAvailable({ MARKET_AI_SEARCH_ENABLED: 'true' } as unknown as Env),
    false,
  );
});

test('the AI kill switch is declared in the authoritative wrangler config', async () => {
  const config = await source('wrangler.toml');
  assert.match(config, /^MARKET_AI_SEARCH_ENABLED = "true"$/m);
});

test('search intent code never logs a shopper sentence', async () => {
  for (const path of [
    'functions/market/search-intent.ts',
    'functions/market/search-ai.ts',
  ]) {
    const file = await source(path);
    assert.doesNotMatch(file, /console\.(log|info|warn|error|debug)/);
  }
});

test('the catalog vocabulary read is additive and stays read-only', async () => {
  const service = await source('functions/agents/sotuvchi/catalog/service.ts');
  assert.match(service, /async listStorefrontVocabulary\(/);
  // It reuses the published listing every buyer read already goes through.
  assert.match(service, /listStorefrontVocabulary[\s\S]{0,400}this\.store\.listPublished\(/);
  // Ranking is untouched by this change.
  assert.match(service, /export function rankCatalogProducts\(/);
});

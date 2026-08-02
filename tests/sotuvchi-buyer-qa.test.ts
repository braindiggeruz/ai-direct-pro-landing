import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTelegramAgentsRuntimeWiring } from '../functions/api/telegram/agents';
import {
  BuyerQueryValidationError,
  composeBuyerResponse,
  createSotuvchiBuyerQueryService,
  createSotuvchiCatalogService,
  createSotuvchiOnboardingService,
  formatBuyerAvailability,
  formatBuyerPrice,
  parseBuyerQuery,
  projectBuyerFacts,
  type BuyerQueryResult,
  type CatalogProduct,
  type SotuvchiCatalogService,
  type SotuvchiIdentityContext,
  type StoreOwnerContext,
  type StorefrontContext,
} from '../functions/agents/sotuvchi';
import {
  createTelegramAgentUpdateStore,
  createTelegramIdentityPort,
  handleTelegramAgentsWebhook,
  type TelegramAgentsWebhookDependencies,
  type TelegramDeliveryPort,
} from '../functions/channels/telegram';
import { createIdentityService } from '../functions/platform/identity';
import {
  groundResponse,
  validateFactSheet,
} from '../functions/platform/runtime';
import { SqliteD1 } from './helpers/sqlite-d1';
import { activatePilotStore } from './helpers/pilot-store';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOT = 'agents_buyer_fixture_bot';
const SECRET = 'fixture-buyer-webhook-secret';
let sequence = 0;

function requestId(prefix = 'buyer'): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

interface StoreFixture {
  catalog: SotuvchiCatalogService;
  identity: SotuvchiIdentityContext;
  owner: StoreOwnerContext;
  storefront: StorefrontContext;
  storefrontCode: string;
}

async function setupStore(
  fixture: SqliteD1,
  externalId: string,
  locale: 'ru' | 'uz' = 'ru',
): Promise<StoreFixture> {
  const db = fixture.asD1();
  const identity = await createIdentityService(db).getOrCreateIdentity(
    'telegram',
    externalId,
  );
  const context: SotuvchiIdentityContext = {
    identityId: identity.identity.id,
    botUsername: BOT,
    requestId: requestId('onboarding'),
    locale,
  };
  const onboarding = createSotuvchiOnboardingService(db);
  let snapshot = await onboarding.startOnboarding(context);
  for (const [step, value] of [
    ['name', locale === 'ru' ? 'Тестовый магазин' : 'Sinov do‘koni'],
    ['locale', locale],
    ['delivery', 'both'],
    ['payment', ['cash']],
  ] as const) {
    snapshot = await onboarding.submitOnboardingStep(
      { ...context, requestId: requestId('onboarding') },
      {
        step,
        value,
        expectedVersion: snapshot.version,
        idempotencyKey: requestId('step'),
      } as never,
    );
  }
  const completed = await onboarding.confirmOnboarding(
    { ...context, requestId: requestId('onboarding') },
    snapshot.version,
  );
  await activatePilotStore(db, completed.store.orgId, completed.store.id);
  const catalog = createSotuvchiCatalogService(db);
  const owner = await catalog.resolveOwnerContext({
    identityId: context.identityId,
    orgId: completed.store.orgId,
    requestId: requestId('owner'),
    locale,
  });
  return {
    catalog,
    identity: context,
    owner,
    storefront: {
      orgId: completed.store.orgId,
      storeId: completed.store.id,
      agentId: 'sotuvchi',
      locale,
    },
    storefrontCode: completed.store.storefrontCode,
  };
}

function nextOwner(owner: StoreOwnerContext): StoreOwnerContext {
  return { ...owner, requestId: requestId('owner') };
}

async function createAndPublish(
  setup: StoreFixture,
  input: Partial<{
    name: string;
    description: string | null;
    priceMinor: number;
    availability: 'available' | 'unavailable' | 'preorder';
    categoryId: string | null;
    searchTerms: readonly string[];
    specifications: readonly {
      key: string;
      labelRu: string;
      labelUz: string;
      value: string;
    }[];
  }> = {},
): Promise<CatalogProduct> {
  const draft = await setup.catalog.createProduct(nextOwner(setup.owner), {
    name: 'Olma sharbati',
    description: 'Tabiiy sinov mahsuloti',
    priceMinor: 125_000,
    currency: 'UZS',
    availability: 'available',
    mediaRefs: [],
    ...input,
  });
  return setup.catalog.publishProduct(
    nextOwner(setup.owner),
    draft.id,
    draft.version,
  );
}

const parserCases: readonly [
  string,
  string,
  Partial<ReturnType<typeof parseBuyerQuery>>,
][] = [
  ['RU catalog list', 'что у вас есть', { intent: 'catalog.list' }],
  ['RU product list phrase', 'покажи товары', { intent: 'catalog.list' }],
  ['RU comparison', 'сравнить товары', { intent: 'catalog.compare' }],
  ['RU price', 'сколько стоит Samsung', {
    intent: 'product.price',
    productQuery: 'samsung',
  }],
  ['RU availability', 'есть ли Samsung', {
    intent: 'product.availability',
    productQuery: 'samsung',
  }],
  ['RU details', 'расскажи про Samsung', {
    intent: 'product.details',
    productQuery: 'samsung',
  }],
  ['RU price filter', 'что есть дешевле 200 000', {
    intent: 'catalog.filter_price',
    maxPriceMinor: 200_000,
  }],
  ['RU unknown', 'как оформить заказ', { intent: 'unknown' }],
  ['UZ catalog list', 'nima bor', { intent: 'catalog.list' }],
  ['UZ comparison', 'mahsulotlarni solishtirish', {
    intent: 'catalog.compare',
  }],
  ['UZ price', 'Samsung qancha turadi', {
    intent: 'product.price',
    productQuery: 'samsung',
  }],
  ['UZ availability', 'Samsung bormi', {
    intent: 'product.availability',
    productQuery: 'samsung',
  }],
  ['UZ details', 'Samsung haqida ayting', {
    intent: 'product.details',
    productQuery: 'samsung',
  }],
  ['UZ price filter', '200000 gacha', {
    intent: 'catalog.filter_price',
    maxPriceMinor: 200_000,
  }],
  ['UZ apostrophe modifier', 'ko‘rsating Samsung', {
    intent: 'product.details',
    productQuery: 'samsung',
  }],
  ['UZ ASCII apostrophe modifier', "ko'rsating Samsung", {
    intent: 'product.details',
    productQuery: 'samsung',
  }],
  ['UZ modifier apostrophe variant', 'koʻrsating Samsung', {
    intent: 'product.details',
    productQuery: 'samsung',
  }],
  ['mixed availability', 'Samsung естьmi', {
    intent: 'product.availability',
    productQuery: 'samsung',
  }],
  ['mixed previous price RU', 'narxi сколько', {
    intent: 'product.price',
    usePreviousProduct: true,
  }],
  ['mixed previous price UZ', 'qancha стоит', {
    intent: 'product.price',
    usePreviousProduct: true,
  }],
  ['simple RU typo', 'сколко стоит Samsung', {
    intent: 'product.price',
    productQuery: 'samsung',
  }],
];

for (const [name, input, expected] of parserCases) {
  test(`intent parser: ${name}`, () => {
    assert.deepEqual(parseBuyerQuery(input), expected);
  });
}

test('extraction preserves a bounded cleaned product query', () => {
  assert.deepEqual(parseBuyerQuery('  Сколько стоит   Samsung S24?  '), {
    intent: 'product.price',
    productQuery: 'samsung s24',
  });
});

test('budget extraction accepts RU, UZ and shorthand UZS variants', () => {
  assert.equal(
    parseBuyerQuery('до 100 000').maxPriceMinor,
    100_000,
  );
  for (const input of [
    '30k',
    '30 к',
    '30 ming',
    '30 minggacha',
    'до 30 тысяч',
    'максимум 30000',
    'бюджет 30 000',
    'byudjet 30.000',
  ]) {
    assert.deepEqual(parseBuyerQuery(input), {
      intent: 'catalog.filter_price',
      maxPriceMinor: 30_000,
    }, input);
  }
});

test('a context-free bare number requires confirmation', () => {
  for (const input of ['30000', '30 000', '30.000', '2024']) {
    assert.equal(parseBuyerQuery(input).intent, 'catalog.confirm_budget', input);
  }
  assert.deepEqual(parseBuyerQuery('Samsung S24'), {
    intent: 'catalog.search',
    productQuery: 'samsung s24',
  });
  assert.equal(
    parseBuyerQuery('2 штуки кабеля').intent,
    'catalog.search',
  );
});

test('extraction rejects float and negative price filters', () => {
  assert.throws(
    () => parseBuyerQuery('до 100.50'),
    BuyerQueryValidationError,
  );
  assert.throws(
    () => parseBuyerQuery('дешевле -100'),
    BuyerQueryValidationError,
  );
});

test('extraction rejects empty, long and control-bearing queries', () => {
  assert.throws(() => parseBuyerQuery(''), BuyerQueryValidationError);
  assert.throws(() => parseBuyerQuery('x'.repeat(241)), BuyerQueryValidationError);
  assert.throws(
    () => parseBuyerQuery(`Samsung${String.fromCharCode(0)}`),
    BuyerQueryValidationError,
  );
});

test('locale price and availability formatters are deterministic', () => {
  assert.equal(formatBuyerPrice(100_000, 'ru'), '100 000 сум');
  assert.equal(formatBuyerPrice(100_000, 'uz'), '100 000 so‘m');
  assert.equal(formatBuyerAvailability('available', 'ru'), 'В наличии');
  assert.equal(formatBuyerAvailability('unavailable', 'ru'), 'Нет в наличии');
  assert.equal(formatBuyerAvailability('preorder', 'ru'), 'Под заказ');
  assert.equal(formatBuyerAvailability('available', 'uz'), 'Mavjud');
  assert.equal(formatBuyerAvailability('unavailable', 'uz'), 'Mavjud emas');
  assert.equal(
    formatBuyerAvailability('preorder', 'uz'),
    'Buyurtma asosida',
  );
});

function resultFixture(
  overrides: Partial<CatalogProduct> = {},
): BuyerQueryResult {
  const product: CatalogProduct = {
    id: 'p-abcdefghijklmnop',
    orgId: 'org-hidden',
    storeId: 'store-hidden',
    categoryId: null,
    sku: 'SKU-HIDDEN',
    name: 'Sinov mahsuloti',
    description: 'X'.repeat(300),
    priceMinor: 100_000,
    currency: 'UZS',
    availability: 'available',
    status: 'published',
    mediaRefs: ['opaque-hidden'],
    searchTerms: [],
    specifications: [],
    version: 9,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  return {
    intent: 'product.details',
    results: [{
      product,
      categoryName: 'Ichimliklar',
      storeName: 'Sinov do‘koni',
      score: 4_000,
      matchedTokens: 1,
      matchedConstraints: ['text'],
      unmatchedConstraints: [],
      confidence: 'high',
      reasonCodes: ['exact_name', 'available'],
      sourceProductId: product.id,
      sourceStoreId: product.storeId,
    }],
    hasMore: false,
    nextOffset: 4,
    fullCard: true,
    state: 'ok',
  };
}

test('channel-neutral product card is bounded and excludes internal fields', () => {
  const values = projectBuyerFacts(resultFixture(), 'ru');
  const response = composeBuyerResponse(
    { toolName: 'catalog.product.get', values },
    'ru',
  );
  const serialized = JSON.stringify(response);
  assert.ok(serialized.includes('Sinov mahsuloti'));
  assert.ok(serialized.includes('100 000 сум'));
  assert.ok(serialized.includes('В наличии'));
  assert.ok(serialized.includes('Ichimliklar'));
  assert.ok(!serialized.includes('org-hidden'));
  assert.ok(!serialized.includes('store-hidden'));
  assert.ok(!serialized.includes('SKU-HIDDEN'));
  assert.ok(!serialized.includes('"version"'));
  assert.ok((response.messages[0].card?.description?.length ?? 0) <= 240);
});

test('card product claims pass strict grounding', () => {
  const facts = {
    toolName: 'catalog.product.get',
    values: projectBuyerFacts(resultFixture(), 'ru'),
  };
  assert.deepEqual(
    groundResponse(composeBuyerResponse(facts, 'ru'), [facts]),
    { status: 'passed' },
  );
});

test('unsupported card price and availability are rejected', () => {
  const facts = {
    toolName: 'catalog.product.get',
    values: projectBuyerFacts(resultFixture(), 'ru'),
  };
  const response = composeBuyerResponse(facts, 'ru');
  const card = response.messages[0].card!;
  const unsupportedPrice = {
    ...response,
    messages: [{
      ...response.messages[0],
      card: {
        ...card,
        fields: card.fields.map((field, index) =>
          index === 0 ? { ...field, value: '999 999 сум' } : field),
      },
    }],
  };
  const unsupportedAvailability = {
    ...response,
    messages: [{
      ...response.messages[0],
      card: {
        ...card,
        fields: card.fields.map((field, index) =>
          index === 1 ? { ...field, value: 'Всегда есть' } : field),
      },
    }],
  };
  assert.equal(groundResponse(unsupportedPrice, [facts]).status, 'failed');
  assert.equal(
    groundResponse(unsupportedAvailability, [facts]).status,
    'failed',
  );
});

test('number absent from Facts is rejected', () => {
  assert.equal(
    groundResponse(
      { messages: [{ text: 'Цена 777' }] },
      [{ toolName: 'catalog.search', values: {} }],
    ).status,
    'failed',
  );
});

test('buyer session schema migration is additive and content-free', () => {
  const buyerQa = fs.readFileSync(
    path.join(ROOT, 'migrations/0020_sotuvchi_buyer_qa.sql'),
    'utf8',
  );
  for (const column of [
    'last_product_id',
    'last_intent',
    'selection_request_key',
    'selected_at',
  ]) {
    assert.match(buyerQa, new RegExp(`ADD COLUMN ${column}`));
  }
  const experience = fs.readFileSync(
    path.join(ROOT, 'migrations/0026_market_buyer_experience.sql'),
    'utf8',
  );
  for (const column of [
    'preferred_locale',
    'pending_intent',
    'pending_request_key',
    'pending_at',
  ]) {
    assert.match(experience, new RegExp(`ADD COLUMN ${column}`));
  }
  const statements = `${buyerQa}\n${experience}`.replace(/^--.*$/gm, '');
  assert.doesNotMatch(
    statements,
    /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE)\b/i,
  );
  assert.doesNotMatch(statements, /message|transcript|phone|address/i);
});

test('comparison migration stores references and content-free relevance only', () => {
  const comparison = fs.readFileSync(
    path.join(ROOT, 'migrations/0028_market_product_comparison.sql'),
    'utf8',
  );
  for (const marker of [
    'sotuvchi_buyer_presentations',
    'sotuvchi_buyer_comparisons',
    'relevance_score',
    'matched_requirement_count',
    'missing_requirement_count',
    'UNIQUE (session_id, position)',
  ]) {
    assert.ok(comparison.includes(marker), marker);
  }
  const statements = comparison.replace(/^--.*$/gm, '');
  assert.doesNotMatch(
    statements,
    /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE)\b/i,
  );
  assert.doesNotMatch(
    statements,
    /message|transcript|query_text|phone|address|contact/i,
  );
});

test('buyer Runtime lists, searches and filters only published products', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91001');
  await createAndPublish(setup, {
    name: 'Alpha Phone',
    priceMinor: 90_000,
  });
  await createAndPublish(setup, {
    name: 'Beta Phone',
    priceMinor: 150_000,
  });
  await setup.catalog.createProduct(nextOwner(setup.owner), {
    name: 'Hidden Phone',
    priceMinor: 10,
    currency: 'UZS',
    availability: 'available',
    mediaRefs: [],
  });
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '91901');
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  const runtime = createTelegramAgentsRuntimeWiring(fixture.asD1(), BOT).runtime;
  const directList = await createSotuvchiBuyerQueryService(
    setup.catalog,
    BOT,
  ).list({
    orgId: setup.storefront.orgId,
    actorId: buyer.identity.id,
    requestId: requestId('direct'),
    locale: 'ru',
  }, 0);
  const directValues = projectBuyerFacts(directList, 'ru');
  assert.ok(
    Object.keys(directValues).length <= 64,
    String(Object.keys(directValues).length),
  );
  assert.deepEqual(
    Object.keys(directValues).filter(
      (key) => !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/.test(key),
    ),
    [],
  );
  assert.doesNotThrow(() => validateFactSheet(
    { toolName: 'catalog.list', values: directValues },
    'catalog.list',
  ));
  const base = {
    orgId: setup.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: buyer.identity.id,
    locale: 'ru' as const,
  };
  const listed = await runtime.run({
    ...base,
    requestId: requestId('runtime'),
    message: { kind: 'text' as const, text: 'что у вас есть' },
  });
  assert.equal(listed.status, 'answered', JSON.stringify({
    status: listed.status,
    reasonCode: listed.reasonCode,
    toolExecutions: listed.toolExecutions,
    grounding: listed.grounding,
    factKeys: listed.facts[0]
      ? Object.keys(listed.facts[0].values).length
      : 0,
  }));
  assert.equal(listed.facts[0].values['catalog.result.count'], 2);
  assert.ok(!JSON.stringify(listed).includes('Hidden Phone'));

  const exact = await runtime.run({
    ...base,
    requestId: requestId('runtime'),
    message: { kind: 'text' as const, text: 'сколько стоит Alpha Phone' },
  });
  assert.equal(exact.status, 'answered');
  assert.equal(
    exact.facts[0].values['catalog.product.price_minor'],
    90_000,
  );

  const filtered = await runtime.run({
    ...base,
    requestId: requestId('runtime'),
    message: { kind: 'text' as const, text: 'до 100 000' },
  });
  assert.equal(filtered.facts[0].values['catalog.result.count'], 1);
  assert.equal(
    filtered.facts[0].values['catalog.results.0.name'],
    'Alpha Phone',
  );
});

test('category catalog renders three grounded cards and deterministic similar products', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '910011');
  const category = await setup.catalog.createCategory(
    nextOwner(setup.owner),
    { name: 'Тестовые телефоны', sortOrder: 1 },
  );
  const products: CatalogProduct[] = [];
  for (let index = 1; index <= 6; index += 1) {
    products.push(await createAndPublish(setup, {
      name: `Category Phone ${index}`,
      categoryId: category.id,
      priceMinor: 100_000 + index * 1_000,
      specifications: [
        {
          key: 'memory',
          labelRu: 'Память',
          labelUz: 'Xotira',
          value: '128 GB',
        },
        {
          key: 'color',
          labelRu: 'Цвет',
          labelUz: 'Rang',
          value: 'Черный',
        },
        {
          key: 'display',
          labelRu: 'Экран',
          labelUz: 'Ekran',
          value: '6.1 inch',
        },
        {
          key: 'warranty',
          labelRu: 'Гарантия',
          labelUz: 'Kafolat',
          value: '12 месяцев',
        },
      ],
    }));
  }
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '919011');
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  const runtime = createTelegramAgentsRuntimeWiring(fixture.asD1(), BOT).runtime;
  const base = {
    orgId: setup.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: buyer.identity.id,
    locale: 'ru' as const,
  };

  const categories = await runtime.run({
    ...base,
    requestId: requestId('category'),
    message: { kind: 'action' as const, actionId: 'buyer-catalog-open' },
  });
  assert.equal(categories.status, 'answered');
  assert.ok(categories.messages[0].choices?.some(
    (choice) => choice.id === `buyer-category.${category.id}`,
  ));

  const firstPage = await runtime.run({
    ...base,
    requestId: requestId('category'),
    message: {
      kind: 'action' as const,
      actionId: `buyer-category.${category.id}`,
    },
  });
  assert.equal(firstPage.status, 'answered');
  assert.equal(firstPage.facts[0].values['catalog.result.count'], 3);
  assert.ok(Object.keys(firstPage.facts[0].values).length <= 64);
  assert.equal(
    firstPage.facts[0].values['catalog.results.0.specification_count'],
    0,
  );
  assert.equal(firstPage.messages.length, 4);
  assert.ok(firstPage.messages.every(
    (message) => (message.card?.actions?.length ?? 0) <= 2,
  ));
  assert.ok(firstPage.messages.at(-1)?.choices?.some(
    (choice) => choice.id === `buyer-category-next.${category.id}.3`,
  ));

  const similar = await runtime.run({
    ...base,
    requestId: requestId('similar'),
    message: {
      kind: 'action' as const,
      actionId: `buyer-similar.${products[0].id}`,
    },
  });
  assert.equal(similar.status, 'answered');
  assert.ok(
    Number(similar.facts[0].values['catalog.result.count']) <= 4,
  );
  const similarCount = Number(
    similar.facts[0].values['catalog.result.count'],
  );
  assert.ok(Array.from({ length: similarCount }, (_unused, index) =>
    similar.facts[0].values[`catalog.results.${index}.id`],
  ).every((productId) => productId !== products[0].id));

  const details = await runtime.run({
    ...base,
    requestId: requestId('details'),
    message: {
      kind: 'action' as const,
      actionId: `buyer-details.${products[0].id}`,
    },
  });
  assert.equal(details.status, 'answered');
  assert.ok(JSON.stringify(details.messages).includes('128 GB'));
  assert.ok(JSON.stringify(details.messages).includes('Тестовый магазин'));
});

test('comparison keeps two or three grounded products in the trusted buyer store', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '910012');
  const leader = await createAndPublish(setup, {
    name: 'Alpha Test Phone',
    description: 'Synthetic phone for testing',
    priceMinor: 60_000,
    searchTerms: ['gaming'],
    specifications: [
      {
        key: 'memory',
        labelRu: 'Память',
        labelUz: 'Xotira',
        value: '256 GB',
      },
      {
        key: 'color',
        labelRu: 'Цвет',
        labelUz: 'Rang',
        value: 'Чёрный',
      },
    ],
  });
  const second = await createAndPublish(setup, {
    name: 'Beta Test Phone',
    description: 'Synthetic gaming phone',
    priceMinor: 80_000,
    specifications: [{
      key: 'memory',
      labelRu: 'Память',
      labelUz: 'Xotira',
      value: '128 GB',
    }],
  });
  const unavailable = await createAndPublish(setup, {
    name: 'Gamma Test Phone',
    description: 'Synthetic gaming phone',
    priceMinor: 70_000,
    availability: 'unavailable',
  });
  const fourth = await createAndPublish(setup, {
    name: 'Delta Test Phone',
    description: 'Synthetic gaming phone',
    priceMinor: 50_000,
  });
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '919012');
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  const runtime = createTelegramAgentsRuntimeWiring(fixture.asD1(), BOT).runtime;
  const base = {
    orgId: setup.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: buyer.identity.id,
    locale: 'ru' as const,
  };

  const searched = await runtime.run({
    ...base,
    requestId: requestId('compare-search'),
    message: { kind: 'text' as const, text: 'найди gaming' },
  });
  assert.equal(searched.status, 'answered');
  assert.equal(searched.facts[0].values['catalog.result.count'], 3);

  const first = await runtime.run({
    ...base,
    requestId: requestId('compare-add'),
    message: {
      kind: 'action' as const,
      actionId: `buyer-compare.${leader.id}`,
    },
  });
  assert.equal(first.status, 'answered');
  assert.equal(
    first.facts[0].values['catalog.result.state'],
    'comparison_waiting',
  );
  assert.equal(first.facts[0].values['catalog.result.count'], 1);

  const ready = await runtime.run({
    ...base,
    requestId: requestId('compare-add'),
    message: {
      kind: 'action' as const,
      actionId: `buyer-compare.${second.id}`,
    },
  });
  assert.equal(ready.status, 'answered', JSON.stringify({
    status: ready.status,
    reasonCode: ready.reasonCode,
    grounding: ready.grounding,
  }));
  assert.equal(
    ready.facts[0].values['catalog.result.state'],
    'comparison_ready',
  );
  assert.equal(ready.facts[0].values['catalog.result.count'], 2);
  assert.ok(Object.keys(ready.facts[0].values).length <= 64);
  assert.match(ready.messages[0].text, /Дешевле: Alpha Test Phone/);
  assert.match(ready.messages[0].text, /Ближе к запросу: Alpha Test Phone/);
  assert.ok(JSON.stringify(ready.messages).includes('256 GB'));
  assert.ok(JSON.stringify(ready.messages).includes('Цвет'));

  const duplicate = await runtime.run({
    ...base,
    requestId: requestId('compare-duplicate'),
    message: {
      kind: 'action' as const,
      actionId: `buyer-compare.${leader.id}`,
    },
  });
  assert.equal(
    duplicate.facts[0].values['catalog.result.state'],
    'comparison_duplicate',
  );
  assert.equal(duplicate.facts[0].values['catalog.result.count'], 2);

  const three = await runtime.run({
    ...base,
    requestId: requestId('compare-add'),
    message: {
      kind: 'action' as const,
      actionId: `buyer-compare.${unavailable.id}`,
    },
  });
  assert.equal(three.facts[0].values['catalog.result.count'], 3);
  assert.ok(Object.keys(three.facts[0].values).length <= 64);
  const unavailableCard = three.messages.find(
    (message) => message.card?.ref === unavailable.id,
  )?.card;
  assert.ok(unavailableCard);
  assert.ok(!unavailableCard.actions?.some(
    (action) => action.id === `buyer-checkout.${unavailable.id}`,
  ));

  const full = await runtime.run({
    ...base,
    requestId: requestId('compare-full'),
    message: {
      kind: 'action' as const,
      actionId: `buyer-compare.${fourth.id}`,
    },
  });
  assert.equal(
    full.facts[0].values['catalog.result.state'],
    'comparison_full',
  );
  assert.equal(full.facts[0].values['catalog.result.count'], 3);
  assert.ok(!Object.values(full.facts[0].values).includes(fourth.id));

  const shown = await runtime.run({
    ...base,
    requestId: requestId('compare-show'),
    message: { kind: 'text' as const, text: 'сравнить товары' },
  });
  assert.equal(shown.status, 'answered');
  assert.equal(shown.facts[0].values['catalog.result.count'], 3);

  const foreignSetup = await setupStore(fixture, '910013');
  const foreign = await createAndPublish(foreignSetup, {
    name: 'Foreign Comparison Product',
  });
  const foreignAttempt = await runtime.run({
    ...base,
    requestId: requestId('compare-foreign'),
    message: {
      kind: 'action' as const,
      actionId: `buyer-compare.${foreign.id}`,
    },
  });
  assert.equal(foreignAttempt.status, 'answered');
  assert.equal(foreignAttempt.facts[0].values['catalog.result.count'], 0);
  assert.ok(!JSON.stringify(foreignAttempt).includes(foreign.name));

  const cleared = await runtime.run({
    ...base,
    requestId: requestId('compare-clear'),
    message: {
      kind: 'action' as const,
      actionId: 'buyer-compare-clear',
    },
  });
  assert.equal(
    cleared.facts[0].values['catalog.result.state'],
    'comparison_cleared',
  );
  const empty = await runtime.run({
    ...base,
    requestId: requestId('compare-empty'),
    message: {
      kind: 'action' as const,
      actionId: 'buyer-compare-show',
    },
  });
  assert.equal(
    empty.facts[0].values['catalog.result.state'],
    'comparison_empty',
  );
  await setup.catalog.unpublishProduct(
    nextOwner(setup.owner),
    leader.id,
    leader.version,
  );
  const unpublishedAttempt = await runtime.run({
    ...base,
    requestId: requestId('compare-unpublished'),
    message: {
      kind: 'action' as const,
      actionId: `buyer-compare.${leader.id}`,
    },
  });
  assert.equal(unpublishedAttempt.status, 'answered');
  assert.equal(unpublishedAttempt.facts[0].values['catalog.result.count'], 0);
  assert.ok(!JSON.stringify(unpublishedAttempt).includes(leader.name));
});

test('price filter sorting is price, normalized name, then opaque id', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91002');
  await createAndPublish(setup, { name: 'Zulu', priceMinor: 80_000 });
  await createAndPublish(setup, { name: 'Alpha', priceMinor: 80_000 });
  await createAndPublish(setup, { name: 'Cheap', priceMinor: 20_000 });
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '91902');
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  const runtime = createTelegramAgentsRuntimeWiring(fixture.asD1(), BOT).runtime;
  const result = await runtime.run({
    requestId: requestId('filter'),
    orgId: setup.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: buyer.identity.id,
    locale: 'ru',
    message: { kind: 'text', text: 'дешевле 100000' },
  });
  assert.deepEqual(
    [0, 1, 2].map(
      (index) => result.facts[0].values[`catalog.results.${index}.name`],
    ),
    ['Cheap', 'Alpha', 'Zulu'],
  );
});

test('exact result stores only safe follow-up state and resolves pronoun', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91003');
  const product = await createAndPublish(setup, {
    name: 'Followup Phone',
    availability: 'preorder',
  });
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '91903');
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  const runtime = createTelegramAgentsRuntimeWiring(fixture.asD1(), BOT).runtime;
  const base = {
    orgId: setup.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: buyer.identity.id,
    locale: 'ru' as const,
  };
  await runtime.run({
    ...base,
    requestId: requestId('exact'),
    message: { kind: 'text' as const, text: 'Followup Phone' },
  });
  const row = fixture.rows<{
    last_product_id: string;
    last_intent: string;
    selection_request_key: string;
  }>(`SELECT last_product_id, last_intent, selection_request_key
      FROM sotuvchi_storefront_sessions`)[0];
  assert.equal(row.last_product_id, product.id);
  assert.equal(row.last_intent, 'catalog.search');
  assert.ok(row.selection_request_key.startsWith('exact-'));
  const columns = fixture.rows<{ name: string }>(
    'PRAGMA table_info(sotuvchi_storefront_sessions)',
  ).map((column) => column.name);
  assert.ok(!columns.includes('raw_message'));
  assert.ok(!columns.includes('transcript'));

  const followup = await runtime.run({
    ...base,
    requestId: requestId('followup'),
    message: { kind: 'text' as const, text: 'а он есть?' },
  });
  assert.equal(followup.status, 'answered');
  assert.equal(
    followup.facts[0].values['catalog.product.id'],
    product.id,
  );
  assert.equal(
    followup.facts[0].values['catalog.product.availability'],
    'preorder',
  );
});

test('same request does not mutate selected product twice', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91004');
  const product = await createAndPublish(setup, { name: 'Idempotent Phone' });
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '91904');
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  const input = {
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
    productId: product.id,
    intent: 'catalog.search',
    requestId: 'same-request',
  };
  const first = await setup.catalog.recordStorefrontSelection(input);
  const second = await setup.catalog.recordStorefrontSelection(input);
  assert.equal(second.updatedAt, first.updatedAt);
  assert.equal(second.selectedAt, first.selectedAt);
});

test('no previous selection returns safe help without product claims', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91005');
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '91905');
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  const result = await createTelegramAgentsRuntimeWiring(
    fixture.asD1(),
    BOT,
  ).runtime.run({
    requestId: requestId('missing'),
    orgId: setup.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: buyer.identity.id,
    locale: 'ru',
    message: { kind: 'text', text: 'а он есть?' },
  });
  assert.equal(result.status, 'answered');
  assert.equal(result.facts[0].values['catalog.result.count'], 0);
  assert.ok(result.messages[0].text.includes('Можно спросить'));
});

test('unpublished selected product makes follow-up fail closed', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91006');
  const product = await createAndPublish(setup, { name: 'Stale Phone' });
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '91906');
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  const runtime = createTelegramAgentsRuntimeWiring(fixture.asD1(), BOT).runtime;
  const base = {
    orgId: setup.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: buyer.identity.id,
    locale: 'ru' as const,
  };
  await runtime.run({
    ...base,
    requestId: requestId('select'),
    message: { kind: 'text' as const, text: 'Stale Phone' },
  });
  await setup.catalog.unpublishProduct(
    nextOwner(setup.owner),
    product.id,
    product.version,
  );
  const followup = await runtime.run({
    ...base,
    requestId: requestId('stale'),
    message: { kind: 'text' as const, text: 'сколько он стоит?' },
  });
  assert.equal(followup.status, 'answered');
  assert.ok(followup.messages[0].text.includes('Можно спросить'));
  assert.equal(followup.facts[0].values['catalog.result.count'], 0);
});

test('storefront session and product reference cannot cross tenant', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '91007');
  const second = await setupStore(fixture, '91008');
  const foreign = await createAndPublish(second, { name: 'Foreign Phone' });
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '91907');
  await first.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: first.storefront,
  });
  const runtime = createTelegramAgentsRuntimeWiring(fixture.asD1(), BOT).runtime;
  const crossOrg = await runtime.run({
    requestId: requestId('tenant'),
    orgId: second.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: buyer.identity.id,
    locale: 'ru',
    message: { kind: 'text', text: 'Foreign Phone' },
  });
  assert.equal(crossOrg.status, 'rejected');

  const foreignRef = await runtime.run({
    requestId: requestId('tenant'),
    orgId: first.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: buyer.identity.id,
    locale: 'ru',
    message: {
      kind: 'action',
      actionId: `buyer-details.${foreign.id}`,
    },
  });
  assert.equal(foreignRef.status, 'answered');
  assert.equal(foreignRef.facts[0].values['catalog.result.count'], 0);
  assert.ok(!JSON.stringify(foreignRef).includes('Foreign Phone'));
});

test('tenant override input is rejected and buyer cannot invoke seller mutation', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91009');
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '91909');
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  const runtime = createTelegramAgentsRuntimeWiring(fixture.asD1(), BOT).runtime;
  const sellerAttempt = await runtime.run({
    requestId: requestId('buyer'),
    orgId: setup.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: buyer.identity.id,
    locale: 'ru',
    message: {
      kind: 'text',
      text: 'Товар: Attack Product | 1 | available',
    },
  });
  assert.equal(sellerAttempt.status, 'rejected');
  assert.equal(
    fixture.value(`SELECT COUNT(*) FROM sotuvchi_products
                   WHERE name = 'Attack Product'`),
    0,
  );
});

class MemoryDelivery implements TelegramDeliveryPort {
  readonly sent: Array<{ threadRef: string; text: string; keyboard?: unknown }> = [];

  async sendText(
    threadRef: string,
    text: string,
    keyboard?: never,
  ): Promise<boolean> {
    this.sent.push({ threadRef, text, ...(keyboard ? { keyboard } : {}) });
    return true;
  }

  async answerCallback(): Promise<boolean> {
    return true;
  }
}

function telegramMessage(
  updateId: number,
  userId: number,
  text: string,
  languageCode: string,
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: userId, type: 'private' },
      from: { id: userId, language_code: languageCode },
      text,
    },
  };
}

function telegramCallback(
  updateId: number,
  userId: number,
  actionId: string,
  languageCode: string,
) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      from: { id: userId, language_code: languageCode },
      data: `agent:${actionId}`,
      message: { chat: { id: userId, type: 'private' } },
    },
  };
}

function telegramHarness(fixture: SqliteD1) {
  const db = fixture.asD1();
  const wiring = createTelegramAgentsRuntimeWiring(db, BOT);
  const delivery = new MemoryDelivery();
  const dependencies: TelegramAgentsWebhookDependencies = {
    botUsername: BOT,
    webhookSecret: SECRET,
    updates: createTelegramAgentUpdateStore(db),
    identities: createTelegramIdentityPort(createIdentityService(db)),
    contexts: wiring.contexts,
    runtime: wiring.runtime,
    delivery,
  };
  async function invoke(raw: unknown) {
    const scheduled: Promise<unknown>[] = [];
    const response = await handleTelegramAgentsWebhook(
      new Request('https://gptbot.uz/api/telegram/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': SECRET,
        },
        body: JSON.stringify(raw),
      }),
      dependencies,
      (promise) => scheduled.push(promise),
    );
    await Promise.all(scheduled);
    return response;
  }
  return { delivery, invoke };
}

test('Telegram buyer Q&A works RU, UZ and mixed without payment claims', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91010', 'uz');
  await createAndPublish(setup, {
    name: 'Samsung Sinov',
    description: 'Telefon tavsifi',
    priceMinor: 200_000,
    availability: 'available',
  });
  const harness = telegramHarness(fixture);
  await harness.invoke(
    telegramMessage(
      950_001,
      95001,
      `/start agent_${setup.storefrontCode}`,
      'uz',
    ),
  );
  for (const [id, text] of [
    [950_002, 'nima bor'],
    [950_003, 'Samsung qancha turadi'],
    [950_004, 'Samsung bormi'],
    [950_005, 'Samsung haqida ayting'],
    [950_006, 'narxi сколько Samsung'],
  ] as const) {
    await harness.invoke(telegramMessage(id, 95001, text, 'uz'));
  }
  const rendered = JSON.stringify(harness.delivery.sent);
  assert.ok(rendered.includes('Samsung Sinov'));
  assert.ok(rendered.includes('200 000 so‘m'));
  assert.ok(rendered.includes('Mavjud'));
  assert.ok(rendered.includes('Buyurtma berish'));
  assert.ok(rendered.includes('Solishtirish'));
  assert.ok(!/payment|оплач|тўлов|Купить|Sotib olish/i.test(rendered));
});

test('direct pilot /start can be repeated and buyer search stays in the storefront', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91012');
  await createAndPublish(setup, {
    name: 'Test Product',
    description: 'Synthetic test catalog item',
    priceMinor: 18_000,
    availability: 'available',
  });
  const harness = telegramHarness(fixture);

  await harness.invoke(telegramMessage(970_001, 97001, '/start', 'ru'));
  const firstStart = harness.delivery.sent.at(-1);
  assert.equal(firstStart?.text.includes(
    'Находите нужные товары',
  ), true);
  assert.equal(firstStart?.keyboard, undefined);
  assert.ok(!firstStart?.text.includes('Test Product'));

  const afterFirstStart = harness.delivery.sent.length;
  await harness.invoke(telegramMessage(970_002, 97001, '/start', 'ru'));
  const repeatedStart = harness.delivery.sent.slice(afterFirstStart);
  assert.equal(repeatedStart.length, 1);
  assert.ok(repeatedStart[0].text.includes(
    'Находите нужные товары',
  ));

  await harness.invoke(
    telegramCallback(970_009, 97001, 'buyer-seller-mode', 'ru'),
  );
  const sellerInterest = harness.delivery.sent.at(-1);
  assert.ok(sellerInterest?.text.includes('только по приглашению'));
  assert.ok(sellerInterest?.text.includes('не даёт доступ'));
  assert.ok(JSON.stringify(sellerInterest?.keyboard).includes(
    'buyer-seller-how',
  ));

  await harness.invoke(telegramMessage(970_010, 97002, '/start', 'uz'));
  const uzStart = harness.delivery.sent.at(-1);
  assert.ok(uzStart?.text.includes(
    'Kerakli mahsulotni toping',
  ));
  assert.equal(uzStart?.keyboard, undefined);

  await harness.invoke(
    telegramMessage(970_003, 97001, 'Нужен недорогой товар для теста', 'ru'),
  );
  const budgetReply = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(budgetReply.includes('Укажите максимальный бюджет'));

  await harness.invoke(telegramMessage(970_004, 97001, '30 000', 'ru'));
  const searchReply = harness.delivery.sent.at(-2)?.text ?? '';
  assert.ok(searchReply.includes('Test Product'));
  assert.ok(!searchReply.includes('Не удалось подготовить ответ'));
});

test('standalone amount confirms, while a prompted amount filters directly', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91013');
  await createAndPublish(setup, {
    name: 'Budget Product',
    priceMinor: 29_000,
  });
  const harness = telegramHarness(fixture);

  await harness.invoke(telegramMessage(971_001, 97101, '/start', 'ru'));
  await harness.invoke(telegramMessage(971_002, 97101, '30 000', 'ru'));
  const confirmation = harness.delivery.sent.at(-1);
  assert.ok(confirmation?.text.includes('максимальный бюджет'));
  assert.ok(JSON.stringify(confirmation?.keyboard).includes(
    'buyer-budget.30000',
  ));

  await harness.invoke(
    telegramCallback(971_003, 97101, 'buyer-budget.30000', 'ru'),
  );
  assert.ok(harness.delivery.sent.at(-2)?.text.includes('Budget Product'));

  await harness.invoke(
    telegramMessage(971_004, 97101, 'Нужен недорогой товар', 'ru'),
  );
  await harness.invoke(telegramMessage(971_005, 97101, '30.000', 'ru'));
  assert.ok(harness.delivery.sent.at(-2)?.text.includes('Budget Product'));

  await harness.invoke(
    telegramMessage(971_006, 97101, 'Нужен недорогой товар', 'ru'),
  );
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_storefront_sessions
       WHERE pending_intent = 'budget' AND pending_at IS NOT NULL`,
    ),
    1,
  );
  await harness.invoke(telegramMessage(971_007, 97101, '/start', 'ru'));
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_storefront_sessions
       WHERE pending_intent IS NOT NULL OR pending_at IS NOT NULL`,
    ),
    0,
  );
  await harness.invoke(telegramMessage(971_008, 97101, '2024', 'ru'));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('максимальный бюджет'));
});

test('Telegram product commands, language preference and stale recovery work', async () => {
  const fixture = new SqliteD1();
  await setupStore(fixture, '91014');
  const harness = telegramHarness(fixture);

  await harness.invoke(telegramMessage(972_001, 97201, '/start', 'ru'));
  await harness.invoke(telegramMessage(972_002, 97201, '/language', 'ru'));
  assert.ok(JSON.stringify(harness.delivery.sent.at(-1)?.keyboard).includes(
    'buyer-locale-uz',
  ));

  await harness.invoke(
    telegramCallback(972_003, 97201, 'buyer-locale-uz', 'ru'),
  );
  assert.ok(harness.delivery.sent.at(-1)?.text.includes(
    'Interfeys tili o‘zgartirildi',
  ));

  await harness.invoke(telegramMessage(972_004, 97201, '/help', 'ru'));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes(
    'Katalog va kategoriyalarni',
  ));

  await harness.invoke(telegramMessage(972_005, 97201, '/orders', 'ru'));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes(
    'Hali rasmiylashtirilgan',
  ));

  await harness.invoke(
    telegramCallback(972_006, 97201, 'buyer-obsolete-action', 'ru'),
  );
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('tugma eskirgan'));
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM events
       WHERE type = 'sotuvchi.bot_started'`,
    ),
    1,
  );
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM events
       WHERE type = 'sotuvchi.language_selected'`,
    ),
    1,
  );
});

test('Telegram duplicate update sends once and unknown remains safe', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '91011');
  const harness = telegramHarness(fixture);
  await harness.invoke(
    telegramMessage(
      960_001,
      96001,
      `/start agent_${setup.storefrontCode}`,
      'ru',
    ),
  );
  const update = telegramMessage(
    960_002,
    96001,
    'как оформить заказ',
    'ru',
  );
  await harness.invoke(update);
  const before = harness.delivery.sent.length;
  const duplicate = await harness.invoke(update);
  assert.equal(await duplicate.text(), 'duplicate');
  assert.equal(harness.delivery.sent.length, before);
  const text = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(text.includes('Можно спросить'));
  assert.ok(!/цена\s+\d|Купить|checkout|оформить заказ/i.test(text));
});

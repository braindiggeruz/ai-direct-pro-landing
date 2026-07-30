import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTelegramAgentsRuntimeWiring } from '../functions/api/telegram/agents';
import {
  BuyerQueryValidationError,
  composeBuyerResponse,
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
import { groundResponse } from '../functions/platform/runtime';
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

test('extraction accepts spaced integer UZS', () => {
  assert.equal(
    parseBuyerQuery('до 100 000').maxPriceMinor,
    100_000,
  );
  assert.deepEqual(parseBuyerQuery('30 000'), {
    intent: 'catalog.filter_price',
    maxPriceMinor: 30_000,
  });
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
      score: 4_000,
      matchedTokens: 1,
    }],
    hasMore: false,
    nextOffset: 5,
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
  const sql = fs.readFileSync(
    path.join(ROOT, 'migrations/0020_sotuvchi_buyer_qa.sql'),
    'utf8',
  );
  for (const column of [
    'last_product_id',
    'last_intent',
    'selection_request_key',
    'selected_at',
  ]) {
    assert.match(sql, new RegExp(`ADD COLUMN ${column}`));
  }
  const statements = sql.replace(/^--.*$/gm, '');
  assert.doesNotMatch(statements, /\b(?:DROP|DELETE|TRUNCATE)\b/);
  assert.doesNotMatch(statements, /message|transcript|phone|address/i);
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
  assert.equal(listed.status, 'answered');
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

test('Telegram buyer Q&A works RU, UZ and mixed without checkout actions', async () => {
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
  assert.ok(rendered.includes('Batafsil'));
  assert.ok(!/checkout|order|payment|Купить|Sotib olish/i.test(rendered));
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
  assert.equal(firstStart?.text.includes('Тестовый каталог'), true);
  assert.ok(JSON.stringify(firstStart?.keyboard).includes('buyer-catalog-open'));
  assert.ok(!firstStart?.text.includes('Test Product'));

  const afterFirstStart = harness.delivery.sent.length;
  await harness.invoke(telegramMessage(970_002, 97001, '/start', 'ru'));
  const repeatedStart = harness.delivery.sent.slice(afterFirstStart);
  assert.equal(repeatedStart.length, 1);
  assert.ok(repeatedStart[0].text.includes('Тестовый каталог'));

  await harness.invoke(
    telegramMessage(970_003, 97001, 'Нужен недорогой товар для теста', 'ru'),
  );
  const budgetReply = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(budgetReply.includes('Укажите максимальный бюджет'));

  await harness.invoke(telegramMessage(970_004, 97001, '30 000', 'ru'));
  const searchReply = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(searchReply.includes('Test Product'));
  assert.ok(!searchReply.includes('Не удалось подготовить ответ'));
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

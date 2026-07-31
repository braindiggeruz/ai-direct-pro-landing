import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  analyticsIdempotencyKey,
  composeStatsResponse,
  createSotuvchiAnalytics,
  createSotuvchiCatalogService,
  createSotuvchiCheckoutService,
  createSotuvchiHandoffService,
  createSotuvchiOnboardingService,
  createSotuvchiOrdersService,
  createSotuvchiStatsDomainPort,
  createSotuvchiStatsService,
  projectStatsFacts,
  resultBucket,
  SELLER_STATS_ACTION,
  SELLER_STATS_TOOL,
  SOTUVCHI_EVENT_TYPES,
  sotuvchiAgentManifest,
  sotuvchiStatsRules,
  STATS_WINDOW_DAYS,
  StatsAuthorizationError,
  StatsValidationError,
  withSotuvchiAnalytics,
  type CatalogProduct,
  type SotuvchiAnalytics,
  type SotuvchiCatalogService,
  type SotuvchiCheckoutService,
  type SotuvchiHandoffService,
  type SotuvchiIdentityContext,
  type SotuvchiOrdersService,
  type SotuvchiStatsService,
  type StoreOwnerContext,
  type StorefrontContext,
} from '../functions/agents/sotuvchi';
import type {
  AgentDomainServicePort,
  Locale,
  OrgContext,
} from '../functions/platform/contracts';
import {
  countEventsByType,
  ensurePlatformEventsSchema,
} from '../functions/platform/events';
import { createIdentityService } from '../functions/platform/identity';
import { groundResponse } from '../functions/platform/runtime';
import {
  isProtectedAgentBotUsername,
  TELEGRAM_AGENTS_WEBHOOK_PATH,
} from '../functions/channels/telegram';
import { runTelegramAgentsSetup } from '../scripts/telegram-agents-setup';
import {
  PILOT_MIGRATIONS,
  REQUIRED_ENV_NAMES,
  runSotuvchiPilotCheck,
} from '../scripts/sotuvchi-pilot-check';
import {
  isUsableSotuvchiBotUsername,
  SOTUVCHI_BOT_USERNAME,
  SOTUVCHI_SELLER_START_PAYLOAD,
  sotuvchiSellerCtaHref,
  sotuvchiSellerStartUrl,
} from '../src/shared/sotuvchi-config';
import { SqliteD1 } from './helpers/sqlite-d1';
import { activatePilotStore } from './helpers/pilot-store';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOT = 'agents_pilot_fixture_bot';
let sequence = 0;

function requestId(prefix = 'pilot'): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

interface StoreFixture {
  db: D1Database;
  analytics: SotuvchiAnalytics;
  catalog: SotuvchiCatalogService;
  checkout: SotuvchiCheckoutService;
  orders: SotuvchiOrdersService;
  handoff: SotuvchiHandoffService;
  stats: SotuvchiStatsService;
  owner: StoreOwnerContext;
  storefront: StorefrontContext;
}

async function setupStore(
  fixture: SqliteD1,
  externalId: string,
  locale: Locale = 'ru',
  now: () => Date = () => new Date(),
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
  const analytics = createSotuvchiAnalytics(db);
  // The outbox is created lazily on first publish; a fixture that asserts an
  // empty table must still find it.
  await ensurePlatformEventsSchema(db);
  const owner = await catalog.resolveOwnerContext({
    identityId: context.identityId,
    orgId: completed.store.orgId,
    requestId: requestId('owner'),
    locale,
  });
  return {
    db,
    analytics,
    catalog,
    checkout: createSotuvchiCheckoutService(db, catalog, BOT),
    orders: createSotuvchiOrdersService(db, catalog),
    handoff: createSotuvchiHandoffService(db, catalog, BOT),
    stats: createSotuvchiStatsService(db, catalog, { analytics, now }),
    owner,
    storefront: {
      orgId: completed.store.orgId,
      storeId: completed.store.id,
      agentId: 'sotuvchi',
      locale,
    },
  };
}

function nextOwner(owner: StoreOwnerContext): StoreOwnerContext {
  return { ...owner, requestId: requestId('owner') };
}

function sellerOrg(
  setup: StoreFixture,
  request = requestId('seller'),
): OrgContext {
  return {
    orgId: setup.owner.orgId,
    actorId: setup.owner.identityId,
    requestId: request,
    locale: setup.owner.locale,
  };
}

function buyerOrg(
  setup: StoreFixture,
  identityId: string,
  request = requestId('buyer'),
): OrgContext {
  return {
    orgId: setup.storefront.orgId,
    actorId: identityId,
    requestId: request,
    locale: setup.storefront.locale,
  };
}

async function publish(
  setup: StoreFixture,
  input: Partial<{ name: string; priceMinor: number }> = {},
): Promise<CatalogProduct> {
  const draft = await setup.catalog.createProduct(nextOwner(setup.owner), {
    name: 'Alpha Phone',
    description: 'Sinov mahsuloti',
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

async function bindBuyer(
  fixture: SqliteD1,
  setup: StoreFixture,
  externalId: string,
): Promise<string> {
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', externalId);
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  return buyer.identity.id;
}

async function placeOrder(
  setup: StoreFixture,
  identityId: string,
  productId: string,
  quantity = 1,
): Promise<string> {
  await setup.checkout.startCheckout(buyerOrg(setup, identityId), productId);
  await setup.checkout.submitQuantity(buyerOrg(setup, identityId), quantity);
  await setup.checkout.submitName(buyerOrg(setup, identityId), 'Дилшод');
  await setup.checkout.submitPhone(buyerOrg(setup, identityId), '901234567');
  await setup.checkout.submitAddress(
    buyerOrg(setup, identityId),
    'Тошкент, Чилонзор 5',
  );
  await setup.checkout.skipComment(buyerOrg(setup, identityId));
  const placed = await setup.checkout.confirmCheckout(
    buyerOrg(setup, identityId),
  );
  return placed.order.id;
}

function readPage(locale: 'ru' | 'uz'): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(
    path.join(ROOT, 'content', 'pages', locale, 'sotuvchi.json'),
    'utf-8',
  ));
}

// ── Analytics catalogue and payload safety ─────────────────────────────────

test('the Sotuvchi event catalogue is the closed R1.1 product funnel', () => {
  assert.deepEqual([...SOTUVCHI_EVENT_TYPES], [
    'sotuvchi.bot_started',
    'sotuvchi.language_selected',
    'sotuvchi.catalog_opened',
    'sotuvchi.category_opened',
    'sotuvchi.search_submitted',
    'sotuvchi.clarification_requested',
    'sotuvchi.budget_parsed',
    'sotuvchi.search_results_shown',
    'sotuvchi.zero_results',
    'sotuvchi.product_viewed',
    'sotuvchi.comparison_started',
    'sotuvchi.order_started',
    'sotuvchi.order_created',
    'sotuvchi.duplicate_order_blocked',
    'sotuvchi.handoff_requested',
    'sotuvchi.seller_notified',
    'sotuvchi.seller_responded',
    'sotuvchi.order_status_changed',
    'sotuvchi.telegram_error',
    'sotuvchi.stats_viewed',
  ]);
  assert.equal(new Set(SOTUVCHI_EVENT_TYPES).size, SOTUVCHI_EVENT_TYPES.length);
});

test('an analytics event carries only closed-list scalars', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870001');
  const outcome = await setup.analytics.record({
    orgId: setup.owner.orgId,
    storeId: setup.storefront.storeId,
    requestId: requestId('event'),
    event: {
      type: 'sotuvchi.search_results_shown',
      locale: 'ru',
      productId: 'product-safe',
      categoryId: 'category-safe',
      resultCount: 3,
      priceBucket: '50k_200k',
      reasonCode: 'exact_alias',
      latencyBucket: '250ms_1s',
    },
  });
  assert.equal(outcome, 'recorded');
  const payload = JSON.parse(
    String(fixture.value('SELECT payload_json FROM events')),
  );
  assert.deepEqual(Object.keys(payload).sort(), [
    'category_id',
    'latency_bucket',
    'locale',
    'price_bucket',
    'product_id',
    'reason_code',
    'result_bucket',
    'result_count',
  ]);
  assert.equal(payload.result_count, 3);
  assert.equal(
    fixture.value('SELECT agent_id FROM events'),
    'sotuvchi',
  );
  assert.equal(
    fixture.value('SELECT aggregate_ref FROM events'),
    `store:${setup.storefront.storeId}`,
  );
});

test('no buyer text, contact or chat reference can enter an event', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870002');
  const unsafe = {
    type: 'sotuvchi.search_submitted',
    locale: 'ru',
    rawMessage: 'Есть ли у вас платье Лола за 250000?',
    phone: '+998901234567',
    chatId: '123456',
    username: 'buyer',
    stack: 'DROP TABLE events',
  } as never;
  assert.equal(
    await setup.analytics.record({
      orgId: setup.owner.orgId,
      requestId: requestId('event'),
      event: unsafe,
    }),
    'recorded',
  );
  for (const event of [
    {
      type: 'sotuvchi.zero_results',
      locale: 'ru',
      reasonCode: 'DROP TABLE events',
    },
    {
      type: 'sotuvchi.product_viewed',
      locale: 'ru',
      productId: '+998901234567',
    },
    {
      type: 'sotuvchi.search_results_shown',
      locale: 'ru',
      resultCount: 201,
    },
  ] as const) {
    assert.equal(
      await setup.analytics.record({
        orgId: setup.owner.orgId,
        requestId: requestId('event'),
        event,
      }),
      'skipped',
    );
  }
  assert.equal(fixture.value('SELECT COUNT(*) FROM events'), 1);
  const stored = String(
    fixture.value('SELECT COALESCE(GROUP_CONCAT(payload_json), \'\') FROM events'),
  );
  for (const forbidden of [
    'Лола',
    '998901',
    'DROP TABLE',
    'rawMessage',
    'phone',
    'chatId',
    'username',
    'stack',
  ]) {
    assert.ok(!stored.includes(forbidden), forbidden);
  }
});

test('an unknown event name is refused instead of appended', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870003');
  assert.equal(
    await setup.analytics.record({
      orgId: setup.owner.orgId,
      requestId: requestId('event'),
      event: {
        type: 'sotuvchi.order_confirmed',
        locale: 'ru',
        source: 'deep_link',
      } as never,
    }),
    'skipped',
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM events'), 0);
});

test('an event needs a trusted org and request id', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870004');
  for (const input of [
    { orgId: '', requestId: requestId('event') },
    { orgId: setup.owner.orgId, requestId: '' },
    { orgId: 'org with space', requestId: requestId('event') },
  ]) {
    assert.equal(
      await setup.analytics.record({
        ...input,
        event: {
          type: 'sotuvchi.bot_started',
          locale: 'ru',
          source: 'deep_link',
        },
      }),
      'skipped',
    );
  }
  assert.equal(fixture.value('SELECT COUNT(*) FROM events'), 0);
});

test('a repeated update appends the event exactly once', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870005');
  const request = requestId('event');
  const event = {
    type: 'sotuvchi.bot_started',
    locale: 'ru' as const,
    source: 'deep_link' as const,
  };
  assert.equal(
    await setup.analytics.record({
      orgId: setup.owner.orgId,
      requestId: request,
      event,
    }),
    'recorded',
  );
  assert.equal(
    await setup.analytics.record({
      orgId: setup.owner.orgId,
      requestId: request,
      event,
    }),
    'duplicate',
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM events'), 1);
  assert.equal(
    fixture.value('SELECT idempotency_key FROM events'),
    analyticsIdempotencyKey(
      'sotuvchi.bot_started',
      setup.owner.orgId,
      request,
    ),
  );
});

test('events of one org are invisible to another org', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '870006');
  const second = await setupStore(fixture, '870007');
  await first.analytics.record({
    orgId: first.owner.orgId,
    requestId: requestId('event'),
    event: {
      type: 'sotuvchi.bot_started',
      locale: 'ru',
      source: 'deep_link',
    },
  });
  const foreign = await countEventsByType(fixture.asD1(), {
    orgId: second.owner.orgId,
    types: ['sotuvchi.bot_started'],
    since: '2000-01-01T00:00:00.000Z',
  });
  assert.equal(foreign['sotuvchi.bot_started'], 0);
  const own = await countEventsByType(fixture.asD1(), {
    orgId: first.owner.orgId,
    types: ['sotuvchi.bot_started'],
    since: '2000-01-01T00:00:00.000Z',
  });
  assert.equal(own['sotuvchi.bot_started'], 1);
});

test('a failing analytics append never repeats the domain operation', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870008');
  let calls = 0;
  const base: AgentDomainServicePort = {
    async execute() {
      calls += 1;
      return {
        'catalog.query.intent': 'catalog.search',
        'catalog.result.count': 2,
        'catalog.result.full_card': false,
      };
    },
  };
  const broken = {
    async record() {
      throw new Error('analytics down');
    },
  } as unknown as SotuvchiAnalytics;
  const port = withSotuvchiAnalytics(base, broken);
  await port.execute({
    agentId: 'sotuvchi',
    operation: 'catalog.search',
    org: sellerOrg(setup),
    input: {},
  });
  // The domain call ran exactly once; the decorator never retries it.
  assert.equal(calls, 1);
  assert.equal(fixture.value('SELECT COUNT(*) FROM events'), 0);
});

test('the decorator records the catalog funnel from Facts only', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870009');
  const answers: Record<string, unknown> = {
    'catalog.query.intent': 'product.price',
    'catalog.result.count': 1,
    'catalog.result.full_card': true,
  };
  const empty: Record<string, unknown> = {
    'catalog.query.intent': 'catalog.search',
    'catalog.result.count': 0,
    'catalog.result.full_card': false,
  };
  let next = answers;
  const port = withSotuvchiAnalytics(
    { async execute() { return next as never; } },
    setup.analytics,
  );
  await port.execute({
    agentId: 'sotuvchi',
    operation: 'catalog.search',
    org: sellerOrg(setup),
    input: {},
  });
  next = empty;
  await port.execute({
    agentId: 'sotuvchi',
    operation: 'catalog.search',
    org: sellerOrg(setup),
    input: {},
  });
  next = answers;
  // A seller operation is not part of the buyer funnel.
  await port.execute({
    agentId: 'sotuvchi',
    operation: 'seller.orders.list',
    org: sellerOrg(setup),
    input: {},
  });
  assert.deepEqual(
    fixture.rows<{ type: string }>('SELECT type FROM events ORDER BY type')
      .map((row) => row.type),
    [
      'sotuvchi.search_results_shown',
      'sotuvchi.search_submitted',
      'sotuvchi.search_submitted',
      'sotuvchi.zero_results',
    ],
  );
  assert.equal(resultBucket(1), 'one');
  assert.equal(resultBucket(3), 'few');
  assert.equal(resultBucket(9), 'many');
});

// ── /stats authorization ───────────────────────────────────────────────────

test('only the store owner can read the report', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870010');
  const buyer = await bindBuyer(fixture, setup, '970010');
  await assert.rejects(
    () => setup.stats.getStats(buyerOrg(setup, buyer)),
    StatsAuthorizationError,
  );
  await assert.rejects(
    () => setup.stats.getStats({
      orgId: setup.owner.orgId,
      requestId: requestId('anon'),
      locale: 'ru',
    }),
    StatsAuthorizationError,
  );
  const report = await setup.stats.getStats(sellerOrg(setup));
  assert.equal(report.windowDays, STATS_WINDOW_DAYS);
});

test('a foreign owner learns nothing about another store', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '870011');
  const second = await setupStore(fixture, '870012');
  const buyer = await bindBuyer(fixture, first, '970011');
  const product = await publish(first);
  await placeOrder(first, buyer, product.id);

  // Same actor, foreign org id: the report must not exist for them.
  await assert.rejects(
    () => first.stats.getStats({
      orgId: second.owner.orgId,
      actorId: first.owner.identityId,
      requestId: requestId('seller'),
      locale: 'ru',
    }),
    StatsAuthorizationError,
  );
  const own = await second.stats.getStats(sellerOrg(second));
  assert.equal(own.exact.ordersPlaced, 0);
  assert.equal(own.exact.productsPublished, 0);
});

test('a disabled membership loses the report', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870013');
  await setup.stats.getStats(sellerOrg(setup));
  fixture.exec(`UPDATE memberships SET status = 'disabled'`);
  await assert.rejects(
    () => setup.stats.getStats(sellerOrg(setup)),
    StatsAuthorizationError,
  );
});

test('the same Telegram chat with another identity is refused', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870014');
  const other = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '970014');
  await assert.rejects(
    () => setup.stats.getStats({
      orgId: setup.owner.orgId,
      actorId: other.identity.id,
      requestId: requestId('seller'),
      locale: 'ru',
    }),
    StatsAuthorizationError,
  );
});

test('a spoofed store or window in the tool input fails closed', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870015');
  const port = createSotuvchiStatsDomainPort(setup.stats);
  for (const input of [
    { storeId: 'other-store' },
    { orgId: 'other-org' },
    { windowDays: 365 },
  ]) {
    await assert.rejects(
      () => port.execute({
        agentId: 'sotuvchi',
        operation: SELLER_STATS_TOOL,
        org: sellerOrg(setup),
        input,
      }),
      StatsValidationError,
    );
  }
  await assert.rejects(
    () => port.execute({
      agentId: 'demo',
      operation: SELLER_STATS_TOOL,
      org: sellerOrg(setup),
      input: {},
    }),
    StatsAuthorizationError,
  );
});

// ── /stats correctness ─────────────────────────────────────────────────────

test('an empty store reports zeros without failing', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870016');
  const report = await setup.stats.getStats(sellerOrg(setup));
  assert.deepEqual({ ...report.exact }, {
    productsPublished: 0,
    checkoutsStarted: 0,
    ordersPlaced: 0,
    ordersConfirmed: 0,
    ordersCancelled: 0,
    ordersDone: 0,
    handoffsOpen: 0,
    handoffsAnswered: 0,
  });
  assert.deepEqual({ ...report.funnel }, {
    buyerStarts: 0,
    searches: 0,
    resultsShown: 0,
    zeroResults: 0,
    productViews: 0,
    comparisons: 0,
  });
});

test('exact counters come from the domain tables', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870017');
  const product = await publish(setup);
  await publish(setup, { name: 'Beta Case', priceMinor: 45_000 });
  await setup.orders.setInventory(sellerOrg(setup), product.id, 10);

  const buyerA = await bindBuyer(fixture, setup, '970017');
  const buyerB = await bindBuyer(fixture, setup, '970018');
  const buyerC = await bindBuyer(fixture, setup, '970019');
  const confirmed = await placeOrder(setup, buyerA, product.id);
  const cancelled = await placeOrder(setup, buyerB, product.id);
  const done = await placeOrder(setup, buyerC, product.id);

  await setup.orders.confirmOrder(sellerOrg(setup), confirmed);
  await setup.orders.cancelOrder(sellerOrg(setup), cancelled);
  await setup.orders.confirmOrder(sellerOrg(setup), done);
  await setup.orders.completeOrder(sellerOrg(setup), done);

  const asking = await bindBuyer(fixture, setup, '970020');
  const open = await setup.handoff.requestHandoff(
    buyerOrg(setup, asking),
    'buyer_requested_human',
    'Позовите продавца, вопрос по доставке',
  );
  const answering = await bindBuyer(fixture, setup, '970021');
  await setup.handoff.requestHandoff(
    buyerOrg(setup, answering),
    'buyer_requested_human',
    'Позовите продавца, второй вопрос',
  );
  const second = await setup.handoff.getActiveForBuyer(
    buyerOrg(setup, answering),
  );
  assert.ok(second);
  await setup.handoff.startReply(sellerOrg(setup), second.id);
  await setup.handoff.submitReply(sellerOrg(setup), 'Доставка завтра');

  const report = await setup.stats.getStats(sellerOrg(setup));
  assert.equal(report.exact.productsPublished, 2);
  assert.equal(report.exact.checkoutsStarted, 3);
  assert.equal(report.exact.ordersPlaced, 3);
  assert.equal(report.exact.ordersConfirmed, 2);
  assert.equal(report.exact.ordersCancelled, 1);
  assert.equal(report.exact.ordersDone, 1);
  assert.equal(report.exact.handoffsOpen, 1);
  assert.equal(report.exact.handoffsAnswered, 1);
  assert.equal(open.handoff.status, 'open');
});

test('the daily window keeps current rows and drops older rows', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870018');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '970022');
  await placeOrder(setup, buyer, product.id);

  const fresh = await setup.stats.getStats(sellerOrg(setup));
  assert.equal(fresh.exact.ordersPlaced, 1);

  // Move the only order just outside the window.
  fixture.exec(
    `UPDATE sotuvchi_orders
     SET created_at = '2000-01-01T00:00:00.000Z',
         placed_at = '2000-01-01T00:00:00.000Z'`,
  );
  const aged = await setup.stats.getStats(sellerOrg(setup));
  assert.equal(aged.exact.ordersPlaced, 0);
  assert.equal(aged.exact.checkoutsStarted, 0);
  // The product is a "right now" counter, so it is unaffected by the window.
  assert.equal(aged.exact.productsPublished, 1);
  assert.ok(
    Date.parse(aged.since) < Date.parse(aged.generatedAt),
    'window starts before it ends',
  );
  assert.equal(
    Math.round(
      (Date.parse(aged.generatedAt) - Date.parse(aged.since))
      / (24 * 60 * 60 * 1000),
    ),
    STATS_WINDOW_DAYS,
  );
});

test('funnel counters stay separate from the exact counters', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870019');
  await setup.analytics.record({
    orgId: setup.owner.orgId,
    requestId: requestId('event'),
    event: {
      type: 'sotuvchi.bot_started',
      locale: 'ru',
      source: 'deep_link',
    },
  });
  await setup.analytics.record({
    orgId: setup.owner.orgId,
    requestId: requestId('event'),
    event: {
      type: 'sotuvchi.zero_results',
      locale: 'ru',
      resultCount: 0,
    },
  });
  const report = await setup.stats.getStats(sellerOrg(setup));
  assert.equal(report.funnel.buyerStarts, 1);
  assert.equal(report.funnel.zeroResults, 1);
  assert.equal(report.funnel.resultsShown, 0);
  assert.equal(report.funnel.searches, 0);
  assert.equal(report.funnel.productViews, 0);
  assert.equal(report.funnel.comparisons, 0);
  assert.equal(report.exact.ordersPlaced, 0);
});

test('reading the report is safe to repeat', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870020');
  const org = sellerOrg(setup, requestId('fixed-stats'));
  const first = await setup.stats.getStats(org);
  const second = await setup.stats.getStats(org);
  assert.deepEqual({ ...first.exact }, { ...second.exact });
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM events WHERE type = 'sotuvchi.stats_viewed'`,
    ),
    1,
  );
});

// ── /stats rendering ───────────────────────────────────────────────────────

test('the report renders in RU and UZ without PII or content', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870021');
  const product = await publish(setup);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 4);
  const buyer = await bindBuyer(fixture, setup, '970023');
  const orderId = await placeOrder(setup, buyer, product.id);
  await setup.orders.confirmOrder(sellerOrg(setup), orderId);

  const values = projectStatsFacts(await setup.stats.getStats(sellerOrg(setup)));
  const facts = { toolName: SELLER_STATS_TOOL, values };
  for (const locale of ['ru', 'uz'] as const) {
    const draft = composeStatsResponse(facts, locale);
    const text = draft.messages.map((message) => message.text).join('\n');
    assert.equal(groundResponse(draft, [facts]).status, 'passed');
    assert.ok(text.includes(locale === 'ru' ? 'Точные данные' : 'Aniq'));
    assert.ok(
      text.includes(locale === 'ru' ? 'приблизительно' : 'taxminiy'),
      'funnel block is labelled as approximate',
    );
    for (const forbidden of [
      'Дилшод',
      '901234567',
      'Чилонзор',
      'Alpha Phone',
      setup.owner.orgId,
      setup.storefront.storeId,
    ]) {
      assert.ok(!text.includes(forbidden), forbidden);
    }
  }
});

test('an unsupported number is refused by grounding', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '870022');
  const values = projectStatsFacts(await setup.stats.getStats(sellerOrg(setup)));
  const facts = { toolName: SELLER_STATS_TOOL, values };
  const draft = composeStatsResponse(facts, 'ru');
  const tampered = {
    ...draft,
    messages: [{ text: `${draft.messages[0].text}\nЗаказов: 4242` }],
  };
  assert.equal(groundResponse(tampered, [facts]).status, 'failed');
  assert.throws(
    () => composeStatsResponse(
      { toolName: SELLER_STATS_TOOL, values: { 'seller.view': 'seller_orders' } },
      'ru',
    ),
    StatsValidationError,
  );
});

test('the stats command and action route to the owner-only tool', () => {
  const [action, command] = sotuvchiStatsRules;
  assert.ok(action.match({
    requestId: 'r',
    orgId: 'o',
    agentId: 'sotuvchi',
    locale: 'ru',
    message: { kind: 'action', actionId: SELLER_STATS_ACTION },
  }));
  for (const text of ['/stats', 'stats', 'Статистика', 'statistika']) {
    assert.ok(
      command.match({
        requestId: 'r',
        orgId: 'o',
        agentId: 'sotuvchi',
        locale: 'ru',
        message: { kind: 'text', text },
      }),
      text,
    );
  }
  for (const text of ['статистика магазина', 'stats please', '/start']) {
    assert.ok(!command.match({
      requestId: 'r',
      orgId: 'o',
      agentId: 'sotuvchi',
      locale: 'ru',
      message: { kind: 'text', text },
    }), text);
  }
});

test('P2.7 adds one stats tool without CRM, payment or broadcast', () => {
  const names = sotuvchiAgentManifest.tools.map((tool) => tool.name);
  assert.ok(names.includes(SELLER_STATS_TOOL));
  assert.equal(
    names.filter((name) => name.startsWith('seller.stats.')).length,
    1,
  );
  for (const forbidden of ['payment', 'refund', 'cart', 'broadcast', 'crm']) {
    assert.ok(!names.some((name) => name.includes(forbidden)), forbidden);
  }
  assert.equal(sotuvchiAgentManifest.policies.aiSelection, 'disabled');
  const priorities = (sotuvchiAgentManifest.deterministicRules ?? [])
    .map((rule) => rule.priority);
  assert.equal(new Set(priorities).size, priorities.length);
});

// ── Landing pages ──────────────────────────────────────────────────────────

test('both Sotuvchi landing pages exist and pair with each other', () => {
  const ru = readPage('ru');
  const uz = readPage('uz');
  assert.equal(ru.url, '/ru/sotuvchi/');
  assert.equal(uz.url, '/uz/sotuvchi/');
  assert.equal(ru.canonical, 'https://gptbot.uz/ru/sotuvchi/');
  assert.equal(uz.canonical, 'https://gptbot.uz/uz/sotuvchi/');
  for (const page of [ru, uz]) {
    assert.equal(page.status, 'published');
    assert.equal(page.robotsIndex, true);
    assert.equal(page.hreflangRu, '/ru/sotuvchi/');
    assert.equal(page.hreflangUz, '/uz/sotuvchi/');
    assert.ok(String(page.title).length > 0);
    assert.ok(String(page.description).length > 0);
    assert.ok(String(page.h1).length > 0);
    assert.ok(Array.isArray(page.faq) && (page.faq as unknown[]).length >= 4);
  }
  assert.notEqual(ru.title, uz.title);
  assert.notEqual(ru.description, uz.description);
});

test('the landing pages are eligible for the sitemap', () => {
  const pages = fs
    .readdirSync(path.join(ROOT, 'content', 'pages', 'ru'))
    .concat(fs.readdirSync(path.join(ROOT, 'content', 'pages', 'uz')));
  assert.ok(pages.includes('sotuvchi.json'));
  for (const locale of ['ru', 'uz'] as const) {
    const page = readPage(locale);
    // generate-sitemap.ts filter: published and not robotsIndex === false.
    assert.ok(page.status === 'published' && page.robotsIndex !== false);
  }
});

test('the landing CTA never points at the lead or Javob bot', () => {
  const serialized = JSON.stringify([readPage('ru'), readPage('uz')]);
  for (const forbidden of ['aidirectprobot', 'gptbot_javob_bot']) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
  const expected = 'https://t.me/gptbot_market_bot?start=agent_seller';
  for (const locale of ['ru', 'uz'] as const) {
    const page = readPage(locale);
    assert.equal(page.ctaPrimaryHref, expected);
  }
  assert.equal(SOTUVCHI_BOT_USERNAME, 'gptbot_market_bot');
  assert.equal(sotuvchiSellerStartUrl(), expected);
  assert.equal(sotuvchiSellerCtaHref(), expected);
});

test('a configured bot username produces the seller start deep link', () => {
  assert.equal(
    sotuvchiSellerStartUrl('gptbot_sotuvchi_bot'),
    `https://t.me/gptbot_sotuvchi_bot?start=${SOTUVCHI_SELLER_START_PAYLOAD}`,
  );
  assert.equal(SOTUVCHI_SELLER_START_PAYLOAD, 'agent_seller');
  for (const unsafe of [
    'aidirectprobot',
    'gptbot_javob_bot',
    'AIDirectProBot',
    'ab',
    'bad name',
    '',
    null,
  ]) {
    assert.equal(isUsableSotuvchiBotUsername(unsafe), false, String(unsafe));
    assert.equal(sotuvchiSellerStartUrl(unsafe), null, String(unsafe));
  }
});

test('the landing copy makes no unsafe or fabricated claim', () => {
  const serialized = JSON.stringify([readPage('ru'), readPage('uz')])
    .toLowerCase();
  for (const forbidden of [
    'официальный партнёр',
    'официальный бот telegram',
    'rasmiy hamkor',
    'гарантируем рост',
    'гарантируем результат',
    'kafolatlaymiz',
    'безлимит',
    'cheksiz',
    '100%',
    'отзыв клиента',
    'mijoz sharhi',
    'полностью заменяет',
    'to‘liq almashtiradi',
  ]) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
  // No invented social proof: no review, rating or customer-count block.
  for (const page of [readPage('ru'), readPage('uz')]) {
    const blocks = (page.bodyBlocks ?? []) as { type: string }[];
    assert.ok(!blocks.some((block) => block.type === 'reviews'));
  }
  const ru = JSON.stringify(readPage('ru'));
  const uz = JSON.stringify(readPage('uz'));
  // The pages must say plainly that the bot does not invent numbers…
  assert.ok(ru.includes('не выдумывает'));
  assert.ok(uz.includes('o‘ylab topmaydi'));
  // …that the service is independent…
  assert.ok(ru.includes('независимый'));
  assert.ok(uz.includes('mustaqil'));
  // …and must explicitly deny an affiliation rather than imply one.
  assert.ok(ru.includes('Мы не связаны с Telegram, OpenAI'));
  assert.ok(uz.includes('Telegram, OpenAI va boshqa kompaniyalar bilan bog‘liq emasmiz'));
  // No payment promise and no guaranteed growth.
  assert.ok(ru.includes('Не обещаем рост продаж'));
  assert.ok(uz.includes('Savdo o‘sishini va natijani kafolatlamaymiz'));
});

test('the landing pages are reachable from an existing money page', () => {
  const shopRu = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'content', 'pages', 'ru', 'ai-bot-dlya-magazina.json'),
    'utf-8',
  ));
  const shopUz = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'content', 'pages', 'uz', 'dokon-uchun-ai-bot.json'),
    'utf-8',
  ));
  const targets = (page: { internalLinks: { target: string }[] }): string[] =>
    page.internalLinks.map((link) => link.target);
  assert.ok(targets(shopRu).includes('/ru/sotuvchi/'));
  assert.ok(targets(shopUz).includes('/uz/sotuvchi/'));
});

// ── Setup and verification tooling ─────────────────────────────────────────

test('the pilot check is read-only and never prints a secret', () => {
  const report = runSotuvchiPilotCheck({
    TELEGRAM_AGENTS_BOT_TOKEN: 'never-printed-token',
    TELEGRAM_AGENTS_WEBHOOK_SECRET: 'never-printed-secret',
    TELEGRAM_AGENTS_BOT_USERNAME: 'gptbot_sotuvchi_bot',
    SITE_URL: 'https://gptbot.uz',
  });
  assert.equal(report.mode, 'read-only');
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('never-printed-token'));
  assert.ok(!serialized.includes('never-printed-secret'));
  const env = report.items.filter((item) => item.id.startsWith('env:'));
  assert.equal(env.length, REQUIRED_ENV_NAMES.length);
  assert.ok(env.every((item) => item.ok && item.detail === 'present'));
  assert.ok(report.items.some(
    (item) => item.id === 'webhook:url'
      && item.detail.endsWith(TELEGRAM_AGENTS_WEBHOOK_PATH),
  ));
});

test('the pilot check fails closed on missing or unsafe configuration', () => {
  const empty = runSotuvchiPilotCheck({});
  assert.equal(empty.status, 'blocked');
  assert.ok(empty.items.some(
    (item) => item.id === 'env:TELEGRAM_AGENTS_BOT_TOKEN' && !item.ok,
  ));
  const badUrl = runSotuvchiPilotCheck({ SITE_URL: 'http://gptbot.uz/path' });
  assert.ok(badUrl.items.some(
    (item) => item.id === 'webhook:url' && !item.ok,
  ));
  const protectedBot = runSotuvchiPilotCheck({
    TELEGRAM_AGENTS_BOT_USERNAME: 'aidirectprobot',
  });
  assert.ok(protectedBot.items.some(
    (item) => item.id === 'bot:not-protected' && !item.ok,
  ));
  assert.ok(isProtectedAgentBotUsername('gptbot_javob_bot'));
});

test('the pilot check lists migrations 0013 to 0023 in order', () => {
  assert.equal(PILOT_MIGRATIONS.length, 11);
  assert.equal(PILOT_MIGRATIONS[0], '0013_platform_events.sql');
  assert.equal(
    PILOT_MIGRATIONS[PILOT_MIGRATIONS.length - 1],
    '0023_sotuvchi_handoff.sql',
  );
  const numbers = PILOT_MIGRATIONS.map((name) => Number(name.slice(0, 4)));
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
  for (const name of PILOT_MIGRATIONS) {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'migrations', name)),
      name,
    );
  }
  const report = runSotuvchiPilotCheck({});
  assert.ok(report.items.every(
    (item) => !item.id.startsWith('migration:') || item.ok,
  ));
  // P2.7 adds no migration of its own.
  assert.ok(!fs.existsSync(path.join(ROOT, 'migrations', '0024_sotuvchi_analytics.sql')));
});

test('setup never mutates a webhook without an explicit apply', async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    calls.push(url.replace(/bot[^/]+/, 'bot<redacted>'));
    const method = url.split('/').pop() ?? '';
    const result = method === 'getMe'
      ? {
          ok: true,
          result: {
            id: 123456789,
            is_bot: true,
            username: 'gptbot_sotuvchi_bot',
          },
        }
      : { ok: true, result: {} };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await runTelegramAgentsSetup(
      {
        TELEGRAM_AGENTS_BOT_TOKEN: 'fixture-token',
        TELEGRAM_AGENTS_WEBHOOK_SECRET: 'REPLACE_ME_WITH_32_CHAR_WEBHOOK_SECRET',
        TELEGRAM_AGENTS_BOT_USERNAME: 'gptbot_sotuvchi_bot',
        SITE_URL: 'https://gptbot.uz',
      },
      ['setup', '--dry-run'],
    );
    assert.ok(!calls.some((url) => url.includes('setWebhook')));
    assert.ok(calls.some((url) => url.includes('getMe')));
    assert.ok(!calls.some((url) => url.includes('fixture-token')));

    await assert.rejects(() => runTelegramAgentsSetup(
      {
        TELEGRAM_AGENTS_BOT_TOKEN: 'fixture-token',
        TELEGRAM_AGENTS_BOT_USERNAME: 'gptbot_sotuvchi_bot',
      },
      ['setup', '--dry-run'],
    ));
    assert.ok(!calls.some((url) => url.includes('setWebhook')));
  } finally {
    globalThis.fetch = original;
  }
});

// ── Runbook and readiness checklist ────────────────────────────────────────

test('the runbook and the readiness checklist exist', () => {
  for (const file of [
    'docs/agents-platform/SOTUVCHI_PILOT_RUNBOOK.md',
    'docs/agents-platform/SOTUVCHI_PRODUCTION_READINESS.md',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  }
});

test('the pilot documents keep the release blockers visible', () => {
  const checklist = fs.readFileSync(
    path.join(ROOT, 'docs/agents-platform/SOTUVCHI_PRODUCTION_READINESS.md'),
    'utf-8',
  );
  assert.ok(checklist.includes('RELEASE BLOCKED'));
  assert.ok(checklist.includes('memory/test_credentials.md'));
  assert.ok(checklist.includes('- [ ]'));
  assert.ok(!/^- \[x\]/im.test(checklist), 'nothing is pre-ticked');
  assert.ok(!/production\s+ready\s*:\s*yes/i.test(checklist));

  const runbook = fs.readFileSync(
    path.join(ROOT, 'docs/agents-platform/SOTUVCHI_PILOT_RUNBOOK.md'),
    'utf-8',
  );
  for (const section of [
    'Цель пилота',
    'Prerequisites',
    'Security blockers',
    'Migration sequence',
    'Backup / export requirement',
    'Telegram webhook setup sequence',
    'Smoke tests',
    'Incident handling',
    'Rollback',
    'Pilot metrics',
    'Stop conditions',
  ]) {
    assert.ok(runbook.includes(section), section);
  }
  assert.ok(runbook.includes('0023_sotuvchi_handoff.sql'));
  assert.ok(runbook.includes('заказы, оформленные через Sotuvchi'));
});

test('the pilot documents contain no credential material', () => {
  for (const file of [
    'docs/agents-platform/SOTUVCHI_PILOT_RUNBOOK.md',
    'docs/agents-platform/SOTUVCHI_PRODUCTION_READINESS.md',
  ]) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    // Env var NAMES are expected; assignments and token shapes are not.
    assert.ok(!/TELEGRAM_AGENTS_BOT_TOKEN\s*=/.test(text), file);
    assert.ok(!/\d{8,10}:AA[\w-]{30,}/.test(text), file);
    assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text), file);
    assert.ok(!/password\s*[:=]\s*\S+/i.test(text), file);
  }
  // The runbook names the required variables without ever showing a value.
  const runbook = fs.readFileSync(
    path.join(ROOT, 'docs/agents-platform/SOTUVCHI_PILOT_RUNBOOK.md'),
    'utf-8',
  );
  for (const name of REQUIRED_ENV_NAMES) {
    assert.ok(runbook.includes(name), name);
    assert.ok(!new RegExp(`${name}\\s*=\\s*\\S`).test(runbook), name);
  }
});

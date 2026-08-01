import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTelegramAgentsRuntimeWiring } from '../functions/api/telegram/agents';
import {
  CheckoutAuthorizationError,
  CheckoutIdempotencyConflictError,
  CheckoutNotFoundError,
  CheckoutStateError,
  CheckoutValidationError,
  composeCheckoutResponse,
  createSotuvchiCatalogService,
  createSotuvchiCheckoutDomainPort,
  createSotuvchiCheckoutService,
  createSotuvchiOnboardingService,
  createSotuvchiOrdersService,
  ensureSotuvchiCheckoutSchema,
  maskBuyerPhone,
  normalizeBuyerAddress,
  normalizeBuyerComment,
  normalizeBuyerName,
  normalizeBuyerPhone,
  normalizeCheckoutQuantity,
  parseCheckoutQuantityText,
  composeBuyerOrderHistoryResponse,
  projectBuyerOrderHistoryFacts,
  projectCheckoutFacts,
  sotuvchiAgentManifest,
  sotuvchiCheckoutWorkflow,
  type CatalogProduct,
  type SotuvchiCatalogService,
  type SotuvchiCheckoutService,
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
import type { Locale, OrgContext } from '../functions/platform/contracts';
import { createIdentityService } from '../functions/platform/identity';
import { groundResponse } from '../functions/platform/runtime';
import { SqliteD1 } from './helpers/sqlite-d1';
import {
  activatePilotStore,
  setPilotStoreState,
} from './helpers/pilot-store';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOT = 'agents_checkout_fixture_bot';
const SECRET = 'fixture-checkout-webhook-secret';
let sequence = 0;

function requestId(prefix = 'checkout'): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

interface StoreFixture {
  catalog: SotuvchiCatalogService;
  checkout: SotuvchiCheckoutService;
  owner: StoreOwnerContext;
  storefront: StorefrontContext;
  storefrontCode: string;
}

async function setupStore(
  fixture: SqliteD1,
  externalId: string,
  locale: Locale = 'ru',
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
    checkout: createSotuvchiCheckoutService(db, catalog, BOT),
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

async function createProduct(
  setup: StoreFixture,
  input: Partial<{
    name: string;
    description: string | null;
    priceMinor: number;
    availability: 'available' | 'unavailable' | 'preorder';
    categoryId: string | null;
  }> = {},
): Promise<CatalogProduct> {
  return setup.catalog.createProduct(nextOwner(setup.owner), {
    name: 'Alpha Phone',
    description: 'Sinov mahsuloti',
    priceMinor: 125_000,
    currency: 'UZS',
    availability: 'available',
    mediaRefs: [],
    ...input,
  });
}

async function publish(
  setup: StoreFixture,
  input?: Parameters<typeof createProduct>[1],
): Promise<CatalogProduct> {
  const draft = await createProduct(setup, input);
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

function buyerOrg(
  setup: StoreFixture,
  identityId: string,
  request = requestId('turn'),
  locale: Locale = 'ru',
): OrgContext {
  return {
    orgId: setup.storefront.orgId,
    actorId: identityId,
    requestId: request,
    locale,
  };
}

async function completeDraft(
  setup: StoreFixture,
  identityId: string,
  productId: string,
): Promise<void> {
  await setup.checkout.startCheckout(
    buyerOrg(setup, identityId),
    productId,
  );
  await setup.checkout.submitQuantity(buyerOrg(setup, identityId), 2);
  await setup.checkout.submitName(buyerOrg(setup, identityId), 'Дилшод');
  await setup.checkout.submitPhone(buyerOrg(setup, identityId), '901234567');
  await setup.checkout.submitAddress(
    buyerOrg(setup, identityId),
    'Тестовая улица, дом 7',
  );
  await setup.checkout.skipComment(buyerOrg(setup, identityId));
}

// ── Validation ─────────────────────────────────────────────────────────────

test('quantity accepts bounded integers only', () => {
  assert.equal(normalizeCheckoutQuantity(1), 1);
  assert.equal(normalizeCheckoutQuantity(99), 99);
  for (const invalid of [0, -1, 2.5, 100, 1e3, Number.NaN, '2', null]) {
    assert.throws(
      () => normalizeCheckoutQuantity(invalid),
      CheckoutValidationError,
    );
  }
});

test('quantity text parser accepts only one or two ASCII digits', () => {
  assert.equal(parseCheckoutQuantityText(' 3 '), 3);
  assert.equal(parseCheckoutQuantityText('99'), 99);
  for (const invalid of ['0', '00', '-1', '2.5', '100', '١٢', '2 шт', '']) {
    assert.equal(parseCheckoutQuantityText(invalid), null);
  }
});

test('buyer name accepts RU and UZ Unicode within bounds', () => {
  assert.equal(normalizeBuyerName('  Дилшод   Каримов '), 'Дилшод Каримов');
  assert.equal(normalizeBuyerName('Gulnora O‘ktamova'), 'Gulnora O‘ktamova');
  for (const invalid of [
    'A',
    'x'.repeat(81),
    `Дилшод${String.fromCharCode(0)}`,
    42,
  ]) {
    assert.throws(() => normalizeBuyerName(invalid), CheckoutValidationError);
  }
});

test('Uzbekistan phone forms normalize to one E.164 value', () => {
  for (const input of [
    '+998901234567',
    '998901234567',
    '901234567',
    '+998 90 123 45 67',
    '90-123-45-67',
  ]) {
    assert.equal(normalizeBuyerPhone(input), '+998901234567');
  }
  for (const invalid of [
    '+79161234567',
    '12345',
    '001234567',
    '+998901234',
    '+9989012345678',
    'abcdefghi',
  ]) {
    assert.throws(() => normalizeBuyerPhone(invalid), CheckoutValidationError);
  }
});

test('phone is masked to the last two digits', () => {
  assert.equal(maskBuyerPhone('+998901234512'), '+998 ** *** ** 12');
  assert.ok(!maskBuyerPhone('+998901234512').includes('9012345'));
});

test('delivery address is bounded plain text', () => {
  assert.equal(
    normalizeBuyerAddress('  Тошкент,   Чилонзор 5 '),
    'Тошкент, Чилонзор 5',
  );
  for (const invalid of [
    'abc',
    'x'.repeat(241),
    `Тошкент${String.fromCharCode(7)}`,
    null,
  ]) {
    assert.throws(
      () => normalizeBuyerAddress(invalid),
      CheckoutValidationError,
    );
  }
});

// ── Migration and bootstrap ────────────────────────────────────────────────

test('optional buyer comment is normalized and bounded', () => {
  assert.equal(
    normalizeBuyerComment('  Позвонить   перед встречей  '),
    'Позвонить перед встречей',
  );
  assert.equal(normalizeBuyerComment('Olib ketaman'), 'Olib ketaman');
  for (const invalid of [
    '',
    '   ',
    'x'.repeat(241),
    `Комментарий${String.fromCharCode(7)}`,
    null,
  ]) {
    assert.throws(
      () => normalizeBuyerComment(invalid),
      CheckoutValidationError,
    );
  }
});

test('checkout migration is additive and free of buyer content columns', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'migrations/0021_sotuvchi_checkout.sql'),
    'utf8',
  );
  const executable = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(executable, /(?:^|;)\s*(?:DROP|DELETE|ALTER|TRUNCATE)\b/i);
  assert.doesNotMatch(executable, /raw_message|transcript|update_json/i);
  for (const marker of [
    'sotuvchi_orders',
    'sotuvchi_order_items',
    'sotuvchi_order_operations',
    'idx_sotuvchi_orders_active_draft',
    'idx_sotuvchi_order_items_single',
  ]) {
    assert.ok(executable.includes(marker), marker);
  }
});

test('migration and runtime bootstrap stay in parity', () => {
  const schema = fs.readFileSync(
    path.join(ROOT, 'functions/agents/sotuvchi/checkout/schema.ts'),
    'utf8',
  );
  const migration = fs.readFileSync(
    path.join(ROOT, 'migrations/0021_sotuvchi_checkout.sql'),
    'utf8',
  );
  for (const marker of [
    'sotuvchi_orders',
    'sotuvchi_order_items',
    'sotuvchi_order_operations',
    "status IN ('draft', 'placed', 'cancelled')",
    "availability_snapshot IN ('available', 'preorder')",
    'quantity >= 1 AND quantity <= 99',
    'idx_sotuvchi_orders_active_draft',
    'idx_sotuvchi_order_items_single',
    'FOREIGN KEY (org_id, store_id, product_id)',
    'FOREIGN KEY (org_id, workflow_instance_id)',
  ]) {
    assert.ok(schema.includes(marker), `schema ${marker}`);
    assert.ok(migration.includes(marker), `migration ${marker}`);
  }
});

test('checkout comment migration is additive and tenant-order scoped', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'migrations/0029_market_checkout_comment.sql'),
    'utf8',
  );
  const executable = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.match(
    executable,
    /ALTER TABLE sotuvchi_orders\s+ADD COLUMN buyer_comment TEXT/i,
  );
  assert.doesNotMatch(executable, /\b(?:DROP|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(
    executable,
    /analytics|event|notification|operation|workflow|transcript|raw_/i,
  );
});

test('runtime bootstrap is repeatable and content-free', async () => {
  const fixture = new SqliteD1();
  await ensureSotuvchiCheckoutSchema(fixture.asD1());
  await ensureSotuvchiCheckoutSchema(fixture.asD1());
  const objects = fixture.rows<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE name LIKE 'sotuvchi_order%' OR name LIKE 'idx_sotuvchi_order%'`,
  ).map((row) => row.name);
  for (const expected of [
    'sotuvchi_orders',
    'sotuvchi_order_items',
    'sotuvchi_order_operations',
    'idx_sotuvchi_orders_active_draft',
    'idx_sotuvchi_order_items_single',
  ]) {
    assert.ok(objects.includes(expected), expected);
  }
  const columns = fixture.rows<{ name: string }>(
    'PRAGMA table_info(sotuvchi_orders)',
  ).map((column) => column.name);
  assert.ok(!columns.includes('raw_message'));
  assert.ok(!columns.includes('transcript'));
  assert.ok(columns.includes('buyer_comment'));
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sqlite_master WHERE name LIKE '%transcript%'`,
    ),
    0,
  );
});

test('checkout workflow declares the required states and cancel paths', () => {
  assert.equal(sotuvchiCheckoutWorkflow.id, 'sotuvchi-checkout');
  assert.equal(sotuvchiCheckoutWorkflow.initial, 'idle');
  assert.deepEqual(
    Object.keys(sotuvchiCheckoutWorkflow.states),
    [
      'idle',
      'awaiting_quantity',
      'awaiting_name',
      'awaiting_phone',
      'awaiting_address',
      'awaiting_comment',
      'awaiting_confirmation',
      'completed',
      'cancelled',
    ],
  );
  assert.deepEqual(
    sotuvchiCheckoutWorkflow.terminalStates,
    ['completed', 'cancelled'],
  );
  for (const [state, definition] of Object.entries(
    sotuvchiCheckoutWorkflow.states,
  )) {
    const cancels = definition.transitions.some(
      (transition) =>
        transition.trigger.on === 'action'
        && transition.trigger.actionId === 'cancel',
    );
    assert.equal(
      cancels,
      state !== 'completed' && state !== 'cancelled',
      state,
    );
  }
});

// ── Checkout workflow over D1 ──────────────────────────────────────────────

test('checkout start creates exactly one draft order with one item', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810011');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910011');

  const snapshot = await setup.checkout.startCheckout(
    buyerOrg(setup, buyer),
    product.id,
  );
  assert.equal(snapshot.outcome, 'started');
  assert.equal(snapshot.state, 'awaiting_quantity');
  assert.equal(snapshot.order.status, 'draft');
  assert.equal(snapshot.order.productId, product.id);
  assert.equal(snapshot.order.unitPriceMinor, 125_000);
  assert.equal(snapshot.order.quantity, null);
  assert.match(snapshot.order.orderNumber, /^S-[2-9A-HJ-NP-Z]{6}$/);
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_orders'), 1);
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_order_items'), 1);
});

test('paused pilot blocks new checkout and final placement until resumed', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810012');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910012');
  await setPilotStoreState(
    fixture.asD1(),
    setup.storefront.orgId,
    setup.storefront.storeId,
    'paused',
  );
  await assert.rejects(
    () => setup.checkout.startCheckout(buyerOrg(setup, buyer), product.id),
    CheckoutAuthorizationError,
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_orders'), 0);

  await setPilotStoreState(
    fixture.asD1(),
    setup.storefront.orgId,
    setup.storefront.storeId,
    'active',
  );
  await setup.checkout.startCheckout(buyerOrg(setup, buyer), product.id);
  await setup.checkout.submitQuantity(buyerOrg(setup, buyer), 1);
  await setup.checkout.submitName(buyerOrg(setup, buyer), 'Dilshod');
  await setup.checkout.submitPhone(buyerOrg(setup, buyer), '901234567');
  await setup.checkout.submitAddress(
    buyerOrg(setup, buyer),
    'Toshkent, Chilonzor 5',
  );
  await setup.checkout.skipComment(buyerOrg(setup, buyer));
  await setPilotStoreState(
    fixture.asD1(),
    setup.storefront.orgId,
    setup.storefront.storeId,
    'paused',
  );
  await assert.rejects(
    () => setup.checkout.confirmCheckout(buyerOrg(setup, buyer)),
    CheckoutAuthorizationError,
  );
  assert.equal(fixture.value('SELECT status FROM sotuvchi_orders'), 'draft');
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_notifications'), 0);

  await setPilotStoreState(
    fixture.asD1(),
    setup.storefront.orgId,
    setup.storefront.storeId,
    'active',
  );
  const placed = await setup.checkout.confirmCheckout(
    buyerOrg(setup, buyer),
  );
  assert.equal(placed.order.status, 'placed');
});

test('start is idempotent per request and resumes the same draft', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810021');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910021');
  const org = buyerOrg(setup, buyer, 'same-start-request');

  const first = await setup.checkout.startCheckout(org, product.id);
  const duplicate = await setup.checkout.startCheckout(org, product.id);
  const later = await setup.checkout.startCheckout(
    buyerOrg(setup, buyer),
    product.id,
  );
  assert.equal(duplicate.order.id, first.order.id);
  assert.equal(later.order.id, first.order.id);
  assert.equal(later.outcome, 'resumed');
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_orders'), 1);
});

test('a second product cannot open a second cart', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810031');
  const first = await publish(setup, { name: 'Alpha Phone' });
  const second = await publish(setup, { name: 'Beta Phone' });
  const buyer = await bindBuyer(fixture, setup, '910031');

  await setup.checkout.startCheckout(buyerOrg(setup, buyer), first.id);
  const conflict = await setup.checkout.startCheckout(
    buyerOrg(setup, buyer),
    second.id,
  );
  assert.equal(conflict.outcome, 'other_draft');
  assert.equal(conflict.order.productId, first.id);
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_orders'), 1);
});

test('only eligible published products can start a checkout', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810041');
  const other = await setupStore(fixture, '810051');
  const buyer = await bindBuyer(fixture, setup, '910041');

  const draft = await createProduct(setup, { name: 'Draft Phone' });
  const unavailable = await publish(setup, {
    name: 'Sold Out Phone',
    availability: 'unavailable',
  });
  const archivedSource = await createProduct(setup, { name: 'Archived Phone' });
  const archived = await setup.catalog.archiveProduct(
    nextOwner(setup.owner),
    archivedSource.id,
    archivedSource.version,
  );
  const foreign = await publish(other, { name: 'Foreign Phone' });
  const category = await setup.catalog.createCategory(
    nextOwner(setup.owner),
    { name: 'Ichimliklar' },
  );
  const categorised = await publish(setup, {
    name: 'Categorised Phone',
    categoryId: category.id,
  });
  await setup.catalog.archiveCategory(nextOwner(setup.owner), category.id);

  for (const productId of [draft.id, archived.id, foreign.id, categorised.id]) {
    await assert.rejects(
      () => setup.checkout.startCheckout(buyerOrg(setup, buyer), productId),
      CheckoutNotFoundError,
    );
  }
  await assert.rejects(
    () => setup.checkout.startCheckout(buyerOrg(setup, buyer), unavailable.id),
    CheckoutStateError,
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_orders'), 0);
});

test('preorder products are accepted and marked', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810061');
  const product = await publish(setup, {
    name: 'Preorder Phone',
    availability: 'preorder',
  });
  const buyer = await bindBuyer(fixture, setup, '910061');
  const snapshot = await setup.checkout.startCheckout(
    buyerOrg(setup, buyer),
    product.id,
  );
  assert.equal(snapshot.order.availabilitySnapshot, 'preorder');
  const values = projectCheckoutFacts(snapshot, 'ru');
  assert.equal(values['checkout.product.availability'], 'preorder');
  assert.equal(values['checkout.product.availability_display'], 'Под заказ');
});

test('collected steps produce an integer total and stay idempotent', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810071');
  const product = await publish(setup, { priceMinor: 125_000 });
  const buyer = await bindBuyer(fixture, setup, '910071');
  await setup.checkout.startCheckout(buyerOrg(setup, buyer), product.id);

  const quantityOrg = buyerOrg(setup, buyer, 'quantity-request');
  const quantity = await setup.checkout.submitQuantity(quantityOrg, 2);
  assert.equal(quantity.state, 'awaiting_name');
  assert.equal(quantity.order.quantity, 2);
  assert.equal(quantity.order.totalMinor, 250_000);
  const duplicateQuantity = await setup.checkout.submitQuantity(
    quantityOrg,
    2,
  );
  assert.equal(duplicateQuantity.order.quantity, 2);
  assert.equal(duplicateQuantity.order.totalMinor, 250_000);

  const nameOrg = buyerOrg(setup, buyer, 'name-request');
  const named = await setup.checkout.submitName(nameOrg, 'Дилшод');
  assert.equal(named.state, 'awaiting_phone');
  const duplicateName = await setup.checkout.submitName(nameOrg, 'Дилшод');
  assert.equal(duplicateName.state, 'awaiting_phone');

  const phoneOrg = buyerOrg(setup, buyer, 'phone-request');
  const phoned = await setup.checkout.submitPhone(phoneOrg, '90 123 45 67');
  assert.equal(phoned.state, 'awaiting_address');
  assert.equal(phoned.order.buyerPhone, '+998901234567');
  await setup.checkout.submitPhone(phoneOrg, '90 123 45 67');

  const addressOrg = buyerOrg(setup, buyer, 'address-request');
  const addressed = await setup.checkout.submitAddress(
    addressOrg,
    'Тошкент, Чилонзор 5',
  );
  assert.equal(addressed.state, 'awaiting_comment');
  await setup.checkout.submitAddress(addressOrg, 'Тошкент, Чилонзор 5');
  const skipped = await setup.checkout.skipComment(
    buyerOrg(setup, buyer, 'comment-skip-request'),
  );
  assert.equal(skipped.state, 'awaiting_confirmation');
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_orders'), 1);
  assert.equal(
    fixture.value(`SELECT version FROM sotuvchi_orders`),
    6,
  );
});

test('comment stays only on the tenant-scoped order aggregate', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810072');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910072');
  await setup.checkout.startCheckout(buyerOrg(setup, buyer), product.id);
  await setup.checkout.submitQuantity(buyerOrg(setup, buyer), 1);
  await setup.checkout.submitName(buyerOrg(setup, buyer), 'Дилшод');
  await setup.checkout.submitPhone(buyerOrg(setup, buyer), '901234567');
  await setup.checkout.submitAddress(
    buyerOrg(setup, buyer),
    'Самовывоз, время обсудить с продавцом',
  );
  const comment = 'Позвонить за десять минут';
  const snapshot = await setup.checkout.submitComment(
    buyerOrg(setup, buyer),
    comment,
  );
  assert.equal(snapshot.state, 'awaiting_confirmation');
  assert.equal(snapshot.order.buyerComment, comment);
  assert.equal(
    fixture.value('SELECT buyer_comment FROM sotuvchi_orders'),
    comment,
  );
  for (const table of [
    'sotuvchi_order_operations',
    'workflow_instances',
    'sotuvchi_notifications',
  ]) {
    assert.ok(
      !JSON.stringify(fixture.rows(`SELECT * FROM ${table}`)).includes(comment),
      table,
    );
  }
});

test('invalid step values never reach the order row', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810081');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910081');
  await setup.checkout.startCheckout(buyerOrg(setup, buyer), product.id);

  await assert.rejects(
    () => setup.checkout.submitQuantity(buyerOrg(setup, buyer), 0),
    CheckoutValidationError,
  );
  // Valid value, wrong step: the FSM refuses the transition.
  await assert.rejects(
    () => setup.checkout.submitName(buyerOrg(setup, buyer), 'Дилшод'),
    CheckoutStateError,
  );
  await setup.checkout.submitQuantity(buyerOrg(setup, buyer), 1);
  await assert.rejects(
    () => setup.checkout.submitName(buyerOrg(setup, buyer), 'x'),
    CheckoutValidationError,
  );
  await assert.rejects(
    () => setup.checkout.submitPhone(buyerOrg(setup, buyer), '+79161234567'),
    CheckoutValidationError,
  );
  assert.equal(
    fixture.value('SELECT buyer_name FROM sotuvchi_orders'),
    null,
  );
});

test('draft survives a new service instance', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810091');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910091');
  await setup.checkout.startCheckout(buyerOrg(setup, buyer), product.id);
  await setup.checkout.submitQuantity(buyerOrg(setup, buyer), 3);

  const restarted = createSotuvchiCheckoutService(
    fixture.asD1(),
    createSotuvchiCatalogService(fixture.asD1()),
    BOT,
  );
  const resumed = await restarted.getActiveCheckout(buyerOrg(setup, buyer));
  assert.ok(resumed);
  assert.equal(resumed.state, 'awaiting_name');
  assert.equal(resumed.order.quantity, 3);
  const named = await restarted.submitName(buyerOrg(setup, buyer), 'Гулнора');
  assert.equal(named.state, 'awaiting_phone');
});

test('confirmation places exactly one immutable order', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810101');
  const product = await publish(setup, { priceMinor: 125_000 });
  const buyer = await bindBuyer(fixture, setup, '910101');
  await completeDraft(setup, buyer, product.id);

  const confirmOrg = buyerOrg(setup, buyer, 'confirm-request');
  const placed = await setup.checkout.confirmCheckout(confirmOrg);
  assert.equal(placed.outcome, 'placed');
  assert.equal(placed.state, 'completed');
  assert.equal(placed.order.status, 'placed');
  assert.equal(placed.order.totalMinor, 250_000);
  assert.ok(placed.order.placedAt);

  const duplicate = await setup.checkout.confirmCheckout(confirmOrg);
  assert.equal(duplicate.order.id, placed.order.id);
  assert.equal(duplicate.order.orderNumber, placed.order.orderNumber);
  assert.equal(
    fixture.value(`SELECT COUNT(*) FROM sotuvchi_orders WHERE status='placed'`),
    1,
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_orders'), 1);
  await assert.rejects(
    () => setup.checkout.submitQuantity(buyerOrg(setup, buyer), 5),
    CheckoutNotFoundError,
  );
  assert.equal(
    fixture.value('SELECT quantity FROM sotuvchi_order_items'),
    2,
  );
});

test('buyer order history is tenant-bound, grounded and contains no contact', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810102');
  const product = await publish(setup, {
    name: 'History Product',
    priceMinor: 75_000,
  });
  const buyer = await bindBuyer(fixture, setup, '910102');
  await completeDraft(setup, buyer, product.id);
  await setup.checkout.confirmCheckout(buyerOrg(setup, buyer));

  const history = await setup.checkout.listBuyerOrders(
    buyerOrg(setup, buyer),
  );
  assert.equal(history.length, 1);
  assert.equal(history[0].productId, product.id);
  assert.equal(history[0].productName, 'History Product');
  assert.equal(history[0].totalMinor, 150_000);
  assert.equal(history[0].status, 'placed');
  assert.equal(history[0].storeName, 'Тестовый магазин');
  const serialized = JSON.stringify(history);
  for (const forbidden of ['Дилшод', '901234567', 'Тестовая улица']) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }

  const facts = {
    toolName: 'buyer.orders.list',
    values: projectBuyerOrderHistoryFacts(history, 'ru'),
  };
  const response = composeBuyerOrderHistoryResponse(facts, 'ru');
  assert.deepEqual(groundResponse(response, [facts]), { status: 'passed' });
  const rendered = JSON.stringify(response);
  assert.ok(rendered.includes('History Product'));
  assert.ok(rendered.includes('Тестовый магазин'));
  assert.ok(rendered.includes(`buyer-similar.${product.id}`));
  assert.ok(rendered.includes('buyer-seller'));
  assert.ok(rendered.includes('UTC'));
  assert.ok(Object.keys(facts.values).length <= 64);

  const foreign = await bindBuyer(fixture, setup, '910103');
  assert.deepEqual(
    await setup.checkout.listBuyerOrders(buyerOrg(setup, foreign)),
    [],
  );
});

test('placement does not touch catalog stock or product rows', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810111');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910111');
  const before = await setup.catalog.getPublishedProduct(
    setup.storefront,
    product.id,
  );
  await completeDraft(setup, buyer, product.id);
  await setup.checkout.confirmCheckout(buyerOrg(setup, buyer));
  const after = await setup.catalog.getPublishedProduct(
    setup.storefront,
    product.id,
  );
  assert.deepEqual(after, before);
  const columns = fixture.rows<{ name: string }>(
    'PRAGMA table_info(sotuvchi_products)',
  ).map((column) => column.name);
  assert.ok(!columns.includes('stock'));
  assert.ok(!columns.includes('reserved'));
});

test('configured insufficient stock cancels checkout before placement', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810112');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910112');
  const orders = createSotuvchiOrdersService(fixture.asD1(), setup.catalog);
  await orders.setInventory(
    {
      orgId: setup.owner.orgId,
      actorId: setup.owner.identityId,
      requestId: requestId('stock'),
      locale: setup.owner.locale,
    },
    product.id,
    1,
  );
  await completeDraft(setup, buyer, product.id);

  const confirmOrg = buyerOrg(setup, buyer, 'stock-confirm');
  const snapshot = await setup.checkout.confirmCheckout(confirmOrg);
  assert.equal(snapshot.outcome, 'stock_unavailable');
  assert.equal(snapshot.state, 'cancelled');
  assert.equal(snapshot.order.status, 'cancelled');
  assert.equal(
    fixture.value(`SELECT COUNT(*) FROM sotuvchi_orders WHERE status='placed'`),
    0,
  );
  assert.equal(fixture.value('SELECT on_hand FROM sotuvchi_inventory'), 1);
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_inventory_moves'),
    1,
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_notifications'), 0);
  const replay = await setup.checkout.confirmCheckout(confirmOrg);
  assert.equal(replay.outcome, 'stock_unavailable');
  assert.equal(replay.order.id, snapshot.order.id);
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_order_operations
       WHERE operation = 'checkout.stock_unavailable'`,
    ),
    1,
  );

  const facts = {
    toolName: 'checkout.confirm',
    values: projectCheckoutFacts(snapshot, 'ru'),
  };
  const response = composeCheckoutResponse(facts, 'ru');
  assert.deepEqual(groundResponse(response, [facts]), { status: 'passed' });
  const rendered = JSON.stringify(response);
  assert.ok(rendered.includes('только что закончился'));
  assert.ok(rendered.includes(`buyer-similar.${product.id}`));
  assert.ok(!/заказать|подтвердить/i.test(rendered));
});

test('price change blocks silent confirmation and needs a second review', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810121');
  const product = await publish(setup, { priceMinor: 125_000 });
  const buyer = await bindBuyer(fixture, setup, '910121');
  await completeDraft(setup, buyer, product.id);

  const current = await setup.catalog.getPublishedProduct(
    setup.storefront,
    product.id,
  );
  await setup.catalog.updateProduct(
    nextOwner(setup.owner),
    product.id,
    current.version,
    { priceMinor: 150_000 },
  );

  const refreshed = await setup.checkout.confirmCheckout(
    buyerOrg(setup, buyer),
  );
  assert.equal(refreshed.outcome, 'price_changed');
  assert.equal(refreshed.priceChanged, true);
  assert.equal(refreshed.state, 'awaiting_confirmation');
  assert.equal(refreshed.order.status, 'draft');
  assert.equal(refreshed.order.unitPriceMinor, 150_000);
  assert.equal(refreshed.order.totalMinor, 300_000);
  assert.equal(
    fixture.value(`SELECT COUNT(*) FROM sotuvchi_orders WHERE status='placed'`),
    0,
  );

  const placed = await setup.checkout.confirmCheckout(buyerOrg(setup, buyer));
  assert.equal(placed.order.status, 'placed');
  assert.equal(placed.order.totalMinor, 300_000);
  assert.equal(
    fixture.value('SELECT unit_price_minor FROM sotuvchi_order_items'),
    150_000,
  );
});

test('a product that stops being sellable fails confirmation closed', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810131');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910131');
  await completeDraft(setup, buyer, product.id);
  const current = await setup.catalog.getPublishedProduct(
    setup.storefront,
    product.id,
  );
  await setup.catalog.unpublishProduct(
    nextOwner(setup.owner),
    product.id,
    current.version,
  );
  await assert.rejects(
    () => setup.checkout.confirmCheckout(buyerOrg(setup, buyer)),
    CheckoutNotFoundError,
  );
  assert.equal(
    fixture.value(`SELECT COUNT(*) FROM sotuvchi_orders WHERE status='placed'`),
    0,
  );
});

test('cancel closes the draft and frees a new checkout', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810141');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910141');
  await setup.checkout.startCheckout(buyerOrg(setup, buyer), product.id);

  const cancelOrg = buyerOrg(setup, buyer, 'cancel-request');
  const cancelled = await setup.checkout.cancelCheckout(cancelOrg);
  assert.ok(cancelled);
  assert.equal(cancelled.order.status, 'cancelled');
  assert.equal(cancelled.state, 'cancelled');
  const replayedCancel = await setup.checkout.cancelCheckout(cancelOrg);
  assert.equal(replayedCancel?.order.id, cancelled.order.id);
  assert.equal(
    await setup.checkout.cancelCheckout(buyerOrg(setup, buyer)),
    null,
  );
  assert.equal(
    await setup.checkout.getActiveCheckout(buyerOrg(setup, buyer)),
    null,
  );

  const restarted = await setup.checkout.startCheckout(
    buyerOrg(setup, buyer),
    product.id,
  );
  assert.equal(restarted.outcome, 'started');
  assert.equal(
    fixture.value(`SELECT COUNT(*) FROM sotuvchi_orders WHERE status='draft'`),
    1,
  );
});

test('one order can never hold a second item', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810151');
  const product = await publish(setup);
  const second = await publish(setup, { name: 'Beta Phone' });
  const buyer = await bindBuyer(fixture, setup, '910151');
  const snapshot = await setup.checkout.startCheckout(
    buyerOrg(setup, buyer),
    product.id,
  );
  assert.throws(() => fixture.exec(
    `INSERT INTO sotuvchi_order_items
       (id, org_id, store_id, order_id, product_id, product_name_snapshot,
        unit_price_minor, currency, availability_snapshot, quantity,
        line_total_minor, created_at, updated_at)
     SELECT 'i-second', org_id, store_id, '${snapshot.order.id}',
            '${second.id}', 'Beta Phone', 1, 'UZS', 'available', NULL, NULL,
            created_at, updated_at
     FROM sotuvchi_orders WHERE id = '${snapshot.order.id}'`,
  ));
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_order_items'), 1);
});

test('one request key reused for another step fails closed', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810271');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '910271');
  await setup.checkout.startCheckout(buyerOrg(setup, buyer), product.id);
  const shared = buyerOrg(setup, buyer, 'shared-request-key');
  await setup.checkout.submitQuantity(shared, 2);
  await assert.rejects(
    () => setup.checkout.submitName(shared, 'Дилшод'),
    CheckoutIdempotencyConflictError,
  );
  assert.equal(fixture.value('SELECT buyer_name FROM sotuvchi_orders'), null);
});

test('placed order keeps an immutable catalog snapshot', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810281');
  const product = await publish(setup, { priceMinor: 125_000 });
  const buyer = await bindBuyer(fixture, setup, '910281');
  await completeDraft(setup, buyer, product.id);
  const placed = await setup.checkout.confirmCheckout(buyerOrg(setup, buyer));
  const current = await setup.catalog.getPublishedProduct(
    setup.storefront,
    product.id,
  );
  await setup.catalog.updateProduct(
    nextOwner(setup.owner),
    product.id,
    current.version,
    { priceMinor: 999_000, name: 'Renamed Phone' },
  );
  const stored = fixture.rows<{
    product_name_snapshot: string;
    unit_price_minor: number;
    line_total_minor: number;
  }>('SELECT product_name_snapshot, unit_price_minor, line_total_minor '
    + 'FROM sotuvchi_order_items')[0];
  assert.equal(stored.product_name_snapshot, 'Alpha Phone');
  assert.equal(stored.unit_price_minor, 125_000);
  assert.equal(stored.line_total_minor, 250_000);
  assert.equal(
    fixture.value('SELECT total_minor FROM sotuvchi_orders'),
    placed.order.totalMinor,
  );
});

test('checkout tool input is closed and the port refuses foreign operations',
  async () => {
    const fixture = new SqliteD1();
    const setup = await setupStore(fixture, '810291');
    const product = await publish(setup);
    const buyer = await bindBuyer(fixture, setup, '910291');
    const tool = sotuvchiAgentManifest.tools.find(
      (candidate) => candidate.name === 'checkout.start',
    );
    assert.ok(tool);
    assert.deepEqual(
      tool.inputSchema.parse({ productRef: product.id }),
      { productRef: product.id },
    );
    for (const rejected of [
      { productRef: product.id, priceMinor: 1 },
      { productRef: product.id, quantity: 5 },
      { productRef: product.id, orgId: 'org-other' },
      { productId: product.id },
      {},
    ]) {
      assert.throws(
        () => tool.inputSchema.parse(rejected),
        CheckoutValidationError,
      );
    }
    assert.equal(
      await setup.checkout.getActiveCheckout(buyerOrg(setup, buyer)),
      null,
    );
    const port = createSotuvchiCheckoutDomainPort(setup.checkout);
    await assert.rejects(
      () => port.execute({
        agentId: 'sotuvchi',
        operation: 'catalog.product.create',
        org: buyerOrg(setup, buyer),
        input: { name: 'Attack', priceMinor: 1 },
      }),
      CheckoutAuthorizationError,
    );
    await assert.rejects(
      () => port.execute({
        agentId: 'demo',
        operation: 'checkout.start',
        org: buyerOrg(setup, buyer),
        input: { productRef: product.id },
      }),
      CheckoutAuthorizationError,
    );
    assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_orders'), 0);
  });

// ── Tenant isolation ───────────────────────────────────────────────────────

test('checkout authority never crosses buyers, stores or orgs', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '810161');
  const second = await setupStore(fixture, '810171');
  const product = await publish(first, { name: 'Alpha Phone' });
  const foreign = await publish(second, { name: 'Foreign Phone' });
  const buyerA = await bindBuyer(fixture, first, '910161');
  const buyerB = await bindBuyer(fixture, first, '910171');

  await first.checkout.startCheckout(buyerOrg(first, buyerA), product.id);

  // Buyer B has no draft of their own and cannot read or mutate buyer A's.
  assert.equal(
    await first.checkout.getActiveCheckout(buyerOrg(first, buyerB)),
    null,
  );
  await assert.rejects(
    () => first.checkout.submitQuantity(buyerOrg(first, buyerB), 4),
    CheckoutNotFoundError,
  );

  // A storefront session cannot order a foreign store's product.
  await assert.rejects(
    () => first.checkout.startCheckout(buyerOrg(first, buyerA), foreign.id),
    CheckoutNotFoundError,
  );

  // An org override in the trusted context is rejected, not honoured.
  await assert.rejects(
    () => first.checkout.startCheckout(
      { ...buyerOrg(first, buyerA), orgId: second.storefront.orgId },
      product.id,
    ),
    CheckoutAuthorizationError,
  );

  // An unknown actor has no authority at all.
  await assert.rejects(
    () => first.checkout.startCheckout(
      { ...buyerOrg(first, buyerA), actorId: 'identity-unknown' },
      product.id,
    ),
    CheckoutAuthorizationError,
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_orders'), 1);
});

test('order id alone grants no authority in another tenant', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '810181');
  const second = await setupStore(fixture, '810191');
  const product = await publish(first);
  const buyerA = await bindBuyer(fixture, first, '910181');
  const buyerB = await bindBuyer(fixture, second, '910191');
  const snapshot = await first.checkout.startCheckout(
    buyerOrg(first, buyerA),
    product.id,
  );
  const foreignView = await second.checkout.getActiveCheckout(
    buyerOrg(second, buyerB),
  );
  assert.equal(foreignView, null);
  assert.equal(
    await second.checkout.getActiveWorkflowRef(buyerB),
    null,
  );
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_orders WHERE id = ? AND org_id = ?`,
      snapshot.order.id,
      second.storefront.orgId,
    ),
    0,
  );
});

// ── Facts and grounding ────────────────────────────────────────────────────

test('checkout facts are scalar, masked and free of raw order rows', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810201');
  const product = await publish(setup, { priceMinor: 125_000 });
  const buyer = await bindBuyer(fixture, setup, '910201');
  await completeDraft(setup, buyer, product.id);
  const snapshot = await setup.checkout.getActiveCheckout(
    buyerOrg(setup, buyer),
  );
  assert.ok(snapshot);
  const values = projectCheckoutFacts(snapshot, 'ru');
  assert.equal(values['checkout.quantity'], 2);
  assert.equal(values['checkout.total_minor'], 250_000);
  assert.equal(values['checkout.total_display'], '250 000 сум');
  assert.equal(values['checkout.customer.phone_masked'], '+998 ** *** ** 67');
  assert.equal(values['checkout.customer.address_present'], true);
  assert.ok(Object.values(values).every(
    (value) => value === null || typeof value !== 'object',
  ));
  const serialized = JSON.stringify(values);
  assert.ok(!serialized.includes('Дилшод'));
  assert.ok(!serialized.includes('Тестовая улица'));
  assert.ok(!serialized.includes('+998901234567'));
  assert.ok(!serialized.includes(setup.storefront.orgId));
  assert.ok(!serialized.includes(setup.storefront.storeId));
  assert.ok(!serialized.includes(snapshot.order.id));
});

test('review, prompt and confirmation messages pass strict grounding', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810211');
  const product = await publish(setup, { priceMinor: 125_000 });
  const buyer = await bindBuyer(fixture, setup, '910211');
  const started = await setup.checkout.startCheckout(
    buyerOrg(setup, buyer),
    product.id,
  );
  for (const [snapshot, locale] of [
    [started, 'ru'],
    [started, 'uz'],
  ] as const) {
    const facts = {
      toolName: 'checkout.start',
      values: projectCheckoutFacts(snapshot, locale),
    };
    assert.deepEqual(
      groundResponse(composeCheckoutResponse(facts, locale), [facts]),
      { status: 'passed' },
    );
  }

  await completeDraft(setup, buyer, product.id);
  const review = await setup.checkout.getActiveCheckout(buyerOrg(setup, buyer));
  assert.ok(review);
  const reviewFacts = {
    toolName: 'checkout.start',
    values: projectCheckoutFacts(review, 'ru'),
  };
  const reviewDraft = composeCheckoutResponse(reviewFacts, 'ru');
  assert.deepEqual(
    groundResponse(reviewDraft, [reviewFacts]),
    { status: 'passed' },
  );
  assert.ok(reviewDraft.messages[0].text.includes('250 000 сум'));
  assert.ok(reviewDraft.messages[0].text.includes('+998 ** *** ** 67'));
  assert.ok(!reviewDraft.messages[0].text.includes('Дилшод'));
  assert.ok(!reviewDraft.messages[0].text.includes('Тестовая улица'));

  const placed = await setup.checkout.confirmCheckout(buyerOrg(setup, buyer));
  const placedFacts = {
    toolName: 'checkout.start',
    values: projectCheckoutFacts(placed, 'ru'),
  };
  const placedDraft = composeCheckoutResponse(placedFacts, 'ru');
  assert.deepEqual(
    groundResponse(placedDraft, [placedFacts]),
    { status: 'passed' },
  );
  assert.ok(placedDraft.messages[0].text.includes(placed.order.orderNumber));
});

test('unsupported totals and order numbers are rejected', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810221');
  const product = await publish(setup, { priceMinor: 125_000 });
  const buyer = await bindBuyer(fixture, setup, '910221');
  await completeDraft(setup, buyer, product.id);
  const snapshot = await setup.checkout.getActiveCheckout(
    buyerOrg(setup, buyer),
  );
  assert.ok(snapshot);
  const facts = {
    toolName: 'checkout.start',
    values: projectCheckoutFacts(snapshot, 'ru'),
  };
  const draft = composeCheckoutResponse(facts, 'ru');
  const tampered = {
    ...draft,
    messages: [{
      ...draft.messages[0],
      text: draft.messages[0].text.replace('250 000 сум', '99 999 сум'),
    }],
  };
  assert.equal(groundResponse(tampered, [facts]).status, 'failed');
  assert.equal(
    groundResponse(
      { messages: [{ text: 'Заказ S-ZZZZZZ на 777' }] },
      [facts],
    ).status,
    'failed',
  );
});

// ── Telegram end to end ────────────────────────────────────────────────────

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
      id: `cb-${updateId}`,
      from: { id: userId, language_code: languageCode },
      message: {
        message_id: updateId,
        chat: { id: userId, type: 'private' },
      },
      data: `agent:${actionId}`,
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
  return { delivery, invoke, wiring };
}

test('Telegram RU checkout runs card to order without payment surface', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810231');
  const product = await publish(setup, {
    name: 'Alpha Phone',
    priceMinor: 125_000,
  });
  const harness = telegramHarness(fixture);
  await harness.invoke(telegramMessage(
    970_001,
    97001,
    `/start agent_${setup.storefrontCode}`,
    'ru',
  ));
  await harness.invoke(telegramMessage(970_002, 97001, 'Alpha Phone', 'ru'));
  const card = JSON.stringify(harness.delivery.sent);
  assert.ok(card.includes('Заказать'));
  assert.ok(card.includes(`buyer-checkout.${product.id}`));

  await harness.invoke(telegramCallback(
    970_003,
    97001,
    `buyer-checkout.${product.id}`,
    'ru',
  ));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Укажите количество'));
  await harness.invoke(telegramMessage(970_004, 97001, '2', 'ru'));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Как вас зовут'));
  await harness.invoke(telegramMessage(970_010, 97001, '/start', 'ru'));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Как вас зовут'));
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_orders WHERE status = 'draft'`,
    ),
    1,
  );
  await harness.invoke(telegramMessage(970_005, 97001, 'Дилшод', 'ru'));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('номер телефона'));
  await harness.invoke(telegramMessage(970_006, 97001, '90 123 45 67', 'ru'));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('запрос на получение'));
  await harness.invoke(
    telegramMessage(970_007, 97001, 'Тошкент, Чилонзор 5', 'ru'),
  );
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('комментарий'));
  await harness.invoke(telegramCallback(
    970_008,
    97001,
    'buyer-checkout-comment-skip',
    'ru',
  ));
  const review = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(review.includes('Проверьте заказ'));
  assert.ok(review.includes('250 000 сум'));
  assert.ok(review.includes('+998 ** *** ** 67'));
  assert.ok(!review.includes('Чилонзор'));
  assert.ok(!review.includes('Дилшод'));

  const before = harness.delivery.sent.length;
  await harness.invoke(telegramCallback(
    970_009,
    97001,
    'buyer-checkout-confirm',
    'ru',
  ));
  const confirmation = harness.delivery.sent.at(-1)?.text ?? '';
  assert.equal(harness.delivery.sent.length, before + 1);
  assert.match(confirmation, /Заказ принят\. Номер: S-[2-9A-HJ-NP-Z]{6}/);
  assert.ok(confirmation.includes('Оплата не производилась'));
  assert.equal(
    fixture.value(`SELECT COUNT(*) FROM sotuvchi_orders WHERE status='placed'`),
    1,
  );
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM events
       WHERE type = 'sotuvchi.order_started'`,
    ),
    1,
  );
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM events
       WHERE type = 'sotuvchi.order_created'`,
    ),
    1,
  );

  const rendered = JSON.stringify(harness.delivery.sent);
  assert.ok(!/Оплатить|Payme|Click|Управление заказом|оператор/i.test(rendered));
});

test('Telegram UZ checkout and duplicate update stay single-effect', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810241', 'uz');
  const product = await publish(setup, {
    name: 'Samsung Sinov',
    priceMinor: 200_000,
  });
  const harness = telegramHarness(fixture);
  await harness.invoke(telegramMessage(
    980_001,
    98001,
    `/start agent_${setup.storefrontCode}`,
    'uz',
  ));
  await harness.invoke(telegramMessage(980_002, 98001, 'Samsung Sinov', 'uz'));
  assert.ok(JSON.stringify(harness.delivery.sent).includes('Buyurtma berish'));
  await harness.invoke(telegramCallback(
    980_003,
    98001,
    `buyer-checkout.${product.id}`,
    'uz',
  ));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Miqdorni kiriting'));

  const quantityUpdate = telegramMessage(980_004, 98001, '3', 'uz');
  await harness.invoke(quantityUpdate);
  const afterQuantity = harness.delivery.sent.length;
  const duplicate = await harness.invoke(quantityUpdate);
  assert.equal(await duplicate.text(), 'duplicate');
  assert.equal(harness.delivery.sent.length, afterQuantity);

  await harness.invoke(telegramMessage(980_005, 98001, 'Gulnora', 'uz'));
  await harness.invoke(telegramMessage(980_006, 98001, '998901234567', 'uz'));
  await harness.invoke(
    telegramMessage(980_007, 98001, 'Toshkent, Chilonzor 5', 'uz'),
  );
  await harness.invoke(telegramCallback(
    980_008,
    98001,
    'buyer-checkout-comment-skip',
    'uz',
  ));
  const review = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(review.includes('Buyurtmani tekshiring'));
  assert.ok(review.includes('600 000 so‘m'));
  await harness.invoke(telegramCallback(
    980_009,
    98001,
    'buyer-checkout-confirm',
    'uz',
  ));
  assert.ok(
    harness.delivery.sent.at(-1)?.text.includes('Buyurtma qabul qilindi'),
  );
  assert.equal(
    fixture.value(`SELECT COUNT(*) FROM sotuvchi_orders WHERE status='placed'`),
    1,
  );
  assert.equal(
    fixture.value('SELECT quantity FROM sotuvchi_order_items'),
    3,
  );
});

test('Telegram checkout rejects bad input and supports cancel', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810251');
  const product = await publish(setup, { name: 'Alpha Phone' });
  const harness = telegramHarness(fixture);
  await harness.invoke(telegramMessage(
    990_001,
    99001,
    `/start agent_${setup.storefrontCode}`,
    'ru',
  ));
  await harness.invoke(telegramCallback(
    990_002,
    99001,
    `buyer-checkout.${product.id}`,
    'ru',
  ));
  await harness.invoke(telegramMessage(990_003, 99001, 'много', 'ru'));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Значение не принято'));
  assert.equal(
    fixture.value('SELECT quantity FROM sotuvchi_order_items'),
    null,
  );
  await harness.invoke(telegramMessage(990_004, 99001, '2', 'ru'));
  await harness.invoke(telegramCallback(
    990_005,
    99001,
    'buyer-checkout-cancel',
    'ru',
  ));
  assert.ok(
    harness.delivery.sent.at(-1)?.text.includes('Оформление отменено'),
  );
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_orders WHERE status='cancelled'`,
    ),
    1,
  );

  // After cancelling, ordinary catalog answers resume.
  await harness.invoke(telegramMessage(990_006, 99001, 'что у вас есть', 'ru'));
  assert.ok(harness.delivery.sent.at(-2)?.text.includes('Alpha Phone'));
});

test('checkout state survives a stale product and stores no PII in workflow', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '810261');
  const product = await publish(setup, { name: 'Alpha Phone' });
  const harness = telegramHarness(fixture);
  await harness.invoke(telegramMessage(
    991_001,
    99101,
    `/start agent_${setup.storefrontCode}`,
    'ru',
  ));
  await harness.invoke(telegramCallback(
    991_002,
    99101,
    `buyer-checkout.${product.id}`,
    'ru',
  ));
  await harness.invoke(telegramMessage(991_003, 99101, '2', 'ru'));
  await harness.invoke(telegramMessage(991_004, 99101, 'Дилшод', 'ru'));
  await harness.invoke(telegramMessage(991_005, 99101, '901234567', 'ru'));
  await harness.invoke(
    telegramMessage(991_006, 99101, 'Тошкент, Чилонзор 5', 'ru'),
  );
  await harness.invoke(telegramCallback(
    991_007,
    99101,
    'buyer-checkout-comment-skip',
    'ru',
  ));

  const payloads = fixture.rows<{ payload_json: string }>(
    `SELECT payload_json FROM workflow_instances
     WHERE workflow_id = 'sotuvchi-checkout'`,
  );
  assert.equal(payloads.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(payloads[0].payload_json)), ['orderId']);
  for (const secret of ['Дилшод', 'Чилонзор', '901234567']) {
    assert.ok(!payloads[0].payload_json.includes(secret), secret);
  }
  const operations = fixture.rows<{ operation: string; fingerprint: string }>(
    'SELECT operation, fingerprint FROM sotuvchi_order_operations',
  );
  assert.ok(operations.length >= 5);
  for (const row of operations) {
    assert.match(row.fingerprint, /^[0-9a-f]{64}$/);
    assert.ok(!/Дилшод|Чилонзор|901234567/.test(JSON.stringify(row)));
  }

  const current = await setup.catalog.getPublishedProduct(
    setup.storefront,
    product.id,
  );
  await setup.catalog.unpublishProduct(
    nextOwner(setup.owner),
    product.id,
    current.version,
  );
  await harness.invoke(telegramCallback(
    991_008,
    99101,
    'buyer-checkout-confirm',
    'ru',
  ));
  assert.equal(
    fixture.value(`SELECT COUNT(*) FROM sotuvchi_orders WHERE status='placed'`),
    0,
  );
  assert.ok(harness.delivery.sent.at(-1)?.text.length);
});

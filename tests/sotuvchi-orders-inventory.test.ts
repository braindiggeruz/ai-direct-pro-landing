import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTelegramAgentsRuntimeWiring } from '../functions/api/telegram/agents';
import {
  CatalogAuthorizationError,
  composeSellerOrdersResponse,
  createSotuvchiCatalogService,
  createSotuvchiCheckoutService,
  createSotuvchiOnboardingService,
  createSotuvchiOrdersService,
  ensureSotuvchiOrdersSchema,
  InventoryInsufficientError,
  InventoryNotConfiguredError,
  isAllowedSellerTransition,
  normalizeOnHand,
  parseOnHandText,
  projectNotificationFacts,
  projectSellerInventoryFacts,
  projectSellerOrderFacts,
  projectSellerOrdersFacts,
  projectSellerTransitionFacts,
  SellerOrdersAuthorizationError,
  SellerOrdersIdempotencyConflictError,
  SellerOrdersNotFoundError,
  SellerOrdersStateError,
  SellerOrdersValidationError,
  sotuvchiAgentManifest,
  toSellerOrderStatus,
  type CatalogProduct,
  type SotuvchiCatalogService,
  type SotuvchiCheckoutService,
  type SotuvchiIdentityContext,
  type SotuvchiOrdersService,
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
import { activatePilotStore } from './helpers/pilot-store';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOT = 'agents_orders_fixture_bot';
const SECRET = 'fixture-orders-webhook-secret';
let sequence = 0;

function requestId(prefix = 'seller'): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

/** node:sqlite returns null-prototype rows; deepEqual needs plain objects. */
function plain<T extends object>(rows: readonly T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

interface StoreFixture {
  catalog: SotuvchiCatalogService;
  checkout: SotuvchiCheckoutService;
  orders: SotuvchiOrdersService;
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
    orders: createSotuvchiOrdersService(db, catalog),
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

async function publish(
  setup: StoreFixture,
  input: Partial<{
    name: string;
    priceMinor: number;
    availability: 'available' | 'unavailable' | 'preorder';
  }> = {},
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

/** Runs the full P2.4 buyer checkout and returns the placed order id. */
async function placeOrder(
  setup: StoreFixture,
  identityId: string,
  productId: string,
  quantity = 2,
  comment: string | null = null,
): Promise<string> {
  await setup.checkout.startCheckout(buyerOrg(setup, identityId), productId);
  await setup.checkout.submitQuantity(buyerOrg(setup, identityId), quantity);
  await setup.checkout.submitName(buyerOrg(setup, identityId), 'Дилшод');
  await setup.checkout.submitPhone(buyerOrg(setup, identityId), '901234567');
  await setup.checkout.submitAddress(
    buyerOrg(setup, identityId),
    'Тошкент, Чилонзор 5',
  );
  if (comment === null) {
    await setup.checkout.skipComment(buyerOrg(setup, identityId));
  } else {
    await setup.checkout.submitComment(
      buyerOrg(setup, identityId),
      comment,
    );
  }
  const placed = await setup.checkout.confirmCheckout(
    buyerOrg(setup, identityId),
  );
  assert.equal(placed.order.status, 'placed');
  return placed.order.id;
}

// ── Validation and lifecycle rules ─────────────────────────────────────────

test('stock validation accepts bounded integers only', () => {
  assert.equal(normalizeOnHand(0), 0);
  assert.equal(normalizeOnHand(1_000_000), 1_000_000);
  for (const invalid of [-1, 1.5, 1_000_001, '5', null, Number.NaN]) {
    assert.throws(() => normalizeOnHand(invalid));
  }
  assert.equal(parseOnHandText(' 12 '), 12);
  for (const invalid of ['', '-1', '1.5', '12345678', '١٢', '5 шт']) {
    assert.equal(parseOnHandText(invalid), null);
  }
});

test('seller status is derived from the status pair only', () => {
  assert.equal(toSellerOrderStatus('placed', 'none'), 'placed');
  assert.equal(toSellerOrderStatus('placed', 'confirmed'), 'confirmed');
  assert.equal(toSellerOrderStatus('placed', 'done'), 'done');
  assert.equal(toSellerOrderStatus('cancelled', 'none'), 'cancelled');
  for (const pair of [
    ['cancelled', 'confirmed'],
    ['cancelled', 'done'],
    ['draft', 'none'],
    ['placed', 'unknown'],
  ] as const) {
    assert.throws(() => toSellerOrderStatus(pair[0], pair[1]));
  }
});

test('only placed→confirmed, placed→cancelled and confirmed→done are allowed', () => {
  assert.ok(isAllowedSellerTransition('placed', 'confirm'));
  assert.ok(isAllowedSellerTransition('placed', 'cancel'));
  assert.ok(isAllowedSellerTransition('confirmed', 'done'));
  for (const pair of [
    ['confirmed', 'cancel'],
    ['confirmed', 'confirm'],
    ['cancelled', 'confirm'],
    ['cancelled', 'done'],
    ['done', 'confirm'],
    ['done', 'cancel'],
    ['done', 'done'],
    ['placed', 'done'],
  ] as const) {
    assert.equal(isAllowedSellerTransition(pair[0], pair[1]), false);
  }
});

// ── Migration and bootstrap ────────────────────────────────────────────────

test('orders migration is additive and stores no buyer content', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'migrations/0022_sotuvchi_orders_inventory.sql'),
    'utf8',
  );
  const executable = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(executable, /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(executable, /payload|buyer_|phone|address|raw_/i);
  assert.match(executable, /ALTER TABLE sotuvchi_orders\s+ADD COLUMN/);
  assert.doesNotMatch(executable, /ALTER TABLE\s+\w+\s+DROP/i);
  for (const marker of [
    'sotuvchi_inventory',
    'sotuvchi_inventory_moves',
    'sotuvchi_notifications',
    'idx_sotuvchi_inventory_moves_order_type',
  ]) {
    assert.ok(executable.includes(marker), marker);
  }
});

test('migration and runtime bootstrap stay in parity', () => {
  const schema = fs.readFileSync(
    path.join(ROOT, 'functions/agents/sotuvchi/orders/schema.ts'),
    'utf8',
  );
  const outbox = fs.readFileSync(
    path.join(ROOT, 'functions/agents/sotuvchi/outbox/schema.ts'),
    'utf8',
  );
  const migration = fs.readFileSync(
    path.join(ROOT, 'migrations/0022_sotuvchi_orders_inventory.sql'),
    'utf8',
  );
  const flatten = (value: string) => value.replace(/\s+/g, ' ');
  const bootstrap = flatten(`${schema}\n${outbox}`);
  const applied = flatten(migration);
  for (const marker of [
    'on_hand INTEGER NOT NULL CHECK (on_hand >= 0 AND on_hand <= 1000000)',
    "type IN ( 'initial', 'manual_adjustment', 'order_confirmed' )",
    "audience IN ('seller', 'buyer')",
    "status IN ('pending', 'sending', 'sent', 'failed')",
    'UNIQUE (order_id, audience, type)',
    "fulfillment_status IN ('none', 'confirmed', 'done')",
    'PRIMARY KEY (org_id, store_id, product_id)',
    'UNIQUE (org_id, store_id, idempotency_key)',
    'idx_sotuvchi_inventory_moves_order_type ON sotuvchi_inventory_moves '
      + '(order_id, type) WHERE order_id IS NOT NULL',
    'idx_sotuvchi_notifications_pending',
  ]) {
    assert.ok(bootstrap.includes(marker), `bootstrap ${marker}`);
    assert.ok(applied.includes(marker), `migration ${marker}`);
  }
});

test('runtime bootstrap is repeatable and content-free', async () => {
  const fixture = new SqliteD1();
  await ensureSotuvchiOrdersSchema(fixture.asD1());
  await ensureSotuvchiOrdersSchema(fixture.asD1());
  const objects = fixture.rows<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE name LIKE 'sotuvchi_inventory%'
        OR name LIKE 'sotuvchi_notifications%'
        OR name LIKE 'idx_sotuvchi_inventory%'
        OR name LIKE 'idx_sotuvchi_notifications%'`,
  ).map((row) => row.name);
  for (const expected of [
    'sotuvchi_inventory',
    'sotuvchi_inventory_moves',
    'sotuvchi_notifications',
    'idx_sotuvchi_inventory_moves_order_type',
    'idx_sotuvchi_notifications_pending',
  ]) {
    assert.ok(objects.includes(expected), expected);
  }
  const orderColumns = fixture.rows<{ name: string }>(
    'PRAGMA table_info(sotuvchi_orders)',
  ).map((column) => column.name);
  assert.ok(orderColumns.includes('fulfillment_status'));
  const notificationColumns = fixture.rows<{ name: string }>(
    'PRAGMA table_info(sotuvchi_notifications)',
  ).map((column) => column.name);
  for (const forbidden of [
    'payload_json',
    'buyer_name',
    'buyer_phone',
    'buyer_address',
    'text',
  ]) {
    assert.ok(!notificationColumns.includes(forbidden), forbidden);
  }
  const moveColumns = fixture.rows<{ name: string }>(
    'PRAGMA table_info(sotuvchi_inventory_moves)',
  ).map((column) => column.name);
  assert.deepEqual(moveColumns, [
    'id',
    'org_id',
    'store_id',
    'product_id',
    'order_id',
    'type',
    'delta',
    'balance_after',
    'idempotency_key',
    'created_at',
  ]);
});

// ── Inventory ──────────────────────────────────────────────────────────────

test('initial stock creates a balance and one initial movement', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820001');
  const product = await publish(setup);
  const result = await setup.orders.setInventory(
    sellerOrg(setup),
    product.id,
    7,
  );
  assert.equal(result.outcome, 'applied');
  assert.equal(result.moveType, 'initial');
  assert.equal(result.snapshot.onHand, 7);
  assert.equal(result.snapshot.version, 1);
  assert.equal(result.delta, 7);
  const moves = fixture.rows<{ type: string; delta: number; balance_after: number }>(
    'SELECT type, delta, balance_after FROM sotuvchi_inventory_moves',
  );
  assert.deepEqual(plain(moves), [{ type: 'initial', delta: 7, balance_after: 7 }]);
});

test('manual adjustment appends a movement with delta and balance', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820002');
  const product = await publish(setup);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 5);
  const result = await setup.orders.setInventory(
    sellerOrg(setup),
    product.id,
    3,
  );
  assert.equal(result.moveType, 'manual_adjustment');
  assert.equal(result.delta, -2);
  assert.equal(result.snapshot.onHand, 3);
  assert.equal(result.snapshot.version, 2);
  const moves = fixture.rows<{ type: string; delta: number; balance_after: number }>(
    'SELECT type, delta, balance_after FROM sotuvchi_inventory_moves ORDER BY created_at, id',
  );
  assert.equal(moves.length, 2);
  assert.deepEqual({ ...moves[1] }, {
    type: 'manual_adjustment',
    delta: -2,
    balance_after: 3,
  });
});

test('setting the same balance writes nothing new', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820003');
  const product = await publish(setup);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 4);
  const repeated = await setup.orders.setInventory(
    sellerOrg(setup),
    product.id,
    4,
  );
  assert.equal(repeated.outcome, 'unchanged');
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_inventory_moves'),
    1,
  );
  assert.equal(
    fixture.value('SELECT version FROM sotuvchi_inventory'),
    1,
  );
});

test('inventory writes are idempotent for one trusted request id', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820004');
  const product = await publish(setup);
  const org = sellerOrg(setup, requestId('fixed'));
  const first = await setup.orders.setInventory(org, product.id, 9);
  const replay = await setup.orders.setInventory(org, product.id, 9);
  assert.equal(first.outcome, 'applied');
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(replay.snapshot.onHand, 9);
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_inventory_moves'),
    1,
  );
  await assert.rejects(
    () => setup.orders.setInventory(org, product.id, 4),
    SellerOrdersIdempotencyConflictError,
  );
});

test('a stale inventory version cannot overwrite a newer balance', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820005');
  const product = await publish(setup);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 6);
  // Simulate a concurrent writer bumping the row between read and write.
  fixture.exec(
    `UPDATE sotuvchi_inventory SET version = version + 1, on_hand = 2`,
  );
  const store = (setup.orders as unknown as {
    store: {
      setInventory(input: unknown): Promise<readonly number[]>;
    };
  }).store;
  const changes = await store.setInventory({
    context: {
      identityId: setup.owner.identityId,
      orgId: setup.owner.orgId,
      storeId: setup.owner.storeId,
      requestId: requestId('stale'),
      locale: 'ru',
    },
    productId: product.id,
    onHand: 10,
    previous: {
      productId: product.id,
      productName: product.name,
      onHand: 6,
      version: 1,
    },
    moveId: 'm-stalefixture0001',
    moveType: 'manual_adjustment',
    operation: {
      idempotencyKey: requestId('stale-op'),
      operation: 'seller.inventory.set',
      fingerprint: 'f'.repeat(64),
      createdAt: new Date().toISOString(),
    },
    now: new Date().toISOString(),
  });
  assert.deepEqual(changes, [0, 0, 0]);
  assert.equal(fixture.value('SELECT on_hand FROM sotuvchi_inventory'), 2);
});

test('inventory refuses products that are not sellable', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820006');
  const draft = await setup.catalog.createProduct(nextOwner(setup.owner), {
    name: 'Draft Only',
    priceMinor: 10_000,
    currency: 'UZS',
    availability: 'available',
    mediaRefs: [],
  });
  await assert.rejects(
    () => setup.orders.setInventory(sellerOrg(setup), draft.id, 5),
    SellerOrdersStateError,
  );
  const unavailable = await publish(setup, {
    name: 'Sold Out',
    availability: 'unavailable',
  });
  await assert.rejects(
    () => setup.orders.setInventory(sellerOrg(setup), unavailable.id, 5),
    SellerOrdersStateError,
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_inventory'), 0);
});

test('reading an unset balance fails closed', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820007');
  const product = await publish(setup);
  await assert.rejects(
    () => setup.orders.getInventory(sellerOrg(setup), product.id),
    InventoryNotConfiguredError,
  );
  assert.deepEqual(await setup.orders.listInventory(sellerOrg(setup)), []);
});

test('inventory is isolated between stores', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '820008');
  const second = await setupStore(fixture, '820009');
  const productA = await publish(first, { name: 'Alpha A' });
  const productB = await publish(second, { name: 'Alpha B' });
  await first.orders.setInventory(sellerOrg(first), productA.id, 11);
  await second.orders.setInventory(sellerOrg(second), productB.id, 22);
  const listA = await first.orders.listInventory(sellerOrg(first));
  assert.deepEqual(listA.map((row) => row.onHand), [11]);
  await assert.rejects(
    () => second.orders.getInventory(sellerOrg(second), productA.id),
    SellerOrdersStateError,
  );
  await assert.rejects(
    () => second.orders.setInventory(sellerOrg(second), productA.id, 1),
    SellerOrdersStateError,
  );
  assert.equal(
    fixture.value(
      'SELECT on_hand FROM sotuvchi_inventory WHERE product_id = ?',
      productA.id,
    ),
    11,
  );
});

// ── Seller order reads ─────────────────────────────────────────────────────

test('the seller list shows placed orders and hides buyer drafts', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820010');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920010');
  await placeOrder(setup, buyer, product.id);

  const other = await bindBuyer(fixture, setup, '920011');
  await setup.checkout.startCheckout(buyerOrg(setup, other), product.id);

  const orders = await setup.orders.listOrders(sellerOrg(setup));
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, 'placed');
  assert.equal(orders[0].quantity, 2);
  assert.equal(orders[0].totalMinor, 250_000);
});

test('the list projection carries no buyer contact data', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820012');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920012');
  await placeOrder(setup, buyer, product.id);
  const orders = await setup.orders.listOrders(sellerOrg(setup));
  const serialized = JSON.stringify(orders);
  for (const secret of ['Дилшод', '+998901234567', 'Чилонзор']) {
    assert.ok(!serialized.includes(secret), secret);
  }
  const facts = projectSellerOrdersFacts(orders, 'ru');
  assert.ok(!JSON.stringify(facts).includes('Дилшод'));
  for (const value of Object.values(facts)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value));
  }
});

test('the detail view exposes contacts to the authorized owner only', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820013');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920013');
  const orderId = await placeOrder(setup, buyer, product.id);
  const detail = await setup.orders.getOrder(sellerOrg(setup), orderId);
  assert.equal(detail.customerName, 'Дилшод');
  assert.equal(detail.customerPhone, '+998901234567');
  assert.equal(detail.customerAddress, 'Тошкент, Чилонзор 5');
  assert.equal(detail.inventoryOnHand, null);
  assert.equal(detail.inventoryRequired, true);

  const buyerContext: OrgContext = {
    orgId: setup.storefront.orgId,
    actorId: buyer,
    requestId: requestId('buyer-authority'),
    locale: 'ru',
  };
  await assert.rejects(
    () => setup.orders.getOrder(buyerContext, orderId),
    CatalogAuthorizationError,
  );
  await assert.rejects(
    () => setup.orders.confirmOrder(buyerContext, orderId),
    CatalogAuthorizationError,
  );
  await assert.rejects(
    () => setup.orders.getOrder(
      { ...buyerContext, actorId: undefined, requestId: requestId('anon') },
      orderId,
    ),
    SellerOrdersAuthorizationError,
  );
});

test('orders are isolated between stores', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '820014');
  const second = await setupStore(fixture, '820015');
  const product = await publish(first);
  const buyer = await bindBuyer(fixture, first, '920014');
  const orderId = await placeOrder(first, buyer, product.id);
  assert.deepEqual(await second.orders.listOrders(sellerOrg(second)), []);
  await assert.rejects(
    () => second.orders.getOrder(sellerOrg(second), orderId),
    SellerOrdersNotFoundError,
  );
  await assert.rejects(
    () => second.orders.confirmOrder(sellerOrg(second), orderId),
    SellerOrdersNotFoundError,
  );
  assert.equal(
    fixture.value(
      'SELECT fulfillment_status FROM sotuvchi_orders WHERE id = ?',
      orderId,
    ),
    'none',
  );
});

// ── Confirm ────────────────────────────────────────────────────────────────

test('confirm decrements stock exactly once and records a movement', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820016');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920016');
  const orderId = await placeOrder(setup, buyer, product.id, 3);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 10);

  const result = await setup.orders.confirmOrder(sellerOrg(setup), orderId);
  assert.equal(result.outcome, 'applied');
  assert.equal(result.order.status, 'confirmed');
  assert.equal(result.stockDelta, 3);
  assert.equal(result.inventory?.onHand, 7);
  const moves = fixture.rows<{ type: string; delta: number; balance_after: number }>(
    `SELECT type, delta, balance_after FROM sotuvchi_inventory_moves
     WHERE type = 'order_confirmed'`,
  );
  assert.deepEqual(plain(moves), [{
    type: 'order_confirmed',
    delta: -3,
    balance_after: 7,
  }]);
});

test('a repeated confirm never decrements a second time', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820017');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920017');
  const orderId = await placeOrder(setup, buyer, product.id, 2);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 5);

  const org = sellerOrg(setup, requestId('confirm-once'));
  await setup.orders.confirmOrder(org, orderId);
  const replay = await setup.orders.confirmOrder(org, orderId);
  const fresh = await setup.orders.confirmOrder(sellerOrg(setup), orderId);
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(fresh.outcome, 'unchanged');
  assert.equal(fresh.order.status, 'confirmed');
  assert.equal(fixture.value('SELECT on_hand FROM sotuvchi_inventory'), 3);
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_inventory_moves WHERE type='order_confirmed'`,
    ),
    1,
  );
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_notifications WHERE type='order_confirmed'`,
    ),
    1,
  );
});

test('insufficient stock refuses the confirm and writes nothing', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820018');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920018');
  const orderId = await placeOrder(setup, buyer, product.id, 4);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 3);
  await assert.rejects(
    () => setup.orders.confirmOrder(sellerOrg(setup), orderId),
    InventoryInsufficientError,
  );
  assert.equal(fixture.value('SELECT on_hand FROM sotuvchi_inventory'), 3);
  assert.equal(
    fixture.value(
      'SELECT fulfillment_status FROM sotuvchi_orders WHERE id = ?',
      orderId,
    ),
    'none',
  );
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_notifications WHERE type='order_confirmed'`,
    ),
    0,
  );
});

test('an available product without a balance fails closed on confirm', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820019');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920019');
  const orderId = await placeOrder(setup, buyer, product.id);
  await assert.rejects(
    () => setup.orders.confirmOrder(sellerOrg(setup), orderId),
    InventoryNotConfiguredError,
  );
  assert.equal(
    fixture.value(
      'SELECT fulfillment_status FROM sotuvchi_orders WHERE id = ?',
      orderId,
    ),
    'none',
  );
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_inventory_moves'),
    0,
  );
});

test('a product turned unavailable cannot be confirmed', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820020');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920020');
  const orderId = await placeOrder(setup, buyer, product.id);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 10);
  const current = await setup.catalog.getProduct(
    nextOwner(setup.owner),
    product.id,
  );
  await setup.catalog.updateProduct(
    nextOwner(setup.owner),
    product.id,
    current.version,
    { availability: 'unavailable' },
  );
  await assert.rejects(
    () => setup.orders.confirmOrder(sellerOrg(setup), orderId),
    SellerOrdersStateError,
  );
  assert.equal(fixture.value('SELECT on_hand FROM sotuvchi_inventory'), 10);
});

test('preorder confirms without touching inventory', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820021');
  const product = await publish(setup, {
    name: 'Preorder Phone',
    availability: 'preorder',
  });
  const buyer = await bindBuyer(fixture, setup, '920021');
  const orderId = await placeOrder(setup, buyer, product.id, 5);
  const result = await setup.orders.confirmOrder(sellerOrg(setup), orderId);
  assert.equal(result.order.status, 'confirmed');
  assert.equal(result.stockDelta, 0);
  assert.equal(result.inventory, null);
  assert.equal(result.order.availability, 'preorder');
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_inventory_moves'),
    0,
  );
});

// ── Cancel and done ────────────────────────────────────────────────────────

test('cancelling a placed order leaves inventory untouched', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820022');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920022');
  const orderId = await placeOrder(setup, buyer, product.id);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 8);
  const result = await setup.orders.cancelOrder(sellerOrg(setup), orderId);
  assert.equal(result.order.status, 'cancelled');
  assert.equal(result.stockDelta, 0);
  assert.equal(fixture.value('SELECT on_hand FROM sotuvchi_inventory'), 8);
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_inventory_moves'),
    1,
  );
});

test('a confirmed order can never be cancelled', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820023');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920023');
  const orderId = await placeOrder(setup, buyer, product.id);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 8);
  await setup.orders.confirmOrder(sellerOrg(setup), orderId);
  await assert.rejects(
    () => setup.orders.cancelOrder(sellerOrg(setup), orderId),
    SellerOrdersStateError,
  );
  assert.equal(
    fixture.value(
      'SELECT status FROM sotuvchi_orders WHERE id = ?',
      orderId,
    ),
    'placed',
  );
  assert.equal(fixture.value('SELECT on_hand FROM sotuvchi_inventory'), 6);
});

test('done is reachable only from confirmed', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820024');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920024');
  const orderId = await placeOrder(setup, buyer, product.id);
  await assert.rejects(
    () => setup.orders.completeOrder(sellerOrg(setup), orderId),
    SellerOrdersStateError,
  );
  await setup.orders.setInventory(sellerOrg(setup), product.id, 8);
  await setup.orders.confirmOrder(sellerOrg(setup), orderId);
  const done = await setup.orders.completeOrder(sellerOrg(setup), orderId);
  assert.equal(done.order.status, 'done');
  const repeated = await setup.orders.completeOrder(sellerOrg(setup), orderId);
  assert.equal(repeated.outcome, 'unchanged');
  await assert.rejects(
    () => setup.orders.confirmOrder(sellerOrg(setup), orderId),
    SellerOrdersStateError,
  );
});

test('a cancelled order stays terminal', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820025');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920025');
  const orderId = await placeOrder(setup, buyer, product.id);
  await setup.orders.cancelOrder(sellerOrg(setup), orderId);
  for (const call of [
    () => setup.orders.confirmOrder(sellerOrg(setup), orderId),
    () => setup.orders.completeOrder(sellerOrg(setup), orderId),
  ]) {
    await assert.rejects(call, SellerOrdersStateError);
  }
  const repeated = await setup.orders.cancelOrder(sellerOrg(setup), orderId);
  assert.equal(repeated.outcome, 'unchanged');
});

// ── Notification outbox ────────────────────────────────────────────────────

test('placement records exactly one durable seller intent', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820026');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920026');
  const orderId = await placeOrder(setup, buyer, product.id);
  const rows = fixture.rows<{
    audience: string;
    type: string;
    status: string;
    order_id: string;
    attempt_count: number;
  }>(
    `SELECT audience, type, status, order_id, attempt_count
     FROM sotuvchi_notifications`,
  );
  assert.deepEqual(plain(rows), [{
    audience: 'seller',
    type: 'order_placed',
    status: 'pending',
    order_id: orderId,
    attempt_count: 0,
  }]);
});

test('every seller transition records one buyer intent without PII', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820027');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920027');
  const orderId = await placeOrder(setup, buyer, product.id);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 9);
  await setup.orders.confirmOrder(sellerOrg(setup), orderId);
  await setup.orders.completeOrder(sellerOrg(setup), orderId);
  const rows = fixture.rows<{ audience: string; type: string }>(
    'SELECT audience, type FROM sotuvchi_notifications ORDER BY created_at, id',
  );
  assert.deepEqual(plain(rows), [
    { audience: 'seller', type: 'order_placed' },
    { audience: 'buyer', type: 'order_confirmed' },
    { audience: 'buyer', type: 'order_done' },
  ]);
  const dump = JSON.stringify(
    fixture.rows('SELECT * FROM sotuvchi_notifications'),
  );
  for (const secret of ['Дилшод', '998901234567', 'Чилонзор', 'Alpha']) {
    assert.ok(!dump.includes(secret), secret);
  }
});

test('notification delivery is at-least-once and independent of the order', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820028');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920028');
  const orderId = await placeOrder(setup, buyer, product.id);
  const pending = await setup.orders.listPendingNotifications(
    setup.owner.orgId,
    setup.owner.storeId,
  );
  assert.equal(pending.length, 1);
  const intent = pending[0];
  assert.ok(await setup.orders.claimNotification(
    intent.orgId,
    intent.storeId,
    intent.id,
  ));
  assert.equal(
    await setup.orders.claimNotification(
      intent.orgId,
      intent.storeId,
      intent.id,
    ),
    false,
  );
  assert.ok(await setup.orders.settleNotification(
    intent.orgId,
    intent.storeId,
    intent.id,
    'failed',
  ));
  assert.equal(
    fixture.value('SELECT status FROM sotuvchi_notifications'),
    'failed',
  );
  // A failed delivery never rolls back the domain state.
  assert.equal(
    fixture.value('SELECT status FROM sotuvchi_orders WHERE id = ?', orderId),
    'placed',
  );
  const rendered = await setup.orders.readNotificationOrder(
    intent.orgId,
    intent.storeId,
    intent.orderId,
  );
  assert.equal(rendered.orderId, orderId);
});

// ── Facts, grounding and rendering ─────────────────────────────────────────

test('seller notification is grounded, actionable and rebuilt from the order', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '8200281');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '9200281');
  const comment = 'Позвонить перед встречей';
  const orderId = await placeOrder(setup, buyer, product.id, 2, comment);
  const intent = (
    await setup.orders.listPendingNotifications(
      setup.owner.orgId,
      setup.owner.storeId,
    )
  )[0];
  assert.ok(intent);
  const order = await setup.orders.readNotificationOrder(
    intent.orgId,
    intent.storeId,
    intent.orderId,
  );
  const facts = {
    toolName: 'seller.notification',
    values: projectNotificationFacts(intent.type, order, 'ru'),
  };
  const response = composeSellerOrdersResponse(facts, 'ru');
  assert.deepEqual(groundResponse(response, [facts]), { status: 'passed' });
  const rendered = JSON.stringify(response);
  for (const required of [
    order.orderNumber,
    product.name,
    comment,
    `seller-order-confirm.${orderId}`,
    `seller-order-cancel.${orderId}`,
    `seller-order-contact.${orderId}`,
    'seller-handoffs',
    `seller-order-view.${orderId}`,
    'UTC',
  ]) {
    assert.ok(rendered.includes(required), required);
  }
  assert.ok(!rendered.includes(setup.owner.orgId));
  assert.ok(!rendered.includes(setup.owner.storeId));
  assert.ok(
    !JSON.stringify(
      fixture.rows('SELECT * FROM sotuvchi_notifications'),
    ).includes(comment),
  );
});

test('seller messages pass strict grounding in RU and UZ', async () => {
  const fixture = new SqliteD1();
  for (const locale of ['ru', 'uz'] as const) {
    const setup = await setupStore(
      fixture,
      locale === 'ru' ? '820029' : '820030',
      locale,
    );
    const product = await publish(setup, {
      name: locale === 'ru' ? 'Alpha Phone' : 'Samsung Sinov',
    });
    const buyer = await bindBuyer(
      fixture,
      setup,
      locale === 'ru' ? '920029' : '920030',
    );
    const orderId = await placeOrder(setup, buyer, product.id);
    await setup.orders.setInventory(sellerOrg(setup), product.id, 12);

    const listFacts = {
      toolName: 'seller.orders.list',
      values: projectSellerOrdersFacts(
        await setup.orders.listOrders(sellerOrg(setup)),
        locale,
      ),
    };
    assert.deepEqual(
      groundResponse(composeSellerOrdersResponse(listFacts, locale), [listFacts]),
      { status: 'passed' },
    );

    const detailFacts = {
      toolName: 'seller.order.get',
      values: projectSellerOrderFacts(
        await setup.orders.getOrder(sellerOrg(setup), orderId),
        locale,
      ),
    };
    assert.deepEqual(
      groundResponse(
        composeSellerOrdersResponse(detailFacts, locale),
        [detailFacts],
      ),
      { status: 'passed' },
    );

    const transitionFacts = {
      toolName: 'seller.order.confirm',
      values: projectSellerTransitionFacts(
        await setup.orders.confirmOrder(sellerOrg(setup), orderId),
        locale,
      ),
    };
    const transition = composeSellerOrdersResponse(transitionFacts, locale);
    assert.deepEqual(
      groundResponse(transition, [transitionFacts]),
      { status: 'passed' },
    );
    assert.ok(transition.messages[0].text.length > 0);

    const inventoryFacts = {
      toolName: 'seller.inventory.get',
      values: projectSellerInventoryFacts(
        await setup.orders.listInventory(sellerOrg(setup)),
      ),
    };
    assert.deepEqual(
      groundResponse(
        composeSellerOrdersResponse(inventoryFacts, locale),
        [inventoryFacts],
      ),
      { status: 'passed' },
    );
  }
});

test('unsupported seller numbers are rejected by grounding', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820031');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920031');
  await placeOrder(setup, buyer, product.id);
  const facts = {
    toolName: 'seller.orders.list',
    values: projectSellerOrdersFacts(
      await setup.orders.listOrders(sellerOrg(setup)),
      'ru',
    ),
  };
  const tampered = {
    messages: [{ text: 'Остаток: 4242' }],
    claims: [],
  };
  assert.deepEqual(groundResponse(tampered, [facts]), {
    status: 'failed',
    reasonCode: 'unsupported_number',
  });
  const unsupportedClaim = {
    messages: [{ text: 'ok' }],
    claims: [{ key: 'seller.orders.0.number', value: 'S-ZZZZZZ' }],
  };
  assert.deepEqual(groundResponse(unsupportedClaim, [facts]), {
    status: 'failed',
    reasonCode: 'unsupported_claim',
  });
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

test('Telegram RU seller confirms and completes a placed order', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '830001');
  const product = await publish(setup, { name: 'Alpha Phone' });
  const buyer = await bindBuyer(fixture, setup, '930001');
  const orderId = await placeOrder(setup, buyer, product.id, 2);
  const harness = telegramHarness(fixture);

  await harness.invoke(telegramMessage(
    990_001,
    830001,
    `Остаток: ${product.id} | 6`,
    'ru',
  ));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Остаток обновлён'));

  await harness.invoke(telegramMessage(990_002, 830001, 'Заказы', 'ru'));
  const list = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(list.includes('Заказы магазина'));
  assert.ok(list.includes('Новый'));
  assert.ok(!list.includes('Дилшод'));

  await harness.invoke(telegramCallback(
    990_003,
    830001,
    `seller-order.${orderId}`,
    'ru',
  ));
  const detail = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(detail.includes('Дилшод'));
  assert.ok(detail.includes('+998901234567'));
  assert.ok(detail.includes('Чилонзор'));

  await harness.invoke(telegramCallback(
    990_004,
    830001,
    `seller-order-confirm.${orderId}`,
    'ru',
  ));
  const confirmed = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(confirmed.includes('Подтверждён'));
  assert.ok(confirmed.includes('Списано: 2'));
  assert.equal(fixture.value('SELECT on_hand FROM sotuvchi_inventory'), 4);

  await harness.invoke(telegramCallback(
    990_005,
    830001,
    `seller-order-done.${orderId}`,
    'ru',
  ));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Выполнен'));
  assert.equal(
    fixture.value(
      'SELECT fulfillment_status FROM sotuvchi_orders WHERE id = ?',
      orderId,
    ),
    'done',
  );
  const rendered = JSON.stringify(harness.delivery.sent);
  assert.ok(!/Оплатить|Payme|Click|корзин/i.test(rendered));
});

test('Telegram UZ seller flow and duplicate updates stay single-effect', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '830002', 'uz');
  const product = await publish(setup, { name: 'Samsung Sinov' });
  const buyer = await bindBuyer(fixture, setup, '930002');
  const orderId = await placeOrder(setup, buyer, product.id, 2);
  const harness = telegramHarness(fixture);

  await harness.invoke(telegramMessage(
    991_001,
    830002,
    `Qoldiq: ${product.id} | 5`,
    'uz',
  ));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Qoldiq yangilandi'));

  await harness.invoke(telegramMessage(991_002, 830002, 'Buyurtmalar', 'uz'));
  assert.ok(
    harness.delivery.sent.at(-1)?.text.includes('Do‘kon buyurtmalari'),
  );

  const confirm = telegramCallback(
    991_003,
    830002,
    `seller-order-confirm.${orderId}`,
    'uz',
  );
  await harness.invoke(confirm);
  const afterConfirm = harness.delivery.sent.length;
  const duplicate = await harness.invoke(confirm);
  assert.equal(await duplicate.text(), 'duplicate');
  assert.equal(harness.delivery.sent.length, afterConfirm);
  assert.equal(fixture.value('SELECT on_hand FROM sotuvchi_inventory'), 3);
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_inventory_moves WHERE type='order_confirmed'`,
    ),
    1,
  );
});

// ── Scope boundaries ───────────────────────────────────────────────────────

test('P2.5 adds seller tools without payment or multi-item surface', () => {
  const names = sotuvchiAgentManifest.tools.map((tool) => tool.name);
  for (const expected of [
    'seller.orders.list',
    'seller.order.get',
    'seller.order.confirm',
    'seller.order.cancel',
    'seller.order.done',
    'seller.inventory.get',
    'seller.inventory.set',
  ]) {
    assert.ok(names.includes(expected), expected);
  }
  assert.ok(!names.some((name) => /payment|refund|cart/i.test(name)));
  assert.equal(sotuvchiAgentManifest.policies.aiSelection, 'disabled');
  const priorities = (sotuvchiAgentManifest.deterministicRules ?? [])
    .map((rule) => rule.priority);
  assert.equal(new Set(priorities).size, priorities.length);
});

test('an order still carries exactly one item after the seller flow', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '820032');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '920032');
  const orderId = await placeOrder(setup, buyer, product.id);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 4);
  await setup.orders.confirmOrder(sellerOrg(setup), orderId);
  assert.equal(
    fixture.value(
      'SELECT COUNT(*) FROM sotuvchi_order_items WHERE order_id = ?',
      orderId,
    ),
    1,
  );
  await assert.rejects(
    () => setup.orders.confirmOrder(
      sellerOrg(setup),
      'o-doesnotexist000000',
    ),
    SellerOrdersNotFoundError,
  );
  await assert.rejects(
    () => setup.orders.getOrder(sellerOrg(setup), 'not a valid id'),
    SellerOrdersValidationError,
  );
});

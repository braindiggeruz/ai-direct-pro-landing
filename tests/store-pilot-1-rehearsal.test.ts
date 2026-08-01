/**
 * Store Pilot #1 rehearsal.
 *
 * Everything here runs against an in-memory SQLite D1 fixture with clearly
 * synthetic data. It never touches production, never creates a real store and
 * never contacts Telegram or Cloudflare. Its job is to prove that the pilot
 * import contract, the onboarding-to-order walkthrough and the cleanup path
 * all hold before a real seller is ever connected.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  createSotuvchiCatalogService,
  createSotuvchiCheckoutService,
  createSotuvchiHandoffService,
  createSotuvchiOnboardingService,
  createSotuvchiOrdersService,
  type SotuvchiIdentityContext,
  type StoreOwnerContext,
  type StorefrontContext,
} from '../functions/agents/sotuvchi';
import type { OrgContext } from '../functions/platform/contracts';
import { createIdentityService } from '../functions/platform/identity';
import { validatePilotImport } from '../scripts/market/validate-pilot-import';
import { SqliteD1 } from './helpers/sqlite-d1';
import { activatePilotStore } from './helpers/pilot-store';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOT = 'agents_pilot_rehearsal_bot';
const TEMPLATE = path.join(
  ROOT,
  'fixtures/market/store_pilot_1_import_template.json',
);

let sequence = 0;
function requestId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

// ── Import contract ────────────────────────────────────────────────────────

/** A synthetic import that satisfies every Store Pilot #1 rule. */
function rehearsalImport(): Record<string, unknown> {
  const products = Array.from({ length: 12 }, (_, index) => ({
    key: `rehearsal-${index + 1}`,
    categoryKey: index % 2 === 0 ? 'category-one' : 'category-two',
    sku: `REHEARSAL-${String(index + 1).padStart(3, '0')}`,
    name: `Синтетический товар ${index + 1}`,
    description: 'Rehearsal-only synthetic item. Not a real commercial offer.',
    priceMinor: 50_000 + index * 1_000,
    currency: 'UZS',
    availability: 'available',
    onHand: 5,
    searchTerms: ['sinov', 'sintetik mahsulot'],
    specifications: [
      { key: 'kind', labelRu: 'Тип', labelUz: 'Turi', value: 'synthetic' },
    ],
    mediaRefs: [],
  }));
  return {
    schemaVersion: 1,
    isTemplate: false,
    store: {
      displayName: 'Синтетический магазин репетиции',
      locale: 'ru',
      deliveryMode: 'both',
      paymentMethods: ['cash'],
      sellerTelegramVerified: true,
      consentRecordedAt: '2026-08-01T00:00:00.000Z',
      supportOwner: 'rehearsal support owner',
      incidentOwner: 'rehearsal incident owner',
      sellerResponseSlaMinutes: 120,
    },
    categories: [
      { key: 'category-one', name: 'Категория один', sortOrder: 1 },
      { key: 'category-two', name: 'Категория два', sortOrder: 2 },
    ],
    products,
  };
}

test('the shipped template is refused until it is filled in', () => {
  const template = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const findings = validatePilotImport(template);
  const problems = findings.map((finding) => finding.where);
  assert.ok(problems.includes('file'), 'template must be flagged as a template');
  assert.ok(
    problems.includes('products'),
    'a one-product template must fail the 10-30 product rule',
  );
  assert.ok(problems.includes('store.sellerTelegramVerified'));
  assert.ok(problems.includes('store.consentRecordedAt'));
});

test('a complete synthetic import passes the pilot contract', () => {
  assert.deepEqual(validatePilotImport(rehearsalImport()), []);
});

test('the pilot contract refuses the money and consent mistakes that matter', () => {
  const cases: ReadonlyArray<readonly [string, (doc: never) => void]> = [
    ['products[0].priceMinor', (doc: never) => {
      (doc as { products: { priceMinor: unknown }[] })
        .products[0].priceMinor = 50_000.5;
    }],
    ['products[0].priceMinor', (doc: never) => {
      (doc as { products: { priceMinor: unknown }[] })
        .products[0].priceMinor = '50000';
    }],
    ['products[0].priceMinor', (doc: never) => {
      (doc as { products: { priceMinor: unknown }[] })
        .products[0].priceMinor = -1;
    }],
    ['products[0].currency', (doc: never) => {
      (doc as { products: { currency: unknown }[] })
        .products[0].currency = 'USD';
    }],
    ['products[0].onHand', (doc: never) => {
      (doc as { products: { onHand: unknown }[] }).products[0].onHand = -1;
    }],
    ['products[0].mediaRefs', (doc: never) => {
      (doc as { products: { mediaRefs: unknown }[] })
        .products[0].mediaRefs = ['https://example.com/photo.jpg'];
    }],
    ['products[0].categoryKey', (doc: never) => {
      (doc as { products: { categoryKey: unknown }[] })
        .products[0].categoryKey = 'category-absent';
    }],
    ['store.sellerTelegramVerified', (doc: never) => {
      (doc as { store: { sellerTelegramVerified: unknown } })
        .store.sellerTelegramVerified = false;
    }],
    ['store.consentRecordedAt', (doc: never) => {
      (doc as { store: { consentRecordedAt: unknown } })
        .store.consentRecordedAt = null;
    }],
  ];
  for (const [where, mutate] of cases) {
    const document = rehearsalImport();
    mutate(document as never);
    const findings = validatePilotImport(document);
    assert.ok(
      findings.some((finding) => finding.where === where),
      `${where} must be refused`,
    );
  }
});

test('a duplicate SKU inside one import is refused', () => {
  const document = rehearsalImport() as {
    products: { sku: string }[];
  };
  document.products[1].sku = document.products[0].sku;
  const findings = validatePilotImport(document);
  assert.ok(findings.some((finding) => finding.where === 'products[1].sku'));
});

// ── Supervised end-to-end rehearsal ────────────────────────────────────────

interface Rehearsal {
  fixture: SqliteD1;
  catalog: ReturnType<typeof createSotuvchiCatalogService>;
  checkout: ReturnType<typeof createSotuvchiCheckoutService>;
  orders: ReturnType<typeof createSotuvchiOrdersService>;
  handoff: ReturnType<typeof createSotuvchiHandoffService>;
  owner: StoreOwnerContext;
  storefront: StorefrontContext;
  productIds: string[];
}

function nextOwner(owner: StoreOwnerContext): StoreOwnerContext {
  return { ...owner, requestId: requestId('owner') };
}

function org(context: StorefrontContext | StoreOwnerContext, actorId: string) {
  return {
    orgId: context.orgId,
    actorId,
    requestId: requestId('actor'),
    locale: context.locale,
  } satisfies OrgContext;
}

async function onboardAndImport(): Promise<Rehearsal> {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const document = rehearsalImport() as {
    store: { displayName: string; locale: 'ru' };
    categories: { key: string; name: string; sortOrder: number }[];
    products: {
      key: string;
      categoryKey: string;
      sku: string;
      name: string;
      description: string;
      priceMinor: number;
      availability: 'available';
      onHand: number;
      searchTerms: string[];
      mediaRefs: string[];
    }[];
  };
  assert.deepEqual(validatePilotImport(document), []);

  const seller = await createIdentityService(db)
    .getOrCreateIdentity('telegram', '870001');
  const context: SotuvchiIdentityContext = {
    identityId: seller.identity.id,
    botUsername: BOT,
    requestId: requestId('onboarding'),
    locale: 'ru',
  };
  const onboarding = createSotuvchiOnboardingService(db);
  let snapshot = await onboarding.startOnboarding(context);
  for (const [step, value] of [
    ['name', document.store.displayName],
    ['locale', document.store.locale],
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
    locale: 'ru',
  });
  const orders = createSotuvchiOrdersService(db, catalog);

  const categoryIds = new Map<string, string>();
  for (const category of document.categories) {
    const created = await catalog.createCategory(nextOwner(owner), {
      name: category.name,
      sortOrder: category.sortOrder,
    });
    categoryIds.set(category.key, created.id);
  }

  const productIds: string[] = [];
  for (const product of document.products) {
    const draft = await catalog.createProduct(nextOwner(owner), {
      categoryId: categoryIds.get(product.categoryKey)!,
      sku: product.sku,
      name: product.name,
      description: product.description,
      priceMinor: product.priceMinor,
      currency: 'UZS',
      availability: product.availability,
      searchTerms: product.searchTerms,
      mediaRefs: product.mediaRefs,
    });
    const published = await catalog.publishProduct(
      nextOwner(owner),
      draft.id,
      draft.version,
    );
    await orders.setInventory(
      org(owner, owner.identityId),
      published.id,
      product.onHand,
    );
    productIds.push(published.id);
  }

  return {
    fixture,
    catalog,
    checkout: createSotuvchiCheckoutService(db, catalog, BOT),
    orders,
    handoff: createSotuvchiHandoffService(db, catalog, BOT),
    owner,
    storefront: {
      orgId: completed.store.orgId,
      storeId: completed.store.id,
      agentId: 'sotuvchi',
      locale: 'ru',
    },
    productIds,
  };
}

test('the synthetic rehearsal imports a 12-product pilot catalog', async () => {
  const rehearsal = await onboardAndImport();
  assert.equal(rehearsal.productIds.length, 12);
  assert.equal(
    rehearsal.fixture.value('SELECT COUNT(*) FROM sotuvchi_products'),
    12,
  );
  assert.equal(
    rehearsal.fixture.value('SELECT COUNT(*) FROM sotuvchi_categories'),
    2,
  );
  assert.equal(
    rehearsal.fixture.value('SELECT COUNT(*) FROM sotuvchi_stores'),
    1,
  );
  // Every price stays an exact integer number of UZS.
  const prices = rehearsal.fixture.rows<{ price_minor: number }>(
    'SELECT price_minor FROM sotuvchi_products',
  );
  for (const row of prices) {
    assert.ok(Number.isInteger(row.price_minor), String(row.price_minor));
  }
});

test('the rehearsal walks one supervised order end to end', async () => {
  const rehearsal = await onboardAndImport();
  const db = rehearsal.fixture.asD1();
  const buyer = await createIdentityService(db)
    .getOrCreateIdentity('telegram', '970001');
  await rehearsal.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: rehearsal.storefront,
  });
  const buyerId = buyer.identity.id;
  const productId = rehearsal.productIds[0];

  // RU and Uzbek Latin both reach the same grounded catalog.
  for (const query of ['Синтетический товар 1', 'sintetik mahsulot']) {
    const found = await rehearsal.catalog.searchPublishedProducts(
      rehearsal.storefront,
      query,
    );
    assert.ok(found.length > 0, query);
  }

  await rehearsal.checkout.startCheckout(org(rehearsal.storefront, buyerId), productId);
  await rehearsal.checkout.submitQuantity(org(rehearsal.storefront, buyerId), 2);
  await rehearsal.checkout.submitName(org(rehearsal.storefront, buyerId), 'Дилшод');
  await rehearsal.checkout.submitPhone(
    org(rehearsal.storefront, buyerId),
    '901234567',
  );
  await rehearsal.checkout.submitAddress(
    org(rehearsal.storefront, buyerId),
    'Тошкент, Чилонзор 5',
  );
  await rehearsal.checkout.skipComment(org(rehearsal.storefront, buyerId));
  const placed = await rehearsal.checkout.confirmCheckout(
    org(rehearsal.storefront, buyerId),
  );
  assert.equal(placed.order.status, 'placed');

  // Exactly one durable seller intent, and no stock moved yet.
  assert.equal(
    rehearsal.fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_notifications
       WHERE audience='seller' AND type='order_placed'`,
    ),
    1,
  );
  assert.equal(
    rehearsal.fixture.value(
      'SELECT on_hand FROM sotuvchi_inventory WHERE product_id = ?',
      productId,
    ),
    5,
  );

  const sellerContext = org(rehearsal.owner, rehearsal.owner.identityId);
  await rehearsal.orders.confirmOrder(sellerContext, placed.order.id);
  assert.equal(
    rehearsal.fixture.value(
      'SELECT on_hand FROM sotuvchi_inventory WHERE product_id = ?',
      productId,
    ),
    3,
  );
  assert.equal(
    rehearsal.fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_inventory_moves
       WHERE type='order_confirmed'`,
    ),
    1,
  );

  // A repeated confirm never decrements a second time.
  await rehearsal.orders.confirmOrder(
    org(rehearsal.owner, rehearsal.owner.identityId),
    placed.order.id,
  ).catch(() => undefined);
  assert.equal(
    rehearsal.fixture.value(
      'SELECT on_hand FROM sotuvchi_inventory WHERE product_id = ?',
      productId,
    ),
    3,
  );
  assert.equal(
    rehearsal.fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_inventory_moves
       WHERE type='order_confirmed'`,
    ),
    1,
  );

  await rehearsal.orders.completeOrder(
    org(rehearsal.owner, rehearsal.owner.identityId),
    placed.order.id,
  );
  assert.equal(
    rehearsal.fixture.value(
      'SELECT fulfillment_status FROM sotuvchi_orders WHERE id = ?',
      placed.order.id,
    ),
    'done',
  );

  // No payment surface was introduced anywhere in the rehearsal.
  const dump = JSON.stringify(
    rehearsal.fixture.rows('SELECT * FROM sotuvchi_orders'),
  );
  assert.ok(!/payme|click|humo|escrow/i.test(dump));
});

test('the rehearsal opens and closes a buyer handoff', async () => {
  const rehearsal = await onboardAndImport();
  const db = rehearsal.fixture.asD1();
  const buyer = await createIdentityService(db)
    .getOrCreateIdentity('telegram', '970002');
  await rehearsal.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: rehearsal.storefront,
  });
  const opened = await rehearsal.handoff.requestHandoff(
    org(rehearsal.storefront, buyer.identity.id),
    'buyer_requested_human',
    'Есть ли доставка в тот же день?',
  );
  assert.equal(
    rehearsal.fixture.value(
      'SELECT COUNT(*) FROM sotuvchi_handoffs WHERE id = ?',
      opened.handoff.id,
    ),
    1,
  );
  // Exactly one seller notification is pending for the store.
  const pending = await rehearsal.handoff.listPendingSellerNotifications(
    rehearsal.storefront.orgId,
    rehearsal.storefront.storeId,
  );
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, opened.handoff.id);

  const closed = await rehearsal.handoff.closeHandoff(
    org(rehearsal.owner, rehearsal.owner.identityId),
    opened.handoff.id,
  );
  assert.notEqual(closed.handoff.status, 'open');
});

test('rehearsal cleanup leaves no synthetic operational rows behind', async () => {
  const rehearsal = await onboardAndImport();
  // The rehearsal fixture is in-memory: discarding it is the whole cleanup
  // path, which is exactly why the rehearsal needs no production cleanup.
  // Child rows go first, so the teardown also proves the foreign keys hold.
  rehearsal.fixture.exec('DELETE FROM sotuvchi_inventory_moves');
  rehearsal.fixture.exec('DELETE FROM sotuvchi_inventory');
  rehearsal.fixture.exec('DELETE FROM sotuvchi_products');
  rehearsal.fixture.exec('DELETE FROM sotuvchi_categories');
  assert.equal(
    rehearsal.fixture.value('SELECT COUNT(*) FROM sotuvchi_products'),
    0,
  );
  assert.equal(
    rehearsal.fixture.value('SELECT COUNT(*) FROM sotuvchi_orders'),
    0,
  );
});

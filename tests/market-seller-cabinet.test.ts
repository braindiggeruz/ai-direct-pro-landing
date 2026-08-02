import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createSotuvchiCatalogService,
  createSotuvchiCheckoutService,
  createSotuvchiOnboardingService,
  createSotuvchiOrdersService,
  encodeSellerOrderCursor,
  requireCatalogOwnerLimit,
  requireSellerOrderCursor,
  requireSellerStatusFilter,
  SELLER_ORDER_LIMITS,
  type CatalogProduct,
  type SotuvchiCatalogService,
  type SotuvchiCheckoutService,
  type SotuvchiIdentityContext,
  type SotuvchiOrdersService,
  type StoreOwnerContext,
  type StorefrontContext,
} from '../functions/agents/sotuvchi';
import {
  MARKET_UPLOAD_MAX_BYTES,
  MarketUploadError,
  isStoredMediaReference,
  mediaObjectKey,
  newMediaReference,
  readImageUpload,
  sniffImageType,
  storedMediaResponse,
} from '../functions/platform/market';
import type { Locale, OrgContext } from '../functions/platform/contracts';
import { createIdentityService } from '../functions/platform/identity';
import { SqliteD1 } from './helpers/sqlite-d1';
import { activatePilotStore } from './helpers/pilot-store';

const ROOT = new URL('../', import.meta.url);
const BOT = 'agents_cabinet_fixture_bot';
let sequence = 0;

function requestId(prefix = 'cabinet'): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

interface StoreFixture {
  catalog: SotuvchiCatalogService;
  checkout: SotuvchiCheckoutService;
  orders: SotuvchiOrdersService;
  owner: StoreOwnerContext;
  storefront: StorefrontContext;
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
    ['name', 'Тестовый магазин'],
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
  };
}

function nextOwner(owner: StoreOwnerContext): StoreOwnerContext {
  return { ...owner, requestId: requestId('owner') };
}

async function publish(
  setup: StoreFixture,
  name: string,
): Promise<CatalogProduct> {
  const draft = await setup.catalog.createProduct(nextOwner(setup.owner), {
    name,
    description: 'Sinov mahsuloti',
    priceMinor: 125_000,
    currency: 'UZS',
    availability: 'available',
    mediaRefs: [],
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

function buyerOrg(setup: StoreFixture, identityId: string): OrgContext {
  return {
    orgId: setup.storefront.orgId,
    actorId: identityId,
    requestId: requestId('buyer'),
    locale: setup.storefront.locale,
  };
}

function sellerOrg(setup: StoreFixture): OrgContext {
  return {
    orgId: setup.owner.orgId,
    actorId: setup.owner.identityId,
    requestId: requestId('seller'),
    locale: setup.owner.locale,
  };
}

async function placeOrder(
  setup: StoreFixture,
  identityId: string,
  productId: string,
): Promise<string> {
  await setup.checkout.startCheckout(buyerOrg(setup, identityId), productId);
  await setup.checkout.submitQuantity(buyerOrg(setup, identityId), 1);
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

// ── Queue depth ────────────────────────────────────────────────────────────

test('the seller queue is no longer capped at five orders', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '910001');
  const product = await publish(setup, 'Alpha Phone');
  await setup.orders.setInventory(sellerOrg(setup), product.id, 100);
  for (let index = 0; index < 8; index += 1) {
    const buyer = await bindBuyer(fixture, setup, `9100${20 + index}`);
    await placeOrder(setup, buyer, product.id);
  }
  const page = await setup.orders.listOrderPage(sellerOrg(setup), { limit: 8 });
  assert.equal(page.items.length, 8);
  assert.equal(page.nextCursor, null);
  // The legacy array reader keeps its own default, so existing callers and the
  // bot flow are untouched by the cabinet's larger page.
  assert.equal((await setup.orders.listOrders(sellerOrg(setup))).length, 5);
});

test('a page ceiling above the domain limit is refused', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '910100');
  await assert.rejects(() => setup.orders.listOrderPage(sellerOrg(setup), {
    limit: SELLER_ORDER_LIMITS.listLimit + 1,
  }));
  await assert.rejects(() => setup.orders.listOrderPage(sellerOrg(setup), {
    limit: 0,
  }));
});

// ── Keyset pagination ──────────────────────────────────────────────────────

test('paging the queue repeats no order and skips none', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '910200');
  const product = await publish(setup, 'Beta Phone');
  await setup.orders.setInventory(sellerOrg(setup), product.id, 100);
  const placed: string[] = [];
  for (let index = 0; index < 7; index += 1) {
    const buyer = await bindBuyer(fixture, setup, `9102${20 + index}`);
    placed.push(await placeOrder(setup, buyer, product.id));
  }

  const seen: string[] = [];
  let cursor: string | null | undefined;
  let guard = 0;
  do {
    const page = await setup.orders.listOrderPage(sellerOrg(setup), {
      limit: 3,
      ...(cursor ? { cursor } : {}),
    });
    seen.push(...page.items.map((order) => order.orderId));
    cursor = page.nextCursor;
    guard += 1;
    assert.ok(guard < 10, 'pagination did not terminate');
  } while (cursor);

  assert.equal(seen.length, placed.length);
  assert.equal(new Set(seen).size, placed.length);
  assert.deepEqual([...seen].sort(), [...placed].sort());
});

test('a cursor is opaque and a malformed one is refused, never widened', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '910300');
  const encoded = encodeSellerOrderCursor({
    placedAt: '2026-08-02T10:00:00.000Z',
    orderId: 'order-abc',
  });
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(encoded, /order-abc/);
  assert.deepEqual(requireSellerOrderCursor(encoded), {
    placedAt: '2026-08-02T10:00:00.000Z',
    orderId: 'order-abc',
  });
  assert.equal(requireSellerOrderCursor(undefined), null);
  assert.equal(requireSellerOrderCursor(''), null);
  for (const invalid of [
    'not-base64!!',
    Buffer.from('{"p":"nope","i":"order-abc"}').toString('base64url'),
    Buffer.from('{"p":"2026-08-02T10:00:00.000Z"}').toString('base64url'),
    Buffer.from('{"p":"2026-08-02T10:00:00.000Z","i":"../other"}').toString('base64url'),
    Buffer.from('{"p":"2026-08-02T10:00:00.000Z","i":"a","x":1}').toString('base64url'),
    42,
  ]) {
    assert.throws(() => requireSellerOrderCursor(invalid), `accepted ${String(invalid)}`);
  }
  await assert.rejects(() => setup.orders.listOrderPage(sellerOrg(setup), {
    cursor: 'not-a-cursor!',
  }));
});

// ── Status filter ──────────────────────────────────────────────────────────

test('filtering by status reads the stored pair, not the derived name', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '910400');
  const product = await publish(setup, 'Gamma Phone');
  await setup.orders.setInventory(sellerOrg(setup), product.id, 100);
  const first = await placeOrder(
    setup,
    await bindBuyer(fixture, setup, '910420'),
    product.id,
  );
  const second = await placeOrder(
    setup,
    await bindBuyer(fixture, setup, '910421'),
    product.id,
  );
  await setup.orders.confirmOrder(sellerOrg(setup), first);

  const placedOnly = await setup.orders.listOrderPage(sellerOrg(setup), {
    status: 'placed',
  });
  assert.deepEqual(placedOnly.items.map((order) => order.orderId), [second]);

  const confirmedOnly = await setup.orders.listOrderPage(sellerOrg(setup), {
    status: 'confirmed',
  });
  assert.deepEqual(confirmedOnly.items.map((order) => order.orderId), [first]);
  assert.ok(confirmedOnly.items.every((order) => order.status === 'confirmed'));

  assert.equal(
    (await setup.orders.listOrderPage(sellerOrg(setup), { status: 'done' }))
      .items.length,
    0,
  );
  assert.equal(requireSellerStatusFilter(undefined), null);
  assert.equal(requireSellerStatusFilter(''), null);
  assert.throws(() => requireSellerStatusFilter('everything'));
});

test('one store never pages into another store queue', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '910500');
  const second = await setupStore(fixture, '910600');
  const product = await publish(first, 'Delta Phone');
  await first.orders.setInventory(sellerOrg(first), product.id, 10);
  await placeOrder(first, await bindBuyer(fixture, first, '910520'), product.id);

  const foreign = await first.orders.listOrderPage(sellerOrg(first), { limit: 1 });
  assert.equal(foreign.items.length, 1);
  const leaked = await second.orders.listOrderPage(sellerOrg(second), {
    limit: 10,
    ...(foreign.nextCursor ? { cursor: foreign.nextCursor } : {}),
  });
  assert.deepEqual(leaked.items, []);
});

// ── Catalog listing bound ──────────────────────────────────────────────────

test('the owner may list more of their own catalog than a shopper may rank', async () => {
  assert.equal(requireCatalogOwnerLimit(100), 100);
  assert.equal(requireCatalogOwnerLimit(undefined), 10);
  assert.throws(() => requireCatalogOwnerLimit(101));
  assert.throws(() => requireCatalogOwnerLimit(0));
  assert.throws(() => requireCatalogOwnerLimit(1.5));
});

// ── Seller photo upload ────────────────────────────────────────────────────

function imageBody(signature: readonly number[], length = 32): ArrayBuffer {
  const bytes = new Uint8Array(length);
  bytes.set(signature, 0);
  return bytes.buffer;
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

test('an upload is trusted only after its own bytes say what it is', async () => {
  assert.equal(sniffImageType(imageBody(JPEG)), 'image/jpeg');
  assert.equal(sniffImageType(imageBody(PNG)), 'image/png');
  assert.equal(sniffImageType(imageBody(WEBP)), 'image/webp');
  // An HTML document renamed to .jpg, and a GIF: neither is accepted.
  assert.equal(sniffImageType(new TextEncoder().encode('<!doctype html><script>').buffer), null);
  assert.equal(sniffImageType(imageBody([0x47, 0x49, 0x46, 0x38])), null);
  assert.equal(sniffImageType(new Uint8Array(4).buffer), null);
});

test('a declared type that the bytes contradict is refused', async () => {
  const upload = await readImageUpload(new Request('https://x/', {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: imageBody(JPEG),
  }));
  assert.equal(upload.contentType, 'image/jpeg');

  // PNG bytes announced as JPEG: the pair has to agree, or the object would be
  // served back later with a type it does not have.
  await assert.rejects(
    () => readImageUpload(new Request('https://x/', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: imageBody(PNG),
    })),
    (error: unknown) => error instanceof MarketUploadError
      && error.code === 'invalid_image',
  );
  for (const type of ['text/html', 'application/octet-stream', '']) {
    await assert.rejects(
      () => readImageUpload(new Request('https://x/', {
        method: 'POST',
        headers: type ? { 'Content-Type': type } : {},
        body: imageBody(JPEG),
      })),
      (error: unknown) => error instanceof MarketUploadError
        && error.code === 'unsupported_media_type',
    );
  }
  await assert.rejects(
    () => readImageUpload(new Request('https://x/', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new ArrayBuffer(0),
    })),
    (error: unknown) => error instanceof MarketUploadError,
  );
});

test('an oversized photo is refused by measured size, not by a claimed one', async () => {
  const oversized = new Uint8Array(MARKET_UPLOAD_MAX_BYTES + 1);
  oversized.set(JPEG, 0);
  await assert.rejects(
    () => readImageUpload(new Request('https://x/', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: oversized.buffer,
    })),
    (error: unknown) => error instanceof MarketUploadError
      && error.code === 'payload_too_large',
  );
});

test('a stored media key always carries the org and the store', () => {
  const reference = newMediaReference();
  assert.match(reference, /^r2\.[a-z2-7]{16}$/);
  assert.ok(isStoredMediaReference(reference));
  assert.equal(
    mediaObjectKey('org-1', 'store-1', reference),
    `market/org-1/store-1/${reference.slice(3)}`,
  );
  // Two stores can never produce the same key for the same reference.
  assert.notEqual(
    mediaObjectKey('org-1', 'store-1', reference),
    mediaObjectKey('org-1', 'store-2', reference),
  );
  // Path traversal and injection in the ids cannot escape the prefix.
  for (const bad of ['../other', 'org/1', '', 'org 1']) {
    assert.equal(mediaObjectKey(bad, 'store-1', reference), null);
    assert.equal(mediaObjectKey('org-1', bad, reference), null);
  }
  // A Telegram file id is not a stored reference and never builds a key.
  const telegram = 'AgACAgIAAxkBAAIBY2Zk_abcDEF-123';
  assert.equal(isStoredMediaReference(telegram), false);
  assert.equal(mediaObjectKey('org-1', 'store-1', telegram), null);
  assert.equal(isStoredMediaReference('r2.SHORT'), false);
  assert.equal(isStoredMediaReference('r2.aaaaaaaaaaaaaaaaa'), false);
});

test('references are unguessable and do not repeat', () => {
  const seen = new Set(Array.from({ length: 500 }, () => newMediaReference()));
  assert.equal(seen.size, 500);
});

test('a stored image is served private, sandboxed and unindexable', () => {
  const response = storedMediaResponse(new ArrayBuffer(4), 'image/webp');
  assert.equal(response.headers.get('Content-Type'), 'image/webp');
  assert.equal(response.headers.get('Cache-Control'), 'private, max-age=300');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /sandbox/);
  // A type that was never proven degrades to a non-rendering one.
  assert.equal(
    storedMediaResponse(new ArrayBuffer(4), 'text/html').headers.get('Content-Type'),
    'application/octet-stream',
  );
});

test('a stored reference survives the catalog validator with no migration', async () => {
  const validation = await source('functions/agents/sotuvchi/catalog/validation.ts');
  const safe = /const SAFE_MEDIA_REF = (\/.*\/);/.exec(validation)?.[1];
  assert.ok(safe, 'media reference pattern not found');
  const [, body = '', flags = ''] = /^\/(.*)\/([a-z]*)$/.exec(safe) ?? [];
  const pattern = new RegExp(body, flags);
  assert.ok(pattern.test(newMediaReference()));
});

test('photo upload fails closed on both the switch and the binding', async () => {
  const router = await source('functions/market/router.ts');
  assert.match(
    router,
    /marketFlag\(env\.MARKET_SELLER_MEDIA_UPLOAD_ENABLED\)\s*&& Boolean\(env\.MARKET_MEDIA\)/,
  );
  assert.match(router, /mediaUploadAvailable\(env\)\)\s*\{\s*throw new MarketHttpError\('feature_disabled', 503\)/);
  // The client is told, so it hides the control instead of failing on tap.
  assert.match(router, /mediaUpload: context\.access\.sellerOrg !== null/);
  // The upload key is built from the session's own store, never from the body.
  assert.match(router, /mediaObjectKey\(\s*access\.sellerOrg!\.orgId,\s*access\.sellerStore!\.id,/);
  const wrangler = await source('wrangler.toml');
  assert.match(wrangler, /binding = "MARKET_MEDIA"/);
  assert.match(wrangler, /bucket_name = "bormi-market-media"/);
});

// ── Wiring the cabinet reads ───────────────────────────────────────────────

test('the cabinet home is composed from the same services its detail screens read', async () => {
  const router = await source('functions/market/router.ts');
  assert.match(router, /path === '\/seller\/overview'/);
  assert.match(router, /services\.orders\.listOrderPage\(access\.sellerOrg!, \{\s*limit: OVERVIEW_SCAN,\s*status: 'placed',/);
  assert.match(router, /truncated: scanned >= scan/);
  // The seller queue no longer clamps its own page. The buyer order list is a
  // different surface and keeps its own bound.
  const sellerOrders = /if \(path === '\/seller\/orders'\) \{[\s\S]*?\n {4}\}/.exec(router)?.[0];
  assert.ok(sellerOrders, 'seller order route not found');
  assert.doesNotMatch(sellerOrders, /Math\.min/);
  assert.match(sellerOrders, /nextCursor: page\.nextCursor/);
});

test('seller aliases and bilingual labels never ride on a buyer card', async () => {
  const router = await source('functions/market/router.ts');
  assert.match(router, /owner = false/);
  assert.match(router, /owner\s*\?\s*\{\s*owner: \{[\s\S]{0,400}?searchTerms: product\.searchTerms/);
  assert.match(router, /owner\s*\?\s*\{\s*owner: \{[\s\S]{0,400}?mediaRefs: product\.mediaRefs/);
  const buyerCalls = [...router.matchAll(/resultDtos\(/g)];
  assert.ok(buyerCalls.length > 0);
  // Every owner-flagged call sits under a /seller/ branch.
  const ownerCalls = [...router.matchAll(/context\.claims\.locale,\s*\n\s*true,/g)];
  assert.equal(ownerCalls.length, 5);
});

test('the cabinet keeps optimistic locking visible instead of silent', async () => {
  const seller = await source('apps/market-mini-app/src/screens/SellerApp.tsx');
  assert.match(seller, /error instanceof MarketApiError && error\.status === 409/);
  assert.match(seller, /function ConflictNotice/);
  assert.match(seller, /conflictReload/);
  // Every mutation that carries a version has to offer the re-read.
  for (const mutation of ['command', 'send', 'save', 'transition', 'stock']) {
    assert.match(
      seller,
      new RegExp(`${mutation}\\.reset\\(\\)|isConflict\\(${mutation}\\.error\\)`),
      `${mutation} has no conflict recovery`,
    );
  }
  assert.match(seller, /expectedVersion/);
});

test('the product editor can reach every field the catalog ranks on', async () => {
  const seller = await source('apps/market-mini-app/src/screens/SellerApp.tsx');
  assert.match(seller, /searchTerms: terms/);
  assert.match(seller, /specifications: rows/);
  assert.match(seller, /labelRu:.*trim\(\)/);
  assert.match(seller, /labelUz:.*trim\(\)/);
  assert.match(seller, /function specificationKey/);
  // The generated key has to satisfy the domain's own pattern.
  assert.match(seller, /replace\(\/\[\^a-z0-9\]\+\/g, '_'\)/);
});

test('cabinet copy exists in both languages with the project apostrophe', async () => {
  const i18n = await source('apps/market-mini-app/src/lib/i18n.ts');
  const [, ru = '', uz = ''] = new RegExp(
    'ru: \\{([\\s\\S]*?)\\r?\\n {2}\\},\\r?\\n {2}uz: \\{([\\s\\S]*?)\\r?\\n {2}\\},\\r?\\n\\} as const',
  ).exec(i18n) ?? [];
  assert.ok(ru && uz, 'copy blocks not found');
  const keys = (block: string) => new Set(
    [...block.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]),
  );
  const russian = keys(ru);
  const uzbek = keys(uz);
  for (const key of ['cabinetToday', 'attentionNewOrders', 'conflictTitle', 'productSearchTerms']) {
    assert.ok(russian.has(key), `ru is missing ${key}`);
    assert.ok(uzbek.has(key), `uz is missing ${key}`);
  }
  assert.deepEqual([...russian].filter((key) => !uzbek.has(key)), []);
  // U+2018 for o'/g', U+2019 for tutuq belgisi: the convention the rest of the
  // Uzbek copy already follows.
  assert.doesNotMatch(uz, /[a-z]'[a-z]/i);
});

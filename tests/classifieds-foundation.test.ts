import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  CatalogIdempotencyConflictError,
  ClassifiedsRateLimitError,
  createSotuvchiClassifiedsService,
} from '../functions/agents/sotuvchi';
import type { Env } from '../functions/_types';
import { handleMarketRequest } from '../functions/market/router';
import { issueMarketSession } from '../functions/platform/market';
import {
  CATEGORY,
  freshAdminDb,
  ORG,
  OWNER_IDENTITY,
  STORE,
} from './helpers/bormi-admin-fixture';
import type { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const NOW = '2026-08-04T00:00:00.000Z';
const ORIGIN = 'https://classifieds-unit.invalid';
const SESSION_SECRET = `classifieds-unit-${'x'.repeat(40)}`;

function marketEnv(db: SqliteD1, flags: Partial<Env> = {}): Env {
  return {
    MARKET_MINI_APP_ENABLED: 'true',
    MARKET_MINI_APP_ORIGINS: ORIGIN,
    MARKET_MINI_APP_SESSION_SECRET: SESSION_SECRET,
    TELEGRAM_AGENTS_BOT_TOKEN: 'unit-test-bot-token',
    TELEGRAM_AGENTS_BOT_USERNAME: 'BormiMarketBot',
    GPTBOT_DRAFTS_DB: db.asD1(),
    ...flags,
  } as Env;
}

async function marketToken(identityId: string): Promise<string> {
  return (await issueMarketSession(SESSION_SECRET, {
    sub: identityId,
    telegramId: '998000000001',
    locale: 'ru',
    launch: 'a'.repeat(32),
  })).token;
}

function marketRequest(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers);
  headers.set('Origin', ORIGIN);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new Request(`https://gptbot.uz/api/market/v1${path}`, {
    ...init,
    headers,
  });
}

function seedApprovedListing(
  db: SqliteD1,
  input: {
    id: string;
    sellerId: string;
    identityId: string;
    scope: 'private' | 'store';
    state?: 'approved' | 'rejected';
    updatedAt?: string;
    price?: number;
  },
): void {
  const store = input.scope === 'store';
  const state = input.state ?? 'approved';
  db.exec(`
    INSERT INTO identities(id, provider, external_id, created_at, updated_at)
    VALUES ('${input.identityId}', 'api', '${input.identityId}-external', '${NOW}', '${NOW}');
    INSERT INTO seller_profiles(
      id, identity_id, public_display_name, seller_type, verification_state,
      status, moderation_state, version, last_operation_key, created_at, updated_at
    ) VALUES (
      '${input.sellerId}', '${input.identityId}',
      '${store ? 'Synthetic Store Seller' : 'Synthetic Private Seller'}',
      '${input.scope}', '${store ? 'store_verified' : 'identity_verified'}',
      'active', 'clear', 1, 'seed-profile', '${NOW}', '${NOW}'
    );
    INSERT INTO sotuvchi_products(
      id, org_id, store_id, listing_scope, category_id, sku, name,
      normalized_name, description, price_minor, currency, availability,
      status, media_refs_json, search_terms_json, specifications_json, version,
      last_operation_key, created_at, updated_at
    ) VALUES (
      '${input.id}', ${store ? `'${ORG}'` : 'NULL'}, ${store ? `'${STORE}'` : 'NULL'},
      '${input.scope}', ${store ? `'${CATEGORY}'` : 'NULL'},
      ${store ? `'sku-${input.id}'` : 'NULL'}, 'Синтетический велосипед',
      'синтетический велосипед', 'Только fixture', ${input.price ?? 500000},
      'UZS', 'available', 'published', '["media-${input.id}"]',
      '["velosiped"]', '[]', 1, 'seed-product', '${NOW}',
      '${input.updatedAt ?? NOW}'
    );
    INSERT INTO listing_ownerships(
      product_id, seller_profile_id, ownership_type, org_id, store_id, status,
      version, last_operation_key, created_at, updated_at
    ) VALUES (
      '${input.id}', '${input.sellerId}', '${input.scope}',
      ${store ? `'${ORG}'` : 'NULL'}, ${store ? `'${STORE}'` : 'NULL'},
      'active', 1, 'seed-owner', '${NOW}', '${NOW}'
    );
    INSERT INTO market_listing_taxonomy(
      product_id, global_category_id, condition, version, last_operation_key,
      created_at, updated_at
    ) VALUES ('${input.id}', 'cat-sport-hobbies', 'good', 1,
      'seed-taxonomy', '${NOW}', '${NOW}');
    INSERT INTO market_listing_locations(
      product_id, country_code, region_id, district_id, locality_text,
      approximate_only, version, last_operation_key, created_at, updated_at
    ) VALUES ('${input.id}', 'UZ', 'uz-tashkent-city', 'uz-tashkent-uchtepa',
      NULL, 1, 1, 'seed-location', '${NOW}', '${NOW}');
    INSERT INTO market_listing_channels(
      product_id, listing_scope, contact_mode, phone_disclosure, commerce_mode,
      version, last_operation_key, created_at, updated_at
    ) VALUES ('${input.id}', '${input.scope}', 'in_app', 'not_available',
      '${store ? 'store_order' : 'inquiry'}', 1, 'seed-channel', '${NOW}', '${NOW}');
    INSERT INTO market_listing_moderation(
      product_id, state, reason_code, moderator_identity_id, decision_source,
      submitted_at, decided_at, version, last_operation_key, created_at, updated_at
    ) VALUES ('${input.id}', '${state}',
      ${state === 'approved' ? 'NULL' : "'other_policy'"}, '${OWNER_IDENTITY}',
      'moderator', '${NOW}', '${NOW}', 1, 'seed-moderation', '${NOW}', '${NOW}');
  `);
}

test('classifieds migration keeps one content record and bounded relation tables', () => {
  const ownership = readFileSync(
    path.join(ROOT, 'migrations/0034_classifieds_seller_ownership.sql'),
    'utf8',
  );
  const taxonomy = readFileSync(
    path.join(ROOT, 'migrations/0035_classifieds_global_taxonomy.sql'),
    'utf8',
  );
  assert.match(ownership, /ALTER TABLE sotuvchi_products_classifieds_new RENAME TO sotuvchi_products/);
  assert.doesNotMatch(ownership, /CREATE TABLE (?:classifieds_)?listings\b/i);
  assert.match(ownership, /listing_scope = 'private'.*org_id IS NULL.*store_id IS NULL/s);
  assert.match(ownership, /idx_listing_ownership_one_active[\s\S]*WHERE status = 'active'/);
  assert.match(taxonomy, /market_store_category_mappings/);
  assert.match(taxonomy, /name_ru TEXT NOT NULL/);
  assert.match(taxonomy, /name_uz TEXT NOT NULL/);
});

test('private seller submits one tenant-free pending listing atomically and replay is stable', async () => {
  const fixture = freshAdminDb();
  const service = createSotuvchiClassifiedsService(fixture.asD1(), {
    sellerProfileIdGenerator: () => 'seller_private_fixture',
    productIdGenerator: () => 'listing_private_fixture',
    auditEventIdGenerator: () => 'audit_private_fixture',
  });
  const profile = await service.createPrivateSellerProfile({
    identityId: OWNER_IDENTITY,
    requestId: 'request-profile',
    idempotencyKey: 'profile-create-key',
  }, 'Частный продавец');
  assert.deepEqual(profile, {
    id: 'seller_private_fixture',
    displayName: 'Частный продавец',
    sellerType: 'private',
    verificationState: 'unverified',
    status: 'active',
    moderationState: 'clear',
    version: 1,
  });

  const context = {
    identityId: OWNER_IDENTITY,
    requestId: 'request-submit',
    idempotencyKey: 'private-submit-key',
  };
  const input = {
    name: 'Велосипед городской',
    description: 'Использовался один сезон',
    priceMinor: 750000,
    currency: 'UZS' as const,
    mediaRefs: ['media-private-fixture'],
    globalCategoryId: 'cat-sport-hobbies',
    condition: 'good' as const,
    regionId: 'uz-tashkent-city',
    districtId: 'uz-tashkent-uchtepa',
    contactMode: 'in_app' as const,
  };
  const first = await service.submitPrivateListing(context, input);
  const replay = await service.submitPrivateListing(context, input);
  assert.deepEqual(replay, first);
  assert.deepEqual(first, {
    id: 'listing_private_fixture',
    listingScope: 'private',
    status: 'draft',
    moderationState: 'pending',
    version: 1,
    commerceMode: 'inquiry',
  });
  assert.equal(fixture.value(
    `SELECT COUNT(*) FROM sotuvchi_products
     WHERE id = 'listing_private_fixture' AND org_id IS NULL AND store_id IS NULL
       AND listing_scope = 'private' AND status = 'draft'`,
  ), 1);
  assert.equal(fixture.value('SELECT COUNT(*) FROM listing_ownerships'), 1);
  assert.equal(fixture.value('SELECT COUNT(*) FROM market_listing_operations'), 1);
  assert.equal(fixture.value('SELECT COUNT(*) FROM market_moderation_audit'), 1);
  assert.equal(fixture.value(
    `SELECT COUNT(*) FROM market_listing_channels
     WHERE product_id = 'listing_private_fixture' AND commerce_mode = 'inquiry'`,
  ), 1);
  await assert.rejects(
    service.submitPrivateListing(context, { ...input, priceMinor: 900000 }),
    CatalogIdempotencyConflictError,
  );
});

test('global discovery is approved/published only and supports private plus store commerce', async () => {
  const fixture = freshAdminDb();
  seedApprovedListing(fixture, {
    id: 'listing_private_visible',
    sellerId: 'seller_private_visible',
    identityId: 'identity_private_visible',
    scope: 'private',
    updatedAt: '2026-08-04T02:00:00.000Z',
  });
  seedApprovedListing(fixture, {
    id: 'listing_store_visible',
    sellerId: 'seller_store_visible',
    identityId: 'identity_store_visible',
    scope: 'store',
    updatedAt: '2026-08-04T01:00:00.000Z',
    price: 600000,
  });
  seedApprovedListing(fixture, {
    id: 'listing_rejected_hidden',
    sellerId: 'seller_rejected_hidden',
    identityId: 'identity_rejected_hidden',
    scope: 'private',
    state: 'rejected',
    updatedAt: '2026-08-04T03:00:00.000Z',
  });
  const service = createSotuvchiClassifiedsService(fixture.asD1());
  const page = await service.discover({ limit: 1 });
  assert.deepEqual(page.items.map((item) => item.id), ['listing_private_visible']);
  assert.ok(page.nextCursor);
  const second = await service.discover({ cursor: page.nextCursor!, limit: 10 });
  assert.deepEqual(second.items.map((item) => item.id), ['listing_store_visible']);
  const privateOnly = await service.discover({
    categoryId: 'cat-sport-hobbies',
    regionId: 'uz-tashkent-city',
    districtId: 'uz-tashkent-uchtepa',
    condition: 'good',
    sellerType: 'private',
    minPriceMinor: 400000,
    maxPriceMinor: 800000,
    query: 'велосипед',
  });
  assert.deepEqual(privateOnly.items.map((item) => item.id), ['listing_private_visible']);
  assert.equal(privateOnly.items[0].commerceMode, 'inquiry');
  assert.equal(privateOnly.items[0].store, null);
  const storeOnly = await service.discover({ sellerType: 'store', storeId: STORE });
  assert.equal(storeOnly.items[0].commerceMode, 'store_order');
  assert.equal(storeOnly.items[0].store?.id, STORE);
  assert.doesNotMatch(JSON.stringify(page), /"identityId"|external|telegramId|\+998|reporter/i);
  assert.throws(() => fixture.exec(`
    INSERT INTO sotuvchi_inventory(
      org_id, store_id, product_id, on_hand, version, created_at, updated_at
    ) VALUES ('${ORG}', '${STORE}', 'listing_private_visible', 1, 1, '${NOW}', '${NOW}')
  `));

  const categories = await service.listCategories();
  const sport = categories.find((item) => item.id === 'cat-sport-hobbies');
  assert.equal(sport?.visibleListingCount, 2);
  const locations = await service.listLocations();
  assert.equal(locations.length, 12);
  assert.ok(locations.every((item) => item.countryCode === 'UZ'));
});

test('report submission is private, idempotent, bounded and persistently rate-limited', async () => {
  const fixture = freshAdminDb();
  seedApprovedListing(fixture, {
    id: 'listing_report_target',
    sellerId: 'seller_report_target',
    identityId: 'identity_report_target',
    scope: 'private',
  });
  fixture.exec(`
    INSERT INTO identities(id, provider, external_id, created_at, updated_at)
    VALUES ('identity_reporter', 'api', 'reporter-external', '${NOW}', '${NOW}')
  `);
  let sequence = 0;
  const service = createSotuvchiClassifiedsService(fixture.asD1(), {
    reportIdGenerator: () => `report_fixture_${++sequence}`,
    auditEventIdGenerator: () => `audit_report_fixture_${sequence}`,
  });
  const base = {
    identityId: 'identity_reporter',
    requestId: 'request-report-1',
    idempotencyKey: 'report-key-1',
    reporterSessionHash: 'a'.repeat(64),
  };
  const input = { reason: 'misleading_content' as const, note: 'Synthetic note' };
  const first = await service.submitListingReport(base, 'listing_report_target', input);
  assert.deepEqual(await service.submitListingReport(base, 'listing_report_target', input), first);
  assert.equal(fixture.value('SELECT COUNT(*) FROM market_listing_reports'), 1);
  assert.equal(fixture.value(
    `SELECT COUNT(*) FROM market_moderation_audit
     WHERE action = 'report.opened' AND actor_identity_id IS NULL`,
  ), 1);
  assert.equal(fixture.value(
    `SELECT COUNT(*) FROM market_moderation_audit
     WHERE reason_code LIKE '%Synthetic%' OR request_id LIKE '%Synthetic%'`,
  ), 0);
  await assert.rejects(
    service.submitListingReport(base, 'listing_report_target', {
      reason: 'suspected_fraud',
      note: 'Synthetic note',
    }),
    CatalogIdempotencyConflictError,
  );
  for (let index = 2; index <= 5; index += 1) {
    await service.submitListingReport({
      ...base,
      requestId: `request-report-${index}`,
      idempotencyKey: `report-key-${index}`,
    }, 'listing_report_target', { reason: 'other_policy' });
  }
  await assert.rejects(
    service.submitListingReport({
      ...base,
      requestId: 'request-report-6',
      idempotencyKey: 'report-key-6',
      reporterSessionHash: 'b'.repeat(64),
    }, 'listing_report_target', { reason: 'other_policy' }),
    ClassifiedsRateLimitError,
  );
  assert.throws(() => fixture.exec(`
    INSERT INTO market_listing_reports(
      id, product_id, reporter_identity_id, reporter_session_hash, reason_code,
      note, status, moderation_action, fingerprint, idempotency_key, version,
      created_at, updated_at
    ) VALUES (
      'report_direct_bypass', 'listing_report_target', 'identity_reporter',
      '${'c'.repeat(64)}', 'other_policy', NULL, 'open', 'none',
      '${'d'.repeat(64)}', 'report-direct-bypass', 1,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
  `), /classifieds_report_rate_limited/);
});

test('classifieds HTTP boundary is bearer-only, flag-closed and store-independent', async () => {
  const fixture = freshAdminDb();
  seedApprovedListing(fixture, {
    id: 'listing_http_visible',
    sellerId: 'seller_http_visible',
    identityId: 'identity_http_visible',
    scope: 'private',
  });
  const token = await marketToken('identity_http_visible');

  const unsigned = await handleMarketRequest({
    request: marketRequest('/classifieds/listings', null),
    env: marketEnv(fixture, { MARKET_CLASSIFIEDS_DISCOVERY_ENABLED: 'true' }),
  });
  assert.equal(unsigned.status, 401);

  const hidden = await handleMarketRequest({
    request: marketRequest('/classifieds/listings', token),
    env: marketEnv(fixture),
  });
  assert.equal(hidden.status, 404);

  // No buyer storefront flag, route or stored storefront session is present.
  // Global discovery must still work from the proven bearer alone.
  const visible = await handleMarketRequest({
    request: marketRequest('/classifieds/listings?limit=1', token),
    env: marketEnv(fixture, { MARKET_CLASSIFIEDS_DISCOVERY_ENABLED: 'true' }),
  });
  assert.equal(visible.status, 200);
  const payload = await visible.json() as {
    items: Array<Record<string, unknown>>;
    nextCursor: string | null;
  };
  assert.deepEqual(payload.items.map((item) => item.id), ['listing_http_visible']);
  assert.ok(Array.isArray(payload.items[0].mediaHandles));
  assert.equal(Object.hasOwn(payload.items[0], 'mediaCount'), false);
  assert.doesNotMatch(
    JSON.stringify(payload),
    /identity_http_visible|telegramId|external_id|reporter|phone_number/i,
  );
});

test('private classifieds HTTP boundary rejects client-supplied identity authority', async () => {
  const fixture = freshAdminDb();
  const token = await marketToken(OWNER_IDENTITY);
  const hidden = await handleMarketRequest({
    request: marketRequest('/classifieds/private/profile', token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'private-profile-hidden',
      },
      body: JSON.stringify({ displayName: 'Private seller' }),
    }),
    env: marketEnv(fixture),
  });
  assert.equal(hidden.status, 404);

  const rejected = await handleMarketRequest({
    request: marketRequest('/classifieds/private/profile', token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'private-profile-reject',
      },
      body: JSON.stringify({
        displayName: 'Private seller',
        identityId: 'identity_attacker_choice',
      }),
    }),
    env: marketEnv(fixture, { MARKET_PRIVATE_LISTING_ENABLED: 'true' }),
  });
  assert.equal(rejected.status, 400);
  assert.equal(fixture.value('SELECT COUNT(*) FROM seller_profiles'), 0);

  const created = await handleMarketRequest({
    request: marketRequest('/classifieds/private/profile', token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'private-profile-create',
      },
      body: JSON.stringify({ displayName: 'Private seller' }),
    }),
    env: marketEnv(fixture, { MARKET_PRIVATE_LISTING_ENABLED: 'true' }),
  });
  assert.equal(created.status, 201);
  assert.equal(fixture.value(
    'SELECT COUNT(*) FROM seller_profiles WHERE identity_id = ?',
    OWNER_IDENTITY,
  ), 1);
});

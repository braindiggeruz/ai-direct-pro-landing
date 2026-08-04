/**
 * The private seller's own lifecycle: list, edit, resubmit, unpublish,
 * republish, archive, and the seller half of an inquiry.
 *
 * The cross-identity cases are the point of this file. Every command resolves
 * its seller from the bearer token, so the tests that matter most are the ones
 * that hand identity B a listing id belonging to identity A and assert that it
 * is indistinguishable from a listing that never existed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CatalogIdempotencyConflictError,
  CatalogNotFoundError,
  CatalogStateError,
  CatalogVersionConflictError,
  createSotuvchiClassifiedsService,
} from '../functions/agents/sotuvchi';
import { sellerListingState } from '../functions/agents/sotuvchi/classifieds/seller';
import type { Env } from '../functions/_types';
import { handleMarketRequest } from '../functions/market/router';
import { issueMarketSession } from '../functions/platform/market';
import { freshAdminDb } from './helpers/bormi-admin-fixture';
import type { SqliteD1 } from './helpers/sqlite-d1';

const NOW = '2026-08-04T00:00:00.000Z';
const ORIGIN = 'https://classifieds-seller.invalid';
const SESSION_SECRET = `classifieds-seller-${'x'.repeat(40)}`;

const LISTING_INPUT = {
  name: 'Горный велосипед',
  description: 'Синтетическое объявление для теста',
  priceMinor: 1_500_000,
  currency: 'UZS' as const,
  mediaRefs: ['r2.fixture00000001'],
  globalCategoryId: 'cat-sport-hobbies',
  condition: 'good' as const,
  regionId: 'uz-tashkent-city',
  districtId: 'uz-tashkent-uchtepa',
  contactMode: 'in_app' as const,
};

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
    telegramId: '998000000002',
    locale: 'ru',
    launch: 'b'.repeat(32),
  })).token;
}

function marketRequest(path: string, token: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('Origin', ORIGIN);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new Request(`https://gptbot.uz/api/market/v1${path}`, { ...init, headers });
}

function seedIdentity(db: SqliteD1, identityId: string): void {
  db.exec(`
    INSERT INTO identities(id, provider, external_id, created_at, updated_at)
    VALUES ('${identityId}', 'api', '${identityId}-external', '${NOW}', '${NOW}');
  `);
}

let sequence = 0;

function serviceFor(db: SqliteD1) {
  return createSotuvchiClassifiedsService(db.asD1(), {
    sellerProfileIdGenerator: () => `seller-${(sequence += 1)}`,
    productIdGenerator: () => `listing-${(sequence += 1)}`,
    auditEventIdGenerator: () => `audit-${(sequence += 1)}`,
    inquiryIdGenerator: () => `inquiry-${(sequence += 1)}`,
  });
}

/** A private seller with one listing already through submission. */
async function seedSellerWithListing(db: SqliteD1, identityId: string) {
  seedIdentity(db, identityId);
  const service = serviceFor(db);
  await service.createPrivateSellerProfile({
    identityId, requestId: `req-${identityId}`, idempotencyKey: `profile-${identityId}`,
  }, 'Частный продавец');
  const listing = await service.submitPrivateListing({
    identityId, requestId: `req-submit-${identityId}`, idempotencyKey: `submit-${identityId}`,
  }, LISTING_INPUT);
  return { service, listingId: listing.id };
}

/** Approve a listing the way the moderator command does, so it reaches buyers. */
function approve(db: SqliteD1, listingId: string): void {
  db.exec(`
    UPDATE market_listing_moderation
      SET state = 'approved', decided_at = '${NOW}', decision_source = 'moderator'
      WHERE product_id = '${listingId}';
    UPDATE sotuvchi_products SET status = 'published' WHERE id = '${listingId}';
  `);
}

// ── State derivation ──────────────────────────────────────────────────────────

test('the seller state collapses two lifecycle columns without losing either', () => {
  assert.equal(sellerListingState('draft', null), 'draft');
  assert.equal(sellerListingState('draft', 'pending'), 'pending');
  assert.equal(sellerListingState('published', 'approved'), 'published');
  // The distinction the raw columns cannot express on their own: an approval
  // the seller took down is not the same as one still waiting for review.
  assert.equal(sellerListingState('draft', 'approved'), 'unpublished');
  assert.equal(sellerListingState('draft', 'rejected'), 'needs_changes');
  assert.equal(sellerListingState('published', 'restricted'), 'restricted');
  assert.equal(sellerListingState('published', 'removed'), 'removed');
  // Terminal, whatever the moderation verdict was.
  assert.equal(sellerListingState('archived', 'approved'), 'archived');
  assert.equal(sellerListingState('archived', 'pending'), 'archived');
});

// ── Profile ───────────────────────────────────────────────────────────────────

test('a seller profile is created once and replayed, never duplicated', async () => {
  const db = freshAdminDb();
  seedIdentity(db, 'identity_profile');
  const service = serviceFor(db);
  const context = {
    identityId: 'identity_profile', requestId: 'req-1', idempotencyKey: 'profile-key',
  };
  assert.equal(await service.getPrivateSellerProfile('identity_profile'), null);
  const created = await service.createPrivateSellerProfile(context, 'Азиза');
  const again = await service.createPrivateSellerProfile(
    { ...context, idempotencyKey: 'different-key' }, 'Другое имя',
  );
  assert.equal(again.id, created.id);
  // The second call returns the profile that exists rather than renaming it.
  assert.equal(again.displayName, 'Азиза');
  assert.equal(db.value('SELECT COUNT(*) FROM seller_profiles'), 1);
  const read = await service.getPrivateSellerProfile('identity_profile');
  assert.equal(read?.id, created.id);
  // Nothing in the profile projection can identify the person on Telegram.
  assert.equal(Object.hasOwn(read ?? {}, 'identityId'), false);
  assert.equal(JSON.stringify(read).includes('998000000'), false);
});

// ── My listings ───────────────────────────────────────────────────────────────

test('a seller sees their own listing in every state, buyers only the approved one', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_mine');

  const pending = await service.listMyListings('identity_mine');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].state, 'pending');
  assert.equal(pending[0].name, LISTING_INPUT.name);
  assert.deepEqual(pending[0].mediaRefs, LISTING_INPUT.mediaRefs);
  assert.equal(pending[0].inquiries.total, 0);
  // A pending listing is nobody's search result yet.
  assert.deepEqual((await service.discover({})).items, []);

  approve(db, listingId);
  const published = await service.listMyListings('identity_mine');
  assert.equal(published[0].state, 'published');
  const discovered = await service.discover({});
  assert.equal(discovered.items.length, 1);
  assert.equal(discovered.items[0].id, listingId);
});

test('no listing projection invents a counter it has no data for', async () => {
  const db = freshAdminDb();
  const { service } = await seedSellerWithListing(db, 'identity_counters');
  const [listing] = await service.listMyListings('identity_counters');
  // Inquiries are counted from real rows. Views are absent entirely rather
  // than reported as a plausible-looking number.
  assert.deepEqual(listing.inquiries, { total: 0, open: 0 });
  assert.equal(Object.hasOwn(listing, 'views'), false);
  assert.equal(Object.hasOwn(listing, 'viewCount'), false);
  assert.equal(Object.hasOwn(listing, 'impressions'), false);
});

// ── Cross-identity isolation ──────────────────────────────────────────────────

test('seller B cannot read, edit or move seller A listing', async () => {
  const db = freshAdminDb();
  const { listingId } = await seedSellerWithListing(db, 'identity_a');
  const { service: serviceB } = await seedSellerWithListing(db, 'identity_b');
  const contextB = {
    identityId: 'identity_b', requestId: 'req-idor', idempotencyKey: 'idor-key',
  };

  // A read of somebody else's listing is a 404, not a 403: a 403 would confirm
  // the id exists, which is itself the leak.
  await assert.rejects(
    serviceB.getMyListing('identity_b', listingId),
    CatalogNotFoundError,
  );
  await assert.rejects(
    serviceB.updatePrivateListing(contextB, listingId, LISTING_INPUT, 1),
    CatalogNotFoundError,
  );
  await assert.rejects(
    serviceB.archivePrivateListing(
      { ...contextB, idempotencyKey: 'idor-archive' }, listingId, 1,
    ),
    CatalogNotFoundError,
  );
  await assert.rejects(
    serviceB.unpublishPrivateListing(
      { ...contextB, idempotencyKey: 'idor-unpublish' }, listingId, 1,
    ),
    CatalogNotFoundError,
  );
  // And A's listing is untouched by any of it.
  assert.equal(db.value(`SELECT version FROM sotuvchi_products WHERE id = '${listingId}'`), 1);
  assert.equal(db.value(`SELECT status FROM sotuvchi_products WHERE id = '${listingId}'`), 'draft');
  // B's own list never contains A's listing.
  const mine = await serviceB.listMyListings('identity_b');
  assert.equal(mine.some((entry) => entry.id === listingId), false);
});

// ── Edit ──────────────────────────────────────────────────────────────────────

test('an edit takes the listing off the shelf and back to review', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_edit');
  approve(db, listingId);
  assert.equal((await service.discover({})).items.length, 1);

  const context = {
    identityId: 'identity_edit', requestId: 'req-edit', idempotencyKey: 'edit-key',
  };
  const edited = await service.updatePrivateListing(context, listingId, {
    ...LISTING_INPUT, name: 'Горный велосипед, размер L', priceMinor: 1_700_000,
  }, 1);
  assert.equal(edited.state, 'pending');
  assert.equal(edited.name, 'Горный велосипед, размер L');
  assert.equal(edited.priceMinor, 1_700_000);
  assert.equal(edited.version, 2);
  // The approval granted to the old text no longer publishes the new text.
  assert.deepEqual((await service.discover({})).items, []);

  // A retry of the same command returns the same listing rather than editing twice.
  const replay = await service.updatePrivateListing(context, listingId, {
    ...LISTING_INPUT, name: 'Горный велосипед, размер L', priceMinor: 1_700_000,
  }, 1);
  assert.equal(replay.version, 2);
  assert.equal(db.value(`SELECT version FROM sotuvchi_products WHERE id = '${listingId}'`), 2);

  // The same key with different content is a conflict, not a silent overwrite.
  await assert.rejects(
    service.updatePrivateListing(context, listingId, { ...LISTING_INPUT, priceMinor: 99 }, 2),
    CatalogIdempotencyConflictError,
  );
});

test('an edit against a stale version is refused and changes nothing', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_stale');
  await service.updatePrivateListing({
    identityId: 'identity_stale', requestId: 'req-1', idempotencyKey: 'edit-1',
  }, listingId, { ...LISTING_INPUT, name: 'Первая правка' }, 1);

  await assert.rejects(
    service.updatePrivateListing({
      identityId: 'identity_stale', requestId: 'req-2', idempotencyKey: 'edit-2',
    }, listingId, { ...LISTING_INPUT, name: 'Вторая правка' }, 1),
    CatalogVersionConflictError,
  );
  const [listing] = await service.listMyListings('identity_stale');
  assert.equal(listing.name, 'Первая правка');
  assert.equal(listing.version, 2);
});

test('the composer bounds are enforced on the server, not only in the form', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_bounds');
  const context = {
    identityId: 'identity_bounds', requestId: 'req-b', idempotencyKey: 'bounds-key',
  };
  for (const invalid of [
    { ...LISTING_INPUT, mediaRefs: [] },
    { ...LISTING_INPUT, mediaRefs: Array.from({ length: 6 }, (_, i) => `r2.fixture0000000${i}`) },
    { ...LISTING_INPUT, condition: 'pristine' as never },
    { ...LISTING_INPUT, contactMode: 'carrier_pigeon' as never },
    { ...LISTING_INPUT, districtId: 'uz-not-a-district' },
    { ...LISTING_INPUT, globalCategoryId: 'cat-does-not-exist' },
  ]) {
    await assert.rejects(service.updatePrivateListing(context, listingId, invalid, 1));
  }
  // Every rejection left the listing exactly as it was.
  assert.equal(db.value(`SELECT version FROM sotuvchi_products WHERE id = '${listingId}'`), 1);
});

// ── Transitions ───────────────────────────────────────────────────────────────

test('a rejected listing is resubmitted, not silently republished', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_reject');
  db.exec(`
    UPDATE market_listing_moderation
      SET state = 'rejected', reason_code = 'misleading_content',
        decided_at = '${NOW}', decision_source = 'moderator'
      WHERE product_id = '${listingId}';
  `);
  const [rejected] = await service.listMyListings('identity_reject');
  assert.equal(rejected.state, 'needs_changes');
  assert.equal(rejected.moderation?.reasonCode, 'misleading_content');

  const resubmitted = await service.resubmitPrivateListing({
    identityId: 'identity_reject', requestId: 'req-r', idempotencyKey: 'resubmit-key',
  }, listingId, rejected.version);
  assert.equal(resubmitted.state, 'pending');
  // Back in the queue, not on the shelf.
  assert.deepEqual((await service.discover({})).items, []);
  assert.equal(
    db.value(`SELECT COUNT(*) FROM market_moderation_audit
      WHERE product_id = '${listingId}' AND action = 'listing.submitted'`),
    2,
  );
});

test('unpublish removes the listing from discovery and republish returns it', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_shelf');
  approve(db, listingId);
  const [published] = await service.listMyListings('identity_shelf');
  assert.equal(published.state, 'published');

  const unpublished = await service.unpublishPrivateListing({
    identityId: 'identity_shelf', requestId: 'req-u', idempotencyKey: 'unpublish-key',
  }, listingId, published.version);
  assert.equal(unpublished.state, 'unpublished');
  assert.deepEqual((await service.discover({})).items, []);
  // The approval survived, so coming back does not need a second review.
  assert.equal(unpublished.moderation?.state, 'approved');

  const republished = await service.republishPrivateListing({
    identityId: 'identity_shelf', requestId: 'req-p', idempotencyKey: 'republish-key',
  }, listingId, unpublished.version);
  assert.equal(republished.state, 'published');
  assert.equal((await service.discover({})).items.length, 1);
});

test('archive is terminal and keeps the listing out of discovery', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_archive');
  approve(db, listingId);
  const [listing] = await service.listMyListings('identity_archive');
  const archived = await service.archivePrivateListing({
    identityId: 'identity_archive', requestId: 'req-a', idempotencyKey: 'archive-key',
  }, listingId, listing.version);
  assert.equal(archived.state, 'archived');
  assert.deepEqual((await service.discover({})).items, []);
  // Nothing brings it back.
  await assert.rejects(
    service.republishPrivateListing({
      identityId: 'identity_archive', requestId: 'req-a2', idempotencyKey: 'archive-undo',
    }, listingId, archived.version),
    CatalogStateError,
  );
});

test('a restricted seller keeps every read and loses every write', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_restricted');
  db.exec(`UPDATE seller_profiles SET status = 'restricted' WHERE identity_id = 'identity_restricted';`);

  // Their own listings stay visible to them — hiding these would read as loss.
  assert.equal((await service.listMyListings('identity_restricted')).length, 1);
  const context = {
    identityId: 'identity_restricted', requestId: 'req-x', idempotencyKey: 'restricted-key',
  };
  await assert.rejects(service.updatePrivateListing(context, listingId, LISTING_INPUT, 1));
  await assert.rejects(service.resubmitPrivateListing(context, listingId, 1));
  await assert.rejects(service.archivePrivateListing(context, listingId, 1));
  assert.equal(db.value(`SELECT version FROM sotuvchi_products WHERE id = '${listingId}'`), 1);
});

// ── Seller inquiries ──────────────────────────────────────────────────────────

test('a seller answers their own inquiry and the buyer sees the reply', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_seller_q');
  approve(db, listingId);
  seedIdentity(db, 'identity_buyer_q');

  const created = await service.createInquiry({
    identityId: 'identity_buyer_q', requestId: 'req-i', idempotencyKey: 'inquiry-key',
  }, listingId, { message: 'Ещё продаётся?' });
  assert.equal(created.status, 'open');

  const queue = await service.listSellerInquiries('identity_seller_q');
  assert.equal(queue.length, 1);
  assert.equal(queue[0].message, 'Ещё продаётся?');
  assert.equal(queue[0].reply, null);
  // The seller learns what was asked, never who asked it.
  assert.equal(Object.hasOwn(queue[0], 'buyerIdentityId'), false);
  assert.equal(JSON.stringify(queue[0]).includes('identity_buyer_q'), false);

  const answered = await service.replyToInquiry({
    identityId: 'identity_seller_q', requestId: 'req-rep', idempotencyKey: 'reply-key',
  }, queue[0].id, 'Да, продаётся.', queue[0].version);
  assert.equal(answered.status, 'answered');
  assert.equal(answered.reply, 'Да, продаётся.');

  const buyerView = await service.listBuyerInquiries('identity_buyer_q');
  assert.equal(buyerView[0].reply, 'Да, продаётся.');
  assert.equal(buyerView[0].status, 'answered');

  // The listing's own counters follow the real rows.
  const [listing] = await service.listMyListings('identity_seller_q');
  assert.deepEqual(listing.inquiries, { total: 1, open: 0 });
});

test('seller B cannot read or answer seller A inquiry, and a buyer has no queue', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_qa');
  approve(db, listingId);
  await seedSellerWithListing(db, 'identity_qb');
  seedIdentity(db, 'identity_qbuyer');
  const inquiry = await service.createInquiry({
    identityId: 'identity_qbuyer', requestId: 'req-q', idempotencyKey: 'q-key',
  }, listingId, { message: 'Можно посмотреть?' });

  await assert.rejects(
    service.getSellerInquiry('identity_qb', inquiry.id),
    CatalogNotFoundError,
  );
  await assert.rejects(
    service.replyToInquiry({
      identityId: 'identity_qb', requestId: 'req-q2', idempotencyKey: 'q-steal',
    }, inquiry.id, 'Ответ от чужого продавца', 1),
    CatalogNotFoundError,
  );
  assert.deepEqual(await service.listSellerInquiries('identity_qb'), []);
  // A buyer has no seller profile at all, so the queue is closed to them.
  await assert.rejects(service.listSellerInquiries('identity_qbuyer'));
  assert.equal(
    db.value(`SELECT reply_text FROM market_listing_inquiries WHERE id = '${inquiry.id}'`),
    null,
  );
});

test('a reply is idempotent and a closed inquiry stops accepting answers', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_close');
  approve(db, listingId);
  seedIdentity(db, 'identity_close_buyer');
  const inquiry = await service.createInquiry({
    identityId: 'identity_close_buyer', requestId: 'req-c', idempotencyKey: 'c-key',
  }, listingId, { message: 'Здравствуйте' });

  const context = {
    identityId: 'identity_close', requestId: 'req-c2', idempotencyKey: 'reply-once',
  };
  const first = await service.replyToInquiry(context, inquiry.id, 'Здравствуйте!', 1);
  const replay = await service.replyToInquiry(context, inquiry.id, 'Здравствуйте!', 1);
  assert.equal(replay.version, first.version);
  assert.equal(db.value(
    `SELECT version FROM market_listing_inquiries WHERE id = '${inquiry.id}'`,
  ), 2);

  const closed = await service.closeInquiry({
    identityId: 'identity_close', requestId: 'req-c3', idempotencyKey: 'close-once',
  }, inquiry.id, first.version);
  assert.equal(closed.status, 'closed');
  await assert.rejects(
    service.replyToInquiry({
      identityId: 'identity_close', requestId: 'req-c4', idempotencyKey: 'reply-after-close',
    }, inquiry.id, 'Ещё одно', closed.version),
    CatalogStateError,
  );
});

// ── HTTP surface ──────────────────────────────────────────────────────────────

test('the seller routes are closed without the flag, the bearer or the key', async () => {
  const db = freshAdminDb();
  await seedSellerWithListing(db, 'identity_http');
  const token = await marketToken('identity_http');
  const on = { MARKET_PRIVATE_LISTING_ENABLED: 'true' } as Partial<Env>;

  // Flag off: the route does not exist, rather than existing and refusing.
  assert.equal((await handleMarketRequest({
    request: marketRequest('/classifieds/private/listings', token),
    env: marketEnv(db),
  })).status, 404);

  // No bearer.
  assert.equal((await handleMarketRequest({
    request: marketRequest('/classifieds/private/listings', null),
    env: marketEnv(db, on),
  })).status, 401);

  const listed = await handleMarketRequest({
    request: marketRequest('/classifieds/private/listings', token),
    env: marketEnv(db, on),
  });
  assert.equal(listed.status, 200);
  assert.equal((await listed.json() as { items: unknown[] }).items.length, 1);

  // A command without an idempotency key is refused before it reaches the domain.
  const noKey = await handleMarketRequest({
    request: marketRequest('/classifieds/private/listings/listing-x/archive', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 1 }),
    }),
    env: marketEnv(db, on),
  });
  assert.equal(noKey.status, 400);
});

test('the client cannot name its own owner, status or version', async () => {
  const db = freshAdminDb();
  const { listingId } = await seedSellerWithListing(db, 'identity_shape');
  const token = await marketToken('identity_shape');
  const env = marketEnv(db, { MARKET_PRIVATE_LISTING_ENABLED: 'true' } as Partial<Env>);

  for (const body of [
    // A target status is not part of any command's vocabulary.
    { expectedVersion: 1, status: 'published' },
    // Neither is an owner.
    { expectedVersion: 1, sellerProfileId: 'seller-1' },
    { expectedVersion: 1, identityId: 'identity_other' },
    // And the version is required, not optional.
    {},
  ]) {
    const response = await handleMarketRequest({
      request: marketRequest(`/classifieds/private/listings/${listingId}/archive`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `k-${JSON.stringify(body).length}` },
        body: JSON.stringify(body),
      }),
      env,
    });
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(db.value(`SELECT status FROM sotuvchi_products WHERE id = '${listingId}'`), 'draft');
});

test('a cross-identity command over HTTP is a 404 and writes nothing', async () => {
  const db = freshAdminDb();
  const { listingId } = await seedSellerWithListing(db, 'identity_http_a');
  await seedSellerWithListing(db, 'identity_http_b');
  const tokenB = await marketToken('identity_http_b');
  const env = marketEnv(db, { MARKET_PRIVATE_LISTING_ENABLED: 'true' } as Partial<Env>);

  const read = await handleMarketRequest({
    request: marketRequest(`/classifieds/private/listings/${listingId}`, tokenB),
    env,
  });
  assert.equal(read.status, 404);

  const archive = await handleMarketRequest({
    request: marketRequest(`/classifieds/private/listings/${listingId}/archive`, tokenB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'cross-key' },
      body: JSON.stringify({ expectedVersion: 1 }),
    }),
    env,
  });
  assert.equal(archive.status, 404);
  assert.equal(db.value(`SELECT status FROM sotuvchi_products WHERE id = '${listingId}'`), 'draft');
  // The two submissions from the setup are the only operations recorded. The
  // refused command left no ledger row, so it cannot be replayed into one.
  assert.equal(db.value(`SELECT COUNT(*) FROM market_listing_operations`), 2);
  assert.equal(db.value(
    `SELECT COUNT(*) FROM market_listing_operations WHERE operation <> 'private.submit'`,
  ), 0);
});

test('a stale version over HTTP is a 409', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedSellerWithListing(db, 'identity_http_stale');
  await service.updatePrivateListing({
    identityId: 'identity_http_stale', requestId: 'r', idempotencyKey: 'bump',
  }, listingId, { ...LISTING_INPUT, name: 'Обновлённое имя' }, 1);
  const token = await marketToken('identity_http_stale');

  const response = await handleMarketRequest({
    request: marketRequest(`/classifieds/private/listings/${listingId}/archive`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'stale-key' },
      body: JSON.stringify({ expectedVersion: 1 }),
    }),
    env: marketEnv(db, { MARKET_PRIVATE_LISTING_ENABLED: 'true' } as Partial<Env>),
  });
  assert.equal(response.status, 409);
});

test('the lifecycle closes when its migration is missing', async () => {
  const db = freshAdminDb();
  await seedSellerWithListing(db, 'identity_schema');
  // Undo the one column migration 0040 adds. Discovery still works; the seller
  // lifecycle must refuse rather than fail inside a batch on a CHECK.
  db.exec(`
    DROP INDEX idx_market_listing_inquiries_close_key;
    ALTER TABLE market_listing_inquiries DROP COLUMN close_idempotency_key;
  `);
  const token = await marketToken('identity_schema');
  const response = await handleMarketRequest({
    request: marketRequest('/classifieds/private/listings', token),
    env: marketEnv(db, { MARKET_PRIVATE_LISTING_ENABLED: 'true' } as Partial<Env>),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: string }).error, 'feature_disabled');
});

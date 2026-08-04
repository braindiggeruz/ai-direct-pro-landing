/**
 * Admin moderation: the queue, the detail, the four listing decisions and the
 * two report resolutions.
 *
 * The decision tests assert the whole consequence, not just the response code —
 * an approval that returns 200 but leaves the listing invisible to buyers is
 * the failure this vertical exists to prevent.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSotuvchiClassifiedsService } from '../functions/agents/sotuvchi';
import { onRequestGet as queueRoute } from '../functions/api/admin/moderation/listings/index';
import { onRequestGet as detailRoute } from '../functions/api/admin/moderation/listings/[id]/index';
import {
  onRequestGet as decisionGet,
  onRequestPost as decisionRoute,
} from '../functions/api/admin/moderation/listings/[id]/decision';
import { onRequestGet as reportsRoute } from '../functions/api/admin/moderation/reports/index';
import { onRequestPost as resolutionRoute } from '../functions/api/admin/moderation/reports/[id]/resolution';
import { callRoute, freshAdminDb, platformToken } from './helpers/bormi-admin-fixture';
import type { SqliteD1 } from './helpers/sqlite-d1';

const NOW = '2026-08-04T00:00:00.000Z';

const LISTING_INPUT = {
  name: 'Горный велосипед',
  description: 'Синтетическое объявление',
  priceMinor: 1_500_000,
  currency: 'UZS' as const,
  mediaRefs: ['r2.fixture00000001'],
  globalCategoryId: 'cat-sport-hobbies',
  condition: 'good' as const,
  regionId: 'uz-tashkent-city',
  districtId: 'uz-tashkent-uchtepa',
  contactMode: 'in_app' as const,
};

let sequence = 0;

function serviceFor(db: SqliteD1) {
  return createSotuvchiClassifiedsService(db.asD1(), {
    sellerProfileIdGenerator: () => `mseller-${(sequence += 1)}`,
    productIdGenerator: () => `mlisting-${(sequence += 1)}`,
    auditEventIdGenerator: () => `maudit-${(sequence += 1)}`,
    reportIdGenerator: () => `mreport-${(sequence += 1)}`,
    inquiryIdGenerator: () => `minquiry-${(sequence += 1)}`,
  });
}

async function seedPending(db: SqliteD1, identityId = 'identity_mod') {
  db.exec(`
    INSERT INTO identities(id, provider, external_id, created_at, updated_at)
    VALUES ('${identityId}', 'api', '${identityId}-ext', '${NOW}', '${NOW}');
  `);
  const service = serviceFor(db);
  await service.createPrivateSellerProfile({
    identityId, requestId: 'req-p', idempotencyKey: `profile-${identityId}`,
  }, 'Частный продавец');
  const listing = await service.submitPrivateListing({
    identityId, requestId: 'req-s', idempotencyKey: `submit-${identityId}`,
  }, LISTING_INPUT);
  return { service, listingId: listing.id };
}

// ── Queue and detail ──────────────────────────────────────────────────────────

test('the pending queue is the default and support may read it', async () => {
  const db = freshAdminDb();
  const { listingId } = await seedPending(db);
  const support = await callRoute(queueRoute, db, '/api/admin/moderation/listings', {
    token: await platformToken('support_readonly'),
  });
  assert.equal(support.status, 200);
  assert.deepEqual(support.body.filters, { state: 'pending' });
  const listings = support.body.listings as Array<Record<string, unknown>>;
  assert.equal(listings.length, 1);
  assert.equal(listings[0].listing_id, listingId);
  assert.equal(listings[0].state, 'pending');
  assert.equal(listings[0].media_count, 1);
  assert.equal(listings[0].seller_display_name, 'Частный продавец');
  assert.equal((support.body.summary as Record<string, number>).pending, 1);
});

test('an unauthenticated or unknown-role caller reads nothing', async () => {
  const db = freshAdminDb();
  await seedPending(db);
  assert.equal((await callRoute(queueRoute, db, '/api/admin/moderation/listings')).status, 401);
  assert.equal((await callRoute(queueRoute, db, '/api/admin/moderation/listings', {
    token: await platformToken('seller'),
  })).status, 403);
});

test('the detail carries what a decision needs and nothing a reporter said', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedPending(db);
  db.exec(`
    INSERT INTO identities(id, provider, external_id, created_at, updated_at)
    VALUES ('identity_reporter', 'api', 'reporter-ext', '${NOW}', '${NOW}');
  `);
  // A report needs an approved listing to exist against, so approve first.
  db.exec(`
    UPDATE market_listing_moderation SET state = 'approved', decided_at = '${NOW}',
      decision_source = 'moderator' WHERE product_id = '${listingId}';
    UPDATE sotuvchi_products SET status = 'published' WHERE id = '${listingId}';
  `);
  await service.submitListingReport({
    identityId: 'identity_reporter', requestId: 'req-r', idempotencyKey: 'report-key',
    reporterSessionHash: 'a'.repeat(64),
  }, listingId, { reason: 'misleading_content', note: 'Секретная жалоба покупателя' });

  const detail = await callRoute(detailRoute, db, `/api/admin/moderation/listings/${listingId}`, {
    token: await platformToken('platform_owner'),
    params: { id: listingId },
  });
  assert.equal(detail.status, 200);
  const listing = detail.body.listing as Record<string, unknown>;
  assert.equal(listing.name, LISTING_INPUT.name);
  assert.equal(listing.description, LISTING_INPUT.description);
  assert.deepEqual(listing.media_refs, LISTING_INPUT.mediaRefs);
  assert.equal(listing.condition, 'good');
  assert.equal(listing.district_name_ru, 'Учтепинский район');
  assert.equal(listing.contact_mode, 'in_app');
  assert.equal((listing.history as unknown[]).length >= 1, true);
  assert.equal((listing.reports as unknown[]).length, 1);
  // The reporter's own words and identity stay out of the moderator's screen.
  const serialized = JSON.stringify(detail.body);
  assert.equal(serialized.includes('Секретная жалоба'), false);
  assert.equal(serialized.includes('identity_reporter'), false);
  assert.equal(serialized.includes('a'.repeat(64)), false);
});

test('an unknown listing is a 404', async () => {
  const db = freshAdminDb();
  const detail = await callRoute(detailRoute, db, '/api/admin/moderation/listings/nope', {
    token: await platformToken('platform_owner'),
    params: { id: 'listing-does-not-exist' },
  });
  assert.equal(detail.status, 404);
});

// ── Decisions ─────────────────────────────────────────────────────────────────

test('approving publishes the listing and a buyer can then find it', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedPending(db);
  assert.deepEqual((await service.discover({})).items, []);

  const applied = await callRoute(
    decisionRoute, db, `/api/admin/moderation/listings/${listingId}/decision`,
    {
      method: 'POST',
      token: await platformToken('platform_owner'),
      params: { id: listingId },
      body: { decision: 'approve', idempotency_key: 'approve-1', expected_version: 1 },
    },
  );
  assert.equal(applied.status, 200);
  assert.equal(applied.body.outcome, 'applied');

  // The whole point: approval makes it discoverable.
  const discovered = await service.discover({});
  assert.equal(discovered.items.length, 1);
  assert.equal(discovered.items[0].id, listingId);
  // And the seller is told so in their own vocabulary.
  const [mine] = await service.listMyListings('identity_mod');
  assert.equal(mine.state, 'published');

  // Audit is written with the operator who decided it, in the same batch.
  assert.equal(db.value(
    `SELECT COUNT(*) FROM market_moderation_audit
     WHERE product_id = '${listingId}' AND action = 'listing.approved'
       AND actor_type = 'moderator' AND actor_email = 'owner@example.invalid'`,
  ), 1);
});

test('a decision is idempotent and a stale version is a 409', async () => {
  const db = freshAdminDb();
  const { listingId } = await seedPending(db);
  const token = await platformToken('platform_owner');
  const command = {
    method: 'POST',
    token,
    params: { id: listingId },
    body: { decision: 'approve', idempotency_key: 'approve-once', expected_version: 1 },
  };
  const first = await callRoute(
    decisionRoute, db, `/api/admin/moderation/listings/${listingId}/decision`, command,
  );
  const replay = await callRoute(
    decisionRoute, db, `/api/admin/moderation/listings/${listingId}/decision`, command,
  );
  assert.equal(first.body.outcome, 'applied');
  assert.equal(replay.body.outcome, 'duplicate');
  assert.equal(replay.body.audit_event_id, first.body.audit_event_id);
  assert.equal(db.value(
    `SELECT COUNT(*) FROM market_moderation_audit WHERE action = 'listing.approved'`,
  ), 1);

  // A second operator still looking at version 1 is refused.
  const stale = await callRoute(
    decisionRoute, db, `/api/admin/moderation/listings/${listingId}/decision`,
    {
      method: 'POST',
      token,
      params: { id: listingId },
      body: {
        decision: 'remove',
        reason_code: 'prohibited_item',
        idempotency_key: 'remove-stale',
        expected_version: 1,
      },
    },
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'moderation_version_conflict');
  assert.equal(db.value(`SELECT state FROM market_listing_moderation WHERE product_id = '${listingId}'`), 'approved');
});

test('rejecting needs a reason and hands the seller something to act on', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedPending(db);
  const token = await platformToken('platform_owner');

  const noReason = await callRoute(
    decisionRoute, db, `/api/admin/moderation/listings/${listingId}/decision`,
    {
      method: 'POST',
      token,
      params: { id: listingId },
      body: { decision: 'reject', idempotency_key: 'reject-1', expected_version: 1 },
    },
  );
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.error, 'invalid_reason_code');

  const rejected = await callRoute(
    decisionRoute, db, `/api/admin/moderation/listings/${listingId}/decision`,
    {
      method: 'POST',
      token,
      params: { id: listingId },
      body: {
        decision: 'reject',
        reason_code: 'misleading_content',
        note: 'Фотография не соответствует описанию',
        idempotency_key: 'reject-2',
        expected_version: 1,
      },
    },
  );
  assert.equal(rejected.status, 200);
  const [mine] = await service.listMyListings('identity_mod');
  assert.equal(mine.state, 'needs_changes');
  assert.equal(mine.moderation?.reasonCode, 'misleading_content');
  assert.deepEqual((await service.discover({})).items, []);
  // The internal note is not part of what the seller is handed.
  assert.equal(JSON.stringify(mine).includes('не соответствует'), false);
});

test('restrict and remove both take an approved listing out of discovery', async () => {
  for (const decision of ['restrict', 'remove'] as const) {
    const db = freshAdminDb();
    const { service, listingId } = await seedPending(db);
    const token = await platformToken('platform_owner');
    await callRoute(decisionRoute, db, `/api/admin/moderation/listings/${listingId}/decision`, {
      method: 'POST',
      token,
      params: { id: listingId },
      body: { decision: 'approve', idempotency_key: 'a', expected_version: 1 },
    });
    assert.equal((await service.discover({})).items.length, 1, decision);

    const applied = await callRoute(
      decisionRoute, db, `/api/admin/moderation/listings/${listingId}/decision`,
      {
        method: 'POST',
        token,
        params: { id: listingId },
        body: {
          decision,
          reason_code: 'prohibited_item',
          idempotency_key: 'b',
          expected_version: 2,
        },
      },
    );
    assert.equal(applied.status, 200, decision);
    assert.deepEqual((await service.discover({})).items, [], decision);
    const [mine] = await service.listMyListings('identity_mod');
    assert.equal(mine.state, decision === 'restrict' ? 'restricted' : 'removed');
  }
});

test('support may read the queue and change nothing in it', async () => {
  const db = freshAdminDb();
  const { listingId } = await seedPending(db);
  const support = await platformToken('support_readonly');
  assert.equal((await callRoute(queueRoute, db, '/api/admin/moderation/listings', {
    token: support,
  })).status, 200);
  const refused = await callRoute(
    decisionRoute, db, `/api/admin/moderation/listings/${listingId}/decision`,
    {
      method: 'POST',
      token: support,
      params: { id: listingId },
      body: { decision: 'approve', idempotency_key: 'support-try', expected_version: 1 },
    },
  );
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, 'insufficient_role');
  assert.equal(db.value(`SELECT state FROM market_listing_moderation WHERE product_id = '${listingId}'`), 'pending');
  assert.equal(db.value('SELECT COUNT(*) FROM market_moderation_audit WHERE actor_type = \'moderator\''), 0);
});

test('the command vocabulary is closed', async () => {
  const db = freshAdminDb();
  const { listingId } = await seedPending(db);
  const token = await platformToken('platform_owner');
  for (const body of [
    // Not one of the four decisions.
    { decision: 'publish', idempotency_key: 'k', expected_version: 1 },
    // A raw target state is not a decision.
    { decision: 'approve', state: 'approved', idempotency_key: 'k', expected_version: 1 },
    // An unknown reason code.
    { decision: 'reject', reason_code: 'because', idempotency_key: 'k', expected_version: 1 },
    // Version is required.
    { decision: 'approve', idempotency_key: 'k' },
    // And so is a key.
    { decision: 'approve', expected_version: 1 },
  ]) {
    const response = await callRoute(
      decisionRoute, db, `/api/admin/moderation/listings/${listingId}/decision`,
      { method: 'POST', token, params: { id: listingId }, body },
    );
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(db.value(`SELECT state FROM market_listing_moderation WHERE product_id = '${listingId}'`), 'pending');
});

test('the decision route refuses a GET rather than pretending to be missing', async () => {
  const db = freshAdminDb();
  const response = await callRoute(decisionGet, db, '/api/admin/moderation/listings/x/decision', {
    token: await platformToken('platform_owner'),
    params: { id: 'x' },
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});

// ── Reports ───────────────────────────────────────────────────────────────────

test('a report is listed without its reporter and resolved with an audit', async () => {
  const db = freshAdminDb();
  const { service, listingId } = await seedPending(db);
  db.exec(`
    INSERT INTO identities(id, provider, external_id, created_at, updated_at)
    VALUES ('identity_rep2', 'api', 'rep2-ext', '${NOW}', '${NOW}');
    UPDATE market_listing_moderation SET state = 'approved', decided_at = '${NOW}',
      decision_source = 'moderator' WHERE product_id = '${listingId}';
    UPDATE sotuvchi_products SET status = 'published' WHERE id = '${listingId}';
  `);
  const report = await service.submitListingReport({
    identityId: 'identity_rep2', requestId: 'req-r', idempotencyKey: 'rep-key',
    reporterSessionHash: 'b'.repeat(64),
  }, listingId, { reason: 'suspected_fraud', note: 'Приватная заметка' });

  const token = await platformToken('platform_owner');
  const queue = await callRoute(reportsRoute, db, '/api/admin/moderation/reports', { token });
  assert.equal(queue.status, 200);
  const reports = queue.body.reports as Array<Record<string, unknown>>;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reason_code, 'suspected_fraud');
  const serialized = JSON.stringify(queue.body);
  assert.equal(serialized.includes('Приватная заметка'), false);
  assert.equal(serialized.includes('identity_rep2'), false);

  const resolved = await callRoute(
    resolutionRoute, db, `/api/admin/moderation/reports/${report.id}/resolution`,
    {
      method: 'POST',
      token,
      params: { id: report.id },
      body: {
        resolution: 'resolve',
        reason_code: 'misleading_content',
        idempotency_key: 'resolve-1',
        expected_version: 1,
      },
    },
  );
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.outcome, 'applied');
  assert.equal(db.value(`SELECT status FROM market_listing_reports WHERE id = '${report.id}'`), 'resolved');
  assert.equal(db.value(
    `SELECT COUNT(*) FROM market_moderation_audit
     WHERE report_id = '${report.id}' AND action = 'report.resolved'
       AND actor_email = 'owner@example.invalid'`,
  ), 1);

  // Closing it twice is a duplicate, and closing it again after that is refused.
  const replay = await callRoute(
    resolutionRoute, db, `/api/admin/moderation/reports/${report.id}/resolution`,
    {
      method: 'POST',
      token,
      params: { id: report.id },
      body: {
        resolution: 'resolve',
        reason_code: 'misleading_content',
        idempotency_key: 'resolve-1',
        expected_version: 1,
      },
    },
  );
  assert.equal(replay.body.outcome, 'duplicate');
  const again = await callRoute(
    resolutionRoute, db, `/api/admin/moderation/reports/${report.id}/resolution`,
    {
      method: 'POST',
      token,
      params: { id: report.id },
      body: { resolution: 'dismiss', idempotency_key: 'dismiss-1', expected_version: 2 },
    },
  );
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'invalid_report_transition');
});

test('support cannot resolve a report', async () => {
  const db = freshAdminDb();
  const response = await callRoute(
    resolutionRoute, db, '/api/admin/moderation/reports/r/resolution',
    {
      method: 'POST',
      token: await platformToken('support_readonly'),
      params: { id: 'r' },
      body: { resolution: 'dismiss', idempotency_key: 'k', expected_version: 1 },
    },
  );
  assert.equal(response.status, 403);
});

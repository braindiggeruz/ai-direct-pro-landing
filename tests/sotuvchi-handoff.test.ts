import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTelegramAgentsRuntimeWiring } from '../functions/api/telegram/agents';
import {
  CatalogAuthorizationError,
  composeHandoffResponse,
  createSotuvchiCatalogService,
  createSotuvchiCheckoutService,
  createSotuvchiHandoffService,
  createSotuvchiNotificationDispatcher,
  createSotuvchiOnboardingService,
  createSotuvchiOrdersService,
  ensureSotuvchiHandoffSchema,
  HandoffExpiredError,
  HandoffIdempotencyConflictError,
  HandoffNotFoundError,
  HandoffReplyConflictError,
  HandoffStateError,
  HandoffValidationError,
  normalizeHandoffQuestion,
  normalizeHandoffReply,
  projectBuyerHandoffFacts,
  projectHandoffReplyFacts,
  projectSellerDetailFacts,
  projectSellerNoticeFacts,
  projectSellerQueueFacts,
  sotuvchiAgentManifest,
  sotuvchiSellerReplyWorkflow,
  type CatalogProduct,
  type SotuvchiCatalogService,
  type SotuvchiCheckoutService,
  type SotuvchiHandoffService,
  type SotuvchiIdentityContext,
  type SotuvchiOrdersService,
  type StoreOwnerContext,
  type StorefrontContext,
} from '../functions/agents/sotuvchi';
import {
  createTelegramAddressBinder,
  createTelegramAgentUpdateStore,
  createTelegramChannelDelivery,
  createTelegramIdentityPort,
  handleTelegramAgentsWebhook,
  type TelegramAgentsWebhookDependencies,
  type TelegramDeliveryPort,
} from '../functions/channels/telegram';
import {
  ChannelAddressValidationError,
  createChannelAddressBindingPort,
  createChannelAddressService,
  ensureChannelAddressSchema,
  type ChannelAddressService,
} from '../functions/platform/channels';
import type { Locale, OrgContext } from '../functions/platform/contracts';
import { createIdentityService } from '../functions/platform/identity';
import { groundResponse } from '../functions/platform/runtime';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOT = 'agents_handoff_fixture_bot';
const OTHER_BOT = 'agents_other_fixture_bot';
const SECRET = 'fixture-handoff-webhook-secret';
let sequence = 0;

function requestId(prefix = 'handoff'): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

interface StoreFixture {
  catalog: SotuvchiCatalogService;
  checkout: SotuvchiCheckoutService;
  orders: SotuvchiOrdersService;
  handoff: SotuvchiHandoffService;
  addresses: ChannelAddressService;
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
    handoff: createSotuvchiHandoffService(db, catalog, BOT),
    addresses: createChannelAddressService(db),
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

async function openHandoff(
  setup: StoreFixture,
  buyer: string,
  question = 'Позовите продавца, есть вопрос по доставке',
): Promise<string> {
  const snapshot = await setup.handoff.requestHandoff(
    buyerOrg(setup, buyer),
    'buyer_requested_human',
    question,
  );
  return snapshot.handoff.id;
}

async function bindAddress(
  setup: StoreFixture,
  identityId: string,
  threadRef: string,
  namespace = BOT,
): Promise<void> {
  await setup.addresses.bind({
    identityId,
    channel: 'telegram',
    namespace,
    threadRef,
  });
}

// ── Channel addresses ──────────────────────────────────────────────────────

test('channel addresses bind, update and revoke per bot namespace', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840001');
  const buyer = await bindBuyer(fixture, setup, '940001');
  await bindAddress(setup, buyer, '940001');
  await bindAddress(setup, setup.owner.identityId, '840001');

  const buyerAddress = await setup.addresses.find({
    identityId: buyer,
    channel: 'telegram',
    namespace: BOT,
  });
  assert.equal(buyerAddress?.threadRef, '940001');
  assert.equal(buyerAddress?.status, 'active');

  await bindAddress(setup, buyer, '940002');
  assert.equal(
    (await setup.addresses.find({
      identityId: buyer,
      channel: 'telegram',
      namespace: BOT,
    }))?.threadRef,
    '940002',
  );
  assert.equal(
    fixture.value(
      'SELECT COUNT(*) FROM channel_addresses WHERE identity_id = ?',
      buyer,
    ),
    1,
  );

  assert.ok(await setup.addresses.revoke({
    identityId: buyer,
    channel: 'telegram',
    namespace: BOT,
  }));
  assert.equal(
    await setup.addresses.find({
      identityId: buyer,
      channel: 'telegram',
      namespace: BOT,
    }),
    null,
  );
});

test('an address bound for one bot never resolves for another', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840002');
  const buyer = await bindBuyer(fixture, setup, '940002');
  await bindAddress(setup, buyer, '940002', BOT);
  assert.equal(
    await setup.addresses.find({
      identityId: buyer,
      channel: 'telegram',
      namespace: OTHER_BOT,
    }),
    null,
  );
  await bindAddress(setup, buyer, '111222', OTHER_BOT);
  assert.equal(
    (await setup.addresses.find({
      identityId: buyer,
      channel: 'telegram',
      namespace: OTHER_BOT,
    }))?.threadRef,
    '111222',
  );
  assert.equal(
    (await setup.addresses.find({
      identityId: buyer,
      channel: 'telegram',
      namespace: BOT,
    }))?.threadRef,
    '940002',
  );
});

test('the address table stores no raw update, profile or authority', async () => {
  const fixture = new SqliteD1();
  await ensureChannelAddressSchema(fixture.asD1());
  const columns = fixture.rows<{ name: string }>(
    'PRAGMA table_info(channel_addresses)',
  ).map((column) => column.name);
  assert.deepEqual(columns, [
    'id',
    'identity_id',
    'channel',
    'namespace',
    'thread_ref',
    'status',
    'created_at',
    'updated_at',
  ]);
  for (const forbidden of ['org_id', 'store_id', 'role', 'username', 'raw']) {
    assert.ok(!columns.includes(forbidden), forbidden);
  }
});

test('channel address input is bounded and validated', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840003');
  const buyer = await bindBuyer(fixture, setup, '940003');
  for (const invalid of [
    { identityId: '', channel: 'telegram', namespace: BOT, threadRef: '1' },
    { identityId: buyer, channel: 'TELEGRAM', namespace: BOT, threadRef: '1' },
    { identityId: buyer, channel: 'telegram', namespace: '', threadRef: '1' },
    { identityId: buyer, channel: 'telegram', namespace: BOT, threadRef: '' },
    {
      identityId: buyer,
      channel: 'telegram',
      namespace: BOT,
      threadRef: 'x'.repeat(65),
    },
  ]) {
    await assert.rejects(
      () => setup.addresses.bind(invalid),
      ChannelAddressValidationError,
    );
  }
});

// ── Validation and retention ───────────────────────────────────────────────

test('handoff content is bounded plain text in RU and UZ', () => {
  assert.equal(
    normalizeHandoffQuestion('  Есть   ли   доставка?  '),
    'Есть ли доставка?',
  );
  assert.equal(
    normalizeHandoffReply('Ha, yetkazib beramiz'),
    'Ha, yetkazib beramiz',
  );
  for (const invalid of [
    '',
    ' ',
    'x'.repeat(1_001),
    `Вопрос${String.fromCharCode(0)}`,
    42,
    null,
  ]) {
    assert.throws(
      () => normalizeHandoffQuestion(invalid),
      HandoffValidationError,
    );
  }
  assert.throws(
    () => normalizeHandoffReply('y'.repeat(1_001)),
    HandoffValidationError,
  );
});

test('a new handoff carries a retention deadline', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840004');
  const buyer = await bindBuyer(fixture, setup, '940004');
  const id = await openHandoff(setup, buyer);
  const row = fixture.rows<{ created_at: string; expires_at: string }>(
    'SELECT created_at, expires_at FROM sotuvchi_handoffs WHERE id = ?',
    id,
  )[0];
  const ttl = Date.parse(row.expires_at) - Date.parse(row.created_at);
  assert.equal(ttl, 7 * 24 * 60 * 60 * 1000);
});

test('expired content is cleared and the handoff becomes unanswerable', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840005');
  const buyer = await bindBuyer(fixture, setup, '940005');
  const id = await openHandoff(setup, buyer);
  fixture.exec(
    `UPDATE sotuvchi_handoffs SET expires_at = '2000-01-01T00:00:00.000Z'`,
  );
  // Any scoped read runs the opportunistic sweep.
  await setup.handoff.listHandoffs(sellerOrg(setup));
  const row = fixture.rows<{
    status: string;
    question_text: string | null;
    reply_text: string | null;
    content_cleared_at: string | null;
  }>(
    `SELECT status, question_text, reply_text, content_cleared_at
     FROM sotuvchi_handoffs WHERE id = ?`,
    id,
  )[0];
  assert.equal(row.status, 'expired');
  assert.equal(row.question_text, null);
  assert.equal(row.reply_text, null);
  assert.notEqual(row.content_cleared_at, null);

  const detail = await setup.handoff.getHandoff(sellerOrg(setup), id);
  assert.equal(detail.questionText, null);
  assert.equal(detail.contentCleared, true);
  await assert.rejects(
    () => setup.handoff.startReply(sellerOrg(setup), id),
    HandoffExpiredError,
  );
});

test('expiry keeps metadata and never removes the row', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840006');
  const buyer = await bindBuyer(fixture, setup, '940006');
  const id = await openHandoff(setup, buyer);
  fixture.exec(
    `UPDATE sotuvchi_handoffs SET expires_at = '2000-01-01T00:00:00.000Z'`,
  );
  await setup.handoff.listHandoffs(sellerOrg(setup));
  const summaries = await setup.handoff.listHandoffs(sellerOrg(setup));
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, id);
  assert.equal(summaries[0].status, 'expired');
  assert.equal(summaries[0].reason, 'buyer_requested_human');
  assert.equal(summaries[0].contentCleared, true);
});

// ── Creation ───────────────────────────────────────────────────────────────

test('an explicit buyer request creates exactly one open handoff', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840007');
  const buyer = await bindBuyer(fixture, setup, '940007');
  const first = await setup.handoff.requestHandoff(
    buyerOrg(setup, buyer),
    'buyer_requested_human',
    'Позовите продавца, нужен размер',
  );
  assert.equal(first.outcome, 'created');
  assert.equal(first.handoff.status, 'open');
  assert.equal(first.handoff.questionText, 'Позовите продавца, нужен размер');
  assert.equal(first.handoff.sellerIdentityId, setup.owner.identityId);

  const second = await setup.handoff.requestHandoff(
    buyerOrg(setup, buyer),
    'buyer_requested_human',
    'Ещё один вопрос',
  );
  assert.equal(second.outcome, 'existing');
  assert.equal(second.handoff.id, first.handoff.id);
  assert.equal(second.handoff.questionText, 'Позовите продавца, нужен размер');
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_handoffs'),
    1,
  );
});

test('a repeated update replays instead of creating a second handoff', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840008');
  const buyer = await bindBuyer(fixture, setup, '940008');
  const org = buyerOrg(setup, buyer, requestId('fixed'));
  const first = await setup.handoff.requestHandoff(
    org,
    'buyer_requested_human',
    'Позовите продавца',
  );
  const replay = await setup.handoff.requestHandoff(
    org,
    'buyer_requested_human',
    'Позовите продавца',
  );
  assert.equal(replay.outcome, 'existing');
  assert.equal(replay.handoff.id, first.handoff.id);
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_handoffs'), 1);
  await assert.rejects(
    () => setup.handoff.requestHandoff(org, 'order_question', 'Другое'),
    HandoffIdempotencyConflictError,
  );
});

test('the operation log never stores the question text', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840009');
  const buyer = await bindBuyer(fixture, setup, '940009');
  await openHandoff(setup, buyer, 'Секретный вопрос про Чилонзор');
  const dump = JSON.stringify(
    fixture.rows('SELECT * FROM sotuvchi_handoff_operations'),
  );
  assert.ok(!dump.includes('Чилонзор'));
  assert.ok(!dump.includes('Секретный'));
});

// ── Seller queue ───────────────────────────────────────────────────────────

test('the queue hides content and the detail shows it to the owner', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840010');
  const buyer = await bindBuyer(fixture, setup, '940010');
  const id = await openHandoff(setup, buyer, 'Позовите продавца про оплату');
  const queue = await setup.handoff.listHandoffs(sellerOrg(setup));
  assert.equal(queue.length, 1);
  assert.ok(!JSON.stringify(queue).includes('оплату'));
  const detail = await setup.handoff.getHandoff(sellerOrg(setup), id);
  assert.equal(detail.questionText, 'Позовите продавца про оплату');
});

test('the queue is isolated between stores and closed to buyers', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '840011');
  const second = await setupStore(fixture, '840012');
  const buyer = await bindBuyer(fixture, first, '940011');
  const id = await openHandoff(first, buyer);

  assert.deepEqual(await second.handoff.listHandoffs(sellerOrg(second)), []);
  await assert.rejects(
    () => second.handoff.getHandoff(sellerOrg(second), id),
    HandoffNotFoundError,
  );
  await assert.rejects(
    () => second.handoff.startReply(sellerOrg(second), id),
    HandoffNotFoundError,
  );
  await assert.rejects(
    () => second.handoff.closeHandoff(sellerOrg(second), id),
    HandoffNotFoundError,
  );

  const buyerContext: OrgContext = {
    orgId: first.storefront.orgId,
    actorId: buyer,
    requestId: requestId('buyer-authority'),
    locale: 'ru',
  };
  await assert.rejects(
    () => first.handoff.listHandoffs(buyerContext),
    CatalogAuthorizationError,
  );
  await assert.rejects(
    () => first.handoff.getHandoff(buyerContext, id),
    CatalogAuthorizationError,
  );
});

test('a handoff reference alone grants nothing', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '840013');
  const second = await setupStore(fixture, '840014');
  const buyer = await bindBuyer(fixture, first, '940013');
  const id = await openHandoff(first, buyer);
  // Same opaque id, foreign owner context and a forged org both fail.
  await assert.rejects(
    () => second.handoff.getHandoff(
      { ...sellerOrg(second), orgId: first.storefront.orgId },
      id,
    ),
    CatalogAuthorizationError,
  );
  assert.equal(
    fixture.value('SELECT status FROM sotuvchi_handoffs WHERE id = ?', id),
    'open',
  );
});

// ── Reply session and reply ────────────────────────────────────────────────

test('a reply target is durable and unique per seller', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840015');
  const buyerA = await bindBuyer(fixture, setup, '940015');
  const first = await openHandoff(setup, buyerA);
  await setup.handoff.startReply(sellerOrg(setup), first);
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_seller_reply_sessions'),
    1,
  );
  assert.equal(
    fixture.value('SELECT handoff_id FROM sotuvchi_seller_reply_sessions'),
    first,
  );

  // A fresh service instance sees the same durable binding.
  const restarted = createSotuvchiHandoffService(
    fixture.asD1(),
    setup.catalog,
    BOT,
  );
  const reference = await restarted.getActiveReplyWorkflowRef(
    setup.owner.orgId,
    setup.owner.identityId,
  );
  assert.ok(reference);
  assert.equal(reference?.orgId, setup.owner.orgId);

  await setup.handoff.closeHandoff(sellerOrg(setup), first);
  const buyerB = await bindBuyer(fixture, setup, '940016');
  const second = await openHandoff(setup, buyerB);
  await setup.handoff.startReply(sellerOrg(setup), second);
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_seller_reply_sessions'),
    1,
  );
  assert.equal(
    fixture.value('SELECT handoff_id FROM sotuvchi_seller_reply_sessions'),
    second,
  );
});

test('a repeated reply button press changes nothing', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840017');
  const buyer = await bindBuyer(fixture, setup, '940017');
  const id = await openHandoff(setup, buyer);
  const org = sellerOrg(setup, requestId('fixed-reply'));
  await setup.handoff.startReply(org, id);
  await setup.handoff.startReply(org, id);
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_seller_reply_sessions'),
    1,
  );
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM workflow_instances
       WHERE workflow_id = 'sotuvchi-seller-reply'`,
    ),
    1,
  );
});

test('an expired reply target is refused', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840018');
  const buyer = await bindBuyer(fixture, setup, '940018');
  const id = await openHandoff(setup, buyer);
  await setup.handoff.startReply(sellerOrg(setup), id);
  fixture.exec(
    `UPDATE sotuvchi_seller_reply_sessions
     SET expires_at = '2000-01-01T00:00:00.000Z'`,
  );
  assert.equal(
    await setup.handoff.getActiveReplyWorkflowRef(
      setup.owner.orgId,
      setup.owner.identityId,
    ),
    null,
  );
  await assert.rejects(
    () => setup.handoff.submitReply(sellerOrg(setup), 'Поздний ответ'),
    HandoffExpiredError,
  );
});

test('the seller answer is stored once and marks the handoff answered', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840019');
  const buyer = await bindBuyer(fixture, setup, '940019');
  const id = await openHandoff(setup, buyer);
  await setup.handoff.startReply(sellerOrg(setup), id);
  const answered = await setup.handoff.submitReply(
    sellerOrg(setup),
    'Доставка завтра',
  );
  assert.equal(answered.outcome, 'answered');
  assert.equal(answered.handoff.status, 'answered');
  assert.equal(answered.handoff.replyText, 'Доставка завтра');
  assert.equal(answered.handoff.sellerIdentityId, setup.owner.identityId);
  assert.notEqual(answered.handoff.answeredAt, null);
  assert.equal(
    fixture.value('SELECT state FROM sotuvchi_seller_reply_sessions'),
    'completed',
  );
});

test('one handoff accepts exactly one final seller reply', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840020');
  const buyer = await bindBuyer(fixture, setup, '940020');
  const id = await openHandoff(setup, buyer);
  await setup.handoff.startReply(sellerOrg(setup), id);
  const org = sellerOrg(setup, requestId('fixed-answer'));
  await setup.handoff.submitReply(org, 'Первый ответ');
  const replay = await setup.handoff.submitReply(org, 'Первый ответ');
  assert.equal(replay.outcome, 'unchanged');
  assert.equal(replay.handoff.replyText, 'Первый ответ');
  await assert.rejects(
    () => setup.handoff.submitReply(sellerOrg(setup), 'Второй ответ'),
    HandoffStateError,
  );
  await setup.handoff.startReply(sellerOrg(setup), id).catch(() => undefined);
  assert.equal(
    fixture.value('SELECT reply_text FROM sotuvchi_handoffs WHERE id = ?', id),
    'Первый ответ',
  );
});

test('a reply loses to a concurrent answer instead of overwriting it', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840034');
  const buyer = await bindBuyer(fixture, setup, '940034');
  const id = await openHandoff(setup, buyer);
  await setup.handoff.startReply(sellerOrg(setup), id);
  // The bound target is answered by another writer between bind and submit.
  fixture.exec(
    `UPDATE sotuvchi_handoffs
     SET status = 'answered',
         reply_text = 'Ответ другого сеанса',
         answered_at = '2026-07-27T12:00:00.000Z',
         updated_at = '2026-07-27T12:00:00.000Z',
         version = version + 1`,
  );
  await assert.rejects(
    () => setup.handoff.submitReply(sellerOrg(setup), 'Поздний ответ'),
    HandoffReplyConflictError,
  );
  assert.equal(
    fixture.value('SELECT reply_text FROM sotuvchi_handoffs WHERE id = ?', id),
    'Ответ другого сеанса',
  );
});

test('a reply without a bound target is refused', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840021');
  const buyer = await bindBuyer(fixture, setup, '940021');
  await openHandoff(setup, buyer);
  await assert.rejects(
    () => setup.handoff.submitReply(sellerOrg(setup), 'Ответ без цели'),
    HandoffStateError,
  );
});

test('a foreign seller can never reply to another store handoff', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, '840022');
  const second = await setupStore(fixture, '840023');
  const buyer = await bindBuyer(fixture, first, '940022');
  const id = await openHandoff(first, buyer);
  await assert.rejects(
    () => second.handoff.startReply(sellerOrg(second), id),
    HandoffNotFoundError,
  );
  await assert.rejects(
    () => second.handoff.submitReply(sellerOrg(second), 'Чужой ответ'),
    HandoffStateError,
  );
  assert.equal(
    fixture.value('SELECT reply_text FROM sotuvchi_handoffs WHERE id = ?', id),
    null,
  );
});

// ── Close ──────────────────────────────────────────────────────────────────

test('a seller can close an open or answered handoff exactly once', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840024');
  const buyerA = await bindBuyer(fixture, setup, '940024');
  const open = await openHandoff(setup, buyerA);
  const closed = await setup.handoff.closeHandoff(sellerOrg(setup), open);
  assert.equal(closed.outcome, 'closed');
  assert.equal(closed.handoff.status, 'closed');
  const repeat = await setup.handoff.closeHandoff(sellerOrg(setup), open);
  assert.equal(repeat.outcome, 'unchanged');

  const buyerB = await bindBuyer(fixture, setup, '940025');
  const answeredId = await openHandoff(setup, buyerB);
  await setup.handoff.startReply(sellerOrg(setup), answeredId);
  await setup.handoff.submitReply(sellerOrg(setup), 'Ответ продавца');
  const afterAnswer = await setup.handoff.closeHandoff(
    sellerOrg(setup),
    answeredId,
  );
  assert.equal(afterAnswer.handoff.status, 'closed');
  assert.equal(afterAnswer.handoff.replyText, 'Ответ продавца');
});

test('a closed handoff is immutable and frees the buyer session', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840026');
  const buyer = await bindBuyer(fixture, setup, '940026');
  const id = await openHandoff(setup, buyer);
  await setup.handoff.closeHandoff(sellerOrg(setup), id);
  await assert.rejects(
    () => setup.handoff.startReply(sellerOrg(setup), id),
    HandoffStateError,
  );
  const next = await setup.handoff.requestHandoff(
    buyerOrg(setup, buyer),
    'buyer_requested_human',
    'Новый вопрос продавцу',
  );
  assert.equal(next.outcome, 'created');
  assert.notEqual(next.handoff.id, id);
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_handoffs'), 2);
});

// ── Facts, grounding and authorship ────────────────────────────────────────

test('handoff messages pass strict grounding in RU and UZ', async () => {
  const fixture = new SqliteD1();
  for (const locale of ['ru', 'uz'] as const) {
    const setup = await setupStore(
      fixture,
      locale === 'ru' ? '840027' : '840028',
      locale,
    );
    const buyer = await bindBuyer(
      fixture,
      setup,
      locale === 'ru' ? '940027' : '940028',
    );
    const id = await openHandoff(
      setup,
      buyer,
      locale === 'ru' ? 'Позовите продавца' : 'Sotuvchini chaqiring',
    );
    const handoff = await setup.handoff.getHandoff(sellerOrg(setup), id);

    for (const values of [
      projectBuyerHandoffFacts(handoff, locale, true),
      projectSellerNoticeFacts(handoff, locale),
      projectSellerQueueFacts(
        await setup.handoff.listHandoffs(sellerOrg(setup)),
        locale,
      ),
      projectSellerDetailFacts(handoff, locale),
    ]) {
      const facts = { toolName: 'sotuvchi.handoff', values };
      assert.deepEqual(
        groundResponse(composeHandoffResponse(facts, locale), [facts]),
        { status: 'passed' },
        JSON.stringify(values['handoff.view'] ?? values['seller.view']),
      );
    }

    await setup.handoff.startReply(sellerOrg(setup), id);
    const answered = await setup.handoff.submitReply(
      sellerOrg(setup),
      locale === 'ru' ? 'Да, доставим за 2 дня' : 'Ha, 2 kunda yetkazamiz',
    );
    const replyValues = projectHandoffReplyFacts(answered.handoff, locale);
    const replyFacts = { toolName: 'sotuvchi.handoff', values: replyValues };
    const draft = composeHandoffResponse(replyFacts, locale);
    assert.deepEqual(
      groundResponse(draft, [replyFacts]),
      { status: 'passed' },
    );
    assert.ok(draft.messages[0].text.includes(
      locale === 'ru' ? 'Ответ продавца' : 'Sotuvchining javobi',
    ));
  }
});

test('a seller notification never carries the question text', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840029');
  const buyer = await bindBuyer(fixture, setup, '940029');
  const id = await openHandoff(setup, buyer, 'Позовите продавца про Чилонзор');
  const handoff = await setup.handoff.getHandoff(sellerOrg(setup), id);
  const values = projectSellerNoticeFacts(handoff, 'ru');
  const facts = { toolName: 'sotuvchi.handoff', values };
  const rendered = JSON.stringify(composeHandoffResponse(facts, 'ru'));
  assert.ok(!rendered.includes('Чилонзор'));
  assert.ok(!JSON.stringify(values).includes('Чилонзор'));
});

// ── Delivery ───────────────────────────────────────────────────────────────

class MemoryDelivery implements TelegramDeliveryPort {
  readonly sent: Array<{ threadRef: string; text: string; keyboard?: unknown }> = [];
  failNext = false;

  async sendText(
    threadRef: string,
    text: string,
    keyboard?: never,
  ): Promise<boolean> {
    if (this.failNext) return false;
    this.sent.push({ threadRef, text, ...(keyboard ? { keyboard } : {}) });
    return true;
  }

  async answerCallback(): Promise<boolean> {
    return true;
  }
}

function dispatcherFor(setup: StoreFixture, delivery: MemoryDelivery) {
  return createSotuvchiNotificationDispatcher({
    handoff: setup.handoff,
    orders: setup.orders,
    addresses: setup.addresses,
    delivery: createTelegramChannelDelivery(delivery, BOT),
  });
}

test('the seller notice is pushed once and the buyer answer follows', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840030');
  const buyer = await bindBuyer(fixture, setup, '940030');
  await bindAddress(setup, buyer, '940030');
  await bindAddress(setup, setup.owner.identityId, '840030');
  const id = await openHandoff(setup, buyer);
  const delivery = new MemoryDelivery();
  const dispatcher = dispatcherFor(setup, delivery);

  const first = await dispatcher.flush(setup.owner.orgId, setup.owner.storeId);
  assert.equal(first.delivered, 1);
  assert.equal(delivery.sent[0].threadRef, '840030');
  assert.ok(delivery.sent[0].text.includes('Новый вопрос покупателя'));

  const again = await dispatcher.flush(setup.owner.orgId, setup.owner.storeId);
  assert.equal(again.delivered, 0);
  assert.equal(delivery.sent.length, 1);

  await setup.handoff.startReply(sellerOrg(setup), id);
  await setup.handoff.submitReply(sellerOrg(setup), 'Доставим завтра');
  const replyFlush = await dispatcher.flush(
    setup.owner.orgId,
    setup.owner.storeId,
  );
  assert.equal(replyFlush.delivered, 1);
  const answer = delivery.sent.at(-1);
  assert.equal(answer?.threadRef, '940030');
  assert.ok(answer?.text.startsWith('Ответ продавца:'));
  assert.ok(answer?.text.includes('Доставим завтра'));
  assert.equal(
    fixture.value('SELECT status FROM sotuvchi_handoffs WHERE id = ?', id),
    'closed',
  );
});

test('a failed delivery keeps the answer and retries later', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840031');
  const buyer = await bindBuyer(fixture, setup, '940031');
  await bindAddress(setup, buyer, '940031');
  await bindAddress(setup, setup.owner.identityId, '840031');
  const id = await openHandoff(setup, buyer);
  await setup.handoff.startReply(sellerOrg(setup), id);
  await setup.handoff.submitReply(sellerOrg(setup), 'Ответ на потом');

  const delivery = new MemoryDelivery();
  delivery.failNext = true;
  const dispatcher = dispatcherFor(setup, delivery);
  const failed = await dispatcher.flush(setup.owner.orgId, setup.owner.storeId);
  assert.ok(failed.failed >= 1);
  assert.equal(
    fixture.value('SELECT status FROM sotuvchi_handoffs WHERE id = ?', id),
    'answered',
  );
  assert.equal(
    fixture.value('SELECT reply_text FROM sotuvchi_handoffs WHERE id = ?', id),
    'Ответ на потом',
  );
  await assert.rejects(
    () => setup.handoff.submitReply(sellerOrg(setup), 'Второй ответ'),
    HandoffStateError,
  );

  delivery.failNext = false;
  const retried = await dispatcher.flush(
    setup.owner.orgId,
    setup.owner.storeId,
  );
  assert.equal(retried.delivered, 1);
  assert.ok(delivery.sent.at(-1)?.text.includes('Ответ на потом'));
});

test('a missing buyer address never loses the answer', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840032');
  const buyer = await bindBuyer(fixture, setup, '940032');
  await bindAddress(setup, setup.owner.identityId, '840032');
  const id = await openHandoff(setup, buyer);
  await setup.handoff.startReply(sellerOrg(setup), id);
  await setup.handoff.submitReply(sellerOrg(setup), 'Ответ без адреса');
  const delivery = new MemoryDelivery();
  const result = await dispatcherFor(setup, delivery).flush(
    setup.owner.orgId,
    setup.owner.storeId,
  );
  assert.ok(result.failed >= 1);
  assert.equal(
    fixture.value('SELECT status FROM sotuvchi_handoffs WHERE id = ?', id),
    'answered',
  );
});

// ── P2.5 notification delivery ─────────────────────────────────────────────

async function publish(setup: StoreFixture): Promise<CatalogProduct> {
  const draft = await setup.catalog.createProduct(
    { ...setup.owner, requestId: requestId('owner') },
    {
      name: 'Alpha Phone',
      priceMinor: 125_000,
      currency: 'UZS',
      availability: 'available',
      mediaRefs: [],
    },
  );
  return setup.catalog.publishProduct(
    { ...setup.owner, requestId: requestId('owner') },
    draft.id,
    draft.version,
  );
}

async function placeOrder(
  setup: StoreFixture,
  identityId: string,
  productId: string,
): Promise<string> {
  await setup.checkout.startCheckout(buyerOrg(setup, identityId), productId);
  await setup.checkout.submitQuantity(buyerOrg(setup, identityId), 2);
  await setup.checkout.submitName(buyerOrg(setup, identityId), 'Дилшод');
  await setup.checkout.submitPhone(buyerOrg(setup, identityId), '901234567');
  await setup.checkout.submitAddress(
    buyerOrg(setup, identityId),
    'Тошкент, Чилонзор 5',
  );
  const placed = await setup.checkout.confirmCheckout(
    buyerOrg(setup, identityId),
  );
  return placed.order.id;
}

test('P2.5 order intents reach the seller and the buyer', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840033');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '940033');
  await bindAddress(setup, buyer, '940033');
  await bindAddress(setup, setup.owner.identityId, '840033');
  const orderId = await placeOrder(setup, buyer, product.id);
  const delivery = new MemoryDelivery();
  const dispatcher = dispatcherFor(setup, delivery);

  const placedFlush = await dispatcher.flush(
    setup.owner.orgId,
    setup.owner.storeId,
  );
  assert.equal(placedFlush.delivered, 1);
  assert.equal(delivery.sent[0].threadRef, '840033');
  assert.ok(delivery.sent[0].text.includes('Новый заказ'));

  await setup.orders.setInventory(sellerOrg(setup), product.id, 9);
  await setup.orders.confirmOrder(sellerOrg(setup), orderId);
  await dispatcher.flush(setup.owner.orgId, setup.owner.storeId);
  assert.equal(delivery.sent.at(-1)?.threadRef, '940033');
  assert.ok(delivery.sent.at(-1)?.text.includes('Заказ подтверждён'));

  await setup.orders.completeOrder(sellerOrg(setup), orderId);
  await dispatcher.flush(setup.owner.orgId, setup.owner.storeId);
  assert.ok(delivery.sent.at(-1)?.text.includes('Заказ выполнен'));

  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_notifications WHERE status = 'sent'`,
    ),
    3,
  );
});

test('order notification retries never mutate the order or the stock', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840034');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '940034');
  await bindAddress(setup, buyer, '940034');
  await bindAddress(setup, setup.owner.identityId, '840034');
  const orderId = await placeOrder(setup, buyer, product.id);
  await setup.orders.setInventory(sellerOrg(setup), product.id, 9);
  await setup.orders.confirmOrder(sellerOrg(setup), orderId);

  const delivery = new MemoryDelivery();
  delivery.failNext = true;
  const dispatcher = dispatcherFor(setup, delivery);
  await dispatcher.flush(setup.owner.orgId, setup.owner.storeId);
  const stockAfterFailure = fixture.value('SELECT on_hand FROM sotuvchi_inventory');
  assert.equal(stockAfterFailure, 7);
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_inventory_moves
       WHERE type = 'order_confirmed'`,
    ),
    1,
  );
  assert.equal(
    fixture.value(
      'SELECT fulfillment_status FROM sotuvchi_orders WHERE id = ?',
      orderId,
    ),
    'confirmed',
  );
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sotuvchi_notifications WHERE status = 'failed'`,
    ),
    2,
  );
});

test('no notification row is created for history that predates delivery', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840035');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '940035');
  await placeOrder(setup, buyer, product.id);
  const before = fixture.value('SELECT COUNT(*) FROM sotuvchi_notifications');
  const delivery = new MemoryDelivery();
  await dispatcherFor(setup, delivery).flush(
    setup.owner.orgId,
    setup.owner.storeId,
  );
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_notifications'),
    before,
  );
});

test('notification and handoff rows never store contact data', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '840036');
  const product = await publish(setup);
  const buyer = await bindBuyer(fixture, setup, '940036');
  await bindAddress(setup, buyer, '940036');
  await placeOrder(setup, buyer, product.id);
  await openHandoff(setup, buyer);
  const dump = JSON.stringify([
    ...fixture.rows('SELECT * FROM sotuvchi_notifications'),
    ...fixture.rows('SELECT * FROM channel_addresses'),
  ]);
  for (const secret of ['Дилшод', '998901234567', 'Чилонзор', 'Alpha']) {
    assert.ok(!dump.includes(secret), secret);
  }
});

// ── Migration and bootstrap ────────────────────────────────────────────────

test('handoff migration is additive and content-bounded', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'migrations/0023_sotuvchi_handoff.sql'),
    'utf8',
  );
  const executable = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(executable, /(?:^|;)\s*(?:DROP|DELETE|ALTER|TRUNCATE)\b/i);
  assert.doesNotMatch(executable, /transcript|attachment|chat_id|telegram_id/i);
  for (const marker of [
    'channel_addresses',
    'sotuvchi_handoffs',
    'sotuvchi_handoff_operations',
    'sotuvchi_seller_reply_sessions',
    'idx_sotuvchi_handoffs_active',
  ]) {
    assert.ok(executable.includes(marker), marker);
  }
});

test('migration and runtime bootstrap stay in parity', () => {
  const flatten = (value: string) => value.replace(/\s+/g, ' ');
  const bootstrap = flatten([
    fs.readFileSync(
      path.join(ROOT, 'functions/agents/sotuvchi/handoff/schema.ts'),
      'utf8',
    ),
    fs.readFileSync(
      path.join(ROOT, 'functions/platform/channels/store.ts'),
      'utf8',
    ),
  ].join('\n'));
  const applied = flatten(fs.readFileSync(
    path.join(ROOT, 'migrations/0023_sotuvchi_handoff.sql'),
    'utf8',
  ));
  for (const marker of [
    "status IN ('open', 'answered', 'closed', 'expired')",
    'question_text IS NULL OR length(question_text) <= 1000',
    'reply_text IS NULL OR length(reply_text) <= 1000',
    "state IN ('awaiting_reply', 'completed', 'cancelled')",
    'UNIQUE (identity_id, channel, namespace)',
    "idx_sotuvchi_handoffs_active ON sotuvchi_handoffs (buyer_session_id) "
      + "WHERE status IN ('open', 'answered')",
  ]) {
    assert.ok(bootstrap.includes(marker), `bootstrap ${marker}`);
    assert.ok(applied.includes(marker), `migration ${marker}`);
  }
});

test('runtime bootstrap is repeatable and stores no transcript', async () => {
  const fixture = new SqliteD1();
  await ensureSotuvchiHandoffSchema(fixture.asD1());
  await ensureSotuvchiHandoffSchema(fixture.asD1());
  const objects = fixture.rows<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE name LIKE 'sotuvchi_handoff%'
        OR name LIKE 'sotuvchi_seller_reply%'
        OR name LIKE 'channel_addresses%'
        OR name LIKE 'idx_sotuvchi_handoff%'`,
  ).map((row) => row.name);
  for (const expected of [
    'sotuvchi_handoffs',
    'sotuvchi_handoff_operations',
    'sotuvchi_seller_reply_sessions',
    'channel_addresses',
    'idx_sotuvchi_handoffs_active',
  ]) {
    assert.ok(objects.includes(expected), expected);
  }
  const columns = fixture.rows<{ name: string }>(
    'PRAGMA table_info(sotuvchi_handoffs)',
  ).map((column) => column.name);
  for (const forbidden of ['transcript', 'attachment_ref', 'chat_id']) {
    assert.ok(!columns.includes(forbidden), forbidden);
  }
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sqlite_master WHERE name LIKE '%transcript%'`,
    ),
    0,
  );
});

// ── Telegram end to end ────────────────────────────────────────────────────

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
  const delivery = new MemoryDelivery();
  const wiring = createTelegramAgentsRuntimeWiring(db, BOT, delivery);
  const addresses = createChannelAddressService(db);
  const dependencies: TelegramAgentsWebhookDependencies = {
    botUsername: BOT,
    webhookSecret: SECRET,
    updates: createTelegramAgentUpdateStore(db),
    identities: createTelegramIdentityPort(createIdentityService(db)),
    contexts: wiring.contexts,
    runtime: wiring.runtime,
    delivery,
    addresses: createTelegramAddressBinder(
      createChannelAddressBindingPort(addresses),
      BOT,
    ),
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

test('Telegram RU handoff runs from buyer question to marked answer', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '850001');
  const harness = telegramHarness(fixture);

  // The seller talks first, which binds the address the push will use.
  await harness.invoke(telegramMessage(960_001, 850001, 'Вопросы', 'ru'));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Новых вопросов нет'));

  await harness.invoke(telegramMessage(
    960_002,
    950001,
    `/start agent_${setup.storefrontCode}`,
    'ru',
  ));
  await harness.invoke(telegramMessage(
    960_003,
    950001,
    'Позвать продавца, есть вопрос про размер',
    'ru',
  ));
  const buyerAck = harness.delivery.sent.filter(
    (message) => message.threadRef === '950001',
  ).at(-1);
  assert.ok(buyerAck?.text.includes('передал вопрос продавцу'));
  const sellerPush = harness.delivery.sent.filter(
    (message) => message.threadRef === '850001',
  ).at(-1);
  assert.ok(sellerPush?.text.includes('Новый вопрос покупателя'));
  assert.ok(!sellerPush?.text.includes('размер'));

  const handoffId = String(
    fixture.value('SELECT id FROM sotuvchi_handoffs'),
  );
  await harness.invoke(telegramCallback(
    960_004,
    850001,
    `seller-handoff.${handoffId}`,
    'ru',
  ));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('вопрос про размер'));

  await harness.invoke(telegramCallback(
    960_005,
    850001,
    `seller-handoff-reply.${handoffId}`,
    'ru',
  ));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Отправьте текст ответа'));

  const replyUpdate = telegramMessage(
    960_006,
    850001,
    'Есть размеры S и M',
    'ru',
  );
  await harness.invoke(replyUpdate);
  const answer = harness.delivery.sent.filter(
    (message) => message.threadRef === '950001',
  ).at(-1);
  assert.ok(answer?.text.startsWith('Ответ продавца:'));
  assert.ok(answer?.text.includes('Есть размеры S и M'));

  const beforeDuplicate = harness.delivery.sent.length;
  const duplicate = await harness.invoke(replyUpdate);
  assert.equal(await duplicate.text(), 'duplicate');
  assert.equal(harness.delivery.sent.length, beforeDuplicate);
  assert.equal(
    fixture.value('SELECT status FROM sotuvchi_handoffs WHERE id = ?', handoffId),
    'closed',
  );

  const rendered = JSON.stringify(harness.delivery.sent);
  assert.ok(!/Оплатить|Payme|CRM|тикет/i.test(rendered));
});

test('Telegram UZ buyer sees the existing handoff and the seller can close it', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '850002', 'uz');
  const harness = telegramHarness(fixture);
  await harness.invoke(telegramMessage(970_001, 850002, 'Savollar', 'uz'));

  await harness.invoke(telegramMessage(
    970_002,
    950002,
    `/start agent_${setup.storefrontCode}`,
    'uz',
  ));
  await harness.invoke(telegramMessage(
    970_003,
    950002,
    'Sotuvchini chaqiring, savolim bor',
    'uz',
  ));
  assert.ok(
    harness.delivery.sent.filter((m) => m.threadRef === '950002').at(-1)
      ?.text.includes('sotuvchiga yuborildi'),
  );
  await harness.invoke(telegramMessage(
    970_004,
    950002,
    'Sotuvchini chaqiring yana',
    'uz',
  ));
  assert.ok(
    harness.delivery.sent.filter((m) => m.threadRef === '950002').at(-1)
      ?.text.includes('allaqachon yuborilgan'),
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_handoffs'), 1);

  const handoffId = String(fixture.value('SELECT id FROM sotuvchi_handoffs'));
  await harness.invoke(telegramCallback(
    970_005,
    850002,
    `seller-handoff-close.${handoffId}`,
    'uz',
  ));
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('Murojaat yopildi'));
  assert.equal(
    fixture.value('SELECT status FROM sotuvchi_handoffs WHERE id = ?', handoffId),
    'closed',
  );
});

test('an unknown buyer question is not escalated automatically', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '850003');
  const harness = telegramHarness(fixture);
  await harness.invoke(telegramMessage(
    980_001,
    950003,
    `/start agent_${setup.storefrontCode}`,
    'ru',
  ));
  await harness.invoke(telegramMessage(980_002, 950003, 'а оно тянется', 'ru'));
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_handoffs'), 0);
  assert.ok(harness.delivery.sent.at(-1)?.text.includes('позвать продавца'));
});

// ── Scope boundaries ───────────────────────────────────────────────────────

test('P2.6 adds handoff tools without CRM, payment or attachments', () => {
  const names = sotuvchiAgentManifest.tools.map((tool) => tool.name);
  for (const expected of [
    'handoff.request',
    'seller.handoffs.list',
    'seller.handoff.get',
    'seller.handoff.reply',
    'seller.handoff.close',
  ]) {
    assert.ok(names.includes(expected), expected);
  }
  assert.ok(
    !names.some((name) => /payment|refund|cart|crm|attachment|ticket/i.test(name)),
  );
  assert.ok(sotuvchiAgentManifest.capabilities.includes('handoff'));
  assert.equal(sotuvchiAgentManifest.policies.aiSelection, 'disabled');
  const priorities = (sotuvchiAgentManifest.deterministicRules ?? [])
    .map((rule) => rule.priority);
  assert.equal(new Set(priorities).size, priorities.length);
  assert.equal(sotuvchiSellerReplyWorkflow.id, 'sotuvchi-seller-reply');
  assert.deepEqual(
    Object.keys(sotuvchiSellerReplyWorkflow.states),
    ['awaiting_reply', 'completed', 'cancelled'],
  );
});

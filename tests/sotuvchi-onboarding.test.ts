import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DatabaseSync,
  type SQLInputValue,
} from 'node:sqlite';

import { createTelegramAgentsRuntimeWiring } from '../functions/api/telegram/agents';
import {
  SotuvchiOnboardingError,
  createSotuvchiOnboardingService,
  createSotuvchiOnboardingStore,
  ensureSotuvchiOnboardingSchema,
  isStorefrontCode,
  normalizeDeliveryMode,
  normalizePaymentMethods,
  normalizeSotuvchiIdentityContext,
  normalizeStoreLocale,
  normalizeStoreName,
  normalizeSubmitStepInput,
  sotuvchiAgentManifest,
  type SotuvchiIdentityContext,
  type SotuvchiOnboardingService,
  type SotuvchiOnboardingSnapshot,
} from '../functions/agents/sotuvchi';
import {
  createTelegramAgentUpdateStore,
  createTelegramIdentityPort,
  handleTelegramAgentsWebhook,
  telegramAgentUpdateKey,
  type TelegramAgentsWebhookDependencies,
  type TelegramDeliveryPort,
} from '../functions/channels/telegram';
import { createIdentityService } from '../functions/platform/identity';
import {
  WorkflowTransitionNotAllowedError,
  WorkflowVersionConflictError,
} from '../functions/platform/workflow';
import {
  activatePilotStore,
  ensurePilotStoreSchema,
  setPilotStoreState,
} from './helpers/pilot-store';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOT = 'agents_store_bot';
const SECRET = 'fixture-sotuvchi-webhook-secret';

function sqliteValue(value: unknown): SQLInputValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'bigint'
    || value instanceof Uint8Array
  ) {
    return value;
  }
  throw new Error('unsupported sqlite fixture value');
}

class SqliteD1Statement {
  private bindings: SQLInputValue[] = [];

  constructor(
    private readonly sqlite: DatabaseSync,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]): SqliteD1Statement {
    this.bindings = values.map(sqliteValue);
    return this;
  }

  async run(): Promise<D1Result<unknown>> {
    return this.runSync();
  }

  runSync(): D1Result<unknown> {
    const result = this.sqlite.prepare(this.sql).run(...this.bindings);
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    } as unknown as D1Result<unknown>;
  }

  async first<T>(): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.bindings);
    return (row ?? null) as T | null;
  }

  async all<T>(): Promise<D1Result<T>> {
    const rows = this.sqlite.prepare(this.sql).all(...this.bindings);
    return {
      success: true,
      results: rows as T[],
      meta: { changes: 0 },
    } as unknown as D1Result<T>;
  }
}

class SqliteD1 {
  readonly sqlite = new DatabaseSync(':memory:');

  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON');
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.sqlite, sql);
  }

  async batch(
    statements: readonly D1PreparedStatement[],
  ): Promise<D1Result<unknown>[]> {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof SqliteD1Statement)) {
          throw new Error('foreign statement in sqlite fixture');
        }
        return statement.runSync();
      });
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  rows<T>(sql: string, ...values: SQLInputValue[]): T[] {
    return this.sqlite.prepare(sql).all(...values) as T[];
  }

  value(sql: string, ...values: SQLInputValue[]): unknown {
    const row = this.sqlite.prepare(sql).get(...values);
    return row ? Object.values(row)[0] : null;
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

let requestSequence = 0;

async function identityContext(
  db: D1Database,
  externalId: string,
  locale: 'ru' | 'uz' = 'ru',
): Promise<SotuvchiIdentityContext> {
  const identity = await createIdentityService(db).getOrCreateIdentity(
    'telegram',
    externalId,
  );
  requestSequence += 1;
  return {
    identityId: identity.identity.id,
    botUsername: BOT,
    requestId: `fixture-request-${requestSequence}`,
    locale,
  };
}

function nextRequest(
  context: SotuvchiIdentityContext,
): SotuvchiIdentityContext {
  requestSequence += 1;
  return { ...context, requestId: `fixture-request-${requestSequence}` };
}

async function advanceToReview(
  service: SotuvchiOnboardingService,
  context: SotuvchiIdentityContext,
  values: {
    name?: string;
    locale?: 'ru' | 'uz';
    delivery?: 'pickup' | 'delivery' | 'both';
    payments?: readonly ('cash' | 'card_transfer' | 'cash_on_delivery')[];
  } = {},
): Promise<SotuvchiOnboardingSnapshot> {
  let snapshot = await service.startOnboarding(context);
  snapshot = await service.submitOnboardingStep(nextRequest(context), {
    step: 'name',
    value: values.name ?? 'Orzu Test Store',
    expectedVersion: snapshot.version,
    idempotencyKey: `step-name-${requestSequence}`,
  });
  snapshot = await service.submitOnboardingStep(nextRequest(context), {
    step: 'locale',
    value: values.locale ?? 'ru',
    expectedVersion: snapshot.version,
    idempotencyKey: `step-locale-${requestSequence}`,
  });
  snapshot = await service.submitOnboardingStep(nextRequest(context), {
    step: 'delivery',
    value: values.delivery ?? 'both',
    expectedVersion: snapshot.version,
    idempotencyKey: `step-delivery-${requestSequence}`,
  });
  return service.submitOnboardingStep(nextRequest(context), {
    step: 'payment',
    value: values.payments ?? ['cash', 'card_transfer'],
    expectedVersion: snapshot.version,
    idempotencyKey: `step-payment-${requestSequence}`,
  });
}

test('store validation accepts a Unicode RU/UZ profile draft', () => {
  assert.equal(normalizeStoreName('  Orzu Магазин  '), 'Orzu Магазин');
  assert.equal(normalizeStoreLocale('uz'), 'uz');
  assert.equal(normalizeDeliveryMode('both'), 'both');
  assert.deepEqual(
    normalizePaymentMethods(['cash', 'card_transfer']),
    ['cash', 'card_transfer'],
  );
});

test('store name validation rejects short, control and URL-only values', () => {
  for (const value of ['x', 'Bad\u0000Name', 'https://example.test/store']) {
    assert.throws(
      () => normalizeStoreName(value),
      (error: unknown) =>
        error instanceof SotuvchiOnboardingError
        && error.code === 'invalid_name',
    );
  }
});

test('locale validation is an exact ru/uz allowlist', () => {
  assert.throws(() => normalizeStoreLocale('en'), SotuvchiOnboardingError);
});

test('delivery validation rejects values outside the allowlist', () => {
  assert.throws(() => normalizeDeliveryMode('courier'), SotuvchiOnboardingError);
});

test('payment validation rejects unknown and empty methods', () => {
  assert.throws(() => normalizePaymentMethods([]), SotuvchiOnboardingError);
  assert.throws(
    () => normalizePaymentMethods(['payme']),
    SotuvchiOnboardingError,
  );
});

test('payment validation rejects duplicate methods', () => {
  assert.throws(
    () => normalizePaymentMethods(['cash', 'cash']),
    (error: unknown) =>
      error instanceof SotuvchiOnboardingError
      && error.code === 'invalid_payment',
  );
});

test('user-supplied storefront code and org override are rejected', () => {
  assert.throws(
    () => normalizeSubmitStepInput({
      step: 'name',
      value: 'Safe Store',
      expectedVersion: 1,
      idempotencyKey: 'fixture-key',
      storefrontCode: 's-aaaaaaaaaaaaaaaa',
    }),
    SotuvchiOnboardingError,
  );
  assert.throws(
    () => normalizeSotuvchiIdentityContext({
      identityId: 'identity-fixture',
      botUsername: BOT,
      requestId: 'request-fixture',
      locale: 'ru',
      orgId: 'org-override',
    }),
    SotuvchiOnboardingError,
  );
});

test('runtime bootstrap is repeatable and creates three tables plus indexes', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  await ensureSotuvchiOnboardingSchema(db);
  await ensureSotuvchiOnboardingSchema(db);
  const objects = fixture.rows<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type IN ('table', 'index') AND name LIKE '%sotuvchi%'
        OR name = 'telegram_agent_routes'
        OR name = 'idx_telegram_agent_routes_org_status'`,
  ).map((row) => row.name);
  for (const expected of [
    'sotuvchi_onboardings',
    'sotuvchi_stores',
    'telegram_agent_routes',
    'idx_sotuvchi_onboardings_status',
    'idx_sotuvchi_stores_status',
    'idx_telegram_agent_routes_org_status',
  ]) {
    assert.ok(objects.includes(expected), expected);
  }
});

test('migration and runtime schema keep tables, indexes and constraints in parity', () => {
  const schema = fs.readFileSync(
    path.join(
      ROOT,
      'functions/agents/sotuvchi/onboarding/schema.ts',
    ),
    'utf8',
  );
  const migration = fs.readFileSync(
    path.join(ROOT, 'migrations/0018_sotuvchi_store_onboarding.sql'),
    'utf8',
  );
  for (const marker of [
    'sotuvchi_onboardings',
    'sotuvchi_stores',
    'telegram_agent_routes',
    'idx_sotuvchi_onboardings_status',
    'idx_sotuvchi_stores_status',
    'idx_telegram_agent_routes_org_status',
    "status IN ('draft', 'active', 'suspended')",
    'UNIQUE (bot_username, route_code)',
    'UNIQUE (bot_username, org_id, agent_id)',
  ]) {
    assert.ok(schema.includes(marker), marker);
    assert.ok(migration.includes(marker), marker);
  }
  const executable = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(
    executable,
    /(?:^|;)\s*(?:DROP|DELETE|ALTER)\b/i,
  );
});

test('onboarding starts in persistent awaiting_name state with only draft fields', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const context = await identityContext(db, '1001');
  const snapshot = await createSotuvchiOnboardingService(db)
    .startOnboarding(context);
  assert.equal(snapshot.state, 'awaiting_name');
  assert.equal(snapshot.status, 'active');
  assert.equal(snapshot.version, 2);
  assert.deepEqual(Object.keys(snapshot.draft).sort(), [
    'deliveryMode',
    'locale',
    'paymentMethods',
    'storeName',
  ]);
});

test('name, locale, delivery and payment steps reach review', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const context = await identityContext(db, '1002');
  const snapshot = await advanceToReview(
    createSotuvchiOnboardingService(db),
    context,
    {
      name: 'Sinov Do‘kon',
      locale: 'uz',
      delivery: 'delivery',
      payments: ['cash_on_delivery'],
    },
  );
  assert.equal(snapshot.state, 'review');
  assert.equal(snapshot.version, 6);
  assert.deepEqual(snapshot.draft, {
    storeName: 'Sinov Do‘kon',
    locale: 'uz',
    deliveryMode: 'delivery',
    paymentMethods: ['cash_on_delivery'],
  });
});

test('invalid state transition is rejected without changing the draft', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const context = await identityContext(db, '1003');
  const service = createSotuvchiOnboardingService(db);
  const started = await service.startOnboarding(context);
  await assert.rejects(
    () => service.submitOnboardingStep(nextRequest(context), {
      step: 'locale',
      value: 'ru',
      expectedVersion: started.version,
      idempotencyKey: 'wrong-state-step',
    }),
    WorkflowTransitionNotAllowedError,
  );
  assert.equal((await service.getOnboarding(nextRequest(context)))?.state, 'awaiting_name');
});

test('stale version is rejected and never silently retried', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const context = await identityContext(db, '1004');
  const service = createSotuvchiOnboardingService(db);
  let snapshot = await service.startOnboarding(context);
  snapshot = await service.submitOnboardingStep(nextRequest(context), {
    step: 'name',
    value: 'Version Store',
    expectedVersion: snapshot.version,
    idempotencyKey: 'version-name',
  });
  await assert.rejects(
    () => service.submitOnboardingStep(nextRequest(context), {
      step: 'locale',
      value: 'ru',
      expectedVersion: snapshot.version - 1,
      idempotencyKey: 'version-stale',
    }),
    WorkflowVersionConflictError,
  );
});

test('duplicate transition key is idempotent and does not advance twice', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const context = await identityContext(db, '1005');
  const service = createSotuvchiOnboardingService(db);
  const started = await service.startOnboarding(context);
  const input = {
    step: 'name' as const,
    value: 'Idempotent Store',
    expectedVersion: started.version,
    idempotencyKey: 'duplicate-name-step',
  };
  const first = await service.submitOnboardingStep(nextRequest(context), input);
  const duplicate = await service.submitOnboardingStep(
    nextRequest(context),
    input,
  );
  assert.equal(first.state, 'awaiting_locale');
  assert.equal(duplicate.state, 'awaiting_locale');
  assert.equal(duplicate.version, first.version);
});

test('a new service instance resumes persisted onboarding after restart', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const context = await identityContext(db, '1006');
  const first = createSotuvchiOnboardingService(db);
  const started = await first.startOnboarding(context);
  await first.submitOnboardingStep(nextRequest(context), {
    step: 'name',
    value: 'Restart Store',
    expectedVersion: started.version,
    idempotencyKey: 'restart-name',
  });
  const restarted = createSotuvchiOnboardingService(db);
  const resumed = await restarted.startOnboarding(nextRequest(context));
  assert.equal(resumed.state, 'awaiting_locale');
  assert.equal(resumed.draft.storeName, 'Restart Store');
});

test('confirmation creates linked organization, owner, store and route', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const context = await identityContext(db, '1007');
  const service = createSotuvchiOnboardingService(db, {
    storefrontCodeGenerator: () => 's-abcdefghijklmnop',
  });
  const review = await advanceToReview(service, context);
  const result = await service.confirmOnboarding(
    nextRequest(context),
    review.version,
  );
  assert.equal(result.outcome, 'created');
  assert.equal(result.workflowStatus, 'completed');
  assert.equal(result.store.orgId, result.route.orgId);
  assert.equal(result.route.ownerIdentityId, context.identityId);
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM memberships
       WHERE org_id = ? AND identity_id = ?
         AND role = 'owner' AND status = 'active'`,
      result.store.orgId,
      context.identityId,
    ),
    1,
  );
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_stores'),
    1,
  );
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM telegram_agent_routes'),
    1,
  );
});

test('storefront code is opaque, bounded and contains no tenant or identity data', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const context = await identityContext(db, '1008');
  const service = createSotuvchiOnboardingService(db);
  const review = await advanceToReview(service, context);
  const result = await service.confirmOnboarding(
    nextRequest(context),
    review.version,
  );
  assert.equal(isStorefrontCode(result.store.storefrontCode), true);
  assert.equal(result.store.storefrontCode.length, 18);
  assert.ok(!result.store.storefrontCode.includes(result.store.orgId));
  assert.ok(!result.store.storefrontCode.includes(context.identityId));
  assert.ok(!result.store.storefrontCode.includes('orzu'));
});

test('storefront collision retries without leaving an orphan store or route', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const contextA = await identityContext(db, '1009');
  const serviceA = createSotuvchiOnboardingService(db, {
    storefrontCodeGenerator: () => 's-aaaaaaaaaaaaaaaa',
  });
  const reviewA = await advanceToReview(serviceA, contextA);
  await serviceA.confirmOnboarding(nextRequest(contextA), reviewA.version);

  const generated = ['s-aaaaaaaaaaaaaaaa', 's-bbbbbbbbbbbbbbbb'];
  const contextB = await identityContext(db, '1010');
  const serviceB = createSotuvchiOnboardingService(db, {
    storefrontCodeGenerator: () => generated.shift() ?? 's-cccccccccccccccc',
  });
  const reviewB = await advanceToReview(serviceB, contextB);
  const completedB = await serviceB.confirmOnboarding(
    nextRequest(contextB),
    reviewB.version,
  );
  assert.equal(completedB.store.storefrontCode, 's-bbbbbbbbbbbbbbbb');
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_stores'), 2);
  assert.equal(fixture.value('SELECT COUNT(*) FROM telegram_agent_routes'), 2);
});

test('completed onboarding and second start never duplicate side effects', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const context = await identityContext(db, '1011');
  const service = createSotuvchiOnboardingService(db, {
    storefrontCodeGenerator: () => 's-dddddddddddddddd',
  });
  const review = await advanceToReview(service, context);
  const first = await service.confirmOnboarding(
    nextRequest(context),
    review.version,
  );
  const duplicate = await service.confirmOnboarding(
    nextRequest(context),
    review.version,
  );
  const restarted = await service.startOnboarding(nextRequest(context));
  assert.equal(duplicate.outcome, 'existing');
  assert.equal(duplicate.store.id, first.store.id);
  assert.equal(restarted.status, 'completed');
  assert.equal(restarted.store?.id, first.store.id);
  assert.equal(fixture.value('SELECT COUNT(*) FROM organizations'), 1);
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_stores'), 1);
  assert.equal(fixture.value('SELECT COUNT(*) FROM telegram_agent_routes'), 1);
});

test('tenant store requires the active owner and hides another tenant store', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const contextA = await identityContext(db, '1012');
  const contextB = await identityContext(db, '1013');
  const service = createSotuvchiOnboardingService(db);
  const reviewA = await advanceToReview(service, contextA);
  const storeA = (await service.confirmOnboarding(
    nextRequest(contextA),
    reviewA.version,
  )).store;
  const reviewB = await advanceToReview(service, contextB);
  const storeB = (await service.confirmOnboarding(
    nextRequest(contextB),
    reviewB.version,
  )).store;
  const store = createSotuvchiOnboardingStore(db);
  assert.equal(await store.getOwnedStore(storeB.orgId, contextA.identityId), null);
  assert.equal((await store.getOwnedStore(storeA.orgId, contextA.identityId))?.id, storeA.id);
});

test('identity A cannot mutate B and agent context cannot override orgId', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const contextA = await identityContext(db, '1014');
  const contextB = await identityContext(db, '1015');
  const service = createSotuvchiOnboardingService(db);
  await service.startOnboarding(contextA);
  const onboardingB = await service.startOnboarding(contextB);
  const store = createSotuvchiOnboardingStore(db);
  await assert.rejects(
    () => store.completeStoreWithRoute(
      onboardingB.orgId,
      contextA.identityId,
      {
        name: 'Foreign Store',
        locale: 'ru',
        deliveryMode: 'pickup',
        paymentMethods: ['cash'],
        storefrontCode: 's-eeeeeeeeeeeeeeee',
        botUsername: BOT,
      },
    ),
    SotuvchiOnboardingError,
  );
  await assert.rejects(
    () => service.getOnboarding({
      ...nextRequest(contextA),
      orgId: onboardingB.orgId,
    }),
    SotuvchiOnboardingError,
  );
});

test('known route resolves its tenant and unknown route fails closed', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const context = await identityContext(db, '1016', 'uz');
  const service = createSotuvchiOnboardingService(db, {
    storefrontCodeGenerator: () => 's-ffffffffffffffff',
  });
  const review = await advanceToReview(service, context, { locale: 'uz' });
  const completed = await service.confirmOnboarding(
    nextRequest(context),
    review.version,
  );
  await activatePilotStore(
    db,
    completed.store.orgId,
    completed.store.id,
  );
  assert.deepEqual(
    await service.resolveStorefrontRoute(BOT, completed.store.storefrontCode),
    {
      orgId: completed.store.orgId,
      agentId: 'sotuvchi',
      locale: 'uz',
      storeId: completed.store.id,
    },
  );
  assert.deepEqual(
    await service.resolveDirectPilotStorefront(BOT),
    {
      orgId: completed.store.orgId,
      agentId: 'sotuvchi',
      locale: 'uz',
      storeId: completed.store.id,
    },
  );
  await setPilotStoreState(
    db,
    completed.store.orgId,
    completed.store.id,
    'paused',
  );
  assert.equal(
    await service.resolveStorefrontRoute(BOT, completed.store.storefrontCode),
    null,
  );
  assert.equal(await service.resolveDirectPilotStorefront(BOT), null);
  assert.equal(
    await service.resolveStorefrontRoute(BOT, 's-gggggggggggggggg'),
    null,
  );
});

test('Sotuvchi manifest keeps onboarding, catalog and one checkout entry', () => {
  assert.equal(sotuvchiAgentManifest.id, 'sotuvchi');
  assert.deepEqual(
    sotuvchiAgentManifest.capabilities,
    ['store.onboarding', 'store.catalog', 'commerce.order', 'handoff'],
  );
  assert.ok(sotuvchiAgentManifest.tools.length > 0);
  assert.ok(sotuvchiAgentManifest.tools.every((tool) =>
    tool.name.startsWith('catalog.')
    || tool.name.startsWith('checkout.')
    || tool.name.startsWith('seller.')
    || tool.name.startsWith('handoff.')));
  // Seller order and inventory tools arrived with P2.5 and the human handoff
  // bridge with P2.6; payment and refund surfaces still must not exist. The
  // onboarding workflow does declare an `awaiting_payment` step — that step
  // only records the store's payment-method text, so the scan targets tool
  // names, not the whole tree.
  const names = sotuvchiAgentManifest.tools.map((tool) => tool.name);
  for (const forbidden of ['payment', 'refund', 'cart']) {
    assert.ok(!names.some((name) => name.includes(forbidden)), forbidden);
  }
  const serialized = JSON.stringify(sotuvchiAgentManifest, (_key, value) =>
    typeof value === 'function' ? '[function]' : value).toLowerCase();
  for (const forbidden of ['refund', 'multi_item']) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
});

class MemoryDelivery implements TelegramDeliveryPort {
  readonly sent: Array<{ threadRef: string; text: string; keyboard?: unknown }> = [];
  readonly callbacks: string[] = [];

  async sendText(
    threadRef: string,
    text: string,
    keyboard?: never,
  ): Promise<boolean> {
    this.sent.push({ threadRef, text, ...(keyboard ? { keyboard } : {}) });
    return true;
  }

  async answerCallback(callbackQueryId: string): Promise<boolean> {
    this.callbacks.push(callbackQueryId);
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
      id: `callback-${updateId}`,
      from: { id: userId, language_code: languageCode },
      data: `agent:${actionId}`,
      message: { chat: { id: userId } },
    },
  };
}

function telegramHarness(
  fixture: SqliteD1,
) {
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
  async function authorizeSeller(
    userId: number,
    locale: 'ru' | 'uz',
  ): Promise<void> {
    await ensurePilotStoreSchema(db);
    const identity = await createIdentityService(db).getOrCreateIdentity(
      'telegram',
      String(userId),
    );
    await wiring.onboarding.startOnboarding({
      identityId: identity.identity.id,
      botUsername: BOT,
      requestId: `fixture-preauthorize-${userId}`,
      locale,
    });
  }
  return { authorizeSeller, delivery, invoke, wiring };
}

async function telegramOnboardingFlow(
  harness: ReturnType<typeof telegramHarness>,
  userId: number,
  locale: 'ru' | 'uz',
  firstUpdate: number,
  storeName: string,
) {
  let update = firstUpdate;
  await harness.authorizeSeller(userId, locale);
  await harness.invoke(
    telegramMessage(update++, userId, '/start agent_seller', locale),
  );
  await harness.invoke(
    telegramMessage(update++, userId, storeName, locale),
  );
  await harness.invoke(
    telegramCallback(update++, userId, `locale-${locale}`, locale),
  );
  await harness.invoke(
    telegramCallback(update++, userId, 'delivery-both', locale),
  );
  await harness.invoke(
    telegramCallback(update++, userId, 'payment-cash', locale),
  );
  const confirmUpdate = telegramCallback(
    update++,
    userId,
    'confirm',
    locale,
  );
  await harness.invoke(confirmUpdate);
  return { confirmUpdate, nextUpdate: update };
}

test('Telegram seller start and full Russian flow create one store offline', async () => {
  const fixture = new SqliteD1();
  const harness = telegramHarness(fixture);
  await telegramOnboardingFlow(harness, 2001, 'ru', 200, 'Тестовый Магазин');
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_stores'), 1);
  assert.equal(fixture.value('SELECT COUNT(*) FROM telegram_agent_routes'), 1);
  assert.ok(harness.delivery.sent.some((message) =>
    message.text.includes('Магазин создан')));
});

test('Telegram Uzbek Latin flow remains deterministic and persistent', async () => {
  const fixture = new SqliteD1();
  const harness = telegramHarness(fixture);
  await telegramOnboardingFlow(harness, 2002, 'uz', 300, 'Sinov Do‘kon');
  assert.equal(fixture.value('SELECT locale FROM sotuvchi_stores'), 'uz');
  assert.ok(harness.delivery.sent.some((message) =>
    message.text.includes('Do‘kon yaratildi')));
});

test('mixed store name is accepted without leaking Telegram profile data', async () => {
  const fixture = new SqliteD1();
  const harness = telegramHarness(fixture);
  await harness.authorizeSeller(2003, 'ru');
  await harness.invoke(
    telegramMessage(400, 2003, '/start agent_seller', 'ru'),
  );
  await harness.invoke(
    telegramMessage(401, 2003, 'Orzu Магазин', 'ru'),
  );
  const row = fixture.rows<{ payload_json: string }>(
    'SELECT payload_json FROM workflow_instances',
  )[0];
  assert.equal(JSON.parse(row.payload_json).storeName, 'Orzu Магазин');
  assert.ok(!row.payload_json.includes('2003'));
});

test('unknown Telegram seller cannot self-provision an organization', async () => {
  const fixture = new SqliteD1();
  const harness = telegramHarness(fixture);
  const response = await harness.invoke(
    telegramMessage(450, 2099, '/start agent_seller', 'ru'),
  );
  assert.equal(response.status, 200);
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_onboardings'), 0);
  assert.equal(fixture.value('SELECT COUNT(*) FROM organizations'), 0);
  assert.equal(fixture.value('SELECT COUNT(*) FROM memberships'), 0);
  assert.equal(fixture.value('SELECT COUNT(*) FROM workflow_instances'), 0);
});

test('duplicate Telegram confirmation cannot create a second store', async () => {
  const fixture = new SqliteD1();
  const harness = telegramHarness(fixture);
  const flow = await telegramOnboardingFlow(
    harness,
    2004,
    'ru',
    500,
    'Duplicate Store',
  );
  const before = harness.delivery.sent.length;
  const duplicate = await harness.invoke(flow.confirmUpdate);
  assert.equal(await duplicate.text(), 'duplicate');
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_stores'), 1);
  assert.equal(fixture.value('SELECT COUNT(*) FROM telegram_agent_routes'), 1);
  assert.equal(harness.delivery.sent.length, before);
  assert.ok(
    fixture.value(
      'SELECT COUNT(*) FROM telegram_agent_updates WHERE idempotency_key = ?',
      telegramAgentUpdateKey(BOT, 505),
    ) === 1,
  );
});

test('buyer storefront route resolves the store but never launches seller onboarding', async () => {
  const fixture = new SqliteD1();
  const harness = telegramHarness(fixture);
  const flow = await telegramOnboardingFlow(
    harness,
    2005,
    'ru',
    600,
    'Buyer Route Store',
  );
  const code = String(
    fixture.value('SELECT storefront_code FROM sotuvchi_stores'),
  );
  await activatePilotStore(
    fixture.asD1(),
    String(fixture.value('SELECT org_id FROM sotuvchi_stores')),
    String(fixture.value('SELECT id FROM sotuvchi_stores')),
  );
  const beforeOnboardings = fixture.value(
    'SELECT COUNT(*) FROM sotuvchi_onboardings',
  );
  await harness.invoke(
    telegramMessage(
      flow.nextUpdate,
      2999,
      `/start agent_${code}`,
      'ru',
    ),
  );
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_onboardings'),
    beforeOnboardings,
  );
  assert.ok(
    harness.delivery.sent.at(-1)?.text.includes(
      'Не нашёл такой товар в этом магазине',
    ),
  );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  onRequestDelete,
  onRequestGet,
  onRequestHead,
  onRequestOptions,
  onRequestPatch,
  onRequestPut,
} from '../functions/api/telegram/agents';
import { demoAgentManifest } from '../functions/agents/demo';
import {
  TelegramAgentsSetupError,
  assertTelegramAgentsBotIdentity,
  buildTelegramAgentsWebhookUrl,
  createTelegramAgentUpdateStore,
  createTelegramRateLimiter,
  createStaticTelegramAgentContextResolver,
  handleTelegramAgentsWebhook,
  ingestTelegramAgentUpdate,
  isProtectedAgentBotUsername,
  parseTelegramDeepLink,
  parseTelegramStartCommand,
  requireTelegramAgentsWebhookSecret,
  TelegramClient,
  telegramRetryDelayMs,
  telegramAgentUpdateKey,
  verifyTelegramSecretHeader,
  type StaticTelegramAgentMapping,
  type TelegramAgentUpdateFailureCode,
  type TelegramAgentUpdateReservation,
  type TelegramAgentUpdateStore,
  type TelegramAgentsSafeLogCode,
  type TelegramAgentsWebhookDependencies,
  type TelegramAgentsTelemetry,
  type TelegramDeliveryPort,
  type TelegramRateLimiter,
  type TelegramIdentityPort,
} from '../functions/channels/telegram';
import type {
  KnowledgeServicePort,
  RuntimeTurnInput,
  RuntimeTurnResult,
} from '../functions/platform/contracts';
import {
  createAgentRegistry,
  createAgentRuntime,
} from '../functions/platform/runtime';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOT = 'agents_demo_bot';
const SECRET = 'fixture-webhook-secret';
const RATE_HASH_KEY = 'fixture-rate-limit-hmac-key-32chars';

class FakeKnowledge implements KnowledgeServicePort {
  readonly calls: Array<{
    orgId: string;
    agentId: string;
    kind: string;
    query: string;
  }> = [];

  async searchItems(
    orgId: string,
    input: {
      agentId: string;
      kind: string;
      query: string;
      limit?: number;
    },
  ) {
    this.calls.push({
      orgId,
      agentId: input.agentId,
      kind: input.kind,
      query: input.query,
    });
    const found = orgId === 'org-a'
      && input.agentId === 'demo'
      && input.kind === 'demo-item'
      && /alpha|альфа/iu.test(input.query);
    return found
      ? [{
          item: {
            id: 'demo-item-alpha',
            status: 'active',
            payload: { name: 'Alpha Service', status: 'available' },
          },
          score: 4_000,
          matchedTokens: 1,
        }]
      : [];
  }
}

class MemoryUpdates implements TelegramAgentUpdateStore {
  readonly reserved = new Set<string>();
  readonly statuses = new Map<string, string>();
  reserveCalls = 0;

  async reserve(
    botUsername: string,
    updateId: number,
  ): Promise<TelegramAgentUpdateReservation> {
    this.reserveCalls++;
    const idempotencyKey = telegramAgentUpdateKey(botUsername, updateId);
    if (this.reserved.has(idempotencyKey)) {
      return { status: 'duplicate', idempotencyKey };
    }
    this.reserved.add(idempotencyKey);
    this.statuses.set(idempotencyKey, 'reserved');
    return { status: 'reserved', idempotencyKey };
  }

  async complete(idempotencyKey: string): Promise<void> {
    this.statuses.set(idempotencyKey, 'completed');
  }

  async fail(
    idempotencyKey: string,
    code: TelegramAgentUpdateFailureCode,
  ): Promise<void> {
    this.statuses.set(idempotencyKey, `failed:${code}`);
  }
}

class DedupD1 {
  readonly rows = new Map<string, { status: string; errorCode?: string }>();

  prepare(sql: string) {
    let bindings: unknown[] = [];
    return {
      bind: (...values: unknown[]) => {
        bindings = values;
        return this.prepareBound(sql, () => bindings);
      },
      run: async () => ({ meta: { changes: 0 } }),
    };
  }

  private prepareBound(sql: string, values: () => unknown[]) {
    return {
      bind: (...next: unknown[]) => this.prepareBound(sql, () => next),
      run: async () => {
        const bound = values();
        if (/INSERT OR IGNORE INTO telegram_agent_updates/.test(sql)) {
          const key = String(bound[0]);
          if (this.rows.has(key)) return { meta: { changes: 0 } };
          this.rows.set(key, { status: 'reserved' });
          return { meta: { changes: 1 } };
        }
        if (/SET status = 'completed'/.test(sql)) {
          const key = String(bound[1]);
          const row = this.rows.get(key);
          if (row?.status === 'reserved') row.status = 'completed';
          return { meta: { changes: row ? 1 : 0 } };
        }
        if (/SET status = 'failed'/.test(sql)) {
          const key = String(bound[2]);
          const row = this.rows.get(key);
          if (row?.status === 'reserved') {
            row.status = 'failed';
            row.errorCode = String(bound[0]);
          }
          return { meta: { changes: row ? 1 : 0 } };
        }
        return { meta: { changes: 0 } };
      },
    };
  }
}

class MemoryDelivery implements TelegramDeliveryPort {
  readonly sent: Array<{
    threadRef: string;
    text: string;
    keyboard?: unknown;
  }> = [];
  readonly typing: string[] = [];
  readonly callbacks: string[] = [];
  succeeds = true;

  async sendText(
    threadRef: string,
    text: string,
    keyboard?: never,
  ): Promise<boolean> {
    this.sent.push({ threadRef, text, ...(keyboard ? { keyboard } : {}) });
    return this.succeeds;
  }

  async showTyping(threadRef: string): Promise<boolean> {
    this.typing.push(threadRef);
    return this.succeeds;
  }

  async answerCallback(callbackQueryId: string): Promise<boolean> {
    this.callbacks.push(callbackQueryId);
    return this.succeeds;
  }
}

interface HarnessOptions {
  mappings?: readonly StaticTelegramAgentMapping[];
  runtime?: { run(input: unknown): Promise<RuntimeTurnResult> };
  identityId?: string;
  rateLimiter?: TelegramRateLimiter;
  telemetry?: TelegramAgentsTelemetry;
}

function telegramMessage(
  updateId: number,
  text: string,
  options: {
    userId?: number;
    languageCode?: string;
  } = {},
) {
  const userId = options.userId ?? 101;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: userId, type: 'private' },
      from: {
        id: userId,
        language_code: options.languageCode ?? 'ru',
        username: 'raw-profile-must-not-pass',
        first_name: 'Raw Name',
      },
      text,
    },
  };
}

function defaultMappings(): readonly StaticTelegramAgentMapping[] {
  return [{
    botUsername: BOT,
    routeCode: 'demo',
    orgId: 'org-a',
    agentId: 'demo',
    allowedIdentityIds: ['identity-101'],
  }];
}

function createHarness(options: HarnessOptions = {}) {
  const knowledge = new FakeKnowledge();
  const actualRuntime = createAgentRuntime({
    registry: createAgentRegistry([demoAgentManifest]),
    services: { knowledge },
  });
  const runtimeCalls: RuntimeTurnInput[] = [];
  const runtime = options.runtime ?? {
    async run(input: unknown) {
      runtimeCalls.push(input as RuntimeTurnInput);
      return actualRuntime.run(input);
    },
  };
  const updates = new MemoryUpdates();
  const delivery = new MemoryDelivery();
  const identityCalls: string[] = [];
  const identities: TelegramIdentityPort = {
    async resolveTelegramIdentity(externalId) {
      identityCalls.push(externalId);
      return {
        identityId: options.identityId ?? `identity-${externalId}`,
      };
    },
  };
  const logCodes: TelegramAgentsSafeLogCode[] = [];
  const dependencies: TelegramAgentsWebhookDependencies = {
    botUsername: BOT,
    webhookSecret: SECRET,
    updates,
    identities,
    contexts: createStaticTelegramAgentContextResolver(
      options.mappings ?? defaultMappings(),
    ),
    runtime,
    delivery,
    ...(options.rateLimiter ? { rateLimiter: options.rateLimiter } : {}),
    ...(options.telemetry ? { telemetry: options.telemetry } : {}),
    logger: { error: (code) => logCodes.push(code) },
  };
  const scheduled: Promise<unknown>[] = [];

  async function invoke(
    raw: unknown,
    invokeOptions: {
      method?: string;
      secret?: string | null;
      rawBody?: string;
    } = {},
  ) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (invokeOptions.secret !== null) {
      headers.set(
        'X-Telegram-Bot-Api-Secret-Token',
        invokeOptions.secret ?? SECRET,
      );
    }
    const request = new Request('https://gptbot.uz/api/telegram/agents', {
      method: invokeOptions.method ?? 'POST',
      headers,
      ...((invokeOptions.method ?? 'POST') === 'POST'
        ? { body: invokeOptions.rawBody ?? JSON.stringify(raw) }
        : {}),
    });
    const result = await handleTelegramAgentsWebhook(
      request,
      dependencies,
      (promise) => scheduled.push(promise),
    );
    await Promise.all(scheduled.splice(0));
    return result;
  }

  return {
    dependencies,
    delivery,
    identityCalls,
    invoke,
    knowledge,
    logCodes,
    runtimeCalls,
    updates,
  };
}

test('every non-POST method is rejected with a controlled 405', async () => {
  for (const handler of [
    onRequestGet,
    onRequestPut,
    onRequestDelete,
    onRequestPatch,
    onRequestHead,
    onRequestOptions,
  ]) {
    const response = await handler({} as never);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  }
});

test('missing and wrong secrets are internally distinct but externally 401', async () => {
  const harness = createHarness();
  const missingRequest = new Request('https://gptbot.uz/api/telegram/agents', {
    method: 'POST',
  });
  const wrongRequest = new Request('https://gptbot.uz/api/telegram/agents', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': 'wrong-fixture' },
  });
  assert.deepEqual(
    verifyTelegramSecretHeader(missingRequest, SECRET),
    { status: 'invalid', code: 'missing_secret' },
  );
  assert.deepEqual(
    verifyTelegramSecretHeader(wrongRequest, SECRET),
    { status: 'invalid', code: 'wrong_secret' },
  );
  assert.equal((await harness.invoke({}, { secret: null })).status, 401);
  assert.equal((await harness.invoke({}, { secret: 'wrong-fixture' })).status, 401);
  assert.equal(harness.updates.reserveCalls, 0);
});

test('correct secret accepts a validated update', async () => {
  const harness = createHarness();
  const result = await harness.invoke(telegramMessage(1, 'echo: hello'));
  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'accepted');
  assert.equal(harness.runtimeCalls.length, 1);
});

test('malformed JSON is controlled and never reserved', async () => {
  const harness = createHarness();
  const result = await harness.invoke({}, { rawBody: '{"broken":' });
  assert.equal(result.status, 400);
  assert.equal(harness.updates.reserveCalls, 0);
});

test('raw malformed body and webhook secret are never logged', async () => {
  const harness = createHarness();
  const raw = '{"private-message-marker":';
  await harness.invoke({}, { rawBody: raw });
  assert.deepEqual(harness.logCodes, []);
  assert.ok(!JSON.stringify(harness.logCodes).includes(raw));
  assert.ok(!JSON.stringify(harness.logCodes).includes(SECRET));
});

test('first update runs Runtime once and sends once', async () => {
  const harness = createHarness();
  await harness.invoke(telegramMessage(10, 'echo: hello'));
  assert.equal(harness.runtimeCalls.length, 1);
  assert.deepEqual(
    harness.delivery.sent.map((message) => message.text),
    ['hello'],
  );
  assert.equal(
    harness.updates.statuses.get(telegramAgentUpdateKey(BOT, 10)),
    'completed',
  );
});

test('duplicate update does not call Runtime or send twice', async () => {
  const harness = createHarness();
  await harness.invoke(telegramMessage(11, 'echo: once'));
  const duplicate = await harness.invoke(telegramMessage(11, 'echo: twice'));
  assert.equal(await duplicate.text(), 'duplicate');
  assert.equal(harness.runtimeCalls.length, 1);
  assert.equal(harness.delivery.sent.length, 1);
  assert.equal(harness.delivery.sent[0].text, 'once');
});

test('rate-limited update gets one localized answer and never reaches Runtime', async () => {
  const limiter: TelegramRateLimiter = {
    async consume() {
      return { status: 'limited', retryAfterSeconds: 30, notify: true };
    },
    async consumeTenant() {
      throw new Error('tenant limiter must not run');
    },
  };
  const harness = createHarness({ rateLimiter: limiter });
  await harness.invoke(telegramMessage(111, 'echo: too many'));
  assert.equal(harness.runtimeCalls.length, 0);
  assert.equal(harness.delivery.sent.length, 1);
  assert.match(harness.delivery.sent[0].text, /много запросов/iu);
  assert.deepEqual(harness.logCodes, ['rate_limited']);
  assert.equal(
    harness.updates.statuses.get(telegramAgentUpdateKey(BOT, 111)),
    'failed:rate_limited',
  );
});

test('tenant rate limit stays content-free and does not inflate error events', async () => {
  const limiter: TelegramRateLimiter = {
    async consume() {
      return { status: 'allowed' };
    },
    async consumeTenant() {
      return { status: 'limited', retryAfterSeconds: 30, notify: true };
    },
  };
  const telemetry: Parameters<TelegramAgentsTelemetry['recordError']>[0][] = [];
  const harness = createHarness({
    rateLimiter: limiter,
    telemetry: {
      async recordError(input) {
        telemetry.push(input);
      },
    },
  });
  await harness.invoke(telegramMessage(112, 'echo: tenant limited'));
  assert.equal(harness.runtimeCalls.length, 0);
  assert.equal(telemetry.length, 0);
  assert.ok(!JSON.stringify(telemetry).includes('tenant limited'));
  assert.ok(!JSON.stringify(telemetry).includes('101'));
});

test('rate-limit storage failure fails closed before identity and Runtime', async () => {
  const limiter: TelegramRateLimiter = {
    async consume() {
      throw new Error('database detail must stay private');
    },
    async consumeTenant() {
      return { status: 'allowed' };
    },
  };
  const harness = createHarness({ rateLimiter: limiter });
  await harness.invoke(telegramMessage(113, 'echo: never run'));
  assert.equal(harness.identityCalls.length, 0);
  assert.equal(harness.runtimeCalls.length, 0);
  assert.deepEqual(harness.logCodes, ['rate_limit_failed']);
  assert.ok(!JSON.stringify(harness.delivery.sent).includes('database detail'));
});

test('Agents dedup namespace cannot collide with Javob numeric updates', () => {
  const key = telegramAgentUpdateKey(BOT, 12);
  assert.equal(key, `agents:${BOT}:12`);
  assert.notEqual(key, '12');
  assert.ok(!key.startsWith('assistant:'));
});

test('D1 dedup store reserves once and keeps terminal status', async () => {
  const db = new DedupD1();
  const store = createTelegramAgentUpdateStore(
    db as unknown as D1Database,
  );
  const first = await store.reserve(BOT, 121);
  const duplicate = await store.reserve(BOT, 121);
  assert.equal(first.status, 'reserved');
  assert.equal(duplicate.status, 'duplicate');
  await store.complete(first.idempotencyKey);
  assert.equal(db.rows.get(first.idempotencyKey)?.status, 'completed');

  const failed = await store.reserve(BOT, 122);
  await store.fail(failed.idempotencyKey, 'send_failed');
  assert.deepEqual(db.rows.get(failed.idempotencyKey), {
    status: 'failed',
    errorCode: 'send_failed',
  });
});

test('D1 update metrics count duplicates without storing Telegram identity', async () => {
  const fixture = new SqliteD1();
  fixture.exec(fs.readFileSync(
    path.join(ROOT, 'migrations/0017_telegram_agents_transport.sql'),
    'utf8',
  ));
  fixture.exec(fs.readFileSync(
    path.join(ROOT, 'migrations/0030_market_telegram_reliability.sql'),
    'utf8',
  ));
  const store = createTelegramAgentUpdateStore(fixture.asD1());
  const first = await store.reserve(BOT, 9121);
  await store.reserve(BOT, 9121);
  await store.reserve(BOT, 9121);
  await store.complete(first.idempotencyKey);

  assert.equal(
    fixture.value(
      'SELECT duplicate_count FROM telegram_agent_update_metrics',
    ),
    2,
  );
  assert.ok(Number(fixture.value(
    'SELECT processing_ms FROM telegram_agent_update_metrics',
  )) >= 0);
  assert.deepEqual(
    fixture.rows<{ name: string }>(
      'PRAGMA table_info(telegram_agent_update_metrics)',
    ).map((row) => row.name),
    [
      'idempotency_key',
      'bot_username',
      'duplicate_count',
      'processing_ms',
      'updated_at',
    ],
  );
});

test('rate limiter hashes user, chat, bot and tenant scopes', async () => {
  const fixture = new SqliteD1();
  const limiter = createTelegramRateLimiter(fixture.asD1(), {
    hashKey: RATE_HASH_KEY,
    perUser: 2,
    perChat: 3,
    perBot: 10,
    perTenant: 2,
    callbacksPerScope: 2,
    now: () => new Date('2026-07-31T12:00:15.000Z'),
  });
  const input = {
    botUsername: BOT,
    externalId: '778899',
    threadRef: '778899',
    callback: false,
  };
  assert.deepEqual(await limiter.consume(input), { status: 'allowed' });
  assert.deepEqual(await limiter.consume(input), { status: 'allowed' });
  assert.deepEqual(await limiter.consume(input), {
    status: 'limited',
    retryAfterSeconds: 45,
    notify: true,
  });
  assert.deepEqual(
    await limiter.consumeTenant({ orgId: 'org-a', callback: false }),
    { status: 'allowed' },
  );
  assert.deepEqual(
    await limiter.consumeTenant({ orgId: 'org-a', callback: false }),
    { status: 'allowed' },
  );
  const firstLimited = await limiter.consumeTenant({
    orgId: 'org-a',
    callback: false,
  });
  assert.deepEqual(firstLimited, {
    status: 'limited',
    retryAfterSeconds: 45,
    notify: true,
  });
  const repeatedLimited = await limiter.consumeTenant({
    orgId: 'org-a',
    callback: false,
  });
  assert.deepEqual(repeatedLimited, {
    status: 'limited',
    retryAfterSeconds: 45,
    notify: false,
  });
  const serialized = JSON.stringify(
    fixture.rows<Record<string, unknown>>(
      'SELECT * FROM telegram_agent_rate_limits',
    ),
  );
  assert.ok(!serialized.includes('778899'));
  assert.ok(!serialized.includes('org-a'));
  assert.match(
    String(fixture.value(
      'SELECT scope_key FROM telegram_agent_rate_limits LIMIT 1',
    )),
    /^[a-f0-9]{64}$/,
  );
});

test('callback rate limit is independent and resets in the next window', async () => {
  const fixture = new SqliteD1();
  let now = new Date('2026-07-31T12:00:15.000Z');
  const limiter = createTelegramRateLimiter(fixture.asD1(), {
    hashKey: RATE_HASH_KEY,
    perUser: 10,
    perChat: 10,
    perBot: 10,
    perTenant: 10,
    callbacksPerScope: 1,
    now: () => now,
  });
  const input = {
    botUsername: BOT,
    externalId: '445566',
    threadRef: '445566',
    callback: true,
  };
  assert.equal((await limiter.consume(input)).status, 'allowed');
  assert.equal((await limiter.consume(input)).status, 'limited');
  now = new Date('2026-07-31T12:01:00.000Z');
  assert.equal((await limiter.consume(input)).status, 'allowed');
});

test('rate limiter rejects a missing or weak server-side hash key', () => {
  const fixture = new SqliteD1();
  assert.throws(
    () => createTelegramRateLimiter(
      fixture.asD1(),
      { hashKey: 'too-short' },
    ),
    /telegram rate limit rejected/,
  );
});

test('runtime dedup schema and additive migration use the same isolated objects', () => {
  const schema = fs.readFileSync(
    path.join(ROOT, 'functions/channels/telegram/schema.ts'),
    'utf8',
  );
  const migration = fs.readFileSync(
    path.join(ROOT, 'migrations/0017_telegram_agents_transport.sql'),
    'utf8',
  );
  const reliability = fs.readFileSync(
    path.join(ROOT, 'migrations/0030_market_telegram_reliability.sql'),
    'utf8',
  );
  for (const objectName of [
    'telegram_agent_updates',
    'idx_telegram_agent_updates_status',
  ]) {
    assert.ok(schema.includes(objectName));
    assert.ok(migration.includes(objectName));
  }
  for (const objectName of [
    'telegram_agent_update_metrics',
    'idx_telegram_agent_update_metrics_updated',
    'telegram_agent_rate_limits',
    'idx_telegram_agent_rate_limits_updated',
    'telegram_agent_rate_limit_notices',
    'idx_telegram_agent_rate_limit_notices_created',
  ]) {
    assert.ok(schema.includes(objectName));
    assert.ok(reliability.includes(objectName));
  }
  const executable = reliability.replace(/--.*$/gm, '');
  assert.doesNotMatch(executable, /\b(?:DROP|TRUNCATE|ALTER)\b/i);
  const fixture = new SqliteD1();
  fixture.exec(migration);
  fixture.exec(reliability);
  fixture.exec(reliability);
  assert.equal(
    fixture.value(
      `SELECT COUNT(*) FROM sqlite_master
       WHERE name IN (
         'telegram_agent_update_metrics',
         'telegram_agent_rate_limits',
         'telegram_agent_rate_limit_notices'
       )`,
    ),
    3,
  );
  assert.ok(!schema.includes('telegram_updates ('));
});

test('malformed update is not written as processed', async () => {
  const harness = createHarness();
  const response = await harness.invoke({ update_id: '13', message: {} });
  assert.equal(response.status, 400);
  assert.equal(harness.updates.reserved.size, 0);
});

test('valid /start payload and t.me deep link resolve the same route code', () => {
  assert.deepEqual(
    parseTelegramStartCommand('/start agent_demo'),
    { status: 'valid', payload: 'agent_demo', routeCode: 'demo' },
  );
  assert.deepEqual(
    parseTelegramDeepLink(`https://t.me/${BOT}?start=agent_demo`, BOT),
    { status: 'valid', payload: 'agent_demo', routeCode: 'demo' },
  );
});

test('start payload rejects invalid charset and oversized input', () => {
  assert.equal(
    parseTelegramStartCommand('/start agent_demo_org').status,
    'invalid',
  );
  assert.equal(
    parseTelegramStartCommand(`/start agent_${'a'.repeat(70)}`).status,
    'invalid',
  );
});

test('deep link rejects arbitrary hosts, bot mismatch and extra parameters', () => {
  assert.equal(
    parseTelegramDeepLink('https://example.com/?start=agent_demo', BOT).status,
    'invalid',
  );
  assert.equal(
    parseTelegramDeepLink('https://t.me/another_bot?start=agent_demo', BOT).status,
    'invalid',
  );
  assert.equal(
    parseTelegramDeepLink(
      `https://t.me/${BOT}?start=agent_demo&org=org-b`,
      BOT,
    ).status,
    'invalid',
  );
});

test('unknown mapping sends a controlled response without Runtime', async () => {
  const harness = createHarness({ mappings: defaultMappings() });
  await harness.invoke(telegramMessage(20, '/start agent_unknown'));
  assert.equal(harness.runtimeCalls.length, 0);
  assert.equal(harness.delivery.sent.length, 1);
  assert.ok(!harness.delivery.sent[0].text.includes('agent_unknown'));
});

test('org and agent override-shaped payloads cannot select context', async () => {
  const harness = createHarness();
  await harness.invoke(
    telegramMessage(21, '/start agent_demo_org-b'),
  );
  await harness.invoke(
    telegramMessage(22, '/start agent_sotuvchi'),
  );
  assert.equal(harness.runtimeCalls.length, 0);
});

test('text is normalized without Telegram profile fields', () => {
  const result = ingestTelegramAgentUpdate(
    telegramMessage(30, 'echo: hello'),
    BOT,
  );
  assert.equal(result.status, 'accepted');
  if (result.status !== 'accepted') return;
  assert.deepEqual(result.value.runtimeMessage, {
    kind: 'text',
    text: 'echo: hello',
  });
  assert.deepEqual(result.value.inbound.identity, {
    channel: 'telegram',
    externalId: '101',
  });
  assert.ok(!JSON.stringify(result.value).includes('raw-profile-must-not-pass'));
  assert.ok(!JSON.stringify(result.value).includes('Raw Name'));
});

test('/start is normalized to a provider-neutral action', () => {
  const result = ingestTelegramAgentUpdate(
    telegramMessage(31, '/start agent_demo'),
    BOT,
  );
  assert.equal(result.status, 'accepted');
  if (result.status !== 'accepted') return;
  assert.deepEqual(result.value.runtimeMessage, {
    kind: 'action',
    actionId: 'start',
  });
  assert.equal(result.value.startPayload, 'agent_demo');
});

test('product commands normalize to bounded provider-neutral actions', () => {
  for (const [command, actionId] of [
    ['/catalog', 'buyer-catalog-open'],
    ['/orders', 'buyer-orders'],
    ['/help', 'buyer-help'],
    ['/language', 'buyer-language'],
    [`/catalog@${BOT}`, 'buyer-catalog-open'],
    ['/unknown', 'buyer-help'],
  ] as const) {
    const result = ingestTelegramAgentUpdate(
      telegramMessage(310, command),
      BOT,
    );
    assert.equal(result.status, 'accepted', command);
    if (result.status !== 'accepted') continue;
    assert.deepEqual(result.value.runtimeMessage, {
      kind: 'action',
      actionId,
    }, command);
  }
});

test('Telegram user id is passed to Identity only as a string', async () => {
  const harness = createHarness();
  await harness.invoke(telegramMessage(32, 'echo: hello', { userId: 101 }));
  assert.deepEqual(harness.identityCalls, ['101']);
  assert.equal(typeof harness.identityCalls[0], 'string');
});

test('unsupported media update is ignored without dedup or Runtime', async () => {
  const harness = createHarness();
  const update = telegramMessage(33, 'placeholder') as Record<string, unknown>;
  const message = update.message as Record<string, unknown>;
  delete message.text;
  message.voice = { file_id: 'fixture-file' };
  const response = await harness.invoke(update);
  assert.equal(await response.text(), 'ignored');
  assert.equal(harness.updates.reserveCalls, 0);
  assert.equal(harness.runtimeCalls.length, 0);
});

test('prompt length and control characters are bounded before reservation', async () => {
  const harness = createHarness();
  const accepted = await harness.invoke(telegramMessage(401, 'я'.repeat(2_000)));
  const tooLong = await harness.invoke(telegramMessage(402, 'я'.repeat(2_001)));
  const controls = await harness.invoke(telegramMessage(403, 'товар\u0000скрытый'));
  assert.equal(await accepted.text(), 'accepted');
  assert.equal(await tooLong.text(), 'ignored');
  assert.equal(await controls.text(), 'ignored');
  assert.equal(harness.updates.reserveCalls, 1);
});

test('callback query is normalized to a bounded action and acknowledged', async () => {
  const harness = createHarness();
  const response = await harness.invoke({
    update_id: 34,
    callback_query: {
      id: 'callback-fixture',
      from: { id: 101, language_code: 'ru' },
      data: 'agent:choose-one',
      message: { chat: { id: 101 } },
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(harness.delivery.callbacks, ['callback-fixture']);
  assert.deepEqual(harness.delivery.typing, []);
  assert.deepEqual(harness.runtimeCalls[0].message, {
    kind: 'action',
    actionId: 'choose-one',
  });
});

test('callback acknowledgement is not serialized before Runtime work', async () => {
  const harness = createHarness();
  const order: string[] = [];
  harness.dependencies.delivery.answerCallback = async () => {
    order.push('acknowledgement-started');
    await new Promise((resolve) => setTimeout(resolve, 50));
    order.push('acknowledgement-finished');
    return true;
  };
  const run = harness.dependencies.runtime.run.bind(
    harness.dependencies.runtime,
  );
  harness.dependencies.runtime.run = async (input) => {
    order.push('runtime-started');
    return run(input);
  };
  const response = await harness.invoke({
    update_id: 341,
    callback_query: {
      id: 'callback-slow-fixture',
      from: { id: 101, language_code: 'ru' },
      data: 'agent:choose-one',
      message: { chat: { id: 101 } },
    },
  });
  assert.equal(response.status, 200);
  assert.ok(
    order.indexOf('runtime-started')
      < order.indexOf('acknowledgement-finished'),
  );
  assert.equal(harness.runtimeCalls.length, 1);
  assert.equal(harness.delivery.sent.length, 1);
});

test('echo works through endpoint, Runtime and Telegram renderer', async () => {
  const harness = createHarness();
  await harness.invoke(telegramMessage(40, 'echo: Assalomu alaykum'));
  assert.equal(harness.delivery.sent[0].text, 'Assalomu alaykum');
});

test('Russian knowledge lookup works end-to-end', async () => {
  const harness = createHarness();
  await harness.invoke(telegramMessage(41, 'Расскажи про Альфа'));
  assert.equal(
    harness.delivery.sent[0].text,
    'Найдено: Alpha Service. Статус: available.',
  );
});

test('Uzbek Latin knowledge lookup uses Uzbek template', async () => {
  const harness = createHarness();
  await harness.invoke(
    telegramMessage(42, 'Alpha haqida ayting', { languageCode: 'uz' }),
  );
  assert.equal(
    harness.delivery.sent[0].text,
    'Topildi: Alpha Service. Holat: available.',
  );
  assert.equal(harness.runtimeCalls[0].locale, 'uz');
});

test('mixed RU and Uzbek Latin lookup stays grounded', async () => {
  const harness = createHarness();
  await harness.invoke(
    telegramMessage(43, 'Покажи Alpha xizmati', { languageCode: 'ru' }),
  );
  assert.ok(harness.delivery.sent[0].text.includes('Alpha Service'));
});

test('Runtime rejected result is rendered with a safe deterministic fallback', async () => {
  const harness = createHarness({
    runtime: {
      async run() {
        return {
          status: 'rejected',
          messages: [],
          facts: [],
          toolExecutions: [],
          grounding: { status: 'not_required' },
          reasonCode: 'tool_failed',
        };
      },
    },
  });
  await harness.invoke(telegramMessage(44, 'anything'));
  assert.equal(harness.delivery.sent.length, 1);
  assert.ok(!harness.delivery.sent[0].text.includes('tool_failed'));
});

test('Runtime error is content-free and never exposes upstream message', async () => {
  const telemetry: Parameters<TelegramAgentsTelemetry['recordError']>[0][] = [];
  const harness = createHarness({
    runtime: {
      async run() {
        throw new Error('private-runtime-upstream-marker');
      },
    },
    telemetry: {
      async recordError(input) {
        telemetry.push(input);
      },
    },
  });
  await harness.invoke(telegramMessage(45, 'private-inbound-marker'));
  const output = JSON.stringify({
    sent: harness.delivery.sent,
    logs: harness.logCodes,
  });
  assert.ok(!output.includes('private-runtime-upstream-marker'));
  assert.ok(!output.includes('private-inbound-marker'));
  assert.deepEqual(harness.logCodes, ['runtime_failed']);
  assert.equal(telemetry.length, 1);
  assert.equal(telemetry[0].reasonCode, 'runtime_failed');
  assert.equal(telemetry[0].orgId, 'org-a');
  assert.ok(!JSON.stringify(telemetry).includes('private-runtime-upstream-marker'));
  assert.ok(!JSON.stringify(telemetry).includes('private-inbound-marker'));
});

test('long Telegram output is split below the safe transport boundary', async () => {
  const longText = 'a'.repeat(8_100);
  const harness = createHarness({
    runtime: {
      async run() {
        return {
          status: 'answered',
          messages: [{ text: longText }],
          facts: [],
          toolExecutions: [],
          grounding: { status: 'passed' },
        };
      },
    },
  });
  await harness.invoke(telegramMessage(46, 'anything'));
  assert.ok(harness.delivery.sent.length >= 3);
  assert.ok(harness.delivery.sent.every((message) => message.text.length <= 3_900));
  assert.equal(
    harness.delivery.sent.map((message) => message.text).join(''),
    longText,
  );
});

test('channel-neutral choices become bounded Telegram callback buttons', async () => {
  const harness = createHarness({
    runtime: {
      async run() {
        return {
          status: 'answered',
          messages: [{
            text: 'Choose',
            choices: [{ id: 'choice-one', label: 'First choice' }],
          }],
          facts: [],
          toolExecutions: [],
          grounding: { status: 'passed' },
        };
      },
    },
  });
  await harness.invoke(telegramMessage(461, 'anything'));
  assert.deepEqual(harness.delivery.sent[0].keyboard, [[{
    text: 'First choice',
    callback_data: 'agent:choice-one',
  }]]);
});

test('accepted updates show non-blocking Telegram typing feedback', async () => {
  const harness = createHarness();
  await harness.invoke(telegramMessage(462, 'echo: safe'));
  assert.deepEqual(harness.delivery.typing, ['101']);
  assert.equal(harness.delivery.sent.length, 1);
});

test('Runtime input has no Telegram update, chat, token or callback object', async () => {
  const harness = createHarness();
  await harness.invoke(telegramMessage(47, 'echo: safe'));
  const serialized = JSON.stringify(harness.runtimeCalls[0]);
  for (const forbidden of [
    'update_id',
    'chat_id',
    'callback_query',
    'bot_token',
    'username',
    'first_name',
  ]) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
});

test('trusted org A mapping is the only tenant source for Runtime and Knowledge', async () => {
  const harness = createHarness();
  await harness.invoke(telegramMessage(50, 'Alpha'));
  assert.equal(harness.runtimeCalls[0].orgId, 'org-a');
  assert.equal(harness.knowledge.calls[0].orgId, 'org-a');
  assert.ok(!('orgId' in harness.runtimeCalls[0].message));
});

test('org B cannot read org A knowledge through another trusted mapping', async () => {
  const mappings: readonly StaticTelegramAgentMapping[] = [
    ...defaultMappings(),
    {
      botUsername: BOT,
      routeCode: 'demo-b',
      orgId: 'org-b',
      agentId: 'demo',
      allowedIdentityIds: ['identity-202'],
    },
  ];
  const harness = createHarness({ mappings, identityId: 'identity-202' });
  await harness.invoke(telegramMessage(51, 'Alpha', { userId: 202 }));
  assert.equal(harness.knowledge.calls[0].orgId, 'org-b');
  assert.ok(!harness.delivery.sent[0].text.includes('Alpha Service'));
});

test('identity without trusted mapping cannot choose an arbitrary organization', async () => {
  const harness = createHarness({ identityId: 'identity-999' });
  await harness.invoke(telegramMessage(52, 'echo: org-b', { userId: 999 }));
  assert.equal(harness.runtimeCalls.length, 0);
  assert.ok(!harness.delivery.sent[0].text.includes('org-b'));
});

test('unknown mapped agent is controlled by Runtime without disclosure', async () => {
  const mappings: readonly StaticTelegramAgentMapping[] = [{
    botUsername: BOT,
    routeCode: 'missing',
    orgId: 'org-a',
    agentId: 'missing-agent',
    allowedIdentityIds: ['identity-101'],
  }];
  const harness = createHarness({ mappings });
  await harness.invoke(telegramMessage(53, 'hello'));
  assert.equal(harness.delivery.sent.length, 1);
  assert.ok(!harness.delivery.sent[0].text.includes('missing-agent'));
  assert.deepEqual(harness.logCodes, ['runtime_failed']);
});

test('send failure is terminal for dedup and does not rerun Runtime', async () => {
  const harness = createHarness();
  harness.delivery.succeeds = false;
  await harness.invoke(telegramMessage(54, 'echo: once'));
  await harness.invoke(telegramMessage(54, 'echo: twice'));
  assert.equal(harness.runtimeCalls.length, 1);
  assert.equal(
    harness.updates.statuses.get(telegramAgentUpdateKey(BOT, 54)),
    'failed:send_failed',
  );
});

test('Telegram retry policy bounds 429, 5xx and network delays', () => {
  assert.equal(telegramRetryDelayMs(429, 0, 0), 250);
  assert.equal(telegramRetryDelayMs(429, 600, 0), 8_000);
  assert.equal(telegramRetryDelayMs(500, undefined, 0), 2_000);
  assert.equal(telegramRetryDelayMs(503, undefined, 5), 8_000);
  assert.equal(telegramRetryDelayMs(0, undefined, 0), 1_000);
});

test('Telegram client honors 429 retry_after and succeeds on a bounded retry', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let calls = 0;
  const warnings: string[] = [];
  console.warn = (...values: unknown[]) => warnings.push(values.join(' '));
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? Response.json(
          { ok: false, error_code: 429, parameters: { retry_after: 0 } },
          { status: 429 },
        )
      : Response.json({ ok: true, result: { message_id: 1 } });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });
  const result = await new TelegramClient('fixture-token-never-logged')
    .call('sendMessage', {}, { maxRetries: 1, timeoutMs: 1_000 });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(warnings, [
    'tg.sendMessage retry=rate_limited attempt=1 delay_ms=250',
  ]);
  assert.ok(!warnings.join(' ').includes('fixture-token-never-logged'));
});

test('Telegram 403 is terminal and timeout is bounded', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const errors: string[] = [];
  console.error = (...values: unknown[]) => errors.push(values.join(' '));
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json(
      { ok: false, error_code: 403, description: 'blocked by user' },
      { status: 403 },
    );
  };
  const client = new TelegramClient('fixture-token-never-logged');
  const blocked = await client.call('sendMessage', {}, { maxRetries: 3 });
  assert.equal(blocked.ok, false);
  assert.equal(calls, 1);
  assert.ok(!errors.join(' ').includes('blocked by user'));
  assert.ok(!errors.join(' ').includes('fixture-token-never-logged'));

  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
  const startedAt = Date.now();
  const timedOut = await client.call('sendMessage', {}, {
    maxRetries: 0,
    timeoutMs: 1,
  });
  assert.equal(timedOut.ok, false);
  assert.ok(Date.now() - startedAt < 1_000);
  assert.ok(errors.some((entry) => entry.includes('network: AbortError')));
});

test('setup guard rejects every protected production bot username', () => {
  assert.equal(isProtectedAgentBotUsername('aidirectprobot'), true);
  assert.equal(isProtectedAgentBotUsername('@gptbot_javob_bot'), true);
  assert.throws(
    () => assertTelegramAgentsBotIdentity('aidirectprobot', 'aidirectprobot'),
    (error: unknown) =>
      error instanceof TelegramAgentsSetupError
      && error.code === 'protected_username',
  );
  assert.throws(
    () =>
      assertTelegramAgentsBotIdentity(
        'gptbot_javob_bot',
        'gptbot_javob_bot',
      ),
    TelegramAgentsSetupError,
  );
});

test('setup guard requires an exact expected username', () => {
  assert.throws(
    () => assertTelegramAgentsBotIdentity(BOT, 'another_agents_bot'),
    (error: unknown) =>
      error instanceof TelegramAgentsSetupError
      && error.code === 'username_mismatch',
  );
  assert.equal(assertTelegramAgentsBotIdentity(BOT, BOT), BOT);
});

test('setup errors never include secret values', () => {
  const fixture = 'private-secret-fixture';
  assert.throws(
    () => requireTelegramAgentsWebhookSecret(undefined),
    (error: unknown) =>
      error instanceof TelegramAgentsSetupError
      && !error.message.includes(fixture),
  );
  for (const invalid of [
    'too-short',
    'contains whitespace but is long enough',
    `${'a'.repeat(257)}`,
  ]) {
    assert.throws(
      () => requireTelegramAgentsWebhookSecret(invalid),
      (error: unknown) =>
        error instanceof TelegramAgentsSetupError
        && error.code === 'invalid_webhook_secret'
        && !error.message.includes(invalid),
    );
  }
});

test('setup webhook URL is locked to the Agents endpoint', () => {
  assert.equal(
    buildTelegramAgentsWebhookUrl('https://gptbot.uz'),
    'https://gptbot.uz/api/telegram/agents',
  );
  assert.throws(
    () => buildTelegramAgentsWebhookUrl('https://gptbot.uz/other'),
    TelegramAgentsSetupError,
  );
});

test('setup script uses only isolated env names and supports dry-run', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'scripts/telegram-agents-setup.ts'),
    'utf8',
  );
  assert.match(source, /TELEGRAM_AGENTS_BOT_TOKEN/);
  assert.match(source, /TELEGRAM_AGENTS_WEBHOOK_SECRET/);
  assert.match(source, /TELEGRAM_AGENTS_BOT_USERNAME/);
  assert.match(source, /--dry-run/);
  assert.ok(!source.includes('TELEGRAM_ASSISTANT_BOT_TOKEN'));
  assert.ok(!source.includes('TELEGRAM_BOT_TOKEN'));
  assert.ok(source.indexOf('verifiedIdentity') < source.indexOf('setWebhook'));
});

test('route wires production agents beside the route-local demo registry', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'functions/api/telegram/agents.ts'),
    'utf8',
  );
  const registry = fs.readFileSync(
    path.join(ROOT, 'functions/agents/registry.ts'),
    'utf8',
  );
  assert.match(source, /demoAgentManifest/);
  assert.match(source, /\.\.\.listAgents\(\)/);
  assert.match(registry, /sotuvchiAgentManifest/);
  assert.ok(!registry.includes("from './demo'"));
  assert.ok(!registry.includes('demoAgentManifest'));
});

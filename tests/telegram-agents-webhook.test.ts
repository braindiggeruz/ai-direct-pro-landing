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
  createStaticTelegramAgentContextResolver,
  handleTelegramAgentsWebhook,
  ingestTelegramAgentUpdate,
  isProtectedAgentBotUsername,
  parseTelegramDeepLink,
  parseTelegramStartCommand,
  requireTelegramAgentsWebhookSecret,
  telegramAgentUpdateKey,
  verifyTelegramSecretHeader,
  type StaticTelegramAgentMapping,
  type TelegramAgentUpdateFailureCode,
  type TelegramAgentUpdateReservation,
  type TelegramAgentUpdateStore,
  type TelegramAgentsSafeLogCode,
  type TelegramAgentsWebhookDependencies,
  type TelegramDeliveryPort,
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

const ROOT = path.resolve(import.meta.dirname, '..');
const BOT = 'agents_demo_bot';
const SECRET = 'fixture-webhook-secret';

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

  async answerCallback(callbackQueryId: string): Promise<boolean> {
    this.callbacks.push(callbackQueryId);
    return this.succeeds;
  }
}

interface HarnessOptions {
  mappings?: readonly StaticTelegramAgentMapping[];
  runtime?: { run(input: unknown): Promise<RuntimeTurnResult> };
  identityId?: string;
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

test('runtime dedup schema and additive migration use the same isolated objects', () => {
  const schema = fs.readFileSync(
    path.join(ROOT, 'functions/channels/telegram/schema.ts'),
    'utf8',
  );
  const migration = fs.readFileSync(
    path.join(ROOT, 'migrations/0017_telegram_agents_transport.sql'),
    'utf8',
  );
  for (const objectName of [
    'telegram_agent_updates',
    'idx_telegram_agent_updates_status',
  ]) {
    assert.ok(schema.includes(objectName));
    assert.ok(migration.includes(objectName));
  }
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
  assert.deepEqual(harness.runtimeCalls[0].message, {
    kind: 'action',
    actionId: 'choose-one',
  });
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
  const harness = createHarness({
    runtime: {
      async run() {
        throw new Error('private-runtime-upstream-marker');
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

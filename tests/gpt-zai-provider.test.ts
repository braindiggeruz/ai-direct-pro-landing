// Z.ai as the web chat's second provider (package B).
// Run: node --import tsx --test tests/gpt-zai-provider.test.ts
//
// Every key below is random per run; no real credential is used. fetch is
// mocked per test and records the host of every outbound request, which is
// how "no request ever goes to api.z.ai" is proven rather than assumed.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Env } from '../functions/_types';
import { SqliteD1 } from './helpers/sqlite-d1';
import { ensureSchema } from '../functions/lib/gpt-chat/schema';
import { ensureBillingSchema } from '../functions/lib/gpt-chat/billing-schema';
import { resolveConfig, modelChain } from '../functions/lib/gpt-chat/config';
import {
  webChatChain,
  providerOf,
  bareModel,
  _resetZaiWarning,
  ZAI_WILDCARD,
} from '../functions/lib/gpt-chat/model-provider';
import { chatComplete, buildChatBody } from '../functions/lib/gpt-chat/openrouter-chat';
import { chatStreamStart, parseSseChunk, type SseEvent } from '../functions/lib/gpt-chat/openrouter-stream';
import { ZAI_ENDPOINT, classifyZaiFailure, callZaiOnce, buildZaiBody } from '../functions/lib/gpt-chat/zai-chat';
import { availableModels, modelFailed } from '../functions/lib/gpt-chat/model-health-store';
import { estimateCostUsd } from '../functions/lib/gpt-chat/model-pricing';
import { alertOperator } from '../functions/lib/gpt-chat/operator-alert';
import { hashToken } from '../functions/lib/gpt-chat/hash';
import { onRequestPost as chat } from '../functions/api/gpt/chat';
import { runAssistant } from '../functions/lib/telegram/service';
import { RUNTIME_CONFIG_KEYS, hydrateRuntimeConfig } from '../functions/lib/runtime-config';
import { billingFixture } from './helpers/gpt-billing-fixture';

const ROOT = path.resolve(import.meta.dirname, '..');
const secret = () => randomBytes(24).toString('hex');
const messages = [{ role: 'user' as const, content: 'Salom' }];
const encoder = new TextEncoder();

// The OpenRouter request keys, in wire order, for a model that answers
// without reasoning (functions/platform/ai/model-policy.ts; every committed
// chain head is one). Pinned literally so a Z.ai-only field can never leak
// into an OpenRouter request.
const OPENROUTER_JSON_KEYS = ['model', 'messages', 'temperature', 'max_tokens', 'reasoning', 'provider', 'frequency_penalty', 'presence_penalty'];
const OPENROUTER_STREAM_KEYS = [...OPENROUTER_JSON_KEYS, 'stream', 'stream_options'];

type Body = Record<string, unknown>;
type Handler = (body: Body, init: RequestInit | undefined, n: number) => Response | Promise<Response>;

interface Seen {
  host: string;
  url: string;
  body: Body | undefined;
  headers: Headers;
}

const orJson = (content = 'OR answer'): Handler => () =>
  Response.json({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 11, completion_tokens: 7 } });

const orSse = (content = 'OR answer'): Handler => () =>
  sseResponse(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 7 } })}\n\n`,
    'data: [DONE]\n\n',
  );

const zaiError = (status: number, code: string, message = 'echo: my private question') => () =>
  Response.json({ error: { code, message } }, { status });

function sseResponse(...parts: string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

const zaiData = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

/** Route mocked fetch by host and record every request. */
function route(t: TestContext, handlers: { zai?: Handler; openrouter?: Handler } = {}) {
  const seen: Seen[] = [];
  const counts = { zai: 0, openrouter: 0, telegram: 0 };
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const host = new URL(url).host;
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Body) : undefined;
    seen.push({ host, url, body, headers: new Headers(init?.headers) });
    if (host === 'api.z.ai') {
      counts.zai++;
      if (!handlers.zai) throw new Error('Z.ai must not be called in this test');
      return handlers.zai(body!, init, counts.zai);
    }
    if (host === 'openrouter.ai') {
      counts.openrouter++;
      return (handlers.openrouter ?? orJson())(body!, init, counts.openrouter);
    }
    if (host === 'api.telegram.org') {
      counts.telegram++;
      return Response.json({ ok: true, result: { message_id: counts.telegram } });
    }
    throw new Error(`unexpected host ${host}`);
  });
  return { seen, counts };
}

/** A Z.ai request that never answers until its signal aborts. */
const hang: Handler = (_body, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const fail = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal?.aborted) fail();
    signal?.addEventListener('abort', fail);
  });

async function freshDb() {
  const sqlite = new SqliteD1();
  const db = sqlite.asD1();
  await ensureSchema(db);
  await ensureBillingSchema(db);
  return { sqlite, db };
}

/** All three Z.ai switches on (plan decision L10). */
function zaiEnv(db?: D1Database, extra: Partial<Env> = {}): Env {
  return {
    GPTBOT_DRAFTS_DB: db,
    OPENROUTER_API_KEY: secret(),
    ZAI_API_KEY: secret(),
    GPT_MODEL_PROVIDER: 'zai',
    GPT_ZAI_EVAL_APPROVED: '2026-09-30',
    ...extra,
  } as Env;
}

function healthRows(sqlite: SqliteD1) {
  return sqlite.rows<{ model: string; code: string; blocked_until: number }>(
    'SELECT model, code, blocked_until FROM gpt_model_health ORDER BY model',
  );
}

/** node:sqlite rows have a null prototype; compare them as plain objects. */
function plain(rows: unknown[]): Record<string, unknown>[] {
  return rows.map((row) => ({ ...(row as Record<string, unknown>) }));
}

async function drain(background: Promise<unknown>[]) {
  for (let i = 0; i < background.length; i++) await background[i];
}

function endpoint(env: Env, body: Body, cookie?: string) {
  const background: Promise<unknown>[] = [];
  const request = new Request('https://gpt.test/api/gpt/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const ctx = { request, env, waitUntil: (task: Promise<unknown>) => background.push(task) } as unknown as Parameters<typeof chat>[0];
  return { run: () => chat(ctx), background };
}

/** Make gpt_messages persistence reachable: ownsChat needs gpt_sid + gpt_sat. */
async function ownedSession(sqlite: SqliteD1) {
  const id = `sess_${secret().slice(0, 12)}`;
  const sat = secret();
  sqlite.sqlite
    .prepare('INSERT INTO gpt_sessions (id, anon_token, created_at) VALUES (?, ?, ?)')
    .run(id, await hashToken(sat), new Date().toISOString());
  return { id, cookie: `gpt_sid=${id}; gpt_sat=${sat}` };
}

function packedRuntimeConfig(): Record<string, string> {
  const source = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  const packed = /GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(source)?.[1];
  assert.ok(packed, 'packed runtime config is missing');
  return JSON.parse(packed) as Record<string, string>;
}

// ── 1. Default configuration: nothing changes ──────────────────────────────
test('1 default config: webChatChain is modelChain and no request ever reaches api.z.ai', async (t) => {
  for (const env of [
    {} as Env,
    { ZAI_API_KEY: secret() } as Env,
    { ZAI_API_KEY: secret(), GPT_MODEL_PROVIDER: 'openrouter' } as Env,
    { ZAI_API_KEY: secret(), GPT_MODEL_PROVIDER: 'zai-please' } as Env,
  ]) {
    const cfg = resolveConfig(env);
    assert.equal(cfg.modelProvider, 'openrouter');
    for (const tier of ['free', 'paid'] as const) assert.deepEqual(webChatChain(cfg, env, tier), modelChain(cfg, tier));
  }

  // The committed wrangler config switched off (GPT_MODEL_PROVIDER back to
  // openrouter, the documented way off), hydrated exactly as _middleware does,
  // plus a Z.ai key: the real endpoint talks only to OpenRouter, with the
  // historical request shape, in both the JSON and the streaming path.
  const { db } = await freshDb();
  const env = hydrateRuntimeConfig({
    GPTBOT_RUNTIME_CONFIG_JSON: JSON.stringify({ ...packedRuntimeConfig(), GPT_MODEL_PROVIDER: 'openrouter' }),
    GPTBOT_DRAFTS_DB: db,
    OPENROUTER_API_KEY: secret(),
    ZAI_API_KEY: secret(),
  } as Env & { GPTBOT_RUNTIME_CONFIG_JSON: string });
  const cfg = resolveConfig(env);
  assert.equal(cfg.modelProvider, 'openrouter');
  let streaming = false;
  const { seen, counts } = route(t, { openrouter: (b, i, n) => (streaming ? orSse() : orJson())(b, i, n) });

  const json = await (await endpoint(env, { message: 'Salom', locale: 'uz' }).run()).json() as { ok: boolean; modelUsed: string };
  assert.equal(json.ok, true);
  assert.equal(json.modelUsed, modelChain(cfg, 'free')[0]);
  streaming = true;
  const call = endpoint(env, { message: 'Salom', locale: 'uz', stream: true });
  const wire = await (await call.run()).text();
  await drain(call.background);
  assert.match(wire, /"type":"done"/);

  assert.equal(counts.zai, 0);
  assert.ok(seen.every((s) => s.host === 'openrouter.ai'), 'only OpenRouter may be called');
  assert.deepEqual(Object.keys(seen[0].body!), OPENROUTER_JSON_KEYS);
  assert.deepEqual(Object.keys(seen[1].body!), OPENROUTER_STREAM_KEYS);
  assert.deepEqual(seen[0].body!.reasoning, { enabled: false, exclude: true });
  assert.equal(seen[0].body!.max_tokens, 1600);
  assert.deepEqual(seen[1].body!.stream_options, { include_usage: true });
  assert.equal(seen[0].headers.get('x-title'), 'GPTBot.uz AI Chat');
  assert.equal(seen[0].body!.model, modelChain(cfg, 'free')[0]);
});

// ── 2. Switch without key ──────────────────────────────────────────────────
test('2 GPT_MODEL_PROVIDER=zai without ZAI_API_KEY stays OpenRouter-only', async (t) => {
  const env = { OPENROUTER_API_KEY: secret(), GPT_MODEL_PROVIDER: 'zai' } as Env;
  const cfg = resolveConfig(env);
  assert.equal(cfg.modelProvider, 'zai');
  assert.deepEqual(webChatChain(cfg, env, 'free'), modelChain(cfg, 'free'));
  assert.deepEqual(webChatChain(cfg, env, 'paid'), modelChain(cfg, 'paid'));
  const { counts } = route(t);
  const result = await chatComplete(env, cfg, webChatChain(cfg, env, 'free'), messages, 100, 5000);
  assert.equal(result.ok, true);
  assert.equal(counts.zai, 0);
  // A hand-built chain naming Z.ai without its key: the Z.ai id is dropped,
  // not sent keyless.
  const keyless = await chatComplete(env, cfg, ['zai/glm-4.7-flash', 'vendor/a:free'], messages, 100, 5000);
  assert.equal(keyless.modelUsed, 'vendor/a:free');
  assert.equal(counts.zai, 0);
  assert.deepEqual(
    await chatComplete({ ...env, OPENROUTER_API_KEY: undefined }, cfg, ['vendor/a:free'], messages),
    { ok: false, errorCode: 'no_key', attempts: 0 },
  );
});

// ── 3. All switches ────────────────────────────────────────────────────────
test('3 with all switches: one Z.ai model first, the whole OpenRouter chain behind it', () => {
  const env = zaiEnv();
  const cfg = resolveConfig(env);
  // Not cut to three slots here: the walker spends its three attempts on the
  // first candidates that are not cooling down (tests/gpt-model-policy.test.ts).
  const free = webChatChain(cfg, env, 'free');
  assert.deepEqual(free, ['zai/glm-4.7-flash', ...modelChain(cfg, 'free')]);
  assert.equal(free.filter((m) => providerOf(m) === 'zai').length, 1);
  const paid = webChatChain(cfg, env, 'paid');
  assert.deepEqual(paid, ['zai/glm-4.5-air', ...modelChain(cfg, 'paid')]);
  assert.equal(bareModel(paid[0]), 'glm-4.5-air');
  assert.equal(providerOf('z-ai/glm-4.7-flash'), 'openrouter', "OpenRouter's own z-ai/ slugs are not Z.ai direct");

  const paidOnly = { ...env, ZAI_TIERS: 'paid' } as Env;
  assert.deepEqual(webChatChain(resolveConfig(paidOnly), paidOnly, 'free'), modelChain(cfg, 'free'));
  assert.equal(webChatChain(resolveConfig(paidOnly), paidOnly, 'paid')[0], 'zai/glm-4.5-air');
  const none = { ...env, ZAI_TIERS: 'nonsense' } as Env;
  assert.deepEqual(webChatChain(resolveConfig(none), none, 'paid'), modelChain(cfg, 'paid'));

  assert.equal(resolveConfig({ ZAI_TIMEOUT_MS: '99999' } as Env).zaiTimeoutMs, 15_000);
  assert.equal(resolveConfig({ ZAI_TIMEOUT_MS: '10' } as Env).zaiTimeoutMs, 3_000);
  assert.equal(resolveConfig({} as Env).zaiTimeoutMs, 12_000);
});

// ── 4. Allowlists ──────────────────────────────────────────────────────────
test('4 the free tier only takes $0 Z.ai models; GLM-5 never enters a chain', (t) => {
  _resetZaiWarning();
  const warn = t.mock.method(console, 'warn', () => undefined);
  const paidInFree = zaiEnv(undefined, { ZAI_MODEL_FREE: 'glm-4.5-air' });
  const cfgA = resolveConfig(paidInFree);
  assert.deepEqual(webChatChain(cfgA, paidInFree, 'free'), modelChain(cfgA, 'free'));
  const glm5 = zaiEnv(undefined, { ZAI_MODEL_PAID: 'glm-5.3' });
  const cfgB = resolveConfig(glm5);
  assert.deepEqual(webChatChain(cfgB, glm5, 'paid'), modelChain(cfgB, 'paid'));
  assert.ok(webChatChain(cfgB, glm5, 'free')[0] === 'zai/glm-4.7-flash', 'a bad paid model does not disable the free one');
  const rejected = warn.mock.calls.filter((c) => String(c.arguments[0]).includes('gpt_zai_model_rejected'));
  assert.equal(rejected.length, 1, 'warned once per isolate');
  const flash = zaiEnv(undefined, { ZAI_MODEL_FREE: 'GLM-4.5-Flash' });
  assert.equal(webChatChain(resolveConfig(flash), flash, 'free')[0], 'zai/glm-4.5-flash');
});

test('4b a prepaid GLM-5.3-Flash enters a chain only when listed, and is sent with the lowest reasoning effort', () => {
  _resetZaiWarning();
  const listed = zaiEnv(undefined, { ZAI_MODEL_FREE: 'glm-5.3-flash', ZAI_MODEL_PAID: 'GLM-5.3-Flash', ZAI_PREPAID_MODELS: ' GLM-5.3-Flash ' });
  const cfg = resolveConfig(listed);
  for (const tier of ['free', 'paid'] as const) assert.equal(webChatChain(cfg, listed, tier)[0], 'zai/glm-5.3-flash');
  // Not listed as prepaid: the free tier must not spend on it.
  const unlisted = zaiEnv(undefined, { ZAI_MODEL_FREE: 'glm-5.3-flash', ZAI_MODEL_PAID: 'glm-5.3-flash' });
  const cfgU = resolveConfig(unlisted);
  for (const tier of ['free', 'paid'] as const) assert.deepEqual(webChatChain(cfgU, unlisted, tier), modelChain(cfgU, tier));
  // Listed but never checked live: still refused (the 12 s budget is unknown).
  const unknown = zaiEnv(undefined, { ZAI_MODEL_FREE: 'glm-5.3', ZAI_PREPAID_MODELS: 'glm-5.3' });
  const cfgX = resolveConfig(unknown);
  assert.deepEqual(webChatChain(cfgX, unknown, 'free'), modelChain(cfgX, 'free'));

  const glm5 = buildZaiBody('glm-5.3-flash', [{ role: 'user', content: 'Salom' }], 1600, true) as Record<string, unknown>;
  assert.equal(glm5.reasoning_effort, 'low');
  assert.equal('thinking' in glm5, false, 'GLM-5.x refuses thinking:{type:"disabled"} with 1210');
  const glm4 = buildZaiBody('glm-4.7-flash', [{ role: 'user', content: 'Salom' }], 1600, false) as Record<string, unknown>;
  assert.deepEqual(glm4.thinking, { type: 'disabled' });
  assert.equal('reasoning_effort' in glm4, false);
  assert.equal(estimateCostUsd('zai/glm-5.3-flash', 1500, 500), 0);
});

// ── 5. JSON success ────────────────────────────────────────────────────────
test('5 JSON: Z.ai request shape, qualified modelUsed and token usage', async (t) => {
  const env = zaiEnv();
  const cfg = resolveConfig(env);
  const { seen, counts } = route(t, {
    zai: () => Response.json({
      choices: [{ message: { content: ' Salom! Qanday yordam bera olaman? ' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    }),
  });
  const result = await chatComplete(env, cfg, webChatChain(cfg, env, 'free'), messages, 900, 45_000);
  assert.deepEqual(result, {
    ok: true,
    content: 'Salom! Qanday yordam bera olaman?',
    modelUsed: 'zai/glm-4.7-flash',
    inputTokens: 120,
    outputTokens: 30,
    finishReason: 'stop',
    attempts: 1,
  });
  assert.equal(counts.openrouter, 0);
  const request = seen[0];
  assert.equal(request.url, ZAI_ENDPOINT);
  assert.equal(request.headers.get('authorization'), `Bearer ${env.ZAI_API_KEY}`);
  assert.equal(request.headers.get('http-referer'), null);
  assert.equal(request.headers.get('x-title'), null);
  assert.deepEqual(request.body, {
    model: 'glm-4.7-flash',
    messages,
    temperature: 0.6,
    max_tokens: 900,
    stream: false,
    thinking: { type: 'disabled' },
  });
  for (const key of ['frequency_penalty', 'presence_penalty', 'provider', 'stream_options']) assert.ok(!(key in request.body!));
});

// ── 6. Streaming wire format ───────────────────────────────────────────────
test('6 stream: reasoning never counts as content, usage comes from the last chunk', async (t) => {
  const env = zaiEnv();
  const cfg = resolveConfig(env);
  const { seen } = route(t, {
    zai: () => sseResponse(
      zaiData({ choices: [{ delta: { role: 'assistant', reasoning_content: 'HIDDEN_REASONING' } }] }),
      zaiData({ choices: [{ delta: { reasoning_content: 'more HIDDEN_REASONING' } }] }),
      zaiData({ choices: [{ delta: { content: '  ' } }] }),
      zaiData({ choices: [{ delta: { content: 'Salom' } }] }),
      'data:' + JSON.stringify({ choices: [{ delta: { content: ', dunyo' }, finish_reason: 'stop' }], usage: { prompt_tokens: 42, completion_tokens: 9 } }) + '\n\n',
      'data: [DONE]\n\n',
    ),
  });
  const start = await chatStreamStart(env, cfg, webChatChain(cfg, env, 'free'), messages);
  assert.equal(start.ok, true);
  if (!start.ok) return;
  assert.equal(start.model, 'zai/glm-4.7-flash');
  assert.equal(start.provider, 'zai');
  const text = await new Response(start.body).text();
  start.abort();
  const events = parseSseChunk({ buffer: '' }, text, start.provider);
  const answer = events.map((e) => e.delta ?? '').join('');
  assert.equal(answer, '  Salom, dunyo');
  assert.ok(!answer.includes('HIDDEN_REASONING'));
  const usage = events.find((e) => e.inputTokens !== undefined);
  assert.deepEqual([usage?.inputTokens, usage?.outputTokens, usage?.finishReason], [42, 9, 'stop']);
  assert.ok(events.some((e) => e.done));
  assert.equal(seen[0].body!.stream, true);
  assert.ok(!('stream_options' in seen[0].body!));
  assert.deepEqual(seen[0].body!.thinking, { type: 'disabled' });

  // Reasoning-only, then [DONE]: never "ready", so the chain falls back.
  const parse = (line: string): SseEvent[] => parseSseChunk({ buffer: '' }, line, 'zai');
  assert.deepEqual(parse(zaiData({ choices: [{ delta: { reasoning_content: 'x' } }] })), []);
  assert.deepEqual(parse('data: [DONE]\n'), [{ done: true }]);
  assert.deepEqual(parse(zaiData({ choices: [{ delta: {}, finish_reason: 'sensitive' }] })), [{ error: 'content_refused', finishReason: 'sensitive' }]);
  assert.deepEqual(parse(zaiData({ error: { code: '1113', message: 'x' } })), [{ error: 'balance_exhausted' }]);
  // The OpenRouter dialect is untouched by the new argument.
  assert.deepEqual(parseSseChunk({ buffer: '' }, 'data:{"choices":[{"delta":{"content":"x"}}]}\n'), []);
});

test('6b stream: a reasoning-only Z.ai stream falls back to OpenRouter before any byte is shown', async (t) => {
  const { sqlite, db } = await freshDb();
  const env = zaiEnv(db);
  const cfg = resolveConfig(env);
  route(t, {
    zai: () => sseResponse(zaiData({ choices: [{ delta: { reasoning_content: 'thinking…' } }] }), 'data: [DONE]\n\n'),
    openrouter: orSse('OR answer'),
  });
  const start = await chatStreamStart(env, cfg, webChatChain(cfg, env, 'free'), messages);
  assert.equal(start.ok, true);
  if (!start.ok) return;
  assert.equal(start.provider, 'openrouter');
  assert.equal(start.model, cfg.freeModel);
  await new Response(start.body).text();
  start.abort();
  assert.deepEqual(healthRows(sqlite).map((r) => [r.model, r.code]), [['zai/glm-4.7-flash', 'provider_error']]);
});

// ── 7. Content safety (1301) ───────────────────────────────────────────────
test('7 a 1301 refusal cools nothing down, falls through, and is not a service alert', async (t) => {
  const { sqlite, db } = await freshDb();
  const env = zaiEnv(db);
  const cfg = resolveConfig(env);
  const logged: string[] = [];
  for (const level of ['log', 'warn', 'error'] as const)
    t.mock.method(console, level, (...args: unknown[]) => { logged.push(args.map(String).join(' ')); });
  const { counts } = route(t, { zai: zaiError(400, '1301') });

  const result = await chatComplete(env, cfg, webChatChain(cfg, env, 'free'), messages, 100, 5000);
  assert.equal(result.ok, true);
  assert.equal(result.modelUsed, cfg.freeModel);
  assert.equal(healthRows(sqlite).length, 0, 'no gpt_model_health row for a refused request');

  // Z.ai is the only live candidate (OpenRouter account blocked): the turn
  // ends content_refused, the endpoint answers the public provider_error, and
  // no service alert is written.
  await modelFailed(db, '*', 'account_unavailable');
  const call = endpoint(env, { message: 'Salom', locale: 'uz' });
  const response = await (await call.run()).json() as { ok: boolean; code: string };
  await drain(call.background);
  assert.deepEqual([response.ok, response.code], [false, 'provider_error']);
  assert.equal(sqlite.value('SELECT COUNT(*) FROM gpt_service_alerts'), 0);
  assert.deepEqual(healthRows(sqlite).map((r) => r.model), ['*']);
  assert.equal(counts.zai, 2);
  assert.ok(!logged.some((line) => line.includes('my private question')), 'error.message is never logged');
  assert.deepEqual(
    await chatComplete(env, cfg, ['zai/glm-4.7-flash'], messages, 100, 5000),
    { ok: false, errorCode: 'content_refused', attempts: 1 },
  );
});

// ── 8. Balance exhausted (1113) ────────────────────────────────────────────
test('8 a 1113 blocks zai/* for ~15 min, pages the owner once per hour, OpenRouter answers', async (t) => {
  const { sqlite, db } = await freshDb();
  const env = zaiEnv(db, { GPT_NOTIFY_BOT_TOKEN: `${secret()}`, GPT_NOTIFY_CHAT_ID: '424242' } as Partial<Env>);
  const cfg = resolveConfig(env);
  const { counts } = route(t, { zai: zaiError(429, '1113') });
  t.mock.method(console, 'warn', () => undefined);
  t.mock.method(console, 'error', () => undefined);

  const events: string[] = [];
  const before = Date.now();
  const result = await chatComplete(env, cfg, webChatChain(cfg, env, 'free'), messages, 100, 5000, undefined, undefined, (c) => events.push(c));
  assert.equal(result.ok, true);
  assert.equal(result.modelUsed, cfg.freeModel);
  assert.deepEqual(events, ['zai_balance_exhausted']);
  const rows = healthRows(sqlite);
  assert.deepEqual(rows.map((r) => [r.model, r.code]), [[ZAI_WILDCARD, 'balance_exhausted']]);
  assert.ok(Math.abs(rows[0].blocked_until - (before + 15 * 60_000)) < 5_000);
  // The blocked Z.ai model no longer costs an OpenRouter attempt.
  assert.deepEqual(await availableModels(db, webChatChain(cfg, env, 'free')), modelChain(cfg, 'free'));

  // Wiring through the real endpoint: the owner push goes out once.
  sqlite.exec('DELETE FROM gpt_model_health');
  const call = endpoint(env, { message: 'Salom', locale: 'uz' });
  const answer = await (await call.run()).json() as { ok: boolean; modelUsed: string };
  await drain(call.background);
  assert.deepEqual([answer.ok, answer.modelUsed], [true, cfg.freeModel]);
  assert.equal(counts.telegram, 1);
  assert.equal(sqlite.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE code='zai_balance_exhausted'"), 1);

  // Two more failures in the same hour: no further push, one alert row.
  const hour = Date.now();
  await alertOperator(env, 'zai_balance_exhausted', {}, hour);
  await alertOperator(env, 'zai_balance_exhausted', {}, hour);
  assert.equal(counts.telegram, 1);
  assert.equal(sqlite.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE code='zai_balance_exhausted'"), 1);
  assert.equal(sqlite.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE code='zai_balance_exhausted' AND delivered_at IS NOT NULL"), 1, 'the cron will not send it again');
  assert.equal(sqlite.value("SELECT COUNT(*) FROM gpt_rate_limits WHERE action='lead_notify'"), 0, 'never the lead ceiling');
  // A different code in the same hour still reaches the owner.
  await alertOperator(env, 'zai_auth_failed', {}, hour);
  assert.equal(counts.telegram, 2);
  // Background codes are recorded but never touch Telegram on their own.
  await alertOperator(env, 'chat_rate_limit', {}, hour);
  assert.equal(counts.telegram, 2);
  assert.equal(sqlite.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE code='chat_rate_limit' AND delivered_at IS NULL"), 1);
});

// ── 9. Rate limits ─────────────────────────────────────────────────────────
test('9 1302 and 1305 cool down that Z.ai model only, for 60 s', async (t) => {
  for (const code of ['1302', '1305', '1310']) {
    const { sqlite, db } = await freshDb();
    const env = zaiEnv(db);
    const cfg = resolveConfig(env);
    const { counts } = route(t, { zai: zaiError(429, code) });
    const before = Date.now();
    const result = await chatComplete(env, cfg, webChatChain(cfg, env, 'free'), messages, 100, 5000);
    assert.equal(result.modelUsed, cfg.freeModel);
    const rows = healthRows(sqlite);
    assert.deepEqual(rows.map((r) => [r.model, r.code]), [['zai/glm-4.7-flash', 'rate_limit']], code);
    assert.ok(Math.abs(rows[0].blocked_until - (before + 60_000)) < 5_000);
    assert.equal(counts.zai, 1);
    t.mock.restoreAll();
  }
});

// ── 10. Rejected key ───────────────────────────────────────────────────────
test('10 a rejected Z.ai key blocks zai/* only; OpenRouter keeps answering', async (t) => {
  const { sqlite, db } = await freshDb();
  const env = zaiEnv(db);
  const cfg = resolveConfig(env);
  route(t, { zai: zaiError(401, '1000') });
  const events: string[] = [];
  const before = Date.now();
  const result = await chatComplete(env, cfg, webChatChain(cfg, env, 'free'), messages, 100, 5000, undefined, undefined, (c) => events.push(c));
  assert.equal(result.modelUsed, cfg.freeModel);
  assert.deepEqual(events, ['zai_auth_failed']);
  const rows = healthRows(sqlite);
  assert.deepEqual(rows.map((r) => [r.model, r.code]), [[ZAI_WILDCARD, 'account_unavailable']]);
  assert.ok(Math.abs(rows[0].blocked_until - (before + 10 * 60_000)) < 5_000);
  assert.ok(!rows.some((r) => r.model === '*'), "'*' must not be written for a Z.ai key");
  // The same in the streaming walker, and a 401 without any code.
  sqlite.exec('DELETE FROM gpt_model_health');
  t.mock.restoreAll();
  route(t, { zai: () => new Response('', { status: 401 }), openrouter: orSse() });
  const start = await chatStreamStart(env, cfg, webChatChain(cfg, env, 'free'), messages, 100, 5000, undefined, undefined, (c) => events.push(c));
  assert.equal(start.ok && start.model, cfg.freeModel);
  if (start.ok) { await new Response(start.body).text(); start.abort(); }
  assert.deepEqual(healthRows(sqlite).map((r) => r.model), [ZAI_WILDCARD]);
  assert.deepEqual(events, ['zai_auth_failed', 'zai_auth_failed']);
});

// ── 11. OpenRouter account failure ─────────────────────────────────────────
test('11 an OpenRouter 402 writes * and leaves the Z.ai model available', async (t) => {
  const { sqlite, db } = await freshDb();
  const env = zaiEnv(db);
  const cfg = resolveConfig(env);
  const chain = webChatChain(cfg, env, 'free');
  const { counts } = route(t, { zai: zaiError(400, '1301'), openrouter: () => new Response('', { status: 402 }) });
  const result = await chatComplete(env, cfg, chain, messages, 100, 5000);
  assert.deepEqual(result, { ok: false, errorCode: 'account_unavailable', attempts: 2 });
  assert.equal(counts.openrouter, 1, 'the remaining OpenRouter candidates are skipped, as before');
  assert.deepEqual(healthRows(sqlite).map((r) => r.model), ['*']);
  assert.deepEqual(await availableModels(db, chain), ['zai/glm-4.7-flash']);
  // An OpenRouter-only paid chain: the 402 on the paid primary skips the paid
  // fallback, the ':free' tail is asked once, and its 402 ends the walk.
  counts.openrouter = 0;
  sqlite.exec('DELETE FROM gpt_model_health');
  const orOnly = { ...env, GPT_MODEL_PROVIDER: undefined } as Env;
  assert.deepEqual(
    await chatComplete(orOnly, cfg, webChatChain(resolveConfig(orOnly), orOnly, 'paid'), messages, 100, 5000),
    { ok: false, errorCode: 'account_unavailable', attempts: 2 },
  );
  assert.equal(counts.openrouter, 2);
  assert.deepEqual(healthRows(sqlite).map((r) => r.model), ['*', 'openrouter-paid/*']);
});

// ── 12. Timeout ────────────────────────────────────────────────────────────
test('12 a Z.ai timeout is cooled down as timeout and the chain falls back', async (t) => {
  const { sqlite, db } = await freshDb();
  const env = zaiEnv(db);
  const cfg = { ...resolveConfig(env), zaiTimeoutMs: 40 };
  route(t, { zai: hang, openrouter: orJson() });
  const result = await chatComplete(env, cfg, webChatChain(cfg, env, 'free'), messages, 100, 5000);
  assert.equal(result.modelUsed, cfg.freeModel);
  assert.deepEqual(healthRows(sqlite).map((r) => [r.model, r.code]), [['zai/glm-4.7-flash', 'timeout']]);

  sqlite.exec('DELETE FROM gpt_model_health');
  t.mock.restoreAll();
  route(t, { zai: hang, openrouter: orSse() });
  const start = await chatStreamStart(env, cfg, webChatChain(cfg, env, 'free'), messages, 100, 5000);
  assert.equal(start.ok && start.provider, 'openrouter');
  if (start.ok) { await new Response(start.body).text(); start.abort(); }
  assert.deepEqual(healthRows(sqlite).map((r) => [r.model, r.code]), [['zai/glm-4.7-flash', 'timeout']]);
});

// ── 13. Mid-stream refusal ─────────────────────────────────────────────────
test('13 a mid-stream Z.ai refusal ends as partial and cools nothing down', async (t) => {
  for (const refusal of [
    zaiData({ error: { code: '1301', message: 'echo: my private question' } }),
    zaiData({ choices: [{ delta: { content: '' }, finish_reason: 'sensitive' }] }),
  ]) {
    const { sqlite, db } = await freshDb();
    const env = zaiEnv(db);
    route(t, {
      zai: () => sseResponse(
        zaiData({ choices: [{ delta: { reasoning_content: 'HIDDEN_REASONING' } }] }),
        zaiData({ choices: [{ delta: { content: 'Salom' } }] }),
        refusal,
      ),
    });
    const call = endpoint(env, { message: 'Salom', locale: 'uz', stream: true });
    const wire = await (await call.run()).text();
    await drain(call.background);
    assert.match(wire, /"type":"meta"[^\n]*"model":"zai\/glm-4.7-flash"/);
    assert.match(wire, /"code":"partial"/);
    assert.match(wire, /"modelUsed":"zai\/glm-4.7-flash"/);
    assert.ok(!wire.includes('HIDDEN_REASONING'));
    assert.ok(!wire.includes('my private question'));
    assert.equal(healthRows(sqlite).length, 0);
    assert.equal(sqlite.value("SELECT COUNT(*) FROM gpt_turn_reservations WHERE status='done'"), 0);
    t.mock.restoreAll();
  }
});

// ── 14. Javob isolation ────────────────────────────────────────────────────
test('14 Javob (runAssistant) never calls Z.ai, even with all switches on', async (t) => {
  const env = zaiEnv(undefined, { TELEGRAM_ASSISTANT_BOT_TOKEN: secret() } as Partial<Env>);
  const prompt = { system: 'Siz yordamchisiz.', user: 'Salom', promptVersion: 'test' };
  const ok = route(t);
  const result = await runAssistant(env, prompt, 400);
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'openrouter');
  assert.ok(!String(result.model).startsWith('zai/'));
  assert.ok(ok.seen.length > 0 && ok.seen.every((s) => s.host === 'openrouter.ai'));
  t.mock.restoreAll();
  const failing = route(t, { openrouter: () => new Response('', { status: 503 }) });
  assert.equal((await runAssistant(env, prompt, 400)).ok, false);
  assert.equal(failing.counts.zai, 0);
  assert.ok(failing.seen.every((s) => s.host === 'openrouter.ai'));
});

// ── 15. Cost accounting ────────────────────────────────────────────────────
test('15 estimateCostUsd and cost_usd on the assistant row', async (t) => {
  assert.equal(estimateCostUsd('google/gemma-4-31b-it:free', 1500, 500), 0);
  assert.equal(estimateCostUsd('google/gemma-4-26b-a4b-it', 1_000_000, 1_000_000), 0.39);
  assert.equal(estimateCostUsd('zai/glm-4.7-flash', 1500, 500), 0);
  assert.equal(estimateCostUsd('zai/glm-4.5-flash', 1500, 500), 0);
  assert.equal(estimateCostUsd('zai/glm-4.5-air', 1500, 500), 0.00085);
  assert.equal(estimateCostUsd('zai/glm-4.7-flashx', 1500, 500), 0.000305);
  assert.equal(estimateCostUsd('meta-llama/llama-3.3-70b-instruct', 1_000_000, 1_000_000), 0.42);
  assert.equal(estimateCostUsd('vendor/unknown', 1500, 500), null);
  assert.equal(estimateCostUsd('zai/glm-4.5-air', undefined, 500), null);
  assert.equal(estimateCostUsd(undefined, 1500, 500), null);
  // Every paid OpenRouter price stays inside the cap buildChatBody enforces.
  for (const model of [
    'google/gemma-4-26b-a4b-it',
    'mistralai/mistral-small-3.2-24b-instruct',
    'meta-llama/llama-3.3-70b-instruct',
    'deepseek/deepseek-v4-flash',
  ]) {
    const cap = buildChatBody(model, [], 900).provider.max_price;
    assert.ok(estimateCostUsd(model, 1_000_000, 0)! <= cap.prompt);
    assert.ok(estimateCostUsd(model, 0, 1_000_000)! <= cap.completion);
  }

  // Free tier through the real JSON endpoint: $0 model, cost 0, user row NULL.
  {
    const { sqlite, db } = await freshDb();
    const env = zaiEnv(db);
    route(t, { zai: () => Response.json({ choices: [{ message: { content: 'Javob' } }], usage: { prompt_tokens: 1500, completion_tokens: 500 } }) });
    const session = await ownedSession(sqlite);
    const call = endpoint(env, { message: 'Salom', locale: 'uz', sessionId: session.id }, session.cookie);
    const body = await (await call.run()).json() as { modelUsed: string };
    await drain(call.background);
    assert.equal(body.modelUsed, 'zai/glm-4.7-flash');
    assert.deepEqual(
      plain(sqlite.rows('SELECT role, model_used, cost_usd FROM gpt_messages ORDER BY role')),
      [
        { role: 'assistant', model_used: 'zai/glm-4.7-flash', cost_usd: 0 },
        { role: 'user', model_used: null, cost_usd: null },
      ],
    );
    t.mock.restoreAll();
  }

  // Paid tier through the streaming endpoint: glm-4.5-air, usage from the
  // last chunk, 1500/500 tokens → $0.00085 on the assistant row.
  {
    const f = await billingFixture();
    Object.assign(f.env, { OPENROUTER_API_KEY: secret(), ZAI_API_KEY: secret(), GPT_MODEL_PROVIDER: 'zai', GPT_ZAI_EVAL_APPROVED: '2026-09-30' });
    const order = await f.store.createOrder(f.user, 'payme', 'test', crypto.randomUUID());
    await f.store.transition(order.id, 'prepared', 'prepare');
    await f.store.transition(order.id, 'paid', 'perform');
    const { seen } = route(t, {
      zai: () => sseResponse(
        zaiData({ choices: [{ delta: { content: 'Pullik javob' } }] }),
        zaiData({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1500, completion_tokens: 500 } }),
        'data: [DONE]\n\n',
      ),
    });
    const session = await ownedSession(f.db);
    const response = await chat(f.ctx(new Request('https://gpt.test/api/gpt/chat', {
      method: 'POST',
      headers: { cookie: `${f.testCookie}; ${session.cookie}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Salom', locale: 'uz', stream: true, sessionId: session.id }),
    })));
    const wire = await response.text();
    await drain(f.background);
    assert.match(wire, /"type":"done"[^\n]*"modelUsed":"zai\/glm-4.5-air"/);
    assert.equal(seen[0].body!.model, 'glm-4.5-air');
    assert.deepEqual(
      plain(f.db.rows('SELECT role, model_used, token_in, token_out, cost_usd FROM gpt_messages ORDER BY role')),
      [
        { role: 'assistant', model_used: 'zai/glm-4.5-air', token_in: null, token_out: 500, cost_usd: 0.00085 },
        { role: 'user', model_used: null, token_in: 1500, token_out: null, cost_usd: null },
      ],
    );
  }
});

// ── 16. Runtime config ─────────────────────────────────────────────────────
test('16 the Z.ai switches are allowlisted public config, committed on with the prepaid glm-5.3-flash', () => {
  const keys = ['GPT_MODEL_PROVIDER', 'GPT_ZAI_EVAL_APPROVED', 'ZAI_MODEL_FREE', 'ZAI_MODEL_PAID', 'ZAI_TIERS', 'ZAI_PREPAID_MODELS', 'ZAI_TIMEOUT_MS'];
  for (const key of keys) assert.ok((RUNTIME_CONFIG_KEYS as readonly string[]).includes(key), key);
  assert.ok(!(RUNTIME_CONFIG_KEYS as readonly string[]).includes('ZAI_API_KEY'), 'the key is a secret, never runtime config');
  // On since 2026-10-03 (owner directive). Both tiers use glm-5.3-flash from
  // the owner's prepaid usage bundle; pay-as-you-go models would answer 1113.
  const expected = { GPT_MODEL_PROVIDER: 'zai', GPT_ZAI_EVAL_APPROVED: '2026-10-03', ZAI_MODEL_FREE: 'glm-5.3-flash', ZAI_MODEL_PAID: 'glm-5.3-flash', ZAI_TIERS: 'free,paid', ZAI_PREPAID_MODELS: 'glm-5.3-flash', ZAI_TIMEOUT_MS: '12000' };
  const packed = packedRuntimeConfig();
  const source = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  const table = source.slice(source.indexOf('[vars.GPTBOT_RUNTIME_CONFIG]'));
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(packed[key], value, `packed ${key}`);
    assert.match(table, new RegExp(`^${key} = "${value}"\\r?$`, 'mu'), `table ${key}`);
  }
  assert.doesNotMatch(source, /^\s*ZAI_API_KEY\s*=/mu, 'ZAI_API_KEY must never be a plain-text var');
  const env = hydrateRuntimeConfig({ GPTBOT_RUNTIME_CONFIG_JSON: JSON.stringify({ ...packed, ZAI_API_KEY: 'must-not-be-promoted' }) } as Env & { GPTBOT_RUNTIME_CONFIG_JSON: string });
  assert.equal(env.ZAI_API_KEY, undefined);
  const cfg = resolveConfig(env);
  assert.deepEqual(
    [cfg.modelProvider, cfg.zaiEvalApproved, cfg.zaiModelFree, cfg.zaiModelPaid, cfg.zaiTiers, cfg.zaiPrepaidModels, cfg.zaiTimeoutMs],
    ['zai', '2026-10-03', 'glm-5.3-flash', 'glm-5.3-flash', ['free', 'paid'], ['glm-5.3-flash'], 12_000],
  );
  // With the Pages secret, both tiers put that one Z.ai model in front of the
  // OpenRouter chain; without it they stay on OpenRouter.
  for (const tier of ['free', 'paid'] as const) {
    assert.deepEqual(webChatChain(cfg, { ZAI_API_KEY: 'k' } as Env, tier), ['zai/glm-5.3-flash', ...modelChain(cfg, tier).filter((m) => !m.startsWith('zai/'))]);
    assert.deepEqual(webChatChain(cfg, {} as Env, tier), modelChain(cfg, tier));
  }
});

// ── Classifier table ───────────────────────────────────────────────────────
test('Z.ai failure classification follows docs.z.ai/api-reference/api-code', async (t) => {
  const table: Array<[number, string | undefined, string]> = [
    [400, '1301', 'content_refused'],
    [429, '1113', 'balance_exhausted'],
    [401, '1000', 'account_unavailable'],
    [401, '1001', 'account_unavailable'],
    [401, '1003', 'account_unavailable'],
    [401, '1005', 'account_unavailable'],
    [403, '1220', 'account_unavailable'],
    [401, undefined, 'account_unavailable'],
    [403, undefined, 'account_unavailable'],
    [429, '1302', 'rate_limit'],
    [429, '1303', 'rate_limit'],
    [429, '1305', 'rate_limit'],
    [429, '1308', 'rate_limit'],
    [429, '1321', 'rate_limit'],
    [429, undefined, 'rate_limit'],
    [400, '1211', 'model_unavailable'],
    [400, '1212', 'model_unavailable'],
    [400, '1221', 'model_unavailable'],
    [400, '1222', 'model_unavailable'],
    [400, '1210', 'bad_request'],
    [400, '1213', 'bad_request'],
    [400, '1214', 'bad_request'],
    [400, '1215', 'bad_request'],
    [400, '1261', 'bad_request'],
    [500, '1200', 'provider_error'],
    [500, '1230', 'provider_error'],
    [500, '1234', 'provider_error'],
    [400, undefined, 'provider_error'],
    [502, undefined, 'provider_error'],
    [0, 'not-a-code', 'provider_error'],
  ];
  for (const [status, code, expected] of table) assert.equal(classifyZaiFailure(status, code), expected, `${status}/${code}`);

  // An oversized error body is read only up to 4 KiB and still classified.
  const env = zaiEnv();
  route(t, { zai: () => new Response(`{"error":{"code":"1302","message":"${'x'.repeat(20_000)}"}}`, { status: 429 }) });
  assert.deepEqual(await callZaiOnce(env, 'zai/glm-4.7-flash', messages, 100, 5000), { ok: false, errorCode: 'rate_limit' });
});

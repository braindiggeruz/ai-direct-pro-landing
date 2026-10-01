// Model policy of the web chat (plan WP-03): request body per model, OpenRouter
// failure classes, attempts after the health filter, the Z.ai evaluation gate
// and the model probe endpoint.
// Run: node --import tsx --test tests/gpt-model-policy.test.ts
//
// No network: fetch is mocked per test. Keys and secrets are random per run.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Env } from '../functions/_types';
import { billingFixture } from './helpers/gpt-billing-fixture';
import { freeChain, modelChain, resolveConfig } from '../functions/lib/gpt-chat/config';
import { OPENROUTER_PAID_WILDCARD, webChatChain } from '../functions/lib/gpt-chat/model-provider';
import { availableModels } from '../functions/lib/gpt-chat/model-health-store';
import {
  buildChatBody,
  chatComplete,
  classifyFailureEnvelope,
  classifyFailureStatus,
} from '../functions/lib/gpt-chat/openrouter-chat';
import { chatStreamStart } from '../functions/lib/gpt-chat/openrouter-stream';
import { FREE_PRICE_CEILING, PAID_PRICE_CEILING } from '../functions/lib/gpt-chat/model-pricing';
import { isUrgentAlert } from '../functions/lib/gpt-chat/alert-policy';
import { GPT_CHAT_SYSTEM_PROMPT } from '../functions/lib/gpt-chat/prompt';
import { REASONING_OFF_MODELS } from '../functions/platform/ai/model-policy';
import { observe } from '../functions/platform/aeo/observation';
import { onRequestPost as chat } from '../functions/api/gpt/chat';
import { onRequestPost as probe } from '../functions/api/internal/gpt-model-probe';

const ROOT = path.resolve(import.meta.dirname, '..');
const secret = () => randomBytes(24).toString('hex');
const messages = [{ role: 'user' as const, content: 'Salom' }];
const encoder = new TextEncoder();

type Fixture = Awaited<ReturnType<typeof billingFixture>>;
type Body = Record<string, unknown>;
type Handler = (body: Body, n: number) => Response | Promise<Response>;

function sse(...events: unknown[]): Response {
  return new Response(
    [...events.map((event) => `data: ${JSON.stringify(event)}\n\n`), 'data: [DONE]\n\n'].join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

const answer = (content: string) => Response.json({ choices: [{ message: { content } }] });

/** Mock fetch for openrouter.ai only; records the parsed body of every request. */
function openrouter(t: TestContext, handler: Handler) {
  const bodies: Body[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const host = new URL(url).host;
    if (host !== 'openrouter.ai') throw new Error(`unexpected host ${host}`);
    const body = JSON.parse(String(init?.body)) as Body;
    bodies.push(body);
    return handler(body, bodies.length);
  });
  return bodies;
}

function health(f: Fixture) {
  return f.db.rows<{ model: string; code: string; blocked_until: number }>(
    'SELECT model, code, blocked_until FROM gpt_model_health ORDER BY model',
  );
}

async function withKey() {
  const f = await billingFixture();
  f.env.OPENROUTER_API_KEY = secret();
  return f;
}

async function drain(f: Fixture) {
  for (let i = 0; i < f.background.length; i++) await f.background[i];
}

function anonymousTurn(f: Fixture, stream = false) {
  return chat(
    f.ctx(
      new Request('https://gpt.test/api/gpt/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.21' },
        body: JSON.stringify({ message: 'Salom', locale: 'uz', stream }),
      }),
    ) as never,
  );
}

// ── Request body ────────────────────────────────────────────────────────────
test('reasoning is off only for the listed models; AEO reads the same list', async () => {
  for (const model of REASONING_OFF_MODELS)
    assert.deepEqual(buildChatBody(model, messages, 1600).reasoning, { enabled: false, exclude: true }, model);
  for (const model of ['mistralai/mistral-small-3.2-24b-instruct', 'vendor/unknown', 'vendor/unknown:free'])
    assert.ok(!('reasoning' in buildChatBody(model, messages, 1600)), model);
  // Every committed chain model that can reason is listed (mistral cannot).
  const cfg = resolveConfig({} as Env);
  for (const model of new Set([...modelChain(cfg, 'paid'), ...freeChain(cfg)]))
    if (!model.startsWith('mistralai/')) assert.ok(REASONING_OFF_MODELS.has(model), model);

  const sent: Body[] = [];
  const transport = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Body);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] });
  }) as typeof fetch;
  await observe('SEO?', 'google/gemma-4-31b-it:free', 'key', transport);
  await observe('SEO?', 'vendor/unknown:free', 'key', transport);
  assert.deepEqual(sent.map((body) => body.reasoning), [{ enabled: false, exclude: true }, { exclude: true }]);
});

test('allow_fallbacks: a paid model may use another provider inside max_price, a :free slug never', () => {
  const paid = buildChatBody('google/gemma-4-26b-a4b-it', messages, 1600).provider;
  assert.deepEqual(paid, { allow_fallbacks: true, max_price: { ...PAID_PRICE_CEILING } });
  const free = buildChatBody('google/gemma-4-31b-it:free', messages, 1600).provider;
  assert.deepEqual(free, { allow_fallbacks: false, max_price: { ...FREE_PRICE_CEILING } });
});

// ── Failure classes ─────────────────────────────────────────────────────────
test('OpenRouter failures: 400 by its wording, 402 by the model, 403 is a refusal', () => {
  const table: Array<[number, string, string, string]> = [
    [400, 'vendor/x', '{"error":{"message":"vendor/x is not a valid model ID","code":400}}', 'model_unavailable'],
    [400, 'vendor/x', 'No endpoints found matching your data policy', 'model_unavailable'],
    [400, 'vendor/x', '{"error":{"message":"Reasoning is mandatory for this endpoint and cannot be disabled."}}', 'bad_request'],
    [400, 'vendor/x', '', 'bad_request'],
    [401, 'vendor/x', '', 'account_unavailable'],
    [402, 'google/gemma-4-26b-a4b-it', '', 'paid_credit_exhausted'],
    [402, 'google/gemma-4-31b-it:free', '', 'account_unavailable'],
    [402, '', '', 'account_unavailable'],
    [403, 'vendor/x', '', 'content_refused'],
    [404, 'vendor/x', '', 'model_unavailable'],
    [429, 'vendor/x', '', 'rate_limit'],
    [500, 'vendor/x', '', 'provider_error'],
    [502, 'vendor/x', '', 'provider_error'],
  ];
  for (const [status, model, detail, code] of table)
    assert.equal(classifyFailureStatus(status, model, detail), code, `${status} ${model} ${detail}`);
  assert.equal(classifyFailureEnvelope({ code: 402 }, 'vendor/paid'), 'paid_credit_exhausted');
  assert.equal(classifyFailureEnvelope({ code: 400, message: 'x is not a valid model ID' }, 'x/y'), 'model_unavailable');
  assert.equal(classifyFailureEnvelope({ code: 400, message: { nested: 'not a valid model' } }, 'x/y'), 'bad_request');
  assert.equal(classifyFailureEnvelope({ code: 'overloaded' }, 'x/y'), 'provider_error');
});

test('a 400 body is read at most 2 KB, never logged, and only an unknown-model wording cools the model', async (t) => {
  const f = await withKey();
  const cfg = resolveConfig(f.env);
  const logged: string[] = [];
  for (const level of ['log', 'warn', 'error'] as const)
    t.mock.method(console, level, (...args: unknown[]) => void logged.push(args.map(String).join(' ')));
  let pulled = 0;
  let cancelled = false;
  const endless = () =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = encoder.encode(`{"error":{"message":"SECRET-VISITOR-TEXT ${'x'.repeat(1000)}`);
          pulled += chunk.byteLength;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      }),
      { status: 400 },
    );
  const bodies = openrouter(t, (_body, n) => (n === 1 ? endless() : answer('Javob')));
  const result = await chatComplete(f.env, cfg, ['vendor/a:free', 'vendor/b:free'], messages, 100, 5000);
  assert.deepEqual([result.ok, result.modelUsed], [true, 'vendor/b:free']);
  assert.ok(cancelled, 'the rest of the body is cancelled');
  assert.ok(pulled <= 4096, `read ${pulled} bytes`);
  assert.equal(health(f).length, 0, 'a refused request cools nothing down');
  assert.ok(!logged.some((line) => line.includes('SECRET-VISITOR-TEXT')));
  assert.equal(bodies.length, 2);

  // The same status naming an unknown model: one hour, in both walkers.
  t.mock.restoreAll();
  openrouter(t, () => new Response('{"error":{"message":"vendor/a:free is not a valid model ID"}}', { status: 400 }));
  const before = Date.now();
  assert.equal((await chatComplete(f.env, cfg, ['vendor/a:free'], messages, 100, 5000)).errorCode, 'model_unavailable');
  f.db.exec('DELETE FROM gpt_model_health');
  assert.deepEqual(await chatStreamStart(f.env, cfg, ['vendor/a:free'], messages, 100, 5000), {
    ok: false,
    errorCode: 'model_unavailable',
    attempts: 1,
  });
  const rows = health(f);
  assert.deepEqual(rows.map((r) => [r.model, r.code]), [['vendor/a:free', 'model_unavailable']]);
  assert.ok(Math.abs(rows[0].blocked_until - (before + 3600_000)) < 5_000);
});

test('a 403 refuses one request: no cooldown, the next model answers, and no service alert', async (t) => {
  const f = await withKey();
  const cfg = resolveConfig(f.env);
  openrouter(t, (_body, n) => (n === 1 ? new Response('', { status: 403 }) : answer('Javob')));
  const result = await chatComplete(f.env, cfg, freeChain(cfg), messages, 100, 5000);
  assert.deepEqual([result.ok, result.modelUsed], [true, freeChain(cfg)[1]]);
  assert.equal(health(f).length, 0);

  t.mock.restoreAll();
  const bodies = openrouter(t, () => new Response('', { status: 403 }));
  const response = (await (await anonymousTurn(f)).json()) as { ok: boolean; code: string };
  await drain(f);
  assert.deepEqual([response.ok, response.code], [false, 'provider_error']);
  assert.equal(bodies.length, 3);
  assert.equal(health(f).length, 0);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_service_alerts'), 0);
});

test('a 402 on a paid model in the stream skips to :free and pages the owner once', async (t) => {
  const f = await withKey();
  const order = await f.store.createOrder(f.user, 'payme', 'test', crypto.randomUUID());
  await f.store.transition(order.id, 'prepared', 'prepare');
  await f.store.transition(order.id, 'paid', 'perform');
  const chain = modelChain(resolveConfig(f.env), 'paid');
  const bodies = openrouter(t, (body) =>
    String(body.model).endsWith(':free')
      ? sse({ choices: [{ delta: { content: 'Bepul javob' } }] })
      : new Response('', { status: 402 }),
  );
  const response = await chat(
    f.ctx(
      new Request('https://gpt.test/api/gpt/chat', {
        method: 'POST',
        headers: { cookie: f.testCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Salom', locale: 'uz', stream: true }),
      }),
    ),
  );
  const wire = await response.text();
  await drain(f);
  assert.ok(wire.includes('Bepul javob'));
  assert.match(wire, new RegExp(`"type":"meta"[^\\n]*"model":"${chain[2]}"`));
  assert.deepEqual(bodies.map((b) => b.model), [chain[0], chain[2]]);
  assert.deepEqual(health(f).map((r) => [r.model, r.code]), [[OPENROUTER_PAID_WILDCARD, 'paid_credit_exhausted']]);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE code='openrouter_credit_exhausted'"), 1);
  assert.ok(isUrgentAlert('openrouter_credit_exhausted'));
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_turn_reservations WHERE status='done'"), 1);
});

// ── Attempts after the health filter ────────────────────────────────────────
test('a cooling model is filtered out before the three attempts are counted', async (t) => {
  const f = await withKey();
  const cfg = resolveConfig(f.env);
  const chain = ['v/a:free', 'w/b:free', 'x/c:free', 'y/d:free'];
  const bodies = openrouter(t, () => new Response('', { status: 503 }));
  await chatComplete(f.env, cfg, chain, messages, 100, 5000);
  assert.deepEqual(bodies.map((b) => b.model), chain.slice(0, 3), 'never more than three requests');

  f.db.exec('DELETE FROM gpt_model_health');
  f.db.exec(`INSERT INTO gpt_model_health(org_id, model, blocked_until, code) VALUES ('gptbot-consumer', 'v/a:free', ${Date.now() + 3600_000}, 'model_unavailable')`);
  assert.deepEqual(await availableModels(f.env.GPTBOT_DRAFTS_DB, chain), chain.slice(1));
  bodies.length = 0;
  await chatComplete(f.env, cfg, chain, messages, 100, 5000);
  assert.deepEqual(bodies.map((b) => b.model), chain.slice(1), 'the blocked head does not eat a slot');

  f.db.exec("DELETE FROM gpt_model_health WHERE model <> 'v/a:free'");
  bodies.length = 0;
  await chatStreamStart(f.env, cfg, chain, messages, 100, 5000);
  assert.deepEqual(bodies.map((b) => b.model), chain.slice(1), 'the same in the stream walker');

  // A lower cap (Javob's voice path asks for two) also counts requests, not
  // slots: the cooling head still costs nothing.
  f.db.exec("DELETE FROM gpt_model_health WHERE model <> 'v/a:free'");
  bodies.length = 0;
  const capped = await chatComplete(f.env, cfg, chain, messages, 100, 5000, undefined, undefined, undefined, 2);
  assert.deepEqual(bodies.map((b) => b.model), chain.slice(1, 3));
  assert.equal(capped.attempts, 2);
  // Out-of-range caps fall back inside 1..MAX_ATTEMPTS.
  for (const [cap, sent] of [[0, 1], [9, 3]] as const) {
    f.db.exec('DELETE FROM gpt_model_health');
    bodies.length = 0;
    await chatComplete(f.env, cfg, chain, messages, 100, 5000, undefined, undefined, undefined, cap);
    assert.equal(bodies.length, sent, `cap ${cap}`);
  }
});

test('every candidate cooling down: nothing is sent, the visitor reads model_unavailable, the owner chat_models_cooling', async (t) => {
  const f = await withKey();
  const cfg = resolveConfig(f.env);
  const bodies = openrouter(t, () => answer('never'));
  for (const model of freeChain(cfg))
    f.db.exec(`INSERT INTO gpt_model_health(org_id, model, blocked_until, code) VALUES ('gptbot-consumer', '${model}', ${Date.now() + 60_000}, 'rate_limit')`);
  assert.deepEqual(await chatComplete(f.env, cfg, freeChain(cfg), messages), { ok: false, errorCode: 'models_cooling', attempts: 0 });
  assert.deepEqual(await chatStreamStart(f.env, cfg, freeChain(cfg), messages), { ok: false, errorCode: 'models_cooling', attempts: 0 });
  const response = (await (await anonymousTurn(f, true)).json()) as { ok: boolean; code: string; message: string };
  await drain(f);
  assert.deepEqual([response.ok, response.code], [false, 'model_unavailable']);
  // The turn was in Uzbek (plan WP-05: the message follows the visitor's locale).
  assert.match(response.message, /^AI-chat modellari yangilanmoqda\./);
  assert.equal(bodies.length, 0);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE code='chat_models_cooling'"), 1);
  assert.ok(isUrgentAlert('chat_models_cooling'));
});

// ── Z.ai: the evaluation gate (plan decision L10) ───────────────────────────
test('Z.ai needs the approved-evaluation date as a third switch', async (t) => {
  const base = { OPENROUTER_API_KEY: secret(), ZAI_API_KEY: secret(), GPT_MODEL_PROVIDER: 'zai' } as Env;
  for (const day of [undefined, '', '2026-02-30', '30.09.2026', '2026-9-30', 'yes', '2026-09-30T00:00:00Z']) {
    const env = { ...base, GPT_ZAI_EVAL_APPROVED: day } as Env;
    const cfg = resolveConfig(env);
    assert.equal(cfg.zaiEvalApproved, '', String(day));
    for (const tier of ['free', 'paid'] as const) assert.deepEqual(webChatChain(cfg, env, tier), modelChain(cfg, tier));
  }
  const approved = { ...base, GPT_ZAI_EVAL_APPROVED: ' 2026-09-30 ' } as Env;
  const cfg = resolveConfig(approved);
  assert.equal(cfg.zaiEvalApproved, '2026-09-30');
  assert.equal(webChatChain(cfg, approved, 'free')[0], 'zai/glm-4.7-flash');
  // Without the key the date alone does nothing.
  assert.deepEqual(webChatChain(cfg, { ...approved, ZAI_API_KEY: undefined }, 'free'), freeChain(cfg));

  const hosts: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    hosts.push(new URL(input instanceof Request ? input.url : String(input)).host);
    return answer('OR');
  });
  const unapproved = resolveConfig(base);
  assert.equal((await chatComplete(base, unapproved, webChatChain(unapproved, base, 'free'), messages, 100, 5000)).ok, true);
  assert.deepEqual(hosts, ['openrouter.ai']);
});

/** What is wrong with the report behind a GPT_ZAI_EVAL_APPROVED date; [] = fine. */
function evalReportProblems(root: string, day: string): string[] {
  if (!day) return [];
  const rel = `docs/paid-chat/evals/zai-${day}.json`;
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return [`missing ${rel}`];
  let report: { date?: unknown; decision?: unknown; sheets?: unknown };
  try {
    report = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof report;
  } catch {
    return [`${rel} is not JSON`];
  }
  const problems: string[] = [];
  if (report.date !== day) problems.push('date differs from GPT_ZAI_EVAL_APPROVED');
  if (report.decision !== 'approved') problems.push('decision is not "approved"');
  if (!Array.isArray(report.sheets) || report.sheets.length === 0) problems.push('no rating sheets');
  else
    for (const sheet of report.sheets)
      if (typeof sheet !== 'string' || !fs.existsSync(path.join(root, sheet))) problems.push(`missing sheet ${String(sheet)}`);
  return problems;
}

test('a committed GPT_ZAI_EVAL_APPROVED date has its evaluation report', () => {
  const source = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  const table = /^GPT_ZAI_EVAL_APPROVED = "([^"]*)"$/m.exec(source)?.[1];
  const packed = /GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(source)?.[1];
  assert.notEqual(table, undefined);
  assert.equal((JSON.parse(packed!) as Record<string, string>).GPT_ZAI_EVAL_APPROVED, table);
  // A committed value is empty or a real day, never a typo that silently keeps Z.ai off.
  assert.equal(resolveConfig({ GPT_ZAI_EVAL_APPROVED: table } as Env).zaiEvalApproved, table);
  assert.deepEqual(evalReportProblems(ROOT, table!), []);

  // The gate itself, on a scratch tree.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zai-eval-'));
  try {
    assert.deepEqual(evalReportProblems(root, '2026-10-05'), ['missing docs/paid-chat/evals/zai-2026-10-05.json']);
    fs.mkdirSync(path.join(root, 'docs/paid-chat/evals'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs/paid-chat/eval'), { recursive: true });
    const report = path.join(root, 'docs/paid-chat/evals/zai-2026-10-05.json');
    const sheet = 'docs/paid-chat/eval/zai-blind-eval-2026-10-05-free.md';
    fs.writeFileSync(report, JSON.stringify({ date: '2026-10-05', decision: 'rejected', sheets: [sheet] }));
    assert.deepEqual(evalReportProblems(root, '2026-10-05'), ['decision is not "approved"', `missing sheet ${sheet}`]);
    fs.writeFileSync(path.join(root, sheet), '# sheet');
    fs.writeFileSync(report, JSON.stringify({ date: '2026-10-05', decision: 'approved', sheets: [sheet] }));
    assert.deepEqual(evalReportProblems(root, '2026-10-05'), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── Model probe endpoint ────────────────────────────────────────────────────
function probeCall(f: Fixture, auth: string, body?: string, query = '') {
  return probe(
    f.ctx(
      new Request(`https://gptbot.uz/api/internal/gpt-model-probe${query}`, {
        method: 'POST',
        headers: { Authorization: auth },
        ...(body === undefined ? {} : { body }),
      }),
    ) as never,
  );
}

const probeAnswer = (reasoningTokens = 0) =>
  sse(
    { choices: [{ delta: { content: 'SECRET_ANSWER_TEXT' } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 90, completion_tokens: 40, completion_tokens_details: { reasoning_tokens: reasoningTokens } } },
  );

interface ProbeModel {
  model: string;
  reasoningOff: boolean;
  planned: number;
  calls: number;
  statuses: Record<string, number>;
  errors: Record<string, number>;
  rate429: number | null;
  finishReasons: Record<string, number>;
  reasoningTokensMax: number | null;
  ttftMsMedian: number | null;
  results: Array<{ locale: string; status: number; finishReason: string | null; reasoningTokens: number | null; ttftMs: number | null; error?: string }>;
}

test('the probe: bearer only, every chain model in UZ and RU with the chat request, no text out, nothing written', async (t) => {
  const f = await withKey();
  const token = secret();
  const bodies = openrouter(t, () => probeAnswer());
  assert.equal((await probeCall(f, `Bearer ${token}`)).status, 403, 'no secret configured');
  f.env.GPT_BILLING_MAINTENANCE_SECRET = token;
  assert.equal((await probeCall(f, 'Bearer wrong')).status, 403);
  assert.equal((await probeCall(f, '')).status, 403);
  assert.equal(bodies.length, 0);

  const response = await probeCall(f, `Bearer ${token}`);
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.ok(!text.includes('SECRET_ANSWER_TEXT'), 'the answer text never leaves the endpoint');
  const result = JSON.parse(text) as { ok: boolean; maxTokens: number; firstContentTimeoutMs: number; models: ProbeModel[] };
  const cfg = resolveConfig(f.env);
  const chain = [...new Set([...modelChain(cfg, 'paid'), ...freeChain(cfg)])];
  assert.deepEqual([result.ok, result.maxTokens, result.firstContentTimeoutMs], [true, 1600, 12_000]);
  assert.deepEqual(result.models.map((m) => m.model), chain);
  for (const m of result.models) {
    assert.deepEqual(
      [m.planned, m.calls, m.statuses, m.errors, m.rate429, m.finishReasons, m.reasoningTokensMax, m.reasoningOff],
      [2, 2, { 200: 2 }, {}, 0, { stop: 2 }, 0, REASONING_OFF_MODELS.has(m.model)],
      m.model,
    );
    assert.deepEqual(m.results.map((r) => r.locale), ['uz', 'ru']);
    assert.ok(typeof m.ttftMsMedian === 'number' && m.ttftMsMedian >= 0);
  }
  // The production request: system prompt, answer budget, stream with usage,
  // the reasoning policy and the price cap of the model.
  assert.equal(bodies.length, chain.length * 2);
  for (const body of bodies) {
    const model = String(body.model);
    const expected = buildChatBody(model, [], 1600);
    assert.equal((body.messages as Array<{ content: string }>)[0].content, GPT_CHAT_SYSTEM_PROMPT);
    assert.deepEqual([body.max_tokens, body.stream, body.stream_options], [1600, true, { include_usage: true }]);
    assert.deepEqual(body.provider, expected.provider);
    assert.deepEqual(body.reasoning, expected.reasoning);
  }
  for (const table of ['gpt_model_health', 'gpt_service_alerts', 'gpt_turn_reservations', 'gpt_messages'])
    assert.equal(f.db.value(`SELECT COUNT(*) FROM ${table}`), 0, table);
});

test('the probe: 20 calls to one model measure its 429 share; an empty or failed stream is named, not hidden', async (t) => {
  const f = await withKey();
  const token = secret();
  f.env.GPT_BILLING_MAINTENANCE_SECRET = token;
  openrouter(t, (_body, n) => {
    if (n === 3 || n === 7) return new Response('', { status: 429 });
    if (n === 5) return sse({ choices: [{ delta: {}, finish_reason: 'length' }] }, { choices: [], usage: { completion_tokens: 1600, completion_tokens_details: { reasoning_tokens: 1600 } } });
    // OpenRouter answered 200, then the upstream refused inside the stream.
    if (n === 9) return sse({ error: { code: 429, message: 'SECRET upstream' } });
    if (n === 11) return new Response('{"error":{"message":"SECRET: reasoning is mandatory for this endpoint"}}', { status: 400 });
    return probeAnswer();
  });
  const response = await probeCall(f, `Bearer ${token}`, JSON.stringify({ model: 'google/gemma-4-31b-it:free', calls: 20 }));
  const text = await response.text();
  assert.ok(!text.includes('SECRET'));
  const [m] = (JSON.parse(text) as { models: ProbeModel[] }).models;
  assert.equal(m.model, 'google/gemma-4-31b-it:free');
  assert.deepEqual([m.calls, m.statuses], [20, { 200: 17, 400: 1, 429: 2 }]);
  // Every rate limit counts, whatever the HTTP status: 3 of 20, not 2.
  assert.equal(m.rate429, 0.15);
  assert.deepEqual(m.errors, { rate_limit: 3, empty: 1, bad_request: 1 });
  assert.deepEqual(m.results.slice(0, 4).map((r) => r.locale), ['uz', 'ru', 'uz', 'ru']);
  assert.equal(m.results[2].error, 'rate_limit');
  assert.deepEqual(m.results[4], { locale: 'uz', status: 200, finishReason: 'length', reasoningTokens: 1600, ttftMs: null, error: 'empty' });
  assert.equal(m.results[8].error, 'rate_limit');
  assert.equal(m.results[10].error, 'bad_request', 'a refused parameter reads apart from an unknown model');
  assert.equal(m.reasoningTokensMax, 1600);
  assert.deepEqual(m.finishReasons, { stop: 15, length: 1 });
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_model_health'), 0, 'a probe cools nothing down');
});

test('the probe refuses what it cannot measure before calling anybody', async (t) => {
  const f = await withKey();
  const token = secret();
  f.env.GPT_BILLING_MAINTENANCE_SECRET = token;
  const bodies = openrouter(t, () => probeAnswer());
  const status = async (body: string) => (await probeCall(f, `Bearer ${token}`, body)).status;
  assert.equal(await status('{not json'), 400);
  assert.equal(await status('[1]'), 400);
  assert.equal(await status(JSON.stringify({ model: 'vendor/elsewhere' })), 400, 'only chain models');
  assert.equal(await status(JSON.stringify({ model: 'zai/glm-4.7-flash' })), 400);
  for (const calls of [0, 21, 1.5, '2', null]) assert.equal(await status(JSON.stringify({ calls })), 400, String(calls));
  assert.equal(await status(JSON.stringify({ calls: 9 })), 400, 'five models × 9 calls is over the 40-call ceiling');
  assert.equal(await status('x'.repeat(300)), 413);
  assert.equal((await probeCall(f, `Bearer ${token}`, '', '?target=bot')).status, 400, 'javob or no target');
  f.env.OPENROUTER_API_KEY = undefined;
  assert.equal(await status(''), 503);
  assert.equal(bodies.length, 0);
});

interface JavobRun {
  mode: string;
  locale: string;
  ok: boolean;
  code?: string;
  issues: string[];
  model: string | null;
  retried: boolean;
  latencyMs: number;
}

test('the javob probe runs the bot reply path, text and voice in UZ and RU, and returns codes only', async (t) => {
  const f = await withKey();
  const token = secret();
  f.env.GPT_BILLING_MAINTENANCE_SECRET = token;
  const cfg = resolveConfig(f.env);
  const [head, second] = freeChain(cfg);
  const cooling = (model: string) =>
    f.db.exec(`INSERT INTO gpt_model_health(org_id, model, blocked_until, code) VALUES ('gptbot-consumer', '${model}', ${Date.now() + 3600_000}, 'model_unavailable')`);
  // The head is cooling down, as the site left the retired MiniMax all September.
  cooling(head);
  const bodies = openrouter(t, (body) => {
    const incoming = String((body.messages as Array<{ content: string }>)[1].content);
    return answer(incoming.includes('Salom')
      ? 'SECRET Albatta, boshqa kunga ko‘chiramiz. Sizga qaysi kun qulay?'
      : 'SECRET Да, давайте перенесём. Какой день вам удобен?');
  });
  const response = await probeCall(f, `Bearer ${token}`, '', '?target=javob');
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.ok(!text.includes('SECRET') && !text.includes('Salom'), 'no answer and no prompt text leaves the endpoint');
  const { runs } = JSON.parse(text) as { runs: JavobRun[] };
  assert.deepEqual(runs.map((r) => [r.mode, r.locale, r.ok, r.code, r.model, r.issues, r.retried]), [
    ['text', 'uz', true, undefined, second, [], false],
    ['text', 'ru', true, undefined, second, [], false],
    ['voice', 'uz', true, undefined, second, [], false],
    ['voice', 'ru', true, undefined, second, [], false],
  ]);
  assert.ok(bodies.every((b) => b.model === second), 'the cooling head takes no request');
  for (const table of ['gpt_service_alerts', 'gpt_turn_reservations', 'gpt_model_spend'])
    assert.equal(f.db.value(`SELECT COUNT(*) FROM ${table}`), 0, table);

  // Every model cooling: the probe says so instead of an empty success.
  for (const model of freeChain(cfg).slice(1)) cooling(model);
  bodies.length = 0;
  const cold = JSON.parse(await (await probeCall(f, `Bearer ${token}`, '', '?target=javob')).text()) as { runs: JavobRun[] };
  assert.deepEqual(cold.runs.map((r) => [r.ok, r.code]), Array(4).fill([false, 'models_cooling']));
  assert.equal(bodies.length, 0);
});

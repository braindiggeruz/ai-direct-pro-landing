// The free tier's daily budget for the paid primary (plan WP-04, decision L6):
// the atomic worst-case pre-reservation, the skip to ':free' once it is spent,
// settlement at the real cost, tenant isolation, and the web chat wiring.
// Run: node --import tsx --test tests/gpt-chat-budget.test.ts
//
// Real SQLite behind the billing fixture; fetch is mocked per test. Keys are
// random per run.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { billingFixture } from './helpers/gpt-billing-fixture';
import { BILLING_ORG } from '../functions/lib/gpt-chat/billing-config';
import { freeChain, modelChain, resolveConfig } from '../functions/lib/gpt-chat/config';
import { ACCOUNT_FREE_ID } from '../functions/lib/gpt-chat/turn-store';
import { ZAI_PAID_ALLOWED, ZAI_PREPAID_CAPABLE, ZAI_ZERO_PRICE, webChatChain } from '../functions/lib/gpt-chat/model-provider';
import { PAID_PRICE_CEILING, modelPrice } from '../functions/lib/gpt-chat/model-pricing';
import { MODEL_PRICES as STUDIO_PRICES } from '../functions/lib/studio/pricing';
import { alertRowId, alertText, isUrgentAlert } from '../functions/lib/gpt-chat/alert-policy';
import { RUNTIME_CONFIG_KEYS, hydrateRuntimeConfig } from '../functions/lib/runtime-config';
import fs from 'node:fs';
import path from 'node:path';
import { buildMessages, promptTokenBound } from '../functions/lib/gpt-chat/prompt';
import {
  FREE_PAID_BUCKET,
  ModelSpendStore,
  PACK_PAID_BUCKET,
  attemptWorstCaseMicro,
  freePaidBudget,
  packPaidBudget,
  spendDay,
  worstCaseMicroUsd,
} from '../functions/lib/gpt-chat/model-spend-store';
import { maintainBilling } from '../functions/lib/gpt-chat/billing-maintenance-store';
import { chatComplete } from '../functions/lib/gpt-chat/openrouter-chat';
import { chatStreamStart } from '../functions/lib/gpt-chat/openrouter-stream';
import { onRequestPost as chat } from '../functions/api/gpt/chat';

type Fixture = Awaited<ReturnType<typeof billingFixture>>;
type Body = { model: string; provider: { max_price: { prompt: number; completion: number } } };

const ROOT = path.resolve(import.meta.dirname, '..');
const T0 = Date.UTC(2026, 8, 30, 6);
const DAY = spendDay(T0);
const OTHER = 'other-org';
const PAID = 'google/gemma-4-26b-a4b-it';
const messages = buildMessages([], 'Salom', 10, 'uz');

function spend(f: Fixture, org = BILLING_ORG, day = spendDay(Date.now()), bucket = FREE_PAID_BUCKET) {
  const row = f.db.rows<{ reserved_micro: number; actual_micro: number; attempts: number }>(
    'SELECT reserved_micro, actual_micro, attempts FROM gpt_model_spend WHERE org_id=? AND day=? AND bucket=?',
    org,
    day,
    bucket,
  )[0];
  return row ? { ...row } : null;
}

/** The packs' row of today (UE-3). */
const packSpend = (f: Fixture) => spend(f, BILLING_ORG, spendDay(Date.now()), PACK_PAID_BUCKET);

/** An OpenRouter stream: one answer, a finish reason and the usage chunk. */
function sse(text: string, usage = { prompt_tokens: 900, completion_tokens: 100 }): Response {
  return new Response(
    [
      { choices: [{ delta: { content: text } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .concat('data: [DONE]\n\n')
      .join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

/** Mock openrouter.ai; records every request body. */
function openrouter(t: TestContext, handler: (body: Body) => Response) {
  const bodies: Body[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const host = new URL(input instanceof Request ? input.url : String(input)).host;
    if (host !== 'openrouter.ai') throw new Error(`unexpected host ${host}`);
    const body = JSON.parse(String(init?.body)) as Body;
    bodies.push(body);
    return handler(body);
  });
  return bodies;
}

async function drain(f: Fixture) {
  for (let i = 0; i < f.background.length; i++) await f.background[i];
}

async function turn(f: Fixture, options: { stream?: boolean; cookie?: string } = {}) {
  const response = await chat(
    f.ctx(
      new Request('https://gpt.test/api/gpt/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': `198.51.100.${randomBytes(1)[0]}`,
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        body: JSON.stringify({ message: 'Salom', locale: 'uz', stream: options.stream ?? true }),
      }),
    ) as never,
  );
  const text = await response.text();
  await drain(f);
  return text;
}

async function paidPrimaryFixture(dailyUsd = '1') {
  const f = await billingFixture();
  Object.assign(f.env, {
    OPENROUTER_API_KEY: randomBytes(24).toString('hex'),
    GPT_FREE_TIER_PAID_PRIMARY: 'true',
    GPT_FREE_PAID_DAILY_USD: dailyUsd,
  });
  return f;
}

test('the worst case prices the prompt bound and the whole answer at the ceiling max_price enforces', () => {
  const bound = promptTokenBound(messages);
  assert.ok(bound > 256, 'the template reserve is part of the bound');
  assert.equal(
    worstCaseMicroUsd(messages, 1600),
    Math.ceil(bound * PAID_PRICE_CEILING.prompt + 1600 * PAID_PRICE_CEILING.completion),
  );
  // The longest prompt buildMessages lets through, at the committed 1600
  // tokens: a 3000-character message at 3 bytes a character (all ‘ and ’),
  // whole, beside the system prompt; about $0.0016. Any shorter message,
  // with all the history it has room for, costs less.
  const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, content: 'Я'.repeat(8000) }));
  const longest = buildMessages(history, '‘’'.repeat(1500), 10, 'uz');
  assert.equal(longest.at(-1)!.content, '‘’'.repeat(1500));
  assert.ok(worstCaseMicroUsd(longest, 1600) <= 1_600, String(worstCaseMicroUsd(longest, 1600)));
  for (const message of ['Я'.repeat(3000), 'Salom', 'Я'.repeat(2000)])
    assert.ok(worstCaseMicroUsd(buildMessages(history, message, 10, 'ru'), 1600) <= worstCaseMicroUsd(longest, 1600));
  assert.equal(spendDay(Date.UTC(2026, 8, 30, 23, 59)), '2026-09-30');
  assert.equal(spendDay(Date.UTC(2026, 9, 1, 0, 0)), '2026-10-01');
});

test('20 concurrent reservations never pass the cap; org B has its own budget and never sees org A', async () => {
  const f = await billingFixture();
  const mine = new ModelSpendStore(f.binding, BILLING_ORG);
  const theirs = new ModelSpendStore(f.binding, OTHER);
  // A cap of 7.5 reservations admits exactly 7 of 20 racing ones.
  const results = await Promise.all(
    Array.from({ length: 20 }, () => mine.reserve(DAY, FREE_PAID_BUCKET, 1_000, 7_500)),
  );
  assert.equal(results.filter(Boolean).length, 7);
  assert.deepEqual(spend(f, BILLING_ORG, DAY), { reserved_micro: 7_000, actual_micro: 0, attempts: 7 });
  // Another tenant's spend is its own row: A's spent budget does not stop B,
  // and B's settlement does not touch A.
  assert.equal(await theirs.reserve(DAY, FREE_PAID_BUCKET, 1_000, 7_500), true);
  await theirs.settle(DAY, FREE_PAID_BUCKET, 1_000, 200);
  assert.deepEqual(spend(f, OTHER, DAY), { reserved_micro: 200, actual_micro: 200, attempts: 1 });
  assert.deepEqual(spend(f, BILLING_ORG, DAY), { reserved_micro: 7_000, actual_micro: 0, attempts: 7 });
  // The next day starts empty; a reservation larger than the cap never lands.
  assert.equal(await mine.reserve(spendDay(T0 + 86_400_000), FREE_PAID_BUCKET, 1_000, 7_500), true);
  assert.equal(await mine.reserve(DAY, 'other_bucket', 8_000, 7_500), false);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_model_spend WHERE bucket='other_bucket'"), 0);
  // Settlement returns the unused estimate, so the room comes back.
  await mine.settle(DAY, FREE_PAID_BUCKET, 1_000, 150);
  assert.deepEqual(spend(f, BILLING_ORG, DAY), { reserved_micro: 6_150, actual_micro: 150, attempts: 7 });
  assert.equal(await mine.reserve(DAY, FREE_PAID_BUCKET, 1_000, 7_500), true);
});

test('a free turn: ":free" passes untouched, the paid model reserves, a spent budget skips it once per attempt', async () => {
  const f = await billingFixture();
  const store = new ModelSpendStore(f.binding, BILLING_ORG);
  const estimate = worstCaseMicroUsd(messages, 1600);
  let exhausted = 0;
  const cfg = { freePaidDailyUsd: (estimate * 1.5) / 1_000_000, maxOutputTokens: 1600 };
  const first = freePaidBudget(store, cfg, messages, () => exhausted++, T0);
  assert.equal(await first.admit('google/gemma-4-31b-it:free'), 'ok');
  assert.equal(await first.admit('zai/glm-4.7-flash'), 'ok');
  // A Z.ai model the free tier may not call is skipped before the budget is
  // asked: one that bills per token (a pack holder's free answer walks the
  // pack's chain, R2), and a prepaid bundle that is not listed. Neither is a
  // spent budget. A listed one reserves at its list price (UE-3, below).
  assert.equal(await first.admit('zai/glm-4.5-air'), 'skip');
  assert.equal(await first.admit('zai/glm-4.7-flashx'), 'skip');
  assert.equal(await first.admit('zai/glm-5.3-flash'), 'skip');
  assert.equal(exhausted, 0);
  assert.equal(spend(f, BILLING_ORG, DAY), null, 'no row for free models');
  assert.equal(await first.admit(PAID), 'ok');
  assert.deepEqual(spend(f, BILLING_ORG, DAY), { reserved_micro: estimate, actual_micro: 0, attempts: 1 });
  // A second turn does not fit next to the first one's worst case.
  const second = freePaidBudget(store, cfg, messages, () => exhausted++, T0);
  assert.equal(await second.admit(PAID), 'skip');
  assert.equal(exhausted, 1);
  // The first answer cost 111 micro-USD: the rest of its estimate comes back.
  await first.settle(PAID, 0.000111);
  assert.deepEqual(spend(f, BILLING_ORG, DAY), { reserved_micro: 111, actual_micro: 111, attempts: 1 });
  await first.settle(PAID, 0.000111);
  assert.deepEqual(spend(f, BILLING_ORG, DAY), { reserved_micro: 111, actual_micro: 111, attempts: 1 }, 'settled once');
  assert.equal(await second.admit(PAID), 'ok');
  // Unmetered (no usage) and never-reserved models change nothing.
  await second.settle(PAID, null);
  await second.settle('mistralai/mistral-small-3.2-24b-instruct', 0.0001);
  assert.deepEqual(spend(f, BILLING_ORG, DAY), { reserved_micro: 111 + estimate, actual_micro: 111, attempts: 2 });

  // A zero budget, or one that cannot be read, never pays: skip, fail closed.
  assert.equal(await freePaidBudget(store, { ...cfg, freePaidDailyUsd: 0 }, messages, () => exhausted++, T0).admit(PAID), 'skip');
  const broken = new ModelSpendStore(
    { prepare() { throw new Error('D1 unavailable'); } } as unknown as D1Database,
    BILLING_ORG,
  );
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(await freePaidBudget(broken, cfg, messages, () => exhausted++, T0).admit(PAID), 'skip');
  } finally {
    console.warn = warn;
  }
  assert.equal(exhausted, 2, 'an unreadable budget is not reported as spent');
});

test('the chain: paid primary first only with the flag and a budget; Z.ai stays in front of it', () => {
  const on = resolveConfig({ GPT_FREE_TIER_PAID_PRIMARY: 'true' } as never);
  assert.deepEqual(webChatChain(on, {}, 'free'), [on.paidModel, ...freeChain(on)]);
  assert.deepEqual(webChatChain(resolveConfig({ GPT_FREE_TIER_PAID_PRIMARY: 'true', GPT_FREE_PAID_DAILY_USD: '0' } as never), {}, 'free'), freeChain(on));
  assert.deepEqual(webChatChain(resolveConfig({} as never), {}, 'free'), freeChain(on));
  const zai = resolveConfig({
    GPT_FREE_TIER_PAID_PRIMARY: 'true',
    GPT_MODEL_PROVIDER: 'zai',
    GPT_ZAI_EVAL_APPROVED: '2026-09-30',
  } as never);
  assert.deepEqual(webChatChain(zai, { ZAI_API_KEY: 'k' }, 'free'), ['zai/glm-4.7-flash', zai.paidModel, ...freeChain(zai)]);
  // The informational daily alert: never pages, one row a day.
  assert.equal(isUrgentAlert('free_paid_budget_exhausted'), false);
  assert.equal(alertRowId('free_paid_budget_exhausted', T0), alertRowId('free_paid_budget_exhausted', T0 + 3 * 3_600_000));
});

test('web chat: a free turn answers on the paid primary under the budget and books its real cost', async (t) => {
  const f = await paidPrimaryFixture();
  const bodies = openrouter(t, () => sse('Salom! Yordam beraman.'));
  const wire = await turn(f);
  assert.match(wire, /"type":"done"/);
  assert.deepEqual(bodies.map((b) => b.model), [PAID]);
  assert.ok(bodies[0].provider.max_price.prompt > 0, 'the paid request carries the paid ceiling');
  // 900 × 0.09 + 100 × 0.30 per million tokens = 111 micro-USD.
  assert.deepEqual(spend(f), { reserved_micro: 111, actual_micro: 111, attempts: 1 });
  assert.deepEqual(
    { ...f.db.rows('SELECT status, outcome, charged, model, cost_micro_usd, attempts FROM gpt_turn_reservations')[0] as object },
    { status: 'done', outcome: 'answered', charged: 1, model: PAID, cost_micro_usd: 111, attempts: 1 },
  );

  // The JSON path books the same way.
  t.mock.restoreAll();
  openrouter(t, () => Response.json({ choices: [{ message: { content: 'Javob' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 200 } }));
  assert.match(await turn(f, { stream: false }), /"ok":true/);
  // + 1000 × 0.09 + 200 × 0.30 = 150 micro-USD.
  assert.deepEqual(spend(f), { reserved_micro: 261, actual_micro: 261, attempts: 2 });
});

test('web chat: a spent budget sends no paid request, answers on ":free" and records the daily alert', async (t) => {
  // $0.0001 is below one worst case: every paid attempt is skipped.
  const f = await paidPrimaryFixture('0.0001');
  const bodies = openrouter(t, () => sse('Bepul javob'));
  for (let i = 0; i < 2; i++) assert.match(await turn(f), /"type":"done"/);
  assert.ok(bodies.every((b) => b.model.endsWith(':free')), 'no paid request');
  assert.equal(bodies.length, 2);
  assert.equal(spend(f), null);
  assert.deepEqual(
    f.db.rows<{ code: string }>('SELECT code FROM gpt_service_alerts').map((r) => r.code),
    ['free_paid_budget_exhausted'],
  );
  // The skipped paid model took no attempt: ':free' answered on the first.
  assert.deepEqual(
    f.db.rows<{ model: string; attempts: number }>('SELECT model, attempts FROM gpt_turn_reservations').map((r) => ({ ...r })),
    [
      { model: 'nvidia/nemotron-3-super-120b-a12b:free', attempts: 1 },
      { model: 'nvidia/nemotron-3-super-120b-a12b:free', attempts: 1 },
    ],
  );
});

test('a spent budget in front of a cooling ":free" chain is models_cooling, never the stale-chain page', async (t) => {
  // A busy day: the budget is spent and every ':free' model is cooling down
  // after 429s, so the only live candidate is the paid head, which the budget
  // skips. Nothing is sent and nothing was refused as unknown.
  const f = await paidPrimaryFixture('0.0001');
  const cfg = resolveConfig(f.env);
  const cooling = f.db.prepare("INSERT INTO gpt_model_health(org_id, model, blocked_until, code) VALUES (?,?,?,'rate_limit')");
  for (const model of freeChain(cfg)) cooling.bind(BILLING_ORG, model, Date.now() + 60_000).runSync();
  const bodies = openrouter(t, () => sse('never'));
  const chain = webChatChain(cfg, f.env, 'free');
  assert.deepEqual(chain, [PAID, ...freeChain(cfg)]);
  const admit = () => freePaidBudget(new ModelSpendStore(f.binding, BILLING_ORG), cfg, messages, () => undefined).admit;
  assert.deepEqual(
    await chatComplete(f.env, cfg, chain, messages, 100, 5000, undefined, admit()),
    { ok: false, errorCode: 'models_cooling', attempts: 0 },
  );
  assert.deepEqual(
    await chatStreamStart(f.env, cfg, chain, messages, 100, 5000, undefined, admit()),
    { ok: false, errorCode: 'models_cooling', attempts: 0 },
  );
  // Through the chat, both paths: the visitor reads model_unavailable, the
  // owner is paged chat_models_cooling (not chat_model_unavailable, "check
  // OPENROUTER_MODEL_*"), and the budget note stays in the background.
  for (const stream of [true, false])
    assert.equal((JSON.parse(await turn(f, { stream })) as { code: string }).code, 'model_unavailable');
  assert.equal(bodies.length, 0);
  assert.deepEqual(
    f.db.rows<{ code: string }>('SELECT DISTINCT code FROM gpt_service_alerts ORDER BY code').map((r) => r.code),
    ['chat_models_cooling', 'free_paid_budget_exhausted'],
  );
  assert.deepEqual(
    f.db.rows<{ status: string; outcome: string; attempts: number }>('SELECT status, outcome, attempts FROM gpt_turn_reservations').map((r) => ({ ...r })),
    [
      { status: 'released', outcome: 'no_model', attempts: 0 },
      { status: 'released', outcome: 'no_model', attempts: 0 },
    ],
  );
});

test('web chat: a failed paid attempt keeps its reservation (it may be billed) and ":free" answers', async (t) => {
  const f = await paidPrimaryFixture();
  const bodies = openrouter(t, (body) => (body.model === PAID ? new Response('', { status: 503 }) : sse('Bepul javob')));
  assert.match(await turn(f), /"type":"done"/);
  assert.deepEqual(bodies.map((b) => b.model), [PAID, 'nvidia/nemotron-3-super-120b-a12b:free']);
  const estimate = worstCaseMicroUsd(messages, resolveConfig(f.env).maxOutputTokens);
  assert.deepEqual(spend(f), { reserved_micro: estimate, actual_micro: 0, attempts: 1 });
  assert.equal(f.db.value('SELECT attempts FROM gpt_turn_reservations'), 2);
});

/** A test pack for the fixture's account, which a rehearsal session (f.testCookie) draws on. */
async function buyPack(f: Fixture) {
  const order = await f.store.createOrder(f.user, 'payme', 'test', crypto.randomUUID());
  await f.store.transition(order.id, 'prepared', 'prepare');
  await f.store.transition(order.id, 'paid', 'perform');
  return order.id;
}

test('web chat: a pack turn walks the paid chain under its own attempt ceiling and never spends the free budget', async (t) => {
  const f = await paidPrimaryFixture();
  await buyPack(f);
  // The holder's free answers of the day are spent: this one is the pack's (R2).
  const now = Date.now();
  for (let i = 0; i < resolveConfig(f.env).freeDailyLimit; i++)
    f.db
      .prepare("INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at) VALUES(?,?,?,'ip',NULL,'done',?,?)")
      .bind(BILLING_ORG, ACCOUNT_FREE_ID + crypto.randomUUID(), f.user, now, now + 120_000)
      .runSync();
  const bodies = openrouter(t, () => sse('Pullik javob'));
  assert.match(await turn(f, { cookie: f.testCookie }), /"type":"done"[^\n]*"remaining":299/);
  assert.deepEqual(bodies.map((b) => b.model), [PAID]);
  assert.equal(spend(f), null);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_model_attempts'), 1);
  // UE-3: the pack's answer is booked on the packs' own day budget, settled
  // at its price (900 × 0.09 + 100 × 0.30 = 111 micro-USD).
  assert.deepEqual(packSpend(f), { reserved_micro: 111, actual_micro: 111, attempts: 1 });
});

test('web chat: a pack holder\'s free answer walks the pack\'s chain on the free budget, never the pack\'s attempt ceiling (R2)', async (t) => {
  const f = await paidPrimaryFixture();
  await buyPack(f);
  const bodies = openrouter(t, () => sse('Pullik javob'));
  // The pack keeps all 300: the answer was a free one.
  assert.match(await turn(f, { cookie: f.testCookie }), /"type":"done"[^\n]*"remaining":300/);
  assert.deepEqual(bodies.map((b) => b.model), [PAID]);
  assert.equal(spend(f)?.attempts, 1);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_model_attempts'), 0);
  // With the free budget at 0 the holder's free answers skip the paid models
  // to the chain's ':free' one, like everyone's free answers.
  const g = await paidPrimaryFixture('0');
  await buyPack(g);
  const chain = modelChain(resolveConfig(g.env), 'paid');
  const skipped = openrouter(t, () => sse('Bepul javob'));
  assert.match(await turn(g, { cookie: g.testCookie }), /"type":"done"[^\n]*"remaining":300/);
  assert.deepEqual(skipped.map((b) => b.model), [chain.find((model) => model.endsWith(':free'))]);
  assert.equal(g.db.value('SELECT COUNT(*) FROM gpt_model_attempts'), 0);
});

test('retention: the maintenance cron drops spend and limit-hit days older than 93 days, in its own org only', async () => {
  const f = await billingFixture();
  const old = spendDay(T0 - 94 * 86_400_000);
  const recent = spendDay(T0 - 92 * 86_400_000);
  for (const org of [BILLING_ORG, OTHER])
    for (const day of [old, recent]) {
      f.db.prepare('INSERT INTO gpt_model_spend(org_id,day,bucket,reserved_micro,actual_micro,attempts) VALUES(?,?,?,1,1,1)').bind(org, day, FREE_PAID_BUCKET).runSync();
      f.db.prepare("INSERT INTO gpt_limit_hits(org_id,day,reason,tier,subject,n,first_at) VALUES(?,?,'hourly','free','subject',1,?)").bind(org, day, T0).runSync();
    }
  await maintainBilling(f.env, T0);
  for (const table of ['gpt_model_spend', 'gpt_limit_hits'])
    assert.deepEqual(
      f.db.rows<{ org_id: string; day: string }>(`SELECT org_id, day FROM ${table} ORDER BY org_id, day`).map((r) => [r.org_id, r.day]),
      [[BILLING_ORG, recent], [OTHER, old], [OTHER, recent]],
      table,
    );
});

// ── UE-3: the prepaid model's real price and the two day budgets ────────────

/** Mock api.z.ai and openrouter.ai; records the host and model of every request. */
function providers(t: TestContext, handlers: { zai?: () => Response; openrouter?: (body: Body) => Response }) {
  const seen: Array<{ host: string; model: string }> = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const host = new URL(input instanceof Request ? input.url : String(input)).host;
    const body = JSON.parse(String(init?.body)) as Body;
    seen.push({ host, model: body.model });
    if (host === 'api.z.ai' && handlers.zai) return handlers.zai();
    if (host === 'openrouter.ai' && handlers.openrouter) return handlers.openrouter(body);
    throw new Error(`unexpected host ${host}`);
  });
  return seen;
}

/** Production's model config: both tiers on the prepaid glm-5.3-flash, OpenRouter behind it. */
async function prepaidFixture(dailyUsd = '0.3') {
  const f = await billingFixture();
  Object.assign(f.env, {
    OPENROUTER_API_KEY: randomBytes(24).toString('hex'),
    ZAI_API_KEY: randomBytes(24).toString('hex'),
    GPT_MODEL_PROVIDER: 'zai',
    GPT_ZAI_EVAL_APPROVED: '2026-09-30',
    ZAI_MODEL_FREE: 'glm-5.3-flash',
    ZAI_MODEL_PAID: 'glm-5.3-flash',
    ZAI_PREPAID_MODELS: 'glm-5.3-flash',
    GPT_FREE_PAID_DAILY_USD: dailyUsd,
  });
  return f;
}

/** The holder's free answers of the day are spent: the next turn is the pack's (R2). */
function spendHolderFreeDay(f: Fixture) {
  const now = Date.now();
  for (let i = 0; i < resolveConfig(f.env).freeDailyLimit; i++)
    f.db
      .prepare("INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at) VALUES(?,?,?,'ip',NULL,'done',?,?)")
      .bind(BILLING_ORG, ACCOUNT_FREE_ID + crypto.randomUUID(), f.user, now, now + 120_000)
      .runSync();
}

test('UE-3: every Z.ai model a chain may hold has a price; glm-5.3-flash costs its list price, as in the studio', () => {
  for (const id of [...ZAI_ZERO_PRICE, ...ZAI_PAID_ALLOWED, ...ZAI_PREPAID_CAPABLE]) assert.ok(modelPrice(`zai/${id}`), id);
  assert.deepEqual(modelPrice('zai/glm-5.3-flash'), { in: 0.15, out: 0.5 });
  const studio = STUDIO_PRICES['zai/glm-5.3-flash'];
  assert.deepEqual([studio.input, studio.output], [0.15, 0.5], 'the chat and the studio price it alike');
  const bound = promptTokenBound(messages);
  assert.equal(attemptWorstCaseMicro('zai/glm-5.3-flash', messages, 1600), Math.ceil(bound * 0.15 + 1600 * 0.5));
  assert.equal(attemptWorstCaseMicro('zai/glm-4.5-air', messages, 1600), Math.ceil(bound * 0.2 + 1600 * 1.1));
  assert.equal(attemptWorstCaseMicro('zai/glm-4.7-flash', messages, 1600), 0);
  assert.equal(attemptWorstCaseMicro('google/gemma-4-31b-it:free', messages, 1600), 0);
  assert.equal(attemptWorstCaseMicro(PAID, messages, 1600), worstCaseMicroUsd(messages, 1600));
  assert.equal(attemptWorstCaseMicro('zai/glm-9-unpriced', messages, 1600), null, 'an unpriced model cannot be bounded');
  // The longest prompt buildMessages lets through, at the committed 1600
  // tokens, reserves at most $0.0025 on glm-5.3-flash: $0.3 holds 120 at once.
  const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, content: 'Я'.repeat(8000) }));
  const longest = buildMessages(history, '‘’'.repeat(1500), 10, 'uz');
  assert.ok(attemptWorstCaseMicro('zai/glm-5.3-flash', longest, 1600)! <= 2_500);
});

test('UE-3: a listed prepaid glm-5.3-flash reserves on «free» at its list price and is skipped once the day is spent', async () => {
  const f = await billingFixture();
  const store = new ModelSpendStore(f.binding, BILLING_ORG);
  const worst = attemptWorstCaseMicro('zai/glm-5.3-flash', messages, 1600)!;
  let exhausted = 0;
  const cfg = { freePaidDailyUsd: (worst * 1.5) / 1_000_000, maxOutputTokens: 1600, zaiPrepaidModels: ['glm-5.3-flash'] };
  const first = freePaidBudget(store, cfg, messages, () => exhausted++, T0);
  assert.equal(await first.admit('zai/glm-5.3-flash'), 'ok');
  assert.deepEqual(spend(f, BILLING_ORG, DAY), { reserved_micro: worst, actual_micro: 0, attempts: 1 });
  // A second free answer does not fit beside the first one's worst case.
  const second = freePaidBudget(store, cfg, messages, () => exhausted++, T0);
  assert.equal(await second.admit('zai/glm-5.3-flash'), 'skip');
  assert.equal(exhausted, 1);
  // ':free' and $0 models still pass: the free answer moves to them.
  assert.equal(await second.admit('google/gemma-4-31b-it:free'), 'ok');
  assert.equal(await second.admit('zai/glm-4.7-flash'), 'ok');
  // 1500 in, 500 out = 475 micro-USD; the rest of the worst case comes back.
  await first.settle('zai/glm-5.3-flash', 0.000475);
  assert.deepEqual(spend(f, BILLING_ORG, DAY), { reserved_micro: 475, actual_micro: 475, attempts: 1 });
  assert.equal(await second.admit('zai/glm-5.3-flash'), 'ok');
  // The packs' bucket never saw any of it; a released reservation comes back whole.
  assert.equal(spend(f, BILLING_ORG, DAY, PACK_PAID_BUCKET), null);
  const pack = packPaidBudget(store, { packPaidDailyUsd: 3, maxOutputTokens: 1600 }, messages, () => exhausted++, T0);
  assert.equal(await pack.admit('zai/glm-5.3-flash'), 'ok');
  assert.deepEqual(spend(f, BILLING_ORG, DAY, PACK_PAID_BUCKET), { reserved_micro: worst, actual_micro: 0, attempts: 1 });
  await pack.release('zai/glm-5.3-flash');
  await pack.release('zai/glm-5.3-flash');
  await pack.settle('zai/glm-5.3-flash', 0.000475);
  assert.deepEqual(spend(f, BILLING_ORG, DAY, PACK_PAID_BUCKET), { reserved_micro: 0, actual_micro: 0, attempts: 1 }, 'released once, never settled after');
  assert.equal(exhausted, 1);
});

test('web chat, production shape: a trial answer on the prepaid glm-5.3-flash books its list price on «free»; a spent day moves it to ":free"', async (t) => {
  const f = await prepaidFixture();
  const seen = providers(t, {
    zai: () => Response.json({ choices: [{ message: { content: 'Javob' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1500, completion_tokens: 500 } }),
  });
  assert.match(await turn(f, { stream: false }), /"ok":true/);
  assert.deepEqual(seen, [{ host: 'api.z.ai', model: 'glm-5.3-flash' }]);
  assert.deepEqual(spend(f), { reserved_micro: 475, actual_micro: 475, attempts: 1 });
  assert.equal(packSpend(f), null);
  assert.equal(f.db.value('SELECT cost_micro_usd FROM gpt_turn_reservations'), 475);

  // Below one worst case: Z.ai is never called, OpenRouter's ':free' answers
  // and the day's background note is written. The packs are not touched.
  t.mock.restoreAll();
  const g = await prepaidFixture('0.0001');
  const skipped = providers(t, { openrouter: () => sse('Bepul javob') });
  assert.match(await turn(g), /"type":"done"/);
  assert.ok(skipped.length > 0 && skipped.every((s) => s.host === 'openrouter.ai' && s.model.endsWith(':free')), JSON.stringify(skipped));
  assert.equal(spend(g), null);
  assert.equal(packSpend(g), null);
  assert.deepEqual(g.db.rows<{ code: string }>('SELECT code FROM gpt_service_alerts').map((r) => r.code), ['free_paid_budget_exhausted']);
});

test('web chat: a spent «packs» brake skips the billable models to ":free" without spending the ceiling, and pages the owner once a day', async (t) => {
  const f = await paidPrimaryFixture();
  await buyPack(f);
  spendHolderFreeDay(f);
  const cap = Math.floor(resolveConfig(f.env).packPaidDailyUsd * 1_000_000);
  f.db
    .prepare('INSERT INTO gpt_model_spend(org_id,day,bucket,reserved_micro,actual_micro,attempts) VALUES(?,?,?,?,?,1)')
    .bind(BILLING_ORG, spendDay(Date.now()), PACK_PAID_BUCKET, cap, cap)
    .runSync();
  const bodies = openrouter(t, () => sse('Bepul javob'));
  // Still the pack's answer, from the chain's ':free' model.
  assert.match(await turn(f, { cookie: f.testCookie }), /"type":"done"[^\n]*"remaining":299/);
  const chain = modelChain(resolveConfig(f.env), 'paid');
  assert.deepEqual(bodies.map((b) => b.model), [chain.find((model) => model.endsWith(':free'))]);
  // The skipped paid models spent no attempt of the pack's ceiling.
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_model_attempts'), 1);
  assert.deepEqual(packSpend(f), { reserved_micro: cap, actual_micro: cap, attempts: 1 });
  assert.equal(spend(f), null, 'the free budget is never a fallback for the packs');
  assert.deepEqual(
    f.db.rows<{ code: string }>('SELECT DISTINCT code FROM gpt_service_alerts').map((r) => r.code),
    ['pack_paid_budget_exhausted'],
  );
  assert.equal(isUrgentAlert('pack_paid_budget_exhausted'), true);
  assert.equal(alertRowId('pack_paid_budget_exhausted', T0), alertRowId('pack_paid_budget_exhausted', T0 + 3 * 3_600_000));
  assert.ok(alertText('pack_paid_budget_exhausted'));
  assert.ok(alertText('free_paid_budget_exhausted'));
});

test('web chat: an attempt the pack ceiling stops gives its «packs» reservation back', async (t) => {
  const f = await paidPrimaryFixture();
  const order = await buyPack(f);
  spendHolderFreeDay(f);
  // The pack's attempt ceiling (3 × message_limit) is spent.
  const limit = Number(f.db.value('SELECT message_limit FROM gpt_access_periods WHERE order_id=?', order));
  const attempt = f.db.prepare('INSERT INTO gpt_model_attempts(org_id,id,period_id,created_at) VALUES(?,?,?,?)');
  for (let i = 0; i < limit * 3; i++) attempt.bind(BILLING_ORG, crypto.randomUUID(), order, Date.now()).runSync();
  const bodies = openrouter(t, () => sse('never'));
  assert.doesNotMatch(await turn(f, { cookie: f.testCookie }), /"type":"done"/);
  assert.equal(bodies.length, 0);
  assert.deepEqual(packSpend(f), { reserved_micro: 0, actual_micro: 0, attempts: 1 });
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_model_attempts'), limit * 3);
});

test('GPT_PACK_PAID_DAILY_USD: default 3, clamped 1..50, never 0; committed 0.3 and 3 in both places', () => {
  assert.equal(resolveConfig({} as never).packPaidDailyUsd, 3);
  assert.equal(resolveConfig({ GPT_PACK_PAID_DAILY_USD: '0' } as never).packPaidDailyUsd, 1);
  assert.equal(resolveConfig({ GPT_PACK_PAID_DAILY_USD: '500' } as never).packPaidDailyUsd, 50);
  assert.equal(resolveConfig({ GPT_PACK_PAID_DAILY_USD: '7.5' } as never).packPaidDailyUsd, 7.5);
  assert.equal(resolveConfig({ GPT_PACK_PAID_DAILY_USD: 'lots' } as never).packPaidDailyUsd, 3);
  assert.ok((RUNTIME_CONFIG_KEYS as readonly string[]).includes('GPT_PACK_PAID_DAILY_USD'));
  const source = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  const packed = JSON.parse(/GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(source)![1]) as Record<string, string>;
  const table = source.slice(source.indexOf('[vars.GPTBOT_RUNTIME_CONFIG]'));
  // Decision №13: the free bucket from $1 to $0.3 a day.
  for (const [key, value] of [['GPT_FREE_PAID_DAILY_USD', '0.3'], ['GPT_PACK_PAID_DAILY_USD', '3']]) {
    assert.equal(packed[key], value, `packed ${key}`);
    assert.match(table, new RegExp(`^${key} = "${value}"\\r?$`, 'mu'), `table ${key}`);
  }
  const cfg = resolveConfig(hydrateRuntimeConfig({ GPTBOT_RUNTIME_CONFIG_JSON: JSON.stringify(packed) } as never));
  assert.deepEqual([cfg.freePaidDailyUsd, cfg.packPaidDailyUsd], [0.3, 3]);
});

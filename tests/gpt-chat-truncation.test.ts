// What a web-chat turn costs the visitor (plan WP-04, decision L4): an answer
// cut at the length limit is never charged and is marked; a stopped answer is
// charged only past GPT_STOP_CHARGE_MIN_CHARS delivered characters; the
// remaining counts are read after the settlement; every turn is recorded
// without text. Stream and JSON paths.
// Run: node --import tsx --test tests/gpt-chat-truncation.test.ts
//
// Real SQLite behind the billing fixture; fetch is mocked per test.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { billingFixture } from './helpers/gpt-billing-fixture';
import { resolveConfig } from '../functions/lib/gpt-chat/config';
import { BILLING_ORG } from '../functions/lib/gpt-chat/billing-config';
import { TurnStore } from '../functions/lib/gpt-chat/turn-store';
import {
  failureOutcome,
  isTruncated,
  settleStreamedAnswer,
  type StreamedAnswer,
} from '../functions/lib/gpt-chat/turn-outcome';
import { onRequestPost as chat } from '../functions/api/gpt/chat';

type Fixture = Awaited<ReturnType<typeof billingFixture>>;
type Row = Record<string, unknown>;

const FREE = 'nvidia/nemotron-3-super-120b-a12b:free';
const encoder = new TextEncoder();
const data = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
const delta = (content: string) => data({ choices: [{ delta: { content } }] });

/** A complete OpenRouter stream ending with `finishReason` and a usage chunk. */
function upstream(text: string, finishReason: string, usage = { prompt_tokens: 700, completion_tokens: 1600 }) {
  return new Response(
    delta(text) +
      data({ choices: [{ delta: {}, finish_reason: finishReason }] }) +
      data({ choices: [], usage: { ...usage, completion_tokens_details: { reasoning_tokens: 0 } } }) +
      'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function openrouter(t: TestContext, handler: (init?: RequestInit) => Response | Promise<Response>) {
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const host = new URL(input instanceof Request ? input.url : String(input)).host;
    if (host !== 'openrouter.ai') throw new Error(`unexpected host ${host}`);
    return handler(init);
  });
}

async function fixture(extra: Record<string, string> = {}) {
  const f = await billingFixture();
  Object.assign(f.env, { OPENROUTER_API_KEY: randomBytes(24).toString('hex'), ...extra });
  return f;
}

function request(body: Record<string, unknown>, init: { cookie?: string; signal?: AbortSignal } = {}) {
  return new Request('https://gpt.test/api/gpt/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.44',
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    body: JSON.stringify({ message: 'Salom', locale: 'uz', ...body }),
    signal: init.signal,
  });
}

async function drain(f: Fixture) {
  for (let i = 0; i < f.background.length; i++) await f.background[i];
}

/** SSE events the visitor received. */
function events(wire: string): Row[] {
  return wire
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as Row);
}

function rows(f: Fixture): Row[] {
  return f.db
    .rows<Row>(
      `SELECT status, outcome, charged, model, finish_reason, cancel_reason, ttft_ms, total_ms,
      tokens_in, tokens_out, reasoning_tokens, cost_micro_usd, attempts FROM gpt_turn_reservations ORDER BY created_at`,
    )
    .map((row) => ({ ...row }));
}

test('the settlement rules: length is never charged, Stop only past the threshold, failures never', () => {
  const answer = (over: Partial<StreamedAnswer>): StreamedAnswer => ({
    hasText: true,
    deliveredChars: 1200,
    completed: true,
    upstreamCode: null,
    clientGone: false,
    finishReason: 'stop',
    ...over,
  });
  const settle = (over: Partial<StreamedAnswer>, min = 600) => settleStreamedAnswer(answer(over), min);
  assert.deepEqual(settle({}), { outcome: 'answered', charged: true, cancelReason: null });
  assert.deepEqual(settle({ finishReason: undefined }), { outcome: 'answered', charged: true, cancelReason: null });
  for (const finishReason of ['length', 'model_context_window_exceeded'])
    assert.deepEqual(settle({ finishReason }), { outcome: 'truncated', charged: false, cancelReason: null }, finishReason);
  // Cut at the limit and then the visitor left: still never charged.
  assert.deepEqual(settle({ finishReason: 'length', clientGone: true }), { outcome: 'truncated', charged: false, cancelReason: 'client_gone' });
  // Stop: the threshold decides, 0 = never.
  assert.deepEqual(settle({ clientGone: true, completed: false, deliveredChars: 599 }), { outcome: 'client_gone', charged: false, cancelReason: 'client_gone' });
  assert.deepEqual(settle({ clientGone: true, completed: false, deliveredChars: 600 }), { outcome: 'client_gone', charged: true, cancelReason: 'client_gone' });
  assert.deepEqual(settle({ clientGone: true, deliveredChars: 5000 }, 0), { outcome: 'client_gone', charged: false, cancelReason: 'client_gone' });
  // The provider broke or never finished.
  assert.deepEqual(settle({ upstreamCode: 'provider_error', completed: false }), { outcome: 'upstream_error', charged: false, cancelReason: null });
  assert.deepEqual(settle({ upstreamCode: 'content_refused' }), { outcome: 'refused', charged: false, cancelReason: null });
  assert.deepEqual(settle({ completed: false }), { outcome: 'upstream_error', charged: false, cancelReason: null });
  assert.deepEqual(settle({ hasText: false }), { outcome: 'upstream_error', charged: false, cancelReason: null });
  // Codes of a turn without an answer.
  assert.deepEqual(
    ['aborted', 'content_refused', 'bad_request', 'no_key', 'models_cooling', 'model_unavailable', 'account_unavailable', 'budget_exhausted', 'rate_limit', 'timeout', 'provider_error', 'empty'].map(failureOutcome),
    ['client_gone', 'refused', 'refused', 'no_model', 'no_model', 'no_model', 'no_model', 'no_model', 'upstream_error', 'upstream_error', 'upstream_error', 'upstream_error'],
  );
  assert.equal(isTruncated('length'), true);
  assert.equal(isTruncated('stop'), false);
  assert.equal(isTruncated(undefined), false);
  // The committed threshold, its clamp and "0 = never".
  assert.equal(resolveConfig({} as never).stopChargeMinChars, 600);
  assert.equal(resolveConfig({ GPT_STOP_CHARGE_MIN_CHARS: '0' } as never).stopChargeMinChars, 0);
  assert.equal(resolveConfig({ GPT_STOP_CHARGE_MIN_CHARS: '-5' } as never).stopChargeMinChars, 0);
  assert.equal(resolveConfig({ GPT_STOP_CHARGE_MIN_CHARS: '999999' } as never).stopChargeMinChars, 20_000);
  assert.equal(resolveConfig({ GPT_STOP_CHARGE_MIN_CHARS: 'many' } as never).stopChargeMinChars, 600);
});

test('stream: an answer cut at the length limit is marked, not charged, and remaining is read after it', async (t) => {
  const f = await fixture();
  openrouter(t, () => upstream('Uzun javob...', 'length'));
  const wire = await (await chat(f.ctx(request({ stream: true })))).text();
  await drain(f);
  const done = events(wire).at(-1)!;
  assert.deepEqual(
    [done.type, done.truncated, done.charged, done.remaining, done.hourRemaining, done.modelUsed],
    ['done', true, false, 15, 5, FREE],
  );
  const [row] = rows(f);
  assert.equal(typeof row.ttft_ms, 'number');
  assert.equal(typeof row.total_ms, 'number');
  assert.ok((row.total_ms as number) >= (row.ttft_ms as number));
  assert.deepEqual(
    { ...row, ttft_ms: undefined, total_ms: undefined },
    {
      status: 'released', outcome: 'truncated', charged: 0, model: FREE, finish_reason: 'length',
      cancel_reason: null, ttft_ms: undefined, total_ms: undefined, tokens_in: 700, tokens_out: 1600,
      reasoning_tokens: 0, cost_micro_usd: 0, attempts: 1,
    },
  );

  // A finished answer is charged, and the counts after it say so.
  t.mock.restoreAll();
  openrouter(t, () => upstream('Qisqa javob.', 'stop', { prompt_tokens: 700, completion_tokens: 40 }));
  const next = events(await (await chat(f.ctx(request({ stream: true })))).text()).at(-1)!;
  await drain(f);
  assert.deepEqual(
    [next.type, next.truncated, next.charged, next.remaining, next.hourRemaining],
    ['done', false, true, 14, 4],
  );
  assert.deepEqual(
    rows(f).map((r) => [r.status, r.outcome, r.charged]),
    [['released', 'truncated', 0], ['done', 'answered', 1]],
  );
});

test('stream: a pack answer cut at the limit gives the answer back to the pack', async (t) => {
  const f = await fixture();
  const order = await f.store.createOrder(f.user, 'payme', 'test', crypto.randomUUID());
  await f.store.transition(order.id, 'prepared', 'prepare');
  await f.store.transition(order.id, 'paid', 'perform');
  openrouter(t, () => upstream('Uzun pullik javob...', 'length', { prompt_tokens: 1000, completion_tokens: 1600 }));
  const done = events(await (await chat(f.ctx(request({ stream: true }, { cookie: f.testCookie })))).text()).at(-1)!;
  await drain(f);
  assert.deepEqual([done.truncated, done.charged, done.remaining, done.hourRemaining], [true, false, 300, null]);
  // The model was paid for all the same: 1000 × 0.09 + 1600 × 0.30 = 570 micro-USD.
  assert.deepEqual(
    rows(f).map((r) => [r.status, r.outcome, r.model, r.cost_micro_usd]),
    [['released', 'truncated', 'google/gemma-4-26b-a4b-it', 570]],
  );
});

/** Upstream: `n` deltas of 100 characters each, then no end until the request is aborted. */
function endless(n: number) {
  return (init?: RequestInit) => {
    let sent = 0;
    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent < n) {
            controller.enqueue(encoder.encode(delta(String(sent++ % 10).repeat(100))));
            return;
          }
          return new Promise<void>((_, reject) => {
            const fail = () => reject(new DOMException('The operation was aborted', 'AbortError'));
            if (init?.signal?.aborted) fail();
            init?.signal?.addEventListener('abort', fail);
          });
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  };
}

/** Read the visitor's stream until `deltas` deltas arrived, then leave the way `how` says. */
async function stopAfter(f: Fixture, deltas: number, how: 'close' | 'signal') {
  const controller = new AbortController();
  const response = await chat(f.ctx(request({ stream: true }, { signal: controller.signal })));
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let wire = '';
  while ((wire.match(/"type":"delta"/g) ?? []).length < deltas) {
    const part = await reader.read();
    assert.ok(!part.done, 'the stream ended before the visitor stopped it');
    wire += decoder.decode(part.value, { stream: true });
  }
  if (how === 'signal') controller.abort();
  else await reader.cancel();
  await drain(f);
  return { wire, reader };
}

test('Stop: below GPT_STOP_CHARGE_MIN_CHARS the answer is free, past it charged; nothing cools down', async (t) => {
  // The visitor closes the stream after 300 characters (3 × 100).
  {
    const f = await fixture();
    openrouter(t, endless(30));
    await stopAfter(f, 3, 'close');
    const [row] = rows(f);
    assert.deepEqual(
      [row.status, row.outcome, row.charged, row.cancel_reason, row.model, row.attempts],
      ['released', 'client_gone', 0, 'client_gone', FREE, 1],
    );
    assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_model_health'), 0, 'a visitor leaving is not a model failure');
    assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_service_alerts'), 0);
    t.mock.restoreAll();
  }
  // The visitor stops after 800 characters: past 600, charged.
  {
    const f = await fixture();
    openrouter(t, endless(30));
    await stopAfter(f, 8, 'close');
    const [row] = rows(f);
    assert.deepEqual([row.status, row.outcome, row.charged, row.cancel_reason], ['done', 'client_gone', 1, 'client_gone']);
    t.mock.restoreAll();
  }
  // Threshold 0: a stopped answer is never charged, however long.
  {
    const f = await fixture({ GPT_STOP_CHARGE_MIN_CHARS: '0' });
    openrouter(t, endless(30));
    await stopAfter(f, 8, 'close');
    assert.deepEqual(rows(f).map((r) => [r.status, r.outcome, r.charged]), [['released', 'client_gone', 0]]);
    t.mock.restoreAll();
  }
});

test('a closed tab (request.signal, enable_request_signal) ends the model call and settles as client_gone', async (t) => {
  // The upstream only ends when the request's own signal aborts it.
  {
    const f = await fixture();
    openrouter(t, endless(3));
    const { reader } = await stopAfter(f, 3, 'signal');
    const [row] = rows(f);
    assert.deepEqual([row.status, row.outcome, row.charged, row.cancel_reason], ['released', 'client_gone', 0, 'client_gone']);
    assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_model_health'), 0);
    // Nothing more was sent to a visitor who is gone.
    const rest = await reader.read();
    const tail = rest.done ? '' : new TextDecoder().decode(rest.value);
    assert.doesNotMatch(tail, /"type":"(done|error)"/);
    t.mock.restoreAll();
  }
  {
    const f = await fixture({ GPT_STOP_CHARGE_MIN_CHARS: '200' });
    openrouter(t, endless(3));
    await stopAfter(f, 3, 'signal');
    assert.deepEqual(rows(f).map((r) => [r.status, r.outcome, r.charged]), [['done', 'client_gone', 1]]);
    t.mock.restoreAll();
  }
});

test('JSON: the length limit is marked and free, a finished answer is charged, a visitor who left pays nothing', async (t) => {
  const f = await fixture();
  let finishReason = 'length';
  openrouter(t, () =>
    Response.json({
      choices: [{ message: { content: 'Javob' }, finish_reason: finishReason }],
      usage: { prompt_tokens: 600, completion_tokens: 1600, completion_tokens_details: { reasoning_tokens: 0 } },
    }),
  );
  const cut = (await (await chat(f.ctx(request({})))).json()) as Row;
  await drain(f);
  assert.deepEqual(
    [cut.ok, cut.answer, cut.truncated, cut.charged, cut.remaining, cut.hourRemaining],
    [true, 'Javob', true, false, 15, 5],
  );
  finishReason = 'stop';
  const whole = (await (await chat(f.ctx(request({})))).json()) as Row;
  await drain(f);
  assert.deepEqual([whole.truncated, whole.charged, whole.remaining, whole.hourRemaining], [false, true, 14, 4]);
  assert.deepEqual(
    rows(f).map((r) => [r.status, r.outcome, r.finish_reason, r.tokens_in, r.tokens_out, r.ttft_ms, r.attempts]),
    [
      ['released', 'truncated', 'length', 600, 1600, null, 1],
      ['done', 'answered', 'stop', 600, 1600, null, 1],
    ],
  );

  // The visitor leaves while the model is still thinking.
  t.mock.restoreAll();
  const controller = new AbortController();
  openrouter(t, (init) => {
    queueMicrotask(() => controller.abort());
    return new Promise<Response>((_, reject) => {
      const fail = () => reject(new DOMException('The operation was aborted', 'AbortError'));
      if (init?.signal?.aborted) fail();
      init?.signal?.addEventListener('abort', fail);
    });
  });
  await chat(f.ctx(request({}, { signal: controller.signal })));
  await drain(f);
  const left = rows(f).at(-1)!;
  assert.deepEqual([left.status, left.outcome, left.cancel_reason, left.charged], ['released', 'client_gone', 'client_gone', 0]);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_service_alerts'), 0, 'a visitor leaving is not a service alert');
});

test('failed turns are recorded with their outcome and attempts, never charged', async (t) => {
  const f = await fixture();
  t.mock.method(console, 'warn', () => undefined);
  openrouter(t, () => new Response('', { status: 503 }));
  const body = (await (await chat(f.ctx(request({ stream: true })))).json()) as Row;
  await drain(f);
  assert.equal(body.code, 'provider_error');
  // Three chain models, three attempts, then a released upstream_error.
  assert.deepEqual(
    rows(f).map((r) => [r.status, r.outcome, r.charged, r.model, r.attempts]),
    [['released', 'upstream_error', 0, null, 3]],
  );
  // Nothing configured to answer: no_model without a single attempt.
  const g = await billingFixture();
  const none = (await (await chat({ ...g.ctx(request({})), env: { ...g.env, OPENROUTER_API_KEY: undefined } } as never)).json()) as Row;
  await drain(g);
  assert.equal(none.code, 'no_key');
  assert.deepEqual(rows(g).map((r) => [r.status, r.outcome, r.attempts]), [['released', 'no_model', 0]]);
  // A message that cannot fit the context is released as context_too_large.
  const h = await fixture();
  // 3000 characters pass validation, but 6000 bytes do not fit next to the system prompt.
  const response = await chat(h.ctx(request({ message: 'Я'.repeat(3000) })));
  assert.equal(response.status, 400);
  assert.deepEqual(rows(h).map((r) => [r.status, r.outcome, r.charged]), [['released', 'context_too_large', 0]]);
});

test('a reservation settles once, only in its own org; provider values are stored only as what they claim to be', async () => {
  const f = await fixture();
  const cfg = resolveConfig(f.env);
  const mine = new TurnStore(f.binding, BILLING_ORG);
  const theirs = new TurnStore(f.binding, 'other-org');
  const { id } = await mine.reserve('subject', 'ip', null, cfg);
  assert.ok(id);
  // Another tenant cannot settle it.
  await theirs.finish(id, { outcome: 'answered', charged: true });
  assert.deepEqual(rows(f).map((r) => [r.status, r.outcome]), [['reserved', null]]);
  await mine.finish(id, {
    outcome: 'truncated',
    charged: false,
    model: FREE,
    finishReason: 'length',
    ttftMs: 812.6,
    totalMs: -5,
    tokensIn: Number.NaN,
    tokensOut: 1600,
    reasoningTokens: undefined,
    costMicroUsd: 0,
    attempts: 2,
  });
  // A replayed settlement (a retried request, a second code path) changes nothing.
  await mine.finish(id, { outcome: 'answered', charged: true, model: 'other/model' });
  assert.deepEqual(rows(f), [{
    status: 'released', outcome: 'truncated', charged: 0, model: FREE, finish_reason: 'length', cancel_reason: null,
    ttft_ms: 813, total_ms: null, tokens_in: null, tokens_out: 1600, reasoning_tokens: null, cost_micro_usd: 0, attempts: 2,
  }]);
  assert.deepEqual(await mine.allowance('subject', 'ip', null, cfg), { remaining: 15, hourRemaining: 5 });
  assert.deepEqual(await theirs.allowance('subject', 'ip', null, cfg), { remaining: 15, hourRemaining: 5 });
});

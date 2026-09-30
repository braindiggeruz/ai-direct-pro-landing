import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryAfterSeconds, sendChatStream } from '../src/gpt-chat/api';
import { parseSseChunk } from '../functions/lib/gpt-chat/openrouter-stream';

const params = { sessionId: null, message: 'fixture', locale: 'uz' as const, history: [] };
const sse = (...events: unknown[]) => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');

test('empty completion is an error, not a successful answer', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(sse({ type: 'done' }), {
    headers: { 'Content-Type': 'text/event-stream' },
  }));
  let answer = '';
  const outcome = await sendChatStream('', params, { onDelta: text => { answer += text; } }, new AbortController().signal);
  assert.deepEqual(outcome, { mode: 'stream', ok: false, code: 'empty_response', gotText: false });
  assert.equal(answer, '');
});

test('whitespace-only deltas do not satisfy a completed answer', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(sse(
    { type: 'delta', text: ' \n\t' }, { type: 'delta', text: '\u00a0' }, { type: 'done' },
  ), { headers: { 'Content-Type': 'text/event-stream' } }));
  const deltas: string[] = [];
  const outcome = await sendChatStream('', params, { onDelta: text => { deltas.push(text); } }, new AbortController().signal);
  assert.deepEqual(outcome, { mode: 'stream', ok: false, code: 'empty_response', gotText: true });
  assert.deepEqual(deltas, [' \n\t', '\u00a0']);
});

test('Unicode answer survives split UTF-8 bytes and retains completion metadata', async (t) => {
  const bytes = new TextEncoder().encode(sse(
    { type: 'meta', sessionId: 'fixture-session', model: 'fixture-model' },
    { type: 'delta', text: 'Salom, ' }, { type: 'delta', text: 'мир 🌍' },
    { type: 'done', remaining: 4, modelUsed: 'fixture-model' },
  ));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  t.mock.method(globalThis, 'fetch', async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }));
  let answer = '';
  const metadata: unknown[] = [];
  const outcome = await sendChatStream('', params, {
    onMeta: meta => { metadata.push(meta); }, onDelta: text => { answer += text; },
  }, new AbortController().signal);
  assert.equal(answer, 'Salom, мир 🌍');
  assert.deepEqual(metadata, [{ sessionId: 'fixture-session', model: 'fixture-model' }]);
  // An older done event without the settlement fields: charged, not cut, no hour count.
  assert.deepEqual(outcome, {
    mode: 'stream', ok: true, remaining: 4, hourRemaining: null, truncated: false, charged: true, modelUsed: 'fixture-model', gotText: true,
  });
});

test('server parser: a finish_reason alone is an event, and usage carries the reasoning tokens', () => {
  // OpenRouter sends the finish reason in its own chunk, then usage in the last one.
  const state = { buffer: '' };
  const wire = sse(
    { choices: [{ delta: { content: 'Javob' }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: 'length' }] },
    { choices: [], usage: { prompt_tokens: 700, completion_tokens: 1600, completion_tokens_details: { reasoning_tokens: 0 } } },
  ) + 'data: [DONE]\n\n';
  // Split mid-line: partial lines wait in the buffer.
  const events = [...parseSseChunk(state, wire.slice(0, 40)), ...parseSseChunk(state, wire.slice(40))];
  assert.deepEqual(events, [
    { delta: 'Javob' },
    { finishReason: 'length' },
    { inputTokens: 700, outputTokens: 1600, reasoningTokens: 0 },
    { done: true },
  ]);
});

test('the settled done event carries truncated, charged and hourRemaining to the answer', async (t) => {
  // The server's done event since WP-04: an answer cut at the length limit is
  // not charged (decision L4) and the chat marks it.
  t.mock.method(globalThis, 'fetch', async () => new Response(sse(
    { type: 'meta', sessionId: 'fixture-session', model: 'fixture-model' },
    { type: 'delta', text: 'Uzun javob' },
    { type: 'done', remaining: 15, hourRemaining: 4, modelUsed: 'fixture-model', truncated: true, charged: false },
  ), { headers: { 'Content-Type': 'text/event-stream' } }));
  let answer = '';
  const outcome = await sendChatStream('', params, { onDelta: text => { answer += text; } }, new AbortController().signal);
  assert.equal(answer, 'Uzun javob');
  assert.deepEqual(outcome, {
    mode: 'stream', ok: true, remaining: 15, hourRemaining: 4, truncated: true, charged: false, modelUsed: 'fixture-model', gotText: true,
  });
});

test('a malformed settlement reads as a charged, whole answer without an hour count', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(sse(
    { type: 'delta', text: 'Javob' },
    { type: 'done', remaining: 3, hourRemaining: -2, truncated: 'yes', charged: 0 },
  ), { headers: { 'Content-Type': 'text/event-stream' } }));
  const outcome = await sendChatStream('', params, { onDelta: () => {} }, new AbortController().signal);
  assert.deepEqual(outcome, { mode: 'stream', ok: true, remaining: 3, hourRemaining: null, truncated: false, charged: true, modelUsed: undefined, gotText: true });
});

test('a 429 reaches the chat with retryAfterSec from the body, else from Retry-After', async (t) => {
  const refusal = { ok: false, code: 'limit_reached', reason: 'hourly', tier: 'free', remaining: 9, limits: { daily: 15, hourly: 5 }, retryAt: 1_700_000_720_000, retryAfterSec: 720, message: 'x' };
  const fetches = [
    Response.json(refusal, { status: 429, headers: { 'Retry-After': '999' } }),
    Response.json({ ...refusal, retryAfterSec: undefined }, { status: 429, headers: { 'Retry-After': '1800' } }),
    Response.json({ ...refusal, retryAfterSec: undefined }, { status: 429 }),
  ];
  t.mock.method(globalThis, 'fetch', async () => fetches.shift()!);
  const expected = [720, 1800, null];
  for (const retryAfterSec of expected) {
    const outcome = await sendChatStream('', params, { onDelta: () => assert.fail('a refusal has no deltas') }, new AbortController().signal);
    assert.equal(outcome.mode, 'json');
    if (outcome.mode !== 'json') continue;
    assert.equal(outcome.res.code, 'limit_reached');
    assert.equal(outcome.res.reason, 'hourly');
    assert.deepEqual(outcome.res.limits, { daily: 15, hourly: 5 });
    assert.equal(outcome.res.retryAfterSec, retryAfterSec);
  }
});

test('retryAfterSeconds reads only a number of seconds', () => {
  assert.equal(retryAfterSeconds({ retryAfterSec: 0 }, null), 0);
  assert.equal(retryAfterSeconds({ retryAfterSec: 12.5 }, '60'), 12.5);
  assert.equal(retryAfterSeconds({ retryAfterSec: -1 }, ' 60 '), 60);
  assert.equal(retryAfterSeconds({ retryAfterSec: '60' }, null), null);
  // An HTTP date, a negative or a fractional header is not a delay in seconds.
  for (const header of ['Wed, 01 Oct 2026 10:00:00 GMT', '-5', '1.5', '']) assert.equal(retryAfterSeconds({}, header), null, header);
  assert.equal(retryAfterSeconds(null, '30'), 30);
});

test('partial text followed by an error remains an error with the partial answer available', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(sse(
    { type: 'delta', text: 'Partial answer' }, { type: 'error', code: 'provider_error' },
  ), { headers: { 'Content-Type': 'text/event-stream' } }));
  let answer = '';
  const outcome = await sendChatStream('', params, { onDelta: text => { answer += text; } }, new AbortController().signal);
  assert.equal(answer, 'Partial answer');
  assert.deepEqual(outcome, { mode: 'stream', ok: false, code: 'provider_error', gotText: true });
});

test('stopping after a delta preserves the explicit aborted outcome', async (t) => {
  const controller = new AbortController();
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async () => ({
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body: { getReader: () => ({ read: async () => {
      if (reads++ === 0) return { done: false, value: new TextEncoder().encode(sse({ type: 'delta', text: 'Partial' })) };
      assert.equal(controller.signal.aborted, true);
      throw new DOMException('Stopped by visitor', 'AbortError');
    } }) },
  }));
  let answer = '';
  const outcome = await sendChatStream('', params, { onDelta: text => { answer += text; controller.abort(); } }, controller.signal);
  assert.equal(answer, 'Partial');
  assert.deepEqual(outcome, { mode: 'stream', ok: false, aborted: true, gotText: true });
});

test('plain JSON responses keep the existing compatibility path', async (t) => {
  const res = { ok: true, answer: 'JSON answer', remaining: 3 };
  t.mock.method(globalThis, 'fetch', async () => Response.json(res));
  const outcome = await sendChatStream('', params, { onDelta: () => assert.fail('JSON does not emit deltas') }, new AbortController().signal);
  assert.deepEqual(outcome, { mode: 'json', res });
});

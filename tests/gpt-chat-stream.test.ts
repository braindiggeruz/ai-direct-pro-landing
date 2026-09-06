import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendChatStream } from '../src/gpt-chat/api';

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
  assert.deepEqual(outcome, { mode: 'stream', ok: true, remaining: 4, modelUsed: 'fixture-model', gotText: true });
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

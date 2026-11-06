import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { freeChain, resolveConfig } from '../functions/lib/gpt-chat/config';
import { chatComplete, classifyFailureStatus } from '../functions/lib/gpt-chat/openrouter-chat';
import { chatStreamStart } from '../functions/lib/gpt-chat/openrouter-stream';
import type { Env } from '../functions/_types';
import { hydrateRuntimeConfig } from '../functions/lib/runtime-config';
import { webChatChain } from '../functions/lib/gpt-chat/model-provider';

const env = { OPENROUTER_API_KEY: 'test-key' } as never;
const cfg = resolveConfig(env);
const messages = [{ role: 'user' as const, content: 'Salom' }];

/** The value of one `KEY = "value"` line of wrangler.toml's [vars.GPTBOT_RUNTIME_CONFIG]. */
function wranglerVar(name: string): string | undefined {
  const wrangler = fs.readFileSync('wrangler.toml', 'utf8');
  return new RegExp(`^${name}\\s*=\\s*"([^"]*)"\\s*$`, 'm').exec(wrangler)?.[1];
}

test('production model defaults and wrangler vars stay identical', () => {
  const free = ['dots-studio/dots-3-note-preview:free', 'google/gemma-4-31b-it:free'];
  const paid = ['google/gemma-4-26b-a4b-it', 'mistralai/mistral-small-3.2-24b-instruct', 'google/gemma-4-31b-it:free'];
  assert.deepEqual([cfg.freeModel, ...cfg.freeFallbacks], free);
  assert.deepEqual([cfg.paidModel, ...cfg.paidFallbacks], paid);
  assert.equal(wranglerVar('OPENROUTER_MODEL_FREE'), free[0]);
  assert.equal(wranglerVar('OPENROUTER_MODEL_FREE_FALLBACKS'), free.slice(1).join(','));
  assert.equal(wranglerVar('OPENROUTER_MODEL_PAID'), paid[0]);
  assert.equal(wranglerVar('OPENROUTER_MODEL_PAID_FALLBACKS'), paid.slice(1).join(','));
  assert.equal(new Set(freeChain(cfg)).size, free.length);
  // The paid chain ends in a ':free' model: a paid turn still gets an answer
  // when a 402 takes the paid models out.
  assert.match(paid[paid.length - 1], /:free$/);
});

test('committed web fallback survives Z.ai and dots failures without calling the retired model', async (t) => {
  const source = fs.readFileSync('wrangler.toml', 'utf8');
  const packed = /GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(source)?.[1];
  assert.ok(packed);
  const runtime = hydrateRuntimeConfig({
    GPTBOT_RUNTIME_CONFIG_JSON: packed,
    OPENROUTER_API_KEY: 'test-openrouter-key',
    ZAI_API_KEY: 'test-zai-key',
  } as Env & { GPTBOT_RUNTIME_CONFIG_JSON: string });
  const current = resolveConfig(runtime);
  const chain = webChatChain(current, runtime, 'free');
  assert.deepEqual(chain, ['zai/glm-5.3-flash', ...freeChain(cfg)]);
  assert.equal(chain.length, new Set(chain).size);
  assert.ok(!chain.includes('nvidia/nemotron-3-super-120b-a12b:free'));
  assert.equal(current.freePaidDailyUsd, 0.3);
  assert.equal(current.packPaidDailyUsd, 3);

  const requested: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string; stream?: boolean };
    requested.push(body.model);
    if (body.model === 'glm-5.3-flash') return Response.json({ error: { code: '1200' } }, { status: 500 });
    if (body.model === freeChain(cfg)[0]) return new Response('', { status: 429 });
    assert.equal(body.model, freeChain(cfg)[1]);
    return body.stream
      ? new Response('data: {"choices":[{"delta":{"content":"Salom!"}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
      : Response.json({ choices: [{ message: { content: 'Salom!' }, finish_reason: 'stop' }] });
  });
  const json = await chatComplete(runtime, current, chain, messages, 100, 1000);
  assert.equal(json.ok, true);
  assert.equal(json.modelUsed, freeChain(cfg)[1]);
  assert.equal(json.attempts, 3);
  assert.deepEqual(requested, ['glm-5.3-flash', ...freeChain(cfg)]);
  requested.length = 0;
  const stream = await chatStreamStart(runtime, current, chain, messages, 100, 1000);
  assert.equal(stream.ok, true);
  assert.equal(stream.attempts, 3);
  assert.deepEqual(requested, ['glm-5.3-flash', ...freeChain(cfg)]);
  if (stream.ok) {
    assert.equal(stream.model, freeChain(cfg)[1]);
    await stream.body.cancel();
    stream.abort();
  }
});

test('AEO measures only models of the free chain, which the hourly catalogue check watches', () => {
  // The catalogue check (billing-operations-store.ts) asks OpenRouter about
  // the chain models only; a retired AEO-only slug would fail unnoticed.
  const aeo = (wranglerVar('AEO_MEASUREMENT_MODELS') ?? '').split(',').filter(Boolean);
  assert.ok(aeo.length > 0);
  for (const model of aeo) assert.ok(freeChain(cfg).includes(model), model);
});

test('retired-model statuses are classified distinctly from transient failures', () => {
  assert.equal(classifyFailureStatus(400, 'vendor/x', '{"error":{"message":"vendor/x is not a valid model ID"}}'), 'model_unavailable');
  assert.equal(classifyFailureStatus(400, 'vendor/x', 'No endpoints found for vendor/x.'), 'model_unavailable');
  assert.equal(classifyFailureStatus(404), 'model_unavailable');
  assert.equal(classifyFailureStatus(429), 'rate_limit');
  assert.equal(classifyFailureStatus(503), 'provider_error');
});

test('non-streaming and streaming chains both expose all-models-unavailable', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response('unknown model', { status: 404 });
  try {
    const chain = ['vendor/a:free', 'vendor/b:free'];
    const complete = await chatComplete(env, cfg, chain, messages, 100, 1000);
    assert.deepEqual(complete, { ok: false, errorCode: 'model_unavailable', attempts: 2 });
    const stream = await chatStreamStart(env, cfg, chain, messages, 100, 1000);
    assert.deepEqual(stream, { ok: false, errorCode: 'model_unavailable', attempts: 2 });
  } finally {
    globalThis.fetch = previous;
  }
});

test('a transient failure prevents a mixed chain from being mislabeled stale', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => new Response('', { status: ++calls === 1 ? 404 : 429 });
  try {
    const result = await chatStreamStart(env, cfg, ['vendor/a', 'vendor/b'], messages, 100, 1000);
    assert.deepEqual(result, { ok: false, errorCode: 'rate_limit', attempts: 2 });
  } finally {
    globalThis.fetch = previous;
  }
});

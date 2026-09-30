import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { freeChain, resolveConfig } from '../functions/lib/gpt-chat/config';
import { chatComplete, classifyFailureStatus } from '../functions/lib/gpt-chat/openrouter-chat';
import { chatStreamStart } from '../functions/lib/gpt-chat/openrouter-stream';

const env = { OPENROUTER_API_KEY: 'test-key' } as never;
const cfg = resolveConfig(env);
const messages = [{ role: 'user' as const, content: 'Salom' }];

/** The value of one `KEY = "value"` line of wrangler.toml's [vars.GPTBOT_RUNTIME_CONFIG]. */
function wranglerVar(name: string): string | undefined {
  const wrangler = fs.readFileSync('wrangler.toml', 'utf8');
  return new RegExp(`^${name}\\s*=\\s*"([^"]*)"\\s*$`, 'm').exec(wrangler)?.[1];
}

test('production model defaults and wrangler vars stay identical', () => {
  const free = ['nvidia/nemotron-3-super-120b-a12b:free', 'dots-studio/dots-3-note-preview:free', 'google/gemma-4-31b-it:free'];
  const paid = ['google/gemma-4-26b-a4b-it', 'mistralai/mistral-small-3.2-24b-instruct', 'google/gemma-4-31b-it:free'];
  assert.deepEqual([cfg.freeModel, ...cfg.freeFallbacks], free);
  assert.deepEqual([cfg.paidModel, ...cfg.paidFallbacks], paid);
  assert.equal(wranglerVar('OPENROUTER_MODEL_FREE'), free[0]);
  assert.equal(wranglerVar('OPENROUTER_MODEL_FREE_FALLBACKS'), free.slice(1).join(','));
  assert.equal(wranglerVar('OPENROUTER_MODEL_PAID'), paid[0]);
  assert.equal(wranglerVar('OPENROUTER_MODEL_PAID_FALLBACKS'), paid.slice(1).join(','));
  assert.equal(new Set(free).size, 3);
  // The paid chain ends in a ':free' model: a paid turn still gets an answer
  // when a 402 takes the paid models out.
  assert.match(paid[paid.length - 1], /:free$/);
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

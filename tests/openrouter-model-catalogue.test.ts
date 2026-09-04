import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { resolveConfig } from '../functions/lib/gpt-chat/config';
import { chatComplete, classifyFailureStatus } from '../functions/lib/gpt-chat/openrouter-chat';
import { chatStreamStart } from '../functions/lib/gpt-chat/openrouter-stream';

const env = { OPENROUTER_API_KEY: 'test-key' } as never;
const cfg = resolveConfig(env);
const messages = [{ role: 'user' as const, content: 'Salom' }];

test('production free-model defaults and wrangler vars stay identical', () => {
  const wrangler = fs.readFileSync('wrangler.toml', 'utf8');
  assert.match(wrangler, /OPENROUTER_MODEL_FREE\s*=\s*"minimax\/minimax-m3:free"/);
  assert.match(
    wrangler,
    /OPENROUTER_MODEL_FREE_FALLBACKS\s*=\s*"nvidia\/nemotron-3-super-120b-a12b:free,dots-studio\/dots-3-note-preview:free"/,
  );
  assert.deepEqual([cfg.freeModel, ...cfg.freeFallbacks], [
    'minimax/minimax-m3:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'dots-studio/dots-3-note-preview:free',
  ]);
  assert.equal(new Set([cfg.freeModel, ...cfg.freeFallbacks]).size, 3);
});

test('retired-model statuses are classified distinctly from transient failures', () => {
  assert.equal(classifyFailureStatus(400), 'model_unavailable');
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
    assert.deepEqual(complete, { ok: false, errorCode: 'model_unavailable' });
    const stream = await chatStreamStart(env, cfg, chain, messages, 100, 1000);
    assert.deepEqual(stream, { ok: false, errorCode: 'model_unavailable' });
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
    assert.deepEqual(result, { ok: false, errorCode: 'rate_limit' });
  } finally {
    globalThis.fetch = previous;
  }
});

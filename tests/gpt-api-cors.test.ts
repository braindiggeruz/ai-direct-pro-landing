import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest as middleware } from '../functions/_middleware';

function call(request: Request, next = async () => Response.json({ ok: true }, {
  headers: { 'Access-Control-Allow-Origin': '*' },
})) {
  return middleware({ request, env: {}, next } as never);
}

test('GPT API preflight is same-origin and credential-aware', async () => {
  const denied = await call(new Request('https://gptbot.uz/api/gpt/lead', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example' },
  }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);

  const allowed = await call(new Request('https://gptbot.uz/api/gpt/lead', {
    method: 'OPTIONS',
    headers: { Origin: 'https://gptbot.uz' },
  }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://gptbot.uz');
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), 'true');
});

test('GPT API never reflects a foreign origin on normal responses', async () => {
  const denied = await call(new Request('https://gptbot.uz/api/gpt/history?sessionId=s', {
    headers: { Origin: 'https://evil.example' },
  }));
  assert.equal(denied.status, 200);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(denied.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');

  const allowed = await call(new Request('https://gptbot.uz/api/gpt/history?sessionId=s', {
    headers: { Origin: 'https://gptbot.uz' },
  }));
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://gptbot.uz');
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), 'true');
});

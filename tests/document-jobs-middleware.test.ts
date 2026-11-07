import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequest as middleware } from '../functions/_middleware';

const BROWSER_PATHS = ['/api/studio/documents', '/api/studio/documents/doc_x/download', '/api/admin/documents', '/api/admin/documents/doc_x/cancel'];
const WORKER_PATHS = ['/api/internal/documents', '/api/internal/documents/claim', '/api/internal/documents/doc_x/complete', '/api/internal/documents/maintenance'];
const unsafeRoute = async () => new Response('%PDF-example', { headers: {
  'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=600',
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*',
} });
const call = (request: Request, next = unsafeRoute) => middleware({ request, env: {}, next } as never) as Promise<Response>;

function privateHeaders(response: Response) {
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
}
test('document preflights reject foreign/missing origins and never execute the route', async () => {
  for (const path of [...BROWSER_PATHS, ...WORKER_PATHS]) for (const origin of [undefined, 'https://evil.example', 'https://gptbot.uz.evil.example', 'null', 'http://gptbot.uz']) {
    const response = await call(new Request(`https://gptbot.uz${path}`, { method: 'OPTIONS', headers: origin ? { Origin: origin } : {} }), async () => { assert.fail('preflight must not execute a document route'); });
    assert.equal(response.status, 403, path);
    privateHeaders(response);
    assert.equal(Array.from(response.headers.keys()).some(key => key.startsWith('access-control-')), false, path);
  }
});
test('same-origin document browser preflights allow Idempotency-Key; worker preflights still deny', async () => {
  for (const path of BROWSER_PATHS) {
    const response = await call(new Request(`https://gptbot.uz${path}`, { method: 'OPTIONS', headers: { Origin: 'https://gptbot.uz', 'Access-Control-Request-Headers': 'content-type,authorization,idempotency-key' } }));
    assert.equal(response.status, 204, path);
    privateHeaders(response);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://gptbot.uz');
    assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization, Idempotency-Key');
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  }
  for (const path of WORKER_PATHS) {
    const response = await call(new Request(`https://gptbot.uz${path}`, { method: 'OPTIONS', headers: { Origin: 'https://gptbot.uz' } }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
});
test('document responses override unsafe route headers, preserving PDF bytes and HTTP status', async () => {
  for (const path of [...BROWSER_PATHS, ...WORKER_PATHS]) for (const origin of [undefined, 'https://evil.example', 'https://gptbot.uz']) {
    const response = await call(new Request(`https://gptbot.uz${path}`, { headers: origin ? { Origin: origin } : {} }));
    privateHeaders(response);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '%PDF-example');
    assert.equal(response.headers.get('Content-Type'), 'application/pdf');
    const allow = BROWSER_PATHS.includes(path) && origin === 'https://gptbot.uz';
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), allow ? origin : null, path);
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'), allow ? 'true' : null, path);
    assert.equal(response.headers.get('Access-Control-Expose-Headers'), null);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), null);
  }
  const error = await call(new Request('https://gptbot.uz/api/admin/documents'), async () => Response.json({ error: 'identity_required' }, { status: 401 }));
  assert.equal(error.status, 401);
  privateHeaders(error);
});
test('document API query parameters never invoke SEO redirects; adjacent API families retain their contract', async () => {
  const response = await call(new Request('https://gptbot.uz/api/internal/documents/claim?lang=ru'));
  assert.equal(response.status, 200);
  privateHeaders(response);
  for (const path of ['/api/admin/documents-export', '/api/internal/documents-old']) {
    const sibling = await call(new Request(`https://gptbot.uz${path}`, { headers: { Origin: 'https://evil.example' } }));
    assert.equal(sibling.headers.get('Access-Control-Allow-Origin'), 'https://evil.example');
    assert.equal(sibling.headers.get('Cache-Control'), 'public, max-age=600');
  }
});

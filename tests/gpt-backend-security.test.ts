// Security regression suite for the Railway backend (R0.2).
//
// These tests boot the REAL Fastify application (apps/gpt-backend/src/app.ts)
// in-process via app.inject() — no fake routes, no listening socket, no
// network. Supabase is left unconfigured (Store(null)) and OPENROUTER_API_KEY
// is absent, so every provider path short-circuits before fetch().
//
// Run: node --import tsx --test tests/gpt-backend-security.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';

// Silence request logging before app.ts (and therefore logger.ts) is evaluated.
// Static ESM imports are hoisted, so the app is pulled in dynamically instead.
process.env.LOG_LEVEL = 'silent';

const { buildApp, BODY_LIMIT_BYTES } = await import('../apps/gpt-backend/src/app.ts');
const { loadConfig } = await import('../apps/gpt-backend/src/env.ts');
const { loggerOptions } = await import('../apps/gpt-backend/src/logger.ts');
const { Store } = await import('../apps/gpt-backend/src/store.ts');

const GATEWAY_SECRET = 'internal-gateway-secret-value-r02';
const ADMIN_KEY = 'admin-api-key-value-r02';
const ORIGIN = 'https://gptbot.uz';

/** Store that records every method call, so "no mutation" can be proven. */
function recordingStore() {
  const calls: string[] = [];
  const real = new Store(null);
  const proxy = new Proxy(real, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          calls.push(String(prop));
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    },
  });
  return { store: proxy as InstanceType<typeof Store>, calls };
}

function buildTestApp(
  overrides: Record<string, string> = {},
  appOpts: Parameters<typeof buildApp>[1] = {},
) {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: ORIGIN,
    GPT_HASH_SALT: 'test-salt',
    GPTBOT_INTERNAL_API_SECRET: GATEWAY_SECRET,
    // Distinct from the gateway secret on purpose: the admin surface must have
    // its own credential, not merely "any internal caller".
    ADMIN_API_KEY: ADMIN_KEY,
    ...overrides,
  } as NodeJS.ProcessEnv);
  const { store, calls } = recordingStore();
  const app = buildApp({ cfg, store }, appOpts);
  return { app, calls, cfg };
}

let app: ReturnType<typeof buildTestApp>['app'];
let storeCalls: string[];

// Count provider egress attempts. The backend must never reach OpenRouter for
// a rejected request; openrouter.ts also short-circuits on a missing API key.
const realFetch = globalThis.fetch;
let fetchCalls = 0;

before(async () => {
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('provider egress must not happen in tests');
  }) as typeof realFetch;
  const built = buildTestApp();
  app = built.app;
  storeCalls = built.calls;
  await app.ready();
});

after(async () => {
  globalThis.fetch = realFetch;
  await app.close();
});

const chatBody = { message: 'привет', locale: 'ru' };

function post(url: string, opts: { headers?: Record<string, string>; payload?: unknown } = {}) {
  return app.inject({ method: 'POST', url, headers: opts.headers, payload: opts.payload as never });
}

// ── 1-3. Internal gateway secret is mandatory on the costly ingress ────────
test('chat rejects a request with no internal gateway secret', async () => {
  const res = await post('/v1/gpt/chat', { payload: chatBody });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'unauthorized');
});

test('chat rejects a wrong internal gateway secret', async () => {
  const res = await post('/v1/gpt/chat', {
    headers: { 'x-internal-secret': `${GATEWAY_SECRET}-wrong` },
    payload: chatBody,
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'unauthorized');
});

test('chat with a valid gateway secret passes auth and continues into the route', async () => {
  const res = await post('/v1/gpt/chat', {
    headers: { 'x-internal-secret': GATEWAY_SECRET },
    payload: chatBody,
  });
  // Auth passed: the response is the provider-unconfigured business answer,
  // never the 401 unauthorized envelope.
  assert.notEqual(res.statusCode, 401);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'provider_error');
});

// ── 4-5. The secret never leaves the process ──────────────────────────────
test('the internal secret never appears in any response body or header', async () => {
  const responses = await Promise.all([
    post('/v1/gpt/chat', { headers: { 'x-internal-secret': GATEWAY_SECRET }, payload: chatBody }),
    post('/v1/gpt/chat', { headers: { 'x-internal-secret': 'wrong' }, payload: chatBody }),
    app.inject({ method: 'GET', url: '/health' }),
    post('/v1/internal/ping', { headers: { 'x-internal-secret': GATEWAY_SECRET } }),
  ]);
  for (const res of responses) {
    assert.ok(!res.body.includes(GATEWAY_SECRET), 'secret leaked into a response body');
    assert.ok(!JSON.stringify(res.headers).includes(GATEWAY_SECRET), 'secret leaked into headers');
    assert.ok(!res.body.includes(ADMIN_KEY), 'admin key leaked into a response body');
  }
});

test('the running app never writes the internal secret to its logs', async () => {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  // Same production redaction config, at a level that actually emits, with the
  // output captured instead of going to stdout.
  const built = buildTestApp({}, { logger: { ...loggerOptions, level: 'trace', stream: sink } });
  const logged = built.app;
  await logged.ready();
  try {
    await logged.inject({
      method: 'POST',
      url: '/v1/gpt/chat',
      headers: {
        'x-internal-secret': GATEWAY_SECRET,
        authorization: `Bearer ${GATEWAY_SECRET}`,
        'x-admin-key': ADMIN_KEY,
      },
      payload: chatBody,
    });
    // An error path logs too, via setErrorHandler.
    await logged.inject({
      method: 'POST',
      url: '/v1/gpt/chat',
      headers: { 'x-internal-secret': GATEWAY_SECRET, 'content-type': 'application/json' },
      payload: '{"broken"',
    });
  } finally {
    await logged.close();
  }

  const output = lines.join('');
  assert.ok(output.length > 0, 'app produced no log output');
  assert.ok(output.includes('/v1/gpt/chat'), 'request logging is not actually running');
  assert.ok(!output.includes(GATEWAY_SECRET), 'internal secret reached the logs');
  assert.ok(!output.includes(ADMIN_KEY), 'admin key reached the logs');
});

test('production redaction censors credential headers whenever a request is logged', async () => {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const built = buildTestApp({}, { logger: { ...loggerOptions, level: 'trace', stream: sink } });
  const logged = built.app;
  await logged.ready();
  try {
    // Two independent defences are asserted here:
    //  1. the request serializer emits only method/url/host/remoteAddress, so
    //     credential headers are never serialized in the first place;
    //  2. credential-shaped fields logged anywhere else are censored.
    logged.log.info(
      { custom: { internalSecret: GATEWAY_SECRET, apiKey: GATEWAY_SECRET, OPENROUTER_API_KEY: GATEWAY_SECRET } },
      'probe',
    );
    await logged.inject({
      method: 'POST',
      url: '/v1/internal/ping',
      headers: { 'x-internal-secret': GATEWAY_SECRET, authorization: `Bearer ${GATEWAY_SECRET}` },
    });
  } finally {
    await logged.close();
  }

  const output = lines.join('');
  assert.ok(output.includes('"probe"'), 'the probe line was not logged — test would prove nothing');
  assert.ok(output.includes('[redacted]'), 'redaction censor marker missing');
  assert.ok(!output.includes(GATEWAY_SECRET), 'a credential value reached the logs');
  // The request serializer must not widen into full header dumps.
  assert.ok(!output.includes('x-internal-secret'), 'request headers were serialized into the logs');
  assert.ok(!output.toLowerCase().includes('bearer '), 'an authorization header reached the logs');
});

// ── 6-9. Body validation ──────────────────────────────────────────────────
test('malformed JSON is rejected with a controlled 4xx, not a 500', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/gpt/chat',
    headers: { 'x-internal-secret': GATEWAY_SECRET, 'content-type': 'application/json' },
    payload: '{"message": "broken"',
  });
  assert.ok(res.statusCode >= 400 && res.statusCode < 500, `expected 4xx, got ${res.statusCode}`);
  assert.ok(!res.body.includes('SyntaxError'), 'parser internals leaked to the client');
  assert.ok(!res.body.toLowerCase().includes('at object.'), 'stack frame leaked to the client');
});

test('a body failing the schema is rejected with 400', async () => {
  const res = await post('/v1/gpt/chat', {
    headers: { 'x-internal-secret': GATEWAY_SECRET },
    payload: { message: 'hi', locale: 'de' }, // locale is a closed ru|uz enum
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'bad_request');
});

test('a missing required property is rejected', async () => {
  const res = await post('/v1/gpt/chat', {
    headers: { 'x-internal-secret': GATEWAY_SECRET },
    payload: { locale: 'ru' }, // no message
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'bad_request');

  const empty = await post('/v1/gpt/chat', {
    headers: { 'x-internal-secret': GATEWAY_SECRET },
    payload: { message: '', locale: 'ru' }, // min(1)
  });
  assert.equal(empty.statusCode, 400);
});

test('unexpected properties are stripped, never trusted as authority', async () => {
  const res = await post('/v1/gpt/chat', {
    headers: { 'x-internal-secret': GATEWAY_SECRET },
    payload: { ...chatBody, plan: 'business', userId: 'attacker', orgId: 'other-org', isAdmin: true },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  // Plan is derived from verified identity, never from the request body.
  assert.notEqual(body.plan, 'business');
  assert.ok(!res.body.includes('attacker'), 'client-supplied identity echoed back');
  assert.ok(!res.body.includes('other-org'), 'client-supplied tenant echoed back');
});

// ── 10-12. Transport-level limits and content-type handling ───────────────
test('a body over the configured limit is rejected with 413', async () => {
  const oversized = JSON.stringify({ message: 'x'.repeat(BODY_LIMIT_BYTES + 2048), locale: 'ru' });
  assert.ok(oversized.length > BODY_LIMIT_BYTES);
  const res = await app.inject({
    method: 'POST',
    url: '/v1/gpt/chat',
    headers: { 'x-internal-secret': GATEWAY_SECRET, 'content-type': 'application/json' },
    payload: oversized,
  });
  assert.equal(res.statusCode, 413);
});

test('an unsupported content type is rejected with 415', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/gpt/chat',
    headers: { 'x-internal-secret': GATEWAY_SECRET, 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'message=hi',
  });
  assert.equal(res.statusCode, 415);
});

test('a tab-padded content-type cannot bypass body validation (GHSA-jx2c-rxcm-jvmq)', async () => {
  // Fastify < 5.7.2 parsed "application/json\ta" as JSON while skipping
  // content-type-bound validation. The patched runtime must not accept a
  // schema-invalid body through a padded content-type.
  const res = await app.inject({
    method: 'POST',
    url: '/v1/gpt/chat',
    headers: { 'x-internal-secret': GATEWAY_SECRET, 'content-type': 'application/json\ta' },
    payload: JSON.stringify({ locale: 'de' }), // invalid under the schema
  });
  assert.ok(
    res.statusCode === 415 || res.statusCode === 400,
    `padded content-type must be refused or validated, got ${res.statusCode}`,
  );
  assert.notEqual(res.statusCode, 200, 'padded content-type reached the handler unvalidated');
});

test('a prototype-poisoning body is rejected, matching secure-json-parse', async () => {
  // The custom parser replaces Fastify's secure-json-parse-backed default, so
  // it must keep failing closed on __proto__ / constructor keys.
  for (const payload of [
    '{"message":"hi","locale":"ru","__proto__":{"polluted":true}}',
    '{"message":"hi","locale":"ru","constructor":{"prototype":{"polluted":true}}}',
    '{"message":"hi","locale":"ru","nested":{"__proto__":{"polluted":true}}}',
  ]) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/gpt/chat',
      headers: { 'x-internal-secret': GATEWAY_SECRET, 'content-type': 'application/json' },
      payload,
    });
    assert.equal(res.statusCode, 400, `poisoning payload accepted: ${payload}`);
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined, 'Object.prototype was polluted');
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
});

test('a legitimate content-type parameter still works', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/gpt/chat',
    headers: { 'x-internal-secret': GATEWAY_SECRET, 'content-type': 'application/json; charset=utf-8' },
    payload: JSON.stringify(chatBody),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, false); // provider unconfigured, but parsed + validated
});

// ── 13-15. Forwarded / Host headers carry no authority ────────────────────
test('a spoofed X-Forwarded-Host does not grant authorization', async () => {
  const res = await post('/v1/gpt/chat', {
    headers: { 'x-forwarded-host': 'gptbot.uz', host: 'gptbot.uz' },
    payload: chatBody,
  });
  assert.equal(res.statusCode, 401, 'forwarded host must not substitute for the gateway secret');
});

test('a spoofed X-Forwarded-Proto does not grant authorization', async () => {
  const res = await post('/v1/gpt/chat', {
    headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' },
    payload: chatBody,
  });
  assert.equal(res.statusCode, 401, 'forwarded proto must not substitute for the gateway secret');
});

test('an arbitrary Host header grants no privileged behavior', async () => {
  for (const host of ['localhost', 'internal', 'gptbot.uz', 'evil.example.com']) {
    const res = await post('/v1/gpt/chat', { headers: { host }, payload: chatBody });
    assert.equal(res.statusCode, 401, `host ${host} must not bypass the gateway secret`);
  }
});

test('a disallowed Origin is refused even with a valid gateway secret', async () => {
  const res = await post('/v1/gpt/chat', {
    headers: { 'x-internal-secret': GATEWAY_SECRET, origin: 'https://evil.example.com' },
    payload: chatBody,
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'origin');
});

// ── 16. Path handling ─────────────────────────────────────────────────────
test('encoded or malformed paths do not reach the chat handler unauthenticated', async () => {
  const paths = [
    '/v1/gpt/%63hat', // percent-encoded 'c'
    '/v1//gpt/chat', // doubled separator
    '/v1/gpt/chat/', // trailing slash
    '/V1/GPT/CHAT', // case variation
    '/v1/gpt/./chat', // dot segment
    '/v1/gpt/sub/../chat', // traversal segment
    '/v1/gpt/chat%00', // null byte
  ];
  for (const url of paths) {
    const res = await post(url, { payload: chatBody });
    assert.notEqual(res.statusCode, 200, `${url} reached a handler without the gateway secret`);
    assert.ok(res.statusCode < 500, `${url} produced a server error (${res.statusCode})`);
  }
});

// ── 17-19. Failure paths leak nothing and do nothing ──────────────────────
test('a provider failure returns a friendly message with no stack or secret', async () => {
  const res = await post('/v1/gpt/chat', {
    headers: { 'x-internal-secret': GATEWAY_SECRET },
    payload: chatBody,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.code, 'provider_error');
  assert.equal(typeof body.message, 'string');
  assert.ok(!res.body.includes('openrouter.ai'), 'provider endpoint disclosed');
  assert.ok(!res.body.includes('Bearer'), 'authorization scheme disclosed');
  assert.ok(!/\bat\s+\w+\s+\(/.test(res.body), 'stack frame disclosed');
  assert.ok(!res.body.includes(GATEWAY_SECRET));
});

test('an auth rejection never reaches the AI provider', async () => {
  const before = fetchCalls;
  await post('/v1/gpt/chat', { payload: chatBody });
  await post('/v1/gpt/chat', { headers: { 'x-internal-secret': 'wrong' }, payload: chatBody });
  assert.equal(fetchCalls, before, 'a rejected request produced provider egress');
});

test('an auth rejection performs no store mutation', async () => {
  const mutations = /^(create|save|record|update|soft|rename|touch|set|event|provider)/i;
  storeCalls.length = 0;
  await post('/v1/gpt/chat', { payload: chatBody });
  await post('/v1/gpt/chat', { headers: { 'x-internal-secret': 'wrong' }, payload: chatBody });
  await post('/v1/internal/ping', {});
  const observed = storeCalls.filter((c) => mutations.test(c));
  assert.deepEqual(observed, [], `unauthenticated request touched the store: ${observed.join(', ')}`);
});

// ── 20-23. Endpoint boundaries ────────────────────────────────────────────
test('health stays open and presence-only, with no secret values', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.diagnostics.internalSecretConfigured, true);
  for (const v of Object.values(body.diagnostics)) assert.equal(typeof v, 'boolean');
  assert.ok(!res.body.includes(GATEWAY_SECRET));
  assert.ok(!res.body.includes(ADMIN_KEY));
});

test('internal ping keeps its internal-secret boundary', async () => {
  const anon = await post('/v1/internal/ping', {});
  assert.equal(anon.statusCode, 401);

  const wrong = await post('/v1/internal/ping', { headers: { 'x-internal-secret': 'wrong' } });
  assert.equal(wrong.statusCode, 401);

  const ok = await post('/v1/internal/ping', { headers: { 'x-internal-secret': GATEWAY_SECRET } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().pong, true);
});

test('admin analytics requires the admin key, not merely the gateway secret', async () => {
  const anon = await app.inject({ method: 'GET', url: '/v1/admin/analytics' });
  assert.equal(anon.statusCode, 401);

  const gatewayOnly = await app.inject({
    method: 'GET',
    url: '/v1/admin/analytics',
    headers: { 'x-internal-secret': GATEWAY_SECRET },
  });
  assert.equal(gatewayOnly.statusCode, 401, 'the gateway secret must not unlock the admin surface');

  const admin = await app.inject({
    method: 'GET',
    url: '/v1/admin/analytics',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.json().supabase, false); // Supabase unconfigured in tests
});

test('the cleanup job requires the admin key and performs nothing without it', async () => {
  storeCalls.length = 0;
  const anon = await post('/v1/jobs/cleanup', {});
  assert.equal(anon.statusCode, 401);

  const gatewayOnly = await post('/v1/jobs/cleanup', { headers: { 'x-internal-secret': GATEWAY_SECRET } });
  assert.equal(gatewayOnly.statusCode, 401, 'the gateway secret must not unlock the cleanup job');
  assert.deepEqual(storeCalls, [], 'a rejected cleanup call touched the store');

  const admin = await post('/v1/jobs/cleanup', { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(admin.statusCode, 200);
});

// ── 24. Existing public contract still holds ──────────────────────────────
test('session, history and feedback contracts are unchanged under Fastify 5', async () => {
  const session = await post('/v1/gpt/session', { payload: { locale: 'ru' } });
  assert.ok(session.statusCode < 500, `session returned ${session.statusCode}`);

  // History is identity-gated: no bearer token → 401, never a 400 parse error.
  const history = await app.inject({ method: 'GET', url: '/v1/gpt/history?limit=5&offset=0' });
  assert.equal(history.statusCode, 401);
  assert.equal(history.json().code, 'auth_required');

  const messages = await app.inject({ method: 'GET', url: '/v1/gpt/session/abc/messages' });
  assert.equal(messages.statusCode, 401);

  const rename = await app.inject({
    method: 'PATCH',
    url: '/v1/gpt/session/abc',
    payload: { title: 'x' },
  });
  assert.equal(rename.statusCode, 401);

  const feedback = await post('/v1/gpt/feedback', { payload: { messageId: 'm1', rating: 'up' } });
  assert.ok(feedback.statusCode < 500, `feedback returned ${feedback.statusCode}`);
});

test('DELETE with an empty JSON body still reaches its auth guard (Fastify 5 regression)', async () => {
  // Fastify 5 rejects DELETE requests carrying Content-Type: application/json
  // with an empty body. The Cloudflare gateway sets that header on every
  // forwarded call, so this must resolve to the route's 401 — not a 400 from
  // the body parser.
  const res = await app.inject({
    method: 'DELETE',
    url: '/v1/gpt/session/abc',
    headers: { 'content-type': 'application/json' },
    payload: '',
  });
  assert.equal(res.statusCode, 401, `expected the auth guard, got ${res.statusCode}`);
  assert.equal(res.json().code, 'auth_required');
});

// ── 25. Replay carries no privilege ───────────────────────────────────────
test('a replayed request is re-authorized every time', async () => {
  const send = () => post('/v1/gpt/chat', { headers: { 'x-internal-secret': 'wrong' }, payload: chatBody });
  for (let i = 0; i < 3; i++) {
    const res = await send();
    assert.equal(res.statusCode, 401, `replay ${i + 1} was not re-checked`);
  }
  // A previously successful call does not make a later unauthenticated one pass.
  const good = await post('/v1/gpt/chat', { headers: { 'x-internal-secret': GATEWAY_SECRET }, payload: chatBody });
  assert.equal(good.statusCode, 200);
  const after = await post('/v1/gpt/chat', { payload: chatBody });
  assert.equal(after.statusCode, 401, 'authorization leaked across requests');
});

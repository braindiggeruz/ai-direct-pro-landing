// R0.1 web-security regressions for GPT Chat Turnstile enforcement.
// Run: node --import tsx --test tests/web-security-hardening.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet as getPublicConfig } from '../functions/api/auth/config.ts';
import { onRequestPost as postAdminLogin } from '../functions/api/auth/login.ts';
import { onRequestPost as postChat } from '../functions/api/gpt/chat.ts';
import { verifyTurnstile } from '../functions/lib/turnstile.ts';
import { fetchTurnstileConfig, sendChatStream } from '../src/gpt-chat/api.ts';
import { responsiveTurnstileSize } from '../src/shared/turnstile.ts';
import { ADMIN_HOME, ADMIN_ROUTE_PATHS } from '../src/admin/routes.ts';
import { chatRoutes } from '../apps/gpt-backend/src/routes/chat.ts';
import { matchRoutes } from 'react-router';

type ChatEnv = Parameters<typeof verifyTurnstile>[0];

function chatRequest(body: Record<string, unknown>, env: ChatEnv): Promise<Response> {
  const request = new Request('https://gptbot.uz/api/gpt/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.8',
      Origin: 'https://gptbot.uz',
    },
    body: JSON.stringify(body),
  });
  return postChat({
    request,
    env,
    waitUntil: () => undefined,
  } as never);
}

test('public config exposes only Turnstile presence and site key', async () => {
  const response = await getPublicConfig({
    env: {
      TURNSTILE_SECRET_KEY: 'server-secret-must-not-leak',
      TURNSTILE_SITE_KEY: 'public-site-key',
    },
  } as never);
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(body, {
    turnstileRequired: true,
    turnstileSiteKey: 'public-site-key',
  });
  assert.doesNotMatch(JSON.stringify(body), /server-secret/);
});

test('Turnstile chooses a compact mobile widget and flexible wider layout', () => {
  assert.equal(responsiveTurnstileSize(320), 'compact');
  assert.equal(responsiveTurnstileSize(399), 'compact');
  assert.equal(responsiveTurnstileSize(400), 'flexible');
});

test('configured Turnstile rejects a missing token before Railway or provider work', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('no external call should be made');
  };
  try {
    const response = await chatRequest({
      message: 'hello',
      locale: 'ru',
    }, {
      TURNSTILE_SECRET_KEY: 'secret',
      RAILWAY_GPT_API_URL: 'https://railway.example',
      GPTBOT_INTERNAL_API_SECRET: 'gateway-secret',
    } as ChatEnv);
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { code: string }).code, 'turnstile_failed');
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid Turnstile response never reaches Railway', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return Response.json({ success: false, 'error-codes': ['invalid-input-response'] });
  };
  try {
    const response = await chatRequest({
      message: 'hello',
      locale: 'ru',
      turnstileToken: 'invalid-token',
    }, {
      TURNSTILE_SECRET_KEY: 'secret',
      RAILWAY_GPT_API_URL: 'https://railway.example',
      GPTBOT_INTERNAL_API_SECRET: 'gateway-secret',
    } as ChatEnv);
    assert.equal(response.status, 403);
    assert.deepEqual(urls, ['https://challenges.cloudflare.com/turnstile/v0/siteverify']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('expired or replayed Turnstile token is rejected before Railway', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] });
  };
  try {
    const response = await chatRequest({
      message: 'hello',
      turnstileToken: 'already-used-token',
    }, {
      TURNSTILE_SECRET_KEY: 'secret',
      RAILWAY_GPT_API_URL: 'https://railway.example',
      GPTBOT_INTERNAL_API_SECRET: 'gateway-secret',
    } as ChatEnv);
    assert.equal(response.status, 403);
    assert.deepEqual(urls, ['https://challenges.cloudflare.com/turnstile/v0/siteverify']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('oversized Turnstile token is rejected without an external call', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ success: true });
  };
  try {
    const response = await chatRequest({
      message: 'hello',
      turnstileToken: 'x'.repeat(2049),
    }, {
      TURNSTILE_SECRET_KEY: 'secret',
    } as ChatEnv);
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('valid Turnstile is checked before Railway and its single-use token is stripped', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/siteverify')) {
      return Response.json({
        success: true,
        action: 'gpt_chat',
        hostname: 'gptbot.uz',
      });
    }
    return Response.json({ ok: true, answer: 'safe' });
  };
  try {
    const response = await chatRequest({
      message: 'hello',
      locale: 'ru',
      turnstileToken: 'single-use-token',
    }, {
      TURNSTILE_SECRET_KEY: 'secret',
      RAILWAY_GPT_API_URL: 'https://railway.example',
      GPTBOT_INTERNAL_API_SECRET: 'gateway-secret',
    } as ChatEnv);
    assert.equal(response.status, 200);
    assert.deepEqual(calls.map((call) => call.url), [
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      'https://railway.example/v1/gpt/chat',
    ]);
    const railwayBody = JSON.parse(String(calls[1].init?.body)) as Record<string, unknown>;
    assert.equal(railwayBody.turnstileToken, undefined);
    assert.equal(new Headers(calls[1].init?.headers).get('X-Internal-Secret'), 'gateway-secret');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Turnstile verification fails closed on metadata mismatch and network failure', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({
      success: true,
      action: 'admin_login',
      hostname: 'evil.example',
    });
    assert.equal(await verifyTurnstile(
      { TURNSTILE_SECRET_KEY: 'secret' } as ChatEnv,
      'token',
      '203.0.113.8',
      { expectedAction: 'gpt_chat', expectedHostname: 'gptbot.uz' },
    ), false);

    globalThis.fetch = async () => { throw new Error('network down'); };
    assert.equal(await verifyTurnstile(
      { TURNSTILE_SECRET_KEY: 'secret' } as ChatEnv,
      'token',
      '203.0.113.8',
      { expectedAction: 'gpt_chat', expectedHostname: 'gptbot.uz' },
    ), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin login rejects a GPT Chat Turnstile token before credential checks', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      success: true,
      action: 'gpt_chat',
      hostname: 'gptbot.uz',
    });
  };
  try {
    const response = await postAdminLogin({
      request: new Request('https://gptbot.uz/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.19',
        },
        body: JSON.stringify({
          email: 'admin@gptbot.uz',
          password: 'not-checked',
          turnstileToken: 'chat-flow-token',
        }),
      }),
      env: {
        TURNSTILE_SECRET_KEY: 'secret',
        ADMIN_EMAIL: 'admin@gptbot.uz',
        JWT_SECRET: 'not-used-before-turnstile-rejection',
      },
    } as never);
    assert.equal(response.status, 403);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Siteverify outage returns 503 without Railway or provider fallback', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    throw new Error('siteverify unavailable');
  };
  try {
    const response = await chatRequest({
      message: 'hello',
      turnstileToken: 'token',
    }, {
      TURNSTILE_SECRET_KEY: 'secret',
      RAILWAY_GPT_API_URL: 'https://railway.example',
      GPTBOT_INTERNAL_API_SECRET: 'gateway-secret',
    } as ChatEnv);
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, 'turnstile_unavailable');
    assert.deepEqual(urls, ['https://challenges.cloudflare.com/turnstile/v0/siteverify']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stream client loads public config and sends the Turnstile token', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/api/auth/config')) {
      return Response.json({
        turnstileRequired: true,
        turnstileSiteKey: 'public-site-key',
      });
    }
    return Response.json({ ok: false, code: 'provider_error' });
  };
  try {
    assert.deepEqual(await fetchTurnstileConfig(''), {
      required: true,
      siteKey: 'public-site-key',
    });
    await sendChatStream(
      '',
      {
        sessionId: 'session-1',
        message: 'hello',
        locale: 'ru',
        history: [],
        turnstileToken: 'stream-token',
      },
      { onDelta: () => undefined },
      new AbortController().signal,
    );
    const chatBody = JSON.parse(String(calls[1].init?.body)) as Record<string, unknown>;
    assert.equal(chatBody.turnstileToken, 'stream-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Railway chat route rejects missing secret and accepts the gateway before body validation', async () => {
  type Handler = (request: unknown, reply: unknown) => Promise<unknown>;
  let handler: Handler | null = null;
  chatRoutes({
    post: (path: string, next: Handler) => {
      if (path === '/v1/gpt/chat') handler = next;
    },
  } as never, {
    cfg: { internalSecret: 'gateway-secret', allowedOrigins: ['https://gptbot.uz'] },
  } as never);
  assert.ok(handler);

  const invoke = async (secret?: string) => {
    let status = 200;
    let payload: unknown;
    const reply = {
      code: (nextStatus: number) => {
        status = nextStatus;
        return reply;
      },
      send: (body: unknown) => {
        payload = body;
        return body;
      },
    };
    await handler!({
      headers: {
        origin: 'https://gptbot.uz',
        ...(secret ? { 'x-internal-secret': secret } : {}),
      },
      body: {},
    }, reply);
    return { status, payload };
  };

  assert.equal((await invoke()).status, 401);
  assert.equal((await invoke('wrong')).status, 401);
  assert.equal((await invoke('gateway-secret')).status, 400);
});

test('React Router 8.3.0 matches admin deep routes and keeps a wildcard fallback', () => {
  const routeObjects = Object.values(ADMIN_ROUTE_PATHS).map((path) => ({ path }));
  assert.equal(matchRoutes(routeObjects, '/login')?.at(-1)?.route.path, ADMIN_ROUTE_PATHS.login);
  assert.equal(matchRoutes(routeObjects, '/pages/ru/home')?.at(-1)?.route.path, ADMIN_ROUTE_PATHS.pageEdit);
  assert.equal(matchRoutes(routeObjects, '/ai-drafts/draft-1')?.at(-1)?.route.path, ADMIN_ROUTE_PATHS.draftDetail);
  assert.equal(matchRoutes(routeObjects, '/unknown')?.at(-1)?.route.path, ADMIN_ROUTE_PATHS.fallback);
  assert.equal(ADMIN_HOME, '/admin-tools');
});

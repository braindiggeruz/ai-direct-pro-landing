import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pageModifiedDate, dateOnly, latestDate } from '../scripts/content-dates';
import { renderIsland, renderStudioPage } from '../apps/studio/scripts/studio-page';
import { readStudioSite } from '../apps/studio/scripts/prerender-studio';
import { readStudioPages } from '../apps/studio/shared/published-urls';
import { onRequest as middleware } from '../functions/_middleware';
import { onRequestGet as account } from '../functions/api/auth/me';
import { onRequestPost as login } from '../functions/api/auth/login';
import { signToken, verifyToken } from '../functions/lib/jwt';
import { hashPassword } from '../functions/lib/password';
import { withPrivateResponseHeaders } from '../functions/lib/private-response';
import type { Env } from '../functions/_types';

const ROOT = path.resolve(import.meta.dirname, '..');

test('a later edit or review is the modification date, independent of input order and build time', () => {
  const edited = { lastReviewedAt: '2026-10-05', updatedAt: '2026-10-08' };
  const original = JSON.stringify(edited);
  assert.equal(pageModifiedDate(edited), '2026-10-08');
  assert.equal(pageModifiedDate({ lastReviewedAt: '2026-10-08', updatedAt: '2026-10-05' }), '2026-10-08');
  assert.equal(pageModifiedDate({ lastReviewedAt: '2026-10-05', updatedAt: '2026-10-05T23:00:00Z' }), '2026-10-05');
  assert.equal(JSON.stringify(edited), original, 'no invented editorial review');
});

test('missing or invalid dates cannot synthesize today as a modification date', () => {
  assert.equal(pageModifiedDate({}), undefined);
  assert.equal(pageModifiedDate({ lastReviewedAt: '', updatedAt: 'invalid' }), undefined);
  assert.equal(pageModifiedDate({ updatedAt: '2026-09-01' }), '2026-09-01');
  assert.equal(pageModifiedDate({ lastReviewedAt: '2026-09-02', updatedAt: 'invalid' }), '2026-09-02');
  assert.equal(dateOnly('2026-10-07T23:30:00-03:00'), '2026-10-08');
  assert.equal(latestDate(['2026-10-01', undefined, 'invalid', '2026-10-03']), '2026-10-03');
});

test('Studio tariff terms resolve to published canonical offers in both languages', () => {
  for (const locale of ['uz', 'ru'] as const) {
    const terms = `https://gptbot.uz/${locale}/oferta/`;
    const offer = JSON.parse(fs.readFileSync(path.join(ROOT, `content/pages/${locale}/oferta.json`), 'utf8'));
    assert.equal(offer.status, 'published');
    assert.equal(offer.canonical, terms);
    assert.notEqual(offer.robotsIndex, false);
    const html = renderIsland('tariffs', locale);
    assert.ok(html.includes(`href="${terms}"`));
    assert.doesNotMatch(html, /ommaviy-oferta/);
  }
  const pages = readStudioPages(ROOT);
  const tariff = pages.find(p => p.data.tool === 'tariffs');
  assert.ok(tariff);
  const html = renderStudioPage(tariff, {
    site: readStudioSite(ROOT), pages, siteStyles: ['/assets/test.css'],
    assets: { script: '/assets/studio/test.js', styles: [] },
  });
  assert.doesNotMatch(html, /ommaviy-oferta/);
  assert.ok(html.includes('https://gptbot.uz/uz/oferta/'));
});

test('static host rules target exactly the project alias and its preview versions', () => {
  const fallback = fs.readFileSync(path.join(ROOT, 'public/_headers'), 'utf8');
  const generator = fs.readFileSync(path.join(ROOT, 'scripts/generate-robots.ts'), 'utf8');
  const expected = ['https://ai-direct-pro-landing.pages.dev/*', 'https://:version.ai-direct-pro-landing.pages.dev/*'];
  const hostRules = fallback.split(/\r?\n/).filter(line => line.startsWith('https://'));
  assert.deepEqual(hostRules, expected);
  for (const rule of expected) {
    assert.ok(fallback.includes(`${rule}\n  X-Robots-Tag: noindex`) || fallback.includes(`${rule}\r\n  X-Robots-Tag: noindex`));
    assert.ok(generator.includes(`headers.push('${rule}');\nheaders.push('  X-Robots-Tag: noindex');`)
      || generator.includes(`headers.push('${rule}');\r\nheaders.push('  X-Robots-Tag: noindex');`));
  }
  const global = fallback.split(/\r?\n\/\*\r?\n/)[1].split(/\r?\n\r?\n/)[0];
  assert.doesNotMatch(global, /X-Robots-Tag/);
});

test('Function noindex is restricted to this alias and one preview label, with body/status/cache preserved', async () => {
  const hosts = [
    ['gptbot.uz', false], ['www.gptbot.uz', false], ['gptbot-market-mini-app.pages.dev', false],
    ['ai-direct-pro-landing.pages.dev', true], ['12460835.ai-direct-pro-landing.pages.dev', true],
    ['branch.ai-direct-pro-landing.pages.dev', true], ['nested.branch.ai-direct-pro-landing.pages.dev', false],
    ['evil-ai-direct-pro-landing.pages.dev', false], ['ai-direct-pro-landing.pages.dev.evil.example', false],
  ] as const;
  for (const [host, noindex] of hosts) {
    for (const pathname of ['/', '/uz/gpt-uzbek-tilida/', '/admin-tools/login', '/api/auth/me', '/missing/']) {
      const status = pathname === '/missing/' ? 404 : 200;
      const response = await middleware({
        request: new Request(`https://${host}${pathname}`), env: {},
        next: async () => new Response('synthetic', { status, headers: { 'Cache-Control': 'no-store', 'X-Test': 'unchanged' } }),
      } as never);
      assert.equal(response.status, status, `${host}${pathname}`);
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.get('x-robots-tag'), noindex ? 'noindex' : null, `${host}${pathname}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-test'), 'unchanged');
      assert.equal(await response.text(), 'synthetic');
    }
  }
});

test('host policy retains stricter existing private directives and does not alter preflight behavior', async () => {
  const robots = 'noindex, nofollow, noarchive';
  const response = await middleware({
    request: new Request('https://ai-direct-pro-landing.pages.dev/api/auth/me'), env: {},
    next: async () => new Response('denied', { status: 401, headers: { 'X-Robots-Tag': robots } }),
  } as never);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('x-robots-tag'), robots);
  for (const host of ['gptbot.uz', 'ai-direct-pro-landing.pages.dev']) {
    const response = await middleware({
      request: new Request(`https://${host}/api/studio/config`, { method: 'OPTIONS', headers: { Origin: 'https://foreign.example' } }), env: {},
      next: async () => { throw new Error('preflight must not reach the route'); },
    } as never);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

function assertPrivate(response: Response): void {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('private response headers preserve status, body, content type and unrelated headers', async () => {
  const response = withPrivateResponseHeaders(new Response('{"fixture":true}', {
    status: 403, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'fixture=1; Secure; HttpOnly', 'Cache-Control': 'public, max-age=600' },
  }));
  assertPrivate(response);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('set-cookie'), 'fixture=1; Secure; HttpOnly');
  assert.deepEqual(await response.json(), { fixture: true });
});

test('auth/me protects successful session metadata and denied responses without changing authorization', async () => {
  const env = { JWT_SECRET: randomBytes(32).toString('hex') } as Env;
  const call = (token?: string) => account({
    env, request: new Request('https://gptbot.uz/api/auth/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  } as never) as Promise<Response>;
  for (const token of [undefined, 'invalid', await signToken(env, { email: 'fixture@example.test', role: 'guest' })]) {
    const response = await call(token);
    assertPrivate(response);
    assert.equal(response.status, token && token !== 'invalid' ? 403 : 401);
    assert.equal('email' in await response.json(), false);
  }
  for (const role of ['admin', 'platform_owner', 'support_readonly']) {
    const response = await call(await signToken(env, { email: 'fixture@example.test', role }));
    assertPrivate(response);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { email: 'fixture@example.test', role });
  }
});

test('auth/login success and error JSON are private while issued tokens still authenticate', async () => {
  const password = randomBytes(16).toString('hex');
  const env = { JWT_SECRET: randomBytes(32).toString('hex'), ADMIN_EMAIL: 'fixture@example.test', ADMIN_PASSWORD_HASH: await hashPassword(password, 1000) } as Env;
  for (const [body, status] of [['{', 400], ['{}', 400], [JSON.stringify({ email: env.ADMIN_EMAIL, password: 'wrong' }), 401], [JSON.stringify({ email: env.ADMIN_EMAIL, password }), 200]] as const) {
    const response = await login({ env, request: new Request('https://gptbot.uz/api/auth/login', {
      method: 'POST', body, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.8' },
    }) } as never);
    assertPrivate(response);
    assert.equal(response.status, status);
    const result = await response.json() as { token?: string; email?: string; role?: string };
    if (status === 200) {
      assert.ok(result.token);
      assert.deepEqual(await verifyToken(env, result.token), { email: env.ADMIN_EMAIL, role: 'admin' });
    } else assert.equal(result.token, undefined);
  }
});

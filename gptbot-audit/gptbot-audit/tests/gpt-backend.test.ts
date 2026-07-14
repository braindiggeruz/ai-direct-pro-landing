// Unit tests for the Railway backend PURE logic + Cloudflare gateway config.
// These modules are dependency-free at runtime (type-only imports of
// fastify/supabase are erased), so they run under tsx without installing
// backend deps. Run: node --import tsx --test tests/gpt-backend.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig, configStatus } from '../apps/gpt-backend/src/env.ts';
import { resolvePlan, decideQuota, modelChain, PLANS } from '../apps/gpt-backend/src/plans.ts';
import { detectIntent, sessionTitle, buildMessages } from '../apps/gpt-backend/src/prompt.ts';
import { buildBody } from '../apps/gpt-backend/src/openrouter.ts';
import { hashIp, clientIp, hashToken } from '../apps/gpt-backend/src/hash.ts';
import { originAllowed, hasInternalSecret, isAdmin, bearer } from '../apps/gpt-backend/src/auth.ts';
import { gatewayConfigured } from '../functions/lib/gpt-chat/gateway.ts';

// ── env mapping ──────────────────────────────────────────
test('loadConfig: Railway var names + aliases + free model default', () => {
  const cfg = loadConfig({
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SECRET_KEY: 'secret',
    SUPABASE_PUBLISHABLE_KEY: 'pub',
    OPENROUTER_API_KEY: 'k',
    NODE_ENV: 'production',
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.supabase.url, 'https://x.supabase.co');
  assert.equal(cfg.supabase.secretKey, 'secret');
  assert.equal(cfg.supabase.publishableKey, 'pub');
  assert.equal(cfg.openrouter.modelFree, 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.equal(cfg.nodeEnv, 'production');
});

test('loadConfig: legacy aliases (service role / anon)', () => {
  const cfg = loadConfig({ SUPABASE_SERVICE_ROLE_KEY: 's', SUPABASE_ANON_KEY: 'a' } as NodeJS.ProcessEnv);
  assert.equal(cfg.supabase.secretKey, 's');
  assert.equal(cfg.supabase.publishableKey, 'a');
});

test('configStatus: presence-only, NO secret values leaked', () => {
  const cfg = loadConfig({ SUPABASE_URL: 'u', SUPABASE_SECRET_KEY: 'supersecret', OPENROUTER_API_KEY: 'topsecret' } as NodeJS.ProcessEnv);
  const s = configStatus(cfg);
  const json = JSON.stringify(s);
  assert.equal(s.supabaseConfigured, true);
  assert.equal(s.openrouterConfigured, true);
  assert.ok(!json.includes('supersecret'), 'secret value must not appear in status');
  assert.ok(!json.includes('topsecret'), 'api key must not appear in status');
  for (const v of Object.values(s)) assert.equal(typeof v, 'boolean');
});

// ── plans / quota / routing ──────────────────────────────
test('resolvePlan: identity-driven, ignores client claims', () => {
  assert.equal(resolvePlan({ authenticated: false }), 'anonymous_free');
  assert.equal(resolvePlan({ authenticated: true }), 'registered_free');
  assert.equal(resolvePlan({ authenticated: true, subscriptionPlan: 'plus', subscriptionActive: true }), 'plus');
  assert.equal(resolvePlan({ authenticated: true, subscriptionPlan: 'business', subscriptionActive: true }), 'business');
  // inactive subscription does NOT upgrade
  assert.equal(resolvePlan({ authenticated: true, subscriptionPlan: 'plus', subscriptionActive: false }), 'registered_free');
});

test('decideQuota: anonymous 15/day 5/hour; registered 25/day', () => {
  assert.equal(decideQuota({ dayCount: 0, hourCount: 0 }, 'anonymous_free').allowed, true);
  assert.equal(decideQuota({ dayCount: 15, hourCount: 0 }, 'anonymous_free').reason, 'daily');
  assert.equal(decideQuota({ dayCount: 6, hourCount: 5 }, 'anonymous_free').reason, 'hourly');
  assert.equal(decideQuota({ dayCount: 24, hourCount: 0 }, 'registered_free').allowed, true);
  assert.equal(decideQuota({ dayCount: 25, hourCount: 0 }, 'registered_free').allowed, false);
});

test('decideQuota: plus monthly cap', () => {
  assert.equal(PLANS.plus.monthlyLimit, 600);
  assert.equal(decideQuota({ dayCount: 0, hourCount: 0, monthCount: 600 }, 'plus').reason, 'monthly');
  assert.equal(decideQuota({ dayCount: 0, hourCount: 0, monthCount: 10 }, 'plus').allowed, true);
});

test('modelChain: anonymous never gets paid fallback unless allowed', () => {
  const base = loadConfig({} as NodeJS.ProcessEnv);
  const anon = modelChain(base, 'anonymous_free');
  assert.ok(anon.every((m) => m.includes(':free')), 'anon chain must be free-only');
  const allowed = loadConfig({ ALLOW_PAID_FALLBACK_FOR_FREE: 'true' } as NodeJS.ProcessEnv);
  assert.ok(modelChain(allowed, 'anonymous_free').some((m) => !m.includes(':free')));
  assert.equal(modelChain(base, 'plus')[0], base.openrouter.modelPaid);
});

// ── prompt / intent ──────────────────────────────────────
test('detectIntent: routes B2B keywords', () => {
  assert.equal(detectIntent('нужен бот для amoCRM'), 'crm');
  assert.equal(detectIntent('хочу телеграм бота'), 'telegram_bot');
  assert.equal(detectIntent('AI-чат на сайт'), 'site_chat');
  assert.equal(detectIntent('сколько стоит подписка plus'), 'subscription');
  assert.equal(detectIntent('можно консультацию?'), 'consultation');
  assert.equal(detectIntent('привет'), 'unknown');
});

test('sessionTitle: from first message, localized fallback', () => {
  assert.equal(sessionTitle('', 'ru'), 'Новый чат');
  assert.equal(sessionTitle('', 'uz'), 'Yangi chat');
  assert.equal(sessionTitle('Напиши оффер', 'ru'), 'Напиши оффер');
});

test('buildMessages: system first, summary injected, history trimmed', () => {
  const history = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }));
  const msgs = buildMessages({ summary: 'краткая сводка', history, userMessage: 'вопрос', maxTurns: 8 });
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[1].content.includes('сводка'));
  assert.equal(msgs[msgs.length - 1].content, 'вопрос');
  assert.ok(msgs.length <= 1 + 1 + 16 + 1);
});

test('buildBody: free-form (no response_format), stream flag honored', () => {
  const b = buildBody('m/x', [{ role: 'user', content: 'hi' }], 900, true) as Record<string, unknown>;
  assert.equal(b.model, 'm/x');
  assert.equal(b.stream, true);
  assert.equal((b as { response_format?: unknown }).response_format, undefined);
});

// ── hash / privacy ───────────────────────────────────────
test('hashIp: deterministic, salt-sensitive; hashToken differs by salt', async () => {
  assert.equal(hashIp('1.2.3.4', 's'), hashIp('1.2.3.4', 's'));
  assert.notEqual(hashIp('1.2.3.4', 's'), hashIp('1.2.3.4', 't'));
  assert.match(hashIp('1.2.3.4', 's'), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken('tok', 'a'), hashToken('tok', 'b'));
});

test('clientIp: reads CF/XFF headers', () => {
  assert.equal(clientIp({ 'cf-connecting-ip': '9.9.9.9' }), '9.9.9.9');
  assert.equal(clientIp({ 'x-forwarded-for': '5.5.5.5, 1.1.1.1' }), '5.5.5.5');
  assert.equal(clientIp({}), undefined);
});

// ── auth guards ──────────────────────────────────────────
test('originAllowed: allow-list + server-to-server (no origin)', () => {
  assert.equal(originAllowed(undefined, ['https://gptbot.uz']), true);
  assert.equal(originAllowed('https://gptbot.uz', ['https://gptbot.uz']), true);
  assert.equal(originAllowed('https://evil.com', ['https://gptbot.uz']), false);
});

test('hasInternalSecret / isAdmin: constant-time, reject missing/mismatch', () => {
  assert.equal(hasInternalSecret('abc', 'abc'), true);
  assert.equal(hasInternalSecret('abc', 'abd'), false);
  assert.equal(hasInternalSecret(undefined, 'abc'), false);
  assert.equal(hasInternalSecret('abc', undefined), false);
  assert.equal(isAdmin('key', 'key'), true);
  assert.equal(isAdmin('x', 'key'), false);
});

test('bearer: extracts token from Authorization header', () => {
  assert.equal(bearer({ headers: { authorization: 'Bearer tok123' } } as never), 'tok123');
  assert.equal(bearer({ headers: {} } as never), undefined);
});

// ── Cloudflare gateway config ────────────────────────────
test('gatewayConfigured: needs BOTH url + secret', () => {
  assert.equal(gatewayConfigured({} as never), false);
  assert.equal(gatewayConfigured({ RAILWAY_GPT_API_URL: 'https://x' } as never), false);
  assert.equal(gatewayConfigured({ RAILWAY_GPT_API_URL: 'https://x', GPTBOT_INTERNAL_API_SECRET: 's' } as never), true);
});

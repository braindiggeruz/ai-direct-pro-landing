// Unit tests for the consumer AI-chat pure logic.
// Run: node --import tsx --test tests/gpt-chat.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig, modelChain } from '../functions/lib/gpt-chat/config';
import { decideQuota } from '../functions/lib/gpt-chat/quota';
import { validateMessage, validateLead, normLocale } from '../functions/lib/gpt-chat/validate';
import { buildMessages } from '../functions/lib/gpt-chat/prompt';
import { buildChatBody } from '../functions/lib/gpt-chat/openrouter-chat';
import { hashIp } from '../functions/lib/gpt-chat/hash';
import { renderMarkdown } from '../src/gpt-chat/markdown';

type AnyEnv = Parameters<typeof resolveConfig>[0];

test('resolveConfig applies defaults from the strategic report', () => {
  const cfg = resolveConfig({} as AnyEnv);
  assert.equal(cfg.freeModel, 'nvidia/nemotron-3-nano-30b-a3b:free');
  assert.equal(cfg.freeDailyLimit, 15);
  assert.equal(cfg.freeHourlyLimit, 5);
  assert.equal(cfg.maxInputChars, 3000);
  assert.deepEqual(cfg.freeFallbacks, ['qwen/qwen3-235b-a22b-2507:free', 'deepseek/deepseek-chat-v3-0324:free']);
});

test('resolveConfig parses env overrides + comma lists', () => {
  const cfg = resolveConfig({
    OPENROUTER_MODEL_FREE: 'x/free',
    OPENROUTER_MODEL_FREE_FALLBACKS: 'a/b, c/d ,e/f',
    GPT_FREE_DAILY_LIMIT: '30',
  } as AnyEnv);
  assert.equal(cfg.freeModel, 'x/free');
  assert.deepEqual(cfg.freeFallbacks, ['a/b', 'c/d', 'e/f']);
  assert.equal(cfg.freeDailyLimit, 30);
});

test('modelChain = [primary, ...fallbacks]', () => {
  const cfg = resolveConfig({} as AnyEnv);
  const free = modelChain(cfg, 'free');
  assert.equal(free[0], cfg.freeModel);
  assert.equal(free.length, 3);
  const paid = modelChain(cfg, 'paid');
  assert.equal(paid[0], cfg.paidModel);
});

test('decideQuota: free daily + hourly caps', () => {
  const cfg = resolveConfig({} as AnyEnv);
  assert.deepEqual(decideQuota({ dayCount: 0, hourCount: 0 }, cfg, 'free'), { allowed: true, remaining: 15 });
  const daily = decideQuota({ dayCount: 15, hourCount: 0 }, cfg, 'free');
  assert.equal(daily.allowed, false);
  assert.equal(daily.reason, 'daily');
  assert.equal(daily.remaining, 0);
  const hourly = decideQuota({ dayCount: 6, hourCount: 5 }, cfg, 'free');
  assert.equal(hourly.allowed, false);
  assert.equal(hourly.reason, 'hourly');
  assert.equal(hourly.remaining, 9);
});

test('decideQuota: paid monthly cap', () => {
  const cfg = resolveConfig({} as AnyEnv);
  const ok = decideQuota({ dayCount: 100, hourCount: 0 }, cfg, 'paid');
  assert.equal(ok.allowed, true);
  const over = decideQuota({ dayCount: 600, hourCount: 0 }, cfg, 'paid');
  assert.equal(over.allowed, false);
});

test('validateMessage: rejects empty, too-long; trims', () => {
  assert.equal(validateMessage('', 3000).ok, false);
  assert.equal(validateMessage('   ', 3000).ok, false);
  assert.equal(validateMessage(123 as unknown as string, 3000).ok, false);
  assert.equal(validateMessage('a'.repeat(3001), 3000).ok, false);
  const ok = validateMessage('  hello  ', 3000);
  assert.equal(ok.ok, true);
  assert.equal(ok.value, 'hello');
});

test('normLocale defaults to ru', () => {
  assert.equal(normLocale('uz'), 'uz');
  assert.equal(normLocale('ru'), 'ru');
  assert.equal(normLocale('en'), 'ru');
  assert.equal(normLocale(undefined), 'ru');
});

test('validateLead: consent + at least one contact required', () => {
  assert.equal(validateLead({ consent: false, phone: '998900000000' }).ok, false);
  assert.equal(validateLead({ consent: true }).ok, false);
  const ok = validateLead({ consent: true, phone: '998 90 000 00 00', name: 'Ali' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value?.contactType, 'phone');
  assert.equal(ok.value?.name, 'Ali');
  const tg = validateLead({ consent: true, telegram: '@ali' });
  assert.equal(tg.value?.contactType, 'telegram');
});

test('buildMessages: system first, trims history window', () => {
  const history = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant', content: `m${i}` }));
  const msgs = buildMessages(history, 'new question', 10, 'ru');
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[msgs.length - 1].content, 'new question');
  // system + up to 20 history + 1 user = 22 max
  assert.ok(msgs.length <= 22);
});

test('buildChatBody: no response_format (free-form), carries model + messages', () => {
  const body = buildChatBody('m/x', [{ role: 'user', content: 'hi' }], 900) as Record<string, unknown>;
  assert.equal(body.model, 'm/x');
  assert.equal((body as { response_format?: unknown }).response_format, undefined);
  assert.equal((body.messages as unknown[]).length, 1);
});

test('hashIp: deterministic + salt-sensitive, hex output', async () => {
  const a = await hashIp('1.2.3.4', 'salt');
  const b = await hashIp('1.2.3.4', 'salt');
  const c = await hashIp('1.2.3.4', 'other');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('renderMarkdown: escapes HTML (no XSS), keeps bold + lists', () => {
  const html = renderMarkdown('<script>alert(1)</script> **bold**\n- one\n- two');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<li>one</li>'));
});

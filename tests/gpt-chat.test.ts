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
import { applyRole, getRoles } from '../src/gpt-chat/roles';
import { buildImagePromptRequest, getTemplates } from '../src/gpt-chat/templates';
import { clearSessionId, loadRemaining, saveRemaining, saveSessionId } from '../src/gpt-chat/storage';
import { strings } from '../src/gpt-chat/i18n';
import { EV } from '../src/gpt-chat/analytics';
import { readFileSync } from 'node:fs';

type AnyEnv = Parameters<typeof resolveConfig>[0];

// The previous version of this test pinned the three free slugs by name. When
// OpenRouter retired all three in August 2026 the chat answered provider_error
// in production for weeks and this test stayed green, because a retired slug is
// still the string it always was. Assert the SHAPE the fallback chain must keep
// — free tier, three distinct vendors, no duplicates — and leave the identity of
// the models to tests/openrouter-model-catalogue.test.ts, which checks them
// against the live catalogue.
test('resolveConfig applies defaults from the strategic report', () => {
  const cfg = resolveConfig({} as AnyEnv);
  assert.equal(cfg.freeDailyLimit, 15);
  assert.equal(cfg.freeHourlyLimit, 5);
  assert.equal(cfg.maxInputChars, 3000);

  const freeChain = [cfg.freeModel, ...cfg.freeFallbacks];
  assert.equal(freeChain.length, 3, 'the free chain must keep two fallbacks behind the primary');
  assert.equal(new Set(freeChain).size, 3, 'no model may appear twice in the chain');
  for (const model of freeChain) {
    assert.match(model, /^[a-z0-9-]+\/[a-z0-9._-]+:free$/, `${model} must be a free-tier OpenRouter slug`);
  }
  const vendors = freeChain.map((m) => m.split('/')[0]);
  assert.equal(new Set(vendors).size, 3, `one vendor outage must not empty the chain: ${vendors.join(', ')}`);

  const paidChain = [cfg.paidModel, ...cfg.paidFallbacks];
  assert.equal(paidChain.length, 3, 'the paid chain must keep two fallbacks behind the primary');
  assert.doesNotMatch(paidChain[0], /:free$/, 'paid access prefers its configured paid primary');
  assert.equal(new Set(paidChain).size, 3);
  assert.equal(cfg.paidMonthlyLimit, 300);
  assert.equal(resolveConfig({ GPT_PAID_MONTHLY_LIMIT: '99999' } as AnyEnv).paidMonthlyLimit, 300);
  for (const model of paidChain) assert.ok(buildChatBody(model, [], 900).provider.max_price.completion <= 0.32);
});

test('resolveConfig: model runtime knobs are clamped, the paid primary for free stays off unless "true"', () => {
  const defaults = resolveConfig({} as AnyEnv);
  assert.equal(defaults.maxOutputTokens, 1600);
  assert.equal(defaults.firstContentTimeoutMs, 12_000);
  assert.equal(defaults.freeTierPaidPrimary, false);
  assert.equal(defaults.freePaidDailyUsd, 1);
  assert.equal(defaults.zaiEvalApproved, '');
  const low = resolveConfig({
    GPT_MAX_OUTPUT_TOKENS: '50',
    GPT_FIRST_CONTENT_TIMEOUT_MS: '100',
    GPT_FREE_PAID_DAILY_USD: '-3',
  } as AnyEnv);
  assert.deepEqual([low.maxOutputTokens, low.firstContentTimeoutMs, low.freePaidDailyUsd], [400, 5_000, 0]);
  const high = resolveConfig({
    GPT_MAX_OUTPUT_TOKENS: '99999',
    GPT_FIRST_CONTENT_TIMEOUT_MS: '99999',
    GPT_FREE_PAID_DAILY_USD: '500',
  } as AnyEnv);
  assert.deepEqual([high.maxOutputTokens, high.firstContentTimeoutMs, high.freePaidDailyUsd], [4000, 20_000, 20]);
  assert.equal(resolveConfig({ GPT_FREE_PAID_DAILY_USD: '0.5' } as AnyEnv).freePaidDailyUsd, 0.5);
  assert.equal(resolveConfig({ GPT_FREE_PAID_DAILY_USD: 'lots' } as AnyEnv).freePaidDailyUsd, 1);
  assert.equal(resolveConfig({ GPT_MAX_OUTPUT_TOKENS: 'many' } as AnyEnv).maxOutputTokens, 1600);
  for (const value of ['false', '1', 'yes', ''])
    assert.equal(resolveConfig({ GPT_FREE_TIER_PAID_PRIMARY: value } as AnyEnv).freeTierPaidPrimary, false, value);
  assert.equal(resolveConfig({ GPT_FREE_TIER_PAID_PRIMARY: ' TRUE ' } as AnyEnv).freeTierPaidPrimary, true);
  // The committed config keeps it off until the model probe (release step R1.1).
  const wrangler = readFileSync('wrangler.toml', 'utf8');
  assert.match(wrangler, /^GPT_FREE_TIER_PAID_PRIMARY = "false"$/m);
  assert.match(wrangler, /^GPT_MAX_OUTPUT_TOKENS = "1600"$/m);
  // Stop is charged past 600 delivered characters (decision L4), and the chat
  // can only see Stop with request.signal on (plan WP-04).
  assert.match(wrangler, /^GPT_STOP_CHARGE_MIN_CHARS = "600"$/m);
  assert.match(wrangler, /"GPT_STOP_CHARGE_MIN_CHARS":"600"/);
  assert.match(wrangler, /^compatibility_flags = \[[^\]]*"enable_request_signal"[^\]]*\]$/m);
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
  const tg = validateLead({ consent: true, telegram: '@alisher' });
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

// The salted v2 scheme and its switch-over: tests/gpt-hash-salt.test.ts.
test('hashIp: deterministic hex per address without a salt', async () => {
  const cfg = resolveConfig({} as AnyEnv);
  const a = await hashIp('1.2.3.4', cfg);
  const b = await hashIp('1.2.3.4', cfg);
  const c = await hashIp('1.2.3.5', cfg);
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

test('AI cabinet roles are localized and affect the request without user data', () => {
  assert.equal(getRoles('ru').length, 7);
  assert.equal(getRoles('uz').length, 7);
  const prompt = applyRole('Напиши пост', 'smm', 'ru');
  assert.match(prompt, /SMM-специалист/);
  assert.match(prompt, /Задача: Напиши пост/);
  assert.match(prompt, /естественном русском языке/);
  const uz = applyRole('Post yoz', 'teacher', 'uz');
  assert.match(uz, /Uzbek Latin/);
  assert.match(uz, /Vazifa: Post yoz/);
});

test('AI cabinet shares the quota between the RU and UZ chats and clears only the chat session', () => {
  const memory = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
  };
  const previous = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory() });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: memory() });
  try {
    assert.equal(loadRemaining(), -1);
    saveRemaining(14);
    // The UZ chat's answer reports the same server allowance a moment later.
    saveRemaining(8);
    assert.equal(loadRemaining(), 8);
    saveSessionId('session-1', 'ru');
    clearSessionId('ru');
    assert.equal(loadRemaining(), 8);
  } finally {
    for (const name of ['localStorage', 'sessionStorage'] as const) {
      if (previous[name]) Object.defineProperty(globalThis, name, { configurable: true, value: previous[name] });
      else delete (globalThis as Partial<Record<typeof name, Storage>>)[name];
    }
  }
});

test('AI cabinet templates cover SMM, business, study and image prompt MVP', () => {
  assert.ok(getTemplates('smm', 'ru').length >= 4);
  assert.ok(getTemplates('business', 'ru').length >= 7);
  assert.ok(getTemplates('study', 'uz').length >= 6);
  assert.ok(getTemplates('images', 'ru').length >= 3);
  const imagePrompt = buildImagePromptRequest('кофейня в Ташкенте', 'banner', 'ru');
  assert.match(imagePrompt, /Не создавай изображение/);
  assert.match(imagePrompt, /16:9/);
  const uzImagePrompt = buildImagePromptRequest('kafe', 'instagram', 'uz');
  assert.match(uzImagePrompt, /faqat prompt/i);
  assert.doesNotMatch(uzImagePrompt, /[А-Яа-яЁё]/);
});

// First screen of the chat (2026-09-30): honest routing for visitors who
// searched for the official ChatGPT, and a visible way from the Russian chat
// to the Uzbek one. The chat is client-rendered, so none of this reaches the
// prerendered HTML; these tests pin the copy and the wiring instead.
test('chat first screen: the official ChatGPT line is honest, localized and number-free', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const p = strings(locale).premium;
    const line = `${p.officialLead}chatgpt.com${p.officialTail}`;
    assert.match(line, /OpenAI/);
    assert.match(line, /GPTBot\.uz/);
    assert.match(line, locale === 'uz' ? /mustaqil/ : /независим/);
    assert.doesNotMatch(line, /\d/, 'no number may enter the routing line');
    assert.ok(p.officialLead.endsWith(' ') && p.officialTail.startsWith(' '), 'the link keeps a space on both sides');
  }
  assert.ok(!strings('uz').premium.officialTail.includes("'"), 'Uzbek copy uses letter apostrophes');
});

test('chat first screen: only the Russian chat carries the Uzbek entry', () => {
  assert.deepEqual(strings('ru').uzEntry, { nav: 'O‘zbekcha', page: 'O‘zbekcha sahifa →' });
  assert.equal(strings('uz').uzEntry, undefined);
});

test('chat first screen: links, tap targets and events are wired', () => {
  const consoleSource = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  // chatgpt.com opens in a new tab, without an opener or a referrer.
  assert.match(consoleSource, /href="https:\/\/chatgpt\.com\/"\s+target="_blank"\s+rel="noopener noreferrer"\s+onClick=\{onOfficialClick\}/);
  // The header switch keeps its target, hreflang and 44px cell; only the label changes.
  const header = consoleSource.slice(consoleSource.indexOf('l.lang === "uz" && uzEntry'), consoleSource.indexOf('</nav>'));
  assert.match(header, /href=\{l\.href\}/);
  assert.match(header, /hrefLang=\{l\.lang\}/);
  assert.match(header, /min-h-11 min-w-11/);
  assert.match(header, /onLocaleSwitch\("header"\)/);
  assert.match(consoleSource, /code: "UZ",\s+href: "\/uz\/gpt-uzbek-tilida\/"/);
  assert.match(consoleSource, /code: "RU",\s+href: "\/ru\/gpt-chat\/"/);
  // The resting-screen link to the Uzbek chat.
  assert.match(consoleSource, /href="\/uz\/gpt-uzbek-tilida\/"\s+hrefLang="uz"[\s\S]{0,200}onClick=\{\(\) => onLocaleSwitch\("empty"\)\}/);
  assert.match(consoleSource, /track\(EV\.officialLinkClicked, \{ surface: "empty" \}\)/);
  assert.match(consoleSource, /track\(EV\.localeSwitched, \{ from: "ru", surface \}\)/);
  assert.equal(EV.officialLinkClicked, 'official_link_clicked');
  assert.equal(EV.localeSwitched, 'locale_switched');
  const css = readFileSync(new URL('../src/gpt-chat/premium.css', import.meta.url), 'utf8');
  assert.match(css, /\.gpt-official \{[^}]*font-size: 12px/);
  // 12px text: 15px of padding above and below the ~14px inline box is a
  // 44px+ target, and position:relative keeps the next line from taking half of it.
  assert.match(css, /\.gpt-official a \{[^}]*position: relative;[^}]*padding: 15px 2px;/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canStartCheckout, canResumeCheckout, safeAccountLink, safeTermsLink, validAccountView, type AccountView } from '../src/gpt-chat/types';
import { limitCard } from '../src/gpt-chat/limit-card';
import type { LimitReason, LimitState } from '../src/gpt-chat/limit-state';
import { strings } from '../src/gpt-chat/i18n';

const account = (): AccountView => ({ ok: true, mode: 'test', loginAvailable: true, providers: ['click', 'payme'], user: { signedIn: true, storageKey: 'a'.repeat(64) }, remaining: 15, terms: { ru: 'https://gptbot.uz/ru/offer/', uz: 'https://gptbot.uz/uz/offer/' }, termsVersion: '2026-09-06' });

test('checkout requires valid identity, current locale terms, version and merchant availability', () => {
  assert.equal(canStartCheckout(account(), 'ru'), true);
  for (const value of [null, { ...account(), user: null }, { ...account(), providers: [] }, { ...account(), mode: null }, { ...account(), termsVersion: null }, { ...account(), termsVersion: ' ' }, { ...account(), terms: { ru: null, uz: '/uz/offer/' } }, { ...account(), terms: { ru: 'https://evil.example/offer/', uz: null } }]) {
    assert.equal(canStartCheckout(value as AccountView | null, 'ru'), false);
  }
  const uzOnly = { ...account(), terms: { ru: null, uz: '/uz/offer/' } };
  assert.equal(canStartCheckout(uzOnly, 'uz'), true);
});

test('malformed account responses fail closed before identity or receipt UI is consumed', () => {
  assert.equal(validAccountView(account()), true);
  assert.equal(validAccountView({ ...account(), user: null, providers: [], mode: null, termsVersion: null }), true, 'Disabled billing preserves valid guest chat');
  for (const value of [{ ...account(), user: { signedIn: true } }, { ...account(), user: { signedIn: true, storageKey: 'a@b.test' } }, { ...account(), providers: ['unknown'] }, { ...account(), receipts: {} }, { ...account(), remaining: -1 }, { ...account(), user: null, access: { order_id: 'x', ends_at: Date.now(), remaining: 5 } }]) {
    assert.equal(validAccountView(value), false);
  }
});

test('pending payment prevents starting another checkout and unsafe terms or receipt schemes are rejected', () => {
  for (const state of ['pending', 'prepared']) assert.equal(canStartCheckout({ ...account(), payment: { id: 'order', state } }, 'ru'), false);
  assert.equal(canStartCheckout({ ...account(), payment: { id: 'order', state: 'cancelled' } }, 'ru'), true);
  for (const link of ['javascript:alert(1)', 'data:text/plain,secret', 'http://gptbot.uz/terms', 'https://user:secret@gptbot.uz/terms']) assert.equal(safeAccountLink(link), null);
  assert.equal(safeTermsLink('https://gptbot.uz:8443/terms'), null);
  assert.equal(safeTermsLink('/ru/terms/'), 'https://gptbot.uz/ru/terms/');
});

test('a pending checkout can be resumed only for its available provider with valid current terms', () => {
  const pending = { ...account(), payment: { id: 'existing', state: 'pending', provider: 'payme' as const } };
  assert.equal(canStartCheckout(pending, 'ru'), false);
  assert.equal(canResumeCheckout(pending, 'ru'), true);
  assert.equal(canResumeCheckout({ ...pending, providers: ['click'] }, 'ru'), false);
  assert.equal(canResumeCheckout({ ...pending, termsVersion: null }, 'ru'), false);
  assert.equal(canResumeCheckout({ ...pending, payment: { id: 'existing', state: 'pending' } }, 'ru'), false);
  assert.equal(canResumeCheckout({ ...pending, payment: { ...pending.payment, state: 'cancelled' } }, 'ru'), false);
});

test('botHandoff is a boolean or absent; anything else fails the view closed', () => {
  assert.equal(validAccountView({ ...account(), botHandoff: true }), true);
  assert.equal(validAccountView({ ...account(), botHandoff: false }), true);
  assert.equal(validAccountView(account()), true, 'an older server without the field stays valid (and means no bot)');
  for (const botHandoff of ['true', 1, null, {}]) assert.equal(validAccountView({ ...account(), botHandoff }), false);
});

test('freeLimits is two counts or absent; anything else fails the view closed', () => {
  assert.equal(validAccountView({ ...account(), freeLimits: { daily: 15, hourly: 5 } }), true);
  assert.equal(validAccountView(account()), true, 'an older server without the field stays valid');
  for (const freeLimits of [null, {}, { daily: 15 }, { daily: '15', hourly: 5 }, { daily: 15, hourly: -1 }, { daily: 1.5, hourly: 5 }, [15, 5]]) {
    assert.equal(validAccountView({ ...account(), freeLimits }), false, JSON.stringify(freeLimits));
  }
});

const REASONS: LimitReason[] = ['hourly', 'daily', 'pack_daily', 'monthly', 'busy', 'ip'];
const NOW = Date.parse('2026-10-01T10:00:00Z');
const limitOf = (reason: LimitReason): LimitState => ({
  reason, retryAt: reason === 'monthly' ? null : NOW + 30 * 60_000, since: NOW,
  limits: reason === 'pack_daily' ? { daily: 50, hourly: null } : { daily: 15, hourly: 5 },
});

test('the limit card: the pack only while it can be bought, the bot only while the server enables it', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const t = strings(locale);
    for (const reason of REASONS) {
      for (const paid of [false, true]) {
        for (const billingAvailable of [false, true]) {
          for (const botHandoff of [false, true]) {
            const label = `${locale}/${reason}/paid=${paid}/billing=${billingAvailable}/bot=${botHandoff}`;
            const card = limitCard(locale, limitOf(reason), { paid, billingAvailable, botHandoff, remaining: 7 }, NOW);
            const freeCap = reason === 'hourly' || reason === 'daily';
            assert.equal(card.bot, botHandoff && freeCap ? reason : null, label);
            assert.equal(card.account, billingAvailable && (reason === 'monthly' || (freeCap && !paid)), label);
            const text = [card.title, card.body, card.wait].join(' ');
            assert.doesNotMatch(text, /Telegram|\bbot/i, `${label}: no line points to a bot the card may not show`);
            assert.doesNotMatch(text, /Plus|obuna|подписк/i, label);
            assert.ok(!text.includes(t.premium.unavailable), `${label}: never "the free chat is available" to a blocked visitor`);
          }
        }
      }
    }
  }
});

test('every reason has its own words; o‘ and g‘ use U+2018', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const bodies = REASONS.map((reason) => limitCard(locale, limitOf(reason), { paid: false, billingAvailable: false, botHandoff: false, remaining: 7 }, NOW).body);
    assert.equal(new Set(bodies).size, REASONS.length, locale);
  }
  const uz = strings('uz');
  const uzCopy = [uz.hourlyTitle, uz.hourlyBody(5), uz.hourlyBody(null), uz.dailyTitle, uz.dailyBody(15, true), uz.packDailyBody(50, 3, false),
    uz.busyBody, uz.ipBody, uz.limitWait(3), uz.limitLessMinute, uz.limitReady, uz.limitDraftKept, uz.truncated].join(' ');
  assert.ok(!uzCopy.includes("'"), 'no ASCII apostrophe in Uzbek copy');
  assert.match(uzCopy, /Tarmog‘ingizdan so‘rovlar/);
});

test('the chat feeds the card from the limit state; the account view only reports to it', () => {
  const source = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  assert.match(source, /setBotHandoff\(account\?\.botHandoff === true\)/);
  assert.match(source, /limitCard\(config\.locale, limit, \{ billingAvailable, paid, botHandoff, remaining \}, clock\)/);
  assert.doesNotMatch(source, /setLimitReached|onLimitRetry|FREE_DAILY_SEGMENTS/);
  const onAccount = source.slice(source.indexOf('const onAccount = useCallback('), source.indexOf('}, [config.locale]);'));
  const dispatches = [...onAccount.matchAll(/dispatchLimit\(\{\s*type: "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(dispatches, ['account'], 'the account view can only report, never block or admit');
  const refused = source.slice(source.indexOf('} else if (res.code === "limit_reached") {'), source.indexOf('track(EV.limitReached'));
  assert.match(refused, /setMessages\(history\);\s*setInput\(trimmed\);/, 'the question goes back into the composer');
  const mounts = [...source.matchAll(/<AiLimitTelegram\s/g)];
  assert.equal(mounts.length, 1);
  assert.match(source.slice(0, mounts[0].index), /\{card\.bot && \(\s*$/);
});

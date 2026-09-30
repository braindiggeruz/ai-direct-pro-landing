import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canStartCheckout, canResumeCheckout, safeAccountLink, safeTermsLink, validAccountView, type AccountView } from '../src/gpt-chat/types';
import { limitCard } from '../src/gpt-chat/limit-card';
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

test('without botHandoff the limit card offers no bot and no line points to one', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const t = strings(locale);
    const botLines = [t.hourlyBody, t.dailyBody, t.capTelegramCta, t.capTelegramNote];
    for (const reason of ['hourly', 'daily', 'monthly'] as const) {
      for (const paid of [false, true]) {
        for (const billingAvailable of [false, true]) {
          const off = limitCard(locale, { reason, paid, billingAvailable, botHandoff: false });
          const label = `${locale}/${reason}/paid=${paid}/billing=${billingAvailable}`;
          assert.equal(off.bot, false, label);
          assert.ok(!botLines.includes(off.body), label);
          assert.notEqual(off.body, t.premium.unavailable, `${label}: never "the free chat is available" to a blocked visitor`);
          assert.equal(off.accountFirst, billingAvailable && !paid, label);
          const on = limitCard(locale, { reason, paid, billingAvailable, botHandoff: true });
          assert.equal(on.bot, true, label);
          assert.notEqual(on.body, t.premium.unavailable, label);
        }
      }
    }
    // With the flag on, the free caps keep their bot copy (package A).
    assert.equal(limitCard(locale, { reason: 'hourly', paid: false, billingAvailable: false, botHandoff: true }).body, t.hourlyBody);
    assert.equal(limitCard(locale, { reason: 'daily', paid: false, billingAvailable: false, botHandoff: true }).body, t.dailyBody);
    assert.equal(limitCard(locale, { reason: 'daily', paid: false, billingAvailable: false, botHandoff: false }).body, t.dailyTitle);
  }
});

test('the chat renders the bot route only behind the limit card decision fed by the account view', () => {
  const source = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  assert.match(source, /setBotHandoff\(account\?\.botHandoff === true\)/);
  assert.match(source, /limitCard\(config\.locale, \{ reason: limitReason, paid, billingAvailable, botHandoff \}\)/);
  const mounts = [...source.matchAll(/<AiLimitTelegram\s/g)];
  assert.equal(mounts.length, 1);
  assert.match(source.slice(0, mounts[0].index), /\{card\.bot && \(\s*$/);
});

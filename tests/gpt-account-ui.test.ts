import test from 'node:test';
import assert from 'node:assert/strict';
import { canStartCheckout, canResumeCheckout, safeAccountLink, safeTermsLink, validAccountView, type AccountView } from '../src/gpt-chat/types';

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

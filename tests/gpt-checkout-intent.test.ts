import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canStartCheckout, canResumeCheckout, checkoutOfferKey, offeredProviders, type AccountView } from '../src/gpt-chat/types';

const view = (): AccountView => ({
  ok: true, loginAvailable: true, mode: 'live', providers: ['click'], user: null,
  guestCheckout: true, termsVersion: 'ai-paket-2026-10-v4',
  terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/oferta/' },
  pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: { percent: 12, includedTiyin: 214286 } },
});

test('one-tap binds the displayed offer to locale, price, quota, VAT and account identity', () => {
  const shown = view();
  const key = checkoutOfferKey(shown, 'ru');
  assert.ok(key);
  assert.equal(checkoutOfferKey(structuredClone(shown), 'ru'), key);
  assert.notEqual(checkoutOfferKey(shown, 'uz'), key);
  for (const delta of [
    { termsVersion: 'ai-paket-2026-10-v5' },
    { terms: { ...shown.terms, ru: 'https://gptbot.uz/ru/oferta/new/' } },
    { user: { signedIn: true as const, storageKey: 'account_0123456789abcdef' } },
    { pack: { ...shown.pack!, priceUzs: 30000 } },
    { pack: { ...shown.pack!, messageLimit: 100 } },
    { pack: { ...shown.pack!, months: 2 } },
    { pack: { ...shown.pack!, dailyLimit: 20 } },
    { pack: { ...shown.pack!, vat: null } },
  ]) assert.notEqual(checkoutOfferKey({ ...shown, ...delta }, 'ru'), key);
  assert.equal(checkoutOfferKey({ ...shown, payment: { id: 'pay_pending', provider: 'click', state: 'pending' } }, 'ru'), null);
  assert.equal(checkoutOfferKey({ ...shown, termsVersion: null }, 'ru'), null);
});

test('guest start and resume use only providers actually available to that visitor', () => {
  for (const registeredGuest of [false, true]) {
    const guest = { ...view(), user: registeredGuest ? { signedIn: true as const, guest: true, storageKey: 'guest_0123456789abcdef' } : null };
    for (const [provider, mode, expected] of [
      ['click', 'live', true], ['click', 'test', true],
      ['payme', 'live', true], ['payme', 'test', false],
      ['uzum', 'live', false], ['uzum', 'test', false],
    ] as const) {
      const current = { ...guest, mode, providers: [provider] };
      assert.equal(offeredProviders(current).length > 0, expected);
      assert.equal(canStartCheckout(current, 'ru'), expected);
      assert.equal(canResumeCheckout({ ...current, payment: { id: 'pay_test', state: 'pending', provider } }, 'ru'), expected);
    }
  }
});

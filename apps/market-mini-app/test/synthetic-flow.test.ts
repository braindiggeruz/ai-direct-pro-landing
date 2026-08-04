import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticRequest } from '../src/dev/synthetic';
import { formatPrice, t } from '../src/lib/i18n';
import type { CheckoutSnapshot, Product, SessionExchange } from '../src/types';

test('RU and Uzbek Latin essential commerce copy is complete', () => {
  for (const locale of ['ru', 'uz'] as const) {
    assert.ok(t(locale, 'requestNotice'));
    assert.ok(t(locale, 'confirm'));
    assert.ok(t(locale, 'commandsOff'));
    assert.match(formatPrice(349000, locale), /349|349\s000/);
  }
  assert.match(t('uz', 'noProductsBody'), /So‘rov/);
});

test('synthetic buyer can traverse catalog and checkout state machine', async () => {
  const session = await syntheticRequest<SessionExchange>('/session/exchange', {
    method: 'POST', body: { initData: 'fixture' },
  });
  assert.equal(session.capabilities.sellerRead, true);
  const home = await syntheticRequest<{ products: Product[] }>('/catalog/home');
  const product = home.products[0];
  const checkout = await syntheticRequest<CheckoutSnapshot>('/checkout', {
    method: 'POST', body: { productId: product.id },
  });
  assert.equal(checkout.state, 'awaiting_quantity');
  await syntheticRequest('/checkout/quantity', { method: 'POST', body: { quantity: 2 } });
  await syntheticRequest('/checkout/name', { method: 'POST', body: { name: 'Aziza' } });
  await syntheticRequest('/checkout/phone', { method: 'POST', body: { phone: '+998901234567' } });
  await syntheticRequest('/checkout/address', { method: 'POST', body: { address: 'Tashkent' } });
  const ready = await syntheticRequest<CheckoutSnapshot>('/checkout/comment/skip', { method: 'POST' });
  assert.equal(ready.state, 'awaiting_confirmation');
  const placed = await syntheticRequest<CheckoutSnapshot>('/checkout/confirm', { method: 'POST' });
  assert.equal(placed.outcome, 'placed');
});

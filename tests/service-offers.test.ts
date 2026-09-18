// The Service → Offer node must repeat a price the visitor can read in the hero
// trust chips and nothing else: "от" / "-dan" is a starting price (minPrice),
// a monthly chip is a per-month specification, and a page without a visible
// price gets no Offer at all.
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOfferLd, offerFromTrustChips } from '../scripts/service-offers';

test('a Russian starting-price chip becomes a UZS minPrice', () => {
  const offer = offerFromTrustChips(['От 1 990 000 сум', 'Запуск от 5 дней', 'RU + UZ']);
  assert.deepEqual(offer, { minPrice: 1_990_000, priceCurrency: 'UZS', perMonth: false, source: 'От 1 990 000 сум' });
});

test('an Uzbek -dan chip and a prefixed chip are read the same way', () => {
  assert.equal(offerFromTrustChips(['1 490 000 so‘mdan', '5 kundan'])?.minPrice, 1_490_000);
  assert.equal(offerFromTrustChips(['Landing 2 990 000 so‘mdan'])?.minPrice, 2_990_000);
  assert.equal(offerFromTrustChips(['Аудит от 990 000 сум', 'Ведение от 2 490 000 сум/мес'])?.minPrice, 990_000);
});

test('a monthly chip is flagged per month in both languages', () => {
  assert.equal(offerFromTrustChips(['От 2 490 000 сум/мес'])?.perMonth, true);
  assert.equal(offerFromTrustChips(['Oyiga 2 490 000 so‘mdan'])?.perMonth, true);
  assert.equal(offerFromTrustChips(['От 1 990 000 сум'])?.perMonth, false);
});

test('chips without a currency amount never produce an Offer', () => {
  assert.equal(offerFromTrustChips(['Запуск от 5 дней', 'RU + UZ', 'Кейсы открыты']), null);
  assert.equal(offerFromTrustChips(['Boshlang‘ich narx ≠ to‘liq loyiha', 'To‘lovdan oldin scope']), null);
  assert.equal(offerFromTrustChips(undefined), null);
  assert.equal(offerFromTrustChips([]), null);
});

test('the Offer JSON-LD carries minPrice only, never a fixed price', () => {
  const offer = buildOfferLd(offerFromTrustChips(['От 1 990 000 сум'])!, 'https://gptbot.uz/ru/ai-bot-dlya-biznesa/');
  assert.deepEqual(offer, {
    '@type': 'Offer',
    url: 'https://gptbot.uz/ru/ai-bot-dlya-biznesa/',
    priceCurrency: 'UZS',
    priceSpecification: { '@type': 'PriceSpecification', minPrice: 1_990_000, priceCurrency: 'UZS' },
  });
  assert.ok(!('price' in offer));
});

test('a monthly Offer is a per-month UnitPriceSpecification', () => {
  const offer = buildOfferLd(offerFromTrustChips(['Oyiga 2 490 000 so‘mdan'])!, 'https://gptbot.uz/uz/smm-xizmatlari/');
  assert.deepEqual(offer.priceSpecification, {
    '@type': 'UnitPriceSpecification', minPrice: 2_490_000, priceCurrency: 'UZS', unitCode: 'MON', billingIncrement: 1,
  });
});

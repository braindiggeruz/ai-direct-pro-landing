import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeBuyerResponse,
  projectBuyerFacts,
  type BuyerQueryResult,
} from '../functions/agents/sotuvchi';
import {
  deliverTelegramMessages,
  renderTelegramOutbound,
  type TelegramDeliveryPort,
} from '../functions/channels/telegram';
import { groundResponse } from '../functions/platform/runtime';

function buyerResult(mediaRef = 'AgACAgIAAxkBAAIB.test:opaque'): BuyerQueryResult {
  return {
    intent: 'catalog.list',
    results: [{
      product: {
        id: 'product-media-1',
        orgId: 'org-1',
        storeId: 'store-1',
        categoryId: 'category-1',
        sku: 'MEDIA-1',
        name: 'Настольная лампа',
        description: 'Тёплый свет и компактный корпус.',
        priceMinor: 249_000,
        currency: 'UZS',
        availability: 'available',
        status: 'published',
        mediaRefs: mediaRef ? [mediaRef] : [],
        searchTerms: [],
        specifications: [],
        version: 1,
        createdAt: '2026-07-30T10:00:00.000Z',
        updatedAt: '2026-08-01T09:15:00.000Z',
      },
      categoryName: 'Освещение',
      storeName: 'Демо-магазин',
      score: 100,
      matchedTokens: 1,
      matchedConstraints: [],
      unmatchedConstraints: [],
      confidence: 'high',
      reasonCodes: ['catalog_listing'],
      sourceProductId: 'product-media-1',
      sourceStoreId: 'store-1',
    }],
    hasMore: false,
    nextOffset: 1,
    fullCard: false,
    state: 'ok',
  };
}

test('market product card keeps exact Telegram media and freshness facts', () => {
  const values = projectBuyerFacts(buyerResult(), 'ru');
  assert.equal(
    values['catalog.results.0.media_ref'],
    'AgACAgIAAxkBAAIB.test:opaque',
  );
  assert.equal(values['catalog.results.0.updated_display'], '2026-08-01');

  const facts = { toolName: 'buyer.catalog.query', values };
  const response = composeBuyerResponse(facts, 'ru');
  assert.deepEqual(groundResponse(response, [facts]), { status: 'passed' });
  assert.equal(response.messages[0].mediaRef, values['catalog.results.0.media_ref']);
  assert.equal(response.messages[0].card?.actions?.length, 2);
  assert.ok(response.messages[0].card?.fields.some(
    ({ label, value }) => label === 'Обновлено' && value === '2026-08-01',
  ));
  assert.equal(response.messages.at(-1)?.card, undefined);
});

test('Telegram renderer accepts only opaque media references', () => {
  const [valid, invalid] = renderTelegramOutbound([
    { text: 'Карточка', mediaRef: 'AgACAgIAAxkBAAIB.test:opaque' },
    { text: 'Небезопасная ссылка', mediaRef: 'https://example.com/photo.jpg' },
  ]);
  assert.equal(valid.mediaRef, 'AgACAgIAAxkBAAIB.test:opaque');
  assert.equal(invalid.mediaRef, undefined);
});

test('Telegram delivery uses media caption and preserves long card text', async () => {
  const sent: Array<{ kind: 'media' | 'text'; value: string; caption?: string }> = [];
  const delivery: TelegramDeliveryPort = {
    async sendText(_threadRef, text) {
      sent.push({ kind: 'text', value: text });
      return true;
    },
    async sendMedia(_threadRef, mediaRef, caption) {
      sent.push({ kind: 'media', value: mediaRef, ...(caption ? { caption } : {}) });
      return true;
    },
    async answerCallback() {
      return true;
    },
  };

  assert.equal(await deliverTelegramMessages(delivery, '123', [{
    text: 'Короткая карточка',
    mediaRef: 'opaque-photo-1',
  }]), true);
  assert.deepEqual(sent, [{
    kind: 'media',
    value: 'opaque-photo-1',
    caption: 'Короткая карточка',
  }]);

  const longText = `Длинная карточка\n${'детали '.repeat(700)}`;
  assert.equal(await deliverTelegramMessages(delivery, '123', [{
    text: longText,
    mediaRef: 'opaque-photo-2',
  }]), true);
  assert.equal(sent[1].kind, 'media');
  assert.equal(sent[1].caption, undefined);
  assert.equal(sent.slice(2).filter(({ kind }) => kind === 'text')
    .map(({ value }) => value).join(' ').replace(/\s+/g, ' ').trim(),
  longText.replace(/\s+/g, ' ').trim());
});

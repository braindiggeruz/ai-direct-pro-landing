import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import type { GlobalSEO } from '../src/shared/types';
import { buildServiceLd } from '../scripts/jsonld-helpers';
import { renderTwins } from '../scripts/generate-llm-markdown';
import { studioJsonLd, type StudioPageContent } from '../apps/studio/scripts/studio-page';
import { addCalendarMonth } from '../functions/lib/gpt-chat/billing-config';
import {
  CHAT_FACTS, CHAT_PRODUCT_URLS, PRODUCT_FACTS_REVIEWED_AT,
  buildChatApplicationLd, buildChatPaidOffer, chatProductBlocks,
  productFactsManifest, refreshProductFactsManifest,
} from '../scripts/product-facts';

const read = (file: string): string => fs.readFileSync(file, 'utf8');
const global = JSON.parse(read('content/global/site.json')) as GlobalSEO;

test('both chat variants identify one application and distinct trial/paid offers', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const app = buildChatApplicationLd(global.siteUrl, locale);
    assert.equal(app['@id'], 'https://gptbot.uz/#ai-chat');
    assert.deepEqual(app.publisher, { '@id': 'https://gptbot.uz/#org' });
    assert.deepEqual(app.inLanguage, ['ru', 'uz']);
    const offers = app.offers as Record<string, unknown>[];
    assert.equal(offers.length, 2);
    assert.equal(offers[0].price, '0');
    assert.equal(offers[1].price, String(CHAT_FACTS.priceUzs));
    assert.equal(offers[1].priceCurrency, 'UZS');
    assert.match(String(offers[0].name), new RegExp(String(CHAT_FACTS.trialReplies)));
    assert.match(String(offers[1].description), new RegExp(String(CHAT_FACTS.replies)));
    assert.match(String(offers[1].description), new RegExp(String(CHAT_FACTS.dailyReplies)));
    assert.match(String(offers[1].description), /05:00/);
    assert.equal(offers[1].availability, undefined, 'static build cannot promise live payment availability');
    assert.notEqual(offers[0]['@id'], offers[1]['@id']);
    assert.equal(app.aggregateRating, undefined);
  }
});

test('the AI tariff Service addresses consumers and links the same paid offer', () => {
  const input = { global, url: '/ru/tarify-ai-chat/', name: 'AI tariff', description: 'AI tariff', serviceType: 'AI chat' };
  const tariff = buildServiceLd(input);
  assert.equal((tariff.audience as Record<string, unknown>)['@type'], 'Audience');
  assert.deepEqual(tariff.offers, buildChatPaidOffer(global.siteUrl, 'ru'));
  const business = buildServiceLd({ ...input, url: '/ru/ai-bot-dlya-biznesa/' });
  assert.equal((business.audience as Record<string, unknown>)['@type'], 'BusinessAudience');
  assert.equal(business.offers, undefined, 'no consumer price may leak to a business project');
});

test('the existing Uzbek Markdown twin uses the same factual content as HTML', () => {
  const { twins } = renderTwins();
  CHAT_PRODUCT_URLS.filter((url) => url.startsWith('/uz/')).forEach((url) => {
    const locale = 'uz';
    const blocks = chatProductBlocks(url, locale);
    const md = twins.find((twin) => twin.url === url)?.markdown;
    assert.ok(md, url);
    for (const block of blocks.filter((b) => b.type === 'p')) assert.ok(md.includes(block.text!), url);
    assert.ok(md.includes('/uz/tariflar/#ai-paket'));
  });
  assert.deepEqual(chatProductBlocks('/ru/russko-uzbekskiy-perevodchik/', 'ru'), [], 'other tool pages retain their existing copy');
  const template = read('scripts/prerender.ts');
  assert.ok(template.indexOf('renderBlocks(chatProductBlocks(') > template.indexOf('<section id="seo-summary"'), 'facts stay below the app first screen');
});

test('UZ pricing describes the chat and Studio as separate applications', () => {
  const content = JSON.parse(read('content/studio/pages/uz/tariflar.json')) as StudioPageContent;
  const graph = JSON.parse(studioJsonLd(content, global))['@graph'] as Record<string, unknown>[];
  const chat = graph.filter((node) => node['@id'] === 'https://gptbot.uz/#ai-chat');
  assert.equal(chat.length, 1);
  assert.ok(graph.some((node) => node['@type'] === 'WebApplication' && node['@id'] !== chat[0]['@id']));
  assert.equal(((chat[0].offers as Record<string, unknown>[])[1]).url, 'https://gptbot.uz/uz/tariflar/#ai-paket');
});

test('published llms manifest is generated from billing facts with one reviewed date', () => {
  const source = read('public/llms.txt');
  assert.ok(source.includes(productFactsManifest()));
  assert.equal(refreshProductFactsManifest(source), source);
  const stale = source.replace('20 000 UZS for 300 replies', '1 UZS for 999 replies');
  assert.equal(refreshProductFactsManifest(stale), source, 'the build repairs stale values in its managed block');
  assert.match(productFactsManifest(), /5 900 UZS \/ 24 hours \/ 1 full presentation/);
  assert.match(productFactsManifest(), /39 900 UZS \/ one calendar month \/ 10 full presentations/);
  // The 3-day pack comes from the pack catalog (functions/lib/gpt-chat/packs.ts), beside the monthly one.
  assert.match(productFactsManifest(), /AI chat pack, 3 days: 5 000 UZS for 30 replies, valid for 72 hours from confirmed payment/);
  const dates = [...source.matchAll(/Last updated(?: \||:)\s*(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  assert.ok(dates.length >= 2);
  assert.ok(dates.every((date) => date === PRODUCT_FACTS_REVIEWED_AT));
  assert.ok(read('public/llms-full.txt').includes(`Last updated: ${PRODUCT_FACTS_REVIEWED_AT}`));
});

test('the published boundary example follows the billing UTC calendar', () => {
  const paidAt = Date.parse('2026-07-01T02:00:00+05:00');
  assert.equal(addCalendarMonth(paidAt), Date.parse('2026-07-31T02:00:00+05:00'));
  assert.notEqual(addCalendarMonth(paidAt), Date.parse('2026-08-01T02:00:00+05:00'));
  assert.match(read('content/pages/ru/tarify-ai-chat.json'), /календарю UTC/);
  assert.match(read('content/studio/pages/uz/tariflar.json'), /UTC taqvimi/);
  assert.match(productFactsManifest(), /UTC calendar/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Block = { type: string; href?: string; text?: string; headers?: string[]; rows?: string[][] };
const tariffs = JSON.parse(readFileSync('content/pages/ru/tarify-ai-chat.json', 'utf8'));

test('unreleased Plus cannot be advertised as purchasable or activated by a contact request', () => {
  const payment = tariffs.faq.find((item: { q: string }) => /оплатить/i.test(item.q));
  assert.ok(payment, 'Pricing must explain current payment availability');
  assert.match(payment.a, /Plus.*недоступны/);
  assert.match(payment.a, /Free/);
  const offer = JSON.stringify(tariffs);
  assert.doesNotMatch(offer, /подключим тариф|\$\s*5|заявку на (?:будущий|готовящийся) Plus/);
  assert.doesNotMatch(offer, /(?:href|target)":"[^"]*(?:checkout|payment|\/api\/gpt\/)/);
});

test('pricing distinguishes immediate free chat from an existing business contact destination', () => {
  const chat = JSON.parse(readFileSync('content/pages/ru/gpt-chat.json', 'utf8'));
  assert.equal(chat.status, 'published');
  assert.equal(tariffs.ctaPrimaryHref, chat.url);
  const business = tariffs.bodyBlocks.find((block: Block) => block.type === 'cta' && /бизнес/i.test(block.text || ''));
  assert.ok(business, 'A B2B enquiry needs an explicit contact action');
  assert.equal(business.href, 'https://t.me/XGame_changerx');
  assert.ok(tariffs.bodyBlocks.some((block: Block) => block.type === 'p' && /отдельного проекта/.test(block.text || '') && /Plus/.test(block.text || '')));
});

test('SEO package starting prices remain present and are not contradicted by no-price-list copy', () => {
  const seo = JSON.parse(readFileSync('content/pages/uz/seo-xizmati.json', 'utf8'));
  const packageTable = seo.bodyBlocks.find((block: Block) => block.type === 'table' && block.headers?.some(header => /Narx/.test(header)) && block.rows?.some(row => row[0] === 'Audit'));
  assert.ok(packageTable);
  assert.deepEqual(packageTable.rows.map((row: string[]) => row.at(-1)), ['990 000 dan', '2 490 000 dan', '4 900 000 dan', '7 900 000 dan']);
  assert.doesNotMatch(JSON.stringify(seo.bodyBlocks), /tayyor narxlar ro‘yxati yo‘q/);
  assert.ok(seo.bodyBlocks.some((block: Block) => /boshlang‘ich narxlar/.test(block.text || '') && /Yakuniy smeta/.test(block.text || '')));
});

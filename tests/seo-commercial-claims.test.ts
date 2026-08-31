import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
function read(relativePath: string) { return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8')); }
function serialized(relativePath: string) { return JSON.stringify(read(relativePath)); }
function linksOf(page: any): Set<string> { const links = new Set<string>(); for (const link of page.internalLinks || []) if (link?.target) links.add(link.target); for (const block of page.bodyBlocks || []) for (const link of block.links || []) if (link?.target) links.add(link.target); return links; }

test('paid-media hub links in body copy to every commercial owner', () => {
  const page = read('content/pages/ru/internet-reklama-tashkent.json');
  const bodyTargets = new Set<string>();
  for (const block of page.bodyBlocks || []) for (const link of block.links || []) if (link?.target) bodyTargets.add(link.target);
  for (const target of ['/ru/kontekstnaya-reklama-tashkent/', '/ru/targetirovannaya-reklama-tashkent/', '/ru/telegram-ads-uzbekistan/', '/ru/performance-marketing-tashkent/', '/ru/marketingovyi-audit-tashkent/']) assert.ok(bodyTargets.has(target), `internet advertising hub is missing an in-body link to ${target}`);
  assert.ok(linksOf(page).has('/ru/digital-marketing-tashkent/'));
});

test('reviews pages are transparent scenarios, not fabricated ratings', () => {
  for (const file of ['content/pages/ru/otzyvy.json', 'content/pages/uz/sharhlar.json']) {
    const page = read(file); const text = JSON.stringify(page);
    assert.doesNotMatch(text, /★★★★★|AggregateRating|"Review"/, `${file} exposes an unverified rating`);
    assert.match(text, /обезличенн|составн|anonim|tarkibiy/i, `${file} does not explain that the scenarios are anonymised/composite`);
    assert.ok(!page.schemaTypes?.includes('Review')); assert.ok(!page.schemaTypes?.includes('AggregateRating'));
  }
});

test('commercial pages do not publish stale competitor-price snapshots as current facts', () => {
  const files = ['content/pages/ru/internet-reklama-tashkent.json', 'content/pages/ru/kontekstnaya-reklama-tashkent.json', 'content/pages/ru/targetirovannaya-reklama-tashkent.json', 'content/pages/ru/telegram-ads-uzbekistan.json', 'content/pages/ru/smm-prodvizhenie-tashkent.json', 'content/pages/ru/performance-marketing-tashkent.json', 'content/pages/uz/internet-reklama-toshkent.json', 'content/pages/uz/telegram-reklama.json', 'content/pages/uz/smm-xizmatlari.json'].filter((file) => fs.existsSync(path.join(ROOT, file)));
  for (const file of files) assert.doesNotMatch(serialized(file), /по открытым данным агентств-конкурентов|август 2026|минимальном бюджете площадки около 500 €/i, `${file} contains a stale third-party price snapshot`);
});

test('pricing pages explain scope and do not guarantee payback or zero missed enquiries', () => {
  for (const file of ['content/pages/ru/stoimost-chat-bota.json', 'content/pages/uz/chat-bot-narxi.json']) { const text = serialized(file); assert.match(text, /Как читать цену|qanday o‘qish/i); assert.match(text, /не гарант|нельзя гарант|kafolatlamaydi/i); assert.doesNotMatch(text, /ноль пропущенных|nol o‘tkazib yuborilgan/i); }
});

test('CRM pages specify delivery reliability and avoid absolute no-loss promises', () => {
  for (const file of ['content/pages/ru/ai-bot-s-crm-amocrm-bitrix24.json', 'content/pages/uz/amocrm-bitrix24-bilan-ai-bot.json']) { const text = serialized(file); assert.match(text, /Идемпотентность|Idempotentlik/); assert.match(text, /Восстановление|Tiklash/); assert.doesNotMatch(text, /чтобы ни одно обращение не потерялось|лиды больше не теряются|lidlar endi yo‘qolmaydi|birorta ham lid yo‘qolmaydi/i); assert.doesNotMatch(text, /без дублей|dublikatlarsiz/i); }
});

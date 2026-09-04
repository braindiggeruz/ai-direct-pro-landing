import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { Page } from '../src/shared/types';

const ROOT = process.cwd();
function read(relativePath: string) { return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8')); }
function serialized(relativePath: string) { return JSON.stringify(read(relativePath)); }
function linksOf(page: Page): Set<string> { const links = new Set<string>(); for (const link of page.internalLinks || []) if (link?.target) links.add(link.target); for (const block of page.bodyBlocks || []) for (const link of block.links || []) if (link?.target) links.add(link.target); return links; }

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


test('commercial price guidance is scope-led and contains no volatile reseller snapshots', () => {
  const files = [
    'content/pages/ru/internet-reklama-tashkent.json',
    'content/pages/ru/kontekstnaya-reklama-tashkent.json',
    'content/pages/ru/targetirovannaya-reklama-tashkent.json',
    'content/pages/ru/telegram-ads-uzbekistan.json',
    'content/pages/ru/smm-prodvizhenie-tashkent.json',
    'content/pages/ru/performance-marketing-tashkent.json',
    'content/pages/uz/internet-reklama-toshkent.json',
    'content/pages/uz/telegram-reklama.json',
    'content/pages/uz/smm-xizmatlari.json',
  ];
  const volatile = /по рыночным ориентирам|Рыночные цены|Bozor narxlari|Bozor mo‘ljallari|eLama|500\s*€|0,01\s*€|0,05\s*€|25[–-]27\s*mln|2026-yil avgust|август 2026/i;
  const deterministic = /снижает потери лидов|уменьшает итоговую стоимость лида|уменьшается итоговый CPL|arizalar tunda ham, navbatda ham yo‘qolmaydi|reklama byudjeti bekorga ketmaydi/i;
  for (const file of files) {
    const text = serialized(file);
    assert.doesNotMatch(text, volatile, `${file} contains a volatile market/reseller price snapshot`);
    assert.doesNotMatch(text, deterministic, `${file} contains an unsupported deterministic outcome claim`);
  }
});

test('Telegram money pages use current primary-source pricing boundaries', () => {
  for (const file of ['content/pages/ru/telegram-ads-uzbekistan.json', 'content/pages/uz/telegram-reklama.json']) {
    const page = read(file);
    const text = JSON.stringify(page);
    assert.match(text, /0,1 Toncoin/);
    assert.match(text, /https:\/\/ads\.telegram\.org\/getting-started/);
    assert.match(text, /https:\/\/ads\.telegram\.org\/tos/);
    assert.doesNotMatch(text, /eLama|500\s*€|0,01\s*€|2 million|2 миллиона евро/);
  }
});

test('Uzbek internet advertising hub exposes commercial body bridges and funnel semantics', () => {
  const page = read('content/pages/uz/internet-reklama-toshkent.json');
  const bodyTargets = new Set<string>();
  for (const block of page.bodyBlocks || []) for (const link of block.links || []) if (link?.target) bodyTargets.add(link.target);
  for (const target of ['/uz/telegram-reklama/', '/uz/smm-xizmatlari/', '/uz/seo-xizmati/', '/uz/sayt-yaratish/', '/uz/biznes-uchun-ai-bot/']) assert.ok(bodyTargets.has(target), `UZ advertising hub is missing body link to ${target}`);
  const text = JSON.stringify(page);
  assert.match(text, /Kontakt.*malakali|Kontakt bosilishi malakali/i);
  assert.match(text, /yuborilgan ariza.*sotuv/i);
});

test('public NAP uses the owner-confirmed canonical address everywhere', () => {
  const canonicalStreet = 'Yahyo Gulyamov ko‘chasi 35';
  const files: string[] = [];
  const visit = (relativePath: string) => {
    const absolutePath = path.join(ROOT, relativePath);
    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
      const child = path.join(relativePath, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (/\.(?:json|tsx?|txt|md)$/i.test(entry.name)) files.push(child);
    }
  };
  for (const root of ['content', 'src', 'public']) visit(root);

  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, /Kichik Xalqa Yo[‘']li 57|Yahyo Gulyamov ko'chasi 35/, `${file} contains a stale or non-canonical address variant`);
  }

  const site = read('content/global/site.json');
  assert.equal(site.streetAddress, canonicalStreet);
  assert.equal(site.address, `${canonicalStreet}, Toshkent, Uzbekistan`);
  for (const file of ['content/pages/ru/boss-digital.json', 'content/pages/uz/boss-digital.json']) {
    const text = serialized(file);
    assert.match(text, new RegExp(canonicalStreet));
    assert.doesNotMatch(text, /Kichik Xalqa Yo[‘']li 57/);
  }
});

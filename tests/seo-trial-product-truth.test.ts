import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { FREE_TRIAL_LIMIT } from '../functions/lib/gpt-chat/trial-store';

const read = (file: string) => fs.readFileSync(file, 'utf8');
const chatFiles = ['content/pages/ru/gpt-chat.json', 'content/pages/uz/gpt-uzbek-tilida.json'];
const acquisitionFiles = [...chatFiles, 'content/pages/ru/gpt-na-russkom.json'];
// The RU↔UZ translator pages (published 2026-10-24, chatRole translator): the same chat and
// the same 3 lifetime trial replies, so the same disclosure; they make no
// presentation claim, so the PPTX test below does not apply to them.
const translatorFiles = ['content/pages/ru/russko-uzbekskiy-perevodchik.json', 'content/pages/uz/rus-ozbek-tarjimon.json'];
const trialFiles = [...acquisitionFiles, ...translatorFiles, 'content/pages/uz/gpt-chat-qollanma.json',
  'content/blog/uz/referat-va-mustaqil-ish.json', 'content/blog/uz/rezyume-tayyorlash.json',
  // Unprotected RU funnel pages that describe the free chat (growth backlog
  // W1-01, 2026-10-24). chat-gpt-online leaves this list when its C23 301 ships.
  'content/pages/ru/gde-polzovatsya-gpt-besplatno.json', 'content/pages/ru/gpt-chat-guide.json',
  'content/pages/ru/promty-gpt-chatgpt-50-primerov.json', 'content/blog/ru/chat-gpt-na-russkom.json',
  'content/blog/ru/chat-gpt-online.json',
  // The UZ explainer that now states the trial terms next to its chat link (W1-02).
  'content/pages/uz/suniy-intellekt.json'];

test('chat acquisition copy and zero-price structured offers disclose the actual lifetime trial', () => {
  for (const file of [...acquisitionFiles, ...translatorFiles]) {
    const page = JSON.parse(read(file));
    for (const field of ['description', 'ogDescription', 'heroSubtitle']) {
      assert.match(page[field], new RegExp(String(FREE_TRIAL_LIMIT)), `${file}: ${field} must disclose the trial size`);
      assert.match(page[field], /sinov|пробн/, `${file}: ${field} must say these are trial replies`);
    }
    const app = page.extraJsonLd.find((item: { '@type': string }) => item['@type'] === 'SoftwareApplication');
    assert.equal(app.offers.price, '0');
    assert.equal(app.offers.priceCurrency, 'UZS', `${file}: the zero offer describes the local trial`);
    assert.match(app.offers.name, new RegExp(String(FREE_TRIAL_LIMIT)));
    assert.match(app.offers.description, /yangilanmaydi|без ежедневного обновления/);
    assert.match(app.offers.description, /AI.paket|AI-пакет/);
  }
});

test('web chat and its linked guides cannot republish daily/hourly or shared-IP trial terms', () => {
  for (const file of trialFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /kunlik va soatlik|kunlik,? soatlik|har kuni bepul xabar|kuniga 15|soatiga 5|дневной и часовой лимит|бесплатный дневной лимит|лимит сообщений в день|в рамках дневного лимита|[Бб]азов\S* (?:бесплатн\S* )?доступ|[Лл]имит считается по IP|[Bb]epul limit IP-manzil/iu, file);
    assert.match(source, /3 ta (?:bepul )?sinov|3 (?:бесплатных )?пробных/, file);
    assert.match(source, /yangilanmaydi|не обновляют|не обновляются/, file);
  }
  const manual = read('content/pages/uz/gpt-chat-qollanma.json');
  assert.match(manual, /bir oyga 300 ta javob/);
  assert.match(manual, /kuniga 50 tagacha/);
});

test('chat and AI-source descriptions keep presentation export separate from ordinary chat replies', () => {
  for (const file of [...acquisitionFiles, 'public/llms.txt', 'public/llms-full.txt']) {
    const source = read(file);
    assert.doesNotMatch(source, /independent, text-only|works with text only|он работает только с текстом|ИИ-чат[^\n]*только текстовые ответы|"Только текстовые ответы"|"Faqat matnli javob"|\.pptx fayl yaratmaydi|makes no \.pptx|файл презентации чат не создаёт/iu, file);
    assert.match(source, /PPTX/);
    assert.match(source, /alohida taqdimot|режим(?:е|а)? презентаций|separate presentation mode/, file);
    assert.match(source, /o‘z limiti va paketlari|отдельными лимитами и пакетами|own limits and plans/, file);
  }
});

test('official login help keeps the official destination first and identifies the limited independent trial', () => {
  const article = JSON.parse(read('content/blog/uz/chatgptga-qanday-kirish-mumkin.json'));
  const body = JSON.stringify(article.body);
  const official = body.indexOf('https://chatgpt.com/');
  const alternative = body.indexOf('/uz/gpt-uzbek-tilida/');
  assert.ok(official >= 0 && alternative > official, 'solve official account access before offering another service');
  assert.match(body, /3 ta bepul sinov javobi/);
  assert.match(body, /keyin AI paket/);
  assert.match(body, /hisobingizga kirishni tiklamaydi/);
  assert.equal(article.datePublished, '2026-09-01', 'a substantive refresh must not invent a new publication date');
  assert.equal(article.canonical, 'https://gptbot.uz/uz/blog/chatgptga-qanday-kirish-mumkin/');
});

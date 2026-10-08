import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { FREE_TRIAL_LIMIT } from '../functions/lib/gpt-chat/trial-store';

const read = (file: string) => fs.readFileSync(file, 'utf8');
const chatFiles = ['content/pages/ru/gpt-chat.json', 'content/pages/uz/gpt-uzbek-tilida.json'];
const trialFiles = [...chatFiles, 'content/pages/uz/gpt-chat-qollanma.json',
  'content/blog/uz/referat-va-mustaqil-ish.json', 'content/blog/uz/rezyume-tayyorlash.json'];

test('chat acquisition copy and zero-price structured offers disclose the actual lifetime trial', () => {
  for (const file of chatFiles) {
    const page = JSON.parse(read(file));
    for (const field of ['description', 'ogDescription', 'heroSubtitle']) {
      assert.match(page[field], new RegExp(String(FREE_TRIAL_LIMIT)), `${file}: ${field} must disclose the trial size`);
      assert.match(page[field], /sinov|пробн/, `${file}: ${field} must say these are trial replies`);
    }
    const app = page.extraJsonLd.find((item: { '@type': string }) => item['@type'] === 'SoftwareApplication');
    assert.equal(app.offers.price, '0');
    assert.match(app.offers.name, new RegExp(String(FREE_TRIAL_LIMIT)));
    assert.match(app.offers.description, /yangilanmaydi|без ежедневного обновления/);
    assert.match(app.offers.description, /AI.paket|AI-пакет/);
  }
});

test('web chat and its linked guides cannot republish daily/hourly or shared-IP trial terms', () => {
  for (const file of trialFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /kunlik va soatlik|kunlik,? soatlik|har kuni bepul xabar|kuniga 15|soatiga 5|дневной и часовой лимит|[Лл]имит считается по IP|[Bb]epul limit IP-manzil/iu, file);
    assert.match(source, /3 ta (?:bepul )?sinov|3 (?:бесплатных )?пробных/, file);
    assert.match(source, /yangilanmaydi|не обновляют|не обновляются/, file);
  }
  const manual = read('content/pages/uz/gpt-chat-qollanma.json');
  assert.match(manual, /bir oyga 300 ta javob/);
  assert.match(manual, /kuniga 50 tagacha/);
});

test('chat and AI-source descriptions keep presentation export separate from ordinary chat replies', () => {
  for (const file of [...chatFiles, 'public/llms.txt', 'public/llms-full.txt']) {
    const source = read(file);
    assert.doesNotMatch(source, /independent, text-only|works with text only|ИИ-чат[^\n]*только текстовые ответы|"Только текстовые ответы"|"Faqat matnli javob"|\.pptx fayl yaratmaydi|makes no \.pptx|файл презентации чат не создаёт/iu, file);
    assert.match(source, /PPTX/);
    assert.match(source, /alohida taqdimot|режим(?:е|а)? презентаций|separate presentation mode/, file);
    assert.match(source, /o‘z limiti va paketlari|отдельными лимитами и пакетами|own limits and plans/, file);
  }
});

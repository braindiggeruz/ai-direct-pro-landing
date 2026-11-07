import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { normalizeLatin, toCyrillic, toLatin, UZ_LETTER_MARK, UZ_TUTUQ } from '../src/shared/uz-translit';

type Block = {
  type: string;
  id?: string;
  text?: string;
  caption?: string;
  items?: string[];
  rows?: string[][];
  links?: Array<{ token: string; target: string; anchor: string }>;
};
type Doc = {
  intro?: string;
  body?: Block[];
  bodyBlocks?: Block[];
  faq: Array<{ q: string; a: string }>;
  keywords?: string[];
};

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
const converterFiles = ['content/pages/ru/kirillica-v-latinicu.json', 'content/pages/uz/kirill-lotin.json'];
const article = (slug: string) => read<Doc>(`content/blog/uz/${slug}.json`);
const blocks = (doc: Doc) => doc.bodyBlocks ?? doc.body ?? [];

test('both converter tables show 26 letters, Sh/Ch/Ng and a separate tutuq row', () => {
  for (const file of converterFiles) {
    const doc = read<Doc>(file);
    const body = blocks(doc);
    const rows = body.find(block => block.type === 'table')?.rows ?? [];
    assert.equal(rows.length, 30, `${file}: 26 letters + 3 combinations + separate sign`);
    assert.deepEqual(rows.slice(26, 29).map(row => row[0]), ['Sh sh', 'Ch ch', 'Ng ng']);
    assert.deepEqual(rows[28], ['Ng ng', 'Нг нг', 'tong — тонг']);
    assert.equal(rows[29][0], '’');
    const sourceBlock = body.find(block => block.links?.some(link => link.target === 'https://www.lex.uz/docs/-112286'));
    assert.ok(sourceBlock, `${file}: alphabet count has a direct primary source`);
    assert.match(sourceBlock.text ?? '', /26.*3.*Sh, Ch.*Ng/);
    assert.match(sourceBlock.text ?? '', /отдельно|alohida/);
    const alphabetFaq = doc.faq.find(item => /Сколько букв|nechta harf/.test(item.q));
    assert.match(alphabetFaq?.a ?? '', /26.*3.*Sh, Ch.*Ng/);
    assert.doesNotMatch(JSON.stringify(doc), /29 знаков|29 ta belgi|29 белгидан/);
  }
});

test('published Ng example converts both ways without a new alphabet algorithm', () => {
  assert.equal(toCyrillic('tong'), 'тонг');
  assert.equal(toLatin('тонг'), 'tong');
  assert.equal(toCyrillic('Ng ng'), 'Нг нг');
});

test('apostrophe guidance describes the actual tool policy without a universal Unicode mandate', () => {
  assert.equal(UZ_LETTER_MARK.codePointAt(0), 0x2018);
  assert.equal(UZ_TUTUQ.codePointAt(0), 0x2019);
  assert.equal(normalizeLatin("o'g'il san'at"), 'o‘g‘il san’at');
  for (const file of converterFiles) {
    const doc = read<Doc>(file);
    const explanation = blocks(doc).find(block => block.text?.includes('U+2018'))?.text ?? '';
    assert.match(explanation, /U\+2018/);
    assert.match(explanation, /U\+2019/);
    assert.match(explanation, /не универсальное требование закона|umumiy Unicode talabi emas/);
    assert.doesNotMatch(explanation, /Написать o’.*ошибка|tutuq belgisi bilan yozish xato/);
  }
});

test('C63 and C64 describe the alphabet accurately while retaining conversion intent', () => {
  const manifest = read<{ pairs: Array<{ id: string; informational: { owns: string } }> }>('content/seo/intent-manifest.json');
  for (const id of ['C63-uz-tarjimon-vs-kirill-lotin', 'C64-ru-perevodchik-vs-kirillica-v-latinicu']) {
    const description = manifest.pairs.find(pair => pair.id === id)?.informational.owns ?? '';
    assert.match(description, /26 letters and 3 letter combinations \(Sh, Ch, Ng\)/);
    assert.match(description, /tutuq shown separately/);
    assert.match(description, /conversion is not translation/);
    assert.doesNotMatch(description, /29-row|29-letter/);
  }
});

test('slide guide distinguishes text replies from PPTX mode and keeps a single Taqdimot AI body link', () => {
  const guide = article('slayd-tayyorlash');
  const body = blocks(guide);
  const productCopy = JSON.stringify([guide.intro, ...body, ...guide.faq]);
  assert.doesNotMatch(productCopy, /fayl yaratmaydi|Chatning o‘zi fayl bermaydi|Chat faqat matn yozadi|Dizaynni GPTBot\.uz chatidan kutmang|lekin faylni yig‘ish va bezash/);
  assert.match(body[0].text ?? '', /oddiy matnli javob/);
  assert.match(body[0].text ?? '', /alohida taqdimot rejimi/);
  const pptxFaq = guide.faq.find(item => item.q.includes('.pptx'))?.a ?? '';
  assert.match(pptxFaq, /Oddiy matnli javob.*PPTX.*alohida taqdimot rejimi/);
  assert.doesNotMatch(pptxFaq, /kuniga 1|6 slaydgacha|2 tagacha/);
  const links = body.flatMap(block => block.links ?? []).filter(link => link.target === '/uz/taqdimot-ai/');
  assert.deepEqual(links.map(link => link.anchor), ['Taqdimot AI']);
  assert.ok(!guide.keywords?.some(keyword => ['slayd ai', 'ai slayd', 'prezentatsiya ai'].includes(keyword)));
});

test('slide guide contains a clearly labelled one-slide example with three bullets and separate notes', () => {
  const body = blocks(article('slayd-tayyorlash'));
  const index = body.findIndex(block => block.text?.startsWith('Tahririy namuna — «Suvni tejash»'));
  assert.ok(index >= 0);
  assert.match(body[index].text ?? '', /namuna.*statistik ma’lumot emas/);
  assert.equal(body[index + 1].type, 'list');
  assert.equal(body[index + 1].items?.length, 3);
  assert.doesNotMatch(JSON.stringify(body.slice(index, index + 3)), /\d|%/);
  assert.match(body[index + 2].text ?? '', /Ma’ruzachi eslatmasi namunasi:.*Notes/);
});

test('résumé and application guides link to tavsifnoma in the relevant document context', () => {
  const target = '/uz/blog/tavsifnoma-namuna/';
  const resume = blocks(article('rezyume-tayyorlash'));
  const studentSection = resume.findIndex(block => block.id === 'talaba');
  const linkIndex = resume.findIndex(block => block.links?.some(link => link.target === target));
  const nextHeading = resume.findIndex((block, index) => index > studentSection && block.type === 'h2');
  assert.ok(linkIndex > studentSection && linkIndex < nextHeading);
  assert.match(resume[linkIndex].text ?? '', /Amaliyot.*rahbar.*tekshirishi kerak/);
  const applicationLink = blocks(article('tushuntirish-xati-va-ariza-yozish')).find(block => block.links?.some(link => link.target === target));
  assert.match(applicationLink?.text ?? '', /rahbarning bahosi.*o‘rnini bosmaydi/);
});

test('tavsifnoma links to script conversion after the signing checklist and distinguishes it from translation', () => {
  const body = blocks(article('tavsifnoma-namuna'));
  const index = body.findIndex(block => block.links?.some(link => link.target === '/uz/kirill-lotin/'));
  assert.ok(index > 0);
  assert.ok(body[index - 1].items?.some(item => item.includes('Imzolovchining lavozimi')));
  assert.match(body[index].text ?? '', /Bu tarjima emas: til o‘zbekcha qoladi/);
  assert.match(body[index].text ?? '', /imzolovchiga yakuniy variantni tekshirtiring/);
});

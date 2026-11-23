// Advertising GPT wave C1 (owner decision D-ADS-GPT-20261123): the advertising law, ads with
// bloggers, ad payback (ROMI/ROAS/CPL/CAC) and ads in Uzbek and Russian — four ru/uz pairs that
// answer questions people ask ChatGPT (docs/seo/research/2026-11-23-ads-cluster/ROADMAP.md, C8, C5, C1, C6).
//
// Run: node --import tsx --test tests/ads-gpt-wave-c1.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { BlogArticle } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (url: string): BlogArticle => {
  const [, locale, , slug] = url.split('/');
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'blog', locale, `${slug}.json`), 'utf8')) as BlogArticle;
};

// url -> [paired url, commercial counterpart, manifest pair id]
const WAVE: Record<string, [string, string, string]> = {
  '/ru/blog/zakon-o-reklame-v-uzbekistane/': ['/uz/blog/reklama-togrisidagi-qonun/', '/ru/internet-reklama-tashkent/', 'W20261123-18-ru-internet-ads-hub-vs-advertising-law'],
  '/uz/blog/reklama-togrisidagi-qonun/': ['/ru/blog/zakon-o-reklame-v-uzbekistane/', '/uz/internet-reklama-toshkent/', 'W20261123-19-uz-internet-ads-hub-vs-advertising-law'],
  '/ru/blog/reklama-u-blogerov-v-uzbekistane/': ['/uz/blog/reklama-blogerlarda/', '/ru/internet-reklama-tashkent/', 'W20261123-20-ru-internet-ads-hub-vs-blogger-ads'],
  '/uz/blog/reklama-blogerlarda/': ['/ru/blog/reklama-u-blogerov-v-uzbekistane/', '/uz/internet-reklama-toshkent/', 'W20261123-21-uz-internet-ads-hub-vs-blogger-ads'],
  '/ru/blog/kak-ponyat-okupaetsya-li-reklama/': ['/uz/blog/reklama-samaradorligi-romi/', '/ru/performance-marketing-tashkent/', 'W20261123-22-ru-performance-service-vs-ad-payback'],
  '/uz/blog/reklama-samaradorligi-romi/': ['/ru/blog/kak-ponyat-okupaetsya-li-reklama/', '/uz/internet-reklama-toshkent/', 'W20261123-23-uz-internet-ads-hub-vs-ad-payback'],
  '/ru/blog/reklama-na-uzbekskom-i-russkom/': ['/uz/blog/reklama-ozbek-va-rus-tilida/', '/ru/internet-reklama-tashkent/', 'W20261123-24-ru-internet-ads-hub-vs-bilingual-ads'],
  '/uz/blog/reklama-ozbek-va-rus-tilida/': ['/ru/blog/reklama-na-uzbekskom-i-russkom/', '/uz/internet-reklama-toshkent/', 'W20261123-25-uz-internet-ads-hub-vs-bilingual-ads'],
};
const ROMI = ['/ru/blog/kak-ponyat-okupaetsya-li-reklama/', '/uz/blog/reklama-samaradorligi-romi/'];
const LAW = ['/ru/blog/zakon-o-reklame-v-uzbekistane/', '/uz/blog/reklama-togrisidagi-qonun/'];
const BLOGGERS = ['/ru/blog/reklama-u-blogerov-v-uzbekistane/', '/uz/blog/reklama-blogerlarda/'];

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visibleOf = (a: BlogArticle) => [a.title, a.description, a.h1, ...texts(a.body), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');
/** «40 000 сум» → 40000, «2,5» → 2.5: digits of the leading figure only. */
const num = (s: string) => Number(s.replace(/[^\d,]/g, '').replace(',', '.'));

test('every wave-C1 article is published, opens with its answer and has FAQ, sources and a date', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    assert.equal(a.url, url);
    assert.equal(a.status, 'published', url);
    assert.deepEqual(a.body[0], { type: 'p', text: a.intro }, `${url}: body[0] must repeat the intro (the template does not render intro)`);
    assert.ok((a.faq ?? []).length >= 5, `${url}: FAQ`);
    assert.ok((a.sources ?? []).length >= 2, `${url}: sources`);
    for (const s of a.sources ?? []) assert.match(s.note ?? '', /2026-11-23/, `${url}: source note without the check date: ${s.url}`);
    assert.ok(a.title.length >= 45 && a.title.length <= 65, `${url}: title length ${a.title.length}`);
    assert.ok(a.description.length >= 120 && a.description.length <= 160, `${url}: description length ${a.description.length}`);
    assert.match(a.title, /\| GPTBot\.uz$/, `${url}: brand suffix`);
  }
});

test('hreflang pairs are symmetric', () => {
  for (const [url, [pair]] of Object.entries(WAVE)) {
    const a = read(url);
    const b = read(pair);
    assert.equal(a.hreflangRu, b.hreflangRu, url);
    assert.equal(a.hreflangUz, b.hreflangUz, url);
    assert.ok([a.hreflangRu, a.hreflangUz].includes(url), `${url}: declares itself`);
  }
});

test('no prices, no «official», no guarantees, correct Uzbek apostrophes', () => {
  for (const url of Object.keys(WAVE)) {
    const visible = visibleOf(read(url));
    const amounts = [...visible.matchAll(/(\d{1,3}(?: \d{3})*) (?:сум|so‘m)/gu)];
    if (ROMI.includes(url)) {
      // Only the labelled teaching example may print sums; it is arithmetic, not a market price.
      assert.match(visible, /Условный учебный пример, не статистика клиента|Shartli o‘quv misoli, mijoz statistikasi emas/, `${url}: the example must be labelled`);
    } else {
      assert.deepEqual(amounts.map((m) => m[0]), [], `${url}: no UZS amounts outside the labelled ROMI example`);
    }
    const rendered = [visible, ...(read(url).sources ?? []).flatMap((s) => [s.title, s.note ?? ''])].join('\n');
    assert.doesNotMatch(rendered, /официальн|official|rasmiy/i, `${url}: the brief bans «official / официальный / rasmiy» outright, sources included`);
    assert.doesNotMatch(visible, /гарантир\w* (?:результат|заявк|продаж)|natija kafolat/i, `${url}: no guarantees`);
    if (url.startsWith('/uz/')) assert.deepEqual(visible.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], [], `${url}: ASCII or modifier apostrophes`);
  }
});

test('the ROMI teaching example is arithmetically consistent in both languages', () => {
  for (const url of ROMI) {
    const a = read(url);
    const table = a.body.find((b) => b.type === 'table' && (b.rows ?? []).some((r) => r[0] === 'CAC'));
    assert.ok(table, `${url}: example table`);
    const result = (label: string) => table!.rows!.find((r) => r[0] === label)?.[2] ?? '';
    assert.equal(num(result('CPL')), 10_000_000 / 250);
    assert.equal(num(result('ROAS').split(' ')[0]), 50_000_000 / 10_000_000);
    assert.equal(num(result('CAC')), 13_000_000 / 50);
    assert.match(result(url.startsWith('/ru/') ? 'ROMI по рекламному бюджету' : 'Reklama byudjeti bo‘yicha ROMI'), /^100 %$/);
    assert.match(result(url.startsWith('/ru/') ? 'ROMI с работой подрядчика' : 'Pudratchi ishi bilan ROMI'), new RegExp(`^≈ ${Math.round(((20 - 13) / 13) * 100)} %$`));
    // Break-even ROAS = 1 / margin, quoted for 25, 40 and 60 %.
    const visible = visibleOf(a);
    for (const [margin, roas] of [[25, '4 (400 %)'], [40, '2,5 (250 %)'], [60, '1,67 (167 %)']] as const) {
      assert.equal(Math.round((1 / (margin / 100)) * 100) / 100, num(roas.split(' ')[0]), `${url}: ${margin} %`);
      assert.ok(visible.includes(roas), `${url}: break-even ROAS ${roas}`);
    }
    assert.match(visible, /≈ −38 %/, `${url}: the 20-sale counter-example`);
    assert.equal(Math.round(((8 - 13) / 13) * 100), -38);
  }
});

test('legal facts carry the law number, the latest amendment and a not-legal-advice note', () => {
  for (const url of LAW) {
    const visible = visibleOf(read(url));
    assert.match(visible, /ЗРУ-776|O‘RQ-776/, url);
    assert.match(visible, /ЗРУ-1187|O‘RQ-1187/, url);
    assert.match(visible, /не юридическая консультация|yuridik maslahat emas/, `${url}: an overview, not legal advice`);
    assert.ok((read(url).sources ?? []).some((s) => s.url.startsWith('https://lex.uz/')), `${url}: lex.uz source`);
  }
  for (const url of [...LAW, ...BLOGGERS]) {
    const a = read(url);
    assert.match(visibleOf(a), /«reklama» или «reklama huquqi asosida»|«reklama» yoki «reklama huquqi asosida»/, `${url}: the Committee label wording`);
    assert.ok((a.sources ?? []).some((s) => s.url.startsWith('https://raqobat.gov.uz/')), `${url}: Competition Committee source`);
  }
});

test('blogger articles do not claim GPTBot.uz sells blogger placement (D5 safe default)', () => {
  for (const url of BLOGGERS) {
    const a = read(url);
    assert.doesNotMatch(visibleOf(a), /закаж\w+ (?:рекламу|размещение) у блогер|размещени\w+ у блогеров под ключ|blogerlarda reklama joylashtirish xizmat/i, url);
    assert.equal(a.cta?.href, WAVE[url][1], `${url}: the call to action points at the internet-advertising service the site sells`);
  }
});

test('every article links to its commercial counterpart, and the manifest fences both sides', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/seo/intent-manifest.json'), 'utf8')) as {
    pairs: Array<{ id: string; commercial: { url: string }; informational: { url: string } }>;
  };
  for (const [url, [, money, id]] of Object.entries(WAVE)) {
    const a = read(url);
    assert.ok((a.internalLinks ?? []).some((l) => l.target === money), `${url}: internal link to ${money}`);
    assert.equal(a.targetMoneyPage, money, url);
    const pair = manifest.pairs.find((p) => p.id === id);
    assert.equal(pair?.commercial.url, money, id);
    assert.equal(pair?.informational.url, url, id);
  }
});

test('at least two existing articles outside the wave link to each new URL', () => {
  const all: BlogArticle[] = [];
  for (const locale of ['ru', 'uz']) {
    const dir = path.join(ROOT, 'content', 'blog', locale);
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) all.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as BlogArticle);
  }
  for (const url of Object.keys(WAVE)) {
    const incoming = all.filter((a) => !(a.url in WAVE) && a.status === 'published' && (a.internalLinks ?? []).some((l) => l.target === url));
    assert.ok(incoming.length >= 2, `${url}: ${incoming.length} incoming links from existing articles`);
  }
});

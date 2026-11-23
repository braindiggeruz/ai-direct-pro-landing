// Advertising GPT wave C2 (owner decision D-ADS-GPT-20261123): advertising a product or online store,
// a beauty salon, a cafe or restaurant, and a Meta Ads Manager guide in Uzbek — answers to questions people
// ask ChatGPT (docs/seo/research/2026-11-23-ads-cluster/ROADMAP.md, items C2, C3, C4, C7).
//
// Run: node --import tsx --test tests/ads-gpt-wave-c2.test.ts
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

// url -> [paired url or '', commercial counterpart, manifest pair id]
const WAVE: Record<string, [string, string, string]> = {
  '/ru/blog/kak-reklamirovat-tovar-v-uzbekistane/': ['/uz/blog/mahsulotni-reklama-qilish/', '/ru/internet-reklama-tashkent/', 'W20261123-26-ru-internet-ads-hub-vs-product-ads'],
  '/uz/blog/mahsulotni-reklama-qilish/': ['/ru/blog/kak-reklamirovat-tovar-v-uzbekistane/', '/uz/internet-reklama-toshkent/', 'W20261123-27-uz-internet-ads-hub-vs-product-ads'],
  '/ru/blog/reklama-salona-krasoty-tashkent/': ['/uz/blog/toshkentda-gozallik-saloni-reklamasi/', '/ru/internet-reklama-tashkent/', 'W20261123-28-ru-internet-ads-hub-vs-beauty-salon-ads'],
  '/uz/blog/toshkentda-gozallik-saloni-reklamasi/': ['/ru/blog/reklama-salona-krasoty-tashkent/', '/uz/internet-reklama-toshkent/', 'W20261123-29-uz-internet-ads-hub-vs-beauty-salon-ads'],
  '/ru/blog/reklama-kafe-i-restorana-tashkent/': ['/uz/blog/restoran-va-kafe-reklamasi/', '/ru/internet-reklama-tashkent/', 'W20261123-30-ru-internet-ads-hub-vs-cafe-ads'],
  '/uz/blog/restoran-va-kafe-reklamasi/': ['/ru/blog/reklama-kafe-i-restorana-tashkent/', '/uz/internet-reklama-toshkent/', 'W20261123-31-uz-internet-ads-hub-vs-cafe-ads'],
  '/uz/blog/meta-ads-manager-qollanma/': ['', '/uz/internet-reklama-toshkent/', 'W20261123-32-uz-internet-ads-hub-vs-meta-ads-manager-guide'],
};
const CAFE = ['/ru/blog/reklama-kafe-i-restorana-tashkent/', '/uz/blog/restoran-va-kafe-reklamasi/'];
const SALON = ['/ru/blog/reklama-salona-krasoty-tashkent/', '/uz/blog/toshkentda-gozallik-saloni-reklamasi/'];
const PRODUCT = ['/ru/blog/kak-reklamirovat-tovar-v-uzbekistane/', '/uz/blog/mahsulotni-reklama-qilish/'];

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visibleOf = (a: BlogArticle) => [a.title, a.description, a.h1, ...texts(a.body), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');

test('every wave-C2 article is published, opens with its answer and has FAQ, sources and a date', () => {
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

test('hreflang pairs are symmetric and the unpaired guide declares only itself', () => {
  for (const [url, [pair]] of Object.entries(WAVE)) {
    const a = read(url);
    if (!pair) {
      assert.equal(a.hreflangUz, url);
      assert.equal(a.hreflangRu ?? '', '');
      continue;
    }
    const b = read(pair);
    assert.equal(a.hreflangRu, b.hreflangRu, url);
    assert.equal(a.hreflangUz, b.hreflangUz, url);
  }
});

test('no invented prices, no «official», no guarantees, correct Uzbek apostrophes', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    const visible = visibleOf(a);
    const amounts = [...visible.matchAll(/(\d{1,3}(?: \d{3})*) (?:сум|so‘m)/gu)].map((m) => m[1]);
    // The only sum: the Yandex Eats banner top-up minimum quoted from its restaurant help with the check date.
    const allowed = CAFE.includes(url) ? ['150 000'] : [];
    for (const amount of amounts) assert.ok(allowed.includes(amount), `${url}: unexpected UZS amount «${amount}»`);
    const rendered = [visible, ...(a.sources ?? []).flatMap((s) => [s.title, s.note ?? ''])].join('\n');
    assert.doesNotMatch(rendered, /официальн|official|rasmiy/i, `${url}: the brief bans «official / официальный / rasmiy» outright, sources included`);
    assert.doesNotMatch(visible, /гарантир\w* (?:результат|заявк|продаж)|natija kafolat/i, `${url}: no guarantees`);
    if (url.startsWith('/uz/')) assert.deepEqual(visible.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], [], `${url}: ASCII or modifier apostrophes`);
  }
});

test('facts that need attribution or a legal note carry them', () => {
  for (const url of CAFE) {
    const visible = visibleOf(read(url));
    if (/Wolt/.test(visible)) assert.match(visible, /kun\.uz/, `${url}: the Wolt exit is a media report and must be attributed`);
    assert.match(visible, /ст\. 39|39-modda/, `${url}: beer and wine rules cite Art. 39`);
    assert.match(visible, /не юридическая консультация|yuridik maslahat emas/, `${url}: an overview, not legal advice`);
  }
  for (const url of SALON) {
    const visible = visibleOf(read(url));
    assert.match(visible, /согласи|rozilig/, `${url}: client photos need consent (Art. 16)`);
    assert.match(visible, /не юридическая консультация|yuridik maslahat emas/, `${url}: an overview, not legal advice`);
  }
  for (const url of PRODUCT) {
    const a = read(url);
    assert.ok((a.sources ?? []).some((s) => s.url === 'https://support.google.com/merchants/answer/160637'), `${url}: Merchant Center country list`);
    assert.ok((a.sources ?? []).some((s) => s.url === 'https://uzumads.uz/'), `${url}: Uzum Ads page`);
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

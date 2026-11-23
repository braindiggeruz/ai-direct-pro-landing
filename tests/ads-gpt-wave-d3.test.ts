// Advertising wave D3 (docs/seo/research/2026-11-23-ads-cluster-2; owner request 23.11.2026): niche playbooks for real
// estate and new builds, car dealers and online schools — built on lex.uz, the classifieds' own rules and Meta's pages,
// checked on 2026-11-23.
//
// Run: node --import tsx --test tests/ads-gpt-wave-d3.test.ts
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
  '/ru/blog/reklama-nedvizhimosti-i-novostroek/': ['/uz/blog/kochmas-mulk-reklamasi/', '/ru/internet-reklama-tashkent/', 'W20261123-63-ru-internet-ads-hub-vs-real-estate-ads-guide'],
  '/uz/blog/kochmas-mulk-reklamasi/': ['/ru/blog/reklama-nedvizhimosti-i-novostroek/', '/uz/internet-reklama-toshkent/', 'W20261123-64-uz-internet-ads-hub-vs-real-estate-ads-guide'],
  '/ru/blog/reklama-avtosalona/': ['/uz/blog/mashina-savdosi-reklamasi/', '/ru/internet-reklama-tashkent/', 'W20261123-65-ru-internet-ads-hub-vs-car-dealer-ads-guide'],
  '/uz/blog/mashina-savdosi-reklamasi/': ['/ru/blog/reklama-avtosalona/', '/uz/internet-reklama-toshkent/', 'W20261123-66-uz-internet-ads-hub-vs-car-dealer-ads-guide'],
  '/ru/blog/reklama-onlayn-shkoly/': ['/uz/blog/onlayn-maktab-reklamasi/', '/ru/internet-reklama-tashkent/', 'W20261123-67-ru-internet-ads-hub-vs-online-school-ads-guide'],
  '/uz/blog/onlayn-maktab-reklamasi/': ['/ru/blog/reklama-onlayn-shkoly/', '/uz/internet-reklama-toshkent/', 'W20261123-68-uz-internet-ads-hub-vs-online-school-ads-guide'],
};
const PRIMARY = /^https:\/\/(?:lex\.uz\/|help\.olx\.uz\/|avtoelon\.uz\/|uybor\.uz\/|www\.facebook\.com\/business\/help\/|transparency\.meta\.com\/|promote\.telegram\.org\/|yandex\.ru\/support\/direct\/|support\.google\.com\/google-ads\/)/;

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visibleOf = (a: BlogArticle) => [a.title, a.description, a.h1, ...texts(a.body), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');
const both = (ru: string, uz: string) => [visibleOf(read(ru)), visibleOf(read(uz))];

test('every wave-D3 article is published, opens with its answer and has FAQ, primary sources and a date', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    assert.equal(a.url, url);
    assert.equal(a.status, 'published', url);
    assert.deepEqual(a.body[0], { type: 'p', text: a.intro }, `${url}: body[0] must repeat the intro (the template does not render intro)`);
    assert.ok((a.faq ?? []).length >= 5, `${url}: FAQ`);
    assert.ok((a.sources ?? []).length >= 3, `${url}: sources`);
    for (const s of a.sources ?? []) {
      assert.match(s.note ?? '', /2026-11-23/, `${url}: source note without the check date: ${s.url}`);
      assert.match(s.url, PRIMARY, `${url}: every source is a primary page (platform, learning platform or lex.uz): ${s.url}`);
    }
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
    assert.equal(url.startsWith('/ru/') ? a.hreflangRu : a.hreflangUz, url);
  }
});

test('no prices, no «official», no guarantees, correct Uzbek apostrophes', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    const visible = visibleOf(a);
    assert.doesNotMatch(visible, /\d[\d\s]* (?:сум|so‘m)|\$\s?\d|\d\s?\$/u, `${url}: the wave quotes no prices`);
    const rendered = [visible, ...(a.sources ?? []).flatMap((s) => [s.title, s.note ?? ''])].join('\n');
    assert.doesNotMatch(rendered, /официальн|official|rasmiy/i, `${url}: the brief bans «official / официальный / rasmiy» outright, sources included`);
    assert.doesNotMatch(visible, /гарантир\w* (?:результат|заявк|продаж|подписчик)|natija kafolat/i, `${url}: no guarantees`);
    if (url.startsWith('/uz/')) assert.deepEqual(visible.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], [], `${url}: ASCII or modifier apostrophes`);
  }
});

test('real estate: the developer register, prices in sums, OLX rules, Meta special category scope', () => {
  for (const v of both('/ru/blog/reklama-nedvizhimosti-i-novostroek/', '/uz/blog/kochmas-mulk-reklamasi/')) {
    for (const re of [/4732/, /16/, /OLX/, /Uybor/, /12 (?:фото|ta foto|tagacha foto)/]) assert.match(v, re);
  }
});

test('car dealers: Avtoelon and OLX rules, Art. 43 and the 2027 credit warning, 18+ for loan ads', () => {
  for (const v of both('/ru/blog/reklama-avtosalona/', '/uz/blog/mashina-savdosi-reklamasi/')) {
    for (const re of [/Avtoelon/, /56/, /43/, /2027/, /10 (?:%|foiz)/, /18/]) assert.match(v, re);
  }
});

test('online schools: licence rules of the education law and where Uzbek-language ads are allowed', () => {
  for (const v of both('/ru/blog/reklama-onlayn-shkoly/', '/uz/blog/onlayn-maktab-reklamasi/')) {
    for (const re of [/лиценз|litsenziya/, /57-1/, /Yandex|Яндекс/, /Google/]) assert.match(v, re);
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

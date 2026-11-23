// Advertising wave D1 (docs/seo/research/2026-11-23-ads-cluster-2; owner request 23.11.2026 «забрать как можно больше
// запросов по рекламе»): TikTok ads from Uzbekistan, Yandex Direct, YouTube ads and paying for ads — answers to the
// questions people ask ChatGPT, built on the platforms' help pages checked on 2026-11-23.
//
// Run: node --import tsx --test tests/ads-gpt-wave-d1.test.ts
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
  '/ru/blog/reklama-v-tiktok-iz-uzbekistana/': ['/uz/blog/tiktok-reklama-ozbekistonda/', '/ru/internet-reklama-tashkent/', 'W20261123-47-ru-internet-ads-hub-vs-tiktok-ads-guide'],
  '/uz/blog/tiktok-reklama-ozbekistonda/': ['/ru/blog/reklama-v-tiktok-iz-uzbekistana/', '/uz/internet-reklama-toshkent/', 'W20261123-48-uz-internet-ads-hub-vs-tiktok-ads-guide'],
  '/ru/blog/yandeks-direkt-v-uzbekistane/': ['/uz/blog/yandex-direct-ozbekistonda/', '/ru/kontekstnaya-reklama-tashkent/', 'W20261123-49-ru-contextual-service-vs-yandex-direct-guide'],
  '/uz/blog/yandex-direct-ozbekistonda/': ['/ru/blog/yandeks-direkt-v-uzbekistane/', '/uz/internet-reklama-toshkent/', 'W20261123-50-uz-internet-ads-hub-vs-yandex-direct-guide'],
  '/ru/blog/reklama-na-youtube-v-uzbekistane/': ['/uz/blog/youtube-reklama/', '/ru/internet-reklama-tashkent/', 'W20261123-51-ru-internet-ads-hub-vs-youtube-ads-guide'],
  '/uz/blog/youtube-reklama/': ['/ru/blog/reklama-na-youtube-v-uzbekistane/', '/uz/internet-reklama-toshkent/', 'W20261123-52-uz-internet-ads-hub-vs-youtube-ads-guide'],
  '/ru/blog/sposoby-oplaty-reklamy-iz-uzbekistana/': ['/uz/blog/reklama-uchun-tolov/', '/ru/targetirovannaya-reklama-tashkent/', 'W20261123-53-ru-target-service-vs-ad-payment-guide'],
  '/uz/blog/reklama-uchun-tolov/': ['/ru/blog/sposoby-oplaty-reklamy-iz-uzbekistana/', '/uz/internet-reklama-toshkent/', 'W20261123-54-uz-internet-ads-hub-vs-ad-payment-guide'],
};
const PRIMARY = /^https:\/\/(?:ads\.tiktok\.com\/help\/|yandex\.ru\/support\/direct\/|support\.google\.com\/(?:google-ads|adspolicy)\/|www\.facebook\.com\/business\/help\/|promote\.telegram\.org\/)/;

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visibleOf = (a: BlogArticle) => [a.title, a.description, a.h1, ...texts(a.body), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');
const both = (ru: string, uz: string) => [visibleOf(read(ru)), visibleOf(read(uz))];

test('every wave-D1 article is published, opens with its answer and has FAQ, platform sources and a date', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    assert.equal(a.url, url);
    assert.equal(a.status, 'published', url);
    assert.deepEqual(a.body[0], { type: 'p', text: a.intro }, `${url}: body[0] must repeat the intro (the template does not render intro)`);
    assert.ok((a.faq ?? []).length >= 5, `${url}: FAQ`);
    assert.ok((a.sources ?? []).length >= 5, `${url}: sources`);
    for (const s of a.sources ?? []) {
      assert.match(s.note ?? '', /2026-11-23/, `${url}: source note without the check date: ${s.url}`);
      assert.match(s.url, PRIMARY, `${url}: every source is a platform's own help or policy page: ${s.url}`);
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

test('no prices in sums, no «official», no guarantees, correct Uzbek apostrophes', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    const visible = visibleOf(a);
    assert.doesNotMatch(visible, /\d[\d\s]* (?:сум|so‘m)/u, `${url}: the wave quotes no amounts in sums`);
    const rendered = [visible, ...(a.sources ?? []).flatMap((s) => [s.title, s.note ?? ''])].join('\n');
    assert.doesNotMatch(rendered, /официальн|official|rasmiy/i, `${url}: the brief bans «official / официальный / rasmiy» outright, sources included`);
    assert.doesNotMatch(visible, /гарантир\w* (?:результат|заявк|продаж|оплат)|natija kafolat/i, `${url}: no guarantees`);
    if (url.startsWith('/uz/')) assert.deepEqual(visible.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], [], `${url}: ASCII or modifier apostrophes`);
  }
});

test('TikTok: the answer is «not available from Uzbekistan» with the lists, the budget minimums and the policy conflict', () => {
  for (const url of ['/ru/blog/reklama-v-tiktok-iz-uzbekistana/', '/uz/blog/tiktok-reklama-ozbekistonda/']) {
    const a = read(url);
    const v = visibleOf(a);
    assert.match(a.faq![0].a, /нет|yo‘q/, `${url}: the first FAQ answer says no`);
    assert.match(v, /59/);
    assert.match(v, /Business Center/);
    assert.match(v, /50 (?:доллар|dollar)/);
    assert.match(v, /20 (?:доллар|dollar)/);
    assert.match(v, /VPN/, `${url}: the policy page that names Uzbekistan`);
  }
});

test('Yandex Direct: sums to TashGisTechnologies with 12 % VAT, UzCard/Humo for individuals, three ad languages', () => {
  for (const v of both('/ru/blog/yandeks-direkt-v-uzbekistane/', '/uz/blog/yandex-direct-ozbekistonda/')) {
    assert.match(v, /TashGisTechnologies/);
    assert.match(v, /UzCard/);
    assert.match(v, /Humo/);
    assert.match(v, /12 %/);
    assert.match(v, /узбекском, русском или английском|o‘zbek, rus yoki ingliz/);
  }
});

test('YouTube: formats with what they charge for, Visa/Mastercard, and no Uzbek-language ads', () => {
  for (const v of both('/ru/blog/reklama-na-youtube-v-uzbekistane/', '/uz/blog/youtube-reklama/')) {
    assert.match(v, /5 (?:секунд|soniya)/);
    assert.match(v, /30 (?:секунд|soniya)/);
    assert.match(v, /Bumper/);
    assert.match(v, /Shorts/);
    assert.match(v, /Visa/);
    assert.match(v, /Mastercard/);
    assert.match(v, /Узбекского языка нет|o‘zbek tili yo‘q/i);
  }
});

test('paying for ads: one table for Meta, Google, Yandex, Telegram and TikTok', () => {
  for (const v of both('/ru/blog/sposoby-oplaty-reklamy-iz-uzbekistana/', '/uz/blog/reklama-uchun-tolov/')) {
    for (const name of ['Meta', 'Google Ads', 'Yandex|Яндекс', 'Telegram Ads', 'TikTok', 'UzCard', 'Toncoin']) {
      assert.match(v, new RegExp(name), `payment guide names ${name}`);
    }
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

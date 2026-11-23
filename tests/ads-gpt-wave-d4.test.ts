// Advertising wave D4 (docs/seo/research/2026-11-23-ads-cluster-2; owner request 23.11.2026): ad banners, posting and
// promoting a listing on OLX.uz, the marketer profession, the sales funnel, «reklama agentligi» and a «reklama nima»
// section in the Uzbek ad-types guide — built on lex.uz and the platforms' own help pages, checked on 2026-11-23.
//
// Run: node --import tsx --test tests/ads-gpt-wave-d4.test.ts
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

const RU_HUB = '/ru/internet-reklama-tashkent/';
const UZ_HUB = '/uz/internet-reklama-toshkent/';
// url -> [paired url or null, commercial counterpart, manifest pair id]
const WAVE: Record<string, [string | null, string, string]> = {
  '/ru/blog/reklamnyy-banner/': ['/uz/blog/reklama-banner/', RU_HUB, 'W20261123-69-ru-internet-ads-hub-vs-ad-banner-guide'],
  '/uz/blog/reklama-banner/': ['/ru/blog/reklamnyy-banner/', UZ_HUB, 'W20261123-70-uz-internet-ads-hub-vs-ad-banner-guide'],
  '/ru/blog/prodvizhenie-obyavleniy-na-olx/': ['/uz/blog/olx-elon-berish/', RU_HUB, 'W20261123-71-ru-internet-ads-hub-vs-olx-listing-guide'],
  '/uz/blog/olx-elon-berish/': ['/ru/blog/prodvizhenie-obyavleniy-na-olx/', UZ_HUB, 'W20261123-72-uz-internet-ads-hub-vs-olx-listing-guide'],
  '/ru/blog/marketolog-kto-eto/': ['/uz/blog/marketolog-kim/', '/ru/digital-marketing-tashkent/', 'W20261123-73-ru-digital-marketing-vs-marketer-career'],
  '/uz/blog/marketolog-kim/': ['/ru/blog/marketolog-kto-eto/', UZ_HUB, 'W20261123-74-uz-internet-ads-hub-vs-marketer-career'],
  '/ru/blog/voronka-prodazh/': ['/uz/blog/sotuv-voronkasi/', RU_HUB, 'W20261123-75-ru-internet-ads-hub-vs-sales-funnel-guide'],
  '/uz/blog/sotuv-voronkasi/': ['/ru/blog/voronka-prodazh/', UZ_HUB, 'W20261123-76-uz-internet-ads-hub-vs-sales-funnel-guide'],
  '/uz/blog/reklama-agentligi/': [null, UZ_HUB, 'W20261123-77-uz-internet-ads-hub-vs-ad-agency-guide'],
};
const PRIMARY =
  /^https:\/\/(?:lex\.uz\/|help\.olx\.uz\/|www\.facebook\.com\/business\/|(?:promote|ads)\.telegram\.org\/|yandex\.(?:ru|com)\/support\/|support\.google\.com\/|skillshop\.withgoogle\.com\/|www\.facebookblueprint\.com\/|(?:wsr|us-voucherstore)\.pearsonvue\.com\/|ads\.tiktok\.com\/|(?:b2b\.)?yandex\.ru\/adv\/)/;

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visibleOf = (a: BlogArticle) => [a.title, a.description, a.h1, ...texts(a.body), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');
const both = (ru: string, uz: string) => [visibleOf(read(ru)), visibleOf(read(uz))];

test('every wave-D4 article is published, opens with its answer and has FAQ, primary sources and a date', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    assert.equal(a.url, url);
    assert.equal(a.status, 'published', url);
    assert.deepEqual(a.body[0], { type: 'p', text: a.intro }, `${url}: body[0] must repeat the intro (the template does not render intro)`);
    assert.ok((a.faq ?? []).length >= 5, `${url}: FAQ`);
    assert.ok((a.sources ?? []).length >= 3, `${url}: sources`);
    const urls = (a.sources ?? []).map((s) => s.url);
    assert.equal(new Set(urls).size, urls.length, `${url}: duplicate source URL`);
    for (const s of a.sources ?? []) {
      assert.match(s.note ?? '', /2026-11-23/, `${url}: source note without the check date: ${s.url}`);
      assert.match(s.url, PRIMARY, `${url}: every source is a primary page (platform, learning platform or lex.uz): ${s.url}`);
    }
    assert.ok(a.title.length >= 45 && a.title.length <= 65, `${url}: title length ${a.title.length}`);
    assert.ok(a.description.length >= 120 && a.description.length <= 160, `${url}: description length ${a.description.length}`);
    assert.match(a.title, /\| GPTBot\.uz$/, `${url}: brand suffix`);
  }
});

test('hreflang pairs are symmetric and the unpaired guide declares only itself', () => {
  for (const [url, [pair]] of Object.entries(WAVE)) {
    const a = read(url);
    if (pair === null) {
      assert.equal(a.hreflangUz, url, url);
      assert.equal(a.hreflangRu, undefined, `${url}: no Russian counterpart`);
      continue;
    }
    const b = read(pair);
    assert.equal(a.hreflangRu, b.hreflangRu, url);
    assert.equal(a.hreflangUz, b.hreflangUz, url);
    assert.equal(url.startsWith('/ru/') ? a.hreflangRu : a.hreflangUz, url);
  }
});

test('no prices, no «official», no guarantees, correct Uzbek apostrophes', () => {
  for (const url of [...Object.keys(WAVE), '/uz/blog/reklama-turlari/']) {
    const a = read(url);
    const visible = visibleOf(a);
    if (url in WAVE) assert.doesNotMatch(visible, /\d[\d\s]* (?:сум|so‘m)|\$\s?\d|\d\s?\$/u, `${url}: the wave quotes no prices`);
    const rendered = [visible, ...(a.sources ?? []).flatMap((s) => [s.title, s.note ?? ''])].join('\n');
    assert.doesNotMatch(rendered, /официальн|official|rasmiy/i, `${url}: the brief bans «official / официальный / rasmiy» outright, sources included`);
    assert.doesNotMatch(visible, /гарантир\w* (?:результат|заявк|продаж|подписчик)|natija kafolat/i, `${url}: no guarantees`);
    if (url.startsWith('/uz/')) assert.deepEqual(visible.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], [], `${url}: ASCII or modifier apostrophes`);
  }
});

test('banners: display sizes, the 40 % translation rule for outdoor ads and both ad networks', () => {
  for (const v of both('/ru/blog/reklamnyy-banner/', '/uz/blog/reklama-banner/')) {
    for (const re of [/300 ?× ?250/, /728 ?× ?90/, /40 (?:%|foiz)/, /Yandex|Яндекс/, /Google/, /Meta/]) assert.match(v, re);
  }
});

test('OLX: 30-day listings, bump vs TOP vs VIP, VIP on desktop only, price shown at checkout', () => {
  for (const v of both('/ru/blog/prodvizhenie-obyavleniy-na-olx/', '/uz/blog/olx-elon-berish/')) {
    for (const re of [/30 (?:дней|kun)/, /ТОП|TOP/, /VIP/, /25/, /десктоп|desktop/, /у\.е\./]) assert.match(v, re);
  }
});

test('marketer: role differences and free certifications', () => {
  for (const v of both('/ru/blog/marketolog-kto-eto/', '/uz/blog/marketolog-kim/')) {
    for (const re of [/таргетолог|targetolog/i, /SMM/, /Skillshop/, /Blueprint/, /Яндекс|Yandex/]) assert.match(v, re);
  }
});

test('sales funnel: stages, the worked conversion example and analytics reports', () => {
  for (const v of both('/ru/blog/voronka-prodazh/', '/uz/blog/sotuv-voronkasi/')) {
    for (const re of [/15 (?:%|foiz)/, /0,6 (?:%|foiz)/, /Meta/, /Google Analytics 4/, /Метрик|Metrika/]) assert.match(v, re);
  }
});

test('ad agency: roles under ZRU-776, document duties and account access', () => {
  const v = visibleOf(read('/uz/blog/reklama-agentligi/'));
  for (const re of [/reklama beruvchi/, /reklama tayyorlovchi/, /reklama tarqatuvchi/, /uch yil/, /yetti kun/, /administrator/, /Meta/]) assert.match(v, re);
});

test('«reklama nima» lives in the ad-types guide and the hub fences it', () => {
  const a = read('/uz/blog/reklama-turlari/');
  assert.ok(a.keywords?.includes('reklama nima'), 'keyword');
  assert.equal(a.faq?.[0]?.q, 'Reklama nima?');
  assert.ok(a.body.some((b) => b.type === 'h2' && 'text' in b && /Reklama nima/.test(String(b.text))), 'section');
  assert.ok((a.sources ?? []).some((s) => s.url.startsWith('https://lex.uz/')), 'law source');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/seo/intent-manifest.json'), 'utf8')) as {
    pairs: Array<{ id: string; commercial: { url: string; mustNotTarget: string[] } }>;
  };
  const p14 = manifest.pairs.find((p) => p.id === 'W20261123-14-uz-internet-ads-hub-vs-ad-types');
  assert.ok(p14?.commercial.mustNotTarget.includes('reklama nima'), 'hub fence');
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

test('new slugs do not push existing cards out of the money pages’ first three related articles', () => {
  const firstThree: Record<string, string> = {
    [RU_HUB]: 'kak-proverit-podryadchika-reklama-sayt-uzbekistan',
    [UZ_HUB]: 'internet-reklama-narxi-ozbekiston-2026',
    '/ru/digital-marketing-tashkent/': 'marketingovye-terminy-slovar',
  };
  for (const [url, [, money]] of Object.entries(WAVE)) {
    const slug = url.split('/')[3];
    assert.ok(slug > firstThree[money], `${url}: «${slug}» sorts before the third card «${firstThree[money]}» of ${money}`);
  }
});

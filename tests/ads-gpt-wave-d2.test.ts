// Advertising wave D2 (docs/seo/research/2026-11-23-ads-cluster-2; owner request 23.11.2026; D-T1 approved): promoting your
// own Telegram channel, becoming a targetologist, SMS campaigns and outdoor advertising in Tashkent — built on Telegram Ads
// pages, the learning platforms' own pages and lex.uz, checked on 2026-11-23.
//
// Run: node --import tsx --test tests/ads-gpt-wave-d2.test.ts
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
  '/ru/blog/telegram-kanal-prodvizhenie/': ['/uz/blog/telegram-kanalni-rivojlantirish/', '/ru/telegram-ads-uzbekistan/', 'W20261123-55-ru-telegram-ads-service-vs-channel-promotion-guide'],
  '/uz/blog/telegram-kanalni-rivojlantirish/': ['/ru/blog/telegram-kanal-prodvizhenie/', '/uz/telegram-reklama/', 'W20261123-56-uz-telegram-service-vs-channel-growth-guide'],
  '/ru/blog/kak-stat-targetologom/': ['/uz/blog/targetolog-bolish/', '/ru/internet-reklama-tashkent/', 'W20261123-57-ru-internet-ads-hub-vs-targetologist-career-guide'],
  '/uz/blog/targetolog-bolish/': ['/ru/blog/kak-stat-targetologom/', '/uz/instagram-target-yoqish/', 'W20261123-58-uz-target-service-vs-targetologist-career-guide'],
  '/ru/blog/sms-rassylka-v-uzbekistane/': ['/uz/blog/sms-reklama/', '/ru/internet-reklama-tashkent/', 'W20261123-59-ru-internet-ads-hub-vs-sms-campaign-guide'],
  '/uz/blog/sms-reklama/': ['/ru/blog/sms-rassylka-v-uzbekistane/', '/uz/internet-reklama-toshkent/', 'W20261123-60-uz-internet-ads-hub-vs-sms-guide'],
  '/ru/blog/naruzhnaya-reklama-v-tashkente/': ['/uz/blog/tashqi-reklama-toshkentda/', '/ru/internet-reklama-tashkent/', 'W20261123-61-ru-internet-ads-hub-vs-outdoor-ads-guide'],
  '/uz/blog/tashqi-reklama-toshkentda/': ['/ru/blog/naruzhnaya-reklama-v-tashkente/', '/uz/internet-reklama-toshkent/', 'W20261123-62-uz-internet-ads-hub-vs-outdoor-ads-guide'],
};
const PRIMARY = /^https:\/\/(?:promote\.telegram\.org\/|lex\.uz\/|www\.facebookblueprint\.com\/|wsr\.pearsonvue\.com\/|us-voucherstore\.pearsonvue\.com\/|support\.google\.com\/(?:skillshop|google-ads)\/|ads\.tiktok\.com\/business\/|(?:b2b\.)?yandex\.ru\/adv\/expert\/|www\.facebook\.com\/business\/help\/)/;
// GPTBot.uz's own published targeting prices (money pages; tests/advertising-seo-content.test.ts) — only in the career guide.
const OWN_PRICES = ['1 990 000', '1 490 000'];

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visibleOf = (a: BlogArticle) => [a.title, a.description, a.h1, ...texts(a.body), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');
const both = (ru: string, uz: string) => [visibleOf(read(ru)), visibleOf(read(uz))];

test('every wave-D2 article is published, opens with its answer and has FAQ, primary sources and a date', () => {
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

test('only GPTBot.uz prices in sums, no «official», no guarantees, correct Uzbek apostrophes', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    const visible = visibleOf(a);
    const allowed = /targetolog/.test(url) ? OWN_PRICES : [];
    for (const m of visible.matchAll(/(\d{1,3}(?: \d{3})*) (?:сум|so‘m)/gu)) assert.ok(allowed.includes(m[1]), `${url}: unexpected amount «${m[0]}»`);
    const rendered = [visible, ...(a.sources ?? []).flatMap((s) => [s.title, s.note ?? ''])].join('\n');
    assert.doesNotMatch(rendered, /официальн|official|rasmiy/i, `${url}: the brief bans «official / официальный / rasmiy» outright, sources included`);
    assert.doesNotMatch(visible, /гарантир\w* (?:результат|заявк|продаж|подписчик)|natija kafolat/i, `${url}: no guarantees`);
    if (url.startsWith('/uz/')) assert.deepEqual(visible.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], [], `${url}: ASCII or modifier apostrophes`);
  }
});

test('Telegram channel promotion: Telegram Ads rules for a promoted channel', () => {
  for (const v of both('/ru/blog/telegram-kanal-prodvizhenie/', '/uz/blog/telegram-kanalni-rivojlantirish/')) {
    assert.match(v, /1 000/);
    assert.match(v, /0,1 Toncoin/);
    assert.match(v, /160/);
  }
});

test('career guide: free training, exam prices with the store named, certificate validity', () => {
  for (const v of both('/ru/blog/kak-stat-targetologom/', '/uz/blog/targetolog-bolish/')) {
    for (const name of ['Meta Blueprint', 'Google Skillshop', 'TikTok Academy', 'Pearson VUE', '99', '150', '80 %']) assert.match(v, new RegExp(name), `career guide names ${name}`);
  }
  assert.match(visibleOf(read('/ru/blog/kak-stat-targetologom/')), /не нашли/, 'no invented salary figures');
});

test('SMS: prior consent under Art. 30 and the personal-data law', () => {
  for (const v of both('/ru/blog/sms-rassylka-v-uzbekistane/', '/uz/blog/sms-reklama/')) {
    assert.match(v, /30/);
    assert.match(v, /согласи|rozilik/);
    assert.match(v, /ЗРУ-547|O‘RQ-547|персональн|shaxsga doir/);
  }
});

test('outdoor ads: passport from the hokimiyat, auctions, QR code, the sign exemption, no foreign-currency prices', () => {
  for (const v of both('/ru/blog/naruzhnaya-reklama-v-tashkente/', '/uz/blog/tashqi-reklama-toshkentda/')) {
    for (const re of [/QR/, /1\/3/, /10 (?:лет|yil)/, /5 (?:лет|yil)/, /428/, /16/]) assert.match(v, re);
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

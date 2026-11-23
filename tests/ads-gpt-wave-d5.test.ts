// Advertising wave D5 (docs/seo/research/2026-11-23-ads-cluster-2; owner request 23.11.2026): nakrutka (buying followers),
// organic Instagram growth, messenger mailings, a Russian Google Ads setup guide and free advertising — built on the platforms'
// own help pages and lex.uz, checked on 2026-11-23.
//
// Run: node --import tsx --test tests/ads-gpt-wave-d5.test.ts
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
const RU_SMM = '/ru/smm-prodvizhenie-tashkent/';
const RU_TGBOT = '/ru/telegram-bot-dlya-biznesa/';
const RU_CTX = '/ru/kontekstnaya-reklama-tashkent/';
// url -> [paired url or null, commercial counterpart, manifest pair id]
const WAVE: Record<string, [string | null, string, string]> = {
  '/ru/blog/nakrutka-podpischikov/': ['/uz/blog/nakrutka-instagram-telegram/', RU_SMM, 'W20261123-78-ru-smm-service-vs-nakrutka-guide'],
  '/uz/blog/nakrutka-instagram-telegram/': ['/ru/blog/nakrutka-podpischikov/', UZ_HUB, 'W20261123-79-uz-internet-ads-hub-vs-nakrutka-guide'],
  '/ru/blog/kak-nabrat-podpischikov-v-instagram/': ['/uz/blog/obunachi-kopaytirish-instagram/', RU_SMM, 'W20261123-80-ru-smm-service-vs-instagram-growth-guide'],
  '/uz/blog/obunachi-kopaytirish-instagram/': ['/ru/blog/kak-nabrat-podpischikov-v-instagram/', UZ_HUB, 'W20261123-81-uz-internet-ads-hub-vs-instagram-growth-guide'],
  '/ru/blog/telegram-whatsapp-viber-rassylka/': [null, RU_TGBOT, 'W20261123-82-ru-telegram-bot-service-vs-messenger-mailing-guide'],
  '/ru/blog/reklama-v-google-kak-nastroit/': [null, RU_CTX, 'W20261123-83-ru-contextual-service-vs-google-ads-setup-guide'],
  '/ru/blog/sposoby-besplatnoy-reklamy/': ['/uz/blog/reklama-bepul-usullari/', RU_HUB, 'W20261123-84-ru-internet-ads-hub-vs-free-advertising-guide'],
  '/uz/blog/reklama-bepul-usullari/': ['/ru/blog/sposoby-besplatnoy-reklamy/', UZ_HUB, 'W20261123-85-uz-internet-ads-hub-vs-free-advertising-guide'],
};
const PRIMARY =
  /^https:\/\/(?:lex\.uz\/|help\.olx\.uz\/|www\.facebook\.com\/help\/instagram\/|help\.instagram\.com\/|transparency\.meta\.com\/|about\.instagram\.com\/|creators\.instagram\.com\/|telegram\.org\/|core\.telegram\.org\/|ads\.telegram\.org\/|whatsappbusiness\.com\/|developers\.facebook\.com\/|www\.forbusiness\.viber\.com\/|developers\.viber\.com\/|support\.google\.com\/|yandex\.uz\/support\/|help\.2gis\.ru\/|reklama\.2gis\.uz\/)/;

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visibleOf = (a: BlogArticle) => [a.title, a.description, a.h1, ...texts(a.body), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');

test('every wave-D5 article is published, opens with its answer and has FAQ, primary sources and a date', () => {
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
      assert.match(s.url, PRIMARY, `${url}: every source is a primary page (platform help or lex.uz): ${s.url}`);
    }
    assert.ok(a.title.length >= 45 && a.title.length <= 65, `${url}: title length ${a.title.length}`);
    assert.ok(a.description.length >= 120 && a.description.length <= 160, `${url}: description length ${a.description.length}`);
    assert.match(a.title, /\| GPTBot\.uz$/, `${url}: brand suffix`);
  }
});

test('hreflang pairs are symmetric and the unpaired Russian guides declare only themselves', () => {
  for (const [url, [pair]] of Object.entries(WAVE)) {
    const a = read(url);
    if (pair === null) {
      assert.equal(a.hreflangRu, url, url);
      assert.equal(a.hreflangUz, undefined, `${url}: no Uzbek counterpart`);
      continue;
    }
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

test('nakrutka: the Meta and Telegram rules, the 2018 clean-up and Account Status', () => {
  for (const url of ['/ru/blog/nakrutka-podpischikov/', '/uz/blog/nakrutka-instagram-telegram/']) {
    const v = visibleOf(read(url));
    for (const re of [/Meta/, /Telegram Ads/, /2018/, /Статус аккаунта|Akkaunt holati/, /спам|spam/i]) assert.match(v, re, url);
  }
});

test('Instagram growth: Reels format and length, collab, channel and trial-reel thresholds', () => {
  for (const url of ['/ru/blog/kak-nabrat-podpischikov-v-instagram/', '/uz/blog/obunachi-kopaytirish-instagram/']) {
    const v = visibleOf(read(url));
    for (const re of [/9:16/, /3 (?:минут|daqiqa)/, /5 (?:соавторов|tagacha hammuallif)/, /1 000/, /200/]) assert.match(v, re, url);
  }
});

test('messenger mailings: Telegram limits, the WhatsApp window, Viber partners and Art. 30', () => {
  const v = visibleOf(read('/ru/blog/telegram-whatsapp-viber-rassylka/'));
  for (const re of [/30 сообщений в секунду/, /1 000 в секунду/, /0,1 Stars/, /24-часов/, /ст\. 30/, /Rakuten Viber/]) assert.match(v, re);
});

test('Google Ads setup: budget caps, keyword count, match types and Smart campaigns', () => {
  const v = visibleOf(read('/ru/blog/reklama-v-google-kak-nastroit/'));
  for (const re of [/30,4/, /2 раз/, /5 до 20/, /кавычках/, /Demand Gen/, /15 минут/]) assert.match(v, re);
});

test('free advertising: maps, OLX, Telegram and Instagram with the paid limits named', () => {
  for (const url of ['/ru/blog/sposoby-besplatnoy-reklamy/', '/uz/blog/reklama-bepul-usullari/']) {
    const v = visibleOf(read(url));
    for (const re of [/Google/, /Яндекс|Yandex/, /2ГИС|2GIS/, /OLX/, /Telegram/, /Instagram/, /200/]) assert.match(v, re, url);
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

test('new slugs do not push existing cards out of the money pages’ first three related articles', () => {
  const thirdCard: Record<string, string> = {
    [RU_HUB]: 'kak-proverit-podryadchika-reklama-sayt-uzbekistan',
    [UZ_HUB]: 'internet-reklama-narxi-ozbekiston-2026',
    [RU_SMM]: 'dogovor-na-okazanie-smm-uslug-v-uzbekistane',
    [RU_TGBOT]: 'telegram-bot-dlya-biznesa',
    [RU_CTX]: 'reklama-stomatologii-i-kliniki-tashkent',
  };
  for (const [url, [, money]] of Object.entries(WAVE)) {
    const slug = url.split('/')[3];
    assert.ok(slug > thirdCard[money], `${url}: «${slug}» sorts before the third card «${thirdCard[money]}» of ${money}`);
  }
});

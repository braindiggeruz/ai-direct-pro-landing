// Advertising GPT wave B (owner decision D-ADS-GPT-20261123): nine articles that answer
// the questions people ask ChatGPT about targeting and advertising in Uzbekistan
// (docs/seo/research/2026-11-23-ads-cluster/ROADMAP.md).
//
// Run: node --import tsx --test tests/ads-gpt-wave-b.test.ts
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
  '/ru/blog/kak-vybrat-targetologa-v-tashkente/': ['/uz/blog/toshkentda-targetolog-tanlash/', '/ru/targetirovannaya-reklama-tashkent/', 'W20261123-09-ru-target-service-vs-targetologist-checklist'],
  '/uz/blog/toshkentda-targetolog-tanlash/': ['/ru/blog/kak-vybrat-targetologa-v-tashkente/', '/uz/instagram-target-yoqish/', 'W20261123-10-uz-target-service-vs-targetologist-checklist'],
  '/ru/blog/skolko-stoit-reklama-v-telegram-kanalah/': ['/uz/blog/telegram-kanalga-reklama-berish/', '/ru/telegram-ads-uzbekistan/', 'W20261123-11-ru-telegram-ads-service-vs-channel-prices'],
  '/uz/blog/telegram-kanalga-reklama-berish/': ['/ru/blog/skolko-stoit-reklama-v-telegram-kanalah/', '/uz/telegram-reklama/', 'W20261123-12-uz-telegram-service-vs-channel-guide'],
  '/ru/blog/ploshchadki-dlya-reklamy-v-uzbekistane/': ['/uz/blog/reklama-turlari/', '/ru/internet-reklama-tashkent/', 'W20261123-13-ru-internet-ads-hub-vs-platform-comparison'],
  '/uz/blog/reklama-turlari/': ['/ru/blog/ploshchadki-dlya-reklamy-v-uzbekistane/', '/uz/internet-reklama-toshkent/', 'W20261123-14-uz-internet-ads-hub-vs-ad-types'],
  '/ru/blog/reklamnye-kreativy-dlya-instagram-i-telegram/': ['/uz/blog/reklama-kreativlari/', '/ru/targetirovannaya-reklama-tashkent/', 'W20261123-15-ru-target-service-vs-ad-creatives'],
  '/uz/blog/reklama-kreativlari/': ['/ru/blog/reklamnye-kreativy-dlya-instagram-i-telegram/', '/uz/gpt-telegram-instagram-ideya/', 'W20261123-16-uz-ad-copy-tool-vs-ad-creatives'],
  '/ru/blog/zapusk-reklamy-v-instagram-iz-uzbekistana/': ['', '/ru/targetirovannaya-reklama-tashkent/', 'W20261123-17-ru-target-service-vs-instagram-launch-guide'],
};

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visibleOf = (a: BlogArticle) => [a.title, a.description, a.h1, ...texts(a.body), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');

// The only UZS amounts an article may print: GPTBot.uz's published targeting and
// context prices (money pages, tests/advertising-seo-content.test.ts) and the
// Yandex Direct minimums quoted from direct.yandex.uz with the check date.
const ALLOWED_UZS = new Set(['1 990 000', '1 490 000', '100 000', '1 300 000', '100']);

test('every wave-B article is published, opens with its answer and has FAQ, sources and a date', () => {
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
      assert.equal(url.startsWith('/ru/') ? a.hreflangRu : a.hreflangUz, url);
      assert.equal((url.startsWith('/ru/') ? a.hreflangUz : a.hreflangRu) ?? '', '');
      continue;
    }
    const b = read(pair);
    assert.equal(a.hreflangRu, b.hreflangRu, url);
    assert.equal(a.hreflangUz, b.hreflangUz, url);
  }
});

test('no invented prices, no «official», correct Uzbek apostrophes', () => {
  for (const url of Object.keys(WAVE)) {
    const visible = visibleOf(read(url));
    for (const m of visible.matchAll(/(\d{1,3}(?: \d{3})*) (?:сум|so‘m)/gu)) {
      assert.ok(ALLOWED_UZS.has(m[1]), `${url}: unexpected UZS amount «${m[0]}»`);
    }
    assert.doesNotMatch(visible, /официальн|official|rasmiy/i, `${url}: the brief bans «official / официальный / rasmiy» outright`);
    assert.doesNotMatch(visible, /гарантир\w* (?:результат|заявк|продаж)|natija kafolat/i, `${url}: no guarantees`);
    if (url.startsWith('/uz/')) assert.deepEqual(visible.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], [], `${url}: ASCII or modifier apostrophes`);
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

test('at least two published articles link to each new URL', () => {
  const all: BlogArticle[] = [];
  for (const locale of ['ru', 'uz']) {
    const dir = path.join(ROOT, 'content', 'blog', locale);
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) all.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as BlogArticle);
  }
  for (const url of Object.keys(WAVE)) {
    const incoming = all.filter((a) => a.url !== url && a.status === 'published' && (a.internalLinks ?? []).some((l) => l.target === url));
    assert.ok(incoming.length >= 2, `${url}: ${incoming.length} incoming article links`);
  }
});

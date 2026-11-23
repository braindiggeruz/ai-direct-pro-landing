// Targeting wave T-B (docs/seo/research/2026-11-23-target-cluster/ROADMAP.md, items T1, T2, T3, T8; owner decision
// D-ADS-GPT-20261123): targeting in Instagram, audiences, the Meta Pixel and the Meta ad account — answers to the questions
// people ask ChatGPT about targeting, built on Meta's help pages checked on 2026-11-23.
//
// Run: node --import tsx --test tests/target-gpt-wave-tb.test.ts
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
  '/ru/blog/targeting-v-instagram/': ['', '/ru/targetirovannaya-reklama-tashkent/', 'W20261123-33-ru-target-service-vs-targeting-explainer'],
  '/ru/blog/tselevaya-auditoriya-dlya-targeta/': ['/uz/blog/targetda-auditoriya-sozlash/', '/ru/targetirovannaya-reklama-tashkent/', 'W20261123-34-ru-target-service-vs-audience-guide'],
  '/uz/blog/targetda-auditoriya-sozlash/': ['/ru/blog/tselevaya-auditoriya-dlya-targeta/', '/uz/instagram-target-yoqish/', 'W20261123-35-uz-target-service-vs-audience-guide'],
  '/ru/blog/piksel-meta-ustanovka-i-sobytiya/': ['/uz/blog/meta-pikseli-ornatish/', '/ru/performance-marketing-tashkent/', 'W20261123-36-ru-performance-service-vs-meta-pixel-guide'],
  '/uz/blog/meta-pikseli-ornatish/': ['/ru/blog/piksel-meta-ustanovka-i-sobytiya/', '/uz/internet-reklama-toshkent/', 'W20261123-37-uz-internet-ads-hub-vs-meta-pixel-guide'],
  '/ru/blog/reklamnyy-kabinet-meta/': ['', '/ru/targetirovannaya-reklama-tashkent/', 'W20261123-38-ru-target-service-vs-ad-account-guide'],
};

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visibleOf = (a: BlogArticle) => [a.title, a.description, a.h1, ...texts(a.body), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');

test('every wave-T-B article is published, opens with its answer and has FAQ, sources and a date', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    assert.equal(a.url, url);
    assert.equal(a.status, 'published', url);
    assert.deepEqual(a.body[0], { type: 'p', text: a.intro }, `${url}: body[0] must repeat the intro (the template does not render intro)`);
    assert.ok((a.faq ?? []).length >= 5, `${url}: FAQ`);
    assert.ok((a.sources ?? []).length >= 3, `${url}: sources`);
    for (const s of a.sources ?? []) assert.match(s.note ?? '', /2026-11-23/, `${url}: source note without the check date: ${s.url}`);
    assert.ok((a.sources ?? []).some((s) => s.url.startsWith('https://www.facebook.com/business/help/')), `${url}: a Meta help source`);
    assert.ok(a.title.length >= 45 && a.title.length <= 65, `${url}: title length ${a.title.length}`);
    assert.ok(a.description.length >= 120 && a.description.length <= 160, `${url}: description length ${a.description.length}`);
    assert.match(a.title, /\| GPTBot\.uz$/, `${url}: brand suffix`);
  }
});

test('hreflang pairs are symmetric and unpaired guides declare only themselves', () => {
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

test('no invented prices, no «official», no guarantees, correct Uzbek apostrophes', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    const visible = visibleOf(a);
    // Only GPTBot.uz's published targeting prices (money pages, tests/advertising-seo-content.test.ts) may appear.
    const allowed = url === '/ru/blog/targeting-v-instagram/' ? ['1 990 000', '1 490 000'] : [];
    for (const m of visible.matchAll(/(\d{1,3}(?: \d{3})*) (?:сум|so‘m)/gu)) assert.ok(allowed.includes(m[1]), `${url}: unexpected UZS amount «${m[0]}»`);
    const rendered = [visible, ...(a.sources ?? []).flatMap((s) => [s.title, s.note ?? ''])].join('\n');
    assert.doesNotMatch(rendered, /официальн|official|rasmiy/i, `${url}: the brief bans «official / официальный / rasmiy» outright, sources included`);
    assert.doesNotMatch(visible, /гарантир\w* (?:результат|заявк|продаж)|natija kafolat/i, `${url}: no guarantees`);
    if (url.startsWith('/uz/')) assert.deepEqual(visible.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], [], `${url}: ASCII or modifier apostrophes`);
  }
});

test('Meta facts use the current names and figures from the help pages', () => {
  const t1 = visibleOf(read('/ru/blog/targeting-v-instagram/'));
  assert.match(t1, /Advantage\+/);
  assert.match(t1, /Further limit the reach of your ads/);
  for (const url of ['/ru/blog/tselevaya-auditoriya-dlya-targeta/', '/uz/blog/targetda-auditoriya-sozlash/']) {
    const v = visibleOf(read(url));
    assert.match(v, /100/, `${url}: lookalike source minimum`);
    assert.match(v, /1 000–5 000/, `${url}: Meta's recommended source size`);
    assert.doesNotMatch(v, /1–10 %|1-10%/, `${url}: the 1–10% lookalike range is not on Meta's pages`);
    assert.doesNotMatch(v, /180 (?:дней|kun)/, `${url}: no unverified retention cap`);
  }
  for (const url of ['/ru/blog/piksel-meta-ustanovka-i-sobytiya/', '/uz/blog/meta-pikseli-ornatish/']) {
    const v = visibleOf(read(url));
    assert.match(v, /Meta Ads Data Advisor/, `${url}: the renamed Pixel Helper`);
    assert.match(v, /Conversions API/, url);
    assert.match(v, /8/, `${url}: the retired 8-event prioritisation`);
  }
  assert.match(visibleOf(read('/ru/blog/reklamnyy-kabinet-meta/')), /Business Support Home/);
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

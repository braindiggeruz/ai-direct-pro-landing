// Targeting wave T-C (docs/seo/research/2026-11-23-target-cluster/ROADMAP.md, items T4, T5, T6, T7; owner decision
// D-ADS-GPT-20261123): lead forms, rejected ads and restricted ad accounts, cost per lead and retargeting — answers to the
// questions people ask ChatGPT about running targeted ads, built on Meta's help pages checked on 2026-11-23.
//
// Run: node --import tsx --test tests/target-gpt-wave-tc.test.ts
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
  '/ru/blog/zayavki-iz-lid-formy-instagram/': ['/uz/blog/lid-forma-instagram/', '/ru/targetirovannaya-reklama-tashkent/', 'W20261123-39-ru-target-service-vs-lead-form-guide'],
  '/uz/blog/lid-forma-instagram/': ['/ru/blog/zayavki-iz-lid-formy-instagram/', '/uz/internet-reklama-toshkent/', 'W20261123-40-uz-internet-ads-hub-vs-lead-form-guide'],
  '/ru/blog/problemy-s-reklamnym-kabinetom-meta/': ['/uz/blog/reklama-akkaunti-bloklandi/', '/ru/internet-reklama-tashkent/', 'W20261123-41-ru-internet-ads-hub-vs-blocked-ad-account'],
  '/uz/blog/reklama-akkaunti-bloklandi/': ['/ru/blog/problemy-s-reklamnym-kabinetom-meta/', '/uz/internet-reklama-toshkent/', 'W20261123-42-uz-internet-ads-hub-vs-blocked-ad-account'],
  '/ru/blog/tsena-zayavki-v-targete/': ['/uz/blog/targetda-ariza-narxini-pasaytirish/', '/ru/targetirovannaya-reklama-tashkent/', 'W20261123-43-ru-target-service-vs-cost-per-lead-guide'],
  '/uz/blog/targetda-ariza-narxini-pasaytirish/': ['/ru/blog/tsena-zayavki-v-targete/', '/uz/instagram-target-yoqish/', 'W20261123-44-uz-target-service-vs-cost-per-lead-guide'],
  '/ru/blog/retargeting-v-instagram-i-facebook/': ['/uz/blog/retargeting-nima/', '/ru/targetirovannaya-reklama-tashkent/', 'W20261123-45-ru-target-service-vs-retargeting-guide'],
  '/uz/blog/retargeting-nima/': ['/ru/blog/retargeting-v-instagram-i-facebook/', '/uz/internet-reklama-toshkent/', 'W20261123-46-uz-internet-ads-hub-vs-retargeting-guide'],
};

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visibleOf = (a: BlogArticle) => [a.title, a.description, a.h1, ...texts(a.body), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');
const both = (ru: string, uz: string) => [visibleOf(read(ru)), visibleOf(read(uz))];

test('every wave-T-C article is published, opens with its answer and has FAQ, sources and a date', () => {
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

test('hreflang pairs are symmetric', () => {
  for (const [url, [pair]] of Object.entries(WAVE)) {
    const a = read(url);
    const b = read(pair);
    assert.equal(a.hreflangRu, b.hreflangRu, url);
    assert.equal(a.hreflangUz, b.hreflangUz, url);
    assert.equal(url.startsWith('/ru/') ? a.hreflangRu : a.hreflangUz, url);
  }
});

test('no prices or benchmarks, no «official», no guarantees, correct Uzbek apostrophes', () => {
  for (const url of Object.keys(WAVE)) {
    const a = read(url);
    const visible = visibleOf(a);
    // The wave publishes no prices at all: cost per lead is explained with arbitrary numbers, never a market benchmark.
    assert.doesNotMatch(visible, /\d[\d\s]* (?:сум|so‘m)|\$\s?\d|\d\s?\$|USD/u, `${url}: no amounts in money`);
    const rendered = [visible, ...(a.sources ?? []).flatMap((s) => [s.title, s.note ?? ''])].join('\n');
    assert.doesNotMatch(rendered, /официальн|official|rasmiy/i, `${url}: the brief bans «official / официальный / rasmiy» outright, sources included`);
    assert.doesNotMatch(visible, /гарантир\w* (?:результат|заявк|продаж|разблокир)|natija kafolat/i, `${url}: no guarantees`);
    if (url.startsWith('/uz/')) assert.deepEqual(visible.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], [], `${url}: ASCII or modifier apostrophes`);
  }
});

test('lead forms: Meta form types, the 90-day download window, CRM routes and consent under ZRU-547', () => {
  for (const v of both('/ru/blog/zayavki-iz-lid-formy-instagram/', '/uz/blog/lid-forma-instagram/')) {
    assert.match(v, /Higher intent/);
    assert.match(v, /Rich creative/);
    assert.match(v, /90/);
    assert.match(v, /10 000/);
    assert.match(v, /Zapier/);
    assert.match(v, /Webhooks/);
    assert.match(v, /ЗРУ-547|O‘RQ-547/);
  }
});

test('blocked accounts: Business Support Home, 48-hour reviews, the 6-month limit and the gambling ban in Art. 46', () => {
  for (const v of both('/ru/blog/problemy-s-reklamnym-kabinetom-meta/', '/uz/blog/reklama-akkaunti-bloklandi/')) {
    assert.match(v, /Business Support Home/);
    assert.match(v, /Request review/);
    assert.match(v, /24/);
    assert.match(v, /48/);
    assert.match(v, /6 (?:месяцев|oy)/);
    assert.match(v, /ст\. 46|46-modda/);
  }
});

test('cost per lead: the formula, the ~50-result learning phase, Learning limited and the 500-impression diagnostics floor', () => {
  for (const v of both('/ru/blog/tsena-zayavki-v-targete/', '/uz/blog/targetda-ariza-narxini-pasaytirish/')) {
    assert.match(v, /CPC = CPM ÷ \(1 000 × CTR\)/);
    assert.match(v, /50/);
    assert.match(v, /Learning limited/);
    assert.match(v, /500/);
    assert.match(v, /1–2/, 'Meta: frequency may average 1 to 2 per ad set');
  }
});

test('retargeting: current video options, the 365-day Instagram cap, exclusions and Advantage+ audience as a suggestion', () => {
  for (const v of both('/ru/blog/retargeting-v-instagram-i-facebook/', '/uz/blog/retargeting-nima/')) {
    assert.match(v, /3 (?:секунд|soniya)/);
    assert.match(v, /10 (?:секунд|soniya)/);
    assert.match(v, /200/);
    assert.match(v, /365/);
    assert.match(v, /500/, 'up to 500 custom audiences per ad account');
    assert.match(v, /exclusion-only/);
    assert.match(v, /Further limit the reach of your ads/);
    assert.match(v, /Use as a suggestion/);
    assert.match(v, /1 000–5 000/);
    // Meta's developer docs give both 180 and 365 days for website audiences; the article names no website cap.
    assert.doesNotMatch(v, /180 (?:дней|kun)/);
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

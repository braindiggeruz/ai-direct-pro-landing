// The presentation cluster of AI-visibility wave 2a (2026-11-23): four uz/ru
// article pairs and the standalone Russian guide /ru/blog/kak-sdelat-prezentatsiyu/.
//
// Run: node --import tsx --test tests/presentation-cluster.test.ts
//
// Every Studio figure the articles print is checked against the sources of
// truth (STUDIO_FACTS from functions/lib/studio/plans.ts and the published
// offer), so a plan change cannot leave a stale price or limit in these texts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { BlogArticle } from '../src/shared/types';
import { STUDIO_FACTS } from '../scripts/product-facts';
import { enPages } from '../scripts/en-pages';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['/uz/blog/himoya-uchun-taqdimot/', '/ru/blog/prezentatsiya-dlya-zashchity/'],
  ['/uz/blog/biznes-reja-taqdimoti/', '/ru/blog/prezentatsiya-biznes-plana/'],
  ['/uz/blog/slayd-dizayni-qoidalari/', '/ru/blog/pravila-oformleniya-slaydov/'],
  ['/uz/blog/ai-taqdimot-vositalari/', '/ru/blog/prezentatsiya-s-ii-besplatno/'],
];
const RU_HUB = '/ru/blog/kak-sdelat-prezentatsiyu/';
const COMPARISONS = ['/uz/blog/ai-taqdimot-vositalari/', '/ru/blog/prezentatsiya-s-ii-besplatno/'];
const CLUSTER = [...PAIRS.flat(), RU_HUB];

const articles = new Map<string, BlogArticle>();
for (const locale of ['ru', 'uz']) {
  const dir = path.join(ROOT, 'content/blog', locale);
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as BlogArticle;
    articles.set(doc.url, doc);
  }
}
const article = (url: string): BlogArticle => {
  const doc = articles.get(url);
  assert.ok(doc, `${url}: content file`);
  return doc;
};

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visible = (doc: BlogArticle): string => [
  doc.title, doc.description, doc.h1, doc.intro ?? '',
  ...texts(doc.body), ...(doc.faq ?? []).flatMap((f) => [f.q, f.a]),
].join('\n');

const group = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const offer = fs.readFileSync(path.join(ROOT, 'content/pages/ru/oferta.json'), 'utf8');
const stated = (re: RegExp): number[] => {
  const m = re.exec(offer);
  assert.ok(m, `the offer states ${re}`);
  return m.slice(1).map(Number);
};
const [freeSlides, freeImages] = stated(/Бесплатный пример: 1 презентация до (\d+) слайдов и до (\d+) изображений/u);
const [fullSlides, fullImages] = stated(/Платная полная презентация — до (\d+) слайдов, до (\d+) изображений/u);
const KUNLIK = group(STUDIO_FACTS.kunlik.amountTiyin / 100);
const OYLIK = group(STUDIO_FACTS.oylik.amountTiyin / 100);

test('nine published articles: four reciprocal uz/ru pairs and one standalone Russian guide', () => {
  for (const [uz, ru] of PAIRS) {
    const u = article(uz);
    const r = article(ru);
    for (const doc of [u, r]) {
      assert.equal(doc.status, 'published', doc.url);
      assert.equal(doc.robotsIndex, true, doc.url);
      assert.equal(doc.hreflangUz, uz, `${doc.url}: hreflangUz`);
      assert.equal(doc.hreflangRu, ru, `${doc.url}: hreflangRu`);
      assert.ok((doc.faq ?? []).length >= 4, `${doc.url}: FAQ`);
      assert.match(doc.intro ?? '', /\d/, `${doc.url}: the answer-first paragraph carries a number`);
      // prerender-blog.ts does not print `intro`; the answer is visible only as the first body paragraph (as scripts/apply-blog.ts builds it).
      assert.deepEqual(doc.body[0], { type: 'p', text: doc.intro }, `${doc.url}: the answer-first paragraph opens the body`);
    }
    assert.equal(u.locale, 'uz');
    assert.equal(r.locale, 'ru');
  }
  const hub = article(RU_HUB);
  assert.equal(hub.status, 'published');
  assert.equal(hub.hreflangRu, RU_HUB);
  assert.equal(hub.hreflangUz ?? '', '', 'the Russian guide is not paired: /uz/blog/slayd-tayyorlash/ keeps its single-language set');
});

test('every Studio price and limit in the cluster equals the sources of truth', () => {
  for (const url of CLUSTER) {
    const text = visible(article(url));
    for (const m of text.matchAll(/(\d{1,3}(?: \d{3})+) (?:so‘m|сум)/gu)) {
      assert.ok([KUNLIK, OYLIK].includes(m[1]), `${url}: ${m[0]} is not a Studio price (${KUNLIK}, ${OYLIK})`);
    }
    for (const m of text.matchAll(/(\d+) slaydgacha|до (\d+) слайдов/gu)) {
      const n = Number(m[1] ?? m[2]);
      assert.ok([freeSlides, fullSlides].includes(n), `${url}: «${m[0]}» is not a Studio slide limit`);
    }
    for (const m of text.matchAll(/(\d+) rasmgacha|до (\d+) изображений/gu)) {
      const n = Number(m[1] ?? m[2]);
      assert.ok([freeImages, fullImages].includes(n), `${url}: «${m[0]}» is not a Studio image limit`);
    }
  }
  for (const url of COMPARISONS) {
    const text = visible(article(url));
    assert.ok(text.includes(KUNLIK) && text.includes(OYLIK), `${url}: both Studio prices`);
    assert.ok(text.includes(`${STUDIO_FACTS.oylik.presentationFull} ta`) || text.includes(`${STUDIO_FACTS.oylik.presentationFull} презентаций`), `${url}: Oylik presentations`);
  }
  // The English Studio page reads the same facts (scripts/en-pages.ts).
  assert.equal(enPages(ROOT).find((p) => p.url === '/en/ai-presentation-maker/')?.blocks.some((b) => (b.links ?? []).some((l) => l.target === COMPARISONS[0])), true);
});

test('no «official / rasmiy» claim, the brand is GPTBot.uz and Uzbek uses the right apostrophes', () => {
  for (const url of CLUSTER) {
    const text = visible(article(url));
    assert.doesNotMatch(text, /\b(?:official|rasmiy)\b|официальн/i, url);
    assert.doesNotMatch(text, /\b(?:GPTbot|Gptbot|GPTBOT|GptBot)\.uz\b/, `${url}: brand casing`);
    if (url.startsWith('/uz/')) {
      const bad = text.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [];
      assert.deepEqual(bad, [], `${url}: ASCII or modifier apostrophe between letters`);
    }
  }
});

test('the comparisons name their sources with the check date and give no ranking', () => {
  for (const url of COMPARISONS) {
    const doc = article(url);
    const sources = doc.sources ?? [];
    for (const host of ['help.gamma.app', 'developers.gamma.app', 'www.canva.com', 'support.microsoft.com', 'www.microsoft.com']) {
      assert.ok(sources.some((s) => new URL(s.url).host === host), `${url}: a source on ${host}`);
    }
    for (const s of sources) assert.match(s.note ?? '', /2026-11-23/, `${url}: ${s.url} check date`);
    assert.doesNotMatch(visible(doc), /\b(?:лучший сервис|eng yaxshi vosita|№\s?1)\b/i, `${url}: no ranking`);
  }
});

test('every new article has at least two contextual links from other published articles', () => {
  const published = [...articles.values()].filter((a) => a.status === 'published');
  for (const url of CLUSTER) {
    const incoming = published.filter((a) => a.url !== url && (
      (a.internalLinks ?? []).some((l) => l.target === url)
      || (a.body ?? []).some((b) => (b.links ?? []).some((l) => l.target === url))
    ));
    assert.ok(incoming.length >= 2, `${url}: ${incoming.length} incoming article links`);
  }
});

test('the intent manifest fences the cluster from the Studio pages and the slide guide', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/seo/intent-manifest.json'), 'utf8')) as {
    pairs: Array<{ id: string; commercial: { url: string }; informational: { url: string } }>;
  };
  const fences = manifest.pairs.filter((p) => /^W20261123-0[1-5]-/.test(p.id));
  assert.deepEqual(fences.map((p) => p.informational.url).sort(), [
    '/ru/blog/kak-sdelat-prezentatsiyu/', '/ru/blog/prezentatsiya-s-ii-besplatno/',
    '/uz/blog/ai-taqdimot-vositalari/', '/uz/blog/himoya-uchun-taqdimot/', '/uz/blog/slayd-dizayni-qoidalari/',
  ]);
});

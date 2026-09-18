// What a crawler that does not execute JavaScript receives for "/".
//
// The homepage is the only document on the domain whose body is React: every
// leaf page is prerendered, but "/" ships <div id="root"> and mounts client
// side. scripts/prerender-home.ts injects a semantic shell into that root so
// the raw HTML still carries the page. Google renders JavaScript and sees the
// React output; GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot and Bing's
// fetcher largely do not, so for them the shell IS the homepage.
//
// Until 2026-09-18 that shell was an H1, one paragraph and link lists. The
// hero illustration, the five FAQ answers and the FAQPage schema that every
// landing page carries existed only inside the React tree, and
// <link rel="preload" as="image"> in index.html pointed at a file no element
// in the delivered markup referenced. These assertions keep all of it in the
// shell, and keep it identical to the copy a human reads — the shell may never
// say something the mounted landing does not.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { i18n } from '../src/i18n';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const prerenderHome = read('scripts/prerender-home.ts');
const generateSitemap = read('scripts/generate-sitemap.ts');

test('the crawler shell renders the hero image the visitor sees', () => {
  // Same asset family, same widths and same `sizes` as src/components/
  // PremiumImage.tsx, so the shell copy and the React copy resolve to one URL
  // and a real visitor downloads the hero once.
  const premiumImage = read('src/components/PremiumImage.tsx');
  const hero = read('src/components/Hero.tsx');

  assert.match(prerenderHome, /const HERO_NAME = 'ai-sales-assistant-workspace'/);
  assert.match(hero, /name="ai-sales-assistant-workspace"/);
  assert.match(prerenderHome, /const HERO_WIDTHS = \[480, 800, 1280, 1536\]/);
  assert.match(premiumImage, /const WIDTHS = \[480, 800, 1280, 1536\]/);
  assert.match(prerenderHome, /const HERO_SIZES = '\(max-width: 1024px\) 90vw, 40vw'/);
  assert.match(hero, /sizes="\(max-width: 1024px\) 90vw, 40vw"/);

  // <picture> with both modern formats, and an <img> that is not decorative.
  assert.match(prerenderHome, /type="image\/avif"/);
  assert.match(prerenderHome, /type="image\/webp"/);
  assert.match(prerenderHome, /width="1536" height="960"/);
  assert.match(prerenderHome, /loading="eager"/);
  assert.match(prerenderHome, /fetchpriority="high"/);

  const alt = prerenderHome.match(/const HERO_ALT =\s*\n?\s*'([^']+)'/)?.[1];
  assert.ok(alt && alt.length >= 40, 'hero alt must describe the image, not label it');
  assert.ok(hero.includes(alt!), 'shell alt text must be the alt text Hero.tsx renders');
});

test('the crawler shell carries the homepage FAQ, and the schema repeats it verbatim', () => {
  const items = i18n.ru.faq.items;
  assert.ok(items.length >= 3, 'a FAQPage needs real questions behind it');

  // One source for the visible accordion (src/components/FAQ.tsx), the shell
  // and the JSON-LD: a FAQPage whose answers differ from the page is exactly
  // the structured-data lie that costs citation trust.
  assert.match(prerenderHome, /const RU = i18n\.ru/);
  assert.match(prerenderHome, /RU\.faq\.items\.map/g);
  assert.ok(
    (prerenderHome.match(/RU\.faq\.items/g) ?? []).length >= 2,
    'the FAQ must reach both the shell markup and the JSON-LD from i18n',
  );
  assert.match(prerenderHome, /'@type': 'FAQPage'/);
  assert.match(prerenderHome, /acceptedAnswer: \{ '@type': 'Answer', text: f\.a \}/);
  assert.match(prerenderHome, /\$\{global\.siteUrl\}\/#faq/);
});

test('the homepage names one representative image, not two', () => {
  // og:image lives in index.html (the homepage is the only document whose head
  // is hand-written), so the JSON-LD must take its primaryImageOfPage from
  // there rather than from the site-wide default.
  assert.match(prerenderHome, /<meta property="og:image" content="\(\[\^"\]\+\)"/);
  assert.match(prerenderHome, /primaryImage: declaredOgImage \|\| global\.defaultOgImage/);
});

test('the crawler shell states what the product does, not only where to click', () => {
  // The pain / solution / how / niches copy is what an answer engine quotes
  // when asked what GPTBot.uz is. Link lists alone do not answer that.
  for (const key of ['RU.pain.h', 'RU.solution.h', 'RU.how.h', 'RU.niches.h', 'RU.hero.bullets']) {
    assert.ok(prerenderHome.includes(key), `crawler shell lost ${key}`);
  }
});

test('the sitemap advertises the images a crawler can actually find in the markup', () => {
  assert.match(generateSitemap, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(generateSitemap, /<image:image><image:loc>/);

  // Same-origin raster only: the Yandex and Meta tracking pixels are absolute
  // third-party URLs and the market wordmarks are SVG — neither belongs in an
  // image sitemap.
  assert.match(generateSitemap, /const RASTER = \/\\\.\(avif\|webp\|jpe\?g\|png\)\$\/i/);
  assert.match(generateSitemap, /src\.startsWith\('\/assets\/'\)/);

  // Read out of the built HTML, never out of the content JSON: a file that is
  // not in the delivered markup is not on the page.
  assert.match(generateSitemap, /function imagesOf/);
  assert.match(generateSitemap, /<img\\b\[\^>\]\*\\bsrc="\(\[\^"\]\+\)"/);
});

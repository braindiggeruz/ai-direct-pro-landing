// Run after npm run build:fast to verify the JSON-LD a crawler actually receives.
// These informational guides previously advertised themselves as a Service
// because they inherited the commercial page type.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { HOME_HREFLANG, SITE_URL } from '../src/shared/site-config';
import type { GlobalSEO, Page } from '../src/shared/types';

const ROOT = process.cwd();
const global = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/global/site.json'), 'utf8')) as GlobalSEO;
const guides = ['ru/gpt-chat-guide', 'uz/gpt-chat-qollanma', 'uz/suniy-intellekt'].map((name) => ({
  page: JSON.parse(fs.readFileSync(path.join(ROOT, `content/pages/${name}.json`), 'utf8')) as Page,
  file: path.join(ROOT, `dist/${name}/index.html`),
}));
const hasBuild = fs.existsSync(path.join(ROOT, 'dist/.vite/manifest.json'));

type Entity = Record<string, unknown> & { '@type'?: string; '@id'?: string };

for (const { page, file } of guides) {
  test(`${page.url} renders an authored guide, with valid language links and no service offer`, {
    skip: !hasBuild && 'no dist/ build present; run npm run build:fast',
  }, () => {
    assert.ok(fs.existsSync(file), `the fresh build omitted ${page.url}`);
    const html = fs.readFileSync(file, 'utf8');
    const entities: Entity[] = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
      .flatMap((match) => {
        const data = JSON.parse(match[1]) as Entity & { '@graph'?: Entity[] };
        return data['@graph'] || [data];
      });
    const articles = entities.filter((entity) => entity['@type'] === 'Article');
    assert.equal(articles.length, 1, 'the guide must expose exactly one Article');
    assert.equal(entities.some((entity) => entity['@type'] === 'Service' || entity['@type'] === 'Offer'), false,
      'instructions for using the chat are not a service for sale');

    const article = articles[0];
    assert.equal(article.url, page.canonical);
    assert.equal(article.headline, page.h1);
    assert.equal(article.description, page.description);
    assert.equal(article.inLanguage, page.locale);
    assert.ok(page.createdAt, 'publication date must come from the authored guide');
    assert.equal(article.datePublished, page.createdAt.slice(0, 10));
    const rawModified = page.lastReviewedAt || page.updatedAt;
    assert.ok(rawModified, 'modified date must come from the authored guide');
    const modified = rawModified.slice(0, 10);
    assert.equal(article.dateModified, modified);
    assert.ok(html.includes(`<time datetime="${modified}">${modified}</time>`), 'the schema date must also be visible on the guide');

    const author = entities.find((entity) => entity['@type'] === 'Person' && entity['@id'] === `${SITE_URL}/#author`);
    assert.ok(author, 'the Article author reference must resolve inside this graph');
    assert.equal(author.name, global.authorName);
    assert.deepEqual(article.author, { '@id': author['@id'] });
    assert.match(html, /data-testid="page-author"/, 'keep the visible author byline');

    const breadcrumb = entities.find((entity) => entity['@type'] === 'BreadcrumbList');
    assert.ok(breadcrumb, 'keep the breadcrumb entity');
    const items = breadcrumb.itemListElement as { item: string }[];
    assert.deepEqual(items.map((item) => item.item), [
      `${SITE_URL}${page.locale === 'uz' ? HOME_HREFLANG.uz : HOME_HREFLANG.ru}`,
      page.canonical,
    ]);
    if (page.hreflangRu && page.hreflangUz) {
      for (const [lang, target] of [['ru', page.hreflangRu], ['uz', page.hreflangUz]]) {
        assert.ok(html.includes(`hreflang="${lang}" href="${SITE_URL}${target}"`), `keep the ${lang} alternate`);
      }
    } else {
      assert.doesNotMatch(html, /<link\b[^>]*hreflang=/, 'a single-locale guide has no language pair');
    }
    assert.ok(html.includes(`rel="canonical" href="${page.canonical}"`));
    assert.ok(html.includes(`href="${page.ctaPrimaryHref}"`), 'the direct chat entry must remain');
    assert.equal((html.match(/<h1\b/g) || []).length, 1, 'keep a single visible heading');
    assert.doesNotMatch(html, /data-testid="sticky-call-cta"/, 'the guide must not inherit the commercial sales bar');
  });
}

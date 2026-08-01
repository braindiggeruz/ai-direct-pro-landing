// Guards the internal-link graph the SEO gate is built on.
//
// The audit used to index content/pages/** only, so every money-page → blog
// link counted as broken (110 of them) and a genuinely dead link was invisible
// in the noise. These tests pin the corrected behaviour: the graph spans pages,
// blog articles and static routes; redirect hops are reported apart from real
// breakage; and a page that exists in one locale only is not a hreflang defect.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { auditPage, buildCockpit, buildKnownUrls, resolveRedirect, STATIC_ROUTES } from '../src/shared/audit';
import { LLM_MARKDOWN_URLS } from '../scripts/llm-pages';
import type { BlogArticle, Page, Redirect } from '../src/shared/types';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');

function readAll<T>(dir: string): T[] {
  const out: T[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) out.push(JSON.parse(fs.readFileSync(full, 'utf8')) as T);
    }
  };
  walk(dir);
  return out;
}

const pages = readAll<Page>(path.join(CONTENT, 'pages'));
const blog = readAll<BlogArticle>(path.join(CONTENT, 'blog'));
const redirects: Redirect[] = JSON.parse(fs.readFileSync(path.join(CONTENT, 'seo', 'redirects.json'), 'utf8'));

function page(overrides: Partial<Page>): Page {
  return {
    status: 'published',
    locale: 'ru',
    url: '/ru/fixture/',
    slug: 'fixture',
    pageType: 'money',
    title: 'Fixture page title that is long enough to pass the rule',
    description: 'Fixture description long enough to satisfy the audit rule about minimum description length for pages.',
    h1: 'Fixture',
    canonical: 'https://gptbot.uz/ru/fixture/',
    robotsIndex: true,
    robotsFollow: true,
    schemaTypes: ['Organization'],
    ...overrides,
  } as Page;
}

test('link graph spans blog articles and static routes, not just pages', () => {
  const known = buildKnownUrls([page({ url: '/ru/a/' })], {
    blog: [{ url: '/ru/blog/post/' }],
  });

  assert.ok(known.has('/ru/a/'));
  assert.ok(known.has('/ru/blog/post/'), 'blog URLs belong in the graph');
  for (const route of STATIC_ROUTES) assert.ok(known.has(route), `${route} belongs in the graph`);
});

test('a page linking to a published article is not a broken link', () => {
  const subject = page({ internalLinks: [{ target: '/ru/blog/post/', anchor: 'post', locale: 'ru', type: 'contextual' }] });
  const knownUrls = buildKnownUrls([subject], { blog: [{ url: '/ru/blog/post/' }] });

  const result = auditPage(subject, { allPages: [subject], knownUrls });

  assert.equal(result.issues.filter((i) => i.rule === 'broken-internal-link').length, 0);
});

test('a link to a URL nothing serves is reported as broken', () => {
  const subject = page({ internalLinks: [{ target: '/ru/does-not-exist/', anchor: 'gone', locale: 'ru', type: 'contextual' }] });
  const knownUrls = buildKnownUrls([subject], { blog: [] });

  const result = auditPage(subject, { allPages: [subject], knownUrls });
  const broken = result.issues.filter((i) => i.rule === 'broken-internal-link');

  assert.equal(broken.length, 1);
  assert.match(broken[0].message, /\/ru\/does-not-exist\//);
});

test('links inside body blocks are checked, not only the internalLinks list', () => {
  const subject = page({
    bodyBlocks: [{ type: 'linkp', text: 'see {x}', links: [{ token: 'x', target: '/ru/missing/', anchor: 'x' }] }],
  });
  const knownUrls = buildKnownUrls([subject], { blog: [] });

  const result = auditPage(subject, { allPages: [subject], knownUrls });

  assert.equal(result.issues.filter((i) => i.rule === 'broken-internal-link').length, 1);
});

test('a link through a redirect is a warning, not a broken link', () => {
  const target = page({ url: '/ru/target/' });
  const subject = page({
    url: '/ru/source/',
    internalLinks: [{ target: '/ru/old/', anchor: 'old', locale: 'ru', type: 'contextual' }],
  });
  const table: Redirect[] = [{ from: '/ru/old/', to: '/ru/target/', statusCode: 301 }];
  const knownUrls = buildKnownUrls([subject, target], { blog: [] });

  const result = auditPage(subject, { allPages: [subject, target], knownUrls, redirects: table });

  assert.equal(result.issues.filter((i) => i.rule === 'broken-internal-link').length, 0);
  assert.equal(result.issues.filter((i) => i.rule === 'internal-link-via-redirect').length, 1);
});

test('wildcard redirects resolve with their splat', () => {
  const table: Redirect[] = [{ from: '/blog/*', to: '/ru/blog/:splat', statusCode: 301 }];

  assert.equal(resolveRedirect('/blog/hello/', table), '/ru/blog/hello/');
  assert.equal(resolveRedirect('/other/hello/', table), null);
});

test('an incoming link from a blog article stops a page being an orphan', () => {
  const subject = page({ url: '/ru/only-linked-from-blog/' });
  const other = page({ url: '/ru/other/' });

  const withoutBlog = buildCockpit([subject, other]);
  const withBlog = buildCockpit([subject, other], undefined, {
    blog: [{
      url: '/ru/blog/post/',
      internalLinks: [{ target: '/ru/only-linked-from-blog/', anchor: 'x', locale: 'ru', type: 'contextual' }],
    }],
  });

  assert.ok(withoutBlog.orphanPageUrls.includes('/ru/only-linked-from-blog/'));
  assert.ok(!withBlog.orphanPageUrls.includes('/ru/only-linked-from-blog/'));
});

test('a page authored in one locale only is not counted as a hreflang defect', () => {
  const ruOnly = page({ url: '/ru/ru-only/', hreflangRu: '/ru/ru-only/' });

  const stats = buildCockpit([ruOnly]);

  assert.equal(stats.missingHreflang, 0, 'declaring its own language is enough');
  assert.equal(stats.ruUzPairsMissing, 0, 'no counterpart declared means no broken pair');
  assert.equal(stats.singleLocalePages, 1);
});

test('a declared hreflang counterpart that does not exist is a defect', () => {
  const ru = page({ url: '/ru/x/', hreflangRu: '/ru/x/', hreflangUz: '/uz/gone/' });

  const stats = buildCockpit([ru]);
  const issues = stats.pages[0].issues.map((i) => i.rule);

  assert.equal(stats.ruUzPairsMissing, 1);
  assert.ok(issues.includes('hreflang-target-missing'));
});

// ---------------------------------------------------------------------------
// Whole-repository invariants — these are the numbers the release gate reports.
// ---------------------------------------------------------------------------

test('the repository has no broken internal links', () => {
  const stats = buildCockpit(pages, undefined, { blog, redirects });

  assert.deepEqual(stats.brokenInternalLinkDetails, [], 'every internal link must resolve to a served URL');
});

test('no internal link points at a redirect source', () => {
  const stats = buildCockpit(pages, undefined, { blog, redirects });

  assert.deepEqual(stats.linksViaRedirectDetails, [], 'link the redirect target directly');
});

test('no published page is orphaned', () => {
  const stats = buildCockpit(pages, undefined, { blog, redirects });

  assert.deepEqual(stats.orphanPageUrls, []);
});

test('every redirect target is served and is not itself a redirect source', () => {
  const served = buildKnownUrls(pages, { blog });
  const sources = new Set(redirects.map((r) => r.from));

  for (const r of redirects) {
    if (r.to.startsWith('http') || r.to.includes(':splat')) continue;
    assert.ok(!sources.has(r.to), `${r.from} → ${r.to} forms a redirect chain`);
    assert.ok(served.has(r.to), `${r.from} → ${r.to} is not a served URL`);
  }
});

test('every curated LLM markdown twin still has a published page behind it', () => {
  const published = new Set(pages.filter((p) => p.status === 'published').map((p) => p.url));

  for (const url of LLM_MARKDOWN_URLS) {
    assert.ok(published.has(url), `${url} has a markdown twin but no published page`);
  }
});

test('no redirect source is still published as a page', () => {
  const urls = new Set(pages.map((p) => p.url));

  for (const r of redirects) {
    if (r.from.includes('*')) continue;
    assert.ok(!urls.has(r.from), `${r.from} is redirected but still exists as content`);
  }
});

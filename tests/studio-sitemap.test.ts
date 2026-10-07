// The studio in the sitemap (STUDIO-SPEC §11.8, §14.1 studio-sitemap):
// published studio pages are listed with their RU↔UZ pair, a draft is not,
// every listed studio URL has its HTML (prerender-studio checks it after
// generate-sitemap has run), and publishing them does not move the homepage's
// lastmod. Also the repository-level rules: no document links a studio page
// that is not served, and no studio URL is in content/pages or content/blog.
//
// The repository checks read process.cwd(), like the other SEO suites, so
// tests/studio-release.test.ts can run this file on a copy of content/ with a
// release applied.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { studioSitemapFailures } from '../apps/studio/scripts/prerender-studio';
import {
  readStudioPages,
  studioAlternates,
  studioSitemapEntries,
} from '../apps/studio/shared/published-urls';
import { linksToUnservedStudioPages, readDocs } from './helpers/studio-content';

type Cleanup = { after: (fn: () => void) => void };

const REPO = path.resolve(import.meta.dirname, '..');
const ROOT = process.cwd();

function tempRoot(t: Cleanup, prefix = 'gpt-studio-sitemap-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root: string, file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

const record = (url: string, status: string, extra: Record<string, unknown> = {}) => JSON.stringify({
  url, locale: url.split('/')[1], status, hreflangRu: '/ru/prezentatsiya-ai/', hreflangUz: '/uz/taqdimot-ai/', updatedAt: '2026-10-22', ...extra,
});

// --- the entries ------------------------------------------------------------------

test('entries: a published pair is listed with its hreflang pair, x-default Russian, lastmod from updatedAt', t => {
  const root = tempRoot(t);
  write(root, 'content/studio/pages/uz/taqdimot-ai.json', record('/uz/taqdimot-ai/', 'published'));
  write(root, 'content/studio/pages/ru/prezentatsiya-ai.json', record('/ru/prezentatsiya-ai/', 'published', { updatedAt: '2026-10-23', createdAt: '2026-10-06' }));
  const pair = { ru: '/ru/prezentatsiya-ai/', uz: '/uz/taqdimot-ai/', xDefault: '/ru/prezentatsiya-ai/' };
  assert.deepEqual(studioSitemapEntries(root), [
    { url: '/ru/prezentatsiya-ai/', lastmod: '2026-10-23', alternates: pair },
    { url: '/uz/taqdimot-ai/', lastmod: '2026-10-22', alternates: pair },
  ]);
});

test('entries: a draft is never listed, and its published translation stands alone', t => {
  const root = tempRoot(t);
  write(root, 'content/studio/pages/uz/taqdimot-ai.json', record('/uz/taqdimot-ai/', 'published'));
  write(root, 'content/studio/pages/ru/prezentatsiya-ai.json', record('/ru/prezentatsiya-ai/', 'draft'));
  assert.deepEqual(studioSitemapEntries(root), [{ url: '/uz/taqdimot-ai/', lastmod: '2026-10-22' }]);
  write(root, 'content/studio/pages/uz/taqdimot-ai.json', record('/uz/taqdimot-ai/', 'draft'));
  assert.deepEqual(studioSitemapEntries(root), []);
});

test('alternates: only a reciprocal pair of published pages in both languages', t => {
  const root = tempRoot(t);
  write(root, 'content/studio/pages/uz/taqdimot-ai.json', record('/uz/taqdimot-ai/', 'published'));
  write(root, 'content/studio/pages/ru/prezentatsiya-ai.json', record('/ru/prezentatsiya-ai/', 'published', { hreflangUz: '/uz/boshqa/' }));
  const pages = readStudioPages(root);
  for (const page of pages) assert.equal(studioAlternates(page, pages), null, `${page.url}: the pair does not name each other`);
  write(root, 'content/studio/pages/ru/prezentatsiya-ai.json', record('/ru/prezentatsiya-ai/', 'published', { hreflangRu: undefined, hreflangUz: undefined }));
  assert.equal(studioAlternates(readStudioPages(root)[1], readStudioPages(root)), null, 'one side declares no pair');
  write(root, 'content/studio/pages/ru/prezentatsiya-ai.json', record('/ru/prezentatsiya-ai/', 'published'));
  const both = readStudioPages(root);
  assert.deepEqual(studioAlternates(both[1], both), { ru: '/ru/prezentatsiya-ai/', uz: '/uz/taqdimot-ai/', xDefault: '/ru/prezentatsiya-ai/' });
  // A draft has no pair even when its translation is published.
  assert.equal(studioAlternates({ ...both[1], status: 'draft' }, both), null);
});

// --- generate-sitemap.ts, run for real on copies of content/ ---------------------------

function runSitemap(root: string): { sitemap: string; updates: string } {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/generate-sitemap.ts', '--root', root], {
    cwd: REPO, encoding: 'utf8', windowsHide: true, timeout: 120_000,
  });
  assert.equal(run.status, 0, run.stderr);
  return {
    sitemap: fs.readFileSync(path.join(root, 'dist/sitemap.xml'), 'utf8'),
    updates: fs.readFileSync(path.join(root, 'dist/sitemap-updates.xml'), 'utf8'),
  };
}

/** A copy of the repository's content/ (pages, blog, global, seo, studio) under a new root. */
function copyContent(t: Cleanup): string {
  const root = tempRoot(t, 'gpt-studio-sitemap-content-');
  fs.cpSync(path.join(ROOT, 'content'), path.join(root, 'content'), { recursive: true });
  return root;
}

const urlBlock = /  <url>\n    <loc>https:\/\/gptbot\.uz(\/[^<]*)<\/loc>[\s\S]*?\n  <\/url>\n?/g;
const blocksOf = (xml: string) => [...xml.matchAll(urlBlock)].map(m => ({ url: m[1], block: m[0] }));
const withoutStudio = (xml: string, urls: string[]) => xml.replace(urlBlock, (block, url: string) => (urls.includes(url) ? '' : block));
const homeLastmod = (xml: string) => /<loc>https:\/\/gptbot\.uz\/<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>/.exec(xml)?.[1];

test('generate-sitemap: drafts change nothing, published pages are only added, and the homepage lastmod stays', t => {
  const studio = readStudioPages(ROOT);
  const studioUrls = studio.map(p => p.url);
  assert.ok(studioUrls.length >= 2);

  // The repository as it is, and the same content without any studio record.
  const asIs = copyContent(t);
  const without = copyContent(t);
  fs.rmSync(path.join(without, 'content/studio'), { recursive: true, force: true });
  const current = runSitemap(asIs);
  const bare = runSitemap(without);
  const published = studio.filter(p => p.status === 'published').map(p => p.url);
  assert.equal(withoutStudio(current.sitemap, studioUrls), bare.sitemap, 'only published studio entries are added');
  assert.equal(withoutStudio(current.updates, studioUrls), bare.updates);
  assert.deepEqual(blocksOf(current.sitemap).filter(b => studioUrls.includes(b.url)).map(b => b.url).sort(), published.sort());

  // Every studio record published on 2026-10-22 (and nothing else changed).
  const released = copyContent(t);
  for (const page of studio) {
    const file = path.join(released, page.file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(file, JSON.stringify({ ...data, status: 'published', updatedAt: '2026-10-22' }, null, 2));
  }
  const after = runSitemap(released);
  assert.equal(withoutStudio(after.sitemap, studioUrls), bare.sitemap, 'publishing adds the studio entries and changes nothing else');
  assert.equal(homeLastmod(after.sitemap), homeLastmod(bare.sitemap), 'the homepage lastmod stays');
  const added = blocksOf(after.sitemap).filter(b => studioUrls.includes(b.url));
  assert.deepEqual(added.map(b => b.url).sort(), [...studioUrls].sort());
  const releasedPages = readStudioPages(released);
  for (const { url, block } of added) {
    // The deck pair carries its alternates; a page without a translation (the photo page) carries none.
    const paired = studioAlternates(releasedPages.find(p => p.url === url) as StudioPageRecord, releasedPages) !== null;
    if (paired) {
      assert.match(block, /<xhtml:link rel="alternate" hreflang="ru" href="https:\/\/gptbot\.uz\/ru\/prezentatsiya-ai\/"\/>/, url);
      assert.match(block, /<xhtml:link rel="alternate" hreflang="uz" href="https:\/\/gptbot\.uz\/uz\/taqdimot-ai\/"\/>/, url);
      assert.match(block, /<xhtml:link rel="alternate" hreflang="x-default" href="https:\/\/gptbot\.uz\/ru\/prezentatsiya-ai\/"\/>/, url);
    } else {
      assert.doesNotMatch(block, /<xhtml:link/, url);
    }
    assert.match(block, /<lastmod>2026-10-22<\/lastmod>/, url);
    assert.doesNotMatch(block, /<image:image>/, url);
  }
  assert.ok(added.some(({ url }) => studioAlternates(releasedPages.find(p => p.url === url) as StudioPageRecord, releasedPages) !== null), 'the deck pair is paired');
  // The recent-changes sitemap is a subset of the main one: the new pages are recent.
  assert.deepEqual(blocksOf(after.updates).filter(b => studioUrls.includes(b.url)).map(b => b.url).sort(), [...studioUrls].sort());
});

// --- prerender-studio: sitemap ↔ HTML --------------------------------------------------

test('sitemap ↔ HTML: every way they can disagree is caught after the studio prerender', t => {
  const root = tempRoot(t);
  const dist = path.join(root, 'dist');
  write(root, 'content/studio/pages/uz/taqdimot-ai.json', record('/uz/taqdimot-ai/', 'published'));
  write(root, 'content/studio/pages/ru/prezentatsiya-ai.json', record('/ru/prezentatsiya-ai/', 'draft'));
  const pages = readStudioPages(root);
  const map = (urls: string[]) => `<urlset>${urls.map(url => `<url><loc>https://gptbot.uz${url}</loc></url>`).join('')}</urlset>`;
  assert.deepEqual(studioSitemapFailures(dist, pages, 'https://gptbot.uz'), ['dist/sitemap.xml is missing; scripts/generate-sitemap.ts runs before the studio prerender']);

  write(dist, 'sitemap.xml', map(['/', '/uz/taqdimot-ai/']));
  assert.deepEqual(studioSitemapFailures(dist, pages, 'https://gptbot.uz'), [
    '/uz/taqdimot-ai/ is published but has no HTML',
    'sitemap.xml lists /uz/taqdimot-ai/ without its HTML',
  ]);
  write(dist, 'uz/taqdimot-ai/index.html', '<html></html>');
  assert.deepEqual(studioSitemapFailures(dist, pages, 'https://gptbot.uz'), []);

  write(dist, 'sitemap.xml', map(['/']));
  assert.deepEqual(studioSitemapFailures(dist, pages, 'https://gptbot.uz'), ['/uz/taqdimot-ai/ is published but not in sitemap.xml']);

  write(dist, 'sitemap.xml', map(['/', '/uz/taqdimot-ai/', '/ru/prezentatsiya-ai/']));
  write(dist, 'sitemap-updates.xml', map(['/ru/prezentatsiya-ai/']));
  assert.deepEqual(studioSitemapFailures(dist, pages, 'https://gptbot.uz'), [
    '/ru/prezentatsiya-ai/ is a draft but sitemap.xml lists it',
    'sitemap.xml lists /ru/prezentatsiya-ai/ without its HTML',
    'sitemap-updates.xml lists /ru/prezentatsiya-ai/ without its HTML',
  ]);
});

// --- the repository (process.cwd()) ---------------------------------------------------------

test('repository: the studio entries are exactly the published records, paired when both are published', () => {
  const pages = readStudioPages(ROOT);
  const entries = studioSitemapEntries(ROOT);
  assert.deepEqual(entries.map(e => e.url), pages.filter(p => p.status === 'published').map(p => p.url));
  for (const entry of entries) {
    const page = pages.find(p => p.url === entry.url);
    assert.ok(page);
    // The translation a record names (hreflangRu / hreflangUz); a page without one (the photo page) is never paired.
    const translation = page.locale === 'uz' ? page.data.hreflangRu : page.data.hreflangUz;
    const counterpart = typeof translation === 'string' ? pages.find(p => p.url === translation && p.locale !== page.locale) : undefined;
    assert.equal(Boolean(entry.alternates), counterpart?.status === 'published', entry.url);
  }
});

test('repository: no page or article links a studio page that is not served; no studio URL is in content/pages or content/blog', () => {
  assert.deepEqual(linksToUnservedStudioPages(ROOT), []);
  const studioUrls = new Set(readStudioPages(ROOT).map(p => p.url));
  const { pages, blog } = readDocs(ROOT);
  assert.deepEqual([...pages, ...blog].map(doc => doc.url).filter(url => studioUrls.has(url)), []);
});

// The homepage is one of the ten protected pages, and its crawler shell lists
// pages and articles straight out of content/ (scripts/prerender-home.ts):
// money pages by h1 || title, articles by title, newest first, filtered by
// status, robotsIndex, locale, pageType, termsVersion and canonical. So an edit
// to an unprotected document (a studio release touches the slide guide and
// /ru/gpt-dlya-ucheby/) could still change the protected homepage. STUDIO-SPEC
// §3.5 freezes those fields; this test recomputes the four lists from content/
// and holds them against the reviewed protected baseline
// (scripts/seo-protection.ts BASELINE): the same entries, in the same order,
// with the same labels, every link already in the reviewed homepage.
//
// content/ is read from process.cwd(), like the other SEO suites, so
// tests/studio-release.test.ts can run this file on a copy of content/ with a
// release applied.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { i18n } from '../src/i18n';
import type { BlogArticle, Page } from '../src/shared/types';
import { BASELINE, PROTECTED_PATHS } from '../scripts/seo-protection';
import { readDocs } from './helpers/studio-content';

const REPO = path.resolve(import.meta.dirname, '..');
const ROOT = process.cwd();
const SITE_URL = 'https://gptbot.uz';

type Snapshot = { pages: Array<{ pathname: string; contract: { internalLinks: string[] }; bodyText: string }> };
const baseline = JSON.parse(fs.readFileSync(path.join(REPO, BASELINE), 'utf8')) as Snapshot;
const home = baseline.pages.find(page => page.pathname === '/');

// prerender-home.ts writes element text through this escape and the protection
// contract keeps entities as they are, so labels are compared escaped.
const escapeText = (s: string) => (s || '').replace(/[&<]/g, c => ({ '&': '&amp;', '<': '&lt;' }[c] as string));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

const isSelfCanonical = (p: Page) => !p.canonical || p.canonical === p.url || p.canonical === `${SITE_URL}${p.url}`;
const inShellIndex = (p: Page, locale: 'ru' | 'uz') =>
  p.status === 'published' && p.robotsIndex !== false && p.locale === locale && p.pageType !== 'homepage'
  && !p.termsVersion && isSelfCanonical(p);
const liveArticles = (blog: BlogArticle[], locale: 'ru' | 'uz') => blog
  .filter(a => a.status === 'published' && a.robotsIndex !== false && a.locale === locale)
  .sort((a, b) => (b.datePublished || '').localeCompare(a.datePublished || ''));

/** The four lists of the homepage shell, as prerender-home.ts builds them from `root`'s content/. */
export function homepageLists(root: string) {
  const { pages, blog } = readDocs(root);
  const money = (locale: 'ru' | 'uz') => pages.filter(p => inShellIndex(p, locale)).sort((a, b) => a.url.localeCompare(b.url))
    .map(p => ({ url: p.url, label: squash(escapeText(p.h1 || p.title)) }));
  const articles = (locale: 'ru' | 'uz') => liveArticles(blog, locale).map(a => ({ url: a.url, label: squash(escapeText(a.title || a.h1)) }));
  return { moneyRu: money('ru'), blogRu: articles('ru'), moneyUz: money('uz'), blogUz: articles('uz') };
}

test('the baseline names the homepage among the ten protected pages', () => {
  assert.ok((PROTECTED_PATHS as readonly string[]).includes('/'));
  assert.ok(home, `${BASELINE} has no homepage contract`);
});

test('the homepage lists recomputed from content/ equal the reviewed baseline, entry for entry and in order', () => {
  assert.ok(home);
  const lists = homepageLists(ROOT);
  const labels = (list: Array<{ label: string }>) => list.map(item => item.label).join(' ');
  // The shell's text from the money list to the FAQ: four headings, the two
  // blog-index lines and the four lists, nothing in between.
  const expected = squash([
    'AI-бот для бизнеса — решения по нишам', labels(lists.moneyRu),
    'Полезные материалы и блог', 'Все статьи блога', labels(lists.blogRu),
    'Biznes uchun yechimlar — O&#8216;zbekiston', 'O&#8216;zbek tilida: GPTBot.uz blogi (UZ)', labels(lists.moneyUz),
    'GPTBot.uz blogi — o&#8216;zbek tilida', labels(lists.blogUz),
    escapeText(i18n.ru.faq.h),
  ].join(' '));
  // The headings around each list pin both of its ends, so an entry added,
  // dropped, renamed or moved anywhere breaks the match.
  const at = home.bodyText.indexOf(expected);
  assert.ok(at >= 0, 'the homepage lists recomputed from content/ differ from the reviewed homepage');
  assert.equal(home.bodyText.indexOf(expected, at + 1), -1);
  for (const list of Object.values(lists)) assert.ok(list.length > 0);
});

test('every listed URL is one the reviewed homepage already links', () => {
  assert.ok(home);
  const links = new Set(home.contract.internalLinks);
  const lists = homepageLists(ROOT);
  for (const item of [...lists.moneyRu, ...lists.blogRu, ...lists.moneyUz, ...lists.blogUz]) {
    assert.ok(links.has(item.url), `${item.url} is listed but the reviewed homepage does not link it`);
  }
});

test('no studio page can reach the lists: studio records are not in content/pages or content/blog', () => {
  const studioDir = path.join(ROOT, 'content', 'studio', 'pages');
  const studioUrls = new Set<string>();
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) studioUrls.add((JSON.parse(fs.readFileSync(full, 'utf8')) as { url: string }).url);
    }
  };
  walk(studioDir);
  const lists = homepageLists(ROOT);
  for (const item of [...lists.moneyRu, ...lists.blogRu, ...lists.moneyUz, ...lists.blogUz]) assert.ok(!studioUrls.has(item.url), item.url);
});

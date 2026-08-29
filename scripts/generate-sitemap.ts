// Generates /dist/sitemap.xml from published indexable pages AND blog articles.
// Excludes draft / noindex / robotsIndex=false items.
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { Page, BlogArticle } from '../src/shared/types';
import { SITE_URL } from '../src/shared/site-config';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const DIST_DIR = path.join(ROOT, 'dist');

const pageFiles = fg.sync('pages/**/*.json', { cwd: CONTENT_DIR, absolute: true });
const pages: Page[] = pageFiles.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));
const eligible = pages.filter((p) => p.status === 'published' && p.robotsIndex !== false);

const blogFiles = fg.sync('blog/**/*.json', { cwd: CONTENT_DIR, absolute: true });
const articles: BlogArticle[] = blogFiles.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));
const eligibleArticles = articles.filter((a) => a.status === 'published' && a.robotsIndex !== false);

const ruArticles = eligibleArticles.filter((a) => (a.locale === 'uz' ? 'uz' : 'ru') === 'ru');
const uzArticles = eligibleArticles.filter((a) => a.locale === 'uz');

function dateOnly(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString().split('T')[0];
}

function latestDate(values: Array<string | undefined>): string | undefined {
  return values.map(dateOnly).filter((value): value is string => !!value).sort().at(-1);
}

const latestSiteChange = latestDate([
  ...eligible.map((p) => p.lastReviewedAt || p.updatedAt || p.createdAt),
  ...eligibleArticles.map((a) => a.dateModified || a.updatedAt || a.datePublished || a.createdAt),
]);
const latestRuArticle = latestDate(ruArticles.map((a) => a.dateModified || a.updatedAt || a.datePublished || a.createdAt));
const latestUzArticle = latestDate(uzArticles.map((a) => a.dateModified || a.updatedAt || a.datePublished || a.createdAt));

// hreflang pairs declared in the content JSON (hreflangRu + hreflangUz on the
// same item). Each pair is registered under every URL that belongs to it — the
// item's own url plus both declared alternates — so both language versions of a
// page emit the same reciprocal xhtml:link set even when a counterpart only
// declares one direction. Items missing either field simply get no alternates
// (no invented links for single-locale content).
type HreflangPair = { ru: string; uz: string };
const hreflangPairs = new Map<string, HreflangPair>();
for (const item of [...eligible, ...eligibleArticles]) {
  if (item.hreflangRu && item.hreflangUz) {
    const pair: HreflangPair = { ru: item.hreflangRu, uz: item.hreflangUz };
    hreflangPairs.set(item.url, pair);
    hreflangPairs.set(item.hreflangRu, pair);
    hreflangPairs.set(item.hreflangUz, pair);
  }
}

const entries = [
  // Homepage. We deliberately do NOT emit hreflang alternates here:
  //  • There is no separate /uz/ landing today — emitting hreflang="uz"
  //    pointing to /?lang=uz creates a phantom URL Google can't use.
  //  • The homepage IS the RU entry, but emitting hreflang="ru" → "/"
  //    is redundant with the canonical/self-referential URL.
  // When a real /uz/ landing ships, add reciprocal RU↔UZ pair here.
  { url: '/', lastmod: latestSiteChange },
  // Blog indexes — emit one per locale that has at least one published article.
  // When both locales have articles, the RU index also advertises its UZ pair
  // (and vice versa) for hreflang reciprocity.
  ...(ruArticles.length > 0
    ? [{ url: '/ru/blog/', lastmod: latestRuArticle }]
    : []),
  ...(uzArticles.length > 0
    ? [{ url: '/uz/blog/', lastmod: latestUzArticle }]
    : []),
  // Money pages
  ...eligible.map((p) => ({
    url: p.url,
    lastmod: dateOnly(p.lastReviewedAt || p.updatedAt || p.createdAt),
  })),
  // Blog articles
  ...eligibleArticles.map((a) => ({
    url: a.url,
    lastmod: dateOnly(a.dateModified || a.updatedAt || a.datePublished || a.createdAt),
  })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.map((e) => {
  const pair = hreflangPairs.get(e.url);
  const links = pair
    ? `
    <xhtml:link rel="alternate" hreflang="ru" href="${SITE_URL}${pair.ru}"/>
    <xhtml:link rel="alternate" hreflang="uz" href="${SITE_URL}${pair.uz}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${pair.ru}"/>`
    : '';
  return `  <url>
    <loc>${SITE_URL}${e.url}</loc>
    ${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}${links}
  </url>`;
}).join('\n')}
</urlset>
`;

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), xml, 'utf-8');
const withAlternates = entries.filter((e) => hreflangPairs.has(e.url)).length;
console.log(`Sitemap written with ${entries.length} entries (${eligible.length} pages + ${eligibleArticles.length} articles), ${withAlternates} with hreflang alternates → dist/sitemap.xml`);

// Generates /dist/sitemap.xml from published indexable pages AND blog articles.
// Excludes draft / noindex / robotsIndex=false items.
// Emits hreflang (xhtml:link) alternates for RU↔UZ pairs when both
// hreflangRu / hreflangUz fields are present in the content JSON.
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

// --- hreflang helpers -------------------------------------------------------

type Alternates = { ru?: string; uz?: string };

type HreflangFields = { hreflangRu?: string; hreflangUz?: string };

function alternatesOf(item: HreflangFields): Alternates | undefined {
  const alt: Alternates = {};
  if (item.hreflangRu) alt.ru = item.hreflangRu;
  if (item.hreflangUz) alt.uz = item.hreflangUz;
  return alt.ru || alt.uz ? alt : undefined;
}

function hreflangLinks(alt: Alternates): string {
  const lines: string[] = [];
  if (alt.ru) lines.push(`    <xhtml:link rel="alternate" hreflang="ru" href="${SITE_URL}${alt.ru}"/>`);
  if (alt.uz) lines.push(`    <xhtml:link rel="alternate" hreflang="uz" href="${SITE_URL}${alt.uz}"/>`);
  const fallback = alt.ru || alt.uz;
  if (fallback) lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${fallback}"/>`);
  return lines.join('\n');
}

// ----------------------------------------------------------------------------

const latestSiteChange = latestDate([
  ...eligible.map((p) => p.lastReviewedAt || p.updatedAt || p.createdAt),
  ...eligibleArticles.map((a) => a.dateModified || a.updatedAt || a.datePublished || a.createdAt),
]);
const latestRuArticle = latestDate(ruArticles.map((a) => a.dateModified || a.updatedAt || a.datePublished || a.createdAt));
const latestUzArticle = latestDate(uzArticles.map((a) => a.dateModified || a.updatedAt || a.datePublished || a.createdAt));

type Entry = { url: string; lastmod?: string; alternates?: Alternates };

const blogIndexAlternates: Alternates = {};
if (ruArticles.length > 0) blogIndexAlternates.ru = '/ru/blog/';
if (uzArticles.length > 0) blogIndexAlternates.uz = '/uz/blog/';

const entries: Entry[] = [
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
    ? [{ url: '/ru/blog/', lastmod: latestRuArticle, alternates: blogIndexAlternates }]
    : []),
  ...(uzArticles.length > 0
    ? [{ url: '/uz/blog/', lastmod: latestUzArticle, alternates: blogIndexAlternates }]
    : []),
  // Money pages — hreflang alternates from hreflangRu/hreflangUz content fields.
  ...eligible.map((p) => ({
    url: p.url,
    lastmod: dateOnly(p.lastReviewedAt || p.updatedAt || p.createdAt),
    alternates: alternatesOf(p),
  })),
  // Blog articles — same, when an RU↔UZ pair exists.
  ...eligibleArticles.map((a) => ({
    url: a.url,
    lastmod: dateOnly(a.dateModified || a.updatedAt || a.datePublished || a.createdAt),
    alternates: alternatesOf(a),
  })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.map((e) => {
  const altXml = e.alternates ? hreflangLinks(e.alternates) : '';
  return `  <url>
    <loc>${SITE_URL}${e.url}</loc>${altXml ? `\n${altXml}` : ''}
    ${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}
  </url>`;
}).join('\n')}
</urlset>
`;

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), xml, 'utf-8');
const withAlternates = entries.filter((e) => e.alternates && (e.alternates.ru || e.alternates.uz)).length;
console.log(`Sitemap written with ${entries.length} entries (${eligible.length} pages + ${eligibleArticles.length} articles), ${withAlternates} with hreflang alternates → dist/sitemap.xml`);

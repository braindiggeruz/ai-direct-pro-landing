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

const today = new Date().toISOString().split('T')[0];

const ruArticles = eligibleArticles.filter((a) => (a.locale === 'uz' ? 'uz' : 'ru') === 'ru');
const uzArticles = eligibleArticles.filter((a) => a.locale === 'uz');

const entries = [
  // Homepage
  { url: '/', lastmod: today, hrefRu: '/?lang=ru', hrefUz: '/?lang=uz', priority: '1.0' },
  // Blog indexes — emit one per locale that has at least one published article.
  // When both locales have articles, the RU index also advertises its UZ pair
  // (and vice versa) for hreflang reciprocity.
  ...(ruArticles.length > 0
    ? [{ url: '/ru/blog/', lastmod: today, hrefRu: '/ru/blog/', hrefUz: uzArticles.length > 0 ? '/uz/blog/' : undefined, priority: '0.7' }]
    : []),
  ...(uzArticles.length > 0
    ? [{ url: '/uz/blog/', lastmod: today, hrefRu: ruArticles.length > 0 ? '/ru/blog/' : undefined, hrefUz: '/uz/blog/', priority: '0.7' }]
    : []),
  // Money pages
  ...eligible.map((p) => ({
    url: p.url,
    lastmod: (p.updatedAt || p.lastReviewedAt || new Date().toISOString()).split('T')[0],
    hrefRu: p.hreflangRu || undefined,
    hrefUz: p.hreflangUz || undefined,
    priority: '0.8',
  })),
  // Blog articles
  ...eligibleArticles.map((a) => ({
    url: a.url,
    lastmod: (a.dateModified || a.datePublished || a.updatedAt || new Date().toISOString()).split('T')[0],
    hrefRu: a.hreflangRu || undefined,
    hrefUz: a.hreflangUz || undefined,
    priority: '0.6',
  })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.map((e) => `  <url>
    <loc>${SITE_URL}${e.url}</loc>
    <lastmod>${e.lastmod}</lastmod>
    ${e.hrefRu ? `<xhtml:link rel="alternate" hreflang="ru" href="${SITE_URL}${e.hrefRu.replace(/^https?:\/\/[^/]+/, '')}" />` : ''}
    ${e.hrefUz ? `<xhtml:link rel="alternate" hreflang="uz" href="${SITE_URL}${e.hrefUz.replace(/^https?:\/\/[^/]+/, '')}" />` : ''}
    <changefreq>weekly</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), xml, 'utf-8');
console.log(`Sitemap written with ${entries.length} entries (${eligible.length} pages + ${eligibleArticles.length} articles) → dist/sitemap.xml`);

// Generates /dist/sitemap.xml from published indexable pages.
// Excludes draft / noindex / robotsIndex=false pages.
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { Page } from '../src/shared/types';
import { SITE_URL } from '../src/shared/site-config';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const DIST_DIR = path.join(ROOT, 'dist');

const files = fg.sync('pages/**/*.json', { cwd: CONTENT_DIR, absolute: true });
const pages: Page[] = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));

const eligible = pages.filter((p) => p.status === 'published' && p.robotsIndex !== false);

const entries = [
  // Homepage
  { url: '/', lastmod: new Date().toISOString().split('T')[0], hrefRu: '/?lang=ru', hrefUz: '/?lang=uz' },
  ...eligible.map((p) => ({
    url: p.url,
    lastmod: (p.updatedAt || p.lastReviewedAt || new Date().toISOString()).split('T')[0],
    hrefRu: p.hreflangRu || undefined,
    hrefUz: p.hreflangUz || undefined,
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
    <priority>${e.url === '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>
`;

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), xml, 'utf-8');
console.log(`Sitemap written with ${entries.length} entries → dist/sitemap.xml`);

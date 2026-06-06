// Build-time prerender: reads /content/pages/**/*.json and writes static HTML
// files into /dist so that each money/blog page has real server-side content
// (H1, body, FAQ, JSON-LD) discoverable by crawlers.
//
// Pages with status === 'published' are written normally.
// Pages with status === 'noindex' are written but include <meta name=robots noindex>.
// Pages with status === 'draft' are skipped.
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { Page, GlobalSEO, FaqItem, BodyBlock, SchemaType } from '../src/shared/types';
import { SITE_URL } from '../src/shared/site-config';
import { ANALYTICS_HEAD } from './analytics-snippet';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const DIST_DIR = path.join(ROOT, 'dist');

function loadGlobal(): GlobalSEO {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'global', 'site.json'), 'utf-8'));
}

function loadPages(): Page[] {
  const files = fg.sync('pages/**/*.json', { cwd: CONTENT_DIR, absolute: true });
  return files.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8'))) as Page[];
}

// Load published blog articles so each money page can show related posts
// pointing back at it (article.targetMoneyPage === page.url).
import type { BlogArticle } from '../src/shared/types';
function loadPublishedArticles(): BlogArticle[] {
  const files = fg.sync('blog/**/*.json', { cwd: CONTENT_DIR, absolute: true });
  return files
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')) as BlogArticle)
    .filter((a) => a.status === 'published' && a.robotsIndex !== false);
}

function findCssAsset(): string | null {
  const assetsDir = path.join(DIST_DIR, 'assets');
  if (!fs.existsSync(assetsDir)) return null;
  const file = fs.readdirSync(assetsDir).find((f) => f.endsWith('.css'));
  return file ? `/assets/${file}` : null;
}

function findJsAsset(): string | null {
  const assetsDir = path.join(DIST_DIR, 'assets');
  if (!fs.existsSync(assetsDir)) return null;
  // index entry — usually starts with "index-"
  const file = fs.readdirSync(assetsDir).find((f) => f.startsWith('index-') && f.endsWith('.js'));
  return file ? `/assets/${file}` : null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderBlock(b: BodyBlock): string {
  switch (b.type) {
    case 'h2': return `<h2 class="font-display text-3xl sm:text-4xl mt-16 mb-6 text-white">${escapeHtml(b.text || '')}</h2>`;
    case 'h3': return `<h3 class="font-display text-2xl mt-10 mb-4 text-white">${escapeHtml(b.text || '')}</h3>`;
    case 'p': return `<p class="text-base text-white/80 leading-relaxed mb-4">${escapeHtml(b.text || '')}</p>`;
    case 'list': return `<ul class="space-y-3 text-white/80 mb-6">${(b.items || []).map((i) => `<li class="flex gap-3"><span class="text-brand-cyan">→</span><span>${escapeHtml(i)}</span></li>`).join('')}</ul>`;
    case 'quote': return `<blockquote class="border-l-2 border-brand-cyan pl-4 italic text-white/80 my-6">${escapeHtml(b.text || '')}</blockquote>`;
    case 'image': return `<img src="${escapeHtml(b.src || '')}" alt="${escapeHtml(b.alt || '')}" class="rounded-2xl my-6" loading="lazy" />`;
    case 'cta': return `<div class="my-10"><a href="${escapeHtml(b.href || '#')}" class="inline-flex items-center justify-center bg-grad-cta text-bg-base font-semibold px-8 py-4 rounded-full shadow-glow hover:scale-105 transition-transform">${escapeHtml(b.text || 'Запустить')}</a></div>`;
    default: return '';
  }
}

function renderFaq(faq: FaqItem[]): string {
  if (!faq?.length) return '';
  const items = faq.map((f) => `
    <details class="group bg-bg-surface border border-white/10 rounded-2xl p-6 mb-3 open:border-brand-cyan/30">
      <summary class="cursor-pointer font-display text-lg text-white flex justify-between items-center">
        <span>${escapeHtml(f.q)}</span>
        <span class="text-brand-cyan group-open:rotate-45 transition-transform">+</span>
      </summary>
      <p class="text-white/80 mt-4 leading-relaxed">${escapeHtml(f.a)}</p>
    </details>
  `).join('');
  return `<section data-testid="page-faq" class="mt-16"><h2 class="font-display text-3xl sm:text-4xl mb-6 text-white">FAQ</h2>${items}</section>`;
}

function renderInternalLinks(page: Page): string {
  if (!page.internalLinks?.length) return '';
  const items = page.internalLinks.map((l) => `
    <a href="${escapeHtml(l.target)}" class="block bg-bg-surface border border-white/10 rounded-xl p-4 hover:border-brand-cyan/40 transition-colors">
      <div class="text-brand-cyan text-sm mb-1">→</div>
      <div class="text-white font-medium">${escapeHtml(l.anchor)}</div>
    </a>
  `).join('');
  const heading = page.locale === 'uz' ? 'Shuningdek o\u2018qing' : 'Смотрите также';
  return `<section data-testid="related-pages" class="mt-16"><h2 class="font-display text-2xl mb-6 text-white">${escapeHtml(heading)}</h2><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${items}</div></section>`;
}

function renderRelatedArticles(page: Page, articles: BlogArticle[]): string {
  const related = articles.filter((a) => a.targetMoneyPage === page.url).slice(0, 3);
  if (!related.length) return '';
  const badge = page.locale === 'uz' ? 'Maqola' : 'Статья';
  const items = related.map((a) => `
    <a href="${escapeHtml(a.url)}" data-testid="related-article" class="block bg-bg-surface border border-white/10 rounded-xl p-5 hover:border-brand-cyan/40 transition-colors group">
      <div class="text-xs uppercase tracking-wider text-brand-cyan mb-2">${escapeHtml(badge)}</div>
      <div class="text-white font-medium leading-snug group-hover:text-brand-cyan transition-colors">${escapeHtml(a.h1)}</div>
      <div class="text-white/55 text-sm mt-2 line-clamp-3">${escapeHtml(a.description)}</div>
    </a>
  `).join('');
  const heading = page.locale === 'uz' ? 'Foydali maqolalar' : 'Полезные статьи';
  return `<section data-testid="related-articles" class="mt-16"><h2 class="font-display text-2xl mb-6 text-white">${escapeHtml(heading)}</h2><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${items}</div></section>`;
}

function buildJsonLd(page: Page, global: GlobalSEO): string {
  const graph: Record<string, unknown>[] = [];
  const types = new Set<SchemaType>(page.schemaTypes || []);

  if (types.has('Organization')) {
    graph.push({
      '@type': 'Organization',
      '@id': `${global.siteUrl}/#org`,
      name: global.organizationName,
      url: global.siteUrl,
      logo: global.logo,
      sameAs: global.sameAs,
    });
  }
  if (types.has('WebSite')) {
    graph.push({
      '@type': 'WebSite',
      '@id': `${global.siteUrl}/#site`,
      url: global.siteUrl,
      name: global.siteName,
      inLanguage: ['ru', 'uz'],
    });
  }
  if (types.has('BreadcrumbList')) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: global.siteName, item: global.siteUrl },
        { '@type': 'ListItem', position: 2, name: page.breadcrumbLabel || page.h1, item: `${global.siteUrl}${page.url}` },
      ],
    });
  }
  if (types.has('Service') || page.pageType === 'money') {
    const dateModified = page.lastReviewedAt || page.updatedAt;
    graph.push({
      '@type': 'Service',
      name: page.h1 || page.title,
      description: page.description,
      provider: { '@id': `${global.siteUrl}/#org` },
      areaServed: [
        { '@type': 'Country', name: 'Uzbekistan' },
        { '@type': 'City', name: 'Tashkent' },
      ],
      serviceType: page.primaryKeyword,
      url: `${global.siteUrl}${page.url}`,
      ...(dateModified ? { dateModified: new Date(dateModified).toISOString().slice(0, 10) } : {}),
    });
  }
  if (types.has('FAQPage') && page.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: page.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

function renderPage(page: Page, global: GlobalSEO, cssHref: string | null, jsHref: string | null, articles: BlogArticle[] = []): string {
  const fullUrl = `${global.siteUrl}${page.url}`;
  const ogTitle = page.ogTitle || page.title;
  const ogDesc = page.ogDescription || page.description;
  const ogImg = page.ogImage || global.defaultOgImage;
  const robotsContent = [
    page.robotsIndex && page.status !== 'noindex' ? 'index' : 'noindex',
    page.robotsFollow ? 'follow' : 'nofollow',
    'max-image-preview:large',
  ].join(', ');

  const hrefRu = page.hreflangRu ? (page.hreflangRu.startsWith('http') ? page.hreflangRu : `${global.siteUrl}${page.hreflangRu}`) : '';
  const hrefUz = page.hreflangUz ? (page.hreflangUz.startsWith('http') ? page.hreflangUz : `${global.siteUrl}${page.hreflangUz}`) : '';

  // Freshness layer: prefer lastReviewedAt (human-curated) over updatedAt
  // (auto-touched by every admin save). Falls back gracefully to nothing if
  // neither is present. Used by both the visible "Обновлено" badge and the
  // dateModified property in Service JSON-LD.
  const rawModified = page.lastReviewedAt || page.updatedAt || '';
  const modifiedIso = rawModified ? new Date(rawModified).toISOString().slice(0, 10) : '';
  const modifiedLabel = page.locale === 'uz' ? 'Yangilangan' : 'Обновлено';

  // Trust microcopy chips — copy-only, no fake guarantees. Reused below the
  // primary CTA on every money page. Localised per page.locale.
  const trustChips = page.locale === 'uz'
    ? ['RU + UZ', 'Telegram demo', 'Murakkab sozlash yo\u2018q', 'Lid menejerga uzatiladi']
    : ['RU + UZ', 'Telegram demo', 'Без сложной настройки', 'Передаёт обращение менеджеру'];
  const trustHtml = `<ul aria-label="${page.locale === 'uz' ? 'Ishonch belgilari' : 'Trust-маркеры'}" class="flex flex-wrap gap-2 text-xs text-white/70 mt-4 mb-10">${trustChips.map((c) => `<li class="px-3 py-1 rounded-full border border-white/10 bg-white/5">${escapeHtml(c)}</li>`).join('')}</ul>`;

  return `<!doctype html>
<html lang="${page.locale === 'uz' ? 'uz' : 'ru'}">
<head>
<script data-tag="gtm">(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-NLR4WFX8');</script>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#05070D" />
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}" />
<meta name="robots" content="${robotsContent}" />
<link rel="canonical" href="${escapeHtml(page.canonical || fullUrl)}" />
${hrefRu ? `<link rel="alternate" hreflang="ru" href="${escapeHtml(hrefRu)}" />` : ''}
${hrefUz ? `<link rel="alternate" hreflang="uz" href="${escapeHtml(hrefUz)}" />` : ''}
<link rel="alternate" hreflang="x-default" href="${escapeHtml(global.siteUrl)}/" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="${escapeHtml(global.siteName)}" />
<meta property="og:locale" content="${page.locale === 'uz' ? 'uz_UZ' : 'ru_RU'}" />
<meta property="og:url" content="${escapeHtml(fullUrl)}" />
<meta property="og:title" content="${escapeHtml(ogTitle)}" />
<meta property="og:description" content="${escapeHtml(ogDesc)}" />
${ogImg ? `<meta property="og:image" content="${escapeHtml(ogImg)}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
<meta name="twitter:description" content="${escapeHtml(ogDesc)}" />
${ogImg ? `<meta name="twitter:image" content="${escapeHtml(ogImg)}" />` : ''}

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="icon" type="image/png" href="/assets/landing/2.png" />
${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ''}

<script type="application/ld+json">${buildJsonLd(page, global)}</script>
${ANALYTICS_HEAD}
</head>
<body class="bg-bg-base text-white antialiased">
<noscript data-tag="gtm"><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-NLR4WFX8" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<header class="border-b border-white/5 bg-bg-base/80 backdrop-blur sticky top-0 z-40">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
    <a href="/" class="font-display text-xl text-white" data-testid="back-home">${escapeHtml(global.siteName)}</a>
    <nav class="flex gap-3 text-sm">
      ${hrefRu ? `<a href="${escapeHtml(hrefRu)}" hreflang="ru" class="text-white/70 hover:text-white">RU</a>` : ''}
      ${hrefUz ? `<a href="${escapeHtml(hrefUz)}" hreflang="uz" class="text-white/70 hover:text-white">UZ</a>` : ''}
      <a href="${escapeHtml(page.ctaPrimaryHref || global.defaultCTA.href)}" class="bg-grad-cta text-bg-base font-semibold px-4 py-2 rounded-full">
        ${escapeHtml(page.ctaPrimaryLabel || global.defaultCTA.label)}
      </a>
    </nav>
  </div>
</header>

<main class="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
  <nav aria-label="Breadcrumb" class="text-sm text-white/50 mb-6">
    <a href="/" class="hover:text-white">${escapeHtml(global.siteName)}</a>
    <span class="px-2">/</span>
    <span class="text-white/70">${escapeHtml(page.breadcrumbLabel || page.h1)}</span>
  </nav>

  <h1 data-testid="page-h1" class="font-display text-4xl sm:text-5xl lg:text-6xl text-white mb-6 leading-tight">${escapeHtml(page.h1)}</h1>
  ${modifiedIso ? `<p data-testid="page-updated" class="text-xs uppercase tracking-wider text-white/40 mb-4">${escapeHtml(modifiedLabel)} <time datetime="${modifiedIso}">${escapeHtml(modifiedIso)}</time></p>` : ''}
  ${page.heroSubtitle ? `<p class="text-lg text-white/80 mb-8 max-w-2xl">${escapeHtml(page.heroSubtitle)}</p>` : ''}

  ${page.ctaPrimaryHref ? `<div class="flex flex-wrap gap-3 mb-4">
    <a data-testid="page-cta-primary" href="${escapeHtml(page.ctaPrimaryHref)}" class="bg-grad-cta text-bg-base font-semibold px-8 py-4 rounded-full shadow-glow">
      ${escapeHtml(page.ctaPrimaryLabel || 'Демо')}
    </a>
    ${page.ctaSecondaryHref ? `<a href="${escapeHtml(page.ctaSecondaryHref)}" class="border border-white/15 text-white px-8 py-4 rounded-full hover:bg-white/5">${escapeHtml(page.ctaSecondaryLabel || '')}</a>` : ''}
  </div>
  ${trustHtml}` : ''}

  <article class="prose-invert">
    ${(page.bodyBlocks || []).map(renderBlock).join('\n')}
  </article>

  ${renderFaq(page.faq || [])}
  ${renderInternalLinks(page)}
  ${renderRelatedArticles(page, articles)}
</main>

<footer class="border-t border-white/5 mt-20 py-10">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-white/50">
    <span>${escapeHtml(global.siteName)} · ${escapeHtml(global.address || '')}</span>
    <a href="${escapeHtml(global.telegram || '#')}" class="hover:text-white">Telegram</a>
  </div>
</footer>

${jsHref ? `<!-- React landing bundle is intentionally not loaded on money pages to keep them static and fast. -->` : ''}
</body>
</html>
`;
}

async function main() {
  const global = loadGlobal();
  const pages = loadPages();
  const articles = loadPublishedArticles();
  const cssHref = findCssAsset();
  const jsHref = findJsAsset();
  let written = 0, skipped = 0;
  for (const page of pages) {
    if (page.status === 'draft') { skipped++; continue; }
    const outPath = path.join(DIST_DIR, page.url, 'index.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, renderPage(page, global, cssHref, jsHref, articles), 'utf-8');
    written++;
    console.log(`  + ${outPath.replace(DIST_DIR, 'dist')}`);
  }
  console.log(`Prerendered ${written} page(s), skipped ${skipped} draft(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });

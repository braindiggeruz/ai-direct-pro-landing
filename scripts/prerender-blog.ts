// scripts/prerender-blog.ts
//
// Build-time blog prerender. Reads /content/blog/**/*.json (BlogArticle
// shape), renders static HTML for each published article into
// /dist/ru/blog/<slug>/index.html, and emits a blog landing page at
// /dist/ru/blog/index.html with cards for all published articles.
//
// Articles use Article + FAQPage + BreadcrumbList schemas (Service is NOT
// used here, since blog content is informational rather than commercial).
//
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { BlogArticle, GlobalSEO, FaqItem, BodyBlock } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const DIST_DIR = path.join(ROOT, 'dist');

function loadGlobal(): GlobalSEO {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'global', 'site.json'), 'utf-8'));
}

function loadArticles(): BlogArticle[] {
  const files = fg.sync('blog/**/*.json', { cwd: CONTENT_DIR, absolute: true });
  return files.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')) as BlogArticle);
}

function findCssAsset(): string | null {
  const assetsDir = path.join(DIST_DIR, 'assets');
  if (!fs.existsSync(assetsDir)) return null;
  const f = fs.readdirSync(assetsDir).find((x) => x.endsWith('.css'));
  return f ? `/assets/${f}` : null;
}

function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderBlock(b: BodyBlock): string {
  switch (b.type) {
    case 'h2': return `<h2 class="font-display text-3xl sm:text-4xl mt-14 mb-5 text-white">${escapeHtml(b.text || '')}</h2>`;
    case 'h3': return `<h3 class="font-display text-2xl mt-10 mb-4 text-white">${escapeHtml(b.text || '')}</h3>`;
    case 'p': return `<p class="text-base text-white/80 leading-relaxed mb-5">${escapeHtml(b.text || '')}</p>`;
    case 'list': return `<ul class="space-y-3 text-white/80 mb-6 pl-1">${(b.items || []).map((i) => `<li class="flex gap-3"><span class="text-brand-cyan shrink-0">→</span><span>${escapeHtml(i)}</span></li>`).join('')}</ul>`;
    case 'quote': return `<blockquote class="border-l-2 border-brand-cyan pl-5 italic text-white/85 my-8 text-lg">${escapeHtml(b.text || '')}</blockquote>`;
    case 'cta': return `<div class="my-10"><a data-testid="article-cta-inline" href="${escapeHtml(b.href || '#')}" class="inline-flex items-center justify-center bg-grad-cta text-bg-base font-semibold px-7 py-4 rounded-full shadow-glow hover:scale-105 transition-transform">${escapeHtml(b.text || 'Запустить')}</a></div>`;
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
  return `<section data-testid="article-faq" class="mt-16"><h2 class="font-display text-3xl sm:text-4xl mb-6 text-white">Частые вопросы</h2>${items}</section>`;
}

function renderInternalLinks(a: BlogArticle): string {
  if (!a.internalLinks?.length) return '';
  const items = a.internalLinks.map((l) => `
    <a href="${escapeHtml(l.target)}" data-testid="article-related-link" class="block bg-bg-surface border border-white/10 rounded-xl p-4 hover:border-brand-cyan/40 transition-colors">
      <div class="text-brand-cyan text-sm mb-1">→</div>
      <div class="text-white font-medium">${escapeHtml(l.anchor)}</div>
    </a>
  `).join('');
  return `<section data-testid="article-related" class="mt-16"><h2 class="font-display text-2xl mb-6 text-white">Смотрите также</h2><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${items}</div></section>`;
}

function buildJsonLd(a: BlogArticle, global: GlobalSEO): string {
  const fullUrl = `${global.siteUrl}${a.url}`;
  const graph: Record<string, unknown>[] = [];
  graph.push({
    '@type': 'Organization',
    '@id': `${global.siteUrl}/#org`,
    name: global.organizationName,
    url: global.siteUrl,
    logo: global.logo,
    sameAs: global.sameAs,
  });
  graph.push({
    '@type': 'WebSite',
    '@id': `${global.siteUrl}/#site`,
    url: global.siteUrl,
    name: global.siteName,
    inLanguage: ['ru', 'uz'],
  });
  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: global.siteName, item: global.siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Блог', item: `${global.siteUrl}/ru/blog/` },
      { '@type': 'ListItem', position: 3, name: a.h1, item: fullUrl },
    ],
  });
  graph.push({
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    inLanguage: a.locale === 'uz' ? 'uz' : 'ru',
    author: { '@type': 'Organization', name: a.author || global.organizationName },
    publisher: { '@id': `${global.siteUrl}/#org` },
    datePublished: a.datePublished || a.createdAt,
    dateModified: a.dateModified || a.updatedAt || a.datePublished,
    mainEntityOfPage: fullUrl,
    image: a.ogImage || global.defaultOgImage,
    keywords: (a.keywords || []).join(', '),
    articleSection: a.topicCluster,
  });
  if (a.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: a.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

function renderArticle(a: BlogArticle, global: GlobalSEO, cssHref: string | null): string {
  const fullUrl = `${global.siteUrl}${a.url}`;
  const ogTitle = a.ogTitle || a.title;
  const ogDesc = a.ogDescription || a.description;
  const ogImg = a.ogImage || global.defaultOgImage;
  const robotsContent = [
    a.robotsIndex && a.status !== 'noindex' ? 'index' : 'noindex',
    a.robotsFollow ? 'follow' : 'nofollow',
    'max-image-preview:large',
  ].join(', ');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#05070D" />
<title>${escapeHtml(a.title)}</title>
<meta name="description" content="${escapeHtml(a.description)}" />
<meta name="robots" content="${robotsContent}" />
<link rel="canonical" href="${escapeHtml(a.canonical || fullUrl)}" />
<link rel="alternate" hreflang="ru" href="${escapeHtml(fullUrl)}" />
<link rel="alternate" hreflang="x-default" href="${escapeHtml(global.siteUrl)}/" />

<meta property="og:type" content="article" />
<meta property="og:site_name" content="${escapeHtml(global.siteName)}" />
<meta property="og:locale" content="ru_RU" />
<meta property="og:url" content="${escapeHtml(fullUrl)}" />
<meta property="og:title" content="${escapeHtml(ogTitle)}" />
<meta property="og:description" content="${escapeHtml(ogDesc)}" />
${ogImg ? `<meta property="og:image" content="${escapeHtml(ogImg)}" />` : ''}
<meta property="article:published_time" content="${escapeHtml(a.datePublished || '')}" />
<meta property="article:modified_time" content="${escapeHtml(a.dateModified || a.datePublished || '')}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
<meta name="twitter:description" content="${escapeHtml(ogDesc)}" />
${ogImg ? `<meta name="twitter:image" content="${escapeHtml(ogImg)}" />` : ''}

<link rel="icon" type="image/png" href="/assets/landing/2.png" />
${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ''}

<script type="application/ld+json">${buildJsonLd(a, global)}</script>
</head>
<body class="bg-bg-base text-white antialiased">
<header class="border-b border-white/5 bg-bg-base/80 backdrop-blur sticky top-0 z-40">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
    <a href="/" class="font-display text-xl text-white">${escapeHtml(global.siteName)}</a>
    <nav class="flex gap-3 text-sm items-center">
      <a href="/ru/blog/" data-testid="header-blog" class="text-white/70 hover:text-white">Блог</a>
      <a href="${escapeHtml(a.cta?.href || global.defaultCTA.href)}" data-testid="header-cta" class="bg-grad-cta text-bg-base font-semibold px-4 py-2 rounded-full">
        ${escapeHtml(a.cta?.label || global.defaultCTA.label)}
      </a>
    </nav>
  </div>
</header>

<main class="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
  <nav aria-label="Breadcrumb" data-testid="article-breadcrumb" class="text-sm text-white/50 mb-6">
    <a href="/" class="hover:text-white">${escapeHtml(global.siteName)}</a>
    <span class="px-2">/</span>
    <a href="/ru/blog/" class="hover:text-white">Блог</a>
    <span class="px-2">/</span>
    <span class="text-white/70">${escapeHtml(a.h1.slice(0, 50))}${a.h1.length > 50 ? '…' : ''}</span>
  </nav>

  <article>
    <h1 data-testid="article-h1" class="font-display text-3xl sm:text-5xl text-white mb-6 leading-tight">${escapeHtml(a.h1)}</h1>
    <p data-testid="article-meta" class="text-sm text-white/50 mb-10">${escapeHtml(a.author || 'GPTBot Team')} · ${escapeHtml(a.datePublished || '')}</p>
    <div class="prose-invert">
      ${(a.body || []).map(renderBlock).join('\n')}
    </div>
  </article>

  ${a.cta ? `<div class="mt-12 mb-4"><a data-testid="article-cta-end" href="${escapeHtml(a.cta.href)}" class="inline-flex items-center justify-center bg-grad-cta text-bg-base font-semibold px-8 py-4 rounded-full shadow-glow">${escapeHtml(a.cta.label)}</a></div>` : ''}
  ${renderFaq(a.faq || [])}
  ${renderInternalLinks(a)}
</main>

<footer class="border-t border-white/5 mt-20 py-10">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-white/50">
    <span>${escapeHtml(global.siteName)} · ${escapeHtml(global.address || '')}</span>
    <div class="flex gap-4">
      <a href="/ru/blog/" class="hover:text-white">Блог</a>
      <a href="${escapeHtml(global.telegram || '#')}" class="hover:text-white">Telegram</a>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

function renderBlogIndex(articles: BlogArticle[], global: GlobalSEO, cssHref: string | null): string {
  const cards = articles.map((a) => `
    <a href="${escapeHtml(a.url)}" data-testid="blog-card" class="block bg-bg-surface border border-white/10 rounded-2xl p-6 hover:border-brand-cyan/40 transition-colors group">
      <div class="text-xs uppercase tracking-wider text-brand-cyan mb-2">${escapeHtml(a.topicCluster || 'Блог')}</div>
      <h2 class="font-display text-xl text-white mb-3 group-hover:text-brand-cyan transition-colors">${escapeHtml(a.h1)}</h2>
      <p class="text-sm text-white/70 leading-relaxed mb-4">${escapeHtml(a.description)}</p>
      <span class="text-sm text-brand-cyan">Читать →</span>
    </a>
  `).join('');

  const ldGraph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': `${global.siteUrl}/#org`,
      name: global.organizationName,
      url: global.siteUrl,
      logo: global.logo,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: global.siteName, item: global.siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Блог', item: `${global.siteUrl}/ru/blog/` },
      ],
    },
    {
      '@type': 'CollectionPage',
      url: `${global.siteUrl}/ru/blog/`,
      name: 'Блог GPTBot',
      description: 'Статьи о AI-ботах, автоматизации заявок и продажах в Telegram и Instagram для бизнеса в Узбекистане.',
      inLanguage: 'ru',
    },
  ];

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#05070D" />
<title>Блог GPTBot — AI-боты и автоматизация заявок | GPTBot</title>
<meta name="description" content="Статьи о AI-ботах, GPT-консультантах, автоматизации заявок и продаж в Telegram и Instagram. Подходит малому и среднему бизнесу в Узбекистане." />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${global.siteUrl}/ru/blog/" />
<link rel="alternate" hreflang="ru" href="${global.siteUrl}/ru/blog/" />
<link rel="alternate" hreflang="x-default" href="${global.siteUrl}/" />

<meta property="og:type" content="website" />
<meta property="og:url" content="${global.siteUrl}/ru/blog/" />
<meta property="og:title" content="Блог GPTBot — AI-боты и автоматизация заявок" />
<meta property="og:description" content="Статьи о AI-ботах и автоматизации заявок в Telegram и Instagram для бизнеса в Узбекистане." />
<meta property="og:image" content="${global.defaultOgImage}" />

<link rel="icon" type="image/png" href="/assets/landing/2.png" />
${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ''}

<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': ldGraph })}</script>
</head>
<body class="bg-bg-base text-white antialiased">
<header class="border-b border-white/5 bg-bg-base/80 backdrop-blur sticky top-0 z-40">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
    <a href="/" class="font-display text-xl text-white">${escapeHtml(global.siteName)}</a>
    <nav class="flex gap-3 text-sm items-center">
      <a href="/ru/blog/" data-testid="header-blog-active" class="text-brand-cyan">Блог</a>
      <a href="${escapeHtml(global.defaultCTA.href)}" data-testid="header-cta" class="bg-grad-cta text-bg-base font-semibold px-4 py-2 rounded-full">${escapeHtml(global.defaultCTA.label)}</a>
    </nav>
  </div>
</header>

<main class="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
  <nav aria-label="Breadcrumb" class="text-sm text-white/50 mb-6">
    <a href="/" class="hover:text-white">${escapeHtml(global.siteName)}</a>
    <span class="px-2">/</span>
    <span class="text-white/70">Блог</span>
  </nav>
  <h1 data-testid="blog-h1" class="font-display text-4xl sm:text-5xl text-white mb-4">Блог GPTBot</h1>
  <p data-testid="blog-subtitle" class="text-white/70 mb-12 max-w-2xl">Реальные сценарии, ограничения и шаги внедрения AI-ботов для бизнеса в Узбекистане. Без обещаний топ-3 и без выдуманных кейсов.</p>
  <section data-testid="blog-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    ${cards}
  </section>
</main>

<footer class="border-t border-white/5 mt-20 py-10">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-white/50">
    <span>${escapeHtml(global.siteName)} · ${escapeHtml(global.address || '')}</span>
    <a href="${escapeHtml(global.telegram || '#')}" class="hover:text-white">Telegram</a>
  </div>
</footer>
</body>
</html>
`;
}

async function main() {
  const global = loadGlobal();
  const articles = loadArticles();
  const published = articles.filter((a) => a.status === 'published' && a.robotsIndex !== false);
  const cssHref = findCssAsset();
  let written = 0;
  for (const a of published) {
    const outPath = path.join(DIST_DIR, a.url, 'index.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, renderArticle(a, global, cssHref), 'utf-8');
    written++;
    console.log(`  + ${outPath.replace(DIST_DIR, 'dist')}`);
  }
  // Blog index — sorted by datePublished desc.
  const sorted = [...published].sort((x, y) => (y.datePublished || '').localeCompare(x.datePublished || ''));
  const indexPath = path.join(DIST_DIR, 'ru', 'blog', 'index.html');
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, renderBlogIndex(sorted, global, cssHref), 'utf-8');
  console.log(`  + dist/ru/blog/index.html (${published.length} cards)`);
  console.log(`Prerendered ${written} article(s), 1 blog index, skipped ${articles.length - published.length} draft(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });

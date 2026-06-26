// scripts/prerender-blog.ts
//
// Build-time blog prerender. Reads /content/blog/**/*.json (BlogArticle
// shape), renders static HTML for each published article into
// /dist/<locale>/blog/<slug>/index.html, and emits blog landing pages at
// /dist/ru/blog/index.html and /dist/uz/blog/index.html.
//
// Articles use Article + FAQPage + BreadcrumbList schemas (Service is NOT
// used here, since blog content is informational rather than commercial).
//
// Locale-aware: <html lang>, breadcrumb labels, FAQ heading, "Обновлено"
// label, og:locale, inLanguage, and reciprocal RU↔UZ hreflang are all
// driven from the article's `locale` + `hreflangRu` / `hreflangUz` fields.
//
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { BlogArticle, GlobalSEO, FaqItem, BodyBlock } from '../src/shared/types';
import { ANALYTICS_HEAD } from './analytics-snippet';
import {
  buildOrganizationLd,
  buildWebSiteLd,
  buildBreadcrumbLd,
} from './jsonld-helpers';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const DIST_DIR = path.join(ROOT, 'dist');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Read intrinsic dimensions of a local PNG/JPEG without external deps.
// Returns null for remote-only assets so we never emit wrong dimensions.
const _ogDimCache = new Map<string, { w: number; h: number } | null>();
function getImageDims(src: string | undefined): { w: number; h: number } | null {
  if (!src) return null;
  if (_ogDimCache.has(src)) return _ogDimCache.get(src)!;
  let rel = src;
  try {
    if (/^https?:\/\//i.test(src)) rel = new URL(src).pathname;
  } catch {
    /* keep rel */
  }
  rel = rel.replace(/^\/+/, '');
  for (const file of [path.join(PUBLIC_DIR, rel), path.join(DIST_DIR, rel)]) {
    try {
      const dims = parseImageDims(fs.readFileSync(file));
      if (dims) {
        _ogDimCache.set(src, dims);
        return dims;
      }
    } catch {
      /* try next */
    }
  }
  _ogDimCache.set(src, null);
  return null;
}

function parseImageDims(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(off + 7), h: buf.readUInt16BE(off + 5) };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
  }
  return null;
}

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

// For visible element text content. Apostrophes are legitimate in Uzbek Latin and
// must NOT become &#39; — only & and < are unsafe inside text nodes.
function escapeText(s: string): string {
  return (s || '').replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' }[c]!));
}

// Localised UI strings used in blog templates.
const STRINGS = {
  ru: {
    blog: 'Блог',
    blogTitle: 'Блог GPTBot',
    blogIndexTitle: 'Блог GPTBot — AI-боты и автоматизация заявок | GPTBot',
    blogIndexDesc: 'Статьи о AI-ботах, GPT-консультантах, автоматизации заявок и продаж в Telegram и Instagram. Подходит малому и среднему бизнесу в Узбекистане.',
    blogIndexOgTitle: 'Блог GPTBot — AI-боты и автоматизация заявок',
    blogIndexOgDesc: 'Статьи о AI-ботах и автоматизации заявок в Telegram и Instagram для бизнеса в Узбекистане.',
    blogIndexH1Subtitle: 'Реальные сценарии, ограничения и шаги внедрения AI-ботов для бизнеса в Узбекистане. Без обещаний топ-3 и без выдуманных кейсов.',
    faqHeading: 'Частые вопросы',
    relatedHeading: 'Смотрите также',
    updated: 'Обновлено',
    read: 'Читать →',
  },
  uz: {
    blog: 'Blog',
    blogTitle: 'GPTBot blogi',
    blogIndexTitle: 'GPTBot blogi — AI botlar va arizalar avtomatlashtirish',
    blogIndexDesc: 'O\u2018zbekistondagi biznes uchun AI-botlar, GPT-konsultantlar, Telegram va Instagram orqali arizalar va savdoni avtomatlashtirish haqida maqolalar.',
    blogIndexOgTitle: 'GPTBot blogi — AI botlar va arizalar avtomatlashtirish',
    blogIndexOgDesc: 'O\u2018zbekistondagi biznes uchun Telegram va Instagram orqali AI-botlar va arizalarni avtomatlashtirish haqida maqolalar.',
    blogIndexH1Subtitle: 'O\u2018zbekistondagi biznes uchun AI-botlarni joriy etishning amaliy ssenariylari, cheklovlari va qadamlari. Yolg\u2018on top-3 va\u2019dalarsiz, soxta keyssiz.',
    faqHeading: 'Tez-tez beriladigan savollar',
    relatedHeading: 'Shuningdek o\u2018qing',
    updated: 'Yangilangan',
    read: 'O\u2018qish →',
  },
} as const;

function L(a: { locale?: string }): typeof STRINGS.ru {
  return a.locale === 'uz' ? STRINGS.uz : STRINGS.ru;
}

function renderBlock(b: BodyBlock): string {
  switch (b.type) {
    case 'h2': return `<h2 class="font-display text-3xl sm:text-4xl mt-14 mb-5 text-white">${escapeText(b.text || '')}</h2>`;
    case 'h3': return `<h3 class="font-display text-2xl mt-10 mb-4 text-white">${escapeText(b.text || '')}</h3>`;
    case 'p': return `<p class="text-base text-white/80 leading-relaxed mb-5">${escapeText(b.text || '')}</p>`;
    case 'list': return `<ul class="space-y-3 text-white/80 mb-6 pl-1">${(b.items || []).map((i) => `<li class="flex gap-3"><span class="text-brand-cyan shrink-0">→</span><span>${escapeText(i)}</span></li>`).join('')}</ul>`;
    case 'quote': return `<blockquote class="border-l-2 border-brand-cyan pl-5 italic text-white/85 my-8 text-lg">${escapeText(b.text || '')}</blockquote>`;
    case 'cta': return `<div class="my-10"><a data-testid="article-cta-inline" href="${escapeHtml(b.href || '#')}" class="inline-flex items-center justify-center bg-grad-cta text-bg-base font-semibold px-7 py-4 rounded-full shadow-glow hover:scale-105 transition-transform">${escapeText(b.text || 'Запустить')}</a></div>`;
    default: return '';
  }
}

function renderFaq(faq: FaqItem[], a: BlogArticle): string {
  if (!faq?.length) return '';
  const items = faq.map((f) => `
    <details class="group bg-bg-surface border border-white/10 rounded-2xl p-6 mb-3 open:border-brand-cyan/30">
      <summary class="cursor-pointer font-display text-lg text-white flex justify-between items-center">
        <span>${escapeText(f.q)}</span>
        <span class="text-brand-cyan group-open:rotate-45 transition-transform">+</span>
      </summary>
      <p class="text-white/80 mt-4 leading-relaxed">${escapeText(f.a)}</p>
    </details>
  `).join('');
  return `<section data-testid="article-faq" class="mt-16"><h2 class="font-display text-3xl sm:text-4xl mb-6 text-white">${escapeText(L(a).faqHeading)}</h2>${items}</section>`;
}

function renderInternalLinks(a: BlogArticle): string {
  if (!a.internalLinks?.length) return '';
  const items = a.internalLinks.map((l) => `
    <a href="${escapeHtml(l.target)}" data-testid="article-related-link" class="block bg-bg-surface border border-white/10 rounded-xl p-4 hover:border-brand-cyan/40 transition-colors">
      <div class="text-brand-cyan text-sm mb-1">→</div>
      <div class="text-white font-medium">${escapeText(l.anchor)}</div>
    </a>
  `).join('');
  return `<section data-testid="article-related" class="mt-16"><h2 class="font-display text-2xl mb-6 text-white">${escapeText(L(a).relatedHeading)}</h2><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${items}</div></section>`;
}

function buildJsonLd(a: BlogArticle, global: GlobalSEO): string {
  const fullUrl = `${global.siteUrl}${a.url}`;
  const blogIndexUrl = `${global.siteUrl}/${a.locale === 'uz' ? 'uz' : 'ru'}/blog/`;
  const blogIndexName = L(a).blog;
  const graph: Record<string, unknown>[] = [];
  graph.push(buildOrganizationLd(global));
  graph.push(buildWebSiteLd(global));
  graph.push(buildBreadcrumbLd([
    { name: global.siteName, item: `${global.siteUrl}/` },
    { name: blogIndexName, item: blogIndexUrl },
    { name: a.h1, item: fullUrl },
  ]));
  graph.push({
    '@type': 'Article',
    '@id': `${fullUrl}#article`,
    headline: a.title,
    name: a.h1,
    description: a.description,
    inLanguage: a.locale === 'uz' ? 'uz' : 'ru',
    isPartOf: { '@id': `${global.siteUrl}/#site` },
    about: { '@id': `${global.siteUrl}/#org` },
    author: { '@type': 'Organization', '@id': `${global.siteUrl}/#org`, name: a.author || global.organizationName, url: `${global.siteUrl}/` },
    publisher: { '@id': `${global.siteUrl}/#org` },
    datePublished: a.datePublished || a.createdAt,
    dateModified: a.dateModified || a.updatedAt || a.datePublished,
    mainEntityOfPage: fullUrl,
    image: a.ogImage || global.defaultOgImage,
    keywords: (a.keywords || []).join(', '),
    articleSection: a.topicCluster,
    audience: { '@type': 'BusinessAudience', audienceType: 'Small and medium business in Uzbekistan' },
  });
  if (a.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${fullUrl}#faq`,
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
  const ogDims = getImageDims(ogImg);
  const lang = a.locale === 'uz' ? 'uz' : 'ru';
  const ogLocale = a.locale === 'uz' ? 'uz_UZ' : 'ru_RU';
  const t = L(a);
  const robotsContent = [
    a.robotsIndex && a.status !== 'noindex' ? 'index' : 'noindex',
    a.robotsFollow ? 'follow' : 'nofollow',
    'max-image-preview:large',
  ].join(', ');
  const blogIndexHref = `/${lang}/blog/`;

  // Build hreflang block from explicit fields. If hreflangRu / hreflangUz
  // are missing, fall back to self for the current locale only.
  const hrefRu = a.hreflangRu ? (a.hreflangRu.startsWith('http') ? a.hreflangRu : `${global.siteUrl}${a.hreflangRu}`) : (lang === 'ru' ? fullUrl : '');
  const hrefUz = a.hreflangUz ? (a.hreflangUz.startsWith('http') ? a.hreflangUz : `${global.siteUrl}${a.hreflangUz}`) : (lang === 'uz' ? fullUrl : '');

  return `<!doctype html>
<html lang="${lang}">
<head>
<script data-tag="gtm">(function(w,d,s,l,i){w[l]=w[l]||[];var started=false;function loadGTM(){if(started)return;started=true;w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);}var evs=['scroll','pointerdown','keydown','touchstart','mousemove'];function onInt(){evs.forEach(function(e){w.removeEventListener(e,onInt)});loadGTM();}evs.forEach(function(e){w.addEventListener(e,onInt,{passive:true,once:true})});if(d.readyState==='complete'){setTimeout(loadGTM,4000);}else{w.addEventListener('load',function(){setTimeout(loadGTM,4000)});}})(window,document,'script','dataLayer','GTM-NLR4WFX8');</script>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#05070D" />
<title>${escapeText(a.title)}</title>
<meta name="description" content="${escapeHtml(a.description)}" />
<meta name="robots" content="${robotsContent}" />
<link rel="canonical" href="${escapeHtml(a.canonical || fullUrl)}" />
${hrefRu ? `<link rel="alternate" hreflang="ru" href="${escapeHtml(hrefRu)}" />` : ''}
${hrefUz ? `<link rel="alternate" hreflang="uz" href="${escapeHtml(hrefUz)}" />` : ''}
<link rel="alternate" hreflang="x-default" href="${escapeHtml(global.siteUrl)}/" />

<meta property="og:type" content="article" />
<meta property="og:site_name" content="${escapeHtml(global.siteName)}" />
<meta property="og:locale" content="${ogLocale}" />
<meta property="og:url" content="${escapeHtml(fullUrl)}" />
<meta property="og:title" content="${escapeHtml(ogTitle)}" />
<meta property="og:description" content="${escapeHtml(ogDesc)}" />
${ogImg ? `<meta property="og:image" content="${escapeHtml(ogImg)}" />` : ''}
${ogImg && ogDims ? `<meta property="og:image:width" content="${ogDims.w}" />` : ''}
${ogImg && ogDims ? `<meta property="og:image:height" content="${ogDims.h}" />` : ''}
<meta property="article:published_time" content="${escapeHtml(a.datePublished || '')}" />
<meta property="article:modified_time" content="${escapeHtml(a.dateModified || a.datePublished || '')}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
<meta name="twitter:description" content="${escapeHtml(ogDesc)}" />
${ogImg ? `<meta name="twitter:image" content="${escapeHtml(ogImg)}" />` : ''}

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" media="print" onload="this.media='all'" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" /></noscript>
<link rel="llms" href="${escapeHtml(global.siteUrl)}/llms.txt" />
<link rel="icon" type="image/png" href="/assets/landing/2.png" />
${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ''}

<script type="application/ld+json">${buildJsonLd(a, global)}</script>
${ANALYTICS_HEAD}
</head>
<body class="bg-bg-base text-white antialiased">
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-bg-base focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:border focus:border-brand-cyan">${lang === 'uz' ? 'Asosiy kontentga o\u2018tish' : 'Перейти к основному контенту'}</a>
<noscript data-tag="gtm"><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-NLR4WFX8" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<header class="border-b border-white/5 bg-bg-base/80 backdrop-blur sticky top-0 z-40">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
    <a href="/" class="font-display text-xl text-white">${escapeHtml(global.siteName)}</a>
    <nav class="flex gap-3 text-sm items-center">
      <a href="${blogIndexHref}" data-testid="header-blog" class="text-white/70 hover:text-white">${escapeHtml(t.blog)}</a>
      <a href="${escapeHtml(a.cta?.href || global.defaultCTA.href)}" data-testid="header-cta" class="bg-grad-cta text-bg-base font-semibold px-4 py-2 rounded-full">
        ${escapeHtml(a.cta?.label || global.defaultCTA.label)}
      </a>
    </nav>
  </div>
</header>

<main id="main" class="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
  <nav aria-label="Breadcrumb" data-testid="article-breadcrumb" class="text-sm text-white/50 mb-6">
    <a href="/" class="hover:text-white">${escapeHtml(global.siteName)}</a>
    <span class="px-2">/</span>
    <a href="${blogIndexHref}" class="hover:text-white">${escapeHtml(t.blog)}</a>
    <span class="px-2">/</span>
    <span class="text-white/70">${escapeText(a.h1.slice(0, 50))}${a.h1.length > 50 ? '…' : ''}</span>
  </nav>

  <article>
    <h1 data-testid="article-h1" class="font-display text-3xl sm:text-5xl text-white mb-6 leading-tight">${escapeText(a.h1)}</h1>
    <p data-testid="article-meta" class="text-sm text-white/50 mb-2">${escapeHtml(a.author || 'GPTBot Team')} · ${escapeHtml(a.datePublished || '')}</p>
    ${(a.dateModified || a.updatedAt) ? `<p data-testid="article-updated" class="text-xs uppercase tracking-wider text-white/40 mb-10">${escapeHtml(t.updated)} <time datetime="${escapeHtml(new Date(a.dateModified || a.updatedAt!).toISOString().slice(0, 10))}">${escapeHtml(new Date(a.dateModified || a.updatedAt!).toISOString().slice(0, 10))}</time></p>` : '<div class="mb-10"></div>'}
    <div class="prose-invert">
      ${(a.body || []).map(renderBlock).join('\n')}
    </div>
  </article>

  ${a.cta ? `<div class="mt-12 mb-4"><a data-testid="article-cta-end" href="${escapeHtml(a.cta.href)}" class="inline-flex items-center justify-center bg-grad-cta text-bg-base font-semibold px-8 py-4 rounded-full shadow-glow">${escapeHtml(a.cta.label)}</a></div>` : ''}
  ${renderFaq(a.faq || [], a)}
  ${renderInternalLinks(a)}
</main>

<footer class="border-t border-white/5 mt-20 py-10">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-white/50">
    <span>${escapeHtml(global.siteName)} · ${escapeHtml(global.address || '')}</span>
    <div class="flex gap-4">
      <a href="${blogIndexHref}" class="hover:text-white">${escapeHtml(t.blog)}</a>
      <a href="${escapeHtml(global.telegram || '#')}" class="hover:text-white">Telegram</a>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

function renderBlogIndex(articles: BlogArticle[], locale: 'ru' | 'uz', global: GlobalSEO, cssHref: string | null): string {
  const t = STRINGS[locale];
  const ogLocale = locale === 'uz' ? 'uz_UZ' : 'ru_RU';
  const indexUrl = `${global.siteUrl}/${locale}/blog/`;

  const cards = articles.map((a) => `
    <a href="${escapeHtml(a.url)}" data-testid="blog-card" class="block bg-bg-surface border border-white/10 rounded-2xl p-6 hover:border-brand-cyan/40 transition-colors group">
      <div class="text-xs uppercase tracking-wider text-brand-cyan mb-2">${escapeHtml(a.topicCluster || t.blog)}</div>
      <h2 class="font-display text-xl text-white mb-3 group-hover:text-brand-cyan transition-colors">${escapeText(a.h1)}</h2>
      <p class="text-sm text-white/70 leading-relaxed mb-4">${escapeText(a.description)}</p>
      <span class="text-sm text-brand-cyan">${escapeHtml(t.read)}</span>
    </a>
  `).join('');

  const ldGraph: Record<string, unknown>[] = [
    buildOrganizationLd(global),
    buildWebSiteLd(global),
    buildBreadcrumbLd([
      { name: global.siteName, item: `${global.siteUrl}/` },
      { name: t.blog, item: indexUrl },
    ]),
    {
      '@type': 'CollectionPage',
      '@id': `${indexUrl}#collection`,
      url: indexUrl,
      name: t.blogTitle,
      description: t.blogIndexDesc,
      inLanguage: locale,
      isPartOf: { '@id': `${global.siteUrl}/#site` },
      about: { '@id': `${global.siteUrl}/#org` },
      publisher: { '@id': `${global.siteUrl}/#org` },
      mainEntity: {
        '@type': 'ItemList',
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        numberOfItems: articles.length,
        itemListElement: articles.slice(0, 30).map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${global.siteUrl}${a.url}`,
          name: a.h1,
        })),
      },
    },
  ];

  return `<!doctype html>
<html lang="${locale}">
<head>
<script data-tag="gtm">(function(w,d,s,l,i){w[l]=w[l]||[];var started=false;function loadGTM(){if(started)return;started=true;w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);}var evs=['scroll','pointerdown','keydown','touchstart','mousemove'];function onInt(){evs.forEach(function(e){w.removeEventListener(e,onInt)});loadGTM();}evs.forEach(function(e){w.addEventListener(e,onInt,{passive:true,once:true})});if(d.readyState==='complete'){setTimeout(loadGTM,4000);}else{w.addEventListener('load',function(){setTimeout(loadGTM,4000)});}})(window,document,'script','dataLayer','GTM-NLR4WFX8');</script>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#05070D" />
<title>${escapeText(t.blogIndexTitle)}</title>
<meta name="description" content="${escapeHtml(t.blogIndexDesc)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${indexUrl}" />
<link rel="alternate" hreflang="ru" href="${global.siteUrl}/ru/blog/" />
<link rel="alternate" hreflang="uz" href="${global.siteUrl}/uz/blog/" />
<link rel="alternate" hreflang="x-default" href="${global.siteUrl}/" />

<meta property="og:type" content="website" />
<meta property="og:locale" content="${ogLocale}" />
<meta property="og:url" content="${indexUrl}" />
<meta property="og:title" content="${escapeHtml(t.blogIndexOgTitle)}" />
<meta property="og:description" content="${escapeHtml(t.blogIndexOgDesc)}" />
<meta property="og:image" content="${global.defaultOgImage}" />${(() => {
  const d = getImageDims(global.defaultOgImage);
  return d ? `\n<meta property="og:image:width" content="${d.w}" />\n<meta property="og:image:height" content="${d.h}" />` : '';
})()}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(t.blogIndexOgTitle)}" />
<meta name="twitter:description" content="${escapeHtml(t.blogIndexOgDesc)}" />
<meta name="twitter:image" content="${global.defaultOgImage}" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" media="print" onload="this.media='all'" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" /></noscript>
<link rel="llms" href="${global.siteUrl}/llms.txt" />
<link rel="icon" type="image/png" href="/assets/landing/2.png" />
${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ''}

<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': ldGraph })}</script>
${ANALYTICS_HEAD}
</head>
<body class="bg-bg-base text-white antialiased">
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-bg-base focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:border focus:border-brand-cyan">${locale === 'uz' ? 'Asosiy kontentga o\u2018tish' : 'Перейти к основному контенту'}</a>
<noscript data-tag="gtm"><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-NLR4WFX8" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<header class="border-b border-white/5 bg-bg-base/80 backdrop-blur sticky top-0 z-40">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
    <a href="/" class="font-display text-xl text-white">${escapeHtml(global.siteName)}</a>
    <nav class="flex gap-3 text-sm items-center">
      <a href="/${locale}/blog/" data-testid="header-blog-active" class="text-brand-cyan">${escapeHtml(t.blog)}</a>
      <a href="${escapeHtml(global.defaultCTA.href)}" data-testid="header-cta" class="bg-grad-cta text-bg-base font-semibold px-4 py-2 rounded-full">${escapeHtml(global.defaultCTA.label)}</a>
    </nav>
  </div>
</header>

<main id="main" class="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
  <nav aria-label="Breadcrumb" class="text-sm text-white/50 mb-6">
    <a href="/" class="hover:text-white">${escapeHtml(global.siteName)}</a>
    <span class="px-2">/</span>
    <span class="text-white/70">${escapeHtml(t.blog)}</span>
  </nav>
  <h1 data-testid="blog-h1" class="font-display text-4xl sm:text-5xl text-white mb-4">${escapeText(t.blogTitle)}</h1>
  <p data-testid="blog-subtitle" class="text-white/70 mb-12 max-w-2xl">${escapeText(t.blogIndexH1Subtitle)}</p>
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
  // Blog indexes — one per locale, sorted by datePublished desc.
  for (const locale of ['ru', 'uz'] as const) {
    const localeArticles = published.filter((a) => (a.locale === 'uz' ? 'uz' : 'ru') === locale);
    if (localeArticles.length === 0) continue;
    const sorted = [...localeArticles].sort((x, y) => (y.datePublished || '').localeCompare(x.datePublished || ''));
    const indexPath = path.join(DIST_DIR, locale, 'blog', 'index.html');
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, renderBlogIndex(sorted, locale, global, cssHref), 'utf-8');
    console.log(`  + dist/${locale}/blog/index.html (${localeArticles.length} cards)`);
  }
  console.log(`Prerendered ${written} article(s), skipped ${articles.length - published.length} draft(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });

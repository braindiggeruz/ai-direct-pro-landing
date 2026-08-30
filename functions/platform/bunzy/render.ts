import type { BlogArticle, BodyBlock, Locale } from '../../../src/shared/types';

const SITE_URL = 'https://gptbot.uz';
const SITE_NAME = 'GPTBot';
const DEFAULT_OG = `${SITE_URL}/assets/landing/og.jpg`;
const TELEGRAM_URL = 'https://t.me/XGame_changerx';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(value: string | undefined): string {
  if (!value) return '#';
  if (value.startsWith('/') && !value.startsWith('//')) return escapeHtml(value);
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? escapeHtml(url.toString()) : '#';
  } catch {
    return '#';
  }
}

function renderBlock(block: BodyBlock): string {
  if (block.type === 'h2') return `<h2${block.id ? ` id="${escapeHtml(block.id)}"` : ''} class="font-display text-3xl sm:text-4xl mt-14 mb-5 text-white">${escapeHtml(block.text ?? '')}</h2>`;
  if (block.type === 'h3') return `<h3${block.id ? ` id="${escapeHtml(block.id)}"` : ''} class="font-display text-2xl mt-10 mb-4 text-white">${escapeHtml(block.text ?? '')}</h3>`;
  if (block.type === 'p') return `<p class="text-base text-white/80 leading-relaxed mb-5">${escapeHtml(block.text ?? '')}</p>`;
  if (block.type === 'quote') return `<blockquote class="border-l-2 border-brand-cyan pl-5 italic text-white/85 my-8 text-lg">${escapeHtml(block.text ?? '')}</blockquote>`;
  if (block.type === 'list') {
    return `<ul class="space-y-3 text-white/80 mb-6 pl-5 list-disc">${(block.items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }
  if (block.type === 'linkp') {
    let html = escapeHtml(block.text ?? '');
    for (const link of block.links ?? []) {
      if (!link.token || !link.anchor || !link.target) continue;
      const href = safeHref(link.target);
      if (href === '#') continue;
      const external = link.target.startsWith('http');
      const anchor = `<a href="${href}"${external ? ' rel="noopener noreferrer" target="_blank"' : ''} class="text-brand-cyan hover:underline">${escapeHtml(link.anchor)}</a>`;
      html = html.split(`{${escapeHtml(link.token)}}`).join(anchor);
    }
    return `<p class="text-base text-white/80 leading-relaxed mb-5">${html}</p>`;
  }
  if (block.type === 'image' || block.type === 'figure') {
    const src = safeHref(block.src);
    if (src === '#' || !block.alt) return '';
    const image = `<img src="${src}" alt="${escapeHtml(block.alt)}" loading="lazy" decoding="async" class="w-full h-auto rounded-2xl border border-white/10" />`;
    return `<figure class="my-10">${image}${block.caption ? `<figcaption class="mt-3 text-sm text-white/55">${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
  }
  if (block.type === 'table') {
    const head = (block.headers ?? []).map((cell) => `<th>${escapeHtml(cell)}</th>`).join('');
    const rows = (block.rows ?? []).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
    return `<div class="overflow-x-auto my-8"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  if (block.type === 'cta') {
    return `<p class="my-10"><a href="${safeHref(block.href)}" class="bunzy-cta">${escapeHtml(block.text ?? 'Узнать подробнее')}</a></p>`;
  }
  return '';
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function dateOnly(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function articleSchema(article: BlogArticle): Record<string, unknown> {
  const canonical = article.canonical ?? `${SITE_URL}${article.url}`;
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: 'GPTBot.uz',
      url: `${SITE_URL}/`,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/landing/logo-sq.webp` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: article.locale === 'uz' ? 'Blog' : 'Блог', item: `${SITE_URL}/${article.locale}/blog/` },
        { '@type': 'ListItem', position: 3, name: article.h1, item: canonical },
      ],
    },
    {
      '@type': 'Article',
      '@id': `${canonical}#article`,
      headline: article.h1,
      description: article.description,
      url: canonical,
      mainEntityOfPage: canonical,
      inLanguage: article.locale,
      datePublished: article.datePublished,
      dateModified: article.dateModified ?? article.updatedAt ?? article.datePublished,
      image: article.ogImage ?? DEFAULT_OG,
      author: { '@type': 'Person', name: article.author || 'Борис Герасимов', url: `${SITE_URL}/ru/avtor-boris-gerasimov/` },
      publisher: { '@id': `${SITE_URL}/#org` },
    },
  ];
  if (article.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: article.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function renderBunzyArticle(article: BlogArticle, cssHref: string | null): string {
  const locale = article.locale;
  const canonical = article.canonical ?? `${SITE_URL}${article.url}`;
  const blogLabel = locale === 'uz' ? 'Blog' : 'Блог';
  const published = dateOnly(article.datePublished);
  const modified = dateOnly(article.dateModified ?? article.updatedAt);
  const faq = article.faq.length
    ? `<section class="bunzy-faq"><h2>${locale === 'uz' ? 'Tez-tez beriladigan savollar' : 'Частые вопросы'}</h2>${article.faq.map((item) => `<details><summary>${escapeHtml(item.q)}</summary><p>${escapeHtml(item.a)}</p></details>`).join('')}</section>`
    : '';
  const related = article.internalLinks.length
    ? `<section class="bunzy-related"><h2>${locale === 'uz' ? 'Shuningdek o‘qing' : 'Также читайте'}</h2>${article.internalLinks.map((link) => `<a href="${safeHref(link.target)}">${escapeHtml(link.anchor)}</a>`).join('')}</section>`
    : '';
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#05070D" />
<title>${escapeHtml(article.title)}</title>
<meta name="description" content="${escapeHtml(article.description)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<link rel="alternate" type="text/markdown" href="${escapeHtml(canonical)}index.html.md" title="Markdown version" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="GPTBot.uz" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:title" content="${escapeHtml(article.ogTitle ?? article.title)}" />
<meta property="og:description" content="${escapeHtml(article.ogDescription ?? article.description)}" />
<meta property="og:image" content="${safeHref(article.ogImage ?? DEFAULT_OG)}" />
<meta property="article:published_time" content="${escapeHtml(article.datePublished ?? '')}" />
<meta property="article:modified_time" content="${escapeHtml(article.dateModified ?? article.updatedAt ?? article.datePublished ?? '')}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(article.ogTitle ?? article.title)}" />
<meta name="twitter:description" content="${escapeHtml(article.ogDescription ?? article.description)}" />
<meta name="twitter:image" content="${safeHref(article.ogImage ?? DEFAULT_OG)}" />
<link rel="llms" href="${SITE_URL}/llms.txt" />
<link rel="icon" type="image/png" href="/assets/landing/2.png" />
${cssHref ? `<link rel="stylesheet" href="${safeHref(cssHref)}" />` : ''}
<style>
body{margin:0;background:#05070d;color:#fff;font-family:Arial,sans-serif}.bunzy-shell{max-width:900px;margin:auto;padding:28px 20px 80px}.bunzy-nav{display:flex;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid #ffffff18}.bunzy-nav a{color:#fff;text-decoration:none}.bunzy-crumb{color:#ffffff99;font-size:14px;margin:18px 0 38px}.bunzy-crumb a{color:#2fe6d1}.bunzy-article h1{font-size:clamp(36px,7vw,64px);line-height:1.05;margin:0 0 22px}.bunzy-meta{color:#ffffff9c;margin-bottom:40px}.bunzy-article p,.bunzy-article li{font-size:18px;line-height:1.72;color:#ffffffd0}.bunzy-article h2{font-size:34px;margin:58px 0 18px}.bunzy-article h3{font-size:25px;margin:38px 0 14px}.bunzy-article a{color:#2fe6d1}.bunzy-article img{max-width:100%;height:auto}.bunzy-cta{display:inline-block;background:linear-gradient(90deg,#2fb6ef,#2fe6d1);color:#061017!important;font-weight:700;padding:15px 24px;border-radius:999px;text-decoration:none}.bunzy-faq,.bunzy-related{margin-top:64px}.bunzy-faq details{border:1px solid #ffffff18;border-radius:16px;padding:18px;margin:12px 0}.bunzy-faq summary{cursor:pointer;font-weight:700}.bunzy-related a{display:block;border:1px solid #ffffff18;border-radius:14px;padding:16px;margin:10px 0;text-decoration:none}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ffffff20;padding:10px;text-align:left}
</style>
<script type="application/ld+json">${safeJson(articleSchema(article))}</script>
</head>
<body>
<header class="bunzy-nav"><a href="/">GPTBot</a><a href="/${locale}/blog/">${blogLabel}</a></header>
<main class="bunzy-shell">
<nav class="bunzy-crumb"><a href="/">GPTBot</a> / <a href="/${locale}/blog/">${blogLabel}</a> / ${escapeHtml(article.h1.slice(0, 70))}</nav>
<article class="bunzy-article">
<h1>${escapeHtml(article.h1)}</h1>
<div class="bunzy-meta">${locale === 'uz' ? 'Muallif' : 'Автор'}: ${escapeHtml(article.author || 'Редакция GPTBot.uz')}${published ? ` · ${locale === 'uz' ? 'Nashr etilgan' : 'Опубликовано'} ${published}` : ''}${modified ? ` · ${locale === 'uz' ? 'Yangilangan' : 'Обновлено'} ${modified}` : ''}</div>
${article.body.map(renderBlock).join('\n')}
${article.cta ? `<p class="my-10"><a class="bunzy-cta" href="${safeHref(article.cta.href)}">${escapeHtml(article.cta.label)}</a></p>` : ''}
</article>
${faq}
${related}
</main>
</body>
</html>`;
}

export function renderBunzyIndexCard(article: BlogArticle): string {
  return `<a href="${safeHref(article.url)}" data-testid="blog-card" data-source="bunzy" class="link-card group !p-6">
    <div class="text-xs uppercase tracking-wider text-brand-cyan mb-2">${escapeHtml(article.topicCluster || (article.locale === 'uz' ? 'Blog' : 'Блог'))}</div>
    <h2 class="font-display text-xl text-white mb-3 group-hover:text-brand-cyan transition-colors">${escapeHtml(article.h1)}</h2>
    <p class="text-sm text-white/70 leading-relaxed mb-4">${escapeHtml(article.description)}</p>
    <span class="text-sm text-brand-cyan inline-flex items-center gap-1.5">${article.locale === 'uz' ? 'O‘qish →' : 'Читать →'}</span>
  </a>`;
}

export function bunzySitemapUrl(article: BlogArticle, lastModified: string): string {
  const canonical = article.canonical ?? `${SITE_URL}${article.url}`;
  return `<url><loc>${escapeHtml(canonical)}</loc><lastmod>${escapeHtml(dateOnly(lastModified) || dateOnly(article.dateModified) || dateOnly(article.datePublished))}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`;
}

export function defaultBlogCssHref(indexHtml: string): string | null {
  const match = indexHtml.match(/<link\s+rel="stylesheet"\s+href="([^"]+)"/i);
  return match?.[1] ?? null;
}

export function isLocale(value: string): value is Locale {
  return value === 'ru' || value === 'uz';
}

export { SITE_URL, TELEGRAM_URL };

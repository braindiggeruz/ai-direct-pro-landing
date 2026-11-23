// Prerenders the English layer (/en/) from scripts/en-pages.ts into dist/en/.
// Runs in every build chain (build, build:fast, build:cf) right after
// `vite build` (which empties dist/ and writes the stylesheet), before
// prerender.ts and prerender-blog.ts: a RU/UZ page declares its English
// alternate only when the English page exists (scripts/en-alternates.ts), and
// generate-sitemap.ts lists only built pages.
// It writes only under dist/en/ and reuses the site's stylesheet, analytics,
// JSON-LD helpers and e-mail protection, so an English page looks and behaves
// like the rest of the site.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { BodyBlock, FaqItem, GlobalSEO } from '../src/shared/types';
import { ANALYTICS_HEAD } from './analytics-snippet';
import { METRIKA_HEAD, METRIKA_NOSCRIPT } from './analytics-metrika';
import { FIRST_TOUCH_SCRIPT } from './attribution-snippet';
import { withEmailOff } from './email-off';
import { enDistFile, enPages, EN_SITE, type EnPage } from './en-pages';
import { buildArticleLd, buildAuthorPersonLd, buildBreadcrumbLd, buildOrganizationLd, buildWebPageLd, buildWebSiteLd } from './jsonld-helpers';
import { renderSiteStylesheets } from './site-stylesheets';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const abs = (url: string): string => (url.startsWith('http') ? url : `${EN_SITE}${url}`);

/** The header button: the English layer has no chat of its own and opens the Uzbek chat. */
export const EN_HEADER_CHAT = { href: '/uz/gpt-uzbek-tilida/', label: 'Open the AI chat' } as const;

const NAV = [
  { href: '/en/uzbek-ai-chat/', text: 'Uzbek AI chat' },
  { href: '/en/ai-presentation-maker/', text: 'AI presentations' },
  { href: '/en/ai-chatbot-development-tashkent/', text: 'AI chatbots' },
  { href: '/en/uzbek-ai-chats-compared/', text: 'AI chats compared' },
  { href: '/en/pay-for-chatgpt-in-uzbekistan/', text: 'Pay for ChatGPT' },
];

function renderBlocks(blocks: BodyBlock[]): string {
  return blocks.map((b) => {
    switch (b.type) {
      case 'h2': return `<h2 class="font-display text-3xl sm:text-4xl mt-16 mb-6 text-white scroll-mt-24 break-words">${escapeText(b.text || '')}</h2>`;
      case 'h3': return `<h3 class="font-display text-2xl mt-10 mb-4 text-white scroll-mt-24 break-words">${escapeText(b.text || '')}</h3>`;
      case 'p': return `<p class="text-base text-white/80 leading-relaxed mb-4">${escapeText(b.text || '')}</p>`;
      case 'list': return `<ul class="list-disc pl-6 space-y-2 text-white/80 mb-6 marker:text-brand-cyan">${(b.items || []).map((i) => `<li>${escapeText(i)}</li>`).join('')}</ul>`;
      case 'table': {
        const head = (b.headers || []).map((h) => `<th class="px-4 py-3 text-left text-brand-cyan font-semibold text-sm uppercase tracking-wider border-b border-white/10">${escapeText(h)}</th>`).join('');
        const rows = (b.rows || []).map((row, ri) => `<tr class="${ri % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.05] transition-colors">${row.map((cell) => `<td class="px-4 py-3 text-white/80 text-sm border-b border-white/5">${escapeText(cell)}</td>`).join('')}</tr>`).join('');
        return `<div class="overflow-x-auto my-8 rounded-2xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-brand-cyan/60" role="region" aria-label="Data table, scroll horizontally if needed" tabindex="0"><table class="w-full border-collapse"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      case 'linkp': {
        const links = b.links || [];
        const html = (b.text || '').split(/(\{[a-z0-9_-]+\})/i).map((part) => {
          const token = /^\{([a-z0-9_-]+)\}$/i.exec(part)?.[1];
          if (!token) return escapeText(part);
          const link = links.find((l) => l.token === token);
          if (!link?.target || !link.anchor) throw new Error(`EN page: linkp token {${token}} has no link with a target and an anchor`);
          return `<a href="${escapeHtml(link.target)}"${link.lang ? ` hreflang="${escapeHtml(link.lang)}" lang="${escapeHtml(link.lang)}"` : ''} class="text-brand-cyan hover:underline">${escapeText(link.anchor)}</a>`;
        }).join('');
        return `<p class="text-base text-white/80 leading-relaxed mb-4">${html}</p>`;
      }
      default: throw new Error(`EN page: unsupported block type ${b.type}`);
    }
  }).join('\n');
}

function renderFaq(faq: FaqItem[]): string {
  if (!faq.length) return '';
  const items = faq.map((f) => `
    <details class="faq-item group p-5 sm:p-6 mb-3">
      <summary class="cursor-pointer list-none font-display text-lg text-white flex justify-between items-center gap-4">
        <h3 class="font-display text-base sm:text-lg text-white m-0 font-inherit flex-1 leading-snug">${escapeText(f.q)}</h3>
        <span class="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan text-lg group-open:rotate-45 transition-transform">+</span>
      </summary>
      <p class="faq-a text-white/75 mt-4 leading-relaxed">${escapeText(f.a)}</p>
    </details>`).join('');
  return `<section id="faq" data-testid="page-faq" class="mt-16 scroll-mt-24"><div class="eyebrow mb-3">FAQ</div><h2 class="font-display text-3xl sm:text-4xl mb-6 text-white">Frequently asked questions</h2>${items}</section>`;
}

function renderSources(page: EnPage): string {
  if (!page.sources?.length) return '';
  const items = page.sources.map((s) => `<li><a href="${escapeHtml(s.url)}" rel="noopener" class="text-brand-cyan hover:underline">${escapeText(s.title)}</a>${s.note ? ` — ${escapeText(s.note)}` : ''}</li>`).join('');
  return `<section data-testid="page-sources" class="mt-12"><h2 class="font-display text-2xl mb-4 text-white">Sources</h2><ul class="list-disc pl-6 space-y-2 text-sm text-white/70">${items}</ul></section>`;
}

/** hreflang set of a page that joins a RU/UZ pair: ru, uz, en and x-default (the Russian member, as on the pair). */
export function enHreflang(page: EnPage): Array<{ lang: string; href: string }> {
  if (!page.alternates) return [];
  return [
    { lang: 'ru', href: abs(page.alternates.ru) },
    { lang: 'uz', href: abs(page.alternates.uz) },
    { lang: 'en', href: abs(page.url) },
    { lang: 'x-default', href: abs(page.alternates.ru) },
  ];
}

function jsonLd(page: EnPage, global: GlobalSEO): string {
  const url = page.url;
  const crumbs = page.url === '/en/'
    ? [{ name: global.siteName, item: `${EN_SITE}/en/` }]
    : [{ name: global.siteName, item: `${EN_SITE}/en/` }, { name: page.breadcrumb, item: abs(url) }];
  const webPage = buildWebPageLd({ global, url, name: page.h1, description: page.description, locale: 'en', primaryImage: page.ogImage, datePublished: page.datePublished, dateModified: page.dateModified });
  if (page.kind === 'about') webPage['@type'] = ['WebPage', 'AboutPage'];
  const graph: Record<string, unknown>[] = [buildOrganizationLd(global), buildWebSiteLd(global), webPage, buildBreadcrumbLd(crumbs, page.h1)];
  if (page.kind === 'article') {
    // The Article names the founder (#author) as on the blog, so the graph carries the Person node.
    const author = buildAuthorPersonLd(global);
    if (author) graph.push(author);
    graph.push({
      ...buildArticleLd({ global, url, headline: page.h1, description: page.description, locale: 'en', datePublished: page.datePublished, dateModified: page.dateModified, primaryImage: page.ogImage }),
      ...(page.sources?.length ? { citation: page.sources.map((s) => s.url) } : {}),
    });
  }
  if (page.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${EN_SITE}${url}#faq`,
      mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

export function renderEnPage(page: EnPage, global: GlobalSEO, stylesheets: string): string {
  const full = abs(page.url);
  const hreflang = enHreflang(page).map((h) => `<link rel="alternate" hreflang="${h.lang}" href="${escapeHtml(h.href)}" />`).join('\n');
  // The language switch leads to the pair, or to the page's RU/UZ counterparts for people (no hreflang).
  const ruHref = (page.alternates ?? page.switchTo)?.ru ?? '/';
  const uzHref = (page.alternates ?? page.switchTo)?.uz ?? '/uz/';
  const navLinkClass = 'inline-flex min-h-[44px] items-center rounded-lg px-2 sm:px-3 text-white/70 hover:bg-white/5 hover:text-white aria-[current=page]:bg-white/10 aria-[current=page]:text-white';
  const langLinkClass = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-transparent font-semibold text-white/60 hover:bg-white/5 hover:text-white aria-[current=page]:border-white/20 aria-[current=page]:bg-white/10 aria-[current=page]:text-white';
  const nav = NAV.map((l) => `<li><a href="${l.href}"${l.href === page.url ? ' aria-current="page"' : ''} class="${navLinkClass}">${escapeText(l.text)}</a></li>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#05070D" />
<title>${escapeText(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${escapeHtml(full)}" />
${hreflang}
<meta property="og:type" content="${page.kind === 'article' ? 'article' : 'website'}" />
<meta property="og:site_name" content="${escapeHtml(global.siteName)}" />
<meta property="og:locale" content="en_US" />
<meta property="og:url" content="${escapeHtml(full)}" />
<meta property="og:title" content="${escapeHtml(page.title.replace(/ \| GPTBot\.uz$/, ''))}" />
<meta property="og:description" content="${escapeHtml(page.description)}" />
<meta property="og:image" content="${escapeHtml(page.ogImage)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(page.title.replace(/ \| GPTBot\.uz$/, ''))}" />
<meta name="twitter:description" content="${escapeHtml(page.description)}" />
<meta name="twitter:image" content="${escapeHtml(page.ogImage)}" />
<link rel="preload" href="/assets/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
<link rel="llms" href="${EN_SITE}/llms.txt" />
<link rel="alternate" type="text/markdown" href="${EN_SITE}/llms.txt" title="LLM-friendly summary (llms.txt)" />
<link rel="icon" type="image/webp" sizes="80x80" href="/assets/landing/logo-sq-80.webp" />
<link rel="icon" type="image/png" sizes="96x96" href="/assets/landing/logo-sq-96.png" />
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
${stylesheets}
<script type="application/ld+json">${jsonLd(page, global)}</script>
${FIRST_TOUCH_SCRIPT}
${ANALYTICS_HEAD}
${METRIKA_HEAD}
</head>
<body class="bg-bg-base text-white antialiased">
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:text-black focus:px-4 focus:py-3 focus:rounded-lg focus:border focus:border-black">Skip to main content</a>
${METRIKA_NOSCRIPT}
<header class="border-b border-white/5 bg-bg-base/80 backdrop-blur sticky top-0 z-40">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
    <a href="/en/" class="font-display text-xl text-white shrink-0" data-testid="back-home">${escapeHtml(global.siteName)}</a>
    <a href="${EN_HEADER_CHAT.href}" data-testid="header-chat" class="bg-grad-cta text-bg-base font-semibold text-sm leading-tight text-center px-4 py-2 rounded-full min-h-[44px] inline-flex items-center justify-center">${EN_HEADER_CHAT.label}</a>
  </div>
</header>
<div class="border-b border-white/5 bg-bg-base">
  <div class="max-w-5xl mx-auto px-2 sm:px-4 flex items-center gap-2">
    <nav aria-label="Site sections" data-testid="site-nav" class="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul class="flex gap-1 whitespace-nowrap text-sm">${nav}</ul>
    </nav>
    <nav aria-label="Language" data-testid="language-switch" class="flex shrink-0 gap-1 text-sm"><a href="${escapeHtml(ruHref)}" hreflang="ru" class="${langLinkClass}">RU</a><a href="${escapeHtml(uzHref)}" hreflang="uz" class="${langLinkClass}">UZ</a><a href="${escapeHtml(page.url)}" hreflang="en" aria-current="page" class="${langLinkClass}">EN</a></nav>
  </div>
</div>
<main id="main" class="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
  <nav aria-label="Breadcrumb" class="text-sm text-white/50 mb-6">
    <a href="/en/" class="hover:text-white">${escapeHtml(global.siteName)}</a>${page.url === '/en/' ? '' : `
    <span class="px-2">/</span>
    <span class="text-white/70">${escapeText(page.breadcrumb)}</span>`}
  </nav>
  <h1 class="font-display text-4xl sm:text-5xl text-white leading-tight mb-6">${escapeText(page.h1)}</h1>
  <p data-testid="page-updated" class="text-xs text-white/40 mb-4">Checked <time datetime="${page.dateModified}">${page.dateModified}</time> · GPTBot.uz team, Tashkent</p>
  <p data-testid="answer-first" class="text-lg text-white/85 leading-relaxed mb-8">${escapeText(page.intro)}</p>
  <article class="prose-invert scroll-mt-24">
${renderBlocks(page.blocks)}
  </article>
${renderFaq(page.faq)}
${renderSources(page)}
</main>
<footer class="border-t border-white/5 mt-20 py-10">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-white/50">
    <span>${escapeHtml(global.siteName)} · ${escapeHtml(global.address || '')} · Mon–Sat 10:00–19:00</span>
    <span>GPTBot.uz is an independent service, not an OpenAI product.</span>
    <nav class="w-full flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40" aria-label="Other languages">
      <a href="/" class="hover:text-brand-cyan transition">Русский</a>
      <a href="/uz/" class="hover:text-brand-cyan transition">O‘zbekcha</a>
      <a href="/ru/o-kompanii/" class="hover:text-brand-cyan transition">О компании</a>
      <a href="/uz/biz-haqimizda/" class="hover:text-brand-cyan transition">Biz haqimizda</a>
    </nav>
  </div>
</footer>
</body>
</html>
`;
  return withEmailOff(html, page.url);
}

function main(): void {
  const global = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/global/site.json'), 'utf8')) as GlobalSEO;
  const stylesheets = renderSiteStylesheets(DIST);
  const pages = enPages(ROOT);
  const urls = new Set<string>();
  for (const page of pages) {
    if (!/^\/en\/(?:[a-z0-9-]+\/)?$/.test(page.url)) throw new Error(`EN page outside /en/: ${page.url}`);
    if (urls.has(page.url)) throw new Error(`Duplicate EN page: ${page.url}`);
    urls.add(page.url);
    const file = enDistFile(DIST, page.url);
    if (!path.resolve(file).startsWith(path.join(DIST, 'en') + path.sep)) throw new Error(`EN page would be written outside dist/en/: ${file}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderEnPage(page, global, stylesheets), 'utf8');
  }
  console.log(`English pages: ${pages.length} written → dist/en/ (${[...urls].join(', ')})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();

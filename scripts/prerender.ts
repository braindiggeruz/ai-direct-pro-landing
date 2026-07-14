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
import { LLM_MARKDOWN_URLS } from './llm-pages';
import {
  buildOrganizationLd,
  buildWebSiteLd,
  buildBreadcrumbLd,
  buildServiceLd,
  buildWebPageLd,
  buildAuthorPersonLd,
  buildArticleLd,
} from './jsonld-helpers';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const DIST_DIR = path.join(ROOT, 'dist');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Read intrinsic dimensions of a local PNG/JPEG without external deps.
// Returns null when the file cannot be resolved locally (e.g. remote-only asset)
// so we never emit incorrect og:image:width/height.
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
  const candidates = [path.join(PUBLIC_DIR, rel), path.join(DIST_DIR, rel)];
  for (const file of candidates) {
    try {
      const buf = fs.readFileSync(file);
      const dims = parseImageDims(buf);
      if (dims) {
        _ogDimCache.set(src, dims);
        return dims;
      }
    } catch {
      /* try next candidate */
    }
  }
  _ogDimCache.set(src, null);
  return null;
}

function parseImageDims(buf: Buffer): { w: number; h: number } | null {
  // PNG: signature then IHDR (width/height as 4-byte big-endian at offsets 16/20)
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: scan SOF markers for height/width
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
      const len = buf.readUInt16BE(off + 2);
      off += 2 + len;
    }
  }
  return null;
}

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

// Standalone AI-chat island bundle (separate Vite entry). Injected ONLY on
// pageType === 'gpt-chat' pages so static money pages stay JS-free.
function findChatAsset(): string | null {
  const assetsDir = path.join(DIST_DIR, 'assets');
  if (!fs.existsSync(assetsDir)) return null;
  const file = fs.readdirSync(assetsDir).find((f) => f.startsWith('gpt-chat-') && f.endsWith('.js'));
  return file ? `/assets/${file}` : null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// For visible element text content (title, h1/h2/p/li, anchors). Apostrophes are
// legitimate characters in Uzbek Latin (O'zbekiston, do'kon) and must NOT be turned
// into &#39; — only & and < are unsafe inside text nodes.
function escapeText(s: string): string {
  return (s || '').replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' }[c]!));
}

// Slugify a heading into an ASCII-safe anchor id (fallback when no explicit id).
function slugifyId(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function renderBlock(b: BodyBlock): string {
  switch (b.type) {
    case 'h2': { const _id = b.id || slugifyId(b.text || ''); return `<h2 id="${escapeHtml(_id)}" class="font-display text-3xl sm:text-4xl mt-16 mb-6 text-white scroll-mt-24 break-words">${escapeText(b.text || '')}</h2>`; }
    case 'h3': { const _id = b.id || slugifyId(b.text || ''); return `<h3 id="${escapeHtml(_id)}" class="font-display text-2xl mt-10 mb-4 text-white scroll-mt-24 break-words">${escapeText(b.text || '')}</h3>`; }
    case 'toc': {
      const links = (b.links || []).filter((l) => l.anchor && l.label);
      if (!links.length) return '';
      const items = links.map((l) => `<li><a href="#${escapeHtml(l.anchor!)}" class="text-brand-cyan hover:underline">${escapeText(l.label!)}</a></li>`).join('');
      const heading = b.text ? `<div class="font-display text-lg text-white mb-3">${escapeText(b.text)}</div>` : '';
      return `<nav aria-label="${escapeHtml(b.text || 'На этой странице')}" class="my-8 rounded-2xl border border-white/10 bg-bg-surface p-6">${heading}<ul class="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm list-disc pl-5 marker:text-brand-cyan">${items}</ul></nav>`;
    }
    case 'linkp': {
      // Escape the prose first, then substitute {token} placeholders with anchors.
      let html = escapeText(b.text || '');
      for (const l of (b.links || [])) {
        if (!l.token || !l.target || !l.anchor) continue;
        const _ext = l.target.startsWith('http');
        const a = `<a href="${escapeHtml(l.target)}"${_ext ? ' rel="noopener" target="_blank"' : ''} class="text-brand-cyan hover:underline">${escapeText(l.anchor)}</a>`;
        html = html.split(`{${l.token}}`).join(a);
      }
      return `<p class="text-base text-white/80 leading-relaxed mb-4">${html}</p>`;
    }
    case 'p': return `<p class="text-base text-white/80 leading-relaxed mb-4">${escapeText(b.text || '')}</p>`;
    case 'list': return `<ul class="space-y-3 text-white/80 mb-6">${(b.items || []).map((i) => `<li class="flex gap-3 items-start"><span class="mt-1 shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-md bg-brand-cyan/12 border border-brand-cyan/30"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#2FE6D1" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>${escapeText(i)}</span></li>`).join('')}</ul>`;
    case 'quote': return `<blockquote class="border-l-2 border-brand-cyan pl-4 italic text-white/80 my-6">${escapeText(b.text || '')}</blockquote>`;
    case 'image': {
      const _dim = `${b.width ? ` width="${b.width}"` : ''}${b.height ? ` height="${b.height}"` : ''}`;
      const _ld = b.loading === 'eager' ? ' loading="eager" fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"';
      return `<img src="${escapeHtml(b.src || '')}" alt="${escapeHtml(b.alt || '')}"${_dim} class="rounded-2xl my-6 w-full h-auto"${_ld} />`;
    }
    case 'figure': {
      const _dim = `${b.width ? ` width="${b.width}"` : ''}${b.height ? ` height="${b.height}"` : ''}`;
      const _ld = b.loading === 'eager' ? ' loading="eager" fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"';
      const _ar = b.width && b.height ? ` style="aspect-ratio:${b.width}/${b.height}"` : '';
      const _cap = b.caption ? `<figcaption class="text-sm text-white/55 mt-3 leading-relaxed">${escapeText(b.caption)}</figcaption>` : '';
      return `<figure class="my-10"><img src="${escapeHtml(b.src || '')}" alt="${escapeHtml(b.alt || '')}"${_dim}${_ar} class="rounded-2xl border border-white/10 w-full h-auto"${_ld} />${_cap}</figure>`;
    }
    case 'cta': { const _isExt = (b.href || '').startsWith('http'); return `<div class="my-10"><a href="${escapeHtml(b.href || '#')}"${_isExt ? ' rel="nofollow noopener" target="_blank"' : ''} class="btn-primary text-base w-full sm:w-auto">${escapeText(b.text || 'Запустить')}</a></div>`; }
    case 'table': {
      const headers = b.headers || [];
      const rows = b.rows || [];
      const thead = headers.length ? `<thead><tr>${headers.map(h => `<th class="px-4 py-3 text-left text-brand-cyan font-semibold text-sm uppercase tracking-wider border-b border-white/10">${escapeText(h)}</th>`).join('')}</tr></thead>` : '';
      const tbody = `<tbody>${rows.map((row, ri) => `<tr class="${ri % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.05] transition-colors">${row.map(cell => `<td class="px-4 py-3 text-white/80 text-sm border-b border-white/5">${escapeText(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      return `<div class="overflow-x-auto my-8 rounded-2xl border border-white/10"><table class="w-full">${thead}${tbody}</table></div>`;
    }
    default: return '';
  }
}

function renderFaq(faq: FaqItem[], locale: 'ru' | 'uz' = 'ru'): string {
  if (!faq?.length) return '';
  const items = faq.map((f) => `
    <details class="faq-item group p-5 sm:p-6 mb-3">
      <summary class="cursor-pointer list-none font-display text-lg text-white flex justify-between items-center gap-4">
        <h3 class="font-display text-base sm:text-lg text-white m-0 font-inherit flex-1 leading-snug">${escapeText(f.q)}</h3>
        <span class="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan text-lg group-open:rotate-45 transition-transform">+</span>
      </summary>
      <p class="faq-a text-white/75 mt-4 leading-relaxed">${escapeText(f.a)}</p>
    </details>
  `).join('');
  const label = locale === 'uz' ? 'Ko‘p beriladigan savollar' : 'Частые вопросы';
  const eyebrow = locale === 'uz' ? 'FAQ' : 'Вопрос-ответ';
  return `<section id="faq" data-testid="page-faq" class="mt-16 scroll-mt-24"><div class="eyebrow mb-3">${escapeHtml(eyebrow)}</div><h2 class="font-display text-3xl sm:text-4xl mb-6 text-white">${escapeText(label)}</h2>${items}</section>`;
}

function renderInternalLinks(page: Page): string {
  if (!page.internalLinks?.length) return '';
  const items = page.internalLinks.map((l) => `
    <a href="${escapeHtml(l.target)}" class="link-card group flex items-start gap-3">
      <span class="mt-0.5 shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan group-hover:bg-brand-cyan/20 transition-colors">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <span class="text-white font-medium leading-snug group-hover:text-brand-cyan transition-colors">${escapeText(l.anchor)}</span>
    </a>
  `).join('');
  const heading = page.locale === 'uz' ? 'Shuningdek o\u2018qing' : 'Смотрите также';
  const eyebrow = page.locale === 'uz' ? 'Havolalar' : 'Разделы';
  return `<section data-testid="related-pages" class="mt-16"><div class="eyebrow mb-3">${escapeHtml(eyebrow)}</div><h2 class="font-display text-2xl mb-6 text-white">${escapeText(heading)}</h2><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${items}</div></section>`;
}

function renderRelatedArticles(page: Page, articles: BlogArticle[]): string {
  const related = articles.filter((a) => a.targetMoneyPage === page.url).slice(0, 3);
  if (!related.length) return '';
  const badge = page.locale === 'uz' ? 'Maqola' : 'Статья';
  const items = related.map((a) => `
    <a href="${escapeHtml(a.url)}" data-testid="related-article" class="link-card group">
      <div class="text-xs uppercase tracking-wider text-brand-cyan mb-2">${escapeHtml(badge)}</div>
      <div class="text-white font-medium leading-snug group-hover:text-brand-cyan transition-colors">${escapeText(a.h1)}</div>
      <div class="text-white/55 text-sm mt-2 line-clamp-3">${escapeText(a.description)}</div>
    </a>
  `).join('');
  const heading = page.locale === 'uz' ? 'Foydali maqolalar' : 'Полезные статьи';
  return `<section data-testid="related-articles" class="mt-16"><h2 class="font-display text-2xl mb-6 text-white">${escapeHtml(heading)}</h2><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${items}</div></section>`;
}

function buildJsonLd(page: Page, global: GlobalSEO): string {
  const graph: Record<string, unknown>[] = [];
  const types = new Set<SchemaType>(page.schemaTypes || []);
  const fullUrl = `${global.siteUrl}${page.url}`;
  const dateModified = page.lastReviewedAt || page.updatedAt;
  const dateModifiedIso = dateModified ? new Date(dateModified).toISOString().slice(0, 10) : undefined;

  // Always emit Organization + WebSite when the page declares Organization or
  // WebSite in its schemaTypes — they are the entity backbone and the rest of
  // the graph references them via @id. We never duplicate or shorten them.
  if (types.has('Organization')) {
    graph.push(buildOrganizationLd(global));
    // Named expert Person rides along with the Organization node — E-E-A-T
    // anchor referenced by Article.author on blog pages.
    const authorPerson = buildAuthorPersonLd(global);
    if (authorPerson) graph.push(authorPerson);
  }
  if (types.has('WebSite')) graph.push(buildWebSiteLd(global));

  if (types.has('BreadcrumbList')) {
    graph.push(buildBreadcrumbLd([
      { name: global.siteName, item: `${global.siteUrl}/` },
      { name: page.breadcrumbLabel || page.h1, item: fullUrl },
    ]));
  }

  // WebPage anchors the page in the entity graph. Always emit on money pages
  // so AI engines can resolve "this page is part of GPTBot.uz site, about the
  // GPTBot organisation" with one document.
  graph.push(buildWebPageLd({
    global,
    url: page.url,
    name: page.h1 || page.title,
    description: page.description,
    locale: page.locale === 'uz' ? 'uz' : 'ru',
    primaryImage: page.ogImage || global.defaultOgImage,
    dateModified: dateModifiedIso,
    datePublished: page.createdAt ? new Date(page.createdAt).toISOString().slice(0, 10) : undefined,
    // Speakable: tell voice/AI assistants which parts of a money page carry
    // the answer — the H1 and the hero subtitle (rendered with .speakable-intro).
    speakableSelectors: page.pageType === 'money' || types.has('Service') ? ['h1', '.speakable-intro'] : undefined,
  }));

  if (types.has('Service') || page.pageType === 'money') {
    graph.push(buildServiceLd({
      global,
      url: page.url,
      name: page.h1 || page.title,
      description: page.description,
      serviceType: page.primaryKeyword,
      dateModified: dateModifiedIso,
      locale: page.locale === 'uz' ? 'uz' : 'ru',
    }));
  }
  if (types.has('Article')) {
    graph.push(buildArticleLd({
      global,
      url: page.url,
      headline: page.h1 || page.title,
      description: page.description,
      locale: page.locale === 'uz' ? 'uz' : 'ru',
      datePublished: page.createdAt ? new Date(page.createdAt).toISOString().slice(0, 10) : undefined,
      dateModified: dateModifiedIso,
      primaryImage: page.ogImage || global.defaultOgImage,
    }));
  }
  if (page.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${fullUrl}#faq`,
      mainEntity: page.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  // Page-scoped extra entities (e.g. the Boss Digital agency node on
  // /boss-digital/ that references the GPTBot org via department @id).
  // Emitted verbatim from the page JSON — data-driven, never invented here.
  if (Array.isArray(page.extraJsonLd) && page.extraJsonLd.length > 0) {
    graph.push(...page.extraJsonLd);
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

// AI-chat island block: brand-safe disclaimer + mount root with a no-JS
// fallback. Rendered above the SEO article on pageType === 'gpt-chat'.
function renderChatConsole(page: Page): string {
  const uz = page.locale === 'uz';
  const disclaimer = uz
    ? 'GPTBot.uz — mustaqil AI-xizmat. OpenAI, ChatGPT yoki NVIDIA’ning rasmiy mahsuloti emas.'
    : 'GPTBot.uz — независимый AI-сервис. Не является официальным продуктом OpenAI, ChatGPT или NVIDIA.';
  const noscript = uz
    ? 'AI-chatdan foydalanish uchun JavaScript’ni yoqing yoki Telegram’da bizga yozing.'
    : 'Включите JavaScript, чтобы пользоваться AI-чатом, или напишите нам в Telegram.';
  const label = uz ? 'AI-chat konsoli' : 'AI-чат консоль';
  return `<section aria-label="${escapeHtml(label)}" id="ai-console" class="mb-10">
    <div id="gpt-chat-root" data-locale="${page.locale === 'uz' ? 'uz' : 'ru'}" data-api-base="" class="min-h-[420px]">
      <noscript><p class="text-white/70 text-sm rounded-xl border border-white/10 p-6">${escapeText(noscript)}</p></noscript>
      <div class="text-white/40 text-sm rounded-xl border border-white/10 p-6 animate-pulse">${uz ? 'AI-chat yuklanmoqda…' : 'AI-чат загружается…'}</div>
    </div>
    <p data-testid="ai-disclaimer" class="text-[11px] text-white/35 mt-3 leading-relaxed text-center">${escapeText(disclaimer)}</p>
  </section>`;
}

// Premium product layout for pageType === 'gpt-chat'. Inverts the page:
// compact hero → chat console (hero) → value cards → pricing teaser →
// SEO article in <details open> → FAQ → internal links → final CTA.
// All SEO content stays in the HTML, visible to crawlers and users.
function renderGptChatMain(
  page: Page,
  global: GlobalSEO,
  articles: BlogArticle[],
  modifiedIso: string,
  modifiedLabel: string,
  bylineHtml: string,
  trustHtml: string,
  contentAnchor: string,
): string {
  const uz = page.locale === 'uz';
  const primaryHref = page.ctaPrimaryHref || '#ai-console';
  const primaryLabel = page.ctaPrimaryLabel || (uz ? 'AI-chatni ochish' : 'Открыть AI-чат');
  const primaryExternal = primaryHref.startsWith('http');
  const secondaryHref = page.ctaSecondaryHref || global.defaultCTA.href;
  const secondaryLabel = page.ctaSecondaryLabel || (uz ? 'AI-bot buyurtma berish' : 'Заказать AI-бота');
  const secondaryExternal = secondaryHref.startsWith('http');
  const detailsLabel = uz ? "AI-chat haqida batafsil" : 'Подробнее об AI-чате';
  const pricingHref = uz ? '/uz/chat-bot-narxi/' : '/ru/tarify-ai-chat/';

  const valueCards = uz
    ? [
        { icon: 'M3 5h18M3 12h18M3 19h12', title: 'RU + UZ', desc: 'Rus va o‘zbek tilida tabiiy javoblar' },
        { icon: 'M4 6h16M4 12h16M4 18h10', title: 'Shablonlar', desc: 'SMM, biznes, o‘qish va savdo uchun' },
        { icon: 'M4 8h16v11H4zM9 8V5h6v3', title: 'Telegram + CRM', desc: 'Arizani menejerga uzatadi' },
        { icon: 'M5 12.5l4.5 4.5L19 7.5', title: 'Tez boshlash', desc: 'Ro‘yxatdan o‘tmasdan darhol yozing' },
      ]
    : [
        { icon: 'M3 5h18M3 12h18M3 19h12', title: 'RU + UZ', desc: 'Ответы на русском и узбекском' },
        { icon: 'M4 6h16M4 12h16M4 18h10', title: 'Шаблоны', desc: 'Для SMM, бизнеса, учёбы и продаж' },
        { icon: 'M4 8h16v11H4zM9 8V5h6v3', title: 'Telegram + CRM', desc: 'Передаёт заявку менеджеру' },
        { icon: 'M5 12.5l4.5 4.5L19 7.5', title: 'Быстрый старт', desc: 'Пишите без регистрации' },
      ];

  const valueCardsHtml = valueCards.map((c) => `<div class="link-card"><span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-cyan/10 border border-brand-cyan/25 text-brand-cyan mb-2"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${c.icon}"/></svg></span><h3 class="text-white font-medium text-sm leading-snug">${escapeText(c.title)}</h3><p class="text-white/50 text-xs mt-1 leading-snug">${escapeText(c.desc)}</p></div>`).join('');

  const pricingTiers = uz
    ? [
        { badge: 'Free', desc: '10 xabar kuniga', features: ['Barcha shablonlar', 'RU + UZ'] },
        { badge: 'Plus · tez orada', desc: 'Ko‘proq xabarlar', features: ['Chat tarixi', 'Ustuvor yordam'] },
        { badge: 'Business', desc: 'AI-bot kaliti bilan', features: ['CRM integratsiya', 'Telegram + Instagram'] },
      ]
    : [
        { badge: 'Free', desc: '10 сообщений в день', features: ['Все шаблоны', 'RU + UZ'] },
        { badge: 'Plus · скоро', desc: 'Больше сообщений', features: ['История чата', 'Приоритетная поддержка'] },
        { badge: 'Business', desc: 'AI-бот под ключ', features: ['CRM интеграция', 'Telegram + Instagram'] },
      ];

  const pricingHtml = pricingTiers.map((t, i) => `<div class="link-card ${i === 2 ? 'border-brand-cyan/30' : ''}"><span class="chip">${escapeText(t.badge)}</span><p class="text-white/80 text-sm mt-3">${escapeText(t.desc)}</p><ul class="mt-2 space-y-1">${t.features.map((f) => `<li class="flex items-center gap-1.5 text-xs text-white/55"><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#2FE6D1" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${escapeText(f)}</li>`).join('')}</ul></div>`).join('');

  const finalCtaTitle = uz ? 'Boshlashga tayyormisiz?' : 'Готовы начать?';
  const finalCtaChatLabel = uz ? 'AI-chatni ochish' : 'Открыть AI-чат';
  const finalCtaB2bLabel = uz ? 'AI-bot buyurtma berish' : 'Заказать AI-бота';

  return `<main id="main" class="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
  <nav aria-label="Breadcrumb" class="text-sm text-white/50 mb-6">
    <a href="/" class="hover:text-white">${escapeHtml(global.siteName)}</a>
    <span class="px-2">/</span>
    <span class="text-white/70">${escapeText(page.breadcrumbLabel || page.h1)}</span>
  </nav>

  <div class="mb-8">
    <h1 data-testid="page-h1" class="font-display text-[1.75rem] sm:text-4xl lg:text-5xl text-white mb-4 leading-tight break-words hyphens-auto">${escapeText(page.h1)}</h1>
    ${modifiedIso ? `<p data-testid="page-updated" class="text-xs uppercase tracking-wider text-white/40 mb-3">${escapeHtml(modifiedLabel)} <time datetime="${modifiedIso}">${escapeHtml(modifiedIso)}</time></p>` : ''}
    ${bylineHtml}
    ${page.heroSubtitle ? `<p class="speakable-intro text-base sm:text-lg text-white/80 mb-6 max-w-2xl">${escapeText(page.heroSubtitle)}</p>` : ''}
    <div class="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-4">
      <a data-testid="page-cta-primary" href="${escapeHtml(primaryHref)}"${primaryExternal ? ' rel="nofollow noopener" target="_blank"' : ''} class="btn-primary text-base w-full sm:w-auto">
        ${escapeText(primaryLabel)}
      </a>
      <a data-testid="page-cta-secondary" href="${escapeHtml(secondaryHref)}"${secondaryExternal ? ' rel="nofollow noopener" target="_blank"' : ''} class="btn-secondary w-full sm:w-auto">
        ${escapeText(secondaryLabel)}
      </a>
    </div>
    ${trustHtml}
  </div>

  ${renderChatConsole(page)}

  <section class="mt-10" data-testid="value-cards">
    <div class="eyebrow mb-3">${uz ? 'Imkoniyatlar' : 'Возможности'}</div>
    <h2 class="font-display text-xl sm:text-2xl mb-5 text-white">${uz ? "Bitta AI-chatda hammasi" : 'Всё в одном AI-чате'}</h2>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${valueCardsHtml}</div>
  </section>

  <section class="mt-10" data-testid="pricing-teaser">
    <div class="eyebrow mb-3">${uz ? 'Tariflar' : 'Тарифы'}</div>
    <h2 class="font-display text-xl sm:text-2xl mb-5 text-white">${uz ? 'Oddiy tariflar' : 'Простые тарифы'}</h2>
    <div class="grid sm:grid-cols-3 gap-3">${pricingHtml}</div>
    <a href="${escapeHtml(pricingHref)}" class="btn-secondary mt-4 text-sm">${uz ? "Tariflarni ko‘rish" : 'Смотреть тарифы'}</a>
  </section>

  <details open class="mt-10 rounded-2xl border border-white/10 bg-bg-surface/50">
    <summary class="cursor-pointer list-none p-5 font-display text-lg text-white flex items-center justify-between gap-4">
      <span>${escapeText(detailsLabel)}</span>
      <span class="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan text-lg transition-transform">+</span>
    </summary>
    <div class="px-5 pb-5">
      <article${contentAnchor ? ` id="${escapeHtml(contentAnchor)}"` : ''} class="prose-invert scroll-mt-24">
        ${(page.bodyBlocks || []).map(renderBlock).join('\n')}
      </article>
    </div>
  </details>

  ${renderFaq(page.faq || [], page.locale === 'uz' ? 'uz' : 'ru')}
  ${renderInternalLinks(page)}
  ${renderRelatedArticles(page, articles)}

  <section class="mt-16 text-center" data-testid="final-cta">
    <h2 class="font-display text-2xl sm:text-3xl text-white mb-5">${escapeText(finalCtaTitle)}</h2>
    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <a href="#ai-console" class="btn-primary text-base">${escapeText(finalCtaChatLabel)}</a>
      <a href="${escapeHtml(global.telegram || '#')}" rel="nofollow noopener" target="_blank" class="btn-secondary text-base">${escapeText(finalCtaB2bLabel)}</a>
    </div>
  </section>
</main>`;
}

function renderPage(page: Page, global: GlobalSEO, cssHref: string | null, jsHref: string | null, articles: BlogArticle[] = [], chatHref: string | null = null): string {
  const fullUrl = `${global.siteUrl}${page.url}`;
  const ogTitle = page.ogTitle || page.title;
  const ogDesc = page.ogDescription || page.description;
  const ogImg = page.ogImage || global.defaultOgImage;
  const ogDims = getImageDims(ogImg);
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

  // E-E-A-T author byline. Named expert from global config (Person schema anchor).
  // Rendered under the H1 on money/niche pages so crawlers and AI engines see a
  // real, attributable author + reviewing organisation. Copy-only, no fake claims.
  const authorName = global.authorName || global.organizationName;
  const authorUrl = page.locale === 'uz' ? '/uz/jamoa/' : (global.authorUrl || '/ru/o-kompanii/');
  const authorLabel = page.locale === 'uz' ? 'Muallif' : 'Автор';
  const orgReviewLabel = page.locale === 'uz'
    ? `${global.siteName} jamoasi tomonidan tekshirilgan`
    : `Проверено командой ${global.siteName}`;
  const showByline = page.pageType === 'money' || page.pageType === 'niche';
  const bylineHtml = showByline
    ? `<p data-testid="page-author" class="text-xs text-white/50 mb-4">${escapeHtml(authorLabel)}: <a href="${escapeHtml(authorUrl)}" class="text-white/70 hover:text-white underline underline-offset-2">${escapeText(authorName)}</a> · ${escapeText(orgReviewLabel)}</p>`
    : '';

  // Mobile sticky conversion bar — commercial pages only, hidden ≥lg.
  const showStickyCta = showByline && !!(page.ctaPrimaryHref || global.defaultCTA.href);
  const stickyCtaHref = page.ctaPrimaryHref || global.defaultCTA.href;
  const stickyCtaLabel = page.ctaPrimaryLabel || global.defaultCTA.label;
  const stickyCtaExternal = stickyCtaHref.startsWith('http');
  const stickyCtaHtml = showStickyCta
    ? `<div class="sticky-cta lg:hidden"><a data-testid="sticky-cta" href="${escapeHtml(stickyCtaHref)}"${stickyCtaExternal ? ' rel="nofollow noopener" target="_blank"' : ''} class="btn-primary w-full text-base">${escapeText(stickyCtaLabel)}</a></div>`
    : '';

  // Trust microcopy chips — copy-only, no fake guarantees. Reused below the
  // primary CTA on every money page. Localised per page.locale.
  const trustChips = (page.heroTrust && page.heroTrust.length) ? page.heroTrust
    : page.locale === 'uz'
    ? ['RU + UZ', 'Telegram demo', 'Murakkab sozlash yo\u2018q', 'Lid menejerga uzatiladi']
    : ['RU + UZ', 'Telegram demo', 'Без сложной настройки', 'Передаёт обращение менеджеру'];
  const trustHtml = `<ul aria-label="${page.locale === 'uz' ? 'Ishonch belgilari' : 'Trust-маркеры'}" class="flex flex-wrap gap-2 text-xs text-white/70 mt-4 mb-10">${trustChips.map((c) => `<li class="px-3 py-1 rounded-full border border-white/10 bg-white/5">${escapeText(c)}</li>`).join('')}</ul>`;

  // Derive the in-page anchor id from ctaSecondaryHref (e.g. "#how" / "#chto-umeet")
  // so the secondary CTA scrolls to the main content article instead of a dead fragment.
  const contentAnchor = (page.ctaSecondaryHref || '').startsWith('#')
    ? page.ctaSecondaryHref.slice(1).trim()
    : '';

  return `<!doctype html>
<html lang="${page.locale === 'uz' ? 'uz' : 'ru'}">
<head>
<script data-tag="gtm">(function(w,d,s,l,i){w[l]=w[l]||[];var started=false;function loadGTM(){if(started)return;started=true;w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);}var evs=['scroll','pointerdown','keydown','touchstart','mousemove'];function onInt(){evs.forEach(function(e){w.removeEventListener(e,onInt)});loadGTM();}evs.forEach(function(e){w.addEventListener(e,onInt,{passive:true,once:true})});if(d.readyState==='complete'){setTimeout(loadGTM,4000);}else{w.addEventListener('load',function(){setTimeout(loadGTM,4000)});}})(window,document,'script','dataLayer','GTM-NLR4WFX8');</script>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#05070D" />
<title>${escapeText(page.title)}</title>
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
${ogImg && ogDims ? `<meta property="og:image:width" content="${ogDims.w}" />` : ''}
${ogImg && ogDims ? `<meta property="og:image:height" content="${ogDims.h}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
<meta name="twitter:description" content="${escapeHtml(ogDesc)}" />
${ogImg ? `<meta name="twitter:image" content="${escapeHtml(ogImg)}" />` : ''}

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" media="print" onload="this.media='all'" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" /></noscript>
<link rel="llms" href="${escapeHtml(global.siteUrl)}/llms.txt" />
${LLM_MARKDOWN_URLS.has(page.url) ? `<link rel="alternate" type="text/markdown" href="${escapeHtml(global.siteUrl)}${escapeHtml(page.url)}index.html.md" />` : ''}
<link rel="icon" type="image/png" href="/assets/landing/2.png" />
${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ''}

<script type="application/ld+json">${buildJsonLd(page, global)}</script>
${ANALYTICS_HEAD}
</head>
<body class="bg-bg-base text-white antialiased ${showStickyCta ? 'pb-24 lg:pb-0' : ''}">
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-bg-base focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:border focus:border-brand-cyan">${page.locale === 'uz' ? 'Asosiy kontentga o\u2018tish' : 'Перейти к основному контенту'}</a>
<noscript data-tag="gtm"><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-NLR4WFX8" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<header class="border-b border-white/5 bg-bg-base/80 backdrop-blur sticky top-0 z-40">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
    <a href="/" class="font-display text-xl text-white" data-testid="back-home">${escapeHtml(global.siteName)}</a>
    <nav class="flex gap-3 text-sm">
      ${hrefRu ? `<a href="${escapeHtml(hrefRu)}" hreflang="ru" class="text-white/70 hover:text-white">RU</a>` : ''}
      ${hrefUz ? `<a href="${escapeHtml(hrefUz)}" hreflang="uz" class="text-white/70 hover:text-white">UZ</a>` : ''}
      <a href="${escapeHtml(page.ctaPrimaryHref || global.defaultCTA.href)}" rel="nofollow noopener" target="_blank" class="bg-grad-cta text-bg-base font-semibold px-4 py-2 rounded-full">
        ${escapeText(page.ctaPrimaryLabel || global.defaultCTA.label)}
      </a>
    </nav>
  </div>
</header>

${page.pageType === 'gpt-chat'
  ? renderGptChatMain(page, global, articles, modifiedIso, modifiedLabel, bylineHtml, trustHtml, contentAnchor)
  : `<main id="main" class="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
  <nav aria-label="Breadcrumb" class="text-sm text-white/50 mb-6">
    <a href="/" class="hover:text-white">${escapeHtml(global.siteName)}</a>
    <span class="px-2">/</span>
    <span class="text-white/70">${escapeText(page.breadcrumbLabel || page.h1)}</span>
  </nav>

  <div class="${page.heroImage ? 'lg:grid lg:grid-cols-2 lg:gap-10 lg:items-center ' : ''}mb-4">
    <div>
      <h1 data-testid="page-h1" class="font-display text-[2rem] sm:text-5xl lg:text-6xl text-white mb-6 leading-tight break-words hyphens-auto">${escapeText(page.h1)}</h1>
      ${modifiedIso ? `<p data-testid="page-updated" class="text-xs uppercase tracking-wider text-white/40 mb-4">${escapeHtml(modifiedLabel)} <time datetime="${modifiedIso}">${escapeHtml(modifiedIso)}</time></p>` : ''}
      ${bylineHtml}
      ${page.heroSubtitle ? `<p class="speakable-intro text-lg text-white/80 mb-8 max-w-2xl">${escapeText(page.heroSubtitle)}</p>` : ''}
      ${page.ctaPrimaryHref ? `<div class="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-4">
        <a data-testid="page-cta-primary" href="${escapeHtml(page.ctaPrimaryHref)}" rel="nofollow noopener" target="_blank" class="btn-primary text-base w-full sm:w-auto">
          ${escapeText(page.ctaPrimaryLabel || 'Демо')}
        </a>
        ${page.ctaSecondaryHref ? `<a href="${escapeHtml(page.ctaSecondaryHref)}" class="btn-secondary w-full sm:w-auto">${escapeText(page.ctaSecondaryLabel || '')}</a>` : ''}
      </div>
      ${trustHtml}` : ''}
    </div>
    ${page.heroImage ? `<div class="mt-8 lg:mt-0"><img src="${escapeHtml(page.heroImage.src)}" alt="${escapeHtml(page.heroImage.alt)}" width="${page.heroImage.width}" height="${page.heroImage.height}" style="aspect-ratio:${page.heroImage.width}/${page.heroImage.height}" class="rounded-2xl border border-white/10 w-full h-auto" loading="eager" fetchpriority="high" decoding="async" /></div>` : ''}
  </div>

  <article${contentAnchor ? ` id="${escapeHtml(contentAnchor)}"` : ''} class="prose-invert scroll-mt-24">
    ${(page.bodyBlocks || []).map(renderBlock).join('\n')}
  </article>

  ${renderFaq(page.faq || [], page.locale === 'uz' ? 'uz' : 'ru')}
  ${renderInternalLinks(page)}
  ${renderRelatedArticles(page, articles)}
</main>`
}

<footer class="border-t border-white/5 mt-20 py-10">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-white/50">
    <span>${escapeHtml(global.siteName)} · ${escapeHtml(global.address || '')}</span>
    <div class="flex items-center gap-4">
      <a href="https://yandex.ru/maps/org/109235624736" rel="nofollow noopener" target="_blank" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 hover:border-brand-cyan/40 transition-colors text-white/50 hover:text-white text-xs" title="${page.locale === 'uz' ? 'GPTBot.uz Yandex Xaritalarda' : 'GPTBot.uz на Яндекс Картах'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#00ff88"/></svg>
        ${page.locale === 'uz' ? 'Yandex Xaritalar' : 'Яндекс Карты'}
      </a>
      <a href="${escapeHtml(global.telegram || '#')}" rel="nofollow noopener" target="_blank" class="hover:text-white">Telegram</a>
    </div>
  </div>
</footer>

${stickyCtaHtml}
${jsHref ? `<!-- React landing bundle is intentionally not loaded on money pages to keep them static and fast. -->` : ''}
${page.pageType === 'gpt-chat' && chatHref ? `<script type="module" src="${chatHref}"></script>` : ''}
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
  const chatHref = findChatAsset();
  let written = 0, skipped = 0;
  for (const page of pages) {
    if (page.status === 'draft') { skipped++; continue; }
    const outPath = path.join(DIST_DIR, page.url, 'index.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, renderPage(page, global, cssHref, jsHref, articles, chatHref), 'utf-8');
    written++;
    console.log(`  + ${outPath.replace(DIST_DIR, 'dist')}`);
  }
  console.log(`Prerendered ${written} page(s), skipped ${skipped} draft(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });

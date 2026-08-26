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
import { ANALYTICS_HEAD } from './analytics-snippet';
import { METRIKA_HEAD, METRIKA_NOSCRIPT } from './analytics-metrika';
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
import {
  MARKET_FAQ_SCRIPT,
  renderMarketFooter,
  renderMarketHeader,
  renderMarketLanding,
  renderMarketTrust,
} from './market-page';

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
import { gptChatNavLinks } from './gpt-chat-nav';
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

// Standalone calculator island. Money pages remain static by default; only a
// page with interactiveTool="telegram-cost-calculator" receives this bundle.
function findCalculatorAsset(): string | null {
  const assetsDir = path.join(DIST_DIR, 'assets');
  if (!fs.existsSync(assetsDir)) return null;
  const file = fs.readdirSync(assetsDir).find((f) => f.startsWith('telegram-cost-calculator-') && f.endsWith('.js'));
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

// Heading ids must be unique per page: the first occurrence keeps the base slug
// (so explicit toc anchors stay valid), repeats get -2/-3… suffixes. Empty slugs
// (symbol-only headings) fall back to "section".
function uniqueHeadingId(raw: string, seen: Map<string, number>): string {
  const base = raw || 'section';
  const n = (seen.get(base) || 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

function renderBlocks(blocks: BodyBlock[]): string {
  const seen = new Map<string, number>();
  return blocks.map((b) => renderBlock(b, seen)).join('\n');
}

// Article wrapper for body blocks. The in-page anchor (from ctaSecondaryHref)
// goes on the wrapper ONLY when no body heading already carries that id —
// otherwise the page would contain duplicate DOM ids and the anchor scroll
// target would be ambiguous. When a heading owns the id, the CTA scrolls to it.
function renderArticle(blocks: BodyBlock[], anchor: string): string {
  const bodyHtml = renderBlocks(blocks);
  const idAttr = anchor && !bodyHtml.includes(` id="${anchor}"`) ? ` id="${escapeHtml(anchor)}"` : '';
  return `<article${idAttr} class="prose-invert scroll-mt-24">
    ${bodyHtml}
  </article>`;
}

function renderBlock(b: BodyBlock, headingIds: Map<string, number> = new Map()): string {
  switch (b.type) {
    case 'h2': { const _id = uniqueHeadingId(b.id || slugifyId(b.text || ''), headingIds); return `<h2 id="${escapeHtml(_id)}" class="font-display text-3xl sm:text-4xl mt-16 mb-6 text-white scroll-mt-24 break-words">${escapeText(b.text || '')}</h2>`; }
    case 'h3': { const _id = uniqueHeadingId(b.id || slugifyId(b.text || ''), headingIds); return `<h3 id="${escapeHtml(_id)}" class="font-display text-2xl mt-10 mb-4 text-white scroll-mt-24 break-words">${escapeText(b.text || '')}</h3>`; }
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
        const a = `<a href="${escapeHtml(l.target)}"${_ext ? ' rel="noopener noreferrer" target="_blank"' : ''} class="text-brand-cyan hover:underline">${escapeText(l.anchor)}</a>`;
        html = html.split(`{${l.token}}`).join(a);
      }
      return `<p class="text-base text-white/80 leading-relaxed mb-4">${html}</p>`;
    }
    case 'p': return `<p class="text-base text-white/80 leading-relaxed mb-4">${escapeText(b.text || '')}</p>`;
    case 'list': {
      if (b.copyableItems) {
        const items = (b.items || []).map((item) => `<li data-copy-item class="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <p data-prompt-text class="text-white/85 leading-relaxed mb-4">${escapeText(item)}</p>
          <button type="button" data-copy-prompt aria-label="Скопировать этот промпт" class="inline-flex items-center justify-center rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-4 py-2 text-sm font-semibold text-brand-cyan hover:bg-brand-cyan/20 focus:outline-none focus:ring-2 focus:ring-brand-cyan/60">
            <span data-copy-label>Скопировать</span>
          </button>
        </li>`).join('');
        return `<ul data-copy-list class="grid gap-4 text-white/80 mb-8 list-none p-0">${items}<li class="sr-only" data-copy-status aria-live="polite"></li></ul>`;
      }
      return `<ul class="space-y-3 text-white/80 mb-6">${(b.items || []).map((i) => `<li class="flex gap-3 items-start"><span class="mt-1 shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-md bg-brand-cyan/12 border border-brand-cyan/30"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#2FE6D1" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>${escapeText(i)}</span></li>`).join('')}</ul>`;
    }
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
    case 'cta': { const _isExt = (b.href || '').startsWith('http'); return `<div class="my-10"><a href="${escapeHtml(b.href || '#')}"${_isExt ? ' rel="nofollow noopener noreferrer" target="_blank"' : ''} class="btn-primary text-base w-full sm:w-auto">${escapeText(b.text || 'Запустить')}</a></div>`; }
    case 'table': {
      const headers = b.headers || [];
      const rows = b.rows || [];
      const thead = headers.length ? `<thead><tr>${headers.map(h => `<th class="px-4 py-3 text-left text-brand-cyan font-semibold text-sm uppercase tracking-wider border-b border-white/10">${escapeText(h)}</th>`).join('')}</tr></thead>` : '';
      const tbody = `<tbody>${rows.map((row, ri) => `<tr class="${ri % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.05] transition-colors">${row.map(cell => `<td class="px-4 py-3 text-white/80 text-sm border-b border-white/5">${escapeText(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      return `<div class="overflow-x-auto my-8 rounded-2xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-brand-cyan/60" role="region" aria-label="Таблица данных — прокрутите горизонтально при необходимости" tabindex="0"><table class="w-full">${thead}${tbody}</table></div>`;
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

function renderSources(page: Page): string {
  if (!page.sources?.length) return '';
  const heading = page.locale === 'uz' ? 'Birlamchi manbalar' : 'Первичные источники';
  const intro = page.locale === 'uz'
    ? 'Sahifadagi metodika va tavsiyalarni tekshirish uchun ishlatilgan hujjatlar.'
    : 'Документы, по которым проверены методика и рекомендации этой страницы.';
  const items = page.sources.map((source) => `
    <li class="link-card">
      <a href="${escapeHtml(source.url)}" rel="noopener noreferrer" class="text-brand-cyan hover:underline font-medium">${escapeText(source.title)}</a>
      ${source.note ? `<p class="mt-2 mb-0 text-sm text-white/65 leading-relaxed">${escapeText(source.note)}</p>` : ''}
    </li>
  `).join('');
  return `<section data-testid="page-sources" class="mt-16" aria-labelledby="page-sources-heading">
    <h2 id="page-sources-heading" class="font-display text-2xl sm:text-3xl mb-3 text-white">${escapeText(heading)}</h2>
    <p class="text-sm text-white/60 mb-5">${escapeText(intro)}</p>
    <ol class="grid gap-3 list-none p-0">${items}</ol>
  </section>`;
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
    const articleNode = buildArticleLd({
      global,
      url: page.url,
      headline: page.h1 || page.title,
      description: page.description,
      locale: page.locale === 'uz' ? 'uz' : 'ru',
      datePublished: page.createdAt ? new Date(page.createdAt).toISOString().slice(0, 10) : undefined,
      dateModified: dateModifiedIso,
      primaryImage: page.ogImage || global.defaultOgImage,
    });
    if (page.sources?.length) articleNode.citation = page.sources.map((source) => source.url);
    graph.push(articleNode);
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

// Full-viewport app shell for pageType === 'gpt-chat'. The chat island owns
// the entire first screen (sidebar + header + messages + composer). Indexable
// content is a compact, VISIBLE summary <section> + mini footer BELOW the app
// — the long-form material lives on the dedicated guide page.
function renderGptChatMain(page: Page, global: GlobalSEO): string {
  const uz = page.locale === 'uz';
  const noscript = uz
    ? 'AI-chatdan foydalanish uchun JavaScript’ni yoqing yoki Telegram’da bizga yozing.'
    : 'Включите JavaScript, чтобы пользоваться AI-чатом, или напишите нам в Telegram.';
  const loading = uz ? 'AI-chat yuklanmoqda…' : 'AI-чат загружается…';
  const appLabel = uz ? 'AI-chat ilovasi' : 'Приложение AI-чата';
  const navLabel = uz ? 'Foydali sahifalar' : 'Полезные страницы';
  const links = gptChatNavLinks(page);

  return `<main id="main" aria-label="${escapeHtml(appLabel)}" class="relative" style="height:100vh;height:100dvh">
  <!-- ym-hide-content: Webvisor is on for counter 111312750, and everything the
       chat renders inside this element is either what the visitor typed or what
       the model answered. The mount point carries the class so the masking
       survives React replacing its children. -->
  <div id="gpt-chat-root" data-locale="${uz ? 'uz' : 'ru'}" data-api-base="" class="h-full ym-hide-content">
    <noscript><p class="p-6 text-sm text-white/70">${escapeText(noscript)}</p></noscript>
    <div class="flex h-full items-center justify-center text-sm text-white/40">${loading}</div>
  </div>
</main>

<section data-testid="seo-summary" class="border-t border-white/[0.06]">
  <div class="max-w-3xl mx-auto px-4 sm:px-6 py-10">
    <h1 data-testid="page-h1" class="font-display text-xl text-white mb-4">${escapeText(page.h1)}</h1>
    <div class="prose-invert">
      ${(page.bodyBlocks || []).map((block) => renderBlock(block)).join('\n')}
    </div>
    <nav aria-label="${escapeHtml(navLabel)}" class="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
      ${links.map((l) => `<a href="${escapeHtml(l.href)}" class="text-brand-cyan hover:underline underline-offset-4">${escapeText(l.text)}</a>`).join('\n      ')}
    </nav>
  </div>
</section>

<footer class="border-t border-white/[0.06] py-6">
  <div class="max-w-3xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-white/40">
    <span>${escapeHtml(global.siteName)} · ${escapeHtml(global.address || '')}</span>
    <a href="${escapeHtml(global.telegram || '#')}" rel="nofollow noopener noreferrer" target="_blank" class="hover:text-white">Telegram</a>
  </div>
</footer>`;
}

function renderDigitalCommandHero(
  page: Page,
  modifiedIso: string,
  modifiedLabel: string,
  bylineHtml: string,
  trustHtml: string,
): string {
  const primaryHref = page.ctaPrimaryHref || '#audit';
  const secondaryHref = page.ctaSecondaryHref || '#system';
  const command = page.commandCenter || {};
  const pipeline = command.pipeline && command.pipeline.length
    ? command.pipeline.slice(0, 4)
    : [
      { step: '01', title: 'Спрос', detail: 'SEO · Ads · Social' },
      { step: '02', title: 'Конверсия', detail: 'Сайт · Контент · Оффер' },
      { step: '03', title: 'Диалог', detail: 'AI-бот · Менеджер' },
      { step: '04', title: 'Выручка', detail: 'CRM · Аналитика' },
    ];
  const signals = (command.signals && command.signals.length ? command.signals : ['SEO', 'SMM', 'CRM']).slice(0, 3);
  const channels = (command.channels && command.channels.length
    ? command.channels
    : ['Стратегия', 'SEO', 'Google Ads', 'Meta', 'Telegram', 'Контент', 'CRM', 'AI']).slice(0, 8);
  const heroSrcSet = page.heroImage && /-1200\.webp$/.test(page.heroImage.src)
    ? `${page.heroImage.src.replace('-1200.webp', '-480.webp')} 480w, ${page.heroImage.src.replace('-1200.webp', '-800.webp')} 800w, ${page.heroImage.src} 1200w`
    : '';
  return `<section class="dc-hero" aria-labelledby="digital-command-title">
    <div class="dc-orbit dc-orbit-one" aria-hidden="true"></div>
    <div class="dc-orbit dc-orbit-two" aria-hidden="true"></div>
    <div class="dc-hero-copy">
      <div class="dc-kicker"><span></span> ${escapeText(command.kicker || 'Growth system · Tashkent')}</div>
      <h1 id="digital-command-title" data-testid="page-h1">${escapeText(page.h1)}</h1>
      ${modifiedIso ? `<p data-testid="page-updated" class="dc-updated">${escapeHtml(modifiedLabel)} <time datetime="${modifiedIso}">${escapeHtml(modifiedIso)}</time></p>` : ''}
      ${bylineHtml}
      ${page.heroSubtitle ? `<p class="speakable-intro dc-lead">${escapeText(page.heroSubtitle)}</p>` : ''}
      <div class="dc-actions">
        <a data-testid="page-cta-primary" href="${escapeHtml(primaryHref)}"${primaryHref.startsWith('http') ? ' rel="nofollow noopener noreferrer" target="_blank"' : ''} class="btn-primary">${escapeText(page.ctaPrimaryLabel || 'Получить разбор')}</a>
        <a href="${escapeHtml(secondaryHref)}" class="btn-secondary">${escapeText(page.ctaSecondaryLabel || 'Посмотреть систему')}</a>
      </div>
      ${trustHtml}
    </div>
    <div class="dc-visual" aria-label="${escapeHtml(command.ariaLabel || 'Система digital-маркетинга от первого контакта до продажи')}">
      ${page.heroImage ? `<img src="${escapeHtml(page.heroImage.src)}"${heroSrcSet ? ` srcset="${escapeHtml(heroSrcSet)}" sizes="(max-width: 900px) calc(100vw - 2rem), 540px"` : ''} alt="${escapeHtml(page.heroImage.alt)}" width="${page.heroImage.width}" height="${page.heroImage.height}" style="aspect-ratio:${page.heroImage.width}/${page.heroImage.height}" loading="eager" fetchpriority="high" decoding="async" />` : ''}
      <div class="dc-glass">
        <div class="dc-glass-head"><span>${escapeText(command.status || 'Growth pipeline')}</span><span class="dc-live">live</span></div>
        <ol class="dc-pipeline">
          ${pipeline.map((item) => `<li><span>${escapeText(item.step)}</span><b>${escapeText(item.title)}</b><small>${escapeText(item.detail)}</small></li>`).join('')}
        </ol>
      </div>
      ${signals.map((signal, index) => `<div class="dc-signal dc-signal-${['a', 'b', 'c'][index]}">${escapeText(signal)}</div>`).join('')}
    </div>
  </section>
  <section class="dc-channel-strip" aria-label="Каналы и этапы системы продвижения">
    ${channels.map((channel) => `<span>${escapeText(channel)}</span>`).join('')}
  </section>`;
}

function renderGrowthTool(page: Page): string {
  if (!page.growthTool) return '';
  const commonStart = `<section class="growth-tool" data-growth-tool="${escapeHtml(page.growthTool)}" aria-labelledby="growth-tool-title"><div class="growth-tool-kicker">Инструмент для решения</div>`;
  if (page.growthTool === 'cpl-calculator') return `${commonStart}
    <h2 id="growth-tool-title">Рассчитайте предельную стоимость лида</h2>
    <p>Экономическая граница, а не обещание рекламной площадки. Все значения остаются в вашем браузере.</p>
    <div class="growth-tool-grid">
      <label>Средний чек, сум<input name="check" type="number" min="0" inputmode="decimal" value="3000000"></label>
      <label>Валовая маржа, %<input name="margin" type="number" min="1" max="100" value="40"></label>
      <label>Продажа из лида, %<input name="close" type="number" min="1" max="100" value="15"></label>
      <label>Доля маржи на привлечение, %<input name="share" type="number" min="1" max="100" value="30"></label>
    </div><button type="button" data-tool-action>Рассчитать ориентир</button><div class="growth-tool-result" aria-live="polite">Введите экономику продукта и нажмите «Рассчитать».</div>
  </section>`;
  if (page.growthTool === 'creative-matrix') return `${commonStart}
    <h2 id="growth-tool-title">Соберите первый тест креативов</h2>
    <p>Выберите задачу — получите компактную матрицу гипотез, а не случайный набор баннеров.</p>
    <div class="growth-choice" role="group" aria-label="Цель рекламного теста">
      <button type="button" data-tool-choice="lead">Заявки</button><button type="button" data-tool-choice="dialog">Диалоги</button><button type="button" data-tool-choice="remarketing">Возврат аудитории</button>
    </div><div class="growth-tool-result" aria-live="polite">Выберите цель кампании.</div>
  </section>`;
  if (page.growthTool === 'telegram-funnel') return `${commonStart}
    <h2 id="growth-tool-title">Спроектируйте путь после Telegram Ads</h2>
    <p>Реклама приводит внимание. Следующий шаг должен соответствовать задаче и быть измеримым.</p>
    <div class="growth-choice" role="group" aria-label="Куда направлять трафик">
      <button type="button" data-tool-choice="bot">В бот</button><button type="button" data-tool-choice="channel">В канал</button><button type="button" data-tool-choice="site">На сайт</button>
    </div><div class="growth-tool-result" aria-live="polite">Выберите точку назначения.</div>
  </section>`;
  if (page.growthTool === 'audit-heatmap') return `${commonStart}
    <h2 id="growth-tool-title">Экспресс-диагностика потерь</h2>
    <p>Отметьте симптомы. Инструмент покажет, какой участок воронки проверять первым.</p>
    <div class="growth-checks">
      <label><input type="checkbox" value="traffic"> Клики есть, заявок мало</label>
      <label><input type="checkbox" value="quality"> Заявки есть, продажи не растут</label>
      <label><input type="checkbox" value="speed"> Менеджеры отвечают с задержкой</label>
      <label><input type="checkbox" value="data"> Реклама и CRM показывают разные цифры</label>
    </div><button type="button" data-tool-action>Показать приоритет</button><div class="growth-tool-result" aria-live="polite">Отметьте один или несколько симптомов.</div>
  </section>`;
  return `${commonStart}
    <h2 id="growth-tool-title">Какой канал проверить первым</h2>
    <p>Выберите текущую ситуацию — получите стартовый маршрут. Финальный медиаплан строится после проверки спроса и экономики.</p>
    <div class="growth-choice" role="group" aria-label="Ситуация бизнеса">
      <button type="button" data-tool-choice="hot">Есть сформированный спрос</button><button type="button" data-tool-choice="visual">Нужно создать интерес</button><button type="button" data-tool-choice="telegram">Аудитория в Telegram</button><button type="button" data-tool-choice="unknown">Причина потерь неясна</button>
    </div><div class="growth-tool-result" aria-live="polite">Выберите ситуацию.</div>
  </section>`;
}

const GROWTH_TOOL_SCRIPT = `<script>
(function(){
  var root=document.querySelector('[data-growth-tool]');if(!root)return;
  var out=root.querySelector('.growth-tool-result'),tool=root.getAttribute('data-growth-tool');
  function track(choice){if(window.gtag)window.gtag('event','seo_tool_complete',{page_path:location.pathname,tool_name:tool,choice_id:choice||'calculate'});}
  function show(html,choice){out.innerHTML=html;track(choice);}
  root.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
    var choice=b.getAttribute('data-tool-choice');
    if(tool==='cpl-calculator'){
      var check=Number(root.querySelector('[name=check]').value),margin=Number(root.querySelector('[name=margin]').value)/100,close=Number(root.querySelector('[name=close]').value)/100,share=Number(root.querySelector('[name=share]').value)/100;
      if(!(check>0&&margin>0&&close>0&&share>0)){show('<strong>Проверьте значения:</strong> все поля должны быть больше нуля.','invalid');return;}
      var cpl=check*margin*close*share;show('<strong>Предельный CPL: '+Math.round(cpl).toLocaleString('ru-RU')+' сум.</strong><br><small>Формула: чек × маржа × конверсия лида в продажу × допустимая доля маржи. Это верхняя экономическая граница, не прогноз площадки.</small>','calculated');return;
    }
    if(tool==='creative-matrix'){
      var creative={lead:'<strong>Тест на заявки:</strong> 3 угла сообщения × 2 формата × одна посадочная. Сравнивайте стоимость квалифицированной заявки.',dialog:'<strong>Тест на диалоги:</strong> вопрос клиента × короткий ответ × переход в Direct/бот. Измеряйте начатые и квалифицированные диалоги.',remarketing:'<strong>Ремаркетинг:</strong> доказательство × возражение × конкретный следующий шаг. Исключите уже сконвертировавшихся пользователей.'};show(creative[choice],choice);return;
    }
    if(tool==='telegram-funnel'){
      var paths={bot:'<strong>Ads → бот → 3–5 вопросов → контакт → CRM → менеджер.</strong> Подходит для квалификации и быстрого ответа.',channel:'<strong>Ads → релевантный пост → закреплённый оффер → бот или менеджер.</strong> Подходит, когда сначала нужно прогреть контентом.',site:'<strong>Ads → одна посадочная → целевое действие → аналитика → CRM.</strong> Подходит для сложного оффера и поискового контекста.'};show(paths[choice],choice);return;
    }
    if(tool==='audit-heatmap'){
      var v=Array.from(root.querySelectorAll('input:checked')).map(function(x){return x.value});if(!v.length){show('<strong>Отметьте хотя бы один симптом.</strong>','empty');return;}
      var priority=v.indexOf('data')>-1?'Сначала сверить события, UTM и статусы CRM. Без сопоставимых данных дальнейшие выводы ненадёжны.':v.indexOf('quality')>-1?'Сначала проверить квалификацию, обещание в рекламе и обратную связь отдела продаж.':v.indexOf('traffic')>-1?'Сначала проверить соответствие запрос → объявление → посадочная → действие.':'Сначала измерить время первого ответа и маршрут передачи обращения.';show('<strong>Приоритет:</strong> '+priority,'diagnosed');return;
    }
    var routes={hot:'<strong>Начните с контекстной рекламы:</strong> она перехватывает уже сформированный спрос. Затем проверьте посадочную и обработку лида.',visual:'<strong>Начните с таргетированной рекламы:</strong> проверьте оффер через системные тесты креативов и аудиторий.',telegram:'<strong>Проверьте Telegram Ads:</strong> ведите в релевантный канал, бот или посадочную и измеряйте путь после клика.',unknown:'<strong>Начните с маркетингового аудита:</strong> сначала найдите узкое место, затем выбирайте канал.'};show(routes[choice],choice);
  });
})();
</script>`;

const PROMPT_COPY_SCRIPT = `<script>
(function(){
  var root=document.querySelector('[data-copy-list]');if(!root)return;
  function fallbackCopy(text){var field=document.createElement('textarea');field.value=text;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();var ok=document.execCommand('copy');field.remove();if(!ok)throw new Error('copy failed');}
  function write(text){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text);fallbackCopy(text);return Promise.resolve();}
  document.addEventListener('click',function(event){
    var button=event.target.closest('[data-copy-prompt]');if(!button)return;
    var item=button.closest('[data-copy-item]'),textNode=item&&item.querySelector('[data-prompt-text]');if(!textNode)return;
    var list=button.closest('[data-copy-list]'),status=list&&list.querySelector('[data-copy-status]'),label=button.querySelector('[data-copy-label]');
    write(textNode.textContent.trim()).then(function(){if(label)label.textContent='Скопировано';button.setAttribute('aria-label','Промпт скопирован');if(status)status.textContent='Промпт скопирован в буфер обмена.';setTimeout(function(){if(label)label.textContent='Скопировать';button.setAttribute('aria-label','Скопировать этот промпт');},1800);}).catch(function(){if(status)status.textContent='Не удалось скопировать. Выделите текст вручную.';});
  });
})();
</script>`;

const DIGITAL_COMMAND_STYLES = `<style>
  .dc-page{overflow-x:clip;background:
    radial-gradient(circle at 14% 10%,rgba(47,230,209,.09),transparent 26rem),
    radial-gradient(circle at 88% 18%,rgba(126,92,255,.14),transparent 30rem),
    #05070d}
  .dc-shell{max-width:72rem}
  .dc-hero{position:relative;display:grid;grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr);gap:3.5rem;align-items:center;padding:3.5rem 0 2rem;overflow:clip;isolation:isolate}
  .dc-hero-copy,.dc-visual{position:relative;z-index:2}
  .dc-kicker{display:inline-flex;align-items:center;gap:.65rem;padding:.55rem .85rem;border:1px solid rgba(47,230,209,.22);border-radius:999px;background:rgba(47,230,209,.06);color:#8ff8ec;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.13em}
  .dc-kicker span{width:.48rem;height:.48rem;border-radius:50%;background:#2fe6d1;box-shadow:0 0 0 .28rem rgba(47,230,209,.12)}
  .dc-hero h1{max-width:13ch;margin:1.25rem 0 1.2rem;font-family:Geist,system-ui,sans-serif;font-size:clamp(2.65rem,6vw,5.5rem);font-weight:650;line-height:.94;letter-spacing:-.055em;text-wrap:balance}
  .dc-lead{max-width:42rem;margin-bottom:1.7rem;color:rgba(255,255,255,.76);font-size:clamp(1.03rem,1.8vw,1.23rem);line-height:1.65}
  .dc-updated{margin-bottom:.65rem;color:rgba(255,255,255,.42);font-size:.72rem;text-transform:uppercase;letter-spacing:.09em}
  .dc-actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:.35rem}
  .dc-actions a{min-height:3rem}
  .dc-visual{min-height:37rem;border:1px solid rgba(255,255,255,.1);border-radius:2rem;overflow:hidden;background:#0b1020;box-shadow:0 2.5rem 6rem rgba(0,0,0,.45)}
  .dc-visual:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 28%,rgba(5,7,13,.3) 58%,rgba(5,7,13,.96));pointer-events:none}
  .dc-visual>img{width:100%;height:100%;min-height:37rem;object-fit:cover;filter:saturate(.9) contrast(1.04)}
  .dc-glass{position:absolute;z-index:3;left:1.2rem;right:1.2rem;bottom:1.2rem;padding:1rem;border:1px solid rgba(255,255,255,.13);border-radius:1.25rem;background:rgba(6,10,20,.78);backdrop-filter:blur(18px)}
  .dc-glass-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem;color:rgba(255,255,255,.68);font-size:.7rem;text-transform:uppercase;letter-spacing:.12em}
  .dc-live{color:#2fe6d1}
  .dc-live:before{content:"";display:inline-block;width:.45rem;height:.45rem;margin-right:.4rem;border-radius:50%;background:#2fe6d1;box-shadow:0 0 .85rem #2fe6d1}
  .dc-pipeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem}
  .dc-pipeline li{min-width:0;padding:.72rem;border:1px solid rgba(255,255,255,.08);border-radius:.9rem;background:rgba(255,255,255,.04)}
  .dc-pipeline span{display:block;margin-bottom:.45rem;color:#2fe6d1;font-size:.65rem}
  .dc-pipeline b,.dc-pipeline small{display:block}
  .dc-pipeline b{font-size:.82rem}
  .dc-pipeline small{margin-top:.24rem;color:rgba(255,255,255,.45);font-size:.58rem;line-height:1.35}
  .dc-signal{position:absolute;z-index:4;display:grid;place-items:center;width:3.6rem;height:3.6rem;border:1px solid rgba(255,255,255,.18);border-radius:1rem;background:rgba(5,7,13,.7);box-shadow:0 .8rem 2rem rgba(0,0,0,.35);backdrop-filter:blur(12px);color:#fff;font-size:.72rem;font-weight:750}
  .dc-signal-a{top:1.2rem;left:1.1rem}.dc-signal-b{top:4.6rem;right:1rem}.dc-signal-c{top:12rem;left:1.3rem}
  .dc-channel-strip{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));margin:1rem 0 4.5rem;border:1px solid rgba(255,255,255,.08);border-radius:1.25rem;overflow:hidden;background:rgba(255,255,255,.025)}
  .dc-channel-strip span{padding:1rem .5rem;border-right:1px solid rgba(255,255,255,.07);color:rgba(255,255,255,.58);font-size:.72rem;font-weight:650;text-align:center;text-transform:uppercase;letter-spacing:.06em}
  .dc-channel-strip span:last-child{border-right:0}
  .dc-orbit{position:absolute;z-index:-1;border:1px solid rgba(47,230,209,.08);border-radius:50%;pointer-events:none}
  .dc-orbit-one{width:27rem;height:27rem;right:-8rem;top:1rem}.dc-orbit-two{width:18rem;height:18rem;left:-10rem;bottom:-3rem}
  .dc-page .prose-invert h2{max-width:19ch;text-wrap:balance}
  .dc-page .prose-invert>h2:before{content:"";display:block;width:2.7rem;height:.2rem;margin-bottom:1rem;border-radius:999px;background:linear-gradient(90deg,#2fe6d1,#7e5cff)}
  .dc-page .prose-invert>div[class*="overflow-x-auto"],.dc-page .prose-invert>nav{box-shadow:0 1.5rem 4rem rgba(0,0,0,.16)}
  .growth-tool{max-width:56rem;margin:0 auto 4.5rem;padding:clamp(1.25rem,4vw,2.25rem);border:1px solid rgba(47,230,209,.18);border-radius:1.75rem;background:linear-gradient(145deg,rgba(47,230,209,.07),rgba(126,92,255,.08));box-shadow:0 2rem 5rem rgba(0,0,0,.24)}
  .growth-tool-kicker{margin-bottom:.65rem;color:#8ff8ec;font-size:.7rem;font-weight:750;text-transform:uppercase;letter-spacing:.14em}.growth-tool h2{margin:0 0 .75rem;font-size:clamp(1.65rem,4vw,2.55rem);line-height:1.05;letter-spacing:-.035em}.growth-tool>p{max-width:47rem;margin-bottom:1.35rem;color:rgba(255,255,255,.68);line-height:1.65}
  .growth-tool-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.growth-tool label{display:grid;gap:.45rem;color:rgba(255,255,255,.72);font-size:.82rem}.growth-tool input[type=number]{min-height:3rem;width:100%;padding:.65rem .8rem;border:1px solid rgba(255,255,255,.14);border-radius:.85rem;background:rgba(5,7,13,.68);color:#fff;font:inherit}.growth-tool input:focus,.growth-tool button:focus-visible{outline:3px solid rgba(47,230,209,.4);outline-offset:2px}
  .growth-tool button{min-height:3rem;margin-top:1rem;padding:.7rem 1rem;border:1px solid rgba(47,230,209,.3);border-radius:.9rem;background:rgba(47,230,209,.1);color:#c8fff8;font-weight:750;cursor:pointer}.growth-tool button:hover{background:rgba(47,230,209,.18)}.growth-choice{display:flex;flex-wrap:wrap;gap:.65rem}.growth-choice button{margin-top:0}.growth-tool-result{margin-top:1.15rem;padding:1rem 1.1rem;border:1px solid rgba(255,255,255,.1);border-radius:1rem;background:rgba(5,7,13,.56);color:rgba(255,255,255,.78);line-height:1.55}.growth-tool-result strong{color:#fff}.growth-tool-result small{color:rgba(255,255,255,.58)}.growth-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.growth-checks label{display:flex;align-items:flex-start;gap:.65rem;padding:.8rem;border:1px solid rgba(255,255,255,.08);border-radius:.9rem;background:rgba(255,255,255,.03)}.growth-checks input{margin-top:.18rem;accent-color:#2fe6d1}
  @media(max-width:900px){.dc-hero{grid-template-columns:1fr;gap:2rem;padding-top:2rem}.dc-hero h1{max-width:16ch}.dc-visual{min-height:31rem}.dc-visual>img{min-height:31rem}.dc-channel-strip{grid-template-columns:repeat(4,1fr)}.dc-channel-strip span:nth-child(4n){border-right:0}}
  @media(max-width:560px){.dc-hero h1{font-size:2.7rem}.dc-visual{min-height:28rem;border-radius:1.4rem}.dc-visual>img{min-height:28rem}.dc-pipeline{grid-template-columns:repeat(2,1fr)}.dc-signal{display:none}.dc-channel-strip{grid-template-columns:repeat(2,1fr);margin-bottom:3rem}.dc-channel-strip span:nth-child(2n){border-right:0}.growth-tool-grid,.growth-checks{grid-template-columns:1fr}.growth-choice{display:grid}.growth-choice button{width:100%}}
  @media(prefers-reduced-motion:no-preference){.dc-live:before{animation:dc-pulse 2.2s ease-in-out infinite}.dc-signal{animation:dc-float 5s ease-in-out infinite}.dc-signal-b{animation-delay:-1.5s}.dc-signal-c{animation-delay:-3s}@keyframes dc-pulse{50%{opacity:.35;transform:scale(.75)}}@keyframes dc-float{50%{transform:translateY(-8px)}}}
</style>`;

function renderPage(page: Page, global: GlobalSEO, cssHref: string | null, jsHref: string | null, articles: BlogArticle[] = [], chatHref: string | null = null, calculatorHref: string | null = null): string {
  const marketVariant = page.designVariant === 'warm-market-signals';
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
  // An hreflang annotation describes a SET of alternates. 110 pages here are
  // authored in one locale only and declare just their own URL, which rendered
  // as a single self-referencing <link rel="alternate">: a one-member set that
  // says nothing and that Google ignores. Emit the annotation only when there
  // is a real pair to annotate. This is markup hygiene, not a ranking lever —
  // the content model already treats a single-locale page as valid
  // (see the missing-hreflang rule in src/shared/audit.ts).
  const hasAlternatePair = Boolean(hrefRu && hrefUz);
  const altRu = hasAlternatePair ? hrefRu : '';
  const altUz = hasAlternatePair ? hrefUz : '';
  const xDefaultHref = hasAlternatePair ? hrefRu : '';

  // Freshness layer: prefer lastReviewedAt (human-curated) over updatedAt
  // (auto-touched by every admin save). Falls back gracefully to nothing if
  // neither is present. Used by both the visible "Обновлено" badge and the
  // dateModified property in Service JSON-LD.
  const rawModified = page.lastReviewedAt || page.updatedAt || '';
  const modifiedIso = rawModified ? new Date(rawModified).toISOString().slice(0, 10) : '';
  const modifiedLabel = page.locale === 'uz' ? 'Yangilangan' : 'Обновлено';

  // E-E-A-T author byline. Named expert from global config (Person schema anchor).
  // Rendered under the H1 on commercial pages and content pages that explicitly
  // declare Article schema. Copy-only, no invented credentials or review claims.
  const authorName = global.authorName || global.organizationName;
  const authorUrl = page.locale === 'uz' ? '/uz/muallif-boris-gerasimov/' : (global.authorUrl || '/ru/avtor-boris-gerasimov/');
  const authorLabel = page.locale === 'uz' ? 'Muallif' : 'Автор';
  const orgReviewLabel = page.locale === 'uz'
    ? `${global.siteName} jamoasi tomonidan tekshirilgan`
    : `Проверено командой ${global.siteName}`;
  const isCommercialPage = page.pageType === 'money' || page.pageType === 'niche';
  const showByline = isCommercialPage || page.schemaTypes?.includes('Article');
  const bylineHtml = showByline
    ? `<p data-testid="page-author" class="text-xs text-white/50 mb-4">${escapeHtml(authorLabel)}: <a href="${escapeHtml(authorUrl)}" class="text-white/70 hover:text-white underline underline-offset-2">${escapeText(authorName)}</a>${isCommercialPage ? ` · ${escapeText(orgReviewLabel)}` : ''}</p>`
    : '';

  // Mobile sticky conversion bar — commercial pages only, hidden ≥lg.
  const showStickyCta = isCommercialPage && !!(page.ctaPrimaryHref || global.defaultCTA.href);
  const stickyCtaHref = page.ctaPrimaryHref || global.defaultCTA.href;
  const stickyCtaLabel = page.ctaPrimaryLabel || global.defaultCTA.label;
  const stickyCtaExternal = stickyCtaHref.startsWith('http');
  const stickyCtaHtml = showStickyCta
    ? `<div class="sticky-cta lg:hidden"><a data-testid="sticky-cta" href="${escapeHtml(stickyCtaHref)}"${stickyCtaExternal ? ' rel="nofollow noopener noreferrer" target="_blank"' : ''} class="btn-primary w-full text-base">${escapeText(stickyCtaLabel)}</a></div>`
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
  const calculatorHtml = page.interactiveTool === 'telegram-cost-calculator'
    ? `<section id="calculator" aria-labelledby="calculator-heading" class="scroll-mt-24 mb-16">
      <div class="eyebrow mb-3">Интерактивный расчёт</div>
      <h2 id="calculator-heading" class="font-display text-3xl sm:text-4xl text-white mb-4">Рассчитайте ориентир за 2 минуты</h2>
      <p class="text-base text-white/70 leading-relaxed mb-8">Выберите задачу и функции. Калькулятор покажет диапазон бюджета, срок и сформирует мини-ТЗ для обсуждения.</p>
      <div id="telegram-cost-calculator-root">
        <noscript><p class="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5 text-amber-100/85">Для интерактивного расчёта включите JavaScript. Таблица ориентиров и методология доступны ниже на странице.</p></noscript>
      </div>
    </section>`
    : '';
  const hasCopyablePrompts = page.bodyBlocks?.some((block) => block.copyableItems) ?? false;

  return `<!doctype html>
<html lang="${page.locale === 'uz' ? 'uz' : 'ru'}">
<head>
<meta charset="UTF-8" />
<script data-tag="gtm">(function(w,d,s,l,i){var h=w.location.hostname||'';if(h==='localhost'||h==='127.0.0.1'||h==='::1'||h==='[::1]'||h==='0.0.0.0'||h.slice(-6)==='.local')return;w[l]=w[l]||[];var started=false;function loadGTM(){if(started)return;started=true;w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);}function idleLoad(){if('requestIdleCallback' in w){w.requestIdleCallback(loadGTM,{timeout:3000});}else{setTimeout(loadGTM,200);}}var evs=['scroll','pointerdown','keydown','touchstart','mousemove'];function onInt(){evs.forEach(function(e){w.removeEventListener(e,onInt)});idleLoad();}evs.forEach(function(e){w.addEventListener(e,onInt,{passive:true,once:true})});if(d.readyState==='complete'){setTimeout(idleLoad,2500);}else{w.addEventListener('load',function(){setTimeout(idleLoad,2500)});}setTimeout(idleLoad,8000);})(window,document,'script','dataLayer','GTM-NLR4WFX8');</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="${marketVariant ? '#FFF8EC' : '#05070D'}" />
<title>${escapeText(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}" />
<meta name="robots" content="${robotsContent}" />
<link rel="canonical" href="${escapeHtml(page.canonical || fullUrl)}" />
${altRu ? `<link rel="alternate" hreflang="ru" href="${escapeHtml(altRu)}" />` : ''}
${altUz ? `<link rel="alternate" hreflang="uz" href="${escapeHtml(altUz)}" />` : ''}
${xDefaultHref ? `<link rel="alternate" hreflang="x-default" href="${escapeHtml(xDefaultHref)}" />` : ''}

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

<link rel="preload" href="/assets/fonts/geist-${page.locale === 'uz' ? 'latin' : 'cyrillic'}-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
<link rel="llms" href="${escapeHtml(global.siteUrl)}/llms.txt" />
${LLM_MARKDOWN_URLS.has(page.url)
  ? `<link rel="alternate" type="text/markdown" href="${escapeHtml(global.siteUrl)}${escapeHtml(page.url)}index.html.md" />`
  : `<link rel="alternate" type="text/markdown" href="${escapeHtml(global.siteUrl)}/llms.txt" title="LLM-friendly summary (llms.txt)" />`}
<link rel="icon" type="${marketVariant ? 'image/svg+xml' : 'image/png'}" href="${marketVariant ? '/assets/market/favicon.svg' : '/assets/landing/2.png'}" />
${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ''}
${page.designVariant === 'digital-command-center' ? DIGITAL_COMMAND_STYLES : ''}

<script type="application/ld+json">${buildJsonLd(page, global)}</script>
${ANALYTICS_HEAD}
${METRIKA_HEAD}
</head>
<body class="${marketVariant ? 'market-page' : 'bg-bg-base text-white'} antialiased ${page.designVariant === 'digital-command-center' ? 'dc-page ' : ''}${showStickyCta && !marketVariant ? 'pb-24 lg:pb-0' : ''}">
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:text-black focus:px-4 focus:py-3 focus:rounded-lg focus:border focus:border-black">${page.locale === 'uz' ? 'Asosiy kontentga o\u2018tish' : 'Перейти к основному контенту'}</a>
<noscript data-tag="gtm"><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-NLR4WFX8" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
${METRIKA_NOSCRIPT}
${marketVariant ? renderMarketHeader(page, hrefRu, hrefUz) : page.pageType === 'gpt-chat' ? '' : `<header class="border-b border-white/5 bg-bg-base/80 backdrop-blur sticky top-0 z-40">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
    <a href="/" class="font-display text-xl text-white" data-testid="back-home">${escapeHtml(global.siteName)}</a>
    <nav class="flex gap-3 text-sm">
      ${altRu ? `<a href="${escapeHtml(altRu)}" hreflang="ru" class="text-white/70 hover:text-white">RU</a>` : ''}
      ${altUz ? `<a href="${escapeHtml(altUz)}" hreflang="uz" class="text-white/70 hover:text-white">UZ</a>` : ''}
      <a href="${escapeHtml(page.ctaPrimaryHref || global.defaultCTA.href)}"${(page.ctaPrimaryHref || global.defaultCTA.href).startsWith('http') ? ' rel="nofollow noopener noreferrer" target="_blank"' : ''} class="bg-grad-cta text-bg-base font-semibold px-4 py-2 rounded-full">
        ${escapeText(page.ctaPrimaryLabel || global.defaultCTA.label)}
      </a>
    </nav>
  </div>
</header>`}

${marketVariant
  ? page.slug === 'sotuvchi' ? renderMarketLanding(page) : renderMarketTrust(page)
  : page.pageType === 'gpt-chat'
  ? renderGptChatMain(page, global)
  : `<main id="main" class="${page.designVariant === 'digital-command-center' ? 'dc-shell' : 'max-w-3xl'} mx-auto px-4 sm:px-6 py-12 sm:py-20">
  <nav aria-label="Breadcrumb" class="text-sm text-white/50 mb-6">
    <a href="/" class="hover:text-white">${escapeHtml(global.siteName)}</a>
    <span class="px-2">/</span>
    <span class="text-white/70">${escapeText(page.breadcrumbLabel || page.h1)}</span>
  </nav>

  ${page.designVariant === 'digital-command-center'
    ? renderDigitalCommandHero(page, modifiedIso, modifiedLabel, bylineHtml, trustHtml)
    : `<div class="${page.heroImage ? 'lg:grid lg:grid-cols-2 lg:gap-10 lg:items-center ' : ''}mb-4">
    <div>
      <h1 data-testid="page-h1" class="font-display text-[2rem] sm:text-5xl lg:text-6xl text-white mb-6 leading-tight break-words hyphens-auto">${escapeText(page.h1)}</h1>
      ${modifiedIso ? `<p data-testid="page-updated" class="text-xs uppercase tracking-wider text-white/40 mb-4">${escapeHtml(modifiedLabel)} <time datetime="${modifiedIso}">${escapeHtml(modifiedIso)}</time></p>` : ''}
      ${bylineHtml}
      ${page.heroSubtitle ? `<p class="speakable-intro text-lg text-white/80 mb-8 max-w-2xl">${escapeText(page.heroSubtitle)}</p>` : ''}
      ${page.ctaPrimaryHref ? `<div class="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-4">
        <a data-testid="page-cta-primary" href="${escapeHtml(page.ctaPrimaryHref)}"${page.ctaPrimaryHref.startsWith('http') ? ' rel="nofollow noopener noreferrer" target="_blank"' : ''} class="btn-primary text-base w-full sm:w-auto">
          ${escapeText(page.ctaPrimaryLabel || 'Демо')}
        </a>
        ${page.ctaSecondaryHref ? `<a href="${escapeHtml(page.ctaSecondaryHref)}" class="btn-secondary w-full sm:w-auto">${escapeText(page.ctaSecondaryLabel || '')}</a>` : ''}
      </div>
      ${trustHtml}` : ''}
    </div>
    ${page.heroImage ? `<div class="mt-8 lg:mt-0"><img src="${escapeHtml(page.heroImage.src)}" alt="${escapeHtml(page.heroImage.alt)}" width="${page.heroImage.width}" height="${page.heroImage.height}" style="aspect-ratio:${page.heroImage.width}/${page.heroImage.height}" class="rounded-2xl border border-white/10 w-full h-auto" loading="eager" fetchpriority="high" decoding="async" /></div>` : ''}
  </div>`}

  ${calculatorHtml}
  ${renderGrowthTool(page)}
  <div class="${page.designVariant === 'digital-command-center' ? 'max-w-3xl mx-auto' : ''}">
    ${renderArticle(page.bodyBlocks || [], contentAnchor)}

    ${renderSources(page)}
    ${renderFaq(page.faq || [], page.locale === 'uz' ? 'uz' : 'ru')}
    ${renderInternalLinks(page)}
    ${renderRelatedArticles(page, articles)}
  </div>
</main>`
}

${marketVariant ? renderMarketFooter(page, global) : page.pageType === 'gpt-chat' ? '' : `<footer class="border-t border-white/5 mt-20 py-10">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-white/50">
    <span>${escapeHtml(global.siteName)} · ${escapeHtml(global.address || '')}</span>
    <div class="flex items-center gap-4">
      <a href="https://yandex.ru/maps/org/109235624736" rel="nofollow noopener noreferrer" target="_blank" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 hover:border-brand-cyan/40 transition-colors text-white/50 hover:text-white text-xs" title="${page.locale === 'uz' ? 'GPTBot.uz Yandex Xaritalarda' : 'GPTBot.uz на Яндекс Картах'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#00ff88"/></svg>
        ${page.locale === 'uz' ? 'Yandex Xaritalar' : 'Яндекс Карты'}
      </a>
      <a href="${escapeHtml(global.telegram || '#')}" rel="nofollow noopener noreferrer" target="_blank" class="hover:text-white">Telegram</a>
    </div>
  </div>
</footer>`}

${marketVariant ? '' : stickyCtaHtml}
${jsHref ? `<!-- The landing React bundle is intentionally not loaded on money pages. -->` : ''}
${page.pageType === 'gpt-chat' && chatHref ? `<script type="module" src="${chatHref}"></script>` : ''}
${page.interactiveTool === 'telegram-cost-calculator' && calculatorHref ? `<script type="module" src="${calculatorHref}"></script>` : ''}
${page.growthTool ? GROWTH_TOOL_SCRIPT : ''}
${hasCopyablePrompts ? PROMPT_COPY_SCRIPT : ''}
${marketVariant ? MARKET_FAQ_SCRIPT : ''}
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
  const calculatorHref = findCalculatorAsset();
  let written = 0, skipped = 0;
  for (const page of pages) {
    if (page.status === 'draft') { skipped++; continue; }
    const outPath = path.join(DIST_DIR, page.url, 'index.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, renderPage(page, global, cssHref, jsHref, articles, chatHref, calculatorHref), 'utf-8');
    written++;
    console.log(`  + ${outPath.replace(DIST_DIR, 'dist')}`);
  }
  console.log(`Prerendered ${written} page(s), skipped ${skipped} draft(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });

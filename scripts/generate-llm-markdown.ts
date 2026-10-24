// Emits clean Markdown twins of curated RU and UZ service pages and of the
// blog articles that lead organic traffic into dist/<url>index.html.md for
// LLM agents / agentic browsing.
//
// The Markdown is derived from the SAME content JSON the HTML is prerendered
// from, so the two never drift. Chrome (header, footer, nav, CSS, JS) and
// purely decorative blocks (toc, figure/image, cta) are dropped — the useful
// prose, tables, quotes, FAQ, sources and internal links survive. Twins are
// served as text/markdown and marked noindex via the _headers /*.md rule, so
// they do not cannibalise SEO.
//
// It also builds dist/llms-full.txt (growth backlog W2-07, 2026-10-24 audit
// L4-08): the "full" file used to be a hand-written 19 KB companion, about
// half the size of llms.txt, while llmstxt.org means it as the extended
// corpus. It is now a superset of llms.txt, assembled in this order:
//   1. public/llms-full.txt: the opening disclosure (independent service, not
//      OpenAI, 3 trial replies) and the notes per service cluster. Keep only
//      text here that llms.txt does not already carry; intents, key facts and
//      "do not claim" rules belong in public/llms.txt;
//   2. public/llms.txt, word for word;
//   3. the bodies of the curated Markdown twins (scripts/llm-pages.ts).
// Vite copies public/llms-full.txt to dist first; this script overwrites it.
// tests/seo-trial-product-truth.test.ts builds the same file from content/.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page, BlogArticle, BodyBlock, FaqItem, InternalLink, SourceReference } from '../src/shared/types';
import { SITE_URL } from '../src/shared/site-config';
import { LLM_MARKDOWN_BLOG_URLS, LLM_MARKDOWN_SLUGS_RU, LLM_MARKDOWN_SLUGS_UZ } from './llm-pages';
import { publishedRelatedLinks } from './blog-related-links';
import { STUDIO_EMAIL, STUDIO_PHONE, STUDIO_PHONE_DISPLAY, STUDIO_TELEGRAM_URL } from '../src/shared/studio-contact';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGES_DIR = path.join(ROOT, 'content', 'pages');
const BLOG_DIR = path.join(ROOT, 'content', 'blog');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');

type Locale = 'ru' | 'uz';

const absolute = (target: string) => (target.startsWith('http') ? target : `${SITE_URL}${target}`);
const cell = (s: string) => (s || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function blockToMd(b: BodyBlock): string | null {
  switch (b.type) {
    case 'h2': return `\n## ${(b.text || '').trim()}\n`;
    case 'h3': return `\n### ${(b.text || '').trim()}\n`;
    case 'p': return (b.text || '').trim();
    case 'list': return (b.items || []).map((i) => `- ${i.trim()}`).join('\n');
    case 'quote': return `> ${(b.text || '').trim()}`;
    case 'linkp': {
      // Resolve {token} placeholders into inline Markdown links.
      let t = b.text || '';
      for (const l of b.links || []) {
        if (!l.token || !l.target || !l.anchor) continue;
        t = t.split(`{${l.token}}`).join(`[${l.anchor}](${absolute(l.target)})`);
      }
      return t.trim();
    }
    case 'table': {
      // Tables carry the numbers (tariffs, comparisons) an assistant is most
      // likely to cite, so they are rendered as GitHub-flavoured tables.
      const headers = b.headers || [];
      const rows = b.rows || [];
      if (!headers.length && !rows.length) return null;
      const width = Math.max(headers.length, ...rows.map((r) => r.length));
      const pad = (r: string[]) => Array.from({ length: width }, (_, i) => cell(r[i] ?? ''));
      const head = pad(headers);
      return [
        `| ${head.join(' | ')} |`,
        `| ${head.map(() => '---').join(' | ')} |`,
        ...rows.map((r) => `| ${pad(r).join(' | ')} |`),
      ].join('\n');
    }
    // Decorative / chrome — intentionally skipped in the LLM twin.
    case 'toc': case 'figure': case 'image': case 'cta':
    default: return null;
  }
}

const TEXT: Record<Locale, {
  faq: string; also: string; consult: string; consultText: string; source: string;
  sources: string; author: string; published: string; updated: string;
}> = {
  ru: {
    faq: 'Частые вопросы', also: 'Смотрите также', consult: 'Консультация', source: 'Источник',
    sources: 'Источники', author: 'Автор', published: 'Опубликовано', updated: 'Обновлено',
    consultText: 'Разберём задачу бизнеса и предложим решение — сайт, AI-бот, Telegram-бот, интеграцию с CRM или рекламную воронку. Связаться с нами:',
  },
  uz: {
    faq: 'Tez-tez so‘raladigan savollar', also: 'Shuningdek qarang', consult: 'Maslahat', source: 'Manba',
    sources: 'Manbalar', author: 'Muallif', published: 'Nashr etilgan', updated: 'Yangilangan',
    consultText: 'Biznes vazifangizni ko‘rib chiqamiz va yechim taklif qilamiz — sayt, AI-bot, Telegram-bot, CRM integratsiyasi yoki reklama voronkasi. Biz bilan bog‘lanish:',
  },
};

function faqMd(faq: FaqItem[] | undefined, locale: Locale): string[] {
  if (!faq?.length) return [];
  return [`\n## ${TEXT[locale].faq}\n`, ...faq.map((f) => `**${f.q.trim()}**\n\n${f.a.trim()}\n`)];
}

function linksMd(links: InternalLink[] | undefined, locale: Locale): string[] {
  const live = (links || []).filter((l) => l.target && l.anchor);
  if (!live.length) return [];
  return [`\n## ${TEXT[locale].also}\n`, ...live.map((l) => `- [${l.anchor}](${absolute(l.target)})`)];
}

function sourcesMd(sources: SourceReference[] | undefined, locale: Locale): string[] {
  const live = (sources || []).filter((s) => s.title && s.url);
  if (!live.length) return [];
  return [`\n## ${TEXT[locale].sources}\n`, ...live.map((s) => `- [${s.title.trim()}](${s.url})${s.note ? ` — ${s.note.trim()}` : ''}`)];
}

/** The studio's contact channels from content/global/site.json (src/shared/studio-contact.ts). */
const CONTACTS = [
  `[${STUDIO_PHONE_DISPLAY}](tel:${STUDIO_PHONE})`,
  `[${STUDIO_EMAIL}](mailto:${STUDIO_EMAIL})`,
  ...(STUDIO_TELEGRAM_URL ? [`[Telegram](${STUDIO_TELEGRAM_URL})`] : []),
].join(' · ');

function tail(url: string, locale: Locale): string[] {
  const t = TEXT[locale];
  return [`\n## ${t.consult}\n`, `${t.consultText} ${CONTACTS}.`, `\n---\n${t.source}: ${SITE_URL}${url} · GPTBot.uz`];
}

const isoDate = (value: string | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : '');

function finish(out: string[]): string {
  // Collapse 3+ blank lines to 2 for tidy Markdown.
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function pageToMarkdown(page: Page, locale: Locale): string {
  const out: string[] = [`# ${page.h1}`, ''];
  if (page.heroSubtitle) out.push(`> ${page.heroSubtitle.trim()}`, '');
  for (const b of page.bodyBlocks || []) {
    const md = blockToMd(b);
    if (md) out.push(md);
  }
  out.push(...faqMd(page.faq, locale), ...linksMd(page.internalLinks, locale), ...tail(page.url, locale));
  return finish(out);
}

/** The URLs of the articles the blog prerender writes (scripts/prerender-blog.ts uses the same filter). */
function publishedArticleUrls(): ReadonlySet<string> {
  return new Set(fs.readdirSync(BLOG_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(BLOG_DIR, file), 'utf-8')) as BlogArticle)
    .filter((a) => a.status === 'published' && a.robotsIndex !== false)
    .map((a) => a.url));
}

function articleToMarkdown(article: BlogArticle, locale: Locale, published: ReadonlySet<string>): string {
  const t = TEXT[locale];
  const out: string[] = [`# ${article.h1 || article.title}`, ''];
  if (article.intro) out.push(`> ${article.intro.trim()}`, '');
  const meta = [
    article.author ? `${t.author}: ${article.author}` : '',
    article.datePublished ? `${t.published}: ${isoDate(article.datePublished)}` : '',
    (article.dateModified || article.updatedAt) ? `${t.updated}: ${isoDate(article.dateModified || article.updatedAt)}` : '',
  ].filter(Boolean);
  if (meta.length) out.push(`_${meta.join(' · ')}_`, '');
  for (const b of article.body || []) {
    const md = blockToMd(b);
    if (md) out.push(md);
  }
  out.push(
    ...faqMd(article.faq, locale),
    ...sourcesMd(article.sources, locale),
    // Like the HTML: related articles that are not published (drafts) are left out.
    ...linksMd(publishedRelatedLinks(article.internalLinks || [], published), locale),
    ...tail(article.url, locale),
  );
  return finish(out);
}

export interface LlmTwin {
  /** Canonical URL path of the HTML page, e.g. /uz/sayt-yaratish/. */
  url: string;
  /** The page's H1, used in the page index of llms-full.txt. */
  title: string;
  /** The twin exactly as written to dist/<url>index.html.md. */
  markdown: string;
}

const CURATED: ReadonlyArray<[Locale, readonly string[]]> = [['ru', LLM_MARKDOWN_SLUGS_RU], ['uz', LLM_MARKDOWN_SLUGS_UZ]];

/** Renders every curated twin from content/, in the order llms.txt lists them. Writes nothing. */
export function renderTwins(): { twins: LlmTwin[]; missing: number } {
  const twins: LlmTwin[] = [];
  let missing = 0;
  for (const [locale, slugs] of CURATED) {
    for (const slug of slugs) {
      const src = path.join(PAGES_DIR, locale, `${slug}.json`);
      if (!fs.existsSync(src)) { console.warn(`  ! llm-md: page not found: ${locale}/${slug}`); missing++; continue; }
      const page = JSON.parse(fs.readFileSync(src, 'utf-8')) as Page;
      if (page.status === 'draft') { console.warn(`  ! llm-md: skip draft: ${locale}/${slug}`); continue; }
      twins.push({ url: `/${locale}/${slug}/`, title: page.h1, markdown: pageToMarkdown(page, locale) });
    }
  }

  const published = publishedArticleUrls();
  for (const url of LLM_MARKDOWN_BLOG_URLS) {
    const match = /^\/(ru|uz)\/blog\/([^/]+)\/$/.exec(url);
    if (!match) { console.warn(`  ! llm-md: not a blog URL: ${url}`); missing++; continue; }
    const [, locale, slug] = match as unknown as [string, Locale, string];
    const src = path.join(BLOG_DIR, locale, `${slug}.json`);
    if (!fs.existsSync(src)) { console.warn(`  ! llm-md: article not found: ${locale}/${slug}`); missing++; continue; }
    const article = JSON.parse(fs.readFileSync(src, 'utf-8')) as BlogArticle;
    if (article.status !== 'published' || article.robotsIndex === false) { console.warn(`  ! llm-md: skip unpublished: ${url}`); continue; }
    twins.push({ url, title: article.h1 || article.title, markdown: articleToMarkdown(article, locale, published) });
  }
  return { twins, missing };
}

const lf = (text: string) => text.replace(/\r\n?/g, '\n').trim();

/**
 * dist/llms-full.txt: the cluster notes (public/llms-full.txt), then llms.txt
 * word for word, then an index of the pages and the body of every twin. Line ends
 * are normalised to LF, so a CRLF checkout builds the same bytes as CI.
 */
export function buildLlmsFull(head: string, llms: string, twins: readonly LlmTwin[]): string {
  const pageIndex = twins.map((t) => `- [${t.title.replace(/[[\]]/g, '').trim()}](${SITE_URL}${t.url})`);
  return [
    lf(head),
    `What follows is ${SITE_URL}/llms.txt, word for word.\n\n${lf(llms)}`,
    [
      '# Full text of the key pages',
      `The ${twins.length} pages below are the Markdown twins (<url>index.html.md) of the key service pages and guides of GPTBot.uz. `
        + 'They are generated from the same content as the HTML pages and keep the language of the page (Russian or Uzbek Latin). '
        + 'Each page starts with its canonical URL; cite that URL rather than this file.',
      pageIndex.join('\n'),
    ].join('\n\n'),
    ...twins.map((t) => `URL: ${SITE_URL}${t.url}\n\n${lf(t.markdown)}`),
  ].join('\n\n---\n\n') + '\n';
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SITE_URL_PATTERN = new RegExp(String.raw`${escapeRe(SITE_URL)}(\/[^\s<>()[\]"'\x60|*,]*)?`, 'g');

/** The distinct site paths of every SITE_URL link in a text, without fragment or query ('/' for the bare domain). */
export function siteUrlPaths(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(SITE_URL_PATTERN)) {
    found.add((m[1] ?? '/').split('#')[0].split('?')[0].replace(/[.:;!]+$/, '') || '/');
  }
  return [...found];
}

/** Redirects that llms.txt names as redirects on purpose («/ru/ permanently redirects (301) to /»). */
export const DESCRIBED_REDIRECTS: ReadonlySet<string> = new Set(['/ru/']);
/** Written after this script: scripts/generate-feed.ts runs next in every build chain. */
const WRITTEN_LATER: ReadonlySet<string> = new Set(['/ru/blog/feed.xml', '/uz/blog/feed.xml', '/updates/atom.xml']);

function main(): void {
  const { twins, missing } = renderTwins();
  for (const twin of twins) {
    const outPath = path.join(DIST_DIR, ...twin.url.split('/').filter(Boolean), 'index.html.md');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, twin.markdown, 'utf-8');
  }
  console.log(`LLM Markdown twins: ${twins.length} written, ${missing} missing → dist/<url>index.html.md`);

  const llms = fs.readFileSync(path.join(PUBLIC_DIR, 'llms.txt'), 'utf-8');
  const full = buildLlmsFull(fs.readFileSync(path.join(PUBLIC_DIR, 'llms-full.txt'), 'utf-8'), llms, twins);
  fs.writeFileSync(path.join(DIST_DIR, 'llms-full.txt'), full, 'utf-8');
  console.log(`llms-full.txt: ${Buffer.byteLength(full)} B = cluster notes + llms.txt (${Buffer.byteLength(lf(llms))} B) + ${twins.length} twin bodies → dist/llms-full.txt`);

  // Every URL in it must be served by this build (the test checks the same against content/).
  const unserved = siteUrlPaths(full).filter((p) => !DESCRIBED_REDIRECTS.has(p) && !WRITTEN_LATER.has(p)
    && !fs.existsSync(path.join(DIST_DIR, ...p.split('/').filter(Boolean), ...(p.endsWith('/') ? ['index.html'] : []))));
  if (unserved.length) console.warn(`  ! llms-full: ${unserved.length} URL(s) not in dist: ${unserved.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();

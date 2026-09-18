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
import fs from 'node:fs';
import path from 'node:path';
import type { Page, BlogArticle, BodyBlock, FaqItem, InternalLink, SourceReference } from '../src/shared/types';
import { SITE_URL } from '../src/shared/site-config';
import { LLM_MARKDOWN_BLOG_URLS, LLM_MARKDOWN_SLUGS_RU, LLM_MARKDOWN_SLUGS_UZ } from './llm-pages';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGES_DIR = path.join(ROOT, 'content', 'pages');
const BLOG_DIR = path.join(ROOT, 'content', 'blog');
const DIST_DIR = path.join(ROOT, 'dist');
const TG = 'https://t.me/XGame_changerx';

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
    consultText: 'Разберём задачу бизнеса и предложим решение — сайт, AI-бот, Telegram-бот, интеграцию с CRM или рекламную воронку. Напишите в Telegram:',
  },
  uz: {
    faq: 'Tez-tez so‘raladigan savollar', also: 'Shuningdek qarang', consult: 'Maslahat', source: 'Manba',
    sources: 'Manbalar', author: 'Muallif', published: 'Nashr etilgan', updated: 'Yangilangan',
    consultText: 'Biznes vazifangizni ko‘rib chiqamiz va yechim taklif qilamiz — sayt, AI-bot, Telegram-bot, CRM integratsiyasi yoki reklama voronkasi. Telegramda yozing:',
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

function tail(url: string, locale: Locale): string[] {
  const t = TEXT[locale];
  return [`\n## ${t.consult}\n`, `${t.consultText} [${TG}](${TG}).`, `\n---\n${t.source}: ${SITE_URL}${url} · GPTBot.uz`];
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

function articleToMarkdown(article: BlogArticle, locale: Locale): string {
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
    ...linksMd(article.internalLinks, locale),
    ...tail(article.url, locale),
  );
  return finish(out);
}

let written = 0, missing = 0;
const CURATED: ReadonlyArray<[Locale, readonly string[]]> = [['ru', LLM_MARKDOWN_SLUGS_RU], ['uz', LLM_MARKDOWN_SLUGS_UZ]];
for (const [locale, slugs] of CURATED) {
  for (const slug of slugs) {
    const src = path.join(PAGES_DIR, locale, `${slug}.json`);
    if (!fs.existsSync(src)) { console.warn(`  ! llm-md: page not found: ${locale}/${slug}`); missing++; continue; }
    const page = JSON.parse(fs.readFileSync(src, 'utf-8')) as Page;
    if (page.status === 'draft') { console.warn(`  ! llm-md: skip draft: ${locale}/${slug}`); continue; }
    const outPath = path.join(DIST_DIR, locale, slug, 'index.html.md');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, pageToMarkdown(page, locale), 'utf-8');
    written++;
  }
}

for (const url of LLM_MARKDOWN_BLOG_URLS) {
  const match = /^\/(ru|uz)\/blog\/([^/]+)\/$/.exec(url);
  if (!match) { console.warn(`  ! llm-md: not a blog URL: ${url}`); missing++; continue; }
  const [, locale, slug] = match as unknown as [string, Locale, string];
  const src = path.join(BLOG_DIR, locale, `${slug}.json`);
  if (!fs.existsSync(src)) { console.warn(`  ! llm-md: article not found: ${locale}/${slug}`); missing++; continue; }
  const article = JSON.parse(fs.readFileSync(src, 'utf-8')) as BlogArticle;
  if (article.status !== 'published' || article.robotsIndex === false) { console.warn(`  ! llm-md: skip unpublished: ${url}`); continue; }
  const outPath = path.join(DIST_DIR, locale, 'blog', slug, 'index.html.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, articleToMarkdown(article, locale), 'utf-8');
  written++;
}
console.log(`LLM Markdown twins: ${written} written, ${missing} missing → dist/<url>index.html.md`);

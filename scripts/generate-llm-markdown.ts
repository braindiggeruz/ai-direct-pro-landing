// Emits clean Markdown twins of curated RU and UZ service pages into
// dist/<locale>/<slug>/index.html.md for LLM agents / agentic browsing.
//
// The Markdown is derived from the SAME content JSON the HTML is prerendered
// from, so the two never drift. Decorative blocks (toc, figure/image, cta) and
// all chrome (header, footer, nav, CSS, JS) are dropped — only the useful prose,
// FAQ and internal links survive. Twins are served as text/markdown and marked
// noindex via the _headers /*.md rule, so they do not cannibalise SEO.
import fs from 'node:fs';
import path from 'node:path';
import type { Page, BodyBlock } from '../src/shared/types';
import { SITE_URL } from '../src/shared/site-config';
import { LLM_MARKDOWN_SLUGS_RU, LLM_MARKDOWN_SLUGS_UZ } from './llm-pages';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGES_DIR = path.join(ROOT, 'content', 'pages');
const DIST_DIR = path.join(ROOT, 'dist');
const TG = 'https://t.me/XGame_changerx';

function blockToMd(b: BodyBlock): string | null {
  switch (b.type) {
    case 'h2': return `\n## ${(b.text || '').trim()}\n`;
    case 'h3': return `\n### ${(b.text || '').trim()}\n`;
    case 'p': return (b.text || '').trim();
    case 'list': return (b.items || []).map((i) => `- ${i.trim()}`).join('\n');
    case 'linkp': {
      // Resolve {token} placeholders into inline Markdown links.
      let t = b.text || '';
      for (const l of b.links || []) {
        if (!l.token || !l.target || !l.anchor) continue;
        const abs = l.target.startsWith('http') ? l.target : `${SITE_URL}${l.target}`;
        t = t.split(`{${l.token}}`).join(`[${l.anchor}](${abs})`);
      }
      return t.trim();
    }
    // Decorative / chrome — intentionally skipped in the LLM twin.
    case 'toc': case 'figure': case 'image': case 'cta': case 'quote': case 'table':
    default: return null;
  }
}

type Locale = 'ru' | 'uz';
const TEXT: Record<Locale, { faq: string; also: string; consult: string; consultText: string; source: string }> = {
  ru: {
    faq: 'Частые вопросы', also: 'Смотрите также', consult: 'Консультация', source: 'Источник',
    consultText: 'Разберём задачу бизнеса и предложим решение — сайт, AI-бот, Telegram-бот, интеграцию с CRM или рекламную воронку. Напишите в Telegram:',
  },
  uz: {
    faq: 'Tez-tez so‘raladigan savollar', also: 'Shuningdek qarang', consult: 'Maslahat', source: 'Manba',
    consultText: 'Biznes vazifangizni ko‘rib chiqamiz va yechim taklif qilamiz — sayt, AI-bot, Telegram-bot, CRM integratsiyasi yoki reklama voronkasi. Telegramda yozing:',
  },
};

function pageToMarkdown(page: Page, locale: Locale): string {
  const t = TEXT[locale];
  const out: string[] = [];
  out.push(`# ${page.h1}`);
  out.push('');
  if (page.heroSubtitle) { out.push(`> ${page.heroSubtitle.trim()}`); out.push(''); }

  for (const b of page.bodyBlocks || []) {
    const md = blockToMd(b);
    if (md) out.push(md);
  }

  if (page.faq?.length) {
    out.push(`\n## ${t.faq}\n`);
    for (const f of page.faq) { out.push(`**${f.q.trim()}**\n\n${f.a.trim()}\n`); }
  }

  const links = (page.internalLinks || []).filter((l) => l.target && l.anchor);
  if (links.length) {
    out.push(`\n## ${t.also}\n`);
    for (const l of links) {
      const abs = l.target.startsWith('http') ? l.target : `${SITE_URL}${l.target}`;
      out.push(`- [${l.anchor}](${abs})`);
    }
  }

  out.push(`\n## ${t.consult}\n`);
  out.push(`${t.consultText} [${TG}](${TG}).`);
  out.push(`\n---\n${t.source}: ${SITE_URL}${page.url} · GPTBot.uz`);

  // Collapse 3+ blank lines to 2 for tidy Markdown.
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
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
console.log(`LLM Markdown twins: ${written} written, ${missing} missing → dist/<locale>/<slug>/index.html.md`);

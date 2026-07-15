// Emits clean Markdown twins of curated RU service pages into
// dist/ru/<slug>/index.html.md for LLM agents / agentic browsing.
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
import { LLM_MARKDOWN_SLUGS_RU } from './llm-pages';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'pages', 'ru');
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

function pageToMarkdown(page: Page): string {
  const out: string[] = [];
  out.push(`# ${page.h1}`);
  out.push('');
  if (page.heroSubtitle) { out.push(`> ${page.heroSubtitle.trim()}`); out.push(''); }

  for (const b of page.bodyBlocks || []) {
    const md = blockToMd(b);
    if (md) out.push(md);
  }

  if (page.faq?.length) {
    out.push('\n## Частые вопросы\n');
    for (const f of page.faq) { out.push(`**${f.q.trim()}**\n\n${f.a.trim()}\n`); }
  }

  const links = (page.internalLinks || []).filter((l) => l.target && l.anchor);
  if (links.length) {
    out.push('\n## Смотрите также\n');
    for (const l of links) {
      const abs = l.target.startsWith('http') ? l.target : `${SITE_URL}${l.target}`;
      out.push(`- [${l.anchor}](${abs})`);
    }
  }

  out.push('\n## Консультация\n');
  out.push(`Разберём задачу бизнеса и предложим решение — сайт, AI-бот, Telegram-бот, интеграцию с CRM или рекламную воронку. Напишите в Telegram: [${TG}](${TG}).`);
  out.push(`\n---\nИсточник: ${SITE_URL}${page.url} · GPTBot.uz`);

  // Collapse 3+ blank lines to 2 for tidy Markdown.
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

let written = 0, missing = 0;
for (const slug of LLM_MARKDOWN_SLUGS_RU) {
  const src = path.join(CONTENT_DIR, `${slug}.json`);
  if (!fs.existsSync(src)) { console.warn(`  ! llm-md: page not found: ${slug}`); missing++; continue; }
  const page = JSON.parse(fs.readFileSync(src, 'utf-8')) as Page;
  if (page.status === 'draft') { console.warn(`  ! llm-md: skip draft: ${slug}`); continue; }
  const outPath = path.join(DIST_DIR, 'ru', slug, 'index.html.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, pageToMarkdown(page), 'utf-8');
  written++;
}
console.log(`LLM Markdown twins: ${written} written, ${missing} missing → dist/ru/<slug>/index.html.md`);

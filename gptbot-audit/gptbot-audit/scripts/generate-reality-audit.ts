// scripts/generate-reality-audit.ts
//
// Generates docs/SEO_REALITY_AUDIT.md — a per-page truth table used as the
// source of action items for Phase 1+ of the GPTBot SEO Cockpit programme.
//
// Columns:
//   URL · locale · status · pageType · title OK · h1 OK · description OK ·
//   mojibake · FAQ count · inbound count · hreflang pair · robotsIndex ·
//   in sitemap · live URL · content completeness · score · action
//
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { Page } from '../src/shared/types';
import { auditPage, hasMojibake, RULES } from '../src/shared/audit';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const DOCS_DIR = path.join(ROOT, 'docs');

const files = fg.sync('pages/**/*.json', { cwd: CONTENT_DIR, absolute: true });
const pages: Page[] = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));

interface Row {
  url: string;
  locale: string;
  status: string;
  pageType: string;
  titleOk: string;
  h1Ok: string;
  descOk: string;
  mojibake: string;
  faqCount: number;
  inbound: number;
  hreflangPair: string;
  robotsIndex: string;
  inSitemap: string;
  liveUrl: string;
  completeness: string;
  score: number;
  action: string;
}

function lenOk(s: string | undefined, min: number, max: number): string {
  if (!s) return 'no';
  const n = s.length;
  return n >= min && n <= max ? 'yes' : `weak(${n})`;
}

function pairStatus(p: Page): string {
  const otherUrl = p.locale === 'ru' ? p.hreflangUz : p.hreflangRu;
  if (!p.hreflangRu || !p.hreflangUz) return 'missing';
  const found = pages.find((x) => x.url === otherUrl);
  if (!found) return 'no-pair';
  const backref = p.locale === 'ru' ? found.hreflangRu : found.hreflangUz;
  if (!backref || backref !== p.url) return 'one-way';
  return 'ok';
}

function decideAction(p: Page, audit: ReturnType<typeof auditPage>, inbound: number): string {
  if (audit.issues.some((i) => i.rule === 'mojibake')) return 'fix-encoding';
  if (!p.title || !p.h1 || !p.description) return 'fill-meta';
  if (p.pageType === 'money' && (p.faq?.length || 0) < RULES.minFaqMoney) return 'add-faq';
  if (p.pageType === 'money' && inbound < RULES.minIncomingInternalLinksMoney) return 'add-inbound-links';
  if ((p.internalLinks?.length || 0) < RULES.minOutgoingInternalLinks) return 'add-outgoing-links';
  if (audit.issues.some((i) => i.level === 'error')) return 'fix-errors';
  if (p.status === 'draft' && audit.score >= 80) return 'ready-to-publish';
  if (p.status === 'published') return 'keep-published';
  return 'keep-draft';
}

const rows: Row[] = pages
  .sort((a, b) => a.url.localeCompare(b.url))
  .map((p) => {
    const audit = auditPage(p, { allPages: pages });
    const inbound = pages.reduce((acc, q) => acc + (q.url !== p.url && (q.internalLinks || []).some((l) => l.target === p.url) ? 1 : 0), 0);
    const moji =
      hasMojibake(p.title) ||
      hasMojibake(p.h1) ||
      hasMojibake(p.description) ||
      hasMojibake(p.heroTitle) ||
      hasMojibake(p.heroSubtitle);
    const inSitemap = p.status === 'published' && p.robotsIndex !== false;
    // content completeness: hero + 1+ bodyBlocks + faq + internalLinks
    const hasHero = Boolean(p.heroTitle || p.heroSubtitle);
    const hasBody = (p.bodyBlocks?.length || 0) > 0;
    const hasFaq = (p.faq?.length || 0) >= 3;
    const hasLinks = (p.internalLinks?.length || 0) >= 3;
    const completeness = [hasHero, hasBody, hasFaq, hasLinks].filter(Boolean).length + '/4';
    return {
      url: p.url,
      locale: p.locale,
      status: p.status,
      pageType: p.pageType,
      titleOk: lenOk(p.title, RULES.titleMin, RULES.titleMax),
      h1Ok: p.h1 ? 'yes' : 'no',
      descOk: lenOk(p.description, RULES.descriptionMin, RULES.descriptionMax),
      mojibake: moji ? 'YES' : 'no',
      faqCount: p.faq?.length || 0,
      inbound,
      hreflangPair: pairStatus(p),
      robotsIndex: p.robotsIndex ? 'yes' : 'no',
      inSitemap: inSitemap ? 'yes' : 'no',
      liveUrl: inSitemap ? `https://gptbot.uz${p.url}` : '—',
      completeness,
      score: audit.score,
      action: decideAction(p, audit, inbound),
    };
  });

// Markdown table
const header = '| URL | loc | status | type | title | h1 | desc | mojib | FAQ | inb | hreflang | robots | sitemap | live | done | score | action |';
const align = '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const lines = rows.map((r) => `| \`${r.url}\` | ${r.locale} | ${r.status} | ${r.pageType} | ${r.titleOk} | ${r.h1Ok} | ${r.descOk} | ${r.mojibake} | ${r.faqCount} | ${r.inbound} | ${r.hreflangPair} | ${r.robotsIndex} | ${r.inSitemap} | ${r.liveUrl === '—' ? '—' : `[link](${r.liveUrl})`} | ${r.completeness} | ${r.score} | **${r.action}** |`);

const total = rows.length;
const published = rows.filter((r) => r.status === 'published').length;
const drafts = rows.filter((r) => r.status === 'draft').length;
const mojiCount = rows.filter((r) => r.mojibake === 'YES').length;
const noFaq = rows.filter((r) => r.faqCount < RULES.minFaqMoney && r.pageType === 'money').length;
const orphan = rows.filter((r) => r.inbound < 2 && r.pageType === 'money').length;

const md = `# SEO Reality Audit · GPTBot SEO Cockpit

> Generated by \`scripts/generate-reality-audit.ts\` on ${new Date().toISOString().split('T')[0]}.
> Source of truth for Phase 1+ actions: fix-encoding → fill-meta → add-faq → add-inbound-links → ready-to-publish.

## Summary

| Metric | Value |
|---|---|
| Total pages | ${total} |
| Published | ${published} |
| Drafts | ${drafts} |
| Mojibake pages | ${mojiCount} |
| Money pages with FAQ < 4 | ${noFaq} |
| Money pages with inbound < 2 | ${orphan} |

## Per-page truth table

${header}
${align}
${lines.join('\n')}

## Action key

| Action | Meaning |
|---|---|
| \`fix-encoding\` | Mojibake detected — run \`yarn tsx scripts/fix-mojibake.ts --write\` or fix manually. Publish blocked until clean. |
| \`fill-meta\` | Missing title / h1 / description — fill before promotion. |
| \`add-faq\` | Money page has < 4 FAQ items — required for ranking + FAQPage schema. |
| \`add-inbound-links\` | Money page has < 2 incoming internal links — add references from homepage, sibling pages, or blog. |
| \`add-outgoing-links\` | Page has < 3 outgoing internal links — add contextual links to sibling money/niche pages. |
| \`fix-errors\` | Generic audit error other than the above — open the page editor and resolve. |
| \`ready-to-publish\` | Draft scoring ≥ 80 — review and publish in next batch. |
| \`keep-draft\` | Not yet ready — needs more content work. |
| \`keep-published\` | Already published, no critical findings — monitor only. |

## Encoding fix history

* \`functions/lib/github.ts\` — \`getFile\` was decoding base64 via \`atob()\` only, producing Latin-1 strings. This silently mangled Cyrillic and Uzbek Latin characters. Replaced with explicit \`TextDecoder('utf-8')\` round-trip on bytes.
* \`functions/lib/github.ts\` — \`putFile\` was using \`btoa(unescape(encodeURIComponent(...)))\`. Replaced with \`TextEncoder\` + base64 to remove the deprecated \`unescape\` step.
* \`functions/api/content/index.ts\` — added \`charset=utf-8\` to JSON response headers and a server-side publish guard that rejects publish requests when mojibake is detected in title/description/h1/body/faq/internalLinks.
* \`src/shared/audit.ts\` — added \`mojibake\` rule (level=error). When triggered, the page score is hard-capped at 0 and the build-time \`yarn seo:audit\` exits non-zero.
* \`scripts/fix-mojibake.ts\` — one-shot recovery script that unwinds N rounds of \`latin1→utf8\` mis-decoding for any content JSON.
`;

if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
fs.writeFileSync(path.join(DOCS_DIR, 'SEO_REALITY_AUDIT.md'), md, 'utf-8');
console.log(`Wrote docs/SEO_REALITY_AUDIT.md (${rows.length} rows, ${mojiCount} mojibake)`);

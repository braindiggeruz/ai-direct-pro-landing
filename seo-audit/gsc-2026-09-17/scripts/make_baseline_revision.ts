/**
 * Reviewed-baseline revision for the protected SEO pages (wave 1, GSC audit 2026-09-17).
 *
 * `scripts/seo-protection.ts capture` snapshots the LIVE site and refuses to overwrite an
 * existing baseline, so a content change to a protected page needs a "reviewed local build"
 * revision instead (same process as docs/seo/evidence/2026-09-14/reviewed-protected-pages.json).
 *
 * Usage, from the repository root, AFTER `npm run build` (dist/ must be fresh):
 *
 *   node --import tsx seo-audit/gsc-2026-09-17/scripts/make_baseline_revision.ts            # dry run
 *   node --import tsx seo-audit/gsc-2026-09-17/scripts/make_baseline_revision.ts --write    # write revision
 *   options: --date YYYY-MM-DD (default: today, local), --dist <dir> (default: ./dist),
 *            --suffix <slug> (evidence dir becomes <date>-<slug>), --allow <field,field>
 *            (permit canonical/robots/googlebot/hreflang changes after review),
 *            --reason "<path>=<text>" (add or override a REASONS entry; repeatable)
 *
 * Dry run prints which protected pages differ from the current BASELINE and in which fields.
 * --write creates docs/seo/evidence/<date>/reviewed-protected-pages.json (never overwrites),
 * keeping the other pages byte-identical to the previous revision. It does NOT edit
 * scripts/seo-protection.ts — update the BASELINE constant there by hand (tracked file).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE, PROTECTED_PATHS, seoContract } from '../../../scripts/seo-protection';

const ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

type Contract = ReturnType<typeof seoContract>;
type Page = { pathname: string; contract: Contract; bodyText: string };
type ReviewedChange = Record<string, unknown> & { path: string; fields: string[]; reason: string };
type Snapshot = {
  schema: 1; capturedAt: string; source?: string; originalEvidence?: string;
  reviewedChanges?: ReviewedChange[]; pages: Page[];
};

/** Reasons for the wave-1 pages. Any other changed protected page aborts the run: review it first. */
const REASONS: Record<string, string> = {
  '/uz/blog/chatgptga-qanday-kirish-mumkin/':
    'QW-1 / T01 (docs/seo/gsc-audit-2026-09-17/QUICK_WINS.md): title, H1, description and intro rewritten around the '
    + '"chatgpt kirish / ochish" query cluster (24 641 impressions, CTR 0.32%, position 7.4); new section '
    + '"ChatGPT ochish: 3 qadam" and TOC entry; canonical, robots and hreflang unchanged.',
  '/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/':
    'QW-2 / T02: remove "kirish" from title, H1 and description so the login article owns the login intent; '
    + 'first H2 replaced by a short answer ("ishlaydi, VPN shart emas") with a link to the login article; '
    + 'canonical, robots and hreflang unchanged.',
  '/uz/gpt-uzbek-tilida/':
    'QW-3 / T03: title, description, heroSubtitle and first paragraph add "kirish" and the spellings '
    + 'uzbekcha / o‘zbekcha (queries "chatgpt bepul kirish", "chatgpt kirish uzbek tilida", "chatgpt uzbekcha"); '
    + 'canonical, robots and hreflang unchanged.',
  '/ru/gpt-chat/':
    'QW-4 / T04: explicit text link to /uz/gpt-uzbek-tilida/ above the chat for the 25 Uzbek queries landing here; '
    + 'heroSubtitle and description adjusted; canonical, robots and hreflang unchanged.',
  '/':
    'Side effect of T01/T02: the homepage SEO shell (scripts/prerender-home.ts) lists every published article by title, '
    + 'so the two renamed Uzbek article titles change the homepage body text. No title, H1, description, canonical, '
    + 'robots, hreflang or internal-link change on / itself (same hrefs, new anchor text).',
};

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const write = args.includes('--write');
const suffix = opt('--suffix') ?? '';
if (suffix && !/^[a-z0-9-]+$/.test(suffix)) throw new Error(`Bad --suffix: ${suffix}`);
const allowed = new Set((opt('--allow') ?? '').split(',').filter(Boolean));
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--reason') continue;
  const [p, ...rest] = (args[i + 1] ?? '').split('=');
  if (!p || !rest.length) throw new Error('--reason expects "<path>=<text>"');
  REASONS[p] = rest.join('=');
}
const today = new Date();
const date = opt('--date') ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Bad --date: ${date}`);
const dist = path.resolve(ROOT, opt('--dist') ?? 'dist');

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Same body-text derivation as capture() in scripts/seo-protection.ts. */
const bodyTextOf = (html: string) => normalize(
  html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]?.replace(/<[^>]*>/g, ' ') ?? '');

const baselineFile = path.join(ROOT, BASELINE);
const previous = JSON.parse(fs.readFileSync(baselineFile, 'utf8')) as Snapshot;
if (previous.schema !== 1 || previous.pages.length !== PROTECTED_PATHS.length) throw new Error(`Unexpected baseline shape: ${BASELINE}`);

const changes: ReviewedChange[] = [];
const nextPages: Page[] = [];
const unexpected: string[] = [];

for (const prev of previous.pages) {
  const file = path.join(dist, prev.pathname.slice(1), 'index.html');
  if (!fs.existsSync(file)) throw new Error(`Missing built HTML for protected page: ${prev.pathname} (${file}). Run npm run build first.`);
  const html = fs.readFileSync(file, 'utf8');
  const contract = seoContract(html);
  const bodyText = bodyTextOf(html);
  const fields = (Object.keys(contract) as Array<keyof Contract>)
    .filter(key => JSON.stringify(contract[key]) !== JSON.stringify(prev.contract[key]));
  if (!fields.length) { nextPages.push(prev); continue; }

  if (contract.title.length !== 1 || contract.h1.length !== 1 || contract.canonical.length !== 1
    || contract.canonical[0] !== `https://gptbot.uz${prev.pathname}` || contract.robots.some(v => /noindex|none/i.test(v))) {
    throw new Error(`Invalid SEO contract after change: ${prev.pathname} (title/h1/canonical/robots)`);
  }
  const reason = REASONS[prev.pathname];
  if (!reason) unexpected.push(`${prev.pathname}: ${fields.join(', ')}`);

  const change: ReviewedChange = { path: prev.pathname, fields, reason: reason ?? 'UNREVIEWED' };
  for (const key of ['title', 'h1', 'description', 'canonical', 'hreflang'] as const) {
    if (fields.includes(key)) { change[`${key}Before`] = prev.contract[key]; change[`${key}After`] = contract[key]; }
  }
  if (fields.includes('internalLinks')) {
    const before = new Set(prev.contract.internalLinks); const after = new Set(contract.internalLinks);
    change.addedInternalLinks = [...after].filter(h => !before.has(h)).sort();
    change.removedInternalLinks = [...before].filter(h => !after.has(h)).sort();
  }
  if (fields.includes('bodyTextSha256')) {
    change.bodyTextCharsBefore = prev.bodyText.length; change.bodyTextCharsAfter = bodyText.length;
  }
  for (const key of ['canonical', 'robots', 'googlebot', 'hreflang'] as const) {
    if (fields.includes(key) && !allowed.has(key)) throw new Error(`${prev.pathname}: ${key} changed — refused unless reviewed and passed via --allow ${key}.`);
  }
  changes.push(change);
  nextPages.push({ pathname: prev.pathname, contract, bodyText });
}

console.log(`Baseline: ${BASELINE} (${previous.capturedAt})`);
console.log(`Built pages compared: ${nextPages.length}; changed: ${changes.length}`);
for (const c of changes) {
  console.log(`- ${c.path}: ${c.fields.join(', ')}`);
  if (c.titleBefore) console.log(`    title: ${JSON.stringify(c.titleBefore)} -> ${JSON.stringify(c.titleAfter)}`);
  if (c.h1Before) console.log(`    h1: ${JSON.stringify(c.h1Before)} -> ${JSON.stringify(c.h1After)}`);
  if (c.addedInternalLinks) console.log(`    links +${(c.addedInternalLinks as string[]).length} -${(c.removedInternalLinks as string[]).length}`);
}
if (unexpected.length) {
  console.error(`\nChanged protected pages WITHOUT a reviewed reason (add to REASONS after review):\n${unexpected.join('\n')}`);
  process.exitCode = 1;
} else if (!changes.length) {
  console.log('No protected page differs from the baseline; nothing to revise.');
} else if (!write) {
  console.log(`\nDry run. Re-run with --write to create docs/seo/evidence/${suffix ? `${date}-${suffix}` : date}/reviewed-protected-pages.json`);
} else {
  const target = path.join(ROOT, 'docs', 'seo', 'evidence', suffix ? `${date}-${suffix}` : date, 'reviewed-protected-pages.json');
  if (fs.existsSync(target)) throw new Error(`Refusing to overwrite existing evidence: ${target}`);
  const snapshot: Snapshot = {
    schema: 1,
    capturedAt: new Date().toISOString(),
    source: 'Reviewed local build; not a new live capture',
    originalEvidence: BASELINE,
    reviewedChanges: changes,
    pages: nextPages,
  };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
  const rel = path.relative(ROOT, target).split(path.sep).join('/');
  console.log(`\nWrote ${rel}`);
  console.log(`Next: set BASELINE = '${rel}' in scripts/seo-protection.ts (line 11) and update its comment,`);
  console.log('then: node --import tsx scripts/seo-protection.ts check  ->  "Protected SEO: 10/10 unchanged."');
}

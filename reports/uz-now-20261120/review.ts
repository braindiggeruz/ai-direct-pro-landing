// Reviewed-revision proof for the «здесь и сейчас» release (owner's order of
// 2026-11-20): the download guide takes the bare Latin «chatgpt skachat», the UZ
// chat gets an unbroken title and an H1 with an honest «ChatGPT’ga … muqobil»,
// «Chachipiti» leads the spellings heading, and the RU chat names both languages
// in its title.
//
// Compares the fresh build (dist/) with the build of the branch base 0dca0df
// (passed as --before <dir>) and with the reviewed protected baseline. It proves:
//   1. the sitemap lists the same URLs in the same order; only the <lastmod> of
//      the three edited pages and the derived <lastmod> of / and /uz/blog/ change;
//   2. the built HTML changes on exactly five pages: the three edited pages, the
//      homepage (two list labels) and /uz/blog/ (its list of recent updates);
//   3. on the homepage, putting the two old labels back gives the predecessor
//      HTML byte for byte;
//   4. among the ten protected pages only those four change, and only in the
//      contract fields listed in ALLOWED.
// Usage: tsx reports/uz-now-20261120/review.ts --before <predecessor dist> [--write-reviewed-revision]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PROTECTED_PATHS, seoContract } from '../../scripts/seo-protection';

const PREDECESSOR = 'docs/seo/evidence/2026-11-18-uz-unpair/reviewed-protected-pages.json';
const TARGET = 'docs/seo/evidence/2026-11-20-uz-now/reviewed-protected-pages.json';
const REPORT = 'reports/uz-now-20261120/artifact-review.json';
const UZ = '/uz/gpt-uzbek-tilida/';
const RU = '/ru/gpt-chat/';
const DL = '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/';
const EDITED = [UZ, RU, DL];
const EXPECTED_HTML = ['/', '/uz/blog/', ...EDITED].sort();
const ALLOWED: Record<string, string[]> = {
  '/': ['bodyTextSha256'],
  [UZ]: ['bodyTextSha256', 'h1', 'title'],
  [RU]: ['bodyTextSha256', 'title'],
  [DL]: ['bodyTextSha256', 'h1', 'title'],
};
const EXPECT = {
  [UZ]: { title: 'ChatGPT uzbekcha muqobili: bepul kirish, ro‘yxatsiz chat', h1: 'ChatGPT’ga o‘zbekcha muqobil — 3 ta bepul sinov javobi' },
  [RU]: { title: 'Аналог ChatGPT онлайн: на русском и узбекском, без регистрации' },
  [DL]: { title: 'ChatGPT yuklab olish (skachat) o‘zbek tilida — 3 usul (2026)', h1: 'ChatGPT yuklab olish (skachat): telefon va kompyuterga xavfsiz o‘rnatish' },
} as Record<string, { title: string; h1?: string }>;
const HOME_LABELS: Array<[string, string]> = [
  ['O‘zbek tilida AI chat — 3 ta bepul sinov javobi', EXPECT[UZ].h1!],
  ['ChatGPT yuklab olish o‘zbek tilida — 3 usul (2026)', EXPECT[DL].title],
];

const args = process.argv.slice(2);
const beforeDir = args[args.indexOf('--before') + 1];
assert.ok(args.includes('--before') && beforeDir && fs.existsSync(path.join(beforeDir, 'sitemap.xml')), 'pass --before <predecessor dist>');

type Contract = ReturnType<typeof seoContract>;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
function bodyTextOf(html: string): string {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const textHtml = clean.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  return normalize((textHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '').replace(/<[^>]*>/g, ' '));
}
const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 1. Sitemap: same URLs, only the lastmod of the edited pages moves.
const sitemapBefore = read(beforeDir, 'sitemap.xml');
const sitemapAfter = read('dist', 'sitemap.xml');
assert.deepEqual(locs(sitemapAfter), locs(sitemapBefore), 'the sitemap lists the same URLs in the same order');
const maskLastmod = (xml: string) => ['/', '/uz/blog/', ...EDITED].reduce((acc, url) => {
  const entry = new RegExp(`(<loc>https://gptbot\\.uz${escapeRe(url)}</loc>(?:\\s*<xhtml:link [^>]*/>)*\\s*<lastmod>)[^<]+(</lastmod>)`);
  assert.ok(entry.test(acc), `${url}: sitemap entry with lastmod`);
  return acc.replace(entry, '$1EDITED$2');
}, xml);
assert.equal(maskLastmod(sitemapAfter), maskLastmod(sitemapBefore), 'the sitemap changes only by the lastmod of the three edited pages, / and /uz/blog/');

// 2. Every built page.
const pages: string[] = [];
const visit = (dir: string, rel: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (entry.name !== 'assets') visit(path.join(dir, entry.name), `${rel}${entry.name}/`); }
    else if (entry.name === 'index.html') pages.push(rel);
  }
};
visit('dist', '/');
assert.ok(pages.length > 400, `only ${pages.length} built pages`);
const changed: string[] = [];
const contracts = new Map<string, Contract>();
for (const url of pages) {
  const after = read('dist', path.join(url, 'index.html'));
  contracts.set(url, seoContract(after));
  const beforeFile = path.join(beforeDir, url, 'index.html');
  assert.ok(fs.existsSync(beforeFile), `${url}: missing from the predecessor`);
  if (after !== fs.readFileSync(beforeFile, 'utf8')) changed.push(url);
}
assert.deepEqual(changed.sort(), EXPECTED_HTML, 'exactly the three edited pages, the homepage and /uz/blog/ change');

// 3. Homepage: only the two list labels.
let homeReverted = read('dist', 'index.html');
for (const [oldLabel, newLabel] of HOME_LABELS) {
  assert.equal(homeReverted.split(newLabel).length - 1, 1, `homepage: the new label «${newLabel}» appears once`);
  homeReverted = homeReverted.replace(newLabel, oldLabel);
}
assert.equal(homeReverted, read(beforeDir, 'index.html'), 'homepage: the two old labels give the predecessor byte for byte');

// 4. Protected contracts against the reviewed predecessor.
const previousRaw = fs.readFileSync(PREDECESSOR, 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as { pages: Array<{ pathname: string; contract: Contract; bodyText: string }> };
const reviewedChanges: Array<{ pathname: string; fields: string[]; note: string }> = [];
const NOTES: Record<string, string> = {
  '/': 'Homepage lists: the UZ chat entry shows its new H1 and the download-guide entry its new title; putting the two old labels back gives the predecessor HTML byte for byte. Links, order and every other label are unchanged.',
  [UZ]: 'Title «ChatGPT uzbekcha muqobili — bepul kirish, ro‘yxatsiz chat» → «ChatGPT uzbekcha muqobili: bepul kirish, ro‘yxatsiz chat» (a colon instead of the dash: in 7 of 11 SERP snapshots of 2026-11-19/20 Google showed only the part after the dash); H1 «O‘zbek tilida AI chat — 3 ta bepul sinov javobi» → «ChatGPT’ga o‘zbekcha muqobil — 3 ta bepul sinov javobi»; the spellings heading starts with «Chachipiti» (22 200 a month, 15 impressions in 28 days); visible update date 20.11.2026. Description, canonical, robots, hreflang (none, A14) and internal links unchanged.',
  [RU]: 'Title «Аналог ChatGPT онлайн в Узбекистане — без регистрации» → «Аналог ChatGPT онлайн: на русском и узбекском, без регистрации» for Uzbek speakers who search in Cyrillic (чачи пити, чати пити: 49 thousand impressions in 28 days at CTR 0.16 %); visible update date 20.11.2026. H1, description, canonical, robots, hreflang (none, A14) and internal links unchanged.',
  [DL]: 'Title and H1 take «(skachat)» for the bare Latin «chatgpt skachat» (12 100 a month) and «chat gpt skachat» (4 400), which had no impressions on any of our URLs; one intro sentence on «skachat»; the official links line says they were re-checked on 20.11.2026 (Google Play, App Store and chatgpt.com/download answered 200 and name OpenAI); an H3 and paragraph on third-party «Chat GPT APK» catalogs; two FAQ answers (safe sources, Samsung); dateModified 2026-11-20. Description, canonical, robots and internal links unchanged.',
};
for (const pathname of PROTECTED_PATHS) {
  const reviewed = previous.pages.find((page) => page.pathname === pathname)!.contract;
  const current = contracts.get(pathname)!;
  const fields = (Object.keys(current) as Array<keyof Contract>).filter((key) => JSON.stringify(current[key]) !== JSON.stringify(reviewed[key])).sort();
  assert.deepEqual(fields, ALLOWED[pathname] ?? [], `${pathname}: changed fields ${fields.join(', ') || 'none'}`);
  if (EXPECT[pathname]) {
    assert.deepEqual(current.title, [EXPECT[pathname].title], `${pathname}: title`);
    if (EXPECT[pathname].h1) assert.deepEqual(current.h1, [EXPECT[pathname].h1], `${pathname}: h1`);
    assert.deepEqual(current.internalLinks, reviewed.internalLinks, `${pathname}: internal links unchanged`);
    assert.deepEqual(current.description, reviewed.description, `${pathname}: description unchanged`);
  }
  if (fields.length) reviewedChanges.push({ pathname, fields, note: NOTES[pathname] });
}

const receipt = { checkedAt: new Date().toISOString(), predecessorRevision: PREDECESSOR, pages: pages.length, changed, reviewedChanges };
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ pages: pages.length, changed }, null, 2));

if (args.includes('--write-reviewed-revision')) {
  assert.ok(!fs.existsSync(TARGET), 'Never replace immutable evidence');
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  const protectedPages = PROTECTED_PATHS.map((pathname) => {
    const bodyText = bodyTextOf(read('dist', path.join(pathname, 'index.html')));
    const contract = contracts.get(pathname)!;
    assert.equal(sha(bodyText), contract.bodyTextSha256, `${pathname}: body text fingerprint`);
    return { pathname, contract, bodyText };
  });
  fs.writeFileSync(TARGET, `${JSON.stringify({
    schema: 1, capturedAt: new Date().toISOString(), previousRevision: PREDECESSOR, previousRevisionSha256: sha(previousRaw),
    source: 'Clean build of branch claude/festive-hypatia-c43eg6 against the build of its base 0dca0df (production 655ce59a content). Four protected pages change in the fields listed in reviewedChanges; /uz/blog/ changes its list of recent updates; every other built page is byte-identical.',
    reviewedChanges,
    invisibleToGate: [
      'The sitemap <lastmod> of the three edited pages moves to 2026-11-20, and so does the derived <lastmod> of / and /uz/blog/ (latest change); every other sitemap line is unchanged.',
      'og:title, twitter:title, JSON-LD dates and headlines, the RSS feed of /uz/blog/, updates/atom.xml, llms-full.txt and the Markdown twins of the download guide and the UZ chat follow the same content edits.',
      'Owner\'s order of 2026-11-20 («мне нужен роад мап чтобы получить первые места здесь и сейчас»): observation R15 loses its clean baseline; A14 is read together with this release; R14 (login guide) is untouched. Rollback thresholds: docs/seo/research/2026-11-20-uz-top1-roadmap/NOW.md §1.',
    ],
    pages: protectedPages,
  }, null, 2)}\n`, { flag: 'wx' });
  console.log(`Reviewed revision written: ${TARGET}`);
}
if (fs.existsSync(TARGET)) {
  for (const page of (JSON.parse(fs.readFileSync(TARGET, 'utf8')) as { pages: Array<{ pathname: string; contract: unknown }> }).pages) {
    assert.deepEqual(contracts.get(page.pathname), page.contract, `${page.pathname}: reviewed revision no longer matches the build`);
  }
}

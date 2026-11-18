// Reviewed-revision proof for decision A14 (2026-11-18): the two chats are no
// longer declared as an hreflang pair.
//
// Compares the fresh build (dist/) with the build of production 09def66d
// (passed as --before <dir>) and with the reviewed protected baseline. It proves:
//   1. the sitemap lists the same URLs, and its only change is the removal of the
//      xhtml:link alternates of the two chat entries;
//   2. the two chats change only by their three <link rel="alternate" hreflang>
//      lines: emptying those lines in the predecessor HTML gives the new HTML
//      byte for byte, so the protected contract differs in `hreflang` alone;
//   3. every other built page is byte-identical to the predecessor, so the eight
//      other protected pages keep their complete contract.
// Usage: tsx reports/uz-unpair-20261118/review.ts --before <predecessor dist> [--write-reviewed-revision]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PROTECTED_PATHS, seoContract } from '../../scripts/seo-protection';

const PREDECESSOR = 'docs/seo/evidence/2026-11-17-natal/reviewed-protected-pages.json';
const TARGET = 'docs/seo/evidence/2026-11-18-uz-unpair/reviewed-protected-pages.json';
const REPORT = 'reports/uz-unpair-20261118/artifact-review.json';
const CHATS = ['/ru/gpt-chat/', '/uz/gpt-uzbek-tilida/'];

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

// 1. Sitemap
const sitemapBefore = read(beforeDir, 'sitemap.xml');
const sitemapAfter = read('dist', 'sitemap.xml');
assert.deepEqual(locs(sitemapAfter), locs(sitemapBefore), 'the sitemap lists the same URLs in the same order');
let expectedSitemap = sitemapBefore;
for (const url of CHATS) {
  const entry = new RegExp(`(<loc>https://gptbot\\.uz${url.replace(/\//g, '\\/')}</loc>)((?:\\s*<xhtml:link [^>]*/>)+)`);
  const match = expectedSitemap.match(entry);
  assert.ok(match, `${url}: the predecessor sitemap entry had alternates`);
  expectedSitemap = expectedSitemap.replace(entry, '$1');
}
assert.equal(sitemapAfter, expectedSitemap, 'the sitemap changes only by the alternates of the two chats');

// 2 and 3. Every built page
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
  const before = fs.readFileSync(beforeFile, 'utf8');
  if (after === before) continue;
  changed.push(url);
  assert.ok(CHATS.includes(url), `${url}: only the two chats may change`);
  const links = before.match(/^<link rel="alternate" hreflang="[^"]+" href="[^"]+" \/>\r?\n/gm) ?? [];
  assert.equal(links.length, 3, `${url}: the predecessor had ru, uz and x-default`);
  // The template keeps the line: an absent alternate renders as an empty line.
  let stripped = before;
  for (const line of links) stripped = stripped.replace(line, line.endsWith('\r\n') ? '\r\n' : '\n');
  assert.equal(after, stripped, `${url}: the only change is that the three hreflang lines are empty`);
}
assert.deepEqual(changed.sort(), [...CHATS].sort(), 'both chats changed');

// Protected contracts against the reviewed predecessor
const previousRaw = fs.readFileSync(PREDECESSOR, 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as { pages: Array<{ pathname: string; contract: Contract; bodyText: string }> };
const reviewedChanges: Array<{ pathname: string; fields: string[]; note: string }> = [];
for (const pathname of PROTECTED_PATHS) {
  const reviewed = previous.pages.find((page) => page.pathname === pathname)!.contract;
  const current = contracts.get(pathname)!;
  const fields = (Object.keys(current) as Array<keyof Contract>).filter((key) => JSON.stringify(current[key]) !== JSON.stringify(reviewed[key])).sort();
  if (!CHATS.includes(pathname)) {
    assert.deepEqual(fields, [], `${pathname}: a protected page other than the two chats changed (${fields.join(', ')})`);
    continue;
  }
  assert.deepEqual(fields, ['hreflang'], `${pathname}: only hreflang may change`);
  assert.deepEqual(current.hreflang, [], `${pathname}: no hreflang alternates remain`);
  reviewedChanges.push({
    pathname, fields,
    note: `Decision A14 (owner's order of 2026-11-18): the RU↔UZ chat pair is no longer declared to search engines; the three <link rel="alternate" hreflang> lines (${reviewed.hreflang.join('; ')}) are removed and nothing else changes. Title, description, H1, canonical, robots, internal links and body text are byte-identical; the visible cross-links stay.`,
  });
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
    source: 'Clean build of branch claude/uz-unpair-20261118 against the build of production 09def66d. Two protected chats lose their hreflang lines and nothing else; every other built page is byte-identical.',
    reviewedChanges,
    invisibleToGate: [
      'The sitemap entries of /ru/gpt-chat/ and /uz/gpt-uzbek-tilida/ lose their xhtml:link alternates; every other sitemap line is unchanged.',
      'Release on or after 2026-12-22, after observation R15 is read (docs/seo/research/2026-11-18-uz-unpair/EVIDENCE.md).',
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

// Reviewed-revision proof for the 2026-11-23 advertising wave D3 (owner request 23.11.2026; docs/seo/research/2026-11-23-ads-cluster-2):
// real estate and new builds, car dealers and online schools — six new articles.
//
// Compares the fresh build (dist/) with a build of the production predecessor
// (main 4d742add = production 4d742add, passed as --before <dir>) and with the reviewed protected baseline.
// It proves three things before a new revision may be written:
//   1. nine protected pages keep their complete contract;
//   2. the protected homepage changes only by list entries: every added link is
//      a newly published URL, nothing is removed, and reverting the added
//      entries and the relabelled ones restores the predecessor contract;
//   3. every other existing URL keeps title, H1, description, canonical, robots
//      and hreflang unless it is named in intended-metadata-changes.json.
// Usage: tsx reports/ads-gpt-20261123-d3/review.ts --before <predecessor dist> [--write-reviewed-revision]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PROTECTED_PATHS, seoContract } from '../../scripts/seo-protection';

const PREDECESSOR = 'docs/seo/evidence/2026-11-23-ads-gpt-d2/reviewed-protected-pages.json';
const TARGET = 'docs/seo/evidence/2026-11-23-ads-gpt-d3/reviewed-protected-pages.json';
const REPORT = 'reports/ads-gpt-20261123-d3/artifact-review.json';

/** Existing pages whose search metadata this release changes on purpose: url -> reason. */
const INTENDED_METADATA_CHANGES: Readonly<Record<string, string>> = JSON.parse(
  fs.readFileSync('reports/ads-gpt-20261123-d3/intended-metadata-changes.json', 'utf8'),
);

const args = process.argv.slice(2);
const beforeDir = args[args.indexOf('--before') + 1];
assert.ok(args.includes('--before') && beforeDir && fs.existsSync(path.join(beforeDir, 'sitemap.xml')), 'pass --before <predecessor dist>');

type Contract = ReturnType<typeof seoContract>;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
/** The same text seoContract() hashes. */
function bodyTextOf(html: string): string {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const textHtml = clean.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  return normalize((textHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '').replace(/<[^>]*>/g, ' '));
}
const sitemapOf = (dir: string) => [...fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1]).pathname);
const htmlOf = (dir: string, url: string) => fs.readFileSync(path.join(dir, url, 'index.html'), 'utf8');
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);

const before = sitemapOf(beforeDir);
const after = sitemapOf('dist');
assert.equal(new Set(after).size, after.length, 'duplicate sitemap URL');
const added = after.filter((url) => !before.includes(url)).sort();
const removed = before.filter((url) => !after.includes(url)).sort();
const INTENDED_REMOVALS: readonly string[] = [];
assert.deepEqual(removed, [...INTENDED_REMOVALS], 'no URL may leave the sitemap in this release');

const issues: string[] = [];
const changes: unknown[] = [];
const contracts = new Map<string, Contract>();
let jsonLdDocuments = 0;
const METADATA = ['title', 'h1', 'description', 'canonical', 'robots', 'googlebot', 'hreflang'];
// Studio pages are in the sitemap but are produced by build:studio, which a
// build:fast artefact does not contain: they are compared only when both builds have them.
const notBuilt: string[] = [];
for (const url of after) {
  if (!fs.existsSync(path.join('dist', url, 'index.html'))) {
    assert.ok(!fs.existsSync(path.join(beforeDir, url, 'index.html')) && !added.includes(url), `${url}: missing from the new build only`);
    notBuilt.push(url);
    continue;
  }
  const html = htmlOf('dist', url);
  const contract = seoContract(html);
  contracts.set(url, contract);
  assert.equal(contract.title.length, 1, `${url}: title`);
  assert.equal(contract.h1.length, 1, `${url}: H1`);
  assert.equal(contract.description.length, 1, `${url}: description`);
  assert.deepEqual(contract.canonical, [`https://gptbot.uz${url}`], `${url}: canonical`);
  assert.ok(!contract.robots.some((value) => /noindex|none/i.test(value)), `${url}: noindex`);
  for (const match of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    JSON.parse(match[1]);
    jsonLdDocuments += 1;
  }
  if (added.includes(url)) {
    assert.ok(bodyTextOf(html).length > 2500, `${url}: substantive content`);
    for (const href of contract.internalLinks) {
      const pathname = href.replace(/^https:\/\/gptbot\.uz/, '').split('#')[0].split('?')[0];
      if (!pathname.startsWith('/')) continue;
      const file = path.join('dist', pathname, pathname.endsWith('/') ? 'index.html' : '');
      if (!fs.existsSync(file)) issues.push(`${url}: broken internal href ${href}`);
    }
    continue;
  }
  const old = seoContract(htmlOf(beforeDir, url));
  const fields = (Object.keys(contract) as Array<keyof Contract>).filter((key) => JSON.stringify(contract[key]) !== JSON.stringify(old[key]));
  if (!fields.length) continue;
  const metadata = fields.filter((key) => METADATA.includes(key));
  if (metadata.length && !INTENDED_METADATA_CHANGES[url]) issues.push(`${url}: unexpected metadata change: ${metadata.join(', ')}`);
  changes.push({
    url, fields,
    addedLinks: contract.internalLinks.filter((link) => !old.internalLinks.includes(link)),
    removedLinks: old.internalLinks.filter((link) => !contract.internalLinks.includes(link)),
    ...(metadata.length ? {
      before: Object.fromEntries(metadata.map((key) => [key, old[key]])),
      after: Object.fromEntries(metadata.map((key) => [key, contract[key]])),
    } : {}),
  });
}
for (const url of Object.keys(INTENDED_METADATA_CHANGES)) assert.ok(after.includes(url), `${url}: intended change names an unpublished URL`);

// Discovery: a new URL needs links from pages other than the homepage shell.
const coverage = added.map((url) => ({
  url,
  incoming: after.filter((from) => from !== url && from !== '/' && contracts.get(from)?.internalLinks.some((href) => href.split('#')[0] === url)),
}));
for (const row of coverage) if (row.incoming.length < 2) issues.push(`${row.url}: fewer than two contextual incoming links (${row.incoming.length})`);

// Protected pages against the reviewed predecessor.
const previousRaw = fs.readFileSync(PREDECESSOR, 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as { pages: Array<{ pathname: string; contract: Contract; bodyText: string }> };
const reviewedChanges: Array<{ pathname: string; fields: string[]; note: string }> = [];
for (const pathname of PROTECTED_PATHS) {
  const reviewed = previous.pages.find((page) => page.pathname === pathname)!.contract;
  const current = contracts.get(pathname)!;
  const fields = (Object.keys(current) as Array<keyof Contract>)
    .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(reviewed[key])).sort();
  if (pathname !== '/') {
    assert.deepEqual(fields, [], `${pathname}: a protected page other than the homepage changed (${fields.join(', ')})`);
    continue;
  }
  for (const field of fields) assert.ok(['bodyTextSha256', 'internalLinks'].includes(field), `/: unexpected protected change: ${field}`);
  const addedHome = current.internalLinks.filter((link) => !reviewed.internalLinks.includes(link));
  assert.deepEqual(reviewed.internalLinks.filter((link) => !current.internalLinks.includes(link)), [], '/: a reviewed homepage link disappeared');
  for (const link of addedHome) assert.ok(added.includes(link), `/: added homepage link is not a newly published URL: ${link}`);
  // Reversal: drop the new entries and restore the old label of relabelled ones.
  let reverted = htmlOf('dist', '/');
  const oldHome = htmlOf(beforeDir, '/');
  const entry = (url: string) => new RegExp(`<li><a href="${escapeRegExp(url)}"((?: hreflang="(?:ru|uz)")?)>([^<]+)</a></li>`, 'g');
  for (const url of addedHome) {
    assert.equal([...reverted.matchAll(entry(url))].length, 1, `${url}: exactly one homepage entry`);
    reverted = reverted.replace(entry(url), '');
  }
  const relabelled: Array<{ url: string; before: string; after: string }> = [];
  for (const link of reviewed.internalLinks) {
    const was = [...oldHome.matchAll(entry(link))];
    const now = [...reverted.matchAll(entry(link))];
    if (was.length !== 1 || now.length !== 1 || was[0][2] === now[0][2]) continue;
    relabelled.push({ url: link, before: was[0][2], after: now[0][2] });
    reverted = reverted.replace(entry(link), () => was[0][0]);
  }
  for (const row of relabelled) {
    assert.ok(INTENDED_METADATA_CHANGES[row.url], `/: homepage label changed for a page without an intended metadata change: ${row.url}`);
  }
  assert.deepEqual(seoContract(reverted), reviewed, '/: reverting the added and relabelled list entries must restore the reviewed homepage');
  reviewedChanges.push({
    pathname, fields,
    note: `Homepage lists only: ${addedHome.length} newly published URL(s) added, ${relabelled.length} existing entr${relabelled.length === 1 ? 'y' : 'ies'} relabelled after an intended title change; no link removed. Reverting exactly these entries restores the reviewed predecessor contract.`,
  });
  changes.push({ url: '/', protectedHomepage: true, addedHome, relabelled });
}

const receipt = {
  checkedAt: new Date().toISOString(), predecessorRevision: PREDECESSOR, sitemapBefore: before.length, sitemapAfter: after.length,
  added, notBuilt, coverage, intendedMetadataChanges: INTENDED_METADATA_CHANGES, changes, issues, jsonLdDocuments,
};
fs.writeFileSync(REPORT, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ sitemapBefore: before.length, sitemapAfter: after.length, added, changedExisting: changes.length, issues }, null, 2));
assert.equal(issues.length, 0, `Review failed; see ${REPORT}`);

if (args.includes('--write-reviewed-revision')) {
  assert.ok(!fs.existsSync(TARGET), 'Never replace immutable evidence');
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  const pages = PROTECTED_PATHS.map((pathname) => {
    const bodyText = bodyTextOf(htmlOf('dist', pathname));
    const contract = contracts.get(pathname)!;
    assert.equal(sha(bodyText), contract.bodyTextSha256, `${pathname}: body text fingerprint`);
    return { pathname, contract, bodyText };
  });
  fs.writeFileSync(TARGET, `${JSON.stringify({
    schema: 1, capturedAt: new Date().toISOString(), previousRevision: PREDECESSOR, previousRevisionSha256: sha(previousRaw),
    source: 'Clean build of the 2026-11-23 advertising wave D3 against a build of production 4d742add. Nine protected pages keep their complete contract; the homepage gains list entries for the six new articles only and relabels nothing.',
    reviewedChanges,
    invisibleToGate: [
      'Six new articles in three RU/UZ pairs: real estate and new builds (/ru/blog/reklama-nedvizhimosti-i-novostroek/, /uz/blog/kochmas-mulk-reklamasi/), car dealers (/ru/blog/reklama-avtosalona/, /uz/blog/mashina-savdosi-reklamasi/) and online schools (/ru/blog/reklama-onlayn-shkoly/, /uz/blog/onlayn-maktab-reklamasi/).',
      'Body-only additions: related links in twelve existing articles; intent manifest pairs W20261123-63…68; llms.txt routing lines and three quick answers. No related-article card changes on money pages. No existing title, H1, description, canonical, robots or hreflang changes.',
      'No price, payment, bot, webhook, credential, analytics or chat bundle change; no change on the protected pages other than the homepage lists.',
    ],
    pages,
  }, null, 2)}\n`, { flag: 'wx' });
  console.log(`Reviewed revision written: ${TARGET}`);
}
if (fs.existsSync(TARGET)) {
  for (const page of (JSON.parse(fs.readFileSync(TARGET, 'utf8')) as { pages: Array<{ pathname: string; contract: unknown }> }).pages) {
    assert.deepEqual(contracts.get(page.pathname), page.contract, `${page.pathname}: reviewed revision no longer matches the build`);
  }
}

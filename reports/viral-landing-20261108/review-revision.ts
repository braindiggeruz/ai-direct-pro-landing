// Review one added article against the verified predecessor artifact. Fail
// closed on unrelated SEO changes; a new revision never overwrites its parent.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertSeoProtection, PROTECTED_PATHS, seoContract } from '../../scripts/seo-protection';
import { verifyStampedArtifact } from '../../scripts/release/pages-production';
import { publishedStudioUrls } from '../../apps/studio/shared/published-urls';

const root = process.cwd();
const before = process.env.VIRAL_BEFORE_DIST;
assert.ok(before, 'Set VIRAL_BEFORE_DIST to the read-only predecessor dist');
const after = path.join(root, 'dist');
assert.notEqual(path.resolve(before), path.resolve(after), 'Before and after must be different artifacts');
const expectedCommit = 'a52cc9420aafe582485921196af5317208f82878';
const expectedArtifact = 'b5df41ddbe4ca1778658a59a8315a791ecc8b81ac3996c5e0fc0c48b6d8ef207';
const predecessorPath = 'docs/seo/evidence/2026-11-08-seo-ai-roadmap/reviewed-protected-pages.json';
const revisionPath = 'docs/seo/evidence/2026-11-08-viral-article/reviewed-protected-pages.json';
const reportDir = path.join(root, 'reports/viral-landing-20261108');
const articlePath = '/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/';
const articleUrl = `https://gptbot.uz${articlePath}`;
const indexPath = '/ru/blog/';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const readHtml = (dir: string, pathname: string) => fs.readFileSync(path.join(dir, pathname.slice(1), 'index.html'), 'utf8');
const urls = (dir: string) => [...fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]).sort();
const bodyText = (html: string) => (html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const escapeText = (value: string) => value.replace(/[&<]/g, character => character === '&' ? '&amp;' : '&lt;');
const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
type Contract = ReturnType<typeof seoContract>;
type Row = { pathname: string; contract: Contract; bodyText: string; htmlSha256: string };
const snapshot = (dir: string, pathname: string): Row => {
  const html = readHtml(dir, pathname);
  return { pathname, contract: seoContract(html), bodyText: bodyText(html), htmlSha256: sha(html) };
};
const beforeManifest = verifyStampedArtifact(before, expectedCommit, publishedStudioUrls(root));
assert.equal(beforeManifest.commit, expectedCommit, 'Unexpected predecessor commit');
assert.equal(beforeManifest.artifactSha256, expectedArtifact, 'Unexpected predecessor artifact');
assert.equal(beforeManifest.fileCount, 1063, 'Unexpected predecessor file count');
assertSeoProtection(before, path.join(root, predecessorPath));
const beforeUrls = urls(before);
assert.equal(beforeUrls.length, 329, 'Expected the reviewed 329-URL predecessor');
assert.equal(new Set(beforeUrls).size, beforeUrls.length, 'Duplicate predecessor URL');
const beforeRows = beforeUrls.map(url => snapshot(before, new URL(url).pathname));
const beforeEvidence = { schema: 1, productionCommit: beforeManifest.commit, artifactSha256: beforeManifest.artifactSha256,
  fileCount: beforeManifest.fileCount, sitemapSha256: sha(fs.readFileSync(path.join(before, 'sitemap.xml'))), pages: beforeRows };
fs.mkdirSync(reportDir, { recursive: true });
const beforeFile = process.env.VIRAL_BASELINE_SNAPSHOT || path.join(reportDir, 'before-contracts.json');
fs.mkdirSync(path.dirname(beforeFile), { recursive: true });
if (fs.existsSync(beforeFile)) assert.deepEqual(JSON.parse(fs.readFileSync(beforeFile, 'utf8')), beforeEvidence, 'Preserved baseline evidence changed');
else fs.writeFileSync(beforeFile, JSON.stringify(beforeEvidence, null, 2) + '\n', { flag: 'wx' });
if (process.argv.includes('--snapshot-only')) {
  console.log(JSON.stringify({ status: 'baseline_verified', commit: beforeManifest.commit,
    artifactSha256: beforeManifest.artifactSha256, files: beforeManifest.fileCount, urls: beforeRows.length }));
  process.exit(0);
}

const afterUrls = urls(after);
assert.equal(afterUrls.length, 330, 'Expected exactly one new sitemap URL');
assert.equal(new Set(afterUrls).size, afterUrls.length, 'Duplicate candidate URL');
assert.deepEqual(afterUrls, [...beforeUrls, articleUrl].sort(), 'Only the approved article may be added; nothing removed');
const article = JSON.parse(fs.readFileSync(path.join(root, 'content/blog/ru/ii-zahvatit-mir-nachnem-s-zayavok.json'), 'utf8')) as { title: string; h1: string; url: string; datePublished: string; dateModified: string };
assert.equal(article.url, articlePath);
assert.equal(article.datePublished, article.dateModified, 'New article must not alter the recently-updated list');
const changed: Array<{ pathname: string; fields: string[]; changes: Record<string, { before: unknown; after: unknown }> }> = [];
const afterRows = new Map<string, Row>();
let jsonLdBlocks = 0;
for (const url of afterUrls) {
  const pathname = new URL(url).pathname;
  const html = readHtml(after, pathname);
  const row = snapshot(after, pathname);
  afterRows.set(pathname, row);
  const contract = row.contract;
  assert.equal(contract.title.length, 1, `${pathname}: one title`);
  assert.equal(contract.h1.length, 1, `${pathname}: one H1`);
  assert.equal(contract.description.length, 1, `${pathname}: one description`);
  assert.ok(contract.title[0].trim() && contract.h1[0].trim() && contract.description[0].trim(), `${pathname}: nonempty metadata`);
  assert.deepEqual(contract.canonical, [url], `${pathname}: self canonical`);
  assert.ok(![...contract.robots, ...contract.googlebot].some(value => /noindex|none/i.test(value)), `${pathname}: indexable`);
  assert.equal(sha(row.bodyText), contract.bodyTextSha256, `${pathname}: consistent body fingerprint`);
  for (const block of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    assert.ok(JSON.parse(block[1]), `${pathname}: valid JSON-LD`);
    jsonLdBlocks++;
  }
  if (pathname === articlePath) continue;
  const previous = beforeRows.find(item => item.pathname === pathname);
  assert.ok(previous, `${pathname}: missing predecessor`);
  const fields = (Object.keys(contract) as Array<keyof Contract>).filter(key => JSON.stringify(contract[key]) !== JSON.stringify(previous.contract[key]));
  if (!['/', indexPath].includes(pathname)) assert.deepEqual(contract, previous.contract, `${pathname}: unrelated SEO contract changed`);
  else {
    assert.deepEqual([...fields].sort(), ['bodyTextSha256', 'internalLinks'], `${pathname}: only the new article listing may change`);
    assert.deepEqual(contract.internalLinks.filter(link => !previous.contract.internalLinks.includes(link)), [articlePath], `${pathname}: only one new link`);
    assert.deepEqual(previous.contract.internalLinks.filter(link => !contract.internalLinks.includes(link)), [], `${pathname}: no lost links`);
    const pattern = pathname === '/'
      ? new RegExp(`<li><a href="${escapeRe(articlePath)}">${escapeRe(escapeText(article.title))}<\\/a><\\/li>`, 'g')
      : new RegExp(`<a href="${escapeRe(articlePath)}" data-testid="blog-card"[^>]*>[\\s\\S]*?<\\/a>`, 'g');
    const matches = [...html.matchAll(pattern)];
    assert.equal(matches.length, 1, `${pathname}: exactly one authored listing`);
    assert.deepEqual(seoContract(html.replace(pattern, '')), previous.contract, `${pathname}: removing the new listing restores every old contract`);
  }
  if (fields.length) changed.push({ pathname, fields, changes: Object.fromEntries(fields.map(key => [key, { before: previous.contract[key], after: contract[key] }])) });
}
assert.deepEqual(changed.map(row => row.pathname).sort(), ['/', indexPath].sort(), 'Exactly homepage and RU index change');
const previousRaw = fs.readFileSync(path.join(root, predecessorPath), 'utf8').replace(/\r\n/g, '\n');
const previousRevision = JSON.parse(previousRaw) as { pages: Row[] };
const protectedPages = PROTECTED_PATHS.map(pathname => {
  const row = afterRows.get(pathname);
  assert.ok(row, `${pathname}: missing protected candidate`);
  if (pathname !== '/') assert.deepEqual(row.contract, previousRevision.pages.find(item => item.pathname === pathname)?.contract, `${pathname}: protected metadata/content changed`);
  return row;
});
const checkedAt = new Date().toISOString();
const report = { schema: 1, checkedAt, beforeCommit: beforeManifest.commit, beforeArtifact: beforeManifest.artifactSha256,
  beforeUrls: beforeUrls.length, afterUrls: afterUrls.length, addedUrls: [articleUrl], removedUrls: [], jsonLdBlocks,
  unchangedExistingContracts: beforeRows.length - changed.length, listingRestorationVerified: true, changed, newArticle: afterRows.get(articlePath) };
fs.writeFileSync(path.join(reportDir, 'artifact-review.json'), JSON.stringify(report, null, 2) + '\n');
const target = path.join(root, revisionPath);
if (process.argv.includes('--write-reviewed-revision')) {
  assert.ok(!fs.existsSync(target), 'Revision exists; immutable evidence must not be overwritten');
  const revision = { schema: 1, capturedAt: checkedAt, previousRevision: predecessorPath, previousRevisionSha256: sha(previousRaw),
    source: 'Owner-authorized viral article. Predecessor production a52cc942 artifact verified. One RU article added; only its authored listing changes the protected homepage.',
    reviewedChanges: changed.filter(row => (PROTECTED_PATHS as readonly string[]).includes(row.pathname)),
    invisibleToGate: ['New article has a URL-scoped layout and reuses the existing local demo, consent-based lead form and analytics acknowledgement.', 'RU blog index adds one authored card. Sitemap adds exactly one article. No indexing, ranking or conversion uplift is claimed.'],
    pages: protectedPages };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
}
if (fs.existsSync(target)) assertSeoProtection(after, target);
console.log(JSON.stringify({ status: 'pass', beforeUrls: beforeUrls.length, afterUrls: afterUrls.length,
  unchangedExistingContracts: report.unchangedExistingContracts, changed: changed.map(({ pathname, fields }) => ({ pathname, fields })),
  jsonLdBlocks, revisionExists: fs.existsSync(target) }));

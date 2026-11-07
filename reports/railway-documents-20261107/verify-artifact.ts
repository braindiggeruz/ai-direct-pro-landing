import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertSeoProtection, BASELINE, PROTECTED_PATHS, seoContract } from '../../scripts/seo-protection';
import { assertChatBundleBudget } from '../../scripts/chat-bundle-budget';
import { verifyStampedArtifact } from '../../scripts/release/pages-production';
import { publishedStudioUrls } from '../../apps/studio/shared/published-urls';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PREVIOUS = 'F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/gptbot-seo-implementation-20261107/dist';
const CURRENT = path.join(ROOT, 'dist');
const EXPECTED_PREVIOUS_COMMIT = 'ee11957d872ea98f683bc23bbf33c715aed59a1b';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const files = (root: string): string[] => fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
const previousStamp = JSON.parse(fs.readFileSync(path.join(PREVIOUS, 'gptbot-release.json'), 'utf8'));
if (previousStamp.commit !== EXPECTED_PREVIOUS_COMMIT) throw new Error('Unexpected predecessor commit');
verifyStampedArtifact(PREVIOUS, previousStamp.commit, publishedStudioUrls(ROOT));

if (process.argv.includes('--predecessor-only')) {
  console.log(JSON.stringify({ predecessor: PREVIOUS, stampVerified: true, commit: previousStamp.commit, artifactSha256: previousStamp.artifactSha256, fileCount: previousStamp.fileCount }, null, 2));
  process.exit(0);
}

const beforeFiles = files(PREVIOUS), afterFiles = files(CURRENT);
const beforeHtml = beforeFiles.filter(file => file.endsWith('.html')), afterHtml = afterFiles.filter(file => file.endsWith('.html'));
const sitemapUrls = (root: string) => [...fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]).sort();
const previousUrls = sitemapUrls(PREVIOUS), currentUrls = sitemapUrls(CURRENT);
const sitemapMissingHtml = currentUrls.filter(url => {
  const pathname = new URL(url).pathname;
  const file = pathname === '/' ? 'index.html' : `${pathname.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
  return !afterHtml.includes(file);
});
const missingPages = beforeHtml.filter(file => !afterHtml.includes(file));
const addedPages = afterHtml.filter(file => !beforeHtml.includes(file));
type Difference = { path: string; field: string; before: unknown; after: unknown };
const differences: Difference[] = [];
const rawHtmlChanges: string[] = [];
function extendedContract(html: string) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const head = clean.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  return {
    ...seoContract(html),
    metaTags: [...head.matchAll(/<meta\b[^>]*>/gi)].map(match => match[0].replace(/\s+/g, ' ').trim()).sort(),
    jsonLd: [...clean.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(match => JSON.parse(match[1])),
    language: clean.match(/<html\b[^>]*lang=["']([^"']*)["']/i)?.[1] ?? '',
  };
}
for (const file of beforeHtml.filter(file => afterHtml.includes(file))) {
  const before = fs.readFileSync(path.join(PREVIOUS, file), 'utf8'), after = fs.readFileSync(path.join(CURRENT, file), 'utf8');
  if (before !== after) rawHtmlChanges.push(file);
  const a = extendedContract(before), b = extendedContract(after);
  for (const field of Object.keys(a) as Array<keyof typeof a>) if (!equal(a[field], b[field])) differences.push({ path: file, field, before: a[field], after: b[field] });
}
let protectedGate: { ok: boolean; pages: number; baseline: string; error?: string };
try { assertSeoProtection(CURRENT); protectedGate = { ok: true, pages: PROTECTED_PATHS.length, baseline: BASELINE }; }
catch (error) { protectedGate = { ok: false, pages: PROTECTED_PATHS.length, baseline: BASELINE, error: String(error) }; }
let bundle: unknown;
let bundleOk = false;
try { bundle = assertChatBundleBudget(CURRENT); bundleOk = true; } catch (error) { bundle = { error: String(error) }; }

const stablePaths = beforeFiles.filter(file => /(?:\.xml|\.md|\.txt)$/.test(file) || ['_headers', '_redirects', '_routes.json'].includes(file));
const stableFileChanges = stablePaths.filter(file => !afterFiles.includes(file) || sha(fs.readFileSync(path.join(PREVIOUS, file))) !== sha(fs.readFileSync(path.join(CURRENT, file))));
const currentFiles = afterFiles.filter(file => file !== 'gptbot-release.json').map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(CURRENT, file))) }));
const currentStampPath = path.join(CURRENT, 'gptbot-release.json');
const currentStamp = fs.existsSync(currentStampPath) ? JSON.parse(fs.readFileSync(currentStampPath, 'utf8')) : null;
let currentStampVerified = false;
if (currentStamp) { verifyStampedArtifact(CURRENT, currentStamp.commit, publishedStudioUrls(ROOT)); currentStampVerified = true; }
const result = {
  checkedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(),
  predecessor: { path: PREVIOUS, stampVerified: true, commit: previousStamp.commit, artifactSha256: previousStamp.artifactSha256, fileCount: previousStamp.fileCount },
  current: { path: CURRENT, stampVerified: currentStampVerified, stamp: currentStamp, measuredArtifactSha256: sha(JSON.stringify(currentFiles)), fileCount: currentFiles.length },
  pages: { before: beforeHtml.length, after: afterHtml.length, compared: beforeHtml.length - missingPages.length, missing: missingPages, added: addedPages, rawHtmlChanges, contractDifferences: differences },
  sitemap: { previousUrls: previousUrls.length, currentUrls: currentUrls.length, urlsUnchanged: equal(previousUrls, currentUrls), missingHtml: sitemapMissingHtml },
  stableFiles: { checked: stablePaths.length, changed: stableFileChanges },
  protectedGate,
  bundle: { ok: bundleOk, report: bundle },
  ok: !missingPages.length && !addedPages.length && !differences.length && !stableFileChanges.length && equal(previousUrls, currentUrls) && !sitemapMissingHtml.length && protectedGate.ok && bundleOk,
  scope: 'Built local artifact regression evidence; not a production deployment or Railway enablement check.',
};
fs.writeFileSync(path.join(import.meta.dirname, 'verify-artifact.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ok: result.ok, predecessorVerified: true, currentStampVerified, pages: result.pages.compared, missing: missingPages.length, added: addedPages.length, contractDifferences: differences.length, stableFileChanges, protectedGate, bundleOk, artifactSha256: result.current.measuredArtifactSha256 }, null, 2));
if (!result.ok) process.exitCode = 1;

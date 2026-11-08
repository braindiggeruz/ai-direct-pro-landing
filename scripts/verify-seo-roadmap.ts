// Scoped release review: preserve all URL/indexation contracts and explain each
// changed traffic-leader field before writing an immutable reviewed revision.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PROTECTED_PATHS, seoContract } from './seo-protection';

const before = process.env.SEO_ROADMAP_BEFORE_DIST;
if (!before || !fs.existsSync(path.join(before, 'gptbot-release.json'))) throw new Error('Set SEO_ROADMAP_BEFORE_DIST to the preserved production artifact');
const root = process.cwd();
const after = path.join(root, 'dist');
const reportDir = path.join(root, 'reports/seo-ai-roadmap-20261108');
const revisionPath = 'docs/seo/evidence/2026-11-08-seo-ai-roadmap/reviewed-protected-pages.json';
const predecessorPath = 'docs/seo/evidence/2026-11-06-uz-query-recovery/reviewed-protected-pages.json';
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const fileFor = (dir: string, url: string) => path.join(dir, new URL(url, 'https://gptbot.uz').pathname.slice(1), 'index.html');
const urls = (dir: string) => [...fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort();
const beforeUrls = urls(before);
assert.deepEqual(urls(after), beforeUrls, 'published sitemap URL set must remain unchanged');
const metadataAllowed: Record<string, string[]> = {
  '/ru/gpt-chat/': ['h1'],
  '/uz/gpt-uzbek-tilida/': ['h1'],
  '/uz/blog/chatgptga-qanday-kirish-mumkin/': ['description'],
  '/ru/o-kompanii/': ['title', 'description'],
  '/uz/biz-haqimizda/': ['title', 'description'],
  '/ru/ai-bot-dlya-biznesa/': ['description'],
};
const protectedAllowed: Record<string, string[]> = {
  '/': ['bodyTextSha256', 'internalLinks'],
  '/ru/gpt-chat/': ['h1', 'bodyTextSha256', 'internalLinks'],
  '/uz/gpt-uzbek-tilida/': ['h1', 'bodyTextSha256', 'internalLinks'],
  '/uz/blog/chatgptga-qanday-kirish-mumkin/': ['description'],
};
const differences: Array<{ pathname: string; fields: string[]; changes: Record<string, unknown> }> = [];
let jsonLdBlocks = 0;
for (const url of beforeUrls) {
  const pathname = new URL(url).pathname;
  const html = fs.readFileSync(fileFor(after, pathname), 'utf8');
  const previous = seoContract(fs.readFileSync(fileFor(before, pathname), 'utf8'));
  const current = seoContract(html);
  assert.equal(current.title.length, 1, `${pathname}: title`);
  assert.equal(current.h1.length, 1, `${pathname}: H1`);
  assert.equal(current.description.length, 1, `${pathname}: description`);
  assert.equal(current.canonical[0], url, `${pathname}: self canonical`);
  assert.ok(!current.robots.some(v => /noindex/i.test(v)), `${pathname}: noindex`);
  const fields = (Object.keys(current) as Array<keyof typeof current>).filter(key => JSON.stringify(current[key]) !== JSON.stringify(previous[key]));
  for (const key of fields) {
    if (!['bodyTextSha256', 'internalLinks'].includes(key)) {
      assert.ok((metadataAllowed[pathname] ?? []).includes(key), `${pathname}: unreviewed ${key}`);
    }
    if ((PROTECTED_PATHS as readonly string[]).includes(pathname)) {
      assert.ok((protectedAllowed[pathname] ?? []).includes(key), `${pathname}: unreviewed protected ${key}`);
    }
  }
  if (fields.length) differences.push({ pathname, fields, changes: Object.fromEntries(fields.map(key => [key, { before: previous[key], after: current[key] }])) });
  for (const block of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    assert.ok(JSON.parse(block[1]), `${pathname}: invalid JSON-LD`);
    jsonLdBlocks++;
  }
}
const login = '/uz/blog/chatgptga-qanday-kirish-mumkin/';
assert.deepEqual(differences.find(row => row.pathname === login)?.fields, ['description'], 'login experiment stays description-only');
const buildManifest = JSON.parse(fs.readFileSync(path.join(before, 'gptbot-release.json'), 'utf8'));
const report = { checkedAt: new Date().toISOString(), productionBefore: buildManifest.commit, artifactBefore: buildManifest.artifactSha256,
  urls: beforeUrls.length, jsonLdBlocks, unchangedIndexation: true, differences };
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'artifact-review.json'), JSON.stringify(report, null, 2) + '\n');

if (process.argv.includes('--write-reviewed-revision')) {
  const target = path.join(root, revisionPath);
  assert.ok(!fs.existsSync(target), 'Reviewed revisions are immutable; inspect instead of overwriting');
  // The revision contract hashes LF-normalized text across Windows checkouts.
  const previousText = fs.readFileSync(path.join(root, predecessorPath), 'utf8').replace(/\r\n/g, '\n');
  const prior = JSON.parse(previousText);
  for (const row of prior.pages) assert.deepEqual(seoContract(fs.readFileSync(fileFor(before, row.pathname), 'utf8')), row.contract, `preserved production differs from previous review: ${row.pathname}`);
  const pages = PROTECTED_PATHS.map(pathname => {
    const html = fs.readFileSync(fileFor(after, pathname), 'utf8');
    const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const bodyText = (clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return { pathname, contract: seoContract(html), bodyText };
  });
  const reviewedChanges = differences.filter(row => (PROTECTED_PATHS as readonly string[]).includes(row.pathname));
  const revision = { schema: 1, capturedAt: report.checkedAt, previousRevision: predecessorPath, previousRevisionSha256: sha(previousText),
    source: 'Owner-authorized unified SEO/AI roadmap. Current production artifact02a3613c preserved; factual chat package correction and separate login-description experiment. No observed ranking uplift claimed.',
    reviewedChanges, invisibleToGate: ['Organization descriptions, linked AI chat application and paid Offer use current facts; all JSON-LD parses.', 'Shared backend billing constants generate the factual HTML/Markdown/llms block. Payment availability is not inferred from a build.', 'Homepage visible product overview and no-JavaScript shell share the same copy. Existing analytics and billing behavior retained.'], pages };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ urls: report.urls, jsonLdBlocks, changedContracts: differences.length, protectedChanges: differences.filter(r => (PROTECTED_PATHS as readonly string[]).includes(r.pathname)).map(r => ({ path: r.pathname, fields: r.fields })) }));

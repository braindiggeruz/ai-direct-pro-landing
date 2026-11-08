import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../scripts/seo-protection';
import { PSEO_PAGE_URLS, PSEO_DOCUMENT_SLUGS, PSEO_PRACTICE_PAGES, PSEO_DOWNLOAD_URLS } from '../../src/shared/pseo20';

const evidence = process.env.PSEO_EVIDENCE;
assert.ok(evidence, 'Set PSEO_EVIDENCE to cohort evidence root');
const prior = JSON.parse(fs.readFileSync(path.join(evidence, 'before/contracts.json'), 'utf8'));
assert.equal(prior.manifest.commit, 'e85da915a070acc71b7d9b76b5a7a92b1ac08fe4');
assert.equal(prior.pages.length, 330);
const read = (url: string) => fs.readFileSync(path.join('dist', url, 'index.html'), 'utf8');
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const textOf = (s: string) => (s.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sitemap = [...fs.readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname).sort();
assert.deepEqual(sitemap, [...prior.pages.map((p: { url: string }) => p.url), ...PSEO_PAGE_URLS].sort());
assert.equal(new Set(sitemap).size, 350);
const incoming = JSON.parse(fs.readFileSync('reports/pseo20-20261108/incoming-links.json', 'utf8'));
const expected = new Map<string, string[]>([['/', [...PSEO_PAGE_URLS]], ['/uz/blog/', PSEO_DOCUMENT_SLUGS.map(s => `/uz/blog/${s}/`)]]);
for (const [src, entries] of Object.entries(incoming)) {
  const d = JSON.parse(fs.readFileSync(`content/${src}.json`, 'utf8'));
  expected.set(d.url, (entries as string[][]).map(([slug]) => `/uz/${src.startsWith('blog/') ? 'blog/' : ''}${slug}/`));
}
const changes: Array<{ url: string; fields: string[]; addedLinks: string[] }> = [];
const rows = new Map();
let ldCount = 0;
for (const url of sitemap) {
  const html = read(url), contract = seoContract(html);
  assert.equal(contract.title.length, 1, url + ' title');
  assert.equal(contract.description.length, 1, url + ' description');
  assert.equal(contract.h1.length, 1, url + ' H1');
  assert.deepEqual(contract.canonical, ['https://gptbot.uz' + url], url + ' canonical');
  assert.ok(![...contract.robots, ...contract.googlebot].some(v => /noindex|none/i.test(v)), url + ' indexable');
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { JSON.parse(match[1]); ldCount++; }
  const row = { pathname: url, contract, bodyText: textOf(html), htmlSha256: sha(html) };
  rows.set(url, row);
  const old = prior.pages.find((p: { url: string }) => p.url === url);
  if (old) {
    const keys = (Object.keys(contract) as Array<keyof typeof contract>).filter(k => JSON.stringify(contract[k]) !== JSON.stringify(old.contract[k]));
    if (!expected.has(url)) assert.deepEqual(contract, old.contract, url + ': unrelated contract');
    else {
      assert.deepEqual(keys.sort(), ['bodyTextSha256', 'internalLinks'], url + ': only intended body/links');
      const added = contract.internalLinks.filter(u => !old.contract.internalLinks.includes(u));
      assert.deepEqual(added.sort(), expected.get(url)!.sort(), url + ': exact added links');
      assert.deepEqual(old.contract.internalLinks.filter((u: string) => !contract.internalLinks.includes(u)), [], url + ': no removed link');
      changes.push({ url, fields: keys, addedLinks: added });
    }
  } else {
    assert.ok(PSEO_PAGE_URLS.includes(url));
    assert.match(html, /<html[^>]*lang="uz"/);
    assert.ok(contract.title[0].endsWith('| GPTBot.uz'));
    assert.ok(textOf(html).length > 2000, url + ': substantive visible content');
    for (const href of contract.internalLinks) {
      if (!href.startsWith('/') || href.startsWith('/api/')) continue;
      const pathname = new URL(href, 'https://gptbot.uz').pathname;
      const target = path.join('dist', pathname, pathname.endsWith('/') ? 'index.html' : '');
      assert.ok(fs.existsSync(target), `${url}: broken internal link ${href}`);
    }
    const doc = PSEO_DOCUMENT_SLUGS.find(s => url === `/uz/blog/${s}/`);
    if (doc) {
      assert.equal((html.match(/data-pseo-document/g) || []).length, 1);
      assert.match(html, new RegExp(`/downloads/pseo-20261108/${doc}\\.docx`));
      assert.match(html, new RegExp(`/downloads/pseo-20261108/${doc}\\.pdf`));
    } else {
      assert.equal((html.match(/data-pq-item=/g) || []).length, 12);
      assert.equal((html.match(/id="practice-quiz"/g) || []).length, 1);
      assert.ok(html.indexOf('data-pseo-practice') < html.indexOf('id="main"'), url + ': useful tool before chat');
    }
  }
}
assert.deepEqual(changes.map(c => c.url).sort(), [...expected.keys()].sort());
let strippedHome = read('/');
for (const url of PSEO_PAGE_URLS) {
  const pattern = new RegExp(`<li><a href="${esc(url)}" hreflang="uz">[^<]+<\\/a><\\/li>`, 'g');
  assert.equal([...strippedHome.matchAll(pattern)].length, 1, url + ': one homepage entry');
  strippedHome = strippedHome.replace(pattern, '');
}
assert.deepEqual(seoContract(strippedHome), prior.pages.find((p: { url: string }) => p.url === '/')!.contract, 'Removing exactly 20 homepage entries restores the entire old contract');
for (const file of PSEO_DOWNLOAD_URLS) assert.ok(fs.statSync(path.join('dist', file)).size > 1000);
const predecessorPath = 'docs/seo/evidence/2026-11-08-viral-article/reviewed-protected-pages.json';
const revisionPath = 'docs/seo/evidence/2026-11-08-pseo20/reviewed-protected-pages.json';
const priorRevisionRaw = fs.readFileSync(predecessorPath, 'utf8').replace(/\r\n/g, '\n');
const priorRevision = JSON.parse(priorRevisionRaw);
for (const url of PROTECTED_PATHS) if (url !== '/') {
  assert.deepEqual(rows.get(url).contract, priorRevision.pages.find((p: { pathname: string }) => p.pathname === url).contract);
}
const report = { checkedAt: new Date().toISOString(), predecessorCommit: prior.manifest.commit,
  beforeUrls: 330, afterUrls: 350, addedUrls: PSEO_PAGE_URLS, removedUrls: [], unchangedExistingContracts: 320,
  unchangedExistingMetadata: 330, changed: changes, homepageReversal: true, protectedNonHomeUnchanged: 9,
  originalDownloadFiles: PSEO_DOWNLOAD_URLS.length, originalExercises: PSEO_PRACTICE_PAGES.length * 12, validJsonLdBlocks: ldCount };
fs.writeFileSync(process.env.PSEO_REVIEW_OUT || 'reports/pseo20-20261108/artifact-review.json', JSON.stringify(report, null, 2) + '\n');
if (process.argv.includes('--write-reviewed-revision')) {
  assert.ok(!fs.existsSync(revisionPath), 'Never overwrite a reviewed baseline');
  fs.mkdirSync(path.dirname(revisionPath), { recursive: true });
  fs.writeFileSync(revisionPath, JSON.stringify({ schema: 1, capturedAt: report.checkedAt,
    previousRevision: predecessorPath, previousRevisionSha256: sha(priorRevisionRaw),
    source: 'Owner-authorized 20 useful Uzbek resources. Existing metadata retained on all 330 URLs. Only 20 exact homepage list entries added; removing them restores every predecessor contract field.',
    reviewedChanges: changes.filter(c => c.url === '/').map(c => ({ pathname: c.url, fields: c.fields, addedLinks: c.addedLinks })),
    invisibleToGate: ['Eight existing parent pages gain 21 relevant contextual links; UZ blog listing gains ten document cards. No previous link or URL removed.', 'Ten original downloadable templates and 120 authored exercises; local multiplication and linear-equation tools. No backend, bot, payment or model-call change.', 'Indexing, citations and ranking growth remain unmeasured.'],
    pages: PROTECTED_PATHS.map(u => rows.get(u)) }, null, 2) + '\n', { flag: 'wx' });
}
if (fs.existsSync(revisionPath)) {
  const revision = JSON.parse(fs.readFileSync(revisionPath, 'utf8'));
  for (const p of revision.pages) assert.deepEqual(p.contract, rows.get(p.pathname).contract, p.pathname + ': reviewed baseline');
}
console.log(JSON.stringify({ status: 'PASS', ...report, changed: changes.map(c => c.url) }));

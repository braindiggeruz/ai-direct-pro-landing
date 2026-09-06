import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { seoContract } from '../../../scripts/seo-protection.ts';

const root = process.cwd();
const dir = path.join(root, 'docs/seo/gptbot.uz-audit');
const origin = 'https://gptbot.uz';
const localFile = pathname => path.join(root, 'dist', pathname.slice(1), 'index.html');
const sha = value => createHash('sha256').update(value).digest('hex');
async function get(pathname) {
  const url = new URL(pathname, origin);
  assert.equal(url.origin, origin);
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'GPTBot-owner-release-verification/1.0', 'Cache-Control': 'no-cache' } });
  assert.equal(response.status, 200, `${url.href} HTTP ${response.status}`);
  return response;
}
const manifest = await (await get('/gptbot-release.json')).json();
assert.deepEqual(manifest, JSON.parse(fs.readFileSync(path.join(root, 'dist/gptbot-release.json'), 'utf8')));
const liveSitemap = await (await get('/sitemap.xml')).text();
const urls = [...liveSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const oldSitemap = JSON.parse(fs.readFileSync(path.join(dir, 'technical/sitemaps.json'), 'utf8')).find(row => row.url === origin + '/sitemap.xml');
assert.deepEqual([...urls].sort(), [...oldSitemap.urls].sort());
assert.equal(urls.length, 288);
const broken = new Set(JSON.parse(fs.readFileSync(path.join(dir, 'technical/broken-links.json'), 'utf8')).map(row => row.url));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/seo/evidence/2026-09-06/reviewed-protected-pages.json'), 'utf8'));
const assets = new Set(), pages = [];
for (let i = 0; i < urls.length; i += 5) {
  await Promise.all(urls.slice(i, i + 5).map(async url => {
    const pathname = new URL(url).pathname;
    const html = await (await get(pathname)).text();
    const contract = seoContract(html);
    assert.deepEqual(contract, seoContract(fs.readFileSync(localFile(pathname), 'utf8')), `Live contract differs from reviewed build: ${pathname}`);
    const protectedPage = baseline.pages.find(p => p.pathname === pathname);
    if (protectedPage) assert.deepEqual(contract, protectedPage.contract);
    for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) assert.ok(!broken.has(new URL(match[1], url).href), `Broken draft link remains on ${pathname}`);
    for (const match of html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="(\/assets\/[^"?#]+\.(?:css|js))"/g)) assets.add(match[1]);
    assert.ok(contract.title.length === 1 && contract.h1.length === 1);
    pages.push({ pathname, status: 200, matchesBuiltContract: true, protected: Boolean(protectedPage) });
  }));
  if (i + 5 < urls.length) await new Promise(resolve => setTimeout(resolve, 1000));
  if (i % 50 === 0) console.log(JSON.stringify({ checked: Math.min(i + 5, urls.length), total: urls.length }));
}
const checkedAssets = [];
for (const pathname of assets) {
  const response = await get(pathname);
  assert.ok(!response.headers.get('content-type')?.includes('text/html'), 'Asset returned HTML');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(sha(bytes), sha(fs.readFileSync(path.join(root, 'dist', pathname.slice(1)))), `Asset differs: ${pathname}`);
  checkedAssets.push({ pathname, status: 200, sha256: sha(bytes) });
}
const admin = await get('/admin/');
assert.ok((await admin.text()).includes('<div id="root">'));
const auth = await get('/api/auth/config');
assert.match(auth.headers.get('content-type') ?? '', /json/);
const evidence = {
  verifiedAt: new Date().toISOString(), runtimeCommit: manifest.commit, artifactSha256: manifest.artifactSha256,
  manifestMatchesBuild: true, fileCount: manifest.fileCount, sitemapUrlSetUnchanged: true,
  pagesChecked: pages.length, protectedContractsPassed: pages.filter(p => p.protected).length,
  brokenDraftTargetsAbsent: broken.size, assets: checkedAssets, adminHttp200: true, authConfigHttp200: true,
  scope: 'Raw live HTML contracts and asset bytes, concurrency five. This does not replace interactive browser acceptance or payment tests.',
  pages: pages.sort((a, b) => a.pathname.localeCompare(b.pathname)),
};
fs.writeFileSync(path.join(root, 'docs/readiness/2026-09-06/live-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ ...evidence, pages: undefined, assets: checkedAssets.length }));

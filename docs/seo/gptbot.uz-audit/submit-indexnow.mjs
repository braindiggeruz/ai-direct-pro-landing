import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { seoContract } from '../../../scripts/seo-protection.ts';

const root = process.cwd(), dir = path.join(root, 'docs/seo/gptbot.uz-audit');
const origin = 'https://gptbot.uz';
const prior = JSON.parse(fs.readFileSync(path.join(dir, 'technical/pages.json'), 'utf8'));
const sitemapUrls = new Set([...fs.readFileSync(path.join(root, 'dist/sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
const text = s => s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const changed = [];
for (const old of prior) {
  const pathname = new URL(old.url).pathname;
  const html = fs.readFileSync(path.join(root, 'dist', pathname.slice(1), 'index.html'), 'utf8');
  const current = seoContract(html), reasons = [];
  for (const field of ['title', 'h1', 'description', 'canonical']) if (JSON.stringify(old[field]) !== JSON.stringify(current[field])) reasons.push(field);
  const length = text(html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').length;
  if (length !== old.textLength) reasons.push('rendered content changed');
  if (['/ru/gpt-chat/', '/uz/gpt-uzbek-tilida/'].includes(pathname)) reasons.push('chat functionality updated');
  if (!reasons.length) continue;
  assert.ok(sitemapUrls.has(old.url));
  assert.deepEqual(current.canonical, [old.url]);
  assert.ok(!current.robots.some(r => /noindex/i.test(r)));
  changed.push({ url: old.url, reasons });
}
assert.ok(changed.length > 0 && changed.length < 100, 'Review unexpected submission scope');
const scope = { preparedAt: new Date().toISOString(), source: 'Published release compared with retained pre-release crawl; content/metadata changes and two updated chat routes. Cosmetic header-only changes excluded.', count: changed.length, changed };
fs.writeFileSync(path.join(dir, 'indexnow-scope.json'), JSON.stringify(scope, null, 2) + '\n');
console.log(JSON.stringify({ prepared: changed.length, urls: changed.map(r => r.url) }));
if (!process.argv.includes('--submit')) process.exit(0);
const receiptFile = path.join(dir, 'indexnow-receipt.json');
assert.ok(!fs.existsSync(receiptFile), 'Receipt exists; inspect it before repeating submission');
const release = await (await fetch(origin + '/gptbot-release.json', {signal: AbortSignal.timeout(20000)})).json();
const verified = JSON.parse(fs.readFileSync(path.join(dir, 'live-verification.json'), 'utf8'));
assert.equal(release.commit, verified.runtimeCommit);
assert.equal(release.artifactSha256, verified.artifactSha256);
const keyResponse = await fetch(origin + '/api/indexnow/key', {signal: AbortSignal.timeout(20000)});
assert.equal(keyResponse.status, 200);
const key = (await keyResponse.text()).trim();
assert.ok(/^[A-Za-z0-9-]{8,128}$/.test(key), 'Invalid key format');
const keyLocation = origin + '/' + key + '.txt';
const keyFile = await fetch(keyLocation, {signal: AbortSignal.timeout(20000)});
assert.equal(keyFile.status, 200, 'Public root key file unavailable');
assert.equal((await keyFile.text()).trim(), key, 'Published root key differs');
for (let i = 0; i < changed.length; i += 5) {
  await Promise.all(changed.slice(i, i + 5).map(async ({url}) => {
    const response = await fetch(url, {redirect: 'manual', signal: AbortSignal.timeout(20000)});
    assert.equal(response.status, 200, 'Changed page is not HTTP 200');
    assert.ok(!/noindex/i.test(response.headers.get('x-robots-tag') || ''));
    const contract = seoContract(await response.text());
    assert.deepEqual(contract.canonical, [url]);
    assert.ok(!contract.robots.some(r => /noindex/i.test(r)));
  }));
}
const endpoint = 'https://api.indexnow.org/IndexNow';
const submittedAt = new Date().toISOString();
// Save the attempted scope first; uncertain network outcomes must not trigger blind retries.
fs.writeFileSync(receiptFile, JSON.stringify({ submittedAt, endpoint, urlCount: changed.length, urls: changed.map(r => r.url), state: 'request_started', runtimeCommit: release.commit }, null, 2) + '\n', {flag: 'wx'});
const response = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json; charset=utf-8'}, body: JSON.stringify({host: 'gptbot.uz', key, keyLocation, urlList: changed.map(r => r.url)}), signal: AbortSignal.timeout(30000)});
const body = (await response.text()).split(key).join('[redacted]');
const receipt = { submittedAt, endpoint, runtimeCommit: release.commit, urlCount: changed.length, urls: changed.map(r => r.url), httpStatus: response.status, state: response.status === 200 ? 'received' : response.status === 202 ? 'received_key_validation_pending' : 'rejected', keyFileVerified: true, responseExcerpt: body.slice(0,500), indexingConfirmed: false };
fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({...receipt, urls: undefined}));
assert.ok([200,202].includes(response.status), 'IndexNow did not accept the batch');

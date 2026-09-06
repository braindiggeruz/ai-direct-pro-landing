import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { seoContract } from '../../../scripts/seo-protection.ts';

const root = process.cwd();
const dir = path.join(root, 'docs/seo/gptbot.uz-audit');
const originalFile = 'docs/seo/evidence/2026-09-06/protected-pages.json';
const reviewedFile = 'docs/seo/evidence/2026-09-06/reviewed-protected-pages.json';
const original = JSON.parse(fs.readFileSync(path.join(root, originalFile), 'utf8'));
const allowed = new Map([
  ['/ru/blog/chatgpt-i-claude-v-uzbekistane/', 'Add same-language chat entry and correct verified provider/payment facts; retain search metadata and section order. Exact changes and official sources: findings/commercial.md'],
  ['/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/', 'Add independent Russian chat entry and correct CTA language; official payment guide remains intact'],
  ['/uz/blog/ai-chat-nima-va-qanday-turlari-bor/', 'Remove one related card leading to an unpublished article (verified HTTP 404)'],
]);
const normalize = s => s.replace(/\s+/g, ' ').trim();
const bodyText = html => normalize(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]?.replace(/<[^>]*>/g, ' ') ?? '');
const article = html => normalize((html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? '')
  .replace(/<aside\b[^>]*data-testid="article-chat-entry"[\s\S]*?<\/aside>/g, ''));
const pages = [], changes = [];
for (const page of original.pages) {
  const html = fs.readFileSync(path.join(root, 'dist', page.pathname.slice(1), 'index.html'), 'utf8');
  const contract = seoContract(html);
  const fields = Object.keys(contract).filter(key => JSON.stringify(contract[key]) !== JSON.stringify(page.contract[key]));
  if (allowed.has(page.pathname)) {
    assert.deepEqual(fields.sort(), ['bodyTextSha256', 'internalLinks']);
    const response = await fetch(`https://gptbot.uz${page.pathname}`, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200);
    const live = await response.text();
    assert.deepEqual(seoContract(live), page.contract, 'Production moved since the original snapshot; review again');
    assert.ok(article(live));
    const factualCorrection = page.pathname === '/ru/blog/chatgpt-i-claude-v-uzbekistane/';
    if (!factualCorrection) assert.equal(article(html), article(live), 'Original article content changed');
    else {
      const headings = value => [...value.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => normalize(m[1].replace(/<[^>]*>/g, '')));
      const oldHeadings = headings(article(live));
      const newHeadings = headings(article(html));
      const replacements = new Map([
        ['Регистрация: 2 минуты, номер +998 подходит', 'Регистрация: способы входа и проверка аккаунта'],
        ['Тарифы 2026 в сумах: полная таблица', 'Тарифы 2026: как проверить цену и сумму в сумах'],
      ]);
      assert.deepEqual(newHeadings, oldHeadings.map(h => replacements.get(h) ?? h), 'Unreviewed heading change');
      assert.ok(html.includes('https://help.openai.com/en/articles/10471989-openai-account-sharing-policy'));
    }
    changes.push({ path: page.pathname, fields, reason: allowed.get(page.pathname), originalArticleBodyIdentical: article(html) === article(live), factualCorrection });
  } else assert.deepEqual(contract, page.contract, `Unexpected protected change: ${page.pathname}`);
  pages.push({ pathname: page.pathname, contract, bodyText: bodyText(html) });
}
const sitemap = fs.readFileSync(path.join(root, 'dist/sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
assert.equal(urls.length, 288);
const unavailable = new Set(JSON.parse(fs.readFileSync(path.join(dir, 'technical/broken-links.json'), 'utf8')).map(row => row.url));
let articlesChecked = 0;
for (const url of urls) {
  const html = fs.readFileSync(path.join(root, 'dist', new URL(url).pathname.slice(1), 'index.html'), 'utf8');
  const contract = seoContract(html);
  assert.deepEqual(contract.canonical, [url], `Canonical changed destination: ${url}`);
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    assert.ok(!unavailable.has(new URL(match[1], url).href), `Draft link remains: ${url} -> ${match[1]}`);
  }
  if (url.includes('/blog/') && !url.endsWith('/blog/')) articlesChecked++;
}
const redirects = [];
for (const pathname of ['/ru/internet-reklama-tashkent', '/ru/blog/chto-takoe-seo-prodvizhenie', '/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente']) {
  const chain = []; let url = `https://gptbot.uz${pathname}`;
  for (let i=0;i<4;i++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    chain.push({ url, status: response.status, location: response.headers.get('location') });
    if (response.status === 200) break;
    assert.ok([301,302,307,308].includes(response.status));
    url = new URL(response.headers.get('location'), url).href;
  }
  assert.equal(chain.at(-1).status, 200); redirects.push(chain);
}
const evidence = { verifiedAt: new Date().toISOString(), protectedPages: 10, unchangedProtectedPages: 7, reviewedChanges: changes, sitemapUrls: urls.length, articlesChecked, brokenTargetsAbsentFromAllPages: unavailable.size, allCanonicalsAbsoluteAndSelf: true, gscRedirectErrorsNowResolve: redirects };
fs.writeFileSync(path.join(dir, 'candidate-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
if (process.argv.includes('--record-reviewed-baseline') || process.argv.includes('--revise-reviewed-candidate')) {
  // Explicit revision is only for this uncommitted candidate; original live evidence is never overwritten.
  if (process.argv.includes('--revise-reviewed-candidate')) {
    const existing = JSON.parse(fs.readFileSync(path.join(root, reviewedFile), 'utf8'));
    assert.equal(existing.source, 'Reviewed local build; not a new live capture');
    assert.equal(existing.originalEvidence, originalFile);
  }
  fs.writeFileSync(path.join(root, reviewedFile), JSON.stringify({ schema: 1, capturedAt: evidence.verifiedAt, source: 'Reviewed local build; not a new live capture', originalEvidence: originalFile, reviewedChanges: changes, pages }, null, 2) + '\n', { flag: process.argv.includes('--revise-reviewed-candidate') ? 'w' : 'wx' });
}
console.log(JSON.stringify({ ...evidence, gscRedirectErrorsNowResolve: redirects.map(chain => chain.map(row => row.status)) }));

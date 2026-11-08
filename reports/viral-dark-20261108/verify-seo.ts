import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { seoContract, assertSeoProtection } from '../../scripts/seo-protection';

const artifact = 'C:/Users/Borinio/.codex/visualizations/2026/11/08/01a1b921-58ac-72f3-af9a-3684d2e788b4/gptbot-viral-dark-20261108';
const before = JSON.parse(fs.readFileSync(path.join(artifact, 'before-contracts.json'), 'utf8')) as {
  pages: { url: string; contract: ReturnType<typeof seoContract>; htmlSha256: string }[];
};
const expectedLinks: Record<string, string> = {
  '/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/': '/ru/ai-bot-dlya-uchebnogo-tsentra/',
  '/ru/blog/ai-bot-dlya-uchebnogo-tsentra-rukovodstvo/': '/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/',
  '/ru/ai-bot-dlya-uchebnogo-tsentra/': '/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/',
};
const urls = [...fs.readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
assert.deepEqual([...urls].sort(), before.pages.map(page => page.url).sort(), 'No URL additions/removals/replacements');
assert.equal(urls.length, 330);
const changed = [];
let unchanged = 0;
for (const old of before.pages) {
  const html = fs.readFileSync(path.join('dist', old.url, 'index.html'), 'utf8');
  const actual = seoContract(html);
  const fields = (Object.keys(actual) as (keyof typeof actual)[]).filter(key => JSON.stringify(actual[key]) !== JSON.stringify(old.contract[key]));
  if (expectedLinks[old.url]) {
    assert.deepEqual(fields.sort(), ['bodyTextSha256', 'internalLinks']);
    const added = actual.internalLinks.filter(link => !old.contract.internalLinks.includes(link));
    const removed = old.contract.internalLinks.filter(link => !actual.internalLinks.includes(link));
    assert.deepEqual(added, [expectedLinks[old.url]]);
    assert.deepEqual(removed, []);
    changed.push({ url: old.url, fields, added, removed });
  } else {
    assert.deepEqual(actual, old.contract, `SEO changed unexpectedly: ${old.url}`);
    assert.equal(createHash('sha256').update(html).digest('hex'), old.htmlSha256, `HTML changed unexpectedly: ${old.url}`);
    unchanged++;
  }
}
assertSeoProtection('dist');
const report = { checkedAt: new Date().toISOString(), urls: 330, unchangedHtmlAndSeo: unchanged, changed,
  titlesDescriptionsH1CanonicalRobotsHreflang: 'unchanged on all 330 URLs', protectedPages: 10 };
fs.writeFileSync('reports/viral-dark-20261108/seo-review.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));

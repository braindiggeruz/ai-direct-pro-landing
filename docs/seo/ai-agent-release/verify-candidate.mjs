import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROTECTED_PATHS, seoContract } from '../../../scripts/seo-protection.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PREVIOUS = 'docs/seo/evidence/2026-09-06/reviewed-protected-pages.json';
const NEXT = 'docs/seo/evidence/2026-09-14/reviewed-protected-pages.json';
const EVIDENCE = 'docs/seo/ai-agent-release/candidate-verification.json';
const ARTICLE_PATH = '/ru/blog/ai-agent-ili-chat-bot/';
const normalize = (value) => value.replace(/\s+/g, ' ').trim();

function bodyText(html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const body = clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
  return normalize(body.replace(/<[^>]*>/g, ' '));
}

function singleInsertion(previous, current) {
  let prefix = 0;
  while (prefix < previous.length && previous[prefix] === current[prefix]) prefix++;
  let suffix = 0;
  while (suffix < previous.length - prefix
    && previous[previous.length - 1 - suffix] === current[current.length - 1 - suffix]) suffix++;
  assert.equal(prefix + suffix, previous.length, 'Homepage body changed outside one contiguous insertion');
  return current.slice(prefix, current.length - suffix).trim();
}

const previous = JSON.parse(fs.readFileSync(path.join(ROOT, PREVIOUS), 'utf8'));
assert.equal(previous.schema, 1);
assert.deepEqual(previous.pages.map((page) => page.pathname), [...PROTECTED_PATHS]);

const liveChecks = await Promise.all(previous.pages.map(async (page) => {
  const response = await fetch(`https://gptbot.uz${page.pathname}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `Live protected page is unhealthy: ${page.pathname}`);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
  const contract = seoContract(await response.text());
  assert.deepEqual(contract, page.contract, `Live protected contract drifted: ${page.pathname}`);
  return { pathname: page.pathname, status: response.status, unchanged: true };
}));

const pages = [];
let rootChange;
for (const page of previous.pages) {
  const html = fs.readFileSync(path.join(ROOT, 'dist', page.pathname.slice(1), 'index.html'), 'utf8');
  const contract = seoContract(html);
  const nextBodyText = bodyText(html);
  const fields = Object.keys(contract)
    .filter((key) => JSON.stringify(contract[key]) !== JSON.stringify(page.contract[key]))
    .sort();
  if (page.pathname === '/') {
    assert.deepEqual(fields, ['bodyTextSha256', 'internalLinks']);
    const addedInternalLinks = contract.internalLinks.filter((link) => !page.contract.internalLinks.includes(link));
    const removedInternalLinks = page.contract.internalLinks.filter((link) => !contract.internalLinks.includes(link));
    assert.deepEqual(addedInternalLinks, [ARTICLE_PATH]);
    assert.deepEqual(removedInternalLinks, []);
    const insertedBodyText = singleInsertion(page.bodyText, nextBodyText);
    assert.match(insertedBodyText, /AI-агент или чат-бот/i);
    rootChange = { fields, addedInternalLinks, removedInternalLinks, insertedBodyText };
  } else {
    assert.deepEqual(fields, [], `Unexpected protected change: ${page.pathname}`);
    assert.equal(nextBodyText, page.bodyText, `Protected body text changed: ${page.pathname}`);
  }
  pages.push({ pathname: page.pathname, contract, bodyText: nextBodyText });
}

assert.ok(rootChange);
const articleFile = path.join(ROOT, 'dist', ARTICLE_PATH.slice(1), 'index.html');
assert.ok(fs.existsSync(articleFile), 'Prerendered article is missing');
const articleHtml = fs.readFileSync(articleFile, 'utf8');
const articleContract = seoContract(articleHtml);
assert.deepEqual(articleContract.canonical, [`https://gptbot.uz${ARTICLE_PATH}`]);
assert.deepEqual(articleContract.h1, ['AI-агент или чат-бот: что выбрать бизнесу в Узбекистане']);
assert.match(articleHtml, /<script type="application\/ld\+json">/);
assert.match(articleHtml, /FAQPage/);
assert.match(articleHtml, /ai-agent-ili-chat-bot-1200\.webp/);

const verifiedAt = new Date().toISOString();
const candidateCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const newReview = {
  path: '/',
  fields: rootChange.fields,
  reason: 'Publish one reviewed AI-agent comparison article and expose its canonical URL through the existing homepage blog link shell; no title, H1, description, canonical, robots or hreflang change.',
  addedInternalLinks: rootChange.addedInternalLinks,
  removedInternalLinks: rootChange.removedInternalLinks,
  insertedBodyText: rootChange.insertedBodyText,
};
const baseline = {
  schema: 1,
  capturedAt: verifiedAt,
  source: 'Reviewed local build; not a new live capture',
  originalEvidence: PREVIOUS,
  reviewedChanges: [...(previous.reviewedChanges ?? []), newReview],
  pages,
};
const evidence = {
  verifiedAt,
  candidateCommit,
  previousBaseline: PREVIOUS,
  nextBaseline: NEXT,
  liveProtectedPagesUnchanged: liveChecks.length,
  candidateProtectedPages: pages.length,
  reviewedChange: newReview,
  article: {
    pathname: ARTICLE_PATH,
    canonical: articleContract.canonical[0],
    h1: articleContract.h1[0],
    articleSchema: /\"@type\":\"Article\"/.test(articleHtml),
    faqSchema: /FAQPage/.test(articleHtml),
    heroImage: '/assets/blog/ai-agent-ili-chat-bot-1200.webp',
  },
};

if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(path.join(ROOT, NEXT)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, NEXT), `${JSON.stringify(baseline, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(ROOT, EVIDENCE), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
}

console.log(JSON.stringify(evidence, null, 2));

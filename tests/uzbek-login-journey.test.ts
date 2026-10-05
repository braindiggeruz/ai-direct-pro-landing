import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BASELINE, PROTECTED_PATHS } from '../scripts/seo-protection';

const ROOT = process.cwd();
const LOGIN = '/uz/blog/chatgptga-qanday-kirish-mumkin/';
const GUIDE = '/uz/gpt-chat-qollanma/';
const PREVIOUS = 'docs/seo/evidence/2026-10-01-paid-chat-honesty/reviewed-protected-pages.json';
const NEXT = 'docs/seo/evidence/2026-10-03-uzbek-login/reviewed-protected-pages.json';
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const hasBuild = fs.existsSync(path.join(ROOT, 'dist/.vite/manifest.json'));

test('the login instruction exposes the official route before its independent chat alternative', {
  skip: !hasBuild && 'run the public build first',
}, () => {
  const html = read(`dist${LOGIN}index.html`);
  const body = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1];
  assert.ok(body, 'the instruction must be part of the visible article');
  const official = body.indexOf('href="https://chatgpt.com/"');
  const alternative = body.indexOf('data-chat-entry=');
  assert.ok(official >= 0, 'keep the actionable official ChatGPT link');
  assert.ok(alternative >= 0, 'keep the separately identified GPTBot alternative');
  assert.ok(official < alternative, 'answer the official login task before offering another product');
  assert.equal((body.match(/href="https:\/\/chatgpt\.com\/"/g) || []).length, 1);
  assert.match(body, /href="https:\/\/status\.openai\.com\/?"/);
});

test('the login instruction and independent chat guide provide a reciprocal learning path', {
  skip: !hasBuild && 'run the public build first',
}, () => {
  const login = read(`dist${LOGIN}index.html`);
  const guide = read(`dist${GUIDE}index.html`);
  assert.ok(login.includes(`href="${GUIDE}"`));
  assert.ok(guide.includes(`href="${LOGIN}"`));
  assert.match(guide, /GPTBot\.uz/);
  assert.doesNotMatch(guide, /data-testid="sticky-call-cta"/);
});

test('the Uzbek login revision changes one protected body while keeping all search metadata and nine peers', () => {
  // Since release R-S1 (2026-10-05) the gate compares builds with the R-S1
  // revision, which names this one as its predecessor; this one stays a record.
  assert.ok(BASELINE === NEXT || JSON.parse(read(BASELINE)).previousRevision === NEXT, 'the current revision follows the reviewed login correction');
  const previous = JSON.parse(read(PREVIOUS));
  const current = JSON.parse(read(NEXT));
  assert.equal(current.previousRevision, PREVIOUS);
  assert.deepEqual(current.pages.map((p: { pathname: string }) => p.pathname), [...PROTECTED_PATHS]);
  const changed: string[] = [];
  for (const page of current.pages) {
    const before = previous.pages.find((p: { pathname: string }) => p.pathname === page.pathname);
    assert.ok(before);
    if (JSON.stringify(before.contract) === JSON.stringify(page.contract)) continue;
    changed.push(page.pathname);
    for (const field of Object.keys(before.contract)) {
      if (field === 'bodyTextSha256' || field === 'internalLinks') continue;
      assert.deepEqual(page.contract[field], before.contract[field], `${page.pathname}: keep ${field}`);
    }
  }
  assert.deepEqual(changed, [LOGIN]);
  assert.deepEqual(current.reviewedChanges.map((c: { pathname: string; fields: string[] }) => ({
    pathname: c.pathname, fields: [...c.fields].sort(),
  })), [{ pathname: LOGIN, fields: ['bodyTextSha256', 'internalLinks'] }]);
});

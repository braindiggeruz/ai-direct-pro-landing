// Regression guard for the gpt-chat prerender branch.
//
// `pageType: 'gpt-chat'` renders a full-viewport chat app plus a compact,
// VISIBLE summary section — it deliberately does not call renderInternalLinks().
// For a long time that meant `internalLinks` authored in the page JSON was
// silently dropped from the prerendered HTML: /uz/gpt-uzbek-tilida/ declared 14
// and 7 never reached the markup, /ru/gpt-chat/ declared 8 and lost 2. The audit
// graph still counted them, so nothing failed and the pages kept their
// not-an-orphan status while the links did not exist for a crawler.
//
// These tests fail if that ever regresses, and they fail without needing a build.
//
// Run: node --import tsx --test tests/gpt-chat-prerender-links.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { gptChatNavLinks } from '../scripts/gpt-chat-nav';
import type { Page } from '../src/shared/types';

const ROOT = process.cwd();

function gptChatPages(): { file: string; page: Page }[] {
  const out: { file: string; page: Page }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        const page = JSON.parse(fs.readFileSync(full, 'utf8')) as Page;
        if (page.pageType === 'gpt-chat') out.push({ file: full, page });
      }
    }
  };
  walk(path.join(ROOT, 'content', 'pages'));
  return out;
}

const PAGES = gptChatPages();

test('there is at least one gpt-chat page to guard', () => {
  assert.ok(PAGES.length > 0, 'no pageType=gpt-chat pages found — has the page type been renamed?');
});

test('every declared internalLink on a gpt-chat page reaches the rendered nav or the body prose', () => {
  for (const { file, page } of PAGES) {
    const nav = new Set(gptChatNavLinks(page).map((l) => l.href));
    const body = new Set<string>();
    for (const block of page.bodyBlocks || []) {
      for (const l of block.links || []) if (l.target) body.add(l.target);
      if (block.href) body.add(block.href);
    }
    const dropped = (page.internalLinks || [])
      .map((l) => l.target)
      .filter((t) => t && !nav.has(t) && !body.has(t));
    assert.deepEqual(
      dropped,
      [],
      `${file} declares internalLinks that the gpt-chat renderer would drop: ${dropped.join(', ')}`,
    );
  }
});

test('the gpt-chat summary nav carries no duplicate href', () => {
  for (const { file, page } of PAGES) {
    const hrefs = gptChatNavLinks(page).map((l) => l.href);
    const dupes = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
    assert.deepEqual(dupes, [], `${file} would render a duplicated nav href: ${dupes.join(', ')}`);
  }
});

test('every gpt-chat nav link has visible anchor text', () => {
  for (const { file, page } of PAGES) {
    for (const l of gptChatNavLinks(page)) {
      assert.ok(l.text && l.text.trim().length > 1, `${file} would render an empty nav anchor for ${l.href}`);
      assert.ok(l.href.startsWith('/'), `${file} nav href is not root-relative: ${l.href}`);
    }
  }
});

// ── Rendered-output assertions, only when a build is present ─────────────────
// Skipped rather than failed on a clean checkout so the suite stays runnable
// without `npm run build:fast`.
const built = PAGES
  .map(({ page }) => ({ url: page.url, file: path.join(ROOT, 'dist', page.url.replace(/^\/|\/$/g, ''), 'index.html'), page }))
  .filter((c) => fs.existsSync(c.file));

test('prerendered gpt-chat HTML contains every declared internal link', { skip: built.length === 0 && 'no dist/ build present' }, () => {
  for (const { file, page, url } of built) {
    const html = fs.readFileSync(file, 'utf8');
    const missing = (page.internalLinks || [])
      .map((l) => l.target)
      .filter((t) => t && !html.includes(`href="${t}"`));
    assert.deepEqual(missing, [], `${url} prerendered without declared links: ${missing.join(', ')}`);
  }
});

test('prerendered gpt-chat HTML stays structurally valid', { skip: built.length === 0 && 'no dist/ build present' }, () => {
  for (const { file, url } of built) {
    const html = fs.readFileSync(file, 'utf8');
    assert.equal((html.match(/<h1/g) || []).length, 1, `${url} must render exactly one <h1>`);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, `${url} must render exactly one canonical`);
    assert.equal((html.match(/<main/g) || []).length, 1, `${url} must render exactly one <main>`);
    assert.equal((html.match(/<nav aria-label/g) || []).length, 1, `${url} must render exactly one summary nav`);
    assert.ok(!/name="robots"[^>]*noindex/.test(html), `${url} must not be noindex`);
    assert.ok(html.includes('data-testid="seo-summary"'), `${url} lost its indexable summary section`);
  }
});

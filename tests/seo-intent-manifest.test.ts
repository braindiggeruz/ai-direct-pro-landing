// The intent manifest is what stops two pages drifting back onto the same head
// terms. It is only useful if the URLs it names still exist and the keywords it
// forbids are actually absent from the page that must not target them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { BlogArticle, Page } from '../src/shared/types';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');

type Side = { url: string; owns: string; mustNotTarget: string[] };
type Pair = { id: string; commercial: Side; informational: Side; decision: string };

const manifest: { pairs: Pair[] } = JSON.parse(
  fs.readFileSync(path.join(CONTENT, 'seo', 'intent-manifest.json'), 'utf8'),
);

function readAll<T>(dir: string): T[] {
  const out: T[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) out.push(JSON.parse(fs.readFileSync(full, 'utf8')) as T);
    }
  };
  walk(dir);
  return out;
}

const byUrl = new Map<string, Page | BlogArticle>();
for (const doc of [
  ...readAll<Page>(path.join(CONTENT, 'pages')),
  ...readAll<BlogArticle>(path.join(CONTENT, 'blog')),
]) {
  byUrl.set(doc.url, doc);
}

/** Every keyword field a document can declare, lowercased. */
function declaredKeywords(doc: Page | BlogArticle): string[] {
  const page = doc as Page;
  const article = doc as BlogArticle;
  return [
    page.primaryKeyword,
    ...(page.secondaryKeywords || []),
    ...(article.keywords || []),
  ]
    .filter((k): k is string => typeof k === 'string')
    .map((k) => k.toLowerCase());
}

test('every URL named in the intent manifest exists', () => {
  for (const pair of manifest.pairs) {
    for (const side of [pair.commercial, pair.informational]) {
      assert.ok(byUrl.has(side.url), `${pair.id}: ${side.url} is not in content/`);
    }
  }
});

test('no page declares a keyword the manifest reserves for its counterpart', () => {
  for (const pair of manifest.pairs) {
    for (const side of [pair.commercial, pair.informational]) {
      const doc = byUrl.get(side.url);
      if (!doc) continue;
      const declared = declaredKeywords(doc);
      for (const forbidden of side.mustNotTarget) {
        assert.ok(
          !declared.includes(forbidden.toLowerCase()),
          `${pair.id}: ${side.url} declares "${forbidden}", which the manifest reserves for its counterpart`,
        );
      }
    }
  }
});

test('the two sides of a pair do not share a declared keyword', () => {
  for (const pair of manifest.pairs) {
    const a = byUrl.get(pair.commercial.url);
    const b = byUrl.get(pair.informational.url);
    if (!a || !b) continue;
    const shared = declaredKeywords(a).filter((k) => declaredKeywords(b).includes(k));
    assert.deepEqual(shared, [], `${pair.id}: both sides declare ${shared.join(', ')}`);
  }
});

test('both sides of a pair are still separately indexable', () => {
  for (const pair of manifest.pairs) {
    for (const side of [pair.commercial, pair.informational]) {
      const doc = byUrl.get(side.url);
      if (!doc) continue;
      assert.equal(doc.status, 'published', `${pair.id}: ${side.url} is not published`);
      assert.notEqual(doc.robotsIndex, false, `${pair.id}: ${side.url} is noindex`);
    }
  }
});

test('the informational side links to its commercial counterpart', () => {
  for (const pair of manifest.pairs) {
    if (pair.decision === 'KEEP_DIFFERENT_INTENT' && pair.id === 'C6-uz-gpt-guide') continue;
    const doc = byUrl.get(pair.informational.url);
    if (!doc) continue;
    const targets = new Set<string>();
    for (const link of doc.internalLinks || []) if (link?.target) targets.add(link.target);
    const blocks = (doc as Page).bodyBlocks || (doc as BlogArticle).body || [];
    for (const block of blocks) for (const link of block?.links || []) if (link?.target) targets.add(link.target);
    assert.ok(
      targets.has(pair.commercial.url),
      `${pair.id}: ${pair.informational.url} does not link to ${pair.commercial.url}`,
    );
  }
});

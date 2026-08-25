// Build-wide integrity gate for every published, indexable document.
//
// The existing SEO gates each guard one narrow surface: seo-cluster-quality
// only looks at URLs named in a cluster, seo-intent-manifest only at declared
// pairs, seo-link-graph only at the link graph. Nothing walked ALL 255
// published documents and asserted the invariants that make a page renderable
// as valid HTML. This file does.
//
// Two of the rules carry an explicit, dated baseline instead of failing on
// contact with existing debt. That debt is real and recorded here on purpose:
// a gate that is switched off is invisible, a gate with a named baseline
// blocks every NEW occurrence and keeps the count honest. Neither baseline may
// grow — the assertions below fail if it does.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { BlogArticle, BodyBlock, Page } from '../src/shared/types';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');

type Doc = (Page | BlogArticle) & { __file: string };

function readAll(dir: string): Doc[] {
  const out: Doc[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        const doc = JSON.parse(fs.readFileSync(full, 'utf8')) as Doc;
        doc.__file = path.relative(ROOT, full).replace(/\\/g, '/');
        out.push(doc);
      }
    }
  };
  walk(dir);
  return out;
}

const all: Doc[] = [
  ...readAll(path.join(CONTENT, 'pages')),
  ...readAll(path.join(CONTENT, 'blog')),
];

/** What actually ships to Google: published and not excluded from the index. */
const indexable = all.filter((d) => d.status === 'published' && d.robotsIndex !== false);

function blocksOf(doc: Doc): BodyBlock[] {
  return ((doc as Page).bodyBlocks || (doc as BlogArticle).body || []) as BodyBlock[];
}

test('the corpus this gate walks is the whole published site, not a sample', () => {
  // A guard against the gate quietly narrowing: if a future refactor moves
  // content out of content/pages or content/blog, this number collapses and
  // every assertion below would pass vacuously.
  assert.ok(indexable.length >= 250, `only ${indexable.length} indexable documents found`);
});

test('every indexable document has exactly one H1', () => {
  for (const doc of indexable) {
    const inBody = blocksOf(doc).filter((b) => (b.type as string) === 'h1').length;
    const fromField = (doc.h1 || '').trim() ? 1 : 0;
    assert.equal(
      fromField + inBody,
      1,
      `${doc.url}: ${fromField + inBody} H1s (h1 field: ${fromField}, body blocks: ${inBody})`,
    );
  }
});

test('every indexable document has a non-empty title and description', () => {
  for (const doc of indexable) {
    assert.ok((doc.title || '').trim().length > 0, `${doc.url} has no title`);
    assert.ok((doc.description || '').trim().length > 0, `${doc.url} has no description`);
  }
});

test('no heading renders empty', () => {
  for (const doc of indexable) {
    for (const b of blocksOf(doc)) {
      if (b.type === 'h2' || b.type === 'h3') {
        assert.ok((b.text || '').trim().length > 0, `${doc.url} has an empty ${b.type}`);
      }
    }
  }
});

// Duplicate H2 text inside one page. scripts/prerender.ts de-duplicates the
// anchor ids (-2, -3…) so the DOM stays valid, but two identical headings still
// read as a content defect and split the section a reader is looking for.
const KNOWN_DUPLICATE_H2 = new Set([
  '/ru/avtomatizatsiya-prodazh/',
  '/ru/avtomatizatsiya-zayavok/',
  '/uz/arizalarni-avtomatlashtirish/',
  '/uz/arizalarni-qabul-qiluvchi-bot/',
  '/uz/savdoni-avtomatlashtirish/',
]);

test('no indexable document repeats an H2, outside the recorded baseline', () => {
  const found: string[] = [];
  for (const doc of indexable) {
    const seen = new Set<string>();
    for (const b of blocksOf(doc)) {
      if (b.type !== 'h2') continue;
      const key = (b.text || '').trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        found.push(doc.url);
        break;
      }
      seen.add(key);
    }
  }
  const fresh = found.filter((u) => !KNOWN_DUPLICATE_H2.has(u));
  assert.deepEqual(fresh, [], `new duplicate H2 introduced on: ${fresh.join(', ')}`);
  assert.ok(
    found.length <= KNOWN_DUPLICATE_H2.size,
    `the duplicate-H2 baseline grew from ${KNOWN_DUPLICATE_H2.size} to ${found.length}`,
  );
});

test('every indexable document is canonical to its own URL', () => {
  for (const doc of indexable) {
    const canonical = doc.canonical || '';
    assert.ok(canonical.length > 0, `${doc.url} has no canonical`);
    assert.ok(
      canonical.endsWith(doc.url),
      `${doc.url} points its canonical at ${canonical}`,
    );
  }
});

test('no two indexable documents claim the same canonical', () => {
  const owner = new Map<string, string>();
  for (const doc of indexable) {
    const canonical = doc.canonical || '';
    const previous = owner.get(canonical);
    assert.equal(previous, undefined, `${doc.url} and ${previous} share canonical ${canonical}`);
    owner.set(canonical, doc.url);
  }
});

test('every image carries an alt attribute, even an empty decorative one', () => {
  for (const doc of indexable) {
    for (const b of blocksOf(doc)) {
      if (b.type !== 'image' && b.type !== 'figure') continue;
      assert.equal(
        typeof (b as { alt?: unknown }).alt,
        'string',
        `${doc.url} renders ${(b as { src?: string }).src} with no alt attribute`,
      );
    }
  }
});

// scripts/prerender.ts emits <link rel="alternate"> only when BOTH sides of a
// pair exist, because a one-member alternate set annotates nothing. This test
// guards the content side of that contract: a declared counterpart must exist,
// must be indexable, and must point back.
test('a declared hreflang counterpart exists, is indexable and is reciprocal', () => {
  const byUrl = new Map(all.map((d) => [d.url, d]));
  for (const doc of indexable) {
    const ru = doc.hreflangRu;
    const uz = doc.hreflangUz;
    if (!ru || !uz) continue; // single-locale page: valid, and emits no annotation
    const self = doc.locale === 'ru' ? ru : uz;
    const other = doc.locale === 'ru' ? uz : ru;
    assert.equal(self, doc.url, `${doc.url} declares its own hreflang side as ${self}`);
    const counterpart = byUrl.get(other);
    assert.ok(counterpart, `${doc.url} declares hreflang counterpart ${other}, which does not exist`);
    assert.notEqual(counterpart.robotsIndex, false, `${doc.url} pairs with noindex ${other}`);
    assert.equal(counterpart.status, 'published', `${doc.url} pairs with unpublished ${other}`);
    const back = counterpart.locale === 'ru' ? counterpart.hreflangUz : counterpart.hreflangRu;
    assert.equal(back, doc.url, `${other} does not point its hreflang back at ${doc.url}`);
  }
});

test('no document is published with an accidental noindex', () => {
  for (const doc of all) {
    if (doc.status !== 'published') continue;
    if (doc.robotsIndex === false) continue;
    assert.notEqual(
      doc.robotsIndex,
      undefined,
      `${doc.url} is published but never states robotsIndex — indexability must be explicit`,
    );
  }
});

// UTF-8 read as Latin-1 leaves a lead byte followed by a continuation byte in
// U+0080..U+00BF. Built from escapes because that range is invisible.
const MOJIBAKE = new RegExp('[\\u00C0-\\u00FF][\\u0080-\\u00BF]');

test('no indexable document contains mojibake', () => {
  for (const doc of indexable) {
    assert.doesNotMatch(
      JSON.stringify(doc),
      MOJIBAKE,
      `${doc.__file} was written or saved with the wrong encoding`,
    );
  }
});

// o‘ and g‘ (U+2018) are letters of the Uzbek alphabet; ’ (U+2019) is the tutuq
// belgisi. A plain ASCII ' between two letters means one of them was typed
// wrong, and it shows in the rendered page and in search snippets.
//
// 64 Uzbek documents predate this rule. They are recorded, not fixed here:
// rewriting 64 legacy pages is a separate piece of work with its own review,
// and doing it inside an SEO release would bury the change that is being
// measured. What this baseline buys is that the number can only go down.
const UZ_ASCII_APOSTROPHE_BASELINE = 64;

test('no NEW Uzbek document uses the ASCII apostrophe between letters', () => {
  const offenders: string[] = [];
  for (const doc of indexable) {
    if (!doc.url.startsWith('/uz/')) continue;
    if (/[a-zA-Z]'[a-zA-Z]/.test(JSON.stringify(doc))) offenders.push(doc.url);
  }
  assert.ok(
    offenders.length <= UZ_ASCII_APOSTROPHE_BASELINE,
    `the Uzbek ASCII-apostrophe baseline grew from ${UZ_ASCII_APOSTROPHE_BASELINE} to `
      + `${offenders.length}: ${offenders.slice(0, 8).join(', ')}`,
  );
});

// The four Uzbek commercial hubs are the pages this sprint is measured on, so
// they are held to the rule with no baseline at all.
test('the Uzbek money pages use the correct apostrophes with no exception', () => {
  const MONEY = ['/uz/sayt-yaratish/', '/uz/smm-xizmatlari/', '/uz/seo-xizmati/', '/uz/telegram-reklama/'];
  for (const url of MONEY) {
    const doc = all.find((d) => d.url === url);
    assert.ok(doc, `${url} is missing from content/`);
    const offenders = (JSON.stringify(doc).match(/[a-zA-Z]'[a-zA-Z]/g) || []).slice(0, 5);
    assert.deepEqual(offenders, [], `${url} uses an ASCII apostrophe: ${offenders.join(', ')}`);
  }
});

test('no indexable document invents a price, a review or a rating in schema', () => {
  for (const doc of indexable) {
    for (const forbidden of ['Review', 'AggregateRating', 'Offer']) {
      assert.ok(
        !(doc.schemaTypes || []).includes(forbidden as never),
        `${doc.url} declares ${forbidden} schema, which needs real verifiable data behind it`,
      );
    }
  }
});

test('a document declaring FAQPage actually shows the questions', () => {
  for (const doc of indexable) {
    if (!(doc.schemaTypes || []).includes('FAQPage' as never)) continue;
    assert.ok(
      (doc.faq?.length || 0) > 0,
      `${doc.url} declares FAQPage with no visible FAQ`,
    );
  }
});

// Quality gates for the hub-and-spoke topic clusters declared in
// content/seo/intent-manifest.json.
//
// A cluster only works if every spoke points at its hub, the hub points back,
// no two URLs claim the same primary intent, and the anchors are varied enough
// that the internal linking does not read as exact-match stuffing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildKnownUrls, collectOutgoingLinks, resolveRedirect } from '../src/shared/audit';
import type { BlogArticle, Page, Redirect } from '../src/shared/types';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');

type Spoke = { url: string; ownsIntent: string; primaryKeyword: string };
type Cluster = { id: string; hub: string; hubKeywords: string[]; spokes: Spoke[] };

const manifest: { clusters: Cluster[] } = JSON.parse(
  fs.readFileSync(path.join(CONTENT, 'seo', 'intent-manifest.json'), 'utf8'),
);
const redirects: Redirect[] = JSON.parse(
  fs.readFileSync(path.join(CONTENT, 'seo', 'redirects.json'), 'utf8'),
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

const pages = readAll<Page>(path.join(CONTENT, 'pages'));
const blog = readAll<BlogArticle>(path.join(CONTENT, 'blog'));
const all: (Page | BlogArticle)[] = [...pages, ...blog];
const byUrl = new Map(all.map((d) => [d.url, d]));
const knownUrls = buildKnownUrls(pages, { blog });

/** Outgoing link targets of one document, across every link surface. */
function targetsOf(url: string): Set<string> {
  const doc = byUrl.get(url);
  if (!doc) return new Set();
  const node = { url: doc.url, internalLinks: doc.internalLinks, bodyBlocks: (doc as Page).bodyBlocks || (doc as BlogArticle).body };
  return new Set(collectOutgoingLinks(node).map((l) => l.target));
}

test('every URL in a declared cluster exists and is published', () => {
  for (const cluster of manifest.clusters) {
    for (const url of [cluster.hub, ...cluster.spokes.map((s) => s.url)]) {
      const doc = byUrl.get(url);
      assert.ok(doc, `${cluster.id}: ${url} is missing from content/`);
      assert.equal(doc.status, 'published', `${cluster.id}: ${url} is not published`);
      assert.notEqual(doc.robotsIndex, false, `${cluster.id}: ${url} is noindex`);
    }
  }
});

test('every spoke links to its hub', () => {
  for (const cluster of manifest.clusters) {
    for (const spoke of cluster.spokes) {
      assert.ok(
        targetsOf(spoke.url).has(cluster.hub),
        `${cluster.id}: ${spoke.url} does not link to ${cluster.hub}`,
      );
    }
  }
});

test('every hub links back to each of its spokes', () => {
  for (const cluster of manifest.clusters) {
    const hubTargets = targetsOf(cluster.hub);
    for (const spoke of cluster.spokes) {
      assert.ok(
        hubTargets.has(spoke.url),
        `${cluster.id}: hub ${cluster.hub} does not link to ${spoke.url}`,
      );
    }
  }
});

test('no spoke is an orphan — something links to it', () => {
  const incoming = new Set<string>();
  for (const doc of all) {
    const node = { url: doc.url, internalLinks: doc.internalLinks, bodyBlocks: (doc as Page).bodyBlocks || (doc as BlogArticle).body };
    for (const link of collectOutgoingLinks(node)) if (link.target !== doc.url) incoming.add(link.target);
  }
  for (const cluster of manifest.clusters) {
    for (const spoke of cluster.spokes) {
      assert.ok(incoming.has(spoke.url), `${cluster.id}: ${spoke.url} has no incoming link`);
    }
  }
});

test('no cluster link points at a redirect source or a missing URL', () => {
  for (const cluster of manifest.clusters) {
    for (const url of [cluster.hub, ...cluster.spokes.map((s) => s.url)]) {
      for (const target of targetsOf(url)) {
        assert.ok(knownUrls.has(target), `${cluster.id}: ${url} links to unserved ${target}`);
        assert.equal(
          resolveRedirect(target, redirects),
          null,
          `${cluster.id}: ${url} links through a redirect to ${target}`,
        );
      }
    }
  }
});

test('cluster links stay inside their own locale', () => {
  for (const cluster of manifest.clusters) {
    const locale = cluster.hub.startsWith('/uz/') ? '/uz/' : '/ru/';
    for (const spoke of cluster.spokes) {
      assert.ok(spoke.url.startsWith(locale), `${cluster.id}: ${spoke.url} is not in ${locale}`);
    }
    for (const spoke of cluster.spokes) {
      for (const target of targetsOf(spoke.url)) {
        if (target === '/' || target === '/ru/blog/' || target === '/uz/blog/') continue;
        assert.ok(
          target.startsWith(locale),
          `${cluster.id}: ${spoke.url} links across locales to ${target}`,
        );
      }
    }
  }
});

test('no two URLs claim the same primary intent', () => {
  const owner = new Map<string, string>();
  for (const cluster of manifest.clusters) {
    for (const keyword of cluster.hubKeywords) {
      const key = keyword.toLowerCase();
      assert.ok(!owner.has(key), `"${keyword}" is claimed by both ${owner.get(key)} and ${cluster.hub}`);
      owner.set(key, cluster.hub);
    }
    for (const spoke of cluster.spokes) {
      const key = spoke.primaryKeyword.toLowerCase();
      assert.ok(!owner.has(key), `"${spoke.primaryKeyword}" is claimed by both ${owner.get(key)} and ${spoke.url}`);
      owner.set(key, spoke.url);
    }
  }
});

test('a spoke does not declare a keyword its hub owns', () => {
  for (const cluster of manifest.clusters) {
    const hubOwned = new Set(cluster.hubKeywords.map((k) => k.toLowerCase()));
    for (const spoke of cluster.spokes) {
      const doc = byUrl.get(spoke.url);
      if (!doc) continue;
      const declared = [
        (doc as Page).primaryKeyword,
        ...((doc as Page).secondaryKeywords || []),
        ...((doc as BlogArticle).keywords || []),
      ]
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.toLowerCase());
      for (const keyword of declared) {
        assert.ok(!hubOwned.has(keyword), `${spoke.url} declares "${keyword}", which ${cluster.hub} owns`);
      }
    }
  }
});

test('internal anchors to a hub are varied, not one exact-match phrase', () => {
  for (const cluster of manifest.clusters) {
    const anchors: string[] = [];
    for (const doc of all) {
      const node = { url: doc.url, internalLinks: doc.internalLinks, bodyBlocks: (doc as Page).bodyBlocks || (doc as BlogArticle).body };
      for (const link of collectOutgoingLinks(node)) {
        if (link.target === cluster.hub && link.anchor) anchors.push(link.anchor.trim().toLowerCase());
      }
    }
    if (anchors.length < 4) continue; // too few links for the ratio to mean anything
    const counts = new Map<string, number>();
    for (const a of anchors) counts.set(a, (counts.get(a) || 0) + 1);
    const [topAnchor, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = topCount / anchors.length;
    assert.ok(
      share <= 0.6,
      `${cluster.id}: "${topAnchor}" is ${Math.round(share * 100)}% of the ${anchors.length} anchors pointing at ${cluster.hub}`,
    );
  }
});

test('new cluster articles carry Article and Breadcrumb schema and one H1', () => {
  for (const cluster of manifest.clusters) {
    for (const spoke of cluster.spokes) {
      const doc = byUrl.get(spoke.url) as BlogArticle | undefined;
      if (!doc) continue;
      assert.ok(doc.schemaTypes?.includes('Article'), `${spoke.url} is missing Article schema`);
      assert.ok(doc.schemaTypes?.includes('BreadcrumbList'), `${spoke.url} is missing BreadcrumbList`);
      assert.ok(doc.h1 && doc.h1.trim().length > 0, `${spoke.url} has no H1`);
      assert.ok(doc.canonical?.endsWith(doc.url), `${spoke.url} canonical does not self-reference`);
      // FAQPage is only honest when the questions are visible on the page.
      if (doc.schemaTypes?.includes('FAQPage')) {
        assert.ok((doc.faq?.length || 0) > 0, `${spoke.url} declares FAQPage with no visible FAQ`);
      }
    }
  }
});

/** Every document in every declared cluster, hub and spokes alike. */
function clusterDocs(): { url: string; doc: Page | BlogArticle; isHub: boolean }[] {
  const out: { url: string; doc: Page | BlogArticle; isHub: boolean }[] = [];
  for (const cluster of manifest.clusters) {
    for (const url of [cluster.hub, ...cluster.spokes.map((s) => s.url)]) {
      const doc = byUrl.get(url);
      if (doc) out.push({ url, doc, isHub: url === cluster.hub });
    }
  }
  return out;
}

/** Uzbek clusters only — the apostrophe and stuffing rules are language-specific. */
function uzClusterDocs() {
  return clusterDocs().filter((d) => d.url.startsWith('/uz/'));
}

test('Uzbek cluster copy uses the correct apostrophes, not the ASCII one', () => {
  // o‘ and g‘ (U+2018) are letters of the Uzbek alphabet and ’ (U+2019) is the
  // tutuq belgisi. A plain ASCII ' between two letters means one of them was
  // typed wrong, which shows up in the rendered page and in search snippets.
  for (const { url, doc } of uzClusterDocs()) {
    const offenders = (JSON.stringify(doc).match(/[a-zA-Z]'[a-zA-Z]/g) || []).slice(0, 5);
    assert.equal(
      offenders.length,
      0,
      `${url} uses an ASCII apostrophe in Uzbek text: ${offenders.join(', ')}`,
    );
  }
});

// UTF-8 text decoded as Latin-1 leaves a Latin-1 lead byte followed by a
// continuation byte in the U+0080..U+00BF block: "do‘kon" read that way
// becomes "do\u00E2\u0080\u0098kon". Built from escapes rather than literals
// because that continuation range is invisible control characters.
const MOJIBAKE = new RegExp('[\\u00C0-\\u00FF][\\u0080-\\u00BF]');

test('no cluster document contains mojibake', () => {
  for (const { url, doc } of clusterDocs()) {
    assert.doesNotMatch(
      JSON.stringify(doc),
      MOJIBAKE,
      `${url} looks like it was written or saved with the wrong encoding`,
    );
  }
});

test('no cluster document promises a search ranking', () => {
  // The word is allowed — the pages use it to say guarantees are dishonest.
  // What is forbidden is an affirmative promise, so every mention has to sit
  // next to a negation.
  const NEGATED = /(mayd|maymiz|emas|yo‘q|ishonmasl)/i;
  for (const { url, doc } of clusterDocs()) {
    const text = JSON.stringify(doc);
    for (const match of text.matchAll(/kafolat\w*/gi)) {
      const window = text.slice(match.index, match.index + 160);
      assert.match(
        window,
        NEGATED,
        `${url} appears to promise a guarantee: "${window.slice(0, 90)}"`,
      );
    }
  }
});

test('the head term is not repeated to the point of stuffing', () => {
  for (const { url, doc } of uzClusterDocs()) {
    const text = JSON.stringify(doc);
    const words = (text.match(/[\p{L}‘’]+/gu) || []).length;
    const head = (text.match(/sayt yaratish/gi) || []).length;
    const density = head / Math.max(words, 1);
    assert.ok(
      density < 0.02,
      `${url} repeats the head term ${head} times in ${words} words (${(density * 100).toFixed(2)}%)`,
    );
  }
});

test('no cluster document fabricates reviews or ratings', () => {
  for (const { url, doc } of clusterDocs()) {
    for (const forbidden of ['Review', 'AggregateRating', 'Offer']) {
      assert.ok(
        !doc.schemaTypes?.includes(forbidden as never),
        `${url} declares ${forbidden} schema, which would need real, verifiable data behind it`,
      );
    }
  }
});

test('a commercial hub carries Service, FAQPage and BreadcrumbList schema', () => {
  for (const cluster of manifest.clusters) {
    const hub = byUrl.get(cluster.hub) as Page | undefined;
    if (!hub) continue;
    for (const required of ['Service', 'FAQPage', 'BreadcrumbList'] as const) {
      assert.ok(hub.schemaTypes?.includes(required), `${cluster.hub} is missing ${required} schema`);
    }
    // FAQPage is only honest when the questions are actually on the page.
    assert.ok((hub.faq?.length || 0) >= 4, `${cluster.hub} declares FAQPage with too few visible questions`);
  }
});

test('every spoke offers a conversion path', () => {
  for (const cluster of manifest.clusters) {
    for (const spoke of cluster.spokes) {
      const doc = byUrl.get(spoke.url) as BlogArticle | undefined;
      if (!doc) continue;
      const hasCta = Boolean(doc.cta?.href) || (doc.body || []).some((b) => b.type === 'cta' && b.href);
      assert.ok(hasCta, `${spoke.url} has no CTA — a reader who is convinced has nowhere to go`);
    }
  }
});

test('titles and descriptions are unique inside a cluster', () => {
  for (const cluster of manifest.clusters) {
    const titles = new Map<string, string>();
    const descriptions = new Map<string, string>();
    for (const url of [cluster.hub, ...cluster.spokes.map((s) => s.url)]) {
      const doc = byUrl.get(url);
      if (!doc) continue;
      const title = doc.title.trim().toLowerCase();
      const description = doc.description.trim().toLowerCase();
      assert.ok(!titles.has(title), `${url} and ${titles.get(title)} share a title`);
      assert.ok(
        !descriptions.has(description),
        `${url} and ${descriptions.get(description)} share a description`,
      );
      titles.set(title, url);
      descriptions.set(description, url);
    }
  }
});

test('cluster articles quote no invented price', () => {
  // Any bare currency figure in an article we authored would be a made-up price:
  // the whole point of the pricing article is that the number depends on scope.
  const money = /\d[\d\s.,]*\s*(so‘m|som|сум|\$|usd|доллар)/i;
  for (const cluster of manifest.clusters) {
    for (const spoke of cluster.spokes) {
      if (!spoke.url.startsWith('/uz/blog/')) continue; // only the articles authored in this sprint
      const doc = byUrl.get(spoke.url) as BlogArticle | undefined;
      if (!doc) continue;
      const text = JSON.stringify(doc);
      assert.doesNotMatch(text, money, `${spoke.url} contains what looks like a concrete price`);
    }
  }
});

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

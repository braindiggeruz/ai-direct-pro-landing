// Reads content/ the way the SEO tests do, for the studio tests: pages and
// articles of any root (the repository, or a temporary copy with a release's
// edits applied), and every internal link a document carries, wherever it
// sits (internalLinks, page bodyBlocks, article body).
//
// The site's link-graph gate (buildCockpit) reads internalLinks and page
// bodyBlocks only, so a link in an article's body to a studio page that is
// still a draft would pass it. linksToUnservedStudioPages() closes that gap
// for the studio: it is the check that the guide's link to Taqdimot AI works
// when the page is published and is broken while it is a draft.
import fs from 'node:fs';
import path from 'node:path';

import { collectOutgoingLinks } from '../../src/shared/audit';
import type { BlogArticle, BodyBlock, BrokenLink, Page } from '../../src/shared/types';
import { readStudioPages } from '../../apps/studio/shared/published-urls';

export type Doc = Page | BlogArticle;

export function readJsonTree<T>(dir: string): T[] {
  const out: T[] = [];
  if (!fs.existsSync(dir)) return out;
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

export function readDocs(root: string): { pages: Page[]; blog: BlogArticle[] } {
  return {
    pages: readJsonTree<Page>(path.join(root, 'content', 'pages')),
    blog: readJsonTree<BlogArticle>(path.join(root, 'content', 'blog')),
  };
}

/** Every internal link of a document: internalLinks, bodyBlocks (pages) and body (articles). */
export function documentLinks(doc: Doc): BrokenLink[] {
  const blocks = ((doc as Page).bodyBlocks || (doc as BlogArticle).body || []) as BodyBlock[];
  return collectOutgoingLinks({ url: doc.url, internalLinks: doc.internalLinks, bodyBlocks: blocks });
}

/**
 * Links from any document of content/pages or content/blog to a studio page
 * that is not served: a draft, or a studio-shaped URL with no record at all.
 */
export function linksToUnservedStudioPages(root: string): BrokenLink[] {
  const studio = readStudioPages(root);
  const published = new Set(studio.filter((page) => page.status === 'published').map((page) => page.url));
  const known = new Set(studio.map((page) => page.url));
  const { pages, blog } = readDocs(root);
  return [...pages, ...blog].flatMap(documentLinks).filter((link) => known.has(link.target) && !published.has(link.target));
}

/** Every keyword a document declares (primaryKeyword, secondaryKeywords, keywords), lowercased. */
export function declaredKeywords(doc: { primaryKeyword?: unknown; secondaryKeywords?: unknown; keywords?: unknown }): string[] {
  return [doc.primaryKeyword, ...((doc.secondaryKeywords as unknown[]) || []), ...((doc.keywords as unknown[]) || [])]
    .filter((k): k is string => typeof k === 'string')
    .map((k) => k.toLowerCase());
}

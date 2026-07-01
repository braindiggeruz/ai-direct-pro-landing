// Shared content-parsing utility.
//
// Extracts typed Page[], BlogArticle[], GlobalSEO from the raw
// Record<string, string> returned by readContentBulk(). Previously
// this 8-line loop was copy-pasted across 8+ endpoint files.

import type { Page, BlogArticle, GlobalSEO } from '../../src/shared/types';

export interface ParsedContent {
  pages: Page[];
  blog: BlogArticle[];
  global: GlobalSEO | undefined;
}

export function parseContentBulk(all: Record<string, string>): ParsedContent {
  const pages: Page[] = [];
  const blog: BlogArticle[] = [];
  let global: GlobalSEO | undefined;
  for (const [path, text] of Object.entries(all)) {
    if (!path.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(text);
      if (path.startsWith('content/pages/')) pages.push(parsed as Page);
      else if (path.startsWith('content/blog/')) blog.push(parsed as BlogArticle);
      else if (path === 'content/global/site.json') global = parsed as GlobalSEO;
    } catch { /* skip unparsable */ }
  }
  return { pages, blog, global };
}

// Local preview of draft pages. A draft is not prerendered, so it cannot be
// looked at before it is published (scripts/prerender.ts). For a review,
// PREVIEW_DRAFTS names drafts by URL, comma-separated:
//
//   $env:PREVIEW_DRAFTS='/ru/russko-uzbekskiy-perevodchik/,/uz/rus-ozbek-tarjimon/'
//   npm run build:fast; npx vite preview --port 4173
//
// prerender writes only those drafts, with robots noindex,nofollow. Nothing
// else treats them as published: the sitemap, the homepage lists, the feeds
// and the Markdown twins read the content files and still skip them, and
// generate-robots still answers their URLs 404 in _redirects, which Cloudflare
// Pages applies before static files. Clear the variable and rebuild before
// any release build (build:production).
import type { Page } from '../src/shared/types';

/**
 * The draft URLs to render. A URL that is not a draft page is a typo or a
 * published page, and stops the build rather than previewing nothing.
 */
export function previewDraftUrls(value: string | undefined, pages: Pick<Page, 'url' | 'status'>[]): Set<string> {
  const urls = (value || '').split(',').map((url) => url.trim()).filter(Boolean);
  const drafts = new Set(pages.filter((page) => page.status === 'draft').map((page) => page.url));
  const unknown = urls.filter((url) => !drafts.has(url));
  if (unknown.length) throw new Error(`PREVIEW_DRAFTS names no draft page: ${unknown.join(', ')}`);
  return new Set(urls);
}

/** A draft as the preview renders it: never indexable, links not followed. */
export function asPreviewPage<T extends Page>(page: T): T {
  return { ...page, robotsIndex: false, robotsFollow: false };
}

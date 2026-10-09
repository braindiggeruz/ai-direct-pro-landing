// Authored dates and canonical content only. Rebuilding must not invent freshness.
import type { BlogArticle, Page } from '../src/shared/types';
import { SITE_URL } from '../src/shared/site-config';

export const WEBSUB_HUB = 'https://pubsubhubbub.appspot.com/';
export const DISCOVERY_FEEDS = [
  { path: '/ru/blog/feed.xml', type: 'application/rss+xml' },
  { path: '/uz/blog/feed.xml', type: 'application/rss+xml' },
  { path: '/updates/atom.xml', type: 'application/atom+xml' },
] as const;
export const DISCOVERY_CACHE_CONTROL = 'public, max-age=0, s-maxage=300, must-revalidate';

/** Providers may reorder directives without changing the cache policy. */
export function hasDiscoveryCachePolicy(value: string | null): boolean {
  const directives = (header: string) => header.toLowerCase().split(',').map(v => v.trim()).sort().join(',');
  return value !== null && directives(value) === directives(DISCOVERY_CACHE_CONTROL);
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
}

export function authoredDate(value?: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return undefined;
  // Date.parse silently rolls February 30 into March; reject such source data.
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString().replace('.000Z', 'Z') : undefined;
}

function newest(values: Array<string | undefined>): string | undefined {
  return values.map(authoredDate).filter((v): v is string => !!v)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

export function articleUpdated(article: BlogArticle): string | undefined {
  return newest([article.dateModified || article.updatedAt, article.datePublished || article.createdAt]);
}

export function pageUpdated(page: Page): string | undefined {
  return newest([page.updatedAt, page.lastReviewedAt, page.createdAt]);
}

export function canonicalContent(doc: Pick<Page, 'url' | 'status' | 'robotsIndex'> & { canonical?: string }, siteUrl = SITE_URL): boolean {
  if (doc.status !== 'published' || doc.robotsIndex === false) return false;
  // URL paths are the same trailing-slash URLs used by prerender and sitemap.
  if (!/^\/(?:[a-z0-9-]+\/)*$/.test(doc.url)) return false;
  return !doc.canonical || doc.canonical === doc.url || doc.canonical === `${siteUrl}${doc.url}`;
}

export function byUpdatedThenUrl(a: { updated?: string; url: string }, b: { updated?: string; url: string }): number {
  return (Date.parse(b.updated || '') || 0) - (Date.parse(a.updated || '') || 0) || a.url.localeCompare(b.url, 'en');
}

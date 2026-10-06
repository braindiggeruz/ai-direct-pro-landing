/**
 * Read-only loader for the studio's page records, content/studio/pages/**.json.
 *
 * The studio's pages are not in content/pages/ (the site's prerender, sitemap
 * and audit read that directory, and the protected pages' HTML depends on
 * what is in it). Everything outside apps/studio that needs to know about a
 * studio page (generate-sitemap, seo-audit, the SEO tests) asks this module,
 * and only `status: "published"` pages count: a draft is not written to dist,
 * not listed in the sitemap, and a link to it is still a broken link.
 *
 * It lives in apps/studio/shared/ rather than scripts/ because the root
 * Tailwind v3 scans scripts/** for class names; nothing here may add one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STUDIO_PAGES_DIR = 'content/studio/pages';
export const STUDIO_PAGE_STATUSES = ['draft', 'published'] as const;
export type StudioPageStatus = (typeof STUDIO_PAGE_STATUSES)[number];
export type StudioLocale = 'uz' | 'ru';

/** One language segment and one slug: /uz/taqdimot-ai/, /ru/prezentatsiya-ai/. */
export const STUDIO_URL = /^\/(uz|ru)\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;

export interface StudioPageRecord {
  /** Repository-relative path of the JSON file, with forward slashes. */
  file: string;
  url: string;
  locale: StudioLocale;
  status: StudioPageStatus;
  /** The whole parsed record, for the renderer. */
  data: Record<string, unknown>;
}

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function jsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink in ${STUDIO_PAGES_DIR}: ${entry.name}`);
    if (entry.isDirectory()) found.push(...jsonFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.json')) found.push(absolute);
  }
  return found;
}

/** Every studio page record, validated; drafts included. Sorted by URL. */
export function readStudioPages(root: string = REPO_ROOT): StudioPageRecord[] {
  const directory = path.join(root, STUDIO_PAGES_DIR);
  const pages: StudioPageRecord[] = [];
  for (const absolute of jsonFiles(directory)) {
    const file = path.relative(root, absolute).split(path.sep).join('/');
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    } catch {
      throw new Error(`${file}: not valid JSON.`);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${file}: a page record is a JSON object.`);
    const record = data as Record<string, unknown>;
    const { url, locale, status } = record;
    if (typeof url !== 'string' || !STUDIO_URL.test(url)) throw new Error(`${file}: url must look like /uz/slug/ or /ru/slug/.`);
    if (locale !== url.split('/')[1]) throw new Error(`${file}: locale must match the URL's language segment.`);
    if (!STUDIO_PAGE_STATUSES.includes(status as StudioPageStatus)) {
      throw new Error(`${file}: status must be one of ${STUDIO_PAGE_STATUSES.join(', ')}.`);
    }
    pages.push({ file, url, locale: locale as StudioLocale, status: status as StudioPageStatus, data: record });
  }
  pages.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  for (let i = 1; i < pages.length; i += 1) {
    if (pages[i].url === pages[i - 1].url) throw new Error(`${pages[i].file}: URL ${pages[i].url} is also used by ${pages[i - 1].file}.`);
  }
  return pages;
}

/** The studio URLs that exist on the site: status "published" only. */
export function publishedStudioUrls(root: string = REPO_ROOT): string[] {
  return readStudioPages(root).filter((page) => page.status === 'published').map((page) => page.url);
}

/** A studio page's RU↔UZ pair; x-default is the Russian member, as everywhere on the site. */
export interface StudioAlternates {
  ru: string;
  uz: string;
  xDefault: string;
}

/**
 * The hreflang pair of `page` among `pages`, or null. A pair exists only when
 * both members are published studio pages that name each other (hreflangRu,
 * hreflangUz) and `page` is one of them: a page whose translation is still a
 * draft has no pair, no language switch and no alternates in the sitemap.
 * The page's HTML and the sitemap both ask this function, so they agree.
 */
export function studioAlternates(page: StudioPageRecord, pages: readonly StudioPageRecord[]): StudioAlternates | null {
  const { hreflangRu: ru, hreflangUz: uz } = page.data;
  if (page.status !== 'published' || typeof ru !== 'string' || typeof uz !== 'string') return null;
  if (page.url !== ru && page.url !== uz) return null;
  const counterpart = pages.find((other) => other.url === (page.url === ru ? uz : ru));
  if (!counterpart || counterpart.status !== 'published' || counterpart.locale === page.locale) return null;
  if (counterpart.data.hreflangRu !== ru || counterpart.data.hreflangUz !== uz) return null;
  if (!ru.startsWith('/ru/') || !uz.startsWith('/uz/')) return null;
  return { ru, uz, xDefault: ru };
}

export interface StudioSitemapEntry {
  url: string;
  /** YYYY-MM-DD of updatedAt (or createdAt), when the record has one. */
  lastmod?: string;
  alternates?: StudioAlternates;
}

const dateOnly = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString().slice(0, 10);
};

/**
 * The sitemap entries of the published studio pages, sorted by URL. A draft is
 * never listed. scripts/generate-sitemap.ts appends them to the site's entries;
 * they do not count towards the homepage's lastmod.
 */
export function studioSitemapEntries(root: string = REPO_ROOT): StudioSitemapEntry[] {
  const pages = readStudioPages(root);
  return pages
    .filter((page) => page.status === 'published')
    .map((page) => {
      const lastmod = dateOnly(page.data.updatedAt) ?? dateOnly(page.data.createdAt);
      const alternates = studioAlternates(page, pages);
      return { url: page.url, ...(lastmod ? { lastmod } : {}), ...(alternates ? { alternates } : {}) };
    });
}

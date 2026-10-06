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

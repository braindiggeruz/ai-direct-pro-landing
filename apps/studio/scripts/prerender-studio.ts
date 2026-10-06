/**
 * Writes the studio's static pages into the root build (STUDIO-SPEC §11.2).
 *
 *   npx tsx apps/studio/scripts/prerender-studio.ts            (root dist/)
 *   npx tsx apps/studio/scripts/prerender-studio.ts --dist <d>
 *
 * Runs last in `npm run build:studio`, after the root build has written dist/
 * (generate-sitemap included) and `vite build` in apps/studio has written
 * dist/assets/studio/. In order:
 *   1. reads dist/assets/studio/.vite/manifest.json, then deletes .vite/ so the
 *      manifest is never published;
 *   2. checks the bundle budget: the island's first load (entry JS, the chunks
 *      it imports statically, their CSS) is ≤ 90 kB gzip, and pptxgenjs/jszip
 *      are reachable only through import();
 *   3. checks every record in content/studio/pages (drafts too, so a broken
 *      draft fails long before its release), then writes dist/<url>/index.html
 *      for each record with status "published" and nothing for a draft
 *      (studio-page.ts: head, JSON-LD, header and footer, the form's first
 *      state inside #studio-root, the text around it);
 *   4. refuses to write to any of the ten protected paths and over any file
 *      that already exists: a studio page never replaces a page of the site;
 *   5. checks each written page: ≥ 400 words outside the island, its og image
 *      in dist/assets/studio;
 *   6. checks the sitemap against the HTML (generate-sitemap ran earlier, in
 *      build:fast): every published page is listed and has its file, no draft
 *      is listed, and every studio URL in sitemap*.xml has its file.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legalEntityIssues } from '../../../scripts/legal-entity';
import { PROTECTED_PATHS } from '../../../scripts/seo-protection';
import { siteStylesheetHrefs } from '../../../scripts/site-stylesheets';
import { staticClosure } from '../../../scripts/chat-bundle-budget';
import type { ViteManifest } from '../../../scripts/vite-manifest';
import type { GlobalSEO } from '../../../src/shared/types';
import { readStudioPages, STUDIO_URL, type StudioPageRecord } from '../shared/published-urls';
import {
  MIN_WORDS_OUTSIDE_ISLAND,
  countWords,
  renderStudioPage,
  studioPageProblems,
  textOutsideIsland,
  type StudioSiteContext,
} from './studio-page';

export { renderStudioPage } from './studio-page';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const STUDIO_ASSET_DIR = 'assets/studio';
export const STUDIO_MANIFEST = `${STUDIO_ASSET_DIR}/.vite/manifest.json`;
/** rollupOptions.input of apps/studio/vite.config.ts, as a manifest key. */
export const STUDIO_ENTRY = 'src/main.tsx';
/** Decimal kB, gzip level 9 per file, JS and CSS of the first load together. */
export const STUDIO_BUDGET = { firstLoadGzip: 90_000 } as const;
/** Packages that may only ever arrive through import(). */
export const LAZY_ONLY_PACKAGES = ['pptxgenjs', 'jszip'] as const;
/** A string pptxgenjs needs verbatim in its output, so it survives minification. */
export const PPTX_CODE_MARKER = 'ppt/presentation.xml';

export interface StudioEntryAssets {
  /** Root-relative URLs, e.g. /assets/studio/studio-abc.js. */
  script: string;
  styles: string[];
  /** dist-relative paths of everything the first load fetches. */
  firstLoadFiles: string[];
  firstLoadGzip: number;
  /** dist-relative paths of chunks reachable only through import(). */
  lazyFiles: string[];
}

export function gzipSize(content: Buffer): number {
  return zlib.gzipSync(content, { level: 9 }).length;
}

export function readStudioManifest(dist: string): ViteManifest {
  const file = path.join(dist, STUDIO_MANIFEST);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${STUDIO_MANIFEST}; run the studio's vite build (npm --prefix apps/studio run build) first.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ViteManifest;
}

/** Deletes dist/assets/studio/.vite/: the manifest is a build input, not a page asset. */
export function removeStudioManifest(dist: string): void {
  fs.rmSync(path.join(dist, STUDIO_ASSET_DIR, '.vite'), { recursive: true, force: true });
}

const assetPath = (file: string) => {
  if (!/^[\w.-]+\.(?:js|css)$/.test(file)) throw new Error(`Unexpected studio asset name: ${file}`);
  return `${STUDIO_ASSET_DIR}/${file}`;
};

const lazyOnly = (key: string) => LAZY_ONLY_PACKAGES.some((name) => key.includes(`node_modules/${name}/`));

/**
 * The island's first load and its lazy chunks, measured. `read` returns a
 * dist-relative file's bytes (a parameter so the test can use fixtures).
 */
export function studioEntryAssets(manifest: ViteManifest, read: (distPath: string) => Buffer): StudioEntryAssets {
  const entry = manifest[STUDIO_ENTRY];
  if (!entry?.isEntry) throw new Error(`Studio entry ${STUDIO_ENTRY} is not in the manifest.`);
  const closure = staticClosure(manifest, [STUDIO_ENTRY]);
  const scripts = closure.map((key) => assetPath(manifest[key].file));
  const styles = [...new Set(closure.flatMap((key) => manifest[key].css ?? []))].map(assetPath);
  const firstLoadFiles = [...scripts, ...styles];
  const lazyFiles = Object.keys(manifest)
    .filter((key) => !closure.includes(key))
    .map((key) => assetPath(manifest[key].file));
  return {
    script: `/${assetPath(entry.file)}`,
    styles: styles.map((file) => `/${file}`),
    firstLoadFiles,
    firstLoadGzip: firstLoadFiles.reduce((total, file) => total + gzipSize(read(file)), 0),
    lazyFiles,
  };
}

/** Every way the first load can break the budget; empty when it does not. */
export function studioBudgetFailures(
  manifest: ViteManifest,
  assets: StudioEntryAssets,
  read: (distPath: string) => Buffer,
  budget: { firstLoadGzip: number } = STUDIO_BUDGET,
): string[] {
  const failures: string[] = [];
  if (assets.firstLoadGzip > budget.firstLoadGzip) {
    failures.push(`first load ${assets.firstLoadGzip} B gzip > ${budget.firstLoadGzip} B`);
  }
  for (const key of staticClosure(manifest, [STUDIO_ENTRY])) {
    if (lazyOnly(key)) failures.push(`${key} is imported statically; it may only load through import()`);
  }
  for (const file of assets.firstLoadFiles.filter((name) => name.endsWith('.js'))) {
    if (read(file).toString('utf8').includes(PPTX_CODE_MARKER)) {
      failures.push(`${file} carries pptxgenjs code; it may only load through import()`);
    }
  }
  return failures;
}

/** The absolute index.html path for a studio URL, or an error saying why it may not be written. */
export function studioPageFile(dist: string, url: string): string {
  if (!STUDIO_URL.test(url)) throw new Error(`Refusing to write ${JSON.stringify(url)}: not a studio URL.`);
  if ((PROTECTED_PATHS as readonly string[]).includes(url)) {
    throw new Error(`Refusing to write ${url}: it is a protected SEO page.`);
  }
  const file = path.resolve(dist, url.slice(1), 'index.html');
  if (!file.startsWith(path.resolve(dist) + path.sep)) throw new Error(`Refusing to write ${url}: outside dist.`);
  return file;
}

/** Writes one studio page; never over an existing file and never to a protected path. */
export function writeStudioPage(dist: string, url: string, html: string): string {
  const file = studioPageFile(dist, url);
  if (fs.existsSync(file)) throw new Error(`Refusing to write ${url}: ${path.relative(dist, file)} already exists.`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    // wx: a file that appeared after the check above still is not overwritten.
    fs.writeFileSync(file, html, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Refusing to write ${url}: ${path.relative(dist, file)} already exists.`, { cause: error });
    }
    throw error;
  }
  return file;
}

/** The site facts the page needs: content/global/site.json and legal-entity.json of `root`. */
export function readStudioSite(root: string): StudioSiteContext {
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as Record<string, unknown>;
  const global = read('content/global/site.json') as unknown as GlobalSEO;
  const entity = read('content/global/legal-entity.json');
  const phone = `+${String(global.phone ?? '').replace(/\D/g, '')}`;
  const email = String(global.email ?? '').trim();
  const issues = legalEntityIssues(entity, { email, phone });
  if (issues.length) throw new Error(`The studio footer needs complete site and legal-entity data (${issues.join(', ')}).`);
  return { global, phone, email, entity: entity as unknown as StudioSiteContext['entity'] };
}

/** Every record's problems, by file; throws when any record cannot be rendered. */
export function assertStudioRecords(pages: readonly StudioPageRecord[]): void {
  const problems = pages.flatMap((page) => studioPageProblems(page).map((problem) => `${page.file}: ${problem}`));
  if (problems.length) throw new Error(`Studio page records are not renderable:\n  ${problems.join('\n  ')}`);
}

/** The site paths listed in a sitemap file of dist/, or null when the file is not there. */
export function sitemapPaths(dist: string, file: string, siteUrl: string): string[] | null {
  const absolute = path.join(dist, file);
  if (!fs.existsSync(absolute)) return null;
  return [...fs.readFileSync(absolute, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].trim())
    .map((loc) => (loc.startsWith(siteUrl) ? loc.slice(siteUrl.length) || '/' : loc));
}

/**
 * Sitemap ↔ HTML for the studio, every way they disagree; empty when they
 * agree. generate-sitemap.ts runs before this script, so a page it listed and
 * this script did not write would otherwise ship as a 404 in the sitemap.
 */
export function studioSitemapFailures(dist: string, pages: readonly StudioPageRecord[], siteUrl: string): string[] {
  const sitemap = sitemapPaths(dist, 'sitemap.xml', siteUrl);
  if (!sitemap) return ['dist/sitemap.xml is missing; scripts/generate-sitemap.ts runs before the studio prerender'];
  const listed = new Set(sitemap);
  const failures: string[] = [];
  const hasFile = (url: string) => fs.existsSync(studioPageFile(dist, url));
  for (const page of pages) {
    if (page.status === 'published') {
      if (!listed.has(page.url)) failures.push(`${page.url} is published but not in sitemap.xml`);
      if (!hasFile(page.url)) failures.push(`${page.url} is published but has no HTML`);
    } else if (listed.has(page.url)) {
      failures.push(`${page.url} is a draft but sitemap.xml lists it`);
    }
  }
  const studioUrls = new Set(pages.map((page) => page.url));
  for (const file of ['sitemap.xml', 'sitemap-updates.xml']) {
    for (const url of sitemapPaths(dist, file, siteUrl) ?? []) {
      if (studioUrls.has(url) && !hasFile(url)) failures.push(`${file} lists ${url} without its HTML`);
    }
  }
  return [...new Set(failures)];
}

export interface PrerenderResult {
  written: string[];
  drafts: string[];
  /** Visible words outside the island, per written page. */
  words: Record<string, number>;
  firstLoadGzip: number;
  lazyFiles: string[];
}

export function prerenderStudio(root: string = ROOT, dist: string = path.join(root, 'dist')): PrerenderResult {
  const read = (distPath: string) => fs.readFileSync(path.join(dist, distPath));
  let manifest: ViteManifest;
  try {
    manifest = readStudioManifest(dist);
  } finally {
    removeStudioManifest(dist);
  }
  const assets = studioEntryAssets(manifest, read);
  const failures = studioBudgetFailures(manifest, assets, read);
  if (failures.length) throw new Error(`Studio bundle over budget:\n${failures.join('\n')}`);

  const pages = readStudioPages(root);
  assertStudioRecords(pages);
  const published = pages.filter((page) => page.status === 'published');
  const written: string[] = [];
  const words: Record<string, number> = {};
  if (published.length) {
    const site = readStudioSite(root);
    const siteStyles = siteStylesheetHrefs(dist);
    for (const page of published) {
      const ogImage = String(page.data.ogImage);
      if (!fs.existsSync(path.join(dist, ogImage.slice(1)))) throw new Error(`${page.url}: its og image ${ogImage} is not in dist (apps/studio/public).`);
      const html = renderStudioPage(page, { site, pages, siteStyles, assets });
      const count = countWords(textOutsideIsland(html));
      if (count < MIN_WORDS_OUTSIDE_ISLAND) {
        throw new Error(`${page.url}: ${count} visible words outside the island, at least ${MIN_WORDS_OUTSIDE_ISLAND} are needed.`);
      }
      writeStudioPage(dist, page.url, html);
      written.push(page.url);
      words[page.url] = count;
    }
  }
  const missing = published.filter((page) => !fs.existsSync(studioPageFile(dist, page.url)));
  if (missing.length) throw new Error(`Published studio pages without HTML: ${missing.map((page) => page.url).join(', ')}`);
  const siteUrl = (JSON.parse(fs.readFileSync(path.join(root, 'content/global/site.json'), 'utf8')) as { siteUrl: string }).siteUrl;
  const sitemap = studioSitemapFailures(dist, pages, siteUrl);
  if (sitemap.length) throw new Error(`Studio sitemap and HTML disagree:\n${sitemap.join('\n')}`);
  return {
    written,
    drafts: pages.filter((page) => page.status === 'draft').map((page) => page.url),
    words,
    firstLoadGzip: assets.firstLoadGzip,
    lazyFiles: assets.lazyFiles,
  };
}

function main(): void {
  const flag = process.argv.indexOf('--dist');
  const dist = flag > 0 && process.argv[flag + 1] ? path.resolve(process.argv[flag + 1]) : path.join(ROOT, 'dist');
  const result = prerenderStudio(ROOT, dist);
  console.log(JSON.stringify({ status: 'studio-prerendered', ...result, budget: STUDIO_BUDGET.firstLoadGzip }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Studio prerender failed.');
    process.exitCode = 1;
  }
}

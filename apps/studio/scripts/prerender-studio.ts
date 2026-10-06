/**
 * Writes the studio's static pages into the root build (STUDIO-SPEC §11.2).
 *
 *   npx tsx apps/studio/scripts/prerender-studio.ts            (root dist/)
 *   npx tsx apps/studio/scripts/prerender-studio.ts --dist <d>
 *
 * Runs last in `npm run build:studio`, after the root build has written dist/
 * and `vite build` in apps/studio has written dist/assets/studio/. In order:
 *   1. reads dist/assets/studio/.vite/manifest.json, then deletes .vite/ so the
 *      manifest is never published;
 *   2. checks the bundle budget: the island's first load (entry JS, the chunks
 *      it imports statically, their CSS) is ≤ 90 kB gzip, and pptxgenjs/jszip
 *      are reachable only through import();
 *   3. writes dist/<url>/index.html for each content/studio/pages record with
 *      status "published", and nothing for a draft;
 *   4. refuses to write to any of the ten protected paths and over any file
 *      that already exists: a studio page never replaces a page of the site;
 *   5. checks that every published page now has its file.
 *
 * T0.3 skeleton: the page body is the minimum around the island. The full page
 * (head, JSON-LD, header and footer, the prerendered form, ≥400 words outside
 * the island, sitemap ↔ HTML checks) comes with T2.3.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROTECTED_PATHS } from '../../../scripts/seo-protection';
import { siteStylesheetHrefs } from '../../../scripts/site-stylesheets';
import { staticClosure } from '../../../scripts/chat-bundle-budget';
import type { ViteManifest } from '../../../scripts/vite-manifest';
import { readStudioPages, STUDIO_URL, type StudioPageRecord } from '../shared/published-urls';

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

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const text = (page: StudioPageRecord, field: string): string => {
  const value = page.data[field];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${page.file}: ${field} is required to publish.`);
  return value.trim();
};

/** T0.3 skeleton page: site CSS first, studio CSS after it, the island root, nothing else. */
export function renderStudioPage(
  page: StudioPageRecord,
  siteUrl: string,
  siteStyles: string[],
  assets: Pick<StudioEntryAssets, 'script' | 'styles'>,
): string {
  const tool = page.data.tool === 'photo' ? 'photo' : 'presentation';
  const stylesheets = [...siteStyles, ...assets.styles]
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`).join('\n');
  return `<!doctype html>
<html lang="${page.locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(text(page, 'title'))}</title>
<meta name="description" content="${escapeHtml(text(page, 'description'))}" />
<link rel="canonical" href="${escapeHtml(siteUrl + page.url)}" />
${stylesheets}
<script type="module" src="${escapeHtml(assets.script)}"></script>
</head>
<body data-studio>
<main>
<h1>${escapeHtml(text(page, 'h1'))}</h1>
<div id="studio-root" data-tool="${tool}"></div>
</main>
</body>
</html>
`;
}

export interface PrerenderResult {
  written: string[];
  drafts: string[];
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
  const published = pages.filter((page) => page.status === 'published');
  const written: string[] = [];
  if (published.length) {
    const site = JSON.parse(fs.readFileSync(path.join(root, 'content/global/site.json'), 'utf8')) as { siteUrl: string };
    const siteStyles = siteStylesheetHrefs(dist);
    for (const page of published) {
      writeStudioPage(dist, page.url, renderStudioPage(page, site.siteUrl, siteStyles, assets));
      written.push(page.url);
    }
  }
  const missing = published.filter((page) => !fs.existsSync(studioPageFile(dist, page.url)));
  if (missing.length) throw new Error(`Published studio pages without HTML: ${missing.map((page) => page.url).join(', ')}`);
  return {
    written,
    drafts: pages.filter((page) => page.status === 'draft').map((page) => page.url),
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

/**
 * Headless checks of the studio in a real browser (STUDIO-SPEC §14.3).
 *
 *   npx tsx apps/studio/scripts/check-pages.ts               checks dist/
 *   npx tsx apps/studio/scripts/check-pages.ts --dist <dir>
 *
 * Needs a finished build (npm run build:production, or the root build plus
 * npm run build:studio) and a local Chrome (CHROME_PATH, or the usual install
 * paths). playwright-core is the root package's pinned devDependency; the
 * studio does not install a second copy for a check that never ships.
 *
 * The files are served from dist/ by a throwaway server on 127.0.0.1, so the
 * browser loads exactly the bytes that would be deployed. Nothing is written
 * into dist/: the test pages below are served from memory.
 *
 * T0.3 checks:
 *   cascade  at 360 px, on a test page that loads the site stylesheet and then
 *            the studio's, the computed H1 font size, the border width of an
 *            `st:border` element and the padding of an `st:p-3` button are the
 *            studio's values. The same page without the studio stylesheet must
 *            show the site reset's values instead, or the check proves nothing.
 *   island   the entry loads and marks #studio-root ready without a single
 *            request beyond its own files (no /api/*, no pptxgenjs); asked for a
 *            deck, it loads pptxgenjs then and saves a .pptx that unzips.
 * T2.3 adds the published pages with /api/* cut off (H1, form, ≥400 words, no
 * error text, layout shift < 0.05 over the first 3 s).
 *
 * The class names in the test page are real studio utilities: Tailwind reads
 * this file (@source "../scripts" in src/styles.css), so they are in the CSS.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { siteStylesheetHrefs } from '../../../scripts/site-stylesheets';
import { STUDIO_ASSET_DIR } from './prerender-studio';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const VIEWPORT = { width: 360, height: 800 } as const;
const FIXTURE_PREFIX = '/__studio-check/';

/**
 * What the studio's theme makes of the probes, at the browser's 16 px root:
 * st:text-3xl = --st-text-3xl 1.875rem; st:border = 1px; st:p-3 = 3 × --st-spacing 0.25rem.
 */
export const STUDIO_EXPECTED = { h1FontSize: '30px', borderWidth: '1px', buttonPadding: '12px' } as const;

export interface CascadeProbe {
  rootFontSize: string;
  h1FontSize: string;
  borderWidth: string;
  buttonPadding: string[];
}

export interface StudioEntryFiles {
  script: string;
  style: string;
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter((candidate): candidate is string => Boolean(candidate));

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`No local Chrome found. Set CHROME_PATH. Looked in:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  return found;
}

/**
 * The entry's script and stylesheet. prerender-studio has already deleted the
 * manifest, so they are found by name: the input is called `studio`, Vite names
 * its files studio-<hash>.js/.css, and emptyOutDir leaves no older build next
 * to them. Exactly one of each, or the check refuses to guess.
 */
export function findStudioEntry(dist: string): StudioEntryFiles {
  const directory = path.join(dist, STUDIO_ASSET_DIR);
  if (!fs.existsSync(directory)) throw new Error(`Missing ${STUDIO_ASSET_DIR}/; run npm run build:studio first.`);
  const names = fs.readdirSync(directory);
  const pick = (extension: string) => {
    const found = names.filter((name) => new RegExp(`^studio-[\\w-]+\\.${extension}$`).test(name));
    if (found.length !== 1) throw new Error(`Expected one studio entry .${extension} in ${STUDIO_ASSET_DIR}/, found ${found.length}.`);
    return `/${STUDIO_ASSET_DIR}/${found[0]}`;
  };
  return { script: pick('js'), style: pick('css') };
}

/** A page shaped like a studio page: site CSS, then (optionally) studio CSS, then the island. */
export function cascadeFixture(siteStyles: string[], entry: StudioEntryFiles, withStudio: boolean): string {
  const styles = [...siteStyles, ...(withStudio ? [entry.style] : [])]
    .map((href) => `<link rel="stylesheet" href="${href}" />`).join('\n');
  return `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Studio cascade check</title>
${styles}
${withStudio ? `<script type="module" src="${entry.script}"></script>` : ''}
</head>
<body data-studio>
<main>
<h1 id="probe-h1" class="st:text-3xl">Mavzuni yozing — tayyor taqdimot (.pptx)</h1>
<div id="studio-root" data-tool="presentation">
<div id="probe-border" class="st:border">Taqdimot</div>
<button id="probe-button" type="button" class="st:p-3">Tayyorlash</button>
</div>
</main>
</body>
</html>
`;
}

/** Why a measured page does not show the studio's values; empty when it does. */
export function cascadeFailures(probe: CascadeProbe): string[] {
  const failures: string[] = [];
  if (probe.rootFontSize !== '16px') failures.push(`root font size ${probe.rootFontSize}, the expected values assume 16px`);
  if (probe.h1FontSize !== STUDIO_EXPECTED.h1FontSize) failures.push(`H1 font size ${probe.h1FontSize}, expected ${STUDIO_EXPECTED.h1FontSize}`);
  if (probe.borderWidth !== STUDIO_EXPECTED.borderWidth) failures.push(`st:border width ${probe.borderWidth}, expected ${STUDIO_EXPECTED.borderWidth}`);
  if (probe.buttonPadding.some((side) => side !== STUDIO_EXPECTED.buttonPadding)) {
    failures.push(`st:p-3 padding ${probe.buttonPadding.join(' ')}, expected ${STUDIO_EXPECTED.buttonPadding} on every side`);
  }
  return failures;
}

/** The control page must differ on every probe, or the cascade check could pass by accident. */
export function controlFailures(probe: CascadeProbe): string[] {
  const failures: string[] = [];
  if (probe.h1FontSize === STUDIO_EXPECTED.h1FontSize) failures.push('without studio CSS the H1 already has the studio size');
  if (probe.borderWidth === STUDIO_EXPECTED.borderWidth) failures.push('without studio CSS the border already has the studio width');
  if (probe.buttonPadding.every((side) => side === STUDIO_EXPECTED.buttonPadding)) failures.push('without studio CSS the button already has the studio padding');
  return failures;
}

/**
 * A font or image the site stylesheet pulls in by itself (today the Geist
 * fonts under /assets/fonts/). Never anything of the studio's own, never a
 * script, never /api/*.
 */
const SITE_STYLE_ASSET = /^\/assets\/(?!studio\/)(?:[\w-]+\/)*[\w.-]+\.(?:woff2|svg|png|webp)$/;

/**
 * Requests made while the page loads that are not the page itself, one of its
 * stylesheets or the entry script, a font or image of the site stylesheet, or
 * the favicon the browser asks for on its own. Empty when the island loads
 * quietly.
 */
export function unexpectedLoadRequests(requests: string[], pageFiles: string[]): string[] {
  const allowed = new Set([...pageFiles, '/favicon.ico']);
  return requests.filter((request) => !allowed.has(request) && !SITE_STYLE_ASSET.test(request));
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

interface Served {
  origin: string;
  requests: string[];
  close: () => Promise<void>;
}

async function serve(dist: string, pages: Record<string, string>): Promise<Served> {
  const requests: string[] = [];
  const base = path.resolve(dist);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    requests.push(pathname);
    if (pages[pathname] !== undefined) {
      response.writeHead(200, { 'content-type': CONTENT_TYPES['.html'] });
      response.end(pages[pathname]);
      return;
    }
    const file = path.resolve(base, `.${pathname}`);
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export interface CheckReport {
  status: 'pass' | 'fail';
  viewport: typeof VIEWPORT;
  studio: CascadeProbe;
  control: CascadeProbe;
  island: { loadRequests: string[]; lazyRequests: string[]; download: { name: string; bytes: number } | null };
  failures: string[];
}

export async function checkPages(dist: string): Promise<CheckReport> {
  const { chromium } = await import('playwright-core');
  const entry = findStudioEntry(dist);
  const siteStyles = siteStylesheetHrefs(dist);
  const studioPage = `${FIXTURE_PREFIX}cascade.html`;
  const controlPage = `${FIXTURE_PREFIX}control.html`;
  const server = await serve(dist, {
    [studioPage]: cascadeFixture(siteStyles, entry, true),
    [controlPage]: cascadeFixture(siteStyles, entry, false),
  });
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  const failures: string[] = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true });
    const page = await context.newPage();
    // No named helper inside `evaluate`: tsx compiles this file with
    // `keepNames`, which wraps a declared function in a `__name(...)` call,
    // and `__name` does not exist in the page.
    const measure = () => page.evaluate((): CascadeProbe => {
      const button = getComputedStyle(document.getElementById('probe-button') as HTMLElement);
      return {
        rootFontSize: getComputedStyle(document.documentElement).fontSize,
        h1FontSize: getComputedStyle(document.getElementById('probe-h1') as HTMLElement).fontSize,
        borderWidth: getComputedStyle(document.getElementById('probe-border') as HTMLElement).borderTopWidth,
        buttonPadding: [button.paddingTop, button.paddingRight, button.paddingBottom, button.paddingLeft],
      };
    });

    await page.goto(server.origin + controlPage, { waitUntil: 'load' });
    const control = await measure();
    failures.push(...controlFailures(control).map((failure) => `control: ${failure}`));

    server.requests.length = 0;
    await page.goto(server.origin + studioPage, { waitUntil: 'load' });
    await page.waitForSelector('#studio-root[data-island="ready"]', { timeout: 10_000 });
    const studio = await measure();
    failures.push(...cascadeFailures(studio).map((failure) => `cascade: ${failure}`));

    const loadRequests = [...server.requests];
    for (const request of unexpectedLoadRequests(loadRequests, [studioPage, entry.script, entry.style, ...siteStyles])) {
      failures.push(`island: unexpected request on load: ${request}`);
    }

    server.requests.length = 0;
    const deck = {
      lang: 'uz-Latn',
      title: 'Amir Temur',
      slides: [{ title: 'Hayoti', bullets: ['1336-yil Keshda tug‘ilgan', 'Samarqandni poytaxt qilgan'] }],
    };
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.evaluate((detail) => {
        document.getElementById('studio-root')?.dispatchEvent(new CustomEvent('studio:download', { detail }));
      }, deck),
    ]);
    const saved = await download.path();
    const bytes = fs.readFileSync(saved);
    const lazyRequests = [...server.requests];
    if (!lazyRequests.some((request) => /^\/assets\/studio\/pptxgen[\w.-]*\.js$/.test(request))) {
      failures.push('island: building a deck did not load the pptxgenjs chunk');
    }
    if (bytes.subarray(0, 2).toString('latin1') !== 'PK' || !bytes.includes(Buffer.from('ppt/presentation.xml'))) {
      failures.push('island: the saved file is not a .pptx archive');
    }
    if (!download.suggestedFilename().endsWith('.pptx')) failures.push(`island: saved as ${download.suggestedFilename()}`);

    await context.close();
    return {
      status: failures.length ? 'fail' : 'pass',
      viewport: VIEWPORT,
      studio,
      control,
      island: { loadRequests, lazyRequests, download: { name: download.suggestedFilename(), bytes: bytes.length } },
      failures,
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

async function main(): Promise<void> {
  const flag = process.argv.indexOf('--dist');
  const dist = flag > 0 && process.argv[flag + 1] ? path.resolve(process.argv[flag + 1]) : path.join(ROOT, 'dist');
  const report = await checkPages(dist);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'pass') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Studio page check failed.');
    process.exitCode = 1;
  });
}

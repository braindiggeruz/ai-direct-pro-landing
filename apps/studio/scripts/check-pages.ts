/**
 * Headless checks of the studio in a real browser (STUDIO-SPEC §14.3).
 *
 *   npx tsx apps/studio/scripts/check-pages.ts               checks dist/
 *   npx tsx apps/studio/scripts/check-pages.ts --dist <dir>
 *   npx tsx apps/studio/scripts/check-pages.ts --origin https://gptbot.uz
 *            the pages check only, against a live site (after a deploy)
 *
 * Needs a finished build (npm run build:production, or the root build plus
 * npm run build:studio) and a local Chrome (CHROME_PATH, or the usual install
 * paths). playwright-core is the root package's pinned devDependency; the
 * studio does not install a second copy for a check that never ships.
 *
 * The files are served from dist/ by a throwaway server on 127.0.0.1, so the
 * browser loads exactly the bytes that would be deployed. Nothing is written
 * into dist/: the test pages below are served from memory, with the site's
 * own Content-Security-Policy (dist/_headers, `/*`; without
 * upgrade-insecure-requests, which would send 127.0.0.1 to https).
 *
 * T0.3 checks:
 *   cascade  at 360 px, on a test page that loads the site stylesheet and then
 *            the studio's, the computed H1 font size, the border width of an
 *            `st:border` element and the padding of an `st:p-3` button are the
 *            studio's values. The same page without the studio stylesheet must
 *            show the site reset's values instead, or the check proves nothing.
 * T2.2 checks (the generator):
 *   hydrate  a page with the form's prerendered markup (static.ts renderForm),
 *            in Uzbek and in Russian: the island hydrates it without a
 *            mismatch, enables the submit button, and fetches nothing but its
 *            own files: no /api/*, no Turnstile, no pptxgenjs.
 *   flow     the whole free deck against a stub of the API contract (§6),
 *            answered in the browser (page routes), and a stub Turnstile:
 *            /config and /me only after the first focus; Turnstile only after
 *            submit; identity, start, slides, pictures (one refused, redrawn)
 *            and the funnel events in order and with the contract's bodies;
 *            pictures shown from blob: URLs; pptxgenjs fetched only on
 *            download; the saved .pptx unzips with the cover, the six slides,
 *            both pictures and the AI label; Webvisor classes in place; no
 *            CSP violation and no console error throughout.
 *            A second submit the same day (/me: none left) shows the limit
 *            with its reset time at once, without Turnstile or a start, and
 *            the first deck stays on the page.
 *   in-app   with an Instagram user agent, «Brauzerda oching» stands before
 *            the submit button, and still nothing is fetched on load.
 * T2.3 checks (the pages):
 *   pages    every studio page as the release writes it, with /api/* cut off
 *            (every request to it fails, as when robots.txt keeps a crawler
 *            out of /api/ or the studio is switched off): one H1, the form in
 *            #studio-root and on the first screen at 360 px, hydrated without
 *            a mismatch, ≥400 words outside the island, no error text, no
 *            /api/* request during load, layout shift < 0.05 over the first
 *            3 s. Then a focus in the form (/config and /me are tried and
 *            fail) still shows no error, and only a submit shows «Vaqtincha
 *            ishlamayapti» in the form's line, with the page around it intact.
 *            A published page is read from dist/<url>/index.html; a draft is
 *            rendered in memory by studio-page.ts as if published (with its
 *            translation), so the check passes before the release day.
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
import { readStudioPages, type StudioPageRecord } from '../shared/published-urls';
import { AI_LABEL } from '../src/pptx/build';
import { renderForm } from '../src/tools/presentation/static';
import { TEXTS } from '../src/tools/presentation/texts';
import { STUDIO_ASSET_DIR, readStudioSite } from './prerender-studio';
import { MIN_WORDS_OUTSIDE_ISLAND, renderStudioPage } from './studio-page';

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

/**
 * A page shaped like a studio page: site CSS, then (optionally) studio CSS,
 * then the island. The probes sit next to #studio-root, not inside it: the
 * island owns its root and renders the form there.
 */
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
<div id="studio-probes">
<div id="probe-border" class="st:border">Taqdimot</div>
<button id="probe-button" type="button" class="st:p-3">Tayyorlash</button>
</div>
<div id="studio-root" data-tool="presentation"></div>
</main>
</body>
</html>
`;
}

/** A studio page with the form's prerendered first state inside #studio-root, as prerender-studio writes it (T2.3). */
export function islandFixture(siteStyles: string[], entry: StudioEntryFiles, locale: 'uz' | 'ru', islandHtml: string): string {
  const styles = [...siteStyles, entry.style].map((href) => `<link rel="stylesheet" href="${href}" />`).join('\n');
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Studio island check</title>
${styles}
<script type="module" src="${entry.script}"></script>
</head>
<body data-studio>
<main>
<h1>${locale === 'uz' ? 'Mavzuni yozing — tayyor taqdimot (.pptx)' : 'Напишите тему — получите готовую презентацию (.pptx)'}</h1>
<div id="studio-root" data-tool="presentation">${islandHtml}</div>
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

/** The site's Content-Security-Policy for HTML pages (the `/*` block of _headers), minus upgrade-insecure-requests. */
export function siteCsp(headersFile: string): string {
  let inRoot = false;
  for (const line of headersFile.split(/\r?\n/)) {
    if (/^\S/.test(line)) inRoot = line.trim() === '/*';
    const match = /^\s+Content-Security-Policy:\s*(.+)$/.exec(line);
    if (inRoot && match) {
      return match[1]
        .split(';')
        .map((directive) => directive.trim())
        .filter((directive) => directive && directive !== 'upgrade-insecure-requests')
        .join('; ');
    }
  }
  throw new Error('No Content-Security-Policy in the /* block of _headers.');
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

async function serve(dist: string, pages: Record<string, string>, pageHeaders: Record<string, string> = {}): Promise<Served> {
  const requests: string[] = [];
  const base = path.resolve(dist);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    requests.push(pathname);
    if (pages[pathname] !== undefined) {
      response.writeHead(200, { 'content-type': CONTENT_TYPES['.html'], ...pageHeaders });
      response.end(pages[pathname]);
      return;
    }
    const file = path.resolve(base, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    const type = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, { 'content-type': type, ...(path.extname(file) === '.html' ? pageHeaders : {}) });
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

// --- the stub API (STUDIO-SPEC §6) ------------------------------------------------------

export const STUB_JOB = `sj_${'0123456789abcdef'.repeat(2)}`;
export const STUB_SITE_KEY = '1x00000000000000000000AA';
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/** A real free deck of the local T2.1 run (Amir Temur), as /:job/slides answers it. */
export const STUB_DECK = {
  title: 'Amir Temur',
  subtitle: 'Buyuk sarkarda va davlat arbobi haqida maktab taqdimoti',
  slides: [
    { index: 1, title: 'Mavzuga kirish', layout: 'image-right', bullets: ['Amir Temur — buyuk sarkarda va davlat arbobi', 'U Temuriylar saltanatiga asos solgan', 'Movarounnahr tarixida alohida o‘rin egallaydi', 'Bugungi darsimiz maqsadi: uning hayotini o‘rganish'] },
    { index: 2, title: 'Bolaligi va yoshligi', layout: 'image-right', bullets: ['Amir Temur 1336-yilda Xo‘ja Ilg‘or qishlog‘ida tug‘ilgan', 'Yoshligidan harbiy sohada shuhrat qozondi', 'Qat’iyatli va maqsadga intiluvchan bo‘lgan', 'Turkiy-mo‘g‘ul zodagonlar oilasidan chiqqan'] },
    { index: 3, title: 'Davlatning barpo etilishi', layout: 'title-bullets', bullets: ['Temur Movarounnahrni birlashtirdi', 'Markazi Samarqand shahri bo‘ldi', 'Katta saltanat hududini yaratdi', 'Harbiy yurishlar orqali hokimiyatni mustahkamladi'] },
    { index: 4, title: 'Ilm-fan va madaniyat', layout: 'title-bullets', bullets: ['Samarqandni buyuk ilmiy markazga aylantirdi', 'Buyuk ipak yo‘li karvonlarini himoya qildi', 'Mashhur hunarmandlar va olimlarni Samarqandga taklif qildi', 'Binolar koshin bilan bezatilgan'] },
    { index: 5, title: 'Buyuk binolar', layout: 'title-bullets', bullets: ['Bibixonim masjidi qurilgan', 'Go‘ri Amir maqbarasi Temur dafn etilgan joy', 'Peshtoq va gumbazlar ulug‘vor ko‘rinadi', 'Ushbu yodgorliklar bugungi kungacha saqlangan'] },
    { index: 6, title: 'Xulosa', layout: 'title-bullets', bullets: ['Amir Temur kuchli va birlashgan davlat yaratdi', 'Uning davrida ilm-fan rivojlandi', 'Samarqand jahon madaniyat markaziga aylandi', 'Biz buyuk ajdodlarimizdan misol olamiz'] },
  ],
} as const;
const STUB_IMAGES = [
  { index: 1, prompt: 'Ancient stone fortress walls in Samarkand under blue sky', sig: 'stub-signature-1' },
  { index: 2, prompt: 'Green valley with poplar trees and small village houses in Central Asia', sig: 'stub-signature-2' },
];

/** A Turnstile that passes every widget at once and records what it was asked. */
const STUB_TURNSTILE = `window.__turnstile = { rendered: [], removed: 0 };
window.turnstile = {
  render: function (element, options) {
    window.__turnstile.rendered.push({ action: options.action, sitekey: options.sitekey, appearance: options.appearance });
    setTimeout(function () { options.callback('stub-' + options.action); }, 50);
    return String(window.__turnstile.rendered.length);
  },
  reset: function () {},
  remove: function () { window.__turnstile.removed += 1; }
};`;

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
  at: number;
}

export interface CheckReport {
  status: 'pass' | 'fail';
  viewport: typeof VIEWPORT;
  studio: CascadeProbe;
  control: CascadeProbe;
  hydrate: { uz: { loadRequests: string[] }; ru: { loadRequests: string[] } };
  flow: { apiCalls: string[]; turnstile: unknown; download: { name: string; bytes: number; slides: number; media: number } | null; seconds: number };
  inApp: { noticeBeforeSubmit: boolean };
  pages: PageProbe[];
  failures: string[];
}

// --- the pages with /api/* cut off (T2.3) -----------------------------------------------

/** What the browser measured on one studio page. */
export interface PageProbe {
  url: string;
  source: 'dist' | 'memory' | 'origin';
  h1: string[];
  formsInIsland: number;
  submitEnabled: boolean;
  hydration: string | null;
  wordsOutsideIsland: number;
  /** Error messages of the form found anywhere in the page's text after load. */
  errorsOnLoad: string[];
  /** Layout shift over the first 3 s (inputs excluded). */
  layoutShift: number;
  formTop: number;
  viewportHeight: number;
  /** /api/* requests made before any action (all failed). */
  apiOnLoad: string[];
  /** After a focus in the form: /api/* requests tried, error messages shown. */
  afterFocus: { api: string[]; errors: string[] };
  /** After a submit: the form's message line, and whether the H1 is still there. */
  afterSubmit: { message: string; h1: number };
}

export const LAYOUT_SHIFT_LIMIT = 0.05;

/** The form's error and limit messages in `locale`: none of them may show before an action. */
export function errorTexts(locale: 'uz' | 'ru'): string[] {
  return Object.values(TEXTS[locale].messages);
}

/** Every way one measured page breaks the closed-API contract; empty when it keeps it. */
export function pageFailures(probe: PageProbe, locale: 'uz' | 'ru'): string[] {
  const at = `pages ${probe.url}`;
  const failures: string[] = [];
  if (probe.h1.length !== 1 || !probe.h1[0]) failures.push(`${at}: ${probe.h1.length} H1, expected one with text`);
  if (probe.formsInIsland !== 1) failures.push(`${at}: ${probe.formsInIsland} forms in #studio-root`);
  if (!probe.submitEnabled) failures.push(`${at}: the submit button is not enabled after hydration`);
  if (probe.hydration) failures.push(`${at}: React recovered from a hydration mismatch`);
  if (probe.wordsOutsideIsland < MIN_WORDS_OUTSIDE_ISLAND) failures.push(`${at}: ${probe.wordsOutsideIsland} words outside the island, expected ≥${MIN_WORDS_OUTSIDE_ISLAND}`);
  if (probe.errorsOnLoad.length) failures.push(`${at}: error text on load: ${probe.errorsOnLoad.join(' | ')}`);
  if (!(probe.layoutShift < LAYOUT_SHIFT_LIMIT)) failures.push(`${at}: layout shift ${probe.layoutShift} over the first 3 s, expected < ${LAYOUT_SHIFT_LIMIT}`);
  if (!(probe.formTop < probe.viewportHeight)) failures.push(`${at}: the form starts at ${probe.formTop}px, below the first screen (${probe.viewportHeight}px)`);
  if (probe.apiOnLoad.length) failures.push(`${at}: /api/* requested on load: ${probe.apiOnLoad.join(', ')}`);
  if (!probe.afterFocus.api.length) failures.push(`${at}: a focus in the form asked nothing of /api/studio (config and me are lazy, not absent)`);
  if (probe.afterFocus.errors.length) failures.push(`${at}: error text after a mere focus: ${probe.afterFocus.errors.join(' | ')}`);
  if (probe.afterSubmit.message !== TEXTS[locale].messages.busy) failures.push(`${at}: after a submit with /api/* down the form says «${probe.afterSubmit.message}», expected «${TEXTS[locale].messages.busy}»`);
  if (probe.afterSubmit.h1 !== 1) failures.push(`${at}: the page lost its H1 after the submit`);
  return failures;
}

export interface PageUnderCheck {
  url: string;
  locale: 'uz' | 'ru';
  /** HTML to serve from memory; null when the page is read from dist/ (or the origin). */
  html: string | null;
}

/**
 * The studio pages to check against `dist`: a published page from its file, a
 * draft rendered in memory as the release will write it (every record taken
 * as published, so the translation, the switch and hreflang are there too).
 */
export function pagesUnderCheck(root: string, dist: string, entry: StudioEntryFiles): PageUnderCheck[] {
  const pages = readStudioPages(root);
  const asReleased: StudioPageRecord[] = pages.map((page) => ({ ...page, status: 'published' }));
  const site = pages.some((page) => page.status === 'draft') ? readStudioSite(root) : null;
  return pages.map((page) => {
    if (page.status === 'published') return { url: page.url, locale: page.locale, html: null };
    const html = renderStudioPage(asReleased.find((other) => other.url === page.url) as StudioPageRecord, {
      site: site as NonNullable<typeof site>,
      pages: asReleased,
      siteStyles: siteStylesheetHrefs(dist),
      assets: { script: entry.script, styles: [entry.style] },
    });
    return { url: page.url, locale: page.locale, html };
  });
}

/** Opens each page with /api/* failing and measures it; failures are appended to `failures`. */
async function checkClosedApi(
  browser: Browser,
  origin: string,
  targets: PageUnderCheck[],
  failures: string[],
  source: (target: PageUnderCheck) => PageProbe['source'],
): Promise<PageProbe[]> {
  const probes: PageProbe[] = [];
  for (const target of targets) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const api: string[] = [];
    await context.route('**/api/**', async (route) => {
      api.push(new URL(route.request().url()).pathname);
      await route.abort('failed');
    });
    const tab = await context.newPage();
    await watch(tab, `pages ${target.url}`, failures);
    await tab.addInitScript(() => {
      const state = ((window as unknown as { __shift?: { value: number } }).__shift = { value: 0 });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) state.value += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const started = Date.now();
    await tab.goto(origin + target.url, { waitUntil: 'load' });
    await tab.waitForSelector('#studio-root[data-island="ready"]', { timeout: 15_000 }).catch(() => failures.push(`pages ${target.url}: the island never became ready`));
    await tab.waitForTimeout(Math.max(0, 3_000 - (Date.now() - started)));
    const errors = errorTexts(target.locale);
    const measure = () => tab.evaluate((messages: string[]) => {
      const root = document.getElementById('studio-root');
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('#studio-root, script, style, noscript, template').forEach((node) => node.remove());
      const words = (clone.textContent ?? '').match(/[\p{L}\p{N}]+(?:[‘’'-][\p{L}\p{N}]+)*/gu) ?? [];
      const text = document.body.innerText;
      const form = root?.querySelector('form');
      return {
        h1: Array.from(document.querySelectorAll('h1')).map((h1) => (h1.textContent ?? '').trim()),
        formsInIsland: root ? root.querySelectorAll('form').length : 0,
        submitEnabled: (root?.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.disabled === false,
        hydration: root?.dataset.hydration ?? null,
        wordsOutsideIsland: words.length,
        errors: messages.filter((message) => text.includes(message)),
        layoutShift: Math.round(((window as unknown as { __shift?: { value: number } }).__shift?.value ?? 0) * 10_000) / 10_000,
        formTop: form ? Math.round(form.getBoundingClientRect().top + window.scrollY) : Number.POSITIVE_INFINITY,
        viewportHeight: window.innerHeight,
      };
    }, errors);
    const loaded = await measure();
    const apiOnLoad = [...api];
    await tab.click('#studio-root input[name="topic"]');
    await tab.waitForTimeout(1_500);
    const focused = await measure();
    const afterFocus = { api: api.slice(apiOnLoad.length), errors: focused.errors };
    await tab.fill('#studio-root input[name="topic"]', 'Amir Temur');
    await tab.click('#studio-root button[type="submit"]');
    const message = await tab.waitForFunction(() => {
      const line = document.querySelector('#studio-root [data-studio-message]');
      return line && line.getAttribute('data-studio-message') ? (line.textContent ?? '').trim() : null;
    }, undefined, { timeout: 20_000 }).then((handle) => handle.jsonValue() as Promise<string>).catch(() => '');
    const h1After = await tab.evaluate(() => document.querySelectorAll('h1').length);
    for (const violation of await cspViolations(tab)) failures.push(`pages ${target.url}: CSP violation: ${violation}`);
    const probe: PageProbe = {
      url: target.url,
      source: source(target),
      h1: loaded.h1,
      formsInIsland: loaded.formsInIsland,
      submitEnabled: loaded.submitEnabled,
      hydration: loaded.hydration,
      wordsOutsideIsland: loaded.wordsOutsideIsland,
      errorsOnLoad: loaded.errors,
      layoutShift: loaded.layoutShift,
      formTop: loaded.formTop,
      viewportHeight: loaded.viewportHeight,
      apiOnLoad,
      afterFocus,
      afterSubmit: { message, h1: h1After },
    };
    failures.push(...pageFailures(probe, target.locale));
    probes.push(probe);
    await context.close();
  }
  return probes;
}

/** The pages check alone, against a live origin (after a deploy): the published pages only. */
export async function checkOrigin(origin: string, root: string = ROOT): Promise<{ status: 'pass' | 'fail'; pages: PageProbe[]; failures: string[] }> {
  const { chromium } = await import('playwright-core');
  const targets = readStudioPages(root).filter((page) => page.status === 'published').map((page) => ({ url: page.url, locale: page.locale, html: null }));
  const failures: string[] = [];
  if (!targets.length) failures.push('origin: no published studio page to check');
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  try {
    const pages = await checkClosedApi(browser, origin.replace(/\/+$/, ''), targets, failures, () => 'origin');
    return { status: failures.length ? 'fail' : 'pass', pages, failures };
  } finally {
    await browser.close();
  }
}

type Playwright = typeof import('playwright-core');
type Browser = Awaited<ReturnType<Playwright['chromium']['launch']>>;
type Context = Awaited<ReturnType<Browser['newContext']>>;
type Page = Awaited<ReturnType<Context['newPage']>>;

/** Records console errors, page errors and CSP violations of a page. */
async function watch(page: Page, label: string, failures: string[]): Promise<void> {
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // The browser logs every 4xx answer of the stub API (a refused picture is part of the contract).
    if (message.text().startsWith('Failed to load resource') && message.location().url.includes('/api/studio/')) return;
    failures.push(`${label}: console error: ${message.text().slice(0, 200)}`);
  });
  page.on('pageerror', (error) => failures.push(`${label}: page error: ${error.message.slice(0, 200)}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const list = ((window as unknown as { __csp?: string[] }).__csp ??= []);
      list.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
}

async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
}

/** Answers /api/studio/* by the contract and the Turnstile script with the stub; records every call. */
async function stubApi(context: Context, jpeg: Buffer, calls: ApiCall[], turnstileFetches: number[]): Promise<void> {
  const started = Date.now();
  let refusedOnce = false;
  let meCalls = 0;
  await context.route(`${TURNSTILE_URL}**`, async (route) => {
    turnstileFetches.push(Date.now() - started);
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB_TURNSTILE });
  });
  await context.route('**/api/studio/**', async (route) => {
    const request = route.request();
    const apiPath = new URL(request.url()).pathname.replace('/api/studio/', '');
    const raw = request.postData();
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: request.method(), path: apiPath, body, at: Date.now() - started });
    const json = (status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (apiPath === 'config') {
      return json(200, {
        ok: true,
        tools: { freeDeck: true, fullDeck: false, photo: false },
        payments: { mode: null, providers: ['click'] },
        plans: [],
        free: { presentation: 1, photo: 2, resetsAt: '05:00 Asia/Tashkent' },
        shapes: { free: { minSlides: 4, maxSlides: 6, images: 2, notes: false, palettes: 1 }, full: { minSlides: 6, maxSlides: 12, images: 8, notes: true, palettes: 3 } },
        turnstileSiteKey: STUB_SITE_KEY,
        termsVersion: null,
        terms: { ru: null, uz: null },
        aiLabel: true,
      });
    }
    if (apiPath === 'me') {
      // First a new browser with the day's deck; after it, an identity with none left.
      const fresh = meCalls++ === 0;
      return json(200, { ok: true, identity: !fresh, free: { presentation: { left: fresh ? 1 : 0, limit: 1 }, photo: { left: 2, limit: 2 }, resetsAt: '05:00 Asia/Tashkent' }, account: null, entitlements: [], latestOrder: null, receipts: [] });
    }
    if (apiPath === 'identity') return json(200, { ok: true });
    if (apiPath === 'presentations') {
      return json(201, { ok: true, jobId: STUB_JOB, source: 'free', shape: { slides: 6, images: 2, notes: false, palette: 1, parts: 1 }, next: 'slides', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    }
    if (apiPath === `presentations/${STUB_JOB}/slides`) return json(200, { ok: true, part: 1, deck: STUB_DECK, images: STUB_IMAGES, done: true });
    if (apiPath === `presentations/${STUB_JOB}/images`) {
      const index = (body as { index?: number }).index;
      if (index === 2 && !refusedOnce) {
        refusedOnce = true;
        return json(422, { ok: false, code: 'image_refused', error: 'image refused' });
      }
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: jpeg, headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'no-store' } });
    }
    if (apiPath === 'event') return route.fulfill({ status: 204, body: '' });
    return json(404, { ok: false, code: 'not_found', error: 'not found' });
  });
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Every way the recorded calls of one free deck break the contract; empty when they keep it. */
export function flowFailures(calls: ApiCall[], focusAt: number, submitAt: number): string[] {
  const failures: string[] = [];
  const paths = calls.map((call) => `${call.method} ${call.path}`);
  const first = (name: string) => calls.findIndex((call) => call.path === name);
  const before = calls.filter((call) => call.at < focusAt);
  if (before.length) failures.push(`flow: /api/studio called before the first focus: ${before.map((call) => call.path).join(', ')}`);
  const reads = calls.filter((call) => call.path === 'config' || call.path === 'me');
  if (reads.length !== 2 || reads.some((call) => call.method !== 'GET' || call.at >= submitAt)) {
    failures.push(`flow: expected one GET /config and one GET /me between focus and submit, got ${reads.map((call) => `${call.method} ${call.path}@${call.at}`).join(', ')}`);
  }
  const order = ['identity', 'presentations', `presentations/${STUB_JOB}/slides`].map(first);
  if (order.some((at) => at < 0) || !(order[0] < order[1] && order[1] < order[2])) failures.push(`flow: identity → start → slides out of order: ${paths.join(' | ')}`);
  const identity = calls[order[0]];
  if (identity && !sameJson(identity.body, { turnstileToken: 'stub-studio_identity' })) failures.push(`flow: /identity body ${JSON.stringify(identity.body)}`);
  const start = calls[order[1]]?.body as Record<string, unknown> | undefined;
  const task = { topic: 'Amir Temur', locale: 'uz', audience: 'maktab', slides: 6, palette: 1 };
  if (start) {
    const { requestId, ...rest } = start;
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) failures.push('flow: the start has no valid requestId');
    if (!sameJson(Object.fromEntries(Object.entries(rest).sort()), Object.fromEntries(Object.entries({ ...task, shape: 'free', turnstileToken: 'stub-studio_free_deck' }).sort()))) {
      failures.push(`flow: /presentations body ${JSON.stringify(rest)}`);
    }
  }
  const slides = calls[order[2]];
  if (slides && !sameJson(slides.body, task)) failures.push(`flow: /slides body ${JSON.stringify(slides.body)}`);
  const pictures = calls.filter((call) => call.path.endsWith('/images')).map((call) => (call.body as { index: number }).index).sort();
  if (!sameJson(pictures, [1, 2, 2])) failures.push(`flow: pictures asked ${JSON.stringify(pictures)}, expected 1 once and 2 twice (one redraw)`);
  for (const call of calls.filter((entry) => entry.path.endsWith('/images'))) {
    const image = STUB_IMAGES.find((entry) => entry.index === (call.body as { index: number }).index);
    if (!image || !sameJson(call.body, image)) failures.push(`flow: picture body ${JSON.stringify(call.body)}`);
  }
  const events = calls.filter((call) => call.path === 'event').map((call) => call.body as { type: string; detail: string; id: string; viewId: string });
  const kinds = events.map((event) => `${event.type}:${event.detail}`);
  if (!sameJson(kinds, ['studio_tool_started:presentation', 'studio_result_ready:free'])) failures.push(`flow: funnel events ${JSON.stringify(kinds)}`);
  if (new Set(events.map((event) => event.viewId)).size > 1) failures.push('flow: the events of one view carry different view ids');
  const unknown = calls.filter((call) => !['config', 'me', 'identity', 'presentations', 'event'].includes(call.path) && !call.path.startsWith(`presentations/${STUB_JOB}/`));
  if (unknown.length) failures.push(`flow: unexpected calls ${unknown.map((call) => call.path).join(', ')}`);
  return failures;
}

export async function checkPages(dist: string, root: string = ROOT): Promise<CheckReport> {
  const { chromium } = await import('playwright-core');
  const { default: JSZip } = await import('jszip');
  const entry = findStudioEntry(dist);
  const siteStyles = siteStylesheetHrefs(dist);
  const csp = siteCsp(fs.readFileSync(path.join(dist, '_headers'), 'utf8'));
  const studioPage = `${FIXTURE_PREFIX}cascade.html`;
  const controlPage = `${FIXTURE_PREFIX}control.html`;
  const uzPage = `${FIXTURE_PREFIX}uz.html`;
  const ruPage = `${FIXTURE_PREFIX}ru.html`;
  const studioPages = pagesUnderCheck(root, dist, entry);
  const server = await serve(
    dist,
    {
      [studioPage]: cascadeFixture(siteStyles, entry, true),
      [controlPage]: cascadeFixture(siteStyles, entry, false),
      [uzPage]: islandFixture(siteStyles, entry, 'uz', renderForm('uz')),
      [ruPage]: islandFixture(siteStyles, entry, 'ru', renderForm('ru')),
      ...Object.fromEntries(studioPages.filter((target) => target.html !== null).map((target) => [target.url, target.html as string])),
    },
    { 'Content-Security-Policy': csp },
  );
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  const failures: string[] = [];
  const pageFiles = (page: string) => [page, entry.script, entry.style, ...siteStyles];
  try {
    // --- cascade -------------------------------------------------------------------
    const cascadeContext = await browser.newContext({ viewport: VIEWPORT });
    const page = await cascadeContext.newPage();
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
    await page.goto(server.origin + studioPage, { waitUntil: 'load' });
    await page.waitForSelector('#studio-root[data-island="ready"]', { timeout: 10_000 });
    const studio = await measure();
    failures.push(...cascadeFailures(studio).map((failure) => `cascade: ${failure}`));
    // A picture for the stub API: a real JPEG, drawn by this browser.
    const jpeg = Buffer.from(await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d') as CanvasRenderingContext2D;
      context.fillStyle = '#229ed9';
      context.fillRect(0, 0, 256, 256);
      context.fillStyle = '#2fe6d1';
      context.fillRect(64, 64, 128, 128);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((made) => resolve(made as Blob), 'image/jpeg', 0.85));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }));
    await cascadeContext.close();

    // --- hydrate (uz, ru) -----------------------------------------------------------
    const hydrate = { uz: { loadRequests: [] as string[] }, ru: { loadRequests: [] as string[] } };
    for (const locale of ['uz', 'ru'] as const) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const tab = await context.newPage();
      await watch(tab, `hydrate ${locale}`, failures);
      const external: string[] = [];
      tab.on('request', (request) => {
        if (!request.url().startsWith(server.origin)) external.push(request.url());
      });
      server.requests.length = 0;
      const target = locale === 'uz' ? uzPage : ruPage;
      await tab.goto(server.origin + target, { waitUntil: 'load' });
      await tab.waitForSelector('#studio-root[data-island="ready"]', { timeout: 10_000 });
      await tab.waitForTimeout(500);
      const state = await tab.evaluate(() => ({
        recovered: document.getElementById('studio-root')?.dataset.hydration ?? null,
        submitDisabled: (document.querySelector('#studio-root button[type="submit"]') as HTMLButtonElement | null)?.disabled ?? null,
        forms: document.querySelectorAll('#studio-root form').length,
      }));
      if (state.recovered) failures.push(`hydrate ${locale}: React recovered from a hydration mismatch`);
      if (state.forms !== 1) failures.push(`hydrate ${locale}: ${state.forms} forms in the island`);
      if (state.submitDisabled !== false) failures.push(`hydrate ${locale}: the submit button is not enabled after hydration`);
      hydrate[locale].loadRequests = [...server.requests];
      for (const request of unexpectedLoadRequests(server.requests, pageFiles(target))) failures.push(`hydrate ${locale}: unexpected request on load: ${request}`);
      for (const request of external) failures.push(`hydrate ${locale}: request to another host on load: ${request}`);
      for (const violation of await cspViolations(tab)) failures.push(`hydrate ${locale}: CSP violation: ${violation}`);
      await context.close();
    }

    // --- flow ------------------------------------------------------------------------
    const flowContext = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true });
    const calls: ApiCall[] = [];
    const turnstileFetches: number[] = [];
    await stubApi(flowContext, jpeg, calls, turnstileFetches);
    const tab = await flowContext.newPage();
    await watch(tab, 'flow', failures);
    const flowStarted = Date.now();
    server.requests.length = 0;
    await tab.goto(server.origin + uzPage, { waitUntil: 'load' });
    await tab.waitForSelector('#studio-root[data-island="ready"]', { timeout: 10_000 });
    await tab.waitForTimeout(500);
    if (calls.length || turnstileFetches.length) failures.push('flow: the API or Turnstile was called on load');
    const focusAt = Date.now() - flowStarted;
    await tab.click('#studio-root input[name="topic"]');
    await tab.fill('#studio-root input[name="topic"]', 'Amir Temur');
    await tab.waitForTimeout(300);
    if (turnstileFetches.length) failures.push('flow: Turnstile loaded before the submit');
    const submitAt = Date.now() - flowStarted;
    await tab.click('#studio-root button[type="submit"]');
    await tab.waitForSelector('#studio-root [data-studio-download="idle"]', { timeout: 20_000 });
    const seconds = Math.round((Date.now() - flowStarted - submitAt) / 100) / 10;
    failures.push(...flowFailures([...calls], focusAt, submitAt));
    if (turnstileFetches.length !== 1) failures.push(`flow: the Turnstile script was fetched ${turnstileFetches.length} times`);
    const turnstile = await tab.evaluate(() => (window as unknown as { __turnstile?: unknown }).__turnstile ?? null);
    const rendered = (turnstile as { rendered?: { action: string; sitekey: string; appearance: string }[]; removed?: number } | null) ?? {};
    if (!sameJson((rendered.rendered ?? []).map((widget) => widget.action), ['studio_identity', 'studio_free_deck'])) failures.push(`flow: Turnstile widgets ${JSON.stringify(rendered.rendered)}`);
    if ((rendered.rendered ?? []).some((widget) => widget.sitekey !== STUB_SITE_KEY || widget.appearance !== 'interaction-only')) failures.push('flow: a widget without the site key or interaction-only');
    if (rendered.removed !== 2) failures.push(`flow: ${rendered.removed} widgets removed after their tokens, expected 2`);

    const dom = await tab.evaluate(() => {
      const root = document.getElementById('studio-root') as HTMLElement;
      return {
        slides: root.querySelectorAll('[data-studio-preview] li[data-slide]').length,
        pictures: Array.from(root.querySelectorAll('img[data-picture]')).map((img) => (img as HTMLImageElement).src),
        loaded: Array.from(root.querySelectorAll('img[data-picture]')).every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
        formClass: root.querySelector('form')?.className ?? '',
        topicClass: root.querySelector('input[name="topic"]')?.className ?? '',
        previewClass: root.querySelector('[data-studio-preview]')?.className ?? '',
        downloadClass: root.querySelector('[data-studio-download]')?.className ?? '',
        dataUrls: root.innerHTML.includes('data:image'),
      };
    });
    if (dom.slides !== 6) failures.push(`flow: the preview shows ${dom.slides} slides`);
    if (dom.pictures.length !== 2 || !dom.pictures.every((src) => src.startsWith('blob:'))) failures.push(`flow: pictures ${JSON.stringify(dom.pictures)} are not two object URLs`);
    if (!dom.loaded) failures.push('flow: a picture did not load');
    if (dom.dataUrls) failures.push('flow: a data: URL in the island');
    if (!/(^| )ym-disable-submit( |$)/.test(dom.formClass)) failures.push('webvisor: the form lacks ym-disable-submit');
    if (!/(^| )ym-disable-keys( |$)/.test(dom.topicClass)) failures.push('webvisor: the topic field lacks ym-disable-keys');
    if (!/(^| )ym-hide-content( |$)/.test(dom.previewClass)) failures.push('webvisor: the preview lacks ym-hide-content');
    if (!/(^| )ym-hide-content( |$)/.test(dom.downloadClass)) failures.push('webvisor: the download block lacks ym-hide-content');

    const beforeDownload = [...server.requests];
    if (beforeDownload.some((request) => /^\/assets\/studio\/pptxgen[\w.-]*\.js$/.test(request))) failures.push('flow: pptxgenjs loaded before the download');
    const [download] = await Promise.all([
      tab.waitForEvent('download', { timeout: 30_000 }),
      tab.click('#studio-root [data-studio-download] button'),
    ]);
    const bytes = fs.readFileSync(await download.path());
    if (!server.requests.some((request) => /^\/assets\/studio\/pptxgen[\w.-]*\.js$/.test(request))) failures.push('flow: the download did not load the pptxgenjs chunk');
    if (download.suggestedFilename() !== 'taqdimot-amir-temur.pptx') failures.push(`flow: saved as ${download.suggestedFilename()}`);
    let report = { name: download.suggestedFilename(), bytes: bytes.length, slides: 0, media: 0 };
    try {
      const zip = await JSZip.loadAsync(bytes);
      const names = Object.keys(zip.files);
      const slideFiles = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(/(\d+)\.xml/.exec(a)![1]) - Number(/(\d+)\.xml/.exec(b)![1]));
      const media = names.filter((name) => name.startsWith('ppt/media/') && !name.endsWith('/'));
      report = { ...report, slides: slideFiles.length, media: media.length };
      if (!zip.file('ppt/presentation.xml') || !zip.file('[Content_Types].xml')) failures.push('flow: the file is not a presentation');
      if (slideFiles.length !== 8) failures.push(`flow: ${slideFiles.length} slides in the file, expected cover + 6 + label`);
      if (media.length !== 2) failures.push(`flow: ${media.length} pictures in the file, expected 2`);
      const xml = await Promise.all(slideFiles.map((name) => zip.file(name)!.async('string')));
      if (!xml[0]?.includes(STUB_DECK.title)) failures.push('flow: the cover lacks the title');
      STUB_DECK.slides.forEach((slide, i) => {
        if (!xml[i + 1]?.includes(slide.title)) failures.push(`flow: slide ${i + 1} lacks its title`);
      });
      if (!xml.at(-1)?.includes(AI_LABEL.uz)) failures.push('flow: the last slide is not the AI label');
    } catch (error) {
      failures.push(`flow: the saved file does not unzip (${error instanceof Error ? error.message : 'unknown'})`);
    }
    await tab.waitForSelector('#studio-root [data-studio-download="saved"]', { timeout: 10_000 }).catch(() => failures.push('flow: the download block never said saved'));

    // A second deck the same day: /me says none left, so the limit shows at once
    // (no Turnstile, no start), and the first deck stays on the page.
    const firstDeckCalls = calls.length;
    await tab.click('#studio-root button[type="submit"]');
    await tab.waitForSelector('#studio-root [data-studio-message="free_limit"]', { timeout: 10_000 }).catch(() => failures.push('again: no free_limit message'));
    const again = calls.slice(firstDeckCalls);
    if (!sameJson(again.map((call) => `${call.method} ${call.path}`), ['GET me'])) failures.push(`again: calls ${JSON.stringify(again.map((call) => call.path))}, expected only GET me`);
    const afterLimit = await tab.evaluate(() => ({
      slides: document.querySelectorAll('#studio-root [data-studio-preview] li[data-slide]').length,
      message: document.querySelector('#studio-root [data-studio-message]')?.textContent ?? '',
      widgets: ((window as unknown as { __turnstile?: { rendered: unknown[] } }).__turnstile?.rendered ?? []).length,
    }));
    if (afterLimit.slides !== 6) failures.push('again: the first deck left the page');
    if (!afterLimit.message.includes('05:00')) failures.push(`again: the limit message lacks the reset time: ${afterLimit.message}`);
    if (afterLimit.widgets !== 2) failures.push('again: Turnstile ran for a start that could not happen');
    for (const violation of await cspViolations(tab)) failures.push(`flow: CSP violation: ${violation}`);
    await flowContext.close();

    // --- in-app ----------------------------------------------------------------------
    const inAppContext = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54',
    });
    const inApp = await inAppContext.newPage();
    await watch(inApp, 'in-app', failures);
    server.requests.length = 0;
    await inApp.goto(server.origin + uzPage, { waitUntil: 'load' });
    await inApp.waitForSelector('#studio-root [data-studio-inapp]', { timeout: 10_000 }).catch(() => failures.push('in-app: no «Brauzerda oching» notice'));
    const noticeBeforeSubmit = await inApp.evaluate(() => {
      const notice = document.querySelector('#studio-root [data-studio-inapp]');
      const submit = document.querySelector('#studio-root button[type="submit"]');
      return !!notice && !!submit && (notice.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    if (!noticeBeforeSubmit) failures.push('in-app: the notice does not stand before the submit button');
    for (const request of unexpectedLoadRequests(server.requests, pageFiles(uzPage))) failures.push(`in-app: unexpected request on load: ${request}`);
    await inAppContext.close();

    // --- pages (/api/* cut off) -------------------------------------------------------------
    const pages = await checkClosedApi(browser, server.origin, studioPages, failures, (target) => (target.html === null ? 'dist' : 'memory'));

    return {
      status: failures.length ? 'fail' : 'pass',
      viewport: VIEWPORT,
      studio,
      control,
      hydrate,
      flow: { apiCalls: calls.map((call) => `${call.method} ${call.path} @${call.at}ms`), turnstile, download: report, seconds },
      inApp: { noticeBeforeSubmit },
      pages,
      failures,
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

async function main(): Promise<void> {
  const originFlag = process.argv.indexOf('--origin');
  if (originFlag > 0) {
    const origin = process.argv[originFlag + 1] ?? '';
    if (!/^https?:\/\/[^/]+\/?$/.test(origin)) throw new Error('--origin takes a site origin, e.g. https://gptbot.uz');
    const report = await checkOrigin(origin);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'pass') process.exitCode = 1;
    return;
  }
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

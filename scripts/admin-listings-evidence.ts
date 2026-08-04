/**
 * Visual evidence for ADMIN-3A, captured the same way ADMIN-UX-1's was: the
 * system Chrome driven through `playwright-core`, which ships no browser
 * binaries of its own. The browser pane in this environment does not composite
 * frames, so `computer{action:"screenshot"}` is not an option.
 *
 * Reads a running fixture build and refuses any origin that is not localhost.
 * It never touches production and never reads production data.
 *
 *   npm --prefix apps/bormi-admin run dev      # VITE_ADMIN_FIXTURES=1
 *   npm run admin:listings-evidence
 *
 * Heights are set per shot rather than through Playwright's `fullPage`, which
 * cannot work against this shell: it keeps `body { overflow: hidden }` and
 * scrolls `#bormi-admin-main`, so the page is always exactly one viewport tall
 * and a full-page capture silently returns the fold. A taller viewport is the
 * honest substitute — the same layout, given room to finish — and one shot is
 * deliberately taken at 800px to show what the fold actually looks like.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.ADMIN_EVIDENCE_BASE ?? 'http://localhost:5183';
const OUT_DIR =
  process.env.ADMIN_EVIDENCE_OUT ??
  path.join('docs', 'admin', 'evidence', 'admin-3a-20260804');

function assertLocal(base: string): void {
  const { hostname } = new URL(base);
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(
      `refusing to run against ${hostname}: this captures fixtures, not production`,
    );
  }
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter((p): p is string => Boolean(p));

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error('no system Chrome found; set CHROME_PATH');
  return found;
}

/** Vite serves the app under a base of `/admin/`; `/admin` is a 404. */
const ENTRY = '/admin/';

type Shot = {
  slug: string;
  route: string;
  width: number;
  height: number;
  theme: 'dark' | 'light';
  /** Runs after the route settles, before the screenshot. */
  act?: (page: Page) => Promise<void>;
};

/**
 * `MEDIA` and `DETAIL` are resolved at run time from the list itself, so the
 * detail shots point at rows that exist rather than at ids typed in here.
 */
const DETAIL = '@detail';
const MEDIA = '@detail-with-media';

const SHOTS: Shot[] = [
  // The listings screen, both themes, tall enough to finish.
  { slug: 'listings-1280-dark', route: '/admin/listings', width: 1280, height: 2200, theme: 'dark' },
  { slug: 'listings-1280-light', route: '/admin/listings', width: 1280, height: 2200, theme: 'light' },
  // The fold at a real desktop height, which is what a reader actually opens.
  { slug: 'listings-1280-fold', route: '/admin/listings', width: 1280, height: 800, theme: 'dark' },
  // Filters actually applied — the server (here, the fixture) narrowed these.
  {
    slug: 'listings-filtered',
    route: '/admin/listings?status=published&quality=incomplete',
    width: 1280, height: 2200, theme: 'dark',
  },
  // A filter combination that matches nothing, which is a different empty
  // state from a catalogue that has nothing in it.
  {
    slug: 'listings-empty-filtered',
    route: '/admin/listings?status=archived&quality=good&media=without',
    width: 1280, height: 1100, theme: 'dark',
  },
  // Search, to show the box narrows the whole catalogue rather than the page.
  {
    slug: 'listings-search',
    route: '/admin/listings?q=%D1%80%D1%8E%D0%BA%D0%B7%D0%B0%D0%BA',
    width: 1280, height: 1400, theme: 'dark',
  },
  { slug: 'listing-detail-1280-dark', route: DETAIL, width: 1280, height: 1200, theme: 'dark' },
  { slug: 'listing-detail-1280-light', route: DETAIL, width: 1280, height: 1200, theme: 'light' },
  // A card that has images, so the gallery and its fallbacks are visible.
  { slug: 'listing-detail-media', route: MEDIA, width: 1280, height: 1300, theme: 'dark' },
  { slug: 'categories-1280-dark', route: '/admin/categories', width: 1280, height: 1100, theme: 'dark' },
  { slug: 'categories-1280-light', route: '/admin/categories', width: 1280, height: 1100, theme: 'light' },
  { slug: 'listings-768', route: '/admin/listings', width: 768, height: 1400, theme: 'dark' },
  // At 320 the table is replaced by cards and the filter panel starts closed.
  { slug: 'listings-320-cards', route: '/admin/listings', width: 320, height: 1000, theme: 'dark' },
  {
    slug: 'listings-320-filters-open',
    route: '/admin/listings',
    width: 320, height: 1400, theme: 'dark',
    act: async (page) => {
      await page.getByText('Поиск и фильтры').click();
      await page.waitForTimeout(300);
    },
  },
  { slug: 'listing-detail-320', route: MEDIA, width: 320, height: 1800, theme: 'dark' },
  // 200% zoom is a halved CSS viewport at dsf 2, as in the ADMIN-UX-1 audit.
  { slug: 'zoom200-listings', route: '/admin/listings', width: 640, height: 400, theme: 'dark' },
  { slug: 'zoom200-categories', route: '/admin/categories', width: 640, height: 400, theme: 'dark' },
  { slug: 'zoom200-listing-detail', route: DETAIL, width: 640, height: 400, theme: 'dark' },
];

type Measurement = Record<string, unknown>;

async function measure(page: Page): Promise<Measurement> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const scrollers = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((el) => {
      const style = getComputedStyle(el);
      return /auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    });
    const horizontal = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((el) => {
      const style = getComputedStyle(el);
      return /auto|scroll/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    });
    const nav = document.querySelector<HTMLElement>('nav,[role="navigation"]');
    const header = document.querySelector<HTMLElement>('header,[role="banner"]');
    const main = document.getElementById('bormi-admin-main');
    // Every control a finger has to hit, measured rather than asserted.
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('a[href], button, select, input, summary'),
    ).filter((el) => el.offsetParent !== null);
    const small = controls.filter((el) => {
      const box = el.getBoundingClientRect();
      return box.height < 44 && box.width < 44;
    });

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      pageScrollX: de.scrollWidth - de.clientWidth,
      pageScrollY: de.scrollHeight - de.clientHeight,
      mainVerticalScrollers: scrollers.map((el) => el.id || el.tagName.toLowerCase()),
      horizontalScrollContainers: horizontal.map((el) => el.className || el.tagName.toLowerCase()),
      headerHeight: header?.getBoundingClientRect().height ?? null,
      navDisplay: nav ? getComputedStyle(nav).display : null,
      mainTop: main?.getBoundingClientRect().top ?? null,
      h1: document.querySelector('h1')?.textContent?.trim() ?? null,
      tableCaptions: Array.from(document.querySelectorAll('caption')).map(
        (el) => el.textContent?.trim() ?? '',
      ),
      columnHeadersWithScope: Array.from(document.querySelectorAll('th')).every(
        (el) => el.getAttribute('scope') === 'col',
      ),
      controlsBelow44: small.map((el) => el.textContent?.trim().slice(0, 30) ?? el.tagName),
      rowsRendered: document.querySelectorAll('tbody tr').length,
      cardsRendered: document.querySelectorAll('ul > li').length,
      // Nothing on a read-only screen may offer a write.
      writeControls: Array.from(document.querySelectorAll('button, a')).filter((el) =>
        /опубликовать|снять с публикации|в архив|удалить|изменить|редактировать/i
          .test(el.textContent ?? ''),
      ).length,
      syntheticNoticeVisible: Array.from(document.querySelectorAll('*')).some(
        (el) => /SYNTHETIC/i.test(el.textContent ?? '')
          && (el as HTMLElement).offsetParent !== null,
      ),
    };
  });
}

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((value) => {
    localStorage.setItem('bormi_admin_theme', value);
    document.documentElement.classList.toggle('dark', value === 'dark');
  }, theme);
}

async function main(): Promise<void> {
  assertLocal(BASE);
  await mkdir(OUT_DIR, { recursive: true });

  const executablePath = findChrome();
  console.log(`chrome: ${executablePath}\nbase:   ${BASE}\nout:    ${OUT_DIR}\n`);

  const browser: Browser = await chromium.launch({ executablePath, headless: true });
  const measurements: Record<string, Measurement> = {};
  const written: string[] = [];
  const resolved: Record<string, string> = {};

  try {
    // Resolve real listing ids from the list itself: one row of any kind, and
    // one that actually carries images, so the gallery shot is not an empty
    // state that happened to be first.
    {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 2200 }, deviceScaleFactor: 1, locale: 'ru-RU',
      });
      const page = await context.newPage();
      await page.goto(`${BASE}${ENTRY}`, { waitUntil: 'domcontentloaded' });
      await page.goto(`${BASE}/admin/listings`, { waitUntil: 'networkidle' });
      await page.waitForSelector('tbody tr', { timeout: 15_000 });
      // No named helper inside `evaluate`: tsx compiles this file with
      // `keepNames`, which rewrites a declared function into a `__name(...)`
      // call, and `__name` does not exist in the page. Everything here stays
      // an inline expression for that reason.
      const found = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const withMedia = rows.find((row) => !/без фотографии/i.test(row.textContent ?? ''));
        return {
          any: rows[0]
            ?.querySelector<HTMLAnchorElement>('a[href*="/listings/"]')
            ?.getAttribute('href') ?? '',
          media: withMedia
            ?.querySelector<HTMLAnchorElement>('a[href*="/listings/"]')
            ?.getAttribute('href') ?? '',
        };
      });
      const absolute = (href: string) => (href.startsWith('/admin') ? href : `/admin${href}`);
      resolved[DETAIL] = absolute(found.any);
      resolved[MEDIA] = found.media ? absolute(found.media) : absolute(found.any);
      console.log(`detail: ${resolved[DETAIL]}\nmedia:  ${resolved[MEDIA]}`);
      await context.close();
    }

    for (const shot of SHOTS) {
      const route = resolved[shot.route] ?? shot.route;
      const context = await browser.newContext({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: 2,
        colorScheme: shot.theme,
        locale: 'ru-RU',
      });
      const page = await context.newPage();
      await page.goto(`${BASE}${ENTRY}`, { waitUntil: 'domcontentloaded' });
      await setTheme(page, shot.theme);
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await setTheme(page, shot.theme);
      await page.waitForSelector('h1', { timeout: 15_000 });
      await page.waitForTimeout(500);
      if (shot.act) await shot.act(page);

      const file = path.join(OUT_DIR, `${shot.slug}.png`);
      await page.screenshot({ path: file });
      written.push(file);
      measurements[shot.slug] = { route, theme: shot.theme, ...(await measure(page)) };
      await context.close();
    }
  } finally {
    await browser.close();
  }

  await writeFile(
    path.join(OUT_DIR, 'measurements.json'),
    `${JSON.stringify({
      capturedFrom: BASE,
      chrome: executablePath,
      note: 'Synthetic fixtures. No production data was read and nothing was deployed.',
      screenshots: written.map((f) => path.basename(f)).sort(),
      measurements,
    }, null, 2)}\n`,
    'utf8',
  );
  console.log(`\n${written.length} screenshots + measurements.json written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

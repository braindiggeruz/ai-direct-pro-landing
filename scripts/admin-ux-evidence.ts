/**
 * Capture the visual evidence for the Bormi admin panel that ADMIN-UX-1 could
 * not take: the browser pane in that session was not compositing frames, so
 * every claim in BORMI_ADMIN_UX_AUDIT.md rests on a DOM measurement and none on
 * a picture.
 *
 * This drives the *system* Chrome through `playwright-core`. It deliberately
 * does not download a browser: `playwright-core` ships no binaries, and the
 * panel is reviewed in the same engine the owner uses.
 *
 * It reads a running fixture build. It never touches production, never reads
 * production data, and refuses to run against anything but a local origin.
 *
 *   npm --prefix apps/bormi-admin run dev      # VITE_ADMIN_FIXTURES=1
 *   npx tsx scripts/admin-ux-evidence.ts
 *
 * Output: docs/admin/evidence/admin-ux1-<date>/*.png plus measurements.json.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.ADMIN_EVIDENCE_BASE ?? 'http://localhost:5183';
const OUT_DIR =
  process.env.ADMIN_EVIDENCE_OUT ??
  path.join('docs', 'admin', 'evidence', 'admin-ux1-20260804');

/** The panel is only ever reviewed locally, against invented data. */
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
  if (!found) {
    throw new Error(
      `no system Chrome found. Set CHROME_PATH. Looked in:\n  ${CHROME_CANDIDATES.join('\n  ')}`,
    );
  }
  return found;
}

type Surface = { slug: string; route: string; title: string };

/**
 * Vite serves this app under a base of `/admin/`, so the entry needs the
 * trailing slash: `/admin` is a 404 from the dev server, not a route.
 */
const SURFACES: Surface[] = [
  { slug: 'command-center', route: '/admin/', title: 'Командный центр' },
  { slug: 'access', route: '/admin/access', title: 'Магазины и доступы' },
  { slug: 'audit', route: '/admin/audit', title: 'Аудит' },
  { slug: 'system', route: '/admin/system', title: 'Состояние системы' },
];

const ENTRY = SURFACES[0].route;

/** Widths the audit already measured, so the pictures line up with the table. */
const WIDTHS = [320, 768, 1024, 1280] as const;

type Measurement = Record<string, unknown>;

/**
 * What the audit asserted without a picture. Measured again here so the
 * screenshot and the number come from the same page load.
 */
async function measure(page: Page): Promise<Measurement> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const scrollRegions = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
      (el) => {
        const style = getComputedStyle(el);
        const scrolls = /auto|scroll/.test(style.overflowY);
        return scrolls && el.scrollHeight > el.clientHeight + 1;
      },
    );
    const header = document.querySelector<HTMLElement>('header,[role="banner"]');
    const nav = document.querySelector<HTMLElement>('nav,[role="navigation"]');
    const main = document.getElementById('bormi-admin-main');
    const navStyle = nav ? getComputedStyle(nav) : null;

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      pageScrollX: de.scrollWidth - de.clientWidth,
      pageScrollY: de.scrollHeight - de.clientHeight,
      verticalScrollRegions: scrollRegions.map((el) => el.id || el.tagName.toLowerCase()),
      headerHeight: header?.getBoundingClientRect().height ?? null,
      navDisplay: navStyle?.display ?? null,
      navWidth: nav?.getBoundingClientRect().width ?? null,
      mainTop: main?.getBoundingClientRect().top ?? null,
      mainWidth: main?.getBoundingClientRect().width ?? null,
      h1: document.querySelector('h1')?.textContent?.trim() ?? null,
      // The panel must never stop saying the data is invented.
      syntheticNoticeVisible: Array.from(document.querySelectorAll('*')).some(
        (el) =>
          /SYNTHETIC|Синтетические/i.test(el.textContent ?? '') &&
          (el as HTMLElement).offsetParent !== null,
      ),
    };
  });
}

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem('bormi_admin_theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
}

async function open(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 15_000 });
  // The freshness label runs on a timer; let one tick land before capturing.
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string, fullPage = false): Promise<string> {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  return file;
}

async function main(): Promise<void> {
  assertLocal(BASE);
  await mkdir(OUT_DIR, { recursive: true });

  const executablePath = findChrome();
  console.log(`chrome:  ${executablePath}`);
  console.log(`base:    ${BASE}`);
  console.log(`out:     ${OUT_DIR}\n`);

  const browser: Browser = await chromium.launch({ executablePath, headless: true });
  const measurements: Record<string, Measurement> = {};
  const written: string[] = [];

  try {
    // 1. Every surface, both themes, at the desktop width the audit used.
    for (const theme of ['dark', 'light'] as const) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        colorScheme: theme,
        locale: 'ru-RU',
      });
      const page = await context.newPage();
      await page.goto(`${BASE}${ENTRY}`, { waitUntil: 'domcontentloaded' });
      await setTheme(page, theme);

      for (const surface of SURFACES) {
        await open(page, surface.route);
        await setTheme(page, theme);
        await page.waitForTimeout(200);
        written.push(await shot(page, `${surface.slug}-1280-${theme}`, true));
        measurements[`${surface.slug}-1280-${theme}`] = await measure(page);
      }
      await context.close();
    }

    // 2. The shell at every width the audit tabulated. Dark only: the widths
    //    prove layout, and the themes are already proven above.
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
        locale: 'ru-RU',
      });
      const page = await context.newPage();
      await page.goto(`${BASE}${ENTRY}`, { waitUntil: 'domcontentloaded' });
      await setTheme(page, 'dark');
      await open(page, ENTRY);
      written.push(await shot(page, `shell-${width}`));
      measurements[`shell-${width}`] = await measure(page);
      await context.close();
    }

    // 3. The mobile sheet open — the surface with dialog semantics and a focus
    //    trap, which the audit measured but could not show.
    {
      const context = await browser.newContext({
        viewport: { width: 320, height: 800 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
        locale: 'ru-RU',
      });
      const page = await context.newPage();
      await page.goto(`${BASE}${ENTRY}`, { waitUntil: 'domcontentloaded' });
      await setTheme(page, 'dark');
      await open(page, ENTRY);
      await page.getByRole('button', { name: 'Открыть меню' }).click();
      await page.waitForTimeout(400);
      written.push(await shot(page, 'shell-320-sheet-open'));
      measurements['shell-320-sheet-open'] = {
        ...(await measure(page)),
        dialog: await page.evaluate(() => {
          const d = document.querySelector('[role="dialog"]');
          return d
            ? {
                role: d.getAttribute('role'),
                ariaModal: d.getAttribute('aria-modal'),
                focusInside: d.contains(document.activeElement),
              }
            : null;
        }),
      };
      await context.close();
    }

    // 4. The collapsed rail — 76px, and the audit's claim that items keep their
    //    accessible text when the label is gone.
    {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
        locale: 'ru-RU',
      });
      const page = await context.newPage();
      await page.goto(`${BASE}${ENTRY}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.setItem('bormi_admin_rail', '1'));
      await setTheme(page, 'dark');
      await open(page, ENTRY);
      written.push(await shot(page, 'shell-1280-rail-collapsed'));
      measurements['shell-1280-rail-collapsed'] = {
        ...(await measure(page)),
        railItemsKeepAccessibleName: await page.evaluate(() =>
          Array.from(document.querySelectorAll('nav a')).every(
            (a) => (a.textContent ?? '').trim().length > 0 || a.hasAttribute('aria-label'),
          ),
        ),
      };
      await context.close();
    }

    // 5. 200% zoom — listed as unmeasured in the audit. Browser zoom halves the
    //    CSS viewport, so 1280x800 physical at 200% is 640x400 CSS px at dsf 2.
    //    WCAG 1.4.10 wants no horizontal scroll and no lost content.
    for (const surface of SURFACES) {
      const context = await browser.newContext({
        viewport: { width: 640, height: 400 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
        locale: 'ru-RU',
      });
      const page = await context.newPage();
      await page.goto(`${BASE}${ENTRY}`, { waitUntil: 'domcontentloaded' });
      await setTheme(page, 'dark');
      await open(page, surface.route);
      written.push(await shot(page, `zoom200-${surface.slug}`));
      measurements[`zoom200-${surface.slug}`] = {
        ...(await measure(page)),
        navigationReachable: await page.evaluate(() => {
          const nav = document.querySelector<HTMLElement>('nav,[role="navigation"]');
          const opener = Array.from(document.querySelectorAll('button')).find((b) =>
            /Открыть меню/.test(b.textContent ?? ''),
          );
          const navVisible = nav ? getComputedStyle(nav).display !== 'none' : false;
          return navVisible || Boolean(opener && (opener as HTMLElement).offsetParent);
        }),
      };
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    capturedFrom: BASE,
    chrome: executablePath,
    note: 'Synthetic fixtures. No production data was read and nothing was deployed.',
    screenshots: written.map((f) => path.basename(f)).sort(),
    measurements,
  };
  await writeFile(
    path.join(OUT_DIR, 'measurements.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`\n${written.length} screenshots + measurements.json written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

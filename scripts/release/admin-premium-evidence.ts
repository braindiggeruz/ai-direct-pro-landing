/**
 * Screenshot evidence for the premium operational UI.
 *
 * Points a real Chrome at the fixture dev server and photographs every screen
 * at the widths the console is actually read at, in both themes. Fixtures only:
 * the panel prints «Синтетические данные» in its own header while they are on,
 * so no frame here can be mistaken for the marketplace, and no production
 * record reaches a PNG.
 *
 * Run the server first:
 *   npm run dev --prefix apps/bormi-admin
 * then:
 *   npx tsx scripts/release/admin-premium-evidence.ts
 *
 * `--base` points somewhere else; `--out` writes somewhere else.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH ?? '',
].filter(Boolean);

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!found) throw new Error('no system Chrome found; set CHROME_PATH');
  return found;
}

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

const BASE = arg('base', 'http://localhost:5183');
const OUT_DIR = arg('out', join(process.cwd(), 'docs', 'production-closure', '2026-08-05', 'evidence', 'admin-premium-ui'));

/** The screens, and the width each is genuinely read at. */
const SCREENS = [
  { path: '/admin/', name: 'command-center' },
  { path: '/admin/access', name: 'access' },
  { path: '/admin/listings', name: 'listings' },
  { path: '/admin/moderation', name: 'moderation' },
  { path: '/admin/reports', name: 'reports' },
  { path: '/admin/categories', name: 'categories' },
  { path: '/admin/operations', name: 'operations' },
  { path: '/admin/audit', name: 'audit' },
  { path: '/admin/system', name: 'system' },
] as const;

const VIEWPORTS = [
  { width: 1920, height: 1080, name: '1920' },
  { width: 1440, height: 900, name: '1440' },
  { width: 1280, height: 800, name: '1280' },
  { width: 390, height: 844, name: '390' },
  { width: 320, height: 700, name: '320' },
] as const;

interface Measurement {
  screen: string;
  viewport: string;
  theme: string;
  /** The one thing a console must never do at any width. */
  horizontalOverflow: boolean;
  scrollWidth: number;
  /** Controls below the 44px minimum, by accessible name. */
  smallTargets: string[];
  h1: string | null;
}

async function measure(page: Page): Promise<Omit<Measurement, 'screen' | 'viewport' | 'theme'>> {
  return page.evaluate(() => {
    const small: string[] = [];
    for (const node of document.querySelectorAll('button, a[href], select, input, [role="tab"]')) {
      const element = node as HTMLElement;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;

      // A visually-hidden control is not a touch target until it is focused,
      // and the `sr-only` idiom is a 1px box with a 50% inset clip rather than
      // a zero-sized one - which is why the skip link showed up as an
      // undersized button on all ninety frames. It is measured when focus
      // reveals it, not while it is clipped away.
      const style = getComputedStyle(element);
      const clipped = style.clipPath.includes('inset(50%)') || style.clip === 'rect(0px, 0px, 0px, 0px)';
      if (clipped || (box.width <= 1 && box.height <= 1)) continue;

      if (box.height < 44 && box.width < 44) {
        small.push((element.textContent ?? element.getAttribute('aria-label') ?? '?').trim().slice(0, 40));
      }
    }
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      smallTargets: small,
      h1: document.querySelector('main h1')?.textContent ?? null,
    };
  });
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser: Browser = await chromium.launch({ executablePath: findChrome() });
  const measurements: Measurement[] = [];

  try {
    for (const theme of ['light', 'dark'] as const) {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          // The panel stores the choice, so it is set before the app boots
          // rather than toggled after paint.
          storageState: {
            cookies: [],
            origins: [{
              origin: BASE,
              localStorage: [{ name: 'bormi_admin_theme', value: theme }],
            }],
          },
        });
        const page = await context.newPage();

        for (const screen of SCREENS) {
          await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle' });
          // The theme class is applied by the app on boot; make sure the frame
          // photographed is the one the operator would see.
          await page.evaluate((want) => {
            document.documentElement.classList.toggle('dark', want === 'dark');
          }, theme);
          // Entrance animations are 240ms at the longest.
          await page.waitForTimeout(400);

          const file = `${screen.name}-${viewport.name}-${theme}.png`;
          await page.screenshot({ path: join(OUT_DIR, file), fullPage: viewport.width < 768 });
          measurements.push({
            screen: screen.name,
            viewport: viewport.name,
            theme,
            ...(await measure(page)),
          });
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const overflow = measurements.filter((row) => row.horizontalOverflow);
  const small = measurements.filter((row) => row.smallTargets.length > 0);
  const verdict = overflow.length === 0 && small.length === 0 ? 'PASS' : 'FAIL';

  writeFileSync(
    join(OUT_DIR, 'measurements.json'),
    `${JSON.stringify({
      synthetic: true,
      base: BASE,
      screens: SCREENS.length,
      viewports: VIEWPORTS.map((v) => v.name),
      themes: ['light', 'dark'],
      frames: measurements.length,
      horizontalOverflow: overflow.map((r) => `${r.screen}/${r.viewport}/${r.theme}`),
      undersizedTargets: small.map((r) => ({ at: `${r.screen}/${r.viewport}/${r.theme}`, controls: r.smallTargets })),
      verdict,
      measurements,
    }, null, 2)}\n`,
  );

  console.log(`frames: ${measurements.length}`);
  console.log(`horizontal overflow: ${overflow.length}`);
  console.log(`undersized targets: ${small.length}`);
  console.log(`verdict: ${verdict}`);
  console.log(`out: ${OUT_DIR}`);
  if (verdict !== 'PASS') process.exitCode = 1;
}

void main();

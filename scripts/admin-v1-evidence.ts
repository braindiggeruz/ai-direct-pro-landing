/**
 * Visual evidence for Bormi Admin v1, captured the way ADMIN-UX-1 and ADMIN-3A
 * captured theirs: the system Chrome driven through `playwright-core`, which
 * ships no browser binaries of its own.
 *
 * ## Why this one intercepts the network instead of using the fixture build
 *
 * ADMIN-3A's evidence ran against `VITE_ADMIN_FIXTURES=1`, where the client
 * answers its own reads. That cannot show a command: under fixtures
 * `runListingCommand` refuses outright rather than pretending to succeed, which
 * is the correct behaviour and the reason a fixture run cannot photograph a
 * pending state, a successful transition or a 409.
 *
 * So this runs the panel in its normal mode and answers every `/api/admin/**`
 * request from Playwright with a synthetic payload. Nothing reaches a server:
 * the interception is installed before the first navigation and refuses to run
 * against any origin that is not localhost. The session token planted in
 * storage is a literal placeholder string, not a credential — every request
 * carrying it is answered by this script.
 *
 *   npm --prefix apps/bormi-admin run dev:stub    # port 5184
 *   ADMIN_EVIDENCE_BASE=http://localhost:5184 npm run admin:v1-evidence
 *
 * `dev:stub` is `vite --mode stub`. Fixtures are off there for a reason that
 * needs no committed env file: `VITE_ADMIN_FIXTURES=1` lives in
 * `.env.development.local`, which Vite loads only in development mode, and the
 * repository refuses to commit any `.env.*`. In `stub` mode the variable is
 * simply absent, so `FIXTURE_MODE` folds to false and every read goes to the
 * network — where this script answers it.
 *
 * Heights are set per shot rather than through Playwright's `fullPage`: the
 * shell keeps `body { overflow: hidden }` and scrolls `#bormi-admin-main`, so a
 * full-page capture silently returns the fold.
 */

import { chromium, type Browser, type Page, type Route } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  syntheticAudit,
  syntheticCategories,
  syntheticListing,
  syntheticListings,
  syntheticOrder,
  syntheticOrders,
  syntheticOverview,
  syntheticQuestion,
  syntheticQuestions,
  syntheticStores,
} from '../apps/bormi-admin/src/lib/fixtures';

const BASE = process.env.ADMIN_EVIDENCE_BASE ?? 'http://localhost:5183';
const STAMP = process.env.ADMIN_EVIDENCE_STAMP ?? '20260804';
const OUT_DIR =
  process.env.ADMIN_EVIDENCE_OUT ??
  path.join('docs', 'admin', 'evidence', `admin-v1-${STAMP}`);

/** A placeholder, not a credential. Every request that carries it is stubbed. */
const PLACEHOLDER_SESSION = 'synthetic-session-placeholder-not-a-credential';

function assertLocal(base: string): void {
  const { hostname } = new URL(base);
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(
      `refusing to run against ${hostname}: this captures synthetic data, not production`,
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

const ENTRY = '/admin/';

/** The listing ids the stub serves, one per status. */
const DRAFT_ID = 'synthetic-listing-draft';
const PUBLISHED_ID = 'synthetic-listing-published';
const ARCHIVED_ID = 'synthetic-listing-archived';

type CommandMode = 'applied' | 'conflict' | 'slow';

interface StubOptions {
  /** How a command answers, when one is sent at all. */
  command?: CommandMode;
  /** Answer every read with this status instead of 200. */
  readStatus?: 401 | 403;
}

function listingDetail(id: string, status: string, version: number): unknown {
  const base = syntheticListing(id);
  // The draft is the card the publish action is photographed against, so it has
  // to be publishable — the domain refuses a publish with no category. The
  // buyer preview is corrected alongside it: a screenshot that showed the card
  // categorised on one side and uncategorised on the other would be evidence of
  // a bug that does not exist.
  const category = base.listing.category_name ?? 'Синтетическая категория';
  return {
    ...base,
    listing: {
      ...base.listing,
      id,
      status,
      version,
      category_name: category,
      preview: { ...base.listing.preview, category },
    },
  };
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    headers: { 'Cache-Control': 'no-store', 'x-request-id': 'req_synthetic' },
    body: JSON.stringify(body),
  });
}

async function installStub(page: Page, options: StubOptions = {}): Promise<void> {
  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;

    if (options.readStatus && route.request().method() === 'GET') {
      const error = options.readStatus === 401 ? 'unauthenticated' : 'insufficient_role';
      return json(route, { error, request_id: 'req_synthetic' }, options.readStatus);
    }

    if (route.request().method() === 'POST') {
      const match = /\/api\/admin\/listings\/([^/]+)\/(publish|unpublish|archive)$/.exec(pathname);
      if (!match) return json(route, { error: 'method_not_allowed' }, 405);
      const [, id, command] = match;
      if (options.command === 'slow') {
        // Long enough to photograph «Выполняется…» and prove the button is
        // disabled while the server is thinking.
        await new Promise((resolve) => { setTimeout(resolve, 8_000); });
      }
      if (options.command === 'conflict') {
        return json(route, {
          outcome: 'conflict',
          listing: { id, status: 'draft', version: 7, store_id: 'synthetic-store' },
          request_id: 'req_synthetic',
        }, 409);
      }
      const next = command === 'publish' ? 'published' : (command === 'archive' ? 'archived' : 'draft');
      return json(route, {
        outcome: 'applied',
        listing: { id, status: next, version: 4, store_id: 'synthetic-store' },
        audit_event_id: 'oaudit_synthetic',
      });
    }

    if (pathname === '/api/admin/overview') return json(route, syntheticOverview());
    if (pathname === '/api/admin/categories') return json(route, syntheticCategories());
    if (pathname.startsWith('/api/admin/agents/stores')) return json(route, syntheticStores());
    if (pathname.startsWith('/api/admin/agents/audit')) {
      const audit = syntheticAudit();
      return json(route, {
        ...audit,
        // The listing verbs 0033 admits, shown in the trail they will appear in.
        events: [
          {
            event_id: 'oaudit_synthetic_publish',
            created_at: new Date(Date.now() - 3_600_000).toISOString(),
            actor_email: 'synthetic-owner@example.invalid',
            actor_role: 'platform_owner',
            action: 'listing.publish',
            target_type: 'product',
            target_id: DRAFT_ID,
            org_id: 'synthetic-org',
            reason_code: 'data_quality',
            request_id: 'req_synthetic',
          },
          {
            event_id: 'oaudit_synthetic_archive',
            created_at: new Date(Date.now() - 7_200_000).toISOString(),
            actor_email: 'synthetic-owner@example.invalid',
            actor_role: 'platform_owner',
            action: 'listing.archive',
            target_type: 'product',
            target_id: ARCHIVED_ID,
            org_id: 'synthetic-org',
            reason_code: 'policy_violation',
            request_id: 'req_synthetic',
          },
          ...audit.events,
        ],
      });
    }
    if (pathname.startsWith('/api/admin/listings/')) {
      const id = pathname.split('/')[4];
      if (pathname.includes('/media/')) return route.fulfill({ status: 404, body: '' });
      if (id === PUBLISHED_ID) return json(route, listingDetail(id, 'published', 3));
      if (id === ARCHIVED_ID) return json(route, listingDetail(id, 'archived', 5));
      return json(route, listingDetail(DRAFT_ID, 'draft', 3));
    }
    if (pathname === '/api/admin/listings') {
      return json(route, syntheticListings(25, 0, {}));
    }
    if (pathname.startsWith('/api/admin/orders/')) {
      return json(route, syntheticOrder(pathname.split('/')[4]));
    }
    if (pathname === '/api/admin/orders') {
      return json(route, syntheticOrders(25, 0, {}));
    }
    if (pathname.startsWith('/api/admin/questions/')) {
      return json(route, syntheticQuestion(pathname.split('/')[4]));
    }
    if (pathname === '/api/admin/questions') {
      return json(route, syntheticQuestions(25, 0, {}));
    }
    return json(route, { error: 'not_found', request_id: 'req_synthetic' }, 404);
  });
}

type Shot = {
  slug: string;
  route: string;
  width: number;
  height: number;
  theme: 'dark' | 'light';
  stub?: StubOptions;
  /** `redirect` waits for the panel to leave instead of for a heading. */
  settle?: 'heading' | 'redirect';
  /** Runs after the route settles, before the screenshot. */
  act?: (page: Page) => Promise<void>;
};

async function openCommand(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name }).click();
  await page.waitForTimeout(400);
}

const SHOTS: Shot[] = [
  // ── ADMIN-3B: the commands ────────────────────────────────────────────────
  {
    slug: 'listing-draft-actions',
    route: `/admin/listings/${DRAFT_ID}`,
    width: 1280, height: 1600, theme: 'dark',
  },
  {
    slug: 'listing-draft-actions-light',
    route: `/admin/listings/${DRAFT_ID}`,
    width: 1280, height: 1600, theme: 'light',
  },
  {
    slug: 'confirm-publish',
    route: `/admin/listings/${DRAFT_ID}`,
    width: 1280, height: 1200, theme: 'dark',
    act: (page) => openCommand(page, 'Опубликовать'),
  },
  {
    slug: 'confirm-unpublish',
    route: `/admin/listings/${PUBLISHED_ID}`,
    width: 1280, height: 1200, theme: 'dark',
    act: (page) => openCommand(page, 'Снять с публикации'),
  },
  {
    slug: 'confirm-archive-typed',
    route: `/admin/listings/${PUBLISHED_ID}`,
    width: 1280, height: 1300, theme: 'dark',
    act: (page) => openCommand(page, 'Переместить в архив'),
  },
  {
    slug: 'command-pending',
    route: `/admin/listings/${DRAFT_ID}`,
    width: 1280, height: 1200, theme: 'dark',
    stub: { command: 'slow' },
    act: async (page) => {
      await openCommand(page, 'Опубликовать');
      // Fire the command and photograph the wait, without awaiting the answer.
      void page.getByRole('button', { name: 'Опубликовать' }).last().click();
      await page.waitForTimeout(1_200);
    },
  },
  {
    slug: 'command-applied',
    route: `/admin/listings/${DRAFT_ID}`,
    width: 1280, height: 1500, theme: 'dark',
    act: async (page) => {
      await openCommand(page, 'Опубликовать');
      await page.getByRole('button', { name: 'Опубликовать' }).last().click();
      await page.waitForTimeout(1_500);
    },
  },
  {
    slug: 'command-conflict-409',
    route: `/admin/listings/${DRAFT_ID}`,
    width: 1280, height: 1500, theme: 'dark',
    stub: { command: 'conflict' },
    act: async (page) => {
      await openCommand(page, 'Опубликовать');
      await page.getByRole('button', { name: 'Опубликовать' }).last().click();
      await page.waitForTimeout(1_500);
    },
  },
  {
    // An archived card: the domain has no way out, so the block says so and
    // offers nothing. Not a greyed-out button — no button.
    slug: 'listing-archived-no-actions',
    route: `/admin/listings/${ARCHIVED_ID}`,
    width: 1280, height: 1400, theme: 'dark',
  },
  {
    slug: 'listing-actions-320',
    route: `/admin/listings/${DRAFT_ID}`,
    width: 320, height: 1800, theme: 'dark',
  },
  {
    slug: 'confirm-publish-320',
    route: `/admin/listings/${DRAFT_ID}`,
    width: 320, height: 1400, theme: 'dark',
    act: (page) => openCommand(page, 'Опубликовать'),
  },
  {
    slug: 'zoom200-listing-actions',
    route: `/admin/listings/${DRAFT_ID}`,
    width: 640, height: 400, theme: 'dark',
  },

  // ── ADMIN-4A: operations ──────────────────────────────────────────────────
  { slug: 'orders-1280-dark', route: '/admin/operations?tab=orders', width: 1280, height: 1400, theme: 'dark' },
  { slug: 'orders-1280-light', route: '/admin/operations?tab=orders', width: 1280, height: 1400, theme: 'light' },
  { slug: 'orders-fold-800', route: '/admin/operations?tab=orders', width: 1280, height: 800, theme: 'dark' },
  {
    slug: 'orders-filtered',
    route: '/admin/operations?tab=orders&stage=placed',
    width: 1280, height: 1200, theme: 'dark',
  },
  { slug: 'questions-1280-dark', route: '/admin/operations?tab=questions', width: 1280, height: 1400, theme: 'dark' },
  { slug: 'questions-1280-light', route: '/admin/operations?tab=questions', width: 1280, height: 1400, theme: 'light' },
  {
    slug: 'order-detail',
    route: '/admin/operations/orders/synthetic-order-syn-1041',
    width: 1280, height: 1400, theme: 'dark',
  },
  {
    slug: 'question-detail',
    route: '/admin/operations/questions/synthetic-question-1',
    width: 1280, height: 1400, theme: 'dark',
  },
  { slug: 'orders-320-cards', route: '/admin/operations?tab=orders', width: 320, height: 1600, theme: 'dark' },
  { slug: 'questions-320-cards', route: '/admin/operations?tab=questions', width: 320, height: 1600, theme: 'dark' },
  { slug: 'order-detail-320', route: '/admin/operations/orders/synthetic-order-syn-1041', width: 320, height: 1800, theme: 'dark' },
  { slug: 'zoom200-orders', route: '/admin/operations?tab=orders', width: 640, height: 400, theme: 'dark' },
  { slug: 'zoom200-questions', route: '/admin/operations?tab=questions', width: 640, height: 400, theme: 'dark' },

  // ── The audit trail carrying the new verbs ────────────────────────────────
  { slug: 'audit-listing-actions', route: '/admin/audit', width: 1280, height: 1400, theme: 'dark' },

  // ── Refusals ──────────────────────────────────────────────────────────────
  {
    slug: 'forbidden-403',
    route: '/admin/', width: 1280, height: 700, theme: 'dark',
    stub: { readStatus: 403 },
  },
  {
    // An expired session is not a screen: `useQuery` hands the browser back to
    // the login that owns sessions. What is photographed is the panel leaving,
    // and `measurements.json` records the URL it left for.
    slug: 'expired-session-401',
    route: '/admin/', width: 1280, height: 700, theme: 'dark',
    stub: { readStatus: 401 },
    settle: 'redirect',
  },
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
    const main = document.getElementById('bormi-admin-main');
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('a[href], button, select, input, summary'),
    ).filter((el) => el.offsetParent !== null);
    const small = controls.filter((el) => {
      const box = el.getBoundingClientRect();
      return box.height < 44 && box.width < 44;
    });
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focused = document.activeElement as HTMLElement | null;

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      // A page that scrolls sideways at any width is a page that failed.
      pageScrollX: de.scrollWidth - de.clientWidth,
      pageScrollY: de.scrollHeight - de.clientHeight,
      mainVerticalScrollers: scrollers.map((el) => el.id || el.tagName.toLowerCase()),
      horizontalScrollContainers: horizontal.map((el) => el.className || el.tagName.toLowerCase()),
      mainTop: main?.getBoundingClientRect().top ?? null,
      h1: document.querySelector('h1')?.textContent?.trim() ?? null,
      // Table above md, cards below. Both are in the DOM at every width — one
      // of them is `display: none` — so this measures what is actually laid
      // out, not what was rendered.
      // No named helper here: tsx compiles this file with `keepNames`, which
      // rewrites a declared function into a `__name(...)` call, and `__name`
      // does not exist in the page. Everything stays an inline expression.
      mode: [
        Array.from(document.querySelectorAll('tbody tr'))
          .some((el) => (el as HTMLElement).offsetParent !== null),
        Array.from(document.querySelectorAll('ul.space-y-3 > li'))
          .some((el) => (el as HTMLElement).offsetParent !== null),
      ].map((on, index) => (on ? ['table', 'cards'][index] : '')).filter(Boolean).join('+') || 'none',
      rowsRendered: Array.from(document.querySelectorAll('tbody tr'))
        .filter((el) => (el as HTMLElement).offsetParent !== null).length,
      cardsRendered: Array.from(document.querySelectorAll('ul.space-y-3 > li'))
        .filter((el) => (el as HTMLElement).offsetParent !== null).length,
      controlsBelow44: small.map((el) => el.textContent?.trim().slice(0, 30) ?? el.tagName),
      // The defect this caught once: eight minimum-width columns pushed the row
      // action past the right edge of its scroll container, so the one control
      // on the row was reachable only by scrolling sideways. Measured rather
      // than eyeballed, at every width.
      rowActionsClipped: Array.from(document.querySelectorAll('tbody tr'))
        .filter((row) => (row as HTMLElement).offsetParent !== null)
        .filter((row) => {
          const link = row.querySelector('td:last-child a');
          const frame = row.closest('[class*="overflow"]') ?? document.body;
          if (!link) return false;
          return link.getBoundingClientRect().right
            > frame.getBoundingClientRect().right + 1;
        }).length,
      modal: dialog
        ? {
          open: true,
          label: dialog.getAttribute('aria-label'),
          modal: dialog.getAttribute('aria-modal'),
          focusInsideDialog: focused ? dialog.contains(focused) : false,
          focusedControl: focused?.textContent?.trim().slice(0, 40) ?? focused?.tagName ?? null,
        }
        : { open: false },
      tabs: Array.from(document.querySelectorAll('[role="tab"]')).map((el) => ({
        label: el.textContent?.trim() ?? '',
        selected: el.getAttribute('aria-selected'),
      })),
      // Nothing anywhere on the operations screens may offer a write.
      operationWriteControls: Array.from(document.querySelectorAll('button, a')).filter((el) =>
        /подтвердить|отменить заказ|ответить|закрыть обращение|вернуть деньги/i
          .test(el.textContent ?? ''),
      ).length,
      // And nothing anywhere may show a buyer.
      personalDataOnScreen: /\+998\d|@example\.invalid.{0,4}\+/.test(document.body.innerText)
        ? 'present'
        : 'absent',
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

  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: 2,
        colorScheme: shot.theme,
        locale: 'ru-RU',
      });
      const page = await context.newPage();
      await installStub(page, shot.stub ?? {});
      // The panel reads a session from storage before it renders anything. The
      // value is a placeholder and every request that carries it is answered by
      // the stub above.
      await context.addInitScript((token) => {
        localStorage.setItem('gptbot_admin_token', token as string);
      }, PLACEHOLDER_SESSION);

      await page.goto(`${BASE}${ENTRY}`, { waitUntil: 'domcontentloaded' });
      await setTheme(page, shot.theme);
      // Navigating to the entry a second time aborts the load that is already
      // in flight; the refusal shots are captured at the entry itself.
      if (shot.route !== ENTRY) {
        await page.goto(`${BASE}${shot.route}`, { waitUntil: 'networkidle' });
        await setTheme(page, shot.theme);
      }
      if (shot.settle === 'redirect') {
        await page.waitForURL((url) => !url.pathname.startsWith('/admin/'), { timeout: 20_000 });
      } else {
        await page.waitForSelector('h1', { timeout: 20_000 });
      }
      await page.waitForTimeout(600);
      if (shot.act) await shot.act(page);

      const file = path.join(OUT_DIR, `${shot.slug}.png`);
      await page.screenshot({ path: file });
      written.push(file);
      measurements[shot.slug] = {
        route: shot.route,
        theme: shot.theme,
        // 200% zoom is a halved CSS viewport at device scale 2, as in the
        // ADMIN-UX-1 audit; the shots named zoom200-* are exactly that.
        zoom: shot.slug.startsWith('zoom200') ? '200%' : '100%',
        landedOn: new URL(page.url()).pathname,
        ...(await measure(page)),
      };
      console.log(`  ${shot.slug}`);
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
      note:
        'Synthetic data served by Playwright interception. No production data was read, '
        + 'no request left the machine and nothing was deployed. The session value in '
        + 'storage is a placeholder string, not a credential.',
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

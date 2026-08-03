import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// ── Bormi Admin · the owner control centre built on TailAdmin ─────────────────
//
// Two things are being defended here, and they pull in opposite directions.
//
// One is that this panel adds no way to obtain anything. It has no login, no
// registration, no second backend, no D1 access and, in this slice, no write at
// all - every screen reads an endpoint that `requirePlatformRole` already
// guards. If that stops being true, something below fails.
//
// The other is that nothing it draws is invented. A dashboard is believed by
// default, so a fabricated number is worse than a missing one: the assertions
// about demo data, fake metrics and fixtures exist to keep the panel honest
// when it would be easier to look complete.

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

/** Source with prose removed, so assertions test code and not comments. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const APP = 'apps/bormi-admin/src/App.tsx';
const API = 'apps/bormi-admin/src/lib/api.ts';
const SHELL = 'apps/bormi-admin/src/components/AppShell.tsx';
const UI = 'apps/bormi-admin/src/components/ui.tsx';
const OVERVIEW_PAGE = 'apps/bormi-admin/src/pages/Overview.tsx';
const ACCESS_PAGE = 'apps/bormi-admin/src/pages/Access.tsx';
const AUDIT_PAGE = 'apps/bormi-admin/src/pages/Audit.tsx';
const SYSTEM_PAGE = 'apps/bormi-admin/src/pages/System.tsx';
const OVERVIEW_ROUTE = 'functions/api/admin/overview.ts';
const PACKAGE = 'apps/bormi-admin/package.json';
const INDEX_HTML = 'apps/bormi-admin/index.html';

const CLIENT_FILES = [APP, API, SHELL, UI, OVERVIEW_PAGE, ACCESS_PAGE, AUDIT_PAGE, SYSTEM_PAGE];

// ── What the panel is not ─────────────────────────────────────────────────────

test('admin: no TailAdmin demo route, widget or branding survives', async () => {
  for (const file of CLIENT_FILES) {
    // Comments are stripped: attribution to TailAdmin belongs in the source and
    // in the licence file, and an assertion that forbade the word everywhere
    // would forbid crediting it.
    const text = code(await source(file));
    for (const demo of [
      'TailAdmin', 'tailadmin', 'ecommerce', 'Ecommerce', 'lorem', 'Lorem',
      'signup', 'sign-up', 'SignUp', 'signin', 'SignIn',
      'FullCalendar', 'jvectormap', 'flatpickr', 'swiper', 'react-dnd', 'dropzone',
    ]) {
      assert.ok(!text.includes(demo), `${file} still carries ${demo}`);
    }
  }
  // Nor a demo image of any kind: the bundle ships no raster asset at all.
  const assets = await readdir(new URL('apps/bormi-admin/src/', ROOT));
  assert.ok(!assets.includes('images'), 'no image folder is copied from the template');
});

test('admin: there is no way to create an account or a session here', async () => {
  const app = code(await source(APP));
  const api = code(await source(API));
  // No form, no password field, no registration, no credential of any kind.
  for (const text of [app, api]) {
    assert.doesNotMatch(text, /type="password"|<form|register|createAccount|resetPassword/i);
  }
  // The session comes from the console that owns it, and 401 goes back there.
  assert.match(api, /const TOKEN_KEY = 'gptbot_admin_token'/);
  assert.match(api, /export const LOGIN_URL = '\/admin-tools\/login'/);
  assert.match(api, /localStorage\.getItem\(TOKEN_KEY\)/);
  // It is read. It is never written under a new key by this app.
  assert.doesNotMatch(api, /localStorage\.setItem/);
});

test('admin: the token never reaches a URL, a log or a second store', async () => {
  for (const file of CLIENT_FILES) {
    const text = code(await source(file));
    assert.doesNotMatch(text, /console\.(log|info|warn|debug|error)/, `${file} logs`);
    assert.doesNotMatch(text, /[?&](token|jwt|bearer|access_token)=/i, `${file} puts a token in a URL`);
    assert.doesNotMatch(text, /sessionStorage|document\.cookie|indexedDB/, `${file} opens another store`);
  }
  const api = code(await source(API));
  // The only place it appears is the Authorization header.
  const uses = [...api.matchAll(/bearer/gi)].length;
  assert.ok(uses > 0 && api.includes('headers.Authorization = `Bearer ${bearer}`'));
});

test('admin: the browser never reaches D1, and never talks to a third party', async () => {
  for (const file of CLIENT_FILES) {
    const text = code(await source(file));
    assert.doesNotMatch(text, /D1Database|\.prepare\(|db\.batch\(|FROM sotuvchi_/i, `${file} touches the database`);
    // Same-origin only: no absolute URL to anywhere, no analytics, no CDN.
    assert.doesNotMatch(text, /https?:\/\/(?!localhost)/, `${file} calls out`);
    assert.doesNotMatch(text, /gtag|dataLayer|analytics|Sentry|posthog|mixpanel/i, `${file} reports somewhere`);
  }
});

// ── Authority ────────────────────────────────────────────────────────────────

test('admin: the new endpoint is owner-only and read-only', async () => {
  const route = await source(OVERVIEW_ROUTE);
  assert.match(route, /withOwnerRole\('platform_owner'/);
  assert.match(route, /export const onRequestGet/);
  // Every other verb is refused by the shared helper rather than left to a default.
  for (const verb of ['Post', 'Put', 'Patch', 'Delete']) {
    assert.match(route, new RegExp(`export const onRequest${verb} = methodNotAllowed\\('GET'\\)`));
  }
  // A read that cannot write: no mutation reaches the batch.
  assert.doesNotMatch(code(route), /INSERT |UPDATE |DELETE |CREATE |ALTER /);
});

test('admin: the client treats its own checks as convenience, not control', async () => {
  const app = code(await source(APP));
  // Visibility comes from the server, not from a client-side guess.
  assert.match(app, /data\.rollout\.admin_v2/);
  assert.match(app, /adminApi\.overview\(\)/);
  // 401 leaves for the login; 403 says no rather than trying another door.
  assert.match(app, /error === 'forbidden' \|\| error === 'http_403'/);
  const query = code(await source('apps/bormi-admin/src/lib/useQuery.ts'));
  assert.match(query, /failure\.status === 401/);
  assert.match(query, /window\.location\.assign\(LOGIN_URL\)/);
  // Nothing decides access from a query string, a hash or storage.
  assert.doesNotMatch(app, /searchParams|location\.hash|localStorage\.getItem\('role'\)/);
});

test('admin: the rollout flag is a switch for a screen, never for a permission', async () => {
  const wrangler = await source('wrangler.toml');
  assert.match(wrangler, /BORMI_ADMIN_V2_ENABLED = "false"/);
  const types = await source('functions/_types.ts');
  assert.match(types, /BORMI_ADMIN_V2_ENABLED\?: string;/);
  const route = code(await source(OVERVIEW_ROUTE));
  // The flag is reported. It never gates the role check, which happens first.
  const guardIndex = route.indexOf("withOwnerRole('platform_owner'");
  const flagIndex = route.indexOf('BORMI_ADMIN_V2_ENABLED');
  assert.ok(guardIndex >= 0 && flagIndex > guardIndex, 'the role check comes first');
});

// ── Truthfulness ─────────────────────────────────────────────────────────────

test('admin: no metric is invented', async () => {
  const pages = await Promise.all(
    [OVERVIEW_PAGE, ACCESS_PAGE, SYSTEM_PAGE].map(async (file) => code(await source(file))),
  );
  for (const page of pages) {
    // The vocabulary of a dashboard that measures things it cannot measure.
    for (const invented of ['revenue', 'выручк', 'конверси', 'просмотр', 'retention', 'GMV']) {
      // Allowed only inside an explicit "we do not measure this" card.
      const mentioned = page.toLowerCase().includes(invented.toLowerCase());
      if (mentioned) {
        assert.match(page, /DataGap/, `a page mentions ${invented} without saying it is not measured`);
      }
    }
  }
  const overview = code(await source(OVERVIEW_PAGE));
  // Every number on the command centre comes from the response, not a literal.
  assert.doesNotMatch(overview, /value=\{?["']?\d{2,}/);
  assert.match(overview, /DataGap/);
});

test('admin: a metric that cannot be measured renders as absent, not as zero', async () => {
  const ui = code(await source(UI));
  assert.match(ui, /value === null/);
  assert.match(ui, /нет данных/);
  assert.match(ui, /export function DataGap/);
  const system = code(await source(SYSTEM_PAGE));
  // Deployment identity is the honest example: the Worker cannot read it.
  assert.match(system, /DataGap/);
  const route = code(await source(OVERVIEW_ROUTE));
  assert.match(route, /deployment: null/);
});

test('admin: fixtures are development-only and announce themselves', async () => {
  const api = code(await source(API));
  assert.match(api, /import\.meta\.env\.DEV\s*\r?\n?\s*&& import\.meta\.env\.VITE_ADMIN_FIXTURES === '1'/);
  const fixtures = await source('apps/bormi-admin/src/lib/fixtures.ts');
  assert.match(fixtures, /SYNTHETIC/);
  // Every fabricated string says so, so a screenshot can never be mistaken for
  // production data.
  assert.match(fixtures, /example\.invalid/);
  const overview = code(await source(OVERVIEW_PAGE));
  assert.match(overview, /FIXTURE_MODE \? \(/);
  assert.match(overview, /SYNTHETIC_NOTICE/);
});

test('admin: attention items with a count of zero are not items', async () => {
  const route = code(await source(OVERVIEW_ROUTE));
  const block = /const attention = \[[\s\S]*?\]\.filter\(Boolean\);/.exec(route)?.[0];
  assert.ok(block, 'attention block not found');
  // Each entry is guarded by its own count, and the list is compacted.
  assert.ok((block.match(/> 0 &&/g) ?? []).length >= 6);
  assert.match(block, /\.filter\(Boolean\)/);
});

// ── Privacy ──────────────────────────────────────────────────────────────────

test('admin: nothing identifying a person is fetched or rendered', async () => {
  const route = code(await source(OVERVIEW_ROUTE));
  // The endpoint selects no column that identifies anybody.
  for (const column of ['buyer_phone', 'buyer_name', 'buyer_address', 'external_id', 'initData']) {
    assert.ok(!route.includes(column), `overview selects ${column}`);
  }
  // Identities are counted, never listed.
  assert.match(route, /COUNT\(\*\) AS memberships/);
  assert.doesNotMatch(route, /SELECT [^;]*identity\.external_id/);
  // Naming a field in copy is how a screen explains that it does not show it.
  // What matters is whether anything reads one, so this asserts on access
  // rather than on the words.
  for (const file of CLIENT_FILES) {
    const text = code(await source(file));
    assert.doesNotMatch(
      text,
      /\.(telegram_id|telegramId|username|phone|buyer_phone|buyer_name|buyer_address|initData)\b/i,
      `${file} reads PII`,
    );
    assert.doesNotMatch(text, /\{\s*\w+\.(phone|username|telegram_id)\s*\}/i, `${file} renders PII`);
  }
});

test('admin: the binding ceremony is reported, never operated or exposed', async () => {
  const route = code(await source(OVERVIEW_ROUTE));
  // State only: a flag, whether the door is open, and how many codes exist.
  assert.match(route, /global_flag: bindingEnabled\(ctx\.env\)/);
  assert.match(route, /ceremony_open: bindingCeremonyOpen\(ctx\.env, now\)/);
  // Never the secret, never its digest.
  assert.doesNotMatch(route, /challenge_hash|canary|MARKET_OWNER_TELEGRAM_BINDING_CANARY/);
  const access = code(await source(ACCESS_PAGE));
  assert.doesNotMatch(access, /challenge_hash|canary|код привязки:/i);
  // The ceremony itself stays where its confirmations are.
  assert.match(access, /\/admin-tools\/agents\/stores/);
});

test('admin: the audit trail is read-only by construction', async () => {
  const audit = code(await source(AUDIT_PAGE));
  // The screen may say the trail cannot be edited; what it must not do is offer
  // a way. No mutating verb, no destructive handler.
  assert.doesNotMatch(audit, /method: '(POST|PUT|PATCH|DELETE)'|onDelete|handleDelete/i);
  const api = code(await source(API));
  // The client has exactly one verb.
  assert.doesNotMatch(api, /method: '(POST|PUT|PATCH|DELETE)'/);
  assert.match(api, /method: 'GET'/);
  // Payloads that could carry anything sensitive are never rendered.
  assert.doesNotMatch(audit, /before_json|after_json|request_id|idempotency/);
});

test('admin: raw status keys never reach a screen', async () => {
  const text = await source('apps/bormi-admin/src/lib/text.ts');
  for (const key of ['published', 'draft', 'archived', 'placed', 'cancelled', 'open', 'answered']) {
    assert.ok(text.includes(`${key}:`) || text.includes(`'${key}'`), `${key} has no translation`);
  }
  // And the pages go through the mapping rather than printing the key.
  for (const file of [OVERVIEW_PAGE, ACCESS_PAGE, AUDIT_PAGE]) {
    assert.match(code(await source(file)), /label\(/);
  }
});

// ── Data access shape ────────────────────────────────────────────────────────

test('admin: the command centre is one bounded request, not fifteen', async () => {
  const route = code(await source(OVERVIEW_ROUTE));
  assert.match(route, /db\.batch<Row>\(\[/);
  // Every recent list is capped, and the cap is one constant.
  assert.match(route, /const RECENT = \d+;/);
  const limits = [...route.matchAll(/LIMIT \$\{RECENT\}/g)].length;
  assert.ok(limits >= 3, 'recent lists must be bounded');
  // No unbounded select of a table that grows.
  assert.doesNotMatch(route, /SELECT \* FROM sotuvchi_products/);
  const overview = code(await source(OVERVIEW_PAGE));
  const calls = [...overview.matchAll(/adminApi\./g)].length;
  assert.equal(calls, 1, 'the command centre reads one endpoint');
});

test('admin: list reads are paginated by the server', async () => {
  const api = code(await source(API));
  assert.match(api, /stores: \(limit = 25, offset = 0\)/);
  assert.match(api, /audit: \(limit = 25, offset = 0\)/);
  assert.match(api, /limit=\$\{limit\}&offset=\$\{offset\}/);
});

test('admin: orders are counted through both of their status columns', async () => {
  const route = code(await source(OVERVIEW_ROUTE));
  // `status` alone reports every confirmed and completed order as merely placed.
  assert.match(route, /status = 'placed' AND fulfillment_status = 'none'/);
  assert.match(route, /status = 'placed' AND fulfillment_status = 'confirmed'/);
  assert.match(route, /fulfillment_status = 'done'/);
});

// ── Build, weight and dependencies ───────────────────────────────────────────

test('admin: the heavy half of TailAdmin was never installed', async () => {
  const pkg = JSON.parse(await source(PACKAGE)) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const rejected of [
    '@fullcalendar/core', '@fullcalendar/react', '@react-jvectormap/core',
    '@react-jvectormap/world', 'apexcharts', 'react-apexcharts', 'flatpickr',
    'swiper', 'react-dnd', 'react-dnd-html5-backend', 'react-dropzone',
    'react-helmet-async', 'tailwind-merge', 'clsx',
  ]) {
    assert.ok(!(rejected in all), `${rejected} was installed without a screen that needs it`);
  }
  // Runtime dependencies are the three Bormi already ships, at Bormi versions.
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['react', 'react-dom', 'react-router']);
  assert.equal(pkg.dependencies.react, '19.2.7');
  assert.equal(pkg.dependencies['react-router'], '8.3.0');
});

test('admin: it is an isolated app and leaves the rest of the repo alone', async () => {
  const rootPkg = JSON.parse(await source('package.json')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  // The root keeps Tailwind 3 and its own React. Nothing was upgraded for this.
  assert.match(rootPkg.devDependencies.tailwindcss, /^\^?3\./);
  assert.equal(rootPkg.dependencies.react, '19.2.7');
  // The Mini App design system is untouched: it has no Tailwind and gains none.
  const miniPkg = JSON.parse(await source('apps/market-mini-app/package.json')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.ok(!('tailwindcss' in { ...miniPkg.dependencies, ...miniPkg.devDependencies }));
  // And the panel builds into its own path rather than over anything.
  const config = await source('apps/bormi-admin/vite.config.ts');
  assert.match(config, /outDir: '\.\.\/\.\.\/dist\/admin'/);
  assert.match(config, /base: '\/admin\/'/);
});

test('admin: every screen is its own chunk', async () => {
  const app = code(await source(APP));
  for (const page of ['Overview', 'Access', 'Audit', 'System']) {
    assert.match(app, new RegExp(`const ${page} = lazy\\(\\(\\) => import\\('\\./pages/${page}'\\)\\)`));
  }
  assert.match(app, /<Suspense fallback=/);
});

// ── Interface ────────────────────────────────────────────────────────────────

test('admin: the page never scrolls sideways, the table does', async () => {
  const ui = code(await source(UI));
  // A grid or flex child sizes to its content unless told otherwise.
  assert.match(ui, /surface min-w-0/);
  assert.match(ui, /table-scroll/);
  const styles = await source('apps/bormi-admin/src/styles.css');
  assert.match(styles, /\.table-scroll \{\s*\r?\n\s*overflow-x: auto;/);
});

test('admin: navigation is a landmark, keyboard-reachable, and says where it is', async () => {
  const shell = await source(SHELL);
  assert.match(shell, /<nav/);
  assert.match(shell, /aria-label="Разделы панели"/);
  assert.match(shell, /aria-current=\{location\.pathname === item\.to \? 'page' : undefined\}/);
  assert.match(shell, /aria-expanded=\{open\}/);
  assert.match(shell, /aria-controls="bormi-admin-nav"/);
  // Escape closes the sheet, and focus moves into it when it opens.
  assert.match(shell, /event\.key === 'Escape'/);
  assert.match(shell, /closeButton\.current\?\.focus\(\)/);
  // Off-canvas is mount state, not a transform that can desynchronise.
  assert.match(shell, /open \? 'block' : 'hidden'/);
  assert.match(code(await source(SHELL)), /<main/);
});

test('admin: touch targets are large enough and icons are not emoji', async () => {
  const shell = await source(SHELL);
  const ui = await source(UI);
  const targets = [...shell.matchAll(/min-h-11/g)].length;
  assert.ok(targets >= 4, 'interactive controls carry a 44px minimum');
  assert.match(ui, /min-h-11/);
  // Icons are inline SVG. No icon font, no sprite request, no emoji as UI.
  assert.match(shell, /<svg/);
  for (const text of [shell, ui]) {
    assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'emoji used as an icon');
  }
});

test('admin: both themes are real, and the choice survives a reload', async () => {
  const styles = await source('apps/bormi-admin/src/styles.css');
  assert.match(styles, /@custom-variant dark/);
  assert.match(styles, /\.dark \{/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /:focus-visible \{/);
  const html = await source(INDEX_HTML);
  // Applied before first paint, so the panel never flashes the wrong theme.
  assert.match(html, /bormi_admin_theme/);
  assert.match(html, /prefers-color-scheme: dark/);
  const shell = await source(SHELL);
  assert.match(shell, /localStorage\.setItem\('bormi_admin_theme'/);
});

test('admin: no font, image or script is fetched from anywhere else', async () => {
  const html = await source(INDEX_HTML);
  assert.doesNotMatch(html, /https?:\/\//);
  const styles = await source('apps/bormi-admin/src/styles.css');
  assert.doesNotMatch(styles, /@import url|fonts\.googleapis|cdn\./);
  assert.match(styles, /--font-sans: ui-sans-serif, system-ui/);
});

test('admin: the console keeps itself out of search results', async () => {
  const html = await source(INDEX_HTML);
  assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(html, /name="referrer" content="same-origin"/);
  const api = await source(API);
  // And its answers stay out of every shared cache.
  assert.match(api, /cache: 'no-store'/);
  assert.match(api, /credentials: 'same-origin'/);
});

// ── Nothing else moved ───────────────────────────────────────────────────────

test('admin: no migration, no schema change, no new secret', async () => {
  const migrations = await readdir(new URL('migrations/', ROOT));
  assert.equal(migrations.length, 32, 'the panel reads tables that already exist');
  const route = code(await source(OVERVIEW_ROUTE));
  assert.doesNotMatch(route, /CREATE TABLE|ALTER TABLE|DROP /);
  // One new environment variable, and it is a boolean rollout switch.
  const wrangler = await source('wrangler.toml');
  const added = [...wrangler.matchAll(/^(BORMI_[A-Z0-9_]+) = /gm)].map((match) => match[1]);
  assert.deepEqual(added, ['BORMI_ADMIN_V2_ENABLED']);
  // A rollout switch, and nothing that looks like a credential.
  assert.match(wrangler, /BORMI_ADMIN_V2_ENABLED = "false"/);
});

test('admin: the previous control centre still works and still owns commands', async () => {
  // Its routes are untouched.
  const routes = await source('src/admin/routes.ts');
  assert.match(routes, /ownerOverview: 'agents'/);
  assert.match(routes, /ownerStores: 'agents\/stores'/);
  assert.match(routes, /export const ADMIN_HOME = '\/admin-tools'/);
  // The new panel points at it rather than duplicating its dangerous actions.
  const access = await source(ACCESS_PAGE);
  assert.match(access, /href="\/admin-tools\/agents\/stores"/);
  const app = await source(APP);
  assert.match(app, /href="\/admin-tools\/agents"/);
});

test('admin: the Mini App is not touched by any of this', async () => {
  const shellApp = await source('apps/market-mini-app/src/App.tsx');
  assert.doesNotMatch(shellApp, /bormi-admin|adminApi/);
  const styles = await source('apps/market-mini-app/src/styles.css');
  assert.match(styles, /--bormi-violet: #5b3cf2;/);
});

test('admin: the licence is recorded with the exact commit it came from', async () => {
  const licence = await source('docs/licenses/TAILADMIN_MIT_LICENSE.md');
  assert.match(licence, /MIT License/);
  assert.match(licence, /Copyright \(c\) 2023 TailAdmin/);
  assert.match(licence, /21dc917cb6cb22b5f1d12e5af57359a849d19aa8/);
  assert.match(licence, /selected MIT-licensed TailAdmin React components/);
  // And the claim being made is the modest one.
  assert.match(licence, /No TailAdmin Pro dashboard, layout or Figma asset is used\./);
  const inventory = await source('docs/admin/BORMI_ADMIN_TAILADMIN_INVENTORY.md');
  assert.match(inventory, /TAILADMIN_SKILL_INSTALLED=NO/);
  assert.match(inventory, /TAILADMIN_USED_AS_SOURCE_TEMPLATE=YES/);
});

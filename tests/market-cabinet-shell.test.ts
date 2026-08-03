import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { marketFlag } from '../functions/platform/market';

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

// ── The switch ────────────────────────────────────────────────────────────────

test('the cabinet layout is a declared switch that fails closed', async () => {
  const wrangler = await source('wrangler.toml');
  // Declared in source control, not in the dashboard: a Pages deploy rewrites
  // the project's plain-text variables from this file, so a switch that lived
  // only in the dashboard would disappear on the next release.
  assert.match(wrangler, /MARKET_CABINET_ENABLED = "(true|false)"/);
  // Read exactly like every other market switch: a trimmed, case-insensitive
  // "true" and nothing else, so an unset or mistyped value leaves the shipped
  // layout in place instead of half of a new one.
  for (const value of ['true', 'True', ' TRUE ']) {
    assert.equal(marketFlag(value), true, `${value} should enable a flag`);
  }
  for (const value of ['1', 'yes', 'false', '', undefined]) {
    assert.equal(marketFlag(value), false, `${String(value)} must not enable a flag`);
  }
});

test('both bootstrap payloads report the same shell', async () => {
  const router = await source('functions/market/router.ts');
  assert.match(router, /function buyerNavigation\(env: Env\): string\[\]/);
  assert.match(router, /\['home', 'search', 'publish', 'cabinet'\]/);
  assert.match(router, /\['home', 'search', 'compare', 'orders'\]/);
  // Neither payload may hardcode the tab list any more, or the launch screen
  // and the refetch behind it could describe two different shells.
  const hardcoded = [...router.matchAll(/navigation: \['home'/g)];
  assert.equal(hardcoded.length, 0);
  const reported = [...router.matchAll(/navigation: buyerNavigation\(context\.env\)/g)];
  assert.equal(reported.length, 2, 'both bootstrap payloads must report navigation');
  const cabinetFlags = [...router.matchAll(/cabinet: marketFlag\(context\.env\.MARKET_CABINET_ENABLED\)/g)];
  assert.equal(cabinetFlags.length, 2, 'both bootstrap payloads must report the flag');
});

test('the shell flag changes no read, no command and no authority', async () => {
  const router = await source('functions/market/router.ts');
  // The flag may only be consulted where the shell is described. If it ever
  // reaches a route guard, a layout switch has become a permission.
  const uses = [...router.matchAll(/MARKET_CABINET_ENABLED/g)];
  assert.equal(uses.length, 3, 'the flag is read only by buyerNavigation and the two payloads');
  const seller = /if \(path\.startsWith\('\/seller\/'\)\) \{[\s\S]*?\n {2}\}/.exec(router)?.[0];
  assert.ok(seller, 'seller read branch not found');
  assert.doesNotMatch(seller, /MARKET_CABINET_ENABLED/);
  const commands = /async function sellerCommands\([\s\S]*?\n\}/.exec(router)?.[0];
  assert.ok(commands, 'seller command branch not found');
  assert.doesNotMatch(commands, /MARKET_CABINET_ENABLED/);
});

// ── Authority ─────────────────────────────────────────────────────────────────

test('the store section exists only when the server granted seller reads', async () => {
  const cabinet = await source('apps/market-mini-app/src/screens/CabinetApp.tsx');
  // Rendered behind the server-reported capability, and the lazy chunk is not
  // even requested without it.
  assert.match(cabinet, /const workspace = section === 'store' && sellerAvailable/);
  assert.match(cabinet, /sellerAvailable \? <section/);
  assert.match(cabinet, /lazy\(\(\) => import\('\.\/SellerApp'\)/);
  // Nothing on the client may manufacture the capability. Display preferences
  // are allowed to persist, but they live in the platform layer, so this screen
  // has no reason to touch storage or the URL at all.
  assert.doesNotMatch(cabinet, /localStorage|sessionStorage|searchParams|location\./);
});

test('the buyer shell keeps demoting a seller role it cannot prove', async () => {
  const app = await source('apps/market-mini-app/src/App.tsx');
  assert.match(app, /role === 'seller' && sellerAvailable/);
  assert.match(app, /const cabinetEnabled = bootstrap\.data\.flags\.cabinet === true/);
  // The header toggle is the old way in; with the cabinet on it must be gone,
  // so the workspace has exactly one entrance.
  assert.match(app, /sellerAvailable && !cabinetEnabled \? <div className="role-switch"/);
  assert.match(app, /sellerAvailable=\{sellerAvailable\}/);
});

// ── The shell itself ──────────────────────────────────────────────────────────

test('turning the cabinet off restores the shipped four tabs', async () => {
  const buyer = await source('apps/market-mini-app/src/screens/BuyerApp.tsx');
  assert.match(buyer, /cabinetEnabled\s*\?\s*\(\[[\s\S]*?'publish'[\s\S]*?'cabinet'[\s\S]*?\]\s*as const\)/);
  assert.match(buyer, /:\s*\(\[[\s\S]*?'compare'[\s\S]*?'orders'[\s\S]*?\]\s*as const\)/);
  // The old destinations stay reachable, so switching back is a flag and not a
  // rebuild.
  assert.match(buyer, /view === 'orders' \? </);
  assert.match(buyer, /view === 'compare' \? </);
});

test('one order list serves both shells', async () => {
  const orders = await source('apps/market-mini-app/src/screens/BuyerOrders.tsx');
  assert.match(orders, /queryKey: \['orders'\]/);
  assert.match(orders, /'\/orders\?limit=5'/);
  const buyer = await source('apps/market-mini-app/src/screens/BuyerApp.tsx');
  const cabinet = await source('apps/market-mini-app/src/screens/CabinetApp.tsx');
  assert.match(buyer, /<BuyerOrdersList locale=\{locale\} onSearch=\{openSearch\} \/>/);
  assert.match(cabinet, /<BuyerOrdersList locale=\{locale\} onSearch=\{onSearch\} \/>/);
  // A second copy of the timeline would be a place for the two shells to drift.
  assert.doesNotMatch(buyer, /timeline timeline--compact/);
});

test('the cabinet shows the person their own name and nobody else', async () => {
  const app = await source('apps/market-mini-app/src/App.tsx');
  assert.match(app, /userName=\{launch\.session\.user\.firstName\}/);
  const cabinet = await source('apps/market-mini-app/src/screens/CabinetApp.tsx');
  // No buyer contact, phone or address may appear on a personal screen that a
  // seller can also open.
  assert.doesNotMatch(cabinet, /customerPhone|customerAddress|buyerPhone|buyerAddress/);
});

test('the supply-side tab is an action, not a floating button', async () => {
  const styles = await source('apps/market-mini-app/src/styles.css');
  assert.match(styles, /\.bottom-nav__publish \.bottom-nav__icon/);
  // A FAB would sit on top of the compare tray and fight Telegram's own sheet
  // gesture; the accent lives inside the bar instead.
  const publish = [...styles.matchAll(/^\.bottom-nav__publish[^\n]*$/gm)].map((rule) => rule[0]);
  assert.equal(publish.length, 2, 'publish styling rules not found');
  for (const rule of publish) {
    assert.doesNotMatch(rule, /position: fixed|position: absolute|transform:/);
  }
  assert.match(styles, /\.bottom-nav \{[^}]*grid-template-columns: repeat\(4, 1fr\)/);
});

test('a chosen theme drops Telegram colours instead of fighting them', async () => {
  const platform = await source('apps/market-mini-app/src/platform/telegram.ts');
  // The surfaces read --tg-*; leaving a light --tg-bg in place while asking for
  // dark would paint half a screen.
  assert.match(platform, /for \(const name of TELEGRAM_COLORS\) \{\s*\n\s*document\.documentElement\.style\.removeProperty\(name\);/);
  assert.match(platform, /document\.documentElement\.dataset\.theme = preference/);
  // "Авто" is the default and means Telegram decides.
  assert.match(platform, /return stored === 'light' \|\| stored === 'dark' \? stored : 'auto'/);
  // Storage can be unavailable in a WebView; that must not break the launch.
  assert.match(platform, /catch \{[\s\S]{0,160}?return 'auto';/);
  const main = await source('apps/market-mini-app/src/main.tsx');
  assert.match(main, /applyStoredTheme\(\);/);
});

test('the launch reads the shelf without waiting for the identity', async () => {
  const router = await source('functions/market/router.ts');
  // Speculative and identity-independent, started before the identity is
  // awaited so the two round trips overlap instead of queueing.
  assert.match(router, /const directAhead = includeLaunch/);
  assert.match(router, /const shelfAhead = directAhead\?\.then/);
  const order = [
    router.indexOf('const shelfAhead'),
    router.indexOf('await services.identities.getOrCreateIdentity'),
  ];
  assert.ok(order[0] > 0 && order[1] > order[0], 'the prefetch must start before the identity await');
  // Neither speculative promise may reject: a miss costs the old path, never
  // the request.
  assert.match(router, /resolveDirectPilotStorefront\(config\.botUsername\)\s*\n\s*\.catch\(\(\) => null\)/);
  // Used only when it is the same shelf, so a different storefront still reads
  // its own rows.
  assert.match(router, /shelf\.orgId === access\.buyer\.orgId\s*\n\s*&& shelf\.storeId === access\.buyer\.storeId/);
  assert.match(router, /const home = reusable/);
  assert.match(router, /: await catalogHomePayload\(context\)/);
});

test('the launch reports how long it took and nothing about who asked', async () => {
  const router = await source('functions/market/router.ts');
  assert.match(router, /response\.headers\.set\('Server-Timing'/);
  assert.match(router, /`\$\{name\};dur=\$\{value\}`/);
  assert.match(router, /'Access-Control-Expose-Headers', 'Server-Timing, x-request-id'/);
  // Durations only. A phase name is not allowed to carry an id, a store or a
  // query, so the set of marks is fixed and checked here.
  const marks = [...router.matchAll(/mark\('([a-z]+)',/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(marks)].sort(), ['bind', 'identity', 'shelf', 'total', 'verify']);
  const api = await source('apps/market-mini-app/src/lib/api.ts');
  assert.match(api, /export function readLaunchTiming\(\): LaunchTiming \| null/);
  assert.match(api, /total;dur=/);
});

test('one theme choice drives both the header and the cabinet', async () => {
  const app = await source('apps/market-mini-app/src/App.tsx');
  // The state lives once, at the top: a header control and a cabinet control
  // that each kept their own copy would disagree the moment either was used.
  assert.match(app, /const \[theme, setTheme\] = useState<ThemePreference>\(readThemePreference\)/);
  assert.match(app, /className="icon-button theme-button"/);
  assert.match(app, /<Icon name=\{THEME_ICON\[theme\]\} size=\{19\} \/>/);
  assert.match(app, /onTheme=\{changeTheme\}/);
  const cabinet = await source('apps/market-mini-app/src/screens/CabinetApp.tsx');
  assert.doesNotMatch(cabinet, /useState<ThemePreference>/);
  assert.match(cabinet, /onChange=\{onTheme\}/);
  // Icons, not emoji, and one per state.
  const ui = await source('apps/market-mini-app/src/components/ui.tsx');
  for (const icon of ['sun:', 'moon:', 'contrast:']) assert.ok(ui.includes(icon), `${icon} missing`);
});

test('the shell change carries a new cache name', async () => {
  const worker = await source('apps/market-mini-app/public/sw.js');
  assert.match(worker, /const CACHE = 'bormi-shell-v10'/);
  assert.match(worker, /keys\.filter\(\(key\) => key !== CACHE\)\.map\(\(key\) => caches\.delete\(key\)\)/);
});

test('cabinet copy exists in both languages', async () => {
  const i18n = await source('apps/market-mini-app/src/lib/i18n.ts');
  const [, ru = '', uz = ''] = new RegExp(
    'ru: \\{([\\s\\S]*?)\\r?\\n {2}\\},\\r?\\n {2}uz: \\{([\\s\\S]*?)\\r?\\n {2}\\},\\r?\\n\\} as const',
  ).exec(i18n) ?? [];
  assert.ok(ru && uz, 'copy blocks not found');
  const keys = (block: string) => new Set(
    [...block.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]),
  );
  for (const key of [
    'cabinet', 'postAd', 'profile', 'myOrders', 'myOrdersHint',
    'store', 'storeHint', 'helpTitle', 'helpBody', 'postAdSoon', 'postAdSoonBody',
  ]) {
    assert.ok(keys(ru).has(key), `ru is missing ${key}`);
    assert.ok(keys(uz).has(key), `uz is missing ${key}`);
  }
});

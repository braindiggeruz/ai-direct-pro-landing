import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

import { marketFlag } from '../functions/platform/market';

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

const NAV = 'apps/market-mini-app/src/platform/navigation.ts';
const APP = 'apps/market-mini-app/src/App.tsx';
const UI = 'apps/market-mini-app/src/components/ui.tsx';
const BUYER = 'apps/market-mini-app/src/screens/BuyerApp.tsx';
const CABINET = 'apps/market-mini-app/src/screens/CabinetApp.tsx';
const ROUTER = 'functions/market/router.ts';

// ── QP-0 · the back-gesture spine ─────────────────────────────────────────────
//
// This file is the QuickPost corpus. Today it covers phase QP-0 only — the
// navigation foundation QuickPost is not allowed to ship without. The composer
// checks (media, voice, AI schema, price, publication) belong to QP-1 and are
// added here rather than in a second competing file.

test('the back spine is a declared switch that fails closed', async () => {
  const wrangler = await source('wrangler.toml');
  assert.match(wrangler, /MARKET_NAV_BACK_ENABLED = "(true|false)"/);
  for (const value of ['true', 'True', ' TRUE ']) {
    assert.equal(marketFlag(value), true, `${value} should enable a flag`);
  }
  for (const value of ['1', 'yes', 'false', '', undefined]) {
    assert.equal(marketFlag(value), false, `${String(value)} must not enable a flag`);
  }
  const env = await source('functions/_types.ts');
  assert.match(env, /MARKET_NAV_BACK_ENABLED\?: string;/);
  const types = await source('apps/market-mini-app/src/types.ts');
  // Additive and optional: a bootstrap answered before this shipped is still
  // a valid payload and still produces the shipped behaviour.
  assert.match(types, /navBack\?: boolean;/);
});

test('both bootstrap payloads report the spine and nothing else changes', async () => {
  const router = await source(ROUTER);
  const reported = [...router.matchAll(
    /navBack: marketFlag\(context\.env\.MARKET_NAV_BACK_ENABLED\)/g,
  )];
  assert.equal(reported.length, 2, 'both bootstrap payloads must report the flag');
  const uses = [...router.matchAll(/MARKET_NAV_BACK_ENABLED/g)];
  assert.equal(uses.length, 2, 'the flag is read only by the two bootstrap payloads');
  // Never anywhere near a read or a command.
  const seller = /if \(path\.startsWith\('\/seller\/'\)\) \{[\s\S]*?\r?\n {2}\}/.exec(router)?.[0];
  assert.ok(seller, 'seller read branch not found');
  assert.doesNotMatch(seller, /MARKET_NAV_BACK_ENABLED|navBack/);
  const commands = /async function sellerCommands\([\s\S]*?\r?\n\}/.exec(router)?.[0];
  assert.ok(commands, 'seller command branch not found');
  assert.doesNotMatch(commands, /MARKET_NAV_BACK_ENABLED|navBack/);
});

test('the spine is navigation and never a capability', async () => {
  const app = await source(APP);
  assert.match(app, /const navBack = bootstrap\.data\.flags\.navBack === true;/);
  assert.match(app, /useEffect\(\(\) => startNavigation\(navBack\), \[navBack\]\);/);
  // It decides nothing about what a person may do: no expression that produces
  // a capability, and no expression that passes one on, may even mention it.
  const capabilityLines = app.split(/\r?\n/).filter((line) => /(sellerAvailable|sellerCommands|mediaUpload|cabinetEnabled|cabinetHomeV2)\s*=/.test(line));
  assert.ok(capabilityLines.length >= 5, 'capability declarations not found');
  for (const line of capabilityLines) assert.doesNotMatch(line, /navBack/);
  const nav = await source(NAV);
  assert.doesNotMatch(nav, /seller|marketApi|fetch\(|localStorage|sessionStorage/);
});

test('off, every back gesture behaves exactly as it shipped', async () => {
  const nav = await source(NAV);
  // Nothing is registered and no history entry is spent until the server said so.
  assert.match(nav, /export function pushBackStop\(stop: BackStop\): \(\) => void \{\s*\r?\n\s*if \(!enabled\) return \(\) => undefined;/);
  assert.match(nav, /if \(!active \|\| started\) return \(\) => undefined;/);
  const buyer = await source(BUYER);
  assert.match(buyer, /useBackStop\(navBack && view !== 'home',/);
});

test('a back gesture closes the newest open thing, one level at a time', async () => {
  const nav = await source(NAV);
  // A stack, popped from the end, not a router.
  assert.match(nav, /const stack: BackStop\[\] = \[\];/);
  assert.match(nav, /const top = stack\.at\(-1\);/);
  assert.doesNotMatch(nav, /stack\.length = 0;\s*\r?\n\s*sync\(\);\s*\r?\n\s*notify\(\)/);
  // Exactly one history entry is ever outstanding: two would need two presses.
  assert.match(nav, /if \(open && !sentinel\) \{/);
  assert.match(nav, /if \(!open && sentinel\) \{/);
  const pushes = [...nav.matchAll(/window\.history\.pushState/g)];
  assert.equal(pushes.length, 1, 'the sentinel is pushed in exactly one place');
});

test('the app itself is only closed at the root', async () => {
  const nav = await source(NAV);
  // With nothing open we do not answer the gesture at all, so Telegram closes
  // the app — which is the correct behaviour at the root and only there.
  assert.match(nav, /function onPopState\(\): void \{[\s\S]*?if \(!stack\.length\) return;/);
  assert.match(nav, /const open = stack\.length > 0;\s*\r?\n\s*const button = telegramBack\(\);\s*\r?\n\s*if \(open\) button\?\.show\?\.\(\);\s*\r?\n\s*else button\?\.hide\?\.\(\);/);
});

test('a screen may refuse to close, and refusing costs no history entry', async () => {
  const nav = await source(NAV);
  // The guard a composer with unsaved work will use in QP-1.
  assert.match(nav, /onBack: \(\) => boolean \| void;/);
  assert.match(nav, /if \(top\.onBack\(\) === false\) \{\s*\r?\n\s*\/\/ Refused[\s\S]{0,120}?sync\(\);\s*\r?\n\s*return;/);
  assert.match(nav, /if \(top\.onBack\(\) === false\) return false;/);
});

test('our own history.back is never mistaken for a gesture', async () => {
  const nav = await source(NAV);
  assert.match(nav, /ignoreNextPop = true;\s*\r?\n\s*try \{\s*\r?\n\s*window\.history\.back\(\);/);
  assert.match(nav, /if \(ignoreNextPop\) \{\s*\r?\n\s*ignoreNextPop = false;\s*\r?\n\s*return;\s*\r?\n\s*\}/);
});

test('a dialog is a level, so back closes the dialog and not the app', async () => {
  const ui = await source(UI);
  assert.match(ui, /useBackStop\(open, 'modal', onClose\);/);
  // The same exit the two shipped ones already use.
  assert.match(ui, /if \(event\.key === 'Escape'\) onClose\(\);/);
  assert.match(ui, /if \(event\.target === event\.currentTarget\) onClose\(\);/);
});

test('every cabinet section is a level above the cabinet root', async () => {
  const cabinet = await source(CABINET);
  assert.match(cabinet, /useBackStop\(section !== 'root', `cabinet:\$\{section\}`, \(\) => \{/);
  // The workspace leaves by the same door its visible control uses, so the
  // gesture and the button cannot end up in different places.
  assert.match(cabinet, /if \(workspace\) leaveWorkspace\(\);\s*\r?\n\s*else setSection\('root'\);/);
});

test('a handler that changes every keystroke does not spend a history entry', async () => {
  const nav = await source(NAV);
  // The effect depends on the level, never on the closure.
  assert.match(nav, /\}, \[active, id\]\);/);
  assert.match(nav, /return pushBackStop\(\{ id, onBack: \(\) => handler\.current\(\) \}\);/);
});

// ── Boundaries ────────────────────────────────────────────────────────────────

test('QP-0 adds no endpoint, no migration, no launch request and no storage', async () => {
  const migrations = await readdir(new URL('migrations/', ROOT));
  assert.equal(migrations.length, 30, 'QP-0 adds no migration');
  assert.ok(migrations.every((name) => !/quickpost|nav/i.test(name)));
  const nav = await source(NAV);
  // No network, and nothing about the person is written anywhere.
  assert.doesNotMatch(nav, /marketApi|fetch\(|localStorage|sessionStorage|document\.cookie/);
  const api = await source('apps/market-mini-app/src/lib/api.ts');
  const launch = /export async function exchangeLaunch\(\)[\s\S]*?\r?\n\}/.exec(api)?.[0] ?? '';
  assert.doesNotMatch(launch, /navBack|BackButton/);
  const router = await source(ROUTER);
  // The flag is a boolean on a payload that already existed, nothing more.
  assert.doesNotMatch(router, /\/quickpost|quick_post/);
});

test('the spine keeps no secret and no session anywhere it can be read', async () => {
  const nav = await source(NAV);
  assert.doesNotMatch(nav, /initData|token|secret|Authorization|identity|telegram_id/i);
  // The one thing it writes to history is a marker with no meaning of its own.
  assert.match(nav, /pushState\(\{ bormiBack: true \}, ''\)/);
});

test('a frame that refuses history still leaves the app usable', async () => {
  const nav = await source(NAV);
  // Telegram's button and the app's own chrome keep working; only the hardware
  // key falls through, and that is stated rather than silently swallowed.
  assert.match(nav, /\} catch \{\s*\r?\n\s*\/\/ A sandboxed frame can refuse pushState[\s\S]{0,180}?sentinel = false;/);
});

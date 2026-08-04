import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

import { marketFlag } from '../functions/platform/market';

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

const CABINET = 'apps/market-mini-app/src/screens/CabinetApp.tsx';
const BUYER = 'apps/market-mini-app/src/screens/BuyerApp.tsx';
const SELLER = 'apps/market-mini-app/src/screens/SellerApp.tsx';
const APP = 'apps/market-mini-app/src/App.tsx';
const I18N = 'apps/market-mini-app/src/lib/i18n.ts';
const STYLES = 'apps/market-mini-app/src/styles.css';
const ROUTER = 'functions/market/router.ts';

/** The v2 root only. Everything before the marker is the shipped root. */
function homeV2Block(cabinet: string): string {
  const start = cabinet.indexOf('// ── Cabinet home v2');
  assert.ok(start > 0, 'the v2 root marker is missing');
  return cabinet.slice(start);
}

// ── The switch ────────────────────────────────────────────────────────────────

test('the cabinet root is a declared switch that fails closed', async () => {
  const wrangler = await source('wrangler.toml');
  // Declared in source control like every other market switch: a Pages deploy
  // rewrites the project's plain-text variables from this file.
  assert.match(wrangler, /MARKET_CABINET_HOME_V2 = "(true|false)"/);
  for (const value of ['true', 'True', ' TRUE ']) {
    assert.equal(marketFlag(value), true, `${value} should enable a flag`);
  }
  for (const value of ['1', 'yes', 'false', '', undefined]) {
    assert.equal(marketFlag(value), false, `${String(value)} must not enable a flag`);
  }
  const env = await source('functions/_types.ts');
  assert.match(env, /MARKET_CABINET_HOME_V2\?: string;/);
});

test('both bootstrap payloads report the cabinet root', async () => {
  const router = await source(ROUTER);
  const reported = [...router.matchAll(
    /cabinetHomeV2: marketFlag\(context\.env\.MARKET_CABINET_HOME_V2\)/g,
  )];
  assert.equal(reported.length, 2, 'both bootstrap payloads must report the flag');
});

test('the root flag changes no read, no command and no authority', async () => {
  const router = await source(ROUTER);
  // Only the two payload builders may consult it. Reaching a route guard would
  // turn a layout switch into a permission.
  const uses = [...router.matchAll(/MARKET_CABINET_HOME_V2/g)];
  assert.equal(uses.length, 2, 'the flag is read only by the two bootstrap payloads');
  const seller = /if \(path\.startsWith\('\/seller\/'\)\) \{[\s\S]*?\n {2}\}/.exec(router)?.[0];
  assert.ok(seller, 'seller read branch not found');
  assert.doesNotMatch(seller, /MARKET_CABINET_HOME_V2/);
  const commands = /async function sellerCommands\([\s\S]*?\n\}/.exec(router)?.[0];
  assert.ok(commands, 'seller command branch not found');
  assert.doesNotMatch(commands, /MARKET_CABINET_HOME_V2/);
  // And the client reads it as a layout only, never as a capability.
  const app = await source(APP);
  assert.match(app, /const cabinetHomeV2 = cabinetEnabled && bootstrap\.data\.flags\.cabinetHomeV2 === true/);
  assert.doesNotMatch(app, /cabinetHomeV2 \?[\s\S]{0,80}sellerAvailable/);
});

test('the flag off leaves the shipped cabinet exactly as it was', async () => {
  const cabinet = await source(CABINET);
  assert.match(cabinet, /if \(!homeV2\) \{/);
  const shipped = cabinet.slice(cabinet.indexOf('if (!homeV2) {'), cabinet.indexOf('// ── Cabinet home v2'));
  // The shipped root keeps its hero, its role line and its own settings block,
  // so turning the switch off is a flag and not a rebuild.
  assert.match(shipped, /<h1>\{t\(locale, 'cabinet'\)\}<\/h1>/);
  assert.match(shipped, /roleBuyerSeller' : 'roleBuyer'/);
  assert.match(shipped, /<LaunchTimingPanel locale=\{locale\} \/>/);
  const buyer = await source(BUYER);
  // The old "Скоро" screen survives only on that path.
  assert.match(buyer, /view === 'publish' && !cabinetHomeV2 \? </);
});

// ── Authority ─────────────────────────────────────────────────────────────────

test('the store section still exists only when the server granted seller reads', async () => {
  const cabinet = await source(CABINET);
  const v2 = homeV2Block(cabinet);
  assert.match(v2, /\{sellerAvailable \? <CabinetRow/);
  assert.match(v2, /const storeTasks = sellerAvailable \? storeAttentionTotal\(overview\.data\) : 0;/);
  // The overview read itself is gated on the same server-granted capability.
  assert.match(cabinet, /enabled: homeV2 && sellerAvailable && section === 'root'/);
  // Nothing on the client may manufacture the capability.
  assert.doesNotMatch(cabinet, /localStorage|sessionStorage|searchParams|location\./);
});

test('a buyer without seller commands is offered the bot, never a seller route', async () => {
  const buyer = await source(BUYER);
  assert.match(buyer, /canCreateProduct=\{sellerCommands\}/);
  // The fallback is a link into the chat, not a command and not a /seller/ call.
  // (`\r?\n` throughout: this file is checked out with CRLF endings on Windows.)
  const sheet = /function CreateSheet\(\{[\s\S]*?\r?\n\}\r?\n/.exec(buyer)?.[0];
  assert.ok(sheet, 'create sheet not found');
  assert.match(sheet, /href=\{SELLER_START_URL\}/);
  assert.doesNotMatch(sheet, /marketApi|\/seller\//);
  // And the URL comes from the one module the release checks already assert.
  const link = await source('apps/market-mini-app/src/lib/bot-link.ts');
  assert.match(link, /from '\.\.\/\.\.\/\.\.\/\.\.\/src\/shared\/sotuvchi-config'/);
  assert.doesNotMatch(link, /https:\/\/t\.me\/[A-Za-z]/);
});

test('the cabinet carries the sell intent instead of copying the editor', async () => {
  const cabinet = await source(CABINET);
  assert.match(cabinet, /const \[pendingEditor, setPendingEditor\] = useState\(/);
  assert.match(cabinet, /if \(sellIntent && sellerAvailable && sellerCommands\) \{/);
  assert.match(cabinet, /startEditor=\{pendingEditor\}/);
  // The intent is answered during the render that receives it, and the effect
  // left behind only lowers the shell's flag — it sets no state of its own.
  const ack = /useEffect\(\(\) => \{\s*\r?\n\s*if \(!sellIntent\) return;[\s\S]*?\}, \[sellIntent[^\]]*\]\);/
    .exec(cabinet)?.[0];
  assert.ok(ack, 'the sell-intent acknowledgement was not found');
  assert.doesNotMatch(ack, /setPendingEditor|setSection/);
  // No second product form anywhere outside the seller workspace.
  assert.doesNotMatch(cabinet, /ProductEditor|\/seller\/products/);
  const seller = await source(SELLER);
  assert.match(seller, /open: Boolean\(startEditor\), product: null,/);
});

// ── Attention ─────────────────────────────────────────────────────────────────

test('with nothing waiting there is no attention block and no primary but one', async () => {
  const cabinet = await source(CABINET);
  const v2 = homeV2Block(cabinet);
  assert.match(v2, /\{rows\.length \? <section/);
  assert.match(v2, /\{!events\.length \? <div className="cabinet-primary">/);
  assert.match(v2, /\{!events\.length\s*\n\s*\? <p className="cabinet-empty">/);
});

test('an unfinished checkout produces exactly one honest, actionable element', async () => {
  const cabinet = await source(CABINET);
  const v2 = homeV2Block(cabinet);
  assert.match(v2, /if \(activeCheckout\) \{[\s\S]{0,320}?id: 'checkout',/);
  assert.match(v2, /title: t\(locale, 'attentionCheckout'\),/);
  assert.match(v2, /onOpen: onResumeCheckout,/);
  // Named as a row and answered by the single primary action above the fold:
  // no event is ever promoted out of the list that explains it.
  assert.match(v2, /const primary = events\[0\]\?\.id === 'store' \? undefined : events\[0\];/);
  assert.match(v2, /const rows = events\.slice\(0, 3\);/);
  assert.match(v2, /\{rows\.map\(\(event\) => <AttentionRow key=\{event\.id\} event=\{event\} \/>\)\}/);
  // Quoted, so the hint key beside it is not counted as a second description.
  const occurrences = [...v2.matchAll(/attentionCheckout'/g)];
  assert.equal(occurrences.length, 1, 'the checkout event may be described once');
});

test('an open question produces exactly one honest, actionable element', async () => {
  const cabinet = await source(CABINET);
  const v2 = homeV2Block(cabinet);
  assert.match(v2, /if \(activeHandoff\) \{[\s\S]{0,320}?id: 'question',/);
  assert.match(v2, /onOpen: \(\) => setSection\('question'\),/);
  const occurrences = [...v2.matchAll(/attentionQuestion'/g)];
  assert.equal(occurrences.length, 1, 'the question event may be described once');
  // And it leads to a screen that reads an endpoint which already exists.
  assert.match(cabinet, /queryFn: \(\{ signal \}\) => marketApi\.get\('\/handoffs\/active', signal\)/);
});

test('the attention block is capped at three rows', async () => {
  const cabinet = await source(CABINET);
  assert.match(cabinet, /\.slice\(0, 3\)/);
});

test('no counter is rendered from a zero', async () => {
  const cabinet = await source(CABINET);
  // Truthiness, not "!== undefined": a zero never reaches the DOM.
  assert.match(cabinet, /\{count \? <span className="cabinet-row__count">/);
  assert.match(cabinet, /\{event\.count \? <span className="cabinet-row__count">/);
  assert.match(cabinet, /count=\{storeTasks \|\| undefined\}/);
  assert.match(cabinet, /if \(storeTasks > 0\) \{/);
  const seller = await source(SELLER);
  // The seller's own day stopped being a scoreboard that reads "0".
  assert.match(seller, /\]\s*as const\)\.filter\(\(\[, value\]\) => value > 0\)/);
  assert.match(seller, /\{metrics\.length \? <section/);
  assert.doesNotMatch(seller, /<strong>\{stats\.exact\.ordersPlaced\}<\/strong>/);
});

test('the badge is built only from counters the server already reports', async () => {
  const buyer = await source(BUYER);
  assert.match(buyer, /const waiting = \(activeCheckout \? 1 : 0\) \+ \(activeHandoff \? 1 : 0\);/);
  assert.match(buyer, /destination === 'cabinet' && cabinetEnabled && waiting > 0 \? waiting : 0/);
  assert.match(buyer, /\{badge \? <small>\{badge > 9 \? '9\+' : badge\}<\/small> : null\}/);
  // Never invented: no unread count, no read receipt, no store housekeeping.
  assert.doesNotMatch(buyer, /unread|readReceipt|storeTasks/);
  assert.match(buyer, /aria-label=\{badge \? `\$\{t\(locale, label\)\}: \$\{t\(locale, 'attentionTitle'\)\}, \$\{badge\}` : undefined\}/);
});

// ── The create sheet ──────────────────────────────────────────────────────────

test('the supply-side tab opens a dialog instead of a screen', async () => {
  const buyer = await source(BUYER);
  assert.match(buyer, /if \(destination === 'publish' && cabinetHomeV2\) \{\s*\n\s*openCreate\(\);/);
  assert.match(buyer, /aria-haspopup=\{sheet \? 'dialog' : undefined\}/);
  assert.match(buyer, /aria-expanded=\{sheet \? createOpen : undefined\}/);
  // The tab it opens over keeps aria-current: the sheet is an action, not a place.
  assert.match(buyer, /aria-current=\{!sheet && view === destination \? 'page' : undefined\}/);
  // And it is a button, never a tab role.
  assert.doesNotMatch(buyer, /role="tab"/);
});

test('the sheet is a real dialog and closes the ways a dialog closes', async () => {
  const ui = await source('apps/market-mini-app/src/components/ui.tsx');
  assert.match(ui, /role="dialog" aria-modal="true" aria-labelledby=\{titleId\}/);
  assert.match(ui, /if \(event\.key === 'Escape'\) onClose\(\);/);
  assert.match(ui, /if \(event\.target === event\.currentTarget\) onClose\(\);/);
  assert.match(ui, /before\?\.focus\(\);/);
  const buyer = await source(BUYER);
  assert.match(buyer, /<Modal open=\{open\} title=\{t\(locale, 'createTitle'\)\}/);
});

test('neither branch of the sheet is a promise', async () => {
  const buyer = await source(BUYER);
  const sheet = /function CreateSheet\(\{[\s\S]*?\n\}\n/.exec(buyer)?.[0] ?? '';
  assert.doesNotMatch(sheet, /postAdSoon|Скоро|StateView/);
  // "Ищу" opens the search that exists, and claims the field after the sheet has
  // handed focus back to whatever opened it.
  assert.match(buyer, /const wantedFromSheet = \(\) => \{\s*\n\s*setCreateOpen\(false\);\s*\n\s*setView\('search'\);/);
  assert.match(buyer, /globalThis\.setTimeout\(\(\) => searchRef\.current\?\.focus\(\), 0\);/);
  // It never claims a request was published to sellers.
  const i18n = await source(I18N);
  assert.match(i18n, /createWantedHint: 'Опишите, что ищете'/);
  assert.doesNotMatch(i18n, /createWantedHint: '[^']*найдём[^']*'/);
});

// ── Honesty ───────────────────────────────────────────────────────────────────

test('no database value reaches the screen as itself', async () => {
  const seller = await source(SELLER);
  assert.doesNotMatch(seller, /<strong>\{item\.reason\}<\/strong>/);
  assert.doesNotMatch(seller, /\{detail\.data\.status\}<\/Badge>/);
  assert.doesNotMatch(seller, /\{item\.status\}<\/Badge>/);
  assert.match(seller, /labelForHandoffReason\(locale, item\.reason\)/);
  assert.match(seller, /labelForHandoffStatus\(locale, item\.status\)/);
  const i18n = await source(I18N);
  // Every reason and status the domain declares has words, and an unknown value
  // resolves to a neutral localized one rather than to the key.
  for (const reason of [
    'unknown_intent', 'buyer_requested_human', 'catalog_no_result',
    'order_question', 'seller_initiated',
  ]) {
    assert.ok(i18n.includes(`${reason}:`), `${reason} has no copy`);
  }
  assert.match(i18n, /return t\(locale, map\[reason\] \?\? 'reasonOther'\);/);
  assert.match(i18n, /return t\(locale, map\[status\] \?\? 'statusClosed'\);/);
});

test('help is something a person can press', async () => {
  const cabinet = await source(CABINET);
  assert.match(cabinet, /\{BOT_CHAT_URL \? <a\s*\n\s*className="cabinet-row"/);
  // The static row that promised a bot and offered no way to reach it is gone
  // from the screen the switch turns on.
  const v2 = homeV2Block(cabinet);
  assert.doesNotMatch(v2, /cabinet-row--static/);
});

test('archiving is reachable and asks first, because it cannot be undone', async () => {
  const seller = await source(SELLER);
  assert.match(seller, /onClick=\{\(\) => setArchiving\(product\)\}/);
  assert.match(seller, /\{t\(locale, 'archive'\)\}<\/Button>/);
  assert.match(seller, /transition\.mutate\(\{ product: archiving, action: 'archive' \}\)/);
  assert.match(seller, /<ConfirmDialog/);
  const i18n = await source(I18N);
  // The copy says the true thing: the domain refuses every transition out of
  // `archived`, so this is not reversible.
  assert.match(i18n, /archiveConfirmBody: '[^']*Вернуть его из архива нельзя\.'/);
  assert.match(i18n, /archiveConfirmBody: '[^']*qaytarib bo‘lmaydi\.'/);
  const ui = await source('apps/market-mini-app/src/components/ui.tsx');
  // A dialog, not a sheet: a downward flick is how a list is scrolled.
  assert.match(ui, /export function ConfirmDialog\(\{[\s\S]{0,700}?<Modal open=\{open\}/);
  assert.doesNotMatch(/<Modal open=\{open\}[^>]*>/.exec(ui)?.[0] ?? '', /sheet/);
});

test('one control class no longer answers for two different controls', async () => {
  const styles = await source(STYLES);
  const base = [...styles.matchAll(/^\.segmented \{/gm)];
  assert.equal(base.length, 1, '.segmented must be declared once');
  const choice = /^\.segmented--choice \{[^}]*\}/m.exec(styles)?.[0];
  assert.ok(choice, '.segmented--choice not found');
  // The cabinet's picker keeps itself inside the card that holds it: no negative
  // gutter, no scroll container.
  assert.match(choice, /margin: 0;/);
  assert.match(choice, /overflow: visible;/);
  assert.doesNotMatch(choice, /margin-inline: -/);
  const cabinet = await source(CABINET);
  assert.match(cabinet, /className="segmented segmented--choice"/);
  assert.doesNotMatch(styles, /!important;[^\n]*segmented/);
});

// ── Terminology ───────────────────────────────────────────────────────────────

test('the buyer’s own orders are called orders in both languages', async () => {
  const i18n = await source(I18N);
  assert.match(i18n, /myOrders: 'Заказы'/);
  assert.match(i18n, /myOrders: 'Buyurtmalarim'/);
  assert.match(i18n, /ordersEmpty: 'Заказов пока нет'/);
  assert.match(i18n, /ordersEmpty: 'Hozircha buyurtmalar yo‘q'/);
  assert.match(i18n, /sentStep: 'Заказ отправлен'/);
  assert.match(i18n, /sentStep: 'Buyurtma yuborildi'/);
  assert.match(i18n, /orderCreated: 'Заказ отправлен'/);
  assert.match(i18n, /confirm: 'Отправить заказ'/);
  assert.match(i18n, /summary: 'Проверка заказа'/);
  assert.match(i18n, /requestNotice: 'Это заказ у продавца, не онлайн-оплата\.'/);
  assert.match(i18n, /placedCount: 'Новые заказы'/);
  // `so‘rov` is released for the request feed that does not exist yet: no piece
  // of order copy may hold it any more.
  for (const key of [
    'myOrders', 'myOrdersHint', 'ordersEmpty', 'sentStep', 'orderCreated',
    'confirm', 'summary', 'requestNotice', 'placedCount', 'order',
  ]) {
    const uz = new RegExp(`${key}: '([^']*)'`, 'g');
    const values = [...i18n.matchAll(uz)].map((match) => match[1]);
    for (const value of values) {
      assert.doesNotMatch(value, /so‘rov/i, `${key} still says so‘rov: ${value}`);
    }
  }
  // The domain identifiers are untouched: this was a wording decision.
  const router = await source(ROUTER);
  assert.match(router, /path === '\/orders'/);
  assert.match(router, /path === '\/checkout'/);
});

test('both languages carry every key and the Uzbek block keeps its apostrophes', async () => {
  const i18n = await source(I18N);
  const [, ru = '', uz = ''] = new RegExp(
    'ru: \\{([\\s\\S]*?)\\r?\\n {2}\\},\\r?\\n {2}uz: \\{([\\s\\S]*?)\\r?\\n {2}\\},\\r?\\n\\} as const',
  ).exec(i18n) ?? [];
  assert.ok(ru && uz, 'copy blocks not found');
  const keys = (block: string) => new Set(
    [...block.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]),
  );
  const ruKeys = keys(ru);
  const uzKeys = keys(uz);
  assert.deepEqual([...ruKeys].sort(), [...uzKeys].sort());
  for (const key of [
    'cabinetFallbackName', 'attentionTitle', 'attentionCheckout', 'attentionQuestion',
    'storeTasks', 'resumeCheckout', 'openQuestion', 'postAdCta', 'emptyCabinet',
    'settingsAndHelp', 'appVersion', 'ordersTruncated', 'createTitle', 'createSell',
    'createSellViaBot', 'createWanted', 'myQuestion', 'statusOpen', 'reasonOrderQuestion',
    'archive', 'archiveConfirmTitle', 'archiveConfirmBody',
  ]) {
    assert.ok(ruKeys.has(key), `ru is missing ${key}`);
    assert.ok(uzKeys.has(key), `uz is missing ${key}`);
  }
  // Project convention: U+2018 for o‘/g‘, U+2019 for the glottal stop, never '.
  assert.doesNotMatch(uz, /'[^,\n]*'[^,\n]*'/);
  const straight = [...uz.matchAll(/[A-Za-z]'[A-Za-z]/g)];
  assert.equal(straight.length, 0, 'the Uzbek block must not use a straight apostrophe');
});

// ── Hierarchy ─────────────────────────────────────────────────────────────────

test('diagnostics left the first screen without leaving the app', async () => {
  const cabinet = await source(CABINET);
  const v2 = homeV2Block(cabinet);
  assert.doesNotMatch(v2, /LaunchTimingPanel/);
  assert.doesNotMatch(v2, /timing-list/);
  // Still reachable, one level down, inside help.
  const settings = /if \(section === 'settings'\) \{[\s\S]*?\n {2}\}/.exec(cabinet)?.[0];
  assert.ok(settings, 'settings screen not found');
  assert.match(settings, /<LaunchTimingPanel locale=\{locale\} \/>/);
  assert.match(settings, /\{t\(locale, 'helpTitle'\)\}/);
  // And the measurement itself is unchanged.
  const api = await source('apps/market-mini-app/src/lib/api.ts');
  assert.match(api, /export function readLaunchTiming\(\): LaunchTiming \| null/);
  assert.match(api, /total;dur=/);
  const router = await source(ROUTER);
  const marks = [...router.matchAll(/mark\('([a-z]+)',/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(marks)].sort(), ['bind', 'identity', 'shelf', 'total', 'verify']);
});

test('the first screen leads with what waits and never with a title', async () => {
  const cabinet = await source(CABINET);
  const v2 = homeV2Block(cabinet);
  // No hero heading: the active tab already says where the person is.
  assert.doesNotMatch(v2, /<h1>/);
  // No role label.
  assert.doesNotMatch(v2, /roleBuyerSeller|roleBuyer/);
  // Order: identity, attention, primary, sections.
  const order = ['cabinet-identity', 'attentionTitle', 'cabinet-primary', 'cabinet-list'];
  let cursor = -1;
  for (const marker of order) {
    const at = v2.indexOf(marker);
    assert.ok(at > cursor, `${marker} is out of order`);
    cursor = at;
  }
});

test('one theme and one locale, whichever control is used', async () => {
  const app = await source(APP);
  assert.match(app, /const \[theme, setTheme\] = useState<ThemePreference>\(readThemePreference\)/);
  assert.match(app, /className="icon-button theme-button"/);
  assert.match(app, /onTheme=\{changeTheme\}/);
  const cabinet = await source(CABINET);
  assert.doesNotMatch(cabinet, /useState<ThemePreference>/);
  assert.doesNotMatch(cabinet, /useState<Locale>/);
  assert.match(cabinet, /onChange=\{onTheme\}/);
  assert.match(cabinet, /onChange=\{onLocale\}/);
});

test('the shell still shows exactly one bottom bar', async () => {
  const buyer = await source(BUYER);
  assert.match(buyer, /\{workspace \? null : <nav className="bottom-nav"/);
  const cabinet = await source(CABINET);
  assert.match(cabinet, /onWorkspace\(workspace\);/);
  const styles = await source(STYLES);
  assert.match(styles, /\.bottom-nav \{[^}]*grid-template-columns: repeat\(4, 1fr\)/);
});

// ── Navigation hint ───────────────────────────────────────────────────────────

test('the reported navigation is a hint and cannot introduce or grant anything', async () => {
  const buyer = await source(BUYER);
  assert.match(buyer, /const hinted = navigation\s*\n\s*\.map\(\(name\) => defaultTabs\.find\(\(tab\) => tab\[0\] === name\)\)/);
  assert.match(buyer, /const tabs = hinted\.length === defaultTabs\.length \? hinted : defaultTabs;/);
  // The shipped lists are still the only source of destinations.
  assert.match(buyer, /cabinetEnabled\s*\n?\s*\?\s*\(\[[\s\S]*?'publish'[\s\S]*?'cabinet'[\s\S]*?\]\s*as const\)/);
  assert.match(buyer, /:\s*\(\[[\s\S]*?'compare'[\s\S]*?'orders'[\s\S]*?\]\s*as const\)/);
  // A hint is never consulted for a capability: the one expression it feeds is
  // the order of the bar, and that expression cannot see a seller right at all.
  const hint = /const hinted = navigation[\s\S]*?\r?\n {2}const tabs = [^\r\n]*/.exec(buyer)?.[0];
  assert.ok(hint, 'the navigation hint derivation was not found');
  assert.doesNotMatch(hint, /[Ss]eller|flags|marketApi/);
  // And nothing else reads it, so it cannot reach a capability by another route:
  // one destructure, one derivation, no third reader. Module specifiers are cut
  // first — `platform/navigation` is a file name, not a reader of the hint.
  const body = buyer.replace(/^import [\s\S]*?from '[^']*';$/gm, '');
  const reads = [...body.matchAll(/(?<![.\w])navigation(?![:\w])/g)];
  assert.equal(reads.length, 2, 'navigation is destructured once and read once');
  const app = await source(APP);
  assert.match(app, /navigation=\{bootstrap\.data\.navigation \?\? \[\]\}/);
});

// ── Boundaries ────────────────────────────────────────────────────────────────

test('the slice adds no endpoint, no migration and no launch request', async () => {
  const migrations = await readdir(new URL('migrations/', ROOT));
  // 33: AUTH-1 added 0031 and 0032 and ADMIN-3B added 0033; none belongs to the
  // cabinet slice.
  assert.equal(migrations.length, 33, 'CAB-1 adds no migration');
  assert.ok(migrations.every((name) => !/cabinet/i.test(name)));
  const cabinet = await source(CABINET);
  // Every path this screen reads already existed before the slice.
  const calls = [...cabinet.matchAll(/marketApi\.\w+(?:<[^>]*>)?\('([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(calls)].sort(), ['/handoffs/active', '/seller/overview']);
  const buyer = await source(BUYER);
  const buyerCalls = [...buyer.matchAll(/marketApi\.\w+(?:<[^>]*>)?\('([^']+)'/g)].map((match) => match[1]);
  assert.ok(buyerCalls.includes('/checkout/active'), 'the resume path must read the existing endpoint');
  const router = await source(ROUTER);
  for (const path of ['/handoffs/active', '/seller/overview', '/checkout/active']) {
    assert.ok(router.includes(`path === '${path}'`), `${path} must already be routed`);
  }
  // Nothing new is fetched while the app is starting: the launch payload is
  // unchanged apart from one boolean.
  const api = await source('apps/market-mini-app/src/lib/api.ts');
  const launch = /export async function exchangeLaunch\(\)[\s\S]*?\n\}/.exec(api)?.[0] ?? '';
  assert.doesNotMatch(launch, /handoffs|seller\/overview|checkout/);
});

test('the shell change carries a new cache name', async () => {
  const worker = await source('apps/market-mini-app/public/sw.js');
  // v14 since AUTH-1F shipped the binding screen into the shell.
  assert.match(worker, /const CACHE = 'bormi-shell-v14'/);
  assert.match(worker, /keys\.filter\(\(key\) => key !== CACHE\)\.map\(\(key\) => caches\.delete\(key\)\)/);
});

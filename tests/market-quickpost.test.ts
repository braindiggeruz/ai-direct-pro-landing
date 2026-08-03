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
const QUICKPOST = 'apps/market-mini-app/src/screens/QuickPost.tsx';
const I18N = 'apps/market-mini-app/src/lib/i18n.ts';
const API = 'apps/market-mini-app/src/lib/api.ts';

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

// ── QP-1A · the manual composer ───────────────────────────────────────────────
//
// One page a person selling one thing can finish, reaching the same domain the
// seller cabinet's editor reaches. No voice, no AI, no new endpoint and no new
// table: what changes is what is asked for, in what order, and how much of the
// shop has to be understood first.

/** Source with its prose removed, for asserting about code rather than comments. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The QuickPost copy of one locale, as a `key: 'value'` map. */
function quickPostCopy(i18n: string, locale: 'ru' | 'uz'): Map<string, string> {
  const block = new RegExp(`\\n  ${locale}: \\{[\\s\\S]*?\\n  \\},`).exec(i18n)?.[0] ?? '';
  const found = new Map<string, string>();
  for (const [, key, value] of block.matchAll(/\n\s{4}(qp[A-Za-z]+|currency): '((?:[^'\\]|\\.)*)'/g)) {
    found.set(key, value);
  }
  return found;
}

test('QuickPost is a declared switch that ships off and fails closed', async () => {
  const wrangler = await source('wrangler.toml');
  // Off in the file that is deployed, so the bundle can land before the screen
  // does and turning it on is a reviewed line rather than a dashboard click.
  assert.match(wrangler, /MARKET_QUICKPOST_ENABLED = "false"/);
  assert.match(wrangler, /MARKET_QUICKPOST_AI_ENABLED = "false"/);
  // The same parser as every other market flag: only "true" is true.
  for (const value of ['1', 'yes', 'on', 'false', '', undefined]) {
    assert.equal(marketFlag(value), false, `${String(value)} must not enable QuickPost`);
  }
  const env = await source('functions/_types.ts');
  assert.match(env, /MARKET_QUICKPOST_ENABLED\?: string;/);
  assert.match(env, /MARKET_QUICKPOST_AI_ENABLED\?: string;/);
  const types = await source('apps/market-mini-app/src/types.ts');
  // Additive and optional: a bootstrap answered before this shipped is still a
  // valid payload and still produces the shipped behaviour.
  assert.match(types, /quickPost\?: boolean;/);
  assert.match(types, /quickPostAi\?: boolean;/);
});

test('both bootstrap payloads report the flag and no command branch reads it', async () => {
  const router = await source(ROUTER);
  const reported = [...router.matchAll(
    /quickPost: marketFlag\(context\.env\.MARKET_QUICKPOST_ENABLED\)/g,
  )];
  assert.equal(reported.length, 2, 'both bootstrap payloads must report the flag');
  const uses = [...router.matchAll(/MARKET_QUICKPOST_ENABLED/g)];
  assert.equal(uses.length, 2, 'the flag is read only by the two bootstrap payloads');
  // Never anywhere near a read or a command: it selects a screen, and a screen
  // is not a permission.
  const seller = /if \(path\.startsWith\('\/seller\/'\)\) \{[\s\S]*?\r?\n {2}\}/.exec(router)?.[0];
  assert.ok(seller, 'seller read branch not found');
  assert.doesNotMatch(seller, /MARKET_QUICKPOST|quickPost/);
  const commands = /async function sellerCommands\([\s\S]*?\r?\n\}/.exec(router)?.[0];
  assert.ok(commands, 'seller command branch not found');
  assert.doesNotMatch(commands, /MARKET_QUICKPOST|quickPost/);
});

test('the flag chooses a screen and the server still decides the authority', async () => {
  const app = await source(APP);
  assert.match(app, /const quickPostEnabled = bootstrap\.data\.flags\.quickPost === true;/);
  // No capability is derived from it, and none passes it on.
  const capabilityLines = app.split(/\r?\n/).filter(
    (line) => /(sellerAvailable|sellerCommands|mediaUpload|cabinetEnabled|cabinetHomeV2)\s*=/.test(line),
  );
  assert.ok(capabilityLines.length >= 5, 'capability declarations not found');
  for (const line of capabilityLines) assert.doesNotMatch(line, /quickPost/);
  const buyer = await source(BUYER);
  // Both conditions, and the grant is the one that can refuse.
  assert.match(buyer, /const quickPostReady = quickPostEnabled && sellerCommands;/);
  assert.match(buyer, /if \(quickPostReady\) \{/);
  // With either missing, "Продать" lands exactly where it shipped.
  assert.match(buyer, /setSellIntent\(true\);\s*\r?\n\s*setView\('cabinet'\);/);
  // Nothing in this build hands itself the authority.
  const quickpost = await source(QUICKPOST);
  assert.doesNotMatch(quickpost, /sellerCommands|sellerRead|sellerAvailable|membership/);
  assert.doesNotMatch(buyer, /sellerCommands\s*=\s*(true|Boolean)/);
});

test('a shopper never downloads the composer', async () => {
  const buyer = await source(BUYER);
  assert.match(buyer, /const QuickPost = lazy\(\(\) => import\('\.\/QuickPost'\)/);
  assert.match(buyer, /const QuickPostDone = lazy\(\(\) => import\('\.\/QuickPost'\)/);
  // A static import anywhere on the buyer path would put it in the first bundle
  // whatever the lazy() above says.
  assert.doesNotMatch(buyer, /^import .*from '\.\/QuickPost'/m);
  const app = await source(APP);
  assert.doesNotMatch(app, /QuickPost'/);
  // The shared component file knows nothing about the composer: the dependency
  // runs one way, so the card cannot pull the composer along behind it.
  assert.doesNotMatch(code(await source(UI)), /QuickPost/);
  // And the composer never drags the shop's editor in behind it.
  assert.doesNotMatch(code(await source(QUICKPOST)), /SellerApp|CabinetApp/);
});

test('opening the composer writes nothing anywhere', async () => {
  const quickpost = await source(QUICKPOST);
  // Every command this screen can send lives inside the publish mutation, so
  // arriving on it cannot leave an empty product behind.
  const mutation = /const publish = useMutation\(\{[\s\S]*?\r?\n {2}\}\);/.exec(quickpost)?.[0];
  assert.ok(mutation, 'publish mutation not found');
  assert.equal([...quickpost.matchAll(/marketApi\.post/g)].length, 2, 'only create and publish may post');
  assert.equal([...mutation.matchAll(/marketApi\.post/g)].length, 2, 'both posts belong to publish');
  // No effect performs a command on mount.
  assert.doesNotMatch(quickpost, /useEffect\([\s\S]{0,240}?marketApi\.(post|put|patch)/);
});

test('the draft is versioned, expiring, and holds nothing about the person', async () => {
  const quickpost = await source(QUICKPOST);
  assert.match(quickpost, /const DRAFT_VERSION = 1;/);
  assert.match(quickpost, /const DRAFT_TTL_MS = 7 \* 24 \* 60 \* 60 \* 1000;/);
  assert.match(quickpost, /const AUTOSAVE_MS = 400;/);
  // One draft, under one key.
  assert.equal([...quickpost.matchAll(/localStorage\.setItem/g)].length, 1);
  assert.match(quickpost, /window\.localStorage\.setItem\(DRAFT_KEY/);
  // Anything unexpected is dropped rather than half-restored.
  assert.match(quickpost, /if \(parsed\?\.version !== DRAFT_VERSION\) throw new Error\('version'\);/);
  assert.match(quickpost, /if \(Date\.now\(\) - parsed\.updatedAt > DRAFT_TTL_MS\) throw new Error\('expired'\);/);
  assert.match(quickpost, /\} catch \{\s*\r?\n\s*discardDraft\(\);\s*\r?\n\s*return null;/);
  // Refs, never bytes, and never anything that identifies anyone.
  const draftShape = /interface QuickDraft \{[\s\S]*?\r?\n\}/.exec(quickpost)?.[0];
  assert.ok(draftShape, 'draft shape not found');
  assert.doesNotMatch(draftShape, /Blob|File|base64|dataUrl|preview|initData|token|session|telegram|phone|address/i);
  assert.match(draftShape, /mediaRefs: string\[\];/);
  // The object URL of a picked photo exists only for this session.
  assert.match(quickpost, /\/\*\* Object URL for a photo picked in this session\. Never persisted\. \*\//);
});

test('"saved" is derived from the words, never claimed by a flag', async () => {
  const quickpost = await source(QUICKPOST);
  assert.match(quickpost, /const saved = savedSignature === signature;/);
  // The label and the guard read the same computed fact.
  assert.match(quickpost, /\{saved \? t\(locale, 'qpDraftSaved'\) : ''\}/);
  assert.match(quickpost, /if \(dirty && !saved\) \{/);
  // The signature only moves when the write actually landed.
  assert.match(quickpost, /window\.localStorage\.setItem\(DRAFT_KEY, JSON\.stringify\(draft\)\);\s*\r?\n\s*setSavedSignature\(signature\);/);
  assert.doesNotMatch(quickpost, /setSaved\(/);
});

test('a back gesture leaves by the door it opened, and never loses the words', async () => {
  const quickpost = await source(QUICKPOST);
  // Preview above composer; the dialog is a level of its own because Modal
  // registers one, so the order is dialog, preview, composer, previous screen.
  assert.match(quickpost, /useBackStop\(mode === 'preview', 'quickpost:preview', \(\) => setMode\('compose'\)\);/);
  const guard = /useBackStop\(mode === 'compose', 'quickpost:compose', \(\) => \{[\s\S]*?\r?\n {2}\}\);/.exec(quickpost)?.[0];
  assert.ok(guard, 'composer back stop not found');
  // Refusing costs nothing; accepting must actually leave, or the screen stays
  // on stage with no stop left and the next press closes the whole app.
  assert.match(guard, /return false;/);
  assert.match(guard, /onClose\(\);/);
  // Three answers, and none of them is a browser dialog.
  assert.doesNotMatch(quickpost, /window\.confirm|beforeunload/);
  for (const key of ['qpLeaveSave', 'qpLeaveDiscard', 'qpLeaveStay']) {
    assert.match(quickpost, new RegExp(`'${key}'`), `${key} must be offered`);
  }
  // Keeping the words is a real write, not a promise about one.
  assert.match(quickpost, /const leaveSaving = \(\) => \{\s*\r?\n\s*writeDraft\(\);/);
});

test('photos reuse the one pipeline and one failure never costs the others', async () => {
  const quickpost = await source(QUICKPOST);
  assert.match(quickpost, /const MAX_PHOTOS = 5;/);
  // The shrink-then-upload the seller editor already uses. No second pipeline.
  assert.match(quickpost, /compressImage, marketApi, uploadMedia/);
  assert.doesNotMatch(quickpost, /new FileReader|readAsDataURL|toDataURL/);
  // Sequential, and a file that failed took no slot.
  assert.match(quickpost, /for \(const file of files\) \{\s*\r?\n\s*if \(taken >= MAX_PHOTOS\) break;/);
  assert.match(quickpost, /rejected\.push\(file\);/);
  assert.match(quickpost, /onRetry=\{\(\) => void uploadFiles\(pendingFiles\)\}/);
  // Named states rather than a percentage the browser never reported.
  assert.match(quickpost, /busy \? t\(locale, 'qpPhotoUploading'\)/);
  assert.doesNotMatch(code(quickpost), /progress|percent/i);
  // Private media only: a ref, resolved through the authorised reader.
  assert.doesNotMatch(quickpost, /\.r2\.dev|pub-[a-z0-9]{8}/i);
  assert.match(quickpost, /<AsyncImage handle=\{photo\.ref\}/);
  // The ceiling is the domain's own, not a second opinion about it.
  const { CATALOG_LIMITS } = await import('../functions/agents/sotuvchi/catalog/validation');
  assert.equal(CATALOG_LIMITS.mediaRefCount, 5);
});

test('a price is a whole number of som, parsed in one place', async () => {
  const quickpost = await source(QUICKPOST);
  // Digits only, and the same grouping the buyer card shows.
  assert.equal([...quickpost.matchAll(/function digitsOf/g)].length, 1, 'one parser');
  assert.match(quickpost, /onChange=\{\(event\) => setPriceInput\(digitsOf\(event\.target\.value\)\)\}/);
  const { CATALOG_LIMITS } = await import('../functions/agents/sotuvchi/catalog/validation');
  assert.match(quickpost, /const PRICE_MAX = 1_000_000_000_000;/);
  assert.equal(CATALOG_LIMITS.priceMinor, 1_000_000_000_000);
  // A rejected price keeps what the person typed: validate only sets messages.
  const validate = /const validate = \(\): boolean => \{[\s\S]*?\r?\n {2}\};/.exec(quickpost)?.[0];
  assert.ok(validate, 'validate not found');
  assert.doesNotMatch(validate, /setPriceInput|setTitle|setDescription|setCategoryId/);
  // Nobody recommends anything.
  assert.doesNotMatch(quickpost, /suggest|recommend|discount/i);
});

test('a category can only be one this store owns', async () => {
  const buyer = await source(BUYER);
  // The seller's own list, read only while the composer is on stage.
  assert.match(buyer, /queryKey: \['seller-categories'\],[\s\S]{0,160}?enabled: composing,/);
  const quickpost = await source(QUICKPOST);
  // Nothing is typed into this field and no internal id is shown.
  assert.match(quickpost, /<option key=\{item\.id\} value=\{item\.id\}>\{item\.name\}<\/option>/);
  assert.doesNotMatch(quickpost, /createCategory|newCategory/);
  // A restored draft naming a category the store no longer has is dropped.
  assert.match(quickpost, /setCategoryId\(categories\.some\(\(item\) => item\.id === draft\.categoryId\) \? draft\.categoryId : ''\)/);
  // And the server re-checks whatever arrives.
  const service = await source('functions/agents/sotuvchi/catalog/service.ts');
  assert.match(service, /await this\.validateProductCategory\(context, input\.categoryId \?\? null, false\);/);
});

test('the preview publishes nothing and publishing is a separate, explicit press', async () => {
  const quickpost = await source(QUICKPOST);
  // Checking the listing only changes which screen is on.
  assert.match(quickpost, /onClick=\{\(\) => \{ if \(validate\(\)\) setMode\('preview'\); \}\}/);
  const preview = /if \(mode === 'preview'\) \{[\s\S]*?\r?\n {2}\}/.exec(quickpost)?.[0];
  assert.ok(preview, 'preview screen not found');
  assert.match(preview, /onClick=\{\(\) => publish\.mutate\(\)\}/);
  // Exactly one control publishes, and it is not reached by arriving.
  assert.equal([...quickpost.matchAll(/publish\.mutate\(\)/g)].length, 1);
  assert.doesNotMatch(quickpost, /useEffect\([\s\S]{0,240}?publish\.mutate/);
});

test('one press is one listing, however the network behaves', async () => {
  const quickpost = await source(QUICKPOST);
  // Two guards, for the two ways a retry duplicates. The id catches a reported
  // failure; the key catches silence, where this side has no id and the server
  // already has a product.
  assert.match(quickpost, /const createKey = useRef<string>\(crypto\.randomUUID\(\)\);/);
  assert.match(quickpost, /const publishKey = useRef<string>\(crypto\.randomUUID\(\)\);/);
  assert.match(quickpost, /if \(!createdId\.current\) \{[\s\S]{0,320}?createKey\.current,/);
  assert.match(quickpost, /\{ expectedVersion: createdVersion\.current \},\s*\r?\n\s*publishKey\.current,/);
  // The transport has to be able to carry the same key twice.
  const api = await source(API);
  assert.match(api, /headers\.set\('Idempotency-Key', options\.idempotencyKey \?\? crypto\.randomUUID\(\)\);/);
  assert.match(api, /post: <T>\(path: string, body\?: unknown, idempotencyKey\?: string\)/);
  // And the server replays a repeated key rather than performing it again.
  const service = await source('functions/agents/sotuvchi/catalog/service.ts');
  assert.match(service, /const replay = await this\.replayProduct\(context, operation\);\s*\r?\n\s*if \(replay\) return replay;/);
});

test('a conflict is re-read rather than guessed at', async () => {
  const quickpost = await source(QUICKPOST);
  assert.match(quickpost, /error\.status === 409/);
  assert.match(quickpost, /void reread\(\);/);
  const reread = /const reread = async \(\) => \{[\s\S]*?\r?\n {2}\};/.exec(quickpost)?.[0];
  assert.ok(reread, 'reread not found');
  // The version comes back from the server, and the losing key is retired with
  // it so the next press is a new attempt rather than a replayed failure.
  assert.match(reread, /createdVersion\.current = current\.product\.version;/);
  assert.match(reread, /publishKey\.current = crypto\.randomUUID\(\);/);
  // A version is never invented.
  assert.doesNotMatch(quickpost, /createdVersion\.current = 0;/);
  assert.match(quickpost, /\{t\(locale, 'conflictBody'\)\}/);
});

test('the preview is the shopper card itself, and the shopper card is unchanged', async () => {
  const quickpost = await source(QUICKPOST);
  const ui = await source(UI);
  const buyer = await source(BUYER);
  // One component, three places: the shelf, the composer's preview, and the
  // screen that follows a publication.
  assert.match(ui, /export function ProductCard\(\{/);
  assert.match(quickpost, /<ProductCard product=\{previewProduct\} locale=\{locale\} onOpen=\{\(\) => undefined\} \/>/);
  assert.match(quickpost, /<ProductCard product=\{product\} locale=\{locale\} onOpen=\{onOpen\} \/>/);
  // No second card is drawn anywhere on this screen.
  assert.doesNotMatch(quickpost, /className="product-card"/);
  // The buyer keeps the card it shipped: same markup, same tone, same label.
  // Only the compare action became optional, because a preview has none.
  assert.match(ui, /<span className="product-card__store">\{product\.storeName\}<\/span>/);
  assert.match(ui, /<Badge tone=\{availabilityTone\(product\.availability\)\}>\{labelForStatus\(locale, product\.availability\)\}<\/Badge>/);
  assert.match(ui, /onCompare\?: \(\) => void;/);
  assert.match(ui, /\{onCompare \? <Button variant="secondary"/);
  assert.match(buyer, /\n {2}ProductCard,/);
  assert.doesNotMatch(buyer, /function ProductCard\(/);
});

test('QuickPost offers nothing it cannot do', async () => {
  const full = await source(QUICKPOST);
  const quickpost = code(full);
  // No voice, no AI, no vision — and no greyed-out promise of them either.
  assert.doesNotMatch(quickpost, /voice|microphone|Recorder|transcri|speech/i);
  assert.doesNotMatch(quickpost, /\bAI\b|gpt|llm|autofill/i);
  assert.doesNotMatch(quickpost, /soon|coming|tez kunda/i);
  assert.doesNotMatch(quickpost, /quickPostAi/);
  // Nothing offers to share a link that does not exist yet.
  assert.doesNotMatch(quickpost, /share|ulashish/i);
  // The only handler that deliberately does nothing is the preview card's, and
  // it is the one control whose whole point is that it does not open.
  assert.equal(
    [...quickpost.matchAll(/onClick=\{\(\) => undefined\}/g)].length,
    0,
    'a dead button is worse than a missing one',
  );
  assert.equal([...quickpost.matchAll(/onOpen=\{\(\) => undefined\}/g)].length, 1);
});

test('the composer speaks both languages, and Uzbek with the right apostrophe', async () => {
  const i18n = await source(I18N);
  const ru = quickPostCopy(i18n, 'ru');
  const uz = quickPostCopy(i18n, 'uz');
  assert.ok(ru.size >= 40, `expected the QuickPost copy, found ${ru.size}`);
  assert.deepEqual([...uz.keys()].sort(), [...ru.keys()].sort(), 'RU and UZ carry the same keys');
  for (const [key, value] of ru) assert.ok(value.trim(), `${key} is empty in ru`);
  for (const [key, value] of uz) {
    assert.ok(value.trim(), `${key} is empty in uz`);
    // A typewriter apostrophe would have to be escaped to survive the quotes
    // around it, so its escape is the tell. Uzbek uses ‘ for o‘/g‘ and ’ for
    // the tutuq belgisi, never '.
    assert.doesNotMatch(value, /\\'/, `${key} uses an ASCII apostrophe in uz`);
  }
  // The screen reads its copy rather than carrying any of its own: no visible
  // word is written where only one language could reach it.
  const quickpost = code(await source(QUICKPOST));
  assert.doesNotMatch(quickpost, /[А-Яа-яЁё]{3,}/, 'no Russian string outside the copy table');
  // Every key it asks for exists in the table, including the ones it borrows
  // from the cabinet rather than declaring a second time.
  for (const [, key] of quickpost.matchAll(/t\(locale, '([a-zA-Z]+)'\)/g)) {
    assert.match(i18n, new RegExp(`[\\s,]${key}: '`), `${key} is missing from the copy table`);
  }
});

test('the fallback offers to sell, and never to open a business', async () => {
  const i18n = await source(I18N);
  // The branch a person reaches when the flag is off or the server has not
  // granted the commands. It is the overwhelming majority of people, so its
  // wording is the product for now.
  const fallback = (locale: 'ru' | 'uz') => {
    const block = new RegExp(`\\n  ${locale}: \\{[\\s\\S]*?\\n  \\},`).exec(i18n)?.[0] ?? '';
    const read = (key: string) => new RegExp(`\\n\\s{4}${key}: '((?:[^'\\\\]|\\\\.)*)'`).exec(block)?.[1];
    return { title: read('createSellViaBot'), hint: read('createSellViaBotHint') };
  };
  const first = fallback('ru');
  const second = fallback('uz');
  // The same verb as the granted branch: what a person wants to do does not
  // change with a flag, only where it currently happens.
  assert.equal(first.title, 'Продать');
  assert.equal(second.title, 'Sotish');
  assert.ok(first.hint && second.hint, 'both subtitles must exist');
  // Nobody is told they are opening a shop, registering a business, becoming a
  // seller or setting up a storefront — none of which is what they asked to do.
  for (const text of [first.title, first.hint]) {
    assert.doesNotMatch(text!, /магазин|организац|бизнес|витрин|зарегистр|рабоче[ег]|стать продавцом/i);
  }
  for (const text of [second.title, second.hint]) {
    assert.doesNotMatch(text!, /do‘kon|dokon|tashkilot|biznes|ro‘yxat|royxat|sotuvchi bo‘l/i);
  }
  // Both say where publishing happens today, and both name the bot.
  assert.match(first.hint!, /Bormi/);
  assert.match(second.hint!, /Bormi/);
  // Uzbek keeps the project apostrophe convention.
  assert.doesNotMatch(second.hint!, /\\'/);
  // The control still goes to the real bot destination and invents no new URL.
  const buyer = await source(BUYER);
  assert.match(buyer, /href=\{SELLER_START_URL\}/);
  assert.doesNotMatch(buyer, /https:\/\/t\.me\//);
});

test('QP-1A adds no migration, no endpoint, no launch request and no authority', async () => {
  const migrations = await readdir(new URL('migrations/', ROOT));
  assert.equal(migrations.length, 30, 'QP-1A adds no migration');
  assert.ok(migrations.every((name) => !/quickpost/i.test(name)));
  const router = await source(ROUTER);
  assert.doesNotMatch(router, /\/quickpost|quick_post/);
  const quickpost = await source(QUICKPOST);
  // Every path it touches is one the seller cabinet already calls.
  const paths = [...quickpost.matchAll(/marketApi\.\w+<[^>]*>\(\s*`?'?(\/[^`'$]*)/g)].map((hit) => hit[1]);
  assert.ok(paths.length >= 3, 'the seller calls were not found');
  for (const path of paths) {
    assert.match(path, /^\/seller\/(products|media)/, `${path} is not an existing seller route`);
  }
  const api = await source(API);
  const launch = /export async function exchangeLaunch\(\)[\s\S]*?\r?\n\}/.exec(api)?.[0] ?? '';
  assert.doesNotMatch(launch, /quickPost|QuickPost/);
  // The resolver that decides who may sell is untouched by all of this.
  const access = await source('functions/market/access.ts');
  assert.doesNotMatch(access, /quickPost/i);
});

test('nothing about the person leaves the device or reaches an analytics call', async () => {
  const quickpost = code(await source(QUICKPOST));
  assert.doesNotMatch(quickpost, /initData|Authorization|Bearer|sessionStorage|document\.cookie/);
  assert.doesNotMatch(quickpost, /telegram_id|telegramId|userId|phone|address/i);
  assert.doesNotMatch(quickpost, /gtag|analytics|track\(|sendBeacon/i);
  // The only platform call is the one that makes the phone buzz.
  assert.match(quickpost, /import \{ haptic \} from '\.\.\/platform\/telegram';/);
});

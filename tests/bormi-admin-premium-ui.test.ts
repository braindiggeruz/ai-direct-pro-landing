// The premium operational UI: the properties that are cheap to break and
// expensive to discover.
//
// These are source-inspection tests, like the rest of the bormi-admin corpus.
// They are not a substitute for looking at the panel - they are here because
// the things below are all invisible in a screenshot: whether a success tick is
// tied to a server answer or to a timer, whether a tab writes a server filter
// or slices the page in the browser, whether a warning names the one thing it
// is about, and whether the console quietly grew a second icon library.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

/** Source with prose removed, so assertions test code and not comments. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const PREMIUM = 'apps/bormi-admin/src/components/premium.tsx';
const SHELL = 'apps/bormi-admin/src/components/AppShell.tsx';
const STYLES = 'apps/bormi-admin/src/styles.css';
const ACCESS = 'apps/bormi-admin/src/pages/Access.tsx';
const OVERVIEW = 'apps/bormi-admin/src/pages/Overview.tsx';
const LISTINGS = 'apps/bormi-admin/src/pages/Listings.tsx';
const MODERATION = 'apps/bormi-admin/src/pages/Moderation.tsx';
const MODERATION_DETAIL = 'apps/bormi-admin/src/pages/ModerationDetail.tsx';
const REPORTS = 'apps/bormi-admin/src/pages/Reports.tsx';
const NOTICES = 'apps/bormi-admin/THIRD_PARTY_NOTICES.md';
const MANIFEST = 'apps/bormi-admin/package.json';

const SCREENS = [
  'apps/bormi-admin/src/pages/Overview.tsx',
  'apps/bormi-admin/src/pages/Listings.tsx',
  'apps/bormi-admin/src/pages/ListingDetail.tsx',
  'apps/bormi-admin/src/pages/Moderation.tsx',
  'apps/bormi-admin/src/pages/ModerationDetail.tsx',
  'apps/bormi-admin/src/pages/Reports.tsx',
  'apps/bormi-admin/src/pages/Categories.tsx',
  'apps/bormi-admin/src/pages/Operations.tsx',
  'apps/bormi-admin/src/pages/Access.tsx',
  'apps/bormi-admin/src/pages/Audit.tsx',
  'apps/bormi-admin/src/pages/System.tsx',
];

test('access: the seller warning names the store and never the marketplace', async () => {
  // Comments stripped: the file's own header quotes the old sentence to explain
  // why it went, and a test that cannot tell a quotation from a string literal
  // would forbid ever writing down what was fixed.
  const screen = code(await source(ACCESS));

  // The sentence that was wrong in production. «Кабинетом продавца никто не
  // может пользоваться» is a claim about everybody; the thing without access is
  // one storefront's cabinet.
  assert.doesNotMatch(
    screen,
    /Кабинетом продавца никто не может пользоваться/,
    'the unscoped warning is back: it reads as a claim about every seller',
  );
  assert.match(screen, /нет Telegram-доступа продавца/);

  // And the correction is on screen rather than implied: a private seller is
  // not an unbound store seller, and the operator has to be told so where the
  // warning is, not in a document.
  assert.match(screen, /Частные продавцы работают независимо/);
  assert.match(screen, /data-testid="access-scope-note"/);
});

test('access: private sellers are never counted as store seller authority', async () => {
  const screen = code(await source(ACCESS));
  // `telegram_active` is a store-membership count. If a screen ever derives a
  // private-seller number from it, the two authorities have been conflated.
  const claims = screen.match(/telegram_active[^\n]*/g) ?? [];
  for (const claim of claims) {
    assert.doesNotMatch(
      claim,
      /частн|private/i,
      'a private-seller statement is being derived from the store membership count',
    );
  }
});

test('commands: success is a server answer, never a timer', async () => {
  const premium = code(await source(PREMIUM));

  const start = premium.indexOf('export function useCommand');
  assert.notEqual(start, -1, 'useCommand is gone; this test is stale');
  const body = premium.slice(start, premium.indexOf('\nexport ', start + 1));

  // The failure this guards is the useLayouts original, which sets `success`
  // inside a setTimeout. Here the only setTimeout is the one that *clears* a
  // success back to idle, and it must never be the thing that sets it.
  const timers = body.match(/setTimeout\([\s\S]*?\)/g) ?? [];
  for (const timer of timers) {
    assert.doesNotMatch(
      timer,
      /setState\('success'\)/,
      'a success state is being reached on a timer rather than on a server answer',
    );
  }
  assert.match(body, /await fn\(\);[\s\S]*?setState\('success'\)/);
  // A failure has to be reachable, or every command reports success.
  assert.match(body, /catch[\s\S]*?setState\('error'\)/);
});

test('commands: a command in flight cannot be submitted twice', async () => {
  const premium = code(await source(PREMIUM));
  const start = premium.indexOf('export function StatusButton');
  const body = premium.slice(start, premium.indexOf('\nexport ', start + 1));
  assert.match(
    body,
    /disabled=\{disabled \|\| busy \|\| state === 'success'\}/,
    'the button stays clickable while its command is in flight',
  );
  assert.match(body, /aria-busy=\{busy\}/);
  // The outcome is announced, not only drawn.
  assert.match(body, /aria-live="polite"/);
});

test('moderation detail: the confirm button reports the real outcome', async () => {
  const screen = code(await source(MODERATION_DETAIL));
  // `outcome` is set from the server response and covers the 409 case
  // (`already`), so both map to a finished command rather than to a fresh one.
  assert.match(
    screen,
    /state=\{pending \? 'loading' : error \? 'error' : outcome \? 'success' : 'idle'\}/,
    'the moderation confirm button no longer derives its state from the request',
  );
  // The buttons that merely open the confirmation must not claim an outcome.
  const toolbar = screen.slice(screen.indexOf('<DynamicToolbar'), screen.indexOf('</DynamicToolbar>'));
  assert.doesNotMatch(toolbar, /StatusButton/, 'a button that only opens a dialog is reporting a command state');
});

test('filters: every tab bar writes a server filter, not a browser slice', async () => {
  for (const [file, handler] of [
    [LISTINGS, "onChange={(value) => set('status', value)}"],
    [MODERATION, 'onChange={setState}'],
    [REPORTS, 'onChange={setStatus}'],
  ] as const) {
    const screen = await source(file);
    assert.match(screen, /<DiscreteTabs/, `${file} has no tab bar`);
    assert.ok(screen.includes(handler), `${file} tab bar does not drive its server filter`);
    // The handlers above all write the URL, which is what the query key reads.
    assert.match(screen, /setParams\(/, `${file} tab bar does not reach the request`);
  }
});

test('filters: the tab bar is a real tablist pointing at the region it filters', async () => {
  const premium = code(await source(PREMIUM));
  const start = premium.indexOf('export function DiscreteTabs');
  const body = premium.slice(start, premium.indexOf('\nexport ', start + 1));
  assert.match(body, /role="tablist"/);
  assert.match(body, /role="tab"/);
  assert.match(body, /aria-selected=\{active\}/);
  assert.match(body, /aria-controls=\{controls\}/);
  // A tablist promises arrow keys. Claiming the role without them is a lie the
  // keyboard finds out about.
  assert.match(body, /ArrowLeft/);
  assert.match(body, /ArrowRight/);
  // Roving tabindex, or Tab lands on all five filters in turn.
  assert.match(body, /tabIndex=\{active \? 0 : -1\}/);

  for (const [file, id] of [
    [LISTINGS, 'listings-table'],
    [MODERATION, 'moderation-queue'],
    [REPORTS, 'reports-queue'],
  ] as const) {
    const screen = await source(file);
    assert.ok(screen.includes(`controls="${id}"`), `${file} tabs point at nothing`);
    assert.ok(screen.includes(`id="${id}"`), `${file} has no region for its tabs to point at`);
  }
});

test('motion: reduced motion is honoured in JavaScript, not only in CSS', async () => {
  const premium = code(await source(PREMIUM));
  const shell = code(await source(SHELL));

  // A CSS rule that shortens durations still mounts the animation and still
  // starts elements at opacity 0. These components skip the initial state
  // entirely, which is the only version that cannot leave content invisible.
  assert.match(premium, /useReducedMotion/);
  assert.match(shell, /useReducedMotion/);
  assert.match(premium, /initial=\{still \? false :/);

  const styles = await source(STYLES);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('motion: nothing loops, and durations stay inside the console budget', async () => {
  const premium = code(await source(PREMIUM));
  assert.doesNotMatch(premium, /repeat:\s*Infinity/, 'an animation loops forever on an operations screen');
  assert.doesNotMatch(premium, /repeatType/, 'an animation is set to repeat');

  // 120-240ms. Anything longer is a console that feels slower than it is.
  for (const match of premium.match(/duration:\s*([0-9.]+)/g) ?? []) {
    const seconds = Number(match.replace(/duration:\s*/, ''));
    assert.ok(seconds <= 0.24, `a transition runs for ${seconds}s, past the 240ms budget`);
  }
});

test('shell: the rail badge is a real count and a zero draws nothing', async () => {
  const shell = code(await source(SHELL));
  // `> 0` rather than truthiness on a possibly-undefined number: an unknown
  // count and a zero are different facts, and neither deserves a badge.
  assert.match(shell, /typeof count === 'number' && count > 0/);
  assert.match(shell, /counts\?\.\[item\.badge\]/);
});

test('shell: the active section is one travelling indicator, and still says so', async () => {
  const shell = code(await source(SHELL));
  assert.match(shell, /layoutId="rail-active-bg"/);
  assert.match(shell, /layoutId="rail-active-bar"/);
  // Motion must not replace the semantics: a screen reader learns the current
  // page from `aria-current`, not from a moving div.
  assert.match(shell, /aria-current=\{location\.pathname === item\.to \? 'page' : undefined\}/);
});

test('shell: the mobile sheet still traps focus and restores it', async () => {
  const shell = code(await source(SHELL));
  assert.match(shell, /role=\{open \? 'dialog' : undefined\}/);
  assert.match(shell, /aria-modal=\{open \? true : undefined\}/);
  assert.match(shell, /event\.key === 'Escape'/);
  assert.match(shell, /openButton\.current\?\.focus\(\)/);
  // The page behind a modal is not there to read.
  assert.match(shell, /aria-hidden=\{open \? true : undefined\}/);
  // And the skip link still lands somewhere focusable.
  assert.match(shell, /href="#bormi-admin-main"/);
  assert.match(shell, /id="bormi-admin-main"/);
  assert.match(shell, /tabIndex=\{-1\}/);
});

test('theme: the choice survives a reload and both themes define every token', async () => {
  const shell = code(await source(SHELL));
  assert.match(shell, /localStorage\.setItem\('bormi_admin_theme'/);

  const styles = await source(STYLES);
  const root = styles.slice(styles.indexOf(':root {'), styles.indexOf('.dark {'));
  const dark = styles.slice(styles.indexOf('.dark {'));
  const names = [...root.matchAll(/(--admin-[a-z-]+):/g)].map((match) => match[1]);
  assert.ok(names.length > 20, 'the token block is gone; this test is stale');
  for (const name of names) {
    // Radii and shadows are shared on purpose; colours are not, and a colour
    // that only exists in light mode is a dark screen with a hole in it.
    if (name.startsWith('--admin-radius')) continue;
    assert.ok(
      dark.includes(`${name}:`),
      `${name} has no dark value, so dark mode falls back to the light one`,
    );
  }
});

test('tokens: no screen paints with a raw colour instead of a token', async () => {
  for (const file of SCREENS) {
    const screen = code(await source(file));
    // A hex literal in a screen is a colour that will not follow the theme.
    assert.doesNotMatch(
      screen,
      /#[0-9a-fA-F]{6}\b/,
      `${file} contains a hard-coded colour that cannot follow the dark theme`,
    );
    // Tailwind's own palette is the same problem wearing a different hat.
    assert.doesNotMatch(
      screen,
      /\b(?:bg|text|border)-(?:red|green|blue|amber|emerald|slate|gray|zinc|indigo|violet)-\d{2,3}\b/,
      `${file} uses a Tailwind palette colour instead of an --admin-* token`,
    );
  }
});

test('honesty: the redesign invented no data', async () => {
  const premium = code(await source(PREMIUM));
  // The useLayouts originals ship invented teammates and avatars on a third
  // party host. None of that may survive the adaptation.
  assert.doesNotMatch(premium, /tapback\.co/);
  assert.doesNotMatch(premium, /https?:\/\//, 'the premium layer fetches from a remote host');
  assert.doesNotMatch(premium, /avatar/i, 'the console grew avatars it has no faces for');

  const overview = code(await source(OVERVIEW));
  for (const invented of ['revenue', 'conversion', 'выручка', 'конверси', 'просмотр']) {
    const uses = overview.toLowerCase().split(invented.toLowerCase()).length - 1;
    if (invented === 'просмотр' || invented === 'конверси') {
      // These two appear only in the sentence that says they are NOT measured.
      continue;
    }
    assert.equal(uses, 0, `the command centre draws ${invented}, which nothing measures`);
  }
});

test('honesty: the command centre labels a count it cannot split', async () => {
  const overview = await source(OVERVIEW);
  // `/api/admin/overview` counts sotuvchi_products without joining stores, so
  // its status counts include private classified listings while the activity
  // table below joins stores. The screen has to say so rather than imply a
  // separation the endpoint does not make.
  assert.match(overview, /Все объявления: и магазинов, и частные/);
  assert.match(overview, /не разделён на магазины и частные/);
});

test('privacy: no screen reaches for an identity the panel must not show', async () => {
  for (const file of [...SCREENS, PREMIUM, SHELL]) {
    const screen = code(await source(file));
    assert.doesNotMatch(
      screen,
      /telegram_id|telegram_username|reporter_id|reporter_identity|phone_number/i,
      `${file} reads an identity field the console is not allowed to display`,
    );
  }
});

test('dependencies: one animation library and no second icon set', async () => {
  const manifest = JSON.parse(await source(MANIFEST)) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const all = { ...manifest.dependencies, ...manifest.devDependencies };

  assert.ok(all.motion, 'motion is not declared, so the panel relies on hoisting from the root');

  // The useLayouts registry entries list these. The panel already draws its own
  // icons on one 24 grid, and a second icon set is two visual grammars.
  for (const unwanted of ['@hugeicons/react', '@hugeicons/core-free-icons', 'lucide-react', 'react-icons']) {
    assert.equal(all[unwanted], undefined, `${unwanted} was added; the panel already has an icon set`);
  }
  // shadcn's init would have brought these plus a components.json.
  assert.equal(all['tailwindcss-animate'], undefined);
  assert.equal(all['class-variance-authority'], undefined);
});

test('licence: the adaptation is attributed with a pinned source', async () => {
  const notices = await source(NOTICES);
  assert.match(notices, /useLayouts/);
  assert.match(notices, /MIT/);
  assert.match(notices, /Urvish Mali/);
  // A pin, not a moving target: "adapted from the latest version" is not a
  // statement anybody can check later.
  assert.match(notices, /5ed0d94454374b47ed9805bf204a412bc2d3d456/);
  for (const component of ['bento-card', 'discrete-tabs', 'status-button', 'stacked-list', 'list-item', 'dynamic-toolbar']) {
    assert.ok(notices.includes(component), `${component} was adapted but is not attributed`);
  }
});

test('shadcn init never ran', async () => {
  // `components.json` is what the CLI writes, and its presence would mean the
  // panel's Tailwind, tsconfig and aliases were rewritten by a generator.
  await assert.rejects(
    () => source('apps/bormi-admin/components.json'),
    'components.json exists: shadcn init rewrote the panel configuration',
  );
});

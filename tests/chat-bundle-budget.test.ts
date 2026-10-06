// The AI-chat bundle budget (plan WP-10, 10-PROD-PLAN §1): the gate's logic on
// a fixture manifest, the source graph that keeps the lazy parts out of the
// start bundle, and the places the gate runs. No build needed.
//
// Run: node --import tsx --test tests/chat-bundle-budget.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

import {
  BASELINE_FILE, CHAT_BUDGET, assertChatBundleBudget, brotliSize, budgetFailures, measureChatBundle, readBaseline,
  staticClosure, type BundleBaseline,
} from '../scripts/chat-bundle-budget';
import { ENTRIES, type ViteManifest } from '../scripts/vite-manifest';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/** Shaped like Vite's manifest for the chat: three parts, one chunk shared by two. */
const MANIFEST: ViteManifest = {
  'src/gpt-chat/main.tsx': {
    file: 'assets/gpt-chat-entry.js', name: 'gpt-chat', src: 'src/gpt-chat/main.tsx', isEntry: true,
    imports: ['_vendor.js', '_runtime.js'],
    dynamicImports: ['src/gpt-chat/parts/chat-account.ts', 'src/gpt-chat/parts/chat-lead.ts', 'src/gpt-chat/parts/chat-tools.ts'],
    css: ['assets/site.css'],
  },
  '_vendor.js': { file: 'assets/vendor.js', name: 'vendor', imports: ['_runtime.js'] },
  '_runtime.js': { file: 'assets/runtime.js', name: 'runtime' },
  '_check.js': { file: 'assets/check.js', name: 'check', imports: ['_vendor.js'] },
  'src/gpt-chat/parts/chat-account.ts': {
    file: 'assets/chat-account.js', name: 'chat-account', isDynamicEntry: true,
    imports: ['_vendor.js', '_check.js', 'src/gpt-chat/main.tsx'],
    dynamicImports: ['src/gpt-chat/parts/chat-uzum.ts'],
  },
  'src/gpt-chat/parts/chat-uzum.ts': { file: 'assets/chat-uzum.js', name: 'chat-uzum', isDynamicEntry: true, imports: ['src/gpt-chat/parts/chat-account.ts'] },
  'src/gpt-chat/parts/chat-lead.ts': {
    file: 'assets/chat-lead.js', name: 'chat-lead', isDynamicEntry: true, imports: ['_check.js', 'src/gpt-chat/main.tsx'],
  },
  'src/gpt-chat/parts/chat-tools.ts': { file: 'assets/chat-tools.js', name: 'chat-tools', isDynamicEntry: true, imports: ['src/gpt-chat/main.tsx'] },
  'index.html': { file: 'assets/index-landing.js', name: 'index', src: 'index.html', isEntry: true, imports: ['_vendor.js'], css: ['assets/index.css'] },
};
const SIZES: Record<string, number> = {
  'assets/gpt-chat-entry.js': 40_000, 'assets/vendor.js': 57_000, 'assets/runtime.js': 400,
  'assets/check.js': 300, 'assets/chat-account.js': 4_000, 'assets/chat-uzum.js': 1_500,
  'assets/chat-lead.js': 3_000, 'assets/chat-tools.js': 6_000, 'assets/index-landing.js': 12_000,
  'assets/site.css': 6_000, 'assets/index.css': 20_000,
};
const size = (file: string) => SIZES[file] ?? assert.fail(`unexpected file ${file}`);
const baseline = (over: Partial<BundleBaseline> = {}): BundleBaseline => ({
  schema: 1, recordedAt: '2026-10-01T00:00:00.000Z', source: 'fixture', entry: ENTRIES.chat,
  startBytes: 97_400, parts: { 'chat-account': 4_300, 'chat-lead': 3_300, 'chat-tools': 6_000 }, ...over,
});

test('the start is the entry and its static imports; import() is never followed into it', () => {
  assert.deepEqual(staticClosure(MANIFEST, [ENTRIES.chat]).sort(), ['_runtime.js', '_vendor.js', 'src/gpt-chat/main.tsx']);
  assert.throws(() => staticClosure(MANIFEST, ['missing.js']), /no chunk missing\.js/);
  const report = measureChatBundle(MANIFEST, size);
  assert.deepEqual(report.start, {
    bytes: 40_000 + 57_000 + 400,
    files: ['assets/gpt-chat-entry.js', 'assets/runtime.js', 'assets/vendor.js'],
  });
});

test('a lazy part costs what it adds to the start: a shared chunk counts in each part, a part in a part counts', () => {
  const parts = Object.fromEntries(measureChatBundle(MANIFEST, size).parts.map((part) => [part.name, part]));
  assert.deepEqual(Object.keys(parts), ['chat-account', 'chat-lead', 'chat-tools', 'chat-uzum']);
  // vendor and the entry are already loaded; the shared icon chunk is not.
  assert.deepEqual(parts['chat-account'].files, ['assets/chat-account.js', 'assets/check.js']);
  assert.equal(parts['chat-account'].bytes, 4_300);
  assert.deepEqual(parts['chat-lead'].files, ['assets/chat-lead.js', 'assets/check.js']);
  assert.equal(parts['chat-tools'].bytes, 6_000);
  // Reached only through chat-account: it brings chat-account along if it loads first.
  assert.equal(parts['chat-uzum'].bytes, 1_500 + 4_000 + 300);
  assert.throws(() => measureChatBundle(MANIFEST, size, 'src/missing.tsx'), /not in the manifest/);
});

test('a module import()ed by the start but also imported statically is no part: it is in the start', () => {
  const manifest: ViteManifest = structuredClone(MANIFEST);
  manifest[ENTRIES.chat].imports!.push('src/gpt-chat/parts/chat-tools.ts');
  const report = measureChatBundle(manifest, size);
  assert.ok(!report.parts.some((part) => part.name === 'chat-tools'));
  assert.ok(report.start.files.includes('assets/chat-tools.js'));
  assert.deepEqual(budgetFailures(report, baseline()), [
    'start grew 6.0 kB since the baseline (97.4 kB) > 3.0 kB',
    'lazy part chat-tools is gone: is it imported statically now?',
  ]);
});

test('the thresholds: start ≤ 110 kB, every part ≤ 12 kB, start growth ≤ 3 kB per release', () => {
  assert.deepEqual(CHAT_BUDGET, { start: 110_000, lazyPart: 12_000, startGrowth: 3_000, startCss: 7_000, startCssGrowth: 1_000, pageCss: 27_000 });
  const report = measureChatBundle(MANIFEST, size);
  assert.deepEqual(budgetFailures(report, baseline()), [], 'the fixture passes');
  assert.deepEqual(budgetFailures(report, baseline({ startBytes: 94_400 })), [], 'exactly +3 kB passes');
  assert.deepEqual(budgetFailures(report, baseline({ startBytes: 94_399 })), ['start grew 3.0 kB since the baseline (94.4 kB) > 3.0 kB']);
  assert.deepEqual(budgetFailures(report, baseline(), { ...CHAT_BUDGET, start: 97_399 }), ['start 97.4 kB > 97.4 kB']);
  assert.deepEqual(budgetFailures(report, baseline(), { ...CHAT_BUDGET, lazyPart: 5_000 }), [
    'lazy part chat-tools 6.0 kB > 5.0 kB',
    'lazy part chat-uzum 5.8 kB > 5.0 kB',
  ]);
  // A shrinking start or a new part is no failure; a missing or foreign baseline is.
  assert.deepEqual(budgetFailures(report, baseline({ startBytes: 120_000, parts: {} })), []);
  assert.deepEqual(budgetFailures(report, null), [`no baseline: record one with --record (${BASELINE_FILE})`]);
  assert.deepEqual(budgetFailures(report, baseline({ entry: ENTRIES.calculator })), [`baseline is for ${ENTRIES.calculator}, not ${ENTRIES.chat}`]);
});

test('the chat’s own stylesheet and the page’s render-blocking CSS: measured, capped, and the sheet’s growth per release', () => {
  const report = measureChatBundle(MANIFEST, size);
  // The CSS the start's chunks import is the chat's sheet; the landing entry's is the site's, on every page.
  assert.deepEqual(report.startCss, { bytes: 6_000, files: ['assets/site.css'] });
  assert.deepEqual(report.pageCss, { bytes: 26_000, files: ['assets/index.css', 'assets/site.css'] });
  assert.deepEqual(budgetFailures(report, baseline()), [], 'a schema 1 baseline has no CSS to grow from');
  assert.deepEqual(budgetFailures(report, baseline({ schema: 2, startCssBytes: 5_000 })), [], 'exactly +1 kB passes');
  assert.deepEqual(budgetFailures(report, baseline({ schema: 2, startCssBytes: 4_999 })), ['start CSS grew 1.0 kB since the baseline (5.0 kB) > 1.0 kB']);
  assert.deepEqual(budgetFailures(report, baseline(), { ...CHAT_BUDGET, startCss: 5_999 }), ['start CSS 6.0 kB > 6.0 kB']);
  // Moving rules from the chat's sheet into the site's cannot hide growth: the page's total is capped too.
  assert.deepEqual(budgetFailures(report, baseline(), { ...CHAT_BUDGET, pageCss: 25_999 }), ['page CSS 26.0 kB > 26.0 kB']);
  // The current build's sheet within its cap (chat design 2026-10-06: about 6.5 kB).
  assert.ok(CHAT_BUDGET.startCss >= 6_500 && CHAT_BUDGET.pageCss < 24_267 + 3_000);
});

test('brotli quality 11 per file, the same size every time', () => {
  const code = Buffer.from('export const answer = () => 42;\n'.repeat(400));
  const once = brotliSize(code);
  assert.equal(brotliSize(code), once);
  assert.ok(once > 0 && once < code.length / 20, `${once} bytes`);
});

test('the gate reads a built dist/ and its baseline, and refuses a build without a manifest', (t) => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-chat-budget-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  const baselineFile = path.join(dist, 'baseline.json');
  assert.throws(() => assertChatBundleBudget(dist, baselineFile), /Missing \.vite\/manifest\.json/);
  fs.mkdirSync(path.join(dist, '.vite'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, '.vite/manifest.json'), JSON.stringify(MANIFEST));
  for (const file of Object.keys(SIZES)) fs.writeFileSync(path.join(dist, file), `/* ${file} */`.repeat(20));
  assert.throws(() => assertChatBundleBudget(dist, baselineFile), /no baseline/);
  fs.writeFileSync(baselineFile, JSON.stringify(baseline({ startBytes: 1, parts: { 'chat-account': 1 } })));
  const report = assertChatBundleBudget(dist, baselineFile);
  assert.equal(report.parts.length, 4);
  assert.ok(report.start.bytes > 0 && report.start.bytes < 1_000, 'measured from the files on disk');
  fs.writeFileSync(baselineFile, JSON.stringify(baseline({ parts: { 'chat-account': 1, 'chat-billing': 1 } })));
  assert.throws(() => assertChatBundleBudget(dist, baselineFile), /lazy part chat-billing is gone/);
  fs.writeFileSync(baselineFile, JSON.stringify({ schema: 2 }));
  assert.throws(() => readBaseline(baselineFile), /Invalid bundle baseline/);
  fs.writeFileSync(baselineFile, JSON.stringify(baseline({ schema: 2 })));
  assert.throws(() => readBaseline(baselineFile), /Invalid bundle baseline/, 'schema 2 records the chat sheet');
  fs.writeFileSync(baselineFile, JSON.stringify({ ...baseline({ schema: 2, startCssBytes: 1 }), parts: { 'chat-account': 1 } }));
  assert.equal(readBaseline(baselineFile)?.startCssBytes, 1);
});

test('the recorded baseline is within budget and knows the three parts', () => {
  const recorded = readBaseline();
  assert.ok(recorded, `${BASELINE_FILE} is committed`);
  assert.equal(recorded.entry, ENTRIES.chat);
  assert.ok(recorded.startBytes > 50_000 && recorded.startBytes <= CHAT_BUDGET.start, `start ${recorded.startBytes}`);
  assert.deepEqual(Object.keys(recorded.parts).sort(), ['chat-account', 'chat-lead', 'chat-tools']);
  for (const [name, bytes] of Object.entries(recorded.parts)) assert.ok(bytes > 0 && bytes <= CHAT_BUDGET.lazyPart, name);
});

// ── the source graph: what the start bundle can reach ───────────────────────

/** Static, value-carrying imports and re-exports of a file (verbatimModuleSyntax keeps `import { type X }`). */
function staticImports(file: string): string[] {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) out.push(node.moduleSpecifier.text);
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) out.push(node.moduleSpecifier.text);
  }
  return out;
}

function resolve(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/') ? path.posix.join('src', specifier.slice(2))
    : specifier.startsWith('.') ? path.posix.join(path.posix.dirname(from), specifier) : null;
  if (!base) return null;
  return ['.ts', '.tsx', '/index.ts', '/index.tsx', ''].map((ext) => base + ext).find((candidate) => fs.existsSync(path.join(ROOT, candidate)) && fs.statSync(path.join(ROOT, candidate)).isFile()) ?? null;
}

function startGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file) || !/\.(ts|tsx)$/.test(file)) return;
    seen.add(file);
    for (const specifier of staticImports(file)) {
      const next = resolve(file, specifier);
      if (next) visit(next);
    }
  };
  visit(entry);
  return seen;
}

const LAZY_ONLY = {
  'chat-account': [
    'src/gpt-chat/account/AccountDialog.tsx', 'src/gpt-chat/account/BotLoginScreen.tsx', 'src/gpt-chat/account/CheckoutReturn.tsx',
    'src/gpt-chat/account/UzumCodeScreen.tsx', 'src/gpt-chat/account/PackPanel.tsx', 'src/gpt-chat/account-strings.ts', 'src/components/ui/card.tsx',
  ],
  'chat-lead': [
    'src/gpt-chat/components/AiOfferCard.tsx', 'src/gpt-chat/components/AiBusinessLine.tsx', 'src/gpt-chat/components/AiLeadForm.tsx',
    'src/gpt-chat/lead-strings.ts', 'src/shared/lead-budget.ts',
  ],
  'chat-tools': ['src/gpt-chat/components/AiToolPanel.tsx', 'src/gpt-chat/components/PromptTemplateGrid.tsx', 'src/gpt-chat/components/ImagePromptTool.tsx', 'src/gpt-chat/templates.ts'],
  // Fetched once a question is being written: here before the first answer.
  'chat-answer': ['src/gpt-chat/components/AiAnswer.tsx', 'src/gpt-chat/markdown.ts', 'src/gpt-chat/latex-lite.ts', 'src/gpt-chat/answer-strings.ts', 'src/gpt-chat/plain-text.ts'],
  // Off in production: only a page whose server asks for the check loads it.
  'chat-turnstile': ['src/gpt-chat/components/TurnstileChallenge.tsx'],
  // The limit card's bot route, only while the server enables it (revision 2026-10-06-chat-design).
  'chat-limit': ['src/gpt-chat/components/AiLimitTelegram.tsx', 'src/gpt-chat/components/AiTelegramCta.tsx'],
  // The menu's role picker: a phone fetches it as the menu button is pressed.
  'chat-role': ['src/gpt-chat/components/RoleSelector.tsx'],
};

test('nothing the start imports statically reaches a lazy part; each part reaches its screens', () => {
  const start = startGraph(ENTRIES.chat);
  assert.ok(start.has('src/gpt-chat/components/AiChatConsole.tsx') && start.has('src/gpt-chat/use-account.ts'), 'the walk found the console and the account data');
  assert.ok(start.has('src/gpt-chat/components/AiAccountPanel.tsx') && start.has('src/gpt-chat/limit-card.ts'), 'the pill and the limit card are at once on screen');
  // The way back from a payment is followed with the window closed too (WP-17).
  assert.ok(start.has('src/gpt-chat/checkout.ts') && start.has('src/gpt-chat/ui-events.ts'), 'the checkout watch and the funnel counter');
  // The business-topic detector decides at send time whether the line will come (WP-20).
  assert.ok(start.has('src/gpt-chat/business-intent.ts'), 'the detector is on the start bundle');
  for (const [name, files] of Object.entries(LAZY_ONLY)) {
    for (const file of files) assert.ok(!start.has(file), `${file} (${name}) is on the start bundle`);
    assert.ok(!start.has(`src/gpt-chat/parts/${name}.ts`), `${name} is imported statically`);
    const part = startGraph(`src/gpt-chat/parts/${name}.ts`);
    for (const file of files) assert.ok(part.has(file), `${name} does not carry ${file}`);
  }
  // The only way into a part is one import() in lazy-part.tsx.
  const lazy = read('src/gpt-chat/lazy-part.tsx');
  for (const name of Object.keys(LAZY_ONLY)) {
    assert.match(lazy, new RegExp(`part\\(\\(\\) => import\\('\\./parts/${name}'\\)\\)`), name);
  }
  const imports = [...read('src/gpt-chat/components/AiChatConsole.tsx').matchAll(/import\(/g)];
  assert.equal(imports.length, 0, 'the console imports no part itself');
});

test('the gate runs where a release is built: vite manifest, the guarded Pages release, release-preflight', () => {
  assert.match(read('vite.config.ts'), /\r?\n {4}manifest: true,\r?\n/);
  const pages = read('scripts/release/pages-production.ts');
  const main = pages.slice(pages.indexOf('async function main()'));
  // The live billing gate (WP-18) runs between the budget and the clean-tree check.
  assert.match(main, /assertSeoProtection\(dist\);\s*\/\/[^\n]*\n\s*assertChatBundleBudget\(dist\);(?:\s*\/\/[^\n]*)*\s*assertLiveGate\(loadLiveGateInput\(ROOT, dist, null\)\);\s*assertCleanRuntime\(ROOT\);/);
  const preflight = read('scripts/release-preflight.ts');
  const build = preflight.indexOf("add('deep:root-build'");
  const gate = preflight.indexOf("add('deep:chat-bundle-budget', bundle.ok, bundle.detail);");
  assert.ok(build > 0 && gate > build, 'the budget is checked after the build');
  assert.match(preflight.slice(build, gate), /const bundle = rootBuild\.ok\s*\? chatBundleBudget\(path\.join\(ROOT, 'dist'\)\)\s*: \{ ok: false, detail: 'build-failed' \};/,
    'a failed build is not measured: dist/ would still hold the previous one');
});

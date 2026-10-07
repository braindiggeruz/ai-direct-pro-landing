import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  STUDIO_EXPECTED,
  cascadeFailures,
  cascadeFixture,
  controlFailures,
  errorTexts,
  findStudioEntry,
  studioRuntimeFiles,
  checkDraftPages,
  serve,
  flowFailures,
  againFailures,
  STUB_JOB,
  pageFailures,
  pagesUnderCheck,
  unexpectedLoadRequests,
  type PageProbe,
  type ApiCall,
} from '../apps/studio/scripts/check-pages';
import { TEXTS } from '../apps/studio/src/tools/presentation/texts';
import { inspectArtifact, REQUIRED_FEATURES, verifyStampedArtifact } from '../scripts/release/pages-production';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const scripts = () => (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

// --- build wiring ----------------------------------------------------------------

test('wiring: build:studio installs from the lockfile, builds, then prerenders', () => {
  assert.equal(
    scripts()['build:studio'],
    'npm --prefix apps/studio ci && npm --prefix apps/studio run build && tsx apps/studio/scripts/prerender-studio.ts',
  );
  assert.ok(fs.existsSync(path.join(ROOT, 'apps/studio/package-lock.json')), 'npm ci needs the committed lockfile');
});

test('wiring: the studio builds after the root build and the admin, right before the stamp', () => {
  // The root vite build clears dist/; the studio writes into it, so it runs after.
  // The stamp hashes the finished artifact, so it runs after the studio.
  const { build, 'build:production': production, 'build:cf': cf } = scripts();
  assert.match(production, /^npm run build:fast && npm --prefix apps\/bormi-admin run build && npm run build:studio && npm run release:pages:stamp$/);
  assert.match(cf, /&& npm run build:admin && npm run build:studio && npm run release:pages:stamp$/);
  assert.match(build, /^tsx scripts\/seo-audit\.ts && tsc -b && vite build && .* && tsx scripts\/generate-feed\.ts && npm run build:studio$/);
  for (const script of [build, production, cf]) assert.equal(script.split('build:studio').length, 2, 'the studio builds once');
});

test('wiring: the studio build lands in dist/assets/studio and only there', () => {
  const config = read('apps/studio/vite.config.ts');
  assert.match(config, /base: '\/assets\/studio\/'/);
  assert.match(config, /outDir: here\('\.\.\/\.\.\/dist\/assets\/studio'\)/);
  assert.match(config, /assetsDir: ''/);
  assert.match(config, /emptyOutDir: true/);
  assert.match(config, /manifest: true/);
  assert.match(config, /target: 'es2022'/);
  assert.match(config, /input: \{ studio: here\('\.\/src\/main\.tsx'\) \}/);
  // esbuild is not a studio dependency; minify: 'esbuild' would borrow the root install's copy.
  assert.doesNotMatch(config.replace(/\/\/.*$/gm, ''), /minify:\s*['"]esbuild['"]|esbuild/);
  // The studio has its own PostCSS config, so the root Tailwind v3 never runs on it.
  const postcss = read('apps/studio/postcss.config.js').replace(/\/\/.*$/gm, '');
  assert.match(postcss, /'@tailwindcss\/postcss': \{\}/);
  assert.doesNotMatch(postcss, /autoprefixer|\btailwindcss: \{\}/);
});

test('wiring: the root Tailwind never scans apps/, so no studio file can add a class to the site CSS', () => {
  const config = read('tailwind.config.js');
  const globs = [...(config.match(/content:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(globs.length > 0);
  for (const glob of globs) assert.ok(glob === './index.html' || /^\.\/(src|scripts)\//.test(glob), glob);
});

test('wiring: pinned versions, pptxgenjs at runtime, playwright-core not installed twice', () => {
  const pkg = JSON.parse(read('apps/studio/package.json')) as {
    dependencies: Record<string, string>; devDependencies: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, version] of Object.entries(all)) assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is pinned`);
  assert.match(all.tailwindcss, /^4\./);
  assert.equal(all.tailwindcss, all['@tailwindcss/postcss']);
  assert.match(all.vite, /^8\./);
  assert.ok(pkg.dependencies.pptxgenjs);
  assert.equal(all['playwright-core'], undefined);
  const lock = JSON.parse(read('apps/studio/package-lock.json')) as { packages: Record<string, { version?: string }> };
  for (const [name, version] of Object.entries(all)) {
    assert.equal(lock.packages[`node_modules/${name}`]?.version, version, `${name} lockfile matches package.json`);
  }
  const notices = read('apps/studio/THIRD_PARTY_NOTICES.md');
  for (const name of ['pptxgenjs', 'jszip']) {
    assert.ok(notices.includes(`${name} ${lock.packages[`node_modules/${name}`]?.version}`), `${name} notice names the locked version`);
  }
});

// --- the studio CSS --------------------------------------------------------------

test('styles: utilities are unlayered and prefixed st; no second preflight; sources are explicit', () => {
  const css = read('apps/studio/src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /@import "tailwindcss\/theme\.css" layer\(theme\) prefix\(st\);/);
  assert.match(css, /@import "tailwindcss\/utilities\.css" source\(none\);/);
  const utilities = css.match(/@import "tailwindcss\/utilities\.css"[^;]*;/)?.[0] ?? '';
  assert.doesNotMatch(utilities, /layer\(/, 'a layered utility loses to the unlayered site CSS');
  assert.doesNotMatch(css, /preflight|@import "tailwindcss";|@import "tailwindcss" /);
  assert.match(css, /@source "\.\.\/scripts";/);
});

// --- headless check helpers ------------------------------------------------------

test('check-pages: the test page loads the site CSS first, then the studio CSS and the island', () => {
  const entry = { script: '/assets/studio/studio-a.js', style: '/assets/studio/studio-a.css' };
  const html = cascadeFixture(['/assets/index-site.css'], entry, true);
  assert.ok(html.indexOf('/assets/index-site.css') < html.indexOf(entry.style));
  assert.match(html, /<script type="module" src="\/assets\/studio\/studio-a\.js"><\/script>/);
  for (const probe of ['class="st:text-3xl"', 'class="st:border"', 'class="st:p-3"', '<body data-studio>', 'id="studio-root"']) {
    assert.ok(html.includes(probe), probe);
  }
  const control = cascadeFixture(['/assets/index-site.css'], entry, false);
  assert.ok(!control.includes(entry.style) && !control.includes(entry.script));
});

test('check-pages: studio values pass, the site reset\'s values fail, and the control must differ', () => {
  const studio = { rootFontSize: '16px', h1FontSize: '30px', borderWidth: '1px', buttonPadding: ['12px', '12px', '12px', '12px'] };
  const reset = { rootFontSize: '16px', h1FontSize: '16px', borderWidth: '0px', buttonPadding: ['0px', '0px', '0px', '0px'] };
  assert.deepEqual(STUDIO_EXPECTED, { h1FontSize: '30px', borderWidth: '1px', buttonPadding: '12px' });
  assert.deepEqual(cascadeFailures(studio), []);
  assert.equal(cascadeFailures(reset).length, 3);
  assert.equal(cascadeFailures({ ...studio, buttonPadding: ['12px', '0px', '12px', '0px'] }).length, 1);
  assert.equal(cascadeFailures({ ...studio, rootFontSize: '18px' }).length, 1);
  assert.deepEqual(controlFailures(reset), []);
  assert.equal(controlFailures(studio).length, 3);
});

test('check-pages: on load only the page, its CSS, the entry, the site fonts and the favicon are fetched', () => {
  const page = ['/__studio-check/cascade.html', '/assets/studio/studio-a.js', '/assets/studio/studio-a.css', '/assets/index-site.css'];
  const quiet = [...page, '/assets/fonts/geist-latin-wght-normal.woff2', '/assets/fonts/geist-cyrillic-wght-normal.woff2', '/favicon.ico'];
  assert.deepEqual(unexpectedLoadRequests(quiet, page), []);
  const noisy = ['/api/studio/config', '/api/studio/me', '/assets/studio/pptxgen.es-x.js', '/assets/studio/logo.svg',
    '/assets/index-other.js', '/assets/fonts/x.woff2.js', '/uz/taqdimot-ai/'];
  assert.deepEqual(unexpectedLoadRequests([...quiet, ...noisy], page), noisy);
});

test('check-pages: the entry is found by name, exactly one of each, or the check refuses', t => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-studio-check-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  assert.throws(() => findStudioEntry(dist), /build:studio/);
  const dir = path.join(dist, 'assets/studio');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['studio-Ab1_x.js', 'studio-Cd2-y.css', 'pptxgen.es-Ef3.js', '__vite-browser-external-Gh4.js']) {
    fs.writeFileSync(path.join(dir, name), '');
  }
  assert.deepEqual(findStudioEntry(dist), { script: '/assets/studio/studio-Ab1_x.js', style: '/assets/studio/studio-Cd2-y.css' });
  fs.writeFileSync(path.join(dir, 'studio-old.js'), '');
  assert.throws(() => findStudioEntry(dist), /Expected one studio entry \.js/);
});

test('check-pages: only the entry\'s static Rolldown runtime is allowed; dynamic billing/PPTX and unrelated scripts stay forbidden', t => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-studio-runtime-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  const dir = path.join(dist, 'assets/studio'); fs.mkdirSync(dir, { recursive: true });
  const entry = { script: '/assets/studio/studio-a.js', style: '/assets/studio/studio-a.css' };
  fs.writeFileSync(path.join(dir, 'studio-a.js'), 'import{t as e}from"./rolldown-runtime-Ab12.js"; import("./Tariffs-lazy.js"); import("./pptxgen.es-lazy.js");');
  assert.throws(() => studioRuntimeFiles(dist, entry), /Missing imported Studio runtime/);
  fs.writeFileSync(path.join(dir, 'rolldown-runtime-Ab12.js'), 'export const t = x => x;');
  const runtime = studioRuntimeFiles(dist, entry);
  assert.deepEqual(runtime, ['/assets/studio/rolldown-runtime-Ab12.js']);
  assert.deepEqual(unexpectedLoadRequests([entry.script, ...runtime], [entry.script, ...runtime]), []);
  const forbidden = ['/assets/studio/rolldown-runtime-other.js', '/assets/studio/Tariffs-lazy.js', '/assets/studio/pptxgen.es-lazy.js', '/api/studio/config'];
  assert.deepEqual(unexpectedLoadRequests(forbidden, [entry.script, ...runtime]), forbidden);
});

function flowFixture(): ApiCall[] {
  const task = { topic: 'Amir Temur', locale: 'uz', audience: 'maktab', slides: 6, palette: 1 };
  const event = (type: string, detail: string, id: string, viewId = 'generator_view') => ({ type, detail, id, viewId });
  const image = (index: number) => ({ index, prompt: index === 1 ? 'Ancient stone fortress walls in Samarkand under blue sky' : 'Green valley with poplar trees and small village houses in Central Asia', sig: `stub-signature-${index}` });
  return [
    { method: 'GET', path: 'config', body: null, at: 10 },
    { method: 'GET', path: 'me', body: null, at: 11 },
    { method: 'POST', path: 'event', body: event('studio_tool_started', 'presentation', 'event_started'), at: 21 },
    { method: 'POST', path: 'identity', body: { turnstileToken: 'stub-studio_identity' }, at: 22 },
    { method: 'POST', path: 'presentations', body: { ...task, requestId: 'request_first', shape: 'free', turnstileToken: 'stub-studio_free_deck' }, at: 23 },
    { method: 'POST', path: `presentations/${STUB_JOB}/slides`, body: task, at: 24 },
    { method: 'POST', path: `presentations/${STUB_JOB}/images`, body: image(1), at: 25 },
    { method: 'POST', path: `presentations/${STUB_JOB}/images`, body: image(2), at: 26 },
    { method: 'POST', path: 'event', body: event('studio_result_ready', 'free', 'event_result'), at: 27 },
    { method: 'POST', path: `presentations/${STUB_JOB}/images`, body: image(2), at: 28 },
    { method: 'POST', path: 'event', body: event('studio_tariffs_viewed', 'after_result', 'event_tariffs'), at: 30 },
  ];
}

test('check-pages: result teaser reuses the first config and view id; premature reads, duplicated events and orders fail', () => {
  const good = flowFixture();
  assert.deepEqual(flowFailures(good, 5, 20), []);
  const early = structuredClone(good); early[0].at = 1;
  assert.ok(flowFailures(early, 5, 20).some(failure => failure.includes('before the first focus')));
  const premature = [...good, { method: 'GET', path: 'config', body: null, at: 21 }];
  assert.ok(flowFailures(premature, 5, 20).some(failure => failure.includes('no extra config/me')));
  assert.ok(flowFailures([...good, { ...good[0], at: 31 }], 5, 20).length);
  const split = structuredClone(good); (split[8].body as { viewId: string }).viewId = 'another_view';
  assert.ok(flowFailures(split, 5, 20).some(failure => failure.includes('different view ids')));
  const billingSplit = structuredClone(good); (billingSplit[10].body as { viewId: string }).viewId = 'billing_view';
  assert.ok(flowFailures(billingSplit, 5, 20).some(failure => failure.includes('different view ids')));
  assert.ok(flowFailures([...good, { method: 'POST', path: 'checkout', body: {}, at: 32 }], 5, 20).some(failure => failure.includes('unexpected calls')));
  const duplicate = structuredClone(good); (duplicate[10].body as { id: string }).id = 'event_result';
  assert.ok(flowFailures(duplicate, 5, 20).some(failure => failure.includes('duplicate event ids')));
});

test('check-pages: second attempt only refreshes me and records the billing limit context; no order, generation or duplicate event', () => {
  const first = flowFixture();
  const again: ApiCall[] = [{ method: 'GET', path: 'me', body: null, at: 40 }, { method: 'POST', path: 'event', body: { type: 'studio_tariffs_viewed', detail: 'limit', id: 'event_limit', viewId: 'generator_view' }, at: 41 }];
  assert.deepEqual(againFailures(again, first), []);
  for (const path of ['checkout', 'identity', 'presentations', 'config']) assert.ok(againFailures([...again, { method: 'POST', path, body: {}, at: 42 }], first).length);
  const wrong = structuredClone(again); (wrong[1].body as { viewId: string }).viewId = 'wrong_view';
  assert.ok(againFailures(wrong, first).length);
});

// --- the pages check with /api/* cut off (T2.3) ------------------------------------

const passing = (): PageProbe => ({
  url: '/uz/taqdimot-ai/',
  source: 'memory',
  h1: ['Mavzuni yozing — tayyor taqdimot (.pptx)'],
  formsInIsland: 1,
  submitEnabled: true,
  hydration: null,
  wordsOutsideIsland: 520,
  errorsOnLoad: [],
  layoutShift: 0.01,
  formTop: 260,
  viewportHeight: 800,
  apiOnLoad: [],
  afterFocus: { api: ['/api/studio/config', '/api/studio/me'], errors: [] },
  afterSubmit: { message: TEXTS.uz.messages.busy, h1: 1 },
});

test('check-pages: a page that keeps the closed-API contract passes; every breach is named', () => {
  assert.deepEqual(pageFailures(passing(), 'uz'), []);
  const breaches: Array<[Partial<PageProbe>, RegExp]> = [
    [{ h1: [] }, /0 H1/],
    [{ h1: ['A', 'B'] }, /2 H1/],
    [{ formsInIsland: 0 }, /0 forms in #studio-root/],
    [{ submitEnabled: false }, /not enabled after hydration/],
    [{ hydration: 'recovered' }, /hydration mismatch/],
    [{ wordsOutsideIsland: 399 }, /399 words outside the island/],
    [{ errorsOnLoad: [TEXTS.uz.messages.busy] }, /error text on load/],
    [{ layoutShift: 0.05 }, /layout shift 0\.05/],
    [{ formTop: 800 }, /below the first screen/],
    [{ apiOnLoad: ['/api/studio/config'] }, /requested on load/],
    [{ afterFocus: { api: [], errors: [] } }, /asked nothing of \/api\/studio/],
    [{ afterFocus: { api: ['/api/studio/config'], errors: [TEXTS.uz.messages.busy] } }, /after a mere focus/],
    [{ afterSubmit: { message: '', h1: 1 } }, /expected «Aloqa uzildi/],
    [{ afterSubmit: { message: TEXTS.uz.messages.busy, h1: 0 } }, /lost its H1/],
  ];
  for (const [change, error] of breaches) {
    const failures = pageFailures({ ...passing(), ...change }, 'uz');
    assert.equal(failures.length, 1, JSON.stringify(change));
    assert.match(failures[0], error);
  }
  assert.deepEqual(errorTexts('ru'), Object.values(TEXTS.ru.messages));
  assert.match(pageFailures({ ...passing(), afterSubmit: { message: TEXTS.uz.messages.busy, h1: 1 } }, 'ru')[0], /Связь прервалась/);
  // No answer from /api/* reads as a lost connection; a studio that answers "off" says busy: both pass.
  assert.deepEqual(pageFailures({ ...passing(), afterSubmit: { message: TEXTS.uz.messages.connection_lost, h1: 1 } }, 'uz'), []);
});

test('check-pages: public targets exclude drafts and keep tariffs separate from generator forms', () => {
  const targets = pagesUnderCheck(ROOT);
  assert.deepEqual(targets.map(target => [target.url, target.locale, target.tool]), [['/ru/prezentatsiya-ai/', 'ru', 'presentation'], ['/uz/taqdimot-ai/', 'uz', 'presentation'], ['/uz/tariflar/', 'uz', 'tariffs']]);
  assert.ok(targets.every(target => target.html === null), 'public checks always use built files');
});

test('check-pages: photo draft is HTTP 404 through routing; leaked artifact or catch-all HTML fails', async t => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-studio-check-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dist, 'index.html'), '<html>Public homepage</html>');
  const server = await serve(dist, {}); t.after(() => server.close());
  const failures: string[] = [];
  assert.deepEqual(await checkDraftPages(ROOT, server.origin, failures), [{ url: '/uz/rasmdan-yechim/', status: 404 }]);
  assert.deepEqual(failures, []);
  const leaked = await serve(dist, { '/uz/rasmdan-yechim/': '<div id="studio-root">Draft</div>' }); t.after(() => leaked.close());
  await checkDraftPages(ROOT, leaked.origin, failures);
  assert.match(failures[0], /draft \/uz\/rasmdan-yechim\/: HTTP 200, expected 404/);
});

// --- the release stamp checks the published studio pages (T2.3) --------------------

function releaseFixture(t: { after: (fn: () => void) => void }): string {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-studio-stamp-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  const put = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
    fs.writeFileSync(path.join(dist, file), content);
  };
  const css = '<link rel="stylesheet" href="/assets/index-fixture.css">';
  put('assets/AdminRoot-fixture.js', REQUIRED_FEATURES.map(([, marker]) => marker).join('\n'));
  put('assets/index-fixture.js', 'import("./AdminRoot-fixture.js")');
  put('assets/index-fixture.css', 'body{margin:0}');
  put('index.html', `<script src="/assets/index-fixture.js"></script>${css}`);
  put('admin/index.html', '<div id="root"></div>');
  put('uz/internet-reklama-toshkent/index.html', `Reklama xizmatlari${css}`);
  put('ru/internet-reklama-tashkent/index.html', `Услуги продвижения${css}`);
  return dist;
}

test('release stamp: each published studio page must be in the artifact with its island root', t => {
  const dist = releaseFixture(t);
  const commit = 'a'.repeat(40);
  const studio = ['/uz/taqdimot-ai/'];
  assert.throws(() => inspectArtifact(dist, commit, studio), /Missing production page\/section: uz\/taqdimot-ai\/index\.html/);
  fs.mkdirSync(path.join(dist, 'uz/taqdimot-ai'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'uz/taqdimot-ai/index.html'), '<link rel="stylesheet" href="/assets/index-fixture.css"><main></main>');
  assert.throws(() => inspectArtifact(dist, commit, studio), /Missing production page\/section: uz\/taqdimot-ai\/index\.html/);
  fs.writeFileSync(path.join(dist, 'uz/taqdimot-ai/index.html'), '<link rel="stylesheet" href="/assets/index-fixture.css"><div id="studio-root" data-tool="presentation"></div>');
  const stamp = inspectArtifact(dist, commit, studio);
  assert.ok(stamp.probes.some(probe => probe.path === 'uz/taqdimot-ai/index.html'));
  fs.writeFileSync(path.join(dist, 'gptbot-release.json'), JSON.stringify(stamp));
  assert.deepEqual(verifyStampedArtifact(dist, commit, studio), stamp);
  // Without the studio list the probes differ, so a stamp cannot be checked against another list.
  assert.throws(() => verifyStampedArtifact(dist, commit, []), /stale/);
  // A page of the site needs no studio root (the default list is empty).
  assert.doesNotThrow(() => inspectArtifact(dist, commit));
});

test('release stamp: stamp, check and deploy pass the published studio pages from content/studio/pages', () => {
  const source = read('scripts/release/pages-production.ts');
  assert.match(source, /import \{ publishedStudioUrls \} from '\.\.\/\.\.\/apps\/studio\/shared\/published-urls';/);
  assert.match(source, /const studioPages = publishedStudioUrls\(ROOT\);/);
  assert.match(source, /inspectArtifact\(dist, commit, studioPages\)/);
  assert.match(source, /verifyStampedArtifact\(dist, commit, studioPages\)/);
  assert.match(source, /\.\.\.studioPages\.map\(\(url\) => \[`\$\{url\.slice\(1\)\}index\.html`, 'id="studio-root"'\]\)/);
});

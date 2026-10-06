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
  findStudioEntry,
  unexpectedLoadRequests,
} from '../apps/studio/scripts/check-pages';

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

// Bormi Admin v1: the edge rules that make /admin/ safe to deploy.
//
// The panel is a second SPA served from the same Pages project as the marketing
// site. Two things follow from that and neither is automatic:
//
//   A refresh of /admin/listings matches no file on disk. Without a rewrite,
//   Cloudflare Pages serves /404.html — the panel would work only for a reader
//   who never touched the address bar.
//
//   The shell is HTML on a public origin. Without an explicit header it
//   inherits the site's one-hour edge cache and carries no crawler instruction
//   that anything but an HTML parser can see.
//
// Both are edge configuration, which means both are invisible until they are
// wrong in production. These assertions are where they are visible.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

function distPath(name: string): URL {
  return new URL(`dist/${name}`, ROOT);
}

const GENERATOR = 'scripts/generate-robots.ts';

// ── The SPA fallback ─────────────────────────────────────────────────────────

const SHELL_FUNCTION = 'functions/admin/[[path]].ts';

test('hardening: a Pages Function serves the shell for every /admin route', async () => {
  const shell = await source(SHELL_FUNCTION);
  assert.match(shell, /export const onRequest: PagesFunction/);
  // The shell is fetched by its directory form: Pages answers `/admin/index.html`
  // with its own `.html` redirect, which would turn a rewrite into a 308.
  assert.match(shell, /env\.ASSETS\.fetch\(new URL\('\/admin\/', url\)\.toString\(\)\)/);
  // A document request, and only a document request.
  assert.match(shell, /request\.method !== 'GET' && request\.method !== 'HEAD'/);
  assert.match(shell, /status: 405/);
  // A deployment without `dist/admin` says so instead of serving a blank page.
  assert.match(shell, /status: 503/);
  // Nothing about authority lives here: the API routes own that.
  assert.doesNotMatch(shell, /requirePlatformRole|BORMI_ADMIN_V2_ENABLED|JWT/);
});

test('hardening: no /admin/* rewrite is emitted, and the reason is written down', async () => {
  const generator = await source(GENERATOR);
  // Both spellings were tried against the real runtime and both are wrong:
  // `/admin/index.html` loops into a 404, `/admin/` swallows the panel's own
  // JavaScript because `_redirects` is evaluated before static assets.
  assert.doesNotMatch(generator, /lines\.push\('\/admin\/\*/);
  assert.match(generator, /functions\/admin\/\[\[path\]\]\.ts/);
  // The legacy console keeps the rewrite it has always had.
  assert.match(generator, /lines\.push\('\/admin-tools\/\*\s+\/index\.html\s+200'\);/);
});

test('hardening: the fallback _redirects in /public says the same thing', async () => {
  const fallback = await source('public/_redirects');
  assert.doesNotMatch(fallback, /^\/admin\/\*/m);
  assert.match(fallback, /^\/admin-tools\/\*\s+\/index\.html\s+200$/m);
  assert.match(fallback, /functions\/admin\/\[\[path\]\]\.ts/);
});

test('hardening: no wildcard catch-all was introduced for the public site', async () => {
  const generator = await source(GENERATOR);
  const fallback = await source('public/_redirects');
  for (const text of [generator, fallback]) {
    assert.doesNotMatch(text, /^\s*\/\*\s+\/index\.html\s+200\s*$/m, 'a public SPA catch-all exists');
  }
  assert.match(generator, /No SPA wildcard fallback by design/);
});

test('hardening: the built _redirects carries no /admin rule', async (t) => {
  if (!existsSync(distPath('_redirects'))) {
    t.skip('dist/_redirects absent — run npm run build');
    return;
  }
  const built = await readFile(distPath('_redirects'), 'utf8');
  assert.doesNotMatch(built, /^\/admin\/\*/m, 'a /admin rewrite would swallow the panel assets');
  assert.match(built, /^\/admin-tools\/\*\s+\/index\.html\s+200$/m);
});

// ── The headers ──────────────────────────────────────────────────────────────

const ADMIN_HEADERS: [string, RegExp][] = [
  ['Cache-Control', /no-store/],
  ['X-Frame-Options', /DENY/],
  ['X-Robots-Tag', /noindex, nofollow, noarchive, nosnippet/],
  ['X-Content-Type-Options', /nosniff/],
  ['Referrer-Policy', /same-origin/],
];

test('hardening: the shell sets every one of those headers itself', async () => {
  const shell = await source(SHELL_FUNCTION);
  const block = shell.slice(shell.indexOf('const SHELL_HEADERS'), shell.indexOf('export const onRequest'));
  for (const [name, value] of ADMIN_HEADERS) {
    assert.match(block, new RegExp(`'?${name}'?:`), `${name} is missing`);
    assert.match(block, value, `${name} does not say what it must`);
  }
  // And they are applied last, over whatever the asset store answered with.
  assert.match(shell, /for \(const \[name, value\] of Object\.entries\(SHELL_HEADERS\)\) headers\.set\(name, value\);/);
});

test('hardening: no /admin/* header block is emitted, and the reason is written down', async () => {
  const generator = await source(GENERATOR);
  // `_headers` merges matching blocks rather than letting the specific one win:
  // a /admin/* block on top of the global /* block produced a Cache-Control
  // that contradicted itself and an X-Frame-Options browsers treat as
  // malformed. Both were observed against the real runtime.
  assert.doesNotMatch(generator, /headers\.push\('\/admin\/\*'\)/);
  assert.match(generator, /merges every matching block/);
  assert.match(generator, /headers\.push\('\/admin\/assets\/\*'\)/);
});

test('hardening: the frame policy tightens on the admin paths and nowhere else', async () => {
  const generator = await source(GENERATOR);
  // The global block stays SAMEORIGIN — the public site embeds its own pages.
  const global = generator.slice(
    generator.indexOf("headers.push('/*')"),
    generator.indexOf("headers.push('# ─── Admin SPA"),
  );
  assert.match(global, /X-Frame-Options: SAMEORIGIN/);
  assert.doesNotMatch(global, /X-Frame-Options: DENY/);
  // In this file DENY now appears once: the legacy console. The panel's copy
  // moved into the Function that serves it.
  assert.equal((generator.match(/X-Frame-Options: DENY/g) ?? []).length, 1);
  assert.match(await source(SHELL_FUNCTION), /'X-Frame-Options': 'DENY'/);
});

test('hardening: the panel’s own chunks stay cacheable and unindexed', async () => {
  const generator = await source(GENERATOR);
  const assets = generator.slice(generator.indexOf("headers.push('/admin/assets/*')"));
  assert.match(assets, /max-age=31536000, immutable/);
  assert.match(assets, /noindex, nofollow, noarchive, nosnippet/);
});

test('hardening: the fallback _headers in /public says the same thing', async () => {
  const fallback = await source('public/_headers');
  assert.doesNotMatch(fallback, /^\/admin\/\*$/m, 'the fallback re-introduces the merged block');
  const block = fallback.slice(fallback.indexOf('/admin/assets/*'));
  assert.match(block, /max-age=31536000, immutable/);
  assert.match(block, /noindex, nofollow, noarchive, nosnippet/);
});

test('hardening: the built _headers carries the asset block and leaves the API alone', async (t) => {
  if (!existsSync(distPath('_headers'))) {
    t.skip('dist/_headers absent — run npm run build');
    return;
  }
  const built = await readFile(distPath('_headers'), 'utf8');
  assert.doesNotMatch(built, /^\/admin\/\*$/m);
  assert.match(built, /\/admin\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  // The API answers were already no-store and stay that way.
  assert.match(built, /\/api\/\*\n {2}Cache-Control: no-store/);
});

// ── robots ───────────────────────────────────────────────────────────────────

test('hardening: robots.txt disallows /admin/ for every crawler class', async () => {
  const { buildRobotsTxt } = await import('../src/shared/robots-policy');
  const robots = buildRobotsTxt('https://gptbot.uz');
  const blocks = robots.split('User-agent:').slice(1);
  assert.ok(blocks.length > 20, 'the policy lost its agent blocks');
  for (const block of blocks) {
    assert.match(block, /Disallow: \/admin\//, 'an agent block may crawl /admin/');
    assert.match(block, /Disallow: \/admin-tools\//);
    assert.match(block, /Disallow: \/api\//);
  }
  // The public site is still open: the disallow list is three paths, not four.
  assert.doesNotMatch(robots, /Disallow: \/$/m);
  assert.match(robots, /Sitemap: https:\/\/gptbot\.uz\/sitemap\.xml/);
});

test('hardening: the /public robots.txt fallback agrees', async () => {
  const fallback = await source('public/robots.txt');
  assert.match(fallback, /Disallow: \/admin\//);
  assert.match(fallback, /Disallow: \/api\//);
});

test('hardening: the built robots.txt carries the rule', async (t) => {
  if (!existsSync(distPath('robots.txt'))) {
    t.skip('dist/robots.txt absent — run npm run build');
    return;
  }
  const built = await readFile(distPath('robots.txt'), 'utf8');
  assert.match(built, /Disallow: \/admin\//);
});

test('hardening: the shell repeats the instruction in a meta tag', async () => {
  const html = await source('apps/bormi-admin/index.html');
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive, nosnippet" \/>/);
  assert.match(html, /<meta name="referrer" content="same-origin" \/>/);
});

// ── The build ────────────────────────────────────────────────────────────────

test('hardening: the panel builds into dist/admin, and the order that requires', async () => {
  const config = await source('apps/bormi-admin/vite.config.ts');
  assert.match(config, /base: '\/admin\/'/);
  assert.match(config, /outDir: '\.\.\/\.\.\/dist\/admin'/);
  assert.match(config, /emptyOutDir: true/);
  // The root build writes `dist` and clears it first, so `build:admin` has to
  // run second. The order is a documented step, not a lucky habit.
  const scripts = JSON.parse(await source('package.json')) as { scripts: Record<string, string> };
  assert.match(scripts.scripts['build:admin'], /npm --prefix apps\/bormi-admin run build/);
  const release = await source('docs/admin/BORMI_ADMIN_V1_PRODUCTION_RELEASE.md');
  assert.match(release, /npm run build[\s\S]{0,400}npm run build:admin/);
});

test('hardening: the shell is routed through a Function, the chunks are not', async () => {
  const routes = JSON.parse(await source('public/_routes.json')) as {
    include: string[];
    exclude: string[];
  };
  assert.ok(routes.include.includes('/api/*'));
  assert.ok(routes.include.includes('/admin-tools/*'));
  assert.ok(routes.include.includes('/admin/*'), 'the shell Function is never invoked');
  // Excluded so the panel's hashed chunks are served straight from the asset
  // store: one invocation per document, none per file.
  assert.deepEqual(routes.exclude, ['/admin/assets/*']);
});

test('hardening: the synthetic fixtures cannot reach a production bundle', async () => {
  const api = await source('apps/bormi-admin/src/lib/api.ts');
  // Statically false in a production build, so the branch and the module it
  // imports are dropped by the bundler rather than shipped and never called.
  assert.match(api, /import\.meta\.env\.DEV\s*\n?\s*&& import\.meta\.env\.VITE_ADMIN_FIXTURES === '1'/);
  const built = new URL('dist/admin/assets/', ROOT);
  if (!existsSync(built)) return;
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(built);
  for (const file of files.filter((name) => name.endsWith('.js'))) {
    const bundle = await readFile(new URL(file, built), 'utf8');
    assert.ok(
      !bundle.includes('SYNTHETIC — данные вымышлены'),
      `${file} ships the synthetic notice`,
    );
    assert.ok(!bundle.includes('Синтетический магазин'), `${file} ships fixture data`);
  }
});

test('hardening: no credential-shaped value reaches the panel bundle', async (t) => {
  const built = new URL('dist/admin/assets/', ROOT);
  if (!existsSync(built)) {
    t.skip('dist/admin absent — run npm run build:admin');
    return;
  }
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(built);
  for (const file of files.filter((name) => name.endsWith('.js'))) {
    const bundle = await readFile(new URL(file, built), 'utf8');
    // The token is read from storage and sent in a header; it is never a
    // literal, never a query parameter and never written to the console.
    assert.doesNotMatch(bundle, /eyJ[A-Za-z0-9_-]{20,}/, `${file} embeds a JWT`);
    assert.doesNotMatch(bundle, /[?&]token=/, `${file} puts a token in a URL`);
  }
});

test('hardening: the panel ships behind a flag that is still off', async () => {
  const wrangler = await source('wrangler.toml');
  assert.match(wrangler, /BORMI_ADMIN_V2_ENABLED = "false"/);
});

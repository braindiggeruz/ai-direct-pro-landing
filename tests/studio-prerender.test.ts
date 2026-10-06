import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { PROTECTED_PATHS } from '../scripts/seo-protection';
import type { ViteManifest } from '../scripts/vite-manifest';
import {
  PPTX_CODE_MARKER,
  STUDIO_BUDGET,
  STUDIO_MANIFEST,
  prerenderStudio,
  studioBudgetFailures,
  studioEntryAssets,
  studioPageFile,
  writeStudioPage,
} from '../apps/studio/scripts/prerender-studio';
import { publishedStudioUrls, readStudioPages } from '../apps/studio/shared/published-urls';

type Cleanup = { after: (fn: () => void) => void };

function tempRoot(t: Cleanup): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-studio-prerender-'));
  t.after(() => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'gpt-studio-prerender-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function write(root: string, file: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

const page = (fields: Record<string, unknown>) => JSON.stringify({
  title: 'Taqdimot AI: mavzudan tayyor slayd (.pptx)',
  h1: 'Mavzuni yozing — tayyor taqdimot (.pptx)',
  description: 'Mavzuni yozing — AI taqdimot tayyorlaydi.',
  tool: 'presentation',
  ...fields,
});

/** A dist/ as the root build leaves it, plus a studio build with its manifest. */
function fixture(t: Cleanup, manifest?: ViteManifest, files?: Record<string, string | Buffer>) {
  const root = tempRoot(t);
  const dist = path.join(root, 'dist');
  write(root, 'content/global/site.json', JSON.stringify({ siteUrl: 'https://gptbot.uz' }));
  write(root, 'content/studio/pages/.gitkeep', '');
  write(dist, 'index.html', '<head><link rel="stylesheet" href="/assets/index-site.css"></head>');
  write(dist, 'assets/index-site.css', 'body{margin:0}');
  const studioManifest: ViteManifest = manifest ?? {
    'src/main.tsx': {
      file: 'studio-entry.js', name: 'studio', src: 'src/main.tsx', isEntry: true,
      dynamicImports: ['node_modules/pptxgenjs/dist/pptxgen.es.js'], css: ['studio-entry.css'],
    },
    'node_modules/pptxgenjs/dist/pptxgen.es.js': {
      file: 'pptxgen.es-lazy.js', src: 'node_modules/pptxgenjs/dist/pptxgen.es.js', isDynamicEntry: true, imports: ['src/main.tsx'],
    },
  };
  write(dist, STUDIO_MANIFEST, JSON.stringify(studioManifest));
  const studioFiles = files ?? {
    'studio-entry.js': 'document.getElementById("studio-root");import("./pptxgen.es-lazy.js");',
    'studio-entry.css': '.st\\:p-3{padding:calc(var(--st-spacing) * 3)}',
    'pptxgen.es-lazy.js': `export default class PptxGenJS{}/*${PPTX_CODE_MARKER}*/`,
  };
  for (const [name, content] of Object.entries(studioFiles)) write(dist, `assets/studio/${name}`, content);
  return { root, dist };
}

// --- page records -----------------------------------------------------------

test('page records: only status "published" counts; a missing directory is no pages', t => {
  const root = tempRoot(t);
  assert.deepEqual(readStudioPages(root), []);
  write(root, 'content/studio/pages/uz/taqdimot-ai.json', page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'published' }));
  write(root, 'content/studio/pages/ru/prezentatsiya-ai.json', page({ url: '/ru/prezentatsiya-ai/', locale: 'ru', status: 'draft' }));
  write(root, 'content/studio/pages/.gitkeep', '');
  assert.deepEqual(readStudioPages(root).map(p => [p.url, p.status, p.file]), [
    ['/ru/prezentatsiya-ai/', 'draft', 'content/studio/pages/ru/prezentatsiya-ai.json'],
    ['/uz/taqdimot-ai/', 'published', 'content/studio/pages/uz/taqdimot-ai.json'],
  ]);
  assert.deepEqual(publishedStudioUrls(root), ['/uz/taqdimot-ai/']);
});

test('page records: a bad URL, locale, status, duplicate or JSON stops the build', t => {
  const cases: Array<[string, RegExp]> = [
    [page({ url: '/uz/taqdimot-ai', locale: 'uz', status: 'draft' }), /url must look like/],
    [page({ url: '/uz/blog/taqdimot/', locale: 'uz', status: 'draft' }), /url must look like/],
    [page({ url: '/en/deck/', locale: 'en', status: 'draft' }), /url must look like/],
    [page({ url: '/uz/../ru/gpt-chat/', locale: 'uz', status: 'draft' }), /url must look like/],
    [page({ url: '/uz/taqdimot-ai/', locale: 'ru', status: 'draft' }), /locale must match/],
    [page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'live' }), /status must be one of draft, published/],
    [page({ url: '/uz/taqdimot-ai/', locale: 'uz' }), /status must be one of/],
    ['{"url":', /not valid JSON/],
    ['[1]', /JSON object/],
  ];
  for (const [content, error] of cases) {
    const root = tempRoot(t);
    write(root, 'content/studio/pages/uz/x.json', content);
    assert.throws(() => readStudioPages(root), error, content);
  }
  const root = tempRoot(t);
  write(root, 'content/studio/pages/uz/a.json', page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'draft' }));
  write(root, 'content/studio/pages/uz/b.json', page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'published' }));
  assert.throws(() => readStudioPages(root), /also used by/);
});

test('page records: the repository\'s own studio pages are valid', () => {
  assert.doesNotThrow(() => readStudioPages());
});

// --- write refusals -----------------------------------------------------------

test('refusal: none of the ten protected pages can be written, whatever the dist holds', t => {
  const { dist } = fixture(t);
  assert.equal(PROTECTED_PATHS.length, 10);
  for (const url of PROTECTED_PATHS) {
    assert.throws(() => writeStudioPage(dist, url, '<html>studio</html>'), /protected SEO page|not a studio URL/, url);
    if (url !== '/') assert.equal(fs.existsSync(path.join(dist, url.slice(1), 'index.html')), false, url);
  }
  // The two protected pages that look like studio URLs are refused as protected, by name.
  for (const url of ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/']) {
    assert.throws(() => studioPageFile(dist, url), /protected SEO page/, url);
  }
  // The homepage file exists in every build; it stays the site's.
  assert.match(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), /index-site\.css/);
});

test('refusal: an existing file is never overwritten', t => {
  const { dist } = fixture(t);
  write(dist, 'uz/taqdimot-ai/index.html', '<html>site page</html>');
  assert.throws(() => writeStudioPage(dist, '/uz/taqdimot-ai/', '<html>studio</html>'), /already exists/);
  assert.equal(fs.readFileSync(path.join(dist, 'uz/taqdimot-ai/index.html'), 'utf8'), '<html>site page</html>');
});

test('refusal: anything that is not /uz|ru/<slug>/ is not written', t => {
  const { dist } = fixture(t);
  for (const url of ['/', '/ru/', '/uz/', '/uz/taqdimot-ai', '/uz/a/b/', '/uz/../ru/gpt-chat/', '/uz/%2e%2e/',
    '//gptbot.uz/uz/x/', '/en/deck/', '/uz/Taqdimot/', 'uz/taqdimot-ai/']) {
    assert.throws(() => writeStudioPage(dist, url, '<html>studio</html>'), /not a studio URL/, url);
  }
  writeStudioPage(dist, '/uz/taqdimot-ai/', '<html>studio</html>');
  assert.equal(fs.readFileSync(path.join(dist, 'uz/taqdimot-ai/index.html'), 'utf8'), '<html>studio</html>');
});

// --- prerender ----------------------------------------------------------------

test('prerender: writes published pages only, site CSS before studio CSS, and unpublishes the manifest', t => {
  const { root, dist } = fixture(t);
  write(root, 'content/studio/pages/uz/taqdimot-ai.json', page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'published', h1: 'A <b> & "c"' }));
  write(root, 'content/studio/pages/ru/prezentatsiya-ai.json', page({ url: '/ru/prezentatsiya-ai/', locale: 'ru', status: 'draft' }));
  const result = prerenderStudio(root, dist);
  assert.deepEqual(result.written, ['/uz/taqdimot-ai/']);
  assert.deepEqual(result.drafts, ['/ru/prezentatsiya-ai/']);
  assert.deepEqual(result.lazyFiles, ['assets/studio/pptxgen.es-lazy.js']);
  assert.ok(result.firstLoadGzip > 0 && result.firstLoadGzip <= STUDIO_BUDGET.firstLoadGzip);
  assert.equal(fs.existsSync(path.join(dist, 'ru/prezentatsiya-ai/index.html')), false, 'a draft is not written');
  assert.equal(fs.existsSync(path.join(dist, 'assets/studio/.vite')), false, 'the manifest is not published');

  const html = fs.readFileSync(path.join(dist, 'uz/taqdimot-ai/index.html'), 'utf8');
  const site = html.indexOf('href="/assets/index-site.css"');
  const studio = html.indexOf('href="/assets/studio/studio-entry.css"');
  assert.ok(site > 0 && studio > site, 'the studio stylesheet follows the site stylesheet');
  assert.match(html, /<script type="module" src="\/assets\/studio\/studio-entry\.js"><\/script>/);
  assert.match(html, /<html lang="uz">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/gptbot\.uz\/uz\/taqdimot-ai\/" \/>/);
  assert.match(html, /<body data-studio>/);
  assert.match(html, /<div id="studio-root" data-tool="presentation"><\/div>/);
  assert.match(html, /<h1>A &lt;b&gt; &amp; &quot;c&quot;<\/h1>/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /pptxgen/, 'the lazy chunk is not referenced by the page');
});

test('prerender: a published page on a protected path or over a site page fails the build untouched', t => {
  {
    const { root, dist } = fixture(t);
    write(dist, 'uz/gpt-uzbek-tilida/index.html', '<html>protected</html>');
    write(root, 'content/studio/pages/uz/gpt.json', page({ url: '/uz/gpt-uzbek-tilida/', locale: 'uz', status: 'published' }));
    assert.throws(() => prerenderStudio(root, dist), /protected SEO page/);
    assert.equal(fs.readFileSync(path.join(dist, 'uz/gpt-uzbek-tilida/index.html'), 'utf8'), '<html>protected</html>');
  }
  {
    const { root, dist } = fixture(t);
    write(dist, 'uz/taqdimot-ai/index.html', '<html>site page</html>');
    write(root, 'content/studio/pages/uz/taqdimot-ai.json', page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'published' }));
    assert.throws(() => prerenderStudio(root, dist), /already exists/);
    assert.equal(fs.readFileSync(path.join(dist, 'uz/taqdimot-ai/index.html'), 'utf8'), '<html>site page</html>');
  }
  {
    const { root, dist } = fixture(t);
    write(root, 'content/studio/pages/uz/taqdimot-ai.json', page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'published', h1: '' }));
    assert.throws(() => prerenderStudio(root, dist), /h1 is required to publish/);
  }
});

test('prerender: with no published page it writes nothing outside assets/studio', t => {
  const { root, dist } = fixture(t);
  write(root, 'content/studio/pages/uz/taqdimot-ai.json', page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'draft' }));
  const before = fs.readdirSync(dist).sort();
  const result = prerenderStudio(root, dist);
  assert.deepEqual(result.written, []);
  assert.deepEqual(fs.readdirSync(dist).sort(), before);
  assert.equal(fs.existsSync(path.join(dist, 'uz')), false);
});

test('prerender: without a studio build it stops and says what to run', t => {
  const { root, dist } = fixture(t);
  fs.rmSync(path.join(dist, 'assets/studio/.vite'), { recursive: true });
  assert.throws(() => prerenderStudio(root, dist), /npm --prefix apps\/studio run build/);
});

// --- bundle budget --------------------------------------------------------------

const readFrom = (files: Record<string, string | Buffer>) => (distPath: string) =>
  Buffer.from(files[distPath.replace(/^assets\/studio\//, '')] ?? '');

test('budget: pptxgenjs reached statically fails, by manifest and by content', t => {
  const manifest: ViteManifest = {
    'src/main.tsx': { file: 'studio-entry.js', src: 'src/main.tsx', isEntry: true, imports: ['node_modules/pptxgenjs/dist/pptxgen.es.js'] },
    'node_modules/pptxgenjs/dist/pptxgen.es.js': { file: 'pptxgen.es-static.js', src: 'node_modules/pptxgenjs/dist/pptxgen.es.js' },
  };
  const files = { 'studio-entry.js': 'import "./pptxgen.es-static.js";', 'pptxgen.es-static.js': `/*${PPTX_CODE_MARKER}*/` };
  const assets = studioEntryAssets(manifest, readFrom(files));
  const failures = studioBudgetFailures(manifest, assets, readFrom(files));
  assert.ok(failures.some(f => /pptxgenjs\/dist\/pptxgen\.es\.js is imported statically/.test(f)), failures.join('\n'));
  assert.ok(failures.some(f => /pptxgen\.es-static\.js carries pptxgenjs code/.test(f)), failures.join('\n'));

  // jszip inlined into the entry under another name is still caught by its code.
  const inlined: ViteManifest = { 'src/main.tsx': { file: 'studio-entry.js', src: 'src/main.tsx', isEntry: true } };
  const inlinedFiles = { 'studio-entry.js': `const p="${PPTX_CODE_MARKER}";` };
  assert.ok(studioBudgetFailures(inlined, studioEntryAssets(inlined, readFrom(inlinedFiles)), readFrom(inlinedFiles)).length === 1);

  // And the prerender refuses to continue (and still removes the manifest).
  const { root, dist } = fixture(t, manifest, files);
  assert.throws(() => prerenderStudio(root, dist), /Studio bundle over budget/);
  assert.equal(fs.existsSync(path.join(dist, 'assets/studio/.vite')), false);
});

test('budget: the first load counts entry JS, its static chunks and their CSS against 90 kB gzip', () => {
  const manifest: ViteManifest = {
    'src/main.tsx': { file: 'studio-entry.js', src: 'src/main.tsx', isEntry: true, imports: ['_shared.js'], css: ['studio-entry.css'] },
    '_shared.js': { file: 'shared-chunk.js', css: ['shared.css'] },
    'src/later.tsx': { file: 'later.js', src: 'src/later.tsx', isDynamicEntry: true },
  };
  const small = { 'studio-entry.js': 'a', 'shared-chunk.js': 'b', 'studio-entry.css': 'c', 'shared.css': 'd', 'later.js': 'e' };
  const assets = studioEntryAssets(manifest, readFrom(small));
  assert.equal(assets.script, '/assets/studio/studio-entry.js');
  assert.deepEqual(assets.styles, ['/assets/studio/studio-entry.css', '/assets/studio/shared.css']);
  assert.deepEqual(assets.firstLoadFiles.sort(), [
    'assets/studio/shared-chunk.js', 'assets/studio/shared.css', 'assets/studio/studio-entry.css', 'assets/studio/studio-entry.js',
  ]);
  assert.deepEqual(assets.lazyFiles, ['assets/studio/later.js']);
  assert.deepEqual(studioBudgetFailures(manifest, assets, readFrom(small)), []);

  // Incompressible bytes in the shared CSS push the first load over the line.
  const heavy = { ...small, 'shared.css': randomBytes(STUDIO_BUDGET.firstLoadGzip) };
  const heavyAssets = studioEntryAssets(manifest, readFrom(heavy));
  assert.ok(heavyAssets.firstLoadGzip > STUDIO_BUDGET.firstLoadGzip);
  assert.match(studioBudgetFailures(manifest, heavyAssets, readFrom(heavy)).join('\n'), /first load \d+ B gzip > 90000 B/);
  // A lazy chunk of any size does not count.
  const lazyHeavy = { ...small, 'later.js': randomBytes(STUDIO_BUDGET.firstLoadGzip * 2) };
  assert.deepEqual(studioBudgetFailures(manifest, studioEntryAssets(manifest, readFrom(lazyHeavy)), readFrom(lazyHeavy)), []);
});

test('budget: an asset name outside the studio directory is rejected', () => {
  const manifest: ViteManifest = { 'src/main.tsx': { file: '../index-site.js', src: 'src/main.tsx', isEntry: true } };
  assert.throws(() => studioEntryAssets(manifest, () => Buffer.from('')), /Unexpected studio asset name/);
  assert.throws(() => studioEntryAssets({}, () => Buffer.from('')), /Studio entry src\/main\.tsx is not in the manifest/);
});

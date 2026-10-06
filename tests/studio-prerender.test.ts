// The studio's static pages (STUDIO-SPEC §11.2–§11.5, §14.1 studio-prerender):
// the page records, what prerender-studio writes and refuses to write, the
// bundle budget, and the page itself as the release will write it from the
// repository's two records (/uz/taqdimot-ai/, /ru/prezentatsiya-ai/): head,
// JSON-LD, the island, the text around it, links, footer, and the rules
// against cannibalising the slide guide.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { PROTECTED_PATHS } from '../scripts/seo-protection';
import { addressesLeftForTheEdge } from '../scripts/email-off';
import { buildOrganizationLd } from '../scripts/jsonld-helpers';
import type { ViteManifest } from '../scripts/vite-manifest';
import { STATIC_ROUTES } from '../src/shared/audit';
import type { GlobalSEO } from '../src/shared/types';
import {
  PPTX_CODE_MARKER,
  STUDIO_BUDGET,
  STUDIO_MANIFEST,
  prerenderStudio,
  readStudioSite,
  studioBudgetFailures,
  studioEntryAssets,
  studioPageFile,
  writeStudioPage,
} from '../apps/studio/scripts/prerender-studio';
import {
  FORBIDDEN_WORDS,
  MIN_WORDS_OUTSIDE_ISLAND,
  countWords,
  islandHtmlOf,
  renderStudioPage,
  studioPageProblems,
  textOutsideIsland,
} from '../apps/studio/scripts/studio-page';
import { GUIDE_NEW_TEXT, GUIDE_TOOL_LINK, R_ST1, applyRelease, readFrom } from '../apps/studio/scripts/release-content';
import { publishedStudioUrls, readStudioPages, type StudioPageRecord } from '../apps/studio/shared/published-urls';
import { renderForm } from '../apps/studio/src/tools/presentation/static';
import { declaredKeywords, readDocs } from './helpers/studio-content';

type Cleanup = { after: (fn: () => void) => void };

const REPO = path.resolve(import.meta.dirname, '..');
const UZ_FILE = 'content/studio/pages/uz/taqdimot-ai.json';
const RU_FILE = 'content/studio/pages/ru/prezentatsiya-ai.json';
const real = (file: string) => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as Record<string, unknown>;

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

/** A page record: the repository's record of that language with `fields` on top; its own hreflang follows its URL. */
const page = (fields: Record<string, unknown>) => {
  const base = real(fields.locale === 'ru' ? RU_FILE : UZ_FILE);
  const own = fields.locale === 'ru' ? 'hreflangRu' : 'hreflangUz';
  return JSON.stringify({ ...base, ...(typeof fields.url === 'string' ? { [own]: fields.url } : {}), ...fields }, null, 2);
};

const sitemap = (urls: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>\n    <loc>https://gptbot.uz${url}</loc>\n  </url>`).join('\n')}
</urlset>
`;

/** A dist/ as the root build leaves it (site CSS, sitemap), plus a studio build with its manifest and og image. */
function fixture(t: Cleanup, manifest?: ViteManifest, files?: Record<string, string | Buffer>) {
  const root = tempRoot(t);
  const dist = path.join(root, 'dist');
  for (const file of ['content/global/site.json', 'content/global/legal-entity.json']) {
    write(root, file, fs.readFileSync(path.join(REPO, file)));
  }
  write(root, 'content/studio/pages/.gitkeep', '');
  write(dist, 'index.html', '<head><link rel="stylesheet" href="/assets/index-site.css"></head>');
  write(dist, 'assets/index-site.css', 'body{margin:0}');
  write(dist, 'sitemap.xml', sitemap(['/']));
  write(dist, 'assets/studio/og-taqdimot-v1.png', fs.readFileSync(path.join(REPO, 'apps/studio/public/og-taqdimot-v1.png')));
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
    [page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: undefined }), /status must be one of/],
    ['{"url":', /not valid JSON/],
    ['[1]', /JSON object/],
  ];
  for (const [content, error] of cases) {
    const root = tempRoot(t);
    write(root, 'content/studio/pages/uz/x.json', content);
    assert.throws(() => readStudioPages(root), error, content.slice(0, 80));
  }
  const root = tempRoot(t);
  write(root, 'content/studio/pages/uz/a.json', page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'draft' }));
  write(root, 'content/studio/pages/uz/b.json', page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'published' }));
  assert.throws(() => readStudioPages(root), /also used by/);
});

test('page records: the repository\'s own studio pages are valid and renderable, in Uzbek as the site writes it', () => {
  const pages = readStudioPages();
  assert.deepEqual(pages.map(p => p.url), ['/ru/prezentatsiya-ai/', '/uz/taqdimot-ai/']);
  for (const record of pages) assert.deepEqual(studioPageProblems(record), [], record.file);
  // No studio page lives in content/pages: the site's prerender, sitemap and homepage read that directory.
  const { pages: sitePages, blog } = readDocs(REPO);
  const studioUrls = new Set(pages.map(p => p.url));
  assert.deepEqual([...sitePages, ...blog].filter(doc => studioUrls.has(doc.url)).map(doc => doc.url), []);
});

test('page records: every way a record can be wrong is named', () => {
  const record = (fields: Record<string, unknown>): StudioPageRecord => {
    const data = { ...real(UZ_FILE), ...fields };
    return { file: UZ_FILE, url: '/uz/taqdimot-ai/', locale: 'uz', status: 'draft', data };
  };
  const problems = (fields: Record<string, unknown>) => studioPageProblems(record(fields)).join('\n');
  assert.match(problems({ title: 'Taqdimot AI' }), /title is 11 characters, expected 45–65/);
  assert.match(problems({ description: 'Qisqa.' }), /description is 6 characters, expected 120–160/);
  assert.match(problems({ honesty: 'GPTBot.uz — AI yordamchi.' }), /honesty must name GPTBot\.uz, ChatGPT and OpenAI/);
  assert.match(problems({ tariffsVisible: true }), /tariffsVisible must be false/);
  assert.match(problems({ tool: 'photo' }), /tool must be "presentation"/);
  assert.match(problems({ ogImage: '/assets/studio/og.png' }), /versioned/);
  assert.match(problems({ hreflangUz: '/uz/boshqa/' }), /hreflangUz must be the page's own URL/);
  assert.match(problems({ updatedAt: '22.10.2026' }), /updatedAt must be YYYY-MM-DD/);
  assert.match(problems({ extra: 1 }), /unknown field extra/);
  assert.doesNotMatch(problems({ _note: 'for the reader' }), /unknown field/);
  assert.match(problems({ faq: [{ q: 'Bitta?', a: 'Ha.' }] }), /faq: 5–6 questions/);
  assert.match(problems({ lead: 'Taqdimot bepul va cheksiz.' }), /forbidden word/);
  assert.match(problems({ lead: 'Rasmiy vosita emas.' }), /forbidden word/);
  assert.match(problems({ lead: "Mavzuni o'zingiz yozing." }), /uz: ASCII or modifier apostrophe/);
  assert.match(problems({ lead: 'Mavzuni oʻzingiz yozing.' }), /uz: ASCII or modifier apostrophe/);
  assert.match(problems({ lead: 'Mavzuni o’zingiz yozing.' }), /uz: o’\/g’ must be o‘\/g‘/);
  assert.match(problems({ lead: 'Mavzu — тема.' }), /uz: Cyrillic/);
  assert.match(problems({ links: { text: 'Qo‘llanma: {guide}.', links: [] } }), /links: text with links needs text and links/);
  assert.match(problems({ links: { text: 'Qo‘llanma: {guide}.', links: [{ token: 'chat', target: '/uz/x/', anchor: 'x' }] } }), /do not match/);
  assert.match(problems({ links: { text: 'Qo‘llanma: {guide}.', links: [{ token: 'guide', target: 'https://example.com/', anchor: 'x' }] } }), /not a site path/);
  assert.match(problems({ sections: [] }), /sections: at least three/);
  assert.equal(FORBIDDEN_WORDS.length >= 3, true);
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
  write(root, UZ_FILE, page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'published', h1: 'A <b> & "c"' }));
  write(root, RU_FILE, page({ url: '/ru/prezentatsiya-ai/', locale: 'ru', status: 'draft' }));
  write(dist, 'sitemap.xml', sitemap(['/', '/uz/taqdimot-ai/']));
  const result = prerenderStudio(root, dist);
  assert.deepEqual(result.written, ['/uz/taqdimot-ai/']);
  assert.deepEqual(result.drafts, ['/ru/prezentatsiya-ai/']);
  assert.deepEqual(result.lazyFiles, ['assets/studio/pptxgen.es-lazy.js']);
  assert.ok(result.words['/uz/taqdimot-ai/'] >= MIN_WORDS_OUTSIDE_ISLAND);
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
  assert.match(html, /<body data-studio /);
  assert.equal(islandHtmlOf(html), renderForm('uz'));
  assert.match(html, />A &lt;b&gt; &amp; &quot;c&quot;<\/h1>/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /pptxgen/, 'the lazy chunk is not referenced by the page');
  // The translation is a draft: no pair, no switch.
  assert.doesNotMatch(html, /hreflang=/);
  assert.doesNotMatch(html, /prezentatsiya-ai/);
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
    write(root, UZ_FILE, page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'published' }));
    assert.throws(() => prerenderStudio(root, dist), /already exists/);
    assert.equal(fs.readFileSync(path.join(dist, 'uz/taqdimot-ai/index.html'), 'utf8'), '<html>site page</html>');
  }
  {
    const { root, dist } = fixture(t);
    write(root, UZ_FILE, page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'published', h1: '' }));
    assert.throws(() => prerenderStudio(root, dist), /h1 is required/);
  }
  {
    // A malformed draft fails the build too, long before its release.
    const { root, dist } = fixture(t);
    write(root, RU_FILE, page({ url: '/ru/prezentatsiya-ai/', locale: 'ru', status: 'draft', faq: [] }));
    assert.throws(() => prerenderStudio(root, dist), /prezentatsiya-ai\.json: faq: 5–6 questions/);
  }
  {
    const { root, dist } = fixture(t);
    write(root, UZ_FILE, page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'published' }));
    write(dist, 'sitemap.xml', sitemap(['/', '/uz/taqdimot-ai/']));
    fs.rmSync(path.join(dist, 'assets/studio/og-taqdimot-v1.png'));
    assert.throws(() => prerenderStudio(root, dist), /og image \/assets\/studio\/og-taqdimot-v1\.png is not in dist/);
  }
});

test('prerender: with no published page it writes nothing outside assets/studio', t => {
  const { root, dist } = fixture(t);
  write(root, UZ_FILE, page({ url: '/uz/taqdimot-ai/', locale: 'uz', status: 'draft' }));
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

const readFrom_ = (files: Record<string, string | Buffer>) => (distPath: string) =>
  Buffer.from(files[distPath.replace(/^assets\/studio\//, '')] ?? '');

test('budget: pptxgenjs reached statically fails, by manifest and by content', t => {
  const manifest: ViteManifest = {
    'src/main.tsx': { file: 'studio-entry.js', src: 'src/main.tsx', isEntry: true, imports: ['node_modules/pptxgenjs/dist/pptxgen.es.js'] },
    'node_modules/pptxgenjs/dist/pptxgen.es.js': { file: 'pptxgen.es-static.js', src: 'node_modules/pptxgenjs/dist/pptxgen.es.js' },
  };
  const files = { 'studio-entry.js': 'import "./pptxgen.es-static.js";', 'pptxgen.es-static.js': `/*${PPTX_CODE_MARKER}*/` };
  const assets = studioEntryAssets(manifest, readFrom_(files));
  const failures = studioBudgetFailures(manifest, assets, readFrom_(files));
  assert.ok(failures.some(f => /pptxgenjs\/dist\/pptxgen\.es\.js is imported statically/.test(f)), failures.join('\n'));
  assert.ok(failures.some(f => /pptxgen\.es-static\.js carries pptxgenjs code/.test(f)), failures.join('\n'));

  // jszip inlined into the entry under another name is still caught by its code.
  const inlined: ViteManifest = { 'src/main.tsx': { file: 'studio-entry.js', src: 'src/main.tsx', isEntry: true } };
  const inlinedFiles = { 'studio-entry.js': `const p="${PPTX_CODE_MARKER}";` };
  assert.ok(studioBudgetFailures(inlined, studioEntryAssets(inlined, readFrom_(inlinedFiles)), readFrom_(inlinedFiles)).length === 1);

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
  const assets = studioEntryAssets(manifest, readFrom_(small));
  assert.equal(assets.script, '/assets/studio/studio-entry.js');
  assert.deepEqual(assets.styles, ['/assets/studio/studio-entry.css', '/assets/studio/shared.css']);
  assert.deepEqual(assets.firstLoadFiles.sort(), [
    'assets/studio/shared-chunk.js', 'assets/studio/shared.css', 'assets/studio/studio-entry.css', 'assets/studio/studio-entry.js',
  ]);
  assert.deepEqual(assets.lazyFiles, ['assets/studio/later.js']);
  assert.deepEqual(studioBudgetFailures(manifest, assets, readFrom_(small)), []);

  // Incompressible bytes in the shared CSS push the first load over the line.
  const heavy = { ...small, 'shared.css': randomBytes(STUDIO_BUDGET.firstLoadGzip) };
  const heavyAssets = studioEntryAssets(manifest, readFrom_(heavy));
  assert.ok(heavyAssets.firstLoadGzip > STUDIO_BUDGET.firstLoadGzip);
  assert.match(studioBudgetFailures(manifest, heavyAssets, readFrom_(heavy)).join('\n'), /first load \d+ B gzip > 90000 B/);
  // A lazy chunk of any size does not count.
  const lazyHeavy = { ...small, 'later.js': randomBytes(STUDIO_BUDGET.firstLoadGzip * 2) };
  assert.deepEqual(studioBudgetFailures(manifest, studioEntryAssets(manifest, readFrom_(lazyHeavy)), readFrom_(lazyHeavy)), []);
});

test('budget: an asset name outside the studio directory is rejected', () => {
  const manifest: ViteManifest = { 'src/main.tsx': { file: '../index-site.js', src: 'src/main.tsx', isEntry: true } };
  assert.throws(() => studioEntryAssets(manifest, () => Buffer.from('')), /Unexpected studio asset name/);
  assert.throws(() => studioEntryAssets({}, () => Buffer.from('')), /Studio entry src\/main\.tsx is not in the manifest/);
});

// --- the page, from the repository's records, as the release writes it ------------

const SITE_STYLE = '/assets/index-yIq7NheZ.css';
const ENTRY = { script: '/assets/studio/studio-entry.js', styles: ['/assets/studio/studio-entry.css'] };

/** The repository's records with chosen statuses (default: both published, as on the release day). */
function records(status: { uz?: 'draft' | 'published'; ru?: 'draft' | 'published' } = {}): StudioPageRecord[] {
  return readStudioPages(REPO).map(p => ({ ...p, status: status[p.locale] ?? 'published' }));
}

function rendered(locale: 'uz' | 'ru', status: { uz?: 'draft' | 'published'; ru?: 'draft' | 'published' } = {}): string {
  const pages = records(status);
  const record = pages.find(p => p.locale === locale) as StudioPageRecord;
  return renderStudioPage(record, { site: readStudioSite(REPO), pages, siteStyles: [SITE_STYLE], assets: ENTRY });
}

const head = (html: string) => /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? '';
const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const headings = (html: string, level: number) => [...html.matchAll(new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)</h${level}>`, 'g'))].map(m => strip(m[1]));
const meta = (html: string, name: string) => new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(html)?.[1];
const jsonLd = (html: string) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}') as { '@graph': Array<Record<string, unknown>> };

test('page: one H1, canonical to itself, robots index, the site stylesheet then the studio one, no GTM', () => {
  for (const [locale, url] of [['uz', '/uz/taqdimot-ai/'], ['ru', '/ru/prezentatsiya-ai/']] as const) {
    const html = rendered(locale);
    assert.equal(headings(html, 1).length, 1, locale);
    assert.equal(headings(html, 1)[0], real(locale === 'uz' ? UZ_FILE : RU_FILE).h1);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://gptbot\\.uz${url}" />`));
    assert.equal(meta(html, 'robots'), 'index, follow, max-image-preview:large');
    assert.match(html, new RegExp(`<html lang="${locale}">`));
    const stylesheets = [...head(html).matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(stylesheets, [SITE_STYLE, ...ENTRY.styles]);
    assert.doesNotMatch(html, /GTM-|googletagmanager\.com\/gtm\.js/);
    assert.match(head(html), /data-tag="ga"/, 'GA4 as on the site');
    assert.match(head(html), /data-tag="ym"/, 'Metrika as on the site');
    assert.match(head(html), /id="gptbot-first-touch"/, 'first touch as on the site');
    assert.match(html, /<meta property="og:image" content="https:\/\/gptbot\.uz\/assets\/studio\/og-taqdimot-v1\.png" \/>/);
    assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  }
});

test('page: hreflang and the language switch only when the translation is published; x-default is the Russian page', () => {
  const pair = rendered('uz');
  assert.deepEqual([...head(pair).matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map(m => `${m[1]} ${m[2]}`), [
    'ru https://gptbot.uz/ru/prezentatsiya-ai/', 'uz https://gptbot.uz/uz/taqdimot-ai/', 'x-default https://gptbot.uz/ru/prezentatsiya-ai/',
  ]);
  assert.match(pair, /<a href="\/ru\/prezentatsiya-ai\/" hreflang="ru" lang="ru"[^>]*>Русский<\/a>/);
  assert.match(rendered('ru'), /<a href="\/uz\/taqdimot-ai\/" hreflang="uz" lang="uz"[^>]*>O‘zbekcha<\/a>/);
  for (const html of [rendered('uz', { ru: 'draft' }), rendered('ru', { uz: 'draft' })]) {
    assert.doesNotMatch(html, /hreflang=/, 'no pair while the translation is a draft');
    assert.doesNotMatch(html, /href="\/(uz\/taqdimot|ru\/prezentatsiya)-ai\/"[^>]*lang=/);
  }
});

test('page: the honesty line stands under the H1, before the form', () => {
  for (const locale of ['uz', 'ru'] as const) {
    const html = rendered(locale);
    const honesty = /<p data-studio-honesty[^>]*>([^<]+)<\/p>/.exec(html);
    assert.ok(honesty, locale);
    assert.match(honesty[1], /GPTBot\.uz — /);
    assert.match(honesty[1], /ChatGPT/);
    assert.match(honesty[1], /OpenAI/);
    assert.match(honesty[1], locale === 'uz' ? /mustaqil/ : /независимый/);
    assert.ok(html.indexOf('</h1>') < honesty.index && honesty.index < html.indexOf('id="studio-root"'));
    for (const word of FORBIDDEN_WORDS) assert.doesNotMatch(strip(html.replace(/<script[\s\S]*?<\/script>/g, '')), word, `${locale}: ${word}`);
  }
});

test('page: #studio-root holds the form\'s first state and nothing else; Webvisor classes are in the markup', () => {
  for (const locale of ['uz', 'ru'] as const) {
    const html = rendered(locale);
    const island = islandHtmlOf(html) as string;
    assert.equal(island, renderForm(locale));
    assert.doesNotMatch(island, /<h[1-3]\b|data-studio-honesty|<section/);
    assert.match(island, /<form class="ym-disable-submit[ "]/);
    assert.match(island, /<input[^>]*class="ym-disable-keys[ "]/);
    assert.equal((html.match(/id="studio-root"/g) ?? []).length, 1);
    assert.match(html, /<div id="studio-root" data-tool="presentation"/);
  }
});

test(`page: at least ${MIN_WORDS_OUTSIDE_ISLAND} visible words outside the island`, () => {
  for (const locale of ['uz', 'ru'] as const) {
    const words = countWords(textOutsideIsland(rendered(locale)));
    assert.ok(words >= MIN_WORDS_OUTSIDE_ISLAND, `${locale}: ${words}`);
  }
  assert.equal(countWords('o‘zbek tilida ma’ruza matni 4–6 slayd'), 7);
  assert.equal(textOutsideIsland('<body><p>bir</p><div id="studio-root"><div><p>ikki</p></div></div><script>uch()</script><p>to‘rt</p></body>'), 'bir to‘rt');
});

test('page: no link to /ru/ (a 301 to /); home is /uz/ or /; every internal link is a served URL', () => {
  const { pages, blog } = readDocs(REPO);
  const served = new Set([
    ...pages.filter(p => p.status === 'published').map(p => p.url),
    ...blog.filter(a => a.status === 'published').map(a => a.url),
    ...STATIC_ROUTES,
    ...records().map(p => p.url),
  ]);
  for (const [locale, home] of [['uz', '/uz/'], ['ru', '/']] as const) {
    const html = rendered(locale);
    const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(m => m[1]);
    assert.ok(!hrefs.includes('/ru/'), `${locale}: links /ru/`);
    assert.match(html, new RegExp(`<header[\\s\\S]*?<a href="${home.replace(/\//g, '\\/')}"[^>]*>GPTBot\\.uz</a>`));
    const internal = hrefs.filter(href => href.startsWith('/') && !href.startsWith('//')).map(href => href.split('#')[0]);
    assert.ok(internal.length >= 8, `${locale}: ${internal.length} internal links`);
    for (const href of internal) assert.ok(served.has(href), `${locale}: ${href} is not a served URL`);
  }
});

test('page: JSON-LD — the site\'s Organization, a free WebApplication, breadcrumbs, and the FAQ the page shows', () => {
  const global = JSON.parse(fs.readFileSync(path.join(REPO, 'content/global/site.json'), 'utf8')) as GlobalSEO;
  for (const [locale, file] of [['uz', UZ_FILE], ['ru', RU_FILE]] as const) {
    const html = rendered(locale);
    const record = real(file) as { url: string; toolName: string; faq: Array<{ q: string; a: string }> };
    const graph = jsonLd(html)['@graph'];
    const byType = (type: string) => graph.find(node => node['@type'] === type || (Array.isArray(node['@type']) && (node['@type'] as string[]).includes(type)));
    assert.deepEqual(byType('Organization'), buildOrganizationLd(global));
    const app = byType('WebApplication') as Record<string, unknown>;
    assert.equal(app.name, record.toolName);
    assert.equal(app.url, `https://gptbot.uz${record.url}`);
    assert.equal(app.applicationCategory, 'EducationalApplication');
    assert.equal(app.isAccessibleForFree, true);
    assert.deepEqual(app.offers, { '@type': 'Offer', price: '0', priceCurrency: 'UZS' });
    assert.deepEqual(app.provider, { '@id': 'https://gptbot.uz/#org' });
    const crumbs = (byType('BreadcrumbList') as { itemListElement: Array<{ item: string }> }).itemListElement.map(item => item.item);
    assert.deepEqual(crumbs, [locale === 'uz' ? 'https://gptbot.uz/uz/' : 'https://gptbot.uz/', `https://gptbot.uz${record.url}`]);
    const faq = (byType('FAQPage') as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }).mainEntity;
    assert.deepEqual(faq.map(item => [item.name, item.acceptedAnswer.text]), record.faq.map(item => [item.q, item.a]));
    // Every question and answer in the markup is visible text on the page.
    const visible = strip(html.replace(/<script[\s\S]*?<\/script>/g, ''));
    for (const item of record.faq) assert.ok(visible.includes(item.q) && visible.includes(item.a), item.q);
    assert.deepEqual(headings(html, 3).filter(h => record.faq.some(item => item.q === h)), record.faq.map(item => item.q));
  }
});

test('page: the footer names the company from legal-entity.json and keeps the e-mail from the edge', () => {
  const entity = real('content/global/legal-entity.json') as { shortName: Record<string, string>; stir: string };
  for (const locale of ['uz', 'ru'] as const) {
    const html = rendered(locale);
    const footer = /<footer[\s\S]*<\/footer>/.exec(html)?.[0] ?? '';
    assert.ok(footer.includes(entity.shortName[locale].replace(/&/g, '&amp;')), locale);
    assert.ok(footer.includes(entity.stir));
    assert.match(footer, /<!--email_off--><a href="mailto:[^"]+"[^>]*>[^<]+<\/a><!--\/email_off-->/);
    assert.deepEqual(addressesLeftForTheEdge(html), []);
    assert.match(footer, locale === 'uz' ? /href="\/uz\/maxfiylik-siyosati\/"/ : /href="\/ru\/politika-konfidentsialnosti\/"/);
  }
});

// --- against cannibalising the slide guide (§11.5) ---------------------------------

const RELEASED = applyRelease(R_ST1, '2026-10-22', readFrom(REPO));
const releasedManifest = JSON.parse(RELEASED.get('content/seo/intent-manifest.json') as string) as {
  pairs: Array<{ id: string; commercial: { url: string; mustNotTarget: string[] }; informational: { url: string; mustNotTarget: string[] } }>;
};
const C40 = releasedManifest.pairs.find(pair => pair.id === 'C40-uz-taqdimot-tool-vs-guide');
const releasedGuide = JSON.parse(RELEASED.get('content/blog/uz/slayd-tayyorlash.json') as string) as {
  description: string; faq: Array<{ q: string }>; keywords: string[];
  body: Array<{ type: string; text?: string; links?: Array<{ target: string; anchor: string }> }>;
};

test('cannibalisation: no C40 «… tayyorlash» phrase in the tool page\'s title, H1, H2 or description', () => {
  assert.ok(C40, 'R-ST1 adds pair C40');
  assert.equal(C40.commercial.url, '/uz/taqdimot-ai/');
  const html = rendered('uz');
  const surfaces = [strip(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''), ...headings(html, 1), ...headings(html, 2), meta(html, 'description') ?? '']
    .map(text => text.toLowerCase());
  assert.equal(surfaces.length >= 5, true);
  for (const phrase of C40.commercial.mustNotTarget) {
    for (const surface of surfaces) assert.ok(!surface.includes(phrase.toLowerCase()), `«${phrase}» in «${surface}»`);
  }
  // The tool declares exactly the keys C40 gives it, and none the guide keeps.
  const tool = real(UZ_FILE);
  assert.deepEqual(declaredKeywords(tool).sort(), [...C40.informational.mustNotTarget, 'sun’iy intellekt slayd'].sort());
  assert.deepEqual(declaredKeywords(tool).filter(k => releasedGuide.keywords.includes(k)), []);
});

test('cannibalisation: the guide\'s new sentences avoid the tool\'s head terms and link it as «Taqdimot AI»', () => {
  for (const text of [...Object.values(GUIDE_NEW_TEXT), releasedGuide.description]) {
    for (const phrase of ['slayd ai', 'ai slayd', 'prezentatsiya ai']) assert.ok(!text.toLowerCase().includes(phrase), `«${phrase}» in «${text}»`);
  }
  const links = releasedGuide.body.flatMap(block => block.links ?? []).filter(link => link.target === '/uz/taqdimot-ai/');
  assert.deepEqual(links.map(link => link.anchor), [GUIDE_TOOL_LINK.anchor]);
  assert.equal(GUIDE_TOOL_LINK.anchor, 'Taqdimot AI');
  assert.ok(!releasedGuide.keywords.includes('slayd yaratish'));
});

/** A question as words: lowercase, letters and digits only, apostrophes of either kind ignored. */
const questionWords = (q: string) => new Set(q.toLowerCase().replace(/[‘’'ʻ`]/g, '').split(/[^\p{L}\p{N}.]+/u).filter(w => w.length > 2));

test('cannibalisation: the tool\'s FAQ and the guide\'s FAQ ask different questions', () => {
  const tool = (real(UZ_FILE).faq as Array<{ q: string }>).map(item => item.q);
  const guides = [releasedGuide.faq, (real('content/blog/uz/slayd-tayyorlash.json').faq as Array<{ q: string }>)].flat().map(item => item.q);
  for (const q of tool) {
    for (const g of guides) {
      assert.notEqual(q.toLowerCase(), g.toLowerCase());
      const a = questionWords(q);
      const b = questionWords(g);
      const shared = [...a].filter(w => b.has(w)).length;
      const jaccard = shared / new Set([...a, ...b]).size;
      assert.ok(jaccard < 0.5, `«${q}» is too close to the guide's «${g}» (${jaccard.toFixed(2)})`);
    }
  }
});

test('keywords: after R-ST1 no other document declares a key of either tool page', () => {
  const { pages, blog } = readDocs(REPO);
  const released = new Map([...RELEASED].map(([file, content]) => [file, JSON.parse(content) as { url?: string }]));
  const docs = [...pages, ...blog].map(doc => {
    const replaced = [...released.values()].find(item => item.url === doc.url);
    return (replaced ?? doc) as Record<string, unknown>;
  });
  for (const file of [UZ_FILE, RU_FILE]) {
    const keys = declaredKeywords(real(file));
    assert.ok(keys.length >= 4, file);
    for (const doc of docs) {
      const shared = declaredKeywords(doc).filter(k => keys.includes(k));
      assert.deepEqual(shared, [], `${String(doc.url)} declares ${shared.join(', ')} of ${file}`);
    }
  }
});

test('og image: a 1200×630 PNG in apps/studio/public under the versioned name the records use', () => {
  for (const file of [UZ_FILE, RU_FILE]) {
    const og = String(real(file).ogImage);
    const local = path.join(REPO, 'apps/studio/public', path.basename(og));
    assert.ok(fs.existsSync(local), og);
    const png = fs.readFileSync(local);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
    assert.ok(png.length < 400_000, `${og} is ${png.length} bytes`);
  }
});

test('copy: pictures are "up to 2" and their rules a best effort, as the code allows (0–2, a check that can miss)', () => {
  const uz = fs.readFileSync(path.join(REPO, 'content/studio/pages/uz/taqdimot-ai.json'), 'utf8');
  const ru = fs.readFileSync(path.join(REPO, 'content/studio/pages/ru/prezentatsiya-ai.json'), 'utf8');
  assert.match(uz, /2 tagacha rasm/);
  assert.match(ru, /до 2 картинок/);
  assert.doesNotMatch(uz, /2 ta rasm|ikki slaydda AI|Rasmlarda odamlar, yozuv va bayroqlar bo‘lmaydi/);
  assert.doesNotMatch(ru, /2 картинки|на двух слайдах|Людей, надписей и флагов на картинках нет/);
  assert.match(uz, /bo‘lmasligiga harakat qilamiz/);
  assert.match(ru, /Стараемся, чтобы на картинках не было/);
  assert.match(GUIDE_NEW_TEXT.faq, /2 tagacha rasm bilan/);
});

test('copy: the processing is named next to the form (the privacy policy has no studio section before R-ST3)', () => {
  for (const file of ['content/studio/pages/uz/taqdimot-ai.json', 'content/studio/pages/ru/prezentatsiya-ai.json']) {
    const text = fs.readFileSync(path.join(REPO, file), 'utf8');
    for (const name of ['Z.ai', 'OpenRouter', 'Cloudflare Workers AI', 'Cloudflare Turnstile', 'cookie']) assert.ok(text.includes(name), `${file}: ${name}`);
    assert.match(text, /1 yilga|на 1 год/, file);
    assert.doesNotMatch(text, /Batafsil — \{privacy\}|Подробнее — в \{privacy\}/, `${file}: the policy is a general link, not "the details"`);
  }
});

// Regression guard for the gpt-chat prerender branch.
//
// `pageType: 'gpt-chat'` renders a full-viewport chat app plus a compact,
// VISIBLE summary section — it deliberately does not call renderInternalLinks().
// For a long time that meant `internalLinks` authored in the page JSON was
// silently dropped from the prerendered HTML: /uz/gpt-uzbek-tilida/ declared 14
// and 7 never reached the markup, /ru/gpt-chat/ declared 8 and lost 2. The audit
// graph still counted them, so nothing failed and the pages kept their
// not-an-orphan status while the links did not exist for a crawler.
//
// These tests fail if that ever regresses, and they fail without needing a build.
//
// Run: node --import tsx --test tests/gpt-chat-prerender-links.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { gptChatNavLinks } from '../scripts/gpt-chat-nav';
import { ENTRIES, entryScript, readViteManifest, type ViteManifest } from '../scripts/vite-manifest';
import type { Page } from '../src/shared/types';

const ROOT = process.cwd();

function gptChatPages(): { file: string; page: Page }[] {
  const out: { file: string; page: Page }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        const page = JSON.parse(fs.readFileSync(full, 'utf8')) as Page;
        if (page.pageType === 'gpt-chat') out.push({ file: full, page });
      }
    }
  };
  walk(path.join(ROOT, 'content', 'pages'));
  return out;
}

const PAGES = gptChatPages();

test('there is at least one gpt-chat page to guard', () => {
  assert.ok(PAGES.length > 0, 'no pageType=gpt-chat pages found — has the page type been renamed?');
});

test('every declared internalLink on a gpt-chat page reaches the rendered nav or the body prose', () => {
  for (const { file, page } of PAGES) {
    const nav = new Set(gptChatNavLinks(page).map((l) => l.href));
    const body = new Set<string>();
    for (const block of page.bodyBlocks || []) {
      for (const l of block.links || []) if (l.target) body.add(l.target);
      if (block.href) body.add(block.href);
    }
    const dropped = (page.internalLinks || [])
      .map((l) => l.target)
      .filter((t) => t && !nav.has(t) && !body.has(t));
    assert.deepEqual(
      dropped,
      [],
      `${file} declares internalLinks that the gpt-chat renderer would drop: ${dropped.join(', ')}`,
    );
  }
});

test('the gpt-chat summary nav carries no duplicate href', () => {
  for (const { file, page } of PAGES) {
    const hrefs = gptChatNavLinks(page).map((l) => l.href);
    const dupes = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
    assert.deepEqual(dupes, [], `${file} would render a duplicated nav href: ${dupes.join(', ')}`);
  }
});

test('every gpt-chat nav link has visible anchor text', () => {
  for (const { file, page } of PAGES) {
    for (const l of gptChatNavLinks(page)) {
      assert.ok(l.text && l.text.trim().length > 1, `${file} would render an empty nav anchor for ${l.href}`);
      assert.ok(l.href.startsWith('/'), `${file} nav href is not root-relative: ${l.href}`);
    }
  }
});

// ── Rendered-output assertions, only when a build is present ─────────────────
// Skipped rather than failed on a clean checkout so the suite stays runnable
// without `npm run build:fast`.
const built = PAGES
  .map(({ page }) => ({ url: page.url, file: path.join(ROOT, 'dist', page.url.replace(/^\/|\/$/g, ''), 'index.html'), page }))
  .filter((c) => fs.existsSync(c.file));

test('prerendered gpt-chat HTML contains every declared internal link', { skip: built.length === 0 && 'no dist/ build present' }, () => {
  for (const { file, page, url } of built) {
    const html = fs.readFileSync(file, 'utf8');
    const missing = (page.internalLinks || [])
      .map((l) => l.target)
      .filter((t) => t && !html.includes(`href="${t}"`));
    assert.deepEqual(missing, [], `${url} prerendered without declared links: ${missing.join(', ')}`);
  }
});

test('prerendered gpt-chat HTML stays structurally valid', { skip: built.length === 0 && 'no dist/ build present' }, () => {
  for (const { file, url } of built) {
    const html = fs.readFileSync(file, 'utf8');
    assert.equal((html.match(/<h1/g) || []).length, 1, `${url} must render exactly one <h1>`);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, `${url} must render exactly one canonical`);
    assert.equal((html.match(/<main/g) || []).length, 1, `${url} must render exactly one <main>`);
    assert.equal((html.match(/<nav aria-label/g) || []).length, 1, `${url} must render exactly one summary nav`);
    assert.ok(!/name="robots"[^>]*noindex/.test(html), `${url} must not be noindex`);
    assert.ok(html.includes('data-testid="seo-summary"'), `${url} lost its indexable summary section`);
  }
});

// ── Which script a chat page loads (plan WP-10) ──────────────────────────────
// The chat has lazy chunks now. "The first gpt-chat-*.js in dist/assets" could
// be one of them, and the page would load a chunk instead of the app; the
// entry comes from Vite's manifest instead.

test('the chat page loads the manifest entry, never a chunk that shares its prefix', () => {
  const manifest: ViteManifest = {
    // Directory and key order both put the lazy chunk first.
    'src/gpt-chat/parts/chat-account.ts': { file: 'assets/gpt-chat-account-Aa1.js', name: 'gpt-chat-account', isDynamicEntry: true },
    [ENTRIES.chat]: { file: 'assets/gpt-chat-Zz9.js', name: 'gpt-chat', src: ENTRIES.chat, isEntry: true },
    [ENTRIES.calculator]: { file: 'assets/telegram-cost-calculator-Q1.js', src: ENTRIES.calculator, isEntry: true },
    [ENTRIES.landing]: { file: 'assets/index-L1.js', src: ENTRIES.landing, isEntry: true },
  };
  assert.equal(entryScript(manifest, ENTRIES.chat), '/assets/gpt-chat-Zz9.js');
  assert.equal(entryScript(manifest, ENTRIES.calculator), '/assets/telegram-cost-calculator-Q1.js');
  assert.equal(entryScript(manifest, ENTRIES.landing), '/assets/index-L1.js');
  // A page without its script is a broken page: no entry, no render.
  assert.throws(() => entryScript({}, ENTRIES.chat), /not in the manifest/);
  assert.throws(() => entryScript({ [ENTRIES.chat]: { file: 'assets/gpt-chat-Zz9.js' } }, ENTRIES.chat), /not in the manifest/, 'a chunk is no entry');
  assert.throws(() => entryScript({ [ENTRIES.chat]: { file: '../evil.js', isEntry: true } }, ENTRIES.chat), /not in the manifest/);
});

test('prerender reads the manifest of the build and refuses one without it', (t) => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-manifest-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  assert.throws(() => readViteManifest(dist), /Missing \.vite\/manifest\.json/);
  fs.mkdirSync(path.join(dist, '.vite'));
  fs.writeFileSync(path.join(dist, '.vite', 'manifest.json'), JSON.stringify({ [ENTRIES.chat]: { file: 'assets/gpt-chat-Zz9.js', isEntry: true } }));
  assert.equal(entryScript(readViteManifest(dist), ENTRIES.chat), '/assets/gpt-chat-Zz9.js');

  const prerender = fs.readFileSync(path.join(ROOT, 'scripts', 'prerender.ts'), 'utf8');
  assert.doesNotMatch(prerender, /startsWith\('(gpt-chat|index|telegram-cost-calculator)-'\)|readdirSync\(assetsDir\)/, 'no prefix lookup is left');
  for (const entry of ['landing', 'chat', 'calculator']) assert.ok(prerender.includes(`entryScript(manifest, ENTRIES.${entry})`), entry);
  // The manifest keys are the inputs vite.config.ts builds.
  const vite = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
  for (const source of Object.values(ENTRIES)) assert.ok(vite.includes(`here('./${source}')`), source);
});

const manifestBuilt = fs.existsSync(path.join(ROOT, 'dist', '.vite', 'manifest.json'));
test('every prerendered chat page loads the built chat entry', { skip: (!manifestBuilt || built.length === 0) && 'no dist/ build present' }, () => {
  const src = entryScript(readViteManifest(path.join(ROOT, 'dist')), ENTRIES.chat);
  for (const { file, url } of built) {
    const scripts = [...fs.readFileSync(file, 'utf8').matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(scripts.filter((s) => s.includes('chat')), [src], url);
  }
});

// ── Release R-S1 (2026-10-05): the H1 in the chat's first screen, the FAQ and
// the free limits under the chat ─────────────────────────────────────────────
// Owner decisions 1 and 2: the page H1 stands in the chat's first screen, not
// in the text below the 100dvh app. Before JavaScript it is the only <h1> and
// sits inside #gpt-chat-root; data-h1 hands the same text to the chat, which
// shows it as the resting screen's heading.
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('the gpt-chat H1 stands in the chat’s first screen, once, and the chat receives the same text', { skip: built.length === 0 && 'no dist/ build present' }, () => {
  for (const { file, page, url } of built) {
    const html = fs.readFileSync(file, 'utf8');
    const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
    assert.equal(h1s.length, 1, `${url}: one H1`);
    assert.equal(decode(h1s[0][1].trim()), page.h1, `${url}: the H1 is the page H1`);
    const root = html.indexOf('id="gpt-chat-root"');
    const summary = html.indexOf('data-testid="seo-summary"');
    assert.ok(root > 0 && h1s[0].index! > root && h1s[0].index! < summary, `${url}: the H1 is inside #gpt-chat-root, above the summary`);
    const dataH1 = html.match(/id="gpt-chat-root"[^>]*\sdata-h1="([^"]*)"/)?.[1];
    assert.equal(decode(dataH1 ?? ''), page.h1, `${url}: data-h1 carries the H1 to the chat`);
  }
});

test('the gpt-chat summary shows its FAQ, every marked-up question and the update date', { skip: built.length === 0 && 'no dist/ build present' }, () => {
  for (const { file, page, url } of built) {
    const html = fs.readFileSync(file, 'utf8');
    const summary = html.slice(html.indexOf('data-testid="seo-summary"'));
    assert.ok((page.faq || []).length >= 4, `${url}: the chat page carries a visible FAQ`);
    assert.ok(summary.includes('data-testid="page-faq"'), `${url}: the FAQ is rendered under the chat`);
    for (const item of page.faq || []) {
      assert.ok(decode(summary).includes(item.q), `${url}: «${item.q}» is visible`);
    }
    const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
      .flatMap((m) => (JSON.parse(m[1])['@graph'] || []) as Array<Record<string, unknown>>);
    const faqPage = ld.find((node) => node['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string }> } | undefined;
    assert.deepEqual(faqPage?.mainEntity.map((q) => q.name), (page.faq || []).map((f) => f.q), `${url}: FAQPage = the visible questions`);
    const iso = new Date(page.lastReviewedAt || page.updatedAt || '').toISOString().slice(0, 10);
    assert.ok(summary.includes(`<time datetime="${iso}">${iso.split('-').reverse().join('.')}</time>`), `${url}: visible update date`);
  }
});

// The numbers in the text must be the chat server's own, or a changed limit
// would leave the pages silently wrong (roadmap 2.1/2.2: «15 in a day, 5 an
// hour» after checking the live configuration).
const configSource = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'gpt-chat', 'config.ts'), 'utf8');
const freeDefault = (name: string) => Number(configSource.match(new RegExp(`num\\(env\\.${name}, (\\d+)\\)`))?.[1]);

test('both chat pages and llms.txt state the free limits the chat server applies', () => {
  const daily = freeDefault('GPT_FREE_DAILY_LIMIT');
  const hourly = freeDefault('GPT_FREE_HOURLY_LIMIT');
  assert.ok(daily > 0 && hourly > 0, 'config.ts defaults found');
  // No deployment setting overrides the defaults.
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8'), /GPT_FREE_(DAILY|HOURLY)_LIMIT/);
  const text = (url: string) => JSON.stringify(PAGES.find(({ page }) => page.url === url)!.page);
  const uz = text('/uz/gpt-uzbek-tilida/');
  const ru = text('/ru/gpt-chat/');
  assert.match(uz, new RegExp(`kuniga ${daily} tagacha,? (va )?soatiga ${hourly} tagacha`, 'i'));
  assert.match(ru, new RegExp(`до ${daily} сообщений в день и (до )?${hourly} в час`, 'i'));
  for (const [url, body] of [['/uz/gpt-uzbek-tilida/', uz], ['/ru/gpt-chat/', ru]] as const) {
    assert.doesNotMatch(body, /raqam yozmaymiz|Конкретных чисел/, `${url}: no «we publish no numbers» line`);
  }
  const llms = fs.readFileSync(path.join(ROOT, 'public', 'llms.txt'), 'utf8');
  assert.match(llms, new RegExp(`up to ${daily} messages a day and up to ${hourly} an hour`));
});

// A line or a link in the other language names its language (R-S1 review,
// 2026-10-05): the Uzbek line at the top of the Russian chat and the Russian
// anchor on the Uzbek chat. Markup only — the visible text stays the same.
test('a paragraph or anchor in the other language carries lang on the chat pages', { skip: built.length === 0 && 'no dist/ build present' }, () => {
  const html = (url: string) => fs.readFileSync(built.find((c) => c.url === url)!.file, 'utf8');
  assert.match(html('/ru/gpt-chat/'), /<p lang="uz" class="[^"]*">O‘zbekcha yozmoqchimisiz\?/);
  assert.match(html('/ru/gpt-chat/'), /<a href="\/uz\/gpt-uzbek-tilida\/" lang="uz" hreflang="uz"[^>]*>AI-chat o‘zbek tilida<\/a>/);
  assert.match(html('/uz/gpt-uzbek-tilida/'), /<a href="\/ru\/gpt-na-russkom\/" lang="ru" hreflang="ru"[^>]*>AI-чат на русском<\/a>/);
});

// The chat's resting screen does not advertise translation before the blind
// check of the model scores it 4/5 or better (SEO roadmap 2026-10-04 §5, 3.3).
test('the chat’s first screen offers no translation starter', () => {
  const i18n = fs.readFileSync(path.join(ROOT, 'src', 'gpt-chat', 'i18n.ts'), 'utf8');
  const intros = [...i18n.matchAll(/intro:'([^']*)'/g)].map((m) => m[1]);
  assert.equal(intros.length, 2);
  for (const intro of intros) assert.doesNotMatch(intro, /перев|tarjima/i, intro);
  assert.doesNotMatch(i18n, /\{ id: 'translate'/);
});

// Growth audit 2026-10-24, W1-14 (corrected action in
// docs/seo/research/2026-10-24-growth-audit/verify-W1-14.md): every
// BreadcrumbList carried no top-level `name`, so Search Console listed each one
// as «Unnamed item», and /uz/ pointed its second crumb back at itself.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BREADCRUMB_NAME_HELD, buildBreadcrumbLd } from '../scripts/jsonld-helpers';
import { PROTECTED_PATHS } from '../scripts/seo-protection';

const SITE = 'https://gptbot.uz';
const crumbs = (pathname: string, name = 'Страница') => [
  { name: 'GPTBot.uz', item: `${SITE}/` },
  { name, item: `${SITE}${pathname}` },
];

test('a BreadcrumbList is named after its last crumb, the page itself', () => {
  const ld = buildBreadcrumbLd([
    { name: 'GPTBot.uz', item: `${SITE}/` },
    { name: 'Блог', item: `${SITE}/ru/blog/` },
    { name: 'Как заказать Telegram-бота', item: `${SITE}/ru/blog/zakazat-telegram-bota/` },
  ]);
  assert.deepEqual(Object.keys(ld), ['@type', 'name', 'itemListElement']);
  assert.equal(ld['@type'], 'BreadcrumbList');
  assert.equal(ld.name, 'Как заказать Telegram-бота');
  assert.deepEqual(
    (ld.itemListElement as Array<{ position: number; item: string }>).map((it) => [it.position, it.item]),
    [[1, `${SITE}/`], [2, `${SITE}/ru/blog/`], [3, `${SITE}/ru/blog/zakazat-telegram-bota/`]],
  );
  assert.equal(buildBreadcrumbLd(crumbs('/ru/blog/'), 'Блог GPTBot.uz').name, 'Блог GPTBot.uz');
});

test('only the held protected pages keep the nameless list they were reviewed with', () => {
  // TOP-3 roadmap 2026-10-26, Т-08 / Т-09: each held page leaves the set in
  // the reviewed revision of its own window (R-S1b 26.10, R-S2 16.11, the
  // chats and the login guide ≈21–25.11); until then its JSON-LD stays as reviewed.
  const protectedPaths = new Set<string>(PROTECTED_PATHS);
  for (const pathname of BREADCRUMB_NAME_HELD) {
    assert.ok(protectedPaths.has(pathname), `${pathname}: only a protected page may be held`);
    const ld = buildBreadcrumbLd(crumbs(pathname));
    assert.deepEqual(Object.keys(ld), ['@type', 'itemListElement'], pathname);
  }
  for (const pathname of PROTECTED_PATHS) {
    if (BREADCRUMB_NAME_HELD.has(pathname)) continue;
    assert.equal(buildBreadcrumbLd(crumbs(pathname)).name, 'Страница', `${pathname} is not held, so its list is named`);
  }
  assert.equal(buildBreadcrumbLd(crumbs('/ru/razrabotka-saytov-tashkent/', 'Разработка сайтов в Ташкенте')).name, 'Разработка сайтов в Ташкенте');
});

// R-S1b (W2-01, released 26.10.2026 by the owner's decision instead of ≈08.11)
// names the lists of its five articles; the download guide (R-S2 16.11), both
// chats and the login guide (≈25.11–02.12) keep theirs nameless until then.
const R_S1B_NAMED = [
  '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/',
  '/ru/blog/chatgpt-i-claude-v-uzbekistane/',
  '/uz/blog/chatgpt-uzbek-tilida-promptlar/',
  '/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/',
  '/uz/blog/ai-chat-nima-va-qanday-turlari-bor/',
];
const STILL_HELD = [
  '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/',
  '/ru/gpt-chat/',
  '/uz/gpt-uzbek-tilida/',
  '/uz/blog/chatgptga-qanday-kirish-mumkin/',
];

test('R-S1b names its five articles; the four pages of later windows stay held', () => {
  assert.deepEqual([...BREADCRUMB_NAME_HELD].sort(), [...STILL_HELD].sort());
  for (const pathname of R_S1B_NAMED) {
    assert.ok(!BREADCRUMB_NAME_HELD.has(pathname), `${pathname} left the held set in R-S1b`);
    assert.equal(buildBreadcrumbLd(crumbs(pathname, 'Статья')).name, 'Статья', pathname);
  }
});

test('/uz/ emits no BreadcrumbList that points back at itself', () => {
  const hub = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content/pages/uz/hub.json'), 'utf8')) as {
    url: string; schemaTypes: string[];
  };
  assert.equal(hub.url, '/uz/');
  assert.ok(!hub.schemaTypes.includes('BreadcrumbList'), 'its only crumbs would be /uz/ → /uz/');
  for (const kept of ['Organization', 'WebSite', 'FAQPage']) assert.ok(hub.schemaTypes.includes(kept), kept);
});

test('built pages: a BreadcrumbList is nameless only on a held page, named everywhere else', (t) => {
  const dist = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    t.skip('dist absent — run the build');
    return;
  }
  const pages: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (entry.name !== 'assets') visit(path.join(dir, entry.name)); }
      else if (entry.name === 'index.html') pages.push(path.join(dir, entry.name));
    }
  };
  visit(dist);
  let named = 0;
  const nameless: string[] = [];
  const renamed: string[] = [];
  for (const file of pages) {
    const pathname = `/${path.relative(dist, path.dirname(file)).split(path.sep).join('/')}/`.replace(/^\/\/$/, '/');
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(match[1]) as { '@graph'?: Array<Record<string, unknown>> } & Record<string, unknown>;
      for (const node of data['@graph'] ?? [data]) {
        if (node['@type'] !== 'BreadcrumbList') continue;
        if ('name' in node) {
          assert.ok(!BREADCRUMB_NAME_HELD.has(pathname), `${pathname}: BreadcrumbList gained a name outside its window`);
          if (R_S1B_NAMED.includes(pathname)) {
            const crumbsLd = node.itemListElement as Array<{ name: string }>;
            assert.equal(node.name, crumbsLd[crumbsLd.length - 1].name, `${pathname}: named after the article itself`);
            renamed.push(pathname);
          }
          named += 1;
        } else {
          assert.ok(BREADCRUMB_NAME_HELD.has(pathname), `${pathname}: BreadcrumbList has no name («Unnamed item» in Search Console)`);
          nameless.push(pathname);
        }
      }
    }
  }
  assert.ok(named > 300, `only ${named} named lists: is dist complete?`);
  assert.deepEqual(nameless.sort(), [...BREADCRUMB_NAME_HELD].sort());
  assert.deepEqual(renamed.sort(), [...R_S1B_NAMED].sort());
});

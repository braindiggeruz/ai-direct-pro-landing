// Growth audit 2026-10-24, W1-14 (corrected action in
// docs/seo/research/2026-10-24-growth-audit/verify-W1-14.md): every
// BreadcrumbList carried no top-level `name`, so Search Console listed each one
// as «Unnamed item», and /uz/ pointed its second crumb back at itself.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildBreadcrumbLd } from '../scripts/jsonld-helpers';
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

test('protected pages keep the nameless list they were reviewed with', () => {
  // Their HTML stays byte for byte while their measurement windows are open;
  // the next reviewed protected-pages revision may lift this.
  for (const pathname of PROTECTED_PATHS) {
    const ld = buildBreadcrumbLd(crumbs(pathname));
    assert.deepEqual(Object.keys(ld), ['@type', 'itemListElement'], pathname);
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

test('built protected pages carry no BreadcrumbList name', (t) => {
  const dist = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    t.skip('dist absent — run the build');
    return;
  }
  for (const pathname of PROTECTED_PATHS) {
    const file = path.join(dist, pathname.slice(1), 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(match[1]) as { '@graph'?: Array<Record<string, unknown>> } & Record<string, unknown>;
      for (const node of data['@graph'] ?? [data]) {
        if (node['@type'] === 'BreadcrumbList') assert.equal('name' in node, false, `${pathname}: BreadcrumbList gained a name`);
      }
    }
  }
});

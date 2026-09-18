// The homepage hreflang set is defined once (HOME_HREFLANG in src/shared/site-config.ts)
// and mirrored by a static HTML file, two content pages and the fallback sitemap.
// This test keeps those surfaces identical, so /ru/ cannot silently claim `ru`
// again (gsc-audit-2026-09-17 T13, decided 2026-09-18).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { HOME_HREFLANG, SITE_URL } from '../src/shared/site-config';
import type { Page } from '../src/shared/types';

const ROOT = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const page = (relative: string) => JSON.parse(read(relative)) as Page & { hreflangXDefault?: string };
const escape = (value: string) => value.replace(/[./]/g, '\\$&');
const link = (rel: string, hreflang: string, href: string) =>
  new RegExp(`<link rel="${rel}"${hreflang ? ` hreflang="${hreflang}"` : ''} href="${escape(href)}" />`);

test('index.html declares the homepage hreflang set from HOME_HREFLANG', () => {
  const html = read('index.html');
  assert.match(html, link('canonical', '', `${SITE_URL}/`));
  assert.match(html, link('alternate', 'ru', `${SITE_URL}${HOME_HREFLANG.ru}`));
  assert.match(html, link('alternate', 'uz', `${SITE_URL}${HOME_HREFLANG.uz}`));
  assert.match(html, link('alternate', 'x-default', `${SITE_URL}${HOME_HREFLANG.xDefault}`));
  assert.equal((html.match(/hreflang="ru"/g) ?? []).length, 1, 'exactly one ru alternate on the homepage');
});

test('/ru/ canonicalises to the homepage and declares no alternates', () => {
  const ru = page('content/pages/ru/hub.json');
  assert.equal(ru.url, '/ru/');
  assert.equal(ru.canonical, `${SITE_URL}${HOME_HREFLANG.ru}`);
  assert.equal(ru.hreflangRu || '', '');
  assert.equal(ru.hreflangUz || '', '');
  assert.equal(ru.status, 'published');
  assert.notEqual(ru.robotsIndex, false, 'a canonicalised page stays indexable; noindex + canonical is contradictory');
});

test('/uz/ is the Uzbek member and points back at the homepage', () => {
  const uz = page('content/pages/uz/hub.json');
  assert.equal(uz.url, HOME_HREFLANG.uz);
  assert.equal(uz.canonical, `${SITE_URL}${HOME_HREFLANG.uz}`);
  assert.equal(uz.hreflangRu, HOME_HREFLANG.ru);
  assert.equal(uz.hreflangUz, HOME_HREFLANG.uz);
  assert.equal(uz.hreflangXDefault, HOME_HREFLANG.xDefault);
});

test('the fallback sitemap mirrors the homepage hreflang set', () => {
  const xml = read('public/sitemap.xml');
  assert.match(xml, new RegExp(escape(`hreflang="ru" href="${SITE_URL}${HOME_HREFLANG.ru}"`)));
  assert.match(xml, new RegExp(escape(`hreflang="uz" href="${SITE_URL}${HOME_HREFLANG.uz}"`)));
  assert.match(xml, new RegExp(escape(`hreflang="x-default" href="${SITE_URL}${HOME_HREFLANG.xDefault}"`)));
  assert.doesNotMatch(xml, /href="https:\/\/gptbot\.uz\/ru\/"/);
});

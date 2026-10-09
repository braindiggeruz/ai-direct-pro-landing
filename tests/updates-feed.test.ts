import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import fg from 'fast-glob';
import { authoredDate } from '../scripts/feed-data';
import { buildUpdatesFeed, updateEntries, UPDATES_ITEM_LIMIT } from '../scripts/generate-updates-feed';
import type { BlogArticle, Page } from '../src/shared/types';

const siteUrl = 'https://gptbot.uz';
const read = <T>(pattern: string) => fg.sync(pattern).map(file => JSON.parse(fs.readFileSync(file, 'utf8')) as T);
const pages = read<Page>('content/pages/**/*.json');
const articles = read<BlogArticle>('content/blog/**/*.json');
const page = pages.find(p => p.url === '/ru/razrabotka-telegram-bota-tashkent/')!;

test('Atom exposes current canonical services and blogs, with stable IDs and authored dates', () => {
  const entries = updateEntries(pages, articles, siteUrl);
  assert.equal(entries.length, UPDATES_ITEM_LIMIT);
  assert.equal(new Set(entries.map(e => e.url)).size, entries.length);
  for (const url of ['/ru/razrabotka-telegram-bota-tashkent/', '/ru/stoimost-chat-bota/',
    '/ru/luchshie-razrabotchiki-chat-botov-tashkent/', '/uz/telegram-bot-biznes-uchun/',
    '/uz/arizalarni-qabul-qiluvchi-bot/', '/uz/chat-bot-narxi/']) {
    assert.ok(entries.some(e => e.url === url), `missing core service ${url}`);
  }
  assert.ok(entries.some(e => e.url.includes('/blog/')));
  const xml = buildUpdatesFeed(pages, articles, { siteUrl });
  assert.match(xml, /<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
  assert.match(xml, /<link rel="hub" href="https:\/\/pubsubhubbub.appspot.com\/"/);
  assert.equal(xml, buildUpdatesFeed([...pages].reverse(), [...articles].reverse(), { siteUrl }));
  for (const entry of entries) assert.ok(xml.includes(`<id>${siteUrl}${entry.url}</id>`));
});

test('Atom excludes drafts, noindex, alternate canonicals, unsafe URLs and undated content', () => {
  const candidates = [
    { ...page, url: '/draft/', status: 'draft' as const },
    { ...page, url: '/hidden/', canonical: '/hidden/', robotsIndex: false },
    { ...page, url: '/alias/', canonical: '/canonical/' },
    { ...page, url: '//outside.example/', canonical: '' },
    { ...page, url: '/query/?x=1', canonical: '' },
    { ...page, url: '/undated/', canonical: '', updatedAt: undefined, lastReviewedAt: undefined, createdAt: undefined },
    { ...page, url: '/valid/', canonical: '/valid/', title: 'A & <B>', description: '"Text"' },
  ];
  const xml = buildUpdatesFeed(candidates, [], { siteUrl });
  assert.deepEqual(updateEntries(candidates, [], siteUrl).map(e => e.url), ['/valid/']);
  assert.match(xml, /<title type="text">A &amp; &lt;B&gt;<\/title>/);
  assert.match(xml, /<summary type="text">&quot;Text&quot;<\/summary>/);
  assert.throws(() => buildUpdatesFeed([], [], { siteUrl }), /empty or undated/);
  assert.throws(() => buildUpdatesFeed([page, page], [], { siteUrl }), /Duplicate canonical/);
});

test('date normalization accepts dates/timezones but never the build time or rolled-over dates', () => {
  assert.equal(authoredDate('2026-10-09'), '2026-10-09T00:00:00Z');
  assert.equal(authoredDate('2026-10-09T10:00:00.000+05:00'), '2026-10-09T05:00:00Z');
  assert.equal(authoredDate('2026-02-30'), undefined);
  assert.equal(authoredDate('bad date'), undefined);
  assert.equal(authoredDate(undefined), undefined);
});

test('generated discovery artifacts include Atom and unambiguous short cache overrides', () => {
  const headers = fs.readFileSync(path.resolve('dist/_headers'), 'utf8');
  for (const url of ['/sitemap.xml', '/sitemap-updates.xml', '/ru/blog/feed.xml', '/uz/blog/feed.xml', '/updates/atom.xml']) {
    const block = headers.split(`${url}\n`)[1]?.split(/\n(?=\S)/)[0];
    assert.ok(block, `missing ${url}`);
    assert.match(block, /! Cache-Control/);
    assert.match(block, /Cache-Control: public, max-age=0, s-maxage=300, must-revalidate/);
  }
  assert.match(headers, /Content-Type: application\/atom\+xml; charset=utf-8/);
  assert.equal(fs.readFileSync('dist/updates/atom.xml', 'utf8'), buildUpdatesFeed(pages, articles, { siteUrl }));
});

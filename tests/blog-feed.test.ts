// The blog RSS feeds are built from the same content JSON as the HTML, so a
// feed can never announce a draft, a noindex article or the wrong locale, and
// every item link is a real published article.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { FEED_ITEM_LIMIT, buildFeed, feedArticles } from '../scripts/generate-feed';
import type { BlogArticle } from '../src/shared/types';

const SITE = { siteUrl: 'https://gptbot.uz' };

function article(overrides: Partial<BlogArticle>): BlogArticle {
  return {
    status: 'published', locale: 'ru', slug: 'x', url: '/ru/blog/x/', title: 'Title', description: 'Description',
    h1: 'H1', keywords: [], intro: '', body: [], faq: [], internalLinks: [], robotsIndex: true, robotsFollow: true,
    schemaTypes: [], datePublished: '2026-09-01', ...overrides,
  };
}

test('only published, indexable articles of the locale are listed, newest first', () => {
  const articles = [
    article({ url: '/ru/blog/old/', title: 'Old', datePublished: '2026-08-01' }),
    article({ url: '/ru/blog/draft/', title: 'Draft', status: 'draft', datePublished: '2026-09-10' }),
    article({ url: '/ru/blog/hidden/', title: 'Hidden', robotsIndex: false, datePublished: '2026-09-11' }),
    article({ url: '/uz/blog/uz/', title: 'Uz', locale: 'uz', datePublished: '2026-09-12' }),
    article({ url: '/ru/blog/new/', title: 'New', datePublished: '2026-09-05' }),
  ];
  assert.deepEqual(feedArticles(articles, 'ru').map((a) => a.title), ['New', 'Old']);
  assert.deepEqual(feedArticles(articles, 'uz').map((a) => a.title), ['Uz']);
});

test('the feed is RSS 2.0 with a self link, permalinks, RFC 822 dates and escaped text', () => {
  const xml = buildFeed([article({ title: 'Cake & <Bots>', description: 'A "quoted" answer', dateModified: '2026-09-18' })], 'ru', SITE);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<atom:link href="https:\/\/gptbot\.uz\/ru\/blog\/feed\.xml" rel="self" type="application\/rss\+xml" \/>/);
  assert.match(xml, /<link>https:\/\/gptbot\.uz\/ru\/blog\/<\/link>/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/gptbot\.uz\/ru\/blog\/x\/<\/guid>/);
  assert.match(xml, /<pubDate>Tue, 01 Sep 2026 00:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<lastBuildDate>Fri, 18 Sep 2026 00:00:00 GMT<\/lastBuildDate>/);
  assert.match(xml, /<title>Cake &amp; &lt;Bots&gt;<\/title>/);
  assert.match(xml, /<description>A &quot;quoted&quot; answer<\/description>/);
  assert.ok(!xml.includes('<Bots>'));
});

test('the feed declares a WebSub hub and marks edited items with atom:updated', () => {
  const edited = buildFeed([article({ datePublished: '2026-09-01', dateModified: '2026-09-19' })], 'ru', SITE);
  assert.match(edited, /<atom:link href="https:\/\/pubsubhubbub\.appspot\.com\/" rel="hub" \/>/);
  assert.match(edited, /<atom:updated>2026-09-19T00:00:00Z<\/atom:updated>/);

  // An item that was never edited must not claim an update, otherwise every
  // ping looks like a change and subscribers learn to ignore the feed.
  const untouched = buildFeed([article({ datePublished: '2026-09-01', dateModified: '2026-09-01' })], 'ru', SITE);
  assert.ok(!untouched.includes('<atom:updated>'));
  assert.ok(!buildFeed([article({ datePublished: '2026-09-01' })], 'ru', SITE).includes('<atom:updated>'));
});

test('the feed is capped at the newest items', () => {
  const many = Array.from({ length: FEED_ITEM_LIMIT + 5 }, (_, i) =>
    article({ url: `/ru/blog/a${i}/`, title: `A${i}`, datePublished: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` }));
  assert.equal(feedArticles(many, 'ru').length, FEED_ITEM_LIMIT);
  assert.equal((buildFeed(many, 'ru', SITE).match(/<item>/g) || []).length, FEED_ITEM_LIMIT);
});

test('the real content produces two well-formed feeds whose items are published articles', () => {
  const dir = path.join(process.cwd(), 'content', 'blog');
  const articles: BlogArticle[] = [];
  for (const locale of fs.readdirSync(dir)) {
    for (const file of fs.readdirSync(path.join(dir, locale))) {
      if (file.endsWith('.json')) articles.push(JSON.parse(fs.readFileSync(path.join(dir, locale, file), 'utf8')) as BlogArticle);
    }
  }
  const published = new Set(articles.filter((a) => a.status === 'published' && a.robotsIndex !== false).map((a) => `https://gptbot.uz${a.url}`));
  for (const locale of ['ru', 'uz'] as const) {
    const xml = buildFeed(articles, locale, SITE);
    const links = [...xml.matchAll(/<item>\s*<title>[^<]*<\/title>\s*<link>([^<]+)<\/link>/g)].map((m) => m[1]);
    assert.ok(links.length > 0, `${locale} feed is empty`);
    assert.ok(links.length <= FEED_ITEM_LIMIT);
    for (const link of links) assert.ok(published.has(link), `${link} is in the ${locale} feed but is not a published article`);
    assert.ok(links.every((link) => link.startsWith(`https://gptbot.uz/${locale}/blog/`)), `${locale} feed mixes locales`);
    assert.equal((xml.match(/<channel>/g) || []).length, 1);
    assert.ok(xml.trimEnd().endsWith('</rss>'));
  }
});

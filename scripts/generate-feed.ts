// RSS 2.0 feeds for the two blogs: dist/ru/blog/feed.xml and dist/uz/blog/feed.xml.
//
// A feed is the cheapest discovery channel for new articles: Yandex, Bing,
// Perplexity and aggregators poll it without waiting for a sitemap recrawl.
// Items come from the same content JSON the HTML is prerendered from (published,
// indexable articles only, newest first, capped at 50), so the feed can never
// announce a draft. The <link rel="alternate" type="application/rss+xml"> in
// every blog page head points here; _headers gives the files their media type.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import type { BlogArticle, GlobalSEO } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const DIST_DIR = path.join(ROOT, 'dist');

export const FEED_ITEM_LIMIT = 50;
export type FeedLocale = 'ru' | 'uz';

const CHANNEL: Record<FeedLocale, { title: string; description: string; language: string }> = {
  ru: {
    title: 'Блог GPTBot.uz',
    description: 'AI-боты, Telegram-боты, сайты и интернет-реклама для бизнеса в Узбекистане: практические разборы и цены.',
    language: 'ru',
  },
  uz: {
    title: 'GPTBot.uz blogi',
    description: 'O‘zbekistonda biznes uchun AI botlar, Telegram botlar, saytlar va internet reklama: amaliy maqolalar va narxlar.',
    language: 'uz',
  },
};

function escapeXml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
}

function rfc822(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toUTCString();
}

export function feedArticles(articles: BlogArticle[], locale: FeedLocale): BlogArticle[] {
  return articles
    .filter((a) => a.status === 'published' && a.robotsIndex !== false && (a.locale === 'uz' ? 'uz' : 'ru') === locale)
    .sort((x, y) => (y.datePublished || '').localeCompare(x.datePublished || ''))
    .slice(0, FEED_ITEM_LIMIT);
}

export function buildFeed(articles: BlogArticle[], locale: FeedLocale, global: Pick<GlobalSEO, 'siteUrl'>): string {
  const channel = CHANNEL[locale];
  const items = feedArticles(articles, locale);
  const feedUrl = `${global.siteUrl}/${locale}/blog/feed.xml`;
  const newest = items.map((a) => a.dateModified || a.datePublished || '').sort().pop();
  const lastBuild = rfc822(newest);
  const body = items.map((a) => {
    const link = `${global.siteUrl}${a.url}`;
    const pubDate = rfc822(a.datePublished);
    return [
      '    <item>',
      `      <title>${escapeXml(a.title)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      pubDate ? `      <pubDate>${pubDate}</pubDate>` : '',
      `      <description>${escapeXml(a.description)}</description>`,
      '    </item>',
    ].filter(Boolean).join('\n');
  }).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(`${global.siteUrl}/${locale}/blog/`)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    `    <language>${channel.language}</language>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    lastBuild ? `    <lastBuildDate>${lastBuild}</lastBuildDate>` : '',
    body,
    '  </channel>',
    '</rss>',
    '',
  ].filter((line) => line !== '').join('\n');
}

function main(): void {
  const global = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'global', 'site.json'), 'utf-8')) as GlobalSEO;
  const articles = fg.sync('blog/**/*.json', { cwd: CONTENT_DIR, absolute: true })
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')) as BlogArticle);
  for (const locale of ['ru', 'uz'] as const) {
    const out = path.join(DIST_DIR, locale, 'blog', 'feed.xml');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buildFeed(articles, locale, global), 'utf-8');
    console.log(`RSS feed → dist/${locale}/blog/feed.xml (${feedArticles(articles, locale).length} items)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();

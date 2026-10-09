// A bounded Atom discovery feed for existing canonical services and articles.
// Descriptions describe the page, not an invented revision or customer case.
import type { BlogArticle, GlobalSEO, Page } from '../src/shared/types';
import { articleUpdated, authoredDate, byUpdatedThenUrl, canonicalContent, escapeXml, pageUpdated, WEBSUB_HUB } from './feed-data';

export const UPDATES_ITEM_LIMIT = 200;
export interface UpdateEntry {
  url: string;
  title: string;
  description: string;
  locale: string;
  updated: string;
  published?: string;
}

export function updateEntries(pages: Page[], articles: BlogArticle[], siteUrl: string): UpdateEntry[] {
  const candidates = [
    ...pages.map(page => ({ doc: page, updated: pageUpdated(page), published: authoredDate(page.createdAt) })),
    ...articles.map(article => ({ doc: article, updated: articleUpdated(article), published: authoredDate(article.datePublished) })),
  ];
  const entries = new Map<string, UpdateEntry>();
  for (const { doc, updated, published } of candidates) {
    if (!canonicalContent(doc, siteUrl) || !updated) continue;
    if (entries.has(doc.url)) throw new Error(`Duplicate canonical feed URL: ${doc.url}`);
    entries.set(doc.url, { url: doc.url, title: doc.title, description: doc.description, locale: doc.locale, updated, published });
  }
  return [...entries.values()].sort(byUpdatedThenUrl).slice(0, UPDATES_ITEM_LIMIT);
}

export function buildUpdatesFeed(pages: Page[], articles: BlogArticle[], global: Pick<GlobalSEO, 'siteUrl'>): string {
  const entries = updateEntries(pages, articles, global.siteUrl);
  if (!entries.length) throw new Error('Cannot publish an empty or undated updates feed.');
  const feedUrl = `${global.siteUrl}/updates/atom.xml`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeXml(feedUrl)}</id>`,
    '  <title>GPTBot.uz — обновления услуг и статей / xizmatlar va maqolalar yangilanishlari</title>',
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(feedUrl)}" />`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(global.siteUrl)}/" />`,
    `  <link rel="hub" href="${escapeXml(WEBSUB_HUB)}" />`,
    '  <author><name>GPTBot.uz</name></author>',
    `  <updated>${entries[0].updated}</updated>`,
    ...entries.map(entry => [
      `  <entry xml:lang="${escapeXml(entry.locale)}">`,
      `    <id>${escapeXml(`${global.siteUrl}${entry.url}`)}</id>`,
      `    <title type="text">${escapeXml(entry.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(`${global.siteUrl}${entry.url}`)}" />`,
      `    <updated>${entry.updated}</updated>`,
      entry.published ? `    <published>${entry.published}</published>` : '',
      `    <summary type="text">${escapeXml(entry.description)}</summary>`,
      '  </entry>',
    ].filter(Boolean).join('\n')),
    '</feed>',
    '',
  ].join('\n');
}

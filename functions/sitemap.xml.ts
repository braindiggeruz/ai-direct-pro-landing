import type { Env } from './_types';
import type { BlogArticle } from '../src/shared/types';
import { articleFromRow, listPublishedBunzyArticles } from './platform/bunzy/store';
import { bunzySitemapUrl } from './platform/bunzy/render';

interface SitemapEnv extends Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export const onRequestGet: PagesFunction<SitemapEnv> = async ({ request, env }) => {
  const staticResponse = await env.ASSETS.fetch(request);
  if (!env.GPTBOT_DRAFTS_DB || !staticResponse.ok) return staticResponse;
  try {
    const xml = await staticResponse.clone().text();
    const rows = await listPublishedBunzyArticles(env.GPTBOT_DRAFTS_DB);
    const additions = rows
      .map((row) => ({ row, article: articleFromRow(row) }))
      .filter((item): item is { row: typeof rows[number]; article: BlogArticle } => Boolean(item.article))
      .filter(({ article }) => !xml.includes(`<loc>${article.canonical ?? `https://gptbot.uz${article.url}`}</loc>`))
      .map(({ row, article }) => bunzySitemapUrl(article, row.source_updated_at))
      .join('');
    if (!additions) return new Response(xml, staticResponse);
    const merged = xml.replace('</urlset>', `${additions}</urlset>`);
    const headers = new Headers(staticResponse.headers);
    headers.set('Content-Type', 'application/xml; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
    return new Response(merged, { status: 200, headers });
  } catch (error) {
    console.error(JSON.stringify({ event: 'bunzy_sitemap_fallback', reason: error instanceof Error ? error.message : 'unknown' }));
    return staticResponse;
  }
};

export const onRequest: PagesFunction<SitemapEnv> = async ({ request, env }) => env.ASSETS.fetch(request);

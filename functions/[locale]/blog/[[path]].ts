import type { Env } from '../../_types';
import type { BlogArticle, Locale } from '../../../src/shared/types';
import { articleToMarkdown } from '../../platform/bunzy/content';
import {
  articleFromRow,
  getPublishedBunzyArticle,
  listPublishedBunzyArticles,
} from '../../platform/bunzy/store';
import {
  defaultBlogCssHref,
  isLocale,
  renderBunzyArticle,
  renderBunzyIndexCard,
} from '../../platform/bunzy/render';

interface BunzyBlogEnv extends Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

function pathSegments(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return typeof value === 'string' ? value.split('/').filter(Boolean) : [];
}

async function staticAsset(request: Request, env: BunzyBlogEnv): Promise<Response> {
  return env.ASSETS.fetch(request);
}

async function blogIndex(request: Request, env: BunzyBlogEnv, locale: Locale): Promise<Response> {
  const base = await staticAsset(request, env);
  if (!env.GPTBOT_DRAFTS_DB || !base.ok) return base;
  try {
    const rows = await listPublishedBunzyArticles(env.GPTBOT_DRAFTS_DB, locale);
    const articles = rows.map(articleFromRow).filter((item): item is BlogArticle => Boolean(item));
    if (!articles.length) return base;
    const headers = new Headers(base.headers);
    headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
    headers.set('Vary', 'Accept-Encoding');
    const rewriter = new HTMLRewriter().on('section[data-testid="blog-grid"]', {
      element(element) {
        element.prepend(articles.map(renderBunzyIndexCard).join(''), { html: true });
      },
    });
    return rewriter.transform(new Response(base.body, { status: base.status, headers }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'bunzy_blog_index_fallback', reason: error instanceof Error ? error.message : 'unknown' }));
    return base;
  }
}

async function articleResponse(
  request: Request,
  env: BunzyBlogEnv,
  locale: Locale,
  slug: string,
  markdown: boolean,
): Promise<Response> {
  if (!env.GPTBOT_DRAFTS_DB) return staticAsset(request, env);
  try {
    const row = await getPublishedBunzyArticle(env.GPTBOT_DRAFTS_DB, locale, slug);
    const article = row ? articleFromRow(row) : null;
    if (!article) return staticAsset(request, env);
    if (markdown) {
      return new Response(articleToMarkdown(article), {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'public, max-age=60, s-maxage=300',
          ETag: `"${row?.payload_digest ?? ''}"`,
          'X-Robots-Tag': 'index, follow',
        },
      });
    }
    const indexUrl = new URL(`/${locale}/blog/`, request.url);
    const index = await env.ASSETS.fetch(new Request(indexUrl.toString(), { method: 'GET' }));
    const indexHtml = index.ok ? await index.text() : '';
    const html = renderBunzyArticle(article, defaultBlogCssHref(indexHtml));
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        ETag: `"${row?.payload_digest ?? ''}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'bunzy_article_fallback', locale, slug, reason: error instanceof Error ? error.message : 'unknown' }));
    return staticAsset(request, env);
  }
}

export const onRequestGet: PagesFunction<BunzyBlogEnv> = async ({ request, env, params }) => {
  const localeParam = Array.isArray(params.locale) ? params.locale[0] : params.locale;
  if (!localeParam || !isLocale(localeParam)) return staticAsset(request, env);
  const segments = pathSegments(params.path);
  if (segments.length === 0) return blogIndex(request, env, localeParam);
  if (segments.length === 1) return articleResponse(request, env, localeParam, segments[0].toLowerCase(), false);
  if (segments.length === 2 && segments[1] === 'index.html.md') {
    return articleResponse(request, env, localeParam, segments[0].toLowerCase(), true);
  }
  return staticAsset(request, env);
};

export const onRequest: PagesFunction<BunzyBlogEnv> = async ({ request, env }) => staticAsset(request, env);

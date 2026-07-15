// GET /api/seo/booster
// Returns the full SEO Booster Engine read-only report for the admin UI.
// Single subrequest to GitHub (readContentBulk), then pure in-memory analysis.
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';
import { readContentBulk } from '../../lib/github';
import { buildBoosterReport } from '../../../src/shared/booster';
import type { Page, BlogArticle, GlobalSEO } from '../../../src/shared/types';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const all = await readContentBulk(env);
  const pages: Page[] = [];
  const blog: BlogArticle[] = [];
  let globalObj: GlobalSEO | undefined;
  for (const [path, text] of Object.entries(all)) {
    if (!path.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(text);
      if (path.startsWith('content/pages/')) pages.push(parsed as Page);
      else if (path.startsWith('content/blog/')) blog.push(parsed as BlogArticle);
      else if (path === 'content/global/site.json') globalObj = parsed as GlobalSEO;
    } catch { /* skip */ }
  }
  const report = buildBoosterReport(pages, blog, globalObj);
  return new Response(JSON.stringify(report), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};

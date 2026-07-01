import type { Env } from '../_types';
import { requireAuth } from '../lib/jwt';
import { readContentBulk } from '../lib/github';
import { parseContentBulk } from '../lib/content-parse';
import { buildCockpit } from '../../src/shared/audit';
import { withErrorHandler, jsonResponse } from '../lib/api-errors';

const SITE_BASE = 'https://gptbot.uz';

async function probe(url: string): Promise<{ status: number; xRobots: string | null; contentType: string | null }> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    return { status: res.status, xRobots: res.headers.get('x-robots-tag'), contentType: res.headers.get('content-type') };
  } catch { return { status: 0, xRobots: null, contentType: null }; }
}

async function runLiveProbes(): Promise<Record<string, unknown>> {
  const [random, admin, sitemap, robots, fav, blog1] = await Promise.all([
    probe(`${SITE_BASE}/random-test-url-${Date.now()}`),
    probe(`${SITE_BASE}/admin-tools/`),
    probe(`${SITE_BASE}/sitemap.xml`),
    probe(`${SITE_BASE}/robots.txt`),
    probe(`${SITE_BASE}/favicon.svg`),
    probe(`${SITE_BASE}/assets/blog/1.png`),
  ]);
  return {
    randomUrl404: random.status === 404,
    randomUrlStatus: random.status,
    adminNoindex: (admin.xRobots || '').toLowerCase().includes('noindex'),
    adminStatus: admin.status,
    sitemap200Xml: sitemap.status === 200 && /(application|text)\/xml/.test(sitemap.contentType || ''),
    sitemapStatus: sitemap.status,
    robots200: robots.status === 200,
    faviconLive: fav.status === 200,
    sampleImageLive: blog1.status === 200,
    probedAt: new Date().toISOString(),
  };
}

// Legacy audit endpoint. Kept for backwards compatibility with the v1
// Cockpit; the new Cockpit reads /api/admin/cockpit which aggregates this
// + content + drafts + autopilot + health in a single partial-success call.
// Wrapped in `withErrorHandler` so any unexpected throw becomes a
// structured error response with a request_id instead of a raw 500.
export const onRequestGet: PagesFunction<Env> = withErrorHandler('audit', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const all = await readContentBulk(env);
  const { pages, blog, global } = parseContentBulk(all);
  const cockpit = buildCockpit(pages, global);
  const publishedBlog = blog.filter((a) => a.status === 'published');
  const blogStats = {
    totalBlog: blog.length,
    publishedBlog: publishedBlog.length,
    blogInSitemap: publishedBlog.filter((a) => a.robotsIndex !== false).length,
    blogMissingFaq: publishedBlog.filter((a) => !a.faq || a.faq.length < 3).length,
    blogMissingTitle: publishedBlog.filter((a) => !a.title).length,
    blogMissingDescription: publishedBlog.filter((a) => !a.description).length,
    blogDuplicateTitle: publishedBlog.length - new Set(publishedBlog.map((a) => a.title)).size,
  };
  const live = await runLiveProbes();
  return jsonResponse({ ...cockpit, ...blogStats, live });
});

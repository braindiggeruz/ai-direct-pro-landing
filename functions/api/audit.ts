import type { Env } from '../_types';
import { requireAuth } from '../lib/jwt';
import { readContentBulk } from '../lib/github';
// Run the same audit rules used everywhere else.
// We import compiled-from-src module path; Cloudflare bundles automatically.
import { buildCockpit } from '../../src/shared/audit';
import type { Page, BlogArticle, GlobalSEO } from '../../src/shared/types';

const SITE_BASE = 'https://gptbot.uz';

// Live SEO Health probes — fired from the same Cloudflare zone, so each
// fetch is regional and ~free. We probe one URL per category and report
// only HTTP status + content-type (no body parsing) to keep the call fast.
async function probe(url: string, method: 'GET' | 'HEAD' = 'HEAD'): Promise<{ url: string; status: number; xRobots: string | null; contentType: string | null }> {
  try {
    const res = await fetch(url, { method, redirect: 'manual' });
    return {
      url,
      status: res.status,
      xRobots: res.headers.get('x-robots-tag'),
      contentType: res.headers.get('content-type'),
    };
  } catch {
    return { url, status: 0, xRobots: null, contentType: null };
  }
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  // Single-subrequest bulk read (see lib/github.ts readContentBulk).
  // The audit previously did ~50 getFile() calls and hit the Workers
  // Free 50-subrequest cap once corpus passed 40 files.
  const all = await readContentBulk(env);
  const pages: Page[] = [];
  const blog: BlogArticle[] = [];
  let global: GlobalSEO | undefined;
  for (const [path, text] of Object.entries(all)) {
    if (!path.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(text);
      if (path.startsWith('content/pages/')) pages.push(parsed as Page);
      else if (path.startsWith('content/blog/')) blog.push(parsed as BlogArticle);
      else if (path === 'content/global/site.json') global = parsed as GlobalSEO;
    } catch { /* skip unparsable */ }
  }
  const cockpit = buildCockpit(pages, global);

  // Aggregate blog stats — pages-only buildCockpit doesn't see blog, so we
  // derive blog counters separately. Keeps the existing shape additive.
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

  return new Response(JSON.stringify({ ...cockpit, ...blogStats, live }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

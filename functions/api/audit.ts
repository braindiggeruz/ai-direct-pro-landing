import type { Env } from '../_types';
import { requireAuth } from '../lib/jwt';
import { getFile, listDir } from '../lib/github';
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

  const pageFiles = await listDir(env, 'content/pages').catch(() => []);
  const pages: Page[] = [];
  for (const p of pageFiles.filter((f) => f.endsWith('.json'))) {
    const f = await getFile(env, p);
    if (f) pages.push(JSON.parse(f.content));
  }
  const blogFiles = await listDir(env, 'content/blog').catch(() => []);
  const blog: BlogArticle[] = [];
  for (const p of blogFiles.filter((f) => f.endsWith('.json'))) {
    const f = await getFile(env, p);
    if (f) blog.push(JSON.parse(f.content));
  }
  const globalFile = await getFile(env, 'content/global/site.json').catch(() => null);
  const global: GlobalSEO | undefined = globalFile ? JSON.parse(globalFile.content) : undefined;
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

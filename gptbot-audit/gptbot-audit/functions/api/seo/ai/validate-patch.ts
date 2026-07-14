// POST /api/seo/ai/validate-patch
//
// Input body (admin SPA → backend):
//   {
//     candidate: AiSeoPatchCandidate,    // raw provider output, untrusted
//   }
//
// What this does:
//   1. Reads ALL content/ JSON files (single GraphQL subrequest).
//   2. Locates the source page/blog the candidate targets — if absent, errors.
//   3. Builds the AiPatchContext from real content store data so the validator
//      can check "internal target exists", "allowedSlugs", "money page".
//   4. Returns AiSeoPatch with per-field warnings/blocked flags.
//
// The endpoint never mutates anything. apply-patch is the only write path.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { readContentBulk } from '../../../lib/github';
import { validatePatch } from '../../../lib/ai-seo/validators';
import { makeRunId } from '../../../lib/ai-seo/store';
import type { Page, BlogArticle } from '../../../../src/shared/types';
import type {
  AiSeoPatchCandidate,
  AiSeoPatch,
  AiPatchContext,
} from '../../../../src/shared/ai-seo';
import { CLUSTERS } from '../../../../src/shared/booster';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function pickClusterFor(url: string, kind: 'page' | 'blog', blog: BlogArticle[]): string | undefined {
  for (const c of CLUSTERS) {
    if (c.money.ru.includes(url) || c.money.uz.includes(url)) return c.id;
  }
  if (kind === 'blog') {
    const a = blog.find((b) => b.url === url);
    if (a?.topicCluster) {
      const found = CLUSTERS.find((c) => c.id === a.topicCluster || c.label.toLowerCase().includes((a.topicCluster || '').toLowerCase()));
      if (found) return found.id;
    }
  }
  return undefined;
}

function buildContext(
  candidate: AiSeoPatchCandidate,
  pages: Page[],
  blog: BlogArticle[],
): { ctx: AiPatchContext; isMoneyPage: boolean } | null {
  const allUrls = new Set<string>([...pages.map((p) => p.url), ...blog.map((b) => b.url)]);
  const src = pages.find((p) => p.url === candidate.url) || blog.find((b) => b.url === candidate.url);
  if (!src) return null;
  const kind: 'page' | 'blog' = (src as Page).pageType !== undefined ? 'page' : 'blog';
  const pageType = (kind === 'page' ? (src as Page).pageType : 'blog') as string;
  const clusterId = pickClusterFor(candidate.url, kind, blog);
  const cluster = CLUSTERS.find((c) => c.id === clusterId);

  const clusterMoneyUrls = cluster
    ? [...cluster.money.ru, ...cluster.money.uz].filter((u) => allUrls.has(u) && u !== candidate.url)
    : [];

  const peers = blog
    .filter((b) => b.locale === candidate.locale && b.topicCluster && cluster && (b.topicCluster === cluster.id || cluster.label.toLowerCase().includes(b.topicCluster!.toLowerCase())))
    .filter((b) => b.url !== candidate.url)
    .slice(0, 8)
    .map((b) => ({ url: b.url, title: b.title }));

  const ctx: AiPatchContext = {
    url: candidate.url,
    locale: candidate.locale,
    kind,
    pageType,
    primaryKeyword: (src as Page).primaryKeyword || ((src as BlogArticle).keywords?.[0] ?? ''),
    title: src.title || '',
    description: src.description || '',
    h1: (src as Page).h1 || (src as BlogArticle).h1 || '',
    heroSubtitle: (src as Page).heroSubtitle,
    intro: (src as BlogArticle).intro,
    faqQ: (src.faq || []).map((f) => f.q),
    internalTargets: (src.internalLinks || []).map((l) => l.target).filter(Boolean),
    topicCluster: (src as BlogArticle).topicCluster,
    targetMoneyPage: (src as BlogArticle).targetMoneyPage,
    allowedSlugs: [...allUrls],
    clusterPeers: peers,
    clusterMoneyUrls,
  };
  return { ctx, isMoneyPage: pageType === 'money' };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  let body: { candidate?: AiSeoPatchCandidate };
  try { body = await request.json() as { candidate?: AiSeoPatchCandidate }; }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const candidate = body?.candidate;
  if (!candidate || typeof candidate !== 'object') return json({ error: 'candidate missing' }, 400);
  if (typeof candidate.url !== 'string' || !candidate.url.startsWith('/')) return json({ error: 'candidate.url invalid' }, 400);
  if (candidate.locale !== 'ru' && candidate.locale !== 'uz') return json({ error: 'candidate.locale invalid' }, 400);
  if (!Array.isArray(candidate.fields)) return json({ error: 'candidate.fields must be array' }, 400);
  if (candidate.fields.length > 12) return json({ error: 'too many fields (max 12)' }, 400);

  const all = await readContentBulk(env);
  const pages: Page[] = [];
  const blog: BlogArticle[] = [];
  for (const [path, text] of Object.entries(all)) {
    if (!path.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(text);
      if (path.startsWith('content/pages/')) pages.push(parsed as Page);
      else if (path.startsWith('content/blog/')) blog.push(parsed as BlogArticle);
    } catch { /* skip */ }
  }

  const built = buildContext(candidate, pages, blog);
  if (!built) {
    const patch: AiSeoPatch = {
      ...candidate,
      runId: makeRunId(),
      provider: candidate.provider || 'mock',
      validatedAt: new Date().toISOString(),
      globalErrors: ['URL not found in content store'],
      globalWarnings: [],
      acceptable: false,
      fields: [],
      // rawText is intentionally NOT echoed back from the server.
      rawText: undefined,
    };
    return json({ patch });
  }
  const { ctx, isMoneyPage } = built;
  const out = validatePatch(candidate, ctx, { isMoneyPage });
  const patch: AiSeoPatch = {
    url: candidate.url,
    locale: candidate.locale,
    action: candidate.action,
    provider: candidate.provider || 'mock',
    model: candidate.model,
    fields: out.fields,
    summary: typeof candidate.summary === 'string' ? candidate.summary.slice(0, 800) : undefined,
    requiresHumanReview: !!candidate.requiresHumanReview,
    runId: makeRunId(),
    validatedAt: new Date().toISOString(),
    globalErrors: out.globalErrors,
    globalWarnings: out.globalWarnings,
    acceptable: out.acceptable,
  };
  return json({ patch });
};

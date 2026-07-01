// POST /api/seo/ai/apply-patch
//
// Input body:
//   {
//     patch: AiSeoPatch,             // must be a server-validated patch
//     approvedFieldIds: string[],    // subset of patch.fields[].id to apply
//   }
//
// What this does:
//   1. Re-runs validation against the current content store (defense in depth).
//   2. Filters approved fields to only those that are not blocked.
//   3. Appends a single entry to content/seo/ai-runs.json — the "admin AI
//      ledger" — recording WHICH fields were approved and their snapshotted
//      after-values.
//   4. DOES NOT modify content/pages/** or content/blog/**. The existing
//      "Publish to GitHub" + per-page editor flow remains the only path
//      to public content. IndexNow is still manual.
//
// Why a ledger and not a direct write?
//   The spec mandates that AI never auto-publishes. Even applying field-level
//   approvals must be reversible and visible. The ledger is reviewed/applied
//   by the operator from the Page/Blog editor in a follow-up step (P1).

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { jsonResponse } from '../../../lib/api-errors';
import { readContentBulk } from '../../../lib/github';
import { parseContentBulk } from '../../../lib/content-parse';
import { validatePatch } from '../../../lib/ai-seo/validators';
import { appendRun, makeRunId } from '../../../lib/ai-seo/store';
import type { Page, BlogArticle } from '../../../../src/shared/types';
import type {
  AiSeoPatch,
  AiSeoRunLog,
  AiPatchFieldKey,
} from '../../../../src/shared/ai-seo';
import { CLUSTERS } from '../../../../src/shared/booster';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  let body: { patch?: AiSeoPatch; approvedFieldIds?: unknown };
  try { body = await request.json() as { patch?: AiSeoPatch; approvedFieldIds?: unknown }; }
  catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const patch = body?.patch;
  const approvedIds: string[] = Array.isArray(body?.approvedFieldIds)
    ? (body.approvedFieldIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  if (!patch || typeof patch !== 'object') return jsonResponse({ error: 'patch missing' }, 400);
  if (approvedIds.length === 0) return jsonResponse({ error: 'approvedFieldIds is empty' }, 400);

  // Re-validate against current content.
  const all = await readContentBulk(env);
  const { pages, blog } = parseContentBulk(all);
  const src = pages.find((p) => p.url === patch.url) || blog.find((b) => b.url === patch.url);
  if (!src) return jsonResponse({ error: 'URL no longer in content store' }, 409);

  const kind: 'page' | 'blog' = (src as Page).pageType !== undefined ? 'page' : 'blog';
  const pageType = kind === 'page' ? (src as Page).pageType : 'blog';
  const allUrls = new Set<string>([...pages.map((p) => p.url), ...blog.map((b) => b.url)]);

  const clusterId =
    CLUSTERS.find((c) => c.money.ru.includes(patch.url) || c.money.uz.includes(patch.url))?.id
    || (kind === 'blog' ? (src as BlogArticle).topicCluster : undefined);
  const cluster = CLUSTERS.find((c) => c.id === clusterId);

  const ctx = {
    url: patch.url,
    locale: patch.locale,
    kind,
    pageType: String(pageType),
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
    clusterPeers: blog
      .filter((b) => b.locale === patch.locale && b.topicCluster === cluster?.id && b.url !== patch.url)
      .slice(0, 8).map((b) => ({ url: b.url, title: b.title })),
    clusterMoneyUrls: cluster
      ? [...cluster.money.ru, ...cluster.money.uz].filter((u) => allUrls.has(u) && u !== patch.url)
      : [],
  };

  const out = validatePatch(
    {
      url: patch.url, locale: patch.locale, action: patch.action,
      provider: patch.provider, model: patch.model, summary: patch.summary,
      requiresHumanReview: patch.requiresHumanReview, fields: patch.fields,
    },
    ctx,
    { isMoneyPage: pageType === 'money' },
  );

  if (!out.acceptable) {
    return jsonResponse({ ok: false, error: 'patch no longer acceptable', validation: out }, 409);
  }

  const approvedFields = out.fields.filter((f) => approvedIds.includes(f.id) && !f.blocked);
  if (approvedFields.length === 0) {
    return jsonResponse({ ok: false, error: 'no approvable fields among approvedFieldIds' }, 400);
  }

  const applied: Partial<Record<AiPatchFieldKey, unknown>> = {};
  for (const f of approvedFields) applied[f.field] = f.after;

  const run: AiSeoRunLog = {
    runId: patch.runId || makeRunId(),
    url: patch.url,
    action: patch.action,
    provider: patch.provider,
    model: patch.model,
    status: 'applied',
    approvedFields: approvedFields.map((f) => f.field),
    errors: [],
    createdAt: new Date().toISOString(),
    applied,
  };

  await appendRun(env, run);

  return jsonResponse({ ok: true, run, appliedFieldCount: approvedFields.length });
};

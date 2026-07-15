// POST /api/admin/seo/cannibalization/analyze
//
// Body (one of):
//   { source: 'draft', draftId: string, locale: 'ru'|'uz', useSerper?: boolean, useSemantic?: boolean }
//   { source: 'editor', article: AiDraftArticle, draftId?: string, useSerper?: boolean, useSemantic?: boolean }
//   { source: 'plan_item', planItemId: string, useSerper?: boolean, useSemantic?: boolean }
//
// Returns the full Intent Guard analysis (deterministic + optional
// SERP + optional semantic + final risk score) AND persists it to
// intent_guard_analyses for audit.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft } from '../../../../lib/ai-drafts/store';
import { validateArticle, type ValidationError } from '../../../../lib/ai-drafts/validators';
import { analyzeCandidate } from '../../../../lib/intent-guard/analyze';
import { saveAnalysis } from '../../../../lib/intent-guard/audit';
import { getItem, updateItem } from '../../../../lib/intent-guard/plans';
import type { AiDraftArticle } from '../../../../../src/shared/ai-drafts';
import { withErrorHandler, jsonResponse } from '../../../../lib/api-errors';

interface OptimizerEnv extends Env { OPENROUTER_API_KEY?: string }

export const onRequestPost: PagesFunction<OptimizerEnv> = withErrorHandler<OptimizerEnv>('admin.seo.cannibalization.analyze', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ error: 'Draft storage not configured.' }, 503);

  const body = (await request.json().catch(() => null)) as null | {
    source?: 'draft' | 'editor' | 'plan_item';
    draftId?: string;
    locale?: 'ru' | 'uz';
    article?: unknown;
    planItemId?: string;
    useSerper?: boolean | 'auto';
    useSemantic?: boolean | 'auto';
  };
  if (!body || !body.source) return jsonResponse({ error: 'source required' }, 400);

  let candidate: { id: string; article: AiDraftArticle } | null = null;
  let planItemId: string | null = null;
  let draftId: string | null = null;
  let locale: 'ru' | 'uz';

  if (body.source === 'draft') {
    if (!body.draftId || (body.locale !== 'ru' && body.locale !== 'uz')) {
      return jsonResponse({ error: 'draftId + locale required' }, 400);
    }
    const draft = await getDraft(env, body.draftId);
    if (!draft) return jsonResponse({ error: 'Draft not found' }, 404);
    const a = body.locale === 'ru' ? draft.ru_article : draft.uz_article;
    if (!a) return jsonResponse({ error: `Draft has no ${body.locale.toUpperCase()} article` }, 400);
    candidate = { id: `${draft.id}#${body.locale}`, article: a };
    draftId = draft.id;
    locale = body.locale;
  } else if (body.source === 'editor') {
    if (!body.article || typeof body.article !== 'object') return jsonResponse({ error: 'article object required' }, 400);
    const errors: ValidationError[] = [];
    const a = validateArticle(body.article, 'article', errors);
    if (!a) return jsonResponse({ error: 'Article failed schema validation', validation_errors: errors.slice(0, 30) }, 422);
    candidate = { id: body.draftId ? `${body.draftId}#${a.locale}` : `editor#${a.locale}#${a.slug}`, article: a };
    draftId = body.draftId || null;
    locale = a.locale;
  } else if (body.source === 'plan_item') {
    if (!body.planItemId) return jsonResponse({ error: 'planItemId required' }, 400);
    const item = await getItem(env, body.planItemId);
    if (!item) return jsonResponse({ error: 'Plan item not found' }, 404);
    if (item.draft_id) {
      const draft = await getDraft(env, item.draft_id);
      if (!draft) return jsonResponse({ error: 'Linked draft not found' }, 404);
      const a = item.locale === 'ru' ? draft.ru_article : draft.uz_article;
      if (!a) return jsonResponse({ error: `Draft has no ${item.locale.toUpperCase()} article` }, 400);
      candidate = { id: `${draft.id}#${item.locale}`, article: a };
      draftId = draft.id;
    } else {
      // Plan item without a draft: build a synthetic article from the
      // planned title + fingerprint so the operator can still preview risk.
      candidate = {
        id: `plan-item#${item.id}`,
        article: {
          locale: item.locale,
          slug: 'planned-' + item.id.slice(-6),
          meta_title: item.planned_title.slice(0, 220),
          meta_description: item.reason_unique ? item.reason_unique.slice(0, 320) : 'Planned topic preview.',
          h1: item.planned_title,
          excerpt: item.reason_unique || item.planned_title,
          target_keyword: item.primary_keyword,
          target_money_page: item.target_money_page || '',
          author: 'GPTBot',
          body_blocks: [],
          faq: [],
          internal_links: [],
          schemas: ['Article', 'FAQPage', 'BreadcrumbList'],
          keywords: [item.primary_keyword],
        },
      };
    }
    planItemId = item.id;
    locale = item.locale;
  } else {
    return jsonResponse({ error: 'source must be draft|editor|plan_item' }, 400);
  }
  if (!candidate) return jsonResponse({ error: 'no candidate' }, 400);

  const result = await analyzeCandidate(env, {
    id: candidate.id,
    source_type: planItemId ? 'plan_item' : 'ai_draft',
    article: candidate.article,
  }, {
    useSerper: body.useSerper ?? 'auto',
    useSemantic: body.useSemantic ?? 'auto',
  });

  const recommendation = result.semantic.recommendation || {
    action: 'keep', reason: '', recommended_angle: '', recommended_keyword: '',
    recommended_funnel_stage: '', recommended_target_money_page: '',
  };

  // Persist
  const analysisId = await saveAnalysis(env, {
    target_kind: body.source === 'plan_item' ? 'plan_item' : (body.source === 'draft' ? 'draft' : 'editor'),
    draft_id: draftId,
    plan_item_id: planItemId,
    locale,
    fingerprint: result.fingerprint,
    intent_key: result.intent_key,
    deterministic: { conflicts: result.conflicts, inventory_counts: result.inventory_counts as unknown as Record<string, number> },
    serper: result.serper,
    semantic: result.semantic,
    conflicts: result.conflicts,
    risk_score: result.risk_score,
    risk_level: result.risk_level,
    recommendation,
    model: result.semantic.model,
    actor: auth.email,
  }).catch(() => null);

  // For plan items, also update the row so the planner UI reflects new risk.
  if (planItemId) {
    await updateItem(env, planItemId, {
      risk_score: result.risk_score,
      risk_level: result.risk_level,
      status: result.risk_level === 'low' ? 'analyzed' : 'needs_retarget',
    }).catch(() => null);
  }

  return jsonResponse({
    ok: true,
    analysis_id: analysisId,
    locale,
    risk_score: result.risk_score,
    risk_level: result.risk_level,
    fingerprint: result.fingerprint,
    intent_key: result.intent_key,
    conflicts: result.conflicts,
    inventory_counts: result.inventory_counts,
    recommendation,
    serper: result.serper,
    semantic: { used: result.semantic.used, summary: result.semantic.summary, model: result.semantic.model },
  });
});

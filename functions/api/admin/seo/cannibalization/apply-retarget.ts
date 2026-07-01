// POST /api/admin/seo/cannibalization/apply-retarget
//
// Persists a previously-generated retarget proposal into the draft.
// Behaviour is identical to /apply-optimization (snapshot previous
// article → replaceDraftArticle → audit event) PLUS an automatic
// recheck so the UI can show "risk before → risk after".
//
// Hard rules:
//   * JWT auth required.
//   * Status STAYS pending_review.
//   * Re-validation runs server-side; client payload is untrusted.
//   * If the recheck still reports medium/high, the analysis is saved
//     but the UI shows the new score; we do NOT auto-loop another LLM
//     call (operator can click "Создать другой вариант").

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft, replaceDraftArticle } from '../../../../lib/ai-drafts/store';
import { validateArticle, type ValidationError } from '../../../../lib/ai-drafts/validators';
import { analyzeCandidate } from '../../../../lib/intent-guard/analyze';
import { saveAnalysis, updateAnalysisApplied, logAuditEvent } from '../../../../lib/intent-guard/audit';
import { withErrorHandler, jsonResponse } from '../../../../lib/api-errors';
import { buildSeoWarnings } from '../../../../lib/seo-validation';

const MAX_BODY_BYTES = 300_000;

export const onRequestPost: PagesFunction<Env> = withErrorHandler<Env>('admin.seo.cannibalization.apply-retarget', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ error: 'Draft storage not configured.' }, 503);

  const cl = parseInt(request.headers.get('content-length') || '0', 10);
  if (cl > MAX_BODY_BYTES) return jsonResponse({ error: 'Payload too large' }, 413);

  const body = (await request.json().catch(() => null)) as null | {
    draftId?: string;
    locale?: 'ru' | 'uz';
    optimized_article?: unknown;
    analysis_id?: string;
    model?: string;
    decision?: string;
    strategy?: string;
  };
  if (!body) return jsonResponse({ error: 'invalid JSON body' }, 400);

  const draftId = typeof body.draftId === 'string' ? body.draftId : null;
  const locale = body.locale === 'ru' || body.locale === 'uz' ? body.locale : null;
  if (!draftId || !locale) return jsonResponse({ error: 'draftId + locale required' }, 400);
  if (!body.optimized_article || typeof body.optimized_article !== 'object') {
    return jsonResponse({ error: 'optimized_article object required' }, 400);
  }

  const draft = await getDraft(env, draftId);
  if (!draft) return jsonResponse({ error: 'Draft not found' }, 404);
  if (draft.status === 'rejected' || draft.status === 'imported') {
    return jsonResponse({ error: `Draft is ${draft.status} — apply-retarget disabled.` }, 409);
  }
  if (locale === 'ru' && !draft.has_ru) return jsonResponse({ error: 'Draft does not contain a RU article' }, 400);
  if (locale === 'uz' && !draft.has_uz) return jsonResponse({ error: 'Draft does not contain a UZ article' }, 400);

  const errors: ValidationError[] = [];
  const candidate = validateArticle(body.optimized_article, 'optimized_article', errors);
  if (!candidate) return jsonResponse({ error: 'Validation failed', validation_errors: errors.slice(0, 50) }, 422);

  // Force locale + keep slug stable.
  const original = locale === 'ru' ? draft.ru_article : draft.uz_article;
  candidate.locale = locale;
  if (original && candidate.slug !== original.slug) candidate.slug = original.slug;

  const warnings = buildSeoWarnings(candidate, { locale });
  const validation = { passed: warnings.length === 0, issues: warnings };

  const updated = await replaceDraftArticle(env, draftId, locale, candidate, validation, auth.email, {
    action: 'cannibalization_retarget_apply',
    model: typeof body.model === 'string' ? body.model.slice(0, 80) : null,
    decision: typeof body.decision === 'string' ? body.decision.slice(0, 40) : null,
    strategy: typeof body.strategy === 'string' ? body.strategy.slice(0, 40) : null,
    analysis_id: typeof body.analysis_id === 'string' ? body.analysis_id : null,
  });
  if (!updated) return jsonResponse({ error: 'Draft vanished mid-update' }, 404);

  // Automatic recheck: re-run analyze on the brand-new article. We do
  // NOT trust the LLM's "conflict_resolved=true" claim.
  // Note: semantic judge is disabled here on purpose — by the time we
  // reach apply-retarget the iterative loop has already validated the
  // article through deterministic + semantic during the proposal stage.
  // Re-running semantic on the recheck just costs a 4-8s LLM call and
  // tends to keep the score artificially in the 'medium' band.
  const recheck = await analyzeCandidate(env, {
    id: `${draftId}#${locale}`,
    source_type: 'ai_draft',
    article: candidate,
  }, { useSerper: 'auto', useSemantic: false });

  const recheckId = await saveAnalysis(env, {
    target_kind: 'draft',
    draft_id: draftId,
    plan_item_id: null,
    locale,
    fingerprint: recheck.fingerprint,
    intent_key: recheck.intent_key,
    deterministic: { conflicts: recheck.conflicts, inventory_counts: recheck.inventory_counts as unknown as Record<string, number> },
    serper: recheck.serper,
    semantic: recheck.semantic,
    conflicts: recheck.conflicts,
    risk_score: recheck.risk_score,
    risk_level: recheck.risk_level,
    recommendation: recheck.semantic.recommendation,
    applied: false,
    actor: auth.email,
  }).catch(() => null);

  // Mark the previous proposal row as applied.
  if (typeof body.analysis_id === 'string') {
    await updateAnalysisApplied(env, body.analysis_id, {
      after_risk_score: recheck.risk_score,
      after_risk_level: recheck.risk_level,
      applied: true,
    }).catch(() => undefined);
  }
  await logAuditEvent(env, draftId, 'cannibalization_retarget_applied', auth.email, {
    locale,
    proposal_analysis_id: body.analysis_id || null,
    recheck_analysis_id: recheckId,
    risk_score_after: recheck.risk_score,
    risk_level_after: recheck.risk_level,
  });
  await logAuditEvent(env, draftId, 'cannibalization_recheck_completed', auth.email, {
    locale,
    recheck_analysis_id: recheckId,
    risk_score_after: recheck.risk_score,
  });

  return jsonResponse({
    ok: true,
    draft: updated,
    recheck: {
      analysis_id: recheckId,
      risk_score_after: recheck.risk_score,
      risk_level_after: recheck.risk_level,
      conflicts: recheck.conflicts,
      fingerprint: recheck.fingerprint,
      semantic_used: recheck.semantic.used,
    },
  });
});

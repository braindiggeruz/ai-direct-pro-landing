// POST /api/admin/seo/cannibalization/retarget
//
// Builds an AI retarget proposal for the candidate. NEVER mutates the
// draft directly — the SPA must POST /apply-retarget afterwards.
//
// Body (one of):
//   { source: 'draft', draftId: string, locale: 'ru'|'uz', userHint?: string }
//   { source: 'editor', article: AiDraftArticle, draftId?: string, userHint?: string }

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft } from '../../../../lib/ai-drafts/store';
import { validateArticle, type ValidationError } from '../../../../lib/ai-drafts/validators';
import { analyzeCandidate } from '../../../../lib/intent-guard/analyze';
import { runRetarget } from '../../../../lib/intent-guard/retarget-client';
import { saveAnalysis, logAuditEvent } from '../../../../lib/intent-guard/audit';
import type { AiDraftArticle } from '../../../../../src/shared/ai-drafts';
import { withErrorHandler, jsonResponse } from '../../../../lib/api-errors';
import { createInflightLock } from '../../../../lib/inflight-lock';
import { buildContentInventory } from '../../../../lib/intent-guard/inventory';

interface OptimizerEnv extends Env { OPENROUTER_API_KEY?: string }

const lock = createInflightLock(180_000);

export const onRequestPost: PagesFunction<OptimizerEnv> = withErrorHandler<OptimizerEnv>('admin.seo.cannibalization.retarget', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ error: 'Draft storage not configured.' }, 503);
  // At least one LLM provider must be configured for the retarget loop.
  // The router itself returns the same diagnostic, but a 503 here saves
  // a wasted GitHub inventory read.
  const anyConfigured =
    !!env.MISTRAL_API_KEY || !!env.GEMINI_API_KEY || !!env.GROQ_API_KEY ||
    !!env.CEREBRAS_API_KEY || !!env.OPENROUTER_API_KEY;
  if (!anyConfigured) return jsonResponse({ error: 'No LLM provider configured. Add MISTRAL_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, or CEREBRAS_API_KEY.' }, 503);

  const body = (await request.json().catch(() => null)) as null | {
    source?: 'draft' | 'editor';
    draftId?: string;
    locale?: 'ru' | 'uz';
    article?: unknown;
    userHint?: string;
  };
  if (!body || !body.source) return jsonResponse({ error: 'source required' }, 400);

  let candidate: { id: string; article: AiDraftArticle } | null = null;
  let draftId: string | null = null;

  if (body.source === 'draft') {
    if (!body.draftId || (body.locale !== 'ru' && body.locale !== 'uz')) {
      return jsonResponse({ error: 'draftId + locale required' }, 400);
    }
    const draft = await getDraft(env, body.draftId);
    if (!draft) return jsonResponse({ error: 'Draft not found' }, 404);
    if (draft.status === 'rejected' || draft.status === 'imported') {
      return jsonResponse({ error: `Draft is ${draft.status} — retargeting disabled.` }, 409);
    }
    const a = body.locale === 'ru' ? draft.ru_article : draft.uz_article;
    if (!a) return jsonResponse({ error: `Draft has no ${body.locale.toUpperCase()} article` }, 400);
    candidate = { id: `${draft.id}#${body.locale}`, article: a };
    draftId = draft.id;
  } else if (body.source === 'editor') {
    if (!body.article || typeof body.article !== 'object') return jsonResponse({ error: 'article required' }, 400);
    const errors: ValidationError[] = [];
    const a = validateArticle(body.article, 'article', errors);
    if (!a) return jsonResponse({ error: 'Article failed schema validation', validation_errors: errors.slice(0, 30) }, 422);
    candidate = { id: body.draftId ? `${body.draftId}#${a.locale}` : `editor#${a.locale}#${a.slug}`, article: a };
    draftId = body.draftId || null;
  } else {
    return jsonResponse({ error: 'source must be draft|editor' }, 400);
  }
  if (!candidate) return jsonResponse({ error: 'no candidate' }, 400);

  const lockKey = `${body.source}::${candidate.id}`;
  if (!lock.take(lockKey)) {
    return jsonResponse({ error: 'Another retarget run for this article is already in flight.' }, 429);
  }
  try {
    // Re-analyze to get fresh deterministic shortlist (always on; SERP+sem optional).
    // We REUSE the analysis inventory across all retarget iterations so we
    // don't pay GitHub bulk-read 3 times.
    const inventory = await buildContentInventory(env);
    const analysis = await analyzeCandidate(env, {
      id: candidate.id,
      source_type: 'ai_draft',
      article: candidate.article,
    }, { useSerper: 'auto', useSemantic: true, inventory });

    const retarget = await runRetarget(env, {
      article: candidate.article,
      fingerprint: analysis.fingerprint,
      conflicts: analysis.conflicts,
      risk_score_before: analysis.risk_score,
      recommendation: analysis.semantic.recommendation,
      user_hint: body.userHint,
      inventory,
      candidateId: candidate.id,
    });

    if (!retarget.ok || !retarget.proposal) {
      return jsonResponse({
        ok: false,
        error: retarget.upstream_error || 'Retarget did not produce a valid proposal.',
        validation_errors: retarget.validation_errors,
        raw_excerpt: retarget.raw_excerpt,
        attempts: retarget.attempts,
      }, 502);
    }

    // Persist the proposal as an iga row (applied=false until /apply-retarget)
    const analysisId = await saveAnalysis(env, {
      target_kind: body.source === 'draft' ? 'draft' : 'editor',
      draft_id: draftId,
      plan_item_id: null,
      locale: candidate.article.locale,
      fingerprint: analysis.fingerprint,
      intent_key: analysis.intent_key,
      deterministic: { conflicts: analysis.conflicts, inventory_counts: analysis.inventory_counts as unknown as Record<string, number> },
      serper: analysis.serper,
      semantic: analysis.semantic,
      conflicts: analysis.conflicts,
      risk_score: analysis.risk_score,
      risk_level: analysis.risk_level,
      recommendation: analysis.semantic.recommendation,
      retarget_proposal: retarget.proposal,
      before_risk_score: analysis.risk_score,
      applied: false,
      model: retarget.proposal.model,
      actor: auth.email,
    }).catch(() => null);

    if (draftId) {
      await logAuditEvent(env, draftId, 'cannibalization_retarget_proposed', auth.email, {
        analysis_id: analysisId,
        risk_score_before: analysis.risk_score,
        provisional_risk_after: retarget.provisional_risk_score,
        attempts_count: retarget.attempts?.length ?? 1,
        strategy: retarget.proposal.strategy,
        decision: retarget.proposal.decision,
        model: retarget.proposal.model,
      });
    }

    return jsonResponse({
      ok: true,
      analysis_id: analysisId,
      proposal: retarget.proposal,
      risk_score_before: analysis.risk_score,
      risk_level_before: analysis.risk_level,
      conflicts: analysis.conflicts,
      fingerprint_before: analysis.fingerprint,
      semantic_used: analysis.semantic.used,
      provisional_risk_score: retarget.provisional_risk_score,
      attempts_summary: (retarget.attempts || []).map((a) => ({
        iteration: a.iteration,
        risk_score: a.provisional_risk_score,
        accepted: a.accepted,
        rejection_reason: a.rejection_reason,
        strategy: a.proposal.strategy,
      })),
      best_attempt_index: retarget.best_attempt_index,
    });
  } finally {
    lock.release(lockKey);
  }
});

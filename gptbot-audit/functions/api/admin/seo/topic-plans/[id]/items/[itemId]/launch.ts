// POST /api/admin/seo/topic-plans/:id/items/:itemId/launch
//
// Launches ONE plan item:
//   1. reserve the intent (D1 unique-index check)
//   2. mark item status='reserved' / 'generating'
//   3. call the existing /api/admin/seo-autopilot/run path (via the
//      shared startSeoAutopilotJob helper) with a small overrides JSON
//      that hints n8n at the planned topic
//   4. when the launch resolves, mark the item 'generated' (n8n already
//      stored the draft via the ingest endpoint) and run Intent Guard
//      analyze on the RU/UZ pair automatically.
//
// Note: n8n itself decides whether to honour the topic hint. Even if
// it ignores the hint and produces its usual research-driven article,
// the Intent Guard step still saves the conflict score so the operator
// can decide whether to retarget.

import type { Env } from '../../../../../../../_types';
import { requireAuth } from '../../../../../../../lib/jwt';
import { getItem, updateItem } from '../../../../../../../lib/intent-guard/plans';
import { reserveTopic, transitionReservation } from '../../../../../../../lib/intent-guard/reservations';
import { startSeoAutopilotJob } from '../../../../../../../lib/seo-autopilot/launch';
import { startSeoAutopilotJobDirect, isDirectAiEnabled } from '../../../../../../../lib/seo-autopilot/direct-launch';
import { buildLaunchPayload } from '../../../../../../../lib/seo-autopilot/payload';
import { analyzeCandidate } from '../../../../../../../lib/intent-guard/analyze';
import { saveAnalysis, logAuditEvent } from '../../../../../../../lib/intent-guard/audit';
import { getDraft } from '../../../../../../../lib/ai-drafts/store';
import { withErrorHandler, jsonResponse } from '../../../../../../../lib/api-errors';

interface CtxEnv extends Env { OPENROUTER_API_KEY?: string }

export const onRequestPost: PagesFunction<CtxEnv> = withErrorHandler<CtxEnv>('admin.seo.topic-plans.item.launch', async (ctx) => {
  const auth = await requireAuth(ctx.request, ctx.env);
  if (auth instanceof Response) return auth;
  const planId = String(ctx.params.id || '');
  const itemId = String(ctx.params.itemId || '');
  if (!planId || !itemId) return jsonResponse({ error: 'plan id + item id required' }, 400);
  if (!ctx.env.GPTBOT_DRAFTS_DB) return jsonResponse({ error: 'Draft storage not configured.' }, 503);

  const item = await getItem(ctx.env, itemId);
  if (!item || item.plan_id !== planId) return jsonResponse({ error: 'Item not found' }, 404);
  if (item.status !== 'proposed' && item.status !== 'failed') {
    return jsonResponse({ error: `Item is ${item.status} — cannot relaunch.` }, 409);
  }

  // Step 1: reserve the intent. If duplicate, abort.
  const reserve = await reserveTopic(ctx.env, {
    locale: item.locale,
    intent_key: item.intent_key,
    primary_keyword: item.primary_keyword,
    planned_title: item.planned_title,
    cluster_key: item.cluster_key,
    funnel_stage: item.funnel_stage,
    audience: item.audience,
    industry: item.industry,
    channel: item.channel,
    geo: item.geo,
    modifier: item.modifier,
    content_type: item.content_type,
    target_money_page: item.target_money_page,
    plan_id: planId,
    plan_item_id: itemId,
  });
  if (!reserve.ok) {
    if (reserve.reason === 'duplicate') {
      await updateItem(ctx.env, itemId, { status: 'failed', error_message: 'Duplicate active intent reservation' });
      return jsonResponse({ ok: false, error: 'Intent already reserved by another plan/job', existing: reserve.existing }, 409);
    }
    return jsonResponse({ ok: false, error: 'Failed to reserve intent', reason: reserve.reason }, 503);
  }
  await updateItem(ctx.env, itemId, { status: 'reserved', reservation_id: reserve.reservation.id });

  // Step 2: launch the existing pipeline synchronously. Two paths:
  //   * Direct AI (default, fast, no n8n round-trip) — pass overrides
  //     directly to the direct launcher's topic decoder.
  //   * Legacy n8n bridge — overrides MUST be wrapped in the canonical
  //     `buildLaunchPayload` envelope (task_type, site_url, manual
  //     approval flags). The previous version of this endpoint sent
  //     the raw overrides JSON, which caused n8n to reject every
  //     single-topic run with HTTP 400 in ~1.8s.
  // Single-topic launch from the Topic Plan defaults to producing
  // BOTH locales (RU + UZ) so the resulting draft is ready for the
  // dual-optimise + bilingual import workflow without a separate
  // translate step. The plan item's `locale` field is kept as the
  // primary/canonical locale (used for slug + meta) but the generator
  // produces both sides via target_locales: ['ru','uz']. Operators
  // who genuinely want a single-locale draft can still set this
  // explicitly upstream (the direct-launch interpreter respects
  // target_locales when present).
  const overrides = {
    planned_title: item.planned_title,
    primary_keyword: item.primary_keyword,
    target_money_page: item.target_money_page,
    locale: item.locale,
    target_locales: ['ru', 'uz'] as const,
    cluster: item.cluster_key,
    funnel_stage: item.funnel_stage,
    audience: item.audience,
    industry: item.industry,
    channel: item.channel,
    content_type: item.content_type,
    plan_id: planId,
    plan_item_id: itemId,
    intent_key: item.intent_key,
  };
  const useDirectAi = isDirectAiEnabled(ctx.env);
  const runId = `gptbot-plan-${planId}-${itemId}-${Date.now().toString(36)}`;
  const rawBody = useDirectAi
    ? JSON.stringify(overrides)
    : JSON.stringify(buildLaunchPayload({
        source: 'admin',
        requestedBy: auth.email,
        runId,
        overrides,
      }));
  await updateItem(ctx.env, itemId, { status: 'generating' });
  await transitionReservation(ctx.env, reserve.reservation.id, 'generating').catch(() => undefined);

  const launchFn = useDirectAi ? startSeoAutopilotJobDirect : startSeoAutopilotJob;
  const launch = await launchFn({
    env: ctx.env,
    waitUntil: (p: Promise<unknown>) => ctx.waitUntil(p),
    source: 'admin',
    requestedBy: auth.email,
    rawBody,
    runableSecret: ctx.env.N8N_WEBHOOK_SECRET || '',
    requestId: runId,
    blockOnOverlap: false,
    awaitCompletion: true,
  });

  if (!launch.ok) {
    await updateItem(ctx.env, itemId, { status: 'failed', error_message: launch.message });
    await transitionReservation(ctx.env, reserve.reservation.id, 'failed', { release_reason: launch.message }).catch(() => undefined);
    return jsonResponse({ ok: false, error: launch.message, reason: launch.reason }, launch.http);
  }

  // launch.awaited path returns the final job state inline. Find the
  // draft_id and run Intent Guard analysis automatically.
  let draftId: string | null = null;
  let jobId: string;
  if (launch.awaited && launch.job) {
    draftId = launch.job.draft_id || null;
    jobId = launch.job.id || launch.jobId;
    if (launch.job.status === 'failed') {
      await updateItem(ctx.env, itemId, { status: 'failed', error_message: launch.job.error_message || 'n8n launch failed', source_job_id: jobId });
      await transitionReservation(ctx.env, reserve.reservation.id, 'failed', { release_reason: launch.job.error_message || 'launch failed', source_job_id: jobId }).catch(() => undefined);
      return jsonResponse({ ok: false, error: launch.job.error_message || 'launch failed', job: launch.job }, 502);
    }
  } else {
    jobId = launch.jobId;
  }

  await updateItem(ctx.env, itemId, { status: 'generated', draft_id: draftId, source_job_id: jobId });
  await transitionReservation(ctx.env, reserve.reservation.id, 'generated', { draft_id: draftId, source_job_id: jobId }).catch(() => undefined);

  // Step 3: Intent Guard analyze the produced draft (RU + UZ, where available).
  const analysisResults: Array<{ locale: 'ru' | 'uz'; risk_score: number; risk_level: 'low' | 'medium' | 'high' }> = [];
  if (draftId) {
    const draft = await getDraft(ctx.env, draftId);
    if (draft) {
      const locales: Array<'ru' | 'uz'> = [];
      if (draft.has_ru) locales.push('ru');
      if (draft.has_uz) locales.push('uz');
      for (const loc of locales) {
        const article = loc === 'ru' ? draft.ru_article : draft.uz_article;
        if (!article) continue;
        try {
          const ar = await analyzeCandidate(ctx.env, {
            id: `${draftId}#${loc}`,
            source_type: 'ai_draft',
            article,
          }, { useSerper: 'auto', useSemantic: 'auto' });
          await saveAnalysis(ctx.env, {
            target_kind: 'draft',
            draft_id: draftId,
            plan_item_id: itemId,
            locale: loc,
            fingerprint: ar.fingerprint,
            intent_key: ar.intent_key,
            deterministic: { conflicts: ar.conflicts, inventory_counts: ar.inventory_counts as unknown as Record<string, number> },
            serper: ar.serper,
            semantic: ar.semantic,
            conflicts: ar.conflicts,
            risk_score: ar.risk_score,
            risk_level: ar.risk_level,
            recommendation: ar.semantic.recommendation,
            actor: auth.email,
          }).catch(() => null);
          analysisResults.push({ locale: loc, risk_score: ar.risk_score, risk_level: ar.risk_level });
        } catch { /* per-locale failure does not break others */ }
      }
    }
  }
  const worst = analysisResults.reduce<null | { locale: 'ru' | 'uz'; risk_score: number; risk_level: 'low' | 'medium' | 'high' }>(
    (acc, r) => (!acc || r.risk_score > acc.risk_score ? r : acc), null,
  );
  if (worst) {
    await updateItem(ctx.env, itemId, {
      status: worst.risk_level === 'low' ? 'ready_for_review' : 'needs_retarget',
      risk_score: worst.risk_score,
      risk_level: worst.risk_level,
    });
    await transitionReservation(ctx.env, reserve.reservation.id, worst.risk_level === 'low' ? 'ready_for_review' : 'needs_retarget').catch(() => undefined);
  } else {
    await updateItem(ctx.env, itemId, { status: 'ready_for_review' });
    await transitionReservation(ctx.env, reserve.reservation.id, 'ready_for_review').catch(() => undefined);
  }
  if (draftId) {
    await logAuditEvent(ctx.env, draftId, 'topic_plan_item_launched', auth.email, {
      plan_id: planId, plan_item_id: itemId, job_id: jobId, risk_results: analysisResults,
    });
  }

  return jsonResponse({
    ok: true,
    item_id: itemId,
    plan_id: planId,
    draft_id: draftId,
    job_id: jobId,
    risk_results: analysisResults,
  });
});


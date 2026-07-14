// POST /api/admin/seo/yandex/quick-launch
//
// One-click "Сгенерировать статью" from the Yandex Demand panel.
// Lives in the yandex/ namespace so it does NOT collide with the
// dynamic /topic-plans/[id] route in Cloudflare Pages Functions
// routing (the previous location matched the [id] dynamic segment
// and returned HTTP 405).
//
// The operator hits the green "Сгенерировать статью" button next to a
// Yandex SERP result row. This endpoint:
//
//   1. Builds an IntentFingerprint from the raw Yandex query + Yandex
//      context (top domains, our_position, recommendations).
//   2. Pre-checks the content inventory:
//        * if GPTBot.uz already ranks for this query (Yandex flag
//          our_position != null) AND an inventory item shares the same
//          intent_key → returns mode='cannibalization_risk' with the
//          existing URL + three remediation suggestions. The operator
//          chooses; we do NOT auto-create a duplicate.
//        * otherwise → continues to step 3.
//   3. Resolves the "Yandex Demand Sandbox" auto-managed Topic Plan
//      (created lazily on first quick-launch of the calendar day).
//      Adds a new plan item populated from the Yandex context.
//   4. Reserves the intent (D1 unique-index check). Duplicate reservation
//      attempts return mode='cannibalization_risk' instead of 409.
//   5. Calls the existing startSeoAutopilotJobDirect runner — SAME code
//      path the regular per-item launch uses, so we inherit the multi-
//      provider LLM router with OpenRouter primary + Gemini/Mistral/
//      Groq/Cerebras fallback + circuit-breaker + concurrency=1 heavy
//      queue + strict validators + AI Draft Inbox insert with
//      status='pending_review'.
//   6. Runs Intent Guard analyze on the RU + UZ pair (when both produced)
//      so the operator sees a risk score in the response.
//   7. Returns a single response with provider/model/fallback metadata
//      so the UI can show "Provider: OpenRouter / Model: deepseek-chat /
//      Fallback: no" alongside the draft link.
//
// Hard rules (mirrors the per-item launch endpoint):
//   * Idempotent — duplicate intent_key in the same locale fails the
//     reservation. Caller sees mode='cannibalization_risk' on a
//     second click, never two drafts.
//   * No auto-publish. Draft ships with status='pending_review',
//     manual_approval_required=true, ready_for_publish=false,
//     published=false.
//   * No n8n in the active path. Direct AI router only.
//   * No IndexNow automatic trigger.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { createPlan, getPlan, listPlans, listItems, updateItem } from '../../../../lib/intent-guard/plans';
import { reserveTopic, transitionReservation } from '../../../../lib/intent-guard/reservations';
import { startSeoAutopilotJobDirect, isDirectAiEnabled } from '../../../../lib/seo-autopilot/direct-launch';
import { startSeoAutopilotJob } from '../../../../lib/seo-autopilot/launch';
import { buildLaunchPayload } from '../../../../lib/seo-autopilot/payload';
import { analyzeCandidate } from '../../../../lib/intent-guard/analyze';
import { saveAnalysis, logAuditEvent } from '../../../../lib/intent-guard/audit';
import { getDraft } from '../../../../lib/ai-drafts/store';
import { buildFingerprint, intentKeyOf } from '../../../../lib/intent-guard/fingerprint';
import { buildContentInventory } from '../../../../lib/intent-guard/inventory';
import { withErrorHandler, jsonResponse, newRequestId } from '../../../../lib/api-errors';
import type { TopicPlan } from '../../../../../src/shared/intent-guard';

interface CtxEnv extends Env { OPENROUTER_API_KEY?: string }

interface QuickLaunchBody {
  query: string;
  locale?: 'ru' | 'uz';
  intent_hint?: string;
  // Optional Yandex SERP context — surfaces in the generated brief.
  yandex_context?: {
    difficulty_score?: number | null;
    found_total?: number | null;
    top_domains?: string[];
    gptbot_present?: boolean;
    gptbot_url?: string | null;
    recommendations?: string[];
    intent_label?: string | null;
  };
  // Optional content-shape hints. If absent we infer reasonable defaults
  // and (importantly) NEVER fabricate a money_page URL — the LLM router
  // is told to link only existing inventory entries.
  target_money_page?: string | null;
  cluster?: string | null;
  funnel_stage?: string | null;
  audience?: string | null;
  industry?: string | null;
  channel?: string | null;
  content_type?: string | null;
}

const SANDBOX_PLAN_PARAMS_FLAG = { _kind: 'yandex_demand_sandbox' as const };

function sandboxPlanNameForToday(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `Yandex Demand · ${yyyy}-${mm}-${dd}`;
}

async function resolveSandboxPlan(env: Env, createdBy: string, locale: 'ru' | 'uz' | 'ru+uz'): Promise<TopicPlan> {
  const todayName = sandboxPlanNameForToday();
  // Look back across the last 50 plans for one matching today's sandbox name.
  const recent = await listPlans(env, 50).catch(() => []);
  const match = recent.find((p) => {
    const pa = p.params as Record<string, unknown>;
    return p.name === todayName && pa?._kind === 'yandex_demand_sandbox';
  });
  if (match) {
    // Pull the fresh plan object so the items array is populated.
    const full = await getPlan(env, match.id);
    if (full) return full;
  }
  const created = await createPlan(env, {
    name: todayName,
    requested_count: 0, // sandbox grows item-by-item, no upfront target.
    locale_mode: locale,
    params: { ...SANDBOX_PLAN_PARAMS_FLAG, source: 'yandex_demand_quick_launch' },
    created_by: createdBy,
  }, []);
  return created;
}

async function insertSandboxItem(env: Env, planId: string, input: {
  locale: 'ru' | 'uz';
  planned_title: string;
  primary_keyword: string;
  intent_key: string;
  fingerprint: ReturnType<typeof buildFingerprint>;
  cluster_key?: string | null;
  funnel_stage?: string | null;
  audience?: string | null;
  industry?: string | null;
  channel?: string | null;
  content_type?: string | null;
  target_money_page?: string | null;
}): Promise<{ id: string }> {
  // Append a single item to the sandbox plan. We inline the SQL because
  // createPlan only accepts a full batch and the sandbox is incremental.
  // Mirror the schema in migrations/000X_intent_guard.sql.
  if (!env.GPTBOT_DRAFTS_DB) throw new Error('Draft storage not configured');
  const itemId = `pli_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  // Position = next ordinal among existing items.
  const existing = await listItems(env, planId).catch(() => []);
  const position = existing.length + 1;
  await env.GPTBOT_DRAFTS_DB.prepare(
    `INSERT INTO seo_topic_plan_items
      (id, plan_id, position, locale, planned_title, primary_keyword, intent_key,
       fingerprint_json, cluster_key, funnel_stage, audience, industry, channel,
       geo, modifier, content_type, target_money_page, reason_unique, supports_url,
       link_plan_json, risk_score, risk_level, status, reservation_id, draft_id,
       source_job_id, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', NULL, NULL, NULL, NULL, ?, ?)`
  ).bind(
    itemId, planId, position, input.locale, input.planned_title, input.primary_keyword, input.intent_key,
    JSON.stringify(input.fingerprint),
    input.cluster_key || null,
    input.funnel_stage || null,
    input.audience || null,
    input.industry || null,
    input.channel || null,
    null, null, // geo, modifier
    input.content_type || null,
    input.target_money_page || null,
    'Created via Yandex Demand quick-launch',
    null,
    null,
    null,
    null,
    now, now,
  ).run();
  return { id: itemId };
}

export const onRequestPost: PagesFunction<CtxEnv> = async (ctx) => {
  // 2026-06-24 — all responses use HTTP 200 with a structured body so
  // Cloudflare's custom-domain edge layer cannot swap a 5xx response
  // body for a generic "error code: 502" plain-text page (the exact
  // symptom the Yandex Demand flow used to produce). The SPA branches
  // on `r.ok` / `r.mode`, not on res.status.
  //
  // The 401-only path keeps its native status because requireAuth is
  // a separate concern and the SPA already handles 401 by redirecting
  // to the login page; the body is never read in that branch.
  const requestId = newRequestId();
  const handler: PagesFunction<CtxEnv> = withErrorHandler<CtxEnv>(
    'admin.seo.topic-plans.quick-launch',
    quickLaunchHandler,
  );
  try {
    const res = await handler(ctx);
    // If the inner withErrorHandler produced a 5xx response, rewrite it
    // as HTTP 200 with the same body so the custom domain cannot mask
    // the JSON envelope. 2xx, 3xx and 4xx responses pass through.
    if (res.status >= 500 && res.status <= 599) {
      const text = await res.text().catch(() => '');
      let body: unknown = {};
      try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 240) }; }
      const wrapped = {
        ok: false,
        mode: 'server_error',
        request_id: requestId,
        original_status: res.status,
        ...(body && typeof body === 'object' ? body : {}),
      };
      const out = jsonResponse(wrapped, 200);
      out.headers.set('x-request-id', requestId);
      out.headers.set('x-original-status', String(res.status));
      return out;
    }
    return res;
  } catch (e) {
    const err = e as Error;
    console.error(`[quick-launch] [${requestId}] uncaught: ${err?.message || String(e)}`);
    const out = jsonResponse({
      ok: false,
      mode: 'server_error',
      error: err?.message?.slice(0, 240) || 'Unexpected server error',
      request_id: requestId,
    }, 200);
    out.headers.set('x-request-id', requestId);
    return out;
  }
};

const quickLaunchHandler: PagesFunction<CtxEnv> = async (ctx) => {
  const auth = await requireAuth(ctx.request, ctx.env);
  if (auth instanceof Response) return auth;
  if (!ctx.env.GPTBOT_DRAFTS_DB) return jsonResponse({ ok: false, mode: 'unavailable', error: 'Draft storage not configured.' }, 200);

  let body: QuickLaunchBody;
  try { body = await ctx.request.json<QuickLaunchBody>(); } catch { return jsonResponse({ ok: false, mode: 'bad_request', error: 'Invalid JSON body' }, 200); }
  const query = (body.query || '').trim();
  if (!query || query.length < 3) return jsonResponse({ ok: false, mode: 'bad_request', error: 'query is required (min 3 chars)' }, 200);
  if (query.length > 200) return jsonResponse({ ok: false, mode: 'bad_request', error: 'query too long (max 200 chars)' }, 200);
  const locale: 'ru' | 'uz' = body.locale === 'uz' ? 'uz' : 'ru';

  // 1. Build intent fingerprint from the Yandex query.
  const fingerprint = buildFingerprint({
    locale,
    target_keyword: query,
    primary_keyword: query,
    h1: query,
  });
  const intent_key = intentKeyOf(fingerprint);

  // 2. Cannibalization pre-check. We consider a query "already covered"
  //    when (a) Yandex says GPTBot.uz is in the SERP OR (b) the inventory
  //    has an item with the same locale + intent_key.
  const inventory = await buildContentInventory(ctx.env).catch(() => null);
  const conflictingItem = inventory?.items.find(
    (it) => it.locale === locale && it.intent_key === intent_key,
  );
  const gptbotPresent = !!body.yandex_context?.gptbot_present;
  const gptbotUrl = body.yandex_context?.gptbot_url || conflictingItem?.url || null;

  if (gptbotPresent && (conflictingItem || gptbotUrl)) {
    return jsonResponse({
      ok: true,
      mode: 'cannibalization_risk',
      query,
      locale,
      intent_key,
      existing_url: gptbotUrl,
      existing_title: conflictingItem?.title || null,
      reason: 'GPTBot.uz already ranks for this query in Yandex and the inventory contains a page with the same intent fingerprint.',
      suggestions: [
        { action: 'improve_existing', label: 'Усилить существующую страницу', url: gptbotUrl },
        { action: 'supporting_article', label: 'Создать supporting article с другим интентом (например, how-to / FAQ / сравнение)' },
        { action: 'narrower_query', label: 'Сузить запрос до конкретной аудитории или отрасли' },
        { action: 'cancel', label: 'Отказаться от создания страницы' },
      ],
    }, 200);
  }

  // 3. Sandbox plan: one per UTC day, auto-managed.
  const sandbox = await resolveSandboxPlan(ctx.env, auth.email, locale === 'uz' ? 'uz' : 'ru');
  const planId = sandbox.id;

  // 4. Synthesize a plan item. Title is the raw Yandex query — it serves
  //    as the planned_title; the generator can refine it during the
  //    article-writing stage.
  const item = await insertSandboxItem(ctx.env, planId, {
    locale,
    planned_title: query,
    primary_keyword: query,
    intent_key,
    fingerprint,
    cluster_key: body.cluster || fingerprint.entity || null,
    funnel_stage: body.funnel_stage || fingerprint.funnel_stage || null,
    audience: body.audience || fingerprint.audience || null,
    industry: body.industry || fingerprint.industry || null,
    channel: body.channel || fingerprint.channel || null,
    content_type: body.content_type || null,
    target_money_page: body.target_money_page || null,
  });
  const itemId = item.id;

  // 5. Reserve intent — duplicate reservation here means a second click
  //    on the same query before the first finished generating. Surface
  //    it as cannibalization_risk so the UI doesn't pretend success.
  const reserve = await reserveTopic(ctx.env, {
    locale,
    intent_key,
    primary_keyword: query,
    planned_title: query,
    cluster_key: body.cluster || fingerprint.entity || null,
    funnel_stage: body.funnel_stage || fingerprint.funnel_stage || null,
    audience: body.audience || fingerprint.audience || null,
    industry: body.industry || fingerprint.industry || null,
    channel: body.channel || fingerprint.channel || null,
    geo: null,
    modifier: null,
    content_type: body.content_type || null,
    target_money_page: body.target_money_page || null,
    plan_id: planId,
    plan_item_id: itemId,
  });
  if (!reserve.ok) {
    if (reserve.reason === 'duplicate') {
      await updateItem(ctx.env, itemId, { status: 'failed', error_message: 'Duplicate intent reservation (race)' });
      return jsonResponse({
        ok: true,
        mode: 'cannibalization_risk',
        query, locale, intent_key,
        existing_url: gptbotUrl,
        reason: 'A generation job for this exact query is already in flight or completed.',
        existing_reservation: reserve.existing,
        suggestions: [
          { action: 'wait_for_existing', label: 'Дождаться завершения текущей генерации' },
          { action: 'narrower_query', label: 'Сузить запрос (другая аудитория / отрасль / угол)' },
        ],
      }, 200);
    }
    return jsonResponse({ ok: false, mode: 'reservation_failed', error: 'Failed to reserve intent', reason: reserve.reason }, 200);
  }
  await updateItem(ctx.env, itemId, { status: 'reserved', reservation_id: reserve.reservation.id });

  // 6. Launch the generation pipeline. Mirrors the per-item launch endpoint
  //    so we go through the same LLM router (OpenRouter primary), the
  //    same validators, and the same draft-insert path.
  //
  //    2026-06-24 — back to sync awaitCompletion. With
  //    google/gemini-2.5-flash-lite as the OpenRouter primary, a full
  //    RU + UZ pack completes in ~30 s including normaliser + validators
  //    + Intent Guard analyze. Cloudflare Pages Functions HTTP edge
  //    walltime is ~100 s, so the sync path has plenty of headroom and
  //    the response itself returns the final draft_id + provider/model.
  //    The earlier async ctx.waitUntil approach had to be abandoned
  //    because waitUntil consistently terminated mid-LLM-call (worker
  //    lifetime ≪ 30 s on Pages Functions), leaving jobs stuck in
  //    `normalising` status. Empirical, not theoretical.
  const overrides = {
    planned_title: query,
    primary_keyword: query,
    target_money_page: body.target_money_page || null,
    locale,
    // Single-click "generate article" defaults to BOTH locales so the
    // operator gets a ready-for-review RU + UZ bundle from one click.
    target_locales: ['ru', 'uz'] as const,
    cluster: body.cluster || fingerprint.entity || null,
    funnel_stage: body.funnel_stage || fingerprint.funnel_stage || null,
    audience: body.audience || fingerprint.audience || null,
    industry: body.industry || fingerprint.industry || null,
    channel: body.channel || fingerprint.channel || null,
    content_type: body.content_type || null,
    plan_id: planId,
    plan_item_id: itemId,
    intent_key,
    // Yandex context surfaces in the brief so the LLM has SERP grounding.
    yandex_context: body.yandex_context || null,
  };
  const useDirectAi = isDirectAiEnabled(ctx.env);
  const runId = `gptbot-yandex-${itemId}-${Date.now().toString(36)}`;
  const rawBody = useDirectAi
    ? JSON.stringify(overrides)
    : JSON.stringify(buildLaunchPayload({ source: 'admin', requestedBy: auth.email, runId, overrides }));
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
    return jsonResponse({ ok: false, mode: 'launch_failed', error: launch.message, reason: launch.reason, plan_id: planId, item_id: itemId, request_id: runId }, 200);
  }

  let draftId: string | null = null;
  let jobId: string;
  let provider: string | null = null;
  let model: string | null = null;
  let fallbackUsed = false;
  if (launch.awaited && launch.job) {
    draftId = launch.job.draft_id || null;
    jobId = launch.job.id || launch.jobId;
    provider = (launch.job as { llm_provider?: string }).llm_provider || null;
    model = (launch.job as { llm_model?: string }).llm_model || null;
    fallbackUsed = !!(launch.job as { llm_fallback_used?: number | boolean }).llm_fallback_used;
    if (launch.job.status === 'failed') {
      await updateItem(ctx.env, itemId, { status: 'failed', error_message: launch.job.error_message || 'Generation failed', source_job_id: jobId });
      await transitionReservation(ctx.env, reserve.reservation.id, 'failed', { release_reason: launch.job.error_message || 'launch failed', source_job_id: jobId }).catch(() => undefined);
      return jsonResponse({ ok: false, mode: 'launch_failed', error: launch.job.error_message || 'Generation failed', provider, model, plan_id: planId, item_id: itemId, job_id: jobId, request_id: runId }, 200);
    }
  } else {
    jobId = launch.jobId;
  }
  await updateItem(ctx.env, itemId, { status: 'generated', draft_id: draftId, source_job_id: jobId });
  await transitionReservation(ctx.env, reserve.reservation.id, 'generated', { draft_id: draftId, source_job_id: jobId }).catch(() => undefined);

  // 7. Intent Guard analyze on both locales (best-effort, runs inline so
  // the operator sees the final risk_level in the success response).
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
          const ar = await analyzeCandidate(ctx.env, { id: `${draftId}#${loc}`, source_type: 'ai_draft', article }, { useSerper: 'auto', useSemantic: 'auto' });
          await saveAnalysis(ctx.env, {
            target_kind: 'draft', draft_id: draftId, plan_item_id: itemId, locale: loc,
            fingerprint: ar.fingerprint, intent_key: ar.intent_key,
            deterministic: { conflicts: ar.conflicts, inventory_counts: ar.inventory_counts as unknown as Record<string, number> },
            serper: ar.serper, semantic: ar.semantic, conflicts: ar.conflicts,
            risk_score: ar.risk_score, risk_level: ar.risk_level,
            recommendation: ar.semantic.recommendation, actor: auth.email,
          }).catch(() => null);
          analysisResults.push({ locale: loc, risk_score: ar.risk_score, risk_level: ar.risk_level });
        } catch { /* per-locale guard is best-effort */ }
      }
    }
  }
  const worst = analysisResults.reduce<null | { locale: 'ru' | 'uz'; risk_score: number; risk_level: 'low' | 'medium' | 'high' }>(
    (acc, r) => (!acc || r.risk_score > acc.risk_score ? r : acc), null,
  );
  if (worst) {
    await updateItem(ctx.env, itemId, {
      status: worst.risk_level === 'low' ? 'ready_for_review' : 'needs_retarget',
      risk_score: worst.risk_score, risk_level: worst.risk_level,
    });
    await transitionReservation(ctx.env, reserve.reservation.id, worst.risk_level === 'low' ? 'ready_for_review' : 'needs_retarget').catch(() => undefined);
  } else {
    await updateItem(ctx.env, itemId, { status: 'ready_for_review' });
    await transitionReservation(ctx.env, reserve.reservation.id, 'ready_for_review').catch(() => undefined);
  }
  if (draftId) {
    await logAuditEvent(ctx.env, draftId, 'yandex_quick_launch', auth.email, {
      plan_id: planId, plan_item_id: itemId, job_id: jobId, query, locale,
      yandex_context: body.yandex_context || null, risk_results: analysisResults,
      provider, model, fallback_used: fallbackUsed,
    });
  }

  return jsonResponse({
    ok: true,
    mode: 'launched',
    query,
    locale,
    intent_key,
    plan_id: planId,
    item_id: itemId,
    job_id: jobId,
    request_id: runId,
    draft_id: draftId,
    provider,
    model,
    fallback_used: fallbackUsed,
    risk_results: analysisResults,
    draft_links: draftId ? {
      review: `/admin-tools/ai-drafts/${draftId}`,
    } : null,
  });
};

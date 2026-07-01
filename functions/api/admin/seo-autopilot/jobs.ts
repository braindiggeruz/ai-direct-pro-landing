// GET /api/admin/seo-autopilot/jobs
//
// JWT-authenticated list of the most recent SEO Autopilot jobs for the
// Control Center "Recent runs" panel. Performs a stale-job sweep before
// returning the list so jobs whose background worker was terminated by
// the CF Pages Functions lifecycle no longer appear as forever-running.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { markStaleJobsAsFailed } from '../../../lib/seo-autopilot/jobs';
import { whichProvidersConfigured } from '../../../lib/llm/router';
import { getDynamicRegistry } from '../../../lib/llm/model-registry';
import { jsonResponse } from '../../../lib/api-errors';

function parseErrorDetail(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Same threshold as launch.ts SYNC_STALE_THRESHOLD_MS — see that file for
// rationale. A jobs in `forwarding` older than 6 minutes is, in practice,
// a terminated bridge worker and must be surfaced to the admin as failed.
const STALE_THRESHOLD_MS = 6 * 60 * 1000;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ jobs: [], error: 'Storage not configured.' });
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '20'), 1), 100);

  // Stale sweep — single UPDATE, idempotent, only touches truly-stale rows.
  let staleSwept = 0;
  try { staleSwept = await markStaleJobsAsFailed(env, STALE_THRESHOLD_MS); } catch { /* best-effort */ }

  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(
      `SELECT id, request_id, source, requested_by, status, n8n_status, n8n_execution_id,
              generation_status, validation_status, validation_issue_count,
              draft_id, bundle_id, admin_url, deduplicated, ingestion_success,
              error_code, error_message, error_detail_json,
              created_at, updated_at, finished_at, duration_ms,
              llm_provider, llm_model, llm_fallback_used
       FROM seo_autopilot_jobs
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<Record<string, unknown>>();

  const jobs = (r.results || []).map((row) => {
    const errorDetail = parseErrorDetail(row.error_detail_json);
    const excerpt = typeof errorDetail?.excerpt === 'string' ? errorDetail.excerpt.trim() : '';
    const baseMessage = typeof row.error_message === 'string' ? row.error_message : '';

    return {
      id: row.id,
      // 2026-06-24: surface request_id so the quick-launch async flow
      // can match its locally-known runId against the polled job row.
      request_id: row.request_id,
      source: row.source,
      requested_by: row.requested_by,
      status: row.status,
      n8n_status: row.n8n_status,
      n8n_execution_id: row.n8n_execution_id,
      generation_status: row.generation_status,
      validation_status: row.validation_status,
      validation_issue_count: row.validation_issue_count,
      draft_id: row.draft_id,
      bundle_id: row.bundle_id,
      admin_url: row.admin_url,
      deduplicated: (row.deduplicated as number) === 1,
      ingestion_success: (row.ingestion_success as number) === 1,
      error_code: row.error_code,
      // Put the actual n8n response first so the existing Control Center table
      // exposes useful diagnostics instead of only "n8n returned HTTP 400".
      error_message: excerpt
        ? `${excerpt}${baseMessage ? ` — ${baseMessage}` : ''}`
        : (baseMessage || null),
      error_detail: errorDetail,
      created_at: row.created_at,
      updated_at: row.updated_at,
      finished_at: row.finished_at,
      duration_ms: row.duration_ms,
      // Multi-provider router truth — what actually produced this draft.
      llm_provider: (row.llm_provider as string) || null,
      llm_model: (row.llm_model as string) || null,
      llm_fallback_used: (row.llm_fallback_used as number) === 1,
    };
  });

  // Latest completed draft for the "Open last draft" shortcut in the UI.
  type LastDraftRow = { draft_id: string | null; admin_url: string | null; finished_at: string | null };
  const lastCompleted = await env.GPTBOT_DRAFTS_DB
    .prepare(
      `SELECT draft_id, admin_url, finished_at
       FROM seo_autopilot_jobs
       WHERE status='completed' AND draft_id IS NOT NULL
       ORDER BY finished_at DESC LIMIT 1`,
    )
    .first<LastDraftRow>();

  // Pending drafts (awaiting human approval) — useful KPI in the header.
  const pendingDraftsRow = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT COUNT(*) AS cnt FROM ai_drafts WHERE status='pending_review'`)
    .first<{ cnt: number }>();
  const pendingDrafts = Number(pendingDraftsRow?.cnt ?? 0);

  const system = {
    n8n_webhook_secret_configured: !!env.N8N_WEBHOOK_SECRET,
    cron_secret_configured: !!env.CRON_SECRET,
    drafts_db_configured: !!env.GPTBOT_DRAFTS_DB,
    external_trigger_enabled: (env.EXTERNAL_AUTOPILOT_TRIGGER_ENABLED || 'false').toLowerCase() === 'true',
    direct_ai_enabled: (env.SEO_AUTOPILOT_USE_DIRECT_AI || 'true').toLowerCase() !== 'false',
    ai_binding_configured: !!env.AI,
    stale_jobs_swept: staleSwept,
    pending_drafts: pendingDrafts,
    last_completed: lastCompleted
      ? { draft_id: lastCompleted.draft_id, admin_url: lastCompleted.admin_url, finished_at: lastCompleted.finished_at }
      : null,
    // Multi-provider router status — which provider keys are set.
    llm_providers: whichProvidersConfigured(env),
    // 2026-06-24: surface the effective per-feature OpenRouter model so
    // the operator can confirm env-var overrides reached the worker.
    llm_routes: getDynamicRegistry(env)
      .filter((m) => m.provider === 'openrouter' && m.enabled)
      .map((m) => ({
        provider: m.provider,
        model: m.model,
        features: m.features,
        locales: m.locales,
        timeout_ms: m.default_timeout_ms,
      })),
  };

  return jsonResponse({ jobs, system });
};

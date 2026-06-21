// GET /api/admin/seo-autopilot/jobs
//
// JWT-authenticated list of the most recent SEO Autopilot jobs for the
// Control Center "Recent runs" panel.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function parseErrorDetail(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB) return json({ jobs: [], error: 'Storage not configured.' });
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '20'), 1), 100);

  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(
      `SELECT id, source, requested_by, status, n8n_status, n8n_execution_id,
              generation_status, validation_status, validation_issue_count,
              draft_id, bundle_id, admin_url, deduplicated, ingestion_success,
              error_code, error_message, error_detail_json,
              created_at, updated_at, finished_at, duration_ms
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
    };
  });

  // Also surface system flags so the Control Center can render the
  // pre-flight status (e.g. "N8N_WEBHOOK_SECRET missing — click here to fix").
  const system = {
    n8n_webhook_secret_configured: !!env.N8N_WEBHOOK_SECRET,
    cron_secret_configured: !!env.CRON_SECRET,
    drafts_db_configured: !!env.GPTBOT_DRAFTS_DB,
    external_trigger_enabled: (env.EXTERNAL_AUTOPILOT_TRIGGER_ENABLED || 'false').toLowerCase() === 'true',
  };

  return json({ jobs, system });
};

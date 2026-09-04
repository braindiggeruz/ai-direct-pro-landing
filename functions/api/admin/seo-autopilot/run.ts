// POST /api/admin/seo-autopilot/run
//
// GPTBot Control Center → SEO Autopilot launcher. Requires the existing admin
// JWT, runs the first-party generation pipeline server-side and stores the
// result in the AI Draft Inbox as pending_review.
//
// IMPORTANT: this endpoint AWAITS the full generation run before responding.
// CF Pages Functions stay alive for the duration of an active request, so the
// LLM calls (dominated by I/O wait) complete reliably. Do not move this back
// to `ctx.waitUntil`: the CF runtime terminates that well before generation
// returns, which is what used to leave rows stuck in `forwarding`.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { startSeoAutopilotJobDirect } from '../../../lib/seo-autopilot/direct-launch';

import { jsonResponse } from '../../../lib/api-errors';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  // Optional payload overrides from the admin UI (e.g. topic_hint).
  let overrides: Record<string, unknown> = {};
  try {
    const ctype = request.headers.get('Content-Type') || '';
    if (ctype.toLowerCase().includes('application/json')) {
      const raw = await request.text();
      if (raw.trim()) overrides = JSON.parse(raw) as Record<string, unknown>;
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // run_id is a per-launch correlation id carried into the job row.
  const runId = `gptbot-admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const result = await startSeoAutopilotJobDirect({
    env,
    source: 'admin',
    requestedBy: auth.email,
    rawBody: JSON.stringify(overrides),
    requestId: runId,
    // Admins clicking the button override the overlap lock; the UI shows
    // the running job inline instead.
    blockOnOverlap: false,
  });

  if (!result.ok) {
    return jsonResponse(
      {
        error: result.message,
        reason: result.reason,
        ...(result.reason === 'overlap_blocked' ? { conflicting_job_id: result.conflicting_job_id } : {}),
      },
      result.http,
    );
  }

  const job = result.job;
  const isSuccess = job.status === 'completed' && !!job.draft_id;
  // Always 200 with full job state — the SPA inspects `success` + the
  // structured fields below. Returning 5xx here would force the api
  // client to discard the body, which would hide the actionable diagnostic.
  return jsonResponse(
    {
      success: isSuccess,
      accepted: true,
      job_id: result.jobId,
      run_id: runId,
      status: job.status,
      status_url: `/api/seo-autopilot/jobs/${result.jobId}`,
      source: 'admin',
      requested_by: auth.email,
      manual_approval_required: true,
      ready_for_publish: false,
      // Final state — frontend uses these directly to navigate.
      draft_id: job.draft_id,
      bundle_id: job.bundle_id,
      admin_url: job.admin_url,
      n8n_status: job.n8n_status,
      n8n_execution_id: job.n8n_execution_id,
      generation_status: job.generation_status,
      validation_status: job.validation_status,
      validation_passed: job.validation_passed,
      validation_issue_count: job.validation_issue_count,
      ingestion_success: job.ingestion_success,
      deduplicated: job.deduplicated,
      duration_ms: job.duration_ms,
      error_code: job.error_code,
      error_message: job.error_message,
      error_detail: job.error_detail,
      note: isSuccess
        ? `Draft ready at ${job.admin_url}. Manual approval required before publish.`
        : `Run completed in status=${job.status}. Inspect error_code/error_message for the failure.`,
    },
    200,
  );
};

export const onRequestGet: PagesFunction<Env> = async () =>
  jsonResponse({ error: 'Method Not Allowed', detail: 'POST with admin JWT to launch.' }, 405);

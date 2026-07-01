// POST /api/admin/seo-autopilot/run
//
// GPTBot Control Center → SEO Autopilot launcher. Requires the existing
// admin JWT, builds the launch payload server-side, calls the existing n8n
// production webhook with the server-side `x-runable-secret` header (loaded
// from the N8N_WEBHOOK_SECRET env var), and stores the result in the AI
// Draft Inbox.
//
// The browser never sees N8N_WEBHOOK_SECRET — it lives only in
// Cloudflare Pages secrets and the server-to-server fetch.
//
// IMPORTANT: this endpoint AWAITS the full n8n call before responding.
// CF Pages Functions stay alive for the duration of an active request,
// so the fetch to n8n (1–4 min wall time, dominated by I/O wait) is
// completed reliably. Previously the bridge used `ctx.waitUntil` which is
// terminated by the CF runtime well before n8n returned — that is why
// every single end-to-end run before this fix ended in a stuck
// `forwarding` row with `n8n_status=null`.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { startSeoAutopilotJob } from '../../../lib/seo-autopilot/launch';
import { startSeoAutopilotJobDirect, isDirectAiEnabled } from '../../../lib/seo-autopilot/direct-launch';
import { buildLaunchPayload } from '../../../lib/seo-autopilot/payload';
import { jsonResponse } from '../../../lib/api-errors';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
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

  // run_id is a per-launch correlation id surfaced into the n8n payload.
  const runId = `gptbot-admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const useDirectAi = isDirectAiEnabled(env);

  // When direct AI is enabled (default), forward the overrides as-is so
  // the direct launcher can read planned_title/primary_keyword/locale.
  // When legacy n8n bridge is selected, wrap them into the canonical
  // safety-locked launch payload.
  const rawBody = useDirectAi
    ? JSON.stringify(overrides)
    : JSON.stringify(buildLaunchPayload({
        source: 'admin',
        requestedBy: auth.email,
        runId,
        overrides,
      }));

  const launchFn = useDirectAi ? startSeoAutopilotJobDirect : startSeoAutopilotJob;
  const result = await launchFn({
    env,
    waitUntil,
    source: 'admin',
    requestedBy: auth.email,
    rawBody,
    runableSecret: env.N8N_WEBHOOK_SECRET || '',
    requestId: runId,
    // Admins clicking the button override the overlap lock; the UI shows
    // the running job inline instead.
    blockOnOverlap: false,
    // ★ Critical: sync-await mode. The HTTP handler holds the request
    // open for the duration of the n8n call (~1–4 min) and returns the
    // final job state. No polling required from the browser.
    awaitCompletion: true,
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

  // awaitCompletion === true → result.job is populated.
  if (!result.awaited) {
    // Defensive: should never hit because we set awaitCompletion=true.
    return jsonResponse(
      {
        success: true,
        accepted: true,
        job_id: result.jobId,
        run_id: runId,
        status: result.status,
        status_url: `/api/seo-autopilot/jobs/${result.jobId}`,
        source: 'admin',
        requested_by: auth.email,
        manual_approval_required: true,
        ready_for_publish: false,
        note: 'SEO Autopilot launched in async mode. Poll status_url for the draft.',
      },
      202,
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

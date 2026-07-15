// Single internal entry point used by:
//   - POST /api/admin/seo-autopilot/run            (source='admin', sync-await)
//   - POST /api/internal/seo-autopilot/scheduled-run (source='schedule')
//   - POST /api/seo-autopilot/run (legacy)         (source='external', opt-in)
//
// startSeoAutopilotJob enforces:
//   * presence of N8N_WEBHOOK_SECRET (one-time owner input — clear error
//     when missing so the admin UI can render an actionable message).
//   * presence of GPTBOT_DRAFTS_DB.
//   * no-overlap lock for scheduled runs: if any non-terminal job exists
//     within OVERLAP_WINDOW_MS, the new launch returns
//     'overlap_blocked' without enqueuing a duplicate.
//
// Two execution modes are supported:
//
//   * `awaitCompletion: false` (legacy, default for external/schedule):
//       Function creates the row, then schedules processN8nResponseInBackground
//       via the caller's `ctx.waitUntil`. The HTTP handler returns 202 + job_id
//       immediately. Polling-based UI required. NOTE: CF Pages Functions
//       have hard lifecycle limits on waitUntil — jobs that take longer than
//       ~30s of total worker time will be terminated mid-flight and stay
//       stuck in `forwarding`. The stale-job watchdog rescues them, but a
//       single end-to-end success is not guaranteed in this mode.
//
//   * `awaitCompletion: true` (new, used by the admin Control Center):
//       Function creates the row, then AWAITS processN8nResponseInBackground
//       inline. The HTTP request stays alive for the entire n8n call (CF
//       Pages keeps the function running until the response is sent or the
//       request is aborted). The handler returns 200 with the final job
//       state (including draft_id when ingest succeeded) — no polling
//       required.
//
//       This is the reliable production path: CF Pages allows a single
//       request to run for as long as its subrequests are active, and the
//       fetch() to n8n is one such subrequest.

import type { Env } from '../../_types';
import { createJob, getJob, markStaleJobsAsFailed, newJobId, updateJob } from './jobs';
import type { AutopilotJob } from './jobs';
import { processN8nResponseInBackground } from './bridge-worker';

export type JobSource = 'admin' | 'schedule' | 'external';

// 5 minutes — enough to cover a normal n8n run (30–240 s) plus headroom.
const OVERLAP_WINDOW_MS = 5 * 60 * 1000;

// The synchronous-await path uses this to surface a stale job to the
// admin without making them wait indefinitely if CF somehow aborts the
// request. n8n's worst-case generation is ~240s; we wait 6 min then
// declare stale.
const SYNC_STALE_THRESHOLD_MS = 6 * 60 * 1000;

export interface StartJobInput {
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
  source: JobSource;
  requestedBy: string;               // e.g. admin email, "system:schedule", "system:external"
  rawBody: string;                   // forwarded to n8n
  runableSecret: string;             // n8n auth header value (x-runable-secret)
  requestId?: string | null;
  /**
   * When true (default for source='schedule'), refuses to enqueue if a
   * non-terminal job exists in the last OVERLAP_WINDOW_MS. Manual runs
   * default to false: the operator deliberately clicked the button.
   */
  blockOnOverlap?: boolean;
  /**
   * When true, the launcher AWAITS the n8n call inline and returns the
   * final job row. Used by the admin Control Center launch path so the
   * UI gets `draft_id` on the same response (no polling required). When
   * false (default for backwards compat) the launcher returns immediately
   * with status='pending' and the n8n call is scheduled via waitUntil.
   */
  awaitCompletion?: boolean;
}

export type StartJobResult =
  | { ok: true; jobId: string; status: 'pending'; awaited: false }
  | { ok: true; jobId: string; status: AutopilotJob['status']; awaited: true; job: AutopilotJob }
  | { ok: false; reason: 'webhook_secret_missing'; http: 503; message: string }
  | { ok: false; reason: 'storage_missing'; http: 503; message: string }
  | { ok: false; reason: 'overlap_blocked'; http: 409; message: string; conflicting_job_id: string };

export async function startSeoAutopilotJob(input: StartJobInput): Promise<StartJobResult> {
  const { env, source } = input;
  if (!env.GPTBOT_DRAFTS_DB) {
    return { ok: false, reason: 'storage_missing', http: 503,
      message: 'Draft storage not configured. Set the GPTBOT_DRAFTS_DB D1 binding in Cloudflare Pages.' };
  }
  if (!env.N8N_WEBHOOK_SECRET && !input.runableSecret) {
    return { ok: false, reason: 'webhook_secret_missing', http: 503,
      message: 'N8N_WEBHOOK_SECRET is not configured. Set it in Cloudflare Pages → ai-direct-pro-landing → Settings → Environment variables to the value the n8n "Validate Safety Rules" node expects.' };
  }

  // Stale sweep before any new launch so the "conflict" check below does
  // not see ghost rows from previous worker terminations.
  try { await markStaleJobsAsFailed(env, SYNC_STALE_THRESHOLD_MS); } catch { /* best-effort */ }

  // Overlap guard — scheduled launches must never stack on top of an
  // already-running job. Admin runs opt in via blockOnOverlap.
  const blockOverlap = input.blockOnOverlap ?? source === 'schedule';
  if (blockOverlap) {
    const conflict = await env.GPTBOT_DRAFTS_DB
      .prepare(
        `SELECT id FROM seo_autopilot_jobs
         WHERE status IN ('pending', 'forwarding', 'normalising', 'ingesting')
           AND datetime(created_at) > datetime('now', '-' || ? || ' seconds')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(Math.floor(OVERLAP_WINDOW_MS / 1000))
      .first<{ id: string }>();
    if (conflict) {
      return {
        ok: false,
        reason: 'overlap_blocked',
        http: 409,
        message: `Another SEO Autopilot job (${conflict.id}) is already running. Wait for it to finish.`,
        conflicting_job_id: conflict.id,
      };
    }
  }

  const jobId = newJobId();
  const requestId =
    input.requestId ||
    `${source}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const n8nUrl = 'https://braindigger.app.n8n.cloud/webhook/runable-seo-autopilot';

  await createJob(env, { id: jobId, request_id: requestId, n8n_url: n8nUrl });
  // Stamp source + requested_by (added by migration 0003).
  await updateJob(env, jobId, {});
  await env.GPTBOT_DRAFTS_DB
    .prepare('UPDATE seo_autopilot_jobs SET source = ?, requested_by = ?, updated_at = ? WHERE id = ?')
    .bind(source, input.requestedBy, new Date().toISOString(), jobId)
    .run();

  // Use the explicitly-passed secret (legacy public bridge forwards what
  // the caller sent) or the server-side N8N_WEBHOOK_SECRET (Control Center).
  const secret = input.runableSecret || env.N8N_WEBHOOK_SECRET!;

  if (input.awaitCompletion) {
    // Sync path: process inline, read the final row, return it. The HTTP
    // handler stays alive — CF Pages does not abort an active request.
    try {
      await processN8nResponseInBackground(env, jobId, input.rawBody, secret);
    } catch {
      // bridge-worker is defensive; this catch is a last-resort backstop.
      // The bridge itself records failure via failJob() so the row is
      // already accurate.
    }
    const job = await getJob(env, jobId);
    if (!job) {
      // Should not happen — we just created it.
      return { ok: true, jobId, status: 'failed', awaited: true,
        job: {
          id: jobId, request_id: requestId, status: 'failed', n8n_url: n8nUrl,
          n8n_status: null, n8n_execution_id: null, generation_status: null,
          validation_status: null, validation_passed: null, validation_issue_count: null,
          draft_id: null, bundle_id: null, admin_url: null,
          ingestion_success: false, deduplicated: false,
          error_code: 'job_row_missing',
          error_message: 'Job row vanished between create and read. Inspect D1 manually.',
          error_detail: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          finished_at: new Date().toISOString(), duration_ms: 0,
          llm_provider: null, llm_model: null, llm_fallback_used: false,
        },
      };
    }
    return { ok: true, jobId, status: job.status, awaited: true, job };
  }

  // Async path: schedule background processor via the caller's waitUntil.
  // Kept for backwards compatibility (scheduled cron + legacy public
  // endpoint) where there is no client connection to hold open.
  input.waitUntil(processN8nResponseInBackground(env, jobId, input.rawBody, secret));

  return { ok: true, jobId, status: 'pending', awaited: false };
}

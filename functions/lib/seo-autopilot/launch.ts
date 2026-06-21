// Single internal entry point used by:
//   - POST /api/admin/seo-autopilot/run            (source='admin')
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
// The function does NOT await the n8n call. It creates the job row and
// schedules the background processor via the supplied `waitUntil`. Two
// callers reuse this:
//   * Pages Functions handlers pass their own `ctx.waitUntil`.
//   * The cron worker schedules from inside its own context.

import type { Env } from '../../_types';
import { createJob, newJobId, updateJob } from './jobs';
import { processN8nResponseInBackground } from './bridge-worker';

export type JobSource = 'admin' | 'schedule' | 'external';

// 5 minutes — enough to cover a normal n8n run (30–120 s) plus headroom.
const OVERLAP_WINDOW_MS = 5 * 60 * 1000;

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
}

export type StartJobResult =
  | { ok: true; jobId: string; status: 'pending' }
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
  // Runable sent) or the server-side N8N_WEBHOOK_SECRET (Control Center).
  const secret = input.runableSecret || env.N8N_WEBHOOK_SECRET!;

  // Hand off to the shared background processor via the caller's
  // waitUntil — same code path as before, just now used from multiple entry
  // points.
  input.waitUntil(processN8nResponseInBackground(env, jobId, input.rawBody, secret));

  return { ok: true, jobId, status: 'pending' };
}

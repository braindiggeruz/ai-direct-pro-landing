// POST /api/internal/seo-autopilot/scheduled-run
//
// Called by the GitHub Actions cron workflow (Mon + Thu 09:00 UTC).
// Authenticates with the server-side CRON_SECRET bearer, looks up the
// schedule mode in `system_settings`, and:
//
//   * If the schedule says today is an active day → launches the SEO
//     Autopilot with source='schedule', requested_by='system:schedule'.
//   * Otherwise → returns 200 with skipped=true (the cron worker exits
//     without flagging a failure — this is by design so cron stays green
//     for "schedule disabled today").
//
// Hard-protected: the overlap guard prevents double-runs.

import type { Env } from '../../../_types';
import { constantTimeEqual } from '../../../lib/ai-drafts/store';
import { getSchedule, shouldRunOnDate } from '../../../lib/seo-autopilot/schedule';
import { startSeoAutopilotJobDirect } from '../../../lib/seo-autopilot/direct-launch';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function extractBearer(req: Request): string | null {
  const h = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!h || !h.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return t || null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.CRON_SECRET) {
    return json({ error: 'Cron not configured (CRON_SECRET missing).' }, 503);
  }
  const token = extractBearer(request);
  if (!token) return json({ error: 'Missing Authorization bearer token' }, 401);
  if (!constantTimeEqual(token, env.CRON_SECRET)) return json({ error: 'Invalid Authorization token' }, 401);

  const schedule = await getSchedule(env);
  const today = new Date();
  if (!shouldRunOnDate(schedule, today)) {
    // Not a failure — the cron worker fires twice a week and we filter
    // server-side. Returning 200 keeps GitHub Actions green.
    return json({
      success: true,
      skipped: true,
      reason: `schedule.mode='${schedule.mode}' — no run scheduled for today (UTC weekday ${today.getUTCDay()}).`,
      schedule_mode: schedule.mode,
      active_days: schedule.active_days,
      utc_now: today.toISOString(),
    });
  }

  const runId = `gptbot-schedule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // No topic overrides on a scheduled run: the generator picks the default
  // topic itself.
  const result = await startSeoAutopilotJobDirect({
    env,
    source: 'schedule',
    requestedBy: 'system:schedule',
    rawBody: JSON.stringify({ source: 'schedule', triggered_at: new Date().toISOString() }),
    requestId: runId,
    blockOnOverlap: true,
  });

  if (!result.ok) {
    // Overlap blocked is NOT an outright failure — return 200 so cron
    // logs don't go red for "already running".
    if (result.reason === 'overlap_blocked') {
      return json({
        success: true,
        skipped: true,
        reason: result.message,
        conflicting_job_id: result.conflicting_job_id,
        schedule_mode: schedule.mode,
      });
    }
    return json({ error: result.message, reason: result.reason }, result.http);
  }

  // The launcher awaits the run, so the cron caller gets the final state
  // (completed | failed) in the same HTTP response.
  const job = result.job;
  const isSuccess = job.status === 'completed' && !!job.draft_id;
  return json(
    {
      success: isSuccess,
      accepted: true,
      job_id: result.jobId,
      run_id: runId,
      status: job.status,
      status_url: `/api/seo-autopilot/jobs/${result.jobId}`,
      source: 'schedule',
      schedule_mode: schedule.mode,
      draft_id: job.draft_id,
      bundle_id: job.bundle_id,
      admin_url: job.admin_url,
      validation_status: job.validation_status,
      validation_passed: job.validation_passed,
      validation_issue_count: job.validation_issue_count,
      ingestion_success: job.ingestion_success,
      deduplicated: job.deduplicated,
      duration_ms: job.duration_ms,
      error_code: job.error_code,
      error_message: job.error_message,
      manual_approval_required: true,
      ready_for_publish: false,
    },
    200,
  );
};

export const onRequestGet: PagesFunction<Env> = async () =>
  json({ error: 'Method Not Allowed' }, 405);

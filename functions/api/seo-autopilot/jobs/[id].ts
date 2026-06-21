// GET /api/seo-autopilot/jobs/[id]
//
// Returns the current state of a bridge job. Public endpoint: the job_id
// itself acts as a capability token (cryptographically random, only known
// to Runable + GPTBot). Never exposes the Runable secret or n8n raw body.

import type { Env } from '../../../_types';
import { getJob } from '../../../lib/seo-autopilot/jobs';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing job id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Bridge unavailable (storage not configured).' }, 503);
  const job = await getJob(env, id);
  if (!job) return json({ error: 'Job not found' }, 404);

  // Build a Runable-friendly response shape that mirrors the success
  // payload spec when the job is complete.
  const isTerminal = job.status === 'completed' || job.status === 'failed';
  const body: Record<string, unknown> = {
    success: job.status === 'completed',
    job_id: job.id,
    request_id: job.request_id,
    status: job.status,
    is_terminal: isTerminal,
    n8n_status: job.n8n_status,
    n8n_execution_id: job.n8n_execution_id,
    generation_status: job.generation_status,
    validation_status: job.validation_status,
    validation_passed: job.validation_passed,
    validation_issue_count: job.validation_issue_count,
    ingestion_success: job.ingestion_success,
    deduplicated: job.deduplicated,
    draft_id: job.draft_id,
    bundle_id: job.bundle_id,
    admin_url: job.admin_url,
    manual_approval_required: true,
    ready_for_publish: false,
    error_code: job.error_code,
    error_message: job.error_message,
    error_detail: job.error_detail,
    created_at: job.created_at,
    updated_at: job.updated_at,
    finished_at: job.finished_at,
    duration_ms: job.duration_ms,
  };
  if (job.status === 'completed' && job.draft_id) {
    body.next_action = 'Open admin_url to review the draft. Use the Blog Editor to publish manually.';
  } else if (job.status === 'failed') {
    body.next_action = 'Inspect error_code/error_message. Re-trigger Runable after fixing root cause.';
  } else {
    body.next_action = 'Poll this status_url in ~30 s; expected completion within 120 s.';
  }
  return json(body);
};

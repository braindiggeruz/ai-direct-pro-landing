import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import {
  getAutomationJobForTenant,
  AutomationValidationError,
} from '../../../platform/automation';
import {
  enqueueSeoDraftGeneration,
  isFirstPartyAutomationEnabled,
  SEO_AUTOMATION_TENANT,
} from '../../../lib/seo-autopilot/automation';

const BODY_LIMIT = 4_096;
const INPUT_KEYS = ['idempotency_key', 'job_type', 'request_ref'];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!isFirstPartyAutomationEnabled(env)) return json({ error: 'Not Found' }, 404);
  if (!env.GPTBOT_DRAFTS_DB || !env.AUTOMATION_QUEUE) {
    return json({ error: 'Automation runtime not configured.' }, 503);
  }
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(length) && length > BODY_LIMIT) {
    return json({ error: 'Payload too large.' }, 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > BODY_LIMIT) {
    return json({ error: 'Payload too large.' }, 413);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (
    !body
    || typeof body !== 'object'
    || Array.isArray(body)
    || Object.keys(body).sort().some((key, index) => key !== INPUT_KEYS[index])
    || Object.keys(body).length !== INPUT_KEYS.length
    || body.job_type !== 'seo_draft_generation'
    || typeof body.idempotency_key !== 'string'
    || typeof body.request_ref !== 'string'
  ) {
    return json({ error: 'Invalid automation request.' }, 400);
  }
  try {
    const result = await enqueueSeoDraftGeneration(env, {
      idempotencyKey: body.idempotency_key,
      requestRef: body.request_ref,
    });
    return json({
      accepted: true,
      duplicate: result.outcome === 'duplicate',
      job_id: result.job.jobId,
      status: result.job.status,
      status_url: `/api/admin/automation/jobs?job_id=${encodeURIComponent(result.job.jobId)}`,
      manual_approval_required: true,
      auto_publish: false,
    }, 202);
  } catch (error) {
    if (error instanceof AutomationValidationError) {
      return json({ error: 'Invalid automation request.' }, 400);
    }
    return json({ error: 'Automation enqueue failed.' }, 503);
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!isFirstPartyAutomationEnabled(env)) return json({ error: 'Not Found' }, 404);
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Not Found' }, 404);
  const jobId = new URL(request.url).searchParams.get('job_id') ?? '';
  const job = await getAutomationJobForTenant(
    env.GPTBOT_DRAFTS_DB,
    SEO_AUTOMATION_TENANT,
    jobId,
  );
  if (!job) return json({ error: 'Not Found' }, 404);
  return json({
    job_id: job.jobId,
    job_type: job.jobType,
    status: job.status,
    attempt_count: job.attemptCount,
    result_ref: job.resultRef,
    last_error_code: job.lastErrorCode,
    manual_approval_required: true,
    auto_publish: false,
  });
};

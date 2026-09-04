import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { jsonResponse } from '../../../lib/api-errors';

import {
  replayAutomationDeadLetter,
  type AutomationQueueSender,
} from '../../../platform/automation';
import {
  isFirstPartyAutomationEnabled,
  SEO_AUTOMATION_TENANT,
} from '../../../lib/seo-autopilot/automation';

const BODY_LIMIT = 2_048;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!isFirstPartyAutomationEnabled(env)) return jsonResponse({ error: 'Not Found' }, 404);
  if (!env.GPTBOT_DRAFTS_DB || !env.AUTOMATION_QUEUE) {
    return jsonResponse({ error: 'Not Found' }, 404);
  }
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(length) && length > BODY_LIMIT) {
    return jsonResponse({ error: 'Payload too large.' }, 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > BODY_LIMIT) {
    return jsonResponse({ error: 'Payload too large.' }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }
  if (
    !body
    || typeof body !== 'object'
    || Array.isArray(body)
    || Object.keys(body).length !== 1
    || typeof (body as { job_id?: unknown }).job_id !== 'string'
  ) {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }
  const job = await replayAutomationDeadLetter(
    env.GPTBOT_DRAFTS_DB,
    env.AUTOMATION_QUEUE as unknown as AutomationQueueSender,
    {
      tenantKey: SEO_AUTOMATION_TENANT,
      jobId: (body as { job_id: string }).job_id,
      actorRole: 'admin',
    },
  );
  if (!job) return jsonResponse({ error: 'Not Found' }, 404);
  return jsonResponse({
    accepted: true,
    job_id: job.jobId,
    status: job.status,
  }, 202);
};

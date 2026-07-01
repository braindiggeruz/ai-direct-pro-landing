// POST /api/seo-autopilot/run  — DEPRECATED public Runable-compatible bridge.
//
// Kept for backward compatibility only. Disabled by default via
// EXTERNAL_AUTOPILOT_TRIGGER_ENABLED. The supported way to launch the SEO
// Autopilot is from the GPTBot Control Center
// (POST /api/admin/seo-autopilot/run with admin JWT) or the scheduled cron.
//
// When the flag is "false" (default), this endpoint returns 404 so that
// nothing externally callable trigger n8n behind the owner's back.

import type { Env } from '../../_types';
import { startSeoAutopilotJob } from '../../lib/seo-autopilot/launch';
import { jsonResponse } from '../../lib/api-errors';

const MAX_BODY_BYTES = 256 * 1024;
const RUNABLE_HEADER = 'x-runable-secret';
const REQUEST_ID_HEADER = 'x-request-id';

function isEnabled(env: Env): boolean {
  return (env.EXTERNAL_AUTOPILOT_TRIGGER_ENABLED || 'false').toLowerCase() === 'true';
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': `Content-Type, ${RUNABLE_HEADER}, ${REQUEST_ID_HEADER}`,
    },
  });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!isEnabled(env)) return jsonResponse({ error: 'Not Found' }, 404);
  return jsonResponse({ error: 'Method Not Allowed', detail: 'POST application/json with x-runable-secret' }, 405);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  if (!isEnabled(env)) {
    // Safe 404 — the external Runable trigger is disabled. The Control
    // Center is the supported entry point.
    return jsonResponse({ error: 'Not Found' }, 404);
  }
  if (!env.GPTBOT_DRAFTS_DB) {
    return jsonResponse({ error: 'Bridge unavailable (storage not configured).' }, 503);
  }

  const runableSecret = request.headers.get(RUNABLE_HEADER) || request.headers.get(RUNABLE_HEADER.toUpperCase());
  if (!runableSecret) return jsonResponse({ error: `Missing ${RUNABLE_HEADER} header` }, 401);

  const ctype = request.headers.get('Content-Type') || '';
  if (!ctype.toLowerCase().includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 415);
  }

  const len = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    return jsonResponse({ error: `Payload too large (>${MAX_BODY_BYTES} bytes)` }, 413);
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return jsonResponse({ error: `Payload too large (>${MAX_BODY_BYTES} bytes)` }, 413);
  if (rawBody.trim() === '') return jsonResponse({ error: 'Empty body' }, 400);

  const requestId =
    request.headers.get(REQUEST_ID_HEADER) ||
    request.headers.get(REQUEST_ID_HEADER.toUpperCase()) ||
    `external-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const result = await startSeoAutopilotJob({
    env,
    waitUntil,
    source: 'external',
    requestedBy: 'system:external',
    rawBody,
    runableSecret,
    requestId,
    blockOnOverlap: false,
  });

  if (!result.ok) {
    return jsonResponse({ error: result.message, reason: result.reason }, result.http);
  }

  return jsonResponse(
    {
      success: true,
      accepted: true,
      job_id: result.jobId,
      request_id: requestId,
      status: result.status,
      status_url: `/api/seo-autopilot/jobs/${result.jobId}`,
      polling: { retry_after_seconds: 30, max_polls: 30, expected_completion_seconds: 120 },
      deprecated: true,
      replacement: 'POST /api/admin/seo-autopilot/run (admin JWT) or scheduled cron',
      manual_approval_required: true,
      ready_for_publish: false,
    },
    202,
  );
};

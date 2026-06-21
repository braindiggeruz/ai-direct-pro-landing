// POST /api/seo-autopilot/run  — Runable → bridge → n8n → AI Draft Inbox.
//
// Behaviour:
//   1. Reject if `x-runable-secret` header is missing.
//   2. Create a job row (status=pending) in seo_autopilot_jobs and return
//      HTTP 202 with the job_id + status_url immediately.
//   3. In the background via ctx.waitUntil:
//        - Forward the body to the n8n production webhook with the
//          forwarded `x-runable-secret` header (value never logged).
//        - On n8n 200: parse + validate + normalise + ingest via the
//          shared ingestRawBundle service. Ingestion is idempotent on
//          bundle_id derived from n8n's execution_id (fallback: job_id).
//        - Persist the outcome (draft_id, admin_url, errors) to the job row.
//
// Why async: the SEO Autopilot pipeline (Serper + 4 OpenRouter calls)
// regularly takes 30–120 s; that exceeds the synchronous Pages Functions
// 30 s response budget. waitUntil lets the worker keep running for several
// minutes after the HTTP response is sent — the canonical Cloudflare
// pattern for this use case.
//
// Hard rules (never auto-publishes / commits / IndexNow / overwrites):
//   - bundle is forced to status='pending_review'.
//   - All downstream side effects (GitHub, IndexNow, deploy) are gated by
//     manual review in the existing admin UI.
//   - The Runable secret is forwarded byte-for-byte and NEVER stored,
//     logged, or echoed back.

import type { Env } from '../../_types';
import { ingestRawBundle } from '../../lib/ai-drafts/ingest';
import { normaliseN8nResponse } from '../../lib/seo-autopilot/normalise';
import { createJob, newJobId, updateJob } from '../../lib/seo-autopilot/jobs';
import { appendAudit } from '../../lib/ai-drafts/store';

const N8N_PROD_WEBHOOK = 'https://braindigger.app.n8n.cloud/webhook/runable-seo-autopilot';
// Hard ceiling for the n8n call: well within waitUntil's 5-minute budget
// but short enough that a stuck workflow doesn't pin the worker forever.
const N8N_TIMEOUT_MS = 240_000;
const MAX_BODY_BYTES = 256 * 1024;
const RUNABLE_HEADER = 'x-runable-secret';
const REQUEST_ID_HEADER = 'x-request-id';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': `Content-Type, ${RUNABLE_HEADER}, ${REQUEST_ID_HEADER}`,
      'Access-Control-Max-Age': '86400',
    },
  });

export const onRequestGet: PagesFunction<Env> = async () =>
  json({ error: 'Method Not Allowed', detail: 'POST application/json with x-runable-secret' }, 405);

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  if (!env.GPTBOT_DRAFTS_DB) {
    return json({ error: 'Bridge unavailable (storage not configured).' }, 503);
  }

  // 1. Auth header presence — never validate the value, just enforce that
  //    Runable is at least claiming to be Runable. The actual secret check
  //    happens at n8n's Validate Safety Rules node.
  const runableSecret = request.headers.get(RUNABLE_HEADER) || request.headers.get(RUNABLE_HEADER.toUpperCase());
  if (!runableSecret) {
    return json({ error: `Missing ${RUNABLE_HEADER} header` }, 401);
  }

  // 2. Content-Type guard.
  const ctype = request.headers.get('Content-Type') || '';
  if (!ctype.toLowerCase().includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 415);
  }

  // 3. Body size guard.
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ error: `Payload too large (>${MAX_BODY_BYTES} bytes)` }, 413);
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: `Payload too large (>${MAX_BODY_BYTES} bytes)` }, 413);
  }
  // We don't strictly require the body to be JSON-valid here — n8n will
  // tell us — but reject obviously broken payloads up front.
  if (rawBody.trim() === '') {
    return json({ error: 'Empty body' }, 400);
  }

  // 4. Create the job row.
  const jobId = newJobId();
  const requestId =
    request.headers.get(REQUEST_ID_HEADER) ||
    request.headers.get(REQUEST_ID_HEADER.toUpperCase()) ||
    `runable-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await createJob(env, { id: jobId, request_id: requestId, n8n_url: N8N_PROD_WEBHOOK });
  } catch (e) {
    return json({ error: 'Failed to enqueue job', detail: (e as Error).message }, 500);
  }

  // 5. Background processing — do NOT await this; the worker stays alive
  //    via waitUntil until the promise resolves.
  waitUntil(processJob(env, jobId, rawBody, runableSecret));

  return json(
    {
      success: true,
      accepted: true,
      job_id: jobId,
      request_id: requestId,
      status: 'pending',
      status_url: `/api/seo-autopilot/jobs/${jobId}`,
      polling: {
        retry_after_seconds: 30,
        max_polls: 30,
        expected_completion_seconds: 120,
      },
      manual_approval_required: true,
      ready_for_publish: false,
      note: 'AI Draft Inbox bridge accepted the request. Poll status_url for the final draft_id.',
    },
    202,
  );
};

/**
 * Background worker — fetches n8n, validates the response, normalises
 * it into the gptbot.article-draft.v1 contract, runs the shared
 * ingestion pipeline, and persists the final job state.
 *
 * Safety: any thrown error is captured into the job row. The function
 * never throws to the runtime (which could lose state).
 */
async function processJob(env: Env, jobId: string, rawBody: string, runableSecret: string): Promise<void> {
  const startedAt = Date.now();
  try {
    await updateJob(env, jobId, { status: 'forwarding' });

    // Forward to n8n with the same Runable secret. Use AbortController so
    // we don't pin the worker on a stuck workflow.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('n8n_timeout'), N8N_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(N8N_PROD_WEBHOOK, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Pass-through ONLY this header. We deliberately do not echo any
          // arbitrary request headers — that would be an open relay.
          [RUNABLE_HEADER]: runableSecret,
        },
        body: rawBody,
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError';
      await failJob(env, jobId, startedAt, aborted ? 'n8n_timeout' : 'n8n_fetch_failed',
        aborted ? `n8n request exceeded ${N8N_TIMEOUT_MS / 1000}s` : `n8n fetch failed: ${(e as Error).message}`);
      return;
    } finally {
      clearTimeout(timer);
    }

    const n8nStatus = response.status;
    await updateJob(env, jobId, { n8n_status: n8nStatus });

    if (n8nStatus < 200 || n8nStatus >= 300) {
      // Capture a short safe excerpt of the body for diagnostics. Never
      // store more than 2 KB — n8n error responses often contain the
      // workflow definition which we don't want to persist.
      let detail: Record<string, unknown> | null = null;
      try {
        const txt = (await response.text()).slice(0, 2048);
        detail = { excerpt: txt };
      } catch { /* ignore */ }
      const code = n8nStatus === 401 || n8nStatus === 403 ? `n8n_http_${n8nStatus}` : `n8n_http_${n8nStatus}`;
      await failJob(env, jobId, startedAt, code, `n8n returned HTTP ${n8nStatus}`, detail);
      return;
    }

    // Parse n8n body.
    let n8nBody: unknown;
    let n8nRaw = '';
    try {
      n8nRaw = await response.text();
      n8nBody = JSON.parse(n8nRaw);
    } catch {
      await failJob(env, jobId, startedAt, 'n8n_invalid_json',
        'n8n responded with invalid JSON', { excerpt: n8nRaw.slice(0, 1024) });
      return;
    }

    // Normalise into the ingestion contract.
    await updateJob(env, jobId, { status: 'normalising' });
    const norm = normaliseN8nResponse(n8nBody, { jobId, requestId: null });
    if (!norm.ok) {
      await failJob(env, jobId, startedAt, 'n8n_response_invalid', norm.reason, norm.detail || null);
      return;
    }
    await updateJob(env, jobId, {
      n8n_execution_id: norm.meta.n8n_execution_id,
      generation_status: norm.meta.generation_status,
      validation_status: norm.meta.validation_status,
      validation_passed: norm.meta.validation_passed,
      validation_issue_count: norm.meta.validation_issue_count,
    });

    // Persist via the shared ingestion pipeline (validator + idempotent insert).
    await updateJob(env, jobId, { status: 'ingesting' });
    const ingest = await ingestRawBundle(env, norm.bundle);
    if (!ingest.ok) {
      await failJob(env, jobId, startedAt, 'ingest_validation_failed', ingest.body.error, {
        issues: ingest.body.issues || null,
      });
      return;
    }

    // Append an audit entry on the draft so the inbox shows the bridge
    // execution chain alongside the original 'created' event.
    try {
      await appendAudit(env, ingest.record.id, 'bridge_ingest', 'system:n8n-seo-autopilot-bridge', {
        job_id: jobId,
        n8n_execution_id: norm.meta.n8n_execution_id,
        n8n_status: n8nStatus,
        deduplicated: ingest.response.deduplicated,
      });
    } catch { /* audit is best-effort */ }

    const finishedAt = Date.now();
    await updateJob(env, jobId, {
      status: 'completed',
      draft_id: ingest.record.id,
      bundle_id: ingest.record.bundle_id,
      admin_url: `/admin-tools/ai-drafts/${ingest.record.id}`,
      ingestion_success: true,
      deduplicated: ingest.response.deduplicated,
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
    });
  } catch (e) {
    await failJob(env, jobId, startedAt, 'bridge_internal_error', (e as Error).message);
  }
}

async function failJob(
  env: Env,
  jobId: string,
  startedAt: number,
  code: string,
  message: string,
  detail: Record<string, unknown> | null = null,
): Promise<void> {
  const finishedAt = Date.now();
  try {
    await updateJob(env, jobId, {
      status: 'failed',
      error_code: code,
      error_message: message.slice(0, 1000),
      error_detail: detail,
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
    });
  } catch {
    // If we can't even update the job row, there's nothing more we can do —
    // the worker will exit and the row stays in its last persisted state.
  }
}

// Background worker for SEO Autopilot bridge jobs.
//
// Extracted from /api/seo-autopilot/run so the same code path is reused by
// the Control Center admin endpoint, the scheduled cron endpoint, and the
// legacy public bridge.

import type { Env } from '../../_types';
import { ingestRawBundle } from '../ai-drafts/ingest';
import { normaliseN8nResponse } from './normalise';
import { appendAudit } from '../ai-drafts/store';
import { updateJob } from './jobs';

const N8N_TIMEOUT_MS = 240_000;
const RUNABLE_HEADER = 'x-runable-secret';

/**
 * Background processor for a single autopilot job. NEVER throws to the
 * runtime — all failures are captured into the job row so polling clients
 * can see them.
 */
export async function processN8nResponseInBackground(
  env: Env,
  jobId: string,
  rawBody: string,
  webhookSecret: string,
): Promise<void> {
  const startedAt = Date.now();
  try {
    await updateJob(env, jobId, { status: 'forwarding' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('n8n_timeout'), N8N_TIMEOUT_MS);
    let response: Response;
    try {
      const webhookUrl = env.N8N_WEBHOOK_URL || 'https://braindigger.app.n8n.cloud/webhook/runable-seo-autopilot';
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [RUNABLE_HEADER]: webhookSecret,
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
      let detail: Record<string, unknown> | null = null;
      try {
        const txt = (await response.text()).slice(0, 2048);
        detail = { excerpt: txt };
      } catch { /* ignore */ }
      await failJob(env, jobId, startedAt, `n8n_http_${n8nStatus}`,
        `n8n returned HTTP ${n8nStatus}`, detail);
      return;
    }

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

    await updateJob(env, jobId, { status: 'normalising' });
    const norm = normaliseN8nResponse(n8nBody, { jobId, requestId: null });
    if (!norm.ok) {
      await failJob(env, jobId, startedAt, 'n8n_response_invalid', norm.reason, {
        ...(norm.detail || {}),
        n8n_excerpt: n8nRaw.slice(0, 4096),
      });
      return;
    }
    await updateJob(env, jobId, {
      n8n_execution_id: norm.meta.n8n_execution_id,
      generation_status: norm.meta.generation_status,
      validation_status: norm.meta.validation_status,
      validation_passed: norm.meta.validation_passed,
      validation_issue_count: norm.meta.validation_issue_count,
    });

    await updateJob(env, jobId, { status: 'ingesting' });
    const ingest = await ingestRawBundle(env, norm.bundle);
    if (!ingest.ok) {
      await failJob(env, jobId, startedAt, 'ingest_validation_failed', ingest.body.error, {
        issues: ingest.body.issues || null,
        n8n_excerpt: n8nRaw.slice(0, 6144),
      });
      return;
    }

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
    // Last-ditch — if we can't even update D1, the row stays in its prior
    // state. waitUntil will exit cleanly.
  }
}

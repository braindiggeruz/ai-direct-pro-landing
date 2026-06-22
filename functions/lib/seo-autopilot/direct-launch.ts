// Direct-AI replacement for `startSeoAutopilotJob`.
//
// Same StartJobInput / StartJobResult contract so every caller (manual,
// scheduled, single-topic) keeps its existing flow. Internally we:
//   1. Insert a `seo_autopilot_jobs` row (same table — bridge dashboard
//      and stale watchdog keep working).
//   2. Call `generateAndIngestDirectly` (Workers AI → AI Draft Inbox).
//   3. Update the job row with the final state (completed | failed).
//
// No n8n call. No bridge worker. Lifecycle is fully contained in the
// active request — typical runtime is 20–60 s.

import type { Env } from '../../_types';
import {
  createJob,
  getJob,
  markStaleJobsAsFailed,
  newJobId,
  updateJob,
} from './jobs';
import type { AutopilotJob } from './jobs';
import {
  generateAndIngestDirectly,
  type DirectGenerationTopic,
} from './direct-generator';

// Re-export so callers don't have to import from two places.
export type { StartJobResult, JobSource } from './launch';

import type { StartJobInput, StartJobResult } from './launch';
export type { StartJobInput } from './launch';

const OVERLAP_WINDOW_MS = 5 * 60 * 1000;
const SYNC_STALE_THRESHOLD_MS = 6 * 60 * 1000;

/**
 * Drop-in direct-AI replacement for startSeoAutopilotJob. Returns the
 * same shape (`StartJobResult`) so existing endpoints route through it
 * without API changes.
 *
 * `awaitCompletion: false` is intentionally NOT supported here. The
 * direct pipeline is sync-only — it's fast enough (20–60 s) that holding
 * the HTTP request open is the right primitive. Callers that pass
 * `awaitCompletion: false` will still get a sync awaited result.
 */
export async function startSeoAutopilotJobDirect(input: StartJobInput): Promise<StartJobResult> {
  const { env, source } = input;
  if (!env.GPTBOT_DRAFTS_DB) {
    return {
      ok: false,
      reason: 'storage_missing',
      http: 503,
      message: 'Draft storage not configured. Set the GPTBOT_DRAFTS_DB D1 binding in Cloudflare Pages.',
    };
  }

  // Best-effort stale sweep so the overlap check below isn't confused by
  // half-dead rows from the legacy bridge.
  try { await markStaleJobsAsFailed(env, SYNC_STALE_THRESHOLD_MS); } catch { /* best-effort */ }

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
  const runId =
    input.requestId ||
    `${source}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // The dashboard still reads `n8n_url` — keep a sentinel value so the
  // UI shows where the work is happening.
  const sentinelUrl = 'cloudflare://workers-ai/seo-autopilot-direct';

  await createJob(env, { id: jobId, request_id: runId, n8n_url: sentinelUrl });
  await env.GPTBOT_DRAFTS_DB
    .prepare('UPDATE seo_autopilot_jobs SET source = ?, requested_by = ?, updated_at = ? WHERE id = ?')
    .bind(source, input.requestedBy, new Date().toISOString(), jobId)
    .run();
  await updateJob(env, jobId, { status: 'forwarding' });

  // Parse rawBody (caller may pass overrides as JSON). Build topic.
  const topic = decodeTopicFromRawBody(input.rawBody);

  // ── Direct AI generation + ingest in a single sync step.
  await updateJob(env, jobId, { status: 'normalising' });
  const result = await generateAndIngestDirectly(env, topic, {
    requestedBy: input.requestedBy,
    source,
    runId,
  });

  if (!result.ok) {
    const finishedAt = new Date().toISOString();
    await updateJob(env, jobId, {
      status: 'failed',
      // The dashboard surfaces n8n_status as the HTTP code; we keep it
      // null since no HTTP call happened. error_code carries the
      // structured reason.
      n8n_status: null,
      generation_status: result.generation_status || 'failed',
      validation_status: result.validation_status || 'failed',
      validation_passed: result.validation_passed ?? false,
      validation_issue_count: result.validation_issue_count ?? 0,
      error_code: result.error_code || 'ai_direct_failed',
      error_message: (result.error_message || 'Direct AI generation failed').slice(0, 1000),
      error_detail: { ...(result.error_detail || {}), model: result.model, runtime: 'gemini-flash-via-emergent-proxy' },
      finished_at: finishedAt,
      duration_ms: result.duration_ms ?? null,
    });
    const job = await getJob(env, jobId);
    return { ok: true, jobId, status: job?.status ?? 'failed', awaited: true, job: job || fallbackJob(jobId, runId, sentinelUrl, 'failed', result) };
  }

  await updateJob(env, jobId, { status: 'ingesting' });
  const finishedAt = new Date().toISOString();
  await updateJob(env, jobId, {
    status: 'completed',
    n8n_status: 200,
    generation_status: 'completed',
    validation_status: 'passed',
    validation_passed: true,
    validation_issue_count: 0,
    draft_id: result.draft_id || null,
    bundle_id: result.bundle_id || null,
    admin_url: result.admin_url || null,
    ingestion_success: true,
    deduplicated: !!result.deduplicated,
    error_code: null,
    error_message: null,
    error_detail: result.error_detail || null,
    finished_at: finishedAt,
    duration_ms: result.duration_ms ?? null,
  });
  const job = await getJob(env, jobId);
  return { ok: true, jobId, status: job?.status ?? 'completed', awaited: true, job: job || fallbackJob(jobId, runId, sentinelUrl, 'completed', result) };
}

function fallbackJob(
  jobId: string,
  requestId: string,
  url: string,
  status: AutopilotJob['status'],
  result: { error_code?: string; error_message?: string; draft_id?: string; bundle_id?: string; admin_url?: string; duration_ms?: number },
): AutopilotJob {
  const now = new Date().toISOString();
  return {
    id: jobId,
    request_id: requestId,
    status,
    n8n_url: url,
    n8n_status: status === 'completed' ? 200 : null,
    n8n_execution_id: null,
    generation_status: status === 'completed' ? 'completed' : 'failed',
    validation_status: status === 'completed' ? 'passed' : 'failed',
    validation_passed: status === 'completed',
    validation_issue_count: 0,
    draft_id: result.draft_id || null,
    bundle_id: result.bundle_id || null,
    admin_url: result.admin_url || null,
    ingestion_success: status === 'completed',
    deduplicated: false,
    error_code: result.error_code || null,
    error_message: result.error_message || null,
    error_detail: null,
    created_at: now,
    updated_at: now,
    finished_at: now,
    duration_ms: result.duration_ms ?? null,
  };
}

/**
 * Decode the raw request body (legacy: { task_type, site_url, … }; new:
 * topic-plan overrides) into a normalised topic descriptor.
 */
function decodeTopicFromRawBody(raw: string): DirectGenerationTopic {
  if (!raw || typeof raw !== 'string') return {};
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};

  const locale = parsed.locale === 'ru' || parsed.locale === 'uz' ? parsed.locale : undefined;
  const target_locales = Array.isArray(parsed.target_locales)
    ? (parsed.target_locales as unknown[]).filter((l): l is 'ru' | 'uz' => l === 'ru' || l === 'uz')
    : undefined;

  return {
    planned_title: stringOrUndefined(parsed.planned_title ?? parsed.topic_hint ?? parsed.title ?? parsed.topic),
    primary_keyword: stringOrUndefined(parsed.primary_keyword ?? parsed.target_keyword ?? parsed.keyword),
    locale,
    target_locales,
    target_money_page: stringOrNull(parsed.target_money_page ?? parsed.money_page),
    cluster: stringOrNull(parsed.cluster ?? parsed.cluster_key),
    funnel_stage: stringOrNull(parsed.funnel_stage),
    audience: stringOrNull(parsed.audience),
    industry: stringOrNull(parsed.industry),
    channel: stringOrNull(parsed.channel),
    content_type: stringOrNull(parsed.content_type),
    modifier: stringOrNull(parsed.modifier),
    intent_key: stringOrNull(parsed.intent_key),
    plan_id: stringOrNull(parsed.plan_id),
    plan_item_id: stringOrNull(parsed.plan_item_id),
    notes: stringOrUndefined(parsed.notes),
  };
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function stringOrNull(v: unknown): string | null {
  const s = stringOrUndefined(v);
  return s ?? null;
}

/** True when the SEO Autopilot is configured to use direct AI. */
export function isDirectAiEnabled(env: Env): boolean {
  const flag = (env.SEO_AUTOPILOT_USE_DIRECT_AI || 'true').toLowerCase();
  return flag !== 'false' && flag !== '0' && flag !== 'no';
}

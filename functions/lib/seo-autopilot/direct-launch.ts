// The single SEO Autopilot launcher.
//
//   1. Insert a `seo_autopilot_jobs` row (the Control Center dashboard and
//      the stale-job watchdog read this table).
//   2. Call `generateAndIngestDirectly` (LLM router → AI Draft Inbox).
//   3. Update the job row with the final state (completed | failed).
//
// There is no second launcher. The n8n webhook bridge, its response
// normaliser and the `SEO_AUTOPILOT_USE_DIRECT_AI` selector were removed in
// R0.4 when n8n was retired, so this file owns the launch contract that used
// to live in the deleted `launch.ts`.
//
// Lifecycle is fully contained in the active request — typical runtime is
// 20–60 s.

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

export type JobSource = 'admin' | 'schedule';

export interface StartJobInput {
  env: Env;
  source: JobSource;
  /** e.g. admin email, "system:schedule". */
  requestedBy: string;
  /** JSON topic overrides supplied by the caller. */
  rawBody: string;
  requestId?: string | null;
  /**
   * When true (default for source='schedule'), refuses to launch if a
   * non-terminal job exists in the last OVERLAP_WINDOW_MS. Manual runs
   * default to false: the operator deliberately clicked the button.
   */
  blockOnOverlap?: boolean;
}

export type StartJobResult =
  | { ok: true; jobId: string; status: AutopilotJob['status']; awaited: true; job: AutopilotJob }
  | { ok: false; reason: 'storage_missing'; http: 503; message: string }
  | { ok: false; reason: 'overlap_blocked'; http: 409; message: string; conflicting_job_id: string };

const OVERLAP_WINDOW_MS = 5 * 60 * 1000;
const SYNC_STALE_THRESHOLD_MS = 6 * 60 * 1000;

/**
 * Launch one SEO Autopilot generation run and await it.
 *
 * The pipeline is sync-only: it is fast enough (20–60 s) that holding the
 * HTTP request open is the right primitive, so there is no fire-and-forget
 * mode and no polling contract to keep alive.
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
  // half-dead rows left behind by an aborted request.
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
  // UI shows where the work is happening. Multi-provider router selects
  // the actual upstream per call; the per-job llm_provider/llm_model
  // columns carry the truth.
  // The `n8n_url` column predates the retirement and is now a plain
  // "where did this run" label. Migrating the column name would break the
  // Control Center's read of historical rows, so the name stays and the
  // value records the first-party runtime.
  const sentinelUrl = 'cloudflare://llm-router/seo-autopilot-direct';

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
      error_detail: { ...(result.error_detail || {}), model: result.model, runtime: 'multi-provider-llm-router' },
      finished_at: finishedAt,
      duration_ms: result.duration_ms ?? null,
      llm_provider: result.llm_provider || null,
      llm_model: result.llm_model || null,
      llm_fallback_used: !!result.llm_fallback_used,
    });
    const job = await getJob(env, jobId);
    return { ok: true, jobId, status: job?.status ?? 'failed', awaited: true, job: job || fallbackJob(jobId, runId, sentinelUrl, 'failed', { ...result, llm_provider: result.llm_provider, llm_model: result.llm_model, llm_fallback_used: result.llm_fallback_used }) };
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
    llm_provider: result.llm_provider || null,
    llm_model: result.llm_model || null,
    llm_fallback_used: !!result.llm_fallback_used,
  });
  const job = await getJob(env, jobId);
  return { ok: true, jobId, status: job?.status ?? 'completed', awaited: true, job: job || fallbackJob(jobId, runId, sentinelUrl, 'completed', { ...result, llm_provider: result.llm_provider, llm_model: result.llm_model, llm_fallback_used: result.llm_fallback_used }) };
}

function fallbackJob(
  jobId: string,
  requestId: string,
  url: string,
  status: AutopilotJob['status'],
  result: { error_code?: string; error_message?: string; draft_id?: string; bundle_id?: string; admin_url?: string; duration_ms?: number; llm_provider?: string; llm_model?: string; llm_fallback_used?: boolean },
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
    llm_provider: result.llm_provider || null,
    llm_model: result.llm_model || null,
    llm_fallback_used: !!result.llm_fallback_used,
  };
}

/**
 * Decode the raw request body (older callers send { task_type, site_url, … };
 * current callers send topic-plan overrides) into a normalised topic
 * descriptor.
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

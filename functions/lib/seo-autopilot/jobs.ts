// D1 helpers for the SEO Autopilot bridge jobs table.
//
// One row per Runable → bridge → n8n call. State machine progresses through
// pending → forwarding → normalising → ingesting → completed | failed.

import type { Env } from '../../_types';

export type AutopilotJobStatus =
  | 'pending'
  | 'forwarding'
  | 'normalising'
  | 'ingesting'
  | 'completed'
  | 'failed';

export interface AutopilotJob {
  id: string;
  request_id: string | null;
  status: AutopilotJobStatus;
  n8n_url: string;
  n8n_status: number | null;
  n8n_execution_id: string | null;
  generation_status: string | null;
  validation_status: string | null;
  validation_passed: boolean | null;
  validation_issue_count: number | null;
  draft_id: string | null;
  bundle_id: string | null;
  admin_url: string | null;
  ingestion_success: boolean;
  deduplicated: boolean;
  error_code: string | null;
  error_message: string | null;
  error_detail: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  /** LLM provider that finally produced the bundle (or last-failed). */
  llm_provider: string | null;
  llm_model: string | null;
  llm_fallback_used: boolean;
}

export class JobsDbMissingError extends Error {
  constructor() { super('GPTBOT_DRAFTS_DB binding missing — autopilot jobs require D1.'); }
}

function requireDb(env: Env): D1Database {
  if (!env.GPTBOT_DRAFTS_DB) throw new JobsDbMissingError();
  return env.GPTBOT_DRAFTS_DB;
}

function nowIso(): string { return new Date().toISOString(); }

function randomHex(len = 22): string {
  const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return id.slice(0, len);
}

export function newJobId(): string { return `job_${randomHex()}`; }

function rowToJob(row: Record<string, unknown>): AutopilotJob {
  let detail: Record<string, unknown> | null = null;
  if (typeof row.error_detail_json === 'string' && row.error_detail_json) {
    try { detail = JSON.parse(row.error_detail_json as string) as Record<string, unknown>; } catch { detail = null; }
  }
  return {
    id: row.id as string,
    request_id: (row.request_id as string) || null,
    status: row.status as AutopilotJobStatus,
    n8n_url: row.n8n_url as string,
    n8n_status: row.n8n_status === null || row.n8n_status === undefined ? null : Number(row.n8n_status),
    n8n_execution_id: (row.n8n_execution_id as string) || null,
    generation_status: (row.generation_status as string) || null,
    validation_status: (row.validation_status as string) || null,
    validation_passed: row.validation_passed === null || row.validation_passed === undefined ? null : (row.validation_passed as number) === 1,
    validation_issue_count: row.validation_issue_count === null || row.validation_issue_count === undefined ? null : Number(row.validation_issue_count),
    draft_id: (row.draft_id as string) || null,
    bundle_id: (row.bundle_id as string) || null,
    admin_url: (row.admin_url as string) || null,
    ingestion_success: (row.ingestion_success as number) === 1,
    deduplicated: (row.deduplicated as number) === 1,
    error_code: (row.error_code as string) || null,
    error_message: (row.error_message as string) || null,
    error_detail: detail,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    finished_at: (row.finished_at as string) || null,
    duration_ms: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
    llm_provider: (row.llm_provider as string) || null,
    llm_model: (row.llm_model as string) || null,
    llm_fallback_used: (row.llm_fallback_used as number) === 1,
  };
}

export async function createJob(
  env: Env,
  data: { id: string; request_id: string | null; n8n_url: string },
): Promise<void> {
  const db = requireDb(env);
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO seo_autopilot_jobs
        (id, request_id, status, n8n_url, ingestion_success, deduplicated, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, 0, 0, ?, ?)`,
    )
    .bind(data.id, data.request_id, data.n8n_url, now, now)
    .run();
}

export async function updateJob(
  env: Env,
  id: string,
  patch: Partial<{
    status: AutopilotJobStatus;
    n8n_status: number | null;
    n8n_execution_id: string | null;
    generation_status: string | null;
    validation_status: string | null;
    validation_passed: boolean | null;
    validation_issue_count: number | null;
    draft_id: string | null;
    bundle_id: string | null;
    admin_url: string | null;
    ingestion_success: boolean;
    deduplicated: boolean;
    error_code: string | null;
    error_message: string | null;
    error_detail: Record<string, unknown> | null;
    finished_at: string | null;
    duration_ms: number | null;
    llm_provider: string | null;
    llm_model: string | null;
    llm_fallback_used: boolean;
  }>,
): Promise<void> {
  const db = requireDb(env);
  const fields: string[] = [];
  const args: unknown[] = [];
  function set<K extends keyof typeof patch>(key: K, col: string, transform?: (v: typeof patch[K]) => unknown): void {
    if (patch[key] === undefined) return;
    fields.push(`${col} = ?`);
    args.push(transform ? transform(patch[key]) : patch[key]);
  }
  set('status', 'status');
  set('n8n_status', 'n8n_status');
  set('n8n_execution_id', 'n8n_execution_id');
  set('generation_status', 'generation_status');
  set('validation_status', 'validation_status');
  set('validation_passed', 'validation_passed', (v) => (v === null || v === undefined ? null : v ? 1 : 0));
  set('validation_issue_count', 'validation_issue_count');
  set('draft_id', 'draft_id');
  set('bundle_id', 'bundle_id');
  set('admin_url', 'admin_url');
  set('ingestion_success', 'ingestion_success', (v) => (v ? 1 : 0));
  set('deduplicated', 'deduplicated', (v) => (v ? 1 : 0));
  set('error_code', 'error_code');
  set('error_message', 'error_message');
  set('error_detail', 'error_detail_json', (v) => (v ? JSON.stringify(v) : null));
  set('finished_at', 'finished_at');
  set('duration_ms', 'duration_ms');
  set('llm_provider', 'llm_provider');
  set('llm_model', 'llm_model');
  set('llm_fallback_used', 'llm_fallback_used', (v) => (v ? 1 : 0));
  fields.push('updated_at = ?');
  args.push(nowIso());
  args.push(id);
  if (fields.length === 1) return; // only updated_at — no-op
  await db.prepare(`UPDATE seo_autopilot_jobs SET ${fields.join(', ')} WHERE id = ?`).bind(...args).run();
}

export async function getJob(env: Env, id: string): Promise<AutopilotJob | null> {
  const db = requireDb(env);
  const row = await db.prepare('SELECT * FROM seo_autopilot_jobs WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return row ? rowToJob(row) : null;
}

/**
 * Stale-recovery: mark every non-terminal job older than `maxAgeMs` as
 * `failed` with `error_code='bridge_lost'`. This unsticks jobs whose
 * background worker was terminated by the CF Pages Functions lifecycle
 * before the n8n call could return.
 *
 * Safe to call on every list/poll — it's a single UPDATE statement, only
 * touches rows that ARE stale, and is idempotent (a `failed` job is not
 * touched again).
 *
 * Returns the number of rows that were swept.
 */
export async function markStaleJobsAsFailed(env: Env, maxAgeMs = 6 * 60 * 1000): Promise<number> {
  const db = requireDb(env);
  const ageSeconds = Math.max(60, Math.floor(maxAgeMs / 1000));
  const now = nowIso();
  const r = await db
    .prepare(
      `UPDATE seo_autopilot_jobs
       SET status='failed',
           error_code = COALESCE(error_code, 'bridge_lost'),
           error_message = COALESCE(
             error_message,
             'Bridge worker terminated before n8n returned. Job auto-marked stale by the watchdog after ' || ? || 's. n8n execution may still have completed — check the n8n run history; future runs use synchronous await and will not hit this path.'
           ),
           finished_at = COALESCE(finished_at, ?),
           updated_at = ?
       WHERE status IN ('pending','forwarding','normalising','ingesting')
         AND datetime(created_at) < datetime('now','-' || ? || ' seconds')`,
    )
    .bind(ageSeconds, now, now, ageSeconds)
    .run();
  // D1 returns changes via meta; cast through the runtime shape.
  type WithMeta = { meta?: { changes?: number; rows_written?: number } };
  const meta = (r as WithMeta).meta;
  return meta?.changes ?? 0;
}

// LLM usage telemetry — append-only D1 ledger.
//
// One row per LlmCallResult, regardless of success. The admin UI surfaces
// aggregates (calls per provider/model/feature, average duration, error
// classes) from this table.
//
// NOT a prompt log: we deliberately do NOT store input/system/user content
// — only feature, provider, model, status, duration, token counts. This
// keeps quota cheap and avoids any chance of leaking customer data.

import type { Env } from '../../_types';
import type {
  LlmCallMetadata, LlmCallResult, LlmFeature, LlmErrorClass, LlmProviderId,
} from './types';

async function ensureTable(db: D1Database): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS llm_usage (
       id                  TEXT PRIMARY KEY,
       created_at_ms       INTEGER NOT NULL,
       feature             TEXT NOT NULL,
       provider            TEXT NOT NULL,
       model               TEXT NOT NULL,
       status              TEXT NOT NULL,
       error_class         TEXT,
       duration_ms         INTEGER NOT NULL,
       input_tokens        INTEGER,
       output_tokens       INTEGER,
       retry_count         INTEGER NOT NULL DEFAULT 0,
       fallback_used       INTEGER NOT NULL DEFAULT 0,
       idempotency_key     TEXT,
       attempts_json       TEXT
     )`.replace(/\s+/g, ' '),
  ).catch((e) => console.warn('[usage-store] ensureTable CREATE TABLE failed:', (e as Error).message));
  await db.exec('CREATE INDEX IF NOT EXISTS idx_llm_usage_created_at ON llm_usage(created_at_ms)').catch((e) => console.warn('[usage-store] ensureTable idx_created_at failed:', (e as Error).message));
  await db.exec('CREATE INDEX IF NOT EXISTS idx_llm_usage_feature ON llm_usage(feature)').catch((e) => console.warn('[usage-store] ensureTable idx_feature failed:', (e as Error).message));
  await db.exec('CREATE INDEX IF NOT EXISTS idx_llm_usage_provider ON llm_usage(provider)').catch((e) => console.warn('[usage-store] ensureTable idx_provider failed:', (e as Error).message));
}

function rowId(): string {
  const hex = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `llm_${hex.slice(0, 22)}`;
}

export async function recordUsage(
  env: Env,
  feature: LlmFeature,
  result: LlmCallResult,
  idempotencyKey?: string,
): Promise<void> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return; // best-effort: telemetry never blocks the call
  await ensureTable(db);
  const meta = result.meta;
  const status = result.ok ? 'ok' : 'error';
  const errorClass: LlmErrorClass | null = result.ok ? null : result.error_class;
  await db
    .prepare(
      `INSERT INTO llm_usage
         (id, created_at_ms, feature, provider, model, status, error_class,
          duration_ms, input_tokens, output_tokens, retry_count, fallback_used,
          idempotency_key, attempts_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      rowId(),
      Date.now(),
      feature,
      meta.provider,
      meta.model,
      status,
      errorClass,
      meta.duration_ms,
      meta.input_tokens ?? null,
      meta.output_tokens ?? null,
      meta.retry_count,
      meta.fallback_used ? 1 : 0,
      idempotencyKey || null,
      JSON.stringify(meta.attempts).slice(0, 4000),
    )
    .run()
    .catch((e) => console.warn('[usage-store] recordUsage insert failed:', (e as Error).message));
}

export interface UsageSummaryRow {
  provider: LlmProviderId;
  model: string;
  feature: LlmFeature;
  status: 'ok' | 'error';
  count: number;
  avg_duration_ms: number;
}

export async function readUsageSummary(env: Env, windowMs = 24 * 60 * 60_000): Promise<UsageSummaryRow[]> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return [];
  await ensureTable(db);
  const since = Date.now() - windowMs;
  const r = await db
    .prepare(
      `SELECT provider, model, feature, status,
              COUNT(*) AS count, AVG(duration_ms) AS avg_duration_ms
       FROM llm_usage
       WHERE created_at_ms > ?
       GROUP BY provider, model, feature, status
       ORDER BY count DESC`,
    )
    .bind(since)
    .all<Record<string, unknown>>();
  return (r.results || []).map((row) => ({
    provider: row.provider as LlmProviderId,
    model: row.model as string,
    feature: row.feature as LlmFeature,
    status: row.status as 'ok' | 'error',
    count: Number(row.count || 0),
    avg_duration_ms: Math.round(Number(row.avg_duration_ms || 0)),
  }));
}

/** Helper to inspect the last N calls — used by /api/admin/llm/usage. */
export async function readRecentUsage(env: Env, limit = 100): Promise<unknown[]> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return [];
  await ensureTable(db);
  const r = await db
    .prepare(
      `SELECT id, created_at_ms, feature, provider, model, status, error_class,
              duration_ms, input_tokens, output_tokens, retry_count, fallback_used,
              idempotency_key
       FROM llm_usage
       ORDER BY created_at_ms DESC
       LIMIT ?`,
    )
    .bind(Math.max(1, Math.min(500, limit)))
    .all<Record<string, unknown>>();
  return r.results || [];
}

// Re-export feature type for callers that import only this module.
export type { LlmFeature } from './types';

// Idempotency-cache helpers operating on the same DB. Keeps a tiny TTL'd
// snapshot of finished results so a re-clicked button or a fallback fan-out
// returns the cached body instead of spending a fresh upstream call.

async function ensureIdempotencyTable(db: D1Database): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS llm_idempotency (
       key             TEXT PRIMARY KEY,
       feature         TEXT NOT NULL,
       result_json     TEXT NOT NULL,
       created_at_ms   INTEGER NOT NULL,
       expires_at_ms   INTEGER NOT NULL
     )`.replace(/\s+/g, ' '),
  ).catch((e) => console.warn('[usage-store] ensureIdempotencyTable CREATE TABLE failed:', (e as Error).message));
  await db.exec('CREATE INDEX IF NOT EXISTS idx_llm_idempotency_expires ON llm_idempotency(expires_at_ms)').catch((e) => console.warn('[usage-store] ensureIdempotencyTable idx_expires failed:', (e as Error).message));
}

const IDEMPOTENCY_TTL_MS = 10 * 60_000; // 10 min

export async function readIdempotent(env: Env, key: string): Promise<unknown | null> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !key) return null;
  await ensureIdempotencyTable(db);
  const row = await db
    .prepare('SELECT result_json, expires_at_ms FROM llm_idempotency WHERE key = ?')
    .bind(key)
    .first<Record<string, unknown>>();
  if (!row) return null;
  if (Number(row.expires_at_ms || 0) < Date.now()) return null;
  try { return JSON.parse(row.result_json as string); } catch (e) {
    console.warn(`[usage-store] corrupt idempotency cache for key ${key}:`, (e as Error).message);
    return null;
  }
}

export async function writeIdempotent(env: Env, key: string, feature: LlmFeature, result: LlmCallResult): Promise<void> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !key) return;
  await ensureIdempotencyTable(db);
  const json = JSON.stringify(result);
  // Cap the cached body to avoid wasting D1 storage on giant bundles. If
  // the body exceeds 96 KB we still record the key (so duplicate calls
  // are rate-limited at the operator level) but skip the cached body.
  const safeJson = json.length > 96_000 ? JSON.stringify({ ok: result.ok, meta: result.meta, truncated_for_cache: true }) : json;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO llm_idempotency (key, feature, result_json, created_at_ms, expires_at_ms)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         result_json = excluded.result_json,
         expires_at_ms = excluded.expires_at_ms`,
    )
    .bind(key, feature, safeJson, now, now + IDEMPOTENCY_TTL_MS)
    .run()
    .catch((e) => console.warn(`[usage-store] writeIdempotent failed for key ${key}:`, (e as Error).message));
}

/** Cast for the small subset of LlmCallMetadata that lives in the row. */
export function summarisedMeta(meta: LlmCallMetadata): {
  provider: LlmProviderId; model: string; duration_ms: number; retry_count: number; fallback_used: boolean;
} {
  return {
    provider: meta.provider,
    model: meta.model,
    duration_ms: meta.duration_ms,
    retry_count: meta.retry_count,
    fallback_used: meta.fallback_used,
  };
}

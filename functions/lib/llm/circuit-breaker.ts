// Per-provider/model circuit breaker.
//
// Stateless across CF Pages Function invocations is fine — the breaker
// state lives in D1 (table llm_provider_health) so each invocation reads
// the current health on cold start. In-process memoisation keeps the read
// cheap for the duration of a single invocation.
//
// State machine:
//   closed       → calls pass through; failures accumulate in `failures_60s`
//   open         → calls short-circuit (router skips this candidate)
//   half_open    → after cooldown, one probe is allowed; success closes the
//                  breaker, failure re-opens it for another cooldown
//
// Trip rule: 3 consecutive transient failures (rate_limit, transient_5xx,
// timeout, network) within 60 s open the breaker for OPEN_FOR_MS.
//
// Reset rule: any successful call from anywhere in the codebase (not just
// the probe) flips the breaker back to closed and clears the counter.

import type { Env } from '../../_types';
import type { LlmProviderId, LlmErrorClass } from './types';

const OPEN_FOR_MS = 60_000;
const TRIP_THRESHOLD = 3;
const TRIP_WINDOW_MS = 60_000;

const TRANSIENT_CLASSES: LlmErrorClass[] = ['rate_limit', 'transient_5xx', 'timeout', 'network'];

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface BreakerStatus {
  provider: LlmProviderId;
  model: string;
  state: BreakerState;
  open_until_ms: number;
  failures_60s: number;
  last_error_class: LlmErrorClass | null;
  last_failure_at_ms: number | null;
  updated_at_ms: number;
}

function nowMs(): number { return Date.now(); }

function rowKey(p: LlmProviderId, m: string): string { return `${p}|${m}`; }

async function ensureTable(db: D1Database): Promise<void> {
  // Migration 0005 creates this; defensive ensure for first deploy.
  await db.exec(
    `CREATE TABLE IF NOT EXISTS llm_provider_health (
       key                 TEXT PRIMARY KEY,
       provider            TEXT NOT NULL,
       model               TEXT NOT NULL,
       state               TEXT NOT NULL,
       open_until_ms       INTEGER NOT NULL DEFAULT 0,
       failures_60s        INTEGER NOT NULL DEFAULT 0,
       last_error_class    TEXT,
       last_failure_at_ms  INTEGER,
       updated_at_ms       INTEGER NOT NULL
     )`.replace(/\s+/g, ' '),
  ).catch((e) => console.warn('[circuit-breaker] ensureTable failed:', (e as Error).message));
}

export async function readBreaker(env: Env, provider: LlmProviderId, model: string): Promise<BreakerStatus> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) {
    return { provider, model, state: 'closed', open_until_ms: 0, failures_60s: 0, last_error_class: null, last_failure_at_ms: null, updated_at_ms: nowMs() };
  }
  await ensureTable(db);
  const row = await db
    .prepare('SELECT * FROM llm_provider_health WHERE key = ?')
    .bind(rowKey(provider, model))
    .first<Record<string, unknown>>();
  if (!row) {
    return { provider, model, state: 'closed', open_until_ms: 0, failures_60s: 0, last_error_class: null, last_failure_at_ms: null, updated_at_ms: nowMs() };
  }
  const status: BreakerStatus = {
    provider,
    model,
    state: (row.state as BreakerState) ?? 'closed',
    open_until_ms: Number(row.open_until_ms || 0),
    failures_60s: Number(row.failures_60s || 0),
    last_error_class: (row.last_error_class as LlmErrorClass) || null,
    last_failure_at_ms: row.last_failure_at_ms === null ? null : Number(row.last_failure_at_ms || 0),
    updated_at_ms: Number(row.updated_at_ms || nowMs()),
  };
  // Auto-transition open → half_open after cooldown.
  if (status.state === 'open' && nowMs() >= status.open_until_ms) {
    status.state = 'half_open';
    await persist(db, status).catch((e) => console.warn(`[circuit-breaker] persist failed for ${provider}/${model}:`, (e as Error).message));
  }
  return status;
}

/** True when the breaker is currently blocking new calls. */
export function isOpen(status: BreakerStatus): boolean {
  return status.state === 'open' && nowMs() < status.open_until_ms;
}

export async function recordSuccess(env: Env, provider: LlmProviderId, model: string): Promise<void> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return;
  await ensureTable(db);
  const status: BreakerStatus = {
    provider, model,
    state: 'closed',
    open_until_ms: 0,
    failures_60s: 0,
    last_error_class: null,
    last_failure_at_ms: null,
    updated_at_ms: nowMs(),
  };
  await persist(db, status).catch((e) => console.warn(`[circuit-breaker] persist (success) failed for ${provider}/${model}:`, (e as Error).message));
}

export async function recordFailure(
  env: Env,
  provider: LlmProviderId,
  model: string,
  errorClass: LlmErrorClass,
): Promise<BreakerStatus> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) {
    return { provider, model, state: 'closed', open_until_ms: 0, failures_60s: 0, last_error_class: errorClass, last_failure_at_ms: nowMs(), updated_at_ms: nowMs() };
  }
  await ensureTable(db);
  // Read current first (single-row, single-key — D1's read after write is
  // strongly consistent within the same connection).
  const current = await readBreaker(env, provider, model);
  // Non-transient classes (auth/bad_request/safety_blocked/invalid_json/
  // truncated) don't count toward circuit breaker — they reflect our own
  // payload or the model's content policy, not provider health.
  if (!TRANSIENT_CLASSES.includes(errorClass)) {
    const status: BreakerStatus = {
      ...current,
      last_error_class: errorClass,
      last_failure_at_ms: nowMs(),
      updated_at_ms: nowMs(),
    };
    await persist(db, status).catch((e) => console.warn(`[circuit-breaker] persist (non-transient) failed for ${provider}/${model}:`, (e as Error).message));
    return status;
  }
  // Sliding-window count: if last failure was > TRIP_WINDOW_MS ago, reset.
  const fresh = current.last_failure_at_ms && nowMs() - current.last_failure_at_ms < TRIP_WINDOW_MS;
  const failures_60s = (fresh ? current.failures_60s : 0) + 1;
  const shouldTrip = failures_60s >= TRIP_THRESHOLD;
  const status: BreakerStatus = {
    provider, model,
    state: shouldTrip ? 'open' : 'closed',
    open_until_ms: shouldTrip ? nowMs() + OPEN_FOR_MS : 0,
    failures_60s,
    last_error_class: errorClass,
    last_failure_at_ms: nowMs(),
    updated_at_ms: nowMs(),
  };
  await persist(db, status).catch((e) => console.warn(`[circuit-breaker] persist (failure) failed for ${provider}/${model}:`, (e as Error).message));
  return status;
}

async function persist(db: D1Database, status: BreakerStatus): Promise<void> {
  await db
    .prepare(
      `INSERT INTO llm_provider_health
         (key, provider, model, state, open_until_ms, failures_60s, last_error_class, last_failure_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         state = excluded.state,
         open_until_ms = excluded.open_until_ms,
         failures_60s = excluded.failures_60s,
         last_error_class = excluded.last_error_class,
         last_failure_at_ms = excluded.last_failure_at_ms,
         updated_at_ms = excluded.updated_at_ms`,
    )
    .bind(
      rowKey(status.provider, status.model),
      status.provider,
      status.model,
      status.state,
      status.open_until_ms,
      status.failures_60s,
      status.last_error_class,
      status.last_failure_at_ms,
      status.updated_at_ms,
    )
    .run();
}

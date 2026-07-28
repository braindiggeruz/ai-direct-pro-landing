const AUTOMATION_DDL = [
  `CREATE TABLE IF NOT EXISTS automation_jobs (
    job_id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL CHECK (job_type IN ('seo_draft_generation')),
    tenant_key TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_ref TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN (
        'queued', 'leased', 'running', 'retry_wait', 'awaiting_review',
        'completed', 'dead_letter', 'cancelled'
      )),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
    available_at TEXT NOT NULL,
    lease_owner TEXT,
    lease_expires_at TEXT,
    enqueued_at TEXT,
    cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0, 1)),
    result_ref TEXT,
    last_error_code TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE (tenant_key, job_type, idempotency_key),
    CHECK (
      (lease_owner IS NULL AND lease_expires_at IS NULL)
      OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    )
  )`,
  `CREATE TABLE IF NOT EXISTS automation_job_events (
    event_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES automation_jobs(job_id) ON DELETE RESTRICT,
    tenant_key TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
      'created', 'enqueued', 'leased', 'started', 'retry_scheduled',
      'awaiting_review', 'completed', 'dead_lettered', 'cancelled',
      'dlq_replayed'
    )),
    error_code TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_automation_jobs_due
    ON automation_jobs (status, available_at, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_automation_jobs_tenant_status
    ON automation_jobs (tenant_key, status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_automation_jobs_lease
    ON automation_jobs (status, lease_expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_automation_events_job
    ON automation_job_events (tenant_key, job_id, created_at)`,
] as const;

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureAutomationSchema(db: D1Database): Promise<void> {
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      for (const statement of AUTOMATION_DDL) await db.prepare(statement).run();
    })().catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}

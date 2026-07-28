import { ensureAutomationSchema } from './schema';
import {
  AUTOMATION_TERMINAL_STATUSES,
  type AutomationEventType,
  type AutomationJob,
  type AutomationJobStatus,
  type CreateAutomationJobInput,
} from './types';
import {
  requireAutomationJobType,
  requireErrorCode,
  requireIdempotencyKey,
  requireLeaseOwner,
  requireMaxAttempts,
  requireRequestRef,
  requireResultRef,
  requireTenantKey,
} from './validation';

type D1WriteResult = { meta?: { changes?: number; rows_written?: number } };

function changes(result: unknown): number {
  const meta = (result as D1WriteResult).meta;
  return Number(meta?.changes ?? meta?.rows_written ?? 0);
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

function rowToJob(row: Record<string, unknown>): AutomationJob {
  return {
    jobId: String(row.job_id),
    jobType: requireAutomationJobType(row.job_type),
    tenantKey: String(row.tenant_key),
    idempotencyKey: String(row.idempotency_key),
    requestRef: String(row.request_ref),
    status: String(row.status) as AutomationJobStatus,
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    availableAt: String(row.available_at),
    leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : null,
    enqueuedAt: row.enqueued_at ? String(row.enqueued_at) : null,
    cancelRequested: Number(row.cancel_requested) === 1,
    resultRef: row.result_ref ? String(row.result_ref) : null,
    lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

async function appendEvent(
  db: D1Database,
  job: AutomationJob,
  eventType: AutomationEventType,
  now: string,
  errorCode: string | null = null,
): Promise<void> {
  await db.prepare(
    `INSERT INTO automation_job_events(
       event_id, job_id, tenant_key, event_type, error_code,
       attempt_count, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    randomId('aevt'),
    job.jobId,
    job.tenantKey,
    eventType,
    errorCode,
    job.attemptCount,
    now,
  ).run();
}

export async function getAutomationJobById(
  db: D1Database,
  jobId: string,
): Promise<AutomationJob | null> {
  await ensureAutomationSchema(db);
  const row = await db.prepare(
    'SELECT * FROM automation_jobs WHERE job_id = ?',
  ).bind(jobId).first<Record<string, unknown>>();
  return row ? rowToJob(row) : null;
}

export async function getAutomationJobForTenant(
  db: D1Database,
  tenantKey: string,
  jobId: string,
): Promise<AutomationJob | null> {
  await ensureAutomationSchema(db);
  const tenant = requireTenantKey(tenantKey);
  const row = await db.prepare(
    `SELECT * FROM automation_jobs
     WHERE tenant_key = ? AND job_id = ?`,
  ).bind(tenant, jobId).first<Record<string, unknown>>();
  return row ? rowToJob(row) : null;
}

export async function insertOrReuseAutomationJob(
  db: D1Database,
  input: CreateAutomationJobInput,
  now: string,
): Promise<{ outcome: 'created' | 'duplicate'; job: AutomationJob }> {
  await ensureAutomationSchema(db);
  const tenantKey = requireTenantKey(input.tenantKey);
  const jobType = requireAutomationJobType(input.jobType);
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const requestRef = requireRequestRef(input.requestRef);
  const maxAttempts = requireMaxAttempts(input.maxAttempts ?? 3);
  const jobId = randomId('ajob');
  const availableAt = input.availableAt ?? now;
  const result = await db.prepare(
    `INSERT OR IGNORE INTO automation_jobs(
       job_id, job_type, tenant_key, idempotency_key, request_ref,
       status, attempt_count, max_attempts, available_at, version,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, 1, ?, ?)`,
  ).bind(
    jobId,
    jobType,
    tenantKey,
    idempotencyKey,
    requestRef,
    maxAttempts,
    availableAt,
    now,
    now,
  ).run();
  const created = changes(result) > 0;
  const row = await db.prepare(
    `SELECT * FROM automation_jobs
     WHERE tenant_key = ? AND job_type = ? AND idempotency_key = ?`,
  ).bind(tenantKey, jobType, idempotencyKey).first<Record<string, unknown>>();
  if (!row) throw new Error('automation_job_persist_failed');
  const job = rowToJob(row);
  if (created) await appendEvent(db, job, 'created', now);
  return { outcome: created ? 'created' : 'duplicate', job };
}

export async function markAutomationJobEnqueued(
  db: D1Database,
  jobId: string,
  now: string,
): Promise<void> {
  await ensureAutomationSchema(db);
  await db.prepare(
    `UPDATE automation_jobs
     SET enqueued_at = ?, updated_at = ?, version = version + 1
     WHERE job_id = ? AND status IN ('queued', 'retry_wait')`,
  ).bind(now, now, jobId).run();
  const job = await getAutomationJobById(db, jobId);
  if (job) await appendEvent(db, job, 'enqueued', now);
}

export async function leaseAutomationJob(
  db: D1Database,
  input: {
    jobId: string;
    expectedType: string;
    leaseOwner: string;
    now: string;
    leaseExpiresAt: string;
  },
): Promise<AutomationJob | null> {
  await ensureAutomationSchema(db);
  const jobType = requireAutomationJobType(input.expectedType);
  const leaseOwner = requireLeaseOwner(input.leaseOwner);
  const result = await db.prepare(
    `UPDATE automation_jobs
     SET status = 'leased',
         attempt_count = attempt_count + 1,
         lease_owner = ?,
         lease_expires_at = ?,
         updated_at = ?,
         version = version + 1
     WHERE job_id = ?
       AND job_type = ?
       AND cancel_requested = 0
       AND available_at <= ?
       AND (
         status IN ('queued', 'retry_wait')
         OR (
           status IN ('leased', 'running')
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at <= ?
         )
       )`,
  ).bind(
    leaseOwner,
    input.leaseExpiresAt,
    input.now,
    input.jobId,
    jobType,
    input.now,
    input.now,
  ).run();
  if (changes(result) === 0) return null;
  const job = await getAutomationJobById(db, input.jobId);
  if (!job) return null;
  await appendEvent(db, job, 'leased', input.now);
  return job;
}

export async function markAutomationJobRunning(
  db: D1Database,
  jobId: string,
  leaseOwner: string,
  now: string,
): Promise<boolean> {
  const owner = requireLeaseOwner(leaseOwner);
  const result = await db.prepare(
    `UPDATE automation_jobs
     SET status = 'running', updated_at = ?, version = version + 1
     WHERE job_id = ? AND status = 'leased' AND lease_owner = ?`,
  ).bind(now, jobId, owner).run();
  if (changes(result) === 0) return false;
  const job = await getAutomationJobById(db, jobId);
  if (job) await appendEvent(db, job, 'started', now);
  return true;
}

export async function finishAutomationJob(
  db: D1Database,
  input: {
    jobId: string;
    leaseOwner: string;
    status: 'awaiting_review' | 'completed';
    resultRef: string;
    now: string;
  },
): Promise<'applied' | 'terminal_won' | 'lost_lease'> {
  const owner = requireLeaseOwner(input.leaseOwner);
  const resultRef = requireResultRef(input.resultRef);
  const prior = await getAutomationJobById(db, input.jobId);
  if (!prior) return 'lost_lease';
  if ((AUTOMATION_TERMINAL_STATUSES as readonly string[]).includes(prior.status)) {
    return 'terminal_won';
  }
  const result = await db.prepare(
    `UPDATE automation_jobs
     SET status = ?, result_ref = ?, completed_at = ?,
         lease_owner = NULL, lease_expires_at = NULL,
         last_error_code = NULL, updated_at = ?, version = version + 1
     WHERE job_id = ? AND status = 'running' AND lease_owner = ?`,
  ).bind(
    input.status,
    resultRef,
    input.now,
    input.now,
    input.jobId,
    owner,
  ).run();
  if (changes(result) === 0) return 'lost_lease';
  const job = await getAutomationJobById(db, input.jobId);
  if (job) {
    await appendEvent(
      db,
      job,
      input.status === 'awaiting_review' ? 'awaiting_review' : 'completed',
      input.now,
    );
  }
  return 'applied';
}

export async function failAutomationJob(
  db: D1Database,
  input: {
    jobId: string;
    leaseOwner: string;
    errorCode: string;
    retryable: boolean;
    now: string;
    availableAt: string;
  },
): Promise<'retry_wait' | 'dead_letter' | 'terminal_won' | 'lost_lease'> {
  const owner = requireLeaseOwner(input.leaseOwner);
  const errorCode = requireErrorCode(input.errorCode);
  const prior = await getAutomationJobById(db, input.jobId);
  if (!prior) return 'lost_lease';
  if ((AUTOMATION_TERMINAL_STATUSES as readonly string[]).includes(prior.status)) {
    return 'terminal_won';
  }
  const next = input.retryable && prior.attemptCount < prior.maxAttempts
    ? 'retry_wait'
    : 'dead_letter';
  const result = await db.prepare(
    `UPDATE automation_jobs
     SET status = ?, last_error_code = ?, available_at = ?,
         lease_owner = NULL, lease_expires_at = NULL,
         enqueued_at = NULL,
         completed_at = CASE WHEN ? = 'dead_letter' THEN ? ELSE NULL END,
         updated_at = ?, version = version + 1
     WHERE job_id = ? AND status = 'running' AND lease_owner = ?`,
  ).bind(
    next,
    errorCode,
    input.availableAt,
    next,
    input.now,
    input.now,
    input.jobId,
    owner,
  ).run();
  if (changes(result) === 0) return 'lost_lease';
  const job = await getAutomationJobById(db, input.jobId);
  if (job) {
    await appendEvent(
      db,
      job,
      next === 'retry_wait' ? 'retry_scheduled' : 'dead_lettered',
      input.now,
      errorCode,
    );
  }
  return next;
}

export async function recoverExpiredAutomationLeases(
  db: D1Database,
  now: string,
): Promise<number> {
  await ensureAutomationSchema(db);
  const expired = await db.prepare(
    `SELECT * FROM automation_jobs
     WHERE status IN ('leased', 'running')
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at <= ?
     ORDER BY lease_expires_at
     LIMIT 100`,
  ).bind(now).all<Record<string, unknown>>();
  let recovered = 0;
  for (const row of expired.results ?? []) {
    const prior = rowToJob(row);
    const next = prior.attemptCount >= prior.maxAttempts
      ? 'dead_letter'
      : 'retry_wait';
    const result = await db.prepare(
      `UPDATE automation_jobs
       SET status = ?, available_at = ?, lease_owner = NULL,
           lease_expires_at = NULL, enqueued_at = NULL,
           last_error_code = 'lease_expired',
           completed_at = CASE WHEN ? = 'dead_letter' THEN ? ELSE NULL END,
           updated_at = ?, version = version + 1
       WHERE job_id = ? AND version = ?
         AND status IN ('leased', 'running')
         AND lease_expires_at <= ?`,
    ).bind(
      next,
      now,
      next,
      now,
      now,
      prior.jobId,
      prior.version,
      now,
    ).run();
    if (changes(result) === 0) continue;
    recovered += 1;
    const job = await getAutomationJobById(db, prior.jobId);
    if (job) {
      await appendEvent(
        db,
        job,
        next === 'retry_wait' ? 'retry_scheduled' : 'dead_lettered',
        now,
        'lease_expired',
      );
    }
  }
  return recovered;
}

export async function cancelAutomationJob(
  db: D1Database,
  input: {
    tenantKey: string;
    jobId: string;
    now: string;
  },
): Promise<AutomationJob | null> {
  await ensureAutomationSchema(db);
  const tenant = requireTenantKey(input.tenantKey);
  const result = await db.prepare(
    `UPDATE automation_jobs
     SET status = 'cancelled', cancel_requested = 1,
         lease_owner = NULL, lease_expires_at = NULL,
         completed_at = ?, updated_at = ?, version = version + 1
     WHERE tenant_key = ? AND job_id = ?
       AND status IN ('queued', 'leased', 'running', 'retry_wait')`,
  ).bind(input.now, input.now, tenant, input.jobId).run();
  if (changes(result) === 0) return null;
  const job = await getAutomationJobForTenant(db, tenant, input.jobId);
  if (job) await appendEvent(db, job, 'cancelled', input.now);
  return job;
}

export async function listDueAutomationJobs(
  db: D1Database,
  now: string,
  limit = 50,
): Promise<AutomationJob[]> {
  await ensureAutomationSchema(db);
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const result = await db.prepare(
    `SELECT * FROM automation_jobs
     WHERE status IN ('queued', 'retry_wait')
       AND available_at <= ?
     ORDER BY available_at, created_at
     LIMIT ?`,
  ).bind(now, boundedLimit).all<Record<string, unknown>>();
  return (result.results ?? []).map(rowToJob);
}

export async function replayDeadLetterJob(
  db: D1Database,
  input: {
    tenantKey: string;
    jobId: string;
    actorRole: 'owner' | 'admin' | 'member';
    now: string;
  },
): Promise<AutomationJob | null> {
  const tenant = requireTenantKey(input.tenantKey);
  if (input.actorRole !== 'owner' && input.actorRole !== 'admin') {
    return null;
  }
  const result = await db.prepare(
    `UPDATE automation_jobs
     SET status = 'queued', attempt_count = 0, available_at = ?,
         completed_at = NULL, last_error_code = NULL, enqueued_at = NULL,
         updated_at = ?, version = version + 1
     WHERE tenant_key = ? AND job_id = ? AND status = 'dead_letter'`,
  ).bind(input.now, input.now, tenant, input.jobId).run();
  if (changes(result) === 0) return null;
  const job = await getAutomationJobForTenant(db, tenant, input.jobId);
  if (job) await appendEvent(db, job, 'dlq_replayed', input.now);
  return job;
}

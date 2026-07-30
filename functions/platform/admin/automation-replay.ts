// Atomic owner wrapper for the first-party automation DLQ replay.
//
// The audit insert, guarded job transition and automation event are one D1
// batch. Queue delivery follows the committed transition; if delivery fails,
// the queued row remains recoverable by the scheduled dispatcher.
import {
  ensureAutomationSchema,
  getAutomationJobById,
  markAutomationJobEnqueued,
  messageForJob,
  type AutomationJob,
  type AutomationQueueSender,
} from '../automation';
import {
  ensureOwnerAuditSchema,
  prepareOwnerAuditInsert,
  resolveOwnerAuditInsert,
  type OwnerAuditEvent,
  type OwnerAuditInput,
} from './audit';

type D1WriteResult = { meta?: { changes?: number; rows_written?: number } };

function changes(result: unknown): number {
  const meta = (result as D1WriteResult).meta;
  return Number(meta?.changes ?? meta?.rows_written ?? 0);
}

export async function replayAutomationJobWithAudit(
  db: D1Database,
  queue: AutomationQueueSender,
  input: {
    expectedJob: AutomationJob;
    audit: OwnerAuditInput;
  },
  now: string = new Date().toISOString(),
): Promise<{
  outcome: 'recorded' | 'duplicate' | 'conflict';
  auditEvent: OwnerAuditEvent | null;
  job: AutomationJob | null;
}> {
  await Promise.all([ensureAutomationSchema(db), ensureOwnerAuditSchema(db)]);
  const expected = input.expectedJob;
  const auditPlan = prepareOwnerAuditInsert(
    db,
    input.audit,
    now,
    `EXISTS (
       SELECT 1 FROM automation_jobs
       WHERE job_id = ? AND tenant_key = ? AND job_type = ?
         AND status = 'dead_letter' AND version = ?
     )`,
    [expected.jobId, expected.tenantKey, expected.jobType, expected.version],
  );
  const update = db.prepare(
    `UPDATE automation_jobs
     SET status = 'queued', attempt_count = 0, available_at = ?,
         completed_at = NULL, last_error_code = NULL, enqueued_at = NULL,
         updated_at = ?, version = version + 1
     WHERE job_id = ? AND tenant_key = ? AND job_type = ?
       AND status = 'dead_letter' AND version = ?
       AND EXISTS (SELECT 1 FROM owner_audit_events WHERE event_id = ?)`,
  ).bind(
    now, now, expected.jobId, expected.tenantKey, expected.jobType,
    expected.version, auditPlan.eventId,
  );
  const automationEventId = `aevt_${crypto.randomUUID().replaceAll('-', '')}`;
  const event = db.prepare(
    `INSERT INTO automation_job_events (
       event_id, job_id, tenant_key, event_type, error_code, attempt_count, created_at
     )
     SELECT ?, job_id, tenant_key, 'dlq_replayed', NULL, attempt_count, ?
     FROM automation_jobs
     WHERE job_id = ? AND tenant_key = ? AND job_type = ?
       AND status = 'queued' AND version = ? AND updated_at = ?
       AND EXISTS (SELECT 1 FROM owner_audit_events WHERE event_id = ?)`,
  ).bind(
    automationEventId, now, expected.jobId, expected.tenantKey, expected.jobType,
    expected.version + 1, now, auditPlan.eventId,
  );

  const results = await db.batch([auditPlan.statement, update, event]);
  const audit = await resolveOwnerAuditInsert(db, auditPlan, results[0]);
  if (!audit) {
    return {
      outcome: 'conflict',
      auditEvent: null,
      job: await getAutomationJobById(db, expected.jobId),
    };
  }
  if (audit.outcome === 'duplicate') {
    return {
      outcome: 'duplicate',
      auditEvent: audit.event,
      job: await getAutomationJobById(db, expected.jobId),
    };
  }
  if (changes(results[1]) !== 1 || changes(results[2]) !== 1) {
    throw new Error('automation_replay_atomic_write_failed');
  }

  const queued = await getAutomationJobById(db, expected.jobId);
  if (!queued) throw new Error('automation_replay_job_missing');
  await queue.send(messageForJob(queued));
  await markAutomationJobEnqueued(db, queued.jobId, now);
  return {
    outcome: 'recorded',
    auditEvent: audit.event,
    job: await getAutomationJobById(db, queued.jobId),
  };
}

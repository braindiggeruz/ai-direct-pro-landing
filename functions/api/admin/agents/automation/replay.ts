// POST /api/admin/agents/automation/replay — owner-only DLQ replay.
//
// This is the audited wrapper around the existing replay path. The underlying
// runtime already refuses a non-owner role and a foreign tenant; this endpoint
// adds the reason code, the idempotency key and the audit event, so a replay is
// attributable and a retried request replays once.
import {
  findOwnerAuditReplay,
  methodNotAllowed,
  ownerError,
  ownerJson,
  parseOwnerMutationBody,
  readOwnerBody,
  replayAutomationJobWithAudit,
  requireIdentifier,
  requireTypedConfirmation,
  withOwnerRole,
} from '../../../../platform/admin';
import {
  getAutomationJobById,
  type AutomationQueueSender,
} from '../../../../platform/automation';
import { SEO_AUTOMATION_TENANT, isFirstPartyAutomationEnabled } from '../../../../lib/seo-autopilot/automation';

const REPLAY_KEYS = ['confirmation', 'idempotency_key', 'job_id', 'reason_code'];

export const onRequestPost = withOwnerRole('platform_owner', async (ctx) => {
  if (!isFirstPartyAutomationEnabled(ctx.env)) {
    return ownerError('automation_disabled', ctx.requestId, 409);
  }
  if (!ctx.env.AUTOMATION_QUEUE) {
    return ownerError('automation_queue_unavailable', ctx.requestId, 503);
  }

  const raw = await readOwnerBody(ctx.request);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ownerError('invalid_body', ctx.requestId, 400);
  }
  for (const key of Object.keys(raw as Record<string, unknown>)) {
    if (!REPLAY_KEYS.includes(key)) return ownerError('unexpected_field', ctx.requestId, 400);
  }
  const record = raw as Record<string, unknown>;
  const jobId = requireIdentifier(record.job_id, 'invalid_job_id');
  const body = parseOwnerMutationBody({
    reason_code: record.reason_code,
    idempotency_key: record.idempotency_key,
    ...(record.confirmation === undefined ? {} : { confirmation: record.confirmation }),
  });
  requireTypedConfirmation('automation.replay', body.confirmation, jobId);

  const before = await getAutomationJobById(ctx.db, jobId);
  if (!before) return ownerError('job_not_found', ctx.requestId, 404);
  if (before.tenantKey !== SEO_AUTOMATION_TENANT) {
    // Tenant is resolved server-side. A job outside the platform SEO tenant is
    // not replayable from this surface at all.
    return ownerError('job_not_found', ctx.requestId, 404);
  }
  if (before.jobType !== 'seo_draft_generation') {
    return ownerError('job_type_not_replayable', ctx.requestId, 409);
  }

  const auditInput = {
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: 'automation.replay',
    targetType: 'automation_job',
    targetId: jobId,
    orgId: null,
    reasonCode: body.reasonCode,
    requestId: ctx.requestId,
    idempotencyKey: body.idempotencyKey,
    before: {
      job_id: before.jobId,
      job_type: before.jobType,
      status: before.status,
      attempt_count: before.attemptCount,
      last_error_code: before.lastErrorCode,
    },
    after: { status: 'queued', attempt_count: 0 },
  } as const;

  const replay = await findOwnerAuditReplay(ctx.db, auditInput);
  if (replay) {
    return ownerJson({
      outcome: 'duplicate',
      job: await getAutomationJobById(ctx.db, jobId),
      audit_event_id: replay.eventId,
    }, ctx.requestId);
  }
  if (before.status !== 'dead_letter') {
    return ownerError('job_not_dead_lettered', ctx.requestId, 409);
  }

  const transition = await replayAutomationJobWithAudit(
    ctx.db,
    ctx.env.AUTOMATION_QUEUE as unknown as AutomationQueueSender,
    { expectedJob: before, audit: auditInput },
  );
  if (transition.outcome === 'duplicate') {
    return ownerJson({
      outcome: 'duplicate',
      job: transition.job,
      audit_event_id: transition.auditEvent?.eventId,
    }, ctx.requestId);
  }
  if (transition.outcome === 'conflict') {
    return ownerError('automation_replay_conflict', ctx.requestId, 409);
  }

  return ownerJson({
    outcome: 'applied',
    job: transition.job,
    audit_event_id: transition.auditEvent?.eventId,
  }, ctx.requestId, 202);
});

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

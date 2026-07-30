// /api/admin/agents/pilot
//
//   GET  — pilot roster. Either role.
//   POST — activate or pause a store's pilot. platform_owner only.
//
// Pilot state is kept in owner_pilot_stores rather than overloading
// sotuvchi_stores.status, so pausing a pilot never changes the store lifecycle
// the agent runtime reads. Pausing requires a typed confirmation of the store id.
import {
  firstParam,
  findOwnerAuditReplay,
  getPilotRecord,
  getStoreSummary,
  listPilotRecords,
  methodNotAllowed,
  ownerError,
  ownerJson,
  parseEnumFilter,
  parseOwnerMutationBody,
  parsePagination,
  readOwnerBody,
  requireIdentifier,
  requireTypedConfirmation,
  transitionPilotStateWithAudit,
  type OwnerAuditInput,
  withOwnerRole,
  type PilotState,
} from '../../../platform/admin';

const PILOT_STATES = ['inactive', 'active', 'paused'] as const;
const POST_KEYS = ['confirmation', 'idempotency_key', 'operation', 'reason_code', 'store_id'];

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const page = parsePagination(ctx.url);
  const records = await listPilotRecords(ctx.db, {
    ...page,
    state: parseEnumFilter(ctx.url, 'state', PILOT_STATES),
  });
  return ownerJson({
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    page,
    count: records.length,
    // The pilot is deliberately small. The number is a reminder, not a limit
    // enforced here: R1 is 1-3 verified stores.
    r1_target_stores: '1-3 verified stores',
    pilot: records,
  }, ctx.requestId);
});

export const onRequestPost = withOwnerRole('platform_owner', async (ctx) => {
  const raw = await readOwnerBody(ctx.request);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ownerError('invalid_body', ctx.requestId, 400);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!POST_KEYS.includes(key)) return ownerError('unexpected_field', ctx.requestId, 400);
  }

  const operation = record.operation;
  if (operation !== 'activate' && operation !== 'pause') {
    return ownerError('invalid_operation', ctx.requestId, 400);
  }
  const storeId = requireIdentifier(
    record.store_id ?? firstParam(ctx.params, 'storeId'),
    'invalid_store_id',
  );
  const body = parseOwnerMutationBody({
    reason_code: record.reason_code,
    idempotency_key: record.idempotency_key,
    ...(record.confirmation === undefined ? {} : { confirmation: record.confirmation }),
  });

  const store = await getStoreSummary(ctx.db, storeId);
  if (!store) return ownerError('store_not_found', ctx.requestId, 404);

  const action = operation === 'activate' ? 'pilot.activate' : 'pilot.pause';
  requireTypedConfirmation(action, body.confirmation, storeId);

  const before = await getPilotRecord(ctx.db, store.orgId, storeId);
  const nextState: PilotState = operation === 'activate' ? 'active' : 'paused';
  const auditInput: OwnerAuditInput = {
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action,
    targetType: 'store',
    targetId: storeId,
    orgId: store.orgId,
    reasonCode: body.reasonCode,
    requestId: ctx.requestId,
    idempotencyKey: body.idempotencyKey,
    before: { store_id: storeId, pilot_state: before?.state ?? 'inactive', store_status: store.status },
    after: { store_id: storeId, pilot_state: nextState, store_status: store.status },
  };
  const replay = await findOwnerAuditReplay(ctx.db, auditInput);
  if (replay) {
    return ownerJson({
      outcome: 'duplicate',
      pilot: await getPilotRecord(ctx.db, store.orgId, storeId),
      audit_event_id: replay.eventId,
    }, ctx.requestId);
  }

  // A suspended store cannot enter the pilot. Activating one would put a store
  // the platform has stopped in front of buyers.
  if (operation === 'activate' && store.status !== 'active') {
    return ownerError('store_not_active', ctx.requestId, 409);
  }

  if (before?.state === nextState) {
    return ownerJson({ outcome: 'unchanged', pilot: before }, ctx.requestId);
  }
  if (operation === 'pause' && before?.state !== 'active') {
    return ownerError('invalid_pilot_transition', ctx.requestId, 409);
  }

  const transition = await transitionPilotStateWithAudit(ctx.db, {
    orgId: store.orgId,
    storeId,
    state: nextState,
    updatedBy: ctx.actor.email,
    expectedStoreStatus: store.status,
    expectedPilot: before,
    audit: auditInput,
  });
  if (transition.outcome === 'duplicate') {
    return ownerJson({
      outcome: 'duplicate',
      pilot: transition.pilot,
      audit_event_id: transition.auditEvent?.eventId,
    }, ctx.requestId);
  }
  if (transition.outcome === 'conflict') {
    return ownerError('pilot_transition_conflict', ctx.requestId, 409);
  }

  return ownerJson({
    outcome: 'applied',
    pilot: transition.pilot,
    audit_event_id: transition.auditEvent?.eventId,
  }, ctx.requestId);
});

export const onRequestPut = methodNotAllowed('GET, POST');
export const onRequestPatch = methodNotAllowed('GET, POST');
export const onRequestDelete = methodNotAllowed('GET, POST');

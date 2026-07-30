// Shared implementation for the two store lifecycle mutations.
//
// Both suspend and restore follow the same contract, so they share it rather
// than each re-deriving the ordering: authorize, validate, resolve the target,
// require the typed confirmation, write the audit event first, and only mutate
// the domain when that event was newly recorded. A replayed idempotency key
// therefore returns the original outcome and touches nothing.
import {
  getStoreSummary,
  type StoreSummary,
} from './projections';
import {
  ensureOwnerAuditSchema,
  findOwnerAuditReplay,
  prepareOwnerAuditInsert,
  resolveOwnerAuditInsert,
  type OwnerAuditInput,
} from './audit';
import {
  OwnerValidationError,
  parseOwnerMutationBody,
  requireIdentifier,
  requireTypedConfirmation,
  type OwnerAuditAction,
} from './validation';
import { firstParam, ownerError, ownerJson, readOwnerBody, type OwnerHandlerContext } from './http';

type Transition = {
  action: Extract<OwnerAuditAction, 'store.suspend' | 'store.restore'>;
  nextStatus: 'suspended' | 'active';
  allowedFrom: readonly string[];
};

const TRANSITIONS: Readonly<Record<'suspend' | 'restore', Transition>> = {
  suspend: { action: 'store.suspend', nextStatus: 'suspended', allowedFrom: ['active'] },
  restore: { action: 'store.restore', nextStatus: 'active', allowedFrom: ['suspended'] },
};

function safeStoreMetadata(store: StoreSummary): Record<string, unknown> {
  // Allowlisted metadata only: ids, lifecycle state and counts. No buyer data,
  // no seller content, no request body.
  return {
    store_id: store.storeId,
    org_id: store.orgId,
    status: store.status,
    pilot_state: store.pilotState,
    products: store.products,
    orders: store.orders,
    open_handoffs: store.openHandoffs,
  };
}

export async function handleStoreLifecycle(
  ctx: OwnerHandlerContext,
  kind: 'suspend' | 'restore',
): Promise<Response> {
  const transition = TRANSITIONS[kind];
  const storeId = requireIdentifier(firstParam(ctx.params, 'storeId'), 'invalid_store_id');
  const body = parseOwnerMutationBody(await readOwnerBody(ctx.request));

  const store = await getStoreSummary(ctx.db, storeId);
  if (!store) return ownerError('store_not_found', ctx.requestId, 404);

  requireTypedConfirmation(transition.action, body.confirmation, storeId);

  const now = new Date().toISOString();
  const auditInput: OwnerAuditInput = {
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: transition.action,
    targetType: 'store',
    targetId: storeId,
    orgId: store.orgId,
    reasonCode: body.reasonCode,
    requestId: ctx.requestId,
    idempotencyKey: body.idempotencyKey,
    before: safeStoreMetadata(store),
    after: { ...safeStoreMetadata(store), status: transition.nextStatus },
  };

  // A replay is resolved before looking at the current lifecycle state. The
  // first request necessarily changed that state, so reversing this ordering
  // would turn a valid retry into an unrelated "unchanged" response.
  const replay = await findOwnerAuditReplay(ctx.db, auditInput);
  if (replay) {
    return ownerJson({
      outcome: 'duplicate',
      store: await getStoreSummary(ctx.db, storeId),
      audit_event_id: replay.eventId,
    }, ctx.requestId);
  }

  if (!transition.allowedFrom.includes(store.status)) {
    // Already in the target state is reported distinctly from an illegal
    // transition, so a double-click reads as a no-op rather than an error.
    if (store.status === transition.nextStatus) {
      return ownerJson({
        outcome: 'unchanged',
        store,
        request_id: ctx.requestId,
      }, ctx.requestId);
    }
    return ownerError('invalid_store_transition', ctx.requestId, 409);
  }

  await ensureOwnerAuditSchema(ctx.db);
  const auditPlan = prepareOwnerAuditInsert(
    ctx.db,
    auditInput,
    now,
    `EXISTS (
       SELECT 1 FROM sotuvchi_stores
       WHERE id = ? AND org_id = ? AND status = ?
     )`,
    [storeId, store.orgId, store.status],
  );
  // Guarded by org_id, prior state and the event id inserted in this batch.
  // D1 batches are atomic, so a failed transition cannot leave a ghost audit.
  const update = ctx.db.prepare(
    `UPDATE sotuvchi_stores SET status = ?, updated_at = ?
     WHERE id = ? AND org_id = ? AND status = ?
       AND EXISTS (SELECT 1 FROM owner_audit_events WHERE event_id = ?)`,
  ).bind(
    transition.nextStatus, now, storeId, store.orgId, store.status, auditPlan.eventId,
  );
  const results = await ctx.db.batch([auditPlan.statement, update]);
  const audit = await resolveOwnerAuditInsert(ctx.db, auditPlan, results[0]);

  if (!audit) {
    throw new OwnerValidationError('store_transition_conflict');
  }
  if (audit.outcome === 'duplicate') {
    return ownerJson({
      outcome: 'duplicate',
      store: await getStoreSummary(ctx.db, storeId),
      audit_event_id: audit.event.eventId,
    }, ctx.requestId);
  }
  if (Number(results[1]?.meta?.changes ?? 0) !== 1) {
    throw new Error('store_atomic_write_failed');
  }

  return ownerJson({
    outcome: 'applied',
    store: await getStoreSummary(ctx.db, storeId),
    audit_event_id: audit.event.eventId,
  }, ctx.requestId);
}

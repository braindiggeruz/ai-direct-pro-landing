// GET /api/admin/agents/stores/:storeId — one store, with its recent audit trail.
import {
  firstParam,
  getStoreSummary,
  listHandoffs,
  listOrders,
  listOwnerAuditEvents,
  methodNotAllowed,
  ownerError,
  ownerJson,
  requireIdentifier,
  withOwnerRole,
} from '../../../../../platform/admin';

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const storeId = requireIdentifier(firstParam(ctx.params, 'storeId'), 'invalid_store_id');
  const store = await getStoreSummary(ctx.db, storeId);
  if (!store) return ownerError('store_not_found', ctx.requestId, 404);

  // Scoped to this store on the server. There is no query parameter that can
  // widen the scope, so a support user cannot read another store by editing a
  // URL, and an owner cannot cross-mutate through this read.
  const [orders, handoffs, audit] = await Promise.all([
    listOrders(ctx.db, { limit: 10, offset: 0, storeId }),
    listHandoffs(ctx.db, { limit: 10, offset: 0, storeId }),
    listOwnerAuditEvents(ctx.db, { limit: 20, offset: 0, targetId: storeId }),
  ]);

  return ownerJson({
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    store,
    recent_orders: orders,
    recent_handoffs: handoffs,
    audit_trail: audit,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

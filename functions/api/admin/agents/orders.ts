// GET /api/admin/agents/orders — safe orders overview.
//
// Volume and lifecycle only. Buyer name, phone and address are never projected
// here; the seller who owns the store reads those through the agent runtime.
import {
  listOrders,
  methodNotAllowed,
  ownerJson,
  parseEnumFilter,
  parsePagination,
  requireIdentifier,
  withOwnerRole,
} from '../../../platform/admin';

const ORDER_STATUSES = ['draft', 'placed', 'confirmed', 'done', 'cancelled'] as const;

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const page = parsePagination(ctx.url);
  const rawStore = ctx.url.searchParams.get('store_id');
  const storeId = rawStore ? requireIdentifier(rawStore, 'invalid_store_id') : null;
  const orders = await listOrders(ctx.db, {
    ...page,
    status: parseEnumFilter(ctx.url, 'status', ORDER_STATUSES),
    storeId,
  });
  return ownerJson({
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    page,
    count: orders.length,
    projection: 'no buyer name, phone or address is included in this view',
    orders,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

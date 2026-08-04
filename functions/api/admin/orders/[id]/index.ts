/**
 * GET /api/admin/orders/:id — one order, with the single item it carries.
 *
 * The same projection as the list and for the same reason: the buyer's name,
 * phone and address stay in the table. An owner reading a stuck order needs the
 * reference, the store, the stage and when it stopped moving — and a support
 * user who could read a delivery address here would be a support user who could
 * read every delivery address in the marketplace.
 */
import {
  firstParam,
  methodNotAllowed,
  ownerError,
  ownerJson,
  requireIdentifier,
  withOwnerRole,
} from '../../../../platform/admin';
import { getOrderDetail } from '../../../../platform/admin/operations';

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const id = requireIdentifier(firstParam(ctx.params, 'id'), 'invalid_order_id');
  const order = await getOrderDetail(ctx.db, id, new Date());
  if (!order) return ownerError('order_not_found', ctx.requestId, 404);
  return ownerJson({
    generated_at: new Date().toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    read_only: true,
    order,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

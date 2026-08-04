/**
 * GET /api/admin/orders — one bounded page of the order queue.
 *
 * Read-only, and read-only by construction rather than by convention: there is
 * no POST, PUT, PATCH or DELETE here and no command module behind it. Confirming
 * an order, cancelling one and refunding one all stay with the seller, who is
 * the party the buyer actually dealt with. ADMIN-4A is the owner seeing that
 * the marketplace works, not the owner reaching into a shop.
 *
 * The buyer never appears. `sotuvchi_orders` carries a name, a phone number and
 * a delivery address; none of the three is selected by the read model this
 * calls, so there is no filter, no response field and no log line that could
 * carry one.
 */
import {
  methodNotAllowed,
  ownerJson,
  parseEnumFilter,
  parsePagination,
  withOwnerRole,
} from '../../../platform/admin';
import {
  countOrders,
  listOrderRows,
  operationsSummary,
  ORDER_STAGES,
  requireStoreFilter,
  type OrderStage,
} from '../../../platform/admin/operations';

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const page = parsePagination(ctx.url);
  const filters = {
    stage: parseEnumFilter(ctx.url, 'stage', ORDER_STAGES) as OrderStage | null,
    storeId: requireStoreFilter(ctx.url.searchParams.get('store')),
  };
  const now = new Date();

  const [orders, total, summary] = await Promise.all([
    listOrderRows(ctx.db, { ...filters, ...page }, now),
    countOrders(ctx.db, filters),
    operationsSummary(ctx.db),
  ]);

  return ownerJson({
    generated_at: now.toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    page,
    // `total` is the filtered count; `summary.orders_total` is the queue. They
    // are named apart so a screen cannot report that the marketplace shrank
    // when somebody picked a filter.
    total,
    count: orders.length,
    read_only: true,
    // One order, newest first. There is no sort control: see the data contract
    // for the plan this ordering costs and the index that would remove it.
    sort: 'created_desc',
    filters: { stage: filters.stage, store: filters.storeId },
    summary,
    orders,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

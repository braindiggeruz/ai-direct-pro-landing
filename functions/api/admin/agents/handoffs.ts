// GET /api/admin/agents/handoffs — handoff state without message text.
//
// The owner sees whether a question and a reply exist, and how delivery is
// going. The words themselves stay between the buyer and the seller.
import {
  listHandoffs,
  methodNotAllowed,
  ownerJson,
  parseEnumFilter,
  parsePagination,
  requireIdentifier,
  withOwnerRole,
} from '../../../platform/admin';

const HANDOFF_STATUSES = ['open', 'answered', 'closed', 'expired'] as const;

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const page = parsePagination(ctx.url);
  const rawStore = ctx.url.searchParams.get('store_id');
  const storeId = rawStore ? requireIdentifier(rawStore, 'invalid_store_id') : null;
  const handoffs = await listHandoffs(ctx.db, {
    ...page,
    status: parseEnumFilter(ctx.url, 'status', HANDOFF_STATUSES),
    storeId,
  });
  return ownerJson({
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    page,
    count: handoffs.length,
    projection: 'question and reply text are never included; only their presence is reported',
    handoffs,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

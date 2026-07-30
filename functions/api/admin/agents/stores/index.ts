// GET /api/admin/agents/stores — pilot and onboarding view over every store.
import {
  listStoreSummaries,
  methodNotAllowed,
  ownerJson,
  parseEnumFilter,
  parsePagination,
  withOwnerRole,
} from '../../../../platform/admin';

const STORE_STATUSES = ['active', 'suspended', 'draft'] as const;
const PILOT_STATES = ['inactive', 'active', 'paused'] as const;

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const page = parsePagination(ctx.url);
  const stores = await listStoreSummaries(ctx.db, {
    ...page,
    status: parseEnumFilter(ctx.url, 'status', STORE_STATUSES),
    pilotState: parseEnumFilter(ctx.url, 'pilot_state', PILOT_STATES),
  });
  return ownerJson({
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    page,
    count: stores.length,
    stores,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

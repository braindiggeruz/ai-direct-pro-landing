/**
 * GET /api/admin/moderation/listings — the moderation queue.
 *
 * Read-only, and readable by support. The decision that changes a listing lives
 * one level down and is platform_owner only.
 */
import {
  methodNotAllowed,
  ownerJson,
  parseEnumFilter,
  parsePagination,
  withOwnerRole,
} from '../../../../platform/admin';
import {
  countModerationQueue,
  listModerationQueue,
  moderationSummary,
  MODERATION_STATES,
  type ModerationState,
} from '../../../../platform/admin/moderation';

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const page = parsePagination(ctx.url);
  // Default to the one queue that needs a person. `?state=all` widens it.
  const requested = ctx.url.searchParams.get('state');
  const state = requested === null
    ? 'pending' as ModerationState
    : parseEnumFilter(ctx.url, 'state', MODERATION_STATES);

  const [listings, total, summary] = await Promise.all([
    listModerationQueue(ctx.db, { state, ...page }),
    countModerationQueue(ctx.db, state),
    moderationSummary(ctx.db),
  ]);

  return ownerJson({
    generated_at: new Date().toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    page,
    filters: { state },
    total,
    count: listings.length,
    summary,
    listings,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

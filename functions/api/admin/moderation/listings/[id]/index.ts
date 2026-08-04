/**
 * GET /api/admin/moderation/listings/:id — everything a person needs to decide.
 *
 * Photographs, the seller's public trust facts, category, condition, district,
 * price, description, the moderation history and any reports. Report notes and
 * reporter references are not among them.
 */
import {
  methodNotAllowed,
  ownerError,
  ownerJson,
  requireIdentifier,
  withOwnerRole,
} from '../../../../../platform/admin';
import { getModerationDetail } from '../../../../../platform/admin/moderation';

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const listingId = requireIdentifier(
    Array.isArray(ctx.params.id) ? ctx.params.id[0] : ctx.params.id,
    'invalid_listing_id',
  );
  const listing = await getModerationDetail(ctx.db, listingId);
  if (!listing) return ownerError('listing_not_found', ctx.requestId, 404);
  return ownerJson({
    generated_at: new Date().toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    listing,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

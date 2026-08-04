/**
 * GET /api/admin/moderation/listings/:id/media/:index — one photograph, for a
 * moderator.
 *
 * This exists because neither of the two routes that already serve product
 * images can serve these. `/api/market/v1/classifieds/media/:handle` resolves
 * the caller through a buyer session and only opens a listing to its owner or
 * to the public; a listing awaiting review is neither, and the console holds no
 * such session anyway. `/api/admin/listings/:id/media/:index` builds its object
 * key from `org_id` and `store_id`, which a private listing does not have. A
 * moderator would have been asked to approve photographs they could not see.
 *
 * Read-only, and readable by support for the same reason the detail beside it
 * is: looking at a listing is how a queue gets triaged, and the decision that
 * changes one stays `platform_owner`.
 *
 * The properties the owner route keeps, this keeps:
 *
 *   The caller names an index, never a key. The prefix is built from the
 *   listing's own scope and owner, so a request can only address an object
 *   belonging to the listing it named.
 *
 *   The bucket is never listed, and the reference never appears in the
 *   response. One object, addressed through one listing under moderation.
 *
 *   The bytes leave through `storedMediaResponse`: private cache, no indexing,
 *   sandboxed, and a content type the stored metadata proved rather than one a
 *   caller asked for.
 */
import {
  firstParam,
  methodNotAllowed,
  ownerError,
  requireIdentifier,
  withOwnerRole,
} from '../../../../../../platform/admin';
import { locateModerationMedia } from '../../../../../../platform/admin/moderation';
import {
  mediaObjectKey,
  privateMediaObjectKey,
  storedMediaResponse,
} from '../../../../../../platform/market';

/** Two digits at most, so an index cannot be a path or an unbounded number. */
function parseIndex(raw: string): number {
  if (!/^\d{1,2}$/.test(raw)) return -1;
  return Number(raw);
}

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const listingId = requireIdentifier(firstParam(ctx.params, 'id'), 'invalid_listing_id');
  const index = parseIndex(firstParam(ctx.params, 'index'));
  if (index < 0) return ownerError('invalid_media_index', ctx.requestId, 400);

  const located = await locateModerationMedia(ctx.db, listingId, index);
  if (!located) return ownerError('media_not_found', ctx.requestId, 404);

  // A private seller's photographs sit under their own prefix, a store's under
  // the tenant one. `mediaObjectKey` and `privateMediaObjectKey` both return
  // null for a reference this platform does not store — a Telegram file id, for
  // instance — so an image held elsewhere is named as absent rather than
  // proxied.
  const key = located.sellerProfileId
    ? privateMediaObjectKey(located.sellerProfileId, located.reference)
    : mediaObjectKey(located.orgId ?? '', located.storeId ?? '', located.reference);
  if (!key) return ownerError('media_not_stored_here', ctx.requestId, 409);

  const object = ctx.env.MARKET_MEDIA ? await ctx.env.MARKET_MEDIA.get(key) : null;
  if (!object) return ownerError('media_not_found', ctx.requestId, 404);

  const response = storedMediaResponse(
    object.body,
    object.httpMetadata?.contentType ?? '',
  );
  response.headers.set('x-request-id', ctx.requestId);
  return response;
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

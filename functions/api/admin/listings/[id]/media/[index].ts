/**
 * GET /api/admin/listings/:id/media/:index — one stored image, for the owner.
 *
 * The Mini App already serves product images, but that route sits inside the
 * buyer session: it resolves the caller through `claims.sub` and a market
 * access context the admin console does not have and must not mint. Reusing it
 * would mean giving the panel a buyer session, which is a second front door to
 * a different building. This route instead uses the authority the panel already
 * has — `platform_owner` — and nothing else.
 *
 * Three properties it keeps from the buyer route, deliberately:
 *
 *   The caller names an index, never a key. The R2 object key is built from
 *   the product's own `org_id` and `store_id`, so a request can only ever
 *   address an object inside the store that owns the product it named.
 *
 *   The bucket is never listed. One object, addressed through one product.
 *
 *   The bytes are served with the same hardened headers, through the same
 *   `storedMediaResponse`: private cache, no indexing, no scripting, and a
 *   content type the stored metadata proved rather than one a caller asked for.
 *
 * Images that live in Telegram rather than in this platform's bucket are not
 * proxied. The admin says where they are instead of fetching them.
 */
import {
  firstParam,
  methodNotAllowed,
  ownerError,
  requireIdentifier,
  withOwnerRole,
} from '../../../../../platform/admin';
import {
  isStoredMediaReference,
  mediaObjectKey,
  storedMediaResponse,
} from '../../../../../platform/market';
import { LISTING_LIMITS } from '../../../../../platform/admin/listings';

interface Row { [key: string]: unknown }

function parseIndex(raw: string): number {
  if (!/^\d{1,2}$/.test(raw)) return -1;
  const index = Number(raw);
  return index >= 0 && index < LISTING_LIMITS.mediaMax ? index : -1;
}

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const id = requireIdentifier(firstParam(ctx.params, 'id'), 'invalid_listing_id');
  const index = parseIndex(firstParam(ctx.params, 'index'));
  if (index < 0) return ownerError('invalid_media_index', ctx.requestId, 400);

  const row = await ctx.db.prepare(
    'SELECT org_id, store_id, media_refs_json FROM sotuvchi_products WHERE id = ?',
  ).bind(id).first<Row>();
  if (!row) return ownerError('listing_not_found', ctx.requestId, 404);

  let references: unknown[];
  try {
    const parsed = JSON.parse(String(row.media_refs_json ?? '[]')) as unknown;
    references = Array.isArray(parsed) ? parsed : [];
  } catch {
    references = [];
  }

  const reference = references[index];
  if (typeof reference !== 'string') {
    return ownerError('media_not_found', ctx.requestId, 404);
  }
  // Telegram-hosted images are named, not proxied: this platform does not hold
  // the bytes and the admin console does not become a second Telegram client.
  if (!isStoredMediaReference(reference)) {
    return ownerError('media_not_stored_here', ctx.requestId, 409);
  }

  const key = mediaObjectKey(String(row.org_id ?? ''), String(row.store_id ?? ''), reference);
  const object = key && ctx.env.MARKET_MEDIA ? await ctx.env.MARKET_MEDIA.get(key) : null;
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

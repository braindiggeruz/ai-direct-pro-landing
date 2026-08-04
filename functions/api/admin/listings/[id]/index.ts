/**
 * GET /api/admin/listings/:id — one listing, as the owner and as the buyer.
 *
 * Read-only, and deliberately without actions. A disabled publish button is
 * still a publish button: it tells the reader the capability is here and only
 * temporarily withheld, and it invites the next session to enable it. ADMIN-3A
 * has no write path at all, so the screen shows none.
 *
 * The `preview` block is rendered by the buyer's own presenter — the same
 * `formatBuyerPrice`, `formatBuyerAvailability` and `boundedBuyerDescription`
 * the Mini App uses. It is not a lookalike built from the same columns; if the
 * buyer's formatting changes, this moves with it.
 */
import {
  firstParam,
  methodNotAllowed,
  ownerError,
  ownerJson,
  requireIdentifier,
  withOwnerRole,
} from '../../../../platform/admin';
import { getListingRow, toListingDetail } from '../../../../platform/admin/listings';
import {
  boundedBuyerDescription,
  formatBuyerAvailability,
  formatBuyerPrice,
} from '../../../../agents/sotuvchi/buyer/cards';

/**
 * The owner console is Russian, so the preview is rendered in the locale the
 * reader is reading. This is a presentation choice about the admin screen and
 * not a claim about which locale a given buyer sees.
 */
const PREVIEW_LOCALE = 'ru' as const;

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const id = requireIdentifier(firstParam(ctx.params, 'id'), 'invalid_listing_id');
  const row = await getListingRow(ctx.db, id);
  if (!row) return ownerError('listing_not_found', ctx.requestId, 404);

  const listing = toListingDetail(row, {
    price: (minor) => formatBuyerPrice(minor, PREVIEW_LOCALE),
    availability: (value) => formatBuyerAvailability(value, PREVIEW_LOCALE),
    description: (value) => boundedBuyerDescription(value),
  });

  return ownerJson({
    generated_at: new Date().toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    read_only: true,
    listing,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

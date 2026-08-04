// POST /api/admin/listings/:id/publish — draft becomes published.
//
// platform_owner only. Requires a closed-list reason code, an idempotency key
// and the version the operator was looking at. The transition itself is the one
// `CatalogService.publishProduct` implements and no other.
import { handleListingTransition } from '../../../../platform/admin/listing-lifecycle';
import { methodNotAllowed, withOwnerRole } from '../../../../platform/admin';

export const onRequestPost = withOwnerRole('platform_owner', (ctx) =>
  handleListingTransition(ctx, 'publish'));

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

// POST /api/admin/listings/:id/archive — the listing leaves the catalogue.
//
// The catalogue domain offers no transition out of `archived`, so this is the
// one listing action with no reverse. It therefore requires a typed
// confirmation echoing the listing id, exactly as `store.suspend` does.
import { handleListingTransition } from '../../../../platform/admin/listing-lifecycle';
import { methodNotAllowed, withOwnerRole } from '../../../../platform/admin';

export const onRequestPost = withOwnerRole('platform_owner', (ctx) =>
  handleListingTransition(ctx, 'archive'));

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

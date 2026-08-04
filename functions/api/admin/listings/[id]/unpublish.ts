// POST /api/admin/listings/:id/unpublish — published returns to draft.
//
// This is a real transition in the catalogue domain, not an alias for archive:
// `CatalogService.unpublishProduct` moves a listing back to `draft`, where the
// seller can edit and publish it again. Archiving is a different thing and has
// its own route.
import { handleListingTransition } from '../../../../platform/admin/listing-lifecycle';
import { methodNotAllowed, withOwnerRole } from '../../../../platform/admin';

export const onRequestPost = withOwnerRole('platform_owner', (ctx) =>
  handleListingTransition(ctx, 'unpublish'));

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

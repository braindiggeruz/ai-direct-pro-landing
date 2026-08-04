/**
 * POST /api/admin/moderation/reports/:id/resolution
 *
 * platform_owner only. Resolve or dismiss one report. Whether the listing
 * itself is restricted or removed is a separate, separately audited decision:
 * closing a report is not a verdict on the listing.
 */
import { methodNotAllowed, withOwnerRole } from '../../../../../platform/admin';
import { handleReportResolution } from '../../../../../platform/admin/moderation';

export const onRequestPost = withOwnerRole('platform_owner', handleReportResolution);

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

/**
 * POST /api/admin/moderation/listings/:id/decision
 *
 * platform_owner only. approve, reject, restrict or remove — one route for the
 * four, so a screen cannot reach a fifth. support_readonly receives 403 here
 * while keeping every read above it.
 */
import { methodNotAllowed, withOwnerRole } from '../../../../../platform/admin';
import { handleModerationDecision } from '../../../../../platform/admin/moderation';

export const onRequestPost = withOwnerRole('platform_owner', handleModerationDecision);

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

// POST /api/admin/agents/stores/:storeId/restore
//
// platform_owner only. Requires a closed-list reason code and an idempotency
// key. No typed confirmation: restoring a suspended store is the recovering
// direction, so the friction belongs on suspend, not here.
import { handleStoreLifecycle } from '../../../../../platform/admin/store-lifecycle';
import { methodNotAllowed, withOwnerRole } from '../../../../../platform/admin';

export const onRequestPost = withOwnerRole('platform_owner', (ctx) =>
  handleStoreLifecycle(ctx, 'restore'));

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

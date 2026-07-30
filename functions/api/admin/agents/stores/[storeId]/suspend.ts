// POST /api/admin/agents/stores/:storeId/suspend
//
// platform_owner only. Requires a closed-list reason code, an idempotency key
// and a typed confirmation echoing the store id.
import { handleStoreLifecycle } from '../../../../../platform/admin/store-lifecycle';
import { methodNotAllowed, withOwnerRole } from '../../../../../platform/admin';

export const onRequestPost = withOwnerRole('platform_owner', (ctx) =>
  handleStoreLifecycle(ctx, 'suspend'));

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

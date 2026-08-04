/**
 * GET /api/admin/categories — every category, with the counts that make it
 * worth looking at.
 *
 * Read-only, and there is no create, rename, merge, reorder or delete below
 * it. Those change what buyers can browse and what sellers have already
 * organised; they need a domain and security stage of their own, not a button
 * added to a read screen.
 *
 * Bounded and aggregated server-side: two statements for the whole screen, so
 * the count beside a category is not a request per row.
 */
import {
  methodNotAllowed,
  ownerJson,
  withOwnerRole,
} from '../../../platform/admin';
import { listCategories } from '../../../platform/admin/listings';

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const categories = await listCategories(ctx.db);
  return ownerJson({
    generated_at: new Date().toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    read_only: true,
    count: categories.length,
    categories,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

// GET /api/admin/seo/content-inventory
//
// Returns the full server-side inventory used by Intent Guard.
// Surfaces counts + a compact item list (no body text — that stays
// server-side). Useful for the SPA-side preview of "what we compare
// against".

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { buildContentInventory } from '../../../lib/intent-guard/inventory';
import { withErrorHandler, jsonResponse } from '../../../lib/api-errors';

export const onRequestGet: PagesFunction<Env> = withErrorHandler('admin.seo.content-inventory', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const inventory = await buildContentInventory(env);
  const compact = {
    generated_at: inventory.generated_at,
    counts: inventory.counts,
    items: inventory.items.map((it) => ({
      id: it.id,
      source_type: it.source_type,
      url: it.url,
      locale: it.locale,
      title: it.title,
      slug: it.slug,
      status: it.status,
      target_keyword: it.target_keyword,
      target_money_page: it.target_money_page,
      intent_key: it.intent_key,
      fingerprint: it.fingerprint,
    })),
  };
  return jsonResponse(compact);
});

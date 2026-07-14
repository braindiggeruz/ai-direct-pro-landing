// POST   /api/admin/seo/topic-plans/:id/items/:itemId/replace
// DELETE /api/admin/seo/topic-plans/:id/items/:itemId
//
// Replace = re-roll the topic into a different unique slot.
// Delete  = remove the proposed item from the plan.

import type { Env } from '../../../../../../../_types';
import { requireAuth } from '../../../../../../../lib/jwt';
import { deleteItem, getItem, recomputeSummary, updateItem } from '../../../../../../../lib/intent-guard/plans';
import { buildContentInventory } from '../../../../../../../lib/intent-guard/inventory';
import { proposeTopics } from '../../../../../../../lib/intent-guard/topic-suggester';
import { buildLinkPlan } from '../../../../../../../lib/intent-guard/link-plan';
import { listActiveReservations } from '../../../../../../../lib/intent-guard/reservations';
import { withErrorHandler, jsonResponse } from '../../../../../../../lib/api-errors';

export const onRequestPost: PagesFunction<Env> = withErrorHandler<Env>('admin.seo.topic-plans.item.replace', async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const planId = String(params.id || '');
  const itemId = String(params.itemId || '');
  if (!planId || !itemId) return jsonResponse({ error: 'plan id + item id required' }, 400);
  const item = await getItem(env, itemId);
  if (!item || item.plan_id !== planId) return jsonResponse({ error: 'Item not found' }, 404);
  if (item.status !== 'proposed' && item.status !== 'failed') {
    return jsonResponse({ error: 'Item already launched — cannot replace.' }, 409);
  }
  const inventory = await buildContentInventory(env);
  const reservations = await listActiveReservations(env);
  const reservedKeys = new Set<string>(reservations.map((r) => r.intent_key));
  // Exclude the current item key so the new pick is genuinely different.
  reservedKeys.add(item.intent_key);
  const proposals = proposeTopics({
    count: 1,
    locale_mode: item.locale,
    inventory,
    reservedActiveIntentKeys: reservedKeys,
    filters: {
      industry: item.industry || undefined,
      channel: item.channel || undefined,
      funnel_stage: item.funnel_stage || undefined,
      cluster: item.cluster_key || undefined,
      target_money_page: item.target_money_page || undefined,
    },
  });
  if (proposals.length === 0) return jsonResponse({ ok: false, error: 'No unique slots available' }, 409);
  const p = proposals[0];
  const link_plan = buildLinkPlan({
    locale: p.locale, planned_title: p.planned_title, primary_keyword: p.primary_keyword,
    target_money_page: p.supports_url, fingerprint: p.fingerprint,
  }, inventory);
  const next = await updateItem(env, itemId, {
    planned_title: p.planned_title,
    primary_keyword: p.primary_keyword,
    intent_key: p.intent_key,
    fingerprint: p.fingerprint,
    link_plan,
    reason_unique: p.reason_unique,
    supports_url: p.supports_url,
    target_money_page: p.supports_url,
    risk_score: p.risk_score,
    risk_level: p.risk_level,
    status: 'proposed',
  });
  await recomputeSummary(env, planId);
  void auth;
  return jsonResponse({ ok: true, item: next });
});

export const onRequestDelete: PagesFunction<Env> = withErrorHandler<Env>('admin.seo.topic-plans.item.delete', async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const planId = String(params.id || '');
  const itemId = String(params.itemId || '');
  if (!planId || !itemId) return jsonResponse({ error: 'plan id + item id required' }, 400);
  const item = await getItem(env, itemId);
  if (!item || item.plan_id !== planId) return jsonResponse({ error: 'Item not found' }, 404);
  if (item.status !== 'proposed' && item.status !== 'failed') {
    return jsonResponse({ error: 'Item already launched — cannot delete.' }, 409);
  }
  await deleteItem(env, itemId);
  await recomputeSummary(env, planId);
  void auth;
  return jsonResponse({ ok: true });
});

// /api/admin/seo/topic-plans
//
//   POST — create a new plan with N proposed topics. Body:
//          { name?, count, locale_mode, params }
//          where locale_mode ∈ ru | uz | ru+uz
//          and params is { cluster?, industry?, channel?, funnel_stage?, target_money_page? }
//
//   GET  — list recent plans (limit=50)

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { buildContentInventory } from '../../../../lib/intent-guard/inventory';
import { proposeTopics, dedupePlanItems } from '../../../../lib/intent-guard/topic-suggester';
import { buildLinkPlan } from '../../../../lib/intent-guard/link-plan';
import { createPlan, listPlans } from '../../../../lib/intent-guard/plans';
import { listActiveReservations } from '../../../../lib/intent-guard/reservations';
import { withErrorHandler, jsonResponse } from '../../../../lib/api-errors';

export const onRequestPost: PagesFunction<Env> = withErrorHandler<Env>('admin.seo.topic-plans.create', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ error: 'Draft storage not configured.' }, 503);

  const body = (await request.json().catch(() => null)) as null | {
    name?: string;
    count?: number;
    locale_mode?: 'ru' | 'uz' | 'ru+uz';
    params?: Record<string, unknown>;
  };
  const count = Math.min(Math.max(Number(body?.count ?? 10), 1), 20);
  const locale_mode = body?.locale_mode === 'uz' || body?.locale_mode === 'ru+uz' ? body.locale_mode : 'ru';
  const params = (body?.params && typeof body.params === 'object') ? body.params as Record<string, unknown> : {};
  const filters = {
    cluster: typeof params.cluster === 'string' ? params.cluster : undefined,
    industry: typeof params.industry === 'string' ? params.industry : undefined,
    channel: typeof params.channel === 'string' ? params.channel : undefined,
    funnel_stage: typeof params.funnel_stage === 'string' ? params.funnel_stage : undefined,
    target_money_page: typeof params.target_money_page === 'string' ? params.target_money_page : undefined,
  };

  const inventory = await buildContentInventory(env);
  const reservations = await listActiveReservations(env).catch(() => []);
  const reservedKeys = new Set<string>(reservations.map((r) => r.intent_key));
  const proposals = proposeTopics({ count, locale_mode, inventory, reservedActiveIntentKeys: reservedKeys, filters });
  const items = dedupePlanItems(proposals).map((p) => ({
    locale: p.locale,
    planned_title: p.planned_title,
    primary_keyword: p.primary_keyword,
    intent_key: p.intent_key,
    fingerprint: p.fingerprint,
    cluster_key: p.cluster_key,
    funnel_stage: p.funnel_stage,
    audience: p.audience,
    industry: p.industry,
    channel: p.channel,
    geo: p.fingerprint.geo,
    modifier: p.modifier,
    content_type: p.content_type,
    target_money_page: p.supports_url,
    reason_unique: p.reason_unique,
    supports_url: p.supports_url,
    link_plan: buildLinkPlan({
      locale: p.locale, planned_title: p.planned_title, primary_keyword: p.primary_keyword,
      target_money_page: p.supports_url, fingerprint: p.fingerprint,
    }, inventory),
    risk_score: p.risk_score,
    risk_level: p.risk_level,
  }));

  const plan = await createPlan(env, {
    name: typeof body?.name === 'string' ? body.name : null,
    requested_count: count,
    locale_mode,
    params,
    created_by: auth.email,
  }, items);

  return jsonResponse({ ok: true, plan });
});

export const onRequestGet: PagesFunction<Env> = withErrorHandler<Env>('admin.seo.topic-plans.list', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ plans: [] });
  const plans = await listPlans(env, 50);
  return jsonResponse({ plans });
});

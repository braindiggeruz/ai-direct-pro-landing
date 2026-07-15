// /api/admin/seo/topic-plans/:id
//
//   GET   — fetch one plan with all items.
//   PATCH — change plan name / cancel / mark reviewing.

import type { Env } from '../../../../../_types';
import { requireAuth } from '../../../../../lib/jwt';
import { getPlan, updatePlan } from '../../../../../lib/intent-guard/plans';
import { withErrorHandler, jsonResponse } from '../../../../../lib/api-errors';
import type { TopicPlanStatus } from '../../../../../../src/shared/intent-guard';

const ALLOWED_STATUSES: TopicPlanStatus[] = ['proposed', 'reviewing', 'cancelled'];

export const onRequestGet: PagesFunction<Env> = withErrorHandler<Env>('admin.seo.topic-plans.get', async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);
  const plan = await getPlan(env, id);
  if (!plan) return jsonResponse({ error: 'Plan not found' }, 404);
  return jsonResponse({ plan });
});

export const onRequestPatch: PagesFunction<Env> = withErrorHandler<Env>('admin.seo.topic-plans.patch', async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);
  const body = (await request.json().catch(() => null)) as null | {
    name?: string;
    status?: TopicPlanStatus;
  };
  if (!body) return jsonResponse({ error: 'invalid JSON' }, 400);
  if (body.status && !ALLOWED_STATUSES.includes(body.status)) {
    return jsonResponse({ error: 'status not allowed via PATCH' }, 400);
  }
  const next = await updatePlan(env, id, {
    name: typeof body.name === 'string' ? body.name : undefined,
    status: body.status,
  });
  if (!next) return jsonResponse({ error: 'Plan not found' }, 404);
  return jsonResponse({ plan: next });
});

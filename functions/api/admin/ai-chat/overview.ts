// GET /api/admin/ai-chat/overview?weeks=8 — the admin section «AI-чат»
// (paid-chat plan WP-19, D10): readiness, the weeks, the models and the alerts
// in one answer, for the owner only (platform_owner).
//
// Four sections, each {ok, data, error}: one that cannot be read says so
// (schema_pending, query_failed) and the others still answer. Inside a section
// null means «not written yet», never a calm zero. Readiness comes from the
// environment (setting names only, never a value) and needs no D1; the rest is
// one db.batch of aggregates (functions/lib/gpt-chat/admin-store.ts). The page
// reads it when opened and on the refresh button, never on a timer.
import { methodNotAllowed, ownerError, ownerJson, withOwnerRole } from '../../../platform/admin';
import { AiChatAdminStore } from '../../../lib/gpt-chat/admin-store';
import { aiChatReadiness } from '../../../lib/gpt-chat/admin-readiness';
import { BILLING_ORG, type BillingEnv } from '../../../lib/gpt-chat/billing-config';
import { resolveConfig } from '../../../lib/gpt-chat/config';
import {
  AI_CHAT_ADMIN_TZ,
  AI_CHAT_WEEKS,
  boundedParam,
  sectionOk,
  type AiChatOverview,
} from '../../../../src/shared/ai-chat-admin';

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const weeks = boundedParam(ctx.url.searchParams.get('weeks'), AI_CHAT_WEEKS.default, AI_CHAT_WEEKS.max);
  if (weeks === null) return ownerError('invalid_query', ctx.requestId, 400);
  const env = ctx.env as BillingEnv;
  const now = Date.now();
  const sections = await new AiChatAdminStore(ctx.db).overview(BILLING_ORG, {
    now,
    weeks,
    capUsd: resolveConfig(env).freePaidDailyUsd,
    requestId: ctx.requestId,
  });
  const body: AiChatOverview = {
    generatedAt: now,
    tz: AI_CHAT_ADMIN_TZ,
    request_id: ctx.requestId,
    readiness: sectionOk(aiChatReadiness(env, now)),
    ...sections,
  };
  return ownerJson(body, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

// GET /api/admin/ai-chat/visitors?days=7 — the 50 IP groups active last in
// the past 1–30 days (plan WP-19, W13), for the owner only.
//
// IP groups, not people: one row is one network after the salt, and behind an
// operator's shared IP there may be many people. Each group is the pseudonym
// HMAC(GPT_HASH_SALT, "admin-alias:v1:" + IP hash); no IP, hash, subject,
// session or message leaves the server. Without the salt the section is
// salt_missing and no SQL runs (fail closed).
import { methodNotAllowed, ownerError, ownerJson, withOwnerRole } from '../../../platform/admin';
import { AiChatAdminStore } from '../../../lib/gpt-chat/admin-store';
import { BILLING_ORG } from '../../../lib/gpt-chat/billing-config';
import { resolveHashSalt } from '../../../lib/gpt-chat/hash';
import {
  AI_CHAT_VISITOR_DAYS,
  boundedParam,
  type AiChatVisitors,
} from '../../../../src/shared/ai-chat-admin';

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const days = boundedParam(
    ctx.url.searchParams.get('days'),
    AI_CHAT_VISITOR_DAYS.default,
    AI_CHAT_VISITOR_DAYS.max,
  );
  if (days === null) return ownerError('invalid_query', ctx.requestId, 400);
  const visitors = await new AiChatAdminStore(ctx.db).visitors(BILLING_ORG, {
    now: Date.now(),
    days,
    salt: resolveHashSalt(ctx.env).hashSalt || null,
  });
  const body: AiChatVisitors = { request_id: ctx.requestId, days, visitors };
  return ownerJson(body, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

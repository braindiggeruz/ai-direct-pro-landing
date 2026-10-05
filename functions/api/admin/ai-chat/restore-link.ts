// POST /api/admin/ai-chat/restore-link — a guest's lost pack (guest checkout),
// for the owner only (platform_owner).
//
// Body {query}: our order number (pay_…) or Click's payment id. Answers the
// order as the payments list shows it and, for a paid guest order whose pack
// still runs, a one-time link for 24 hours (guest-restore.ts). Opened by the
// buyer, the link moves the order and its pack to that browser. Nothing is
// moved here, and the answer names no account.
import {
  methodNotAllowed,
  ownerError,
  ownerJson,
  readOwnerBody,
  withOwnerRole,
} from '../../../platform/admin';
import type { BillingEnv } from '../../../lib/gpt-chat/billing-config';
import { ensureBillingSchema } from '../../../lib/gpt-chat/billing-schema';
import { findOrder, restorable, restoreToken } from '../../../lib/gpt-chat/guest-restore';
import { isGuestAccount } from '../../../lib/gpt-chat/identity-store';
import { RESTORE_QUERY, type AiChatRestoreLinkResult } from '../../../../src/shared/ai-chat-admin';

export const onRequestPost = withOwnerRole('platform_owner', async (ctx) => {
  const body = await readOwnerBody(ctx.request);
  const query = body && typeof body === 'object' && typeof (body as { query?: unknown }).query === 'string'
    ? (body as { query: string }).query.trim()
    : '';
  if (!RESTORE_QUERY.test(query)) return ownerError('invalid_query', ctx.requestId, 400);
  const env = ctx.env as BillingEnv;
  const secret = env.GPT_IDENTITY_SECRET || '';
  if (!env.GPTBOT_DRAFTS_DB) return ownerError('storage_unavailable', ctx.requestId, 503);
  if (secret.length < 32) return ownerError('identity_secret_missing', ctx.requestId, 409);
  try {
    await ensureBillingSchema(env.GPTBOT_DRAFTS_DB);
    const order = await findOrder(env.GPTBOT_DRAFTS_DB, query);
    if (!order) return ownerError('not_found', ctx.requestId, 404);
    const link = restorable(order) ? await restoreToken(secret, order) : null;
    const result: AiChatRestoreLinkResult = {
      ok: true,
      order: {
        id: order.id,
        state: order.state,
        guest: isGuestAccount(order.user_id),
        paidAt: order.perform_time || null,
        packEndsAt: order.revoked_at === null ? order.ends_at : null,
      },
      link: link ? `${new URL(ctx.request.url).origin}/api/gpt/restore?t=${link.token}` : null,
      expiresAt: link?.expiresAt ?? null,
      request_id: ctx.requestId,
    };
    return ownerJson(result, ctx.requestId);
  } catch {
    console.warn(JSON.stringify({ event: 'gpt_admin_restore_link_failed', request_id: ctx.requestId }));
    return ownerError('query_failed', ctx.requestId, 503);
  }
});

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

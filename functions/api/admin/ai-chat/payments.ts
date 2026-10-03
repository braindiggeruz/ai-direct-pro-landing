// GET /api/admin/ai-chat/payments?cursor=&provider=&state=&mode= — the orders
// of the AI pack across Click, Uzum and Payme, newest first, 50 a page (plan
// WP-19, W10), for the owner only.
//
// Keyset by (created_at, provider, id): seq repeats across the two order
// tables (plan A4). An order shows its number (the support key the buyer also
// sees), provider, mode, state, amount, times, its pack and its receipts. The
// buyer is a pseudonym (HMAC with GPT_HASH_SALT) or nothing without the salt;
// no account id, Telegram identity or contact is read for it.
import { methodNotAllowed, ownerError, ownerJson, withOwnerRole } from '../../../platform/admin';
import { AiChatAdminStore } from '../../../lib/gpt-chat/admin-store';
import { BILLING_ORG } from '../../../lib/gpt-chat/billing-config';
import { resolveHashSalt } from '../../../lib/gpt-chat/hash';
import {
  AI_CHAT_MODES,
  AI_CHAT_ORDER_STATES,
  AI_CHAT_PROVIDERS,
  closedParam,
  parsePaymentsCursor,
  type AiChatPayments,
} from '../../../../src/shared/ai-chat-admin';

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const params = ctx.url.searchParams;
  const rawCursor = params.get('cursor');
  const cursor = rawCursor ? parsePaymentsCursor(rawCursor) : null;
  const provider = closedParam(params.get('provider'), AI_CHAT_PROVIDERS);
  const state = closedParam(params.get('state'), AI_CHAT_ORDER_STATES);
  const mode = closedParam(params.get('mode'), AI_CHAT_MODES);
  if ((rawCursor && !cursor) || provider === undefined || state === undefined || mode === undefined)
    return ownerError('invalid_query', ctx.requestId, 400);
  const payments = await new AiChatAdminStore(ctx.db).payments(
    BILLING_ORG,
    { cursor, provider, state, mode },
    { now: Date.now(), salt: resolveHashSalt(ctx.env).hashSalt || null, requestId: ctx.requestId },
  );
  const body: AiChatPayments = { request_id: ctx.requestId, payments };
  return ownerJson(body, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');

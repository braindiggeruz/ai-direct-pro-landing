// POST /api/admin/ai-chat/rehearsal-session — «Сессия репетиции» (plan WP-19,
// decision L7), for the owner only (platform_owner).
//
// Body {"account": false|true}. Opens the dark test session of WP-13 in the
// owner's own browser: the __Host-gpt_rehearsal cookie for two hours and, with
// account:true, a fresh synthetic account acct_rh_… signed in for the same
// two hours (__Host-gpt_account). The same as the Bearer endpoint
// internal/gpt-rehearsal-session (rehearsal.ts openRehearsal). Only while
// some provider is in test: otherwise 409 no_test_provider. The cookie values
// travel only in Set-Cookie; the answer says what the session is offered.
import {
  methodNotAllowed,
  ownerError,
  ownerJson,
  readOwnerBody,
  withOwnerRole,
} from '../../../platform/admin';
import type { BillingEnv } from '../../../lib/gpt-chat/billing-config';
import { openRehearsal } from '../../../lib/gpt-chat/rehearsal';
import type { AiChatRehearsalResult } from '../../../../src/shared/ai-chat-admin';

export const onRequestPost = withOwnerRole('platform_owner', async (ctx) => {
  const body = await readOwnerBody(ctx.request);
  const p = body !== null && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
  if (!p || (p.account !== undefined && typeof p.account !== 'boolean'))
    return ownerError('invalid_body', ctx.requestId, 400);
  const opened = await openRehearsal(ctx.env as BillingEnv, { account: p.account === true });
  if (!opened.ok)
    return ownerError(opened.code, ctx.requestId, opened.code === 'unavailable' ? 503 : 409);
  const result: AiChatRehearsalResult = {
    ok: true,
    expiresAt: opened.expiresAt,
    providers: opened.providers,
    account: opened.account !== null,
    request_id: ctx.requestId,
  };
  const response = ownerJson(result, ctx.requestId);
  for (const cookie of opened.cookies) response.headers.append('Set-Cookie', cookie);
  return response;
});

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

// POST /api/admin/ai-chat/refund-record — «Отметить возврат» (plan WP-19,
// decision L12), for the owner only (platform_owner).
//
// Body {orderId, merchantRefundReference, confirmedRefund: true}. The owner
// has already returned the money in the Click or Uzum cabinet; this records
// it, through the same function as the Bearer endpoints (seller-refund.ts),
// and never moves money: no reversal, no Uzum refund call. A paid AI pack is
// not refundable (offer section 8, ai-paket-2026-10-v2); the record is for
// the Seller's exceptions only, money taken by mistake (one purchase charged
// twice) or a refund the law requires, of an order the ledger holds as paid.
// The page asks for the order number typed by hand and a second confirmation.
//   Click and Uzum Merchant API: the owner's confirmation is the record.
//   Uzum Checkout: recorded only when Uzum itself reports REFUNDED in full.
//   A payment that started no pack is closed in the ledger already: 409
//     invalid_order with its state; the money is returned in the cabinet alone.
// A repeat changes nothing and answers recorded:false. The Bearer header, not
// a cookie, authenticates it, so a cross-site form cannot send it.
import {
  methodNotAllowed,
  ownerError,
  ownerJson,
  readOwnerBody,
  withOwnerRole,
} from '../../../platform/admin';
import { maintainBilling } from '../../../lib/gpt-chat/billing-maintenance-store';
import type { BillingEnv } from '../../../lib/gpt-chat/billing-config';
import { fiscalizeDue } from '../../../lib/gpt-chat/fiscal-store';
import { recordSellerRefund, type SellerRefundFailure } from '../../../lib/gpt-chat/seller-refund';
import {
  ORDER_ID,
  REFUND_REFERENCE,
  type AiChatRefundRecordResult,
} from '../../../../src/shared/ai-chat-admin';

const FAILURE_STATUS: Record<SellerRefundFailure, number> = {
  invalid_order: 409,
  uzum_not_configured: 409,
  not_refunded_at_uzum: 409,
  upstream_unavailable: 502,
};

export const onRequestPost = withOwnerRole('platform_owner', async (ctx) => {
  const body = await readOwnerBody(ctx.request);
  const p = body !== null && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  if (typeof p.orderId !== 'string' || !ORDER_ID.test(p.orderId))
    return ownerError('invalid_order_id', ctx.requestId, 400);
  const reference = typeof p.merchantRefundReference === 'string' ? p.merchantRefundReference.trim() : '';
  if (!REFUND_REFERENCE.test(reference)) return ownerError('invalid_reference', ctx.requestId, 400);
  if (p.confirmedRefund !== true) return ownerError('confirmation_required', ctx.requestId, 400);
  const env = ctx.env as BillingEnv;
  const provider = p.orderId.startsWith('uzm_') ? 'uzum' : 'click';
  let outcome: Awaited<ReturnType<typeof recordSellerRefund>>;
  try {
    outcome = await recordSellerRefund(env, provider, p.orderId, reference);
  } catch {
    console.warn(JSON.stringify({ event: 'gpt_admin_refund_record_failed', request_id: ctx.requestId }));
    return ownerError('record_failed', ctx.requestId, 503);
  }
  if (!outcome.ok)
    return ownerJson(
      { error: outcome.code, request_id: ctx.requestId, state: outcome.state },
      ctx.requestId,
      FAILURE_STATUS[outcome.code],
    );
  if (outcome.recorded) {
    // The owner's «refunded» notice and, for an Uzum order whose sale receipt
    // was printed, its refund receipt, as after the Bearer endpoints.
    ctx.waitUntil(maintainBilling(env).catch(() => console.warn('gpt_billing_delivery_failed')));
    if (provider === 'uzum')
      ctx.waitUntil(fiscalizeDue(env).catch(() => console.warn('gpt_uzum_fiscal_failed')));
  }
  const result: AiChatRefundRecordResult = {
    ok: true,
    state: 'refunded',
    recorded: outcome.recorded,
    request_id: ctx.requestId,
  };
  return ownerJson(result, ctx.requestId);
});

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestPatch = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');

// The Seller's refund record (decision L12): the owner has already returned
// the money in the provider's cabinet, and this records it in the ledger.
// It never calls a refund API and never moves money. A paid AI pack is not
// refundable (offer section 8, edition ai-paket-2026-10-v2); what is recorded
// here are the offer's exceptions, money taken by mistake or a refund the law
// requires, for an order the ledger holds as paid.
//
// One function for the three callers that record: the Bearer endpoints
// internal/gpt-click-refund-record.ts and internal/gpt-uzum-refund.ts (its
// record-only branch), and the admin's api/admin/ai-chat/refund-record.ts.
//
//   Click and Uzum Merchant API: the owner's confirmation is the record (the
//     Merchant API has no status to ask; Click documents none for a refund).
//   Uzum Checkout: Uzum is asked first, and the refund is recorded only when
//     Uzum itself reports the full amount of this order refunded. Marking a
//     refund Uzum has not confirmed would close the pack while the buyer's
//     money was never returned.
//
// The paid -> refunded transition revokes the pack and queues the outbox
// event 'refunded' (BillingStore.transition). A repeat is a no-op: an order
// already refunded is reported as such and nothing is written again. The
// order's own mode decides Uzum's credentials, so a refund can be recorded
// after sales were switched off. A payment that started no pack (the order is
// closed in the ledger, e.g. alert uzum_paid_after_cancel) has nothing to
// record: it is invalid_order with its state, and the money is returned in
// the cabinet alone (docs/paid-chat/OFFER-RU.md).
import { BILLING_ORG, type BillingEnv } from "./billing-config";
import { ensureBillingSchema, ensureUzumSchema } from "./billing-schema";
import { BillingStore } from "./billing-store";
import { getOrderStatus } from "./uzum-checkout";
import { uzumCheckoutConfig } from "./uzum-config";
import { UzumStore, UZUM_REASON_RETURNED } from "./uzum-store";

/** gpt_payment_orders.reason of a Click refund (the reversal records the same). */
export const CLICK_REFUND_REASON = 5;

export type SellerRefundFailure =
  | "invalid_order"
  | "uzum_not_configured"
  | "upstream_unavailable"
  | "not_refunded_at_uzum";

export type SellerRefundOutcome =
  | { ok: true; recorded: boolean }
  | { ok: false; code: SellerRefundFailure; state: string | null };

const RECORDABLE = new Set(["paid", "refunded"]);

/**
 * Record the Seller's refund of a paid order of `provider`. `recorded` is
 * false when the order was refunded already. Throws only on a D1 failure.
 */
export async function recordSellerRefund(
  env: BillingEnv,
  provider: "click" | "uzum",
  orderId: string,
  reference: string,
  now = Date.now(),
): Promise<SellerRefundOutcome> {
  const db = env.GPTBOT_DRAFTS_DB!;
  const method = `owner_refund_record:${reference}`;
  if (provider === "click") {
    await ensureBillingSchema(db);
    const store = new BillingStore(db, BILLING_ORG);
    const order = await store.order(orderId);
    if (!order || order.provider !== "click" || !RECORDABLE.has(order.state))
      return { ok: false, code: "invalid_order", state: order?.state ?? null };
    if (order.state === "refunded") return { ok: true, recorded: false };
    await store.transition(order.id, "cancelled", method, { reason: CLICK_REFUND_REASON, now });
    return { ok: true, recorded: true };
  }
  await ensureUzumSchema(db);
  const store = new UzumStore(db, BILLING_ORG);
  const row = await store.order(orderId);
  if (!row || !row.external_id || !RECORDABLE.has(row.state))
    return { ok: false, code: "invalid_order", state: row?.state ?? null };
  if (row.state === "refunded") return { ok: true, recorded: false };
  if (row.api === "checkout") {
    const cfg = uzumCheckoutConfig(env, row.mode, { settleOnly: true });
    if (!cfg) return { ok: false, code: "uzum_not_configured", state: row.state };
    const pulled = await getOrderStatus(cfg, row.external_id);
    if (!pulled.ok) return { ok: false, code: "upstream_unavailable", state: row.state };
    const s = pulled.status;
    if (
      s.status !== "REFUNDED" ||
      s.refundedAmount !== row.amount ||
      s.merchantOrderId !== row.id ||
      s.amount !== row.amount
    )
      return { ok: false, code: "not_refunded_at_uzum", state: row.state };
  }
  await store.billing.transition(row.id, "cancelled", method, { reason: UZUM_REASON_RETURNED, now });
  return { ok: true, recorded: true };
}

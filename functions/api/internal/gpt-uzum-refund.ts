// Owner-only Uzum refunds (full amount only).
// Auth: Authorization: Bearer GPT_BILLING_MAINTENANCE_SECRET, like
// gpt-click-refund-record.ts. The order's own mode and API decide the
// credentials, so money can be returned after Uzum sales were switched off.
//
// Checkout orders:
// 1) {orderId, confirmRefund:true}: asks Uzum to refund the paid order
//    (POST /api/v1/acquiring/refund). The X-Operation-Id is created once and
//    stored BEFORE the call, so a retry repeats the same operation instead of
//    refunding twice. An order Uzum auto-fiscalized carries the cart (Uzum
//    prints the refund receipt); any other order carries none, and the
//    Fiscalization API prints its refund receipt (fiscal-store.ts). The
//    ledger changes only when Uzum reports REFUNDED (REFUND callback, a status
//    pull right after the call, or "check status").
// 2) {orderId, merchantRefundReference, confirmedRefund:true}: records a
//    refund made in the Uzum cabinet. We pull the status first and record it
//    only if Uzum itself reports the full amount refunded; otherwise 409.
//    Marking a refund Uzum has not confirmed would revoke access while the
//    customer's money was never returned.
// Merchant API orders (payments in the Uzum Bank app): the Merchant API has
// no refund call; Uzum returns the money and sends /reverse, which settles
// the order by itself. Only 2) applies, for a refund Uzum made without
// /reverse; there is no status to pull, so the owner's confirmation is the
// record, as for Click.
// Source: https://developer.uzumbank.uz/redocusaurus/en_checkout.yaml (1.10.3),
// en_merchant.yaml (1.0.0).
import { BILLING_ORG, type BillingEnv } from "../../lib/gpt-chat/billing-config";
import { ensureUzumSchema } from "../../lib/gpt-chat/billing-schema";
import { internalAuthorized } from "../../lib/gpt-chat/internal-auth";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
import { maintainBilling } from "../../lib/gpt-chat/billing-maintenance-store";
import { fiscalizeDue } from "../../lib/gpt-chat/fiscal-store";
import { uzumCartParams, uzumCheckoutConfig } from "../../lib/gpt-chat/uzum-config";
import { refund } from "../../lib/gpt-chat/uzum-checkout";
import { UzumStore } from "../../lib/gpt-chat/uzum-store";
import { recordSellerRefund, type SellerRefundFailure } from "../../lib/gpt-chat/seller-refund";

/** Uzum "Operation already exists": the same X-Operation-Id was accepted before. */
const OPERATION_EXISTS = 3028;

/** The answer to a record the ledger refused, as before seller-refund.ts. */
const RECORD_FAILURES: Record<SellerRefundFailure, [message: string, status: number]> = {
  invalid_order: ["Order not eligible", 409],
  uzum_not_configured: ["Uzum Checkout is not configured", 409],
  upstream_unavailable: ["Uzum status unavailable; retry", 502],
  not_refunded_at_uzum: ["Uzum does not report this order as fully refunded", 409],
};

export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  if (!internalAuthorized(request, env.GPT_BILLING_MAINTENANCE_SECRET))
    return fail("forbidden", "Forbidden", 403);
  const body = await readJsonLimited<{
    orderId?: unknown;
    confirmRefund?: unknown;
    merchantRefundReference?: unknown;
    confirmedRefund?: unknown;
  }>(request, 2048);
  const p = body.ok ? body.value : null;
  const recordOnly =
    !!p &&
    p.confirmedRefund === true &&
    typeof p.merchantRefundReference === "string" &&
    !!p.merchantRefundReference.trim() &&
    p.merchantRefundReference.length <= 160;
  if (
    !p ||
    typeof p.orderId !== "string" ||
    !/^uzm_[0-9a-f]{32}$/.test(p.orderId) ||
    (p.confirmRefund !== true && !recordOnly)
  )
    return fail(
      "invalid_request",
      "Send confirmRefund:true, or merchantRefundReference with confirmedRefund:true",
    );
  if (!env.GPTBOT_DRAFTS_DB) return fail("unavailable", "Unavailable", 503);
  const reference = recordOnly ? (p.merchantRefundReference as string).trim() : "";
  const settle = () => {
    waitUntil(
      maintainBilling(env).catch(() =>
        console.warn("gpt_billing_delivery_failed"),
      ),
    );
    // The refund receipt of an order whose sale receipt we printed.
    waitUntil(
      fiscalizeDue(env).catch(() => console.warn("gpt_uzum_fiscal_failed")),
    );
  };
  try {
    await ensureUzumSchema(env.GPTBOT_DRAFTS_DB);
    const store = new UzumStore(env.GPTBOT_DRAFTS_DB, BILLING_ORG);
    const row = await store.order(p.orderId);
    if (!row || !row.external_id || !["paid", "refunded"].includes(row.state))
      return fail("invalid_order", "Order not eligible", 409);
    if (row.state === "refunded")
      return json({ ok: true, state: "refunded", recorded: recordOnly });

    if (recordOnly) {
      // The same record as the admin's «Отметить возврат» (seller-refund.ts).
      const outcome = await recordSellerRefund(env, "uzum", row.id, reference);
      if (!outcome.ok) {
        const [message, status] = RECORD_FAILURES[outcome.code];
        return fail(outcome.code, message, status);
      }
      settle();
      return json({ ok: true, recorded: true, state: "refunded" });
    }
    if (row.api === "merchant")
      return fail(
        "uzum_merchant_refund",
        "Uzum returns an app payment and sends /reverse; record a refund it made otherwise with merchantRefundReference",
        409,
      );

    const cfg = uzumCheckoutConfig(env, row.mode, { settleOnly: true });
    if (!cfg)
      return fail("uzum_not_configured", "Uzum Checkout is not configured", 409);

    // The cart goes with the refund exactly when it went with the payment.
    const cart = row.autofiscal === 1 ? uzumCartParams(env) : null;
    if (row.autofiscal === 1 && !cart)
      return fail("fiscal_not_configured", "GPT_FISCAL_* are incomplete", 409);
    const operationId = await store.refundOperation(row.id, crypto.randomUUID());
    if (!operationId) return fail("invalid_order", "Order not eligible", 409);
    const result = await refund(cfg, row.external_id, row.amount, operationId, cart);
    if (
      !result.ok &&
      !(result.error === "uzum" && result.code === OPERATION_EXISTS)
    )
      return fail("uzum_refund_failed", "Uzum did not accept the refund", 502, {
        uzumCode: result.code ?? null,
        operationId,
      });
    await store.markRefundRequested(row.id);
    // Best effort: settle now if Uzum already reports the refund.
    const settled = await store.reconcileCheckout(env, cfg, row);
    if (settled && settled.result !== "unchanged") settle();
    return json({
      ok: true,
      requested: true,
      operationId,
      state: settled?.row.state ?? row.state,
    });
  } catch {
    return fail("refund_failed", "Check status before retrying", 503);
  }
};

export const onRequest: PagesFunction<BillingEnv> = async () =>
  fail("method_not_allowed", "Use POST", 405);

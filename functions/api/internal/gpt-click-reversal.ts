// POST /api/internal/gpt-click-reversal — returns a paid Click order's money
// through the Click Merchant API (DELETE payment/reversal) and records the
// refund. For the release agent and the runbook, never a button: the admin
// only marks refunds made in the Click cabinet (decision L12,
// gpt-click-refund-record.ts).
// Auth: Authorization: Bearer GPT_BILLING_MAINTENANCE_SECRET.
//
// Body {orderId, version, confirmReversal: true}. `version` is the order's
// gpt_payment_orders.version as the caller saw it: a changed order is a 409,
// so nobody reverses a payment on a stale view. An order already refunded
// answers ok without calling Click, so a repeat is a no-op.
// On error_code 0 the order goes paid -> refunded through the same store
// transition as gpt-click-refund-record.ts (period revoked, outbox
// 'refunded'). Click's conditions: an online card, the current reporting
// month (the previous one only on the 1st), UZCARD may refuse.
// The answer says whether the sale receipt was already printed: Click does not
// document a refund receipt, so then the owner settles it with the accountant.
import {
  BILLING_ORG,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { BillingStore } from "../../lib/gpt-chat/billing-store";
import { maintainBilling } from "../../lib/gpt-chat/billing-maintenance-store";
import {
  clickFailureCode,
  findClickPaymentId,
  reversal,
} from "../../lib/gpt-chat/click-merchant";
import {
  clickMerchantAuth,
  FiscalStore,
  FISCAL_PRINTED,
} from "../../lib/gpt-chat/fiscal-store";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
import { sameSecret } from "../../lib/gpt-chat/payment-protocol";

/** gpt_payment_orders.reason of a refund (the same as the recorded one). */
const REASON_REFUND = 5;

export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  if (
    !env.GPT_BILLING_MAINTENANCE_SECRET ||
    !sameSecret(
      request.headers.get("authorization") || "",
      `Bearer ${env.GPT_BILLING_MAINTENANCE_SECRET}`,
    )
  )
    return fail("forbidden", "Forbidden", 403);
  const body = await readJsonLimited<{
    orderId?: unknown;
    version?: unknown;
    confirmReversal?: unknown;
  }>(request, 1024);
  const p = body.ok ? body.value : null;
  if (
    !p ||
    typeof p.orderId !== "string" ||
    !/^pay_[0-9a-f]{32}$/.test(p.orderId) ||
    typeof p.version !== "number" ||
    !Number.isSafeInteger(p.version) ||
    p.version < 0 ||
    p.confirmReversal !== true
  )
    return fail("invalid_request", "Send orderId, version and confirmReversal:true");
  if (!env.GPTBOT_DRAFTS_DB) return fail("unavailable", "Unavailable", 503);
  const db = env.GPTBOT_DRAFTS_DB;
  try {
    await ensureBillingSchema(db);
    const store = new BillingStore(db, BILLING_ORG);
    const order = await store.order(p.orderId);
    if (!order || order.provider !== "click")
      return fail("invalid_order", "Order not eligible", 409);
    if (order.state === "refunded")
      return json({ ok: true, reversed: false, state: "refunded" });
    if (order.version !== p.version)
      return fail("version_changed", "The order changed; read it again", 409, {
        version: order.version,
        state: order.state,
      });
    if (order.state !== "paid")
      return fail("invalid_order", "Order not eligible", 409, { state: order.state });
    const auth = clickMerchantAuth(env, order.mode);
    if (!auth)
      return fail("click_merchant_not_configured", "Click Merchant API is not configured", 409);
    const fiscal = new FiscalStore(db, BILLING_ORG);
    const receipt = await fiscal.receipt(order.id);
    let paymentId = receipt?.payment_id ?? null;
    if (!paymentId) {
      const found = await findClickPaymentId(auth, order);
      if (!found.ok)
        return fail("click_payment_not_found", "Click did not return the payment", 502, {
          click: clickFailureCode(found),
        });
      paymentId = found.paymentId;
      await fiscal.rememberPaymentId(order.id, paymentId);
    }
    const reversed = await reversal(auth, paymentId);
    if (!reversed.ok)
      return fail("click_reversal_failed", "Click did not reverse the payment", 502, {
        click: clickFailureCode(reversed),
      });
    try {
      await store.transition(order.id, "cancelled", `owner_click_reversal:${paymentId}`, {
        reason: REASON_REFUND,
      });
    } catch {
      // The money went back; only our ledger lags. Click refuses a second
      // reversal, so the record is made with gpt-click-refund-record.
      return fail(
        "record_failed",
        "Click reversed the payment; record it with gpt-click-refund-record",
        503,
        { reversed: true, paymentId },
      );
    }
    waitUntil(
      maintainBilling(env).catch(() =>
        console.warn("gpt_billing_delivery_failed"),
      ),
    );
    return json({
      ok: true,
      reversed: true,
      state: "refunded",
      paymentId,
      receiptPrinted: receipt?.status_code === FISCAL_PRINTED,
    });
  } catch {
    return fail("reversal_failed", "Check the order before retrying", 503);
  }
};

export const onRequest: PagesFunction<BillingEnv> = async () =>
  fail("method_not_allowed", "Use POST", 405);

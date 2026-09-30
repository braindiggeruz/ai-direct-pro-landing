// Owner-only Uzum Checkout refunds (full amount only in this stage).
// Auth: Authorization: Bearer GPT_BILLING_MAINTENANCE_SECRET, like
// gpt-click-refund-record.ts.
//
// 1) {orderId, confirmRefund:true}: asks Uzum to refund the paid order
//    (POST /api/v1/acquiring/refund). The X-Operation-Id is created once and
//    stored BEFORE the call, so a retry repeats the same operation instead of
//    refunding twice. The ledger changes only when Uzum reports REFUNDED
//    (REFUND callback, a status pull right after the call, or "check status").
// 2) {orderId, merchantRefundReference, confirmedRefund:true}: records a
//    refund made in the Uzum cabinet. We pull the status first and record it
//    only if Uzum itself reports the full amount refunded; otherwise 409.
//    Marking a refund Uzum has not confirmed would revoke access while the
//    customer's money was never returned.
// Source: https://developer.uzumbank.uz/redocusaurus/en_checkout.yaml (1.10.3).
import {
  BILLING_ORG,
  billingMode,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { ensureUzumSchema } from "../../lib/gpt-chat/billing-schema";
import { sameSecret } from "../../lib/gpt-chat/payment-protocol";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
import { maintainBilling } from "../../lib/gpt-chat/billing-maintenance-store";
import { uzumApi, uzumCheckoutConfig } from "../../lib/gpt-chat/uzum-config";
import { getOrderStatus, refund } from "../../lib/gpt-chat/uzum-checkout";
import { UzumStore, UZUM_REASON_RETURNED } from "../../lib/gpt-chat/uzum-store";

/** Uzum "Operation already exists": the same X-Operation-Id was accepted before. */
const OPERATION_EXISTS = 3028;

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
  const mode = billingMode(env);
  const api = uzumApi(env);
  // A refund carries the fiscal cart when auto-fiscalization is on: strict.
  const cfg =
    mode && api === "checkout"
      ? uzumCheckoutConfig(env, mode, { settleOnly: recordOnly })
      : null;
  if (!mode || !cfg)
    return fail("uzum_not_configured", "Uzum Checkout is not configured", 409);
  if (!env.GPTBOT_DRAFTS_DB) return fail("unavailable", "Unavailable", 503);
  const settle = () =>
    waitUntil(
      maintainBilling(env).catch(() =>
        console.warn("gpt_billing_delivery_failed"),
      ),
    );
  try {
    await ensureUzumSchema(env.GPTBOT_DRAFTS_DB);
    const store = new UzumStore(env.GPTBOT_DRAFTS_DB, BILLING_ORG);
    const row = await store.order(p.orderId);
    if (
      !row ||
      row.mode !== mode ||
      row.api !== "checkout" ||
      !row.external_id ||
      !["paid", "refunded"].includes(row.state)
    )
      return fail("invalid_order", "Order not eligible", 409);
    if (row.state === "refunded")
      return json({ ok: true, state: "refunded", recorded: recordOnly });

    if (recordOnly) {
      const pulled = await getOrderStatus(cfg, row.external_id);
      if (!pulled.ok)
        return fail("upstream_unavailable", "Uzum status unavailable; retry", 502);
      const s = pulled.status;
      if (
        s.status !== "REFUNDED" ||
        s.refundedAmount !== row.amount ||
        s.merchantOrderId !== row.id ||
        s.amount !== row.amount
      )
        return fail(
          "not_refunded_at_uzum",
          "Uzum does not report this order as fully refunded",
          409,
        );
      await store.billing.transition(
        row.id,
        "cancelled",
        `owner_refund_record:${(p.merchantRefundReference as string).trim()}`,
        { reason: UZUM_REASON_RETURNED },
      );
      settle();
      return json({ ok: true, recorded: true, state: "refunded" });
    }

    const operationId = await store.refundOperation(row.id, crypto.randomUUID());
    if (!operationId) return fail("invalid_order", "Order not eligible", 409);
    const result = await refund(cfg, row.external_id, row.amount, operationId);
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

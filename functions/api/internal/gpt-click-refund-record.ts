import {
  BILLING_ORG,
  billingMode,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { BillingStore } from "../../lib/gpt-chat/billing-store";
import { sameSecret } from "../../lib/gpt-chat/payment-protocol";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
import { maintainBilling } from "../../lib/gpt-chat/billing-maintenance-store";
// Operator reconciliation only. Does not call a refund API or move funds.
// Record this AFTER the merchant dashboard confirms the external refund.
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
    orderId?: string;
    merchantRefundReference?: string;
    confirmedRefund?: boolean;
  }>(request, 2048);
  const p = body.ok ? body.value : null;
  if (
    !p ||
    typeof p.orderId !== "string" ||
    typeof p.merchantRefundReference !== "string" ||
    !p.merchantRefundReference.trim() ||
    p.merchantRefundReference.length > 160 ||
    p.confirmedRefund !== true
  )
    return fail("invalid_request", "Merchant refund confirmation required");
  if (!env.GPTBOT_DRAFTS_DB) return fail("unavailable", "Unavailable", 503);
  try {
    await ensureBillingSchema(env.GPTBOT_DRAFTS_DB);
    const store = new BillingStore(env.GPTBOT_DRAFTS_DB, BILLING_ORG);
    const order = await store.order(p.orderId);
    if (
      !order ||
      order.provider !== "click" ||
      order.mode !== billingMode(env) ||
      !["paid", "refunded"].includes(order.state)
    )
      return fail("invalid_order", "Order not eligible", 409);
    await store.transition(
      order.id,
      "cancelled",
      `owner_refund_record:${p.merchantRefundReference}`,
      { reason: 5 },
    );
    waitUntil(
      maintainBilling(env).catch(() =>
        console.warn("gpt_billing_delivery_failed"),
      ),
    );
    return json({ ok: true, recorded: true });
  } catch {
    return fail("record_failed", "Check status before retrying", 503);
  }
};

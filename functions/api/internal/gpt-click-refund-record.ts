import { type BillingEnv } from "../../lib/gpt-chat/billing-config";
import { internalAuthorized } from "../../lib/gpt-chat/internal-auth";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
import { maintainBilling } from "../../lib/gpt-chat/billing-maintenance-store";
import { recordSellerRefund } from "../../lib/gpt-chat/seller-refund";
// Operator reconciliation only. Does not call a refund API or move funds.
// Record this AFTER the merchant dashboard confirms the external refund.
// The admin's «Отметить возврат» records through the same function
// (seller-refund.ts); the order's mode no longer has to match Click's current
// mode, so a refund made after sales were switched off can still be recorded.
export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  if (!internalAuthorized(request, env.GPT_BILLING_MAINTENANCE_SECRET))
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
    const outcome = await recordSellerRefund(env, "click", p.orderId, p.merchantRefundReference);
    if (!outcome.ok) return fail("invalid_order", "Order not eligible", 409);
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

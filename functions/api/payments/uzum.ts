// Uzum Checkout callbacks (acquiring + receipt), registered by Uzum on our
// terminal as https://gptbot.uz/api/payments/uzum.
//
// Source: https://developer.uzumbank.uz/redocusaurus/en_checkout.yaml (1.10.3):
//   AcquiringCallbackData {orderId, operationState SUCCESS|FAIL, operationType
//   AUTHORIZE|COMPLETE|REFUND|REVERSE|TOP_UP_COMPLETED, orderNumber, ...}
//   ReceiptGeneratedCallbackData {orderId, receiptType, receiptUrl}
//   Answer 200; Uzum retries up to 5 times otherwise.
// The public spec defines NO callback signature. A callback is therefore only
// a hint: we look the order up by both ids, then pull getOrderStatus with our
// own credentials and apply THAT. Unknown or mismatched orders get 200 {}
// without any outbound call, so this endpoint cannot be used to make us call
// Uzum on someone else's behalf.
import {
  BILLING_ORG,
  billingMode,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { ensureUzumSchema } from "../../lib/gpt-chat/billing-schema";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
import { consumeRateLimit, HOUR_MS } from "../../lib/gpt-chat/rate-limit";
import { getClientIp, hashIp } from "../../lib/gpt-chat/hash";
import { resolveConfig } from "../../lib/gpt-chat/config";
import {
  allowedUzumReceipt,
  isUuid,
  uzumApi,
  uzumCheckoutConfig,
} from "../../lib/gpt-chat/uzum-config";
import { getOrderStatus, getReceipts } from "../../lib/gpt-chat/uzum-checkout";
import { UzumStore } from "../../lib/gpt-chat/uzum-store";
import {
  maintainBilling,
  recordServiceAlert,
} from "../../lib/gpt-chat/billing-maintenance-store";

const ORDER_NUMBER = /^uzm_[0-9a-f]{32}$/;
const OPERATION_STATES = ["SUCCESS", "FAIL"];
const OPERATION_TYPES = [
  "AUTHORIZE",
  "COMPLETE",
  "REFUND",
  "REVERSE",
  "TOP_UP_COMPLETED",
];
const RECEIPT_TYPES = ["PURCHASE", "PREPAID", "REFUND"];

function notFound() {
  return fail("not_found", "Not found", 404);
}

export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  // Not configured: indistinguishable from a missing route, and no D1 access.
  const mode = billingMode(env);
  const cfg =
    mode && uzumApi(env) === "checkout"
      ? uzumCheckoutConfig(env, mode, { settleOnly: true })
      : null;
  if (!mode || !cfg) return notFound();
  const body = await readJsonLimited<Record<string, unknown>>(request, 8192);
  const p = body.ok ? body.value : null;
  if (!p || typeof p !== "object" || Array.isArray(p))
    return fail("bad_request", "Invalid callback");
  if (!isUuid(p.orderId)) return fail("bad_request", "Invalid callback");
  const orderId = p.orderId.toLowerCase();
  const receipt = "receiptUrl" in p;
  if (receipt) {
    if (typeof p.receiptType !== "string" || !RECEIPT_TYPES.includes(p.receiptType))
      return fail("bad_request", "Invalid callback");
  } else if (
    typeof p.orderNumber !== "string" ||
    !ORDER_NUMBER.test(p.orderNumber) ||
    typeof p.operationState !== "string" ||
    !OPERATION_STATES.includes(p.operationState) ||
    typeof p.operationType !== "string" ||
    !OPERATION_TYPES.includes(p.operationType)
  )
    return fail("bad_request", "Invalid callback");
  if (!env.GPTBOT_DRAFTS_DB) return fail("unavailable", "Unavailable", 503);
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensureUzumSchema(db);
    const hashedIp = await hashIp(
      getClientIp(request),
      resolveConfig(env).hashSalt,
    );
    const rate = await consumeRateLimit(db, "uzum_callback", hashedIp, {
      limit: 300,
      windowMs: HOUR_MS,
    });
    if (!rate.allowed) return fail("try_later", "Try later", 429);
    const store = new UzumStore(db, BILLING_ORG);
    if (receipt) {
      const row = await store.external(mode, orderId);
      const url = allowedUzumReceipt(p.receiptUrl);
      // Unknown order or a link outside the allowlist: acknowledge, ignore.
      if (!row || row.api !== "checkout" || !url) return json({});
      const pulled = await getReceipts(cfg, orderId);
      if (!pulled.ok) return fail("upstream_unavailable", "Retry", 502);
      const confirmed = pulled.receipts.find(
        (r) => r.receiptUrl === url && r.receiptType === p.receiptType,
      );
      if (confirmed)
        await store.billing.fiscal(
          row.id,
          confirmed.receiptType === "REFUND" ? "CANCEL" : "PERFORM",
          0,
          confirmed.receiptUrl,
        );
      return json({});
    }
    const row = await store.order(p.orderNumber as string);
    if (
      !row ||
      row.mode !== mode ||
      row.api !== "checkout" ||
      row.external_id?.toLowerCase() !== orderId
    )
      return json({});
    const pulled = await getOrderStatus(cfg, orderId);
    if (!pulled.ok) return fail("upstream_unavailable", "Retry", 502);
    const result = await store.applyPulledStatus(env, row, pulled.status);
    if (result !== "unchanged")
      waitUntil(
        maintainBilling(env).catch(() =>
          console.warn("gpt_billing_delivery_failed"),
        ),
      );
    return json({});
  } catch {
    waitUntil(
      recordServiceAlert(env, "uzum_processing")
        .then(() => maintainBilling(env))
        .catch(() => console.warn("gpt_billing_delivery_failed")),
    );
    return fail("processing_failed", "Retry", 500);
  }
};

export const onRequest: PagesFunction<BillingEnv> = async ({ env }) => {
  const mode = billingMode(env);
  return mode &&
    uzumApi(env) === "checkout" &&
    uzumCheckoutConfig(env, mode, { settleOnly: true })
    ? fail("method_not_allowed", "Use POST", 405)
    : notFound();
};

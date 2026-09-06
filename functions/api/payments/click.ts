import {
  BILLING_ORG,
  billingMode,
  providerKey,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { BillingStore } from "../../lib/gpt-chat/billing-store";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { json, readTextLimited } from "../../lib/gpt-chat/http";
import {
  clickSignature,
  parseClickAmount,
  sameSecret,
} from "../../lib/gpt-chat/payment-protocol";
import {
  maintainBilling,
  recordServiceAlert,
} from "../../lib/gpt-chat/billing-maintenance-store";
export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  const mode = billingMode(env);
  const key = mode ? providerKey(env, "click", mode) : "";
  const error = (code: number) =>
    json({
      error: code,
      error_note: (
        {
          [-1]: "SIGN CHECK FAILED!",
          [-2]: "Incorrect parameter amount",
          [-3]: "Action not found",
          [-4]: "Already paid",
          [-5]: "User does not exist",
          [-6]: "Transaction does not exist",
          [-7]: "Failed to update user",
          [-8]: "Error in request from click",
          [-9]: "Transaction cancelled",
        } as Record<number, string>
      )[code],
    });
  if (!key || !mode) return error(-1);
  if (
    !request.headers
      .get("content-type")
      ?.includes("application/x-www-form-urlencoded")
  )
    return error(-8);
  const raw = await readTextLimited(request, 8192);
  if (!raw.ok) return error(-8);
  const form = new URLSearchParams(raw.value);
  const p = Object.fromEntries(form);
  if ([...form.keys()].some((k) => form.getAll(k).length !== 1))
    return error(-8);
  if (p.action !== "0" && p.action !== "1") return error(-3);
  const required = [
    "click_trans_id",
    "click_paydoc_id",
    "service_id",
    "merchant_trans_id",
    "amount",
    "sign_time",
    "sign_string",
    "error",
    ...(p.action === "1" ? ["merchant_prepare_id"] : []),
  ];
  if (
    required.some((k) => !p[k]) ||
    !/^\d+$/.test(p.click_trans_id) ||
    !/^\d+$/.test(p.click_paydoc_id) ||
    !Number.isSafeInteger(Number(p.click_trans_id)) ||
    !/^-?\d+$/.test(p.error)
  )
    return error(-8);
  const service =
    mode === "test" ? env.GPT_CLICK_TEST_SERVICE_ID : env.GPT_CLICK_SERVICE_ID;
  if (
    p.service_id !== service ||
    !sameSecret(p.sign_string.toLowerCase(), clickSignature(p, key))
  )
    return error(-1);
  // Do not add a short sign_time TTL: delayed authentic retries must settle.
  // Invoice expiry applies at Prepare; durable external IDs prevent replay.
  if (!env.GPTBOT_DRAFTS_DB) return error(-7);
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensureBillingSchema(db);
    const store = new BillingStore(db, BILLING_ORG);
    let row = await store.order(p.merchant_trans_id);
    if (!row || row.provider !== "click" || row.mode !== mode) return error(-5);
    if (parseClickAmount(p.amount) !== row.amount || row.currency !== "UZS")
      return error(-2);
    if (row.external_id && row.external_id !== p.click_trans_id)
      return error(-4);
    const existing = await store.external("click", mode, p.click_trans_id);
    if (existing && existing.id !== row.id) return error(-8);
    if (
      p.action === "1" &&
      (String(row.seq) !== p.merchant_prepare_id || !row.external_id)
    )
      return error(-6);
    if (row.state === "paid") return error(-4);
    if (row.state === "cancelled" || row.state === "refunded") return error(-9);
    if (Number(p.error) < 0) {
      await store.transition(
        row.id,
        "cancelled",
        p.action === "0" ? "Prepare" : "Complete",
        { reason: Number(p.error) },
      );
      waitUntil(
        maintainBilling(env).catch(() =>
          console.warn("gpt_billing_delivery_failed"),
        ),
      );
      return error(-9);
    }
    if (Number(p.error) !== 0) return error(-8);
    if (p.action === "0") {
      if (row.expires_at <= Date.now()) return error(-5);
      row = await store.transition(row.id, "prepared", "Prepare", {
        externalId: p.click_trans_id,
        providerTime: Date.now(),
      });
      return json({
        click_trans_id: Number(p.click_trans_id),
        merchant_trans_id: row.id,
        merchant_prepare_id: row.seq,
        error: 0,
        error_note: "Success",
      });
    }
    row = await store.transition(row.id, "paid", "Complete");
    waitUntil(
      maintainBilling(env).catch(() =>
        console.warn("gpt_billing_delivery_failed"),
      ),
    );
    return json({
      click_trans_id: Number(p.click_trans_id),
      merchant_trans_id: row.id,
      merchant_confirm_id: row.seq,
      error: 0,
      error_note: "Success",
    });
  } catch {
    waitUntil(
      recordServiceAlert(env, "click_processing")
        .then(() => maintainBilling(env))
        .catch(() => console.warn("gpt_billing_delivery_failed")),
    );
    return error(-7);
  }
};

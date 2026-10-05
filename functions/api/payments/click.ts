// Click Shop API (Prepare/Complete), registered in the Click cabinet as
// https://gptbot.uz/api/payments/click. Source: docs.click.uz, Shop API.
// Not configured (Click off, outside GPT_PAYMENT_PROVIDERS or without the
// credentials of its mode): a missing route, before the body or D1.
// A live Complete queues the fiscal receipt in the same batch that marks the
// order paid and starts on it once Click has its answer: by default it first
// looks for a receipt Click printed itself (fiscal-store.ts, check first).
import {
  BILLING_ORG,
  clickCredentials,
  providerMode,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { BillingStore } from "../../lib/gpt-chat/billing-store";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { fail, json, readTextLimited } from "../../lib/gpt-chat/http";
import {
  clickSignature,
  parseClickAmount,
  sameSecret,
} from "../../lib/gpt-chat/payment-protocol";
import {
  maintainBilling,
  recordServiceAlert,
} from "../../lib/gpt-chat/billing-maintenance-store";
import { fiscalizeDue } from "../../lib/gpt-chat/fiscal-store";
export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  const mode = providerMode(env, "click");
  const credentials = mode ? clickCredentials(env, mode) : null;
  if (!mode || !credentials) return fail("not_found", "Not found", 404);
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
  if (
    p.service_id !== credentials.serviceId ||
    !sameSecret(p.sign_string.toLowerCase(), clickSignature(p, credentials.secretKey))
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
    // The fiscal receipt, after the answer to Click: Click's own or, after
    // GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES, ours; the maintenance tick
    // carries on from here (fiscal-store.ts).
    waitUntil(
      fiscalizeDue(env).catch(() => console.warn("gpt_click_fiscal_failed")),
    );
    return json({
      click_trans_id: Number(p.click_trans_id),
      merchant_trans_id: row.id,
      merchant_confirm_id: row.seq,
      error: 0,
      error_note: "Success",
    });
  } catch (cause) {
    // A second Prepare with another click_trans_id lost the race for this
    // order: the same answer as when it comes second (-4), and no alert.
    if (cause instanceof Error && cause.message === "conflict") return error(-4);
    waitUntil(
      recordServiceAlert(env, "click_processing")
        .then(() => maintainBilling(env))
        .catch(() => console.warn("gpt_billing_delivery_failed")),
    );
    return error(-7);
  }
};

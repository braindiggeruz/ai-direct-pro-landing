// Click Shop API (Prepare/Complete), registered in the Click cabinet as
// https://gptbot.uz/api/payments/click. Source: docs.click.uz, Shop API.
// Not configured (Click off, outside GPT_PAYMENT_PROVIDERS or without the
// credentials of its mode): a missing route, before the body or D1.
// A live Complete queues the fiscal receipt in the same batch that marks the
// order paid and starts on it once Click has its answer: by default it first
// looks for a receipt Click printed itself (fiscal-store.ts, check first).
// Every refusal is logged as gpt_click_rejected with the action, the code and
// one reason word, never an id or an amount, so a Click that refuses buyers
// (a wrong live secret_key, a wrong Prepare URL) is told apart from buyers who
// left. A signed request about an order we do not have, or with another
// amount, only Click can send: it also records an alert (click_* is urgent,
// one row per code an hour). A bad signature records no alert, only the log
// line: anyone who knows the public service_id can send one, and an alert a
// forger can raise would also hide the real one for the rest of its row.
// None of this changes an answer Click gets.
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
  // The action once it is known to be one ("0" Prepare, "1" Complete).
  let action: "0" | "1" | null = null;
  /** Every refusal, logged: the action, the code and a reason word only. */
  const reject = (code: number, why: string) => {
    console.warn(JSON.stringify({ event: "gpt_click_rejected", action, code, why }));
    return error(code);
  };
  /** An alert in the background: recorded, then delivered by the maintenance pass. */
  const alert = (code: string) =>
    waitUntil(
      recordServiceAlert(env, code)
        .then(() => maintainBilling(env))
        .catch(() => console.warn("gpt_billing_delivery_failed")),
    );
  if (
    !request.headers
      .get("content-type")
      ?.includes("application/x-www-form-urlencoded")
  )
    return reject(-8, "format");
  const raw = await readTextLimited(request, 8192);
  if (!raw.ok) return reject(-8, "format");
  const form = new URLSearchParams(raw.value);
  const p = Object.fromEntries(form);
  if ([...form.keys()].some((k) => form.getAll(k).length !== 1))
    return reject(-8, "format");
  if (p.action !== "0" && p.action !== "1") return reject(-3, "action");
  action = p.action;
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
    return reject(-8, "format");
  if (p.service_id !== credentials.serviceId) return reject(-1, "service");
  if (!sameSecret(p.sign_string.toLowerCase(), clickSignature(p, credentials.secretKey)))
    return reject(-1, "sign");
  // Do not add a short sign_time TTL: delayed authentic retries must settle.
  // Invoice expiry applies at Prepare; durable external IDs prevent replay.
  if (!env.GPTBOT_DRAFTS_DB) return reject(-7, "unavailable");
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensureBillingSchema(db);
    const store = new BillingStore(db, BILLING_ORG);
    let row = await store.order(p.merchant_trans_id);
    if (!row || row.provider !== "click" || row.mode !== mode) {
      alert("click_unknown_order");
      return reject(-5, "unknown_order");
    }
    if (parseClickAmount(p.amount) !== row.amount || row.currency !== "UZS") {
      alert("click_amount_mismatch");
      return reject(-2, "amount");
    }
    if (row.external_id && row.external_id !== p.click_trans_id)
      return reject(-4, "already");
    const existing = await store.external("click", mode, p.click_trans_id);
    if (existing && existing.id !== row.id) return reject(-8, "trans_reused");
    if (
      p.action === "1" &&
      (String(row.seq) !== p.merchant_prepare_id || !row.external_id)
    )
      return reject(-6, "no_prepare");
    if (row.state === "paid") return reject(-4, "already");
    if (row.state === "cancelled" || row.state === "refunded") return reject(-9, "cancelled");
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
      return reject(-9, "click_cancelled");
    }
    if (Number(p.error) !== 0) return reject(-8, "format");
    if (p.action === "0") {
      if (row.expires_at <= Date.now()) return reject(-5, "expired");
      row = await store.transition(row.id, "prepared", "Prepare", {
        externalId: p.click_trans_id,
        // The number the buyer sees in the Click SMS and receipt (support
        // finds a guest's order by it, guest-restore.ts).
        docId: p.click_paydoc_id,
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
    if (cause instanceof Error && cause.message === "conflict") return reject(-4, "already");
    alert("click_processing");
    return reject(-7, "processing");
  }
};

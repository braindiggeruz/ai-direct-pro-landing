// Uzum Bank Merchant API webhooks: payments made inside the Uzum Bank app.
// Uzum POSTs to https://gptbot.uz/api/payments/uzum-merchant/{check|create|
// confirm|reverse|status} (whether Uzum appends these paths to one base URL is
// not stated in the docs; confirm with the Uzum manager).
//
// Source: https://developer.uzumbank.uz/redocusaurus/en_merchant.yaml
// (Merchant API 1.0.0, fetched 2026-09-30; copy in docs/paid-chat/uzum-spec/).
//   Authorization: Basic base64(login:password) on every request.
//   Amounts in tiyin, times in ms. Errors: HTTP 400 {status:'FAILED', errorCode:'<string>'}.
//   A transaction not confirmed within 30 min of /create is FAILED.
//   If /confirm fails or times out, Uzum asks /status up to 10 times.
//
// params.account is the account's permanent payment code (nine digits with a
// Luhn check digit, payment-code-store.ts), a number or a string; the site
// shows it once the visitor accepted the offer (/api/gpt/subscribe). /check
// answers what the app shows; /create opens the order on the fly (plan WP-15,
// U1). A new payment needs Uzum on sale (providerReady: GPT_BILLING_LIVE_READY
// and the rest in live) and the current offer accepted for that code; /confirm,
// /reverse and /status of a transaction already created keep working whatever
// the switches say, as long as Uzum has a mode and credentials.
// U8: /confirm records that it arrived before it marks the order paid; if the
// rest fails, /status (or a repeated /confirm, or the maintenance tick) finishes
// the payment Uzum has already debited instead of failing it.
// The confirm payload's phone number is never logged and never stored.
import {
  BILLING_ORG,
  PRICE_TIYIN,
  providerMode,
  providerReady,
  termsVersion,
  type BillingEnv,
} from "../../../lib/gpt-chat/billing-config";
import { PendingElsewhereError } from "../../../lib/gpt-chat/billing-store";
import { ensureUzumSchema } from "../../../lib/gpt-chat/billing-schema";
import { ensureSchema } from "../../../lib/gpt-chat/schema";
import { json, fail, readJsonLimited } from "../../../lib/gpt-chat/http";
import {
  merchantAuthorized,
  merchantCredentials,
  uzumApi,
  type UzumMerchantCredentials,
} from "../../../lib/gpt-chat/uzum-config";
import { UZUM_PRODUCT_TITLE } from "../../../lib/gpt-chat/uzum-checkout";
import {
  AppPaymentBlockedError,
  appPaymentAction,
  UzumStore,
  UZUM_MERCHANT_CONFIRM_MS,
  UZUM_REASON_RETURNED,
  UZUM_REASON_TIMEOUT,
  type UzumOrder,
} from "../../../lib/gpt-chat/uzum-store";
import {
  PaymentCodeStore,
  paymentCodeFromAccount,
  type PaymentCodeRow,
} from "../../../lib/gpt-chat/payment-code-store";
import { isRehearsalAccount } from "../../../lib/gpt-chat/rehearsal";
import { fiscalizeDue } from "../../../lib/gpt-chat/fiscal-store";
import {
  maintainBilling,
  recordServiceAlert,
} from "../../../lib/gpt-chat/billing-maintenance-store";

const OPERATIONS = ["check", "create", "confirm", "reverse", "status"] as const;
type Operation = (typeof OPERATIONS)[number];
const TRANS_ID = /^[0-9A-Za-z-]{1,64}$/;
/** The op-specific time field of each answer. */
const TIME_FIELD: Record<Operation, string> = {
  check: "timestamp",
  create: "transTime",
  confirm: "confirmTime",
  reverse: "reverseTime",
  status: "transTime",
};
/** Store races that mean "another payment of this account got there first". */
const RACE = new Set(["conflict", "state", "idempotency_conflict"]);

function merchant(
  env: BillingEnv,
): { mode: "test" | "live"; creds: UzumMerchantCredentials } | null {
  const mode = providerMode(env, "uzum");
  if (!mode || uzumApi(env) !== "merchant") return null;
  const creds = merchantCredentials(env, mode);
  return creds ? { mode, creds } : null;
}

/** The code's holder may pay now: the current offer accepted, no rehearsal account in live. */
function payableHolder(
  holder: PaymentCodeRow | null,
  version: string | null,
  mode: "test" | "live",
): (PaymentCodeRow & { terms_url: string; terms_accepted_at: number }) | null {
  if (
    !holder ||
    !version ||
    holder.terms_version !== version ||
    !holder.terms_url ||
    holder.terms_accepted_at === null ||
    (mode === "live" && isRehearsalAccount(holder.user_id))
  )
    return null;
  return holder as PaymentCodeRow & { terms_url: string; terms_accepted_at: number };
}

export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  params,
  waitUntil,
}) => {
  // Not configured: a missing route, before any D1 access.
  const ready = merchant(env);
  if (!ready) return fail("not_found", "Not found", 404);
  const { mode, creds } = ready;
  const now = Date.now();
  const op = OPERATIONS.find((name) => name === params.op);
  let serviceId: number | null = null;
  let transId: string | null = null;
  const failed = (code: string, row?: UzumOrder | null, status = 400) =>
    json(
      {
        serviceId,
        ...(transId ? { transId } : {}),
        status: "FAILED",
        [op ? TIME_FIELD[op] : "timestamp"]: now,
        ...(op === "status" && row
          ? {
              transTime: row.create_time || null,
              confirmTime: row.perform_time || null,
              reverseTime: row.cancel_time || null,
            }
          : {}),
        errorCode: code,
      },
      status,
    );
  // Constant-time Basic auth before the body is parsed or D1 is touched.
  if (!merchantAuthorized(request.headers.get("authorization"), creds))
    return failed("10001");
  if (!op) return failed("10003");
  const body = await readJsonLimited<Record<string, unknown>>(request, 16_384);
  const p = body.ok ? body.value : null;
  if (!p || typeof p !== "object" || Array.isArray(p)) return failed("10002");
  if (typeof p.serviceId === "number" && Number.isSafeInteger(p.serviceId))
    serviceId = p.serviceId;
  if (typeof p.transId === "string" && TRANS_ID.test(p.transId))
    transId = p.transId;
  if (serviceId === null || !Number.isSafeInteger(p.timestamp))
    return failed("10005");
  if (serviceId !== creds.serviceId) return failed("10006");
  const params_ =
    typeof p.params === "object" && p.params !== null && !Array.isArray(p.params)
      ? (p.params as Record<string, unknown>)
      : null;
  if (
    (op === "check" || op === "create") &&
    (params_?.account === undefined || params_.account === null || params_.account === "")
  )
    return failed("10005");
  if (op !== "check" && !transId) return failed("10005");
  if (
    op === "create" &&
    (typeof p.amount !== "number" || !Number.isSafeInteger(p.amount))
  )
    return failed("10005");
  if (!env.GPTBOT_DRAFTS_DB) return failed("99999", null, 500);
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensureUzumSchema(db);
    const store = new UzumStore(db, BILLING_ORG);
    // Owner notice, then the receipt (fiscal-store.ts), after the answer.
    const settle = () => {
      waitUntil(
        maintainBilling(env).catch(() =>
          console.warn("gpt_billing_delivery_failed"),
        ),
      );
      waitUntil(
        fiscalizeDue(env).catch(() => console.warn("gpt_uzum_fiscal_failed")),
      );
    };
    const timedOut = (row: UzumOrder) =>
      row.state === "prepared" &&
      row.confirm_requested_at === null &&
      now - row.create_time > UZUM_MERCHANT_CONFIRM_MS;
    // Only the unconfirmed transaction it read: never one paid in between.
    const expire = (row: UzumOrder) =>
      store.billing.transition(row.id, "cancelled", "timeout", {
        reason: UZUM_REASON_TIMEOUT,
        now,
        from: ["prepared"],
      });
    const reload = async (row: UzumOrder) => (await store.order(row.id))!;

    if (op === "check" || op === "create") {
      const code = paymentCodeFromAccount(params_!.account);
      if (!code) return failed("10007");
      // A paused provider takes no new payment (live: liveReadiness()).
      if (!providerReady(env, "uzum")) return failed("99999");
      const holder = payableHolder(
        await new PaymentCodeStore(db, BILLING_ORG).byCode(code),
        termsVersion(env),
        mode,
      );
      if (!holder) return failed("10007");
      if (op === "check") {
        const open = await store.openInvoices(holder.user_id, mode);
        // Another payment of this account is in progress (U7, U10).
        if (open.some((invoice) => appPaymentAction(invoice) === "block"))
          return failed("10008");
        return json({
          serviceId,
          timestamp: now,
          status: "OK",
          data: {
            account: { value: code },
            product: { value: UZUM_PRODUCT_TITLE },
          },
        });
      }
      if (await store.external(mode, transId!)) return failed("10010");
      if (p.amount !== PRICE_TIYIN) return failed("10011");
      let created: UzumOrder;
      try {
        created = await store.createAppPayment(
          holder.user_id,
          mode,
          transId!,
          Number(p.timestamp),
          {
            version: holder.terms_version!,
            url: holder.terms_url,
            locale: holder.terms_locale === "uz" ? "uz" : "ru",
            acceptedAt: holder.terms_accepted_at,
          },
          now,
        );
      } catch (error) {
        // A half-made order of this transId carries other terms than the code now.
        if (error instanceof Error && error.message === "terms_changed") return failed("10007");
        if (
          error instanceof AppPaymentBlockedError ||
          error instanceof PendingElsewhereError ||
          (error instanceof Error && RACE.has(error.message))
        )
          return failed("10008");
        throw error;
      }
      // Closed or superseded invoices tell the owner; nothing is paid yet.
      waitUntil(
        maintainBilling(env).catch(() =>
          console.warn("gpt_billing_delivery_failed"),
        ),
      );
      return json({
        serviceId,
        transId,
        status: "CREATED",
        transTime: created.create_time,
        amount: created.amount,
      });
    }

    let row = await store.external(mode, transId!);
    if (!row || row.api !== "merchant") return failed("10014");

    if (op === "confirm") {
      if (row.state === "cancelled" || row.state === "refunded")
        return failed("10015", row);
      if (row.state === "paid") return failed("10016", row);
      if (row.state !== "prepared") return failed("10014", row);
      if (timedOut(row)) {
        await expire(row);
        settle();
        return failed("10015", row);
      }
      // Uzum has debited the payer: remember that first (U8).
      await store.requestConfirm(row.id, now);
      await store.billing.transition(row.id, "paid", "uzum_confirm", { now });
      row = await reload(row);
      settle();
      return json({
        serviceId,
        transId,
        status: "CONFIRMED",
        confirmTime: row.perform_time,
        amount: row.amount,
      });
    }

    if (op === "reverse") {
      if (row.state === "cancelled" || row.state === "refunded")
        return failed("10018", row);
      // pending/prepared -> cancelled; paid -> refunded (access revoked, and a
      // refund receipt when the sale receipt was ours to print).
      await store.billing.transition(row.id, "cancelled", "uzum_reverse", {
        reason: UZUM_REASON_RETURNED,
        now,
      });
      row = await reload(row);
      settle();
      return json({
        serviceId,
        transId,
        status: "REVERSED",
        reverseTime: row.cancel_time,
        amount: row.amount,
      });
    }

    // status
    if (row.state === "prepared" && row.confirm_requested_at !== null) {
      // A /confirm arrived and failed half-way: finish it (U8).
      await store.billing.transition(row.id, "paid", "uzum_confirm", { now });
      row = await reload(row);
      settle();
    } else if (timedOut(row)) {
      await expire(row);
      row = await reload(row);
      settle();
    }
    // Cancelled for the 30-minute rule or replaced by a newer app payment
    // (never confirmed): FAILED, as the docs ask; a real reverse or refund:
    // REVERSED.
    if (row.state === "cancelled" && row.reason === UZUM_REASON_TIMEOUT)
      return failed("10015", row);
    const state =
      row.state === "paid"
        ? "CONFIRMED"
        : row.state === "cancelled" || row.state === "refunded"
          ? "REVERSED"
          : row.state === "prepared"
            ? "CREATED"
            : null;
    if (!state) return failed("10014", row);
    return json({
      serviceId,
      transId,
      status: state,
      transTime: row.create_time,
      confirmTime: row.perform_time || null,
      reverseTime: state === "REVERSED" ? row.cancel_time || null : null,
      amount: row.amount,
    });
  } catch {
    waitUntil(
      recordServiceAlert(env, "uzum_processing")
        .then(() => maintainBilling(env))
        .catch(() => console.warn("gpt_billing_delivery_failed")),
    );
    // 5xx makes Uzum ask /status, which reports the true state.
    return failed("99999", null, 500);
  }
};

export const onRequest: PagesFunction<BillingEnv> = async ({ env }) =>
  merchant(env)
    ? json({ status: "FAILED", errorCode: "10003" }, 400)
    : fail("not_found", "Not found", 404);

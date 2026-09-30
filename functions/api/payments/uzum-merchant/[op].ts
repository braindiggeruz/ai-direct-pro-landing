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
// params.account carries our order id (uzm_…). The customer-facing screen
// that shows this code is deferred until the owner confirms this contract.
// The confirm payload's phone number is never logged and never stored.
import {
  BILLING_ORG,
  billingMode,
  type BillingEnv,
} from "../../../lib/gpt-chat/billing-config";
import { ensureUzumSchema } from "../../../lib/gpt-chat/billing-schema";
import { ensureSchema } from "../../../lib/gpt-chat/schema";
import { json, fail, readJsonLimited } from "../../../lib/gpt-chat/http";
import { sameSecret } from "../../../lib/gpt-chat/payment-protocol";
import {
  merchantCredentials,
  uzumApi,
  type UzumMerchantCredentials,
} from "../../../lib/gpt-chat/uzum-config";
import {
  UzumStore,
  UZUM_MERCHANT_CONFIRM_MS,
  UZUM_REASON_RETURNED,
  UZUM_REASON_TIMEOUT,
  type UzumOrder,
} from "../../../lib/gpt-chat/uzum-store";
import {
  maintainBilling,
  recordServiceAlert,
} from "../../../lib/gpt-chat/billing-maintenance-store";

const OPERATIONS = ["check", "create", "confirm", "reverse", "status"] as const;
type Operation = (typeof OPERATIONS)[number];
const ACCOUNT = /^uzm_[0-9a-f]{32}$/;
const TRANS_ID = /^[0-9A-Za-z-]{1,64}$/;
/** The op-specific time field of each answer. */
const TIME_FIELD: Record<Operation, string> = {
  check: "timestamp",
  create: "transTime",
  confirm: "confirmTime",
  reverse: "reverseTime",
  status: "transTime",
};

function merchant(
  env: BillingEnv,
): { mode: "test" | "live"; creds: UzumMerchantCredentials } | null {
  const mode = billingMode(env);
  if (!mode || uzumApi(env) !== "merchant") return null;
  const creds = merchantCredentials(env, mode);
  return creds ? { mode, creds } : null;
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
  if (
    !sameSecret(
      request.headers.get("authorization") || "",
      `Basic ${btoa(`${creds.login}:${creds.password}`)}`,
    )
  )
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
  if ((op === "check" || op === "create") && !params_) return failed("10005");
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
    const settle = () =>
      waitUntil(
        maintainBilling(env).catch(() =>
          console.warn("gpt_billing_delivery_failed"),
        ),
      );
    const timedOut = (row: UzumOrder) =>
      row.state === "prepared" && now - row.create_time > UZUM_MERCHANT_CONFIRM_MS;
    const expire = (row: UzumOrder) =>
      store.billing.transition(row.id, "cancelled", "timeout", {
        reason: UZUM_REASON_TIMEOUT,
        now,
      });

    if (op === "check" || op === "create") {
      const account = params_!.account;
      const row =
        typeof account === "string" && ACCOUNT.test(account)
          ? await store.order(account)
          : null;
      if (!row || row.mode !== mode || row.api !== "merchant")
        return failed("10007");
      if (op === "check") {
        if (row.state === "paid") return failed("10008");
        if (row.state === "cancelled" || row.state === "refunded")
          return failed("10009");
        if (row.state === "prepared") {
          if (!timedOut(row)) return failed("10008");
          await expire(row);
          return failed("10009");
        }
        if (row.expires_at <= now) return failed("10009");
        return json({
          serviceId,
          timestamp: now,
          status: "OK",
          data: { account: { value: row.id } },
        });
      }
      if (p.amount !== row.amount) return failed("10011");
      if (await store.external(mode, transId!)) return failed("10010");
      if (row.external_id && row.external_id !== transId)
        return failed("10008");
      if (row.state === "paid") return failed("10008");
      if (
        row.state === "cancelled" ||
        row.state === "refunded" ||
        row.expires_at <= now
      )
        return failed("10009");
      try {
        await store.billing.transition(row.id, "prepared", "uzum_create", {
          externalId: transId!,
          providerTime: Number(p.timestamp),
          now,
        });
      } catch (error) {
        // A concurrent /create for another transId won the order.
        if (error instanceof Error && ["conflict", "state"].includes(error.message))
          return failed("10008");
        throw error;
      }
      const created = (await store.order(row.id))!;
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
      await store.billing.transition(row.id, "paid", "uzum_confirm", { now });
      row = (await store.order(row.id))!;
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
      // pending/prepared -> cancelled; paid -> refunded (access revoked).
      await store.billing.transition(row.id, "cancelled", "uzum_reverse", {
        reason: UZUM_REASON_RETURNED,
        now,
      });
      row = (await store.order(row.id))!;
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
    if (timedOut(row)) {
      await expire(row);
      settle();
      row = (await store.order(row.id))!;
    }
    // Cancelled for the 30-minute rule (never confirmed): FAILED, as the
    // docs ask; a real reverse or refund: REVERSED.
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

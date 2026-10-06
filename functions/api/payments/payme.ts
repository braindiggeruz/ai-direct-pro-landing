// Payme Merchant API (JSON-RPC 2.0, developer.help.paycom.uz), the cash desk
// "with billing" whose account field is order_id (our pay_… order). Off
// unless GPT_PAYMENT_PROVIDERS lists "payme" (decision L17) and Payme has a
// mode (GPT_BILLING_MODE_PAYME, billing-config.ts) with that mode's key: a
// missing route then, before the body or D1. Test mode answers the sandbox
// (test.paycom.uz) with GPT_PAYME_TEST_KEY; live, Payme's production with
// GPT_PAYME_KEY.
//
// Every answer is HTTP 200 with the request's id (Payme reads any other
// status as -32400). The body (at most 16 kB) is read first so that even a
// refused authorization (-32504) carries the id; authentication still comes
// before the schema bootstrap and every database read.
//
// CheckPerformTransaction sends the receipt `detail` (payme-checkout.ts):
// Payme prints the fiscal receipts of the sale and of its cancellation
// itself and reports them through SetFiscalData. Our receipt queue never
// prints a Payme order. One order is one Payme transaction (a one-time
// account): a second transaction id for it is -31008. Payme's repeats of
// CreateTransaction, PerformTransaction and CancelTransaction get the first
// answer again. A transaction not performed within 12 hours of Payme's own
// `time` is cancelled with reason 4. CancelTransaction after
// PerformTransaction is the money going back (the owner refunds in the Payme
// cabinet): state -2, the pack closes, and the owner hears of it like of a
// Click refund (outbox "refunded", live orders only).
import {
  BILLING_ORG,
  paymeKey,
  providerMode,
  PAYMENT_TTL_MS,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { BillingStore } from "../../lib/gpt-chat/billing-store";
import { ensurePaymeSchema } from "../../lib/gpt-chat/billing-schema";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
import { testReceiptLink } from "../../lib/gpt-chat/fiscal-config";
import {
  paymeCheck,
  paymeState,
  sameSecret,
} from "../../lib/gpt-chat/payment-protocol";
import { paymeReceiptDetail } from "../../lib/gpt-chat/payme-checkout";
import {
  maintainBilling,
  recordServiceAlert,
} from "../../lib/gpt-chat/billing-maintenance-store";

type Localized = { ru: string; uz: string; en: string };

/** What Payme shows the payer for each error (the -31050 range is mandatory). */
const MESSAGES: Record<number, Localized> = {
  [-32504]: {
    ru: "Недостаточно привилегий для выполнения метода",
    uz: "Usulni bajarish uchun huquq yetarli emas",
    en: "Insufficient privileges to perform this method",
  },
  [-32300]: {
    ru: "Метод запроса должен быть POST",
    uz: "So‘rov usuli POST bo‘lishi kerak",
    en: "The request method must be POST",
  },
  [-32700]: {
    ru: "Ошибка разбора JSON",
    uz: "JSON tahlilida xato",
    en: "JSON parse error",
  },
  [-32600]: {
    ru: "Неверный запрос",
    uz: "Noto‘g‘ri so‘rov",
    en: "Invalid request",
  },
  [-32601]: {
    ru: "Метод не найден",
    uz: "Usul topilmadi",
    en: "Method not found",
  },
  [-32400]: {
    ru: "Системная ошибка, повторите позже",
    uz: "Tizim xatosi, keyinroq qayta urinib ko‘ring",
    en: "System error, try again later",
  },
  [-31001]: {
    ru: "Неверная сумма",
    uz: "Noto‘g‘ri summa",
    en: "Incorrect amount",
  },
  [-31050]: {
    ru: "Заказ не найден или его нельзя оплатить",
    uz: "Buyurtma topilmadi yoki uni to‘lab bo‘lmaydi",
    en: "Order not found or cannot be paid",
  },
  [-31008]: {
    ru: "Невозможно выполнить операцию",
    uz: "Amalni bajarib bo‘lmaydi",
    en: "Unable to perform the operation",
  },
  [-31003]: {
    ru: "Транзакция не найдена",
    uz: "Tranzaksiya topilmadi",
    en: "Transaction not found",
  },
};

/** Payme's cancel reasons (1, 2, 3, 4 timeout, 5 money returned, 10 unknown). */
const CANCEL_REASONS: readonly number[] = [1, 2, 3, 4, 5, 10];

/** HTTP Basic with login "Paycom" and the cash desk key, compared in constant time. */
function paymeAuthorized(header: string, key: string): boolean {
  const match = /^\s*Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header);
  if (!match) return false;
  let decoded: string;
  try {
    decoded = atob(match[1]);
  } catch {
    return false;
  }
  return sameSecret(decoded, `Paycom:${key}`);
}

/** A SetFiscalData field kept as text: a short printable string or an integer, else null. */
function fiscalField(value: unknown, max = 128): string | null {
  const text =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  return text && text.length <= max && /^\P{Cc}+$/u.test(text) ? text : null;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const transactionId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128;

export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  const mode = providerMode(env, "payme");
  const key = mode ? paymeKey(env, mode) : "";
  if (!mode || !key) return fail("not_found", "Not found", 404);
  const error = (
    id: number | null,
    code: number,
    data: string | null = null,
    message: Localized | string = MESSAGES[code] ?? MESSAGES[-32400],
  ) => json({ id, error: { code, message, data } });
  // The body first, size-limited and without D1, so every answer carries its id.
  const body = await readJsonLimited<unknown>(request, 16_384);
  const rpc = body.ok ? record(body.value) : null;
  const id = rpc && Number.isSafeInteger(rpc.id) ? (rpc.id as number) : null;
  // Authentication precedes schema bootstrap and every database read.
  if (!paymeAuthorized(request.headers.get("authorization") || "", key))
    return error(id, -32504);
  if (!body.ok) return error(null, -32700);
  const p = rpc ? record(rpc.params) : null;
  if (!rpc || typeof rpc.method !== "string" || !p || id === null)
    return error(id, -32600);
  const method = rpc.method;
  const ok = (result: unknown) => json({ id, result });
  if (!env.GPTBOT_DRAFTS_DB) return error(id, -32400);
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensurePaymeSchema(db);
    const store = new BillingStore(db, BILLING_ORG);
    const now = Date.now();
    if (method === "SetFiscalData") {
      // Errors of this method name the parameter in a plain message.
      const invalid = (name: string) => error(id, -32602, name, `Invalid params: ${name}`);
      const data = record(p.fiscal_data);
      if (!transactionId(p.id)) return invalid("id");
      if (p.type !== "PERFORM" && p.type !== "CANCEL") return invalid("type");
      if (!data) return invalid("fiscal_data");
      if (!Number.isSafeInteger(data.status_code)) return invalid("fiscal_data.status_code");
      const row = await store.external("payme", mode, p.id);
      if (!row) return error(id, -32001, null, "Receipt not found");
      const status = data.status_code as number;
      await store.paymeFiscal(row.id, p.type, {
        transactionId: p.id,
        status,
        // Kept only as an https link; the panel shows only ofd.soliq.uz.
        receiptUrl: testReceiptLink(data.qr_code_url),
        message: fiscalField(data.message, 256),
        receiptId: fiscalField(data.receipt_id),
        terminalId: fiscalField(data.terminal_id),
        fiscalSign: fiscalField(data.fiscal_sign),
        date: fiscalField(data.date, 32),
      });
      // A real receipt Payme could not print: the owner hears of it.
      if (status !== 0 && mode === "live")
        waitUntil(
          recordServiceAlert(env, "fiscalization_failed")
            .then(() => maintainBilling(env))
            .catch(() => console.warn("gpt_billing_delivery_failed")),
        );
      return ok({ success: true });
    }
    if (method === "GetStatement") {
      if (
        !Number.isSafeInteger(p.from) ||
        !Number.isSafeInteger(p.to) ||
        (p.from as number) < 0 ||
        (p.to as number) < (p.from as number)
      )
        return error(id, -32600);
      // By Payme's own creation time, both ends included, in its order;
      // every transaction CreateTransaction accepted, whatever became of it.
      const rows = await store.statement("payme", mode, p.from as number, p.to as number);
      return ok({
        transactions: rows.map((r) => ({
          id: r.external_id,
          time: r.provider_time,
          amount: r.amount,
          account: { order_id: r.id },
          ...paymeCheck(r),
        })),
      });
    }
    if (method === "CheckPerformTransaction" || method === "CreateTransaction") {
      const account = record(p.account);
      const orderId = account?.order_id;
      if (typeof orderId !== "string" || orderId.length > 64)
        return error(id, -31050, "order_id");
      let row = await store.order(orderId);
      if (!row || row.provider !== "payme" || row.mode !== mode)
        return error(id, -31050, "order_id");
      if (!Number.isSafeInteger(p.amount) || p.amount !== row.amount || row.currency !== "UZS")
        return error(id, -31001);
      if (method === "CheckPerformTransaction") {
        if (!["pending", "prepared"].includes(row.state) || row.expires_at <= now)
          return error(id, -31050, "order_id");
        const detail = paymeReceiptDetail(env);
        // Without the fiscal codes Payme could not print the receipt: refuse
        // the payment as a dependency failure (liveReadiness names them).
        if (!detail) {
          waitUntil(
            recordServiceAlert(env, "payme_processing").catch(() =>
              console.warn("gpt_billing_delivery_failed"),
            ),
          );
          return error(id, -32400);
        }
        return ok({ allow: true, detail });
      }
      if (
        !transactionId(p.id) ||
        !Number.isSafeInteger(p.time) ||
        (p.time as number) <= 0 ||
        (p.time as number) > now + 60_000
      )
        return error(id, -32600);
      const time = p.time as number;
      const existing = await store.external("payme", mode, p.id);
      if (existing) {
        // Payme's repeat of this transaction: the first answer while it waits
        // to be performed; -31008 once it left state 1 or ran out of time.
        if (existing.id !== row.id || existing.provider_time !== time) return error(id, -31008);
        if (existing.state !== "prepared") return error(id, -31008);
        if (now - time >= PAYMENT_TTL_MS) {
          await store.transition(existing.id, "cancelled", "timeout", { reason: 4, from: ["prepared"] });
          return error(id, -31008);
        }
        return ok({ create_time: existing.create_time, transaction: existing.id, state: 1 });
      }
      // A new transaction: the order takes one (a one-time account).
      if (row.external_id) return error(id, -31008);
      if (row.state !== "pending" || row.expires_at <= now) return error(id, -31050, "order_id");
      if (now - time >= PAYMENT_TTL_MS) return error(id, -31008);
      row = await store.transition(row.id, "prepared", method, {
        externalId: p.id,
        providerTime: time,
      });
      if (row.state !== "prepared" || row.external_id !== p.id) return error(id, -31008);
      return ok({ create_time: row.create_time, transaction: row.id, state: 1 });
    }
    if (!["PerformTransaction", "CancelTransaction", "CheckTransaction"].includes(method))
      return error(id, -32601, method);
    if (!transactionId(p.id)) return error(id, -32600);
    let row = await store.external("payme", mode, p.id);
    if (!row) return error(id, -31003);
    if (row.state === "prepared" && now - Number(row.provider_time) >= PAYMENT_TTL_MS)
      row = await store.transition(row.id, "cancelled", "timeout", { reason: 4, from: ["prepared"] });
    if (method === "CheckTransaction") return ok(paymeCheck(row));
    if (method === "CancelTransaction") {
      if (!Number.isSafeInteger(p.reason) || !CANCEL_REASONS.includes(p.reason as number))
        return error(id, -32600);
      row = await store.transition(row.id, "cancelled", method, { reason: p.reason as number });
      waitUntil(
        maintainBilling(env).catch(() => console.warn("gpt_billing_delivery_failed")),
      );
      return ok({ transaction: row.id, cancel_time: row.cancel_time, state: paymeState(row) });
    }
    if (row.state !== "prepared" && row.state !== "paid") return error(id, -31008);
    row = await store.transition(row.id, "paid", method);
    waitUntil(
      maintainBilling(env).catch(() => console.warn("gpt_billing_delivery_failed")),
    );
    return ok({ transaction: row.id, perform_time: row.perform_time, state: 2 });
  } catch (e) {
    const conflict = e instanceof Error && ["conflict", "state"].includes(e.message);
    if (!conflict)
      waitUntil(
        recordServiceAlert(env, "payme_processing")
          .then(() => maintainBilling(env))
          .catch(() => console.warn("gpt_billing_delivery_failed")),
      );
    return error(id, conflict ? -31008 : -32400);
  }
};
export const onRequest: PagesFunction<BillingEnv> = async ({ env }) => {
  const mode = providerMode(env, "payme");
  return mode && paymeKey(env, mode)
    ? json({ id: null, error: { code: -32300, message: MESSAGES[-32300], data: null } })
    : fail("not_found", "Not found", 404);
};

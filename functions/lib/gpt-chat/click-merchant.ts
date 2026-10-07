// Click Merchant API client: payment lookup, fiscal receipts and reversal.
// Pure: no D1, no logging.
//
// Source: docs.click.uz, Merchant API, «Подключение и выполнение запросов»
// and «Фискализация товаров и услуг» (read 2026-10-01). Base
// https://api.click.uz/v2/merchant/payment, JSON both ways:
//   GET    /status_by_mti/:service_id/:merchant_trans_id/YYYY-MM-DD
//            -> {error_code, error_note, payment_id, merchant_trans_id}
//   POST   /ofd_data/submit_items {service_id, payment_id, items: [Item],
//            received_ecash, received_cash, received_card} -> {error_code, error_note}
//   GET    /ofd_data/:service_id/:payment_id -> {paymentId, qrCodeURL}
//   DELETE /reversal/:service_id/:payment_id -> {error_code, error_note, payment_id}
// Every request carries `Auth: merchant_user_id:digest:timestamp`, where
// timestamp is UNIX seconds (10 digits) and digest = sha1(timestamp +
// secret_key) in hex. The digest and the secret are never logged. Errors are
// standard HTTP statuses or error_code != 0; Click does not list the codes of
// ofd_data, so anything but error_code 0 is a failure.
//
// The host is fixed to https://api.click.uz: no setting can point the
// credentials anywhere else.
//
// Not confirmed by Click yet (plan §8, question 5; checked on the first live
// payment, docs/paid-chat/CLICK-FISCAL-RU.md): whether payment_id is
// click_trans_id or click_paydoc_id of the Shop API (we look it up by our
// merchant_trans_id instead), whether Amount counts pieces (1) or thousandths,
// received_card for wallet payments, CommissionInfo on a seller's own sale,
// and how a reversal is fiscalized.
import { includedVat, PACK_RECEIPT_NAME, type FiscalParams } from "./fiscal-config";

export const CLICK_MERCHANT_API = "https://api.click.uz/v2/merchant/payment";
export const CLICK_TIMEOUT_MS = 5000;
/** The receipt line (decision L16): the AI pack, a service, one month; ≤ 63 characters. */
export const CLICK_RECEIPT_NAME = PACK_RECEIPT_NAME;
/** One pack per payment. To confirm with Click: pieces, not thousandths. */
export const CLICK_RECEIPT_QUANTITY = 1;
const MAX_RESPONSE_BYTES = 16_384;
/** Tashkent keeps UTC+5 all year; Click dates its payments in local time. */
const TASHKENT_OFFSET_MS = 5 * 3_600_000;

export interface ClickMerchantAuth {
  serviceId: string;
  merchantUserId: string;
  secretKey: string;
}
/**
 * `click` = Click answered with error_code != 0 (code carries it, status the
 * HTTP status it came with: a 5xx with an error_code is still a server error).
 */
export type ClickFailure = {
  ok: false;
  error: "network" | "http" | "shape" | "click";
  code?: number;
  status?: number;
};
export type ClickResult<T> = ({ ok: true } & T) | ClickFailure;
export interface ClickCallOptions {
  /** The clock of the Auth timestamp. */
  now?: number;
  timeoutMs?: number;
}
/** One receipt line of submit_items (the fields Click marks required). */
export interface ClickReceiptItem {
  Name: string;
  SPIC: string;
  PackageCode: string;
  Price: number;
  Amount: number;
  VAT: number;
  VATPercent: number;
  CommissionInfo: { TIN: string } | { PINFL: string };
}

// At most 15 digits: sent back to Click as a JSON number, it must stay exact.
const PAYMENT_ID = /^[1-9]\d{0,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
/** error_code as Click sends it: a number, or the same number as a string. */
function errorCode(value: unknown): number | null {
  const code = typeof value === "string" && /^-?\d{1,9}$/.test(value) ? Number(value) : value;
  return typeof code === "number" && Number.isSafeInteger(code) ? code : null;
}
/** A Click payment id (number or digits) as a decimal string, or null. */
function paymentId(value: unknown): string | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === "string" && PAYMENT_ID.test(text) ? text : null;
}

/** The Auth header: merchant_user_id:sha1(timestamp + secret_key):timestamp. */
export async function clickAuthHeader(
  auth: Pick<ClickMerchantAuth, "merchantUserId" | "secretKey">,
  now = Date.now(),
): Promise<string> {
  const timestamp = String(Math.floor(now / 1000));
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(timestamp + auth.secretKey),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${auth.merchantUserId}:${hex}:${timestamp}`;
}

/** The Tashkent calendar day of a moment, as status_by_mti wants it. */
export function clickPaymentDate(at: number): string {
  return new Date(at + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

async function call(
  auth: ClickMerchantAuth,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body: unknown,
  options: ClickCallOptions,
): Promise<ClickResult<{ reply: Record<string, unknown> }>> {
  let response: Response;
  try {
    response = await fetch(`${CLICK_MERCHANT_API}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Auth: await clickAuthHeader(auth, options.now),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // A redirect is never followed, so the key cannot reach another host.
      // workerd has no "error" mode (only "follow" and "manual"): a 3xx
      // answer comes back as it is and fails below.
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? CLICK_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "network" };
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    return { ok: false, error: "http", code: response.status };
  }
  let reply: Record<string, unknown> | null = null;
  try {
    const declared = Number(response.headers.get("content-length") || "0");
    const text = declared > MAX_RESPONSE_BYTES ? "" : await response.text();
    if (text.length <= MAX_RESPONSE_BYTES) reply = record(JSON.parse(text));
  } catch {
    reply = null;
  }
  const code = errorCode(reply?.error_code);
  if (code !== null && code !== 0)
    return { ok: false, error: "click", code, status: response.status };
  if (!response.ok) return { ok: false, error: "http", code: response.status };
  if (!reply) return { ok: false, error: "shape" };
  return { ok: true, reply };
}

/** Click's payment id for our order (merchant_trans_id) paid on `date` (YYYY-MM-DD). */
export async function paymentIdByMti(
  auth: ClickMerchantAuth,
  merchantTransId: string,
  date: string,
  options: ClickCallOptions = {},
): Promise<ClickResult<{ paymentId: string }>> {
  if (!DATE.test(date)) return { ok: false, error: "shape" };
  const result = await call(
    auth,
    "GET",
    `/status_by_mti/${auth.serviceId}/${encodeURIComponent(merchantTransId)}/${date}`,
    undefined,
    options,
  );
  if (!result.ok) return result;
  const id = paymentId(result.reply.payment_id);
  const echoed = result.reply.merchant_trans_id;
  if (
    errorCode(result.reply.error_code) !== 0 ||
    !id ||
    (echoed !== undefined && String(echoed) !== merchantTransId)
  )
    return { ok: false, error: "shape" };
  return { ok: true, paymentId: id };
}

/**
 * Click's payment id for a paid order: looked up on the Tashkent day of the
 * payment (Complete), then of Prepare when that fell on another day.
 */
export async function findClickPaymentId(
  auth: ClickMerchantAuth,
  order: { id: string; provider_time: number | null; perform_time: number },
  options: ClickCallOptions = {},
): Promise<ClickResult<{ paymentId: string }>> {
  const days = [
    ...new Set(
      [order.perform_time, order.provider_time ?? 0]
        .filter((at) => at > 0)
        .map(clickPaymentDate),
    ),
  ];
  let failure: ClickFailure = { ok: false, error: "shape" };
  for (const day of days) {
    const found = await paymentIdByMti(auth, order.id, day, options);
    if (found.ok) return found;
    failure = found;
  }
  return failure;
}

/** The pack's receipt line: the price includes VAT (fiscal-config.ts). */
export function clickReceiptItem(
  params: FiscalParams,
  tin: string,
  amount: number,
  name: string = CLICK_RECEIPT_NAME,
): ClickReceiptItem {
  return {
    Name: name,
    SPIC: params.ikpu,
    PackageCode: params.packageCode,
    Price: amount,
    Amount: CLICK_RECEIPT_QUANTITY,
    VAT: includedVat(amount, params.vatPercent),
    VATPercent: params.vatPercent,
    // A 9-digit TIN (company) or a 14-digit PINFL (individual entrepreneur).
    CommissionInfo: tin.length === 9 ? { TIN: tin } : { PINFL: tin },
  };
}

/** Sends the receipt of a card payment of `amount` tiyin to the OFD through Click. */
export async function submitItems(
  auth: ClickMerchantAuth,
  payment: string,
  items: ClickReceiptItem[],
  amount: number,
  options: ClickCallOptions = {},
): Promise<ClickResult<object>> {
  if (!PAYMENT_ID.test(payment)) return { ok: false, error: "shape" };
  const result = await call(
    auth,
    "POST",
    "/ofd_data/submit_items",
    {
      service_id: Number(auth.serviceId),
      payment_id: Number(payment),
      items,
      received_ecash: 0,
      received_cash: 0,
      received_card: amount,
    },
    options,
  );
  if (!result.ok) return result;
  return errorCode(result.reply.error_code) === 0 ? { ok: true } : { ok: false, error: "shape" };
}

/**
 * The receipt link Click holds for a payment: the raw qrCodeURL, or null while
 * there is none yet. The caller checks the host (fiscal-config.ts ofdReceiptLink).
 */
export async function ofdData(
  auth: ClickMerchantAuth,
  payment: string,
  options: ClickCallOptions = {},
): Promise<ClickResult<{ qrCodeUrl: string | null }>> {
  if (!PAYMENT_ID.test(payment)) return { ok: false, error: "shape" };
  const result = await call(
    auth,
    "GET",
    `/ofd_data/${auth.serviceId}/${payment}`,
    undefined,
    options,
  );
  if (!result.ok) return result;
  const echoed = result.reply.paymentId;
  if (echoed !== undefined && paymentId(echoed) !== payment)
    return { ok: false, error: "shape" };
  const url = result.reply.qrCodeURL;
  return { ok: true, qrCodeUrl: typeof url === "string" && url.trim() ? url : null };
}

/**
 * Cancels a completed payment and returns the money (Click's conditions: an
 * online card, the current reporting month, UZCARD may refuse).
 */
export async function reversal(
  auth: ClickMerchantAuth,
  payment: string,
  options: ClickCallOptions = {},
): Promise<ClickResult<object>> {
  if (!PAYMENT_ID.test(payment)) return { ok: false, error: "shape" };
  const result = await call(
    auth,
    "DELETE",
    `/reversal/${auth.serviceId}/${payment}`,
    undefined,
    options,
  );
  if (!result.ok) return result;
  const echoed = result.reply.payment_id;
  return errorCode(result.reply.error_code) === 0 &&
    (echoed === undefined || paymentId(echoed) === payment)
    ? { ok: true }
    : { ok: false, error: "shape" };
}

/** A failure as a short code for the ledger: network, http_404, click_-5, shape. */
export function clickFailureCode(failure: ClickFailure): string {
  return failure.error === "http" || failure.error === "click"
    ? `${failure.error}_${failure.code ?? 0}`
    : failure.error;
}

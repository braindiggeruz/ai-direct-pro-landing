// Uzum Fiscalization API client (plan WP-15, U2). Pure: no D1, no logging.
//
// Source: https://developer.uzumbank.uz/redocusaurus/en_fiscalization.yaml
// (Uzum Fiscalization 0.0.2, fetched 2026-09-30; copy in docs/paid-chat/uzum-spec/).
//   POST /v2/receipt         ReceiptData -> 200 {receipt_id, payment_id, receipt_url}
//                                           202 {payment_id?, code, message}: accepted, printed later
//                                           400 {code: 1 invalid spic/package, 2 this payment_id
//                                                and receipt type were sent before}
//   POST /v2/refund_receipt  RefundData  -> 200 {receipt_id, receipt_url} | 202 | 400 | 404 (no sale receipt)
//   GET  /v2/receipt/{operation_id}/receipt_url -> 200 {receipt_url} | 202 not printed yet | 404 unknown
// Every request carries X-API-Key; 403 = key refused, 422 = validation, 500 = server.
// The spec's "Testing" section writes the last path as /v2/receipt_url/{operation_id};
// its path list (above) is authoritative and is what we call.
//
// payment_id is the Uzum payment uuid: the Checkout orderId or the Merchant
// API transId (the spec: "when using the Uzum checkout, this identifier
// corresponds to the order_id"). A refund receipt repeats its sale receipt's
// payment_id, and the sale receipt must have been printed. operation_id is our
// uuid per receipt, stored before the first call and reused on every retry
// (fiscal-store.ts). date_time is the moment of the payment (of the refund
// for a refund receipt) in Tashkent time: the spec wants it within 24 hours
// of the payment confirmation.
// Not sent: phone_number (we never store the payer's phone, so Uzum credits
// no cashback), card_type, ppt_id, commission_info (our own sale, not a
// principal's: map 02 U14) and owner_type (optional; asked of Uzum).
// The base URL has passed the host allowlist in uzum-config.ts; the key is
// never logged or stored.
import { PACK_RECEIPT_NAME, type FiscalParams } from "./fiscal-config";
import { isUuid, type UzumFiscalAccess } from "./uzum-config";

export const UZUM_FISCAL_TIMEOUT_MS = 8000;
/** One pack per payment. */
export const UZUM_RECEIPT_COUNT = 1;
const MAX_RESPONSE_BYTES = 16_384;
/** Tashkent keeps UTC+5 all year. */
const TASHKENT_OFFSET_MS = 5 * 3_600_000;
/** 400 {code: 2}: a receipt of this payment_id and type was sent before. */
const ALREADY_SENT = 2;

export type UzumFiscalKind = "PERFORM" | "CANCEL";
/** `uzum` = a 400 that names its reason in `code`; `not_found` = a 404 of receipt_url. */
export type UzumFiscalFailure = {
  ok: false;
  error: "network" | "http" | "shape" | "uzum" | "not_found";
  code?: number;
};
export type UzumFiscalResult<T> = ({ ok: true } & T) | UzumFiscalFailure;
export interface UzumFiscalCallOptions {
  timeoutMs?: number;
}
/** One line of `items` (the fields the spec marks required). */
export interface UzumReceiptItem {
  product_name: string;
  price: number;
  count: number;
  spic: string;
  package_code: string;
  vat_percent: number;
}
export interface UzumReceiptInput {
  operationId: string;
  /** Null lets Uzum assign one (a sale only); its answer then names it. */
  paymentId: string | null;
  /** The payment (or refund) moment, ms. */
  at: number;
  amount: number;
  params: FiscalParams;
}
/**
 * printed: the link came with the answer. accepted: the receipt is taken
 * and will be printed (202, or 200 without a link). duplicate: Uzum already
 * holds this receipt; ask its link by operation_id.
 */
export type UzumSubmitOutcome = "printed" | "accepted" | "duplicate";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function link(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** A moment as the spec's date_time: Tashkent wall time with its +05:00 offset. */
export function tashkentDateTime(at: number): string {
  return `${new Date(at + TASHKENT_OFFSET_MS).toISOString().slice(0, 19)}+05:00`;
}

/** The pack's receipt line: the price includes VAT, which Uzum derives from vat_percent. */
export function uzumReceiptItem(params: FiscalParams, amount: number): UzumReceiptItem {
  return {
    product_name: PACK_RECEIPT_NAME,
    price: amount,
    count: UZUM_RECEIPT_COUNT,
    spic: params.ikpu,
    package_code: params.packageCode,
    vat_percent: params.vatPercent,
  };
}

/** ReceiptData (sale) or RefundData (refund): a card payment of the whole amount. */
export function uzumReceiptBody(kind: UzumFiscalKind, input: UzumReceiptInput) {
  return {
    ...(input.paymentId ? { payment_id: input.paymentId } : {}),
    operation_id: input.operationId,
    date_time: tashkentDateTime(input.at),
    cash_amount: 0,
    card_amount: input.amount,
    items: [uzumReceiptItem(input.params, input.amount)],
    ...(kind === "PERFORM" ? { receipt_type: 0 } : {}),
  };
}

async function call(
  access: UzumFiscalAccess,
  method: "GET" | "POST",
  path: string,
  body: unknown,
  options: UzumFiscalCallOptions,
): Promise<{ ok: true; status: number; reply: Record<string, unknown> | null } | UzumFiscalFailure> {
  let response: Response;
  try {
    response = await fetch(`${access.baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "X-API-Key": access.apiKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // A redirect is never followed, so the key cannot reach another host.
      // workerd has no "error" mode (only "follow" and "manual"): a 3xx
      // answer comes back as it is and fails below.
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? UZUM_FISCAL_TIMEOUT_MS),
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
  return { ok: true, status: response.status, reply };
}

/** Sends a sale (PERFORM) or refund (CANCEL) receipt. */
export async function submitReceipt(
  access: UzumFiscalAccess,
  kind: UzumFiscalKind,
  body: ReturnType<typeof uzumReceiptBody>,
  options: UzumFiscalCallOptions = {},
): Promise<UzumFiscalResult<{ outcome: UzumSubmitOutcome; receiptUrl: string | null; paymentId: string | null }>> {
  if (!isUuid(body.operation_id) || ("payment_id" in body && !isUuid(body.payment_id)))
    return { ok: false, error: "shape" };
  const result = await call(
    access,
    "POST",
    kind === "PERFORM" ? "/v2/receipt" : "/v2/refund_receipt",
    body,
    options,
  );
  if (!result.ok) return result;
  const { status, reply } = result;
  const echoed = reply?.payment_id;
  const paymentId = isUuid(echoed) ? echoed.toLowerCase() : null;
  if (status === 200 || status === 202) {
    if (!reply) return { ok: false, error: "shape" };
    const receiptUrl = status === 200 ? link(reply.receipt_url) : null;
    return { ok: true, outcome: receiptUrl ? "printed" : "accepted", receiptUrl, paymentId };
  }
  if (status === 400 && typeof reply?.code === "number" && Number.isSafeInteger(reply.code))
    return reply.code === ALREADY_SENT
      ? { ok: true, outcome: "duplicate", receiptUrl: null, paymentId: null }
      : { ok: false, error: "uzum", code: reply.code };
  return { ok: false, error: "http", code: status };
}

/** The receipt's link by our operation_id: a string, or null while Uzum is still printing it. */
export async function fetchReceiptUrl(
  access: UzumFiscalAccess,
  operationId: string,
  options: UzumFiscalCallOptions = {},
): Promise<UzumFiscalResult<{ receiptUrl: string | null }>> {
  if (!isUuid(operationId)) return { ok: false, error: "shape" };
  const result = await call(
    access,
    "GET",
    `/v2/receipt/${operationId.toLowerCase()}/receipt_url`,
    undefined,
    options,
  );
  if (!result.ok) return result;
  if (result.status === 202) return { ok: true, receiptUrl: null };
  if (result.status === 404) return { ok: false, error: "not_found" };
  if (result.status !== 200) return { ok: false, error: "http", code: result.status };
  const receiptUrl = link(result.reply?.receipt_url);
  return receiptUrl ? { ok: true, receiptUrl } : { ok: false, error: "shape" };
}

/** A failure as a short code for the ledger: network, not_found, http_403, uzum_1, shape. */
export function uzumFiscalFailureCode(failure: UzumFiscalFailure): string {
  return failure.error === "http" || failure.error === "uzum"
    ? `${failure.error}_${failure.code ?? 0}`
    : failure.error;
}

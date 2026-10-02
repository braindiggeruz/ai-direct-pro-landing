// Uzum Checkout (web card acquiring) HTTP client. Pure: no D1, no logging.
//
// Source: https://developer.uzumbank.uz/redocusaurus/en_checkout.yaml
// (Uzum Checkout 1.10.3, fetched 2026-09-30; copy in docs/paid-chat/uzum-spec/).
//   POST /api/v1/payment/register        OrderPaymentRequest -> {orderId, paymentRedirectUrl}
//   POST /api/v1/payment/getOrderStatus  {orderId} -> GetOrderStatusResponse
//   POST /api/v1/payment/getReceipts     {orderId} -> {receipts:[{receiptUrl, receiptType}]}
//   POST /api/v1/acquiring/refund        X-Operation-Id (idempotency) + {orderId, amount, cart?}
// Every response is ApiResponse {errorCode (0 = ok), message, result}.
// Headers X-Terminal-Id / X-API-Key authenticate us; they are never logged,
// and the base URL has already passed the host allowlist in uzum-config.ts.
import {
  allowedUzumReceipt,
  allowedUzumRedirect,
  isUuid,
  type UzumCheckoutConfig,
  type UzumFiscal,
} from "./uzum-config";

export const UZUM_TIMEOUT_MS = 8000;
/** Checkout session length we ask for (spec: 600..1800 seconds). */
export const UZUM_SESSION_SECONDS = 1800;
// Product wording on the Uzum payment page and receipt: no "GPT"/"ChatGPT".
export const UZUM_PRODUCT_TITLE = "AI paket 300";
export const UZUM_PAYMENT_DETAILS = "AI paket 300 · gptbot.uz";
export const UZUM_PRODUCT_ID = "ai_paket_300";

export type UzumOrderStatus =
  | "REGISTERED"
  | "AUTHORIZED"
  | "TOP_UP_COMPLETED"
  | "COMPLETED"
  | "REFUNDED"
  | "REVERSED"
  | "DECLINED";
const STATUSES: readonly UzumOrderStatus[] = [
  "REGISTERED",
  "AUTHORIZED",
  "TOP_UP_COMPLETED",
  "COMPLETED",
  "REFUNDED",
  "REVERSED",
  "DECLINED",
];

export interface UzumStatus {
  orderId: string;
  status: UzumOrderStatus;
  merchantOrderId: string;
  amount: number;
  totalAmount: number;
  completedAmount: number;
  refundedAmount: number;
  reversedAmount: number;
}
export interface UzumReceipt {
  receiptUrl: string;
  receiptType: "PURCHASE" | "PREPAID" | "REFUND";
}
/** `uzum` = Uzum answered with errorCode != 0 (code carries it). */
export type UzumFailure = {
  ok: false;
  error: "network" | "http" | "shape" | "uzum";
  code?: number;
};
export type UzumResult<T> = ({ ok: true } & T) | UzumFailure;
/** A shorter timeout for a call that must fit a maintenance slice. */
export interface UzumCallOptions {
  timeoutMs?: number;
}

const MAX_RESPONSE_BYTES = 65_536;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function amount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

async function call(
  cfg: UzumCheckoutConfig,
  path: string,
  body: unknown,
  options: UzumCallOptions & { language?: "ru-RU" | "uz-UZ"; operationId?: string } = {},
): Promise<UzumResult<{ result: Record<string, unknown> }>> {
  let response: Response;
  try {
    response = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Terminal-Id": cfg.terminalId,
        "X-API-Key": cfg.apiKey,
        "Content-Language": options.language ?? "ru-RU",
        ...(options.operationId ? { "X-Operation-Id": options.operationId } : {}),
      },
      body: JSON.stringify(body),
      // A redirect is never followed, so the key cannot reach another host.
      // workerd has no "error" mode (only "follow" and "manual"): a 3xx
      // answer comes back as it is and fails below.
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? UZUM_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "network" };
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    return { ok: false, error: "http", code: response.status };
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    const declared = Number(response.headers.get("content-length") || "0");
    const text = declared > MAX_RESPONSE_BYTES ? "" : await response.text();
    if (text.length <= MAX_RESPONSE_BYTES) parsed = record(JSON.parse(text));
  } catch {
    parsed = null;
  }
  const errorCode = parsed?.errorCode;
  if (typeof errorCode === "number" && Number.isSafeInteger(errorCode) && errorCode !== 0)
    return { ok: false, error: "uzum", code: errorCode };
  if (!response.ok) return { ok: false, error: "http", code: response.status };
  const result = record(parsed?.result);
  if (errorCode !== 0 || !result) return { ok: false, error: "shape" };
  return { ok: true, result };
}

export interface UzumOrderInput {
  id: string;
  amount: number;
  user_id: string;
}

function cart(cfg: UzumCheckoutConfig, order: UzumOrderInput) {
  const fiscal = cfg.fiscal!;
  return {
    cartId: order.id,
    receiptType: "PURCHASE",
    total: order.amount,
    items: [
      {
        title: UZUM_PRODUCT_TITLE,
        productId: UZUM_PRODUCT_ID,
        quantity: 1,
        unitPrice: order.amount,
        total: order.amount,
        receiptParams: {
          spic: fiscal.spic,
          packageCode: fiscal.packageCode,
          vatPercent: fiscal.vatPercent,
        },
      },
    ],
  };
}

/** Exposed for tests: the exact OrderPaymentRequest we send. */
export function registerBody(
  cfg: UzumCheckoutConfig,
  order: UzumOrderInput,
  returnUrl: string,
) {
  return {
    amount: order.amount,
    // Pseudonymous account id (acct_…); no name, phone or Telegram data.
    clientId: order.user_id,
    currency: 860,
    orderNumber: order.id,
    paymentDetails: UZUM_PAYMENT_DETAILS,
    successUrl: returnUrl,
    failureUrl: returnUrl,
    viewType: "REDIRECT",
    paymentParams: { payType: "ONE_STEP" },
    sessionTimeoutSecs: UZUM_SESSION_SECONDS,
    ...(cfg.fiscal ? { merchantParams: { cart: cart(cfg, order) } } : {}),
  };
}

export async function registerPayment(
  cfg: UzumCheckoutConfig,
  order: UzumOrderInput,
  locale: "ru" | "uz",
  returnUrl: string,
): Promise<UzumResult<{ orderId: string; redirectUrl: string }>> {
  const reply = await call(
    cfg,
    "/api/v1/payment/register",
    registerBody(cfg, order, returnUrl),
    { language: locale === "uz" ? "uz-UZ" : "ru-RU" },
  );
  if (!reply.ok) return reply;
  const orderId = reply.result.orderId;
  const redirectUrl = allowedUzumRedirect(reply.result.paymentRedirectUrl);
  if (!isUuid(orderId) || !redirectUrl) return { ok: false, error: "shape" };
  return { ok: true, orderId: orderId.toLowerCase(), redirectUrl };
}

export async function getOrderStatus(
  cfg: UzumCheckoutConfig,
  orderId: string,
  options: UzumCallOptions = {},
): Promise<UzumResult<{ status: UzumStatus }>> {
  const reply = await call(cfg, "/api/v1/payment/getOrderStatus", { orderId }, options);
  if (!reply.ok) return reply;
  const r = reply.result;
  if (
    typeof r.orderId !== "string" ||
    r.orderId.toLowerCase() !== orderId.toLowerCase() ||
    !STATUSES.includes(r.status as UzumOrderStatus) ||
    typeof r.merchantOrderId !== "string" ||
    !amount(r.amount) ||
    !amount(r.totalAmount) ||
    !amount(r.completedAmount) ||
    !amount(r.refundedAmount) ||
    !amount(r.reversedAmount)
  )
    return { ok: false, error: "shape" };
  return {
    ok: true,
    status: {
      orderId: r.orderId.toLowerCase(),
      status: r.status as UzumOrderStatus,
      merchantOrderId: r.merchantOrderId,
      amount: r.amount,
      totalAmount: r.totalAmount,
      completedAmount: r.completedAmount,
      refundedAmount: r.refundedAmount,
      reversedAmount: r.reversedAmount,
    },
  };
}

export async function getReceipts(
  cfg: UzumCheckoutConfig,
  orderId: string,
  options: UzumCallOptions = {},
): Promise<UzumResult<{ receipts: UzumReceipt[] }>> {
  const reply = await call(cfg, "/api/v1/payment/getReceipts", { orderId }, options);
  if (!reply.ok) return reply;
  const list = reply.result.receipts;
  if (!Array.isArray(list)) return { ok: false, error: "shape" };
  const receipts: UzumReceipt[] = [];
  for (const item of list.slice(0, 20)) {
    const entry = record(item);
    const url = allowedUzumReceipt(entry?.receiptUrl);
    const type = entry?.receiptType;
    if (url && (type === "PURCHASE" || type === "PREPAID" || type === "REFUND"))
      receipts.push({ receiptUrl: url, receiptType: type });
  }
  return { ok: true, receipts };
}

/**
 * Full refund. `operationId` is the X-Operation-Id idempotency key: persist it
 * before calling and reuse it on every retry. `fiscal` is the cart of an
 * order that Uzum auto-fiscalized: its refund must carry the cart (Uzum error
 * 3045 otherwise), and the refund of any other order must not (3058).
 */
export async function refund(
  cfg: UzumCheckoutConfig,
  orderId: string,
  value: number,
  operationId: string,
  fiscal: UzumFiscal | null,
): Promise<UzumResult<{ operationId: string }>> {
  const reply = await call(
    cfg,
    "/api/v1/acquiring/refund",
    {
      orderId,
      amount: value,
      ...(fiscal
        ? {
            cart: {
              total: value,
              items: [
                {
                  productId: UZUM_PRODUCT_ID,
                  quantity: 1,
                  receiptParams: {
                    spic: fiscal.spic,
                    packageCode: fiscal.packageCode,
                    vatPercent: fiscal.vatPercent,
                  },
                },
              ],
            },
          }
        : {}),
    },
    { operationId },
  );
  if (!reply.ok) return reply;
  const id = reply.result.operationId;
  return isUuid(id)
    ? { ok: true, operationId: id }
    : { ok: false, error: "shape" };
}

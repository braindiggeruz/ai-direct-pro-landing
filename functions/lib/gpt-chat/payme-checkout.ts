// Payme for the AI pack (developer.help.paycom.uz): the checkout page the
// visitor is sent to, and the receipt `detail` Payme prints the fiscal
// receipts from. The Merchant API callbacks are functions/api/payments/payme.ts.
//
// Checkout (payment initialization, GET): the payer opens
//   <base>/<base64("m=<cash desk>;ac.order_id=<pay_…>;a=<tiyin>;c=<return URL>;l=<ru|uz>;ct=<ms>")>
// on https://checkout.paycom.uz (live) or https://test.paycom.uz (the sandbox,
// test mode). Values never contain ";" (the separator). Payme then calls the
// Merchant API: CheckPerformTransaction, CreateTransaction, PerformTransaction.
//
// Receipt: Payme fiscalizes the sale and its cancellation itself, from the
// `detail` of CheckPerformTransaction (one line: the AI pack, a service, the
// shared GPT_FISCAL_* codes, VAT included in the price). Our own receipt
// queue (fiscal-store.ts) never prints a Payme order.
import { PRICE_TIYIN, type BillingEnv, type BillingMode, paymeMerchantId } from "./billing-config";
import { fiscalParams, PACK_RECEIPT_NAME } from "./fiscal-config";

/** Payme's payment page per mode: the sandbox for test, checkout for live. */
export const PAYME_CHECKOUT_BASE: Record<BillingMode, string> = {
  test: "https://test.paycom.uz",
  live: "https://checkout.paycom.uz",
};

/** How long Payme shows its success screen before it sends the payer back, in ms. */
export const PAYME_RETURN_DELAY_MS = 15_000;

/**
 * The Payme page for `orderId`, or null without a valid cash desk id or with
 * a value that would break Payme's `key=value;…` format.
 */
export function paymeCheckoutUrl(
  env: BillingEnv,
  mode: BillingMode,
  orderId: string,
  locale: "ru" | "uz",
  back: string,
): string | null {
  const merchant = paymeMerchantId(env);
  if (!merchant || /[;\s]/.test(orderId) || /[;\s]/.test(back)) return null;
  const params = [
    `m=${merchant}`,
    `ac.order_id=${orderId}`,
    `a=${PRICE_TIYIN}`,
    `c=${back}`,
    `l=${locale}`,
    `ct=${PAYME_RETURN_DELAY_MS}`,
  ].join(";");
  return `${PAYME_CHECKOUT_BASE[mode]}/${btoa(params)}`;
}

/** One line of a Payme receipt (CheckPerformTransaction `detail.items`). */
export interface PaymeReceiptItem {
  title: string;
  /** Per unit, in tiyin, VAT included. */
  price: number;
  count: number;
  /** IKPU (MXIK), 17 digits. */
  code: string;
  package_code: string;
  vat_percent: number;
}

export interface PaymeReceiptDetail {
  /** 0: a sale. */
  receipt_type: 0;
  items: PaymeReceiptItem[];
}

/**
 * The fiscal `detail` of the AI pack: one line whose price times count is the
 * order amount, or null while a fiscal setting is missing or invalid (the
 * caller answers -32400 then, and liveReadiness() names the setting).
 */
export function paymeReceiptDetail(env: BillingEnv): PaymeReceiptDetail | null {
  const fiscal = fiscalParams(env);
  if (!fiscal) return null;
  return {
    receipt_type: 0,
    items: [
      {
        title: PACK_RECEIPT_NAME,
        price: PRICE_TIYIN,
        count: 1,
        code: fiscal.ikpu,
        package_code: fiscal.packageCode,
        vat_percent: fiscal.vatPercent,
      },
    ],
  };
}

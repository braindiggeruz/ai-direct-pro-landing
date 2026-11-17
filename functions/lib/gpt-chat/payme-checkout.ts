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
import { packOfOrder } from "./packs";

/** Payme's payment page per mode: the sandbox for test, checkout for live. */
export const PAYME_CHECKOUT_BASE: Record<BillingMode, string> = {
  test: "https://test.paycom.uz",
  live: "https://checkout.paycom.uz",
};

/** How long Payme shows its success screen before it sends the payer back, in ms. */
export const PAYME_RETURN_DELAY_MS = 15_000;

/**
 * The pairs in the order Payme's page has always been given them, then the
 * other orders with the cash desk first (lexicographic, so the choice is the
 * same every time). Payme reads the pairs by key, in any order.
 */
function* pairOrders(pairs: string[]): Generator<string[]> {
  const [first, ...rest] = pairs;
  const permute = function* (items: string[], head: string[] = []): Generator<string[]> {
    if (!items.length) yield head;
    for (const [index, item] of items.entries()) yield* permute(items.filter((_, other) => other !== index), [...head, item]);
  };
  for (const order of permute(rest)) yield [first, ...order];
}

/**
 * The Payme page for `orderId`, or null without a valid cash desk id or with
 * a value that would break Payme's `key=value;…` format.
 *
 * The page is one path segment, the base64 of the pairs. Standard base64 has
 * "/" for the six bits 111111, and the only character of these pairs that
 * makes them is the "?" of the return address (`?pay=return`) when it is the
 * third byte of a triplet: on five of the chat's secondary pages (and any page
 * added later) the segment then carried a "/" that Payme's router may read as
 * a path separator. The pairs go in their classic order unless that happens
 * (every page that worked keeps its link, byte for byte); otherwise the next
 * order without a "/". Only the order changes: merchant, account field,
 * amount, return address, language and delay are the same.
 */
export function paymeCheckoutUrl(
  env: BillingEnv,
  mode: BillingMode,
  orderId: string,
  locale: "ru" | "uz",
  back: string,
  /** The order's own amount in tiyin (its row); the monthly pack's when the caller has only the id. */
  amountTiyin: number = PRICE_TIYIN,
): string | null {
  const merchant = paymeMerchantId(env);
  if (!merchant || /[;\s]/.test(orderId) || /[;\s]/.test(back)) return null;
  if (!Number.isSafeInteger(amountTiyin) || amountTiyin <= 0) return null;
  const pairs = [
    `m=${merchant}`,
    `ac.order_id=${orderId}`,
    `a=${amountTiyin}`,
    `c=${back}`,
    `l=${locale}`,
    `ct=${PAYME_RETURN_DELAY_MS}`,
  ];
  for (const order of pairOrders(pairs)) {
    const segment = btoa(order.join(";"));
    if (!segment.includes("/")) return `${PAYME_CHECKOUT_BASE[mode]}/${segment}`;
  }
  return null;
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
 * The fiscal `detail` of an order: one line, named after the pack the order
 * bought (packs.ts, by its id), whose price times count is the order's own
 * amount; or null while a fiscal setting is missing or invalid (the caller
 * answers -32400 then, and liveReadiness() names the setting), or when the
 * row's amount is not its pack's (never printed: the sums would not agree).
 * Without an order it is the monthly pack's line, as liveReadiness reads it.
 */
export function paymeReceiptDetail(
  env: BillingEnv,
  order?: { id: string; amount: number },
): PaymeReceiptDetail | null {
  const fiscal = fiscalParams(env);
  if (!fiscal) return null;
  const pack = order ? packOfOrder(order.id) : null;
  if (order && order.amount !== pack!.amountTiyin) return null;
  return {
    receipt_type: 0,
    items: [
      {
        title: pack ? pack.receiptName : PACK_RECEIPT_NAME,
        price: order ? order.amount : PRICE_TIYIN,
        count: 1,
        code: fiscal.ikpu,
        package_code: fiscal.packageCode,
        vat_percent: fiscal.vatPercent,
      },
    ],
  };
}

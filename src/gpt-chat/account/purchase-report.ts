// What the page reports about a payment: a purchase once per order, and the
// Meta checkout event. In the lazy part chat-pay, not on the start bundle and
// not in the window's own part: it runs once per payment, and chat-pay is
// fetched as the window opens.
import type { AccountView } from '../types';
import type { CheckoutOutcome, CheckoutWatch } from '../checkout';
import { EV, initMetaChatPixel, safePayload } from '../analytics';

const REPORTED_KEY = 'gptchat_purchases';

/** What the page reports once the watched payment ends. */
export interface CheckoutReport {
  /** GA4 checkout_result. */
  result: { provider: string; status: CheckoutOutcome; mode: string };
  /** GA4 purchase: real money paid, the pack's price and size as the server states them. */
  purchase: { transactionId: string; value: number; itemId: string; itemName: string; provider: string } | null;
}

export function checkoutReport(account: AccountView | null, watch: CheckoutWatch, outcome: CheckoutOutcome): CheckoutReport {
  const mode = account?.mode || 'unavailable';
  const provider = account?.payment?.provider ?? watch.provider ?? 'unknown';
  const payment = account?.payment;
  const pack = account?.pack;
  return {
    result: { provider, status: outcome, mode },
    purchase: outcome === 'paid' && mode === 'live' && payment?.state === 'paid' && pack
      ? {
          transactionId: payment.id,
          // The order's own price and size (a 3-day pack is not the pack on offer); an older server names only the pack.
          value: payment.priceUzs ?? pack.priceUzs,
          itemId: `ai_paket_${payment.messageLimit ?? pack.messageLimit}`,
          itemName: `AI paket ${payment.messageLimit ?? pack.messageLimit}`,
          provider,
        }
      : null,
  };
}

/**
 * True the first time this browser reports `transactionId` as a purchase:
 * GA4 counts a purchase once, whatever reloads and second tabs do.
 */
export function firstReport(transactionId: string): boolean {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(REPORTED_KEY) || '[]');
    const reported = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    if (reported.includes(transactionId)) return false;
    localStorage.setItem(REPORTED_KEY, JSON.stringify([transactionId, ...reported].slice(0, 20)));
    return true;
  } catch {
    // Unknown, and so not sent: a lost purchase event beats a doubled one.
    return false;
  }
}

/**
 * GA4's ecommerce `purchase` for a pack the server confirmed (plan WP-17,
 * map 03 §8.1). Not through track(): its `items` are a list, which the
 * catalogue's flat parameters drop. The order id is not personal data; the
 * caller sends each one once (firstReport).
 */
export function trackPurchase(order: { transactionId: string; value: number; itemId: string; itemName: string; provider: string }): void {
  try {
    initMetaChatPixel();
    const w = window as unknown as {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
      fbq?: (...args: unknown[]) => void;
    };
    const ecommerce = {
      transaction_id: order.transactionId,
      value: order.value,
      currency: 'UZS',
      items: [{ item_id: order.itemId, item_name: order.itemName, price: order.value, quantity: 1 }],
    };
    const payload = safePayload({ provider: order.provider });
    if (typeof w.gtag === 'function') w.gtag('event', EV.purchase, { ...payload, ...ecommerce });
    else {
      if (!w.dataLayer) w.dataLayer = [];
      // GTM reads ecommerce from its own key; clear the previous one first.
      w.dataLayer.push({ ecommerce: null });
      w.dataLayer.push({ event: EV.purchase, ...payload, ecommerce });
    }
    // This is called only after the server confirms a live, paid order, and
    // firstReport() has deduplicated that order in this browser.
    if (typeof w.fbq === 'function') w.fbq('track', 'Purchase', {
      value: order.value,
      currency: 'UZS',
      content_ids: [order.itemId],
      content_type: 'product',
    }, { eventID: order.transactionId });
  } catch {
    /* noop */
  }
}

/** A new live provider invoice, not a resumed or merely opened payment panel. */
export function trackMetaCheckout(order: { transactionId: string; value: number; itemId: string }): void {
  try {
    initMetaChatPixel();
    const w = window as unknown as { fbq?: (...args: unknown[]) => void };
    if (typeof w.fbq === 'function') w.fbq('track', 'InitiateCheckout', {
      value: order.value,
      currency: 'UZS',
      content_ids: [order.itemId],
      content_type: 'product',
    }, { eventID: `checkout_${order.transactionId}` });
  } catch {
    /* noop */
  }
}

/** A watched payment ended paid: revenue for real money only, once per order on this browser. */
export function reportPurchase(account: AccountView | null, watch: CheckoutWatch): void {
  const { purchase } = checkoutReport(account, watch, 'paid');
  if (purchase && firstReport(purchase.transactionId)) trackPurchase(purchase);
}

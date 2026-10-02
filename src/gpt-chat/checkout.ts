// The payment this browser went to make (plan WP-17, map 03 §3.4): what the
// pack window needs to say "checking your payment" when the visitor comes back
// from Click or Uzum, from the Uzum Bank app, or after a reload. It is kept in
// localStorage for CHECKOUT_TTL_MS, so the Back button and a new tab find it
// too: the provider, when it began on this browser's clock and which order it
// is. No amount, card or account data. On the chat's start bundle, because the
// window opens by itself on the way back (AiAccountPanel).
import type { AccountView, PaymentProvider } from './types';

/**
 * redirect: off to the provider's page; code: the Uzum Bank app code is on
 * screen; test: a rehearsal order, no page opens; status: the server answered
 * with an order that already ended.
 */
export type CheckoutFlow = 'redirect' | 'code' | 'test' | 'status';

export interface CheckoutWatch {
  /** null: back with ?pay=return while nothing was stored (storage blocked). */
  provider: PaymentProvider | null;
  flow: CheckoutFlow;
  /** When the browser began waiting, on its own clock (epoch ms). */
  at: number;
  /** The order the server opened (subscribe's attemptId); null when unknown. */
  attemptId: string | null;
  /** App code: the newest payment before it, to tell apart the one Uzum opens. */
  before: string | null;
}

/** How the watched payment ended for this page. */
export type CheckoutOutcome = 'paid' | 'cancelled' | 'pending';

const CHECKOUT_KEY = 'gptchat_checkout';
const REPORTED_KEY = 'gptchat_purchases';
/** A trip to the payment page counts as "just paid" this long. */
export const CHECKOUT_TTL_MS = 30 * 60_000;
/** Ask every 3 s for the first 2 minutes, then every 15 s, for 10 minutes in all. */
export const CHECKOUT_FAST_MS = 3_000;
export const CHECKOUT_FAST_FOR_MS = 120_000;
export const CHECKOUT_SLOW_MS = 15_000;
export const CHECKOUT_WATCH_MS = 600_000;
/** Orders: pay_ (Click, Payme) or uzm_ (Uzum) and 32 hex (billing-store.ts). */
const ORDER_ID = /^(pay|uzm)_[0-9a-f]{32}$/;
const PROVIDERS: readonly string[] = ['click', 'uzum', 'payme'];
const FLOWS: readonly string[] = ['redirect', 'code', 'test', 'status'];

/** An order id as the server writes it (subscribe's attemptId, the view's payment id), or null. */
export function orderId(value: unknown): string | null {
  return typeof value === 'string' && ORDER_ID.test(value) ? value : null;
}

/** The wait before the next look at the account, `elapsed` ms into the watch; null once it is over. */
export function checkoutPollDelay(elapsed: number): number | null {
  if (elapsed < CHECKOUT_FAST_FOR_MS) return CHECKOUT_FAST_MS;
  return elapsed < CHECKOUT_WATCH_MS ? CHECKOUT_SLOW_MS : null;
}

/**
 * How the watched payment ended, as the account view says: paid, or
 * cancelled (refused, expired or refunded); null while it has not ended. The
 * view names the account's newest order, so the watched one is the order the
 * server opened, or for an app code any order newer than the one before it.
 */
export function settledCheckout(account: AccountView | null, watch: CheckoutWatch): 'paid' | 'cancelled' | null {
  const payment = account?.payment;
  if (!payment) return null;
  if (watch.attemptId ? payment.id !== watch.attemptId : watch.flow === 'code' && payment.id === watch.before)
    return null;
  if (payment.state === 'paid') return 'paid';
  return payment.state === 'cancelled' || payment.state === 'refunded' ? 'cancelled' : null;
}

/** What the page reports once the watched payment ends (AiAccountPanel). */
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
          value: pack.priceUzs,
          itemId: `ai_paket_${pack.messageLimit}`,
          itemName: `AI paket ${pack.messageLimit}`,
          provider,
        }
      : null,
  };
}

function validWatch(value: unknown): value is CheckoutWatch {
  if (!value || typeof value !== 'object') return false;
  const watch = value as CheckoutWatch;
  return (watch.provider === null || PROVIDERS.includes(watch.provider))
    && FLOWS.includes(watch.flow)
    && Number.isSafeInteger(watch.at) && watch.at > 0
    && (watch.attemptId === null || orderId(watch.attemptId) !== null)
    && (watch.before === null || orderId(watch.before) !== null);
}

/** The payment this browser went to make, while it is recent. */
export function loadCheckout(now = Date.now()): CheckoutWatch | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || 'null');
    return validWatch(value) && now - value.at >= 0 && now - value.at < CHECKOUT_TTL_MS ? value : null;
  } catch {
    return null;
  }
}

export function saveCheckout(watch: CheckoutWatch | null): void {
  try {
    if (watch) localStorage.setItem(CHECKOUT_KEY, JSON.stringify(watch));
    else localStorage.removeItem(CHECKOUT_KEY);
  } catch {
    /* storage blocked: the page still watches until it is closed */
  }
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

// The closed lists behind the checkout steps the chat counts between the tap
// on «Оплатить» and the provider's page (chat CRO 2026-11-17, P1). One rule
// for both sides: the server (functions/lib/gpt-chat/ui-event-store.ts)
// accepts a detail only as a walk through these lists, and the browser
// (src/gpt-chat/account/pay-detail.ts) builds it from them. A detail is
// dot-joined segments: [reason.]provider.time.app.os. Nothing in it comes from
// the visitor: no user agent, order id or text, only the buckets a browser
// puts itself into.

export const CHECKOUT_PROVIDERS = ['click', 'uzum', 'payme'] as const;
/** Elapsed time: under 1 s, 1–3 s, 3–8 s, over 8 s. */
export const CHECKOUT_BUCKETS = ['lt1', 's1_3', 's3_8', 'gt8'] as const;
/** The in-app browser the page runs in, or none. */
export const CHECKOUT_APPS = ['telegram', 'instagram', 'facebook', 'yandex', 'none'] as const;
export const CHECKOUT_OS = ['android', 'ios', 'desktop'] as const;
/** Why a checkout stopped before the provider's page: the browser's own checks, or the server's refusal. */
export const ABORT_REASONS = [
  'stale', 'bad_url', 'cookies', 'terms_changed', 'pending_elsewhere', 'invoice_in_progress', 'try_later', 'unavailable', 'other',
] as const;
/** How the visitor came back from the provider's page: with no payment, or with the order cancelled. */
export const RETURN_OUTCOMES = ['none', 'cancelled'] as const;

export type CheckoutProvider = (typeof CHECKOUT_PROVIDERS)[number];
export type CheckoutBucket = (typeof CHECKOUT_BUCKETS)[number];
export type CheckoutApp = (typeof CHECKOUT_APPS)[number];
export type CheckoutOs = (typeof CHECKOUT_OS)[number];
export type AbortReason = (typeof ABORT_REASONS)[number];
export type ReturnOutcome = (typeof RETURN_OUTCOMES)[number];
/** provider.time.app.os */
export type CheckoutTail = `${CheckoutProvider | 'unknown'}.${CheckoutBucket}.${CheckoutApp}.${CheckoutOs}`;

/** Every `a.b` from two lists. */
export function cross<A extends string, B extends string>(first: readonly A[], second: readonly B[]): `${A}.${B}`[] {
  return first.flatMap((a) => second.map((b) => `${a}.${b}` as const));
}

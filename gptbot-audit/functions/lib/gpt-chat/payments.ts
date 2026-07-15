// Payment provider abstraction — SCAFFOLD ONLY for MVP.
//
// No live charge is ever created here. When PAYMENT_PROVIDER is unset we
// return "manual" mode so the UI shows "оплата скоро — оставьте заявку".
// Adapter points for Lemon Squeezy / Paddle / Global Pay / Freedom Pay are
// stubbed with clear TODOs; wiring a real checkout is an MVP3 task that
// needs the provider account + keys. We NEVER fake a successful subscription.
import type { Env } from '../../_types';

export type PaymentProvider = 'lemonsqueezy' | 'paddle' | 'globalpay' | 'freedompay' | '';

export interface CheckoutResult {
  mode: 'manual' | 'checkout';
  /** checkout URL when a provider is configured; absent in manual mode. */
  checkoutUrl?: string;
  provider: PaymentProvider;
  message: string;
}

export function activeProvider(env: Env): PaymentProvider {
  const p = (env.PAYMENT_PROVIDER || '').toLowerCase().trim();
  if (p === 'lemonsqueezy' || p === 'paddle' || p === 'globalpay' || p === 'freedompay') return p;
  return '';
}

/**
 * Create (or defer) a checkout for a plan. Returns manual mode unless a
 * provider adapter is fully wired. Real adapters must be added before any
 * money moves — intentionally left as explicit stubs.
 */
export async function createCheckout(env: Env, plan: string, _attemptId: string): Promise<CheckoutResult> {
  const provider = activeProvider(env);
  const manual: CheckoutResult = {
    mode: 'manual',
    provider,
    message:
      'Оплата скоро будет доступна. Оставьте заявку — мы подключим тариф вручную.',
  };
  if (!provider) return manual;

  // Provider adapters are scaffolded but not yet activated for live billing.
  // Each requires: verified account, API key, product/variant id, and a
  // tested webhook. Until then we fall back to manual mode so no user is
  // charged through an unverified path.
  switch (provider) {
    case 'lemonsqueezy':
      // TODO(MVP3): POST Lemon Squeezy /v1/checkouts with LEMONSQUEEZY_API_KEY.
      return manual;
    case 'paddle':
      // TODO(MVP3): create Paddle transaction/checkout with PADDLE_API_KEY.
      return manual;
    case 'globalpay':
      // TODO(MVP3): Global Pay recurring/subscription init with GLOBALPAY_API_KEY.
      return manual;
    case 'freedompay':
      // TODO(MVP3): Freedom Pay "Regular payments" init with FREEDOMPAY_API_KEY.
      return manual;
    default:
      return manual;
  }
}

/**
 * Verify an incoming webhook signature against PAYMENT_WEBHOOK_SECRET.
 * Returns false when the secret is unset (webhook safely rejected) or the
 * signature is missing/mismatched. Real HMAC comparison is provider-shaped;
 * this MVP does a constant-time compare of a shared-secret header.
 */
export async function verifyWebhook(env: Env, request: Request, rawBody: string): Promise<boolean> {
  const secret = env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return false;
  const sig =
    request.headers.get('x-signature') ||
    request.headers.get('x-webhook-secret') ||
    request.headers.get('paddle-signature') ||
    '';
  if (!sig) return false;
  // Placeholder shared-secret check. Provider-specific HMAC (e.g. Lemon
  // Squeezy X-Signature = HMAC-SHA256(rawBody, secret)) is added with the
  // real adapter. rawBody is threaded through so that upgrade is drop-in.
  void rawBody;
  return timingSafeEqual(sig, secret);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Shared types for the AI-chat island.
export type Locale = "ru" | "uz";

export type PaymentProvider = 'click' | 'payme' | 'uzum';
const PAYMENT_PROVIDERS: readonly string[] = ['click', 'payme', 'uzum'];
function isPaymentProvider(value: unknown): value is PaymentProvider {
  return typeof value === 'string' && PAYMENT_PROVIDERS.includes(value);
}

// Same suffix rule as UZUM_HOST_PATTERN in functions/lib/gpt-chat/uzum-config.ts
// (tests/gpt-uzum-payments.test.ts keeps the two equal).
export const UZUM_CHECKOUT_HOST = /(^|\.)(uzumbank\.uz|uzumcheckout\.uz|uzum\.uz)$/;
/** Where the browser may be sent to pay: the providers' own hosts only. */
export function allowedCheckoutUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return ['checkout.paycom.uz', 'my.click.uz'].includes(url.hostname) || UZUM_CHECKOUT_HOST.test(url.hostname)
      ? url.href
      : null;
  } catch { return null; }
}

/** The free tier's allowance, as the server's account view states it. */
export interface FreeLimits {
  daily: number;
  hourly: number;
}

export interface AccountView {
  ok: boolean;
  loginAvailable: boolean;
  mode: 'test' | 'live' | null;
  providers: PaymentProvider[];
  user: { signedIn: true; storageKey: string } | null;
  remaining?: number;
  /** The free tier's allowance from the config (a guest's view never reads D1). */
  freeLimits?: FreeLimits;
  terms: { ru: string | null; uz: string | null };
  termsVersion: string | null;
  /** Limit card may offer the Telegram bot. Anything but `true` means no. */
  botHandoff?: boolean;
  access?: { order_id: string; ends_at: number; remaining: number; renewSoon: boolean; refund_requested_at: number | null } | null;
  payment?: { id: string; state: string; provider?: PaymentProvider } | null;
  receipts?: Array<{ kind: string; receipt_url: string }>;
  refundable?: Array<{ order_id: string; starts_at: number; refund_requested_at: number | null }>;
}

export function isOpaqueStorageKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function validAccountView(value: unknown): value is AccountView {
  if (!value || typeof value !== 'object') return false;
  const account = value as AccountView;
  return account.ok === true && typeof account.loginAvailable === 'boolean'
    && [null, 'test', 'live'].includes(account.mode)
    && Array.isArray(account.providers) && account.providers.every(isPaymentProvider)
    && (account.user === null || (account.user?.signedIn === true && isOpaqueStorageKey(account.user.storageKey)))
    && !!account.terms && ['ru', 'uz'].every(locale => {
      const term = account.terms[locale as Locale];
      return term === null || typeof term === 'string';
    })
    && (account.termsVersion === null || typeof account.termsVersion === 'string')
    && (account.botHandoff === undefined || typeof account.botHandoff === 'boolean')
    && (account.remaining === undefined || isCount(account.remaining))
    && (account.freeLimits === undefined || (!!account.freeLimits && typeof account.freeLimits === 'object'
      && isCount(account.freeLimits.daily) && isCount(account.freeLimits.hourly)))
    && (!account.access || (!!account.user && typeof account.access.order_id === 'string'
      && Number.isFinite(account.access.ends_at) && account.access.ends_at > 0 && Number.isInteger(account.access.remaining) && account.access.remaining >= 0))
    && (!account.payment || (typeof account.payment.id === 'string' && typeof account.payment.state === 'string' && (account.payment.provider === undefined || isPaymentProvider(account.payment.provider))))
    && (account.receipts === undefined || (Array.isArray(account.receipts) && account.receipts.every(r => r && typeof r.kind === 'string' && typeof r.receipt_url === 'string')))
    && (account.refundable === undefined || (Array.isArray(account.refundable) && account.refundable.every(r => r && typeof r.order_id === 'string' && Number.isFinite(r.starts_at))));
}

export function safeAccountLink(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, 'https://gptbot.uz');
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** A pack can really be bought right now: a billing mode and a ready provider. */
export function billingOpen(account: AccountView | null): boolean {
  return !!account?.mode && account.providers.length > 0;
}

/**
 * The header pill stands for something real: a pack that can be bought, an
 * account or an active pack (F4). With none of them it was a «Pro» button
 * leading to a price nobody could pay.
 */
export function showsAccountPill(account: AccountView | null): boolean {
  return billingOpen(account) || !!account?.user || !!account?.access;
}

export function canStartCheckout(account: AccountView | null, locale: Locale): boolean {
  return !!account && validAccountView(account) && !!account.user
    && account.providers.length > 0 && !!account.mode
    && !!account.termsVersion?.trim() && !!safeTermsLink(account.terms[locale])
    && !['pending', 'prepared'].includes(account.payment?.state || '');
}

export function safeTermsLink(value: unknown): string | null {
  const link = safeAccountLink(value);
  return link && new URL(link).origin === 'https://gptbot.uz' ? link : null;
}

export function canResumeCheckout(account: AccountView | null, locale: Locale): boolean {
  if (!account?.payment?.provider || !['pending', 'prepared'].includes(account.payment.state)
    || !account.providers.includes(account.payment.provider)) return false;
  return canStartCheckout({ ...account, payment: null }, locale);
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  /** transient UI state for the pending assistant turn */
  pending?: boolean;
  /** transient: the answer is still arriving token by token */
  streaming?: boolean;
  error?: boolean;
  partial?: boolean;
  /** Cut at the length limit and not charged: the answer says so. */
  truncated?: boolean;
}

export interface MountConfig {
  locale: Locale;
  /** absolute or root-relative API base; defaults to same origin */
  apiBase: string;
  turnstileSiteKey?: string;
}

export interface ChatApiResponse {
  ok: boolean;
  answer?: string;
  remaining?: number;
  modelUsed?: string;
  sessionId?: string;
  code?: string;
  message?: string;
  /** 429 limit_reached: which rule refused the turn (limit-state.ts LimitReason). */
  reason?: string;
  tier?: 'free' | 'paid';
  limits?: { daily: number | null; hourly: number | null };
  retryAt?: number | null;
  /** Seconds until a turn fits again (the body, else the Retry-After header). */
  retryAfterSec?: number | null;
  hourRemaining?: number | null;
  truncated?: boolean;
  charged?: boolean;
  plan?: string;
  leadHint?: string;
}

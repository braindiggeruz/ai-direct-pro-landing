// Shared types for the AI-chat island.
import { receiptHost, UZUM_HOST } from '../shared/payment-hosts';

export type Locale = "ru" | "uz";

export type PaymentProvider = 'click' | 'payme' | 'uzum';
const PAYMENT_PROVIDERS: readonly string[] = ['click', 'payme', 'uzum'];
export function isPaymentProvider(value: unknown): value is PaymentProvider {
  return typeof value === 'string' && PAYMENT_PROVIDERS.includes(value);
}

// Uzum's domains, one rule with the server (src/shared/payment-hosts.ts).
export const UZUM_CHECKOUT_HOST = UZUM_HOST;
/**
 * Where the browser may be sent to pay: the providers' own hosts only
 * (test.paycom.uz is Payme's sandbox, offered in a rehearsal session).
 */
export function allowedCheckoutUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return ['checkout.paycom.uz', 'test.paycom.uz', 'my.click.uz'].includes(url.hostname) || UZUM_CHECKOUT_HOST.test(url.hostname)
      ? url.href
      : null;
  } catch { return null; }
}

/** How a visitor signs in: the bot @gptbotuz_bot, or Telegram's OIDC. */
export type LoginMethod = 'bot' | 'oidc';

/** The free tier's allowance, as the server's account view states it. */
export interface FreeLimits {
  daily: number;
  hourly: number;
}

/** The AI pack on sale, as the server states it: the window prints these numbers, never literals. */
export interface PackTerms {
  priceUzs: number;
  messageLimit: number;
  dailyLimit: number;
  months: number;
  /** VAT included in the price; null until the fiscal settings are set. */
  vat?: { percent: number; includedTiyin: number } | null;
}

export interface AccountView {
  ok: boolean;
  loginAvailable: boolean;
  /** "bot" first when the bot can sign people in; absent from an older server (OIDC then). */
  loginMethods?: LoginMethod[];
  mode: 'test' | 'live' | null;
  providers: PaymentProvider[];
  /** `guest`: paid without signing in; the pack lives in this browser until Telegram keeps it. */
  user: { signedIn: true; storageKey: string; guest?: boolean } | null;
  /** Click can be paid without signing in (guest checkout). */
  guestCheckout?: boolean;
  remaining?: number;
  /** The free tier's allowance from the config (a guest's view never reads D1). */
  freeLimits?: FreeLimits;
  terms: { ru: string | null; uz: string | null };
  termsVersion: string | null;
  /** Limit card may offer the Telegram bot. Anything but `true` means no. */
  botHandoff?: boolean;
  pack?: PackTerms;
  /** How Uzum is paid while offered: its card page, or a code in the Uzum Bank app. */
  uzumFlow?: 'checkout' | 'code' | null;
  /** The account's permanent code for the Uzum Bank app, once issued for the current terms. */
  paymentCode?: string | null;
  /**
   * The running packs. order_id, ends_at and message_limit are the pack
   * turns draw from first; `remaining` counts every running pack (they run
   * side by side), and so does `dayRemaining`.
   */
  access?: {
    order_id: string; ends_at: number; remaining: number; renewSoon: boolean;
    /** The pack's own size (300 for the AI pack). */
    message_limit?: number;
    /** What the day cap still lets through today, at most `remaining`. */
    dayRemaining?: number;
    /** Packs running side by side, their answers bought, and when the last ends. */
    packs?: number;
    totalLimit?: number;
    paidThrough?: number;
    /** What is left in the pack turns draw from first (until ends_at). */
    firstRemaining?: number;
  } | null;
  /** The newest order; `cancellable`: open, and no provider has seen it yet. */
  payment?: { id: string; state: string; provider?: PaymentProvider; cancellable?: boolean } | null;
  receipts?: Array<{ kind: string; receipt_url: string }>;
}

export function isOpaqueStorageKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositive(value: unknown): value is number {
  return isCount(value) && value > 0;
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validPack(pack: unknown): pack is PackTerms {
  if (!pack || typeof pack !== 'object') return false;
  const { priceUzs, messageLimit, dailyLimit, months, vat } = pack as PackTerms;
  return isPositive(priceUzs) && isPositive(messageLimit) && isPositive(dailyLimit) && isPositive(months)
    && (vat === undefined || vat === null || (typeof vat === 'object' && isCount(vat.percent) && isCount(vat.includedTiyin)));
}

/** Nine digits, the first not 0: the shape of an Uzum Bank app code (payment-code-store.ts). */
export const PAYMENT_CODE = /^[1-9]\d{8}$/;

export function validAccountView(value: unknown): value is AccountView {
  if (!value || typeof value !== 'object') return false;
  const account = value as AccountView;
  return account.ok === true && typeof account.loginAvailable === 'boolean'
    && (account.loginMethods === undefined || (Array.isArray(account.loginMethods)
      && account.loginMethods.every(method => method === 'bot' || method === 'oidc')))
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
    && (account.pack === undefined || validPack(account.pack))
    && (account.uzumFlow === undefined || account.uzumFlow === null || account.uzumFlow === 'checkout' || account.uzumFlow === 'code')
    && (account.paymentCode === undefined || account.paymentCode === null
      || (!!account.user && typeof account.paymentCode === 'string' && PAYMENT_CODE.test(account.paymentCode)))
    && (!account.access || (!!account.user && typeof account.access.order_id === 'string'
      && isTime(account.access.ends_at) && isCount(account.access.remaining)
      && (account.access.message_limit === undefined || isPositive(account.access.message_limit))
      && (account.access.dayRemaining === undefined || isCount(account.access.dayRemaining))
      && (account.access.packs === undefined || isPositive(account.access.packs))
      && (account.access.totalLimit === undefined || isPositive(account.access.totalLimit))
      && (account.access.paidThrough === undefined || isTime(account.access.paidThrough))
      && (account.access.firstRemaining === undefined || isCount(account.access.firstRemaining))))
    && (!account.payment || (typeof account.payment.id === 'string' && typeof account.payment.state === 'string'
      && (account.payment.provider === undefined || isPaymentProvider(account.payment.provider))
      && (account.payment.cancellable === undefined || typeof account.payment.cancellable === 'boolean')))
    && (account.receipts === undefined || (Array.isArray(account.receipts) && account.receipts.every(r => r && typeof r.kind === 'string' && typeof r.receipt_url === 'string')));
}

function httpsLink(value: unknown): URL | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, 'https://gptbot.uz');
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch { return null; }
}

/**
 * A fiscal receipt link the panel may open: ofd.soliq.uz or an Uzum host,
 * nothing else; the server's receiptLink() applies the same rule.
 */
export function safeAccountLink(value: unknown): string | null {
  const url = httpsLink(value);
  return url && !url.port && receiptHost(url.hostname) ? url.href : null;
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

/** A visitor without an account may pay with Click alone (guest checkout). */
export function canPayAsGuest(account: AccountView): boolean {
  return account.guestCheckout === true && account.providers.includes('click');
}

export function canStartCheckout(account: AccountView | null, locale: Locale): boolean {
  return !!account && validAccountView(account) && (!!account.user || canPayAsGuest(account)) && !!account.pack
    && account.providers.length > 0 && !!account.mode
    && !!account.termsVersion?.trim() && !!safeTermsLink(account.terms[locale])
    && !['pending', 'prepared'].includes(account.payment?.state || '');
}

export function safeTermsLink(value: unknown): string | null {
  const url = httpsLink(value);
  return url && url.origin === 'https://gptbot.uz' ? url.href : null;
}

export function canResumeCheckout(account: AccountView | null, locale: Locale): boolean {
  if (!account?.payment?.provider || !['pending', 'prepared'].includes(account.payment.state)
    || !account.providers.includes(account.payment.provider)) return false;
  return canStartCheckout({ ...account, payment: null }, locale);
}

/** A button under an answer (components/AiAnswer.tsx): to Russian, to Uzbek, simpler, continue. */
export type AnswerAction = "shorter" | "continue" | "russian" | "uzbek";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** In memory only: what an answer button asked the model, and in which language its lines go; `content` is the button's name. */
  ask?: { request: string; action: AnswerAction; frame?: Locale };
  model?: string | null;
  /** transient UI state for the pending assistant turn */
  pending?: boolean;
  /** transient: the answer is still arriving token by token */
  streaming?: boolean;
  error?: boolean;
  partial?: boolean;
  /** Cut at the length limit and not charged: the answer says so. */
  truncated?: boolean;
  /**
   * The versions «Qayta yozish» made of this answer, oldest first, at most 3
   * (REV-7); `version` is the one shown, whose text, model and cut are the
   * message's own. Kept in this browser only; the server gets `content`.
   */
  versions?: AnswerVersion[];
  version?: number;
}

export interface AnswerVersion {
  content: string;
  model: string | null;
  truncated?: boolean;
}

export interface MountConfig {
  locale: Locale;
  /** absolute or root-relative API base; defaults to same origin */
  apiBase: string;
  turnstileSiteKey?: string;
  /** The page's H1 (data-h1 on #gpt-chat-root, from the page JSON): the resting screen's heading. */
  h1?: string;
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

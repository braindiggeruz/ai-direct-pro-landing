// Shared types for the AI-chat island.
export type Locale = "ru" | "uz";

export interface AccountView {
  ok: boolean;
  loginAvailable: boolean;
  mode: 'test' | 'live' | null;
  providers: Array<'click' | 'payme'>;
  user: { signedIn: true; storageKey: string } | null;
  remaining?: number;
  terms: { ru: string | null; uz: string | null };
  termsVersion: string | null;
  access?: { order_id: string; ends_at: number; remaining: number; renewSoon: boolean; refund_requested_at: number | null } | null;
  payment?: { id: string; state: string; provider?: 'click' | 'payme' } | null;
  scheduled?: { starts_at: number } | null;
  receipts?: Array<{ kind: string; receipt_url: string }>;
  refundable?: Array<{ order_id: string; starts_at: number; refund_requested_at: number | null }>;
}

export function isOpaqueStorageKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export function validAccountView(value: unknown): value is AccountView {
  if (!value || typeof value !== 'object') return false;
  const account = value as AccountView;
  return account.ok === true && typeof account.loginAvailable === 'boolean'
    && [null, 'test', 'live'].includes(account.mode)
    && Array.isArray(account.providers) && account.providers.every(p => p === 'click' || p === 'payme')
    && (account.user === null || (account.user?.signedIn === true && isOpaqueStorageKey(account.user.storageKey)))
    && !!account.terms && ['ru', 'uz'].every(locale => {
      const term = account.terms[locale as Locale];
      return term === null || typeof term === 'string';
    })
    && (account.termsVersion === null || typeof account.termsVersion === 'string')
    && (account.remaining === undefined || (Number.isInteger(account.remaining) && account.remaining >= 0))
    && (!account.access || (!!account.user && typeof account.access.order_id === 'string'
      && Number.isFinite(account.access.ends_at) && account.access.ends_at > 0 && Number.isInteger(account.access.remaining) && account.access.remaining >= 0))
    && (!account.payment || (typeof account.payment.id === 'string' && typeof account.payment.state === 'string' && (account.payment.provider === undefined || ['click', 'payme'].includes(account.payment.provider))))
    && (!account.scheduled || Number.isFinite(account.scheduled.starts_at))
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
  reason?: string;
  plan?: string;
  leadHint?: string;
}

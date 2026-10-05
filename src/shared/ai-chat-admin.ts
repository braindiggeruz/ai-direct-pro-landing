// Shared contract of the admin section «AI-чат» (paid-chat plan WP-19, D10).
//
// The Pages Functions under /api/admin/ai-chat/* and the admin SPA agree on
// this one vocabulary. Every field is an aggregate, a closed-list value, a
// setting NAME or a pseudonym: no field can carry a message, a contact, an IP
// or its hash, an account id, a Telegram identity or a secret value, because
// no endpoint of the section reads or returns one.

/** Weeks start on Monday 00:00 in Tashkent (UTC+5, no daylight saving). */
export const AI_CHAT_ADMIN_TZ = 'Asia/Tashkent';
export const TASHKENT_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export const AI_CHAT_WEEKS = { default: 8, max: 12 } as const;
export const AI_CHAT_VISITOR_DAYS = { default: 7, max: 30 } as const;
/** Rows per page of the payments list. */
export const AI_CHAT_PAGE_SIZE = 50;
/** A cohort of the north star is final once its first day plus 7 days of returns have passed. */
export const NORTH_STAR_SETTLE_DAYS = 14;

export const AI_CHAT_PROVIDERS = ['click', 'uzum', 'payme'] as const;
export type AiChatProvider = (typeof AI_CHAT_PROVIDERS)[number];
export const AI_CHAT_ORDER_STATES = ['pending', 'prepared', 'paid', 'cancelled', 'refunded'] as const;
export type AiChatOrderState = (typeof AI_CHAT_ORDER_STATES)[number];
export const AI_CHAT_MODES = ['test', 'live'] as const;
export type AiChatMode = (typeof AI_CHAT_MODES)[number];

/** An order id as the ledger writes it: Click and Payme `pay_…`, Uzum `uzm_…`. */
export const ORDER_ID = /^(?:pay|uzm)_[0-9a-f]{32}$/;
/** The refund's reference in the provider's cabinet, as the owner types it. */
export const REFUND_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9 ._:/#-]{0,79}$/;

/**
 * Why a section has no data:
 *   schema_pending  the table or view it reads is not in D1 yet (a migration
 *                   the code needs has not been applied)
 *   query_failed    D1 answered with an error; the server log has the request id
 *   salt_missing    pseudonyms need GPT_HASH_SALT; without it nothing is shown
 */
export type AiChatSectionError = 'schema_pending' | 'query_failed' | 'salt_missing';

export type AiChatSection<T> =
  | { ok: true; data: T; error: null }
  | { ok: false; data: null; error: AiChatSectionError };

export function sectionOk<T>(data: T): AiChatSection<T> {
  return { ok: true, data, error: null };
}

export function sectionError<T>(error: AiChatSectionError): AiChatSection<T> {
  return { ok: false, data: null, error };
}

// ─── Readiness (settings by name only) ─────────────────────────────────────

export interface AiChatProviderReadiness {
  provider: AiChatProvider;
  /** Listed in GPT_PAYMENT_PROVIDERS (Payme only when listed). */
  listed: boolean;
  /** The provider's mode, or null when it is off. */
  mode: AiChatMode | null;
  /** Its protocol credentials for that mode are present and valid. */
  configured: boolean;
  /** Uzum: how a payer pays (card page or the app code); null elsewhere. */
  flow: 'checkout' | 'code' | null;
  /** Names of what a live sale still lacks (liveReadiness()); empty = live-ready. */
  liveMissing: string[];
}

export interface AiChatReadiness {
  providers: AiChatProviderReadiness[];
  terms: { version: string | null; ru: string | null; uz: string | null; approvedAt: string | null };
  /** Names of the receipt settings that are missing or invalid. */
  fiscalMissing: string[];
  salt: { set: boolean; since: string | null; active: boolean };
  /** GPT_IDENTITY_SECRET is long enough: accounts and rehearsal cookies can be signed. */
  identitySecret: boolean;
  alerts: { enabled: boolean; channel: 'dedicated' | 'assistant' | 'none' };
  /** Days chat messages are kept; null = kept (retention off). */
  retentionDays: number | null;
  models: {
    provider: 'openrouter' | 'zai';
    /** Names of the switches Z.ai still lacks; empty = Z.ai answers first. */
    zaiMissing: string[];
    freeChain: string[];
    paidChain: string[];
    freeTierPaidPrimary: boolean;
    freePaidDailyUsd: number;
  };
  rehearsal: { testProviders: AiChatProvider[]; available: boolean };
}

// ─── Weeks ──────────────────────────────────────────────────────────────────

export interface AiChatWeek {
  /** Monday of the week in Tashkent, YYYY-MM-DD. */
  week: string;
  /** Chat sessions opened, by language. */
  sessions: { ru: number; uz: number; other: number };
  turns: number;
  /** Charged answers (status done). */
  answered: number;
  /** Turns settled without a charge. */
  released: number;
  /** Reservations that expired without settling. */
  stuck: number;
  /** How turns ended (migrations/0066); null when no turn of the week carries an outcome. */
  outcomes: { answered: number; truncated: number; stopped: number; failed: number; refused: number } | null;
  /** 429s by reason; null before the counter was written. */
  limitHits: Record<string, number> | null;
  /** The pack window's server funnel (gpt_ui_events); null before its first event. */
  funnel: {
    packViewed: number;
    loginStarted: number;
    loginDone: number;
    checkoutStarted: number;
    checkoutPaid: number;
  } | null;
  /** Live orders created this week and how many of them were paid or refunded; null without the ledger view. */
  orders: { created: number; paid: number; refunded: number } | null;
  /** Leads by their source. */
  leads: Record<string, number>;
  /**
   * NS-1: of the IP groups first seen this week, how many came back with an
   * answer on 2+ different Tashkent days within 7 days. `readable` is false
   * while the cohort is younger than 14 days or older than the history kept.
   */
  northStar: { entries: number; returned: number; per100: number | null; readable: boolean };
}

// ─── Models and alerts ──────────────────────────────────────────────────────

export interface AiChatModelRow {
  /** The model that settled the turn; null when none was reached. */
  model: string | null;
  turns: number;
  answered: number;
  truncated: number;
  failed: number;
  ttftAvgMs: number | null;
  costUsd: number | null;
}

export interface AiChatModels {
  last24h: AiChatModelRow[];
  last7d: AiChatModelRow[];
  blocked: Array<{ model: string; code: string; until: number }>;
  /** The free tier's spend on paid models today (UTC day); null before 0066. */
  spendToday: { usd: number; reservedUsd: number; capUsd: number; attempts: number } | null;
}

export interface AiChatAlertRow {
  code: string;
  n: number;
  delivered: number;
  lastAt: number;
  urgent: boolean;
  /** Fixed explanation of the code, if it has one. */
  text: string | null;
}

export interface AiChatAlerts {
  last7d: AiChatAlertRow[];
  /** When the silence watchdog and the hourly model check last ran. */
  watchdogLastRun: number | null;
  catalogueLastRun: number | null;
}

export interface AiChatOverview {
  generatedAt: number;
  tz: typeof AI_CHAT_ADMIN_TZ;
  request_id: string;
  readiness: AiChatSection<AiChatReadiness>;
  weeks: AiChatSection<AiChatWeek[]>;
  models: AiChatSection<AiChatModels>;
  alerts: AiChatSection<AiChatAlerts>;
}

// ─── Payments ───────────────────────────────────────────────────────────────

export interface AiChatPaymentRow {
  /** The order number: the support key the buyer also sees in «Paketim». */
  id: string;
  provider: AiChatProvider;
  mode: AiChatMode;
  state: AiChatOrderState;
  amountUzs: number;
  createdAt: number;
  paidAt: number | null;
  cancelledAt: number | null;
  /** The buyer as a pseudonym (HMAC with GPT_HASH_SALT); null without the salt. */
  buyer: string | null;
  /** A synthetic rehearsal account bought it (test only). */
  rehearsal: boolean;
  /** Bought without signing in (guest checkout). */
  guest?: boolean;
  pack: { endsAt: number; limit: number; used: number; revokedAt: number | null } | null;
  receipt: { status: number; url: string | null } | null;
  refundReceipt: { status: number; url: string | null } | null;
}

export interface AiChatPaymentsPage {
  rows: AiChatPaymentRow[];
  /** Cursor of the next page, or null on the last one. */
  next: string | null;
}

export interface AiChatPayments {
  request_id: string;
  payments: AiChatSection<AiChatPaymentsPage>;
}

export interface AiChatPaymentsQuery {
  cursor: AiChatPaymentsCursor | null;
  provider: AiChatProvider | null;
  state: AiChatOrderState | null;
  mode: AiChatMode | null;
}

// ─── Visitors (IP groups, not people) ───────────────────────────────────────

export interface AiChatVisitorRow {
  /** «N-XXXXXXXX»: HMAC(GPT_HASH_SALT, "admin-alias:v1:" + IP hash), never the hash. */
  alias: string;
  firstAt: number;
  lastAt: number;
  days: number;
  turns: number;
  answered: number;
  limitHits: number;
  account: boolean;
  paid: boolean;
  locale: 'ru' | 'uz' | null;
}

export interface AiChatVisitors {
  request_id: string;
  days: number;
  visitors: AiChatSection<AiChatVisitorRow[]>;
}

// ─── Actions ────────────────────────────────────────────────────────────────

export interface AiChatRefundRecordInput {
  orderId: string;
  merchantRefundReference: string;
  confirmedRefund: true;
}

export interface AiChatRefundRecordResult {
  ok: true;
  state: 'refunded';
  /** false: the order was already refunded, nothing changed. */
  recorded: boolean;
  request_id: string;
}

export interface AiChatRehearsalResult {
  ok: true;
  expiresAt: number;
  providers: AiChatProvider[];
  /** The browser is also signed in as a fresh synthetic rehearsal account. */
  account: boolean;
  request_id: string;
}

// ─── Time ───────────────────────────────────────────────────────────────────

/** Epoch ms of Monday 00:00 in Tashkent of the week that contains `now`. */
export function tashkentWeekStart(now: number): number {
  const local = now + TASHKENT_OFFSET_MS;
  const midnight = Math.floor(local / DAY_MS) * DAY_MS;
  const sinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  return midnight - sinceMonday * DAY_MS - TASHKENT_OFFSET_MS;
}

/** The Tashkent calendar day of `ms`, YYYY-MM-DD. */
export function tashkentDay(ms: number): string {
  return new Date(ms + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Monday labels (YYYY-MM-DD) of the last `weeks` weeks, oldest first, and when the oldest began. */
export function tashkentWeeks(now: number, weeks: number): { since: number; labels: string[] } {
  const current = tashkentWeekStart(now);
  const since = current - (weeks - 1) * WEEK_MS;
  return {
    since,
    labels: Array.from({ length: weeks }, (_, i) => tashkentDay(since + i * WEEK_MS)),
  };
}

// ─── Payments cursor (keyset by created_at, provider, id; plan A4) ────────

export interface AiChatPaymentsCursor {
  createdAt: number;
  provider: AiChatProvider;
  id: string;
}

const CURSOR = /^(\d{1,15})\.(click|uzum|payme)\.((?:pay|uzm)_[0-9a-f]{32})$/;

export function encodePaymentsCursor(cursor: AiChatPaymentsCursor): string {
  return `${cursor.createdAt}.${cursor.provider}.${cursor.id}`;
}

/** The cursor in a query string, or null when it is not one. */
export function parsePaymentsCursor(value: string): AiChatPaymentsCursor | null {
  const match = CURSOR.exec(value);
  if (!match) return null;
  const createdAt = Number(match[1]);
  return Number.isSafeInteger(createdAt)
    ? { createdAt, provider: match[2] as AiChatProvider, id: match[3] }
    : null;
}

/** A value from a closed list, or null when the parameter is absent; undefined when it is invalid. */
export function closedParam<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null | undefined {
  if (value === null || value === '') return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** A whole number in [1, max] from a query parameter; `fallback` when absent; null when invalid. */
export function boundedParam(value: string | null, fallback: number, max: number): number | null {
  if (value === null || value === '') return fallback;
  if (!/^\d{1,3}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= max ? n : null;
}

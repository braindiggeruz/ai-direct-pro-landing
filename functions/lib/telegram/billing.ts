// GPTBot Javob — usage accounting + provider-neutral billing.
//
// Usage model:
//   "main generation"  = new forward/direct reply OR the «Другой» alternative.
//                        Consumes from the active entitlement / free quota.
//   "modifier"         = Короче / Мягче / Увереннее / RU-UZ on the current
//                        result. Free for MVP but ledgered + capped per item.
//
// Source of truth is the append-only usage_ledger (idempotency_key UNIQUE),
// plus the per-day counts /delete_me carries over (usage_carryover, store.ts
// deleteUserData) — counters are derived, never authoritative.
import { tashkentPeriodStarts } from './period';
import { shortId } from './store';

export { tashkentPeriodStarts };

export type UsageType = 'main_generation' | 'modifier' | 'analysis';

/** The bot's free replies: TELEGRAM_FREE_DAILY_LIMIT / _MONTHLY_LIMIT, null when unset. */
export interface ConfiguredLimits {
  daily: number | null;
  monthly: number | null;
}

/** The free tier's limits a decision used. */
export interface FreeAllowance {
  daily: number;
  monthly: number;
}

export interface UsageDecision {
  allowed: boolean;
  planCode: string;               // free | day_pass | plus …
  remainingToday: number | null;  // free tier only
  remainingPeriod: number;        // entitlement / monthly remaining
  reason?: 'daily' | 'period';
  /** Free tier only: the limits applied; null for an entitlement or a missing catalogue. */
  freeLimits: FreeAllowance | null;
}

export const MAX_MODIFIERS_PER_ITEM = 8; // callback-spam cap, config-in-code

function nowIso(): string { return new Date().toISOString(); }

interface EntRow { id: string; remaining: number; expires_at: string; source: string }

/** Best active paid entitlement (nearest expiry first — use day passes up). */
async function activeEntitlement(db: D1Database, userId: number): Promise<EntRow | null> {
  const row = await db
    .prepare(`SELECT id, remaining, expires_at, source FROM entitlements
              WHERE telegram_user_id = ? AND entitlement_type = 'main_generations'
                AND remaining > 0 AND expires_at > ? ORDER BY expires_at ASC LIMIT 1`)
    .bind(userId, nowIso())
    .first<EntRow>();
  return row || null;
}

/**
 * Units used since `sinceIso`: the user's usage_ledger rows plus what an
 * earlier /delete_me carried over under `carryKey` (store.ts deleteUserData).
 */
async function ledgerCount(db: D1Database, userId: number, usageType: UsageType, sinceIso: string, carryKey: string | null): Promise<number> {
  const row = await db
    .prepare(`SELECT (SELECT COUNT(*) FROM usage_ledger WHERE telegram_user_id = ? AND usage_type = ? AND created_at >= ?)
              + (SELECT COALESCE(SUM(used), 0) FROM usage_carryover WHERE user_key = ? AND usage_type = ? AND day >= ?) AS c`)
    .bind(userId, usageType, sinceIso, carryKey, usageType, sinceIso)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

async function freePlanLimits(db: D1Database): Promise<FreeAllowance | null> {
  const row = await db
    .prepare("SELECT daily_limit, monthly_limit FROM plans WHERE code = 'free' AND is_active = 1 LIMIT 1")
    .first<{ daily_limit: number | null; monthly_limit: number | null }>();
  if (!row || !Number.isInteger(row.daily_limit) || !Number.isInteger(row.monthly_limit)) return null;
  if ((row.daily_limit ?? 0) <= 0 || (row.monthly_limit ?? 0) <= 0) return null;
  return { daily: row.daily_limit!, monthly: row.monthly_limit! };
}

/**
 * The configured limits win (decision L15: 10 a day, 100 a month); the plans
 * row 'free' fills in a value that is not configured. The catalogue is not
 * read when both are set.
 */
async function freeAllowance(db: D1Database, configured: ConfiguredLimits): Promise<FreeAllowance | null> {
  if (configured.daily !== null && configured.monthly !== null) {
    return { daily: configured.daily, monthly: configured.monthly };
  }
  const plan = await freePlanLimits(db);
  if (!plan) return null;
  return { daily: configured.daily ?? plan.daily, monthly: configured.monthly ?? plan.monthly };
}

/**
 * Decide whether a main generation is allowed, WITHOUT consuming it.
 * `carryKey` (store.ts usageCarryKey) finds what /delete_me carried over.
 */
export async function decideUsage(
  db: D1Database,
  userId: number,
  configured: ConfiguredLimits,
  now = new Date(),
  carryKey: string | null = null,
): Promise<UsageDecision> {
  const ent = await activeEntitlement(db, userId);
  if (ent) {
    const planCode = ent.source.includes('day_pass') ? 'day_pass' : ent.source.includes('plus') ? 'plus' : ent.source.split(':')[1] || 'paid';
    return { allowed: true, planCode, remainingToday: null, remainingPeriod: ent.remaining, freeLimits: null };
  }
  // Usage is ledger-derived.
  const free = await freeAllowance(db, configured);
  // Missing/invalid limits must never turn into unlimited usage.
  if (!free) return { allowed: false, planCode: 'free', remainingToday: 0, remainingPeriod: 0, reason: 'period', freeLimits: null };
  const starts = tashkentPeriodStarts(now);
  const usedToday = await ledgerCount(db, userId, 'main_generation', starts.day, carryKey);
  const usedMonth = await ledgerCount(db, userId, 'main_generation', starts.month, carryKey);
  if (usedMonth >= free.monthly) return { allowed: false, planCode: 'free', remainingToday: 0, remainingPeriod: 0, reason: 'period', freeLimits: free };
  if (usedToday >= free.daily) return { allowed: false, planCode: 'free', remainingToday: 0, remainingPeriod: free.monthly - usedMonth, reason: 'daily', freeLimits: free };
  return {
    allowed: true,
    planCode: 'free',
    remainingToday: Math.min(free.daily - usedToday, free.monthly - usedMonth),
    remainingPeriod: free.monthly - usedMonth,
    freeLimits: free,
  };
}

/** P0 Tahlil quota is deliberately separate from Javob reply entitlements. */
export async function decideAnalysisUsage(
  db: D1Database,
  userId: number,
  dailyLimit = 1,
  now = new Date(),
  carryKey: string | null = null,
): Promise<{ allowed: boolean; remainingToday: number }> {
  const limit = Math.max(1, Math.min(Math.floor(dailyLimit), 1));
  const used = await ledgerCount(db, userId, 'analysis', tashkentPeriodStarts(now).day, carryKey);
  return { allowed: used < limit, remainingToday: Math.max(0, limit - used) };
}

/**
 * Consume one unit, idempotently. A duplicate idempotency_key (Telegram
 * update retry, double-tap) is a silent no-op that reports success.
 */
export async function consumeUsage(
  db: D1Database,
  userId: number,
  usageType: UsageType,
  idempotencyKey: string,
  refs: { itemId?: string; resultId?: string } = {},
): Promise<{ consumed: boolean }> {
  const ent = usageType === 'main_generation' ? await activeEntitlement(db, userId) : null;
  const res = await db
    .prepare(`INSERT OR IGNORE INTO usage_ledger (id, telegram_user_id, usage_type, quantity, item_id, result_id, entitlement_id, created_at, idempotency_key)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(shortId(), userId, usageType, 1, refs.itemId ?? null, refs.resultId ?? null, ent?.id ?? null, nowIso(), idempotencyKey)
    .run();
  const inserted = (res.meta?.changes ?? 0) > 0;
  if (inserted && ent) {
    await db.prepare('UPDATE entitlements SET remaining = remaining - 1 WHERE id = ? AND remaining > 0').bind(ent.id).run();
  }
  return { consumed: inserted };
}

/** Modifier-spam cap: how many modifier rows exist for this item. */
export async function modifierCount(db: D1Database, userId: number, itemId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM usage_ledger WHERE telegram_user_id = ? AND item_id = ? AND usage_type = 'modifier'")
    .bind(userId, itemId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/** Grant an entitlement (paid activation or referral). Idempotent by sourceId. */
export async function grantEntitlement(
  db: D1Database,
  userId: number,
  quantity: number,
  durationHours: number,
  source: string,
  sourceId: string,
): Promise<void> {
  const exists = await db
    .prepare('SELECT id FROM entitlements WHERE source = ? AND source_id = ?')
    .bind(source, sourceId)
    .first();
  if (exists) return; // duplicate webhook → no double grant
  const now = new Date();
  await db
    .prepare('INSERT INTO entitlements (id, telegram_user_id, entitlement_type, quantity, remaining, starts_at, expires_at, source, source_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(shortId(), userId, 'main_generations', quantity, quantity, now.toISOString(), new Date(now.getTime() + durationHours * 3600_000).toISOString(), source, sourceId, now.toISOString())
    .run();
}

// ── Provider-neutral billing (adapters DISABLED until official docs) ───────
export interface PaymentOrderDraft {
  orderId: string;
  payUrl?: string;
}

export interface WebhookVerification {
  valid: boolean;
  externalTransactionId?: string;
  orderId?: string;
  amountUzs?: number;
  status?: 'paid' | 'failed' | 'cancelled';
  error?: string;
}

/**
 * Contract every real provider (Click, Payme) must implement — strictly from
 * official merchant documentation. NO part of the wire protocol is invented
 * here; until docs + credentials arrive the adapters below refuse to run.
 */
export interface BillingProvider {
  readonly code: 'click' | 'payme';
  isConfigured(): boolean;
  createPaymentOrder(userId: number, planCode: string, amountUzs: number, idempotencyKey: string): Promise<PaymentOrderDraft>;
  verifyWebhook(request: Request): Promise<WebhookVerification>;
  queryPaymentStatus(externalOrderId: string): Promise<'paid' | 'pending' | 'failed' | 'unknown'>;
}

class DisabledProvider implements BillingProvider {
  constructor(public readonly code: 'click' | 'payme') {}
  isConfigured(): boolean { return false; }
  async createPaymentOrder(): Promise<PaymentOrderDraft> {
    throw new Error(`${this.code} adapter is not configured: official merchant docs + credentials required`);
  }
  async verifyWebhook(): Promise<WebhookVerification> {
    return { valid: false, error: `${this.code} adapter not configured` };
  }
  async queryPaymentStatus(): Promise<'unknown'> { return 'unknown'; }
}

export const ClickBillingProvider: BillingProvider = new DisabledProvider('click');
export const PaymeBillingProvider: BillingProvider = new DisabledProvider('payme');

export interface BillingFlags {
  billingEnabled: boolean;
  clickEnabled: boolean;
  paymeEnabled: boolean;
  dayPassEnabled: boolean;
  plusEnabled: boolean;
}

export function resolveBillingFlags(env: Record<string, unknown>): BillingFlags {
  const on = (v: unknown) => v === 'true' || v === '1';
  return {
    billingEnabled: on(env.JAVOB_BILLING_ENABLED),
    clickEnabled: on(env.JAVOB_CLICK_ENABLED),
    paymeEnabled: on(env.JAVOB_PAYME_ENABLED),
    dayPassEnabled: on(env.JAVOB_DAY_PASS_ENABLED),
    plusEnabled: on(env.JAVOB_PLUS_ENABLED),
  };
}

// GPTBot Javob — usage accounting + provider-neutral billing.
//
// Usage model:
//   "main generation"  = new forward/direct reply OR the «Другой» alternative.
//                        Consumes from the active entitlement / free quota.
//   "modifier"         = Короче / Мягче / Увереннее / RU-UZ on the current
//                        result. Free for MVP but ledgered + capped per item.
//
// Source of truth is the append-only usage_ledger (idempotency_key UNIQUE) —
// counters are derived, never authoritative.
import { shortId } from './store';

export type UsageType = 'main_generation' | 'modifier';

export interface PlanRow {
  code: string;
  name_ru: string;
  name_uz: string;
  price_uzs: number;
  billing_type: string;
  duration_hours: number | null;
  monthly_limit: number | null;
  daily_limit: number | null;
  features_json: string | null;
  is_active: number;
  display_order: number;
}

export interface UsageDecision {
  allowed: boolean;
  planCode: string;               // free | day_pass | plus …
  remainingToday: number | null;  // free tier only
  remainingPeriod: number;        // entitlement / monthly remaining
  reason?: 'daily' | 'period';
}

export const MAX_MODIFIERS_PER_ITEM = 8; // callback-spam cap, config-in-code

function nowIso(): string { return new Date().toISOString(); }
function utcDate(d = new Date()): string { return d.toISOString().slice(0, 10); }
function monthStartIso(d = new Date()): string {
  return `${d.toISOString().slice(0, 7)}-01T00:00:00.000Z`;
}

export async function listActivePlans(db: D1Database): Promise<PlanRow[]> {
  const res = await db
    .prepare('SELECT code, name_ru, name_uz, price_uzs, billing_type, duration_hours, monthly_limit, daily_limit, features_json, is_active, display_order FROM plans ORDER BY display_order')
    .all<PlanRow>();
  return (res.results || []).filter((p) => p.is_active === 1);
}

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

async function ledgerCount(db: D1Database, userId: number, usageType: UsageType, sinceIso: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS c FROM usage_ledger WHERE telegram_user_id = ? AND usage_type = ? AND created_at >= ?')
    .bind(userId, usageType, sinceIso)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

async function freePlanLimits(db: D1Database): Promise<{ daily: number; monthly: number } | null> {
  const row = await db
    .prepare("SELECT daily_limit, monthly_limit FROM plans WHERE code = 'free' AND is_active = 1 LIMIT 1")
    .first<{ daily_limit: number | null; monthly_limit: number | null }>();
  if (!row || !Number.isInteger(row.daily_limit) || !Number.isInteger(row.monthly_limit)) return null;
  if ((row.daily_limit ?? 0) <= 0 || (row.monthly_limit ?? 0) <= 0) return null;
  return { daily: row.daily_limit!, monthly: row.monthly_limit! };
}

/** Decide whether a main generation is allowed, WITHOUT consuming it. */
export async function decideUsage(db: D1Database, userId: number): Promise<UsageDecision> {
  const ent = await activeEntitlement(db, userId);
  if (ent) {
    const planCode = ent.source.includes('day_pass') ? 'day_pass' : ent.source.includes('plus') ? 'plus' : ent.source.split(':')[1] || 'paid';
    return { allowed: true, planCode, remainingToday: null, remainingPeriod: ent.remaining };
  }
  // Free tier limits come from the plan catalog; usage is ledger-derived.
  const free = await freePlanLimits(db);
  // Missing/invalid catalog data must never turn into unlimited usage.
  if (!free) return { allowed: false, planCode: 'free', remainingToday: 0, remainingPeriod: 0, reason: 'period' };
  const usedToday = await ledgerCount(db, userId, 'main_generation', `${utcDate()}T00:00:00.000Z`);
  const usedMonth = await ledgerCount(db, userId, 'main_generation', monthStartIso());
  if (usedMonth >= free.monthly) return { allowed: false, planCode: 'free', remainingToday: 0, remainingPeriod: 0, reason: 'period' };
  if (usedToday >= free.daily) return { allowed: false, planCode: 'free', remainingToday: 0, remainingPeriod: free.monthly - usedMonth, reason: 'daily' };
  return { allowed: true, planCode: 'free', remainingToday: free.daily - usedToday, remainingPeriod: free.monthly - usedMonth };
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

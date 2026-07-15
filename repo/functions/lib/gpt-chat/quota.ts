// Anti-abuse quota logic for the consumer AI-chat.
//
// Free tier: daily + hourly caps keyed by hashed IP (privacy-preserving).
// Pure decision helpers are unit-tested; the D1-backed reader is thin.
import type { GptChatConfig } from './config';

export interface UsageSnapshot {
  dayCount: number;
  hourCount: number;
}

export interface QuotaDecision {
  allowed: boolean;
  remaining: number; // remaining messages today (never negative)
  reason?: 'daily' | 'hourly';
}

/** Pure quota decision — no I/O. Exported for tests. */
export function decideQuota(usage: UsageSnapshot, cfg: GptChatConfig, plan: 'free' | 'paid'): QuotaDecision {
  if (plan === 'paid') {
    const remaining = Math.max(0, cfg.paidMonthlyLimit - usage.dayCount);
    return { allowed: usage.dayCount < cfg.paidMonthlyLimit, remaining };
  }
  const remaining = Math.max(0, cfg.freeDailyLimit - usage.dayCount);
  if (usage.dayCount >= cfg.freeDailyLimit) return { allowed: false, remaining: 0, reason: 'daily' };
  if (usage.hourCount >= cfg.freeHourlyLimit) return { allowed: false, remaining, reason: 'hourly' };
  return { allowed: true, remaining };
}

export function utcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Read today's day-count (usage_daily) + last-hour count (messages) for an IP. */
export async function readUsage(db: D1Database, hashedIp: string, now = new Date()): Promise<UsageSnapshot> {
  const day = utcDate(now);
  const hourAgoIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const dayRow = await db
    .prepare('SELECT message_count AS c FROM gpt_usage_daily WHERE date_utc = ? AND hashed_ip = ?')
    .bind(day, hashedIp)
    .first<{ c: number }>();

  const hourRow = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM gpt_messages m
       JOIN gpt_sessions s ON s.id = m.session_id
       WHERE s.hashed_ip = ? AND m.role = 'user' AND m.created_at >= ?`,
    )
    .bind(hashedIp, hourAgoIso)
    .first<{ c: number }>();

  return { dayCount: dayRow?.c ?? 0, hourCount: hourRow?.c ?? 0 };
}

/** Increment today's usage counters (one user turn + its answer tokens). */
export async function recordUsage(
  db: D1Database,
  hashedIp: string,
  userId: string | null,
  tokIn: number,
  tokOut: number,
  now = new Date(),
): Promise<void> {
  const day = utcDate(now);
  await db
    .prepare(
      `INSERT INTO gpt_usage_daily (date_utc, hashed_ip, user_id, message_count, token_in, token_out, cost_usd)
       VALUES (?, ?, ?, 1, ?, ?, 0)
       ON CONFLICT(date_utc, hashed_ip) DO UPDATE SET
         message_count = message_count + 1,
         token_in = token_in + excluded.token_in,
         token_out = token_out + excluded.token_out`,
    )
    .bind(day, hashedIp, userId, tokIn || 0, tokOut || 0)
    .run();
}

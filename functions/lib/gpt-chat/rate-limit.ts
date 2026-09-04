// Fixed-window counters for the public, unauthenticated /api/gpt/* POST
// surfaces that now cost the studio something real: a lead write plus a
// Telegram message to the owner's phone.
//
// The threat is not one persistent attacker — it is that submitting a
// thousand leads should be boring. Three independent brakes do that:
//   1. per hashed IP, per hour and per day, on the endpoint itself;
//   2. duplicate suppression on the lead itself, so a double-tap or a retry
//      loop produces one row and one alert, not two hundred;
//   3. a global ceiling on owner alerts per hour, so even a distributed flood
//      cannot turn the owner's phone into a siren. Leads keep being STORED
//      past that ceiling — only the push is muted, and the owner is told once
//      that it happened.
//
// `subject` is a hashed IP (never a raw address) or the literal 'owner'.
// Windows are fixed, not sliding: one row per (action, subject, window), so a
// check is a single upsert instead of a scan.

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts used in the current window, including this one. */
  count: number;
  remaining: number;
  /** Seconds until the current window rolls over. */
  retryAfterSeconds: number;
  /** True when the counter could not be read/written; the caller decides. */
  degraded?: boolean;
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Deterministic fixed-window key. Exported for tests. */
export function windowStart(now: Date, windowMs: number): string {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
}

function secondsToRollover(now: Date, windowMs: number): number {
  const start = Math.floor(now.getTime() / windowMs) * windowMs;
  return Math.max(1, Math.ceil((start + windowMs - now.getTime()) / 1000));
}

/**
 * Count one attempt and say whether it is allowed. The row is written whether
 * or not the attempt is allowed, so hammering a blocked endpoint keeps the
 * window pinned instead of resetting it.
 *
 * On a D1 failure this returns `allowed: true, degraded: true` — a broken
 * counter table must not swallow a real customer's enquiry. The global alert
 * ceiling and the duplicate check are separate brakes for exactly that case.
 */
export async function consumeRateLimit(
  db: D1Database,
  action: string,
  subject: string,
  rule: RateLimitRule,
  now = new Date(),
): Promise<RateLimitResult> {
  const start = windowStart(now, rule.windowMs);
  const retryAfterSeconds = secondsToRollover(now, rule.windowMs);
  try {
    const row = await db
      .prepare(
        `INSERT INTO gpt_rate_limits (action, subject, window_start, count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(action, subject, window_start) DO UPDATE SET count = count + 1
         RETURNING count`,
      )
      .bind(action, subject, start)
      .first<{ count: number }>();
    const count = row?.count ?? 1;
    return {
      allowed: count <= rule.limit,
      count,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds,
    };
  } catch {
    return { allowed: true, count: 0, remaining: rule.limit, retryAfterSeconds, degraded: true };
  }
}

/**
 * Read a window without consuming it. Used by the owner-alert ceiling, which
 * must know whether it has ALREADY announced that it went quiet.
 */
export async function peekRateLimit(
  db: D1Database,
  action: string,
  subject: string,
  rule: RateLimitRule,
  now = new Date(),
): Promise<number> {
  try {
    const row = await db
      .prepare('SELECT count FROM gpt_rate_limits WHERE action = ? AND subject = ? AND window_start = ?')
      .bind(action, subject, windowStart(now, rule.windowMs))
      .first<{ count: number }>();
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Drop counter rows whose window closed. Cheap, and it keeps a table that is
 * written on every public POST from growing without bound. Best-effort: a
 * failed sweep is not worth a failed request.
 */
export async function pruneRateLimits(db: D1Database, olderThan: Date): Promise<void> {
  try {
    await db.prepare('DELETE FROM gpt_rate_limits WHERE window_start < ?').bind(olderThan.toISOString()).run();
  } catch {
    /* best-effort */
  }
}

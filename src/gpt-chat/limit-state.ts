// The chat's limit: which rule refused the last turn and when a turn fits
// again (plan WP-06, map 03 §3.1).
//
// Only the server sets or lifts a limit; the clock only says when to try
// again. The account view refreshes after every turn and on every window
// focus, and it cannot know a guest's allowance (a guest's view never reads
// D1), so it must never take a free-tier limit down: that was the card
// vanishing ~0.4 s after a 429 (F1). The exceptions: a pack with answers left
// appearing, which is a payment that just went through, and a pack's own day
// cap once the view shows no pack (signed out, or the pack ended).
//
// The reducer is pure (events carry the time), so StrictMode may run it
// twice. The limit is kept in sessionStorage: a reload or a trip to the
// payment page does not drop it, and it is the same limit on the RU and UZ
// chats because the server counts one allowance for both.

/** The 429's `reason` (functions/lib/gpt-chat/turn-store.ts LimitReason). */
export type LimitReason = 'hourly' | 'daily' | 'pack_daily' | 'monthly' | 'busy' | 'ip';

const REASONS: readonly LimitReason[] = ['hourly', 'daily', 'pack_daily', 'monthly', 'busy', 'ip'];

/** The refused tier's limits (the 429's `limits`, or the account's freeLimits). */
export interface LimitCounts {
  daily: number | null;
  hourly: number | null;
}

export interface LimitState {
  reason: LimitReason;
  /** When a turn fits again (epoch ms); null when time does not lift it ('monthly'). */
  retryAt: number | null;
  /** When the limit was set (epoch ms). */
  since: number;
  /** For the card's copy; null when the server did not say. */
  limits: LimitCounts | null;
}

export type LimitEvent =
  /** The server refused a turn (429 limit_reached). */
  | { type: 'blocked'; reason: LimitReason; retryAfterSec: number | null; limits: LimitCounts | null; now: number }
  /**
   * The account view arrived. `freeRemaining` is what the server itself
   * counted for a signed-in visitor without a pack (never a guest's cached
   * number); `packRemaining` is the valid pack's answers left, if any.
   */
  | { type: 'account'; freeRemaining: number | null; packRemaining: number | null; freeLimits: LimitCounts | null; now: number }
  /** The server answered a turn without refusing it. */
  | { type: 'admitted' };

/** How often the card re-reads the clock while it waits. */
export const LIMIT_TICK_MS = 15_000;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** turn-store.ts BUSY_RETRY_MS: the server's own hint for a refusal it could not explain. */
const BUSY_RETRY_MS = 5_000;
const STORAGE_KEY = 'gptchat_limit';

/** Reasons a pack with answers left lifts: the free tier's caps, and a spent pack. */
const LIFTED_BY_PACK: ReadonlySet<LimitReason> = new Set(['hourly', 'daily', 'monthly']);

/** The limits' day turns at 00:00 UTC (05:00 in Tashkent). */
export function nextUtcMidnight(now: number): number {
  return (Math.floor(now / DAY_MS) + 1) * DAY_MS;
}

/** A reason the server may send; anything else reads as the hourly pause, as it always did. */
export function limitReasonOf(value: unknown): LimitReason {
  return REASONS.includes(value as LimitReason) ? (value as LimitReason) : 'hourly';
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** The 429's `limits`, validated; null when absent or malformed. */
export function limitCounts(value: unknown): LimitCounts | null {
  if (!value || typeof value !== 'object') return null;
  const { daily, hourly } = value as Record<string, unknown>;
  const counts = { daily: count(daily), hourly: count(hourly) };
  return counts.daily === null && counts.hourly === null ? null : counts;
}

/** When a refusal without retryAfterSec (an older server) lifts, by reason. */
function defaultRetryAt(reason: LimitReason, now: number): number | null {
  switch (reason) {
    case 'daily':
    case 'pack_daily':
      return nextUtcMidnight(now);
    case 'hourly':
    case 'ip':
      return now + HOUR_MS;
    case 'busy':
      return now + BUSY_RETRY_MS;
    case 'monthly':
      return null;
  }
}

export function reduceLimit(state: LimitState | null, event: LimitEvent): LimitState | null {
  switch (event.type) {
    case 'blocked':
      return {
        reason: event.reason,
        retryAt:
          event.retryAfterSec !== null && Number.isFinite(event.retryAfterSec) && event.retryAfterSec >= 0
            ? event.now + event.retryAfterSec * 1000
            : defaultRetryAt(event.reason, event.now),
        since: event.now,
        limits: event.limits,
      };
    case 'admitted':
      return null;
    case 'account': {
      // A pack with answers left lifts what LIFTED_BY_PACK names. The pack's
      // own day cap holds only while there is a pack: signed out, or with the
      // pack spent or ended, the free tier applies, which the server counts
      // apart from the pack's answers.
      const pack = event.packRemaining !== null && event.packRemaining > 0;
      if (state && !(pack ? LIFTED_BY_PACK.has(state.reason) : state.reason === 'pack_daily')) return state;
      // The server counted this visitor's free day to the end and there is no pack.
      return event.freeRemaining === 0 && event.packRemaining === null
        ? { reason: 'daily', retryAt: nextUtcMidnight(event.now), since: event.now, limits: event.freeLimits }
        : null;
    }
  }
}

/** Whether the send button may be pressed. The server still decides. */
export function canSendNow(state: LimitState | null, now: number): boolean {
  return !state || (state.retryAt !== null && now >= state.retryAt);
}

/**
 * The rolling hour's count the header and the warning show: the last answered
 * turn's, or null once an hourly limit has lifted. The limit lifts an hour
 * after the oldest message of that hour, up to an hour before that count
 * expires, so it would say 0 next to «you can write again».
 */
export function hourCountShown(state: LimitState | null, hourLeft: number | null, now: number): number | null {
  return state?.reason === 'hourly' && canSendNow(state, now) ? null : hourLeft;
}

function validState(value: unknown): value is LimitState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return REASONS.includes(s.reason as LimitReason)
    && (s.retryAt === null || (typeof s.retryAt === 'number' && Number.isFinite(s.retryAt)))
    && typeof s.since === 'number' && Number.isFinite(s.since)
    && (s.limits === null || limitCounts(s.limits) !== null);
}

/**
 * The limit this tab is under, or null. One that has already lifted, one set
 * more than a day ago and anything malformed are dropped: the server is asked
 * again rather than a stale card shown.
 */
export function loadLimit(now: number): LimitState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!validState(parsed)) return null;
    if (parsed.retryAt !== null && parsed.retryAt <= now) return null;
    if (now - parsed.since > DAY_MS) return null;
    return { ...parsed, limits: parsed.limits === null ? null : limitCounts(parsed.limits) };
  } catch {
    return null;
  }
}

export function saveLimit(state: LimitState | null): void {
  try {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage denied: the limit lives for this page view only */
  }
}

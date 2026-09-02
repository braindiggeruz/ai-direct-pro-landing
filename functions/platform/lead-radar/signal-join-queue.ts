/**
 * Signal Radar join queue — the safety-critical part.
 *
 * Auto-joining groups on someone's real Telegram account is the single most
 * dangerous feature in this product: it is the only action that is visible to
 * strangers, irreversible in their eyes, and capable of getting the account
 * banned. Every decision here is therefore a *refusal by default*: a target has
 * to prove it is worth a join, and the queue has to have room, time and quota.
 *
 * This module is pure. It reads a snapshot and returns a decision; the caller
 * does the talking to D1 and to Telegram. That split is what makes the rules
 * testable without an account, a network or a database.
 *
 * Non-negotiable rules, all enforced here:
 *   - Channels are never joined. They can be read from the web for free.
 *   - At most `joinsPerDay` joins, then nothing until tomorrow.
 *   - A randomized pause between joins. Never a burst.
 *   - Joins only during local daytime.
 *   - Hard ceiling on joined groups, and a lower ceiling on probation.
 *   - Probation is read-only. An empty probation means a mandatory leave —
 *     otherwise the account slowly accumulates hundreds of dead groups.
 */

import type { SignalAutojoinMode, SignalTarget } from '../../../src/shared/signal-radar';

export interface SignalJoinPolicy {
  mode: SignalAutojoinMode;
  /** Joins per calendar day. Conservative on purpose: limits are undocumented. */
  joinsPerDay: number;
  minPauseMinutes: number;
  maxPauseMinutes: number;
  /** Hard ceiling: including active ones, never more groups than this. */
  maxJoined: number;
  /** Lower ceiling: probation is where risk concentrates. */
  maxProbation: number;
  probationDays: number;
  /** Local hours [start, end) when joining is allowed. */
  activeHours: { start: number; end: number };
  /** Minutes offset of the operator's local time from UTC. */
  utcOffsetMinutes: number;
  /** After a FloodWait: stop entirely, then resume at half quota. */
  floodCooldownHours: number;
  floodQuotaDivisor: number;
  /** Never join a group smaller than this — tiny groups are noise and risk. */
  minMembers: number;
  /** Minimum target score before a join is even considered. */
  minScore: number;
  maxAttempts: number;
}

export const SIGNAL_JOIN_POLICY: SignalJoinPolicy = {
  mode: 'discover',
  joinsPerDay: 4,
  minPauseMinutes: 5,
  maxPauseMinutes: 40,
  maxJoined: 200,
  maxProbation: 20,
  probationDays: 3,
  activeHours: { start: 9, end: 21 },
  utcOffsetMinutes: 300, // Tashkent, UTC+5
  floodCooldownHours: 48,
  floodQuotaDivisor: 2,
  minMembers: 200,
  minScore: 55,
  maxAttempts: 3,
};

export type JoinAction = 'join' | 'wait' | 'skip' | 'leave';

export interface JoinDecision {
  action: JoinAction;
  /** Short stable code for logs, tests and the UI. */
  reason: string;
  nextActionAt: string | null;
}

export interface JoinQueueSnapshot {
  /** Joins already performed today (local day). */
  joinsToday: number;
  /** Groups currently in probation. */
  probationCount: number;
  /** Groups in probation or active. */
  joinedCount: number;
  /** Set when a FloodWait paused the whole queue. */
  cooldownUntil: string | null;
  /** True while the quota is halved after a FloodWait. */
  quotaReduced: boolean;
  /** Local day key, e.g. "2026-09-02". */
  todayKey: string;
}

export function localDayKey(now: number, utcOffsetMinutes: number): string {
  return new Date(now + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function localHour(now: number, utcOffsetMinutes: number): number {
  return Number(new Date(now + utcOffsetMinutes * 60_000).toISOString().slice(11, 13));
}

/** Next local midnight, as an ISO instant. */
export function nextLocalDayStart(now: number, utcOffsetMinutes: number): string {
  const shifted = new Date(now + utcOffsetMinutes * 60_000);
  const next = new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1, 0, 0, 0,
  ));
  return new Date(next.getTime() - utcOffsetMinutes * 60_000).toISOString();
}

/**
 * Randomized pause between joins, inside [min, max]. Deterministic when a
 * `random` is supplied so tests can pin it.
 */
export function nextJoinDelayMs(policy: SignalJoinPolicy, random = Math.random): number {
  const span = Math.max(0, policy.maxPauseMinutes - policy.minPauseMinutes);
  const minutes = policy.minPauseMinutes + span * clamp01(random());
  return Math.round(minutes * 60_000);
}

export function effectiveDailyQuota(policy: SignalJoinPolicy, snapshot: JoinQueueSnapshot): number {
  const base = Math.max(0, policy.joinsPerDay);
  if (!snapshot.quotaReduced) return base;
  return Math.max(1, Math.floor(base / Math.max(1, policy.floodQuotaDivisor)));
}

export interface DecideJoinInput {
  target: Pick<SignalTarget, 'id' | 'kind' | 'status' | 'score' | 'members' | 'joinAttempts' | 'probationUntil'>;
  snapshot: JoinQueueSnapshot;
  policy?: SignalJoinPolicy;
  now?: number;
  random?: () => number;
}

/**
 * The gate. Returns `join` only when every condition holds; otherwise says why.
 */
export function decideJoin(input: DecideJoinInput): JoinDecision {
  const policy = input.policy ?? SIGNAL_JOIN_POLICY;
  const now = input.now ?? Date.now();
  const { target, snapshot } = input;

  if (policy.mode === 'off') return { action: 'skip', reason: 'mode_off', nextActionAt: null };

  // Channels are read from the web. Joining one would spend risk for nothing.
  if (target.kind === 'channel') return { action: 'skip', reason: 'channel_no_join', nextActionAt: null };
  if (target.kind !== 'group') return { action: 'skip', reason: 'kind_unknown', nextActionAt: null };

  if (target.status === 'ignored' || target.status === 'left') {
    return { action: 'skip', reason: `status_${target.status}`, nextActionAt: null };
  }
  if (target.status === 'probation' || target.status === 'active') {
    return { action: 'skip', reason: 'already_joined', nextActionAt: null };
  }
  // Only `watching` targets are eligible. A bare candidate has to prove itself
  // on web data first — that promotion is the ~95% filter promised in the plan.
  if (target.status !== 'watching') {
    return { action: 'skip', reason: `status_${target.status}`, nextActionAt: null };
  }

  if (snapshot.cooldownUntil && Date.parse(snapshot.cooldownUntil) > now) {
    return { action: 'wait', reason: 'cooldown', nextActionAt: snapshot.cooldownUntil };
  }
  if (snapshot.joinedCount >= policy.maxJoined) {
    return { action: 'skip', reason: 'joined_cap', nextActionAt: null };
  }
  if (snapshot.probationCount >= policy.maxProbation) {
    return { action: 'wait', reason: 'probation_cap', nextActionAt: nextLocalDayStart(now, policy.utcOffsetMinutes) };
  }
  if ((target.members ?? 0) < policy.minMembers) {
    return { action: 'skip', reason: 'too_small', nextActionAt: null };
  }
  if (target.score < policy.minScore) {
    return { action: 'skip', reason: 'score_low', nextActionAt: null };
  }
  if (target.joinAttempts >= policy.maxAttempts) {
    return { action: 'skip', reason: 'attempts_exhausted', nextActionAt: null };
  }

  // In `discover` and `channels` we queue the target but never touch the API.
  if (policy.mode !== 'join') {
    return { action: 'wait', reason: 'mode_read_only', nextActionAt: null };
  }

  const hour = localHour(now, policy.utcOffsetMinutes);
  if (hour < policy.activeHours.start || hour >= policy.activeHours.end) {
    const start = new Date(now + policy.utcOffsetMinutes * 60_000);
    const targetHour = hour < policy.activeHours.start ? policy.activeHours.start : policy.activeHours.start + 24;
    const next = new Date(Date.UTC(
      start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(),
      0, 0, 0,
    ) + targetHour * 3_600_000);
    return { action: 'wait', reason: 'outside_hours', nextActionAt: new Date(next.getTime() - policy.utcOffsetMinutes * 60_000).toISOString() };
  }

  const quota = effectiveDailyQuota(policy, snapshot);
  if (snapshot.joinsToday >= quota) {
    return { action: 'wait', reason: 'daily_quota', nextActionAt: nextLocalDayStart(now, policy.utcOffsetMinutes) };
  }

  return {
    action: 'join',
    reason: 'queued',
    nextActionAt: new Date(now + nextJoinDelayMs(policy, input.random)).toISOString(),
  };
}

export type ProbationVerdict = 'pending' | 'keep' | 'leave';

export interface ProbationInput {
  target: Pick<SignalTarget, 'id' | 'status' | 'probationUntil' | 'leadsSeen' | 'messagesSeen' | 'joinedAt'>;
  policy?: SignalJoinPolicy;
  now?: number;
}

/**
 * Probation is read-only for `probationDays`. A group that produced nothing
 * during that window is left — keeping it would mean paying with reputation for
 * a group that never converts.
 */
export function probationVerdict(input: ProbationInput): ProbationVerdict {
  const policy = input.policy ?? SIGNAL_JOIN_POLICY;
  const now = input.now ?? Date.now();
  const { target } = input;
  if (target.status !== 'probation') return 'pending';
  if (target.leadsSeen > 0) return 'keep';
  // A target promoted without a window still gets one, derived from the join.
  const until = target.probationUntil
    ? Date.parse(target.probationUntil)
    : target.joinedAt
      ? Date.parse(probationEndsAt(Date.parse(target.joinedAt), policy))
      : Number.NaN;
  if (!Number.isFinite(until)) return 'pending';
  return now >= until ? 'leave' : 'pending';
}

export function probationEndsAt(now: number, policy: SignalJoinPolicy = SIGNAL_JOIN_POLICY): string {
  return new Date(now + policy.probationDays * 86_400_000).toISOString();
}

export interface FloodWaitOutcome {
  cooldownUntil: string;
  quotaReduced: boolean;
  /** Telegram sometimes asks for days. We stop, but never silently. */
  hours: number;
}

/** After a FloodWait: stop, and come back at half quota. */
export function afterFloodWait(
  waitSeconds: number,
  now = Date.now(),
  policy: SignalJoinPolicy = SIGNAL_JOIN_POLICY,
): FloodWaitOutcome {
  const hours = Math.min(
    Math.max(policy.floodCooldownHours, Math.ceil(waitSeconds / 3600)),
    72,
  );
  return {
    hours,
    cooldownUntil: new Date(now + hours * 3_600_000).toISOString(),
    quotaReduced: true,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

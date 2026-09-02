import test from 'node:test';
import assert from 'node:assert/strict';
import {
  afterFloodWait,
  decideJoin,
  effectiveDailyQuota,
  localDayKey,
  localHour,
  nextJoinDelayMs,
  nextLocalDayStart,
  probationEndsAt,
  probationVerdict,
  SIGNAL_JOIN_POLICY,
  type JoinQueueSnapshot,
  type SignalJoinPolicy,
} from '../functions/platform/lead-radar/signal-join-queue';
import type { SignalTarget } from '../src/shared/signal-radar';

/**
 * These tests are the safety interlocks. Every one of them encodes a way the
 * auto-joiner could hurt the operator's account, so a regression here is a
 * production incident, not a test failure.
 */

const NOW = Date.parse('2026-09-02T10:00:00Z'); // 15:00 Tashkent (UTC+5)
const MINUTE = 60_000;
const HOUR = 3_600_000;

function target(patch: Partial<SignalTarget> = {}): SignalTarget {
  return {
    id: 'lrst_' + 'a'.repeat(32),
    orgId: 'owner_x',
    slug: 'tashkent_web',
    url: 'https://t.me/tashkent_web',
    kind: 'group',
    title: 'Tashkent Web',
    status: 'watching',
    score: 70,
    source: 'tgstat',
    members: 1500,
    messagesSeen: 0,
    leadsSeen: 0,
    joinAttempts: 0,
    nextActionAt: null,
    joinedAt: null,
    probationUntil: null,
    lastPostAt: null,
    note: null,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...patch,
  };
}

function snapshot(patch: Partial<JoinQueueSnapshot> = {}): JoinQueueSnapshot {
  return {
    joinsToday: 0,
    probationCount: 0,
    joinedCount: 0,
    cooldownUntil: null,
    quotaReduced: false,
    todayKey: localDayKey(NOW, 300),
    ...patch,
  };
}

const JOIN_POLICY: SignalJoinPolicy = { ...SIGNAL_JOIN_POLICY, mode: 'join' };

test('channels are never joined — they are readable from the web for free', () => {
  const decision = decideJoin({
    target: target({ kind: 'channel' }),
    snapshot: snapshot(),
    policy: JOIN_POLICY,
    now: NOW,
  });
  assert.equal(decision.action, 'skip');
  assert.equal(decision.reason, 'channel_no_join');
});

test('an unresolved kind is never joined', () => {
  const decision = decideJoin({
    target: target({ kind: 'unknown' }),
    snapshot: snapshot(),
    policy: JOIN_POLICY,
    now: NOW,
  });
  assert.equal(decision.action, 'skip');
  assert.equal(decision.reason, 'kind_unknown');
});

test('read-only modes queue the target but never touch the Telegram API', () => {
  for (const mode of ['off', 'discover', 'channels'] as const) {
    const decision = decideJoin({
      target: target(),
      snapshot: snapshot(),
      policy: { ...SIGNAL_JOIN_POLICY, mode },
      now: NOW,
    });
    assert.notEqual(decision.action, 'join', `mode ${mode} must not join`);
  }
  assert.equal(decideJoin({ target: target(), snapshot: snapshot(), now: NOW, policy: { ...SIGNAL_JOIN_POLICY, mode: 'off' } }).reason, 'mode_off');
  assert.equal(decideJoin({ target: target(), snapshot: snapshot(), now: NOW, policy: { ...SIGNAL_JOIN_POLICY, mode: 'discover' } }).reason, 'mode_read_only');
});

test('a fully qualified group joins, with a paced next action', () => {
  const decision = decideJoin({
    target: target(),
    snapshot: snapshot(),
    policy: JOIN_POLICY,
    now: NOW,
    random: () => 0.5,
  });
  assert.equal(decision.action, 'join');
  assert.equal(decision.reason, 'queued');
  assert.ok(decision.nextActionAt, 'a join must always schedule the next action');
  const delay = Date.parse(decision.nextActionAt!) - NOW;
  assert.ok(delay >= 5 * MINUTE && delay <= 40 * MINUTE, `delay out of policy: ${delay}`);
});

test('daily quota stops joins and resumes at local midnight', () => {
  const decision = decideJoin({
    target: target(),
    snapshot: snapshot({ joinsToday: JOIN_POLICY.joinsPerDay }),
    policy: JOIN_POLICY,
    now: NOW,
  });
  assert.equal(decision.action, 'wait');
  assert.equal(decision.reason, 'daily_quota');
  assert.equal(decision.nextActionAt, nextLocalDayStart(NOW, 300));
});

test('a FloodWait halves the daily quota and never zeroes it', () => {
  const { quotaReduced } = afterFloodWait(3600, NOW, JOIN_POLICY);
  const reduced = effectiveDailyQuota(JOIN_POLICY, { ...snapshot(), quotaReduced });
  assert.equal(reduced, Math.floor(JOIN_POLICY.joinsPerDay / JOIN_POLICY.floodQuotaDivisor));
  assert.ok(reduced >= 1, 'a reduced quota must still allow slow progress');
  assert.equal(effectiveDailyQuota(JOIN_POLICY, snapshot()), JOIN_POLICY.joinsPerDay);
});

test('cooldown blocks everything until it expires', () => {
  const decision = decideJoin({
    target: target(),
    snapshot: snapshot({ cooldownUntil: new Date(NOW + HOUR).toISOString() }),
    policy: JOIN_POLICY,
    now: NOW,
  });
  assert.equal(decision.action, 'wait');
  assert.equal(decision.reason, 'cooldown');
  const expired = decideJoin({
    target: target(),
    snapshot: snapshot({ cooldownUntil: new Date(NOW - HOUR).toISOString() }),
    policy: JOIN_POLICY,
    now: NOW,
  });
  assert.equal(expired.action, 'join');
});

test('an expired cooldown that is still outside active hours waits', () => {
  const night = Date.parse('2026-09-02T20:00:00Z'); // 01:00 Tashkent
  const decision = decideJoin({
    target: target(),
    snapshot: snapshot({ cooldownUntil: new Date(night - HOUR).toISOString() }),
    policy: JOIN_POLICY,
    now: night,
  });
  assert.equal(decision.action, 'wait');
  assert.equal(decision.reason, 'outside_hours');
});

test('hard ceilings: joined cap skips, probation cap waits', () => {
  const capped = decideJoin({
    target: target(),
    snapshot: snapshot({ joinedCount: JOIN_POLICY.maxJoined }),
    policy: JOIN_POLICY,
    now: NOW,
  });
  assert.equal(capped.action, 'skip');
  assert.equal(capped.reason, 'joined_cap');

  const probation = decideJoin({
    target: target(),
    snapshot: snapshot({ probationCount: JOIN_POLICY.maxProbation }),
    policy: JOIN_POLICY,
    now: NOW,
  });
  assert.equal(probation.action, 'wait');
  assert.equal(probation.reason, 'probation_cap');
  assert.equal(probation.nextActionAt, nextLocalDayStart(NOW, 300));
});

test('small, weak and exhausted targets are refused', () => {
  const cases: Array<[Partial<SignalTarget>, string]> = [
    [{ members: 50 }, 'too_small'],
    [{ score: 20 }, 'score_low'],
    [{ joinAttempts: JOIN_POLICY.maxAttempts }, 'attempts_exhausted'],
    [{ status: 'candidate' }, 'status_candidate'],
    [{ status: 'ignored' }, 'status_ignored'],
    [{ status: 'left' }, 'status_left'],
    [{ status: 'active' }, 'already_joined'],
    [{ status: 'probation' }, 'already_joined'],
  ];
  for (const [patch, reason] of cases) {
    const decision = decideJoin({
      target: target(patch),
      snapshot: snapshot(),
      policy: JOIN_POLICY,
      now: NOW,
    });
    assert.equal(decision.action, 'skip', `${reason} must skip`);
    assert.equal(decision.reason, reason);
  }
});

test('joins only happen in local daytime', () => {
  for (const hour of [0, 5, 8, 22, 23]) {
    // Build a UTC instant that lands on the given Tashkent hour.
    const utc = Date.parse(`2026-09-02T${String((hour - 5 + 24) % 24).padStart(2, '0')}:30:00Z`);
    assert.equal(localHour(utc, 300), hour, `hour math for ${hour}`);
    const decision = decideJoin({ target: target(), snapshot: snapshot(), policy: JOIN_POLICY, now: utc });
    assert.equal(decision.reason, 'outside_hours', `${hour}:00 must be outside active hours`);
  }
  for (const hour of [9, 12, 20]) {
    const utc = Date.parse(`2026-09-02T${String((hour - 5 + 24) % 24).padStart(2, '0')}:30:00Z`);
    const decision = decideJoin({ target: target(), snapshot: snapshot(), policy: JOIN_POLICY, now: utc, random: () => 0 });
    assert.equal(decision.action, 'join', `${hour}:00 must be inside active hours`);
  }
});

test('pause jitter stays inside the policy window at both extremes', () => {
  const policy = SIGNAL_JOIN_POLICY;
  assert.equal(nextJoinDelayMs(policy, () => 0), policy.minPauseMinutes * MINUTE);
  assert.equal(nextJoinDelayMs(policy, () => 1), policy.maxPauseMinutes * MINUTE);
  // 0.5 lands on the midpoint: 22.5 min. Rounding happens after scaling, so the
  // expected value is 1_350_000 ms, not round(22.5) * 60_000.
  assert.equal(nextJoinDelayMs(policy, () => 0.5), (policy.minPauseMinutes + policy.maxPauseMinutes) / 2 * MINUTE);
});

test('probation: keep on results, leave when empty and expired, pending otherwise', () => {
  const pending = probationVerdict({
    target: target({ status: 'probation', probationUntil: new Date(NOW + 2 * 86_400_000).toISOString(), leadsSeen: 0 }),
    now: NOW,
  });
  assert.equal(pending, 'pending');

  const empty = probationVerdict({
    target: target({ status: 'probation', probationUntil: new Date(NOW - MINUTE).toISOString(), leadsSeen: 0 }),
    now: NOW,
  });
  assert.equal(empty, 'leave', 'an empty probation must force a leave');

  const productive = probationVerdict({
    target: target({ status: 'probation', probationUntil: new Date(NOW - MINUTE).toISOString(), leadsSeen: 3 }),
    now: NOW,
  });
  assert.equal(productive, 'keep');

  assert.equal(probationVerdict({ target: target({ status: 'watching' }), now: NOW }), 'pending');
  assert.equal(probationVerdict({ target: target({ status: 'probation', probationUntil: null }), now: NOW }), 'pending');
});

test('probation window follows the policy', () => {
  const endsAt = probationEndsAt(NOW, SIGNAL_JOIN_POLICY);
  assert.equal(Date.parse(endsAt) - NOW, SIGNAL_JOIN_POLICY.probationDays * 86_400_000);
});

test('FloodWait cooldown is bounded to 48..72 hours', () => {
  assert.ok(afterFloodWait(60, NOW, JOIN_POLICY).hours >= 48);
  assert.equal(afterFloodWait(3600, NOW, JOIN_POLICY).hours, 48);
  assert.equal(afterFloodWait(72 * 3600, NOW, JOIN_POLICY).hours, 72);
  assert.equal(afterFloodWait(999 * 3600, NOW, JOIN_POLICY).hours, 72, 'a huge wait must not be trusted blindly');
  assert.ok(afterFloodWait(60, NOW, JOIN_POLICY).cooldownUntil > new Date(NOW).toISOString());
});

test('local day helpers respect the Tashkent offset', () => {
  assert.equal(localDayKey(Date.parse('2026-09-02T19:00:00Z'), 300), '2026-09-03');
  assert.equal(localDayKey(Date.parse('2026-09-02T10:00:00Z'), 300), '2026-09-02');
  const midnight = nextLocalDayStart(Date.parse('2026-09-02T10:00:00Z'), 300);
  assert.equal(localHour(Date.parse(midnight), 300), 0);
  assert.ok(Date.parse(midnight) > Date.parse('2026-09-02T10:00:00Z'));
});

test('default policy is read-only: nothing joins out of the box', () => {
  assert.equal(SIGNAL_JOIN_POLICY.mode, 'discover');
  const decision = decideJoin({ target: target(), snapshot: snapshot(), now: NOW });
  assert.notEqual(decision.action, 'join');
});

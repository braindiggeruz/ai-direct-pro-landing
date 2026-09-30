// Silence watchdog for the web chat (D6). It looks at what the chat DID, not
// at what failed: the 2026-08-25..09-03 outage (89 sessions, 0 answers) raised
// no alert because nobody watched for answers that never came.
//
// Every check needs traffic before it can fire, so a quiet night raises
// nothing. Checks, all per org:
//   chat_silence          in GPT_WATCHDOG_WINDOW_MINUTES (180) at least
//                         GPT_WATCHDOG_MIN_TURNS (3) settled turns, none done
//   chat_degraded         in the last 60 min at least 4 settled turns and
//                         fewer than half done (not raised with chat_silence)
//   chat_no_turns         in the window new sessions from at least MIN_TURNS
//                         distinct hashed IPs and no reservation at all:
//                         turns fail before admission
//   stale_reservations    more than 3 turns of the last hour still 'reserved'
//                         after their expiry (the isolate died mid-turn)
//   chat_truncation_high  over 24 h, of at least 20 turns with an outcome,
//                         more than 15 % 'truncated'
// A settled turn is 'done', 'released', or 'reserved' past its expires_at.
// Turns that say nothing about the service are left out of the counts (their
// outcome, migrations/0066): the visitor pressed Stop or left, the provider
// refused that one request, or the message did not fit. Otherwise one visitor
// pressing Stop three times on a quiet night would raise chat_silence. A turn
// cut at the length limit was answered. Turns settled before 0066 have no
// outcome and count as before.
// Codes go through recordServiceAlert, so each fires at most once an hour;
// alert-policy.ts decides which of them page the owner.
//
// runWatchdog runs at most every 10 minutes (lease task 'watchdog' in
// gpt_billing_ops), from the maintenance cron and, as a second circuit when
// the cron is down, from every failed chat turn.
import type { Env } from "../../_types";
import { boundedNum } from "./bridge-env";
import { BILLING_ORG } from "./billing-config";
import { recordServiceAlert } from "./billing-maintenance-store";
import { HOUR_MS } from "./rate-limit";

const LEASE_MS = 10 * 60_000;
const DEGRADED_MIN_TURNS = 4;
const STALE_MAX = 3;
const TRUNCATION_WINDOW_MS = 24 * HOUR_MS;
const TRUNCATION_MIN_TURNS = 20;
const TRUNCATION_MAX_SHARE = 0.15;
/**
 * Outcomes that say nothing about the service's health (turn-outcome.ts); a
 * turn settled before migrations/0066 has none and counts.
 */
const COUNTED =
  "COALESCE(outcome,'') NOT IN ('client_gone','refused','context_too_large')";

export interface WatchdogConfig {
  windowMs: number;
  minTurns: number;
}

export function watchdogConfig(env: Env): WatchdogConfig {
  return {
    windowMs:
      boundedNum(env.GPT_WATCHDOG_WINDOW_MINUTES, 180, 60, 1440) * 60_000,
    minTurns: boundedNum(env.GPT_WATCHDOG_MIN_TURNS, 3, 1, 100),
  };
}

export interface TurnStats {
  /** Settled turns created inside the window. */
  settled: number;
  /** Settled turns that got an answer ('done', or cut at the length limit). */
  done: number;
  /** Every reservation created inside the window, in flight included. */
  reserved: number;
  hourSettled: number;
  hourDone: number;
  hourStale: number;
}

export interface WatchdogSample {
  turns: TurnStats;
  /** Distinct hashed IPs that opened a chat session inside the window. */
  sessions: number;
  truncation: { turns: number; truncated: number };
}

/** Pure decision: which codes a sample raises. */
export function watchdogCodes(
  sample: WatchdogSample,
  cfg: WatchdogConfig,
): string[] {
  const { turns, sessions, truncation } = sample;
  const codes: string[] = [];
  const silent = turns.settled >= cfg.minTurns && turns.done === 0;
  if (silent) codes.push("chat_silence");
  else if (
    turns.hourSettled >= DEGRADED_MIN_TURNS &&
    turns.hourDone * 2 < turns.hourSettled
  )
    codes.push("chat_degraded");
  if (turns.reserved === 0 && sessions >= cfg.minTurns)
    codes.push("chat_no_turns");
  if (turns.hourStale > STALE_MAX) codes.push("stale_reservations");
  if (
    truncation.turns >= TRUNCATION_MIN_TURNS &&
    truncation.truncated > truncation.turns * TRUNCATION_MAX_SHARE
  )
    codes.push("chat_truncation_high");
  return codes;
}

/** Watchdog reads. SQL lives only here; every query is scoped to `org`. */
export class WatchdogStore {
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {}

  /** Take the 10-minute lease. False while another run holds it. */
  async claim(now: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        `INSERT INTO gpt_billing_ops(org_id,task,next_at) VALUES(?,'watchdog',?)
      ON CONFLICT(org_id,task) DO UPDATE SET next_at=excluded.next_at WHERE next_at<=? RETURNING task`,
      )
      .bind(this.org, now + LEASE_MS, now)
      .first();
    return !!row;
  }

  /** Needs the 0066 columns, which every caller's ensureBillingSchema guarantees. */
  async turns(now: number, windowMs: number): Promise<TurnStats> {
    const settled = `(status<>'reserved' OR expires_at<=?) AND ${COUNTED}`;
    const answered = `(status='done' OR outcome='truncated') AND ${COUNTED}`;
    const row = await this.db
      .prepare(
        `SELECT
        COALESCE(SUM(CASE WHEN ${settled} THEN 1 ELSE 0 END),0) AS settled,
        COALESCE(SUM(CASE WHEN ${answered} THEN 1 ELSE 0 END),0) AS done,
        COUNT(*) AS reserved,
        COALESCE(SUM(CASE WHEN created_at>=? AND ${settled} THEN 1 ELSE 0 END),0) AS hour_settled,
        COALESCE(SUM(CASE WHEN created_at>=? AND ${answered} THEN 1 ELSE 0 END),0) AS hour_done,
        COALESCE(SUM(CASE WHEN created_at>=? AND status='reserved' AND expires_at<=? THEN 1 ELSE 0 END),0) AS hour_stale
      FROM gpt_turn_reservations WHERE org_id=? AND created_at>=?`,
      )
      .bind(
        now,
        now - HOUR_MS,
        now,
        now - HOUR_MS,
        now - HOUR_MS,
        now,
        this.org,
        now - windowMs,
      )
      .first<{
        settled: number;
        done: number;
        reserved: number;
        hour_settled: number;
        hour_done: number;
        hour_stale: number;
      }>();
    return {
      settled: row?.settled ?? 0,
      done: row?.done ?? 0,
      reserved: row?.reserved ?? 0,
      hourSettled: row?.hour_settled ?? 0,
      hourDone: row?.hour_done ?? 0,
      hourStale: row?.hour_stale ?? 0,
    };
  }

  /**
   * Distinct hashed IPs that opened a session since `since`. Distinct, not
   * rows: POST /api/gpt/session needs no Turnstile, so one client posting it
   * in a loop, or one visitor on the RU and the UZ page, must not page the
   * owner with the urgent chat_no_turns. gpt_sessions is the consumer chat's
   * own pre-platform table: it has no org_id and holds only this chat's
   * sessions, so only the chat's own org reads it.
   */
  async sessions(since: number): Promise<number> {
    if (this.org !== BILLING_ORG) return 0;
    const row = await this.db
      .prepare(
        "SELECT COUNT(DISTINCT hashed_ip) AS n FROM gpt_sessions WHERE created_at>=?",
      )
      .bind(new Date(since).toISOString())
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  /** Outcome counts over 24 h (turns settled since migrations/0066). */
  async truncation(
    now: number,
  ): Promise<{ turns: number; truncated: number }> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS turns, COALESCE(SUM(CASE WHEN outcome='truncated' THEN 1 ELSE 0 END),0) AS truncated
      FROM gpt_turn_reservations WHERE org_id=? AND created_at>=? AND outcome IS NOT NULL`,
      )
      .bind(this.org, now - TRUNCATION_WINDOW_MS)
      .first<{ turns: number; truncated: number }>();
    return { turns: row?.turns ?? 0, truncated: row?.truncated ?? 0 };
  }
}

export interface WatchdogRun {
  /** False when another run holds the 10-minute lease. */
  ran: boolean;
  raised: string[];
}

/** One watchdog pass over the consumer chat's org. Throws only on a D1 failure. */
export async function runWatchdog(
  env: Env,
  now = Date.now(),
): Promise<WatchdogRun> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return { ran: false, raised: [] };
  const store = new WatchdogStore(db, BILLING_ORG);
  if (!(await store.claim(now))) return { ran: false, raised: [] };
  const cfg = watchdogConfig(env);
  const [turns, sessions, truncation] = await Promise.all([
    store.turns(now, cfg.windowMs),
    store.sessions(now - cfg.windowMs),
    store.truncation(now),
  ]);
  const raised = watchdogCodes({ turns, sessions, truncation }, cfg);
  for (const code of raised) await recordServiceAlert(env, code, now);
  return { ran: true, raised };
}

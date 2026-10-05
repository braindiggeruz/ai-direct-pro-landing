// The web chat's answer allowance (gpt_turn_reservations). One INSERT ...
// SELECT is both the admission decision and the reservation, atomic across
// isolates; reservations count before any upstream work.
//
// Admission rules (plan WP-05, decisions L3, L5 and R2), all at once:
//   free tier   per UTC day and per rolling hour (GPT_FREE_DAILY_LIMIT,
//               GPT_FREE_HOURLY_LIMIT), counted by account AND by IP hash
//               among turns without a pack: for a visitor without a pack,
//               signing in or out gives no new allowance, and a spent pack
//               does not touch it;
//   pack holder free answers first (decision R2): the same day and hour,
//               counted by the account alone. Only a turn they refuse is an
//               answer from the pack: PACK_DAILY_LIMIT pack answers a UTC day
//               and the pack's own message_limit; no hourly cap (none in the
//               pack's terms). One statement picks the allowance and reserves
//               on it. A holder's free answer is marked (ACCOUNT_FREE_ID) and
//               never counts against the address: the neighbours behind it
//               keep their free answers. The other way round, what the
//               address spent as a guest (the holder signed out or not yet
//               signed in, or a neighbour) does not count against the
//               holder: at most one more free day's answers a day, the price
//               of never taking the neighbours' (docs/paid-chat/LIMITS-RU.md);
//   both        at most MAX_CONCURRENT_TURNS in flight per subject, and an
//               abuse ceiling of requests per IP hash and rolling hour.
// A refusal is explained by the same rules (explain): the precise reason and
// when a turn fits again. The UTC day starts at 05:00 in Tashkent.
import type { AccessPeriod } from "./billing-store";
import type { GptChatConfig } from "./config";
import { spendDay } from "./model-spend-store";
import { DAY_MS, HOUR_MS } from "./rate-limit";
import type { TurnOutcome } from "./turn-outcome";

/** How a turn settled (migrations/0066 columns); counts and ids only, never text. */
export interface TurnSettlement {
  outcome: TurnOutcome;
  /** Counts against the allowance: status 'done'; otherwise 'released'. */
  charged: boolean;
  model?: string | null;
  finishReason?: string | null;
  cancelReason?: string | null;
  ttftMs?: number | null;
  totalMs?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  reasoningTokens?: number | null;
  costMicroUsd?: number | null;
  attempts?: number | null;
}

/** What is left for the subject after a turn. */
export interface Allowance {
  /** Answers left today (free tier) or in every pack the account can draw from. */
  remaining: number;
  /** Free tier only: answers left in the rolling hour; null for a pack. */
  hourRemaining: number | null;
  /**
   * A pack only: pack answers its day cap (PACK_DAILY_LIMIT) still lets
   * through today, never more than `remaining`. The holder's free answers
   * come on top. The free tier's `remaining` is the day's already.
   */
  dayRemaining?: number;
  /**
   * A pack only: the holder's own free answers left today and in the rolling
   * hour, counted by the account. Turns draw on them before the pack (R2).
   */
  freeRemaining?: number;
  freeHourRemaining?: number;
}

/** Which allowance a reservation draws on: the free tier, or a pack (period_id). */
export type Bucket = "free" | "pack";

/** Answers a pack gives in one UTC day (decision L3). */
export const PACK_DAILY_LIMIT = 50;
/** Answers one subject may have in flight at once (the offer states it). */
export const MAX_CONCURRENT_TURNS = 2;
/** Requests per IP hash and rolling hour, whatever became of them: the abuse ceiling. */
const IP_HOURLY_CEILING = { free: 100, paid: 1000 } as const;
/** An unsettled reservation stops counting after this. */
const RESERVATION_MS = 120_000;
/** Retry hint when concurrent turns keep changing the counts under a refusal. */
const BUSY_RETRY_MS = 5_000;

/**
 * Reservation-id prefix of a pack holder's free answer (decision R2). Such a
 * row is counted by the account alone: the free tier's IP-hash rules skip it,
 * so a holder never spends the free answers of the neighbours behind the same
 * address. Every other id is a random UUID, which never contains ':'.
 */
export const ACCOUNT_FREE_ID = "acct-free:";
/** Rows the free tier's IP-hash rules leave out: a pack holder's free answers. */
const NOT_ACCOUNT_FREE = `id NOT LIKE '${ACCOUNT_FREE_ID}%'`;

/**
 * Why a turn was refused (the 429's `reason`):
 *   hourly      the free tier's rolling hour, by account or by IP hash
 *   daily       the free tier's UTC day, by account or by IP hash
 *   pack_daily  a pack holder's free answers are spent for the hour or the
 *               day, and so is the pack's UTC day (PACK_DAILY_LIMIT); it
 *               lifts with the pack's day. A holder never gets 'hourly' or
 *               'daily': the chat lifts those as soon as it sees a pack
 *               with answers left (src/gpt-chat/limit-state.ts)
 *   monthly     the pack is spent or no longer valid; the free tier still
 *               applies, so the chat retries the turn there
 *   busy        MAX_CONCURRENT_TURNS answers are still being prepared
 *   ip          the IP hash's hourly request ceiling
 */
export type LimitReason =
  | "hourly"
  | "daily"
  | "pack_daily"
  | "monthly"
  | "busy"
  | "ip";

export interface LimitExplanation {
  reason: LimitReason;
  /** When a turn fits again (epoch ms); null for 'monthly', which time does not lift. */
  retryAt: number | null;
  /** Answers left today (free tier) or in every pack the account can draw from. */
  remaining: number;
  /**
   * A pack holder refused as 'pack_daily' while the free day still has
   * answers (only the free hour, or a turn in flight, refuses those): when a
   * free answer fits again, before `retryAt`. `retryAt` stays the pack's
   * day, which the unchanged chat bundle needs to keep its card; it does not
   * read this yet (R-S3). Absent otherwise.
   */
  freeRetryAt?: number;
}

/** A reservation and the allowance it draws on, or why there is none. */
export type Admission =
  | { id: string; bucket: Bucket; remaining: number; limit?: undefined }
  | { id: null; limit: LimitExplanation };

// Counts as spent: answered, or reserved and not yet expired.
const ACTIVE = "(status='done' OR (status='reserved' AND expires_at>?))";

/** One admission rule: a turn is admitted while fewer than `limit` rows match `rows`. */
interface Rule {
  reason: Exclude<LimitReason, "monthly">;
  /** Condition on gpt_turn_reservations after `org_id=? AND`; placeholders bound by `binds`. */
  rows: string;
  binds: unknown[];
  limit: number;
  /**
   * When a refused turn fits again: 'day' at the next UTC midnight; 'hour'
   * one hour after the limit-th newest matching row was created; 'expiry'
   * when the limit-th latest-expiring matching reservation expires.
   */
  frees: "day" | "hour" | "expiry";
}

function dayStart(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

/** The rules of one turn, by what they guard. */
interface Rules {
  /** The free tier's day and hour. */
  free: Rule[];
  /** A pack answer's day cap; empty without a pack. */
  pack: Rule[];
  /** Every turn, whatever it draws on: answers in flight and the address's ceiling. */
  shared: Rule[];
}

function admissionRules(
  subject: string,
  ip: string,
  period: AccessPeriod | null,
  cfg: GptChatConfig,
  now: number,
): Rules {
  const day = dayStart(now);
  const hour = now - HOUR_MS;
  // expires_at is created_at + RESERVATION_MS, so the created_at bound only
  // lets the subject index skip the subject's settled history.
  const busy: Rule = {
    reason: "busy",
    rows: "subject=? AND status='reserved' AND expires_at>? AND created_at>?",
    binds: [subject, now, now - RESERVATION_MS],
    limit: MAX_CONCURRENT_TURNS,
    frees: "expiry",
  };
  const ipCeiling: Rule = {
    reason: "ip",
    rows: "ip_hash=? AND created_at>?",
    binds: [ip, hour],
    limit: IP_HOURLY_CEILING[period ? "paid" : "free"],
    frees: "hour",
  };
  // The free tier's day and hour among turns without a pack, by `key`. By
  // the IP hash, a pack holder's free answers are left out (ACCOUNT_FREE_ID).
  const free = (
    reason: "daily" | "hourly",
    key: "subject" | "ip_hash",
    value: string,
  ): Rule => {
    const rows = `period_id IS NULL${key === "ip_hash" ? ` AND ${NOT_ACCOUNT_FREE}` : ""} AND ${ACTIVE}`;
    return reason === "daily"
      ? {
          reason,
          rows: `${key}=? AND created_at>=? AND ${rows}`,
          binds: [value, day, now],
          limit: cfg.freeDailyLimit,
          frees: "day",
        }
      : {
          reason,
          rows: `${key}=? AND created_at>? AND ${rows}`,
          binds: [value, hour, now],
          limit: cfg.freeHourlyLimit,
          frees: "hour",
        };
  };
  if (period)
    return {
      // Decision R2: the holder's own free answers, by the account alone.
      free: [free("daily", "subject", subject), free("hourly", "subject", subject)],
      // The pack's day counts the account's pack answers, of every pack.
      pack: [
        {
          reason: "pack_daily",
          rows: `subject=? AND created_at>=? AND period_id IS NOT NULL AND ${ACTIVE}`,
          binds: [subject, day, now],
          limit: PACK_DAILY_LIMIT,
          frees: "day",
        },
      ],
      shared: [busy, ipCeiling],
    };
  // Decision L5: by the account AND by the IP hash, among turns without a pack.
  return {
    free: [
      free("daily", "subject", subject),
      free("daily", "ip_hash", ip),
      free("hourly", "subject", subject),
      free("hourly", "ip_hash", ip),
    ],
    pack: [],
    shared: [busy, ipCeiling],
  };
}

/** `rules` as guards on gpt_turn_reservations, each true while the rule admits, and their binds. */
function guards(org: string, rules: Rule[]): { sql: string[]; binds: unknown[] } {
  return {
    sql: rules.map(
      (rule) => `(SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND ${rule.rows})<?`,
    ),
    binds: rules.flatMap((rule) => [org, ...rule.binds, rule.limit]),
  };
}

// The pack's own ceiling: answers spent in it, and whether it is still valid
// (not revoked: a refund the Seller made closes it).
const PACK_USED = `(SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND period_id=? AND ${ACTIVE})`;
const PACK_VALID =
  "EXISTS(SELECT 1 FROM gpt_access_periods WHERE org_id=? AND order_id=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>?)";
// Answers left in every valid pack of the account and mode of pack `?`:
// packs run side by side, so what the account has left is their sum, as
// BillingStore.usablePacks lists them. Binds now, org, the pack's order id, now x2.
const PACKS_LEFT = `(SELECT COALESCE(SUM(MAX(0,p.message_limit-(SELECT COUNT(*) FROM gpt_turn_reservations r
    WHERE r.org_id=p.org_id AND r.period_id=p.order_id AND (r.status='done' OR (r.status='reserved' AND r.expires_at>?))))),0)
  FROM gpt_access_periods p JOIN gpt_access_periods d ON d.org_id=p.org_id AND d.user_id=p.user_id AND d.mode=p.mode
  WHERE d.org_id=? AND d.order_id=? AND p.revoked_at IS NULL AND p.starts_at<=? AND p.ends_at>?)`;

// Provider-reported values are stored only as what they claim to be.
function count(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function label(value: string | null | undefined): string | null {
  return value ? value.slice(0, 128) : null;
}

export class TurnStore {
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {}
  /**
   * Reserve one answer for `subject` (an account, or the IP hash of a guest).
   * `ip` is the IP hash. Without `period` the answer is the free tier's. With
   * it (decision R2) the holder's own free answers come first and the pack
   * only once they refuse; a spent or ended pack refuses both ('monthly').
   * One statement decides which and reserves on it, so two tabs at once can
   * neither both take the last free answer nor both the pack's last one.
   */
  async reserve(
    subject: string,
    ip: string,
    period: AccessPeriod | null,
    cfg: GptChatConfig,
    now = Date.now(),
  ): Promise<Admission> {
    const rules = admissionRules(subject, ip, period, cfg, now);
    const shared = guards(this.org, rules.shared);
    const free = guards(this.org, rules.free);
    let select: string;
    let binds: unknown[];
    if (!period) {
      select = `SELECT ?,?,?,?,NULL,'reserved',?,? WHERE ${[...free.sql, ...shared.sql].join(" AND ")}`;
      binds = [...free.binds, ...shared.binds];
    } else {
      // g.free: the holder's free day and hour admit the turn; g.pack: the
      // pack's day does; g.open: the turn may run at all, and the pack is
      // valid with an answer left. A free answer is marked ACCOUNT_FREE_ID,
      // a pack answer carries the pack. The SELECT list's binds come first.
      const pack = guards(this.org, rules.pack);
      select = `SELECT ?,CASE WHEN g.free THEN ? ELSE ? END,?,?,CASE WHEN g.free THEN NULL ELSE ? END,'reserved',?,?
        FROM (SELECT (${free.sql.join(" AND ")}) AS free, (${pack.sql.join(" AND ")}) AS pack,
          (${[...shared.sql, `${PACK_USED}<?`, PACK_VALID].join(" AND ")}) AS open) g
        WHERE g.open AND (g.free OR g.pack)`;
      binds = [
        ...free.binds,
        ...pack.binds,
        ...shared.binds,
        this.org,
        period.order_id,
        now,
        period.message_limit,
        this.org,
        period.order_id,
        now,
        now,
      ];
    }
    // A refusal whose cause cleared before explain() read it (a concurrent
    // turn settled in between) is retried once.
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = crypto.randomUUID();
      const row = await this.db
        .prepare(
          `INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at)
        ${select} RETURNING id,period_id`,
        )
        .bind(
          ...(period
            ? [this.org, ACCOUNT_FREE_ID + id, id, subject, ip, period.order_id]
            : [this.org, id, subject, ip]),
          now,
          now + RESERVATION_MS,
          ...binds,
        )
        .first<{ id: string; period_id: string | null }>();
      if (row)
        return {
          id: row.id,
          bucket: row.period_id === null ? "free" : "pack",
          remaining: (await this.allowance(subject, ip, period, cfg, now)).remaining,
        };
      const limit = await this.explain(subject, ip, period, cfg, now);
      if (limit) return { id: null, limit };
    }
    // Twice refused and twice cleared: concurrent turns of this subject or IP
    // are settling under us, so the answer is the one for a turn in flight.
    return {
      id: null,
      limit: {
        reason: "busy",
        retryAt: now + BUSY_RETRY_MS,
        remaining: (await this.allowance(subject, ip, period, cfg, now)).remaining,
      },
    };
  }
  /**
   * Why reserve() refuses a turn right now, in one SELECT over the same
   * rules; null when nothing refuses it. When several rules refuse, the one
   * that lifts last is the reason; a spent or ended pack ('monthly') wins.
   *
   * A pack holder's free answers and the pack's day refuse only together,
   * and the reason is then 'pack_daily', which lifts with the pack's day: the
   * chat keeps that card while the pack has answers left, where it lifts an
   * 'hourly' one at once (src/gpt-chat/limit-state.ts). A free hour that
   * frees up sooner is still admitted to the next turn sent, from another
   * tab for one; `freeRetryAt` says when.
   */
  async explain(
    subject: string,
    ip: string,
    period: AccessPeriod | null,
    cfg: GptChatConfig,
    now = Date.now(),
  ): Promise<LimitExplanation | null> {
    const { free, pack, shared } = admissionRules(subject, ip, period, cfg, now);
    const rules = [...free, ...pack, ...shared];
    // A 'day' rule yields its count; any other yields the edge row's time
    // when the rule refuses (the limit-th newest matching row), else NULL.
    const columns = rules.map((rule, i) => {
      if (rule.frees === "day")
        return `(SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND ${rule.rows}) AS r${i}`;
      const edge = rule.frees === "hour" ? "created_at" : "expires_at";
      return `(SELECT CASE WHEN COUNT(*)>=? THEN MIN(edge) END FROM (SELECT ${edge} AS edge FROM gpt_turn_reservations WHERE org_id=? AND ${rule.rows} ORDER BY ${edge} DESC LIMIT ?)) AS r${i}`;
    });
    const binds = rules.flatMap((rule) =>
      rule.frees === "day"
        ? [this.org, ...rule.binds]
        : [rule.limit, this.org, ...rule.binds, rule.limit],
    );
    if (period) {
      columns.push(`${PACK_USED} AS used`, `${PACK_VALID} AS valid`, `${PACKS_LEFT} AS packs_left`);
      binds.push(this.org, period.order_id, now, this.org, period.order_id, now, now, now, this.org, period.order_id, now, now);
    }
    const row = await this.db
      .prepare(`SELECT ${columns.join(",")}`)
      .bind(...binds)
      .first<Record<string, number | null>>();
    if (!row) return null;
    // When each rule lets a turn through again; null while it admits one.
    const retry = rules.map((rule, i): number | null => {
      const value = row[`r${i}`];
      if (rule.frees === "day")
        return Number(value) >= rule.limit ? dayStart(now) + DAY_MS : null;
      return value === null ? null : Number(value) + (rule.frees === "hour" ? HOUR_MS : 0);
    });
    const spentToday = Math.max(
      0,
      ...free.flatMap((rule, i) => (rule.frees === "day" ? [Number(row[`r${i}`])] : [])),
    );
    const remaining = Math.max(
      0,
      period ? Number(row.packs_left) : cfg.freeDailyLimit - spentToday,
    );
    if (period && (Number(row.used) >= period.message_limit || !row.valid))
      return { reason: "monthly", retryAt: null, remaining };
    const refusing = (from: number, to: number) =>
      rules.slice(from, to).flatMap((rule, i) => {
        const retryAt = retry[from + i];
        return retryAt === null ? [] : [{ reason: rule.reason, retryAt }];
      });
    const freeRefusals = refusing(0, free.length);
    const packRefusals = refusing(free.length, free.length + pack.length);
    const sharedRefusals = refusing(free.length + pack.length, rules.length);
    const candidates = [
      // A holder is refused by the free tier only when the pack's day refuses too.
      ...(period ? (freeRefusals.length ? packRefusals : []) : freeRefusals),
      ...sharedRefusals,
    ];
    let refusal: { reason: LimitReason; retryAt: number } | null = null;
    for (const candidate of candidates)
      if (!refusal || candidate.retryAt > refusal.retryAt) refusal = candidate;
    if (!refusal) return null;
    // A holder's free answers lift with the latest of the free rules and the
    // shared ones; the free day's is the pack's own midnight, so only an
    // earlier time is news.
    const freeLifts = Math.max(...[...freeRefusals, ...sharedRefusals].map((r) => r.retryAt));
    return period && refusal.reason === "pack_daily" && freeLifts < refusal.retryAt
      ? { ...refusal, remaining, freeRetryAt: freeLifts }
      : { ...refusal, remaining };
  }
  /**
   * The day's (or the packs') and, for the free tier, the rolling hour's
   * answers left, in one read; the free tier counts by account and by IP
   * hash, like reserve(). With a pack: what is left in every pack the
   * account can still draw from (a turn draws from `period` first and then
   * from the next one), the pack's day, and the holder's own free day and
   * hour, which turns draw on first. The chat reads it after the settlement,
   * so a released turn is already given back.
   */
  async allowance(
    subject: string,
    ip: string,
    period: AccessPeriod | null,
    cfg: GptChatConfig,
    now = Date.now(),
  ): Promise<Allowance> {
    const day = dayStart(now);
    const hour = now - HOUR_MS;
    const since = Math.min(day, hour);
    // The free tier's day and hour by `key`, counted as reserve() counts them.
    const counts = (key: "subject" | "ip_hash") =>
      `SELECT COALESCE(SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END),0) AS day,
        COALESCE(SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END),0) AS hour
        FROM gpt_turn_reservations WHERE org_id=? AND ${key}=? AND created_at>=? AND period_id IS NULL${key === "ip_hash" ? ` AND ${NOT_ACCOUNT_FREE}` : ""} AND ${ACTIVE}`;
    const countBinds = (value: string) => [day, hour, this.org, value, since, now];
    if (period) {
      // The pack's day is reserve()'s own pack_daily rule, counted the same way.
      const daily = admissionRules(subject, ip, period, cfg, now).pack[0];
      const row = await this.db
        .prepare(
          `SELECT ${PACKS_LEFT} AS packs_left, (SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND ${daily.rows}) AS today,
          s.day AS free_day, s.hour AS free_hour FROM (${counts("subject")}) s`,
        )
        .bind(now, this.org, period.order_id, now, now, this.org, ...daily.binds, ...countBinds(subject))
        .first<{ packs_left: number; today: number; free_day: number; free_hour: number }>();
      const remaining = Math.max(0, row?.packs_left ?? 0);
      return {
        remaining,
        hourRemaining: null,
        dayRemaining: Math.min(remaining, Math.max(0, daily.limit - (row?.today ?? 0))),
        freeRemaining: Math.max(0, cfg.freeDailyLimit - (row?.free_day ?? 0)),
        freeHourRemaining: Math.max(0, cfg.freeHourlyLimit - (row?.free_hour ?? 0)),
      };
    }
    const row = await this.db
      .prepare(
        `SELECT MAX(s.day,i.day) AS day, MAX(s.hour,i.hour) AS hour FROM (${counts("subject")}) s, (${counts("ip_hash")}) i`,
      )
      .bind(...countBinds(subject), ...countBinds(ip))
      .first<{ day: number; hour: number }>();
    return {
      remaining: Math.max(0, cfg.freeDailyLimit - (row?.day ?? 0)),
      hourRemaining: Math.max(0, cfg.freeHourlyLimit - (row?.hour ?? 0)),
    };
  }
  /**
   * Count a refusal in gpt_limit_hits: one row per UTC day, reason and
   * subject (the quota's pseudonymous key, never an address or a message).
   */
  async recordLimitHit(
    reason: LimitReason,
    tier: "free" | "paid",
    subject: string,
    now = Date.now(),
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO gpt_limit_hits(org_id,day,reason,tier,subject,n,first_at) VALUES(?,?,?,?,?,1,?)
        ON CONFLICT(org_id,day,reason,subject) DO UPDATE SET n=n+1`,
      )
      .bind(this.org, spendDay(now), reason, tier, subject, now)
      .run();
  }
  /**
   * Settle a reservation once: 'done' when charged, 'released' otherwise,
   * together with its telemetry (migrations/0066).
   */
  async finish(id: string, settlement: TurnSettlement): Promise<void> {
    await this.db
      .prepare(
        `UPDATE gpt_turn_reservations SET status=?,outcome=?,charged=?,model=?,finish_reason=?,cancel_reason=?,
        ttft_ms=?,total_ms=?,tokens_in=?,tokens_out=?,reasoning_tokens=?,cost_micro_usd=?,attempts=?
        WHERE org_id=? AND id=? AND status='reserved'`,
      )
      .bind(
        settlement.charged ? "done" : "released",
        settlement.outcome,
        settlement.charged ? 1 : 0,
        label(settlement.model),
        label(settlement.finishReason),
        label(settlement.cancelReason),
        count(settlement.ttftMs),
        count(settlement.totalMs),
        count(settlement.tokensIn),
        count(settlement.tokensOut),
        count(settlement.reasoningTokens),
        count(settlement.costMicroUsd),
        count(settlement.attempts),
        this.org,
        id,
      )
      .run();
  }
  async admitModelAttempt(period: AccessPeriod): Promise<boolean> {
    // Even an upstream timeout may be billable. Never refund this cost guard;
    // it is separate from the user's successful-answer allowance.
    const row = await this.db
      .prepare(
        `INSERT INTO gpt_model_attempts(org_id,id,period_id,created_at)
      SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM gpt_model_attempts WHERE org_id=? AND period_id=?)<?
      AND EXISTS(SELECT 1 FROM gpt_access_periods WHERE org_id=? AND order_id=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>?) RETURNING id`,
      )
      .bind(
        this.org,
        crypto.randomUUID(),
        period.order_id,
        Date.now(),
        this.org,
        period.order_id,
        period.message_limit * 3,
        this.org,
        period.order_id,
        Date.now(),
        Date.now(),
      )
      .first();
    return !!row;
  }
}

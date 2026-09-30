import type { AccessPeriod } from "./billing-store";
import type { GptChatConfig } from "./config";
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
  /** Answers left today (free tier) or in the pack. */
  remaining: number;
  /** Free tier only: answers left in the rolling hour; null for a pack. */
  hourRemaining: number | null;
}

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
  async reserve(
    subject: string,
    ip: string,
    period: AccessPeriod | null,
    cfg: GptChatConfig,
    now = Date.now(),
  ) {
    const id = crypto.randomUUID();
    const day = Math.floor(now / 86400_000) * 86400_000;
    // One INSERT ... SELECT is the admission decision AND reservation across
    // isolates. Bounded indexed counts replace the growing messages JOIN.
    // Reservations count before upstream work, not after a 60-second answer.
    const active = "(status='done' OR (status='reserved' AND expires_at>?))";
    const freeOnly = period ? "" : " AND period_id IS NULL";
    const periodGuard = period
      ? ` AND (SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND period_id=? AND ${active})<?
      AND EXISTS(SELECT 1 FROM gpt_access_periods WHERE org_id=? AND order_id=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>?)`
      : "";
    const result = await this.db
      .prepare(
        `INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at)
      SELECT ?,?,?,?,?,'reserved',?,? WHERE
      (SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND subject=? AND created_at>=? AND ${active}${freeOnly})<?
      AND (SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND subject=? AND created_at>=? AND ${active}${freeOnly})<?
      AND (SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND subject=? AND status='reserved' AND expires_at>?)<2
      AND (SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND ip_hash=? AND created_at>=?)<${period ? 1000 : 100}
      ${periodGuard} RETURNING id`,
      )
      .bind(
        this.org,
        id,
        subject,
        ip,
        period?.order_id ?? null,
        now,
        now + 120_000,
        this.org,
        subject,
        day,
        now,
        period ? 50 : cfg.freeDailyLimit,
        this.org,
        subject,
        now - 3600_000,
        now,
        period ? 20 : cfg.freeHourlyLimit,
        this.org,
        subject,
        now,
        this.org,
        ip,
        now - 3600_000,
        ...(period
          ? [
              this.org,
              period.order_id,
              now,
              period.message_limit,
              this.org,
              period.order_id,
              now,
              now,
            ]
          : []),
      )
      .first<{ id: string }>();
    const remaining = await this.remaining(subject, period, cfg, now);
    return {
      id: result?.id ?? null,
      remaining,
      reason: remaining === 0 ? (period ? "monthly" : "daily") : "hourly",
    };
  }
  async remaining(
    subject: string,
    period: AccessPeriod | null,
    cfg: GptChatConfig,
    now = Date.now(),
  ): Promise<number> {
    return (await this.allowance(subject, period, cfg, now)).remaining;
  }
  /**
   * The day's (or the pack's) and, for the free tier, the rolling hour's
   * answers left, in one read. The chat reads it after the settlement, so a
   * released turn is already given back.
   */
  async allowance(
    subject: string,
    period: AccessPeriod | null,
    cfg: GptChatConfig,
    now = Date.now(),
  ): Promise<Allowance> {
    const active = "(status='done' OR (status='reserved' AND expires_at>?))";
    if (period) {
      const row = await this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM gpt_turn_reservations WHERE org_id=? AND period_id=? AND ${active}`,
        )
        .bind(this.org, period.order_id, now)
        .first<{ n: number }>();
      return {
        remaining: Math.max(0, period.message_limit - (row?.n ?? 0)),
        hourRemaining: null,
      };
    }
    const day = Math.floor(now / 86400_000) * 86400_000;
    const hour = now - 3600_000;
    const row = await this.db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END),0) AS day,
        COALESCE(SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END),0) AS hour
        FROM gpt_turn_reservations WHERE org_id=? AND subject=? AND created_at>=? AND period_id IS NULL AND ${active}`,
      )
      .bind(day, hour, this.org, subject, Math.min(day, hour), now)
      .first<{ day: number; hour: number }>();
    return {
      remaining: Math.max(0, cfg.freeDailyLimit - (row?.day ?? 0)),
      hourRemaining: Math.max(0, cfg.freeHourlyLimit - (row?.hour ?? 0)),
    };
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

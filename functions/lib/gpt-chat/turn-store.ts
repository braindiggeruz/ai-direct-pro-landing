import type { AccessPeriod } from "./billing-store";
import type { GptChatConfig } from "./config";
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
    const predicate = period
      ? "period_id=?"
      : "subject=? AND created_at>=? AND period_id IS NULL";
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM gpt_turn_reservations WHERE org_id=? AND ${predicate} AND (status='done' OR (status='reserved' AND expires_at>?))`,
      )
      .bind(
        this.org,
        ...(period
          ? [period.order_id]
          : [subject, Math.floor(now / 86400_000) * 86400_000]),
        now,
      )
      .first<{ n: number }>();
    return Math.max(
      0,
      (period?.message_limit ?? cfg.freeDailyLimit) - (row?.n ?? 0),
    );
  }
  async finish(id: string, hasAnswer: boolean): Promise<void> {
    await this.db
      .prepare(
        "UPDATE gpt_turn_reservations SET status=? WHERE org_id=? AND id=? AND status='reserved'",
      )
      .bind(hasAnswer ? "done" : "released", this.org, id)
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

import {
  addCalendarMonth,
  PAID_MESSAGES,
  PAYMENT_TTL_MS,
  PRICE_TIYIN,
  type BillingMode,
  type LocalProvider,
} from "./billing-config";

export interface Order {
  seq: number;
  org_id: string;
  id: string;
  user_id: string;
  provider: LocalProvider;
  mode: BillingMode;
  request_id: string;
  amount: number;
  currency: string;
  state: "pending" | "prepared" | "paid" | "cancelled" | "refunded";
  external_id: string | null;
  provider_time: number | null;
  created_at: number;
  expires_at: number;
  create_time: number;
  perform_time: number;
  cancel_time: number;
  reason: number | null;
  version: number;
}
export interface AccessPeriod {
  order_id: string;
  starts_at: number;
  ends_at: number;
  message_limit: number;
  refund_requested_at: number | null;
}

export class BillingStore {
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {}
  order(id: string): Promise<Order | null> {
    return this.db
      .prepare("SELECT * FROM gpt_payment_orders WHERE org_id=? AND id=?")
      .bind(this.org, id)
      .first<Order>();
  }
  external(
    provider: LocalProvider,
    mode: BillingMode,
    id: string,
  ): Promise<Order | null> {
    return this.db
      .prepare(
        "SELECT * FROM gpt_payment_orders WHERE org_id=? AND provider=? AND mode=? AND external_id=?",
      )
      .bind(this.org, provider, mode, id)
      .first<Order>();
  }
  async createOrder(
    user: string,
    provider: LocalProvider,
    mode: BillingMode,
    requestId: string,
    now = Date.now(),
    consent?: { version: string; url: string; locale: 'ru' | 'uz' },
  ): Promise<Order> {
    const prior = await this.db
      .prepare(
        "SELECT * FROM gpt_payment_orders WHERE org_id=? AND user_id=? AND request_id=?",
      )
      .bind(this.org, user, requestId)
      .first<Order>();
    if (prior) {
      if (prior.provider !== provider || prior.mode !== mode)
        throw new Error("idempotency_conflict");
      if (consent) await this.assertConsent(prior.id, consent.version);
      return prior;
    }
    const pending = await this.db
      .prepare(
        "SELECT * FROM gpt_payment_orders WHERE org_id=? AND user_id=? AND provider=? AND mode=? AND state IN ('pending','prepared')",
      )
      .bind(this.org, user, provider, mode)
      .first<Order>();
    if (pending) {
      // Refresh/retry reuses the invoice; expiry cannot strand the account.
      if (pending.expires_at > now) {
        if (consent) await this.assertConsent(pending.id, consent.version);
        return pending;
      }
      await this.transition(pending.id, "cancelled", "invoice_expired", {
        now,
        reason: 4,
      });
    }
    const id = `pay_${crypto.randomUUID().replace(/-/g, "")}`;
    const event = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO gpt_payment_orders(org_id,id,user_id,provider,mode,request_id,amount,currency,state,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?,'UZS','pending',?,?)`,
        )
        .bind(
          this.org,
          id,
          user,
          provider,
          mode,
          requestId,
          PRICE_TIYIN,
          now,
          now + PAYMENT_TTL_MS,
        ),
      this.db
        .prepare(
          `INSERT INTO gpt_payment_journal(org_id,id,order_id,actor,method,to_state,created_at)
        SELECT org_id,?,id,'account','checkout','pending',? FROM gpt_payment_orders WHERE org_id=? AND id=?`,
        )
        .bind(event, now, this.org, id),
      ...(consent ? [this.db.prepare(`INSERT INTO gpt_payment_consents(org_id,order_id,user_id,version,url,locale,accepted_at)
        SELECT org_id,id,user_id,?,?,?,? FROM gpt_payment_orders WHERE org_id=? AND id=?`)
        .bind(consent.version, consent.url, consent.locale, now, this.org, id)] : []),
    ]);
    const row = await this.db
      .prepare(
        "SELECT * FROM gpt_payment_orders WHERE org_id=? AND user_id=? AND provider=? AND mode=? AND (request_id=? OR state IN ('pending','prepared')) ORDER BY created_at DESC LIMIT 1",
      )
      .bind(this.org, user, provider, mode, requestId)
      .first<Order>();
    if (!row || row.provider !== provider || row.mode !== mode)
      throw new Error("idempotency_conflict");
    if (consent) await this.assertConsent(row.id, consent.version);
    return row;
  }
  async assertConsent(order: string, version: string): Promise<void> {
    const row = await this.db.prepare('SELECT version FROM gpt_payment_consents WHERE org_id=? AND order_id=?')
      .bind(this.org, order).first<{ version: string }>();
    if (row?.version !== version) throw new Error('terms_changed');
  }
  async access(
    user: string,
    mode: BillingMode,
    now = Date.now(),
  ): Promise<AccessPeriod | null> {
    return this.db
      .prepare(
        `SELECT order_id,starts_at,ends_at,message_limit,refund_requested_at FROM gpt_access_periods
      WHERE org_id=? AND user_id=? AND mode=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>? ORDER BY starts_at LIMIT 1`,
      )
      .bind(this.org, user, mode, now, now)
      .first<AccessPeriod>();
  }
  async latest(user: string, mode: BillingMode): Promise<Order | null> {
    return this.db
      .prepare(
        "SELECT * FROM gpt_payment_orders WHERE org_id=? AND user_id=? AND mode=? ORDER BY created_at DESC,seq DESC LIMIT 1",
      )
      .bind(this.org, user, mode)
      .first<Order>();
  }
  private async periodEnd(user: string, mode: BillingMode): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT COALESCE(MAX(ends_at),0) AS value FROM gpt_access_periods WHERE org_id=? AND user_id=? AND mode=? AND revoked_at IS NULL",
      )
      .bind(this.org, user, mode)
      .first<{ value: number }>();
    return row?.value ?? 0;
  }
  /** Audit's conditional INSERT is the transaction guard. All effects depend
   * on its unguessable ID, never changes() across unrelated statements. D1
   * batch is atomic; concurrent accounts/invoices retry against the new end. */
  async transition(
    id: string,
    target: "prepared" | "paid" | "cancelled",
    method: string,
    options: {
      externalId?: string;
      providerTime?: number;
      reason?: number;
      now?: number;
    } = {},
  ): Promise<Order> {
    const now = options.now ?? Date.now();
    for (let attempt = 0; attempt < 8; attempt++) {
      const row = await this.order(id);
      if (!row) throw new Error("not_found");
      if (
        options.externalId &&
        row.external_id &&
        options.externalId !== row.external_id
      )
        throw new Error("conflict");
      if (
        row.provider === "payme" &&
        options.providerTime !== undefined &&
        row.provider_time !== null &&
        options.providerTime !== row.provider_time
      )
        throw new Error("conflict");
      if (
        target === row.state ||
        (target === "cancelled" && row.state === "refunded")
      )
        return row;
      if (target === "prepared" && row.state !== "pending")
        throw new Error("state");
      if (target === "paid" && row.state !== "prepared")
        throw new Error("state");
      if (
        target === "cancelled" &&
        !["pending", "prepared", "paid"].includes(row.state)
      )
        throw new Error("state");
      const end =
        target === "paid" ? await this.periodEnd(row.user_id, row.mode) : 0;
      const start = Math.max(now, end);
      const nextEnd = addCalendarMonth(start);
      const nextState =
        target === "cancelled" && row.state === "paid" ? "refunded" : target;
      const event = crypto.randomUUID();
      const gate =
        "EXISTS(SELECT 1 FROM gpt_payment_journal WHERE org_id=? AND id=?)";
      const guard =
        target === "paid"
          ? ` AND ?=(SELECT COALESCE(MAX(ends_at),0) FROM gpt_access_periods WHERE org_id=? AND user_id=? AND mode=? AND revoked_at IS NULL)`
          : "";
      const audit = this.db
        .prepare(
          `INSERT INTO gpt_payment_journal(org_id,id,order_id,actor,method,from_state,to_state,created_at)
        SELECT org_id,?,id,?, ?,state,?,? FROM gpt_payment_orders WHERE org_id=? AND id=? AND version=?${guard}`,
        )
        .bind(
          event,
          method.startsWith("owner_")
            ? "owner"
            : ["timeout", "invoice_expired"].includes(method)
              ? "system"
              : row.provider,
          method,
          nextState,
          now,
          this.org,
          id,
          row.version,
          ...(target === "paid" ? [end, this.org, row.user_id, row.mode] : []),
        );
      const statements = [
        audit,
        this.db
          .prepare(
            `UPDATE gpt_payment_orders SET state=?,version=version+1,external_id=COALESCE(external_id,?),provider_time=COALESCE(provider_time,?),
          expires_at=CASE WHEN ?='prepared' AND provider='payme' THEN ? ELSE expires_at END,
          create_time=CASE WHEN ?='prepared' THEN ? ELSE create_time END,
          perform_time=CASE WHEN ?='paid' THEN ? ELSE perform_time END,
          cancel_time=CASE WHEN ?='cancelled' THEN ? ELSE cancel_time END,
          reason=CASE WHEN ?='cancelled' THEN ? ELSE reason END WHERE org_id=? AND id=? AND ${gate}`,
          )
          .bind(
            nextState,
            options.externalId ?? null,
            options.providerTime ?? null,
            target,
            (options.providerTime ?? now) + PAYMENT_TTL_MS,
            target,
            now,
            target,
            now,
            target,
            now,
            target,
            options.reason ?? null,
            this.org,
            id,
            this.org,
            event,
          ),
      ];
      if (target === "paid") {
        statements.push(
          this.db
            .prepare(
              `INSERT INTO gpt_access_periods(org_id,order_id,user_id,mode,starts_at,ends_at,message_limit)
          SELECT ?,?,?,?,?,?,? WHERE ${gate}`,
            )
            .bind(
              this.org,
              id,
              row.user_id,
              row.mode,
              start,
              nextEnd,
              PAID_MESSAGES,
              this.org,
              event,
            ),
        );
        if (row.mode === 'live') statements.push(
          this.db
            .prepare(
              `INSERT INTO gpt_subscriptions(id,user_id,provider,provider_subscription_id,plan,status,current_period_end,created_at,updated_at)
          SELECT ?,?,?,?,'plus','active',?,?,? WHERE ${gate}`,
            )
            .bind(
              id,
              row.user_id,
              row.provider,
              row.external_id,
              new Date(nextEnd).toISOString(),
              new Date(now).toISOString(),
              new Date(now).toISOString(),
              this.org,
              event,
            ),
        );
      }
      if (target === "cancelled") {
        statements.push(
          this.db
            .prepare(
              `UPDATE gpt_access_periods SET revoked_at=? WHERE org_id=? AND order_id=? AND ${gate}`,
            )
            .bind(now, this.org, id, this.org, event),
        );
        statements.push(
          this.db
            .prepare(
              `UPDATE gpt_subscriptions SET status='cancelled',updated_at=? WHERE id=? AND ${gate}`,
            )
            .bind(new Date(now).toISOString(), id, this.org, event),
        );
      }
      if (target !== "prepared")
        statements.push(
          this.db
            .prepare(
              `INSERT INTO gpt_billing_outbox(org_id,id,order_id,event,created_at,available_at)
        SELECT ?,?,?,?,?,? WHERE ${gate}`,
            )
            .bind(this.org, event, id, nextState, now, now, this.org, event),
        );
      await this.db.batch(statements);
      const updated = await this.order(id);
      if (
        updated &&
        updated.version > row.version &&
        updated.state === nextState &&
        (!options.externalId || updated.external_id === options.externalId) &&
        (row.provider !== "payme" ||
          options.providerTime === undefined ||
          updated.provider_time === options.providerTime)
      )
        return updated;
    }
    throw new Error("busy");
  }
  async statement(
    provider: LocalProvider,
    mode: BillingMode,
    from: number,
    to: number,
  ): Promise<Order[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM gpt_payment_orders WHERE org_id=? AND provider=? AND mode=? AND provider_time>=? AND provider_time<=? AND create_time>0 ORDER BY provider_time,seq",
      )
      .bind(this.org, provider, mode, from, to)
      .all<Order>();
    return result.results || [];
  }
  async requestRefund(
    user: string,
    id: string,
    now = Date.now(),
  ): Promise<boolean> {
    const event = `refund_request:${id}`;
    // A request does not claim money was returned and does not revoke access.
    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO gpt_payment_journal(org_id,id,order_id,actor,method,from_state,to_state,created_at)
        SELECT org_id,?,order_id,'user','refund_requested','paid','paid',? FROM gpt_access_periods WHERE org_id=? AND order_id=? AND user_id=? AND revoked_at IS NULL`,
        )
        .bind(event, now, this.org, id, user),
      this.db
        .prepare(
          `UPDATE gpt_access_periods SET refund_requested_at=COALESCE(refund_requested_at,?) WHERE org_id=? AND order_id=? AND user_id=? AND revoked_at IS NULL`,
        )
        .bind(now, this.org, id, user),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO gpt_billing_outbox(org_id,id,order_id,event,created_at,available_at)
        SELECT org_id,?,order_id,'refund_requested',?,? FROM gpt_access_periods WHERE org_id=? AND order_id=? AND user_id=? AND refund_requested_at IS NOT NULL`,
        )
        .bind(event, now, now, this.org, id, user),
    ]);
    return !!(await this.db
      .prepare(
        "SELECT order_id FROM gpt_access_periods WHERE org_id=? AND order_id=? AND user_id=? AND refund_requested_at IS NOT NULL",
      )
      .bind(this.org, id, user)
      .first());
  }
  nextAccess(
    user: string,
    mode: BillingMode,
    now = Date.now(),
  ): Promise<AccessPeriod | null> {
    return this.db
      .prepare(
        "SELECT order_id,starts_at,ends_at,message_limit,refund_requested_at FROM gpt_access_periods WHERE org_id=? AND user_id=? AND mode=? AND revoked_at IS NULL AND starts_at>? ORDER BY starts_at LIMIT 1",
      )
      .bind(this.org, user, mode, now)
      .first<AccessPeriod>();
  }
  async refundable(user: string, mode: BillingMode) {
    const rows = await this.db
      .prepare(
        `SELECT order_id,starts_at,ends_at,refund_requested_at FROM gpt_access_periods
      WHERE org_id=? AND user_id=? AND mode=? AND revoked_at IS NULL ORDER BY starts_at DESC LIMIT 10`,
      )
      .bind(this.org, user, mode)
      .all<{
        order_id: string;
        starts_at: number;
        ends_at: number;
        refund_requested_at: number | null;
      }>();
    return rows.results || [];
  }
  async fiscal(
    order: string,
    kind: "PERFORM" | "CANCEL",
    status: number,
    url: string | null,
  ) {
    await this.db
      .prepare(
        `INSERT INTO gpt_fiscal_receipts(org_id,order_id,kind,receipt_url,status_code,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(org_id,order_id,kind) DO UPDATE SET receipt_url=excluded.receipt_url,status_code=excluded.status_code,updated_at=excluded.updated_at`,
      )
      .bind(this.org, order, kind, url, status, Date.now())
      .run();
  }
  async receipts(user: string, mode: BillingMode) {
    const rows = await this.db
      .prepare(
        `SELECT r.kind,r.receipt_url FROM gpt_fiscal_receipts r JOIN gpt_payment_orders p ON p.id=r.order_id AND p.org_id=r.org_id
      WHERE r.org_id=? AND p.user_id=? AND p.mode=? AND r.status_code=0 AND r.receipt_url IS NOT NULL ORDER BY r.updated_at DESC LIMIT 10`,
      )
      .bind(this.org, user, mode)
      .all<{ kind: string; receipt_url: string }>();
    return rows.results || [];
  }
}

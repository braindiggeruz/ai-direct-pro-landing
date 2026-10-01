import {
  addCalendarMonth,
  PAID_MESSAGES,
  PAYMENT_TTL_MS,
  PLAN_ID,
  PRICE_TIYIN,
  type BillingMode,
  type LocalProvider,
} from "./billing-config";
import { isRehearsalAccount } from "./rehearsal";

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

/**
 * An unexpired invoice of the same account is still open at another
 * provider (U7): finish it or let it expire before paying elsewhere, so one
 * visitor never pays twice by accident.
 */
export class PendingElsewhereError extends Error {
  constructor(
    readonly orderId: string,
    readonly provider: LocalProvider,
  ) {
    super("pending_elsewhere");
  }
}

/** Closed set: SQL below names `this.table`, never caller-supplied text. */
export type OrderTable = "gpt_payment_orders" | "gpt_uzum_orders";
export const UZUM_ORDERS: OrderTable = "gpt_uzum_orders";

// A pack `p` a turn can still draw from: valid now, not revoked, answers
// left (spent ones count as TurnStore does). Binds org, user, mode, now x3.
const USABLE_PACK = `p.org_id=? AND p.user_id=? AND p.mode=? AND p.revoked_at IS NULL AND p.starts_at<=? AND p.ends_at>?
      AND (SELECT COUNT(*) FROM gpt_turn_reservations r WHERE r.org_id=p.org_id AND r.period_id=p.order_id
        AND (r.status='done' OR (r.status='reserved' AND r.expires_at>?)))<p.message_limit`;

export class BillingStore {
  readonly table: OrderTable;
  constructor(
    readonly db: D1Database,
    readonly org: string,
    table: OrderTable = "gpt_payment_orders",
  ) {
    if (table !== "gpt_payment_orders" && table !== UZUM_ORDERS)
      throw new Error("order_table");
    this.table = table;
  }
  order(id: string): Promise<Order | null> {
    return this.db
      .prepare(`SELECT * FROM ${this.table} WHERE org_id=? AND id=?`)
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
        `SELECT * FROM ${this.table} WHERE org_id=? AND provider=? AND mode=? AND external_id=?`,
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
    api?: "checkout" | "merchant",
  ): Promise<Order> {
    // Uzum rows live in their own table (0065); the old table's CHECK rejects them.
    if (
      (provider === "uzum") !== (this.table === UZUM_ORDERS) ||
      (api && this.table !== UZUM_ORDERS)
    )
      throw new Error("provider_table");
    // A synthetic rehearsal account buys in test only (rehearsal.ts).
    if (mode === "live" && isRehearsalAccount(user))
      throw new Error("rehearsal_live");
    const prior = await this.db
      .prepare(
        `SELECT * FROM ${this.table} WHERE org_id=? AND user_id=? AND request_id=?`,
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
        `SELECT * FROM ${this.table} WHERE org_id=? AND user_id=? AND provider=? AND mode=? AND state IN ('pending','prepared')`,
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
    // Every provider's open invoices, through the 0065 view (U7). The INSERT
    // repeats the check inside the batch, so two tabs opening two providers
    // at once cannot both get an invoice.
    const openElsewhere =
      "SELECT id,provider FROM gpt_payment_orders_all WHERE org_id=? AND user_id=? AND mode=? AND provider<>? AND state IN ('pending','prepared') AND expires_at>?";
    const elsewhere = async () => {
      const open = await this.db
        .prepare(`${openElsewhere} ORDER BY created_at DESC LIMIT 1`)
        .bind(this.org, user, mode, provider, now)
        .first<{ id: string; provider: LocalProvider }>();
      if (open) throw new PendingElsewhereError(open.id, open.provider);
    };
    await elsewhere();
    // 'uzm_' + 32 hex = 36 chars, the Uzum Checkout orderNumber maximum.
    const id = `${this.table === UZUM_ORDERS ? "uzm" : "pay"}_${crypto.randomUUID().replace(/-/g, "")}`;
    const event = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO ${this.table}(org_id,id,user_id,provider,mode,request_id,amount,currency,state,created_at,expires_at${api ? ",api" : ""})
        SELECT ?,?,?,?,?,?,?,'UZS','pending',?,?${api ? ",?" : ""} WHERE NOT EXISTS(${openElsewhere})`,
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
          ...(api ? [api] : []),
          this.org,
          user,
          mode,
          provider,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO gpt_payment_journal(org_id,id,order_id,actor,method,to_state,created_at)
        SELECT org_id,?,id,'account','checkout','pending',? FROM ${this.table} WHERE org_id=? AND id=?`,
        )
        .bind(event, now, this.org, id),
      ...(consent ? [this.db.prepare(`INSERT INTO gpt_payment_consents(org_id,order_id,user_id,version,url,locale,accepted_at)
        SELECT org_id,id,user_id,?,?,?,? FROM ${this.table} WHERE org_id=? AND id=?`)
        .bind(consent.version, consent.url, consent.locale, now, this.org, id)] : []),
    ]);
    const row = await this.db
      .prepare(
        `SELECT * FROM ${this.table} WHERE org_id=? AND user_id=? AND provider=? AND mode=? AND (request_id=? OR state IN ('pending','prepared')) ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(this.org, user, provider, mode, requestId)
      .first<Order>();
    // No row: the guarded INSERT lost to another provider's invoice.
    if (!row) await elsewhere();
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
  /**
   * The pack a turn draws from: a valid period with answers left (spent ones
   * count as TurnStore does), the one that ends first. A spent or ended pack
   * is not returned, so the free tier applies instead (decision L5).
   */
  async access(
    user: string,
    mode: BillingMode,
    now = Date.now(),
  ): Promise<AccessPeriod | null> {
    return this.db
      .prepare(
        `SELECT p.order_id,p.starts_at,p.ends_at,p.message_limit,p.refund_requested_at FROM gpt_access_periods p
      WHERE ${USABLE_PACK} ORDER BY p.ends_at LIMIT 1`,
      )
      .bind(this.org, user, mode, now, now, now)
      .first<AccessPeriod>();
  }
  /**
   * When the last pack a turn can still draw from ends. Packs run side by
   * side, so the account is paid through the latest of them, not through
   * the one access() draws from first.
   */
  async paidThrough(
    user: string,
    mode: BillingMode,
    now = Date.now(),
  ): Promise<number | null> {
    const row = await this.db
      .prepare(
        `SELECT MAX(p.ends_at) AS value FROM gpt_access_periods p WHERE ${USABLE_PACK}`,
      )
      .bind(this.org, user, mode, now, now, now)
      .first<{ value: number | null }>();
    return row?.value ?? null;
  }
  /** Newest order of any provider (Click/Payme and Uzum) for the account panel. */
  async latestAcrossProviders(
    user: string,
    mode: BillingMode,
  ): Promise<Order | null> {
    return this.db
      .prepare(
        "SELECT * FROM gpt_payment_orders_all WHERE org_id=? AND user_id=? AND mode=? ORDER BY created_at DESC,seq DESC LIMIT 1",
      )
      .bind(this.org, user, mode)
      .first<Order>();
  }
  async latest(user: string, mode: BillingMode): Promise<Order | null> {
    return this.db
      .prepare(
        `SELECT * FROM ${this.table} WHERE org_id=? AND user_id=? AND mode=? ORDER BY created_at DESC,seq DESC LIMIT 1`,
      )
      .bind(this.org, user, mode)
      .first<Order>();
  }
  /** Audit's conditional INSERT is the transaction guard. All effects depend
   * on its unguessable ID, never changes() across unrelated statements. D1
   * batch is atomic; a concurrent transition of the same order retries.
   * A paid order opens its own pack at once: one calendar month from the
   * payment, side by side with any pack still running (access() draws from
   * the one that ends first). */
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
      const nextEnd = addCalendarMonth(now);
      const nextState =
        target === "cancelled" && row.state === "paid" ? "refunded" : target;
      const event = crypto.randomUUID();
      const gate =
        "EXISTS(SELECT 1 FROM gpt_payment_journal WHERE org_id=? AND id=?)";
      const audit = this.db
        .prepare(
          `INSERT INTO gpt_payment_journal(org_id,id,order_id,actor,method,from_state,to_state,created_at)
        SELECT org_id,?,id,?, ?,state,?,? FROM ${this.table} WHERE org_id=? AND id=? AND version=?`,
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
        );
      const statements = [
        audit,
        this.db
          .prepare(
            `UPDATE ${this.table} SET state=?,version=version+1,external_id=COALESCE(external_id,?),provider_time=COALESCE(provider_time,?),
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
              now,
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
          SELECT ?,?,?,?,?,'active',?,?,? WHERE ${gate}`,
            )
            .bind(
              id,
              row.user_id,
              row.provider,
              row.external_id,
              PLAN_ID,
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
        `SELECT * FROM ${this.table} WHERE org_id=? AND provider=? AND mode=? AND provider_time>=? AND provider_time<=? AND create_time>0 ORDER BY provider_time,seq`,
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
        `SELECT r.kind,r.receipt_url FROM gpt_fiscal_receipts r JOIN gpt_payment_orders_all p ON p.id=r.order_id AND p.org_id=r.org_id
      WHERE r.org_id=? AND p.user_id=? AND p.mode=? AND r.status_code=0 AND r.receipt_url IS NOT NULL ORDER BY r.updated_at DESC LIMIT 10`,
      )
      .bind(this.org, user, mode)
      .all<{ kind: string; receipt_url: string }>();
    return rows.results || [];
  }
}
/** The order table a provider's rows live in. Click/Payme keep the 0064 table. */
export function storeFor(
  db: D1Database,
  org: string,
  provider: LocalProvider,
): BillingStore {
  return new BillingStore(
    db,
    org,
    provider === "uzum" ? UZUM_ORDERS : "gpt_payment_orders",
  );
}

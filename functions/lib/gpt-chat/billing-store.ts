import {
  PAYMENT_TTL_MS,
  type BillingMode,
  type LocalProvider,
} from "./billing-config";
import { isOnceOrder, ONCE_ORDERS, ONCE_PREFIX, packEnd, packOfOrder, PACKS, type Pack } from "./packs";
import { FISCAL_QUEUED, FISCAL_SKIPPED } from "./fiscal-store";
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
  /** A 3-day pack order's own column (gpt_payment_orders_v2); the pack of any order is read from its id (packs.ts). */
  sku?: string;
}
export interface AccessPeriod {
  order_id: string;
  starts_at: number;
  ends_at: number;
  message_limit: number;
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

/**
 * The terms the payer accepted for an order. `acceptedAt` is when, if not at
 * the order's creation: an Uzum app payment carries the acceptance its
 * payment code was shown with (payment-code-store.ts).
 */
export interface OrderConsent {
  version: string;
  url: string;
  locale: "ru" | "uz";
  acceptedAt?: number;
}

/** Closed set: SQL below names one of these, never caller-supplied text. */
export type OrderTable = "gpt_payment_orders" | "gpt_uzum_orders" | typeof ONCE_ORDERS;
export const UZUM_ORDERS: OrderTable = "gpt_uzum_orders";
/** Every chat order of the three tables (migrations/0085; the 0065 view names two). */
const ALL_ORDERS = "gpt_payment_orders_all2";

// Answers spent in pack `p`, counted as TurnStore does: done, or in flight.
// Binds now.
const PACK_USED = `(SELECT COUNT(*) FROM gpt_turn_reservations r WHERE r.org_id=p.org_id AND r.period_id=p.order_id
        AND (r.status='done' OR (r.status='reserved' AND r.expires_at>?)))`;
// A pack `p` a turn can still draw from: valid now, not revoked (a refund the
// Seller made closes it), answers left. Binds org, user, mode, now x3.
const USABLE_PACK = `p.org_id=? AND p.user_id=? AND p.mode=? AND p.revoked_at IS NULL
      AND p.starts_at<=? AND p.ends_at>? AND ${PACK_USED}<p.message_limit`;

/** A pack a turn can still draw from, with what is left in it (usablePacks). */
export interface UsablePack {
  order_id: string;
  starts_at: number;
  ends_at: number;
  message_limit: number;
  remaining: number;
}

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
  /**
   * The table an order lives in. The Click and Payme store holds two: the
   * 3-day pack's orders (pk_ ids, packs.ts) are in gpt_payment_orders_v2,
   * every other one in gpt_payment_orders. Uzum has its own, and one.
   */
  private tableOf(id: string): OrderTable {
    return this.table === UZUM_ORDERS ? UZUM_ORDERS : isOnceOrder(id) ? ONCE_ORDERS : "gpt_payment_orders";
  }
  /** The tables this store reads when it has no order id to go by. */
  private get tables(): OrderTable[] {
    return this.table === UZUM_ORDERS ? [UZUM_ORDERS] : ["gpt_payment_orders", ONCE_ORDERS];
  }
  order(id: string): Promise<Order | null> {
    return this.db
      .prepare(`SELECT * FROM ${this.tableOf(id)} WHERE org_id=? AND id=?`)
      .bind(this.org, id)
      .first<Order>();
  }
  /**
   * The order a provider's transaction belongs to, in either Click and Payme
   * table: a transaction id is one order's, whichever pack it bought.
   */
  async external(
    provider: LocalProvider,
    mode: BillingMode,
    id: string,
  ): Promise<Order | null> {
    for (const table of this.tables) {
      const row = await this.db
        .prepare(
          `SELECT * FROM ${table} WHERE org_id=? AND provider=? AND mode=? AND external_id=?`,
        )
        .bind(this.org, provider, mode, id)
        .first<Order>();
      if (row) return row;
    }
    return null;
  }
  async createOrder(
    user: string,
    provider: LocalProvider,
    mode: BillingMode,
    requestId: string,
    now = Date.now(),
    consent?: OrderConsent,
    api?: "checkout" | "merchant",
    /** What is bought (packs.ts): the sum, the table and the id prefix follow from it. */
    pack: Pack = PACKS.month,
  ): Promise<Order> {
    // Uzum rows live in their own table (0065); the old table's CHECK rejects them.
    if (
      (provider === "uzum") !== (this.table === UZUM_ORDERS) ||
      (api && this.table !== UZUM_ORDERS)
    )
      throw new Error("provider_table");
    // The 3-day pack is paid with Click or Payme (its table takes no other provider).
    const once = pack.sku === "once";
    if (once && this.table === UZUM_ORDERS) throw new Error("provider_table");
    const table: OrderTable = once ? ONCE_ORDERS : this.table;
    // A synthetic rehearsal account buys in test only (rehearsal.ts).
    if (mode === "live" && isRehearsalAccount(user))
      throw new Error("rehearsal_live");
    const prior = await this.db
      .prepare(
        `SELECT * FROM ${table} WHERE org_id=? AND user_id=? AND request_id=?`,
      )
      .bind(this.org, user, requestId)
      .first<Order>();
    if (prior) {
      if (prior.provider !== provider || prior.mode !== mode)
        throw new Error("idempotency_conflict");
      if (consent) await this.assertConsent(prior.id, consent.version);
      return prior;
    }
    // The other pack's table, for an account that pays with Click or Payme.
    const sibling: OrderTable | null =
      this.table === UZUM_ORDERS ? null : once ? "gpt_payment_orders" : ONCE_ORDERS;
    if (sibling) {
      // A request key is one order's: the same key cannot open the other pack.
      const other = await this.db
        .prepare(`SELECT id FROM ${sibling} WHERE org_id=? AND user_id=? AND request_id=?`)
        .bind(this.org, user, requestId)
        .first<{ id: string }>();
      if (other) throw new Error("pack_conflict");
    }
    const pending = await this.db
      .prepare(
        `SELECT * FROM ${table} WHERE org_id=? AND user_id=? AND provider=? AND mode=? AND state IN ('pending','prepared')`,
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
    // The visitor chose the other pack: an invoice of the first choice that no
    // provider has seen yet (nobody can be paying it) is closed, silently, as
    // an invoice the account closes itself is (invoice_superseded). One a
    // provider holds stays, and the new order waits for it (U7).
    if (sibling) {
      const others = await this.db
        .prepare(
          `SELECT id,provider,state,external_id,expires_at FROM ${sibling} WHERE org_id=? AND user_id=? AND mode=? AND state IN ('pending','prepared')`,
        )
        .bind(this.org, user, mode)
        .all<Pick<Order, "id" | "provider" | "state" | "external_id" | "expires_at">>();
      for (const open of others.results || []) {
        const expired = open.expires_at <= now;
        const unseen = open.state === "pending" && !open.external_id;
        if (!unseen && !expired) throw new PendingElsewhereError(open.id, open.provider);
        try {
          // Past its time: closed as this provider's own expired invoice is, above.
          if (expired) await this.transition(open.id, "cancelled", "invoice_expired", { now, reason: 4 });
          else await this.transition(open.id, "cancelled", "invoice_superseded", { now, from: ["pending"], unseen: true });
        } catch (error) {
          // A provider took it up in between: it is held now.
          if (error instanceof Error && error.message === "state") throw new PendingElsewhereError(open.id, open.provider);
          throw error;
        }
      }
    }
    // Every open invoice of the account but this provider's own of this pack
    // (U7), through the view of the three tables: another provider's, and the
    // other pack's. The INSERT repeats the check inside the batch, so two tabs
    // opening two invoices at once cannot both get one.
    const openElsewhere =
      `SELECT id,provider FROM ${ALL_ORDERS} WHERE org_id=? AND user_id=? AND mode=? AND NOT (provider=? AND substr(id,1,3)${once ? "=" : "<>"}'${ONCE_PREFIX}') AND state IN ('pending','prepared') AND expires_at>?`;
    const elsewhere = async () => {
      const open = await this.db
        .prepare(`${openElsewhere} ORDER BY created_at DESC,provider DESC,id DESC LIMIT 1`)
        .bind(this.org, user, mode, provider, now)
        .first<{ id: string; provider: LocalProvider }>();
      if (open) throw new PendingElsewhereError(open.id, open.provider);
    };
    await elsewhere();
    // 'uzm_' + 32 hex = 36 chars, the Uzum Checkout orderNumber maximum; 'pk_' + 32 hex = 35.
    const id = `${this.table === UZUM_ORDERS ? "uzm_" : once ? ONCE_PREFIX : "pay_"}${crypto.randomUUID().replace(/-/g, "")}`;
    const event = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO ${table}(org_id,id,user_id,provider,mode,request_id,amount,currency,state,created_at,expires_at${api ? ",api" : ""}${once ? ",sku" : ""})
        SELECT ?,?,?,?,?,?,?,'UZS','pending',?,?${api ? ",?" : ""}${once ? ",?" : ""} WHERE NOT EXISTS(${openElsewhere})`,
        )
        .bind(
          this.org,
          id,
          user,
          provider,
          mode,
          requestId,
          pack.amountTiyin,
          now,
          now + PAYMENT_TTL_MS,
          ...(api ? [api] : []),
          ...(once ? [pack.sku] : []),
          this.org,
          user,
          mode,
          provider,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO gpt_payment_journal(org_id,id,order_id,actor,method,to_state,created_at)
        SELECT org_id,?,id,'account','checkout','pending',? FROM ${table} WHERE org_id=? AND id=?`,
        )
        .bind(event, now, this.org, id),
      ...(consent ? [this.db.prepare(`INSERT INTO gpt_payment_consents(org_id,order_id,user_id,version,url,locale,accepted_at)
        SELECT org_id,id,user_id,?,?,?,? FROM ${table} WHERE org_id=? AND id=?`)
        .bind(consent.version, consent.url, consent.locale, consent.acceptedAt ?? now, this.org, id)] : []),
    ]);
    const row = await this.db
      .prepare(
        `SELECT * FROM ${table} WHERE org_id=? AND user_id=? AND provider=? AND mode=? AND (request_id=? OR state IN ('pending','prepared')) ORDER BY created_at DESC LIMIT 1`,
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
        `SELECT p.order_id,p.starts_at,p.ends_at,p.message_limit FROM gpt_access_periods p
      WHERE ${USABLE_PACK} ORDER BY p.ends_at,p.order_id LIMIT 1`,
      )
      .bind(this.org, user, mode, now, now, now)
      .first<AccessPeriod>();
  }
  /**
   * Every pack a turn can still draw from, the one access() draws from
   * first at the head. Packs run side by side: the account has their
   * answers left in all, and is paid through the latest end.
   */
  async usablePacks(
    user: string,
    mode: BillingMode,
    now = Date.now(),
  ): Promise<UsablePack[]> {
    const rows = await this.db
      .prepare(
        `SELECT p.order_id,p.starts_at,p.ends_at,p.message_limit,p.message_limit-${PACK_USED} AS remaining
      FROM gpt_access_periods p WHERE ${USABLE_PACK} ORDER BY p.ends_at,p.order_id LIMIT 20`,
      )
      .bind(now, this.org, user, mode, now, now, now)
      .all<UsablePack>();
    return rows.results || [];
  }
  /**
   * Newest order of any provider (Click/Payme and Uzum) for the account panel.
   * Ties break on provider and id: seq counts per table, so it says nothing
   * across the two (map 02, U13).
   */
  async latestAcrossProviders(
    user: string,
    mode: BillingMode,
  ): Promise<Order | null> {
    return this.db
      .prepare(
        `SELECT * FROM ${ALL_ORDERS} WHERE org_id=? AND user_id=? AND mode=? ORDER BY created_at DESC,provider DESC,id DESC LIMIT 1`,
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
   * A paid order opens its own pack at once: the pack it bought (packs.ts),
   * for its term from the payment, side by side with any pack still running
   * (access() draws from the one that ends first). */
  async transition(
    id: string,
    target: "prepared" | "paid" | "cancelled",
    method: string,
    options: {
      externalId?: string;
      /**
       * Click's click_paydoc_id, the number the buyer sees in the SMS and
       * receipt (gpt_payment_orders.provider_doc_id). Kept like externalId:
       * the first value stays. gpt_payment_orders only.
       */
      docId?: string;
      providerTime?: number;
      reason?: number;
      now?: number;
      /**
       * The states the order may leave. A caller acting on an earlier read
       * (an invoice to close, a transaction to expire) names the state it
       * saw, so an order paid in between throws "state" instead of being
       * refunded without its money going back.
       */
      from?: ReadonlyArray<Order["state"]>;
      /**
       * Only while no provider has seen the order (no external id yet): an
       * invoice the account or another payment closes. A registration that
       * lands in between makes this throw "state".
       */
      unseen?: boolean;
    } = {},
  ): Promise<Order> {
    const now = options.now ?? Date.now();
    const table = this.tableOf(id);
    const pack = packOfOrder(id);
    if (options.docId !== undefined && this.table === UZUM_ORDERS) throw new Error("doc_id_unsupported");
    const docColumn = options.docId !== undefined ? ",provider_doc_id=COALESCE(provider_doc_id,?)" : "";
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
      if (options.from && !options.from.includes(row.state)) throw new Error("state");
      if (options.unseen && row.external_id) throw new Error("state");
      if (target === "prepared" && row.state !== "pending")
        throw new Error("state");
      if (target === "paid" && row.state !== "prepared")
        throw new Error("state");
      if (
        target === "cancelled" &&
        !["pending", "prepared", "paid"].includes(row.state)
      )
        throw new Error("state");
      const nextEnd = packEnd(pack, now);
      const nextState =
        target === "cancelled" && row.state === "paid" ? "refunded" : target;
      const event = crypto.randomUUID();
      const gate =
        "EXISTS(SELECT 1 FROM gpt_payment_journal WHERE org_id=? AND id=?)";
      const audit = this.db
        .prepare(
          `INSERT INTO gpt_payment_journal(org_id,id,order_id,actor,method,from_state,to_state,created_at)
        SELECT org_id,?,id,?, ?,state,?,? FROM ${table} WHERE org_id=? AND id=? AND version=?${options.unseen ? " AND external_id IS NULL" : ""}`,
        )
        .bind(
          event,
          method.startsWith("owner_")
            ? "owner"
            : method === "invoice_cancelled"
              ? "user"
              : ["timeout", "invoice_expired", "invoice_superseded"].includes(method)
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
            `UPDATE ${table} SET state=?,version=version+1,external_id=COALESCE(external_id,?)${docColumn},provider_time=COALESCE(provider_time,?),
          expires_at=CASE WHEN ?='prepared' AND provider='payme' THEN ? ELSE expires_at END,
          create_time=CASE WHEN ?='prepared' THEN ? ELSE create_time END,
          perform_time=CASE WHEN ?='paid' THEN ? ELSE perform_time END,
          cancel_time=CASE WHEN ?='cancelled' THEN ? ELSE cancel_time END,
          reason=CASE WHEN ?='cancelled' THEN ? ELSE reason END WHERE org_id=? AND id=? AND ${gate}`,
          )
          .bind(
            nextState,
            options.externalId ?? null,
            ...(docColumn ? [options.docId!] : []),
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
              pack.answers,
              this.org,
              event,
            ),
        );
        // Click prints its receipt through the queue (fiscal-store.ts); a test
        // order is never printed. The primary key makes a repeat a no-op.
        // Uzum prints through the same queue (the Fiscalization API) unless
        // the order's registration carried the auto-fiscalization cart: then
        // Uzum prints it itself. A test order prints on the test host.
        if (this.table === UZUM_ORDERS)
          statements.push(
            this.db
              .prepare(
                `INSERT INTO gpt_fiscal_receipts(org_id,order_id,kind,provider,status_code,next_at,updated_at)
          SELECT org_id,id,'PERFORM','uzum',?,?,? FROM gpt_uzum_orders WHERE org_id=? AND id=? AND COALESCE(autofiscal,0)=0 AND ${gate}
          ON CONFLICT(org_id,order_id,kind) DO NOTHING`,
              )
              .bind(FISCAL_QUEUED, now, now, this.org, id, this.org, event),
          );
        if (row.provider === "click")
          statements.push(
            this.db
              .prepare(
                `INSERT INTO gpt_fiscal_receipts(org_id,order_id,kind,provider,status_code,last_error,next_at,updated_at)
          SELECT ?,?,'PERFORM','click',?,?,?,? WHERE ${gate} ON CONFLICT(org_id,order_id,kind) DO NOTHING`,
              )
              .bind(
                this.org,
                id,
                row.mode === "live" ? FISCAL_QUEUED : FISCAL_SKIPPED,
                row.mode === "live" ? null : "skipped_test",
                now,
                now,
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
              pack.planId,
              new Date(nextEnd).toISOString(),
              new Date(now).toISOString(),
              new Date(now).toISOString(),
              this.org,
              event,
            ),
        );
      }
      // Money going back on an Uzum order whose sale receipt is ours to print
      // takes a refund receipt; the queue prints it once the sale printed.
      if (target === "cancelled" && row.state === "paid" && this.table === UZUM_ORDERS)
        statements.push(
          this.db
            .prepare(
              `INSERT INTO gpt_fiscal_receipts(org_id,order_id,kind,provider,status_code,next_at,updated_at)
          SELECT org_id,order_id,'CANCEL','uzum',?,?,? FROM gpt_fiscal_receipts WHERE org_id=? AND order_id=? AND kind='PERFORM' AND provider='uzum' AND ${gate}
          ON CONFLICT(org_id,order_id,kind) DO NOTHING`,
            )
            .bind(FISCAL_QUEUED, now, now, this.org, id, this.org, event),
        );
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
      // An invoice closed before any provider saw it (the visitor closed it,
      // it expired, another invoice took its place) moved no money: the
      // journal keeps it, the owner hears nothing. Opening and closing
      // invoices without signing in cannot flood the owner's chat.
      const unseenClose =
        target === "cancelled" &&
        row.state === "pending" &&
        !row.external_id &&
        ["invoice_cancelled", "invoice_expired", "invoice_superseded"].includes(method);
      if (target !== "prepared" && !unseenClose)
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
    const rows: Order[] = [];
    for (const table of this.tables) {
      const result = await this.db
        .prepare(
          `SELECT * FROM ${table} WHERE org_id=? AND provider=? AND mode=? AND provider_time>=? AND provider_time<=? AND create_time>0 ORDER BY provider_time,seq`,
        )
        .bind(this.org, provider, mode, from, to)
        .all<Order>();
      rows.push(...(result.results || []));
    }
    // One list in the provider's own order of time; seq counts per table, so the id settles a tie.
    return this.tables.length > 1
      ? rows.sort((a, b) => Number(a.provider_time) - Number(b.provider_time) || a.seq - b.seq || (a.id < b.id ? -1 : 1))
      : rows;
  }
  /**
   * The account closes its own open invoice that no provider has seen yet
   * (pending, no external id): nobody can be paying it, so the visitor may
   * pay another way at once instead of waiting out PAYMENT_TTL_MS (U7). An
   * invoice a provider holds is left alone ("in_progress").
   */
  async cancelInvoice(
    user: string,
    mode: BillingMode,
    id: string,
    now = Date.now(),
  ): Promise<"cancelled" | "in_progress" | "not_found"> {
    const row = await this.db
      .prepare(
        `SELECT id,provider,state,external_id FROM ${ALL_ORDERS} WHERE org_id=? AND id=? AND user_id=? AND mode=?`,
      )
      .bind(this.org, id, user, mode)
      .first<Pick<Order, "id" | "provider" | "state" | "external_id">>();
    if (!row) return "not_found";
    if (row.state === "cancelled") return "cancelled";
    if (row.state !== "pending" || row.external_id) return "in_progress";
    try {
      await storeFor(this.db, this.org, row.provider).transition(row.id, "cancelled", "invoice_cancelled", {
        now,
        from: ["pending"],
        unseen: true,
      });
      return "cancelled";
    } catch (error) {
      // A provider took it up (Prepare, a registration) in between.
      if (error instanceof Error && error.message === "state") return "in_progress";
      throw error;
    }
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
  /**
   * Payme's SetFiscalData: the receipt Payme printed for `order`. One batch:
   * Payme's report in gpt_payme_fiscal (migrations/0074, ensurePaymeSchema)
   * and the account panel's row in gpt_fiscal_receipts, provider 'payme',
   * which the receipt queue (fiscal-store.ts, provider IN ('click','uzum'))
   * never claims. A repeat takes Payme's latest status and message; a link or
   * fiscal field once known stays when the repeat lacks it.
   */
  async paymeFiscal(
    order: string,
    kind: "PERFORM" | "CANCEL",
    report: {
      transactionId: string;
      status: number;
      receiptUrl: string | null;
      message: string | null;
      receiptId: string | null;
      terminalId: string | null;
      fiscalSign: string | null;
      date: string | null;
    },
    now = Date.now(),
  ): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO gpt_payme_fiscal(org_id,order_id,kind,transaction_id,status_code,message,receipt_id,terminal_id,fiscal_sign,qr_code_url,fiscal_date,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(org_id,order_id,kind) DO UPDATE SET transaction_id=excluded.transaction_id,status_code=excluded.status_code,message=excluded.message,
          receipt_id=COALESCE(excluded.receipt_id,receipt_id),terminal_id=COALESCE(excluded.terminal_id,terminal_id),
          fiscal_sign=COALESCE(excluded.fiscal_sign,fiscal_sign),qr_code_url=COALESCE(excluded.qr_code_url,qr_code_url),
          fiscal_date=COALESCE(excluded.fiscal_date,fiscal_date),updated_at=excluded.updated_at`,
        )
        .bind(
          this.org,
          order,
          kind,
          report.transactionId,
          report.status,
          report.message,
          report.receiptId,
          report.terminalId,
          report.fiscalSign,
          report.receiptUrl,
          report.date,
          now,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO gpt_fiscal_receipts(org_id,order_id,kind,provider,receipt_url,status_code,updated_at) VALUES(?,?,?,'payme',?,?,?)
        ON CONFLICT(org_id,order_id,kind) DO UPDATE SET provider='payme',receipt_url=COALESCE(excluded.receipt_url,receipt_url),status_code=excluded.status_code,updated_at=excluded.updated_at`,
        )
        .bind(this.org, order, kind, report.receiptUrl, report.status, now),
    ]);
  }
  async receipts(user: string, mode: BillingMode) {
    const rows = await this.db
      .prepare(
        `SELECT r.kind,r.receipt_url FROM gpt_fiscal_receipts r JOIN ${ALL_ORDERS} p ON p.id=r.order_id AND p.org_id=r.org_id
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

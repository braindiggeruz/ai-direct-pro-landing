// Uzum order ledger (gpt_uzum_orders, migrations/0065 and 0068) over the
// shared BillingStore state machine: the same version/journal guard, access
// periods, outbox and subscriptions mirror as Click/Payme.
//
// Money rule: a Checkout callback is only a hint (the public spec defines no
// callback signature). State changes here only follow an authenticated
// getOrderStatus pull made with our own credentials, or a Merchant API webhook
// that passed Basic auth. Every transition is idempotent: a repeated pull or
// webhook lands on the journal guard and changes nothing.
import {
  BillingStore,
  storeFor,
  UZUM_ORDERS,
  type Order,
  type OrderConsent,
} from "./billing-store";
import { recordServiceAlert } from "./billing-maintenance-store";
import type { BillingEnv, BillingMode, LocalProvider } from "./billing-config";
import type { UzumApi, UzumCheckoutConfig } from "./uzum-config";
import {
  getOrderStatus,
  getReceipts,
  UZUM_SESSION_SECONDS,
  type UzumCallOptions,
  type UzumStatus,
} from "./uzum-checkout";

export interface UzumOrder extends Order {
  api: UzumApi;
  redirect_url: string | null;
  refund_operation_id: string | null;
  refund_requested_at: number | null;
  /** A Merchant API /confirm arrived: Uzum has debited the payer (0068). */
  confirm_requested_at: number | null;
  /** 1 = the registration carried the cart: Uzum prints the receipts (0068). */
  autofiscal: number | null;
}

export type UzumApplyResult =
  | "paid"
  | "cancelled"
  | "refunded"
  | "unchanged"
  | "alert";

/** Same code Payme uses for a protocol timeout; also an app transaction never confirmed. */
export const UZUM_REASON_TIMEOUT = 4;
/** Money returned (refund or reverse after completion). */
export const UZUM_REASON_RETURNED = 5;
/** A checkout page is re-served only while its Uzum session is surely open. */
export const UZUM_SESSION_REUSE_MS = (UZUM_SESSION_SECONDS - 120) * 1000;
/** A still-REGISTERED order is cancelled only well after its session ended. */
export const UZUM_SESSION_EXPIRED_MS = (UZUM_SESSION_SECONDS + 300) * 1000;
/** Merchant API: a transaction not confirmed within 30 min is failed. */
export const UZUM_MERCHANT_CONFIRM_MS = 30 * 60_000;

/** An open invoice of an account at any provider, as an Uzum app payment sees it. */
export interface OpenInvoice {
  id: string;
  provider: LocalProvider;
  request_id: string;
  state: "pending" | "prepared";
  external_id: string | null;
  api: UzumApi | null;
  confirm_requested_at: number | null;
}

/**
 * What a new payment in the Uzum Bank app does with an open invoice of the
 * same account:
 *   close     — its provider never saw it (no external id): nobody can be
 *               paying it, so it is closed and the app payment goes ahead;
 *   supersede — an earlier app transaction Uzum never confirmed: Uzum fails
 *               it after 30 minutes anyway, so the new one replaces it (a
 *               late /confirm of the old one gets 10015 and Uzum returns
 *               that money);
 *   block     — a provider holds it (a card page, a Click payment, an app
 *               transaction being confirmed): wait until it settles, so
 *               nobody pays twice by accident (U7).
 */
export function appPaymentAction(invoice: OpenInvoice): "close" | "supersede" | "block" {
  if (invoice.state === "pending" && !invoice.external_id) return "close";
  if (
    invoice.provider === "uzum" &&
    invoice.api === "merchant" &&
    invoice.state === "prepared" &&
    invoice.confirm_requested_at === null
  )
    return "supersede";
  return "block";
}

/** Another payment of this account is in progress: the app payment waits (10008). */
export class AppPaymentBlockedError extends Error {
  constructor() {
    super("app_payment_blocked");
  }
}

export class UzumStore {
  readonly billing: BillingStore;
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {
    this.billing = new BillingStore(db, org, UZUM_ORDERS);
  }
  order(id: string): Promise<UzumOrder | null> {
    return this.db
      .prepare("SELECT * FROM gpt_uzum_orders WHERE org_id=? AND id=?")
      .bind(this.org, id)
      .first<UzumOrder>();
  }
  external(mode: BillingMode, externalId: string): Promise<UzumOrder | null> {
    return this.db
      .prepare(
        "SELECT * FROM gpt_uzum_orders WHERE org_id=? AND provider='uzum' AND mode=? AND external_id=?",
      )
      .bind(this.org, mode, externalId)
      .first<UzumOrder>();
  }
  /**
   * An order of the site's flow (Checkout). With `checkout`, an expired open
   * order that Uzum registered is settled from Uzum's own status before it may
   * be closed (U4): the payer may have paid and the callback been lost. If
   * Uzum cannot be asked, or the order stays open, nothing is closed and this
   * throws ("uzum_unsettled"): the visitor checks the status first.
   */
  async createOrder(
    user: string,
    mode: BillingMode,
    requestId: string,
    api: UzumApi,
    now = Date.now(),
    consent?: OrderConsent,
    checkout?: { env: BillingEnv; cfg: UzumCheckoutConfig },
  ): Promise<UzumOrder> {
    if (checkout) {
      const expired = await this.db
        .prepare(
          "SELECT * FROM gpt_uzum_orders WHERE org_id=? AND user_id=? AND mode=? AND api='checkout' AND state IN ('pending','prepared') AND external_id IS NOT NULL AND expires_at<=?",
        )
        .bind(this.org, user, mode, now)
        .first<UzumOrder>();
      if (expired) {
        const settled = await this.reconcileCheckout(checkout.env, checkout.cfg, expired, now);
        if (!settled || settled.row.state === "pending" || settled.row.state === "prepared")
          throw new Error("uzum_unsettled");
      }
    }
    const row = await this.billing.createOrder(
      user,
      "uzum",
      mode,
      requestId,
      now,
      consent,
      api,
    );
    const full = await this.order(row.id);
    if (!full) throw new Error("not_found");
    return full;
  }
  /** Store the Uzum order id, the payment page and who prints the receipts,
   * then move pending -> prepared. The first write makes a retry after a
   * partial failure resumable without a second /register (Uzum rejects a
   * repeated orderNumber with 3027). */
  async attachCheckout(
    id: string,
    orderId: string,
    redirectUrl: string,
    now = Date.now(),
    autofiscal = false,
  ): Promise<UzumOrder> {
    await this.db
      .prepare(
        "UPDATE gpt_uzum_orders SET external_id=?,redirect_url=?,provider_time=?,autofiscal=? WHERE org_id=? AND id=? AND api='checkout' AND state='pending' AND external_id IS NULL",
      )
      .bind(orderId, redirectUrl, now, autofiscal ? 1 : 0, this.org, id)
      .run();
    await this.billing.transition(id, "prepared", "uzum_register", {
      externalId: orderId,
      providerTime: now,
      now,
    });
    const row = await this.order(id);
    if (!row) throw new Error("not_found");
    return row;
  }
  /** Every open invoice of the account in `mode`, oldest first, across providers. */
  async openInvoices(user: string, mode: BillingMode): Promise<OpenInvoice[]> {
    const rows = await this.db
      .prepare(
        `SELECT p.id,p.provider,p.request_id,p.state,p.external_id,u.api,u.confirm_requested_at FROM gpt_payment_orders_all p
      LEFT JOIN gpt_uzum_orders u ON u.org_id=p.org_id AND u.id=p.id
      WHERE p.org_id=? AND p.user_id=? AND p.mode=? AND p.state IN ('pending','prepared') ORDER BY p.created_at,p.provider,p.id`,
      )
      .bind(this.org, user, mode)
      .all<OpenInvoice>();
    return rows.results || [];
  }
  /**
   * A Merchant API /create: the app payment's order, opened on the fly for
   * the account behind the payment code (U1), prepared with Uzum's transId.
   * Open invoices are closed, superseded or block it (appPaymentAction).
   * The consent is the one the code was shown with. An order a failed
   * /create of the same transId left pending is taken up, not closed.
   */
  async createAppPayment(
    user: string,
    mode: BillingMode,
    transId: string,
    providerTime: number,
    consent: OrderConsent,
    now = Date.now(),
  ): Promise<UzumOrder> {
    const open = (await this.openInvoices(user, mode)).filter(
      (invoice) => !(invoice.provider === "uzum" && invoice.request_id === transId),
    );
    if (open.some((invoice) => appPaymentAction(invoice) === "block"))
      throw new AppPaymentBlockedError();
    // Each one only from the state it was read in: an invoice paid since is
    // left alone ("state"), and this payment waits (10008).
    for (const invoice of open)
      await (appPaymentAction(invoice) === "close"
        ? storeFor(this.db, this.org, invoice.provider).transition(invoice.id, "cancelled", "invoice_superseded", {
            reason: UZUM_REASON_TIMEOUT,
            now,
            from: ["pending"],
          })
        : this.billing.transition(invoice.id, "cancelled", "uzum_superseded", {
            reason: UZUM_REASON_TIMEOUT,
            now,
            from: ["prepared"],
          }));
    const row = await this.billing.createOrder(user, "uzum", mode, transId, now, consent, "merchant");
    // Another invoice won the race for this account in between.
    if (row.request_id !== transId || row.state !== "pending") throw new AppPaymentBlockedError();
    await this.billing.transition(row.id, "prepared", "uzum_create", {
      externalId: transId,
      providerTime,
      now,
    });
    const created = await this.order(row.id);
    if (!created) throw new Error("not_found");
    return created;
  }
  /** U8: /confirm arrived for a prepared app payment. Written before it is marked paid. */
  async requestConfirm(id: string, now = Date.now()): Promise<void> {
    await this.db
      .prepare(
        "UPDATE gpt_uzum_orders SET confirm_requested_at=COALESCE(confirm_requested_at,?) WHERE org_id=? AND id=? AND api='merchant' AND state='prepared'",
      )
      .bind(now, this.org, id)
      .run();
  }
  /**
   * Apply a status we pulled ourselves. Mismatches never move money state;
   * they raise an owner alert instead, because a person has to look.
   */
  async applyPulledStatus(
    env: BillingEnv,
    row: UzumOrder,
    pulled: UzumStatus,
    now = Date.now(),
  ): Promise<UzumApplyResult> {
    const alert = async (code: string): Promise<UzumApplyResult> => {
      await recordServiceAlert(env, code, now);
      return "alert";
    };
    if (
      !row.external_id ||
      pulled.orderId.toLowerCase() !== row.external_id.toLowerCase() ||
      pulled.merchantOrderId !== row.id ||
      pulled.amount !== row.amount
    )
      return alert("uzum_amount_mismatch");
    const open = row.state === "pending" || row.state === "prepared";
    const cancel = async (method: string, reason: number | undefined) => {
      await this.billing.transition(row.id, "cancelled", method, { reason, now });
    };
    switch (pulled.status) {
      case "COMPLETED": {
        if (pulled.completedAmount !== row.amount)
          return alert("uzum_amount_mismatch");
        if (row.state === "paid") return "unchanged";
        // Money was taken for an order we already closed: never grant
        // silently, the owner reconciles (refund or manual grant) by hand.
        if (!open) return alert("uzum_paid_after_cancel");
        if (row.state === "pending")
          await this.billing.transition(row.id, "prepared", "uzum_register", {
            externalId: row.external_id,
            now,
          });
        await this.billing.transition(row.id, "paid", "uzum_complete", { now });
        return "paid";
      }
      case "REFUNDED": {
        if (pulled.refundedAmount !== row.amount)
          return alert("uzum_partial_refund");
        if (!open && row.state !== "paid") return "unchanged";
        // paid -> refunded: the store revokes the access period.
        await cancel("uzum_refund", UZUM_REASON_RETURNED);
        return row.state === "paid" ? "refunded" : "cancelled";
      }
      case "REVERSED": {
        if (open) {
          await cancel("uzum_declined", undefined);
          return "cancelled";
        }
        if (row.state !== "paid") return "unchanged";
        if (pulled.reversedAmount !== row.amount)
          return alert("uzum_partial_refund");
        await cancel("uzum_reverse", UZUM_REASON_RETURNED);
        return "refunded";
      }
      case "DECLINED": {
        if (open) {
          await cancel("uzum_declined", undefined);
          return "cancelled";
        }
        return row.state === "paid" ? alert("uzum_status_conflict") : "unchanged";
      }
      default:
        // REGISTERED / AUTHORIZED / TOP_UP_COMPLETED: nothing settled yet.
        return "unchanged";
    }
  }
  /**
   * Pull the authoritative status and apply it. Also closes a checkout whose
   * Uzum session ended long ago while Uzum still reports REGISTERED, so the
   * visitor can start a new payment. Returns null when the pull failed.
   */
  async reconcileCheckout(
    env: BillingEnv,
    cfg: UzumCheckoutConfig,
    row: UzumOrder,
    now = Date.now(),
    options: UzumCallOptions = {},
  ): Promise<{ row: UzumOrder; result: UzumApplyResult } | null> {
    if (row.api !== "checkout" || !row.external_id) return null;
    const pulled = await getOrderStatus(cfg, row.external_id, options);
    if (!pulled.ok) return null;
    let result = await this.applyPulledStatus(env, row, pulled.status, now);
    if (
      result === "unchanged" &&
      pulled.status.status === "REGISTERED" &&
      (row.state === "pending" || row.state === "prepared") &&
      now - (row.provider_time ?? row.created_at) > UZUM_SESSION_EXPIRED_MS
    ) {
      await this.billing.transition(row.id, "cancelled", "timeout", {
        reason: UZUM_REASON_TIMEOUT,
        now,
      });
      result = "cancelled";
    }
    const updated = await this.order(row.id);
    if (!updated) throw new Error("not_found");
    return { row: updated, result };
  }
  /**
   * U11: the receipts Uzum printed for an auto-fiscalized order, recovered
   * when their callback was lost. Returns how many it holds, or null when
   * the pull failed.
   */
  async pullReceipts(
    cfg: UzumCheckoutConfig,
    row: UzumOrder,
    options: UzumCallOptions = {},
  ): Promise<number | null> {
    if (row.api !== "checkout" || row.autofiscal !== 1 || !row.external_id) return null;
    const pulled = await getReceipts(cfg, row.external_id, options);
    if (!pulled.ok) return null;
    for (const receipt of pulled.receipts)
      await this.billing.fiscal(
        row.id,
        receipt.receiptType === "REFUND" ? "CANCEL" : "PERFORM",
        0,
        receipt.receiptUrl,
      );
    return pulled.receipts.length;
  }
  /** Whether Uzum's sale receipt of the order is on file. */
  async hasSaleReceipt(id: string): Promise<boolean> {
    return !!(await this.db
      .prepare(
        "SELECT 1 FROM gpt_fiscal_receipts WHERE org_id=? AND order_id=? AND kind='PERFORM' AND status_code=0",
      )
      .bind(this.org, id)
      .first());
  }
  /** X-Operation-Id for the refund: created once, reused on every retry. */
  async refundOperation(id: string, candidate: string): Promise<string | null> {
    const row = await this.db
      .prepare(
        "UPDATE gpt_uzum_orders SET refund_operation_id=COALESCE(refund_operation_id,?) WHERE org_id=? AND id=? AND state='paid' RETURNING refund_operation_id",
      )
      .bind(candidate, this.org, id)
      .first<{ refund_operation_id: string }>();
    return row?.refund_operation_id ?? null;
  }
  async markRefundRequested(id: string, now = Date.now()): Promise<void> {
    await this.db
      .prepare(
        "UPDATE gpt_uzum_orders SET refund_requested_at=COALESCE(refund_requested_at,?) WHERE org_id=? AND id=?",
      )
      .bind(now, this.org, id)
      .run();
  }
  /**
   * The maintenance tick's scans (uzum-maintenance.ts), each bounded:
   * registered card payments whose session ended (U4), auto-fiscalized
   * payments without Uzum's sale receipt (U11), app transactions never
   * confirmed, and app transactions whose /confirm arrived but never finished.
   */
  staleCheckouts(before: number, limit: number): Promise<UzumOrder[]> {
    return this.list(
      "api='checkout' AND state IN ('pending','prepared') AND external_id IS NOT NULL AND provider_time<? ORDER BY provider_time",
      [before],
      limit,
    );
  }
  unreceipted(from: number, to: number, limit: number): Promise<UzumOrder[]> {
    return this.list(
      `api='checkout' AND state='paid' AND autofiscal=1 AND perform_time>? AND perform_time<?
      AND NOT EXISTS(SELECT 1 FROM gpt_fiscal_receipts r WHERE r.org_id=o.org_id AND r.order_id=o.id AND r.kind='PERFORM' AND r.status_code=0)
      ORDER BY perform_time`,
      [from, to],
      limit,
    );
  }
  unconfirmedApp(before: number, limit: number): Promise<UzumOrder[]> {
    return this.list(
      "api='merchant' AND state='prepared' AND confirm_requested_at IS NULL AND create_time<? ORDER BY create_time",
      [before],
      limit,
    );
  }
  stuckConfirms(before: number, limit: number): Promise<UzumOrder[]> {
    return this.list(
      "api='merchant' AND state='prepared' AND confirm_requested_at<? ORDER BY confirm_requested_at",
      [before],
      limit,
    );
  }
  private async list(where: string, values: unknown[], limit: number): Promise<UzumOrder[]> {
    const rows = await this.db
      .prepare(`SELECT o.* FROM gpt_uzum_orders o WHERE o.org_id=? AND ${where} LIMIT ?`)
      .bind(this.org, ...values, limit)
      .all<UzumOrder>();
    return rows.results || [];
  }
}

// Uzum order ledger (gpt_uzum_orders, migrations/0065) over the shared
// BillingStore state machine: the same version/journal guard, access periods,
// outbox and subscriptions mirror as Click/Payme.
//
// Money rule: a Checkout callback is only a hint (the public spec defines no
// callback signature). State changes here only follow an authenticated
// getOrderStatus pull made with our own credentials, or a Merchant API webhook
// that passed Basic auth. Every transition is idempotent: a repeated pull or
// webhook lands on the journal guard and changes nothing.
import { BillingStore, UZUM_ORDERS, type Order } from "./billing-store";
import { recordServiceAlert } from "./billing-maintenance-store";
import type { BillingEnv, BillingMode } from "./billing-config";
import type { UzumApi, UzumCheckoutConfig } from "./uzum-config";
import {
  getOrderStatus,
  UZUM_SESSION_SECONDS,
  type UzumStatus,
} from "./uzum-checkout";

export interface UzumOrder extends Order {
  api: UzumApi;
  redirect_url: string | null;
  refund_operation_id: string | null;
  refund_requested_at: number | null;
}

export type UzumApplyResult =
  | "paid"
  | "cancelled"
  | "refunded"
  | "unchanged"
  | "alert";

/** Same code Payme uses for a protocol timeout. */
export const UZUM_REASON_TIMEOUT = 4;
/** Money returned (refund or reverse after completion). */
export const UZUM_REASON_RETURNED = 5;
/** A checkout page is re-served only while its Uzum session is surely open. */
export const UZUM_SESSION_REUSE_MS = (UZUM_SESSION_SECONDS - 120) * 1000;
/** A still-REGISTERED order is cancelled only well after its session ended. */
export const UZUM_SESSION_EXPIRED_MS = (UZUM_SESSION_SECONDS + 300) * 1000;
/** Merchant API: a transaction not confirmed within 30 min is failed. */
export const UZUM_MERCHANT_CONFIRM_MS = 30 * 60_000;

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
  async createOrder(
    user: string,
    mode: BillingMode,
    requestId: string,
    api: UzumApi,
    now = Date.now(),
    consent?: { version: string; url: string; locale: "ru" | "uz" },
  ): Promise<UzumOrder> {
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
  /** Store the Uzum order id and payment page, then move pending -> prepared.
   * The first write makes a retry after a partial failure resumable without a
   * second /register (Uzum rejects a repeated orderNumber with 3027). */
  async attachCheckout(
    id: string,
    orderId: string,
    redirectUrl: string,
    now = Date.now(),
  ): Promise<UzumOrder> {
    await this.db
      .prepare(
        "UPDATE gpt_uzum_orders SET external_id=?,redirect_url=?,provider_time=? WHERE org_id=? AND id=? AND api='checkout' AND state='pending' AND external_id IS NULL",
      )
      .bind(orderId, redirectUrl, now, this.org, id)
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
  ): Promise<{ row: UzumOrder; result: UzumApplyResult } | null> {
    if (row.api !== "checkout" || !row.external_id) return null;
    const pulled = await getOrderStatus(cfg, row.external_id);
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
}

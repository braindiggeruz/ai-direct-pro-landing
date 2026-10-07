// The paid studio's orders, entitlements and refunds (migrations/0075,
// DECISIONS 07.10.2026 §4, §12; spec §9). Every move of an order goes
// through this file: the checkout (T3.2), Payme and Click (stream D) and
// the internal refund, credit and restore endpoints (stream E, T3.2) call
// it and never write their own transition.
//
// The order's life:
//   pending  ── prepare ──> prepared ── markPaid ──> paid ── refundFull / recordRefund ──> refunded
//      └──────── cancel ───────┴──> cancelled
//
// One transition is ONE D1 batch, all or nothing:
//   1. UPDATE studio_orders_v2 … WHERE id=? AND version=<the version read>:
//      the new state, version+1 and event_id = a fresh journal id;
//   2. the journal row, whose order_id is read back by that event_id
//      (a scalar subquery). When step 1 changed nothing (another request
//      moved the order since it was read), the subquery is NULL,
//      gpt_payment_journal.order_id NOT NULL fails and the whole batch
//      rolls back: no entitlement, receipt or refund row of a lost race
//      ever lands. The caller reads the order again and decides anew;
//   3. the effects of this move: the entitlement and the receipt row of a
//      payment; the revocation and the studio_refunds row of a refund.
// The studio's SQL rules (tests/studio-d1-budget.test.ts) forbid INSERT …
// SELECT, joins and unbounded statements, so the guard is that subquery,
// not the chat's EXISTS(journal) pattern.
//
// Money facts are the order's own: the amount comes from the quota version
// of the offer edition the buyer accepted (plans.ts TERMS_PLAN), and the
// entitlement from the order's plan_version, so a sold tariff keeps its own
// terms. Mode: an order's mode is its cash desk's (Payme: the chat's
// GPT_BILLING_MODE_PAYME), and an entitlement carries the order's mode.
//
// No text, contact, card or IP: the order keeps sanitized attribution ids
// only (attribution.ts), cleared after 93 days by the maintenance tick.
import { ensureBillingSchema } from "../gpt-chat/billing-schema";
import { FISCAL_QUEUED, FISCAL_SKIPPED } from "../gpt-chat/fiscal-store";
import { ensureSchema } from "../gpt-chat/schema";
import type { OrderAttribution } from "./attribution";
import {
  REFUND_WINDOW_MS,
  STUDIO_ORDER_TTL_MS,
  TERMS_PLAN,
  entitlementEndsAt,
  planFor,
  planOfVersion,
  refundValueTiyin,
  type StudioPlanId,
  type StudioProvider,
} from "./plans";
import { STUDIO_ORG, ensureStudioPaymentsSchema } from "./schema";

export type OrderMode = "test" | "live";
export type StudioOrderState = "pending" | "prepared" | "paid" | "cancelled" | "refunded";
export type RefundMethod = "payme_cancel" | "click_reversal" | "click_cabinet" | "transfer";
export type RefundReceiptState = "provider" | "due" | "printed";

export const REFUND_METHODS: readonly RefundMethod[] = ["payme_cancel", "click_reversal", "click_cabinet", "transfer"];
/** 'stu_' + 32 hex: Payme's account.order_id and Click's merchant_trans_id. */
export const STUDIO_ORDER_ID = /^stu_[0-9a-f]{32}$/;
/** Tries of one transition against concurrent moves of the same order. */
const MOVE_ATTEMPTS = 6;

/** A row of studio_orders_v2. */
export interface StudioOrder {
  readonly seq: number;
  readonly org_id: string;
  readonly id: string;
  readonly user_id: string;
  readonly plan: StudioPlanId;
  readonly plan_version: string;
  readonly terms_version: string;
  readonly provider: StudioProvider;
  readonly service_id: string | null;
  readonly mode: OrderMode;
  readonly request_id: string;
  readonly amount: number;
  readonly currency: "UZS";
  readonly state: StudioOrderState;
  readonly external_id: string | null;
  readonly provider_doc_id: string | null;
  readonly provider_time: number | null;
  readonly create_time: number;
  readonly created_at: number;
  readonly expires_at: number;
  readonly perform_time: number;
  readonly cancel_time: number;
  readonly reason: number | null;
  readonly version: number;
  readonly event_id: string | null;
  readonly owner_test: number;
  readonly restored_at: number | null;
  readonly touch: "last" | "first" | null;
  readonly gclid: string | null;
  readonly gbraid: string | null;
  readonly wbraid: string | null;
  readonly yclid: string | null;
  readonly utm_source: string | null;
  readonly utm_medium: string | null;
  readonly utm_campaign: string | null;
  readonly utm_term: string | null;
  readonly utm_content: string | null;
  readonly landing_path: string | null;
  readonly referrer_host: string | null;
  readonly first_seen_at: string | null;
  readonly ga_client_id: string | null;
  readonly ga_session_id: string | null;
  readonly ym_client_id: string | null;
  readonly attrib_purged_at: number | null;
  readonly ga4_state: "none" | "pending" | "sent" | "failed" | "skipped";
  readonly ga4_refund_state: "none" | "pending" | "sent" | "failed" | "skipped";
}

/** A row of studio_entitlements (0073). */
export interface StudioEntitlement {
  readonly id: string;
  readonly order_id: string;
  readonly user_id: string;
  readonly mode: OrderMode;
  readonly plan: "kunlik" | "oylik" | "credit";
  readonly plan_version: string;
  readonly starts_at: number;
  readonly ends_at: number;
  readonly presentations_limit: number;
  readonly presentations_used: number;
  readonly photos_limit: number;
  readonly photos_used: number;
  readonly extended_ms: number;
  readonly revoked_at: number | null;
}

/** A row of studio_refunds. */
export interface StudioRefund {
  readonly id: string;
  readonly order_id: string;
  readonly amount: number;
  readonly method: RefundMethod;
  readonly reference: string | null;
  readonly presentations_unused: number;
  readonly photos_unused: number;
  readonly receipt_state: RefundReceiptState;
  readonly requested_at: number;
  readonly created_at: number;
  readonly updated_at: number;
}

/** The offer acceptance stored with the order (gpt_payment_consents). */
export interface OrderConsent {
  /** The offer edition (= the order's terms_version). */
  readonly version: string;
  /** The offer's https://gptbot.uz link in the buyer's language. */
  readonly url: string;
  readonly locale: "uz" | "ru";
}

export interface NewStudioOrder {
  readonly userId: string;
  readonly plan: StudioPlanId;
  /** The offer edition the buyer accepted: TERMS_PLAN picks the quota version and the price. */
  readonly termsVersion: string;
  readonly provider: StudioProvider;
  /** Click's service (variant B); null for Payme. */
  readonly serviceId: string | null;
  readonly mode: OrderMode;
  /** The browser's idempotency key. */
  readonly requestId: string;
  readonly consent: OrderConsent;
  readonly attribution?: OrderAttribution | null;
  readonly now?: number;
}

export type CreatedOrder =
  /** A new order, pending. */
  | { readonly kind: "created"; readonly order: StudioOrder }
  /** The same request id again: the order it made, whatever became of it. */
  | { readonly kind: "replayed"; readonly order: StudioOrder }
  /** The buyer's open order of the same plan and provider: the same invoice again. */
  | { readonly kind: "open"; readonly order: StudioOrder };

/**
 * Why a store call refused. Every code is coarse and safe to log:
 *   state               the order is not in a state this move starts from
 *   conflict            another provider transaction already holds the order
 *   external_taken      the provider's id belongs to another order
 *   idempotency_conflict the request id made a different order
 *   terms_changed       the request id's order was made under another edition
 *   terms_unsold        the edition sells no studio tariff (TERMS_PLAN)
 *   plan_unknown        the order's quota version is not in plans.ts
 *   order_open          the buyer has another open order (`order` is it)
 *   refund_exists       the order has its refund already
 *   refund_window       the buyer asked more than 14 days after paying
 *   refund_amount       the amount is not 1 tiyin … the order's amount
 *   nothing_to_refund   no unit is left unused: the computed amount is 0
 *   not_found           no such order
 *   busy                the order kept moving under us
 */
export type StudioStoreCode =
  | "state"
  | "conflict"
  | "external_taken"
  | "idempotency_conflict"
  | "terms_changed"
  | "terms_unsold"
  | "plan_unknown"
  | "order_open"
  | "refund_exists"
  | "refund_window"
  | "refund_amount"
  | "nothing_to_refund"
  | "not_found"
  | "busy";

export class StudioStoreError extends Error {
  constructor(
    readonly code: StudioStoreCode,
    /** order_open: the open order. */
    readonly order: StudioOrder | null = null,
  ) {
    super(code);
    this.name = "StudioStoreError";
  }
}

/** The mode of the entitlements a viewer spends: test only in a local rehearsal (STUDIO_PAYMENTS=test). */
export function viewerMode(payments: "off" | "test" | "live"): OrderMode {
  return payments === "test" ? "test" : "live";
}

/**
 * Where a photo task's unit comes from (spec §2.3, «сначала бесплатное»):
 * today's free photos first, then the entitlement that ends soonest.
 *   - a free photo left: free; it needs a Turnstile token unless the
 *     account holds a running entitlement (`entitled`), and without one the
 *     answer is 403 turnstile_required: a paid unit never stands in for a
 *     missing token;
 *   - none left: the entitlement (jobs.ts startJob picks it; none with a
 *     photo left is 402 no_units), or 429 free_limit without one.
 * For the photo endpoint (stream C); a deck has no such order: the free and
 * the full deck are two products the person chooses between.
 */
export function photoUnitSource(input: {
  /** Free photo tasks left today (free-usage.ts freeLeft). */
  readonly freeLeft: number;
  /** The account holds a live, unrevoked entitlement of the viewer's mode. */
  readonly entitled: boolean;
  /** The request carries a Turnstile token (checked after this choice). */
  readonly turnstileToken: boolean;
}):
  | { readonly source: "free"; readonly turnstile: boolean }
  | { readonly source: "entitlement" }
  | { readonly refuse: "turnstile_required" | "free_limit" } {
  if (input.freeLeft > 0) {
    if (input.entitled) return { source: "free", turnstile: false };
    return input.turnstileToken ? { source: "free", turnstile: true } : { refuse: "turnstile_required" };
  }
  return input.entitled ? { source: "entitlement" } : { refuse: "free_limit" };
}

/** Units of an order not used yet: its entitlements (the main one and the returned units), revoked or not. */
export interface UnusedUnits {
  readonly presentations: number;
  readonly photos: number;
}

export function unusedUnits(entitlements: readonly StudioEntitlement[]): UnusedUnits {
  let presentations = 0;
  let photos = 0;
  for (const row of entitlements) {
    presentations += Math.max(0, row.presentations_limit - row.presentations_used);
    photos += Math.max(0, row.photos_limit - row.photos_used);
  }
  return { presentations, photos };
}

/** Who the journal names for a move. */
function actorOf(method: string, provider: StudioProvider): string {
  if (method.startsWith("owner_") || method === "studio_restore") return "owner";
  if (method === "invoice_cancelled" || method === "studio_checkout") return "account";
  if (["timeout", "invoice_expired", "invoice_superseded"].includes(method)) return "system";
  if (method === "transfer" || method === "click_cabinet" || method === "click_reversal") return "owner";
  return provider;
}

/** Whoever prints the refund receipt: Payme and Click on their own cancellation; ours after a transfer. */
export function refundReceiptState(method: RefundMethod): RefundReceiptState {
  return method === "transfer" ? "due" : "provider";
}

const JOURNAL =
  "INSERT INTO gpt_payment_journal(org_id,id,order_id,actor,method,from_state,to_state,created_at) VALUES(?,?,(SELECT id FROM studio_orders_v2 WHERE org_id=? AND id=? AND event_id=?),?,?,?,?,?)";

const ORDER_BY_ID = "SELECT * FROM studio_orders_v2 WHERE org_id=? AND id=?";

/** The tables a paid path touches, once per isolate: rate limits, the billing ledger, 0073 and 0075. */
export async function ensureStudioPaidSchema(db: D1Database): Promise<void> {
  await ensureSchema(db);
  await ensureBillingSchema(db);
  await ensureStudioPaymentsSchema(db);
}

export class StudioStore {
  constructor(
    readonly db: D1Database,
    readonly org: string = STUDIO_ORG,
  ) {}

  byId(id: string): Promise<StudioOrder | null> {
    return this.db.prepare(ORDER_BY_ID).bind(this.org, id).first<StudioOrder>();
  }

  /** The order a provider's transaction id names (Payme transaction id, click_trans_id). */
  byExternal(provider: StudioProvider, mode: OrderMode, externalId: string): Promise<StudioOrder | null> {
    return this.db
      .prepare("SELECT * FROM studio_orders_v2 WHERE org_id=? AND provider=? AND mode=? AND external_id=?")
      .bind(this.org, provider, mode, externalId)
      .first<StudioOrder>();
  }

  /** Orders whose provider document number (Payme receipt id, click_paydoc_id) is `docId`, newest first. */
  async byDocId(docId: string): Promise<StudioOrder[]> {
    const rows = await this.db
      .prepare("SELECT * FROM studio_orders_v2 WHERE org_id=? AND provider_doc_id=? ORDER BY created_at DESC LIMIT 5")
      .bind(this.org, docId)
      .all<StudioOrder>();
    return rows.results ?? [];
  }

  /** The buyer's order of `requestId`, if any. */
  byRequest(userId: string, requestId: string): Promise<StudioOrder | null> {
    return this.db
      .prepare("SELECT * FROM studio_orders_v2 WHERE org_id=? AND user_id=? AND request_id=?")
      .bind(this.org, userId, requestId)
      .first<StudioOrder>();
  }

  /** The buyer's open order of `mode` (at most one: idx_studio_orders_v2_open). */
  openOrder(userId: string, mode: OrderMode): Promise<StudioOrder | null> {
    return this.db
      .prepare("SELECT * FROM studio_orders_v2 WHERE org_id=? AND user_id=? AND mode=? AND state IN ('pending','prepared') LIMIT 1")
      .bind(this.org, userId, mode)
      .first<StudioOrder>();
  }

  /** The buyer's newest order of `mode`. */
  latestOrder(userId: string, mode: OrderMode): Promise<StudioOrder | null> {
    return this.db
      .prepare("SELECT * FROM studio_orders_v2 WHERE org_id=? AND user_id=? AND mode=? ORDER BY created_at DESC LIMIT 1")
      .bind(this.org, userId, mode)
      .first<StudioOrder>();
  }

  /**
   * Every transaction of `provider` in `mode` the provider created between
   * `from` and `to` (its own time, both ends included), in its order: what
   * Payme's GetStatement lists, including every accepted transaction.
   */
  async statement(provider: StudioProvider, mode: OrderMode, from: number, to: number): Promise<StudioOrder[]> {
    const result: StudioOrder[] = [];
    let after = 0;
    for (;;) {
      const rows = await this.db.prepare("SELECT * FROM studio_orders_v2 WHERE org_id=? AND provider=? AND mode=? AND provider_time>=? AND provider_time<=? AND create_time>0 AND seq>? ORDER BY seq LIMIT 500")
        .bind(this.org, provider, mode, from, to, after).all<StudioOrder>();
      const page = rows.results ?? [];
      result.push(...page);
      if (page.length < 500) break;
      after = page[page.length - 1].seq;
    }
    return result.sort((a,b) => Number(a.provider_time)-Number(b.provider_time) || a.seq-b.seq);
  }

  /** The buyer's entitlements of `mode`, the latest end first (10 at most). */
  async entitlements(userId: string, mode: OrderMode, now = Date.now()): Promise<StudioEntitlement[]> {
    const rows = await this.db
      .prepare("SELECT * FROM studio_entitlements WHERE org_id=? AND user_id=? AND mode=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>? ORDER BY ends_at DESC LIMIT 10")
      .bind(this.org, userId, mode, now, now)
      .all<StudioEntitlement>();
    return rows.results ?? [];
  }

  /**
   * The buyer holds a running, unrevoked entitlement of `mode` now, with
   * units left or not (photoUnitSource `entitled`: a buyer's free photos
   * skip Turnstile). One indexed read.
   */
  async hasRunningEntitlement(userId: string, mode: OrderMode, now: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        "SELECT id FROM studio_entitlements WHERE org_id=? AND user_id=? AND mode=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>? ORDER BY ends_at LIMIT 1",
      )
      .bind(this.org, userId, mode, now, now)
      .first<{ id: string }>();
    return row !== null;
  }

  /** The entitlements of one order: its own and its returned units. */
  async orderEntitlements(orderId: string): Promise<StudioEntitlement[]> {
    const rows = await this.db
      .prepare("SELECT * FROM studio_entitlements WHERE org_id=? AND order_id=? LIMIT 20")
      .bind(this.org, orderId)
      .all<StudioEntitlement>();
    return rows.results ?? [];
  }

  /** The order's refund, if it has one. */
  refundOf(orderId: string): Promise<StudioRefund | null> {
    return this.db
      .prepare("SELECT * FROM studio_refunds WHERE org_id=? AND order_id=?")
      .bind(this.org, orderId)
      .first<StudioRefund>();
  }

  /**
   * A new order, or the one this request id or this buyer already has:
   *   - the same request id → that order ("replayed"), whatever became of
   *     it; with another plan, provider or mode → idempotency_conflict;
   *   - an open order of the buyer that has not expired: the same plan and
   *     provider under the same edition → that order ("open"); anything
   *     else → order_open (the browser offers to cancel it);
   *   - an open order past its time is closed (reason 4) first;
   *   - otherwise one batch: the order (amount from the edition's quota
   *     version), the journal and the offer acceptance. A parallel tab that
   *     won the open-order slot makes it fail whole; the loop reads again.
   * terms_unsold when the edition sells no studio tariff (503 upstream).
   */
  async createOrder(input: NewStudioOrder): Promise<CreatedOrder> {
    const now = input.now ?? Date.now();
    const plan = planFor(input.termsVersion, input.plan);
    if (!plan) throw new StudioStoreError("terms_unsold");
    const planVersion = TERMS_PLAN[input.termsVersion];
    for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt++) {
      const prior = await this.byRequest(input.userId, input.requestId);
      if (prior) {
        if (prior.plan !== input.plan || prior.provider !== input.provider || prior.mode !== input.mode)
          throw new StudioStoreError("idempotency_conflict");
        if (prior.terms_version !== input.termsVersion) throw new StudioStoreError("terms_changed");
        return { kind: "replayed", order: prior };
      }
      const open = await this.openOrder(input.userId, input.mode);
      // A prepared Click transaction is held by the provider. Local invoice
      // expiry must not make its delayed successful Complete impossible.
      if (open?.provider === 'click' && open.external_id && open.expires_at <= now) throw new StudioStoreError('order_open', open);
      if (open && open.expires_at > now) {
        const same = open.plan === input.plan && open.provider === input.provider && open.terms_version === input.termsVersion;
        if (same) return { kind: "open", order: open };
        throw new StudioStoreError("order_open", open);
      }
      if (open) {
        try {
          await this.cancel(open.id, { method: "invoice_expired", reason: 4, from: [open.state], now });
        } catch (error) {
          // Paid or moved in between: read everything again.
          if (!(error instanceof StudioStoreError) || error.code !== "state") throw error;
        }
        continue;
      }
      const id = `stu_${crypto.randomUUID().replace(/-/g, "")}`;
      const event = crypto.randomUUID();
      const a = input.attribution ?? null;
      try {
        await this.db.batch([
          this.db
            .prepare(
              `INSERT INTO studio_orders_v2(org_id,id,user_id,plan,plan_version,terms_version,provider,service_id,mode,request_id,amount,currency,state,created_at,expires_at,event_id,
              touch,gclid,gbraid,wbraid,yclid,utm_source,utm_medium,utm_campaign,utm_term,utm_content,landing_path,referrer_host,first_seen_at,ga_client_id,ga_session_id,ym_client_id)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,'UZS','pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              this.org, id, input.userId, input.plan, planVersion, input.termsVersion, input.provider, input.serviceId,
              input.mode, input.requestId, plan.amountTiyin, now, now + STUDIO_ORDER_TTL_MS, event,
              a?.touch ?? null, a?.gclid ?? null, a?.gbraid ?? null, a?.wbraid ?? null, a?.yclid ?? null,
              a?.utmSource ?? null, a?.utmMedium ?? null, a?.utmCampaign ?? null, a?.utmTerm ?? null, a?.utmContent ?? null,
              a?.landingPath ?? null, a?.referrerHost ?? null, a?.firstSeenAt ?? null,
              a?.gaClientId ?? null, a?.gaSessionId ?? null, a?.ymClientId ?? null,
            ),
          this.db
            .prepare(JOURNAL)
            .bind(this.org, event, this.org, id, event, "account", "studio_checkout", null, "pending", now),
          this.db
            .prepare(
              "INSERT INTO gpt_payment_consents(org_id,order_id,user_id,version,url,locale,accepted_at) VALUES(?,?,?,?,?,?,?)",
            )
            .bind(this.org, id, input.userId, input.consent.version, input.consent.url, input.consent.locale, now),
        ]);
      } catch (error) {
        // Another tab took the open-order slot or the request id: read again.
        if (/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) continue;
        throw error;
      }
      const created = await this.byId(id);
      if (created) return { kind: "created", order: created };
    }
    throw new StudioStoreError("busy");
  }

  /**
   * One guarded move of `row` (see the header): `update` must set
   * version=version+1 and event_id=? first and end with
   * `WHERE org_id=? AND id=? AND version=?`; its binds come after the
   * event id. False when another request moved the order since `row` was
   * read; an error that is not such a race is thrown.
   */
  private async move(
    row: StudioOrder,
    to: StudioOrderState,
    method: string,
    update: { readonly sql: string; readonly binds: readonly unknown[] },
    effects: (event: string) => D1PreparedStatement[],
    now: number,
  ): Promise<boolean> {
    const event = crypto.randomUUID();
    try {
      await this.db.batch([
        this.db.prepare(update.sql).bind(event, ...update.binds, this.org, row.id, row.version),
        this.db
          .prepare(JOURNAL)
          .bind(this.org, event, this.org, row.id, event, actorOf(method, row.provider), method, row.state, to, now),
        ...effects(event),
      ]);
      return true;
    } catch (error) {
      const current = await this.byId(row.id);
      if (current && current.version !== row.version) return false;
      throw error;
    }
  }

  private async read(id: string): Promise<StudioOrder> {
    const row = await this.byId(id);
    if (!row) throw new StudioStoreError("not_found");
    return row;
  }

  /**
   * pending → prepared: the provider took the order up (Payme
   * CreateTransaction, Click Prepare). `externalId` is the provider's
   * transaction id; `docId` its document number when known (Click's
   * paydoc id); `providerTime` the provider's time of it. A Payme order's
   * time runs STUDIO_ORDER_TTL_MS from Payme's time. A repeat with the same
   * transaction id answers the order as it is; another id → conflict; an
   * id another order holds → external_taken.
   */
  async prepare(
    id: string,
    options: { readonly externalId: string; readonly providerTime: number; readonly docId?: string | null; readonly method: string; readonly now?: number },
  ): Promise<StudioOrder> {
    const now = options.now ?? Date.now();
    for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt++) {
      const row = await this.read(id);
      if (row.external_id && row.external_id !== options.externalId) throw new StudioStoreError("conflict");
      if (row.state === "prepared" && row.external_id === options.externalId) return row;
      if (row.state !== "pending") throw new StudioStoreError("state");
      const holder = await this.byExternal(row.provider, row.mode, options.externalId);
      if (holder && holder.id !== row.id) throw new StudioStoreError("external_taken");
      const moved = await this.move(
        row,
        "prepared",
        options.method,
        {
          sql: "UPDATE studio_orders_v2 SET state='prepared',version=version+1,event_id=?,external_id=?,provider_doc_id=COALESCE(provider_doc_id,?),provider_time=?,create_time=?,expires_at=CASE WHEN provider='payme' THEN ? ELSE expires_at END WHERE org_id=? AND id=? AND version=?",
          binds: [options.externalId, options.docId ?? null, options.providerTime, now, options.providerTime + STUDIO_ORDER_TTL_MS],
        },
        () => [],
        now,
      );
      if (moved) return this.read(id);
    }
    throw new StudioStoreError("busy");
  }

  /**
   * prepared → paid (Payme PerformTransaction, Click Complete): one batch
   * with the entitlement of the order's quota version (Kunlik +24 hours,
   * Oylik one calendar month from now), the sale's receipt row
   * (gpt_fiscal_receipts: Click live −1 for the queue, test −2
   * skipped_test; Payme −1 live / −2 test under provider 'payme', which the
   * queue never claims: Payme prints and reports through SetFiscalData) and
   * the GA4 outbox mark (live, not the owner's). A repeat answers the paid
   * order and its entitlement.
   */
  async markPaid(id: string, options: { readonly method: string; readonly now?: number }): Promise<{ order: StudioOrder; entitlement: StudioEntitlement }> {
    const now = options.now ?? Date.now();
    for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt++) {
      const row = await this.read(id);
      if (row.state === "paid") return { order: row, entitlement: await this.mainEntitlement(row) };
      if (row.state !== "prepared") throw new StudioStoreError("state");
      const plan = planOfVersion(row.plan_version, row.plan);
      if (!plan) throw new StudioStoreError("plan_unknown");
      const endsAt = entitlementEndsAt(plan, now);
      const live = row.mode === "live";
      const moved = await this.move(
        row,
        "paid",
        options.method,
        {
          sql: "UPDATE studio_orders_v2 SET state='paid',version=version+1,event_id=?,perform_time=?,ga4_state=CASE WHEN mode='live' AND owner_test=0 THEN 'pending' ELSE ga4_state END WHERE org_id=? AND id=? AND version=?",
          binds: [now],
        },
        () => [
          this.db
            .prepare(
              "INSERT INTO studio_entitlements(org_id,id,order_id,user_id,mode,plan,plan_version,starts_at,ends_at,presentations_limit,photos_limit) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(this.org, row.id, row.id, row.user_id, row.mode, row.plan, row.plan_version, now, endsAt, plan.presentationFull, plan.photoTask),
          this.db
            .prepare(
              "INSERT INTO gpt_fiscal_receipts(org_id,order_id,kind,provider,status_code,last_error,next_at,updated_at) VALUES(?,?,'PERFORM',?,?,?,?,?) ON CONFLICT(org_id,order_id,kind) DO NOTHING",
            )
            .bind(this.org, row.id, row.provider, live ? FISCAL_QUEUED : FISCAL_SKIPPED, live ? null : "skipped_test", now, now),
        ],
        now,
      );
      if (moved) {
        const order = await this.read(id);
        return { order, entitlement: await this.mainEntitlement(order) };
      }
    }
    throw new StudioStoreError("busy");
  }

  private async mainEntitlement(order: StudioOrder): Promise<StudioEntitlement> {
    const row = await this.db
      .prepare("SELECT * FROM studio_entitlements WHERE org_id=? AND id=?")
      .bind(this.org, order.id)
      .first<StudioEntitlement>();
    if (!row) throw new StudioStoreError("not_found");
    return row;
  }

  /**
   * pending | prepared → cancelled: the buyer closed it, it expired, the
   * provider refused or cancelled it before the payment. `from` limits the
   * states it may leave (the state the caller read); `unseen` only while no
   * provider holds it (no external id). A cancelled or refunded order is
   * answered as it is; a paid one → state (its money goes back through
   * refundFull or recordRefund).
   */
  async cancel(
    id: string,
    options: {
      readonly method: string;
      readonly reason?: number | null;
      readonly from?: readonly StudioOrderState[];
      readonly unseen?: boolean;
      readonly now?: number;
    },
  ): Promise<StudioOrder> {
    const now = options.now ?? Date.now();
    for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt++) {
      const row = await this.read(id);
      if (row.state === "cancelled" || row.state === "refunded") return row;
      if (options.from && !options.from.includes(row.state)) throw new StudioStoreError("state");
      if (row.state !== "pending" && row.state !== "prepared") throw new StudioStoreError("state");
      if (options.unseen && (row.external_id || row.state !== "pending")) throw new StudioStoreError("state");
      const moved = await this.move(
        row,
        "cancelled",
        options.method,
        {
          sql: "UPDATE studio_orders_v2 SET state='cancelled',version=version+1,event_id=?,cancel_time=?,reason=? WHERE org_id=? AND id=? AND version=?",
          binds: [now, options.reason ?? null],
        },
        () => [],
        now,
      );
      if (moved) return this.read(id);
    }
    throw new StudioStoreError("busy");
  }

  /**
   * The buyer closes their own open order that no provider holds yet
   * (POST /api/studio/order/cancel): "cancelled", "in_progress" (a provider
   * holds it, or it is paid) or "not_found" (no such order of theirs).
   */
  async cancelOwn(userId: string, id: string, now = Date.now()): Promise<"cancelled" | "in_progress" | "not_found"> {
    const row = await this.byId(id);
    if (!row || row.user_id !== userId) return "not_found";
    if (row.state === "cancelled") return "cancelled";
    if (row.state !== "pending" || row.external_id) return "in_progress";
    try {
      await this.cancel(id, { method: "invoice_cancelled", from: ["pending"], unseen: true, now });
      return "cancelled";
    } catch (error) {
      if (error instanceof StudioStoreError && error.code === "state") return "in_progress";
      throw error;
    }
  }

  /**
   * paid → refunded with the whole amount: the provider gave the money
   * back (Payme CancelTransaction after the payment: `payme_cancel`; a
   * Click reversal or a cancellation in Click's cabinet). One batch: the
   * order, every entitlement of the order revoked, the studio_refunds row
   * (the units unused at that moment; the receipt is the provider's) and
   * the GA4 refund mark. No 14-day window: the money has already moved.
   * A repeat with the same method and reference answers the first refund;
   * any other second refund → refund_exists.
   */
  async refundFull(
    id: string,
    options: { readonly method: RefundMethod; readonly reference: string | null; readonly reason?: number | null; readonly now?: number },
  ): Promise<{ order: StudioOrder; refund: StudioRefund; replay: boolean }> {
    return this.closeWithRefund(id, { ...options, amount: "order", requestedAt: options.now, window: false });
  }

  /**
   * paid → refunded on the buyer's request (DECISIONS §4): within 14 days
   * of the payment (`requestedAt`, when they asked; `skipWindow` only for a
   * mistaken charge, §4 п. 5), for the units unused when they asked at the
   * published value (plans.ts refundValueTiyin) unless `amountTiyin` names
   * the amount (1 … the order's amount). Partial money goes back by
   * transfer (`transfer`: the refund receipt is ours, receipt_state 'due').
   * The tariff closes: every entitlement of the order is revoked.
   */
  async recordRefund(
    id: string,
    options: {
      readonly method: RefundMethod;
      readonly reference: string | null;
      readonly amountTiyin?: number;
      readonly requestedAt?: number;
      readonly skipWindow?: boolean;
      readonly unusedSnapshot?: UnusedUnits;
      readonly now?: number;
    },
  ): Promise<{ order: StudioOrder; refund: StudioRefund; replay: boolean }> {
    return this.closeWithRefund(id, {
      method: options.method,
      reference: options.reference,
      reason: null,
      now: options.now,
      requestedAt: options.requestedAt,
      amount: options.amountTiyin ?? "units",
      window: !options.skipWindow,
      unusedSnapshot: options.unusedSnapshot,
    });
  }

  private async closeWithRefund(
    id: string,
    options: {
      readonly method: RefundMethod;
      readonly reference: string | null;
      readonly reason?: number | null;
      readonly now?: number;
      readonly requestedAt?: number;
      readonly amount: "order" | "units" | number;
      readonly window: boolean;
      readonly unusedSnapshot?: UnusedUnits;
    },
  ): Promise<{ order: StudioOrder; refund: StudioRefund; replay: boolean }> {
    const now = options.now ?? Date.now();
    const requestedAt = options.requestedAt ?? now;
    for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt++) {
      const row = await this.read(id);
      const existing = await this.refundOf(row.id);
      if (existing) {
        if (existing.method === options.method && existing.reference === options.reference && options.amount === "order")
          return { order: row, refund: existing, replay: true };
        throw new StudioStoreError("refund_exists");
      }
      if (row.state === "refunded") throw new StudioStoreError("refund_exists");
      if (row.state !== "paid") throw new StudioStoreError("state");
      if (options.window && (requestedAt < row.perform_time || requestedAt > now || requestedAt - row.perform_time > REFUND_WINDOW_MS)) throw new StudioStoreError("refund_window");
      const unused = options.unusedSnapshot ?? unusedUnits(await this.orderEntitlements(row.id));
      let amount: number;
      if (options.amount === "order") amount = row.amount;
      else if (options.amount === "units") amount = Math.min(row.amount, refundValueTiyin(row.plan_version, row.plan, unused.presentations, unused.photos));
      else amount = options.amount;
      if (options.amount === "units" && amount <= 0) throw new StudioStoreError("nothing_to_refund");
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > row.amount) throw new StudioStoreError("refund_amount");
      const refundId = `sr_${crypto.randomUUID().replace(/-/g, "")}`;
      const moved = await this.move(
        row,
        "refunded",
        options.method,
        {
          sql: "UPDATE studio_orders_v2 SET state='refunded',version=version+1,event_id=?,cancel_time=?,reason=?,ga4_refund_state=CASE WHEN ga4_state IN ('pending','sent') THEN 'pending' ELSE ga4_refund_state END WHERE org_id=? AND id=? AND version=?",
          binds: [now, options.reason ?? null],
        },
        () => [
          this.db
            .prepare(
              "UPDATE studio_entitlements SET revoked_at=? WHERE rowid IN (SELECT rowid FROM studio_entitlements WHERE org_id=? AND order_id=? AND revoked_at IS NULL LIMIT 20)",
            )
            .bind(now, this.org, row.id),
          this.db
            .prepare(
              "INSERT INTO studio_refunds(org_id,id,order_id,amount,method,reference,presentations_unused,photos_unused,receipt_state,requested_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              this.org, refundId, row.id, amount, options.method, options.reference, unused.presentations, unused.photos,
              refundReceiptState(options.method), requestedAt, now, now,
            ),
        ],
        now,
      );
      if (moved) {
        const refund = await this.refundOf(row.id);
        if (!refund) throw new StudioStoreError("busy");
        return { order: await this.read(id), refund, replay: false };
      }
    }
    throw new StudioStoreError("busy");
  }

  /**
   * The provider's document number (Payme's receipt id from SetFiscalData,
   * Click's paydoc id), kept once: support finds an order by it
   * (restore.ts). A later different number does not replace the first.
   */
  async setDocId(id: string, docId: string): Promise<void> {
    await this.db
      .prepare("UPDATE studio_orders_v2 SET provider_doc_id=? WHERE org_id=? AND id=? AND provider_doc_id IS NULL")
      .bind(docId, this.org, id)
      .run();
  }

  /**
   * The owner's own purchase (studio-owner-order): owner_test=1, out of
   * reports and GA4 (ga4_state 'skipped' unless it was sent already).
   * Journaled; a repeat changes nothing.
   */
  async markOwnerTest(id: string, now = Date.now()): Promise<StudioOrder> {
    for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt++) {
      const row = await this.read(id);
      if (row.owner_test === 1) return row;
      const moved = await this.move(
        row,
        row.state,
        "owner_order",
        {
          sql: "UPDATE studio_orders_v2 SET version=version+1,event_id=?,owner_test=1,ga4_state=CASE WHEN ga4_state='sent' THEN ga4_state ELSE 'skipped' END WHERE org_id=? AND id=? AND version=?",
          binds: [],
        },
        () => [],
        now,
      );
      if (moved) return this.read(id);
    }
    throw new StudioStoreError("busy");
  }

  /**
   * Support's restore (restore.ts): the paid order `id`, held now by
   * `from`, moves with every entitlement and its offer acceptance to `to`,
   * in one batch guarded by the order's version and its holder;
   * restored_at = now. False when it was not held by `from` any more (moved
   * already, or by another tap).
   */
  async moveToAccount(id: string, from: string, to: string, now = Date.now()): Promise<boolean> {
    for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt++) {
      const row = await this.read(id);
      if (row.user_id !== from) return false;
      const moved = await this.move(
        row,
        row.state,
        "studio_restore",
        {
          sql: "UPDATE studio_orders_v2 SET version=version+1,event_id=?,user_id=?,restored_at=? WHERE org_id=? AND id=? AND version=?",
          binds: [to, now],
        },
        () => [
          this.db
            .prepare("UPDATE studio_entitlements SET user_id=? WHERE rowid IN (SELECT rowid FROM studio_entitlements WHERE org_id=? AND order_id=? LIMIT 20)")
            .bind(to, this.org, row.id),
          this.db.prepare("UPDATE gpt_payment_consents SET user_id=? WHERE org_id=? AND order_id=?").bind(to, this.org, row.id),
        ],
        now,
      );
      if (moved) return true;
    }
    throw new StudioStoreError("busy");
  }

  /**
   * For each of up to 10 entitlements: its spent units' jobs that may still
   * be made once more (spec §2.4): done by `subject` (the account's own
   * ledger subject, "a:" + its id: a deck made by the account that held the
   * order before a support restore is that account's), paid from it, not a
   * regeneration themselves, finished after `since` (24 hours ago), and
   * without a live regeneration of their own. The regenerate endpoint checks
   * the rest (the same task, the entitlement still running).
   */
  async regenAvailable(entitlementIds: readonly string[], subject: string, since: number): Promise<Map<string, string[]>> {
    const available = new Map<string, string[]>();
    const originals: string[] = [];
    for (const entitlementId of [...new Set(entitlementIds)].slice(0, 10)) {
      const rows = await this.db
        .prepare(
          "SELECT id FROM studio_unit_ledger WHERE org_id=? AND entitlement_id=? AND state='done' AND subject=? AND source='entitlement' AND regen_of IS NULL AND settled_at>? ORDER BY settled_at DESC LIMIT 10",
        )
        .bind(this.org, entitlementId, subject, since)
        .all<{ id: string }>();
      const ids = (rows.results ?? []).map((row) => row.id);
      available.set(entitlementId, ids);
      originals.push(...ids);
    }
    if (!originals.length) return available;
    const taken = await this.db
      .prepare(
        `SELECT regen_of FROM studio_unit_ledger WHERE org_id=? AND regen_of IN (${originals.map(() => "?").join(",")}) AND state IN ('reserved','delivering','done') LIMIT 100`,
      )
      .bind(this.org, ...originals)
      .all<{ regen_of: string }>();
    const used = new Set((taken.results ?? []).map((row) => row.regen_of));
    for (const [id, jobs] of available) available.set(id, jobs.filter((job) => !used.has(job)));
    return available;
  }

  /** Sale and refund receipt links of up to 10 orders (only printed ones with a link). */
  async receipts(orderIds: readonly string[]): Promise<Array<{ order_id: string; kind: "PERFORM" | "CANCEL"; receipt_url: string }>> {
    const ids = [...new Set(orderIds)].slice(0, 10);
    if (!ids.length) return [];
    const rows = await this.db
      .prepare(
        `SELECT order_id, kind, receipt_url FROM gpt_fiscal_receipts WHERE org_id=? AND order_id IN (${ids.map(() => "?").join(",")}) AND status_code=0 AND receipt_url IS NOT NULL LIMIT 20`,
      )
      .bind(this.org, ...ids)
      .all<{ order_id: string; kind: "PERFORM" | "CANCEL"; receipt_url: string }>();
    return rows.results ?? [];
  }
}

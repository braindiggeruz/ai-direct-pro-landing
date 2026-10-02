// Fiscal receipts queue (plan WP-14 and WP-15, D3): every live Click payment,
// and every Uzum payment whose registration carried no auto-fiscalization
// cart, gets a receipt from the tax authority's OFD with a link on
// ofd.soliq.uz, with retries, idempotently, and with an alert when it keeps
// failing.
//
// Rows live in gpt_fiscal_receipts (0064 + migrations/0068). The batch that
// marks an order paid inserts its PERFORM row; for Uzum the batch that
// returns the money of such an order inserts its CANCEL row (billing-store.ts).
// The primary key (org_id, order_id, kind) makes those inserts idempotent.
// status_code: -1 queued, 0 printed, -2 skipped (a Click test order or an
// Uzum test order without a test key, one reversed before its receipt was
// printed, a refund receipt of a sale that never printed, or one closed by
// hand after a receipt printed elsewhere, docs/paid-chat/CLICK-FISCAL-RU.md:
// last_error says which).
//
// fiscalizeDue runs right after Click's Complete and Uzum's payment
// (waitUntil) and in every maintenance tick. It leases one due row at a time
// (UPDATE … WHERE lease_until<=? RETURNING), so two workers never print the
// same receipt.
// Click (click-merchant.ts):
//   1. Click's payment_id is looked up by our merchant_trans_id
//      (status_by_mti) once and kept;
//   2. a retry first asks ofd_data whether the receipt already exists;
//   3. the receipt line goes out (submit_items) unless an earlier submit was
//      accepted (submitted_at): a receipt is never sent twice on purpose;
//   4. ofd_data gives the link. Printed = error_code 0 and a qrCodeURL on
//      https://ofd.soliq.uz (fiscal-config.ts ofdReceiptLink).
// Uzum (uzum-fiscal.ts):
//   1. the receipt's operation_id is written before the first call and reused;
//   2. a retry first asks receipt_url by that operation_id;
//   3. the receipt goes out (/v2/receipt or /v2/refund_receipt); "sent before"
//      counts as accepted, never as a reason to send another;
//   4. the link comes with the answer or from receipt_url. A refund receipt
//      waits for its sale receipt and repeats its payment_id.
//   Test orders print on the test host with the test key; without one they
//   are skipped_test.
// A failure waits 1, 5, 15, 60 minutes, then every 6 hours. From the sixth
// failed attempt, or once the payment is more than 24 hours old, a failure of
// a live receipt records the urgent alert click_fiscal_failed or
// uzum_fiscal_failed (one row per hour). last_error keeps a coarse code only
// (payment_id:network, submit:click_-5, qr_pending): never a message, a key
// or a card detail.
import {
  BILLING_ORG,
  clickCredentials,
  type BillingEnv,
  type BillingMode,
} from "./billing-config";
import { recordServiceAlert } from "./billing-maintenance-store";
import {
  CLICK_TIMEOUT_MS,
  clickFailureCode,
  clickReceiptItem,
  findClickPaymentId,
  ofdData,
  submitItems,
  type ClickCallOptions,
  type ClickMerchantAuth,
} from "./click-merchant";
import {
  fiscalParams,
  fiscalTin,
  ofdReceiptLink,
  testReceiptLink,
} from "./fiscal-config";
import { isUuid, uzumFiscalAccess, type UzumFiscalAccess } from "./uzum-config";
import {
  fetchReceiptUrl,
  submitReceipt,
  UZUM_FISCAL_TIMEOUT_MS,
  uzumFiscalFailureCode,
  uzumReceiptBody,
  type UzumFiscalCallOptions,
} from "./uzum-fiscal";

export const FISCAL_QUEUED = -1;
export const FISCAL_PRINTED = 0;
export const FISCAL_SKIPPED = -2;
/** Wait after the 1st, 2nd, 3rd, 4th and every later failed attempt. */
export const FISCAL_BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000] as const;
export const FISCAL_ALERT_ATTEMPTS = 6;
export const FISCAL_ALERT_AGE_MS = 24 * 3_600_000;
/** A lease outlives one receipt's calls (four at most); a dead worker's row comes back after it. */
const FISCAL_LEASE_MS = 60_000;
/** Rows per run (plan: at most 5 a tick). */
const FISCAL_BATCH = 5;
/** Below this, a run stops instead of starting another call. */
const MIN_CALL_MS = 500;

export type FiscalProvider = "click" | "uzum";
export type FiscalKind = "PERFORM" | "CANCEL";
/** A leased queue row. `lease_until` is the lease's token: every write checks it. */
export interface FiscalRow {
  order_id: string;
  kind: FiscalKind;
  provider: FiscalProvider;
  attempts: number;
  payment_id: string | null;
  submitted_at: number | null;
  operation_id: string | null;
  lease_until: number;
}
interface ClickOrderFacts {
  id: string;
  state: string;
  mode: string;
  amount: number;
  provider_time: number | null;
  perform_time: number;
}
interface UzumOrderFacts {
  id: string;
  state: string;
  mode: BillingMode;
  amount: number;
  external_id: string | null;
  perform_time: number;
  cancel_time: number;
}

export function fiscalBackoff(attempts: number): number {
  return FISCAL_BACKOFF_MS[Math.min(Math.max(attempts, 1), FISCAL_BACKOFF_MS.length) - 1];
}

export class FiscalStore {
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {}
  /** Leases the next due receipt of either provider, or null when none is due. */
  claim(now: number): Promise<FiscalRow | null> {
    return this.db
      .prepare(
        `UPDATE gpt_fiscal_receipts SET lease_until=?,attempts=attempts+1,updated_at=?
      WHERE org_id=? AND rowid=(SELECT rowid FROM gpt_fiscal_receipts WHERE org_id=? AND provider IN ('click','uzum')
        AND status_code=? AND next_at<=? AND lease_until<=? ORDER BY next_at LIMIT 1) AND lease_until<=?
      RETURNING order_id,kind,provider,attempts,payment_id,submitted_at,operation_id,lease_until`,
      )
      .bind(now + FISCAL_LEASE_MS, now, this.org, this.org, FISCAL_QUEUED, now, now, now)
      .first<FiscalRow>();
  }
  clickOrder(id: string): Promise<ClickOrderFacts | null> {
    return this.db
      .prepare(
        "SELECT id,state,mode,amount,provider_time,perform_time FROM gpt_payment_orders WHERE org_id=? AND id=? AND provider='click'",
      )
      .bind(this.org, id)
      .first<ClickOrderFacts>();
  }
  /** Read only for a claimed Uzum row, so gpt_uzum_orders (0065) exists by then. */
  uzumOrder(id: string): Promise<UzumOrderFacts | null> {
    return this.db
      .prepare(
        "SELECT id,state,mode,amount,external_id,perform_time,cancel_time FROM gpt_uzum_orders WHERE org_id=? AND id=?",
      )
      .bind(this.org, id)
      .first<UzumOrderFacts>();
  }
  /** One write on a leased row; a lost lease (another worker took over) changes nothing. */
  private async leased(row: FiscalRow, set: string, values: unknown[]): Promise<void> {
    await this.db
      .prepare(
        `UPDATE gpt_fiscal_receipts SET ${set} WHERE org_id=? AND order_id=? AND kind=? AND lease_until=?`,
      )
      .bind(...values, this.org, row.order_id, row.kind, row.lease_until)
      .run();
  }
  keepPaymentId(row: FiscalRow, paymentId: string): Promise<void> {
    return this.leased(row, "payment_id=?", [paymentId]);
  }
  /** The Uzum receipt's idempotency key, written before the receipt goes out. */
  keepOperationId(row: FiscalRow, operationId: string): Promise<void> {
    return this.leased(row, "operation_id=?", [operationId]);
  }
  /** The provider accepted the receipt; the payment id it named is kept unless one is. */
  submitted(row: FiscalRow, now: number, paymentId: string | null = null): Promise<void> {
    return this.leased(row, "submitted_at=?,payment_id=COALESCE(payment_id,?)", [now, paymentId]);
  }
  printed(row: FiscalRow, url: string, now: number): Promise<void> {
    return this.leased(
      row,
      "status_code=?,receipt_url=?,last_error=NULL,lease_until=0,updated_at=?",
      [FISCAL_PRINTED, url, now],
    );
  }
  retry(row: FiscalRow, error: string, now: number): Promise<void> {
    return this.leased(row, "last_error=?,next_at=?,lease_until=0,updated_at=?", [
      error,
      now + fiscalBackoff(row.attempts),
      now,
    ]);
  }
  skip(row: FiscalRow, reason: string, now: number): Promise<void> {
    return this.leased(row, "status_code=?,last_error=?,lease_until=0,updated_at=?", [
      FISCAL_SKIPPED,
      reason,
      now,
    ]);
  }
  /** The sale receipt row of an order (the reversal endpoint; an Uzum refund receipt). */
  receipt(orderId: string) {
    return this.db
      .prepare(
        "SELECT status_code,payment_id FROM gpt_fiscal_receipts WHERE org_id=? AND order_id=? AND kind='PERFORM'",
      )
      .bind(this.org, orderId)
      .first<{ status_code: number; payment_id: string | null }>();
  }
  /** Keeps a payment id found outside the queue (reversal); never overwrites one. */
  async rememberPaymentId(orderId: string, paymentId: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE gpt_fiscal_receipts SET payment_id=? WHERE org_id=? AND order_id=? AND kind='PERFORM' AND payment_id IS NULL",
      )
      .bind(paymentId, this.org, orderId)
      .run();
  }
  /** Receipts still waiting, and how many of them are past the alert threshold. */
  async queue(): Promise<{ queued: number; failing: number }> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS queued,COALESCE(SUM(attempts>=?),0) AS failing FROM gpt_fiscal_receipts
      WHERE org_id=? AND provider IN ('click','uzum') AND status_code=?`,
      )
      .bind(FISCAL_ALERT_ATTEMPTS, this.org, FISCAL_QUEUED)
      .first<{ queued: number; failing: number }>();
    return { queued: Number(row?.queued ?? 0), failing: Number(row?.failing ?? 0) };
  }
}

/** Click Merchant API access of `mode`, or null while anything is missing. */
export function clickMerchantAuth(
  env: BillingEnv,
  mode: BillingMode,
): ClickMerchantAuth | null {
  const credentials = clickCredentials(env, mode);
  return credentials?.merchantUserId
    ? {
        serviceId: credentials.serviceId,
        merchantUserId: credentials.merchantUserId,
        secretKey: credentials.secretKey,
      }
    : null;
}

type Printed = { link: string } | { error: string };
/** One claimed row's fate: printed, failed (retried), or skipped with a reason. */
type Outcome = Printed | { skip: string };
interface Due {
  outcome: Outcome;
  /** The alert a failure records once it is old or repeated; null for a test receipt. */
  alert: string | null;
  /** When the money moved: the age that raises the alert. */
  since: number;
}

/** A call's timeout: what is left of the run, within the provider's own limit. */
function callTimeout(limitMs: number, deadline: number): number {
  return Math.max(MIN_CALL_MS, Math.min(limitMs, deadline - Date.now()));
}

/** Prints one leased Click receipt: the link, or a coarse failure code. */
async function printClickReceipt(
  env: BillingEnv,
  store: FiscalStore,
  row: FiscalRow,
  order: ClickOrderFacts,
  now: number,
  deadline: number,
): Promise<Printed> {
  const auth = clickMerchantAuth(env, "live");
  const params = fiscalParams(env);
  const tin = fiscalTin(env);
  if (!auth || !params || !tin) return { error: "config_missing" };
  const options = (): ClickCallOptions => ({
    now,
    timeoutMs: callTimeout(CLICK_TIMEOUT_MS, deadline),
  });
  let payment = row.payment_id;
  if (!payment) {
    const found = await findClickPaymentId(auth, order, options());
    if (!found.ok) return { error: `payment_id:${clickFailureCode(found)}` };
    payment = found.paymentId;
    await store.keepPaymentId(row, payment);
  }
  const link = (url: string) => {
    const checked = ofdReceiptLink(url);
    return checked ? { link: checked } : { error: "qr_host" };
  };
  // A retry: the receipt may exist already (a lost answer, a slow OFD).
  if (row.attempts > 1) {
    const existing = await ofdData(auth, payment, options());
    if (existing.ok && existing.qrCodeUrl) return link(existing.qrCodeUrl);
    // Click accepted the receipt before: wait for its link, never resend it.
    if (row.submitted_at !== null)
      return { error: existing.ok ? "qr_pending" : `ofd:${clickFailureCode(existing)}` };
  }
  const sent = await submitItems(
    auth,
    payment,
    [clickReceiptItem(params, tin, order.amount)],
    order.amount,
    options(),
  );
  if (!sent.ok) return { error: `submit:${clickFailureCode(sent)}` };
  await store.submitted(row, now);
  const receipt = await ofdData(auth, payment, options());
  if (!receipt.ok) return { error: `ofd:${clickFailureCode(receipt)}` };
  return receipt.qrCodeUrl ? link(receipt.qrCodeUrl) : { error: "qr_pending" };
}

async function dueClick(
  env: BillingEnv,
  store: FiscalStore,
  row: FiscalRow,
  now: number,
  deadline: number,
): Promise<Due> {
  const order = await store.clickOrder(row.order_id);
  if (!order || order.mode !== "live" || order.state !== "paid")
    return {
      outcome: {
        skip: !order ? "order_missing" : order.mode !== "live" ? "skipped_test" : "skipped_refunded",
      },
      alert: null,
      since: now,
    };
  return {
    outcome: await printClickReceipt(env, store, row, order, now, deadline),
    alert: "click_fiscal_failed",
    since: order.perform_time || now,
  };
}

/** Prints one leased Uzum receipt through the Fiscalization API. */
async function printUzumReceipt(
  env: BillingEnv,
  store: FiscalStore,
  row: FiscalRow,
  order: UzumOrderFacts,
  access: UzumFiscalAccess,
  salePaymentId: string | null,
  at: number,
  now: number,
  deadline: number,
): Promise<Printed> {
  const params = fiscalParams(env);
  if (!params) return { error: "config_missing" };
  const options = (): UzumFiscalCallOptions => ({
    timeoutMs: callTimeout(UZUM_FISCAL_TIMEOUT_MS, deadline),
  });
  // The idempotency key exists before Uzum ever hears of this receipt.
  let operationId = row.operation_id;
  if (!operationId) {
    operationId = crypto.randomUUID();
    await store.keepOperationId(row, operationId);
  }
  const link = (url: string): Printed => {
    const checked = order.mode === "live" ? ofdReceiptLink(url) : testReceiptLink(url);
    return checked ? { link: checked } : { error: "qr_host" };
  };
  // A retry: the receipt may be printed already (a lost answer, a slow OFD).
  if (row.attempts > 1 || row.submitted_at !== null) {
    const existing = await fetchReceiptUrl(access, operationId, options());
    if (existing.ok)
      return existing.receiptUrl ? link(existing.receiptUrl) : { error: "qr_pending" };
    // Uzum took it before: wait for its link rather than resend it.
    if (existing.error !== "not_found" && row.submitted_at !== null)
      return { error: `url:${uzumFiscalFailureCode(existing)}` };
  }
  const paymentId =
    row.kind === "CANCEL"
      ? salePaymentId
      : (row.payment_id ?? (isUuid(order.external_id) ? order.external_id.toLowerCase() : null));
  if (row.kind === "CANCEL" && !paymentId) return { error: "payment_id" };
  const sent = await submitReceipt(
    access,
    row.kind,
    uzumReceiptBody(row.kind, { operationId, paymentId, at, amount: order.amount, params }),
    options(),
  );
  if (!sent.ok) return { error: `submit:${uzumFiscalFailureCode(sent)}` };
  await store.submitted(row, now, row.kind === "PERFORM" ? (sent.paymentId ?? paymentId) : null);
  if (sent.receiptUrl) return link(sent.receiptUrl);
  const receipt = await fetchReceiptUrl(access, operationId, options());
  if (!receipt.ok) return { error: `url:${uzumFiscalFailureCode(receipt)}` };
  return receipt.receiptUrl ? link(receipt.receiptUrl) : { error: "qr_pending" };
}

async function dueUzum(
  env: BillingEnv,
  store: FiscalStore,
  row: FiscalRow,
  now: number,
  deadline: number,
): Promise<Due> {
  const skip = (reason: string): Due => ({ outcome: { skip: reason }, alert: null, since: now });
  const order = await store.uzumOrder(row.order_id);
  if (!order) return skip("order_missing");
  // A sale reversed before its receipt printed is no sale; a refund receipt
  // belongs to money that went back.
  if (row.kind === "PERFORM" && order.state !== "paid") return skip("skipped_refunded");
  if (row.kind === "CANCEL" && order.state !== "refunded") return skip("not_refunded");
  const access = uzumFiscalAccess(env, order.mode);
  if (!access && order.mode === "test") return skip("skipped_test");
  const at = (row.kind === "PERFORM" ? order.perform_time : order.cancel_time) || now;
  const alert = order.mode === "live" ? "uzum_fiscal_failed" : null;
  let salePaymentId: string | null = null;
  if (row.kind === "CANCEL") {
    const sale = await store.receipt(order.id);
    // No sale receipt ever printed: there is nothing to refund on the OFD.
    if (!sale || sale.status_code === FISCAL_SKIPPED) return skip("sale_unprinted");
    if (sale.status_code !== FISCAL_PRINTED)
      return { outcome: { error: "sale_pending" }, alert, since: at };
    salePaymentId = sale.payment_id;
  }
  if (!access) return { outcome: { error: "config_missing" }, alert, since: at };
  return {
    outcome: await printUzumReceipt(env, store, row, order, access, salePaymentId, at, now, deadline),
    alert,
    since: at,
  };
}

export interface FiscalTick {
  printed: number;
  /** Failed this time; each waits for its next attempt. */
  retried: number;
  skipped: number;
  /** Still queued after the run, and of them past the alert threshold. */
  queued: number;
  failing: number;
}

/**
 * Prints the due receipts of Click and Uzum, at most `limit`, within
 * `budgetMs` of wall time (a row already started finishes its calls; its
 * lease covers a cut).
 */
export async function fiscalizeDue(
  env: BillingEnv,
  options: { now?: number; limit?: number; budgetMs?: number } = {},
): Promise<FiscalTick> {
  const tick: FiscalTick = { printed: 0, retried: 0, skipped: 0, queued: 0, failing: 0 };
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return tick;
  const now = options.now ?? Date.now();
  const deadline = Date.now() + (options.budgetMs ?? 20_000);
  const store = new FiscalStore(db, BILLING_ORG);
  for (let n = 0; n < (options.limit ?? FISCAL_BATCH); n++) {
    if (deadline - Date.now() < MIN_CALL_MS) break;
    const row = await store.claim(now);
    if (!row) break;
    const due =
      row.provider === "click"
        ? await dueClick(env, store, row, now, deadline)
        : await dueUzum(env, store, row, now, deadline);
    const { outcome } = due;
    if ("skip" in outcome) {
      await store.skip(row, outcome.skip, now);
      tick.skipped++;
    } else if ("link" in outcome) {
      await store.printed(row, outcome.link, now);
      tick.printed++;
    } else {
      await store.retry(row, outcome.error, now);
      tick.retried++;
      if (due.alert && (row.attempts >= FISCAL_ALERT_ATTEMPTS || now - due.since > FISCAL_ALERT_AGE_MS))
        await recordServiceAlert(env, due.alert, now);
    }
  }
  Object.assign(tick, await store.queue());
  return tick;
}

// Fiscal receipts queue (plan WP-14, D3): every live Click payment gets a
// receipt from the tax authority's OFD with a link on ofd.soliq.uz, with
// retries, idempotently, and with an alert when it keeps failing.
//
// Rows live in gpt_fiscal_receipts (0064 + migrations/0068). The batch that
// marks a Click order paid inserts its PERFORM row (billing-store.ts); the
// primary key (org_id, order_id, kind) makes that insert idempotent.
// status_code: -1 queued, 0 printed, -2 skipped (a test order, one
// reversed before its receipt was printed, or one closed by hand after a
// receipt printed elsewhere, docs/paid-chat/CLICK-FISCAL-RU.md: last_error
// says which).
//
// fiscalizeDue runs right after Click's Complete (waitUntil) and in every
// maintenance tick. It leases one due row at a time (UPDATE … WHERE
// lease_until<=? RETURNING), so two workers never print the same receipt:
//   1. Click's payment_id is looked up by our merchant_trans_id
//      (status_by_mti) once and kept;
//   2. a retry first asks ofd_data whether the receipt already exists;
//   3. the receipt line goes out (submit_items) unless an earlier submit was
//      accepted (submitted_at): a receipt is never sent twice on purpose;
//   4. ofd_data gives the link. Printed = error_code 0 and a qrCodeURL on
//      https://ofd.soliq.uz (fiscal-config.ts ofdReceiptLink).
// A failure waits 1, 5, 15, 60 minutes, then every 6 hours. From the sixth
// failed attempt, or once the payment is more than 24 hours old, a failure
// records the urgent alert click_fiscal_failed (one row per hour).
// last_error keeps a coarse code only (payment_id:network, submit:click_-5,
// qr_pending): never a message, a key or a card detail.
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
import { fiscalParams, fiscalTin, ofdReceiptLink } from "./fiscal-config";

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

/** A leased queue row. `lease_until` is the lease's token: every write checks it. */
export interface FiscalRow {
  order_id: string;
  attempts: number;
  payment_id: string | null;
  submitted_at: number | null;
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

export function fiscalBackoff(attempts: number): number {
  return FISCAL_BACKOFF_MS[Math.min(Math.max(attempts, 1), FISCAL_BACKOFF_MS.length) - 1];
}

export class FiscalStore {
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {}
  /** Leases the next due Click receipt, or null when none is due. */
  claim(now: number): Promise<FiscalRow | null> {
    return this.db
      .prepare(
        `UPDATE gpt_fiscal_receipts SET lease_until=?,attempts=attempts+1,updated_at=?
      WHERE org_id=? AND rowid=(SELECT rowid FROM gpt_fiscal_receipts WHERE org_id=? AND provider='click' AND kind='PERFORM'
        AND status_code=? AND next_at<=? AND lease_until<=? ORDER BY next_at LIMIT 1) AND lease_until<=?
      RETURNING order_id,attempts,payment_id,submitted_at,lease_until`,
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
  /** One write on a leased row; a lost lease (another worker took over) changes nothing. */
  private async leased(row: FiscalRow, set: string, values: unknown[]): Promise<void> {
    await this.db
      .prepare(
        `UPDATE gpt_fiscal_receipts SET ${set} WHERE org_id=? AND order_id=? AND kind='PERFORM' AND lease_until=?`,
      )
      .bind(...values, this.org, row.order_id, row.lease_until)
      .run();
  }
  keepPaymentId(row: FiscalRow, paymentId: string): Promise<void> {
    return this.leased(row, "payment_id=?", [paymentId]);
  }
  submitted(row: FiscalRow, now: number): Promise<void> {
    return this.leased(row, "submitted_at=?", [now]);
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
  /** The receipt row of an order, for the reversal endpoint. */
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
  /** Click receipts still waiting, and how many of them are past the alert threshold. */
  async queue(): Promise<{ queued: number; failing: number }> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS queued,COALESCE(SUM(attempts>=?),0) AS failing FROM gpt_fiscal_receipts
      WHERE org_id=? AND provider='click' AND kind='PERFORM' AND status_code=?`,
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

/** Prints one leased receipt: the link, or a coarse failure code. */
async function printClickReceipt(
  env: BillingEnv,
  store: FiscalStore,
  row: FiscalRow,
  order: ClickOrderFacts,
  now: number,
  deadline: number,
): Promise<{ link: string } | { error: string }> {
  const auth = clickMerchantAuth(env, "live");
  const params = fiscalParams(env);
  const tin = fiscalTin(env);
  if (!auth || !params || !tin) return { error: "config_missing" };
  const options = (): ClickCallOptions => ({
    now,
    timeoutMs: Math.max(MIN_CALL_MS, Math.min(CLICK_TIMEOUT_MS, deadline - Date.now())),
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
 * Prints the due Click receipts, at most `limit`, within `budgetMs` of wall
 * time (a row already started finishes its calls; its lease covers a cut).
 * Live orders only: a test order's row is skipped_test from the start.
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
    const order = await store.clickOrder(row.order_id);
    if (!order || order.mode !== "live" || order.state !== "paid") {
      await store.skip(
        row,
        !order ? "order_missing" : order.mode !== "live" ? "skipped_test" : "skipped_refunded",
        now,
      );
      tick.skipped++;
      continue;
    }
    const result = await printClickReceipt(env, store, row, order, now, deadline);
    if ("link" in result) {
      await store.printed(row, result.link, now);
      tick.printed++;
      continue;
    }
    await store.retry(row, result.error, now);
    tick.retried++;
    const paidAt = order.perform_time || now;
    if (row.attempts >= FISCAL_ALERT_ATTEMPTS || now - paidAt > FISCAL_ALERT_AGE_MS)
      await recordServiceAlert(env, "click_fiscal_failed", now);
  }
  Object.assign(tick, await store.queue());
  return tick;
}

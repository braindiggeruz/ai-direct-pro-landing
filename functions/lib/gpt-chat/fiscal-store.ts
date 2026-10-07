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
// printed (Click) or reached Uzum, a refund receipt of a sale that never
// printed, or one closed by hand after a receipt printed elsewhere,
// docs/paid-chat/CLICK-FISCAL-RU.md: last_error says which).
//
// fiscalizeDue runs right after Click's Complete and Uzum's payment
// (waitUntil) and in every maintenance tick. It leases one due row at a time
// (UPDATE … WHERE lease_until<=? RETURNING), so two workers never print the
// same receipt.
// Click (click-merchant.ts). Click may print the receipt itself (it set up
// OFD for the service on its side, 2026-10-05), so GPT_CLICK_AUTOFISCAL picks
// the path (fiscal-config.ts clickFiscalPolicy): "" checks first, "true" only
// reads Click's link, "false" sends ours at once (the path before 2026-10-05).
//   1. Click's payment_id is looked up by our merchant_trans_id
//      (status_by_mti) once and kept;
//   2. ofd_data is asked whether a receipt exists: on every attempt (check
//      first, "true"), or on a retry ("false"). A link there is kept;
//   3. check first: until GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES after the
//      payment a missing receipt is waited for (auto_wait: no attempt, no
//      failure); after it, ours goes out only when Click itself said it has
//      none (an answer without a link, or HTTP 404: noClickReceipt), never
//      after a read that said nothing (a network failure, a 5xx, another
//      error code); "true" never sends one (auto_pending: a wait on the retry
//      schedule by the payment's age, paged a day after the payment);
//   4. the receipt line goes out (submit_items) unless an earlier submit was
//      accepted (submitted_at): a receipt is never sent twice on purpose.
//      operation_id = click:submit_items is written before the first one
//      goes out (Uzum keeps its own key there; Click has none);
//   5. ofd_data gives the link. Printed = error_code 0 and a qrCodeURL on
//      https://ofd.soliq.uz (fiscal-config.ts ofdReceiptLink). last_error of
//      a printed Click row says who printed it: auto (we never sent ours),
//      ours (Click accepted ours), unknown (ours went out, Click never
//      accepted it: a lost answer or a refusal).
//   A paid order whose money went back before its receipt printed never gets
//   ours, but a sale receipt may exist all the same (Click's own, or ours that
//   went out): one ofd_data read keeps its link, or closes the row as
//   skipped_refunded (Click has none, ours never went out) or refunded_unknown
//   (check the Click cabinet).
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
// uzum_fiscal_failed (one row per hour); Click's own receipt not there yet
// (auto_pending) is no failed attempt and pages only by age. A refunded
// order's row never pages. last_error keeps a coarse code only
// (payment_id:network, submit:click_-5, qr_pending): never a message, a key
// or a card detail.
import {
  BILLING_ORG,
  clickCredentials,
  type BillingEnv,
  type BillingMode,
} from "./billing-config";
import { recordServiceAlert } from "./billing-maintenance-store";
import { studioClickCredentials } from "../studio/checkout";
import { parseStudioConfig } from "../studio/config";
import { planOfVersion } from "../studio/plans";
import {
  CLICK_TIMEOUT_MS,
  clickFailureCode,
  clickReceiptItem,
  findClickPaymentId,
  ofdData,
  submitItems,
  type ClickCallOptions,
  type ClickFailure,
  type ClickMerchantAuth,
  type ClickResult,
} from "./click-merchant";
import {
  clickFiscalPolicy,
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
/** A Click row's operation_id once our submit_items has gone out (step 4). */
export const CLICK_SUBMIT_MARK = "click:submit_items";
/** Who printed a Click receipt, kept in last_error of the printed row. */
export type ClickReceiptSource = "auto" | "ours" | "unknown";

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
  plan?: string;
  plan_version?: string;
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

/**
 * The same schedule counted by the payment's age instead of the attempts: the
 * wait after Click's "not yet" with GPT_CLICK_AUTOFISCAL "true", a read that
 * gives its attempt back (1, 5, 15, 60 minutes, then 6 hours after a payment
 * read on time).
 */
export function fiscalBackoffByAge(ageMs: number): number {
  let elapsed = 0;
  for (const step of FISCAL_BACKOFF_MS) {
    elapsed += step;
    if (ageMs < elapsed) return step;
  }
  return FISCAL_BACKOFF_MS[FISCAL_BACKOFF_MS.length - 1];
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
    if (id.startsWith("stu_")) return this.db.prepare("SELECT id,state,mode,amount,provider_time,perform_time,plan,plan_version FROM studio_orders_v2 WHERE org_id=? AND id=? AND provider='click'").bind(this.org, id).first<ClickOrderFacts>();
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
  /** Click: our receipt line is about to go out; the first mark stays. */
  markSubmit(row: FiscalRow): Promise<void> {
    return this.leased(row, "operation_id=COALESCE(operation_id,?)", [CLICK_SUBMIT_MARK]);
  }
  /** `source`: who printed a Click receipt (last_error); null for Uzum. */
  printed(row: FiscalRow, url: string, now: number, source: ClickReceiptSource | null = null): Promise<void> {
    return this.leased(
      row,
      "status_code=?,receipt_url=?,last_error=?,lease_until=0,updated_at=?",
      [FISCAL_PRINTED, url, source, now],
    );
  }
  retry(row: FiscalRow, error: string, now: number): Promise<void> {
    return this.leased(row, "last_error=?,next_at=?,lease_until=0,updated_at=?", [
      error,
      now + fiscalBackoff(row.attempts),
      now,
    ]);
  }
  /**
   * Click may still print it itself (check first: auto_wait; "true":
   * auto_pending). The row comes back at `until`; the claim does not count as
   * an attempt, so the retry schedule and the six-attempt alert count real
   * failures only.
   */
  wait(row: FiscalRow, reason: string, until: number, now: number): Promise<void> {
    return this.leased(
      row,
      "attempts=MAX(attempts-1,0),last_error=?,next_at=?,lease_until=0,updated_at=?",
      [reason, until, now],
    );
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
  /** Receipts still waiting, and how many of them failed six attempts or more. */
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
  orderId = "",
): ClickMerchantAuth | null {
  const credentials = orderId.startsWith("stu_") ? studioClickCredentials(env, mode) : clickCredentials(env, mode);
  return credentials?.merchantUserId
    ? {
        serviceId: credentials.serviceId,
        merchantUserId: credentials.merchantUserId,
        secretKey: credentials.secretKey,
      }
    : null;
}

/** `source`: who printed a Click receipt. */
type Printed = { link: string; source?: ClickReceiptSource } | { error: string };
/**
 * One claimed row's fate: printed, failed (retried), waiting, or skipped with
 * a reason. A wait gives its attempt back; `pages`: it still pages once the
 * payment is a day old (Click's own receipt missing with "true").
 */
type Outcome = Printed | { skip: string } | { wait: string; until: number; pages?: boolean };
interface Due {
  outcome: Outcome;
  /** The alert a failure records once it is old or repeated; null: never paged. */
  alert: string | null;
  /** When the money moved: the age that raises the alert. */
  since: number;
}

/** A call's timeout: what is left of the run, within the provider's own limit. */
function callTimeout(limitMs: number, deadline: number): number {
  return Math.max(MIN_CALL_MS, Math.min(limitMs, deadline - Date.now()));
}

/** Each Click call's options: the Auth clock and what is left of the run. */
function clickOptions(now: number, deadline: number): () => ClickCallOptions {
  return () => ({ now, timeoutMs: callTimeout(CLICK_TIMEOUT_MS, deadline) });
}

/**
 * A failed ofd_data read that is still Click's own word that it holds no
 * receipt for the payment (yet): HTTP 404, bare or with an error_code. An
 * answer without a link (error_code 0) is the other one. Click documents its
 * errors as HTTP statuses and lists no ofd_data codes, so nothing else
 * counts: a network failure, a timeout, a 5xx or another 4xx (with or
 * without an error_code) and a 2xx carrying a non-zero error_code (-500, -9,
 * any) say nothing about a receipt that may exist. Ours never goes out on
 * them: the row retries and pages after six attempts or a day.
 */
function noClickReceipt(failure: ClickFailure): boolean {
  return (
    (failure.error === "http" && failure.code === 404) ||
    (failure.error === "click" && failure.status === 404)
  );
}

/** Who printed a receipt found at Click before our submit of this attempt. */
function foundSource(row: FiscalRow): ClickReceiptSource {
  // Ours only if Click accepted one of ours; Click's own if none ever went out.
  return row.submitted_at !== null ? "ours" : row.operation_id ? "unknown" : "auto";
}

/** Click's payment id of the order: kept, or looked up (status_by_mti) and kept. */
async function clickPaymentId(
  auth: ClickMerchantAuth,
  store: FiscalStore,
  row: FiscalRow,
  order: ClickOrderFacts,
  options: ClickCallOptions,
): Promise<ClickResult<{ paymentId: string }>> {
  if (row.payment_id) return { ok: true, paymentId: row.payment_id };
  const found = await findClickPaymentId(auth, order, options);
  if (found.ok) await store.keepPaymentId(row, found.paymentId);
  return found;
}

/** Handles one leased Click receipt of a paid order: the link, a wait, or a coarse failure code. */
async function printClickReceipt(
  env: BillingEnv,
  store: FiscalStore,
  row: FiscalRow,
  order: ClickOrderFacts,
  paidAt: number,
  now: number,
  deadline: number,
): Promise<Outcome> {
  const studioConfig = parseStudioConfig(env.STUDIO_RUNTIME_CONFIG_JSON);
  const policy = clickFiscalPolicy(order.id.startsWith("stu_") && !studioConfig.clickUseChatService ? { ...env, GPT_CLICK_AUTOFISCAL: studioConfig.clickAutofiscal } : env);
  const auth = clickMerchantAuth(env, "live", order.id);
  const params = fiscalParams(env);
  const tin = fiscalTin(env);
  const studioPlan = order.id.startsWith("stu_") ? planOfVersion(order.plan_version ?? "", order.plan ?? "") : null;
  if (order.id.startsWith("stu_") && (!studioPlan || studioPlan.amountTiyin !== order.amount)) return { error: "plan_missing" };
  // Reading Click's own receipt needs the Merchant API only; ours needs the line too.
  if (!auth || (policy.mode !== "auto" && (!params || !tin))) return { error: "config_missing" };
  const options = clickOptions(now, deadline);
  // Check first: before this, a missing receipt is Click's to print.
  const submitFrom = paidAt + policy.delayMs;
  const waiting = policy.mode === "check" && now < submitFrom;
  const wait: Outcome = { wait: "auto_wait", until: submitFrom };
  const found = await clickPaymentId(auth, store, row, order, options());
  if (!found.ok) return waiting ? wait : { error: `payment_id:${clickFailureCode(found)}` };
  const payment = found.paymentId;
  const link = (url: string, source: ClickReceiptSource): Printed => {
    const checked = ofdReceiptLink(url);
    return checked ? { link: checked, source } : { error: "qr_host" };
  };
  // Check first and "true": always; "false": a retry (a lost answer, a slow OFD).
  if (policy.mode !== "submit" || row.attempts > 1) {
    const existing = await ofdData(auth, payment, options());
    if (existing.ok && existing.qrCodeUrl) return link(existing.qrCodeUrl, foundSource(row));
    // Click accepted ours before: wait for its link, never resend it.
    if (row.submitted_at !== null)
      return { error: existing.ok ? "qr_pending" : `ofd:${clickFailureCode(existing)}` };
    // A read that did not say whether Click holds a receipt.
    const unclear =
      existing.ok || noClickReceipt(existing) ? null : `ofd:${clickFailureCode(existing)}`;
    if (policy.mode === "auto")
      return unclear
        ? { error: unclear }
        : { wait: "auto_pending", until: now + fiscalBackoffByAge(now - paidAt), pages: true };
    if (waiting) return wait;
    // Right before ours: only on Click's word that it has none.
    if (policy.mode === "check" && unclear) return { error: unclear };
  }
  // Never reached with GPT_CLICK_AUTOFISCAL "true"; the others checked these above.
  if (!params || !tin) return { error: "config_missing" };
  await store.markSubmit(row);
  const sent = await submitItems(
    auth,
    payment,
    [clickReceiptItem(params, tin, order.amount, studioPlan?.receiptName)],
    order.amount,
    options(),
  );
  if (!sent.ok) return { error: `submit:${clickFailureCode(sent)}` };
  await store.submitted(row, now);
  const receipt = await ofdData(auth, payment, options());
  if (!receipt.ok) return { error: `ofd:${clickFailureCode(receipt)}` };
  return receipt.qrCodeUrl ? link(receipt.qrCodeUrl, "ours") : { error: "qr_pending" };
}

/**
 * A Click order whose money went back before its receipt printed. Ours never
 * goes out now, but a sale receipt may be on the OFD all the same: Click's
 * own, or ours whose answer was lost or whose link came late. One ofd_data
 * read decides:
 *   - a link on ofd.soliq.uz: kept as printed (with who printed it), so the
 *     sale is on record and its refund is settled with the accountant;
 *   - Click's "no receipt": skipped_refunded, or refunded_unknown when ours
 *     went out before (Click may still print it);
 *   - no answer: retried (never paged), then refunded_unknown from the sixth
 *     attempt.
 * refunded_unknown asks for a look at the Click cabinet (CLICK-FISCAL-RU.md).
 */
async function refundedClickReceipt(
  env: BillingEnv,
  store: FiscalStore,
  row: FiscalRow,
  order: ClickOrderFacts,
  now: number,
  deadline: number,
): Promise<Outcome> {
  const unclear = (error: string): Outcome =>
    row.attempts < FISCAL_ALERT_ATTEMPTS ? { error } : { skip: "refunded_unknown" };
  const auth = clickMerchantAuth(env, "live", order.id);
  if (!auth) return unclear("config_missing");
  const options = clickOptions(now, deadline);
  const found = await clickPaymentId(auth, store, row, order, options());
  if (!found.ok) return unclear(`payment_id:${clickFailureCode(found)}`);
  const existing = await ofdData(auth, found.paymentId, options());
  if (existing.ok && existing.qrCodeUrl) {
    const checked = ofdReceiptLink(existing.qrCodeUrl);
    return checked ? { link: checked, source: foundSource(row) } : unclear("qr_host");
  }
  if (!existing.ok && !noClickReceipt(existing)) return unclear(`ofd:${clickFailureCode(existing)}`);
  return { skip: row.operation_id ? "refunded_unknown" : "skipped_refunded" };
}

async function dueClick(
  env: BillingEnv,
  store: FiscalStore,
  row: FiscalRow,
  now: number,
  deadline: number,
): Promise<Due> {
  const order = await store.clickOrder(row.order_id);
  if (!order && row.order_id.startsWith("stu_")) return { outcome: { error: "order_missing" }, alert: "studio_fiscal_failed", since: 0 };
  if (!order || order.mode !== "live")
    return { outcome: { skip: !order ? "order_missing" : "skipped_test" }, alert: null, since: now };
  // When the money moved: Complete, else Prepare (a paid order has both).
  // Unknown counts as long ago: the delay is over and a failure pages.
  const paidAt = order.perform_time || order.provider_time || 0;
  if (order.state !== "paid")
    return {
      outcome: await refundedClickReceipt(env, store, row, order, now, deadline),
      alert: null,
      since: paidAt,
    };
  return {
    outcome: await printClickReceipt(env, store, row, order, paidAt, now, deadline),
    alert: "click_fiscal_failed",
    since: paidAt,
  };
}

/** The Uzum payment uuid a sale receipt is sent with: the Checkout orderId or the app transId. */
function uzumPaymentId(order: UzumOrderFacts): string | null {
  return isUuid(order.external_id) ? order.external_id.toLowerCase() : null;
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
): Promise<Outcome> {
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
    // Uzum never got the sale receipt of money that has gone back since: no sale.
    if (existing.error === "not_found" && row.kind === "PERFORM" && order.state !== "paid")
      return { skip: "skipped_refunded" };
    // Uzum took it before: wait for its link rather than resend it.
    if (existing.error !== "not_found" && row.submitted_at !== null)
      return { error: `url:${uzumFiscalFailureCode(existing)}` };
  }
  const paymentId =
    row.kind === "CANCEL"
      ? salePaymentId
      : (row.payment_id ?? uzumPaymentId(order));
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
  // A sale reversed before its receipt was ever sent is no sale. One that may
  // have reached Uzum (an operation_id exists) is finished first: Uzum's
  // answer decides, so a sale on the OFD always gets its refund receipt. A
  // refund receipt belongs to money that went back.
  if (row.kind === "PERFORM" && order.state !== "paid" && !row.operation_id)
    return skip("skipped_refunded");
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
    // A sale found by its link after a lost answer never kept the id it was
    // sent with: the order's own, as in the sale receipt.
    salePaymentId = sale.payment_id ?? uzumPaymentId(order);
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
  /**
   * No receipt of Click's own yet: ours not due (check first, auto_wait) or
   * never ours (GPT_CLICK_AUTOFISCAL "true", auto_pending). Not an attempt.
   */
  waiting: number;
  skipped: number;
  /** Still queued after the run, and of them failed six attempts or more. */
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
  const tick: FiscalTick = { printed: 0, retried: 0, waiting: 0, skipped: 0, queued: 0, failing: 0 };
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
      await store.printed(row, outcome.link, now, outcome.source ?? null);
      tick.printed++;
    } else if ("wait" in outcome) {
      await store.wait(row, outcome.wait, outcome.until, now);
      tick.waiting++;
      // "true": Click's own receipt still missing a day after the payment.
      if (outcome.pages && due.alert && now - due.since > FISCAL_ALERT_AGE_MS)
        await recordServiceAlert(env, due.alert, now);
    } else {
      await store.retry(row, outcome.error, now);
      tick.retried++;
      if (
        due.alert &&
        (row.attempts >= FISCAL_ALERT_ATTEMPTS || now - due.since > FISCAL_ALERT_AGE_MS)
      )
        await recordServiceAlert(env, due.alert, now);
    }
  }
  Object.assign(tick, await store.queue());
  return tick;
}

// The maintenance tick's Uzum step (plan WP-15: U4, U8, U11). Every 15
// minutes, bounded, whether or not the visitor ever comes back:
//   settled    card payments Uzum registered whose session ended more than 35
//              minutes ago are settled from getOrderStatus: a paid order whose
//              callback was lost becomes paid (U4), a REGISTERED one closes;
//   receipts   paid orders Uzum auto-fiscalizes, of the last 48 hours, without
//              Uzum's sale receipt ask getReceipts (U11). Past 24 hours without
//              one, the owner hears of it (uzum_receipt_missing, once a day);
//   expired    app transactions never confirmed within 30 minutes are closed,
//              as Uzum fails them;
//   recovered  app transactions whose /confirm arrived more than 10 minutes ago
//              but never finished are finished: Uzum had debited the payer
//              (U8). The owner hears of each (uzum_confirm_recovered) and
//              checks the Uzum cabinet; money Uzum returned instead is
//              recorded through internal/gpt-uzum-refund.
// Off (null) while Uzum has no mode or no UZUM_API: then no Uzum DDL runs here.
import {
  BILLING_ORG,
  providerMode,
  type BillingEnv,
} from "./billing-config";
import { ensureUzumSchema } from "./billing-schema";
import { recordServiceAlert } from "./billing-maintenance-store";
import { uzumApi, uzumCheckoutConfig } from "./uzum-config";
import { UZUM_TIMEOUT_MS } from "./uzum-checkout";
import {
  UzumStore,
  UZUM_MERCHANT_CONFIRM_MS,
  UZUM_REASON_TIMEOUT,
  UZUM_SESSION_EXPIRED_MS,
} from "./uzum-store";

/** Rows per scan and tick. */
const UZUM_BATCH = 5;
/** Below this, the step starts no further call to Uzum. */
const MIN_CALL_MS = 500;
/** Uzum prints within minutes; the receipt scan starts after this. */
const RECEIPT_GRACE_MS = 5 * 60_000;
const RECEIPT_WINDOW_MS = 48 * 3_600_000;
const RECEIPT_ALERT_MS = 24 * 3_600_000;
/** A /confirm whose order is still prepared after this did not finish. */
const CONFIRM_STUCK_MS = 10 * 60_000;

export interface UzumTick {
  settled: number;
  receipts: number;
  expired: number;
  recovered: number;
}

/** "state": a webhook moved the row after the scan read it. Anything else fails the step. */
function settledMeanwhile(error: unknown): null {
  if (error instanceof Error && error.message === "state") return null;
  throw error;
}

export async function maintainUzum(
  env: BillingEnv,
  options: { now?: number; budgetMs?: number } = {},
): Promise<UzumTick | null> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !uzumApi(env) || !providerMode(env, "uzum")) return null;
  const now = options.now ?? Date.now();
  const deadline = Date.now() + (options.budgetMs ?? 20_000);
  const timeout = () => ({
    timeoutMs: Math.max(MIN_CALL_MS, Math.min(UZUM_TIMEOUT_MS, deadline - Date.now())),
  });
  const time = () => deadline - Date.now() >= MIN_CALL_MS;
  await ensureUzumSchema(db);
  const store = new UzumStore(db, BILLING_ORG);
  const tick: UzumTick = { settled: 0, receipts: 0, expired: 0, recovered: 0 };

  // D1 only: never confirmed within 30 minutes, or confirmed half-way. Each
  // write starts from the state the scan read; a webhook that settled the
  // transaction in between wins, and the row is left to it.
  for (const row of await store.unconfirmedApp(now - UZUM_MERCHANT_CONFIRM_MS, UZUM_BATCH)) {
    const closed = await store.billing
      .transition(row.id, "cancelled", "timeout", {
        reason: UZUM_REASON_TIMEOUT,
        now,
        from: ["prepared"],
      })
      .catch(settledMeanwhile);
    if (closed) tick.expired++;
  }
  for (const row of await store.stuckConfirms(now - CONFIRM_STUCK_MS, UZUM_BATCH)) {
    const finished = await store.billing
      .transition(row.id, "paid", "uzum_confirm_recovered", { now })
      .catch(settledMeanwhile);
    if (!finished) continue;
    await recordServiceAlert(env, "uzum_confirm_recovered", now);
    tick.recovered++;
  }

  for (const row of await store.staleCheckouts(now - UZUM_SESSION_EXPIRED_MS, UZUM_BATCH)) {
    const cfg = uzumCheckoutConfig(env, row.mode, { settleOnly: true });
    if (!cfg || !time()) continue;
    const settled = await store.reconcileCheckout(env, cfg, row, now, timeout());
    if (settled && settled.result !== "unchanged") tick.settled++;
  }
  for (const row of await store.unreceipted(now - RECEIPT_WINDOW_MS, now - RECEIPT_GRACE_MS, UZUM_BATCH)) {
    const cfg = uzumCheckoutConfig(env, row.mode, { settleOnly: true });
    if (!cfg || !time()) continue;
    await store.pullReceipts(cfg, row, timeout());
    if (await store.hasSaleReceipt(row.id)) tick.receipts++;
    else if (now - row.perform_time > RECEIPT_ALERT_MS)
      await recordServiceAlert(env, "uzum_receipt_missing", now);
  }
  return tick;
}

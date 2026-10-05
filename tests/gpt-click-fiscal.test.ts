// Click fiscal receipts (plan WP-14, D3): every live Click payment gets an OFD
// receipt with a link on ofd.soliq.uz, retried with backoff, idempotent, with
// an urgent alert when it keeps failing; and the owner's reversal through the
// Click Merchant API. Since 2026-10-05 Click may print the receipt itself
// (it set up OFD for the service on its side), so by default we check first:
// Click's link is looked for right after the payment, and our receipt line
// goes out only when there is still none GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES
// later, after one more check (GPT_CLICK_AUTOFISCAL "" / "true" / "false").
// Real SQLite (tests/helpers/sqlite-d1.ts) and a fake Click Merchant API
// (tests/helpers/click-merchant-fake.ts); nothing here reaches a real Click,
// Telegram or database.
// Run: node --import tsx --test tests/gpt-click-fiscal.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { billingFixture, liveSettings } from "./helpers/gpt-billing-fixture";
import { fakeClickMerchant, type ClickAccess } from "./helpers/click-merchant-fake";
import { BILLING_ORG, PRICE_TIYIN, type BillingEnv } from "../functions/lib/gpt-chat/billing-config";
import { BillingStore } from "../functions/lib/gpt-chat/billing-store";
import { clickSignature } from "../functions/lib/gpt-chat/payment-protocol";
import {
  CLICK_RECEIPT_NAME,
  clickAuthHeader,
  clickPaymentDate,
  clickReceiptItem,
} from "../functions/lib/gpt-chat/click-merchant";
import {
  clickFiscalPolicy,
  fiscalParams,
  ofdReceiptLink,
  receiptLink,
} from "../functions/lib/gpt-chat/fiscal-config";
import {
  FISCAL_BACKOFF_MS,
  FiscalStore,
  fiscalizeDue,
} from "../functions/lib/gpt-chat/fiscal-store";
import { isUrgentAlert } from "../functions/lib/gpt-chat/alert-policy";
import { onRequestPost as clickRoute } from "../functions/api/payments/click";
import { onRequestGet as account } from "../functions/api/gpt/account";
import { onRequestPost as reversal } from "../functions/api/internal/gpt-click-reversal";
import { onRequestPost as maintenance } from "../functions/api/internal/gpt-billing-maintenance";

const T0 = Date.UTC(2026, 9, 1, 9, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
/** A payment at T0 may get our receipt line from here on (the default 10 minutes). */
const DUE = T0 + 10 * MIN;
/** A run's counters with nothing done. */
const IDLE = { printed: 0, retried: 0, waiting: 0, skipped: 0, queued: 0, failing: 0 };
const hex = (bytes: number) => randomBytes(bytes).toString("hex");
const OTHER_ORG = "org-b";

interface ClickBlock {
  service_id: number;
  merchant_id?: number;
  secret_key: string;
  merchant_user_id?: number;
}
const access = (block: ClickBlock): ClickAccess => ({
  serviceId: String(block.service_id),
  merchantUserId: String(block.merchant_user_id),
  secretKey: block.secret_key,
});

/**
 * Click live (and a test block), every live setting, the fiscal codes
 * committed in wrangler.toml; `extra` sets GPT_CLICK_AUTOFISCAL and the delay
 * (unset: check first, 10 minutes, as committed).
 */
async function liveClick(t: { after: (fn: () => void) => void }, extra: Partial<BillingEnv> = {}) {
  const f = await billingFixture();
  const live: ClickBlock = { service_id: 41001, merchant_id: 32002, secret_key: hex(16), merchant_user_id: 50003 };
  const testBlock: ClickBlock = { service_id: 41002, secret_key: hex(16), merchant_user_id: 50004 };
  Object.assign(f.env, liveSettings(), {
    GPT_BILLING_MODE_CLICK: "live",
    GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ live, test: testBlock }),
  }, extra);
  const { fake, restore } = fakeClickMerchant([access(live), access(testBlock)]);
  t.after(restore);
  /** Prepare + Complete through the route, signed like Click signs them. */
  const pay = async (orderId: string, block = live) => {
    const tx = String(randomBytes(4).readUInt32BE(0));
    const order = (await f.store.order(orderId))!;
    const callRoute = async (action: "0" | "1") => {
      const p = {
        click_trans_id: tx,
        click_paydoc_id: String(randomBytes(4).readUInt32BE(0)),
        service_id: String(block.service_id),
        merchant_trans_id: orderId,
        amount: "20000.00",
        action,
        sign_time: "2026-10-01 14:00:00",
        error: "0",
        ...(action === "1" ? { merchant_prepare_id: String(order.seq) } : {}),
      };
      const body = new URLSearchParams({ ...p, sign_string: clickSignature(p, block.secret_key) });
      const response = await clickRoute(f.ctx(new Request("https://gptbot.uz/api/payments/click", { method: "POST", body })));
      return (await response.json()) as { error: number };
    };
    assert.equal((await callRoute("0")).error, 0);
    const complete = await callRoute("1");
    return { complete, again: () => callRoute("1") };
  };
  /** A live order paid at `at` straight through the store, and known to Click. */
  const paidAt = async (at: number, store: BillingStore = f.store) => {
    const order = await store.createOrder(f.user, "click", "live", randomUUID(), at);
    await store.transition(order.id, "prepared", "Prepare", {
      externalId: String(randomBytes(4).readUInt32BE(0)),
      providerTime: at,
      now: at,
    });
    await store.transition(order.id, "paid", "Complete", { now: at });
    const paymentId = fake.pay(order.id, at);
    return { id: order.id, paymentId };
  };
  const receipt = (orderId: string, org = BILLING_ORG) =>
    f.db.rows<Record<string, unknown>>(
      "SELECT provider,status_code,receipt_url,attempts,next_at,lease_until,payment_id,last_error,submitted_at,operation_id FROM gpt_fiscal_receipts WHERE org_id=? AND order_id=? AND kind='PERFORM'",
      org,
      orderId,
    ).map((row) => ({ ...row }))[0];
  const alerts = () =>
    f.db.rows<{ code: string }>("SELECT code FROM gpt_service_alerts ORDER BY created_at").map((r) => r.code);
  /** Click's calls as "METHOD /operation/service", in order. */
  const calls = (from = 0) =>
    fake.calls.slice(from).map((call) => `${call.method} ${call.path.split("/").slice(0, 3).join("/")}`);
  return { f, live, testBlock, fake, pay, paidAt, receipt, alerts, calls };
}

test("Auth is merchant_user_id:sha1(timestamp + secret_key):timestamp; the receipt line carries the pack's codes and VAT", async () => {
  const secretKey = hex(16);
  const now = Date.UTC(2026, 9, 1, 12, 0, 0, 999);
  const header = await clickAuthHeader({ merchantUserId: "50003", secretKey }, now);
  const timestamp = String(Math.floor(now / 1000));
  assert.equal(timestamp.length, 10);
  assert.equal(header, `50003:${createHash("sha1").update(timestamp + secretKey).digest("hex")}:${timestamp}`);
  assert.ok(!header.includes(secretKey));

  const params = fiscalParams({ GPT_FISCAL_IKPU: "10305008002000000", GPT_FISCAL_PACKAGE_CODE: "1514296", GPT_FISCAL_VAT_PERCENT: "12" })!;
  assert.deepEqual(clickReceiptItem(params, "310618348", PRICE_TIYIN), {
    Name: "AI paket 300 (xizmat, 1 oy)",
    SPIC: "10305008002000000",
    PackageCode: "1514296",
    Price: 2_000_000,
    Amount: 1,
    VAT: 214_286,
    VATPercent: 12,
    CommissionInfo: { TIN: "310618348" },
  });
  assert.ok(CLICK_RECEIPT_NAME.length <= 63);
  // An individual entrepreneur's PINFL goes in its own field.
  assert.deepEqual(clickReceiptItem(params, "12345678901234", PRICE_TIYIN).CommissionInfo, { PINFL: "12345678901234" });
  assert.equal(clickReceiptItem({ ...params, vatPercent: 0 }, "310618348", PRICE_TIYIN).VAT, 0);
  // status_by_mti wants Click's (Tashkent, UTC+5) calendar day.
  assert.equal(clickPaymentDate(Date.UTC(2026, 9, 1, 18, 59)), "2026-10-01");
  assert.equal(clickPaymentDate(Date.UTC(2026, 9, 1, 19, 0)), "2026-10-02");
});

test("GPT_CLICK_AUTOFISCAL: true only reads Click's link, false submits at once, anything else checks first; the delay is 0..1440 minutes, 10 by default", () => {
  assert.deepEqual(clickFiscalPolicy({}), { mode: "check", delayMs: 10 * MIN });
  for (const value of ["", "  ", "auto", "yes", "1", "check"])
    assert.equal(clickFiscalPolicy({ GPT_CLICK_AUTOFISCAL: value }).mode, "check", value);
  assert.equal(clickFiscalPolicy({ GPT_CLICK_AUTOFISCAL: "true" }).mode, "auto");
  assert.equal(clickFiscalPolicy({ GPT_CLICK_AUTOFISCAL: " TRUE " }).mode, "auto");
  assert.equal(clickFiscalPolicy({ GPT_CLICK_AUTOFISCAL: "false" }).mode, "submit");
  assert.equal(clickFiscalPolicy({ GPT_CLICK_AUTOFISCAL: "False" }).mode, "submit");
  const delay = (value: string) => clickFiscalPolicy({ GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES: value }).delayMs / MIN;
  assert.deepEqual(
    ["0", "1", "30", " 15 ", "1440", "5000", "", "-5", "1.5", "ten", "0x10", "1e3"].map(delay),
    [0, 1, 30, 15, 1440, 1440, 10, 10, 10, 10, 10, 10],
  );
  // Committed: check first after 10 minutes. runtime-config.test.ts keeps the
  // packed line and the nested table of wrangler.toml equal.
  const source = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const packed = JSON.parse(/GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(source)![1]) as Record<string, string>;
  assert.equal(packed.GPT_CLICK_AUTOFISCAL, "");
  assert.equal(packed.GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES, "10");
});

test("a live Complete queues one receipt in the paid batch and asks Click for its own first; ours goes out after the delay, once; the panel shows its link", async (t) => {
  const c = await liveClick(t);
  const order = await c.f.store.createOrder(c.f.user, "click", "live", randomUUID());
  const paymentId = c.fake.pay(order.id, Date.now());
  const { complete, again } = await c.pay(order.id);
  assert.equal(complete.error, 0);
  await Promise.all(c.f.background);

  // Right after the answer to Click: does Click hold a receipt of this
  // payment (it may print one itself)? Not yet: the row waits, no failure.
  const paidAt = (await c.f.store.order(order.id))!.perform_time;
  let row = c.receipt(order.id);
  assert.equal(row.provider, "click");
  assert.equal(row.status_code, -1);
  assert.equal(row.last_error, "auto_wait");
  assert.equal(row.attempts, 0, "a wait is no attempt");
  assert.equal(row.next_at, paidAt + 10 * MIN);
  assert.equal(row.lease_until, 0);
  assert.equal(row.payment_id, String(paymentId));
  assert.deepEqual(c.calls(), ["GET /status_by_mti/41001", "GET /ofd_data/41001"]);
  assert.equal(c.fake.calls[0].path, `/status_by_mti/41001/${order.id}/${clickPaymentDate(Date.now())}`);
  assert.equal(c.fake.calls[1].path, `/ofd_data/41001/${paymentId}`);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: paidAt + 10 * MIN - 1 }), { ...IDLE, queued: 1 });

  // Ten minutes after the payment: asked once more, then our receipt line, then its link.
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: paidAt + 10 * MIN }), { ...IDLE, printed: 1 });
  row = c.receipt(order.id);
  assert.equal(row.status_code, 0);
  assert.equal(row.receipt_url, c.fake.qrUrl(paymentId));
  assert.equal(row.last_error, "ours", "which path printed it");
  assert.equal(row.submitted_at, paidAt + 10 * MIN);
  assert.equal(row.attempts, 1);
  assert.equal(row.lease_until, 0);
  // Only https://api.click.uz, in Click's order.
  assert.deepEqual(c.calls(2), ["GET /ofd_data/41001", "POST /ofd_data/submit_items", "GET /ofd_data/41001"]);
  assert.deepEqual(c.fake.calls[3].body, {
    service_id: 41001,
    payment_id: paymentId,
    items: [
      {
        Name: CLICK_RECEIPT_NAME,
        SPIC: "10305008002000000",
        PackageCode: "1514296",
        Price: 2_000_000,
        Amount: 1,
        VAT: 214_286,
        VATPercent: 12,
        CommissionInfo: { TIN: "310618348" },
      },
    ],
    received_ecash: 0,
    received_cash: 0,
    received_card: 2_000_000,
  });

  // A repeated Complete is -4 and prints nothing twice: the primary key holds one row.
  assert.equal((await again()).error, -4);
  await Promise.all(c.f.background);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: paidAt + HOUR }), IDLE);
  assert.equal(c.f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts"), 1);
  assert.equal(c.fake.count("POST", "submit_items"), 1);
  // The same transition replayed against the ledger is a no-op and adds no row.
  assert.equal((await c.f.store.transition(order.id, "paid", "Complete")).state, "paid");
  assert.equal(c.f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts"), 1);

  const view = (await (await account(c.f.ctx(new Request("https://gptbot.uz/api/gpt/account", { headers: { cookie: c.f.cookie } })))).json()) as {
    receipts: Array<{ kind: string; receipt_url: string }>;
  };
  assert.deepEqual(view.receipts, [{ kind: "PERFORM", receipt_url: c.fake.qrUrl(paymentId) }]);
});

test("Click printed the receipt itself: its link is kept as 'auto' and our receipt line never goes out", async (t) => {
  const c = await liveClick(t);
  // There at the first check, right after the payment.
  const first = await c.paidAt(T0);
  c.fake.autoPrint(first.paymentId);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { ...IDLE, printed: 1 });
  const printed = c.receipt(first.id);
  assert.deepEqual(
    [printed.status_code, printed.receipt_url, printed.last_error, printed.attempts, printed.submitted_at, printed.operation_id],
    [0, c.fake.qrUrl(first.paymentId), "auto", 1, null, null],
  );
  assert.deepEqual(c.calls(), ["GET /status_by_mti/41001", "GET /ofd_data/41001"]);

  // Printed by Click during the delay: the check right before our submit finds it.
  const later = await c.paidAt(T0);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { ...IDLE, waiting: 1, queued: 1 });
  c.fake.autoPrint(later.paymentId);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: DUE }), { ...IDLE, printed: 1 });
  assert.deepEqual(
    [c.receipt(later.id).status_code, c.receipt(later.id).last_error, c.receipt(later.id).attempts],
    [0, "auto", 1],
  );
  assert.equal(c.fake.count("POST", "submit_items"), 0);
  assert.equal(c.f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts WHERE status_code=0 AND last_error='auto'"), 2);

  // A payment refunded while its receipt waits gets none from us.
  const refunded = await c.paidAt(T0);
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 })).waiting, 1);
  await c.f.store.transition(refunded.id, "cancelled", "owner_refund_record:cabinet", { reason: 5, now: T0 + MIN });
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: DUE }), { ...IDLE, skipped: 1 });
  assert.equal(c.receipt(refunded.id).last_error, "skipped_refunded");
  assert.equal(c.fake.count("POST", "submit_items"), 0);
});

test("check-first sends our receipt only on Click's own word that it has none: a failed read never leads to a submit", async (t) => {
  const c = await liveClick(t);
  const order = await c.paidAt(T0);
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 })).waiting, 1);
  // The check right before the submit fails: no submit, the usual retry schedule from here.
  c.fake.failures.ofd.push("network", "http");
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE })).retried, 1);
  assert.deepEqual([c.receipt(order.id).last_error, c.receipt(order.id).attempts], ["ofd:network", 1]);
  assert.equal(c.receipt(order.id).next_at, DUE + MIN);
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE + MIN })).retried, 1);
  assert.deepEqual([c.receipt(order.id).last_error, c.receipt(order.id).attempts], ["ofd:http_500", 2]);
  assert.equal(c.receipt(order.id).next_at, DUE + 6 * MIN);
  assert.equal(c.fake.count("POST", "submit_items"), 0);
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE + 6 * MIN })).printed, 1);
  assert.equal(c.receipt(order.id).last_error, "ours");
  assert.equal(c.fake.count("POST", "submit_items"), 1);

  // How Click says "no receipt" is not documented: an error code, a bare 404
  // and an answer without a link all let ours go out after the delay.
  for (const answer of ["click", "http404", "empty"] as const) {
    c.fake.noReceipt = answer;
    const other = await c.paidAt(T0);
    assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { ...IDLE, waiting: 1, queued: 1 }, answer);
    assert.deepEqual(await fiscalizeDue(c.f.env, { now: DUE }), { ...IDLE, printed: 1 }, answer);
    assert.equal(c.receipt(other.id).last_error, "ours", answer);
  }
  assert.equal(c.fake.count("POST", "submit_items"), 4);
});

test("GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES sets the wait; 0 checks and submits in one attempt", async (t) => {
  const c = await liveClick(t, { GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES: "30" });
  const order = await c.paidAt(T0);
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 })).waiting, 1);
  assert.equal(c.receipt(order.id).next_at, T0 + 30 * MIN);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 + 30 * MIN - 1 }), { ...IDLE, queued: 1 });
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 + 30 * MIN })).printed, 1);

  c.f.env.GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES = "0";
  const from = c.fake.calls.length;
  const now = await c.paidAt(T0);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { ...IDLE, printed: 1 });
  assert.deepEqual(c.calls(from), ["GET /status_by_mti/41001", "GET /ofd_data/41001", "POST /ofd_data/submit_items", "GET /ofd_data/41001"]);
  assert.deepEqual([c.receipt(now.id).last_error, c.receipt(now.id).attempts], ["ours", 1]);
});

test("GPT_CLICK_AUTOFISCAL=true never sends a receipt: it reads Click's link on the usual schedule and pages a day after the payment", async (t) => {
  const c = await liveClick(t, { GPT_CLICK_AUTOFISCAL: "true" });
  // Only the Merchant API is needed when Click prints: no receipt line.
  c.f.env.GPT_FISCAL_TIN = "";
  const order = await c.paidAt(T0);
  let now = T0;
  const waits: number[] = [];
  for (let attempt = 1; attempt <= 8; attempt++) {
    assert.deepEqual(await fiscalizeDue(c.f.env, { now }), { ...IDLE, retried: 1, queued: 1, failing: attempt >= 6 ? 1 : 0 });
    const row = c.receipt(order.id);
    assert.deepEqual([row.last_error, row.attempts, row.status_code], ["auto_pending", attempt, -1]);
    waits.push(Number(row.next_at) - now);
    now = Number(row.next_at);
  }
  assert.deepEqual(waits, [MIN, 5 * MIN, 15 * MIN, HOUR, 6 * HOUR, 6 * HOUR, 6 * HOUR, 6 * HOUR]);
  // 8 attempts in 19.35 hours: Click may still print it, no page yet.
  assert.deepEqual(c.alerts(), []);
  assert.ok(now - T0 > 24 * HOUR);
  assert.equal((await fiscalizeDue(c.f.env, { now })).retried, 1);
  assert.deepEqual(c.alerts(), ["click_fiscal_failed"]);
  // Click prints it: the link is kept, ours never went out.
  c.fake.autoPrint(order.paymentId);
  now = Number(c.receipt(order.id).next_at);
  assert.equal((await fiscalizeDue(c.f.env, { now })).printed, 1);
  assert.deepEqual([c.receipt(order.id).last_error, c.receipt(order.id).submitted_at], ["auto", null]);
  assert.equal(c.fake.count("POST", "submit_items"), 0);
  assert.equal(c.fake.count("GET", "/ofd_data/"), 10);

  // A read that fails is no "not yet": it pages from the sixth attempt as any failure.
  c.f.db.exec("DELETE FROM gpt_service_alerts");
  const broken = await c.paidAt(T0);
  c.fake.failures.ofd.push(...Array<"network">(6).fill("network"));
  now = T0;
  for (let attempt = 1; attempt <= 6; attempt++) {
    assert.equal((await fiscalizeDue(c.f.env, { now })).retried, 1);
    now = Number(c.receipt(broken.id).next_at);
  }
  assert.equal(c.receipt(broken.id).last_error, "ofd:network");
  assert.deepEqual(c.alerts(), ["click_fiscal_failed"]);
});

test("GPT_CLICK_AUTOFISCAL=false restores the immediate submit; a receipt Click printed already is found by the retry and marked unknown", async (t) => {
  const c = await liveClick(t, { GPT_CLICK_AUTOFISCAL: "false" });
  const order = await c.paidAt(T0);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { ...IDLE, printed: 1 });
  assert.deepEqual(c.calls(), ["GET /status_by_mti/41001", "POST /ofd_data/submit_items", "GET /ofd_data/41001"]);
  assert.deepEqual([c.receipt(order.id).last_error, c.receipt(order.id).attempts], ["ours", 1]);

  // Click printed the next one itself: it refuses ours, the retry asks first and finds Click's.
  const auto = await c.paidAt(T0);
  c.fake.autoPrint(auto.paymentId);
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 })).retried, 1);
  assert.equal(c.receipt(auto.id).last_error, "submit:click_-31");
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 + MIN })).printed, 1);
  // Ours went out and was refused: who printed it cannot be told from here.
  assert.deepEqual([c.receipt(auto.id).status_code, c.receipt(auto.id).last_error], [0, "unknown"]);
  assert.equal(c.fake.count("POST", "submit_items"), 2);
});

test("the first live payment's read-only check in CLICK-FISCAL-RU.md runs on the schema and tells who printed the receipt", async (t) => {
  const doc = readFileSync(new URL("../docs/paid-chat/CLICK-FISCAL-RU.md", import.meta.url), "utf8");
  const section = doc.slice(doc.indexOf("## Проверка на первой живой оплате"));
  const sql = /```sql\n([\s\S]+?)```/u.exec(section)![1].trim();
  // One SELECT, nothing that writes; no order or payment number in its answer.
  assert.match(sql, /^SELECT /u);
  assert.equal(sql.split(";").filter((part) => part.trim()).length, 1);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|PRAGMA|ATTACH|VACUUM)\b/iu);
  const c = await liveClick(t);
  const read = () => {
    const rows = c.f.db.rows<Record<string, unknown>>(sql).map((row) => ({ ...row }));
    assert.equal(rows.length, 1);
    assert.ok(!Object.keys(rows[0]).some((key) => /^(?:id|order_id|payment_id|external_id|receipt_url)$/u.test(key)));
    return rows[0];
  };
  const first = await c.paidAt(Date.now());
  assert.equal((await fiscalizeDue(c.f.env)).waiting, 1);
  let row = read();
  assert.deepEqual(
    [row.status_code, row.last_error, row.our_submit_accepted, row.our_submit_sent, row.has_link, row.state, row.minutes_since_payment],
    [-1, "auto_wait", 0, 0, 0, "paid", 0],
  );
  assert.ok([9, 10].includes(Number(row.next_try_in_minutes)), String(row.next_try_in_minutes));
  // Click printed it itself.
  c.fake.autoPrint(first.paymentId);
  assert.equal((await fiscalizeDue(c.f.env, { now: Date.now() + 10 * MIN })).printed, 1);
  row = read();
  assert.deepEqual(
    [row.status_code, row.last_error, row.our_submit_accepted, row.our_submit_sent, row.has_link, row.next_try_in_minutes],
    [0, "auto", 0, 0, 1, null],
  );
  // Our payment_id came from status_by_mti, not from the Shop API's click_trans_id.
  assert.equal(row.payment_id_is_click_trans_id, 0);
  // The next payment: nothing at Click after the delay, ours accepted.
  await c.paidAt(Date.now() + 1000);
  assert.equal((await fiscalizeDue(c.f.env, { now: Date.now() + 20 * MIN })).printed, 1);
  row = read();
  assert.deepEqual(
    [row.status_code, row.last_error, row.our_submit_accepted, row.our_submit_sent, row.has_link],
    [0, "ours", 1, 1, 1],
  );
});

test("a test payment is skipped_test and never reaches Click", async (t) => {
  const c = await liveClick(t);
  c.f.env.GPT_BILLING_MODE_CLICK = "test";
  const order = await c.f.store.createOrder(c.f.user, "click", "test", randomUUID());
  c.fake.pay(order.id, Date.now(), c.testBlock.service_id.toString());
  assert.equal((await c.pay(order.id, c.testBlock)).complete.error, 0);
  await Promise.all(c.f.background);
  assert.deepEqual(
    { status: c.receipt(order.id).status_code, error: c.receipt(order.id).last_error },
    { status: -2, error: "skipped_test" },
  );
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: Date.now() + HOUR }), IDLE);
  assert.equal(c.fake.calls.length, 0);
});

test("failures wait 1, 5, 15, 60 minutes, then 6 hours; from the sixth attempt or a day after payment the owner is paged", async (t) => {
  const c = await liveClick(t);
  t.mock.method(console, "warn", () => undefined);
  const order = await c.paidAt(T0);
  // The wait for Click's own receipt is no failure: the schedule starts after it.
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 })).waiting, 1);
  c.fake.failures.submit.push(-5, -5, -5, -5, -5, -5, -5);
  let now = DUE;
  const waits: number[] = [];
  for (let attempt = 1; attempt <= 7; attempt++) {
    // Not due a moment before its time: nothing is claimed.
    assert.deepEqual(await fiscalizeDue(c.f.env, { now: now - 1 }), { ...IDLE, queued: 1, failing: attempt > 6 ? 1 : 0 });
    const tick = await fiscalizeDue(c.f.env, { now });
    assert.equal(tick.retried, 1);
    const row = c.receipt(order.id);
    assert.equal(row.attempts, attempt);
    assert.equal(row.last_error, "submit:click_-5");
    assert.equal(row.status_code, -1);
    assert.equal(row.lease_until, 0);
    waits.push(Number(row.next_at) - now);
    // No page before the sixth failed attempt; then one per failure (hours apart).
    assert.equal(c.alerts().filter((code) => code === "click_fiscal_failed").length, Math.max(0, attempt - 5), `attempt ${attempt}`);
    now = Number(row.next_at);
  }
  assert.deepEqual(waits, [MIN, 5 * MIN, 15 * MIN, HOUR, 6 * HOUR, 6 * HOUR, 6 * HOUR]);
  assert.deepEqual(FISCAL_BACKOFF_MS, [MIN, 5 * MIN, 15 * MIN, HOUR, 6 * HOUR]);
  assert.equal(isUrgentAlert("click_fiscal_failed"), true);
  // Every attempt asked ofd_data first (and the wait before them): the receipt
  // might have existed already.
  assert.equal(c.fake.count("GET", "/ofd_data/"), 8);
  assert.equal(c.fake.count("POST", "submit_items"), 7);
  // The eighth attempt goes through.
  assert.equal((await fiscalizeDue(c.f.env, { now })).printed, 1);
  assert.equal(c.receipt(order.id).status_code, 0);

  // A payment more than a day old pages on its first failure.
  const late = await c.paidAt(T0 - 25 * HOUR);
  c.f.db.exec("DELETE FROM gpt_service_alerts");
  c.fake.failures.mti.push("http");
  const tick = await fiscalizeDue(c.f.env, { now: T0 });
  assert.equal(tick.retried, 1);
  assert.equal(c.receipt(late.id).last_error, "payment_id:http_500");
  assert.deepEqual(c.alerts(), ["click_fiscal_failed"]);
});

test("a retry asks ofd_data first: a lost answer is never sent twice, an accepted receipt waits for its link", async (t) => {
  const c = await liveClick(t);
  // The submit reaches Click, its answer is lost.
  const lost = await c.paidAt(T0);
  c.fake.loseSubmitAnswers = 1;
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE })).retried, 1);
  assert.equal(c.receipt(lost.id).last_error, "submit:network");
  assert.equal(c.receipt(lost.id).submitted_at, null);
  // Written before the submit went out: from now on a link found is not provably Click's own.
  assert.equal(c.receipt(lost.id).operation_id, "click:submit_items");
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE + MIN })).printed, 1);
  assert.equal(c.receipt(lost.id).receipt_url, c.fake.qrUrl(lost.paymentId));
  assert.equal(c.receipt(lost.id).last_error, "unknown");
  assert.equal(c.fake.count("POST", "submit_items"), 1);

  // Accepted, but the OFD link comes later: no second submit, only reads.
  const slow = await c.paidAt(T0);
  c.fake.qrDelay = 2;
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE })).retried, 1);
  assert.equal(c.receipt(slow.id).last_error, "qr_pending");
  assert.equal(c.receipt(slow.id).submitted_at, DUE);
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE + MIN })).retried, 1);
  assert.equal(c.receipt(slow.id).last_error, "qr_pending");
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE + 6 * MIN })).printed, 1);
  assert.equal(c.receipt(slow.id).last_error, "ours");
  assert.equal(c.fake.count("POST", "submit_items"), 2, "one submit per receipt");
  assert.equal(c.f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts WHERE status_code=0"), 2);
});

test("two workers lease a due receipt once: one submit, one print", async (t) => {
  const c = await liveClick(t);
  const order = await c.paidAt(T0);
  // Right after the payment (Complete and a maintenance tick at once): one check, one wait.
  const checks = await Promise.all([fiscalizeDue(c.f.env, { now: T0 }), fiscalizeDue(c.f.env, { now: T0 })]);
  assert.equal(checks[0].waiting + checks[1].waiting, 1);
  assert.equal(c.fake.count("GET", "/ofd_data/"), 1);
  const ticks = await Promise.all([fiscalizeDue(c.f.env, { now: DUE }), fiscalizeDue(c.f.env, { now: DUE })]);
  assert.equal(ticks[0].printed + ticks[1].printed, 1);
  assert.equal(c.fake.count("POST", "submit_items"), 1);
  assert.equal(c.receipt(order.id).attempts, 1);
  // A leased row is not claimed again while its lease runs, even when due.
  const held = await c.paidAt(T0);
  const lease = await new FiscalStore(c.f.binding, BILLING_ORG).claim(DUE);
  assert.equal(lease?.order_id, held.id);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: DUE + 1000 }), { ...IDLE, queued: 1 });
  // A dead worker's lease runs out and the row comes back.
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE + 61_000 })).printed, 1);
  assert.equal(c.receipt(held.id).attempts, 2);
});

test("at most five receipts a run; the rest stay queued", async (t) => {
  const c = await liveClick(t);
  for (let i = 0; i < 7; i++) await c.paidAt(T0);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { ...IDLE, waiting: 5, queued: 7 });
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { ...IDLE, waiting: 2, queued: 7 });
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: DUE }), { ...IDLE, printed: 5, queued: 2 });
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: DUE }), { ...IDLE, printed: 2 });
});

test("only a https link on ofd.soliq.uz counts as printed; the panel shows no other host", async (t) => {
  const c = await liveClick(t);
  const order = await c.paidAt(T0);
  c.fake.qrUrl = (id) => `https://ofd.soliq.uz.example.com/epi?r=${id}`;
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE })).retried, 1);
  assert.equal(c.receipt(order.id).last_error, "qr_host");
  assert.equal(c.receipt(order.id).status_code, -1);
  // Click already holds a receipt: the retry reads it again and does not resubmit.
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE + MIN })).retried, 1);
  assert.equal(c.fake.count("POST", "submit_items"), 1);
  // Nor when Click printed it itself with such a link.
  const auto = await c.paidAt(T0);
  c.fake.autoPrint(auto.paymentId);
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 })).retried, 1);
  assert.equal(c.receipt(auto.id).last_error, "qr_host");
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE })).retried, 1);
  assert.equal(c.fake.count("POST", "submit_items"), 1);

  for (const link of [
    "http://ofd.soliq.uz/epi?r=1",
    "https://ofd.soliq.uz:8443/epi?r=1",
    "https://user:pw@ofd.soliq.uz/epi?r=1",
    "https://evil.example/ofd.soliq.uz",
    "https://soliq.uz/epi",
    "javascript:alert(1)",
  ])
    assert.equal(ofdReceiptLink(link), null, link);
  assert.equal(ofdReceiptLink("https://ofd.soliq.uz/epi?r=1"), "https://ofd.soliq.uz/epi?r=1");
  assert.equal(receiptLink("https://receipt.uzumbank.uz/r/1"), "https://receipt.uzumbank.uz/r/1");
  assert.equal(receiptLink("https://gptbot.uz/receipt"), null);
  assert.equal(receiptLink("https://uzumbank.uz.example.com/r"), null);

  // Rows printed elsewhere (Payme, Uzum): only allowed hosts reach the panel.
  const printed = async (url: string) => {
    const other = await c.paidAt(T0);
    c.f.db.prepare("UPDATE gpt_fiscal_receipts SET status_code=0,receipt_url=? WHERE order_id=?").bind(url, other.id).runSync();
  };
  await printed("https://evil.example/receipt");
  await printed("https://ofd.soliq.uz/epi?t=ok");
  const view = (await (await account(c.f.ctx(new Request("https://gptbot.uz/api/gpt/account", { headers: { cookie: c.f.cookie } })))).json()) as {
    receipts: Array<{ receipt_url: string }>;
  };
  assert.deepEqual(view.receipts.map((r) => r.receipt_url), ["https://ofd.soliq.uz/epi?t=ok"]);
});

test("missing Merchant API access or fiscal settings is a failure that retries, never a silent skip", async (t) => {
  const c = await liveClick(t);
  const order = await c.paidAt(T0);
  c.f.env.GPT_CLICK_CREDENTIALS_JSON = JSON.stringify({ live: { service_id: 41001, merchant_id: 32002, secret_key: c.live.secret_key } });
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 })).retried, 1);
  assert.equal(c.receipt(order.id).last_error, "config_missing");
  c.f.env.GPT_CLICK_CREDENTIALS_JSON = JSON.stringify({ live: c.live });
  c.f.env.GPT_FISCAL_TIN = "";
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 + MIN })).retried, 1);
  assert.equal(c.receipt(order.id).last_error, "config_missing");
  assert.equal(c.fake.calls.length, 0);
  c.f.env.GPT_FISCAL_TIN = "310618348";
  // Switching Click's sales off does not strand a paid receipt.
  c.f.env.GPT_BILLING_MODE_CLICK = "off";
  assert.equal((await fiscalizeDue(c.f.env, { now: DUE })).printed, 1);
});

test("a receipt of an order refunded before it was printed is skipped; another org's queue is not touched", async (t) => {
  const c = await liveClick(t);
  const order = await c.paidAt(T0);
  await c.f.store.transition(order.id, "cancelled", "owner_refund_record:cabinet", { reason: 5, now: T0 });
  // Org B has a due live receipt of its own.
  const otherStore = new BillingStore(c.f.binding, OTHER_ORG);
  const foreign = await c.paidAt(T0, otherStore);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { ...IDLE, skipped: 1 });
  assert.deepEqual(
    { status: c.receipt(order.id).status_code, error: c.receipt(order.id).last_error },
    { status: -2, error: "skipped_refunded" },
  );
  assert.equal(c.fake.calls.length, 0);
  assert.equal(c.receipt(foreign.id, OTHER_ORG).attempts, 0);
  assert.equal((await new FiscalStore(c.f.binding, BILLING_ORG).claim(T0)), null);
  assert.equal((await new FiscalStore(c.f.binding, OTHER_ORG).claim(T0))?.order_id, foreign.id);
});

test("the maintenance tick retries due receipts before it delivers alerts: a failing one pages in the same tick", async (t) => {
  const c = await liveClick(t);
  t.mock.method(console, "warn", () => undefined);
  // Claimed first (oldest): its lookup fails a day after the payment.
  const late = await c.paidAt(Date.now() - 25 * HOUR);
  c.fake.failures.mti.push("http");
  // Paid 11 minutes ago: Click printed nothing itself, ours goes out now.
  const fresh = await c.paidAt(Date.now() - 11 * MIN);
  const response = await maintenance(
    c.f.ctx(
      new Request("https://gptbot.uz/api/internal/gpt-billing-maintenance", {
        method: "POST",
        headers: { Authorization: `Bearer ${c.f.env.GPT_BILLING_MAINTENANCE_SECRET}` },
      }),
    ) as never,
  );
  const body = (await response.json()) as {
    failed: string[];
    fiscal: Record<string, number>;
    alerts: { status: string; codes: string[] };
  };
  assert.ok(!body.failed.includes("fiscal"), JSON.stringify(body.failed));
  assert.deepEqual(body.fiscal, { ...IDLE, printed: 1, retried: 1, queued: 1 });
  assert.equal(c.receipt(fresh.id).status_code, 0);
  assert.equal(c.receipt(late.id).last_error, "payment_id:http_500");
  assert.deepEqual(body.alerts, { status: "sent", codes: ["click_fiscal_failed"] });
  // One urgent message (the paid-order notifications of the outbox go apart).
  const urgent = c.fake.telegram.filter((text) => text.includes("срочно"));
  assert.equal(urgent.length, 1);
  assert.match(urgent[0], /click_fiscal_failed — Click: чек ОФД не пробит/);
});

test("a slow Click still fits the tick: receipts run beside providers and watchdog, not in a slice of their own", async (t) => {
  const c = await liveClick(t);
  // A first print after the delay is four calls (status_by_mti, the check
  // in ofd_data, submit_items, ofd_data); across the ocean each easily takes
  // this long.
  c.fake.latencyMs = 600;
  const order = await c.paidAt(Date.now() - 11 * MIN);
  const response = await maintenance(
    c.f.ctx(
      new Request("https://gptbot.uz/api/internal/gpt-billing-maintenance", {
        method: "POST",
        headers: { Authorization: `Bearer ${c.f.env.GPT_BILLING_MAINTENANCE_SECRET}` },
      }),
    ) as never,
  );
  const body = (await response.json()) as { failed: string[]; fiscal: Record<string, number> | null };
  assert.equal(response.status, 200, JSON.stringify(body.failed));
  assert.deepEqual(body.fiscal, { ...IDLE, printed: 1 });
  assert.equal(c.receipt(order.id).status_code, 0);
  assert.equal(c.fake.count("POST", "submit_items"), 1);
});

// ── Reversal ──────────────────────────────────────────────────────────────────

test("reversal: Bearer only, confirmed body, current version; a paid order is reversed once and recorded as refunded", async (t) => {
  const c = await liveClick(t);
  const call = (body: unknown, auth = `Bearer ${c.f.env.GPT_BILLING_MAINTENANCE_SECRET}`) =>
    reversal(
      c.f.ctx(
        new Request("https://gptbot.uz/api/internal/gpt-click-reversal", {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
    );
  const order = await c.paidAt(Date.now());
  const version = (await c.f.store.order(order.id))!.version;
  const valid = { orderId: order.id, version, confirmReversal: true };
  assert.equal((await call(valid, "Bearer wrong")).status, 403);
  assert.equal((await call(valid, "")).status, 403);
  for (const body of [{ ...valid, confirmReversal: false }, { ...valid, version: "1" }, { ...valid, orderId: "uzm_x" }, {}])
    assert.equal((await call(body)).status, 400, JSON.stringify(body));
  const stale = await call({ ...valid, version: version - 1 });
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { code: string }).code, "version_changed");
  // An open (unpaid) order is not reversible.
  const open = await c.f.store.createOrder(c.f.user, "click", "live", randomUUID());
  assert.equal((await call({ orderId: open.id, version: open.version, confirmReversal: true })).status, 409);
  // Another org's order does not exist for this endpoint.
  const otherStore = new BillingStore(c.f.binding, OTHER_ORG);
  const foreign = await c.paidAt(Date.now(), otherStore);
  assert.equal((await call({ orderId: foreign.id, version: 2, confirmReversal: true })).status, 409);
  assert.equal(c.fake.calls.length, 0);

  // Click refuses: nothing changes in the ledger.
  c.fake.failures.reversal.push(-5017);
  const refused = await call(valid);
  assert.equal(refused.status, 502);
  assert.deepEqual(await refused.json(), {
    ok: false,
    code: "click_reversal_failed",
    message: "Click did not reverse the payment",
    click: "click_-5017",
  });
  assert.equal((await c.f.store.order(order.id))!.state, "paid");

  const done = await call(valid);
  assert.equal(done.status, 200);
  assert.deepEqual(await done.json(), {
    ok: true,
    reversed: true,
    state: "refunded",
    paymentId: String(order.paymentId),
    receiptPrinted: false,
  });
  await Promise.all(c.f.background);
  assert.ok(c.fake.reversed.has(order.paymentId));
  assert.equal(c.fake.calls.at(-1)?.path, `/reversal/41001/${order.paymentId}`);
  assert.equal(c.fake.calls.at(-1)?.method, "DELETE");
  // The same transition as a recorded refund: period revoked, outbox, owner journal.
  const row = (await c.f.store.order(order.id))!;
  assert.equal(row.state, "refunded");
  assert.equal(row.reason, 5);
  assert.ok(c.f.db.value("SELECT revoked_at FROM gpt_access_periods WHERE order_id=?", order.id));
  assert.equal(c.f.db.value("SELECT COUNT(*) FROM gpt_billing_outbox WHERE order_id=? AND event='refunded'", order.id), 1);
  assert.equal(
    c.f.db.value("SELECT actor FROM gpt_payment_journal WHERE order_id=? AND to_state='refunded'", order.id),
    "owner",
  );
  // The payment id Click gave is kept for the receipt queue.
  assert.equal(c.receipt(order.id).payment_id, String(order.paymentId));
  // A repeat is a no-op: no second call to Click.
  const calls = c.fake.calls.length;
  const repeat = await call(valid);
  assert.deepEqual(await repeat.json(), { ok: true, reversed: false, state: "refunded" });
  assert.equal(c.fake.calls.length, calls);
  // Its queued receipt is never printed now.
  assert.equal((await fiscalizeDue(c.f.env)).skipped, 1);
  assert.equal(c.receipt(order.id).last_error, "skipped_refunded");
  assert.equal(c.fake.count("POST", "submit_items"), 0);
});

test("reversal of a printed payment reuses its payment id and says the sale receipt exists", async (t) => {
  const c = await liveClick(t);
  const order = await c.paidAt(Date.now());
  assert.equal((await fiscalizeDue(c.f.env, { now: Date.now() + 10 * MIN })).printed, 1);
  const lookups = c.fake.count("GET", "status_by_mti");
  const response = await reversal(
    c.f.ctx(
      new Request("https://gptbot.uz/api/internal/gpt-click-reversal", {
        method: "POST",
        headers: { Authorization: `Bearer ${c.f.env.GPT_BILLING_MAINTENANCE_SECRET}` },
        body: JSON.stringify({ orderId: order.id, version: (await c.f.store.order(order.id))!.version, confirmReversal: true }),
      }),
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { receiptPrinted: boolean }).receiptPrinted, true);
  assert.equal(c.fake.count("GET", "status_by_mti"), lookups);
  // Without Merchant API access the endpoint says so and calls nobody.
  const second = await c.paidAt(Date.now());
  c.f.env.GPT_CLICK_CREDENTIALS_JSON = JSON.stringify({ live: { service_id: 41001, merchant_id: 32002, secret_key: c.live.secret_key } });
  const calls = c.fake.calls.length;
  const unconfigured = await reversal(
    c.f.ctx(
      new Request("https://gptbot.uz/api/internal/gpt-click-reversal", {
        method: "POST",
        headers: { Authorization: `Bearer ${c.f.env.GPT_BILLING_MAINTENANCE_SECRET}` },
        body: JSON.stringify({ orderId: second.id, version: (await c.f.store.order(second.id))!.version, confirmReversal: true }),
      }),
    ),
  );
  assert.equal(unconfigured.status, 409);
  assert.equal(((await unconfigured.json()) as { code: string }).code, "click_merchant_not_configured");
  assert.equal(c.fake.calls.length, calls);
});

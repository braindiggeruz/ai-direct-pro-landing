// Click fiscal receipts (plan WP-14, D3): every live Click payment gets an OFD
// receipt with a link on ofd.soliq.uz, retried with backoff, idempotent, with
// an urgent alert when it keeps failing; and the owner's reversal through the
// Click Merchant API. Real SQLite (tests/helpers/sqlite-d1.ts) and a fake
// Click Merchant API (tests/helpers/click-merchant-fake.ts); nothing here
// reaches a real Click, Telegram or database.
// Run: node --import tsx --test tests/gpt-click-fiscal.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { billingFixture, liveSettings } from "./helpers/gpt-billing-fixture";
import { fakeClickMerchant, type ClickAccess } from "./helpers/click-merchant-fake";
import { BILLING_ORG, PRICE_TIYIN } from "../functions/lib/gpt-chat/billing-config";
import { BillingStore } from "../functions/lib/gpt-chat/billing-store";
import { clickSignature } from "../functions/lib/gpt-chat/payment-protocol";
import {
  CLICK_RECEIPT_NAME,
  clickAuthHeader,
  clickPaymentDate,
  clickReceiptItem,
} from "../functions/lib/gpt-chat/click-merchant";
import { fiscalParams, ofdReceiptLink, receiptLink } from "../functions/lib/gpt-chat/fiscal-config";
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

/** Click live (and a test block), every live setting, the fiscal codes committed in wrangler.toml. */
async function liveClick(t: { after: (fn: () => void) => void }) {
  const f = await billingFixture();
  const live: ClickBlock = { service_id: 41001, merchant_id: 32002, secret_key: hex(16), merchant_user_id: 50003 };
  const testBlock: ClickBlock = { service_id: 41002, secret_key: hex(16), merchant_user_id: 50004 };
  Object.assign(f.env, liveSettings(), {
    GPT_BILLING_MODE_CLICK: "live",
    GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ live, test: testBlock }),
  });
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
      "SELECT provider,status_code,receipt_url,attempts,next_at,lease_until,payment_id,last_error,submitted_at FROM gpt_fiscal_receipts WHERE org_id=? AND order_id=? AND kind='PERFORM'",
      org,
      orderId,
    ).map((row) => ({ ...row }))[0];
  const alerts = () =>
    f.db.rows<{ code: string }>("SELECT code FROM gpt_service_alerts ORDER BY created_at").map((r) => r.code);
  return { f, live, testBlock, fake, pay, paidAt, receipt, alerts };
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

test("a live Complete queues one receipt in the paid batch and prints it right after; the panel shows its link", async (t) => {
  const c = await liveClick(t);
  const order = await c.f.store.createOrder(c.f.user, "click", "live", randomUUID());
  const paymentId = c.fake.pay(order.id, Date.now());
  const { complete, again } = await c.pay(order.id);
  assert.equal(complete.error, 0);
  await Promise.all(c.f.background);

  const row = c.receipt(order.id);
  assert.equal(row.provider, "click");
  assert.equal(row.status_code, 0);
  assert.equal(row.receipt_url, c.fake.qrUrl(paymentId));
  assert.equal(row.payment_id, String(paymentId));
  assert.equal(row.attempts, 1);
  assert.equal(row.lease_until, 0);
  assert.equal(row.last_error, null);
  // Only https://api.click.uz, in Click's order: who paid, the receipt, its link.
  assert.deepEqual(
    c.fake.calls.map((call) => `${call.method} ${call.path.split("/").slice(0, 3).join("/")}`),
    ["GET /status_by_mti/41001", "POST /ofd_data/submit_items", "GET /ofd_data/41001"],
  );
  assert.equal(c.fake.calls[0].path, `/status_by_mti/41001/${order.id}/${clickPaymentDate(Date.now())}`);
  assert.deepEqual(c.fake.calls[1].body, {
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
  assert.deepEqual(await fiscalizeDue(c.f.env), { printed: 0, retried: 0, skipped: 0, queued: 0, failing: 0 });
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
  assert.deepEqual(await fiscalizeDue(c.f.env), { printed: 0, retried: 0, skipped: 0, queued: 0, failing: 0 });
  assert.equal(c.fake.calls.length, 0);
});

test("failures wait 1, 5, 15, 60 minutes, then 6 hours; from the sixth attempt or a day after payment the owner is paged", async (t) => {
  const c = await liveClick(t);
  t.mock.method(console, "warn", () => undefined);
  const order = await c.paidAt(T0);
  c.fake.failures.submit.push(-5, -5, -5, -5, -5, -5, -5);
  let now = T0;
  const waits: number[] = [];
  for (let attempt = 1; attempt <= 7; attempt++) {
    // Not due a moment before its time: nothing is claimed.
    if (attempt > 1)
      assert.deepEqual(await fiscalizeDue(c.f.env, { now: now - 1 }), { printed: 0, retried: 0, skipped: 0, queued: 1, failing: attempt > 6 ? 1 : 0 });
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
  // Every retry asked ofd_data first: the receipt might have existed already.
  assert.equal(c.fake.count("GET", "/ofd_data/"), 6);
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
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 })).retried, 1);
  assert.equal(c.receipt(lost.id).last_error, "submit:network");
  assert.equal(c.receipt(lost.id).submitted_at, null);
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 + MIN })).printed, 1);
  assert.equal(c.receipt(lost.id).receipt_url, c.fake.qrUrl(lost.paymentId));
  assert.equal(c.fake.count("POST", "submit_items"), 1);

  // Accepted, but the OFD link comes later: no second submit, only reads.
  const slow = await c.paidAt(T0);
  c.fake.qrDelay = 2;
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 })).retried, 1);
  assert.equal(c.receipt(slow.id).last_error, "qr_pending");
  assert.equal(c.receipt(slow.id).submitted_at, T0);
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 + MIN })).retried, 1);
  assert.equal(c.receipt(slow.id).last_error, "qr_pending");
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 + 6 * MIN })).printed, 1);
  assert.equal(c.fake.count("POST", "submit_items"), 2, "one submit per receipt");
  assert.equal(c.f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts WHERE status_code=0"), 2);
});

test("two workers lease a due receipt once: one submit, one print", async (t) => {
  const c = await liveClick(t);
  const order = await c.paidAt(T0);
  const ticks = await Promise.all([fiscalizeDue(c.f.env, { now: T0 }), fiscalizeDue(c.f.env, { now: T0 })]);
  assert.equal(ticks[0].printed + ticks[1].printed, 1);
  assert.equal(c.fake.count("POST", "submit_items"), 1);
  assert.equal(c.receipt(order.id).attempts, 1);
  // A leased row is not claimed again while its lease runs, even when due.
  const held = await c.paidAt(T0);
  const lease = await new FiscalStore(c.f.binding, BILLING_ORG).claim(T0);
  assert.equal(lease?.order_id, held.id);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 + 1000 }), { printed: 0, retried: 0, skipped: 0, queued: 1, failing: 0 });
  // A dead worker's lease runs out and the row comes back.
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 + 61_000 })).printed, 1);
  assert.equal(c.receipt(held.id).attempts, 2);
});

test("at most five receipts a run; the rest stay queued", async (t) => {
  const c = await liveClick(t);
  for (let i = 0; i < 7; i++) await c.paidAt(T0);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { printed: 5, retried: 0, skipped: 0, queued: 2, failing: 0 });
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { printed: 2, retried: 0, skipped: 0, queued: 0, failing: 0 });
});

test("only a https link on ofd.soliq.uz counts as printed; the panel shows no other host", async (t) => {
  const c = await liveClick(t);
  const order = await c.paidAt(T0);
  c.fake.qrUrl = (id) => `https://ofd.soliq.uz.example.com/epi?r=${id}`;
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 })).retried, 1);
  assert.equal(c.receipt(order.id).last_error, "qr_host");
  assert.equal(c.receipt(order.id).status_code, -1);
  // Click already holds a receipt: the retry reads it again and does not resubmit.
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 + MIN })).retried, 1);
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
  assert.equal((await fiscalizeDue(c.f.env, { now: T0 + 6 * MIN })).printed, 1);
});

test("a receipt of an order refunded before it was printed is skipped; another org's queue is not touched", async (t) => {
  const c = await liveClick(t);
  const order = await c.paidAt(T0);
  await c.f.store.transition(order.id, "cancelled", "owner_refund_record:cabinet", { reason: 5, now: T0 });
  // Org B has a due live receipt of its own.
  const otherStore = new BillingStore(c.f.binding, OTHER_ORG);
  const foreign = await c.paidAt(T0, otherStore);
  assert.deepEqual(await fiscalizeDue(c.f.env, { now: T0 }), { printed: 0, retried: 0, skipped: 1, queued: 0, failing: 0 });
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
  const fresh = await c.paidAt(Date.now());
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
  assert.deepEqual(body.fiscal, { printed: 1, retried: 1, skipped: 0, queued: 1, failing: 0 });
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
  // A first print is three calls (status_by_mti, submit_items, ofd_data);
  // across the ocean each easily takes this long.
  c.fake.latencyMs = 600;
  const order = await c.paidAt(Date.now());
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
  assert.deepEqual(body.fiscal, { printed: 1, retried: 0, skipped: 0, queued: 0, failing: 0 });
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
  assert.equal((await fiscalizeDue(c.f.env)).printed, 1);
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

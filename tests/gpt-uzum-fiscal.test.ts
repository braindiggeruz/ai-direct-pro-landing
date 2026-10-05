// Uzum receipts through the Uzum Fiscalization API (plan WP-15, U2): every
// Merchant API payment, and every Checkout payment registered without the
// auto-fiscalization cart. The operation_id is stored before the first call
// and reused; date_time is the payment moment, inside the spec's 24 hours;
// accepted-but-not-printed and "sent before" never cause a second receipt;
// failures back off and alert; a refund receipt follows its sale receipt.
// Real SQLite and a fake Fiscalization API (tests/helpers/uzum-fixture.ts);
// nothing reaches a real Uzum, Inplat, Telegram or database.
// Run: node --import tsx --test tests/gpt-uzum-fiscal.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { uzumFixture } from "./helpers/uzum-fixture";
import { BILLING_ORG } from "../functions/lib/gpt-chat/billing-config";
import { FISCAL_BACKOFF_MS, FiscalStore, fiscalizeDue } from "../functions/lib/gpt-chat/fiscal-store";
import { CLICK_RECEIPT_NAME } from "../functions/lib/gpt-chat/click-merchant";
import { fiscalParams } from "../functions/lib/gpt-chat/fiscal-config";
import { tashkentDateTime, uzumReceiptBody } from "../functions/lib/gpt-chat/uzum-fiscal";
import { UzumStore } from "../functions/lib/gpt-chat/uzum-store";
import { isUrgentAlert } from "../functions/lib/gpt-chat/alert-policy";

type Fixture = Awaited<ReturnType<typeof uzumFixture>>;
const T0 = Date.UTC(2026, 9, 1, 9, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const ITEM = {
  product_name: "AI paket 300 (xizmat, 1 oy)",
  price: 2_000_000,
  count: 1,
  spic: "10305008002000000",
  package_code: "1514296",
  vat_percent: 12,
};

/** An app payment (Merchant API) paid at `at`, straight through the store. */
async function paidAt(f: Fixture, at: number, transId: string = randomUUID(), org = BILLING_ORG) {
  const store = new UzumStore(f.binding, org);
  const order = await store.createOrder(f.user, f.mode, randomUUID(), "merchant", at);
  await store.billing.transition(order.id, "prepared", "uzum_create", { externalId: transId, providerTime: at, now: at });
  await store.billing.transition(order.id, "paid", "uzum_confirm", { now: at });
  return { ...(await store.order(order.id))!, store };
}
const posts = (f: Fixture, path = "/v2/receipt") => f.calls.filter((c) => c.method === "POST" && c.path === path);

test("the receipt: the payment's uuid, our operation_id, the Tashkent payment time, the whole amount by card, the pack's line", async () => {
  assert.equal(tashkentDateTime(Date.UTC(2026, 9, 1, 19, 30)), "2026-10-02T00:30:00+05:00");
  assert.equal(CLICK_RECEIPT_NAME, ITEM.product_name);
  assert.ok(ITEM.product_name.length <= 63);
  const params = fiscalParams({ GPT_FISCAL_IKPU: ITEM.spic, GPT_FISCAL_PACKAGE_CODE: ITEM.package_code, GPT_FISCAL_VAT_PERCENT: "12" })!;
  const operationId = randomUUID();
  assert.deepEqual(uzumReceiptBody("CANCEL", { operationId, paymentId: null, at: T0, amount: 2_000_000, params }), {
    operation_id: operationId,
    date_time: "2026-10-01T14:00:00+05:00",
    cash_amount: 0,
    card_amount: 2_000_000,
    items: [ITEM],
  });

  const f = await uzumFixture({ api: "merchant" });
  try {
    const transId = randomUUID();
    const row = await paidAt(f, T0, transId);
    // Queued in the batch that marked the order paid.
    assert.deepEqual(
      { ...f.receipt(row.id), receipt_url: undefined },
      { provider: "uzum", status_code: -1, receipt_url: undefined, attempts: 0, next_at: T0, payment_id: null, operation_id: null, last_error: null, submitted_at: null },
    );
    assert.deepEqual(await fiscalizeDue(f.env, { now: T0 + MIN }), { printed: 1, retried: 0, waiting: 0, skipped: 0, queued: 0, failing: 0 });
    const receipt = f.receipt(row.id);
    assert.match(String(receipt.operation_id), /^[0-9a-f-]{36}$/);
    assert.deepEqual(
      { status: receipt.status_code, url: receipt.receipt_url, paymentId: receipt.payment_id, attempts: receipt.attempts, error: receipt.last_error },
      { status: 0, url: f.fake.fiscalUrl(String(receipt.operation_id)), paymentId: transId, attempts: 1, error: null },
    );
    assert.equal(posts(f).length, 1);
    const call = posts(f)[0];
    assert.equal(call.host, "fixture-ofd.inplat-tech.com");
    assert.equal(call.headers["x-api-key"], f.fiscalKey);
    assert.deepEqual(call.body, {
      payment_id: transId,
      operation_id: receipt.operation_id,
      date_time: tashkentDateTime(T0),
      cash_amount: 0,
      card_amount: 2_000_000,
      items: [ITEM],
      receipt_type: 0,
    });
    // Within the spec's window: the payment moment itself, not the time of the call.
    const sent = Date.parse(String(call.body.date_time));
    assert.ok(sent >= row.perform_time - 1000 && sent - row.perform_time < 24 * HOUR);
    // Nothing is due any more; a replayed transition adds no row.
    assert.deepEqual(await fiscalizeDue(f.env, { now: T0 + 2 * MIN }), { printed: 0, retried: 0, waiting: 0, skipped: 0, queued: 0, failing: 0 });
    await row.store.billing.transition(row.id, "paid", "uzum_confirm", { now: T0 });
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts WHERE order_id=?", row.id), 1);
    // The account panel shows the link.
    const view = await f.accountView();
    assert.deepEqual(view.receipts, [{ kind: "PERFORM", receipt_url: receipt.receipt_url }]);
  } finally {
    f.restore();
  }
});

test("operation_id is stored before the first call and reused: a lost answer is found by its link, never sent twice", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    // Uzum took the receipt, its answer never arrived.
    const lost = await paidAt(f, T0);
    f.fake.loseFiscalAnswers = 1;
    assert.equal((await fiscalizeDue(f.env, { now: T0 })).retried, 1);
    const first = f.receipt(lost.id);
    assert.deepEqual([first.last_error, first.submitted_at, first.next_at], ["submit:network", null, T0 + FISCAL_BACKOFF_MS[0]]);
    assert.ok(f.fiscalReceipts.has(String(first.operation_id)), "the stored operation_id is the one Uzum holds");
    assert.equal((await fiscalizeDue(f.env, { now: T0 + MIN })).printed, 1);
    assert.equal(f.receipt(lost.id).operation_id, first.operation_id);
    assert.equal(posts(f).length, 1, "found by receipt_url, not sent again");
    // The request never reached Uzum: the retry finds nothing and sends the same operation.
    const dropped = await paidAt(f, T0 + 3 * MIN);
    f.fake.fiscalFailures.push("network");
    assert.equal((await fiscalizeDue(f.env, { now: T0 + 3 * MIN })).retried, 1);
    const pending = f.receipt(dropped.id);
    assert.equal(f.fiscalReceipts.has(String(pending.operation_id)), false);
    assert.equal((await fiscalizeDue(f.env, { now: T0 + 4 * MIN })).printed, 1);
    const resent = posts(f).filter((c) => c.body.payment_id === dropped.external_id);
    assert.deepEqual(resent.map((c) => c.body.operation_id), [pending.operation_id, pending.operation_id]);
  } finally {
    f.restore();
  }
});

test("202 accepted: printed later, its link asked by operation_id, the receipt never resent", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const row = await paidAt(f, T0);
    f.fake.fiscalPendingReads = 2;
    assert.equal((await fiscalizeDue(f.env, { now: T0 })).retried, 1);
    assert.deepEqual([f.receipt(row.id).last_error, f.receipt(row.id).submitted_at], ["qr_pending", T0]);
    assert.equal((await fiscalizeDue(f.env, { now: T0 + MIN })).retried, 1);
    assert.equal(f.receipt(row.id).last_error, "qr_pending");
    assert.equal((await fiscalizeDue(f.env, { now: T0 + 6 * MIN })).printed, 1);
    assert.equal(posts(f).length, 1);
    assert.equal(f.calls.filter((c) => c.method === "GET").length, 3);
  } finally {
    f.restore();
  }
});

test("'sent before' (400, code 2) counts as accepted: the link is asked, no second receipt exists", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const row = await paidAt(f, T0);
    f.fake.loseFiscalAnswers = 1;
    await fiscalizeDue(f.env, { now: T0 });
    // The retry cannot read the link (500), so it sends again: Uzum says it has it.
    f.fake.fiscalFailures.push(500);
    assert.equal((await fiscalizeDue(f.env, { now: T0 + MIN })).printed, 1);
    assert.equal(posts(f).length, 2);
    assert.equal([...f.fiscalReceipts.values()].filter((r) => r.paymentId === row.external_id).length, 1);
    assert.equal(f.receipt(row.id).receipt_url, f.fake.fiscalUrl(String(f.receipt(row.id).operation_id)));
  } finally {
    f.restore();
  }
});

test("failures back off 1/5/15/60 minutes then 6 hours; a live receipt alerts from the 6th failure or after 24 hours", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const row = await paidAt(f, T0);
    let now = T0;
    f.fake.fiscalDown = true;
    for (let attempt = 1; attempt <= 7; attempt++) {
      assert.equal((await fiscalizeDue(f.env, { now })).retried, 1, `attempt ${attempt}`);
      const receipt = f.receipt(row.id);
      assert.equal(receipt.attempts, attempt);
      assert.equal(receipt.last_error, "submit:http_500");
      assert.equal(receipt.next_at, now + FISCAL_BACKOFF_MS[Math.min(attempt, 5) - 1]);
      // One alert row per hour: the 6th and the 7th attempt are 6 hours apart.
      assert.equal(f.alerts().length, Math.max(0, attempt - 5), `alert after attempt ${attempt}`);
      // Not due before its time.
      assert.equal((await fiscalizeDue(f.env, { now: Number(receipt.next_at) - 1 })).retried, 0);
      now = Number(receipt.next_at);
    }
    assert.deepEqual(f.alerts(), ["uzum_fiscal_failed", "uzum_fiscal_failed"]);
    assert.ok(isUrgentAlert("uzum_fiscal_failed"));
    f.fake.fiscalDown = false;
    assert.deepEqual(await fiscalizeDue(f.env, { now }), { printed: 1, retried: 0, waiting: 0, skipped: 0, queued: 0, failing: 0 });
    // Uzum names a refused IKPU or package code (400, code 1).
    const refused = await paidAt(f, now);
    f.fake.fiscalFailures.push({ code: 1 });
    await fiscalizeDue(f.env, { now });
    assert.equal(f.receipt(refused.id).last_error, "submit:uzum_1");
    now = Number(f.receipt(refused.id).next_at);
    await fiscalizeDue(f.env, { now });
    // A payment a day old alerts at its first failure.
    const old = await paidAt(f, T0 - 25 * HOUR);
    f.fake.fiscalFailures.push(500);
    await fiscalizeDue(f.env, { now: now + 2 * HOUR });
    assert.equal(f.receipt(old.id).attempts, 1);
    assert.equal(f.alerts().length, 3);
    // The key never lands in the ledger.
    assert.ok(!JSON.stringify(f.db.rows("SELECT * FROM gpt_fiscal_receipts")).includes(f.fiscalKey));
  } finally {
    f.restore();
  }
});

test("test orders print on the test host with the test key, never alert, and are skipped without a key", async () => {
  const f = await uzumFixture({ mode: "test", api: "merchant" });
  try {
    const row = await paidAt(f, T0);
    assert.equal((await fiscalizeDue(f.env, { now: T0 })).printed, 1);
    assert.deepEqual([...new Set(f.calls.map((c) => c.host))], ["fixture-test-ofd.ipt-merch.com"]);
    assert.equal(f.receipt(row.id).status_code, 0);
    const failing = await paidAt(f, T0 + MIN);
    f.fake.fiscalDown = true;
    for (let i = 0, now = T0 + MIN; i < 7; i++, now = Number(f.receipt(failing.id).next_at)) await fiscalizeDue(f.env, { now });
    assert.equal(f.receipt(failing.id).attempts, 7);
    assert.deepEqual(f.alerts(), []);
    f.fake.fiscalDown = false;
    f.env.UZUM_CREDENTIALS_JSON = JSON.stringify({ merchant: { test: f.merchant } });
    const keyless = await paidAt(f, T0 + 2 * MIN);
    const calls = f.calls.length;
    await fiscalizeDue(f.env, { now: T0 + 30 * HOUR });
    assert.deepEqual([f.receipt(keyless.id).status_code, f.receipt(keyless.id).last_error], [-2, "skipped_test"]);
    assert.equal(f.calls.length, calls);
  } finally {
    f.restore();
  }
});

test("live links must be on ofd.soliq.uz; a missing key or code waits and alerts like any failure", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const row = await paidAt(f, T0);
    const url = f.fake.fiscalUrl;
    f.fake.fiscalUrl = () => "https://evil.example/receipt";
    assert.equal((await fiscalizeDue(f.env, { now: T0 })).retried, 1);
    assert.deepEqual([f.receipt(row.id).last_error, f.receipt(row.id).status_code], ["qr_host", -1]);
    f.fake.fiscalUrl = url;
    // A redirect is never followed: the attempt fails like any other answer.
    f.fake.redirects = 1;
    assert.equal((await fiscalizeDue(f.env, { now: T0 + MIN })).retried, 1);
    assert.equal(f.receipt(row.id).last_error, "url:http_302");
    assert.equal(f.fake.followed, 0);
    assert.equal((await fiscalizeDue(f.env, { now: T0 + 6 * MIN })).printed, 1);
    assert.equal(posts(f).length, 1);
    const other = await paidAt(f, T0 + MIN);
    const credentials = f.env.UZUM_CREDENTIALS_JSON;
    f.env.UZUM_CREDENTIALS_JSON = JSON.stringify({ merchant: { live: f.merchant } });
    assert.equal((await fiscalizeDue(f.env, { now: T0 + MIN })).retried, 1);
    assert.equal(f.receipt(other.id).last_error, "config_missing");
    f.env.UZUM_CREDENTIALS_JSON = credentials;
    f.env.GPT_FISCAL_PACKAGE_CODE = "";
    assert.equal((await fiscalizeDue(f.env, { now: T0 + 2 * MIN })).retried, 1);
    assert.equal(f.receipt(other.id).last_error, "config_missing");
    assert.equal(posts(f).length, 1);
  } finally {
    f.restore();
  }
});

test("a refund receipt follows its sale: same payment_id, the refund time; none when the sale never printed", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    // Printed, then returned: the refund receipt repeats the sale's payment_id.
    const sold = await paidAt(f, T0);
    await fiscalizeDue(f.env, { now: T0 });
    await sold.store.billing.transition(sold.id, "cancelled", "uzum_reverse", { reason: 5, now: T0 + HOUR });
    assert.deepEqual(await fiscalizeDue(f.env, { now: T0 + HOUR }), { printed: 1, retried: 0, waiting: 0, skipped: 0, queued: 0, failing: 0 });
    const refund = posts(f, "/v2/refund_receipt");
    assert.equal(refund.length, 1);
    const back = f.receipt(sold.id, "CANCEL");
    assert.deepEqual(refund[0].body, {
      payment_id: sold.external_id,
      operation_id: back.operation_id,
      date_time: tashkentDateTime(T0 + HOUR),
      cash_amount: 0,
      card_amount: 2_000_000,
      items: [ITEM],
    });
    assert.deepEqual([back.status_code, back.provider], [0, "uzum"]);
    // Returned before its sale receipt printed: no sale, so no refund receipt either.
    const quick = await paidAt(f, T0 + 2 * HOUR);
    await quick.store.billing.transition(quick.id, "cancelled", "uzum_reverse", { reason: 5, now: T0 + 2 * HOUR });
    assert.deepEqual(await fiscalizeDue(f.env, { now: T0 + 2 * HOUR }), { printed: 0, retried: 0, waiting: 0, skipped: 2, queued: 0, failing: 0 });
    assert.deepEqual(
      [f.receipt(quick.id).last_error, f.receipt(quick.id, "CANCEL").last_error],
      ["skipped_refunded", "sale_unprinted"],
    );
    // A sale still waiting (backing off): the refund receipt waits for it.
    const slow = await paidAt(f, T0 + 3 * HOUR);
    f.fake.fiscalFailures.push(500);
    await fiscalizeDue(f.env, { now: T0 + 3 * HOUR });
    await slow.store.billing.transition(slow.id, "cancelled", "uzum_reverse", { reason: 5, now: T0 + 3 * HOUR });
    assert.equal((await fiscalizeDue(f.env, { now: T0 + 3 * HOUR })).retried, 1);
    assert.equal(f.receipt(slow.id, "CANCEL").last_error, "sale_pending");
    await fiscalizeDue(f.env, { now: T0 + 4 * HOUR });
    assert.deepEqual(
      [f.receipt(slow.id).last_error, f.receipt(slow.id, "CANCEL").status_code],
      ["skipped_refunded", -2],
    );
    // A transId that is not a uuid: Uzum names the payment, and the refund repeats that name.
    const odd = await paidAt(f, T0 + 5 * HOUR, "UZB-7731");
    await fiscalizeDue(f.env, { now: T0 + 5 * HOUR });
    const named = f.receipt(odd.id);
    assert.equal("payment_id" in posts(f).at(-1)!.body, false);
    assert.match(String(named.payment_id), /^[0-9a-f-]{36}$/);
    await odd.store.billing.transition(odd.id, "cancelled", "uzum_reverse", { reason: 5, now: T0 + 6 * HOUR });
    await fiscalizeDue(f.env, { now: T0 + 6 * HOUR });
    assert.equal(posts(f, "/v2/refund_receipt").at(-1)!.body.payment_id, named.payment_id);
    assert.equal(f.receipt(odd.id, "CANCEL").status_code, 0);
  } finally {
    f.restore();
  }
});

test("a sale receipt that may have reached Uzum is finished when the money goes back first, and its refund receipt follows", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    // Uzum keeps the first receipt but its answer is lost; it accepts the
    // second (202) and has not printed it yet.
    const lost = await paidAt(f, T0);
    const accepted = await paidAt(f, T0 + 1000);
    f.fake.loseFiscalAnswers = 1;
    f.fake.fiscalPendingReads = 1;
    assert.equal((await fiscalizeDue(f.env, { now: T0 + 1000 })).retried, 2);
    f.fake.fiscalPendingReads = 0;
    assert.deepEqual(
      [lost, accepted].map((order) => [f.receipt(order.id).last_error, f.receipt(order.id).submitted_at]),
      [["submit:network", null], ["qr_pending", T0 + 1000]],
    );
    // Both are returned before their sale receipts printed.
    for (const order of [lost, accepted])
      await order.store.billing.transition(order.id, "cancelled", "uzum_reverse", { reason: 5, now: T0 + 2 * MIN });
    for (const at of [T0 + 10 * MIN, T0 + 30 * MIN, T0 + 2 * HOUR]) await fiscalizeDue(f.env, { now: at });
    // The OFD holds each sale, so each gets its refund receipt, with the sale's payment_id.
    for (const order of [lost, accepted]) {
      assert.deepEqual([f.receipt(order.id).status_code, f.receipt(order.id, "CANCEL").status_code], [0, 0]);
      const refund = posts(f, "/v2/refund_receipt").find((call) => call.body.payment_id === order.external_id);
      assert.ok(refund, "the refund receipt names the sale's payment");
    }
    assert.equal(posts(f).length, 2, "no sale receipt sent twice");
    assert.equal(posts(f, "/v2/refund_receipt").length, 2);
    assert.equal([...f.fiscalReceipts.values()].filter((receipt) => receipt.kind === "CANCEL").length, 2);
  } finally {
    f.restore();
  }
});

test("two workers never print one receipt, and another org's receipts are never claimed", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const row = await paidAt(f, T0);
    const ticks = await Promise.all([fiscalizeDue(f.env, { now: T0 }), fiscalizeDue(f.env, { now: T0 })]);
    assert.equal(ticks[0].printed + ticks[1].printed, 1);
    assert.equal(posts(f).length, 1);
    assert.equal(f.receipt(row.id).attempts, 1);
    const foreign = await paidAt(f, T0 + MIN, randomUUID(), "org_other");
    assert.deepEqual(await fiscalizeDue(f.env, { now: T0 + MIN }), { printed: 0, retried: 0, waiting: 0, skipped: 0, queued: 0, failing: 0 });
    assert.equal(f.db.value("SELECT attempts FROM gpt_fiscal_receipts WHERE org_id='org_other' AND order_id=?", foreign.id), 0);
    assert.equal(await new FiscalStore(f.binding, BILLING_ORG).claim(T0 + MIN), null);
    assert.equal((await new FiscalStore(f.binding, "org_other").claim(T0 + MIN))?.order_id, foreign.id);
  } finally {
    f.restore();
  }
});

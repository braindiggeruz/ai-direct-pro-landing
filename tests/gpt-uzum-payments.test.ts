// Uzum Bank payments (package C): Checkout callbacks + pulls, Merchant API
// webhooks, owner refunds, the 0065 ledger table and the cross-provider view.
// Every credential below is random per run; no request leaves the process.
// Run: node --import tsx --test tests/gpt-uzum-payments.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { uzumFixture } from "./helpers/uzum-fixture";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import { freshAdminDb } from "./helpers/bormi-admin-fixture";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { onRequestPost as uzumCallback } from "../functions/api/payments/uzum";
import { onRequestPost as uzumMerchant } from "../functions/api/payments/uzum-merchant/[op]";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { onRequestGet as account } from "../functions/api/gpt/account";
import {
  BILLING_ORG,
  providerKey,
  providerReady,
  type BillingEnv,
} from "../functions/lib/gpt-chat/billing-config";
import { BillingStore, storeFor } from "../functions/lib/gpt-chat/billing-store";
import {
  UZUM_BILLING_DDL,
  ensureBillingSchema,
  ensureUzumSchema,
} from "../functions/lib/gpt-chat/billing-schema";
import { UzumStore } from "../functions/lib/gpt-chat/uzum-store";
import {
  allowedUzumReceipt,
  allowedUzumRedirect,
  uzumBaseUrl,
  uzumFiscal,
  UZUM_HOST_PATTERN,
} from "../functions/lib/gpt-chat/uzum-config";
import { maintainBilling } from "../functions/lib/gpt-chat/billing-maintenance-store";
import { inspectBilling } from "../functions/lib/gpt-chat/billing-operations-store";
import { UZUM_CHECKOUT_HOST, allowedCheckoutUrl, validAccountView } from "../src/gpt-chat/types";

const ORDER_ID = /^uzm_[0-9a-f]{32}$/;
const bomb = {
  prepare() {
    throw new Error("DB touched");
  },
  batch() {
    throw new Error("DB touched");
  },
};

async function paidCheckout(f: Awaited<ReturnType<typeof uzumFixture>>) {
  const started = await f.subscribeUzum(randomUUID());
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const row = (await new UzumStore(f.binding, BILLING_ORG).order(String(started.body.attemptId)))!;
  f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: row.amount });
  const answer = await f.callback({
    orderId: row.external_id,
    operationState: "SUCCESS",
    operationType: "COMPLETE",
    orderNumber: row.id,
  });
  assert.equal(answer.status, 200);
  return row;
}

test("1. not configured: callbacks 404 without touching D1, subscribe refuses, providers exclude uzum", async () => {
  const original = globalThis.fetch;
  let outbound = 0;
  globalThis.fetch = (async () => {
    outbound++;
    throw new Error("no network in this test");
  }) as typeof fetch;
  try {
    const call = async (env: Record<string, unknown>) => {
      const ctx = (url: string, params = {}) =>
        ({
          request: new Request(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Basic eDp5" },
            body: "{}",
          }),
          env: { GPTBOT_DRAFTS_DB: bomb, ...env },
          params,
          waitUntil() {},
        }) as never;
      return [
        (await uzumCallback(ctx("https://gpt.test/api/payments/uzum"))).status,
        (await uzumMerchant(ctx("https://gpt.test/api/payments/uzum-merchant/check", { op: "check" }))).status,
      ];
    };
    const checkoutCreds = JSON.stringify({
      checkout: { live: { terminalId: randomUUID(), apiKey: randomBytes(24).toString("hex") } },
    });
    for (const env of [
      {},
      { GPT_BILLING_MODE: "live" },
      { GPT_BILLING_MODE: "live", UZUM_API: "checkout" },
      // No production base URL default, and a foreign host never gets the key.
      { GPT_BILLING_MODE: "live", UZUM_API: "checkout", UZUM_CREDENTIALS_JSON: checkoutCreds },
      { GPT_BILLING_MODE: "live", UZUM_API: "checkout", UZUM_CREDENTIALS_JSON: checkoutCreds, UZUM_CHECKOUT_BASE_URL: "https://evil.example" },
      { GPT_BILLING_MODE: "live", UZUM_API: "checkout", UZUM_CREDENTIALS_JSON: checkoutCreds, UZUM_CHECKOUT_BASE_URL: "http://api.uzumbank.uz" },
      { GPT_BILLING_MODE: "live", UZUM_API: "checkout", UZUM_CREDENTIALS_JSON: "{not json", UZUM_CHECKOUT_BASE_URL: "https://api.uzumbank.uz" },
      // Merchant API selected but only Checkout credentials present.
      { GPT_BILLING_MODE: "live", UZUM_API: "merchant", UZUM_CREDENTIALS_JSON: checkoutCreds },
      { GPT_BILLING_MODE: "live", UZUM_API: "other", UZUM_CREDENTIALS_JSON: checkoutCreds, UZUM_CHECKOUT_BASE_URL: "https://api.uzumbank.uz" },
    ])
      assert.deepEqual(await call(env), [404, 404], JSON.stringify(Object.keys(env)));
    assert.equal(outbound, 0);

    const f = await billingFixture();
    const response = await subscribe(
      f.ctx(
        new Request("https://gpt.test/api/gpt/subscribe", {
          method: "POST",
          headers: { cookie: f.cookie, Origin: "https://gpt.test", "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "uzum", requestId: randomUUID(), acceptTerms: true, termsVersion: f.env.GPT_BILLING_TERMS_VERSION }),
        }),
      ),
    );
    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as { code: string }).code, "not_configured");
    const view = async () =>
      (await (await account(f.ctx(new Request("https://gpt.test/api/gpt/account")))).json()) as { providers: string[] };
    assert.deepEqual((await view()).providers, ["click", "payme"]);
    // Merchant API ready: still no Uzum button (no customer screen yet).
    Object.assign(f.env, {
      UZUM_API: "merchant",
      UZUM_CREDENTIALS_JSON: JSON.stringify({ merchant: { test: { serviceId: 77, login: "fixture", password: randomBytes(12).toString("hex") } } }),
    });
    assert.equal(providerReady(f.env, "uzum"), true);
    assert.deepEqual((await view()).providers, ["click", "payme"]);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_uzum_orders"), 0);
    assert.equal(outbound, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("config: host allowlist, fiscal completeness and key gates fail closed", () => {
  const env = (extra: Partial<BillingEnv>) => ({ GPT_BILLING_MODE: "live", ...extra }) as BillingEnv;
  assert.equal(uzumBaseUrl(env({ UZUM_CHECKOUT_BASE_URL: "https://checkout.uzumbank.uz/" }), "live"), "https://checkout.uzumbank.uz");
  for (const bad of ["https://uzumbank.uz.evil.example", "https://evil-uzum.uz", "https://a.uzum.uz:8443", "https://u:p@api.uzum.uz", "https://api.uzum.uz/?x=1", ""])
    assert.equal(uzumBaseUrl(env({ UZUM_CHECKOUT_BASE_URL: bad }), "live"), null, bad);
  // Test mode falls back to the (unverified) public sandbox host; live has no default.
  assert.equal(uzumBaseUrl(env({}), "test"), "https://test-chk-api.uzumcheckout.uz");
  assert.equal(uzumBaseUrl(env({}), "live"), null);
  assert.equal(allowedUzumRedirect("https://pay.uzumbank.uz/x"), "https://pay.uzumbank.uz/x");
  assert.equal(allowedUzumRedirect("https://ofd.soliq.uz/check"), null);
  assert.equal(allowedUzumReceipt("https://ofd.soliq.uz/check?t=1"), "https://ofd.soliq.uz/check?t=1");
  assert.equal(allowedUzumReceipt("javascript:alert(1)"), null);
  assert.equal(uzumFiscal(env({ UZUM_AUTOFISCAL: "false" })), undefined);
  assert.equal(uzumFiscal(env({ UZUM_AUTOFISCAL: "true", UZUM_FISCAL_IKPU: "123", UZUM_FISCAL_PACKAGE_CODE: "1", UZUM_FISCAL_VAT_PERCENT: "12" })), null);
  assert.equal(uzumFiscal(env({ UZUM_AUTOFISCAL: "true", UZUM_FISCAL_IKPU: "1".repeat(17), UZUM_FISCAL_PACKAGE_CODE: "1", UZUM_FISCAL_VAT_PERCENT: "101" })), null);
  assert.deepEqual(uzumFiscal(env({ UZUM_AUTOFISCAL: "true", UZUM_FISCAL_IKPU: "1".repeat(17), UZUM_FISCAL_PACKAGE_CODE: "7", UZUM_FISCAL_VAT_PERCENT: "0" })), { spic: "1".repeat(17), packageCode: "7", vatPercent: 0 });
  const creds = JSON.stringify({ checkout: { live: { terminalId: randomUUID(), apiKey: randomBytes(24).toString("hex") } } });
  const ready = env({ UZUM_API: "checkout", UZUM_CREDENTIALS_JSON: creds, UZUM_CHECKOUT_BASE_URL: "https://checkout.uzumbank.uz", GPT_BILLING_LIVE_READY: "true", GPT_BILLING_TERMS_RU: "https://gptbot.uz/ru/terms/", GPT_BILLING_TERMS_UZ: "https://gptbot.uz/uz/terms/", GPT_BILLING_TERMS_VERSION: "v1" });
  assert.equal(providerReady(ready, "uzum"), true);
  assert.ok(providerKey(ready, "uzum", "live"));
  assert.equal(providerKey(ready, "uzum", "test"), "");
  assert.equal(providerReady({ ...ready, GPT_BILLING_LIVE_READY: "false" }, "uzum"), false);
  assert.equal(providerReady({ ...ready, GPT_BILLING_TERMS_VERSION: "" }, "uzum"), false);
  assert.equal(providerReady({ ...ready, UZUM_AUTOFISCAL: "true" }, "uzum"), false);
  // Click/Payme branches are untouched by the Uzum settings.
  assert.equal(providerReady({ ...ready, GPT_CLICK_SECRET: "x".repeat(20) }, "click"), false);
  assert.equal(providerReady({ ...ready, GPT_PAYME_KEY: "x".repeat(20), GPT_PAYME_MERCHANT_ID: "1" }, "payme"), true);
  // The browser redirect check and the server allowlist agree.
  assert.equal(UZUM_CHECKOUT_HOST.source, UZUM_HOST_PATTERN.source);
  assert.equal(allowedCheckoutUrl("https://pay.uzumbank.uz/p/1"), "https://pay.uzumbank.uz/p/1");
  assert.equal(allowedCheckoutUrl("https://my.click.uz/services/pay/"), "https://my.click.uz/services/pay/");
  assert.equal(allowedCheckoutUrl("https://evil.example/uzumbank.uz"), null);
  assert.equal(allowedCheckoutUrl("http://pay.uzumbank.uz/"), null);
});

test("2. checkout success: exact register body, pulled COMPLETED grants one period, account shows access", async () => {
  const f = await uzumFixture();
  try {
    const requestId = randomUUID();
    const started = await f.subscribeUzum(requestId);
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(started.body.mode, "checkout");
    const id = String(started.body.attemptId);
    assert.match(id, ORDER_ID);
    assert.equal(f.calls.length, 1);
    const register = f.calls[0];
    assert.equal(register.path, "/api/v1/payment/register");
    assert.equal(register.headers["content-language"], "ru-RU");
    assert.equal(register.headers["x-terminal-id"], f.checkout.terminalId);
    assert.deepEqual(register.body, {
      amount: 2000000,
      clientId: f.user,
      currency: 860,
      orderNumber: id,
      paymentDetails: "AI paket 300 · gptbot.uz",
      successUrl: "https://gpt.test/ru/gpt-chat/",
      failureUrl: "https://gpt.test/ru/gpt-chat/",
      viewType: "REDIRECT",
      paymentParams: { payType: "ONE_STEP" },
      sessionTimeoutSecs: 1800,
    });
    assert.ok(!/gpt\b|chatgpt/i.test(String(register.body.paymentDetails).replace("gptbot.uz", "")));
    const store = new UzumStore(f.binding, BILLING_ORG);
    const row = (await store.order(id))!;
    assert.equal(row.state, "prepared");
    assert.equal(row.api, "checkout");
    assert.ok(f.orders.has(row.external_id!));
    assert.equal(started.body.checkoutUrl, row.redirect_url);
    // Refresh/retry re-serves the same page without a second /register.
    const again = await f.subscribeUzum(requestId);
    assert.equal(again.body.checkoutUrl, started.body.checkoutUrl);
    assert.equal(f.calls.length, 1);

    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    const answer = await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: id, rrn: "123" });
    assert.deepEqual(answer, { status: 200, body: {} });
    assert.equal(f.calls.at(-1)!.path, "/api/v1/payment/getOrderStatus");
    assert.equal((await store.order(id))!.state, "paid");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE order_id=?", id), 1);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_billing_outbox WHERE order_id=? AND event='paid'", id), 1);
    assert.equal(f.db.value("SELECT actor FROM gpt_payment_journal WHERE order_id=? AND to_state='paid'", id), "uzum");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_subscriptions WHERE id=? AND provider='uzum'", id), 1);
    const view = await f.accountView();
    assert.ok(validAccountView(view));
    assert.deepEqual(view.providers, ["uzum"]);
    assert.equal((view.access as { order_id: string }).order_id, id);
    assert.deepEqual(
      { provider: (view.payment as { provider: string }).provider, state: (view.payment as { state: string }).state },
      { provider: "uzum", state: "paid" },
    );
    await f.drain();
  } finally {
    f.restore();
  }
});

test("2b. auto-fiscalization sends the cart on register and refund; Uzum register error cancels the invoice", async () => {
  const f = await uzumFixture({ autofiscal: true });
  try {
    const started = await f.subscribeUzum(randomUUID(), "uz");
    assert.equal(started.status, 200);
    const body = f.calls[0].body as { merchantParams: { cart: Record<string, unknown> }; successUrl: string };
    assert.equal(f.calls[0].headers["content-language"], "uz-UZ");
    assert.equal(body.successUrl, "https://gpt.test/uz/gpt-uzbek-tilida/");
    assert.deepEqual(body.merchantParams.cart, {
      cartId: started.body.attemptId,
      receiptType: "PURCHASE",
      total: 2000000,
      items: [{ title: "AI paket 300", productId: "ai_paket_300", quantity: 1, unitPrice: 2000000, total: 2000000, receiptParams: { spic: "10305008001000000", packageCode: "1501223", vatPercent: 12 } }],
    });
    const row = (await new UzumStore(f.binding, BILLING_ORG).order(String(started.body.attemptId)))!;
    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id });
    const refunded = await f.refundCall({ orderId: row.id, confirmRefund: true });
    assert.equal(refunded.status, 200, JSON.stringify(refunded.body));
    const refundCall = f.calls.find((c) => c.path === "/api/v1/acquiring/refund")!;
    assert.deepEqual(refundCall.body.cart, { total: 2000000, items: [{ productId: "ai_paket_300", quantity: 1, receiptParams: { spic: "10305008001000000", packageCode: "1501223", vatPercent: 12 } }] });

    const g = await uzumFixture();
    try {
      g.fake.registerErrorCode = 3027;
      const refused = await g.subscribeUzum(randomUUID());
      assert.equal(refused.status, 503);
      assert.equal(refused.body.code, "checkout_unavailable");
      assert.deepEqual(g.db.rows<object>("SELECT state,reason FROM gpt_uzum_orders").map((r) => ({ ...r })), [{ state: "cancelled", reason: 3027 }]);
    } finally {
      g.restore();
    }
    await f.drain();
  } finally {
    f.restore();
  }
});

test("2c. an ended Uzum session is never re-served: the pull settles it and a new invoice starts", async () => {
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const requestId = randomUUID();
    const first = await f.subscribeUzum(requestId);
    const id = String(first.body.attemptId);
    f.db.sqlite.prepare("UPDATE gpt_uzum_orders SET provider_time=provider_time-? WHERE id=?").run(40 * 60_000, id);
    const again = await f.subscribeUzum(requestId);
    assert.deepEqual(again.body, { ok: true, mode: "status", attemptId: id });
    assert.equal(f.calls.at(-1)!.path, "/api/v1/payment/getOrderStatus");
    assert.equal((await store.order(id))!.state, "cancelled");
    const fresh = await f.subscribeUzum(randomUUID());
    assert.equal(fresh.body.mode, "checkout");
    assert.notEqual(fresh.body.attemptId, id);
    // Owner switches to the Merchant API while a registered checkout invoice
    // is open: it is left to settle, never reused for the other API.
    Object.assign(f.env, { UZUM_API: "merchant" });
    const switched = await f.subscribeUzum(randomUUID());
    assert.deepEqual(switched.body, { ok: true, mode: "status", attemptId: fresh.body.attemptId });
    assert.equal((await store.order(String(fresh.body.attemptId)))!.state, "prepared");
    // Once nothing is open, the Merchant API answers with the code to enter in the Uzum Bank app.
    Object.assign(f.env, { UZUM_API: "checkout" });
    f.settleAtUzum((await store.order(String(fresh.body.attemptId)))!.external_id!, { status: "DECLINED" });
    await f.callback({ orderId: (await store.order(String(fresh.body.attemptId)))!.external_id, operationState: "FAIL", operationType: "AUTHORIZE", orderNumber: fresh.body.attemptId });
    const callsBefore = f.calls.length;
    Object.assign(f.env, { UZUM_API: "merchant" });
    const app = await f.subscribeUzum(randomUUID());
    assert.equal(app.body.mode, "uzum_app");
    assert.equal(app.body.account, app.body.attemptId);
    assert.equal((await store.order(String(app.body.attemptId)))!.api, "merchant");
    assert.equal(f.calls.length, callsBefore, "no Checkout call in Merchant API mode");
    await f.drain();
  } finally {
    f.restore();
  }
});

test("3. duplicate callbacks (sequential and concurrent) grant exactly once", async () => {
  const f = await uzumFixture();
  try {
    const row = await paidCheckout(f);
    const hint = { orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id };
    for (let i = 0; i < 2; i++) assert.equal((await f.callback(hint)).status, 200);
    const burst = await Promise.all(Array.from({ length: 3 }, () => f.callback(hint)));
    assert.ok(burst.every((r) => r.status === 200));
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 1);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_billing_outbox WHERE event='paid'"), 1);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_journal WHERE to_state='paid'"), 1);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("4. amount mismatch never grants and raises an owner alert", async () => {
  const f = await uzumFixture();
  try {
    const started = await f.subscribeUzum(randomUUID());
    const row = (await new UzumStore(f.binding, BILLING_ORG).order(String(started.body.attemptId)))!;
    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: 1999900 });
    const answer = await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id });
    assert.equal(answer.status, 200);
    assert.equal((await new UzumStore(f.binding, BILLING_ORG).order(row.id))!.state, "prepared");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 0);
    assert.equal(f.db.value("SELECT code FROM gpt_service_alerts"), "uzum_amount_mismatch");
    await f.drain();
  } finally {
    f.restore();
  }
});

test("5. forged callbacks: the pull decides, unknown orders cause no outbound call, other tenants are invisible", async () => {
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const started = await f.subscribeUzum(randomUUID());
    const row = (await store.order(String(started.body.attemptId)))!;
    // Claims SUCCESS; Uzum still says REGISTERED.
    await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id });
    assert.equal((await store.order(row.id))!.state, "prepared");
    // Claims SUCCESS; Uzum says DECLINED: closed, never paid.
    f.settleAtUzum(row.external_id!, { status: "DECLINED" });
    await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id });
    assert.equal((await store.order(row.id))!.state, "cancelled");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 0);

    const before = f.calls.length;
    const unknown = await f.callback({ orderId: randomUUID(), operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: `uzm_${randomBytes(16).toString("hex")}` });
    assert.deepEqual(unknown, { status: 200, body: {} });
    // Right order number, wrong Uzum order id.
    await f.callback({ orderId: randomUUID(), operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id });
    // Another tenant's order, fully linked: ignored without a pull.
    const other = new UzumStore(f.binding, "org_other");
    const foreign = await other.createOrder(f.user, "live", randomUUID(), "checkout");
    const foreignUzumId = randomUUID();
    await other.attachCheckout(foreign.id, foreignUzumId, "https://pay.fixture.uzumbank.uz/p/x");
    const tenant = await f.callback({ orderId: foreignUzumId, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: foreign.id });
    assert.deepEqual(tenant, { status: 200, body: {} });
    assert.equal(f.calls.length, before, "no amplification: zero outbound calls");
    assert.equal((await other.order(foreign.id))!.state, "prepared");
    assert.equal(await store.order(foreign.id), null);
    // Malformed hints are rejected before D1.
    assert.equal((await f.callback({ orderId: "not-a-uuid", operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id })).status, 400);
    assert.equal((await f.callback({ orderId: randomUUID(), operationState: "MAYBE", operationType: "COMPLETE", orderNumber: row.id })).status, 400);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("6. decline cancels; a later COMPLETED on the cancelled order alerts and grants nothing", async () => {
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const started = await f.subscribeUzum(randomUUID());
    const row = (await store.order(String(started.body.attemptId)))!;
    f.settleAtUzum(row.external_id!, { status: "DECLINED" });
    await f.callback({ orderId: row.external_id, operationState: "FAIL", operationType: "AUTHORIZE", orderNumber: row.id });
    assert.equal((await store.order(row.id))!.state, "cancelled");
    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    assert.equal((await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id })).status, 200);
    assert.equal((await store.order(row.id))!.state, "cancelled");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 0);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE code='uzum_paid_after_cancel'"), 1);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("7. owner refund: secret required, idempotent X-Operation-Id, state follows Uzum only", async () => {
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const row = await paidCheckout(f);
    assert.equal((await f.refundCall({ orderId: row.id, confirmRefund: true }, "")).status, 403);
    assert.equal((await f.refundCall({ orderId: row.id, confirmRefund: true }, `Bearer ${randomBytes(32).toString("hex")}`)).status, 403);
    assert.equal((await f.refundCall({ orderId: row.id })).status, 400);
    const first = await f.refundCall({ orderId: row.id, confirmRefund: true });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.state, "paid", "requested, not yet refunded");
    const second = await f.refundCall({ orderId: row.id, confirmRefund: true });
    const refunds = f.calls.filter((c) => c.path === "/api/v1/acquiring/refund");
    assert.equal(refunds.length, 2);
    assert.match(refunds[0].headers["x-operation-id"], /^[0-9a-f-]{36}$/);
    assert.equal(refunds[0].headers["x-operation-id"], refunds[1].headers["x-operation-id"]);
    assert.equal(first.body.operationId, second.body.operationId);
    assert.deepEqual(refunds[0].body, { orderId: row.external_id, amount: 2000000 });
    assert.ok((await store.order(row.id))!.refund_requested_at);
    assert.ok(await f.store.access(f.user, "live"));
    // Uzum reports the refund; the callback pull settles it.
    f.settleAtUzum(row.external_id!, { status: "REFUNDED", refundedAmount: 2000000 });
    await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "REFUND", orderNumber: row.id });
    assert.equal((await store.order(row.id))!.state, "refunded");
    assert.equal(await f.store.access(f.user, "live"), null);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_billing_outbox WHERE order_id=? AND event='refunded'", row.id), 1);
    assert.equal((await f.refundCall({ orderId: row.id, confirmRefund: true })).body.state, "refunded");
    // Record-only while Uzum still reports COMPLETED: refused, nothing changes.
    const next = await paidCheckout(f);
    const recorded = await f.refundCall({ orderId: next.id, merchantRefundReference: "cabinet-42", confirmedRefund: true });
    assert.equal(recorded.status, 409);
    assert.equal((await store.order(next.id))!.state, "paid");
    // Partial refund at Uzum: alert, no revoke.
    f.settleAtUzum(next.external_id!, { status: "REFUNDED", refundedAmount: 500000 });
    await f.callback({ orderId: next.external_id, operationState: "SUCCESS", operationType: "REFUND", orderNumber: next.id });
    assert.equal((await store.order(next.id))!.state, "paid");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE code='uzum_partial_refund'"), 1);
    // Once Uzum reports the full refund, record-only is accepted as an owner action.
    f.settleAtUzum(next.external_id!, { refundedAmount: 2000000 });
    const ok = await f.refundCall({ orderId: next.id, merchantRefundReference: "cabinet-42", confirmedRefund: true });
    assert.equal(ok.status, 200);
    assert.equal((await store.order(next.id))!.state, "refunded");
    assert.equal(f.db.value("SELECT actor FROM gpt_payment_journal WHERE order_id=? AND to_state='refunded'", next.id), "owner");
    await f.drain();
  } finally {
    f.restore();
  }
});

test("8. a failed status pull answers 502 and changes nothing", async () => {
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const started = await f.subscribeUzum(randomUUID());
    const row = (await store.order(String(started.body.attemptId)))!;
    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    f.fake.failPulls = 1;
    const answer = await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id });
    assert.equal(answer.status, 502);
    assert.equal((await store.order(row.id))!.state, "prepared");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 0);
    // Uzum's retry (or the visitor's "check status") settles it later.
    assert.equal((await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id })).status, 200);
    assert.equal((await store.order(row.id))!.state, "paid");
    await f.drain();
  } finally {
    f.restore();
  }
});

test("8b. 'check status' recovers a lost callback by pulling, within the per-account limit", async () => {
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const started = await f.subscribeUzum(randomUUID());
    const row = (await store.order(String(started.body.attemptId)))!;
    let view = await f.accountView();
    assert.equal((view.payment as { state: string }).state, "prepared");
    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    view = await f.accountView();
    assert.equal((view.payment as { state: string }).state, "paid");
    assert.ok(view.access);
    // A second order sits on REGISTERED: after 6 pulls in the hour, no more.
    const again = await f.subscribeUzum(randomUUID());
    assert.equal(again.body.mode, "checkout");
    const pulls = () => f.calls.filter((c) => c.path === "/api/v1/payment/getOrderStatus").length;
    const start = pulls();
    for (let i = 0; i < 8; i++) await f.accountView();
    assert.equal(pulls() - start, 4, "6 pulls per account and hour, two of them used above");
    await f.drain();
  } finally {
    f.restore();
  }
});

test("9. receipt callback stores a receipt only after getReceipts confirms it; foreign links are ignored", async () => {
  const f = await uzumFixture();
  try {
    const row = await paidCheckout(f);
    const url = "https://ofd.soliq.uz/check?t=fixture&r=1";
    const before = f.calls.length;
    await f.callback({ orderId: row.external_id, receiptType: "PURCHASE", receiptUrl: "https://evil.example/receipt" });
    assert.equal(f.calls.length, before, "no pull for a non-allowlisted link");
    await f.callback({ orderId: row.external_id, receiptType: "PURCHASE", receiptUrl: url });
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts"), 0, "not confirmed by the pull yet");
    f.settleAtUzum(row.external_id!, { receipts: [{ receiptUrl: url, receiptType: "PURCHASE" }] });
    assert.equal((await f.callback({ orderId: row.external_id, receiptType: "PURCHASE", receiptUrl: url })).status, 200);
    assert.deepEqual(f.db.rows<object>("SELECT order_id,kind,receipt_url,status_code FROM gpt_fiscal_receipts").map((r) => ({ ...r })), [
      { order_id: row.id, kind: "PERFORM", receipt_url: url, status_code: 0 },
    ]);
    // Shown in the account panel through the cross-provider view.
    assert.deepEqual((await f.accountView()).receipts, [{ kind: "PERFORM", receipt_url: url }]);
    f.fake.failPulls = 1;
    assert.equal((await f.callback({ orderId: row.external_id, receiptType: "REFUND", receiptUrl: url })).status, 502);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("10. Merchant API: Basic auth first, check/create/confirm, error codes, reverse and status mapping", async () => {
  const f = await uzumFixture({ mode: "test", api: "merchant" });
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const order = () => store.createOrder(f.user, "test", randomUUID(), "merchant");
    const bad = await uzumMerchant(
      f.ctx(
        new Request("https://gpt.test/api/payments/uzum-merchant/check", {
          method: "POST",
          headers: { Authorization: f.basic(f.merchant.login, "wrong-password") },
          body: "{}",
        }),
        { op: "check" },
      ),
    );
    assert.equal(bad.status, 400);
    assert.equal(((await bad.json()) as { errorCode: string }).errorCode, "10001");
    const bombed = await uzumMerchant({
      request: new Request("https://gpt.test/api/payments/uzum-merchant/check", { method: "POST", body: "{}" }),
      env: { ...f.env, GPTBOT_DRAFTS_DB: bomb },
      params: { op: "check" },
      waitUntil() {},
    } as never);
    assert.equal(((await bombed.json()) as { errorCode: string }).errorCode, "10001");
    assert.equal((await f.merchantCall("pay", {})).body.errorCode, "10003");
    assert.equal((await f.merchantCall("check", { serviceId: f.merchant.serviceId + 1, params: {} })).body.errorCode, "10006");
    assert.equal((await f.merchantCall("check", { params: { account: `uzm_${"0".repeat(32)}` } })).body.errorCode, "10007");
    assert.equal((await f.merchantCall("check", {})).body.errorCode, "10005");

    const a = await order();
    const checked = await f.merchantCall("check", { params: { account: a.id } });
    assert.equal(checked.status, 200);
    assert.deepEqual({ status: checked.body.status, data: checked.body.data }, { status: "OK", data: { account: { value: a.id } } });
    const transId = randomUUID();
    assert.equal((await f.merchantCall("create", { transId, amount: 1999900, params: { account: a.id } })).body.errorCode, "10011");
    const created = await f.merchantCall("create", { transId, amount: 2000000, params: { account: a.id } });
    assert.equal(created.status, 200);
    assert.equal(created.body.status, "CREATED");
    assert.equal(created.body.amount, 2000000);
    assert.equal((await f.merchantCall("create", { transId, amount: 2000000, params: { account: a.id } })).body.errorCode, "10010");
    assert.equal((await f.merchantCall("create", { transId: randomUUID(), amount: 2000000, params: { account: a.id } })).body.errorCode, "10008");
    assert.equal((await f.merchantCall("status", { transId })).body.status, "CREATED");
    const confirmed = await f.merchantCall("confirm", { transId, paymentSource: "UZCARD", phone: "998900000000" });
    assert.equal(confirmed.body.status, "CONFIRMED");
    assert.equal((await store.order(a.id))!.state, "paid");
    assert.ok(await f.store.access(f.user, "test"));
    assert.equal((await f.merchantCall("confirm", { transId, paymentSource: "UZCARD", phone: "998900000000" })).body.errorCode, "10016");
    assert.equal((await f.merchantCall("check", { params: { account: a.id } })).body.errorCode, "10008");
    const status = await f.merchantCall("status", { transId });
    assert.equal(status.body.status, "CONFIRMED");
    assert.equal(status.body.confirmTime, (await store.order(a.id))!.perform_time);
    assert.equal(JSON.stringify(f.db.rows("SELECT * FROM gpt_uzum_orders")).includes("998900000000"), false, "phone is never stored");

    const reversed = await f.merchantCall("reverse", { transId });
    assert.equal(reversed.body.status, "REVERSED");
    assert.equal((await store.order(a.id))!.state, "refunded");
    assert.equal(await f.store.access(f.user, "test"), null);
    assert.equal((await f.merchantCall("reverse", { transId })).body.errorCode, "10018");
    assert.equal((await f.merchantCall("status", { transId })).body.status, "REVERSED");
    assert.equal((await f.merchantCall("check", { params: { account: a.id } })).body.errorCode, "10009");

    // 30-minute rule: confirm after 31 minutes fails and closes the order.
    const b = await order();
    const late = randomUUID();
    await f.merchantCall("create", { transId: late, amount: 2000000, params: { account: b.id } });
    f.db.sqlite.prepare("UPDATE gpt_uzum_orders SET create_time=create_time-? WHERE id=?").run(31 * 60_000, b.id);
    assert.equal((await f.merchantCall("confirm", { transId: late, paymentSource: "HUMO", phone: "x" })).body.errorCode, "10015");
    assert.equal((await store.order(b.id))!.state, "cancelled");
    const failed = await f.merchantCall("status", { transId: late });
    assert.deepEqual([failed.status, failed.body.status, failed.body.errorCode], [400, "FAILED", "10015"]);
    assert.equal((await f.merchantCall("status", { transId: randomUUID() })).body.errorCode, "10014");
    assert.equal((await f.merchantCall("confirm", { transId: randomUUID(), paymentSource: "HUMO", phone: "x" })).body.errorCode, "10014");
    // Tenant isolation: another org's order is not payable here.
    const foreign = await new UzumStore(f.binding, "org_other").createOrder(f.user, "test", randomUUID(), "merchant");
    assert.equal((await f.merchantCall("check", { params: { account: foreign.id } })).body.errorCode, "10007");
    // A Checkout-mode order is not payable through the Merchant API.
    await f.binding.prepare("UPDATE gpt_uzum_orders SET state='cancelled' WHERE org_id=? AND user_id=? AND state IN ('pending','prepared')").bind(BILLING_ORG, f.user).run();
    const card = await store.createOrder(f.user, "test", randomUUID(), "checkout");
    assert.equal((await f.merchantCall("check", { params: { account: card.id } })).body.errorCode, "10007");
    await f.drain();
  } finally {
    f.restore();
  }
});

test("11. maintenance delivers a Uzum outbox event; Click/Payme delivery is unchanged", async () => {
  const f = await uzumFixture();
  try {
    const row = await paidCheckout(f);
    const click = await f.store.createOrder(f.user, "click", "live", randomUUID());
    await f.store.transition(click.id, "prepared", "Prepare", { externalId: String(randomBytes(4).readUInt32BE(0)) });
    await f.store.transition(click.id, "paid", "Complete");
    await f.drain();
    const diagnostics = await inspectBilling(f.env);
    assert.equal((diagnostics.outbox as { pending: number }).pending, 2);
    Object.assign(f.env, { GPT_NOTIFY_BOT_TOKEN: randomBytes(32).toString("hex"), GPT_NOTIFY_CHAT_ID: "123456789" });
    f.fake.allowTelegram = true;
    const result = await maintainBilling(f.env);
    assert.deepEqual({ delivered: result.delivered, configured: result.configured }, { delivered: 2, configured: true });
    assert.equal(f.telegram.length, 2);
    const uzum = f.telegram.find((m) => m.text.includes(row.id))!;
    const clickMessage = f.telegram.find((m) => m.text.includes(click.id))!;
    assert.equal(uzum.text, `GPTBot.uz · AI paket: paid\nuzum · 20 000 UZS\n${row.id}\nТекст разговора и данные Telegram-аккаунта не передаются.`);
    assert.equal(clickMessage.text, `GPTBot.uz · AI paket: paid\nclick · 20 000 UZS\n${click.id}\nТекст разговора и данные Telegram-аккаунта не передаются.`);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_billing_outbox WHERE delivered_at IS NULL"), 0);
    // Both providers share one access timeline without overlap.
    const periods = f.db.rows<{ starts_at: number; ends_at: number }>("SELECT starts_at,ends_at FROM gpt_access_periods ORDER BY starts_at");
    assert.equal(periods.length, 2);
    assert.equal(periods[0].ends_at, periods[1].starts_at);
  } finally {
    f.restore();
  }
});

test("12. 0065 applies after the full ledger; the view unions both tables; runtime DDL matches the migration", async () => {
  const migration = readFileSync(new URL("../migrations/0065_gpt_uzum_payments.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  for (const ddl of UZUM_BILLING_DDL) assert.ok(migration.includes(ddl + ";"), ddl.slice(0, 60));
  assert.match(migration, /^-- .*Rollback/m);
  assert.ok(!/\bDROP\s+TABLE\b/i.test(migration.replace(/^--.*$/gm, "")));
  // Full migration ledger in node:sqlite (0001..0065), twice: idempotent.
  const ledger = freshAdminDb();
  ledger.exec(migration);
  const binding = ledger.asD1();
  const click = await new BillingStore(binding, BILLING_ORG).createOrder("acct_a", "click", "live", randomUUID());
  const uzum = await storeFor(binding, BILLING_ORG, "uzum").createOrder("acct_a", "uzum", "live", randomUUID(), Date.now() + 5, undefined, "merchant");
  assert.match(uzum.id, ORDER_ID);
  assert.match(click.id, /^pay_[0-9a-f]{32}$/);
  assert.deepEqual(
    ledger.rows("SELECT id,provider FROM gpt_payment_orders_all ORDER BY created_at").map((r) => (r as { provider: string }).provider),
    ["click", "uzum"],
  );
  assert.equal((await new BillingStore(binding, BILLING_ORG).latestAcrossProviders("acct_a", "live"))!.id, uzum.id);
  assert.equal(ledger.value("SELECT api FROM gpt_uzum_orders"), "merchant");
  // The CHECKs still hold: no Uzum row in the 0064 table, no Click row in 0065's.
  assert.throws(() => ledger.exec("INSERT INTO gpt_payment_orders(org_id,id,user_id,provider,mode,request_id,amount,currency,state,created_at,expires_at) VALUES('o','x','u','uzum','live','r',2000000,'UZS','pending',1,2)"));
  assert.throws(() => ledger.exec("INSERT INTO gpt_uzum_orders(org_id,id,user_id,provider,mode,request_id,amount,currency,state,created_at,expires_at) VALUES('o','y','u','click','live','r',2000000,'UZS','pending',1,2)"));
  assert.throws(() => ledger.exec("INSERT INTO gpt_uzum_orders(org_id,id,user_id,provider,mode,request_id,amount,currency,state,created_at,expires_at) VALUES('o','z','u','uzum','live','r',100,'UZS','pending',1,2)"));
  await assert.rejects(new BillingStore(binding, BILLING_ORG).createOrder("acct_a", "uzum", "live", randomUUID()), /provider_table/);
  // One open Uzum invoice per account and mode.
  await assert.rejects(
    binding.prepare("INSERT INTO gpt_uzum_orders(org_id,id,user_id,provider,mode,request_id,amount,currency,state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(BILLING_ORG, `uzm_${"1".repeat(32)}`, "acct_a", "uzum", "live", randomUUID(), 2000000, "UZS", "pending", 1, Date.now() + 1e6).run(),
  );
  // Runtime bootstrap. The 0064 one (every chat turn runs it) creates no
  // Uzum object; the Uzum one adds exactly the 0065 objects and is a no-op
  // over the migrated ledger.
  const uzumObjects = (db: SqliteD1) =>
    db.value("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE '%uzum%' OR name='gpt_payment_orders_all'");
  const bare = new SqliteD1();
  await ensureBillingSchema(bare.asD1());
  assert.equal(uzumObjects(bare), 0);
  await ensureUzumSchema(bare.asD1());
  assert.equal(bare.value("SELECT COUNT(*) FROM sqlite_master WHERE name='gpt_payment_orders_all' AND type='view'"), 1);
  assert.equal(bare.value("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'idx_gpt_uzum_orders_%'"), 3);
  const migrated = uzumObjects(ledger);
  assert.equal(uzumObjects(bare), migrated);
  await ensureUzumSchema(binding);
  assert.equal(uzumObjects(ledger), migrated);
  assert.equal((await new BillingStore(binding, BILLING_ORG).latestAcrossProviders("acct_a", "live"))!.id, uzum.id);
});

test("13. every Uzum path bootstraps the 0065 objects itself when the migration is missing", async () => {
  const none = `uzm_${"0".repeat(32)}`;
  type Fixture = Awaited<ReturnType<typeof uzumFixture>>;
  const paths: Array<[api: "checkout" | "merchant", name: string, call: (f: Fixture) => Promise<number>]> = [
    ["checkout", "account", async (f) => (await account(f.ctx(new Request("https://gpt.test/api/gpt/account", { headers: { cookie: f.cookie } })))).status],
    ["checkout", "subscribe", async (f) => (await f.subscribeUzum(randomUUID())).status],
    ["checkout", "callback", async (f) => (await f.callback({ orderId: randomUUID(), operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: none })).status],
    ["checkout", "refund", async (f) => (await f.refundCall({ orderId: none, confirmRefund: true })).status],
    ["merchant", "merchant webhook", async (f) => (await f.merchantCall("check", { params: { account: none } })).status],
  ];
  for (const [api, name, call] of paths) {
    const f = await uzumFixture({ api });
    try {
      f.db.exec("DROP VIEW gpt_payment_orders_all; DROP TABLE gpt_uzum_orders");
      const status = await call(f);
      await f.drain();
      assert.ok(status < 500, `${name} answered ${status}`);
      assert.equal(
        f.db.value("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('gpt_uzum_orders','gpt_payment_orders_all')"),
        2,
        name,
      );
    } finally {
      f.restore();
    }
  }
});

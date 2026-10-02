// Uzum Bank payments (package C, plan WP-15): Checkout callbacks + pulls,
// owner refunds, the maintenance step, the 0065 ledger table and the
// cross-provider view. The Merchant API webhooks are in
// tests/gpt-uzum-merchant.test.ts, the Fiscalization API in
// tests/gpt-uzum-fiscal.test.ts, the rehearsal in tests/gpt-uzum-rehearsal.test.ts.
// Every credential below is random per run; no request leaves the process.
// Run: node --import tsx --test tests/gpt-uzum-payments.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { uzumFixture } from "./helpers/uzum-fixture";
import { billingFixture, liveSettings } from "./helpers/gpt-billing-fixture";
import { freshAdminDb } from "./helpers/bormi-admin-fixture";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { onRequestPost as uzumCallback } from "../functions/api/payments/uzum";
import { onRequestPost as uzumMerchant } from "../functions/api/payments/uzum-merchant/[op]";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { onRequestGet as account } from "../functions/api/gpt/account";
import { onRequestPost as maintenance } from "../functions/api/internal/gpt-billing-maintenance";
import {
  addCalendarMonth,
  BILLING_ORG,
  liveReadiness,
  providerConfigured,
  providerReady,
  type BillingEnv,
} from "../functions/lib/gpt-chat/billing-config";
import { BillingStore, storeFor } from "../functions/lib/gpt-chat/billing-store";
import {
  UZUM_BILLING_DDL,
  ensureBillingSchema,
  ensureUzumSchema,
} from "../functions/lib/gpt-chat/billing-schema";
import { UzumStore, UZUM_SESSION_EXPIRED_MS } from "../functions/lib/gpt-chat/uzum-store";
import {
  allowedUzumReceipt,
  allowedUzumRedirect,
  uzumBaseUrl,
  uzumFiscal,
  uzumFiscalBaseUrl,
  UZUM_HOST_PATTERN,
} from "../functions/lib/gpt-chat/uzum-config";
import { maintainUzum, uzumWait } from "../functions/lib/gpt-chat/uzum-maintenance";
import { receiptLink } from "../functions/lib/gpt-chat/fiscal-config";
import { UZUM_HOST } from "../src/shared/payment-hosts";
import { maintainBilling } from "../functions/lib/gpt-chat/billing-maintenance-store";
import { inspectBilling } from "../functions/lib/gpt-chat/billing-operations-store";
import { UZUM_CHECKOUT_HOST, allowedCheckoutUrl, safeAccountLink, validAccountView } from "../src/gpt-chat/types";

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
      // Merchant API selected but only Checkout credentials present, or a
      // malformed Merchant block (serviceId as a string, a ':' in the login).
      { GPT_BILLING_MODE: "live", UZUM_API: "merchant", UZUM_CREDENTIALS_JSON: checkoutCreds },
      { GPT_BILLING_MODE: "live", UZUM_API: "merchant", UZUM_CREDENTIALS_JSON: JSON.stringify({ merchant: { live: { serviceId: "77", login: "x", password: randomBytes(12).toString("hex") } } }) },
      { GPT_BILLING_MODE: "live", UZUM_API: "merchant", UZUM_CREDENTIALS_JSON: JSON.stringify({ merchant: { live: { serviceId: 77, login: "a:b", password: randomBytes(12).toString("hex") } } }) },
      { GPT_BILLING_MODE: "live", UZUM_API: "other", UZUM_CREDENTIALS_JSON: checkoutCreds, UZUM_CHECKOUT_BASE_URL: "https://api.uzumbank.uz" },
      // Fully configured, but switched off for Uzum alone or not allowed at all.
      { GPT_BILLING_MODE: "live", GPT_BILLING_MODE_UZUM: "off", UZUM_API: "checkout", UZUM_CREDENTIALS_JSON: checkoutCreds, UZUM_CHECKOUT_BASE_URL: "https://api.uzumbank.uz" },
      { GPT_BILLING_MODE: "live", GPT_PAYMENT_PROVIDERS: "click", UZUM_API: "checkout", UZUM_CREDENTIALS_JSON: checkoutCreds, UZUM_CHECKOUT_BASE_URL: "https://api.uzumbank.uz" },
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
    assert.equal(response.status, 404);
    assert.equal(((await response.json()) as { code: string }).code, "not_found");
    // Test providers are dark: offered in a rehearsal session only.
    const view = async (cookie = f.rehearsal) =>
      (await (await account(f.ctx(new Request("https://gpt.test/api/gpt/account", { headers: { cookie } })))).json()) as { providers: string[] };
    assert.deepEqual((await view("")).providers, []);
    assert.deepEqual((await view()).providers, ["click", "payme"]);
    // The maintenance step stays off without reading D1.
    assert.equal(await maintainUzum({ GPTBOT_DRAFTS_DB: bomb } as unknown as BillingEnv), null);
    assert.equal(await maintainUzum({ GPTBOT_DRAFTS_DB: bomb, GPT_BILLING_MODE: "test" } as unknown as BillingEnv), null);
    // Merchant API ready: offered (in the rehearsal) with the app-code flow.
    Object.assign(f.env, {
      UZUM_API: "merchant",
      UZUM_CREDENTIALS_JSON: JSON.stringify({ merchant: { test: { serviceId: 77, login: "fixture", password: randomBytes(12).toString("hex") } } }),
    });
    assert.equal(providerReady(f.env, "uzum"), true);
    const merchantView = (await view()) as { providers: string[]; uzumFlow?: unknown };
    assert.deepEqual([merchantView.providers, merchantView.uzumFlow], [["click", "uzum", "payme"], "code"]);
    assert.equal(((await view("")) as { uzumFlow?: unknown }).uzumFlow, null);
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
  // The same rule as the account panel: the tax authority's ofd.soliq.uz
  // exactly, or an Uzum host; never another soliq.uz subdomain.
  assert.equal(allowedUzumReceipt("https://my.soliq.uz/check"), null);
  assert.equal(allowedUzumReceipt("https://ofd.soliq.uz:8443/check"), null);
  assert.equal(allowedUzumReceipt("https://receipts.uzumbank.uz/r/1"), "https://receipts.uzumbank.uz/r/1");
  // The Fiscalization API: the spec's hosts by default, an allowlisted override, never a foreign one.
  assert.equal(uzumFiscalBaseUrl(env({}), "live"), "https://ofd-key.inplat-tech.com");
  assert.equal(uzumFiscalBaseUrl(env({}), "test"), "https://test-ofd.ipt-merch.com");
  assert.equal(uzumFiscalBaseUrl(env({ UZUM_FISCAL_BASE_URL: "https://ofd.uzumbank.uz/" }), "live"), "https://ofd.uzumbank.uz");
  for (const bad of ["https://ofd-key.inplat-tech.com.evil.example", "http://ofd-key.inplat-tech.com", "https://evil.example", "https://ofd-key.inplat-tech.com/?x=1"])
    assert.equal(uzumFiscalBaseUrl(env({ UZUM_FISCAL_BASE_URL: bad }), "live"), null, bad);
  // The cart carries the shared GPT_FISCAL_* values, complete or not at all.
  assert.equal(uzumFiscal(env({ UZUM_AUTOFISCAL: "false" })), undefined);
  assert.equal(uzumFiscal(env({ UZUM_AUTOFISCAL: "true", GPT_FISCAL_IKPU: "123", GPT_FISCAL_PACKAGE_CODE: "1", GPT_FISCAL_VAT_PERCENT: "12" })), null);
  assert.equal(uzumFiscal(env({ UZUM_AUTOFISCAL: "true", GPT_FISCAL_IKPU: "1".repeat(17), GPT_FISCAL_PACKAGE_CODE: "1", GPT_FISCAL_VAT_PERCENT: "101" })), null);
  assert.equal(uzumFiscal(env({ UZUM_AUTOFISCAL: "true", GPT_FISCAL_IKPU: "1".repeat(17), GPT_FISCAL_PACKAGE_CODE: "1" })), null);
  assert.deepEqual(uzumFiscal(env({ UZUM_AUTOFISCAL: "true", GPT_FISCAL_IKPU: "1".repeat(17), GPT_FISCAL_PACKAGE_CODE: "7", GPT_FISCAL_VAT_PERCENT: "0" })), { spic: "1".repeat(17), packageCode: "7", vatPercent: 0 });
  const creds = JSON.stringify({
    checkout: { live: { terminalId: randomUUID(), apiKey: randomBytes(24).toString("hex") } },
    fiscal: { live: { apiKey: randomBytes(24).toString("hex") } },
  });
  const ready = env({
    ...liveSettings(),
    GPTBOT_DRAFTS_DB: bomb as unknown as D1Database,
    GPT_IDENTITY_SECRET: randomBytes(32).toString("hex"),
    GPT_TELEGRAM_CLIENT_ID: "1",
    GPT_TELEGRAM_CLIENT_SECRET: randomBytes(16).toString("hex"),
    UZUM_API: "checkout",
    UZUM_AUTOFISCAL: "true",
    UZUM_CREDENTIALS_JSON: creds,
    UZUM_CHECKOUT_BASE_URL: "https://checkout.uzumbank.uz",
    GPT_BILLING_TERMS_RU: "https://gptbot.uz/ru/terms/",
    GPT_BILLING_TERMS_UZ: "https://gptbot.uz/uz/terms/",
    GPT_BILLING_TERMS_VERSION: "v1",
  });
  assert.deepEqual(liveReadiness(ready, "uzum"), []);
  assert.equal(providerReady(ready, "uzum"), true);
  assert.equal(providerConfigured(ready, "uzum", "live"), true);
  assert.equal(providerConfigured(ready, "uzum", "test"), false);
  assert.equal(providerReady({ ...ready, GPT_BILLING_LIVE_READY: "false" }, "uzum"), false);
  assert.equal(providerReady({ ...ready, GPT_BILLING_TERMS_VERSION: "" }, "uzum"), false);
  // A live card sale without a receipt is not offered (U3): without
  // auto-fiscalization the Fiscalization API key prints it instead.
  const noFiscalKey = JSON.stringify({ checkout: { live: { terminalId: randomUUID(), apiKey: randomBytes(24).toString("hex") } } });
  assert.deepEqual(liveReadiness({ ...ready, UZUM_AUTOFISCAL: "false", UZUM_CREDENTIALS_JSON: noFiscalKey }, "uzum"), ["UZUM_AUTOFISCAL"]);
  assert.deepEqual(liveReadiness({ ...ready, UZUM_AUTOFISCAL: "false" }, "uzum"), []);
  assert.deepEqual(liveReadiness({ ...ready, UZUM_AUTOFISCAL: "false", UZUM_FISCAL_BASE_URL: "https://evil.example" }, "uzum"), ["UZUM_FISCAL_BASE_URL"]);
  // With auto-fiscalization the Fiscalization API host is not needed.
  assert.deepEqual(liveReadiness({ ...ready, UZUM_FISCAL_BASE_URL: "https://evil.example" }, "uzum"), []);
  assert.equal(providerReady({ ...ready, GPT_FISCAL_IKPU: "" }, "uzum"), false);
  // The Merchant API prints receipts through the Fiscalization API key.
  const merchant = { ...ready, UZUM_API: "merchant", UZUM_CREDENTIALS_JSON: JSON.stringify({ merchant: { live: { serviceId: 77, login: "fixture", password: randomBytes(12).toString("hex") } } }) };
  assert.deepEqual(liveReadiness(merchant, "uzum"), ["UZUM_CREDENTIALS_JSON.fiscal.live.apiKey"]);
  // Click/Payme branches are untouched by the Uzum settings; Payme is off
  // unless listed and never live (no receipt detail).
  assert.equal(providerReady({ ...ready, GPT_CLICK_SECRET: "x".repeat(20) }, "click"), false);
  const payme = { ...ready, GPT_PAYME_KEY: "x".repeat(20), GPT_PAYME_MERCHANT_ID: "1" };
  assert.equal(providerReady(payme, "payme"), false);
  assert.deepEqual(liveReadiness(payme, "payme"), ["GPT_PAYMENT_PROVIDERS", "payme_receipt_detail"]);
  assert.deepEqual(liveReadiness({ ...payme, GPT_PAYMENT_PROVIDERS: "click,uzum,payme" }, "payme"), ["payme_receipt_detail"]);
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
      successUrl: "https://gpt.test/ru/gpt-chat/?pay=return",
      failureUrl: "https://gpt.test/ru/gpt-chat/?pay=return",
      viewType: "REDIRECT",
      paymentParams: { payType: "ONE_STEP" },
      sessionTimeoutSecs: 1800,
      // A live sale prints its receipt (U3): the shared GPT_FISCAL_* values, VAT 12 % included.
      merchantParams: {
        cart: {
          cartId: id,
          receiptType: "PURCHASE",
          total: 2000000,
          items: [{ title: "AI paket 300", productId: "ai_paket_300", quantity: 1, unitPrice: 2000000, total: 2000000, receiptParams: { spic: "10305008002000000", packageCode: "1514296", vatPercent: 12 } }],
        },
      },
    });
    assert.ok(!/gpt\b|chatgpt/i.test(String(register.body.paymentDetails).replace("gptbot.uz", "")));
    const store = new UzumStore(f.binding, BILLING_ORG);
    const row = (await store.order(id))!;
    assert.equal(row.state, "prepared");
    assert.equal(row.api, "checkout");
    // The cart went with the registration: Uzum prints this order's receipts.
    assert.equal(row.autofiscal, 1);
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
    // No receipt of ours to print: the queue gets no row.
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts WHERE order_id=?", id), 0);
    const view = await f.accountView();
    assert.ok(validAccountView(view));
    assert.deepEqual([view.providers, view.uzumFlow], [["uzum"], "checkout"]);
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
  const f = await uzumFixture();
  try {
    const started = await f.subscribeUzum(randomUUID(), "uz");
    assert.equal(started.status, 200);
    const body = f.calls[0].body as { merchantParams: { cart: Record<string, unknown> }; successUrl: string };
    assert.equal(f.calls[0].headers["content-language"], "uz-UZ");
    assert.equal(body.successUrl, "https://gpt.test/uz/gpt-uzbek-tilida/?pay=return");
    assert.deepEqual(body.merchantParams.cart, {
      cartId: started.body.attemptId,
      receiptType: "PURCHASE",
      total: 2000000,
      items: [{ title: "AI paket 300", productId: "ai_paket_300", quantity: 1, unitPrice: 2000000, total: 2000000, receiptParams: { spic: "10305008002000000", packageCode: "1514296", vatPercent: 12 } }],
    });
    const row = (await new UzumStore(f.binding, BILLING_ORG).order(String(started.body.attemptId)))!;
    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id });
    const refunded = await f.refundCall({ orderId: row.id, confirmRefund: true });
    assert.equal(refunded.status, 200, JSON.stringify(refunded.body));
    const refundCall = f.calls.find((c) => c.path === "/api/v1/acquiring/refund")!;
    assert.deepEqual(refundCall.body.cart, { total: 2000000, items: [{ productId: "ai_paket_300", quantity: 1, receiptParams: { spic: "10305008002000000", packageCode: "1514296", vatPercent: 12 } }] });

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
    // is open: the site shows the app code, the card invoice is left to
    // settle (never reused for the other API), and the app waits for it.
    Object.assign(f.env, { UZUM_API: "merchant" });
    const switched = await f.subscribeUzum(randomUUID());
    assert.equal(switched.body.mode, "code");
    assert.equal((await store.order(String(fresh.body.attemptId)))!.state, "prepared");
    assert.equal((await f.merchantCall("check", { params: { account: switched.body.paymentCode } })).body.errorCode, "10008");
    // The Merchant API opens no order on the site: it answers with the
    // account's permanent code for the Uzum Bank app, the same every time.
    Object.assign(f.env, { UZUM_API: "checkout" });
    f.settleAtUzum((await store.order(String(fresh.body.attemptId)))!.external_id!, { status: "DECLINED" });
    await f.callback({ orderId: (await store.order(String(fresh.body.attemptId)))!.external_id, operationState: "FAIL", operationType: "AUTHORIZE", orderNumber: fresh.body.attemptId });
    const callsBefore = f.calls.length;
    const ordersBefore = f.db.value("SELECT COUNT(*) FROM gpt_uzum_orders");
    Object.assign(f.env, { UZUM_API: "merchant" });
    const app = await f.subscribeUzum(randomUUID());
    assert.equal(app.body.mode, "code");
    assert.match(String(app.body.paymentCode), /^[1-9]\d{8}$/);
    assert.equal(app.body.paymentCode, switched.body.paymentCode);
    assert.equal((await f.merchantCall("check", { params: { account: app.body.paymentCode } })).body.status, "OK");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_uzum_orders"), ordersBefore);
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
    assert.deepEqual(refunds[0].body, {
      orderId: row.external_id,
      amount: 2000000,
      cart: { total: 2000000, items: [{ productId: "ai_paket_300", quantity: 1, receiptParams: { spic: "10305008002000000", packageCode: "1514296", vatPercent: 12 } }] },
    });
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

test("8c. a redirect from Uzum is never followed: the pull fails, the key goes nowhere, nothing changes", async () => {
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const started = await f.subscribeUzum(randomUUID());
    const row = (await store.order(String(started.body.attemptId)))!;
    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    f.fake.redirects = 1;
    const hint = { orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id };
    assert.equal((await f.callback(hint)).status, 502);
    assert.equal((await store.order(row.id))!.state, "prepared");
    // Every call went to the configured Uzum host only (the fake throws on any other).
    assert.deepEqual([...new Set(f.calls.map((c) => c.host))], ["fixture-chk.uzumbank.uz"]);
    assert.equal(f.fake.followed, 0);
    assert.equal((await f.callback(hint)).status, 200);
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

test("11. the owner hears of a Uzum and a Click payment once each; each pack starts at its payment", async () => {
  const f = await uzumFixture();
  try {
    const row = await paidCheckout(f);
    const click = await f.store.createOrder(f.user, "click", "live", randomUUID());
    await f.store.transition(click.id, "prepared", "Prepare", { externalId: String(randomBytes(4).readUInt32BE(0)) });
    await f.store.transition(click.id, "paid", "Complete");
    // The callback's own delivery runs in the background; the next tick sends the rest.
    await f.drain();
    await maintainBilling(f.env);
    assert.equal(f.telegram.length, 2);
    const uzum = f.telegram.find((m) => m.text.includes(row.id))!;
    const clickMessage = f.telegram.find((m) => m.text.includes(click.id))!;
    assert.equal(uzum.text, `GPTBot.uz · AI paket: paid\nuzum · 20 000 UZS\n${row.id}\nТекст разговора и данные Telegram-аккаунта не передаются.`);
    assert.equal(clickMessage.text, `GPTBot.uz · AI paket: paid\nclick · 20 000 UZS\n${click.id}\nТекст разговора и данные Telegram-аккаунта не передаются.`);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_billing_outbox WHERE delivered_at IS NULL"), 0);
    assert.equal(((await inspectBilling(f.env)).outbox as { pending: number }).pending, 0);
    // Both packs run side by side from their own payment, one calendar month each.
    const periods = f.db.rows<{ starts_at: number; ends_at: number }>("SELECT starts_at,ends_at FROM gpt_access_periods ORDER BY starts_at");
    assert.equal(periods.length, 2);
    for (const period of periods) assert.equal(period.ends_at, addCalendarMonth(period.starts_at));
    assert.ok(periods[1].starts_at < periods[0].ends_at);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_subscriptions WHERE plan='ai_paket'"), 2);
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
  // One open invoice across providers (U7): the Click one is closed first.
  await assert.rejects(
    storeFor(binding, BILLING_ORG, "uzum").createOrder("acct_a", "uzum", "live", randomUUID(), Date.now() + 5, undefined, "merchant"),
    /pending_elsewhere/,
  );
  await new BillingStore(binding, BILLING_ORG).transition(click.id, "cancelled", "invoice_expired", { reason: 4 });
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
  assert.equal(bare.value("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'idx_gpt_uzum_orders_%'"), 4);
  assert.equal(bare.value("SELECT COUNT(*) FROM sqlite_master WHERE name='gpt_payment_codes' AND type='table'"), 1);
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

const MIN = 60_000;
const HOUR = 60 * MIN;
const complete = (row: { id: string; external_id: string | null }) => ({
  orderId: row.external_id,
  operationState: "SUCCESS",
  operationType: "COMPLETE",
  orderNumber: row.id,
});

test("U5: a rehearsal pays Checkout on Uzum's TEST terminal page; without the rehearsal it is a missing route", async () => {
  const f = await uzumFixture({ mode: "test" });
  try {
    const dark = await f.subscribeUzum(randomUUID(), "ru", f.cookie);
    assert.equal(dark.status, 404);
    assert.equal(f.calls.length, 0);
    const started = await f.subscribeUzum(randomUUID());
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(started.body.mode, "checkout");
    assert.match(String(started.body.checkoutUrl), /^https:\/\/pay\.fixture\.uzumbank\.uz\/p\//);
    assert.deepEqual(f.calls.map((c) => `${c.host}${c.path}`), ["fixture-test-chk.uzumcheckout.uz/api/v1/payment/register"]);
    const row = (await new UzumStore(f.binding, BILLING_ORG).order(String(started.body.attemptId)))!;
    assert.equal(row.mode, "test");
    // The test card at Uzum's page, then Uzum's callback: a test pack, never a live one.
    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    assert.equal((await f.callback(complete(row))).status, 200);
    assert.ok(await f.store.access(f.user, "test"));
    assert.equal(await f.store.access(f.user, "live"), null);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("U4: an expired order Uzum registered is settled from Uzum's status before a new one, never closed blindly", async () => {
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const expire = (id: string) =>
      f.db.sqlite
        .prepare("UPDATE gpt_uzum_orders SET created_at=created_at-?,provider_time=provider_time-?,expires_at=? WHERE id=?")
        .run(13 * HOUR, 13 * HOUR, Date.now() - 1, id);
    // Paid at Uzum, the callback lost: the next checkout finds the payment.
    const first = await f.subscribeUzum(randomUUID());
    const paid = (await store.order(String(first.body.attemptId)))!;
    f.settleAtUzum(paid.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    expire(paid.id);
    const next = await f.subscribeUzum(randomUUID());
    assert.equal(next.body.mode, "checkout");
    assert.equal((await store.order(paid.id))!.state, "paid");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE order_id=?", paid.id), 1);
    // Uzum cannot be asked: nothing is closed, the visitor checks the status first.
    const open = (await store.order(String(next.body.attemptId)))!;
    expire(open.id);
    f.fake.failPulls = 1;
    const refused = await f.subscribeUzum(randomUUID());
    assert.deepEqual([refused.status, refused.body.code], [503, "checkout_unavailable"]);
    assert.equal((await store.order(open.id))!.state, "prepared");
    // Uzum still says REGISTERED long after its session: closed, a new order starts.
    const after = await f.subscribeUzum(randomUUID());
    assert.equal(after.body.mode, "checkout");
    assert.equal((await store.order(open.id))!.state, "cancelled");
    assert.notEqual(after.body.attemptId, open.id);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("U4/U11 maintenance: lost callbacks settle, missing receipts are fetched, a day without one tells the owner", async () => {
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const other = `__Host-gpt_account=${await f.identity.login(randomBytes(16).toString("hex"))}`;
    const a = (await store.order(String((await f.subscribeUzum(randomUUID())).body.attemptId)))!;
    const b = (await store.order(String((await f.subscribeUzum(randomUUID(), "ru", other)).body.attemptId)))!;
    f.settleAtUzum(a.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    // Inside their 30-minute sessions nothing is asked yet.
    assert.deepEqual(await maintainUzum(f.env), { settled: 0, receipts: 0, expired: 0, recovered: 0 });
    assert.equal(f.calls.filter((c) => c.path === "/api/v1/payment/getOrderStatus").length, 0);
    f.db.sqlite.prepare("UPDATE gpt_uzum_orders SET provider_time=provider_time-? WHERE id IN (?,?)").run(UZUM_SESSION_EXPIRED_MS + MIN, a.id, b.id);
    assert.deepEqual(await maintainUzum(f.env), { settled: 2, receipts: 0, expired: 0, recovered: 0 });
    assert.deepEqual([(await store.order(a.id))!.state, (await store.order(b.id))!.state], ["paid", "cancelled"]);
    // Paid a day ago, Uzum's sale receipt never arrived: asked, the owner told,
    // then left to wait (WP-24): the next tick asks Uzum nothing.
    f.db.sqlite.prepare("UPDATE gpt_uzum_orders SET perform_time=perform_time-? WHERE id=?").run(25 * HOUR, a.id);
    assert.deepEqual(await maintainUzum(f.env), { settled: 0, receipts: 0, expired: 0, recovered: 0 });
    assert.equal(f.calls.filter((c) => c.path === "/api/v1/payment/getReceipts").length, 1);
    assert.deepEqual(f.alerts(), ["uzum_receipt_missing"]);
    await maintainUzum(f.env);
    assert.equal(f.calls.filter((c) => c.path === "/api/v1/payment/getReceipts").length, 1);
    const url = "https://ofd.soliq.uz/epi?t=EZ000000000296&r=7&c=20261001140000&s=1";
    f.settleAtUzum(a.external_id!, { receipts: [{ receiptUrl: url, receiptType: "PURCHASE" }] });
    // Its wait (a quarter of its age, at most 6 hours) over, it is asked again.
    assert.deepEqual(await maintainUzum(f.env, { now: Date.now() + uzumWait(25 * HOUR) + MIN }), { settled: 0, receipts: 1, expired: 0, recovered: 0 });
    assert.equal(f.receipt(a.id).receipt_url, url);
    // Done: the receipt is on file, so the order leaves the scan.
    const pulls = f.calls.length;
    await maintainUzum(f.env);
    assert.equal(f.calls.length, pulls);
    // Through the tick: the step reports beside the receipts; off while Uzum is.
    const tick = async () => {
      const response = await maintenance(
        f.ctx(new Request("https://gptbot.uz/api/internal/gpt-billing-maintenance", { method: "POST", headers: { Authorization: `Bearer ${f.maintenanceSecret}` } })),
      );
      return (await response.json()) as { failed: string[]; uzum: unknown };
    };
    const on = await tick();
    assert.deepEqual([on.failed.includes("uzum"), on.uzum], [false, { settled: 0, receipts: 0, expired: 0, recovered: 0 }]);
    f.env.UZUM_API = "";
    assert.equal((await tick()).uzum, null);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("WP-24: orders that cannot settle wait, so five of them never starve the tick", async () => {
  // A quarter of the order's age, one tick at least, six hours at most.
  assert.deepEqual([0, 30 * MIN, 2 * HOUR, 24 * HOUR, 100 * HOUR].map(uzumWait), [15 * MIN, 15 * MIN, 30 * MIN, 6 * HOUR, 6 * HOUR]);
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const orders = [];
    for (let i = 0; i < 6; i++) {
      const cookie = `__Host-gpt_account=${await f.identity.login(randomBytes(16).toString("hex"))}`;
      orders.push((await store.order(String((await f.subscribeUzum(randomUUID(), "ru", cookie)).body.attemptId)))!);
    }
    const stuck = orders.slice(0, 5);
    const sixth = orders[5];
    // Uzum keeps three open (AUTHORIZED); two report an amount that is not ours (the owner is told).
    for (const [i, row] of stuck.entries())
      f.settleAtUzum(row.external_id!, i < 3 ? { status: "AUTHORIZED" } : { status: "COMPLETED", amount: 1000, completedAmount: 1000 });
    f.settleAtUzum(sixth.external_id!, {
      status: "COMPLETED",
      completedAmount: 2000000,
      receipts: [{ receiptUrl: "https://ofd.soliq.uz/epi?t=EZ000000000296&r=6&c=20261001140000&s=1", receiptType: "PURCHASE" }],
    });
    // Their sessions ended long ago, the five stuck ones first.
    const now = Date.now();
    for (const [i, row] of orders.entries())
      f.db.sqlite.prepare("UPDATE gpt_uzum_orders SET provider_time=? WHERE id=?").run(now - UZUM_SESSION_EXPIRED_MS - (10 - i) * MIN, row.id);
    const pulls = () => f.calls.filter((c) => c.path === "/api/v1/payment/getOrderStatus").length;
    const waits = () => f.db.rows<{ task: string; next_at: number }>("SELECT task,next_at FROM gpt_billing_ops WHERE task GLOB 'uzum_wait:*' ORDER BY task").map((row) => ({ ...row }));
    // One tick: the five oldest take every slot, none settles, each is told to wait.
    assert.deepEqual(await maintainUzum(f.env, { now }), { settled: 0, receipts: 0, expired: 0, recovered: 0 });
    assert.equal(pulls(), 5);
    assert.deepEqual(waits().map((row) => row.task), stuck.map((row) => `uzum_wait:${row.id}`).sort());
    for (const row of waits()) assert.ok(row.next_at >= now + 15 * MIN && row.next_at <= now + 6 * HOUR, String(row.next_at - now));
    assert.deepEqual([...new Set(f.alerts())], ["uzum_amount_mismatch"]);
    // The next tick passes them by and settles the sixth.
    assert.deepEqual(await maintainUzum(f.env, { now: now + MIN }), { settled: 1, receipts: 0, expired: 0, recovered: 0 });
    assert.equal(pulls(), 6);
    assert.equal((await store.order(sixth.id))!.state, "paid");
    // Their wait over, they are asked again; settled now, they leave the scan.
    for (const row of stuck) f.settleAtUzum(row.external_id!, { status: "DECLINED", amount: 2000000 });
    const later = now + 6 * HOUR + MIN;
    assert.deepEqual(await maintainUzum(f.env, { now: later }), { settled: 5, receipts: 1, expired: 0, recovered: 0 });
    assert.equal(pulls(), 11);
    assert.deepEqual(await Promise.all(stuck.map(async (row) => (await store.order(row.id))!.state)), Array(5).fill("cancelled"));
    // A day after a wait ran out, its row is dropped; another org's rows are not touched.
    f.db.sqlite.prepare("INSERT INTO gpt_billing_ops(org_id,task,next_at) VALUES('other-org','uzum_wait:x',0)").run();
    await maintainUzum(f.env, { now: later + 25 * HOUR });
    assert.deepEqual(waits(), [{ task: "uzum_wait:x", next_at: 0 }]);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("receipt links: what an Uzum callback may store is exactly what «Paketim» shows (one host rule)", () => {
  const links = [
    "https://ofd.soliq.uz/epi?t=EZ1&r=2", "https://check.uzumbank.uz/r/1", "https://receipts.uzum.uz/r/2", "https://pay.uzumcheckout.uz/r/3",
    "https://my.soliq.uz/check", "https://ofd.soliq.uz.evil.example/epi", "https://uzumbank.uz.evil.example/r", "https://test-ofd.ipt-merch.com/r/1",
    "https://ofd.soliq.uz:8443/epi", "http://ofd.soliq.uz/epi", "https://user:secret@ofd.soliq.uz/epi", "javascript:alert(1)", "/epi", "",
  ];
  for (const link of links) {
    assert.equal(allowedUzumReceipt(link), receiptLink(link), link);
    assert.equal(safeAccountLink(link), receiptLink(link), link);
  }
  assert.equal(links.filter((link) => receiptLink(link)).length, 4);
  // One source for both sides (src/shared/payment-hosts.ts).
  assert.equal(UZUM_HOST_PATTERN, UZUM_HOST);
  assert.equal(UZUM_CHECKOUT_HOST, UZUM_HOST);
});

test("U11: the panel fetches the receipt of a paid card payment whose receipt callback was lost", async () => {
  const f = await uzumFixture();
  try {
    const row = await paidCheckout(f);
    const url = "https://ofd.soliq.uz/epi?t=EZ000000000296&r=9&c=20261001140000&s=1";
    f.settleAtUzum(row.external_id!, { receipts: [{ receiptUrl: url, receiptType: "PURCHASE" }] });
    const view = await f.accountView();
    assert.deepEqual(view.receipts, [{ kind: "PERFORM", receipt_url: url }]);
    // On file now: opening the panel again asks Uzum nothing.
    const calls = f.calls.length;
    await f.accountView();
    assert.equal(f.calls.length, calls);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("Checkout without auto-fiscalization: no cart, and the Fiscalization API prints the sale and the refund receipts", async () => {
  const f = await uzumFixture({ autofiscal: false });
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const started = await f.subscribeUzum(randomUUID());
    const register = f.calls.find((c) => c.path === "/api/v1/payment/register")!;
    const id = String(started.body.attemptId);
    // The exact registration: test 2's body without the auto-fiscalization cart.
    assert.deepEqual(register.body, {
      amount: 2000000,
      clientId: f.user,
      currency: 860,
      orderNumber: id,
      paymentDetails: "AI paket 300 · gptbot.uz",
      successUrl: "https://gpt.test/ru/gpt-chat/?pay=return",
      failureUrl: "https://gpt.test/ru/gpt-chat/?pay=return",
      viewType: "REDIRECT",
      paymentParams: { payType: "ONE_STEP" },
      sessionTimeoutSecs: 1800,
    });
    const row = (await store.order(id))!;
    assert.equal(row.autofiscal, 0);
    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    await f.callback(complete(row));
    await f.drain();
    const sale = f.receipt(row.id);
    assert.deepEqual(
      { provider: sale.provider, status: sale.status_code, url: sale.receipt_url, paymentId: sale.payment_id },
      { provider: "uzum", status: 0, url: f.fake.fiscalUrl(String(sale.operation_id)), paymentId: row.external_id },
    );
    assert.equal(f.fiscalReceipts.get(String(sale.operation_id))!.body.payment_id, row.external_id);
    // A receipt callback for it is ignored: the queue owns this receipt.
    const before = f.calls.length;
    await f.callback({ orderId: row.external_id, receiptType: "PURCHASE", receiptUrl: "https://ofd.soliq.uz/epi?other=1" });
    assert.equal(f.calls.length, before);
    assert.equal(f.receipt(row.id).receipt_url, sale.receipt_url);
    // The refund carries no cart, exactly; Uzum's REFUNDED brings the refund receipt.
    assert.equal((await f.refundCall({ orderId: row.id, confirmRefund: true })).status, 200);
    assert.deepEqual(f.calls.find((c) => c.path === "/api/v1/acquiring/refund")!.body, { orderId: row.external_id, amount: 2000000 });
    f.settleAtUzum(row.external_id!, { status: "REFUNDED", refundedAmount: 2000000 });
    await f.callback({ ...complete(row), operationType: "REFUND" });
    await f.drain();
    const back = f.receipt(row.id, "CANCEL");
    assert.deepEqual([back.provider, back.status_code], ["uzum", 0]);
    assert.notEqual(back.operation_id, sale.operation_id);
    const refundBody = f.fiscalReceipts.get(String(back.operation_id))!;
    assert.deepEqual([refundBody.kind, refundBody.body.payment_id], ["CANCEL", row.external_id]);
    assert.deepEqual(
      ((await f.accountView()).receipts as Array<{ kind: string }>).map((r) => r.kind).sort(),
      ["CANCEL", "PERFORM"],
    );
  } finally {
    f.restore();
  }
});

test("a refund carries the cart exactly when the payment did, whatever UZUM_AUTOFISCAL says now", async () => {
  const f = await uzumFixture();
  try {
    const row = await paidCheckout(f);
    f.env.UZUM_AUTOFISCAL = "false";
    assert.equal((await f.refundCall({ orderId: row.id, confirmRefund: true })).status, 200);
    assert.ok("cart" in f.calls.find((c) => c.path === "/api/v1/acquiring/refund")!.body);
    // An auto-fiscalized order without complete receipt codes is not refunded half-way.
    f.env.UZUM_AUTOFISCAL = "true";
    const next = await paidCheckout(f);
    f.env.UZUM_AUTOFISCAL = "false";
    f.env.GPT_FISCAL_IKPU = "";
    const refused = await f.refundCall({ orderId: next.id, confirmRefund: true });
    assert.deepEqual([refused.status, refused.body.code], [409, "fiscal_not_configured"]);
    assert.equal(f.calls.filter((c) => c.path === "/api/v1/acquiring/refund").length, 1);
    await f.drain();
  } finally {
    f.restore();
  }
  const g = await uzumFixture({ autofiscal: false });
  try {
    const row = await paidCheckout(g);
    await g.drain();
    g.env.UZUM_AUTOFISCAL = "true";
    assert.equal((await g.refundCall({ orderId: row.id, confirmRefund: true })).status, 200);
    assert.equal("cart" in g.calls.find((c) => c.path === "/api/v1/acquiring/refund")!.body, false);
    await g.drain();
  } finally {
    g.restore();
  }
});

test("U13: the newest order across providers breaks ties on provider and id, not on per-table seq", async () => {
  const f = await uzumFixture();
  try {
    const at = Date.now();
    const uzum = new UzumStore(f.binding, BILLING_ORG);
    const u = await uzum.createOrder(f.user, "live", randomUUID(), "checkout", at);
    await uzum.billing.transition(u.id, "cancelled", "invoice_expired", { reason: 4, now: at });
    const c = await f.store.createOrder(f.user, "click", "live", randomUUID(), at);
    assert.equal(u.created_at, c.created_at);
    assert.equal((await f.store.latestAcrossProviders(f.user, "live"))!.id, u.id);
  } finally {
    f.restore();
  }
});

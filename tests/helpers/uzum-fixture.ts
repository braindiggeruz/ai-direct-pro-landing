import { randomBytes, randomUUID } from "node:crypto";
import { billingFixture } from "./gpt-billing-fixture";
import { onRequestPost as uzumCallback } from "../../functions/api/payments/uzum";
import { onRequestPost as uzumMerchant } from "../../functions/api/payments/uzum-merchant/[op]";
import { onRequestPost as uzumRefund } from "../../functions/api/internal/gpt-uzum-refund";
import { onRequestPost as subscribe } from "../../functions/api/gpt/subscribe";
import { onRequestGet as account } from "../../functions/api/gpt/account";
import type { BillingEnv } from "../../functions/lib/gpt-chat/billing-config";

// Runtime-only random fixtures, never real Uzum credentials. The fetch mock
// answers only the fixture Uzum host (and, when enabled, the Telegram Bot API)
// and throws on every other host, so nothing leaves the test process.
export const UZUM_FIXTURE_BASE = "https://fixture-chk.uzumbank.uz";
export const UZUM_FIXTURE_TEST_BASE = "https://fixture-test-chk.uzumcheckout.uz";

export interface FakeUzumOrder {
  orderId: string;
  merchantOrderId: string;
  status: string;
  amount: number;
  completedAmount: number;
  refundedAmount: number;
  reversedAmount: number;
  receipts: Array<{ receiptUrl: string; receiptType: string }>;
}
export interface UzumCall {
  host: string;
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

const hex = (bytes: number) => randomBytes(bytes).toString("hex");

export async function uzumFixture(
  options: {
    mode?: "test" | "live";
    api?: "checkout" | "merchant";
    autofiscal?: boolean;
  } = {},
) {
  const f = await billingFixture();
  const mode = options.mode ?? "live";
  const api = options.api ?? "checkout";
  const checkout = { terminalId: randomUUID(), apiKey: hex(24) };
  const merchant = {
    serviceId: randomBytes(3).readUIntBE(0, 3) + 1,
    login: `m${hex(6)}`,
    password: hex(20),
  };
  const maintenanceSecret = hex(32);
  Object.assign(f.env, {
    GPT_BILLING_MODE: mode,
    GPT_BILLING_LIVE_READY: "true",
    GPT_BILLING_MAINTENANCE_SECRET: maintenanceSecret,
    UZUM_API: api,
    UZUM_CHECKOUT_BASE_URL: UZUM_FIXTURE_BASE,
    UZUM_CHECKOUT_TEST_BASE_URL: UZUM_FIXTURE_TEST_BASE,
    UZUM_AUTOFISCAL: options.autofiscal ? "true" : "false",
    UZUM_FISCAL_IKPU: options.autofiscal ? "10305008001000000" : "",
    UZUM_FISCAL_PACKAGE_CODE: options.autofiscal ? "1501223" : "",
    UZUM_FISCAL_VAT_PERCENT: options.autofiscal ? "12" : "",
    UZUM_CREDENTIALS_JSON: JSON.stringify({
      checkout: { [mode]: checkout },
      merchant: { [mode]: merchant },
    }),
  } satisfies Partial<BillingEnv>);
  const base = mode === "live" ? UZUM_FIXTURE_BASE : UZUM_FIXTURE_TEST_BASE;

  // ── Fake Uzum Checkout ────────────────────────────────────────────────────
  const orders = new Map<string, FakeUzumOrder>();
  const calls: UzumCall[] = [];
  const telegram: Array<{ text: string }> = [];
  const fake = {
    registerErrorCode: 0,
    refundErrorCode: 0,
    /** Next getOrderStatus / getReceipts throws like a dropped connection. */
    failPulls: 0,
    allowTelegram: false,
  };
  const reply = (result: unknown, errorCode = 0) =>
    Response.json({ errorCode, message: errorCode ? "fixture error" : null, result });
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.telegram.org" && fake.allowTelegram) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text: string };
      telegram.push({ text: body.text });
      return Response.json({ ok: true, result: { message_id: telegram.length } });
    }
    if (url.origin !== base) throw new Error(`unexpected outbound host ${url.hostname}`);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ host: url.hostname, path: url.pathname, headers, body });
    if (headers["x-terminal-id"] !== checkout.terminalId || headers["x-api-key"] !== checkout.apiKey)
      return Response.json({ errorCode: 1006, message: "denied", result: null }, { status: 403 });
    if (url.pathname === "/api/v1/payment/register") {
      if (fake.registerErrorCode) return reply(null, fake.registerErrorCode);
      const orderId = randomUUID();
      orders.set(orderId, {
        orderId,
        merchantOrderId: String(body.orderNumber),
        status: "REGISTERED",
        amount: Number(body.amount),
        completedAmount: 0,
        refundedAmount: 0,
        reversedAmount: 0,
        receipts: [],
      });
      return reply({ orderId, paymentRedirectUrl: `https://pay.fixture.uzumbank.uz/p/${orderId}` });
    }
    const order = orders.get(String(body.orderId));
    if (url.pathname === "/api/v1/payment/getOrderStatus" || url.pathname === "/api/v1/payment/getReceipts") {
      if (fake.failPulls > 0) {
        fake.failPulls--;
        throw new TypeError("fetch failed");
      }
      if (!order) return reply(null, 3005);
      if (url.pathname === "/api/v1/payment/getReceipts") return reply({ receipts: order.receipts });
      const { receipts: _receipts, ...status } = order;
      void _receipts;
      return reply({ ...status, totalAmount: order.amount, operations: [] });
    }
    if (url.pathname === "/api/v1/acquiring/refund") {
      if (fake.refundErrorCode) return reply(null, fake.refundErrorCode);
      return reply({ operationId: randomUUID() });
    }
    return Response.json({ errorCode: 2000, message: "no route", result: null }, { status: 404 });
  }) as typeof fetch;
  const restore = () => {
    globalThis.fetch = original;
  };

  const ctx = (request: Request, params: Record<string, string> = {}) =>
    ({
      request,
      env: f.env,
      params,
      waitUntil: (task: Promise<unknown>) => f.background.push(task),
    }) as never;
  const callback = async (body: unknown, ip = "203.0.113.7") => {
    const response = await uzumCallback(
      ctx(
        new Request("https://gpt.test/api/payments/uzum", {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
          body: JSON.stringify(body),
        }),
      ),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const basic = (login = merchant.login, password = merchant.password) =>
    `Basic ${btoa(`${login}:${password}`)}`;
  const merchantCall = async (
    op: string,
    body: Record<string, unknown>,
    authorization = basic(),
  ) => {
    const response = await uzumMerchant(
      ctx(
        new Request(`https://gpt.test/api/payments/uzum-merchant/${op}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authorization },
          body: JSON.stringify({ serviceId: merchant.serviceId, timestamp: Date.now(), ...body }),
        }),
        { op },
      ),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const subscribeUzum = async (requestId: string, locale: "ru" | "uz" = "ru") => {
    const response = await subscribe(
      ctx(
        new Request("https://gpt.test/api/gpt/subscribe", {
          method: "POST",
          headers: { cookie: f.cookie, Origin: "https://gpt.test", "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "uzum",
            requestId,
            locale,
            acceptTerms: true,
            termsVersion: f.env.GPT_BILLING_TERMS_VERSION,
          }),
        }),
      ),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const accountView = async (cookie = f.cookie) =>
    (await (
      await account(ctx(new Request("https://gpt.test/api/gpt/account", { headers: { cookie } })))
    ).json()) as Record<string, unknown>;
  const refundCall = async (body: unknown, authorization = `Bearer ${maintenanceSecret}`) => {
    const response = await uzumRefund(
      ctx(
        new Request("https://gpt.test/api/internal/gpt-uzum-refund", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authorization },
          body: JSON.stringify(body),
        }),
      ),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  /** Uzum-side transition of a fake order. */
  const settleAtUzum = (orderId: string, patch: Partial<FakeUzumOrder>) => {
    const order = orders.get(orderId);
    if (!order) throw new Error("unknown fake order");
    Object.assign(order, patch);
  };
  const drain = () => Promise.allSettled(f.background.splice(0));

  return {
    ...f,
    mode,
    base,
    checkout,
    merchant,
    maintenanceSecret,
    orders,
    calls,
    telegram,
    fake,
    restore,
    ctx,
    callback,
    basic,
    merchantCall,
    subscribeUzum,
    accountView,
    refundCall,
    settleAtUzum,
    drain,
  };
}

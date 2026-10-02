import { randomBytes, randomUUID } from "node:crypto";
import { billingFixture, liveSettings } from "./gpt-billing-fixture";
import { onRequestPost as uzumCallback } from "../../functions/api/payments/uzum";
import { onRequestPost as uzumMerchant } from "../../functions/api/payments/uzum-merchant/[op]";
import { onRequestPost as uzumRefund } from "../../functions/api/internal/gpt-uzum-refund";
import { onRequestPost as subscribe } from "../../functions/api/gpt/subscribe";
import { onRequestGet as account } from "../../functions/api/gpt/account";
import {
  UZUM_ORDER_COLUMNS,
  UZUM_PAID_CHAT_DDL,
} from "../../functions/lib/gpt-chat/billing-schema";
import type { BillingEnv } from "../../functions/lib/gpt-chat/billing-config";
import { refuseLikeWorkerd } from "./click-merchant-fake";

// Runtime-only random fixtures, never real Uzum credentials. The fetch mock
// answers only the fixture Uzum hosts (Checkout and the Fiscalization API)
// and, when enabled, the Telegram Bot API, and throws on every other host, so
// nothing leaves the test process.
export const UZUM_FIXTURE_BASE = "https://fixture-chk.uzumbank.uz";
export const UZUM_FIXTURE_TEST_BASE = "https://fixture-test-chk.uzumcheckout.uz";
export const UZUM_FIXTURE_FISCAL = "https://fixture-ofd.inplat-tech.com";
export const UZUM_FIXTURE_TEST_FISCAL = "https://fixture-test-ofd.ipt-merch.com";

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
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
/** A receipt the fake Fiscalization API holds, by our operation_id. */
export interface FakeFiscalReceipt {
  kind: "PERFORM" | "CANCEL";
  body: Record<string, unknown>;
  paymentId: string;
  /** receipt_url reads that still answer 202 before the link exists. */
  pendingReads: number;
}
/** A queued fiscal failure: an HTTP status, a dropped connection, or a 400 {code}. */
export type FakeFiscalFailure = number | "network" | { code: number };

const hex = (bytes: number) => randomBytes(bytes).toString("hex");

export async function uzumFixture(
  options: {
    mode?: "test" | "live";
    api?: "checkout" | "merchant";
    /** Uzum prints the Checkout receipts itself (the default); false: the Fiscalization API does. */
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
  const fiscalKey = hex(24);
  const maintenanceSecret = hex(32);
  // Live-ready as a whole (liveReadiness() empty): a live Uzum sale prints
  // its receipt, by auto-fiscalization (Checkout) or the Fiscalization API
  // key (Merchant API, or Checkout without auto-fiscalization).
  Object.assign(f.env, {
    ...liveSettings(),
    GPT_BILLING_MODE: mode,
    GPT_BILLING_MAINTENANCE_SECRET: maintenanceSecret,
    UZUM_API: api,
    UZUM_CHECKOUT_BASE_URL: UZUM_FIXTURE_BASE,
    UZUM_CHECKOUT_TEST_BASE_URL: UZUM_FIXTURE_TEST_BASE,
    UZUM_FISCAL_BASE_URL: UZUM_FIXTURE_FISCAL,
    UZUM_FISCAL_TEST_BASE_URL: UZUM_FIXTURE_TEST_FISCAL,
    UZUM_AUTOFISCAL: options.autofiscal === false ? "false" : "true",
    UZUM_CREDENTIALS_JSON: JSON.stringify({
      checkout: { [mode]: checkout },
      merchant: { [mode]: merchant },
      fiscal: { [mode]: { apiKey: fiscalKey } },
    }),
  } satisfies Partial<BillingEnv>);
  // Production after release R4: the Uzum part of migrations/0068 applied
  // (billingFixture applied 0065). Not through ensureUzumSchema, so each Uzum
  // path still runs its own bootstrap once, as in a fresh isolate.
  for (const [name, type] of UZUM_ORDER_COLUMNS)
    f.db.exec(`ALTER TABLE gpt_uzum_orders ADD COLUMN ${name} ${type}`);
  for (const sql of UZUM_PAID_CHAT_DDL) f.db.exec(sql);
  const base = mode === "live" ? UZUM_FIXTURE_BASE : UZUM_FIXTURE_TEST_BASE;
  const fiscalBase = mode === "live" ? UZUM_FIXTURE_FISCAL : UZUM_FIXTURE_TEST_FISCAL;

  // ── Fake Uzum Checkout and Fiscalization API ─────────────────────────────
  const orders = new Map<string, FakeUzumOrder>();
  const calls: UzumCall[] = [];
  const fiscalReceipts = new Map<string, FakeFiscalReceipt>();
  const telegram: Array<{ text: string }> = [];
  const fake = {
    registerErrorCode: 0,
    refundErrorCode: 0,
    /** Next getOrderStatus / getReceipts throws like a dropped connection. */
    failPulls: 0,
    /** The owner channel is configured (liveSettings): its messages are recorded. */
    allowTelegram: true,
    /** Next fiscal calls fail like this, in order. */
    fiscalFailures: [] as FakeFiscalFailure[],
    /** Every fiscal call without a queued failure answers 500. */
    fiscalDown: false,
    /** Receipts are accepted with 202 and their link comes after this many reads. */
    fiscalPendingReads: 0,
    /** The next accepted receipt's answer never arrives (the receipt is kept). */
    loseFiscalAnswers: 0,
    /** The next Uzum calls answer 302 to a foreign host (a hijacked or moved API). */
    redirects: 0,
    /** Redirects a client asked to follow. */
    followed: 0,
    fiscalUrl: (operationId: string) =>
      `https://ofd.soliq.uz/epi?t=EZ000000000296&r=${operationId.slice(0, 8)}&c=20261001140000&s=176112857133`,
  };
  const reply = (result: unknown, errorCode = 0) =>
    Response.json({ errorCode, message: errorCode ? "fixture error" : null, result });

  const fiscalApi = (url: URL, method: string, headers: Headers, body: Record<string, unknown>) => {
    if (headers.get("x-api-key") !== fiscalKey)
      return Response.json({ message: "User is not found" }, { status: 403 });
    const failure = fake.fiscalFailures.shift() ?? (fake.fiscalDown ? 500 : undefined);
    if (failure === "network") throw new TypeError("fetch failed");
    if (typeof failure === "number") return Response.json({ message: "fixture error" }, { status: failure });
    if (failure) return Response.json({ code: failure.code, message: "fixture error" }, { status: 400 });
    const pending = /^\/v2\/receipt\/([0-9a-f-]{36})\/receipt_url$/.exec(url.pathname);
    if (method === "GET" && pending) {
      const receipt = fiscalReceipts.get(pending[1]);
      if (!receipt) return Response.json({ message: "Receipt not found" }, { status: 404 });
      if (receipt.pendingReads > 0) {
        receipt.pendingReads--;
        return Response.json({ message: "Retry later, please" }, { status: 202 });
      }
      return Response.json({ receipt_url: fake.fiscalUrl(pending[1]) });
    }
    if (method === "POST" && (url.pathname === "/v2/receipt" || url.pathname === "/v2/refund_receipt")) {
      const kind = url.pathname === "/v2/receipt" ? "PERFORM" : "CANCEL";
      const operationId = String(body.operation_id);
      if (kind === "CANCEL") {
        const sale = [...fiscalReceipts.values()].find((r) => r.kind === "PERFORM" && r.paymentId === body.payment_id);
        if (!sale) return Response.json({ message: "Receipt not found" }, { status: 404 });
      }
      const paymentId = typeof body.payment_id === "string" ? body.payment_id : randomUUID();
      if ([...fiscalReceipts.values()].some((r) => r.kind === kind && r.paymentId === paymentId))
        return Response.json({ code: 2, message: "Receipt with the same payment_id and receipt_type was already send" }, { status: 400 });
      fiscalReceipts.set(operationId, { kind, body, paymentId, pendingReads: fake.fiscalPendingReads });
      if (fake.loseFiscalAnswers > 0) {
        fake.loseFiscalAnswers--;
        throw new TypeError("fetch failed");
      }
      if (fake.fiscalPendingReads > 0)
        return Response.json({ payment_id: paymentId, code: 0, message: "accepted" }, { status: 202 });
      return Response.json({ receipt_id: 209726, payment_id: paymentId, receipt_url: fake.fiscalUrl(operationId) });
    }
    return Response.json({ detail: "Not Found" }, { status: 404 });
  };

  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.telegram.org" && fake.allowTelegram) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text: string };
      telegram.push({ text: body.text });
      return Response.json({ ok: true, result: { message_id: telegram.length } });
    }
    if (url.origin !== base && url.origin !== fiscalBase)
      throw new Error(`unexpected outbound host ${url.hostname}`);
    refuseLikeWorkerd(init);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ host: url.hostname, path: url.pathname, method, headers: Object.fromEntries(headers.entries()), body });
    if (fake.redirects > 0) {
      fake.redirects--;
      // A client that follows would send its key on to the Location host.
      if (init?.redirect !== "manual") fake.followed++;
      return new Response(null, { status: 302, headers: { Location: "https://collector.example/steal" } });
    }
    if (url.origin === fiscalBase) return fiscalApi(url, method, headers, body);
    if (headers.get("x-terminal-id") !== checkout.terminalId || headers.get("x-api-key") !== checkout.apiKey)
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
  // A test provider is offered in a rehearsal session only (rehearsal.ts).
  const viewerCookie = mode === "test" ? f.testCookie : f.cookie;
  const subscribeUzum = async (requestId: string, locale: "ru" | "uz" = "ru", cookie = viewerCookie) => {
    const response = await subscribe(
      ctx(
        new Request("https://gpt.test/api/gpt/subscribe", {
          method: "POST",
          headers: { cookie, Origin: "https://gpt.test", "Content-Type": "application/json" },
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
  /** Merchant API: the account's payment code, as the site issues it. */
  const paymentCode = async (cookie = viewerCookie) => {
    const issued = await subscribeUzum(randomUUID(), "uz", cookie);
    if (issued.status !== 200 || typeof issued.body.paymentCode !== "string")
      throw new Error(`no payment code: ${issued.status} ${JSON.stringify(issued.body)}`);
    return issued.body.paymentCode;
  };
  const accountView = async (cookie = viewerCookie) =>
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
  const receipt = (orderId: string, kind: "PERFORM" | "CANCEL" = "PERFORM") =>
    f.db
      .rows<Record<string, unknown>>(
        "SELECT provider,status_code,receipt_url,attempts,next_at,payment_id,operation_id,last_error,submitted_at FROM gpt_fiscal_receipts WHERE order_id=? AND kind=?",
        orderId,
        kind,
      )
      .map((row) => ({ ...row }))[0];
  const alerts = () =>
    f.db.rows<{ code: string }>("SELECT code FROM gpt_service_alerts ORDER BY created_at").map((r) => r.code);

  return {
    ...f,
    mode,
    base,
    fiscalBase,
    checkout,
    merchant,
    fiscalKey,
    maintenanceSecret,
    orders,
    calls,
    fiscalReceipts,
    telegram,
    fake,
    restore,
    ctx,
    callback,
    basic,
    merchantCall,
    viewerCookie,
    subscribeUzum,
    paymentCode,
    accountView,
    refundCall,
    settleAtUzum,
    drain,
    receipt,
    alerts,
  };
}

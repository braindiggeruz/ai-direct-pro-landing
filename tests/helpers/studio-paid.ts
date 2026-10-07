// Shared fixtures of the paid studio's tests (T3.2: store, entitlements,
// checkout, account, restore). Real SQLite (tests/helpers/sqlite-d1.ts);
// Siteverify is a mocked fetch; no network, no remote database.
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { SqliteD1 } from "./sqlite-d1";
import { ensureStudioPaidSchema, StudioStore, type NewStudioOrder, type StudioOrder } from "../../functions/lib/studio/store";
import { mintIdentity, STUDIO_BID_COOKIE } from "../../functions/lib/studio/identity";
import { STUDIO_ORG } from "../../functions/lib/studio/schema";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** 14.10.2026 09:30 UTC (14:30 in Tashkent). */
export const NOW = Date.UTC(2026, 9, 14, 9, 30);
/** The offer edition the tests sell under (plans.ts TERMS_PLAN). */
export const EDITION = "ai-paket-2026-10-v3";
export const TERMS_UZ = "https://gptbot.uz/uz/ommaviy-oferta/";
export const TERMS_RU = "https://gptbot.uz/ru/oferta/";
// Test-only material, never used anywhere else (letters only, so no scanner reads them as keys).
export const IDENTITY_KEY = "studio-identity-test-signing-material-only-for-tests";
export const WIDGET_KEY = "studio-turnstile-test-widget-material";
export const PAYME_DESK = "5e730e8e0b852a417aa49ceb";
export const PAYME_TEST_KEY = "payme-test-cash-desk-key-for-tests-only";
export const PAYME_LIVE_KEY = "payme-live-cash-desk-key-for-tests-only";
export const MAINTENANCE_KEY = "maintenance-bearer-material-for-studio-tests-only";

export async function paidDatabase(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureStudioPaidSchema(db.asD1());
  return db;
}

/** A Pages Functions context around `request` and `env`. */
export function call(handler: (context: never) => Response | Promise<Response>, request: Request, env: Record<string, unknown>): Promise<Response> {
  return Promise.resolve(
    handler({
      request,
      env,
      params: {},
      data: {},
      functionPath: new URL(request.url).pathname,
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
      next: () => {
        throw new Error("next() called");
      },
    } as never),
  );
}

/** Siteverify passes every token for `action` on gptbot.uz (or answers `answer`); the calls are counted. */
export function siteverify(context: TestContext, answer: Record<string, unknown> | ((action: string) => Record<string, unknown>)) {
  const calls: Array<{ response: string }> = [];
  context.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const form = init?.body as FormData;
    const response = String(form.get("response"));
    calls.push({ response });
    const body = typeof answer === "function" ? answer(response) : answer;
    return Response.json(body);
  });
  return calls;
}

/** Turnstile passes a token named after its action ("ok:studio_checkout"). */
export const PASS_BY_TOKEN = (token: string) => {
  const action = token.startsWith("ok:") ? token.slice(3) : "";
  return action ? { success: true, action, hostname: "gptbot.uz" } : { success: false };
};

/** The studio's settings with sales open through Payme (live), plus `extra`. */
export function studioJson(extra: Record<string, string> = {}): string {
  return JSON.stringify({
    STUDIO_API: "on",
    STUDIO_PAID_SERVICE: "on",
    STUDIO_FULL_DECK: "true",
    STUDIO_PAYMENTS: "live",
    STUDIO_PAYMENT_PROVIDERS: "payme",
    STUDIO_TERMS_VERSION: EDITION,
    STUDIO_TERMS_RU: TERMS_RU,
    STUDIO_TERMS_UZ: TERMS_UZ,
    STUDIO_TERMS_APPROVED_AT: "2026-10-07",
    STUDIO_TURNSTILE_SITE_KEY: "0x4AAAAAAAstudioTestKey",
    ...extra,
  });
}

/** The env of a site selling through the chat's Payme cash desk in live, with D1 `db`. */
export function paidEnv(db: SqliteD1 | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    STUDIO_RUNTIME_CONFIG_JSON: studioJson(),
    GPT_IDENTITY_SECRET: IDENTITY_KEY,
    STUDIO_TURNSTILE_SECRET_KEY: WIDGET_KEY,
    GPT_PAYMENT_PROVIDERS: "click,payme",
    GPT_BILLING_MODE_PAYME: "live",
    GPT_PAYME_KEY: PAYME_LIVE_KEY,
    GPT_PAYME_TEST_KEY: PAYME_TEST_KEY,
    GPT_PAYME_MERCHANT_ID: PAYME_DESK,
    GPT_FISCAL_IKPU: "10305008002000000",
    GPT_FISCAL_PACKAGE_CODE: "1514296",
    GPT_FISCAL_VAT_PERCENT: "12",
    GPT_BILLING_MAINTENANCE_SECRET: MAINTENANCE_KEY,
    GPTBOT_DRAFTS_DB: db?.asD1(),
    ...extra,
  };
}

/** A fresh browser identity cookie (`__Host-studio_bid=…`). */
export async function bidCookie(now = NOW): Promise<string> {
  const minted = await mintIdentity({ GPT_IDENTITY_SECRET: IDENTITY_KEY }, now);
  assert.ok(minted);
  return `${STUDIO_BID_COOKIE}=${minted.value}`;
}

/** The `name=value` part of each Set-Cookie of `response`. */
export function setCookies(response: Response): string[] {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
}

export const CONSENT = { version: EDITION, url: TERMS_UZ, locale: "uz" } as const;

let requestCounter = 0;
/** A request id the ledger's rules accept. */
export function requestId(): string {
  requestCounter += 1;
  return `o_test_${String(requestCounter).padStart(8, "0")}`;
}

/** A pending order of `userId` through the store. */
export async function pendingOrder(db: SqliteD1, overrides: Partial<NewStudioOrder> = {}): Promise<StudioOrder> {
  const made = await new StudioStore(db.asD1()).createOrder({
    userId: "acct_studio_buyer",
    plan: "oylik",
    termsVersion: EDITION,
    provider: "payme",
    serviceId: null,
    mode: "live",
    requestId: requestId(),
    consent: CONSENT,
    now: NOW,
    ...overrides,
  });
  return made.order;
}

/** A paid order (pending → prepared → paid at `paidAt`) of `userId`. */
export async function paidOrder(db: SqliteD1, overrides: Partial<NewStudioOrder> & { paidAt?: number; externalId?: string } = {}): Promise<StudioOrder> {
  const { paidAt = NOW, externalId, ...rest } = overrides;
  const order = await pendingOrder(db, { now: paidAt - 2 * 60_000, ...rest });
  const store = new StudioStore(db.asD1());
  const external = externalId ?? (order.provider === "payme" ? randomHex(24) : String(9_000_000 + order.seq));
  await store.prepare(order.id, { externalId: external, providerTime: paidAt - 60_000, method: `${order.provider}_create`, now: paidAt - 60_000 });
  const { order: paid } = await store.markPaid(order.id, { method: `${order.provider}_perform`, now: paidAt });
  return paid;
}

export function randomHex(length: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2))), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/** Journal rows of an order, oldest first. */
export function journal(db: SqliteD1, orderId: string) {
  return db.rows<{ actor: string; method: string; from_state: string | null; to_state: string }>(
    "SELECT actor, method, from_state, to_state FROM gpt_payment_journal WHERE org_id=? AND order_id=? ORDER BY created_at, rowid",
    STUDIO_ORG,
    orderId,
  ).map((row) => ({ ...row }));
}

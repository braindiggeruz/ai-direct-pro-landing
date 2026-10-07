// POST /api/studio/checkout, POST /api/studio/order/cancel and the providers
// of GET /api/studio/config (spec §6, §9.2; DECISIONS 07.10.2026 §12;
// BUILD-PLAN stream B): who may sell (Payme through the chat's cash desk,
// Click only with its own service and the amounts confirmed), the first
// order's browser identity and Turnstile, the studio's own account and
// checkout buckets, the edition the buyer saw, one open order, the payment
// page for the order's own amount, the order's source fields.
// Real SQLite; Siteverify is a mocked fetch; no network, no remote database.
// Run: node --import tsx --test tests/studio-checkout.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteD1 } from "./helpers/sqlite-d1";
import {
  EDITION,
  HOUR,
  NOW,
  PASS_BY_TOKEN,
  PAYME_DESK,
  TERMS_RU,
  TERMS_UZ,
  bidCookie,
  call,
  journal,
  paidDatabase,
  paidEnv,
  requestId,
  setCookies,
  siteverify,
  studioJson,
} from "./helpers/studio-paid";
import { onRequest as checkoutEndpoint } from "../functions/api/studio/checkout";
import { onRequest as cancelEndpoint } from "../functions/api/studio/order/cancel";
import { onRequest as configEndpoint } from "../functions/api/studio/config";
import { STUDIO_ACCOUNT_COOKIE } from "../functions/lib/studio/account";
import { readyProvider, readyProviders, studioClickCheckoutUrl, studioPaymeCheckoutUrl, studioReturnUrl } from "../functions/lib/studio/checkout";
import { parseStudioConfig } from "../functions/lib/studio/config";
import { StudioStore } from "../functions/lib/studio/store";
import { STUDIO_ORG } from "../functions/lib/studio/schema";
import type { BillingEnv } from "../functions/lib/gpt-chat/billing-config";

const CLICK_CREDENTIALS = JSON.stringify({
  live: { service_id: 107999, merchant_id: 55001, secret_key: "click-studio-secret-for-tests", merchant_user_id: 66001 },
  test: { service_id: 107998, secret_key: "click-studio-test-secret-for-tests" },
});

interface CheckoutCall {
  readonly body?: Record<string, unknown>;
  readonly cookie?: string;
  readonly host?: string;
  readonly origin?: string | null;
  readonly method?: string;
  readonly ip?: string;
}

function checkoutRequest(options: CheckoutCall = {}, path = "/api/studio/checkout"): Request {
  const host = options.host ?? "https://gptbot.uz";
  const headers: Record<string, string> = { "Content-Type": "application/json", "CF-Connecting-IP": options.ip ?? "203.0.113.7" };
  const origin = options.origin === undefined ? host : options.origin;
  if (origin) headers.Origin = origin;
  if (options.cookie) headers.cookie = options.cookie;
  const method = options.method ?? "POST";
  return new Request(`${host}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined });
}

const order = (extra: Record<string, unknown> = {}) => ({
  plan: "kunlik",
  requestId: requestId(),
  locale: "uz",
  acceptTerms: true,
  termsVersion: EDITION,
  turnstileToken: "ok:studio_checkout",
  ...extra,
});

async function post(env: Record<string, unknown>, options: CheckoutCall = {}) {
  const response = await call(checkoutEndpoint, checkoutRequest({ ...options, body: options.body ?? order() }), env);
  return { response, body: (await response.json()) as Record<string, unknown> };
}

/** The Payme page's parameters (base64 after the host). */
function paymeParams(url: string): Record<string, string> {
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://checkout.paycom.uz");
  const decoded = atob(parsed.pathname.slice(1));
  return Object.fromEntries(decoded.split(";").map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]));
}

const count = (db: SqliteD1, sql: string, ...params: unknown[]) => Number(db.value(sql, ...params));

// ── Who sells ───────────────────────────────────────────────────────────────

test("providers: Payme sells only when listed, in the cash desk's own mode, with its key, desk and receipt codes", () => {
  const env = paidEnv(null) as BillingEnv;
  const live = parseStudioConfig(studioJson());
  assert.deepEqual(readyProvider(env, live, "payme"), { provider: "payme", mode: "live", serviceId: null });
  assert.deepEqual(readyProviders(env, live), ["payme"]);
  const nobody = (configExtra: Record<string, string>, envExtra: Record<string, unknown> = {}) =>
    assert.deepEqual(readyProviders({ ...env, ...envExtra } as BillingEnv, parseStudioConfig(studioJson(configExtra))), [], JSON.stringify({ configExtra, envExtra }));
  nobody({ STUDIO_PAYMENT_PROVIDERS: "" });
  nobody({ STUDIO_PAYMENT_PROVIDERS: "Payme" });
  nobody({ STUDIO_PAYMENT_PROVIDERS: "uzum" });
  nobody({ STUDIO_PAYMENTS: "off" });
  // The cash desk runs in test (Payme's launch rolled back): the studio sells nothing through it in live.
  nobody({}, { GPT_BILLING_MODE_PAYME: "test" });
  nobody({}, { GPT_PAYMENT_PROVIDERS: "click" });
  nobody({}, { GPT_PAYME_KEY: "" });
  nobody({}, { GPT_PAYME_MERCHANT_ID: "not-a-desk" });
  nobody({}, { GPT_FISCAL_IKPU: "" });
  // A local rehearsal: the studio in test and the cash desk in test with its test key.
  const rehearsal = parseStudioConfig(studioJson({ STUDIO_PAYMENTS: "test" }));
  assert.deepEqual(readyProviders({ ...env, GPT_BILLING_MODE_PAYME: "test" } as BillingEnv, rehearsal), ["payme"]);
});

test("providers: Click (the studio's own service) sells only with the amounts confirmed and its credentials", () => {
  const env = { ...paidEnv(null), STUDIO_CLICK_CREDENTIALS_JSON: CLICK_CREDENTIALS } as BillingEnv;
  const both = parseStudioConfig(studioJson({ STUDIO_PAYMENT_PROVIDERS: "click,payme", STUDIO_CLICK_AMOUNTS_CONFIRMED: "true" }));
  assert.deepEqual(readyProviders(env, both), ["payme", "click"]);
  assert.deepEqual(readyProvider(env, both, "click"), { provider: "click", mode: "live", serviceId: "107999" });
  const unconfirmed = parseStudioConfig(studioJson({ STUDIO_PAYMENT_PROVIDERS: "click,payme" }));
  assert.deepEqual(readyProviders(env, unconfirmed), ["payme"]);
  assert.deepEqual(readyProviders(paidEnv(null) as BillingEnv, both), ["payme"]);
  const noMerchant = { ...env, STUDIO_CLICK_CREDENTIALS_JSON: JSON.stringify({ live: { service_id: 1, secret_key: "click-studio-secret-for-tests" } }) } as BillingEnv;
  assert.deepEqual(readyProviders(noMerchant, both), ["payme"]);
});

test("payment pages: Payme for the order's own amount and number, Click with the studio's service; the way back is a studio page", () => {
  const env = { ...paidEnv(null), STUDIO_CLICK_CREDENTIALS_JSON: CLICK_CREDENTIALS } as BillingEnv;
  const id = "stu_0123456789abcdef0123456789abcdef";
  const back = studioReturnUrl("https://gptbot.uz", "uz", "/uz/taqdimot-ai/");
  assert.equal(back, "https://gptbot.uz/uz/taqdimot-ai/?pay=return");
  assert.equal(studioReturnUrl("https://gptbot.uz", "ru", "https://evil.example/"), "https://gptbot.uz/ru/prezentatsiya-ai/?pay=return");
  assert.equal(studioReturnUrl("https://gptbot.uz", "uz", "/uz/tariflar/"), "https://gptbot.uz/uz/tariflar/?pay=return");
  const payme = studioPaymeCheckoutUrl(env, "live", id, 3_990_000, "uz", back)!;
  assert.deepEqual(paymeParams(payme), { m: PAYME_DESK, "ac.order_id": id, a: "3990000", c: back, l: "uz", ct: "15000" });
  assert.equal(studioPaymeCheckoutUrl(env, "live", "stu_a;b", 590_000, "uz", back), null);
  assert.equal(studioPaymeCheckoutUrl(env, "live", id, 0, "uz", back), null);
  assert.match(studioPaymeCheckoutUrl(env, "test", id, 590_000, "ru", back)!, /^https:\/\/test\.paycom\.uz\//);
  const click = new URL(studioClickCheckoutUrl(env, id, 590_000, back)!);
  assert.equal(`${click.origin}${click.pathname}`, "https://my.click.uz/services/pay/");
  assert.deepEqual(Object.fromEntries(click.searchParams), { service_id: "107999", merchant_id: "55001", amount: "5900.00", transaction_param: id, return_url: back });
});

// ── The gate ────────────────────────────────────────────────────────────────

test("closed: sales off, another host, a test sale on the site → 404 before the body, D1 or Turnstile", async (context) => {
  const calls = siteverify(context, PASS_BY_TOKEN);
  const throwing = new Proxy({}, { get: () => { throw new Error("D1 touched"); } });
  for (const [env, host] of [
    [{ ...paidEnv(null), STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAYMENTS: "off" }) }, "https://gptbot.uz"],
    [{ ...paidEnv(null), STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAYMENTS: "test" }) }, "https://gptbot.uz"],
    [paidEnv(null), "https://gptbot-ai.pages.dev"],
    [paidEnv(null), "http://localhost:8788"],
  ] as const) {
    const response = await call(checkoutEndpoint, new Request(`${host}/api/studio/checkout`, { method: "POST", headers: { Origin: host }, body: "{" }), { ...env, GPTBOT_DRAFTS_DB: throwing });
    assert.equal(response.status, 404, `${host} ${String(env.STUDIO_RUNTIME_CONFIG_JSON)}`);
  }
  assert.equal(calls.length, 0);
});

test("refused before D1: another origin, GET, a bad body, no acceptTerms, a changed edition, nothing to spend, nobody selling", async (context) => {
  const calls = siteverify(context, PASS_BY_TOKEN);
  const throwing = new Proxy({}, { get: () => { throw new Error("D1 touched"); } });
  const env = { ...paidEnv(null), GPTBOT_DRAFTS_DB: throwing };
  const expect = async (options: CheckoutCall, status: number, code: string, envOverride: Record<string, unknown> = env) => {
    const response = await call(checkoutEndpoint, checkoutRequest({ ...options, body: options.body ?? order() }), envOverride);
    assert.equal(response.status, status, JSON.stringify(options));
    assert.equal(((await response.json()) as { code: string }).code, code);
    assert.equal(response.headers.get("cache-control"), "no-store");
  };
  await expect({ origin: "https://evil.example" }, 400, "invalid");
  await expect({ origin: null }, 400, "invalid");
  await expect({ method: "GET" }, 405, "method_not_allowed");
  await expect({ body: order({ acceptTerms: "yes" }) }, 400, "invalid");
  await expect({ body: order({ acceptTerms: undefined }) }, 400, "invalid");
  await expect({ body: order({ plan: "weekly" }) }, 400, "invalid");
  await expect({ body: order({ requestId: "short" }) }, 400, "invalid");
  await expect({ body: order({ locale: "en" }) }, 400, "invalid");
  await expect({ body: order({ provider: "uzum" }) }, 400, "invalid");
  await expect({ body: order({ termsVersion: "ai-paket-2026-10-v2" }) }, 409, "terms_changed");
  // An edition no quota version belongs to, or without its offer link: nothing is sold.
  await expect({}, 503, "checkout_unavailable", { ...env, STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_TERMS_VERSION: "ai-paket-2026-10-v9" }) });
  await expect({ body: order({ termsVersion: "ai-paket-2026-10-v9" }) }, 503, "checkout_unavailable", { ...env, STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_TERMS_VERSION: "ai-paket-2026-10-v9" }) });
  await expect({}, 503, "checkout_unavailable", { ...env, STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_TERMS_UZ: "" }) });
  // A tariff nobody could spend is never sold: paid service or full deck off.
  await expect({}, 503, "checkout_unavailable", { ...env, STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAID_SERVICE: "off" }) });
  await expect({}, 503, "checkout_unavailable", { ...env, STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_FULL_DECK: "false" }) });
  // Nobody sells, or the chosen provider does not.
  await expect({}, 503, "provider_unavailable", { ...env, STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAYMENT_PROVIDERS: "" }) });
  await expect({}, 503, "provider_unavailable", { ...env, GPT_BILLING_MODE_PAYME: "test" });
  await expect({ body: order({ provider: "click" }) }, 503, "provider_unavailable");
  // No D1 or no identity secret: not configured.
  await expect({}, 503, "studio_not_configured", { ...paidEnv(null) });
  await expect({}, 503, "studio_not_configured", { ...env, GPT_IDENTITY_SECRET: "short" });
  assert.equal(calls.length, 0);
});

// ── The first order: identity, Turnstile, the account ───────────────────────

test("a first order needs the browser identity, then a studio_checkout token; only then an account and the order", async (context) => {
  const calls = siteverify(context, PASS_BY_TOKEN);
  const db = await paidDatabase();
  const env = paidEnv(db);
  const noIdentity = await post(env);
  assert.equal(noIdentity.response.status, 401);
  assert.equal(noIdentity.body.code, "identity_required");
  assert.equal(calls.length, 0);
  const bid = await bidCookie(Date.now());
  const noToken = await post(env, { cookie: bid, body: order({ turnstileToken: undefined }) });
  assert.equal(noToken.response.status, 403);
  assert.equal(noToken.body.code, "turnstile_required");
  const wrongAction = await post(env, { cookie: bid, body: order({ turnstileToken: "ok:studio_free_deck" }) });
  assert.equal(wrongAction.response.status, 403);
  assert.equal(wrongAction.body.code, "turnstile_failed");
  assert.equal(count(db, "SELECT COUNT(*) FROM gpt_accounts"), 0);
  assert.equal(setCookies(wrongAction.response).length, 0);

  const first = await post(env, { cookie: bid, body: order({ plan: "oylik", returnPath: "/uz/taqdimot-ai/" }) });
  assert.equal(first.response.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.mode, "checkout");
  assert.equal(first.body.provider, "payme");
  const orderId = String(first.body.orderId);
  assert.deepEqual(paymeParams(String(first.body.checkoutUrl)), {
    m: PAYME_DESK, "ac.order_id": orderId, a: "3990000", c: "https://gptbot.uz/uz/taqdimot-ai/?pay=return", l: "uz", ct: "15000",
  });
  const [cookie] = first.response.headers.getSetCookie();
  assert.match(cookie, new RegExp(`^${STUDIO_ACCOUNT_COOKIE}=[0-9a-f]{64}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000$`));
  const row = (await new StudioStore(db.asD1()).byId(orderId))!;
  assert.match(row.user_id, /^acct_studio_[0-9a-f]{32}$/);
  assert.deepEqual([row.plan, row.amount, row.provider, row.service_id, row.mode, row.terms_version, row.plan_version], ["oylik", 3_990_000, "payme", null, "live", EDITION, "studio-2026-11-v1"]);
  const consent = db.rows<Record<string, unknown>>("SELECT user_id, version, url, locale FROM gpt_payment_consents WHERE order_id=?", orderId)[0];
  assert.deepEqual({ ...consent }, { user_id: row.user_id, version: EDITION, url: TERMS_UZ, locale: "uz" });
  assert.deepEqual(journal(db, orderId), [{ actor: "account", method: "studio_checkout", from_state: null, to_state: "pending" }]);
  // The studio's own buckets; the chat's guest buckets untouched.
  const buckets = db.rows<{ action: string }>("SELECT DISTINCT action FROM gpt_rate_limits ORDER BY action").map((r) => r.action);
  assert.deepEqual(buckets, ["studio_account", "studio_account_global", "studio_checkout"]);
  assert.equal(calls.length, 2);
});

test("with the account cookie: no Turnstile, the same request id is the same order, another tariff while one is open is order_open", async (context) => {
  const calls = siteverify(context, PASS_BY_TOKEN);
  const db = await paidDatabase();
  const env = paidEnv(db);
  const bid = await bidCookie(Date.now());
  const body = order({ plan: "kunlik", locale: "ru" });
  const first = await post(env, { cookie: bid, body });
  const account = setCookies(first.response)[0];
  assert.match(account, new RegExp(`^${STUDIO_ACCOUNT_COOKIE}=`));
  const turnstileCalls = calls.length;
  const again = await post(env, { cookie: `${bid}; ${account}`, body: { ...body, turnstileToken: undefined } });
  assert.equal(again.response.status, 200);
  assert.equal(again.body.orderId, first.body.orderId);
  assert.deepEqual(paymeParams(String(again.body.checkoutUrl)).c, "https://gptbot.uz/ru/prezentatsiya-ai/?pay=return");
  assert.equal(setCookies(again.response).length, 0);
  // Same tariff, new request: the same open invoice.
  const same = await post(env, { cookie: account, body: order({ plan: "kunlik", turnstileToken: undefined }) });
  assert.equal(same.body.orderId, first.body.orderId);
  const other = await post(env, { cookie: account, body: order({ plan: "oylik", turnstileToken: undefined }) });
  assert.equal(other.response.status, 409);
  assert.deepEqual([other.body.code, other.body.orderId], ["order_open", first.body.orderId]);
  assert.equal(calls.length, turnstileCalls);
  // The buyer closes it and orders the other tariff.
  const closed = await call(cancelEndpoint, checkoutRequest({ cookie: account, body: { orderId: first.body.orderId } }, "/api/studio/order/cancel"), env);
  assert.equal(closed.status, 200);
  assert.deepEqual(await closed.json(), { ok: true, orderId: first.body.orderId });
  const next = await post(env, { cookie: account, body: order({ plan: "oylik", turnstileToken: undefined }) });
  assert.equal(next.response.status, 200);
  assert.notEqual(next.body.orderId, first.body.orderId);
  assert.equal(count(db, "SELECT COUNT(*) FROM gpt_accounts"), 1);
});

test("a paid or provider-held order answers its status, not a new payment page", async (context) => {
  siteverify(context, PASS_BY_TOKEN);
  const db = await paidDatabase();
  const env = paidEnv(db);
  const body = order();
  const first = await post(env, { cookie: await bidCookie(Date.now()), body });
  const account = setCookies(first.response)[0];
  const store = new StudioStore(db.asD1());
  await store.prepare(String(first.body.orderId), { externalId: "6f00a1b2c3d4e5f6a7b8c9d0", providerTime: Date.now(), method: "payme_create" });
  const held = await post(env, { cookie: account, body: { ...body, turnstileToken: undefined } });
  assert.deepEqual(held.body, { ok: true, mode: "status", orderId: first.body.orderId });
  await store.markPaid(String(first.body.orderId), { method: "payme_perform" });
  const paid = await post(env, { cookie: account, body: { ...body, turnstileToken: undefined } });
  assert.deepEqual(paid.body, { ok: true, mode: "status", orderId: first.body.orderId });
});

test("the studio's own pace: 5 new accounts an hour per address, 10 checkouts an hour per account; a D1 failure refuses", async (context) => {
  siteverify(context, PASS_BY_TOKEN);
  const db = await paidDatabase();
  const env = paidEnv(db);
  for (let n = 0; n < 5; n++) {
    const made = await post(env, { cookie: await bidCookie(Date.now()), ip: "198.51.100.20" });
    assert.equal(made.response.status, 200, `account ${n + 1}`);
  }
  const sixth = await post(env, { cookie: await bidCookie(Date.now()), ip: "198.51.100.20" });
  assert.equal(sixth.response.status, 429);
  assert.equal(sixth.body.code, "rate_limited");
  assert.ok(Number(sixth.response.headers.get("retry-after")) > 0);
  assert.equal(setCookies(sixth.response).length, 0);
  // Another address may still open one.
  assert.equal((await post(env, { cookie: await bidCookie(Date.now()), ip: "198.51.100.21" })).response.status, 200);
  // Ten checkouts an hour per account (a retry of a lost answer counts too).
  const first = await post(env, { cookie: await bidCookie(Date.now()), ip: "198.51.100.30" });
  const account = setCookies(first.response)[0];
  for (let n = 1; n < 10; n++) assert.equal((await post(env, { cookie: account, body: order({ turnstileToken: undefined }) })).response.status, 200, `checkout ${n + 1}`);
  const eleventh = await post(env, { cookie: account, body: order({ turnstileToken: undefined }) });
  assert.equal(eleventh.response.status, 429);
  // The chat's guest-account buckets are never used by the studio.
  assert.equal(count(db, "SELECT COUNT(*) FROM gpt_rate_limits WHERE action LIKE 'guest_account%'"), 0);
  // The rate-limit table failing is a refusal, never a free pass.
  const d1 = db.asD1();
  const broken = {
    prepare: (sql: string) => {
      if (/gpt_rate_limits/.test(sql)) throw new Error("D1 down");
      return d1.prepare(sql);
    },
    batch: d1.batch.bind(d1),
  } as unknown as D1Database;
  const refused = await post({ ...env, GPTBOT_DRAFTS_DB: broken }, { cookie: await bidCookie(Date.now()), ip: "198.51.100.40" });
  assert.equal(refused.response.status, 503);
  assert.equal(refused.body.code, "studio_busy");
});

test("the order keeps where the buyer came from: the last paid touch, else the first; GA and Metrika ids; nothing malformed", async (context) => {
  siteverify(context, PASS_BY_TOKEN);
  const db = await paidDatabase();
  const env = paidEnv(db);
  const made = await post(env, {
    cookie: await bidCookie(Date.now()),
    body: order({
      attribution: {
        last: { gclid: "Cj0KCQjw-abc_DEF.1", utm_source: "google", utm_medium: "cpc", utm_campaign: "studio uz", landing: "/uz/taqdimot-ai/?gclid=x", at: "2026-10-14T09:00:00.000Z", fbclid: "IwAR0" },
        first: { landing: "/uz/", referrerHost: "Google.COM", firstSeenAt: "2026-10-01T08:00:00.000Z", gclid: "first-click", yclid: "bad id with spaces", fbclid: "IwAR1" },
      },
      ga: { clientId: "1234567890.1760000000", sessionId: "1760430000" },
      ym: { clientId: "<script>" },
    }),
  });
  const row = db.rows<Record<string, unknown>>(
    "SELECT touch, gclid, gbraid, wbraid, yclid, utm_source, utm_medium, utm_campaign, utm_term, landing_path, referrer_host, first_seen_at, ga_client_id, ga_session_id, ym_client_id FROM studio_orders_v2 WHERE id=?",
    made.body.orderId,
  )[0];
  assert.deepEqual({ ...row }, {
    touch: "last", gclid: "Cj0KCQjw-abc_DEF.1", gbraid: null, wbraid: null, yclid: null, utm_source: "google", utm_medium: "cpc",
    utm_campaign: "studio uz", utm_term: null, landing_path: "/uz/taqdimot-ai/", referrer_host: "google.com",
    first_seen_at: "2026-10-01T08:00:00.000Z", ga_client_id: "1234567890.1760000000", ga_session_id: "1760430000", ym_client_id: null,
  });
  const columns = db.rows<{ name: string }>("PRAGMA table_info('studio_orders_v2')").map((c) => c.name);
  assert.ok(!columns.some((name) => /fbclid/.test(name)));
  // An organic visit: the first touch's landing, no tags.
  const organic = await post(env, { cookie: await bidCookie(Date.now()), ip: "203.0.113.99", body: order({ attribution: { first: { landing: "/ru/prezentatsiya-ai/", firstSeenAt: "2026-10-02T08:00:00.000Z" } } }) });
  const plain = db.rows<Record<string, unknown>>("SELECT touch, gclid, utm_source, landing_path, first_seen_at FROM studio_orders_v2 WHERE id=?", organic.body.orderId)[0];
  assert.deepEqual({ ...plain }, { touch: null, gclid: null, utm_source: null, landing_path: "/ru/prezentatsiya-ai/", first_seen_at: "2026-10-02T08:00:00.000Z" });
});

test("a local rehearsal (STUDIO_PAYMENTS=test on localhost): a test order through the cash desk's test mode, no payment page", async (context) => {
  siteverify(context, (token) => (token === "XXXX.DUMMY.TOKEN.XXXX" ? { success: true, action: "", hostname: "example.com" } : { success: false }));
  const db = await paidDatabase();
  const env = paidEnv(db, {
    STUDIO_LOCAL_DEV: "true",
    STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAYMENTS: "test" }),
    STUDIO_TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    GPT_BILLING_MODE_PAYME: "test",
  });
  const made = await post(env, { host: "http://localhost:8788", cookie: await bidCookie(Date.now()), body: order({ turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }) });
  assert.equal(made.response.status, 200, JSON.stringify(made.body));
  assert.deepEqual({ ...made.body, orderId: "x" }, { ok: true, mode: "test", orderId: "x", amount: 590_000, provider: "payme" });
  assert.equal((await new StudioStore(db.asD1()).byId(String(made.body.orderId)))?.mode, "test");
});

test("Click (variant B) when it sells: an order of the studio's service and Click's page for its amount", async (context) => {
  siteverify(context, PASS_BY_TOKEN);
  const db = await paidDatabase();
  const env = paidEnv(db, {
    STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAYMENT_PROVIDERS: "payme,click", STUDIO_CLICK_AMOUNTS_CONFIRMED: "true" }),
    STUDIO_CLICK_CREDENTIALS_JSON: CLICK_CREDENTIALS,
  });
  const made = await post(env, { cookie: await bidCookie(Date.now()), body: order({ provider: "click" }) });
  assert.equal(made.body.provider, "click");
  const url = new URL(String(made.body.checkoutUrl));
  assert.equal(url.searchParams.get("amount"), "5900.00");
  assert.equal(url.searchParams.get("transaction_param"), made.body.orderId);
  assert.equal((await new StudioStore(db.asD1()).byId(String(made.body.orderId)))?.service_id, "107999");
});

// ── POST /api/studio/order/cancel ───────────────────────────────────────────

test("order/cancel: only the account's own pending order; no cookie answers before D1; a held order is in_progress", async (context) => {
  siteverify(context, PASS_BY_TOKEN);
  const db = await paidDatabase();
  const env = paidEnv(db);
  const first = await post(env, { cookie: await bidCookie(Date.now()) });
  const account = setCookies(first.response)[0];
  const other = await post(env, { cookie: await bidCookie(Date.now()), ip: "203.0.113.50" });
  const otherAccount = setCookies(other.response)[0];
  const cancel = (cookie: string | undefined, orderId: unknown, extra: Partial<CheckoutCall> = {}, envOverride = env) =>
    call(cancelEndpoint, checkoutRequest({ cookie, body: { orderId }, ...extra }, "/api/studio/order/cancel"), envOverride);
  const throwing = new Proxy({}, { get: () => { throw new Error("D1 touched"); } });
  assert.equal((await cancel(undefined, first.body.orderId, {}, { ...env, GPTBOT_DRAFTS_DB: throwing })).status, 404);
  assert.equal((await cancel(account, "pay_0123", {})).status, 400);
  assert.equal((await cancel(account, first.body.orderId, { origin: "https://evil.example" })).status, 400);
  assert.equal((await cancel(otherAccount, first.body.orderId)).status, 404);
  await new StudioStore(db.asD1()).prepare(String(other.body.orderId), { externalId: "6f00a1b2c3d4e5f6a7b8c9d0", providerTime: Date.now(), method: "payme_create" });
  const held = await cancel(otherAccount, other.body.orderId);
  assert.equal(held.status, 409);
  assert.equal(((await held.json()) as { code: string }).code, "in_progress");
  assert.equal((await cancel(account, first.body.orderId)).status, 200);
  // Closed while the paid service is off: the route is not there.
  const off = { ...env, STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAID_SERVICE: "off" }) };
  assert.equal((await cancel(account, first.body.orderId, {}, off)).status, 404);
});

// ── /config ─────────────────────────────────────────────────────────────────

test("/config names the providers that sell now (never a secret); none while the paid service or the full deck is off", async () => {
  const get = async (env: Record<string, unknown>) => {
    const response = await call(configEndpoint, new Request("https://gptbot.uz/api/studio/config"), env);
    return (await response.json()) as { payments: { mode: string | null; providers: string[] }; plans: Array<{ id: string; amountTiyin: number }>; termsVersion: string | null; terms: { ru: string | null; uz: string | null } };
  };
  const live = await get(paidEnv(null));
  assert.deepEqual(live.payments, { mode: "live", providers: ["payme"] });
  assert.deepEqual(live.plans.map((plan) => [plan.id, plan.amountTiyin]), [["kunlik", 590_000], ["oylik", 3_990_000]]);
  assert.equal(live.termsVersion, EDITION);
  assert.deepEqual(live.terms, { ru: TERMS_RU, uz: TERMS_UZ });
  const text = JSON.stringify(live);
  for (const secret of [String(paidEnv(null).GPT_PAYME_KEY), String(paidEnv(null).GPT_IDENTITY_SECRET), PAYME_DESK]) assert.ok(!text.includes(secret));
  assert.deepEqual((await get({ ...paidEnv(null), STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_FULL_DECK: "false" }) })).payments, { mode: "live", providers: [] });
  assert.deepEqual((await get({ ...paidEnv(null), STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAID_SERVICE: "off" }) })).payments, { mode: "live", providers: [] });
  assert.deepEqual((await get({ ...paidEnv(null), STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAYMENTS: "off" }) })).payments, { mode: null, providers: [] });
  assert.deepEqual((await get({ ...paidEnv(null), GPT_BILLING_MODE_PAYME: "test" })).payments, { mode: "live", providers: [] });
});

test("an hour's checkouts leave one pending order per buyer and every order journaled once", async (context) => {
  siteverify(context, PASS_BY_TOKEN);
  const db = await paidDatabase();
  const env = paidEnv(db);
  const first = await post(env, { cookie: await bidCookie(Date.now()) });
  const account = setCookies(first.response)[0];
  await Promise.all(["kunlik", "oylik", "kunlik"].map((plan) => post(env, { cookie: account, body: order({ plan, turnstileToken: undefined }) })));
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_orders_v2 WHERE state='pending'"), 1);
  for (const { id } of db.rows<{ id: string }>("SELECT id FROM studio_orders_v2"))
    assert.equal(journal(db, id).filter((row) => row.to_state === "pending").length, 1);
  assert.ok(count(db, "SELECT COUNT(*) FROM gpt_payment_consents WHERE org_id=?", STUDIO_ORG) >= 1);
  assert.ok(HOUR > 0);
  assert.ok(NOW > 0);
});

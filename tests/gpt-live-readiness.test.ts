// Live readiness of the AI pack's payments (plan WP-13): liveReadiness()
// names every missing setting and only names it, per-provider modes and the
// provider allowlist, the committed (inert) configuration, VAT included in
// the price, the product name and the guest JSON path.
// Run: node --import tsx --test tests/gpt-live-readiness.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { billingFixture, liveSettings } from "./helpers/gpt-billing-fixture";
import {
  billingActive,
  liveReadiness,
  offeredProviders,
  PLAN_ID,
  PRICE_TIYIN,
  providerMode,
  providerReady,
  type BillingEnv,
  type LocalProvider,
} from "../functions/lib/gpt-chat/billing-config";
import { fiscalIssues, fiscalParams, includedVat } from "../functions/lib/gpt-chat/fiscal-config";
import {
  UZUM_PAYMENT_DETAILS,
  UZUM_PRODUCT_ID,
  UZUM_PRODUCT_TITLE,
} from "../functions/lib/gpt-chat/uzum-checkout";
import { CLICK_RECEIPT_NAME } from "../functions/lib/gpt-chat/click-merchant";
import { inspectBilling } from "../functions/lib/gpt-chat/billing-operations-store";
import { RUNTIME_CONFIG_KEYS, hydrateRuntimeConfig } from "../functions/lib/runtime-config";
import { onRequestGet as account } from "../functions/api/gpt/account";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { onRequestPost as chat } from "../functions/api/gpt/chat";
import { onRequestPost as click } from "../functions/api/payments/click";
import { onRequestPost as payme } from "../functions/api/payments/payme";
import { onRequestPost as uzumCallback } from "../functions/api/payments/uzum";
import { SqliteD1 } from "./helpers/sqlite-d1";

const ROOT = path.resolve(import.meta.dirname, "..");
const hex = (bytes: number) => randomBytes(bytes).toString("hex");
/** Every secret below starts with this, so a leaked value is easy to find. */
const MARK = "SECRETMARK";
const marked = () => `${MARK}${hex(16)}`;
/** A setting name, a field inside a JSON secret, or the one code-level gap. */
const NAME = /^(?:[A-Z][A-Z0-9_]*(?:\.[a-z][A-Za-z_]*){0,3}|payme_receipt_detail)$/;

/** A configuration in which Click and Uzum Checkout may both sell live. */
function liveEnv(extra: Partial<BillingEnv> = {}): BillingEnv {
  return {
    ...liveSettings(),
    GPTBOT_DRAFTS_DB: {} as D1Database,
    GPT_BILLING_MODE: "live",
    GPT_BILLING_TERMS_RU: "https://gptbot.uz/ru/oferta/",
    GPT_BILLING_TERMS_UZ: "https://gptbot.uz/uz/oferta/",
    GPT_BILLING_TERMS_VERSION: "ai-paket-2026-10-v1",
    GPT_NOTIFY_BOT_TOKEN: marked(),
    GPT_HASH_SALT: marked(),
    GPT_IDENTITY_SECRET: marked(),
    GPT_BILLING_MAINTENANCE_SECRET: marked(),
    GPT_TELEGRAM_CLIENT_ID: "1234567",
    GPT_TELEGRAM_CLIENT_SECRET: marked(),
    GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({
      live: { service_id: 41001, merchant_id: 32002, secret_key: marked(), merchant_user_id: 50003 },
    }),
    UZUM_API: "checkout",
    UZUM_AUTOFISCAL: "true",
    UZUM_CHECKOUT_BASE_URL: "https://checkout.uzumbank.uz",
    UZUM_CREDENTIALS_JSON: JSON.stringify({
      checkout: { live: { terminalId: randomUUID(), apiKey: marked() } },
    }),
    ...extra,
  } as BillingEnv;
}

test("a complete configuration is live-ready for Click and Uzum, and offered to everyone", () => {
  const env = liveEnv();
  assert.deepEqual(liveReadiness(env, "click"), []);
  assert.deepEqual(liveReadiness(env, "uzum"), []);
  assert.equal(providerReady(env, "click"), true);
  assert.equal(providerReady(env, "uzum"), true);
  assert.deepEqual(offeredProviders(env, "live"), ["click", "uzum"]);
  // Nothing is in test, so a rehearsal context is offered nothing.
  assert.deepEqual(offeredProviders(env, "test"), []);
});

test("every missing or invalid setting blocks live and is reported alone, by name", () => {
  const future = new Date(Date.now() + 3 * 86400_000).toISOString();
  const cases: Array<[LocalProvider, Partial<BillingEnv>, string]> = [
    ["click", { GPT_PAYMENT_PROVIDERS: "uzum" }, "GPT_PAYMENT_PROVIDERS"],
    ["click", { GPT_BILLING_MODE_CLICK: "test" }, "GPT_BILLING_MODE_CLICK"],
    ["click", { GPT_BILLING_MODE: "" }, "GPT_BILLING_MODE_CLICK"],
    ["click", { GPT_BILLING_LIVE_READY: "false" }, "GPT_BILLING_LIVE_READY"],
    ["click", { GPT_BILLING_TERMS_RU: "https://evil.example/oferta/" }, "GPT_BILLING_TERMS_RU"],
    ["click", { GPT_BILLING_TERMS_UZ: undefined }, "GPT_BILLING_TERMS_UZ"],
    ["click", { GPT_BILLING_TERMS_VERSION: "two words" }, "GPT_BILLING_TERMS_VERSION"],
    ["click", { GPT_BILLING_TERMS_APPROVED_AT: "" }, "GPT_BILLING_TERMS_APPROVED_AT"],
    ["click", { GPT_BILLING_TERMS_APPROVED_AT: "2026-02-30" }, "GPT_BILLING_TERMS_APPROVED_AT"],
    ["click", { GPT_BILLING_TERMS_APPROVED_AT: future.slice(0, 10) }, "GPT_BILLING_TERMS_APPROVED_AT"],
    ["click", { GPT_CLICK_CREDENTIALS_JSON: "{broken" }, "GPT_CLICK_CREDENTIALS_JSON"],
    ["click", { GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ test: {} }) }, "GPT_CLICK_CREDENTIALS_JSON.live"],
    ...(["service_id", "merchant_id", "secret_key", "merchant_user_id"] as const).map(
      (field): [LocalProvider, Partial<BillingEnv>, string] => {
        const live: Record<string, unknown> = { service_id: 41001, merchant_id: 32002, secret_key: marked(), merchant_user_id: 50003 };
        delete live[field];
        return ["click", { GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ live }) }, `GPT_CLICK_CREDENTIALS_JSON.live.${field}`];
      },
    ),
    ["click", { GPT_FISCAL_IKPU: "1030500800200000" }, "GPT_FISCAL_IKPU"],
    ["click", { GPT_FISCAL_PACKAGE_CODE: "" }, "GPT_FISCAL_PACKAGE_CODE"],
    ["click", { GPT_FISCAL_VAT_PERCENT: "112" }, "GPT_FISCAL_VAT_PERCENT"],
    ["click", { GPT_FISCAL_VAT_PERCENT: "" }, "GPT_FISCAL_VAT_PERCENT"],
    ["click", { GPT_FISCAL_TIN: "31061834" }, "GPT_FISCAL_TIN"],
    ["click", { GPTBOT_DRAFTS_DB: undefined }, "GPTBOT_DRAFTS_DB"],
    ["click", { GPT_NOTIFY_BOT_TOKEN: undefined }, "GPT_NOTIFY_BOT_TOKEN"],
    ["click", { GPT_NOTIFY_CHAT_ID: undefined }, "GPT_NOTIFY_CHAT_ID"],
    ["click", { GPT_ALERTS_ENABLED: "false" }, "GPT_ALERTS_ENABLED"],
    ["click", { GPT_HASH_SALT: hex(8) }, "GPT_HASH_SALT"],
    ["click", { GPT_HASH_SALT_SINCE: future.replace(/\.\d{3}Z$/, "Z") }, "GPT_HASH_SALT_SINCE"],
    ["click", { GPT_HASH_SALT_SINCE: "" }, "GPT_HASH_SALT_SINCE"],
    ["click", { GPT_IDENTITY_SECRET: hex(8) }, "GPT_IDENTITY_SECRET"],
    ["click", { GPT_BILLING_MAINTENANCE_SECRET: undefined }, "GPT_BILLING_MAINTENANCE_SECRET"],
    ["click", { GPT_TELEGRAM_CLIENT_ID: undefined }, "GPT_TELEGRAM_CLIENT_ID"],
    ["click", { GPT_TELEGRAM_CLIENT_SECRET: "" }, "GPT_TELEGRAM_CLIENT_SECRET"],
    // Uzum Checkout: credentials, the production base URL, auto-fiscalization.
    ["uzum", { GPT_BILLING_MODE_UZUM: "off" }, "GPT_BILLING_MODE_UZUM"],
    ["uzum", { UZUM_API: "" }, "UZUM_API"],
    ["uzum", { UZUM_CREDENTIALS_JSON: JSON.stringify({ checkout: { test: { terminalId: randomUUID(), apiKey: marked() } } }) }, "UZUM_CREDENTIALS_JSON.checkout.live"],
    ["uzum", { UZUM_CHECKOUT_BASE_URL: "https://evil.example" }, "UZUM_CHECKOUT_BASE_URL"],
    ["uzum", { UZUM_AUTOFISCAL: "false" }, "UZUM_AUTOFISCAL"],
    ["uzum", { GPT_FISCAL_IKPU: "" }, "GPT_FISCAL_IKPU"],
    // The Uzum receipt does not carry the seller's TIN: it is not required there.
    ["uzum", { GPT_FISCAL_TIN: "", GPT_IDENTITY_SECRET: "" }, "GPT_IDENTITY_SECRET"],
    // Merchant API: credentials and the Fiscalization API key.
    ["uzum", { UZUM_API: "merchant", UZUM_CREDENTIALS_JSON: JSON.stringify({ fiscal: { live: { apiKey: marked() } } }) }, "UZUM_CREDENTIALS_JSON.merchant.live"],
    ["uzum", { UZUM_API: "merchant", UZUM_CREDENTIALS_JSON: JSON.stringify({ merchant: { live: { serviceId: 77, login: "fixture", password: marked() } } }) }, "UZUM_CREDENTIALS_JSON.fiscal.live.apiKey"],
  ];
  const outputs: string[][] = [];
  for (const [provider, change, name] of cases) {
    const env = liveEnv(change);
    const missing = liveReadiness(env, provider);
    outputs.push(missing);
    assert.deepEqual(missing, [name], `${provider} ${JSON.stringify(Object.keys(change))}`);
    assert.equal(providerReady(env, provider), false, name);
    assert.ok(!offeredProviders(env, "live").includes(provider), name);
  }
  // A configuration with nothing at all names everything, and only names.
  for (const provider of ["click", "uzum", "payme"] as const) outputs.push(liveReadiness({} as BillingEnv, provider));
  const all = outputs.flat();
  assert.ok(all.every((name) => NAME.test(name)), all.find((name) => !NAME.test(name)));
  assert.ok(!JSON.stringify(outputs).includes(MARK), "a secret value leaked into the output");
  assert.deepEqual(liveReadiness({} as BillingEnv, "click").slice(0, 8), [
    "GPT_BILLING_MODE_CLICK",
    "GPT_BILLING_LIVE_READY",
    "GPT_BILLING_TERMS_RU",
    "GPT_BILLING_TERMS_UZ",
    "GPT_BILLING_TERMS_VERSION",
    "GPT_BILLING_TERMS_APPROVED_AT",
    "GPT_CLICK_CREDENTIALS_JSON",
    "GPT_FISCAL_IKPU",
  ]);
});

test("Click credentials: one secret, the legacy variables only while it is unset", () => {
  const legacy = {
    GPT_CLICK_CREDENTIALS_JSON: undefined,
    GPT_CLICK_SERVICE_ID: "41001",
    GPT_CLICK_MERCHANT_ID: "32002",
    GPT_CLICK_SECRET: marked(),
  };
  // The legacy variables never carry the Merchant API user (receipts).
  assert.deepEqual(liveReadiness(liveEnv(legacy), "click"), ["GPT_CLICK_CREDENTIALS_JSON.live.merchant_user_id"]);
  assert.deepEqual(liveReadiness(liveEnv({ ...legacy, GPT_CLICK_SECRET: undefined }), "click"), ["GPT_CLICK_CREDENTIALS_JSON"]);
  // A set secret wins, even when it lacks what the legacy variables have.
  assert.deepEqual(
    liveReadiness(liveEnv({ ...legacy, GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ test: {} }) }), "click"),
    ["GPT_CLICK_CREDENTIALS_JSON.live"],
  );
});

test("modes per provider over the global one; the allowlist keeps Payme off and test-only", () => {
  const env = (extra: Partial<BillingEnv>) => extra as BillingEnv;
  assert.equal(providerMode(env({}), "click"), null);
  assert.equal(billingActive(env({})), false);
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "live" }), "click"), "live");
  const mixed = env({ GPT_BILLING_MODE_CLICK: "live", GPT_BILLING_MODE_UZUM: "test" });
  assert.equal(providerMode(mixed, "click"), "live");
  assert.equal(providerMode(mixed, "uzum"), "test");
  assert.equal(billingActive(mixed), true);
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "live", GPT_BILLING_MODE_UZUM: "off" }), "uzum"), null);
  // A typo is "off", never a fallback to the global mode.
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "live", GPT_BILLING_MODE_CLICK: "LIVE" }), "click"), null);
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "live", GPT_PAYMENT_PROVIDERS: "uzum" }), "click"), null);
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "test", GPT_PAYMENT_PROVIDERS: "" }), "uzum"), null);
  // Payme has only the global mode and runs only when listed.
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "test" }), "payme"), null);
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "test", GPT_PAYMENT_PROVIDERS: " click , payme " }), "payme"), "test");
  const payme = liveEnv({ GPT_PAYMENT_PROVIDERS: "click,uzum,payme", GPT_PAYME_KEY: marked(), GPT_PAYME_MERCHANT_ID: "1" });
  assert.deepEqual(liveReadiness(payme, "payme"), ["payme_receipt_detail"]);
  assert.equal(providerReady(payme, "payme"), false);
});

test("the committed configuration is inert: no provider runs, credentials are never public config", async () => {
  const source = fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8");
  const packed = JSON.parse(/GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(source)![1]) as Record<string, string>;
  const env = hydrateRuntimeConfig({ GPTBOT_RUNTIME_CONFIG_JSON: JSON.stringify(packed) }) as unknown as BillingEnv;
  assert.equal(packed.GPT_PAYMENT_PROVIDERS, "click,uzum");
  for (const key of ["GPT_BILLING_MODE", "GPT_BILLING_MODE_CLICK", "GPT_BILLING_MODE_UZUM"]) assert.equal(packed[key], "", key);
  assert.equal(packed.GPT_BILLING_LIVE_READY, "false");
  assert.equal(billingActive(env), false);
  for (const provider of ["click", "uzum", "payme"] as const) {
    assert.equal(providerMode(env, provider), null);
    assert.equal(providerReady(env, provider), false);
  }
  // The owner's fiscal decision of 2026-10-01: complete, VAT 12 % included.
  assert.deepEqual(fiscalIssues(env, { tin: true }), []);
  assert.deepEqual(fiscalParams(env), { ikpu: "10305008002000000", packageCode: "1514296", vatPercent: 12 });
  for (const secret of ["GPT_CLICK_CREDENTIALS_JSON", "UZUM_CREDENTIALS_JSON", "GPT_IDENTITY_SECRET", "GPT_HASH_SALT", "GPT_BILLING_MAINTENANCE_SECRET", "GPT_CLICK_SECRET", "GPT_PAYME_KEY"]) {
    assert.ok(!(RUNTIME_CONFIG_KEYS as readonly string[]).includes(secret), secret);
    assert.doesNotMatch(source, new RegExp(`^\\s*${secret}\\s*=`, "mu"), secret);
  }
  // The legacy Uzum fiscal names are gone: one source for every receipt.
  assert.ok(!Object.keys(packed).some((key) => key.startsWith("UZUM_FISCAL_")));
  // Every payment route is a missing route, before any D1 access.
  const bomb = { prepare() { throw new Error("DB touched"); }, batch() { throw new Error("DB touched"); } };
  const post = (handler: typeof click, url: string) =>
    handler({
      request: new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
      env: { ...env, GPTBOT_DRAFTS_DB: bomb },
      params: {},
      waitUntil() {},
    } as unknown as Parameters<typeof click>[0]);
  for (const [handler, url] of [
    [click, "https://gptbot.uz/api/payments/click"],
    [payme, "https://gptbot.uz/api/payments/payme"],
    [uzumCallback, "https://gptbot.uz/api/payments/uzum"],
  ] as Array<[typeof click, string]>)
    assert.equal((await post(handler, url)).status, 404, url);
  const view = (await (
    await account({ request: new Request("https://gptbot.uz/api/gpt/account"), env: { ...env, GPTBOT_DRAFTS_DB: bomb } } as unknown as Parameters<typeof account>[0])
  ).json()) as { providers: unknown[]; mode: unknown; pack: unknown };
  assert.deepEqual(view.providers, []);
  assert.equal(view.mode, null);
  assert.deepEqual(view.pack, {
    priceUzs: 20000,
    messageLimit: 300,
    dailyLimit: 50,
    months: 1,
    vat: { percent: 12, includedTiyin: 214286 },
  });
});

test("VAT is included in the price, rounded half up", () => {
  assert.equal(includedVat(PRICE_TIYIN, 12), 214286);
  assert.equal(includedVat(PRICE_TIYIN, 0), 0);
  assert.equal(PRICE_TIYIN - includedVat(PRICE_TIYIN, 12), 1785714);
  assert.equal(fiscalParams({ GPT_FISCAL_IKPU: "10305008002000000", GPT_FISCAL_PACKAGE_CODE: "1514296" }), null);
});

test("the product is the AI pack: no GPT, Plus, Pro or subscription in its names", () => {
  const names = [PLAN_ID, UZUM_PRODUCT_TITLE, UZUM_PRODUCT_ID, UZUM_PAYMENT_DETAILS.replace("gptbot.uz", ""), CLICK_RECEIPT_NAME];
  assert.equal(PLAN_ID, "ai_paket");
  for (const name of names) assert.doesNotMatch(name, /gpt|chatgpt|plus|\bpro\b|obuna|подписк/i, name);
});

test("a live-ready Click checkout: Click's page with the return marker; Payme is never sold live", async () => {
  const f = await billingFixture();
  Object.assign(f.env, liveEnv({ GPTBOT_DRAFTS_DB: f.binding, GPT_IDENTITY_SECRET: f.env.GPT_IDENTITY_SECRET, GPT_PAYMENT_PROVIDERS: "click,uzum,payme", GPT_PAYME_KEY: marked() }));
  const buy = (provider: string, cookie = f.cookie, locale = "uz") =>
    subscribe(f.ctx(new Request("https://gptbot.uz/api/gpt/subscribe", {
      method: "POST",
      headers: { cookie, Origin: "https://gptbot.uz", "Content-Type": "application/json" },
      body: JSON.stringify({ provider, requestId: randomUUID(), locale, acceptTerms: true, termsVersion: f.env.GPT_BILLING_TERMS_VERSION }),
    })));
  const response = await buy("click");
  const body = (await response.json()) as { mode: string; checkoutUrl: string; attemptId: string };
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.mode, "checkout");
  const url = new URL(body.checkoutUrl);
  assert.equal(url.origin + url.pathname, "https://my.click.uz/services/pay/");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    service_id: "41001",
    merchant_id: "32002",
    amount: "20000.00",
    transaction_param: body.attemptId,
    return_url: "https://gptbot.uz/uz/gpt-uzbek-tilida/?pay=return",
  });
  assert.equal((await buy("payme")).status, 404);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders WHERE provider='payme'"), 0);
  // The live view offers Click and Uzum, never Payme.
  const view = (await (await account(f.ctx(new Request("https://gptbot.uz/api/gpt/account", { headers: { cookie: f.cookie } })))).json()) as { providers: string[]; mode: string };
  assert.deepEqual(view.providers, ["click", "uzum"]);
  assert.equal(view.mode, "live");
  assert.ok(!JSON.stringify(view).includes(MARK));
  // The maintenance tick reports each provider's mode and missing names, no value.
  const { payments } = await inspectBilling(f.env);
  assert.deepEqual(payments, {
    click: { mode: "live", missing: [] },
    uzum: { mode: "live", missing: [] },
    payme: { mode: "live", missing: ["payme_receipt_detail"] },
  });
  f.env.GPT_BILLING_LIVE_READY = "false";
  f.env.GPT_BILLING_MODE_UZUM = "off";
  assert.deepEqual((await inspectBilling(f.env)).payments.uzum, {
    mode: null,
    missing: ["GPT_BILLING_MODE_UZUM", "GPT_BILLING_LIVE_READY"],
  });
  assert.ok(!JSON.stringify(await inspectBilling(f.env)).includes(MARK));
});

test("billing modes never move a guest's JSON turn: local quota whenever a provider runs", async () => {
  const run = async (extra: Record<string, string>) => {
    const db = new SqliteD1();
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(new URL(url).hostname);
      if (url.startsWith("https://railway.example"))
        return Response.json({ ok: true, answer: "railway", remaining: 3 });
      return Response.json({ choices: [{ message: { content: "Javob" }, finish_reason: "stop" }] });
    }) as typeof fetch;
    try {
      await chat({
        request: new Request("https://gptbot.uz/api/gpt/chat", { method: "POST", body: JSON.stringify({ message: "Salom" }) }),
        env: { GPTBOT_DRAFTS_DB: db.asD1(), OPENROUTER_API_KEY: hex(16), ...extra },
        waitUntil() {},
      } as unknown as Parameters<typeof chat>[0]);
    } finally {
      globalThis.fetch = original;
    }
    const local =
      db.value("SELECT COUNT(*) FROM sqlite_master WHERE name='gpt_turn_reservations'") === 1 &&
      db.value("SELECT COUNT(*) FROM gpt_turn_reservations") === 1;
    return { railway: calls.includes("railway.example"), local };
  };
  const railway = { RAILWAY_GPT_API_URL: "https://railway.example", GPTBOT_INTERNAL_API_SECRET: hex(16) };
  // Production today: no Railway. Every mode keeps the same local path.
  for (const modes of [{}, { GPT_BILLING_MODE_CLICK: "test" }, { GPT_BILLING_MODE: "live" }])
    assert.deepEqual(await run(modes), { railway: false, local: true }, JSON.stringify(modes));
  // With Railway: off goes there; any provider running, even by its own mode, stays local.
  assert.deepEqual(await run(railway), { railway: true, local: false });
  assert.deepEqual(await run({ ...railway, GPT_BILLING_MODE_CLICK: "live" }), { railway: false, local: true });
  assert.deepEqual(await run({ ...railway, GPT_BILLING_MODE_UZUM: "test" }), { railway: false, local: true });
});

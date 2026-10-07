// Live readiness of the AI pack's payments (plan WP-13): liveReadiness()
// names every missing setting and only names it, per-provider modes and the
// provider allowlist, the committed configuration (Click live, S2; Payme
// live since 2026-10-07), VAT included in the price, the product name and the
// guest JSON path.
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
import { clickSignature } from "../functions/lib/gpt-chat/payment-protocol";
import { inspectBilling } from "../functions/lib/gpt-chat/billing-operations-store";
import { RUNTIME_CONFIG_KEYS, hydrateRuntimeConfig } from "../functions/lib/runtime-config";
import { onRequestGet as account } from "../functions/api/gpt/account";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { onRequestPost as chat } from "../functions/api/gpt/chat";
import { onRequestPost as click } from "../functions/api/payments/click";
import { onRequestPost as payme } from "../functions/api/payments/payme";
import { onRequestPost as uzumCallback } from "../functions/api/payments/uzum";
import { onRequestPost as uzumMerchant } from "../functions/api/payments/uzum-merchant/[op]";
import { onRequestPost as botLoginStart } from "../functions/api/gpt/auth/bot/start";
import { onRequestPost as botLoginStatus } from "../functions/api/gpt/auth/bot/status";
import { onRequestPost as oidcStart } from "../functions/api/gpt/auth/start";
import { onRequestPost as uiEvent } from "../functions/api/gpt/event";
import { PACK_WINDOW_EVENTS, UI_EVENTS } from "../functions/lib/gpt-chat/ui-event-store";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { mintRehearsal, REHEARSAL_COOKIE } from "../functions/lib/gpt-chat/rehearsal";

const ROOT = path.resolve(import.meta.dirname, "..");
const hex = (bytes: number) => randomBytes(bytes).toString("hex");
/** Every secret below starts with this, so a leaked value is easy to find. */
const MARK = "SECRETMARK";
const marked = () => `${MARK}${hex(16)}`;
/** A setting name or a field inside a JSON secret. */
const NAME = /^[A-Z][A-Z0-9_]*(?:\.[a-z][A-Za-z_]*){0,3}$/;

/** A configuration in which Click and Uzum Checkout may both sell live. */
function liveEnv(extra: Partial<BillingEnv> = {}): BillingEnv {
  return {
    ...liveSettings(),
    GPTBOT_DRAFTS_DB: {} as D1Database,
    GPT_BILLING_MODE: "live",
    GPT_BILLING_TERMS_RU: "https://gptbot.uz/ru/oferta/",
    GPT_BILLING_TERMS_UZ: "https://gptbot.uz/uz/oferta/",
    GPT_BILLING_TERMS_VERSION: "ai-paket-2026-10-v2",
    GPT_NOTIFY_BOT_TOKEN: marked(),
    GPT_HASH_SALT: marked(),
    GPT_IDENTITY_SECRET: marked(),
    GPT_BILLING_MAINTENANCE_SECRET: marked(),
    // Sign-in through the bot (WP-16): its two secrets and its username.
    TELEGRAM_ASSISTANT_BOT_TOKEN: marked(),
    TELEGRAM_ASSISTANT_WEBHOOK_SECRET: marked(),
    GPT_HANDOFF_BOT_USERNAME: "gptbotuz_bot",
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
  // Uzum is live-ready in either flow: Checkout without auto-fiscalization
  // with the Fiscalization API key, and the Merchant API with it.
  const fiscal = { fiscal: { live: { apiKey: marked() } } };
  const cardByApi = liveEnv({
    UZUM_AUTOFISCAL: "false",
    UZUM_CREDENTIALS_JSON: JSON.stringify({ checkout: { live: { terminalId: randomUUID(), apiKey: marked() } }, ...fiscal }),
  });
  const app = liveEnv({
    UZUM_API: "merchant",
    UZUM_CREDENTIALS_JSON: JSON.stringify({ merchant: { live: { serviceId: 77, login: "fixture", password: marked() } }, ...fiscal }),
  });
  for (const ready of [cardByApi, app]) {
    assert.deepEqual(liveReadiness(ready, "uzum"), []);
    assert.deepEqual(offeredProviders(ready, "live"), ["click", "uzum"]);
  }
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
    // Alerts fall back to the bot's token; with OIDC for sign-in, nothing else is missing.
    ["click", { GPT_NOTIFY_BOT_TOKEN: undefined, TELEGRAM_ASSISTANT_BOT_TOKEN: undefined, GPT_TELEGRAM_CLIENT_ID: "1234567", GPT_TELEGRAM_CLIENT_SECRET: marked() }, "GPT_NOTIFY_BOT_TOKEN"],
    ["click", { GPT_NOTIFY_CHAT_ID: undefined }, "GPT_NOTIFY_CHAT_ID"],
    ["click", { GPT_ALERTS_ENABLED: "false" }, "GPT_ALERTS_ENABLED"],
    ["click", { GPT_HASH_SALT: hex(8) }, "GPT_HASH_SALT"],
    ["click", { GPT_HASH_SALT_SINCE: future.replace(/\.\d{3}Z$/, "Z") }, "GPT_HASH_SALT_SINCE"],
    ["click", { GPT_HASH_SALT_SINCE: "" }, "GPT_HASH_SALT_SINCE"],
    ["click", { GPT_IDENTITY_SECRET: hex(8) }, "GPT_IDENTITY_SECRET"],
    ["click", { GPT_BILLING_MAINTENANCE_SECRET: undefined }, "GPT_BILLING_MAINTENANCE_SECRET"],
    // A payer signs in through the bot; Telegram's OIDC is never required.
    ["click", { TELEGRAM_ASSISTANT_BOT_TOKEN: undefined }, "TELEGRAM_ASSISTANT_BOT_TOKEN"],
    ["click", { TELEGRAM_ASSISTANT_WEBHOOK_SECRET: "" }, "TELEGRAM_ASSISTANT_WEBHOOK_SECRET"],
    ["click", { GPT_HANDOFF_BOT_USERNAME: "@bot" }, "GPT_HANDOFF_BOT_USERNAME"],
    ["click", { GPT_BOT_LOGIN_MODE: "off" }, "GPT_BOT_LOGIN_MODE"],
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
    ["uzum", { UZUM_API: "merchant", UZUM_FISCAL_BASE_URL: "https://evil.example", UZUM_CREDENTIALS_JSON: JSON.stringify({ merchant: { live: { serviceId: 77, login: "fixture", password: marked() } }, fiscal: { live: { apiKey: marked() } } }) }, "UZUM_FISCAL_BASE_URL"],
    // Checkout without auto-fiscalization prints through the Fiscalization API instead.
    ["uzum", { UZUM_AUTOFISCAL: "false", UZUM_FISCAL_BASE_URL: "http://ofd-key.inplat-tech.com", UZUM_CREDENTIALS_JSON: JSON.stringify({ checkout: { live: { terminalId: randomUUID(), apiKey: marked() } }, fiscal: { live: { apiKey: marked() } } }) }, "UZUM_FISCAL_BASE_URL"],
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

test("sign-in: the bot is enough, Telegram's OIDC alone is enough, the code mode is valid", () => {
  const oidcOnly = liveEnv({
    TELEGRAM_ASSISTANT_BOT_TOKEN: undefined,
    GPT_TELEGRAM_CLIENT_ID: "1234567",
    GPT_TELEGRAM_CLIENT_SECRET: marked(),
  });
  assert.deepEqual(liveReadiness(oidcOnly, "click"), []);
  assert.deepEqual(liveReadiness(liveEnv({ GPT_BOT_LOGIN_MODE: "code" }), "click"), []);
  assert.deepEqual(liveReadiness(liveEnv({ GPT_BOT_LOGIN_MODE: "pick" }), "uzum"), []);
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

test("modes per provider over the global one; Payme runs only when listed and sells live only by its own switch", () => {
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
  // Payme runs only when listed; its own mode wins over the global one, which
  // stays its fallback as for Click and Uzum (decision L7).
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "test" }), "payme"), null);
  assert.equal(providerMode(env({ GPT_BILLING_MODE_PAYME: "test" }), "payme"), null);
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "test", GPT_PAYMENT_PROVIDERS: " click , payme " }), "payme"), "test");
  assert.equal(providerMode(env({ GPT_BILLING_MODE_PAYME: "test", GPT_PAYMENT_PROVIDERS: "click,uzum,payme" }), "payme"), "test");
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "live", GPT_BILLING_MODE_PAYME: "test", GPT_PAYMENT_PROVIDERS: "payme" }), "payme"), "test");
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "test", GPT_BILLING_MODE_PAYME: "off", GPT_PAYMENT_PROVIDERS: "payme" }), "payme"), null);
  assert.equal(providerMode(env({ GPT_BILLING_MODE: "test", GPT_BILLING_MODE_PAYME: "Test", GPT_PAYMENT_PROVIDERS: "payme" }), "payme"), null);
  // Payme's own mode moves neither Click nor Uzum.
  const paymeOnly = env({ GPT_PAYMENT_PROVIDERS: "click,uzum,payme", GPT_BILLING_MODE_PAYME: "test", GPT_BILLING_MODE_CLICK: "live" });
  assert.deepEqual([providerMode(paymeOnly, "click"), providerMode(paymeOnly, "uzum"), providerMode(paymeOnly, "payme")], ["live", null, "test"]);
  // Live: Payme sends the receipt detail itself (payme-checkout.ts), so what it
  // needs are its own switch, its production key, a cash desk id of Payme's
  // format (24 hex) and the fiscal codes; the global live mode alone is not enough.
  const merchant = hex(12);
  const payme = liveEnv({ GPT_PAYMENT_PROVIDERS: "click,uzum,payme", GPT_PAYME_KEY: marked(), GPT_PAYME_MERCHANT_ID: merchant });
  assert.equal(providerMode(payme, "payme"), "live");
  assert.deepEqual(liveReadiness(payme, "payme"), ["GPT_BILLING_MODE_PAYME"]);
  assert.equal(providerReady(payme, "payme"), false);
  const paymeLive = { ...payme, GPT_BILLING_MODE_PAYME: "live" } as BillingEnv;
  assert.deepEqual(liveReadiness(paymeLive, "payme"), []);
  assert.equal(providerReady(paymeLive, "payme"), true);
  assert.deepEqual(offeredProviders(paymeLive, "live"), ["click", "uzum", "payme"]);
  for (const [change, name] of [
    [{ GPT_BILLING_MODE_PAYME: "test" }, "GPT_BILLING_MODE_PAYME"],
    [{ GPT_PAYME_KEY: undefined }, "GPT_PAYME_KEY"],
    [{ GPT_PAYME_KEY: "short" }, "GPT_PAYME_KEY"],
    [{ GPT_PAYME_KEY: `${marked()} with spaces` }, "GPT_PAYME_KEY"],
    [{ GPT_PAYME_MERCHANT_ID: "1" }, "GPT_PAYME_MERCHANT_ID"],
    [{ GPT_PAYME_MERCHANT_ID: `${merchant}0` }, "GPT_PAYME_MERCHANT_ID"],
    [{ GPT_FISCAL_IKPU: "" }, "GPT_FISCAL_IKPU"],
    [{ GPT_FISCAL_VAT_PERCENT: "" }, "GPT_FISCAL_VAT_PERCENT"],
  ] as Array<[Partial<BillingEnv>, string]>) {
    const missing = liveReadiness({ ...paymeLive, ...change } as BillingEnv, "payme");
    assert.ok(missing.includes(name), `${name}: ${JSON.stringify(missing)}`);
    assert.ok(!JSON.stringify(missing).includes(MARK));
  }
  // The receipt's TIN is not Payme's question (the cash desk is the seller's own).
  assert.deepEqual(liveReadiness({ ...paymeLive, GPT_FISCAL_TIN: "" } as BillingEnv, "payme"), []);
  // A key pasted with a newline is the same key.
  assert.deepEqual(liveReadiness({ ...paymeLive, GPT_PAYME_KEY: `${marked()}\n` } as BillingEnv, "payme"), []);
});

test("the committed configuration: Click and Payme live, Uzum off, credentials are never public config", async () => {
  // Runbook docs/paid-chat/ONBOARDING-KEYS-RU.md, S2 (owner's order of 2026-10-05):
  // Click sells live, Uzum is off. Payme sells live since the owner's order
  // of 2026-10-07 (docs/paid-chat/PAYME-RU.md, section 6): its callback
  // answers Payme's production with GPT_PAYME_KEY, every visitor is offered
  // it next to Click, and no rehearsal session is offered a test provider.
  // The stop switches (both places and a deploy) are pinned by the next test:
  // GPT_BILLING_LIVE_READY = "false" stops new sales and still settles open
  // invoices; GPT_BILLING_MODE_CLICK = "" closes the callback too; Payme's
  // rollback is GPT_BILLING_MODE_PAYME = "test" (below).
  const source = fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8");
  const packed = JSON.parse(/GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(source)![1]) as Record<string, string>;
  const env = hydrateRuntimeConfig({ GPTBOT_RUNTIME_CONFIG_JSON: JSON.stringify(packed) }) as unknown as BillingEnv;
  assert.equal(packed.GPT_PAYMENT_PROVIDERS, "click,uzum,payme");
  assert.equal(packed.GPT_BILLING_MODE, "");
  assert.equal(packed.GPT_BILLING_MODE_CLICK, "live");
  assert.equal(packed.GPT_BILLING_MODE_UZUM, "");
  // "live" since 2026-10-07; "test" is the one-command rollback (PAYME-RU.md section 7),
  // and every expectation below follows the committed value.
  const paymeMode = packed.GPT_BILLING_MODE_PAYME as "live" | "test";
  assert.ok(paymeMode === "live" || paymeMode === "test", paymeMode);
  assert.equal(packed.GPT_BILLING_LIVE_READY, "true");
  assert.equal(packed.UZUM_API, "");
  assert.equal(billingActive(env), true);
  assert.equal(providerMode(env, "click"), "live");
  assert.equal(providerMode(env, "uzum"), null);
  assert.equal(providerMode(env, "payme"), paymeMode);
  // Without the Pages secrets neither of the other two is ready.
  for (const provider of ["uzum", "payme"] as const) assert.equal(providerReady(env, provider), false);
  // Payme live from this config lacks only what the Pages secrets hold: its
  // own switch, its receipt line is the committed fiscal codes.
  // The public config settles everything it can: with D1 bound, Click live lacks
  // only what the Pages secrets hold, and without them it fails closed.
  const bomb = { prepare() { throw new Error("DB touched"); }, batch() { throw new Error("DB touched"); } };
  assert.deepEqual(liveReadiness({ ...env, GPTBOT_DRAFTS_DB: bomb } as unknown as BillingEnv, "click"), [
    "GPT_CLICK_CREDENTIALS_JSON",
    "GPT_NOTIFY_BOT_TOKEN",
    "GPT_NOTIFY_CHAT_ID",
    "GPT_HASH_SALT",
    "GPT_IDENTITY_SECRET",
    "GPT_BILLING_MAINTENANCE_SECRET",
    "TELEGRAM_ASSISTANT_BOT_TOKEN",
    "TELEGRAM_ASSISTANT_WEBHOOK_SECRET",
  ]);
  assert.deepEqual(liveReadiness({ ...env, GPTBOT_DRAFTS_DB: bomb } as unknown as BillingEnv, "payme"), [
    ...(paymeMode === "live" ? [] : ["GPT_BILLING_MODE_PAYME"]),
    "GPT_PAYME_KEY",
    "GPT_PAYME_MERCHANT_ID",
    "GPT_NOTIFY_BOT_TOKEN",
    "GPT_NOTIFY_CHAT_ID",
    "GPT_HASH_SALT",
    "GPT_IDENTITY_SECRET",
    "GPT_BILLING_MAINTENANCE_SECRET",
    "TELEGRAM_ASSISTANT_BOT_TOKEN",
    "TELEGRAM_ASSISTANT_WEBHOOK_SECRET",
  ]);
  assert.equal(providerReady(env, "click"), false);
  // The owner's fiscal decision of 2026-10-01: complete, VAT 12 % included.
  assert.deepEqual(fiscalIssues(env, { tin: true }), []);
  assert.deepEqual(fiscalParams(env), { ikpu: "10305008002000000", packageCode: "1514296", vatPercent: 12 });
  for (const secret of ["GPT_CLICK_CREDENTIALS_JSON", "UZUM_CREDENTIALS_JSON", "GPT_IDENTITY_SECRET", "GPT_HASH_SALT", "GPT_BILLING_MAINTENANCE_SECRET", "GPT_CLICK_SECRET", "GPT_PAYME_KEY", "GPT_PAYME_TEST_KEY", "GPT_PAYME_MERCHANT_ID"]) {
    assert.ok(!(RUNTIME_CONFIG_KEYS as readonly string[]).includes(secret), secret);
    assert.doesNotMatch(source, new RegExp(`^\\s*${secret}\\s*=`, "mu"), secret);
  }
  // The legacy Uzum receipt codes are gone: one source for every receipt
  // (GPT_FISCAL_*). UZUM_FISCAL_*BASE_URL are the Fiscalization API hosts.
  for (const legacy of ["UZUM_FISCAL_IKPU", "UZUM_FISCAL_PACKAGE_CODE", "UZUM_FISCAL_VAT_PERCENT"])
    assert.ok(!(legacy in packed) && !(RUNTIME_CONFIG_KEYS as readonly string[]).includes(legacy), legacy);
  assert.deepEqual(
    Object.keys(packed).filter((key) => key.startsWith("UZUM_FISCAL_")),
    ["UZUM_FISCAL_BASE_URL", "UZUM_FISCAL_TEST_BASE_URL"],
  );
  const post = (handler: typeof click, url: string, routeEnv: BillingEnv) =>
    handler({
      request: new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
      env: { ...routeEnv, GPTBOT_DRAFTS_DB: bomb },
      params: { op: url.split("/").pop() },
      waitUntil() {},
    } as unknown as Parameters<typeof click>[0]);
  const offRoutes = [
    [payme, "https://gptbot.uz/api/payments/payme"],
    [uzumCallback, "https://gptbot.uz/api/payments/uzum"],
    [uzumMerchant, "https://gptbot.uz/api/payments/uzum-merchant/check"],
  ] as Array<[typeof click, string]>;
  // Public config alone (no Pages secret): every payment route is a missing
  // route, before any D1 access; Click has no credentials to check a signature with.
  for (const [handler, url] of [[click, "https://gptbot.uz/api/payments/click"], ...offRoutes] as Array<[typeof click, string]>)
    assert.equal((await post(handler, url, env)).status, 404, url);
  // Sign-in exists to pay: while Click is not ready (its secrets missing) no
  // provider is offered, so both ways in are missing routes too, before the
  // body and D1, whatever the bot's own settings.
  const signIn = { ...env, GPTBOT_DRAFTS_DB: bomb, GPT_IDENTITY_SECRET: hex(32), TELEGRAM_ASSISTANT_BOT_TOKEN: "t", TELEGRAM_ASSISTANT_WEBHOOK_SECRET: "s", GPT_TELEGRAM_CLIENT_ID: "1", GPT_TELEGRAM_CLIENT_SECRET: "c" };
  for (const [handler, url] of [
    [botLoginStart, "https://gptbot.uz/api/gpt/auth/bot/start"],
    [botLoginStatus, "https://gptbot.uz/api/gpt/auth/bot/status"],
    [oidcStart, "https://gptbot.uz/api/gpt/auth/start"],
  ] as Array<[typeof botLoginStart, string]>) {
    const response = await handler({
      request: new Request(url, { method: "POST", headers: { Origin: "https://gptbot.uz", "Content-Type": "application/json" }, body: '{"consent":true}' }),
      env: signIn,
    } as unknown as Parameters<typeof botLoginStart>[0]);
    assert.equal(response.status, 404, url);
  }
  // The pack window's funnel counter (WP-17): every step of the window is out
  // of reach, 404 before D1. The chat's business line is counted there
  // whatever billing does (WP-20, tests/gpt-ui-events.test.ts).
  for (const type of PACK_WINDOW_EVENTS) {
    const response = await uiEvent({
      request: new Request("https://gptbot.uz/api/gpt/event", {
        method: "POST",
        headers: { Origin: "https://gptbot.uz", "Content-Type": "application/json" },
        body: JSON.stringify({ id: randomUUID(), type, detail: UI_EVENTS[type][0] }),
      }),
      env: signIn,
    } as unknown as Parameters<typeof uiEvent>[0]);
    assert.equal(response.status, 404, type);
  }
  const guestView = async (viewEnv: BillingEnv) =>
    (await (
      await account({ request: new Request("https://gptbot.uz/api/gpt/account"), env: { ...viewEnv }, waitUntil() {} } as unknown as Parameters<typeof account>[0])
    ).json()) as { providers: unknown[]; mode: unknown; pack: unknown; loginAvailable: boolean; loginMethods: unknown[] };
  const view = await guestView(signIn as unknown as BillingEnv);
  assert.deepEqual(view.providers, []);
  assert.equal(view.mode, null);
  assert.equal(view.loginAvailable, false);
  assert.deepEqual(view.loginMethods, []);
  assert.equal(packed.GPT_BOT_LOGIN_MODE, "pick");
  const pack = {
    priceUzs: 20000,
    messageLimit: 300,
    dailyLimit: 50,
    months: 1,
    vat: { percent: 12, includedTiyin: 214286 },
  };
  assert.deepEqual(view.pack, pack);
  // With the Pages secrets production holds (random here; no Telegram OIDC
  // client): Click is live-ready and offered to everyone, signed in through
  // the bot; Uzum stays off; Payme is offered in a rehearsal session only.
  // The secrets are a superset of production's: Click's carries the dark
  // rehearsal's test block, and Uzum's and Payme's credentials are present in
  // every flow and mode, so what is offered below rests on the modes and the
  // allowlist alone.
  const production = {
    ...env,
    GPTBOT_DRAFTS_DB: bomb,
    GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({
      live: { service_id: 41001, merchant_id: 32002, secret_key: marked(), merchant_user_id: 50003 },
      test: { service_id: 941001, merchant_id: 932002, secret_key: marked(), merchant_user_id: 950003 },
    }),
    UZUM_CREDENTIALS_JSON: JSON.stringify({
      checkout: { test: { terminalId: randomUUID(), apiKey: marked() }, live: { terminalId: randomUUID(), apiKey: marked() } },
      merchant: { test: { serviceId: 77, login: "fixture", password: marked() }, live: { serviceId: 78, login: "fixture", password: marked() } },
      fiscal: { test: { apiKey: marked() }, live: { apiKey: marked() } },
    }),
    GPT_PAYME_KEY: marked(),
    GPT_PAYME_TEST_KEY: marked(),
    GPT_PAYME_MERCHANT_ID: hex(12),
    GPT_NOTIFY_BOT_TOKEN: marked(),
    GPT_NOTIFY_CHAT_ID: "123456789",
    GPT_HASH_SALT: marked(),
    GPT_IDENTITY_SECRET: marked(),
    GPT_BILLING_MAINTENANCE_SECRET: marked(),
    TELEGRAM_ASSISTANT_BOT_TOKEN: marked(),
    TELEGRAM_ASSISTANT_WEBHOOK_SECRET: marked(),
  } as unknown as BillingEnv;
  assert.deepEqual(liveReadiness(production, "click"), []);
  assert.equal(providerReady(production, "click"), true);
  assert.deepEqual(liveReadiness(production, "payme"), paymeMode === "live" ? [] : ["GPT_BILLING_MODE_PAYME"]);
  assert.deepEqual(offeredProviders(production, "live"), paymeMode === "live" ? ["click", "payme"] : ["click"]);
  assert.deepEqual(offeredProviders(production, "test"), paymeMode === "live" ? [] : ["payme"]);
  assert.equal(providerReady(production, "uzum"), false);
  assert.equal(providerReady(production, "payme"), true);
  // The rollback of PAYME-RU.md section 7: Payme back to its sandbox, Click untouched.
  const rolledBack = { ...production, GPT_BILLING_MODE_PAYME: "test" } as BillingEnv;
  assert.deepEqual(offeredProviders(rolledBack, "live"), ["click"]);
  assert.deepEqual(offeredProviders(rolledBack, "test"), ["payme"]);
  assert.equal(liveReadiness(rolledBack, "payme")[0], "GPT_BILLING_MODE_PAYME");
  const live = await guestView(production);
  assert.deepEqual(live.providers, paymeMode === "live" ? ["click", "payme"] : ["click"]);
  assert.equal(live.mode, "live");
  assert.equal(live.loginAvailable, true);
  assert.deepEqual(live.loginMethods, ["bot"]);
  assert.deepEqual(live.pack, pack);
  assert.doesNotMatch(JSON.stringify(live), new RegExp(MARK));
  // Uzum remains a missing route before any D1 access, whichever Uzum flow a
  // later intake might set; Click checks the request (a Click protocol error
  // here) and Payme its Basic auth (-32504, HTTP 200) before either reads D1.
  for (const uzumApi of ["", "checkout", "merchant"])
    for (const [handler, url] of offRoutes.filter(([handler]) => handler !== payme))
      assert.equal((await post(handler, url, { ...production, UZUM_API: uzumApi } as BillingEnv)).status, 404, `${url} UZUM_API=${uzumApi}`);
  const clickAnswer = await post(click, "https://gptbot.uz/api/payments/click", production);
  assert.equal(clickAnswer.status, 200);
  assert.equal(((await clickAnswer.json()) as { error: number }).error, -8);
  const paymeAnswer = await post(payme, "https://gptbot.uz/api/payments/payme", production);
  assert.equal(paymeAnswer.status, 200);
  assert.equal(((await paymeAnswer.json()) as { error: { code: number } }).error.code, -32504);
  // Payme live: no provider is in test, a rehearsal cookie changes nothing and
  // its browser is a visitor in live like any other. Rolled back: the
  // rehearsal session, and only it, is offered Payme in test.
  const rehearsal = `${REHEARSAL_COOKIE}=${(await mintRehearsal(production))!.token}`;
  const inRehearsal = (await (
    await account({ request: new Request("https://gptbot.uz/api/gpt/account", { headers: { cookie: rehearsal } }), env: production, waitUntil() {} } as unknown as Parameters<typeof account>[0])
  ).json()) as { providers: unknown[]; mode: unknown };
  assert.deepEqual([inRehearsal.providers, inRehearsal.mode], paymeMode === "live" ? [["click", "payme"], "live"] : [["payme"], "test"]);
  // A Payme subscribe from a stale page (another edition) is refused before D1:
  // 409 terms_changed while Payme is live, a missing route (404) outside a
  // rehearsal once it is back in test.
  const stale = await subscribe({
    request: new Request("https://gptbot.uz/api/gpt/subscribe", {
      method: "POST",
      headers: { Origin: "https://gptbot.uz", "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "payme", requestId: randomUUID(), locale: "uz", acceptTerms: true, termsVersion: "ai-paket-2026-10-v2" }),
    }),
    env: production,
    waitUntil() {},
  } as unknown as Parameters<typeof subscribe>[0]);
  assert.equal(stale.status, paymeMode === "live" ? 409 : 404);
  assert.equal(((await stale.json()) as { code: string }).code, paymeMode === "live" ? "terms_changed" : "not_found");
});

test("the stop switches (S2): LIVE_READY off stops new Click sales and settles an open invoice; mode off closes the callback", async () => {
  const f = await billingFixture();
  const secret = marked();
  Object.assign(f.env, liveEnv({
    GPTBOT_DRAFTS_DB: f.binding,
    GPT_IDENTITY_SECRET: f.env.GPT_IDENTITY_SECRET,
    GPT_PAYMENT_PROVIDERS: "click,uzum",
    GPT_BILLING_MODE: "",
    GPT_BILLING_MODE_CLICK: "live",
    GPT_BILLING_MODE_UZUM: "",
    UZUM_API: "",
    GPT_CLICK_TEST_SERVICE_ID: "",
    GPT_CLICK_TEST_SECRET: "",
    GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ live: { service_id: 41001, merchant_id: 32002, secret_key: secret, merchant_user_id: 50003 } }),
  }));
  const buy = () =>
    subscribe(f.ctx(new Request("https://gptbot.uz/api/gpt/subscribe", {
      method: "POST",
      headers: { cookie: f.cookie, Origin: "https://gptbot.uz", "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "click", requestId: randomUUID(), locale: "ru", acceptTerms: true, termsVersion: f.env.GPT_BILLING_TERMS_VERSION }),
    })));
  const callback = async (order: string, action: "0" | "1", prepareId = "") => {
    const p: Record<string, string> = {
      click_trans_id: "880001",
      click_paydoc_id: "7001",
      service_id: "41001",
      merchant_trans_id: order,
      amount: "20000.00",
      action,
      sign_time: "2026-10-05 12:00:00",
      error: "0",
      ...(action === "1" ? { merchant_prepare_id: prepareId } : {}),
    };
    const response = await click(f.ctx(new Request("https://gptbot.uz/api/payments/click", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...p, sign_string: clickSignature(p, secret) }),
    })));
    return { status: response.status, body: response.status === 200 ? ((await response.json()) as { error: number; merchant_prepare_id?: number }) : null };
  };
  // Receipts and owner messages go out in the background: no network here.
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ ok: false }, { status: 503 })) as typeof fetch;
  try {
    const opened = await buy();
    const { attemptId } = (await opened.json()) as { attemptId: string };
    assert.equal(opened.status, 200);
    // The usual stop: no new sale, nothing offered, but the invoice already
    // open (valid 12 h) is prepared and completed into a pack.
    f.env.GPT_BILLING_LIVE_READY = "false";
    assert.deepEqual(offeredProviders(f.env, "live"), []);
    assert.equal((await buy()).status, 404);
    const prepared = await callback(attemptId, "0");
    assert.equal(prepared.status, 200);
    assert.equal(prepared.body?.error, 0);
    const prepareId = String(prepared.body?.merchant_prepare_id);
    const completed = await callback(attemptId, "1", prepareId);
    assert.equal(completed.body?.error, 0);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE order_id=?", attemptId), 1);
    // The hard stop: the callback route itself is missing, even for a
    // correctly signed repeat of that Complete.
    f.env.GPT_BILLING_MODE_CLICK = "";
    assert.equal((await callback(attemptId, "1", prepareId)).status, 404);
    while (f.background.length) await Promise.allSettled(f.background.splice(0));
  } finally {
    globalThis.fetch = original;
  }
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

test("a live-ready Click checkout: Click's page with the return marker; Payme sells live only by its own switch", async () => {
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
  // The global live mode alone never sells Payme: its own switch is missing.
  assert.equal((await buy("payme")).status, 404);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders WHERE provider='payme'"), 0);
  // The live view offers Click and Uzum, not Payme.
  const view = (await (await account(f.ctx(new Request("https://gptbot.uz/api/gpt/account", { headers: { cookie: f.cookie } })))).json()) as { providers: string[]; mode: string };
  assert.deepEqual(view.providers, ["click", "uzum"]);
  assert.equal(view.mode, "live");
  assert.ok(!JSON.stringify(view).includes(MARK));
  // The maintenance tick reports each provider's mode and missing names, no value.
  const { payments } = await inspectBilling(f.env);
  assert.deepEqual(payments, {
    click: { mode: "live", missing: [] },
    uzum: { mode: "live", missing: [] },
    payme: { mode: "live", missing: ["GPT_BILLING_MODE_PAYME"] },
  });
  // With its own switch, Payme live sends a signed-in payer to checkout.paycom.uz.
  // (The deploy gate still refuses it while the offer does not name Payme.)
  f.env.GPT_BILLING_MODE_PAYME = "live";
  const paymeResponse = await buy("payme", f.cookie, "ru");
  const paymeBody = (await paymeResponse.json()) as { mode: string; checkoutUrl: string; attemptId: string; code?: string };
  // The account still holds the open Click invoice (U7): it is closed first.
  assert.equal(paymeResponse.status, 409, JSON.stringify(paymeBody));
  assert.equal(paymeBody.code, "pending_elsewhere");
  await f.store.transition(body.attemptId, "cancelled", "invoice_cancelled", { from: ["pending"], unseen: true });
  const paid = await buy("payme", f.cookie, "ru");
  const paidBody = (await paid.json()) as { mode: string; checkoutUrl: string; attemptId: string };
  assert.equal(paidBody.mode, "checkout");
  const page = new URL(paidBody.checkoutUrl);
  assert.equal(page.origin, "https://checkout.paycom.uz");
  assert.equal(
    atob(page.pathname.slice(1)),
    `m=${f.env.GPT_PAYME_MERCHANT_ID};ac.order_id=${paidBody.attemptId};a=2000000;c=https://gptbot.uz/ru/gpt-chat/?pay=return;l=ru;ct=15000`,
  );
  assert.equal(f.db.value("SELECT mode FROM gpt_payment_orders WHERE id=?", paidBody.attemptId), "live");
  f.env.GPT_BILLING_MODE_PAYME = "";
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

// STUDIO_RUNTIME_CONFIG_JSON (functions/lib/studio/config.ts), the host rule,
// the 404 gate every /api/studio/* path starts with, and the response and log
// helpers (functions/lib/studio/http.ts). Spec §6, §12.
// Run: node --import tsx --test tests/studio-config.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  IMAGE_CHECK_MODELS,
  STUDIO_CONFIG_DEFAULTS,
  STUDIO_CONFIG_KEYS,
  STUDIO_ROUTES,
  deckOpen,
  parseStudioConfig,
  studioConfig,
  studioGate,
  studioHostAllowed,
  studioRequestConfig,
  type StudioConfig,
  type StudioEnv,
  type StudioRoute,
} from "../functions/lib/studio/config";
import { STUDIO_ERRORS, fail, json, notFound, studioLog } from "../functions/lib/studio/http";
import { alertRowId, alertText, isUrgentAlert, renderAlertMessage } from "../functions/lib/gpt-chat/alert-policy";

const ROOT = path.resolve(import.meta.dirname, "..");
const COMMITTED = /STUDIO_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(readFileSync(path.join(ROOT, "wrangler.toml"), "utf8"))?.[1];
const ON = JSON.stringify({
  STUDIO_API: "on", STUDIO_PAID_SERVICE: "on", STUDIO_FREE_DECK: "true", STUDIO_FULL_DECK: "true",
  STUDIO_PHOTO: "true", STUDIO_PAYMENTS: "live", STUDIO_EVENTS: "true",
});
const DEFAULTS = parseStudioConfig(undefined);
/** Every switch off: the code's defaults as the committed variable would carry them. */
const OFF = JSON.stringify(STUDIO_CONFIG_DEFAULTS);
const SWITCHES = (config: StudioConfig) => ({
  api: config.api, paidService: config.paidService, freeDeck: config.freeDeck, fullDeck: config.fullDeck,
  photo: config.photo, payments: config.payments, events: config.events,
});
const ALL_OFF = { api: false, paidService: false, freeDeck: false, fullDeck: false, photo: false, payments: "off", events: false };
const parse = (values: Record<string, unknown>) => parseStudioConfig(JSON.stringify(values));

test("the defaults stay off; production sells Studio through the explicitly approved shared Click service", () => {
  assert.ok(COMMITTED, "wrangler.toml has no STUDIO_RUNTIME_CONFIG_JSON");
  const committed = parseStudioConfig(COMMITTED);
  assert.deepEqual(SWITCHES(committed), { api: true, paidService: true, freeDeck: true, fullDeck: true, photo: false, payments: "live", events: true });
  assert.equal(committed.clickAmountsConfirmed, true);
  assert.equal(committed.clickUseChatService, true);
  assert.deepEqual(committed.paymentProviders, ["click"]);
  assert.deepEqual(committed.terms, { version: "ai-paket-2026-10-v5", ru: "https://gptbot.uz/ru/oferta/", uz: "https://gptbot.uz/uz/oferta/", approvedAt: "2026-10-07" });
  assert.equal(committed.maxSlides, 12);
  assert.equal(committed.paidProofread, true);
  assert.equal(committed.ga4Mp, false);
  assert.equal(committed.freeTextFallback, null);
  assert.match(committed.turnstileSiteKey, /^0x4[0-9A-Za-z_-]+$/);
  assert.deepEqual(SWITCHES(DEFAULTS), ALL_OFF);
  assert.deepEqual(
    { clickAmountsConfirmed: DEFAULTS.clickAmountsConfirmed, turnstilePaid: DEFAULTS.turnstilePaid, ga4Mp: DEFAULTS.ga4Mp, terms: DEFAULTS.terms, turnstileSiteKey: DEFAULTS.turnstileSiteKey },
    { clickAmountsConfirmed: false, turnstilePaid: false, ga4Mp: false, terms: { version: "", ru: "", uz: "", approvedAt: "" }, turnstileSiteKey: "" },
  );
  // The ramp values of the first 48 hours and T0.1's numbers (MEASURE-30 §0).
  assert.equal(DEFAULTS.freeDailyUsd, 0.3);
  assert.equal(DEFAULTS.rampDecksDaily, 50);
  assert.equal(DEFAULTS.jobGlobalPerMin, 3);
  assert.equal(DEFAULTS.maxSlides, 12);
  assert.equal(DEFAULTS.imageCheckModel, "@cf/google/gemma-4-26b-a4b-it");
  assert.deepEqual(DEFAULTS.textModels, ["zai/glm-5.3-flash"]);
  assert.deepEqual(DEFAULTS.visionModels, ["zai/glm-5.3-flash", "zai/glm-4.6v-flash"]);
  assert.equal(DEFAULTS.freeTextFallback, "openrouter:google/gemma-4-31b-it:free");
  assert.equal(DEFAULTS.aiLabel, true);
  assert.equal(DEFAULTS.clickAutofiscal, "");
  assert.deepEqual([...STUDIO_CONFIG_KEYS], Object.keys(JSON.parse(COMMITTED)));
});

test("invalid JSON, a non-object or nothing at all: every switch off", () => {
  for (const value of [undefined, null, "", "{", "not json", "[]", '["STUDIO_API"]', "null", "1", '"on"', "true", 42, { STUDIO_API: "on" }]) {
    assert.deepEqual(parseStudioConfig(value), DEFAULTS, String(value));
  }
  assert.deepEqual(SWITCHES(parseStudioConfig(ON.slice(0, -1))), ALL_OFF);
});

test("shared Click service requires its exact explicit runtime flag", () => {
  assert.equal(DEFAULTS.clickUseChatService, false);
  assert.equal(parse({ STUDIO_CLICK_USE_CHAT_SERVICE: "true" }).clickUseChatService, true);
  for (const value of ["false", "TRUE", "True", "1", "on", "yes", " true", true, 1, null]) {
    assert.equal(parse({ STUDIO_CLICK_USE_CHAT_SERVICE: value }).clickUseChatService, false);
  }
});

test("unknown keys are ignored: no quota version, no prototype tricks, no Pages variable of the same name", () => {
  const config = parse({ STUDIO_PLAN_VERSION: "studio-2099-01-v9", PLAN_VERSION: "x", STUDIO_PRICE_KUNLIK: "100", __proto__: { STUDIO_API: "on" } });
  assert.deepEqual(config, DEFAULTS);
  assert.ok(!("planVersion" in config));
  assert.deepEqual(parseStudioConfig('{"__proto__":{"STUDIO_API":"on"},"constructor":{"STUDIO_API":"on"}}'), DEFAULTS);
  // A switch set as its own Pages variable does nothing: only the JSON counts.
  const env = { STUDIO_RUNTIME_CONFIG_JSON: OFF, STUDIO_API: "on", STUDIO_FREE_DECK: "true" } as StudioEnv;
  assert.deepEqual(SWITCHES(studioConfig(env)), ALL_OFF);
});

test("switches open only on their exact value; a typo or another type keeps them off", () => {
  assert.deepEqual(SWITCHES(parseStudioConfig(ON)), {
    api: true, paidService: true, freeDeck: true, fullDeck: true, photo: true, payments: "live", events: true,
  });
  for (const value of ["On", "ON", " on", "on ", "true", "1", "yes", true, 1, null, {}]) {
    assert.equal(parse({ STUDIO_API: value }).api, false, JSON.stringify(value));
    assert.equal(parse({ STUDIO_PAID_SERVICE: value }).paidService, false, JSON.stringify(value));
  }
  for (const value of ["TRUE", "True", "1", "on", "yes", true]) {
    assert.equal(parse({ STUDIO_FREE_DECK: value }).freeDeck, false, JSON.stringify(value));
    assert.equal(parse({ STUDIO_CLICK_AMOUNTS_CONFIRMED: value }).clickAmountsConfirmed, false, JSON.stringify(value));
  }
  for (const value of ["LIVE", "Live", "prod", "on", "true", ""]) assert.equal(parse({ STUDIO_PAYMENTS: value }).payments, "off", value);
  assert.equal(parse({ STUDIO_PAYMENTS: "test" }).payments, "test");
  // The AI label is the other way round: only an exact "false" removes it.
  for (const value of ["False", "0", "off", "", "no", false]) assert.equal(parse({ STUDIO_AI_LABEL: value }).aiLabel, true, JSON.stringify(value));
  assert.equal(parse({ STUDIO_AI_LABEL: "false" }).aiLabel, false);
  for (const value of ["", "true", "false"]) assert.equal(parse({ STUDIO_CLICK_AUTOFISCAL: value }).clickAutofiscal, value);
  assert.equal(parse({ STUDIO_CLICK_AUTOFISCAL: "TRUE" }).clickAutofiscal, "");
});

test("numbers are clamped into their ranges; anything that is not a number keeps the default", () => {
  assert.equal(parse({ STUDIO_MAX_SLIDES: "15" }).maxSlides, 15);
  assert.equal(parse({ STUDIO_MAX_SLIDES: "40" }).maxSlides, 15);
  assert.equal(parse({ STUDIO_MAX_SLIDES: "3" }).maxSlides, 6);
  for (const value of ["12.5", "-1", "abc", "", "1e3", 15]) assert.equal(parse({ STUDIO_MAX_SLIDES: value }).maxSlides, 12, String(value));
  assert.equal(parse({ STUDIO_FREE_DAILY_USD: "3" }).freeDailyUsd, 3);
  assert.equal(parse({ STUDIO_FREE_DAILY_USD: "0" }).freeDailyUsd, 0);
  assert.equal(parse({ STUDIO_FREE_DAILY_USD: "500" }).freeDailyUsd, 20);
  for (const value of ["-1", "3$", "NaN", "Infinity", "0.12345"]) assert.equal(parse({ STUDIO_FREE_DAILY_USD: value }).freeDailyUsd, 0.3, value);
  assert.equal(parse({ STUDIO_PAID_DAILY_USD_STOP: "0" }).paidDailyUsdStop, 1);
  assert.equal(parse({ STUDIO_PAID_DAILY_USD_STOP: "1000" }).paidDailyUsdStop, 200);
  assert.equal(parse({ STUDIO_JOB_GLOBAL_PER_MIN: "0" }).jobGlobalPerMin, 1);
  assert.equal(parse({ STUDIO_JOB_GLOBAL_PER_MIN: "6" }).jobGlobalPerMin, 6);
  assert.equal(parse({ STUDIO_JOB_GLOBAL_PER_MIN: "1000" }).jobGlobalPerMin, 60);
  // The ramp ceiling is lifted only by an explicit "".
  assert.equal(parse({ STUDIO_RAMP_DECKS_DAILY: "" }).rampDecksDaily, null);
  assert.equal(parse({ STUDIO_RAMP_DECKS_DAILY: "abc" }).rampDecksDaily, 50);
  assert.equal(parse({ STUDIO_RAMP_DECKS_DAILY: "0" }).rampDecksDaily, 1);
  assert.equal(parse({ STUDIO_IP_YOUNG_DECKS: "100000" }).ipYoungDecks, 1000);
  assert.equal(parse({ STUDIO_FREE_ALERT_PHOTOS: "0" }).freeAlertPhotos, 1);
});

test("models stay on the priced lists; the free fallback is OpenRouter ':free' or nothing; photos never ':free'", () => {
  assert.deepEqual(parse({ STUDIO_TEXT_MODELS: "openai/gpt-5,zai/glm-5.3-flash,zai/glm-5.3-flash" }).textModels, ["zai/glm-5.3-flash"]);
  assert.deepEqual(parse({ STUDIO_TEXT_MODELS: "openai/gpt-5" }).textModels, ["zai/glm-5.3-flash"]);
  assert.deepEqual(parse({ STUDIO_VISION_MODELS: "zai/glm-4.6v-flash" }).visionModels, ["zai/glm-4.6v-flash"]);
  assert.deepEqual(
    parse({ STUDIO_VISION_MODELS: "openrouter:google/gemma-4-31b-it:free, zai/glm-4.6v-flash ,zai/glm-5.3-flash" }).visionModels,
    ["zai/glm-4.6v-flash", "zai/glm-5.3-flash"],
  );
  assert.deepEqual(parse({ STUDIO_VISION_MODELS: "openrouter:google/gemma-4-31b-it:free" }).visionModels, ["zai/glm-5.3-flash", "zai/glm-4.6v-flash"]);
  assert.equal(parse({ STUDIO_FREE_TEXT_FALLBACK: "" }).freeTextFallback, null);
  assert.equal(parse({ STUDIO_FREE_TEXT_FALLBACK: "openrouter:openai/gpt-5" }).freeTextFallback, "openrouter:google/gemma-4-31b-it:free");
  // Pictures are checked on Workers AI only (DECISIONS 07.10.2026 §16): the R-ST1 pages say so,
  // and the paid worst case is priced with it. glm-5.3-flash is no longer a choice.
  assert.deepEqual([...IMAGE_CHECK_MODELS], ["@cf/google/gemma-4-26b-a4b-it"]);
  assert.equal(parse({ STUDIO_IMAGE_CHECK_MODEL: "zai/glm-5.3-flash" }).imageCheckModel, "@cf/google/gemma-4-26b-a4b-it");
  assert.equal(parse({ STUDIO_IMAGE_CHECK_MODEL: "@cf/meta/llama-3.2-11b-vision-instruct" }).imageCheckModel, "@cf/google/gemma-4-26b-a4b-it");
});

test("terms: an edition id, https links on gptbot.uz and a real calendar day, or empty", () => {
  const good = parse({
    STUDIO_TERMS_VERSION: "ai-paket-2026-10-v3",
    STUDIO_TERMS_RU: "https://gptbot.uz/ru/oferta/",
    STUDIO_TERMS_UZ: "https://gptbot.uz/uz/oferta/",
    STUDIO_TERMS_APPROVED_AT: "2026-11-01",
  }).terms;
  assert.deepEqual(good, { version: "ai-paket-2026-10-v3", ru: "https://gptbot.uz/ru/oferta/", uz: "https://gptbot.uz/uz/oferta/", approvedAt: "2026-11-01" });
  for (const link of ["http://gptbot.uz/ru/oferta/", "https://evil.uz/ru/oferta/", "https://gptbot.uz.evil.com/", "https://gptbot.uz:8443/ru/", "https://a:b@gptbot.uz/", "javascript:alert(1)", "/ru/oferta/"])
    assert.equal(parse({ STUDIO_TERMS_RU: link }).terms.ru, "", link);
  for (const version of ["AI-PAKET", "a b", "", "x".repeat(65), "../v3"]) assert.equal(parse({ STUDIO_TERMS_VERSION: version }).terms.version, "", version);
  for (const day of ["2026-02-30", "2026-13-01", "01.11.2026", "2026-11-1", ""]) assert.equal(parse({ STUDIO_TERMS_APPROVED_AT: day }).terms.approvedAt, "", day);
  assert.equal(parse({ STUDIO_TURNSTILE_SITE_KEY: "0x4AAAAAAAB1cdEfGhIjKlMn" }).turnstileSiteKey, "0x4AAAAAAAB1cdEfGhIjKlMn");
  for (const key of ["short", "<script>", "0x4AAAA AAAA", "x".repeat(101)]) assert.equal(parse({ STUDIO_TURNSTILE_SITE_KEY: key }).turnstileSiteKey, "", key);
});

test("the parsed settings are frozen and cached per value", () => {
  const env = { STUDIO_RUNTIME_CONFIG_JSON: ON };
  const config = studioConfig(env);
  assert.equal(studioConfig({ STUDIO_RUNTIME_CONFIG_JSON: ON }), config);
  assert.ok(Object.isFrozen(config) && Object.isFrozen(config.terms) && Object.isFrozen(config.textModels));
  assert.throws(() => { (config as { api: boolean }).api = false; }, TypeError);
  assert.notEqual(studioConfig({ STUDIO_RUNTIME_CONFIG_JSON: OFF }), config);
  assert.equal(studioConfig({ STUDIO_RUNTIME_CONFIG_JSON: OFF }).api, false);
});

test("host rule: exactly gptbot.uz; localhost and 127.0.0.1 only with STUDIO_LOCAL_DEV=true", () => {
  const prod = {};
  const local = { STUDIO_LOCAL_DEV: "true" };
  assert.equal(studioHostAllowed("https://gptbot.uz/api/studio/config", prod), true);
  for (const url of [
    "https://www.gptbot.uz/api/studio/config", "https://ai-direct-pro-landing.pages.dev/api/studio/config",
    "https://abc123.ai-direct-pro-landing.pages.dev/api/studio/config", "https://gptbot.uz.evil.com/api/studio/config",
    "https://evilgptbot.uz/api/studio/config", "http://localhost:8788/api/studio/config", "http://127.0.0.1:8788/api/studio/config",
    "not a url",
  ]) assert.equal(studioHostAllowed(url, prod), false, url);
  assert.equal(studioHostAllowed("http://localhost:8788/api/studio/config", local), true);
  assert.equal(studioHostAllowed("http://127.0.0.1:8788/api/studio/config", local), true);
  assert.equal(studioHostAllowed("http://[::1]:8788/api/studio/config", local), false);
  assert.equal(studioHostAllowed("https://ai-direct-pro-landing.pages.dev/", local), false);
  for (const value of ["TRUE", "1", "yes", ""]) assert.equal(studioHostAllowed("http://localhost/", { STUDIO_LOCAL_DEV: value }), false, value);
  // Even with every switch on, a preview sees the studio off; the rest of the settings are kept.
  const preview = studioRequestConfig(new Request("https://ai-direct-pro-landing.pages.dev/api/studio/config"), { STUDIO_RUNTIME_CONFIG_JSON: ON });
  assert.deepEqual(SWITCHES(preview), ALL_OFF);
  assert.equal(preview.maxSlides, 12);
  assert.ok(Object.isFrozen(preview));
});

test("'test' payments exist only on a local host: on gptbot.uz they read off", () => {
  const env = { STUDIO_RUNTIME_CONFIG_JSON: JSON.stringify({ STUDIO_PAYMENTS: "test", STUDIO_PAID_SERVICE: "on" }), STUDIO_LOCAL_DEV: "true" };
  assert.equal(studioRequestConfig(new Request("https://gptbot.uz/api/studio/checkout"), env).payments, "off");
  assert.equal(studioRequestConfig(new Request("http://localhost:8788/api/studio/checkout"), env).payments, "test");
  assert.equal(studioRequestConfig(new Request("https://gptbot.uz/api/studio/checkout"), { STUDIO_RUNTIME_CONFIG_JSON: ON }).payments, "live");
  // Host-independent readers (Click callback, internal endpoints) see the stored value.
  assert.equal(studioConfig(env).payments, "test");
});

test("each route opens on exactly its switches (spec §6)", () => {
  const routes = Object.keys(STUDIO_ROUTES) as StudioRoute[];
  const open = (values: Record<string, string>) => {
    const config = parse(values);
    return routes.filter((route) => STUDIO_ROUTES[route](config)).sort();
  };
  assert.deepEqual(open({}), []);
  assert.deepEqual(open({ STUDIO_API: "on" }), ["config", "identity", "me"]);
  assert.deepEqual(open({ STUDIO_API: "on", STUDIO_FREE_DECK: "true" }), ["config", "identity", "images", "me", "presentations", "slides"]);
  assert.deepEqual(open({ STUDIO_API: "on", STUDIO_EVENTS: "true" }), ["config", "event", "identity", "me"]);
  assert.deepEqual(open({ STUDIO_API: "on", STUDIO_PHOTO: "true" }), ["config", "identity", "me", "photo"]);
  // A deck or photo switch alone opens nothing.
  assert.deepEqual(open({ STUDIO_FREE_DECK: "true", STUDIO_FULL_DECK: "true", STUDIO_PHOTO: "true", STUDIO_EVENTS: "true" }), []);
  assert.deepEqual(open({ STUDIO_PAID_SERVICE: "on" }), ["config", "me", "orderCancel", "photo", "regenerate"]);
  assert.deepEqual(
    open({ STUDIO_PAID_SERVICE: "on", STUDIO_FULL_DECK: "true" }),
    ["config", "images", "me", "orderCancel", "outline", "photo", "presentations", "regenerate", "slides"],
  );
  assert.deepEqual(open({ STUDIO_PAYMENTS: "live" }), ["checkout"]);
  assert.deepEqual(open({ STUDIO_API: "on", STUDIO_FULL_DECK: "true" }), ["config", "identity", "me"]);
  const free = parse({ STUDIO_API: "on", STUDIO_FREE_DECK: "true" });
  assert.deepEqual([deckOpen(free, "free"), deckOpen(free, "full")], [true, false]);
  const full = parse({ STUDIO_PAID_SERVICE: "on", STUDIO_FULL_DECK: "true" });
  assert.deepEqual([deckOpen(full, "free"), deckOpen(full, "full")], [false, true]);
});

// ── The paid stage's settings (Build-0; DECISIONS 07.10.2026 §12, §13 п. 4) ──

test("STUDIO_PAYMENT_PROVIDERS: '' sells through nobody; payme, click or both, each name exact, in order, once", () => {
  assert.equal(STUDIO_CONFIG_DEFAULTS.STUDIO_PAYMENT_PROVIDERS, "");
  assert.deepEqual(DEFAULTS.paymentProviders, []);
  assert.deepEqual(parseStudioConfig(COMMITTED).paymentProviders, ["click"], "the committed variable sells only through Click");
  assert.deepEqual(parse({ STUDIO_PAYMENT_PROVIDERS: "payme" }).paymentProviders, ["payme"]);
  assert.deepEqual(parse({ STUDIO_PAYMENT_PROVIDERS: "click" }).paymentProviders, ["click"]);
  assert.deepEqual(parse({ STUDIO_PAYMENT_PROVIDERS: "click,payme" }).paymentProviders, ["click", "payme"]);
  assert.deepEqual(parse({ STUDIO_PAYMENT_PROVIDERS: " payme , click ,payme" }).paymentProviders, ["payme", "click"]);
  // A typo or a provider the studio does not sell through (Uzum stays off) is not a provider.
  assert.deepEqual(parse({ STUDIO_PAYMENT_PROVIDERS: "uzum,payme" }).paymentProviders, ["payme"]);
  for (const value of ["Payme", "PAYME", "paycom", "uzum", "click;payme", "payme click", " ", ",", "true", true, ["payme"], 1, null, {}])
    assert.deepEqual(parse({ STUDIO_PAYMENT_PROVIDERS: value }).paymentProviders, [], JSON.stringify(value));
  assert.ok(Object.isFrozen(parse({ STUDIO_PAYMENT_PROVIDERS: "payme" }).paymentProviders));
  // Naming a provider opens nothing by itself: a checkout still needs STUDIO_PAYMENTS.
  assert.deepEqual(SWITCHES(parse({ STUDIO_PAYMENT_PROVIDERS: "click,payme" })), ALL_OFF);
  assert.equal(STUDIO_ROUTES.checkout(parse({ STUDIO_PAYMENT_PROVIDERS: "payme" })), false);
  // A preview host sells through nobody, whatever the settings say.
  const env = { STUDIO_RUNTIME_CONFIG_JSON: JSON.stringify({ STUDIO_PAYMENTS: "live", STUDIO_PAYMENT_PROVIDERS: "payme" }) };
  assert.deepEqual(studioRequestConfig(new Request("https://gptbot.uz/api/studio/checkout"), env).paymentProviders, ["payme"]);
  const preview = studioRequestConfig(new Request("https://ai-direct-pro-landing.pages.dev/api/studio/checkout"), env);
  assert.deepEqual([preview.payments, preview.paymentProviders], ["off", []]);
  assert.ok(Object.isFrozen(preview.paymentProviders));
});

test("STUDIO_PAID_PROOFREAD: the Uzbek proofreading of paid decks is on unless exactly 'false'", () => {
  assert.equal(STUDIO_CONFIG_DEFAULTS.STUDIO_PAID_PROOFREAD, "true");
  assert.equal(DEFAULTS.paidProofread, true);
  assert.equal(parseStudioConfig(COMMITTED).paidProofread, true);
  assert.equal(parse({ STUDIO_PAID_PROOFREAD: "false" }).paidProofread, false);
  for (const value of ["False", "FALSE", "0", "off", "no", "", "true", false, 0, null])
    assert.equal(parse({ STUDIO_PAID_PROOFREAD: value }).paidProofread, true, JSON.stringify(value));
  // It is not a switch: it opens no route, and a deck is paid only behind STUDIO_PAID_SERVICE.
  assert.deepEqual(SWITCHES(parse({ STUDIO_PAID_PROOFREAD: "true" })), ALL_OFF);
});

test("the paid stage's error codes: 503 provider_unavailable, 409 refund_window and refund_exists", async () => {
  assert.equal(STUDIO_ERRORS.provider_unavailable, 503);
  assert.equal(STUDIO_ERRORS.refund_window, 409);
  assert.equal(STUDIO_ERRORS.refund_exists, 409);
  assert.deepEqual(await fail("provider_unavailable").json(), { ok: false, code: "provider_unavailable", error: "provider unavailable" });
  assert.equal(fail("refund_exists").status, 409);
});

test("the paid stage's alerts page the owner by name: payments and receipts once an hour, a due refund receipt once a day", () => {
  const NOW = Date.UTC(2026, 9, 7, 9, 15);
  const hour = Math.floor(NOW / 3_600_000);
  const day = Math.floor(NOW / 86_400_000);
  for (const code of ["studio_payme_processing", "studio_click_processing", "studio_click_unknown_order", "studio_fiscal_failed"]) {
    assert.equal(isUrgentAlert(code), true, code);
    assert.equal(alertRowId(code, NOW), `${code}:${hour}`, code);
    assert.match(alertText(code) ?? "", /^Студия: /, code);
  }
  // A partial refund waits for a receipt printed by hand: a standing state, reminded daily until it is printed.
  assert.equal(isUrgentAlert("studio_refund_receipt_due"), true);
  assert.equal(alertRowId("studio_refund_receipt_due", NOW), `studio_refund_receipt_due:d${day}`);
  assert.equal(alertRowId("studio_refund_receipt_due", NOW + 5 * 3_600_000), alertRowId("studio_refund_receipt_due", NOW));
  assert.match(alertText("studio_refund_receipt_due") ?? "", /^Студия: .*чек/);
  // Studio codes are named one by one: the chat's payme_* / click_* globs never cover them, and no studio_* glob exists.
  assert.equal(isUrgentAlert("studio_payme_other"), false);
  assert.equal(isUrgentAlert("studio_click_other"), false);
  // Fixed texts only: no order number, sum or buyer data can reach the message.
  const message = renderAlertMessage([{ code: "studio_payme_processing", count: 2 }], []);
  assert.match(message, /studio_payme_processing ×2 — Студия: /);
  assert.doesNotMatch(message, /stu_|\d{3} \d{3}/);
});

// ── The gate: 404 before the body and before D1 ─────────────────────────────

/** An env that records what is read and whose D1 binding throws on any use. */
function watchedEnv(values: Record<string, string | undefined>) {
  const read = new Set<string>();
  const d1 = new Proxy({}, { get: (_target, key) => { throw new Error(`D1 touched: ${String(key)}`); } });
  const env = new Proxy({ ...values, GPTBOT_DRAFTS_DB: d1, AI: d1 } as Record<string, unknown>, {
    get: (target, key) => {
      read.add(String(key));
      return target[key as string];
    },
  });
  return { env: env as unknown as StudioEnv, read };
}

/** A POST whose body throws if anything reads it. */
function untouchableRequest(url: string): Request {
  const body = new ReadableStream({ pull() { throw new Error("body read"); } });
  return new Request(url, { method: "POST", body, headers: { "content-type": "application/json", cookie: "__Host-studio_bid=v1.x.y.z" }, duplex: "half" } as RequestInit);
}

test("without its switch every route answers 404 before reading the body or touching D1", async () => {
  for (const route of Object.keys(STUDIO_ROUTES) as StudioRoute[]) {
    for (const url of ["https://gptbot.uz/api/studio/x", "https://ai-direct-pro-landing.pages.dev/api/studio/x"]) {
      const { env, read } = watchedEnv({ STUDIO_RUNTIME_CONFIG_JSON: OFF });
      const request = untouchableRequest(url);
      const response = studioGate(request, env, route);
      assert.ok(response, `${route} ${url}`);
      assert.equal(response.status, 404);
      assert.equal(request.bodyUsed, false);
      // Only the two settings are read: no D1, no AI binding, no secret.
      assert.ok(read.has("STUDIO_RUNTIME_CONFIG_JSON"));
      for (const key of read) assert.ok(["STUDIO_RUNTIME_CONFIG_JSON", "STUDIO_LOCAL_DEV"].includes(key), `${route} read ${key}`);
      assert.deepEqual(await response.json(), { ok: false, code: "not_found", error: "not found" });
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  }
});

test("on a preview host every route is 404 even with every switch on; on gptbot.uz the same routes open", () => {
  for (const route of Object.keys(STUDIO_ROUTES) as StudioRoute[]) {
    const { env } = watchedEnv({ STUDIO_RUNTIME_CONFIG_JSON: ON });
    assert.equal(studioGate(untouchableRequest("https://ai-direct-pro-landing.pages.dev/api/studio/x"), env, route)?.status, 404, route);
    assert.equal(studioGate(untouchableRequest("http://localhost:8788/api/studio/x"), env, route)?.status, 404, route);
    assert.equal(studioGate(untouchableRequest("https://gptbot.uz/api/studio/x"), env, route), null, route);
    const { env: local } = watchedEnv({ STUDIO_RUNTIME_CONFIG_JSON: ON, STUDIO_LOCAL_DEV: "true" });
    assert.equal(studioGate(untouchableRequest("http://127.0.0.1:8788/api/studio/x"), local, route), null, route);
  }
});

/** Every handler file under functions/api/studio/ (T1.2 onwards). */
function studioEndpointFiles(dir = path.join(ROOT, "functions/api/studio")): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? studioEndpointFiles(full) : name.endsWith(".ts") ? [full] : [];
  });
}

test("committed paid settings open the production route gates; preview hosts stay closed before body and D1", () => {
  for (const route of Object.keys(STUDIO_ROUTES) as StudioRoute[]) {
    const { env, read } = watchedEnv({ STUDIO_RUNTIME_CONFIG_JSON: COMMITTED });
    const preview = untouchableRequest("https://ai-direct-pro-landing.pages.dev/api/studio/x");
    assert.equal(studioGate(preview, env, route)?.status, 404, `${route} on pages.dev`);
    assert.equal(preview.bodyUsed, false);
    const site = untouchableRequest("https://gptbot.uz/api/studio/x");
    const answer = studioGate(site, env, route);
    assert.equal(answer, null, `${route} on gptbot.uz; handlers still check identity and entitlement`);
    assert.equal(site.bodyUsed, false);
    for (const key of read) assert.ok(["STUDIO_RUNTIME_CONFIG_JSON", "STUDIO_LOCAL_DEV"].includes(key), `${route} read ${key}`);
  }
});

test("every studio endpoint, with every switch off, answers 404 without touching the body or D1", async (context) => {
  const files = studioEndpointFiles();
  context.diagnostic(`${files.length} endpoint file(s) under functions/api/studio/`);
  for (const file of files) {
    const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    const handlers = Object.entries(module).filter(([name, value]) => /^onRequest(Get|Post|Put|Patch|Delete|Options|Head)?$/.test(name) && typeof value === "function");
    assert.ok(handlers.length, `${file} exports no onRequest handler`);
    for (const [name, handler] of handlers) {
      for (const url of ["https://gptbot.uz/api/studio/x", "https://ai-direct-pro-landing.pages.dev/api/studio/x"]) {
        const { env } = watchedEnv({ STUDIO_RUNTIME_CONFIG_JSON: OFF });
        const request = untouchableRequest(url);
        const response = await (handler as (context: unknown) => Promise<Response>)({
          request, env, params: { job: "sj_00000000000000000000000000000000" }, data: {},
          waitUntil: () => undefined, next: () => { throw new Error("next() called"); }, passThroughOnException: () => undefined,
          functionPath: "/api/studio/x",
        });
        assert.equal(response.status, 404, `${path.relative(ROOT, file)} ${name} ${url}`);
        assert.equal(request.bodyUsed, false, `${path.relative(ROOT, file)} ${name}`);
      }
    }
  }
});

// ── http.ts ─────────────────────────────────────────────────────────────────

test("json answers are no-store, noindex and nosniff", async () => {
  const response = json({ ok: true, n: 1 }, 201, { "X-Extra": "1" });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-extra"), "1");
  assert.deepEqual(await response.json(), { ok: true, n: 1 });
});

test("errors are { ok: false, code, error } with the code's status; extra fields cannot override them", async () => {
  const limited = fail("free_limit", { resetsAt: "05:00 Asia/Tashkent", ok: true, code: "x" });
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { resetsAt: "05:00 Asia/Tashkent", ok: false, code: "free_limit", error: "free limit" });
  assert.equal(notFound().status, 404);
  const statuses: Record<string, number> = {
    identity_required: 401, turnstile_failed: 403, turnstile_required: 403, no_units: 402, job_in_progress: 409,
    topic_refused: 422, unreadable: 422, ip_ceiling: 429, try_later: 429, studio_busy: 503, model_unavailable: 503,
    studio_not_configured: 503, checkout_unavailable: 503, model_failed: 502, outline_tampered: 400, bad_sig: 400,
    payload_too_large: 413, unsupported_media: 415, regen_mismatch: 409, terms_changed: 409,
  };
  for (const [code, status] of Object.entries(statuses)) assert.equal(STUDIO_ERRORS[code as keyof typeof STUDIO_ERRORS], status, code);
});

test("a log line carries only the event and a coarse code", (context) => {
  const lines: string[] = [];
  context.mock.method(console, "log", (line: string) => lines.push(line));
  studioLog("presentation_create", "free_limit");
  studioLog("topic: Amir Temur https://x.uz/?k=secret", "model failed\n{\"leak\":1}");
  assert.deepEqual(lines.map((line) => Object.keys(JSON.parse(line))), [["event", "code"], ["event", "code"]]);
  assert.deepEqual(JSON.parse(lines[0]), { event: "presentation_create", code: "free_limit" });
  // Whatever a caller passes, a line stays one short JSON object of plain tokens.
  for (const line of lines) {
    assert.doesNotMatch(line, /\n/);
    for (const value of Object.values(JSON.parse(line) as Record<string, string>)) assert.match(value, /^[A-Za-z0-9_.:-]{1,64}$/);
  }
});

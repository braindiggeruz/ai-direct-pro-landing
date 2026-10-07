// Studio switches and tuning values (spec §6, §12).
//
// Everything comes from ONE public text variable, STUDIO_RUNTIME_CONFIG_JSON,
// at the top level of [vars] in wrangler.toml (not the chat's 5 KiB
// GPTBOT_RUNTIME_CONFIG_JSON, whose key list has its own parity rules). Read
// only through this file:
//   - only the keys in STUDIO_CONFIG_KEYS count; anything else is ignored
//     (a quota version, for one, is never a setting: plans.ts TERMS_PLAN);
//   - invalid JSON, a non-object or a value of the wrong shape falls back to
//     the default, and every default keeps the studio off;
//   - numbers are clamped into sane ranges; model names must be on a list
//     that pricing.ts prices;
//   - a Pages variable named like a key (STUDIO_API=on) does nothing.
//
// Switches act only on the host gptbot.uz, or on localhost / 127.0.0.1 when
// .dev.vars sets STUDIO_LOCAL_DEV=true. Anywhere else, previews on
// *.pages.dev included, every switch reads off and every /api/studio/* path
// answers 404 before it reads the body or touches D1 (studioGate). Click's
// callback and the internal endpoints are not host-bound: they read
// studioConfig(env) and are authorised by a signature or a bearer.
//
// Pages changes variables only with a deploy, so flipping any value here is a
// full guarded release. The brake that needs no deploy is the WAF rule
// (spec §13.3).
import type { Env } from "../../_types";
import { DECK_SHAPES, STUDIO_PROVIDERS, type StudioProvider } from "./plans";
import { notFound } from "./http";

export type StudioEnv = Pick<Env, "STUDIO_RUNTIME_CONFIG_JSON" | "STUDIO_LOCAL_DEV">;

/** The only production host the studio answers on. */
export const STUDIO_HOST = "gptbot.uz";
/** Local hosts that count only with STUDIO_LOCAL_DEV=true (wrangler pages dev). */
export const STUDIO_LOCAL_HOSTS: readonly string[] = ["localhost", "127.0.0.1"];

// Model names a setting may choose. pricing.ts has a price for each, and the
// worst-case test covers the dearest of them. Adding one is a code change.
export const TEXT_MODELS = ["zai/glm-5.3-flash"] as const;
/** OpenRouter ':free' only, and only for the free deck (spec §7.2). */
export const FREE_TEXT_FALLBACKS = ["openrouter:google/gemma-4-31b-it:free"] as const;
/** Photos never go to a ':free' provider (spec §8.2). */
export const VISION_MODELS = ["zai/glm-5.3-flash", "zai/glm-4.6v-flash"] as const;
/**
 * Finished pictures are checked on Workers AI only: T0.1 chose Gemma 4
 * (MEASURE-30 §7.3), the R-ST1 pages tell visitors that Cloudflare Workers AI
 * draws and checks the pictures, and the paid worst case (tests/studio-plans)
 * is priced with this check. glm-5.3-flash, the measurement's alternative,
 * was taken off the list on 07.10.2026 (DECISIONS §16): it would send every
 * picture to Z.ai and push the worst Oylik term over half of its net.
 * image-check.ts keeps its Z.ai path; bringing it back is a code change that
 * passes that test and a new data paragraph on the pages.
 */
export const IMAGE_CHECK_MODELS = ["@cf/google/gemma-4-26b-a4b-it"] as const;

export type TextModel = (typeof TEXT_MODELS)[number];
export type FreeTextFallback = (typeof FREE_TEXT_FALLBACKS)[number];
export type VisionModel = (typeof VISION_MODELS)[number];
export type ImageCheckModel = (typeof IMAGE_CHECK_MODELS)[number];
export type PaymentsMode = "off" | "test" | "live";
/** The meaning of the chat's GPT_CLICK_AUTOFISCAL: "" check Click's receipt first, "true" Click prints, "false" we print. */
export type ClickAutofiscal = "" | "true" | "false";

/**
 * Every key, in the order wrangler.toml lists them, with its default. The
 * committed variable carries exactly these values (tests/pages-config-parity),
 * so the defaults are the "everything off" state.
 */
export const STUDIO_CONFIG_DEFAULTS = {
  /** "on": free paths, identity, /config, /me, /event. */
  STUDIO_API: "off",
  /** "on": paid generations, regeneration, entitlements in /me, order status and cancel. Never back to "off" after the first live sale. */
  STUDIO_PAID_SERVICE: "off",
  STUDIO_FREE_DECK: "false",
  /** The full deck (with an entitlement only). */
  STUDIO_FULL_DECK: "false",
  STUDIO_PHOTO: "false",
  /** New orders only: "test" (local rehearsal only) or "live". Callbacks of existing orders ignore it. */
  STUDIO_PAYMENTS: "off",
  /** Click confirmed the amounts 5 900 and 39 900 in writing for the chosen service. */
  STUDIO_CLICK_AMOUNTS_CONFIRMED: "false",
  STUDIO_CLICK_USE_CHAT_SERVICE: "false",
  STUDIO_CLICK_AUTOFISCAL: "",
  STUDIO_TERMS_VERSION: "",
  STUDIO_TERMS_RU: "",
  STUDIO_TERMS_UZ: "",
  /**
   * YYYY-MM-DD the offer edition was approved. For the Studio edition it is
   * 2026-10-07, the owner's decision without a lawyer (DECISIONS §10(б)).
   */
  STUDIO_TERMS_APPROVED_AT: "",
  STUDIO_EVENTS: "false",
  /** Public key of the studio's own Turnstile widget (the secret is STUDIO_TURNSTILE_SECRET_KEY). */
  STUDIO_TURNSTILE_SITE_KEY: "",
  STUDIO_TURNSTILE_PAID: "false",
  /** Hard daily stop of the free tier's model spend, USD (0.3 for the first 48 hours, then 3). */
  STUDIO_FREE_DAILY_USD: "0.3",
  /** Free decks a day during the ramp; "" = no ramp ceiling. */
  STUDIO_RAMP_DECKS_DAILY: "50",
  STUDIO_FREE_ALERT_DECKS: "300",
  STUDIO_FREE_ALERT_PHOTOS: "600",
  /** The IP ceiling, for identities younger than a day only. */
  STUDIO_IP_YOUNG_DECKS: "20",
  STUDIO_IP_YOUNG_PHOTOS: "40",
  /** Emergency stop of paid model spend, USD a day (an error or an attack, not buyers). */
  STUDIO_PAID_DAILY_USD_STOP: "20",
  /** Job starts a minute for the whole site; 3 until the night 1302 burst is measured (MEASURE-30 §8). */
  STUDIO_JOB_GLOBAL_PER_MIN: "3",
  /** The full deck's slider: 12, or up to plans.ts DECK_SHAPES.full.maxSlides (15) by a release. */
  STUDIO_MAX_SLIDES: "12",
  STUDIO_TEXT_MODELS: "zai/glm-5.3-flash",
  /** "" = no fallback. */
  STUDIO_FREE_TEXT_FALLBACK: "openrouter:google/gemma-4-31b-it:free",
  STUDIO_VISION_MODELS: "zai/glm-5.3-flash,zai/glm-4.6v-flash",
  STUDIO_IMAGE_CHECK_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  /** The «AI yordamida tayyorlangan» slide and company = GPTBot.uz in the .pptx; off only when exactly "false". */
  STUDIO_AI_LABEL: "true",
  /** Server-side GA4 purchase (weeks 6–7). */
  STUDIO_GA4_MP: "false",
  // The paid stage (07.10.2026), kept last so the committed line only grows at its end.
  /**
   * Who sells tariffs, a comma list of "payme" and "click" (DECISIONS §12):
   * "" sells through nobody; the release sets "payme"; "click" sells only
   * with STUDIO_CLICK_AMOUNTS_CONFIRMED and the chosen Click service
   * (lib/studio/checkout.ts readyProvider). Uzum is not a studio provider.
   */
  STUDIO_PAYMENT_PROVIDERS: "",
  /**
   * The «fix the language only» pass over paid Uzbek decks (DECISIONS §13
   * п. 4, owner's choice «а»; proofread.ts). On unless exactly "false"; the
   * worst case is priced with it on.
   */
  STUDIO_PAID_PROOFREAD: "true",
} as const satisfies Record<string, string>;

export type StudioConfigKey = keyof typeof STUDIO_CONFIG_DEFAULTS;
export const STUDIO_CONFIG_KEYS = Object.keys(STUDIO_CONFIG_DEFAULTS) as readonly StudioConfigKey[];

export interface StudioTerms {
  /** The offer edition (data-terms-version of the built offer); "" when unset. */
  readonly version: string;
  /** https://gptbot.uz/… only; "" when unset or anything else. */
  readonly ru: string;
  readonly uz: string;
  /** YYYY-MM-DD, a real calendar day; "" when unset or malformed. */
  readonly approvedAt: string;
}

export interface StudioConfig {
  readonly api: boolean;
  readonly paidService: boolean;
  readonly freeDeck: boolean;
  readonly fullDeck: boolean;
  readonly photo: boolean;
  readonly payments: PaymentsMode;
  readonly clickAmountsConfirmed: boolean;
  /** Explicitly use the approved chat Click service and its fiscal policy. */
  readonly clickUseChatService: boolean;
  readonly clickAutofiscal: ClickAutofiscal;
  readonly terms: StudioTerms;
  readonly events: boolean;
  readonly turnstileSiteKey: string;
  readonly turnstilePaid: boolean;
  readonly freeDailyUsd: number;
  /** null: the ramp ceiling is lifted. */
  readonly rampDecksDaily: number | null;
  readonly freeAlertDecks: number;
  readonly freeAlertPhotos: number;
  readonly ipYoungDecks: number;
  readonly ipYoungPhotos: number;
  readonly paidDailyUsdStop: number;
  readonly jobGlobalPerMin: number;
  readonly maxSlides: number;
  readonly textModels: readonly TextModel[];
  /** null: no fallback for the free deck. */
  readonly freeTextFallback: FreeTextFallback | null;
  readonly visionModels: readonly VisionModel[];
  readonly imageCheckModel: ImageCheckModel;
  readonly aiLabel: boolean;
  readonly ga4Mp: boolean;
  /** The providers that may sell, in the configured order, each once; [] sells through nobody. */
  readonly paymentProviders: readonly StudioProvider[];
  /** The Uzbek proofreading pass of paid decks. */
  readonly paidProofread: boolean;
}

type Raw = Partial<Record<StudioConfigKey, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The raw value of `key`: the configured string, or the default when absent or not a string. */
function text(raw: Raw, key: StudioConfigKey): string {
  const value = raw[key];
  return typeof value === "string" ? value : STUDIO_CONFIG_DEFAULTS[key];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A whole number in [min, max]; the default for anything that is not one. */
function integer(raw: Raw, key: StudioConfigKey, min: number, max: number): number {
  const value = text(raw, key);
  const parsed = /^\d{1,9}$/.test(value) ? Number(value) : Number(STUDIO_CONFIG_DEFAULTS[key]);
  return clamp(parsed, min, max);
}

/** A dollar amount (up to 4 decimals) in [min, max]; the default for anything else. */
function usd(raw: Raw, key: StudioConfigKey, min: number, max: number): number {
  const value = text(raw, key);
  const parsed = /^\d{1,6}(\.\d{1,4})?$/.test(value) ? Number(value) : Number(STUDIO_CONFIG_DEFAULTS[key]);
  return clamp(parsed, min, max);
}

/** On only for exactly `on` ("true", "on"): a typo keeps it off. */
const exactly = (raw: Raw, key: StudioConfigKey, on: string) => text(raw, key) === on;

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** The names of a comma list that are on `allowed`, trimmed, deduplicated, in order. */
function namesOf<T extends string>(value: string, allowed: readonly T[]): T[] {
  return [...new Set(value.split(",").map((name) => name.trim()).filter((name): name is T => oneOf(name, allowed) !== null))];
}

/** A comma list kept to the allowed names (deduplicated, in order); the default when nothing is left. */
function modelList<T extends string>(raw: Raw, key: StudioConfigKey, allowed: readonly T[]): T[] {
  const chosen = namesOf(text(raw, key), allowed);
  return chosen.length ? chosen : namesOf(STUDIO_CONFIG_DEFAULTS[key], allowed);
}

function calendarDay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value ? value : "";
}

/** An https link on gptbot.uz without credentials or port, else "". */
function siteLink(value: string): string {
  if (value.length > 300) return "";
  try {
    const url = new URL(value);
    const plain = url.protocol === "https:" && url.hostname === STUDIO_HOST && !url.port && !url.username && !url.password;
    return plain ? url.href : "";
  } catch {
    return "";
  }
}

/** The settings in `json` (STUDIO_RUNTIME_CONFIG_JSON); defaults, all off, for anything invalid. Pure. */
export function parseStudioConfig(json: unknown): StudioConfig {
  let raw: Raw = {};
  if (typeof json === "string") {
    try {
      const parsed: unknown = JSON.parse(json);
      if (isRecord(parsed)) raw = parsed;
    } catch {
      // Invalid JSON: every setting keeps its default, so the studio is off.
    }
  }
  const version = text(raw, "STUDIO_TERMS_VERSION");
  const fallback = text(raw, "STUDIO_FREE_TEXT_FALLBACK");
  const autofiscal = text(raw, "STUDIO_CLICK_AUTOFISCAL");
  const ramp = text(raw, "STUDIO_RAMP_DECKS_DAILY");
  const siteKey = text(raw, "STUDIO_TURNSTILE_SITE_KEY");
  return Object.freeze({
    api: exactly(raw, "STUDIO_API", "on"),
    paidService: exactly(raw, "STUDIO_PAID_SERVICE", "on"),
    freeDeck: exactly(raw, "STUDIO_FREE_DECK", "true"),
    fullDeck: exactly(raw, "STUDIO_FULL_DECK", "true"),
    photo: exactly(raw, "STUDIO_PHOTO", "true"),
    payments: oneOf<PaymentsMode>(text(raw, "STUDIO_PAYMENTS"), ["test", "live"]) ?? "off",
    clickAmountsConfirmed: exactly(raw, "STUDIO_CLICK_AMOUNTS_CONFIRMED", "true"),
    clickUseChatService: exactly(raw, "STUDIO_CLICK_USE_CHAT_SERVICE", "true"),
    clickAutofiscal: oneOf<ClickAutofiscal>(autofiscal, ["", "true", "false"]) ?? "",
    terms: Object.freeze({
      version: /^[a-z0-9][a-z0-9.-]{0,63}$/.test(version) ? version : "",
      ru: siteLink(text(raw, "STUDIO_TERMS_RU")),
      uz: siteLink(text(raw, "STUDIO_TERMS_UZ")),
      approvedAt: calendarDay(text(raw, "STUDIO_TERMS_APPROVED_AT")),
    }),
    events: exactly(raw, "STUDIO_EVENTS", "true"),
    turnstileSiteKey: /^[0-9A-Za-z_-]{10,100}$/.test(siteKey) ? siteKey : "",
    turnstilePaid: exactly(raw, "STUDIO_TURNSTILE_PAID", "true"),
    freeDailyUsd: usd(raw, "STUDIO_FREE_DAILY_USD", 0, 20),
    rampDecksDaily: ramp === "" ? null : integer(raw, "STUDIO_RAMP_DECKS_DAILY", 1, 10_000),
    freeAlertDecks: integer(raw, "STUDIO_FREE_ALERT_DECKS", 1, 100_000),
    freeAlertPhotos: integer(raw, "STUDIO_FREE_ALERT_PHOTOS", 1, 100_000),
    ipYoungDecks: integer(raw, "STUDIO_IP_YOUNG_DECKS", 1, 1_000),
    ipYoungPhotos: integer(raw, "STUDIO_IP_YOUNG_PHOTOS", 1, 1_000),
    paidDailyUsdStop: usd(raw, "STUDIO_PAID_DAILY_USD_STOP", 1, 200),
    jobGlobalPerMin: integer(raw, "STUDIO_JOB_GLOBAL_PER_MIN", 1, 60),
    maxSlides: integer(raw, "STUDIO_MAX_SLIDES", DECK_SHAPES.full.minSlides, DECK_SHAPES.full.maxSlides),
    textModels: Object.freeze(modelList(raw, "STUDIO_TEXT_MODELS", TEXT_MODELS)),
    freeTextFallback: fallback === ""
      ? null
      : oneOf(fallback, FREE_TEXT_FALLBACKS) ?? (STUDIO_CONFIG_DEFAULTS.STUDIO_FREE_TEXT_FALLBACK as FreeTextFallback),
    visionModels: Object.freeze(modelList(raw, "STUDIO_VISION_MODELS", VISION_MODELS)),
    imageCheckModel: oneOf(text(raw, "STUDIO_IMAGE_CHECK_MODEL"), IMAGE_CHECK_MODELS)
      ?? (STUDIO_CONFIG_DEFAULTS.STUDIO_IMAGE_CHECK_MODEL as ImageCheckModel),
    aiLabel: text(raw, "STUDIO_AI_LABEL") !== "false",
    ga4Mp: exactly(raw, "STUDIO_GA4_MP", "true"),
    // Unlike the model lists, nothing left means nobody: a typo never falls back to a provider.
    paymentProviders: Object.freeze(namesOf(text(raw, "STUDIO_PAYMENT_PROVIDERS"), STUDIO_PROVIDERS)),
    paidProofread: text(raw, "STUDIO_PAID_PROOFREAD") !== "false",
  });
}

let cached: { json: unknown; config: StudioConfig } | null = null;

/**
 * The parsed settings, whatever the host: for Click's callback, the internal
 * endpoints and the maintenance tick. A browser-facing path uses
 * studioRequestConfig() or studioGate() instead.
 */
export function studioConfig(env: StudioEnv): StudioConfig {
  const json = env.STUDIO_RUNTIME_CONFIG_JSON;
  if (!cached || cached.json !== json) cached = { json, config: parseStudioConfig(json) };
  return cached.config;
}

/** The request's host may see the studio: gptbot.uz, or a local host with STUDIO_LOCAL_DEV=true. */
export function studioHostAllowed(url: URL | string, env: StudioEnv): boolean {
  let host: string;
  try {
    host = (typeof url === "string" ? new URL(url) : url).hostname;
  } catch {
    return false;
  }
  if (host === STUDIO_HOST) return true;
  return env.STUDIO_LOCAL_DEV === "true" && STUDIO_LOCAL_HOSTS.includes(host);
}

const SWITCHES_OFF = {
  api: false,
  paidService: false,
  freeDeck: false,
  fullDeck: false,
  photo: false,
  payments: "off",
  events: false,
  paymentProviders: Object.freeze([] as StudioProvider[]),
} as const satisfies Partial<StudioConfig>;

/**
 * The settings as `request` sees them. On any host but gptbot.uz (or a local
 * one under STUDIO_LOCAL_DEV) every switch is off and nobody sells. "test"
 * payments exist only on a local host: a test order is a local rehearsal
 * (spec §9.2; the cash desks on the site run live).
 */
export function studioRequestConfig(request: Request, env: StudioEnv): StudioConfig {
  const config = studioConfig(env);
  const url = new URL(request.url);
  if (!studioHostAllowed(url, env)) return Object.freeze({ ...config, ...SWITCHES_OFF });
  if (config.payments === "test" && url.hostname === STUDIO_HOST) return Object.freeze({ ...config, payments: "off" });
  return config;
}

const freeDeckOpen = (config: StudioConfig) => config.api && config.freeDeck;
const fullDeckOpen = (config: StudioConfig) => config.paidService && config.fullDeck;

/** What opens each browser-facing path (spec §6). */
export const STUDIO_ROUTES = {
  config: (config: StudioConfig) => config.api || config.paidService,
  me: (config: StudioConfig) => config.api || config.paidService,
  identity: (config: StudioConfig) => config.api,
  event: (config: StudioConfig) => config.api && config.events,
  /** Create a job; the body then says which deck, and that deck's own switch decides. */
  presentations: (config: StudioConfig) => freeDeckOpen(config) || fullDeckOpen(config),
  outline: fullDeckOpen,
  slides: (config: StudioConfig) => freeDeckOpen(config) || fullDeckOpen(config),
  images: (config: StudioConfig) => freeDeckOpen(config) || fullDeckOpen(config),
  regenerate: (config: StudioConfig) => config.paidService,
  /** Free photos need STUDIO_API and STUDIO_PHOTO; a paid one, STUDIO_PAID_SERVICE. */
  photo: (config: StudioConfig) => (config.api && config.photo) || config.paidService,
  checkout: (config: StudioConfig) => config.payments !== "off",
  orderCancel: (config: StudioConfig) => config.paidService,
} as const satisfies Record<string, (config: StudioConfig) => boolean>;

export type StudioRoute = keyof typeof STUDIO_ROUTES;

/** A deck kind is open on its own (after the body named it). */
export function deckOpen(config: StudioConfig, shape: "free" | "full"): boolean {
  return shape === "free" ? freeDeckOpen(config) : fullDeckOpen(config);
}

/**
 * The first line of every browser-facing /api/studio/* handler: a 404 when
 * the route is closed for this request (host or switches), otherwise null.
 * It reads only the URL and two variables: never the body, a cookie or D1.
 */
export function studioGate(request: Request, env: StudioEnv, route: StudioRoute): Response | null {
  return STUDIO_ROUTES[route](studioRequestConfig(request, env)) ? null : notFound();
}

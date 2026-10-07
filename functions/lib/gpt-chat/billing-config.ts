// Billing configuration: which payment providers run, in which mode, with
// which credentials, and what a live sale still lacks. Everything fails
// closed: a missing, malformed or unknown value means "off", never a default
// credential, and nothing here ever returns or logs a secret value.
//
// Providers (decision L17): GPT_PAYMENT_PROVIDERS lists the providers that
// may run at all ("click,uzum" when unset). Payme runs only when listed. A
// provider outside the list sells nothing and its callback route is a 404.
//
// Modes (decision L7): GPT_BILLING_MODE_CLICK, GPT_BILLING_MODE_UZUM and
// GPT_BILLING_MODE_PAYME ("test" | "live" | "off") set one provider's mode;
// empty falls back to GPT_BILLING_MODE, any other value is "off". Test is
// dark: only a rehearsal session (rehearsal.ts) sees a test provider and pays
// it. Payme sells live only with its own GPT_BILLING_MODE_PAYME = "live",
// never through the global fallback (liveReadiness).
//
// Credentials (decision L9): one secret per provider. Click reads
// GPT_CLICK_CREDENTIALS_JSON {"test"|"live": {service_id, merchant_id,
// secret_key, merchant_user_id}}; only while that secret is unset or empty,
// the legacy GPT_CLICK_* variables. Uzum reads UZUM_CREDENTIALS_JSON
// (uzum-config.ts). Payme reads the secrets GPT_PAYME_MERCHANT_ID (the cash
// desk, the same in test and live), GPT_PAYME_TEST_KEY and GPT_PAYME_KEY
// (the cash desk's test and production keys).
//
// Live (liveReadiness): a new live checkout needs every setting it lists.
import type { Env } from "../../_types";
import type { BridgeEnvExtras } from "./bridge-env";
import type { BotLoginMode } from "./bot-login-store";
import { fiscalIssues, type FiscalEnv } from "./fiscal-config";
import { resolveHandoffConfig } from "./handoff";
import { resolveHashSalt } from "./hash";
import { resolveOwnerNotify } from "./notify";
import {
  checkoutCredentials,
  merchantCredentials,
  uzumApi,
  uzumBaseUrl,
  uzumCheckoutConfig,
  uzumFiscalApiKey,
  uzumFiscalBaseUrl,
  type UzumEnv,
} from "./uzum-config";

export type BillingMode = "test" | "live";
export type LocalProvider = "payme" | "click" | "uzum";
// UZUM_* fields (public config plus the one secret UZUM_CREDENTIALS_JSON) are
// declared in uzum-config.ts and documented in docs/paid-chat/UZUM-RU.md.
export type BillingEnv = Env &
  UzumEnv &
  FiscalEnv &
  BridgeEnvExtras & {
    GPT_PAYMENT_PROVIDERS?: string;
    GPT_BILLING_MODE?: string;
    GPT_BILLING_MODE_CLICK?: string;
    GPT_BILLING_MODE_UZUM?: string;
    GPT_BILLING_MODE_PAYME?: string;
    GPT_BILLING_LIVE_READY?: string;
    /** Optional Telegram OIDC client; sign-in through the bot needs none. */
    GPT_TELEGRAM_CLIENT_ID?: string;
    GPT_TELEGRAM_CLIENT_SECRET?: string;
    /** Secret (≥ 32): keys the account identity hashes and the rehearsal cookie. */
    GPT_IDENTITY_SECRET?: string;
    GPT_PAYME_MERCHANT_ID?: string;
    GPT_PAYME_KEY?: string;
    GPT_PAYME_TEST_KEY?: string;
    /** Secret. {"test"|"live": {service_id, merchant_id, secret_key, merchant_user_id}} */
    GPT_CLICK_CREDENTIALS_JSON?: string;
    // Legacy Click variables, read only while GPT_CLICK_CREDENTIALS_JSON is unset.
    GPT_CLICK_SERVICE_ID?: string;
    GPT_CLICK_MERCHANT_ID?: string;
    GPT_CLICK_SECRET?: string;
    GPT_CLICK_TEST_SERVICE_ID?: string;
    GPT_CLICK_TEST_SECRET?: string;
    GPT_BILLING_MAINTENANCE_SECRET?: string;
    GPT_BILLING_TERMS_RU?: string;
    GPT_BILLING_TERMS_UZ?: string;
    GPT_BILLING_TERMS_VERSION?: string;
    /** YYYY-MM-DD the lawyer approved the offer the terms URLs point to. */
    GPT_BILLING_TERMS_APPROVED_AT?: string;
  };

export const BILLING_ORG = "gptbot-consumer";
export const PRICE_TIYIN = 2_000_000;
// A product allowance, not a profitability claim; model attempts have a separate cap.
export const PAID_MESSAGES = 300;
export const PAYMENT_TTL_MS = 43_200_000;
/** The product (decision L16): «AI paket» / «AI-пакет», plan id in the ledgers. */
export const PLAN_ID = "ai_paket";
/** Every provider the code knows, in the order the pack window offers them. */
export const PROVIDERS: readonly LocalProvider[] = ["click", "uzum", "payme"];
const DEFAULT_PROVIDERS = "click,uzum";
/** The setting that holds a provider's own mode (GPT_BILLING_MODE is the fallback). */
export const MODE_SETTING = {
  click: "GPT_BILLING_MODE_CLICK",
  uzum: "GPT_BILLING_MODE_UZUM",
  payme: "GPT_BILLING_MODE_PAYME",
} as const satisfies Record<LocalProvider, keyof BillingEnv>;
/** Secrets shorter than this count as unset. */
const MIN_SECRET_LENGTH = 32;

/** The providers GPT_PAYMENT_PROVIDERS allows ("click,uzum" when unset). */
export function paymentProviders(env: BillingEnv): LocalProvider[] {
  const listed = (env.GPT_PAYMENT_PROVIDERS ?? DEFAULT_PROVIDERS)
    .split(",")
    .map((name) => name.trim());
  return PROVIDERS.filter((provider) => listed.includes(provider));
}

/** The mode the settings give a provider, before the allowlist. */
function configuredMode(env: BillingEnv, provider: LocalProvider): BillingMode | null {
  const value = env[MODE_SETTING[provider]] || env.GPT_BILLING_MODE || "";
  return value === "test" || value === "live" ? value : null;
}

/** A provider's mode, or null when it is off or not in GPT_PAYMENT_PROVIDERS. */
export function providerMode(
  env: BillingEnv,
  provider: LocalProvider,
): BillingMode | null {
  return paymentProviders(env).includes(provider)
    ? configuredMode(env, provider)
    : null;
}

/** The providers currently in `mode`. */
export function providersInMode(env: BillingEnv, mode: BillingMode): LocalProvider[] {
  return PROVIDERS.filter((provider) => providerMode(env, provider) === mode);
}

/** Some provider runs, in test or live. */
export function billingActive(env: BillingEnv): boolean {
  return PROVIDERS.some((provider) => providerMode(env, provider) !== null);
}

/** Telegram's OIDC sign-in (optional): its client and the identity secret. */
export function identityReady(env: BillingEnv): boolean {
  return !!(
    env.GPT_TELEGRAM_CLIENT_ID &&
    env.GPT_TELEGRAM_CLIENT_SECRET &&
    (env.GPT_IDENTITY_SECRET?.length ?? 0) >= MIN_SECRET_LENGTH
  );
}

export type LoginMethod = "bot" | "oidc";

/**
 * GPT_BOT_LOGIN_MODE (decision L11): "pick" (empty means pick) — the bot
 * offers three numbers and the person presses the one the site shows; "code"
 * — the switch for when forwarded links get abused: the bot sends 6 digits
 * that are typed in on the site. Any other value turns sign-in through the
 * bot off.
 */
export function botLoginMode(env: BillingEnv): BotLoginMode | null {
  const value = env.GPT_BOT_LOGIN_MODE || "pick";
  return value === "pick" || value === "code" ? value : null;
}

/** Names of what sign-in through the bot @gptbotuz_bot lacks; empty means ready. */
function botLoginIssues(env: BillingEnv): string[] {
  return [
    ...((env.GPT_IDENTITY_SECRET?.length ?? 0) >= MIN_SECRET_LENGTH ? [] : ["GPT_IDENTITY_SECRET"]),
    // The bot answers only with both of its secrets (telegram/config.ts).
    ...(env.TELEGRAM_ASSISTANT_BOT_TOKEN ? [] : ["TELEGRAM_ASSISTANT_BOT_TOKEN"]),
    ...(env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET ? [] : ["TELEGRAM_ASSISTANT_WEBHOOK_SECRET"]),
    ...(resolveHandoffConfig(env).configured ? [] : ["GPT_HANDOFF_BOT_USERNAME"]),
    ...(botLoginMode(env) ? [] : ["GPT_BOT_LOGIN_MODE"]),
  ];
}

export function botLoginReady(env: BillingEnv): boolean {
  return botLoginIssues(env).length === 0;
}

/**
 * How a visitor can sign in: through the bot (the default) and, when its
 * client is configured, Telegram's OIDC. Whether anybody is offered them is
 * the caller's question: only while a provider is offered (rehearsal.ts
 * offeredLoginMethods).
 */
export function loginMethods(env: BillingEnv): LoginMethod[] {
  return [
    ...(botLoginReady(env) ? (["bot"] as const) : []),
    ...(identityReady(env) ? (["oidc"] as const) : []),
  ];
}

export function termsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "gptbot.uz" && !url.port && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/**
 * Guest checkout (identity-store.ts): buying without signing in, only while
 * GPT_GUEST_CHECKOUT is exactly "true". The offer edition the buyer accepts
 * must describe the guest account first (ai-paket-2026-10-v3 does).
 */
export function guestCheckoutOn(env: BillingEnv): boolean {
  return env.GPT_GUEST_CHECKOUT === "true";
}
/**
 * The providers a guest account may pay: those whose orders live in
 * gpt_payment_orders, which IdentityStore.adoptGuest moves to Telegram and a
 * support restore link finds by our pay_ number (guest-restore.ts). Uzum
 * keeps its orders in its own table, so it needs a signed-in account. The
 * pack window offers a guest Click, and Payme once it is live (one tap, 07.10).
 */
export const GUEST_PROVIDERS: readonly LocalProvider[] = ["click", "payme"];
export function guestProvider(provider: unknown): boolean {
  return (GUEST_PROVIDERS as readonly unknown[]).includes(provider);
}
export function termsVersion(env: BillingEnv): string | null {
  const value = env.GPT_BILLING_TERMS_VERSION || "";
  return /^[a-zA-Z0-9._-]{1,80}$/.test(value) ? value : null;
}

/** GPT_BILLING_TERMS_APPROVED_AT as a real calendar date that has come, else null. */
function termsApprovedAt(env: BillingEnv, now: number): string | null {
  const value = env.GPT_BILLING_TERMS_APPROVED_AT || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) &&
    new Date(at).toISOString().slice(0, 10) === value &&
    at <= now
    ? value
    : null;
}

export interface ClickCredentials {
  serviceId: string;
  /** Live checkout links need it; a test account may have none. */
  merchantId: string | null;
  secretKey: string;
  /** Merchant API user (fiscal receipts, reversal); absent from the legacy variables. */
  merchantUserId: string | null;
}
type ClickField = "service_id" | "merchant_id" | "secret_key" | "merchant_user_id";
const CLICK_FIELDS: readonly ClickField[] = [
  "service_id",
  "merchant_id",
  "secret_key",
  "merchant_user_id",
];

function clickId(value: unknown): string | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === "string" && /^[1-9]\d{0,11}$/.test(text) ? text : null;
}
function clickSecret(value: unknown): string | null {
  return typeof value === "string" && /^[\x21-\x7e]{8,256}$/.test(value) ? value : null;
}
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The object a JSON secret holds, or null when it is anything else. */
function jsonRecord(raw: string): Record<string, unknown> | null {
  if (raw.length > 4096) return null;
  try {
    return record(JSON.parse(raw));
  } catch {
    return null;
  }
}

interface ClickSource {
  from: "json" | "legacy";
  /** The name to report when the secret itself or its mode block is unusable. */
  broken: string | null;
  fields: Partial<Record<ClickField, string>>;
}

/**
 * The Click fields one mode has, validated, and where they came from. A
 * broken GPT_CLICK_CREDENTIALS_JSON is "nothing", never the legacy fallback.
 */
function clickSource(env: BillingEnv, mode: BillingMode): ClickSource {
  const raw = env.GPT_CLICK_CREDENTIALS_JSON;
  if (raw) {
    const parsed = jsonRecord(raw);
    const block = record(parsed?.[mode]);
    if (!block)
      return {
        from: "json",
        broken: parsed ? `GPT_CLICK_CREDENTIALS_JSON.${mode}` : "GPT_CLICK_CREDENTIALS_JSON",
        fields: {},
      };
    return {
      from: "json",
      broken: null,
      fields: {
        service_id: clickId(block.service_id) ?? undefined,
        merchant_id: clickId(block.merchant_id) ?? undefined,
        secret_key: clickSecret(block.secret_key) ?? undefined,
        merchant_user_id: clickId(block.merchant_user_id) ?? undefined,
      },
    };
  }
  const legacy =
    mode === "test"
      ? { service: env.GPT_CLICK_TEST_SERVICE_ID, secret: env.GPT_CLICK_TEST_SECRET, merchant: undefined }
      : { service: env.GPT_CLICK_SERVICE_ID, secret: env.GPT_CLICK_SECRET, merchant: env.GPT_CLICK_MERCHANT_ID };
  return {
    from: "legacy",
    broken: null,
    fields: {
      service_id: clickId(legacy.service) ?? undefined,
      merchant_id: clickId(legacy.merchant) ?? undefined,
      secret_key: clickSecret(legacy.secret) ?? undefined,
    },
  };
}

/** Click's credentials for `mode`: at least the service id and the secret key. */
export function clickCredentials(
  env: BillingEnv,
  mode: BillingMode,
): ClickCredentials | null {
  const { fields } = clickSource(env, mode);
  if (!fields.service_id || !fields.secret_key) return null;
  return {
    serviceId: fields.service_id,
    merchantId: fields.merchant_id ?? null,
    secretKey: fields.secret_key,
    merchantUserId: fields.merchant_user_id ?? null,
  };
}

/**
 * The Payme cash desk's key for `mode` (the password of Basic auth, login
 * "Paycom"), or "" when it is unset or not a printable ASCII word of 16..128
 * characters. Surrounding whitespace (a newline pasted with the secret) is
 * not part of it.
 */
export function paymeKey(env: BillingEnv, mode: BillingMode): string {
  const value = ((mode === "test" ? env.GPT_PAYME_TEST_KEY : env.GPT_PAYME_KEY) || "").trim();
  return /^[\x21-\x7e]{16,128}$/.test(value) ? value : "";
}

/** The Payme cash desk id (24 hex, the same in test and live), or null. */
export function paymeMerchantId(env: BillingEnv): string | null {
  const value = (env.GPT_PAYME_MERCHANT_ID || "").trim();
  return /^[0-9a-fA-F]{24}$/.test(value) ? value : null;
}

/** The provider's protocol credentials for `mode` are present and valid. */
export function providerConfigured(
  env: BillingEnv,
  provider: LocalProvider,
  mode: BillingMode,
): boolean {
  if (provider === "uzum") {
    // Checkout also needs a valid base URL and, when auto-fiscalization is on,
    // complete receipt parameters; Merchant API needs its service credentials.
    const api = uzumApi(env);
    return api === "checkout"
      ? !!uzumCheckoutConfig(env, mode)
      : api === "merchant" && !!merchantCredentials(env, mode);
  }
  if (provider === "payme") return !!paymeKey(env, mode) && !!paymeMerchantId(env);
  const click = clickCredentials(env, mode);
  return !!click && (mode === "test" || !!click.merchantId);
}

/** Names of the provider's own live settings that are missing or invalid. */
function providerLiveIssues(env: BillingEnv, provider: LocalProvider): string[] {
  if (provider === "payme")
    // Payme prints both receipts itself, from the `detail` our
    // CheckPerformTransaction sends (payme-checkout.ts): its line needs the
    // fiscal codes, not the TIN (the cash desk is the seller's own). Live
    // takes Payme's own switch: a global GPT_BILLING_MODE = "live" alone
    // never sells Payme.
    return [
      ...(env.GPT_BILLING_MODE_PAYME === "live" ? [] : ["GPT_BILLING_MODE_PAYME"]),
      ...(paymeKey(env, "live") ? [] : ["GPT_PAYME_KEY"]),
      ...(paymeMerchantId(env) ? [] : ["GPT_PAYME_MERCHANT_ID"]),
      ...fiscalIssues(env, { tin: false }),
    ];
  if (provider === "click") {
    const source = clickSource(env, "live");
    const missing = CLICK_FIELDS.filter((field) => !source.fields[field]);
    // The legacy variables never carry merchant_user_id: only the secret does.
    const credentials = source.broken
      ? [source.broken]
      : source.from === "legacy" && missing.some((field) => field !== "merchant_user_id")
        ? ["GPT_CLICK_CREDENTIALS_JSON"]
        : missing.map((field) => `GPT_CLICK_CREDENTIALS_JSON.live.${field}`);
    // The Click receipt (ofd_data) carries the seller's TIN as well.
    return [...credentials, ...fiscalIssues(env, { tin: true })];
  }
  const api = uzumApi(env);
  if (!api) return ["UZUM_API", ...fiscalIssues(env, { tin: false })];
  const issues =
    api === "checkout"
      ? [
          ...(checkoutCredentials(env, "live") ? [] : ["UZUM_CREDENTIALS_JSON.checkout.live"]),
          ...(uzumBaseUrl(env, "live") ? [] : ["UZUM_CHECKOUT_BASE_URL"]),
        ]
      : [...(merchantCredentials(env, "live") ? [] : ["UZUM_CREDENTIALS_JSON.merchant.live"])];
  // A live sale prints its receipt. A card payment: by Uzum's
  // auto-fiscalization, or else through the Fiscalization API, which every
  // in-app payment uses (fiscal-store.ts).
  const fiscalKey = uzumFiscalApiKey(env, "live");
  if (api === "checkout" && env.UZUM_AUTOFISCAL !== "true" && !fiscalKey)
    issues.push("UZUM_AUTOFISCAL");
  else if (api === "merchant" || env.UZUM_AUTOFISCAL !== "true") {
    if (!fiscalKey) issues.push("UZUM_CREDENTIALS_JSON.fiscal.live.apiKey");
    if (!uzumFiscalBaseUrl(env, "live")) issues.push("UZUM_FISCAL_BASE_URL");
  }
  return [...issues, ...fiscalIssues(env, { tin: false })];
}

/**
 * The names of every setting a live checkout of `provider` still lacks, in a
 * stable order; empty means ready. Names only: never a value, never a hint of
 * one. The admin panel and the release runbook print this list as it is.
 */
export function liveReadiness(
  env: BillingEnv,
  provider: LocalProvider,
  now = Date.now(),
): string[] {
  const missing: string[] = [];
  if (!paymentProviders(env).includes(provider)) missing.push("GPT_PAYMENT_PROVIDERS");
  if (configuredMode(env, provider) !== "live") missing.push(MODE_SETTING[provider]);
  if (env.GPT_BILLING_LIVE_READY !== "true") missing.push("GPT_BILLING_LIVE_READY");
  if (!termsUrl(env.GPT_BILLING_TERMS_RU)) missing.push("GPT_BILLING_TERMS_RU");
  if (!termsUrl(env.GPT_BILLING_TERMS_UZ)) missing.push("GPT_BILLING_TERMS_UZ");
  if (!termsVersion(env)) missing.push("GPT_BILLING_TERMS_VERSION");
  if (!termsApprovedAt(env, now)) missing.push("GPT_BILLING_TERMS_APPROVED_AT");
  missing.push(...providerLiveIssues(env, provider));
  if (!env.GPTBOT_DRAFTS_DB) missing.push("GPTBOT_DRAFTS_DB");
  // The owner hears about a failed payment or receipt.
  const notify = resolveOwnerNotify(env);
  if (!notify.token) missing.push("GPT_NOTIFY_BOT_TOKEN");
  if (!notify.chatId) missing.push("GPT_NOTIFY_CHAT_ID");
  if (env.GPT_ALERTS_ENABLED === "false") missing.push("GPT_ALERTS_ENABLED");
  // IP hashes are salted (D7) before anyone pays.
  const salt = resolveHashSalt(env);
  if (!salt.hashSalt) missing.push("GPT_HASH_SALT");
  if (salt.hashSaltSince === null || salt.hashSaltSince > now)
    missing.push("GPT_HASH_SALT_SINCE");
  if ((env.GPT_IDENTITY_SECRET?.length ?? 0) < MIN_SECRET_LENGTH)
    missing.push("GPT_IDENTITY_SECRET");
  // The maintenance cron (outbox, receipts, reconciliation) authenticates with it.
  if ((env.GPT_BILLING_MAINTENANCE_SECRET?.length ?? 0) < MIN_SECRET_LENGTH)
    missing.push("GPT_BILLING_MAINTENANCE_SECRET");
  // A payer must be able to sign in: through the bot, which needs no
  // BotFather client (Telegram's OIDC is optional and never required).
  if (!loginMethods(env).length) missing.push(...botLoginIssues(env));
  return [...new Set(missing)];
}

/**
 * New checkouts of `provider`: its mode, its protocol credentials and, in
 * live, an empty liveReadiness(). The callback routes gate on the mode and
 * the credentials alone, so that switching live off (GPT_BILLING_LIVE_READY)
 * stops new sales without stranding a payment already on its way.
 */
export function providerReady(env: BillingEnv, provider: LocalProvider): boolean {
  const mode = providerMode(env, provider);
  if (!mode || !providerConfigured(env, provider, mode)) return false;
  return mode === "test" || liveReadiness(env, provider).length === 0;
}

/**
 * The providers a visitor in `mode` is offered: live ones to everyone, test
 * ones in a rehearsal session only (the caller passes the viewer's mode).
 * Uzum is offered in either flow; the account view says which (uzumFlow).
 */
export function offeredProviders(env: BillingEnv, mode: BillingMode): LocalProvider[] {
  return PROVIDERS.filter(
    (provider) => providerMode(env, provider) === mode && providerReady(env, provider),
  );
}

/**
 * How Uzum is paid when it is offered: "checkout" sends the visitor to
 * Uzum's card page; "code" shows the permanent payment code to enter in the
 * Uzum Bank app (Merchant API, payment-code-store.ts).
 */
export function uzumFlow(env: BillingEnv): "checkout" | "code" | null {
  const api = uzumApi(env);
  return api === "checkout" ? "checkout" : api === "merchant" ? "code" : null;
}

export function addCalendarMonth(start: number): number {
  const date = new Date(start);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

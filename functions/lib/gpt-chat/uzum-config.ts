// Uzum Bank configuration: which API is active, the packed credentials secret
// and the host allowlist that keeps the API key from being sent anywhere else.
//
// Sources (official, public, fetched 2026-09-30; copies in docs/paid-chat/uzum-spec/):
//   https://developer.uzumbank.uz/en/
//   https://developer.uzumbank.uz/redocusaurus/en_checkout.yaml  (Uzum Checkout 1.10.3)
//   https://developer.uzumbank.uz/redocusaurus/en_merchant.yaml  (Merchant API 1.0.0)
//
// Everything here fails closed: a missing, malformed or partial value means
// "Uzum is off", never a default credential. Values are never logged.
import type { Env } from "../../_types";
import { fiscalParams, type FiscalEnv } from "./fiscal-config";

export type UzumApi = "checkout" | "merchant";
type Mode = "test" | "live";

/** Only the fields this module reads; BillingEnv in billing-config.ts carries them. */
export type UzumEnv = Env &
  FiscalEnv & {
    UZUM_API?: string;
    UZUM_CHECKOUT_BASE_URL?: string;
    UZUM_CHECKOUT_TEST_BASE_URL?: string;
    UZUM_AUTOFISCAL?: string;
    /** Secret. {"checkout":{"test":{"terminalId","apiKey"},"live":{…}},
     *  "merchant":{"test":{"serviceId","login","password"},"live":{…}},
     *  "fiscal":{"test":{"apiKey"},"live":{…}}} */
    UZUM_CREDENTIALS_JSON?: string;
  };

export interface UzumCheckoutCredentials {
  terminalId: string;
  apiKey: string;
}
export interface UzumMerchantCredentials {
  serviceId: number;
  login: string;
  password: string;
}
export interface UzumFiscal {
  spic: string;
  packageCode: string;
  vatPercent: number;
}
export interface UzumCheckoutConfig {
  baseUrl: string;
  terminalId: string;
  apiKey: string;
  /** null when auto-fiscalization is off (the Uzum default). */
  fiscal: UzumFiscal | null;
}

// UNVERIFIED allowlist. The public spec names no API host; these are the
// bank's own domains. If Uzum hands over a host outside them, extend this one
// line — it exists so a typo or a hostile config value cannot receive the key.
export const UZUM_HOST_PATTERN = /(^|\.)(uzumbank\.uz|uzumcheckout\.uz|uzum\.uz)$/;
// Fiscal receipts are served by the tax authority (ofd.soliq.uz) as well.
export const UZUM_RECEIPT_HOST_PATTERN = /(^|\.)(uzumbank\.uz|uzumcheckout\.uz|uzum\.uz|soliq\.uz)$/;
// UNVERIFIED: taken from a third-party SDK (pkg.go.dev/github.com/tergeoo/
// payment-providers-go/uzum), not from Uzum. There is deliberately no
// production default: UZUM_CHECKOUT_BASE_URL must come from the Uzum manager.
export const UZUM_DEFAULT_TEST_BASE_URL = "https://test-chk-api.uzumcheckout.uz";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function uzumApi(env: UzumEnv): UzumApi | null {
  return env.UZUM_API === "checkout" || env.UZUM_API === "merchant"
    ? env.UZUM_API
    : null;
}

function parsedCredentials(env: UzumEnv): Record<string, unknown> | null {
  const raw = env.UZUM_CREDENTIALS_JSON;
  if (typeof raw !== "string" || !raw || raw.length > 8192) return null;
  try {
    return record(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function checkoutCredentials(
  env: UzumEnv,
  mode: Mode,
): UzumCheckoutCredentials | null {
  const value = record(record(parsedCredentials(env)?.checkout)?.[mode]);
  if (!value) return null;
  const { terminalId, apiKey } = value;
  // The spec types X-API-Key as an opaque string; accept header-safe tokens only.
  if (
    !isUuid(terminalId) ||
    typeof apiKey !== "string" ||
    !/^[A-Za-z0-9._~+/=-]{16,256}$/.test(apiKey)
  )
    return null;
  return { terminalId, apiKey };
}

export function merchantCredentials(
  env: UzumEnv,
  mode: Mode,
): UzumMerchantCredentials | null {
  const value = record(record(parsedCredentials(env)?.merchant)?.[mode]);
  if (!value) return null;
  const serviceId = value.serviceId;
  const { login, password } = value;
  // Basic auth: the login cannot contain ':'; both must be printable ASCII.
  if (
    typeof serviceId !== "number" ||
    !Number.isSafeInteger(serviceId) ||
    serviceId <= 0 ||
    typeof login !== "string" ||
    !/^[\x21-\x39\x3b-\x7e]{1,128}$/.test(login) ||
    typeof password !== "string" ||
    !/^[\x21-\x7e]{8,256}$/.test(password)
  )
    return null;
  return { serviceId, login, password };
}

function checkedUrl(value: unknown, host: RegExp): URL | null {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      host.test(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

/** Uzum Checkout API base for the mode: https, allowlisted host, no query. */
export function uzumBaseUrl(env: UzumEnv, mode: Mode): string | null {
  const configured =
    mode === "test"
      ? env.UZUM_CHECKOUT_TEST_BASE_URL || UZUM_DEFAULT_TEST_BASE_URL
      : env.UZUM_CHECKOUT_BASE_URL;
  const url = checkedUrl(configured, UZUM_HOST_PATTERN);
  if (!url || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Payment page returned by /payment/register; the browser is sent there. */
export function allowedUzumRedirect(value: unknown): string | null {
  return checkedUrl(value, UZUM_HOST_PATTERN)?.href ?? null;
}

/** Fiscal receipt link shown to the payer. */
export function allowedUzumReceipt(value: unknown): string | null {
  return checkedUrl(value, UZUM_RECEIPT_HOST_PATTERN)?.href ?? null;
}

/**
 * Auto-fiscalization parameters: the shared GPT_FISCAL_* settings
 * (fiscal-config.ts). `undefined` = off; `null` = switched on but incomplete
 * (which keeps Uzum unavailable rather than selling without a receipt the
 * terminal expects).
 */
export function uzumFiscal(env: UzumEnv): UzumFiscal | null | undefined {
  if (env.UZUM_AUTOFISCAL !== "true") return undefined;
  const params = fiscalParams(env);
  return params
    ? { spic: params.ikpu, packageCode: params.packageCode, vatPercent: params.vatPercent }
    : null;
}

/** The Uzum Fiscalization API key of one mode (Merchant API receipts), or null. */
export function uzumFiscalApiKey(env: UzumEnv, mode: Mode): string | null {
  const apiKey = record(record(parsedCredentials(env)?.fiscal)?.[mode])?.apiKey;
  return typeof apiKey === "string" && /^[A-Za-z0-9._~+/=-]{16,256}$/.test(apiKey)
    ? apiKey
    : null;
}

/**
 * Client config for one mode. Strict (default) also requires complete
 * auto-fiscalization parameters when UZUM_AUTOFISCAL=true: /register and
 * /refund must carry the cart then. `settleOnly` is for callbacks and status
 * pulls, which never send a cart, so a fiscal misconfiguration cannot strand
 * the confirmation of an order that is already being paid.
 */
export function uzumCheckoutConfig(
  env: UzumEnv,
  mode: Mode,
  options: { settleOnly?: boolean } = {},
): UzumCheckoutConfig | null {
  const credentials = checkoutCredentials(env, mode);
  const baseUrl = uzumBaseUrl(env, mode);
  const fiscal = uzumFiscal(env);
  if (!credentials || !baseUrl || (fiscal === null && !options.settleOnly))
    return null;
  return { baseUrl, ...credentials, fiscal: fiscal ?? null };
}

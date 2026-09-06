import type { Env } from "../../_types";

export type BillingMode = "test" | "live";
export type LocalProvider = "payme" | "click";
export type BillingEnv = Env & {
  GPT_BILLING_MODE?: string;
  GPT_BILLING_LIVE_READY?: string;
  GPT_TELEGRAM_CLIENT_ID?: string;
  GPT_TELEGRAM_CLIENT_SECRET?: string;
  GPT_IDENTITY_SECRET?: string;
  GPT_PAYME_MERCHANT_ID?: string;
  GPT_PAYME_KEY?: string;
  GPT_PAYME_TEST_KEY?: string;
  GPT_CLICK_SERVICE_ID?: string;
  GPT_CLICK_MERCHANT_ID?: string;
  GPT_CLICK_SECRET?: string;
  GPT_CLICK_TEST_SERVICE_ID?: string;
  GPT_CLICK_TEST_SECRET?: string;
  GPT_BILLING_MAINTENANCE_SECRET?: string;
  GPT_BILLING_TERMS_RU?: string;
  GPT_BILLING_TERMS_UZ?: string;
  GPT_BILLING_TERMS_VERSION?: string;
};

export const BILLING_ORG = "gptbot-consumer";
export const PRICE_TIYIN = 2_000_000;
// A product allowance, not a profitability claim; model attempts have a separate cap.
export const PAID_MESSAGES = 300;
export const PAYMENT_TTL_MS = 43_200_000;
export function billingMode(env: BillingEnv): BillingMode | null {
  return env.GPT_BILLING_MODE === "test" || env.GPT_BILLING_MODE === "live"
    ? env.GPT_BILLING_MODE
    : null;
}
export function identityReady(env: BillingEnv): boolean {
  return !!(
    env.GPT_TELEGRAM_CLIENT_ID &&
    env.GPT_TELEGRAM_CLIENT_SECRET &&
    (env.GPT_IDENTITY_SECRET?.length ?? 0) >= 32
  );
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
export function termsVersion(env: BillingEnv): string | null {
  const value = env.GPT_BILLING_TERMS_VERSION || "";
  return /^[a-zA-Z0-9._-]{1,80}$/.test(value) ? value : null;
}
export function providerKey(
  env: BillingEnv,
  provider: LocalProvider,
  mode: BillingMode,
): string {
  return (
    (provider === "payme"
      ? mode === "test"
        ? env.GPT_PAYME_TEST_KEY
        : env.GPT_PAYME_KEY
      : mode === "test"
        ? env.GPT_CLICK_TEST_SECRET
        : env.GPT_CLICK_SECRET) || ""
  );
}
export function providerReady(
  env: BillingEnv,
  provider: LocalProvider,
): boolean {
  const mode = billingMode(env);
  if (!mode || !providerKey(env, provider, mode)) return false;
  if (
    mode === "live" &&
    (env.GPT_BILLING_LIVE_READY !== "true" ||
      !termsUrl(env.GPT_BILLING_TERMS_RU) ||
      !termsUrl(env.GPT_BILLING_TERMS_UZ) || !termsVersion(env))
  )
    return false;
  return provider === "payme"
    ? !!env.GPT_PAYME_MERCHANT_ID
    : !!(mode === "test"
        ? env.GPT_CLICK_TEST_SERVICE_ID
        : env.GPT_CLICK_SERVICE_ID && env.GPT_CLICK_MERCHANT_ID);
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

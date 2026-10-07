// Which payment providers sell studio tariffs now, and their payment pages
// (DECISIONS 07.10.2026 §12; spec §9.2).
//
// A provider sells only when all of these hold:
//   - it is listed in STUDIO_PAYMENT_PROVIDERS (config.ts; "" sells nothing;
//     the release sets "click" first: on 07.10 Payme's cash desk went back
//     to test, so Payme joins the list when the desk is live again);
//   - STUDIO_PAYMENTS is "test" or "live" (studioRequestConfig turns "test"
//     off on gptbot.uz: a test order exists only in a local rehearsal), and
//     what is sold can be spent: STUDIO_PAID_SERVICE and STUDIO_FULL_DECK
//     are on (salesOpen);
//   - Payme: the chat's cash desk runs in that very mode
//     (GPT_BILLING_MODE_PAYME through providerMode, so also listed in
//     GPT_PAYMENT_PROVIDERS), with its key and cash desk id, and in live the
//     fiscal codes its receipt line needs (else CheckPerformTransaction
//     would refuse every payment). One cash desk, one endpoint
//     (/api/payments/payme), one mode: when the desk goes back to test, the
//     studio sells nothing through Payme;
//   - Click: Click confirmed the
//     amounts in writing (STUDIO_CLICK_AMOUNTS_CONFIRMED) and the secret
//     STUDIO_CLICK_CREDENTIALS_JSON has the mode's service, merchant (live)
//     and key of the service Click creates for the studio. An explicit
//     STUDIO_CLICK_USE_CHAT_SERVICE instead selects the approved chat service
//     and its active mode; missing shared credentials never fall back.
// Nothing here returns or logs a secret value; /config gets provider names.
//
// The payment page is built for the order's own amount (5 900 or 39 900
// so‘m), never the chat's price:
//   Payme  <PAYME_CHECKOUT_BASE[mode]>/<base64("m=<desk>;ac.order_id=stu_…;a=<tiyin>;c=<return>;l=<uz|ru>;ct=<ms>")>
//   Click  https://my.click.uz/services/pay/?service_id&merchant_id&amount=<so‘m>&transaction_param=stu_…&return_url
// The buyer comes back to the studio page they paid from, with ?pay=return.
import type { BillingEnv, BillingMode } from "../gpt-chat/billing-config";
import { clickCredentials, paymeKey, paymeMerchantId, providerMode } from "../gpt-chat/billing-config";
import { clickFiscalPolicy, fiscalParams, fiscalTin } from "../gpt-chat/fiscal-config";
import { PAYME_CHECKOUT_BASE, PAYME_RETURN_DELAY_MS } from "../gpt-chat/payme-checkout";
import { parseStudioConfig, type StudioConfig } from "./config";
import { REQUEST_ID } from "./ledger";
import { STUDIO_PLAN_IDS, planFor, type StudioPlan, type StudioPlanId, type StudioProvider } from "./plans";

/** The order of preference when the browser names no provider: Click (the launch provider), then Payme. */
export const STUDIO_PROVIDER_ORDER: readonly StudioProvider[] = ["click", "payme"];

/** Studio pages a buyer may come back to (?pay=return); anything else gets the page of the language. */
export const STUDIO_RETURN_PATHS: readonly string[] = ["/uz/taqdimot-ai/", "/ru/prezentatsiya-ai/", "/uz/rasmdan-yechim/", "/uz/tariflar/"];
const DEFAULT_RETURN_PATH = { uz: "/uz/taqdimot-ai/", ru: "/ru/prezentatsiya-ai/" } as const;

/** Click's payment page. */
export const CLICK_PAY_BASE = "https://my.click.uz/services/pay/";

export type StudioClickEnv = Pick<BillingEnv, "STUDIO_CLICK_CREDENTIALS_JSON" | "GPT_CLICK_CREDENTIALS_JSON" | "STUDIO_RUNTIME_CONFIG_JSON">;

/** The chosen Click service for one mode (separate, or explicitly shared). */
export interface StudioClickCredentials {
  readonly serviceId: string;
  /** Live checkout links need it. */
  readonly merchantId: string | null;
  readonly secretKey: string;
  /** Merchant API user (receipts, reversal). */
  readonly merchantUserId: string | null;
}

function clickId(value: unknown): string | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === "string" && /^[1-9]\d{0,11}$/.test(text) ? text : null;
}

function clickSecret(value: unknown): string | null {
  return typeof value === "string" && /^[\x21-\x7e]{8,256}$/.test(value) ? value : null;
}

/**
 * STUDIO_CLICK_CREDENTIALS_JSON {"test"|"live": {service_id, merchant_id,
 * secret_key, merchant_user_id}} for `mode` (the chat's shape), or null
 * when the secret or its mode block is missing or malformed. Stream D's
 * callback route reads the same. Explicit shared mode instead reads only
 * GPT_CLICK_CREDENTIALS_JSON through the chat's validated mode resolver.
 */
export function studioClickCredentials(env: StudioClickEnv, mode: BillingMode): StudioClickCredentials | null {
  if (parseStudioConfig(env.STUDIO_RUNTIME_CONFIG_JSON).clickUseChatService) return env.GPT_CLICK_CREDENTIALS_JSON ? clickCredentials(env as BillingEnv, mode) : null;
  const raw = env.STUDIO_CLICK_CREDENTIALS_JSON;
  if (!raw || raw.length > 4096) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const block = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>)[mode] : null;
  if (typeof block !== "object" || block === null || Array.isArray(block)) return null;
  const fields = block as Record<string, unknown>;
  const serviceId = clickId(fields.service_id);
  const secretKey = clickSecret(fields.secret_key);
  if (!serviceId || !secretKey) return null;
  return { serviceId, merchantId: clickId(fields.merchant_id), secretKey, merchantUserId: clickId(fields.merchant_user_id) };
}

/** What an order of `provider` is made with now: its mode and, for Click, the service. */
export interface ReadyProvider {
  readonly provider: StudioProvider;
  readonly mode: BillingMode;
  readonly serviceId: string | null;
}

/**
 * Studio tariffs may be sold at all: payments are on (STUDIO_PAYMENTS), and
 * what a tariff buys can be spent: STUDIO_PAID_SERVICE (the paid paths) and
 * STUDIO_FULL_DECK (every quota version holds full decks). Otherwise no
 * provider sells, /config lists none («To‘lov vaqtincha to‘xtatilgan») and
 * checkout answers 503 checkout_unavailable.
 */
export function salesOpen(config: Pick<StudioConfig, "payments" | "paidService" | "fullDeck">): config is Pick<StudioConfig, "paidService" | "fullDeck"> & { readonly payments: BillingMode } {
  return config.payments !== "off" && config.paidService && config.fullDeck;
}

/** `provider` sells now (see the header), or null. */
export function readyProvider(env: BillingEnv, config: StudioConfig, provider: StudioProvider): ReadyProvider | null {
  if (!salesOpen(config) || !config.paymentProviders.includes(provider)) return null;
  const mode: BillingMode = config.payments;
  if (provider === "payme") {
    if (providerMode(env, "payme") !== mode) return null;
    if (!paymeKey(env, mode) || !paymeMerchantId(env)) return null;
    if (mode === "live" && !fiscalParams(env)) return null;
    return { provider, mode, serviceId: null };
  }
  if (!config.clickAmountsConfirmed) return null;
  if (config.clickUseChatService && providerMode(env, "click") !== mode) return null;
  const click = studioClickCredentials(env, mode);
  if (!click || (mode === "live" && (!click.merchantId || !click.merchantUserId))) return null;
  const autoFiscal = config.clickUseChatService ? clickFiscalPolicy(env).mode === "auto" : config.clickAutofiscal === "true";
  if (mode === "live" && !autoFiscal && (!fiscalParams(env) || !fiscalTin(env))) return null;
  return { provider, mode, serviceId: click.serviceId };
}

/** The providers that sell now, in the order the window offers them (/config, checkout). */
export function readyProviders(env: BillingEnv, config: StudioConfig): StudioProvider[] {
  return STUDIO_PROVIDER_ORDER.filter((provider) => readyProvider(env, config, provider) !== null);
}

/** Where the payment page sends the buyer back: the studio page they paid from, with ?pay=return. */
export function studioReturnUrl(origin: string, locale: "uz" | "ru", returnPath: unknown): string {
  const path = typeof returnPath === "string" && STUDIO_RETURN_PATHS.includes(returnPath) ? returnPath : DEFAULT_RETURN_PATH[locale];
  return `${origin}${path}?pay=return`;
}

/**
 * Payme's page for the order `orderId` of `amountTiyin` in `mode`, or null
 * without a valid cash desk id or with a value that would break Payme's
 * `key=value;…` format.
 */
export function studioPaymeCheckoutUrl(
  env: BillingEnv,
  mode: BillingMode,
  orderId: string,
  amountTiyin: number,
  locale: "uz" | "ru",
  back: string,
): string | null {
  const merchant = paymeMerchantId(env);
  if (!merchant || /[;\s]/.test(orderId) || /[;\s]/.test(back) || !Number.isSafeInteger(amountTiyin) || amountTiyin <= 0) return null;
  const params = [`m=${merchant}`, `ac.order_id=${orderId}`, `a=${amountTiyin}`, `c=${back}`, `l=${locale}`, `ct=${PAYME_RETURN_DELAY_MS}`].join(";");
  return `${PAYME_CHECKOUT_BASE[mode]}/${btoa(params)}`;
}

/** Click's page for the chosen service and order amount, or null without a live merchant id. */
export function studioClickCheckoutUrl(
  env: StudioClickEnv,
  orderId: string,
  amountTiyin: number,
  back: string,
): string | null {
  const click = studioClickCredentials(env, "live");
  if (!click?.merchantId) return null;
  return `${CLICK_PAY_BASE}?${new URLSearchParams({
    service_id: click.serviceId,
    merchant_id: click.merchantId,
    amount: (amountTiyin / 100).toFixed(2),
    transaction_param: orderId,
    return_url: back,
  })}`;
}

/** A tariff as /config shows it (apps/studio/src/api.ts StudioPlanOffer). */
export interface PublicPlan {
  readonly id: StudioPlanId;
  readonly itemId: string;
  readonly amountTiyin: number;
  readonly amountUzs: number;
  readonly duration: StudioPlan["duration"];
  readonly presentationFull: number;
  readonly photoTask: number;
  readonly regenPerUnit: number;
}

/**
 * The tariffs the offer edition `termsVersion` sells, Kunlik then Oylik, as
 * /config answers them and the tariffs page prints them (stream F's
 * prerender, apps/studio/src/billing/static.ts); [] for an edition that
 * sells none (TERMS_PLAN).
 */
export function publicPlans(termsVersion: string): PublicPlan[] {
  return STUDIO_PLAN_IDS.flatMap((id) => {
    const plan = planFor(termsVersion, id);
    return plan
      ? [{
          id,
          itemId: plan.itemId,
          amountTiyin: plan.amountTiyin,
          amountUzs: plan.amountTiyin / 100,
          duration: plan.duration,
          presentationFull: plan.presentationFull,
          photoTask: plan.photoTask,
          regenPerUnit: plan.regenPerUnit,
        }]
      : [];
  });
}

/** What POST /api/studio/checkout asks for. */
export interface CheckoutBody {
  readonly plan: StudioPlanId;
  readonly requestId: string;
  readonly locale: "uz" | "ru";
  readonly termsVersion: string;
  readonly provider: StudioProvider | null;
  readonly returnPath: unknown;
  readonly turnstileToken: unknown;
  readonly raw: Record<string, unknown>;
}

/** The body's fields, or null when any required one is missing or malformed. */
export function readCheckoutBody(value: unknown): CheckoutBody | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.acceptTerms !== true) return null;
  if (typeof raw.plan !== "string" || !(STUDIO_PLAN_IDS as readonly string[]).includes(raw.plan)) return null;
  if (typeof raw.requestId !== "string" || !REQUEST_ID.test(raw.requestId)) return null;
  if (raw.locale !== "uz" && raw.locale !== "ru") return null;
  if (typeof raw.termsVersion !== "string" || raw.termsVersion.length > 64) return null;
  if (raw.provider !== undefined && raw.provider !== null && raw.provider !== "payme" && raw.provider !== "click") return null;
  return {
    plan: raw.plan as StudioPlanId,
    requestId: raw.requestId,
    locale: raw.locale,
    termsVersion: raw.termsVersion,
    provider: (raw.provider as StudioProvider | undefined) ?? null,
    returnPath: raw.returnPath,
    turnstileToken: raw.turnstileToken,
    raw,
  };
}

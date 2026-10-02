import {
  BILLING_ORG,
  loginMethods,
  offeredProviders,
  PAID_MESSAGES,
  PRICE_TIYIN,
  providerMode,
  termsUrl,
  termsVersion,
  uzumFlow,
  type BillingEnv,
  type BillingMode,
} from "../../lib/gpt-chat/billing-config";
import { fiscalParams, includedVat, receiptLink } from "../../lib/gpt-chat/fiscal-config";
import { viewerMode } from "../../lib/gpt-chat/rehearsal";
import { BillingStore, type Order } from "../../lib/gpt-chat/billing-store";
import {
  ensureBillingSchema,
  ensureUzumSchema,
} from "../../lib/gpt-chat/billing-schema";
import { IdentityStore, sameOrigin, cookieValue } from "../../lib/gpt-chat/identity-store";
import { getClientIp, hashIp, sha256Hex } from "../../lib/gpt-chat/hash";
import { json, fail, readJsonLimited } from "../../lib/gpt-chat/http";
import { PACK_DAILY_LIMIT, TurnStore } from "../../lib/gpt-chat/turn-store";
import { resolveConfig } from "../../lib/gpt-chat/config";
import { maintainBilling } from "../../lib/gpt-chat/billing-maintenance-store";
import { fiscalizeDue } from "../../lib/gpt-chat/fiscal-store";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { consumeRateLimit, HOUR_MS } from "../../lib/gpt-chat/rate-limit";
import { uzumApi, uzumCheckoutConfig } from "../../lib/gpt-chat/uzum-config";
import { UzumStore } from "../../lib/gpt-chat/uzum-store";
import { PaymentCodeStore } from "../../lib/gpt-chat/payment-code-store";

/**
 * The latest Uzum Checkout order is settled from Uzum's own answers when the
 * visitor opens the panel or presses "check status": a prepared order's
 * status (a lost or late callback) and the receipts of a paid order Uzum
 * auto-fiscalizes (a lost receipt callback, U11). Bounded per account; any
 * failure leaves things as they are. True when something changed.
 */
async function reconcileUzum(
  env: BillingEnv,
  db: D1Database,
  user: string,
  latest: Order,
): Promise<boolean> {
  if (latest.provider !== "uzum" || !["prepared", "paid"].includes(latest.state))
    return false;
  const mode = providerMode(env, "uzum");
  const cfg =
    mode && uzumApi(env) === "checkout"
      ? uzumCheckoutConfig(env, mode, { settleOnly: true })
      : null;
  if (!mode || !cfg) return false;
  try {
    const store = new UzumStore(db, BILLING_ORG);
    const row = await store.order(latest.id);
    if (!row || row.user_id !== user || row.api !== "checkout" || row.mode !== mode)
      return false;
    if (row.state === "paid" && (row.autofiscal !== 1 || (await store.hasSaleReceipt(row.id))))
      return false;
    await ensureSchema(db);
    const rate = await consumeRateLimit(db, "uzum_reconcile", user, {
      limit: 6,
      windowMs: HOUR_MS,
    });
    if (!rate.allowed) return false;
    if (row.state === "paid") return ((await store.pullReceipts(cfg, row)) ?? 0) > 0;
    const settled = await store.reconcileCheckout(env, cfg, row);
    return !!settled && settled.result !== "unchanged";
  } catch {
    return false;
  }
}

/** The account's Uzum app code, while it carries the current offer; else null. */
async function currentPaymentCode(
  env: BillingEnv,
  db: D1Database,
  user: string,
): Promise<string | null> {
  const row = await new PaymentCodeStore(db, BILLING_ORG).forUser(user);
  return row && row.terms_version === termsVersion(env) ? row.code : null;
}

export const onRequestGet: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  // A rehearsal session sees test providers and test orders only; everyone
  // else live ones only (decision L7, rehearsal.ts). No D1 read.
  const context: BillingMode = await viewerMode(request, env);
  const providers = offeredProviders(env, context);
  const flow = providers.includes("uzum") ? uzumFlow(env) : null;
  const cfg = resolveConfig(env);
  const fiscal = fiscalParams(env);
  // Sign-in exists to pay: offered only with a provider (as offeredLoginMethods).
  const logins = providers.length ? loginMethods(env) : [];
  const base = {
    ok: true,
    loginAvailable: logins.length > 0,
    // "bot" (@gptbotuz_bot) first, then Telegram's OIDC when configured.
    loginMethods: logins,
    mode: providers.length ? context : null,
    // The AI pack (decision L3): one calendar month from the payment. The
    // price includes VAT at GPT_FISCAL_VAT_PERCENT.
    pack: {
      priceUzs: PRICE_TIYIN / 100,
      messageLimit: PAID_MESSAGES,
      dailyLimit: PACK_DAILY_LIMIT,
      months: 1,
      vat: fiscal
        ? { percent: fiscal.vatPercent, includedTiyin: includedVat(PRICE_TIYIN, fiscal.vatPercent) }
        : null,
    },
    termsVersion: termsVersion(env),
    // The free tier's limits from the config: a guest's view never reads D1
    // (decision L18); what is left comes from the chat's own answers.
    freeLimits: { daily: cfg.freeDailyLimit, hourly: cfg.freeHourlyLimit },
    // The limit card's "continue in the Telegram bot" button. Off unless the
    // flag is exactly "true": the bot must answer reliably first.
    botHandoff: env.GPT_BOT_HANDOFF_ENABLED === "true",
    providers,
    // How Uzum is paid when offered: its card page, or the payment code for
    // the Uzum Bank app (Merchant API).
    uzumFlow: flow,
    terms: {
      ru: termsUrl(env.GPT_BILLING_TERMS_RU),
      uz: termsUrl(env.GPT_BILLING_TERMS_UZ),
    },
  };
  if (!env.GPTBOT_DRAFTS_DB)
    return json({ ...base, loginAvailable: false, loginMethods: [], user: null });
  // Anonymous readiness checks need no schema bootstrap or account DB queries.
  if (!/^[a-f0-9]{64}$/.test(cookieValue(request, "__Host-gpt_account")))
    return json({ ...base, user: null });
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    // Orders are read through the 0065 view: bootstrapped here, like on the
    // Uzum routes, while Uzum is on; otherwise it comes from the migration.
    await (uzumApi(env) ? ensureUzumSchema(db) : ensureBillingSchema(db));
    const user = await new IdentityStore(db, BILLING_ORG).user(request);
    if (!user) return json({ ...base, user: null });
    const store = new BillingStore(db, BILLING_ORG);
    let latest = await store.latestAcrossProviders(user, context);
    if (latest && (await reconcileUzum(env, db, user, latest))) {
      waitUntil(
        maintainBilling(env).catch(() =>
          console.warn("gpt_billing_delivery_failed"),
        ),
      );
      waitUntil(
        fiscalizeDue(env).catch(() => console.warn("gpt_uzum_fiscal_failed")),
      );
      latest = await store.latestAcrossProviders(user, context);
    }
    const access = await store.access(user, context);
    // Packs run side by side: renewing is due only when the last one ends soon.
    const paidThrough = access ? await store.paidThrough(user, context) : null;
    // Printed receipts (Click, Payme, Uzum): only a link on ofd.soliq.uz or
    // an Uzum host reaches the page.
    const receipts = (await store.receipts(user, context)).flatMap((receipt) => {
      const url = receiptLink(receipt.receipt_url);
      return url ? [{ kind: receipt.kind, receipt_url: url }] : [];
    });
    const refundable = await store.refundable(user, context);
    // Without a pack the free tier counts by account and by IP hash, as the
    // chat does; with one, what is left in it and what its day cap still
    // lets through today (the Paketim panel).
    const { remaining, dayRemaining } = await new TurnStore(db, BILLING_ORG).allowance(
      user,
      await hashIp(getClientIp(request), cfg),
      access,
      cfg,
    );
    return json({
      ...base,
      user: { signedIn: true, storageKey: await sha256Hex(`local-history:${BILLING_ORG}:${user}`) },
      // Issued by /api/gpt/subscribe once its owner accepted the offer.
      paymentCode: flow === "code" ? await currentPaymentCode(env, db, user) : null,
      remaining,
      receipts,
      refundable,
      access: access
        ? {
            ...access,
            remaining,
            dayRemaining: dayRemaining ?? remaining,
            renewSoon: (paidThrough ?? access.ends_at) - Date.now() < 3 * 86400_000,
          }
        : null,
      payment: latest
        ? {
            id: latest.id,
            state:
              ["pending", "prepared"].includes(latest.state) &&
              latest.expires_at < Date.now()
                ? "cancelled"
                : latest.state,
            provider: latest.provider,
            createdAt: latest.created_at,
          }
        : null,
    });
  } catch {
    return fail("account_unavailable", "Try later", 503);
  }
};
export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  if (!sameOrigin(request) || !env.GPTBOT_DRAFTS_DB)
    return fail("forbidden", "Forbidden", 403);
  const body = await readJsonLimited<{ action?: string; orderId?: string }>(
    request,
    2048,
  );
  if (
    !body.ok ||
    body.value?.action !== "refund_request" ||
    typeof body.value.orderId !== "string"
  )
    return fail("bad_request", "Invalid request");
  try {
    await ensureBillingSchema(env.GPTBOT_DRAFTS_DB);
    const user = await new IdentityStore(
      env.GPTBOT_DRAFTS_DB,
      BILLING_ORG,
    ).user(request);
    if (!user) return fail("login_required", "Login required", 401);
    const accepted = await new BillingStore(
      env.GPTBOT_DRAFTS_DB,
      BILLING_ORG,
    ).requestRefund(user, body.value.orderId);
    if (accepted)
      waitUntil(
        maintainBilling(env).catch(() =>
          console.warn("gpt_billing_delivery_failed"),
        ),
      );
    return accepted ? json({ ok: true }) : fail("not_found", "Not found", 404);
  } catch {
    return fail("account_unavailable", "Try later", 503);
  }
};

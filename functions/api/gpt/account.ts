import {
  BILLING_ORG,
  guestCheckoutOn,
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
import { IdentityStore, sameOrigin, cookieValue, isGuestAccount } from "../../lib/gpt-chat/identity-store";
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

/**
 * The newest order as the pack window shows it. An open invoice past its
 * time reads as cancelled. `cancellable`: open, and no provider has seen it
 * yet (no external id), so the account may close it and pay another way
 * (BillingStore.cancelInvoice).
 */
function paymentView(order: Order, now = Date.now()) {
  const open = ["pending", "prepared"].includes(order.state) && order.expires_at >= now;
  return {
    id: order.id,
    state: ["pending", "prepared"].includes(order.state) && !open ? "cancelled" : order.state,
    provider: order.provider,
    createdAt: order.created_at,
    cancellable: open && order.state === "pending" && !order.external_id,
  };
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
    // Click needs no sign-in while guest checkout is on: subscribe makes this
    // browser a guest account; Telegram later keeps the pack on any phone.
    // The pack window keys its guest step on Click (canPayAsGuest);
    // subscribe takes Payme from a guest as well (guestProvider).
    guestCheckout: guestCheckoutOn(env) && providers.includes("click") && !!env.GPTBOT_DRAFTS_DB,
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
    // Packs run side by side: the account has the answers of all of them, is
    // paid through the latest end, and renewing is due only when that is near.
    const packs = access ? await store.usablePacks(user, context) : [];
    const paidThrough = packs.length ? Math.max(...packs.map((pack) => pack.ends_at)) : null;
    // Printed receipts (Click, Payme, Uzum): only a link on ofd.soliq.uz or
    // an Uzum host reaches the page.
    const receipts = (await store.receipts(user, context)).flatMap((receipt) => {
      const url = receiptLink(receipt.receipt_url);
      return url ? [{ kind: receipt.kind, receipt_url: url }] : [];
    });
    // Without a pack the free tier counts by account and by IP hash, as the
    // chat does; with one, what is left in every running pack, the pack's
    // day, and the holder's own free answers, which turns draw on first
    // (decision R2): a free answer leaves `remaining` as it is.
    const { remaining, dayRemaining, freeRemaining, freeHourRemaining } = await new TurnStore(db, BILLING_ORG).allowance(
      user,
      await hashIp(getClientIp(request), cfg),
      access,
      cfg,
    );
    return json({
      ...base,
      user: {
        signedIn: true,
        storageKey: await sha256Hex(`local-history:${BILLING_ORG}:${user}`),
        // Paid without signing in: the pack lives in this browser until Telegram keeps it.
        ...(isGuestAccount(user) ? { guest: true } : {}),
      },
      // Issued by /api/gpt/subscribe once its owner accepted the offer.
      paymentCode: flow === "code" ? await currentPaymentCode(env, db, user) : null,
      remaining,
      receipts,
      access: access
        ? {
            ...access,
            remaining,
            // «Сегодня можно ещё N (до 50 в день)»: what the holder can still
            // get today, the free answers and then the pack's day (R2), so it
            // never reads 0, or only the pack's last few, while free answers
            // are left. Never above the pack's day cap the line names: with
            // both untouched it reads 50, not 65.
            dayRemaining: Math.min(PACK_DAILY_LIMIT, (dayRemaining ?? remaining) + (freeRemaining ?? 0)),
            freeRemaining,
            freeHourRemaining,
            renewSoon: (paidThrough ?? access.ends_at) - Date.now() < 3 * 86400_000,
            packs: Math.max(1, packs.length),
            totalLimit: packs.reduce((sum, pack) => sum + pack.message_limit, 0) || access.message_limit,
            paidThrough: paidThrough ?? access.ends_at,
            // What is left in the pack turns draw from first (access.ends_at).
            firstRemaining: packs[0]?.order_id === access.order_id ? Math.max(0, packs[0].remaining) : remaining,
          }
        : null,
      payment: latest ? paymentView(latest) : null,
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
  if (!body.ok) return fail("bad_request", "Invalid request");
  const { action, orderId } = body.value ?? {};
  // The one thing an account does here: close its own open invoice. A paid
  // pack is not refundable (the offer, section 8); money taken by mistake is
  // returned by the Seller (internal/gpt-click-reversal, gpt-uzum-refund).
  if (action !== "cancel_invoice" || typeof orderId !== "string")
    return fail("bad_request", "Invalid request");
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    // Orders are read through the 0065 view: bootstrapped here while Uzum is
    // on, as on GET; otherwise it comes from the migration.
    await (uzumApi(env) ? ensureUzumSchema(db) : ensureBillingSchema(db));
    const user = await new IdentityStore(db, BILLING_ORG).user(request);
    if (!user) return fail("login_required", "Login required", 401);
    const store = new BillingStore(db, BILLING_ORG);
    // Only the viewer's own invoice of the mode it sees (decision L7).
    const result = await store.cancelInvoice(user, await viewerMode(request, env), orderId);
    if (result === "not_found") return fail("not_found", "Not found", 404);
    if (result === "in_progress")
      return fail("invoice_in_progress", "The provider holds this invoice; check its status", 409);
    waitUntil(
      maintainBilling(env).catch(() =>
        console.warn("gpt_billing_delivery_failed"),
      ),
    );
    return json({ ok: true });
  } catch {
    return fail("account_unavailable", "Try later", 503);
  }
};

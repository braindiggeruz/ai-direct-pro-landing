import {
  BILLING_ORG,
  clickCredentials,
  guestCheckoutOn,
  PRICE_TIYIN,
  providerMode,
  providerReady,
  termsUrl,
  termsVersion,
  type BillingEnv,
  type BillingMode,
} from "../../lib/gpt-chat/billing-config";
import {
  BillingStore,
  PendingElsewhereError,
} from "../../lib/gpt-chat/billing-store";
import {
  ensureBillingSchema,
  ensureUzumSchema,
} from "../../lib/gpt-chat/billing-schema";
import {
  authCookie,
  GUEST_ACCOUNT_PREFIX,
  GUEST_SESSION_MS,
  IdentityStore,
  isGuestAccount,
  paceGuestAccount,
  sameOrigin,
} from "../../lib/gpt-chat/identity-store";
import { resolveConfig } from "../../lib/gpt-chat/config";
import { addressKey, getClientIp, hashIp } from "../../lib/gpt-chat/hash";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { json, fail, readJsonLimited } from "../../lib/gpt-chat/http";
import { consumeRateLimit, HOUR_MS } from "../../lib/gpt-chat/rate-limit";
import { uzumApi, uzumCheckoutConfig } from "../../lib/gpt-chat/uzum-config";
import { registerPayment } from "../../lib/gpt-chat/uzum-checkout";
import {
  UzumStore,
  UZUM_SESSION_REUSE_MS,
} from "../../lib/gpt-chat/uzum-store";
import { PaymentCodeStore } from "../../lib/gpt-chat/payment-code-store";
import { maintainBilling } from "../../lib/gpt-chat/billing-maintenance-store";
import { fiscalizeDue } from "../../lib/gpt-chat/fiscal-store";
import { isRehearsalAccount, viewerMode } from "../../lib/gpt-chat/rehearsal";
import { paymeCheckoutUrl } from "../../lib/gpt-chat/payme-checkout";

/** The chat page a payment page sends the visitor back to (CheckoutReturn, plan WP-17). */
function returnUrl(origin: string, locale: "ru" | "uz"): string {
  return `${origin}${locale === "uz" ? "/uz/gpt-uzbek-tilida/" : "/ru/gpt-chat/"}?pay=return`;
}

/** Click's payment page for a live order; providerReady() vouched for the ids. */
function clickCheckoutUrl(env: BillingEnv, orderId: string, back: string): string {
  const click = clickCredentials(env, "live")!;
  return `https://my.click.uz/services/pay/?${new URLSearchParams({
    service_id: click.serviceId,
    merchant_id: click.merchantId!,
    amount: (PRICE_TIYIN / 100).toFixed(2),
    transaction_param: orderId,
    return_url: back,
  })}`;
}

/**
 * Uzum branch. Checkout registers the order with Uzum once, on the test
 * terminal in a rehearsal (U5), and re-serves the stored page while its
 * session is open. The Merchant API opens no order here: the visitor gets the
 * account's permanent payment code for the Uzum Bank app, issued with the
 * terms just accepted, and Uzum's /create opens the order (U1).
 */
async function subscribeUzum(
  env: BillingEnv,
  db: D1Database,
  user: string,
  mode: BillingMode,
  requestId: string,
  locale: "ru" | "uz",
  consent: { version: string; url: string; locale: "ru" | "uz" },
  origin: string,
  waitUntil: (task: Promise<unknown>) => void,
): Promise<Response> {
  const api = uzumApi(env)!;
  const now = Date.now();
  if (api === "merchant")
    return json({
      ok: true,
      mode: "code",
      paymentCode: await new PaymentCodeStore(db, BILLING_ORG).issue(user, consent, now),
    });
  // providerReady() vouched for the Checkout config of this mode.
  const cfg = uzumCheckoutConfig(env, mode);
  if (!cfg) return json({ ok: false, mode: "manual", code: "not_configured" }, 503);
  const store = new UzumStore(db, BILLING_ORG);
  // An expired order Uzum registered is settled from Uzum's status first (U4).
  let row = await store.createOrder(user, mode, requestId, api, now, consent, { env, cfg });
  if (row.api !== api) {
    // The owner switched Checkout <-> Merchant API while this invoice was
    // open. Close it if Uzum never saw it; the visitor starts a fresh one.
    if (row.state === "pending" && !row.external_id)
      await store.billing.transition(row.id, "cancelled", "invoice_expired", {
        reason: 4,
      });
    return json({ ok: true, mode: "status", attemptId: row.id });
  }
  if (
    (row.state !== "pending" && row.state !== "prepared") ||
    row.expires_at <= now
  )
    return json({ ok: true, mode: "status", attemptId: row.id });
  if (row.external_id) {
    // Registered before: re-serve the page while its Uzum session is open.
    if (row.redirect_url && now - (row.provider_time ?? 0) < UZUM_SESSION_REUSE_MS) {
      if (row.state === "pending")
        row = await store.attachCheckout(
          row.id,
          row.external_id,
          row.redirect_url,
          row.provider_time ?? now,
        );
      return json({
        ok: true,
        mode: "checkout",
        checkoutUrl: row.redirect_url,
        attemptId: row.id,
      });
    }
    // Session over: settle from Uzum's own status, never from the browser.
    const settled = await store.reconcileCheckout(env, cfg, row, now);
    if (!settled)
      return fail("checkout_unavailable", "Check status before retrying", 503);
    if (settled.result !== "unchanged") {
      waitUntil(
        maintainBilling(env).catch(() =>
          console.warn("gpt_billing_delivery_failed"),
        ),
      );
      waitUntil(
        fiscalizeDue(env).catch(() => console.warn("gpt_uzum_fiscal_failed")),
      );
    }
    return json({ ok: true, mode: "status", attemptId: row.id });
  }
  const registered = await registerPayment(cfg, row, locale, returnUrl(origin, locale));
  if (!registered.ok) {
    // Uzum refused (e.g. 3027 duplicate order number): close this invoice so
    // the next attempt is a new order. A network failure keeps it pending.
    if (registered.error === "uzum")
      await store.billing.transition(row.id, "cancelled", "uzum_register_failed", {
        reason: registered.code,
      });
    return fail("checkout_unavailable", "Check status before retrying", 503);
  }
  // Who prints the receipts is fixed by what this registration carried.
  row = await store.attachCheckout(
    row.id,
    registered.orderId,
    registered.redirectUrl,
    Date.now(),
    !!cfg.fiscal,
  );
  return json({
    ok: true,
    mode: "checkout",
    checkoutUrl: row.redirect_url,
    attemptId: row.id,
  });
}

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const guest: { cookie: string | null } = { cookie: null };
  const response = await subscribe(context, guest);
  // A guest account made for this checkout is this browser's from now on,
  // whatever became of the order: a retry reuses it.
  if (guest.cookie) response.headers.append("Set-Cookie", guest.cookie);
  return response;
};

async function subscribe(
  { request, env, waitUntil }: Parameters<PagesFunction<BillingEnv>>[0],
  guest: { cookie: string | null },
): Promise<Response> {
  if (!sameOrigin(request)) return fail("forbidden", "Forbidden", 403);
  const body = await readJsonLimited<{
    provider?: string;
    requestId?: string;
    locale?: string;
    acceptTerms?: boolean;
    termsVersion?: string;
  }>(request, 2048);
  if (!body.ok || !body.value) return fail("bad_request", "Invalid request");
  const p = body.value;
  if (
    (p.provider !== "payme" && p.provider !== "click" && p.provider !== "uzum") ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(p.requestId || "") ||
    p.acceptTerms !== true
  )
    return fail("bad_request", "Invalid request");
  // Only a provider this visitor is offered: a live one to everyone, a test
  // one in a rehearsal session only (decision L7). Anything else, Payme
  // outside GPT_PAYMENT_PROVIDERS included, is a missing route.
  const mode = providerMode(env, p.provider);
  if (
    !mode ||
    !providerReady(env, p.provider) ||
    !env.GPTBOT_DRAFTS_DB ||
    mode !== (await viewerMode(request, env))
  )
    return fail("not_found", "Not found", 404);
  const locale = p.locale === 'uz' ? 'uz' : 'ru';
  const version = termsVersion(env);
  const terms = termsUrl(locale === 'uz' ? env.GPT_BILLING_TERMS_UZ : env.GPT_BILLING_TERMS_RU);
  if (!version || !terms || p.termsVersion !== version)
    return fail('terms_changed', 'Review the current terms before paying', 409);
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    // providerReady() above means Uzum is configured when it is asked for.
    await (p.provider === "uzum"
      ? ensureUzumSchema(db)
      : ensureBillingSchema(db));
    const identity = new IdentityStore(db, BILLING_ORG);
    let user = await identity.user(request);
    if (!user) {
      // Guest checkout (Click, while it is on): the pack goes to a new guest
      // account of this browser, paced by paceGuestAccount (identity-store.ts).
      if (p.provider !== "click" || !guestCheckoutOn(env))
        return fail("login_required", "Login required", 401);
      const address = await hashIp(addressKey(getClientIp(request)), resolveConfig(env));
      const pace = await paceGuestAccount(db, address);
      if (!pace.allowed || pace.degraded) return fail("try_later", "Try later", 429);
      const minted = await identity.syntheticLogin(GUEST_ACCOUNT_PREFIX, GUEST_SESSION_MS);
      user = minted.id;
      guest.cookie = authCookie("__Host-gpt_account", minted.token, GUEST_SESSION_MS / 1000);
    }
    // A guest pays with Click only: its pack moves to Telegram with the
    // orders of gpt_payment_orders alone (IdentityStore.adoptGuest).
    if (p.provider !== "click" && isGuestAccount(user))
      return fail("login_required", "Login required", 401);
    // A synthetic rehearsal account never buys live (rehearsal.ts).
    if (mode === "live" && isRehearsalAccount(user))
      return fail("not_found", "Not found", 404);
    const rate = await consumeRateLimit(db, "checkout", user, {
      limit: 10,
      windowMs: HOUR_MS,
    });
    if (!rate.allowed || rate.degraded)
      return fail("try_later", "Try later", 429);
    if (p.provider === "uzum")
      return await subscribeUzum(
        env,
        db,
        user,
        mode,
        p.requestId!,
        locale,
        { version, url: terms, locale },
        new URL(request.url).origin,
        waitUntil,
      );
    const row = await new BillingStore(db, BILLING_ORG).createOrder(
      user,
      p.provider,
      mode,
      p.requestId!,
      Date.now(),
      { version, url: terms, locale },
    );
    if (
      (row.state !== "pending" && row.state !== "prepared") ||
      row.expires_at <= Date.now()
    )
      return json({ ok: true, mode: "status", attemptId: row.id });
    // Payme's page, in either mode: the sandbox test.paycom.uz for a test
    // order (a rehearsal session only, checked above), checkout.paycom.uz
    // live. Once Payme holds a transaction for the order (prepared), a new
    // page would only meet -31008: the visitor follows its status instead.
    if (p.provider === "payme") {
      if (row.state === "prepared")
        return json({ ok: true, mode: "status", attemptId: row.id });
      const checkoutUrl = paymeCheckoutUrl(
        env,
        row.mode,
        row.id,
        locale,
        returnUrl(new URL(request.url).origin, locale),
      );
      if (!checkoutUrl) throw new Error("payme_checkout");
      return json({ ok: true, mode: "checkout", checkoutUrl, attemptId: row.id });
    }
    // Click in test mode never produces a checkout URL. Sandbox callbacks and
    // the local protocol rehearsal exercise the same ledger without moving money.
    if (row.mode === "test")
      return json({
        ok: true,
        mode: "test",
        attemptId: row.id,
        amount: row.amount,
        currency: row.currency,
      });
    // Live is Click here: Uzum and Payme took their own branches above.
    if (p.provider !== "click") throw new Error("not_live_capable");
    return json({
      ok: true,
      mode: "checkout",
      checkoutUrl: clickCheckoutUrl(env, row.id, returnUrl(new URL(request.url).origin, locale)),
      attemptId: row.id,
    });
  } catch (error) {
    if (error instanceof PendingElsewhereError)
      return fail("pending_elsewhere", "Another payment is still open; check its status first", 409, {
        attemptId: error.orderId,
        provider: error.provider,
      });
    if (error instanceof Error && error.message === 'terms_changed')
      return fail('terms_changed', 'An existing invoice uses different terms; check its status first', 409);
    return fail("checkout_unavailable", "Check status before retrying", 503);
  }
}
export const onRequest: PagesFunction<BillingEnv> = async () =>
  fail("method_not_allowed", "Use POST", 405);

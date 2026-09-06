import {
  BILLING_ORG,
  billingMode,
  providerReady,
  termsUrl,
  termsVersion,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { BillingStore } from "../../lib/gpt-chat/billing-store";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { IdentityStore, sameOrigin } from "../../lib/gpt-chat/identity-store";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { json, fail, readJsonLimited } from "../../lib/gpt-chat/http";
import { consumeRateLimit, HOUR_MS } from "../../lib/gpt-chat/rate-limit";
export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
}) => {
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
    (p.provider !== "payme" && p.provider !== "click") ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(p.requestId || "") ||
    p.acceptTerms !== true
  )
    return fail("bad_request", "Invalid request");
  if (!providerReady(env, p.provider) || !env.GPTBOT_DRAFTS_DB)
    return json({ ok: false, mode: "manual", code: "not_configured" }, 503);
  const locale = p.locale === 'uz' ? 'uz' : 'ru';
  const version = termsVersion(env);
  const terms = termsUrl(locale === 'uz' ? env.GPT_BILLING_TERMS_UZ : env.GPT_BILLING_TERMS_RU);
  if (!version || !terms || p.termsVersion !== version)
    return fail('terms_changed', 'Review the current terms before paying', 409);
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensureBillingSchema(db);
    const user = await new IdentityStore(db, BILLING_ORG).user(request);
    if (!user) return fail("login_required", "Login required", 401);
    const rate = await consumeRateLimit(db, "checkout", user, {
      limit: 10,
      windowMs: HOUR_MS,
    });
    if (!rate.allowed || rate.degraded)
      return fail("try_later", "Try later", 429);
    const row = await new BillingStore(db, BILLING_ORG).createOrder(
      user,
      p.provider,
      billingMode(env)!,
      p.requestId!,
      Date.now(),
      { version, url: terms, locale },
    );
    if (
      (row.state !== "pending" && row.state !== "prepared") ||
      row.expires_at <= Date.now()
    )
      return json({ ok: true, mode: "status", attemptId: row.id });
    const returnUrl = `${new URL(request.url).origin}${p.locale === "uz" ? "/uz/gpt-uzbek-tilida/" : "/ru/gpt-chat/"}`;
    // Test mode never produces a live checkout URL. Sandbox callbacks and the
    // local protocol rehearsal exercise the same ledger without moving money.
    if (row.mode === "test")
      return json({
        ok: true,
        mode: "test",
        attemptId: row.id,
        amount: row.amount,
        currency: row.currency,
      });
    const url =
      p.provider === "payme"
        ? `https://checkout.paycom.uz/${btoa(`m=${env.GPT_PAYME_MERCHANT_ID};ac.order_id=${row.id};a=${row.amount};l=${p.locale === "uz" ? "uz" : "ru"};c=${returnUrl}`)}`
        : `https://my.click.uz/services/pay/?${new URLSearchParams({ service_id: env.GPT_CLICK_SERVICE_ID!, merchant_id: env.GPT_CLICK_MERCHANT_ID!, amount: "20000.00", transaction_param: row.id, return_url: returnUrl })}`;
    return json({
      ok: true,
      mode: "checkout",
      checkoutUrl: url,
      attemptId: row.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'terms_changed')
      return fail('terms_changed', 'An existing invoice uses different terms; check its status first', 409);
    return fail("checkout_unavailable", "Check status before retrying", 503);
  }
};
export const onRequest: PagesFunction<BillingEnv> = async () =>
  fail("method_not_allowed", "Use POST", 405);

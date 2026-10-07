// POST /api/studio/checkout — order a studio tariff (spec §9.2, DECISIONS §12).
//
// Body (4 KiB at most): {plan "kunlik"|"oylik", requestId, locale "uz"|"ru",
// acceptTerms: true, termsVersion, provider? "payme"|"click", returnPath?,
// turnstileToken?, attribution: {last?, first?}, ga: {clientId?,
// sessionId?}, ym: {clientId?}}.
// Answers:
//   live      {ok, mode:"checkout", checkoutUrl, orderId, provider}
//   test      {ok, mode:"test", orderId, amount, provider}  (a local rehearsal
//             only: Payme's and Click's callbacks are simulated there)
//   status    {ok, mode:"status", orderId}  (the order is paid, closed, or a
//             provider holds it: the browser follows /me)
//
// Order, cheapest refusal first:
//   1. STUDIO_PAYMENTS on, on gptbot.uz (studioGate): 404 before anything;
//   2. POST from this origin;
//   3. STUDIO_PAID_SERVICE on: a tariff nobody could spend is never sold
//      (503 checkout_unavailable);
//   4. the body; acceptTerms === true; the edition the buyer saw must be
//      STUDIO_TERMS_VERSION (409 terms_changed), an edition TERMS_PLAN sells
//      and with its offer link (503 checkout_unavailable);
//   5. the provider (checkout.ts readyProvider): 503 provider_unavailable;
//   6. D1 and GPT_IDENTITY_SECRET, else 503 studio_not_configured;
//   7. the studio account (__Host-studio_account). Without one: a valid
//      browser identity (401 identity_required), a fresh Turnstile token of
//      studio_checkout (403 / 503), the studio's own account pace (429), then
//      a new account and its cookie, which the answer carries whatever
//      happens next (a retry reuses it);
//   8. 10 checkouts an hour per account (429); a D1 failure refuses;
//   9. the order (store.ts createOrder): the same request id → the same
//      order; another open order → 409 order_open {orderId}.
// Logs: {event, code} only.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../lib/gpt-chat/http";
import { sameOrigin } from "../../lib/gpt-chat/identity-store";
import { createStudioAccount, paceCheckout, paceStudioAccount, readStudioAccount, type StudioAccount } from "../../lib/studio/account";
import { orderAttribution } from "../../lib/studio/attribution";
import { readCheckoutBody, readyProvider, readyProviders, studioClickCheckoutUrl, studioPaymeCheckoutUrl, studioReturnUrl } from "../../lib/studio/checkout";
import { studioGate, studioRequestConfig } from "../../lib/studio/config";
import { fail, json, studioLog } from "../../lib/studio/http";
import { identityConfigured, readIdentity } from "../../lib/studio/identity";
import { studioAddress } from "../../lib/studio/limits";
import { TERMS_PLAN } from "../../lib/studio/plans";
import { StudioStore, StudioStoreError, ensureStudioPaidSchema } from "../../lib/studio/store";
import { studioTurnstileConfigured, verifyStudioTurnstile } from "../../lib/studio/turnstile";

const MAX_BODY_BYTES = 4096;
const EVENT = "studio_checkout";

type Context = Parameters<PagesFunction<BillingEnv>>[0];

export const onRequest: PagesFunction<BillingEnv> = async (context) => {
  const cookies: string[] = [];
  const response = await checkout(context, cookies);
  // An account made for this checkout is this browser's from now on, whatever became of the order.
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  return response;
};

async function checkout({ request, env }: Context, cookies: string[]): Promise<Response> {
  const closed = studioGate(request, env, "checkout");
  if (closed) return closed;
  if (request.method !== "POST") return fail("method_not_allowed", {}, { Allow: "POST" });
  if (!sameOrigin(request)) return fail("invalid");
  const config = studioRequestConfig(request, env);
  if (!config.paidService) return refuse("checkout_unavailable");
  const now = Date.now();

  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);
  const order = readCheckoutBody(body.value);
  if (!order) return fail("invalid");
  const edition = config.terms.version;
  const termsUrl = order.locale === "uz" ? config.terms.uz : config.terms.ru;
  if (!edition || !Object.prototype.hasOwnProperty.call(TERMS_PLAN, edition) || !termsUrl) return refuse("checkout_unavailable");
  if (order.termsVersion !== edition) return refuse("terms_changed");

  const provider = order.provider ?? readyProviders(env, config)[0] ?? null;
  const ready = provider ? readyProvider(env, config, provider) : null;
  if (!ready) return refuse("provider_unavailable");

  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !identityConfigured(env)) return refuse("studio_not_configured");
  let account: StudioAccount | null;
  try {
    await ensureStudioPaidSchema(db);
    account = await readStudioAccount(request, db, now);
  } catch {
    return refuse("studio_busy");
  }
  if (!account) {
    // A first order: the browser's identity, then Turnstile, then the account's pace.
    const identity = await readIdentity(request, env, now);
    if (!identity) return refuse("identity_required");
    if (!studioTurnstileConfigured(request, env)) return refuse("studio_not_configured");
    const check = await verifyStudioTurnstile(request, env, order.turnstileToken, "studio_checkout");
    if (!check.ok) return refuse(check.code);
    const pace = await paceStudioAccount(db, await studioAddress(request, env, now), now);
    if (!pace.ok) return refuse(pace.code, { "Retry-After": String(pace.retryAfterSeconds) });
    try {
      const created = await createStudioAccount(db, now);
      account = created.account;
      cookies.push(created.cookie);
    } catch {
      return refuse("studio_busy");
    }
  }
  const pace = await paceCheckout(db, account.userId, now);
  if (!pace.ok) return refuse(pace.code, { "Retry-After": String(pace.retryAfterSeconds) });

  let made;
  try {
    made = await new StudioStore(db).createOrder({
      userId: account.userId,
      plan: order.plan,
      termsVersion: edition,
      provider: ready.provider,
      serviceId: ready.serviceId,
      mode: ready.mode,
      requestId: order.requestId,
      consent: { version: edition, url: termsUrl, locale: order.locale },
      attribution: orderAttribution(order.raw),
      now,
    });
  } catch (error) {
    if (error instanceof StudioStoreError) {
      if (error.code === "order_open" && error.order) {
        studioLog(EVENT, "order_open");
        return fail("order_open", { orderId: error.order.id });
      }
      if (error.code === "terms_changed") return refuse("terms_changed");
      if (error.code === "terms_unsold") return refuse("checkout_unavailable");
      if (error.code === "idempotency_conflict") return refuse("invalid");
    }
    return refuse("studio_busy");
  }
  const row = made.order;
  studioLog(EVENT, made.kind);
  if (row.state !== "pending" || row.expires_at <= now) return json({ ok: true, mode: "status", orderId: row.id });
  if (row.mode === "test") return json({ ok: true, mode: "test", orderId: row.id, amount: row.amount, provider: row.provider });
  const back = studioReturnUrl(new URL(request.url).origin, order.locale, order.returnPath);
  const checkoutUrl =
    row.provider === "payme"
      ? studioPaymeCheckoutUrl(env, row.mode, row.id, row.amount, order.locale, back)
      : studioClickCheckoutUrl(env, row.id, row.amount, back);
  if (!checkoutUrl) return refuse("provider_unavailable");
  return json({ ok: true, mode: "checkout", checkoutUrl, orderId: row.id, provider: row.provider });
}

/** A refusal, logged by its code. */
function refuse(code: Parameters<typeof fail>[0], headers: Record<string, string> = {}): Response {
  studioLog(EVENT, code);
  return fail(code, {}, headers);
}

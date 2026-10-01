// POST /api/internal/gpt-rehearsal-session — opens a dark rehearsal session
// (functions/lib/gpt-chat/rehearsal.ts) for the owner or the release agent.
// Auth: Authorization: Bearer GPT_BILLING_MAINTENANCE_SECRET, like the other
// internal routes. It exists only while some provider is in test: otherwise
// it is a missing route, before the body is read.
//
// Body (optional): {"account": true} also signs the session in as a fresh
// synthetic account acct_rh_… for the same two hours, without Telegram. Such
// an account can buy in test only.
// Answer: Set-Cookie __Host-gpt_rehearsal (and __Host-gpt_account), and
// {ok, expiresAt, providers, account}: what the session is offered (the
// ready test providers) and the synthetic account id. The cookie values
// travel only in Set-Cookie.
import {
  BILLING_ORG,
  offeredProviders,
  providersInMode,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { IdentityStore, authCookie } from "../../lib/gpt-chat/identity-store";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
import { sameSecret } from "../../lib/gpt-chat/payment-protocol";
import {
  mintRehearsal,
  rehearsalCookie,
  REHEARSAL_ACCOUNT_PREFIX,
  REHEARSAL_TTL_MS,
} from "../../lib/gpt-chat/rehearsal";

export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (
    !env.GPT_BILLING_MAINTENANCE_SECRET ||
    !sameSecret(
      request.headers.get("authorization") || "",
      `Bearer ${env.GPT_BILLING_MAINTENANCE_SECRET}`,
    )
  )
    return fail("forbidden", "Forbidden", 403);
  if (!providersInMode(env, "test").length) return fail("not_found", "Not found", 404);
  const body = request.body
    ? await readJsonLimited<{ account?: unknown } | null>(request, 512)
    : { ok: true as const, value: {} };
  const p = body.ok ? body.value : null;
  if (
    !p ||
    typeof p !== "object" ||
    Array.isArray(p) ||
    (p.account !== undefined && typeof p.account !== "boolean")
  )
    return fail("invalid_request", 'Send {} or {"account": true}');
  const now = Date.now();
  const rehearsal = await mintRehearsal(env, now);
  if (!rehearsal)
    return fail("identity_secret_missing", "GPT_IDENTITY_SECRET is not set", 409);
  let account: { id: string; token: string } | null = null;
  if (p.account === true) {
    if (!env.GPTBOT_DRAFTS_DB) return fail("unavailable", "Unavailable", 503);
    try {
      await ensureBillingSchema(env.GPTBOT_DRAFTS_DB);
      account = await new IdentityStore(env.GPTBOT_DRAFTS_DB, BILLING_ORG).syntheticLogin(
        REHEARSAL_ACCOUNT_PREFIX,
        REHEARSAL_TTL_MS,
        now,
      );
    } catch {
      return fail("unavailable", "Unavailable", 503);
    }
  }
  const response = json({
    ok: true,
    expiresAt: rehearsal.expiresAt,
    providers: offeredProviders(env, "test"),
    account: account?.id ?? null,
  });
  response.headers.append("Set-Cookie", rehearsalCookie(rehearsal.token));
  if (account)
    response.headers.append(
      "Set-Cookie",
      authCookie("__Host-gpt_account", account.token, REHEARSAL_TTL_MS / 1000),
    );
  return response;
};

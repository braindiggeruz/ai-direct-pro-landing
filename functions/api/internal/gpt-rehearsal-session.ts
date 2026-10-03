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
// travel only in Set-Cookie. The owner opens the same session from the admin
// (api/admin/ai-chat/rehearsal-session.ts); both go through openRehearsal().
import { providersInMode, type BillingEnv } from "../../lib/gpt-chat/billing-config";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
import { sameSecret } from "../../lib/gpt-chat/payment-protocol";
import { openRehearsal } from "../../lib/gpt-chat/rehearsal";

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
  const opened = await openRehearsal(env, { account: p.account === true });
  if (!opened.ok)
    return opened.code === "identity_secret_missing"
      ? fail("identity_secret_missing", "GPT_IDENTITY_SECRET is not set", 409)
      : opened.code === "no_test_provider"
        ? fail("not_found", "Not found", 404)
        : fail("unavailable", "Unavailable", 503);
  const response = json({
    ok: true,
    expiresAt: opened.expiresAt,
    providers: opened.providers,
    account: opened.account,
  });
  for (const cookie of opened.cookies) response.headers.append("Set-Cookie", cookie);
  return response;
};

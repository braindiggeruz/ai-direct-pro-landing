import { base64url } from "jose";
import {
  BILLING_ORG,
  identityReady,
  type BillingEnv,
} from "../../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../../lib/gpt-chat/billing-schema";
import {
  IdentityStore,
  authCookie,
  randomToken,
  sameOrigin,
} from "../../../lib/gpt-chat/identity-store";
import { fail, json, readJsonLimited } from "../../../lib/gpt-chat/http";
import { consumeRateLimit, HOUR_MS } from "../../../lib/gpt-chat/rate-limit";
import { hashIp, getClientIp } from "../../../lib/gpt-chat/hash";
import { ensureSchema } from "../../../lib/gpt-chat/schema";

export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
}) => {
  if (!sameOrigin(request)) return fail("forbidden", "Forbidden", 403);
  if (!identityReady(env) || !env.GPTBOT_DRAFTS_DB)
    return fail("not_configured", "Unavailable", 503);
  const body = await readJsonLimited<{ locale?: string; consent?: boolean }>(
    request,
    2048,
  );
  if (!body.ok || body.value?.consent !== true)
    return fail("consent_required", "Consent required");
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensureBillingSchema(db);
    const limit = await consumeRateLimit(
      db,
      "account_login",
      await hashIp(getClientIp(request), env.GPT_HASH_SALT || ""),
      { limit: 10, windowMs: HOUR_MS },
    );
    if (!limit.allowed || limit.degraded)
      return fail("try_later", "Try later", 429);
    const state = randomToken();
    const verifier = randomToken();
    await new IdentityStore(db, BILLING_ORG).challenge(
      state,
      verifier,
      body.value.locale === "uz" ? "uz" : "ru",
    );
    const url = new URL("https://oauth.telegram.org/auth");
    url.search = new URLSearchParams({
      client_id: env.GPT_TELEGRAM_CLIENT_ID!,
      redirect_uri: `${new URL(request.url).origin}/api/gpt/auth/callback`,
      response_type: "code",
      scope: "openid",
      state,
      code_challenge: base64url.encode(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ),
      ),
      code_challenge_method: "S256",
    }).toString();
    return json({ ok: true, url: url.href }, 200, {
      "Set-Cookie": authCookie("__Host-gpt_login", state, 600),
    });
  } catch {
    return fail("store_unavailable", "Try later", 503);
  }
};

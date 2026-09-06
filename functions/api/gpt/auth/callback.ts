import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  BILLING_ORG,
  identityReady,
  type BillingEnv,
} from "../../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../../lib/gpt-chat/billing-schema";
import {
  IdentityStore,
  authCookie,
  cookieValue,
} from "../../../lib/gpt-chat/identity-store";
import { fail } from "../../../lib/gpt-chat/http";
const keys = createRemoteJWKSet(
  new URL("https://oauth.telegram.org/.well-known/jwks.json"),
  { timeoutDuration: 5000 },
);
export const onRequestGet: PagesFunction<BillingEnv> = async ({
  request,
  env,
}) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  if (!identityReady(env) || !env.GPTBOT_DRAFTS_DB)
    return fail("not_configured", "Unavailable", 503);
  if (
    !/^[a-f0-9]{64}$/.test(state) ||
    state !== cookieValue(request, "__Host-gpt_login")
  )
    return fail("invalid_login", "Restart login", 403);
  let locale = "ru";
  try {
    await ensureBillingSchema(env.GPTBOT_DRAFTS_DB);
    const store = new IdentityStore(env.GPTBOT_DRAFTS_DB, BILLING_ORG);
    const challenge = await store.claim(state);
    if (!challenge) throw new Error("expired");
    locale = challenge.locale;
    const code = url.searchParams.get("code");
    if (!code || code.length > 2048) throw new Error("missing_code");
    const response = await fetch("https://oauth.telegram.org/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${env.GPT_TELEGRAM_CLIENT_ID}:${env.GPT_TELEGRAM_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${url.origin}/api/gpt/auth/callback`,
        client_id: env.GPT_TELEGRAM_CLIENT_ID!,
        code_verifier: challenge.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("token_exchange");
    const data = (await response.json()) as { id_token?: string };
    if (!data.id_token) throw new Error("missing_token");
    const { payload } = await jwtVerify(data.id_token, keys, {
      issuer: "https://oauth.telegram.org",
      audience: env.GPT_TELEGRAM_CLIENT_ID,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "aud", "iss"],
      maxTokenAge: "10m",
    });
    if (!payload.sub) throw new Error("subject_missing");
    // Keyed pseudonym: no Telegram name, phone, photo, raw ID or token persists.
    // Still personal data, not a claim of legal anonymisation.
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.GPT_IDENTITY_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(payload.sub),
        ),
      ),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    const token = await store.login(hash);
    await store.logout(request);
    const headers = new Headers({
      Location: locale === "uz" ? "/uz/gpt-uzbek-tilida/" : "/ru/gpt-chat/",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    });
    headers.append(
      "Set-Cookie",
      authCookie("__Host-gpt_account", token, 30 * 86400),
    );
    headers.append("Set-Cookie", authCookie("__Host-gpt_login", "", 0));
    headers.append('Set-Cookie', authCookie('gpt_sid', '', 0));
    headers.append('Set-Cookie', authCookie('gpt_sat', '', 0));
    return new Response(null, { status: 303, headers });
  } catch {
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${locale === "uz" ? "/uz/gpt-uzbek-tilida/" : "/ru/gpt-chat/"}?login=failed`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Set-Cookie": authCookie("__Host-gpt_login", "", 0),
      },
    });
  }
};

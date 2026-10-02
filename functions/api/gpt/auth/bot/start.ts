// POST /api/gpt/auth/bot/start — sign in through the bot @gptbotuz_bot (plan
// WP-16, decision L11). Body {locale, consent: true}.
//
// Answers {id, mode, code, deepLink, expiresAt, expiresIn}. The browser opens
// deepLink (https://t.me/<bot>?start=login_<nonce>) and, in pick mode, shows
// `code` large: the bot asks the person to press that number. In code mode
// `code` is null and the bot sends the code instead. expiresAt is on the
// server's clock; the browser counts expiresIn (ms) down on its own clock,
// which may be off by more than these 10 minutes. The browser's own secret goes
// into the cookie __Host-gpt_botlogin; only the browser that holds it can
// collect the sign-in (status.ts), so a forwarded link signs nobody in by
// itself.
//
// 404 before the body and D1 while sign-in through the bot is not offered to
// this visitor: billing off, or the bot, its username, GPT_IDENTITY_SECRET or
// GPT_BOT_LOGIN_MODE not set (rehearsal.ts offeredLoginMethods).
import {
  BILLING_ORG,
  botLoginMode,
  type BillingEnv,
} from "../../../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../../../lib/gpt-chat/billing-schema";
import {
  BOT_LOGIN_COOKIE,
  LOGIN_PAYLOAD_PREFIX,
  browserLabel,
} from "../../../../lib/gpt-chat/bot-login";
import { BOT_LOGIN_TTL_MS, BotLoginStore } from "../../../../lib/gpt-chat/bot-login-store";
import { deepLinkFor, mintToken, resolveHandoffConfig } from "../../../../lib/gpt-chat/handoff";
import { getClientIp, hashIp, resolveHashSalt, sha256Hex } from "../../../../lib/gpt-chat/hash";
import { fail, json, readJsonLimited } from "../../../../lib/gpt-chat/http";
import {
  authCookie,
  cookieValue,
  randomToken,
  sameOrigin,
} from "../../../../lib/gpt-chat/identity-store";
import { consumeRateLimit, HOUR_MS } from "../../../../lib/gpt-chat/rate-limit";
import { offeredLoginMethods } from "../../../../lib/gpt-chat/rehearsal";
import { ensureSchema } from "../../../../lib/gpt-chat/schema";

export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!sameOrigin(request)) return fail("forbidden", "Forbidden", 403);
  const mode = botLoginMode(env);
  if (!mode || !env.GPTBOT_DRAFTS_DB || !(await offeredLoginMethods(request, env)).includes("bot"))
    return fail("not_found", "Not found", 404);
  const body = await readJsonLimited<{ locale?: string; consent?: boolean }>(request, 2048);
  if (!body.ok || body.value?.consent !== true)
    return fail("consent_required", "Consent required");
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensureBillingSchema(db);
    // The counter Telegram's OIDC start uses too: 10 sign-ins an hour per IP hash.
    const limit = await consumeRateLimit(
      db,
      "account_login",
      await hashIp(getClientIp(request), resolveHashSalt(env)),
      { limit: 10, windowMs: HOUR_MS },
    );
    if (!limit.allowed || limit.degraded) return fail("try_later", "Try later", 429);
    // One secret per browser while its attempts live, so the cap of attempts
    // in flight counts per browser; a fresh one otherwise.
    const kept = cookieValue(request, BOT_LOGIN_COOKIE);
    const browserSecret = /^[a-f0-9]{64}$/.test(kept) ? kept : randomToken();
    const nonce = mintToken();
    const attempt = await new BotLoginStore(db, BILLING_ORG).create({
      nonce,
      browserHash: await sha256Hex(browserSecret),
      mode,
      locale: body.value.locale === "uz" ? "uz" : "ru",
      client: browserLabel(request.headers.get("User-Agent")),
    });
    if (!attempt) return fail("try_later", "Try later", 429);
    return json(
      {
        ok: true,
        id: attempt.id,
        mode,
        code: mode === "pick" ? attempt.code : null,
        deepLink: deepLinkFor(resolveHandoffConfig(env).botUsername, `${LOGIN_PAYLOAD_PREFIX}${nonce}`),
        expiresAt: attempt.expiresAt,
        expiresIn: BOT_LOGIN_TTL_MS,
      },
      200,
      { "Set-Cookie": authCookie(BOT_LOGIN_COOKIE, browserSecret, BOT_LOGIN_TTL_MS / 1000) },
    );
  } catch {
    return fail("store_unavailable", "Try later", 503);
  }
};

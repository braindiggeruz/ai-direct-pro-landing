// POST /api/gpt/auth/bot/status — the browser asks how its sign-in through
// the bot is going (plan WP-16). Body {id} from start.ts; in code mode
// {id, code} once the person has the code from the bot.
//
// Answers {status}: pending (the bot link is not opened yet) | claimed (opened,
// waiting for the number or the code) | rejected | expired | done | failed
// (signed in, but a guest's pack could not move: the guest stays as it was,
// IdentityStore.adoptGuest). Only the
// browser holding the attempt's __Host-gpt_botlogin cookie learns anything:
// without it 403. "done" happens once per attempt: it starts a new account
// session (__Host-gpt_account, a fresh token; this browser's previous session
// ends) and clears the attempt's cookie and the chat-session cookies, as
// Telegram's OIDC callback does. Signing in gives a visitor without a pack
// no new free answers: the free tier counts by account and by IP hash. A
// pack holder's free answers count by the account alone (decision R2,
// turn-store.ts), so what the address spent as a guest does not reduce them.
// A pack bought here without signing in (guest checkout) moves to the
// account with the guest's answers of the day (IdentityStore.adoptGuest).
// A sign-in that fails on our side after the attempt was consumed (D1) gives
// it back (BotLoginStore.release) and answers 503: the browser's next poll
// signs in, instead of reading "expired" after the bot said "confirmed".
import { BILLING_ORG, type BillingEnv } from "../../../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../../../lib/gpt-chat/billing-schema";
import { BOT_LOGIN_COOKIE } from "../../../../lib/gpt-chat/bot-login";
import { BotLoginStore } from "../../../../lib/gpt-chat/bot-login-store";
import { sha256Hex } from "../../../../lib/gpt-chat/hash";
import { fail, json, readJsonLimited } from "../../../../lib/gpt-chat/http";
import {
  IdentityStore,
  authCookie,
  cookieValue,
  sameOrigin,
} from "../../../../lib/gpt-chat/identity-store";
import { consumeRateLimit } from "../../../../lib/gpt-chat/rate-limit";
import { offeredLoginMethods } from "../../../../lib/gpt-chat/rehearsal";
import { ensureSchema } from "../../../../lib/gpt-chat/schema";

/** Polls per browser and minute: one a second on average. */
const POLLS_PER_MINUTE = 60;

export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!sameOrigin(request)) return fail("forbidden", "Forbidden", 403);
  if (!env.GPTBOT_DRAFTS_DB || !(await offeredLoginMethods(request, env)).includes("bot"))
    return fail("not_found", "Not found", 404);
  const secret = cookieValue(request, BOT_LOGIN_COOKIE);
  if (!/^[a-f0-9]{64}$/.test(secret)) return fail("forbidden", "Forbidden", 403);
  const body = await readJsonLimited<{ id?: unknown; code?: unknown }>(request, 512);
  const id = body.ok ? body.value?.id : undefined;
  const code = body.ok ? body.value?.code : undefined;
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{16}$/.test(id) ||
    (code !== undefined && (typeof code !== "string" || !/^\d{6}$/.test(code)))
  )
    return fail("bad_request", "Invalid request");
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensureBillingSchema(db);
    const browserHash = await sha256Hex(secret);
    const pace = await consumeRateLimit(db, "bot_login_poll", browserHash, {
      limit: POLLS_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!pace.allowed || pace.degraded) return fail("try_later", "Try later", 429);
    const store = new BotLoginStore(db, BILLING_ORG);
    const poll = await store.consume(id, browserHash, Date.now(), code);
    if (poll.status !== "done") return json({ ok: true, status: poll.status });
    const identity = new IdentityStore(db, BILLING_ORG);
    let token: string;
    try {
      token = await identity.login(poll.identityHash);
      // A pack this browser bought as a guest moves to the account (adoptGuest).
      await identity.adoptGuest(request, poll.identityHash);
      await identity.logout(request);
    } catch (error) {
      // The pack cannot move now (an invoice of the account Click holds): an
      // answer, not a retry. The guest keeps its session and its pack.
      if (error instanceof Error && error.message === "guest_not_moved")
        return json({ ok: true, status: "failed" });
      await store.release(id, browserHash).catch(() => {});
      return fail("store_unavailable", "Try later", 503);
    }
    const response = json({ ok: true, status: "done" }, 200, {
      "Set-Cookie": authCookie("__Host-gpt_account", token, 30 * 86400),
    });
    for (const name of [BOT_LOGIN_COOKIE, "gpt_sid", "gpt_sat"])
      response.headers.append("Set-Cookie", authCookie(name, "", 0));
    return response;
  } catch {
    return fail("store_unavailable", "Try later", 503);
  }
};

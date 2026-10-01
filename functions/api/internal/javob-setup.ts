// POST /api/internal/javob-setup — apply or check the public profile of Javob
// (@gptbotuz_bot): its command menu and descriptions from
// functions/lib/telegram/bot-profile.ts, RU as the default and UZ for Uzbek
// clients. Auth: Authorization: Bearer GPT_BILLING_MAINTENANCE_SECRET, checked
// before the body is read. The bot token (TELEGRAM_ASSISTANT_BOT_TOKEN) stays
// inside Pages: no BotFather, no token on anybody's machine.
//
// Body (optional JSON, ≤ 256 bytes):
//   {}               read only: getMyCommands, getMyShortDescription and
//                    getMyDescription per language, compared with bot-profile.ts
//   {"apply":true}   setMyCommands, setMyShortDescription and setMyDescription
//                    per language, then the same read-back
// The webhook is never touched (scripts/telegram-setup.ts owns it, with its
// guard). A token that belongs to a protected bot (@aidirectprobot, the live
// Ads lead bot) is refused before anything is written. The answer names the
// bot and shows what Telegram holds now; it never carries the token.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { fail, json, readTextLimited } from "../../lib/gpt-chat/http";
import { sameSecret } from "../../lib/gpt-chat/payment-protocol";
import {
  JAVOB_PROFILE,
  PROFILE_LANGUAGES,
  type BotCommand,
  type ProfileLanguage,
} from "../../lib/telegram/bot-profile";
import { TelegramClient } from "../../lib/telegram/client";
import { isProtectedBotUsername } from "../../lib/telegram/config";

/** Every Bot API call here is small; a stuck one must not hold the request. */
const CALL = { timeoutMs: 5_000, maxRetries: 1 } as const;

interface ProfileState {
  commands: BotCommand[] | null;
  shortDescription: string | null;
  description: string | null;
  /** Telegram holds exactly bot-profile.ts for this language. */
  matches: boolean;
}

const label = (language: ProfileLanguage) => language || "default";
const withLanguage = (language: ProfileLanguage) =>
  language ? { language_code: language } : {};

async function readProfile(tg: TelegramClient, language: ProfileLanguage): Promise<ProfileState> {
  const [commands, short, full] = await Promise.all([
    tg.call<BotCommand[]>("getMyCommands", withLanguage(language), CALL),
    tg.call<{ short_description?: string }>("getMyShortDescription", withLanguage(language), CALL),
    tg.call<{ description?: string }>("getMyDescription", withLanguage(language), CALL),
  ]);
  const state = {
    commands: commands.ok && Array.isArray(commands.result)
      ? commands.result.map(({ command, description }) => ({ command, description }))
      : null,
    shortDescription: short.ok ? short.result?.short_description ?? "" : null,
    description: full.ok ? full.result?.description ?? "" : null,
  };
  const expected = JAVOB_PROFILE[language];
  return {
    ...state,
    matches:
      JSON.stringify(state.commands) === JSON.stringify(expected.commands) &&
      state.shortDescription === expected.shortDescription &&
      state.description === expected.description,
  };
}

/** Apply one language; returns the methods Telegram refused. */
async function applyProfile(tg: TelegramClient, language: ProfileLanguage): Promise<string[]> {
  const profile = JAVOB_PROFILE[language];
  const calls: Array<[string, Record<string, unknown>]> = [
    ["setMyCommands", { commands: profile.commands }],
    ["setMyShortDescription", { short_description: profile.shortDescription }],
    ["setMyDescription", { description: profile.description }],
  ];
  const results = await Promise.all(
    calls.map(([method, body]) => tg.call(method, { ...body, ...withLanguage(language) }, CALL)),
  );
  return calls.filter((_, i) => !results[i].ok).map(([method]) => `${method}:${label(language)}`);
}

export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  const secret = env.GPT_BILLING_MAINTENANCE_SECRET;
  if (
    !secret ||
    !sameSecret(request.headers.get("authorization") || "", `Bearer ${secret}`)
  )
    return fail("forbidden", "Forbidden", 403);
  const body = await readTextLimited(request, 256);
  if (!body.ok && body.code === "payload_too_large")
    return fail("payload_too_large", "Invalid request body", 413);
  let apply = false;
  if (body.ok && body.value.trim()) {
    try {
      const parsed: unknown = JSON.parse(body.value);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        return fail("bad_json", "Invalid JSON body");
      apply = (parsed as { apply?: unknown }).apply === true;
    } catch {
      return fail("bad_json", "Invalid JSON body");
    }
  }
  if (!env.TELEGRAM_ASSISTANT_BOT_TOKEN)
    return fail("bot_unconfigured", "The assistant bot is not configured", 503);

  const tg = new TelegramClient(env.TELEGRAM_ASSISTANT_BOT_TOKEN);
  const me = await tg.call<{ username?: string }>("getMe", {}, CALL);
  const username = me.ok ? me.result?.username ?? "" : "";
  if (!username) return fail("telegram_unavailable", "getMe failed", 502);
  if (isProtectedBotUsername(username))
    return fail("protected_bot", "This token belongs to a protected bot; nothing was changed", 409);

  const failed = apply
    ? (await Promise.all(PROFILE_LANGUAGES.map((language) => applyProfile(tg, language)))).flat()
    : [];
  const states = await Promise.all(PROFILE_LANGUAGES.map((language) => readProfile(tg, language)));
  const profiles = Object.fromEntries(
    PROFILE_LANGUAGES.map((language, i) => [label(language), states[i]]),
  );
  return json(
    {
      ok: failed.length === 0,
      bot: `@${username}`,
      applied: apply ? { failed } : null,
      matches: states.every((state) => state.matches),
      profiles,
    },
    failed.length ? 502 : 200,
  );
};

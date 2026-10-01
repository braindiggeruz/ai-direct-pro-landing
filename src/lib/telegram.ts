// Single source of truth for the Telegram assistant deep link on the site.
// The bot @username is PUBLIC (not a secret) and comes from the build-time
// env VITE_TELEGRAM_BOT_USERNAME.
//
// It falls back to the live assistant handle rather than to an empty string,
// also when the variable is set but blank or just "@". The empty default was
// not a safety feature in practice: VITE_ vars are inlined at build time from
// .env files that .gitignore excludes, so every clean checkout built with the
// variable unset, the chat treated the bot as unconfigured, and the compiler
// dropped the only Telegram CTA out of the chat — the site's single
// highest-traffic surface shipped for weeks with no route to the business. A
// public handle is not a secret; keep this value equal to
// GPT_HANDOFF_BOT_USERNAME in wrangler.toml, which is the bot whose webhook is
// actually configured. There is always a bot, so no chat route falls back to a
// person's account.
import type { Locale } from '../gpt-chat/types';

const DEFAULT_BOT_USERNAME = 'gptbotuz_bot';
const BUILD_ENV = import.meta.env as { VITE_TELEGRAM_BOT_USERNAME?: string } | undefined;
export const TELEGRAM_BOT_USERNAME =
  (BUILD_ENV?.VITE_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim() || DEFAULT_BOT_USERNAME;

/** Deep link that opens the bot and carries a /start source payload. */
export function telegramDeepLink(locale: Locale): string {
  const source = locale === 'uz' ? 'site_uz' : 'site_ru';
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${source}`;
}

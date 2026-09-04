// Single source of truth for the Telegram assistant deep link on the site.
// The bot @username is PUBLIC (not a secret) and comes from the build-time
// env VITE_TELEGRAM_BOT_USERNAME.
//
// It falls back to the live assistant handle rather than to an empty string.
// The empty default was not a safety feature in practice: VITE_ vars are
// inlined at build time from .env files that .gitignore excludes, so every
// clean checkout built with the variable unset, TELEGRAM_CONFIGURED evaluated
// false, and the compiler dropped the only Telegram CTA out of the chat — the
// site's single highest-traffic surface shipped for weeks with no route to the
// business. A public handle is not a secret; keep this value equal to
// GPT_HANDOFF_BOT_USERNAME in wrangler.toml, which is the bot whose webhook is
// actually configured.
import type { Locale } from '../gpt-chat/types';

const DEFAULT_BOT_USERNAME = 'gptbotuz_bot';
const RAW = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) || DEFAULT_BOT_USERNAME;
export const TELEGRAM_BOT_USERNAME = RAW.replace(/^@/, '').trim();
export const TELEGRAM_CONFIGURED = TELEGRAM_BOT_USERNAME.length > 0;

/** Deep link that opens the bot and carries a /start source payload. */
export function telegramDeepLink(locale: Locale): string {
  const source = locale === 'uz' ? 'site_uz' : 'site_ru';
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${source}`;
}

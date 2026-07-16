// Single source of truth for the Telegram assistant deep link on the site.
// The bot @username is PUBLIC (not a secret) and comes from the build-time
// env VITE_TELEGRAM_BOT_USERNAME. When unset, the CTA is hidden rather than
// linking to a broken handle.
import type { Locale } from '../gpt-chat/types';

const RAW = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) || '';
export const TELEGRAM_BOT_USERNAME = RAW.replace(/^@/, '').trim();
export const TELEGRAM_CONFIGURED = TELEGRAM_BOT_USERNAME.length > 0;

/** Deep link that opens the bot and carries a /start source payload. */
export function telegramDeepLink(locale: Locale): string {
  const source = locale === 'uz' ? 'site_uz' : 'site_ru';
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${source}`;
}

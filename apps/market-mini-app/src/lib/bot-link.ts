import {
  SOTUVCHI_BOT_USERNAME,
  isUsableSotuvchiBotUsername,
  sotuvchiSellerStartUrl,
} from '../../../../src/shared/sotuvchi-config';

/**
 * Links back into the Bormi chat.
 *
 * Both are derived from the one module the landing page and the release checks
 * already read, so the Mini App cannot drift into a second, invented `t.me`
 * address. Both resolve to `null` when no safe username is configured, and a
 * `null` means the control is not offered at all — an entry point that leads
 * nowhere is worse than a missing one.
 *
 * `?start=agent_seller` is the payload the bot already answers with seller
 * onboarding (`parseTelegramStartPayload`), and the exact URL is asserted in
 * `tests/sotuvchi-pilot-readiness.test.ts`.
 */
export const SELLER_START_URL: string | null = sotuvchiSellerStartUrl();

export const BOT_CHAT_URL: string | null =
  isUsableSotuvchiBotUsername(SOTUVCHI_BOT_USERNAME)
    ? `https://t.me/${SOTUVCHI_BOT_USERNAME}`
    : null;

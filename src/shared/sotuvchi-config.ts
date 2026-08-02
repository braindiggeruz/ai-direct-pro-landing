// Single public source of truth for the Sotuvchi (GPTBot Agents) bot link.
//
// The Agents bot is deliberately separate from the two live Telegram products:
// the lead bot @aidirectprobot and the Javob bot @gptbot_javob_bot. Nothing in
// the public site may ever point a seller at those.
//
// The public username below is the expected identity for the dedicated Agents
// bot. Release setup must still verify it through Telegram getMe before any
// secret or webhook mutation.
//
// Build requirement before the pilot: set SOTUVCHI_BOT_USERNAME to the exact
// username of the bot behind TELEGRAM_AGENTS_BOT_USERNAME, run the build and
// verify the landing CTA with `npx tsx scripts/sotuvchi-pilot-check.ts`.

/** Deep-link payload that opens seller onboarding; see channels/telegram. */
export const SOTUVCHI_SELLER_START_PAYLOAD = 'agent_seller';

/** Usernames of the live products the Agents bot must never be confused with. */
export const PROTECTED_TELEGRAM_BOT_USERNAMES = [
  'aidirectprobot',
  'gptbot_javob_bot',
] as const;

/** Exact expected public username of the dedicated Agents bot. */
export const SOTUVCHI_BOT_USERNAME: string | null = 'BormiMarketBot';

/** Safe in-page fallback used while the bot username is unknown. */
export const SOTUVCHI_PILOT_ANCHOR = '#pilot';

const USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

export function isUsableSotuvchiBotUsername(
  username: string | null,
): username is string {
  if (!username || !USERNAME.test(username)) return false;
  const normalized = username.toLowerCase();
  return !PROTECTED_TELEGRAM_BOT_USERNAMES.some(
    (protectedName) => protectedName === normalized,
  );
}

/**
 * Seller onboarding deep link, or null when no safe username is configured.
 * Callers must fall back to `SOTUVCHI_PILOT_ANCHOR` rather than emitting a
 * half-built t.me URL.
 */
export function sotuvchiSellerStartUrl(
  username: string | null = SOTUVCHI_BOT_USERNAME,
): string | null {
  if (!isUsableSotuvchiBotUsername(username)) return null;
  return `https://t.me/${username}?start=${SOTUVCHI_SELLER_START_PAYLOAD}`;
}

/** The href the landing CTA should use right now. */
export function sotuvchiSellerCtaHref(
  username: string | null = SOTUVCHI_BOT_USERNAME,
): string {
  return sotuvchiSellerStartUrl(username) ?? SOTUVCHI_PILOT_ANCHOR;
}

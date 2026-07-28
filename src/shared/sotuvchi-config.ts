// Single public source of truth for the Sotuvchi (GPTBot Agents) bot link.
//
// The Agents bot is deliberately separate from the two live Telegram products:
// the lead bot @aidirectprobot and the Javob bot @gptbot_javob_bot. Nothing in
// the public site may ever point a seller at those.
//
// The final public username of the Agents bot does not exist yet, so it stays
// `null` here on purpose: a guessed handle would ship as a working link to
// somebody else's bot. Until the owner registers the bot, the landing CTA
// resolves to the on-page pilot section instead of a broken deep link.
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

/** Exact public username of the Agents bot, or null until it is registered. */
export const SOTUVCHI_BOT_USERNAME: string | null = null;

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

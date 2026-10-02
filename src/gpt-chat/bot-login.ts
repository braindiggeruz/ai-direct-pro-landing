// Sign-in through the bot @gptbotuz_bot, the browser's side (plan WP-16; the
// server is functions/api/gpt/auth/bot/*): the attempt this tab is in. It is
// kept in sessionStorage for its 10 minutes, so a tab the phone reloaded
// while Telegram was in front picks it up again (AiAccountPanel, on the
// start bundle, reopens the window; the requests live in the lazy
// components/AiBotLogin.tsx). The number and the deep link stay out of the
// chat's analytics events: only `method` and `status` are ever tracked (an
// analytics script's own outbound-link tracking may still see the link).
import { isBotLoginUrl } from './handoff';

export type BotLoginStatus = 'pending' | 'claimed' | 'rejected' | 'expired' | 'done';

export interface BotLoginAttempt {
  id: string;
  /** pick: press `code` in the bot; code: type in the code the bot sends. */
  mode: 'pick' | 'code';
  /** pick: the 2-digit number to press; code: null. */
  code: string | null;
  deepLink: string;
  /** When the attempt ends, on this browser's clock (epoch ms). */
  expiresAt: number;
}

const STORAGE_KEY = 'gptchat_botlogin_pending';
/** The longest life a start answer may claim for an attempt. */
const MAX_LIFETIME_MS = 3_600_000;

/** A start answer the window may act on: our bot's sign-in link and a well-formed attempt. */
export function validBotLoginAttempt(value: unknown): value is BotLoginAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as BotLoginAttempt;
  return typeof attempt.id === 'string' && /^[0-9a-f]{16}$/.test(attempt.id)
    && (attempt.mode === 'pick' ? typeof attempt.code === 'string' && /^\d{2}$/.test(attempt.code)
      : attempt.mode === 'code' && attempt.code === null)
    && typeof attempt.deepLink === 'string' && isBotLoginUrl(attempt.deepLink)
    && Number.isSafeInteger(attempt.expiresAt) && attempt.expiresAt > 0;
}

/**
 * The attempt in an answer of POST /api/gpt/auth/bot/start, or null. Its end
 * is counted on this browser's clock from the answer's `expiresIn`, not taken
 * from the server's `expiresAt`: a computer whose clock runs ten minutes or
 * more ahead (a wrong time zone set to the local time by hand) would see
 * every attempt expired the moment it starts and could never sign in.
 */
export function attemptFromStart(value: unknown, now = Date.now()): BotLoginAttempt | null {
  if (!value || typeof value !== 'object') return null;
  const { id, mode, code, deepLink, expiresIn } = value as Record<string, unknown>;
  if (typeof expiresIn !== 'number' || !Number.isSafeInteger(expiresIn) || expiresIn <= 0 || expiresIn > MAX_LIFETIME_MS)
    return null;
  const attempt = { id, mode, code, deepLink, expiresAt: now + expiresIn };
  return validBotLoginAttempt(attempt) ? attempt : null;
}

/** The attempt this tab is in the middle of, while it lives. */
export function loadBotLogin(now = Date.now()): BotLoginAttempt | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    return validBotLoginAttempt(value) && value.expiresAt > now ? value : null;
  } catch {
    return null;
  }
}

export function saveBotLogin(attempt: BotLoginAttempt | null): void {
  try {
    if (attempt) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: the attempt simply does not survive a reload */
  }
}

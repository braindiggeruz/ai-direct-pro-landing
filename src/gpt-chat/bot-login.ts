// Sign-in through the bot @gptbotuz_bot, the browser's side (plan WP-16; the
// server is functions/api/gpt/auth/bot/*): the attempt this tab is in. It is
// kept in sessionStorage for its 10 minutes, so a tab the phone reloaded
// while Telegram was in front picks it up again (AiAccountPanel, on the
// start bundle, reopens the window; the requests live in the lazy
// components/AiBotLogin.tsx). The number and the deep link stay out of
// analytics: only `method` and `status` are ever tracked.
import { isBotLoginUrl } from './handoff';

export type BotLoginStatus = 'pending' | 'claimed' | 'rejected' | 'expired' | 'done';

export interface BotLoginAttempt {
  id: string;
  /** pick: press `code` in the bot; code: type in the code the bot sends. */
  mode: 'pick' | 'code';
  /** pick: the 2-digit number to press; code: null. */
  code: string | null;
  deepLink: string;
  expiresAt: number;
}

const STORAGE_KEY = 'gptchat_botlogin_pending';

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

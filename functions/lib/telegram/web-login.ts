// The Telegram end of signing in on gptbot.uz through the bot (plan WP-16,
// decision L11). The site's end is functions/api/gpt/auth/bot/*, the state
// machine functions/lib/gpt-chat/bot-login-store.ts.
//
//   /start login_<nonce>  the person tapped «Открыть Telegram» on the site. The
//                         first Telegram account to open the link holds it; the
//                         bot shows which browser asked and when, and asks for
//                         the number the site shows (pick) or sends the code to
//                         type in there (code).
//   lg:<n>:<id>           a number pressed: the one press an attempt gets.
//   lgx:<id>              «Это не я»: the attempt ends.
//   lgout:<locale>        «Выйти на всех устройствах»: every web session of the
//                         presser's own account ends.
//
// None of this calls a model or touches Javob's allowance, so it works while
// the models are down. Only private chats get here (handler.ts). The payload
// is hostile: its shape is checked before D1, and it opens at most 10 times
// an hour per Telegram user. The web tables get the HMAC identity only
// (telegram-identity.ts); events carry the locale only — no nonce, number,
// code or Telegram id.
import { BILLING_ORG, type BillingEnv } from '../gpt-chat/billing-config';
import { ensureBillingSchema } from '../gpt-chat/billing-schema';
import { LOGIN_PAYLOAD_PREFIX, LOGIN_PAYLOAD_RE } from '../gpt-chat/bot-login';
import { BotLoginStore, type BotLoginRow } from '../gpt-chat/bot-login-store';
import { alertOperator } from '../gpt-chat/operator-alert';
import { consumeRateLimit, HOUR_MS } from '../gpt-chat/rate-limit';
import { ensureSchema } from '../gpt-chat/schema';
import { telegramIdentityHash } from '../gpt-chat/telegram-identity';
import type { TelegramClient } from './client';
import type { TelegramConfig } from './config';
import * as C from './i18n';
import * as S from './store';
import type { Locale } from './store';

export interface WebLoginDeps {
  env: BillingEnv;
  db: D1Database;
  cfg: TelegramConfig;
  tg: TelegramClient;
}

/** A press of a sign-in button, as Telegram delivers it. */
export interface WebLoginCallback {
  id: string;
  from: { id: number };
  data?: string;
  message?: { chat: { id: number; type?: string }; message_id: number };
}

/** Opens of sign-in links per Telegram user and hour. */
const OPENS_PER_HOUR = 10;
/** Below this GPT_IDENTITY_SECRET counts as unset, as everywhere else. */
const MIN_SECRET_LENGTH = 32;
const PRESS = /^lg:(\d{2}):([0-9a-f]{16})$/;
const DENY = /^lgx:([0-9a-f]{16})$/;
const LOGOUT = /^lgout:(ru|uz)$/;

/** Shape test before anything touches D1: `login_` + 32 lowercase hex. */
export function isWebLoginPayload(payload: string): boolean {
  return LOGIN_PAYLOAD_RE.test(payload);
}

/** A press this module owns: every lg:, lgx: and lgout: callback, well-formed or not. */
export function isWebLoginCallback(data: string): boolean {
  return /^(?:lg|lgx|lgout):/.test(data);
}

function identitySecret(env: BillingEnv): string | null {
  const secret = env.GPT_IDENTITY_SECRET || '';
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

async function sendRequest(tg: TelegramClient, chatId: number, row: BotLoginRow): Promise<void> {
  if (row.mode === 'pick')
    await tg.sendMessage(chatId, C.loginPrompt(row.locale, row.client, row.created_at), {
      keyboard: C.loginPickKeyboard(row.locale, row.id, (row.choices ?? '').split(',')),
    });
  else
    await tg.sendMessage(chatId, C.loginCodePrompt(row.locale, row.client, row.created_at, row.code), {
      keyboard: C.loginCodeKeyboard(row.locale, row.id),
    });
}

/**
 * `/start login_<nonce>` in a private chat. `locale` is the person's bot
 * language, used until the attempt says which site page they started on.
 */
export async function handleWebLoginStart(
  deps: WebLoginDeps,
  chatId: number,
  fromId: number,
  pseudo: string,
  payload: string,
  locale: Locale,
): Promise<string | undefined> {
  const { env, db, tg } = deps;
  const secret = identitySecret(env);
  if (!secret) {
    // Sign-in through the bot is off: no attempt can exist.
    await S.logEvent(db, 'web_login_stale', pseudo, { locale });
    await tg.sendMessage(chatId, C.LOGIN_STALE[locale]);
    return;
  }
  try {
    await ensureSchema(db);
    await ensureBillingSchema(db);
    const opens = await consumeRateLimit(db, 'bot_login', pseudo, { limit: OPENS_PER_HOUR, windowMs: HOUR_MS });
    if (opens.degraded) throw new Error('rate_limit_unavailable');
    if (!opens.allowed) {
      await S.logEvent(db, 'web_login_limited', pseudo, { locale });
      await tg.sendMessage(chatId, C.LOGIN_LIMITED[locale]);
      return;
    }
    const tgHash = (await telegramIdentityHash(secret, fromId))!;
    const opening = await new BotLoginStore(db, BILLING_ORG).openByNonce(
      payload.slice(LOGIN_PAYLOAD_PREFIX.length),
      tgHash,
    );
    if (opening.result === 'stale' || opening.result === 'taken') {
      await S.logEvent(db, `web_login_${opening.result}`, pseudo, { locale });
      await tg.sendMessage(chatId, (opening.result === 'stale' ? C.LOGIN_STALE : C.LOGIN_TAKEN)[locale]);
      return;
    }
    const { row } = opening;
    await S.logEvent(db, 'web_login_opened', pseudo, { locale: row.locale });
    // Opened again after the number: the outcome and the way out, once more.
    if (opening.result === 'decided')
      await tg.sendMessage(chatId, C.LOGIN_CONFIRMED[row.locale], { keyboard: C.loginLogoutKeyboard(row.locale) });
    else await sendRequest(tg, chatId, row);
  } catch (e) {
    console.error(`tg.web_login: start failed (${(e as Error).name})`);
    await tg.sendMessage(chatId, C.LOGIN_FAILED[locale]);
    await alertOperator(env, 'bot_login_failed');
    return 'login_failed';
  }
}

const OUTCOME: Record<'confirmed' | 'rejected' | 'denied', { text: Record<Locale, string>; event: string }> = {
  confirmed: { text: C.LOGIN_CONFIRMED, event: 'web_login_confirmed' },
  rejected: { text: C.LOGIN_REJECTED, event: 'web_login_rejected' },
  denied: { text: C.LOGIN_DENIED, event: 'web_login_denied' },
};

/**
 * A press of lg:, lgx: or lgout:. It answers the callback itself, with a
 * toast; a decision rewrites the message, so its buttons go and a second
 * press finds nothing to press. A press that changes nothing (a repeat,
 * someone else's attempt, an expired one) gets the toast only.
 */
export async function handleWebLoginCallback(
  deps: WebLoginDeps,
  cq: WebLoginCallback,
  locale: Locale,
): Promise<string | undefined> {
  const { env, db, cfg, tg } = deps;
  const data = cq.data || '';
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  const secret = identitySecret(env);
  const press = PRESS.exec(data);
  const deny = DENY.exec(data);
  const logout = LOGOUT.exec(data);
  if (cq.message?.chat.type !== 'private' || !chatId || !messageId || !secret || !(press || deny || logout)) {
    await tg.answerCallbackQuery(cq.id, C.LOGIN_TOAST[locale].stale);
    return;
  }
  try {
    await ensureSchema(db);
    await ensureBillingSchema(db);
    const tgHash = (await telegramIdentityHash(secret, cq.from.id))!;
    const pseudo = await S.pseudoUser(cq.from.id, cfg);
    const store = new BotLoginStore(db, BILLING_ORG);
    if (logout) {
      const shown = logout[1] as Locale;
      await store.revokeSessions(tgHash);
      await tg.answerCallbackQuery(cq.id, C.LOGIN_TOAST[shown].revoked);
      await tg.editMessageText(chatId, messageId, C.LOGIN_REVOKED[shown]);
      await S.logEvent(db, 'web_login_revoked', pseudo, { locale: shown });
      return;
    }
    const { result, locale: started } = press
      ? await store.decide(press[2], tgHash, press[1])
      : await store.reject(deny![1], tgHash);
    const shown = started ?? locale;
    if (result === 'repeat' || result === 'foreign') {
      await tg.answerCallbackQuery(cq.id, C.LOGIN_TOAST[shown][result]);
      return;
    }
    if (result === 'stale') {
      await tg.answerCallbackQuery(cq.id, C.LOGIN_TOAST[shown].stale);
      await tg.editMessageText(chatId, messageId, C.LOGIN_STALE[shown]);
      return;
    }
    const outcome = result === 'rejected' && deny ? 'denied' : result;
    await tg.answerCallbackQuery(cq.id, C.LOGIN_TOAST[shown][outcome]);
    await tg.editMessageText(
      chatId,
      messageId,
      OUTCOME[outcome].text[shown],
      outcome === 'confirmed' ? C.loginLogoutKeyboard(shown) : undefined,
    );
    await S.logEvent(db, OUTCOME[outcome].event, pseudo, { locale: shown });
  } catch (e) {
    console.error(`tg.web_login: press failed (${(e as Error).name})`);
    await tg.answerCallbackQuery(cq.id, C.LOGIN_TOAST[locale].failed);
    await alertOperator(env, 'bot_login_failed');
    return 'login_failed';
  }
}

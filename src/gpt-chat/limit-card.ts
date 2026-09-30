// What the chat's limit card says and which exits it offers.
import { strings } from './i18n';
import type { Locale } from './types';

/**
 * Which cap was hit. 'hourly' is a pause of at most an hour with the day's
 * allowance still unspent; 'daily' is over until tomorrow. The two must not be
 * confused: treating an hourly pause as a daily one locks a willing visitor
 * out for the rest of the day.
 */
export type LimitReason = 'hourly' | 'daily' | 'monthly';

export interface LimitCardInput {
  reason: LimitReason;
  /** An access period is active (a paid package). */
  paid: boolean;
  /** A package can really be bought right now (mode + a ready provider). */
  billingAvailable: boolean;
  /** The server's account view said botHandoff === true. */
  botHandoff: boolean;
}

export interface LimitCard {
  body: string;
  /** The account button leads the card instead of the secondary row. */
  accountFirst: boolean;
  /** Render AiLimitTelegram (the assistant bot route). */
  bot: boolean;
}

/**
 * The bot route appears only while GPT_BOT_HANDOFF_ENABLED is on, and the copy
 * follows it: without the button no line tells a blocked visitor to go on in
 * the bot, and none claims the free chat is still available.
 */
export function limitCard(locale: Locale, s: LimitCardInput): LimitCard {
  const t = strings(locale);
  const body =
    s.reason === 'monthly'
      ? t.premium.monthlyLimit
      : s.paid
        ? t.premium.pause
        : s.reason === 'hourly'
          ? s.botHandoff ? t.hourlyBody : t.premium.pause
          : s.billingAvailable
            ? t.premium.offer
            : s.botHandoff ? t.dailyBody : t.dailyTitle;
  return {
    body,
    accountFirst: s.billingAvailable && !s.paid,
    bot: s.botHandoff,
  };
}

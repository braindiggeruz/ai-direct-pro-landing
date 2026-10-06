// What the chat's limit card says and which exits it offers (plan WP-06, map
// 03 §3.1). Pure: the console passes the limit, the account facts and the
// time it last read the clock.
import { strings } from './i18n';
import type { LimitState } from './limit-state';
import type { Locale, PackTerms } from './types';

export interface LimitCardInput {
  /** A package can really be bought right now (mode + a ready provider). */
  billingAvailable: boolean;
  /** An access period is active (a paid package). */
  paid: boolean;
  /** The server's account view said botHandoff === true. */
  botHandoff: boolean;
  /** Answers left today (free tier) or in the pack; -1 when unknown. */
  remaining: number;
  /** The pack on sale as the server states it; null when the account view gave none. */
  pack?: PackTerms | null;
}

export interface LimitCard {
  /** The free tier's caps have a heading; the rest are one sentence. */
  title: string | null;
  body: string;
  /** When a turn fits again, from the clock; null when the body already says it or time does not lift the limit. */
  wait: string | null;
  /** The limit has lifted: the send button is back, the server decides. */
  ready: boolean;
  /** Offer the pack window: only while a pack can really be bought. */
  account: boolean;
  /** The pack's value under the limit (price, answers, no auto-renewal); null without an offer or terms. */
  offer: string | null;
  /** The pack button's label: with the price when the terms are known. */
  cta: string;
  /** The assistant bot route and its handoff intent: the free tier's caps only, while the server enables it. */
  bot: 'hourly' | 'daily' | null;
}

/** Tashkent keeps UTC+5 all year. */
const TASHKENT_OFFSET_MS = 5 * 3_600_000;

function tashkentDate(at: number): string {
  return new Date(at + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The limits' day turns at 00:00 UTC, which is 05:00 in Tashkent. A refusal
 * between 00:00 and 05:00 there lifts on the visitor's own calendar day:
 * "today from 05:00", not "tomorrow" (the WP-05 review's night case).
 */
export function liftsToday(retryAt: number, now: number): boolean {
  return tashkentDate(retryAt) === tashkentDate(now);
}

/**
 * When a limit lifts on Tashkent's clock, «14:35»: UTC+5 by arithmetic, so
 * an old WebView without time-zone data says the same. Null if the time is
 * not a date; the card then gives the minutes alone.
 */
export function tashkentTime(at: number): string | null {
  try {
    return new Date(at + TASHKENT_OFFSET_MS).toISOString().slice(11, 16);
  } catch {
    return null;
  }
}

export function limitCard(locale: Locale, limit: LimitState, s: LimitCardInput, now: number): LimitCard {
  const t = strings(locale);
  const ready = limit.retryAt !== null && now >= limit.retryAt;
  const today = limit.retryAt !== null && liftsToday(limit.retryAt, now);
  const daily = limit.limits?.daily ?? null;
  const freeCap = limit.reason === 'hourly' || limit.reason === 'daily' ? limit.reason : null;

  let title: string | null = null;
  let body: string;
  switch (limit.reason) {
    case 'hourly':
      title = t.hourlyTitle;
      body = t.hourlyBody(limit.limits?.hourly ?? null);
      break;
    case 'daily':
      title = t.dailyTitle;
      body = t.dailyBody(daily, today);
      break;
    case 'pack_daily':
      body = t.packDailyBody(daily, s.remaining >= 0 ? s.remaining : null, today);
      break;
    case 'monthly':
      body = t.premium.monthlyLimit;
      break;
    case 'busy':
      body = t.busyBody;
      break;
    case 'ip':
      body = t.ipBody;
      break;
  }

  let wait: string | null = null;
  if (ready) wait = t.limitReady;
  else if (limit.retryAt !== null && limit.reason !== 'daily' && limit.reason !== 'pack_daily') {
    const left = limit.retryAt - now;
    const minutes = Math.ceil(left / 60_000);
    const at = tashkentTime(limit.retryAt);
    // Minutes and the clock (map 04 U-01): «41 daqiqadan keyin (soat 14:35 da)».
    wait = left < 60_000 ? t.limitLessMinute : at ? t.limitWaitAt(minutes, at) : t.limitWait(minutes);
  }

  const account = s.billingAvailable && (limit.reason === 'monthly' || (freeCap !== null && !s.paid));
  const pack = account && s.pack ? s.pack : null;
  return {
    title,
    body,
    wait,
    ready,
    account,
    // The 'monthly' body already says the pack ran out; the value line is for a free cap.
    offer: pack && freeCap !== null ? t.limitOffer(pack) : null,
    cta: pack ? t.limitBuy(pack, limit.reason === 'monthly') : t.premium.account,
    bot: s.botHandoff ? freeCap : null,
  };
}

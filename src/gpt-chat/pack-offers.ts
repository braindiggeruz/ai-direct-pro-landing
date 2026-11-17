// The packs on offer, for the cards that sell them (chat CRO 2026-11-17): the
// pack window, the trial paywall and the limit card. Lazy parts only: the
// start bundle never imports this file.
//
// The account view names the monthly pack in `pack` and, while the server
// offers it, the 3-day pack beside it in `pack.more` (functions/api/gpt/
// account.ts). Every number shown comes from there; a malformed entry is
// dropped, and the cards are then the one-pack cards they always were.
import type { PackTerms } from './types';

export type PackSku = 'month' | 'once';

export interface PackOffer {
  sku: PackSku;
  priceUzs: number;
  messageLimit: number;
  dailyLimit: number;
  /** The term: whole calendar months, or whole hours. */
  months?: number;
  hours?: number;
}

const whole = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/** The packs on offer, the monthly one first. */
export function offersOf(pack: PackTerms | null | undefined): PackOffer[] {
  if (!pack) return [];
  const month: PackOffer = { sku: 'month', priceUzs: pack.priceUzs, messageLimit: pack.messageLimit, dailyLimit: pack.dailyLimit, months: pack.months };
  const more: unknown = (pack as PackTerms & { more?: unknown }).more;
  const once = (Array.isArray(more) ? more : []).find((entry: Partial<PackOffer> | null) =>
    !!entry && entry.sku === 'once' && whole(entry.priceUzs) && whole(entry.messageLimit) && whole(entry.dailyLimit)
    && whole(entry.hours) && entry.hours % 24 === 0) as PackOffer | undefined;
  return once
    ? [month, { sku: 'once', priceUzs: once.priceUzs, messageLimit: once.messageLimit, dailyLimit: once.dailyLimit, hours: once.hours }]
    : [month];
}

/**
 * The order the cards list them in: someone without a pack sees the small one
 * first (the first payment is the one that is hard to make), a holder the
 * monthly one.
 */
export function listed(offers: PackOffer[], holder: boolean): PackOffer[] {
  return holder ? offers : [...offers].reverse();
}

/** The price of one answer, rounded: what the «выгоднее» mark goes by. */
export function perAnswer(offer: PackOffer): number {
  return Math.round(offer.priceUzs / offer.messageLimit);
}

// The words of the packs on offer (chat CRO 2026-11-17), for the cards that
// draw them: the pack window's rows (chat-pay) and the trial paywall. Apart
// from pack-offers.ts, so the window's own part carries only the offers' shape.
import type { Locale } from './types';
import type { PackOffer } from './pack-offers';

/** Groups of thousands as the window writes them: «20 000». */
export const sumOf = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const days = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дня' : 'дней');
const months = (n: number) => (n === 1 ? 'месяц' : n < 5 ? 'месяца' : 'месяцев');

export const PACK_TEXT = {
  ru: {
    name: (offer: PackOffer) => (offer.sku === 'once' ? `На ${offer.hours! / 24} ${days(offer.hours! / 24)}` : `На ${offer.months === 1 ? '' : `${offer.months} `}${months(offer.months ?? 1)}`),
    sum: (offer: PackOffer) => `${sumOf(offer.priceUzs)} сум`,
    facts: (offer: PackOffer) => (offer.sku === 'once'
      ? `${offer.messageLimit} ответов · ${offer.hours! / 24} ${days(offer.hours! / 24)}`
      : `${offer.messageLimit} ответов · до ${offer.dailyLimit} в день`),
    per: (n: number) => `≈ ${n} сум за ответ`,
    best: 'выгоднее',
    pay: (offer: PackOffer, provider: string) => `Оплатить ${sumOf(offer.priceUzs)} сум через ${provider}`,
    via: 'Оплатить:',
    or: (offer: PackOffer) => `или на ${offer.months === 1 ? 'месяц' : `${offer.months} мес.`}`,
    cheaper: (offer: PackOffer) => `Или пакет на ${offer.hours! / 24} ${days(offer.hours! / 24)} — ${sumOf(offer.priceUzs)} сум`,
    link: (offer: PackOffer, provider: string) => `${provider} · ${sumOf(offer.priceUzs)} сум`,
  },
  uz: {
    name: (offer: PackOffer) => (offer.sku === 'once' ? `${offer.hours! / 24} kunga` : `${offer.months ?? 1} oyga`),
    sum: (offer: PackOffer) => `${sumOf(offer.priceUzs)} so‘m`,
    facts: (offer: PackOffer) => (offer.sku === 'once'
      ? `${offer.messageLimit} ta javob · ${offer.hours! / 24} kun`
      : `${offer.messageLimit} ta javob · kuniga ${offer.dailyLimit} tagacha`),
    per: (n: number) => `≈ ${n} so‘m — bitta javob`,
    best: 'foydaliroq',
    pay: (offer: PackOffer, provider: string) => `${provider} orqali ${sumOf(offer.priceUzs)} so‘m to‘lash`,
    via: 'To‘lash:',
    or: (offer: PackOffer) => `yoki ${offer.months ?? 1} oyga`,
    cheaper: (offer: PackOffer) => `Yoki ${offer.hours! / 24} kunlik paket — ${sumOf(offer.priceUzs)} so‘m`,
    link: (offer: PackOffer, provider: string) => `${provider} · ${sumOf(offer.priceUzs)} so‘m`,
  },
} as const;

export const packText = (locale: Locale) => PACK_TEXT[locale];

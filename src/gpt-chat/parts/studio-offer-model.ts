import type { StudioLocale, StudioPlanId } from '../../../apps/studio/src/api';
export const offerOrder = (repeat: boolean): readonly StudioPlanId[] => repeat ? ['oylik', 'kunlik'] : ['kunlik', 'oylik'];
export const perPresentation = (amount: number, units: number) => units > 1 && amount > 0 ? amount / units : null;
export function studioPrice(amount: number, locale: StudioLocale) {
  return `${new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'uz-UZ', { maximumFractionDigits: 2 }).format(amount)} ${locale === 'ru' ? 'сум' : 'so‘m'}`;
}

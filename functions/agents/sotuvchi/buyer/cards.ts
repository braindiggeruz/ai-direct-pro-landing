import type { Locale, OutboundChoice } from '../../../platform/contracts';
import type { CatalogAvailability } from '../catalog';

export interface ProductCard {
  productRef: string;
  title: string;
  description?: string;
  fields: readonly {
    label: string;
    value: string;
  }[];
  actions?: readonly OutboundChoice[];
}

export function formatBuyerPrice(
  priceMinor: number,
  locale: Locale,
): string {
  const amount = String(priceMinor).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return locale === 'ru' ? `${amount} сум` : `${amount} so‘m`;
}

export function formatBuyerAvailability(
  availability: CatalogAvailability,
  locale: Locale,
): string {
  const labels = {
    ru: {
      available: 'В наличии',
      unavailable: 'Нет в наличии',
      preorder: 'Под заказ',
    },
    uz: {
      available: 'Mavjud',
      unavailable: 'Mavjud emas',
      preorder: 'Buyurtma asosida',
    },
  } as const;
  return labels[locale][availability];
}

export function boundedBuyerDescription(
  description: string | null,
): string {
  if (!description) return '';
  return description.length <= 240
    ? description
    : `${description.slice(0, 239).trimEnd()}…`;
}

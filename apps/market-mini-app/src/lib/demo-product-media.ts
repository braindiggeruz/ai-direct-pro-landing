import type { Locale, Product } from '../types';

const ASSET_ROOT = '/assets/catalog-demo';

export const DEMO_PRODUCT_PREVIEW = [
  { image: `${ASSET_ROOT}/notebook-a5.webp`, name: { ru: 'Блокнот A5', uz: 'A5 bloknot' }, priceMinor: 18_000 },
  { image: `${ASSET_ROOT}/water-bottle.webp`, name: { ru: 'Бутылка для воды', uz: 'Suv idishi' }, priceMinor: 28_000 },
  { image: `${ASSET_ROOT}/power-bank.webp`, name: { ru: 'Внешний аккумулятор', uz: 'Tashqi akkumulyator' }, priceMinor: 250_000 },
  { image: `${ASSET_ROOT}/car-holder.webp`, name: { ru: 'Держатель телефона', uz: 'Telefon ushlagichi' }, priceMinor: 95_000 },
] as const;

const MATCHERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/блокнот|bloknot/i, `${ASSET_ROOT}/notebook-a5.webp`],
  [/бутыл|suv idishi/i, `${ASSET_ROOT}/water-bottle.webp`],
  [/аккумулятор|power.?bank/i, `${ASSET_ROOT}/power-bank.webp`],
  [/держатель телефона|telefon ushlag/i, `${ASSET_ROOT}/car-holder.webp`],
  [/зарядное устройство|quvvatlagich/i, `${ASSET_ROOT}/charger-20w.webp`],
  [/кабель usb|usb kabel/i, `${ASSET_ROOT}/usb-cable.webp`],
  [/калькулятор/i, `${ASSET_ROOT}/calculator.webp`],
  [/карточки для заметок/i, `${ASSET_ROOT}/flash-cards.webp`],
];

export function demoProductImage(product: Product): string | undefined {
  const candidate = `${product.id} ${product.name}`;
  return MATCHERS.find(([pattern]) => pattern.test(candidate))?.[1];
}

export function demoPreviewName(
  item: (typeof DEMO_PRODUCT_PREVIEW)[number],
  locale: Locale,
): string {
  return item.name[locale];
}

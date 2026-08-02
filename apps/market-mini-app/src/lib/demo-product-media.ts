import type { Locale, Product } from '../types';

const ASSET_ROOT = '/assets/catalog-demo';

export const DEMO_PRODUCT_PREVIEW = [
  { image: `${ASSET_ROOT}/bormi-headphones.webp`, name: { ru: 'Беспроводные наушники', uz: 'Simsiz quloqchin' }, priceMinor: 349_000 },
  { image: `${ASSET_ROOT}/bormi-speaker.webp`, name: { ru: 'Портативная колонка', uz: 'Portativ karnay' }, priceMinor: 229_000 },
  { image: `${ASSET_ROOT}/bormi-desk-lamp.webp`, name: { ru: 'Настольная лампа', uz: 'Stol chirog‘i' }, priceMinor: 189_000 },
  { image: `${ASSET_ROOT}/bormi-kettle.webp`, name: { ru: 'Электрический чайник', uz: 'Elektr choynak' }, priceMinor: 299_000 },
] as const;

const MATCHERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/наушник|quloqchin|airbeat/i, `${ASSET_ROOT}/bormi-headphones.webp`],
  [/колонк|speaker|mini sound/i, `${ASSET_ROOT}/bormi-speaker.webp`],
  [/ламп|chiroq|warm light/i, `${ASSET_ROOT}/bormi-desk-lamp.webp`],
  [/чайник|choynak|steel 1\.7/i, `${ASSET_ROOT}/bormi-kettle.webp`],
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

import type {
  FactValue,
  Locale,
} from '../../../platform/contracts';
import {
  boundedBuyerDescription,
  formatBuyerAvailability,
  formatBuyerPrice,
} from './cards';
import type { BuyerQueryResult } from './query';

export type BuyerFactValues = Readonly<Record<string, FactValue>>;

function productValues(
  prefix: string,
  result: BuyerQueryResult['results'][number],
  locale: Locale,
  specificationLimit: number,
): Record<string, FactValue> {
  const { product, categoryName } = result;
  const specifications = product.specifications.slice(
    0,
    Math.min(Math.max(specificationLimit, 0), 4),
  );
  const values: Record<string, FactValue> = {
    [`${prefix}.id`]: product.id,
    [`${prefix}.name`]: product.name,
    [`${prefix}.price_minor`]: product.priceMinor,
    [`${prefix}.price_display`]: formatBuyerPrice(product.priceMinor, locale),
    [`${prefix}.currency`]: product.currency,
    [`${prefix}.availability`]: product.availability,
    [`${prefix}.availability_display`]:
      formatBuyerAvailability(product.availability, locale),
    [`${prefix}.description`]:
      boundedBuyerDescription(product.description),
    [`${prefix}.category_name`]: categoryName ?? '',
    [`${prefix}.store_name`]: result.storeName,
    [`${prefix}.specification_count`]: specifications.length,
  };
  specifications.forEach((specification, index) => {
    values[`${prefix}.specifications.${index}.key`] = specification.key;
    values[`${prefix}.specifications.${index}.label`] =
      locale === 'ru' ? specification.labelRu : specification.labelUz;
    values[`${prefix}.specifications.${index}.value`] = specification.value;
  });
  return values;
}

export function projectBuyerFacts(
  result: BuyerQueryResult,
  locale: Locale,
): BuyerFactValues {
  const values: Record<string, FactValue> = {
    'catalog.query.intent': result.intent,
    'catalog.result.count': result.results.length,
    'catalog.result.has_more': result.hasMore,
    'catalog.result.next_offset': result.nextOffset,
    'catalog.result.full_card': result.fullCard,
    'catalog.result.state': result.state,
  };
  if (result.maxPriceMinor !== undefined) {
    values['catalog.query.max_price_minor'] = result.maxPriceMinor;
    values['catalog.query.max_price_display'] =
      formatBuyerPrice(result.maxPriceMinor, locale);
  }
  if (result.categoryId !== undefined) {
    values['catalog.query.category_id'] = result.categoryId;
  }
  const categories = result.categories ?? [];
  values['catalog.category.count'] = categories.length;
  categories.forEach((category, index) => {
    const prefix = `catalog.categories.${index}`;
    values[`${prefix}.id`] = category.id;
    values[`${prefix}.name`] = category.name;
    values[`${prefix}.product_count`] = category.productCount;
    values[`${prefix}.label`] = `${category.name} (${category.productCount})`;
  });
  result.results.forEach((item, index) => {
    Object.assign(
      values,
      productValues(
        `catalog.results.${index}`,
        item,
        locale,
        result.fullCard ? 4 : 0,
      ),
    );
  });
  if (result.results.length === 1 && result.fullCard) {
    Object.assign(
      values,
      productValues('catalog.product', result.results[0], locale, 4),
    );
  }
  return values;
}

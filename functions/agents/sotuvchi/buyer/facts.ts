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
): Record<string, FactValue> {
  const { product, categoryName } = result;
  return {
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
  };
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
  }
  result.results.forEach((item, index) => {
    Object.assign(values, productValues(`catalog.results.${index}`, item, locale));
  });
  if (result.results.length === 1 && result.fullCard) {
    Object.assign(values, productValues('catalog.product', result.results[0], locale));
  }
  return values;
}

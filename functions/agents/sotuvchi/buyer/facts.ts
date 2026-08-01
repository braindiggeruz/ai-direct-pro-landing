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
    [`${prefix}.media_ref`]: product.mediaRefs[0] ?? '',
    [`${prefix}.updated_display`]: product.updatedAt.slice(0, 10),
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

function comparisonProductValues(
  prefix: string,
  result: BuyerQueryResult['results'][number],
  locale: Locale,
  expectedSpecifications: readonly {
    key: string;
    label: string;
  }[],
): Record<string, FactValue> {
  const specifications = result.product.specifications.slice(0, 2);
  const relevanceReason = result.reasonCodes[0] ?? 'catalog_listing';
  const relevanceLabels = locale === 'ru'
    ? {
        exact_name: 'точное название',
        exact_alias: 'точный проверенный синоним',
        name_prefix: 'начало названия',
        category_match: 'категория',
        all_tokens: 'все параметры запроса',
        partial_tokens: 'часть параметров запроса',
        exact_product_reference: 'выбранный товар',
        catalog_listing: 'параметры не заданы',
      }
    : {
        exact_name: 'aniq nom',
        exact_alias: 'aniq tasdiqlangan sinonim',
        name_prefix: 'nom boshlanishi',
        category_match: 'kategoriya',
        all_tokens: 'so‘rovning barcha parametrlari',
        partial_tokens: 'so‘rov parametrlarining bir qismi',
        exact_product_reference: 'tanlangan mahsulot',
        catalog_listing: 'parametrlar berilmagan',
      };
  const relevanceDisplay = Object.hasOwn(relevanceLabels, relevanceReason)
    ? relevanceLabels[relevanceReason as keyof typeof relevanceLabels]
    : relevanceLabels.catalog_listing;
  const productSpecificationKeys = new Set(
    result.product.specifications.map((specification) => specification.key),
  );
  const missingSpecificationLabels = expectedSpecifications
    .filter(({ key }) => !productSpecificationKeys.has(key))
    .map(({ label }) => label);
  const missingParts = [
    ...(missingSpecificationLabels.length > 0
      ? [missingSpecificationLabels.join(', ')]
      : []),
    ...(result.unmatchedConstraints.length > 0
      ? [locale === 'ru'
          ? `параметры запроса: ${result.unmatchedConstraints.length}`
          : `so‘rov parametrlari: ${result.unmatchedConstraints.length}`]
      : []),
  ];
  const missingRequirementDisplay = missingParts.length > 0
    ? missingParts.join('; ')
    : locale === 'ru'
      ? 'не выявлено'
      : 'aniqlanmadi';
  const values: Record<string, FactValue> = {
    [`${prefix}.id`]: result.product.id,
    [`${prefix}.name`]: result.product.name,
    [`${prefix}.price_minor`]: result.product.priceMinor,
    [`${prefix}.price_display`]:
      formatBuyerPrice(result.product.priceMinor, locale),
    [`${prefix}.availability`]: result.product.availability,
    [`${prefix}.availability_display`]:
      formatBuyerAvailability(result.product.availability, locale),
    [`${prefix}.category_name`]: result.categoryName ?? '',
    [`${prefix}.store_name`]: result.storeName,
    [`${prefix}.specification_count`]: specifications.length,
    [`${prefix}.relevance_score`]: result.score,
    [`${prefix}.relevance_display`]: relevanceDisplay,
    [`${prefix}.missing_requirement_display`]:
      missingRequirementDisplay,
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
  const comparison = result.state.startsWith('comparison_');
  const comparisonSpecifications = comparison
    ? [...new Map(
        result.results.flatMap(({ product }) =>
          product.specifications.map((specification) => [
            specification.key,
            {
              key: specification.key,
              label: locale === 'ru'
                ? specification.labelRu
                : specification.labelUz,
            },
          ] as const)),
      ).values()]
        .sort((left, right) => left.key.localeCompare(right.key))
        .slice(0, 2)
    : [];
  result.results.forEach((item, index) => {
    Object.assign(
      values,
      comparison
        ? comparisonProductValues(
            `catalog.results.${index}`,
            item,
            locale,
            comparisonSpecifications,
          )
        : productValues(
            `catalog.results.${index}`,
            item,
            locale,
            result.fullCard ? 3 : 0,
          ),
    );
  });
  if (result.results.length === 1 && result.fullCard) {
    Object.assign(
      values,
      productValues('catalog.product', result.results[0], locale, 3),
    );
  }
  return values;
}

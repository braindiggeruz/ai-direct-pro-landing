import type {
  FactSheet,
  FactValue,
  Locale,
  Outbound,
  RuntimeExactClaim,
  RuntimeResponseDraft,
} from '../../../platform/contracts';
import type { ProductCard } from './cards';
import { BuyerGroundingError } from './errors';

function fact(
  facts: FactSheet,
  key: string,
  type: 'string' | 'number' | 'boolean',
): FactValue {
  const value = facts.values[key];
  if (typeof value !== type) throw new BuyerGroundingError();
  return value;
}

function stringFact(facts: FactSheet, key: string): string {
  return fact(facts, key, 'string') as string;
}

function numberFact(facts: FactSheet, key: string): number {
  return fact(facts, key, 'number') as number;
}

function booleanFact(facts: FactSheet, key: string): boolean {
  return fact(facts, key, 'boolean') as boolean;
}

function claim(
  claims: RuntimeExactClaim[],
  facts: FactSheet,
  key: string,
): FactValue {
  const value = facts.values[key];
  if (value === undefined) throw new BuyerGroundingError();
  claims.push({ key, value });
  return value;
}

export function safeBuyerHelpResponse(locale: Locale): RuntimeResponseDraft {
  const text = locale === 'ru'
    ? 'Можно спросить:\n— что есть в магазине;\n— сколько стоит товар;\n'
      + '— есть ли товар в наличии;\n— рассказать о товаре.'
    : 'So‘rashingiz mumkin:\n— do‘konda nima bor;\n— mahsulot narxi;\n'
      + '— mahsulot mavjudmi;\n— mahsulot haqida ma’lumot.';
  return { messages: [{ text }], claims: [] };
}

function noResult(locale: Locale): RuntimeResponseDraft {
  return {
    messages: [{
      text: locale === 'ru'
        ? 'Не нашёл такой товар в этом магазине. '
          + 'Попробуйте написать название немного иначе.'
        : 'Bu do‘konda bunday mahsulot topilmadi. '
          + 'Nomini boshqacha yozib ko‘ring.',
    }],
    claims: [],
  };
}

function productCard(
  facts: FactSheet,
  index: number,
  locale: Locale,
  full: boolean,
  claims: RuntimeExactClaim[],
): ProductCard {
  const prefix = `catalog.results.${index}`;
  const productRef = stringFact(facts, `${prefix}.id`);
  const title = claim(claims, facts, `${prefix}.name`) as string;
  const price = claim(claims, facts, `${prefix}.price_display`) as string;
  const availability =
    claim(claims, facts, `${prefix}.availability_display`) as string;
  claim(claims, facts, `${prefix}.price_minor`);
  claim(claims, facts, `${prefix}.currency`);
  claim(claims, facts, `${prefix}.availability`);
  const description = stringFact(facts, `${prefix}.description`);
  const category = stringFact(facts, `${prefix}.category_name`);
  const orderable = stringFact(facts, `${prefix}.availability`) !== 'unavailable';
  if (description) claim(claims, facts, `${prefix}.description`);
  if (category) claim(claims, facts, `${prefix}.category_name`);
  return {
    productRef,
    title,
    ...(description ? { description } : {}),
    fields: [
      {
        label: locale === 'ru' ? 'Цена' : 'Narx',
        value: price,
      },
      {
        label: locale === 'ru' ? 'Наличие' : 'Mavjudligi',
        value: availability,
      },
      ...(category
        ? [{
            label: locale === 'ru' ? 'Категория' : 'Kategoriya',
            value: category,
          }]
        : []),
    ],
    actions: full
      ? [
          // P2.4 entry point: checkout starts only from a trusted full card of
          // an orderable published product, never from free-form buyer text.
          ...(orderable
            ? [{
                id: `buyer-checkout.${productRef}`,
                label: locale === 'ru' ? 'Оформить' : 'Rasmiylashtirish',
              }]
            : []),
          {
            id: 'buyer-back',
            label: locale === 'ru' ? 'Назад к каталогу' : 'Katalogga qaytish',
          },
        ]
      : [{
          id: `buyer-details.${productRef}`,
          label: locale === 'ru' ? 'Подробнее' : 'Batafsil',
        }],
  };
}

export function composeBuyerResponse(
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  const count = numberFact(facts, 'catalog.result.count');
  const state = stringFact(facts, 'catalog.result.state');
  if (!Number.isInteger(count) || count < 0 || count > 5) {
    throw new BuyerGroundingError();
  }
  if (count === 0) {
    return state === 'missing_previous'
      ? safeBuyerHelpResponse(locale)
      : noResult(locale);
  }
  const full = booleanFact(facts, 'catalog.result.full_card');
  const claims: RuntimeExactClaim[] = [];
  const messages: Outbound[] = [];
  for (let index = 0; index < count; index += 1) {
    const card = productCard(facts, index, locale, full, claims);
    messages.push({
      text: '',
      card: {
        ref: card.productRef,
        title: card.title,
        ...(card.description ? { description: card.description } : {}),
        fields: card.fields,
        ...(card.actions ? { actions: card.actions } : {}),
      },
    });
  }
  if (booleanFact(facts, 'catalog.result.has_more')) {
    const nextOffset = numberFact(facts, 'catalog.result.next_offset');
    if (!Number.isInteger(nextOffset) || nextOffset < 1 || nextOffset > 20) {
      throw new BuyerGroundingError();
    }
    const intent = stringFact(facts, 'catalog.query.intent');
    const actionId = intent === 'catalog.filter_price'
      ? `buyer-price-next.${
          numberFact(facts, 'catalog.query.max_price_minor')
        }.${nextOffset}`
      : `buyer-next.${nextOffset}`;
    const last = messages[messages.length - 1];
    messages[messages.length - 1] = {
      ...last,
      choices: [{
        id: actionId,
        label: locale === 'ru' ? 'Следующие товары' : 'Keyingi mahsulotlar',
      }],
    };
  }
  return { messages, claims };
}

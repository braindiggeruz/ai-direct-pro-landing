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
import {
  BUYER_COPY,
  recoveryChoices,
  staleResponse,
} from '../experience';

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

/**
 * P2.6 adds the escalation hint here instead of auto-creating a handoff for
 * every unknown question: the buyer decides when a person should read what
 * they wrote, so no unintended text is ever stored for the seller.
 */
export function safeBuyerHelpResponse(locale: Locale): RuntimeResponseDraft {
  const copy = BUYER_COPY[locale];
  return {
    messages: [{
      text: `${copy.help}\n\n${copy.humanHint}`,
      choices: recoveryChoices(locale),
    }],
    claims: [],
  };
}

export function buyerBudgetPrompt(locale: Locale): RuntimeResponseDraft {
  const copy = BUYER_COPY[locale];
  return {
    messages: [{
      text: copy.budgetPrompt,
      choices: [{ id: 'buyer-home', label: copy.homeButton }],
    }],
    claims: [],
  };
}

export function staleBuyerActionResponse(
  locale: Locale,
): RuntimeResponseDraft {
  return staleResponse(locale);
}

function noResult(locale: Locale): RuntimeResponseDraft {
  const copy = BUYER_COPY[locale];
  return {
    messages: [{
      text: `${copy.noResult}\n\n${copy.humanHint}`,
      choices: recoveryChoices(locale),
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
  const store = claim(claims, facts, `${prefix}.store_name`) as string;
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
      {
        label: BUYER_COPY[locale].store,
        value: store,
      },
      ...(full
        ? Array.from({
            length: (() => {
              const count = numberFact(
                facts,
                `${prefix}.specification_count`,
              );
              if (!Number.isInteger(count) || count < 0 || count > 4) {
                throw new BuyerGroundingError();
              }
              return count;
            })(),
          }, (_unused, specificationIndex) => {
            const label = claim(
              claims,
              facts,
              `${prefix}.specifications.${specificationIndex}.label`,
            ) as string;
            const value = claim(
              claims,
              facts,
              `${prefix}.specifications.${specificationIndex}.value`,
            ) as string;
            claim(
              claims,
              facts,
              `${prefix}.specifications.${specificationIndex}.key`,
            );
            return { label, value };
          })
        : []),
    ],
    actions: [
      ...(!full
        ? [{
            id: `buyer-details.${productRef}`,
            label: BUYER_COPY[locale].details,
          }]
        : []),
      ...(orderable
        ? [{
            id: `buyer-checkout.${productRef}`,
            label: BUYER_COPY[locale].orderAction,
          }]
        : []),
      {
        id: `buyer-similar.${productRef}`,
        label: BUYER_COPY[locale].similar,
      },
      ...(full
        ? [{
            id: 'buyer-seller',
            label: BUYER_COPY[locale].askSeller,
          }]
        : []),
    ],
  };
}

function categoryResponse(
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  const count = numberFact(facts, 'catalog.category.count');
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new BuyerGroundingError();
  }
  const claims: RuntimeExactClaim[] = [];
  const choices = Array.from({ length: count }, (_unused, index) => {
    const prefix = `catalog.categories.${index}`;
    const id = stringFact(facts, `${prefix}.id`);
    const label = claim(claims, facts, `${prefix}.label`) as string;
    claim(claims, facts, `${prefix}.name`);
    claim(claims, facts, `${prefix}.product_count`);
    return { id: `buyer-category.${id}`, label };
  });
  choices.push(
    { id: 'buyer-all-products', label: BUYER_COPY[locale].allProducts },
    { id: 'buyer-home', label: BUYER_COPY[locale].homeButton },
  );
  return {
    messages: [{
      text: BUYER_COPY[locale].categoryPrompt,
      choices,
    }],
    claims,
  };
}

export function composeBuyerResponse(
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  const count = numberFact(facts, 'catalog.result.count');
  const state = stringFact(facts, 'catalog.result.state');
  if (!Number.isInteger(count) || count < 0 || count > 4) {
    throw new BuyerGroundingError();
  }
  if (state === 'categories') return categoryResponse(facts, locale);
  if (state === 'budget_prompt') return buyerBudgetPrompt(locale);
  if (state === 'budget_confirmation') {
    const amount = numberFact(facts, 'catalog.query.max_price_minor');
    const claims: RuntimeExactClaim[] = [];
    claim(claims, facts, 'catalog.query.max_price_minor');
    const amountDisplay = claim(
      claims,
      facts,
      'catalog.query.max_price_display',
    ) as string;
    const copy = BUYER_COPY[locale];
    return {
      messages: [{
        text: copy.budgetConfirm(amountDisplay),
        choices: [
          { id: `buyer-budget.${amount}`, label: copy.budgetUse },
          {
            id: `buyer-number-search.${amount}`,
            label: copy.numberSearch,
          },
          { id: 'buyer-home', label: copy.homeButton },
        ],
      }],
      claims,
    };
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
      ...(!full
        ? {
            choices: [{
              id: 'buyer-seller',
              label: BUYER_COPY[locale].askSeller,
            }],
          }
        : {}),
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
      : intent === 'catalog.category'
        ? `buyer-category-next.${
            stringFact(facts, 'catalog.query.category_id')
          }.${nextOffset}`
        : `buyer-next.${nextOffset}`;
    const last = messages[messages.length - 1];
    messages[messages.length - 1] = {
      ...last,
      choices: [
        ...(!full
          ? [{
              id: 'buyer-seller',
              label: BUYER_COPY[locale].askSeller,
            }]
          : []),
        { id: actionId, label: BUYER_COPY[locale].showMore },
        { id: 'buyer-back', label: BUYER_COPY[locale].backToCatalog },
        { id: 'buyer-home', label: BUYER_COPY[locale].homeButton },
      ],
    };
  } else {
    const last = messages[messages.length - 1];
    messages[messages.length - 1] = {
      ...last,
      choices: [
        ...(!full
          ? [{
              id: 'buyer-seller',
              label: BUYER_COPY[locale].askSeller,
            }]
          : []),
        { id: 'buyer-back', label: BUYER_COPY[locale].backToCatalog },
        { id: 'buyer-home', label: BUYER_COPY[locale].homeButton },
      ],
    };
  }
  return { messages, claims };
}

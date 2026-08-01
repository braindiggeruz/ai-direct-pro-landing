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
  const mediaRef = stringFact(facts, `${prefix}.media_ref`);
  const updated = claim(
    claims,
    facts,
    `${prefix}.updated_display`,
  ) as string;
  const orderable = stringFact(facts, `${prefix}.availability`) !== 'unavailable';
  if (description) claim(claims, facts, `${prefix}.description`);
  if (category) claim(claims, facts, `${prefix}.category_name`);
  if (mediaRef) claim(claims, facts, `${prefix}.media_ref`);
  return {
    productRef,
    ...(mediaRef ? { mediaRef } : {}),
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
      {
        label: locale === 'ru' ? 'Обновлено' : 'Yangilangan',
        value: updated,
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
      ...(orderable
        ? [{
            id: `buyer-checkout.${productRef}`,
            label: BUYER_COPY[locale].orderAction,
          }]
        : [{
            id: full
              ? `buyer-similar.${productRef}`
              : `buyer-details.${productRef}`,
            label: full
              ? BUYER_COPY[locale].similar
              : BUYER_COPY[locale].details,
          }]),
      ...(full
        ? [{
            id: 'buyer-seller',
            label: BUYER_COPY[locale].askSeller,
          }]
        : [{
            id: `buyer-compare.${productRef}`,
            label: BUYER_COPY[locale].compare,
          }]),
    ],
  };
}

function comparisonCard(
  facts: FactSheet,
  index: number,
  locale: Locale,
  claims: RuntimeExactClaim[],
): ProductCard {
  const copy = BUYER_COPY[locale];
  const prefix = `catalog.results.${index}`;
  const productRef = stringFact(facts, `${prefix}.id`);
  const availability = stringFact(facts, `${prefix}.availability`);
  const specificationCount = numberFact(
    facts,
    `${prefix}.specification_count`,
  );
  if (
    !Number.isInteger(specificationCount)
    || specificationCount < 0
    || specificationCount > 2
  ) {
    throw new BuyerGroundingError();
  }
  const fields = [
    {
      label: locale === 'ru' ? 'Цена' : 'Narx',
      value: claim(
        claims,
        facts,
        `${prefix}.price_display`,
      ) as string,
    },
    {
      label: locale === 'ru' ? 'Наличие' : 'Mavjudligi',
      value: claim(
        claims,
        facts,
        `${prefix}.availability_display`,
      ) as string,
    },
    ...(stringFact(facts, `${prefix}.category_name`)
      ? [{
          label: locale === 'ru' ? 'Категория' : 'Kategoriya',
          value: claim(
            claims,
            facts,
            `${prefix}.category_name`,
          ) as string,
        }]
      : []),
    {
      label: copy.store,
      value: claim(claims, facts, `${prefix}.store_name`) as string,
    },
    ...Array.from(
      { length: specificationCount },
      (_unused, specificationIndex) => ({
        label: claim(
          claims,
          facts,
          `${prefix}.specifications.${specificationIndex}.label`,
        ) as string,
        value: claim(
          claims,
          facts,
          `${prefix}.specifications.${specificationIndex}.value`,
        ) as string,
      }),
    ),
    {
      label: copy.requestMatch,
      value: claim(
        claims,
        facts,
        `${prefix}.relevance_display`,
      ) as string,
    },
    {
      label: copy.missingRequirements,
      value: claim(
        claims,
        facts,
        `${prefix}.missing_requirement_display`,
      ) as string,
    },
  ];
  claim(claims, facts, `${prefix}.price_minor`);
  claim(claims, facts, `${prefix}.availability`);
  if (fields.length > 8) throw new BuyerGroundingError();
  return {
    productRef,
    title: claim(claims, facts, `${prefix}.name`) as string,
    fields,
    actions: [
      ...(availability !== 'unavailable'
        ? [{
            id: `buyer-checkout.${productRef}`,
            label: copy.chooseProduct,
          }]
        : []),
      {
        id: `buyer-details.${productRef}`,
        label: copy.details,
      },
    ],
  };
}

function comparisonResponse(
  facts: FactSheet,
  locale: Locale,
  count: number,
  state: string,
): RuntimeResponseDraft {
  const copy = BUYER_COPY[locale];
  if (count === 0) {
    const text = state === 'comparison_cleared'
      ? copy.comparisonCleared
      : copy.comparisonEmpty;
    return {
      messages: [{
        text,
        choices: [
          { id: 'buyer-catalog-open', label: copy.catalog },
          { id: 'buyer-home', label: copy.homeButton },
        ],
      }],
      claims: [],
    };
  }
  const claims: RuntimeExactClaim[] = [];
  const status = state === 'comparison_duplicate'
    ? copy.comparisonDuplicate
    : state === 'comparison_full'
      ? copy.comparisonFull
      : count === 1
        ? copy.comparisonWaiting
        : copy.comparisonTitle;
  const summary: string[] = [status];
  if (count >= 2) {
    const prices = Array.from(
      { length: count },
      (_unused, index) =>
        numberFact(facts, `catalog.results.${index}.price_minor`),
    );
    const lowestPrice = Math.min(...prices);
    const cheapest = prices
      .map((price, index) => ({ price, index }))
      .filter(({ price }) => price === lowestPrice);
    if (cheapest.length === 1) {
      const name = claim(
        claims,
        facts,
        `catalog.results.${cheapest[0].index}.name`,
      ) as string;
      summary.push(copy.comparisonCheaper(name));
    } else {
      summary.push(copy.comparisonPriceTie);
    }
    const relevance = Array.from(
      { length: count },
      (_unused, index) =>
        numberFact(facts, `catalog.results.${index}.relevance_score`),
    );
    const highestRelevance = Math.max(...relevance);
    const closest = relevance
      .map((score, index) => ({ score, index }))
      .filter(({ score }) => score === highestRelevance);
    if (highestRelevance > 0 && closest.length === 1) {
      const name = claim(
        claims,
        facts,
        `catalog.results.${closest[0].index}.name`,
      ) as string;
      summary.push(copy.comparisonCloser(name));
    } else {
      summary.push(copy.comparisonRelevanceTie);
    }
  }
  const messages: Outbound[] = [{ text: summary.join('\n') }];
  for (let index = 0; index < count; index += 1) {
    const card = comparisonCard(facts, index, locale, claims);
    messages.push({
      text: '',
      card: {
        ref: card.productRef,
        title: card.title,
        fields: card.fields,
        actions: card.actions,
      },
    });
  }
  const last = messages[messages.length - 1];
  messages[messages.length - 1] = {
    ...last,
    choices: count === 1
      ? [
          { id: 'buyer-back', label: copy.backToCatalog },
          { id: 'buyer-compare-show', label: copy.showComparison },
          { id: 'buyer-compare-clear', label: copy.clearComparison },
          { id: 'buyer-home', label: copy.homeButton },
        ]
      : [
          { id: 'buyer-find', label: copy.changeParameters },
          { id: 'buyer-seller', label: copy.askSeller },
          { id: 'buyer-compare-clear', label: copy.clearComparison },
          { id: 'buyer-home', label: copy.homeButton },
        ],
  };
  return { messages, claims };
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
  if (state.startsWith('comparison_')) {
    if (count > 3) throw new BuyerGroundingError();
    return comparisonResponse(facts, locale, count, state);
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
      ...(card.mediaRef ? { mediaRef: card.mediaRef } : {}),
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
    messages.push({
      text: BUYER_COPY[locale].resultActions,
      choices: [
        { id: actionId, label: BUYER_COPY[locale].showMore },
        { id: 'buyer-back', label: BUYER_COPY[locale].backToCatalog },
        { id: 'buyer-home', label: BUYER_COPY[locale].homeButton },
      ],
    });
  } else {
    messages.push({
      text: BUYER_COPY[locale].resultActions,
      choices: [
        { id: 'buyer-seller', label: BUYER_COPY[locale].askSeller },
        { id: 'buyer-back', label: BUYER_COPY[locale].backToCatalog },
        { id: 'buyer-home', label: BUYER_COPY[locale].homeButton },
      ],
    });
  }
  return { messages, claims };
}

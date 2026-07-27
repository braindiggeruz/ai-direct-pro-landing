import type {
  DeterministicRule,
  Locale,
  RuntimeStepResult,
} from '../../../platform/contracts';
import { parseBuyerQuery } from './parser';
import { safeBuyerHelpResponse } from './responses';

function help(locale: Locale): RuntimeStepResult {
  return {
    kind: 'answer',
    response: safeBuyerHelpResponse(locale),
    facts: [],
  };
}

export const sotuvchiBuyerActionRule: DeterministicRule = {
  id: 'buyer-catalog-action',
  priority: 110,
  match(input) {
    return input.message.kind === 'action'
      && input.message.actionId.startsWith('buyer-');
  },
  async execute(context, input) {
    if (input.message.kind !== 'action') return help(context.org.locale);
    if (input.message.actionId === 'buyer-back') {
      return {
        kind: 'tool',
        toolName: 'catalog.list',
        input: { offset: 0 },
      };
    }
    const details =
      /^buyer-details\.([a-z0-9][a-z0-9._-]{0,47})$/
        .exec(input.message.actionId);
    if (details) {
      return {
        kind: 'tool',
        toolName: 'catalog.product.get',
        input: {
          intent: 'product.details',
          productRef: details[1],
        },
      };
    }
    const next = /^buyer-next\.(\d{1,2})$/.exec(input.message.actionId);
    if (next) {
      return {
        kind: 'tool',
        toolName: 'catalog.list',
        input: { offset: Number(next[1]) },
      };
    }
    const priceNext =
      /^buyer-price-next\.(\d{1,13})\.(\d{1,2})$/
        .exec(input.message.actionId);
    if (priceNext) {
      return {
        kind: 'tool',
        toolName: 'catalog.filter_price',
        input: {
          maxPriceMinor: Number(priceNext[1]),
          offset: Number(priceNext[2]),
        },
      };
    }
    return help(context.org.locale);
  },
};

export const sotuvchiBuyerTextRule: DeterministicRule = {
  id: 'buyer-catalog-query',
  priority: 200,
  match(input) {
    return input.message.kind === 'text';
  },
  async execute(context, input) {
    if (input.message.kind !== 'text') return help(context.org.locale);
    let parsed;
    try {
      parsed = parseBuyerQuery(input.message.text);
    } catch {
      return help(context.org.locale);
    }
    if (parsed.intent === 'unknown' || parsed.intent === 'catalog.help') {
      return help(context.org.locale);
    }
    if (parsed.intent === 'catalog.list') {
      return {
        kind: 'tool',
        toolName: 'catalog.list',
        input: { offset: 0 },
      };
    }
    if (
      parsed.intent === 'catalog.filter_price'
      && parsed.maxPriceMinor !== undefined
    ) {
      return {
        kind: 'tool',
        toolName: 'catalog.filter_price',
        input: { maxPriceMinor: parsed.maxPriceMinor, offset: 0 },
      };
    }
    if (
      parsed.usePreviousProduct
      && (
        parsed.intent === 'product.price'
        || parsed.intent === 'product.availability'
        || parsed.intent === 'product.details'
      )
    ) {
      return {
        kind: 'tool',
        toolName: 'catalog.product.get',
        input: { intent: parsed.intent, usePrevious: true },
      };
    }
    if (
      parsed.productQuery
      && (
        parsed.intent === 'catalog.search'
        || parsed.intent === 'product.price'
        || parsed.intent === 'product.availability'
        || parsed.intent === 'product.details'
      )
    ) {
      return {
        kind: 'tool',
        toolName: 'catalog.search',
        input: {
          intent: parsed.intent,
          productQuery: parsed.productQuery,
        },
      };
    }
    return help(context.org.locale);
  },
};

export const sotuvchiBuyerRules = [
  sotuvchiBuyerActionRule,
  sotuvchiBuyerTextRule,
] as const;

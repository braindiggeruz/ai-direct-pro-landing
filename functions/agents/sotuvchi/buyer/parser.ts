import {
  normalizeKnowledgeText,
  tokenizeKnowledgeText,
} from '../../../platform/knowledge';
import { CATALOG_LIMITS } from '../catalog';
import { BuyerQueryValidationError } from './errors';
import type { BuyerParsedQuery } from './intents';
import { parseBudget } from '../experience';

const MAX_RAW_QUERY = 240;
const LIST_PHRASES = new Set([
  'что у вас есть',
  'какие товары есть',
  'покажи товары',
  'покажи каталог',
  'каталог',
  'товары',
  'nima bor',
  'qanday mahsulotlar bor',
  'mahsulotlar',
  'katalog',
  'katalogni korsating',
]);
const HELP_PHRASES = new Set([
  'помощь',
  'что можно спросить',
  'help',
  'yordam',
  'nima sorash mumkin',
]);
const PREVIOUS_AVAILABILITY = new Set([
  'а он есть',
  'а она есть',
  'он в наличии',
  'она в наличии',
  'u bormi',
  'mavjudmi',
  'естьmi',
]);
const PREVIOUS_PRICE = new Set([
  'сколько он стоит',
  'сколько она стоит',
  'какая у него цена',
  'narxi qancha',
  'u qancha turadi',
  'narxi сколько',
  'qancha стоит',
]);
const PREVIOUS_DETAILS = new Set([
  'расскажи подробнее',
  'покажи подробнее',
  'подробнее',
  'u haqida ayting',
  'batafsil',
]);

function hasUnsafeControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13)
      || code === 127;
  });
}

function normalizeTypos(value: string): string {
  return value
    .replace(/(^|\s)сколко(?=\s|$)/gu, '$1сколько')
    .replace(/(^|\s)пакажи(?=\s|$)/gu, '$1покажи')
    .replace(/(^|\s)расскажы(?=\s|$)/gu, '$1расскажи')
    .replace(/(^|\s)канча(?=\s|$)/gu, '$1qancha')
    .replace(/(^|\s)корсатинг(?=\s|$)/gu, '$1korsating');
}

function boundedProductQuery(value: string): string {
  const normalized = normalizeKnowledgeText(value);
  const tokens = tokenizeKnowledgeText(normalized);
  if (
    !normalized
    || normalized.length > CATALOG_LIMITS.queryLength
    || tokens.length > CATALOG_LIMITS.queryTokens
  ) {
    throw new BuyerQueryValidationError();
  }
  return normalized;
}

function queryAfter(
  normalized: string,
  expressions: readonly RegExp[],
): string | null {
  for (const expression of expressions) {
    const match = expression.exec(normalized);
    if (match?.[1]) return boundedProductQuery(match[1]);
  }
  return null;
}

export function parseBuyerQuery(raw: unknown): BuyerParsedQuery {
  if (
    typeof raw !== 'string'
    || raw.length < 1
    || raw.length > MAX_RAW_QUERY
    || hasUnsafeControl(raw)
  ) {
    throw new BuyerQueryValidationError();
  }
  const normalized = normalizeTypos(normalizeKnowledgeText(raw));
  if (!normalized) throw new BuyerQueryValidationError();

  if (HELP_PHRASES.has(normalized)) return { intent: 'catalog.help' };
  if (LIST_PHRASES.has(normalized)) return { intent: 'catalog.list' };
  if (
    /(?:^|\s)(?:сравн\p{L}*|сопостав\p{L}*|solishtir\p{L}*)(?=\s|$)/iu
      .test(normalized)
  ) {
    return { intent: 'catalog.compare' };
  }

  const budget = parseBudget(normalized, raw);
  if (budget.status === 'explicit') {
    return {
      intent: 'catalog.filter_price',
      maxPriceMinor: budget.maxPriceMinor,
    };
  }
  if (budget.status === 'ambiguous') {
    return {
      intent: 'catalog.confirm_budget',
      maxPriceMinor: budget.amountMinor,
    };
  }

  if (PREVIOUS_AVAILABILITY.has(normalized)) {
    return {
      intent: 'product.availability',
      usePreviousProduct: true,
    };
  }
  if (PREVIOUS_PRICE.has(normalized)) {
    return { intent: 'product.price', usePreviousProduct: true };
  }
  if (PREVIOUS_DETAILS.has(normalized)) {
    return { intent: 'product.details', usePreviousProduct: true };
  }

  const contextualSearch = queryAfter(normalized, [
    /^(?:есть\s+(?:что\s+нибудь|что-нибудь)\s+для)\s+(.+)$/u,
    /^(.+?)\s+uchun\s+nima\s+bor$/u,
  ]);
  if (contextualSearch) {
    return { intent: 'catalog.search', productQuery: contextualSearch };
  }

  const priceQuery = queryAfter(normalized, [
    /^(?:сколько\s+стоит|какая\s+цена)\s+(.+)$/u,
    /^(.+?)\s+(?:сколько\s+стоит|какая\s+цена)$/u,
    /^(?:qancha\s+turadi|narxi\s+qancha)\s+(.+)$/u,
    /^(.+?)\s+(?:qancha\s+turadi|narxi\s+qancha)$/u,
    /^(?:narxi\s+сколько|qancha\s+стоит)\s+(.+)$/u,
    /^(.+?)\s+(?:narxi\s+сколько|qancha\s+стоит)$/u,
  ]);
  if (priceQuery) {
    return { intent: 'product.price', productQuery: priceQuery };
  }

  const availabilityQuery = queryAfter(normalized, [
    /^(?:есть\s+ли)\s+(.+)$/u,
    /^(.+?)\s+(?:в\s+наличии|bormi|mavjudmi|естьmi)$/u,
    /^(?:bormi|mavjudmi|естьmi)\s+(.+)$/u,
  ]);
  if (availabilityQuery) {
    return {
      intent: 'product.availability',
      productQuery: availabilityQuery,
    };
  }

  const detailsQuery = queryAfter(normalized, [
    /^(?:расскажи\s+про|расскажите\s+про|покажи)\s+(.+)$/u,
    /^(.+?)\s+(?:haqida\s+ayting|ni\s+korsating|korsating)$/u,
    /^(?:korsating)\s+(.+)$/u,
  ]);
  if (detailsQuery) {
    return { intent: 'product.details', productQuery: detailsQuery };
  }

  const explicitSearch = queryAfter(normalized, [
    /^(?:найди|поиск|искать)\s+(.+)$/u,
    /^(?:toping|qidirish)\s+(.+)$/u,
  ]);
  if (explicitSearch) {
    return { intent: 'catalog.search', productQuery: explicitSearch };
  }

  const tokens = tokenizeKnowledgeText(normalized);
  if (
    tokens.length > 0
    && tokens.length <= CATALOG_LIMITS.queryTokens
    && !/(?:^|\s)(?:как|почему|зачем|когда|кто|оформить|заказ|доставка|оплата)(?:\s|$)/u
      .test(normalized)
    && !/(?:^|\s)(?:nega|qachon|kim|buyurtma|yetkazib|tolov)(?:\s|$)/u
      .test(normalized)
  ) {
    return {
      intent: 'catalog.search',
      productQuery: boundedProductQuery(normalized),
    };
  }

  return { intent: 'unknown' };
}

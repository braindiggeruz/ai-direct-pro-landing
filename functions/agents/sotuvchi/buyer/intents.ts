export const BUYER_INTENTS = [
  'catalog.list',
  'catalog.categories',
  'catalog.category',
  'catalog.similar',
  'catalog.compare',
  'catalog.search',
  'product.price',
  'product.availability',
  'product.details',
  'catalog.filter_price',
  'catalog.confirm_budget',
  'catalog.help',
  'unknown',
] as const;

export type BuyerIntent = (typeof BUYER_INTENTS)[number];

export interface BuyerParsedQuery {
  intent: BuyerIntent;
  productQuery?: string;
  maxPriceMinor?: number;
  usePreviousProduct?: boolean;
}

export function isBuyerIntent(value: unknown): value is BuyerIntent {
  return typeof value === 'string'
    && (BUYER_INTENTS as readonly string[]).includes(value);
}

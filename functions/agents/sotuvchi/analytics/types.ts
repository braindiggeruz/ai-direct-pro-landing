import type { Locale } from '../../../platform/contracts';

/**
 * Closed list of Sotuvchi analytics events.
 *
 * Deliberately small. Everything the seller is shown as an exact number is
 * counted from the domain tables that already own it (products, orders,
 * notification intents, handoffs); duplicating those lifecycle transitions as
 * events would create a second, weaker analytical truth. These four events
 * cover only what no domain table can answer: how often a buyer opens the
 * storefront, how often the catalog answered or failed to answer, and when the
 * owner looked at the report.
 */
export const SOTUVCHI_EVENT_TYPES = [
  'sotuvchi.buyer_started',
  'sotuvchi.catalog_answered',
  'sotuvchi.catalog_no_result',
  'sotuvchi.stats_viewed',
] as const;

export type SotuvchiEventType = (typeof SOTUVCHI_EVENT_TYPES)[number];

export const SOTUVCHI_EVENT_SOURCES = ['deep_link', 'session'] as const;

export type SotuvchiEventSource = (typeof SOTUVCHI_EVENT_SOURCES)[number];

/** Bounded result-size bucket. The exact count stays in the domain tables. */
export const SOTUVCHI_RESULT_BUCKETS = ['one', 'few', 'many'] as const;

export type SotuvchiResultBucket = (typeof SOTUVCHI_RESULT_BUCKETS)[number];

export type SotuvchiEventOutcome = 'recorded' | 'duplicate' | 'skipped';

export interface BuyerStartedEvent {
  type: 'sotuvchi.buyer_started';
  locale: Locale;
  source: SotuvchiEventSource;
}

export interface CatalogAnsweredEvent {
  type: 'sotuvchi.catalog_answered';
  locale: Locale;
  intent: string;
  resultBucket: SotuvchiResultBucket;
  fullCard: boolean;
}

export interface CatalogNoResultEvent {
  type: 'sotuvchi.catalog_no_result';
  locale: Locale;
  intent: string;
}

export interface StatsViewedEvent {
  type: 'sotuvchi.stats_viewed';
  locale: Locale;
  windowDays: number;
}

export type SotuvchiAnalyticsEvent =
  | BuyerStartedEvent
  | CatalogAnsweredEvent
  | CatalogNoResultEvent
  | StatsViewedEvent;

export function isSotuvchiEventType(
  value: unknown,
): value is SotuvchiEventType {
  return typeof value === 'string'
    && (SOTUVCHI_EVENT_TYPES as readonly string[]).includes(value);
}

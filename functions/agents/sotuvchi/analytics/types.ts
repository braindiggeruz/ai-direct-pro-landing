import type { Locale } from '../../../platform/contracts';

/** Closed R1.1 product funnel. Exact operational totals still come from the
 * domain tables; these events add a best-effort behavioural timeline only. */
export const SOTUVCHI_EVENT_TYPES = [
  'sotuvchi.bot_started',
  'sotuvchi.language_selected',
  'sotuvchi.catalog_opened',
  'sotuvchi.category_opened',
  'sotuvchi.search_submitted',
  'sotuvchi.clarification_requested',
  'sotuvchi.budget_parsed',
  'sotuvchi.search_results_shown',
  'sotuvchi.zero_results',
  'sotuvchi.product_viewed',
  'sotuvchi.comparison_started',
  'sotuvchi.order_started',
  'sotuvchi.order_created',
  'sotuvchi.duplicate_order_blocked',
  'sotuvchi.handoff_requested',
  'sotuvchi.seller_notified',
  'sotuvchi.seller_responded',
  'sotuvchi.order_status_changed',
  'sotuvchi.telegram_error',
  'sotuvchi.stats_viewed',
] as const;

export type SotuvchiEventType = (typeof SOTUVCHI_EVENT_TYPES)[number];

export const SOTUVCHI_EVENT_SOURCES = ['deep_link', 'session'] as const;

export type SotuvchiEventSource = (typeof SOTUVCHI_EVENT_SOURCES)[number];

/** Bounded result-size bucket. The exact count stays in the domain tables. */
export const SOTUVCHI_RESULT_BUCKETS = ['one', 'few', 'many'] as const;

export type SotuvchiResultBucket = (typeof SOTUVCHI_RESULT_BUCKETS)[number];

export type SotuvchiEventOutcome = 'recorded' | 'duplicate' | 'skipped';

export const SOTUVCHI_PRICE_BUCKETS = [
  'under_50k',
  '50k_200k',
  '200k_1m',
  'over_1m',
  'unknown',
] as const;

export type SotuvchiPriceBucket = (typeof SOTUVCHI_PRICE_BUCKETS)[number];

export const SOTUVCHI_LATENCY_BUCKETS = [
  'under_250ms',
  '250ms_1s',
  '1s_3s',
  'over_3s',
  'unknown',
] as const;

export type SotuvchiLatencyBucket =
  (typeof SOTUVCHI_LATENCY_BUCKETS)[number];

/**
 * The recorder copies only this closed property set. Unknown runtime keys are
 * ignored, so even an untyped caller cannot smuggle message/contact content
 * into the durable event payload.
 */
export interface SotuvchiProductEvent {
  type: SotuvchiEventType;
  locale: Locale;
  source?: SotuvchiEventSource;
  productId?: string;
  categoryId?: string;
  resultCount?: number;
  priceBucket?: SotuvchiPriceBucket;
  reasonCode?: string;
  latencyBucket?: SotuvchiLatencyBucket;
  windowDays?: number;
}

export type SotuvchiAnalyticsEvent = SotuvchiProductEvent;

export function isSotuvchiEventType(
  value: unknown,
): value is SotuvchiEventType {
  return typeof value === 'string'
    && (SOTUVCHI_EVENT_TYPES as readonly string[]).includes(value);
}

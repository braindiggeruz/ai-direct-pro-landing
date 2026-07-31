import type { Locale, PiiSafePayload } from '../../../platform/contracts';
import {
  createPlatformEventsService,
  type PlatformEventsService,
} from '../../../platform/events';
import { requireCatalogId } from '../catalog';
import {
  isSotuvchiEventType,
  SOTUVCHI_EVENT_SOURCES,
  SOTUVCHI_LATENCY_BUCKETS,
  SOTUVCHI_PRICE_BUCKETS,
  type SotuvchiAnalyticsEvent,
  type SotuvchiEventOutcome,
  type SotuvchiEventType,
  type SotuvchiResultBucket,
} from './types';

const ID_BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const PRICE_BUCKETS = new Set<string>(SOTUVCHI_PRICE_BUCKETS);
const LATENCY_BUCKETS = new Set<string>(SOTUVCHI_LATENCY_BUCKETS);
/** Bounded server-selected reason token. Buyer words never reach an event. */
const REASON_CODE = /^[a-z][a-z0-9_.-]{0,47}$/;

export interface SotuvchiAnalyticsOptions {
  eventIdGenerator?: () => string;
  now?: () => string;
}

export interface RecordEventInput {
  orgId: string;
  /** Trusted channel-derived request id; the analytics idempotency key. */
  requestId: string;
  /** Server-side aggregate reference, e.g. a store id. */
  storeId?: string;
  event: SotuvchiAnalyticsEvent;
}

function randomEventId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let buffer = 0;
  let bits = 0;
  let encoded = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += ID_BASE32[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return `ev-${encoded}`;
}

export function resultBucket(count: number): SotuvchiResultBucket {
  if (count <= 1) return 'one';
  return count <= 3 ? 'few' : 'many';
}

function safeLocale(locale: Locale): Locale {
  return locale === 'uz' ? 'uz' : 'ru';
}

function optionalId(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return requireCatalogId(value);
  } catch {
    return null;
  }
}

/**
 * Builds one closed, flat payload. Only explicitly copied scalar properties
 * can survive this projection. Unknown keys, including raw buyer input and
 * Telegram profile/contact fields, are ignored.
 */
function payloadOf(event: SotuvchiAnalyticsEvent): PiiSafePayload | null {
  const payload: PiiSafePayload = { locale: safeLocale(event.locale) };
  if (event.source !== undefined) {
    if (!SOTUVCHI_EVENT_SOURCES.includes(event.source)) return null;
    payload.source = event.source;
  }
  if (event.productId !== undefined) {
    const productId = optionalId(event.productId);
    if (!productId) return null;
    payload.product_id = productId;
  }
  if (event.categoryId !== undefined) {
    const categoryId = optionalId(event.categoryId);
    if (!categoryId) return null;
    payload.category_id = categoryId;
  }
  if (event.resultCount !== undefined) {
    if (
      !Number.isInteger(event.resultCount)
      || event.resultCount < 0
      || event.resultCount > 200
    ) {
      return null;
    }
    payload.result_count = event.resultCount;
    payload.result_bucket = resultBucket(event.resultCount);
  }
  if (event.priceBucket !== undefined) {
    if (!PRICE_BUCKETS.has(event.priceBucket)) return null;
    payload.price_bucket = event.priceBucket;
  }
  if (event.reasonCode !== undefined) {
    if (!REASON_CODE.test(event.reasonCode)) return null;
    payload.reason_code = event.reasonCode;
  }
  if (event.latencyBucket !== undefined) {
    if (!LATENCY_BUCKETS.has(event.latencyBucket)) return null;
    payload.latency_bucket = event.latencyBucket;
  }
  if (event.windowDays !== undefined) {
    if (!Number.isInteger(event.windowDays) || event.windowDays < 1) {
      return null;
    }
    payload.window_days = Math.min(event.windowDays, 365);
  }
  return payload;
}

/**
 * Best-effort content-free analytics.
 *
 * The domain write always happens first and is never retried by this recorder;
 * an append failure is swallowed, so analytics can only undercount and can
 * never repeat a domain side effect. The idempotency key is the trusted
 * channel request id, so a duplicate Telegram update appends nothing twice.
 */
export class SotuvchiAnalytics {
  private readonly eventId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly events: PlatformEventsService,
    options: SotuvchiAnalyticsOptions = {},
  ) {
    this.eventId = options.eventIdGenerator ?? randomEventId;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async record(input: RecordEventInput): Promise<SotuvchiEventOutcome> {
    let orgId: string;
    let requestId: string;
    try {
      orgId = requireCatalogId(input.orgId);
      requestId = requireCatalogId(input.requestId);
    } catch {
      return 'skipped';
    }
    if (!isSotuvchiEventType(input.event.type)) return 'skipped';
    const payload = payloadOf(input.event);
    if (!payload) return 'skipped';
    let aggregate = `org:${orgId}`;
    if (input.storeId !== undefined) {
      try {
        aggregate = `store:${requireCatalogId(input.storeId)}`;
      } catch {
        return 'skipped';
      }
    }
    try {
      const result = await this.events.publish({
        event: {
          id: this.eventId(),
          type: input.event.type,
          occurredAt: this.now(),
          orgId,
          agentId: 'sotuvchi',
          aggregate,
          payload,
        },
        idempotencyKey: analyticsIdempotencyKey(
          input.event.type,
          orgId,
          requestId,
        ),
      });
      return result.status === 'duplicate' ? 'duplicate' : 'recorded';
    } catch {
      return 'skipped';
    }
  }
}

export function analyticsIdempotencyKey(
  type: SotuvchiEventType,
  orgId: string,
  requestId: string,
): string {
  return `sotuvchi:${type}:${orgId}:${requestId}`;
}

export function createSotuvchiAnalytics(
  db: D1Database,
  options: SotuvchiAnalyticsOptions = {},
): SotuvchiAnalytics {
  return new SotuvchiAnalytics(createPlatformEventsService(db), options);
}

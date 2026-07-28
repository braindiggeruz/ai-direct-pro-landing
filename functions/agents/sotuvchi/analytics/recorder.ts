import type { Locale, PiiSafePayload } from '../../../platform/contracts';
import {
  createPlatformEventsService,
  type PlatformEventsService,
} from '../../../platform/events';
import { requireCatalogId } from '../catalog';
import {
  isSotuvchiEventType,
  SOTUVCHI_RESULT_BUCKETS,
  type SotuvchiAnalyticsEvent,
  type SotuvchiEventOutcome,
  type SotuvchiEventType,
  type SotuvchiResultBucket,
} from './types';

const ID_BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const BUCKETS = new Set<string>(SOTUVCHI_RESULT_BUCKETS);
/** Bounded intent label. The buyer's own words never reach an event. */
const INTENT = /^[a-z][a-z0-9_.]{0,39}$/;

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

/**
 * Builds the payload of one event. Every value is either a closed-list token,
 * a boolean or a bounded server-generated counter; nothing here can carry a
 * buyer question, a seller reply, a product name, contact data, a chat
 * reference or a storefront code.
 */
function payloadOf(event: SotuvchiAnalyticsEvent): PiiSafePayload | null {
  switch (event.type) {
    case 'sotuvchi.buyer_started':
      return {
        locale: safeLocale(event.locale),
        source: event.source === 'session' ? 'session' : 'deep_link',
      };
    case 'sotuvchi.catalog_answered': {
      if (!INTENT.test(event.intent) || !BUCKETS.has(event.resultBucket)) {
        return null;
      }
      return {
        locale: safeLocale(event.locale),
        intent: event.intent,
        result_bucket: event.resultBucket,
        full_card: event.fullCard === true,
      };
    }
    case 'sotuvchi.catalog_no_result': {
      if (!INTENT.test(event.intent)) return null;
      return { locale: safeLocale(event.locale), intent: event.intent };
    }
    case 'sotuvchi.stats_viewed': {
      if (!Number.isInteger(event.windowDays) || event.windowDays < 1) {
        return null;
      }
      return {
        locale: safeLocale(event.locale),
        window_days: Math.min(event.windowDays, 365),
      };
    }
    default:
      return null;
  }
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

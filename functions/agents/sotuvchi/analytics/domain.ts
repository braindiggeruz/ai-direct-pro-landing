import type { AgentDomainServicePort } from '../../../platform/contracts';
import type { SotuvchiAnalytics } from './recorder';
import type {
  SotuvchiPriceBucket,
  SotuvchiProductEvent,
} from './types';

import { swallow } from '../../../lib/observability';

function readNumber(values: unknown, key: string): number | null {
  if (!values || typeof values !== 'object') return null;
  const value = (values as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(values: unknown, key: string): string | null {
  if (!values || typeof values !== 'object') return null;
  const value = (values as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function priceBucket(value: number | null): SotuvchiPriceBucket | undefined {
  if (value === null || !Number.isInteger(value) || value < 0) return undefined;
  if (value < 50_000) return 'under_50k';
  if (value < 200_000) return '50k_200k';
  if (value < 1_000_000) return '200k_1m';
  return 'over_1m';
}

function resultEvent(
  result: unknown,
  locale: SotuvchiProductEvent['locale'],
): SotuvchiProductEvent | null {
  const count = readNumber(result, 'catalog.result.count');
  if (count === null) return null;
  return {
    type: count === 0
      ? 'sotuvchi.zero_results'
      : 'sotuvchi.search_results_shown',
    locale,
    resultCount: Math.max(0, Math.min(200, Math.trunc(count))),
    ...(readString(result, 'catalog.query.category_id')
      ? { categoryId: readString(result, 'catalog.query.category_id')! }
      : {}),
    ...(readString(result, 'catalog.results.0.id')
      ? { productId: readString(result, 'catalog.results.0.id')! }
      : {}),
  };
}

function eventsFor(
  operation: string,
  result: unknown,
  locale: SotuvchiProductEvent['locale'],
): SotuvchiProductEvent[] {
  const events: SotuvchiProductEvent[] = [];
  const appendResult = (): void => {
    const event = resultEvent(result, locale);
    if (event) events.push(event);
  };
  switch (operation) {
    case 'catalog.categories':
    case 'catalog.list':
      events.push({ type: 'sotuvchi.catalog_opened', locale });
      appendResult();
      break;
    case 'catalog.category.products':
      events.push({
        type: 'sotuvchi.category_opened',
        locale,
        ...(readString(result, 'catalog.query.category_id')
          ? { categoryId: readString(result, 'catalog.query.category_id')! }
          : {}),
      });
      appendResult();
      break;
    case 'catalog.search':
      events.push({ type: 'sotuvchi.search_submitted', locale });
      appendResult();
      break;
    case 'catalog.filter_price':
    case 'catalog.budget.resolve':
      events.push({
        type: 'sotuvchi.budget_parsed',
        locale,
        priceBucket: priceBucket(
          readNumber(result, 'catalog.query.max_price_minor'),
        ) ?? 'unknown',
      });
      appendResult();
      break;
    case 'catalog.budget.request':
      events.push({
        type: 'sotuvchi.clarification_requested',
        locale,
        reasonCode: 'budget_required',
      });
      break;
    case 'catalog.product.get':
      events.push({
        type: 'sotuvchi.product_viewed',
        locale,
        ...(readString(result, 'catalog.product.id')
          ? { productId: readString(result, 'catalog.product.id')! }
          : {}),
      });
      break;
    case 'catalog.similar':
      appendResult();
      break;
    case 'catalog.compare.add':
    case 'catalog.compare.show':
      events.push({
        type: 'sotuvchi.comparison_started',
        locale,
        resultCount: Math.max(
          0,
          Math.min(3, readNumber(result, 'catalog.result.count') ?? 0),
        ),
      });
      break;
    case 'checkout.start':
      events.push({
        type: readString(result, 'checkout.outcome') === 'other_draft'
          ? 'sotuvchi.duplicate_order_blocked'
          : 'sotuvchi.order_started',
        locale,
        ...(readString(result, 'checkout.product.ref')
          ? { productId: readString(result, 'checkout.product.ref')! }
          : {}),
      });
      break;
    case 'handoff.request':
      if (readString(result, 'handoff.view') === 'buyer_created') {
        events.push({ type: 'sotuvchi.handoff_requested', locale });
      }
      break;
    case 'seller.order.confirm':
    case 'seller.order.cancel':
    case 'seller.order.done':
      events.push({
        type: 'sotuvchi.order_status_changed',
        locale,
        reasonCode: operation.slice('seller.order.'.length),
      });
      break;
    default:
      break;
  }
  return events;
}

/**
 * Analytics decorator for the agent domain port.
 *
 * It observes the already-produced scalar Facts of a buyer read and never
 * touches the call itself, so it cannot change, retry or repeat a domain
 * operation. Recording happens after the domain call succeeded and can only
 * fail silently, which makes the funnel counters best-effort by construction.
 */
export function withSotuvchiAnalytics(
  base: AgentDomainServicePort,
  analytics: SotuvchiAnalytics,
): AgentDomainServicePort {
  return {
    async execute(call) {
      const result = await base.execute(call);
      const events = eventsFor(call.operation, result, call.org.locale);
      await Promise.all(events.map((event) => analytics.record({
        orgId: call.org.orgId,
        requestId: call.org.requestId,
        event,
      }))).catch(swallow('agents-sotuvchi-analytics-domain'));
      return result;
    },
  };
}

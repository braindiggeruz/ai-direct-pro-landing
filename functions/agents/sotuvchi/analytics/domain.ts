import type { AgentDomainServicePort } from '../../../platform/contracts';
import { isBuyerIntent } from '../buyer';
import { resultBucket, type SotuvchiAnalytics } from './recorder';

/** Buyer read operations whose outcome the funnel is allowed to observe. */
const BUYER_READ_OPERATIONS = new Set([
  'catalog.list',
  'catalog.search',
  'catalog.product.get',
  'catalog.filter_price',
]);

function readNumber(values: unknown, key: string): number | null {
  if (!values || typeof values !== 'object') return null;
  const value = (values as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(values: unknown, key: string): boolean {
  if (!values || typeof values !== 'object') return false;
  return (values as Record<string, unknown>)[key] === true;
}

function readIntent(values: unknown): string | null {
  if (!values || typeof values !== 'object') return null;
  const value = (values as Record<string, unknown>)['catalog.query.intent'];
  return isBuyerIntent(value) ? value : null;
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
      if (!BUYER_READ_OPERATIONS.has(call.operation)) return result;
      const intent = readIntent(result);
      const count = readNumber(result, 'catalog.result.count');
      if (intent === null || count === null) return result;
      await analytics.record({
        orgId: call.org.orgId,
        requestId: call.org.requestId,
        event: count > 0
          ? {
              type: 'sotuvchi.catalog_answered',
              locale: call.org.locale,
              intent,
              resultBucket: resultBucket(count),
              fullCard: readBoolean(result, 'catalog.result.full_card'),
            }
          : {
              type: 'sotuvchi.catalog_no_result',
              locale: call.org.locale,
              intent,
            },
      });
      return result;
    },
  };
}

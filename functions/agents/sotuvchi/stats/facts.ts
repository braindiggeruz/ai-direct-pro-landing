import type { FactValue } from '../../../platform/contracts';
import type { SotuvchiStatsReport } from './types';

export type StatsFactValues = Readonly<Record<string, FactValue>>;

/**
 * Scalar-only projection. Exact counts and best-effort funnel counters live in
 * separate namespaces so the composer cannot present one as the other, and no
 * identifier, contact detail or content ever reaches the renderer.
 */
export function projectStatsFacts(
  report: SotuvchiStatsReport,
): StatsFactValues {
  return {
    'seller.view': 'seller_stats',
    'seller.stats.window_days': report.windowDays,
    'seller.stats.products_published': report.exact.productsPublished,
    'seller.stats.checkouts_started': report.exact.checkoutsStarted,
    'seller.stats.orders_placed': report.exact.ordersPlaced,
    'seller.stats.orders_confirmed': report.exact.ordersConfirmed,
    'seller.stats.orders_cancelled': report.exact.ordersCancelled,
    'seller.stats.orders_done': report.exact.ordersDone,
    'seller.stats.handoffs_open': report.exact.handoffsOpen,
    'seller.stats.handoffs_answered': report.exact.handoffsAnswered,
    'seller.funnel.buyer_starts': report.funnel.buyerStarts,
    'seller.funnel.catalog_answers': report.funnel.catalogAnswers,
    'seller.funnel.catalog_no_results': report.funnel.catalogNoResults,
  };
}

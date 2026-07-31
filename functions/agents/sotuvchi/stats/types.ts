export const STATS_WINDOW_DAYS = 1;

/**
 * Counts read directly from the tables that own them. Every number here is
 * exact: the seller can act on it.
 */
export interface SotuvchiExactStats {
  /** Published products in the store right now. */
  productsPublished: number;
  /** Checkout drafts created inside the window (a started checkout). */
  checkoutsStarted: number;
  /** Orders placed inside the window. */
  ordersPlaced: number;
  /** Seller transitions inside the window, one row per transition. */
  ordersConfirmed: number;
  ordersCancelled: number;
  ordersDone: number;
  /** Buyer questions waiting for the seller right now. */
  handoffsOpen: number;
  /** Buyer questions answered inside the window. */
  handoffsAnswered: number;
}

/**
 * Funnel counters no domain table can answer. They come from the best-effort
 * analytics outbox, so they may undercount and are always presented apart from
 * the exact numbers.
 */
export interface SotuvchiFunnelStats {
  buyerStarts: number;
  searches: number;
  resultsShown: number;
  zeroResults: number;
  productViews: number;
  comparisons: number;
}

export interface SotuvchiStatsReport {
  windowDays: number;
  /** ISO-8601 lower bound of the window, server generated. */
  since: string;
  generatedAt: string;
  exact: SotuvchiExactStats;
  funnel: SotuvchiFunnelStats;
}

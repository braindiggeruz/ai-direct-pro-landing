import { requireCatalogId } from '../catalog';
import type { SotuvchiExactStats } from './types';

/**
 * Read-only reporting store.
 *
 * Every statement is parameterized, carries both `org_id` and `store_id`, and
 * selects only COUNT(*). No buyer name, phone, address, question, reply or
 * product text is ever read here, and no statement is assembled from user
 * input. Time-bounded statements use an ISO-8601 lower bound produced by the
 * service, never by the caller.
 */
export interface SotuvchiStatsStore {
  readExactStats(
    orgId: string,
    storeId: string,
    since: string,
  ): Promise<SotuvchiExactStats>;
}

async function count(
  db: D1Database,
  sql: string,
  bindings: readonly (string | number)[],
): Promise<number> {
  const row = await db
    .prepare(sql)
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Number(row?.total ?? 0);
  return Number.isFinite(total) && total >= 0 ? total : 0;
}

export function createSotuvchiStatsStore(db: D1Database): SotuvchiStatsStore {
  return {
    async readExactStats(rawOrgId, rawStoreId, since) {
      const orgId = requireCatalogId(rawOrgId);
      const storeId = requireCatalogId(rawStoreId);
      const scope = [orgId, storeId] as const;
      const window = [orgId, storeId, since] as const;

      const [
        productsPublished,
        checkoutsStarted,
        ordersPlaced,
        ordersConfirmed,
        ordersCancelled,
        ordersDone,
        handoffsOpen,
        handoffsAnswered,
      ] = await Promise.all([
        count(
          db,
          `SELECT COUNT(*) AS total FROM sotuvchi_products
           WHERE org_id = ? AND store_id = ? AND status = 'published'`,
          scope,
        ),
        count(
          db,
          `SELECT COUNT(*) AS total FROM sotuvchi_orders
           WHERE org_id = ? AND store_id = ? AND created_at >= ?`,
          window,
        ),
        count(
          db,
          `SELECT COUNT(*) AS total FROM sotuvchi_orders
           WHERE org_id = ? AND store_id = ?
             AND placed_at IS NOT NULL AND placed_at >= ?`,
          window,
        ),
        // One notification intent per seller transition, written inside the
        // same D1 batch as the transition itself: an exact, timestamped and
        // replay-proof transition ledger, independent of delivery status.
        count(
          db,
          `SELECT COUNT(*) AS total FROM sotuvchi_notifications
           WHERE org_id = ? AND store_id = ?
             AND type = 'order_confirmed' AND created_at >= ?`,
          window,
        ),
        count(
          db,
          `SELECT COUNT(*) AS total FROM sotuvchi_notifications
           WHERE org_id = ? AND store_id = ?
             AND type = 'order_cancelled' AND created_at >= ?`,
          window,
        ),
        count(
          db,
          `SELECT COUNT(*) AS total FROM sotuvchi_notifications
           WHERE org_id = ? AND store_id = ?
             AND type = 'order_done' AND created_at >= ?`,
          window,
        ),
        count(
          db,
          `SELECT COUNT(*) AS total FROM sotuvchi_handoffs
           WHERE org_id = ? AND store_id = ? AND status = 'open'`,
          scope,
        ),
        count(
          db,
          `SELECT COUNT(*) AS total FROM sotuvchi_handoffs
           WHERE org_id = ? AND store_id = ?
             AND answered_at IS NOT NULL AND answered_at >= ?`,
          window,
        ),
      ]);

      return {
        productsPublished,
        checkoutsStarted,
        ordersPlaced,
        ordersConfirmed,
        ordersCancelled,
        ordersDone,
        handoffsOpen,
        handoffsAnswered,
      };
    },
  };
}

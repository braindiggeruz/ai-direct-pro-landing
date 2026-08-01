import {
  isRuntimeSchemaVerified,
  markRuntimeSchemaVerified,
} from '../../platform/storage/runtime-schema';

const EXPECTED_TABLE_COUNT = 32;
const EXPECTED_SESSION_COLUMN_COUNT = 8;
const EXPECTED_PRODUCT_COLUMN_COUNT = 2;
const EXPECTED_ORDER_COLUMN_COUNT = 2;
const EXPECTED_UNIQUE_INDEX_COUNT = 5;

const CONTRACT_SQL = `SELECT
  (
    SELECT COUNT(*)
    FROM sqlite_schema
    WHERE type = 'table' AND name IN (
      'telegram_agent_updates',
      'telegram_agent_update_metrics',
      'telegram_agent_rate_limits',
      'telegram_agent_rate_limit_notices',
      'identities',
      'organizations',
      'memberships',
      'contacts',
      'workflow_instances',
      'workflow_transitions',
      'knowledge_collections',
      'knowledge_items',
      'events',
      'channel_addresses',
      'sotuvchi_onboardings',
      'sotuvchi_stores',
      'telegram_agent_routes',
      'sotuvchi_categories',
      'sotuvchi_products',
      'sotuvchi_catalog_operations',
      'sotuvchi_storefront_sessions',
      'sotuvchi_buyer_presentations',
      'sotuvchi_buyer_comparisons',
      'sotuvchi_orders',
      'sotuvchi_order_items',
      'sotuvchi_order_operations',
      'sotuvchi_notifications',
      'sotuvchi_inventory',
      'sotuvchi_inventory_moves',
      'sotuvchi_handoffs',
      'sotuvchi_handoff_operations',
      'sotuvchi_seller_reply_sessions'
    )
  ) AS table_count,
  (
    SELECT COUNT(*)
    FROM pragma_table_info('sotuvchi_storefront_sessions')
    WHERE name IN (
      'last_product_id',
      'last_intent',
      'selection_request_key',
      'selected_at',
      'preferred_locale',
      'pending_intent',
      'pending_request_key',
      'pending_at'
    )
  ) AS session_column_count,
  (
    SELECT COUNT(*)
    FROM pragma_table_info('sotuvchi_products')
    WHERE name IN ('search_terms_json', 'specifications_json')
  ) AS product_column_count,
  (
    SELECT COUNT(*)
    FROM pragma_table_info('sotuvchi_orders')
    WHERE name IN ('fulfillment_status', 'buyer_comment')
  ) AS order_column_count,
  (
    SELECT COUNT(*)
    FROM sqlite_schema
    WHERE type = 'index' AND name IN (
      'idx_sotuvchi_stores_org_id',
      'idx_sotuvchi_orders_active_draft',
      'idx_sotuvchi_order_items_single',
      'idx_sotuvchi_inventory_moves_order_type',
      'idx_sotuvchi_handoffs_active'
    )
  ) AS unique_index_count`;

interface RuntimeSchemaContractRow {
  table_count: number;
  session_column_count: number;
  product_column_count: number;
  order_column_count: number;
  unique_index_count: number;
}

const pendingVerifications = new WeakMap<D1Database, Promise<void>>();

/**
 * Replaces dozens of sequential CREATE/ALTER probes on the production hot
 * path with one fail-closed, read-only contract query per Worker isolate.
 *
 * The contract covers every table, runtime-added column and correctness
 * critical unique index owned by the bootstraps this verification allows a
 * request to skip. Unique indexes are part of the contract because they carry
 * business invariants — one active draft order, one inventory move per order
 * and movement type, one active handoff — not because they are faster.
 */
export function verifyTelegramAgentsRuntimeSchema(
  db: D1Database,
): Promise<void> {
  if (isRuntimeSchemaVerified(db)) return Promise.resolve();
  let pending = pendingVerifications.get(db);
  if (!pending) {
    pending = (async () => {
      const row = await db.prepare(CONTRACT_SQL)
        .first<RuntimeSchemaContractRow>();
      if (
        !row
        || row.table_count !== EXPECTED_TABLE_COUNT
        || row.session_column_count !== EXPECTED_SESSION_COLUMN_COUNT
        || row.product_column_count !== EXPECTED_PRODUCT_COLUMN_COUNT
        || row.order_column_count !== EXPECTED_ORDER_COLUMN_COUNT
        || row.unique_index_count !== EXPECTED_UNIQUE_INDEX_COUNT
      ) {
        throw new Error('telegram agents runtime schema is unavailable');
      }
      markRuntimeSchemaVerified(db);
    })().catch((error) => {
      pendingVerifications.delete(db);
      throw error;
    });
    pendingVerifications.set(db, pending);
  }
  return pending;
}

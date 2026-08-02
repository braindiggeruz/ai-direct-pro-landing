import { CheckoutPersistenceError } from './errors';
import type {
  BuyerOrderStatus,
  BuyerOrderSummary,
  CheckoutBuyerSession,
  CheckoutOrderStatus,
  SotuvchiOrder,
} from './types';
import {
  requireCheckoutAvailability,
  requireCheckoutBotUsername,
  requireCheckoutId,
  requireCheckoutTotal,
  requireCheckoutVersion,
  requireOrderNumber,
  requireOrderStatus,
} from './validation';
import { normalizeStoreName } from '../onboarding/validation';

const ORDER_SELECT = `
  SELECT ordered.id AS id,
         ordered.org_id AS org_id,
         ordered.store_id AS store_id,
         ordered.buyer_session_id AS buyer_session_id,
         ordered.workflow_instance_id AS workflow_instance_id,
         ordered.order_number AS order_number,
         ordered.status AS status,
         store.name AS store_name,
         ordered.buyer_name AS buyer_name,
         ordered.buyer_phone AS buyer_phone,
         ordered.buyer_address AS buyer_address,
         ordered.buyer_comment AS buyer_comment,
         ordered.total_minor AS total_minor,
         ordered.currency AS currency,
         ordered.version AS version,
         ordered.created_at AS created_at,
         ordered.updated_at AS updated_at,
         ordered.placed_at AS placed_at,
         item.product_id AS product_id,
         item.product_name_snapshot AS product_name_snapshot,
         item.unit_price_minor AS unit_price_minor,
         item.availability_snapshot AS availability_snapshot,
         item.quantity AS quantity,
         item.line_total_minor AS line_total_minor
  FROM sotuvchi_orders AS ordered
  JOIN sotuvchi_order_items AS item
    ON item.org_id = ordered.org_id AND item.order_id = ordered.id
  JOIN sotuvchi_stores AS store
    ON store.org_id = ordered.org_id AND store.id = ordered.store_id`;

interface OrderRow {
  id: string;
  org_id: string;
  store_id: string;
  buyer_session_id: string;
  workflow_instance_id: string;
  order_number: string;
  status: string;
  store_name: string;
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_address: string | null;
  buyer_comment: string | null;
  total_minor: number | null;
  currency: string;
  version: number;
  created_at: string;
  updated_at: string;
  placed_at: string | null;
  product_id: string;
  product_name_snapshot: string;
  unit_price_minor: number;
  availability_snapshot: string;
  quantity: number | null;
  line_total_minor: number | null;
}

export interface CheckoutOperationRecord {
  orgId: string;
  storeId: string;
  idempotencyKey: string;
  operation: string;
  fingerprint: string;
  targetId: string;
  resultVersion: number | null;
  createdAt: string;
}

export interface CheckoutOperationInput {
  idempotencyKey: string;
  operation: string;
  fingerprint: string;
  createdAt: string;
}

export interface CreateOrderInput {
  orderId: string;
  itemId: string;
  orgId: string;
  storeId: string;
  buyerSessionId: string;
  workflowInstanceId: string;
  orderNumber: string;
  productId: string;
  expectedPriceMinor: number;
  createdAt: string;
}

export type CheckoutContactField = 'name' | 'phone' | 'address';

/**
 * Seller notification intent written inside the placement batch. The outbox
 * row carries no payload, so buyer contact data never leaves sotuvchi_orders.
 */
export interface CheckoutNotificationInput {
  id: string;
  idempotencyKey: string;
}

export interface CheckoutStore {
  findActiveBuyerSession(
    botUsername: string,
    identityId: string,
  ): Promise<CheckoutBuyerSession | null>;
  getOperation(
    orgId: string,
    storeId: string,
    idempotencyKey: string,
  ): Promise<CheckoutOperationRecord | null>;
  getOrder(orgId: string, orderId: string): Promise<SotuvchiOrder | null>;
  findOrderBySession(
    orgId: string,
    storeId: string,
    buyerSessionId: string,
    status: CheckoutOrderStatus,
  ): Promise<SotuvchiOrder | null>;
  listBuyerOrders(
    orgId: string,
    storeId: string,
    buyerSessionId: string,
    limit: number,
  ): Promise<BuyerOrderSummary[]>;
  getInventoryOnHand(
    orgId: string,
    storeId: string,
    productId: string,
  ): Promise<number | null>;
  createOrder(
    input: CreateOrderInput,
    operation: CheckoutOperationInput,
  ): Promise<readonly number[]>;
  setQuantity(
    order: SotuvchiOrder,
    quantity: number,
    expectedVersion: number,
    operation: CheckoutOperationInput,
  ): Promise<readonly number[]>;
  setContactField(
    order: SotuvchiOrder,
    field: CheckoutContactField,
    value: string,
    expectedVersion: number,
    operation: CheckoutOperationInput,
  ): Promise<readonly number[]>;
  setComment(
    order: SotuvchiOrder,
    value: string | null,
    expectedVersion: number,
    operation: CheckoutOperationInput,
  ): Promise<readonly number[]>;
  refreshPrice(
    order: SotuvchiOrder,
    priceMinor: number,
    expectedVersion: number,
    operation: CheckoutOperationInput,
  ): Promise<readonly number[]>;
  placeOrder(
    order: SotuvchiOrder,
    expectedVersion: number,
    placedAt: string,
    operation: CheckoutOperationInput,
    notification: CheckoutNotificationInput,
  ): Promise<readonly number[]>;
  cancelOrder(
    order: SotuvchiOrder,
    operation: CheckoutOperationInput,
  ): Promise<readonly number[]>;
}

const CONTACT_COLUMNS: Readonly<Record<CheckoutContactField, string>> = {
  name: 'buyer_name',
  phone: 'buyer_phone',
  address: 'buyer_address',
};

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxLength
  ) {
    throw new CheckoutPersistenceError('corrupt_row');
  }
  return value;
}

function fromOrderRow(row: OrderRow): SotuvchiOrder {
  try {
    if (
      !validDate(row.created_at)
      || !validDate(row.updated_at)
      || (row.placed_at !== null && !validDate(row.placed_at))
      || row.currency !== 'UZS'
    ) {
      throw new CheckoutPersistenceError('corrupt_row');
    }
    const status = requireOrderStatus(row.status);
    if (
      status === 'placed'
      && (
        row.buyer_name === null
        || row.buyer_phone === null
        || row.buyer_address === null
        || row.total_minor === null
        || row.quantity === null
        || row.placed_at === null
      )
    ) {
      throw new CheckoutPersistenceError('corrupt_row');
    }
    return {
      id: requireCheckoutId(row.id),
      orderNumber: requireOrderNumber(row.order_number),
      orgId: requireCheckoutId(row.org_id),
      storeId: requireCheckoutId(row.store_id),
      buyerSessionId: requireCheckoutId(row.buyer_session_id),
      workflowInstanceId: requireCheckoutId(row.workflow_instance_id),
      status,
      productId: requireCheckoutId(row.product_id),
      productNameSnapshot: optionalText(row.product_name_snapshot, 120)
        ?? (() => {
          throw new CheckoutPersistenceError('corrupt_row');
        })(),
      unitPriceMinor: requireCheckoutTotal(row.unit_price_minor),
      currency: 'UZS',
      availabilitySnapshot: requireCheckoutAvailability(
        row.availability_snapshot,
      ),
      quantity: row.quantity === null ? null : Number(row.quantity),
      totalMinor: row.total_minor === null
        ? null
        : requireCheckoutTotal(row.total_minor),
      buyerName: optionalText(row.buyer_name, 80),
      buyerPhone: optionalText(row.buyer_phone, 16),
      buyerAddress: optionalText(row.buyer_address, 240),
      buyerComment: optionalText(row.buyer_comment, 240),
      storeName: normalizeStoreName(row.store_name),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      placedAt: row.placed_at,
      version: requireCheckoutVersion(row.version),
    };
  } catch (error) {
    if (error instanceof CheckoutPersistenceError) throw error;
    throw new CheckoutPersistenceError('corrupt_row');
  }
}

function changesOf(results: readonly D1Result<unknown>[]): readonly number[] {
  return results.map((result) => Number(result?.meta?.changes ?? 0));
}

export function createSotuvchiCheckoutStore(db: D1Database): CheckoutStore {
  function operationStatement(
    order: { orgId: string; storeId: string; id: string },
    operation: CheckoutOperationInput,
  ): D1PreparedStatement {
    return db.prepare(`INSERT INTO sotuvchi_order_operations
      (org_id, store_id, idempotency_key, operation, fingerprint,
       target_id, result_version, created_at)
      SELECT org_id, store_id, ?, ?, ?, id, version, ?
      FROM sotuvchi_orders
      WHERE org_id = ? AND store_id = ? AND id = ?
        AND last_operation_key = ?`)
      .bind(
        operation.idempotencyKey,
        operation.operation,
        operation.fingerprint,
        operation.createdAt,
        order.orgId,
        order.storeId,
        order.id,
        operation.idempotencyKey,
      );
  }

  async function readOrder(
    orgId: string,
    orderId: string,
  ): Promise<SotuvchiOrder | null> {
    const row = await db
      .prepare(`${ORDER_SELECT}
                WHERE ordered.org_id = ? AND ordered.id = ?`)
      .bind(requireCheckoutId(orgId), requireCheckoutId(orderId))
      .first<OrderRow>();
    return row ? fromOrderRow(row) : null;
  }

  return {
    async findActiveBuyerSession(botUsername, identityId) {
      const row = await db
        .prepare(`SELECT session.id AS id, session.org_id AS org_id,
                         session.store_id AS store_id, store.locale AS locale
                  FROM sotuvchi_storefront_sessions AS session
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = session.org_id
                   AND store.id = session.store_id
                   AND store.status = 'active'
                   JOIN telegram_agent_routes AS route
                     ON route.org_id = store.org_id
                    AND route.route_code = store.storefront_code
                    AND route.bot_username = session.bot_username
                    AND route.agent_id = 'sotuvchi'
                    AND route.status = 'active'
                   JOIN owner_pilot_stores AS pilot
                     ON pilot.org_id = store.org_id
                    AND pilot.store_id = store.id
                    AND pilot.state = 'active'
                   WHERE session.bot_username = ?
                    AND session.identity_id = ?
                    AND session.status = 'active'`)
        .bind(
          requireCheckoutBotUsername(botUsername),
          requireCheckoutId(identityId),
        )
        .first<{
          id: string;
          org_id: string;
          store_id: string;
          locale: string;
        }>();
      if (!row) return null;
      if (row.locale !== 'ru' && row.locale !== 'uz') {
        throw new CheckoutPersistenceError('corrupt_row');
      }
      return {
        id: requireCheckoutId(row.id),
        orgId: requireCheckoutId(row.org_id),
        storeId: requireCheckoutId(row.store_id),
        locale: row.locale,
      };
    },

    async getOperation(orgId, storeId, idempotencyKey) {
      const row = await db
        .prepare(`SELECT org_id, store_id, idempotency_key, operation,
                         fingerprint, target_id, result_version, created_at
                  FROM sotuvchi_order_operations
                  WHERE org_id = ? AND store_id = ? AND idempotency_key = ?`)
        .bind(
          requireCheckoutId(orgId),
          requireCheckoutId(storeId),
          requireCheckoutId(idempotencyKey),
        )
        .first<{
          org_id: string;
          store_id: string;
          idempotency_key: string;
          operation: string;
          fingerprint: string;
          target_id: string;
          result_version: number | null;
          created_at: string;
        }>();
      if (!row) return null;
      if (!validDate(row.created_at)) {
        throw new CheckoutPersistenceError('corrupt_row');
      }
      return {
        orgId: requireCheckoutId(row.org_id),
        storeId: requireCheckoutId(row.store_id),
        idempotencyKey: requireCheckoutId(row.idempotency_key),
        operation: requireCheckoutId(row.operation),
        fingerprint: requireCheckoutId(row.fingerprint),
        targetId: requireCheckoutId(row.target_id),
        resultVersion: row.result_version === null
          ? null
          : requireCheckoutVersion(row.result_version),
        createdAt: row.created_at,
      };
    },

    getOrder(orgId, orderId) {
      return readOrder(orgId, orderId);
    },

    async findOrderBySession(orgId, storeId, buyerSessionId, status) {
      const row = await db
        .prepare(`${ORDER_SELECT}
                  WHERE ordered.org_id = ? AND ordered.store_id = ?
                    AND ordered.buyer_session_id = ?
                    AND ordered.status = ?
                  ORDER BY ordered.created_at DESC, ordered.id ASC
                  LIMIT 1`)
        .bind(
          requireCheckoutId(orgId),
          requireCheckoutId(storeId),
          requireCheckoutId(buyerSessionId),
          requireOrderStatus(status),
        )
        .first<OrderRow>();
      return row ? fromOrderRow(row) : null;
    },

    async listBuyerOrders(orgId, storeId, buyerSessionId, limit) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
        throw new CheckoutPersistenceError('corrupt_row');
      }
      const rows = await db
        .prepare(`SELECT ordered.id AS order_id,
                         ordered.order_number,
                         ordered.status,
                         ordered.fulfillment_status,
                         ordered.total_minor,
                         ordered.placed_at,
                         item.product_id,
                         item.product_name_snapshot,
                         item.quantity,
                         store.name AS store_name
                  FROM sotuvchi_orders AS ordered
                  JOIN sotuvchi_order_items AS item
                    ON item.org_id = ordered.org_id
                   AND item.order_id = ordered.id
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = ordered.org_id
                   AND store.id = ordered.store_id
                  WHERE ordered.org_id = ?
                    AND ordered.store_id = ?
                    AND ordered.buyer_session_id = ?
                    AND ordered.placed_at IS NOT NULL
                    AND ordered.status IN ('placed', 'cancelled')
                  ORDER BY ordered.placed_at DESC, ordered.id DESC
                  LIMIT ?`)
        .bind(
          requireCheckoutId(orgId),
          requireCheckoutId(storeId),
          requireCheckoutId(buyerSessionId),
          limit,
        )
        .all<{
          order_id: string;
          order_number: string;
          status: string;
          fulfillment_status: string;
          total_minor: number | null;
          placed_at: string | null;
          product_id: string;
          product_name_snapshot: string;
          quantity: number | null;
          store_name: string;
        }>();
      return (rows.results ?? []).map((row) => {
        if (
          row.placed_at === null
          || !validDate(row.placed_at)
          || row.total_minor === null
          || !Number.isInteger(row.quantity)
          || Number(row.quantity) < 1
          || Number(row.quantity) > 99
        ) {
          throw new CheckoutPersistenceError('corrupt_row');
        }
        const status: BuyerOrderStatus | null = row.status === 'cancelled'
          ? 'cancelled'
          : row.status === 'placed' && row.fulfillment_status === 'none'
            ? 'placed'
            : row.status === 'placed'
                && row.fulfillment_status === 'confirmed'
              ? 'confirmed'
              : row.status === 'placed'
                  && row.fulfillment_status === 'done'
                ? 'done'
                : null;
        if (!status) throw new CheckoutPersistenceError('corrupt_row');
        return {
          orderId: requireCheckoutId(row.order_id),
          orderNumber: requireOrderNumber(row.order_number),
          productId: requireCheckoutId(row.product_id),
          productName: optionalText(row.product_name_snapshot, 120)
            ?? (() => {
              throw new CheckoutPersistenceError('corrupt_row');
            })(),
          quantity: Number(row.quantity),
          totalMinor: requireCheckoutTotal(row.total_minor),
          status,
          storeName: normalizeStoreName(row.store_name),
          placedAt: row.placed_at,
        };
      });
    },

    async getInventoryOnHand(orgId, storeId, productId) {
      const row = await db
        .prepare(`SELECT on_hand
                  FROM sotuvchi_inventory
                  WHERE org_id = ? AND store_id = ? AND product_id = ?`)
        .bind(
          requireCheckoutId(orgId),
          requireCheckoutId(storeId),
          requireCheckoutId(productId),
        )
        .first<{ on_hand: number }>();
      if (!row) return null;
      if (
        !Number.isInteger(row.on_hand)
        || Number(row.on_hand) < 0
        || Number(row.on_hand) > 1_000_000
      ) {
        throw new CheckoutPersistenceError('corrupt_row');
      }
      return Number(row.on_hand);
    },

    async createOrder(input, operation) {
      const results = await db.batch([
        db.prepare(`INSERT INTO sotuvchi_orders
          (id, org_id, store_id, buyer_session_id, workflow_instance_id,
           order_number, status, buyer_name, buyer_phone, buyer_address,
           buyer_comment,
           total_minor, currency, version, last_operation_key,
           created_at, updated_at, placed_at)
          SELECT ?, session.org_id, session.store_id, session.id, ?, ?,
                 'draft', NULL, NULL, NULL, NULL, NULL, 'UZS', 1, ?, ?, ?, NULL
          FROM sotuvchi_storefront_sessions AS session
          JOIN sotuvchi_stores AS store
            ON store.org_id = session.org_id
           AND store.id = session.store_id
           AND store.status = 'active'
           JOIN telegram_agent_routes AS route
             ON route.org_id = store.org_id
            AND route.route_code = store.storefront_code
            AND route.bot_username = session.bot_username
            AND route.agent_id = 'sotuvchi'
            AND route.status = 'active'
           JOIN owner_pilot_stores AS pilot
             ON pilot.org_id = store.org_id
            AND pilot.store_id = store.id
            AND pilot.state = 'active'
           JOIN sotuvchi_products AS product
            ON product.org_id = session.org_id
           AND product.store_id = session.store_id
           AND product.id = ?
           AND product.status = 'published'
           AND product.availability IN ('available', 'preorder')
           AND product.price_minor = ?
          LEFT JOIN sotuvchi_categories AS category
            ON category.org_id = product.org_id
           AND category.store_id = product.store_id
           AND category.id = product.category_id
          WHERE session.id = ? AND session.org_id = ? AND session.store_id = ?
            AND session.status = 'active'
            AND (product.category_id IS NULL OR category.status = 'active')`)
          .bind(
            input.orderId,
            input.workflowInstanceId,
            input.orderNumber,
            operation.idempotencyKey,
            input.createdAt,
            input.createdAt,
            input.productId,
            input.expectedPriceMinor,
            input.buyerSessionId,
            input.orgId,
            input.storeId,
          ),
        db.prepare(`INSERT INTO sotuvchi_order_items
          (id, org_id, store_id, order_id, product_id, product_name_snapshot,
           unit_price_minor, currency, availability_snapshot, quantity,
           line_total_minor, created_at, updated_at)
          SELECT ?, ordered.org_id, ordered.store_id, ordered.id, product.id,
                 product.name, product.price_minor, 'UZS', product.availability,
                 NULL, NULL, ?, ?
          FROM sotuvchi_orders AS ordered
          JOIN sotuvchi_products AS product
            ON product.org_id = ordered.org_id
           AND product.store_id = ordered.store_id
           AND product.id = ?
           AND product.status = 'published'
           AND product.availability IN ('available', 'preorder')
          WHERE ordered.org_id = ? AND ordered.id = ?
            AND ordered.last_operation_key = ?`)
          .bind(
            input.itemId,
            input.createdAt,
            input.createdAt,
            input.productId,
            input.orgId,
            input.orderId,
            operation.idempotencyKey,
          ),
        operationStatement(
          { orgId: input.orgId, storeId: input.storeId, id: input.orderId },
          operation,
        ),
      ]);
      return changesOf(results);
    },

    async setQuantity(order, quantity, expectedVersion, operation) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_order_items
                    SET quantity = ?,
                        line_total_minor = unit_price_minor * ?,
                        updated_at = ?
                    WHERE org_id = ? AND order_id = ?
                      AND EXISTS (
                        SELECT 1 FROM sotuvchi_orders AS ordered
                        WHERE ordered.org_id = sotuvchi_order_items.org_id
                          AND ordered.id = sotuvchi_order_items.order_id
                          AND ordered.status = 'draft'
                          AND ordered.version = ?
                          AND ordered.buyer_session_id = ?
                      )`)
          .bind(
            quantity,
            quantity,
            operation.createdAt,
            order.orgId,
            order.id,
            expectedVersion,
            order.buyerSessionId,
          ),
        db.prepare(`UPDATE sotuvchi_orders
                    SET total_minor = (
                          SELECT item.line_total_minor
                          FROM sotuvchi_order_items AS item
                          WHERE item.org_id = sotuvchi_orders.org_id
                            AND item.order_id = sotuvchi_orders.id
                        ),
                        version = version + 1,
                        last_operation_key = ?,
                        updated_at = ?
                    WHERE org_id = ? AND store_id = ? AND id = ?
                      AND status = 'draft' AND version = ?
                      AND buyer_session_id = ?`)
          .bind(
            operation.idempotencyKey,
            operation.createdAt,
            order.orgId,
            order.storeId,
            order.id,
            expectedVersion,
            order.buyerSessionId,
          ),
        operationStatement(order, operation),
      ]);
      return changesOf(results);
    },

    async setContactField(order, field, value, expectedVersion, operation) {
      const column = CONTACT_COLUMNS[field];
      if (!column) throw new CheckoutPersistenceError('persistence_failed');
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_orders
                    SET ${column} = ?,
                        version = version + 1,
                        last_operation_key = ?,
                        updated_at = ?
                    WHERE org_id = ? AND store_id = ? AND id = ?
                      AND status = 'draft' AND version = ?
                      AND buyer_session_id = ?`)
          .bind(
            value,
            operation.idempotencyKey,
            operation.createdAt,
            order.orgId,
            order.storeId,
            order.id,
            expectedVersion,
            order.buyerSessionId,
          ),
        operationStatement(order, operation),
      ]);
      return changesOf(results);
    },

    async setComment(order, value, expectedVersion, operation) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_orders
                    SET buyer_comment = ?,
                        version = version + 1,
                        last_operation_key = ?,
                        updated_at = ?
                    WHERE org_id = ? AND store_id = ? AND id = ?
                      AND status = 'draft' AND version = ?
                      AND buyer_session_id = ?`)
          .bind(
            value,
            operation.idempotencyKey,
            operation.createdAt,
            order.orgId,
            order.storeId,
            order.id,
            expectedVersion,
            order.buyerSessionId,
          ),
        operationStatement(order, operation),
      ]);
      return changesOf(results);
    },

    async refreshPrice(order, priceMinor, expectedVersion, operation) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_order_items
                    SET unit_price_minor = ?,
                        line_total_minor = CASE
                          WHEN quantity IS NULL THEN NULL
                          ELSE ? * quantity
                        END,
                        updated_at = ?
                    WHERE org_id = ? AND order_id = ?
                      AND EXISTS (
                        SELECT 1 FROM sotuvchi_orders AS ordered
                        WHERE ordered.org_id = sotuvchi_order_items.org_id
                          AND ordered.id = sotuvchi_order_items.order_id
                          AND ordered.status = 'draft'
                          AND ordered.version = ?
                          AND ordered.buyer_session_id = ?
                      )`)
          .bind(
            priceMinor,
            priceMinor,
            operation.createdAt,
            order.orgId,
            order.id,
            expectedVersion,
            order.buyerSessionId,
          ),
        db.prepare(`UPDATE sotuvchi_orders
                    SET total_minor = (
                          SELECT item.line_total_minor
                          FROM sotuvchi_order_items AS item
                          WHERE item.org_id = sotuvchi_orders.org_id
                            AND item.order_id = sotuvchi_orders.id
                        ),
                        version = version + 1,
                        last_operation_key = ?,
                        updated_at = ?
                    WHERE org_id = ? AND store_id = ? AND id = ?
                      AND status = 'draft' AND version = ?
                      AND buyer_session_id = ?`)
          .bind(
            operation.idempotencyKey,
            operation.createdAt,
            order.orgId,
            order.storeId,
            order.id,
            expectedVersion,
            order.buyerSessionId,
          ),
        operationStatement(order, operation),
      ]);
      return changesOf(results);
    },

    async placeOrder(order, expectedVersion, placedAt, operation, notification) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_orders
                    SET status = 'placed',
                        placed_at = ?,
                        version = version + 1,
                        last_operation_key = ?,
                        updated_at = ?
                    WHERE org_id = ? AND store_id = ? AND id = ?
                      AND status = 'draft' AND version = ?
                      AND buyer_session_id = ?
                      AND buyer_name IS NOT NULL
                      AND buyer_phone IS NOT NULL
                       AND buyer_address IS NOT NULL
                       AND total_minor IS NOT NULL
                       AND EXISTS (
                         SELECT 1
                         FROM owner_pilot_stores AS pilot
                         WHERE pilot.org_id = sotuvchi_orders.org_id
                           AND pilot.store_id = sotuvchi_orders.store_id
                           AND pilot.state = 'active'
                       )
                       AND EXISTS (
                        SELECT 1
                        FROM sotuvchi_order_items AS item
                        JOIN sotuvchi_products AS product
                          ON product.org_id = item.org_id
                         AND product.store_id = item.store_id
                         AND product.id = item.product_id
                        JOIN sotuvchi_stores AS store
                          ON store.org_id = product.org_id
                         AND store.id = product.store_id
                         AND store.status = 'active'
                        LEFT JOIN sotuvchi_categories AS category
                          ON category.org_id = product.org_id
                         AND category.store_id = product.store_id
                         AND category.id = product.category_id
                        WHERE item.org_id = sotuvchi_orders.org_id
                          AND item.order_id = sotuvchi_orders.id
                          AND item.quantity IS NOT NULL
                          AND item.line_total_minor = sotuvchi_orders.total_minor
                          AND product.status = 'published'
                          AND product.availability IN ('available', 'preorder')
                          AND product.price_minor = item.unit_price_minor
                          AND (product.category_id IS NULL
                            OR category.status = 'active')
                          AND (
                            product.availability = 'preorder'
                            OR NOT EXISTS (
                              SELECT 1
                              FROM sotuvchi_inventory AS inventory
                              WHERE inventory.org_id = product.org_id
                                AND inventory.store_id = product.store_id
                                AND inventory.product_id = product.id
                            )
                            OR EXISTS (
                              SELECT 1
                              FROM sotuvchi_inventory AS inventory
                              WHERE inventory.org_id = product.org_id
                                AND inventory.store_id = product.store_id
                                AND inventory.product_id = product.id
                                AND inventory.on_hand >= item.quantity
                            )
                          )
                      )`)
          .bind(
            placedAt,
            operation.idempotencyKey,
            placedAt,
            order.orgId,
            order.storeId,
            order.id,
            expectedVersion,
            order.buyerSessionId,
          ),
        operationStatement(order, operation),
        // Durable seller intent, committed with the placement itself: no
        // Telegram call happens inside a domain mutation.
        db.prepare(`INSERT INTO sotuvchi_notifications
                    (id, org_id, store_id, order_id, audience, type, status,
                     idempotency_key, attempt_count,
                     created_at, updated_at, sent_at)
                    SELECT ?, ordered.org_id, ordered.store_id, ordered.id,
                           'seller', 'order_placed', 'pending', ?, 0, ?, ?, NULL
                    FROM sotuvchi_orders AS ordered
                    WHERE ordered.org_id = ? AND ordered.store_id = ?
                      AND ordered.id = ?
                      AND ordered.status = 'placed'
                      AND ordered.last_operation_key = ?`)
          .bind(
            notification.id,
            notification.idempotencyKey,
            placedAt,
            placedAt,
            order.orgId,
            order.storeId,
            order.id,
            operation.idempotencyKey,
          ),
      ]);
      return changesOf(results);
    },

    async cancelOrder(order, operation) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_orders
                    SET status = 'cancelled',
                        version = version + 1,
                        last_operation_key = ?,
                        updated_at = ?
                    WHERE org_id = ? AND store_id = ? AND id = ?
                      AND status = 'draft'
                      AND buyer_session_id = ?`)
          .bind(
            operation.idempotencyKey,
            operation.createdAt,
            order.orgId,
            order.storeId,
            order.id,
            order.buyerSessionId,
          ),
        operationStatement(order, operation),
      ]);
      return changesOf(results);
    },
  };
}

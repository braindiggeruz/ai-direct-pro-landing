import type { CheckoutAvailability } from '../checkout';
import type { InventorySnapshot, InventoryMoveType } from '../inventory';
import {
  requireInventoryBalance,
  requireInventoryDelta,
  requireInventoryId,
  requireInventoryMoveType,
  requireInventoryVersion,
} from '../inventory';
import { SellerOrdersPersistenceError } from './errors';
import type {
  NotificationAudience,
  NotificationType,
  SellerContext,
  SellerOrderDetail,
  SellerOrderSummary,
  SotuvchiNotification,
} from './types';
import {
  requireNotificationAudience,
  requireNotificationStatus,
  requireNotificationType,
  requireSellerId,
  requireSellerVersion,
  toSellerOrderStatus,
} from './validation';

/**
 * Seller order aggregate. Orders, inventory balances, the movement ledger and
 * the notification outbox share one store because a seller transition mutates
 * all of them inside a single D1 batch; splitting the SQL would make the
 * atomic guarantee unverifiable.
 */

const ORDER_COLUMNS = `
         ordered.id AS id,
         ordered.order_number AS order_number,
         ordered.status AS status,
         ordered.fulfillment_status AS fulfillment_status,
         ordered.total_minor AS total_minor,
         ordered.version AS version,
         ordered.placed_at AS placed_at,
         item.product_id AS product_id,
         item.product_name_snapshot AS product_name_snapshot,
         item.unit_price_minor AS unit_price_minor,
         item.availability_snapshot AS availability_snapshot,
         item.quantity AS quantity`;

const ORDER_FROM = `
  FROM sotuvchi_orders AS ordered
  JOIN sotuvchi_order_items AS item
    ON item.org_id = ordered.org_id AND item.order_id = ordered.id`;

/** Only orders the buyer actually placed are visible to the seller. */
const SELLER_SCOPE = `
   AND ordered.placed_at IS NOT NULL
   AND ordered.status IN ('placed', 'cancelled')`;

interface OrderSummaryRow {
  id: string;
  order_number: string;
  status: string;
  fulfillment_status: string;
  total_minor: number | null;
  version: number;
  placed_at: string | null;
  product_id: string;
  product_name_snapshot: string;
  unit_price_minor: number;
  availability_snapshot: string;
  quantity: number | null;
}

interface OrderDetailRow extends OrderSummaryRow {
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_address: string | null;
  buyer_comment: string | null;
  inventory_on_hand: number | null;
  live_availability: string | null;
  live_status: string | null;
}

interface InventoryRow {
  product_id: string;
  product_name: string;
  on_hand: number;
  version: number;
}

export interface SellerOperationRecord {
  orgId: string;
  storeId: string;
  idempotencyKey: string;
  operation: string;
  fingerprint: string;
  targetId: string;
  resultVersion: number | null;
  createdAt: string;
}

export interface SellerOperationInput {
  idempotencyKey: string;
  operation: string;
  fingerprint: string;
  createdAt: string;
}

export interface NotificationIntentInput {
  id: string;
  audience: NotificationAudience;
  type: NotificationType;
  idempotencyKey: string;
}

export interface ConfirmOrderInput {
  context: SellerContext;
  order: SellerOrderDetail;
  /** Live catalog availability, pinned into the conditional SQL. */
  liveAvailability: CheckoutAvailability;
  /** Set only when the live availability requires a stock decrement. */
  inventory: { version: number; moveId: string } | null;
  notification: NotificationIntentInput;
  operation: SellerOperationInput;
  now: string;
}

export interface TerminalTransitionInput {
  context: SellerContext;
  order: SellerOrderDetail;
  notification: NotificationIntentInput;
  operation: SellerOperationInput;
  now: string;
}

export interface SetInventoryInput {
  context: SellerContext;
  productId: string;
  onHand: number;
  previous: InventorySnapshot | null;
  moveId: string;
  moveType: Extract<InventoryMoveType, 'initial' | 'manual_adjustment'>;
  operation: SellerOperationInput;
  now: string;
}

export interface SellerOrdersStore {
  getOperation(
    orgId: string,
    storeId: string,
    idempotencyKey: string,
  ): Promise<SellerOperationRecord | null>;
  listOrders(
    orgId: string,
    storeId: string,
    limit: number,
  ): Promise<SellerOrderSummary[]>;
  getOrder(
    orgId: string,
    storeId: string,
    orderId: string,
  ): Promise<SellerOrderDetail | null>;
  getInventory(
    orgId: string,
    storeId: string,
    productId: string,
  ): Promise<InventorySnapshot | null>;
  listInventory(
    orgId: string,
    storeId: string,
    limit: number,
  ): Promise<InventorySnapshot[]>;
  setInventory(input: SetInventoryInput): Promise<readonly number[]>;
  confirmOrder(input: ConfirmOrderInput): Promise<readonly number[]>;
  cancelOrder(input: TerminalTransitionInput): Promise<readonly number[]>;
  completeOrder(input: TerminalTransitionInput): Promise<readonly number[]>;
  listNotifications(
    orgId: string,
    storeId: string,
    limit: number,
  ): Promise<SotuvchiNotification[]>;
  claimNotification(
    orgId: string,
    storeId: string,
    notificationId: string,
    now: string,
  ): Promise<number>;
  markNotification(
    orgId: string,
    storeId: string,
    notificationId: string,
    status: 'sent' | 'failed',
    now: string,
  ): Promise<number>;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function requiredText(value: unknown, maxLength: number): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxLength
  ) {
    throw new SellerOrdersPersistenceError('corrupt_row');
  }
  return value;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  return requiredText(value, maxLength);
}

function requireAvailability(value: unknown): CheckoutAvailability {
  if (value !== 'available' && value !== 'preorder') {
    throw new SellerOrdersPersistenceError('corrupt_row');
  }
  return value;
}

function toSummary(row: OrderSummaryRow): SellerOrderSummary {
  try {
    if (
      row.quantity === null
      || row.total_minor === null
      || row.placed_at === null
      || !validDate(row.placed_at)
    ) {
      throw new SellerOrdersPersistenceError('corrupt_row');
    }
    return {
      orderId: requireSellerId(row.id),
      orderNumber: requiredText(row.order_number, 32),
      status: toSellerOrderStatus(row.status, row.fulfillment_status),
      productId: requireSellerId(row.product_id),
      productName: requiredText(row.product_name_snapshot, 120),
      quantity: Number(row.quantity),
      totalMinor: Number(row.total_minor),
      version: requireSellerVersion(row.version),
      placedAt: row.placed_at,
    };
  } catch (error) {
    if (error instanceof SellerOrdersPersistenceError) throw error;
    throw new SellerOrdersPersistenceError('corrupt_row');
  }
}

function toDetail(row: OrderDetailRow): SellerOrderDetail {
  const summary = toSummary(row);
  try {
    const availability = requireAvailability(row.availability_snapshot);
    const live = row.live_status === 'published' && row.live_availability
      ? row.live_availability
      : null;
    return {
      ...summary,
      unitPriceMinor: Number(row.unit_price_minor),
      availability,
      customerName: requiredText(row.buyer_name, 80),
      customerPhone: requiredText(row.buyer_phone, 16),
      customerAddress: requiredText(row.buyer_address, 240),
      customerComment: optionalText(row.buyer_comment, 240),
      inventoryOnHand: row.inventory_on_hand === null
        ? null
        : requireInventoryBalance(Number(row.inventory_on_hand)),
      inventoryRequired: live === 'available',
    };
  } catch (error) {
    if (error instanceof SellerOrdersPersistenceError) throw error;
    throw new SellerOrdersPersistenceError('corrupt_row');
  }
}

function toInventorySnapshot(row: InventoryRow): InventorySnapshot {
  try {
    return {
      productId: requireInventoryId(row.product_id),
      productName: requiredText(row.product_name, 120),
      onHand: requireInventoryBalance(Number(row.on_hand)),
      version: requireInventoryVersion(Number(row.version)),
    };
  } catch (error) {
    if (error instanceof SellerOrdersPersistenceError) throw error;
    throw new SellerOrdersPersistenceError('corrupt_row');
  }
}

function changesOf(results: readonly D1Result<unknown>[]): readonly number[] {
  return results.map((result) => Number(result?.meta?.changes ?? 0));
}

export function createSotuvchiOrdersStore(db: D1Database): SellerOrdersStore {
  /**
   * Owner membership, active store and a settled single-item order, evaluated
   * inside the mutating statement itself so authority cannot go stale between
   * the read and the write.
   */
  const ownerGuard = `
     AND EXISTS (
       SELECT 1
         FROM sotuvchi_order_items AS item
         JOIN sotuvchi_stores AS store
           ON store.org_id = item.org_id
          AND store.id = item.store_id
          AND store.status = 'active'
         JOIN memberships AS membership
           ON membership.org_id = store.org_id
          AND membership.identity_id = ?
          AND membership.role = 'owner'
          AND membership.status = 'active'
        WHERE item.org_id = sotuvchi_orders.org_id
          AND item.order_id = sotuvchi_orders.id
          AND item.quantity IS NOT NULL
          AND item.line_total_minor = sotuvchi_orders.total_minor
     )`;

  function orderOperationStatement(
    context: SellerContext,
    orderId: string,
    operation: SellerOperationInput,
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
        context.orgId,
        context.storeId,
        orderId,
        operation.idempotencyKey,
      );
  }

  function notificationStatement(
    context: SellerContext,
    orderId: string,
    intent: NotificationIntentInput,
    expected: { status: string; fulfillment: string },
    operation: SellerOperationInput,
    now: string,
  ): D1PreparedStatement {
    return db.prepare(`INSERT INTO sotuvchi_notifications
      (id, org_id, store_id, order_id, audience, type, status,
       idempotency_key, attempt_count, created_at, updated_at, sent_at)
      SELECT ?, ordered.org_id, ordered.store_id, ordered.id, ?, ?, 'pending',
             ?, 0, ?, ?, NULL
      FROM sotuvchi_orders AS ordered
      WHERE ordered.org_id = ? AND ordered.store_id = ? AND ordered.id = ?
        AND ordered.status = ? AND ordered.fulfillment_status = ?
        AND ordered.last_operation_key = ?`)
      .bind(
        intent.id,
        intent.audience,
        intent.type,
        intent.idempotencyKey,
        now,
        now,
        context.orgId,
        context.storeId,
        orderId,
        expected.status,
        expected.fulfillment,
        operation.idempotencyKey,
      );
  }

  function terminalStatements(
    input: TerminalTransitionInput,
    update: D1PreparedStatement,
    expected: { status: string; fulfillment: string },
  ): D1PreparedStatement[] {
    return [
      update,
      orderOperationStatement(
        input.context,
        input.order.orderId,
        input.operation,
      ),
      notificationStatement(
        input.context,
        input.order.orderId,
        input.notification,
        expected,
        input.operation,
        input.now,
      ),
    ];
  }

  return {
    async getOperation(orgId, storeId, idempotencyKey) {
      const row = await db
        .prepare(`SELECT org_id, store_id, idempotency_key, operation,
                         fingerprint, target_id, result_version, created_at
                  FROM sotuvchi_order_operations
                  WHERE org_id = ? AND store_id = ? AND idempotency_key = ?`)
        .bind(
          requireSellerId(orgId),
          requireSellerId(storeId),
          requireSellerId(idempotencyKey),
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
        throw new SellerOrdersPersistenceError('corrupt_row');
      }
      return {
        orgId: requireSellerId(row.org_id),
        storeId: requireSellerId(row.store_id),
        idempotencyKey: requireSellerId(row.idempotency_key),
        operation: requiredText(row.operation, 64),
        fingerprint: requiredText(row.fingerprint, 128),
        targetId: requireSellerId(row.target_id),
        resultVersion: row.result_version === null
          ? null
          : requireSellerVersion(row.result_version),
        createdAt: row.created_at,
      };
    },

    async listOrders(orgId, storeId, limit) {
      const rows = await db
        .prepare(`SELECT ${ORDER_COLUMNS}
                  ${ORDER_FROM}
                  WHERE ordered.org_id = ? AND ordered.store_id = ?
                    ${SELLER_SCOPE}
                  ORDER BY ordered.placed_at DESC, ordered.id ASC
                  LIMIT ?`)
        .bind(
          requireSellerId(orgId),
          requireSellerId(storeId),
          limit,
        )
        .all<OrderSummaryRow>();
      return (rows.results ?? []).map(toSummary);
    },

    async getOrder(orgId, storeId, orderId) {
      const row = await db
        .prepare(`SELECT ${ORDER_COLUMNS},
                         ordered.buyer_name AS buyer_name,
                         ordered.buyer_phone AS buyer_phone,
                         ordered.buyer_address AS buyer_address,
                         ordered.buyer_comment AS buyer_comment,
                         inventory.on_hand AS inventory_on_hand,
                         product.availability AS live_availability,
                         product.status AS live_status
                  ${ORDER_FROM}
                  LEFT JOIN sotuvchi_inventory AS inventory
                    ON inventory.org_id = item.org_id
                   AND inventory.store_id = item.store_id
                   AND inventory.product_id = item.product_id
                  LEFT JOIN sotuvchi_products AS product
                    ON product.org_id = item.org_id
                   AND product.store_id = item.store_id
                   AND product.id = item.product_id
                  WHERE ordered.org_id = ? AND ordered.store_id = ?
                    AND ordered.id = ?
                    ${SELLER_SCOPE}`)
        .bind(
          requireSellerId(orgId),
          requireSellerId(storeId),
          requireSellerId(orderId),
        )
        .first<OrderDetailRow>();
      return row ? toDetail(row) : null;
    },

    async getInventory(orgId, storeId, productId) {
      const row = await db
        .prepare(`SELECT inventory.product_id AS product_id,
                         product.name AS product_name,
                         inventory.on_hand AS on_hand,
                         inventory.version AS version
                  FROM sotuvchi_inventory AS inventory
                  JOIN sotuvchi_products AS product
                    ON product.org_id = inventory.org_id
                   AND product.store_id = inventory.store_id
                   AND product.id = inventory.product_id
                  WHERE inventory.org_id = ? AND inventory.store_id = ?
                    AND inventory.product_id = ?`)
        .bind(
          requireSellerId(orgId),
          requireSellerId(storeId),
          requireSellerId(productId),
        )
        .first<InventoryRow>();
      return row ? toInventorySnapshot(row) : null;
    },

    async listInventory(orgId, storeId, limit) {
      const rows = await db
        .prepare(`SELECT inventory.product_id AS product_id,
                         product.name AS product_name,
                         inventory.on_hand AS on_hand,
                         inventory.version AS version
                  FROM sotuvchi_inventory AS inventory
                  JOIN sotuvchi_products AS product
                    ON product.org_id = inventory.org_id
                   AND product.store_id = inventory.store_id
                   AND product.id = inventory.product_id
                  WHERE inventory.org_id = ? AND inventory.store_id = ?
                    AND product.status <> 'archived'
                  ORDER BY product.normalized_name ASC, inventory.product_id ASC
                  LIMIT ?`)
        .bind(
          requireSellerId(orgId),
          requireSellerId(storeId),
          limit,
        )
        .all<InventoryRow>();
      return (rows.results ?? []).map(toInventorySnapshot);
    },

    async setInventory(input) {
      const { context, operation } = input;
      const delta = requireInventoryDelta(
        input.onHand - (input.previous?.onHand ?? 0),
      );
      const balance = requireInventoryBalance(input.onHand);
      const nextVersion = (input.previous?.version ?? 0) + 1;
      const write = input.previous === null
        ? db.prepare(`INSERT INTO sotuvchi_inventory
              (org_id, store_id, product_id, on_hand, version,
               created_at, updated_at)
              SELECT product.org_id, product.store_id, product.id, ?, 1, ?, ?
              FROM sotuvchi_products AS product
              JOIN sotuvchi_stores AS store
                ON store.org_id = product.org_id
               AND store.id = product.store_id
               AND store.status = 'active'
              JOIN memberships AS membership
                ON membership.org_id = store.org_id
               AND membership.identity_id = ?
               AND membership.role = 'owner'
               AND membership.status = 'active'
              WHERE product.org_id = ? AND product.store_id = ?
                AND product.id = ? AND product.status <> 'archived'`)
          .bind(
            balance,
            input.now,
            input.now,
            context.identityId,
            context.orgId,
            context.storeId,
            input.productId,
          )
        : db.prepare(`UPDATE sotuvchi_inventory
              SET on_hand = ?, version = version + 1, updated_at = ?
              WHERE org_id = ? AND store_id = ? AND product_id = ?
                AND version = ?
                AND EXISTS (
                  SELECT 1
                    FROM sotuvchi_products AS product
                    JOIN sotuvchi_stores AS store
                      ON store.org_id = product.org_id
                     AND store.id = product.store_id
                     AND store.status = 'active'
                    JOIN memberships AS membership
                      ON membership.org_id = store.org_id
                     AND membership.identity_id = ?
                     AND membership.role = 'owner'
                     AND membership.status = 'active'
                   WHERE product.org_id = sotuvchi_inventory.org_id
                     AND product.store_id = sotuvchi_inventory.store_id
                     AND product.id = sotuvchi_inventory.product_id
                     AND product.status <> 'archived'
                )`)
          .bind(
            balance,
            input.now,
            context.orgId,
            context.storeId,
            input.productId,
            input.previous.version,
            context.identityId,
          );
      const results = await db.batch([
        write,
        db.prepare(`INSERT INTO sotuvchi_inventory_moves
            (id, org_id, store_id, product_id, order_id, type, delta,
             balance_after, idempotency_key, created_at)
            SELECT ?, inventory.org_id, inventory.store_id,
                   inventory.product_id, NULL, ?, ?, inventory.on_hand, ?, ?
            FROM sotuvchi_inventory AS inventory
            WHERE inventory.org_id = ? AND inventory.store_id = ?
              AND inventory.product_id = ?
              AND inventory.version = ? AND inventory.on_hand = ?`)
          .bind(
            input.moveId,
            requireInventoryMoveType(input.moveType),
            delta,
            operation.idempotencyKey,
            input.now,
            context.orgId,
            context.storeId,
            input.productId,
            nextVersion,
            balance,
          ),
        db.prepare(`INSERT INTO sotuvchi_order_operations
            (org_id, store_id, idempotency_key, operation, fingerprint,
             target_id, result_version, created_at)
            SELECT inventory.org_id, inventory.store_id, ?, ?, ?,
                   inventory.product_id, inventory.version, ?
            FROM sotuvchi_inventory AS inventory
            WHERE inventory.org_id = ? AND inventory.store_id = ?
              AND inventory.product_id = ?
              AND inventory.version = ? AND inventory.on_hand = ?`)
          .bind(
            operation.idempotencyKey,
            operation.operation,
            operation.fingerprint,
            operation.createdAt,
            context.orgId,
            context.storeId,
            input.productId,
            nextVersion,
            balance,
          ),
      ]);
      return changesOf(results);
    },

    async confirmOrder(input) {
      const { context, order, operation } = input;
      const statements: D1PreparedStatement[] = [];
      if (input.inventory) {
        statements.push(
          db.prepare(`UPDATE sotuvchi_inventory
              SET on_hand = on_hand - ?, version = version + 1, updated_at = ?
              WHERE org_id = ? AND store_id = ? AND product_id = ?
                AND version = ? AND on_hand >= ?
                AND EXISTS (
                  SELECT 1
                    FROM sotuvchi_orders AS ordered
                    JOIN sotuvchi_order_items AS item
                      ON item.org_id = ordered.org_id
                     AND item.order_id = ordered.id
                    JOIN sotuvchi_products AS product
                      ON product.org_id = item.org_id
                     AND product.store_id = item.store_id
                     AND product.id = item.product_id
                    JOIN sotuvchi_stores AS store
                      ON store.org_id = product.org_id
                     AND store.id = product.store_id
                     AND store.status = 'active'
                    JOIN memberships AS membership
                      ON membership.org_id = store.org_id
                     AND membership.identity_id = ?
                     AND membership.role = 'owner'
                     AND membership.status = 'active'
                   WHERE ordered.org_id = ? AND ordered.store_id = ?
                     AND ordered.id = ?
                     AND ordered.status = 'placed'
                     AND ordered.fulfillment_status = 'none'
                     AND ordered.version = ?
                     AND ordered.placed_at IS NOT NULL
                     AND item.product_id = sotuvchi_inventory.product_id
                     AND item.quantity = ?
                     AND item.line_total_minor = ordered.total_minor
                     AND product.status = 'published'
                     AND product.availability = ?
                )`)
            .bind(
              order.quantity,
              input.now,
              context.orgId,
              context.storeId,
              order.productId,
              input.inventory.version,
              order.quantity,
              context.identityId,
              context.orgId,
              context.storeId,
              order.orderId,
              order.version,
              order.quantity,
              input.liveAvailability,
            ),
          db.prepare(`INSERT INTO sotuvchi_inventory_moves
              (id, org_id, store_id, product_id, order_id, type, delta,
               balance_after, idempotency_key, created_at)
              SELECT ?, inventory.org_id, inventory.store_id,
                     inventory.product_id, ?, 'order_confirmed', ?,
                     inventory.on_hand, ?, ?
              FROM sotuvchi_inventory AS inventory
              WHERE inventory.org_id = ? AND inventory.store_id = ?
                AND inventory.product_id = ? AND inventory.version = ?`)
            .bind(
              input.inventory.moveId,
              order.orderId,
              -order.quantity,
              `${operation.idempotencyKey}:move`,
              input.now,
              context.orgId,
              context.storeId,
              order.productId,
              input.inventory.version + 1,
            ),
        );
      }
      statements.push(
        db.prepare(`UPDATE sotuvchi_orders
            SET fulfillment_status = 'confirmed',
                version = version + 1,
                last_operation_key = ?,
                updated_at = ?
            WHERE org_id = ? AND store_id = ? AND id = ?
              AND status = 'placed' AND fulfillment_status = 'none'
              AND version = ? AND placed_at IS NOT NULL
              ${ownerGuard}
              AND EXISTS (
                SELECT 1
                  FROM sotuvchi_order_items AS item
                  JOIN sotuvchi_products AS product
                    ON product.org_id = item.org_id
                   AND product.store_id = item.store_id
                   AND product.id = item.product_id
                 WHERE item.org_id = sotuvchi_orders.org_id
                   AND item.order_id = sotuvchi_orders.id
                   AND product.status = 'published'
                   AND product.availability = ?
              )
              AND (
                ? = 0
                OR EXISTS (
                  SELECT 1 FROM sotuvchi_inventory_moves AS move
                   WHERE move.order_id = sotuvchi_orders.id
                     AND move.type = 'order_confirmed'
                )
              )`)
          .bind(
            operation.idempotencyKey,
            input.now,
            context.orgId,
            context.storeId,
            order.orderId,
            order.version,
            context.identityId,
            input.liveAvailability,
            input.inventory ? 1 : 0,
          ),
        orderOperationStatement(context, order.orderId, operation),
        notificationStatement(
          context,
          order.orderId,
          input.notification,
          { status: 'placed', fulfillment: 'confirmed' },
          operation,
          input.now,
        ),
      );
      return changesOf(await db.batch(statements));
    },

    async cancelOrder(input) {
      const { context, order, operation } = input;
      return changesOf(await db.batch(terminalStatements(
        input,
        db.prepare(`UPDATE sotuvchi_orders
            SET status = 'cancelled',
                version = version + 1,
                last_operation_key = ?,
                updated_at = ?
            WHERE org_id = ? AND store_id = ? AND id = ?
              AND status = 'placed' AND fulfillment_status = 'none'
              AND version = ? AND placed_at IS NOT NULL
              ${ownerGuard}`)
          .bind(
            operation.idempotencyKey,
            input.now,
            context.orgId,
            context.storeId,
            order.orderId,
            order.version,
            context.identityId,
          ),
        { status: 'cancelled', fulfillment: 'none' },
      )));
    },

    async completeOrder(input) {
      const { context, order, operation } = input;
      return changesOf(await db.batch(terminalStatements(
        input,
        db.prepare(`UPDATE sotuvchi_orders
            SET fulfillment_status = 'done',
                version = version + 1,
                last_operation_key = ?,
                updated_at = ?
            WHERE org_id = ? AND store_id = ? AND id = ?
              AND status = 'placed' AND fulfillment_status = 'confirmed'
              AND version = ? AND placed_at IS NOT NULL
              ${ownerGuard}`)
          .bind(
            operation.idempotencyKey,
            input.now,
            context.orgId,
            context.storeId,
            order.orderId,
            order.version,
            context.identityId,
          ),
        { status: 'placed', fulfillment: 'done' },
      )));
    },

    async listNotifications(orgId, storeId, limit) {
      const rows = await db
        .prepare(`SELECT id, org_id, store_id, order_id, audience, type,
                         status, attempt_count, created_at, updated_at, sent_at
                  FROM sotuvchi_notifications
                  WHERE org_id = ? AND store_id = ? AND status = 'pending'
                  ORDER BY created_at ASC, id ASC
                  LIMIT ?`)
        .bind(requireSellerId(orgId), requireSellerId(storeId), limit)
        .all<{
          id: string;
          org_id: string;
          store_id: string;
          order_id: string;
          audience: string;
          type: string;
          status: string;
          attempt_count: number;
          created_at: string;
          updated_at: string;
          sent_at: string | null;
        }>();
      return (rows.results ?? []).map((row) => {
        if (
          !validDate(row.created_at)
          || !validDate(row.updated_at)
          || (row.sent_at !== null && !validDate(row.sent_at))
        ) {
          throw new SellerOrdersPersistenceError('corrupt_row');
        }
        return {
          id: requireSellerId(row.id),
          orgId: requireSellerId(row.org_id),
          storeId: requireSellerId(row.store_id),
          orderId: requireSellerId(row.order_id),
          audience: requireNotificationAudience(row.audience),
          type: requireNotificationType(row.type),
          status: requireNotificationStatus(row.status),
          attemptCount: Number(row.attempt_count),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          sentAt: row.sent_at,
        };
      });
    },

    async claimNotification(orgId, storeId, notificationId, now) {
      const result = await db
        .prepare(`UPDATE sotuvchi_notifications
                  SET status = 'sending',
                      attempt_count = attempt_count + 1,
                      updated_at = ?
                  WHERE org_id = ? AND store_id = ? AND id = ?
                    AND status = 'pending'
                    AND attempt_count < ?`)
        .bind(
          now,
          requireSellerId(orgId),
          requireSellerId(storeId),
          requireSellerId(notificationId),
          100,
        )
        .run();
      return Number(result?.meta?.changes ?? 0);
    },

    async markNotification(orgId, storeId, notificationId, status, now) {
      const result = await db
        .prepare(`UPDATE sotuvchi_notifications
                  SET status = ?,
                      updated_at = ?,
                      sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END
                  WHERE org_id = ? AND store_id = ? AND id = ?
                    AND status = 'sending'`)
        .bind(
          requireNotificationStatus(status),
          now,
          status,
          now,
          requireSellerId(orgId),
          requireSellerId(storeId),
          requireSellerId(notificationId),
        )
        .run();
      return Number(result?.meta?.changes ?? 0);
    },
  };
}

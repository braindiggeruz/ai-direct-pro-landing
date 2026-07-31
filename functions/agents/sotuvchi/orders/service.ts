import type { OrgContext } from '../../../platform/contracts';
import {
  CatalogNotFoundError,
  type SotuvchiCatalogService,
  type StorefrontContext,
} from '../catalog';
import type { CheckoutAvailability } from '../checkout';
import {
  InventoryInsufficientError,
  InventoryNotConfiguredError,
  normalizeOnHand,
  type InventorySnapshot,
  type SetInventoryResult,
} from '../inventory';
import {
  SellerOrdersAuthorizationError,
  SellerOrdersIdempotencyConflictError,
  SellerOrdersNotFoundError,
  SellerOrdersPersistenceError,
  SellerOrdersStateError,
  SellerOrdersVersionConflictError,
} from './errors';
import { ensureSotuvchiOrdersSchema } from './schema';
import {
  createSotuvchiOrdersStore,
  type NotificationIntentInput,
  type SellerOperationInput,
  type SellerOrdersStore,
} from './store';
import type {
  NotificationType,
  SellerContext,
  SellerOrderDetail,
  SellerOrderSummary,
  SellerOrderTransition,
  SellerOrderTransitionResult,
  SotuvchiNotification,
} from './types';
import {
  isAllowedSellerTransition,
  requireSellerId,
  requireSellerLimit,
  SELLER_ORDER_LIMITS,
  transitionTarget,
} from './validation';

const ID_BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

const TRANSITION_NOTIFICATIONS: Readonly<
  Record<SellerOrderTransition, NotificationType>
> = {
  confirm: 'order_confirmed',
  cancel: 'order_cancelled',
  done: 'order_done',
};

export interface SotuvchiOrdersServiceOptions {
  moveIdGenerator?: () => string;
  notificationIdGenerator?: () => string;
}

function randomBase32(prefix: 'm' | 'n'): string {
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
  return `${prefix}-${encoded}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export class SotuvchiOrdersService {
  private readonly store: SellerOrdersStore;
  private readonly moveIdGenerator: () => string;
  private readonly notificationIdGenerator: () => string;

  constructor(
    private readonly db: D1Database,
    private readonly catalog: SotuvchiCatalogService,
    options: SotuvchiOrdersServiceOptions = {},
  ) {
    this.store = createSotuvchiOrdersStore(db);
    this.moveIdGenerator = options.moveIdGenerator ?? (() => randomBase32('m'));
    this.notificationIdGenerator = options.notificationIdGenerator
      ?? (() => randomBase32('n'));
  }

  private async ready(): Promise<void> {
    await ensureSotuvchiOrdersSchema(this.db);
  }

  /**
   * Seller authority chain: trusted Runtime actor → active owner membership →
   * active store. The seller never supplies an org, store or order ownership.
   */
  async resolveSeller(org: OrgContext): Promise<SellerContext> {
    await this.ready();
    if (!org.actorId) throw new SellerOrdersAuthorizationError();
    const owner = await this.catalog.resolveOwnerContext({
      identityId: org.actorId,
      orgId: org.orgId,
      requestId: org.requestId,
      locale: org.locale,
    });
    return {
      identityId: owner.identityId,
      orgId: owner.orgId,
      storeId: owner.storeId,
      requestId: requireSellerId(org.requestId),
      locale: owner.locale,
    };
  }

  private storefront(seller: SellerContext): StorefrontContext {
    return {
      orgId: seller.orgId,
      storeId: seller.storeId,
      agentId: 'sotuvchi',
      locale: seller.locale,
    };
  }

  private async operation(
    seller: SellerContext,
    name: string,
    value: unknown,
  ): Promise<SellerOperationInput> {
    return {
      idempotencyKey: seller.requestId,
      operation: name,
      fingerprint: await fingerprint({ name, value }),
      createdAt: new Date().toISOString(),
    };
  }

  private async replay(
    seller: SellerContext,
    operation: SellerOperationInput,
  ): Promise<string | null> {
    const record = await this.store.getOperation(
      seller.orgId,
      seller.storeId,
      operation.idempotencyKey,
    );
    if (!record) return null;
    if (
      record.operation !== operation.operation
      || record.fingerprint !== operation.fingerprint
    ) {
      throw new SellerOrdersIdempotencyConflictError();
    }
    return record.targetId;
  }

  private async requireOrder(
    seller: SellerContext,
    orderId: string,
  ): Promise<SellerOrderDetail> {
    const order = await this.store.getOrder(
      seller.orgId,
      seller.storeId,
      requireSellerId(orderId),
    );
    if (!order) throw new SellerOrdersNotFoundError('order');
    return order;
  }

  async listOrders(
    org: OrgContext,
    rawLimit?: unknown,
  ): Promise<readonly SellerOrderSummary[]> {
    const seller = await this.resolveSeller(org);
    return this.store.listOrders(
      seller.orgId,
      seller.storeId,
      Math.min(requireSellerLimit(rawLimit, 5), 5),
    );
  }

  async getOrder(
    org: OrgContext,
    orderId: unknown,
  ): Promise<SellerOrderDetail> {
    const seller = await this.resolveSeller(org);
    return this.requireOrder(seller, requireSellerId(orderId));
  }

  async listInventory(
    org: OrgContext,
    rawLimit?: unknown,
  ): Promise<readonly InventorySnapshot[]> {
    const seller = await this.resolveSeller(org);
    return this.store.listInventory(
      seller.orgId,
      seller.storeId,
      requireSellerLimit(rawLimit, SELLER_ORDER_LIMITS.listLimit),
    );
  }

  async getInventory(
    org: OrgContext,
    productId: unknown,
  ): Promise<InventorySnapshot> {
    const seller = await this.resolveSeller(org);
    const id = requireSellerId(productId);
    await this.requireSellableProduct(seller, id);
    const inventory = await this.store.getInventory(
      seller.orgId,
      seller.storeId,
      id,
    );
    if (!inventory) throw new InventoryNotConfiguredError();
    return inventory;
  }

  private async requireSellableProduct(
    seller: SellerContext,
    productId: string,
  ): Promise<{ name: string; availability: CheckoutAvailability }> {
    let availability: string;
    let name: string;
    try {
      const result = await this.catalog.getPublishedProductResult(
        this.storefront(seller),
        productId,
      );
      availability = result.product.availability;
      name = result.product.name;
    } catch (error) {
      if (
        error instanceof CatalogNotFoundError
        || error instanceof SellerOrdersNotFoundError
      ) {
        throw new SellerOrdersStateError('product_not_sellable');
      }
      throw error;
    }
    if (availability !== 'available' && availability !== 'preorder') {
      throw new SellerOrdersStateError('product_not_sellable');
    }
    return { name, availability };
  }

  /** Absolute balance. Stock is never inferred from declarative availability. */
  async setInventory(
    org: OrgContext,
    rawProductId: unknown,
    rawOnHand: unknown,
  ): Promise<SetInventoryResult> {
    const seller = await this.resolveSeller(org);
    const productId = requireSellerId(rawProductId);
    const onHand = normalizeOnHand(rawOnHand);
    await this.requireSellableProduct(seller, productId);
    const operation = await this.operation(seller, 'seller.inventory.set', {
      productId,
      onHand,
    });
    const replayed = await this.replay(seller, operation);
    if (replayed !== null) {
      const stored = await this.store.getInventory(
        seller.orgId,
        seller.storeId,
        replayed,
      );
      if (!stored) throw new SellerOrdersPersistenceError('corrupt_row');
      return {
        snapshot: stored,
        previousOnHand: stored.onHand,
        delta: 0,
        moveType: 'manual_adjustment',
        outcome: 'unchanged',
      };
    }

    const previous = await this.store.getInventory(
      seller.orgId,
      seller.storeId,
      productId,
    );
    if (previous && previous.onHand === onHand) {
      return {
        snapshot: previous,
        previousOnHand: previous.onHand,
        delta: 0,
        moveType: 'manual_adjustment',
        outcome: 'unchanged',
      };
    }
    const moveType = previous === null ? 'initial' : 'manual_adjustment';
    const changes = await this.store.setInventory({
      context: seller,
      productId,
      onHand,
      previous,
      moveId: this.moveIdGenerator(),
      moveType,
      operation,
      now: new Date().toISOString(),
    });
    if (changes.some((value) => value !== 1)) {
      throw new SellerOrdersVersionConflictError();
    }
    const snapshot = await this.store.getInventory(
      seller.orgId,
      seller.storeId,
      productId,
    );
    if (!snapshot) throw new SellerOrdersPersistenceError('persistence_failed');
    return {
      snapshot,
      previousOnHand: previous?.onHand ?? 0,
      delta: onHand - (previous?.onHand ?? 0),
      moveType,
      outcome: 'applied',
    };
  }

  private notificationIntent(
    transition: SellerOrderTransition,
    operation: SellerOperationInput,
  ): NotificationIntentInput {
    return {
      id: this.notificationIdGenerator(),
      audience: 'buyer',
      type: TRANSITION_NOTIFICATIONS[transition],
      idempotencyKey: `${operation.idempotencyKey}:${transition}`,
    };
  }

  private async settled(
    seller: SellerContext,
    orderId: string,
    transition: SellerOrderTransition,
    outcome: 'applied' | 'unchanged',
    stockDelta: number,
  ): Promise<SellerOrderTransitionResult> {
    const order = await this.requireOrder(seller, orderId);
    return {
      order,
      transition,
      outcome,
      stockDelta,
      inventory: await this.store.getInventory(
        seller.orgId,
        seller.storeId,
        order.productId,
      ),
    };
  }

  async confirmOrder(
    org: OrgContext,
    rawOrderId: unknown,
  ): Promise<SellerOrderTransitionResult> {
    const seller = await this.resolveSeller(org);
    const orderId = requireSellerId(rawOrderId);
    const operation = await this.operation(seller, 'seller.order.confirm', {
      orderId,
    });
    const replayed = await this.replay(seller, operation);
    if (replayed !== null) {
      return this.settled(seller, replayed, 'confirm', 'unchanged', 0);
    }

    const order = await this.requireOrder(seller, orderId);
    if (order.status === 'confirmed') {
      return this.settled(seller, orderId, 'confirm', 'unchanged', 0);
    }
    if (!isAllowedSellerTransition(order.status, 'confirm')) {
      throw new SellerOrdersStateError('invalid_transition');
    }
    const live = await this.requireSellableProduct(seller, order.productId);

    // Declarative availability decides the policy; only 'available' consumes
    // stock, and it is fail-closed when the seller never set a balance.
    let inventory: { version: number; moveId: string } | null = null;
    let stockDelta = 0;
    if (live.availability === 'available') {
      const balance = await this.store.getInventory(
        seller.orgId,
        seller.storeId,
        order.productId,
      );
      if (!balance) throw new InventoryNotConfiguredError();
      if (balance.onHand < order.quantity) {
        throw new InventoryInsufficientError();
      }
      inventory = { version: balance.version, moveId: this.moveIdGenerator() };
      stockDelta = order.quantity;
    }

    const changes = await this.store.confirmOrder({
      context: seller,
      order,
      liveAvailability: live.availability,
      inventory,
      notification: this.notificationIntent('confirm', operation),
      operation,
      now: new Date().toISOString(),
    });
    if (changes.some((value) => value !== 1)) {
      throw new SellerOrdersVersionConflictError();
    }
    return this.settled(seller, orderId, 'confirm', 'applied', stockDelta);
  }

  private async terminal(
    org: OrgContext,
    rawOrderId: unknown,
    transition: Extract<SellerOrderTransition, 'cancel' | 'done'>,
  ): Promise<SellerOrderTransitionResult> {
    const seller = await this.resolveSeller(org);
    const orderId = requireSellerId(rawOrderId);
    const operation = await this.operation(
      seller,
      `seller.order.${transition}`,
      { orderId },
    );
    const replayed = await this.replay(seller, operation);
    if (replayed !== null) {
      return this.settled(seller, replayed, transition, 'unchanged', 0);
    }

    const order = await this.requireOrder(seller, orderId);
    if (order.status === transitionTarget(transition)) {
      return this.settled(seller, orderId, transition, 'unchanged', 0);
    }
    if (!isAllowedSellerTransition(order.status, transition)) {
      throw new SellerOrdersStateError('invalid_transition');
    }
    const input = {
      context: seller,
      order,
      notification: this.notificationIntent(transition, operation),
      operation,
      now: new Date().toISOString(),
    };
    const changes = transition === 'cancel'
      ? await this.store.cancelOrder(input)
      : await this.store.completeOrder(input);
    if (changes.some((value) => value !== 1)) {
      throw new SellerOrdersVersionConflictError();
    }
    return this.settled(seller, orderId, transition, 'applied', 0);
  }

  cancelOrder(
    org: OrgContext,
    orderId: unknown,
  ): Promise<SellerOrderTransitionResult> {
    return this.terminal(org, orderId, 'cancel');
  }

  completeOrder(
    org: OrgContext,
    orderId: unknown,
  ): Promise<SellerOrderTransitionResult> {
    return this.terminal(org, orderId, 'done');
  }

  /**
   * Outbox reader. Delivery is deliberately not performed here: the domain
   * mutation only records a durable intent, and the transport that owns
   * recipient chat references binds to it in a later stage.
   */
  async listPendingNotifications(
    orgId: unknown,
    storeId: unknown,
    limit: number = SELLER_ORDER_LIMITS.listLimit,
  ): Promise<readonly SotuvchiNotification[]> {
    await this.ready();
    return this.store.listNotifications(
      requireSellerId(orgId),
      requireSellerId(storeId),
      requireSellerLimit(limit, SELLER_ORDER_LIMITS.listLimit),
    );
  }

  async claimNotification(
    orgId: unknown,
    storeId: unknown,
    notificationId: unknown,
  ): Promise<boolean> {
    await this.ready();
    const changes = await this.store.claimNotification(
      requireSellerId(orgId),
      requireSellerId(storeId),
      requireSellerId(notificationId),
      new Date().toISOString(),
    );
    return changes === 1;
  }

  async settleNotification(
    orgId: unknown,
    storeId: unknown,
    notificationId: unknown,
    status: 'sent' | 'failed',
  ): Promise<boolean> {
    await this.ready();
    const changes = await this.store.markNotification(
      requireSellerId(orgId),
      requireSellerId(storeId),
      requireSellerId(notificationId),
      status,
      new Date().toISOString(),
    );
    return changes === 1;
  }

  /** Notification content is rebuilt from the trusted order, never stored. */
  async readNotificationOrder(
    orgId: unknown,
    storeId: unknown,
    orderId: unknown,
  ): Promise<SellerOrderDetail> {
    await this.ready();
    const order = await this.store.getOrder(
      requireSellerId(orgId),
      requireSellerId(storeId),
      requireSellerId(orderId),
    );
    if (!order) throw new SellerOrdersNotFoundError('order');
    return order;
  }
}

export function createSotuvchiOrdersService(
  db: D1Database,
  catalog: SotuvchiCatalogService,
  options: SotuvchiOrdersServiceOptions = {},
): SotuvchiOrdersService {
  return new SotuvchiOrdersService(db, catalog, options);
}

import type { OrgContext } from '../../../platform/contracts';
import {
  createWorkflowEngine,
  WorkflowAlreadyFinishedError,
  WorkflowTransitionNotAllowedError,
  WorkflowVersionConflictError,
  type WorkflowEngine,
  type WorkflowInstance,
} from '../../../platform/workflow';
import {
  CatalogNotFoundError,
  type CatalogSearchResult,
  type SotuvchiCatalogService,
  type StorefrontContext,
} from '../catalog';
import { ensureSotuvchiNotificationsSchema } from '../outbox/schema';
import {
  CheckoutAuthorizationError,
  CheckoutIdempotencyConflictError,
  CheckoutNotFoundError,
  CheckoutPersistenceError,
  CheckoutStateError,
  CheckoutValidationError,
  CheckoutVersionConflictError,
} from './errors';
import {
  createSotuvchiCheckoutStore,
  type CheckoutContactField,
  type CheckoutOperationInput,
  type CheckoutStore,
} from './store';
import type {
  BuyerOrderSummary,
  CheckoutBuyerSession,
  CheckoutOutcome,
  CheckoutProductSnapshot,
  CheckoutState,
  CheckoutWorkflowPayload,
  CheckoutWorkflowRef,
  SotuvchiCheckoutSnapshot,
  SotuvchiOrder,
} from './types';
import {
  normalizeBuyerAddress,
  normalizeBuyerName,
  normalizeBuyerPhone,
  normalizeCheckoutQuantity,
  requireCheckoutAvailability,
  requireCheckoutBotUsername,
  requireCheckoutId,
  requireCheckoutState,
  requireOrderNumber,
  validateCheckoutPayload,
} from './validation';
import { sotuvchiCheckoutWorkflow } from './workflow';

const ID_BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const ORDER_NUMBER_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_ORDER_NUMBER_ATTEMPTS = 5;

export interface SotuvchiCheckoutServiceOptions {
  orderIdGenerator?: () => string;
  itemIdGenerator?: () => string;
  orderNumberGenerator?: () => string;
  maxOrderNumberAttempts?: number;
}

function randomBase32(prefix: 'o' | 'i' | 'n'): string {
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

/** Opaque, human-readable and store-unique. Never derived from any row id. */
function randomOrderNumber(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let encoded = '';
  for (const byte of bytes) {
    encoded += ORDER_NUMBER_ALPHABET[byte & 31];
  }
  return `S-${encoded}`;
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

function productSnapshot(result: CatalogSearchResult): CheckoutProductSnapshot {
  if (result.product.availability === 'unavailable') {
    throw new CheckoutStateError('product_unavailable');
  }
  return {
    productId: result.product.id,
    name: result.product.name,
    priceMinor: result.product.priceMinor,
    availability: requireCheckoutAvailability(result.product.availability),
  };
}

export class SotuvchiCheckoutService {
  private readonly store: CheckoutStore;
  private readonly workflows: WorkflowEngine;
  private readonly orderIdGenerator: () => string;
  private readonly itemIdGenerator: () => string;
  private readonly orderNumberGenerator: () => string;
  private readonly maxNumberAttempts: number;

  constructor(
    private readonly db: D1Database,
    private readonly catalog: SotuvchiCatalogService,
    private readonly botUsername: string,
    options: SotuvchiCheckoutServiceOptions = {},
  ) {
    requireCheckoutBotUsername(botUsername);
    this.store = createSotuvchiCheckoutStore(db);
    this.workflows = createWorkflowEngine(db);
    this.orderIdGenerator = options.orderIdGenerator ?? (() => randomBase32('o'));
    this.itemIdGenerator = options.itemIdGenerator ?? (() => randomBase32('i'));
    this.orderNumberGenerator = options.orderNumberGenerator
      ?? randomOrderNumber;
    this.maxNumberAttempts = options.maxOrderNumberAttempts
      ?? MAX_ORDER_NUMBER_ATTEMPTS;
    if (
      !Number.isInteger(this.maxNumberAttempts)
      || this.maxNumberAttempts < 1
      || this.maxNumberAttempts > 10
    ) {
      throw new CheckoutValidationError('invalid_context');
    }
  }

  private async ready(): Promise<void> {
    // Bootstraps the checkout tables and the shared notification outbox that
    // placement writes in the same batch.
    await ensureSotuvchiNotificationsSchema(this.db);
  }

  /** Trusted authority chain: Telegram identity → storefront session → store. */
  private async trustedSession(org: OrgContext): Promise<CheckoutBuyerSession> {
    await this.ready();
    if (!org.actorId) throw new CheckoutAuthorizationError();
    const session = await this.store.findActiveBuyerSession(
      this.botUsername,
      org.actorId,
    );
    if (!session || session.orgId !== org.orgId) {
      throw new CheckoutAuthorizationError();
    }
    return session;
  }

  private storefront(session: CheckoutBuyerSession): StorefrontContext {
    return {
      orgId: session.orgId,
      storeId: session.storeId,
      agentId: 'sotuvchi',
      locale: session.locale,
    };
  }

  private async currentProduct(
    session: CheckoutBuyerSession,
    productId: string,
  ): Promise<CheckoutProductSnapshot> {
    try {
      return productSnapshot(
        await this.catalog.getPublishedProductResult(
          this.storefront(session),
          productId,
        ),
      );
    } catch (error) {
      if (error instanceof CatalogNotFoundError) {
        throw new CheckoutNotFoundError('product');
      }
      throw error;
    }
  }

  async listBuyerOrders(
    org: OrgContext,
    limit = 5,
  ): Promise<readonly BuyerOrderSummary[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
      throw new CheckoutValidationError('invalid_input');
    }
    const session = await this.trustedSession(org);
    return this.store.listBuyerOrders(
      session.orgId,
      session.storeId,
      session.id,
      limit,
    );
  }

  private async operation(
    org: OrgContext,
    name: string,
    value: unknown,
  ): Promise<CheckoutOperationInput> {
    return {
      idempotencyKey: requireCheckoutId(org.requestId),
      operation: name,
      fingerprint: await fingerprint({ name, value }),
      createdAt: new Date().toISOString(),
    };
  }

  private async replay(
    session: CheckoutBuyerSession,
    operation: CheckoutOperationInput,
  ): Promise<SotuvchiOrder | null> {
    const record = await this.store.getOperation(
      session.orgId,
      session.storeId,
      operation.idempotencyKey,
    );
    if (!record) return null;
    if (
      record.operation !== operation.operation
      || record.fingerprint !== operation.fingerprint
    ) {
      throw new CheckoutIdempotencyConflictError();
    }
    const order = await this.store.getOrder(session.orgId, record.targetId);
    if (!order) throw new CheckoutPersistenceError('corrupt_row');
    return order;
  }

  private requireInstance(
    instance: WorkflowInstance | null,
    order: SotuvchiOrder,
  ): { state: CheckoutState; version: number } {
    if (
      !instance
      || instance.workflowId !== sotuvchiCheckoutWorkflow.id
      || instance.workflowVersion !== sotuvchiCheckoutWorkflow.version
    ) {
      throw new CheckoutPersistenceError('corrupt_row');
    }
    const payload: CheckoutWorkflowPayload =
      validateCheckoutPayload(instance.payload);
    if (payload.orderId !== order.id) {
      throw new CheckoutPersistenceError('corrupt_row');
    }
    return {
      state: requireCheckoutState(instance.state),
      version: instance.version,
    };
  }

  private async snapshot(
    order: SotuvchiOrder,
    outcome: CheckoutOutcome,
    priceChanged = false,
  ): Promise<SotuvchiCheckoutSnapshot> {
    const instance = this.requireInstance(
      await this.workflows.get(order.orgId, order.workflowInstanceId),
      order,
    );
    return {
      order,
      state: instance.state,
      workflowInstanceId: order.workflowInstanceId,
      workflowVersion: instance.version,
      outcome,
      priceChanged,
    };
  }

  private async reload(
    session: CheckoutBuyerSession,
    orderId: string,
    outcome: CheckoutOutcome,
    priceChanged = false,
  ): Promise<SotuvchiCheckoutSnapshot> {
    const order = await this.store.getOrder(session.orgId, orderId);
    if (!order) throw new CheckoutPersistenceError('persistence_failed');
    return this.snapshot(order, outcome, priceChanged);
  }

  /**
   * Domain write first, workflow state second. A crash between the two leaves
   * the prompt on the previous step; re-sending the same value is a no-op.
   */
  private async advance(
    order: SotuvchiOrder,
    requestId: string,
    actionId: string,
    expectedVersion: number,
    target: CheckoutState,
  ): Promise<void> {
    try {
      await this.workflows.transition(
        order.orgId,
        sotuvchiCheckoutWorkflow,
        order.workflowInstanceId,
        {
          trigger: { on: 'action', actionId },
          idempotencyKey: `sotuvchi:checkout:${actionId}:${requestId}`,
          expectedVersion,
        },
      );
    } catch (error) {
      if (
        !(error instanceof WorkflowVersionConflictError)
        && !(error instanceof WorkflowAlreadyFinishedError)
        && !(error instanceof WorkflowTransitionNotAllowedError)
      ) {
        throw error;
      }
      const current = this.requireInstance(
        await this.workflows.get(order.orgId, order.workflowInstanceId),
        order,
      );
      if (current.state !== target) throw new CheckoutVersionConflictError();
    }
  }

  async getActiveCheckout(
    org: OrgContext,
  ): Promise<SotuvchiCheckoutSnapshot | null> {
    const session = await this.trustedSession(org);
    const order = await this.store.findOrderBySession(
      session.orgId,
      session.storeId,
      session.id,
      'draft',
    );
    return order ? this.snapshot(order, 'resumed') : null;
  }

  /**
   * Channel-facing lookup for the trusted active workflow reference. It never
   * accepts an org, store or workflow id from the buyer.
   */
  async getActiveWorkflowRef(
    identityId: unknown,
  ): Promise<CheckoutWorkflowRef | null> {
    await this.ready();
    const session = await this.store.findActiveBuyerSession(
      this.botUsername,
      requireCheckoutId(identityId),
    );
    if (!session) return null;
    const order = await this.store.findOrderBySession(
      session.orgId,
      session.storeId,
      session.id,
      'draft',
    );
    if (!order) return null;
    const instance = this.requireInstance(
      await this.workflows.get(order.orgId, order.workflowInstanceId),
      order,
    );
    return {
      orgId: order.orgId,
      instanceId: order.workflowInstanceId,
      expectedVersion: instance.version,
    };
  }

  async startCheckout(
    org: OrgContext,
    rawProductRef: unknown,
  ): Promise<SotuvchiCheckoutSnapshot> {
    const session = await this.trustedSession(org);
    const productRef = requireCheckoutId(rawProductRef);
    const product = await this.currentProduct(session, productRef);
    const operation = await this.operation(org, 'checkout.start', {
      productId: product.productId,
    });
    const replayed = await this.replay(session, operation);
    if (replayed) return this.snapshot(replayed, 'resumed');

    const existing = await this.store.findOrderBySession(
      session.orgId,
      session.storeId,
      session.id,
      'draft',
    );
    if (existing) {
      return this.snapshot(
        existing,
        existing.productId === product.productId ? 'resumed' : 'other_draft',
      );
    }

    const created = await this.workflows.create(
      session.orgId,
      sotuvchiCheckoutWorkflow,
      {
        idempotencyKey: `sotuvchi:checkout:${session.id}:${org.requestId}`,
        initialPayload: { orderId: this.orderIdGenerator() },
      },
    );
    const orderId = requireCheckoutId(
      validateCheckoutPayload(created.instance.payload).orderId,
    );
    const instanceId = created.instance.id;

    for (let attempt = 0; attempt < this.maxNumberAttempts; attempt += 1) {
      const orderNumber = requireOrderNumber(this.orderNumberGenerator());
      try {
        const changes = await this.store.createOrder(
          {
            orderId,
            itemId: requireCheckoutId(this.itemIdGenerator()),
            orgId: session.orgId,
            storeId: session.storeId,
            buyerSessionId: session.id,
            workflowInstanceId: instanceId,
            orderNumber,
            productId: product.productId,
            expectedPriceMinor: product.priceMinor,
            createdAt: new Date().toISOString(),
          },
          operation,
        );
        if (changes[0] === 1 && changes[1] === 1 && changes[2] === 1) {
          const order = await this.store.getOrder(session.orgId, orderId);
          if (!order) throw new CheckoutPersistenceError('persistence_failed');
          await this.advance(
            order,
            org.requestId,
            'begin',
            created.instance.version,
            'awaiting_quantity',
          );
          return this.reload(session, orderId, 'started');
        }
      } catch (error) {
        if (error instanceof CheckoutPersistenceError) throw error;
        const raced = await this.replay(session, operation)
          ?? await this.store.findOrderBySession(
            session.orgId,
            session.storeId,
            session.id,
            'draft',
          );
        if (raced) return this.snapshot(raced, 'resumed');
        continue;
      }
      const raced = await this.replay(session, operation);
      if (raced) return this.snapshot(raced, 'resumed');
      throw new CheckoutStateError('product_unavailable');
    }
    throw new CheckoutPersistenceError('number_collision');
  }

  /**
   * One buyer step. The trusted request key is checked before the FSM state, so
   * a repeated request replays its stored result instead of double-applying or
   * failing on the state it already advanced past.
   */
  private async applyStep(
    org: OrgContext,
    operationName: string,
    fingerprintValue: unknown,
    expected: CheckoutState,
    target: CheckoutState,
    actionId: string,
    mutate: (
      order: SotuvchiOrder,
      operation: CheckoutOperationInput,
    ) => Promise<readonly number[]>,
  ): Promise<SotuvchiCheckoutSnapshot> {
    const session = await this.trustedSession(org);
    const operation = await this.operation(org, operationName, fingerprintValue);
    const replayed = await this.replay(session, operation);
    if (replayed) return this.snapshot(replayed, 'updated');

    const order = await this.store.findOrderBySession(
      session.orgId,
      session.storeId,
      session.id,
      'draft',
    );
    if (!order) throw new CheckoutNotFoundError('order');
    const snapshot = await this.snapshot(order, 'updated');
    if (snapshot.state !== expected) {
      throw new CheckoutStateError('invalid_transition');
    }
    const changes = await mutate(order, operation);
    if (changes.some((value) => value !== 1)) {
      throw new CheckoutVersionConflictError();
    }
    await this.advance(
      order,
      org.requestId,
      actionId,
      snapshot.workflowVersion,
      target,
    );
    return this.reload(session, order.id, 'updated');
  }

  private applyContact(
    org: OrgContext,
    field: CheckoutContactField,
    state: CheckoutState,
    target: CheckoutState,
    actionId: string,
    value: string,
  ): Promise<SotuvchiCheckoutSnapshot> {
    // The fingerprint intentionally covers the step only: buyer name, phone and
    // address are never hashed into the operation log.
    return this.applyStep(
      org,
      `checkout.${field}`,
      { step: field, state },
      state,
      target,
      actionId,
      (order, operation) => this.store.setContactField(
        order,
        field,
        value,
        order.version,
        operation,
      ),
    );
  }

  async submitQuantity(
    org: OrgContext,
    rawQuantity: unknown,
  ): Promise<SotuvchiCheckoutSnapshot> {
    const quantity = normalizeCheckoutQuantity(rawQuantity);
    return this.applyStep(
      org,
      'checkout.quantity',
      { quantity },
      'awaiting_quantity',
      'awaiting_name',
      'submit-quantity',
      (order, operation) => this.store.setQuantity(
        order,
        quantity,
        order.version,
        operation,
      ),
    );
  }

  async submitName(
    org: OrgContext,
    rawName: unknown,
  ): Promise<SotuvchiCheckoutSnapshot> {
    return this.applyContact(
      org,
      'name',
      'awaiting_name',
      'awaiting_phone',
      'submit-name',
      normalizeBuyerName(rawName),
    );
  }

  async submitPhone(
    org: OrgContext,
    rawPhone: unknown,
  ): Promise<SotuvchiCheckoutSnapshot> {
    return this.applyContact(
      org,
      'phone',
      'awaiting_phone',
      'awaiting_address',
      'submit-phone',
      normalizeBuyerPhone(rawPhone),
    );
  }

  async submitAddress(
    org: OrgContext,
    rawAddress: unknown,
  ): Promise<SotuvchiCheckoutSnapshot> {
    return this.applyContact(
      org,
      'address',
      'awaiting_address',
      'awaiting_confirmation',
      'submit-address',
      normalizeBuyerAddress(rawAddress),
    );
  }

  async confirmCheckout(
    org: OrgContext,
  ): Promise<SotuvchiCheckoutSnapshot> {
    const session = await this.trustedSession(org);
    const record = await this.store.getOperation(
      session.orgId,
      session.storeId,
      requireCheckoutId(org.requestId),
    );
    if (
      record
      && (
        record.operation === 'checkout.confirm'
        || record.operation === 'checkout.price_refresh'
      )
    ) {
      const stored = await this.store.getOrder(session.orgId, record.targetId);
      if (!stored) throw new CheckoutPersistenceError('corrupt_row');
      return stored.status === 'placed'
        ? this.snapshot(stored, 'placed')
        : this.snapshot(stored, 'price_changed', true);
    }

    const draft = await this.store.findOrderBySession(
      session.orgId,
      session.storeId,
      session.id,
      'draft',
    );
    if (!draft) throw new CheckoutNotFoundError('order');
    const snapshot = await this.snapshot(draft, 'placed');
    if (snapshot.state !== 'awaiting_confirmation') {
      throw new CheckoutStateError('invalid_transition');
    }
    const order = snapshot.order;
    if (
      order.quantity === null
      || order.totalMinor === null
      || !order.buyerName
      || !order.buyerPhone
      || !order.buyerAddress
    ) {
      throw new CheckoutStateError('order_incomplete');
    }
    const product = await this.currentProduct(session, order.productId);

    // Never confirm silently at a stale price: refresh the snapshot and make
    // the buyer review and confirm again.
    if (product.priceMinor !== order.unitPriceMinor) {
      const refresh = await this.operation(org, 'checkout.price_refresh', {
        priceMinor: product.priceMinor,
      });
      const changes = await this.store.refreshPrice(
        order,
        product.priceMinor,
        order.version,
        refresh,
      );
      if (changes.some((value) => value !== 1)) {
        throw new CheckoutVersionConflictError();
      }
      return this.reload(session, order.id, 'price_changed', true);
    }

    const operation = await this.operation(org, 'checkout.confirm', {
      totalMinor: order.totalMinor,
    });
    const placedAt = new Date().toISOString();
    const changes = await this.store.placeOrder(
      order,
      order.version,
      placedAt,
      operation,
      {
        id: randomBase32('n'),
        idempotencyKey: `${operation.idempotencyKey}:placed`,
      },
    );
    if (changes.some((value) => value !== 1)) {
      throw new CheckoutStateError('product_unavailable');
    }
    const placed = await this.store.getOrder(session.orgId, order.id);
    if (!placed || placed.status !== 'placed') {
      throw new CheckoutPersistenceError('persistence_failed');
    }
    await this.advance(
      placed,
      org.requestId,
      'confirm',
      snapshot.workflowVersion,
      'completed',
    );
    return this.snapshot(placed, 'placed');
  }

  async cancelCheckout(
    org: OrgContext,
  ): Promise<SotuvchiCheckoutSnapshot | null> {
    const session = await this.trustedSession(org);
    const operation = await this.operation(org, 'checkout.cancel', {
      step: 'cancel',
    });
    const replayed = await this.replay(session, operation);
    if (replayed) return this.snapshot(replayed, 'cancelled');
    const order = await this.store.findOrderBySession(
      session.orgId,
      session.storeId,
      session.id,
      'draft',
    );
    if (!order) return null;
    const snapshot = await this.snapshot(order, 'cancelled');
    const changes = await this.store.cancelOrder(order, operation);
    if (changes.some((value) => value !== 1)) {
      throw new CheckoutVersionConflictError();
    }
    if (snapshot.state !== 'cancelled' && snapshot.state !== 'completed') {
      await this.advance(
        order,
        org.requestId,
        'cancel',
        snapshot.workflowVersion,
        'cancelled',
      );
    }
    const cancelled = await this.store.getOrder(session.orgId, order.id);
    if (!cancelled) throw new CheckoutPersistenceError('persistence_failed');
    return this.snapshot(cancelled, 'cancelled');
  }
}

export function createSotuvchiCheckoutService(
  db: D1Database,
  catalog: SotuvchiCatalogService,
  botUsername: string,
  options: SotuvchiCheckoutServiceOptions = {},
): SotuvchiCheckoutService {
  return new SotuvchiCheckoutService(db, catalog, botUsername, options);
}

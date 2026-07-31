import type { Locale } from '../../../platform/contracts';

export const CHECKOUT_ORDER_STATUSES = [
  'draft',
  'placed',
  'cancelled',
] as const;

export const CHECKOUT_STATES = [
  'idle',
  'awaiting_quantity',
  'awaiting_name',
  'awaiting_phone',
  'awaiting_address',
  'awaiting_confirmation',
  'completed',
  'cancelled',
] as const;

/** Availability values a buyer is allowed to order in P2.4. */
export const CHECKOUT_AVAILABILITIES = ['available', 'preorder'] as const;

export type CheckoutOrderStatus = (typeof CHECKOUT_ORDER_STATUSES)[number];
export type CheckoutState = (typeof CHECKOUT_STATES)[number];
export type CheckoutAvailability = (typeof CHECKOUT_AVAILABILITIES)[number];

/**
 * Flattened P2.4 order view. The single item is physically stored in
 * sotuvchi_order_items so P2.5 can grow into multi-item orders, but the P2.4
 * API never accepts or returns a second item.
 */
export interface SotuvchiOrder {
  id: string;
  orderNumber: string;

  orgId: string;
  storeId: string;
  buyerSessionId: string;
  workflowInstanceId: string;

  status: CheckoutOrderStatus;

  productId: string;
  productNameSnapshot: string;
  unitPriceMinor: number;
  currency: 'UZS';
  availabilitySnapshot: CheckoutAvailability;
  quantity: number | null;
  totalMinor: number | null;

  buyerName: string | null;
  buyerPhone: string | null;
  buyerAddress: string | null;

  createdAt: string;
  updatedAt: string;
  placedAt: string | null;

  version: number;
}

export interface CheckoutIdentityContext {
  identityId: string;
  botUsername: string;
  requestId: string;
  locale: Locale;
}

export interface CheckoutBuyerSession {
  id: string;
  orgId: string;
  storeId: string;
  locale: Locale;
}

export interface CheckoutProductSnapshot {
  productId: string;
  name: string;
  priceMinor: number;
  availability: CheckoutAvailability;
}

export type CheckoutOutcome =
  | 'started'
  | 'resumed'
  | 'other_draft'
  | 'updated'
  | 'placed'
  | 'price_changed'
  | 'cancelled';

export interface SotuvchiCheckoutSnapshot {
  order: SotuvchiOrder;
  state: CheckoutState;
  workflowInstanceId: string;
  /** Optimistic version of the persistent workflow instance. */
  workflowVersion: number;
  outcome: CheckoutOutcome;
  /** True only when the buyer must review a refreshed catalog price again. */
  priceChanged: boolean;
}

export interface CheckoutWorkflowRef {
  orgId: string;
  instanceId: string;
  expectedVersion: number;
}

export interface CheckoutWorkflowPayload {
  orderId: string;
}

export type BuyerOrderStatus =
  | 'placed'
  | 'confirmed'
  | 'done'
  | 'cancelled';

export interface BuyerOrderSummary {
  orderNumber: string;
  productName: string;
  quantity: number;
  totalMinor: number;
  status: BuyerOrderStatus;
  placedAt: string;
}

import type { Locale } from '../../../platform/contracts';
import type { CheckoutAvailability } from '../checkout';
import type { InventorySnapshot } from '../inventory';

/** Seller-visible lifecycle derived from (status, fulfillment_status). */
export const SELLER_ORDER_STATUSES = [
  'placed',
  'confirmed',
  'cancelled',
  'done',
] as const;

export const SELLER_ORDER_TRANSITIONS = [
  'confirm',
  'cancel',
  'done',
] as const;

export const ORDER_FULFILLMENT_STATUSES = [
  'none',
  'confirmed',
  'done',
] as const;

export const NOTIFICATION_AUDIENCES = ['seller', 'buyer'] as const;

export const NOTIFICATION_TYPES = [
  'order_placed',
  'order_confirmed',
  'order_cancelled',
  'order_done',
] as const;

export const NOTIFICATION_STATUSES = [
  'pending',
  'sending',
  'sent',
  'failed',
] as const;

export type SellerOrderStatus = (typeof SELLER_ORDER_STATUSES)[number];
export type SellerOrderTransition = (typeof SELLER_ORDER_TRANSITIONS)[number];
export type OrderFulfillmentStatus =
  (typeof ORDER_FULFILLMENT_STATUSES)[number];
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Seller list row. Deliberately free of buyer name, phone and address. */
export interface SellerOrderSummary {
  orderId: string;
  orderNumber: string;
  status: SellerOrderStatus;
  productId: string;
  productName: string;
  quantity: number;
  totalMinor: number;
  version: number;
  placedAt: string;
}

/**
 * Seller detail view. The seller is the merchant fulfilling the order, so the
 * contact fields are exposed here — and only here — after owner authorization.
 */
export interface SellerOrderDetail extends SellerOrderSummary {
  unitPriceMinor: number;
  availability: CheckoutAvailability;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerComment: string | null;
  /** Present only when the store keeps a balance row for this product. */
  inventoryOnHand: number | null;
  /** True when confirming this order must decrement stock. */
  inventoryRequired: boolean;
}

export type SellerTransitionOutcome = 'applied' | 'unchanged';

export interface SellerOrderTransitionResult {
  order: SellerOrderDetail;
  transition: SellerOrderTransition;
  outcome: SellerTransitionOutcome;
  /** Absolute value of the stock decrement; 0 for preorder and cancel. */
  stockDelta: number;
  inventory: InventorySnapshot | null;
}

export interface SellerContext {
  identityId: string;
  orgId: string;
  storeId: string;
  requestId: string;
  locale: Locale;
}

export interface SotuvchiNotification {
  id: string;
  orgId: string;
  storeId: string;
  orderId: string;
  audience: NotificationAudience;
  type: NotificationType;
  status: NotificationStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

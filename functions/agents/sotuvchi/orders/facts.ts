import type { FactValue, Locale } from '../../../platform/contracts';
import { formatBuyerAvailability, formatBuyerPrice } from '../buyer';
import type { InventorySnapshot, SetInventoryResult } from '../inventory';
import type {
  NotificationType,
  SellerOrderDetail,
  SellerOrderStatus,
  SellerOrderSummary,
  SellerOrderTransitionResult,
} from './types';

export type OrdersFactValues = Readonly<Record<string, FactValue>>;

export const SELLER_VIEWS = [
  'orders',
  'order',
  'inventory',
  'inventory_item',
  'transition',
  'notification',
] as const;

export type SellerView = (typeof SELLER_VIEWS)[number];

const STATUS_LABELS = {
  ru: {
    placed: 'Новый',
    confirmed: 'Подтверждён',
    cancelled: 'Отменён',
    done: 'Выполнен',
  },
  uz: {
    placed: 'Yangi',
    confirmed: 'Tasdiqlangan',
    cancelled: 'Bekor qilingan',
    done: 'Bajarilgan',
  },
} as const;

const NOTIFICATION_LABELS = {
  ru: {
    order_placed: 'Новый заказ',
    order_confirmed: 'Заказ подтверждён',
    order_cancelled: 'Заказ отменён',
    order_done: 'Заказ выполнен',
  },
  uz: {
    order_placed: 'Yangi buyurtma',
    order_confirmed: 'Buyurtma tasdiqlandi',
    order_cancelled: 'Buyurtma bekor qilindi',
    order_done: 'Buyurtma bajarildi',
  },
} as const;

export function sellerStatusLabel(
  status: SellerOrderStatus,
  locale: Locale,
): string {
  return STATUS_LABELS[locale][status];
}

export function notificationLabel(
  type: NotificationType,
  locale: Locale,
): string {
  return NOTIFICATION_LABELS[locale][type];
}

function summaryValues(
  prefix: string,
  order: SellerOrderSummary,
  locale: Locale,
): Record<string, FactValue> {
  return {
    [`${prefix}.id`]: order.orderId,
    [`${prefix}.number`]: order.orderNumber,
    [`${prefix}.status`]: order.status,
    [`${prefix}.status_display`]: sellerStatusLabel(order.status, locale),
    [`${prefix}.product_name`]: order.productName,
    [`${prefix}.quantity`]: order.quantity,
    [`${prefix}.total_minor`]: order.totalMinor,
    [`${prefix}.total_display`]: formatBuyerPrice(order.totalMinor, locale),
    [`${prefix}.version`]: order.version,
  };
}

export function projectSellerOrdersFacts(
  orders: readonly SellerOrderSummary[],
  locale: Locale,
): OrdersFactValues {
  const values: Record<string, FactValue> = {
    'seller.view': 'orders',
    'seller.orders.count': orders.length,
  };
  orders.forEach((order, index) => {
    Object.assign(values, summaryValues(`seller.orders.${index}`, order, locale));
  });
  return values;
}

/**
 * Detail projection. The seller fulfils the order, so the contact fields are
 * exposed here and only here; the list projection stays PII-free.
 */
export function projectSellerOrderFacts(
  order: SellerOrderDetail,
  locale: Locale,
): OrdersFactValues {
  return {
    'seller.view': 'order',
    ...summaryValues('seller.order', order, locale),
    'seller.order.unit_price_minor': order.unitPriceMinor,
    'seller.order.unit_price_display': formatBuyerPrice(
      order.unitPriceMinor,
      locale,
    ),
    'seller.order.availability': order.availability,
    'seller.order.availability_display': formatBuyerAvailability(
      order.availability,
      locale,
    ),
    'seller.order.customer_name': order.customerName,
    'seller.order.customer_phone': order.customerPhone,
    'seller.order.customer_address': order.customerAddress,
    'seller.order.inventory_required': order.inventoryRequired,
    'seller.order.inventory_known': order.inventoryOnHand !== null,
    ...(order.inventoryOnHand === null
      ? {}
      : { 'seller.order.inventory_on_hand': order.inventoryOnHand }),
  };
}

function inventoryValues(
  prefix: string,
  snapshot: InventorySnapshot,
): Record<string, FactValue> {
  return {
    [`${prefix}.product_id`]: snapshot.productId,
    [`${prefix}.product_name`]: snapshot.productName,
    [`${prefix}.on_hand`]: snapshot.onHand,
    [`${prefix}.version`]: snapshot.version,
  };
}

export function projectSellerInventoryFacts(
  items: readonly InventorySnapshot[],
): OrdersFactValues {
  const values: Record<string, FactValue> = {
    'seller.view': 'inventory',
    'seller.inventory.count': items.length,
  };
  items.forEach((item, index) => {
    Object.assign(values, inventoryValues(`seller.inventory.${index}`, item));
  });
  return values;
}

export function projectSellerInventoryItemFacts(
  result: SetInventoryResult,
): OrdersFactValues {
  return {
    'seller.view': 'inventory_item',
    'seller.inventory.outcome': result.outcome,
    'seller.inventory.move_type': result.moveType,
    ...inventoryValues('seller.inventory.item', result.snapshot),
  };
}

export function projectSellerTransitionFacts(
  result: SellerOrderTransitionResult,
  locale: Locale,
): OrdersFactValues {
  const values: Record<string, FactValue> = {
    'seller.view': 'transition',
    'seller.transition': result.transition,
    'seller.transition.outcome': result.outcome,
    'seller.transition.stock_delta': result.stockDelta,
    ...summaryValues('seller.order', result.order, locale),
  };
  if (result.inventory) {
    Object.assign(
      values,
      inventoryValues('seller.inventory.item', result.inventory),
    );
  }
  values['seller.inventory.known'] = result.inventory !== null;
  return values;
}

/**
 * Notification content is rebuilt from the trusted order at render time; the
 * durable intent stores no payload, so no PII ever reaches the outbox row.
 */
export function projectNotificationFacts(
  type: NotificationType,
  order: SellerOrderDetail,
  locale: Locale,
): OrdersFactValues {
  return {
    'seller.view': 'notification',
    'seller.notification.type': type,
    'seller.notification.title': notificationLabel(type, locale),
    ...summaryValues('seller.order', order, locale),
  };
}

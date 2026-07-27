import type { FactValue, Locale } from '../../../platform/contracts';
import { formatBuyerAvailability, formatBuyerPrice } from '../buyer';
import type { SotuvchiCheckoutSnapshot } from './types';
import {
  CHECKOUT_LIMITS,
  CHECKOUT_PHONE_PREFIX,
  maskBuyerPhone,
} from './validation';

export type CheckoutFactValues = Readonly<Record<string, FactValue>>;

export const CHECKOUT_VIEWS = [
  'quantity',
  'name',
  'phone',
  'address',
  'review',
  'completed',
  'cancelled',
  'conflict',
] as const;

export type CheckoutView = (typeof CHECKOUT_VIEWS)[number];

export function checkoutView(
  snapshot: SotuvchiCheckoutSnapshot,
): CheckoutView {
  if (snapshot.outcome === 'other_draft') return 'conflict';
  switch (snapshot.state) {
    case 'awaiting_quantity':
    case 'idle':
      return 'quantity';
    case 'awaiting_name':
      return 'name';
    case 'awaiting_phone':
      return 'phone';
    case 'awaiting_address':
      return 'address';
    case 'awaiting_confirmation':
      return 'review';
    case 'completed':
      return 'completed';
    default:
      return 'cancelled';
  }
}

/**
 * Scalar-only buyer-facing projection. Raw order rows, org/store ids, buyer
 * name and delivery address never reach a renderer; the phone appears masked.
 */
export function projectCheckoutFacts(
  snapshot: SotuvchiCheckoutSnapshot,
  locale: Locale,
  options: { rejected?: boolean } = {},
): CheckoutFactValues {
  const { order } = snapshot;
  const values: Record<string, FactValue> = {
    'checkout.view': checkoutView(snapshot),
    'checkout.state': snapshot.state,
    'checkout.price_changed': snapshot.priceChanged,
    'checkout.input.rejected': options.rejected === true,
    'checkout.product.name': order.productNameSnapshot,
    'checkout.product.price_minor': order.unitPriceMinor,
    'checkout.product.price_display': formatBuyerPrice(
      order.unitPriceMinor,
      locale,
    ),
    'checkout.product.availability': order.availabilitySnapshot,
    'checkout.product.availability_display': formatBuyerAvailability(
      order.availabilitySnapshot,
      locale,
    ),
    'checkout.quantity.min': CHECKOUT_LIMITS.quantityMin,
    'checkout.quantity.max': CHECKOUT_LIMITS.quantityMax,
    'checkout.customer.phone_prefix': CHECKOUT_PHONE_PREFIX,
    'checkout.customer.name_present': order.buyerName !== null,
    'checkout.customer.address_present': order.buyerAddress !== null,
    'checkout.order.number': order.orderNumber,
    'checkout.order.status': order.status,
  };
  if (order.quantity !== null) {
    values['checkout.quantity'] = order.quantity;
  }
  if (order.totalMinor !== null) {
    values['checkout.total_minor'] = order.totalMinor;
    values['checkout.total_display'] = formatBuyerPrice(
      order.totalMinor,
      locale,
    );
  }
  if (order.buyerPhone !== null) {
    values['checkout.customer.phone_masked'] = maskBuyerPhone(order.buyerPhone);
  }
  return values;
}

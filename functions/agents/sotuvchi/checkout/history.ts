import type {
  FactSheet,
  FactValue,
  Locale,
  Outbound,
  RuntimeExactClaim,
  RuntimeResponseDraft,
} from '../../../platform/contracts';
import {
  BUYER_COPY,
  recoveryChoices,
} from '../experience';
import { formatBuyerPrice } from '../buyer';
import { CheckoutValidationError } from './errors';
import type { BuyerOrderStatus, BuyerOrderSummary } from './types';

export type BuyerOrderHistoryFacts = Readonly<Record<string, FactValue>>;

const STATUS_COPY: Readonly<Record<Locale, Record<BuyerOrderStatus, string>>> = {
  ru: {
    placed: 'Принят',
    confirmed: 'Подтверждён продавцом',
    done: 'Выполнен',
    cancelled: 'Отменён',
  },
  uz: {
    placed: 'Qabul qilingan',
    confirmed: 'Sotuvchi tasdiqlagan',
    done: 'Bajarilgan',
    cancelled: 'Bekor qilingan',
  },
};

export function projectBuyerOrderHistoryFacts(
  orders: readonly BuyerOrderSummary[],
  locale: Locale,
): BuyerOrderHistoryFacts {
  if (orders.length > 5) throw new CheckoutValidationError('invalid_input');
  const values: Record<string, FactValue> = {
    'buyer.orders.count': orders.length,
  };
  orders.forEach((order, index) => {
    const prefix = `buyer.orders.${index}`;
    values[`${prefix}.number`] = order.orderNumber;
    values[`${prefix}.title_display`] =
      `${BUYER_COPY[locale].order} ${order.orderNumber}`;
    values[`${prefix}.product_name`] = order.productName;
    values[`${prefix}.quantity`] = order.quantity;
    values[`${prefix}.quantity_display`] = String(order.quantity);
    values[`${prefix}.total_minor`] = order.totalMinor;
    values[`${prefix}.total_display`] =
      formatBuyerPrice(order.totalMinor, locale);
    values[`${prefix}.status`] = order.status;
    values[`${prefix}.status_display`] = STATUS_COPY[locale][order.status];
    values[`${prefix}.placed_date`] = order.placedAt.slice(0, 10);
  });
  return values;
}

function claim(
  claims: RuntimeExactClaim[],
  facts: FactSheet,
  key: string,
  type: 'string' | 'number',
): FactValue {
  const value = facts.values[key];
  if (typeof value !== type) {
    throw new CheckoutValidationError('invalid_input');
  }
  claims.push({ key, value });
  return value;
}

export function composeBuyerOrderHistoryResponse(
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  const count = facts.values['buyer.orders.count'];
  if (!Number.isInteger(count) || Number(count) < 0 || Number(count) > 5) {
    throw new CheckoutValidationError('invalid_input');
  }
  const copy = BUYER_COPY[locale];
  if (count === 0) {
    return {
      messages: [{
        text: copy.orderHistoryEmpty,
        choices: recoveryChoices(locale),
      }],
      claims: [],
    };
  }

  const claims: RuntimeExactClaim[] = [];
  const messages: Outbound[] = [];
  for (let index = 0; index < Number(count); index += 1) {
    const prefix = `buyer.orders.${index}`;
    const number = claim(claims, facts, `${prefix}.number`, 'string');
    const title = claim(
      claims,
      facts,
      `${prefix}.title_display`,
      'string',
    );
    const product = claim(
      claims,
      facts,
      `${prefix}.product_name`,
      'string',
    );
    const quantity = claim(claims, facts, `${prefix}.quantity`, 'number');
    const quantityDisplay = claim(
      claims,
      facts,
      `${prefix}.quantity_display`,
      'string',
    );
    const total = claim(
      claims,
      facts,
      `${prefix}.total_display`,
      'string',
    );
    claim(claims, facts, `${prefix}.total_minor`, 'number');
    const status = claim(
      claims,
      facts,
      `${prefix}.status_display`,
      'string',
    );
    const date = claim(
      claims,
      facts,
      `${prefix}.placed_date`,
      'string',
    );
    messages.push({
      text: index === 0 ? copy.orderHistory : '',
      card: {
        ref: String(number),
        title: String(title),
        fields: [
          { label: copy.product, value: String(product) },
          { label: copy.quantity, value: String(quantityDisplay) },
          { label: copy.total, value: String(total) },
          { label: copy.status, value: String(status) },
          { label: copy.date, value: String(date) },
        ],
      },
    });
  }
  const last = messages[messages.length - 1];
  messages[messages.length - 1] = {
    ...last,
    choices: recoveryChoices(locale),
  };
  return { messages, claims };
}

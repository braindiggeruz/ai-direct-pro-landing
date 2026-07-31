import type {
  FactSheet,
  Locale,
  OutboundChoice,
  RuntimeExactClaim,
  RuntimeResponseDraft,
} from '../../../platform/contracts';
import { SellerOrdersValidationError } from './errors';
import { SELLER_VIEWS, type SellerView } from './facts';

export const SELLER_ORDERS_ACTION = 'seller-orders';
export const SELLER_INVENTORY_ACTION = 'seller-inventory';
export const SELLER_ORDER_ACTION_PREFIX = 'seller-order.';
export const SELLER_CONFIRM_ACTION_PREFIX = 'seller-order-confirm.';
export const SELLER_CANCEL_ACTION_PREFIX = 'seller-order-cancel.';
export const SELLER_DONE_ACTION_PREFIX = 'seller-order-done.';
export const SELLER_CONTACT_ACTION_PREFIX = 'seller-order-contact.';
export const SELLER_VIEW_ACTION_PREFIX = 'seller-order-view.';

const VIEWS = new Set<string>(SELLER_VIEWS);

const COPY = {
  ru: {
    ordersTitle: 'Заказы магазина.',
    ordersEmpty: 'Новых заказов нет.',
    orderTitle: 'Заказ',
    product: 'Товар',
    quantity: 'Количество',
    total: 'Итого',
    status: 'Статус',
    time: 'Время',
    availability: 'Наличие',
    customer: 'Покупатель',
    phone: 'Телефон',
    address: 'Адрес',
    comment: 'Комментарий',
    commentMissing: 'не указан',
    stock: 'Остаток',
    stockUnknown: 'Остаток не задан.',
    stockNeeded: 'Для подтверждения нужен остаток.',
    inventoryTitle: 'Остатки товаров.',
    inventoryEmpty: 'Остатки ещё не заданы.',
    inventorySet: 'Остаток обновлён.',
    inventoryUnchanged: 'Остаток без изменений.',
    inventoryHint:
      'Отправьте: Остаток: идентификатор | количество',
    written: 'Списано',
    unchanged: 'Изменений нет.',
    orders: 'Заказы',
    inventory: 'Остатки',
    confirm: 'Подтвердить',
    cancel: 'Нет в наличии',
    done: 'Выполнен',
    contact: 'Связаться',
    handoff: 'Передать оператору',
    view: 'Посмотреть заказ',
    back: 'Заказы',
    noPayment: 'Оплата через бота не проводится.',
  },
  uz: {
    ordersTitle: 'Do‘kon buyurtmalari.',
    ordersEmpty: 'Yangi buyurtma yo‘q.',
    orderTitle: 'Buyurtma',
    product: 'Mahsulot',
    quantity: 'Miqdor',
    total: 'Jami',
    status: 'Holat',
    time: 'Vaqt',
    availability: 'Mavjudlik',
    customer: 'Xaridor',
    phone: 'Telefon',
    address: 'Manzil',
    comment: 'Izoh',
    commentMissing: 'kiritilmagan',
    stock: 'Qoldiq',
    stockUnknown: 'Qoldiq kiritilmagan.',
    stockNeeded: 'Tasdiqlash uchun qoldiq kerak.',
    inventoryTitle: 'Mahsulot qoldiqlari.',
    inventoryEmpty: 'Qoldiqlar hali kiritilmagan.',
    inventorySet: 'Qoldiq yangilandi.',
    inventoryUnchanged: 'Qoldiq o‘zgarmadi.',
    inventoryHint:
      'Yuboring: Qoldiq: identifikator | miqdor',
    written: 'Yechildi',
    unchanged: 'O‘zgarish yo‘q.',
    orders: 'Buyurtmalar',
    inventory: 'Qoldiqlar',
    confirm: 'Tasdiqlash',
    cancel: 'Mavjud emas',
    done: 'Bajarildi',
    contact: 'Bog‘lanish',
    handoff: 'Operatorga o‘tkazish',
    view: 'Buyurtmani ko‘rish',
    back: 'Buyurtmalar',
    noPayment: 'Bot orqali to‘lov amalga oshirilmaydi.',
  },
} as const;

function claimText(
  claims: RuntimeExactClaim[],
  facts: FactSheet,
  key: string,
): string {
  const value = facts.values[key];
  if (typeof value !== 'string') {
    throw new SellerOrdersValidationError('invalid_input');
  }
  claims.push({ key, value });
  return value;
}

function claimNumber(
  claims: RuntimeExactClaim[],
  facts: FactSheet,
  key: string,
): number {
  const value = facts.values[key];
  if (typeof value !== 'number') {
    throw new SellerOrdersValidationError('invalid_input');
  }
  claims.push({ key, value });
  return value;
}

function readBoolean(facts: FactSheet, key: string): boolean {
  const value = facts.values[key];
  if (typeof value !== 'boolean') {
    throw new SellerOrdersValidationError('invalid_input');
  }
  return value;
}

function readString(facts: FactSheet, key: string): string {
  const value = facts.values[key];
  if (typeof value !== 'string') {
    throw new SellerOrdersValidationError('invalid_input');
  }
  return value;
}

function readView(facts: FactSheet): SellerView {
  const value = facts.values['seller.view'];
  if (typeof value !== 'string' || !VIEWS.has(value)) {
    throw new SellerOrdersValidationError('invalid_input');
  }
  return value as SellerView;
}

function draft(
  text: string,
  claims: readonly RuntimeExactClaim[],
  choices: readonly OutboundChoice[],
): RuntimeResponseDraft {
  return {
    messages: [{
      text,
      ...(choices.length > 0 ? { choices } : {}),
    }],
    claims,
  };
}

function orderLine(
  claims: RuntimeExactClaim[],
  facts: FactSheet,
  prefix: string,
  locale: Locale,
): { text: string; choice: OutboundChoice } {
  const copy = COPY[locale];
  const number = claimText(claims, facts, `${prefix}.number`);
  const status = claimText(claims, facts, `${prefix}.status_display`);
  const name = claimText(claims, facts, `${prefix}.product_name`);
  const quantity = claimNumber(claims, facts, `${prefix}.quantity`);
  const total = claimText(claims, facts, `${prefix}.total_display`);
  return {
    text:
      `${number} — ${status} — ${name} — ${copy.quantity}: ${quantity}`
      + ` — ${copy.total}: ${total}`,
    choice: {
      id: `${SELLER_ORDER_ACTION_PREFIX}${readString(facts, `${prefix}.id`)}`,
      label: `${number}`,
    },
  };
}

function transitionChoices(
  facts: FactSheet,
  locale: Locale,
  orderId: string,
): OutboundChoice[] {
  const copy = COPY[locale];
  const status = readString(facts, 'seller.order.status');
  const choices: OutboundChoice[] = [];
  if (status === 'placed') {
    choices.push(
      { id: `${SELLER_CONFIRM_ACTION_PREFIX}${orderId}`, label: copy.confirm },
      { id: `${SELLER_CANCEL_ACTION_PREFIX}${orderId}`, label: copy.cancel },
    );
  }
  if (status === 'confirmed') {
    choices.push({
      id: `${SELLER_DONE_ACTION_PREFIX}${orderId}`,
      label: copy.done,
    });
  }
  choices.push(
    {
      id: `${SELLER_CONTACT_ACTION_PREFIX}${orderId}`,
      label: copy.contact,
    },
    { id: 'seller-handoffs', label: copy.handoff },
  );
  choices.push({ id: SELLER_ORDERS_ACTION, label: copy.back });
  return choices;
}

function notificationChoices(
  facts: FactSheet,
  locale: Locale,
  orderId: string,
): OutboundChoice[] {
  const copy = COPY[locale];
  const choices = transitionChoices(facts, locale, orderId)
    .filter((choice) => choice.id !== SELLER_ORDERS_ACTION);
  choices.push({
    id: `${SELLER_VIEW_ACTION_PREFIX}${orderId}`,
    label: copy.view,
  });
  return choices;
}

/**
 * Every seller-facing message is assembled from scalar Facts only: no raw row,
 * no catalog lookup and no free text ever reaches the renderer.
 */
export function composeSellerOrdersResponse(
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  const copy = COPY[locale];
  const view = readView(facts);
  const claims: RuntimeExactClaim[] = [];

  if (view === 'orders') {
    const count = claimNumber(claims, facts, 'seller.orders.count');
    if (count === 0) {
      return draft(
        `${copy.ordersTitle}\n${copy.ordersEmpty}`,
        claims,
        [{ id: SELLER_INVENTORY_ACTION, label: copy.inventory }],
      );
    }
    const lines: string[] = [];
    const choices: OutboundChoice[] = [];
    for (let index = 0; index < count; index += 1) {
      const line = orderLine(claims, facts, `seller.orders.${index}`, locale);
      lines.push(line.text);
      choices.push(line.choice);
    }
    choices.push({ id: SELLER_INVENTORY_ACTION, label: copy.inventory });
    return draft(
      `${copy.ordersTitle}\n${lines.join('\n')}`,
      claims,
      choices,
    );
  }

  if (view === 'order' || view === 'transition' || view === 'notification') {
    const number = claimText(claims, facts, 'seller.order.number');
    const status = claimText(claims, facts, 'seller.order.status_display');
    const name = claimText(claims, facts, 'seller.order.product_name');
    const quantity = claimNumber(claims, facts, 'seller.order.quantity');
    const total = claimText(claims, facts, 'seller.order.total_display');
    const time = claimText(claims, facts, 'seller.order.placed_at_display');
    const head = `${copy.orderTitle} ${number}\n${copy.status}: ${status}\n`
      + `${copy.product}: ${name}\n${copy.quantity}: ${quantity}\n`
      + `${copy.total}: ${total}\n${copy.time}: ${time}`;

    if (view === 'notification') {
      const title = claimText(claims, facts, 'seller.notification.title');
      const comment = readBoolean(
        facts,
        'seller.order.customer_comment_present',
      )
        ? claimText(claims, facts, 'seller.order.customer_comment')
        : copy.commentMissing;
      return draft(
        `${title}\n${head}\n${copy.comment}: ${comment}`,
        claims,
        notificationChoices(
          facts,
          locale,
          readString(facts, 'seller.order.id'),
        ),
      );
    }

    if (view === 'transition') {
      const outcome = readString(facts, 'seller.transition.outcome');
      const key = 'seller.transition.stock_delta';
      const delta = claimNumber(claims, facts, key);
      const parts = [head];
      if (delta > 0) parts.push(`${copy.written}: ${delta}`);
      if (readBoolean(facts, 'seller.inventory.known')) {
        const stock = 'seller.inventory.item.on_hand';
        parts.push(`${copy.stock}: ${claimNumber(claims, facts, stock)}`);
      }
      if (outcome === 'unchanged') parts.push(copy.unchanged);
      return draft(
        parts.join('\n'),
        claims,
        transitionChoices(facts, locale, readString(facts, 'seller.order.id')),
      );
    }

    const availabilityKey = 'seller.order.availability_display';
    const availability = claimText(claims, facts, availabilityKey);
    const customer = claimText(claims, facts, 'seller.order.customer_name');
    const phone = claimText(claims, facts, 'seller.order.customer_phone');
    const address = claimText(claims, facts, 'seller.order.customer_address');
    const comment = readBoolean(
      facts,
      'seller.order.customer_comment_present',
    )
      ? claimText(claims, facts, 'seller.order.customer_comment')
      : copy.commentMissing;
    const parts = [
      head,
      `${copy.availability}: ${availability}`,
      `${copy.customer}: ${customer}`,
      `${copy.phone}: ${phone}`,
      `${copy.address}: ${address}`,
      `${copy.comment}: ${comment}`,
    ];
    if (readBoolean(facts, 'seller.order.inventory_known')) {
      const stock = 'seller.order.inventory_on_hand';
      parts.push(`${copy.stock}: ${claimNumber(claims, facts, stock)}`);
    } else if (readBoolean(facts, 'seller.order.inventory_required')) {
      parts.push(copy.stockNeeded);
    }
    parts.push(copy.noPayment);
    return draft(
      parts.join('\n'),
      claims,
      transitionChoices(facts, locale, readString(facts, 'seller.order.id')),
    );
  }

  if (view === 'inventory') {
    const count = claimNumber(claims, facts, 'seller.inventory.count');
    if (count === 0) {
      return draft(
        `${copy.inventoryTitle}\n${copy.inventoryEmpty}\n${copy.inventoryHint}`,
        claims,
        [{ id: SELLER_ORDERS_ACTION, label: copy.orders }],
      );
    }
    const lines: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const prefix = `seller.inventory.${index}`;
      const name = claimText(claims, facts, `${prefix}.product_name`);
      const onHand = claimNumber(claims, facts, `${prefix}.on_hand`);
      lines.push(`${name} — ${copy.stock}: ${onHand}`);
    }
    return draft(
      `${copy.inventoryTitle}\n${lines.join('\n')}\n${copy.inventoryHint}`,
      claims,
      [{ id: SELLER_ORDERS_ACTION, label: copy.orders }],
    );
  }

  const outcome = readString(facts, 'seller.inventory.outcome');
  const nameKey = 'seller.inventory.item.product_name';
  const name = claimText(claims, facts, nameKey);
  const onHand = claimNumber(claims, facts, 'seller.inventory.item.on_hand');
  return draft(
    `${outcome === 'applied' ? copy.inventorySet : copy.inventoryUnchanged}\n`
    + `${name} — ${copy.stock}: ${onHand}`,
    claims,
    [
      { id: SELLER_INVENTORY_ACTION, label: copy.inventory },
      { id: SELLER_ORDERS_ACTION, label: copy.orders },
    ],
  );
}

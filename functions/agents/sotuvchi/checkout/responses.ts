import type {
  FactSheet,
  FactValue,
  Locale,
  OutboundChoice,
  RuntimeExactClaim,
  RuntimeResponseDraft,
} from '../../../platform/contracts';
import { CheckoutValidationError } from './errors';
import { CHECKOUT_VIEWS, type CheckoutView } from './facts';

export const CHECKOUT_START_ACTION_PREFIX = 'buyer-checkout.';
export const CHECKOUT_CONFIRM_ACTION = 'buyer-checkout-confirm';
export const CHECKOUT_CANCEL_ACTION = 'buyer-checkout-cancel';
export const CHECKOUT_RESUME_ACTION = 'buyer-checkout-resume';

const VIEWS = new Set<string>(CHECKOUT_VIEWS);

const COPY = {
  ru: {
    rejected: 'Значение не принято. ',
    started: 'Оформление заказа.',
    price: 'Цена',
    quantityPrompt: 'Укажите количество: целое число от',
    quantityTo: 'до',
    quantitySuffix: '',
    namePrompt: 'Как вас зовут? Отправьте имя покупателя.',
    phonePrompt: 'Отправьте номер телефона. Формат:',
    phoneDigits: 'и девять цифр.',
    addressPrompt: 'Укажите адрес доставки одним сообщением.',
    review: 'Проверьте заказ.',
    priceChanged: 'Цена изменилась. Подтвердите заказ ещё раз.',
    product: 'Товар',
    quantity: 'Количество',
    total: 'Итого',
    phone: 'Телефон',
    address: 'Адрес',
    addressGiven: 'указан',
    status: 'Статус',
    request: 'Это заявка, не оплата.',
    placed: 'Заказ принят. Номер:',
    placedNote: 'Это заявка. Оплата не производилась, продавец свяжется с вами.',
    cancelled: 'Оформление отменено.',
    conflict: 'У вас уже есть незавершённый заказ:',
    conflictNote: 'Продолжите оформление или отмените его.',
    confirm: 'Подтвердить',
    cancel: 'Отменить',
    resume: 'Продолжить',
  },
  uz: {
    rejected: 'Qiymat qabul qilinmadi. ',
    started: 'Buyurtmani rasmiylashtirish.',
    price: 'Narx',
    quantityPrompt: 'Miqdorni kiriting: butun son',
    quantityTo: 'dan',
    quantitySuffix: ' gacha',
    namePrompt: 'Ismingiz nima? Xaridor ismini yuboring.',
    phonePrompt: 'Telefon raqamini yuboring. Format:',
    phoneDigits: 'va to‘qqiz raqam.',
    addressPrompt: 'Yetkazib berish manzilini bitta xabarda yuboring.',
    review: 'Buyurtmani tekshiring.',
    priceChanged: 'Narx o‘zgardi. Buyurtmani qaytadan tasdiqlang.',
    product: 'Mahsulot',
    quantity: 'Miqdor',
    total: 'Jami',
    phone: 'Telefon',
    address: 'Manzil',
    addressGiven: 'kiritilgan',
    status: 'Holat',
    request: 'Bu ariza, to‘lov emas.',
    placed: 'Buyurtma qabul qilindi. Raqam:',
    placedNote:
      'Bu ariza. To‘lov amalga oshirilmadi, sotuvchi siz bilan bog‘lanadi.',
    cancelled: 'Rasmiylashtirish bekor qilindi.',
    conflict: 'Sizda tugallanmagan buyurtma bor:',
    conflictNote: 'Rasmiylashtirishni davom ettiring yoki bekor qiling.',
    confirm: 'Tasdiqlash',
    cancel: 'Bekor qilish',
    resume: 'Davom etish',
  },
} as const;

function claim(
  claims: RuntimeExactClaim[],
  facts: FactSheet,
  key: string,
  type: 'string' | 'number',
): FactValue {
  const value = facts.values[key];
  if (typeof value !== type) throw new CheckoutValidationError('invalid_input');
  claims.push({ key, value });
  return value;
}

function readBoolean(facts: FactSheet, key: string): boolean {
  const value = facts.values[key];
  if (typeof value !== 'boolean') {
    throw new CheckoutValidationError('invalid_input');
  }
  return value;
}

function readView(facts: FactSheet): CheckoutView {
  const value = facts.values['checkout.view'];
  if (typeof value !== 'string' || !VIEWS.has(value)) {
    throw new CheckoutValidationError('invalid_input');
  }
  return value as CheckoutView;
}

function cancelChoice(locale: Locale): OutboundChoice {
  return { id: CHECKOUT_CANCEL_ACTION, label: COPY[locale].cancel };
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

/**
 * Every buyer-facing checkout message is built from scalar Facts only. Buyer
 * name and delivery address are never echoed; the phone appears masked.
 */
export function composeCheckoutResponse(
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  const copy = COPY[locale];
  const view = readView(facts);
  const claims: RuntimeExactClaim[] = [];
  const prefix = readBoolean(facts, 'checkout.input.rejected')
    ? copy.rejected
    : '';

  if (view === 'cancelled') {
    return draft(`${prefix}${copy.cancelled}`, claims, []);
  }

  const name = claim(claims, facts, 'checkout.product.name', 'string');
  const priceDisplay = claim(
    claims,
    facts,
    'checkout.product.price_display',
    'string',
  );
  const availability = claim(
    claims,
    facts,
    'checkout.product.availability_display',
    'string',
  );

  if (view === 'conflict') {
    return draft(
      `${copy.conflict} ${name}\n${copy.conflictNote}`,
      claims,
      [
        { id: CHECKOUT_RESUME_ACTION, label: copy.resume },
        cancelChoice(locale),
      ],
    );
  }

  if (view === 'quantity') {
    const min = claim(claims, facts, 'checkout.quantity.min', 'number');
    const max = claim(claims, facts, 'checkout.quantity.max', 'number');
    return draft(
      `${prefix}${copy.started}\n${name}\n${copy.price}: ${priceDisplay}\n`
      + `${copy.status}: ${availability}\n`
      + `${copy.quantityPrompt} ${min} ${copy.quantityTo} ${max}`
      + `${copy.quantitySuffix}.`,
      claims,
      [cancelChoice(locale)],
    );
  }

  if (view === 'name') {
    return draft(`${prefix}${copy.namePrompt}`, claims, [cancelChoice(locale)]);
  }

  if (view === 'phone') {
    const phonePrefix = claim(
      claims,
      facts,
      'checkout.customer.phone_prefix',
      'string',
    );
    return draft(
      `${prefix}${copy.phonePrompt} ${phonePrefix} ${copy.phoneDigits}`,
      claims,
      [cancelChoice(locale)],
    );
  }

  if (view === 'address') {
    return draft(
      `${prefix}${copy.addressPrompt}`,
      claims,
      [cancelChoice(locale)],
    );
  }

  const quantity = claim(claims, facts, 'checkout.quantity', 'number');
  const totalDisplay = claim(claims, facts, 'checkout.total_display', 'string');
  const orderNumber = claim(claims, facts, 'checkout.order.number', 'string');

  if (view === 'completed') {
    return draft(
      `${copy.placed} ${orderNumber}\n${copy.product}: ${name}\n`
      + `${copy.quantity}: ${quantity}\n${copy.total}: ${totalDisplay}\n`
      + `${copy.placedNote}`,
      claims,
      [],
    );
  }

  const phoneMasked = claim(
    claims,
    facts,
    'checkout.customer.phone_masked',
    'string',
  );
  if (!readBoolean(facts, 'checkout.customer.address_present')) {
    throw new CheckoutValidationError('invalid_input');
  }
  const changed = readBoolean(facts, 'checkout.price_changed')
    ? `${copy.priceChanged}\n`
    : '';
  return draft(
    `${prefix}${changed}${copy.review}\n${copy.product}: ${name}\n`
    + `${copy.price}: ${priceDisplay}\n${copy.status}: ${availability}\n`
    + `${copy.quantity}: ${quantity}\n${copy.total}: ${totalDisplay}\n`
    + `${copy.phone}: ${phoneMasked}\n${copy.address}: ${copy.addressGiven}\n`
    + `${copy.request}`,
    claims,
    [
      { id: CHECKOUT_CONFIRM_ACTION, label: copy.confirm },
      cancelChoice(locale),
    ],
  );
}

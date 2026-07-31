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
import { BUYER_COPY } from '../experience';

export const CHECKOUT_START_ACTION_PREFIX = 'buyer-checkout.';
export const CHECKOUT_CONFIRM_ACTION = 'buyer-checkout-confirm';
export const CHECKOUT_CANCEL_ACTION = 'buyer-checkout-cancel';
export const CHECKOUT_RESUME_ACTION = 'buyer-checkout-resume';
export const CHECKOUT_SKIP_COMMENT_ACTION = 'buyer-checkout-comment-skip';

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
    addressPrompt:
      'Напишите запрос на получение: доставка и адрес, самовывоз или «обсудить с продавцом». Это запрос, не обещание.',
    commentPrompt:
      'Добавьте комментарий к заказу или нажмите «Пропустить».',
    comment: 'Комментарий',
    commentGiven: 'указан',
    commentMissing: 'не указан',
    skip: 'Пропустить',
    review: 'Проверьте заказ.',
    priceChanged: 'Цена изменилась. Подтвердите заказ ещё раз.',
    product: 'Товар',
    quantity: 'Количество',
    total: 'Итого',
    phone: 'Телефон',
    address: 'Адрес',
    addressGiven: 'указан',
    status: 'Статус',
    store: 'Магазин',
    fulfillment: 'Запрос получения',
    request: 'Это заявка, не оплата.',
    placed: 'Заказ принят. Номер:',
    placedNote: 'Это заявка. Оплата не производилась, продавец свяжется с вами.',
    cancelled: 'Оформление отменено.',
    conflict: 'У вас уже есть незавершённый заказ:',
    conflictNote: 'Продолжите оформление или отмените его.',
    confirm: 'Подтвердить',
    cancel: 'Отменить',
    resume: 'Продолжить',
    outOfStock:
      'Товар только что закончился. Могу показать похожие варианты.',
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
    addressPrompt:
      'Olish so‘rovini yozing: yetkazib berish va manzil, olib ketish yoki «sotuvchi bilan muhokama». Bu so‘rov, va’da emas.',
    commentPrompt:
      'Buyurtmaga izoh qo‘shing yoki «O‘tkazib yuborish»ni bosing.',
    comment: 'Izoh',
    commentGiven: 'kiritilgan',
    commentMissing: 'kiritilmagan',
    skip: 'O‘tkazib yuborish',
    review: 'Buyurtmani tekshiring.',
    priceChanged: 'Narx o‘zgardi. Buyurtmani qaytadan tasdiqlang.',
    product: 'Mahsulot',
    quantity: 'Miqdor',
    total: 'Jami',
    phone: 'Telefon',
    address: 'Manzil',
    addressGiven: 'kiritilgan',
    status: 'Holat',
    store: 'Do‘kon',
    fulfillment: 'Olish so‘rovi',
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
    outOfStock:
      'Mahsulot hozirgina tugadi. O‘xshash variantlarni ko‘rsataman.',
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

function readString(facts: FactSheet, key: string): string {
  const value = facts.values[key];
  if (typeof value !== 'string') {
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
  if (view === 'out_of_stock') {
    const productRef = readString(facts, 'checkout.product.ref');
    const buyerCopy = BUYER_COPY[locale];
    return draft(copy.outOfStock, claims, [
      { id: `buyer-similar.${productRef}`, label: buyerCopy.similar },
      { id: 'buyer-seller', label: buyerCopy.askSeller },
      { id: 'buyer-home', label: buyerCopy.homeButton },
    ]);
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
  if (view === 'comment') {
    return draft(
      `${prefix}${copy.commentPrompt}`,
      claims,
      [
        { id: CHECKOUT_SKIP_COMMENT_ACTION, label: copy.skip },
        cancelChoice(locale),
      ],
    );
  }

  const quantity = claim(claims, facts, 'checkout.quantity', 'number');
  const totalDisplay = claim(claims, facts, 'checkout.total_display', 'string');
  const orderNumber = claim(claims, facts, 'checkout.order.number', 'string');
  const store = claim(claims, facts, 'checkout.store.name', 'string');

  if (view === 'completed') {
    return draft(
      `${copy.placed} ${orderNumber}\n${copy.product}: ${name}\n`
      + `${copy.quantity}: ${quantity}\n${copy.total}: ${totalDisplay}\n`
      + `${copy.store}: ${store}\n`
      + `${copy.placedNote}`,
      claims,
      [
        { id: 'buyer-orders', label: BUYER_COPY[locale].orders },
        { id: 'buyer-seller', label: BUYER_COPY[locale].askSeller },
        { id: 'buyer-home', label: BUYER_COPY[locale].homeButton },
      ],
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
  const comment = readBoolean(facts, 'checkout.customer.comment_present')
    ? copy.commentGiven
    : copy.commentMissing;
  const changed = readBoolean(facts, 'checkout.price_changed')
    ? `${copy.priceChanged}\n`
    : '';
  return draft(
    `${prefix}${changed}${copy.review}\n${copy.product}: ${name}\n`
    + `${copy.price}: ${priceDisplay}\n${copy.status}: ${availability}\n`
    + `${copy.store}: ${store}\n`
    + `${copy.quantity}: ${quantity}\n${copy.total}: ${totalDisplay}\n`
    + `${copy.phone}: ${phoneMasked}\n`
    + `${copy.fulfillment}: ${copy.addressGiven}\n`
    + `${copy.comment}: ${comment}\n`
    + `${copy.request}`,
    claims,
    [
      { id: CHECKOUT_CONFIRM_ACTION, label: copy.confirm },
      cancelChoice(locale),
    ],
  );
}

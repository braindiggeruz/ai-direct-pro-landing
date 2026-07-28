import type { FactValue, Locale } from '../../../platform/contracts';
import type {
  HandoffReason,
  HandoffStatus,
  HandoffSummary,
  SotuvchiHandoff,
} from './types';

export type HandoffFactValues = Readonly<Record<string, FactValue>>;

export const HANDOFF_VIEWS = [
  'buyer_created',
  'buyer_existing',
  'buyer_reply',
  'seller_notice',
  'seller_queue',
  'seller_detail',
  'seller_reply_prompt',
  'seller_answered',
  'seller_closed',
] as const;

export type HandoffView = (typeof HANDOFF_VIEWS)[number];

const STATUS_LABELS = {
  ru: {
    open: 'Новый',
    answered: 'Отвечен',
    closed: 'Закрыт',
    expired: 'Истёк',
  },
  uz: {
    open: 'Yangi',
    answered: 'Javob berilgan',
    closed: 'Yopilgan',
    expired: 'Muddati tugagan',
  },
} as const;

const REASON_LABELS = {
  ru: {
    unknown_intent: 'Непонятный вопрос',
    buyer_requested_human: 'Покупатель просит продавца',
    catalog_no_result: 'Товар не найден',
    order_question: 'Вопрос по заказу',
    seller_initiated: 'Инициатива продавца',
  },
  uz: {
    unknown_intent: 'Tushunarsiz savol',
    buyer_requested_human: 'Xaridor sotuvchini so‘radi',
    catalog_no_result: 'Mahsulot topilmadi',
    order_question: 'Buyurtma bo‘yicha savol',
    seller_initiated: 'Sotuvchi tashabbusi',
  },
} as const;

const AUTHORSHIP = {
  ru: 'Ответ продавца',
  uz: 'Sotuvchining javobi',
} as const;

export function handoffStatusLabel(
  status: HandoffStatus,
  locale: Locale,
): string {
  return STATUS_LABELS[locale][status];
}

export function handoffReasonLabel(
  reason: HandoffReason,
  locale: Locale,
): string {
  return REASON_LABELS[locale][reason];
}

/** The marker that tells the buyer a human wrote the answer. */
export function sellerAuthorshipLabel(locale: Locale): string {
  return AUTHORSHIP[locale];
}

export function projectBuyerHandoffFacts(
  handoff: SotuvchiHandoff,
  locale: Locale,
  created: boolean,
): HandoffFactValues {
  return {
    'handoff.view': created ? 'buyer_created' : 'buyer_existing',
    'handoff.status': handoff.status,
    'handoff.reason': handoff.reason,
    'handoff.reason_display': handoffReasonLabel(handoff.reason, locale),
  };
}

/**
 * Buyer-facing reply. The reply text is a Fact so grounding covers every digit
 * the seller typed; nothing else about the seller reaches the buyer.
 */
export function projectHandoffReplyFacts(
  handoff: SotuvchiHandoff,
  locale: Locale,
): HandoffFactValues {
  if (!handoff.replyText) {
    return {
      'handoff.view': 'buyer_existing',
      'handoff.status': handoff.status,
      'handoff.reason': handoff.reason,
      'handoff.reason_display': handoffReasonLabel(handoff.reason, locale),
    };
  }
  return {
    'handoff.view': 'buyer_reply',
    'handoff.status': handoff.status,
    'handoff.reason': handoff.reason,
    'handoff.reply_text': handoff.replyText,
    'handoff.seller_authorship_label': sellerAuthorshipLabel(locale),
  };
}

/**
 * Seller push. Deliberately free of the question text: a notification preview
 * is the easiest place for buyer content to leak onto a lock screen.
 */
export function projectSellerNoticeFacts(
  handoff: SotuvchiHandoff,
  locale: Locale,
): HandoffFactValues {
  return {
    'seller.view': 'seller_notice',
    'seller.handoff.id': handoff.id,
    'seller.handoff.status': handoff.status,
    'seller.handoff.reason': handoff.reason,
    'seller.handoff.reason_display': handoffReasonLabel(handoff.reason, locale),
  };
}

export function projectSellerQueueFacts(
  handoffs: readonly HandoffSummary[],
  locale: Locale,
): HandoffFactValues {
  const values: Record<string, FactValue> = {
    'seller.view': 'seller_queue',
    'seller.handoffs.count': handoffs.length,
  };
  handoffs.forEach((handoff, index) => {
    const prefix = `seller.handoffs.${index}`;
    values[`${prefix}.id`] = handoff.id;
    values[`${prefix}.status`] = handoff.status;
    values[`${prefix}.status_display`] =
      handoffStatusLabel(handoff.status, locale);
    values[`${prefix}.reason_display`] =
      handoffReasonLabel(handoff.reason, locale);
    values[`${prefix}.created_at`] = handoff.createdAt;
  });
  return values;
}

export function projectSellerDetailFacts(
  handoff: SotuvchiHandoff,
  locale: Locale,
  view: 'seller_detail' | 'seller_reply_prompt' | 'seller_answered'
    | 'seller_closed' = 'seller_detail',
): HandoffFactValues {
  return {
    'seller.view': view,
    'seller.handoff.id': handoff.id,
    'seller.handoff.status': handoff.status,
    'seller.handoff.status_display':
      handoffStatusLabel(handoff.status, locale),
    'seller.handoff.reason': handoff.reason,
    'seller.handoff.reason_display': handoffReasonLabel(handoff.reason, locale),
    'seller.handoff.created_at': handoff.createdAt,
    'seller.handoff.content_available': handoff.questionText !== null,
    ...(handoff.questionText === null
      ? {}
      : { 'seller.handoff.question_text': handoff.questionText }),
    ...(handoff.replyText === null
      ? {}
      : { 'seller.handoff.reply_text': handoff.replyText }),
  };
}

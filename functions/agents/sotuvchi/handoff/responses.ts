import type {
  FactSheet,
  Locale,
  OutboundChoice,
  RuntimeExactClaim,
  RuntimeResponseDraft,
} from '../../../platform/contracts';
import { HandoffValidationError } from './errors';
import { HANDOFF_VIEWS, type HandoffView } from './facts';

export const HANDOFF_REQUEST_ACTION = 'buyer-handoff';
export const HANDOFF_QUEUE_ACTION = 'seller-handoffs';
export const HANDOFF_OPEN_ACTION_PREFIX = 'seller-handoff.';
export const HANDOFF_REPLY_ACTION_PREFIX = 'seller-handoff-reply.';
export const HANDOFF_CLOSE_ACTION_PREFIX = 'seller-handoff-close.';

const VIEWS = new Set<string>(HANDOFF_VIEWS);

const COPY = {
  ru: {
    created:
      'Я передал вопрос продавцу. Когда он ответит, сообщение придёт сюда.',
    existing: 'Ваш вопрос уже передан продавцу.',
    notice: 'Новый вопрос покупателя.',
    reason: 'Причина',
    open: 'Открыть',
    queueTitle: 'Вопросы покупателей.',
    queueEmpty: 'Новых вопросов нет.',
    status: 'Статус',
    created_at: 'Создан',
    question: 'Вопрос',
    reply: 'Ответ',
    contentGone: 'Содержание удалено по сроку хранения.',
    replyPrompt: 'Отправьте текст ответа одним сообщением.',
    answered: 'Ответ отправлен покупателю.',
    closed: 'Обращение закрыто.',
    replyAction: 'Ответить',
    closeAction: 'Закрыть',
    back: 'Вопросы',
  },
  uz: {
    created: 'Savolingiz sotuvchiga yuborildi. Javob shu yerga keladi.',
    existing: 'Savolingiz sotuvchiga allaqachon yuborilgan.',
    notice: 'Xaridordan yangi savol.',
    reason: 'Sabab',
    open: 'Ochish',
    queueTitle: 'Xaridorlar savollari.',
    queueEmpty: 'Yangi savol yo‘q.',
    status: 'Holat',
    created_at: 'Yaratilgan',
    question: 'Savol',
    reply: 'Javob',
    contentGone: 'Saqlash muddati tugagani uchun matn o‘chirildi.',
    replyPrompt: 'Javob matnini bitta xabarda yuboring.',
    answered: 'Javob xaridorga yuborildi.',
    closed: 'Murojaat yopildi.',
    replyAction: 'Javob berish',
    closeAction: 'Yopish',
    back: 'Savollar',
  },
} as const;

function claimText(
  claims: RuntimeExactClaim[],
  facts: FactSheet,
  key: string,
): string {
  const value = facts.values[key];
  if (typeof value !== 'string') {
    throw new HandoffValidationError('invalid_input');
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
    throw new HandoffValidationError('invalid_input');
  }
  claims.push({ key, value });
  return value;
}

function readString(facts: FactSheet, key: string): string {
  const value = facts.values[key];
  if (typeof value !== 'string') {
    throw new HandoffValidationError('invalid_input');
  }
  return value;
}

function readBoolean(facts: FactSheet, key: string): boolean {
  const value = facts.values[key];
  if (typeof value !== 'boolean') {
    throw new HandoffValidationError('invalid_input');
  }
  return value;
}

function readView(facts: FactSheet): HandoffView {
  const value = facts.values['handoff.view'] ?? facts.values['seller.view'];
  if (typeof value !== 'string' || !VIEWS.has(value)) {
    throw new HandoffValidationError('invalid_input');
  }
  return value as HandoffView;
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
 * Every handoff message is assembled from scalar Facts only. The buyer reply
 * always carries the human authorship marker, so a seller answer can never be
 * mistaken for an automated one.
 */
export function composeHandoffResponse(
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  const copy = COPY[locale];
  const view = readView(facts);
  const claims: RuntimeExactClaim[] = [];

  if (view === 'buyer_created' || view === 'buyer_existing') {
    return draft(
      view === 'buyer_created' ? copy.created : copy.existing,
      claims,
      [],
    );
  }

  if (view === 'buyer_reply') {
    const label = claimText(claims, facts, 'handoff.seller_authorship_label');
    const reply = claimText(claims, facts, 'handoff.reply_text');
    return draft(`${label}:\n${reply}`, claims, []);
  }

  if (view === 'seller_notice') {
    const reason = claimText(claims, facts, 'seller.handoff.reason_display');
    const id = readString(facts, 'seller.handoff.id');
    return draft(
      `${copy.notice}\n${copy.reason}: ${reason}`,
      claims,
      [
        { id: `${HANDOFF_OPEN_ACTION_PREFIX}${id}`, label: copy.open },
        { id: HANDOFF_QUEUE_ACTION, label: copy.back },
      ],
    );
  }

  if (view === 'seller_queue') {
    const count = claimNumber(claims, facts, 'seller.handoffs.count');
    if (count === 0) return draft(`${copy.queueTitle}\n${copy.queueEmpty}`, claims, []);
    const lines: string[] = [];
    const choices: OutboundChoice[] = [];
    for (let index = 0; index < count; index += 1) {
      const prefix = `seller.handoffs.${index}`;
      const status = claimText(claims, facts, `${prefix}.status_display`);
      const reason = claimText(claims, facts, `${prefix}.reason_display`);
      // The full ISO timestamp is the Fact; only its date part is rendered.
      const createdAt = claimText(claims, facts, `${prefix}.created_at`);
      lines.push(`${status} — ${reason} — ${createdAt.slice(0, 10)}`);
      choices.push({
        id: `${HANDOFF_OPEN_ACTION_PREFIX}${readString(facts, `${prefix}.id`)}`,
        label: `${status} — ${createdAt.slice(0, 10)}`,
      });
    }
    return draft(`${copy.queueTitle}\n${lines.join('\n')}`, claims, choices);
  }

  const id = readString(facts, 'seller.handoff.id');
  const status = claimText(claims, facts, 'seller.handoff.status_display');
  const reason = claimText(claims, facts, 'seller.handoff.reason_display');
  const createdAt = claimText(claims, facts, 'seller.handoff.created_at');
  const parts = [
    `${copy.status}: ${status}`,
    `${copy.reason}: ${reason}`,
    `${copy.created_at}: ${createdAt.slice(0, 10)}`,
  ];
  if (readBoolean(facts, 'seller.handoff.content_available')) {
    parts.push(
      `${copy.question}: ${claimText(claims, facts, 'seller.handoff.question_text')}`,
    );
  } else {
    parts.push(copy.contentGone);
  }
  if (facts.values['seller.handoff.reply_text'] !== undefined) {
    parts.push(
      `${copy.reply}: ${claimText(claims, facts, 'seller.handoff.reply_text')}`,
    );
  }

  if (view === 'seller_reply_prompt') parts.push(copy.replyPrompt);
  if (view === 'seller_answered') parts.push(copy.answered);
  if (view === 'seller_closed') parts.push(copy.closed);

  const choices: OutboundChoice[] = [];
  const handoffStatus = readString(facts, 'seller.handoff.status');
  if (view === 'seller_detail' && handoffStatus === 'open') {
    choices.push({
      id: `${HANDOFF_REPLY_ACTION_PREFIX}${id}`,
      label: copy.replyAction,
    });
  }
  if (handoffStatus === 'open' || handoffStatus === 'answered') {
    choices.push({
      id: `${HANDOFF_CLOSE_ACTION_PREFIX}${id}`,
      label: copy.closeAction,
    });
  }
  choices.push({ id: HANDOFF_QUEUE_ACTION, label: copy.back });
  return draft(parts.join('\n'), claims, choices);
}

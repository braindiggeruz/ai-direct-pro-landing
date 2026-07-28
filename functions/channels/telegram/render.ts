import type {
  Locale,
  Outbound,
  RuntimeTurnResult,
} from '../../platform/contracts';
import {
  splitMessage,
  type InlineKeyboard,
  type TelegramClient,
} from './api';

const CALLBACK_PREFIX = 'agent:';
const SAFE_CHOICE_ID = /^[a-z0-9][a-z0-9._-]{0,47}$/;
const MAX_CHOICE_LABEL = 64;

export interface TelegramRenderedMessage {
  text: string;
  keyboard?: InlineKeyboard;
}

export interface TelegramDeliveryPort {
  sendText(
    threadRef: string,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<boolean>;
  answerCallback(callbackQueryId: string): Promise<boolean>;
}

const FALLBACK = {
  ru: {
    runtime: 'Не удалось подготовить ответ. Попробуйте ещё раз позже.',
    mapping: 'Эта ссылка недоступна. Откройте актуальную ссылку бота.',
  },
  uz: {
    runtime: 'Javobni tayyorlab bo‘lmadi. Keyinroq qayta urinib ko‘ring.',
    mapping: 'Bu havola mavjud emas. Botning amaldagi havolasini oching.',
  },
} as const;

function keyboardFromOutbound(outbound: Outbound): InlineKeyboard | undefined {
  const buttons = [
    ...(outbound.choices ?? []),
    ...(outbound.card?.actions ?? []),
  ]
    .filter(
      (choice) =>
        SAFE_CHOICE_ID.test(choice.id)
        && choice.label.trim().length > 0
        && choice.label.length <= MAX_CHOICE_LABEL,
    )
    .map((choice) => [{
      text: choice.label,
      callback_data: `${CALLBACK_PREFIX}${choice.id}`,
    }]);
  return buttons.length > 0 ? buttons : undefined;
}

function textFromOutbound(outbound: Outbound): string {
  if (!outbound.card) return outbound.text;
  const card = outbound.card;
  return [
    outbound.text.trim(),
    card.title,
    card.description ?? '',
    ...card.fields.map((field) => `${field.label}: ${field.value}`),
  ].filter(Boolean).join('\n');
}

/** Bounded channel rendering shared by turn replies and pushed messages. */
export function renderTelegramOutbound(
  messages: readonly Outbound[],
): readonly TelegramRenderedMessage[] {
  return messages.map((message) => {
    const keyboard = keyboardFromOutbound(message);
    return {
      text: textFromOutbound(message),
      ...(keyboard ? { keyboard } : {}),
    };
  });
}

export function renderTelegramRuntimeResult(
  result: RuntimeTurnResult,
  locale: Locale,
): readonly TelegramRenderedMessage[] {
  if (result.status !== 'answered' || result.messages.length === 0) {
    return [{ text: FALLBACK[locale].runtime }];
  }
  return renderTelegramOutbound(result.messages);
}

export function renderTelegramMappingFailure(
  locale: Locale,
): readonly TelegramRenderedMessage[] {
  return [{ text: FALLBACK[locale].mapping }];
}

export function renderTelegramRuntimeFailure(
  locale: Locale,
): readonly TelegramRenderedMessage[] {
  return [{ text: FALLBACK[locale].runtime }];
}

function parseThreadRef(threadRef: string): number {
  if (!/^[1-9]\d{0,19}$/.test(threadRef)) {
    throw new Error('telegram thread rejected');
  }
  const value = Number(threadRef);
  if (!Number.isSafeInteger(value)) {
    throw new Error('telegram thread rejected');
  }
  return value;
}

export function createTelegramDeliveryPort(
  client: Pick<TelegramClient, 'sendMessage' | 'answerCallbackQuery'>,
): TelegramDeliveryPort {
  return {
    async sendText(threadRef, text, keyboard) {
      const result = await client.sendMessage(
        parseThreadRef(threadRef),
        text,
        keyboard ? { keyboard } : {},
      );
      return result.ok;
    },
    async answerCallback(callbackQueryId) {
      if (
        typeof callbackQueryId !== 'string'
        || callbackQueryId.length === 0
        || callbackQueryId.length > 120
      ) {
        return false;
      }
      const result = await client.answerCallbackQuery(callbackQueryId);
      return result.ok;
    },
  };
}

export async function deliverTelegramMessages(
  delivery: TelegramDeliveryPort,
  threadRef: string,
  messages: readonly TelegramRenderedMessage[],
): Promise<boolean> {
  for (const message of messages) {
    const chunks = splitMessage(message.text);
    for (let index = 0; index < chunks.length; index++) {
      const keyboard = index === chunks.length - 1
        ? message.keyboard
        : undefined;
      if (!await delivery.sendText(threadRef, chunks[index], keyboard)) {
        return false;
      }
    }
  }
  return true;
}

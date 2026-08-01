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
const SAFE_MEDIA_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const MAX_CHOICE_LABEL = 64;
const SAFE_MEDIA_CAPTION = 1_000;

export interface TelegramRenderedMessage {
  text: string;
  keyboard?: InlineKeyboard;
  mediaRef?: string;
}

export interface TelegramDeliveryPort {
  sendText(
    threadRef: string,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<boolean>;
  sendMedia?(
    threadRef: string,
    mediaRef: string,
    caption?: string,
    keyboard?: InlineKeyboard,
  ): Promise<boolean>;
  showTyping?(threadRef: string): Promise<boolean>;
  answerCallback(callbackQueryId: string): Promise<boolean>;
}

const FALLBACK = {
  ru: {
    runtime: 'Не удалось подготовить ответ. Попробуйте ещё раз позже.',
    mapping: 'Эта ссылка недоступна. Откройте актуальную ссылку бота.',
    rateLimit: 'Слишком много запросов. Подождите минуту и попробуйте снова.',
  },
  uz: {
    runtime: 'Javobni tayyorlab bo‘lmadi. Keyinroq qayta urinib ko‘ring.',
    mapping: 'Bu havola mavjud emas. Botning amaldagi havolasini oching.',
    rateLimit: 'So‘rovlar juda ko‘p. Bir daqiqa kutib, qayta urinib ko‘ring.',
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
      ...(message.mediaRef && SAFE_MEDIA_REF.test(message.mediaRef)
        ? { mediaRef: message.mediaRef }
        : {}),
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

export function renderTelegramRateLimit(
  locale: Locale,
): readonly TelegramRenderedMessage[] {
  return [{ text: FALLBACK[locale].rateLimit }];
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
  client: Pick<
    TelegramClient,
    'sendMessage' | 'sendChatAction' | 'answerCallbackQuery'
  > & Partial<Pick<TelegramClient, 'sendPhoto'>>,
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
    ...(typeof client.sendPhoto === 'function'
      ? {
          async sendMedia(
            threadRef: string,
            mediaRef: string,
            caption?: string,
            keyboard?: InlineKeyboard,
          ) {
            if (!SAFE_MEDIA_REF.test(mediaRef)) return false;
            const result = await client.sendPhoto!(
              parseThreadRef(threadRef),
              mediaRef,
              caption,
              keyboard ? { keyboard } : {},
            );
            return result.ok;
          },
        }
      : {}),
    async showTyping(threadRef) {
      const result = await client.sendChatAction(parseThreadRef(threadRef));
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
    if (message.mediaRef && delivery.sendMedia) {
      if (message.text.length <= SAFE_MEDIA_CAPTION) {
        if (!await delivery.sendMedia(
          threadRef,
          message.mediaRef,
          message.text,
          message.keyboard,
        )) {
          return false;
        }
        continue;
      }
      if (!await delivery.sendMedia(threadRef, message.mediaRef)) {
        return false;
      }
    }
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

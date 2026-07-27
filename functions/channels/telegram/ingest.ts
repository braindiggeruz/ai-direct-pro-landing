import type {
  Inbound,
  Locale,
  RuntimeMessage,
} from '../../platform/contracts';
import {
  parseTelegramStartCommand,
  type StartCommandResult,
} from './deep-link';
import { telegramAgentUpdateKey } from './store';

const MAX_TEXT_LENGTH = 4_096;
const CALLBACK_PREFIX = 'agent:';
const SAFE_ACTION = /^[a-z0-9][a-z0-9._-]{0,47}$/;

type TelegramIngestCode =
  | 'invalid_update'
  | 'invalid_start_payload'
  | 'invalid_action';

export interface TelegramAcceptedInbound {
  updateId: number;
  inbound: Inbound;
  runtimeMessage: RuntimeMessage;
  startPayload?: string;
  callbackQueryId?: string;
}

export type TelegramIngestResult =
  | { status: 'accepted'; value: TelegramAcceptedInbound }
  | { status: 'ignored'; reason: 'unsupported_update' | 'unsupported_chat' }
  | { status: 'rejected'; code: TelegramIngestCode };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function positiveTelegramId(value: unknown): string | null {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) return null;
  return String(value);
}

function validUpdateId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function localeFromLanguageCode(value: unknown): Locale {
  return typeof value === 'string' && value.toLowerCase().startsWith('uz')
    ? 'uz'
    : 'ru';
}

function validText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > MAX_TEXT_LENGTH) return null;
  return text;
}

function startPayload(
  result: StartCommandResult,
): { runtimeMessage: RuntimeMessage; payload?: string } | TelegramIngestResult {
  if (result.status === 'invalid') {
    return { status: 'rejected', code: 'invalid_start_payload' };
  }
  if (result.status === 'valid') {
    return {
      runtimeMessage: { kind: 'action', actionId: 'start' },
      payload: result.payload,
    };
  }
  if (result.status === 'missing') {
    return {
      runtimeMessage: { kind: 'action', actionId: 'start' },
    };
  }
  throw new Error('not a start command');
}

function messageInbound(
  updateId: number,
  botUsername: string,
  message: Record<string, unknown>,
): TelegramIngestResult {
  if (
    !isPlainObject(message.chat)
    || message.chat.type !== 'private'
  ) {
    return { status: 'ignored', reason: 'unsupported_chat' };
  }
  if (!isPlainObject(message.from)) {
    return { status: 'rejected', code: 'invalid_update' };
  }
  const threadRef = positiveTelegramId(message.chat.id);
  const externalId = positiveTelegramId(message.from.id);
  if (!threadRef || !externalId) {
    return { status: 'rejected', code: 'invalid_update' };
  }
  const text = validText(message.text);
  if (!text) {
    return { status: 'ignored', reason: 'unsupported_update' };
  }
  const parsedStart = parseTelegramStartCommand(text);
  let platformMessage: Inbound['message'];
  let runtimeMessage: RuntimeMessage;
  let payload: string | undefined;
  if (parsedStart.status !== 'none') {
    const parsed = startPayload(parsedStart);
    if ('status' in parsed) return parsed;
    platformMessage = {
      kind: 'command',
      command: 'start',
      ...(parsed.payload ? { payload: parsed.payload } : {}),
    };
    runtimeMessage = parsed.runtimeMessage;
    payload = parsed.payload;
  } else {
    platformMessage = { kind: 'text', text };
    runtimeMessage = { kind: 'text', text };
  }
  const locale = localeFromLanguageCode(message.from.language_code);
  return {
    status: 'accepted',
    value: {
      updateId,
      inbound: {
        identity: { channel: 'telegram', externalId },
        threadRef,
        idempotencyKey: telegramAgentUpdateKey(botUsername, updateId),
        locale,
        message: platformMessage,
      },
      runtimeMessage,
      ...(payload ? { startPayload: payload } : {}),
    },
  };
}

function callbackInbound(
  updateId: number,
  botUsername: string,
  callback: Record<string, unknown>,
): TelegramIngestResult {
  if (
    !isPlainObject(callback.from)
    || !isPlainObject(callback.message)
    || !isPlainObject(callback.message.chat)
  ) {
    return { status: 'rejected', code: 'invalid_update' };
  }
  const externalId = positiveTelegramId(callback.from.id);
  const threadRef = positiveTelegramId(callback.message.chat.id);
  if (
    !externalId
    || !threadRef
    || typeof callback.id !== 'string'
    || callback.id.length === 0
    || callback.id.length > 120
  ) {
    return { status: 'rejected', code: 'invalid_update' };
  }
  if (
    typeof callback.data !== 'string'
    || !callback.data.startsWith(CALLBACK_PREFIX)
  ) {
    return { status: 'ignored', reason: 'unsupported_update' };
  }
  const actionId = callback.data.slice(CALLBACK_PREFIX.length);
  if (!SAFE_ACTION.test(actionId)) {
    return { status: 'rejected', code: 'invalid_action' };
  }
  const locale = localeFromLanguageCode(callback.from.language_code);
  return {
    status: 'accepted',
    value: {
      updateId,
      inbound: {
        identity: { channel: 'telegram', externalId },
        threadRef,
        idempotencyKey: telegramAgentUpdateKey(botUsername, updateId),
        locale,
        message: { kind: 'action', actionId },
      },
      runtimeMessage: { kind: 'action', actionId },
      callbackQueryId: callback.id,
    },
  };
}

export function ingestTelegramAgentUpdate(
  raw: unknown,
  botUsername: string,
): TelegramIngestResult {
  if (!isPlainObject(raw) || !validUpdateId(raw.update_id)) {
    return { status: 'rejected', code: 'invalid_update' };
  }
  if (isPlainObject(raw.message)) {
    return messageInbound(raw.update_id, botUsername, raw.message);
  }
  if (isPlainObject(raw.callback_query)) {
    return callbackInbound(raw.update_id, botUsername, raw.callback_query);
  }
  return { status: 'ignored', reason: 'unsupported_update' };
}

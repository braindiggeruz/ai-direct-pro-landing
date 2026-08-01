// Channel-side Telegram Bot API client. The token is passed in and NEVER
// logged; error logs carry only the method name + HTTP status. Includes
// bounded exponential backoff on 429/5xx with retry_after handling, plus
// safe helpers for message length limits and HTML escaping.

const API_BASE = 'https://api.telegram.org';
const TG_MAX_MESSAGE = 4096;
const TG_MAX_CAPTION = 1024;
const SAFE_CHUNK = 3900; // headroom under the hard limit
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 8_000;

interface TelegramCallOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

export interface TgResult<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}
export type InlineKeyboard = InlineButton[][];

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface TelegramMessage {
  message_id: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function boundedTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.max(250, Math.min(15_000, Math.trunc(value!)));
}

function boundedRetries(value: number | undefined): number {
  if (!Number.isFinite(value)) return MAX_RETRIES;
  return Math.max(0, Math.min(MAX_RETRIES, Math.trunc(value!)));
}

export function telegramRetryDelayMs(
  status: number,
  retryAfterSeconds: number | undefined,
  attempt: number,
): number {
  if (
    status === 429
    && Number.isFinite(retryAfterSeconds)
    && Number(retryAfterSeconds) >= 0
  ) {
    return Math.max(
      250,
      Math.min(
        MAX_RETRY_DELAY_MS,
        Math.trunc(Number(retryAfterSeconds) * 1_000),
      ),
    );
  }
  const base = status === 0 ? 1_000 : 2_000;
  return Math.min(base * 2 ** Math.max(0, attempt), MAX_RETRY_DELAY_MS);
}

export class TelegramClient {
  constructor(private token: string) {}

  /** Low-level call with retry/backoff. Never throws; returns TgResult. */
  async call<T = unknown>(method: string, body: Record<string, unknown> = {}, options: TelegramCallOptions = {}): Promise<TgResult<T>> {
    let attempt = 0;
    const timeoutMs = boundedTimeout(options.timeoutMs);
    const maxRetries = boundedRetries(options.maxRetries);
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${API_BASE}/bot${this.token}/${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await res.json() as TgResult<T>;
        clearTimeout(timer);
        if (res.ok && data.ok) return data;

        const retriable = res.status === 429 || res.status >= 500;
        if (retriable && attempt < maxRetries) {
          const retryAfter = data.parameters?.retry_after;
          const backoff = telegramRetryDelayMs(
            res.status,
            retryAfter,
            attempt,
          );
          attempt++;
          console.warn(
            `tg.${method} retry=${res.status === 429 ? 'rate_limited' : 'server'}`
            + ` attempt=${attempt} delay_ms=${backoff}`,
          );
          await sleep(backoff);
          continue;
        }
        // Non-retriable or exhausted: log method + status only, never token/body.
        console.error(`tg.${method} ${res.status} code=${data.error_code ?? '?'}`);
        return data.ok !== undefined ? data : { ok: false, error_code: res.status };
      } catch (e) {
        clearTimeout(timer);
        if (attempt < maxRetries) {
          const backoff = telegramRetryDelayMs(0, undefined, attempt);
          attempt++;
          console.warn(
            `tg.${method} retry=network attempt=${attempt} delay_ms=${backoff}`,
          );
          await sleep(backoff);
          continue;
        }
        console.error(`tg.${method} network: ${(e as Error).name}`);
        return { ok: false, error_code: 0 };
      }
    }
  }

  getMe() {
    return this.call<{
      id: number;
      is_bot: boolean;
      username?: string;
      first_name?: string;
    }>('getMe');
  }

  getFile(fileId: string) {
    // Voice processing must stay inside the Worker's background lifecycle;
    // fail fast here so the handler can send localized retry guidance.
    return this.call<TelegramFile>('getFile', { file_id: fileId }, { timeoutMs: 5_000, maxRetries: 0 });
  }

  answerCallbackQuery(id: string, text?: string) {
    // Callback acknowledgements are useful only while Telegram is showing the
    // button spinner. A late retry adds latency without improving the UX.
    return this.call(
      'answerCallbackQuery',
      { callback_query_id: id, ...(text ? { text } : {}) },
      { timeoutMs: 2_000, maxRetries: 0 },
    );
  }

  sendChatAction(chatId: number, action = 'typing') {
    // Typing is best-effort feedback, not a domain operation. Fail fast so an
    // old indicator cannot appear after the actual response.
    return this.call(
      'sendChatAction',
      { chat_id: chatId, action },
      { timeoutMs: 2_000, maxRetries: 0 },
    );
  }

  deleteMessage(chatId: number, messageId: number) {
    return this.call('deleteMessage', { chat_id: chatId, message_id: messageId }, { timeoutMs: 3_000, maxRetries: 0 });
  }

  /** Send text, auto-splitting past Telegram's 4096-char limit. Plain text by
   *  default — AI output is NEVER given a parse_mode, so it cannot inject
   *  markup. Returns the last message result. */
  async sendMessage(chatId: number, text: string, opts: { keyboard?: InlineKeyboard; parseMode?: 'HTML' } = {}) {
    const chunks = splitMessage(text);
    let last: TgResult<TelegramMessage> = { ok: false };
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      last = await this.call<TelegramMessage>('sendMessage', {
        chat_id: chatId,
        text: chunks[i],
        disable_web_page_preview: true,
        ...(opts.parseMode ? { parse_mode: opts.parseMode } : {}),
        ...(isLast && opts.keyboard ? { reply_markup: { inline_keyboard: opts.keyboard } } : {}),
      });
    }
    return last;
  }

  /** Send a reusable Telegram-native file_id. Product catalog validation
   *  rejects URLs, so this call never fetches arbitrary remote media. */
  sendPhoto(
    chatId: number,
    photo: string,
    caption?: string,
    opts: { keyboard?: InlineKeyboard } = {},
  ) {
    return this.call<TelegramMessage>('sendPhoto', {
      chat_id: chatId,
      photo,
      ...(caption ? { caption: caption.slice(0, TG_MAX_CAPTION) } : {}),
      ...(opts.keyboard
        ? { reply_markup: { inline_keyboard: opts.keyboard } }
        : {}),
    });
  }

  editMessageText(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text.slice(0, SAFE_CHUNK),
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }

  editMessageReplyMarkup(chatId: number, messageId: number, keyboard: InlineKeyboard) {
    return this.call('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  setWebhook(url: string, secretToken: string, allowedUpdates: string[], dropPending = false) {
    return this.call('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: allowedUpdates,
      drop_pending_updates: dropPending,
      max_connections: 40,
    });
  }

  deleteWebhook(dropPending = false) {
    return this.call('deleteWebhook', { drop_pending_updates: dropPending });
  }

  getWebhookInfo() {
    return this.call<{ url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number }>('getWebhookInfo');
  }

  setMyCommands(commands: readonly { command: string; description: string }[], languageCode?: string) {
    return this.call('setMyCommands', { commands, ...(languageCode ? { language_code: languageCode } : {}) });
  }

  setMyDescription(description: string, languageCode?: string) {
    return this.call('setMyDescription', { description, ...(languageCode ? { language_code: languageCode } : {}) });
  }

  setMyShortDescription(shortDescription: string, languageCode?: string) {
    return this.call('setMyShortDescription', { short_description: shortDescription, ...(languageCode ? { language_code: languageCode } : {}) });
  }
}

/** Escape the five HTML-sensitive chars for Telegram parse_mode=HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * Split text into <=4096-char chunks, preferring paragraph then line then
 * hard boundaries so a long AI answer never trips Telegram's limit.
 */
export function splitMessage(text: string, limit = SAFE_CHUNK): string[] {
  const src = (text || '').trim();
  if (src.length <= limit) return [src || '…'];
  const out: string[] = [];
  let rest = src;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export { TG_MAX_MESSAGE };

// Server-side Telegram Bot API client. The token is passed in and NEVER
// logged; error logs carry only the method name + HTTP status. Includes
// bounded exponential backoff on 429/5xx with retry_after handling, plus
// safe helpers for message length limits and HTML escaping.

const API_BASE = 'https://api.telegram.org';
const TG_MAX_MESSAGE = 4096;
const SAFE_CHUNK = 3900; // headroom under the hard limit
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 3;

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class TelegramClient {
  constructor(private token: string) {}

  /** Low-level call with retry/backoff. Never throws; returns TgResult. */
  async call<T = unknown>(method: string, body: Record<string, unknown> = {}, options: TelegramCallOptions = {}): Promise<TgResult<T>> {
    let attempt = 0;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? MAX_RETRIES;
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
        clearTimeout(timer);
        const data = (await res.json().catch(() => ({ ok: false }))) as TgResult<T>;
        if (res.ok && data.ok) return data;

        const retriable = res.status === 429 || res.status >= 500;
        if (retriable && attempt < maxRetries) {
          const retryAfter = data.parameters?.retry_after;
          const backoff = retryAfter ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 8000);
          attempt++;
          await sleep(backoff);
          continue;
        }
        // Non-retriable or exhausted: log method + status only, never token/body.
        console.error(`tg.${method} ${res.status} code=${data.error_code ?? '?'}`);
        return data.ok !== undefined ? data : { ok: false, error_code: res.status };
      } catch (e) {
        clearTimeout(timer);
        if (attempt < maxRetries) {
          attempt++;
          await sleep(Math.min(1000 * 2 ** attempt, 6000));
          continue;
        }
        console.error(`tg.${method} network: ${(e as Error).name}`);
        return { ok: false, error_code: 0 };
      }
    }
  }

  getMe() { return this.call<{ id: number; username?: string; first_name?: string }>('getMe'); }

  getFile(fileId: string) {
    // Voice processing must stay inside the Worker's background lifecycle;
    // fail fast here so the handler can send localized retry guidance.
    return this.call<TelegramFile>('getFile', { file_id: fileId }, { timeoutMs: 5_000, maxRetries: 0 });
  }

  answerCallbackQuery(id: string, text?: string) {
    return this.call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
  }

  sendChatAction(chatId: number, action = 'typing') {
    return this.call('sendChatAction', { chat_id: chatId, action });
  }

  /** Send text, auto-splitting past Telegram's 4096-char limit. Plain text by
   *  default — AI output is NEVER given a parse_mode, so it cannot inject
   *  markup. Returns the last message result. */
  async sendMessage(chatId: number, text: string, opts: { keyboard?: InlineKeyboard; parseMode?: 'HTML' } = {}) {
    const chunks = splitMessage(text);
    let last: TgResult = { ok: false };
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      last = await this.call('sendMessage', {
        chat_id: chatId,
        text: chunks[i],
        disable_web_page_preview: true,
        ...(opts.parseMode ? { parse_mode: opts.parseMode } : {}),
        ...(isLast && opts.keyboard ? { reply_markup: { inline_keyboard: opts.keyboard } } : {}),
      });
    }
    return last;
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

  setMyCommands(commands: { command: string; description: string }[], languageCode?: string) {
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

// The last metre of the funnel: a lead reaches the owner's phone.
//
// /api/gpt/lead has written to gpt_leads since the chat shipped and notified
// nobody, so a person who left a phone number at 22:00 was discovered the
// next time somebody opened the database. This module closes that gap.
//
// Three rules shape it:
//
//  1. Delivery reuses functions/channels/telegram/api.ts — the production Bot
//     API client with bounded retries, 429 `retry_after` handling, message
//     chunking and HTML escaping. There is exactly one Bot API client in this
//     repo and this is not a second one.
//
//  2. Consent is literal. The conversation text is included ONLY when the
//     person ticked the box that says, in their own language, that their chat
//     will be sent along. Without it the alert says so out loud rather than
//     quietly attaching the transcript anyway.
//
//  3. A missing credential is not an error. When the token or the chat id is
//     unset the send is skipped, logged once per isolate, and the lead is
//     still stored and still answered `ok` — a notification that cannot be
//     delivered must never cost the studio the enquiry itself.
import { TelegramClient, escapeHtml, type InlineKeyboard } from '../../channels/telegram/api';
import type { BridgeEnv } from './bridge-env';

export interface OwnerNotifyConfig {
  token: string;
  chatId: string;
  configured: boolean;
  /** Which env pair supplied the credentials — for logs, never the values. */
  source: 'dedicated' | 'assistant' | 'none';
}

/**
 * Prefer the dedicated pair; fall back to the credentials the operator has
 * almost certainly already set for the Javob assistant and the long-standing
 * admin chat id, so the common case needs no new secret at all.
 */
export function resolveOwnerNotify(env: BridgeEnv): OwnerNotifyConfig {
  const token = (env.GPT_NOTIFY_BOT_TOKEN || env.TELEGRAM_ASSISTANT_BOT_TOKEN || '').trim();
  const chatId = (env.GPT_NOTIFY_CHAT_ID || env.TELEGRAM_ADMIN_CHAT_ID || '').trim();
  const dedicated = !!(env.GPT_NOTIFY_BOT_TOKEN && env.GPT_NOTIFY_CHAT_ID);
  return {
    token,
    chatId,
    configured: !!token && !!chatId,
    source: !token || !chatId ? 'none' : dedicated ? 'dedicated' : 'assistant',
  };
}

export interface TranscriptTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LeadAlert {
  leadId: string;
  name: string | null;
  contactType: string;
  contactValue: string;
  intent: string | null;
  locale: 'ru' | 'uz';
  pageUrl: string | null;
  sessionId: string | null;
  utmJson: string | null;
  createdAt: string;
  /** The person's explicit, separate consent to forward the conversation. */
  shareConversation: boolean;
  /** Ignored entirely unless shareConversation is true. */
  transcript?: TranscriptTurn[];
}

const MAX_TURNS_IN_ALERT = 6;
const MAX_CHARS_PER_TURN = 400;
const MAX_TRANSCRIPT_CHARS = 2000;
const MAX_FIELD_CHARS = 200;
const HANDLE_RE = /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/;

/**
 * Escape for parse_mode=HTML and keep the RESULT under `maxEscaped`.
 *
 * Budgeting the raw string is not enough: escaping expands, and `"` becomes
 * six characters. A transcript of quotes could otherwise cross Telegram's
 * 4096-char limit, and the client would then split the message — mid-tag,
 * because it splits on whitespace and knows nothing about our markup. So the
 * raw text is shrunk until its escaped form fits, and it is never the escaped
 * form that gets cut (a half-written `&amp;` is not something to send).
 */
export function clampEscaped(raw: string, maxEscaped: number): string {
  let value = raw;
  for (let i = 0; i < 4; i += 1) {
    const escaped = escapeHtml(value);
    if (escaped.length <= maxEscaped) return escaped;
    const ratio = maxEscaped / escaped.length;
    value = value.slice(0, Math.max(1, Math.floor(value.length * ratio) - 1));
  }
  return escapeHtml(value.slice(0, maxEscaped));
}

function line(label: string, value: string | null | undefined): string {
  return value ? `<b>${label}:</b> ${clampEscaped(value, MAX_FIELD_CHARS)}\n` : '';
}

function stamp(iso: string): string {
  // 2026-09-04T19:41:07.000Z -> 2026-09-04 19:41 UTC
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** A `t.me` button, but only for a handle Telegram would actually resolve. */
export function telegramHandleUrl(contactType: string, contactValue: string): string | null {
  if (contactType !== 'telegram') return null;
  const handle = contactValue.trim().replace(/^@/, '');
  return HANDLE_RE.test(contactValue.trim()) ? `https://t.me/${handle}` : null;
}

export function renderTranscript(turns: TranscriptTurn[]): string {
  const tail = turns.slice(-MAX_TURNS_IN_ALERT);
  const out: string[] = [];
  let budget = MAX_TRANSCRIPT_CHARS;
  for (const turn of tail) {
    if (budget <= 0) break;
    const who = turn.role === 'user' ? 'Человек' : 'Бот';
    const raw = (turn.content || '').trim().replace(/\s+/g, ' ').slice(0, MAX_CHARS_PER_TURN);
    const text = clampEscaped(raw, Math.min(budget, MAX_CHARS_PER_TURN * 2));
    budget -= text.length;
    out.push(`<b>${who}:</b> ${text}`);
  }
  return out.join('\n');
}

export interface RenderedAlert {
  text: string;
  keyboard?: InlineKeyboard;
}

/**
 * Pure. Everything the owner needs to answer well, in one message: who, how to
 * reach them, what they asked for, which page and which language brought them,
 * and — only with consent — what was actually said.
 */
export function buildLeadAlert(alert: LeadAlert): RenderedAlert {
  const head = `🔔 <b>Заявка из AI-чата</b>\n\n`;
  const body =
    line('Имя', alert.name || 'не указано') +
    line('Контакт', `${alert.contactValue} (${alert.contactType})`) +
    line('Запрос', alert.intent || 'не указан') +
    line('Язык', alert.locale === 'uz' ? 'узбекский' : 'русский') +
    line('Страница', alert.pageUrl || 'не передана') +
    line('UTM', alert.utmJson) +
    line('Сессия', alert.sessionId) +
    line('Время', stamp(alert.createdAt));

  const turns = alert.shareConversation ? alert.transcript ?? [] : [];
  let tail: string;
  if (!alert.shareConversation) {
    tail = '\n<i>Переписку передавать не разрешили — показываем только контакт.</i>';
  } else if (turns.length === 0) {
    tail = '\n<i>Переписку разрешили передать, но сообщений в этой сессии нет.</i>';
  } else {
    tail = `\n<b>Переписка</b> (последние ${Math.min(turns.length, MAX_TURNS_IN_ALERT)}, передана с согласия):\n${renderTranscript(turns)}`;
  }

  const url = telegramHandleUrl(alert.contactType, alert.contactValue);
  return {
    text: `${head}${body}${tail}\n\n<code>${clampEscaped(alert.leadId, 120)}</code>`,
    ...(url ? { keyboard: [[{ text: 'Написать в Telegram', url }]] } : {}),
  };
}

export type NotifyStatus = 'sent' | 'skipped_unconfigured' | 'failed';

export interface NotifyResult {
  status: NotifyStatus;
  /** Telegram error_code when status is 'failed'. Never a token or a body. */
  errorCode?: number;
  source: OwnerNotifyConfig['source'];
}

// One warning per isolate, not one per lead: a permanently unset secret must
// not turn every enquiry into a log line.
let warnedUnconfigured = false;

/** Reset between tests. */
export function _resetNotifyWarning(): void {
  warnedUnconfigured = false;
}

/**
 * Deliver one owner alert. Never throws: the caller is a lead endpoint that
 * has already stored the row and must answer `ok` regardless.
 */
export async function sendOwnerAlert(env: BridgeEnv, rendered: RenderedAlert): Promise<NotifyResult> {
  const cfg = resolveOwnerNotify(env);
  if (!cfg.configured) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        'gpt-chat: owner Telegram alerts are off — set GPT_NOTIFY_BOT_TOKEN and GPT_NOTIFY_CHAT_ID '
          + '(or TELEGRAM_ASSISTANT_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID). Leads are still stored.',
      );
    }
    return { status: 'skipped_unconfigured', source: cfg.source };
  }
  try {
    // Numeric ids are the normal case; a `@channelusername` target is also
    // legal for the Bot API and must survive as a string.
    const chatId = (/^-?\d+$/.test(cfg.chatId) ? Number(cfg.chatId) : cfg.chatId) as number;
    const client = new TelegramClient(cfg.token);
    const res = await client.sendMessage(chatId, rendered.text, {
      parseMode: 'HTML',
      ...(rendered.keyboard ? { keyboard: rendered.keyboard } : {}),
    });
    if (res.ok) return { status: 'sent', source: cfg.source };
    return { status: 'failed', errorCode: res.error_code, source: cfg.source };
  } catch (e) {
    console.error(`gpt-chat: owner alert threw ${(e as Error).name}`);
    return { status: 'failed', source: cfg.source };
  }
}

/** Convenience: render then send. */
export function notifyOwnerOfLead(env: BridgeEnv, alert: LeadAlert): Promise<NotifyResult> {
  return sendOwnerAlert(env, buildLeadAlert(alert));
}

/**
 * The muted-ceiling notice. Sent at most once per hour (the caller enforces
 * that with the same counter that muted the alerts), so the owner learns that
 * the flood happened instead of silently missing a real enquiry inside it.
 */
export function buildMutedNotice(count: number, limit: number): RenderedAlert {
  return {
    text:
      '🔕 <b>Заявки из AI-чата временно не присылаются</b>\n\n'
      + `За последний час их пришло ${count} при пороге ${limit}. `
      + 'Все заявки продолжают сохраняться в базе — уведомления возобновятся автоматически в следующем часе.',
  };
}

/**
 * Read the tail of a web conversation for the alert. Called only after the
 * consent flag has been checked, so an un-consented lead never touches the
 * message table at all.
 */
export async function loadTranscript(
  db: D1Database,
  sessionId: string,
  limit = MAX_TURNS_IN_ALERT,
): Promise<TranscriptTurn[]> {
  try {
    const rows = await db
      .prepare(
        `SELECT role, content FROM gpt_messages
         WHERE session_id = ? AND role IN ('user','assistant')
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .bind(sessionId, Math.max(1, Math.min(20, limit)))
      .all<{ role: string; content: string }>();
    return (rows.results || [])
      .map((r) => ({ role: r.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: r.content || '' }))
      .reverse();
  } catch {
    return [];
  }
}

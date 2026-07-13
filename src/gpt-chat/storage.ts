// localStorage persistence for the anonymous chat session + history.
// Fails silently in private mode / storage-disabled browsers.
import type { ChatMessage, Locale } from './types';

const SID_KEY = 'gptchat_sid';
const HIST_KEY = 'gptchat_history';
const REMAINING_KEY = 'gptchat_remaining';

function localeKey(base: string, locale: Locale): string {
  return `${base}_${locale}`;
}

export function loadSessionId(locale: Locale): string | null {
  try {
    return localStorage.getItem(localeKey(SID_KEY, locale)) ?? (locale === 'ru' ? localStorage.getItem(SID_KEY) : null);
  } catch {
    return null;
  }
}

export function saveSessionId(id: string, locale: Locale): void {
  try {
    localStorage.setItem(localeKey(SID_KEY, locale), id);
  } catch {
    /* noop */
  }
}

export function clearSessionId(locale: Locale): void {
  try {
    localStorage.removeItem(localeKey(SID_KEY, locale));
    if (locale === 'ru') localStorage.removeItem(SID_KEY);
  } catch {
    /* noop */
  }
}

export function loadRemaining(locale: Locale): number {
  try {
    const raw = localStorage.getItem(localeKey(REMAINING_KEY, locale));
    if (raw === null) return -1;
    const parsed = JSON.parse(raw) as { value?: unknown; date?: unknown };
    if (parsed.date !== new Date().toISOString().slice(0, 10)) return -1;
    const value = Number(parsed.value);
    return Number.isInteger(value) && value >= 0 ? value : -1;
  } catch {
    return -1;
  }
}

export function saveRemaining(remaining: number, locale: Locale): void {
  if (!Number.isInteger(remaining) || remaining < 0) return;
  try {
    localStorage.setItem(localeKey(REMAINING_KEY, locale), JSON.stringify({ value: remaining, date: new Date().toISOString().slice(0, 10) }));
  } catch {
    /* noop */
  }
}

export function loadHistory(locale: Locale): ChatMessage[] {
  try {
    const raw = localStorage.getItem(localeKey(HIST_KEY, locale)) ?? (locale === 'ru' ? localStorage.getItem(HIST_KEY) : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-40)
      .map((m) => ({ role: m.role, content: m.content, model: m.model ?? null }));
  } catch {
    return [];
  }
}

export function saveHistory(messages: ChatMessage[], locale: Locale): void {
  try {
    const clean = messages
      .filter((m) => !m.pending && !m.error)
      .map((m) => ({ role: m.role, content: m.content, model: m.model ?? null }))
      .slice(-40);
    localStorage.setItem(localeKey(HIST_KEY, locale), JSON.stringify(clean));
  } catch {
    /* noop */
  }
}

export function clearHistory(locale: Locale): void {
  try {
    localStorage.removeItem(localeKey(HIST_KEY, locale));
    if (locale === 'ru') localStorage.removeItem(HIST_KEY);
  } catch {
    /* noop */
  }
}

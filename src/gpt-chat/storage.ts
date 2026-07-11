// localStorage persistence for the anonymous chat session + history.
// Fails silently in private mode / storage-disabled browsers.
import type { ChatMessage } from './types';

const SID_KEY = 'gptchat_sid';
const HIST_KEY = 'gptchat_history';

export function loadSessionId(): string | null {
  try {
    return localStorage.getItem(SID_KEY);
  } catch {
    return null;
  }
}

export function saveSessionId(id: string): void {
  try {
    localStorage.setItem(SID_KEY, id);
  } catch {
    /* noop */
  }
}

export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HIST_KEY);
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

export function saveHistory(messages: ChatMessage[]): void {
  try {
    const clean = messages
      .filter((m) => !m.pending && !m.error)
      .map((m) => ({ role: m.role, content: m.content, model: m.model ?? null }))
      .slice(-40);
    localStorage.setItem(HIST_KEY, JSON.stringify(clean));
  } catch {
    /* noop */
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HIST_KEY);
  } catch {
    /* noop */
  }
}

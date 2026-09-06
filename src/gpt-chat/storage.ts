// localStorage persistence for the anonymous chat session + history.
// Fails silently in private mode / storage-disabled browsers.
import type { ChatMessage, Locale } from "./types";
import { isOpaqueStorageKey } from "./types";

const SID_KEY = "gptchat_sid";
const HIST_KEY = "gptchat_history";
const REMAINING_KEY = "gptchat_remaining";
const OFFER_KEY = "gptchat_offer_dismissed";

function localeKey(base: string, locale: Locale, scope?: string): string {
  if (scope !== undefined && !isOpaqueStorageKey(scope)) throw new Error("Invalid account storage scope");
  return scope ? `${base}_account_${scope}_${locale}` : `${base}_${locale}`;
}

export function loadSessionId(locale: Locale, scope?: string): string | null {
  try {
    return (
      localStorage.getItem(localeKey(SID_KEY, locale, scope)) ??
      (!scope && locale === "ru" ? localStorage.getItem(SID_KEY) : null)
    );
  } catch {
    return null;
  }
}

export function saveSessionId(id: string, locale: Locale, scope?: string): void {
  try {
    localStorage.setItem(localeKey(SID_KEY, locale, scope), id);
  } catch {
    /* noop */
  }
}

export function clearSessionId(locale: Locale, scope?: string): void {
  try {
    localStorage.removeItem(localeKey(SID_KEY, locale, scope));
    if (!scope && locale === "ru") localStorage.removeItem(SID_KEY);
  } catch {
    /* noop */
  }
}

export function loadRemaining(locale: Locale, scope?: string): number {
  try {
    const raw = localStorage.getItem(localeKey(REMAINING_KEY, locale, scope));
    if (raw === null) return -1;
    const parsed = JSON.parse(raw) as { value?: unknown; date?: unknown };
    if (parsed.date !== new Date().toISOString().slice(0, 10)) return -1;
    const value = Number(parsed.value);
    return Number.isInteger(value) && value >= 0 ? value : -1;
  } catch {
    return -1;
  }
}

export function saveRemaining(remaining: number, locale: Locale, scope?: string): void {
  if (!Number.isInteger(remaining) || remaining < 0) return;
  try {
    localStorage.setItem(
      localeKey(REMAINING_KEY, locale, scope),
      JSON.stringify({
        value: remaining,
        date: new Date().toISOString().slice(0, 10),
      }),
    );
  } catch {
    /* noop */
  }
}

/**
 * "Dismissed the commercial offer" survives a reload for the rest of the day.
 * Re-pitching someone on every page load is exactly the nagging the funnel is
 * meant to avoid; a day later is a new visit and a fair second ask.
 */
export function loadOfferDismissed(locale: Locale, scope?: string): boolean {
  try {
    return (
      localStorage.getItem(localeKey(OFFER_KEY, locale, scope)) ===
      new Date().toISOString().slice(0, 10)
    );
  } catch {
    return false;
  }
}

export function saveOfferDismissed(locale: Locale, scope?: string): void {
  try {
    localStorage.setItem(
      localeKey(OFFER_KEY, locale, scope),
      new Date().toISOString().slice(0, 10),
    );
  } catch {
    /* noop */
  }
}

export function loadHistory(locale: Locale, scope?: string): ChatMessage[] {
  try {
    const raw =
      localStorage.getItem(localeKey(HIST_KEY, locale, scope)) ??
      (!scope && locale === "ru" ? localStorage.getItem(HIST_KEY) : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      )
      .slice(-40)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 100_000),
        model: typeof m.model === "string" ? m.model : null,
        partial: m.partial === true,
      }));
  } catch {
    return [];
  }
}

export function saveHistory(messages: ChatMessage[], locale: Locale, scope?: string): void {
  try {
    const clean = messages
      .filter((m) => !m.pending && !m.error)
      .map((m) => ({
        role: m.role,
        content: m.content,
        model: m.model ?? null,
        partial: m.partial === true,
      }))
      .slice(-40);
    localStorage.setItem(localeKey(HIST_KEY, locale, scope), JSON.stringify(clean));
  } catch {
    /* noop */
  }
}

export function clearHistory(locale: Locale, scope?: string): void {
  try {
    localStorage.removeItem(localeKey(HIST_KEY, locale, scope));
    if (!scope && locale === "ru") localStorage.removeItem(HIST_KEY);
  } catch {
    /* noop */
  }
}

export interface SavedChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  savedAt: number;
}
export function loadChats(locale: Locale, scope?: string): SavedChat[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(localeKey("gptchat_dialogs", locale, scope)) || "[]",
    );
    return Array.isArray(value)
      ? value
          .filter(
            (c) =>
              c &&
              typeof c.id === "string" &&
              typeof c.title === "string" &&
              Array.isArray(c.messages),
          )
          .slice(0, 10)
          .map((c) => ({
            ...c,
            title: c.title.slice(0, 80),
            messages: c.messages
              .filter(
                (m: ChatMessage) =>
                  m &&
                  (m.role === "user" || m.role === "assistant") &&
                  typeof m.content === "string",
              )
              .slice(-40)
              .map((m: ChatMessage) => ({
                role: m.role,
                content: m.content.slice(0, 100_000),
                model: typeof m.model === "string" ? m.model : null,
                partial: m.partial === true,
              })),
          }))
      : [];
  } catch {
    return [];
  }
}
export function archiveChat(
  messages: ChatMessage[],
  locale: Locale,
  scope?: string,
): SavedChat[] {
  const clean = messages
    .filter((m) => !m.pending && !m.error && !m.streaming)
    .slice(-40);
  if (!clean.length) return loadChats(locale, scope);
  const chat: SavedChat = {
    id: crypto.randomUUID(),
    title: (clean.find((m) => m.role === "user")?.content || "…").slice(0, 80),
    messages: clean,
    savedAt: Date.now(),
  };
  const next = [chat, ...loadChats(locale, scope)].slice(0, 10);
  try {
    localStorage.setItem(localeKey("gptchat_dialogs", locale, scope), JSON.stringify(next));
  } catch {
    /* history remains visible if storage is full */
  }
  return next;
}

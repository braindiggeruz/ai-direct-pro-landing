// localStorage persistence for the anonymous chat session + history.
// Fails silently in private mode / storage-disabled browsers.
import type { ChatMessage, Locale } from "./types";
import { isOpaqueStorageKey } from "./types";

const SID_KEY = "gptchat_sid";
const HIST_KEY = "gptchat_history";
const REMAINING_KEY = "gptchat_remaining";
const OFFER_KEY = "gptchat_offer_dismissed";
const DRAFT_KEY = "gptchat_draft";
const BUSINESS_LINE_KEY = "gptchat_b2b_line";
/** A refused question waits in the composer this long, e.g. across a trip to the payment page. */
export const DRAFT_TTL_MS = 60 * 60_000;

function scopeKey(base: string, scope?: string): string {
  if (scope !== undefined && !isOpaqueStorageKey(scope)) throw new Error("Invalid account storage scope");
  return scope ? `${base}_account_${scope}` : base;
}

function localeKey(base: string, locale: Locale, scope?: string): string {
  return `${scopeKey(base, scope)}_${locale}`;
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

/**
 * The last count of answers left that the chat's own answers reported (the
 * guest's account view does not carry one, decision L18). One key for the RU
 * and UZ chats, because the server counts one allowance for both; in
 * sessionStorage, so a new visit asks the server rather than a stale number.
 */
export function loadRemaining(scope?: string): number {
  try {
    const raw = sessionStorage.getItem(scopeKey(REMAINING_KEY, scope));
    if (raw === null) return -1;
    const parsed = JSON.parse(raw) as { value?: unknown; date?: unknown };
    if (parsed.date !== new Date().toISOString().slice(0, 10)) return -1;
    const value = Number(parsed.value);
    return Number.isInteger(value) && value >= 0 ? value : -1;
  } catch {
    return -1;
  }
}

export function saveRemaining(remaining: number, scope?: string): void {
  if (!Number.isInteger(remaining) || remaining < 0) return;
  try {
    sessionStorage.setItem(
      scopeKey(REMAINING_KEY, scope),
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
 * The question a limit refused, kept while the limit lasts (plan WP-06), so a
 * reload or the payment page does not lose it. Not scoped to an account: the
 * point is to find it again after signing in to buy a pack.
 */
export function loadDraft(now = Date.now()): string {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw === null) return "";
    const parsed = JSON.parse(raw) as { text?: unknown; savedAt?: unknown };
    return typeof parsed.text === "string" && typeof parsed.savedAt === "number"
      && now - parsed.savedAt >= 0 && now - parsed.savedAt < DRAFT_TTL_MS
      ? parsed.text
      : "";
  } catch {
    return "";
  }
}

export function saveDraft(text: string, now = Date.now()): void {
  try {
    if (text.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, savedAt: now }));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* noop */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
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

/**
 * The business line (plan WP-20) shows once per browser session, in either
 * language: once it has shown, a new conversation or a reload does not bring
 * it back. sessionStorage, so the next visit may ask once more; closing it
 * keeps it away for the day (saveOfferDismissed, shared with the business card).
 */
export function loadBusinessLineShown(): boolean {
  try {
    return sessionStorage.getItem(BUSINESS_LINE_KEY) !== null;
  } catch {
    // Unknown is "shown": without storage the line would come back on every reload.
    return true;
  }
}

export function saveBusinessLineShown(): void {
  try {
    sessionStorage.setItem(BUSINESS_LINE_KEY, "1");
  } catch {
    /* noop */
  }
}

/**
 * True the first time `key` is asked in this browser session, false after
 * (sessionStorage). Without storage, true: said once on this page instead.
 */
export function onceThisSession(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) !== null) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    /* noop */
  }
  return true;
}

/**
 * Whether the conversation on screen stays when the account view answers
 * again after failed reads (F11, plan WP-06). Meanwhile the chat answered as
 * a guest with the same cookies, so what was said belongs to the identity
 * that now answers, unless the page had known another one before the reads
 * failed. Otherwise (nothing said, a first view, another identity) that
 * identity's stored history loads as on any visit.
 *
 * @param previous the last view's identity; null after failed reads, and before the first view
 * @param established the last identity a view named, or null
 * @param next the identity the view names now
 * @param shown something is on screen or a turn is under way
 */
export function keepsShownConversation(
  previous: string | null,
  established: string | null,
  next: string,
  shown: boolean,
): boolean {
  return shown && previous === null && (established === null || established === next);
}

/**
 * Whether the composer keeps its text when the account view names a new
 * identity (plan WP-17). Signing in at this keyboard — the guest becomes an
 * account, as on the way limit → pack window → sign-in → payment — keeps the
 * question. Signing out or another account starts empty: that text may be
 * someone else's.
 *
 * @param established the last identity a view named
 * @param next the identity the view names now
 */
export function keepsComposer(established: string, next: string): boolean {
  return established === next || (established === "guest" && next !== "guest");
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
        truncated: m.truncated === true,
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
        truncated: m.truncated === true,
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
                truncated: m.truncated === true,
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

// Thin client for the /api/gpt/* endpoints. All calls are same-origin.
import type { ChatApiResponse, ChatMessage, Locale } from './types';
import type { LeadBudget } from '../shared/lead-budget';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export interface TurnstilePublicConfig {
  required: boolean;
  siteKey: string | null;
}

export async function fetchTurnstileConfig(apiBase: string): Promise<TurnstilePublicConfig> {
  const res = await fetch(`${apiBase}/api/auth/config`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('turnstile config unavailable');
  const data = await res.json() as {
    turnstileRequired?: unknown;
    turnstileSiteKey?: unknown;
  };
  return {
    required: data.turnstileRequired === true,
    siteKey: typeof data.turnstileSiteKey === 'string' && data.turnstileSiteKey
      ? data.turnstileSiteKey
      : null,
  };
}

export async function createSession(apiBase: string, locale: Locale): Promise<string | null> {
  try {
    const data = await postJson<{ ok: boolean; sessionId?: string }>(`${apiBase}/api/gpt/session`, {
      locale,
      source: 'gpt_chat',
    });
    return data.sessionId ?? null;
  } catch {
    return null;
  }
}

export async function sendChat(
  apiBase: string,
  params: { sessionId: string | null; message: string; locale: Locale; history: ChatMessage[]; turnstileToken?: string },
): Promise<ChatApiResponse> {
  try {
    return await postJson<ChatApiResponse>(`${apiBase}/api/gpt/chat`, {
      sessionId: params.sessionId,
      message: params.message,
      locale: params.locale,
      history: params.history.map((m) => ({ role: m.role, content: m.content })),
      turnstileToken: params.turnstileToken,
    });
  } catch {
    return { ok: false, code: 'network', message: 'network error' };
  }
}

export interface StreamCallbacks {
  onMeta?: (meta: { sessionId?: string; model?: string }) => void;
  onDelta: (text: string) => void;
}

export type StreamOutcome =
  | {
      mode: 'stream'; ok: boolean; aborted?: boolean; code?: string; remaining?: number;
      /** Free tier: answers left in the rolling hour; null for a pack or an older server. */
      hourRemaining?: number | null;
      /** Cut at the length limit, and so not charged (plan decision L4). */
      truncated?: boolean;
      charged?: boolean;
      modelUsed?: string; sessionId?: string; gotText: boolean;
    }
  | { mode: 'json'; res: ChatApiResponse };

/**
 * When a refused turn fits again, in seconds: the 429 body's retryAfterSec,
 * else its Retry-After header (delta-seconds), else null.
 */
export function retryAfterSeconds(body: unknown, header: string | null): number | null {
  const value = body && typeof body === 'object' ? (body as { retryAfterSec?: unknown }).retryAfterSec : undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  return header !== null && /^\d+$/.test(header.trim()) ? Number(header.trim()) : null;
}

function answerCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

// Streaming chat turn. Sends stream:true; if the server answers with SSE the
// deltas are delivered via callbacks, otherwise the parsed JSON response is
// returned for the regular non-stream handling path.
export async function sendChatStream(
  apiBase: string,
  params: { sessionId: string | null; message: string; locale: Locale; history: ChatMessage[]; turnstileToken?: string },
  cb: StreamCallbacks,
  signal: AbortSignal,
): Promise<StreamOutcome> {
  let gotText = false;
  let hasAnswerText = false;
  try {
    const res = await fetch(`${apiBase}/api/gpt/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: params.sessionId,
        message: params.message,
        locale: params.locale,
        history: params.history.map((m) => ({ role: m.role, content: m.content })),
        turnstileToken: params.turnstileToken,
        stream: true,
      }),
      signal,
    });
    const type = res.headers.get('Content-Type') || '';
    if (!type.includes('text/event-stream')) {
      const body = (await res.json()) as ChatApiResponse;
      return {
        mode: 'json',
        res: res.status === 429 && body.code === 'limit_reached'
          ? { ...body, retryAfterSec: retryAfterSeconds(body, res.headers.get('Retry-After')) }
          : body,
      };
    }
    if (!res.body) return { mode: 'stream', ok: false, code: 'network', gotText };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let outcome: StreamOutcome = { mode: 'stream', ok: false, code: 'provider_error', gotText };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6)) as {
            type: string; text?: string; sessionId?: string; model?: string; remaining?: number;
            hourRemaining?: unknown; truncated?: unknown; charged?: unknown; modelUsed?: string; code?: string;
          };
          if (ev.type === 'meta') cb.onMeta?.({ sessionId: ev.sessionId, model: ev.model });
          else if (ev.type === 'delta' && ev.text) {
            gotText = true;
            hasAnswerText ||= ev.text.trim().length > 0;
            cb.onDelta(ev.text);
          }
          // A terminal event confirms completion, not that an answer exists.
          // Empty completions must not render blank replies or count as success.
          // An older server sends neither truncated nor charged: an answer
          // was charged unless the server says it was not.
          else if (ev.type === 'done') outcome = hasAnswerText
            ? {
                mode: 'stream', ok: true, remaining: ev.remaining, hourRemaining: answerCount(ev.hourRemaining),
                truncated: ev.truncated === true, charged: ev.charged !== false, modelUsed: ev.modelUsed, gotText,
              }
            : { mode: 'stream', ok: false, code: 'empty_response', gotText };
          else if (ev.type === 'error') outcome = { mode: 'stream', ok: false, code: ev.code || 'provider_error', gotText };
        } catch { /* skip malformed line */ }
      }
    }
    return { ...outcome, gotText };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { mode: 'stream', ok: false, aborted: true, gotText };
    return { mode: 'stream', ok: false, code: 'network', gotText };
  }
}

export interface LeadPayload {
  /** Stable across retries so one browser action produces one durable lead. */
  requestId: string;
  turnstileToken?: string;
  name?: string;
  phone?: string;
  telegram?: string;
  /** 'phone' | 'telegram' — how the operator should reach the person. */
  contactType?: string;
  contactValue?: string;
  intent?: string;
  sessionId?: string | null;
  consent: boolean;
  pageUrl?: string;
  /**
   * Which chat form sent it, always named: gpt_chat is the business card
   * (AiOfferCard), chat_b2b the business line after a first answer. The
   * server stores a lead that names no source as 'unknown'.
   */
  source: ChatLeadSource;
  /** The visitor's choice from the closed budget list; absent when none was chosen. */
  budget?: LeadBudget;
  /** Structured, non-message business context accepted by the existing lead endpoint. */
  utm?: Record<string, string>;
}

export type ChatLeadSource = 'gpt_chat' | 'chat_b2b';

export interface LeadResult {
  ok: boolean;
  /** 'network' | 'invalid_lead' | 'store_failed' | 'bad_json' | … */
  code?: string;
}

// The endpoint answers 200 with { ok:false, code } for a rejected or unstored
// lead, so a truthy response is not success. The server's own message is never
// returned: like every other failure in this island the UI shows curated copy.
export async function sendLead(apiBase: string, payload: LeadPayload): Promise<LeadResult> {
  try {
    const res = await postJson<{ ok?: unknown; code?: unknown }>(`${apiBase}/api/gpt/lead`, payload);
    if (res.ok === true) return { ok: true };
    return { ok: false, code: typeof res.code === 'string' ? res.code : 'rejected' };
  } catch {
    return { ok: false, code: 'network' };
  }
}

// Thin client for the /api/gpt/* endpoints. All calls are same-origin.
import type { ChatApiResponse, ChatMessage, Locale } from './types';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
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
  | { mode: 'stream'; ok: boolean; aborted?: boolean; code?: string; remaining?: number; modelUsed?: string; sessionId?: string; gotText: boolean }
  | { mode: 'json'; res: ChatApiResponse };

// Streaming chat turn. Sends stream:true; if the server answers with SSE the
// deltas are delivered via callbacks, otherwise the parsed JSON response is
// returned for the regular non-stream handling path.
export async function sendChatStream(
  apiBase: string,
  params: { sessionId: string | null; message: string; locale: Locale; history: ChatMessage[] },
  cb: StreamCallbacks,
  signal: AbortSignal,
): Promise<StreamOutcome> {
  let gotText = false;
  try {
    const res = await fetch(`${apiBase}/api/gpt/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: params.sessionId,
        message: params.message,
        locale: params.locale,
        history: params.history.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
      signal,
    });
    const type = res.headers.get('Content-Type') || '';
    if (!type.includes('text/event-stream')) {
      return { mode: 'json', res: (await res.json()) as ChatApiResponse };
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
          const ev = JSON.parse(line.slice(6)) as { type: string; text?: string; sessionId?: string; model?: string; remaining?: number; modelUsed?: string; code?: string };
          if (ev.type === 'meta') cb.onMeta?.({ sessionId: ev.sessionId, model: ev.model });
          else if (ev.type === 'delta' && ev.text) { gotText = true; cb.onDelta(ev.text); }
          else if (ev.type === 'done') outcome = { mode: 'stream', ok: true, remaining: ev.remaining, modelUsed: ev.modelUsed, gotText };
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
  name?: string;
  phone?: string;
  telegram?: string;
  contactValue?: string;
  intent?: string;
  sessionId?: string | null;
  consent: boolean;
  pageUrl?: string;
  /** Structured, non-message business context accepted by the existing lead endpoint. */
  utm?: Record<string, string>;
}

export async function sendLead(apiBase: string, payload: LeadPayload): Promise<{ ok: boolean }> {
  try {
    return await postJson<{ ok: boolean }>(`${apiBase}/api/gpt/lead`, payload);
  } catch {
    return { ok: false };
  }
}

export interface SubscribeResult {
  ok: boolean;
  mode?: 'manual' | 'checkout';
  checkoutUrl?: string | null;
  message?: string;
}

export async function subscribe(apiBase: string, plan: 'plus' | 'business', sessionId: string | null): Promise<SubscribeResult> {
  try {
    return await postJson<SubscribeResult>(`${apiBase}/api/gpt/subscribe`, { plan, sessionId });
  } catch {
    return { ok: false };
  }
}

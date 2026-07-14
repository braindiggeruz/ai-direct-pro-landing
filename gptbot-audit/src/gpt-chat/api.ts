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

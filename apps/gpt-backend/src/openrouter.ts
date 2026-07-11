// Server-side OpenRouter orchestration: model fallback chain, non-streaming
// + SSE streaming. API key stays server-side. Never throws — returns a
// structured result; provider errors are surfaced for logging by the caller.
import type { BackendConfig } from './env.js';
import type { ChatMessage } from './prompt.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatOk {
  ok: true;
  content: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}
export interface ChatErr {
  ok: false;
  errorCode: 'no_key' | 'rate_limit' | 'provider_error' | 'timeout' | 'empty';
  status?: number;
  model?: string;
  detail?: string;
}
export type ChatResult = ChatOk | ChatErr;

/** PURE — request body builder (unit-tested). No response_format (free-form). */
export function buildBody(model: string, messages: ChatMessage[], maxTokens: number, stream = false) {
  return { model, messages, temperature: 0.6, max_tokens: maxTokens, stream };
}

function headers(cfg: BackendConfig) {
  return {
    Authorization: `Bearer ${cfg.openrouter.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': cfg.siteUrl,
    'X-Title': 'GPTBot.uz AI Chat',
  };
}

async function callOne(cfg: BackendConfig, model: string, messages: ChatMessage[], maxTokens: number, timeoutMs: number): Promise<ChatResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: headers(cfg), body: JSON.stringify(buildBody(model, messages, maxTokens)), signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, errorCode: res.status === 429 ? 'rate_limit' : 'provider_error', status: res.status, model };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    if (data.error) return { ok: false, errorCode: 'provider_error', model, detail: data.error.message };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return { ok: false, errorCode: 'empty', model };
    return { ok: true, content, modelUsed: model, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, errorCode: (e as Error).name === 'AbortError' ? 'timeout' : 'provider_error', model, detail: (e as Error).message };
  }
}

/** Walk the model chain until one succeeds. onError logs each failure. */
export async function chatComplete(
  cfg: BackendConfig,
  chain: string[],
  messages: ChatMessage[],
  opts: { maxTokens?: number; timeoutMs?: number; onError?: (e: ChatErr) => void } = {},
): Promise<ChatResult> {
  if (!cfg.openrouter.apiKey) return { ok: false, errorCode: 'no_key' };
  let last: ChatResult = { ok: false, errorCode: 'provider_error' };
  for (const model of chain) {
    last = await callOne(cfg, model, messages, opts.maxTokens ?? 900, opts.timeoutMs ?? 45_000);
    if (last.ok) return last;
    if (!last.ok && opts.onError) opts.onError(last);
  }
  return last;
}

/**
 * Streaming variant — yields text deltas via `onDelta`. Tries first model
 * that streams; on stream failure falls back to non-streaming chatComplete.
 * Returns the full aggregated result for persistence.
 */
export async function chatStream(
  cfg: BackendConfig,
  chain: string[],
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  opts: { maxTokens?: number; timeoutMs?: number; onError?: (e: ChatErr) => void } = {},
): Promise<ChatResult> {
  if (!cfg.openrouter.apiKey) return { ok: false, errorCode: 'no_key' };
  const model = chain[0]!;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify(buildBody(model, messages, opts.maxTokens ?? 900, true)),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      clearTimeout(timer);
      if (opts.onError) opts.onError({ ok: false, errorCode: res.status === 429 ? 'rate_limit' : 'provider_error', status: res.status, model });
      // Fallback: non-streaming across remaining chain.
      const r = await chatComplete(cfg, chain, messages, opts);
      if (r.ok) onDelta(r.content);
      return r;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) { full += delta; onDelta(delta); }
        } catch { /* ignore keep-alive / partial */ }
      }
    }
    clearTimeout(timer);
    if (!full.trim()) return { ok: false, errorCode: 'empty', model };
    return { ok: true, content: full, modelUsed: model, inputTokens: 0, outputTokens: 0 };
  } catch (e) {
    clearTimeout(timer);
    const err: ChatErr = { ok: false, errorCode: (e as Error).name === 'AbortError' ? 'timeout' : 'provider_error', model, detail: (e as Error).message };
    if (opts.onError) opts.onError(err);
    const r = await chatComplete(cfg, chain.slice(1).length ? chain.slice(1) : chain, messages, opts);
    if (r.ok) onDelta(r.content);
    return r;
  }
}

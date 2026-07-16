// Streaming variant of the OpenRouter chat call. Walks the same model
// fallback chain as chatComplete, but with stream:true — a model only
// "wins" once it returns a 2xx SSE response; failures before the first
// byte advance the chain. The caller pipes the upstream SSE body.
import type { Env } from '../../_types';
import type { ChatMessage } from './prompt';
import type { GptChatConfig } from './config';
import { buildChatBody } from './openrouter-chat';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export type StreamStart =
  | { ok: true; body: ReadableStream<Uint8Array>; model: string; abort: () => void }
  | { ok: false; errorCode: string };

export async function chatStreamStart(
  env: Env,
  cfg: GptChatConfig,
  chain: string[],
  messages: ChatMessage[],
  maxTokens = 900,
  timeoutMs = 60_000,
): Promise<StreamStart> {
  if (!env.OPENROUTER_API_KEY) return { ok: false, errorCode: 'no_key' };
  let lastCode = 'provider_error';
  for (const model of chain) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': cfg.siteUrl,
          'X-Title': 'GPTBot.uz AI Chat',
        },
        body: JSON.stringify({
          ...buildChatBody(model, messages, maxTokens),
          stream: true,
          // Final SSE chunk carries prompt/completion token usage.
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        clearTimeout(timer);
        lastCode = res.status === 429 ? 'rate_limit' : 'provider_error';
        continue;
      }
      // Keep the timeout armed for the WHOLE stream: a stalled upstream is
      // aborted, which surfaces as a read error in the pump.
      return {
        ok: true,
        body: res.body,
        model,
        abort: () => { clearTimeout(timer); controller.abort(); },
      };
    } catch (e) {
      clearTimeout(timer);
      lastCode = (e as Error).name === 'AbortError' ? 'timeout' : 'provider_error';
    }
  }
  return { ok: false, errorCode: lastCode };
}

export interface SseEvent {
  delta?: string;
  done?: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Incremental parser for OpenRouter's SSE wire format. Feed decoded text
 * chunks; returns extracted events. Keeps partial lines in `state.buffer`.
 */
export function parseSseChunk(state: { buffer: string }, chunk: string): SseEvent[] {
  state.buffer += chunk;
  const events: SseEvent[] = [];
  let idx: number;
  while ((idx = state.buffer.indexOf('\n')) >= 0) {
    const line = state.buffer.slice(0, idx).replace(/\r$/, '');
    state.buffer = state.buffer.slice(idx + 1);
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6);
    if (payload === '[DONE]') { events.push({ done: true }); continue; }
    try {
      const data = JSON.parse(payload) as {
        choices?: { delta?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const delta = data.choices?.[0]?.delta?.content;
      const ev: SseEvent = {};
      if (typeof delta === 'string' && delta) ev.delta = delta;
      if (data.usage) {
        ev.inputTokens = data.usage.prompt_tokens;
        ev.outputTokens = data.usage.completion_tokens;
      }
      if (ev.delta !== undefined || ev.inputTokens !== undefined) events.push(ev);
    } catch { /* malformed keep-alive line — skip */ }
  }
  return events;
}

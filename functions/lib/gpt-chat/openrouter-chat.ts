// Server-side OpenRouter chat proxy for the consumer AI-chat.
//
// Distinct from functions/lib/llm/* (which is JSON-mode, feature-routed SEO
// tooling). This is a plain-text, multi-message chat call that walks an
// env-driven model fallback chain: primary → fallbacks. On rate-limit /
// 5xx / timeout it advances to the next model; on success it returns
// immediately. The OPENROUTER_API_KEY never leaves the server.
import type { Env } from '../../_types';
import type { ChatMessage } from './prompt';
import type { GptChatConfig } from './config';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatResult {
  ok: boolean;
  content?: string;
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Machine tag when ok=false: rate_limit | provider_error | timeout | no_key | empty */
  errorCode?: string;
}

interface ORResp {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string | number };
}

/** Build the request body once; only `model` changes across the chain. */
export function buildChatBody(model: string, messages: ChatMessage[], maxTokens: number) {
  return {
    model,
    messages,
    temperature: 0.6,
    max_tokens: maxTokens,
    // Penalties curb degenerate loops (small free models repeating a line).
    frequency_penalty: 0.5,
    presence_penalty: 0.3,
    // No response_format — this is free-form conversational output.
  };
}

async function callOne(
  env: Env,
  cfg: GptChatConfig,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  timeoutMs: number,
): Promise<ChatResult> {
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
      body: JSON.stringify(buildChatBody(model, messages, maxTokens)),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const retriable = res.status === 429 || res.status >= 500;
      return { ok: false, errorCode: retriable ? (res.status === 429 ? 'rate_limit' : 'provider_error') : 'provider_error' };
    }
    const data = (await res.json()) as ORResp;
    if (data.error) return { ok: false, errorCode: 'provider_error' };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return { ok: false, errorCode: 'empty' };
    return {
      ok: true,
      content,
      modelUsed: model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, errorCode: (e as Error).name === 'AbortError' ? 'timeout' : 'provider_error' };
  }
}

/**
 * Walk the model chain until one succeeds. Non-retriable failures on the
 * last candidate surface their errorCode. Never throws.
 */
export async function chatComplete(
  env: Env,
  cfg: GptChatConfig,
  chain: string[],
  messages: ChatMessage[],
  maxTokens = 900,
  timeoutMs = 45_000,
): Promise<ChatResult> {
  if (!env.OPENROUTER_API_KEY) return { ok: false, errorCode: 'no_key' };
  let last: ChatResult = { ok: false, errorCode: 'provider_error' };
  for (const model of chain) {
    last = await callOne(env, cfg, model, messages, maxTokens, timeoutMs);
    if (last.ok) return last;
    // Only keep walking on transient classes; a hard provider error on one
    // model may still resolve on the next architecture, so we continue.
  }
  return last;
}

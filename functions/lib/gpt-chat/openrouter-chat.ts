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
  /**
   * Machine tag when ok=false:
   * rate_limit | model_unavailable | provider_error | timeout | no_key | empty
   */
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

/**
 * Map an OpenRouter failure status onto a ChatResult errorCode.
 *
 * 400 and 404 are the shape a RETIRED MODEL SLUG takes: OpenRouter refuses the
 * request because the model is not in its catalogue, which is a configuration
 * fact that will still be true on the next attempt and on every attempt after
 * that. Folding it into `provider_error` is exactly what hid the 2026-09-04
 * outage: all three free slugs had been retired upstream, and for weeks the
 * chat reported the same generic code a five-minute upstream blip reports.
 * 429 stays transient (retry works) and 5xx stays a provider fault.
 */
export function classifyFailureStatus(status: number): string {
  if (status === 400 || status === 404) return 'model_unavailable';
  if (status === 429) return 'rate_limit';
  return 'provider_error';
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
    if (!res.ok) return { ok: false, errorCode: classifyFailureStatus(res.status) };
    const data = (await res.json()) as ORResp;
    // OpenRouter also reports upstream failures INSIDE a 200 envelope — an
    // overloaded vendor came back as HTTP 200 carrying error.code 502 during
    // the 2026-09-04 probes. Classify by the code in the body, not by the
    // envelope, or a dead model hidden in a 200 reads as a healthy answer that
    // happened to be empty.
    if (data.error) {
      const code = Number(data.error.code);
      return {
        ok: false,
        errorCode: Number.isFinite(code) && code > 0 ? classifyFailureStatus(code) : 'provider_error',
      };
    }
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
 * Walk the model chain until one succeeds. Never throws.
 *
 * Every failure class keeps the walk going — a rate-limited or retired model
 * may still resolve on the next vendor, which is what the chain is for. What
 * changed after 2026-09-04 is which code comes back when nothing resolves: if
 * EVERY candidate was rejected as an unknown model, the chain is stale
 * configuration rather than a bad afternoon on the internet, and it says so.
 * That distinction is the difference between reading one code and rediscovering
 * the whole outage from scratch.
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
  let everyCandidateUnavailable = chain.length > 0;
  for (const model of chain) {
    last = await callOne(env, cfg, model, messages, maxTokens, timeoutMs);
    if (last.ok) return last;
    if (last.errorCode !== 'model_unavailable') everyCandidateUnavailable = false;
    // Keep walking on every failure class: a hard failure on one model may
    // still resolve on the next vendor, so we continue.
  }
  // A single live candidate anywhere in the chain means the configuration is
  // fine and the last candidate's own code is the honest answer. Only when the
  // chain is unavailable end to end do we promote the diagnosis.
  return everyCandidateUnavailable ? { ok: false, errorCode: 'model_unavailable' } : last;
}

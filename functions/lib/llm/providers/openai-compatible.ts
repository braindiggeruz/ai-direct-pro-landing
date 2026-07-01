// Shared OpenAI-compatible chat-completions caller.
//
// Mistral, Groq, Cerebras, and OpenRouter all expose the OpenAI
// /v1/chat/completions surface (modulo per-provider quirks around
// response_format and Retry-After). One helper, three thin adapters that
// just supply baseUrl + auth header + provider id.
//
// Notes per provider:
//   * Mistral La Plateforme: full response_format support, returns
//     "object_required" when JSON schema fails (we don't use schema).
//   * Groq: response_format works on most models; qwen3-32b is broken
//     ("json_validate_failed") so the registry excludes it from JSON
//     features. Returns explicit `failed_generation` on validation fail.
//   * Cerebras: response_format works but reasoning_tokens are counted
//     against max_tokens — use 2000+ for short JSON to leave room.
//   * OpenRouter: usual response_format support.

import type { LlmCallInput, ProviderAttemptResult, LlmErrorClass } from '../types';

export interface OpenAiCompatibleCallOptions {
  url: string;                 // full chat-completions endpoint
  apiKey: string;
  model: string;
  input: LlmCallInput;
  /** Optional extra fields merged into the body (e.g. OpenRouter attribution headers). */
  extraBody?: Record<string, unknown>;
  /** Optional extra headers. */
  extraHeaders?: Record<string, string>;
}

interface ChatChoice { message?: { content?: string }; finish_reason?: string }
interface ChatResp {
  choices?: ChatChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string; type?: string; code?: string };
}

export async function callOpenAiCompatible(opts: OpenAiCompatibleCallOptions): Promise<ProviderAttemptResult> {
  const startedAt = Date.now();
  const { url, apiKey, model, input } = opts;
  const timeoutMs = input.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const body: Record<string, unknown> = {
    model,
    temperature: input.temperature ?? 0.4,
    max_tokens: input.maxTokens ?? 4000,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ],
    ...(input.jsonObject !== false ? { response_format: { type: 'json_object' } } : {}),
    ...(opts.extraBody || {}),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(opts.extraHeaders || {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const dt = Date.now() - startedAt;

    if (!res.ok) {
      const text = await res.text().catch((e) => { console.warn(`[openai-compat] failed to read error response body:`, (e as Error).message); return ''; });
      return classifyHttpFailure(res.status, text, dt);
    }

    const data = (await res.json()) as ChatResp;

    // Provider-level error inside a 200 body (e.g. Groq json_validate_failed).
    if (data.error) {
      const msg = data.error.message || 'provider returned error in 200 body';
      const c = data.error.code || '';
      const cls: LlmErrorClass =
        c === 'json_validate_failed' || /json/i.test(msg) ? 'invalid_json' :
        c === 'rate_limit_exceeded' ? 'rate_limit' :
        'unknown';
      return { ok: false, error: msg, error_class: cls, http_status: 200, duration_ms: dt, rawExcerpt: JSON.stringify(data).slice(0, 600) };
    }

    const choice = (data.choices || [])[0];
    const content = choice?.message?.content || '';
    const finishReason = choice?.finish_reason;
    if (!content) {
      return {
        ok: false,
        error: `Provider returned empty content (finish=${finishReason || 'unknown'})`,
        error_class: finishReason === 'content_filter' ? 'safety_blocked' : 'unknown',
        http_status: 200,
        duration_ms: dt,
      };
    }
    if (finishReason === 'length') {
      return {
        ok: false,
        error: 'Provider output truncated (finish_reason=length)',
        error_class: 'truncated',
        http_status: 200,
        duration_ms: dt,
      };
    }
    return {
      ok: true,
      content,
      finishReason,
      input_tokens: data.usage?.prompt_tokens,
      output_tokens: data.usage?.completion_tokens,
      duration_ms: dt,
    };
  } catch (e) {
    clearTimeout(timer);
    const dt = Date.now() - startedAt;
    const err = e as Error;
    if (err.name === 'AbortError') {
      return { ok: false, error: `Timed out after ${timeoutMs} ms`, error_class: 'timeout', duration_ms: dt };
    }
    return { ok: false, error: err.message || 'network error', error_class: 'network', duration_ms: dt };
  }
}

function classifyHttpFailure(status: number, body: string, duration_ms: number): ProviderAttemptResult {
  const cls: LlmErrorClass =
    status === 401 || status === 403 ? 'auth' :
    status === 400                    ? 'bad_request' :
    status === 429                    ? 'rate_limit' :
    status === 408 || status === 504  ? 'timeout' :
    status >= 500 && status <= 599    ? 'transient_5xx' :
    'unknown';
  return {
    ok: false,
    error: `HTTP ${status}`,
    error_class: cls,
    http_status: status,
    rawExcerpt: body.slice(0, 600),
    duration_ms,
  };
}

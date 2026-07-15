// Gemini provider adapter.
//
// Thin wrapper over the existing functions/lib/seo-autopilot/gemini-client.ts
// so the new multi-provider router can call Gemini through the same
// interface as Mistral / Groq / Cerebras. Behaviour unchanged from the
// single-purpose client: direct REST to Google's Generative Language API,
// strict JSON via responseMimeType, thinkingBudget honoured.
//
// The new adapter classifies error codes into the LlmErrorClass taxonomy so
// the router can decide retry vs hard-fail without reading provider-
// specific strings.

import type { Env } from '../../../_types';
import type { LlmProvider, LlmCallInput, ProviderAttemptResult, LlmErrorClass } from '../types';
import { callGemini } from '../../seo-autopilot/gemini-client';

function classifyGeminiError(message: string, status?: number): LlmErrorClass {
  const s = status ?? 0;
  if (s === 401 || s === 403) return 'auth';
  if (s === 400) return 'bad_request';
  if (s === 429) return 'rate_limit';
  if (s === 408 || s === 504) return 'timeout';
  if (s >= 500 && s <= 599) return 'transient_5xx';
  if (/timed out/i.test(message)) return 'timeout';
  if (/network|ENOTFOUND|abort/i.test(message)) return 'network';
  if (/safety|blockreason|prohibited|recitation/i.test(message)) return 'safety_blocked';
  if (/empty content|no candidates/i.test(message)) return 'safety_blocked';
  return 'unknown';
}

export const geminiProvider: LlmProvider = {
  id: 'gemini',

  isConfigured(env: Env): boolean {
    return !!env.GEMINI_API_KEY;
  },

  async call(env: Env, model: string, input: LlmCallInput): Promise<ProviderAttemptResult> {
    // Temporarily override env.GEMINI_MODEL via a shallow Env copy so the
    // existing single-purpose client honours our per-call model choice.
    // (The client reads env.GEMINI_MODEL at call time.) This avoids
    // changing the legacy client's signature.
    const scoped: Env = { ...env, GEMINI_MODEL: model } as Env;
    const r = await callGemini(scoped, {
      system: input.system,
      user: input.user,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      timeoutMs: input.timeoutMs,
      jsonObject: input.jsonObject !== false,
      thinkingBudget: input.thinkingBudget,
    });
    if (r.ok) {
      // Detect truncation reported via finishReason — emit as truncated.
      const finishReason = r.finishReason;
      if (finishReason && /MAX_TOKENS|LENGTH/i.test(finishReason)) {
        return {
          ok: false,
          error: 'Gemini output was truncated (finishReason=MAX_TOKENS)',
          error_class: 'truncated',
          duration_ms: r.durationMs,
        };
      }
      return {
        ok: true,
        content: r.content,
        finishReason,
        input_tokens: r.usage?.promptTokenCount,
        output_tokens: r.usage?.candidatesTokenCount,
        duration_ms: r.durationMs,
      };
    }
    return {
      ok: false,
      error: r.error,
      error_class: classifyGeminiError(r.error, r.status),
      http_status: r.status,
      rawExcerpt: r.rawExcerpt,
      duration_ms: r.durationMs,
    };
  },
};

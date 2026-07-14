// Groq Cloud adapter (OpenAI-compatible).
// Endpoint: https://api.groq.com/openai/v1/chat/completions
// Auth: Bearer GROQ_API_KEY
// JSON mode: response_format={type:'json_object'} — verified for
// llama-3.3-70b-versatile and openai/gpt-oss-120b. Other models in the
// account may not support it (qwen3-32b returns json_validate_failed).
// Free tier; very fast (~1 s wall on short prompts).

import type { Env } from '../../../_types';
import type { LlmProvider, LlmCallInput, ProviderAttemptResult } from '../types';
import { callOpenAiCompatible } from './openai-compatible';

const URL = 'https://api.groq.com/openai/v1/chat/completions';

export const groqProvider: LlmProvider = {
  id: 'groq',
  isConfigured(env: Env): boolean {
    return !!env.GROQ_API_KEY;
  },
  async call(env: Env, model: string, input: LlmCallInput): Promise<ProviderAttemptResult> {
    if (!env.GROQ_API_KEY) {
      return { ok: false, error: 'GROQ_API_KEY not configured', error_class: 'unavailable', duration_ms: 0 };
    }
    return callOpenAiCompatible({
      url: URL,
      apiKey: env.GROQ_API_KEY,
      model,
      input,
    });
  },
};

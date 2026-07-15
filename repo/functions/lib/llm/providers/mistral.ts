// Mistral La Plateforme adapter (OpenAI-compatible).
// Endpoint: https://api.mistral.ai/v1/chat/completions
// Auth: Bearer MISTRAL_API_KEY (server-only)
// JSON mode: response_format={type:'json_object'} — verified
// Tested 2026-06-23 with mistral-large/medium/small: all valid RU JSON.

import type { Env } from '../../../_types';
import type { LlmProvider, LlmCallInput, ProviderAttemptResult } from '../types';
import { callOpenAiCompatible } from './openai-compatible';

const URL = 'https://api.mistral.ai/v1/chat/completions';

export const mistralProvider: LlmProvider = {
  id: 'mistral',
  isConfigured(env: Env): boolean {
    return !!env.MISTRAL_API_KEY;
  },
  async call(env: Env, model: string, input: LlmCallInput): Promise<ProviderAttemptResult> {
    if (!env.MISTRAL_API_KEY) {
      return { ok: false, error: 'MISTRAL_API_KEY not configured', error_class: 'unavailable', duration_ms: 0 };
    }
    return callOpenAiCompatible({
      url: URL,
      apiKey: env.MISTRAL_API_KEY,
      model,
      input,
    });
  },
};

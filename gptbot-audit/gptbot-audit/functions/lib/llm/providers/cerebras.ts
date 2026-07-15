// Cerebras Inference adapter (OpenAI-compatible).
// Endpoint: https://api.cerebras.ai/v1/chat/completions
// Auth: Bearer CEREBRAS_API_KEY
// JSON mode: response_format={type:'json_object'} — verified for gpt-oss-120b.
// Caveat: Cerebras gpt-oss-120b is a reasoning model and reasoning_tokens
// are charged against max_tokens. Use max_output ≥ 2000 for short JSON
// to guarantee the visible JSON survives.

import type { Env } from '../../../_types';
import type { LlmProvider, LlmCallInput, ProviderAttemptResult } from '../types';
import { callOpenAiCompatible } from './openai-compatible';

const URL = 'https://api.cerebras.ai/v1/chat/completions';

export const cerebrasProvider: LlmProvider = {
  id: 'cerebras',
  isConfigured(env: Env): boolean {
    return !!env.CEREBRAS_API_KEY;
  },
  async call(env: Env, model: string, input: LlmCallInput): Promise<ProviderAttemptResult> {
    if (!env.CEREBRAS_API_KEY) {
      return { ok: false, error: 'CEREBRAS_API_KEY not configured', error_class: 'unavailable', duration_ms: 0 };
    }
    return callOpenAiCompatible({
      url: URL,
      apiKey: env.CEREBRAS_API_KEY,
      model,
      input,
    });
  },
};

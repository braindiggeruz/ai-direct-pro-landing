// OpenRouter adapter (OpenAI-compatible).
// Endpoint: https://openrouter.ai/api/v1/chat/completions
// Auth: Bearer OPENROUTER_API_KEY (+ HTTP-Referer + X-Title attribution headers).
// JSON mode: response_format={type:'json_object'} — verified.
// Kept for legacy editor AI-fill compatibility and last-ditch fallback
// when every primary/secondary provider is unavailable.

import type { Env } from '../../../_types';
import type { LlmProvider, LlmCallInput, ProviderAttemptResult } from '../types';
import { callOpenAiCompatible } from './openai-compatible';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

export const openrouterProvider: LlmProvider = {
  id: 'openrouter',
  isConfigured(env: Env): boolean {
    return !!env.OPENROUTER_API_KEY;
  },
  async call(env: Env, model: string, input: LlmCallInput): Promise<ProviderAttemptResult> {
    if (!env.OPENROUTER_API_KEY) {
      return { ok: false, error: 'OPENROUTER_API_KEY not configured', error_class: 'unavailable', duration_ms: 0 };
    }
    return callOpenAiCompatible({
      url: URL,
      apiKey: env.OPENROUTER_API_KEY,
      model,
      input,
      extraHeaders: {
        'HTTP-Referer': env.OPENROUTER_SITE_URL || 'https://gptbot.uz',
        'X-Title': env.OPENROUTER_APP_TITLE || 'GPTBot SEO Cockpit',
      },
    });
  },
};

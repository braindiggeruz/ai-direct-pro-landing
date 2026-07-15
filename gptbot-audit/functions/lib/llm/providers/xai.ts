// xAI Grok adapter (OpenAI-compatible).
// Endpoint: https://api.x.ai/v1/chat/completions
// Auth: Bearer XAI_API_KEY (server-only)
// JSON mode: response_format={type:'json_object'} — supported by Grok 2+.
// Used as a quality fallback for ru_article / optimizer when the
// operator has provided an xAI key. Skipped entirely when XAI_API_KEY
// is absent (router filters by isConfigured()).

import type { Env } from '../../../_types';
import type { LlmProvider, LlmCallInput, ProviderAttemptResult } from '../types';
import { callOpenAiCompatible } from './openai-compatible';

const URL = 'https://api.x.ai/v1/chat/completions';

export const xaiProvider: LlmProvider = {
  id: 'xai',
  isConfigured(env: Env): boolean {
    return !!env.XAI_API_KEY;
  },
  async call(env: Env, model: string, input: LlmCallInput): Promise<ProviderAttemptResult> {
    if (!env.XAI_API_KEY) {
      return { ok: false, error: 'XAI_API_KEY not configured', error_class: 'unavailable', duration_ms: 0 };
    }
    return callOpenAiCompatible({
      url: URL,
      apiKey: env.XAI_API_KEY,
      model,
      input,
    });
  },
};

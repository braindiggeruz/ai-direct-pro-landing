// Provider abstraction for the AI Autopilot tab.
// All providers return raw text; parsing + validation lives in the prompt module
// and the backend /api/seo/ai/validate-patch endpoint.

import type { AiProvider, AiPatchContext, AiSeoAction } from '../../../shared/ai-seo';

export interface AiProviderClient {
  readonly id: AiProvider;
  /** Best-effort runtime probe. Must never throw. */
  isAvailable(): Promise<boolean>;
  /** Discovered model id (if any). Empty string when unknown. */
  modelHint(): Promise<string>;
  /** Run a single completion. Returns raw text (expected to be strict JSON). */
  generate(input: {
    action: AiSeoAction;
    ctx: AiPatchContext;
    systemPrompt: string;
    userPrompt: string;
    /** Tight cap — patches are small. */
    maxTokens?: number;
  }): Promise<{ text: string; model?: string }>;
}

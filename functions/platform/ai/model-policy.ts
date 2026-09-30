// Per-model request policy shared by every OpenRouter caller that must get a
// direct answer: the consumer chat (functions/lib/gpt-chat/openrouter-chat.ts)
// and the AEO measurement (functions/platform/aeo/observation.ts). It lives in
// platform because both import it; platform imports nothing from lib.
//
// Reasoning. A model that thinks spends part of max_tokens on reasoning the
// visitor never sees, and its first content arrives later. Before 2026-09-30
// the chat sent no `reasoning` field at all, so nemotron and dots reasoned
// inside the same 900-token budget: 14.5% (nemotron) and 28.9% (dots) of the
// answers of the week to 2026-09-30 ended at that ceiling.
//
// Only models whose reasoning is OPTIONAL belong here: a model with mandatory
// reasoning answers {enabled:false} with a 400. Every id below was read from
// https://openrouter.ai/api/v1/models on 2026-09-30 with
// `reasoning.mandatory: false` (the gemma pair also `default_enabled: false`,
// so for them the field only pins today's behaviour). After a deploy the model
// probe (/api/internal/gpt-model-probe) must show reasoning_tokens = 0 for
// each of them; a model that is not listed keeps its provider default.

/** OpenRouter ids that are always asked to answer without reasoning. */
export const REASONING_OFF_MODELS: ReadonlySet<string> = new Set([
  "google/gemma-4-26b-a4b-it",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "dots-studio/dots-3-note-preview:free",
]);

export interface ReasoningOff {
  enabled: false;
  /** Never return reasoning text, even if a provider produces some. */
  exclude: true;
}

/** The OpenRouter `reasoning` field for a model, or undefined to send none. */
export function reasoningParam(model: string): ReasoningOff | undefined {
  return REASONING_OFF_MODELS.has(model) ? { enabled: false, exclude: true } : undefined;
}

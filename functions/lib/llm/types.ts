// Multi-provider LLM abstraction — shared types.
//
// The router accepts an LlmCallInput, walks the model-registry priority list
// for the requested `feature`, and asks each enabled provider to honour the
// call. Every provider returns a uniform LlmCallResult so the caller does
// not branch on provider name. Telemetry metadata travels with the result.
//
// Design constraints (from the GPTBot.uz production handoff):
//   * Never throw — failures surface as { ok: false, error_class, … }.
//   * Hard wall-clock timeout per call.
//   * Strict-JSON contract: every provider must implement responseFormat=json_object.
//   * Metadata MUST identify which physical model handled the call (primary
//     vs fallback) so the operator UI can show the truth ("Generated via
//     Mistral medium" not "n8n_status=200").
//   * No secret leakage: nothing in this type set carries API keys or prompt
//     bodies past the call boundary.

import type { Env } from '../../_types';

/** Operator-meaningful feature names. Drives feature-aware routing. */
export type LlmFeature =
  | 'ru_article'        // RU SEO article generation (heavy, long body, strict JSON)
  | 'uz_article'        // UZ Latin SEO article generation (heavy, Latin script)
  | 'translate'         // RU↔UZ article localisation (heavy, structure-preserving)
  | 'optimizer'         // Article optimiser deep rewrite (heavy, long body, strict JSON)
  | 'retarget'          // Cannibalisation retarget (heavy, schema-strict)
  | 'judge'             // Intent Guard semantic judge (light, short JSON verdict)
  | 'json_repair';      // Light: re-emit malformed JSON cleanly

/** Operator-visible provider identifier. */
export type LlmProviderId =
  | 'gemini'
  | 'mistral'
  | 'groq'
  | 'cerebras'
  | 'openrouter';

/**
 * Why a particular attempt ended. Mapped to the operator UI without
 * leaking upstream payloads. `transient_*` classes are retry-eligible.
 */
export type LlmErrorClass =
  | 'rate_limit'             // 429: quota/burst — retry against fallback
  | 'transient_5xx'          // 5xx, 408 — retry against fallback
  | 'network'                // fetch failed / abort / DNS
  | 'timeout'                // explicit AbortController timeout
  | 'safety_blocked'         // model refused (safety, prohibited content)
  | 'invalid_json'           // model returned non-parseable JSON
  | 'truncated'              // finish_reason=length / MAX_TOKENS, output cut
  | 'auth'                   // 401/403 — credentials missing/invalid; do NOT retry
  | 'bad_request'            // 400 — our payload is wrong; do NOT retry
  | 'unavailable'            // provider disabled / no key configured
  | 'unknown';

export interface LlmCallMetadata {
  /** Provider that finally produced (or last failed) the result. */
  provider: LlmProviderId;
  /** Wire model id the request was sent to. */
  model: string;
  /** Feature the call served. */
  feature: LlmFeature;
  /** Wall-clock duration in ms for the final accepted attempt only. */
  duration_ms: number;
  /** Token counts when the upstream reported them. */
  input_tokens?: number;
  output_tokens?: number;
  /** Number of provider/model fallback hops taken before success/final fail. */
  retry_count: number;
  /** True when the result came from a fallback (not the primary for this feature). */
  fallback_used: boolean;
  /** Ordered trace of every attempt — small, no secrets. */
  attempts: LlmAttemptTrace[];
}

export interface LlmAttemptTrace {
  provider: LlmProviderId;
  model: string;
  status: 'ok' | 'error';
  error_class?: LlmErrorClass;
  http_status?: number;
  duration_ms: number;
}

export interface LlmCallInput {
  feature: LlmFeature;
  /** System instruction — persona + JSON contract + hard constraints. */
  system: string;
  /** User message — brief + writing directives + source data. */
  user: string;
  /** Cap on output tokens. Default per-feature in model-registry. */
  maxTokens?: number;
  /** Sampling temperature. Default per-feature in model-registry. */
  temperature?: number;
  /** Hard wall-clock timeout (ms). Default per-feature. */
  timeoutMs?: number;
  /** Force strict-JSON. Default true. */
  jsonObject?: boolean;
  /**
   * Provider-specific reasoning budget. 0 disables hidden reasoning where
   * the provider supports it. Only honoured by gemini and (when set very
   * high) by Cerebras gpt-oss reasoning models. Other providers ignore.
   */
  thinkingBudget?: number;
  /**
   * Stable idempotency key. When the router sees a finished call with this
   * key in the usage-store, it returns the cached result instead of
   * spending a fresh upstream call. Set on launch jobs to absorb double
   * clicks. Optional — call still runs without it.
   */
  idempotencyKey?: string;
  /**
   * Restrict the route to providers whose registry entry's `locales`
   * includes this locale (used for UZ-aware selection). When undefined,
   * routing ignores locale.
   */
  locale?: 'ru' | 'uz';
}

export interface LlmCallSuccess {
  ok: true;
  /** Raw textual output. Caller is responsible for JSON.parse. */
  content: string;
  /** Optional finish reason surfaced from the provider. */
  finishReason?: string;
  meta: LlmCallMetadata;
}

export interface LlmCallFailure {
  ok: false;
  /** Short, operator-safe error message. */
  error: string;
  error_class: LlmErrorClass;
  /** HTTP status of the last attempt, when applicable. */
  status?: number;
  /** Excerpt of the last upstream body (≤ 600 chars, no secrets). */
  rawExcerpt?: string;
  meta: LlmCallMetadata;
}

export type LlmCallResult = LlmCallSuccess | LlmCallFailure;

/**
 * Provider adapter contract. Each adapter wraps ONE provider and is
 * responsible for: HTTP shape, auth header, JSON-object mode, finish-reason
 * detection, error classification, and timeout. The router decides WHICH
 * provider/model to call; the adapter just runs the wire call.
 */
export interface LlmProvider {
  /** Stable id (matches LlmProviderId). */
  readonly id: LlmProviderId;
  /** True when the env has the credentials required to call this provider. */
  isConfigured(env: Env): boolean;
  /**
   * Execute a single attempt against `model`. Never throws.
   * Should classify the error class according to the LlmErrorClass enum.
   */
  call(
    env: Env,
    model: string,
    input: LlmCallInput,
  ): Promise<ProviderAttemptResult>;
}

/** Adapter-level result. The router wraps this into LlmCallResult. */
export type ProviderAttemptResult =
  | {
      ok: true;
      content: string;
      finishReason?: string;
      input_tokens?: number;
      output_tokens?: number;
      duration_ms: number;
    }
  | {
      ok: false;
      error: string;
      error_class: LlmErrorClass;
      http_status?: number;
      rawExcerpt?: string;
      duration_ms: number;
    };

/**
 * Internal envelope: a route candidate the router walks. Built from the
 * model-registry filtered by feature + locale + health.
 */
export interface RouteCandidate {
  provider: LlmProviderId;
  model: string;
  priority: number;
  is_primary: boolean;
  per_call_timeout_ms: number;
  max_output_tokens: number;
}

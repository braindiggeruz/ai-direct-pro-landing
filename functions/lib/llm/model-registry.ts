// Model registry — single source of truth for which model serves which
// feature, in what order, with what timeout/output caps.
//
// The router walks `routes(feature)` top-down and tries each candidate in
// order, skipping unconfigured providers and unhealthy models (per the
// circuit-breaker). Adapters are dumb pipes that do not own model choice.
//
// IMPORTANT — Free vs paid tier reminder:
//   * Gemini 2.5 Flash       — free 15 RPM / 1500 RPD / 1M ctx
//   * Mistral La Plateforme  — pay-as-you-go (very cheap medium tier)
//   * Groq Cloud             — generous free tier, OpenAI-compatible
//   * Cerebras Inference     — free tier with daily token caps
//   * OpenRouter             — pay-as-you-go (used for editor AI fill only)
//
// The defaults below were validated against the four production keys in
// the live-benchmark on 2026-06-23 (mistral large/medium/small ✓ valid
// JSON; groq llama-3.3-70b ✓ 1.3 s; groq gpt-oss-120b ✓ 1.3 s; cerebras
// gpt-oss-120b ✓ but needs max_tokens ≥ 2000 because reasoning eats the
// completion budget).

import type { LlmFeature, LlmProviderId, RouteCandidate } from './types';

export interface ModelDescriptor {
  provider: LlmProviderId;
  /** Wire id passed to the provider's chat-completion endpoint. */
  model: string;
  /** Features this model is allowed to serve (priority-ordered). */
  features: LlmFeature[];
  /** Maximum prompt + completion context the model supports. */
  max_context: number;
  /** Maximum output tokens we ask for (conservative; under model max). */
  max_output: number;
  /** True when the provider exposes a strict-JSON output mode. */
  json_mode: boolean;
  /** Per-call wall-clock timeout (ms). Per-feature default in router. */
  default_timeout_ms: number;
  /** Per-call sampling temperature default. Caller can override. */
  default_temperature: number;
  /** Locales the model handles natively. ['ru','uz'] = both. */
  locales: Array<'ru' | 'uz'>;
  /** Operator-meaningful priority per feature. Lower = preferred. */
  priority_by_feature: Partial<Record<LlmFeature, number>>;
  /**
   * Approximate documented limit (RPM/TPM/RPD/monthly). Surfaced in the
   * admin UI; the router uses health/breaker state, not these numbers
   * directly. Keep these comments only — DO NOT hard-code as runtime
   * rate-limit values (each account differs).
   */
  notes?: string;
  /** Override default disabled-by-default for never-launched models. */
  enabled: boolean;
}

/**
 * Default registry. Adapt by editing this list. The router rebuilds the
 * route table on every call (cheap), so changes here take effect on the
 * next launch with no migration required.
 */
export const MODEL_REGISTRY: ModelDescriptor[] = [
  // ── Mistral La Plateforme ────────────────────────────────────────────
  {
    provider: 'mistral',
    model: 'mistral-large-latest',
    features: ['ru_article', 'translate', 'optimizer', 'retarget'],
    max_context: 128_000,
    max_output: 8_000,
    json_mode: true,
    default_timeout_ms: 75_000,
    default_temperature: 0.4,
    locales: ['ru', 'uz'],
    priority_by_feature: {
      ru_article: 10, translate: 30, optimizer: 30, retarget: 30,
    },
    notes: 'High quality RU/UZ; pay-as-you-go; strict JSON via response_format.',
    enabled: true,
  },
  {
    provider: 'mistral',
    model: 'mistral-medium-latest',
    features: ['ru_article', 'uz_article', 'translate', 'optimizer', 'retarget', 'judge'],
    max_context: 128_000,
    max_output: 8_000,
    json_mode: true,
    default_timeout_ms: 65_000,
    default_temperature: 0.4,
    locales: ['ru', 'uz'],
    priority_by_feature: {
      ru_article: 20, uz_article: 30, translate: 20, optimizer: 20, retarget: 20, judge: 30,
    },
    notes: 'Balanced cost/quality; ~3-5 s for short JSON; strong UZ Latin.',
    enabled: true,
  },
  {
    provider: 'mistral',
    model: 'mistral-small-latest',
    features: ['judge', 'json_repair'],
    max_context: 128_000,
    max_output: 4_000,
    json_mode: true,
    default_timeout_ms: 30_000,
    default_temperature: 0.3,
    locales: ['ru', 'uz'],
    priority_by_feature: { judge: 40, json_repair: 30 },
    notes: 'Cheap light-task model; ~1.5 s.',
    enabled: true,
  },

  // ── Google Gemini (existing direct REST) ─────────────────────────────
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    features: ['ru_article', 'uz_article', 'translate', 'optimizer', 'retarget'],
    max_context: 1_000_000,
    max_output: 8_000,
    json_mode: true,
    default_timeout_ms: 70_000,
    default_temperature: 0.4,
    locales: ['ru', 'uz'],
    priority_by_feature: {
      ru_article: 30, uz_article: 10, translate: 10, optimizer: 10, retarget: 10,
    },
    notes: 'Free tier 15 RPM / 1500 RPD / 1M ctx; strongest UZ Latin; 429 under burst.',
    enabled: true,
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    features: ['ru_article', 'uz_article', 'translate', 'optimizer', 'judge'],
    max_context: 1_000_000,
    max_output: 8_000,
    json_mode: true,
    default_timeout_ms: 60_000,
    default_temperature: 0.4,
    locales: ['ru', 'uz'],
    priority_by_feature: {
      ru_article: 50, uz_article: 40, translate: 40, optimizer: 50, judge: 50,
    },
    notes: 'Faster, shallower; used as auto-fallback by gemini-client; same quota bucket as flash.',
    enabled: true,
  },

  // ── Groq Cloud (OpenAI-compatible) ───────────────────────────────────
  {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    features: ['ru_article', 'judge', 'json_repair', 'optimizer'],
    max_context: 131_072,
    max_output: 8_000,
    json_mode: true,
    default_timeout_ms: 30_000,
    default_temperature: 0.4,
    locales: ['ru'],
    priority_by_feature: { ru_article: 40, judge: 10, json_repair: 10, optimizer: 40 },
    notes: 'Free tier; ~1 s wall; weaker UZ (no native Latin Uzbek training); excellent RU & JSON.',
    enabled: true,
  },
  {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    features: ['ru_article', 'optimizer', 'retarget', 'judge'],
    max_context: 131_072,
    max_output: 8_000,
    json_mode: true,
    default_timeout_ms: 30_000,
    default_temperature: 0.4,
    locales: ['ru'],
    priority_by_feature: { ru_article: 50, optimizer: 40, retarget: 40, judge: 20 },
    notes: 'Large open-source reasoning model on Groq; ~1.3 s wall; strong JSON; mostly EN+RU.',
    enabled: true,
  },

  // ── Cerebras Inference (OpenAI-compatible) ───────────────────────────
  {
    provider: 'cerebras',
    model: 'gpt-oss-120b',
    features: ['judge', 'json_repair'],
    max_context: 128_000,
    // Cerebras reasoning models eat ~250-400 tokens of "reasoning_tokens"
    // out of the completion budget. Set a comfortable margin so the
    // visible JSON survives. Heavy article tasks NOT routed here yet.
    max_output: 2_500,
    json_mode: true,
    default_timeout_ms: 20_000,
    default_temperature: 0.3,
    locales: ['ru'],
    priority_by_feature: { judge: 30, json_repair: 20 },
    notes: 'Ultrafast (<1 s) light-task helper; needs max_tokens ≥ 2000 to survive reasoning.',
    enabled: true,
  },

  // ── OpenRouter (legacy, kept for editor AI-fill compatibility) ───────
  {
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    features: ['judge', 'json_repair'],
    max_context: 128_000,
    max_output: 4_000,
    json_mode: true,
    default_timeout_ms: 60_000,
    default_temperature: 0.3,
    locales: ['ru', 'uz'],
    priority_by_feature: { judge: 90, json_repair: 90 },
    notes: 'Existing OpenRouter consumer kept as last-ditch for the editor AI-fill path.',
    enabled: true,
  },
];

/**
 * Build the priority-ordered route list for one feature. Filters out
 * disabled models. Caller is responsible for skipping unconfigured
 * providers (no API key) and unhealthy entries (circuit-breaker open).
 */
export function routes(feature: LlmFeature, locale?: 'ru' | 'uz'): RouteCandidate[] {
  const matching = MODEL_REGISTRY.filter(
    (m) =>
      m.enabled &&
      m.features.includes(feature) &&
      (locale ? m.locales.includes(locale) : true),
  );
  const candidates = matching
    .map((m) => ({
      provider: m.provider,
      model: m.model,
      priority: m.priority_by_feature[feature] ?? 99,
      is_primary: false,
      per_call_timeout_ms: m.default_timeout_ms,
      max_output_tokens: m.max_output,
      descriptor: m,
    }))
    .sort((a, b) => a.priority - b.priority);
  if (candidates.length > 0) candidates[0]!.is_primary = true;
  return candidates.map(({ descriptor: _d, ...rest }) => { void _d; return rest; });
}

export function modelDescriptor(provider: LlmProviderId, model: string): ModelDescriptor | undefined {
  return MODEL_REGISTRY.find((m) => m.provider === provider && m.model === model);
}

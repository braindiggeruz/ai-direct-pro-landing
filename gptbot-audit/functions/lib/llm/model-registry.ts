// Model registry — single source of truth for which model serves which
// feature, in what order, with what timeout/output caps.
//
// The router walks `routes(env, feature, locale)` top-down and tries each
// candidate in order, skipping unconfigured providers and unhealthy
// models (per the circuit-breaker). Adapters are dumb pipes that do not
// own model choice.
//
// IMPORTANT — Free vs paid tier reminder:
//   * OpenRouter             — pay-as-you-go; PRIMARY for heavy editorial
//                              tasks since 2026-06-24. Feature-specific
//                              model IDs come from env (no redeploy).
//   * Gemini 2.5 Flash       — free 15 RPM / 1500 RPD / 1M ctx (FALLBACK).
//   * Mistral La Plateforme  — pay-as-you-go medium tier (FALLBACK).
//   * Groq Cloud             — generous free tier, OpenAI-compatible.
//   * Cerebras Inference     — free tier with daily token caps.
//
// The defaults below were validated against the four production keys in
// the live-benchmark on 2026-06-23 (mistral large/medium/small ✓ valid
// JSON; groq llama-3.3-70b ✓ 1.3 s; groq gpt-oss-120b ✓ 1.3 s; cerebras
// gpt-oss-120b ✓ but needs max_tokens ≥ 2000 because reasoning eats the
// completion budget). OpenRouter primary model defaults (2026-06-24):
//   * Article (RU + UZ via shared model): deepseek/deepseek-chat
//     — DeepSeek V3 has strong long-form RU + native Uzbek Latin output,
//       supports strict JSON, ~$0.27 / $1.10 per 1M I/O. Best
//       price/quality on the platform for our 10 packets/day budget.
//   * Optimizer / retarget: same as article (heavy structured tasks).
//   * Judge (Intent Guard semantic): google/gemini-flash-1.5
//     — cheap, fast, strong RU comprehension; ~$0.075 / $0.30.
//   * UZ adaptation (when running via the translate path):
//     anthropic/claude-3.5-haiku — cheaper than Sonnet, still produces
//     natural Uzbek Latin. Same model serves the RU→UZ translate route.
// All five defaults are overridable via OPENROUTER_MODEL_* env vars so
// the operator can A/B test or swap a model without a code redeploy.

import type { Env } from '../../_types';
import type { LlmFeature, LlmProviderId, RouteCandidate } from './types';

// Default OpenRouter model IDs. Mirrored as env defaults below.
export const OPENROUTER_DEFAULTS = {
  ARTICLE: 'deepseek/deepseek-chat',
  UZ: 'deepseek/deepseek-chat',
  OPTIMIZER: 'deepseek/deepseek-chat',
  RETARGET: 'deepseek/deepseek-chat',
  JUDGE: 'google/gemini-flash-1.5',
} as const;

function readOpenRouterModel(env: Env, key: keyof typeof OPENROUTER_DEFAULTS): string {
  const envKey = `OPENROUTER_MODEL_${key}` as const;
  const v = (env as unknown as Record<string, string | undefined>)[envKey];
  if (typeof v === 'string' && v.trim().length >= 5) return v.trim();
  return OPENROUTER_DEFAULTS[key];
}

function readOpenRouterTimeoutMs(env: Env): number {
  const v = env.OPENROUTER_TIMEOUT_MS;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 10_000 && n <= 180_000) return n;
  }
  return 75_000;
}

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

  // ── OpenRouter (legacy entry — kept for editor AI-fill compatibility) ──
  // NOTE: the env-driven OpenRouter entries that PROMOTE OpenRouter to
  // primary for the heavy editorial features (ru_article, uz_article,
  // optimizer, retarget) are appended in `getDynamicRegistry(env)` below.
  // This static entry remains so unit tests that snapshot MODEL_REGISTRY
  // continue to pass and so the editor AI-fill last-ditch route survives
  // when env-driven entries are unavailable.
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

  // ── xAI Grok (optional, OpenAI-compatible) ─────────────────────────
  // Only routed when XAI_API_KEY is configured AND has credits. The
  // adapter is wired in but the registry entry is enabled=false until
  // credits are added — once enabled, the router will use Grok as a
  // high-quality RU long-form fallback.
  {
    provider: 'xai',
    model: 'grok-2-latest',
    features: ['ru_article', 'optimizer', 'retarget'],
    max_context: 131_072,
    max_output: 8_000,
    json_mode: true,
    default_timeout_ms: 70_000,
    default_temperature: 0.4,
    locales: ['ru'],
    priority_by_feature: { ru_article: 60, optimizer: 60, retarget: 60 },
    notes: 'High-quality RU long-form; pay-as-you-go (xAI key required). Disabled until credits are purchased on console.x.ai.',
    enabled: false,
  },
];

/**
 * Build OpenRouter primary entries from env-driven model IDs. The router
 * promotes OpenRouter to PRIMARY (priority 1) for the four heavy editorial
 * features when OPENROUTER_API_KEY is configured. If the env vars are not
 * set, the defaults from OPENROUTER_DEFAULTS apply. If the API key is
 * missing entirely, `isConfigured(env)` in the router filters these out
 * automatically and the chain falls back to Mistral/Gemini/Groq/Cerebras.
 */
function buildOpenRouterPrimaries(env: Env): ModelDescriptor[] {
  const timeout = readOpenRouterTimeoutMs(env);
  const articleModel = readOpenRouterModel(env, 'ARTICLE');
  const uzModel = readOpenRouterModel(env, 'UZ');
  const optimizerModel = readOpenRouterModel(env, 'OPTIMIZER');
  const retargetModel = readOpenRouterModel(env, 'RETARGET');
  const judgeModel = readOpenRouterModel(env, 'JUDGE');

  // Avoid duplicates when the operator uses the same model for multiple
  // features (the common cost-optimised setup).
  const seen = new Set<string>();
  const push = (m: ModelDescriptor) => {
    const k = `${m.provider}::${m.model}`;
    if (seen.has(k)) return null;
    seen.add(k);
    return m;
  };
  const out: ModelDescriptor[] = [];

  // RU article — primary, priority 1.
  const ruArticle = push({
    provider: 'openrouter',
    model: articleModel,
    features: ['ru_article', 'optimizer', 'retarget'],
    max_context: 64_000,
    max_output: 8_000,
    json_mode: true,
    default_timeout_ms: timeout,
    default_temperature: 0.4,
    locales: ['ru'],
    priority_by_feature: { ru_article: 1, optimizer: 5, retarget: 5 },
    notes: `OpenRouter primary for heavy RU editorial tasks. Model: ${articleModel}. Overridable via OPENROUTER_MODEL_ARTICLE / OPENROUTER_MODEL_OPTIMIZER / OPENROUTER_MODEL_RETARGET.`,
    enabled: true,
  });
  if (ruArticle) out.push(ruArticle);

  // UZ article — primary if model differs from RU article.
  const uzEntry = push({
    provider: 'openrouter',
    model: uzModel,
    features: ['uz_article', 'translate'],
    max_context: 64_000,
    max_output: 8_000,
    json_mode: true,
    default_timeout_ms: timeout,
    default_temperature: 0.4,
    locales: ['uz'],
    priority_by_feature: { uz_article: 1, translate: 1 },
    notes: `OpenRouter primary for UZ editorial. Model: ${uzModel}. Overridable via OPENROUTER_MODEL_UZ.`,
    enabled: true,
  });
  if (uzEntry) {
    out.push(uzEntry);
  } else {
    // Same model as RU — extend the existing entry's feature list rather
    // than duplicate the registry row.
    const ruRow = out.find((m) => m.model === uzModel && m.provider === 'openrouter');
    if (ruRow) {
      if (!ruRow.features.includes('uz_article')) ruRow.features.push('uz_article');
      if (!ruRow.features.includes('translate')) ruRow.features.push('translate');
      ruRow.priority_by_feature = { ...ruRow.priority_by_feature, uz_article: 1, translate: 1 };
      ruRow.locales = ['ru', 'uz'];
    }
  }

  // Optimizer / retarget — separate models, if requested by env.
  if (optimizerModel !== articleModel) {
    const r = push({
      provider: 'openrouter',
      model: optimizerModel,
      features: ['optimizer'],
      max_context: 64_000,
      max_output: 6_000,
      json_mode: true,
      default_timeout_ms: timeout,
      default_temperature: 0.4,
      locales: ['ru', 'uz'],
      priority_by_feature: { optimizer: 1 },
      notes: `OpenRouter optimizer model: ${optimizerModel}.`,
      enabled: true,
    });
    if (r) out.push(r);
  }
  if (retargetModel !== articleModel && retargetModel !== optimizerModel) {
    const r = push({
      provider: 'openrouter',
      model: retargetModel,
      features: ['retarget'],
      max_context: 64_000,
      max_output: 6_000,
      json_mode: true,
      default_timeout_ms: timeout,
      default_temperature: 0.4,
      locales: ['ru', 'uz'],
      priority_by_feature: { retarget: 1 },
      notes: `OpenRouter retarget model: ${retargetModel}.`,
      enabled: true,
    });
    if (r) out.push(r);
  }

  // Judge — cheap fast model on OpenRouter as PRIMARY for Intent Guard
  // semantic judging (existing Groq llama-3.3-70b stays as fallback).
  const judge = push({
    provider: 'openrouter',
    model: judgeModel,
    features: ['judge', 'json_repair'],
    max_context: 64_000,
    max_output: 4_000,
    json_mode: true,
    default_timeout_ms: 30_000,
    default_temperature: 0.3,
    locales: ['ru', 'uz'],
    priority_by_feature: { judge: 5, json_repair: 5 },
    notes: `OpenRouter judge model: ${judgeModel}. Fast/cheap for Intent Guard semantic judge + JSON repair.`,
    enabled: true,
  });
  if (judge) out.push(judge);

  return out;
}

/**
 * Compose static MODEL_REGISTRY with env-driven OpenRouter primary
 * entries. Called on every router run — the cost is one O(N) walk
 * over ~12 entries which is well below the per-call LLM latency.
 */
export function getDynamicRegistry(env: Env): ModelDescriptor[] {
  return [...buildOpenRouterPrimaries(env), ...MODEL_REGISTRY];
}

/**
 * Build the priority-ordered route list for one feature. Filters out
 * disabled models. Caller is responsible for skipping unconfigured
 * providers (no API key) and unhealthy entries (circuit-breaker open).
 *
 * Accepts `env` so OpenRouter promotion can read feature-specific
 * model IDs from the runtime environment without a code redeploy.
 */
export function routes(env: Env, feature: LlmFeature, locale?: 'ru' | 'uz'): RouteCandidate[] {
  const registry = getDynamicRegistry(env);
  const matching = registry.filter(
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

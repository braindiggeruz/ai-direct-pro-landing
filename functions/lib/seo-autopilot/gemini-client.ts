// Google Gemini Flash client for direct AI content generation.
//
// Calls Google Gemini via the Emergent Integrations proxy (an
// OpenAI-compatible HTTPS endpoint). This is the only external HTTP
// dependency the direct-generator pipeline has — everything else
// (validators, ingest, D1) runs in-cluster.
//
// Why Gemini Flash instead of the previous Workers AI / Llama 8b-fast:
//   * Llama 8b-fast produced thin, short articles (4–6 short paragraphs,
//     weak FAQ, weak Uzbek Latin). The contract validated, but the
//     content was not publish-ready and required heavy human rewriting.
//   * Gemini 2.5 Flash gives a step change in instruction-following,
//     Russian fluency, and Uzbek Latin naturalness, with the same
//     strict-JSON output guarantee (response_format=json_object).
//
// Why the Emergent proxy and not Google AI Studio directly:
//   * No additional API key required — the project already has
//     EMERGENT_LLM_KEY as an env var (universal key for OpenAI /
//     Anthropic / Gemini text).
//   * Stable rate-limits and quota accounting through a single key,
//     billed to the user's universal-key balance, not Google's
//     free-tier daily quota (which would silently 429 in production).
//   * OpenAI-compatible chat-completions surface keeps the contract
//     identical to the rest of the system.
//
// Safety:
//   * Never throws to the caller — all failures surface via
//     { ok: false, error, status } so the autopilot job + UI can
//     report something actionable.
//   * Hard timeout (default 70 s) so a slow upstream cannot exhaust
//     the ~95 s Cloudflare Pages Function budget.
//   * Optional fallback to gemini-2.5-flash-lite on timeout / 5xx /
//     429. The lite model is faster (avg ~15 s) but slightly shallower
//     output — used only as a recovery, never the default.
//
// References:
//   functions/lib/seo-autopilot/direct-generator.ts (sole caller)
//   functions/_types.ts                              (Env binding)

import type { Env } from '../../_types';

const PROXY_URL = 'https://integrations.emergentagent.com/llm/chat/completions';

/** Default Gemini Flash model. Override with env.GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/** Fallback model used on 5xx / 408 / 429 from the primary. */
export const FALLBACK_GEMINI_MODEL = 'gemini-2.5-flash-lite';

export interface GeminiCallInput {
  /** System message — sets persona, JSON contract, hard constraints. */
  system: string;
  /** User message — topic brief + writing directives. */
  user: string;
  /** Max tokens for the model output. Gemini 2.5 Flash caps at 8192. */
  maxTokens?: number;
  /** Sampling temperature. Default 0.35 — coherent but not robotic. */
  temperature?: number;
  /** Hard wall-clock timeout. Default 70 000 ms, fits CF Pages budget. */
  timeoutMs?: number;
  /** When true, sends response_format=json_object to enforce strict JSON. */
  jsonObject?: boolean;
}

export interface GeminiCallSuccess {
  ok: true;
  /** Raw assistant content (a JSON string when jsonObject=true). */
  content: string;
  /** The model the call actually completed on (primary or fallback). */
  model: string;
  /** OpenAI-style finish reason ("stop" | "length" | "tool_calls"…). */
  finishReason?: string;
  /** Token usage if the proxy returned it. */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: Record<string, unknown>;
  };
  /** Wall-clock duration in ms. */
  durationMs: number;
}

export interface GeminiCallFailure {
  ok: false;
  /** Human-readable failure cause, short enough for an error envelope. */
  error: string;
  /** The model the failure occurred on. */
  model: string;
  /** HTTP status when the proxy responded with a non-2xx body. */
  status?: number;
  /** Excerpt of the upstream body (truncated to 600 chars). */
  rawExcerpt?: string;
  /** Wall-clock duration in ms. */
  durationMs: number;
}

export type GeminiCallResult = GeminiCallSuccess | GeminiCallFailure;

/**
 * Call Gemini Flash via the Emergent proxy. Retries once to the fallback
 * model on transient upstream failures (timeout, 5xx, 408, 429). Never
 * throws.
 */
export async function callGemini(
  env: Env,
  input: GeminiCallInput,
): Promise<GeminiCallResult> {
  const apiKey = env.EMERGENT_LLM_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        'EMERGENT_LLM_KEY is not configured. Add it under Cloudflare Pages → ai-direct-pro-landing → Settings → Environment variables (secret_text).',
      model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      durationMs: 0,
    };
  }

  const primary = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const fallback = env.GEMINI_FALLBACK_MODEL || FALLBACK_GEMINI_MODEL;
  const candidates = primary === fallback ? [primary] : [primary, fallback];

  let lastFailure: GeminiCallFailure | null = null;
  for (const model of candidates) {
    const r = await callOnce(apiKey, model, input);
    if (r.ok) return r;
    lastFailure = r;
    // Retry only on transient classes. 4xx other than 408/429 is the
    // user's contract — same prompt would fail again.
    const status = r.status ?? 0;
    const transient =
      status === 0 || // network/abort
      status === 408 ||
      status === 429 ||
      status >= 500;
    if (!transient) break;
  }
  return (
    lastFailure || {
      ok: false,
      error: 'no models configured',
      model: primary,
      durationMs: 0,
    }
  );
}

async function callOnce(
  apiKey: string,
  model: string,
  input: GeminiCallInput,
): Promise<GeminiCallResult> {
  const startedAt = Date.now();
  const timeoutMs = input.timeoutMs ?? 70_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Emergent proxy expects gemini models prefixed with "gemini/" for
  // litellm-style routing. We normalise once here so callers can pass a
  // bare model id like "gemini-2.5-flash".
  const wireModel = model.includes('/') ? model : `gemini/${model}`;

  // Build the request body. response_format=json_object is supported by
  // the proxy and enforced by Gemini's JSON mode — the model returns a
  // JSON string we can JSON.parse directly.
  const body: Record<string, unknown> = {
    model: wireModel,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ],
    max_tokens: input.maxTokens ?? 8000,
    temperature: input.temperature ?? 0.35,
  };
  if (input.jsonObject !== false) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const durationMs = Date.now() - startedAt;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: `Gemini proxy HTTP ${res.status}`,
        model,
        status: res.status,
        rawExcerpt: text.slice(0, 600),
        durationMs,
      };
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: GeminiCallSuccess['usage'];
    };
    const choice = json.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return {
        ok: false,
        error: 'Gemini proxy returned empty content',
        model,
        rawExcerpt: JSON.stringify(json).slice(0, 600),
        durationMs,
      };
    }
    return {
      ok: true,
      content,
      model,
      finishReason: choice?.finish_reason,
      usage: json.usage,
      durationMs,
    };
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error;
    const durationMs = Date.now() - startedAt;
    const isAbort = err.name === 'AbortError';
    return {
      ok: false,
      error: isAbort
        ? `Gemini call timed out after ${timeoutMs} ms`
        : err.message || 'Gemini proxy network error',
      model,
      durationMs,
    };
  }
}

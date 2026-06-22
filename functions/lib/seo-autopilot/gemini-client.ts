// Google Gemini Flash client for direct AI content generation.
//
// Calls Google's Generative Language API directly (REST) — no SDK, no
// proxy. The Cloudflare Pages Function runtime supports the native
// fetch() to https://generativelanguage.googleapis.com so this stays
// inside the existing edge runtime.
//
// Why Gemini Flash instead of the previous Workers AI / Llama 8b-fast:
//   * Llama 8b-fast produced thin, short articles (4–6 short paragraphs,
//     weak FAQ, weak Uzbek Latin). The contract validated, but the
//     content was not publish-ready and required heavy human rewriting.
//   * Gemini 2.5 Flash gives a step change in instruction-following,
//     Russian fluency, and Uzbek Latin naturalness, with the same
//     strict-JSON output guarantee (responseMimeType=application/json).
//
// Why Google AI Studio (direct) and not OpenRouter / Emergent proxy:
//   * The free tier (15 RPM, 1500 RPD, 1M ctx) on gemini-2.5-flash is
//     more than enough for the SEO Autopilot's manual cadence and the
//     scheduled cron (≤ a few articles per hour).
//   * Direct call removes one moving part: no middleman, no extra
//     rate-limit accounting, no proxy outages on the critical path.
//   * Strict JSON via responseMimeType is honoured by Google's API
//     natively and removes the brittle "salvage from markdown" branch.
//
// Safety:
//   * Never throws to the caller — all failures surface via
//     { ok: false, error, status } so the autopilot job + UI can
//     report something actionable.
//   * Hard timeout (default 70 s) so a slow upstream cannot exhaust
//     the ~95 s Cloudflare Pages Function budget.
//   * One-step fallback to gemini-2.5-flash-lite on timeout / 5xx /
//     429. The lite model is faster (avg ~25 s) but slightly shallower
//     output — used only as a recovery, never the default.
//
// References:
//   functions/lib/seo-autopilot/direct-generator.ts (sole caller)
//   functions/_types.ts                              (Env binding)
//   https://ai.google.dev/api/generate-content       (REST contract)

import type { Env } from '../../_types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Default Gemini Flash model. Override with env.GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/** Fallback model used on 5xx / 408 / 429 from the primary. */
export const FALLBACK_GEMINI_MODEL = 'gemini-2.5-flash-lite';

export interface GeminiCallInput {
  /** System instruction — sets persona, JSON contract, hard constraints. */
  system: string;
  /** User message — topic brief + writing directives. */
  user: string;
  /** Max output tokens. Gemini 2.5 Flash caps at 8192. */
  maxTokens?: number;
  /** Sampling temperature. Default 0.4 — coherent but not robotic. */
  temperature?: number;
  /** Hard wall-clock timeout. Default 70 000 ms, fits CF Pages budget. */
  timeoutMs?: number;
  /** When true (default), enforces strict-JSON output via responseMimeType. */
  jsonObject?: boolean;
}

export interface GeminiCallSuccess {
  ok: true;
  /** Raw model output (a JSON string when jsonObject=true). */
  content: string;
  /** The model the call actually completed on (primary or fallback). */
  model: string;
  /** Google finish reason: "STOP" | "MAX_TOKENS" | "SAFETY" | … */
  finishReason?: string;
  /** Token usage. */
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
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
  /** HTTP status when the API responded with a non-2xx body. */
  status?: number;
  /** Excerpt of the upstream body (truncated to 600 chars). */
  rawExcerpt?: string;
  /** Wall-clock duration in ms. */
  durationMs: number;
}

export type GeminiCallResult = GeminiCallSuccess | GeminiCallFailure;

/**
 * Call Gemini Flash via Google's Generative Language API (direct REST).
 * Retries once to the fallback model on transient upstream failures
 * (timeout, 5xx, 408, 429). Never throws.
 */
export async function callGemini(
  env: Env,
  input: GeminiCallInput,
): Promise<GeminiCallResult> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        'GEMINI_API_KEY is not configured. Add it under Cloudflare Pages → ai-direct-pro-landing → Settings → Environment variables (secret_text). Generate the key for free at https://aistudio.google.com/app/apikey.',
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
      status === 0 || // network / abort
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

  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;

  // Google's request body — distinct from OpenAI's chat-completions
  // shape. systemInstruction carries the persona and JSON contract;
  // contents is the user message. responseMimeType=application/json
  // forces strict-JSON output (Gemini's JSON mode).
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: input.user }] }],
    systemInstruction: { role: 'system', parts: [{ text: input.system }] },
    generationConfig: {
      temperature: input.temperature ?? 0.4,
      maxOutputTokens: input.maxTokens ?? 8000,
      ...(input.jsonObject !== false
        ? { responseMimeType: 'application/json' }
        : {}),
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
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
        error: `Gemini API HTTP ${res.status}`,
        model,
        status: res.status,
        rawExcerpt: text.slice(0, 600),
        durationMs,
      };
    }

    type GeminiResponse = {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }>; role?: string };
        finishReason?: string;
        safetyRatings?: unknown;
      }>;
      promptFeedback?: {
        blockReason?: string;
        safetyRatings?: unknown;
      };
      usageMetadata?: GeminiCallSuccess['usage'];
    };
    const json = (await res.json()) as GeminiResponse;

    // Hard refusals show up as no candidates + promptFeedback.blockReason.
    if (!json.candidates || json.candidates.length === 0) {
      const reason = json.promptFeedback?.blockReason || 'no_candidates';
      return {
        ok: false,
        error: `Gemini returned no candidates (${reason})`,
        model,
        rawExcerpt: JSON.stringify(json).slice(0, 600),
        durationMs,
      };
    }

    const cand = json.candidates[0]!;
    const finishReason = cand.finishReason;
    const parts = cand.content?.parts ?? [];
    const content = parts.map((p) => p?.text || '').join('');

    if (!content.trim()) {
      // A SAFETY / RECITATION / PROHIBITED_CONTENT finish reason will
      // produce empty content even on 200 OK — surface it explicitly.
      return {
        ok: false,
        error: `Gemini returned empty content (finishReason=${finishReason || 'unknown'})`,
        model,
        rawExcerpt: JSON.stringify(json).slice(0, 600),
        durationMs,
      };
    }

    return {
      ok: true,
      content,
      model,
      finishReason,
      usage: json.usageMetadata,
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
        : err.message || 'Gemini API network error',
      model,
      durationMs,
    };
  }
}

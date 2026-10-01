// Server-side OpenRouter chat proxy for the consumer AI-chat.
//
// Distinct from functions/lib/llm/* (which is JSON-mode, feature-routed SEO
// tooling). This is a plain-text, multi-message chat call that walks an
// env-driven model fallback chain: primary → fallbacks. On rate-limit /
// 5xx / timeout it advances to the next model; on success it returns
// immediately. The OPENROUTER_API_KEY never leaves the server.
//
// The chain may also hold provider-qualified Z.ai ids ('zai/…', see
// model-provider.ts); those attempts go to zai-chat.ts. Only the web chat
// builds such a chain (webChatChain), and only with all Z.ai switches on.
import type { Env } from "../../_types";
import type { ChatMessage } from "./prompt";
import type { GptChatConfig } from "./config";
import { reasoningParam } from "../../platform/ai/model-policy";
import { readBodyPrefix } from "./http";
import { availableModels, MAX_ATTEMPTS, settleModelFailure } from "./model-health-store";
import {
  hasProviderKey,
  healthWildcards,
  isPaidOpenRouterModel,
  providerOf,
} from "./model-provider";
import { priceCeiling } from "./model-pricing";
import { callZaiOnce } from "./zai-chat";

/** Fixed on purpose: no config can send the OpenRouter key to another host. */
export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** How much of an OpenRouter 400 body is read to tell an unknown model from a refused request. */
export const ERROR_DETAIL_BYTES = 2048;

/** OpenRouter's wording for a model id it does not serve (retired, misspelt). */
const UNKNOWN_MODEL = /not a valid model|No endpoints found/i;

export interface ChatResult {
  ok: boolean;
  content?: string;
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** choices[0].finish_reason of the answer: 'stop', 'length', … */
  finishReason?: string;
  /** usage.completion_tokens_details.reasoning_tokens (OpenRouter). */
  reasoningTokens?: number;
  /** Requests the walk sent, at most MAX_ATTEMPTS (or the caller's lower cap); chatComplete sets it on every result. */
  attempts?: number;
  /**
   * Machine tag when ok=false:
   * rate_limit | model_unavailable | models_cooling | provider_error | timeout
   * | no_key | empty | account_unavailable | paid_credit_exhausted
   * | content_refused | bad_request | aborted | budget_exhausted, and from
   * Z.ai also balance_exhausted.
   */
  errorCode?: string;
}

interface ORResp {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: unknown; code?: string | number };
}

/**
 * Admission of one attempt, asked right before its request (never for a
 * candidate that is cooling down, keyless or skipped):
 *   'ok'   send it; it takes one of the MAX_ATTEMPTS;
 *   'skip' do not send it and walk on without spending an attempt (the free
 *          tier's daily budget for paid models is spent, model-spend-store.ts);
 *   'stop' end the walk with budget_exhausted (a pack's attempt ceiling,
 *          TurnStore.admitModelAttempt).
 */
export type AttemptAdmission = "ok" | "skip" | "stop";
export type AdmitAttempt = (model: string) => Promise<AttemptAdmission>;

/** Build the request body once; only `model` changes across the chain. */
export function buildChatBody(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
) {
  const reasoning = reasoningParam(model);
  return {
    model,
    messages,
    temperature: 0.6,
    max_tokens: maxTokens,
    // Models with optional reasoning answer directly, so max_tokens is spent
    // on the answer (functions/platform/ai/model-policy.ts). Other models get
    // no field and keep their provider default.
    ...(reasoning ? { reasoning } : {}),
    // USD per million tokens. A retired free model must never silently become
    // a paid request; premium fallbacks must stay within the tariff envelope.
    provider: {
      // A paid model has several providers inside max_price: when one fails,
      // OpenRouter tries the next, so one host's outage is not the model's
      // (and does not cool the model down for everyone). A ':free' slug has a
      // single provider; our three-attempt chain is its only retry layer.
      allow_fallbacks: !model.endsWith(":free"),
      max_price: { ...priceCeiling(model) },
    },
    // Penalties curb degenerate loops (small free models repeating a line).
    frequency_penalty: 0.5,
    presence_penalty: 0.3,
    // No response_format — this is free-form conversational output.
  };
}

/**
 * Map an OpenRouter failure onto a ChatResult errorCode. `model` is the id
 * that was asked; `detail` is at most ERROR_DETAIL_BYTES of the error body or
 * message, matched against UNKNOWN_MODEL and nothing else (it can echo the
 * visitor's text: never log, return or store it).
 *
 * - 404, and a 400 that names the model as unknown: a RETIRED or misspelt
 *   slug. That is configuration and will be just as true on the next attempt,
 *   so it is model_unavailable (one-hour cooldown). Folding it into
 *   `provider_error` is exactly what hid the 2026-09-04 outage: all three free
 *   slugs had been retired upstream, and for weeks the chat reported the same
 *   generic code a five-minute upstream blip reports.
 * - any other 400: this request was refused (a parameter the model rejects,
 *   such as `reasoning` on a model that must think) → bad_request, no cooldown.
 * - 403: OpenRouter moderation flagged this input → content_refused, no
 *   cooldown; one visitor's message must not switch a model off for everyone.
 * - 402 on a paid model: the account is out of credits → paid_credit_exhausted
 *   (paid models are skipped, ':free' ones still answer). On a ':free' model,
 *   and 401: the account itself → account_unavailable.
 * - 429 stays transient (retry works) and 5xx stays a provider fault.
 */
export function classifyFailureStatus(status: number, model = "", detail = ""): string {
  if (status === 400)
    return UNKNOWN_MODEL.test(detail) ? "model_unavailable" : "bad_request";
  if (status === 402)
    return isPaidOpenRouterModel(model) ? "paid_credit_exhausted" : "account_unavailable";
  if (status === 401) return "account_unavailable";
  if (status === 403) return "content_refused";
  if (status === 404) return "model_unavailable";
  if (status === 429) return "rate_limit";
  return "provider_error";
}

/**
 * Classify a failed OpenRouter response and release its body. Only a 400 is
 * read (≤ ERROR_DETAIL_BYTES): its wording is what separates an unknown model
 * from a refused request.
 */
export async function classifyFailureResponse(res: Response, model: string): Promise<string> {
  if (res.status !== 400) {
    await res.body?.cancel();
    return classifyFailureStatus(res.status, model);
  }
  return classifyFailureStatus(400, model, await readBodyPrefix(res, ERROR_DETAIL_BYTES));
}

/** The same classification for an error carried inside a 200 envelope or an SSE event. */
export function classifyFailureEnvelope(
  error: { code?: unknown; message?: unknown },
  model: string,
): string {
  const code = Number(error.code);
  if (!Number.isFinite(code) || code <= 0) return "provider_error";
  const detail = typeof error.message === "string" ? error.message.slice(0, ERROR_DETAIL_BYTES) : "";
  return classifyFailureStatus(code, model, detail);
}

async function callOne(
  env: Env,
  cfg: GptChatConfig,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": cfg.siteUrl,
        "X-Title": "GPTBot.uz AI Chat",
      },
      body: JSON.stringify(buildChatBody(model, messages, maxTokens)),
      signal: signal
        ? AbortSignal.any([controller.signal, signal])
        : controller.signal,
    });
    if (!res.ok)
      return { ok: false, errorCode: await classifyFailureResponse(res, model) };
    const data = (await res.json()) as ORResp;
    // OpenRouter also reports upstream failures INSIDE a 200 envelope — an
    // overloaded vendor came back as HTTP 200 carrying error.code 502 during
    // the 2026-09-04 probes. Classify by the code in the body, not by the
    // envelope, or a dead model hidden in a 200 reads as a healthy answer that
    // happened to be empty.
    if (data.error)
      return { ok: false, errorCode: classifyFailureEnvelope(data.error, model) };
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim();
    if (!content) return { ok: false, errorCode: "empty" };
    return {
      ok: true,
      content,
      modelUsed: model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      finishReason: choice?.finish_reason || undefined,
      reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
    };
  } catch (e) {
    return {
      ok: false,
      errorCode:
        (e as Error).name === "AbortError" ? "timeout" : "provider_error",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walk the model chain until one succeeds. Never throws.
 *
 * Every failure class keeps the walk going — a rate-limited or retired model
 * may still resolve on the next vendor, which is what the chain is for. What
 * changed after 2026-09-04 is which code comes back when nothing resolves: if
 * EVERY candidate was rejected as an unknown model, the chain is stale
 * configuration rather than a bad afternoon on the internet, and it says so.
 * That distinction is the difference between reading one code and rediscovering
 * the whole outage from scratch. When every candidate is cooling down, or
 * admitAttempt skips all that are not, no request is sent and the code is
 * models_cooling.
 *
 * At most MAX_ATTEMPTS requests. Cooling and keyless models never take one,
 * and neither do the candidates a failure skips: an account failure (401, or
 * 402 on a ':free' model, on OpenRouter; 1000-series or 1113 on Z.ai) skips
 * that provider's candidates, which for an OpenRouter-only chain is exactly
 * the early return this walker always had; a 402 on a paid OpenRouter model
 * skips only the paid ones, so the ':free' tail still answers. A refused
 * request (OpenRouter 403 or request-level 400, Z.ai 1301) costs no cooldown;
 * the next candidate gets its turn.
 *
 * admitAttempt (AdmitAttempt) is asked before every request: a pack's
 * attempt ceiling stops the walk, the free tier's spent budget skips a paid
 * model to the next candidate.
 *
 * maxAttempts lowers the request cap below MAX_ATTEMPTS (Javob's voice path
 * asks for two). It counts requests, never chain slots, so it applies after
 * the health filter: a model that is cooling down does not use one up. Cutting
 * the chain before the filter instead is what silenced the bot's voice replies
 * from 2026-09-07: its single slot was a retired model that the site kept
 * re-cooling, so the walk had no candidate and never sent a request.
 *
 * onOperatorEvent receives 'openrouter_credit_exhausted',
 * 'zai_balance_exhausted' and 'zai_auth_failed'; the web chat turns them into
 * an owner alert. It is optional and never awaited.
 */
export async function chatComplete(
  env: Env,
  cfg: GptChatConfig,
  chain: string[],
  messages: ChatMessage[],
  maxTokens = 900,
  timeoutMs = 45_000,
  signal?: AbortSignal,
  admitAttempt?: AdmitAttempt,
  onOperatorEvent?: (code: string) => void,
  maxAttempts = MAX_ATTEMPTS,
): Promise<ChatResult> {
  const attemptCap = Math.max(1, Math.min(MAX_ATTEMPTS, Math.floor(maxAttempts) || 1));
  let attempts = 0;
  const settled = (result: ChatResult): ChatResult => ({ ...result, attempts });
  if (
    chain.length
      ? !chain.some((model) => hasProviderKey(env, providerOf(model)))
      : !env.OPENROUTER_API_KEY
  )
    return settled({ ok: false, errorCode: "no_key" });
  let last: ChatResult = { ok: false, errorCode: "provider_error" };
  let everyCandidateUnavailable = chain.length > 0;
  const candidates = await availableModels(
    env.GPTBOT_DRAFTS_DB,
    chain.filter((model) => hasProviderKey(env, providerOf(model))),
  );
  if (!candidates.length) return settled({ ok: false, errorCode: "models_cooling" });
  const deadline = Date.now() + timeoutMs;
  // Health wildcards blocked during this walk (settleModelFailure).
  const skipped = new Set<string>();
  for (const model of candidates) {
    const provider = providerOf(model);
    if (healthWildcards(model).some((wildcard) => skipped.has(wildcard))) continue;
    if (attempts === attemptCap) break;
    if (signal?.aborted) return settled({ ok: false, errorCode: "aborted" });
    const admission = admitAttempt ? await admitAttempt(model) : "ok";
    if (admission === "stop") return settled({ ok: false, errorCode: "budget_exhausted" });
    if (admission === "skip") continue;
    attempts++;
    if (Date.now() >= deadline) return settled({ ok: false, errorCode: "timeout" });
    last =
      provider === "zai"
        ? await callZaiOnce(
            env,
            model,
            messages,
            maxTokens,
            Math.min(cfg.zaiTimeoutMs, deadline - Date.now()),
            signal,
          )
        : await callOne(
            env,
            cfg,
            model,
            messages,
            maxTokens,
            Math.min(15_000, deadline - Date.now()),
            signal,
          );
    if (signal?.aborted) return settled({ ok: false, errorCode: "aborted" });
    if (last.ok) return settled(last);
    const skip = await settleModelFailure(
      env.GPTBOT_DRAFTS_DB,
      model,
      last.errorCode || "provider_error",
      onOperatorEvent,
    );
    if (skip) skipped.add(skip);
    if (last.errorCode !== "model_unavailable")
      everyCandidateUnavailable = false;
    // Keep walking on every failure class: a hard failure on one model may
    // still resolve on the next vendor, so we continue.
  }
  // No request went out: admitAttempt skipped every candidate the health
  // check let through (the free tier's spent budget in front of a ':free'
  // chain that is cooling down). Nothing was refused as unknown, so this is
  // models_cooling, never the stale-chain diagnosis below.
  if (attempts === 0) return settled({ ok: false, errorCode: "models_cooling" });
  // A single live candidate anywhere in the chain means the configuration is
  // fine and the last candidate's own code is the honest answer. Only when the
  // chain is unavailable end to end do we promote the diagnosis.
  return settled(
    everyCandidateUnavailable
      ? { ok: false, errorCode: "model_unavailable" }
      : last,
  );
}

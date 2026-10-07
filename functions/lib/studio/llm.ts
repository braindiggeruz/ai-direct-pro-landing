// The studio's own light model client (spec §7.2; numbers from T0.1,
// MEASURE-30 §9). It reuses the chat's fixed endpoints and error parsing
// (zai-chat.ts, openrouter-chat.ts, unchanged) but none of the chat's chains,
// health store or budgets.
//
// One text step (outline, part, free deck) is at most STEP_LIMITS[step].
// attempts calls in all, whatever model answers them:
//   - Z.ai glm-5.3-flash, streamed, reasoning_effort "low", JSON mode,
//     temperature 0.3 (the proofreading pass of paid Uzbek decks: 0.2),
//     max_tokens from plans.ts (outline 1300, part 1300, free 1100, proof
//     as long as a part), 45 s a call;
//   - an answer that is not the JSON the step expects (deck-schema.ts) is
//     asked again once; finish_reason=length is never a result: it is asked
//     again with ×1.5 max_tokens;
//   - 1302 and every other Z.ai rate limit: studio_busy at once. No retry
//     and no fallback: the studio shares the key and its concurrency with the
//     chat, one of the 10 protected pages;
//   - Z.ai's own safety refusal (1301, finish_reason "sensitive") ends the
//     step as a refusal: 422 topic_refused, no content, the unit goes back;
//   - paid units never move to a model that was not measured: when Z.ai
//     fails (1113 no balance, 5xx, timeout) the step is a server fault;
//   - the free deck alone may fall back to OpenRouter's ':free' model
//     (STUDIO_FREE_TEXT_FALLBACK) when Z.ai fails or has no key, at a
//     max_price of 0 and with data_collection "deny".
// Every call is metered at the shadow list price (pricing.ts) for the
// ledger; a call the provider refused before answering costs 0.
//
// Privacy: messages carry the person's topic; nothing of a request or an
// answer is logged, only {event, code}. Provider error messages can echo the
// input and are never read (readZaiError returns the code only).
import type { Env } from "../../_types";
import { classifyZaiFailure, readZaiError, ZAI_ENDPOINT, zaiAlwaysThinks, zaiHeaders } from "../gpt-chat/zai-chat";
import { classifyFailureEnvelope, classifyFailureResponse, OPENROUTER_ENDPOINT } from "../gpt-chat/openrouter-chat";
import { priceCeiling } from "../gpt-chat/model-pricing";
import type { StudioConfig } from "./config";
import type { Checked } from "./deck-schema";
import { parseModelJson } from "./deck-schema";
import { studioLog, type StudioErrorCode } from "./http";
import { STEP_LIMITS } from "./plans";
import { modelPrice, tokenCostMicro } from "./pricing";
import { PROOF_TEMPERATURE, STUDIO_TEMPERATURE, type ChatMessage } from "./prompts";

export type LlmEnv = Pick<Env, "ZAI_API_KEY" | "OPENROUTER_API_KEY">;
/** "proof": the proofreading pass of a paid Uzbek part (proofread.ts). */
export type TextStep = "outline" | "part" | "free" | "proof";
export type StudioTier = "free" | "paid";

/** One call; T0.1's slowest was 22.4 s. */
export const CALL_TIMEOUT_MS = 45_000;
/** An answer (its content) longer than this is not one of ours (max_tokens 1950 ≈ 8 KB). */
export const MAX_ANSWER_BYTES = 64 * 1024;
/**
 * A stream longer than this is not one of ours either. The wire is far
 * larger than the answer: Z.ai sends one SSE event of ≈150–250 bytes (id,
 * model, choices …) per token, reasoning included, so a 1 100-token deck is
 * ≈200 KB on the wire for ≈5 KB of content.
 */
export const MAX_STREAM_BYTES = 2 * 1024 * 1024;
export const ZAI_PREFIX = "zai/";
export const OPENROUTER_PREFIX = "openrouter:";
const SITE = "https://gptbot.uz";

export type CallOutcome =
  | "ok"
  | "length"
  | "rate_limit"
  | "refused"
  | "timeout"
  | "aborted"
  | "provider_error"
  | "unavailable";

export interface CallUsage {
  readonly input: number;
  readonly cachedInput: number;
  readonly output: number;
  readonly reasoning: number;
}

/** One request to a provider, as the ledger and the report count it. No text. */
export interface CallRecord {
  readonly model: string;
  readonly maxTokens: number;
  /** The provider's outcome; "ok" whatever the schema then said (see `valid`). */
  readonly outcome: CallOutcome;
  /** The answer passed parseModelJson and the step's check. */
  readonly valid: boolean;
  readonly finishReason: string | null;
  readonly usage: CallUsage | null;
  readonly costMicro: number;
  readonly ms: number;
}

/** The ledger's server faults (spec §2.3 item 4). */
export type LedgerFault = "model_failed" | "invalid_output" | "timeout" | "busy";

interface Spent {
  readonly calls: readonly CallRecord[];
  readonly costMicro: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly reasoningTokens: number;
}

export type StepResult<T> =
  | (Spent & {
      readonly ok: true;
      readonly value: T;
      /** The model that wrote the value. */
      readonly model: string;
      readonly soft: readonly string[];
      readonly fixes: Readonly<Record<string, number>>;
    })
  /** A server fault: the unit goes back; 502 model_failed, 503 studio_busy / model_unavailable, 422 invalid_output. */
  | (Spent & { readonly ok: false; readonly kind: "fault"; readonly fault: LedgerFault; readonly code: StudioErrorCode })
  /** The provider refused the content (Z.ai 1301): 422 topic_refused {category: "provider"}, no content, the unit goes back. */
  | (Spent & { readonly ok: false; readonly kind: "refused"; readonly code: "topic_refused"; readonly reason: "provider_refused" })
  /** The caller's admit() stopped the step (a spend bucket or the job's step cap). */
  | (Spent & { readonly ok: false; readonly kind: "halted"; readonly code: StudioErrorCode });

/**
 * Asked before every call. "ok": send it. "busy": a daily spend bucket is
 * full (503 studio_busy, a server fault). "stop": the job may make no more
 * calls (its `steps` cap, or it closed): 409 job_state.
 */
export type Admission = "ok" | "busy" | "stop";
export type AdmitCall = (call: { readonly model: string; readonly maxTokens: number; readonly attempt: number }) => Promise<Admission>;

export interface StepOptions<T> {
  readonly env: LlmEnv;
  readonly config: Pick<StudioConfig, "textModels" | "freeTextFallback">;
  readonly tier: StudioTier;
  readonly step: TextStep;
  readonly messages: readonly ChatMessage[];
  /** The step's schema check (deck-schema.ts checkOutline / checkPart / checkFreeDeck, bound to its context). */
  readonly check: (raw: unknown) => Checked<T>;
  readonly admit?: AdmitCall;
  readonly fetch?: typeof fetch;
  /** The request's own signal: the person went away. */
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/** The temperature of a step: 0.3 as measured, 0.2 for the proofreading pass (MEASURE-30 §6). */
export function stepTemperature(step: TextStep): number {
  return step === "proof" ? PROOF_TEMPERATURE : STUDIO_TEMPERATURE;
}

/**
 * The models a step may use, in order, without the ones whose key is
 * missing: STUDIO_TEXT_MODELS, and for the free deck only, the ':free'
 * fallback.
 */
export function textChain(config: StepOptions<unknown>["config"], tier: StudioTier, env: LlmEnv): string[] {
  const chain: string[] = env.ZAI_API_KEY ? config.textModels.filter((model) => model.startsWith(ZAI_PREFIX)) : [];
  if (tier === "free" && config.freeTextFallback && env.OPENROUTER_API_KEY) chain.push(config.freeTextFallback);
  return chain;
}

// ── One call ────────────────────────────────────────────────────────────────

interface RawCall {
  readonly outcome: CallOutcome;
  readonly content: string;
  readonly finishReason: string | null;
  readonly usage: CallUsage | null;
}

interface WireUsage {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  prompt_tokens_details?: { cached_tokens?: unknown } | null;
  completion_tokens_details?: { reasoning_tokens?: unknown } | null;
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

function readUsage(usage: WireUsage | null | undefined): CallUsage | null {
  if (!usage || typeof usage !== "object") return null;
  return {
    input: count(usage.prompt_tokens),
    cachedInput: count(usage.prompt_tokens_details?.cached_tokens),
    output: count(usage.completion_tokens),
    reasoning: count(usage.completion_tokens_details?.reasoning_tokens),
  };
}

/** The chat's failure vocabulary (zai-chat.ts, openrouter-chat.ts) in the studio's. */
function outcomeOf(failure: string): CallOutcome {
  switch (failure) {
    case "rate_limit":
      return "rate_limit";
    case "content_refused":
      return "refused";
    case "balance_exhausted":
    case "account_unavailable":
    case "paid_credit_exhausted":
    case "model_unavailable":
      return "unavailable";
    default:
      return "provider_error";
  }
}

/** finish_reason values that mean the answer was cut off. */
const CUT_OFF = new Set(["length", "model_context_window_exceeded"]);

function finished(content: string, finishReason: string | null, usage: CallUsage | null): RawCall {
  if (finishReason === "sensitive") return { outcome: "refused", content: "", finishReason, usage };
  if (finishReason === "network_error") return { outcome: "provider_error", content: "", finishReason, usage };
  if (finishReason && CUT_OFF.has(finishReason)) return { outcome: "length", content: "", finishReason, usage };
  if (!content.trim()) return { outcome: "provider_error", content: "", finishReason, usage };
  return { outcome: "ok", content, finishReason, usage };
}

const failed = (outcome: CallOutcome): RawCall => ({ outcome, content: "", finishReason: null, usage: null });

/** Reads a Z.ai stream (OpenAI SSE): delta.content only, never reasoning_content. */
async function readZaiStream(res: Response): Promise<RawCall> {
  if (!res.body) return failed("provider_error");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finishReason: string | null = null;
  let usage: CallUsage | null = null;
  let bytes = 0;
  const line = (raw: string): RawCall | "done" | null => {
    const match = /^data:\s?(.*)$/.exec(raw.replace(/\r$/, ""));
    if (!match) return null;
    const payload = match[1].trim();
    if (payload === "[DONE]") return "done";
    let data: {
      error?: { code?: string | number };
      choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
      usage?: WireUsage;
    };
    try {
      data = JSON.parse(payload);
    } catch {
      return null; // a keep-alive or a malformed line
    }
    if (data.error) return failed(outcomeOf(classifyZaiFailure(0, data.error.code)));
    const choice = data.choices?.[0];
    if (typeof choice?.delta?.content === "string") {
      content += choice.delta.content;
      if (content.length > MAX_ANSWER_BYTES) return failed("provider_error");
    }
    if (typeof choice?.finish_reason === "string" && choice.finish_reason) finishReason = choice.finish_reason;
    if (data.usage) usage = readUsage(data.usage);
    return null;
  };
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_STREAM_BYTES) return failed("provider_error");
      buffer += decoder.decode(part.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const result = line(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (result === "done") return finished(content, finishReason, usage);
        if (result) return result;
      }
    }
    const tail = buffer ? line(buffer) : null;
    if (tail && tail !== "done") return tail;
    return finished(content, finishReason, usage);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
  usage?: WireUsage;
  error?: { code?: unknown; message?: unknown };
}

/** A non-streamed completion body, read up to MAX_ANSWER_BYTES. */
async function readCompletion(res: Response): Promise<ChatCompletion | null> {
  const text = await res.text();
  if (text.length > MAX_ANSWER_BYTES) return null;
  try {
    const data: unknown = JSON.parse(text);
    return typeof data === "object" && data !== null ? (data as ChatCompletion) : null;
  } catch {
    return null;
  }
}

function fromCompletion(data: ChatCompletion | null, classify: (error: { code?: unknown; message?: unknown }) => string): RawCall {
  if (!data) return failed("provider_error");
  if (data.error) return failed(outcomeOf(classify(data.error)));
  const choice = data.choices?.[0];
  const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  return finished(content, finishReason, readUsage(data.usage));
}

/** What one call asks for, apart from the messages. */
interface CallShape {
  readonly maxTokens: number;
  readonly temperature: number;
}

async function callZai(fetchFn: typeof fetch, env: LlmEnv, model: string, messages: readonly ChatMessage[], shape: CallShape, signal: AbortSignal): Promise<RawCall> {
  const bare = model.slice(ZAI_PREFIX.length);
  const body = {
    model: bare,
    messages,
    temperature: shape.temperature,
    max_tokens: shape.maxTokens,
    stream: true,
    response_format: { type: "json_object" },
    // GLM-5.x cannot stop thinking; "low" keeps it to a few tokens (T0.1: 52 in 137 calls).
    ...(zaiAlwaysThinks(bare) ? { reasoning_effort: "low" } : { thinking: { type: "disabled" } }),
  };
  const res = await fetchFn(ZAI_ENDPOINT, { method: "POST", headers: zaiHeaders(env), body: JSON.stringify(body), signal });
  if (!res.ok) return failed(outcomeOf(classifyZaiFailure(res.status, await readZaiError(res))));
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json"))
    return fromCompletion(await readCompletion(res), (error) => classifyZaiFailure(res.status, error.code as string | number | undefined));
  return readZaiStream(res);
}

async function callOpenRouter(fetchFn: typeof fetch, env: LlmEnv, model: string, messages: readonly ChatMessage[], shape: CallShape, signal: AbortSignal): Promise<RawCall> {
  const id = model.slice(OPENROUTER_PREFIX.length);
  const body = {
    model: id,
    messages,
    temperature: shape.temperature,
    max_tokens: shape.maxTokens,
    response_format: { type: "json_object" },
    provider: {
      // One ':free' endpoint, no silent move to a paid one, no provider that keeps or trains on the text.
      allow_fallbacks: false,
      max_price: { ...priceCeiling(id) },
      data_collection: "deny",
    },
  };
  const res = await fetchFn(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SITE,
      "X-Title": "GPTBot.uz Studio",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return failed(outcomeOf(await classifyFailureResponse(res, id)));
  return fromCompletion(await readCompletion(res), (error) => classifyFailureEnvelope(error, id));
}

/** One call with its own timeout; never throws. */
async function callModel(
  fetchFn: typeof fetch,
  env: LlmEnv,
  model: string,
  messages: readonly ChatMessage[],
  shape: CallShape,
  timeoutMs: number,
  outer?: AbortSignal,
): Promise<RawCall> {
  const timer = new AbortController();
  const handle = setTimeout(() => timer.abort(), Math.max(1, timeoutMs));
  const signal = outer ? AbortSignal.any([timer.signal, outer]) : timer.signal;
  try {
    return model.startsWith(ZAI_PREFIX)
      ? await callZai(fetchFn, env, model, messages, shape, signal)
      : await callOpenRouter(fetchFn, env, model, messages, shape, signal);
  } catch {
    if (outer?.aborted) return failed("aborted");
    return failed(timer.signal.aborted ? "timeout" : "provider_error");
  } finally {
    clearTimeout(handle);
  }
}

// ── One step ────────────────────────────────────────────────────────────────

/** The shadow-price cost of a call; with no usage reported, the call's ceiling (input bound, max_tokens). */
function callCost(model: string, step: TextStep, raw: RawCall, maxTokens: number): number {
  const price = modelPrice(model);
  if (!price) throw new Error(`no shadow price for ${model}`);
  // A request refused before an answer (HTTP error, rate limit) is not billed.
  if (!raw.usage && raw.outcome !== "ok" && raw.outcome !== "length") return 0;
  const usage = raw.usage ?? { input: STEP_LIMITS[step].inputTokens, cachedInput: 0, output: maxTokens, reasoning: 0 };
  return tokenCostMicro(price, usage);
}

function spent(calls: readonly CallRecord[]): Spent {
  return {
    calls,
    costMicro: calls.reduce((sum, call) => sum + call.costMicro, 0),
    tokensIn: calls.reduce((sum, call) => sum + (call.usage?.input ?? 0), 0),
    tokensOut: calls.reduce((sum, call) => sum + (call.usage?.output ?? 0), 0),
    reasoningTokens: calls.reduce((sum, call) => sum + (call.usage?.reasoning ?? 0), 0),
  };
}

/**
 * Runs one text step to a checked value or a coarse failure. Never throws
 * for a provider's sake; logs {event: "studio_llm", code: "<step>.<outcome>"}
 * for each call that did not give a valid answer.
 */
export async function runTextStep<T>(options: StepOptions<T>): Promise<StepResult<T>> {
  const { step, tier, messages } = options;
  const limits = STEP_LIMITS[step];
  const fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const chain = textChain(options.config, tier, options.env);
  const calls: CallRecord[] = [];
  const fault = (fault: LedgerFault, code: StudioErrorCode): StepResult<T> => ({ ok: false, kind: "fault", fault, code, ...spent(calls) });

  if (!chain.length) {
    studioLog("studio_llm", `${step}.no_model`);
    return fault("model_failed", "model_unavailable");
  }

  let modelIndex = 0;
  let maxTokens: number = limits.maxTokens;
  let lastFault: LedgerFault = "model_failed";
  let lastCode: StudioErrorCode = "model_failed";

  for (let attempt = 1; attempt <= limits.attempts; attempt++) {
    const model = chain[modelIndex];
    if (!model) break;
    if (options.admit) {
      const admission = await options.admit({ model, maxTokens, attempt });
      if (admission === "busy") return fault("busy", "studio_busy");
      if (admission === "stop") return { ok: false, kind: "halted", code: "job_state", ...spent(calls) };
    }

    const started = Date.now();
    const shape = { maxTokens, temperature: stepTemperature(step) };
    const raw = await callModel(fetchFn, options.env, model, messages, shape, options.timeoutMs ?? CALL_TIMEOUT_MS, options.signal);
    const checked = raw.outcome === "ok" ? (() => {
      const json = parseModelJson(raw.content);
      return json === undefined ? null : options.check(json);
    })() : null;
    const valid = checked?.ok === true;
    calls.push({
      model,
      maxTokens,
      outcome: raw.outcome,
      valid,
      finishReason: raw.finishReason,
      usage: raw.usage,
      costMicro: callCost(model, step, raw, maxTokens),
      ms: Date.now() - started,
    });
    if (checked?.ok) return { ok: true, value: checked.value, model, soft: checked.soft, fixes: checked.fixes, ...spent(calls) };
    studioLog("studio_llm", `${step}.${raw.outcome === "ok" ? "invalid_output" : raw.outcome}`);

    switch (raw.outcome) {
      case "ok": // not the JSON the step expects: ask once more, same model
        lastFault = "invalid_output";
        lastCode = "invalid_output";
        break;
      case "length": // cut off: never a result; ask again with more room
        maxTokens = limits.lengthRetryMaxTokens;
        lastFault = "invalid_output";
        lastCode = "invalid_output";
        break;
      case "rate_limit": // 1302 and the like: the chat's share of the key comes first
        return fault("busy", "studio_busy");
      case "refused":
        return { ok: false, kind: "refused", code: "topic_refused", reason: "provider_refused", ...spent(calls) };
      case "aborted":
        return fault("timeout", "model_failed");
      case "timeout":
        lastFault = "timeout";
        lastCode = "model_failed";
        if (modelIndex + 1 < chain.length) modelIndex++;
        break;
      case "provider_error":
        lastFault = "model_failed";
        lastCode = "model_failed";
        if (modelIndex + 1 < chain.length) modelIndex++;
        break;
      case "unavailable": // no balance, no account, no model: asking again cannot help
        lastFault = "model_failed";
        lastCode = "model_unavailable";
        modelIndex++;
        break;
    }
  }
  return fault(lastFault, lastCode);
}

// The check of a finished picture before it is handed out (spec §7.4 item 5;
// measured in T0.1, MEASURE-30 §7.3).
//
// The vision model of STUDIO_IMAGE_CHECK_MODEL answers CHECK_PROMPT_V2 with
// {person, face, text, flag, weapon, nudity, blood}. Only a readable answer
// that is false on every key lets the picture out (safety.ts imageSafe):
// a true, a missing key, prose or no answer at all keep it back. The unit is
// never touched by a picture: the slide simply goes without one.
//
//   @cf/google/gemma-4-26b-a4b-it  Workers AI, the default: 87.5% of the
//       measured violations caught, 1.4% false alarms, p90 2.4 s, ≈0.57 so‘m,
//       and no load on the Z.ai key the chat shares. Called exactly as
//       measured: the prompt and the JPEG as a data URL, max_tokens 90,
//       temperature 0, thinking off.
//   zai/glm-5.3-flash  the owner's alternative (catches the rest, ≈3 so‘m and
//       one more call on the shared key). Same prompt, JSON mode, low
//       reasoning effort.
//
// Fails closed: no binding, no key, a timeout, a provider error or an
// unreadable answer means the picture is not handed out. Nothing of the
// picture or the answer is logged or stored; the caller logs a coarse code.
import type { Env } from "../../_types";
import { readZaiError, ZAI_ENDPOINT, zaiHeaders } from "../gpt-chat/zai-chat";
import type { ImageCheckModel } from "./config";
import { STEP_LIMITS } from "./plans";
import { imageCheckMicro, modelPrice, tokenCostMicro } from "./pricing";
import { CHECK_PROMPT_V2 } from "./prompts";
import { imageSafe, parseImageVerdict, type AiRunner, type ImageVerdict } from "./safety";

/** One check; the measured p90 was 2.4 s (Gemma) and 7.2 s (glm). */
export const CHECK_TIMEOUT_MS = 12_000;
/** A verdict is one short JSON object; anything longer is not one. */
const MAX_ANSWER_BYTES = 16 * 1024;
/** The whole Z.ai answer around it (choices, usage, a few reasoning tokens). */
const MAX_BODY_BYTES = 64 * 1024;
const ZAI_PREFIX = "zai/";

export interface CheckDeps {
  /** env.AI (safety.ts aiRunner), or null. */
  readonly ai: AiRunner | null;
  readonly env: Pick<Env, "ZAI_API_KEY">;
  readonly fetch?: typeof fetch;
}

export type PictureCheck =
  /** The model answered. `safe` only for a readable all-false verdict; `verdict` null when unreadable. */
  | { readonly ok: true; readonly safe: boolean; readonly verdict: ImageVerdict | null; readonly costMicro: number }
  /** No answer: the picture is not handed out either. */
  | { readonly ok: false; readonly reason: "unavailable" | "timeout" | "provider_error"; readonly costMicro: number };

const dataUrl = (base64Jpeg: string) => `data:image/jpeg;base64,${base64Jpeg}`;

/** The Workers AI input, as T0.1 measured it (MEASURE-30 §7.3). */
export function workersAiCheckInput(base64Jpeg: string): Record<string, unknown> {
  return {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: CHECK_PROMPT_V2 },
          { type: "image_url", image_url: { url: dataUrl(base64Jpeg) } },
        ],
      },
    ],
    max_tokens: STEP_LIMITS.imageCheck.maxTokens,
    temperature: 0,
    chat_template_kwargs: { enable_thinking: false },
  };
}

/** The Z.ai request body of the alternative check (as measured, without streaming). */
export function zaiCheckBody(model: string, base64Jpeg: string): Record<string, unknown> {
  return {
    model: model.slice(ZAI_PREFIX.length),
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl(base64Jpeg) } },
          { type: "text", text: CHECK_PROMPT_V2 },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: STEP_LIMITS.imageCheck.maxTokens,
    stream: false,
    reasoning_effort: "low",
    response_format: { type: "json_object" },
  };
}

/**
 * The text of a model's answer: Workers AI's {response} (a string, or an
 * object it already parsed) or an OpenAI-style {choices[0].message.content}.
 */
export function checkAnswerText(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const { response, choices } = result as { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> };
  if (typeof response === "string") return response;
  if (typeof response === "object" && response !== null) return JSON.stringify(response);
  const content = Array.isArray(choices) ? choices[0]?.message?.content : undefined;
  return typeof content === "string" ? content : null;
}

function verdictOf(text: string | null, costMicro: number): PictureCheck {
  const verdict = text !== null && text.length <= MAX_ANSWER_BYTES ? parseImageVerdict(text) : null;
  return { ok: true, safe: imageSafe(verdict), verdict, costMicro };
}

/** Races `work` against `timeoutMs`; "timeout" when it loses. The work is not cancelled (Workers AI takes no signal). */
async function within<T>(work: Promise<T>, timeoutMs: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), timeoutMs)))]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function checkOnWorkersAi(ai: AiRunner | null, model: string, base64Jpeg: string, timeoutMs: number): Promise<PictureCheck> {
  if (!ai) return { ok: false, reason: "unavailable", costMicro: 0 };
  // Workers AI bills a call by its fixed shadow price (pricing.ts), answered or not.
  const cost = imageCheckMicro(model);
  try {
    const result = await within(ai.run(model, workersAiCheckInput(base64Jpeg)), timeoutMs);
    if (result === "timeout") return { ok: false, reason: "timeout", costMicro: cost };
    return verdictOf(checkAnswerText(result), cost);
  } catch {
    return { ok: false, reason: "provider_error", costMicro: 0 };
  }
}

interface ZaiCompletion {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } | null };
  error?: { code?: unknown };
}

const tokens = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

async function checkOnZai(deps: CheckDeps, model: string, base64Jpeg: string, timeoutMs: number): Promise<PictureCheck> {
  if (!deps.env.ZAI_API_KEY) return { ok: false, reason: "unavailable", costMicro: 0 };
  const price = modelPrice(model);
  if (!price) return { ok: false, reason: "unavailable", costMicro: 0 };
  const ceiling = imageCheckMicro(model);
  const fetchFn = deps.fetch ?? ((input, init) => fetch(input, init));
  const timer = new AbortController();
  const handle = setTimeout(() => timer.abort(), Math.max(1, timeoutMs));
  try {
    const res = await fetchFn(ZAI_ENDPOINT, {
      method: "POST",
      headers: zaiHeaders(deps.env),
      body: JSON.stringify(zaiCheckBody(model, base64Jpeg)),
      signal: timer.signal,
    });
    if (!res.ok) {
      // Refused before an answer (1302, 1113, 5xx …): not billed. The body is drained, never kept.
      await readZaiError(res);
      return { ok: false, reason: "unavailable", costMicro: 0 };
    }
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false, reason: "provider_error", costMicro: ceiling };
    let data: ZaiCompletion;
    try {
      data = JSON.parse(text) as ZaiCompletion;
    } catch {
      return { ok: false, reason: "provider_error", costMicro: ceiling };
    }
    if (data.error) return { ok: false, reason: "unavailable", costMicro: 0 };
    const usage = data.usage;
    const cost = usage
      ? tokenCostMicro(price, {
          input: tokens(usage.prompt_tokens),
          cachedInput: tokens(usage.prompt_tokens_details?.cached_tokens),
          output: tokens(usage.completion_tokens),
        })
      : ceiling;
    return verdictOf(checkAnswerText(data), cost);
  } catch {
    // A timeout or a broken connection may still be billed: count the ceiling.
    return { ok: false, reason: timer.signal.aborted ? "timeout" : "provider_error", costMicro: ceiling };
  } finally {
    clearTimeout(handle);
  }
}

/**
 * Checks one finished picture (base64 JPEG, as Flux returned it) with
 * `model`. Never throws. `costMicro` is what the call cost at the shadow
 * price, for the job's spend.
 */
export function checkPicture(deps: CheckDeps, model: ImageCheckModel, base64Jpeg: string, timeoutMs = CHECK_TIMEOUT_MS): Promise<PictureCheck> {
  return model.startsWith(ZAI_PREFIX)
    ? checkOnZai(deps, model, base64Jpeg, timeoutMs)
    : checkOnWorkersAi(deps.ai, model, base64Jpeg, timeoutMs);
}

/** The first key of a verdict that kept the picture back ("unreadable" without one), for a coarse log code. */
export function verdictCode(verdict: ImageVerdict | null): string {
  if (!verdict) return "unreadable";
  const key = (Object.keys(verdict) as Array<keyof ImageVerdict>).find((name) => verdict[name]);
  return key ?? "none";
}

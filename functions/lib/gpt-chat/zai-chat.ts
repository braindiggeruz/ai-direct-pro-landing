// Z.ai (Zhipu GLM) chat call for the consumer web chat.
//
// Z.ai speaks the OpenAI chat-completions dialect, but not all of it, and it
// reports failures as its own business codes. Everything provider-specific
// lives here; the chain walkers in openrouter-chat.ts / openrouter-stream.ts
// only dispatch on the 'zai/' prefix (model-provider.ts).
//
// Facts (docs.z.ai, read 2026-09-30):
//   https://docs.z.ai/api-reference/llm/chat-completion
//     POST https://api.z.ai/api/paas/v4/chat/completions, Bearer key.
//     Body: model, messages, stream, thinking {type: enabled|disabled},
//     temperature, top_p, max_tokens, stop, request_id, user_id.
//     frequency_penalty / presence_penalty are NOT parameters (not sent).
//     stream_options is not documented (not sent; the usage block arrives in
//     the last stream chunk). Streams are OpenAI SSE ending in `data: [DONE]`;
//     reasoning text arrives separately as delta.reasoning_content.
//     finish_reason: stop | length | tool_calls | sensitive | network_error |
//     model_context_window_exceeded.
//   https://docs.z.ai/api-reference/api-code
//     Errors: {"error":{"code":"<string>","message":"…"}}.
//     1000/1001/1003/1005 → 401 auth; 1113 → 429 insufficient balance;
//     1200/1230/1234 → 500; 1210/1213/1214/1215/1261 → 400 request errors;
//     1211 unknown model, 1212 unsupported method, 1221 offline, 1222 missing
//     API → 400; 1220 → 403; 1301 → 400 content safety; 1302 → 429 rate limit;
//     1305 → 429 overloaded; 1308–1321 → 429 usage limits. 1303 is not listed;
//     it is treated as a rate limit too.
//
// Privacy: error.message can echo the user's own text back, so it is never
// read into a log, a return value or a database row — only error.code is.
import type { Env } from "../../_types";
import type { ChatMessage } from "./prompt";
import type { ChatResult } from "./openrouter-chat";
import { bareModel } from "./model-provider";

/**
 * Fixed on purpose: there is no env-configurable base URL, so a config change
 * can never send the Z.ai key to another host.
 */
export const ZAI_ENDPOINT = "https://api.z.ai/api/paas/v4/chat/completions";

/** Largest error body we read; a Z.ai error envelope is a few hundred bytes. */
const ERROR_BODY_LIMIT = 4096;

export type ZaiFailure =
  | "content_refused"
  | "balance_exhausted"
  | "account_unavailable"
  | "rate_limit"
  | "model_unavailable"
  | "bad_request"
  | "provider_error";

export function buildZaiBody(
  bare: string,
  messages: ChatMessage[],
  maxTokens: number,
  stream: boolean,
) {
  return {
    model: bare,
    messages,
    temperature: 0.6,
    max_tokens: maxTokens,
    stream,
    // GLM-4.5/4.7 think by default; the web chat has a 12 s first-content
    // budget, and reasoning text is never shown to the visitor.
    thinking: { type: "disabled" as const },
  };
}

export function zaiHeaders(env: Pick<Env, "ZAI_API_KEY">): Record<string, string> {
  // No HTTP-Referer / X-Title: those are OpenRouter attribution headers.
  return {
    Authorization: `Bearer ${env.ZAI_API_KEY}`,
    "Content-Type": "application/json",
  };
}

const ACCOUNT_CODES = new Set([1000, 1001, 1002, 1003, 1004, 1005, 1220]);
const RATE_CODES = new Set([1302, 1303, 1305]);
const MODEL_CODES = new Set([1211, 1212, 1221, 1222]);
const REQUEST_CODES = new Set([1210, 1213, 1214, 1215, 1261]);
const SERVER_CODES = new Set([1200, 1230, 1234]);

/**
 * Map a Z.ai failure onto the chain's error vocabulary.
 *
 * The business code decides whenever it is a documented one. Without a code
 * (or with one the docs do not list) the HTTP status decides: 401/403 are the
 * account, 429 is a limit, everything else is a provider fault. A 400 without
 * a code is deliberately NOT 'model_unavailable': Z.ai returns request-level
 * refusals as 400, and a 1-hour model cooldown on one of those would let any
 * visitor switch the model off for everyone.
 */
export function classifyZaiFailure(
  httpStatus: number,
  bizCode?: string | number | null,
): ZaiFailure {
  const code =
    bizCode === undefined || bizCode === null || String(bizCode).trim() === ""
      ? NaN
      : Number(bizCode);
  if (Number.isInteger(code)) {
    if (code === 1301) return "content_refused";
    if (code === 1113) return "balance_exhausted";
    if (ACCOUNT_CODES.has(code)) return "account_unavailable";
    if (RATE_CODES.has(code) || (code >= 1308 && code <= 1321)) return "rate_limit";
    if (MODEL_CODES.has(code)) return "model_unavailable";
    if (REQUEST_CODES.has(code)) return "bad_request";
    if (SERVER_CODES.has(code)) return "provider_error";
  }
  if (httpStatus === 401 || httpStatus === 403) return "account_unavailable";
  if (httpStatus === 429) return "rate_limit";
  return "provider_error";
}

/**
 * Read error.code from a non-2xx Z.ai response. Reads at most 4096 bytes,
 * always releases the body, never throws, and never returns error.message.
 */
export async function readZaiError(res: Response): Promise<string | undefined> {
  if (!res.body) return undefined;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < ERROR_BODY_LIMIT) {
      const part = await reader.read();
      if (part.done) break;
      chunks.push(part.value);
      total += part.value.byteLength;
    }
  } catch {
    /* a truncated or aborted body still has whatever arrived */
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(Math.min(total, ERROR_BODY_LIMIT));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= bytes.length) break;
    const slice = chunk.subarray(0, bytes.length - offset);
    bytes.set(slice, offset);
    offset += slice.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    const data = JSON.parse(text) as { error?: { code?: unknown } };
    const code = data?.error?.code;
    if ((typeof code === "string" || typeof code === "number") && /^\d{1,6}$/.test(String(code).trim()))
      return String(code).trim();
    return undefined;
  } catch {
    // Cut off mid-JSON: the code field precedes the message in Z.ai's
    // envelope, so a bounded pattern still recovers it.
    return /"code"\s*:\s*"?(\d{1,6})"?/.exec(text)?.[1];
  }
}

interface ZaiResp {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: string | number };
}

/**
 * One non-streaming Z.ai attempt. Same ChatResult shape as the OpenRouter
 * call; modelUsed is the provider-qualified id ('zai/glm-4.7-flash'), which
 * is what the chat UI prints as "answered by". Never throws.
 */
export async function callZaiOnce(
  env: Pick<Env, "ZAI_API_KEY">,
  modelId: string,
  messages: ChatMessage[],
  maxTokens: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const res = await fetch(ZAI_ENDPOINT, {
      method: "POST",
      headers: zaiHeaders(env),
      body: JSON.stringify(buildZaiBody(bareModel(modelId), messages, maxTokens, false)),
      signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
    });
    if (!res.ok) {
      const code = await readZaiError(res);
      return { ok: false, errorCode: classifyZaiFailure(res.status, code) };
    }
    const data = (await res.json()) as ZaiResp;
    if (data.error) return { ok: false, errorCode: classifyZaiFailure(res.status, data.error.code) };
    const choice = data.choices?.[0];
    // 'sensitive' is Zhipu's safety stop: a refusal of THIS request, not a
    // sign the model is unhealthy.
    if (choice?.finish_reason === "sensitive") return { ok: false, errorCode: "content_refused" };
    const content = choice?.message?.content?.trim();
    if (!content)
      return {
        ok: false,
        errorCode: choice?.finish_reason === "network_error" ? "provider_error" : "empty",
      };
    return {
      ok: true,
      content,
      modelUsed: modelId,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  } catch (e) {
    return {
      ok: false,
      errorCode: (e as Error).name === "AbortError" ? "timeout" : "provider_error",
    };
  } finally {
    clearTimeout(timer);
  }
}

// Streaming variant of the OpenRouter chat call. Walks the same model
// fallback chain as chatComplete, but with stream:true — a model only
// "wins" once it returns a 2xx SSE response; failures before the first
// byte advance the chain. The caller pipes the upstream SSE body.
//
// Provider-qualified Z.ai ids ('zai/…', model-provider.ts) take the same walk
// with their own request, error classification and first-content budget; the
// winner reports its provider so the caller parses the body with the right
// dialect (parseSseChunk's third argument).
import type { Env } from "../../_types";
import type { ChatMessage } from "./prompt";
import type { GptChatConfig } from "./config";
import { buildChatBody, classifyFailureStatus } from "./openrouter-chat";
import { availableModels, settleModelFailure } from "./model-health-store";
import { hasProviderKey, providerOf, bareModel, type ModelProvider } from "./model-provider";
import {
  ZAI_ENDPOINT,
  buildZaiBody,
  classifyZaiFailure,
  readZaiError,
  zaiHeaders,
} from "./zai-chat";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Codes a pre-content failure may carry as its Error message. */
const STREAM_FAILURE_CODES = [
  "rate_limit",
  "model_unavailable",
  "account_unavailable",
  // Z.ai only; the OpenRouter parser never produces these.
  "content_refused",
  "balance_exhausted",
  "bad_request",
];

export type StreamStart =
  | {
      ok: true;
      body: ReadableStream<Uint8Array>;
      model: string;
      /** Which dialect `body` speaks; pass it to parseSseChunk. */
      provider: ModelProvider;
      abort: () => void;
    }
  | { ok: false; errorCode: string };

function openRouterRequest(
  env: Env,
  cfg: GptChatConfig,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): RequestInit {
  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": cfg.siteUrl,
      "X-Title": "GPTBot.uz AI Chat",
    },
    body: JSON.stringify({
      ...buildChatBody(model, messages, maxTokens),
      stream: true,
      // Final SSE chunk carries prompt/completion token usage.
      stream_options: { include_usage: true },
    }),
  };
}

function zaiRequest(
  env: Env,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): RequestInit {
  return {
    method: "POST",
    headers: zaiHeaders(env),
    // No stream_options: Z.ai does not document it; usage arrives in the
    // last chunk on its own.
    body: JSON.stringify(buildZaiBody(bareModel(model), messages, maxTokens, true)),
  };
}

export async function chatStreamStart(
  env: Env,
  cfg: GptChatConfig,
  chain: string[],
  messages: ChatMessage[],
  maxTokens = 900,
  timeoutMs = 60_000,
  signal?: AbortSignal,
  admitAttempt?: () => Promise<boolean>,
  onOperatorEvent?: (code: string) => void,
): Promise<StreamStart> {
  if (
    chain.length
      ? !chain.some((model) => hasProviderKey(env, providerOf(model)))
      : !env.OPENROUTER_API_KEY
  )
    return { ok: false, errorCode: "no_key" };
  let lastCode = "provider_error";
  let everyCandidateUnavailable = chain.length > 0;
  const candidates = (await availableModels(env.GPTBOT_DRAFTS_DB, chain)).filter(
    (model) => hasProviderKey(env, providerOf(model)),
  );
  if (!candidates.length) return { ok: false, errorCode: "rate_limit" };
  const deadline = Date.now() + timeoutMs;
  const skipped = new Set<ModelProvider>();
  for (const model of candidates) {
    const provider = providerOf(model);
    if (skipped.has(provider)) continue;
    if (signal?.aborted) return { ok: false, errorCode: "aborted" };
    if (admitAttempt && !(await admitAttempt()))
      return { ok: false, errorCode: "budget_exhausted" };
    const controller = new AbortController();
    if (Date.now() >= deadline) return { ok: false, errorCode: "timeout" };
    let timer = setTimeout(
      () => controller.abort(),
      Math.min(provider === "zai" ? cfg.zaiTimeoutMs : 12_000, deadline - Date.now()),
    );
    try {
      const init =
        provider === "zai"
          ? zaiRequest(env, model, messages, maxTokens)
          : openRouterRequest(env, cfg, model, messages, maxTokens);
      const res = await fetch(provider === "zai" ? ZAI_ENDPOINT : ENDPOINT, {
        ...init,
        signal: signal
          ? AbortSignal.any([controller.signal, signal])
          : controller.signal,
      });
      if (!res.ok || !res.body) {
        if (provider === "zai") {
          // Read the business code while the attempt timer is still armed.
          // readZaiError always releases the body; a 2xx without one has none.
          const code = res.ok ? undefined : await readZaiError(res);
          clearTimeout(timer);
          lastCode = classifyZaiFailure(res.status, code);
        } else {
          clearTimeout(timer);
          await res.body?.cancel();
          lastCode = classifyFailureStatus(res.status);
        }
        const step = await settleModelFailure(
          env.GPTBOT_DRAFTS_DB,
          model,
          lastCode,
          onOperatorEvent,
        );
        if (step === "skip_provider") skipped.add(provider);
        if (lastCode !== "model_unavailable") everyCandidateUnavailable = false;
        continue;
      }
      // 200 is not evidence of an answer: OpenRouter can send an SSE error or
      // a reasoning-only empty stream. Buffer until the first content delta;
      // before it, fallback is safe. After it, never splice another model in.
      // Z.ai's delta.reasoning_content never counts as content here.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = { buffer: "" };
      const buffered: Uint8Array[] = [];
      let ready = false;
      let bytes = 0;
      while (!ready) {
        const part = await reader.read();
        if (part.done) throw new Error("empty");
        buffered.push(part.value);
        bytes += part.value.byteLength;
        if (bytes > 131072) throw new Error("empty");
        const events = parseSseChunk(
          parser,
          decoder.decode(part.value, { stream: true }),
          provider,
        );
        const failure = events.find((event) => event.error);
        if (failure) throw new Error(failure.error);
        ready = events.some((event) => !!event.delta?.trim());
        if (!ready && events.some((event) => event.done))
          throw new Error("empty");
      }
      clearTimeout(timer);
      timer = setTimeout(
        () => controller.abort(),
        Math.max(1, deadline - Date.now()),
      );
      const body = new ReadableStream<Uint8Array>({
        async pull(output) {
          if (buffered.length) {
            output.enqueue(buffered.shift()!);
            return;
          }
          try {
            const part = await reader.read();
            if (part.done) { clearTimeout(timer); output.close(); }
            else output.enqueue(part.value);
          } catch (error) {
            output.error(error);
          }
        },
        cancel() {
          clearTimeout(timer);
          controller.abort();
          return reader.cancel();
        },
      });
      // Keep the timeout armed for the WHOLE stream: a stalled upstream is
      // aborted, which surfaces as a read error in the pump.
      return {
        ok: true,
        body,
        model,
        provider,
        abort: () => {
          clearTimeout(timer);
          controller.abort();
        },
      };
    } catch (e) {
      clearTimeout(timer);
      controller.abort();
      if (signal?.aborted) return { ok: false, errorCode: "aborted" };
      lastCode =
        (e as Error).name === "AbortError"
          ? "timeout"
          : STREAM_FAILURE_CODES.includes((e as Error).message)
            ? (e as Error).message
            : "provider_error";
      const step = await settleModelFailure(
        env.GPTBOT_DRAFTS_DB,
        model,
        lastCode,
        onOperatorEvent,
      );
      if (step === "skip_provider") skipped.add(provider);
      everyCandidateUnavailable = false;
    }
  }
  return {
    ok: false,
    errorCode: everyCandidateUnavailable ? "model_unavailable" : lastCode,
  };
}

export interface SseEvent {
  error?: string;
  delta?: string;
  done?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  /** choices[0].finish_reason, when the chunk carried one (Z.ai dialect only). */
  finishReason?: string;
}

/**
 * Incremental parser for the upstream SSE wire format. Feed decoded text
 * chunks; returns extracted events. Keeps partial lines in `state.buffer`.
 * `provider` selects the dialect; the default is OpenRouter's, unchanged.
 */
export function parseSseChunk(
  state: { buffer: string },
  chunk: string,
  provider: ModelProvider = "openrouter",
): SseEvent[] {
  state.buffer += chunk;
  const events: SseEvent[] = [];
  let idx: number;
  while ((idx = state.buffer.indexOf("\n")) >= 0) {
    const line = state.buffer.slice(0, idx).replace(/\r$/, "");
    state.buffer = state.buffer.slice(idx + 1);
    if (provider === "zai") {
      const event = parseZaiLine(line);
      if (event) events.push(event);
      continue;
    }
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6);
    if (payload === "[DONE]") {
      events.push({ done: true });
      continue;
    }
    try {
      const data = JSON.parse(payload) as {
        error?: { code?: number };
        choices?: { delta?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const delta = data.choices?.[0]?.delta?.content;
      const ev: SseEvent = {};
      if (data.error) {
        events.push({ error: classifyFailureStatus(Number(data.error.code)) });
        continue;
      }
      if (typeof delta === "string" && delta) ev.delta = delta;
      if (data.usage) {
        ev.inputTokens = data.usage.prompt_tokens;
        ev.outputTokens = data.usage.completion_tokens;
      }
      if (ev.delta !== undefined || ev.inputTokens !== undefined)
        events.push(ev);
    } catch {
      /* malformed keep-alive line — skip */
    }
  }
  return events;
}

/**
 * One Z.ai SSE line. Only delta.content is answer text; delta.reasoning_content
 * is dropped here, so it can neither satisfy "first content" nor reach the
 * visitor. finish_reason 'sensitive' (Zhipu's safety stop) is a refusal of
 * this request; 'network_error' means the answer was cut off upstream.
 */
function parseZaiLine(line: string): SseEvent | null {
  const match = /^data:\s?(.*)$/.exec(line);
  if (!match) return null;
  const payload = match[1].trim();
  if (payload === "[DONE]") return { done: true };
  try {
    const data = JSON.parse(payload) as {
      error?: { code?: string | number };
      choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    if (data.error) return { error: classifyZaiFailure(0, data.error.code) };
    const choice = data.choices?.[0];
    const finish = typeof choice?.finish_reason === "string" ? choice.finish_reason : "";
    if (finish === "sensitive") return { error: "content_refused", finishReason: finish };
    if (finish === "network_error") return { error: "provider_error", finishReason: finish };
    const ev: SseEvent = {};
    const delta = choice?.delta?.content;
    if (typeof delta === "string" && delta) ev.delta = delta;
    if (data.usage) {
      ev.inputTokens = data.usage.prompt_tokens;
      ev.outputTokens = data.usage.completion_tokens;
    }
    if (finish) ev.finishReason = finish;
    return ev.delta !== undefined || ev.inputTokens !== undefined || ev.finishReason !== undefined
      ? ev
      : null;
  } catch {
    return null; /* malformed keep-alive line — skip */
  }
}

// Streaming variant of the OpenRouter chat call. Walks the same model
// fallback chain as chatComplete, but with stream:true — a model only
// "wins" once it returns a 2xx SSE response; failures before the first
// byte advance the chain. The caller pipes the upstream SSE body.
import type { Env } from "../../_types";
import type { ChatMessage } from "./prompt";
import type { GptChatConfig } from "./config";
import { buildChatBody, classifyFailureStatus } from "./openrouter-chat";
import { availableModels, modelFailed } from "./model-health-store";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type StreamStart =
  | {
      ok: true;
      body: ReadableStream<Uint8Array>;
      model: string;
      abort: () => void;
    }
  | { ok: false; errorCode: string };

export async function chatStreamStart(
  env: Env,
  cfg: GptChatConfig,
  chain: string[],
  messages: ChatMessage[],
  maxTokens = 900,
  timeoutMs = 60_000,
  signal?: AbortSignal,
  admitAttempt?: () => Promise<boolean>,
): Promise<StreamStart> {
  if (!env.OPENROUTER_API_KEY) return { ok: false, errorCode: "no_key" };
  let lastCode = "provider_error";
  let everyCandidateUnavailable = chain.length > 0;
  const candidates = await availableModels(env.GPTBOT_DRAFTS_DB, chain);
  if (!candidates.length) return { ok: false, errorCode: "rate_limit" };
  const deadline = Date.now() + timeoutMs;
  for (const model of candidates) {
    if (signal?.aborted) return { ok: false, errorCode: "aborted" };
    if (admitAttempt && !(await admitAttempt()))
      return { ok: false, errorCode: "budget_exhausted" };
    const controller = new AbortController();
    if (Date.now() >= deadline) return { ok: false, errorCode: "timeout" };
    let timer = setTimeout(
      () => controller.abort(),
      Math.min(12_000, deadline - Date.now()),
    );
    try {
      const res = await fetch(ENDPOINT, {
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
        signal: signal
          ? AbortSignal.any([controller.signal, signal])
          : controller.signal,
      });
      if (!res.ok || !res.body) {
        clearTimeout(timer);
        await res.body?.cancel();
        lastCode = classifyFailureStatus(res.status);
        await modelFailed(
          env.GPTBOT_DRAFTS_DB,
          lastCode === "account_unavailable" ? "*" : model,
          lastCode,
        );
        if (lastCode === "account_unavailable")
          return { ok: false, errorCode: lastCode };
        if (lastCode !== "model_unavailable") everyCandidateUnavailable = false;
        continue;
      }
      // 200 is not evidence of an answer: OpenRouter can send an SSE error or
      // a reasoning-only empty stream. Buffer until the first content delta;
      // before it, fallback is safe. After it, never splice another model in.
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
          : ["rate_limit", "model_unavailable", "account_unavailable"].includes(
                (e as Error).message,
              )
            ? (e as Error).message
            : "provider_error";
      await modelFailed(
        env.GPTBOT_DRAFTS_DB,
        lastCode === "account_unavailable" ? "*" : model,
        lastCode,
      );
      if (lastCode === "account_unavailable")
        return { ok: false, errorCode: lastCode };
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
}

/**
 * Incremental parser for OpenRouter's SSE wire format. Feed decoded text
 * chunks; returns extracted events. Keeps partial lines in `state.buffer`.
 */
export function parseSseChunk(
  state: { buffer: string },
  chunk: string,
): SseEvent[] {
  state.buffer += chunk;
  const events: SseEvent[] = [];
  let idx: number;
  while ((idx = state.buffer.indexOf("\n")) >= 0) {
    const line = state.buffer.slice(0, idx).replace(/\r$/, "");
    state.buffer = state.buffer.slice(idx + 1);
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

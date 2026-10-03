// POST /api/internal/gpt-model-probe — measure the web chat's OpenRouter chain.
// Auth: Authorization: Bearer GPT_BILLING_MAINTENANCE_SECRET, checked before
// the body is read. Run by hand after a deploy that changes models (plan
// WP-03, release step R1.1), never by the cron.
//
// Every OpenRouter model of the site's chains (the paid chain, then the free
// chain; Z.ai has its own blind eval, scripts/zai-blind-eval.ts) receives the
// chat's own streaming request (openRouterRequest: production system prompt,
// max_tokens, reasoning policy, price cap) with fixed synthetic prompts,
// alternating Uzbek and Russian. Per call only these are kept: the HTTP
// status, finish_reason, reasoning_tokens, the time to first content and a
// machine error code. The answer text is read and dropped — never stored,
// logged or returned — and the OpenRouter key never leaves the server.
// Nothing is written to D1: a probe must not cool a model down, take a quota
// or raise an alert.
//
// A call passes only with no error code. The code is the chat's own failure
// class (classifyFailureResponse / the SSE parser), because OpenRouter can
// answer 200 and still fail inside the stream (an upstream 429 or 502 before
// any content). So `rate429` counts every rate_limit, HTTP 429 or in-stream,
// exactly as the chat cools a model down for either.
//
// Body (optional JSON, ≤ 256 bytes):
//   {"calls":N}                      every chain model, N calls each (default 2)
//   {"model":"<chain id>","calls":N} one model, e.g. 20 calls for the 429 share
// N is 1..20 and at most 40 calls in total (Workers Free allows 50
// subrequests per invocation). Calls to one model run one after another, so a
// 429 measures the provider and not our own burst; models run in parallel.
// Calls that would start after PROBE_BUDGET_MS are not made (`calls` < `planned`).
//
// Cost: a paid call bills a few hundred tokens (well under $0.001 a run).
// Every ':free' call counts against OpenRouter's free-tier allowance while the
// account has bought no credits (50 requests a day shared by chat, bot, AEO).
//
// ?target=javob probes the Telegram bot's reply path instead (plan WP-08):
// runJavobValidated (functions/lib/telegram/service.ts) on a fixed Uzbek and a
// fixed Russian message, each once as a text reply (validation and its one
// stricter retry, 14 + 10 s) and once as a voice reply (one generation of at
// most two models, 10 s). Unlike the chain probe this IS the bot's path: it
// reads model health, so a model that is cooling down is skipped as it would
// be for a person, a failure cools a model down as a bot reply would, and a
// paid primary spends from the free tier's daily budget (what a reply records
// about OpenRouter itself, a 402 or the spent budget, the probe records too).
// It takes no quota and records no bot_<code>. Per run only codes come back
// (ok, error code, the validator's issue codes, the model id, retried,
// latency); never the text. The body is ignored.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { freeChain, modelChain, resolveConfig, type GptChatConfig } from "../../lib/gpt-chat/config";
import { fail, json, readTextLimited } from "../../lib/gpt-chat/http";
import { providerOf } from "../../lib/gpt-chat/model-provider";
import { OPENROUTER_ENDPOINT, classifyFailureResponse } from "../../lib/gpt-chat/openrouter-chat";
import { openRouterRequest, parseSseChunk } from "../../lib/gpt-chat/openrouter-stream";
import { internalAuthorized } from "../../lib/gpt-chat/internal-auth";
import { buildMessages } from "../../lib/gpt-chat/prompt";
import { buildJavobReplyPrompt } from "../../lib/telegram/prompts";
import { resolveTelegramConfig } from "../../lib/telegram/config";
import {
  JAVOB_REPLY_DEADLINE_MS,
  JAVOB_VOICE_MAX_ATTEMPTS,
  JAVOB_VOICE_MS,
  runJavobValidated,
} from "../../lib/telegram/service";
import { REASONING_OFF_MODELS } from "../../platform/ai/model-policy";

type Locale = "uz" | "ru";

/** Fixed questions: no visitor text ever reaches this endpoint. */
const PROMPTS: Readonly<Record<Locale, string>> = {
  uz: "Kichik do‘kon uchun Telegram-bot qanday foyda beradi? Uchta qisqa band bilan javob bering.",
  ru: "Чем Telegram-бот полезен небольшому магазину? Ответьте тремя короткими пунктами.",
};

/** Fixed incoming messages for ?target=javob: what a person forwards to the bot. */
const JAVOB_MESSAGES: Readonly<Record<Locale, string>> = {
  uz: "Salom! Ertangi uchrashuvni boshqa kunga ko‘chirsak bo‘ladimi? Menga biroz noqulay bo‘lib qoldi.",
  ru: "Здравствуйте! Можно перенести завтрашнюю встречу на другой день? Мне стало неудобно.",
};

const DEFAULT_CALLS = 2;
const MAX_CALLS_PER_MODEL = 20;
const MAX_TOTAL_CALLS = 40;
/** One whole streamed answer of up to GPT_MAX_OUTPUT_TOKENS. */
const CALL_TIMEOUT_MS = 30_000;
const PROBE_BUDGET_MS = 110_000;

export interface ProbeCall {
  locale: Locale;
  /** HTTP status; 0 when no response arrived. */
  status: number;
  finishReason: string | null;
  reasoningTokens: number | null;
  /** From sending the request to the first content delta. */
  ttftMs: number | null;
  /**
   * Machine code only, absent when the call answered: the chat's failure
   * class of a non-2xx status or of an in-stream error (rate_limit,
   * bad_request, model_unavailable, …), 'empty', 'timeout' or 'network'.
   */
  error?: string;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function tally(values: Array<string | number | null>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (value === null) continue;
    counts[String(value)] = (counts[String(value)] ?? 0) + 1;
  }
  return counts;
}

async function probeOnce(
  env: BillingEnv,
  cfg: GptChatConfig,
  model: string,
  locale: Locale,
  deadline: number,
): Promise<ProbeCall> {
  const call: ProbeCall = { locale, status: 0, finishReason: null, reasoningTokens: null, ttftMs: null };
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(1, Math.min(CALL_TIMEOUT_MS, deadline - started)),
  );
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const messages = buildMessages([], PROMPTS[locale], cfg.maxHistoryTurns, locale);
    const res = await fetch(OPENROUTER_ENDPOINT, {
      ...openRouterRequest(env, cfg, model, messages, cfg.maxOutputTokens),
      signal: controller.signal,
    });
    call.status = res.status;
    if (!res.ok || !res.body) {
      // Releases the body; of a 400 it reads ≤ 2 KB, matched and dropped.
      call.error = res.ok ? "empty" : await classifyFailureResponse(res, model);
      return call;
    }
    reader = res.body.getReader();
    const decoder = new TextDecoder();
    const state = { buffer: "" };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parseSseChunk(state, decoder.decode(value, { stream: true }), "openrouter", model)) {
        if (event.error) call.error = event.error;
        if (event.delta?.trim() && call.ttftMs === null) call.ttftMs = Date.now() - started;
        if (event.finishReason) call.finishReason = event.finishReason;
        if (event.reasoningTokens !== undefined) call.reasoningTokens = event.reasoningTokens;
      }
    }
    if (call.ttftMs === null && !call.error) call.error = "empty";
  } catch (error) {
    call.error = (error as Error).name === "AbortError" ? "timeout" : "network";
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => undefined);
  }
  return call;
}

async function probeModel(
  env: BillingEnv,
  cfg: GptChatConfig,
  model: string,
  planned: number,
  deadline: number,
) {
  const results: ProbeCall[] = [];
  for (let i = 0; i < planned && Date.now() < deadline; i++)
    results.push(await probeOnce(env, cfg, model, i % 2 === 0 ? "uz" : "ru", deadline));
  const ttft = results.map((r) => r.ttftMs).filter((ms): ms is number => ms !== null);
  const reasoning = results.map((r) => r.reasoningTokens).filter((n): n is number => n !== null);
  return {
    model,
    reasoningOff: REASONING_OFF_MODELS.has(model),
    planned,
    calls: results.length,
    statuses: tally(results.map((r) => r.status)),
    errors: tally(results.map((r) => r.error ?? null)),
    rate429: results.length
      ? Math.round((results.filter((r) => r.error === "rate_limit").length / results.length) * 1000) / 1000
      : null,
    finishReasons: tally(results.map((r) => r.finishReason)),
    reasoningTokensMax: reasoning.length ? Math.max(...reasoning) : null,
    ttftMsMedian: median(ttft),
    results,
  };
}

export interface JavobProbeRun {
  mode: "text" | "voice";
  locale: Locale;
  ok: boolean;
  /** The bot's failure code (models_cooling, validation_failed, timeout, …); absent when the reply passed. */
  code?: string;
  /** Validator issue codes of every rejected answer, never their detail. */
  issues: string[];
  model: string | null;
  retried: boolean;
  latencyMs: number;
}

async function probeJavob(env: BillingEnv): Promise<JavobProbeRun[]> {
  const { maxOutputChars } = resolveTelegramConfig(env);
  const runs = (["text", "voice"] as const).flatMap((mode) =>
    (["uz", "ru"] as const).map(async (locale): Promise<JavobProbeRun> => {
      const source = JAVOB_MESSAGES[locale];
      const voice = mode === "voice";
      const res = await runJavobValidated(
        env,
        buildJavobReplyPrompt(source, undefined, voice ? locale : null),
        maxOutputChars,
        {
          source,
          expectedLanguage: locale,
          mode: "reply",
          deadline: Date.now() + JAVOB_REPLY_DEADLINE_MS,
          ...(voice
            ? { firstAttemptMs: JAVOB_VOICE_MS, maxAttempts: JAVOB_VOICE_MAX_ATTEMPTS, validationRetry: false }
            : {}),
        },
      );
      return {
        mode,
        locale,
        ok: res.ok,
        ...(res.ok ? {} : { code: res.errorCode || "unknown" }),
        issues: res.issues,
        model: res.model ?? null,
        retried: res.retried,
        latencyMs: res.latencyMs,
      };
    }),
  );
  return Promise.all(runs);
}

export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!internalAuthorized(request, env.GPT_BILLING_MAINTENANCE_SECRET))
    return fail("forbidden", "Forbidden", 403);
  const body = await readTextLimited(request, 256);
  if (!body.ok && body.code === "payload_too_large")
    return fail("payload_too_large", "Invalid request body", 413);
  let options: { model?: unknown; calls?: unknown } = {};
  if (body.ok && body.value.trim()) {
    try {
      const parsed: unknown = JSON.parse(body.value);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        return fail("bad_json", "Invalid JSON body");
      options = parsed as typeof options;
    } catch {
      return fail("bad_json", "Invalid JSON body");
    }
  }
  if (!env.OPENROUTER_API_KEY) return fail("no_key", "OpenRouter is not configured", 503);
  const target = new URL(request.url).searchParams.get("target");
  if (target !== null && target !== "javob")
    return fail("unknown_target", "target is javob or absent");
  if (target === "javob") return json({ ok: true, target, runs: await probeJavob(env) });

  const cfg = resolveConfig(env);
  const chain = [...new Set([...modelChain(cfg, "paid"), ...freeChain(cfg)])].filter(
    (model) => providerOf(model) === "openrouter",
  );
  let models = chain;
  if (options.model !== undefined) {
    if (typeof options.model !== "string" || !chain.includes(options.model))
      return fail("unknown_model", "Not a model of the chat's chains", 400);
    models = [options.model];
  }
  const calls = options.calls === undefined ? DEFAULT_CALLS : options.calls;
  if (
    typeof calls !== "number" ||
    !Number.isInteger(calls) ||
    calls < 1 ||
    calls > MAX_CALLS_PER_MODEL ||
    calls * models.length > MAX_TOTAL_CALLS
  )
    return fail("bad_calls", `calls must be 1..${MAX_CALLS_PER_MODEL}, at most ${MAX_TOTAL_CALLS} in total`);

  const deadline = Date.now() + PROBE_BUDGET_MS;
  return json({
    ok: true,
    maxTokens: cfg.maxOutputTokens,
    firstContentTimeoutMs: cfg.firstContentTimeoutMs,
    models: await Promise.all(models.map((model) => probeModel(env, cfg, model, calls, deadline))),
  });
};

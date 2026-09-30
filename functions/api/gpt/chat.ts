// POST /api/gpt/chat — main chat turn.
// Body: { sessionId, message, locale, history?, turnstileToken? }
// Enforces hashed-IP quotas, calls OpenRouter server-side with a model
// fallback chain, persists both messages + usage, returns a friendly error
// on provider failure instead of crashing.
//
// The chain comes from webChatChain(): the OpenRouter chain by default, or one
// Z.ai model in front of it when GPT_MODEL_PROVIDER='zai', GPT_ZAI_EVAL_APPROVED
// and the secret ZAI_API_KEY are all set (model-provider.ts). meta/done/
// modelUsed always carry the id of the model that actually answered
// ('zai/glm-4.7-flash', 'google/gemma-4-31b-it:free', …); the UI prints it
// verbatim. Answer length is cfg.maxOutputTokens (GPT_MAX_OUTPUT_TOKENS).
//
// Every reservation is settled once, without any text (TurnStore.finish,
// migrations/0066): outcome, charged, model, finish_reason, time to first
// content, total time, tokens, list-price cost and attempts. An answer cut at
// the length limit is never charged and says so (done.truncated); a stopped
// answer is charged only past GPT_STOP_CHARGE_MIN_CHARS delivered characters
// (turn-outcome.ts). `remaining` / `hourRemaining` are read after that
// settlement. A free turn may start on the paid primary only through the
// day's budget (model-spend-store.ts); a pack turn walks under its attempt
// ceiling (TurnStore.admitModelAttempt).
//
// A refused turn answers 429 with the precise reason, the tier's limits and
// when a turn fits again (retryAt, retryAfterSec, Retry-After), in the
// visitor's language (chat-copy.ts), and is counted in gpt_limit_hits. The
// free tier counts by account and by IP hash, so signing in gives no new
// allowance; a spent or ended pack leaves the free tier open (turn-store.ts).
import type { Env } from "../../_types";
import type { Locale } from "../../../src/shared/types";
import { resolveConfig, type GptChatConfig } from "../../lib/gpt-chat/config";
import { webChatChain } from "../../lib/gpt-chat/model-provider";
import { estimateCostUsd } from "../../lib/gpt-chat/model-pricing";
import {
  FREE_PAID_BUDGET_ALERT,
  ModelSpendStore,
  freePaidBudget,
} from "../../lib/gpt-chat/model-spend-store";
import { recordServiceAlert } from "../../lib/gpt-chat/billing-maintenance-store";
import { alertOperator } from "../../lib/gpt-chat/operator-alert";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { hashIp, getClientIp } from "../../lib/gpt-chat/hash";
import { json, fail, readJsonLimited, genId } from "../../lib/gpt-chat/http";
import { normLocale, validateMessage } from "../../lib/gpt-chat/validate";
import {
  BILLING_ORG,
  billingMode,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import {
  BillingStore,
  type AccessPeriod,
} from "../../lib/gpt-chat/billing-store";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { IdentityStore, cookieValue } from "../../lib/gpt-chat/identity-store";
import {
  PACK_DAILY_LIMIT,
  TurnStore,
  type Allowance,
  type LimitExplanation,
  type TurnSettlement,
} from "../../lib/gpt-chat/turn-store";
import { limitMessage, providerMessage } from "../../lib/gpt-chat/chat-copy";
import {
  failureOutcome,
  isTruncated,
  settleStreamedAnswer,
} from "../../lib/gpt-chat/turn-outcome";
import {
  modelFailed,
  settleModelFailure,
} from "../../lib/gpt-chat/model-health-store";
import { buildMessages, type ChatMessage } from "../../lib/gpt-chat/prompt";
import {
  chatComplete,
  type AdmitAttempt,
} from "../../lib/gpt-chat/openrouter-chat";
import {
  chatStreamStart,
  parseSseChunk,
} from "../../lib/gpt-chat/openrouter-stream";
import { checkTurnstile } from "../../lib/turnstile";
import { proxyToRailway, relay } from "../../lib/gpt-chat/gateway";

interface ChatBody {
  sessionId?: string;
  message?: string;
  locale?: string;
  history?: ChatMessage[];
  turnstileToken?: string;
  /** When true the response is SSE (text/event-stream) instead of JSON. */
  stream?: boolean;
}

/**
 * Failures that say nothing about the service's health: the visitor left, or
 * the provider refused this one request (OpenRouter 403 moderation, Z.ai 1301
 * content safety, a request-level 400). They are not service alerts.
 */
const NOT_A_SERVICE_FAILURE = new Set(["aborted", "content_refused", "bad_request"]);

/**
 * The code the client sees. Every candidate cooling down (models_cooling)
 * reads as model_unavailable; the owner alert keeps the precise code.
 */
function publicProviderCode(code: string | undefined): string {
  if (code === "models_cooling") return "model_unavailable";
  return code === "no_key" ||
    code === "rate_limit" ||
    code === "model_unavailable" ||
    code === "timeout"
    ? code
    : "provider_error";
}

/** USD → integer micro-USD for gpt_turn_reservations.cost_micro_usd; null stays unknown. */
function microUsd(usd: number | null): number | null {
  return usd === null ? null : Math.round(usd * 1_000_000);
}

/**
 * The 429 of a refused turn (plan WP-05): the precise reason, the tier and
 * its limits, when a turn fits again (retryAt, retryAfterSec and the
 * Retry-After header) and a message in the visitor's language.
 */
function limitReached(
  limit: LimitExplanation,
  tier: "free" | "paid",
  cfg: GptChatConfig,
  locale: Locale,
  now = Date.now(),
): Response {
  const retryAfterSec =
    limit.retryAt === null
      ? null
      : Math.max(1, Math.ceil((limit.retryAt - now) / 1000));
  const limits =
    tier === "paid"
      ? { daily: PACK_DAILY_LIMIT, hourly: null }
      : { daily: cfg.freeDailyLimit, hourly: cfg.freeHourlyLimit };
  return json(
    {
      ok: false,
      code: "limit_reached",
      reason: limit.reason,
      tier,
      remaining: limit.remaining,
      limits,
      retryAt: limit.retryAt,
      retryAfterSec,
      message: limitMessage(limit.reason, locale, {
        limits,
        remaining: limit.remaining,
        retryAfterSec,
      }),
    },
    429,
    retryAfterSec === null ? {} : { "Retry-After": String(retryAfterSec) },
  );
}

export const onRequestPost: PagesFunction<Env> = async ({
  request,
  env,
  waitUntil,
}) => {
  const cfg = resolveConfig(env);
  const parsed = await readJsonLimited<ChatBody>(request, 128_000);
  if (!parsed.ok)
    return fail(
      parsed.code,
      "Invalid request body",
      parsed.code === "payload_too_large" ? 413 : 400,
    );
  const body = parsed.value;
  if (!body || typeof body !== "object")
    return fail("bad_json", "Invalid JSON body");
  const wantStream = body.stream === true;

  const msg = validateMessage(body.message, cfg.maxInputChars);
  if (!msg.ok) return fail("invalid_message", msg.error || "invalid message");

  const ip = getClientIp(request);
  if (env.TURNSTILE_SECRET_KEY) {
    const turnstile = await checkTurnstile(env, body.turnstileToken, ip, {
      expectedAction: "gpt_chat",
      expectedHostname: new URL(request.url).hostname,
    });
    if (!turnstile.ok) {
      if (turnstile.reason === "unavailable") {
        return fail(
          "turnstile_unavailable",
          "Проверка временно недоступна. Попробуйте ещё раз.",
          503,
        );
      }
      return fail(
        "turnstile_failed",
        "Проверка не пройдена. Выполните её ещё раз.",
        403,
      );
    }
  }

  // Prefer the Railway backend (Supabase-backed) when configured — JSON mode
  // only; streaming always runs the local path. Turnstile must run first.
  // The single-use token is edge-only and must not be relayed or logged.
  if (
    !wantStream &&
    !billingMode(env as BillingEnv) &&
    !cookieValue(request, "__Host-gpt_account")
  ) {
    const railwayBody = { ...body };
    delete railwayBody.turnstileToken;
    const g = await proxyToRailway(env, request, "/v1/gpt/chat", {
      bodyText: JSON.stringify(railwayBody),
    });
    if (g.proxied && g.response) return relay(g.response);
  }

  const locale = normLocale(body.locale);
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId
      ? body.sessionId.slice(0, 64)
      : genId("sess");
  let plan: "free" | "paid" = "free";
  const db = env.GPTBOT_DRAFTS_DB;
  const hashedIp = await hashIp(ip, cfg);

  let subject = hashedIp;
  let period: AccessPeriod | null = null;
  let reservation: string | null = null;
  let admittedRemaining = -1;
  const turns = db ? new TurnStore(db, BILLING_ORG) : null;
  // Fail closed: the provider's own limit does not bound our money.
  if (!db) return fail("quota_unavailable", "Try again later", 503);
  {
    try {
      await ensureSchema(db);
      await ensureBillingSchema(db);
      const user = await new IdentityStore(db, BILLING_ORG).user(request);
      if (user) {
        subject = user;
        period = await new BillingStore(db, BILLING_ORG).access(
          user,
          billingMode(env as BillingEnv) || "live",
        );
      }
      let decision = await turns!.reserve(subject, hashedIp, period, cfg);
      if (decision.limit?.reason === "monthly") {
        // The pack was spent or ended after access() read it; the free tier
        // still applies (decision L5).
        period = null;
        decision = await turns!.reserve(subject, hashedIp, null, cfg);
      }
      if (period) plan = "paid";
      if (decision.limit) {
        const refused = decision.limit;
        waitUntil(
          turns!
            .recordLimitHit(refused.reason, plan, subject)
            .catch(() => console.warn("gpt_limit_hit_record_failed")),
        );
        return limitReached(refused, plan, cfg, locale);
      }
      reservation = decision.id;
      admittedRemaining = decision.remaining;
    } catch {
      return fail("quota_unavailable", "Try again later", 503);
    }
  }
  const settle = async (settlement: TurnSettlement) => {
    if (reservation)
      try {
        await turns!.finish(reservation, settlement);
      } catch {
        console.warn("gpt_quota_settlement_failed");
      }
  };
  // What is left once the turn is settled; the admission's count if D1 fails.
  const allowance = async (): Promise<Allowance> => {
    try {
      return await turns!.allowance(subject, hashedIp, period, cfg);
    } catch {
      return { remaining: admittedRemaining, hourRemaining: null };
    }
  };

  // Provider call.
  const messages = buildMessages(
    body.history,
    msg.value!,
    cfg.maxHistoryTurns,
    locale,
  );
  if (messages[messages.length - 1].content !== msg.value) {
    await settle({ outcome: "context_too_large", charged: false });
    return fail("context_too_large", "Shorten the message", 400);
  }
  // A free turn pays for a paid model only out of the day's budget; its
  // exhaustion is recorded once a day (informational, alert-policy.ts).
  const budget = period
    ? null
    : freePaidBudget(new ModelSpendStore(db, BILLING_ORG), cfg, messages, () =>
        waitUntil(
          recordServiceAlert(env, FREE_PAID_BUDGET_ALERT).catch(() =>
            console.warn("gpt_operator_alert_record_failed"),
          ),
        ),
      );
  const admitAttempt: AdmitAttempt = budget
    ? budget.admit
    : async () => ((await turns!.admitModelAttempt(period!)) ? "ok" : "stop");
  const chain = webChatChain(cfg, env, plan);
  // OpenRouter credits (402 on a paid model) and Z.ai balance / key failures
  // page the owner (operator-alert.ts). Runs in the background and never
  // throws into the turn.
  const onOperatorEvent = (code: string) => waitUntil(alertOperator(env, code));
  // A failed turn is recorded, runs the silence watchdog (its second circuit
  // when the maintenance cron is down) and delivers what is urgent. Nothing
  // else: the retention sweeps belong to the cron.
  const reportFailure = (code: string) =>
    waitUntil(alertOperator(env, "chat_" + code, { watchdog: true }));

  const turnStarted = Date.now();
  if (wantStream) {
    const start = await chatStreamStart(
      env,
      cfg,
      chain,
      messages,
      cfg.maxOutputTokens,
      60_000,
      request.signal,
      admitAttempt,
      onOperatorEvent,
    ).catch(() => ({ ok: false as const, errorCode: "provider_error", attempts: 0 }));
    if (!start.ok) {
      await settle({
        outcome: failureOutcome(start.errorCode),
        charged: false,
        cancelReason: start.errorCode === "aborted" ? "client_gone" : null,
        totalMs: Date.now() - turnStarted,
        attempts: start.attempts,
      });
      if (!NOT_A_SERVICE_FAILURE.has(start.errorCode))
        reportFailure(start.errorCode);
      // Plain JSON (not SSE) — the client falls back on Content-Type.
      const code = publicProviderCode(start.errorCode);
      return json({
        ok: false,
        code,
        message: providerMessage(code, locale),
        sessionId,
      });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const writer = writable.getWriter();
    const send = (obj: unknown) =>
      writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

    const pump = async () => {
      const reader = start.body.getReader();
      const state = { buffer: "" };
      let answer = "";
      // Answer characters whose write reached the visitor's stream.
      let deliveredChars = 0;
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      let reasoningTokens: number | undefined;
      let finishReason: string | undefined;
      let clientGone = false;
      let completed = false;
      // The upstream's own failure code when it broke mid-stream.
      let upstreamCode: string | null = null;
      // A failed write means the visitor pressed Stop or left.
      const deliver = async (event: unknown) => {
        try {
          await send(event);
          return true;
        } catch {
          clientGone = true;
          return false;
        }
      };
      try {
        if (await deliver({ type: "meta", sessionId, model: start.model }))
          read: for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const ev of parseSseChunk(
              state,
              decoder.decode(value, { stream: true }),
              start.provider,
              start.model,
            )) {
              if (ev.error) {
                upstreamCode = ev.error;
                break read;
              }
              if (ev.done) completed = true;
              if (ev.inputTokens !== undefined) inputTokens = ev.inputTokens;
              if (ev.outputTokens !== undefined) outputTokens = ev.outputTokens;
              if (ev.reasoningTokens !== undefined)
                reasoningTokens = ev.reasoningTokens;
              if (ev.finishReason) finishReason = ev.finishReason;
              if (ev.delta) {
                answer += ev.delta;
                if (!(await deliver({ type: "delta", text: ev.delta })))
                  break read;
                deliveredChars += ev.delta.length;
              }
            }
          }
      } catch {
        // A read error: the upstream broke, or the visitor left and
        // request.signal aborted the upstream fetch with it.
        if (!request.signal.aborted) upstreamCode = "provider_error";
      } finally {
        start.abort();
        await reader.cancel().catch(() => undefined);
      }
      if (request.signal.aborted) clientGone = true;
      const { outcome, charged, cancelReason } = settleStreamedAnswer(
        {
          hasText: !!answer.trim(),
          deliveredChars,
          completed,
          upstreamCode,
          clientGone,
          finishReason,
        },
        cfg.stopChargeMinChars,
      );
      // 0 tokens means the usage chunk never arrived → unknown cost.
      const tokensIn = inputTokens || null;
      const tokensOut = outputTokens || null;
      const costUsd = estimateCostUsd(start.model, tokensIn, tokensOut);
      await settle({
        outcome,
        charged,
        cancelReason,
        model: start.model,
        finishReason: finishReason ?? null,
        ttftMs: start.ttftMs,
        totalMs: Date.now() - turnStarted,
        tokensIn,
        tokensOut,
        reasoningTokens: reasoningTokens ?? null,
        costMicroUsd: microUsd(costUsd),
        attempts: start.attempts,
      });
      await budget?.settle(start.model, costUsd);
      if (!clientGone && (upstreamCode !== null || !completed)) {
        // Z.ai: a mid-stream safety stop (1301 / finish_reason 'sensitive')
        // refused this answer only, so it cools nothing down; a balance or
        // key failure blocks 'zai/*' and pages the owner. OpenRouter keeps
        // its historical 30 s provider_error cooldown.
        if (start.provider === "zai")
          await settleModelFailure(
            db,
            start.model,
            upstreamCode || "provider_error",
            onOperatorEvent,
          );
        else await modelFailed(db, start.model, "provider_error");
      }

      // Persist (best-effort), then tell the visitor how the turn settled.
      const nowIso = new Date().toISOString();
      if (
        db &&
        answer.trim() &&
        (await new IdentityStore(db, BILLING_ORG).ownsChat(
          request,
          sessionId,
        ))
      ) {
        try {
          await db.batch([
            db
              .prepare(
                "INSERT INTO gpt_messages (id, session_id, role, content, model_used, token_in, token_out, cost_usd, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                genId("msg"),
                sessionId,
                "user",
                msg.value!,
                null,
                tokensIn,
                null,
                null,
                nowIso,
              ),
            db
              .prepare(
                "INSERT INTO gpt_messages (id, session_id, role, content, model_used, token_in, token_out, cost_usd, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                genId("msg"),
                sessionId,
                "assistant",
                answer,
                start.model,
                null,
                tokensOut,
                costUsd,
                nowIso,
              ),
            db
              .prepare(
                "UPDATE gpt_sessions SET last_activity_at = ? WHERE id = ?",
              )
              .bind(nowIso, sessionId),
          ]);
        } catch {
          /* best-effort */
        }
      }
      if (!clientGone) {
        const { remaining, hourRemaining } = await allowance();
        // A partial answer is still worth keeping on the visitor's side.
        await deliver(
          !answer.trim()
            ? { type: "error", code: "provider_error" }
            : outcome === "answered" || outcome === "truncated"
              ? {
                  type: "done",
                  remaining,
                  hourRemaining,
                  modelUsed: start.model,
                  truncated: outcome === "truncated",
                  charged,
                }
              : {
                  type: "error",
                  code: "partial",
                  remaining,
                  hourRemaining,
                  modelUsed: start.model,
                },
        );
      }
      try {
        await writer.close();
      } catch {
        /* already closed */
      }
    };
    waitUntil(pump());

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const result = await chatComplete(
    env,
    cfg,
    chain,
    messages,
    cfg.maxOutputTokens,
    45_000,
    request.signal,
    admitAttempt,
    onOperatorEvent,
  ).catch(() => ({ ok: false as const, errorCode: "provider_error", attempts: 0 }));

  if (!result.ok) {
    const failure = result.errorCode ?? "provider_error";
    await settle({
      outcome: failureOutcome(failure),
      charged: false,
      cancelReason: failure === "aborted" ? "client_gone" : null,
      totalMs: Date.now() - turnStarted,
      attempts: result.attempts,
    });
    if (!NOT_A_SERVICE_FAILURE.has(result.errorCode ?? ""))
      reportFailure(result.errorCode ?? "provider_error");
    // 200 with ok:false so the client renders an error state, not a crash.
    const code = publicProviderCode(result.errorCode);
    return json({
      ok: false,
      code,
      message: providerMessage(code, locale),
      sessionId,
    });
  }

  const answer = result.content!;
  // A JSON answer reaches the visitor whole or not at all, so only a cut at
  // the length limit is left uncharged here.
  const truncated = isTruncated(result.finishReason);
  const costUsd = estimateCostUsd(
    result.modelUsed,
    result.inputTokens,
    result.outputTokens,
  );
  await settle({
    outcome: truncated ? "truncated" : "answered",
    charged: !truncated,
    model: result.modelUsed,
    finishReason: result.finishReason ?? null,
    totalMs: Date.now() - turnStarted,
    tokensIn: result.inputTokens,
    tokensOut: result.outputTokens,
    reasoningTokens: result.reasoningTokens,
    costMicroUsd: microUsd(costUsd),
    attempts: result.attempts,
  });
  if (result.modelUsed) await budget?.settle(result.modelUsed, costUsd);
  const nowIso = new Date().toISOString();

  // Persist (best-effort — never block the answer on a write failure).
  if (
    db &&
    (await new IdentityStore(db, BILLING_ORG).ownsChat(
      request,
      sessionId,
    ))
  ) {
    try {
      await db.batch([
        db
          .prepare(
            "INSERT INTO gpt_messages (id, session_id, role, content, model_used, token_in, token_out, cost_usd, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            genId("msg"),
            sessionId,
            "user",
            msg.value!,
            null,
            result.inputTokens ?? null,
            null,
            null,
            nowIso,
          ),
        db
          .prepare(
            "INSERT INTO gpt_messages (id, session_id, role, content, model_used, token_in, token_out, cost_usd, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            genId("msg"),
            sessionId,
            "assistant",
            answer,
            result.modelUsed ?? null,
            null,
            result.outputTokens ?? null,
            costUsd,
            nowIso,
          ),
        db
          .prepare("UPDATE gpt_sessions SET last_activity_at = ? WHERE id = ?")
          .bind(nowIso, sessionId),
      ]);
    } catch {
      /* best-effort persistence */
    }
  }

  const { remaining, hourRemaining } = await allowance();

  return json({
    ok: true,
    answer,
    remaining,
    hourRemaining,
    truncated,
    charged: !truncated,
    modelUsed: result.modelUsed,
    sessionId,
  });
};

export const onRequest: PagesFunction<Env> = async () =>
  fail("method_not_allowed", "Use POST", 405);

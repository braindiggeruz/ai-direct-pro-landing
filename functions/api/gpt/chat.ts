// POST /api/gpt/chat — main chat turn.
// Body: { sessionId, message, locale, history?, turnstileToken? }
// Enforces hashed-IP quotas, calls OpenRouter server-side with a model
// fallback chain, persists both messages + usage, returns a friendly error
// on provider failure instead of crashing.
import type { Env } from "../../_types";
import { resolveConfig, modelChain } from "../../lib/gpt-chat/config";
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
import { TurnStore } from "../../lib/gpt-chat/turn-store";
import { modelFailed } from "../../lib/gpt-chat/model-health-store";
import { buildMessages, type ChatMessage } from "../../lib/gpt-chat/prompt";
import { chatComplete } from "../../lib/gpt-chat/openrouter-chat";
import {
  chatStreamStart,
  parseSseChunk,
} from "../../lib/gpt-chat/openrouter-stream";
import { checkTurnstile } from "../../lib/turnstile";
import { proxyToRailway, relay } from "../../lib/gpt-chat/gateway";
import {
  maintainBilling,
  recordServiceAlert,
} from "../../lib/gpt-chat/billing-maintenance-store";

interface ChatBody {
  sessionId?: string;
  message?: string;
  locale?: string;
  history?: ChatMessage[];
  turnstileToken?: string;
  /** When true the response is SSE (text/event-stream) instead of JSON. */
  stream?: boolean;
}

function publicProviderCode(code: string | undefined): string {
  return code === "no_key" ||
    code === "rate_limit" ||
    code === "model_unavailable" ||
    code === "timeout"
    ? code
    : "provider_error";
}

function providerMessage(code: string | undefined): string {
  if (code === "no_key")
    return "AI-чат временно не настроен. Попробуйте позже.";
  if (code === "rate_limit")
    return "Сейчас много запросов. Попробуйте ещё раз через минуту.";
  if (code === "model_unavailable")
    return "Модели AI-чата обновляются. Попробуйте ещё раз немного позже.";
  if (code === "timeout")
    return "Ответ занял слишком много времени. Попробуйте ещё раз.";
  return "Не удалось получить ответ. Попробуйте переформулировать или повторить.";
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
  const hashedIp = await hashIp(ip, cfg.hashSalt);

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
      if (period) plan = "paid";
      const decision = await turns!.reserve(subject, hashedIp, period, cfg);
      reservation = decision.id;
      admittedRemaining = decision.remaining;
      if (!decision.id) {
        return json(
          {
            ok: false,
            code: "limit_reached",
            reason: decision.reason,
            remaining: decision.remaining,
            message:
              decision.reason === "hourly"
                ? "Слишком много сообщений за час. Попробуйте позже или оформите Plus."
                : "Дневной лимит бесплатных сообщений исчерпан. Возвращайтесь завтра или оформите Plus.",
          },
          429,
        );
      }
    } catch {
      return fail("quota_unavailable", "Try again later", 503);
    }
  }
  const finish = async (hasAnswer: boolean) => {
    if (reservation)
      try {
        await turns!.finish(reservation, hasAnswer);
      } catch {
        console.warn("gpt_quota_settlement_failed");
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
    await finish(false);
    return fail("context_too_large", "Shorten the message", 400);
  }
  const admitAttempt = period
    ? () => turns!.admitModelAttempt(period!)
    : undefined;

  if (wantStream) {
    const start = await chatStreamStart(
      env,
      cfg,
      modelChain(cfg, plan),
      messages,
      900,
      60_000,
      request.signal,
      admitAttempt,
    ).catch(() => ({ ok: false as const, errorCode: "provider_error" }));
    if (!start.ok) {
      await finish(false);
      if (start.errorCode !== "aborted")
        waitUntil(
          recordServiceAlert(env, "chat_" + start.errorCode)
            .then(() => maintainBilling(env))
            .catch(() => console.warn("gpt_alert_delivery_failed")),
        );
      // Plain JSON (not SSE) — the client falls back on Content-Type.
      return json({
        ok: false,
        code: publicProviderCode(start.errorCode),
        message: providerMessage(start.errorCode),
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
      let inputTokens = 0;
      let outputTokens = 0;
      let clientGone = false;
      let completed = false;
      let upstreamError = false;
      try {
        await send({ type: "meta", sessionId, model: start.model });
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const ev of parseSseChunk(
            state,
            decoder.decode(value, { stream: true }),
          )) {
            if (ev.error) {
              upstreamError = true;
              throw new Error(ev.error);
            }
            if (ev.done) completed = true;
            if (ev.inputTokens !== undefined) inputTokens = ev.inputTokens ?? 0;
            if (ev.outputTokens !== undefined)
              outputTokens = ev.outputTokens ?? 0;
            if (ev.delta) {
              answer += ev.delta;
              try {
                await send({ type: "delta", text: ev.delta });
              } catch {
                clientGone = true;
              }
            }
            if (clientGone) break;
          }
          if (clientGone) break;
        }
      } catch {
        upstreamError = true;
        // Upstream broke mid-stream. If nothing was produced, tell the client;
        // a partial answer is still worth keeping on their side.
        if (!answer && !clientGone) {
          try {
            await send({ type: "error", code: "provider_error" });
          } catch {
            /* client gone */
          }
        }
      } finally {
        start.abort();
        await reader.cancel().catch(() => undefined);
      }
      const successful = !!answer.trim() && completed && !upstreamError && !clientGone && !request.signal.aborted;
      await finish(successful);
      if (
        !clientGone &&
        !request.signal.aborted &&
        (upstreamError || !completed)
      )
        await modelFailed(db, start.model, "provider_error");

      // Persist + usage + remaining (best-effort), then close the stream.
      const nowIso = new Date().toISOString();
      const remaining = admittedRemaining;
      if (
        db &&
        answer.trim() &&
        (await new IdentityStore(db, BILLING_ORG).ownsChat(
          request,
          sessionId,
          cfg.hashSalt,
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
                inputTokens || null,
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
                outputTokens || null,
                null,
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
      if (answer.trim() && !clientGone) {
        try {
          await send(
            successful
              ? { type: "done", remaining, modelUsed: start.model }
              : {
                  type: "error",
                  code: "partial",
                  remaining,
                  modelUsed: start.model,
                },
          );
        } catch {
          /* client gone */
        }
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
    modelChain(cfg, plan),
    messages,
    900,
    45_000,
    request.signal,
    admitAttempt,
  ).catch(() => ({ ok: false as const, errorCode: "provider_error" }));

  if (!result.ok) {
    await finish(false);
    if (result.errorCode !== "aborted")
      waitUntil(
        recordServiceAlert(env, "chat_" + result.errorCode)
          .then(() => maintainBilling(env))
          .catch(() => console.warn("gpt_alert_delivery_failed")),
      );
    // 200 with ok:false so the client renders an error state, not a crash.
    return json({
      ok: false,
      code: publicProviderCode(result.errorCode),
      message: providerMessage(result.errorCode),
      sessionId,
    });
  }

  const answer = result.content!;
  await finish(true);
  const nowIso = new Date().toISOString();

  // Persist (best-effort — never block the answer on a write failure).
  if (
    db &&
    (await new IdentityStore(db, BILLING_ORG).ownsChat(
      request,
      sessionId,
      cfg.hashSalt,
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
            null,
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

  const remaining = admittedRemaining;

  return json({
    ok: true,
    answer,
    remaining,
    modelUsed: result.modelUsed,
    sessionId,
  });
};

export const onRequest: PagesFunction<Env> = async () =>
  fail("method_not_allowed", "Use POST", 405);

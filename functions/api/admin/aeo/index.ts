import type { Env } from "../../../_types";
import { requireAuth } from "../../../lib/jwt";
import { readContentBulk } from "../../../lib/github";
import {
  analyzeContent,
  normalizeQuestions,
  sha256,
} from "../../../platform/aeo/analysis";
import { ensureAeoSchema } from "../../../platform/aeo/schema";
import { AeoStore } from "../../../platform/aeo/store";
import { allowedModel, observe } from "../../../platform/aeo/observation";

type AeoEnv = Env & {
  AEO_MEASUREMENT_MODEL?: string;
  AEO_MEASUREMENT_MODELS?: string;
  AEO_MEASUREMENTS_ENABLED?: string;
};
const configuredModels = (env: AeoEnv) =>
  [
    ...new Set(
      (env.AEO_MEASUREMENT_MODELS || env.AEO_MEASUREMENT_MODEL || "")
        .split(",")
        .map((m) => allowedModel(m.trim()))
        .filter((m): m is string => !!m),
    ),
  ].slice(0, 3);
const ORG = "gptbot-internal"; // Trusted server scope. This route grants no client tenant access.
const LIMIT = 30;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

export const onRequestGet: PagesFunction<AeoEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB)
    return json({ error: "Хранилище AEO не настроено." }, 503);
  try {
    await ensureAeoSchema(env.GPTBOT_DRAFTS_DB);
    const store = new AeoStore(env.GPTBOT_DRAFTS_DB);
    await store.expire(ORG);
    const models = configuredModels(env);
    const model = models[0] || null;
    return json({
      domain: "gptbot.uz",
      access: "internal",
      measurement: {
        available:
          env.AEO_MEASUREMENTS_ENABLED === "true" &&
          !!model &&
          !!env.OPENROUTER_API_KEY,
        model,
        models,
        dailyLimit: LIMIT,
        used: await store.used(ORG, "measurement"),
        mode: "ungrounded",
      },
      runs: await store.list(ORG),
      reviewCounts: await store.reviewCounts(ORG),
    });
  } catch {
    return json(
      { error: "Не удалось загрузить AEO. Попробуйте обновить страницу." },
      503,
    );
  }
};

export const onRequestPost: PagesFunction<AeoEnv> = async ({
  request,
  env,
}) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Origin rejected" }, 403);
  if (!env.GPTBOT_DRAFTS_DB)
    return json({ error: "Хранилище AEO не настроено." }, 503);
  const key = request.headers.get("Idempotency-Key");
  if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
    return json({ error: "Нужен ключ операции." }, 400);
  let body: {
    kind?: unknown;
    questions?: unknown;
    locale?: unknown;
    model?: unknown;
  };
  let questions: string[];
  try {
    // Enforce actual bytes while streaming, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Пустой запрос.");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 16000) {
        await reader.cancel();
        throw new Error("Запрос слишком большой.");
      }
      chunks.push(value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    body = JSON.parse(new TextDecoder().decode(data)) as typeof body;
    if (
      !body ||
      (body.kind !== "analysis" && body.kind !== "measurement") ||
      !["ru", "uz"].includes(String(body.locale))
    )
      throw new Error("Некорректные параметры анализа.");
    questions = normalizeQuestions(body.questions);
    if (body.kind === "measurement" && questions.length !== 1)
      throw new Error("Один замер — один вопрос.");
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Некорректный запрос.",
      },
      400,
    );
  }
  const kind = body.kind as "analysis" | "measurement";
  const models = configuredModels(env);
  if (
    body.model !== undefined &&
    (typeof body.model !== "string" || !models.includes(body.model))
  )
    return json({ error: "Модель не разрешена сервером." }, 400);
  const model = typeof body.model === "string" ? body.model : models[0] || null;
  if (
    kind === "measurement" &&
    (env.AEO_MEASUREMENTS_ENABLED !== "true" ||
      !model ||
      !env.OPENROUTER_API_KEY)
  )
    return json(
      {
        error:
          "Замеры выключены. Настройте разрешённую модель и серверный ключ.",
      },
      503,
    );
  const store = new AeoStore(env.GPTBOT_DRAFTS_DB);
  const id = crypto.randomUUID();
  let reserved = false;
  try {
    await ensureAeoSchema(env.GPTBOT_DRAFTS_DB);
    const hash = await sha256(
      JSON.stringify({
        kind,
        questions,
        locale: body.locale,
        model: kind === "measurement" ? model : null,
      }),
    );
    const existing = await store.find(ORG, key);
    if (existing)
      return existing.requestHash === hash
        ? json(existing, existing.status === "running" ? 202 : 200)
        : json({ error: "Ключ уже использован для другого запроса." }, 409);
    reserved = await store.reserve(
      ORG,
      id,
      key,
      hash,
      kind,
      kind === "measurement" ? LIMIT : 100,
    );
    if (!reserved) {
      const duplicate = await store.find(ORG, key);
      return duplicate
        ? duplicate.requestHash === hash
          ? json(duplicate, 202)
          : json({ error: "Конфликт ключа операции." }, 409)
        : json({ error: "Дневной лимит достигнут. История сохранена." }, 429);
    }
    const result =
      kind === "analysis"
        ? await analyzeContent(
            await readContentBulk(env),
            questions,
            body.locale as "ru" | "uz",
          )
        : await observe(questions[0], model!, env.OPENROUTER_API_KEY!);
    await store.finish(ORG, id, result, "ok" in result && !result.ok);
    return json(await store.find(ORG, key));
  } catch (error) {
    if (reserved) {
      const githubAuth = error instanceof Error && /GitHub graphql failed: (401|403)\b/.test(error.message);
      const failure = {
        code: githubAuth ? "content_auth" : "run_failed",
        message: githubAuth
          ? "Нет доступа к контенту GitHub. Администратору нужно восстановить серверный токен; затем запустите проверку заново."
          : "Не удалось завершить проверку. Вопросы сохранены; попробуйте новый запуск.",
        questions,
        locale: body.locale as "ru" | "uz",
      };
      try {
        await store.finish(ORG, id, null, true, failure);
        // A persisted terminal failure is a known operation outcome. The client can
        // start a fresh operation; only uncertain transport failures retain its key.
        return json(await store.find(ORG, key));
      } catch { /* storage outcome is unknown: preserve the key for recovery */ }
    }
    return json(
      {
        error:
          "Запуск не завершён. Проверьте историю; повторный запрос с тем же ключом не расходует квоту.",
      },
      503,
    );
  }
};

import type { Env } from "../../../_types";
import { requireAuth } from "../../../lib/jwt";
import { readContentBulk } from "../../../lib/github";
import { analyzeContent, sha256 } from "../../../platform/aeo/analysis";
import { AeoStore } from "../../../platform/aeo/store";
import { ensureAeoSchema } from "../../../platform/aeo/schema";
import type {
  AeoAnalysis,
  AeoReviewInput,
  AeoReviewWorkspace,
} from "../../../../src/shared/aeo";

const ORG = "gptbot-internal";
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!["GET", "POST"].includes(request.method))
    return json({ error: "Method not allowed" }, 405);
  if (
    request.headers.get("Origin") &&
    request.headers.get("Origin") !== new URL(request.url).origin
  )
    return json({ error: "Origin rejected" }, 403);
  if (!env.GPTBOT_DRAFTS_DB)
    return json({ error: "Хранилище недоступно." }, 503);
  try {
    await ensureAeoSchema(env.GPTBOT_DRAFTS_DB);
    const store = new AeoStore(env.GPTBOT_DRAFTS_DB);
    let input: AeoReviewInput | null = null;
    const operation = request.headers.get("Idempotency-Key") || "";
    if (request.method === "POST") {
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(operation))
        return json({ error: "Нужен ключ операции." }, 400);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "Пустой запрос." }, 400);
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 24000) {
          await reader.cancel();
          return json({ error: "Бриф слишком большой." }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        input = JSON.parse(new TextDecoder().decode(bytes)) as AeoReviewInput;
      } catch {
        return json({ error: "Некорректный запрос." }, 400);
      }
      if (
        !input ||
        !["unreviewed", "accepted", "draft", "skipped"].includes(
          input.status,
        ) ||
        !Number.isInteger(input.revision) ||
        input.revision < 0 ||
        typeof input.note !== "string" ||
        input.note.length > 2000 ||
        typeof input.answerDraft !== "string" ||
        input.answerDraft.length > 10000 ||
        typeof input.findingId !== "string" ||
        (input.targetFile !== undefined && typeof input.targetFile !== "string")
      )
        return json({ error: "Некорректные поля решения." }, 400);
    }
    const runId =
      input?.runId || new URL(request.url).searchParams.get("runId") || "";
    if (input?.priority !== undefined && ![1, 2, 3].includes(input.priority))
      return json({ error: "Некорректный приоритет." }, 400);
    if (typeof runId !== "string" || runId.length > 80)
      return json({ error: "Некорректный запуск." }, 400);
    const run = await store.run(ORG, runId);
    if (
      !run ||
      run.status !== "completed" ||
      !run.result ||
      !("findings" in run.result)
    )
      return json({ error: "Разбор не найден." }, 404);
    const analysis = run.result as AeoAnalysis;
    if (input && ["accepted", "draft"].includes(input.status) && analysis.analyzerVersion !== 2)
      return json({ error: "Этот разбор создан прежним алгоритмом. Сначала нажмите «Проверить заново» в AEO." }, 409);
    const reviews = await store.reviews(ORG, runId);
    const files = await readContentBulk(env);
    const freshness: AeoReviewWorkspace["freshness"] = {};
    const editorBases: AeoReviewWorkspace["editorBases"] = {};
    for (const original of analysis.findings) {
      const f =
        reviews.find((r) => r.findingId === original.id)?.target || original;
      const raw = f.file ? files[f.file] : undefined;
      freshness[original.id] = !f.file
        ? "no_source"
        : raw && (await sha256(raw.replace(/\r\n/g, "\n"))) === f.sourceHash
          ? "current"
          : "stale";
      if (raw) {
        const data = JSON.parse(raw) as Record<string, unknown>;
        editorBases[original.id] = {
          url: data.url,
          locale: data.locale,
          faq: data.faq || [],
          body: data.body || [],
          bodyBlocks: data.bodyBlocks || [],
        };
      }
    }
    if (input) {
      const original = analysis.findings.find((f) => f.id === input!.findingId);
      if (!original) return json({ error: "Вопрос не найден." }, 404);
      const previous = reviews.find((r) => r.findingId === original.id);
      let target = previous?.target || null;
      if (input.targetFile) {
        try {
          target = (
            await analyzeContent(
              files,
              [original.question],
              analysis.locale,
              input.targetFile,
            )
          ).findings[0];
        } catch {
          return json(
            { error: "Выберите опубликованную страницу этого языка." },
            400,
          );
        }
      }
      const effective = target || original;
      const currentTarget = effective.file
        ? (
            await analyzeContent(
              files,
              [original.question],
              analysis.locale,
              effective.file,
            )
          ).findings[0]
        : null;
      if (input.targetFile && input.status !== "unreviewed")
        return json({ error: "Сначала проверьте выбранную страницу." }, 400);
      if (input.status === "accepted" && !effective.answer)
        return json(
          {
            error: "Сначала подготовьте ответ: в источнике не хватает фактов.",
          },
          400,
        );
      if (
        ["accepted", "draft"].includes(input.status) &&
        (effective.status === "frozen" || currentTarget?.status === "frozen")
      )
        return json({ error: "Правки этой страницы ограничены." }, 409);
      if (
        ["accepted", "draft"].includes(input.status) &&
        freshness[original.id] === "stale"
      )
        return json(
          {
            error:
              "Источник изменился. Повторите анализ перед сохранением решения.",
          },
          409,
        );
      const saved = await store.saveReview(
        ORG,
        {
          runId,
          findingId: original.id,
          status: input.status,
          note: input.note,
          answerDraft: input.answerDraft,
          priority: input.priority || previous?.priority || 2,
          revision: input.revision,
          updatedAt: new Date().toISOString(),
          sourceHash: effective.sourceHash,
          target,
        },
        input.revision,
        operation,
        await sha256(JSON.stringify(input)),
      );
      return saved
        ? json(saved)
        : json(
            {
              error:
                "Решение изменилось в другой вкладке. Обновите разбор перед повтором.",
            },
            409,
          );
    }
    const pages: AeoReviewWorkspace["pages"] = [];
    for (const [file, raw] of Object.entries(files)) {
      if (!/^content\/(pages|blog)\/.+\.json$/.test(file)) continue;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (data.status === "published" && data.locale === analysis.locale)
        pages.push({
          file,
          title: String(data.h1 || data.title || data.url),
          url: String(data.url),
        });
    }
    return json({
      analysis,
      reviews,
      freshness,
      pages,
      editorBases,
    } satisfies AeoReviewWorkspace);
  } catch {
    return json(
      {
        error:
          "Не удалось загрузить или сохранить разбор. Ваш опубликованный контент не изменён.",
      },
      503,
    );
  }
};

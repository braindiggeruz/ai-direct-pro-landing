import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../lib/api";
import type { AeoReviewWorkspace } from "../../shared/aeo";
import { prepareAeoEditorPatch } from "../../shared/aeo-editor";

export function AeoEditorContext({
  document,
  onApply,
}: {
  document: Record<string, unknown>;
  onApply: (patch: Record<string, unknown>) => void;
}) {
  const [params] = useSearchParams();
  const runId = params.get("aeoRun");
  const findingId = params.get("aeoFinding");
  const [data, setData] = useState<AeoReviewWorkspace | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    let active = true;
    if (runId && findingId)
      void api
        .aeoReviews(runId)
        .then((value) => {
          if (active) setData(value);
        })
        .catch(() => {
          if (active)
            setError(
              "Не удалось загрузить бриф. Обновите страницу перед вставкой.",
            );
        });
    return () => {
      active = false;
    };
  }, [runId, findingId]);
  if (!runId || !findingId) return null;
  const review = data?.reviews.find((r) => r.findingId === findingId);
  const finding =
    review?.target || data?.analysis.findings.find((f) => f.id === findingId);
  const base = data?.editorBases[findingId];
  let proposal: Record<string, unknown> | null = null;
  let reason = "";
  if (
    finding &&
    base &&
    review?.status === "draft" &&
    data?.freshness[findingId] === "current" &&
    finding.status !== "frozen"
  ) {
    try {
      proposal = prepareAeoEditorPatch(
        document,
        base,
        finding.question,
        review.answerDraft,
      );
    } catch (e) {
      reason = e instanceof Error ? e.message : "Проверьте исходный текст.";
    }
  } else
    reason =
      data?.freshness[findingId] === "stale"
        ? "Источник изменился. Повторите анализ."
        : "Для вставки нужен сохранённый бриф с текстом ответа и актуальным источником.";
  return (
    <section
      className="rounded-xl border border-emerald-400/30 bg-emerald-950/30 p-5 space-y-3 text-sm text-white"
      aria-label="Контекст AEO"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong>AEO · Бриф и источники</strong>
        <Link
          className="text-emerald-200 min-h-11 inline-flex items-center"
          to="/admin-tools/aeo"
        >
          ← Вернуться к разбору
        </Link>
      </div>
      {error && <p role="alert">{error}</p>}
      {finding ? (
        <>
          <h2 className="text-lg font-semibold">{finding.question}</h2>
          <p>
            {review?.note ||
              "Проверьте, полностью ли страница отвечает на этот вопрос."}
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer py-3">
              Источники · {finding.evidence.length}
            </summary>
            {finding.evidence.map((e) => (
              <p className="my-3" key={e.path}>
                <code>{e.path}</code>
                <br />
                {e.text}
              </p>
            ))}
          </details>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/20 p-3">
              <strong>Сейчас</strong>
              <p className="mt-2">
                FAQ: {Array.isArray(document.faq) ? document.faq.length : 0}{" "}
                пунктов. Исходный текст остаётся до явной вставки.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-400/30 p-3">
              <strong>
                Предлагается добавить{" "}
                {proposal && "faq" in proposal ? "в FAQ" : "в отдельный раздел"}
              </strong>
              <p className="mt-2 whitespace-pre-wrap">
                {review?.answerDraft || "Текст ответа ещё не подготовлен."}
              </p>
            </div>
          </div>
          {!applied && (
            <button
              type="button"
              disabled={!proposal}
              className="min-h-11 px-4 py-2 rounded-lg bg-emerald-200 text-emerald-950 font-medium disabled:opacity-50"
              onClick={() => {
                if (!base || !review) return;
                try {
                  const patch = prepareAeoEditorPatch(
                    document,
                    base,
                    finding.question,
                    review.answerDraft,
                  );
                  onApply(patch);
                  setApplied(true);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Источник изменился.",
                  );
                }
              }}
            >
              Добавить в форму редактора
            </button>
          )}
          <p role="status">
            {applied
              ? "Добавлено только в форму. Проверьте изменения; сохранение редактора записывает их в репозиторий."
              : reason ||
                "Эта кнопка меняет только форму. Она не сохраняет и не публикует сайт."}
          </p>
        </>
      ) : (
        <p role="status">Загружаем контекст вопроса…</p>
      )}
    </section>
  );
}

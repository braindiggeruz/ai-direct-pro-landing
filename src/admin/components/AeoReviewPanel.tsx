import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Check,
  ExternalLink,
  FilePenLine,
  RotateCcw,
} from "lucide-react";
import { findingClass, findingLabels, reviewLabels } from "../../shared/aeo";
import type {
  AeoAnalysis,
  AeoFinding,
  AeoReview,
  AeoReviewInput,
  AeoReviewWorkspace,
} from "../../shared/aeo";
import { readAeoSession, saveAeoSession } from "../lib/aeo-session";

export function AeoReviewPanel({
  finding,
  originalId,
  analysis,
  runId,
  review,
  data,
  busy,
  onSave,
  onNext,
  onAnswers,
  onBack,
}: {
  finding: AeoFinding;
  originalId: string;
  analysis: AeoAnalysis;
  runId: string;
  review?: AeoReview;
  data: AeoReviewWorkspace | null;
  busy: boolean;
  onSave: (input: AeoReviewInput) => Promise<void>;
  onNext: () => void;
  onAnswers: () => void;
  onBack: () => void;
}) {
  const sessionKey = `brief:${runId}:${originalId}`;
  const [local] = useState(() =>
    readAeoSession<{
      revision: number;
      note: string;
      answer: string;
      editing: boolean;
    } | null>(sessionKey, null),
  );
  const restore = local?.revision === (review?.revision || 0) ? local : null;
  const [note, setNote] = useState(restore?.note ?? review?.note ?? "");
  const [answer, setAnswer] = useState(
    restore?.answer ?? review?.answerDraft ?? finding.answer ?? "",
  );
  const [editing, setEditing] = useState(restore?.editing || false);
  const [choosing, setChoosing] = useState(false);
  const [target, setTarget] = useState(finding.file || "");
  useEffect(() => {
    saveAeoSession(sessionKey, {
      revision: review?.revision || 0,
      note,
      answer,
      editing,
    });
  }, [sessionKey, review?.revision, note, answer, editing]);
  const freshness = data?.freshness[originalId];
  const frozen = finding.status === "frozen";
  const stale = freshness === "stale";
  const dirty =
    note !== (review?.note || "") ||
    answer !== (review?.answerDraft || finding.answer || "");
  const input = (status: AeoReviewInput["status"]): AeoReviewInput => ({
    runId,
    findingId: originalId,
    status,
    note,
    answerDraft: answer,
    priority: review?.priority || 2,
    revision: review?.revision || 0,
  });
  const editor =
    finding.file && finding.slug
      ? `/admin-tools/${finding.file.includes("/blog/") ? "blog" : "pages"}/${analysis.locale}/${encodeURIComponent(finding.slug)}?aeoRun=${encodeURIComponent(runId)}&aeoFinding=${encodeURIComponent(originalId)}`
      : null;
  const base = data?.editorBases[originalId];
  const faq = Array.isArray(base?.faq) ? base.faq : [];
  return (
    <article
      className="aeo-panel aeo-detail"
      aria-labelledby="aeo-detail-title"
    >
      <button className="aeo-mobile-back aeo-link-button" onClick={onBack}>
        ← К вопросам
      </button>
      <div className="aeo-detail-top">
        <span className={`aeo-status aeo-status-${findingClass(finding)}`}>
          {findingLabels[findingClass(finding)]}
        </span>
        <span className="aeo-caption">
          {reviewLabels[review?.status || "unreviewed"]}
        </span>
      </div>
      <h2 id="aeo-detail-title" tabIndex={-1}>
        {finding.question}
      </h2>
      <p className="aeo-muted">{finding.reason}</p>
      {stale && (
        <p className="aeo-callout" role="status">
          Источник изменился. Повторите анализ перед сохранением решения.
        </p>
      )}
      {!data && (
        <p className="aeo-muted" role="status">
          Проверяем источник и сохранённые решения…
        </p>
      )}
      <div className="aeo-decision-actions">
        {review && review.status !== "unreviewed" ? (
          <>
            {review.status === "draft" && editor && !dirty && (
              <Link className="aeo-primary" to={editor}>
                Продолжить в редакторе <ArrowRight size={16} />
              </Link>
            )}
            <button
              className={
                review.status === "draft" && editor
                  ? "aeo-secondary"
                  : "aeo-primary"
              }
              disabled={busy}
              onClick={onNext}
            >
              Следующий вопрос <ArrowRight size={16} />
            </button>
            <button
              className="aeo-link-button"
              disabled={busy}
              onClick={() => void onSave(input("unreviewed"))}
            >
              <RotateCcw size={16} />
              Отменить решение
            </button>
          </>
        ) : (
          <>
            {finding.answer && !frozen && (
              <button
                className="aeo-primary"
                disabled={busy || !data || stale}
                onClick={() => void onSave(input("accepted"))}
              >
                <Check size={16} />
                Ответ подходит
              </button>
            )}
            {!frozen && (
              <button
                className={finding.answer ? "aeo-secondary" : "aeo-primary"}
                disabled={busy || !data || stale}
                onClick={() => setEditing(true)}
              >
                <FilePenLine size={16} />
                {finding.answer ? "Подготовить правку" : "Создать бриф"}
              </button>
            )}
            <button
              className="aeo-link-button"
              disabled={busy || !data}
              onClick={() => void onSave(input("skipped"))}
            >
              Пропустить
            </button>
          </>
        )}
      </div>
      {finding.url && (
        <div className="aeo-source">
          <span className="aeo-caption">
            Подобранная страница · {analysis.locale.toUpperCase()}
          </span>
          <a
            href={`https://gptbot.uz${finding.url}`}
            target="_blank"
            rel="noreferrer"
          >
            {finding.title}
            <ExternalLink size={16} />
          </a>
          <span className="aeo-caption">
            {freshness === "current"
              ? "Источник актуален на момент проверки"
              : stale
                ? "Источник изменился"
                : "Актуальность не проверена"}
          </span>
        </div>
      )}
      <button
        className="aeo-link-button"
        disabled={busy || !data}
        onClick={() => setChoosing(!choosing)}
      >
        {finding.file ? "Выбрать другую страницу" : "Выбрать страницу вручную"}
      </button>
      {choosing && (
        <div className="aeo-target-picker">
          <label htmlFor="aeo-target-page">Опубликованная страница</label>
          <select
            id="aeo-target-page"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Выберите страницу</option>
            {data?.pages.map((page) => (
              <option key={page.file} value={page.file}>
                {page.title} · {page.url}
              </option>
            ))}
          </select>
          <button
            className="aeo-secondary"
            disabled={!target || busy}
            onClick={() =>
              void onSave({
                ...input("unreviewed"),
                note: "",
                answerDraft: "",
                targetFile: target,
              })
            }
          >
            Сопоставить с этой страницей
          </button>
        </div>
      )}
      {editing && dirty && (
        <p className="aeo-caption">
          Сохраните бриф, чтобы передать изменения в редактор.
        </p>
      )}
      <h3>Фрагмент с сайта</h3>
      {finding.answer ? (
        <blockquote>{finding.answer}</blockquote>
      ) : (
        <div className="aeo-missing">
          Подходящего ответа не найдено. Уточните факты у владельца услуги и
          сохраните бриф.
        </div>
      )}
      <p className="aeo-caption">
        Совпадение с источником не подтверждает полноту и актуальность ответа.
      </p>
      {review?.status === "draft" && !editing && (
        <div className="aeo-callout">
          <strong>Бриф сохранён</strong>
          <p>{review.note || "Предлагаемый текст доступен в редакторе."}</p>
          <button className="aeo-link-button" onClick={() => setEditing(true)}>
            Изменить бриф
          </button>
        </div>
      )}
      {editing && !frozen && (
        <section className="aeo-draft" aria-label="Бриф для редактора">
          <h3>Бриф для редактора</h3>
          <label htmlFor="aeo-draft-note">
            Что нужно уточнить или улучшить
          </label>
          <textarea
            id="aeo-draft-note"
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Уточнить актуальные сроки и объяснить, от чего они зависят."
          />
          <label htmlFor="aeo-draft-answer">
            Предлагаемый текст — можно заполнить позже
          </label>
          <textarea
            id="aeo-draft-answer"
            rows={5}
            maxLength={10000}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="aeo-diff">
            <div>
              <h4>Сейчас</h4>
              <p>
                {finding.status === "covered"
                  ? "Вопрос уже есть в FAQ. Дубль добавлять нельзя."
                  : `На странице ${faq.length} пунктов FAQ. Изменений нет.`}
              </p>
            </div>
            <div>
              <h4>Предлагается</h4>
              <p>
                {finding.status === "covered"
                  ? "Проверить существующий ответ вручную."
                  : faq.length >= 8
                    ? "Отдельный раздел с вопросом и ответом после основного текста."
                    : "Новый пункт FAQ — только если он улучшит ответ пользователю."}
              </p>
            </div>
          </div>
          <div className="aeo-decision-actions">
            <button
              className="aeo-primary"
              disabled={
                busy || stale || !data || (review?.status === "draft" && !dirty)
              }
              onClick={() => void onSave(input("draft"))}
            >
              Сохранить бриф
            </button>
            <button
              className="aeo-link-button"
              onClick={() => setEditing(false)}
            >
              Свернуть
            </button>
          </div>
          <p className="aeo-caption">
            Бриф сохраняется в кабинете. Публикация сайта — отдельное действие в
            редакторе.
          </p>
        </section>
      )}
      <label className="aeo-filter-label">
        Приоритет
        <select
          aria-label="Приоритет вопроса"
          disabled={busy || !data}
          value={review?.priority || 2}
          onChange={(e) =>
            void onSave({
              ...input(review?.status || "unreviewed"),
              priority: Number(e.target.value) as 1 | 2 | 3,
            })
          }
        >
          <option value={1}>Сначала</option>
          <option value={2}>Обычный</option>
          <option value={3}>Позже</option>
        </select>
      </label>
      <details>
        <summary>Источники · {finding.evidence.length}</summary>
        {finding.evidence.map((e) => (
          <div className="aeo-evidence" key={e.path}>
            <code>{e.path}</code>
            <p>{e.text}</p>
          </div>
        ))}
      </details>
      <div className="aeo-detail-footer">
        <button className="aeo-secondary" onClick={onAnswers}>
          Посмотреть ответы нейросетей <ArrowRight size={16} />
        </button>
        {editor && !dirty && (
          <Link className="aeo-link-button" to={editor}>
            Открыть страницу в редакторе
          </Link>
        )}
      </div>
    </article>
  );
}

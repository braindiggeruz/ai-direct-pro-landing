import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import type { AeoObservation, AeoRun, AeoWorkspace } from "../../shared/aeo";
import { api } from "../lib/api";
import { modelName } from "../lib/aeo-models";
import { resolveAeoRun } from "../../shared/aeo-history";
import {
  downloadAeo,
  readAeoSession,
  saveAeoSession,
} from "../lib/aeo-session";

export function observationLinks(observation: AeoObservation) {
  const links = [
    ...observation.citations.map((c) => ({
      ...c,
      origin: "Цитата провайдера",
    })),
  ];
  for (const raw of observation.text.match(/https?:\/\/[^\s<>"\]]+/g) || []) {
    try {
      const url = new URL(raw.replace(/[).,;!?]+$/, ""));
      if (
        !url.username &&
        !url.password &&
        !links.some((l) => l.url === url.href)
      )
        links.push({
          url: url.href,
          title: url.hostname,
          origin: "Ссылка в тексте ответа",
        });
    } catch {
      /* Untrusted text is never fetched. */
    }
  }
  return links.slice(0, 30);
}
type Card = {
  model: string;
  run: AeoRun | null;
  error: string;
  pending: boolean;
  key: string;
};
function AnswerText({ text }: { text: string }) {
  const [raw, setRaw] = useState(false);
  const inline = (line: string) =>
    line
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
      .map((part, i) =>
        part.startsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") ? (
          <code key={i}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      );
  return (
    <>
      <div className="aeo-answer-text">
        {raw ? (
          <pre>{text}</pre>
        ) : (
          text
            .split("\n")
            .map((line, i) =>
              !line.trim() ? null : /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line) ? (
                <hr key={i} />
              ) : /^#{1,6}\s/.test(line) ? (
                <h4 key={i}>{inline(line.replace(/^#{1,6}\s/, ""))}</h4>
              ) : /^>\s/.test(line) ? (
                <blockquote key={i}>{inline(line.slice(2))}</blockquote>
              ) : (
                <p key={i}>{inline(line) || "\u00a0"}</p>
              ),
            )
        )}
      </div>
      <button className="aeo-link-button" onClick={() => setRaw(!raw)}>
        {raw ? "Форматированный ответ" : "Исходный текст"}
      </button>
    </>
  );
}
export function AeoAnswers({
  workspace,
  initialQuestion = "",
  initialRun,
  locale,
  onLocaleChange,
  onRefresh,
  onBack,
}: {
  workspace: AeoWorkspace | null;
  initialQuestion?: string;
  initialRun?: AeoRun;
  locale: "ru" | "uz";
  onLocaleChange?: (locale: "ru" | "uz") => void;
  onRefresh: () => Promise<void>;
  onBack?: () => void;
}) {
  const [question, setQuestion] = useState(
    initialQuestion || readAeoSession("ai-question", ""),
  );
  const models =
    workspace?.measurement.models ||
    (workspace?.measurement.model ? [workspace.measurement.model] : []);
  const [choices, setChoices] = useState<string[] | null>(null);
  const selected = (choices || models).filter((m) => models.includes(m));
  const [cards, setCards] = useState<Card[]>([]);
  const [submitted, setSubmitted] = useState(
    initialQuestion || readAeoSession("ai-question", ""),
  );
  const [composing, setComposing] = useState(!initialRun);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [layout, setLayout] = useState<"read" | "compare">("read");
  const [readingModel, setReadingModel] = useState<string | null>(null);
  const gate = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Requests are bounded; no automatic provider calls are made on opening this panel.
  const remaining = Math.max(
    0,
    (workspace?.measurement.dailyLimit || 0) -
      (workspace?.measurement.used || 0),
  );
  async function ask(retry?: Card) {
    if (gate.current) return;
    const q = (retry ? submitted : question).trim();
    const names = retry ? [retry.model] : selected;
    if (q.length < 3 || q.length > 300) {
      setError("Введите запрос длиной от 3 до 300 символов.");
      return;
    }
    if (!names.length || (!retry && names.length > remaining)) {
      setError("Выберите модели в пределах оставшейся квоты.");
      return;
    }
    const keys = readAeoSession<Record<string, string>>("ai-keys", {});
    const pending = names.map((model) => {
      const scope = JSON.stringify([q, model, locale]);
      const key =
        retry?.run?.status === "failed"
          ? crypto.randomUUID()
          : retry?.key || keys[scope] || crypto.randomUUID();
      keys[scope] = key;
      return { model, run: null, error: "", pending: true, key };
    });
    saveAeoSession("ai-keys", keys);
    saveAeoSession("ai-question", q);
    gate.current = true;
    setBusy(true);
    setError("");
    setSubmitted(q);
    setComposing(false);
    setCards((old) =>
      retry
        ? (old.length ? old : visible).map((c) =>
            c.model === retry.model ? pending[0] : c,
          )
        : pending,
    );
    await Promise.all(
      pending.map(async (card) => {
        let next: Card;
        try {
          const run = await api.aeoRun(
            { kind: "measurement", questions: [q], locale, model: card.model },
            card.key,
          );
          next = { ...card, run, pending: false };
          if (run.status !== "running") {
            delete keys[JSON.stringify([q, card.model, locale])];
            saveAeoSession("ai-keys", keys);
          }
        } catch (e) {
          next = {
            ...card,
            pending: false,
            error: e instanceof Error ? e.message : "Ответ не получен.",
          };
        }
        if (mounted.current)
          setCards((old) =>
            old.map((c) => (c.model === card.model ? next : c)),
          );
      }),
    );
    await onRefresh();
    gate.current = false;
    if (mounted.current) setBusy(false);
  }
  const allHistory = initialRun
    ? [initialRun]
    : workspace?.runs.filter(
        (r) =>
          r.kind === "measurement" &&
          r.result &&
          "question" in r.result &&
          r.result.question === submitted,
      ) || [];
  const seenModels = new Set<string>();
  const history = allHistory.filter((run) => {
    const observation = run.result as AeoObservation | null;
    const model = observation?.requestedModel || observation?.model || run.id;
    if (seenModels.has(model)) return false;
    seenModels.add(model);
    return true;
  });
  const savedCards = cards.length
    ? cards
    : history.map((run) => ({
        model:
          (run.result as AeoObservation | null)?.requestedModel ||
          (run.result as AeoObservation | null)?.model ||
          "Неизвестная модель",
        run,
        error: "",
        pending: false,
        key: run.id,
      }));
  const visible = savedCards.map((card) => ({ ...card, run: resolveAeoRun(card.run, workspace?.runs || []) }));
  const firstReady = visible.find((c) => (c.run?.result as AeoObservation | null)?.ok)?.model || visible[0]?.model;
  const selectedModel = visible.some((c) => c.model === readingModel) ? readingModel : firstReady;
  return (
    <section className="aeo-answers" aria-labelledby="aeo-answers-title">
      {onBack && (
        <button className="aeo-link-button" onClick={onBack}>
          ← Вернуться к разбору
        </button>
      )}
      <div className="aeo-section-heading">
        <div>
          <h2 id="aeo-answers-title">Что отвечают нейросети?</h2>
          <p className="aeo-muted">
            Задайте один вопрос и посмотрите ответы выбранных моделей рядом.
          </p>
        </div>
        <MessageSquare size={26} />
      </div>
      {composing ? (
        <div className="aeo-panel aeo-ai-compose">
          <label htmlFor="aeo-ai-locale">Язык запроса</label>
          <select id="aeo-ai-locale" value={locale} disabled={busy || !onLocaleChange} onChange={(event) => onLocaleChange?.(event.target.value as "ru" | "uz")}>
            <option value="ru">Русский</option>
            <option value="uz">O‘zbekcha</option>
          </select>
          <label htmlFor="aeo-ai-query">Ваш запрос</label>
          <textarea
            id="aeo-ai-query"
            rows={3}
            maxLength={300}
            value={question}
            disabled={busy}
            onChange={(e) => {
              setQuestion(e.target.value);
              saveAeoSession("ai-question", e.target.value);
            }}
            placeholder="Например: какую компанию выбрать для разработки сайта в Ташкенте?"
          />
          <fieldset disabled={busy}>
            <legend>Модели для сравнения</legend>
            <div className="aeo-model-options">
              {models.map((model) => (
                <label key={model}>
                  <input
                    type="checkbox"
                    checked={selected.includes(model)}
                    onChange={(e) =>
                      setChoices(
                        e.target.checked
                          ? [...selected, model]
                          : selected.filter((m) => m !== model),
                      )
                    }
                  />
                  <span title={model}>{modelName(model)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {workspace && !workspace.measurement.available && (
            <div className="aeo-callout">
              <strong>Подключение моделей ещё не настроено</strong>
              <p>
                Администратору нужно выбрать серверные модели и подключить ключ.
                Здесь появятся их реальные ответы после явного запуска.
              </p>
            </div>
          )}
          <div className="aeo-form-footer">
            <span className="aeo-muted">
              {!workspace ? "Загружаем модели и лимиты…" : <>Без веб-поиска · {selected.length}{" "}
              {selected.length === 1 ? "запрос" : "запроса"} к API · осталось{" "}
              {remaining} сегодня</>}
            </span>
            <button
              className="aeo-primary"
              disabled={
                busy ||
                !workspace?.measurement.available ||
                !selected.length ||
                selected.length > remaining ||
                question.trim().length < 3
              }
              onClick={() => void ask()}
            >
              {busy ? (
                <LoaderCircle className="aeo-spin" size={18} />
              ) : (
                <ArrowRight size={18} />
              )}{" "}
              {busy ? "Ждём ответы…" : "Получить ответы"}
            </button>
          </div>
        </div>
      ) : (
        <div className="aeo-run-bar">
          <span>Без веб-поиска · осталось {remaining} запросов сегодня</span>
          <button
            className="aeo-secondary"
            disabled={busy}
            onClick={() => setComposing(true)}
          >
            Изменить запрос и модели
          </button>
        </div>
      )}
      {error && (
        <p className="aeo-error" role="alert">
          {error}
        </p>
      )}
      {visible.length > 0 ? (
        <>
          <div className="aeo-section-heading">
            <div>
              <h3>{submitted}</h3>
              <p className="aeo-muted">
                Точные тексты ответов. Упоминание компании может быть
                рекомендацией, сравнением или критикой.
              </p>
            </div>
            <button
              className="aeo-secondary"
              onClick={() =>
                downloadAeo(
                  {
                    question: submitted,
                    runs: visible.map((c) => c.run).filter(Boolean),
                  },
                  "aeo-model-answers.json",
                )
              }
            >
              Экспорт ответов
            </button>
          </div>
          <div className="aeo-answer-toolbar">
            <div className="aeo-model-tabs" aria-label="Ответы моделей">
              {visible.map((card) => {
                const current = card.run;
                const observation = current?.result as AeoObservation | null;
                const pending = card.pending || current?.status === "running";
                const status = pending ? "Отвечает…" : observation?.ok ? "Ответ получен" : observation?.partial ? "Частичный ответ" : "Ответ не получен";
                return <button key={card.model} className="aeo-secondary"
                  aria-pressed={layout === "read" && card.model === selectedModel}
                  onClick={() => { setReadingModel(card.model); setLayout("read"); }}>
                  <strong>{modelName(card.model)}</strong>
                  <span className={observation?.ok ? "aeo-answer-ready" : "aeo-muted"}>{status}</span>
                </button>;
              })}
            </div>
            <button className="aeo-link-button" aria-pressed={layout === "compare"} onClick={() => setLayout(layout === "compare" ? "read" : "compare")}>
              {layout === "compare" ? "Читать по одному" : "Сравнить рядом"}
            </button>
          </div>
          <div className="aeo-answer-grid" data-layout={layout}>
            {visible.map((card, i) => {
              if (layout === "read" && card.model !== selectedModel) return null;
              const run = card.run;
              const observation = run?.result as AeoObservation | null;
              const links = observation?.ok
                ? observationLinks(observation)
                : [];
              const mentioned =
                observation?.ok &&
                /(?:^|[^\p{L}\p{N}])gptbot(?:\.uz)?(?=$|[^\p{L}\p{N}])/iu.test(
                  observation.text,
                );
              return (
                <article
                  className="aeo-panel aeo-answer-card"
                  key={`${card.model}-${i}`}
                >
                  <div className="aeo-answer-heading">
                    <span className="aeo-model-icon">
                      <MessageSquare size={20} />
                    </span>
                    <div>
                      <h3>{modelName(observation?.model || card.model)}</h3>
                      <p className="aeo-muted">API модели · без веб-поиска</p>
                      <details className="aeo-caption"><summary>Точная модель</summary>{observation?.model || card.model}</details>
                      {observation?.model &&
                        observation.model !== card.model && (
                          <p className="aeo-caption">Запрошено: {card.model}</p>
                        )}
                    </div>
                  </div>
                  {card.pending || run?.status === "running" ? (
                    <div className="aeo-wait" role="status">
                      <LoaderCircle size={20} className="aeo-spin" />
                      Модель готовит ответ…
                    </div>
                  ) : card.error ? (
                    <div role="alert">
                      <p>{card.error}</p>
                      <button
                        className="aeo-secondary"
                        disabled={busy}
                        onClick={() => void ask(card)}
                      >
                        <RotateCcw size={16} />
                        Проверить результат повторно
                      </button>
                    </div>
                  ) : observation?.ok ? (
                    <>
                      <div
                        className={`aeo-mention ${mentioned ? "aeo-mention-yes" : ""}`}
                      >
                        {mentioned ? (
                          <Check size={16} />
                        ) : (
                          <MessageSquare size={16} />
                        )}{" "}
                        {mentioned
                          ? "GPTBot упомянут в тексте"
                          : "GPTBot не найден в тексте этого ответа"}
                      </div>
                      <AnswerText text={observation.text} />
                      <div className="aeo-answer-sources">
                        <h4>Сайты, названные в ответе</h4>
                        {links.length ? (
                          links.map((link) => (
                            <a
                              key={link.url}
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span>
                                <strong>{link.title}</strong>
                                <small>{link.origin}</small>
                              </span>
                              <ExternalLink size={15} />
                            </a>
                          ))
                        ) : (
                          <p className="aeo-muted">
                            Модель не вернула ссылок. Названия компаний могут
                            быть указаны в самом тексте.
                          </p>
                        )}
                      </div>
                      <p className="aeo-caption">
                        {new Date(observation.observedAt).toLocaleString(
                          "ru-RU",
                        )}{" "}
                        · Ответ не проверен на фактическую точность.
                      </p>
                    </>
                  ) : (
                    <div>
                      <p role="alert">
                        {observation?.error ||
                          "Ответ не получен. Посмотрите историю или выполните новый запуск."}
                      </p>
                      {observation?.partial && observation.text && (
                        <>
                          <p className="aeo-callout">Это только часть ответа. Модель не завершила его; выводы и упоминания по нему не подсчитываются.</p>
                          <AnswerText text={observation.text} />
                        </>
                      )}
                      <button
                        className="aeo-secondary"
                        disabled={busy || remaining < 1}
                        onClick={() => void ask({ ...card, run: run || null })}
                      >
                        Повторить запрос
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="aeo-empty">
          <MessageSquare size={32} />
          <h3>Один запрос — несколько точек зрения</h3>
          <p>
            Каждая модель получит ваш запрос отдельно. Здесь будут видны её
            ответ, упомянутые сайты и время получения.
          </p>
        </div>
      )}
      <p className="aeo-caption">
        Ответы API могут отличаться от приложений ChatGPT, Gemini и других
        сервисов. Один запуск не измеряет позиции или эффект изменений на сайте.
        Ссылки отображаются как данные ответа, их содержимое не проверялось.
      </p>
    </section>
  );
}

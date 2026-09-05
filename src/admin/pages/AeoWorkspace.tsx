import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Check,
  ChevronRight,
  FileSearch,
  LoaderCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { findingClass, findingLabels, reviewLabels } from "../../shared/aeo";
import type {
  AeoAnalysis,
  AeoRun,
  AeoWorkspace as Workspace,
  AeoReviewInput,
  AeoReviewWorkspace,
} from "../../shared/aeo";
import { api } from "../lib/api";
import { modelName } from "../lib/aeo-models";
import { aeoRunLocale, filterAeoHistory } from "../../shared/aeo-history";
import {
  downloadAeo,
  questionLines,
  readAeoSession,
  saveAeoSession,
} from "../lib/aeo-session";
import { AeoReviewPanel } from "../components/AeoReviewPanel";
import { AeoAnswers } from "../components/AeoAnswers";
import "./aeo.css";

const isAnalysis = (
  run: AeoRun | null,
): run is AeoRun & { result: AeoAnalysis } =>
  !!run?.result && "findings" in run.result;
type Session = {
  questions: string;
  locale: "ru" | "uz";
  runId: string;
  findingId: string;
  filter: string;
  search: string;
  tab: "review" | "answers" | "history";
};
export default function AeoWorkspace() {
  const [initial] = useState(() =>
    readAeoSession<Session>("workspace", {
      questions: "",
      locale: "ru",
      runId: "",
      findingId: "",
      filter: "all",
      search: "",
      tab: "review",
    }),
  );
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState(initial.questions);
  const [locale, setLocale] = useState(initial.locale);
  const [tab, setTab] = useState(initial.tab);
  const [active, setActive] = useState<AeoRun | null>(null);
  const [activeId, setActiveId] = useState(initial.findingId);
  const [filter, setFilter] = useState(initial.filter);
  const [search, setSearch] = useState(initial.search);
  const [compose, setCompose] = useState(!initial.runId);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewData, setReviewData] = useState<AeoReviewWorkspace | null>(null);
  const [detail, setDetail] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [order, setOrder] = useState("questions");
  const [historySearch, setHistorySearch] = useState("");
  const [historyLocale, setHistoryLocale] = useState("all");
  const historyRuns = filterAeoHistory(workspace?.runs || [], historySearch, historyLocale);
  const mounted = useRef(true);
  const booted = useRef(false);
  const requestKey = useRef<{ body: string; key: string } | null>(null);
  const pending = useRef(false);
  const reviewKey = useRef<{ body: string; key: string } | null>(null);
  const reviewGate = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const activeRunRef = useRef<string | undefined>(undefined);
  const refresh = useCallback(async () => {
    try {
      const data = await api.aeoWorkspace();
      if (!mounted.current) return;
      setWorkspace(data);
      if (!booted.current) {
        booted.current = true;
        const run = data.runs.find((r) => r.id === initial.runId);
        if (run) setActive(run);
        else setCompose(true);
      }
      setActive((old) =>
        old?.status === "running"
          ? data.runs.find((r) => r.id === old.id) || old
          : old,
      );
    } catch {
      if (mounted.current)
        setError(
          "Не удалось обновить кабинет. Введённые вопросы сохранены в этой сессии.",
        );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [initial.runId]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  const hasRunning = workspace?.runs.some((r) => r.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    let attempts = 0;
    const timer = setInterval(() => {
      if (++attempts > 60) {
        clearInterval(timer);
        return;
      }
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [hasRunning, refresh]);
  const analysis = isAnalysis(active) ? active.result : null;
  useEffect(() => {
    activeRunRef.current = active?.id;
    if (booted.current)
      saveAeoSession("workspace", {
        questions,
        locale,
        runId: active?.id || "",
        findingId: activeId,
        filter,
        search,
        tab,
      });
  }, [questions, locale, active?.id, activeId, filter, search, tab]);
  const runId = active?.id;
  useEffect(() => {
    let current = true;
    setReviewData(null);
    if (analysis && runId)
      void api
        .aeoReviews(runId)
        .then((data) => {
          if (current) setReviewData(data);
        })
        .catch(() => {
          if (current)
            setError(
              "Не удалось проверить источники и загрузить решения. Обновите разбор.",
            );
        });
    return () => {
      current = false;
    };
  }, [runId, analysis]);
  useEffect(() => {
    if (!detail && listRef.current)
      listRef.current.scrollTop = listScroll.current;
  }, [detail]);
  function openRun(run: AeoRun) {
    setActive(run);
    setTab(run.kind === "analysis" ? "review" : "answers");
    if (run.kind === "analysis" && run.status === "failed") {
      setCompose(true);
      if (run.failure) {
        setQuestions(run.failure.questions.join("\n"));
        setLocale(run.failure.locale);
      }
    }
    if (isAnalysis(run)) {
      setLocale(run.result.locale);
      setQuestions(run.result.findings.map((f) => f.question).join("\n"));
      setActiveId(run.result.findings[0]?.id || "");
      setCompose(false);
      setDetail(false);
      setFilter("all");
      setSearch("");
    } else if (run.result && "question" in run.result) {
      setAiQuestion(run.result.question);
      if (run.result.locale) setLocale(run.result.locale);
    }
  }
  async function analyze(source?: AeoAnalysis) {
    const parsed = questionLines(source ? source.findings.map((f) => f.question).join("\n") : questions);
    if (pending.current || !parsed.questions.length || parsed.errors.length)
      return;
    const body = {
      kind: "analysis" as const,
      questions: parsed.questions,
      locale: source?.locale || locale,
    };
    const encoded = JSON.stringify(body);
    if (requestKey.current?.body !== encoded)
      requestKey.current = { body: encoded, key: crypto.randomUUID() };
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const run = await api.aeoRun(body, requestKey.current.key);
      if (!mounted.current) return;
      openRun(run);
      if (run.status !== "running") requestKey.current = null;
      await refresh();
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Анализ не завершён. Можно безопасно повторить запуск.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function saveReview(input: AeoReviewInput) {
    if (reviewGate.current) return;
    reviewGate.current = true;
    setSaving(true);
    setError("");
    const encoded = JSON.stringify(input);
    if (reviewKey.current?.body !== encoded)
      reviewKey.current = { body: encoded, key: crypto.randomUUID() };
    try {
      await api.aeoReview(input, reviewKey.current.key);
      reviewKey.current = null;
      const data = await api.aeoReviews(input.runId);
      if (mounted.current && activeRunRef.current === input.runId) {
        setReviewData(data);
        setNotice("Решение сохранено. Опубликованный контент не изменён.");
      }
      await refresh();
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Не удалось сохранить решение.",
        );
    } finally {
      reviewGate.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  const reviews = reviewData?.reviews || [];
  const enriched =
    analysis?.findings.map((original) => {
      const review = reviews.find((r) => r.findingId === original.id);
      return { original, review, finding: review?.target || original };
    }) || [];
  const selected =
    enriched.find((item) => item.original.id === activeId) || enriched[0];
  const countDone = reviews.filter((r) => r.status !== "unreviewed").length;
  const parsed = questionLines(questions);
  const items = enriched
    .filter(
      ({ finding, review }) =>
        (filter === "all" ||
          (filter === "unreviewed" &&
            (!review || review.status === "unreviewed")) ||
          filter === findingClass(finding)) &&
        `${finding.question} ${finding.title || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      order === "pages"
        ? (a.finding.title || "").localeCompare(b.finding.title || "")
        : order === "priority"
          ? (a.review?.priority || 2) - (b.review?.priority || 2)
          : 0,
    );
  const uniquePages = new Set(
    enriched.map((item) => item.finding.url).filter(Boolean),
  ).size;
  function next() {
    const ordered = [
      ...enriched.slice(
        enriched.findIndex((i) => i.original.id === activeId) + 1,
      ),
      ...enriched,
    ];
    const item = ordered.find(
      (i) =>
        i.original.id !== activeId &&
        (!i.review || i.review.status === "unreviewed"),
    );
    if (item) {
      setActiveId(item.original.id);
      setDetail(true);
    } else {
      setNotice("Все вопросы разобраны. Решения доступны в истории.");
      setDetail(false);
    }
  }
  return (
    <div className="aeo-workspace">
      <header className="aeo-header">
        <Link className="aeo-mobile-home" to="/admin-tools">
          ← Админка GPTBot
        </Link>
        <div className="aeo-title-row">
          <div>
            <span className="aeo-eyebrow">GPTBOT · AEO STUDIO</span>
            <h1>Вопросы и ответы</h1>
            <p>Проверьте контент сайта и посмотрите, что отвечают нейросети.</p>
          </div>
          <span className="aeo-site">gptbot.uz</span>
        </div>
      </header>
      <nav className="aeo-tabs" aria-label="Разделы AEO">
        <button
          aria-current={tab === "review" ? "page" : undefined}
          onClick={() => setTab("review")}
        >
          <FileSearch size={17} />
          Контент gptbot.uz
        </button>
        <button
          aria-current={tab === "answers" ? "page" : undefined}
          onClick={() => setTab("answers")}
        >
          <MessageSquare size={17} />
          Ответы нейросетей
        </button>
        <button
          aria-current={tab === "history" ? "page" : undefined}
          onClick={() => setTab("history")}
        >
          История
        </button>
        <button
          className="aeo-icon-button aeo-refresh"
          aria-label="Обновить кабинет"
          disabled={loading || busy || saving}
          onClick={() => {
            void refresh();
            if (active && analysis)
              void api
                .aeoReviews(active.id)
                .then(setReviewData)
                .catch(() => setError("Не удалось обновить источники."));
          }}
        >
          <RefreshCw size={17} />
        </button>
      </nav>
      {error && (
        <div className="aeo-error" role="alert">
          <span>{error}</span>
          <button className="aeo-link-button" onClick={() => setError("")}>
            Закрыть
          </button>
        </div>
      )}
      {notice && (
        <div className="aeo-notice" role="status">
          <Check size={17} />
          {notice}
          <button className="aeo-link-button" onClick={() => setNotice("")}>
            Скрыть
          </button>
        </div>
      )}
      {loading && !workspace && (
        <p role="status" className="aeo-loading">
          <LoaderCircle className="aeo-spin" />
          Загружаем кабинет…
        </p>
      )}
      {tab === "answers" && (
        <AeoAnswers
          onLocaleChange={setLocale}
          key={`${aiQuestion}-${active?.kind === "measurement" ? active.id : ""}`}
          workspace={workspace}
          initialQuestion={aiQuestion}
          initialRun={active?.kind === "measurement" ? active : undefined}
          locale={locale}
          onRefresh={refresh}
          onBack={analysis ? () => setTab("review") : undefined}
        />
      )}
      {tab === "review" && (
        <>
          {compose ? (
            <section
              className="aeo-panel aeo-compose"
              aria-labelledby="aeo-question-title"
            >
              <div className="aeo-section-heading">
                <div>
                  <h2 id="aeo-question-title">
                    Какие вопросы задают ваши клиенты?
                  </h2>
                  <p className="aeo-muted">
                    Проверяем только опубликованные страницы gptbot.uz. Чтобы
                    узнать, кого рекомендуют модели по любому запросу, откройте
                    «Ответы нейросетей».
                  </p>
                  <button className="aeo-link-button" onClick={() => {
                    setAiQuestion(parsed.questions[0] || "");
                    setTab("answers");
                  }}>
                    <MessageSquare size={17} /> Узнать, что отвечают нейросети
                  </button>
                </div>
                {analysis && (
                  <button
                    className="aeo-secondary"
                    onClick={() => setCompose(false)}
                  >
                    К результату
                  </button>
                )}
              </div>
              <div className="aeo-field-header">
                <label htmlFor="aeo-questions">
                  Вопросы, по одному на строку
                </label>
                <label>
                  Язык контента{" "}
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as "ru" | "uz")}
                    disabled={busy}
                  >
                    <option value="ru">Русский</option>
                    <option value="uz">O‘zbekcha</option>
                  </select>
                </label>
              </div>
              <textarea
                id="aeo-questions"
                rows={4}
                value={questions}
                maxLength={13000}
                onChange={(e) => setQuestions(e.target.value)}
                disabled={busy}
                placeholder={
                  "Сколько стоит разработка сайта?\nКакие сроки SEO-продвижения?"
                }
                aria-describedby="aeo-question-hint"
              />
              {parsed.errors.map((message) => (
                <p className="aeo-input-error" key={message}>
                  {message}
                </p>
              ))}
              <div className="aeo-form-footer">
                <span id="aeo-question-hint" className="aeo-muted">
                  {parsed.questions.length} / 40 уникальных вопросов
                  {parsed.duplicates
                    ? ` · повторов исключено: ${parsed.duplicates}`
                    : ""}
                </span>
                <button
                  className="aeo-primary"
                  disabled={
                    busy ||
                    !workspace ||
                    !parsed.questions.length ||
                    !!parsed.errors.length
                  }
                  onClick={() => void analyze()}
                >
                  {busy ? (
                    <LoaderCircle size={18} className="aeo-spin" />
                  ) : (
                    <FileSearch size={18} />
                  )}{" "}
                  {busy ? "Проверяем контент…" : "Проверить контент"}
                </button>
              </div>
            </section>
          ) : (
            <div className="aeo-run-bar">
              <span>
                <strong>{analysis?.findings.length || 0} вопросов</strong> ·{" "}
                {analysis?.locale === "uz" ? "O‘zbekcha" : "Русский"} ·{" "}
                {active
                  ? new Date(active.created_at).toLocaleString("ru-RU")
                  : ""}
              </span>
              <button
                className="aeo-secondary"
                onClick={() => setCompose(true)}
              >
                Изменить вопросы
              </button>
              <button
                className="aeo-link-button"
                onClick={() => {
                  setQuestions("");
                  setCompose(true);
                }}
              >
                <Plus size={16} />
                Новый разбор
              </button>
            </div>
          )}
          {!active && (
            <div className="aeo-empty">
              <FileSearch size={30} />
              <h2>От вопроса — к понятному решению</h2>
              <p>
                Увидите, что раскрыто на сайте, где не хватает ответа и для чего
                стоит подготовить бриф.
              </p>
            </div>
          )}
          {active?.status === "running" && (
            <p className="aeo-wait" role="status">
              Разбор выполняется. Результат обновится автоматически; повторный
              запуск не нужен.
            </p>
          )}
          {active?.status === "failed" && (
            <p className="aeo-error" role="alert">
              {active.failure?.message || "Разбор не завершён. Проверьте вопросы в форме и выполните новый запуск."}
            </p>
          )}
          {analysis && active && analysis.analyzerVersion !== 2 && (
            <section className="aeo-panel aeo-empty" role="status">
              <RefreshCw size={28} />
              <h2>Этот разбор нужно обновить</h2>
              <p>Прежняя версия могла ошибочно подбирать страницы по общим словам. Старые рекомендации скрыты, чтобы не вводить вас в заблуждение. Вопросы сохранены.</p>
              <button className="aeo-primary" disabled={busy} onClick={() => void analyze(analysis)}>
                {busy ? "Проверяем…" : "Проверить заново"}
              </button>
              <button className="aeo-secondary" onClick={() => {
                setAiQuestion(analysis.findings[0]?.question || "");
                setTab("answers");
              }}>Посмотреть ответы нейросетей</button>
            </section>
          )}
          {analysis && active && analysis.analyzerVersion === 2 && (
            <section
              className="aeo-results"
              aria-labelledby="aeo-results-title"
            >
              <div className="aeo-section-heading">
                <div>
                  <h2 ref={resultRef} tabIndex={-1} id="aeo-results-title">
                    Карта ответов
                  </h2>
                  <p className="aeo-muted">
                    Проверено страниц: {analysis.pages} · Подобрано:{" "}
                    {uniquePages} · Вопросов: {analysis.findings.length}
                  </p>
                </div>
                <button
                  className="aeo-secondary"
                  onClick={() =>
                    downloadAeo(
                      { ...analysis, findings: enriched.map((i) => i.finding) },
                      `aeo-${active.id}.json`,
                    )
                  }
                >
                  Экспорт анализа
                </button>
              </div>
              <div className="aeo-progress">
                <span>
                  {reviewData
                    ? `Разобрано ${countDone} из ${analysis.findings.length}`
                    : "Загружаем решения…"}
                </span>
                <progress
                  max={analysis.findings.length}
                  value={countDone}
                  aria-label="Прогресс разбора"
                />
                <button
                  className="aeo-link-button"
                  disabled={
                    !reviewData || countDone === analysis.findings.length
                  }
                  onClick={next}
                >
                  Следующий необработанный <ArrowRight size={15} />
                </button>
              </div>
              <div className="aeo-split" data-detail={detail}>
                <div className="aeo-panel aeo-finding-list">
                  <div className="aeo-list-tools">
                    <label className="aeo-search">
                      <Search size={17} />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Поиск по вопросам"
                        placeholder="Найти вопрос или страницу"
                      />
                    </label>
                    <label className="aeo-filter-label">
                      Показать
                      <select
                        aria-label="Фильтр вопросов"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="all">
                          Все вопросы ({enriched.length})
                        </option>
                        <option value="unreviewed">Не разобрано</option>
                        {Object.entries(findingLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label} (
                            {
                              enriched.filter(
                                (i) => findingClass(i.finding) === key,
                              ).length
                            }
                            )
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="aeo-filter-label">
                      Порядок
                      <select
                        aria-label="Порядок вопросов"
                        value={order}
                        onChange={(e) => setOrder(e.target.value)}
                      >
                        <option value="questions">Как введены</option>
                        <option value="pages">По страницам</option>
                        <option value="priority">По приоритету</option>
                      </select>
                    </label>
                  </div>
                  <div
                    ref={listRef}
                    className="aeo-list-scroll"
                    onScroll={(e) => {
                      listScroll.current = e.currentTarget.scrollTop;
                    }}
                  >
                    {items.map(({ finding, original, review }) => (
                      <button
                        key={original.id}
                        className={`aeo-finding ${selected?.original.id === original.id ? "aeo-selected" : ""}`}
                        aria-pressed={selected?.original.id === original.id}
                        onClick={() => {
                          setActiveId(original.id);
                          setDetail(true);
                          requestAnimationFrame(() =>
                            document
                              .getElementById("aeo-detail-title")
                              ?.focus(),
                          );
                        }}
                      >
                        <span
                          className={`aeo-status aeo-status-${findingClass(finding)}`}
                        >
                          {findingLabels[findingClass(finding)]}
                        </span>
                        <strong>{finding.question}</strong>
                        <span className="aeo-finding-title">
                          {finding.title ||
                            "Подберите страницу или создайте бриф"}
                        </span>
                        {review && review.status !== "unreviewed" && (
                          <span className="aeo-reviewed">
                            <Check size={14} />
                            {reviewLabels[review.status]}
                          </span>
                        )}
                        <ChevronRight size={17} />
                      </button>
                    ))}
                    {!items.length && (
                      <p className="aeo-padding">
                        По вашему запросу ничего не найдено.
                      </p>
                    )}
                  </div>
                </div>
                {selected && reviewData && (
                  <AeoReviewPanel
                    key={`${active.id}-${selected.original.id}-${selected.review?.revision || 0}`}
                    finding={selected.finding}
                    originalId={selected.original.id}
                    analysis={analysis}
                    runId={active.id}
                    review={selected.review}
                    data={reviewData}
                    busy={saving}
                    onSave={saveReview}
                    onNext={next}
                    onBack={() => setDetail(false)}
                    onAnswers={() => {
                      setAiQuestion(selected.finding.question);
                      setTab("answers");
                    }}
                  />
                )}
              </div>
            </section>
          )}
        </>
      )}
      {tab === "history" && (
        <section className="aeo-panel aeo-history">
          <div className="aeo-section-heading">
            <h2>Продолжить работу</h2>
            <span className="aeo-muted">Последние 50 запусков · 90 дней</span>
          </div>
          <div className="aeo-history-filters">
            <input
              aria-label="Поиск в истории"
              placeholder="Найти по вопросу"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            <select
              aria-label="Язык истории"
              value={historyLocale}
              onChange={(e) => setHistoryLocale(e.target.value)}
            >
              <option value="all">Все языки</option>
              <option value="ru">Русский</option>
              <option value="uz">O‘zbekcha</option>
              <option value="unknown">Язык не сохранён</option>
            </select>
          </div>
          {historyRuns.map((run) => (
              <div className="aeo-history-row" key={run.id}>
                <div>
                  <span className="aeo-caption">
                    {run.kind === "analysis"
                      ? "Разбор контента"
                      : run.result && "model" in run.result
                        ? modelName(run.result.requestedModel || run.result.model)
                        : "Ответ модели"}{" "}
                    · {new Date(run.created_at).toLocaleString("ru-RU")} ·{" "}
                    {run.status === "completed"
                      ? "Готово"
                      : run.status === "failed"
                        ? "Ошибка"
                        : "Выполняется"}
                  </span>
                  <h3>
                    {isAnalysis(run)
                      ? run.result.findings[0]?.question
                      : run.result && "question" in run.result
                        ? run.result.question
                        : run.failure?.questions[0] || "Запуск без результата"}
                  </h3>
                  {isAnalysis(run) && (
                    <p className="aeo-muted">
                      {run.result.locale.toUpperCase()} ·{" "}
                      {run.result.findings.length} вопросов · Разобрано{" "}
                      {workspace?.reviewCounts?.[run.id] || 0}
                    </p>
                  )}
                  {run.kind === "measurement" && <p className="aeo-muted">
                    {aeoRunLocale(run) === "unknown" ? "Язык не сохранён в старом запуске" : aeoRunLocale(run) === "ru" ? "Русский" : "O‘zbekcha"}
                  </p>}
                </div>
                <div className="aeo-history-actions">
                  <button
                    className="aeo-secondary"
                    onClick={() => openRun(run)}
                  >
                    {run.kind === "analysis"
                      ? "Продолжить разбор"
                      : "Посмотреть ответ"}
                  </button>
                  {isAnalysis(run) && (
                    <button
                      className="aeo-link-button"
                      onClick={() => {
                        openRun(run);
                        setCompose(true);
                      }}
                    >
                      Проверить заново
                    </button>
                  )}
                </div>
              </div>
            ))}
          {!workspace?.runs.length && (
            <p className="aeo-padding">
              Начните с вопросов или получите первый ответ модели.
            </p>
          )}
          {!!workspace?.runs.length && !historyRuns.length && (
            <div className="aeo-padding" role="status">
              <p>По этим условиям ничего не найдено. Измените запрос или язык.</p>
              <button className="aeo-secondary" onClick={() => { setHistorySearch(""); setHistoryLocale("all"); }}>Сбросить фильтры</button>
            </div>
          )}
        </section>
      )}
      <footer className="aeo-footer">
        Внутренний кабинет GPTBot · Решения и брифы сохраняются отдельно от
        опубликованного сайта.
      </footer>
    </div>
  );
}

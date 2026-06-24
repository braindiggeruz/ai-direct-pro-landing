// Topic Plan UI block: lets the operator
//   * gather 10 (configurable) unique topics
//   * review them with risk badges
//   * replace / delete proposed topics
//   * launch one item or the full plan (sequential, concurrency 1)
//
// Embedded inside the SEO Autopilot Control Center page. Polls
// /api/admin/seo/topic-plans every 6s while at least one item is in
// flight.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Input, Select } from './ui';
import { IntentGuardBadge } from './IntentGuardBadge';
import { api } from '../lib/api';
import { useT } from '../i18n';
import {
  RefreshCw, Sparkles, Trash2, PlayCircle, ChevronRight, ListFilter, Loader2,
  Globe, AlertTriangle, CheckCircle2, X,
} from 'lucide-react';
import type {
  TopicPlan, TopicPlanItem, TopicPlanItemStatus,
} from '../../shared/intent-guard';

interface Props {
  testIdPrefix?: string;
}

function statusTone(s: TopicPlanItemStatus): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (s) {
    case 'proposed':         return 'neutral';
    case 'reserved':         return 'info';
    case 'generating':       return 'info';
    case 'generated':        return 'info';
    case 'analyzed':         return 'success';
    case 'needs_retarget':   return 'warning';
    case 'ready_for_review': return 'success';
    case 'failed':           return 'danger';
    default:                 return 'neutral';
  }
}

export function TopicPlanPanel({ testIdPrefix = 'topic-plan' }: Props) {
  const { t } = useT();
  const [plan, setPlan] = useState<TopicPlan | null>(null);
  const [plans, setPlans] = useState<TopicPlan[]>([]);
  const [busy, setBusy] = useState(false);
  const [launchingItemId, setLaunchingItemId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // params
  const [count, setCount] = useState(10);
  const [localeMode, setLocaleMode] = useState<'ru' | 'uz' | 'ru+uz'>('ru');
  const [industry, setIndustry] = useState('');
  const [channel, setChannel] = useState('');
  const [funnel, setFunnel] = useState('');
  const [moneyPage, setMoneyPage] = useState('');

  // Yandex demand intelligence (yandex.uz SERP analysis)
  const [yxOpen, setYxOpen] = useState(false);
  const [yxBusy, setYxBusy] = useState(false);
  const [yxSeedsText, setYxSeedsText] = useState('');
  const [yxResults, setYxResults] = useState<Array<{
    query: string;
    yandex_found_total: number;
    difficulty_score: number;
    top_domains: string[];
    weak_competition: boolean;
    already_ranking: boolean;
    reasons: string[];
    warnings: string[];
  }>>([]);
  const [yxStats, setYxStats] = useState<{ api_calls: number; cache_hits: number } | null>(null);
  const [yxErr, setYxErr] = useState<string | null>(null);
  // Per-seed failures returned by the endpoint envelope. Lets the
  // operator click "Повторить только неуспешные" instead of re-running
  // the whole batch.
  const [yxFailedSeeds, setYxFailedSeeds] = useState<Array<{
    seed: string; error_code: string; error: string; retryable: boolean;
    http_status?: number; retry_after_seconds?: number;
  }>>([]);
  const [yxWarnings, setYxWarnings] = useState<string[]>([]);
  const [yxPartial, setYxPartial] = useState(false);
  const [yxRequestId, setYxRequestId] = useState<string | null>(null);

  // Per-Yandex-row "Сгенерировать статью" state. Keyed by row index so
  // multiple operators / multiple rows don't trample each other.
  const [qlBusyIdx, setQlBusyIdx] = useState<number | null>(null);
  const [qlStageByIdx, setQlStageByIdx] = useState<Record<number, string>>({});
  // Result panel state per row — only the most recent click is kept;
  // a second click on the same row wipes the previous result.
  type QlResult =
    | { kind: 'launched'; provider: string | null; model: string | null; fallback_used: boolean; draftId: string | null; jobId: string | null; risk: { locale: 'ru' | 'uz'; risk_level: string; risk_score: number } | null; draftLink: string | null }
    | { kind: 'cannibalization'; existingUrl: string | null; existingTitle: string | null; reason: string; suggestions: Array<{ action: string; label: string; url?: string | null }> }
    | { kind: 'failed'; error: string; reason?: string };
  const [qlResultByIdx, setQlResultByIdx] = useState<Record<number, QlResult>>({});

  // Run the quick-launch flow for a single Yandex row.
  // 2026-06-24 — the endpoint now returns mode='launching' immediately
  // after the reservation step (Cloudflare Pages Functions cannot keep
  // an HTTP connection open long enough for full LLM generation). We
  // then poll /api/admin/seo-autopilot/jobs?limit=20 every ~5 s and
  // match the row by request_id. The stage label tracks the polled
  // job_row.status so the operator always sees the truth.
  async function quickLaunch(rowIndex: number) {
    const row = yxResults[rowIndex];
    if (!row || qlBusyIdx !== null) return; // global guard against double-click on any row
    setQlBusyIdx(rowIndex);
    setQlResultByIdx((prev) => ({ ...prev, [rowIndex]: undefined as unknown as QlResult }));
    setQlStageByIdx((prev) => ({ ...prev, [rowIndex]: 'Резервируем тему…' }));

    const statusToStage: Record<string, string> = {
      pending: 'Запускаем пайплайн…',
      forwarding: 'Отправляем в LLM…',
      normalising: 'Генерируем RU + Uzbek Latin…',
      ingesting: 'Сохраняем черновик…',
      completed: 'Готово',
      failed: 'Ошибка',
    };

    try {
      const locale: 'ru' | 'uz' = localeMode === 'uz' ? 'uz' : 'ru';
      const r = await api.yandexQuickLaunch({
        query: row.query,
        locale,
        yandex_context: {
          difficulty_score: row.difficulty_score,
          found_total: row.yandex_found_total,
          top_domains: row.top_domains,
          gptbot_present: row.already_ranking,
          recommendations: row.reasons,
        },
        industry: industry || null,
        channel: channel || null,
        funnel_stage: funnel || null,
        target_money_page: moneyPage || null,
      });

      if (r.mode === 'cannibalization_risk') {
        setQlResultByIdx((prev) => ({
          ...prev,
          [rowIndex]: {
            kind: 'cannibalization',
            existingUrl: r.existing_url || null,
            existingTitle: r.existing_title || null,
            reason: r.reason || 'Этот запрос уже занят страницей GPTBot.uz. Рекомендуется улучшить существующую страницу или выбрать другой угол.',
            suggestions: r.suggestions || [],
          },
        }));
        setQlStageByIdx((prev) => { const n = { ...prev }; delete n[rowIndex]; return n; });
        setQlBusyIdx(null);
        return;
      }
      if (r.mode !== 'launching') {
        // bad_request / launch_failed / reservation_failed / server_error
        setQlResultByIdx((prev) => ({
          ...prev,
          [rowIndex]: { kind: 'failed', error: r.error || 'Generation failed', reason: r.reason },
        }));
        setQlStageByIdx((prev) => { const n = { ...prev }; delete n[rowIndex]; return n; });
        setQlBusyIdx(null);
        return;
      }

      // Polling phase. Match jobs[] by request_id == r.request_id.
      const requestId = r.request_id;
      const intervalMs = r.poll?.interval_ms || 5_000;
      const timeoutMs = r.poll?.timeout_ms || 360_000;
      const startedAt = Date.now();
      setQlStageByIdx((prev) => ({ ...prev, [rowIndex]: 'Запускаем пайплайн…' }));

      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((res) => setTimeout(res, intervalMs));
        try {
          const jobs = await api.seoAutopilotJobs();
          const match = (jobs.jobs || []).find((j) => j.request_id === requestId);
          if (match) {
            setQlStageByIdx((prev) => ({
              ...prev,
              [rowIndex]: statusToStage[match.status] || match.status,
            }));
            if (match.status === 'completed') {
              const draftId = match.draft_id;
              setQlResultByIdx((prev) => ({
                ...prev,
                [rowIndex]: {
                  kind: 'launched',
                  provider: match.llm_provider || null,
                  model: match.llm_model || null,
                  fallback_used: !!match.llm_fallback_used,
                  draftId: draftId || null,
                  jobId: match.id || null,
                  risk: null,
                  draftLink: draftId ? `/admin-tools/ai-drafts/${draftId}` : null,
                },
              }));
              setQlStageByIdx((prev) => { const n = { ...prev }; delete n[rowIndex]; return n; });
              setQlBusyIdx(null);
              void loadList();
              return;
            }
            if (match.status === 'failed') {
              setQlResultByIdx((prev) => ({
                ...prev,
                [rowIndex]: {
                  kind: 'failed',
                  error: match.error_message || match.error_code || 'Generation failed',
                  reason: match.llm_provider ? `provider=${match.llm_provider}` : undefined,
                },
              }));
              setQlStageByIdx((prev) => { const n = { ...prev }; delete n[rowIndex]; return n; });
              setQlBusyIdx(null);
              return;
            }
          }
        } catch { /* poll error tolerated — try again on next tick */ }
      }
      // Polling timeout — surface a soft error; the backend may still
      // finish and the operator can reload to see the draft.
      setQlResultByIdx((prev) => ({
        ...prev,
        [rowIndex]: {
          kind: 'failed',
          error: 'Время ожидания истекло. Откройте список AI-черновиков, чтобы проверить, появился ли черновик.',
        },
      }));
      setQlStageByIdx((prev) => { const n = { ...prev }; delete n[rowIndex]; return n; });
    } catch (e) {
      setQlStageByIdx((prev) => { const n = { ...prev }; delete n[rowIndex]; return n; });
      setQlResultByIdx((prev) => ({ ...prev, [rowIndex]: { kind: 'failed', error: (e as Error).message } }));
    }
    setQlBusyIdx(null);
  }

  // Build sensible default seeds from the current Topic Plan params.
  function buildDefaultSeeds(): string[] {
    const out = new Set<string>();
    const i = industry.trim().toLowerCase();
    const c = channel.trim().toLowerCase();
    const f = funnel.trim().toLowerCase();
    const baseTerms = ['AI-бот', 'чат-бот', 'Telegram-бот', 'бот для бизнеса'];
    if (i) baseTerms.forEach((b) => out.add(`${b} для ${i}`));
    if (c && i) out.add(`${c} бот для ${i}`);
    if (f === 'top') out.add('что такое ai-бот для бизнеса');
    if (f === 'middle') out.add('как внедрить ai-бот в бизнес');
    if (f === 'bottom') out.add('заказать ai-бот для бизнеса');
    if (out.size === 0) {
      // Reasonable Uzbekistan-focused defaults so the operator gets something
      // useful even without any params.
      ['AI-бот для бизнеса', 'чат-бот для бизнеса', 'Telegram-бот Узбекистан',
       'AI-продавец', 'бот для заявок', 'автоматизация продаж'].forEach((b) => out.add(b));
    }
    return Array.from(out).slice(0, 10);
  }

  function openYandex() {
    if (yxSeedsText.trim().length === 0) setYxSeedsText(buildDefaultSeeds().join('\n'));
    setYxOpen(true);
    setYxErr(null);
  }

  async function runYandex(retryOnlyFailed = false) {
    let seeds: string[];
    if (retryOnlyFailed && yxFailedSeeds.length > 0) {
      // "Повторить только неуспешные" — keep existing successful results
      // and only re-issue the failed seeds.
      seeds = yxFailedSeeds.map((f) => f.seed);
    } else {
      seeds = yxSeedsText.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 20);
    }
    if (seeds.length === 0) { setYxErr('Нужно минимум один seed (≥ 2 символа)'); return; }
    const yxLocale: 'ru' | 'uz' = localeMode === 'uz' ? 'uz' : 'ru';
    setYxBusy(true); setYxErr(null);
    try {
      const r = await api.yandexResearch(seeds, yxLocale);
      // Merge results when retrying only failed seeds — successful
      // topics from the previous run stay visible.
      if (retryOnlyFailed) {
        setYxResults((prev) => {
          const next = [...prev];
          for (const t of r.topics) {
            const idx = next.findIndex((x) => x.query === t.query);
            if (idx >= 0) next[idx] = t;
            else next.push(t);
          }
          return next;
        });
      } else {
        setYxResults(r.topics);
      }
      setYxStats({ api_calls: r.api_calls, cache_hits: r.cache_hits });
      setYxFailedSeeds(r.failed_seeds || []);
      setYxWarnings(r.warnings || []);
      setYxPartial(!!r.partial);
      setYxRequestId(r.request_id || null);
      if (!r.ok && r.topics.length === 0) {
        // Hard failure — no successful topics at all.
        const msg = r.error?.message || 'Yandex временно не ответил. Повторите запрос.';
        setYxErr(msg);
      } else if (r.partial) {
        // Partial success — successful topics are shown; warnings already
        // listed via the panel summary. Keep the inline error area clear
        // so the operator notices the actionable retry button instead.
        setYxErr(null);
      }
    } catch (e) {
      // Genuine client-side failure (network, abort). The new envelope
      // makes this rare because the endpoint returns HTTP 200 even when
      // upstream Yandex is down.
      setYxErr(`Yandex временно не ответил: ${(e as Error).message}`);
    }
    setYxBusy(false);
  }

  function useAsSeed(query: string) {
    // Push the picked Yandex query into the moneyPage hint OR industry as
    // a seed for the next "Собрать темы" run. Most operators want to use
    // it as the topic angle, so we drop it into industry where it shapes
    // the AI prompt.
    setIndustry((cur) => cur ? `${cur}, ${query}` : query);
    setToast(`Добавлено в "Отрасль" как seed: ${query.slice(0, 60)}…`);
    setYxOpen(false);
  }

  async function loadList() {
    try {
      const r = await api.topicPlanList();
      setPlans(r.plans);
      if (!plan && r.plans.length > 0) {
        setPlan(r.plans[0]);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => { void loadList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (!plan) return;
    const hasInflight = plan.items.some((i) => i.status === 'reserved' || i.status === 'generating');
    if (!hasInflight && !launchingItemId) return;
    pollTimer.current = setInterval(async () => {
      try {
        const r = await api.topicPlanGet(plan.id);
        setPlan(r.plan);
      } catch { /* ignore one-off polling errors */ }
    }, 6000);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [plan, launchingItemId]);

  async function gatherTopics() {
    setBusy(true); setErr(null); setToast(null);
    try {
      const params: Record<string, string> = {};
      if (industry) params.industry = industry;
      if (channel) params.channel = channel;
      if (funnel) params.funnel_stage = funnel;
      if (moneyPage) params.target_money_page = moneyPage;
      const r = await api.topicPlanCreate({
        count,
        locale_mode: localeMode,
        params,
      });
      setPlan(r.plan);
      await loadList();
      const got = r.plan.items.length;
      if (got < count) {
        setToast(`Собрано тем: ${got} из ${count}. Сужающие фильтры или дубликаты предыдущих планов ограничили выдачу — снимите фильтр или подождите, пока активные резервации завершатся.`);
      } else {
        setToast(`Собрано тем: ${got}`);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  async function replaceItem(itemId: string) {
    if (!plan) return;
    setBusy(true); setErr(null);
    try {
      await api.topicPlanItemReplace(plan.id, itemId);
      const fresh = await api.topicPlanGet(plan.id);
      setPlan(fresh.plan);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  async function deleteItem(itemId: string) {
    if (!plan) return;
    if (!confirm('Удалить тему из плана?')) return;
    setBusy(true); setErr(null);
    try {
      await api.topicPlanItemDelete(plan.id, itemId);
      const fresh = await api.topicPlanGet(plan.id);
      setPlan(fresh.plan);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  async function launchOne(itemId: string) {
    if (!plan) return;
    setLaunchingItemId(itemId); setErr(null);
    try {
      await api.topicPlanItemLaunch(plan.id, itemId);
      const fresh = await api.topicPlanGet(plan.id);
      setPlan(fresh.plan);
    } catch (e) {
      const err = e as Error & { code?: string; requestId?: string; status?: number };
      const lines = [err.message];
      if (err.code) lines.unshift(`[${err.code}]`);
      if (err.status) lines.push(`HTTP ${err.status}`);
      if (err.requestId) lines.push(`req=${err.requestId}`);
      setErr(lines.join(' · '));
    }
    setLaunchingItemId(null);
    // Always refresh — failure may have stamped the row with error_message.
    try { const fresh = await api.topicPlanGet(plan.id); setPlan(fresh.plan); } catch { /* */ }
  }

  async function launchAll() {
    if (!plan) return;
    if (!confirm('Запустить весь план? Темы будут обрабатываться последовательно по одной — это может занять 20–40 минут.')) return;
    setErr(null);
    for (const item of plan.items) {
      if (item.status !== 'proposed' && item.status !== 'failed') continue;
      setLaunchingItemId(item.id);
      try {
        await api.topicPlanItemLaunch(plan.id, item.id);
      } catch (e) {
        setErr(`${item.planned_title}: ${(e as Error).message}`);
        // do not break — continue with the next item per spec
      }
      // Refresh plan state so the UI updates between launches.
      try { const fresh = await api.topicPlanGet(plan.id); setPlan(fresh.plan); } catch { /* */ }
    }
    setLaunchingItemId(null);
  }

  const summary = plan?.summary;
  const empty = !plan;
  const summaryRow = useMemo(() => summary ? [
    { label: t.topicPlan.summaryTotal,           value: summary.total,           tone: 'neutral' as const },
    { label: t.topicPlan.summaryReserved,        value: summary.reserved + summary.generating, tone: 'info' as const },
    { label: t.topicPlan.summaryGenerated,       value: summary.generated,       tone: 'info' as const },
    { label: t.topicPlan.summaryNeedsRetarget,   value: summary.needs_retarget,  tone: 'warning' as const },
    { label: t.topicPlan.summaryReadyForReview,  value: summary.ready_for_review,tone: 'success' as const },
    { label: t.topicPlan.summaryFailed,          value: summary.failed,          tone: 'danger' as const },
  ] : [], [summary, t]);

  return (
    <Card className="space-y-4" data-testid={testIdPrefix}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl text-white flex items-center gap-2"><Sparkles size={16} className="text-brand-cyan"/> {t.topicPlan.sectionTitle}</h2>
          <p className="text-white/60 text-sm mt-1 max-w-2xl">{t.topicPlan.sectionSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {plans.length > 1 && plan && (
            <Select
              data-testid={`${testIdPrefix}-history-select`}
              className="w-72"
              value={plan.id}
              onChange={(e) => { const p = plans.find((x) => x.id === e.target.value); if (p) setPlan(p); }}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {new Date(p.created_at).toLocaleString()} · {p.requested_count} · {p.locale_mode}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {/* Params */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <label className="text-white/50 text-xs">{t.topicPlan.paramCount}</label>
          <Input type="number" min={1} max={20} value={count}
            onChange={(e) => setCount(Math.min(20, Math.max(1, parseInt(e.target.value || '10', 10))))}
            data-testid={`${testIdPrefix}-param-count`}/>
        </div>
        <div>
          <label className="text-white/50 text-xs">{t.topicPlan.paramLocale}</label>
          <Select value={localeMode} onChange={(e) => setLocaleMode(e.target.value as typeof localeMode)} data-testid={`${testIdPrefix}-param-locale`}>
            <option value="ru">{t.topicPlan.paramLocaleRu}</option>
            <option value="uz">{t.topicPlan.paramLocaleUz}</option>
            <option value="ru+uz">{t.topicPlan.paramLocaleBoth}</option>
          </Select>
        </div>
        <div>
          <label className="text-white/50 text-xs">{t.topicPlan.paramIndustry}</label>
          <Select value={industry} onChange={(e) => setIndustry(e.target.value)} data-testid={`${testIdPrefix}-param-industry`}>
            <option value="">— любая —</option>
            <option value="clinic">clinic</option>
            <option value="restaurant">restaurant</option>
            <option value="retail">retail</option>
            <option value="fitness">fitness</option>
            <option value="beauty">beauty</option>
            <option value="realestate">realestate</option>
            <option value="education">education</option>
            <option value="logistics">logistics</option>
            <option value="b2b">b2b</option>
            <option value="b2c">b2c</option>
          </Select>
        </div>
        <div>
          <label className="text-white/50 text-xs">{t.topicPlan.paramChannel}</label>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} data-testid={`${testIdPrefix}-param-channel`}>
            <option value="">— любой —</option>
            <option value="telegram">telegram</option>
            <option value="whatsapp">whatsapp</option>
            <option value="instagram">instagram</option>
            <option value="web">web</option>
            <option value="omni">omni</option>
          </Select>
        </div>
        <div>
          <label className="text-white/50 text-xs">{t.topicPlan.paramFunnel}</label>
          <Select value={funnel} onChange={(e) => setFunnel(e.target.value)} data-testid={`${testIdPrefix}-param-funnel`}>
            <option value="">— любой —</option>
            <option value="top">top</option>
            <option value="middle">middle</option>
            <option value="bottom">bottom</option>
          </Select>
        </div>
        <div>
          <label className="text-white/50 text-xs">{t.topicPlan.paramMoneyPage}</label>
          <Input value={moneyPage} placeholder="/ru/ai-bot-dlya-biznesa/"
            onChange={(e) => setMoneyPage(e.target.value)}
            data-testid={`${testIdPrefix}-param-money`}/>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" variant="primary" onClick={() => void gatherTopics()} disabled={busy} data-testid={`${testIdPrefix}-gather`}>
          {busy ? <RefreshCw size={14} className="animate-spin"/> : <ListFilter size={14}/>}
          {busy ? t.topicPlan.btnGathering : t.topicPlan.btnGather10}
        </Button>
        {plan && (
          <Button size="sm" variant="secondary" onClick={() => void launchAll()} disabled={busy || !!launchingItemId} data-testid={`${testIdPrefix}-launch-all`}>
            {launchingItemId ? <Loader2 size={14} className="animate-spin"/> : <PlayCircle size={14}/>}
            {t.topicPlan.btnLaunchAll}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={openYandex} disabled={busy} data-testid={`${testIdPrefix}-yandex-open`}>
          <Globe size={14}/> Спрос Яндекса
        </Button>
      </div>

      {/* Yandex demand intelligence panel — collapsible */}
      {yxOpen && (
        <Card className="border-emerald-500/20" data-testid={`${testIdPrefix}-yandex`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-emerald-300" />
              <span className="font-display text-white">Yandex.uz · реальный спрос и сложность SERP</span>
            </div>
            <button type="button" className="text-white/50 hover:text-white p-1" onClick={() => setYxOpen(false)} aria-label="Close">
              <X size={16}/>
            </button>
          </div>
          <p className="text-white/55 text-xs mb-3">
            Анализирует <code className="text-white/75">yandex.uz</code> SERP по seed-фразам, считает difficulty-score 0–100 (ниже = легче пробиться), показывает top-домены и предупреждения.
            Результаты кешируются на 24 ч — повторные запросы той же фразы не сжигают квоту.
          </p>
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-stretch">
            <textarea
              value={yxSeedsText}
              onChange={(e) => setYxSeedsText(e.target.value)}
              placeholder={'AI-бот для бизнеса\nчат-бот для салонов красоты\nTelegram-бот Узбекистан'}
              rows={5}
              className="bg-bg-base border border-white/10 rounded px-3 py-2 text-sm text-white/90 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
              data-testid={`${testIdPrefix}-yandex-seeds`}
            />
            <div className="flex flex-col gap-2 justify-start">
              <Button size="sm" variant="primary" onClick={() => void runYandex()} disabled={yxBusy} data-testid={`${testIdPrefix}-yandex-run`}>
                {yxBusy ? <RefreshCw size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                {yxBusy ? 'Анализ…' : 'Получить'}
              </Button>
              <div className="text-white/40 text-xs">
                Локаль: <code>{localeMode === 'uz' ? 'uz' : 'ru'}</code><br/>
                Seeds (макс 20): <strong className="text-white/70">{yxSeedsText.split(/\r?\n/).filter((s) => s.trim().length >= 2).length}</strong>
              </div>
            </div>
          </div>
          {yxErr && (
            <div className="mt-3 text-red-300 text-sm flex items-start gap-2" data-testid={`${testIdPrefix}-yandex-error`}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0"/> {yxErr}
            </div>
          )}
          {yxStats && (
            <div className="mt-3 text-white/55 text-xs">
              API-вызовов: <strong className="text-white/80">{yxStats.api_calls}</strong> · из кеша: <strong className="text-white/80">{yxStats.cache_hits}</strong>
              {yxRequestId && (
                <> · req=<code className="text-white/60">{yxRequestId.slice(0, 12)}</code></>
              )}
            </div>
          )}
          {yxWarnings.length > 0 && (
            <div className="mt-3 space-y-1" data-testid={`${testIdPrefix}-yandex-warnings`}>
              {yxWarnings.map((w, i) => (
                <div key={`yx-w-${i}`} className="flex items-start gap-2 text-amber-200/85 text-xs">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0"/> {w}
                </div>
              ))}
            </div>
          )}
          {yxFailedSeeds.length > 0 && (
            <div className="mt-3 border border-amber-500/30 bg-amber-500/[0.04] rounded-md px-3 py-2" data-testid={`${testIdPrefix}-yandex-failed-seeds`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-amber-200/95 text-sm font-medium flex items-center gap-2">
                  <AlertTriangle size={14}/> {yxFailedSeeds.length} запрос(а) не успели ответить
                </div>
                {yxFailedSeeds.every((f) => f.retryable) && (
                  <Button size="sm" variant="ghost" onClick={() => void runYandex(true)} disabled={yxBusy} data-testid={`${testIdPrefix}-yandex-retry-failed`}>
                    {yxBusy ? <RefreshCw size={12} className="animate-spin"/> : <RefreshCw size={12}/>}
                    Повторить только неуспешные
                  </Button>
                )}
              </div>
              <ul className="mt-1 space-y-0.5 text-amber-200/70 text-[11px]">
                {yxFailedSeeds.map((f, i) => (
                  <li key={`yx-f-${i}`}>
                    <code className="text-amber-200/90">{f.seed}</code>
                    <span className="text-amber-200/55"> · {f.error_code}</span>
                    {f.http_status ? <span className="text-amber-200/55"> · HTTP {f.http_status}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {yxPartial && yxResults.length > 0 && (
            <div className="mt-2 text-emerald-300/80 text-xs" data-testid={`${testIdPrefix}-yandex-partial`}>
              Показаны {yxResults.length} удачных запрос(а). Их можно использовать для кнопки «Сгенерировать статью».
            </div>
          )}
          {yxResults.length > 0 && (
            <div className="mt-4 space-y-2" data-testid={`${testIdPrefix}-yandex-results`}>
              {yxResults.map((r, i) => {
                const isBusy = qlBusyIdx === i;
                const stage = qlStageByIdx[i];
                const result = qlResultByIdx[i];
                return (
                <div key={i} className="border border-white/10 rounded-lg px-3 py-2.5 hover:border-white/20 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-white font-medium">{r.query}</code>
                    <Badge tone={r.difficulty_score <= 35 ? 'success' : r.difficulty_score <= 65 ? 'info' : 'warning'}>
                      сложность {r.difficulty_score}
                    </Badge>
                    <Badge tone="neutral">найдено: {r.yandex_found_total > 1000 ? `${(r.yandex_found_total/1000).toFixed(1)}k` : r.yandex_found_total}</Badge>
                    {r.weak_competition && <Badge tone="success"><CheckCircle2 size={10}/> слабая конкуренция</Badge>}
                    {r.already_ranking && <Badge tone="warning">gptbot.uz уже в выдаче</Badge>}
                    <div className="ml-auto flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void quickLaunch(i)}
                        disabled={qlBusyIdx !== null}
                        data-testid={`${testIdPrefix}-yandex-quick-launch-${i}`}
                        title="Создать RU + Uzbek Latin черновик в AI Draft Inbox через OpenRouter primary"
                      >
                        {isBusy ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                        {isBusy ? (stage || 'Запускаем…') : 'Сгенерировать статью'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => useAsSeed(r.query)}
                        disabled={qlBusyIdx !== null}
                        data-testid={`${testIdPrefix}-yandex-use-${i}`}
                        title="Добавить в seed следующего Topic Plan"
                      >
                        Добавить в план
                      </Button>
                    </div>
                  </div>
                  {r.top_domains.length > 0 && (
                    <div className="text-white/45 text-xs mt-1.5">Top: <code className="text-white/65">{r.top_domains.join(' · ')}</code></div>
                  )}
                  {r.reasons.map((rs, j) => (
                    <div key={`r-${j}`} className="text-emerald-200/80 text-xs mt-0.5">✓ {rs}</div>
                  ))}
                  {r.warnings.map((w, j) => (
                    <div key={`w-${j}`} className="text-amber-200/80 text-xs mt-0.5">! {w}</div>
                  ))}
                  {/* Inline result panel after a quick-launch click. */}
                  {result && result.kind === 'launched' && (
                    <div className="mt-2.5 border border-emerald-500/30 bg-emerald-500/5 rounded-md px-2.5 py-2 text-sm" data-testid={`${testIdPrefix}-yandex-result-${i}`}>
                      <div className="flex items-center gap-2 flex-wrap text-emerald-200/90">
                        <CheckCircle2 size={14}/>
                        <span className="font-medium">Черновик создан в AI Draft Inbox</span>
                        {result.provider && <Badge tone="info">Provider: {result.provider}</Badge>}
                        {result.model && <Badge tone="neutral">Model: {result.model}</Badge>}
                        {result.fallback_used && <Badge tone="warning">Fallback: да</Badge>}
                        {!result.fallback_used && <Badge tone="success">Fallback: нет</Badge>}
                        {result.risk && (
                          <Badge tone={result.risk.risk_level === 'low' ? 'success' : result.risk.risk_level === 'medium' ? 'warning' : 'danger'}>
                            Intent Guard: {result.risk.risk_level} ({result.risk.risk_score})
                          </Badge>
                        )}
                      </div>
                      <div className="text-white/55 text-xs mt-1.5 flex items-center gap-3 flex-wrap">
                        {result.draftId && <code className="text-white/70">draft: {result.draftId.slice(0, 16)}…</code>}
                        {result.jobId && <code className="text-white/55">job: {result.jobId.slice(0, 16)}…</code>}
                      </div>
                      {result.draftLink && (
                        <div className="mt-1.5">
                          <Link to={result.draftLink} className="text-emerald-300 hover:text-emerald-200 text-sm inline-flex items-center gap-1" data-testid={`${testIdPrefix}-yandex-open-draft-${i}`}>
                            Открыть AI-черновик <ChevronRight size={14}/>
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                  {result && result.kind === 'cannibalization' && (
                    <div className="mt-2.5 border border-amber-500/40 bg-amber-500/5 rounded-md px-2.5 py-2 text-sm" data-testid={`${testIdPrefix}-yandex-cannibalization-${i}`}>
                      <div className="flex items-start gap-2 text-amber-200/90">
                        <AlertTriangle size={14} className="mt-0.5"/>
                        <div>
                          <div className="font-medium">Возможна каннибализация</div>
                          <div className="text-amber-200/70 text-xs mt-0.5">{result.reason}</div>
                          {result.existingUrl && (
                            <a href={result.existingUrl} target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:text-amber-200 underline text-xs mt-1 inline-block">
                              {result.existingUrl}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {result.suggestions.map((s) => (
                          <Badge key={s.action} tone="neutral">{s.label}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {result && result.kind === 'failed' && (
                    <div className="mt-2.5 border border-red-500/40 bg-red-500/5 rounded-md px-2.5 py-2 text-sm text-red-200/90" data-testid={`${testIdPrefix}-yandex-failed-${i}`}>
                      <div className="flex items-start gap-2">
                        <X size={14} className="mt-0.5"/>
                        <div>
                          <div className="font-medium">Не удалось создать черновик</div>
                          <div className="text-red-200/70 text-xs mt-0.5">{result.error}{result.reason ? ` · ${result.reason}` : ''}</div>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => void quickLaunch(i)} className="mt-1.5" data-testid={`${testIdPrefix}-yandex-retry-${i}`}>
                        <RefreshCw size={14}/> Повторить
                      </Button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {err && <div className="text-red-300 text-sm" data-testid={`${testIdPrefix}-error`}>{err}</div>}
      {toast && <div className="text-emerald-300 text-sm" data-testid={`${testIdPrefix}-toast`}>{toast}</div>}

      {empty && <div className="text-white/60 text-sm" data-testid={`${testIdPrefix}-empty`}>{t.topicPlan.emptyState}</div>}

      {plan && plan.items.length === 0 && <div className="text-white/60 text-sm" data-testid={`${testIdPrefix}-empty-after`}>{t.topicPlan.emptyAfterGather}</div>}

      {plan && plan.items.length > 0 && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {summaryRow.map((s) => (
              <div key={s.label} className={`border rounded-xl px-3 py-2 ${
                s.tone === 'success' ? 'border-emerald-500/30' :
                s.tone === 'warning' ? 'border-amber-500/30' :
                s.tone === 'danger'  ? 'border-red-500/30'   :
                s.tone === 'info'    ? 'border-brand-blue/30':
                                       'border-white/10'
              }`}>
                <div className="text-[10px] uppercase text-white/45">{s.label}</div>
                <div className="font-display text-xl text-white" data-testid={`${testIdPrefix}-summary-${s.label}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Items */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid={`${testIdPrefix}-items-table`}>
              <thead>
                <tr className="text-left text-white/40 border-b border-white/5">
                  <th className="py-2 px-2 font-medium">#</th>
                  <th className="py-2 px-2 font-medium">{t.topicPlan.tableColTitle}</th>
                  <th className="py-2 px-2 font-medium">{t.topicPlan.tableColKeyword}</th>
                  <th className="py-2 px-2 font-medium">{t.topicPlan.tableColMoneyPage}</th>
                  <th className="py-2 px-2 font-medium">{t.topicPlan.tableColIndustry}</th>
                  <th className="py-2 px-2 font-medium">{t.topicPlan.tableColChannel}</th>
                  <th className="py-2 px-2 font-medium">{t.topicPlan.tableColFunnel}</th>
                  <th className="py-2 px-2 font-medium">{t.topicPlan.tableColRisk}</th>
                  <th className="py-2 px-2 font-medium">{t.topicPlan.tableColStatus}</th>
                  <th className="py-2 px-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {plan.items.map((it) => (
                  <tr key={it.id} className="border-b border-white/5 align-top hover:bg-white/[0.02]" data-testid={`${testIdPrefix}-row-${it.id}`}>
                    <td className="py-2 px-2 text-white/50">{it.position}</td>
                    <td className="py-2 px-2 max-w-md">
                      <div className="text-white/90 truncate" title={it.planned_title} data-testid={`${testIdPrefix}-row-${it.id}-title`}>{it.planned_title}</div>
                      <div className="text-white/45 text-[11px] mt-0.5">{it.reason_unique}</div>
                      {it.status === 'failed' && it.error_message && (
                        <div className="text-amber-300/90 text-[11px] mt-1 break-words" data-testid={`${testIdPrefix}-row-${it.id}-error`}>
                          ⚠ {it.error_message}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-white/80">
                      <div className="text-xs">{it.primary_keyword}</div>
                      <div className="text-white/45 text-[10px] font-mono mt-0.5" title={it.intent_key}>{it.locale.toUpperCase()}</div>
                    </td>
                    <td className="py-2 px-2 text-brand-cyan text-xs">{it.target_money_page || '—'}</td>
                    <td className="py-2 px-2 text-white/70 text-xs">{it.industry || '—'}</td>
                    <td className="py-2 px-2 text-white/70 text-xs">{it.channel || '—'}</td>
                    <td className="py-2 px-2 text-white/70 text-xs">{it.funnel_stage || '—'}</td>
                    <td className="py-2 px-2"><IntentGuardBadge level={it.risk_level || 'unknown'} score={it.risk_score ?? undefined} testId={`${testIdPrefix}-row-${it.id}-risk`}/></td>
                    <td className="py-2 px-2"><Badge tone={statusTone(it.status)}>{localiseStatus(it.status, t)}</Badge></td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      {it.draft_id && (
                        <Link to={`/admin-tools/ai-drafts/${it.draft_id}`} className="text-brand-cyan hover:text-white text-xs inline-flex items-center gap-1" data-testid={`${testIdPrefix}-row-${it.id}-open-draft`}>
                          {t.topicPlan.openDraft} <ChevronRight size={12}/>
                        </Link>
                      )}
                      {(it.status === 'proposed' || it.status === 'failed') && (
                        <div className="flex gap-1 mt-1">
                          <Button size="sm" variant="primary"
                            disabled={busy || !!launchingItemId}
                            onClick={() => void launchOne(it.id)}
                            data-testid={`${testIdPrefix}-row-${it.id}-launch`}>
                            {launchingItemId === it.id ? <Loader2 size={12} className="animate-spin"/> : <PlayCircle size={12}/>}
                            {t.topicPlan.btnLaunchOne}
                          </Button>
                          <Button size="sm" variant="ghost"
                            disabled={busy || !!launchingItemId}
                            onClick={() => void replaceItem(it.id)}
                            data-testid={`${testIdPrefix}-row-${it.id}-replace`}>
                            <RefreshCw size={12}/>
                          </Button>
                          <Button size="sm" variant="ghost"
                            disabled={busy || !!launchingItemId}
                            onClick={() => void deleteItem(it.id)}
                            data-testid={`${testIdPrefix}-row-${it.id}-delete`}>
                            <Trash2 size={12}/>
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-white/40 text-[11px] mt-2">{t.topicPlan.growthFormula}</p>
    </Card>
  );
}

function localiseStatus(s: TopicPlanItemStatus, t: ReturnType<typeof useT>['t']): string {
  switch (s) {
    case 'proposed':         return t.topicPlan.statusProposed;
    case 'reserved':         return t.topicPlan.statusReserved;
    case 'generating':       return t.topicPlan.statusGenerating;
    case 'generated':        return t.topicPlan.statusGenerated;
    case 'analyzed':         return t.topicPlan.statusAnalyzed;
    case 'needs_retarget':   return t.topicPlan.statusNeedsRetarget;
    case 'ready_for_review': return t.topicPlan.statusReadyForReview;
    case 'failed':           return t.topicPlan.statusFailed;
    case 'released':         return 'released';
    case 'rejected':         return 'rejected';
    default:                 return s;
  }
}

export type { TopicPlanItem };

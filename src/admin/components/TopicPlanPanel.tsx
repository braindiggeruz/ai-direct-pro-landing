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
      </div>

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

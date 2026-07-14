// GPTBot Control Center — SEO Autopilot.
//
// Replaces the external Runable trigger. The owner clicks
// "Запустить SEO Автопилот" → POST /api/admin/seo-autopilot/run with the
// admin JWT → server-side n8n call (synchronous wait) → AI Draft Inbox.
//
// Also manages the cron schedule (disabled / weekly / twice_weekly) and
// shows the most recent runs.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, Select } from '../components/ui';
import { TriangleAlert as AlertTriangle, CalendarClock, CircleCheck as CheckCircle2, ChevronRight, Clock, Inbox, Loader as Loader2, CirclePlay as PlayCircle, RefreshCw, ShieldAlert, ShieldCheck, Circle as XCircle, ExternalLink } from 'lucide-react';
import type {
  AutopilotJobRow, AutopilotJobStatus, AutopilotLaunchResult, AutopilotSystemFlags,
} from '../../shared/seo-autopilot';
import { TopicPlanPanel } from '../components/TopicPlanPanel';

type ScheduleMode = 'disabled' | 'weekly' | 'twice_weekly';

function statusTone(s: AutopilotJobStatus): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (s) {
    case 'completed': return 'success';
    case 'failed':    return 'danger';
    case 'pending':
    case 'forwarding':
    case 'normalising':
    case 'ingesting': return 'info';
    default:          return 'neutral';
  }
}

function isActive(s: AutopilotJobStatus): boolean {
  return s !== 'completed' && s !== 'failed';
}

function humanDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 100) / 10;
  return `${sec} s`;
}

function humanSource(src: string | null | undefined): { label: string; tone: 'info' | 'success' | 'neutral' | 'warning' } {
  if (src === 'admin') return { label: 'Manual run', tone: 'info' };
  if (src === 'schedule') return { label: 'Scheduled run', tone: 'success' };
  if (src === 'external') return { label: 'External (deprecated)', tone: 'warning' };
  return { label: src || '—', tone: 'neutral' };
}

export default function SeoAutopilotControlCenter() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<AutopilotJobRow[]>([]);
  const [system, setSystem] = useState<AutopilotSystemFlags | null>(null);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('disabled');
  const [scheduleMeta, setScheduleMeta] = useState<{ updated_at?: string; updated_by?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastLaunch, setLastLaunch] = useState<AutopilotLaunchResult | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const launchStartedRef = useRef<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadAll(): Promise<void> {
    setErr(null);
    try {
      const [j, s] = await Promise.all([api.seoAutopilotJobs(), api.seoAutopilotGetSchedule()]);
      setJobs(j.jobs || []);
      setSystem(j.system);
      setScheduleMode(s.schedule.mode);
      setScheduleMeta({ updated_at: s.schedule.updated_at, updated_by: s.schedule.updated_by });
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { void loadAll(); }, []);

  // Light polling of recent jobs every 8 s (mostly to surface scheduled
  // runs and stale-sweep results). The manual run itself does not depend
  // on polling — the synchronous launch returns the final state inline.
  useEffect(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => { void loadAll(); }, 8000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Elapsed-time ticker shown while the launch is in flight.
  useEffect(() => {
    if (!busy) {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
      launchStartedRef.current = null;
      // We deliberately do NOT reset elapsedMs here (avoid setState-in-effect);
      // the ticker simply stops, the next launch resets it when it runs.
      return;
    }
    launchStartedRef.current = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      if (launchStartedRef.current) setElapsedMs(Date.now() - launchStartedRef.current);
    }, 250);
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [busy]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function launch(): Promise<void> {
    if (busy) return; // double-click guard
    setBusy(true); setErr(null); setToast(null); setLastLaunch(null); setElapsedMs(0);
    try {
      const r = await api.seoAutopilotLaunch({});
      setLastLaunch(r);
      if (r.success && r.draft_id && r.admin_url) {
        setToast(`Draft ready: ${r.draft_id} (${humanDuration(r.duration_ms)})`);
      } else if (r.error_code) {
        setErr(`${r.error_code}: ${r.error_message || 'see job details'}`);
      } else {
        setErr(`Launch finished in status=${r.status}`);
      }
      await loadAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openDraft(): void {
    if (lastLaunch?.admin_url) navigate(lastLaunch.admin_url);
    else if (system?.last_completed?.admin_url) navigate(system.last_completed.admin_url);
  }

  async function changeSchedule(next: ScheduleMode): Promise<void> {
    setBusy(true); setErr(null); setToast(null);
    try {
      await api.seoAutopilotSetSchedule(next);
      setScheduleMode(next);
      setToast(`Schedule set to "${next.replace('_', ' ')}".`);
      await loadAll();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  const stats = useMemo(() => ({
    total: jobs.length,
    running: jobs.filter((j) => isActive(j.status)).length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  }), [jobs]);

  // Preflight: in direct-AI mode we need (a) drafts DB and (b) at least
  // one LLM provider key configured (multi-provider router). The old
  // Workers AI binding is no longer required — the router routes through
  // Mistral / Gemini / Groq / Cerebras REST instead.
  const anyLlmProvider = (system?.llm_providers || []).some((p) => p.configured);
  const preflightOk = system?.direct_ai_enabled
    ? (anyLlmProvider && system?.drafts_db_configured)
    : (system?.n8n_webhook_secret_configured && system?.drafts_db_configured);
  const launchDisabled = busy || !preflightOk;

  // Pretty stage from elapsed time so the spinner conveys SOMETHING.
  // Multi-provider mode is fast — typical Mistral medium + queue
  // concurrency=1 gives ~5 s per locale, ~15-30 s end-to-end for two
  // locales. Slower providers stretch this but never block.
  const directAi = !!system?.direct_ai_enabled;
  const stage = !busy ? null
    : directAi
      ? (elapsedMs < 3_000   ? 'Подготовка темы…'
        : elapsedMs < 20_000 ? 'AI router пишет RU-статью (heavy queue, concurrency=1)…'
        : elapsedMs < 45_000 ? 'AI router пишет UZ-адаптацию…'
        : elapsedMs < 70_000 ? 'Финальная валидация контракта…'
        : 'Дольше обычного — возможно, primary провайдер недоступен, fallback в работе…')
      : (elapsedMs < 5_000  ? 'Запрос к n8n…'
        : elapsedMs < 30_000 ? 'Сбор SERP + sitemap (~30 s)…'
        : elapsedMs < 75_000 ? 'OpenRouter генерирует RU-статью…'
        : elapsedMs < 130_000 ? 'OpenRouter генерирует UZ-адаптацию…'
        : elapsedMs < 180_000 ? 'Финальная валидация…'
        : 'Дольше обычного — ожидайте ещё пару минут…');

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="seo-autopilot-control-center">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40 flex items-center gap-2">
            <PlayCircle size={12}/> GPTBot Control Center
          </div>
          <h1 className="font-display text-3xl text-white mt-1" data-testid="control-center-heading">
            SEO Autopilot
          </h1>
          <p className="text-white/60 text-sm mt-2 max-w-2xl">
            Generates RU + UZ articles using a multi-provider LLM router
            (Mistral, Gemini, Groq, Cerebras) with automatic fallback and
            heavy-queue concurrency=1. Drafts stay unpublished until you
            click <strong>Publish to GitHub</strong> in the Blog Editor.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="ghost" size="sm" onClick={loadAll} data-testid="control-center-refresh">
            <RefreshCw size={14}/> Refresh
          </Button>
        </div>
      </div>

      {/* Preflight banner */}
      {system && !preflightOk && (
        <Card className="border-amber-500/40 bg-amber-500/10" data-testid="control-center-preflight">
          <div className="flex items-start gap-3">
            <ShieldAlert size={20} className="text-amber-300 mt-0.5"/>
            <div>
              <div className="text-amber-200 font-medium">Configuration required</div>
              <ul className="text-white/80 text-sm mt-2 space-y-1">
                {system.direct_ai_enabled && !anyLlmProvider && (
                  <li data-testid="preflight-missing-llm-provider">
                    • No LLM provider configured. Add at least ONE of{' '}
                    <code className="text-amber-200">MISTRAL_API_KEY</code>,{' '}
                    <code className="text-amber-200">GEMINI_API_KEY</code>,{' '}
                    <code className="text-amber-200">GROQ_API_KEY</code>, or{' '}
                    <code className="text-amber-200">CEREBRAS_API_KEY</code> under{' '}
                    <em>Cloudflare Pages → ai-direct-pro-landing → Settings → Environment variables</em>{' '}
                    (secret_text). Mistral: <a className="text-brand-cyan underline" href="https://console.mistral.ai/api-keys/" target="_blank" rel="noreferrer">console.mistral.ai/api-keys</a>{' '}
                    · Gemini: <a className="text-brand-cyan underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">aistudio.google.com</a>{' '}
                    · Groq: <a className="text-brand-cyan underline" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a>{' '}
                    · Cerebras: <a className="text-brand-cyan underline" href="https://cloud.cerebras.ai/" target="_blank" rel="noreferrer">cloud.cerebras.ai</a>.
                  </li>
                )}
                {!system.direct_ai_enabled && !system.n8n_webhook_secret_configured && (
                  <li data-testid="preflight-missing-webhook">
                    • <code className="text-amber-200">N8N_WEBHOOK_SECRET</code> is not set in Cloudflare Pages.
                    Set it to the value the n8n "Validate Safety Rules" node expects (same as the legacy Runable header value).
                  </li>
                )}
                {!system.drafts_db_configured && (
                  <li>• <code className="text-amber-200">GPTBOT_DRAFTS_DB</code> D1 binding missing.</li>
                )}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {system?.direct_ai_enabled && (system?.llm_providers?.some((p) => p.configured) || system?.ai_binding_configured) && (
        <Card className="border-brand-blue/20 bg-brand-blue/5" data-testid="control-center-direct-ai-banner">
          <div className="flex items-center gap-2 text-white/80 text-sm flex-wrap">
            <ShieldCheck size={14} className="text-brand-cyan"/>
            <span><strong>Multi-provider AI router active.</strong> Heavy queue concurrency=1, automatic fallback across providers, no n8n round-trip.</span>
            <span className="ml-auto flex gap-2 flex-wrap text-[11px]" data-testid="control-center-providers">
              {(system.llm_providers || []).map((p) => (
                <span
                  key={p.provider}
                  className={`px-2 py-0.5 rounded-full border ${p.configured ? 'border-emerald-500/40 text-emerald-300' : 'border-white/15 text-white/40'}`}
                  data-testid={`provider-${p.provider}`}>
                  {p.provider}{p.configured ? ' ✓' : ' —'}
                </span>
              ))}
            </span>
          </div>
        </Card>
      )}

      {err && <Card className="border-red-500/30 bg-red-500/5"><div className="text-red-300 text-sm" data-testid="control-center-error">{err}</div></Card>}
      {toast && <Card className="border-emerald-500/30 bg-emerald-500/5"><div className="text-emerald-300 text-sm" data-testid="control-center-toast">{toast}</div></Card>}

      {/* Intent Guard Topic Plan — "10 unique topics per day" planner. */}
      <TopicPlanPanel testIdPrefix="topic-plan"/>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Launch card */}
        <Card className="lg:col-span-2">
          <h2 className="font-display text-lg text-white mb-3">Manual run</h2>
          <p className="text-white/60 text-sm mb-5">
            Click below to generate a fresh RU + UZ article package now.
            {system?.direct_ai_enabled
              ? ' Multi-provider AI router selects the best available model (Mistral / Gemini / Groq / Cerebras), with automatic fallback. Heavy queue concurrency=1 so a batch of 10 topics never bursts the upstream quota. Typical run: 15–60 s.'
              : <> The server calls n8n with the <code className="text-brand-cyan mx-1">N8N_WEBHOOK_SECRET</code> stored in Cloudflare. Generation takes 1–4 minutes; the page holds the connection open until the draft is ready.</>}
          </p>
          <div className="flex gap-2 flex-wrap items-center">
            <Button
              variant="primary"
              size="md"
              onClick={launch}
              disabled={launchDisabled}
              data-testid="control-center-launch"
              title={!preflightOk ? 'Preflight not met — see the warning above' : ''}>
              {busy ? <Loader2 size={16} className="animate-spin"/> : <PlayCircle size={16}/>}
              Запустить SEO Автопилот
            </Button>
            {lastLaunch?.success && lastLaunch.admin_url && (
              <Button variant="ghost" size="sm" onClick={openDraft} data-testid="control-center-open-draft">
                <ExternalLink size={14}/> Open new draft
              </Button>
            )}
            {!lastLaunch && system?.last_completed?.admin_url && (
              <Link
                to={system.last_completed.admin_url}
                className="text-brand-cyan text-xs inline-flex items-center gap-1 hover:text-white"
                data-testid="control-center-open-last-draft">
                <Inbox size={12}/> Open last draft ({system.last_completed.draft_id})
              </Link>
            )}
          </div>
          {busy && (
            <div className="mt-4 rounded-2xl border border-brand-blue/30 bg-brand-blue/5 px-4 py-3" data-testid="control-center-progress">
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <Loader2 size={14} className="animate-spin"/>
                <span>{stage}</span>
                <span className="text-white/40 ml-auto" data-testid="control-center-elapsed">
                  {humanDuration(elapsedMs)} elapsed
                </span>
              </div>
              <div className="text-white/45 text-[11px] mt-1.5">
                Stay on this page — closing it will not stop n8n, but the
                draft will land in the Inbox in the background (open it from
                "Recent runs" below).
              </div>
            </div>
          )}
          {lastLaunch && !busy && (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 ${
                lastLaunch.success
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-amber-500/30 bg-amber-500/5'
              }`}
              data-testid="control-center-last-launch">
              <div className="text-white/80 text-sm flex items-center gap-2">
                {lastLaunch.success
                  ? <CheckCircle2 size={14} className="text-emerald-300"/>
                  : <AlertTriangle size={14} className="text-amber-300"/>}
                <span data-testid="control-center-last-launch-status">{lastLaunch.status}</span>
                <span className="text-white/40">·</span>
                <span className="text-white/60">{humanDuration(lastLaunch.duration_ms)}</span>
                {lastLaunch.n8n_execution_id && (
                  <span className="text-white/40 text-xs">· n8n exec <code className="text-white/60">{lastLaunch.n8n_execution_id}</code></span>
                )}
              </div>
              {lastLaunch.success && lastLaunch.admin_url && (
                <div className="text-white/70 text-xs mt-2">
                  <Link to={lastLaunch.admin_url} className="text-brand-cyan hover:text-white inline-flex items-center gap-1"
                        data-testid="control-center-last-launch-link">
                    {lastLaunch.draft_id} <ChevronRight size={12}/>
                  </Link>
                  {' '}— RU + UZ, awaiting human review.
                </div>
              )}
              {!lastLaunch.success && (
                <div className="text-amber-200/90 text-xs mt-2" data-testid="control-center-last-launch-error">
                  <strong>{lastLaunch.error_code || 'error'}</strong>: {lastLaunch.error_message || 'see the job detail in Recent runs'}
                </div>
              )}
            </div>
          )}
          <div className="text-white/45 text-xs mt-5">
            <ShieldCheck size={11} className="inline -mt-0.5 mr-1 text-emerald-300"/>
            No GitHub publish, no IndexNow, no public article — draft only.
          </div>
        </Card>

        {/* Schedule card */}
        <Card data-testid="control-center-schedule">
          <h2 className="font-display text-lg text-white mb-1 flex items-center gap-2">
            <CalendarClock size={16}/> Schedule
          </h2>
          <p className="text-white/55 text-xs mb-4">Runs once via GitHub Actions cron (UTC). Drafts only.</p>
          <Select
            value={scheduleMode}
            data-testid="control-center-schedule-mode"
            onChange={(e) => void changeSchedule(e.target.value as ScheduleMode)}
            disabled={busy}>
            <option value="disabled">Disabled</option>
            <option value="weekly">Weekly (Mon 09:00 UTC)</option>
            <option value="twice_weekly">Twice weekly (Mon + Thu 09:00 UTC)</option>
          </Select>
          <div className="text-white/40 text-[11px] mt-3 space-y-0.5">
            <div>Current: <span className="text-white/70">{scheduleMode.replace('_', ' ')}</span></div>
            {scheduleMeta?.updated_at && (
              <div>Updated {new Date(scheduleMeta.updated_at).toLocaleString()} by {scheduleMeta.updated_by || '—'}</div>
            )}
            {system && !system.cron_secret_configured && (
              <div className="text-amber-300 mt-2">⚠ CRON_SECRET not configured — scheduled runs will reject the cron worker.</div>
            )}
          </div>
        </Card>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi label="Recent runs"      value={stats.total}    tone="neutral" testId="kpi-total"/>
        <Kpi label="In flight"        value={stats.running}  tone={stats.running ? 'info' : 'neutral'} testId="kpi-running"/>
        <Kpi label="Completed"        value={stats.completed} tone="success" testId="kpi-completed"/>
        <Kpi label="Errors"           value={stats.failed}   tone={stats.failed > 0 ? 'danger' : 'neutral'} testId="kpi-failed"/>
        <Kpi label="Pending drafts"   value={system?.pending_drafts ?? 0} tone={(system?.pending_drafts ?? 0) > 0 ? 'info' : 'neutral'} testId="kpi-pending-drafts"/>
      </div>

      {/* Recent runs */}
      <Card>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-display text-lg text-white flex items-center gap-2">
            <Clock size={16}/> Recent runs
          </h2>
          {(system?.stale_jobs_swept ?? 0) > 0 && (
            <span className="text-amber-300 text-xs" data-testid="control-center-stale-swept">
              {system?.stale_jobs_swept} stale job(s) auto-recovered on this refresh.
            </span>
          )}
        </div>
        {jobs.length === 0 ? (
          <div className="text-white/50 text-sm" data-testid="control-center-no-jobs">
            No runs yet. Click <strong>Запустить SEO Автопилот</strong> above to start one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="control-center-jobs-table">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/5">
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium">Source</th>
                  <th className="py-2 px-2 font-medium">Started</th>
                  <th className="py-2 px-2 font-medium">Duration</th>
                  <th className="py-2 px-2 font-medium">AI</th>
                  <th className="py-2 px-2 font-medium">Validation</th>
                  <th className="py-2 px-2 font-medium">Draft / Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const src = humanSource(j.source);
                  return (
                    <tr key={j.id} className="border-b border-white/5 hover:bg-white/[0.02] align-top"
                        data-testid={`control-center-job-${j.id}`}>
                      <td className="py-2 px-2">
                        <Badge tone={statusTone(j.status)}>
                          {j.status === 'completed'   ? <CheckCircle2 size={11} className="inline -mt-0.5 mr-0.5"/> :
                           j.status === 'failed'      ? <XCircle      size={11} className="inline -mt-0.5 mr-0.5"/> :
                           <Loader2 size={11} className="inline -mt-0.5 mr-0.5 animate-spin"/>}
                          {j.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2"><Badge tone={src.tone}>{src.label}</Badge></td>
                      <td className="py-2 px-2 text-white/70 text-xs whitespace-nowrap">
                        {new Date(j.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-white/70 text-xs">{humanDuration(j.duration_ms)}</td>
                      <td className="py-2 px-2 text-white/60 text-xs whitespace-nowrap" data-testid={`control-center-job-${j.id}-ai`}>
                        {j.llm_provider && j.llm_model ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-brand-cyan">{j.llm_provider}</span>
                            <span className="text-white/40">/</span>
                            <span className="text-white/75">{j.llm_model.replace(/.*\//, '').replace(/-latest$/, '')}</span>
                            {j.llm_fallback_used && (
                              <span title="Fallback used" className="ml-1 text-amber-300/90 text-[10px] uppercase">fb</span>
                            )}
                          </span>
                        ) : j.n8n_status ? (
                          <span title="Legacy n8n bridge">n8n {j.n8n_status}</span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {j.validation_status === 'passed' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300 text-xs"><ShieldCheck size={11}/> passed</span>
                        ) : j.validation_status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 text-amber-300 text-xs"><AlertTriangle size={11}/> {j.validation_issue_count ?? 0}</span>
                        ) : (
                          <span className="text-white/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 max-w-md">
                        {j.draft_id && j.admin_url ? (
                          <Link to={j.admin_url}
                                className="text-brand-cyan hover:text-white text-xs inline-flex items-center gap-1"
                                data-testid={`control-center-job-${j.id}-open`}>
                            <Inbox size={11}/> {j.draft_id} <ChevronRight size={11}/>
                          </Link>
                        ) : j.error_message || j.error_code ? (
                          <JobErrorCell job={j}/>
                        ) : (
                          <span className="text-white/40 text-xs">…</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Architecture footer */}
      <Card>
        <h2 className="font-display text-base text-white mb-2">How this works</h2>
        <ol className="text-white/70 text-sm space-y-1 list-decimal list-inside">
          <li>Admin clicks <em>Запустить SEO Автопилот</em> or <em>Запустить одну</em> on a topic.</li>
          <li>Server POSTs to <code className="text-brand-cyan">/api/admin/seo-autopilot/run</code> (JWT-authenticated).</li>
          <li>{system?.direct_ai_enabled
              ? <>Multi-provider AI router writes RU + UZ articles. Heavy tasks run sequentially (concurrency=1) — no burst. Per-feature priority: Mistral → Gemini → Groq → Cerebras, with automatic fallback on 429/5xx. Typical run 15–60 s.</>
              : <>Server calls the n8n production webhook (sync await) and stores the RU+UZ package in the AI Draft Inbox.</>}
          </li>
          <li>The function validates the bundle and stores it in the AI Draft Inbox as <strong>pending_review</strong>.</li>
          <li>Open the draft → import each locale into the Blog Editor → click <em>Publish to GitHub</em> manually.</li>
        </ol>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone, testId }: { label: string; value: number; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; testId: string }) {
  const accent =
    tone === 'success' ? 'border-emerald-500/30' :
    tone === 'warning' ? 'border-amber-500/30' :
    tone === 'danger'  ? 'border-red-500/30' :
    tone === 'info'    ? 'border-brand-blue/30' :
                         'border-white/10';
  return (
    <div data-testid={testId} className={`bg-bg-surface border ${accent} rounded-2xl px-4 py-3`}>
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="font-display text-2xl text-white mt-0.5">{value}</div>
    </div>
  );
}

function JobErrorCell({ job }: { job: AutopilotJobRow }) {
  const [open, setOpen] = useState(false);
  const msg = job.error_message || 'Unknown failure';
  const code = job.error_code || 'error';
  const detail = job.error_detail || null;
  const issues = Array.isArray(detail?.issues) ? (detail!.issues as Array<{ path?: string; message?: string }>) : null;
  const perLocaleErrors = Array.isArray(detail?.per_locale_errors)
    ? (detail!.per_locale_errors as Array<{ locale?: string; error?: string }>)
    : null;
  const excerpt = typeof detail?.excerpt === 'string' ? detail.excerpt : null;
  const n8nExcerpt = typeof detail?.n8n_excerpt === 'string' ? detail.n8n_excerpt : null;
  const hasDetail = !!issues?.length || !!perLocaleErrors?.length || !!excerpt || !!n8nExcerpt;
  return (
    <div className="text-xs text-amber-300/90"
         data-testid={`control-center-job-${job.id}-error`}>
      <div className="flex items-start gap-1.5">
        <span className="font-mono text-amber-200/80 shrink-0">{code}:</span>
        <span className="break-words">{msg}</span>
      </div>
      {hasDetail && (
        <button
          type="button"
          className="text-brand-cyan/80 hover:text-brand-cyan text-[11px] mt-1 inline-flex items-center gap-1"
          onClick={() => setOpen((v) => !v)}
          data-testid={`control-center-job-${job.id}-error-toggle`}>
          {open ? '▾ hide details' : '▸ show details'}
        </button>
      )}
      {open && hasDetail && (
        <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-black/30 p-2"
             data-testid={`control-center-job-${job.id}-error-detail`}>
          {issues && issues.length > 0 && (
            <div>
              <div className="text-white/40 text-[10px] uppercase tracking-wider">Validation issues</div>
              <ul className="text-white/75 text-[11px] mt-1 space-y-0.5">
                {issues.slice(0, 12).map((it, i) => (
                  <li key={i}>
                    <code className="text-amber-200/80">{it.path || '·'}</code>
                    {' — '}{it.message || ''}
                  </li>
                ))}
                {issues.length > 12 && <li className="text-white/40">+{issues.length - 12} more</li>}
              </ul>
            </div>
          )}
          {perLocaleErrors && perLocaleErrors.length > 0 && (
            <div>
              <div className="text-white/40 text-[10px] uppercase tracking-wider">Per-locale errors</div>
              <ul className="text-white/75 text-[11px] mt-1 space-y-0.5">
                {perLocaleErrors.map((it, i) => (
                  <li key={i}><code className="text-amber-200/80">{it.locale || '?'}</code> — {it.error || ''}</li>
                ))}
              </ul>
            </div>
          )}
          {excerpt && (
            <div>
              <div className="text-white/40 text-[10px] uppercase tracking-wider">Upstream response excerpt</div>
              <pre className="text-white/65 text-[10px] mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all">{excerpt}</pre>
            </div>
          )}
          {n8nExcerpt && (
            <div>
              <div className="text-white/40 text-[10px] uppercase tracking-wider">n8n raw response</div>
              <pre className="text-white/65 text-[10px] mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all">{n8nExcerpt}</pre>
            </div>
          )}
          <div className="text-white/40 text-[10px]">
            job_id: <code>{job.id}</code>
          </div>
        </div>
      )}
    </div>
  );
}

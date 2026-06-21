// GPTBot Control Center — SEO Autopilot.
//
// Replaces the external Runable trigger. The owner clicks
// "Запустить SEO Автопилот" → POST /api/admin/seo-autopilot/run with the
// admin JWT → server-side n8n call → AI Draft Inbox.
//
// Also manages the cron schedule (disabled / weekly / twice_weekly) and
// shows the most recent runs with live polling for the active one.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, Select } from '../components/ui';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Clock, Inbox,
  Loader2, PlayCircle, RefreshCw, ShieldAlert, ShieldCheck, XCircle,
} from 'lucide-react';
import type { AutopilotJobRow, AutopilotJobStatus } from '../../shared/seo-autopilot';

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

interface SystemFlags {
  n8n_webhook_secret_configured: boolean;
  cron_secret_configured: boolean;
  drafts_db_configured: boolean;
  external_trigger_enabled: boolean;
}

export default function SeoAutopilotControlCenter() {
  const [jobs, setJobs] = useState<AutopilotJobRow[]>([]);
  const [system, setSystem] = useState<SystemFlags | null>(null);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('disabled');
  const [scheduleMeta, setScheduleMeta] = useState<{ updated_at?: string; updated_by?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadAll(); }, []);

  // Auto-poll while any job is non-terminal.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const running = jobs.find((j) => isActive(j.status));
    setActiveJobId(running ? running.id : null);

    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (running) {
      pollTimerRef.current = setInterval(() => { void loadAll(); }, 6000);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [jobs]);

  async function launch(): Promise<void> {
    setBusy(true); setErr(null); setToast(null);
    try {
      const r = await api.seoAutopilotLaunch({});
      setToast(`Launched. job_id=${r.job_id} — polling every 6 s.`);
      await loadAll();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
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

  const preflightOk = system?.n8n_webhook_secret_configured && system?.drafts_db_configured;
  const launchDisabled = busy || !preflightOk;

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
            Launches the existing n8n generation engine and stores the RU/UZ
            article package in the AI Draft Inbox. Drafts stay unpublished
            until you click <strong>Publish to GitHub</strong> in the Blog
            Editor.
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
                {!system.n8n_webhook_secret_configured && (
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

      {err && <Card className="border-red-500/30 bg-red-500/5"><div className="text-red-300 text-sm" data-testid="control-center-error">{err}</div></Card>}
      {toast && <Card className="border-emerald-500/30 bg-emerald-500/5"><div className="text-emerald-300 text-sm" data-testid="control-center-toast">{toast}</div></Card>}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Launch card */}
        <Card className="lg:col-span-2">
          <h2 className="font-display text-lg text-white mb-3">Manual run</h2>
          <p className="text-white/60 text-sm mb-5">
            Click below to start one SEO Autopilot run now. The browser never
            touches the n8n secret — the server calls n8n with the
            <code className="text-brand-cyan mx-1">N8N_WEBHOOK_SECRET</code>
            stored in Cloudflare.
          </p>
          <div className="flex gap-2 flex-wrap">
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
            {activeJobId && (
              <span className="text-white/60 text-xs inline-flex items-center gap-1.5" data-testid="control-center-active">
                <Loader2 size={12} className="animate-spin"/>
                {activeJobId} in flight — polling every 6 s
              </span>
            )}
          </div>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Recent runs"      value={stats.total}    tone="neutral" testId="kpi-total"/>
        <Kpi label="In flight"        value={stats.running}  tone={stats.running ? 'info' : 'neutral'} testId="kpi-running"/>
        <Kpi label="Completed"        value={stats.completed} tone="success" testId="kpi-completed"/>
        <Kpi label="Failed"           value={stats.failed}   tone={stats.failed ? 'danger' : 'neutral'} testId="kpi-failed"/>
      </div>

      {/* Recent runs */}
      <Card>
        <h2 className="font-display text-lg text-white mb-3 flex items-center gap-2">
          <Clock size={16}/> Recent runs
        </h2>
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
                  <th className="py-2 px-2 font-medium">n8n</th>
                  <th className="py-2 px-2 font-medium">Validation</th>
                  <th className="py-2 px-2 font-medium">Draft / Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const src = humanSource(j.source);
                  return (
                    <tr key={j.id} className="border-b border-white/5 hover:bg-white/[0.02]"
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
                      <td className="py-2 px-2 text-white/60 text-xs">
                        {j.n8n_status ?? <span className="text-white/30">—</span>}
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
                      <td className="py-2 px-2">
                        {j.draft_id && j.admin_url ? (
                          <Link to={j.admin_url}
                                className="text-brand-cyan hover:text-white text-xs inline-flex items-center gap-1"
                                data-testid={`control-center-job-${j.id}-open`}>
                            <Inbox size={11}/> {j.draft_id} <ChevronRight size={11}/>
                          </Link>
                        ) : j.error_message ? (
                          <span className="text-amber-300/90 text-xs"
                                title={j.error_message}>
                            {j.error_code || 'error'}: {j.error_message.slice(0, 70)}{j.error_message.length > 70 ? '…' : ''}
                          </span>
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
          <li>Admin clicks <em>Запустить SEO Автопилот</em>.</li>
          <li>Server POSTs to <code className="text-brand-cyan">POST /api/admin/seo-autopilot/run</code> (JWT-authenticated).</li>
          <li>Server calls the n8n production webhook with <code className="text-white/70">x-runable-secret: N8N_WEBHOOK_SECRET</code> (browser never sees it).</li>
          <li>n8n generates RU + UZ articles; bridge stores the package in AI Draft Inbox.</li>
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

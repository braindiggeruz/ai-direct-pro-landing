// GPTBot Admin — SEO Mission Control (formerly "Cockpit").
//
// Single-page operator dashboard:
//   1. Next Best Actions (top, ranked)
//   2. KPI tiles with click-through to queues
//   3. Health strip (live probes + integration status)
//   4. Section panels — each renders independently, errors don't blank the page
//
// All data comes from one /api/admin/cockpit call which returns a
// partial-success envelope: each section reports its own ok/error.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card } from '../components/ui';
import {
  AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight, Clock, Inbox,
  Loader2, PlayCircle, RefreshCw, ShieldCheck, XCircle,
  Activity, FileText, ListChecks, Zap,
} from 'lucide-react';
import type { CockpitResponse, CockpitSection } from '../../shared/cockpit';
import type { NextBestAction } from '../../shared/next-actions';

type ApiError = Error & { code?: string; requestId?: string; endpoint?: string; retryable?: boolean; status?: number };

function riskTone(r: NextBestAction['risk']): 'success' | 'warning' | 'danger' {
  return r === 'low' ? 'success' : r === 'medium' ? 'warning' : 'danger';
}

function HealthRow({ ok, label, detail }: { ok: boolean | undefined; label: string; detail?: string }) {
  const okv = ok ?? undefined;
  const cls = okv === undefined
    ? 'border-white/10 bg-white/[0.02]'
    : okv ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5';
  return (
    <div
      data-testid={`health-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      className={`flex items-center justify-between rounded-lg px-3 py-2 border ${cls}`}
    >
      <div className="flex items-center gap-2">
        {okv === undefined
          ? <Clock size={14} className="text-white/40" />
          : okv ? <CheckCircle2 size={14} className="text-emerald-300" />
                : <XCircle size={14} className="text-red-300" />}
        <span className={okv === false ? 'text-red-200' : 'text-white/85'}>{label}</span>
      </div>
      {detail && <span className="text-xs text-white/50">{detail}</span>}
    </div>
  );
}

function SectionError({ section, error, onRetry }: {
  section: string;
  error: { code: string; message: string };
  onRetry: () => void;
}) {
  return (
    <div
      data-testid={`section-error-${section}`}
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="text-amber-300 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-amber-200 text-sm font-medium">
            "{section}" failed to load
          </div>
          <div className="text-white/65 text-xs mt-0.5 break-words">
            <code className="text-amber-200">{error.code}</code> · {error.message}
          </div>
        </div>
        <button
          className="text-white/60 hover:text-white text-xs inline-flex items-center gap-1"
          onClick={onRetry}
          data-testid={`section-error-${section}-retry`}
        >
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, hint, to, testId }: {
  label: string;
  value: string | number;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  hint?: string;
  to?: string;
  testId: string;
}) {
  const accent =
    tone === 'success' ? 'border-emerald-500/30' :
    tone === 'warning' ? 'border-amber-500/30' :
    tone === 'danger' ? 'border-red-500/30' :
    tone === 'info' ? 'border-brand-blue/30' :
    'border-white/10';
  const content = (
    <div
      data-testid={testId}
      className={`bg-bg-surface border ${accent} rounded-2xl p-4 hover:border-white/20 transition`}
    >
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="font-display text-2xl text-white mt-1">{value}</div>
      {hint && <div className="text-white/40 text-[11px] mt-0.5">{hint}</div>}
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function Cockpit() {
  const [data, setData] = useState<CockpitResponse | null>(null);
  const [topLevelError, setTopLevelError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (initial = false): Promise<void> => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setTopLevelError(null);
    try {
      const r = await api.cockpit();
      setData(r);
    } catch (e) {
      setTopLevelError(e as ApiError);
    } finally {
      if (initial) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { void load(true); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const audit  = data?.audit;
  const drafts = data?.drafts;
  const ap     = data?.autopilot;
  const health = data?.health;
  const sys    = data?.system;
  const nba    = data?.next_best_actions || [];

  const integrationStrip = useMemo(() => {
    if (!sys) return [];
    return [
      { ok: sys.github_token_configured, label: 'GitHub PAT' },
      { ok: sys.jwt_secret_configured,    label: 'JWT secret' },
      { ok: sys.drafts_db_configured,     label: 'D1 (drafts)' },
      { ok: sys.n8n_webhook_secret_configured, label: 'n8n webhook' },
      { ok: !!sys.openrouter_configured,  label: 'OpenRouter' },
      { ok: !!sys.serper_configured,      label: 'Serper' },
      { ok: !!sys.gemini_configured,      label: 'Gemini (opt)' },
    ];
  }, [sys]);

  if (loading) {
    return (
      <div className="p-6 sm:p-8 space-y-6" data-testid="cockpit-loading">
        <div className="text-xs uppercase tracking-widest text-white/40">Dashboard</div>
        <h1 className="font-display text-3xl text-white">SEO Mission Control</h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-bg-surface border border-white/10 rounded-2xl p-4 animate-pulse">
              <div className="h-2 w-16 bg-white/10 rounded" />
              <div className="h-7 w-12 bg-white/10 rounded mt-3" />
            </div>
          ))}
        </div>
        <div className="text-white/40 text-sm">Loading cockpit…</div>
      </div>
    );
  }

  // Top-level failure means the WHOLE endpoint threw (auth, JWT, or
  // unexpected runtime crash). Show actionable error + Retry. The rest
  // of the admin (sidebar nav, other pages) remains usable.
  if (topLevelError && !data) {
    const e = topLevelError;
    return (
      <div className="p-6 sm:p-8" data-testid="cockpit-fatal">
        <header className="mb-4">
          <div className="text-xs uppercase tracking-widest text-white/40">Dashboard</div>
          <h1 className="font-display text-3xl text-white mt-1">SEO Mission Control</h1>
        </header>
        <Card className="border-red-500/40 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertOctagon size={20} className="text-red-300 mt-0.5" />
            <div className="flex-1">
              <div className="text-red-200 font-medium" data-testid="cockpit-fatal-message">
                Cockpit data could not load
              </div>
              <div className="text-white/80 text-sm mt-2">{e.message}</div>
              <div className="text-white/40 text-xs mt-2 font-mono">
                {e.code && <>code: <span className="text-white/60">{e.code}</span> · </>}
                {e.requestId && <>request_id: <span className="text-white/60">{e.requestId}</span> · </>}
                {e.endpoint && <>endpoint: <span className="text-white/60">{e.endpoint}</span> · </>}
                {e.status && <>http: <span className="text-white/60">{e.status}</span></>}
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="primary" size="sm" onClick={() => void load(true)} data-testid="cockpit-fatal-retry">
                  <RefreshCw size={14} /> Retry
                </Button>
                <Link to="/admin-tools/seo-autopilot">
                  <Button variant="secondary" size="sm" data-testid="cockpit-fatal-autopilot">Open SEO Autopilot</Button>
                </Link>
                <Link to="/admin-tools/ai-drafts">
                  <Button variant="ghost" size="sm" data-testid="cockpit-fatal-drafts">Open AI Draft Inbox</Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="cockpit-page">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40 flex items-center gap-2">
            <Activity size={11}/> SEO Mission Control
          </div>
          <h1 className="font-display text-3xl text-white mt-1">Dashboard</h1>
          <p className="text-white/55 text-sm mt-1">
            Live status across pages, blog, AI Draft Inbox and SEO Autopilot.
            Drafts stay unpublished until you click <strong>Publish to GitHub</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs text-white/40">
            updated {new Date(data.generated_at).toLocaleTimeString()}
            <span className="ml-2 font-mono text-white/30">{data.request_id}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load(false)} disabled={refreshing} data-testid="cockpit-refresh">
            {refreshing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} Refresh
          </Button>
        </div>
      </header>

      {/* ─── Next Best Actions ──────────────────────────────────────── */}
      <Card data-testid="next-best-actions">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-brand-cyan"/>
            <h2 className="font-display text-lg text-white">Next Best Actions</h2>
            <span className="text-xs text-white/40">({nba.length})</span>
          </div>
          {nba.length === 0 && (
            <span className="text-emerald-300 text-xs inline-flex items-center gap-1">
              <ShieldCheck size={12}/> Nothing urgent — admin is clean.
            </span>
          )}
        </div>
        {nba.length === 0 ? (
          <div className="text-white/50 text-sm" data-testid="nba-empty">
            All SEO health checks pass and the Inbox is empty. Run SEO Autopilot to generate a fresh draft.
          </div>
        ) : (
          <div className="space-y-2">
            {nba.map((a) => (
              <div
                key={a.id}
                data-testid={`nba-${a.id}`}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition px-3 py-3"
              >
                <div className="mt-0.5">
                  <Badge tone={riskTone(a.risk)}>{a.risk}</Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium" data-testid={`nba-${a.id}-title`}>{a.title}</div>
                  <div className="text-white/60 text-xs mt-1" data-testid={`nba-${a.id}-reason`}>{a.reason}</div>
                  <div className="text-emerald-300/80 text-[11px] mt-1.5" data-testid={`nba-${a.id}-effect`}>
                    <span className="text-white/40 mr-1">Expected effect:</span>
                    {a.effect}
                  </div>
                </div>
                <Link to={a.action_path} data-testid={`nba-${a.id}-action`}>
                  <Button variant="secondary" size="sm">
                    {a.action_label} <ChevronRight size={14}/>
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── KPI tiles ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {audit?.ok && audit.data ? (
          <>
            <Kpi testId="kpi-published-pages" label="Published pages" value={audit.data.publishedPages} tone="success" to="/admin-tools/pages"/>
            <Kpi testId="kpi-published-blog" label="Published blog" value={audit.data.publishedBlog ?? 0} tone="success" to="/admin-tools/blog"/>
            <Kpi testId="kpi-in-sitemap" label="In sitemap" value={(audit.data.pagesInSitemap ?? 0) + (audit.data.blogInSitemap ?? 0)} tone="info"/>
            <Kpi testId="kpi-orphan" label="Orphan pages" value={audit.data.orphanPages} tone={audit.data.orphanPages > 0 ? 'warning' : 'neutral'} to="/admin-tools/internal-links"/>
            <Kpi testId="kpi-broken-links" label="Broken links" value={audit.data.brokenInternalLinks} tone={audit.data.brokenInternalLinks > 0 ? 'danger' : 'neutral'} to="/admin-tools/internal-links"/>
            <Kpi testId="kpi-mojibake" label="Mojibake" value={audit.data.mojibakePages ?? 0} tone={(audit.data.mojibakePages ?? 0) > 0 ? 'danger' : 'neutral'} to="/admin-tools/pages"/>
          </>
        ) : (
          <Kpi testId="kpi-audit-failed" label="Audit" value="—" tone="warning" hint="failed to load"/>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {drafts?.ok && drafts.data ? (
          <>
            <Kpi testId="kpi-pending-drafts" label="Pending drafts" value={drafts.data.pending_review} tone={drafts.data.pending_review > 0 ? 'info' : 'neutral'} to="/admin-tools/ai-drafts"/>
            <Kpi testId="kpi-needs-revision" label="Needs revision" value={drafts.data.needs_revision} tone={drafts.data.needs_revision > 0 ? 'warning' : 'neutral'} to="/admin-tools/ai-drafts"/>
          </>
        ) : <Kpi testId="kpi-drafts-fail" label="Drafts" value="—" tone="warning"/>}
        {ap?.ok && ap.data ? (
          <>
            <Kpi testId="kpi-autopilot-in-flight" label="Autopilot in flight" value={ap.data.in_flight} tone={ap.data.in_flight > 0 ? 'info' : 'neutral'} to="/admin-tools/seo-autopilot"/>
            <Kpi testId="kpi-autopilot-failed" label="Autopilot failed" value={ap.data.failed} tone={ap.data.failed > 0 ? 'warning' : 'neutral'} to="/admin-tools/seo-autopilot"/>
          </>
        ) : <Kpi testId="kpi-autopilot-fail" label="Autopilot" value="—" tone="warning"/>}
      </div>

      {/* ─── Integration / Health strip ─────────────────────────────── */}
      <Card data-testid="cockpit-health-strip">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ListChecks size={16} className="text-brand-cyan"/>
            <h2 className="font-display text-lg text-white">System health</h2>
            {health?.data?.probedAt && (
              <span className="text-xs text-white/40">probed {new Date(health.data.probedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </div>
        {!health?.ok && health?.error && (
          <SectionError section="health" error={health.error} onRetry={() => void load(false)} />
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2" data-testid="health-grid">
          <HealthRow ok={health?.data?.sitemap200Xml} label="Sitemap 200 (XML)" detail={health?.data ? `HTTP ${health.data.sitemapStatus}` : undefined} />
          <HealthRow ok={health?.data?.robots200} label="Robots.txt 200" detail={health?.data ? `HTTP ${health.data.robotsStatus}` : undefined} />
          <HealthRow ok={health?.data?.randomUrl404} label="Random URL → 404" detail={health?.data ? `HTTP ${health.data.randomUrlStatus}` : undefined} />
          <HealthRow ok={health?.data?.adminNoindex} label="/admin-tools/ noindex" detail={health?.data ? `HTTP ${health.data.adminStatus}` : undefined} />
          <HealthRow ok={health?.data?.faviconLive} label="Favicon" detail={health?.data ? `HTTP ${health.data.faviconStatus}` : undefined} />
          <HealthRow ok={health?.data?.sampleImageLive} label="Sample blog image" detail={health?.data ? `HTTP ${health.data.sampleImageStatus}` : undefined} />
          {audit?.data && (
            <>
              <HealthRow ok={(audit.data.missingTitle ?? 0) === 0} label="Titles complete" detail={`${audit.data.missingTitle} missing`} />
              <HealthRow ok={(audit.data.missingDescription ?? 0) === 0} label="Descriptions complete" detail={`${audit.data.missingDescription} missing`} />
              <HealthRow ok={(audit.data.duplicateTitle ?? 0) === 0} label="Unique titles" detail={`${audit.data.duplicateTitle} dup`} />
              <HealthRow ok={(audit.data.ruUzPairsMissing ?? 0) === 0} label="RU↔UZ pairs" detail={`${audit.data.ruUzPairsOk}/${audit.data.ruUzPairsOk + audit.data.ruUzPairsMissing}`} />
              <HealthRow ok={(audit.data.missingJsonLd ?? 0) === 0} label="JSON-LD schema" detail={`${audit.data.missingJsonLd} missing`} />
              <HealthRow ok={(audit.data.missingFaq ?? 0) === 0} label="FAQ blocks" detail={`${audit.data.missingFaq} missing`} />
            </>
          )}
        </div>
        <div className="text-xs text-white/40 mt-4">
          <strong className="text-white/60 font-normal">Integrations:</strong>{' '}
          {integrationStrip.map((i, idx) => (
            <span key={i.label} className="inline-flex items-center gap-1 mr-3">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${i.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {i.label}{idx < integrationStrip.length - 1 ? '' : ''}
            </span>
          ))}
        </div>
      </Card>

      {/* ─── Drafts + Autopilot row ─────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <DraftsPanel section={drafts} onRetry={() => void load(false)} />
        <AutopilotPanel section={ap} onRetry={() => void load(false)} />
      </div>

      {/* ─── Per-page table ─────────────────────────────────────────── */}
      <Card data-testid="cockpit-pages-table-card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-brand-cyan"/>
            <h2 className="font-display text-lg text-white">All pages</h2>
          </div>
          <Link to="/admin-tools/pages">
            <Button variant="ghost" size="sm">Manage →</Button>
          </Link>
        </div>
        {!audit?.ok && audit?.error ? (
          <SectionError section="audit" error={audit.error} onRetry={() => void load(false)} />
        ) : audit?.data?.pages.length === 0 ? (
          <div className="text-white/50 text-sm">No pages yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cockpit-pages-table">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/5">
                  <th className="py-2 px-2 font-medium">URL</th>
                  <th className="py-2 px-2 font-medium">Type</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium">Score</th>
                  <th className="py-2 px-2 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody>
                {(audit?.data?.pages || []).slice(0, 25).map((p) => {
                  const errors = p.issues.filter((i) => i.level === 'error').length;
                  const warnings = p.issues.filter((i) => i.level === 'warning').length;
                  const slug = p.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '');
                  return (
                    <tr key={p.url} className="border-b border-white/5 hover:bg-white/[0.02]" data-testid={`cockpit-row-${p.url}`}>
                      <td className="py-2 px-2">
                        <Link to={`/admin-tools/pages/${p.locale}/${slug}`} className="text-brand-cyan hover:underline">{p.url}</Link>
                      </td>
                      <td className="py-2 px-2 text-white/60">{p.pageType}</td>
                      <td className="py-2 px-2">
                        <Badge tone={p.status === 'published' ? 'success' : p.status === 'noindex' ? 'warning' : 'neutral'}>{p.status}</Badge>
                      </td>
                      <td className="py-2 px-2 font-mono text-white/70">{p.score}</td>
                      <td className="py-2 px-2 text-white/60">
                        {errors > 0 && <span className="text-red-300 mr-2">{errors}E</span>}
                        {warnings > 0 && <span className="text-amber-300">{warnings}W</span>}
                        {p.issues.length === 0 && <span className="text-emerald-300">✓</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {audit?.data?.pages && audit.data.pages.length > 25 && (
              <div className="text-white/40 text-xs mt-2">
                Showing 25 of {audit.data.pages.length}. <Link to="/admin-tools/pages" className="text-brand-cyan hover:underline">Manage all →</Link>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Drafts panel ────────────────────────────────────────────────────

function DraftsPanel({ section, onRetry }: { section?: CockpitSection<import('../../shared/cockpit').CockpitDrafts>; onRetry: () => void }) {
  return (
    <Card data-testid="cockpit-drafts-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Inbox size={16} className="text-brand-cyan"/>
          <h2 className="font-display text-lg text-white">AI Draft Inbox</h2>
        </div>
        <div className="flex gap-2">
          <Link to="/admin-tools/seo-autopilot">
            <Button variant="primary" size="sm" data-testid="drafts-panel-run-autopilot">
              <PlayCircle size={14}/> Run SEO Autopilot
            </Button>
          </Link>
          <Link to="/admin-tools/ai-drafts">
            <Button variant="ghost" size="sm" data-testid="drafts-panel-open">Open inbox →</Button>
          </Link>
        </div>
      </div>
      {!section?.ok && section?.error ? (
        <SectionError section="drafts" error={section.error} onRetry={onRetry} />
      ) : section?.data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <div className="rounded-xl border border-brand-blue/30 bg-brand-blue/5 py-2" data-testid="drafts-panel-pending">
              <div className="font-display text-xl text-white">{section.data.pending_review}</div>
              <div className="text-white/55 text-[11px]">Pending</div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 py-2" data-testid="drafts-panel-needs-revision">
              <div className="font-display text-xl text-white">{section.data.needs_revision}</div>
              <div className="text-white/55 text-[11px]">Needs revision</div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 py-2" data-testid="drafts-panel-imported">
              <div className="font-display text-xl text-white">{section.data.imported}</div>
              <div className="text-white/55 text-[11px]">Imported</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 py-2" data-testid="drafts-panel-rejected">
              <div className="font-display text-xl text-white">{section.data.rejected}</div>
              <div className="text-white/55 text-[11px]">Rejected</div>
            </div>
          </div>
          {section.data.last_pending_admin_url && section.data.last_pending_title && (
            <Link
              to={section.data.last_pending_admin_url}
              className="block rounded-xl border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 hover:bg-brand-blue/10 transition"
              data-testid="drafts-panel-last-pending"
            >
              <div className="text-white/60 text-[11px] uppercase tracking-wide">Latest pending</div>
              <div className="text-white font-medium text-sm mt-0.5 line-clamp-2">{section.data.last_pending_title}</div>
              <div className="text-brand-cyan text-xs mt-1 inline-flex items-center gap-1">
                Open draft <ChevronRight size={12}/>
              </div>
            </Link>
          )}
          {section.data.pending_review === 0 && section.data.needs_revision === 0 && (
            <div className="text-white/40 text-xs text-center py-2" data-testid="drafts-panel-empty">
              Inbox is empty. Click "Run SEO Autopilot" to generate a draft.
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

// ─── Autopilot panel ─────────────────────────────────────────────────

function AutopilotPanel({ section, onRetry }: { section?: CockpitSection<import('../../shared/cockpit').CockpitAutopilot>; onRetry: () => void }) {
  return (
    <Card data-testid="cockpit-autopilot-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PlayCircle size={16} className="text-brand-cyan"/>
          <h2 className="font-display text-lg text-white">SEO Autopilot</h2>
        </div>
        <Link to="/admin-tools/seo-autopilot">
          <Button variant="ghost" size="sm" data-testid="autopilot-panel-open">Open →</Button>
        </Link>
      </div>
      {!section?.ok && section?.error ? (
        <SectionError section="autopilot" error={section.error} onRetry={onRetry} />
      ) : section?.data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl border border-brand-blue/30 bg-brand-blue/5 py-2" data-testid="autopilot-panel-in-flight">
              <div className="font-display text-xl text-white">{section.data.in_flight}</div>
              <div className="text-white/55 text-[11px]">In flight</div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 py-2" data-testid="autopilot-panel-completed">
              <div className="font-display text-xl text-white">{section.data.completed}</div>
              <div className="text-white/55 text-[11px]">Completed</div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 py-2" data-testid="autopilot-panel-failed">
              <div className="font-display text-xl text-white">{section.data.failed}</div>
              <div className="text-white/55 text-[11px]">Failed</div>
            </div>
          </div>
          {section.data.last_completed && (
            <Link
              to={section.data.last_completed.admin_url || '/admin-tools/ai-drafts'}
              className="block rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 hover:bg-emerald-500/10 transition"
              data-testid="autopilot-panel-last-completed"
            >
              <div className="text-emerald-300 text-[11px] uppercase tracking-wide">Last successful run</div>
              <div className="text-white text-sm mt-0.5 font-mono">{section.data.last_completed.draft_id || section.data.last_completed.id}</div>
              <div className="text-white/55 text-[11px] mt-0.5">
                {section.data.last_completed.finished_at && new Date(section.data.last_completed.finished_at).toLocaleString()}
              </div>
            </Link>
          )}
          {section.data.last_failed && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2" data-testid="autopilot-panel-last-failed">
              <div className="text-amber-300 text-[11px] uppercase tracking-wide">Last failed run</div>
              <div className="text-white text-sm mt-0.5 break-words">
                <code className="text-amber-200">{section.data.last_failed.error_code || 'error'}</code>:
                {' '}
                {section.data.last_failed.error_message?.slice(0, 110) || 'see job detail'}
              </div>
            </div>
          )}
          <div className="text-white/40 text-xs flex items-center gap-2 flex-wrap">
            Schedule: <Badge tone={section.data.schedule_mode === 'disabled' ? 'neutral' : 'success'}>{section.data.schedule_mode.replace('_', ' ')}</Badge>
            {section.data.stale_swept > 0 && (
              <span className="text-amber-300" data-testid="autopilot-panel-stale-swept">
                · auto-recovered {section.data.stale_swept} stale
              </span>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

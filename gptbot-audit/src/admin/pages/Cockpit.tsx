// GPTBot Admin — SEO Mission Control (SEO-пульт).
//
// Полностью локализованный SPA-экран. Все строки берутся из i18n/ru.ts
// — компонент не содержит хардкода английского.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card } from '../components/ui';
import { OctagonAlert as AlertOctagon, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, ChevronRight, Clock, Inbox, Loader as Loader2, CirclePlay as PlayCircle, RefreshCw, ShieldCheck, Circle as XCircle, Activity, FileText, ListChecks, Zap } from 'lucide-react';
import type { CockpitResponse, CockpitSection, CockpitGitHubHealth } from '../../shared/cockpit';
import type { NextBestAction } from '../../shared/next-actions';
import { useT, localiseError } from '../i18n';

type ApiError = Error & { code?: string; requestId?: string; endpoint?: string; retryable?: boolean; status?: number };

function riskTone(r: NextBestAction['risk']): 'success' | 'warning' | 'danger' {
  return r === 'low' ? 'success' : r === 'medium' ? 'warning' : 'danger';
}

function HealthRow({ ok, label, detail, testIdSuffix }: { ok: boolean | undefined; label: string; detail?: string; testIdSuffix?: string }) {
  const okv = ok ?? undefined;
  const cls = okv === undefined
    ? 'border-white/10 bg-white/[0.02]'
    : okv ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5';
  return (
    <div
      data-testid={`health-${(testIdSuffix || label).toLowerCase().replace(/[^a-z0-9а-я]+/g, '-')}`}
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

function SectionError({ section, sectionTitle, error, onRetry }: {
  section: string;
  sectionTitle: string;
  error: { code: string; message: string };
  onRetry: () => void;
}) {
  const { t } = useT();
  const friendly = localiseError(error.code);
  return (
    <div
      data-testid={`section-error-${section}`}
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-300 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-amber-200 font-medium" data-testid={`section-error-${section}-title`}>
            {sectionTitle}
          </div>
          <div className="text-white/75 text-sm mt-1" data-testid={`section-error-${section}-body`}>
            {friendly.description}
          </div>
          <details className="mt-2">
            <summary className="text-white/45 text-xs cursor-pointer hover:text-white/80" data-testid={`section-error-${section}-toggle`}>
              {t.common.technical_detail}
            </summary>
            <div className="mt-2 text-white/55 text-[11px] font-mono break-words">
              <div>{t.common.code}: <span className="text-amber-200">{error.code}</span></div>
              <div className="mt-0.5">{error.message}</div>
            </div>
          </details>
        </div>
        <button
          className="text-white/75 hover:text-white text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/15 hover:bg-white/5"
          onClick={onRetry}
          data-testid={`section-error-${section}-retry`}
        >
          <RefreshCw size={12} /> {t.common.retry}
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
    tone === 'danger'  ? 'border-red-500/30' :
    tone === 'info'    ? 'border-brand-blue/30' :
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
  const { t, tpl } = useT();
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
  const gh     = data?.github_health;
  const nba    = data?.next_best_actions || [];

  const integrationStrip = useMemo(() => {
    if (!sys || !gh) return [];
    const ghLevelTone = gh.ok ? 'ok' : (gh.level === 'limited' ? 'warn' : 'fail');
    return [
      { tone: ghLevelTone, label: `${t.cockpit.health.github_label} · ${gh.owner}/${gh.repo}@${gh.branch}` },
      { tone: sys.jwt_secret_configured ? 'ok' : 'fail',    label: t.cockpit.health.jwt_label },
      { tone: sys.drafts_db_configured ? 'ok' : 'fail',     label: t.cockpit.health.d1_label },
      { tone: sys.n8n_webhook_secret_configured ? 'ok' : 'fail', label: t.cockpit.health.n8n_label },
      { tone: sys.openrouter_configured ? 'ok' : 'fail',    label: t.cockpit.health.openrouter_label },
      { tone: sys.serper_configured ? 'ok' : 'fail',        label: t.cockpit.health.serper_label },
      { tone: sys.gemini_configured ? 'ok' : 'fail',        label: t.cockpit.health.gemini_label },
    ] as Array<{ tone: 'ok' | 'warn' | 'fail'; label: string }>;
  }, [sys, gh, t]);

  // ─── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 sm:p-8 space-y-6" data-testid="cockpit-loading">
        <div className="text-xs uppercase tracking-widest text-white/40">{t.cockpit.section_label}</div>
        <h1 className="font-display text-3xl text-white">{t.cockpit.title}</h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-bg-surface border border-white/10 rounded-2xl p-4 animate-pulse">
              <div className="h-2 w-16 bg-white/10 rounded" />
              <div className="h-7 w-12 bg-white/10 rounded mt-3" />
            </div>
          ))}
        </div>
        <div className="text-white/40 text-sm">{t.common.loading}</div>
      </div>
    );
  }

  // ─── Fatal (top-level) error ─────────────────────────────────────────
  if (topLevelError && !data) {
    const e = topLevelError;
    const friendly = localiseError(e.code, e.message);
    return (
      <div className="p-6 sm:p-8" data-testid="cockpit-fatal">
        <header className="mb-4">
          <div className="text-xs uppercase tracking-widest text-white/40">{t.cockpit.section_label}</div>
          <h1 className="font-display text-3xl text-white mt-1">{t.cockpit.title}</h1>
        </header>
        <Card className="border-red-500/40 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertOctagon size={20} className="text-red-300 mt-0.5" />
            <div className="flex-1">
              <div className="text-red-200 font-medium" data-testid="cockpit-fatal-title">
                {friendly.title}
              </div>
              <div className="text-white/85 text-sm mt-2" data-testid="cockpit-fatal-message">{friendly.description}</div>
              <details className="mt-2">
                <summary className="text-white/40 text-xs cursor-pointer hover:text-white/70">
                  {t.common.technical_detail}
                </summary>
                <div className="text-white/45 text-xs mt-2 font-mono">
                  {e.code && <div>{t.common.code}: <span className="text-white/70">{e.code}</span></div>}
                  {e.requestId && <div>{t.common.request_id}: <span className="text-white/70">{e.requestId}</span></div>}
                  {e.endpoint && <div>{t.common.endpoint}: <span className="text-white/70">{e.endpoint}</span></div>}
                  {e.status && <div>{t.common.http_status}: <span className="text-white/70">{e.status}</span></div>}
                  <div className="text-white/55 break-words mt-1">{e.message}</div>
                </div>
              </details>
              <div className="flex gap-2 mt-4 flex-wrap">
                <Button variant="primary" size="sm" onClick={() => void load(true)} data-testid="cockpit-fatal-retry">
                  <RefreshCw size={14} /> {t.common.retry}
                </Button>
                <Link to="/admin-tools/seo-autopilot">
                  <Button variant="secondary" size="sm" data-testid="cockpit-fatal-autopilot">{t.nav.seo_autopilot}</Button>
                </Link>
                <Link to="/admin-tools/ai-drafts">
                  <Button variant="ghost" size="sm" data-testid="cockpit-fatal-drafts">{t.nav.ai_drafts}</Button>
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
            <Activity size={11}/> {t.cockpit.section_label}
          </div>
          <h1 className="font-display text-3xl text-white mt-1">{t.cockpit.title}</h1>
          <p className="text-white/55 text-sm mt-1 max-w-3xl">
            {t.cockpit.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs text-white/40">
            {t.common.last_updated} {new Date(data.generated_at).toLocaleTimeString()}
            <span className="ml-2 font-mono text-white/30">{data.request_id}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load(false)} disabled={refreshing} data-testid="cockpit-refresh">
            {refreshing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            {refreshing ? t.common.refreshing : t.common.refresh}
          </Button>
        </div>
      </header>

      {/* ─── Next Best Actions ──────────────────────────────────────── */}
      <Card data-testid="next-best-actions">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-brand-cyan"/>
            <h2 className="font-display text-lg text-white">{t.cockpit.nba_title}</h2>
            <span className="text-xs text-white/40">({nba.length})</span>
          </div>
          {nba.length === 0 && (
            <span className="text-emerald-300 text-xs inline-flex items-center gap-1">
              <ShieldCheck size={12}/> {t.cockpit.nba_all_clean}
            </span>
          )}
        </div>
        {nba.length === 0 ? (
          <div className="text-white/50 text-sm" data-testid="nba-empty">
            {t.cockpit.nba_empty}
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
                  <Badge tone={riskTone(a.risk)}>{t.cockpit.risk[a.risk] || a.risk}</Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium" data-testid={`nba-${a.id}-title`}>{a.title}</div>
                  <div className="text-white/60 text-xs mt-1" data-testid={`nba-${a.id}-reason`}>{a.reason}</div>
                  <div className="text-emerald-300/80 text-[11px] mt-1.5" data-testid={`nba-${a.id}-effect`}>
                    <span className="text-white/40 mr-1">{t.common.expected_effect}:</span>
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

      {/* ─── KPI row 1: pages/blog/orphan/broken/mojibake ───────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {audit?.ok && audit.data ? (
          <>
            <Kpi testId="kpi-published-pages" label={t.cockpit.kpi.published_pages} value={audit.data.publishedPages} tone="success" to="/admin-tools/pages"/>
            <Kpi testId="kpi-published-blog"  label={t.cockpit.kpi.published_blog}  value={audit.data.publishedBlog ?? 0} tone="success" to="/admin-tools/blog"/>
            <Kpi testId="kpi-in-sitemap"      label={t.cockpit.kpi.in_sitemap}      value={(audit.data.pagesInSitemap ?? 0) + (audit.data.blogInSitemap ?? 0)} tone="info"/>
            <Kpi testId="kpi-orphan"          label={t.cockpit.kpi.orphan}          value={audit.data.orphanPages} tone={audit.data.orphanPages > 0 ? 'warning' : 'neutral'} to="/admin-tools/internal-links"/>
            <Kpi testId="kpi-broken-links"    label={t.cockpit.kpi.broken_links}    value={audit.data.brokenInternalLinks} tone={audit.data.brokenInternalLinks > 0 ? 'danger' : 'neutral'} to="/admin-tools/internal-links"/>
            <Kpi testId="kpi-mojibake"        label={t.cockpit.kpi.mojibake}        value={audit.data.mojibakePages ?? 0} tone={(audit.data.mojibakePages ?? 0) > 0 ? 'danger' : 'neutral'} to="/admin-tools/pages"/>
          </>
        ) : (
          <Kpi testId="kpi-audit-failed" label={t.cockpit.kpi.audit_failed} value="—" tone="warning" hint={t.cockpit.kpi.n_failed_to_load}/>
        )}
      </div>

      {/* ─── KPI row 2: drafts + autopilot (active failures only) ──── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {drafts?.ok && drafts.data ? (
          <>
            <Kpi testId="kpi-pending-drafts" label={t.cockpit.kpi.pending_drafts} value={drafts.data.pending_review} tone={drafts.data.pending_review > 0 ? 'info' : 'neutral'} to="/admin-tools/ai-drafts"/>
            <Kpi testId="kpi-needs-revision" label={t.cockpit.kpi.needs_revision} value={drafts.data.needs_revision} tone={drafts.data.needs_revision > 0 ? 'warning' : 'neutral'} to="/admin-tools/ai-drafts"/>
          </>
        ) : <Kpi testId="kpi-drafts-fail" label={t.cockpit.kpi.drafts_failed} value="—" tone="warning"/>}
        {ap?.ok && ap.data ? (
          <>
            <Kpi testId="kpi-autopilot-in-flight" label={t.cockpit.kpi.autopilot_inflight} value={ap.data.in_flight} tone={ap.data.in_flight > 0 ? 'info' : 'neutral'} to="/admin-tools/seo-autopilot"/>
            <Kpi
              testId="kpi-autopilot-active-failed"
              label={t.cockpit.kpi.autopilot_active_failed}
              value={ap.data.active_failed}
              tone={ap.data.active_failed > 0 ? 'danger' : 'neutral'}
              hint={ap.data.failed_total > 0
                ? `${ap.data.failed_24h} ${t.common.last_24h} · ${ap.data.failed_total} ${t.common.in_history}`
                : undefined}
              to="/admin-tools/seo-autopilot"/>
          </>
        ) : <Kpi testId="kpi-autopilot-fail" label={t.cockpit.kpi.autopilot_failed_section} value="—" tone="warning"/>}
      </div>

      {/* ─── Integration / Health strip ─────────────────────────────── */}
      <Card data-testid="cockpit-health-strip">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ListChecks size={16} className="text-brand-cyan"/>
            <h2 className="font-display text-lg text-white">{t.cockpit.health.title}</h2>
            {health?.data?.probedAt && (
              <span className="text-xs text-white/40">{t.cockpit.health.probed} {new Date(health.data.probedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </div>
        {!health?.ok && health?.error && (
          <SectionError section="health" sectionTitle={t.cockpit.error.section_health} error={health.error} onRetry={() => void load(false)} />
        )}

        {/* GitHub functional health (real probe) */}
        {gh && <GitHubHealthCard gh={gh} />}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2" data-testid="health-grid">
          <HealthRow ok={health?.data?.sitemap200Xml}  label={t.cockpit.health.sitemap_xml}     detail={health?.data ? `HTTP ${health.data.sitemapStatus}` : undefined} />
          <HealthRow ok={health?.data?.robots200}      label={t.cockpit.health.robots_txt}      detail={health?.data ? `HTTP ${health.data.robotsStatus}` : undefined} />
          <HealthRow ok={health?.data?.randomUrl404}   label={t.cockpit.health.random_404}      detail={health?.data ? `HTTP ${health.data.randomUrlStatus}` : undefined} testIdSuffix="random-404" />
          <HealthRow ok={health?.data?.adminNoindex}   label={t.cockpit.health.admin_noindex}   detail={health?.data ? `HTTP ${health.data.adminStatus}` : undefined} testIdSuffix="admin-noindex" />
          <HealthRow ok={health?.data?.faviconLive}    label={t.cockpit.health.favicon}         detail={health?.data ? `HTTP ${health.data.faviconStatus}` : undefined} />
          <HealthRow ok={health?.data?.sampleImageLive}label={t.cockpit.health.sample_image}    detail={health?.data ? `HTTP ${health.data.sampleImageStatus}` : undefined} />
          {audit?.data && (
            <>
              <HealthRow ok={(audit.data.missingTitle ?? 0) === 0}        label={t.cockpit.health.titles}        detail={tpl(t.cockpit.health.missing_n, { n: audit.data.missingTitle })} testIdSuffix="titles" />
              <HealthRow ok={(audit.data.missingDescription ?? 0) === 0}  label={t.cockpit.health.descriptions}  detail={tpl(t.cockpit.health.missing_n, { n: audit.data.missingDescription })} testIdSuffix="descriptions" />
              <HealthRow ok={(audit.data.duplicateTitle ?? 0) === 0}      label={t.cockpit.health.titles_unique} detail={tpl(t.cockpit.health.duplicates_n, { n: audit.data.duplicateTitle })} testIdSuffix="titles-unique" />
              <HealthRow ok={(audit.data.ruUzPairsMissing ?? 0) === 0}    label={t.cockpit.health.ru_uz_pairs}   detail={`${audit.data.ruUzPairsOk}/${audit.data.ruUzPairsOk + audit.data.ruUzPairsMissing}`} testIdSuffix="ru-uz" />
              <HealthRow ok={(audit.data.missingJsonLd ?? 0) === 0}       label={t.cockpit.health.jsonld}        detail={tpl(t.cockpit.health.missing_n, { n: audit.data.missingJsonLd })} testIdSuffix="jsonld" />
              <HealthRow ok={(audit.data.missingFaq ?? 0) === 0}          label={t.cockpit.health.faq}           detail={tpl(t.cockpit.health.missing_n, { n: audit.data.missingFaq })} testIdSuffix="faq" />
            </>
          )}
        </div>
        <div className="text-xs text-white/40 mt-4">
          <strong className="text-white/60 font-normal">{t.cockpit.health.integrations}:</strong>{' '}
          {integrationStrip.map((i) => (
            <span key={i.label} className="inline-flex items-center gap-1 mr-3" data-testid={`integration-${i.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${i.tone === 'ok' ? 'bg-emerald-400' : i.tone === 'warn' ? 'bg-amber-400' : 'bg-red-400'}`} />
              {i.label}
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
            <h2 className="font-display text-lg text-white">{t.cockpit.pages_table.title}</h2>
          </div>
          <Link to="/admin-tools/pages">
            <Button variant="ghost" size="sm">{t.cockpit.pages_table.manage} →</Button>
          </Link>
        </div>
        {!audit?.ok && audit?.error ? (
          <SectionError section="audit" sectionTitle={t.cockpit.error.section_audit} error={audit.error} onRetry={() => void load(false)} />
        ) : audit?.data?.pages.length === 0 ? (
          <div className="text-white/50 text-sm">{t.cockpit.pages_table.empty}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cockpit-pages-table">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/5">
                  <th className="py-2 px-2 font-medium">{t.cockpit.pages_table.url}</th>
                  <th className="py-2 px-2 font-medium">{t.cockpit.pages_table.type}</th>
                  <th className="py-2 px-2 font-medium">{t.cockpit.pages_table.status}</th>
                  <th className="py-2 px-2 font-medium">{t.cockpit.pages_table.score}</th>
                  <th className="py-2 px-2 font-medium">{t.cockpit.pages_table.issues}</th>
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
                        <Badge tone={p.status === 'published' ? 'success' : p.status === 'noindex' ? 'warning' : 'neutral'}>
                          {t.cockpit.status[p.status as keyof typeof t.cockpit.status] || p.status}
                        </Badge>
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
                {tpl(t.cockpit.pages_table.showing_of, { n: 25, total: audit.data.pages.length })}
                <Link to="/admin-tools/pages" className="text-brand-cyan hover:underline">{t.cockpit.pages_table.manage} →</Link>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── GitHub functional-health card ──────────────────────────────────

function GitHubHealthCard({ gh }: { gh: CockpitGitHubHealth }) {
  const { t } = useT();
  const levelLabel = gh.level === 'healthy'        ? t.cockpit.health.level_healthy
                   : gh.level === 'limited'        ? t.cockpit.health.level_limited
                   : gh.level === 'not_configured' ? t.cockpit.health.level_unconfigured
                   :                                 t.cockpit.health.level_failed;
  const tone = gh.level === 'healthy' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
             : gh.level === 'limited' ? 'border-amber-500/30 bg-amber-500/5 text-amber-200'
             :                          'border-red-500/30 bg-red-500/5 text-red-200';
  return (
    <div className={`mb-3 rounded-xl border ${tone} px-4 py-3`} data-testid="github-health-card">
      <div className="flex items-start gap-3">
        <div className="text-xs uppercase tracking-wide opacity-70 shrink-0 mt-1">{t.cockpit.health.github_label}</div>
        <div className="flex-1 text-sm">
          <div className="font-medium" data-testid="github-health-level">{levelLabel}</div>
          <div className="text-white/70 text-xs mt-1 font-mono">
            {t.cockpit.health.github_owner_repo}: {gh.owner}/{gh.repo} ·
            {' '}{t.cockpit.health.github_branch}: {gh.branch} ·
            {' '}{t.cockpit.health.github_sample}: {gh.details.sample_file || '—'}
            {gh.details.sample_bytes != null && ` (${gh.details.sample_bytes} B)`}
          </div>
          {gh.details.error && (
            <details className="mt-2">
              <summary className="text-white/55 text-xs cursor-pointer">{t.common.technical_detail}</summary>
              <div className="text-white/45 text-[11px] mt-1 font-mono break-words">{gh.details.error}</div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Drafts panel ────────────────────────────────────────────────────

function DraftsPanel({ section, onRetry }: { section?: CockpitSection<import('../../shared/cockpit').CockpitDrafts>; onRetry: () => void }) {
  const { t } = useT();
  return (
    <Card data-testid="cockpit-drafts-panel">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Inbox size={16} className="text-brand-cyan"/>
          <h2 className="font-display text-lg text-white">{t.cockpit.drafts_panel.title}</h2>
        </div>
        <div className="flex gap-2">
          <Link to="/admin-tools/seo-autopilot">
            <Button variant="primary" size="sm" data-testid="drafts-panel-run-autopilot">
              <PlayCircle size={14}/> {t.cockpit.drafts_panel.run_autopilot}
            </Button>
          </Link>
          <Link to="/admin-tools/ai-drafts">
            <Button variant="ghost" size="sm" data-testid="drafts-panel-open">{t.cockpit.drafts_panel.open_inbox} →</Button>
          </Link>
        </div>
      </div>
      {!section?.ok && section?.error ? (
        <SectionError section="drafts" sectionTitle={t.cockpit.error.section_drafts} error={section.error} onRetry={onRetry} />
      ) : section?.data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <div className="rounded-xl border border-brand-blue/30 bg-brand-blue/5 py-2" data-testid="drafts-panel-pending">
              <div className="font-display text-xl text-white">{section.data.pending_review}</div>
              <div className="text-white/55 text-[11px]">{t.cockpit.drafts_panel.pending}</div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 py-2" data-testid="drafts-panel-needs-revision">
              <div className="font-display text-xl text-white">{section.data.needs_revision}</div>
              <div className="text-white/55 text-[11px]">{t.cockpit.drafts_panel.needs_revision}</div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 py-2" data-testid="drafts-panel-imported">
              <div className="font-display text-xl text-white">{section.data.imported}</div>
              <div className="text-white/55 text-[11px]">{t.cockpit.drafts_panel.imported}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 py-2" data-testid="drafts-panel-rejected">
              <div className="font-display text-xl text-white">{section.data.rejected}</div>
              <div className="text-white/55 text-[11px]">{t.cockpit.drafts_panel.rejected}</div>
            </div>
          </div>
          {section.data.last_pending_admin_url && section.data.last_pending_title && (
            <Link
              to={section.data.last_pending_admin_url}
              className="block rounded-xl border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 hover:bg-brand-blue/10 transition"
              data-testid="drafts-panel-last-pending"
            >
              <div className="text-white/60 text-[11px] uppercase tracking-wide">{t.cockpit.drafts_panel.latest_pending}</div>
              <div className="text-white font-medium text-sm mt-0.5 line-clamp-2">{section.data.last_pending_title}</div>
              <div className="text-brand-cyan text-xs mt-1 inline-flex items-center gap-1">
                {t.cockpit.drafts_panel.open_draft} <ChevronRight size={12}/>
              </div>
            </Link>
          )}
          {section.data.pending_review === 0 && section.data.needs_revision === 0 && (
            <div className="text-white/40 text-xs text-center py-2" data-testid="drafts-panel-empty">
              {t.cockpit.drafts_panel.empty}
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

// ─── Autopilot panel ─────────────────────────────────────────────────

function AutopilotPanel({ section, onRetry }: { section?: CockpitSection<import('../../shared/cockpit').CockpitAutopilot>; onRetry: () => void }) {
  const { t, tpl } = useT();
  const scheduleLabel = (mode: string): string =>
    mode === 'weekly'      ? t.cockpit.autopilot_panel.schedule_weekly
    : mode === 'twice_weekly' ? t.cockpit.autopilot_panel.schedule_twice
    : t.cockpit.autopilot_panel.schedule_disabled;

  return (
    <Card data-testid="cockpit-autopilot-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PlayCircle size={16} className="text-brand-cyan"/>
          <h2 className="font-display text-lg text-white">{t.cockpit.autopilot_panel.title}</h2>
        </div>
        <Link to="/admin-tools/seo-autopilot">
          <Button variant="ghost" size="sm" data-testid="autopilot-panel-open">{t.cockpit.autopilot_panel.open} →</Button>
        </Link>
      </div>
      {!section?.ok && section?.error ? (
        <SectionError section="autopilot" sectionTitle={t.cockpit.error.section_autopilot} error={section.error} onRetry={onRetry} />
      ) : section?.data ? (
        <div className="space-y-3">
          {/* counters row: in_flight + completed + active_failed (not historical!) */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl border border-brand-blue/30 bg-brand-blue/5 py-2" data-testid="autopilot-panel-in-flight">
              <div className="font-display text-xl text-white">{section.data.in_flight}</div>
              <div className="text-white/55 text-[11px]">{t.cockpit.autopilot_panel.in_flight}</div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 py-2" data-testid="autopilot-panel-completed">
              <div className="font-display text-xl text-white">{section.data.completed}</div>
              <div className="text-white/55 text-[11px]">{t.cockpit.autopilot_panel.completed}</div>
            </div>
            <div className={`rounded-xl border py-2 ${section.data.active_failed > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`} data-testid="autopilot-panel-active-failed">
              <div className="font-display text-xl text-white">{section.data.active_failed}</div>
              <div className="text-white/55 text-[11px]">{t.cockpit.autopilot_panel.active_failed}</div>
            </div>
          </div>
          {/* historical bar */}
          {section.data.failed_total > 0 && (
            <div className="text-white/45 text-[11px] flex items-center gap-3 flex-wrap" data-testid="autopilot-panel-history">
              {section.data.active_failed === 0 && (
                <span className="text-emerald-300/90">
                  <CheckCircle2 size={11} className="inline -mt-0.5 mr-1"/>
                  {t.cockpit.autopilot_panel.no_active_failures}
                </span>
              )}
              <span>{t.cockpit.autopilot_panel.last_24h}: <span className="text-white/70">{section.data.failed_24h}</span></span>
              <span>{t.common.in_history}: <span className="text-white/70">{section.data.failed_total}</span></span>
            </div>
          )}
          {/* last success card */}
          {section.data.last_completed && (
            <Link
              to={section.data.last_completed.admin_url || '/admin-tools/ai-drafts'}
              className="block rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 hover:bg-emerald-500/10 transition"
              data-testid="autopilot-panel-last-completed"
            >
              <div className="text-emerald-300 text-[11px] uppercase tracking-wide">{t.cockpit.autopilot_panel.last_success}</div>
              <div className="text-white text-sm mt-0.5 font-mono">{section.data.last_completed.draft_id || section.data.last_completed.id}</div>
              <div className="text-white/55 text-[11px] mt-0.5">
                {section.data.last_completed.finished_at && new Date(section.data.last_completed.finished_at).toLocaleString()}
              </div>
            </Link>
          )}
          {/* last failure card (ONLY for active failures — historical hidden) */}
          {section.data.active_failed > 0 && section.data.last_failed && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2" data-testid="autopilot-panel-last-failed">
              <div className="text-red-300 text-[11px] uppercase tracking-wide">{t.cockpit.autopilot_panel.last_failed}</div>
              <div className="text-white text-sm mt-0.5 break-words">
                <code className="text-red-200">{section.data.last_failed.error_code || 'error'}</code>: {section.data.last_failed.error_message?.slice(0, 110) || ''}
              </div>
            </div>
          )}
          {/* schedule footer */}
          <div className="text-white/40 text-xs flex items-center gap-2 flex-wrap">
            {t.cockpit.autopilot_panel.schedule}:
            <Badge tone={section.data.schedule_mode === 'disabled' ? 'neutral' : 'success'}>
              {scheduleLabel(section.data.schedule_mode)}
            </Badge>
            {section.data.stale_swept > 0 && (
              <span className="text-amber-300" data-testid="autopilot-panel-stale-swept">
                · {tpl(t.cockpit.autopilot_panel.stale_swept, { n: section.data.stale_swept })}
              </span>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

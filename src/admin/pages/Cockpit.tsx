import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, StatTile, ScoreBadge, Badge, Button } from '../components/ui';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, RefreshCw, Eye, Pencil, XCircle, Inbox, PlayCircle } from 'lucide-react';

function HealthRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div data-testid={`seo-health-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className={`flex items-center justify-between rounded-lg px-3 py-2 border ${ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 size={14} className="text-emerald-300"/> : <XCircle size={14} className="text-red-300"/>}
        <span className={ok ? 'text-white/85' : 'text-red-200'}>{label}</span>
      </div>
      {detail && <span className="text-xs text-white/50">{detail}</span>}
    </div>
  );
}

type PageAudit = {
  url: string;
  locale: string;
  pageType: string;
  status: string;
  score: number;
  issues: { level: string; rule: string; message: string }[];
};
type Stats = {
  totalPages: number; publishedPages: number; draftPages: number; noindexPages: number;
  pagesInSitemap: number; missingTitle: number; missingDescription: number; missingH1: number;
  missingCanonical: number; missingJsonLd: number; duplicateTitle: number; duplicateDescription: number;
  orphanPages: number; brokenInternalLinks: number; missingFaq: number; missingHreflang: number;
  missingOg: number; ruUzPairsOk: number; ruUzPairsMissing: number; avgMoneyScore: number; avgBlogScore: number;
  mojibakePages?: number;
  pages: PageAudit[];
  // blog stats — added by /api/audit (additive, optional for back-compat)
  totalBlog?: number; publishedBlog?: number; blogInSitemap?: number;
  blogMissingFaq?: number; blogMissingTitle?: number; blogMissingDescription?: number;
  blogDuplicateTitle?: number;
  // live HTTP probes
  live?: {
    randomUrl404: boolean; randomUrlStatus: number;
    adminNoindex: boolean; adminStatus: number;
    sitemap200Xml: boolean; sitemapStatus: number;
    robots200: boolean; faviconLive: boolean; sampleImageLive: boolean;
    probedAt: string;
  };
};

type Mismatch = { level: 'error' | 'warning'; message: string; url?: string };

function buildMismatches(stats: Stats, fullPages: any[]): Mismatch[] {
  const out: Mismatch[] = [];
  const byUrl = new Map(fullPages.map((p) => [p.url, p]));
  for (const p of stats.pages) {
    const full = byUrl.get(p.url);
    if (!full) continue;
    const inSitemap = full.status === 'published' && full.robotsIndex !== false;
    // Draft with high score (publish-ready)
    if (full.status === 'draft' && p.score >= 80) {
      out.push({ level: 'warning', message: `Draft "${p.url}" has score ${p.score}/100 — ready to publish.`, url: p.url });
    }
    // Published but excluded from sitemap
    if (full.status === 'published' && !inSitemap) {
      out.push({ level: 'error', message: `"${p.url}" is published but robotsIndex=false → not in sitemap.`, url: p.url });
    }
    // Noindex but no body content
    if (full.status === 'noindex' && (full.bodyBlocks || []).length === 0) {
      out.push({ level: 'warning', message: `"${p.url}" is noindex with no body — consider deleting.`, url: p.url });
    }
    // Published but empty body / placeholder
    if (full.status === 'published' && (full.bodyBlocks || []).length === 0) {
      out.push({ level: 'error', message: `Published "${p.url}" has empty body — placeholder content live.`, url: p.url });
    }
    // No FAQ for money page that is published
    if (full.status === 'published' && full.pageType === 'money' && (full.faq || []).length < 4) {
      out.push({ level: 'warning', message: `Money page "${p.url}" has only ${(full.faq || []).length} FAQ items (recommended 4+).`, url: p.url });
    }
  }
  return out;
}

export default function Cockpit() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [fullPages, setFullPages] = useState<any[]>([]);
  const [aiDraftsPending, setAiDraftsPending] = useState<number | null>(null);
  const [aiDraftsNeedsRevision, setAiDraftsNeedsRevision] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const [a, c] = await Promise.all([api.audit(), api.getContent()]);
      setStats(a as Stats);
      setFullPages(c.pages || []);
      // AI Draft Inbox stats (best-effort, never blocks the cockpit).
      try {
        const [pending, needsRev] = await Promise.all([
          api.aiDraftsList({ status: 'pending_review', limit: 1000 }),
          api.aiDraftsList({ status: 'needs_revision', limit: 1000 }),
        ]);
        setAiDraftsPending((pending.drafts || []).length);
        setAiDraftsNeedsRevision((needsRev.drafts || []).length);
      } catch {
        setAiDraftsPending(null);
        setAiDraftsNeedsRevision(null);
      }
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const mismatches = useMemo(() => (stats ? buildMismatches(stats, fullPages) : []), [stats, fullPages]);

  if (loading) return <div className="p-8 text-white/60">Loading cockpit…</div>;
  if (err) return <div className="p-8 text-red-300">Failed: {err}</div>;
  if (!stats) return null;

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="cockpit-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40">Dashboard</div>
          <h1 className="font-display text-3xl text-white mt-1">SEO Cockpit</h1>
          <p className="text-white/60 text-sm mt-1">Real-time health across every page. Drafts are <strong>not live</strong>; only Published + robotsIndex pages appear in the sitemap.</p>
        </div>
        <Button variant="secondary" onClick={load} data-testid="cockpit-refresh"><RefreshCw size={14}/> Refresh</Button>
      </header>

      {/* Top KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile testId="stat-total" label="Total" value={stats.totalPages}/>
        <StatTile testId="stat-published" label="Published" value={stats.publishedPages} tone="success"/>
        <StatTile testId="stat-draft" label="Drafts (not live)" value={stats.draftPages} tone="warning"/>
        <StatTile testId="stat-noindex" label="Noindex" value={stats.noindexPages}/>
        <StatTile testId="stat-sitemap" label="In sitemap" value={stats.pagesInSitemap} tone="info"/>
        <StatTile testId="stat-money-score" label="Avg money score" value={`${stats.avgMoneyScore}`} tone={stats.avgMoneyScore >= 80 ? 'success' : 'warning'}/>
      </div>

      {/* AI Draft Inbox quick link */}
      {(aiDraftsPending !== null || aiDraftsNeedsRevision !== null) && (
        <Card data-testid="cockpit-ai-drafts-card" className={(aiDraftsPending ?? 0) > 0 ? 'border-brand-blue/40 bg-brand-blue/5' : ''}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Inbox size={18} className="text-brand-cyan"/>
              <div>
                <div className="text-white/85 font-medium">AI Draft Inbox</div>
                <div className="text-white/55 text-xs mt-0.5" data-testid="cockpit-ai-drafts-counts">
                  {aiDraftsPending ?? 0} pending review · {aiDraftsNeedsRevision ?? 0} need revision
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link to="/admin-tools/seo-autopilot" data-testid="cockpit-seo-autopilot-open">
                <Button variant="primary" size="sm"><PlayCircle size={14}/> Запустить SEO Автопилот</Button>
              </Link>
              <Link to="/admin-tools/ai-drafts" data-testid="cockpit-ai-drafts-open">
                <Button variant={(aiDraftsPending ?? 0) > 0 ? 'secondary' : 'ghost'} size="sm">Open inbox →</Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* SEO Health — single-glance pass/fail across the most damaging
          regressions we historically hit on gptbot.uz. Live probes run on
          the Cloudflare zone via /api/audit (random URL 404, admin noindex,
          sitemap XML, robots.txt, favicon, sample blog image). */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg text-white">SEO Health</h2>
            {stats.live?.probedAt && (
              <span className="text-xs text-white/40">last probe {new Date(stats.live.probedAt).toLocaleTimeString()}</span>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={load} data-testid="seo-health-run"><RefreshCw size={14}/> Run SEO Health Check</Button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm" data-testid="seo-health-grid">
          <HealthRow ok={(stats.live?.sitemap200Xml ?? true)} label="Sitemap 200 (XML)" detail={stats.live ? `${stats.pagesInSitemap + (stats.blogInSitemap ?? 0)} URLs · HTTP ${stats.live.sitemapStatus}` : `${stats.pagesInSitemap + (stats.blogInSitemap ?? 0)} URLs in sitemap`} />
          <HealthRow ok={(stats.live?.robots200 ?? true)} label="Robots.txt 200" />
          <HealthRow ok={(stats.live?.randomUrl404 ?? true)} label="Random URL → 404" detail={stats.live ? `HTTP ${stats.live.randomUrlStatus}` : undefined} />
          <HealthRow ok={(stats.live?.adminNoindex ?? true)} label="/admin-tools/ noindex" detail={stats.live ? `HTTP ${stats.live.adminStatus}` : undefined} />
          <HealthRow ok={(stats.live?.faviconLive ?? true)} label="Favicon live" />
          <HealthRow ok={(stats.live?.sampleImageLive ?? true)} label="Sample image live" />
          <HealthRow ok={stats.missingTitle === 0} label="Titles" detail={`${stats.missingTitle} missing`} />
          <HealthRow ok={stats.missingDescription === 0} label="Descriptions" detail={`${stats.missingDescription} missing`} />
          <HealthRow ok={stats.missingH1 === 0} label="H1" detail={`${stats.missingH1} missing`} />
          <HealthRow ok={stats.duplicateTitle === 0} label="Duplicate titles" detail={`${stats.duplicateTitle} dup`} />
          <HealthRow ok={stats.duplicateDescription === 0} label="Duplicate descriptions" detail={`${stats.duplicateDescription} dup`} />
          <HealthRow ok={stats.missingCanonical === 0} label="Canonical" detail={`${stats.missingCanonical} missing`} />
          <HealthRow ok={stats.ruUzPairsMissing === 0} label="RU↔UZ pairs" detail={`${stats.ruUzPairsOk} ok / ${stats.ruUzPairsMissing} missing`} />
          <HealthRow ok={stats.missingJsonLd === 0} label="Schema (JSON-LD)" detail={`${stats.missingJsonLd} missing`} />
          <HealthRow ok={(stats.mojibakePages ?? 0) === 0} label="Mojibake" detail={`${stats.mojibakePages ?? 0} pages`} />
          <HealthRow ok={stats.brokenInternalLinks === 0} label="Internal links" detail={`${stats.brokenInternalLinks} broken`} />
          <HealthRow ok={stats.orphanPages === 0} label="Orphan pages" detail={`${stats.orphanPages} orphan`} />
          <HealthRow ok={(stats.blogMissingFaq ?? 0) === 0} label="Blog FAQ" detail={`${stats.publishedBlog ?? 0} blog · ${stats.blogMissingFaq ?? 0} need FAQ`} />
        </div>
      </Card>

      {/* Mismatch warnings */}
      {mismatches.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-300"/>
            <h2 className="font-display text-lg text-white">Reality check ({mismatches.length})</h2>
          </div>
          <ul data-testid="cockpit-mismatches" className="space-y-2 text-sm">
            {mismatches.map((m, i) => (
              <li key={i} className={`flex items-start gap-2 ${m.level === 'error' ? 'text-red-300' : 'text-amber-300'}`}>
                <span className="mt-0.5">{m.level === 'error' ? '✕' : '⚠'}</span>
                <span className="flex-1">{m.message}</span>
                {m.url && (
                  <Link to={`/admin-tools/pages/${m.url.split('/')[1]}/${m.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '')}`} className="text-white/60 hover:text-white text-xs underline">Fix →</Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Problem counters */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card><div className="text-sm text-white/60">Missing fields</div>
          <ul className="mt-3 text-sm space-y-1">
            <li className="flex justify-between"><span>Title</span><span data-testid="miss-title" className="text-amber-300">{stats.missingTitle}</span></li>
            <li className="flex justify-between"><span>Description</span><span className="text-amber-300">{stats.missingDescription}</span></li>
            <li className="flex justify-between"><span>H1</span><span className="text-amber-300">{stats.missingH1}</span></li>
            <li className="flex justify-between"><span>Canonical</span><span className="text-amber-300">{stats.missingCanonical}</span></li>
            <li className="flex justify-between"><span>JSON-LD</span><span className="text-amber-300">{stats.missingJsonLd}</span></li>
          </ul>
        </Card>
        <Card><div className="text-sm text-white/60">Duplicates & links</div>
          <ul className="mt-3 text-sm space-y-1">
            <li className="flex justify-between"><span>Duplicate titles</span><span className={stats.duplicateTitle ? 'text-red-300' : 'text-white/60'}>{stats.duplicateTitle}</span></li>
            <li className="flex justify-between"><span>Duplicate descriptions</span><span className={stats.duplicateDescription ? 'text-red-300' : 'text-white/60'}>{stats.duplicateDescription}</span></li>
            <li className="flex justify-between"><span>Orphan pages</span><span className="text-amber-300">{stats.orphanPages}</span></li>
            <li className="flex justify-between"><span>Broken internal links</span><span className={stats.brokenInternalLinks ? 'text-red-300' : 'text-white/60'}>{stats.brokenInternalLinks}</span></li>
            <li className="flex justify-between"><span>Missing FAQ</span><span className="text-amber-300">{stats.missingFaq}</span></li>
          </ul>
        </Card>
        <Card><div className="text-sm text-white/60">RU / UZ pairing</div>
          <ul className="mt-3 text-sm space-y-1">
            <li className="flex justify-between"><span>OK pairs</span><span className="text-emerald-300">{stats.ruUzPairsOk}</span></li>
            <li className="flex justify-between"><span>Missing pairs</span><span className="text-amber-300">{stats.ruUzPairsMissing}</span></li>
            <li className="flex justify-between"><span>Missing hreflang field</span><span className="text-amber-300">{stats.missingHreflang}</span></li>
            <li className="flex justify-between"><span>Missing OG</span><span className="text-amber-300">{stats.missingOg}</span></li>
          </ul>
        </Card>
      </div>

      {/* Per-page table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-white">All pages</h2>
          <Link to="/admin-tools/pages"><Button variant="ghost" size="sm">Manage →</Button></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="cockpit-pages-table">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/5">
                <th className="py-2 px-2 font-medium">URL</th>
                <th className="py-2 px-2 font-medium">Type</th>
                <th className="py-2 px-2 font-medium">Status</th>
                <th className="py-2 px-2 font-medium">Live</th>
                <th className="py-2 px-2 font-medium">Sitemap</th>
                <th className="py-2 px-2 font-medium">Score</th>
                <th className="py-2 px-2 font-medium">Issues</th>
                <th className="py-2 px-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {stats.pages.map((p) => {
                const full = fullPages.find((q) => q.url === p.url);
                const isLive = full && full.status === 'published' && full.robotsIndex !== false;
                const inSitemap = !!isLive;
                const slug = p.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '');
                const errors = p.issues.filter((i) => i.level === 'error').length;
                const warnings = p.issues.filter((i) => i.level === 'warning').length;
                return (
                  <tr key={p.url} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 px-2"><Link to={`/admin-tools/pages/${p.locale}/${slug}`} className="text-brand-cyan hover:underline">{p.url}</Link></td>
                    <td className="py-2 px-2 text-white/60">{p.pageType}</td>
                    <td className="py-2 px-2">
                      <Badge tone={p.status === 'published' ? 'success' : p.status === 'noindex' ? 'warning' : 'neutral'}>{p.status}</Badge>
                    </td>
                    <td className="py-2 px-2">
                      {isLive ? <span className="text-emerald-300">● Live</span> : full?.status === 'noindex' ? <span className="text-amber-300">noindex</span> : <span className="text-white/40">— draft —</span>}
                    </td>
                    <td className="py-2 px-2 text-center">{inSitemap ? <span className="text-emerald-300">yes</span> : <span className="text-white/40">no</span>}</td>
                    <td className="py-2 px-2"><ScoreBadge score={p.score}/></td>
                    <td className="py-2 px-2 text-white/60">
                      {errors > 0 && <span className="text-red-300 mr-2">{errors}E</span>}
                      {warnings > 0 && <span className="text-amber-300">{warnings}W</span>}
                      {p.issues.length === 0 && <span className="text-emerald-300 flex items-center gap-1"><CheckCircle2 size={14}/> all good</span>}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-2">
                        <Link to={`/admin-tools/pages/${p.locale}/${slug}`} className="text-white/40 hover:text-white"><Pencil size={14}/></Link>
                        {isLive && <a href={p.url} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white"><Eye size={14}/></a>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

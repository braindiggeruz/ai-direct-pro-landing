import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, StatTile, ScoreBadge, Badge, Button } from '../components/ui';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, RefreshCw, Eye, Pencil } from 'lucide-react';

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
  pages: PageAudit[];
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
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const [a, c] = await Promise.all([api.audit(), api.getContent()]);
      setStats(a as Stats);
      setFullPages(c.pages || []);
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

// /admin-tools/seo-booster — Indexation Forge
//
// Read-only by default. Two state-changing actions exist:
//   1) Submit selected → IndexNow  (validated server-side, ignores non-pushable)
//   2) Copy GSC manual queue        (clipboard only; no server effect)
//
// Everything else is pure UI on top of /api/seo/booster.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, ScoreBadge, StatTile, Input, Select } from '../components/ui';
import { ArrowUpRight, Copy, ExternalLink, Filter, Gauge, GitMerge, Layers, Link2, RefreshCw, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import type { BoosterReport, ClusterReport, CannibalizationPair } from '../../shared/booster';

type Tab = 'indexation' | 'links' | 'clusters' | 'cannibalization';

function tone(score: number): 'success' | 'info' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'info';
  if (score >= 40) return 'warning';
  return 'danger';
}

function fmtDays(d: number): string {
  if (d >= 9000) return '—';
  if (d === 0) return 'today';
  if (d === 1) return '1d';
  return `${d}d`;
}

function HeaderTabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; icon: typeof Rocket }[] = [
    { id: 'indexation',      label: 'Indexation Forge', icon: Rocket },
    { id: 'links',           label: 'Internal Link Booster', icon: Link2 },
    { id: 'clusters',        label: 'Clusters', icon: Layers },
    { id: 'cannibalization', label: 'Cannibalization Radar', icon: GitMerge },
  ];
  return (
    <div className="flex flex-wrap gap-2" data-testid="booster-tabs">
      {items.map((it) => {
        const Icon = it.icon;
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            data-testid={`booster-tab-${it.id}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-colors ${active ? 'bg-brand-blue/15 text-brand-cyan border-brand-blue/40' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}
          >
            <Icon size={14} />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function IndexationTab({ report, selected, setSelected, onSubmit, submitState }: {
  report: BoosterReport;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onSubmit: () => void;
  submitState: { busy: boolean; result?: { ok: boolean; submitted?: number; rejected?: { url: string; reason: string }[]; error?: string; upstreamStatus?: number } };
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'page' | 'blog'>('all');
  const [pushOnly, setPushOnly] = useState(true);
  const [sortBy, setSortBy] = useState<'priority' | 'quality' | 'money' | 'fresh' | 'incoming'>('priority');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return report.items
      .filter((i) => (kind === 'all' || i.kind === kind))
      .filter((i) => (!pushOnly || i.flags.pushable))
      .filter((i) => !q || i.url.toLowerCase().includes(q) || i.title.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === 'quality') return b.scores.quality - a.scores.quality;
        if (sortBy === 'money')   return (b.scores.moneyPower ?? -1) - (a.scores.moneyPower ?? -1);
        if (sortBy === 'fresh')   return b.scores.freshness - a.scores.freshness;
        if (sortBy === 'incoming') return b.incomingLinks - a.incomingLinks;
        return b.scores.indexationPriority - a.scores.indexationPriority;
      });
  }, [report, query, kind, pushOnly, sortBy]);

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.url));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((i) => next.delete(i.url));
    else filtered.forEach((i) => { if (i.flags.pushable) next.add(i.url); });
    setSelected(next);
  };
  const toggleOne = (url: string) => {
    const next = new Set(selected);
    if (next.has(url)) next.delete(url); else next.add(url);
    setSelected(next);
  };

  const selectTopByPriority = (n: number) => {
    const next = new Set<string>();
    report.items
      .filter((i) => i.flags.pushable)
      .sort((a, b) => b.scores.indexationPriority - a.scores.indexationPriority)
      .slice(0, n)
      .forEach((i) => next.add(i.url));
    setSelected(next);
  };

  const copyGscQueue = async () => {
    const lines = Array.from(selected).map((u) => `https://gptbot.uz${u}`).join('\n');
    try { await navigator.clipboard.writeText(lines); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4" data-testid="booster-indexation">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-white/60"><Filter size={14}/> Filters</div>
          <Input placeholder="filter by URL or title" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" data-testid="booster-filter-query"/>
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'all' | 'page' | 'blog')} className="max-w-[160px]" data-testid="booster-filter-kind">
            <option value="all">All kinds</option>
            <option value="page">Pages</option>
            <option value="blog">Blog</option>
          </Select>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="max-w-[200px]" data-testid="booster-filter-sort">
            <option value="priority">Sort: Indexation priority</option>
            <option value="quality">Sort: Quality</option>
            <option value="money">Sort: Money power</option>
            <option value="fresh">Sort: Freshness</option>
            <option value="incoming">Sort: Incoming links</option>
          </Select>
          <label className="flex items-center gap-2 text-sm text-white/70" data-testid="booster-filter-pushable-label">
            <input type="checkbox" checked={pushOnly} onChange={(e) => setPushOnly(e.target.checked)} data-testid="booster-filter-pushable"/>
            Pushable only
          </label>
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={() => selectTopByPriority(10)} data-testid="booster-select-top-10"><Sparkles size={14}/> Top 10 by priority</Button>
          <Button variant="secondary" size="sm" onClick={() => selectTopByPriority(25)} data-testid="booster-select-top-25">Top 25</Button>
          <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())} data-testid="booster-clear-selection">Clear</Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="text-sm text-white/60">
            <strong className="text-white">{selected.size}</strong> selected · {filtered.length} shown · {report.items.length} total
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={copyGscQueue} disabled={selected.size === 0} data-testid="booster-copy-gsc">
              <Copy size={14}/> Copy as GSC manual queue
            </Button>
            <Button onClick={onSubmit} disabled={selected.size === 0 || submitState.busy} data-testid="booster-submit-indexnow">
              <Rocket size={14}/> {submitState.busy ? 'Submitting…' : `Submit selected → IndexNow`}
            </Button>
          </div>
        </div>
        {submitState.result && (
          <div data-testid="booster-submit-result" className={`rounded-lg border px-3 py-2 mb-3 text-sm ${submitState.result.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-red-500/30 bg-red-500/5 text-red-200'}`}>
            {submitState.result.ok
              ? <span>Submitted <strong>{submitState.result.submitted}</strong> URL(s) to IndexNow · upstream HTTP {submitState.result.upstreamStatus}{submitState.result.rejected?.length ? ` · ${submitState.result.rejected.length} rejected client-side` : ''}</span>
              : <span>Submit failed: {submitState.result.error}</span>}
            {submitState.result.rejected && submitState.result.rejected.length > 0 && (
              <ul className="mt-2 text-xs text-white/50 list-disc list-inside max-h-32 overflow-y-auto">
                {submitState.result.rejected.map((r, i) => <li key={i}><span className="text-white/70">{r.url}</span> — {r.reason}</li>)}
              </ul>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="booster-urls-table">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/5">
                <th className="py-2 px-2 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} data-testid="booster-select-all"/></th>
                <th className="py-2 px-2 font-medium">URL</th>
                <th className="py-2 px-2 font-medium">Type</th>
                <th className="py-2 px-2 font-medium">Status</th>
                <th className="py-2 px-2 font-medium">Priority</th>
                <th className="py-2 px-2 font-medium">Quality</th>
                <th className="py-2 px-2 font-medium">Money</th>
                <th className="py-2 px-2 font-medium">Fresh</th>
                <th className="py-2 px-2 font-medium">In</th>
                <th className="py-2 px-2 font-medium">Push</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.url} className={`border-b border-white/5 ${selected.has(i.url) ? 'bg-brand-blue/5' : 'hover:bg-white/[0.02]'}`} data-testid={`booster-row-${i.url}`}>
                  <td className="py-2 px-2"><input type="checkbox" disabled={!i.flags.pushable} checked={selected.has(i.url)} onChange={() => toggleOne(i.url)} data-testid={`booster-select-${i.url}`}/></td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      <Link to={`/admin-tools/${i.kind === 'blog' ? 'blog' : 'pages'}/${i.locale}/${i.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '').replace(/^blog\//, '')}`} className="text-brand-cyan hover:underline">{i.url}</Link>
                      {i.flags.pushable && (
                        <a href={`https://gptbot.uz${i.url}`} target="_blank" rel="noreferrer" className="text-white/30 hover:text-white"><ExternalLink size={12}/></a>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-white/60">{i.pageType}</td>
                  <td className="py-2 px-2"><Badge tone={i.status === 'published' ? 'success' : i.status === 'noindex' ? 'warning' : 'neutral'}>{i.status}</Badge></td>
                  <td className="py-2 px-2"><ScoreBadge score={i.scores.indexationPriority}/></td>
                  <td className="py-2 px-2"><ScoreBadge score={i.scores.quality}/></td>
                  <td className="py-2 px-2">{i.scores.moneyPower == null ? <span className="text-white/30">—</span> : <ScoreBadge score={i.scores.moneyPower}/>}</td>
                  <td className="py-2 px-2"><Badge tone={tone(i.scores.freshness)}>{fmtDays(i.daysSinceUpdate)}</Badge></td>
                  <td className="py-2 px-2"><Badge tone={i.incomingLinks >= 2 ? 'success' : i.incomingLinks === 1 ? 'warning' : 'danger'}>{i.incomingLinks}</Badge></td>
                  <td className="py-2 px-2">
                    {i.flags.pushable
                      ? <span className="text-emerald-300 inline-flex items-center gap-1"><ShieldCheck size={12}/> ok</span>
                      : <span className="text-white/40" title={i.flags.pushReasons.join('; ')}>blocked</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="py-6 text-center text-white/40">No URLs match current filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function LinksTab({ report }: { report: BoosterReport }) {
  const orphans = report.items.filter((i) => i.isOrphan && i.status === 'published').sort((a, b) => (b.scores.moneyPower ?? 0) - (a.scores.moneyPower ?? 0));
  const moneyLow = report.items.filter((i) => i.pageType === 'money' && i.incomingLinks < 2 && i.status === 'published').sort((a, b) => a.incomingLinks - b.incomingLinks);
  return (
    <div className="space-y-4" data-testid="booster-links">
      <Card>
        <h2 className="font-display text-lg text-white mb-3">Orphan pages ({orphans.length})</h2>
        <p className="text-white/60 text-sm mb-3">Published pages with 0 incoming internal links. Add at least 2 contextual links from supporting blog/money pages.</p>
        <div className="space-y-1">
          {orphans.map((o) => (
            <div key={o.url} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-sm" data-testid={`booster-orphan-${o.url}`}>
              <Link to={`/admin-tools/${o.kind === 'blog' ? 'blog' : 'pages'}/${o.locale}/${o.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '')}`} className="text-brand-cyan hover:underline">{o.url}</Link>
              <div className="flex items-center gap-3 text-white/60">
                <Badge tone="warning">{o.pageType}</Badge>
                <ScoreBadge score={o.scores.quality}/>
                <Link to={`/admin-tools/${o.kind === 'blog' ? 'blog' : 'pages'}/${o.locale}/${o.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '')}`} className="text-white/40 hover:text-white inline-flex items-center gap-1"><ArrowUpRight size={14}/> Fix</Link>
              </div>
            </div>
          ))}
          {orphans.length === 0 && <div className="text-white/40 text-sm">No orphan pages. </div>}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg text-white mb-3">Money pages with &lt;2 incoming links ({moneyLow.length})</h2>
        <p className="text-white/60 text-sm mb-3">Use the per-page <em>Suggest links</em> tool inside each money page editor to add 2–5 contextual links with diverse anchors.</p>
        <div className="space-y-1">
          {moneyLow.map((o) => (
            <div key={o.url} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-sm" data-testid={`booster-money-low-${o.url}`}>
              <Link to={`/admin-tools/pages/${o.locale}/${o.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '')}`} className="text-brand-cyan hover:underline">{o.url}</Link>
              <div className="flex items-center gap-3">
                <Badge tone="danger">{o.incomingLinks} incoming</Badge>
                <ScoreBadge score={o.scores.moneyPower ?? 0}/>
              </div>
            </div>
          ))}
          {moneyLow.length === 0 && <div className="text-white/40 text-sm">All money pages have ≥2 incoming links. Solid foundation.</div>}
        </div>
      </Card>
    </div>
  );
}

function ClustersTab({ clusters }: { clusters: ClusterReport[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4" data-testid="booster-clusters">
      {clusters.map((c) => (
        <Card key={c.id} data-testid={`booster-cluster-${c.id}`}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/40">cluster</div>
              <h3 className="font-display text-lg text-white mt-1">{c.label}</h3>
            </div>
            <ScoreBadge score={c.authorityScore}/>
          </div>
          <div className="text-xs text-white/60 space-y-1">
            <div>Money pages present: <strong className="text-white">{c.moneyUrlsPresent.length}</strong> / {c.moneyUrls.length}</div>
            <div>Avg incoming → money: <strong className="text-white">{c.averageIncomingToMoney}</strong></div>
            <div>Supporting articles: <strong className="text-white">{c.supportingArticles.length}</strong> ({c.supportingArticles.filter((s) => s.pointsToMoney).length} link back to money)</div>
            <div>RU↔UZ pairs: <strong className="text-emerald-300">{c.ruUzPairsOk}</strong> ok / <strong className="text-amber-300">{c.ruUzPairsMissing}</strong> missing</div>
          </div>
          {c.gaps.length > 0 && (
            <ul className="mt-3 text-xs text-amber-300 list-disc list-inside space-y-0.5">
              {c.gaps.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          )}
          {c.moneyUrlsMissing.length > 0 && (
            <div className="mt-3 text-xs text-white/40">
              Missing slugs: {c.moneyUrlsMissing.join(', ')}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function CannibalizationTab({ pairs }: { pairs: CannibalizationPair[] }) {
  return (
    <Card data-testid="booster-cannibalization">
      <h2 className="font-display text-lg text-white mb-3">Pairwise risk ({pairs.length})</h2>
      <p className="text-white/60 text-sm mb-3">Same-locale URLs with overlapping title / H1 / primary keyword. Suggested actions follow Google's guidance to resolve duplicates: merge, canonicalize the weaker URL, differentiate intent, or noindex the weaker one.</p>
      {pairs.length === 0 ? (
        <div className="text-white/40 text-sm">No cannibalization above the risk threshold. Healthy intent map.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/5">
                <th className="py-2 px-2 font-medium">A</th>
                <th className="py-2 px-2 font-medium">B</th>
                <th className="py-2 px-2 font-medium">Locale</th>
                <th className="py-2 px-2 font-medium">Risk</th>
                <th className="py-2 px-2 font-medium">Reasons</th>
                <th className="py-2 px-2 font-medium">Suggestion</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-2 px-2"><a href={`https://gptbot.uz${p.a}`} target="_blank" rel="noreferrer" className="text-brand-cyan hover:underline">{p.a}</a></td>
                  <td className="py-2 px-2"><a href={`https://gptbot.uz${p.b}`} target="_blank" rel="noreferrer" className="text-brand-cyan hover:underline">{p.b}</a></td>
                  <td className="py-2 px-2 text-white/60">{p.locale}</td>
                  <td className="py-2 px-2"><Badge tone={p.risk >= 60 ? 'danger' : 'warning'}>{p.risk}</Badge></td>
                  <td className="py-2 px-2 text-white/60">{p.reasons.join('; ')}</td>
                  <td className="py-2 px-2"><Badge tone="info">{p.suggestion}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function SeoBooster() {
  const [report, setReport] = useState<BoosterReport | null>(null);
  const [tab, setTab] = useState<Tab>('indexation');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitState, setSubmitState] = useState<{ busy: boolean; result?: { ok: boolean; submitted?: number; rejected?: { url: string; reason: string }[]; error?: string; upstreamStatus?: number } }>({ busy: false });

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.booster();
      setReport(r);
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const onSubmit = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Submit ${selected.size} URL(s) to IndexNow (Bing/Yandex/Seznam/Naver/Yep)? This action is logged.`)) return;
    setSubmitState({ busy: true });
    try {
      const urls = Array.from(selected).map((u) => `https://gptbot.uz${u}`);
      const r = await api.indexnowSubmit(urls);
      setSubmitState({ busy: false, result: r });
      if (r.ok) setSelected(new Set());
    } catch (e) {
      setSubmitState({ busy: false, result: { ok: false, error: (e as Error).message } });
    }
  };

  if (loading) return <div className="p-8 text-white/60" data-testid="booster-loading">Loading SEO Booster…</div>;
  if (err) return <div className="p-8 text-red-300" data-testid="booster-error">Failed: {err}</div>;
  if (!report) return null;
  const s = report.summary;

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="booster-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40">Module · white-hat</div>
          <h1 className="font-display text-3xl text-white mt-1 flex items-center gap-3"><Gauge size={28} className="text-brand-cyan"/> SEO Booster Engine</h1>
          <p className="text-white/60 text-sm mt-1 max-w-2xl">
            Indexation, internal linking, clustering and cannibalization — in one read-only cockpit. Only safe actions are exposed: <strong>IndexNow submit</strong> (validated server-side) and <strong>GSC manual queue copy</strong> (clipboard only).
          </p>
        </div>
        <Button variant="secondary" onClick={load} data-testid="booster-refresh"><RefreshCw size={14}/> Refresh</Button>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="booster-kpi">
        <StatTile testId="booster-kpi-total" label="URLs analysed" value={s.totalUrls}/>
        <StatTile testId="booster-kpi-pushable" label="Pushable" value={s.pushableUrls} tone="success"/>
        <StatTile testId="booster-kpi-orphans" label="Orphans" value={s.orphanPages} tone={s.orphanPages ? 'warning' : 'neutral'}/>
        <StatTile testId="booster-kpi-money-low" label="Money low incoming" value={s.moneyLowIncoming} tone={s.moneyLowIncoming ? 'warning' : 'success'}/>
        <StatTile testId="booster-kpi-cluster-avg" label="Cluster authority" value={`${s.clusterAuthorityAvg}/100`} tone={tone(s.clusterAuthorityAvg)}/>
        <StatTile testId="booster-kpi-cannib" label="Cannib. high" value={s.cannibalizationHigh} tone={s.cannibalizationHigh ? 'danger' : 'neutral'}/>
      </div>

      <HeaderTabs tab={tab} setTab={setTab}/>

      {tab === 'indexation'      && <IndexationTab report={report} selected={selected} setSelected={setSelected} onSubmit={onSubmit} submitState={submitState}/>}
      {tab === 'links'           && <LinksTab report={report}/>}
      {tab === 'clusters'        && <ClustersTab clusters={report.clusters}/>}
      {tab === 'cannibalization' && <CannibalizationTab pairs={report.cannibalization}/>}
    </div>
  );
}

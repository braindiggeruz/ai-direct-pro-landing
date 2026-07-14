// AI Draft Inbox — list of n8n-delivered bundles awaiting human review.
//
// Reads from /api/admin/ai-drafts. Each row is one bundle (RU + UZ pair).
// Drafts never auto-publish — actions live on the detail page.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, Input, Select } from '../components/ui';
import { TriangleAlert as AlertTriangle, Inbox, RefreshCw, ShieldCheck, ListFilter as Filter, Eye } from 'lucide-react';
import type { AiDraftListRow, AiDraftStatus } from '../../shared/ai-drafts';

type StatusFilter = 'all' | AiDraftStatus;

function statusTone(status: AiDraftStatus): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'pending_review': return 'info';
    case 'needs_revision': return 'warning';
    case 'imported':       return 'success';
    case 'rejected':       return 'danger';
    default:               return 'neutral';
  }
}

export default function AiDraftsList() {
  const nav = useNavigate();
  const [drafts, setDrafts] = useState<AiDraftListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending_review');
  const [localeFilter, setLocaleFilter] = useState<'all' | 'ru' | 'uz'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await api.aiDraftsList({ status: statusFilter === 'all' ? undefined : statusFilter, locale: localeFilter === 'all' ? undefined : localeFilter, limit: 200 });
      if (r.error) setErr(r.error);
      setDrafts(r.drafts || []);
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, localeFilter]);

  const sources = useMemo(() => {
    const s = new Set<string>();
    for (const d of drafts) s.add(d.source);
    return Array.from(s).sort();
  }, [drafts]);

  const visible = useMemo(() => drafts.filter((d) => {
    if (sourceFilter !== 'all' && d.source !== sourceFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!(d.primary_title || '').toLowerCase().includes(q) &&
          !(d.primary_slug || '').toLowerCase().includes(q) &&
          !(d.bundle_id || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  }), [drafts, sourceFilter, search]);

  const counts = useMemo(() => ({
    total: drafts.length,
    pending: drafts.filter((d) => d.status === 'pending_review').length,
    needsRevision: drafts.filter((d) => d.status === 'needs_revision').length,
    imported: drafts.filter((d) => d.status === 'imported').length,
    rejected: drafts.filter((d) => d.status === 'rejected').length,
    validationFailed: drafts.filter((d) => !d.validation_passed).length,
  }), [drafts]);

  return (
    <div className="p-6 sm:p-8" data-testid="ai-drafts-page">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40 flex items-center gap-2"><Inbox size={12}/> AI Draft Inbox</div>
          <h1 className="font-display text-3xl text-white mt-1" data-testid="ai-drafts-heading">Incoming bundles</h1>
          <p className="text-white/60 text-sm mt-2 max-w-2xl">
            Bilingual RU/UZ packages delivered by the n8n SEO Autopilot.
            <span className="inline-flex items-center gap-1 ml-2 text-emerald-300/90"><ShieldCheck size={12}/> Nothing here is live.</span>
            Import takes a draft into the existing Blog Editor as <strong>status=draft</strong>; publishing is a manual action.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <Button variant="secondary" onClick={load} disabled={loading} data-testid="ai-drafts-refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Refresh
          </Button>
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <CounterTile label="Total"          value={counts.total}          tone="neutral" testId="ai-drafts-counter-total"/>
        <CounterTile label="Pending review" value={counts.pending}        tone="info"    testId="ai-drafts-counter-pending"/>
        <CounterTile label="Needs revision" value={counts.needsRevision}  tone="warning" testId="ai-drafts-counter-needs-revision"/>
        <CounterTile label="Imported"       value={counts.imported}       tone="success" testId="ai-drafts-counter-imported"/>
        <CounterTile label="Rejected"       value={counts.rejected}       tone="danger"  testId="ai-drafts-counter-rejected"/>
        <CounterTile label="Validation issues" value={counts.validationFailed} tone={counts.validationFailed > 0 ? 'warning' : 'neutral'} testId="ai-drafts-counter-validation"/>
      </div>

      <Card>
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <Filter size={14} className="text-white/40"/>
          <Select className="w-44" data-testid="ai-drafts-filter-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">All statuses</option>
            <option value="pending_review">Pending review</option>
            <option value="needs_revision">Needs revision</option>
            <option value="imported">Imported</option>
            <option value="rejected">Rejected</option>
          </Select>
          <Select className="w-36" data-testid="ai-drafts-filter-locale" value={localeFilter} onChange={(e) => setLocaleFilter(e.target.value as 'all' | 'ru' | 'uz')}>
            <option value="all">RU + UZ</option>
            <option value="ru">Has RU</option>
            <option value="uz">Has UZ</option>
          </Select>
          <Select className="w-56" data-testid="ai-drafts-filter-source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="all">Any source</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input className="flex-1 min-w-[220px]" data-testid="ai-drafts-search" placeholder="Search title, slug, bundle_id…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {err && <div className="text-red-300 text-sm mb-3" data-testid="ai-drafts-error">Failed: {err}</div>}
        {loading ? <div className="text-white/60 text-sm" data-testid="ai-drafts-loading">Loading drafts…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="ai-drafts-table">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/5">
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium">Title</th>
                  <th className="py-2 px-2 font-medium">Languages</th>
                  <th className="py-2 px-2 font-medium">Target money page</th>
                  <th className="py-2 px-2 font-medium">Bundle</th>
                  <th className="py-2 px-2 font-medium">Source</th>
                  <th className="py-2 px-2 font-medium">Validation</th>
                  <th className="py-2 px-2 font-medium">Created</th>
                  <th className="py-2 px-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-white/50" data-testid="ai-drafts-empty">
                    No drafts match. n8n drops new bundles here as soon as the SEO Autopilot finishes a run.
                  </td></tr>
                ) : visible.map((d) => (
                  <tr key={d.id} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                      data-testid={`ai-drafts-row-${d.id}`}
                      onClick={() => nav(`/admin-tools/ai-drafts/${d.id}`)}>
                    <td className="py-2 px-2"><Badge tone={statusTone(d.status)}>{d.status.replace('_', ' ')}</Badge></td>
                    <td className="py-2 px-2 max-w-md">
                      <div className="text-white/85 truncate" data-testid={`ai-drafts-title-${d.id}`}>{d.primary_title || '— missing title —'}</div>
                      <div className="text-white/40 text-xs font-mono mt-0.5">{d.primary_slug || '—'}</div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1">
                        {d.has_ru && <Badge tone="info">RU</Badge>}
                        {d.has_uz && <Badge tone="info">UZ</Badge>}
                        {!d.has_ru && !d.has_uz && <span className="text-white/40 text-xs">none</span>}
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      {d.target_money_page
                        ? <code className="text-brand-cyan text-[11px]">{d.target_money_page}</code>
                        : <span className="text-white/40">—</span>}
                    </td>
                    <td className="py-2 px-2 text-white/50 text-xs font-mono max-w-[180px] truncate" title={d.bundle_id}>{d.bundle_id}</td>
                    <td className="py-2 px-2 text-white/60 text-xs">{d.source}</td>
                    <td className="py-2 px-2">
                      {d.validation_passed
                        ? <span className="text-emerald-300 text-xs inline-flex items-center gap-1"><ShieldCheck size={12}/> passed</span>
                        : <span className="text-amber-300 text-xs inline-flex items-center gap-1"><AlertTriangle size={12}/> {d.validation_issue_count} issue{d.validation_issue_count === 1 ? '' : 's'}</span>}
                    </td>
                    <td className="py-2 px-2 text-white/50 text-xs whitespace-nowrap">{new Date(d.created_at).toLocaleString()}</td>
                    <td className="py-2 px-2">
                      <Link to={`/admin-tools/ai-drafts/${d.id}`} className="text-brand-cyan hover:text-white px-2 py-1 inline-flex items-center gap-1 text-xs"
                            data-testid={`ai-drafts-open-${d.id}`}
                            onClick={(e) => e.stopPropagation()}>
                        <Eye size={12}/> Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-white/45 text-xs mt-5">
          Drafts are stored in Cloudflare D1 (<code className="text-brand-cyan">GPTBOT_DRAFTS_DB</code>). They never touch
          <code className="text-brand-cyan mx-1">/content/blog/**</code> until you click <em>Import</em> and then save in the Blog Editor.
        </p>
      </Card>
    </div>
  );
}

function CounterTile({ label, value, tone, testId }: { label: string; value: number; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; testId: string }) {
  const accent =
    tone === 'success' ? 'border-emerald-500/30' :
    tone === 'warning' ? 'border-amber-500/30'   :
    tone === 'danger'  ? 'border-red-500/30'      :
    tone === 'info'    ? 'border-brand-blue/30'  :
                         'border-white/10';
  return (
    <div data-testid={testId} className={`bg-bg-surface border ${accent} rounded-2xl px-4 py-3`}>
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="font-display text-2xl text-white mt-0.5">{value}</div>
    </div>
  );
}

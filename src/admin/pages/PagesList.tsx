import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, Input, ScoreBadge, Select } from '../components/ui';
import { Plus, Copy, Eye, Pencil, AlertTriangle } from 'lucide-react';
import { auditPage, hasMojibake } from '../../shared/audit';

type Filter = 'all' | 'published' | 'draft' | 'noindex' | 'low-score' | 'missing-faq' | 'missing-hreflang' | 'orphan' | 'in-sitemap' | 'not-in-sitemap' | 'mojibake';

export default function PagesList() {
  const nav = useNavigate();
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterLocale, setFilterLocale] = useState('all');
  const [filterState, setFilterState] = useState<Filter>('all');
  const [filterType, setFilterType] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const r = await api.getContent();
      setPages(r.pages || []);
      setLoading(false);
    })();
  }, []);

  const enriched = useMemo(() => pages.map((p) => {
    const audit = auditPage(p, { allPages: pages });
    const inSitemap = p.status === 'published' && p.robotsIndex !== false;
    const isLive = inSitemap; // simplistic; same flag
    const incoming = pages.reduce((acc, q) => acc + (q.url !== p.url && (q.internalLinks || []).some((l: any) => l.target === p.url) ? 1 : 0), 0);
    const hreflangPair = p.locale === 'ru' ? p.hreflangUz : p.hreflangRu;
    const pairExists = pages.some((q) => q.url === hreflangPair);
    const moji = hasMojibake(p.title) || hasMojibake(p.h1) || hasMojibake(p.description) || hasMojibake(p.heroTitle) || hasMojibake(p.heroSubtitle);
    return { ...p, ...audit, inSitemap, isLive, incoming, hreflangPair, pairExists, moji };
  }), [pages]);

  const filtered = enriched.filter((p: any) => {
    if (filterLocale !== 'all' && p.locale !== filterLocale) return false;
    if (filterType !== 'all' && p.pageType !== filterType) return false;
    if (filterState === 'published' && p.status !== 'published') return false;
    if (filterState === 'draft' && p.status !== 'draft') return false;
    if (filterState === 'noindex' && p.status !== 'noindex' && p.robotsIndex !== false) return false;
    if (filterState === 'low-score' && p.score >= 70) return false;
    if (filterState === 'missing-faq' && (p.faq || []).length >= 4) return false;
    if (filterState === 'missing-hreflang' && (p.hreflangRu && p.hreflangUz)) return false;
    if (filterState === 'orphan' && (p.incoming > 0 || p.pageType === 'homepage')) return false;
    if (filterState === 'in-sitemap' && !p.inSitemap) return false;
    if (filterState === 'not-in-sitemap' && p.inSitemap) return false;
    if (filterState === 'mojibake' && !p.moji) return false;
    if (q) {
      const hay = `${p.url} ${p.title} ${p.h1} ${p.primaryKeyword}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const togglePublish = async (p: any) => {
    const newStatus = p.status === 'published' ? 'draft' : 'published';
    if (!window.confirm(`Change status of ${p.url} from "${p.status}" to "${newStatus}"?`)) return;
    const slug = p.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '');
    await api.saveContent('page', p.locale, slug, { ...p, status: newStatus, updatedAt: new Date().toISOString() }, `chore(seo): toggle ${p.url} → ${newStatus}`);
    setPages((cur) => cur.map((x) => x.url === p.url ? { ...x, status: newStatus } : x));
  };

  const copyUrl = async (url: string) => {
    const full = `${(import.meta.env.VITE_SITE_URL as string | undefined) || ''}${url}`;
    try { await navigator.clipboard.writeText(full); } catch { /* ignore */ }
    setCopied(url);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="pages-list">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-white">Pages</h1>
          <p className="text-white/60 text-sm mt-1">Money / niche / FAQ / legal pages. Drafts are NOT live. Only Published + robotsIndex pages appear in the sitemap.</p>
        </div>
        <Button data-testid="new-page-btn" onClick={() => nav('/admin-tools/pages/new')}>
          <Plus size={16}/> New page
        </Button>
      </header>

      <Card>
        <div className="grid sm:grid-cols-4 gap-3">
          <Input data-testid="pages-search" placeholder="Search url / title / keyword…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select data-testid="pages-filter-locale" value={filterLocale} onChange={(e) => setFilterLocale(e.target.value)}>
            <option value="all">All locales</option><option value="ru">RU</option><option value="uz">UZ</option>
          </Select>
          <Select data-testid="pages-filter-state" value={filterState} onChange={(e) => setFilterState(e.target.value as Filter)}>
            <option value="all">All states</option>
            <option value="published">Published only</option>
            <option value="draft">Drafts only</option>
            <option value="noindex">Noindex</option>
            <option value="in-sitemap">In sitemap</option>
            <option value="not-in-sitemap">Not in sitemap</option>
            <option value="mojibake">⚠ Encoding issue</option>
            <option value="low-score">Score &lt; 70</option>
            <option value="missing-faq">Missing FAQ</option>
            <option value="missing-hreflang">Missing hreflang</option>
            <option value="orphan">Orphan (no incoming)</option>
          </Select>
          <Select data-testid="pages-filter-type" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All types</option><option value="money">Money</option><option value="homepage">Homepage</option><option value="niche">Niche</option><option value="faq">FAQ</option><option value="legal">Legal</option>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/5">
                <th className="py-2 px-2 font-medium">URL</th>
                <th className="py-2 px-2 font-medium">Locale</th>
                <th className="py-2 px-2 font-medium">Type</th>
                <th className="py-2 px-2 font-medium">Status</th>
                <th className="py-2 px-2 font-medium">Live</th>
                <th className="py-2 px-2 font-medium">Sitemap</th>
                <th className="py-2 px-2 font-medium">hreflang</th>
                <th className="py-2 px-2 font-medium">Inbound</th>
                <th className="py-2 px-2 font-medium">FAQ</th>
                <th className="py-2 px-2 font-medium">Score</th>
                <th className="py-2 px-2 font-medium">Title</th>
                <th className="py-2 px-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={12} className="py-6 text-white/40">Loading…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={12} className="py-6 text-white/40">No pages match.</td></tr>}
              {filtered.map((p: any) => {
                const slug = p.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '');
                const hreflangOk = p.hreflangRu && p.hreflangUz && p.pairExists;
                return (
                  <tr key={p.url} className="border-b border-white/5 hover:bg-white/[0.02]" data-testid={`page-row-${p.locale}-${slug}`}>
                    <td className="py-2 px-2">
                      <Link to={`/admin-tools/pages/${p.locale}/${slug}`} className="text-brand-cyan hover:underline">{p.url}</Link>
                    </td>
                    <td className="py-2 px-2"><Badge>{p.locale.toUpperCase()}</Badge></td>
                    <td className="py-2 px-2 text-white/60">{p.pageType}</td>
                    <td className="py-2 px-2">
                      <Badge tone={p.status === 'published' ? 'success' : p.status === 'noindex' ? 'warning' : 'neutral'}>{p.status}</Badge>
                    </td>
                    <td className="py-2 px-2">{p.isLive ? <span className="text-emerald-300">● Live</span> : <span className="text-white/40">—</span>}</td>
                    <td className="py-2 px-2 text-center">{p.inSitemap ? <span className="text-emerald-300">yes</span> : <span className="text-white/40">no</span>}</td>
                    <td className="py-2 px-2">{hreflangOk ? <span className="text-emerald-300">OK</span> : (p.hreflangRu || p.hreflangUz) ? <span className="text-amber-300">partial</span> : <span className="text-red-300">missing</span>}</td>
                    <td className="py-2 px-2 text-center text-white/70">{p.incoming}</td>
                    <td className="py-2 px-2 text-center text-white/70">{(p.faq || []).length}</td>
                    <td className="py-2 px-2"><ScoreBadge score={p.score}/></td>
                    <td className="py-2 px-2 text-white/70 max-w-xs truncate">
                      {p.moji ? (
                        <span className="text-red-300 inline-flex items-center gap-1" title="Encoding issue: text contains mojibake (Ã/Ð/Â sequences). Publish is blocked until fixed.">
                          <AlertTriangle size={12}/> Encoding issue
                        </span>
                      ) : p.title ? p.title : <span className="text-amber-300">— missing —</span>}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-2 items-center">
                        <Link to={`/admin-tools/pages/${p.locale}/${slug}`} className="text-white/40 hover:text-white" title="Edit"><Pencil size={14}/></Link>
                        {p.isLive && <a href={p.url} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white" title="Preview"><Eye size={14}/></a>}
                        <button onClick={() => copyUrl(p.url)} className="text-white/40 hover:text-white" title="Copy URL"><Copy size={14}/></button>
                        {copied === p.url && <span className="text-emerald-300 text-xs">✓</span>}
                        <button onClick={() => togglePublish(p)} className="text-xs text-white/60 hover:text-white border border-white/10 px-2 py-0.5 rounded">
                          {p.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
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

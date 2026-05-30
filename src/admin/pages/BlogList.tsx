// Admin Blog list — shows all blog articles from /api/content with status,
// target money page, FAQ count, internal links count. Read-only for now;
// articles are created via /api/content (kind=blog) or by adding JSON files
// in /content/blog/<locale>/<slug>.json.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Button, Card, Input, Select } from '../components/ui';
import { ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';
import { hasMojibake } from '../../shared/audit';
import type { BlogArticle } from '../../shared/types';

type Filter = 'all' | 'published' | 'draft' | 'noindex' | 'encoding';

export default function BlogList() {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getContent();
      setArticles((r.blog || []) as BlogArticle[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const enriched = useMemo(() => articles.map((a) => {
    const moji = hasMojibake(a.title) || hasMojibake(a.h1) || hasMojibake(a.description);
    const inSitemap = a.status === 'published' && a.robotsIndex !== false;
    return { ...a, moji, inSitemap };
  }), [articles]);

  const visible = useMemo(() => enriched.filter((a) => {
    if (filter === 'published' && a.status !== 'published') return false;
    if (filter === 'draft' && a.status !== 'draft') return false;
    if (filter === 'noindex' && a.status !== 'noindex') return false;
    if (filter === 'encoding' && !a.moji) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (![a.title, a.slug, a.h1].some((x) => (x || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }), [enriched, filter, search]);

  const counts = useMemo(() => ({
    total: articles.length,
    published: articles.filter((a) => a.status === 'published').length,
    drafts: articles.filter((a) => a.status === 'draft').length,
    moji: enriched.filter((a) => a.moji).length,
    avgFaq: articles.length ? Math.round(articles.reduce((s, a) => s + (a.faq?.length || 0), 0) / articles.length * 10) / 10 : 0,
  }), [articles, enriched]);

  return (
    <div className="p-6 sm:p-8" data-testid="blog-page">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-white">Blog</h1>
          <p className="text-white/60 text-sm mt-1">
            {counts.total} articles · {counts.published} published · {counts.drafts} drafts · avg FAQ {counts.avgFaq}
            {counts.moji > 0 ? <span className="text-red-300 ml-3"><AlertTriangle size={12} className="inline -mt-0.5"/> {counts.moji} encoding issue(s)</span> : null}
          </p>
        </div>
        <Button data-testid="blog-refresh" onClick={load} className="text-sm" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Refresh
        </Button>
      </div>

      <Card>
        <div className="flex gap-2 mb-4 flex-wrap">
          <Select data-testid="blog-filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="w-44">
            <option value="all">All ({counts.total})</option>
            <option value="published">Published ({counts.published})</option>
            <option value="draft">Drafts ({counts.drafts})</option>
            <option value="noindex">Noindex</option>
            <option value="encoding">⚠ Encoding issue</option>
          </Select>
          <Input data-testid="blog-search" placeholder="Search title or slug…" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 min-w-[200px]"/>
        </div>

        {error ? <div className="text-red-300 text-sm mb-3" data-testid="blog-error">Failed to load: {error}</div> : null}

        {loading ? <div className="text-white/60 text-sm">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="blog-table">
              <thead>
                <tr className="text-white/50 text-xs uppercase tracking-wider">
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Title</th>
                  <th className="text-left py-2 px-2">Slug</th>
                  <th className="text-left py-2 px-2">Target money page</th>
                  <th className="text-left py-2 px-2">FAQ</th>
                  <th className="text-left py-2 px-2">Links</th>
                  <th className="text-left py-2 px-2">URL</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={7} className="py-6 text-center text-white/50" data-testid="blog-empty">No articles match.</td></tr>
                ) : visible.map((a) => (
                  <tr key={a.slug} data-testid={`blog-row-${a.slug}`} className="border-t border-white/5">
                    <td className="py-2 px-2"><Badge tone={a.status === 'published' ? 'success' : a.status === 'draft' ? 'warning' : 'neutral'}>{a.status}</Badge></td>
                    <td className="py-2 px-2 text-white/85 max-w-md truncate">
                      {a.moji ? <span className="text-red-300 inline-flex items-center gap-1" title="Mojibake in title/h1/description"><AlertTriangle size={12}/> Encoding issue</span> : (a.title || <span className="text-amber-300">— missing —</span>)}
                    </td>
                    <td className="py-2 px-2 text-white/60">{a.slug}</td>
                    <td className="py-2 px-2 text-white/70">
                      {a.targetMoneyPage ? <code className="text-brand-cyan text-[11px]">{a.targetMoneyPage}</code> : <span className="text-white/40">—</span>}
                    </td>
                    <td className="py-2 px-2 text-white/70">{a.faq?.length || 0}</td>
                    <td className="py-2 px-2 text-white/70">{a.internalLinks?.length || 0}</td>
                    <td className="py-2 px-2">
                      <a href={a.url} target="_blank" rel="noopener" data-testid={`blog-view-${a.slug}`} className="text-brand-cyan hover:underline inline-flex items-center gap-1">
                        view <ExternalLink size={11}/>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-white/45 text-xs mt-5">
          Articles are stored in <code className="text-brand-cyan">/content/blog/&lt;locale&gt;/&lt;slug&gt;.json</code>.
          To create a new one, add a JSON file matching the <code className="text-brand-cyan">BlogArticle</code> type — the
          prerender pipeline, sitemap and blog index will pick it up on the next build.
          The publish-guard rejects any article that contains mojibake characters.
        </p>
      </Card>
    </div>
  );
}

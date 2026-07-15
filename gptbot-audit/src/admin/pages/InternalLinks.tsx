// Cross-page internal link manager. Aggregates internal links across all
// pages, shows orphans / broken / repeated anchors, lets you add cross-page
// link suggestions (stored in /content/seo/internal-links.json — a backlog).
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Button, Card, Input, Select } from '../components/ui';
import type { Page, InternalLink } from '../../shared/types';
import { ANCHORS } from '../../shared/site-config';
import { Plus, Save, X } from 'lucide-react';

export default function InternalLinksPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [extraLinks, setExtraLinks] = useState<InternalLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'orphan' | 'broken' | 'repeated' | 'money-low'>('all');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api.getContent();
      setPages(r.pages || []);
      setExtraLinks(r.internalLinks || []);
    })();
  }, []);

  const stats = useMemo(() => {
    const urls = new Set(pages.map((p) => p.url));
    const incoming = new Map<string, number>();
    const anchors = new Map<string, number>();
    const broken: { from: string; target: string; anchor: string }[] = [];

    for (const p of pages) {
      for (const l of p.internalLinks || []) {
        incoming.set(l.target, (incoming.get(l.target) || 0) + 1);
        anchors.set(l.anchor, (anchors.get(l.anchor) || 0) + 1);
        if (l.target.startsWith('/') && !urls.has(l.target)) {
          broken.push({ from: p.url, target: l.target, anchor: l.anchor });
        }
      }
    }

    const orphan = pages.filter((p) => p.status === 'published' && p.pageType !== 'homepage' && !incoming.has(p.url));
    const moneyLow = pages.filter((p) => p.pageType === 'money' && (incoming.get(p.url) || 0) < 2);
    const repeatedAnchors = Array.from(anchors.entries()).filter(([, n]) => n > 1).map(([a, n]) => ({ anchor: a, count: n }));

    return { incoming, broken, orphan, moneyLow, repeatedAnchors };
  }, [pages]);

  const filteredPages = useMemo(() => {
    if (filter === 'all') return pages;
    if (filter === 'orphan') return stats.orphan;
    if (filter === 'money-low') return stats.moneyLow;
    return pages;
  }, [pages, filter, stats]);

  const saveExtras = async () => {
    setBusy(true);
    try {
      await api.saveContent('internal-links', undefined, undefined, extraLinks, 'chore(seo): update internal-link backlog');
      setToast('Saved backlog');
    } catch (e) {
      setToast('Error: ' + (e as Error).message);
    }
    setBusy(false);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="internal-links-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-white">Internal links</h1>
          <p className="text-white/60 text-sm mt-1">Anchor + target + locale across all pages. Edit per-page links from the page editor; manage cross-page anchor suggestions here.</p>
        </div>
      </header>

      <div className="grid sm:grid-cols-4 gap-3">
        <Card><div className="text-xs text-white/40">Orphan pages</div><div className="font-display text-2xl text-amber-300 mt-1" data-testid="il-orphan-count">{stats.orphan.length}</div></Card>
        <Card><div className="text-xs text-white/40">Money pages w/ &lt;2 incoming</div><div className="font-display text-2xl text-amber-300 mt-1" data-testid="il-money-low-count">{stats.moneyLow.length}</div></Card>
        <Card><div className="text-xs text-white/40">Broken targets</div><div className={`font-display text-2xl mt-1 ${stats.broken.length ? 'text-red-300' : 'text-emerald-300'}`} data-testid="il-broken-count">{stats.broken.length}</div></Card>
        <Card><div className="text-xs text-white/40">Repeated anchors</div><div className="font-display text-2xl text-white mt-1">{stats.repeatedAnchors.length}</div></Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-white">Pages overview</h2>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="max-w-xs">
            <option value="all">All pages</option>
            <option value="orphan">Orphans only</option>
            <option value="money-low">Money pages with &lt;2 incoming</option>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-white/40 border-b border-white/5">
              <th className="py-2 px-2 font-medium">URL</th><th className="py-2 px-2 font-medium">Type</th>
              <th className="py-2 px-2 font-medium">Outgoing</th><th className="py-2 px-2 font-medium">Incoming</th><th className="py-2 px-2 font-medium">Status</th>
            </tr></thead>
            <tbody>
              {filteredPages.map((p) => (
                <tr key={p.url} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-2 px-2"><a href={`/admin-tools/pages/${p.locale}/${p.slug}`} className="text-brand-cyan hover:underline">{p.url}</a></td>
                  <td className="py-2 px-2 text-white/60">{p.pageType}</td>
                  <td className="py-2 px-2"><Badge tone={(p.internalLinks?.length || 0) >= 3 ? 'success' : 'warning'}>{p.internalLinks?.length || 0}</Badge></td>
                  <td className="py-2 px-2"><Badge tone={(stats.incoming.get(p.url) || 0) >= 2 ? 'success' : 'warning'}>{stats.incoming.get(p.url) || 0}</Badge></td>
                  <td className="py-2 px-2"><Badge tone={p.status === 'published' ? 'success' : 'neutral'}>{p.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {stats.broken.length > 0 && (
        <Card>
          <h2 className="font-display text-lg text-red-300 mb-3">Broken internal links</h2>
          <ul className="space-y-1 text-sm">
            {stats.broken.map((b, i) => (
              <li key={i} className="text-white/80"><span className="text-white/40">from</span> {b.from} <span className="text-white/40">→ missing</span> <span className="text-red-300">{b.target}</span> <span className="text-white/40">anchor:</span> "{b.anchor}"</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div><h2 className="font-display text-lg text-white">Cross-page anchor backlog</h2>
            <p className="text-xs text-white/40 mt-1">Suggestions stored in /content/seo/internal-links.json. Use them as a checklist.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setExtraLinks([...extraLinks, { source: '', target: '', anchor: '', locale: 'ru', type: 'contextual', status: 'active' }])}><Plus size={14}/> Add suggestion</Button>
            <Button size="sm" onClick={saveExtras} disabled={busy}><Save size={14}/> Save</Button>
          </div>
        </div>
        {toast && <div className="mb-3 text-sm text-emerald-300">{toast}</div>}
        <div className="space-y-2">
          {extraLinks.map((l, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_2fr_1fr_auto] gap-2">
              <Input placeholder="from (source url)" value={l.source || ''} onChange={(e) => setExtraLinks(extraLinks.map((x, idx) => idx === i ? { ...x, source: e.target.value } : x))}/>
              <Input placeholder="to (target url)" value={l.target} onChange={(e) => setExtraLinks(extraLinks.map((x, idx) => idx === i ? { ...x, target: e.target.value } : x))}/>
              <Input placeholder="anchor" value={l.anchor} list={`anchors-${l.locale}`} onChange={(e) => setExtraLinks(extraLinks.map((x, idx) => idx === i ? { ...x, anchor: e.target.value } : x))}/>
              <datalist id={`anchors-${l.locale}`}>{ANCHORS[l.locale].map((a) => <option key={a} value={a}/>)}</datalist>
              <Select value={l.locale} onChange={(e) => setExtraLinks(extraLinks.map((x, idx) => idx === i ? { ...x, locale: e.target.value as any } : x))}>
                <option value="ru">RU</option><option value="uz">UZ</option>
              </Select>
              <button onClick={() => setExtraLinks(extraLinks.filter((_, idx) => idx !== i))} className="text-white/40 hover:text-red-300"><X size={14}/></button>
            </div>
          ))}
          {extraLinks.length === 0 && <div className="text-white/40 text-sm">No suggestions yet.</div>}
        </div>
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Input, Select } from '../components/ui';
import type { Redirect } from '../../shared/types';
import { Plus, Save, X, TriangleAlert as AlertTriangle } from 'lucide-react';

export default function Redirects() {
  const [items, setItems] = useState<Redirect[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try { const r = await api.getContent(); setItems(r.redirects || []); }
      catch (e) { setErr((e as Error).message); }
    })();
  }, []);

  const loops = (() => {
    const map = new Map(items.map((r) => [r.from, r.to]));
    const bad: string[] = [];
    for (const r of items) {
      const seen = new Set([r.from]);
      let cur = r.to;
      let hops = 0;
      while (map.has(cur) && hops < 10) {
        if (seen.has(cur)) { bad.push(r.from); break; }
        seen.add(cur);
        cur = map.get(cur)!;
        hops++;
      }
    }
    return new Set(bad);
  })();

  const add = () => setItems([{ from: '/old-path/', to: '/new-path/', statusCode: 301, reason: '', createdAt: new Date().toISOString() }, ...items]);
  const update = (i: number, patch: Partial<Redirect>) => setItems(items.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.saveContent('redirects', undefined, undefined, items, 'chore(seo): update redirects.json');
      setToast('Saved redirects.json');
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="redirects-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-white">Redirects</h1>
          <p className="text-white/60 text-sm mt-1">301 / 302 redirect rules. Compiled into <code className="text-brand-cyan">/dist/_redirects</code> on every build (Cloudflare Pages format).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={add} data-testid="redirect-add"><Plus size={14}/> Add</Button>
          <Button size="sm" onClick={save} disabled={busy} data-testid="redirect-save"><Save size={14}/> Save</Button>
        </div>
      </header>

      {loops.size > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2 text-sm text-red-300">
          <AlertTriangle size={16}/> Redirect loop detected involving: {Array.from(loops).join(', ')}
        </div>
      )}
      {toast && <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-300">{toast}</div>}
      {err && <div className="bg-red-500/15 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">{err}</div>}

      <Card>
        {items.length === 0 && <div className="text-white/40 text-sm">No redirects defined yet.</div>}
        <div className="space-y-2">
          {items.map((r, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_2fr_auto] gap-2 items-start" data-testid={`redirect-row-${i}`}>
              <Input placeholder="from (e.g. /old/)" value={r.from} onChange={(e) => update(i, { from: e.target.value })}/>
              <Input placeholder="to (e.g. /new/)" value={r.to} onChange={(e) => update(i, { to: e.target.value })}/>
              <Select value={String(r.statusCode)} onChange={(e) => update(i, { statusCode: Number(e.target.value) as 301 | 302 })}>
                <option value="301">301</option><option value="302">302</option>
              </Select>
              <Input placeholder="reason (optional)" value={r.reason || ''} onChange={(e) => update(i, { reason: e.target.value })}/>
              <button onClick={() => remove(i)} className="text-white/40 hover:text-red-300"><X size={14}/></button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg text-white mb-3">How it works</h2>
        <ul className="text-sm text-white/70 space-y-1">
          <li>• Cloudflare Pages reads <code>/dist/_redirects</code> at deploy and applies edge redirects.</li>
          <li>• Build script <code>tsx scripts/generate-robots.ts</code> produces this file from JSON.</li>
          <li>• <code>yarn seo:audit</code> rejects builds containing redirect loops.</li>
          <li>• Changing a published page's slug? Add a 301 here from old URL to new URL before re-publishing.</li>
        </ul>
      </Card>
    </div>
  );
}

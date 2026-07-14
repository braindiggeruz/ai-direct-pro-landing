import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Input, Label, Textarea } from '../components/ui';
import { Save } from 'lucide-react';
import type { GlobalSEO } from '../../shared/types';

const EMPTY: GlobalSEO = {
  siteName: '', siteUrl: '', titleTemplate: '%s', defaultDescription: '', defaultOgImage: '',
  organizationName: '', logo: '', telegram: '', instagram: '', address: '', sameAs: [],
  defaultCTA: { label: '', href: '' },
};

export default function Settings() {
  const [data, setData] = useState<GlobalSEO>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api.getContent();
      if (r.global) setData(r.global);
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return <div className="p-8 text-white/60">Loading…</div>;

  const set = <K extends keyof GlobalSEO>(k: K, v: GlobalSEO[K]) => setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setBusy(true);
    try { await api.saveContent('global', undefined, undefined, data); setToast('Saved global config'); }
    catch (e) { setToast('Error: ' + (e as Error).message); }
    setBusy(false);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="p-6 sm:p-8 max-w-3xl space-y-6" data-testid="settings-page">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-white">Global SEO</h1>
          <p className="text-white/60 text-sm mt-1">Site-wide identity used by every page's JSON-LD, OG defaults and footer.</p>
        </div>
        <Button onClick={save} disabled={busy} data-testid="settings-save"><Save size={14}/> Save</Button>
      </header>
      {toast && <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-300">{toast}</div>}
      <Card>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Site name</Label><Input value={data.siteName} onChange={(e) => set('siteName', e.target.value)}/></div>
          <div><Label>Site URL</Label><Input value={data.siteUrl} onChange={(e) => set('siteUrl', e.target.value)}/></div>
          <div className="sm:col-span-2"><Label>Title template <span className="text-white/40 text-xs">(use %s)</span></Label><Input value={data.titleTemplate} onChange={(e) => set('titleTemplate', e.target.value)}/></div>
          <div className="sm:col-span-2"><Label>Default description</Label><Textarea rows={2} value={data.defaultDescription} onChange={(e) => set('defaultDescription', e.target.value)}/></div>
          <div className="sm:col-span-2"><Label>Default OG image URL</Label><Input value={data.defaultOgImage} onChange={(e) => set('defaultOgImage', e.target.value)}/></div>
          <div><Label>Organization name</Label><Input value={data.organizationName} onChange={(e) => set('organizationName', e.target.value)}/></div>
          <div><Label>Logo URL</Label><Input value={data.logo} onChange={(e) => set('logo', e.target.value)}/></div>
          <div><Label>Telegram</Label><Input value={data.telegram || ''} onChange={(e) => set('telegram', e.target.value)}/></div>
          <div><Label>Instagram</Label><Input value={data.instagram || ''} onChange={(e) => set('instagram', e.target.value)}/></div>
          <div><Label>Phone</Label><Input value={data.phone || ''} onChange={(e) => set('phone', e.target.value)}/></div>
          <div><Label>Address</Label><Input value={data.address || ''} onChange={(e) => set('address', e.target.value)}/></div>
          <div className="sm:col-span-2"><Label>sameAs <span className="text-white/40 text-xs">(comma-separated URLs)</span></Label>
            <Input value={(data.sameAs || []).join(', ')} onChange={(e) => set('sameAs', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}/></div>
          <div><Label>Default CTA label</Label><Input value={data.defaultCTA.label} onChange={(e) => set('defaultCTA', { ...data.defaultCTA, label: e.target.value })}/></div>
          <div><Label>Default CTA href</Label><Input value={data.defaultCTA.href} onChange={(e) => set('defaultCTA', { ...data.defaultCTA, href: e.target.value })}/></div>
        </div>
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { hasNewAdminRelease } from '../lib/admin-release';

export default function AdminUpdateNotice() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let disposed = false, pending = false, found = false;
    let controller: AbortController | null = null;
    const check = async () => {
      if (disposed || pending || found || document.visibilityState === 'hidden') return;
      pending = true; controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 6000);
      try {
        const response = await fetch('/gptbot-release.json', { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
        const body = await response.text();
        if (body.length > 16_384) return;
        if (!disposed && hasNewAdminRelease(import.meta.url, JSON.parse(body))) { found = true; setAvailable(true); }
      } catch { /* A manifest/network failure is not evidence of an old client. */ }
      finally { window.clearTimeout(timeout); pending = false; }
    };
    void check();
    const interval = window.setInterval(() => { void check(); }, 60_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      disposed = true; controller?.abort(); window.clearInterval(interval);
      window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check);
    };
  }, []);
  if (!available) return null;
  return <aside role="status" className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl rounded-xl border border-amber-300/40 bg-slate-950 p-4 text-sm text-white shadow-xl">
    <p className="font-semibold">Доступна новая версия админки</p>
    <p className="mt-1 text-white/80">Эта вкладка открыта на старой версии. Сохраните незавершённые изменения и обновите страницу. Автоматически перезагружать её не будем.</p>
    <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 rounded-lg border border-white/30 px-4 font-medium hover:bg-white/10">Обновить страницу</button>
  </aside>;
}

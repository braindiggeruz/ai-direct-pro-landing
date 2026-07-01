import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken, getToken } from '../lib/api';
import { Button, Card, Input, Label } from '../components/ui';
import { LogIn } from 'lucide-react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; 'error-callback'?: () => void; theme?: string }) => string;
      reset: (id?: string) => void;
    };
  }
}

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@gptbot.uz');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (getToken()) { nav('/admin-tools/', { replace: true }); return; }
    void api.config().then((c) => setSiteKey(c.turnstileSiteKey || null)).catch((e) => { console.warn('[Login] turnstile config fetch failed:', (e as Error).message); });
  }, [nav]);

  // Load Turnstile script once we know there is a site key
  useEffect(() => {
    if (!siteKey) return;
    if (document.querySelector('script[data-turnstile]')) {
      tryRender();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true; s.defer = true; s.setAttribute('data-turnstile', '1');
    s.onload = tryRender;
    document.head.appendChild(s);

    function tryRender() {
      if (!window.turnstile || !turnstileRef.current || !siteKey) { setTimeout(tryRender, 200); return; }
      if (widgetId.current) return;
      widgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (t: string) => setTurnstileToken(t),
        'error-callback': () => setTurnstileToken(null),
      });
    }
  }, [siteKey]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (siteKey && !turnstileToken) {
        setErr('Please complete the captcha first.');
        setBusy(false); return;
      }
      const r = await api.login(email, password, turnstileToken || undefined);
      setToken(r.token);
      nav('/admin-tools/');
    } catch (e) {
      setErr((e as Error).message);
      if (siteKey && window.turnstile && widgetId.current) {
        window.turnstile.reset(widgetId.current);
        setTurnstileToken(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base text-white flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-grad-radial pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-xs uppercase tracking-widest text-white/40">GPTBot</div>
          <div className="font-display text-3xl text-white mt-2">SEO Cockpit</div>
          <div className="text-white/60 mt-2 text-sm">Sign in to manage SEO content & redirects</div>
        </div>
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <Label>Password</Label>
              <Input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {siteKey && (
              <div className="flex justify-center"><div ref={turnstileRef} data-testid="login-turnstile" /></div>
            )}
            {err && <div data-testid="login-error" className="text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">{err}</div>}
            <Button data-testid="login-submit-button" type="submit" disabled={busy} className="w-full justify-center">
              <LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>
        <div className="text-center text-xs text-white/40 mt-6">
          Single-admin auth · JWT 12h sessions · 5-attempt IP lockout · rotate ADMIN_PASSWORD_HASH via Cloudflare env vars
        </div>
      </div>
    </div>
  );
}

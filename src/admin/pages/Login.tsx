import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, setToken, getToken } from '../lib/api';
import { Button, Card, Input, Label } from '../components/ui';
import { LogIn } from 'lucide-react';
import { loadTurnstile, responsiveTurnstileSize } from '../../shared/turnstile';
import { ADMIN_RETURN_PARAM, safeAdminReturnPath } from '../../shared/admin-return-path';

export default function Login() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  // Only ever a path under `/admin`, and null for anything else. The Bormi
  // Admin panel is a separate application behind its own Function, so reaching
  // it is a document load rather than a route change — and `replace` keeps the
  // login out of history, so Back cannot walk into a signed-in login form.
  const returnTo = safeAdminReturnPath(searchParams.get(ADMIN_RETURN_PARAM));
  const leave = () => {
    if (returnTo) { window.location.replace(returnTo); return; }
    nav('/admin-tools/');
  };
  const [email, setEmail] = useState('admin@gptbot.uz');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const [configState, setConfigState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [challengeState, setChallengeState] = useState<'idle' | 'loading' | 'ready' | 'verified' | 'error'>('idle');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (getToken()) {
      if (returnTo) { window.location.replace(returnTo); return; }
      nav('/admin-tools/', { replace: true });
      return;
    }
    void api.config().then((c) => {
      const nextSiteKey = c.turnstileSiteKey || null;
      setTurnstileRequired(c.turnstileRequired);
      setSiteKey(nextSiteKey);
      setConfigState('ready');
      setChallengeState(c.turnstileRequired && nextSiteKey ? 'loading' : 'idle');
      if (c.turnstileRequired && !nextSiteKey) {
        setErr('Captcha is required but not configured. Contact the administrator.');
      }
    }).catch(() => {
      setTurnstileRequired(true);
      setConfigState('error');
      setErr('Security configuration failed to load. Please refresh the page.');
    });
  }, [nav, returnTo]);

  // Load Turnstile script once we know there is a site key
  useEffect(() => {
    if (!turnstileRequired || !siteKey) return;
    let cancelled = false;
    void loadTurnstile().then((turnstile) => {
      if (cancelled || !turnstileRef.current) return;
      if (widgetId.current) return;
      setChallengeState('ready');
      widgetId.current = turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        action: 'admin_login',
        theme: 'dark',
        size: responsiveTurnstileSize(),
        callback: (token: string) => {
          setTurnstileToken(token);
          setChallengeState('verified');
          setErr((current) => current?.startsWith('Captcha expired') ? null : current);
        },
        'expired-callback': () => {
          setTurnstileToken(null);
          setChallengeState('ready');
          setErr('Captcha expired. Please complete it again.');
        },
        'error-callback': () => {
          setTurnstileToken(null);
          setChallengeState('error');
          setErr('Captcha failed to load. Please refresh the page.');
        },
      });
    }).catch(() => {
      setChallengeState('error');
      setErr('Captcha failed to load. Please refresh the page.');
    });
    return () => {
      cancelled = true;
      if (window.turnstile && widgetId.current) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, turnstileRequired]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (configState !== 'ready') {
      setErr('Security configuration is unavailable. Please refresh the page.');
      return;
    }
    if (turnstileRequired && (!siteKey || challengeState === 'error')) {
      setErr('Captcha is unavailable. Please refresh the page.');
      return;
    }
    if (turnstileRequired && !turnstileToken) {
      setErr('Please complete the captcha first.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await api.login(email, password, turnstileToken || undefined);
      setToken(r.token);
      leave();
    } catch (e) {
      setErr((e as Error).message);
      if (turnstileRequired && window.turnstile && widgetId.current) {
        window.turnstile.reset(widgetId.current);
        setTurnstileToken(null);
        setChallengeState('ready');
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
            {turnstileRequired && siteKey && (
              <div className="flex w-full min-w-0 flex-col items-center gap-2">
                <div ref={turnstileRef} data-testid="login-turnstile" className="flex w-full min-w-0 justify-center" />
                <div className="text-center text-xs text-white/50" role="status" aria-live="polite">
                  {challengeState === 'loading'
                    ? 'Loading security check…'
                    : challengeState === 'verified'
                      ? 'Security check complete.'
                      : 'Complete the security check to sign in.'}
                </div>
              </div>
            )}
            {err && <div data-testid="login-error" className="text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">{err}</div>}
            <Button
              data-testid="login-submit-button"
              type="submit"
              disabled={busy || configState !== 'ready' || (turnstileRequired && (!turnstileToken || challengeState === 'error'))}
              className="w-full justify-center"
            >
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

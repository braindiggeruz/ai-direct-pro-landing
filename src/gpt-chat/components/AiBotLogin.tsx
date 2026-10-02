import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Locale } from '../types';
import type { AccountStrings } from '../account-strings';
import { TELEGRAM_BOT_USERNAME } from '../../lib/telegram';
import {
  attemptFromStart,
  loadBotLogin,
  saveBotLogin,
  type BotLoginAttempt,
  type BotLoginStatus,
} from '../bot-login';
import { track, EV } from '../analytics';

/** How often the window asks while the tab is visible. */
const POLL_MS = 2_000;

const STATUSES: readonly string[] = ['pending', 'claimed', 'rejected', 'expired', 'done'];
const ENDED: ReadonlySet<BotLoginStatus> = new Set(['done', 'rejected', 'expired']);

/** POST /api/gpt/auth/bot/start; throws on anything but a valid attempt. */
async function startBotLogin(apiBase: string, locale: 'ru' | 'uz'): Promise<BotLoginAttempt> {
  const res = await fetch(`${apiBase}/api/gpt/auth/bot/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale, consent: true }),
    signal: AbortSignal.timeout(15_000),
  });
  const value = (await res.json()) as { ok?: unknown };
  const attempt = res.ok && value.ok === true ? attemptFromStart(value) : null;
  if (!attempt) throw new Error('bot_login_start');
  return attempt;
}

/**
 * POST /api/gpt/auth/bot/status. A 403 (the attempt's cookie is gone) or a
 * 404 (sign-in no longer offered) ends the attempt as expired; anything else
 * that is not an answer throws, and the caller simply asks again.
 */
async function pollBotLogin(apiBase: string, id: string, code?: string): Promise<BotLoginStatus> {
  const res = await fetch(`${apiBase}/api/gpt/auth/bot/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(code === undefined ? { id } : { id, code }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 403 || res.status === 404) return 'expired';
  const value = (await res.json()) as { ok?: unknown; status?: unknown };
  if (!res.ok || value.ok !== true || typeof value.status !== 'string' || !STATUSES.includes(value.status))
    throw new Error('bot_login_status');
  return value.status as BotLoginStatus;
}

function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Sign-in through the bot @gptbotuz_bot (lazy part chat-account, plan WP-16):
 * the start button, then the steps with the number to press in the bot (or,
 * in code mode, the field for the bot's code), then the outcome. It asks the
 * server every 2 s while the tab is visible and at once when the tab comes
 * back from Telegram, never two requests at a time; an attempt this tab
 * started survives a reload for its 10 minutes (bot-login.ts).
 */
export function AiBotLogin({
  locale,
  apiBase,
  copy,
  consent,
  disabled,
  onSignedIn,
}: {
  locale: Locale;
  apiBase: string;
  copy: AccountStrings;
  /** The sign-in consent above is ticked. */
  consent: boolean;
  disabled: boolean;
  /** Read the account again: it is signed in now. */
  onSignedIn: () => Promise<void>;
}) {
  const [attempt, setAttempt] = useState<BotLoginAttempt | null>(() => loadBotLogin());
  const [status, setStatus] = useState<BotLoginStatus>('pending');
  const [startFailed, setStartFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ended = useRef(false);
  const asking = useRef(false);
  const askedAt = useRef(0);

  const settle = useCallback((next: BotLoginStatus) => {
    if (ended.current) return;
    if (ENDED.has(next)) {
      ended.current = true;
      saveBotLogin(null);
      track(EV.loginResult, { method: 'bot', status: next, locale });
      if (next === 'done') void onSignedIn();
    }
    setStatus(next);
  }, [locale, onSignedIn]);

  const ask = useCallback(async (code?: string) => {
    if (!attempt || ended.current || (asking.current && code === undefined)) return;
    asking.current = true;
    askedAt.current = Date.now();
    try {
      settle(await pollBotLogin(apiBase, attempt.id, code));
    } catch {
      // A network blip or a busy minute: the next tick asks again.
    } finally {
      asking.current = false;
    }
  }, [apiBase, attempt, settle]);

  useEffect(() => {
    if (!attempt || ENDED.has(status)) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (at >= attempt.expiresAt) settle('expired');
      else if (document.visibilityState === 'visible' && at - askedAt.current >= POLL_MS) void ask();
    };
    // Back from Telegram: ask now, not on the next tick.
    const wake = () => {
      if (document.visibilityState === 'visible') void ask();
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [attempt, status, ask, settle]);

  const start = async () => {
    setBusy(true);
    setStartFailed(false);
    track(EV.loginStarted, { method: 'bot', locale });
    try {
      const next = await startBotLogin(apiBase, locale);
      saveBotLogin(next);
      ended.current = false;
      askedAt.current = Date.now();
      setStatus('pending');
      setTyped('');
      setCopied(false);
      setAttempt(next);
    } catch {
      setStartFailed(true);
      track(EV.loginResult, { method: 'bot', status: 'failed', locale });
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    ended.current = false;
    setStatus('pending');
    setAttempt(null);
  };

  const copyLink = async () => {
    if (!attempt) return;
    try {
      await navigator.clipboard.writeText(attempt.deepLink);
      setCopied(true);
    } catch {
      /* no clipboard: the link button still works */
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(typed) || busy) return;
    setBusy(true);
    await ask(typed);
    setBusy(false);
  };

  if (!attempt)
    return (
      <>
        {startFailed && <p role="alert" className="gpt-error">{copy.loginFailed}</p>}
        <button type="button" className="gpt-primary" disabled={disabled || busy || !consent} onClick={() => void start()}>
          {copy.login}
        </button>
      </>
    );

  if (status === 'done') return <p role="status" className="gpt-notice">{copy.botLoginDone}</p>;
  if (status === 'rejected' || status === 'expired')
    return (
      <>
        <p role="alert" className="gpt-error">{status === 'rejected' ? copy.botLoginRejected : copy.botLoginExpired}</p>
        <button type="button" className="gpt-primary" onClick={restart}>{copy.botLoginRestart}</button>
      </>
    );

  const pick = attempt.mode === 'pick';
  const steps = (pick ? copy.botLoginSteps : copy.botLoginCodeSteps)(TELEGRAM_BOT_USERNAME);
  return (
    <div className="gpt-bot-login">
      <ol className="gpt-login-steps">
        {steps.map((step, index) => (
          <li key={step}>
            {step}
            {pick && index === 1 && <strong className="gpt-login-code">{attempt.code}</strong>}
          </li>
        ))}
      </ol>
      <a className="gpt-primary" href={attempt.deepLink} target="_blank" rel="noopener noreferrer">
        {copy.botLoginOpen} <span aria-hidden="true">↗</span>
      </a>
      <button type="button" className="gpt-text-button" onClick={() => void copyLink()}>
        {copied ? copy.botLoginCopied : copy.botLoginCopy}
      </button>
      <p role="status" className="gpt-panel-note">
        {status === 'claimed'
          ? pick ? copy.botLoginClaimed(attempt.code ?? '') : copy.botLoginCodeClaimed
          : copy.botLoginWaiting(clock(attempt.expiresAt - now))}
      </p>
      {!pick && status === 'claimed' && (
        <form className="gpt-login-form" onSubmit={(event) => void submitCode(event)}>
          <label>
            <span>{copy.botLoginCodeLabel}</span>
            <input
              className="gpt-login-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={typed}
              onChange={(event) => setTyped(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          <button type="submit" className="gpt-primary" disabled={busy || typed.length !== 6}>
            {copy.botLoginCodeSubmit}
          </button>
        </form>
      )}
      <p className="gpt-notice">{copy.botLoginWarning}</p>
    </div>
  );
}

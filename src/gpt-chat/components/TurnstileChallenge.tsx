import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { loadTurnstile, responsiveTurnstileSize } from '../../shared/turnstile';

export interface TurnstileChallengeHandle {
  reset: () => void;
}

interface TurnstileChallengeProps {
  siteKey: string;
  loadingText: string;
  promptText: string;
  verifiedText: string;
  errorText: string;
  onTokenChange: (token: string | null) => void;
  action?: 'gpt_chat' | 'gpt_lead';
}

export const TurnstileChallenge = forwardRef<TurnstileChallengeHandle, TurnstileChallengeProps>(
  function TurnstileChallenge({ siteKey, loadingText, promptText, verifiedText, errorText, onTokenChange, action = 'gpt_chat' }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [status, setStatus] = useState<'loading' | 'prompt' | 'verified' | 'error'>('loading');

    useImperativeHandle(ref, () => ({
      reset: () => {
        onTokenChange(null);
        setStatus('prompt');
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }), [onTokenChange]);

    useEffect(() => {
      let cancelled = false;
      let api: Awaited<ReturnType<typeof loadTurnstile>> | null = null;
      setStatus('loading');

      void loadTurnstile()
        .then((loadedApi) => {
          if (cancelled || !containerRef.current) return;
          api = loadedApi;
          widgetIdRef.current = loadedApi.render(containerRef.current, {
            sitekey: siteKey,
            action,
            theme: 'dark',
            size: responsiveTurnstileSize(),
            callback: (token) => {
              setStatus('verified');
              onTokenChange(token);
            },
            'expired-callback': () => {
              setStatus('prompt');
              onTokenChange(null);
            },
            'error-callback': () => {
              setStatus('error');
              onTokenChange(null);
            },
          });
          setStatus('prompt');
        })
        .catch(() => {
          if (!cancelled) {
            setStatus('error');
            onTokenChange(null);
          }
        });

      return () => {
        cancelled = true;
        if (api && widgetIdRef.current) api.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      };
    }, [action, onTokenChange, siteKey]);

    const statusText = status === 'loading'
      ? loadingText
      : status === 'error'
        ? errorText
        : status === 'verified'
          ? verifiedText
          : promptText;

    return (
      <div className="mb-2 flex w-full min-w-0 flex-col items-center gap-1.5" data-testid="gpt-chat-turnstile">
        <div ref={containerRef} className="flex w-full min-w-0 justify-center" />
        <p className={status === 'error' ? 'text-xs text-red-300' : 'text-xs text-white/45'} role="status" aria-live="polite">
          {statusText}
        </p>
      </div>
    );
  },
);

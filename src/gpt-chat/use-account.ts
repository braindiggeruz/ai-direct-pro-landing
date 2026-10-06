import { useCallback, useEffect, useRef, useState } from 'react';
import { validAccountView, type AccountView } from './types';
import { checkoutPollDelay } from './checkout';

/** Pause before the one retry of a failed account read. */
const ACCOUNT_RETRY_MS = 1_500;

/**
 * Why the chat hears from the account view: it answered (`read`), it could
 * not be read or an account action failed (`unreachable`: the last view is
 * kept, nothing new is known), or the visitor signed out (`signed_out`).
 */
export type AccountCause = 'read' | 'unreachable' | 'signed_out';

/** The account view as the chat and the pack window share it. */
export interface AccountHandle {
  data: AccountView | null;
  error: boolean;
  loading: boolean;
  /** Read /api/gpt/account again (one retry); the chat hears every result. */
  refresh: () => Promise<void>;
  /** An account action failed: nothing new is known until the next read answers. */
  fail: () => void;
  /** Signed out: forget the view; the next read says who is asking now. */
  forget: () => void;
  clearError: () => void;
}

/**
 * The account view's data side, on the chat's start bundle (the pack window
 * itself is the lazy part chat-account): read on mount, after every turn
 * (`refreshKey`) and on every focus, and while the browser waits for a
 * payment (`watchSince`, checkout.ts) every 3 s for two minutes, then every
 * 15 s until ten minutes, whenever the tab is in view.
 */
export function useAccount(
  apiBase: string,
  onAccount: (account: AccountView | null, cause: AccountCause) => void,
  refreshKey: number,
  watchSince: number | null,
): AccountHandle {
  const [data, setData] = useState<AccountView | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const refreshGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const load = async (): Promise<AccountView> => {
      const res = await fetch(`${apiBase}/api/gpt/account`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      const next = (await res.json()) as AccountView;
      if (!res.ok || !validAccountView(next)) throw new Error();
      return next;
    };
    try {
      let next: AccountView;
      try {
        next = await load();
      } catch {
        // One retry, then the chat goes on as a guest whose history is
        // neither loaded nor written until the account answers (F11).
        await new Promise((resolve) => setTimeout(resolve, ACCOUNT_RETRY_MS));
        if (generation !== refreshGeneration.current) return;
        next = await load();
      }
      if (generation !== refreshGeneration.current) return;
      if (next.access && next.access.ends_at <= Date.now()) next.access = null;
      setData(next);
      onAccount(next, 'read');
      setError(false);
    } catch {
      // The last view stays (the pack button with it): a read that failed
      // says nothing about who is asking (plan M-01).
      if (generation === refreshGeneration.current) {
        setError(true);
        onAccount(null, 'unreachable');
      }
    } finally {
      if (generation === refreshGeneration.current) setLoading(false);
    }
  }, [apiBase, onAccount]);
  useEffect(() => {
    const generation = refreshGeneration;
    return () => {
      generation.current++;
    };
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);
  useEffect(() => {
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [refresh]);
  useEffect(() => {
    if (watchSince === null) return;
    let timer = 0;
    const schedule = () => {
      const delay = checkoutPollDelay(Date.now() - watchSince);
      if (delay === null) return;
      timer = window.setTimeout(() => {
        // A hidden tab is not asked; coming back to it reads at once (focus).
        if (document.visibilityState !== 'hidden') void refresh();
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [watchSince, refresh]);
  const fail = useCallback(() => {
    setError(true);
    onAccount(null, 'unreachable');
  }, [onAccount]);
  const forget = useCallback(() => {
    setData(null);
    onAccount(null, 'signed_out');
  }, [onAccount]);
  const clearError = useCallback(() => setError(false), []);
  return { data, error, loading, refresh, fail, forget, clearError };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { validAccountView, type AccountView } from './types';

/** Pause before the one retry of a failed account read. */
const ACCOUNT_RETRY_MS = 1_500;

/** The account view as the chat and the pack window share it. */
export interface AccountHandle {
  data: AccountView | null;
  error: boolean;
  loading: boolean;
  /** Read /api/gpt/account again (one retry); the chat hears every result. */
  refresh: () => Promise<void>;
  /** An account action failed: nothing is known until the next read answers. */
  fail: () => void;
  /** Signed out: forget the view; the next read says who is asking now. */
  forget: () => void;
  clearError: () => void;
}

/**
 * The account view's data side, on the chat's start bundle (the pack window
 * itself is the lazy part chat-account): read on mount, after every turn
 * (`refreshKey`) and on every focus, and every 5 s for 30 s while a payment
 * waits for its provider.
 */
export function useAccount(
  apiBase: string,
  onAccount: (account: AccountView | null) => void,
  refreshKey: number,
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
      onAccount(next);
      setError(false);
    } catch {
      if (generation === refreshGeneration.current) {
        setError(true);
        setData(null);
        onAccount(null);
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
  const pendingId = data?.payment && ['pending', 'prepared'].includes(data.payment.state) ? data.payment.id : null;
  useEffect(() => {
    if (!pendingId) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void refresh();
      if (attempts >= 6) window.clearInterval(timer);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [pendingId, refresh]);
  const fail = useCallback(() => {
    setError(true);
    setData(null);
    onAccount(null);
  }, [onAccount]);
  const forget = useCallback(() => {
    setData(null);
    onAccount(null);
  }, [onAccount]);
  const clearError = useCallback(() => setError(false), []);
  return { data, error, loading, refresh, fail, forget, clearError };
}

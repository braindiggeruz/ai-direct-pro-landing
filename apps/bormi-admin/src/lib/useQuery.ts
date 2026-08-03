/**
 * The smallest thing that can honestly render a remote read.
 *
 * Four states, and the screen has to handle all four: loading, error, empty and
 * data. A hook that collapses error into empty is how a broken dashboard ends
 * up looking like a quiet one, so `error` is separate and every caller shows it.
 *
 * No query library. One endpoint per screen, no cache to invalidate, nothing to
 * synchronise - a dependency here would cost bundle for behaviour nobody needs.
 */
import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, LOGIN_URL } from './api';

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** When this answer arrived. A console has to be able to say how old it is. */
  fetchedAt: number | null;
  /** True while a reload is in flight over data that is already on screen. */
  refreshing: boolean;
  reload: () => void;
}

export function useQuery<T>(run: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  // The caller passes a fresh closure every render; the dependency list is what
  // decides when to run, exactly as the caller declared it.
  const fetcher = useCallback(run, deps);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetcher()
      .then((value) => { if (alive) { setData(value); setFetchedAt(Date.now()); } })
      .catch((failure: unknown) => {
        if (!alive) return;
        // An expired session is not an error to display. It is a session to
        // renew, and the login that owns sessions is the one that renews it.
        if (failure instanceof AdminApiError && failure.status === 401) {
          window.location.assign(LOGIN_URL);
          return;
        }
        setError(failure instanceof AdminApiError ? failure.code : 'network_error');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetcher, nonce]);

  return {
    data,
    error,
    // First load only. A reload over data already on screen keeps the screen:
    // replacing a working table with a skeleton every thirty seconds is how a
    // console starts feeling slower than it is.
    loading: loading && data === null,
    refreshing: loading && data !== null,
    fetchedAt,
    reload: () => setNonce((value) => value + 1),
  };
}

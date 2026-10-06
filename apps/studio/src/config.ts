/**
 * The island's view of /api/studio/config and /api/studio/me, fetched
 * lazily (STUDIO-SPEC §11.3 item 3).
 *
 * On load the island asks for nothing. robots.txt closes /api/ to every
 * crawler and Google indexes the page after running its JavaScript, so
 * anything fetched on load (and any error it could show) would be what lands
 * in the index and the snippet. The first focus inside the form or its
 * first submit calls `warm()`; both answers are then kept for the page view.
 *
 * A failed answer is not kept: the next submit asks again. `/me` is asked
 * again after a result (`refreshMe`), since a deck uses the day's free unit.
 */
import type { Result, StudioApi, StudioMe, StudioPublicConfig } from './api';

export interface StudioSession {
  /** Starts both requests if they have not started; never waits. */
  warm(): void;
  config(): Promise<Result<StudioPublicConfig>>;
  me(): Promise<Result<StudioMe>>;
  /** Forgets the kept /me, so the next me() asks again. */
  refreshMe(): void;
  /** The /config answer, if it has arrived and was a success. */
  knownConfig(): StudioPublicConfig | null;
}

export function createStudioSession(api: Pick<StudioApi, 'config' | 'me'>): StudioSession {
  let config: Promise<Result<StudioPublicConfig>> | null = null;
  let me: Promise<Result<StudioMe>> | null = null;
  let settledConfig: StudioPublicConfig | null = null;

  const keep = <T>(request: Promise<Result<T>>, forget: () => void): Promise<Result<T>> =>
    request.then((result) => {
      if (!result.ok) forget();
      return result;
    });

  const askConfig = () => {
    if (!config) {
      config = keep(api.config(), () => {
        config = null;
      }).then((result) => {
        if (result.ok) settledConfig = result.data;
        return result;
      });
    }
    return config;
  };
  const askMe = () => {
    if (!me) {
      me = keep(api.me(), () => {
        me = null;
      });
    }
    return me;
  };

  return {
    warm() {
      void askConfig();
      void askMe();
    },
    config: askConfig,
    me: askMe,
    refreshMe() {
      me = null;
    },
    knownConfig: () => settledConfig,
  };
}

/**
 * One API client, one lazy /config and /me, and one funnel for every billing
 * part of a page view (the tariff sections, the checkout, «Mening paketim»,
 * the page after payment), made on first use: none of them calls anything
 * until a person acts (a result, the free limit, a click), except the page
 * after payment, which a buyer opens by coming back from Payme or Click.
 *
 * «Mening paketim» listens here: whenever a part reads /me, it shows what
 * came back, without a request of its own.
 */
import { createStudioApi, type Result, type StudioApi, type StudioMe } from '../api';
import { createFunnel, type Funnel } from '../analytics';
import { createStudioSession, type StudioSession } from '../config';

export interface BillingRuntime {
  readonly api: StudioApi;
  readonly session: StudioSession;
  readonly funnel: Funnel;
}

type Listener = (me: StudioMe) => void;

let runtime: BillingRuntime | null = null;
const listeners = new Set<Listener>();
let lastMe: StudioMe | null = null;

/** The page view's runtime; `make` is for tests. */
export function billingRuntime(make: () => StudioApi = () => createStudioApi()): BillingRuntime {
  if (!runtime) {
    const api = make();
    const session = createStudioSession(api);
    const me = session.me;
    // Every successful /me reaches the listeners.
    const watched: StudioSession = {
      ...session,
      me: () =>
        me().then((result: Result<StudioMe>) => {
          if (result.ok) {
            lastMe = result.data;
            for (const listener of listeners) listener(result.data);
          }
          return result;
        }),
    };
    runtime = { api, session: watched, funnel: createFunnel(api.event) };
  }
  return runtime;
}

/** Called with every /me that arrives from now on (and the last one, if any). Returns the unsubscribe. */
export function watchMe(listener: Listener): () => void {
  listeners.add(listener);
  if (lastMe) listener(lastMe);
  return () => listeners.delete(listener);
}

/** Tests only: forget the runtime and the listeners. */
export function resetBillingRuntime(): void {
  runtime = null;
  lastMe = null;
  listeners.clear();
}

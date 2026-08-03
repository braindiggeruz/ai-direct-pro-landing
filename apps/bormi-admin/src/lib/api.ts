/**
 * The only way this panel talks to anything.
 *
 * Same origin, so the owner session that already exists is the one it uses: the
 * bearer token the previous console stored under this origin is read, sent in a
 * header, and never written anywhere new. There is no login form here and no
 * second credential - a panel that could mint its own session would be a second
 * front door to the same building.
 *
 * The token is never put in a URL, never logged, and never handed to a caller;
 * it leaves this module only inside an Authorization header.
 */
import type { AuditResponse, OverviewResponse, StoresResponse } from './contracts';
import { syntheticAudit, syntheticOverview, syntheticStores } from './fixtures';

/** The key the shipped Owner Control Center already uses on this origin. */
const TOKEN_KEY = 'gptbot_admin_token';
/** Where an unauthenticated operator is sent. The existing login owns sessions. */
export const LOGIN_URL = '/admin-tools/login';

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(code);
    this.name = 'AdminApiError';
  }
}

function token(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Storage can be blocked outright. That is a missing session, not a crash.
    return null;
  }
}

/**
 * Fixtures exist so the panel can be built and reviewed without pointing a
 * browser at production data. They are dev-only twice over: the flag is read
 * from the dev server environment, and the branch is removed from the
 * production bundle because `import.meta.env.DEV` is statically false there.
 */
export const FIXTURE_MODE = import.meta.env.DEV
  && import.meta.env.VITE_ADMIN_FIXTURES === '1';

export function hasSession(): boolean {
  // Under fixtures there is no server to hold a session, and demanding one
  // would only mean pasting a real token into a review browser - which is the
  // opposite of why fixtures exist. Production never reaches this branch.
  return FIXTURE_MODE || token() !== null;
}

async function get<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const bearer = token();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const response = await fetch(path, {
    method: 'GET',
    headers,
    // Nothing here may be reused by a shared cache, and nothing may be served
    // from one either: an operations answer is true for the person who asked
    // and only for as long as it took to answer.
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (response.status === 401) {
    throw new AdminApiError('unauthenticated', 401, response.headers.get('x-request-id'));
  }
  if (!response.ok) {
    let code = `http_${response.status}`;
    try {
      const body = await response.json() as { error?: string; code?: string };
      code = body.code ?? body.error ?? code;
    } catch {
      // A non-JSON error body is still an error; the status carries the meaning.
    }
    throw new AdminApiError(code, response.status, response.headers.get('x-request-id'));
  }
  return response.json() as Promise<T>;
}

export const adminApi = {
  /** One bounded read for the whole command centre. */
  overview: (): Promise<OverviewResponse> => (
    FIXTURE_MODE ? Promise.resolve(syntheticOverview()) : get<OverviewResponse>('/api/admin/overview')
  ),

  /** Server-paginated, and the server decides what a page may contain. */
  stores: (limit = 25, offset = 0): Promise<StoresResponse> => (
    FIXTURE_MODE
      ? Promise.resolve(syntheticStores())
      : get<StoresResponse>(`/api/admin/agents/stores?limit=${limit}&offset=${offset}`)
  ),

  /** Append-only upstream. There is no write here to leave out. */
  audit: (limit = 25, offset = 0): Promise<AuditResponse> => (
    FIXTURE_MODE
      ? Promise.resolve(syntheticAudit())
      : get<AuditResponse>(`/api/admin/agents/audit?limit=${limit}&offset=${offset}`)
  ),
};

/** Drop the session and hand the browser back to the login that owns it. */
export function signOut(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear is the same outcome as clearing it.
  }
  window.location.assign(LOGIN_URL);
}

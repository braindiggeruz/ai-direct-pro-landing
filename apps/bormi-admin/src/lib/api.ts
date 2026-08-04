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
import type {
  AuditFilters,
  AuditResponse,
  CategoriesResponse,
  ListingCommand,
  ListingCommandResponse,
  ListingDetailResponse,
  ListingFilters,
  ListingsResponse,
  OrderDetailResponse,
  OrdersResponse,
  OverviewResponse,
  QuestionDetailResponse,
  QuestionsResponse,
  StoresResponse,
} from './contracts';
import {
  syntheticAudit,
  syntheticCategories,
  syntheticListing,
  syntheticListings,
  syntheticOrder,
  syntheticOrders,
  syntheticOverview,
  syntheticQuestion,
  syntheticQuestions,
  syntheticStores,
} from './fixtures';

/** The two filters `/api/admin/orders` actually narrows on. */
export interface OrdersFilters { stage?: string; store?: string }
/** The two filters `/api/admin/questions` actually narrows on. */
export interface QuestionsFilters { status?: string; store?: string }

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

  /**
   * Append-only upstream. There is no write here to leave out.
   *
   * The two filters are the two the endpoint actually narrows on - `action`
   * against `OWNER_AUDIT_ACTIONS` and `actor_role` against `PLATFORM_ROLES`.
   * Both are validated server-side against a closed list, and an unrecognised
   * value is refused rather than widened to "all", so a control here cannot
   * silently return more than it claims. Nothing else is offered: a filter the
   * server ignores is a filter that lies about the rows it is not showing.
   */
  audit: (limit = 25, offset = 0, filters: AuditFilters = {}): Promise<AuditResponse> => {
    if (FIXTURE_MODE) return Promise.resolve(syntheticAudit(filters));
    const query = `limit=${limit}&offset=${offset}`
      + (filters.action ? `&action=${encodeURIComponent(filters.action)}` : '')
      + (filters.actorRole ? `&actor_role=${encodeURIComponent(filters.actorRole)}` : '');
    return get<AuditResponse>(`/api/admin/agents/audit?${query}`);
  },

  /**
   * ADMIN-3A. Every filter below is applied by SQLite; none of them narrows the
   * page already in this browser. The server echoes back what it used, so a
   * screen can prove which query produced the rows it is showing.
   */
  listings: (
    limit = 25,
    offset = 0,
    filters: ListingFilters = {},
  ): Promise<ListingsResponse> => {
    if (FIXTURE_MODE) return Promise.resolve(syntheticListings(limit, offset, filters));
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
    }
    return get<ListingsResponse>(`/api/admin/listings?${query.toString()}`);
  },

  listing: (id: string): Promise<ListingDetailResponse> => (
    FIXTURE_MODE
      ? Promise.resolve(syntheticListing(id))
      : get<ListingDetailResponse>(`/api/admin/listings/${encodeURIComponent(id)}`)
  ),

  categories: (): Promise<CategoriesResponse> => (
    FIXTURE_MODE
      ? Promise.resolve(syntheticCategories())
      : get<CategoriesResponse>('/api/admin/categories')
  ),

  /**
   * ADMIN-4A. Both operations lists are server-paginated, server-filtered and
   * server-ordered: there is one ordering, newest first, and the client cannot
   * ask for another. Nothing here can be turned into a write — the endpoints
   * behind them answer 405 to every verb but GET.
   */
  orders: (
    limit = 25,
    offset = 0,
    filters: OrdersFilters = {},
  ): Promise<OrdersResponse> => {
    if (FIXTURE_MODE) return Promise.resolve(syntheticOrders(limit, offset, filters));
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
    }
    return get<OrdersResponse>(`/api/admin/orders?${query.toString()}`);
  },

  order: (id: string): Promise<OrderDetailResponse> => (
    FIXTURE_MODE
      ? Promise.resolve(syntheticOrder(id))
      : get<OrderDetailResponse>(`/api/admin/orders/${encodeURIComponent(id)}`)
  ),

  questions: (
    limit = 25,
    offset = 0,
    filters: QuestionsFilters = {},
  ): Promise<QuestionsResponse> => {
    if (FIXTURE_MODE) return Promise.resolve(syntheticQuestions(limit, offset, filters));
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
    }
    return get<QuestionsResponse>(`/api/admin/questions?${query.toString()}`);
  },

  question: (id: string): Promise<QuestionDetailResponse> => (
    FIXTURE_MODE
      ? Promise.resolve(syntheticQuestion(id))
      : get<QuestionDetailResponse>(`/api/admin/questions/${encodeURIComponent(id)}`)
  ),
};

/**
 * Run one listing command.
 *
 * Everything that decides the outcome is derived by the server from the id:
 * the org, the store, the current status and the transition it allows. This
 * sends the id, the reason, the version the operator was looking at, and one
 * idempotency key — and never a target status.
 *
 * Under fixtures there is no server, so it refuses rather than pretending to
 * succeed. A fixture that reported "applied" would be a review signing off on
 * a command that was never exercised.
 */
export async function runListingCommand(
  id: string,
  command: ListingCommand,
  input: {
    reasonCode: string;
    idempotencyKey: string;
    expectedVersion: number;
    confirmation?: string;
  },
): Promise<ListingCommandResponse> {
  if (FIXTURE_MODE) throw new AdminApiError('fixture_mode_read_only', 400, null);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const bearer = token();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const body: Record<string, unknown> = {
    reason_code: input.reasonCode,
    idempotency_key: input.idempotencyKey,
    expected_version: input.expectedVersion,
  };
  if (input.confirmation !== undefined) body.confirmation = input.confirmation;

  const response = await fetch(
    `/api/admin/listings/${encodeURIComponent(id)}/${command}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
    },
  );

  const requestId = response.headers.get('x-request-id');
  if (response.status === 401) {
    throw new AdminApiError('unauthenticated', 401, requestId);
  }
  // A version conflict is an answer, not a failure: the server sends the
  // listing as it now is so the screen can show what changed.
  if (response.status === 409) {
    const conflict = await response.json().catch(() => null) as ListingCommandResponse | null;
    if (conflict && conflict.outcome === 'conflict') return conflict;
    const code = (conflict as { error?: string } | null)?.error ?? 'conflict';
    throw new AdminApiError(code, 409, requestId);
  }
  if (!response.ok) {
    let code = `http_${response.status}`;
    try {
      const failure = await response.json() as { error?: string; code?: string };
      code = failure.code ?? failure.error ?? code;
    } catch {
      // A non-JSON error body is still an error; the status carries the meaning.
    }
    throw new AdminApiError(code, response.status, requestId);
  }
  return response.json() as Promise<ListingCommandResponse>;
}

/**
 * One product image, as bytes this panel is allowed to see.
 *
 * It is fetched rather than handed to an `<img src>`, and the reason is the
 * session model: this console authenticates with a bearer header, and a browser
 * does not attach headers to an image request. An `<img>` pointing at the media
 * route would be an unauthenticated request and would 401 every time.
 *
 * The alternative — signing a capability into the URL, as the Mini App does for
 * buyers — would put a credential in an address that lands in history and in
 * any referrer. So the bytes come back through the same guarded `fetch`, and
 * the caller gets an object URL it owns and must revoke.
 *
 * Returns null when the image is not this platform's to serve: an image stored
 * in Telegram, a missing object, or a preview environment with no bucket bound.
 * Every one of those is a fallback on screen, never a broken image icon.
 */
export async function fetchListingMedia(
  id: string,
  index: number,
): Promise<string | null> {
  if (FIXTURE_MODE) return null;
  const headers: Record<string, string> = {};
  const bearer = token();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  try {
    const response = await fetch(
      `/api/admin/listings/${encodeURIComponent(id)}/media/${index}`,
      { method: 'GET', headers, cache: 'no-store', credentials: 'same-origin' },
    );
    if (!response.ok) return null;
    return URL.createObjectURL(await response.blob());
  } catch {
    return null;
  }
}

/** Drop the session and hand the browser back to the login that owns it. */
export function signOut(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear is the same outcome as clearing it.
  }
  window.location.assign(LOGIN_URL);
}

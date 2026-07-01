// Shared admin API response helpers.
//
// Goals:
//   - Single canonical error shape so the SPA never has to special-case
//     plain-text 500s or mystery 4xx bodies.
//   - Every error carries a stable `code`, a human-readable `message`,
//     a `request_id` so the operator can grep CF logs, an `endpoint`
//     identifier, and a `retryable` flag the UI can use to show a Retry
//     button only where it makes sense.
//   - Server-side console.error keeps the technical detail; the wire
//     response only contains a safe excerpt (no secrets, no stacks).
//
// Used by every admin endpoint that can fail externally (GitHub API,
// D1, OpenRouter, Serper, n8n). Cockpit-level partial failure is handled
// by `/api/admin/cockpit` (cockpit aggregator).

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'GITHUB_UNAVAILABLE'
  | 'GITHUB_RATE_LIMITED'
  | 'GITHUB_AUTH_FAILED'
  | 'D1_UNAVAILABLE'
  | 'D1_QUERY_FAILED'
  | 'INTEGRATION_TIMEOUT'
  | 'INTEGRATION_UNAVAILABLE'
  | 'COCKPIT_PARTIAL_FAILURE'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    request_id: string;
    endpoint: string;
    retryable: boolean;
    detail?: Record<string, unknown>;
  };
}

export function newRequestId(): string {
  // Cloudflare Workers expose crypto.randomUUID(); fall back if missing.
  const u = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `req_${u.replace(/-/g, '').slice(0, 16)}`;
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GITHUB_UNAVAILABLE: 503,
  GITHUB_RATE_LIMITED: 429,
  GITHUB_AUTH_FAILED: 502,
  D1_UNAVAILABLE: 503,
  D1_QUERY_FAILED: 502,
  INTEGRATION_TIMEOUT: 504,
  INTEGRATION_UNAVAILABLE: 503,
  COCKPIT_PARTIAL_FAILURE: 200,        // intentional: partial OK
  INTERNAL_ERROR: 500,
};

const RETRYABLE: Record<ErrorCode, boolean> = {
  UNAUTHENTICATED: false,
  FORBIDDEN: false,
  BAD_REQUEST: false,
  NOT_FOUND: false,
  METHOD_NOT_ALLOWED: false,
  CONFLICT: false,
  GITHUB_UNAVAILABLE: true,
  GITHUB_RATE_LIMITED: true,
  GITHUB_AUTH_FAILED: false,
  D1_UNAVAILABLE: true,
  D1_QUERY_FAILED: true,
  INTEGRATION_TIMEOUT: true,
  INTEGRATION_UNAVAILABLE: true,
  COCKPIT_PARTIAL_FAILURE: true,
  INTERNAL_ERROR: true,
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Produce a structured error response and log the raw error server-side.
 *
 * The caller passes the original Error so the runtime can attach the
 * message + first stack frame to the Cloudflare console (visible via
 * `wrangler pages deployment tail`) without leaking it to the wire.
 */
export function errorResponse(
  endpoint: string,
  code: ErrorCode,
  message: string,
  opts: { originalError?: unknown; detail?: Record<string, unknown>; requestId?: string } = {},
): Response {
  const requestId = opts.requestId || newRequestId();
  const status = STATUS_BY_CODE[code];
  const body: ApiErrorBody = {
    success: false,
    error: {
      code,
      message,
      request_id: requestId,
      endpoint,
      retryable: RETRYABLE[code],
      detail: opts.detail,
    },
  };
  // Server-side log so the operator can correlate request_id with the
  // exact failure. NEVER include the body — that may contain user data.
  if (opts.originalError) {
    const e = opts.originalError as Error;
    console.error(`[${endpoint}] [${requestId}] ${code}: ${message} — ${e?.message || String(opts.originalError)}`);
    if (e?.stack) console.error(`[${endpoint}] [${requestId}] stack: ${e.stack.split('\n').slice(0, 4).join(' | ')}`);
  } else {
    console.error(`[${endpoint}] [${requestId}] ${code}: ${message}`);
  }
  return jsonResponse(body, status);
}

/**
 * Wrap a Pages Function handler so any uncaught throw produces a
 * structured INTERNAL_ERROR response instead of CF's default 1101 page.
 *
 * Adds the `request_id` to the inbound request via a `_admin_req_id`
 * property so nested helpers can correlate.
 */
export function withErrorHandler<E = unknown>(
  endpoint: string,
  handler: PagesFunction<E>,
): PagesFunction<E> {
  return (async (ctx) => {
    const requestId = newRequestId();
    try {
      const res = await handler(ctx);
      // Tag the response so the SPA can show "request_id" in retry hints.
      try {
        // Only mutate headers if we still control the response — clone if needed.
        if (res && !res.headers.has('x-request-id')) res.headers.set('x-request-id', requestId);
      } catch (headerErr) {
        // Response headers are immutable (e.g. cloned / redirect response).
        console.debug(`[api-errors] could not set x-request-id header: ${(headerErr as Error).message}`);
      }
      return res;
    } catch (e) {
      const code = classifyError(e);
      const message = humanMessageFor(code, e);
      return errorResponse(endpoint, code, message, { originalError: e, requestId });
    }
  }) as PagesFunction<E>;
}

/**
 * Best-effort classification of a thrown Error into an ErrorCode.
 * Recognises the standard messages used by lib/github.ts and lib/jwt.ts.
 */
export function classifyError(e: unknown): ErrorCode {
  const msg = (e instanceof Error ? e.message : String(e || '')).toLowerCase();
  if (msg.includes('rate limit') || msg.includes('secondary rate') || msg.startsWith('github') && msg.includes('429')) return 'GITHUB_RATE_LIMITED';
  if (msg.startsWith('github') && (msg.includes(' 401') || msg.includes('bad credentials') || msg.includes('unauthorized'))) return 'GITHUB_AUTH_FAILED';
  if (msg.startsWith('github')) return 'GITHUB_UNAVAILABLE';
  if (msg.includes('d1_') || msg.includes('d1 ') || msg.includes('sqlite')) return 'D1_QUERY_FAILED';
  if (msg.includes('aborted') || msg.includes('timeout') || msg.includes('timed out')) return 'INTEGRATION_TIMEOUT';
  if (msg.includes('fetch failed') || msg.includes('network')) return 'INTEGRATION_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

export function humanMessageFor(code: ErrorCode, e?: unknown): string {
  const tail = e instanceof Error && e.message ? ` (${e.message.slice(0, 140)})` : '';
  switch (code) {
    case 'GITHUB_RATE_LIMITED':
      return `GitHub API rate limit reached. Retry in a minute.`;
    case 'GITHUB_AUTH_FAILED':
      return `GitHub PAT is invalid or expired. Rotate GITHUB_TOKEN in Cloudflare Pages → Settings → Environment variables.${tail}`;
    case 'GITHUB_UNAVAILABLE':
      return `GitHub Contents API responded with an error${tail}.`;
    case 'D1_UNAVAILABLE':
      return `D1 database binding is missing. Check the GPTBOT_DRAFTS_DB binding in Cloudflare Pages.`;
    case 'D1_QUERY_FAILED':
      return `D1 query failed${tail}.`;
    case 'INTEGRATION_TIMEOUT':
      return `Upstream integration timed out${tail}.`;
    case 'INTEGRATION_UNAVAILABLE':
      return `Upstream integration is unreachable${tail}.`;
    default:
      return `Unexpected server error${tail}.`;
  }
}

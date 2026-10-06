// Response and log helpers of /api/studio/* (spec §6).
//
// Every answer is JSON with Cache-Control: no-store and X-Robots-Tag noindex;
// an error is { ok: false, code, error } with a code from the closed list
// below, so the island can map it to its own UZ/RU text. The middleware adds
// the same-origin CORS and CORP headers on top (functions/_middleware.ts).
//
// Logs carry { event, code } and nothing else: never a topic, an answer, a
// picture, a cookie, an identity or a URL with a query (spec §6, SP-8).

export const STUDIO_NO_STORE = "no-store";

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": STUDIO_NO_STORE,
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
} as const;

/** Error codes the studio API may answer, with their HTTP status (spec §6). */
export const STUDIO_ERRORS = {
  invalid: 400,
  bad_json: 400,
  outline_tampered: 400,
  bad_sig: 400,
  consent_required: 400,
  identity_required: 401,
  unauthorized: 401,
  no_units: 402,
  turnstile_failed: 403,
  turnstile_required: 403,
  not_found: 404,
  method_not_allowed: 405,
  job_in_progress: 409,
  job_state: 409,
  image_cap: 409,
  regen_used: 409,
  regen_window: 409,
  regen_mismatch: 409,
  terms_changed: 409,
  order_open: 409,
  in_progress: 409,
  restore_recent: 409,
  credit_cap: 409,
  payload_too_large: 413,
  unsupported_media: 415,
  topic_refused: 422,
  invalid_output: 422,
  unreadable: 422,
  photo_refused: 422,
  /** The finished picture failed its check (a person, text, a flag …): not handed out; the unit is not touched. */
  image_refused: 422,
  free_limit: 429,
  ip_ceiling: 429,
  try_later: 429,
  rate_limited: 429,
  model_failed: 502,
  /** Flux or the picture check failed, or the day's budget refused the picture: the slide goes without one. */
  image_failed: 502,
  studio_busy: 503,
  model_unavailable: 503,
  studio_not_configured: 503,
  checkout_unavailable: 503,
} as const satisfies Record<string, number>;

export type StudioErrorCode = keyof typeof STUDIO_ERRORS;

/** A JSON answer that no cache keeps and no search engine indexes. */
export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });
}

/**
 * `{ ok: false, code, error }` with the code's status. `extra` adds fields the
 * contract names (resetsAt, orderId, category …); it never carries content.
 */
export function fail(
  code: StudioErrorCode,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return json({ ...extra, ok: false, code, error: code.replace(/_/g, " ") }, STUDIO_ERRORS[code], headers);
}

/** The answer of a closed or unknown studio path: the same as a path that was never deployed. */
export function notFound(): Response {
  return fail("not_found");
}

/** One log line: the event and a coarse code, nothing else. */
export function studioLog(event: string, code: string): void {
  const clean = (value: string) => value.replace(/[^a-z0-9_.:-]/gi, "_").slice(0, 64);
  console.log(JSON.stringify({ event: clean(event), code: clean(code) }));
}

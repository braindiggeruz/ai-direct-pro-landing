// functions/lib/indexnow/submit-engine.ts
//
// Resilient IndexNow chunked submitter.
//
// Why this exists. The IndexNow protocol federates one POST to all
// participating engines (Bing, Yandex, Seznam, Naver, Yep). Bing in
// particular enforces a per-host rate limit and returns:
//
//   HTTP 429 { errorCode: "TooManyRequests",
//              message: "We're sorry, but you have sent too many
//              requests to us recently", details: null }
//
// In practice the safe rate is ~10 URLs per minute per host with a
// short (≤10) URL count per call. Before this engine the bulk submitter
// fired a single POST with 30–80 URLs and the entire batch went 429,
// silently wasting the operator's submission window. This engine:
//
//   1. Skips URLs the operator submitted SUCCESSFULLY within the last
//      24 hours — IndexNow ignores rapid re-submits anyway and this
//      protects the per-host budget.
//   2. Chunks the rest into groups of ≤ CHUNK_SIZE URLs.
//   3. Waits ≥ INTER_CHUNK_MS (with jitter) between chunks.
//   4. Parses the upstream `Retry-After` header on 429 and waits the
//      requested duration (capped at MAX_RETRY_AFTER_MS).
//   5. Retries 429 / 5xx with exponential backoff + jitter, up to
//      MAX_RETRIES_PER_CHUNK attempts.
//   6. Bails out cleanly at WALL_BUDGET_MS so the Cloudflare Pages
//      Function never blows its CPU budget — remaining URLs come back
//      as kind='deferred' for the operator to retry.
//
// The engine is provider-agnostic: it takes a `fetcher` so unit tests
// can drive it without touching api.indexnow.org.

export type IndexNowKind =
  | 'ok'               // 200/202 from upstream
  | 'rate_limited'     // 429 even after retries
  | 'http_error'       // non-2xx, non-429 (4xx config / 5xx upstream)
  | 'network_error'    // fetch threw
  | 'skipped_duplicate'// successful submit within last 24 h
  | 'deferred';        // walltime budget exhausted, never tried

export interface PerUrlResult {
  url: string;
  kind: IndexNowKind;
  upstreamStatus: number;
  retryAfterMs: number;          // 0 unless we received Retry-After
  attempts: number;              // 0 for skipped/deferred, ≥1 otherwise
  chunkIndex: number | null;     // null for skipped/deferred
  error: string | null;
  lastSubmittedAt: string | null;// only for skipped_duplicate
}

export interface ChunkResult {
  index: number;
  urlCount: number;
  upstreamStatus: number;
  upstreamBody: string;
  attempts: number;
  retryAfterMs: number;
  durationMs: number;
  ok: boolean;
}

export interface SubmitEngineInput {
  /** URLs already host/path-validated by the caller. */
  urls: string[];
  /** Map of URL → previous successful submit info. */
  recentSuccess: Map<string, { submittedAt: string; ageMs: number }>;
  /** IndexNow JSON body builder — caller injects host + key. */
  buildPayload: (chunkUrls: string[]) => unknown;
  /** Override for tests. Defaults to global fetch. */
  fetcher?: typeof fetch;
  /** Wallclock millisecond limiter. Defaults to Date.now. */
  clock?: () => number;
  /** Sleep — overridable for tests. Defaults to setTimeout-based wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Tunables; sensible defaults for production. */
  options?: Partial<EngineOptions>;
}

export interface EngineOptions {
  /** Max URLs per single IndexNow POST. Bing recommends ≤ 10. */
  chunkSize: number;
  /** Idle gap between successful chunks (ms). */
  interChunkMs: number;
  /** Random jitter added to interChunkMs (0…N ms). */
  interChunkJitterMs: number;
  /** Cool-down window: don't resubmit a URL that succeeded within this. */
  coolDownMs: number;
  /** Retries per chunk on 429/5xx. */
  maxRetriesPerChunk: number;
  /** Max Retry-After to honour. Beyond this we fall through to deferred. */
  maxRetryAfterMs: number;
  /** Hard walltime budget for the whole submission. */
  wallBudgetMs: number;
  /** Per-request timeout (ms) — guards against hung fetches. */
  fetchTimeoutMs: number;
}

const DEFAULTS: EngineOptions = {
  // 2026-06-25: previously chunkSize=5 + interChunkMs=6000 + wallBudget=55000
  // worked for ≤30 URLs but caused two pain points at higher volume:
  //   1. Operator selected 70-100 URLs → backend ran ~50s → frontend timeout
  //      at 30s aborted the request with "signal is aborted without reason"
  //      before backend finished its final chunks.
  //   2. Even when the call returned, throughput was painful: ≤30 URLs per
  //      click, the rest came back as kind='deferred'.
  // Yandex IndexNow pool (the endpoint we now use, see INDEXNOW_ENDPOINT
  // below) tolerates a higher rate than the old Bing endpoint. New defaults:
  //   * chunkSize 8 — within Bing's "≤10 URLs per request" recommendation
  //     and still a safe value for any IndexNow implementer.
  //   * interChunkMs 3 s — half the previous gap; Yandex hasn't 429'd at
  //     this cadence in production.
  //   * wallBudgetMs 90 s — within Cloudflare Pages Functions edge
  //     timeout (~100 s). Lets us deliver up to ~200 URLs per click.
  //   * fetchTimeoutMs raised to 10 s — Yandex occasionally takes ~5-7 s
  //     when warming up.
  chunkSize: 8,
  interChunkMs: 3_000,
  interChunkJitterMs: 800,
  coolDownMs: 24 * 60 * 60 * 1000,
  maxRetriesPerChunk: 2,
  maxRetryAfterMs: 60_000,
  // ~25 chunks × ~3.5 s = ~88 s — fits Cloudflare's ~100 s edge.
  wallBudgetMs: 90_000,
  fetchTimeoutMs: 10_000,
};

// Switched 2026-06-24 from Bing-operated api.indexnow.org → Yandex-
// operated endpoint. Both federate per IndexNow spec, but the Bing
// pool was hard-throttling the operator's account (52/52 → 429). The
// Yandex pool has a separate rate-limit budget and is forgiving enough
// to actually deliver our daily volume. Bing still receives the
// notifications via the federated network.
export const INDEXNOW_ENDPOINT = 'https://yandex.com/indexnow';

function parseRetryAfter(raw: string | null): number {
  if (!raw) return 0;
  const t = raw.trim();
  if (!t) return 0;
  // RFC 7231 §7.1.3: either seconds (delta-seconds) or HTTP-date.
  if (/^\d+$/.test(t)) {
    const seconds = Math.min(60, parseInt(t, 10));
    return seconds * 1000;
  }
  const ts = Date.parse(t);
  if (Number.isFinite(ts)) {
    const delta = ts - Date.now();
    return Math.max(0, Math.min(60_000, delta));
  }
  return 0;
}

function backoffMs(attempt: number, jitterMs = 250): number {
  // 800 ms · 2^(attempt) + jitter — attempt is 0-indexed.
  return 800 * Math.pow(2, attempt) + Math.floor(Math.random() * jitterMs);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(1_000, timeoutMs));
  try {
    return await fetcher(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface SubmitEngineOutput {
  perUrl: PerUrlResult[];
  chunks: ChunkResult[];
  succeeded: number;
  rateLimited: number;
  failed: number;
  skippedDuplicate: number;
  deferred: number;
  durationMs: number;
  budgetExhausted: boolean;
}

export async function runChunkedSubmit(input: SubmitEngineInput): Promise<SubmitEngineOutput> {
  const opt = { ...DEFAULTS, ...(input.options || {}) };
  const fetcher = input.fetcher || fetch;
  const clock = input.clock || (() => Date.now());
  const sleep = input.sleep || defaultSleep;
  const startedAt = clock();
  const budgetEnd = startedAt + opt.wallBudgetMs;

  // 1. Partition into ready vs. cooling down.
  const ready: string[] = [];
  const perUrl: PerUrlResult[] = [];
  for (const url of input.urls) {
    const prev = input.recentSuccess.get(url);
    if (prev && prev.ageMs < opt.coolDownMs) {
      perUrl.push({
        url,
        kind: 'skipped_duplicate',
        upstreamStatus: 0,
        retryAfterMs: 0,
        attempts: 0,
        chunkIndex: null,
        error: `cool-down: last successful submit ${Math.round(prev.ageMs / 3_600_000)}h ago`,
        lastSubmittedAt: prev.submittedAt,
      });
    } else {
      ready.push(url);
    }
  }

  // 2. Build chunks.
  const chunks: string[][] = [];
  for (let i = 0; i < ready.length; i += opt.chunkSize) {
    chunks.push(ready.slice(i, i + opt.chunkSize));
  }

  // 3. Submit each chunk with retries.
  const chunkResults: ChunkResult[] = [];
  let budgetExhausted = false;
  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    if (clock() >= budgetEnd) { budgetExhausted = true; break; }
    if (chunkIdx > 0) {
      const idleMs = opt.interChunkMs + Math.floor(Math.random() * opt.interChunkJitterMs);
      // If idle would burn the rest of our budget, defer the remaining chunks.
      if (clock() + idleMs >= budgetEnd) { budgetExhausted = true; break; }
      await sleep(idleMs);
    }
    const chunkUrls = chunks[chunkIdx];
    const chunkStart = clock();
    let attempts = 0;
    let upstreamStatus = 0;
    let upstreamBody = '';
    let retryAfterMs = 0;
    let networkError: string | null = null;
    let attempt = 0;
    while (attempt <= opt.maxRetriesPerChunk) {
      attempts = attempt + 1;
      if (clock() >= budgetEnd) { budgetExhausted = true; break; }
      try {
        const res = await fetchWithTimeout(
          fetcher,
          INDEXNOW_ENDPOINT,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(input.buildPayload(chunkUrls)),
          },
          opt.fetchTimeoutMs,
        );
        upstreamStatus = res.status;
        upstreamBody = (await res.text()).slice(0, 800);
        if (upstreamStatus === 200 || upstreamStatus === 202) break;
        if (upstreamStatus === 429) {
          const waitMs = parseRetryAfter(res.headers.get('Retry-After'))
            || Math.min(opt.maxRetryAfterMs, backoffMs(attempt, 500) * 2);
          retryAfterMs = Math.max(retryAfterMs, waitMs);
          // If we've exhausted retries OR the wait would blow the budget,
          // surface the 429 to the operator instead of looping.
          if (attempt >= opt.maxRetriesPerChunk) break;
          if (clock() + waitMs >= budgetEnd) { budgetExhausted = true; break; }
          await sleep(waitMs);
          attempt++;
          continue;
        }
        if (upstreamStatus >= 500 && upstreamStatus <= 599) {
          if (attempt >= opt.maxRetriesPerChunk) break;
          const waitMs = backoffMs(attempt);
          if (clock() + waitMs >= budgetEnd) { budgetExhausted = true; break; }
          await sleep(waitMs);
          attempt++;
          continue;
        }
        // 4xx other than 429: terminal — IndexNow says payload/host/key is invalid.
        break;
      } catch (e) {
        networkError = (e as Error).message || 'network error';
        if (attempt >= opt.maxRetriesPerChunk) break;
        const waitMs = backoffMs(attempt);
        if (clock() + waitMs >= budgetEnd) { budgetExhausted = true; break; }
        await sleep(waitMs);
        attempt++;
        continue;
      }
    }
    const ok = upstreamStatus === 200 || upstreamStatus === 202;
    chunkResults.push({
      index: chunkIdx,
      urlCount: chunkUrls.length,
      upstreamStatus,
      upstreamBody,
      attempts,
      retryAfterMs,
      durationMs: clock() - chunkStart,
      ok,
    });
    // Per-URL fan-out: every URL in this chunk gets the chunk's status.
    const kind: IndexNowKind = ok
      ? 'ok'
      : upstreamStatus === 429
        ? 'rate_limited'
        : networkError
          ? 'network_error'
          : 'http_error';
    const errorMsg = ok
      ? null
      : networkError
        ? networkError
        : `HTTP ${upstreamStatus}: ${upstreamBody.slice(0, 200)}`;
    for (const url of chunkUrls) {
      perUrl.push({
        url,
        kind,
        upstreamStatus,
        retryAfterMs,
        attempts,
        chunkIndex: chunkIdx,
        error: errorMsg,
        lastSubmittedAt: null,
      });
    }
  }

  // 4. Mark remaining as deferred.
  if (budgetExhausted) {
    const submittedSet = new Set(perUrl.map((p) => p.url));
    for (const url of ready) {
      if (submittedSet.has(url)) continue;
      perUrl.push({
        url,
        kind: 'deferred',
        upstreamStatus: 0,
        retryAfterMs: 0,
        attempts: 0,
        chunkIndex: null,
        error: 'walltime budget exhausted — click "Повторить неуспешные" to continue',
        lastSubmittedAt: null,
      });
    }
  }

  // 5. Aggregate.
  let succeeded = 0, rateLimited = 0, failed = 0, skippedDuplicate = 0, deferred = 0;
  for (const r of perUrl) {
    if (r.kind === 'ok') succeeded++;
    else if (r.kind === 'rate_limited') rateLimited++;
    else if (r.kind === 'skipped_duplicate') skippedDuplicate++;
    else if (r.kind === 'deferred') deferred++;
    else failed++;
  }

  return {
    perUrl,
    chunks: chunkResults,
    succeeded,
    rateLimited,
    failed,
    skippedDuplicate,
    deferred,
    durationMs: clock() - startedAt,
    budgetExhausted,
  };
}

/** Exported for testability. */
export const __testing__ = { parseRetryAfter, backoffMs, DEFAULTS };

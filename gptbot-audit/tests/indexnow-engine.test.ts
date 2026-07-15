// tests/indexnow-engine.test.ts
//
// Unit tests for the chunked IndexNow submission engine. The engine is
// deterministic when driven by an injected clock + sleep + fetch, which
// is how every scenario below works.
//
// Run via:
//   node --import tsx --test tests/indexnow-engine.test.ts

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { runChunkedSubmit, __testing__ } from '../functions/lib/indexnow/submit-engine.ts';

const { parseRetryAfter } = __testing__;

// ─── Helpers ─────────────────────────────────────────────────────────

function makeClock(start: number) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; return t; },
  };
}

function makeRecorder() {
  const calls: Array<{ url: string; body: unknown }> = [];
  return {
    calls,
    fetch: (responses: Array<{ status: number; body?: string; headers?: Record<string, string> }>) => {
      let i = 0;
      const fetcher: typeof fetch = async (url, init) => {
        const r = responses[Math.min(i, responses.length - 1)];
        i++;
        calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
        const headers = new Headers();
        for (const [k, v] of Object.entries(r.headers || {})) headers.set(k, v);
        const responseBody = r.body || '';
        return new Response(responseBody, { status: r.status, headers });
      };
      return fetcher;
    },
  };
}

function buildPayload(urls: string[]) {
  return { host: 'gptbot.uz', key: 'k', keyLocation: 'https://gptbot.uz/k.txt', urlList: urls };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('runChunkedSubmit', () => {
  test('Retry-After header is parsed and respected', async () => {
    assert.equal(parseRetryAfter('30'), 30_000);
    assert.equal(parseRetryAfter('5'), 5_000);
    assert.equal(parseRetryAfter(null), 0);
    assert.equal(parseRetryAfter(''), 0);
    // Date form
    const future = new Date(Date.now() + 12_000).toUTCString();
    const got = parseRetryAfter(future);
    assert.ok(got >= 10_000 && got <= 13_000, `expected ~12000ms, got ${got}`);
    // Cap: large deltas are clamped (no infinite waits).
    assert.equal(parseRetryAfter('600'), 60_000);
  });

  test('single chunk success returns kind=ok for every URL', async () => {
    const urls = Array.from({ length: 7 }, (_, i) => `https://gptbot.uz/p${i}/`);
    const rec = makeRecorder();
    const fetcher = rec.fetch([{ status: 200, body: 'ok' }]);
    const sleeps: number[] = [];
    const result = await runChunkedSubmit({
      urls,
      recentSuccess: new Map(),
      buildPayload,
      fetcher,
      sleep: async (ms) => { sleeps.push(ms); },
      options: { chunkSize: 10, interChunkMs: 100, wallBudgetMs: 60_000 },
    });
    assert.equal(rec.calls.length, 1);
    assert.equal(result.succeeded, 7);
    assert.equal(result.failed, 0);
    assert.equal(result.deferred, 0);
    assert.equal(result.skippedDuplicate, 0);
    assert.equal(result.chunks.length, 1);
    assert.equal(result.chunks[0].upstreamStatus, 200);
    // No inter-chunk sleep when there is only one chunk.
    assert.deepEqual(sleeps, []);
  });

  test('chunks of size 10 — 25 URLs produce 3 chunks with 2 inter-chunk sleeps', async () => {
    const urls = Array.from({ length: 25 }, (_, i) => `https://gptbot.uz/p${i}/`);
    const rec = makeRecorder();
    const fetcher = rec.fetch([{ status: 202, body: 'accepted' }]);
    const sleeps: number[] = [];
    const result = await runChunkedSubmit({
      urls,
      recentSuccess: new Map(),
      buildPayload,
      fetcher,
      sleep: async (ms) => { sleeps.push(ms); },
      options: { chunkSize: 10, interChunkMs: 500, interChunkJitterMs: 0, wallBudgetMs: 60_000 },
    });
    assert.equal(result.chunks.length, 3);
    assert.equal(rec.calls.length, 3);
    // Two waits (chunks 1 and 2 have a pre-wait). Each ≈ 500 ms.
    assert.equal(sleeps.filter((s) => s >= 500 && s <= 1000).length, 2);
    assert.equal(result.succeeded, 25);
    // Each chunk got the right URL count.
    assert.deepEqual(result.chunks.map((c) => c.urlCount), [10, 10, 5]);
  });

  test('429 with Retry-After is honoured and retry succeeds', async () => {
    const urls = ['https://gptbot.uz/a/'];
    const rec = makeRecorder();
    const fetcher = rec.fetch([
      { status: 429, body: '{"errorCode":"TooManyRequests"}', headers: { 'Retry-After': '2' } },
      { status: 200, body: 'ok' },
    ]);
    const sleeps: number[] = [];
    const result = await runChunkedSubmit({
      urls,
      recentSuccess: new Map(),
      buildPayload,
      fetcher,
      sleep: async (ms) => { sleeps.push(ms); },
      options: { wallBudgetMs: 60_000, maxRetriesPerChunk: 2 },
    });
    assert.equal(result.succeeded, 1);
    assert.equal(result.rateLimited, 0);
    assert.equal(result.chunks[0].attempts, 2);
    // The 2-second Retry-After should be the largest sleep we recorded.
    assert.ok(sleeps.some((s) => s >= 2_000 && s <= 2_100), `expected a ~2000ms sleep, got ${JSON.stringify(sleeps)}`);
  });

  test('persistent 429 across all retries is surfaced as kind=rate_limited', async () => {
    const urls = ['https://gptbot.uz/a/'];
    const rec = makeRecorder();
    const fetcher = rec.fetch([
      { status: 429, body: 'busy', headers: { 'Retry-After': '1' } },
      { status: 429, body: 'busy', headers: { 'Retry-After': '1' } },
      { status: 429, body: 'busy', headers: { 'Retry-After': '1' } },
    ]);
    const result = await runChunkedSubmit({
      urls,
      recentSuccess: new Map(),
      buildPayload,
      fetcher,
      sleep: async () => undefined,
      options: { wallBudgetMs: 60_000, maxRetriesPerChunk: 2 },
    });
    assert.equal(result.rateLimited, 1);
    assert.equal(result.succeeded, 0);
    assert.equal(result.perUrl[0].kind, 'rate_limited');
    assert.equal(result.perUrl[0].upstreamStatus, 429);
    assert.ok(result.perUrl[0].retryAfterMs > 0);
  });

  test('4xx other than 429 is terminal (no retries)', async () => {
    const urls = ['https://gptbot.uz/a/'];
    const rec = makeRecorder();
    const fetcher = rec.fetch([{ status: 422, body: 'invalid key' }]);
    const result = await runChunkedSubmit({
      urls,
      recentSuccess: new Map(),
      buildPayload,
      fetcher,
      sleep: async () => undefined,
      options: { wallBudgetMs: 60_000, maxRetriesPerChunk: 2 },
    });
    assert.equal(result.failed, 1);
    assert.equal(result.perUrl[0].kind, 'http_error');
    assert.equal(result.chunks[0].attempts, 1);
  });

  test('5xx retries with backoff then succeeds', async () => {
    const urls = ['https://gptbot.uz/a/'];
    const rec = makeRecorder();
    const fetcher = rec.fetch([
      { status: 503, body: 'busy' },
      { status: 200, body: 'ok' },
    ]);
    const result = await runChunkedSubmit({
      urls,
      recentSuccess: new Map(),
      buildPayload,
      fetcher,
      sleep: async () => undefined,
      options: { wallBudgetMs: 60_000, maxRetriesPerChunk: 2 },
    });
    assert.equal(result.succeeded, 1);
    assert.equal(result.chunks[0].attempts, 2);
  });

  test('24h cool-down skips URLs with recent success', async () => {
    const urls = ['https://gptbot.uz/a/', 'https://gptbot.uz/b/'];
    const recent = new Map<string, { submittedAt: string; ageMs: number }>([
      ['https://gptbot.uz/a/', { submittedAt: new Date(Date.now() - 3_600_000).toISOString(), ageMs: 3_600_000 }],
    ]);
    const rec = makeRecorder();
    const fetcher = rec.fetch([{ status: 200, body: 'ok' }]);
    const result = await runChunkedSubmit({
      urls,
      recentSuccess: recent,
      buildPayload,
      fetcher,
      sleep: async () => undefined,
      options: { wallBudgetMs: 60_000 },
    });
    // /a/ was sent within 24h → skipped. /b/ should be the only payload URL.
    assert.equal(result.skippedDuplicate, 1);
    assert.equal(result.succeeded, 1);
    const lastBody = rec.calls[0].body as { urlList: string[] };
    assert.deepEqual(lastBody.urlList, ['https://gptbot.uz/b/']);
    const skipped = result.perUrl.find((p) => p.kind === 'skipped_duplicate');
    assert.ok(skipped);
    assert.equal(skipped!.url, 'https://gptbot.uz/a/');
  });

  test('cool-down does NOT skip URLs whose previous attempt failed', async () => {
    // recentSuccess only contains URLs with upstream_ok=1 — the caller
    // filters these. So this case is "no entry in the map" which means
    // the URL is included. Confirm the engine respects that.
    const urls = ['https://gptbot.uz/a/'];
    const rec = makeRecorder();
    const fetcher = rec.fetch([{ status: 200, body: 'ok' }]);
    const result = await runChunkedSubmit({
      urls,
      recentSuccess: new Map(), // empty: previous attempt was 429, NOT in the map
      buildPayload,
      fetcher,
      sleep: async () => undefined,
    });
    assert.equal(result.succeeded, 1);
    assert.equal(result.skippedDuplicate, 0);
  });

  test('walltime budget exhausted → remaining URLs come back as deferred', async () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://gptbot.uz/p${i}/`);
    const rec = makeRecorder();
    const fetcher = rec.fetch([{ status: 200, body: 'ok' }]);
    let now = 0;
    const result = await runChunkedSubmit({
      urls,
      recentSuccess: new Map(),
      buildPayload,
      // Each fetch burns 9 seconds of walltime; with budget=15 s the
      // engine should run 1 chunk (9 s + sleep 100 ms), then on the
      // 2nd chunk's pre-sleep guard it sees 9.1 s + 100 ms = 9.2 s and
      // still continues, completing chunk 2 at 18.2 s > 15 s budget.
      // The 3rd chunk's entry guard fires and remaining URLs defer.
      fetcher: async (...args) => {
        now += 9_000;
        return fetcher(...args);
      },
      clock: () => now,
      sleep: async (ms) => { now += ms; },
      options: { wallBudgetMs: 15_000, interChunkMs: 100, interChunkJitterMs: 0, chunkSize: 10 },
    });
    assert.ok(result.budgetExhausted, `expected budgetExhausted, got chunks=${result.chunks.length} succeeded=${result.succeeded} deferred=${result.deferred}`);
    assert.ok(result.deferred > 0);
    assert.ok(result.succeeded > 0);
    assert.equal(result.succeeded + result.deferred + result.failed + result.rateLimited, 30);
  });

  test('network error retried then surfaced as kind=network_error', async () => {
    const urls = ['https://gptbot.uz/a/'];
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      throw new Error('connection reset');
    };
    const result = await runChunkedSubmit({
      urls,
      recentSuccess: new Map(),
      buildPayload,
      fetcher,
      sleep: async () => undefined,
      options: { wallBudgetMs: 60_000, maxRetriesPerChunk: 2 },
    });
    assert.equal(result.failed, 1);
    assert.equal(result.perUrl[0].kind, 'network_error');
    // 1 initial + 2 retries = 3 attempts.
    assert.equal(calls, 3);
  });
});

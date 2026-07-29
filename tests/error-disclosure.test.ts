// R0.3B-CLOSURE-PREP — internal error disclosure regression suite.
//
// Drives the real AI Draft Inbox admin endpoints and the canonical error
// wrapper against a D1 stub that throws chosen values, and asserts that no
// exception text, stack frame, file path, SQL fragment, binding name or secret
// ever reaches the wire. Network is stubbed deny-by-default, so a GitHub write
// would be visible as a recorded call rather than assumed absent.
//
// Run: node --import tsx --test tests/error-disclosure.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { SqliteD1 } from './helpers/sqlite-d1';
import type { Env } from '../functions/_types';
import { signToken } from '../functions/lib/jwt';
import { withErrorHandler, humanMessageFor, redactedInternalError } from '../functions/lib/api-errors';
import { onRequestPost as draftStatusPost } from '../functions/api/admin/ai-drafts/[id]/status';
import { onRequestGet as draftGet } from '../functions/api/admin/ai-drafts/[id]/index';

// ── Poisoned exception payloads ────────────────────────────────────────────
// Every marker below is something a real D1/provider/runtime failure could
// legitimately carry. None of them may appear in a response body.
const MARKERS = {
  sql: 'SELECT * FROM ai_drafts WHERE id = ?',
  table: 'no such table: ai_drafts',
  d1code: 'D1_ERROR',
  filePath: 'C:\\Users\\owner\\gptbot-secure-owner-kit\\vault\\admin.dpapi',
  posixPath: '/opt/gptbot/functions/lib/ai-drafts/store.ts',
  binding: 'GPTBOT_DRAFTS_DB',
  envName: 'JWT_SECRET',
  // Assembled at runtime on purpose. A provider-key-shaped literal in source
  // would correctly trip scripts/scan-secrets.ts, and the right answer is an
  // unambiguous line rather than a widened exemption. The value exists only
  // inside the thrown fixtures below and is not a credential.
  tokenish: ['sk', 'live', 'NOT-A-REAL-KEY', '8f2a1c'].join('-'),
  hostish: 'https://api.example-provider.test/v1/complete?key=DO-NOT-LEAK',
} as const;

const ALL_MARKERS = Object.values(MARKERS);

/**
 * Markers that can only originate from a thrown value. Static operator text is
 * checked against these rather than against the full set: `humanMessageFor`
 * legitimately names the D1 binding and the GitHub token env var so the
 * operator knows which setting to fix. Those are code-derived configuration
 * NAMES — already public in wrangler.toml and this repository — never values,
 * and never derived from an exception.
 */
const EXCEPTION_MARKERS = ALL_MARKERS.filter(
  (m) => m !== MARKERS.binding && m !== MARKERS.envName,
);

function poisonedError(): Error {
  const e = new Error(
    `${MARKERS.d1code}: ${MARKERS.table} while running ${MARKERS.sql} `
    + `(binding ${MARKERS.binding}, ${MARKERS.envName} loaded from ${MARKERS.filePath}, `
    + `upstream ${MARKERS.hostish}, key ${MARKERS.tokenish})`,
  );
  e.stack = `Error: ${e.message}\n    at getDraft (${MARKERS.posixPath}:208:14)\n    at async onRequestPost (${MARKERS.posixPath}:77:21)`;
  return e;
}

function assertNoLeak(text: string, label: string, markers: readonly string[] = ALL_MARKERS): void {
  for (const marker of markers) {
    assert.ok(!text.includes(marker), `${label} leaked ${marker.slice(0, 32)}…`);
  }
  assert.ok(!/\bat \w+ \(/.test(text), `${label} leaked a stack frame`);
  assert.ok(!text.includes('Error:'), `${label} leaked an exception prefix`);
}

// ── Fixtures ───────────────────────────────────────────────────────────────
const MIGRATIONS = path.resolve(import.meta.dirname, '..', 'migrations');
const JWT_SECRET = 'closure-prep-test-secret-not-a-production-value';
const NOW = '2026-07-29T00:00:00.000Z';

function loadMigrations(db: SqliteD1, files: string[]): void {
  for (const file of files) db.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
}

function insertDraft(db: SqliteD1, id: string, status: string): void {
  db.sqlite.prepare(
    `INSERT INTO ai_drafts
      (id, bundle_id, source, schema_version, status, validation_passed,
       validation_issue_count, has_ru, has_uz, primary_title, primary_slug,
       created_at, updated_at)
     VALUES (?,?,?,?,?,1,0,1,0,?,?,?,?)`,
  ).run(id, `bundle-${id}`, 'n8n-seo-autopilot', 'gptbot.article-draft.v1', status, 'Test draft', 'test-draft', NOW, NOW);
}

/**
 * Wraps a real SQLite-backed D1 and makes the statements whose SQL matches
 * `pattern` throw `thrown` instead of executing. Everything else behaves
 * normally, so the endpoint reaches the failure through its real code path.
 */
function throwingD1(db: SqliteD1, pattern: RegExp, thrown: unknown): D1Database {
  const real = db.asD1();
  return {
    prepare(sql: string) {
      if (!pattern.test(sql)) return real.prepare(sql);
      const stmt = {
        bind: () => stmt,
        first: async () => { throw thrown; },
        run: async () => { throw thrown; },
        all: async () => { throw thrown; },
      };
      return stmt as unknown as D1PreparedStatement;
    },
    batch: real.batch.bind(real),
  } as unknown as D1Database;
}

function envWith(db: D1Database): Env {
  return {
    GITHUB_TOKEN: 'gh-test', GITHUB_OWNER: 'o', GITHUB_REPO: 'r', GITHUB_BRANCH: 'b',
    ADMIN_EMAIL: 'admin@example.test', JWT_SECRET, GPTBOT_DRAFTS_DB: db,
  } as Env;
}

async function bearer(env: Env): Promise<string> {
  return `Bearer ${await signToken(env, { email: 'admin@example.test', role: 'admin' })}`;
}

interface FetchLog { url: string; method: string }

function stubFetch(log: FetchLog[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    log.push({ url, method: String(init?.method || 'GET').toUpperCase() });
    return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return () => { globalThis.fetch = original; };
}

async function callStatus(env: Env, id: string, body: string, auth?: string): Promise<Response> {
  return await draftStatusPost({
    request: new Request(`https://gptbot.uz/api/admin/ai-drafts/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      body,
    }),
    env,
    params: { id },
    waitUntil: () => undefined,
  } as never);
}

/** Silence the deliberate server-side console.error noise these tests provoke. */
function muteConsoleError(): { restore: () => void; lines: string[] } {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  return { restore: () => { console.error = original; }, lines };
}

// ═══ 1. Every thrown shape is redacted ═════════════════════════════════════

const THROWN_SHAPES: Array<{ label: string; make: () => unknown }> = [
  { label: 'Error with SQL, path, binding and token detail', make: poisonedError },
  { label: 'thrown string', make: () => `${MARKERS.d1code}: ${MARKERS.table} ${MARKERS.tokenish}` },
  { label: 'thrown plain object', make: () => ({ message: MARKERS.sql, path: MARKERS.filePath, key: MARKERS.tokenish }) },
  { label: 'thrown null', make: () => null },
  { label: 'thrown undefined', make: () => undefined },
  { label: 'D1-shaped exception subclass', make: () => {
    class D1Error extends Error {}
    const e = new D1Error(`${MARKERS.d1code}: ${MARKERS.table} — ${MARKERS.sql}`);
    e.stack = `D1Error: ${e.message}\n    at prepare (${MARKERS.posixPath}:12:3)`;
    return e;
  } },
];

for (const shape of THROWN_SHAPES) {
  test(`draft status: a read failure (${shape.label}) returns a redacted 500`, async () => {
    const log: FetchLog[] = [];
    const restoreFetch = stubFetch(log);
    const muted = muteConsoleError();
    try {
      const db = new SqliteD1();
      loadMigrations(db, ['0001_ai_drafts.sql']);
      insertDraft(db, 'draft_read', 'pending_review');
      const env = envWith(throwingD1(db, /SELECT \* FROM ai_drafts/, shape.make()));

      const res = await callStatus(env, 'draft_read', JSON.stringify({ status: 'rejected' }), await bearer(env));
      assert.equal(res.status, 500);
      const text = await res.text();
      assertNoLeak(text, shape.label);

      const body = JSON.parse(text) as { error: string; request_id: string };
      assert.equal(body.error, 'internal_error');
      assert.match(body.request_id, /^req_[a-z0-9]+$/);
      assert.deepEqual(Object.keys(body).sort(), ['error', 'request_id']);
      assert.equal(res.headers.get('x-request-id'), body.request_id);
      assert.equal(res.headers.get('Cache-Control'), 'no-store');

      // The row is untouched and nothing was published.
      assert.equal(
        db.rows<{ status: string }>('SELECT status FROM ai_drafts WHERE id = ?', 'draft_read')[0].status,
        'pending_review',
      );
      assert.deepEqual(log.filter((c) => c.url.includes('api.github.com')), []);
    } finally { muted.restore(); restoreFetch(); }
  });
}

test('draft status: a write failure is redacted and leaves no raw detail in the audit trail', async () => {
  const log: FetchLog[] = [];
  const restoreFetch = stubFetch(log);
  const muted = muteConsoleError();
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0001_ai_drafts.sql']);
    insertDraft(db, 'draft_write', 'pending_review');
    // The read succeeds; the UPDATE throws. This is the branch the previous
    // implementation guarded — and the one that echoed the exception.
    const env = envWith(throwingD1(db, /UPDATE ai_drafts/, poisonedError()));

    const res = await callStatus(env, 'draft_write', JSON.stringify({ status: 'rejected', note: 'reviewer note' }), await bearer(env));
    assert.equal(res.status, 500);
    assertNoLeak(await res.text(), 'write failure');

    assert.equal(
      db.rows<{ status: string }>('SELECT status FROM ai_drafts WHERE id = ?', 'draft_write')[0].status,
      'pending_review',
    );
    // Analytics / audit rows must not become a second disclosure channel.
    const audit = db.rows<{ details_json: string | null; action: string }>('SELECT action, details_json FROM ai_draft_audit');
    for (const row of audit) {
      for (const marker of ALL_MARKERS) {
        assert.ok(!(row.details_json || '').includes(marker), `audit row ${row.action} leaked ${marker.slice(0, 24)}…`);
      }
    }
  } finally { muted.restore(); restoreFetch(); }
});

test('draft status: the redacted response is stable and correlates through a fresh request_id', async () => {
  const restoreFetch = stubFetch([]);
  const muted = muteConsoleError();
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0001_ai_drafts.sql']);
    insertDraft(db, 'draft_stable', 'pending_review');
    const env = envWith(throwingD1(db, /SELECT \* FROM ai_drafts/, poisonedError()));
    const token = await bearer(env);

    const first = JSON.parse(await (await callStatus(env, 'draft_stable', JSON.stringify({ status: 'rejected' }), token)).text()) as { error: string; request_id: string };
    const second = JSON.parse(await (await callStatus(env, 'draft_stable', JSON.stringify({ status: 'rejected' }), token)).text()) as { error: string; request_id: string };

    assert.equal(first.error, 'internal_error');
    assert.equal(second.error, first.error, 'the public token is stable across failures');
    assert.notEqual(second.request_id, first.request_id, 'each failure gets its own correlation id');
    // The real detail is still available to the operator, server-side only.
    assert.ok(muted.lines.some((l) => l.includes(MARKERS.table)), 'the server log keeps the actionable detail');
    assert.ok(muted.lines.every((l) => l.length < 4000), 'server log lines stay bounded');
  } finally { muted.restore(); restoreFetch(); }
});

test('draft detail endpoint: the same redaction applies to the GET path', async () => {
  const restoreFetch = stubFetch([]);
  const muted = muteConsoleError();
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0001_ai_drafts.sql']);
    insertDraft(db, 'draft_get', 'pending_review');
    const env = envWith(throwingD1(db, /SELECT \* FROM ai_drafts/, poisonedError()));

    const res = await draftGet({
      request: new Request('https://gptbot.uz/api/admin/ai-drafts/draft_get', {
        headers: { Authorization: await bearer(env) },
      }),
      env,
      params: { id: 'draft_get' },
      waitUntil: () => undefined,
    } as never);
    assert.equal(res.status, 500);
    const text = await res.text();
    assertNoLeak(text, 'draft GET');
    assert.equal((JSON.parse(text) as { error: string }).error, 'internal_error');
  } finally { muted.restore(); restoreFetch(); }
});

// ═══ 2. The canonical wrapper no longer echoes the exception ═══════════════

test('withErrorHandler: an unclassifiable exception produces a detail-free INTERNAL_ERROR envelope', async () => {
  const muted = muteConsoleError();
  try {
    // Deliberately free of the tokens `classifyError` keys on, so this lands on
    // the INTERNAL_ERROR default branch.
    const opaque = new Error(`unexpected failure reading ${MARKERS.filePath} with key ${MARKERS.tokenish}`);
    opaque.stack = `Error: ${opaque.message}\n    at handler (${MARKERS.posixPath}:5:1)`;
    const handler = withErrorHandler('test.endpoint', async () => { throw opaque; });
    const res = await handler({
      request: new Request('https://gptbot.uz/api/test'),
      env: {},
      waitUntil: () => undefined,
    } as never);

    assert.equal(res.status, 500);
    const text = await res.text();
    assertNoLeak(text, 'withErrorHandler');
    const body = JSON.parse(text) as {
      success: false;
      error: { code: string; message: string; request_id: string; endpoint: string; retryable: boolean };
    };
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.endpoint, 'test.endpoint');
    assert.match(body.error.request_id, /^req_[a-z0-9]+$/);
    assert.equal(body.error.message, humanMessageFor('INTERNAL_ERROR'));
  } finally { muted.restore(); }
});

test('withErrorHandler: a D1-shaped exception is classified without carrying its SQL', async () => {
  const muted = muteConsoleError();
  try {
    const handler = withErrorHandler('test.endpoint', async () => { throw poisonedError(); });
    const res = await handler({ request: new Request('https://gptbot.uz/api/test'), env: {}, waitUntil: () => undefined } as never);
    // classifyError sees "D1_" and maps to D1_QUERY_FAILED, whose status is 502.
    assert.equal(res.status, 502);
    const text = await res.text();
    assertNoLeak(text, 'withErrorHandler D1');
    assert.equal((JSON.parse(text) as { error: { code: string } }).error.code, 'D1_QUERY_FAILED');
  } finally { muted.restore(); }
});

test('withErrorHandler: a classified upstream failure keeps its code without carrying the reason text', async () => {
  const muted = muteConsoleError();
  try {
    const cases: Array<{ thrown: Error; code: string }> = [
      { thrown: Object.assign(new Error(`D1_ERROR: ${MARKERS.table} ${MARKERS.sql}`), {}), code: 'D1_QUERY_FAILED' },
      { thrown: new Error(`GitHub graphql failed: rate limit exceeded for ${MARKERS.tokenish}`), code: 'GITHUB_RATE_LIMITED' },
      { thrown: new Error(`Operation timed out contacting ${MARKERS.hostish}`), code: 'INTEGRATION_TIMEOUT' },
    ];
    for (const c of cases) {
      const handler = withErrorHandler('test.endpoint', async () => { throw c.thrown; });
      const res = await handler({ request: new Request('https://gptbot.uz/api/test'), env: {}, waitUntil: () => undefined } as never);
      const text = await res.text();
      assertNoLeak(text, `withErrorHandler ${c.code}`);
      assert.equal((JSON.parse(text) as { error: { code: string } }).error.code, c.code);
    }
  } finally { muted.restore(); }
});

test('humanMessageFor is a pure function of the code and cannot be fed an exception', () => {
  const codes = [
    'GITHUB_RATE_LIMITED', 'GITHUB_AUTH_FAILED', 'GITHUB_UNAVAILABLE', 'D1_UNAVAILABLE',
    'D1_QUERY_FAILED', 'INTEGRATION_TIMEOUT', 'INTEGRATION_UNAVAILABLE', 'INTERNAL_ERROR',
    'UNAUTHENTICATED', 'FORBIDDEN', 'BAD_REQUEST', 'NOT_FOUND', 'METHOD_NOT_ALLOWED',
    'CONFLICT', 'GITHUB_AUTH_FAILED', 'COCKPIT_PARTIAL_FAILURE',
  ] as const;
  for (const code of codes) {
    const message = humanMessageFor(code);
    assert.ok(message.length > 0, `${code} has a message`);
    // Static operator text may name a configuration setting the owner must fix;
    // it must never carry anything that could only come from a thrown value.
    assertNoLeak(message, `humanMessageFor(${code})`, EXCEPTION_MARKERS);
    assert.ok(message.length <= 200, `${code} message stays bounded`);
  }
  // Same code in, same string out — no hidden dependency on ambient state.
  assert.equal(humanMessageFor('D1_QUERY_FAILED'), humanMessageFor('D1_QUERY_FAILED'));
  assert.equal(humanMessageFor.length, 1, 'the helper takes the code only');
});

test('redactedInternalError never varies its public body with the thrown value', async () => {
  const muted = muteConsoleError();
  try {
    const bodies: string[] = [];
    for (const thrown of [poisonedError(), MARKERS.sql, { secret: MARKERS.tokenish }, null, undefined, 42]) {
      const res = redactedInternalError('test.endpoint', thrown);
      assert.equal(res.status, 500);
      const parsed = JSON.parse(await res.text()) as { error: string; request_id: string };
      assertNoLeak(JSON.stringify(parsed), 'redactedInternalError');
      bodies.push(parsed.error);
    }
    assert.deepEqual([...new Set(bodies)], ['internal_error']);
  } finally { muted.restore(); }
});

// ═══ 3. The success and refusal contracts are unchanged ════════════════════

test('draft status: the healthy contract is untouched by the redaction work', async () => {
  const restoreFetch = stubFetch([]);
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0001_ai_drafts.sql']);
    insertDraft(db, 'draft_happy', 'pending_review');
    const env = envWith(db.asD1());

    const res = await callStatus(env, 'draft_happy', JSON.stringify({ status: 'needs_revision' }), await bearer(env));
    assert.equal(res.status, 200);
    const body = await res.json() as { draft: { status: string } };
    assert.equal(body.draft.status, 'needs_revision');
    assert.equal(db.rows<{ status: string }>('SELECT status FROM ai_drafts WHERE id = ?', 'draft_happy')[0].status, 'needs_revision');
  } finally { restoreFetch(); }
});

test('draft status: refusals keep their exact codes and neutral bodies', async () => {
  const log: FetchLog[] = [];
  const restoreFetch = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0001_ai_drafts.sql']);
    insertDraft(db, 'draft_rules', 'pending_review');
    insertDraft(db, 'draft_done', 'imported');
    const env = envWith(db.asD1());
    const token = await bearer(env);

    // Unauthenticated.
    assert.equal((await callStatus(env, 'draft_rules', JSON.stringify({ status: 'rejected' }))).status, 401);

    // Invalid / missing status fails closed with the same 400 body.
    for (const raw of [JSON.stringify({ status: 'published' }), JSON.stringify({}), JSON.stringify('rejected')]) {
      const res = await callStatus(env, 'draft_rules', raw, token);
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: 'status must be pending_review | needs_revision | rejected' });
    }

    // No auto-publish: `imported` is unreachable and nothing moves.
    const imported = await callStatus(env, 'draft_rules', JSON.stringify({ status: 'imported' }), token);
    assert.equal(imported.status, 400);
    const row = db.rows<{ status: string; imported_at: string | null }>('SELECT status, imported_at FROM ai_drafts WHERE id = ?', 'draft_rules')[0];
    assert.equal(row.status, 'pending_review');
    assert.equal(row.imported_at, null);

    // A terminal draft refuses the transition.
    assert.equal((await callStatus(env, 'draft_done', JSON.stringify({ status: 'rejected' }), token)).status, 409);

    // Unknown id: neutral not-found that names nothing.
    const missing = await callStatus(env, 'draft_elsewhere', JSON.stringify({ status: 'rejected' }), token);
    assert.equal(missing.status, 404);
    const missingText = await missing.text();
    assert.equal(missingText, JSON.stringify({ error: 'Draft not found' }));
    assert.ok(!missingText.includes('draft_elsewhere'));
    assert.ok(!missingText.includes('draft_rules'));

    // Nothing in this whole battery touched GitHub.
    assert.deepEqual(log.filter((c) => c.url.includes('api.github.com')), []);
  } finally { restoreFetch(); }
});

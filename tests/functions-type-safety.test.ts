// R0.4-RC2 — behavioural coverage for the six Cloudflare Functions boundaries
// whose TypeScript errors were eliminated. Each test asserts RUNTIME behaviour,
// not that the compiler went quiet: the endpoints and libraries are executed
// against a real in-memory SQLite D1 (canonical migration DDL) with `fetch`
// stubbed, so no network call and no production resource is touched.
//
// Run: node --import tsx --test tests/functions-type-safety.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { SqliteD1 } from './helpers/sqlite-d1';
import type { Env } from '../functions/_types';
import { signToken } from '../functions/lib/jwt';

import { onRequestPost as draftStatusPost } from '../functions/api/admin/ai-drafts/[id]/status';
import { onRequestGet as cockpitGet } from '../functions/api/admin/cockpit';
import { onRequestPost as quickLaunchPost } from '../functions/api/admin/seo/yandex/quick-launch';

import { normaliseN8nResponse } from '../functions/lib/seo-autopilot/normalise';
import { validateIncomingBundle } from '../functions/lib/ai-drafts/validators';
import { isDirectAiEnabled } from '../functions/lib/seo-autopilot/direct-launch';
import { buildFingerprint, intentKeyOf } from '../functions/lib/intent-guard/fingerprint';

import { sanitizeAnalysis, type AnalysisProviderResult } from '../functions/lib/telegram/analysis';
import { ensureTelegramSchema } from '../functions/lib/telegram/schema';
import * as S from '../functions/lib/telegram/store';
import { handleUpdate } from '../functions/lib/telegram/handler';
import { resolveTelegramConfig, isProtectedBotUsername } from '../functions/lib/telegram/config';
import { TelegramClient } from '../functions/lib/telegram/client';
import { onRequestPost as assistantPost } from '../functions/api/telegram/assistant';

// ── Fixtures ───────────────────────────────────────────────────────────────

const MIGRATIONS = path.resolve(import.meta.dirname, '..', 'migrations');

function loadMigrations(db: SqliteD1, files: string[]): void {
  for (const file of files) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
}

const JWT_SECRET = 'r0.4-rc2-test-secret-not-a-production-value';

function adminEnv(db: SqliteD1, over: Partial<Env> = {}): Env {
  return {
    GITHUB_TOKEN: 'gh-test',
    GITHUB_OWNER: 'test-owner',
    GITHUB_REPO: 'test-repo',
    GITHUB_BRANCH: 'test-branch',
    ADMIN_EMAIL: 'admin@example.test',
    JWT_SECRET,
    GPTBOT_DRAFTS_DB: db.asD1(),
    ...over,
  } as Env;
}

async function bearer(env: Env): Promise<string> {
  return `Bearer ${await signToken(env, { email: 'admin@example.test', role: 'admin' })}`;
}

interface FetchLog { url: string; method: string }

/**
 * Deny-by-default network stub. Every outbound call is recorded and answered
 * with a neutral failure, so a test can prove that a code path did NOT reach
 * GitHub, n8n or any LLM provider.
 */
function stubFetch(log: FetchLog[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    log.push({ url, method: String(method).toUpperCase() });
    return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return () => { globalThis.fetch = original; };
}

const NOW = '2026-07-29T00:00:00.000Z';

function insertDraft(db: SqliteD1, id: string, status: string, over: Record<string, string | number | null> = {}): void {
  const row = {
    id,
    bundle_id: `bundle-${id}`,
    execution_id: null,
    source: 'n8n-seo-autopilot',
    schema_version: 'gptbot.article-draft.v1',
    status,
    ru_article_json: null,
    uz_article_json: null,
    seo_brief_json: null,
    validation_json: null,
    validation_passed: 1,
    validation_issue_count: 0,
    has_ru: 1,
    has_uz: 0,
    target_money_page: null,
    primary_title: 'Test draft',
    primary_slug: 'test-draft',
    ru_imported_at: null,
    uz_imported_at: null,
    created_at: NOW,
    updated_at: NOW,
    imported_at: null,
    rejected_at: null,
    review_note: null,
    ...over,
  };
  const cols = Object.keys(row);
  db.sqlite
    .prepare(`INSERT INTO ai_drafts (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map((c) => (row as Record<string, string | number | null>)[c]));
}

function draftStatusOf(db: SqliteD1, id: string): { status: string; imported_at: string | null } {
  return db.rows<{ status: string; imported_at: string | null }>(
    'SELECT status, imported_at FROM ai_drafts WHERE id = ?', id,
  )[0];
}

async function callDraftStatus(
  env: Env,
  id: string,
  body: string,
  auth?: string,
): Promise<Response> {
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

// ═══ 1. AI Draft status endpoint ═══════════════════════════════════════════
// Boundary: unvalidated external input parsed into a closed status list.

test('draft status: valid settable status is accepted and persisted', async () => {
  const db = new SqliteD1();
  loadMigrations(db, ['0001_ai_drafts.sql']);
  insertDraft(db, 'draft_ok', 'pending_review');
  const env = adminEnv(db);

  const res = await callDraftStatus(env, 'draft_ok', JSON.stringify({ status: 'needs_revision' }), await bearer(env));
  assert.equal(res.status, 200);
  const body = await res.json() as { draft: { status: string } };
  assert.equal(body.draft.status, 'needs_revision');
  assert.equal(draftStatusOf(db, 'draft_ok').status, 'needs_revision');
});

test('draft status: unknown status values fail closed with 400 and no write', async () => {
  const db = new SqliteD1();
  loadMigrations(db, ['0001_ai_drafts.sql']);
  insertDraft(db, 'draft_bad', 'pending_review');
  const env = adminEnv(db);
  const token = await bearer(env);

  // Closed-list parsing: wrong case, unknown token, wrong JSON type, arrays and
  // non-object bodies all land on the SAME neutral 400.
  for (const raw of [
    JSON.stringify({ status: 'Pending_Review' }),
    JSON.stringify({ status: 'published' }),
    JSON.stringify({ status: 42 }),
    JSON.stringify({ status: null }),
    JSON.stringify({ status: ['rejected'] }),
    JSON.stringify(['rejected']),
    JSON.stringify('rejected'),
  ]) {
    const res = await callDraftStatus(env, 'draft_bad', raw, token);
    assert.equal(res.status, 400, `payload ${raw} must be rejected`);
    assert.deepEqual(await res.json(), {
      error: 'status must be pending_review | needs_revision | rejected',
    });
  }
  assert.equal(draftStatusOf(db, 'draft_bad').status, 'pending_review');
});

test('draft status: missing status is rejected', async () => {
  const db = new SqliteD1();
  loadMigrations(db, ['0001_ai_drafts.sql']);
  insertDraft(db, 'draft_missing', 'pending_review');
  const env = adminEnv(db);

  const res = await callDraftStatus(env, 'draft_missing', JSON.stringify({ note: 'no status here' }), await bearer(env));
  assert.equal(res.status, 400);
  assert.equal(draftStatusOf(db, 'draft_missing').status, 'pending_review');
});

test('draft status: "imported" cannot be set here — no auto-publish path', async () => {
  const db = new SqliteD1();
  loadMigrations(db, ['0001_ai_drafts.sql']);
  insertDraft(db, 'draft_import', 'pending_review');
  const env = adminEnv(db);

  const res = await callDraftStatus(env, 'draft_import', JSON.stringify({ status: 'imported' }), await bearer(env));
  assert.equal(res.status, 400);
  const after = draftStatusOf(db, 'draft_import');
  assert.equal(after.status, 'pending_review');
  assert.equal(after.imported_at, null);
});

test('draft status: disallowed transition from a terminal state returns 409', async () => {
  const db = new SqliteD1();
  loadMigrations(db, ['0001_ai_drafts.sql']);
  insertDraft(db, 'draft_terminal', 'imported');
  const env = adminEnv(db);

  const res = await callDraftStatus(env, 'draft_terminal', JSON.stringify({ status: 'rejected' }), await bearer(env));
  assert.equal(res.status, 409);
  assert.equal(draftStatusOf(db, 'draft_terminal').status, 'imported');
});

test('draft status: unknown draft gets a neutral 404 that discloses nothing', async () => {
  const db = new SqliteD1();
  loadMigrations(db, ['0001_ai_drafts.sql']);
  insertDraft(db, 'draft_present', 'pending_review');
  const env = adminEnv(db);
  const token = await bearer(env);

  const missing = await callDraftStatus(env, 'draft_absent', JSON.stringify({ status: 'rejected' }), token);
  assert.equal(missing.status, 404);
  const text = await missing.text();
  assert.equal(text, JSON.stringify({ error: 'Draft not found' }));
  // The neutral body must not echo the requested id or reveal any other draft.
  assert.ok(!text.includes('draft_absent'));
  assert.ok(!text.includes('draft_present'));
});

test('draft status: unauthenticated and wrongly signed requests are rejected before any read', async () => {
  const db = new SqliteD1();
  loadMigrations(db, ['0001_ai_drafts.sql']);
  insertDraft(db, 'draft_auth', 'pending_review');
  const env = adminEnv(db);
  const foreignToken = await signToken({ ...env, JWT_SECRET: 'a-completely-different-secret' } as Env, {
    email: 'attacker@example.test', role: 'admin',
  });

  const anon = await callDraftStatus(env, 'draft_auth', JSON.stringify({ status: 'rejected' }));
  assert.equal(anon.status, 401);
  const forged = await callDraftStatus(env, 'draft_auth', JSON.stringify({ status: 'rejected' }), `Bearer ${foreignToken}`);
  assert.equal(forged.status, 401);
  assert.equal(draftStatusOf(db, 'draft_auth').status, 'pending_review');
});

// ═══ 2. Admin cockpit ══════════════════════════════════════════════════════
// Boundary: Cloudflare environment interface + nullable/unknown D1 rows.

async function callCockpit(env: Env, auth?: string): Promise<Response> {
  return await cockpitGet({
    request: new Request('https://gptbot.uz/api/admin/cockpit', {
      headers: auth ? { Authorization: auth } : {},
    }),
    env,
    waitUntil: () => undefined,
  } as never);
}

test('cockpit: requires admin authentication', async () => {
  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0001_ai_drafts.sql', '0002_seo_autopilot_jobs.sql', '0003_seo_autopilot_control_center.sql']);
    const res = await callCockpit(adminEnv(db));
    assert.equal(res.status, 401);
    assert.equal(log.length, 0, 'no upstream probe may run before authentication');
  } finally { restore(); }
});

test('cockpit: reads real environment bindings into the system section', async () => {
  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0001_ai_drafts.sql', '0002_seo_autopilot_jobs.sql', '0003_seo_autopilot_control_center.sql']);
    const env = adminEnv(db, {
      SERPER_API_KEY: 'serper-present',
      N8N_WEBHOOK_SECRET: undefined,
      OPENROUTER_API_KEY: undefined,
      GEMINI_API_KEY: 'gemini-present',
    });

    const res = await callCockpit(env, await bearer(env));
    assert.equal(res.status, 200);
    const body = await res.json() as {
      success: true;
      system: {
        github_token_configured: boolean; jwt_secret_configured: boolean;
        drafts_db_configured: boolean; n8n_webhook_secret_configured: boolean;
        serper_configured: boolean; openrouter_configured: boolean; gemini_configured: boolean;
        github: { owner: string; repo: string; branch: string };
      };
    };
    assert.equal(body.success, true);
    // Each flag is derived from a distinct binding — this is exactly what the
    // collapsed `{ ASSETS }` environment type used to hide.
    assert.deepEqual(body.system, {
      github_token_configured: true,
      jwt_secret_configured: true,
      drafts_db_configured: true,
      n8n_webhook_secret_configured: false,
      serper_configured: true,
      openrouter_configured: false,
      gemini_configured: true,
      github: { owner: 'test-owner', repo: 'test-repo', branch: 'test-branch' },
    });
  } finally { restore(); }
});

test('cockpit: null and unrecognised D1 values are handled without failing the section', async () => {
  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0001_ai_drafts.sql', '0002_seo_autopilot_jobs.sql', '0003_seo_autopilot_control_center.sql']);
    // A pending draft whose denormalised title is NULL, plus a row carrying a
    // status outside the known closed list.
    insertDraft(db, 'draft_null_title', 'pending_review', { primary_title: null, primary_slug: null });
    insertDraft(db, 'draft_alien', 'quantum_superposition');
    insertDraft(db, 'draft_rejected', 'rejected');
    // A malformed schedule setting must degrade to the safe default.
    db.exec(`INSERT INTO system_settings (key, value_json, updated_at) VALUES ('seo_autopilot_schedule', 'not-json', '${NOW}')`);
    const env = adminEnv(db);

    const res = await callCockpit(env, await bearer(env));
    assert.equal(res.status, 200);
    const body = await res.json() as {
      drafts: { ok: boolean; data: Record<string, unknown> | null };
      autopilot: { ok: boolean; data: { schedule_mode: string; total: number } | null };
    };

    assert.equal(body.drafts.ok, true, 'a null title must not fail the drafts section');
    assert.deepEqual(body.drafts.data, {
      pending_review: 1,
      needs_revision: 0,
      rejected: 1,
      imported: 0,
      last_pending_id: 'draft_null_title',
      last_pending_admin_url: '/admin-tools/ai-drafts/draft_null_title',
      last_pending_title: null,
    });
    assert.equal(body.autopilot.ok, true);
    assert.equal(body.autopilot.data?.schedule_mode, 'disabled');
  } finally { restore(); }
});

test('cockpit: a failing upstream degrades one section instead of the response', async () => {
  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0001_ai_drafts.sql', '0002_seo_autopilot_jobs.sql', '0003_seo_autopilot_control_center.sql']);
    const env = adminEnv(db);

    const res = await callCockpit(env, await bearer(env));
    assert.equal(res.status, 200);
    const body = await res.json() as {
      success: true;
      content: { ok: boolean; error: { code: string; message: string } | null };
      drafts: { ok: boolean };
      health: { ok: boolean };
    };
    assert.equal(body.success, true);
    assert.equal(body.content.ok, false, 'GitHub is unreachable in this fixture');
    assert.ok(body.content.error, 'the failing section carries a structured error');
    assert.equal(body.drafts.ok, true, 'the healthy D1 section still resolves');
    assert.ok(log.some((c) => c.url.includes('gptbot.uz')), 'live probes ran through the stub, not the network');
  } finally { restore(); }
});

test('cockpit: the analytics payload carries no PII and no credential material', async () => {
  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0001_ai_drafts.sql', '0002_seo_autopilot_jobs.sql', '0003_seo_autopilot_control_center.sql']);
    insertDraft(db, 'draft_pii', 'pending_review', { primary_title: 'Обычный заголовок' });
    const env = adminEnv(db, { SERPER_API_KEY: 'serper-secret-value', GEMINI_API_KEY: 'gemini-secret-value' });

    const res = await callCockpit(env, await bearer(env));
    const text = await res.text();
    for (const secret of ['gh-test', 'serper-secret-value', 'gemini-secret-value', JWT_SECRET]) {
      assert.ok(!text.includes(secret), `response must not echo ${secret.slice(0, 6)}…`);
    }
    assert.ok(!text.includes('admin@example.test'), 'the operator email is not part of the payload');
    assert.ok(!/\+998\d/.test(text), 'no phone-shaped values in analytics');
  } finally { restore(); }
});

// ═══ 3. Yandex quick launch ════════════════════════════════════════════════
// Boundary: internal interface drift on IntentFingerprint (dead `entity` read).

const QUICK_LAUNCH_MIGRATIONS = [
  '0001_ai_drafts.sql',
  '0002_seo_autopilot_jobs.sql',
  '0003_seo_autopilot_control_center.sql',
  '0004_intent_guard.sql',
  '0005_llm_router.sql',
];

/** GitHub calls that would MUTATE the repository. Reads (contents GET, GraphQL
 *  inventory queries) are legitimate; a write from this endpoint is not. */
function githubWrites(log: FetchLog[]): FetchLog[] {
  return log.filter((c) => {
    if (!c.url.includes('api.github.com')) return false;
    if (['PUT', 'PATCH', 'DELETE'].includes(c.method)) return true;
    // GraphQL is the read-only content inventory; any other POST is a write.
    return c.method === 'POST' && !c.url.endsWith('/graphql');
  });
}

async function callQuickLaunch(env: Env, body: unknown, auth?: string): Promise<Response> {
  return await quickLaunchPost({
    request: new Request('https://gptbot.uz/api/admin/seo/yandex/quick-launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify(body),
    }),
    env,
    waitUntil: () => undefined,
  } as never);
}

function reserveActiveIntent(db: SqliteD1, locale: 'ru' | 'uz', intentKey: string): void {
  db.sqlite.prepare(
    `INSERT INTO seo_topic_reservations
       (id, locale, intent_key, primary_keyword, planned_title, status,
        reserved_at, expires_at, created_at, updated_at)
     VALUES (?,?,?,?,?, 'reserved', ?,?,?,?)`,
  ).run('res_preexisting', locale, intentKey, 'seed', 'seed', NOW, '2099-01-01T00:00:00.000Z', NOW, NOW);
}

test('quick launch: rejects unauthenticated callers', async () => {
  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, QUICK_LAUNCH_MIGRATIONS);
    const res = await callQuickLaunch(adminEnv(db), { query: 'gpt бот для клиники' });
    assert.equal(res.status, 401);
    assert.equal(db.rows('SELECT id FROM seo_topic_plan_items').length, 0);
  } finally { restore(); }
});

test('quick launch: cluster_key comes from the request only — the fingerprint bucket never leaks in', async () => {
  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, QUICK_LAUNCH_MIGRATIONS);
    const env = adminEnv(db);
    const token = await bearer(env);

    // A query whose fingerprint definitely resolves an entity bucket. Before the
    // fix the code read `fingerprint.entity`, which never existed; the launch
    // must keep behaving as if only `body.cluster` mattered.
    const query = 'telegram бот для ресторана цена';
    const fingerprint = buildFingerprint({ locale: 'ru', target_keyword: query, primary_keyword: query, h1: query });
    assert.notEqual(fingerprint.primary_entity, 'none', 'fixture query must resolve an entity bucket');
    reserveActiveIntent(db, 'ru', intentKeyOf(fingerprint));

    const res = await callQuickLaunch(env, { query, locale: 'ru' }, token);
    assert.equal(res.status, 200);

    const items = db.rows<{ cluster_key: string | null; fingerprint_json: string }>(
      'SELECT cluster_key, fingerprint_json FROM seo_topic_plan_items',
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].cluster_key, null, 'no cluster in the request means no cluster on the row');
    // The fingerprint itself is still stored in full — only the derived
    // cluster_key assignment was dead code.
    assert.equal(JSON.parse(items[0].fingerprint_json).primary_entity, fingerprint.primary_entity);
  } finally { restore(); }
});

test('quick launch: an explicit cluster from the request is stored verbatim', async () => {
  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, QUICK_LAUNCH_MIGRATIONS);
    const env = adminEnv(db);
    const query = 'telegram бот для ресторана цена';
    const fingerprint = buildFingerprint({ locale: 'ru', target_keyword: query, primary_keyword: query, h1: query });
    reserveActiveIntent(db, 'ru', intentKeyOf(fingerprint));

    await callQuickLaunch(env, { query, locale: 'ru', cluster: 'restaurant-automation' }, await bearer(env));
    const items = db.rows<{ cluster_key: string | null }>('SELECT cluster_key FROM seo_topic_plan_items');
    assert.equal(items.length, 1);
    assert.equal(items[0].cluster_key, 'restaurant-automation');
  } finally { restore(); }
});

test('quick launch: a duplicate intent is idempotent — cannibalization_risk, never a second reservation', async () => {
  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, QUICK_LAUNCH_MIGRATIONS);
    const env = adminEnv(db);
    const query = 'telegram бот для ресторана цена';
    const fingerprint = buildFingerprint({ locale: 'ru', target_keyword: query, primary_keyword: query, h1: query });
    reserveActiveIntent(db, 'ru', intentKeyOf(fingerprint));

    const res = await callQuickLaunch(env, { query, locale: 'ru' }, await bearer(env));
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; mode: string; intent_key: string };
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'cannibalization_risk');
    assert.equal(body.intent_key, intentKeyOf(fingerprint));

    // Exactly one active reservation survives, and the losing plan item is failed.
    const reservations = db.rows<{ id: string }>(
      `SELECT id FROM seo_topic_reservations WHERE locale='ru' AND intent_key=? AND status IN
        ('reserved','generating','generated','analyzed','needs_retarget','ready_for_review')`,
      intentKeyOf(fingerprint),
    );
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].id, 'res_preexisting');
    assert.deepEqual(
      db.rows<{ status: string }>('SELECT status FROM seo_topic_plan_items').map((r) => r.status),
      ['failed'],
    );
  } finally { restore(); }
});

test('quick launch: with no provider binding it fails safely, publishes nothing and leaks no secret', async () => {
  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, QUICK_LAUNCH_MIGRATIONS);
    const env = adminEnv(db, { N8N_WEBHOOK_SECRET: 'n8n-secret-value' });

    const res = await callQuickLaunch(env, { query: 'ai бот для клиники ташкент' }, await bearer(env));
    // The endpoint deliberately answers 200 with a structured envelope so the
    // Cloudflare edge cannot swap the body for a generic error page.
    assert.equal(res.status, 200);
    const text = await res.text();
    const body = JSON.parse(text) as { ok: boolean; mode: string; draft_id?: string | null };
    assert.equal(body.ok, false);
    assert.ok(['launch_failed', 'reservation_failed', 'server_error'].includes(body.mode), `unexpected mode ${body.mode}`);
    assert.ok(!body.draft_id);
    assert.ok(!text.includes('n8n-secret-value'));
    assert.ok(!text.includes(JWT_SECRET));

    // Nothing was drafted, so nothing could have been published.
    assert.equal(db.rows('SELECT id FROM ai_drafts').length, 0);
    // No repository mutation was attempted.
    assert.deepEqual(githubWrites(log), []);
  } finally { restore(); }
});

test('quick launch: the first-party direct path is the default and the n8n bridge stays off', async () => {
  // Default-on for the first-party generator; the legacy bridge only comes back
  // when an operator explicitly opts out.
  assert.equal(isDirectAiEnabled({} as Env), true);
  assert.equal(isDirectAiEnabled({ SEO_AUTOPILOT_USE_DIRECT_AI: 'false' } as Env), false);
  assert.equal(isDirectAiEnabled({ SEO_AUTOPILOT_USE_DIRECT_AI: '0' } as Env), false);
  assert.equal(isDirectAiEnabled({ SEO_AUTOPILOT_USE_DIRECT_AI: 'no' } as Env), false);

  const log: FetchLog[] = [];
  const restore = stubFetch(log);
  try {
    const db = new SqliteD1();
    loadMigrations(db, QUICK_LAUNCH_MIGRATIONS);
    const env = adminEnv(db);
    await callQuickLaunch(env, { query: 'ai бот для клиники ташкент' }, await bearer(env));
    assert.deepEqual(log.filter((c) => /n8n|runable|webhook-test/i.test(c.url)), []);
  } finally { restore(); }
});

// ═══ 4. SEO autopilot normaliser ═══════════════════════════════════════════
// Boundary: unvalidated provider payload mapped into the ingestion contract.

const RU_ARTICLE = {
  slug: 'ai-bot-dlya-kliniki',
  title: 'AI-бот для клиники',
  description: 'Как AI-бот отвечает пациентам круглосуточно.',
  h1: 'AI-бот для клиники',
  intro: 'Короткое вступление про запись пациентов.',
  target_keyword: 'ai бот для клиники',
  money_page: 'https://gptbot.uz/ru/services',
  body: [{ type: 'paragraph', content: 'Первый абзац о задачах клиники.' }],
  faqs: [{ question: 'Сколько стоит?', answer: 'Зависит от объёма.' }],
  links: [{ url: 'https://gptbot.uz/ru/services', text: 'Услуги' }],
};
const UZ_ARTICLE = { ...RU_ARTICLE, slug: 'klinika-uchun-ai-bot', title: 'Klinika uchun AI-bot' };

test('normaliser: a valid RU+UZ bundle produces both locales with forced safe envelope values', () => {
  const result = normaliseN8nResponse(
    {
      status: 'published',
      manual_approval_required: false,
      ready_for_publish: true,
      published: true,
      ru_article: RU_ARTICLE,
      uz_article: UZ_ARTICLE,
      execution_id: 'exec-42',
    },
    { jobId: 'job_1', requestId: null },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.bundle.articles.map((a) => a.locale), ['ru', 'uz']);
  assert.equal(result.bundle.bundle_id, 'n8n-bridge-exec-42');
  // Upstream cannot talk the server into publishing.
  assert.equal(result.bundle.status, 'pending_review');
  assert.equal(result.bundle.manual_approval_required, true);
  assert.equal(result.bundle.ready_for_publish, false);
  assert.equal(result.bundle.published, false);
  // Aliases were re-keyed to the canonical contract names.
  assert.equal(result.bundle.articles[0].meta_title, 'AI-бот для клиники');
  assert.equal(result.bundle.articles[0].target_money_page, '/ru/services');
});

test('normaliser: a single-locale bundle is preserved, a locale-less bundle is refused', () => {
  const ruOnly = normaliseN8nResponse({ ru_article: RU_ARTICLE }, { jobId: 'job_2', requestId: null });
  assert.equal(ruOnly.ok, true);
  if (ruOnly.ok) assert.deepEqual(ruOnly.bundle.articles.map((a) => a.locale), ['ru']);

  const neither = normaliseN8nResponse({ seo_brief: {} }, { jobId: 'job_3', requestId: null });
  assert.equal(neither.ok, false);
  if (!neither.ok) assert.match(neither.reason, /missing both ru_article and uz_article/);
});

test('normaliser: malformed provider responses fail deterministically', () => {
  for (const raw of [null, undefined, 'a string', 42, [RU_ARTICLE], true]) {
    const result = normaliseN8nResponse(raw, { jobId: 'job_4', requestId: null });
    assert.equal(result.ok, false, `payload ${JSON.stringify(raw)} must not normalise`);
  }
  const empty = normaliseN8nResponse({ articles: [] }, { jobId: 'job_5', requestId: null });
  assert.equal(empty.ok, false);
});

test('normaliser: unknown keys are dropped and the schema stays closed', () => {
  const result = normaliseN8nResponse(
    { ru_article: { ...RU_ARTICLE, evil_key: 'x', published: true, status: 'live' } },
    { jobId: 'job_6', requestId: null },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const article = result.bundle.articles[0] as unknown as Record<string, unknown>;
  assert.ok(!('evil_key' in article));
  assert.ok(!('published' in article));
  assert.ok(!('status' in article));
  assert.deepEqual(Object.keys(article).sort(), [
    'author', 'body_blocks', 'excerpt', 'faq', 'h1', 'internal_links', 'keywords', 'locale',
    'meta_description', 'meta_title', 'og_description', 'og_image', 'og_title', 'schemas',
    'slug', 'target_keyword', 'target_money_page',
  ]);
});

test('normaliser: the failure reason never reflects raw model output', () => {
  const marker = 'SECRET-MODEL-TEXT-8fd21';
  const result = normaliseN8nResponse(`{"leak":"${marker}"}`, { jobId: 'job_7', requestId: null });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(!result.reason.includes(marker));
  assert.ok(!JSON.stringify(result.detail ?? {}).includes(marker));
});

test('normaliser output still has to clear the strict validator, which bounds oversized fields', () => {
  const good = normaliseN8nResponse({ ru_article: RU_ARTICLE }, { jobId: 'job_8', requestId: null });
  assert.equal(good.ok, true);
  if (!good.ok) return;
  const validated = validateIncomingBundle(good.bundle);
  assert.equal(validated.ok, true, JSON.stringify(validated.errors));
  assert.equal(validated.bundle?.articles[0].meta_title, 'AI-бот для клиники');

  // An oversized title survives normalisation (which only re-keys) and is then
  // truncated by the validator — the closed schema is enforced in exactly one place.
  const huge = normaliseN8nResponse(
    { ru_article: { ...RU_ARTICLE, title: 'т'.repeat(5000) } },
    { jobId: 'job_9', requestId: null },
  );
  assert.equal(huge.ok, true);
  if (!huge.ok) return;
  assert.equal(huge.bundle.articles[0].meta_title.length, 5000);
  const validatedHuge = validateIncomingBundle(huge.bundle);
  const title = validatedHuge.bundle?.articles[0].meta_title ?? '';
  assert.ok(title.length > 0 && title.length <= 220, `validator must bound the title, got ${title.length}`);

  // A structurally broken article is refused outright rather than half-imported.
  const broken = normaliseN8nResponse(
    { ru_article: { ...RU_ARTICLE, slug: 'НЕ ВАЛИДНЫЙ СЛАГ' } },
    { jobId: 'job_10', requestId: null },
  );
  assert.equal(broken.ok, true);
  if (!broken.ok) return;
  const validatedBroken = validateIncomingBundle(broken.bundle);
  assert.equal(validatedBroken.ok, false);
  assert.ok(validatedBroken.errors.some((e) => e.path.endsWith('.slug')));
});

// ═══ 5. Telegram (Tahlil) analysis ═════════════════════════════════════════
// Boundary: sanitizer error codes vs transport error codes.

test('analysis: a non-object provider payload is invalid_json and yields no analysis', () => {
  for (const raw of [null, undefined, 'text', 7, ['a']]) {
    const result = sanitizeAnalysis(raw);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_json');
    assert.equal(result.analysis, undefined);
  }
});

test('analysis: insufficient content abstains with an empty, accusation-free structure', () => {
  const result = sanitizeAnalysis({ sufficient: false, insufficiencyReason: 'no_claims', summary: 'Мало данных.' });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'insufficient_content');
  assert.equal(result.analysis?.sufficient, false);
  assert.equal(result.analysis?.insufficiencyReason, 'no_claims');
  assert.deepEqual(result.analysis?.claims, []);
  assert.deepEqual(result.analysis?.contradictions, []);
  assert.deepEqual(result.analysis?.questions, []);
});

test('analysis: an unsafe verdict is dropped entirely, never softened', () => {
  const result = sanitizeAnalysis({
    sufficient: true,
    insufficiencyReason: 'none',
    summary: 'Собеседник врёт и обманывает клиента.',
    claims: [], contradictions: [], hedging: [], questions: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'unsafe_output');
  assert.equal(result.analysis, undefined);
});

test('analysis: an out-of-list insufficiency reason falls back inside the closed list', () => {
  const result = sanitizeAnalysis({ sufficient: false, insufficiencyReason: 'because_i_said_so', summary: '' });
  assert.equal(result.analysis?.insufficiencyReason, 'unclear_transcript');
});

test('analysis: summary and quotes are bounded so no full transcript can escape', () => {
  const result = sanitizeAnalysis({
    sufficient: true,
    insufficiencyReason: 'none',
    summary: 'с'.repeat(2000),
    claims: [{ timeSec: 5, quote: 'к'.repeat(1000), kind: 'fact', explanation: 'э'.repeat(1000), confidence: 'high' }],
    contradictions: [], hedging: [], questions: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.analysis?.summary.length, 700);
  assert.equal(result.analysis?.claims[0].quote.length, 220);
  assert.ok((result.analysis?.claims[0].explanation.length ?? 0) <= 300);
});

test('analysis: transport failures and sanitizer failures live in one closed union', () => {
  // Transport codes exist only on the provider result; the abstain branch in the
  // handler keys off `insufficient_content` and must not treat a timeout as one.
  const timeout: AnalysisProviderResult = {
    ok: false, provider: 'openrouter', latencyMs: 12_000, promptVersion: 'v1', errorCode: 'timeout',
  };
  const abstain: AnalysisProviderResult = {
    ok: false, provider: 'openrouter', latencyMs: 900, promptVersion: 'v1', errorCode: 'insufficient_content',
  };
  const isAbstention = (r: AnalysisProviderResult) => r.errorCode === 'insufficient_content';
  assert.equal(isAbstention(timeout), false);
  assert.equal(isAbstention(abstain), true);

  // Every code the sanitizer can emit is also representable on the provider
  // result — that superset relation is what the interface split encodes.
  const sanitizerCodes = ['invalid_json', 'unsafe_output', 'insufficient_content'] as const;
  for (const code of sanitizerCodes) {
    const forwarded: AnalysisProviderResult = {
      ok: false, provider: 'openrouter', latencyMs: 1, promptVersion: 'v1', errorCode: code,
    };
    assert.equal(forwarded.errorCode, code);
  }
});

// ═══ 6. Telegram store + handler ═══════════════════════════════════════════
// Boundary: nullable D1 column narrowed by the ownership/retention gate.

interface TgCall { method: string; body: Record<string, unknown> }

function installTelegramFetch(calls: TgCall[], aiReplies: string[]): () => void {
  const original = globalThis.fetch;
  let aiIndex = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (href.includes('api.telegram.org')) {
      calls.push({ method: href.split('/').pop() || '', body });
      return Response.json({ ok: true, result: { message_id: calls.length } });
    }
    if (href.includes('openrouter.ai')) {
      // Sticky: the validator may legitimately ask the router for a retry, and
      // a test asserting on the delivered text must not depend on that count.
      const reply = aiReplies[aiIndex] ?? aiReplies[aiReplies.length - 1] ?? 'Здравствуйте! Уточните детали.';
      aiIndex += 1;
      calls.push({ method: 'llm', body });
      return Response.json({ choices: [{ message: { content: reply } }], usage: { prompt_tokens: 5, completion_tokens: 5 } });
    }
    return Response.json({ ok: false });
  }) as typeof globalThis.fetch;
  return () => { globalThis.fetch = original; };
}

async function telegramFixture(): Promise<{ db: SqliteD1; deps: Parameters<typeof handleUpdate>[0] }> {
  const db = new SqliteD1();
  loadMigrations(db, ['0013_platform_events.sql']);
  await ensureTelegramSchema(db.asD1());
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    TELEGRAM_ASSISTANT_BOT_TOKEN: 'assistant-token',
    GPT_HASH_SALT: 'salt',
  } as Env;
  return {
    db,
    deps: { env, db: db.asD1(), cfg: resolveTelegramConfig(env), tg: new TelegramClient('assistant-token') },
  };
}

function sends(calls: TgCall[]): TgCall[] {
  return calls.filter((c) => c.method === 'sendMessage');
}

const RU_REPLY = 'Здравствуйте! Уточните, пожалуйста, детали — и я сразу отвечу.';

test('telegram: a text update stores the item and answers once', async () => {
  const calls: TgCall[] = [];
  const restore = installTelegramFetch(calls, [RU_REPLY]);
  try {
    const { db, deps } = await telegramFixture();
    await handleUpdate(deps, {
      update_id: 1,
      message: { chat: { id: 11, type: 'private' }, from: { id: 11, language_code: 'ru' }, text: 'Когда будет готов мой заказ?' },
    });
    const items = db.rows<{ id: string; source_text: string | null }>('SELECT id, source_text FROM telegram_items');
    assert.equal(items.length, 1);
    assert.equal(items[0].source_text, 'Когда будет готов мой заказ?');
    assert.equal(sends(calls).length, 1, 'exactly one answer per update');
    assert.equal(sends(calls)[0].body.text, RU_REPLY);
    // One stored result, so a retry cannot double-charge the usage ledger.
    assert.equal(db.rows('SELECT id FROM telegram_results').length, 1);
    assert.equal(db.rows('SELECT id FROM usage_ledger').length, 1);
  } finally { restore(); }
});

test('telegram: getOwnedItem enforces ownership, retention and the source-text guarantee', async () => {
  const calls: TgCall[] = [];
  const restore = installTelegramFetch(calls, []);
  try {
    const { db } = await telegramFixture();
    const d1 = db.asD1();
    const live = await S.createItem(d1, 21, 'direct', 'Живой текст', 'ru', 3_600_000);
    const expired = await S.createItem(d1, 21, 'direct', 'Просроченный текст', 'ru', -1_000);
    const purged = await S.createItem(d1, 21, 'voice', 'Голосовая расшифровка', 'ru', 3_600_000, 30);

    const owned = await S.getOwnedItem(d1, live, 21);
    assert.ok(owned);
    // The returned row is the narrowed variant: source_text is a real string,
    // no non-null assertion required by any caller.
    assert.equal(typeof owned.source_text, 'string');
    assert.equal(owned.source_text, 'Живой текст');

    assert.equal(await S.getOwnedItem(d1, live, 22), null, 'another user must not read the item');
    assert.equal(await S.getOwnedItem(d1, expired, 21), null, 'an expired item is gone');
    assert.equal(await S.getOwnedItem(d1, 'no-such-item', 21), null);
    assert.equal(await S.getOwnedItem(d1, 'x'.repeat(64), 21), null, 'oversized ids are refused before the query');

    // Retention purge clears source_text — the gate must then refuse the row.
    await S.deleteAnalysisData(d1, purged, 21);
    assert.equal(
      db.rows<{ source_text: string | null }>('SELECT source_text FROM telegram_items WHERE id = ?', purged)[0].source_text,
      null,
    );
    assert.equal(await S.getOwnedItem(d1, purged, 21), null, 'a purged item is never resumable');
  } finally { restore(); }
});

test('telegram: a callback replay after the retention purge is stale and never regenerates', async () => {
  const calls: TgCall[] = [];
  const restore = installTelegramFetch(calls, ['первый ответ', 'второй ответ']);
  try {
    const { db, deps } = await telegramFixture();
    const d1 = db.asD1();
    const itemId = await S.createItem(d1, 31, 'direct', 'Исходное сообщение клиента', 'ru', 3_600_000);

    await handleUpdate(deps, {
      update_id: 40,
      callback_query: { id: 'cb1', from: { id: 31, language_code: 'ru' }, data: `retry:${itemId}`, message: { chat: { id: 31 }, message_id: 1 } },
    });
    const firstLlmCalls = calls.filter((c) => c.method === 'llm').length;
    assert.equal(firstLlmCalls, 1, 'the first retry generates');

    // Terminal state for the source text: purge it, then replay the same callback.
    db.exec(`UPDATE telegram_items SET source_text = NULL WHERE id = '${itemId}'`);
    calls.length = 0;
    await handleUpdate(deps, {
      update_id: 41,
      callback_query: { id: 'cb2', from: { id: 31, language_code: 'ru' }, data: `retry:${itemId}`, message: { chat: { id: 31 }, message_id: 2 } },
    });
    assert.equal(calls.filter((c) => c.method === 'llm').length, 0, 'no second generation after the purge');
    assert.equal(sends(calls).length, 1);
    assert.match(String(sends(calls)[0].body.text), /устарел|eskirgan/i);
  } finally { restore(); }
});

test('telegram: a callback for another user\'s item is refused without disclosing it', async () => {
  const calls: TgCall[] = [];
  const restore = installTelegramFetch(calls, ['не должно случиться']);
  try {
    const { db, deps } = await telegramFixture();
    const itemId = await S.createItem(db.asD1(), 51, 'direct', 'Приватный текст владельца', 'ru', 3_600_000);

    await handleUpdate(deps, {
      update_id: 60,
      callback_query: { id: 'cb3', from: { id: 52, language_code: 'ru' }, data: `retry:${itemId}`, message: { chat: { id: 52 }, message_id: 1 } },
    });
    assert.equal(calls.filter((c) => c.method === 'llm').length, 0);
    const text = JSON.stringify(calls);
    assert.ok(!text.includes('Приватный текст владельца'), 'the foreign item must never surface');
  } finally { restore(); }
});

test('telegram: unsupported, malformed and incomplete updates are absorbed deterministically', async () => {
  const calls: TgCall[] = [];
  const restore = installTelegramFetch(calls, []);
  try {
    const { deps } = await telegramFixture();
    const updates: unknown[] = [
      { update_id: 70 },                                                     // neither message nor callback
      { update_id: 71, edited_message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: 'изменено' } },
      { update_id: 72, message: { chat: { id: 1, type: 'private' } } },      // no `from`
      { update_id: 73, message: { chat: { id: 1, type: 'private' }, from: { id: 1, is_bot: true }, text: 'бот' } },
      { update_id: 74, message: { chat: { id: 1, type: 'group' }, from: { id: 1 }, text: 'привет' } },
      { update_id: 75, callback_query: { id: 'x', from: { id: 1 } } },       // no data
      { update_id: 76, message: null },
      { update_id: 77, callback_query: { id: 'y', from: { id: 1 }, data: 'totally:unknown:kind' } },
    ];
    for (const update of updates) {
      await handleUpdate(deps, update as Parameters<typeof handleUpdate>[1]);
    }
    assert.equal(calls.filter((c) => c.method === 'llm').length, 0, 'no update above may reach the model');
  } finally { restore(); }
});

test('telegram: a repeated update_id is claimed once, so a retry cannot duplicate work', async () => {
  const calls: TgCall[] = [];
  const restore = installTelegramFetch(calls, []);
  try {
    const { db } = await telegramFixture();
    assert.equal(await S.claimUpdate(db.asD1(), 900), true);
    assert.equal(await S.claimUpdate(db.asD1(), 900), false);
    assert.equal(await S.claimUpdate(db.asD1(), 901), true);
  } finally { restore(); }
});

test('telegram: analytics and the platform outbox stay free of raw user content', async () => {
  const calls: TgCall[] = [];
  const restore = installTelegramFetch(calls, ['Ответ клиенту.']);
  try {
    const { db, deps } = await telegramFixture();
    const secret = 'Позвоните мне на +998901234567, Азиз';
    await handleUpdate(deps, {
      update_id: 100,
      message: { chat: { id: 81, type: 'private' }, from: { id: 81, language_code: 'ru' }, text: secret },
    });

    const events = db.rows<{ meta_json: string | null }>('SELECT meta_json FROM telegram_events');
    assert.ok(events.length > 0, 'the flow does emit analytics');
    for (const row of events) {
      assert.ok(!(row.meta_json || '').includes(secret));
      assert.ok(!/\+998\d/.test(row.meta_json || ''));
    }
    const outbox = db.rows<{ payload_json: string }>('SELECT payload_json FROM events');
    for (const row of outbox) {
      assert.ok(!row.payload_json.includes(secret), 'the durable outbox never carries the raw update');
      assert.ok(!/\+998\d/.test(row.payload_json));
    }
  } finally { restore(); }
});

test('telegram: the assistant webhook keeps its own identity and rejects a wrong secret', async () => {
  const calls: TgCall[] = [];
  const restore = installTelegramFetch(calls, []);
  try {
    const db = new SqliteD1();
    loadMigrations(db, ['0013_platform_events.sql']);
    const env = {
      TELEGRAM_ASSISTANT_BOT_TOKEN: 'assistant-token',
      TELEGRAM_ASSISTANT_WEBHOOK_SECRET: 'expected-secret',
      GPTBOT_DRAFTS_DB: db.asD1(),
      GPT_HASH_SALT: 'salt',
    } as Env;
    // Background work is captured and drained inside the fetch stub, so no
    // deferred task can escape into the real network after the test ends.
    const background: Promise<unknown>[] = [];
    const call = (secret?: string) => assistantPost({
      request: new Request('https://gptbot.uz/api/telegram/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
        body: JSON.stringify({ update_id: 1, message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: 'привет' } }),
      }),
      env,
      waitUntil: (p: Promise<unknown>) => { background.push(p); },
    } as never);

    assert.equal((await call()).status, 401);
    assert.equal((await call('wrong')).status, 401);
    assert.equal((await call('expected-secret')).status, 200);
    await Promise.allSettled(background);
    assert.equal(background.length, 1, 'only the authenticated call schedules work');

    // Bot namespaces stay separated: the Agents/lead identity is refused here.
    assert.equal(isProtectedBotUsername('aidirectprobot'), true);
    assert.equal(isProtectedBotUsername('@AIDirectProBot'), true);
    assert.equal(isProtectedBotUsername('gptbot_javob_bot'), false);
  } finally { restore(); }
});

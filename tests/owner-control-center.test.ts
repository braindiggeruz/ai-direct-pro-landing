// P3.1 Owner Control Center — behavioural regression.
//
// Every test drives the real Pages Function handlers against an in-memory
// SQLite database loaded with the real migrations, so the authorization,
// idempotency and projection guarantees are exercised through the same code
// production runs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as jose from 'jose';

import type { Env } from '../functions/_types';
import { SqliteD1 } from './helpers/sqlite-d1';

import { onRequestGet as overviewGet, onRequestPost as overviewPost } from '../functions/api/admin/agents/overview';
import { onRequestGet as storesGet } from '../functions/api/admin/agents/stores/index';
import { onRequestGet as storeGet } from '../functions/api/admin/agents/stores/[storeId]/index';
import { onRequestPost as suspendPost } from '../functions/api/admin/agents/stores/[storeId]/suspend';
import { onRequestPost as restorePost } from '../functions/api/admin/agents/stores/[storeId]/restore';
import { onRequestGet as ordersGet } from '../functions/api/admin/agents/orders';
import { onRequestGet as handoffsGet } from '../functions/api/admin/agents/handoffs';
import { onRequestGet as automationGet } from '../functions/api/admin/agents/automation';
import { onRequestPost as replayPost } from '../functions/api/admin/agents/automation/replay';
import { onRequestGet as auditGet } from '../functions/api/admin/agents/audit';
import { onRequestGet as pilotGet, onRequestPost as pilotPost } from '../functions/api/admin/agents/pilot';

import { onRequestGet as cockpitGet } from '../functions/api/admin/cockpit';
import { onRequestGet as seoJobsGet } from '../functions/api/admin/seo-autopilot/jobs';
import { onRequestGet as meGet } from '../functions/api/auth/me';
import { onRequestPost as contentPost } from '../functions/api/content/index';

const ROOT = path.resolve(import.meta.dirname, '..');
const JWT_SECRET = 'owner-control-center-test-secret-value';
const ISSUER = 'gptbot-seo-admin';

const MIGRATIONS = [
  '0001_ai_drafts.sql',
  '0002_seo_autopilot_jobs.sql',
  '0003_seo_autopilot_control_center.sql',
  '0004_intent_guard.sql',
  '0005_llm_router.sql',
  '0006_yandex.sql',
  '0007_indexnow.sql',
  '0008_gpt_chat.sql',
  '0009_telegram_assistant.sql',
  '0010_javob_billing.sql',
  '0011_telegram_voice_reply.sql',
  '0012_voice_analysis.sql',
  '0013_platform_events.sql',
  '0014_platform_identity_orgs.sql',
  '0015_platform_knowledge.sql',
  '0016_platform_workflow.sql',
  '0017_telegram_agents_transport.sql',
  '0018_sotuvchi_store_onboarding.sql',
  '0019_sotuvchi_catalog.sql',
  '0020_sotuvchi_buyer_qa.sql',
  '0021_sotuvchi_checkout.sql',
  '0022_sotuvchi_orders_inventory.sql',
  '0023_sotuvchi_handoff.sql',
  '0024_first_party_automation.sql',
  '0025_owner_control_center_audit.sql',
];

function loadMigrations(db: SqliteD1): void {
  for (const file of MIGRATIONS) {
    db.exec(fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8'));
  }
}

async function tokenFor(role: string | undefined, email = 'owner@gptbot.uz', options: {
  issuer?: string;
  expired?: boolean;
  secret?: string;
} = {}): Promise<string> {
  const secret = new TextEncoder().encode(options.secret ?? JWT_SECRET);
  const jwt = new jose.SignJWT({ email, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(options.issuer ?? ISSUER)
    .setIssuedAt(options.expired ? Math.floor(Date.now() / 1000) - 7200 : undefined);
  return options.expired
    ? jwt.setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(secret)
    : jwt.setExpirationTime('1h').sign(secret);
}

function env(db: SqliteD1, extra: Partial<Env> = {}): Env {
  return {
    JWT_SECRET,
    GPTBOT_DRAFTS_DB: db.asD1(),
    FIRST_PARTY_AUTOMATION_ENABLED: 'true',
    ...extra,
  } as unknown as Env;
}

interface CallOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
  params?: Record<string, string>;
  search?: string;
  envOverrides?: Partial<Env>;
}

async function call(
  handler: PagesFunction<Env>,
  db: SqliteD1,
  urlPath: string,
  options: CallOptions = {},
): Promise<{ status: number; body: Record<string, unknown>; text: string; requestId: string | null }> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  const method = options.method ?? 'GET';
  const request = new Request(`https://gptbot.uz${urlPath}${options.search ?? ''}`, {
    method,
    headers,
    body: options.body === undefined
      ? undefined
      : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)),
  });
  const response = await handler({
    request,
    env: env(db, options.envOverrides),
    params: options.params ?? {},
    data: {},
    functionPath: urlPath,
    waitUntil() {},
    passThroughOnException() {},
    next: async () => new Response(null, { status: 404 }),
  } as unknown as Parameters<PagesFunction<Env>>[0]);
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
  return {
    status: response.status,
    body,
    text,
    requestId: response.headers.get('x-request-id'),
  };
}

/** A store with one order, one handoff and one product, all synthetic. */
function seedStore(db: SqliteD1, suffix: string, status = 'active'): { orgId: string; storeId: string } {
  const orgId = `org_${suffix}`;
  const storeId = `store_${suffix}`;
  const now = '2026-07-30T00:00:00.000Z';
  db.exec(`INSERT INTO identities (id, provider, external_id, created_at, updated_at)
    VALUES ('identity_${suffix}', 'telegram', 'owner_${suffix}', '${now}', '${now}')`);
  db.exec(`INSERT INTO identities (id, provider, external_id, created_at, updated_at)
    VALUES ('identity_b_${suffix}', 'telegram', 'buyer_${suffix}', '${now}', '${now}')`);
  db.exec(`INSERT INTO organizations (id, name, slug, status, default_locale, created_at, updated_at)
    VALUES ('${orgId}', 'Org ${suffix}', 'org-${suffix}', 'active', 'ru', '${now}', '${now}')`);
  db.exec(`INSERT INTO memberships (id, org_id, identity_id, role, status, created_at, updated_at)
    VALUES ('membership_${suffix}', '${orgId}', 'identity_${suffix}', 'owner', 'active', '${now}', '${now}')`);
  db.exec(`INSERT INTO workflow_instances (
      id, org_id, workflow_id, workflow_version, state, status, payload_json,
      version, idempotency_key, created_at, updated_at, completed_at
    ) VALUES (
      'wf_${suffix}', '${orgId}', 'sotuvchi-store-onboarding', 1, 'completed',
      'completed', '{}', 1, 'workflow-onboarding-${suffix}', '${now}', '${now}', '${now}'
    )`);
  db.exec(`INSERT INTO workflow_instances (
      id, org_id, workflow_id, workflow_version, state, status, payload_json,
      version, idempotency_key, created_at, updated_at
    ) VALUES (
      'wfo_${suffix}', '${orgId}', 'sotuvchi-checkout', 1, 'completed',
      'completed', '{}', 1, 'workflow-order-${suffix}', '${now}', '${now}'
    )`);
  db.exec(`INSERT INTO sotuvchi_stores (id, org_id, name, locale, delivery_mode, payment_methods_json, storefront_code, status, created_at, updated_at)
    VALUES ('${storeId}', '${orgId}', 'Store ${suffix}', 'ru', 'both', '["cash"]', 'sf${suffix}', '${status}', '${now}', '${now}')`);
  db.exec(`INSERT INTO sotuvchi_onboardings (id, owner_identity_id, bot_username, org_id, workflow_instance_id, status, created_at, updated_at)
    VALUES ('onb_${suffix}', 'identity_${suffix}', 'test_bot', '${orgId}', 'wf_${suffix}', 'completed', '${now}', '${now}')`);
  db.exec(`INSERT INTO sotuvchi_storefront_sessions (
      id, bot_username, identity_id, org_id, store_id, status, created_at, updated_at
    ) VALUES (
      'sess_${suffix}', 'test_bot', 'identity_b_${suffix}', '${orgId}', '${storeId}',
      'active', '${now}', '${now}'
    )`);
  db.exec(`INSERT INTO sotuvchi_products (id, org_id, store_id, category_id, sku, name, normalized_name, description, price_minor, currency, availability, status, media_refs_json, version, last_operation_key, created_at, updated_at)
    VALUES ('prod_${suffix}', '${orgId}', '${storeId}', NULL, NULL, 'Item ${suffix}', 'item ${suffix}', 'desc', 125000, 'UZS', 'available', 'published', '[]', 1, 'seed-product-${suffix}', '${now}', '${now}')`);
  db.exec(`INSERT INTO sotuvchi_orders (id, org_id, store_id, buyer_session_id, workflow_instance_id, order_number, status, buyer_name, buyer_phone, buyer_address, total_minor, currency, version, last_operation_key, created_at, updated_at, placed_at)
    VALUES ('order_${suffix}', '${orgId}', '${storeId}', 'sess_${suffix}', 'wfo_${suffix}', 'A-${suffix}', 'placed', 'Дилшод', '901234567', 'Тошкент, Чилонзор 5', 375000, 'UZS', 1, 'seed-order-${suffix}', '${now}', '${now}', '${now}')`);
  db.exec(`INSERT INTO sotuvchi_order_items (id, org_id, store_id, order_id, product_id, product_name_snapshot, unit_price_minor, currency, availability_snapshot, quantity, line_total_minor, created_at, updated_at)
    VALUES ('oi_${suffix}', '${orgId}', '${storeId}', 'order_${suffix}', 'prod_${suffix}', 'Item ${suffix}', 125000, 'UZS', 'available', 3, 375000, '${now}', '${now}')`);
  db.exec(`INSERT INTO sotuvchi_handoffs (
      id, org_id, store_id, buyer_identity_id, buyer_session_id, status, reason,
      question_text, last_operation_key, created_at, updated_at, expires_at
    ) VALUES (
      'handoff_${suffix}', '${orgId}', '${storeId}', 'identity_b_${suffix}',
      'sess_${suffix}', 'open', 'buyer_requested_human', 'Размер уточните пожалуйста',
      'seed-handoff-${suffix}', '${now}', '${now}', '2026-08-06T00:00:00.000Z'
    )`);
  return { orgId, storeId };
}

function seedDeadLetterJob(db: SqliteD1, suffix: string): string {
  const jobId = `ajob_${suffix}`;
  const now = '2026-07-30T00:00:00.000Z';
  db.exec(`INSERT INTO automation_jobs (job_id, job_type, tenant_key, idempotency_key, request_ref, status, attempt_count, max_attempts, available_at, version, created_at, updated_at, last_error_code)
    VALUES ('${jobId}', 'seo_draft_generation', 'platform:gptbot-seo', 'idem_${suffix}', 'seo_schedule:default', 'dead_letter', 3, 3, '${now}', 1, '${now}', '${now}', 'handler_failed')`);
  return jobId;
}

function mutation(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reason_code: 'policy_violation',
    idempotency_key: `key-${Math.random().toString(36).slice(2, 12)}`,
    ...extra,
  };
}

// ── Additive migration ────────────────────────────────────────────────────

describe('owner migration is bootstrap-safe and upgrade-safe', () => {
  test('clean bootstrap and 0001-0024 upgrade produce the same owner objects', () => {
    const clean = new SqliteD1();
    loadMigrations(clean);

    const upgrade = new SqliteD1();
    for (const file of MIGRATIONS.filter((file) => file !== '0025_owner_control_center_audit.sql')) {
      upgrade.exec(fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8'));
    }
    const { storeId } = seedStore(upgrade, 'migrationupgrade');
    const migration = fs.readFileSync(
      path.join(ROOT, 'migrations', '0025_owner_control_center_audit.sql'),
      'utf8',
    );
    upgrade.exec(migration);
    upgrade.exec(migration);

    const objects = (db: SqliteD1) => db.rows<{ name: string; type: string }>(
      `SELECT name, type FROM sqlite_master
       WHERE name LIKE 'owner_%' OR name LIKE 'idx_owner_%'
       ORDER BY type, name`,
    );
    assert.deepEqual(objects(upgrade), objects(clean));
    assert.equal(
      upgrade.value(`SELECT COUNT(*) FROM sotuvchi_stores WHERE id = '${storeId}'`),
      1,
      'the upgrade must preserve pre-existing domain data',
    );
  });

  test('migration is additive and database bounds reject oversized audit metadata', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'migrations', '0025_owner_control_center_audit.sql'),
      'utf8',
    );
    const executable = sql.replace(/--.*$/gm, '');
    assert.doesNotMatch(executable, /\b(?:DROP|TRUNCATE)\b|\bALTER\s+TABLE\b/i);

    const db = new SqliteD1();
    loadMigrations(db);
    assert.throws(() => db.exec(
      `INSERT INTO owner_audit_events (
         event_id, actor_email, actor_role, action, target_type, target_id,
         reason_code, request_id, idempotency_key, before_json, created_at
       ) VALUES (
         'oaudit_bound', 'owner@gptbot.uz', 'platform_owner', 'store.suspend',
         'store', 'store_bound', 'policy_violation', 'req_bound', 'key_bound',
         '${'x'.repeat(2049)}', '2026-07-30T00:00:00.000Z'
       )`,
    ));
  });
});

// ── Authorization ──────────────────────────────────────────────────────────

describe('authorization fails closed', () => {
  test('an unauthenticated read is denied', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(overviewGet, db, '/api/admin/agents/overview');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'missing_token');
    assert.ok(res.requestId, 'every response carries a request id');
  });

  test('a malformed token is denied', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(overviewGet, db, '/api/admin/agents/overview', { token: 'not-a-jwt' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'invalid_token');
  });

  test('an expired token is denied', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(overviewGet, db, '/api/admin/agents/overview', {
      token: await tokenFor('platform_owner', 'owner@gptbot.uz', { expired: true }),
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'invalid_token');
  });

  test('a token from the wrong issuer is denied', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(overviewGet, db, '/api/admin/agents/overview', {
      token: await tokenFor('platform_owner', 'owner@gptbot.uz', { issuer: 'someone-else' }),
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'invalid_token');
  });

  test('a token signed with a different secret is denied', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(overviewGet, db, '/api/admin/agents/overview', {
      token: await tokenFor('platform_owner', 'owner@gptbot.uz', { secret: 'a-different-secret-value' }),
    });
    assert.equal(res.status, 401);
  });

  test('an unrecognised role is denied, not treated as read-only', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    for (const role of ['seller', 'buyer', 'platform-owner', 'PLATFORM_OWNER', '', undefined]) {
      const res = await call(overviewGet, db, '/api/admin/agents/overview', {
        token: await tokenFor(role),
      });
      assert.equal(res.status, 403, `role ${JSON.stringify(role)} must be denied`);
      assert.equal(res.body.error, 'unknown_role');
    }
  });

  test('a signed token with an invalid actor identifier is denied', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    for (const email of ['not-an-email', 'owner @gptbot.uz', `${'x'.repeat(201)}@gptbot.uz`]) {
      const res = await call(overviewGet, db, '/api/admin/agents/overview', {
        token: await tokenFor('platform_owner', email),
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'invalid_token');
    }
  });

  test('a seller role cannot reach any owner endpoint', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'seller');
    const token = await tokenFor('seller', 'seller@example.invalid');
    const probes: Array<[PagesFunction<Env>, string, CallOptions]> = [
      [overviewGet, '/api/admin/agents/overview', {}],
      [storesGet, '/api/admin/agents/stores', {}],
      [ordersGet, '/api/admin/agents/orders', {}],
      [handoffsGet, '/api/admin/agents/handoffs', {}],
      [automationGet, '/api/admin/agents/automation', {}],
      [auditGet, '/api/admin/agents/audit', {}],
      [pilotGet, '/api/admin/agents/pilot', {}],
      [suspendPost, `/api/admin/agents/stores/${storeId}/suspend`, {
        method: 'POST', body: mutation({ confirmation: storeId }), params: { storeId },
      }],
    ];
    for (const [handler, url, options] of probes) {
      const res = await call(handler, db, url, { ...options, token });
      assert.equal(res.status, 403, url);
    }
  });

  test('the legacy admin role still works and resolves to platform_owner', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(overviewGet, db, '/api/admin/agents/overview', {
      token: await tokenFor('admin', 'legacy@gptbot.uz'),
    });
    assert.equal(res.status, 200);
    assert.equal((res.body.actor as { role: string }).role, 'platform_owner');
  });

  test('support_readonly can read', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    seedStore(db, 'ro');
    const token = await tokenFor('support_readonly', 'support@gptbot.uz');
    for (const [handler, url] of [
      [overviewGet, '/api/admin/agents/overview'],
      [storesGet, '/api/admin/agents/stores'],
      [ordersGet, '/api/admin/agents/orders'],
      [handoffsGet, '/api/admin/agents/handoffs'],
      [automationGet, '/api/admin/agents/automation'],
      [auditGet, '/api/admin/agents/audit'],
      [pilotGet, '/api/admin/agents/pilot'],
    ] as Array<[PagesFunction<Env>, string]>) {
      const res = await call(handler, db, url, { token });
      assert.equal(res.status, 200, url);
      assert.equal((res.body.actor as { role: string }).role, 'support_readonly');
    }
  });

  test('overview reports the closed production runtime policy', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(overviewGet, db, '/api/admin/agents/overview', {
      token: await tokenFor('platform_owner'),
    });
    assert.deepEqual(res.body.runtime_policy, {
      first_party_automation_enabled: true,
      first_party_automation_path: 'sole',
      auto_publication: false,
    });
    assert.equal((res.body.marketplace as { enabled: boolean }).enabled, false);
  });

  test('support_readonly cannot mutate anything', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'romut');
    const jobId = seedDeadLetterJob(db, 'romut');
    const token = await tokenFor('support_readonly', 'support@gptbot.uz');

    const attempts: Array<[PagesFunction<Env>, string, CallOptions]> = [
      [suspendPost, `/api/admin/agents/stores/${storeId}/suspend`, {
        method: 'POST', body: mutation({ confirmation: storeId }), params: { storeId },
      }],
      [restorePost, `/api/admin/agents/stores/${storeId}/restore`, {
        method: 'POST', body: mutation(), params: { storeId },
      }],
      [pilotPost, '/api/admin/agents/pilot', {
        method: 'POST', body: { ...mutation({ confirmation: storeId }), store_id: storeId, operation: 'activate' },
      }],
      [replayPost, '/api/admin/agents/automation/replay', {
        method: 'POST', body: { ...mutation({ confirmation: jobId }), job_id: jobId },
      }],
    ];
    for (const [handler, url, options] of attempts) {
      const res = await call(handler, db, url, { ...options, token });
      assert.equal(res.status, 403, url);
      assert.equal(res.body.error, 'insufficient_role', url);
    }
    // Nothing changed.
    assert.equal(db.value(`SELECT status FROM sotuvchi_stores WHERE id = '${storeId}'`), 'active');
    assert.equal(db.value(`SELECT status FROM automation_jobs WHERE job_id = '${jobId}'`), 'dead_letter');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 0);
  });

  test('support_readonly can authenticate the shell but cannot call legacy admin mutations', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const token = await tokenFor('support_readonly', 'support@gptbot.uz');
    const session = await call(meGet, db, '/api/auth/me', { token });
    assert.equal(session.status, 200);
    assert.equal(session.body.role, 'support_readonly');

    for (const role of ['support_readonly', 'seller', 'unknown']) {
      const mutationAttempt = await call(contentPost, db, '/api/content', {
        method: 'POST',
        token: await tokenFor(role, `${role}@gptbot.uz`),
        body: {
          kind: 'page',
          locale: 'ru',
          slug: 'must-not-write',
          data: {},
        },
      });
      assert.equal(mutationAttempt.status, 403, role);
      assert.equal(mutationAttempt.body.error, 'Insufficient role', role);
    }

    const sellerSession = await call(meGet, db, '/api/auth/me', {
      token: await tokenFor('seller', 'seller@gptbot.uz'),
    });
    assert.equal(sellerSession.status, 403);
  });
});

// ── Reason, confirmation, idempotency ──────────────────────────────────────

describe('mutations require a reason, a confirmation and an idempotency key', () => {
  test('a missing reason code is rejected', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'noreason');
    const res = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { idempotency_key: 'k1', confirmation: storeId },
      params: { storeId },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_reason_code');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 0);
  });

  test('a reason code outside the closed list is rejected', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'badreason');
    const res = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { reason_code: 'because i felt like it', idempotency_key: 'k1', confirmation: storeId },
      params: { storeId },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_reason_code');
  });

  test('a missing idempotency key is rejected', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'nokey');
    const res = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { reason_code: 'policy_violation', confirmation: storeId },
      params: { storeId },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_idempotency_key');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 0);
  });

  test('a missing typed confirmation is rejected for a high-impact action', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'noconfirm');
    const res = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: mutation(),
      params: { storeId },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'confirmation_mismatch');
    assert.equal(db.value(`SELECT status FROM sotuvchi_stores WHERE id = '${storeId}'`), 'active');
  });

  test('a near-miss confirmation is rejected', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'nearmiss');
    for (const confirmation of [storeId.toUpperCase(), `${storeId}x`, storeId.slice(0, -1), 'yes']) {
      const res = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
        method: 'POST',
        token: await tokenFor('platform_owner'),
        body: mutation({ confirmation }),
        params: { storeId },
      });
      assert.equal(res.status, 400, confirmation);
      assert.equal(res.body.error, 'confirmation_mismatch');
    }
  });

  test('an unexpected body field is rejected rather than ignored', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'extrafield');
    const res = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { ...mutation({ confirmation: storeId }), org_id: 'org_somebody_else' },
      params: { storeId },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'unexpected_field');
  });

  test('an oversized body is refused with 413', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'toobig');
    const res = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: JSON.stringify({ ...mutation({ confirmation: storeId }), pad: 'x'.repeat(4096) }),
      params: { storeId },
    });
    assert.equal(res.status, 413);
    assert.equal(res.body.error, 'payload_too_large');
  });

  test('a suspend applies once and records exactly one audit event', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId, orgId } = seedStore(db, 'suspendone');
    const body = mutation({ confirmation: storeId });
    const first = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST', token: await tokenFor('platform_owner'), body, params: { storeId },
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.outcome, 'applied');
    assert.equal(db.value(`SELECT status FROM sotuvchi_stores WHERE id = '${storeId}'`), 'suspended');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 1);
    assert.equal(db.value('SELECT action FROM owner_audit_events'), 'store.suspend');
    assert.equal(db.value('SELECT org_id FROM owner_audit_events'), orgId);
  });

  test('replaying the same idempotency key changes nothing and logs nothing new', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'idem');
    const body = mutation({ confirmation: storeId });
    const token = await tokenFor('platform_owner');
    const first = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST', token, body, params: { storeId },
    });
    const replay = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST', token, body, params: { storeId },
    });
    assert.equal(first.body.outcome, 'applied');
    assert.equal(replay.status, 200);
    assert.equal(replay.body.outcome, 'duplicate');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 1);
    assert.equal(db.value(`SELECT status FROM sotuvchi_stores WHERE id = '${storeId}'`), 'suspended');
  });

  test('an idempotency key cannot be reused for another target', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const firstStore = seedStore(db, 'keytargeta').storeId;
    const secondStore = seedStore(db, 'keytargetb').storeId;
    const token = await tokenFor('platform_owner');
    const idempotencyKey = 'same-key-different-target';
    const first = await call(suspendPost, db, `/api/admin/agents/stores/${firstStore}/suspend`, {
      method: 'POST',
      token,
      body: mutation({ idempotency_key: idempotencyKey, confirmation: firstStore }),
      params: { storeId: firstStore },
    });
    const conflict = await call(suspendPost, db, `/api/admin/agents/stores/${secondStore}/suspend`, {
      method: 'POST',
      token,
      body: mutation({ idempotency_key: idempotencyKey, confirmation: secondStore }),
      params: { storeId: secondStore },
    });
    assert.equal(first.body.outcome, 'applied');
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, 'idempotency_conflict');
    assert.equal(db.value(`SELECT status FROM sotuvchi_stores WHERE id = '${secondStore}'`), 'active');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 1);
  });

  test('a failed domain transition rolls back its audit and remains retryable', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'atomicrollback');
    const token = await tokenFor('platform_owner');
    const body = mutation({ idempotency_key: 'atomic-retry-key', confirmation: storeId });
    db.exec(`CREATE TRIGGER fail_owner_suspend
      BEFORE UPDATE OF status ON sotuvchi_stores
      WHEN NEW.status = 'suspended'
      BEGIN SELECT RAISE(ABORT, 'forced_transition_failure'); END`);
    const failed = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST', token, body, params: { storeId },
    });
    assert.equal(failed.status, 500);
    assert.equal(db.value(`SELECT status FROM sotuvchi_stores WHERE id = '${storeId}'`), 'active');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 0);

    db.exec('DROP TRIGGER fail_owner_suspend');
    const retry = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST', token, body, params: { storeId },
    });
    assert.equal(retry.body.outcome, 'applied');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 1);
  });

  test('a stale lifecycle state fails closed without a ghost audit', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'stalestore');
    const originalBatch = db.batch.bind(db);
    let injected = false;
    db.batch = async (statements: readonly D1PreparedStatement[]) => {
      if (!injected) {
        injected = true;
        db.exec(`UPDATE sotuvchi_stores SET status = 'suspended' WHERE id = '${storeId}'`);
      }
      return originalBatch(statements);
    };
    const res = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: mutation({ confirmation: storeId }),
      params: { storeId },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'store_transition_conflict');
    assert.equal(db.value(`SELECT status FROM sotuvchi_stores WHERE id = '${storeId}'`), 'suspended');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 0);
  });

  test('a second suspend with a fresh key is a no-op, not a second transition', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'twice');
    const token = await tokenFor('platform_owner');
    await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST', token, body: mutation({ confirmation: storeId }), params: { storeId },
    });
    const again = await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST', token, body: mutation({ confirmation: storeId }), params: { storeId },
    });
    assert.equal(again.body.outcome, 'unchanged');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 1);
  });

  test('restore returns the store to active and records its own event', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'restore', 'suspended');
    const res = await call(restorePost, db, `/api/admin/agents/stores/${storeId}/restore`, {
      method: 'POST', token: await tokenFor('platform_owner'), body: mutation(), params: { storeId },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.outcome, 'applied');
    assert.equal(db.value(`SELECT status FROM sotuvchi_stores WHERE id = '${storeId}'`), 'active');
    assert.equal(db.value('SELECT action FROM owner_audit_events'), 'store.restore');
  });

  test('a store that does not exist is a 404, and nothing is logged', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(suspendPost, db, '/api/admin/agents/stores/store_missing/suspend', {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: mutation({ confirmation: 'store_missing' }),
      params: { storeId: 'store_missing' },
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'store_not_found');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 0);
  });
});

// ── Cross-tenant and impersonation ─────────────────────────────────────────

describe('no cross-tenant reach and no impersonation', () => {
  test('a store id from another org cannot be mutated by supplying an org', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const a = seedStore(db, 'tenanta');
    seedStore(db, 'tenantb');
    // The only way to name an org is the body, and the body rejects unknown
    // fields, so the org is always resolved from the store on the server.
    const res = await call(suspendPost, db, `/api/admin/agents/stores/${a.storeId}/suspend`, {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { ...mutation({ confirmation: a.storeId }), org_id: 'org_tenantb' },
      params: { storeId: a.storeId },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'unexpected_field');
    assert.equal(db.value("SELECT status FROM sotuvchi_stores WHERE id = 'store_tenantb'"), 'active');
  });

  test('a store detail read is scoped to that store only', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const a = seedStore(db, 'scopea');
    seedStore(db, 'scopeb');
    const res = await call(storeGet, db, `/api/admin/agents/stores/${a.storeId}`, {
      token: await tokenFor('support_readonly', 'support@gptbot.uz'),
      params: { storeId: a.storeId },
    });
    assert.equal(res.status, 200);
    const orders = res.body.recent_orders as Array<{ storeId: string }>;
    const handoffs = res.body.recent_handoffs as Array<{ storeId: string }>;
    assert.ok(orders.every((o) => o.storeId === a.storeId));
    assert.ok(handoffs.every((h) => h.storeId === a.storeId));
    assert.ok(!res.text.includes('store_scopeb'));
  });

  test('an invalid store identifier is rejected before any query', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    for (const storeId of ["store' OR 1=1 --", 'store/../other', 'store id', 'x'.repeat(200)]) {
      const res = await call(storeGet, db, '/api/admin/agents/stores/x', {
        token: await tokenFor('platform_owner'),
        params: { storeId },
      });
      assert.equal(res.status, 400, storeId);
      assert.equal(res.body.error, 'invalid_store_id');
    }
  });
});

// ── Projections: no PII, no secrets, no stacks ──────────────────────────────

describe('projections carry no buyer identity, secret or stack', () => {
  test('the orders view omits buyer name, phone and address', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    seedStore(db, 'pii');
    const res = await call(ordersGet, db, '/api/admin/agents/orders', {
      token: await tokenFor('platform_owner'),
    });
    assert.equal(res.status, 200);
    for (const needle of ['Дилшод', '901234567', 'Чилонзор']) {
      assert.ok(!res.text.includes(needle), `${needle} must not be projected`);
    }
    const orders = res.body.orders as Array<Record<string, unknown>>;
    assert.equal(orders.length, 1);
    assert.deepEqual(Object.keys(orders[0]).sort(), [
      'createdAt', 'currency', 'fulfillmentStatus', 'items', 'orderId', 'orderNumber',
      'orgId', 'placedAt', 'status', 'storeId', 'totalMinor',
    ]);
  });

  test('the handoffs view reports only that a message exists', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    seedStore(db, 'handoffpii');
    const res = await call(handoffsGet, db, '/api/admin/agents/handoffs', {
      token: await tokenFor('platform_owner'),
    });
    assert.equal(res.status, 200);
    assert.ok(!res.text.includes('Размер уточните'));
    const handoffs = res.body.handoffs as Array<{ hasQuestion: boolean; hasReply: boolean }>;
    assert.equal(handoffs[0].hasQuestion, true);
    assert.equal(handoffs[0].hasReply, false);
  });

  test('the store detail view leaks no buyer identity either', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'detailpii');
    const res = await call(storeGet, db, `/api/admin/agents/stores/${storeId}`, {
      token: await tokenFor('platform_owner'),
      params: { storeId },
    });
    for (const needle of ['Дилшод', '901234567', 'Чилонзор', 'Размер уточните']) {
      assert.ok(!res.text.includes(needle), needle);
    }
  });

  test('no response echoes the JWT secret or a stack fragment', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'nostack');
    const token = await tokenFor('platform_owner');
    const responses = [
      await call(overviewGet, db, '/api/admin/agents/overview', { token }),
      await call(storeGet, db, `/api/admin/agents/stores/${storeId}`, { token, params: { storeId } }),
      await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
        method: 'POST', token, body: 'not json', params: { storeId },
      }),
      await call(auditGet, db, '/api/admin/agents/audit', { token }),
    ];
    for (const res of responses) {
      for (const needle of [JWT_SECRET, 'at Object.', 'node_modules', 'SqliteD1', 'SQLITE_']) {
        assert.ok(!res.text.includes(needle), `${needle} must not appear`);
      }
    }
  });

  test('an internal failure returns a closed token plus a request id', async () => {
    const db = new SqliteD1();
    // Deliberately no migrations: every query fails.
    const res = await call(overviewGet, db, '/api/admin/agents/overview', {
      token: await tokenFor('platform_owner'),
    });
    assert.equal(res.status, 500);
    assert.equal(res.body.error, 'internal_error');
    assert.equal(res.body.request_id, res.requestId);
    assert.ok(!res.text.includes('no such table'));
  });

  test('storage that is not configured is a 503, not a crash', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(overviewGet, db, '/api/admin/agents/overview', {
      token: await tokenFor('platform_owner'),
      envOverrides: { GPTBOT_DRAFTS_DB: undefined } as Partial<Env>,
    });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'storage_unavailable');
  });
});

// ── Pagination and filters ────────────────────────────────────────────────

describe('pagination is bounded and filters are validated', () => {
  test('an oversized limit is clamped', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    for (let i = 0; i < 5; i += 1) seedStore(db, `page${i}`);
    const res = await call(storesGet, db, '/api/admin/agents/stores', {
      token: await tokenFor('platform_owner'),
      search: '?limit=100000&offset=-5',
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.page, { limit: 100, offset: 0 });
  });

  test('an oversized offset is clamped', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(storesGet, db, '/api/admin/agents/stores', {
      token: await tokenFor('platform_owner'),
      search: '?offset=1000000000000',
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.page, { limit: 25, offset: 100_000 });
  });

  test('non-finite pagination falls back to safe bounds', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(storesGet, db, '/api/admin/agents/stores', {
      token: await tokenFor('platform_owner'),
      search: '?limit=NaN&offset=Infinity',
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.page, { limit: 25, offset: 0 });
  });

  test('a filter value outside the closed list is rejected, not widened', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const token = await tokenFor('platform_owner');
    const res = await call(storesGet, db, '/api/admin/agents/stores', {
      token, search: '?status=everything',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_status');
    const orders = await call(ordersGet, db, '/api/admin/agents/orders', {
      token, search: '?status=deleted',
    });
    assert.equal(orders.status, 400);
  });

  test('an accepted filter narrows the result set', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    seedStore(db, 'filteractive', 'active');
    seedStore(db, 'filtersusp', 'suspended');
    const res = await call(storesGet, db, '/api/admin/agents/stores', {
      token: await tokenFor('platform_owner'),
      search: '?status=suspended',
    });
    const stores = res.body.stores as Array<{ storeId: string; onboardingStatus: string }>;
    assert.equal(stores.length, 1);
    assert.equal(stores[0].storeId, 'store_filtersusp');
    assert.equal(stores[0].onboardingStatus, 'completed');
  });

  test('order lifecycle filters distinguish order and fulfillment state', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'orderfulfillment');
    db.exec(`UPDATE sotuvchi_orders SET fulfillment_status = 'confirmed'
      WHERE store_id = '${storeId}'`);
    const res = await call(ordersGet, db, '/api/admin/agents/orders', {
      token: await tokenFor('platform_owner'),
      search: '?status=confirmed',
    });
    assert.equal(res.status, 200);
    const orders = res.body.orders as Array<{ storeId: string; fulfillmentStatus: string }>;
    assert.equal(orders.length, 1);
    assert.equal(orders[0].storeId, storeId);
    assert.equal(orders[0].fulfillmentStatus, 'confirmed');
  });
});

// ── Pilot ─────────────────────────────────────────────────────────────────

describe('pilot activation and pause', () => {
  test('activation records an event and does not change the store lifecycle', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'pilotone');
    const res = await call(pilotPost, db, '/api/admin/agents/pilot', {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { ...mutation({ reason_code: 'pilot_onboarding', confirmation: storeId }), store_id: storeId, operation: 'activate' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.outcome, 'applied');
    assert.equal(db.value(`SELECT state FROM owner_pilot_stores WHERE store_id = '${storeId}'`), 'active');
    assert.equal(db.value(`SELECT status FROM sotuvchi_stores WHERE id = '${storeId}'`), 'active');
    assert.equal(db.value('SELECT action FROM owner_audit_events'), 'pilot.activate');
  });

  test('pilot activation requires an exact typed confirmation', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'pilotactivationconfirm');
    const res = await call(pilotPost, db, '/api/admin/agents/pilot', {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: {
        ...mutation({ reason_code: 'pilot_onboarding' }),
        store_id: storeId,
        operation: 'activate',
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'confirmation_mismatch');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_pilot_stores'), 0);
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 0);
  });

  test('repeating pilot activation returns duplicate before the new state check', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'pilotduplicate');
    const token = await tokenFor('platform_owner');
    const body = {
      ...mutation({
        reason_code: 'pilot_onboarding',
        idempotency_key: 'pilot-duplicate-key',
        confirmation: storeId,
      }),
      store_id: storeId,
      operation: 'activate',
    };
    const first = await call(pilotPost, db, '/api/admin/agents/pilot', {
      method: 'POST', token, body,
    });
    const replay = await call(pilotPost, db, '/api/admin/agents/pilot', {
      method: 'POST', token, body,
    });
    assert.equal(first.body.outcome, 'applied');
    assert.equal(replay.body.outcome, 'duplicate');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 1);
  });

  test('a suspended store cannot enter the pilot', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'pilotsusp', 'suspended');
    const res = await call(pilotPost, db, '/api/admin/agents/pilot', {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { ...mutation({ reason_code: 'pilot_onboarding', confirmation: storeId }), store_id: storeId, operation: 'activate' },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'store_not_active');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_pilot_stores'), 0);
  });

  test('an inactive store cannot be paused into a synthetic pilot state', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'pilotinactivepause');
    const res = await call(pilotPost, db, '/api/admin/agents/pilot', {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: {
        ...mutation({ reason_code: 'pilot_paused_by_owner', confirmation: storeId }),
        store_id: storeId,
        operation: 'pause',
      },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'invalid_pilot_transition');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_pilot_stores'), 0);
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 0);
  });

  test('pausing requires the typed confirmation', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'pilotpause');
    const token = await tokenFor('platform_owner');
    await call(pilotPost, db, '/api/admin/agents/pilot', {
      method: 'POST', token,
      body: { ...mutation({ reason_code: 'pilot_onboarding', confirmation: storeId }), store_id: storeId, operation: 'activate' },
    });
    const noConfirm = await call(pilotPost, db, '/api/admin/agents/pilot', {
      method: 'POST', token,
      body: { ...mutation({ reason_code: 'pilot_paused_by_owner' }), store_id: storeId, operation: 'pause' },
    });
    assert.equal(noConfirm.status, 400);
    assert.equal(noConfirm.body.error, 'confirmation_mismatch');

    const paused = await call(pilotPost, db, '/api/admin/agents/pilot', {
      method: 'POST', token,
      body: {
        ...mutation({ reason_code: 'pilot_paused_by_owner', confirmation: storeId }),
        store_id: storeId,
        operation: 'pause',
      },
    });
    assert.equal(paused.status, 200);
    assert.equal(db.value(`SELECT state FROM owner_pilot_stores WHERE store_id = '${storeId}'`), 'paused');
  });

  test('an unknown pilot operation is rejected', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'pilotbadop');
    const res = await call(pilotPost, db, '/api/admin/agents/pilot', {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { ...mutation(), store_id: storeId, operation: 'delete' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_operation');
  });
});

// ── Automation replay ─────────────────────────────────────────────────────

describe('automation replay is owner-only and audited', () => {
  test('the automation schema enforces the replay job-type allowlist', () => {
    const db = new SqliteD1();
    loadMigrations(db);
    assert.throws(() => db.exec(
      `INSERT INTO automation_jobs (
         job_id, job_type, tenant_key, idempotency_key, request_ref, status,
         attempt_count, max_attempts, available_at, version, created_at, updated_at
       ) VALUES (
         'ajob_unlisted', 'publish_to_github', 'platform:gptbot-seo', 'unlisted',
         'forbidden', 'dead_letter', 1, 3, '2026-07-30T00:00:00.000Z', 1,
         '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'
       )`,
    ));
  });

  test('replay requires an exact typed confirmation', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const jobId = seedDeadLetterJob(db, 'noconfirm');
    const res = await call(replayPost, db, '/api/admin/agents/automation/replay', {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { ...mutation({ reason_code: 'incident_response' }), job_id: jobId },
      envOverrides: { AUTOMATION_QUEUE: { send: async () => undefined } } as unknown as Partial<Env>,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'confirmation_mismatch');
    assert.equal(db.value(`SELECT status FROM automation_jobs WHERE job_id = '${jobId}'`), 'dead_letter');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 0);
  });

  test('a job that is not dead-lettered cannot be replayed', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    db.exec(`INSERT INTO automation_jobs (job_id, job_type, tenant_key, idempotency_key, request_ref, status, attempt_count, max_attempts, available_at, version, created_at, updated_at)
      VALUES ('ajob_queued', 'seo_draft_generation', 'platform:gptbot-seo', 'i1', 'seo_schedule:default', 'queued', 0, 3, '2026-07-30T00:00:00.000Z', 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z')`);
    const res = await call(replayPost, db, '/api/admin/agents/automation/replay', {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { ...mutation({ reason_code: 'incident_response', confirmation: 'ajob_queued' }), job_id: 'ajob_queued' },
      envOverrides: { AUTOMATION_QUEUE: { send: async () => undefined } } as unknown as Partial<Env>,
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'job_not_dead_lettered');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 0);
  });

  test('replay is refused when first-party automation is disabled', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const jobId = seedDeadLetterJob(db, 'disabled');
    const res = await call(replayPost, db, '/api/admin/agents/automation/replay', {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { ...mutation({ reason_code: 'incident_response', confirmation: jobId }), job_id: jobId },
      envOverrides: { FIRST_PARTY_AUTOMATION_ENABLED: 'false' },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'automation_disabled');
  });

  test('a job outside the platform SEO tenant is not visible to replay', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    db.exec(`INSERT INTO automation_jobs (job_id, job_type, tenant_key, idempotency_key, request_ref, status, attempt_count, max_attempts, available_at, version, created_at, updated_at)
      VALUES ('ajob_foreign', 'seo_draft_generation', 'platform:someone-else', 'i2', 'seo_schedule:default', 'dead_letter', 3, 3, '2026-07-30T00:00:00.000Z', 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z')`);
    const res = await call(replayPost, db, '/api/admin/agents/automation/replay', {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: { ...mutation({ reason_code: 'incident_response', confirmation: 'ajob_foreign' }), job_id: 'ajob_foreign' },
      envOverrides: { AUTOMATION_QUEUE: { send: async () => undefined } } as unknown as Partial<Env>,
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'job_not_found');
  });

  test('an owner replay re-queues the job, sends once and audits once', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const jobId = seedDeadLetterJob(db, 'replayok');
    const sent: unknown[] = [];
    const queue = { send: async (m: unknown) => { sent.push(m); } };
    const body = {
      ...mutation({ reason_code: 'incident_response', confirmation: jobId }),
      job_id: jobId,
    };
    const token = await tokenFor('platform_owner');

    const first = await call(replayPost, db, '/api/admin/agents/automation/replay', {
      method: 'POST', token, body,
      envOverrides: { AUTOMATION_QUEUE: queue } as unknown as Partial<Env>,
    });
    assert.equal(first.status, 202);
    assert.equal(first.body.outcome, 'applied');
    assert.equal(db.value(`SELECT status FROM automation_jobs WHERE job_id = '${jobId}'`), 'queued');
    assert.equal(db.value(`SELECT attempt_count FROM automation_jobs WHERE job_id = '${jobId}'`), 0);
    assert.equal(sent.length, 1);
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 1);
    assert.equal(db.value('SELECT action FROM owner_audit_events'), 'automation.replay');
    assert.equal(db.value('SELECT COUNT(*) FROM ai_drafts'), 0, 'replay must not publish or create content');

    const replay = await call(replayPost, db, '/api/admin/agents/automation/replay', {
      method: 'POST', token, body,
      envOverrides: { AUTOMATION_QUEUE: queue } as unknown as Partial<Env>,
    });
    assert.equal(replay.body.outcome, 'duplicate');
    assert.equal(sent.length, 1, 'a duplicate replay must not send again');
    assert.equal(db.value('SELECT COUNT(*) FROM owner_audit_events'), 1);
  });
});

// ── Audit trail integrity ────────────────────────────────────────────────

describe('the audit trail is append-only and safe', () => {
  test('an audit row holds no secret, no password and no raw body', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'auditsafe');
    await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST',
      token: await tokenFor('platform_owner'),
      body: mutation({ confirmation: storeId }),
      params: { storeId },
    });
    const columns = db.rows<Record<string, unknown>>('SELECT * FROM owner_audit_events');
    assert.equal(columns.length, 1);
    assert.deepEqual(Object.keys(columns[0]).sort(), [
      'action', 'actor_email', 'actor_role', 'after_json', 'before_json', 'created_at',
      'event_id', 'idempotency_key', 'org_id', 'reason_code', 'request_id', 'target_id', 'target_type',
    ]);
    const blob = JSON.stringify(columns[0]);
    for (const needle of ['password', 'Bearer', JWT_SECRET, 'Дилшод', '901234567', 'Размер']) {
      assert.ok(!blob.includes(needle), `${needle} must not be stored`);
    }
  });

  test('the audit endpoint exposes no mutation verb', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const module = await import('../functions/api/admin/agents/audit');
    assert.equal(typeof module.onRequestGet, 'function');
    for (const verb of ['onRequestPost', 'onRequestPut', 'onRequestPatch', 'onRequestDelete'] as const) {
      const res = await (module[verb] as PagesFunction<Env>)({} as never);
      assert.equal(res.status, 405, verb);
    }
  });

  test('no source file issues an UPDATE or DELETE against the audit table', () => {
    const roots = ['functions', 'src'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/(UPDATE|DELETE\s+FROM)\s+owner_audit_events/i.test(text)) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    };
    for (const root of roots) walk(path.join(ROOT, root));
    assert.deepEqual(offenders, []);
  });

  test('a filtered audit read returns only that action', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const a = seedStore(db, 'auditfa');
    const b = seedStore(db, 'auditfb', 'suspended');
    const token = await tokenFor('platform_owner');
    await call(suspendPost, db, `/api/admin/agents/stores/${a.storeId}/suspend`, {
      method: 'POST', token, body: mutation({ confirmation: a.storeId }), params: { storeId: a.storeId },
    });
    await call(restorePost, db, `/api/admin/agents/stores/${b.storeId}/restore`, {
      method: 'POST', token, body: mutation(), params: { storeId: b.storeId },
    });
    const res = await call(auditGet, db, '/api/admin/agents/audit', {
      token, search: '?action=store.restore',
    });
    const events = res.body.events as Array<{ action: string }>;
    assert.equal(events.length, 1);
    assert.equal(events[0].action, 'store.restore');
    assert.equal(res.body.total, 1);
    assert.equal(res.body.append_only, true);
  });

  test('audit actor and target filters are validated and composed', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const { storeId } = seedStore(db, 'auditactor');
    const token = await tokenFor('platform_owner', 'owner@gptbot.uz');
    await call(suspendPost, db, `/api/admin/agents/stores/${storeId}/suspend`, {
      method: 'POST', token, body: mutation({ confirmation: storeId }), params: { storeId },
    });
    const filtered = await call(auditGet, db, '/api/admin/agents/audit', {
      token,
      search: `?actor_email=owner%40gptbot.uz&actor_role=platform_owner&target_id=${storeId}`,
    });
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.total, 1);
    assert.equal((filtered.body.events as unknown[]).length, 1);

    const badRole = await call(auditGet, db, '/api/admin/agents/audit', {
      token, search: '?actor_role=seller',
    });
    assert.equal(badRole.status, 400);
    assert.equal(badRole.body.error, 'invalid_actor_role');
    const badEmail = await call(auditGet, db, '/api/admin/agents/audit', {
      token, search: '?actor_email=not-an-email',
    });
    assert.equal(badEmail.status, 400);
    assert.equal(badEmail.body.error, 'invalid_actor_email');
  });
});

// ── No regressions on the existing surfaces ───────────────────────────────

describe('existing admin surfaces still work', () => {
  test('the SEO cockpit still answers for a legacy admin token', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(cockpitGet, db, '/api/admin/cockpit', {
      token: await tokenFor('admin', 'legacy@gptbot.uz'),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  test('the SEO autopilot jobs endpoint still answers and reports the automation flag', async () => {
    const db = new SqliteD1();
    loadMigrations(db);
    const res = await call(seoJobsGet, db, '/api/admin/seo-autopilot/jobs', {
      token: await tokenFor('admin', 'legacy@gptbot.uz'),
    });
    assert.equal(res.status, 200);
    const system = res.body.system as Record<string, unknown>;
    assert.equal(system.first_party_automation_enabled, true);
    assert.equal('external_trigger_enabled' in system, false);
    assert.equal('direct_ai_enabled' in system, false);
  });

  test('an owner endpoint rejects a non-GET verb rather than falling through', async () => {
    const res = await overviewPost({} as never);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('Allow'), 'GET');
  });

  test('P3.1 adds no public listing surface and no payment surface', () => {
    const forbidden = /public[-_]?listing|marketplace_listing|escrow|payment_intent|checkout_session/i;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (forbidden.test(fs.readFileSync(full, 'utf8'))) offenders.push(path.relative(ROOT, full));
      }
    };
    walk(path.join(ROOT, 'functions', 'api', 'admin', 'agents'));
    walk(path.join(ROOT, 'functions', 'platform', 'admin'));
    walk(path.join(ROOT, 'src', 'admin', 'pages', 'owner'));
    assert.deepEqual(offenders, []);
  });

  test('Owner Control Center has no public navigation entry', () => {
    const srcRoot = path.join(ROOT, 'src');
    const publicFiles = fs.readdirSync(srcRoot, { recursive: true })
      .filter((entry) =>
        typeof entry === 'string'
        && /\.(?:ts|tsx)$/.test(entry)
        && !entry.replaceAll('\\', '/').startsWith('admin/'))
      .map((entry) => path.join(srcRoot, entry));
    const offenders = publicFiles.filter((file) =>
      fs.readFileSync(file, 'utf8').includes('/admin-tools/agents'));
    assert.deepEqual(offenders, []);
  });

  test('support_readonly is constrained to the Owner Center shell', () => {
    const app = fs.readFileSync(path.join(ROOT, 'src', 'admin', 'AdminApp.tsx'), 'utf8');
    const sidebar = fs.readFileSync(
      path.join(ROOT, 'src', 'admin', 'components', 'Sidebar.tsx'),
      'utf8',
    );
    assert.ok(app.includes("session.role === 'support_readonly'"));
    assert.ok(app.includes("location.pathname.startsWith('/admin-tools/agents')"));
    assert.ok(app.includes("onPublish={session?.role === 'support_readonly' ? undefined : onPublish}"));
    assert.ok(sidebar.includes("role === 'support_readonly'"));
    assert.ok(sidebar.includes("item.testId === 'nav-owner-center'"));
  });
});

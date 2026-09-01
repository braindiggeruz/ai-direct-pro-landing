import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  buildTelegramCorporateDraftLink,
  createTelegramBusinessConnectLink,
  createTelegramBusinessSendApproval,
  decryptTelegramIdentifier,
  encryptTelegramIdentifier,
  getTelegramBusinessCompanyEligibility,
  getTelegramBusinessConnectionStatus,
  handleTelegramBusinessUpdate,
  LeadRadarTelegramBusinessError,
  parseTelegramBusinessUpdate,
  maintainTelegramBusinessTransport,
  purgeTelegramBusinessCompanyContact,
  purgeTelegramBusinessOrganization,
  sendApprovedTelegramBusinessMessage,
  telegramIdentifierDigest,
  verifyTelegramWebhookSecret,
  type LeadRadarTelegramBusinessEnv,
  type ParsedTelegramBusinessUpdate,
} from '../functions/platform/lead-radar/telegram-business';
import { LeadRadarTelegramBusinessStore } from '../functions/platform/lead-radar/telegram-business-store';
import { onRequestPost as telegramBusinessWebhook } from '../functions/api/telegram/lead-radar-business';
import type { LeadRadarTelegramContact } from '../functions/platform/lead-radar/types';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATIONS = [
  '0036_lead_radar.sql',
  '0041_lead_radar_search_leases.sql',
  '0042_lead_radar_decision_makers.sql',
  '0043_lead_radar_async_funnel.sql',
  '0044_lead_radar_telegram_business.sql',
] as const;
const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const COMPANY = 'company_fixture';
const OWNER_CHAT_ID = 600_100_200;
const COMPANY_CHAT_ID = 700_200_300;
const CONNECTION_ID = 'business-connection-fixture';
const COMPANY_USERNAME = 'VerifiedCompany';
const NOW = new Date('2026-08-25T10:00:00.000Z');
const DATA_KEY = Buffer.alloc(32, 7).toString('base64url');

function env(overrides: Partial<LeadRadarTelegramBusinessEnv> = {}): LeadRadarTelegramBusinessEnv {
  return {
    LEAD_RADAR_CONTACT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_BOT_TOKEN: 'fixture-dedicated-bot-token-never-log',
    LEAD_RADAR_TELEGRAM_WEBHOOK_SECRET: 'fixture-dedicated-webhook-secret',
    LEAD_RADAR_TELEGRAM_DATA_KEY: DATA_KEY,
    LEAD_RADAR_TELEGRAM_BOT_USERNAME: 'LeadRadarBusinessBot',
    LEAD_RADAR_ALLOWED_ORGS: `${ORG_A},${ORG_B}`,
    ...overrides,
  };
}

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'archived')),
    default_locale TEXT NOT NULL CHECK (default_locale IN ('ru', 'uz')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  for (const orgId of [ORG_A, ORG_B]) {
    db.sqlite.prepare(`INSERT INTO organizations (
      id, name, slug, status, default_locale, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', 'ru', ?, ?)`)
      .run(orgId, `Fixture ${orgId.at(-1)}`, orgId, NOW.toISOString(), NOW.toISOString());
  }
  for (const filename of MIGRATIONS) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', filename), 'utf8'));
  }
  return db;
}

function errorCode(error: unknown): string | null {
  return error instanceof LeadRadarTelegramBusinessError ? error.code : null;
}

function startUpdate(updateId: number, token: string, chatId = OWNER_CHAT_ID): ParsedTelegramBusinessUpdate {
  return parseTelegramBusinessUpdate({
    update_id: updateId,
    message: {
      text: `/start ${token}`,
      chat: { id: chatId, type: 'private' },
      from: { id: chatId },
    },
  });
}

function connectionUpdate(
  updateId: number,
  options: { isEnabled?: boolean; canReply?: boolean; connectedAt?: Date } = {},
): ParsedTelegramBusinessUpdate {
  return parseTelegramBusinessUpdate({
    update_id: updateId,
    business_connection: {
      id: CONNECTION_ID,
      user_chat_id: OWNER_CHAT_ID,
      date: Math.floor((options.connectedAt ?? NOW).getTime() / 1000),
      is_enabled: options.isEnabled ?? true,
      rights: { can_reply: options.canReply ?? true },
    },
  });
}

function businessMessageUpdate(
  updateId: number,
  username = COMPANY_USERNAME,
  inboundAt = NOW,
): ParsedTelegramBusinessUpdate {
  return parseTelegramBusinessUpdate({
    update_id: updateId,
    business_message: {
      business_connection_id: CONNECTION_ID,
      date: Math.floor(inboundAt.getTime() / 1000),
      chat: { id: COMPANY_CHAT_ID, type: 'private', username },
      from: { id: COMPANY_CHAT_ID },
      text: 'this inbound message must never be persisted',
    },
  });
}

function addCompany(db: SqliteD1, contactType: 'business' | 'human' | 'unknown' = 'business'): void {
  db.sqlite.prepare(`INSERT INTO lead_radar_searches (
    id, org_id, input_json, status, created_at
  ) VALUES ('search_fixture', ?, '{}', 'ready', ?)`)
    .run(ORG_A, NOW.toISOString());
  const contact = {
    url: `https://t.me/${COMPANY_USERNAME}`,
    username: COMPANY_USERNAME,
    type: contactType,
    confidence: 0.95,
    reason: 'first-party corporate endpoint',
    evidenceIds: ['evidence_fixture'],
    verifiedAt: NOW.toISOString(),
    messageable: false,
  };
  db.sqlite.prepare(`INSERT INTO lead_radar_companies (
    id, org_id, search_id, canonical_key, name, category, city, country,
    score, confidence, priority, score_components_json, signals_json,
    discovered_at, last_verified_at, updated_at, website, telegram_contact_json
  ) VALUES (?, ?, 'search_fixture', 'fixture:company', 'Fixture Company',
    'services', 'Tashkent', 'UZ', 80, 0.9, 'P1', '[]', '[]', ?, ?, ?,
    'https://verified-company.example/', ?)`)
    .run(
      COMPANY,
      ORG_A,
      NOW.toISOString(),
      NOW.toISOString(),
      NOW.toISOString(),
      JSON.stringify(contact),
    );
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence (
    id, org_id, company_id, field_path, value, source_url, source_type,
    observed_at, confidence, classification
  ) VALUES ('evidence_fixture', ?, ?, 'web.telegram.business', ?,
    'https://verified-company.example/contact', 'company_website', ?, 0.95, 'fact')`)
    .run(ORG_A, COMPANY, `https://t.me/${COMPANY_USERNAME}`, NOW.toISOString());
}

async function connectedDatabase(contactType: 'business' | 'human' | 'unknown' = 'business'): Promise<SqliteD1> {
  const db = database();
  addCompany(db, contactType);
  const link = await createTelegramBusinessConnectLink(db.asD1(), env(), ORG_A, NOW);
  const token = new URL(link.url).searchParams.get('start');
  assert.ok(token);
  await handleTelegramBusinessUpdate({ db: db.asD1(), env: env(), update: startUpdate(1, token), now: NOW });
  await handleTelegramBusinessUpdate({ db: db.asD1(), env: env(), update: connectionUpdate(2), now: NOW });
  return db;
}

async function approve(
  db: SqliteD1,
  bindingId: string,
  text: string,
  operatorId = 'operator_fixture',
  now = NOW,
) {
  return createTelegramBusinessSendApproval({
    db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY,
    bindingId, text, operatorId, now,
  });
}

test('AES-GCM identifier encryption round-trips and uses a fresh IV', async () => {
  const first = await encryptTelegramIdentifier(DATA_KEY, `${ORG_A}:test`, CONNECTION_ID);
  const second = await encryptTelegramIdentifier(DATA_KEY, `${ORG_A}:test`, CONNECTION_ID);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(
    await decryptTelegramIdentifier(DATA_KEY, `${ORG_A}:test`, first),
    CONNECTION_ID,
  );
  await assert.rejects(
    decryptTelegramIdentifier(DATA_KEY, `${ORG_B}:test`, first),
    (error) => errorCode(error) === 'telegram_business_invalid_input',
  );
});

test('identifier digests preserve the existing HKDF/HMAC format without deriving an unused AES key', async (t) => {
  const encoder = new TextEncoder();
  const root = await crypto.subtle.importKey('raw', Buffer.from(DATA_KEY, 'base64url'), 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256',
    salt: encoder.encode('gptbot.lead-radar.telegram-business.v1'), info: encoder.encode('identifier-digest') },
  root, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
  const expected = Buffer.from(await crypto.subtle.sign('HMAC', key, encoder.encode('fixture-purpose\u0000fixture-value'))).toString('hex');
  const derive = t.mock.method(crypto.subtle, 'deriveKey');
  assert.equal(await telegramIdentifierDigest(DATA_KEY, 'fixture-purpose', 'fixture-value'), expected);
  assert.equal(derive.mock.calls.length, 1, 'digest-only requests must derive only one HMAC key');
  assert.equal((derive.mock.calls[0].arguments[2] as {name:string}).name, 'HMAC');
  assert.notEqual(await telegramIdentifierDigest(DATA_KEY, 'different-purpose', 'fixture-value'), expected);
  assert.notEqual(await telegramIdentifierDigest(Buffer.alloc(32, 71).toString('base64url'), 'fixture-purpose', 'fixture-value'), expected);
  await assert.rejects(telegramIdentifierDigest('invalid-key', 'fixture-purpose', 'fixture-value'));
});

test('connect nonces are hashed, single-use, expiring and tenant-scoped', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const link = await createTelegramBusinessConnectLink(db.asD1(), env(), ORG_A, NOW);
  const token = new URL(link.url).searchParams.get('start');
  assert.ok(token);
  const stored = db.rows<Record<string, unknown>>('SELECT * FROM lead_radar_tg_connect_nonces');
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.org_id, ORG_A);
  assert.ok(!JSON.stringify(stored).includes(token));

  const processed = await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: startUpdate(10, token), now: NOW,
  });
  assert.deepEqual(processed, { status: 'processed', orgId: ORG_A });
  assert.deepEqual(await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: startUpdate(10, token), now: NOW,
  }), { status: 'replayed', orgId: ORG_A });
  await assert.rejects(
    handleTelegramBusinessUpdate({
      db: db.asD1(), env: env(), update: startUpdate(11, token), now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_business_nonce_expired_or_used',
  );

  const row = db.rows<{ id: string; nonce_hash: string }>(
    'SELECT id, nonce_hash FROM lead_radar_tg_connect_nonces WHERE org_id = ?', ORG_A,
  )[0];
  assert.ok(row);
  assert.equal(await new LeadRadarTelegramBusinessStore(db.asD1()).claimStartNonce({
    orgId: ORG_B,
    id: row.id,
    nonceHash: row.nonce_hash,
    userChatDigest: 'a'.repeat(64),
    startUpdateDigest: 'b'.repeat(64),
    now: NOW.toISOString(),
  }), false);

  const expiring = await createTelegramBusinessConnectLink(db.asD1(), env(), ORG_B, NOW);
  const expiringToken = new URL(expiring.url).searchParams.get('start');
  assert.ok(expiringToken);
  await assert.rejects(
    handleTelegramBusinessUpdate({
      db: db.asD1(),
      env: env(),
      update: startUpdate(12, expiringToken, OWNER_CHAT_ID + 1),
      now: new Date(NOW.getTime() + 16 * 60_000),
    }),
    (error) => errorCode(error) === 'telegram_business_nonce_expired_or_used',
  );
});

test('connect operations replay by org, actor and idempotency key while new operations supersede', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const operation = { actorId: 'owner@example.test', idempotencyKey: 'connect_operation_0001' };
  const first = await createTelegramBusinessConnectLink(db.asD1(), env(), ORG_A, NOW, operation);
  const replay = await createTelegramBusinessConnectLink(
    db.asD1(), env(), ORG_A, new Date(NOW.getTime() + 1_000), operation,
  );
  assert.deepEqual(replay, first);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_connect_nonces WHERE org_id = ?', ORG_A), 1);

  const replacement = await createTelegramBusinessConnectLink(
    db.asD1(), env(), ORG_A, new Date(NOW.getTime() + 2_000),
    { ...operation, idempotencyKey: 'connect_operation_0002' },
  );
  assert.notEqual(replacement.url, first.url);
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_connect_nonces
    WHERE org_id = ? AND superseded_at IS NULL` , ORG_A), 1);
  await assert.rejects(
    createTelegramBusinessConnectLink(
      db.asD1(), env(), ORG_A, new Date(NOW.getTime() + 3_000), operation,
    ),
    (error) => errorCode(error) === 'telegram_business_nonce_expired_or_used',
  );

  const otherActor = await createTelegramBusinessConnectLink(
    db.asD1(), env(), ORG_A, new Date(NOW.getTime() + 4_000),
    { actorId: 'other@example.test', idempotencyKey: operation.idempotencyKey },
  );
  assert.notEqual(otherActor.url, first.url);
});

test('webhook mutations fail closed outside the explicit organization allowlist', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const link = await createTelegramBusinessConnectLink(db.asD1(), env(), ORG_A, NOW);
  const token = new URL(link.url).searchParams.get('start');
  assert.ok(token);
  await assert.rejects(
    handleTelegramBusinessUpdate({
      db: db.asD1(),
      env: env({ LEAD_RADAR_ALLOWED_ORGS: ORG_B }),
      update: startUpdate(49, token),
      now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_business_org_not_allowed',
  );
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_connect_nonces
    WHERE org_id = ? AND used_at IS NOT NULL`, ORG_A), 0);
});

test('webhook authentication is fixed-width and update parsing is bounded/fail-closed', async () => {
  assert.equal(await verifyTelegramWebhookSecret('a-secure-fixture-secret', 'a-secure-fixture-secret'), true);
  assert.equal(await verifyTelegramWebhookSecret('a-secure-fixture-secret', 'wrong-fixture-secret'), false);
  assert.equal(await verifyTelegramWebhookSecret('a-secure-fixture-secret', null), false);
  assert.equal(parseTelegramBusinessUpdate({ update_id: 50 }).kind, 'ignored');
  assert.throws(
    () => parseTelegramBusinessUpdate(JSON.stringify({ update_id: 51, padding: 'x'.repeat(33_000) })),
    (error) => errorCode(error) === 'telegram_business_update_too_large',
  );
  assert.throws(
    () => parseTelegramBusinessUpdate({
      update_id: 52,
      business_message: {
        business_connection_id: CONNECTION_ID,
        date: Math.floor(NOW.getTime() / 1000),
        chat: { id: COMPANY_CHAT_ID, type: 'private', username: COMPANY_USERNAME },
        from: { id: COMPANY_CHAT_ID + 1 },
      },
    }),
    (error) => errorCode(error) === 'telegram_business_invalid_update',
  );

  const poisonDb = {
    prepare() { throw new Error('database must not be reached'); },
  } as unknown as D1Database;
  const unauthorized = await telegramBusinessWebhook({
    request: new Request('https://gptbot.uz/api/telegram/lead-radar-business', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-fixture-secret' },
      body: '{"update_id":53}',
    }),
    env: { ...env(), GPTBOT_DRAFTS_DB: poisonDb },
  } as never);
  assert.equal(unauthorized.status, 401);
  const oversized = await telegramBusinessWebhook({
    request: new Request('https://gptbot.uz/api/telegram/lead-radar-business', {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': env().LEAD_RADAR_TELEGRAM_WEBHOOK_SECRET ?? '',
        'content-length': '40000',
      },
      body: '{"update_id":54}',
    }),
    env: { ...env(), GPTBOT_DRAFTS_DB: poisonDb },
  } as never);
  assert.equal(oversized.status, 413);
});

test('business messages bind only exact existing corporate endpoints', async (t) => {
  const db = await connectedDatabase('business');
  t.after(() => db.sqlite.close());
  const result = await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: businessMessageUpdate(3), now: NOW,
  });
  assert.deepEqual(result, { status: 'processed', orgId: ORG_A });
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_company_chats WHERE org_id = ?', ORG_A), 1);

  for (const type of ['human', 'unknown'] as const) {
    const rejected = await connectedDatabase(type);
    try {
      await assert.rejects(
        handleTelegramBusinessUpdate({
          db: rejected.asD1(), env: env(), update: businessMessageUpdate(4), now: NOW,
        }),
        (error) => errorCode(error) === 'telegram_business_company_unmatched',
      );
      assert.equal(rejected.value('SELECT COUNT(*) FROM lead_radar_tg_company_chats'), 0);
    } finally {
      rejected.sqlite.close();
    }
  }

  const stale = await connectedDatabase('business');
  try {
    await assert.rejects(
      handleTelegramBusinessUpdate({
        db: stale.asD1(), env: env(),
        update: businessMessageUpdate(8, COMPANY_USERNAME, new Date(NOW.getTime() - 25 * 60 * 60_000)),
        now: NOW,
      }),
      (error) => errorCode(error) === 'telegram_business_invalid_update',
    );
    assert.equal(stale.value('SELECT COUNT(*) FROM lead_radar_tg_company_chats'), 0);
  } finally {
    stale.sqlite.close();
  }
});

test('business connection lifecycle is monotonic across out-of-order webhook delivery', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  const minute = 60_000;
  assert.equal((await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(),
    update: connectionUpdate(20, {
      isEnabled: false,
      canReply: false,
      connectedAt: new Date(NOW.getTime() + 2 * minute),
    }),
    now: new Date(NOW.getTime() + 2 * minute),
  })).status, 'processed');
  assert.equal((await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(),
    update: connectionUpdate(19, {
      isEnabled: true,
      canReply: true,
      connectedAt: new Date(NOW.getTime() + minute),
    }),
    now: new Date(NOW.getTime() + 3 * minute),
  })).status, 'replayed');
  assert.equal((await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(),
    update: connectionUpdate(21, {
      isEnabled: true,
      canReply: true,
      connectedAt: new Date(NOW.getTime() + minute),
    }),
    now: new Date(NOW.getTime() + 3 * minute),
  })).status, 'replayed');
  const staleProof = db.sqlite.prepare(`SELECT is_enabled, can_reply, lifecycle_update_id
    FROM lead_radar_tg_business_connections WHERE org_id = ?`).get(ORG_A) as {
      is_enabled: number; can_reply: number; lifecycle_update_id: number;
    };
  assert.deepEqual({ ...staleProof }, { is_enabled: 0, can_reply: 0, lifecycle_update_id: 20 });
});

test('weak, unsupported, stale or future-dated business evidence cannot create a binding', async () => {
  const variants: Array<(contact: Record<string, unknown>) => void> = [
    (contact) => { contact.confidence = 0.79; },
    (contact) => { contact.evidenceIds = []; },
    (contact) => { contact.verifiedAt = new Date(NOW.getTime() - 31 * 24 * 60 * 60_000).toISOString(); },
    (contact) => { contact.verifiedAt = new Date(NOW.getTime() + 6 * 60_000).toISOString(); },
  ];
  for (const mutate of variants) {
    const db = await connectedDatabase();
    try {
      const raw = String(db.value(
        'SELECT telegram_contact_json FROM lead_radar_companies WHERE org_id = ? AND id = ?',
        ORG_A,
        COMPANY,
      ));
      const contact = JSON.parse(raw) as Record<string, unknown>;
      mutate(contact);
      db.sqlite.prepare(`UPDATE lead_radar_companies SET telegram_contact_json = ?
        WHERE org_id = ? AND id = ?`).run(JSON.stringify(contact), ORG_A, COMPANY);
      await assert.rejects(
        handleTelegramBusinessUpdate({
          db: db.asD1(), env: env(), update: businessMessageUpdate(31), now: NOW,
        }),
        (error) => errorCode(error) === 'telegram_business_company_unmatched',
      );
      assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_company_chats'), 0);
    } finally {
      db.sqlite.close();
    }
  }
});

test('corporate endpoint evidence must be a current fact for the same tenant and company', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  db.sqlite.prepare(`INSERT INTO lead_radar_companies (
    id, org_id, search_id, canonical_key, name, category, city, country,
    score, confidence, priority, score_components_json, signals_json,
    discovered_at, last_verified_at, updated_at, website, telegram_contact_json
  ) SELECT 'company_other', org_id, search_id, 'fixture:other', 'Other Company',
    category, city, country, score, confidence, priority, score_components_json,
    signals_json, discovered_at, last_verified_at, updated_at,
    'https://other-company.example/', telegram_contact_json
  FROM lead_radar_companies WHERE org_id = ? AND id = ?`).run(ORG_A, COMPANY);
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence (
    id, org_id, company_id, field_path, value, source_url, source_type,
    observed_at, confidence, classification
  ) VALUES ('evidence_other', ?, 'company_other', 'web.telegram.business', ?,
    'https://other-company.example/contact', 'company_website', ?, 0.95, 'fact')`)
    .run(ORG_A, `https://t.me/${COMPANY_USERNAME}`, NOW.toISOString());
  db.sqlite.prepare(`UPDATE lead_radar_companies
    SET telegram_contact_json = json_set(
      telegram_contact_json, '$.evidenceIds', json_array('evidence_other')
    ) WHERE org_id = ? AND id = ?`).run(ORG_A, COMPANY);
  await assert.rejects(
    handleTelegramBusinessUpdate({
      db: db.asD1(), env: env(), update: businessMessageUpdate(75), now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_business_company_unmatched',
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_company_chats'), 0);
});

test('tenant-scoped read models enforce DNC and the 24-hour eligibility window', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  const beforeInbound = await getTelegramBusinessConnectionStatus(db.asD1(), ORG_A, NOW, env());
  assert.deepEqual(beforeInbound, {
    status: 'connected',
    canReply: true,
    connectedAt: NOW.toISOString(),
    activeCompanyChats: 0,
  });
  assert.deepEqual(await getTelegramBusinessConnectionStatus(db.asD1(), ORG_B, NOW), {
    status: 'unconfigured',
    canReply: false,
    connectedAt: null,
    activeCompanyChats: 0,
  });

  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: businessMessageUpdate(30), now: NOW,
  });
  assert.equal((await getTelegramBusinessConnectionStatus(db.asD1(), ORG_A, NOW, env())).activeCompanyChats, 1);
  const eligible = await getTelegramBusinessCompanyEligibility({
    db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, now: NOW,
  });
  assert.equal(eligible.activeChatEligible, true);
  assert.match(eligible.bindingId ?? '', /^lrtgb_[0-9a-f]{32}$/u);
  assert.equal(eligible.lastInboundAt, NOW.toISOString());
  assert.deepEqual(await getTelegramBusinessCompanyEligibility({
    db: db.asD1(), env: env(), orgId: ORG_B, companyId: COMPANY, now: NOW,
  }), { bindingId: null, activeChatEligible: false, lastInboundAt: null });

  const expired = await getTelegramBusinessCompanyEligibility({
    db: db.asD1(),
    env: env(),
    orgId: ORG_A,
    companyId: COMPANY,
    now: new Date(NOW.getTime() + 25 * 60 * 60_000),
  });
  assert.deepEqual(expired, {
    bindingId: null,
    activeChatEligible: false,
    lastInboundAt: NOW.toISOString(),
  });

  db.sqlite.prepare(`UPDATE lead_radar_companies
    SET lifecycle = 'do_not_contact', suppressed = 1
    WHERE org_id = ? AND id = ?`).run(ORG_A, COMPANY);
  assert.deepEqual(await getTelegramBusinessCompanyEligibility({
    db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, now: NOW,
  }), { bindingId: null, activeChatEligible: false, lastInboundAt: null });
  assert.equal((await getTelegramBusinessConnectionStatus(db.asD1(), ORG_A, NOW, env())).activeCompanyChats, 0);
});

test('approved sends require reply rights and a company-active chat within 24 hours', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: businessMessageUpdate(5), now: NOW,
  });
  const bindingId = String(db.value('SELECT id FROM lead_radar_tg_company_chats'));
  const approval = await approve(db, bindingId, 'Approved corporate reply');
  let fetchCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    fetchCalls += 1;
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'api.telegram.org');
    assert.ok(url.pathname.endsWith('/sendMessage'));
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(payload.business_connection_id, CONNECTION_ID);
    assert.equal(payload.chat_id, String(COMPANY_CHAT_ID));
    assert.equal(payload.text, 'Approved corporate reply');
    return new Response(JSON.stringify({ ok: true, result: { message_id: 9001 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const first = await sendApprovedTelegramBusinessMessage({
    db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY,
    bindingId, text: 'Approved corporate reply', idempotencyKey: 'send_fixture_001',
    approvalToken: approval.approvalToken, operatorId: 'operator_fixture', now: NOW, fetchImpl,
  });
  assert.equal(first.status, 'sent');
  const replay = await sendApprovedTelegramBusinessMessage({
    db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY,
    bindingId, text: 'Approved corporate reply', idempotencyKey: 'send_fixture_001',
    approvalToken: approval.approvalToken, operatorId: 'operator_fixture', now: NOW, fetchImpl,
  });
  assert.equal(replay.status, 'replayed');
  assert.equal(fetchCalls, 1);

  assert.match(
    (await approve(db, bindingId, '🙂'.repeat(4096))).approvalToken,
    /^lrap_[A-Za-z0-9_-]{43}$/u,
  );
  await assert.rejects(
    sendApprovedTelegramBusinessMessage({
      db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY,
      bindingId, text: 'Approved corporate reply', idempotencyKey: 'send_fixture_002',
      approvalToken: approval.approvalToken, operatorId: 'operator_fixture',
      now: new Date(NOW.getTime() + 25 * 60 * 60_000), fetchImpl,
    }),
    (error) => errorCode(error) === 'telegram_business_chat_inactive',
  );
  assert.equal(fetchCalls, 1);

  db.sqlite.prepare(`UPDATE lead_radar_companies
    SET telegram_contact_json = json_set(telegram_contact_json, '$.type', 'unknown')
    WHERE org_id = ? AND id = ?`).run(ORG_A, COMPANY);
  await assert.rejects(
    sendApprovedTelegramBusinessMessage({
      db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY,
      bindingId, text: 'Approved corporate reply', idempotencyKey: 'send_fixture_reclassified',
      approvalToken: approval.approvalToken, operatorId: 'operator_fixture', now: NOW, fetchImpl,
    }),
    (error) => errorCode(error) === 'telegram_business_company_unmatched',
  );
  db.sqlite.prepare(`UPDATE lead_radar_companies
    SET telegram_contact_json = json_set(telegram_contact_json, '$.type', 'business')
    WHERE org_id = ? AND id = ?`).run(ORG_A, COMPANY);

  await handleTelegramBusinessUpdate({
    db: db.asD1(),
    env: env(),
    update: connectionUpdate(6, { canReply: false }),
    now: new Date(NOW.getTime() + 60_000),
  });
  await assert.rejects(
    sendApprovedTelegramBusinessMessage({
      db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY,
      bindingId, text: 'Approved corporate reply', idempotencyKey: 'send_fixture_003',
      approvalToken: approval.approvalToken, operatorId: 'operator_fixture', now: NOW, fetchImpl,
    }),
    (error) => errorCode(error) === 'telegram_business_reply_not_allowed',
  );
});

test('server approvals bind exact raw payload, company, binding and actor and are single-use', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: businessMessageUpdate(71), now: NOW,
  });
  const bindingId = String(db.value('SELECT id FROM lead_radar_tg_company_chats'));
  const text = '  Точный текст 👋  ';
  const approval = await approve(db, bindingId, text, 'owner@example.test');
  let fetchCalls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    fetchCalls += 1;
    assert.equal((JSON.parse(String(init?.body)) as { text: string }).text, text);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 7101 } }));
  };
  await assert.rejects(
    sendApprovedTelegramBusinessMessage({
      db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, bindingId,
      text: text.trim(), idempotencyKey: 'approval_exact_0001',
      approvalToken: approval.approvalToken, operatorId: 'owner@example.test', now: NOW, fetchImpl,
    }),
    (error) => errorCode(error) === 'telegram_business_approval_required',
  );
  await assert.rejects(
    sendApprovedTelegramBusinessMessage({
      db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, bindingId,
      text, idempotencyKey: 'approval_exact_0002',
      approvalToken: approval.approvalToken, operatorId: 'other@example.test', now: NOW, fetchImpl,
    }),
    (error) => errorCode(error) === 'telegram_business_approval_required',
  );
  assert.equal(fetchCalls, 0);
  assert.equal((await sendApprovedTelegramBusinessMessage({
    db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, bindingId,
    text, idempotencyKey: 'approval_exact_0003',
    approvalToken: approval.approvalToken, operatorId: 'owner@example.test', now: NOW, fetchImpl,
  })).status, 'sent');
  await assert.rejects(
    sendApprovedTelegramBusinessMessage({
      db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, bindingId,
      text, idempotencyKey: 'approval_exact_0004',
      approvalToken: approval.approvalToken, operatorId: 'owner@example.test', now: NOW, fetchImpl,
    }),
    (error) => errorCode(error) === 'telegram_business_approval_required',
  );
  assert.equal(fetchCalls, 1);

  await assert.rejects(
    approve(db, bindingId, '🙂'.repeat(4097)),
    (error) => errorCode(error) === 'telegram_business_invalid_input',
  );
  await assert.rejects(
    approve(db, bindingId, '   '),
    (error) => errorCode(error) === 'telegram_business_invalid_input',
  );
});

test('DNC changes before dispatch atomically cancel an approved send', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: businessMessageUpdate(72), now: NOW,
  });
  const bindingId = String(db.value('SELECT id FROM lead_radar_tg_company_chats'));
  const approval = await approve(db, bindingId, 'Do not cross DNC boundary');
  let providerCalls = 0;
  await assert.rejects(
    sendApprovedTelegramBusinessMessage({
      db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, bindingId,
      text: 'Do not cross DNC boundary', idempotencyKey: 'dnc_race_0001',
      approvalToken: approval.approvalToken, operatorId: 'operator_fixture', now: NOW,
      beforeDispatch: () => {
        db.sqlite.prepare(`UPDATE lead_radar_companies
          SET lifecycle = 'do_not_contact', suppressed = 1
          WHERE org_id = ? AND id = ?`).run(ORG_A, COMPANY);
      },
      fetchImpl: async () => {
        providerCalls += 1;
        return new Response('{}');
      },
    }),
    (error) => errorCode(error) === 'telegram_business_send_canceled',
  );
  assert.equal(providerCalls, 0);
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_send_effects
    WHERE status = 'canceled'`), 1);
});

test('provider-boundary ambiguity is explicit, never retried and blocks new approvals', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: businessMessageUpdate(73), now: NOW,
  });
  const bindingId = String(db.value('SELECT id FROM lead_radar_tg_company_chats'));
  const text = 'One provider-boundary attempt only';
  const approval = await approve(db, bindingId, text);
  let providerCalls = 0;
  const fetchImpl: typeof fetch = async () => {
    providerCalls += 1;
    throw new Error('ambiguous network boundary');
  };
  const first = await sendApprovedTelegramBusinessMessage({
    db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, bindingId, text,
    idempotencyKey: 'ambiguous_send_0001', approvalToken: approval.approvalToken,
    operatorId: 'operator_fixture', now: NOW, fetchImpl,
  });
  assert.equal(first.status, 'ambiguous');
  const replay = await sendApprovedTelegramBusinessMessage({
    db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, bindingId, text,
    idempotencyKey: 'ambiguous_send_0001', approvalToken: approval.approvalToken,
    operatorId: 'operator_fixture', now: NOW, fetchImpl,
  });
  assert.deepEqual(replay, first);
  assert.equal(providerCalls, 1);
  await assert.rejects(
    approve(db, bindingId, 'A second attempt must remain blocked'),
    (error) => errorCode(error) === 'telegram_business_send_ambiguous',
  );
});

test('maintenance reconciles crashes without crossing the provider boundary', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: businessMessageUpdate(74), now: NOW,
  });
  const bindingId = String(db.value('SELECT id FROM lead_radar_tg_company_chats'));
  const text = 'Crash-safe reservation';
  const approval = await approve(db, bindingId, text);
  await assert.rejects(sendApprovedTelegramBusinessMessage({
    db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, bindingId, text,
    idempotencyKey: 'crash_reconcile_0001', approvalToken: approval.approvalToken,
    operatorId: 'operator_fixture', now: NOW,
    beforeDispatch: () => { throw new Error('simulated isolate crash'); },
    fetchImpl: async () => { throw new Error('must not execute'); },
  }), /simulated isolate crash/u);
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_send_effects
    WHERE status = 'reserved'`), 1);
  await maintainTelegramBusinessTransport(db.asD1(), new Date(NOW.getTime() + 11 * 60_000));
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_send_effects
    WHERE status = 'canceled'`), 1);
  await assert.rejects(
    sendApprovedTelegramBusinessMessage({
      db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY, bindingId, text,
      idempotencyKey: 'crash_reconcile_0001', approvalToken: approval.approvalToken,
      operatorId: 'operator_fixture', now: new Date(NOW.getTime() + 11 * 60_000),
    }),
    (error) => errorCode(error) === 'telegram_business_send_canceled',
  );
});

test('Telegram Business sends enforce an atomic rolling daily limit', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: businessMessageUpdate(61), now: NOW,
  });
  const bindingId = String(db.value('SELECT id FROM lead_radar_tg_company_chats'));
  const fetchImpl: typeof fetch = async () => new Response(
    JSON.stringify({ ok: true, result: { message_id: 6101 } }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const firstApproval = await approve(db, bindingId, 'First approved reply');
  await sendApprovedTelegramBusinessMessage({
    db: db.asD1(), env: env({ LEAD_RADAR_CONTACT_DAILY_LIMIT: '1' }),
    orgId: ORG_A, companyId: COMPANY, bindingId, text: 'First approved reply',
    idempotencyKey: 'send_rate_limit_001',
    approvalToken: firstApproval.approvalToken, operatorId: 'operator_fixture',
    now: NOW, fetchImpl,
  });
  const later = new Date(NOW.getTime() + 31_000);
  const secondApproval = await approve(db, bindingId, 'Second approved reply', 'operator_fixture', later);
  await assert.rejects(
    sendApprovedTelegramBusinessMessage({
      db: db.asD1(), env: env({ LEAD_RADAR_CONTACT_DAILY_LIMIT: '1' }),
      orgId: ORG_A, companyId: COMPANY, bindingId, text: 'Second approved reply',
      idempotencyKey: 'send_rate_limit_002',
      approvalToken: secondApproval.approvalToken, operatorId: 'operator_fixture',
      now: later, fetchImpl,
    }),
    (error) => errorCode(error) === 'telegram_business_rate_limited',
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_send_effects'), 1);
});

test('new Telegram transport tables disclose no token, ids, username, names or message text', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: businessMessageUpdate(7), now: NOW,
  });
  const bindingId = String(db.value('SELECT id FROM lead_radar_tg_company_chats'));
  const approval = await approve(db, bindingId, 'Confidential fixture outreach text');
  await sendApprovedTelegramBusinessMessage({
    db: db.asD1(), env: env(), orgId: ORG_A, companyId: COMPANY,
    bindingId, text: 'Confidential fixture outreach text', idempotencyKey: 'send_fixture_004',
    approvalToken: approval.approvalToken, operatorId: 'operator_fixture',
    now: NOW,
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, result: { message_id: 404 } })),
  });
  const tables = [
    'lead_radar_tg_connect_nonces',
    'lead_radar_tg_business_connections',
    'lead_radar_tg_company_chats',
    'lead_radar_tg_webhook_updates',
    'lead_radar_tg_send_approvals',
    'lead_radar_tg_send_effects',
  ];
  const serialized = JSON.stringify(tables.flatMap((table) => db.rows(`SELECT * FROM ${table}`)));
  for (const forbidden of [
    env().LEAD_RADAR_TELEGRAM_BOT_TOKEN ?? '',
    env().LEAD_RADAR_TELEGRAM_WEBHOOK_SECRET ?? '',
    CONNECTION_ID,
    String(OWNER_CHAT_ID),
    String(COMPANY_CHAT_ID),
    COMPANY_USERNAME,
    'Fixture Company',
    'Confidential fixture outreach text',
    'this inbound message must never be persisted',
  ]) {
    assert.ok(!serialized.includes(forbidden), `must not persist fixture value: ${forbidden}`);
  }
  const columnNames = tables.flatMap((table) => (
    db.rows<{ name: string }>(`PRAGMA table_info('${table}')`).map((row) => row.name)
  )).join(' ');
  assert.doesNotMatch(columnNames, /(?:bot_token|message_text|username|person_name|raw_telegram)/u);
});

test('Telegram transport retention and DSAR purge encrypted contact state independently of flags', async (t) => {
  const db = await connectedDatabase();
  t.after(() => db.sqlite.close());
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: env(), update: businessMessageUpdate(76), now: NOW,
  });
  const bindingId = String(db.value('SELECT id FROM lead_radar_tg_company_chats'));
  await approve(db, bindingId, 'Approval removed by company DSAR');
  await maintainTelegramBusinessTransport(db.asD1(), new Date(NOW.getTime() + 6 * 60_000));
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_send_approvals WHERE org_id = ?', ORG_A), 0);
  await approve(
    db,
    bindingId,
    'Second approval removed by company DSAR',
    'operator_fixture',
    new Date(NOW.getTime() + 6 * 60_000),
  );
  await purgeTelegramBusinessCompanyContact(db.asD1(), ORG_A, COMPANY, NOW);
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_company_chats
    WHERE org_id = ? AND company_id = ?`, ORG_A, COMPANY), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_send_approvals WHERE org_id = ?', ORG_A), 0);

  await purgeTelegramBusinessOrganization(db.asD1(), ORG_A);
  for (const table of [
    'lead_radar_tg_business_connections',
    'lead_radar_tg_connect_nonces',
    'lead_radar_tg_webhook_updates',
  ]) {
    assert.equal(db.value(`SELECT COUNT(*) FROM ${table} WHERE org_id = ?`, ORG_A), 0);
  }
});

test('manual corporate compose link pre-fills a draft and never accepts human endpoints', () => {
  const contact: LeadRadarTelegramContact = {
    url: `https://t.me/${COMPANY_USERNAME}`,
    username: COMPANY_USERNAME,
    type: 'business',
    confidence: 0.95,
    reason: 'verified first-party endpoint',
    evidenceIds: ['evidence_fixture'],
    verifiedAt: NOW.toISOString(),
    messageable: false,
  };
  const link = buildTelegramCorporateDraftLink(contact, 'Review before sending', NOW);
  assert.ok(link);
  const url = new URL(link);
  assert.equal(url.hostname, 't.me');
  assert.equal(url.searchParams.get('text'), 'Review before sending');
  assert.equal(buildTelegramCorporateDraftLink({ ...contact, type: 'human' }, 'No', NOW), null);
  assert.equal(buildTelegramCorporateDraftLink({ ...contact, type: 'unknown' }, 'No', NOW), null);
});

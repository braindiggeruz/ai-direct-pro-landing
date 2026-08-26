import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as leadRadarRoute from '../functions/api/admin/lead-radar/[[path]]';
import {
  createTelegramBusinessConnectLink,
  handleTelegramBusinessUpdate,
  LeadRadarStore,
  ownerOrgId,
  parseTelegramBusinessUpdate,
  resolveLeadRadarCapabilities,
} from '../functions/platform/lead-radar';
import type { LeadRadarQueueMessage } from '../functions/platform/lead-radar';
import {
  callRoute,
  freshAdminDb,
  OWNER_EMAIL,
  platformToken,
} from './helpers/bormi-admin-fixture';
import { SqliteD1 } from './helpers/sqlite-d1';

const NOW = '2026-08-25T00:00:00.000Z';
const TELEGRAM_DATA_KEY = Buffer.alloc(32, 7).toString('base64url');

class MemoryQueue {
  readonly messages: LeadRadarQueueMessage[] = [];

  async send(message: LeadRadarQueueMessage): Promise<void> {
    this.messages.push(structuredClone(message));
  }

  async sendBatch(messages: Array<{ body: LeadRadarQueueMessage }>): Promise<void> {
    for (const message of messages) this.messages.push(structuredClone(message.body));
  }
}

function installLeadRadarLedger(db: SqliteD1): void {
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`);
  for (const name of [
    '0036_lead_radar.sql',
    '0041_lead_radar_search_leases.sql',
    '0042_lead_radar_decision_makers.sql',
    '0043_lead_radar_async_funnel.sql',
    '0044_lead_radar_telegram_business.sql',
  ]) {
    db.sqlite.prepare('INSERT OR IGNORE INTO d1_migrations(name) VALUES (?)').run(name);
  }
}

async function ownerCapabilities(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const orgId = await ownerOrgId(OWNER_EMAIL);
  return {
    LEAD_RADAR_ADMISSION_ENABLED: 'false',
    LEAD_RADAR_PROCESSING_ENABLED: 'false',
    LEAD_RADAR_CONTACT_ENABLED: 'false',
    LEAD_RADAR_ALLOWED_ORGS: orgId,
    ...overrides,
  };
}

async function telegramOwnerEnv(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return ownerCapabilities({
    LEAD_RADAR_CONTACT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_BOT_TOKEN: 'fixture-dedicated-bot-token-never-log',
    LEAD_RADAR_TELEGRAM_WEBHOOK_SECRET: 'synthetic-webhook-secret',
    LEAD_RADAR_TELEGRAM_DATA_KEY: TELEGRAM_DATA_KEY,
    LEAD_RADAR_TELEGRAM_BOT_USERNAME: 'lead_radar_fixture_bot',
    ...overrides,
  });
}

test('campaign capabilities expose validated server policy and fail closed on malformed config', async () => {
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const common = {
    LEAD_RADAR_ALLOWED_ORGS: orgId,
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: TELEGRAM_DATA_KEY,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: 't'.repeat(43),
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: {
      fetch: async () => new Response(null, { status: 503 }),
    } as Fetcher,
  };
  const configured = resolveLeadRadarCapabilities({
    ...common,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '29',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '240',
  }, orgId);
  assert.equal(configured.telegramCampaignDailyLimit, 29);
  assert.equal(configured.telegramCampaignMinimumIntervalSeconds, 240);
  assert.equal(configured.campaignAutoSendEnabled, true);
  assert.deepEqual(configured.telegramAccountReadiness, {
    status: 'probe_required',
    blockers: [],
  });

  const malformed = resolveLeadRadarCapabilities({
    ...common,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '31',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '119',
  }, orgId);
  assert.equal(malformed.telegramCampaignDailyLimit, 30);
  assert.equal(malformed.telegramCampaignMinimumIntervalSeconds, 120);
  assert.equal(malformed.campaignOutreachEnabled, true);
  assert.equal(malformed.campaignAutoSendEnabled, false);

  const missingInfrastructure = resolveLeadRadarCapabilities({
    ...common,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: 'not-a-key',
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: undefined,
  }, orgId);
  assert.equal(missingInfrastructure.telegramAccountEnabled, false);
  assert.equal(missingInfrastructure.campaignOutreachEnabled, false);
  assert.deepEqual(missingInfrastructure.telegramAccountReadiness, {
    status: 'blocked',
    blockers: ['campaign_data_key_missing', 'gateway_binding_missing'],
  });

  const paidOrUnsignedTransport = resolveLeadRadarCapabilities({
    ...common,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'container',
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: undefined,
  }, orgId);
  assert.equal(paidOrUnsignedTransport.telegramAccountEnabled, false);
  assert.deepEqual(paidOrUnsignedTransport.telegramAccountReadiness, {
    status: 'blocked',
    blockers: ['bridge_transport_mode_invalid', 'gateway_internal_token_missing'],
  });

  const deniedTenant = resolveLeadRadarCapabilities(common, 'org_denied_fixture');
  assert.equal(deniedTenant.telegramAccountEnabled, false);
  assert.deepEqual(deniedTenant.telegramAccountReadiness, {
    status: 'blocked',
    blockers: ['tenant_not_allowed'],
  });
});

async function insertCorporateTelegramLead(db: SqliteD1): Promise<string> {
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const store = new LeadRadarStore(db.asD1());
  const searchId = await store.createSearch(orgId, {
    niche: 'Стоматологии', city: 'Ташкент', country: 'UZ',
    offer: 'AI-бот', desiredCount: 10, telegramRequired: true, languages: ['ru', 'uz'],
  }, NOW);
  const leadId = await store.insertLead(orgId, searchId, {
    canonicalKey: 'domain:corporate-telegram.example.invalid',
    name: 'Corporate Telegram Fixture', category: 'Стоматология',
    city: 'Ташкент', country: 'UZ', address: 'Ташкент',
    website: 'https://corporate-telegram.example.invalid',
    phone: null, genericEmail: null,
    telegramUrl: 'https://t.me/corporate_fixture',
    telegramContact: {
      url: 'https://t.me/corporate_fixture', username: 'corporate_fixture',
      type: 'business', confidence: 0.96,
      reason: 'synthetic first-party corporate endpoint',
      evidenceIds: ['ev-corporate-telegram'], verifiedAt: NOW, messageable: false,
    },
    decisionMakers: [], score: 70, confidence: 0.9, priority: 'P2',
    lifecycle: 'new', suppressed: false, scoreComponents: [], signals: [],
    evidence: [{
      id: 'ev-corporate-telegram', fieldPath: 'web.telegram.business',
      value: '@corporate_fixture',
      sourceUrl: 'https://corporate-telegram.example.invalid/contact',
      sourceType: 'company_website', observedAt: NOW, confidence: 0.96,
      classification: 'fact',
    }],
    enrichmentStatus: 'enriched', enrichmentReason: 'enriched', enrichmentAttempts: 1,
    discoveredAt: NOW, lastVerifiedAt: NOW,
  });
  assert.ok(leadId);
  return leadId;
}

async function bindCorporateTelegramChat(
  db: SqliteD1,
  env: Record<string, unknown>,
  leadId: string,
): Promise<string> {
  const orgId = await ownerOrgId(OWNER_EMAIL);
  // The API enforces Telegram's rolling 24-hour business-chat window against
  // the real request clock. Keep this fixture fresh so the test does not start
  // failing simply because the calendar moved past its original authoring day.
  const now = new Date();
  const link = await createTelegramBusinessConnectLink(db.asD1(), env, orgId, now);
  const connectToken = new URL(link.url).searchParams.get('start');
  assert.ok(connectToken);
  const updateEnv = env as Parameters<typeof handleTelegramBusinessUpdate>[0]['env'];
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: updateEnv, now,
    update: parseTelegramBusinessUpdate({
      update_id: 9101,
      message: {
        text: `/start ${connectToken}`,
        chat: { id: 610001, type: 'private' },
        from: { id: 610001 },
      },
    }),
  });
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: updateEnv, now,
    update: parseTelegramBusinessUpdate({
      update_id: 9102,
      business_connection: {
        id: 'api-business-connection', user_chat_id: 610001,
        date: Math.floor(now.getTime() / 1000), is_enabled: true,
        rights: { can_reply: true },
      },
    }),
  });
  await handleTelegramBusinessUpdate({
    db: db.asD1(), env: updateEnv, now,
    update: parseTelegramBusinessUpdate({
      update_id: 9103,
      business_message: {
        business_connection_id: 'api-business-connection',
        date: Math.floor(now.getTime() / 1000),
        chat: { id: 710001, type: 'private', username: 'corporate_fixture' },
        from: { id: 710001 },
      },
    }),
  });
  return String(db.value(`SELECT id FROM lead_radar_tg_company_chats
    WHERE org_id = ? AND company_id = ?`, orgId, leadId));
}

test('admission pause returns before body parsing, schema access, or queue writes', async () => {
  const db = new SqliteD1();
  const token = await platformToken('platform_owner');
  const queue = new MemoryQueue();
  const response = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/searches',
    {
      method: 'POST',
      token,
      body: {},
      params: { path: 'searches' },
      env: {
        ...await ownerCapabilities(),
        AUTOMATION_QUEUE: queue,
      },
    },
  );
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'lead_radar_admission_paused');
  assert.equal(response.headers.get('retry-after'), '300');
  assert.equal(queue.messages.length, 0);
  assert.equal(db.value(`SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'lead_radar_%'`), 0);
});

test('schema mismatch fails closed with 503 and performs zero runtime DDL', async () => {
  const db = new SqliteD1();
  const response = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar',
    {
      token: await platformToken('platform_owner'),
      env: await ownerCapabilities(),
    },
  );
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'lead_radar_schema_unavailable');
  assert.equal(db.value(`SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'lead_radar_%'`), 0);
});

test('research response is server-redacted and contact approval stays closed', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const store = new LeadRadarStore(db.asD1());
  const searchId = await store.createSearch(orgId, {
    niche: 'Стоматологии', city: 'Ташкент', country: 'UZ',
    offer: 'AI-бот', desiredCount: 10, telegramRequired: false, languages: ['ru', 'uz'],
  }, NOW);
  const leadId = await store.insertLead(orgId, searchId, {
    canonicalKey: 'domain:clinic.example.invalid',
    name: 'Clinic Fixture', category: 'Стоматология', city: 'Ташкент', country: 'UZ',
    address: 'Ташкент', website: 'https://clinic.example.invalid',
    phone: '+998901111111', genericEmail: 'info@clinic.example.invalid',
    telegramUrl: 'https://t.me/fixture_director',
    telegramContact: {
      url: 'https://t.me/fixture_director', username: 'fixture_director', type: 'human',
      confidence: 0.96, reason: 'synthetic official-site fixture',
      evidenceIds: ['ev-telegram'], verifiedAt: NOW, messageable: false,
    },
    decisionMakers: [{
      id: 'dm-fixture', name: 'Fixture Person', role: 'директор',
      telegramUrl: 'https://t.me/fixture_director', telegramUsername: 'fixture_director',
      contactType: 'human', confidence: 0.96, evidenceIds: ['ev-person', 'ev-telegram'],
      sourceUrl: 'https://clinic.example.invalid/team',
      evidence: 'Synthetic person-role fixture', verifiedAt: NOW,
      sourceClaim: 'official_site_proximity', contactReviewStatus: 'unreviewed',
      contactReviewedAt: null,
    }],
    score: 70, confidence: 0.9, priority: 'P2', lifecycle: 'new', suppressed: false,
    scoreComponents: [], signals: [],
    evidence: [
      {
        id: 'ev-person', fieldPath: 'decision_makers.named_role', value: 'synthetic role',
        sourceUrl: 'https://clinic.example.invalid/team', sourceType: 'company_website',
        observedAt: NOW, confidence: 0.96, classification: 'fact',
      },
      {
        id: 'ev-telegram', fieldPath: 'web.telegram.human', value: '@fixture_director',
        sourceUrl: 'https://clinic.example.invalid/team', sourceType: 'company_website',
        observedAt: NOW, confidence: 0.96, classification: 'fact',
      },
    ],
    enrichmentStatus: 'enriched', enrichmentReason: 'enriched', enrichmentAttempts: 1,
    discoveredAt: NOW, lastVerifiedAt: NOW,
  });
  assert.ok(leadId);
  const token = await platformToken('platform_owner');
  const env = await ownerCapabilities();
  const result = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/searches/${searchId}`,
    { token, params: { path: `searches/${searchId}` }, env },
  );
  assert.equal(result.status, 200);
  const leads = result.body.leads as Array<Record<string, unknown>>;
  assert.equal(leads.length, 1);
  assert.deepEqual(leads[0]?.decisionMakers, []);
  assert.equal(leads[0]?.telegramContact, null);
  assert.equal(leads[0]?.telegramUrl, null);
  assert.deepEqual(leads[0]?.evidence, []);
  assert.deepEqual(result.body.capabilities, {
    admissionEnabled: false,
    processingEnabled: false,
    contactEnabled: false,
    telegramDiscoveryEnabled: false,
    personalContactsEnabled: false,
    individualOutreachEnabled: false,
    telegramAccountEnabled: false,
    telegramAccountReadiness: {
      status: 'blocked',
      blockers: [
        'feature_disabled',
        'campaign_data_key_missing',
        'gateway_binding_missing',
        'bridge_transport_mode_invalid',
        'gateway_internal_token_missing',
      ],
    },
    campaignOutreachEnabled: false,
    campaignAutoSendEnabled: false,
    telegramCampaignDailyLimit: 30,
    telegramCampaignMinimumIntervalSeconds: 120,
    mode: 'paused',
  });
  const interpretation = result.body.search.interpretation as Record<string, unknown>;
  assert.equal(interpretation.canonicalCategory, 'Стоматология');
  assert.equal(interpretation.expanded, true);
  assert.ok(['exact', 'alias', 'semantic', 'fuzzy'].includes(String(interpretation.matchKind)));
  assert.ok(Number(interpretation.confidence) >= 0.9);

  const approve = await callRoute(
    leadRadarRoute.onRequestPatch,
    db,
    `/api/admin/lead-radar/leads/${leadId}/decision-makers/dm-fixture`,
    {
      method: 'PATCH', token,
      params: { path: `leads/${leadId}/decision-makers/dm-fixture` },
      body: { contactReviewStatus: 'approved' }, env,
    },
  );
  assert.equal(approve.status, 409);
  assert.equal(approve.body.error, 'lead_radar_contact_paused');
  const raw = db.sqlite.prepare(`SELECT decision_makers_json FROM lead_radar_companies
    WHERE org_id = ? AND id = ?`).get(orgId, leadId) as { decision_makers_json: string };
  assert.equal(JSON.parse(raw.decision_makers_json)[0]?.contactReviewStatus, 'unreviewed');

  const dnc = await callRoute(
    leadRadarRoute.onRequestPatch,
    db,
    `/api/admin/lead-radar/leads/${leadId}`,
    {
      method: 'PATCH', token, params: { path: `leads/${leadId}` },
      body: { lifecycle: 'do_not_contact' }, env,
    },
  );
  assert.equal(dnc.status, 200);
  assert.equal(db.value(`SELECT suppressed FROM lead_radar_companies WHERE id = ?`, leadId), 1);
});

test('allowlisted admission creates one durable queued search and envelope', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const queue = new MemoryQueue();
  const token = await platformToken('platform_owner');
  const env = {
    ...await ownerCapabilities({ LEAD_RADAR_ADMISSION_ENABLED: 'true' }),
    AUTOMATION_QUEUE: queue,
  };
  const body = {
    niche: 'Стоматологии', city: 'Ташкент', country: 'UZ', offer: 'AI-бот',
    desiredCount: 10, telegramRequired: false, languages: ['ru', 'uz'],
  };
  const response = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/searches',
    {
      method: 'POST', token,
      params: { path: 'searches' },
      headers: { 'Idempotency-Key': 'api-admission-0001' },
      body,
      env,
    },
  );
  assert.equal(response.status, 202);

  const replay = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/searches',
    {
      method: 'POST', token, params: { path: 'searches' }, body, env,
      headers: { 'Idempotency-Key': 'api-admission-0001' },
    },
  );
  assert.equal(replay.status, 202);

  const conflict = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/searches',
    {
      method: 'POST', token, params: { path: 'searches' }, env,
      headers: { 'Idempotency-Key': 'api-admission-0001' },
      body: { ...body, offer: 'Другое предложение' },
    },
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, 'lead_radar_request_key_conflict');

  assert.equal(queue.messages.length, 1);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_searches'), 1);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_jobs'), 1);
});

test('enabled admission requires an explicit HTTP idempotency key', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const queue = new MemoryQueue();
  const response = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/searches',
    {
      method: 'POST', token: await platformToken('platform_owner'),
      params: { path: 'searches' },
      body: {
        niche: 'Стоматологии', city: 'Ташкент', country: 'UZ', offer: 'AI-бот',
        desiredCount: 10, telegramRequired: false, languages: ['ru', 'uz'],
      },
      env: {
        ...await ownerCapabilities({ LEAD_RADAR_ADMISSION_ENABLED: 'true' }),
        AUTOMATION_QUEUE: queue,
      },
    },
  );
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'lead_radar_idempotency_key_required');
  assert.equal(queue.messages.length, 0);
});

test('Telegram Business status fails closed before schema access when contact is paused', async () => {
  const db = new SqliteD1();
  const response = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-business',
    {
      token: await platformToken('platform_owner'),
      params: { path: 'telegram-business' },
      env: await ownerCapabilities(),
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    status: 'paused', canReply: false, connectedAt: null, activeCompanyChats: 0,
  });
  assert.equal(db.value(`SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'lead_radar_%'`), 0);
});

test('Telegram Business connect creates only a tenant-scoped expiring nonce and a safe deep link', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const token = await platformToken('platform_owner');
  const env = await telegramOwnerEnv();
  const initial = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-business',
    { token, params: { path: 'telegram-business' }, env },
  );
  assert.equal(initial.status, 200);
  assert.equal(initial.body.status, 'configured');

  const missingKey = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-business/connect',
    {
      method: 'POST', token,
      params: { path: 'telegram-business/connect' }, env,
    },
  );
  assert.equal(missingKey.status, 400);
  assert.equal(missingKey.body.error, 'lead_radar_idempotency_key_required');

  const connect = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-business/connect',
    {
      method: 'POST', token,
      params: { path: 'telegram-business/connect' }, env,
      headers: { 'Idempotency-Key': 'telegram-connect-local-0001' },
    },
  );
  assert.equal(connect.status, 201);
  const url = new URL(String(connect.body.url));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 't.me');
  assert.equal(url.pathname, '/lead_radar_fixture_bot');
  assert.match(url.searchParams.get('start') ?? '', /^lr_[0-9a-f]{16}_[A-Za-z0-9_-]{32}$/u);
  assert.ok(Date.parse(String(connect.body.expiresAt)) > Date.now());
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_connect_nonces'), 1);
  const stored = db.sqlite.prepare(`SELECT nonce_hash, user_chat_digest, used_at
    FROM lead_radar_tg_connect_nonces`).get() as {
      nonce_hash: string; user_chat_digest: string | null; used_at: string | null;
    };
  assert.match(stored.nonce_hash, /^[0-9a-f]{64}$/u);
  assert.equal(stored.user_chat_digest, null);
  assert.equal(stored.used_at, null);

  const replay = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-business/connect',
    {
      method: 'POST', token,
      params: { path: 'telegram-business/connect' }, env,
      headers: { 'Idempotency-Key': 'telegram-connect-local-0001' },
    },
  );
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.body, connect.body);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_connect_nonces'), 1);

  const erased = await callRoute(
    leadRadarRoute.onRequestDelete,
    db,
    '/api/admin/lead-radar/telegram-business',
    {
      method: 'DELETE', token,
      params: { path: 'telegram-business' }, env,
    },
  );
  assert.equal(erased.status, 200);
  assert.deepEqual(erased.body, { ok: true });
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_connect_nonces'), 0);
});

test('Telegram outreach prepare exposes only a verified corporate manual draft', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const leadId = await insertCorporateTelegramLead(db);
  const response = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/leads/${leadId}/telegram/prepare`,
    {
      method: 'POST', token: await platformToken('platform_owner'),
      params: { path: `leads/${leadId}/telegram/prepare` },
      env: await telegramOwnerEnv(),
      body: { text: 'Здравствуйте! Предлагаем аккуратно обсудить автоматизацию.' },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.endpoint, {
    kind: 'business', verification: 'verified', ownership: 'corporate', doNotContact: false,
  });
  const draft = new URL(String(response.body.manualDraftUrl));
  assert.equal(draft.hostname, 't.me');
  assert.equal(draft.pathname, '/corporate_fixture');
  assert.equal(
    draft.searchParams.get('text'),
    'Здравствуйте! Предлагаем аккуратно обсудить автоматизацию.',
  );
  assert.equal(response.body.bindingId, null);
  assert.equal(response.body.activeChatEligible, false);
  assert.equal(response.body.lastInboundAt, null);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_send_effects'), 0);
});

test('Telegram Business approval is server-minted and send requires the exact payload plus idempotency', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const leadId = await insertCorporateTelegramLead(db);
  const token = await platformToken('platform_owner');
  const env = await telegramOwnerEnv();
  const bindingId = await bindCorporateTelegramChat(db, env, leadId);
  const text = '  Сообщение после ручной проверки 👋  ';
  const base = {
    method: 'POST' as const,
    token,
    params: { path: `leads/${leadId}/telegram/send` },
    env,
    body: {
      text,
      bindingId,
      approvalToken: 'lrap_invalid',
    },
  };
  const missingKey = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/leads/${leadId}/telegram/send`,
    base,
  );
  assert.equal(missingKey.status, 400);
  assert.equal(missingKey.body.error, 'lead_radar_idempotency_key_required');

  const approval = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/leads/${leadId}/telegram/approve`,
    {
      method: 'POST', token,
      params: { path: `leads/${leadId}/telegram/approve` }, env,
      body: { text, bindingId },
    },
  );
  assert.equal(approval.status, 201);
  assert.match(String(approval.body.approvalToken), /^lrap_[A-Za-z0-9_-]{43}$/u);

  const alteredPayload = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/leads/${leadId}/telegram/send`,
    {
      ...base,
      headers: { 'Idempotency-Key': 'telegram-send-local-0001' },
      body: {
        text: text.trim(), bindingId,
        approvalToken: approval.body.approvalToken,
      },
    },
  );
  assert.equal(alteredPayload.status, 409);
  assert.equal(alteredPayload.body.error, 'telegram_business_approval_required');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_send_effects'), 0);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as leadRadarRoute from '../functions/api/admin/lead-radar/[[path]]';
import {
  completeTelegramUserAccountConnection,
  createTelegramUserAccountPending,
  LeadRadarStore,
  ownerOrgId,
} from '../functions/platform/lead-radar';
import {
  beginTelegramAccountConnection,
  PrivateTelegramCampaignSender,
  TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS,
  TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS,
  TelegramAccountServiceError,
} from '../functions/platform/lead-radar/telegram-account-service';
import {
  callRoute,
  freshAdminDb,
  OWNER_EMAIL,
  platformToken,
} from './helpers/bormi-admin-fixture';
import { SqliteD1 } from './helpers/sqlite-d1';

const CAMPAIGN_DATA_KEY = Buffer.alloc(32, 19).toString('base64url');

function abortAwareNeverResolvingService(onSignal: (signal: AbortSignal) => void): Fetcher {
  return {
    fetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const signal = init?.signal;
      assert.ok(signal);
      onSignal(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
  } as Fetcher;
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
    '0045_lead_radar_telegram_campaigns.sql',
    '0046_lead_radar_telegram_campaign_safety.sql',
  ]) {
    db.sqlite.prepare('INSERT OR IGNORE INTO d1_migrations(name) VALUES (?)').run(name);
  }
}

class MemoryQueue {
  readonly messages: unknown[] = [];

  async send(message: unknown): Promise<void> {
    this.messages.push(structuredClone(message));
  }
}

class TelegramAccountServiceFixture {
  readonly authId = 'auth_fixture_1234567890';
  readonly accountRef = 'account_fixture_1234567890';
  readonly requests: Array<{ pathname: string; method: string }> = [];
  activeAuthId = this.authId;
  connected = false;
  terminalStatus: 'restricted' | 'reauth_required' | 'revoked' | 'error' | null = null;
  disconnectMissing = false;
  disconnects = 0;

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input));
    this.requests.push({ pathname: url.pathname, method: init?.method ?? 'GET' });
    if (url.pathname === '/v1/accounts/connect') {
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'connecting',
        auth_id: this.authId,
        qr_code_data_url: 'data:image/png;base64,AAAA',
        qr_login_url: 'tg://login?token=fixture_token_1234567890',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (url.pathname === '/v1/accounts/connect/active') {
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'connecting',
        auth_id: this.activeAuthId,
        qr_code_data_url: 'data:image/png;base64,AAAA',
        qr_login_url: 'tg://login?token=fixture_token_1234567890',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (url.pathname === '/v1/accounts/connect/status') {
      if (this.terminalStatus) {
        return Response.json({
          schema: 'gptbot.lead-radar.telegram-account-service.v1',
          status: this.terminalStatus,
          auth_id: this.authId,
          reason_code: 'fixture_terminal_auth',
        });
      }
      if (!this.connected) {
        return Response.json({
          schema: 'gptbot.lead-radar.telegram-account-service.v1',
          status: 'connecting',
          auth_id: this.authId,
          qr_code_data_url: 'data:image/png;base64,AAAA',
          qr_login_url: 'tg://login?token=fixture_token_1234567890',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'connected',
        auth_id: this.authId,
        account_ref: this.accountRef,
        masked_label: 'Рабочий аккаунт',
        connected_at: new Date().toISOString(),
      });
    }
    if (url.pathname === '/v1/accounts/disconnect') {
      this.disconnects += 1;
      if (this.disconnectMissing) return new Response(null, { status: 404 });
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }
}

async function campaignEnv(
  service?: TelegramAccountServiceFixture,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const orgId = await ownerOrgId(OWNER_EMAIL);
  return {
    LEAD_RADAR_ADMISSION_ENABLED: 'true',
    LEAD_RADAR_PROCESSING_ENABLED: 'true',
    LEAD_RADAR_CONTACT_ENABLED: 'false',
    LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'false',
    LEAD_RADAR_ALLOWED_ORGS: orgId,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: CAMPAIGN_DATA_KEY,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '30',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '120',
    ...(service ? { LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: service } : {}),
    ...overrides,
  };
}

async function seedCorporateLead(db: SqliteD1): Promise<{ searchId: string; leadId: string }> {
  const now = new Date().toISOString();
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const store = new LeadRadarStore(db.asD1());
  const searchId = await store.createSearch(orgId, {
    niche: 'Стоматологии', city: 'Ташкент', country: 'UZ',
    offer: 'AI-бот', desiredCount: 10, telegramRequired: true, languages: ['ru', 'uz'],
  }, now);
  const leadId = await store.insertLead(orgId, searchId, {
    canonicalKey: 'domain:campaign-clinic.example.invalid',
    name: 'Клиника Альфа', category: 'Стоматология', city: 'Ташкент', country: 'UZ',
    address: 'Ташкент', website: 'https://campaign-clinic.example.invalid',
    phone: null, genericEmail: null, telegramUrl: 'https://t.me/campaign_clinic',
    telegramContact: {
      url: 'https://t.me/campaign_clinic', username: 'campaign_clinic', type: 'business',
      confidence: 0.98, reason: 'synthetic exact corporate fixture',
      evidenceIds: ['ev-campaign-corporate'], verifiedAt: now, messageable: false,
    },
    decisionMakers: [], score: 64, confidence: 0.9, priority: 'P2',
    lifecycle: 'new', suppressed: false, scoreComponents: [], signals: [],
    evidence: [{
      id: 'ev-campaign-corporate', fieldPath: 'web.telegram.business',
      value: '@campaign_clinic',
      sourceUrl: 'https://campaign-clinic.example.invalid/contact',
      sourceType: 'company_website', observedAt: now, confidence: 0.98,
      classification: 'fact',
    }],
    enrichmentStatus: 'enriched', enrichmentReason: 'enriched', enrichmentAttempts: 1,
    discoveredAt: now, lastVerifiedAt: now,
  });
  assert.ok(leadId);
  return { searchId, leadId };
}

async function seedConnectedAccount(db: SqliteD1): Promise<string> {
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const pending = await createTelegramUserAccountPending({
    db: db.asD1(), dataKey: CAMPAIGN_DATA_KEY, orgId,
    authRequestReference: 'auth_seed_1234567890',
    idempotencyKey: 'account-seed-idempotency-0001',
  });
  const connected = await completeTelegramUserAccountConnection({
    db: db.asD1(), dataKey: CAMPAIGN_DATA_KEY, orgId,
    accountId: pending.account.id,
    gatewayAccountRef: 'account_seed_1234567890',
    expectedVersion: pending.account.stateVersion,
    maskedLabel: 'Рабочий аккаунт',
  });
  return connected.id;
}

test('private account control timeout aborts the binding and maps to gateway unavailable', async (t) => {
  assert.ok(
    TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS < TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS,
  );
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null = null;
  const pending = beginTelegramAccountConnection({
    service: abortAwareNeverResolvingService((value) => { signal = value; }),
    orgId: 'org_timeout_control',
    operationId: 'timeout_control_0001',
  });
  t.mock.timers.tick(TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS);
  await assert.rejects(
    pending,
    (error) => error instanceof TelegramAccountServiceError
      && error.code === 'telegram_campaign_gateway_unavailable',
  );
  assert.equal(signal?.aborted, true);
});

test('private campaign send timeout aborts the binding and is provider-ambiguous', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null = null;
  const sender = new PrivateTelegramCampaignSender(
    abortAwareNeverResolvingService((value) => { signal = value; }),
  );
  const pending = sender.send({
    accountId: 'lrtgua_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    gatewayAccountRef: 'gateway_account_timeout_0001',
    username: 'TimeoutClinic',
    text: 'Bounded message',
    randomId: 'lrtgce_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  t.mock.timers.tick(TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS);
  assert.deepEqual(await pending, { kind: 'ambiguous' });
  assert.equal(signal?.aborted, true);
});

test('account connect fails before D1 mutation when the private service binding is absent', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const response = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token: await platformToken('platform_owner'),
      params: { path: 'telegram-account/connect' },
      headers: { 'Idempotency-Key': 'account-connect-missing-binding-0001' },
      body: {}, env: await campaignEnv(),
    },
  );
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'telegram_campaign_gateway_unavailable');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 0);
});

test('QR connect, tenant-scoped poll and disconnect use only the private binding', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  const token = await platformToken('platform_owner');
  const ownerOrg = await ownerOrgId(OWNER_EMAIL);
  const otherEmail = 'other-owner@example.invalid';
  const otherOrg = await ownerOrgId(otherEmail);
  const env = await campaignEnv(service, {
    LEAD_RADAR_ALLOWED_ORGS: `${ownerOrg},${otherOrg}`,
  });
  const connect = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-private-binding-0001' }, body: {},
    },
  );
  assert.equal(connect.status, 201);
  assert.equal(connect.body.status, 'connecting');
  assert.equal((connect.body.qr as Record<string, unknown>).authId, service.authId);
  assert.equal(
    (connect.body.qr as Record<string, unknown>).qrLoginUrl,
    'tg://login?token=fixture_token_1234567890',
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 1);
  const stored = db.sqlite.prepare(`SELECT auth_request_digest, gateway_account_ref
    FROM lead_radar_tg_user_accounts`).get() as {
      auth_request_digest: string; gateway_account_ref: string | null;
    };
  assert.match(stored.auth_request_digest, /^[0-9a-f]{64}$/u);
  assert.equal(stored.auth_request_digest.includes(service.authId), false);
  assert.equal(stored.gateway_account_ref, null);

  const replay = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-private-binding-0001' }, body: {},
    },
  );
  assert.equal(replay.status, 200);
  assert.equal((replay.body.qr as Record<string, unknown>).authId, service.authId);
  const pendingWithNewKey = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-private-binding-0002' }, body: {},
    },
  );
  assert.equal(pendingWithNewKey.status, 200);
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect').length,
    1,
  );

  const recoveredAfterReload = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(recoveredAfterReload.status, 200);
  assert.equal(recoveredAfterReload.body.status, 'connecting');
  assert.equal(
    (recoveredAfterReload.body.qr as Record<string, unknown>).authId,
    service.authId,
  );
  assert.equal(
    service.requests.filter((item) => item.pathname.endsWith('/active')).length,
    3,
  );

  service.activeAuthId = 'auth_mismatch_1234567890';
  const mismatchedRecovery = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(mismatchedRecovery.status, 409);
  assert.equal(mismatchedRecovery.body.error, 'telegram_campaign_gateway_conflict');
  service.activeAuthId = service.authId;

  const crossTenant = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    {
      token: await platformToken('platform_owner', otherEmail),
      params: { path: `telegram-account/connect/${service.authId}` }, env,
    },
  );
  assert.equal(crossTenant.status, 404);
  assert.equal(service.requests.filter((item) => item.pathname.endsWith('/status')).length, 0);

  service.connected = true;
  const poll = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    { token, params: { path: `telegram-account/connect/${service.authId}` }, env },
  );
  assert.equal(poll.status, 200);
  assert.equal(poll.body.status, 'connected');
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_user_accounts
    WHERE org_id = ?`, ownerOrg), 'connected');

  const connectedReconnect = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-after-connected-0001' }, body: {},
    },
  );
  assert.equal(connectedReconnect.status, 409);
  assert.equal(connectedReconnect.body.error, 'telegram_campaign_account_exists');
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect').length,
    1,
  );

  const disconnected = await callRoute(
    leadRadarRoute.onRequestDelete,
    db,
    '/api/admin/lead-radar/telegram-account',
    {
      method: 'DELETE', token, params: { path: 'telegram-account' }, env,
      headers: { 'Idempotency-Key': 'account-disconnect-private-0001' },
    },
  );
  assert.equal(disconnected.status, 200);
  assert.equal(disconnected.body.status, 'revoked');
  assert.equal(service.disconnects, 1);
  const revoked = db.sqlite.prepare(`SELECT status, gateway_account_ref
    FROM lead_radar_tg_user_accounts WHERE org_id = ?`).get(ownerOrg) as {
      status: string; gateway_account_ref: string | null;
    };
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.gateway_account_ref, null);
});

test('terminal QR poll leaves no pending challenge for reload recovery', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  const token = await platformToken('platform_owner');
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const env = await campaignEnv(service);
  const connected = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-terminal-poll-0001' }, body: {},
    },
  );
  assert.equal(connected.status, 201);
  service.terminalStatus = 'reauth_required';
  const terminal = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    { token, params: { path: `telegram-account/connect/${service.authId}` }, env },
  );
  assert.equal(terminal.status, 200);
  assert.equal(terminal.body.status, 'reauth_required');
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_user_accounts WHERE org_id = ?',
    orgId,
  ), 'error');
  const activeCallsBeforeReload = service.requests
    .filter((item) => item.pathname.endsWith('/active')).length;
  const reloaded = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(reloaded.status, 200);
  assert.equal(reloaded.body.status, 'error');
  assert.equal(
    service.requests.filter((item) => item.pathname.endsWith('/active')).length,
    activeCallsBeforeReload,
  );
  service.terminalStatus = null;
  service.disconnectMissing = true;
  const reconnected = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-reconnect-after-terminal-0001' }, body: {},
    },
  );
  assert.equal(reconnected.status, 201);
  assert.equal(reconnected.body.status, 'connecting');
  assert.equal(service.disconnects, 1);
  assert.equal(db.value(
    `SELECT COUNT(*) FROM lead_radar_tg_user_accounts
      WHERE org_id = ? AND status = 'pending'`,
    orgId,
  ), 1);
});

test('campaign API freezes exact payload, queues only an opaque envelope, and keeps pause/stop available', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const { searchId, leadId } = await seedCorporateLead(db);
  const accountId = await seedConnectedAccount(db);
  const service = new TelegramAccountServiceFixture();
  const queue = new MemoryQueue();
  const token = await platformToken('platform_owner');
  const template = 'Здравствуйте, {company_name}! Обсудим автоматизацию?';
  const baseEnv = await campaignEnv(service, { AUTOMATION_QUEUE: queue });
  const eligibilityExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
  const eligibility = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns/eligibility',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns/eligibility' },
      headers: { 'Idempotency-Key': 'campaign-eligibility-api-0001' },
      body: {
        searchId,
        leadId,
        contactBasis: 'documented_consent',
        evidenceReference: 'crm-consent-clinic-alpha-2026',
        expiresAt: eligibilityExpiresAt,
      },
      env: baseEnv,
    },
  );
  assert.equal(eligibility.status, 201);
  assert.equal(eligibility.body.companyId, leadId);
  assert.equal(eligibility.body.reviewer, 'owner_verified');
  const prepareInput = {
    accountId, searchId, leadIds: [leadId], template,
    contactBasis: 'documented_consent',
  };
  const prepared = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns/prepare',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns/prepare' },
      headers: { 'Idempotency-Key': 'campaign-prepare-api-0001' },
      body: prepareInput, env: baseEnv,
    },
  );
  assert.equal(prepared.status, 201);
  assert.deepEqual(prepared.body.summary, {
    selected: 1, automatic: 1, manual: 0, excluded: 0,
  });
  assert.deepEqual(
    ((prepared.body.recipients as Array<Record<string, unknown>>)[0]?.authorization),
    {
      basis: 'documented_consent',
      evidenceVersion: 'campaign-contact-eligibility-v1',
      verifiedAt: eligibility.body.verifiedAt,
      expiresAt: eligibilityExpiresAt,
      reviewer: 'owner_verified',
    },
  );
  assert.equal(
    ((prepared.body.previews as Array<Record<string, unknown>>)[0]?.text),
    'Здравствуйте, Клиника Альфа! Обсудим автоматизацию?',
  );
  const replay = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns/prepare',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns/prepare' },
      headers: { 'Idempotency-Key': 'campaign-prepare-api-0001' },
      body: prepareInput, env: baseEnv,
    },
  );
  assert.equal(replay.status, 201);
  assert.equal(replay.body.approvalToken, prepared.body.approvalToken);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals'), 1);

  const created = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns' },
      headers: { 'Idempotency-Key': 'campaign-create-api-0001' }, env: baseEnv,
      body: {
        accountId, searchId, leadIds: [leadId], template,
        contactBasis: 'documented_consent',
        approvalToken: prepared.body.approvalToken,
        selectionDigest: prepared.body.selectionDigest,
        contentDigest: prepared.body.contentDigest,
      },
    },
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'approved');
  const campaignId = String(created.body.id);
  const recovered = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-campaigns?searchId=${encodeURIComponent(searchId)}`,
    { token, params: { path: 'telegram-campaigns' }, env: baseEnv },
  );
  assert.equal(recovered.status, 200);
  assert.equal((recovered.body.active as Record<string, unknown>).id, campaignId);
  assert.equal((recovered.body.latest as Record<string, unknown>).id, campaignId);
  const encrypted = db.sqlite.prepare(`SELECT template_ciphertext
    FROM lead_radar_tg_campaigns WHERE id = ?`).get(campaignId) as {
      template_ciphertext: string;
    };
  assert.notEqual(encrypted.template_ciphertext, template);
  assert.equal(JSON.stringify(queue.messages).includes(template), false);

  const blockedStart = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/start`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/start` },
      headers: { 'Idempotency-Key': 'campaign-start-blocked-api-0001' },
      body: {}, env: baseEnv,
    },
  );
  assert.equal(blockedStart.status, 409);
  assert.equal(blockedStart.body.error, 'lead_radar_campaign_autosend_paused');
  assert.equal(queue.messages.length, 0);

  const running = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/start`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/start` },
      headers: { 'Idempotency-Key': 'campaign-start-enabled-api-0001' },
      body: {},
      env: { ...baseEnv, LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true' },
    },
  );
  assert.equal(running.status, 200);
  assert.equal(running.body.status, 'running');
  assert.equal(queue.messages.length, 1);
  assert.deepEqual(Object.keys(queue.messages[0] as Record<string, unknown>).sort(), [
    'campaign_id', 'org_id', 'schema', 'state_version',
  ]);
  assert.equal(JSON.stringify(queue.messages[0]).includes('campaign_clinic'), false);
  assert.equal(JSON.stringify(queue.messages[0]).includes(template), false);

  const paused = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/pause`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/pause` },
      headers: { 'Idempotency-Key': 'campaign-pause-api-0001' },
      body: {}, env: baseEnv,
    },
  );
  assert.equal(paused.status, 200);
  assert.equal(paused.body.status, 'paused');

  const stopped = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/stop`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/stop` },
      headers: { 'Idempotency-Key': 'campaign-stop-api-0001' },
      body: {}, env: baseEnv,
    },
  );
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.status, 'stopped');
});

test('research mode keeps corporate Telegram, redacts people, uses company total, and ranks business first', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const now = new Date().toISOString();
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const store = new LeadRadarStore(db.asD1());
  const searchId = await store.createSearch(orgId, {
    niche: 'Клиники', city: 'Ташкент', country: 'UZ', offer: 'AI-бот',
    desiredCount: 10, telegramRequired: true, languages: ['ru', 'uz'],
  }, now);
  const corporateId = await store.insertLead(orgId, searchId, {
    canonicalKey: 'domain:research-business.example.invalid',
    name: 'Бизнес Telegram', category: 'Клиника', city: 'Ташкент', country: 'UZ',
    address: null, website: 'https://research-business.example.invalid',
    phone: null, genericEmail: null, telegramUrl: 'https://t.me/research_business',
    telegramContact: {
      url: 'https://t.me/research_business', username: 'research_business', type: 'business',
      confidence: 0.95, reason: 'synthetic corporate fixture', evidenceIds: ['ev-business'],
      verifiedAt: now, messageable: false,
    },
    decisionMakers: [], score: 30, confidence: 0.7, priority: 'P3',
    lifecycle: 'new', suppressed: false, scoreComponents: [], signals: [],
    evidence: [{
      id: 'ev-business', fieldPath: 'web.telegram.business', value: '@research_business',
      sourceUrl: 'https://research-business.example.invalid/contact',
      sourceType: 'company_website', observedAt: now, confidence: 0.95,
      classification: 'fact',
    }],
    enrichmentStatus: 'enriched', enrichmentReason: 'enriched', enrichmentAttempts: 1,
    discoveredAt: now, lastVerifiedAt: now,
  });
  const personalId = await store.insertLead(orgId, searchId, {
    canonicalKey: 'domain:research-person.example.invalid',
    name: 'Личный Telegram', category: 'Клиника', city: 'Ташкент', country: 'UZ',
    address: null, website: 'https://research-person.example.invalid',
    phone: null, genericEmail: null, telegramUrl: 'https://t.me/research_director',
    telegramContact: {
      url: 'https://t.me/research_director', username: 'research_director', type: 'human',
      confidence: 0.99, reason: 'synthetic human fixture', evidenceIds: ['ev-person'],
      verifiedAt: now, messageable: false,
    },
    decisionMakers: [{
      id: 'dm-research', name: 'Fixture Director', role: 'директор',
      telegramUrl: 'https://t.me/research_director', telegramUsername: 'research_director',
      contactType: 'human', confidence: 0.99, evidenceIds: ['ev-person'],
      sourceUrl: 'https://research-person.example.invalid/team', evidence: 'synthetic',
      verifiedAt: now, sourceClaim: 'official_site_proximity',
      contactReviewStatus: 'approved', contactReviewedAt: now,
    }],
    score: 95, confidence: 0.99, priority: 'P1', lifecycle: 'new', suppressed: false,
    scoreComponents: [], signals: [],
    evidence: [{
      id: 'ev-person', fieldPath: 'web.telegram.human', value: '@research_director',
      sourceUrl: 'https://research-person.example.invalid/team',
      sourceType: 'company_website', observedAt: now, confidence: 0.99,
      classification: 'fact',
    }],
    enrichmentStatus: 'enriched', enrichmentReason: 'enriched', enrichmentAttempts: 1,
    discoveredAt: now, lastVerifiedAt: now,
  });
  assert.ok(corporateId && personalId);
  db.sqlite.prepare(`UPDATE lead_radar_searches SET
    candidate_count = 2, verified_count = 2, p1_count = 1, p3_count = 1,
    telegram_count = 2, raw_discovered_count = 2, processed_count = 2,
    website_count = 2, enriched_count = 2, decision_maker_count = 1,
    company_telegram_count = 1, personal_telegram_count = 1
    WHERE org_id = ? AND id = ?`).run(orgId, searchId);

  const env = await campaignEnv(undefined, {
    LEAD_RADAR_CONTACT_ENABLED: 'false',
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'false',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'false',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'false',
  });
  const token = await platformToken('platform_owner');
  const result = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/searches/${searchId}`,
    { token, params: { path: `searches/${searchId}` }, env },
  );
  assert.equal(result.status, 200);
  assert.equal((result.body.capabilities as Record<string, unknown>).telegramDiscoveryEnabled, true);
  const search = result.body.search as Record<string, unknown>;
  assert.equal(search.telegramCount, 1);
  assert.equal((search.funnel as Record<string, unknown>).companyTelegramCount, 1);
  assert.equal((search.funnel as Record<string, unknown>).personalTelegramCount, 0);
  const leads = result.body.leads as Array<Record<string, unknown>>;
  assert.equal(leads[0]?.id, corporateId);
  assert.equal((leads[0]?.telegramContact as Record<string, unknown>)?.type, 'business');
  const personal = leads.find((lead) => lead.id === personalId);
  assert.equal(personal?.telegramContact, null);
  assert.equal(personal?.telegramUrl, null);
  assert.deepEqual(personal?.decisionMakers, []);

  const overview = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar',
    { token, env },
  );
  assert.equal(overview.status, 200);
  assert.equal((overview.body.totals as Record<string, unknown>).telegram, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import worker, { settleLeadRadarRetryWait } from '../workers/automation-worker';
import {
  authorizeTelegramCampaignContact,
  completeTelegramUserAccountConnection,
  createApprovedTelegramCampaign,
  createTelegramUserAccountPending,
  prepareTelegramCampaign,
  stageTelegramUserAccountConnection,
  transitionTelegramCampaign,
  type TelegramCampaignQueueMessage,
} from '../functions/platform/lead-radar/telegram-campaign';
import { checkCorporateTelegramContact } from '../functions/platform/lead-radar/contact-resolution';
import { SqliteD1 } from './helpers/sqlite-d1';
import { leadRadarTelegramAccountFinalizationQueueMessage } from '../src/shared/lead-radar-telegram-account-finalization';

const ROOT = path.resolve(import.meta.dirname, '..');
const CAMPAIGN_MIGRATIONS = [
  '0036_lead_radar.sql',
  '0041_lead_radar_search_leases.sql',
  '0042_lead_radar_decision_makers.sql',
  '0043_lead_radar_async_funnel.sql',
  '0044_lead_radar_telegram_business.sql',
  '0045_lead_radar_telegram_campaigns.sql',
  '0046_lead_radar_telegram_campaign_safety.sql',
  '0047_lead_radar_telegram_campaign_media.sql',
  '0048_lead_radar_telegram_media_quota.sql',
  '0050_lead_radar_contact_discovery.sql',
  '0054_lead_radar_candidate_pool_resume.sql',
] as const;
const CAMPAIGN_ORG = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CAMPAIGN_DATA_KEY = Buffer.alloc(32, 17).toString('base64url');
const TELEGRAM_INTERNAL_SERVICE_TOKEN = Buffer.alloc(32, 19).toString('base64url');

interface RecordedMessage {
  body: unknown;
  acknowledgements: number;
  retries: number[];
}

function queueMessage(body: unknown): Message<unknown> & RecordedMessage {
  const state: RecordedMessage = { body, acknowledgements: 0, retries: [] };
  return {
    ...state,
    id: crypto.randomUUID(),
    timestamp: new Date('2026-08-25T10:00:00.000Z'),
    attempts: 1,
    ack() { state.acknowledgements += 1; },
    retry(options?: { delaySeconds?: number }) { state.retries.push(options?.delaySeconds ?? 0); },
    get acknowledgements() { return state.acknowledgements; },
    get retries() { return state.retries; },
  } as Message<unknown> & RecordedMessage;
}

class FakeStatement {
  constructor(
    readonly sql: string,
    private readonly database: FakeD1,
  ) {}

  bind(): FakeStatement { return this; }

  async first<T>(): Promise<T | null> {
    if (this.database.telegramSchema && this.sql.includes('lead_radar_tg_connect_nonces')) {
      return { count: 6 } as T;
    }
    if (this.sql.includes('SELECT value_json FROM system_settings')) {
      return JSON.parse(JSON.stringify({
        value_json: JSON.stringify({
          mode: 'disabled', active_days: [], updated_at: null, updated_by: null,
        }),
      })) as T;
    }
    return null;
  }

  async all<T>(): Promise<D1Result<T>> {
    if (this.database.personalSchema && this.sql.includes("pragma_table_info('lead_radar_companies')")) {
      return {
        success: true,
        results: ['decision_makers_json', 'id', 'org_id', 'search_id', 'telegram_contact_json', 'telegram_url', 'updated_at']
          .map((name) => ({ name })) as T[],
        meta: { changes: 0 },
      } as unknown as D1Result<T>;
    }
    if (this.database.personalSchema && this.sql.includes("pragma_table_info('lead_radar_evidence')")) {
      return {
        success: true,
        results: ['company_id', 'field_path', 'id', 'org_id'].map((name) => ({ name })) as T[],
        meta: { changes: 0 },
      } as unknown as D1Result<T>;
    }
    if (this.database.failLeadSchemaAudit && (
      this.sql.includes('sqlite_master') || this.sql.includes('pragma_') || this.sql.includes('PRAGMA ')
    )) throw new Error('lead schema audit unavailable');
    return { success: true, results: [], meta: { changes: 0 } } as unknown as D1Result<T>;
  }

  async run<T>(): Promise<D1Result<T>> {
    return { success: true, results: [], meta: { changes: 0 } } as unknown as D1Result<T>;
  }
}

class FakeD1 {
  readonly sql: string[] = [];

  constructor(
    readonly personalSchema = false,
    readonly failLeadSchemaAudit = false,
    readonly telegramSchema = false,
  ) {}

  prepare(sql: string): FakeStatement {
    this.sql.push(sql);
    return new FakeStatement(sql, this);
  }

  async batch(): Promise<D1Result<unknown>[]> { return []; }

  asD1(): D1Database { return this as unknown as D1Database; }
}

function fakeQueue(): Queue<unknown> & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    async send(body: unknown) { sent.push(body); },
    async sendBatch(batch: Iterable<MessageSendRequest<unknown>>) {
      for (const item of batch) sent.push(item.body);
    },
  } as unknown as Queue<unknown> & { sent: unknown[] };
}

function environment(
  db: { asD1(): D1Database },
  overrides: Record<string, unknown> = {},
): Parameters<typeof worker.queue>[1] {
  return {
    GPTBOT_DRAFTS_DB: db.asD1(),
    AUTOMATION_QUEUE: fakeQueue(),
    AUTOMATION_DLQ: fakeQueue(),
    LEAD_RADAR_ADMISSION_ENABLED: 'false',
    LEAD_RADAR_PROCESSING_ENABLED: 'false',
    LEAD_RADAR_CONTACT_ENABLED: 'false',
    LEAD_RADAR_ALLOWED_ORGS: '',
    LEAD_RADAR_PERSONAL_RETENTION_DAYS: '30',
    LEAD_RADAR_MAX_DISPATCH_PER_TICK: '5',
    FIRST_PARTY_AUTOMATION_ENABLED: 'false',
    ...overrides,
  } as unknown as Parameters<typeof worker.queue>[1];
}

function campaignDatabase(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'archived')),
    default_locale TEXT NOT NULL CHECK (default_locale IN ('ru', 'uz')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  const now = new Date(Date.now() - 60_000).toISOString();
  db.sqlite.prepare(`INSERT INTO organizations (
    id, name, slug, status, default_locale, created_at, updated_at
  ) VALUES (?, 'Worker fixture', 'worker-fixture', 'active', 'ru', ?, ?)`)
    .run(CAMPAIGN_ORG, now, now);
  for (const filename of CAMPAIGN_MIGRATIONS) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', filename), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(filename);
  }
  return db;
}

async function runningCampaignFixture(): Promise<{
  db: SqliteD1;
  envelope: TelegramCampaignQueueMessage;
}> {
  const db = campaignDatabase();
  const now = new Date(Date.now() - 60_000);
  const companyId = 'company_worker_campaign';
  const searchId = 'search_worker_campaign';
  const evidenceId = 'evidence_worker_campaign';
  const bindingEvidenceId = 'evidence_worker_campaign_binding';
  const username = 'WorkerCampaignClinic';
  db.sqlite.prepare(`INSERT INTO lead_radar_searches (
    id, org_id, input_json, status, created_at
  ) VALUES (?, ?, '{}', 'ready', ?)`)
    .run(searchId, CAMPAIGN_ORG, now.toISOString());
  db.sqlite.prepare(`INSERT INTO lead_radar_companies (
    id, org_id, search_id, canonical_key, name, category, city, country,
    score, confidence, priority, score_components_json, signals_json,
    discovered_at, last_verified_at, updated_at, website,
    telegram_contact_json, lifecycle, suppressed
  ) VALUES (?, ?, ?, ?, 'Worker Campaign Clinic', 'clinic', 'Tashkent', 'UZ',
    90, 0.95, 'P1', '[]', '[]', ?, ?, ?, 'https://worker-campaign.example/',
    ?, 'new', 0)`)
    .run(
      companyId,
      CAMPAIGN_ORG,
      searchId,
      `worker:${companyId}`,
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
      JSON.stringify({
        url: `https://t.me/${username}`,
        username,
        type: 'business',
        confidence: 0.95,
        reason: 'verified fixture',
        evidenceIds: [evidenceId],
        verifiedAt: now.toISOString(),
        messageable: false,
      }),
    );
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence (
    id, org_id, company_id, field_path, value, source_url, source_type,
    observed_at, confidence, classification
  ) VALUES (?, ?, ?, 'web.telegram.business', ?,
    'https://worker-campaign.example/contact', 'company_website', ?, 0.95, 'fact')`)
    .run(
      evidenceId,
      CAMPAIGN_ORG,
      companyId,
      `https://t.me/${username}`,
      now.toISOString(),
    );
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence (
    id, org_id, company_id, field_path, value, source_url, source_type,
    observed_at, confidence, classification
  ) VALUES (?, ?, ?, 'web.website', 'https://worker-campaign.example/',
    'https://worker-campaign.example/contact', 'company_website', ?, 0.95, 'fact')`)
    .run(
      bindingEvidenceId,
      CAMPAIGN_ORG,
      companyId,
      now.toISOString(),
    );
  const pending = await createTelegramUserAccountPending({
    db: db.asD1(),
    dataKey: CAMPAIGN_DATA_KEY,
    orgId: CAMPAIGN_ORG,
    authRequestReference: 'gateway_auth_worker_campaign_0001',
    idempotencyKey: 'worker_account_connect_0001',
    now,
  });
  await stageTelegramUserAccountConnection({
    db: db.asD1(), dataKey: CAMPAIGN_DATA_KEY, orgId: CAMPAIGN_ORG,
    accountId: pending.account.id, gatewayAccountRef: 'gateway_account_worker_campaign_0001',
    expectedVersion: pending.account.stateVersion, maskedLabel: 'Подключённый аккаунт',
    providerConnectedAt: now.toISOString(), now,
  });
  const account = await completeTelegramUserAccountConnection({
    db: db.asD1(),
    dataKey: CAMPAIGN_DATA_KEY,
    orgId: CAMPAIGN_ORG,
    accountId: pending.account.id,
    gatewayAccountRef: 'gateway_account_worker_campaign_0001',
    expectedVersion: pending.account.stateVersion,
    now,
  });
  const bridgeResult = await checkCorporateTelegramContact({
    db: db.asD1(),
    orgId: CAMPAIGN_ORG,
    searchId,
    companyId,
    candidateKey: `telegram:https://t.me/${username.toLowerCase()}`,
    accountId: account.id,
    now: now.toISOString(),
    resolve: async () => ({
      status: 'resolved',
      username,
      reason: 'regular_user_resolved',
      retryAfterSeconds: null,
    }),
  });
  assert.equal(bridgeResult.status, 'resolved', JSON.stringify(bridgeResult));
  const template = 'Здравствуйте, {company_name}!';
  await authorizeTelegramCampaignContact({
    db: db.asD1(), dataKey: CAMPAIGN_DATA_KEY, orgId: CAMPAIGN_ORG,
    companyId, contactBasis: 'existing_relationship',
    evidenceReference: 'fixture-worker-existing-relationship',
    expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
    idempotencyKey: 'worker_campaign_authorization_0001', now,
  });
  const prepared = await prepareTelegramCampaign({
    db: db.asD1(),
    dataKey: CAMPAIGN_DATA_KEY,
    orgId: CAMPAIGN_ORG,
    accountId: account.id,
    searchId: 'search_worker_campaign',
    companyIds: [companyId],
    template,
    operatorId: 'owner@example.test',
    idempotencyKey: 'worker_campaign_prepare_0001',
    contactBasis: 'existing_relationship',
    minIntervalSeconds: 120,
    now,
  });
  const created = await createApprovedTelegramCampaign({
    db: db.asD1(),
    dataKey: CAMPAIGN_DATA_KEY,
    orgId: CAMPAIGN_ORG,
    accountId: account.id,
    searchId: 'search_worker_campaign',
    companyIds: [companyId],
    template,
    operatorId: 'owner@example.test',
    contactBasis: 'existing_relationship',
    approvalToken: prepared.approvalToken,
    expectedSelectionDigest: prepared.selectionDigest,
    expectedContentDigest: prepared.contentDigest,
    idempotencyKey: 'worker_campaign_create_0001',
    minIntervalSeconds: 120,
    now,
  });
  await transitionTelegramCampaign({
    db: db.asD1(),
    dataKey: CAMPAIGN_DATA_KEY,
    orgId: CAMPAIGN_ORG,
    campaignId: created.campaign.id,
    action: 'start',
    operatorId: 'owner@example.test',
    idempotencyKey: 'worker_campaign_start_0001',
    now,
  });
  return {
    db,
    envelope: {
      schema: 'gptbot.lead-radar.telegram-campaign.v1',
      campaign_id: created.campaign.id,
      org_id: CAMPAIGN_ORG,
      state_version: Number(db.value(
        'SELECT state_version FROM lead_radar_tg_campaigns WHERE org_id = ? AND id = ?',
        CAMPAIGN_ORG,
        created.campaign.id,
      )),
    },
  };
}

function privateTelegramService(options: { blockers?: string[] } = {}): {
  binding: Fetcher;
  calls: Array<Record<string, unknown>>;
  healthCalls: number;
} {
  const calls: Array<Record<string, unknown>> = [];
  let healthCalls = 0;
  return {
    calls,
    get healthCalls() { return healthCalls; },
    binding: {
      async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const headers = new Headers(init?.headers);
        if (headers.get('Authorization') !== `Bearer ${TELEGRAM_INTERNAL_SERVICE_TOKEN}`) {
          return Response.json({ error: 'unauthorized' }, { status: 401 });
        }
        if (new URL(String(input)).pathname === '/v1/health') {
          healthCalls += 1;
          const blockers = options.blockers ?? [];
          const configured = blockers.length === 0;
          return Response.json({
            schema: 'gptbot.lead-radar.telegram-account-service.v1',
            status: configured ? 'configured' : 'degraded',
            contract_version: 'v1',
            gateway_version: 'fixture-v1',
            auth_modes: ['qr', 'phone_code_password'],
            provider: 'local_bridge_telethon',
            tdlib_source_commit: 'not_applicable',
            session_storage: 'local_windows_dpapi',
            public_routes: true,
            bridge_public_origin: 'https://lead-radar-bridge.gptbot.uz',
            configured,
            blockers,
            routing_key_fingerprint: blockers.includes('gateway_account_keys_missing')
              ? null
              : 'a'.repeat(64),
          }, { status: configured ? 200 : 503 });
        }
        calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({
          schema: 'gptbot.lead-radar.telegram-account-service.v1',
          status: 'sent',
          provider_message_id: 'worker-provider-message-1',
        }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      },
    } as Fetcher,
  };
}

function privateTelegramFinalizationService(input: {
  authId: string;
  connectedAt: string;
}): {
  binding: Fetcher;
  paths: string[];
  finalizeCalls: number;
} {
  const paths: string[] = [];
  let finalizeCalls = 0;
  return {
    paths,
    get finalizeCalls() { return finalizeCalls; },
    binding: {
      async fetch(request: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const headers = new Headers(init?.headers);
        if (headers.get('Authorization') !== `Bearer ${TELEGRAM_INTERNAL_SERVICE_TOKEN}`) {
          return Response.json({ error: 'unauthorized' }, { status: 401 });
        }
        const path = new URL(String(request)).pathname;
        paths.push(path);
        if (path === '/v1/accounts/connect/state') {
          return Response.json({
            schema: 'gptbot.lead-radar.telegram-account-service.v1',
            status: 'connected',
            auth_id: input.authId,
            account_ref: 'lracct_' + 'A'.repeat(43),
            masked_label: '@w•••r',
            connected_at: input.connectedAt,
          });
        }
        if (path === '/v1/accounts/connect/finalize') {
          finalizeCalls += 1;
          return new Response(null, { status: finalizeCalls === 1 ? 202 : 204 });
        }
        return new Response('Not found', { status: 404 });
      },
    } as Fetcher,
  };
}

function batch(messages: Message<unknown>[]): MessageBatch<unknown> {
  return {
    queue: 'automation-queue',
    messages,
    ackAll() { for (const message of messages) message.ack(); },
    retryAll(options?: { delaySeconds?: number }) {
      for (const message of messages) message.retry(options);
    },
  } as MessageBatch<unknown>;
}

test('processing pause ACKs Lead Radar without touching D1 and preserves SEO retry behavior', async () => {
  const db = new FakeD1(false, true);
  const lead = queueMessage({ schema: 'gptbot.lead-radar.job.v1', job_id: `lrjob_${'1'.repeat(32)}` });
  const seo = queueMessage({ schema: 'gptbot.automation.job.v1', job_id: 'job-seo', job_type: 'seo_draft_generation' });

  await worker.queue(batch([lead, seo]), environment(db), {} as ExecutionContext);

  assert.equal(lead.acknowledgements, 1);
  assert.deepEqual(lead.retries, []);
  assert.deepEqual(db.sql, []);
  assert.equal(seo.acknowledgements, 0);
  assert.deepEqual(seo.retries, [300]);
});

test('connected Telegram auth finalizes through the server queue without UI polling', async (t) => {
  const db = campaignDatabase();
  t.after(() => db.sqlite.close());
  const connectedAt = new Date(Date.now() - 1_000).toISOString();
  const authId = `auth_${'f'.repeat(32)}`;
  const pending = await createTelegramUserAccountPending({
    db: db.asD1(),
    dataKey: CAMPAIGN_DATA_KEY,
    orgId: CAMPAIGN_ORG,
    authRequestReference: authId,
    idempotencyKey: 'worker_account_server_finalize_0001',
    now: new Date(Date.now() - 60_000),
  });
  const service = privateTelegramFinalizationService({ authId, connectedAt });
  const outgoing = fakeQueue();
  const envelope = leadRadarTelegramAccountFinalizationQueueMessage({
    orgId: CAMPAIGN_ORG,
    authId,
    notAfter: new Date(Date.now() + 8 * 60_000).toISOString(),
  });
  const first = queueMessage(envelope);
  const env = environment(db, {
    AUTOMATION_QUEUE: outgoing,
    LEAD_RADAR_ALLOWED_ORGS: CAMPAIGN_ORG,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: CAMPAIGN_DATA_KEY,
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: TELEGRAM_INTERNAL_SERVICE_TOKEN,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: service.binding,
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
  });

  await worker.queue(batch([first]), env, {} as ExecutionContext);

  assert.equal(first.acknowledgements, 1);
  assert.deepEqual(first.retries, []);
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_user_accounts WHERE org_id = ?',
    CAMPAIGN_ORG,
  ), 'pending');
  assert.equal(db.value(
    'SELECT COUNT(*) FROM lead_radar_tg_account_finalizations WHERE org_id = ?',
    CAMPAIGN_ORG,
  ), 1);
  assert.deepEqual(outgoing.sent, [{ ...envelope, attempt: 1 }]);

  const second = queueMessage(outgoing.sent[0]);
  await worker.queue(batch([second]), env, {} as ExecutionContext);

  assert.equal(second.acknowledgements, 1);
  assert.deepEqual(second.retries, []);
  assert.equal(service.finalizeCalls, 2);
  assert.deepEqual(service.paths, [
    '/v1/accounts/connect/state',
    '/v1/accounts/connect/finalize',
    '/v1/accounts/connect/state',
    '/v1/accounts/connect/finalize',
  ]);
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_user_accounts WHERE id = ?',
    pending.account.id,
  ), 'connected');
  assert.equal(db.value(
    'SELECT COUNT(*) FROM lead_radar_tg_account_finalizations WHERE org_id = ?',
    CAMPAIGN_ORG,
  ), 0);
});

test('malformed Telegram account finalization envelope ACKs before D1 or provider access', async () => {
  const db = new FakeD1(false, true);
  const malformed = queueMessage({
    schema: 'gptbot.lead-radar.telegram-account-finalization.v1',
    org_id: CAMPAIGN_ORG,
    auth_id: 'invalid',
    attempt: 0,
    not_after: new Date(Date.now() + 60_000).toISOString(),
  });

  await worker.queue(batch([malformed]), environment(db), {} as ExecutionContext);

  assert.equal(malformed.acknowledgements, 1);
  assert.deepEqual(malformed.retries, []);
  assert.deepEqual(db.sql, []);
});

test('missing private Telegram binding ACKs campaign before schema access or recipient claim', async () => {
  const db = new FakeD1(false, true);
  const campaign = queueMessage({
    schema: 'gptbot.lead-radar.telegram-campaign.v1',
    campaign_id: `lrtgc_${'1'.repeat(32)}`,
    org_id: `owner_${'a'.repeat(24)}`,
    state_version: 1,
  });

  await worker.queue(batch([campaign]), environment(db, {
    LEAD_RADAR_ALLOWED_ORGS: `owner_${'a'.repeat(24)}`,
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: Buffer.alloc(32, 7).toString('base64url'),
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '30',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '120',
  }), {} as ExecutionContext);

  assert.equal(campaign.acknowledgements, 1);
  assert.deepEqual(campaign.retries, []);
  assert.deepEqual(db.sql, []);
});

test('durable business retries use the exact Queue delay while lease conflicts are ACKed', () => {
  const scheduled = queueMessage({ schema: 'gptbot.lead-radar.job.v1', job_id: `lrjob_${'3'.repeat(32)}` });
  settleLeadRadarRetryWait(scheduled, {
    outcome: 'retry_wait', delaySeconds: 45, retryDelivery: true,
  });
  assert.equal(scheduled.acknowledgements, 0);
  assert.deepEqual(scheduled.retries, [45]);

  const duplicate = queueMessage({ schema: 'gptbot.lead-radar.job.v1', job_id: `lrjob_${'4'.repeat(32)}` });
  settleLeadRadarRetryWait(duplicate, { outcome: 'retry_wait', delaySeconds: 30 });
  assert.equal(duplicate.acknowledgements, 1);
  assert.deepEqual(duplicate.retries, []);
});

test('a Lead Radar schema fault is isolated and cannot abort the next SEO message', async () => {
  const db = new FakeD1(false, true);
  const lead = queueMessage({ schema: 'gptbot.lead-radar.job.v1', job_id: `lrjob_${'2'.repeat(32)}` });
  const seo = queueMessage({ schema: 'gptbot.automation.job.v1', job_id: 'job-seo', job_type: 'seo_draft_generation' });

  await worker.queue(batch([lead, seo]), environment(db, {
    LEAD_RADAR_PROCESSING_ENABLED: 'true',
  }), {} as ExecutionContext);

  assert.equal(lead.acknowledgements, 1);
  assert.equal(seo.acknowledgements, 0);
  assert.deepEqual(seo.retries, [300]);
  assert.ok(db.sql.length > 0);
});

test('personal-data retention runs even while Lead Radar processing is paused', async () => {
  const db = new FakeD1(true, false);
  await worker.scheduled(
    {} as ScheduledController,
    environment(db),
    {} as ExecutionContext,
  );

  assert.ok(db.sql.some((sql) => sql.includes("pragma_table_info('lead_radar_companies')")));
  assert.ok(db.sql.some((sql) => sql.includes('FROM lead_radar_companies')));
  assert.equal(db.sql.some((sql) => sql.includes('FROM lead_radar_jobs')), false);
});

test('Telegram transport reconciliation and retention run while every Lead Radar flag is paused', async () => {
  const db = new FakeD1(false, false, true);
  await worker.scheduled(
    {} as ScheduledController,
    environment(db),
    {} as ExecutionContext,
  );

  assert.ok(db.sql.some((sql) => sql.includes('lead_radar_tg_connect_nonces')));
  assert.ok(db.sql.some((sql) => sql.includes("status = 'ambiguous'")));
  assert.ok(db.sql.some((sql) => sql.includes('DELETE FROM lead_radar_tg_company_chats')));
  assert.equal(db.sql.some((sql) => sql.includes('FROM lead_radar_jobs')), false);
});

test('scheduled Lead Radar failure does not stop the existing automation scheduler', async () => {
  const db = new FakeD1(false, true);
  await worker.scheduled(
    {} as ScheduledController,
    environment(db, {
      LEAD_RADAR_PROCESSING_ENABLED: 'true',
      FIRST_PARTY_AUTOMATION_ENABLED: 'true',
    }),
    {} as ExecutionContext,
  );

  assert.ok(db.sql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS automation_jobs')));
  assert.ok(db.sql.some((sql) => sql.includes('SELECT * FROM automation_jobs')));
});

test('disabled Telegram campaign autosend ACKs without a claim or provider effect', async (t) => {
  const { db, envelope } = await runningCampaignFixture();
  t.after(() => db.sqlite.close());
  const service = privateTelegramService();
  const message = queueMessage(envelope);

  await worker.queue(batch([message]), environment(db, {
    LEAD_RADAR_ALLOWED_ORGS: CAMPAIGN_ORG,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: CAMPAIGN_DATA_KEY,
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: TELEGRAM_INTERNAL_SERVICE_TOKEN,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: service.binding,
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'false',
  }), {} as ExecutionContext);

  assert.equal(message.acknowledgements, 1);
  assert.deepEqual(message.retries, []);
  assert.equal(service.calls.length, 0);
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_recipients WHERE campaign_id = ?',
    envelope.campaign_id,
  ), 'pending');
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_effects WHERE campaign_id = ?',
    envelope.campaign_id,
  ), 'reserved');
  assert.equal(db.value(
    'SELECT dispatch_lease_digest FROM lead_radar_tg_user_accounts WHERE org_id = ?',
    CAMPAIGN_ORG,
  ), null);
  assert.equal(db.value(
    'SELECT daily_reserved_count FROM lead_radar_tg_user_accounts WHERE org_id = ?',
    CAMPAIGN_ORG,
  ), 0);
});

test('missing private Telegram binding ACKs without a claim or ambiguous delivery', async (t) => {
  const { db, envelope } = await runningCampaignFixture();
  t.after(() => db.sqlite.close());
  const message = queueMessage(envelope);

  await worker.queue(batch([message]), environment(db, {
    LEAD_RADAR_ALLOWED_ORGS: CAMPAIGN_ORG,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: CAMPAIGN_DATA_KEY,
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: TELEGRAM_INTERNAL_SERVICE_TOKEN,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true',
  }), {} as ExecutionContext);

  assert.equal(message.acknowledgements, 1);
  assert.deepEqual(message.retries, []);
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_recipients WHERE campaign_id = ?',
    envelope.campaign_id,
  ), 'pending');
  assert.equal(db.value(
    'SELECT ambiguous_count FROM lead_radar_tg_campaigns WHERE id = ?',
    envelope.campaign_id,
  ), 0);
  assert.equal(db.value(
    'SELECT dispatch_lease_digest FROM lead_radar_tg_user_accounts WHERE org_id = ?',
    CAMPAIGN_ORG,
  ), null);
});

test('degraded Telegram gateway ACKs before D1 claim or provider effect', async (t) => {
  const { db, envelope } = await runningCampaignFixture();
  t.after(() => db.sqlite.close());
  const service = privateTelegramService({ blockers: ['gateway_storage_missing'] });
  const message = queueMessage(envelope);
  await worker.queue(batch([message]), environment(db, {
    LEAD_RADAR_ALLOWED_ORGS: CAMPAIGN_ORG,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: CAMPAIGN_DATA_KEY,
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: TELEGRAM_INTERNAL_SERVICE_TOKEN,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: service.binding,
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '30',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '120',
  }), {} as ExecutionContext);
  assert.equal(message.acknowledgements, 1);
  assert.equal(service.healthCalls, 1);
  assert.equal(service.calls.length, 0);
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_campaign_recipients
    WHERE campaign_id = ?`, envelope.campaign_id), 'pending');
  assert.equal(db.value(`SELECT dispatch_lease_digest FROM lead_radar_tg_user_accounts
    WHERE org_id = ?`, CAMPAIGN_ORG), null);
});

test('malformed or disallowed campaign envelopes never probe the private gateway', async (t) => {
  const { db, envelope } = await runningCampaignFixture();
  t.after(() => db.sqlite.close());
  const service = privateTelegramService();
  const malformed = queueMessage({ ...envelope, campaign_id: 'invalid' });
  const disallowed = queueMessage({ ...envelope, org_id: `org_${'f'.repeat(32)}` });
  await worker.queue(batch([malformed, disallowed]), environment(db, {
    LEAD_RADAR_ALLOWED_ORGS: CAMPAIGN_ORG,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: CAMPAIGN_DATA_KEY,
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: TELEGRAM_INTERNAL_SERVICE_TOKEN,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: service.binding,
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '30',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '120',
  }), {} as ExecutionContext);
  assert.equal(malformed.acknowledgements, 1);
  assert.equal(disallowed.acknowledgements, 1);
  assert.equal(service.healthCalls, 0);
  assert.equal(service.calls.length, 0);
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_campaign_recipients
    WHERE campaign_id = ?`, envelope.campaign_id), 'pending');
});

test('enabled Telegram campaign envelope sends once through the private binding', async (t) => {
  const { db, envelope } = await runningCampaignFixture();
  t.after(() => db.sqlite.close());
  const service = privateTelegramService();
  const message = queueMessage(envelope);

  await worker.queue(batch([message]), environment(db, {
    LEAD_RADAR_ALLOWED_ORGS: CAMPAIGN_ORG,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: CAMPAIGN_DATA_KEY,
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: TELEGRAM_INTERNAL_SERVICE_TOKEN,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: service.binding,
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '30',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '120',
  }), {} as ExecutionContext);

  assert.equal(message.acknowledgements, 1);
  assert.deepEqual(message.retries, []);
  assert.equal(service.calls.length, 1);
  assert.equal(service.calls[0]?.text, 'Здравствуйте, Worker Campaign Clinic!');
  assert.equal(service.calls[0]?.username, 'workercampaignclinic');
  assert.equal(service.calls[0]?.paid_message_policy, 'reject');
  assert.equal(service.calls[0]?.allow_paid_floodskip, false);
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_recipients WHERE campaign_id = ?',
    envelope.campaign_id,
  ), 'sent');
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_effects WHERE campaign_id = ?',
    envelope.campaign_id,
  ), 'sent');
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaigns WHERE id = ?',
    envelope.campaign_id,
  ), 'completed');
  assert.equal(db.value(
    'SELECT daily_reserved_count FROM lead_radar_tg_user_accounts WHERE org_id = ?',
    CAMPAIGN_ORG,
  ), 1);
});

test('scheduled campaign dispatcher enqueues only the strict ID-only envelope', async (t) => {
  const { db, envelope } = await runningCampaignFixture();
  t.after(() => db.sqlite.close());
  const service = privateTelegramService();
  const outgoing = fakeQueue();

  await worker.scheduled({} as ScheduledController, environment(db, {
    AUTOMATION_QUEUE: outgoing,
    LEAD_RADAR_ALLOWED_ORGS: CAMPAIGN_ORG,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: CAMPAIGN_DATA_KEY,
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: TELEGRAM_INTERNAL_SERVICE_TOKEN,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: service.binding,
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '30',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '120',
  }));

  assert.deepEqual(outgoing.sent, [envelope]);
  assert.deepEqual(Object.keys(outgoing.sent[0] as object).sort(), [
    'campaign_id',
    'org_id',
    'schema',
    'state_version',
  ]);
  assert.equal(service.calls.length, 0);
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_recipients WHERE campaign_id = ?',
    envelope.campaign_id,
  ), 'pending');
});

test('scheduled maintenance reconciles one persisted offboarded tenant without provider work', async (t) => {
  const { db, envelope } = await runningCampaignFixture();
  t.after(() => db.sqlite.close());
  const service = privateTelegramService();
  const outgoing = fakeQueue();
  db.sqlite.prepare(`UPDATE lead_radar_companies
    SET suppressed = 1, lifecycle = 'do_not_contact'
    WHERE org_id = ? AND id = 'company_worker_campaign'`)
    .run(CAMPAIGN_ORG);

  await worker.scheduled({} as ScheduledController, environment(db, {
    AUTOMATION_QUEUE: outgoing,
    // This tenant was explicitly removed from autosend admission. Its
    // persisted campaign state still requires custody maintenance.
    LEAD_RADAR_ALLOWED_ORGS: '',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: CAMPAIGN_DATA_KEY,
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: TELEGRAM_INTERNAL_SERVICE_TOKEN,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: service.binding,
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '30',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '120',
  }));

  assert.deepEqual(outgoing.sent, []);
  assert.equal(service.healthCalls, 0);
  assert.equal(service.calls.length, 0);
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_recipients WHERE campaign_id = ?',
    envelope.campaign_id,
  ), 'skipped_dnc');
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_effects WHERE campaign_id = ?',
    envelope.campaign_id,
  ), 'canceled');
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaigns WHERE id = ?',
    envelope.campaign_id,
  ), 'completed');
  assert.equal(db.value(`SELECT cursor FROM lead_radar_tg_maintenance_state
    WHERE scope = 'campaign_tenants'`), CAMPAIGN_ORG);
});

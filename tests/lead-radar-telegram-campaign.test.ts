import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  authorizeTelegramCampaignContact,
  claimNextTelegramCampaignRecipient,
  completeTelegramUserAccountConnection,
  consumeTelegramCampaignQueueMessage,
  createApprovedTelegramCampaign,
  createTelegramUserAccountPending,
  dispatchClaimedTelegramCampaignRecipient,
  evaluateTelegramCampaignSelection,
  getTelegramCampaign,
  getTelegramCampaignRecovery,
  getTelegramUserAccount,
  hasTelegramCampaignSchema,
  LeadRadarTelegramCampaignError,
  parseTelegramCampaignQueueMessage,
  prepareTelegramCampaign,
  maintainTelegramCampaigns,
  recoverTelegramCampaignLease,
  revokeTelegramUserAccount,
  setTelegramUserAccountStatus,
  transitionTelegramCampaign,
  type TelegramCampaignContactBasis,
  type TelegramCampaignSender,
} from '../functions/platform/lead-radar/telegram-campaign';
import { auditTelegramCampaignSchema } from '../functions/platform/lead-radar/telegram-campaign-schema';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATIONS = [
  '0036_lead_radar.sql',
  '0041_lead_radar_search_leases.sql',
  '0042_lead_radar_decision_makers.sql',
  '0043_lead_radar_async_funnel.sql',
  '0044_lead_radar_telegram_business.sql',
  '0045_lead_radar_telegram_campaigns.sql',
  '0046_lead_radar_telegram_campaign_safety.sql',
] as const;
const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2026-08-25T12:00:00.000Z');
const DATA_KEY = Buffer.alloc(32, 9).toString('base64url');
const BASIS: TelegramCampaignContactBasis = 'existing_relationship';

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
  );
  CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  for (const orgId of [ORG_A, ORG_B]) {
    db.sqlite.prepare(`INSERT INTO organizations (
      id, name, slug, status, default_locale, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', 'ru', ?, ?)`)
      .run(orgId, `Fixture ${orgId.at(-1)}`, orgId, NOW.toISOString(), NOW.toISOString());
  }
  for (const filename of MIGRATIONS) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', filename), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(filename);
  }
  return db;
}

function contact(
  username: string,
  type: 'business' | 'human' | 'bot' | 'channel' | 'group' | 'unknown' = 'business',
  evidenceId = `evidence_${username.toLowerCase()}`,
) {
  return {
    url: `https://t.me/${username}`,
    username,
    type,
    confidence: 0.95,
    reason: 'fixture evidence',
    evidenceIds: [evidenceId],
    verifiedAt: NOW.toISOString(),
    messageable: type === 'human',
  };
}

function addCompany(db: SqliteD1, input: {
  id: string;
  username: string;
  orgId?: string;
  type?: 'business' | 'human' | 'bot' | 'channel' | 'group' | 'unknown';
  dnc?: boolean;
}): void {
  const orgId = input.orgId ?? ORG_A;
  const searchId = `search_${input.id}`;
  const evidenceId = `evidence_${input.username.toLowerCase()}`;
  db.sqlite.prepare(`INSERT INTO lead_radar_searches (
    id, org_id, input_json, status, created_at
  ) VALUES (?, ?, '{}', 'ready', ?)`)
    .run(searchId, orgId, NOW.toISOString());
  const telegramContact = contact(input.username, input.type, evidenceId);
  db.sqlite.prepare(`INSERT INTO lead_radar_companies (
    id, org_id, search_id, canonical_key, name, category, city, country,
    score, confidence, priority, score_components_json, signals_json,
    discovered_at, last_verified_at, updated_at, website,
    telegram_contact_json, lifecycle, suppressed
  ) VALUES (?, ?, ?, ?, ?, 'services', 'Tashkent', 'UZ', 80, 0.9, 'P1',
    '[]', '[]', ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      input.id,
      orgId,
      searchId,
      `fixture:${input.id}`,
      `Company ${input.id}`,
      NOW.toISOString(),
      NOW.toISOString(),
      NOW.toISOString(),
      `https://${input.id}.example/`,
      JSON.stringify(telegramContact),
      input.dnc ? 'do_not_contact' : 'new',
      input.dnc ? 1 : 0,
    );
  if ((input.type ?? 'business') === 'business') {
    db.sqlite.prepare(`INSERT INTO lead_radar_evidence (
      id, org_id, company_id, field_path, value, source_url, source_type,
      observed_at, confidence, classification
    ) VALUES (?, ?, ?, 'web.telegram.business', ?, ?, 'company_website',
      ?, 0.95, 'fact')`)
      .run(
        evidenceId,
        orgId,
        input.id,
        `https://t.me/${input.username}`,
        `https://${input.id}.example/contact`,
        NOW.toISOString(),
      );
  }
}

function errorCode(error: unknown): string | null {
  return error instanceof LeadRadarTelegramCampaignError ? error.code : null;
}

async function connectedAccount(db: SqliteD1, orgId = ORG_A) {
  const pending = await createTelegramUserAccountPending({
    db: db.asD1(),
    dataKey: DATA_KEY,
    orgId,
    authRequestReference: `gateway_auth_request_${orgId.at(-1)}`,
    idempotencyKey: `account_connect_${orgId.at(-1)}_0001`,
    now: NOW,
  });
  return completeTelegramUserAccountConnection({
    db: db.asD1(),
    dataKey: DATA_KEY,
    orgId,
    accountId: pending.account.id,
    gatewayAccountRef: `gateway_account_reference_${orgId.at(-1)}`,
    expectedVersion: pending.account.stateVersion,
    now: NOW,
  });
}

async function approvedCampaign(
  db: SqliteD1,
  companyIds: string[],
  idempotencyKey = 'campaign_create_0001',
  template = 'Здравствуйте! Это согласованное предложение.',
) {
  const account = await getTelegramUserAccount(db.asD1(), ORG_A) ?? await connectedAccount(db);
  for (const [index, companyId] of companyIds.entries()) {
    await authorizeTelegramCampaignContact({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, companyId,
      contactBasis: BASIS,
      evidenceReference: `fixture-evidence-${companyId}`,
      expiresAt: '2026-09-24T12:00:00.000Z',
      reviewerId: 'owner@example.test',
      idempotencyKey: `${idempotencyKey}_authorization_${index}`,
      now: NOW,
    });
  }
  const prepared = await prepareTelegramCampaign({
    db: db.asD1(),
    dataKey: DATA_KEY,
    orgId: ORG_A,
    accountId: account.id,
    searchId: 'search_campaign_fixture',
    companyIds,
    template,
    operatorId: 'owner@example.test',
    idempotencyKey: `${idempotencyKey}_prepare`,
    contactBasis: BASIS,
    minIntervalSeconds: 30,
    now: NOW,
  });
  return createApprovedTelegramCampaign({
    db: db.asD1(),
    dataKey: DATA_KEY,
    orgId: ORG_A,
    accountId: account.id,
    searchId: 'search_campaign_fixture',
    companyIds,
    template,
    operatorId: 'owner@example.test',
    contactBasis: BASIS,
    approvalToken: prepared.approvalToken,
    expectedSelectionDigest: prepared.selectionDigest,
    expectedContentDigest: prepared.contentDigest,
    idempotencyKey,
    minIntervalSeconds: 30,
    now: NOW,
  });
}

test('0045+0046 have an exact read-only schema contract and no session/credential columns', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  assert.deepEqual(await auditTelegramCampaignSchema(db.asD1()), {
    status: 'pass',
    readOnly: true,
    contractVersion: 'lead-radar-telegram-campaign-v2',
    issues: [],
  });
  assert.equal(await hasTelegramCampaignSchema(db.asD1()), true);
  assert.doesNotThrow(() => db.exec(readFileSync(
    path.join(ROOT, 'migrations', '0046_lead_radar_telegram_campaign_safety.sql'),
    'utf8',
  )));
  assert.equal(await hasTelegramCampaignSchema(db.asD1()), true);
  const columns = db.rows<{ name: string }>("PRAGMA table_info('lead_radar_tg_user_accounts')")
    .map((row) => row.name);
  assert.ok(columns.includes('gateway_account_ref'));
  for (const forbidden of ['session', 'phone', 'username', 'password', 'qr', 'two_factor']) {
    assert.ok(columns.every((column) => !column.includes(forbidden)));
  }
  db.sqlite.prepare('DELETE FROM d1_migrations WHERE name = ?')
    .run('0046_lead_radar_telegram_campaign_safety.sql');
  assert.equal((await auditTelegramCampaignSchema(db.asD1())).status, 'blocked');
});

test('per-company authorization is tenant-scoped, expiry-bound, idempotent and digest-only', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_authorized_a', username: 'AuthorizedClinicA' });
  const input = {
    db: db.asD1(),
    dataKey: DATA_KEY,
    orgId: ORG_A,
    companyId: 'company_authorized_a',
    contactBasis: BASIS,
    evidenceReference: 'crm-case-8472-owner-confirmed',
    expiresAt: '2026-09-24T12:00:00.000Z',
    reviewerId: 'owner@example.test',
    idempotencyKey: 'authorization_company_a_0001',
    now: NOW,
  } as const;
  const first = await authorizeTelegramCampaignContact(input);
  const replay = await authorizeTelegramCampaignContact(input);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.authorization, first.authorization);
  await assert.rejects(
    authorizeTelegramCampaignContact({
      ...input,
      evidenceReference: 'crm-case-9999-different-proof',
    }),
    (error) => errorCode(error) === 'telegram_campaign_idempotency_conflict',
  );
  await assert.rejects(
    authorizeTelegramCampaignContact({
      ...input,
      orgId: ORG_B,
      idempotencyKey: 'authorization_cross_tenant_0001',
    }),
    (error) => errorCode(error) === 'telegram_campaign_eligibility_required',
  );
  const stored = JSON.stringify(db.rows<Record<string, unknown>>(
    'SELECT * FROM lead_radar_tg_contact_authorizations',
  ));
  assert.ok(!stored.includes(input.evidenceReference));
  assert.ok(!stored.includes(input.reviewerId));
  const expired = await evaluateTelegramCampaignSelection({
    db: db.asD1(),
    dataKey: DATA_KEY,
    orgId: ORG_A,
    companyIds: [input.companyId],
    contactBasis: BASIS,
    now: new Date('2026-09-24T12:00:00.000Z'),
  });
  assert.equal(expired.automatic, 0);
  assert.equal(expired.items[0]?.reasonCode, 'documented_basis_required');
});

test('account lifecycle is tenant-scoped, idempotent and stores only an opaque gateway ref', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const first = await createTelegramUserAccountPending({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    authRequestReference: 'gateway_auth_request_a',
    idempotencyKey: 'account_connect_a_0001', now: NOW,
  });
  const replay = await createTelegramUserAccountPending({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    authRequestReference: 'gateway_auth_request_a',
    idempotencyKey: 'account_connect_a_0001', now: NOW,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.account.id, first.account.id);
  await assert.rejects(
    createTelegramUserAccountPending({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
      authRequestReference: 'gateway_auth_request_changed',
      idempotencyKey: 'account_connect_a_0001', now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_idempotency_conflict',
  );
  const connected = await completeTelegramUserAccountConnection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    accountId: first.account.id, gatewayAccountRef: 'gateway_account_reference_a',
    expectedVersion: first.account.stateVersion, now: NOW,
  });
  assert.equal(connected.status, 'connected');
  assert.equal(await getTelegramUserAccount(db.asD1(), ORG_B, connected.id), null);
  const row = db.rows<Record<string, unknown>>(
    'SELECT * FROM lead_radar_tg_user_accounts WHERE org_id = ?', ORG_A,
  )[0];
  assert.equal(row?.gateway_account_ref, 'gateway_account_reference_a');
  assert.ok(!Object.keys(row ?? {}).some((key) => /session|phone|username|password|qr/iu.test(key)));
  assert.equal(await revokeTelegramUserAccount({
    db: db.asD1(), orgId: ORG_A, accountId: connected.id, now: NOW,
  }), true);
  assert.equal(db.value(
    'SELECT gateway_account_ref FROM lead_radar_tg_user_accounts WHERE org_id = ?', ORG_A,
  ), null);
});

test('terminal connection poll can move pending account only to error without a gateway ref', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const pending = await createTelegramUserAccountPending({
    db: db.asD1(),
    dataKey: DATA_KEY,
    orgId: ORG_A,
    authRequestReference: 'gateway_auth_terminal_error_a',
    idempotencyKey: 'account_terminal_error_a_0001',
    now: NOW,
  });
  await assert.rejects(
    setTelegramUserAccountStatus({
      db: db.asD1(),
      orgId: ORG_A,
      accountId: pending.account.id,
      expectedVersion: pending.account.stateVersion,
      status: 'paused',
      now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_account_state_conflict',
  );
  const failed = await setTelegramUserAccountStatus({
    db: db.asD1(),
    orgId: ORG_A,
    accountId: pending.account.id,
    expectedVersion: pending.account.stateVersion,
    status: 'error',
    now: NOW,
  });
  assert.equal(failed.status, 'error');
  assert.equal(db.value(
    'SELECT gateway_account_ref FROM lead_radar_tg_user_accounts WHERE org_id = ? AND id = ?',
    ORG_A,
    pending.account.id,
  ), null);
});

test('prepare classifies all selected leads but binds approval only to verified automatic recipients', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_auto', username: 'CorporateClinic' });
  addCompany(db, { id: 'company_human', username: 'ClinicOwner', type: 'human' });
  addCompany(db, { id: 'company_bot', username: 'ClinicHelperBot', type: 'bot' });
  addCompany(db, { id: 'company_dnc', username: 'SilentClinic', dnc: true });
  const account = await connectedAccount(db);
  const selection = await evaluateTelegramCampaignSelection({
    db: db.asD1(),
    orgId: ORG_A,
    companyIds: ['company_auto', 'company_human', 'company_bot', 'company_dnc', 'company_missing'],
    now: NOW,
  });
  assert.deepEqual(
    { selected: selection.selected, automatic: selection.automatic, manual: selection.manual, excluded: selection.excluded },
    { selected: 5, automatic: 0, manual: 2, excluded: 3 },
  );
  assert.deepEqual(selection.automaticCompanyIds, []);

  await authorizeTelegramCampaignContact({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, companyId: 'company_auto',
    contactBasis: BASIS, evidenceReference: 'fixture-evidence-company-auto',
    expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
    idempotencyKey: 'authorize_company_auto_0001', now: NOW,
  });

  await assert.rejects(
    prepareTelegramCampaign({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
      searchId: 'search_prepare_invalid_basis',
      companyIds: ['company_auto'], template: 'Offer', operatorId: 'owner@example.test',
      idempotencyKey: 'prepare_invalid_basis',
      contactBasis: 'public_contact' as TelegramCampaignContactBasis, now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_invalid_input',
  );
  const prepared = await prepareTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_prepare_classification',
    companyIds: ['company_auto', 'company_human', 'company_bot', 'company_dnc', 'company_missing'],
    template: 'Offer', operatorId: 'owner@example.test', contactBasis: BASIS, now: NOW,
    idempotencyKey: 'prepare_classification_0001',
  });
  assert.equal(prepared.recipientCount, 1);
  const preparedReplay = await prepareTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_prepare_classification',
    companyIds: ['company_auto', 'company_human', 'company_bot', 'company_dnc', 'company_missing'],
    template: 'Offer', operatorId: 'owner@example.test', contactBasis: BASIS,
    idempotencyKey: 'prepare_classification_0001', now: NOW,
  });
  assert.equal(preparedReplay.approvalToken, prepared.approvalToken);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals'), 1);
  const approval = db.rows<Record<string, unknown>>('SELECT * FROM lead_radar_tg_campaign_approvals')[0];
  assert.equal(approval?.contact_basis, BASIS);
  const serialized = JSON.stringify(approval);
  assert.ok(!serialized.includes('Offer'));
  assert.ok(!serialized.includes('CorporateClinic'));
});

test('approved campaign is encrypted, tenant-scoped and replay/conflict safe', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_one', username: 'CompanyOne' });
  const created = await approvedCampaign(db, ['company_one']);
  assert.equal(created.campaign.status, 'approved');
  assert.equal(created.campaign.contactBasis, BASIS);
  assert.equal(created.campaign.counts.total, 1);
  assert.equal(await getTelegramCampaign(db.asD1(), ORG_B, created.campaign.id), null);
  const storage = JSON.stringify([
    ...db.rows<Record<string, unknown>>('SELECT * FROM lead_radar_tg_campaigns'),
    ...db.rows<Record<string, unknown>>('SELECT * FROM lead_radar_tg_campaign_recipients'),
    ...db.rows<Record<string, unknown>>('SELECT * FROM lead_radar_tg_campaign_effects'),
  ]);
  assert.ok(!storage.includes('согласованное предложение'));
  assert.ok(!storage.includes('CompanyOne'));

  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'stop',
    operatorId: 'owner@example.test', idempotencyKey: 'campaign_stop_before_replay', now: NOW,
  });

  const account = await getTelegramUserAccount(db.asD1(), ORG_A);
  assert.ok(account);
  const approval = await prepareTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_replay_offer',
    companyIds: ['company_one'], template: 'Повторный оффер',
    operatorId: 'owner@example.test', idempotencyKey: 'prepare_replay_offer_0001',
    contactBasis: BASIS, now: NOW,
  });
  const first = await createApprovedTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_replay_offer',
    companyIds: ['company_one'], template: 'Повторный оффер',
    operatorId: 'owner@example.test', contactBasis: BASIS,
    approvalToken: approval.approvalToken,
    expectedSelectionDigest: approval.selectionDigest,
    expectedContentDigest: approval.contentDigest,
    idempotencyKey: 'campaign_create_0002', now: NOW,
  });
  const replay = await createApprovedTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_replay_offer',
    companyIds: ['company_one'], template: 'Повторный оффер',
    operatorId: 'owner@example.test', contactBasis: BASIS,
    approvalToken: approval.approvalToken,
    expectedSelectionDigest: approval.selectionDigest,
    expectedContentDigest: approval.contentDigest,
    idempotencyKey: 'campaign_create_0002', now: NOW,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.campaign.id, first.campaign.id);
  await assert.rejects(
    createApprovedTelegramCampaign({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
      searchId: 'search_replay_offer',
      companyIds: ['company_one'], template: 'Изменённый оффер',
      operatorId: 'owner@example.test', contactBasis: BASIS,
      approvalToken: approval.approvalToken,
      expectedSelectionDigest: approval.selectionDigest,
      expectedContentDigest: approval.contentDigest,
      idempotencyKey: 'campaign_create_0002', now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_approval_required',
  );
});

test('campaign transitions are explicit and operation idempotency is conflict-safe', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_state', username: 'StateClinic' });
  const created = await approvedCampaign(db, ['company_state']);
  const started = await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start',
    operatorId: 'owner@example.test', idempotencyKey: 'campaign_start_0001', now: NOW,
  });
  assert.equal(started.campaign.status, 'running');
  assert.equal((await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start',
    operatorId: 'owner@example.test', idempotencyKey: 'campaign_start_0001', now: NOW,
  })).replayed, true);
  await assert.rejects(
    transitionTelegramCampaign({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
      campaignId: created.campaign.id, action: 'pause',
      operatorId: 'owner@example.test', idempotencyKey: 'campaign_start_0001', now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_idempotency_conflict',
  );
  const paused = await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'pause',
    operatorId: 'owner@example.test', idempotencyKey: 'campaign_pause_0001', now: NOW,
  });
  assert.equal(paused.campaign.status, 'paused');
  const resumed = await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'resume',
    operatorId: 'owner@example.test', idempotencyKey: 'campaign_resume_0001', now: NOW,
  });
  assert.equal(resumed.campaign.status, 'running');
  const stopped = await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'stop',
    operatorId: 'owner@example.test', idempotencyKey: 'campaign_stop_0001', now: NOW,
  });
  assert.equal(stopped.campaign.status, 'stopped');
  assert.equal(stopped.campaign.counts.skipped, 1);
});

test('dispatch rechecks DNC, stays sequential and completes without queue PII', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_first', username: 'FirstClinic' });
  addCompany(db, { id: 'company_second', username: 'SecondClinic' });
  const created = await approvedCampaign(db, ['company_first', 'company_second']);
  const started = await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start',
    operatorId: 'owner@example.test', idempotencyKey: 'campaign_start_send', now: NOW,
  });
  const queue = parseTelegramCampaignQueueMessage({
    schema: 'gptbot.lead-radar.telegram-campaign.v1',
    campaign_id: created.campaign.id,
    org_id: ORG_A,
    state_version: started.campaign.status === 'running'
      ? Number(db.value('SELECT state_version FROM lead_radar_tg_campaigns WHERE id = ?', created.campaign.id))
      : 0,
  });
  assert.deepEqual(Object.keys(queue).sort(), ['campaign_id', 'org_id', 'schema', 'state_version']);
  assert.ok(!JSON.stringify(queue).includes('Clinic'));
  const firstClaim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(firstClaim);
  const concurrent = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.equal(concurrent, null);
  db.sqlite.prepare(`UPDATE lead_radar_companies
    SET suppressed = 1, lifecycle = 'do_not_contact'
    WHERE org_id = ? AND id = 'company_first'`).run(ORG_A);
  let sendCalls = 0;
  const sender: TelegramCampaignSender = {
    async send() {
      sendCalls += 1;
      return { kind: 'sent', providerMessageId: 'message-1' };
    },
  };
  const skipped = await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    claim: firstClaim, sender, now: NOW,
  });
  assert.equal(skipped.status, 'skipped_dnc');
  assert.equal(sendCalls, 0);
  const secondClaim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(secondClaim);
  const sent = await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    claim: secondClaim, sender, now: NOW,
  });
  assert.equal(sent.status, 'sent');
  assert.equal(sent.campaign.status, 'completed');
  assert.equal(sendCalls, 1);
  assert.deepEqual(sent.campaign.counts, {
    total: 2, pending: 0, sent: 1, failed: 0, ambiguous: 0, skipped: 1,
  });
});

test('company_name is frozen, rendered and encrypted per recipient before dispatch', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_personalized', username: 'PersonalizedClinic' });
  const template = 'Здравствуйте, {company_name}! Обсудим согласованный оффер?';
  const created = await approvedCampaign(
    db,
    ['company_personalized'],
    'campaign_personalized_0001',
    template,
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start',
    operatorId: 'owner@example.test', idempotencyKey: 'campaign_start_personalized', now: NOW,
  });
  db.sqlite.prepare(`UPDATE lead_radar_companies SET name = 'Mutated Company Name'
    WHERE org_id = ? AND id = 'company_personalized'`).run(ORG_A);
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  let deliveredText = '';
  await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim,
    sender: {
      async send(input) {
        deliveredText = input.text;
        return { kind: 'sent', providerMessageId: 'personalized-message' };
      },
    },
    now: NOW,
  });
  assert.equal(
    deliveredText,
    'Здравствуйте, Company company_personalized! Обсудим согласованный оффер?',
  );
  assert.ok(!deliveredText.includes('{company_name}'));
  assert.ok(!deliveredText.includes('Mutated Company Name'));
  const protectedStorage = JSON.stringify([
    ...db.rows<Record<string, unknown>>('SELECT * FROM lead_radar_tg_campaigns'),
    ...db.rows<Record<string, unknown>>('SELECT * FROM lead_radar_tg_campaign_recipients'),
    ...db.rows<Record<string, unknown>>('SELECT * FROM lead_radar_tg_campaign_effects'),
  ]);
  assert.ok(!protectedStorage.includes('{company_name}'));
  assert.ok(!protectedStorage.includes('Company company_personalized'));
});

test('one account rejects concurrent non-terminal campaigns and admits the next after stop', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_serial_a', username: 'SerialClinicA' });
  addCompany(db, { id: 'company_serial_b', username: 'SerialClinicB' });
  const first = await approvedCampaign(db, ['company_serial_a'], 'campaign_serial_a_0001');
  await assert.rejects(
    approvedCampaign(db, ['company_serial_b'], 'campaign_serial_b_conflict'),
    (error) => errorCode(error) === 'telegram_campaign_active_exists',
  );
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_campaigns
    WHERE org_id = ? AND status IN ('approved', 'running', 'paused')`, ORG_A), 1);
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: first.campaign.id, action: 'stop', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_serial_stop_first', now: NOW,
  });
  const second = await approvedCampaign(db, ['company_serial_b'], 'campaign_serial_b_after_stop');
  assert.equal(second.campaign.status, 'approved');
  assert.notEqual(second.campaign.id, first.campaign.id);
});

test('active/latest recovery is search- and tenant-scoped across terminal transitions', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_recovery', username: 'RecoveryClinic' });
  const created = await approvedCampaign(db, ['company_recovery'], 'campaign_recovery_0001');
  const active = await getTelegramCampaignRecovery({
    db: db.asD1(), orgId: ORG_A, searchId: 'search_campaign_fixture', now: NOW,
  });
  assert.equal(active.active?.id, created.campaign.id);
  assert.equal(active.latest?.id, created.campaign.id);
  assert.deepEqual(await getTelegramCampaignRecovery({
    db: db.asD1(), orgId: ORG_B, searchId: 'search_campaign_fixture', now: NOW,
  }), { active: null, latest: null });
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'stop', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_recovery_stop_0001', now: NOW,
  });
  const terminal = await getTelegramCampaignRecovery({
    db: db.asD1(), orgId: ORG_A, searchId: 'search_campaign_fixture', now: NOW,
  });
  assert.equal(terminal.active, null);
  assert.equal(terminal.latest?.id, created.campaign.id);
  assert.equal(terminal.latest?.status, 'stopped');
});

test('atomic account quota blocks the eleventh attempt and pauses to next UTC day', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_quota', username: 'QuotaClinic' });
  const created = await approvedCampaign(db, ['company_quota'], 'campaign_quota_0001');
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start',
    operatorId: 'owner@example.test', idempotencyKey: 'campaign_start_quota', now: NOW,
  });
  db.sqlite.prepare(`UPDATE lead_radar_tg_user_accounts
    SET quota_day = ?, daily_reserved_count = 10
    WHERE org_id = ?`).run(NOW.toISOString().slice(0, 10), ORG_A);
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  let sendCalls = 0;
  const blocked = await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim,
    sender: {
      async send() {
        sendCalls += 1;
        return { kind: 'sent', providerMessageId: 'must-not-send' };
      },
    },
    dailyLimit: 10,
    now: NOW,
  });
  assert.equal(blocked.status, 'paused');
  assert.equal(blocked.campaign.status, 'paused');
  assert.equal(blocked.campaign.pauseReason, 'cooldown');
  assert.equal(blocked.campaign.lastErrorCode, 'daily_limit_exhausted');
  assert.equal(blocked.campaign.nextSendAt, '2026-08-26T00:00:00.000Z');
  assert.equal(sendCalls, 0);
  assert.equal(db.value(
    'SELECT daily_reserved_count FROM lead_radar_tg_user_accounts WHERE org_id = ?', ORG_A,
  ), 10);
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_recipients WHERE campaign_id = ?',
    created.campaign.id,
  ), 'pending');
});

test('provider FLOOD_WAIT longer than 24 hours is preserved exactly and blocks early resume', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_long_flood', username: 'LongFloodClinic' });
  const created = await approvedCampaign(db, ['company_long_flood'], 'campaign_long_flood_0001');
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_long_flood_start_0001', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  const waitSeconds = 172_801;
  const expectedResumeAt = new Date(NOW.getTime() + waitSeconds * 1_000).toISOString();
  const result = await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, now: NOW,
    sender: {
      async send() {
        return { kind: 'rejected', code: 'flood_wait', retryAfterSeconds: waitSeconds };
      },
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.campaign.status, 'paused');
  assert.equal(result.campaign.nextSendAt, expectedResumeAt);
  assert.equal(result.campaign.canResume, false);
  assert.equal(result.campaign.resumeBlockedReason, 'cooldown');
  assert.equal(result.campaign.pausedUntil, expectedResumeAt);
  assert.equal(db.value(
    'SELECT blocked_until FROM lead_radar_tg_account_safety WHERE org_id = ?', ORG_A,
  ), expectedResumeAt);
  await assert.rejects(
    transitionTelegramCampaign({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
      campaignId: created.campaign.id, action: 'resume', operatorId: 'owner@example.test',
      idempotencyKey: 'campaign_long_flood_resume_early',
      now: new Date(NOW.getTime() + 24 * 60 * 60_000),
    }),
    (error) => errorCode(error) === 'telegram_campaign_resume_cooldown',
  );
  const resumed = await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'resume', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_long_flood_resume_due',
    now: new Date(NOW.getTime() + waitSeconds * 1_000),
  });
  assert.equal(resumed.campaign.status, 'running');
});

test('maintenance applies new DNC suppression and purges unsent recipient ciphertext', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_maintenance_dnc', username: 'MaintenanceDncClinic' });
  const created = await approvedCampaign(
    db,
    ['company_maintenance_dnc'],
    'campaign_maintenance_dnc_0001',
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_maintenance_dnc_start', now: NOW,
  });
  db.sqlite.prepare(`UPDATE lead_radar_companies
    SET suppressed = 1, lifecycle = 'do_not_contact'
    WHERE org_id = ? AND id = 'company_maintenance_dnc'`).run(ORG_A);
  await maintainTelegramCampaigns({
    db: db.asD1(), orgId: ORG_A, now: new Date(NOW.getTime() + 1_000),
  });
  const recipient = db.rows<Record<string, unknown>>(`SELECT status, endpoint_ciphertext,
    endpoint_iv, payload_ciphertext, payload_iv
    FROM lead_radar_tg_campaign_recipients WHERE campaign_id = ?`, created.campaign.id)[0];
  assert.equal(recipient?.status, 'skipped_dnc');
  assert.equal(recipient?.endpoint_ciphertext, 'purged_________________');
  assert.equal(recipient?.payload_ciphertext, 'purged_________________');
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_effects WHERE campaign_id = ?',
    created.campaign.id,
  ), 'canceled');
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaigns WHERE id = ?', created.campaign.id,
  ), 'completed');
});

test('maintenance reconciles a durable sent effect after a crash without a duplicate provider call', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_effect_reconcile', username: 'EffectReconcileClinic' });
  const created = await approvedCampaign(
    db,
    ['company_effect_reconcile'],
    'campaign_effect_reconcile_0001',
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_effect_reconcile_start', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  const providerDigest = 'a'.repeat(64);
  db.sqlite.prepare(`UPDATE lead_radar_tg_campaign_recipients
    SET status = 'dispatching', attempt_count = 1, dispatching_at = ?, updated_at = ?
    WHERE org_id = ? AND campaign_id = ? AND id = ?`)
    .run(NOW.toISOString(), NOW.toISOString(), ORG_A, created.campaign.id, claim.recipientId);
  db.sqlite.prepare(`UPDATE lead_radar_tg_campaign_effects
    SET status = 'sent', provider_message_digest = ?, completed_at = ?, updated_at = ?
    WHERE org_id = ? AND campaign_id = ? AND recipient_id = ?`)
    .run(
      providerDigest,
      NOW.toISOString(),
      NOW.toISOString(),
      ORG_A,
      created.campaign.id,
      claim.recipientId,
    );
  await maintainTelegramCampaigns({
    db: db.asD1(), orgId: ORG_A, now: new Date(NOW.getTime() + 3 * 60_000),
  });
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_recipients WHERE id = ?', claim.recipientId,
  ), 'sent');
  assert.equal(db.value(
    'SELECT provider_message_digest FROM lead_radar_tg_campaign_recipients WHERE id = ?',
    claim.recipientId,
  ), providerDigest);
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaigns WHERE id = ?', created.campaign.id,
  ), 'completed');
  assert.equal(db.value(
    'SELECT dispatch_lease_digest FROM lead_radar_tg_user_accounts WHERE org_id = ?', ORG_A,
  ), null);
  let sends = 0;
  const replay = await consumeTelegramCampaignQueueMessage({
    db: db.asD1(), dataKey: DATA_KEY,
    raw: {
      schema: 'gptbot.lead-radar.telegram-campaign.v1',
      campaign_id: created.campaign.id,
      org_id: ORG_A,
      state_version: 1,
    },
    sender: { async send() { sends += 1; return { kind: 'sent', providerMessageId: 'duplicate' }; } },
    now: new Date(NOW.getTime() + 3 * 60_000),
  });
  assert.equal(replay.disposition, 'stale');
  assert.equal(sends, 0);
});

test('disconnect during an in-flight provider call terminalizes the effect without retry', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_disconnect_race', username: 'DisconnectRaceClinic' });
  const created = await approvedCampaign(
    db,
    ['company_disconnect_race'],
    'campaign_disconnect_race_0001',
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_disconnect_race_start', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  let entered!: () => void;
  let release!: (value: { kind: 'sent'; providerMessageId: string }) => void;
  const enteredProvider = new Promise<void>((resolve) => { entered = resolve; });
  const providerResult = new Promise<{ kind: 'sent'; providerMessageId: string }>((resolve) => {
    release = resolve;
  });
  let sends = 0;
  const dispatch = dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, now: NOW,
    sender: {
      async send() {
        sends += 1;
        entered();
        return providerResult;
      },
    },
  });
  await enteredProvider;
  const account = await getTelegramUserAccount(db.asD1(), ORG_A);
  assert.ok(account);
  assert.equal(await revokeTelegramUserAccount({
    db: db.asD1(), orgId: ORG_A, accountId: account.id,
    now: new Date(NOW.getTime() + 1_000),
  }), true);
  release({ kind: 'sent', providerMessageId: 'late-provider-ack' });
  const result = await dispatch;
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.campaign.status, 'stopped');
  assert.equal(sends, 1);
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_recipients WHERE id = ?', claim.recipientId,
  ), 'ambiguous');
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_campaign_effects WHERE recipient_id = ?', claim.recipientId,
  ), 'ambiguous');
  assert.equal(db.value(
    'SELECT state FROM lead_radar_tg_account_safety WHERE account_id = ?', account.id,
  ), 'disconnected');
  assert.equal(db.value(
    'SELECT endpoint_ciphertext FROM lead_radar_tg_campaign_recipients WHERE id = ?',
    claim.recipientId,
  ), 'purged_________________');
});

test('ambiguous provider boundary is terminal per-recipient and pauses without retry', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_ambiguous', username: 'AmbiguousClinic' });
  const created = await approvedCampaign(db, ['company_ambiguous']);
  const started = await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start',
    operatorId: 'owner@example.test', idempotencyKey: 'campaign_start_ambiguous', now: NOW,
  });
  const result = await consumeTelegramCampaignQueueMessage({
    db: db.asD1(), dataKey: DATA_KEY,
    raw: {
      schema: 'gptbot.lead-radar.telegram-campaign.v1',
      campaign_id: created.campaign.id,
      org_id: ORG_A,
      state_version: Number(db.value(
        'SELECT state_version FROM lead_radar_tg_campaigns WHERE id = ?', created.campaign.id,
      )),
    },
    sender: { async send() { throw new Error('timeout after provider boundary'); } },
    now: NOW,
  });
  assert.equal(result.disposition, 'processed');
  assert.equal(result.deliveryStatus, 'ambiguous');
  assert.equal(result.next, null);
  const campaign = await getTelegramCampaign(db.asD1(), ORG_A, started.campaign.id);
  assert.equal(campaign?.status, 'paused');
  assert.equal(campaign?.pauseReason, 'ambiguous_delivery');
  assert.equal(db.value(
    'SELECT attempt_count FROM lead_radar_tg_campaign_recipients WHERE campaign_id = ?',
    created.campaign.id,
  ), 1);
  assert.equal(await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: new Date(NOW.getTime() + 60_000),
  }), null);
  await assert.rejects(
    transitionTelegramCampaign({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
      campaignId: created.campaign.id, action: 'resume',
      operatorId: 'owner@example.test', idempotencyKey: 'campaign_resume_ambiguous',
      now: new Date(NOW.getTime() + 60_000),
    }),
    (error) => errorCode(error) === 'telegram_campaign_resume_ambiguous_delivery',
  );
  assert.deepEqual(await recoverTelegramCampaignLease({
    db: db.asD1(), orgId: ORG_A, campaignId: created.campaign.id,
    now: new Date(NOW.getTime() + 10 * 60_000),
  }), { released: 0, ambiguous: 0 });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { authorizeTelegramCampaignContact, claimNextTelegramCampaignRecipient, completeTelegramUserAccountConnection,
  consumeTelegramCampaignQueueMessage, createApprovedTelegramCampaign, createTelegramUserAccountPending,
  dispatchClaimedTelegramCampaignRecipient, evaluateTelegramCampaignSelection, getTelegramUserAccount,
  prepareTelegramCampaign, stageTelegramUserAccountConnection, transitionTelegramCampaign,
  type TelegramCampaignContactBasis, type TelegramCampaignSender } from '../functions/platform/lead-radar/telegram-campaign';
import { auditTelegramCampaignSchema, hasRuntimeTelegramCampaignSchema, telegramCampaignSchemaFingerprint,
  TELEGRAM_PUBLIC_INQUIRY_SCHEMA_FINGERPRINT } from '../functions/platform/lead-radar/telegram-campaign-schema';
import { LeadRadarTelegramCampaignStore } from '../functions/platform/lead-radar/telegram-campaign-store';
import { publicBusinessInquiryEvidenceUrls, PUBLIC_BUSINESS_INQUIRY_VERSION } from '../functions/platform/lead-radar/telegram-public-inquiry';
import { checkCorporateTelegramContact } from '../functions/platform/lead-radar/contact-resolution';
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
  '0047_lead_radar_telegram_campaign_media.sql',
  '0048_lead_radar_telegram_media_quota.sql',
  '0050_lead_radar_contact_discovery.sql',
  '0054_lead_radar_candidate_pool_resume.sql',
  '0051_lead_radar_audiences.sql',
  '0053_lead_radar_audience_selection.sql',
] as const;
const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2026-08-25T12:00:00.000Z');
const DATA_KEY = Buffer.alloc(32, 9).toString('base64url');
const BASIS: TelegramCampaignContactBasis = 'existing_relationship';


function database(migrations: readonly string[] = MIGRATIONS): SqliteD1 {
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
  for (const filename of new Set(migrations)) {
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
  evidenceId?: string;
  type?: 'business' | 'human' | 'bot' | 'channel' | 'group' | 'unknown';
  dnc?: boolean;
}): void {
  const orgId = input.orgId ?? ORG_A;
  const searchId = `search_${input.id}`;
  const evidenceId = input.evidenceId ?? `evidence_${input.username.toLowerCase()}`;
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
    db.sqlite.prepare(`INSERT INTO lead_radar_evidence (
      id, org_id, company_id, field_path, value, source_url, source_type,
      observed_at, confidence, classification
    ) VALUES (?, ?, ?, 'web.website', ?, ?, 'company_website',
      ?, 0.95, 'fact')`)
      .run(
        `evidence_binding_${input.id}`,
        orgId,
        input.id,
        `https://${input.id}.example/`,
        `https://${input.id}.example/contact`,
        NOW.toISOString(),
      );
  }
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
  await stageTelegramUserAccountConnection({
    db: db.asD1(), dataKey: DATA_KEY, orgId,
    accountId: pending.account.id,
    gatewayAccountRef: `gateway_account_reference_${orgId.at(-1)}`,
    expectedVersion: pending.account.stateVersion,
    providerConnectedAt: NOW.toISOString(), now: NOW,
  });
  const connected = await completeTelegramUserAccountConnection({
    db: db.asD1(),
    dataKey: DATA_KEY,
    orgId,
    accountId: pending.account.id,
    gatewayAccountRef: `gateway_account_reference_${orgId.at(-1)}`,
    expectedVersion: pending.account.stateVersion,
    now: NOW,
  });
  await bridgeVerifyBusinessCompanies(db, connected.id, orgId);
  return connected;
}

async function bridgeVerifyBusinessCompanies(
  db: SqliteD1,
  accountId: string,
  orgId = ORG_A,
  companyIds?: readonly string[],
  now = NOW,
): Promise<void> {
  const rows = db.rows<{ id: string; search_id: string; telegram_contact_json: string }>(
    `SELECT id, search_id, telegram_contact_json FROM lead_radar_companies
     WHERE org_id = ? AND suppressed = 0
       AND json_extract(telegram_contact_json, '$.type') = 'business'
       ${companyIds?.length ? `AND id IN (${companyIds.map(() => '?').join(',')})` : ''}`,
    orgId,
    ...(companyIds ?? []),
  );
  for (const row of rows) {
    const saved = JSON.parse(row.telegram_contact_json) as { username?: string | null };
    if (!saved.username) continue;
    const result = await checkCorporateTelegramContact({
      db: db.asD1(), orgId, searchId: row.search_id, companyId: row.id,
      candidateKey: `telegram:https://t.me/${saved.username.toLowerCase()}`,
      accountId, now: now.toISOString(),
      resolve: async () => ({
        status: 'resolved', username: saved.username ?? null,
        reason: 'regular_user_resolved', retryAfterSeconds: null,
      }),
    });
    assert.equal(result.status, 'resolved', `Bridge fixture could not resolve ${row.id}: ${result.reason}`);
  }
}

async function approvedCampaign(
  db: SqliteD1,
  companyIds: string[],
  idempotencyKey = 'campaign_create_0001',
  template = 'Здравствуйте! Это согласованное предложение.',
) {
  const account = await getTelegramUserAccount(db.asD1(), ORG_A) ?? await connectedAccount(db);
  await bridgeVerifyBusinessCompanies(db, account.id, ORG_A, companyIds);
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
    minIntervalSeconds: 120,
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
    minIntervalSeconds: 120,
    now: NOW,
  });
}


const PUBLIC_MIGRATION = '0081_lead_radar_public_business_inquiry.sql';
function applyPublicMigration(db: SqliteD1): void {
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec(readFileSync(path.join(ROOT, 'migrations', PUBLIC_MIGRATION), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(PUBLIC_MIGRATION);
    db.exec('COMMIT;');
  } catch (error) { db.exec('ROLLBACK;'); throw error; }
}

test('0081 local schema fingerprint', async () => {
  const db = database(); applyPublicMigration(db);
  assert.equal(await telegramCampaignSchemaFingerprint(db.asD1()), TELEGRAM_PUBLIC_INQUIRY_SCHEMA_FINGERPRINT);
  assert.equal(await hasRuntimeTelegramCampaignSchema(db.asD1(), true), true);
  assert.equal((await auditTelegramCampaignSchema(db.asD1())).status, 'pass');
});

const PUBLIC_BASIS = 'public_business_inquiry' as const;
const PUBLIC_FLAGS = { publicBusinessInquiryEnabled: true };
const REBUILT_TABLES = [
  'lead_radar_tg_campaign_approvals', 'lead_radar_tg_campaigns', 'lead_radar_tg_contact_authorizations',
  'lead_radar_tg_recipient_eligibility', 'lead_radar_tg_campaign_recipients', 'lead_radar_tg_campaign_effects',
  'lead_radar_tg_campaign_operations', 'lead_radar_tg_campaign_safety', 'lead_radar_tg_recipient_business_identities',
  'lead_radar_tg_campaign_approval_media', 'lead_radar_tg_campaign_media', 'lead_radar_audience_campaigns',
];

function authorizing(db: SqliteD1, companyId = 'public_company') {
  return { db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, companyId,
    contactBasis: PUBLIC_BASIS, evidenceReference: `https://${companyId}.example/contact`,
    expiresAt: '2026-09-01T12:00:00.000Z', reviewerId: 'owner@example.test',
    idempotencyKey: `public_authorize_${companyId}`, now: NOW, ...PUBLIC_FLAGS };
}

async function publicPreparation(db: SqliteD1) {
  addCompany(db, { id: 'public_company', username: 'PublicCompany' });
  const account = await connectedAccount(db);
  await authorizeTelegramCampaignContact(authorizing(db));
  const input = { db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_public_company', companyIds: ['public_company'],
    template: 'Здравствуйте, {company_name}. Подскажите, актуальна ли автоматизация? Если нет, больше писать не будем.',
    operatorId: 'owner@example.test', contactBasis: PUBLIC_BASIS,
    idempotencyKey: 'public_prepare_0001', minIntervalSeconds: 120, now: NOW, ...PUBLIC_FLAGS };
  const prepared = await prepareTelegramCampaign(input);
  return { ...input, idempotencyKey: 'public_create_0001', approvalToken: prepared.approvalToken,
    expectedSelectionDigest: prepared.selectionDigest, expectedContentDigest: prepared.contentDigest };
}

async function runningPublic(db: SqliteD1) {
  const input = await publicPreparation(db);
  const created = await createApprovedTelegramCampaign(input);
  await transitionTelegramCampaign({ db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'public_start_0001', now: NOW, ...PUBLIC_FLAGS });
  return { input, created };
}

function snapshot(db: SqliteD1, tables: readonly string[]) {
  return Object.fromEntries(tables.map((table) => [table, db.rows(`SELECT * FROM ${table}`)
    .map((row) => JSON.stringify(row)).sort()]));
}

function pendingOptOut(db: SqliteD1): void {
  db.exec(`INSERT INTO lead_radar_outreach_inbox
    (id,org_id,account_id,campaign_id,recipient_id,company_id,outbound_effect_id,external_event_digest,
     payload_digest,kind,occurred_at,received_at,body_expires_at,body_present)
    SELECT 'lrinb_'||lower(hex(randomblob(16))),c.org_id,c.account_id,c.id,r.id,r.company_id,e.id,
      '${'8'.repeat(64)}','${'9'.repeat(64)}','opt_out','${NOW.toISOString()}','${NOW.toISOString()}',
      '2026-09-01T12:00:00.000Z',0
    FROM lead_radar_tg_campaigns c JOIN lead_radar_tg_campaign_recipients r ON r.campaign_id=c.id
    JOIN lead_radar_tg_campaign_effects e ON e.recipient_id=r.id LIMIT 1`);
}

async function richLegacyGraph(db: SqliteD1) {
  addCompany(db, { id: 'roundtrip_company', username: 'RoundtripCompany' });
  const created = await approvedCampaign(db, ['roundtrip_company']);
  await transitionTelegramCampaign({ db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'roundtrip_start_0001', now: NOW });
  const mediaId = `lrtgcm_${'5'.repeat(32)}`, mediaDigest = 'c'.repeat(64);
  await new LeadRadarTelegramCampaignStore(db.asD1()).registerCampaignMediaObject(ORG_A, {
    mediaId, mediaDigest, expiresAt: '2026-09-24T12:00:00.000Z', now: NOW.toISOString(),
  });
  db.sqlite.prepare(`INSERT INTO lead_radar_tg_campaign_approval_media
    SELECT approval_id,org_id,?,? FROM lead_radar_tg_campaigns`).run(mediaId, mediaDigest);
  db.sqlite.prepare(`INSERT INTO lead_radar_tg_campaign_media
    SELECT id,org_id,?,? FROM lead_radar_tg_campaigns`).run(mediaId, mediaDigest);
  const audienceId = `aud_${'4'.repeat(32)}`;
  db.sqlite.prepare(`INSERT INTO lead_radar_audiences
    (org_id,id,name,version,company_ids_json,created_at,updated_at) VALUES (?,?,?,1,?,?,?)`)
    .run(ORG_A,audienceId,'Migration fixture',JSON.stringify(['roundtrip_company']),NOW.toISOString(),NOW.toISOString());
  db.sqlite.prepare(`INSERT INTO lead_radar_audience_campaigns
    (org_id,campaign_id,audience_id,audience_version,company_ids_json) VALUES (?,?,?,1,?)`)
    .run(ORG_A,created.campaign.id,audienceId,JSON.stringify(['roundtrip_company']));
  pendingOptOut(db);
  return created;
}

test('0081 preserves a nonempty full graph, ciphertext, inbox, indexes and FKs exactly', async () => {
  const db = database([...MIGRATIONS, '0080_lead_radar_outreach_inbox.sql']);
  await richLegacyGraph(db);
  const tables = [...REBUILT_TABLES, 'lead_radar_outreach_inbox', 'lead_radar_tg_user_accounts', 'lead_radar_tg_media_objects'];
  const before = snapshot(db,tables);
  for (const table of tables) assert.ok(before[table].length > 0, `${table} must exercise populated migration`);
  const indexes = db.rows("SELECT name,sql FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL ORDER BY name");
  const foreignKeys = Object.fromEntries(tables.map((table) => [table,db.rows(`PRAGMA foreign_key_list(${table})`)]));
  applyPublicMigration(db);
  assert.deepEqual(snapshot(db,tables),before);
  assert.deepEqual(db.rows("SELECT name,sql FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL ORDER BY name"),indexes);
  assert.deepEqual(Object.fromEntries(tables.map((table) => [table,db.rows(`PRAGMA foreign_key_list(${table})`)])),foreignKeys);
  assert.deepEqual(db.rows('PRAGMA foreign_key_check'),[]);
  assert.equal(db.value("SELECT COUNT(*) FROM sqlite_schema WHERE name LIKE '%0081_backup'"),0);
  assert.equal(await hasRuntimeTelegramCampaignSchema(db.asD1(),true),true);
  for (const table of REBUILT_TABLES.filter((table) => ['lead_radar_tg_campaign_approvals','lead_radar_tg_campaigns','lead_radar_tg_contact_authorizations','lead_radar_tg_recipient_eligibility'].includes(table))) {
    assert.throws(() => db.exec(`UPDATE ${table} SET contact_basis='invented_permission'`), /CHECK constraint/);
  }
});

test('0081 failure rolls back the entire nonempty graph and migration ledger', async () => {
  const db = database([...MIGRATIONS, '0080_lead_radar_outreach_inbox.sql']);
  await richLegacyGraph(db);
  const tables = [...REBUILT_TABLES,'lead_radar_outreach_inbox'];
  const before = snapshot(db,tables);
  const sql = readFileSync(path.join(ROOT,'migrations',PUBLIC_MIGRATION),'utf8').replace('THEN 1 ELSE 0 END;','THEN 0 ELSE 0 END;');
  db.exec('BEGIN IMMEDIATE;');
  assert.throws(() => db.exec(sql),/CHECK constraint/);
  db.exec('ROLLBACK;');
  assert.deepEqual(snapshot(db,tables),before);
  assert.equal(db.value('SELECT COUNT(*) FROM d1_migrations WHERE name=?',PUBLIC_MIGRATION),0);
  assert.equal(await hasRuntimeTelegramCampaignSchema(db.asD1()),true);
});

test('public inquiry is off by default, requires 0081, and never turns a URL into consent', async () => {
  const old = database();
  await assert.rejects(authorizeTelegramCampaignContact(authorizing(old)),/not_configured/);
  const db = database(); applyPublicMigration(db);
  addCompany(db,{id:'public_company',username:'PublicCompany'});
  await connectedAccount(db);
  await assert.rejects(authorizeTelegramCampaignContact({...authorizing(db),publicBusinessInquiryEnabled:false}),/not_configured/);
  for (const reference of ['owner-approved-string','https://unrelated.example/contact','http://public_company.example/contact','https://public_company.example/contact#fake']) {
    await assert.rejects(authorizeTelegramCampaignContact({...authorizing(db),evidenceReference:reference}));
  }
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_contact_authorizations'),0);
  const granted = await authorizeTelegramCampaignContact(authorizing(db));
  assert.equal(granted.authorization.basis,PUBLIC_BASIS);
  assert.equal(granted.authorization.evidenceVersion,PUBLIC_BUSINESS_INQUIRY_VERSION);
  assert.equal(db.value('SELECT contact_basis FROM lead_radar_tg_contact_authorizations'),PUBLIC_BASIS);
  await assert.rejects(authorizeTelegramCampaignContact({...authorizing(db),orgId:ORG_B}),/eligibility_required/);
});

test('public inquiry requires exact first-party evidence even with an opaque provider ref', async () => {
  const db=database(); addCompany(db,{id:'public_company',username:'PublicCompany'});
  const saved=JSON.parse(String(db.value("SELECT telegram_contact_json FROM lead_radar_companies WHERE id='public_company'")));
  const input={db:db.asD1(),orgId:ORG_A,companies:[{companyId:'public_company',website:'https://public_company.example/',contact:saved}],now:NOW};
  assert.ok((await publicBusinessInquiryEvidenceUrls(input)).has('public_company'));
  saved.peerRef=`lrpeer:${'a'.repeat(32)}`; saved.reason='bridge_resolved_corporate';
  assert.ok((await publicBusinessInquiryEvidenceUrls(input)).has('public_company'));
  for(const type of ['human','bot','channel','group','unknown']) {
    assert.equal((await publicBusinessInquiryEvidenceUrls({...input,companies:[{...input.companies[0],contact:{...saved,type}}]})).size,0);
  }
  assert.equal((await publicBusinessInquiryEvidenceUrls({...input,companies:[{...input.companies[0],contact:{...saved,username:''}}]})).size,0);
  db.exec("UPDATE lead_radar_evidence SET source_type='official_open_data' WHERE field_path='web.telegram.business'");
  assert.equal((await publicBusinessInquiryEvidenceUrls(input)).size,0);
});

test('public campaign freezes exact audience/text; first contact rejects media and disabled starts', async () => {
  const db=database();applyPublicMigration(db);const input=await publicPreparation(db);
  await assert.rejects(createApprovedTelegramCampaign({...input,template:'Changed after owner approval'}));
  await assert.rejects(prepareTelegramCampaign({...input,attachment:{mediaId:`lrtgcm_${'4'.repeat(32)}`,mediaDigest:'a'.repeat(64)}}),/invalid_input/);
  const created=await createApprovedTelegramCampaign(input);
  const start={db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,campaignId:created.campaign.id,action:'start' as const,
    operatorId:'owner@example.test',idempotencyKey:'public_start_0001',now:NOW};
  await assert.rejects(transitionTelegramCampaign(start),/not_configured/);
  await transitionTelegramCampaign({...start,...PUBLIC_FLAGS});
  await assert.rejects(claimNextTelegramCampaignRecipient({...start}),/not_configured/);
  const claim=await claimNextTelegramCampaignRecipient({...start,...PUBLIC_FLAGS});assert.ok(claim);
  let calls=0;
  const result=await dispatchClaimedTelegramCampaignRecipient({...start,claim,sender:{send:async()=>{calls++;return {kind:'sent',providerMessageId:'must-not-send'};}}});
  assert.equal(result.status,'paused');assert.equal(calls,0);
  assert.equal(db.value('SELECT daily_reserved_count FROM lead_radar_tg_user_accounts'),0);
});

test('a public first contact carries exact approval proof and global history prevents a second campaign', async () => {
  const db=database();applyPublicMigration(db);const {created,input}=await runningPublic(db);
  const claim=await claimNextTelegramCampaignRecipient({...input,campaignId:created.campaign.id});assert.ok(claim);
  let sent: Parameters<TelegramCampaignSender['send']>[0] | undefined;
  const delivered=await dispatchClaimedTelegramCampaignRecipient({...input,claim,sender:{send:async(payload)=>{
    sent=payload;return {kind:'sent',providerMessageId:'public-first-message'};
  }}});
  assert.equal(delivered.status,'sent');assert.ok(sent?.authorization?.publicInquiry);
  assert.equal(sent.authorization.basis,PUBLIC_BASIS);assert.equal(sent.media,null);
  assert.equal(sent.authorization.publicInquiry.policyVersion,PUBLIC_BUSINESS_INQUIRY_VERSION);
  assert.equal(sent.authorization.publicInquiry.firstContactOnly,true);
  assert.match(sent.authorization.publicInquiry.approvalId,/^lrtgap_[0-9a-f]{32}$/);
  assert.equal(sent.authorization.publicInquiry.sourceUrlDigest,db.value('SELECT evidence_reference_digest FROM lead_radar_tg_contact_authorizations'));
  assert.equal(sent.authorization.publicInquiry.selectionDigest,input.expectedSelectionDigest);
  assert.equal(sent.authorization.publicInquiry.contentDigest,input.expectedContentDigest);
  assert.equal(sent.authorization.publicInquiry.recipientId,claim.recipientId);
  await assert.rejects(prepareTelegramCampaign({...input,idempotencyKey:'public_second_prepare'}),/eligibility_required/);
  assert.equal((await evaluateTelegramCampaignSelection(input)).items[0].reasonCode,'already_contacted');
});

test('removed or substituted source evidence prevents dispatch despite an old valid authorization', async () => {
  const db=database();applyPublicMigration(db);const {created,input}=await runningPublic(db);
  const claim=await claimNextTelegramCampaignRecipient({...input,campaignId:created.campaign.id});assert.ok(claim);
  db.exec("UPDATE lead_radar_evidence SET source_url='https://public_company.example/different' WHERE field_path='web.telegram.business'");
  let calls=0;
  const delivered=await dispatchClaimedTelegramCampaignRecipient({...input,claim,sender:{send:async()=>{calls++;return {kind:'sent',providerMessageId:'bad'};}}});
  assert.equal(delivered.status,'skipped_stale');assert.equal(calls,0);
});

test('queue flag-off pauses public campaign without transport calls or retry loop', async () => {
  const db=database();applyPublicMigration(db);const {created,input}=await runningPublic(db);
  const row=db.rows<{state_version:number}>("SELECT state_version FROM lead_radar_tg_campaigns")[0];
  const result=await consumeTelegramCampaignQueueMessage({...input,publicBusinessInquiryEnabled:false,
    raw:{schema:'gptbot.lead-radar.telegram-campaign.v1',org_id:ORG_A,campaign_id:created.campaign.id,state_version:row.state_version},
    sender:{send:async()=>{throw new Error('must not send');}}});
  assert.equal(result.next,null);assert.equal(result.disposition,'idle');
  assert.equal(db.value('SELECT status FROM lead_radar_tg_campaigns'),'paused');
});


test('0081 refuses unknown downstream FK tables before any graph mutation', async () => {
  const db=database();
  db.exec('CREATE TABLE unexpected_campaign_child (org_id TEXT,campaign_id TEXT, FOREIGN KEY(org_id,campaign_id) REFERENCES lead_radar_tg_campaigns(org_id,id))');
  await assert.rejects(async()=>applyPublicMigration(db),/CHECK constraint/);
  assert.equal(db.value("SELECT COUNT(*) FROM sqlite_schema WHERE name='lead_radar_tg_campaigns'"),1);
  assert.equal(db.value("SELECT COUNT(*) FROM sqlite_schema WHERE name LIKE '%0081_backup'"),0);
});

test('new schema fingerprint and ledger must agree, and schema drift never passes', async () => {
  const db=database();applyPublicMigration(db);
  db.sqlite.prepare('DELETE FROM d1_migrations WHERE name=?').run(PUBLIC_MIGRATION);
  assert.equal(await hasRuntimeTelegramCampaignSchema(db.asD1(),true),false);
  assert.equal((await auditTelegramCampaignSchema(db.asD1())).status,'blocked');
  db.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(PUBLIC_MIGRATION);
  db.exec('CREATE INDEX unexpected_campaign_index ON lead_radar_tg_campaigns (org_id,status)');
  assert.equal(await hasRuntimeTelegramCampaignSchema(db.asD1(),true),false);
});

test('server-pinned account ids are validated, fingerprinted, replay-safe and cannot replace an active account', async () => {
  const db=database();
  const input={db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,authRequestReference:'pinned_account_reference_0001',
    idempotencyKey:'pinned_request_0001',requestedAccountId:`lrtgua_${'6'.repeat(32)}`,now:NOW};
  const created=await createTelegramUserAccountPending(input);
  assert.equal(created.account.id,input.requestedAccountId);
  assert.equal((await createTelegramUserAccountPending(input)).replayed,true);
  await assert.rejects(createTelegramUserAccountPending({...input,requestedAccountId:`lrtgua_${'7'.repeat(32)}`}),/idempotency_conflict/);
  await assert.rejects(createTelegramUserAccountPending({...input,idempotencyKey:'pinned_request_0002'}),/account_exists/);
  await assert.rejects(createTelegramUserAccountPending({...input,requestedAccountId:'not-pinned'}),/invalid_input/);
});

test('pending opt-out prevents claim even after inbox feature flag is disabled', async () => {
  const db=database([...MIGRATIONS,'0080_lead_radar_outreach_inbox.sql']);applyPublicMigration(db);
  const {created,input}=await runningPublic(db);pendingOptOut(db);
  assert.equal(await claimNextTelegramCampaignRecipient({...input,campaignId:created.campaign.id,outreachInboxEnabled:false}),null);
  assert.equal(db.value('SELECT status FROM lead_radar_tg_campaigns'),'paused');
  assert.equal(db.value('SELECT daily_reserved_count FROM lead_radar_tg_user_accounts'),0);
});

test('enabled inbox with missing schema prevents reservation of a legacy consent campaign', async () => {
  const db=database();addCompany(db,{id:'legacy_inbox',username:'LegacyInbox'});
  const created=await approvedCampaign(db,['legacy_inbox']);
  await transitionTelegramCampaign({db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,campaignId:created.campaign.id,
    action:'start',operatorId:'owner@example.test',idempotencyKey:'legacy_inbox_start',now:NOW});
  assert.equal(await claimNextTelegramCampaignRecipient({db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,
    campaignId:created.campaign.id,outreachInboxEnabled:true,now:NOW}),null);
});

test('opt-out arriving after claim pauses without sending or making delivery ambiguous', async () => {
  const db=database([...MIGRATIONS,'0080_lead_radar_outreach_inbox.sql']);applyPublicMigration(db);
  const {created,input}=await runningPublic(db);
  const claim=await claimNextTelegramCampaignRecipient({...input,campaignId:created.campaign.id,outreachInboxEnabled:true});assert.ok(claim);
  pendingOptOut(db);let calls=0;
  const delivered=await dispatchClaimedTelegramCampaignRecipient({...input,claim,outreachInboxEnabled:false,
    sender:{send:async()=>{calls++;return {kind:'sent',providerMessageId:'bad'};}}});
  assert.equal(delivered.status,'paused');assert.equal(calls,0);
  assert.equal(db.value("SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients WHERE status='ambiguous'"),0);
});

test('opt-out arriving after effect reservation cancels effect and quota before provider', async () => {
  const db=database([...MIGRATIONS,'0080_lead_radar_outreach_inbox.sql']);applyPublicMigration(db);
  const {created,input}=await runningPublic(db);
  const claim=await claimNextTelegramCampaignRecipient({...input,campaignId:created.campaign.id});assert.ok(claim);
  const batch=db.batch.bind(db);let injected=false,calls=0;
  db.batch=async(statements)=>{
    const result=await batch(statements);
    if(!injected && statements.some((item)=>item.sql.includes("SET status = 'dispatching', attempt_count = 1"))) {
      injected=true;pendingOptOut(db);
    }
    return result;
  };
  const delivered=await dispatchClaimedTelegramCampaignRecipient({...input,claim,sender:{send:async()=>{calls++;return {kind:'sent',providerMessageId:'bad'};}}});
  assert.ok(injected);assert.equal(delivered.status,'paused');assert.equal(calls,0);
  assert.equal(db.value('SELECT daily_reserved_count FROM lead_radar_tg_user_accounts'),0);
  assert.equal(db.value('SELECT status FROM lead_radar_tg_campaign_effects'),'canceled');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_contact_history'),0);
});

for (const outcome of ['ambiguous','flood_wait'] as const) test(`public mode retains ${outcome} no-repeat/cooldown handling`, async () => {
  const db=database();applyPublicMigration(db);const {created,input}=await runningPublic(db);
  const claim=await claimNextTelegramCampaignRecipient({...input,campaignId:created.campaign.id});assert.ok(claim);
  let calls=0;
  const delivered=await dispatchClaimedTelegramCampaignRecipient({...input,claim,sender:{send:async()=>{
    calls++;return outcome==='ambiguous' ? {kind:'ambiguous'} : {kind:'rejected',code:'flood_wait',retryAfterSeconds:90000};
  }}});
  assert.equal(calls,1);assert.equal(delivered.campaign.status,'paused');
  if(outcome==='ambiguous') assert.equal(db.value("SELECT COUNT(*) FROM lead_radar_tg_contact_history WHERE state='ambiguous'"),4);
  else assert.equal(db.value('SELECT blocked_until FROM lead_radar_tg_account_safety'),new Date(NOW.getTime()+90000_000).toISOString());
  await assert.rejects(transitionTelegramCampaign({...input,campaignId:created.campaign.id,action:'resume',idempotencyKey:'public_bad_resume'}));
});


test('public queue execution keeps the existing D1 Free invocation budget', async (context) => {
  const db=database([...MIGRATIONS,'0080_lead_radar_outreach_inbox.sql']);applyPublicMigration(db);
  const {created,input}=await runningPublic(db);
  const row=db.rows<{state_version:number}>("SELECT state_version FROM lead_radar_tg_campaigns")[0];
  let statements=0;
  const prepare=db.prepare.bind(db),batch=db.batch.bind(db);
  db.prepare=(sql)=>{
    const statement=prepare(sql);
    for(const method of ['first','all','run'] as const) {
      const original=statement[method].bind(statement);
      Object.defineProperty(statement,method,{value:async()=>{statements++;return original();}});
    }
    return statement;
  };
  db.batch=async(items)=>{statements+=items.length;return batch(items);};
  const result=await consumeTelegramCampaignQueueMessage({...input,outreachInboxEnabled:true,
    raw:{schema:'gptbot.lead-radar.telegram-campaign.v1',org_id:ORG_A,campaign_id:created.campaign.id,state_version:row.state_version},
    sender:{send:async()=>({kind:'sent',providerMessageId:'budget-proof'})}});
  assert.equal(result.deliveryStatus,'sent');context.diagnostic(`public queue D1 statements: ${statements}`);
  assert.ok(statements<=50,`public queue D1 budget: ${statements}`);
});

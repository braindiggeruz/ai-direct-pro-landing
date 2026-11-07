import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { authorizeTelegramCampaignContact, completeTelegramUserAccountConnection, createApprovedTelegramCampaign,
  createTelegramUserAccountPending, getTelegramUserAccount, prepareTelegramCampaign, stageTelegramUserAccountConnection,
  type TelegramCampaignContactBasis } from '../../functions/platform/lead-radar/telegram-campaign';
import { checkCorporateTelegramContact } from '../../functions/platform/lead-radar/contact-resolution';
import { SqliteD1 } from './sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '../..');
export const MIGRATIONS = [
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
export const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export const NOW = new Date('2026-08-25T12:00:00.000Z');
export const DATA_KEY = Buffer.alloc(32, 9).toString('base64url');
const BASIS: TelegramCampaignContactBasis = 'existing_relationship';


export function database(migrations: readonly string[] = MIGRATIONS): SqliteD1 {
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

export function addCompany(db: SqliteD1, input: {
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

export async function connectedAccount(db: SqliteD1, orgId = ORG_A) {
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

export async function approvedCampaign(
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
export function applyPublicMigration(db: SqliteD1): void {
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec(readFileSync(path.join(ROOT, 'migrations', PUBLIC_MIGRATION), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(PUBLIC_MIGRATION);
    db.exec('COMMIT;');
  } catch (error) { db.exec('ROLLBACK;'); throw error; }
}


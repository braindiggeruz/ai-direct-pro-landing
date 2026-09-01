import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { confirmCompanyWebsiteOwnership } from '../functions/platform/lead-radar/ownership-confirmation';
import { checkCorporateTelegramContact, countResolvedCorporateContacts, nextTelegramContactCandidate } from '../functions/platform/lead-radar/contact-resolution';
import { completeTelegramUserAccountConnection, createTelegramUserAccountPending, stageTelegramUserAccountConnection } from '../functions/platform/lead-radar/telegram-campaign';
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
] as const;
const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = new Date('2026-08-25T12:00:00.000Z');
const DATA_KEY = Buffer.alloc(32, 9).toString('base64url');
const COMPANY_ID = 'company_ownership_fixture';

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL, default_locale TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  db.sqlite.prepare(`INSERT INTO organizations VALUES (?,'Fixture',?,'active','ru',?,?)`)
    .run(ORG_A, ORG_A, NOW.toISOString(), NOW.toISOString());
  for (const filename of new Set(MIGRATIONS)) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', filename), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(filename);
  }
  return db;
}

function seedOwnership(db: SqliteD1) {
  const searchId = 'search_ownership_fixture';
  db.sqlite.prepare(`INSERT INTO lead_radar_searches (id, org_id, input_json, status, phase, created_at)
    VALUES (?, ?, '{}', 'running', 'enriching', ?)`).run(searchId, ORG_A, NOW.toISOString());
  // A company whose own site publishes a Telegram link, but whose identity
  // evidence never reached the automatic first-party binding threshold.
  db.sqlite.prepare(`INSERT INTO lead_radar_companies (
    id, org_id, search_id, canonical_key, name, category, city, country,
    score, confidence, priority, score_components_json, signals_json,
    discovered_at, last_verified_at, updated_at, website,
    telegram_contact_json, lifecycle, suppressed
  ) VALUES (?, ?, ?, 'aksumed', 'Стоматология AksuMed', 'dentist', 'Ташкент', 'UZ',
    80, 0.9, 'P1', '[]', '[]', ?, ?, ?, 'https://clinic.uz', '{}', 'new', 0)`)
    .run(COMPANY_ID, ORG_A, searchId, NOW.toISOString(), NOW.toISOString(), NOW.toISOString());
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence (
    id, org_id, company_id, field_path, value, source_url, source_type, observed_at, confidence, classification
  ) VALUES ('ev_unknown', ?, ?, 'web.telegram.unknown', 'https://t.me/AksuMedClinic',
    'https://clinic.uz/contacts', 'company_website', ?, 0.6, 'fact')`)
    .run(ORG_A, COMPANY_ID, NOW.toISOString());
}

test('operator confirmation promotes an unconfirmed own-site endpoint into the strict corporate set', async (t) => {
  const db = database(); t.after(() => db.sqlite.close()); seedOwnership(db);
  const d1 = db.asD1();
  const searchId = 'search_ownership_fixture';
  const pending = await createTelegramUserAccountPending({
    db: d1, dataKey: DATA_KEY, orgId: ORG_A,
    authRequestReference: 'gateway_auth_request_a', idempotencyKey: 'ownership_account_0001', now: NOW,
  });
  await stageTelegramUserAccountConnection({
    db: d1, dataKey: DATA_KEY, orgId: ORG_A, accountId: pending.account.id,
    gatewayAccountRef: 'gateway_account_reference_a', expectedVersion: pending.account.stateVersion,
    providerConnectedAt: NOW.toISOString(), now: NOW,
  });
  const account = await completeTelegramUserAccountConnection({
    db: d1, dataKey: DATA_KEY, orgId: ORG_A, accountId: pending.account.id,
    gatewayAccountRef: 'gateway_account_reference_a', expectedVersion: pending.account.stateVersion, now: NOW,
  });

  async function resolveOnce(now: Date): Promise<string> {
    const next = await nextTelegramContactCandidate({
      db: d1, orgId: ORG_A, companyId: COMPANY_ID, accountId: account.id, now: now.toISOString(),
    });
    assert.ok(next.candidateKey, 'the type-only endpoint must stay lookup-eligible');
    const result = await checkCorporateTelegramContact({
      db: d1, orgId: ORG_A, searchId, companyId: COMPANY_ID,
      candidateKey: next.candidateKey!, accountId: account.id, now: now.toISOString(),
      resolve: async () => ({ status: 'resolved', username: 'AksuMedClinic', reason: 'regular_user_resolved', retryAfterSeconds: null }),
    });
    return result.status === 'resolved' ? (result.reason ?? '') : `status:${result.status}`;
  }

  // Legacy Bridge transport failures are retryable, not completed negatives.
  for (const [offset, reason] of [[1000, 'telegram_timeout'], [62_000, 'lookup_unconfirmed']] as const) {
    const checkTime = new Date(NOW.getTime() + offset).toISOString();
    const failed = await checkCorporateTelegramContact({db:d1,orgId:ORG_A,searchId,companyId:COMPANY_ID,
      candidateKey:'telegram:https://t.me/aksumedclinic',accountId:account.id,now:checkTime,
      resolve:async()=>({status:'unresolved',username:null,reason,retryAfterSeconds:null})});
    assert.equal(failed.status,'failed');
    assert.equal(failed.reason,reason);
    const next = await nextTelegramContactCandidate({db:d1,orgId:ORG_A,companyId:COMPANY_ID,accountId:account.id,now:checkTime});
    assert.equal(next.pending,true);assert.equal(next.retryAfterSeconds,60);
    assert.equal(await countResolvedCorporateContacts(d1,ORG_A,searchId,checkTime),0);
  }

  // Before confirmation: Bridge resolves the account, ownership stays unproven.
  const now1 = new Date(NOW.getTime() + 180_000);
  assert.equal(await resolveOnce(now1), 'username_exists_ownership_unconfirmed');
  assert.equal(JSON.parse(db.value<string>(
    'SELECT telegram_contact_json FROM lead_radar_companies WHERE id = ?', COMPANY_ID,
  ) ?? '{}')?.reason, 'bridge_resolved_unconfirmed');
  assert.equal(await countResolvedCorporateContacts(d1, ORG_A, searchId, now1.toISOString()), 0);

  // The operator confirms the source after eyeballing the page.
  const confirmation = { db: d1, orgId: ORG_A, companyId: COMPANY_ID, operatorId: 'owner@example.test', now: now1,
    candidateKey: 'telegram:https://t.me/aksumedclinic', robots: async () => null,
    readPage: async () => '<html><main><a href="https://t.me/AksuMedClinic">Telegram компании: напишите нам</a></main></html>' };
  const first = await confirmCompanyWebsiteOwnership(confirmation);
  assert.deepEqual(first, { confirmed: true, reason: 'confirmed', confirmedEndpoints: 1 });
  const repeat = await confirmCompanyWebsiteOwnership(confirmation);
  assert.equal(repeat.reason, 'already_confirmed', 'confirmation must be idempotent');

  // After confirmation the same endpoint resolves as a corporate contact and
  // counts toward the search goal — through the unchanged strict gates.
  const now2 = new Date(NOW.getTime() + 240_000);
  assert.equal(await resolveOnce(now2), 'regular_user_resolved');
  assert.equal(JSON.parse(db.value<string>(
    'SELECT telegram_contact_json FROM lead_radar_companies WHERE id = ?', COMPANY_ID,
  ) ?? '{}')?.reason, 'bridge_resolved_corporate');
  assert.equal(await countResolvedCorporateContacts(d1, ORG_A, searchId, now2.toISOString()), 1);
});

test('R4 promotes only the selected endpoint; concurrent confirmation is idempotent and fresh re-review refreshes proof',async(t)=>{
  const db=database();t.after(()=>db.sqlite.close());seedOwnership(db);
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence SELECT 'ev_sibling',org_id,company_id,field_path,
    'https://t.me/otherclinic',source_url,source_type,observed_at,confidence,classification FROM lead_radar_evidence WHERE id='ev_unknown'`).run();
  const input={db:db.asD1(),orgId:ORG_A,companyId:COMPANY_ID,operatorId:'operator',now:NOW,
    candidateKey:'telegram:https://t.me/aksumedclinic',robots:async()=>null,
    readPage:async()=>'<a href="https://t.me/AksuMedClinic">Telegram компании: напишите нам</a><a href="https://t.me/otherclinic">Telegram компании: напишите нам</a>'};
  const results=await Promise.all([confirmCompanyWebsiteOwnership(input),confirmCompanyWebsiteOwnership(input)]);
  assert.equal(results.filter(r=>r.confirmed).length,1);
  assert.equal(db.value("SELECT COUNT(*) FROM lead_radar_evidence WHERE field_path='web.telegram.business'"),1);
  const later=new Date(NOW.getTime()+86400000);
  assert.equal((await confirmCompanyWebsiteOwnership({...input,now:later})).confirmed,true);
  assert.equal(db.value("SELECT observed_at FROM lead_radar_evidence WHERE field_path='web.telegram.business'"),later.toISOString());
});

test('R4 refuses removed, unclear, personal, bot, channel, group and robots-denied evidence',async(t)=>{
  const db=database();t.after(()=>db.sqlite.close());seedOwnership(db);
  const base={db:db.asD1(),orgId:ORG_A,companyId:COMPANY_ID,operatorId:'operator',now:NOW,
    candidateKey:'telegram:https://t.me/aksumedclinic',robots:async()=>null};
  const pages=[
    '<p>Contact removed</p>',
    '<a href="https://t.me/AksuMedClinic">Telegram</a>',
    '<a href="https://t.me/AksuMedClinic">Наш канал</a>',
    '<a href="https://t.me/AksuMedClinic">Наша группа</a>',
    '<a href="https://t.me/AksuMedClinic">Telegram бот</a>',
    '<script type="application/ld+json">{"@type":"Person","name":"Иван Петров","sameAs":["https://t.me/AksuMedClinic"]}</script>',
  ];
  for(const html of pages) assert.equal((await confirmCompanyWebsiteOwnership({...base,readPage:async()=>html})).confirmed,false);
  assert.equal((await confirmCompanyWebsiteOwnership({...base,robots:async()=>'User-agent: *\nDisallow: /',
    readPage:async()=>{throw new Error('must not fetch');}})).reason,'source_unavailable');
  assert.equal(db.value("SELECT COUNT(*) FROM lead_radar_evidence WHERE field_path='web.telegram.business'"),0);
});

test('R4 rechecks DNC and website identity atomically after the network read',async(t)=>{
  const db=database();t.after(()=>db.sqlite.close());seedOwnership(db);
  const result=await confirmCompanyWebsiteOwnership({db:db.asD1(),orgId:ORG_A,companyId:COMPANY_ID,operatorId:'operator',now:NOW,
    candidateKey:'telegram:https://t.me/aksumedclinic',robots:async()=>null,readPage:async()=>{
      db.sqlite.prepare('UPDATE lead_radar_companies SET suppressed=1 WHERE id=?').run(COMPANY_ID);
      return '<a href="https://t.me/AksuMedClinic">Telegram компании: напишите нам</a>';
    }});
  assert.equal(result.confirmed,false);assert.equal(result.reason,'source_changed');
  assert.equal(db.value("SELECT COUNT(*) FROM lead_radar_evidence WHERE field_path='web.telegram.business'"),0);
});

test('fresh explicit sibling label confirms only its selected website endpoint, without outreach authorization', async(t) => {
  const db=database();t.after(()=>db.sqlite.close());seedOwnership(db);
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence SELECT 'ev_aaa_home',org_id,company_id,field_path,
    value,'https://clinic.uz/',source_type,observed_at,confidence,classification FROM lead_radar_evidence WHERE id='ev_unknown'`).run();
  const reads:string[]=[];
  const result=await confirmCompanyWebsiteOwnership({db:db.asD1(),orgId:ORG_A,companyId:COMPANY_ID,operatorId:'operator',now:NOW,
    candidateKey:'telegram:https://t.me/aksumedclinic',robots:async()=>null,
    readPage:async url=>{reads.push(url);return url==='https://clinic.uz/contacts'
      ? '<p><span>Если Вы не смогли дозвониться до нас, напишите нам в Telegram:</span></p>'
        + '<div><a href="https://t.me/AksuMedClinic"><img alt="Telegram" src="/tg.svg" /></a></div>'
      : '<a href="https://t.me/AksuMedClinic">Telegram</a>';}});
  assert.equal(result.confirmed,true);
  assert.deepEqual(reads,['https://clinic.uz/contacts'],'one observed contact page, no extra crawl or homepage ambiguity');
  assert.equal(db.value("SELECT COUNT(*) FROM lead_radar_evidence WHERE field_path='web.telegram.business'"),1);
  assert.equal(await countResolvedCorporateContacts(db.asD1(),ORG_A,'search_ownership_fixture',NOW.toISOString()),0);
});

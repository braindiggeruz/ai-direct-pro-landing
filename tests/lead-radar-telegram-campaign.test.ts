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
  getTelegramCampaignDataKeyIdentityState,
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
  stageTelegramUserAccountConnection,
  transitionTelegramCampaign,
  type TelegramCampaignContactBasis,
  type TelegramCampaignSender,
} from '../functions/platform/lead-radar/telegram-campaign';
import { auditTelegramCampaignSchema } from '../functions/platform/lead-radar/telegram-campaign-schema';
import { LeadRadarTelegramCampaignStore } from '../functions/platform/lead-radar/telegram-campaign-store';
import { AudienceStore } from '../functions/platform/lead-radar/audiences';
import { SqliteD1 } from './helpers/sqlite-d1';
import { checkCorporateTelegramContact, verifiedResolvedCorporateCompanies, countResolvedCorporateContacts, nextTelegramContactCandidate } from '../functions/platform/lead-radar/contact-resolution';
import { contactIdentityDigest } from '../functions/platform/lead-radar/contact-source-store';
import { extractPublicBusinessContacts } from '../functions/platform/lead-radar/public-contact-discovery';
import { ContactDiscoveryStore } from '../functions/platform/lead-radar/contact-discovery-store';
import { buildVerifiedTelegramCorporateDraftLink } from '../functions/platform/lead-radar/telegram-business';

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
] as const;
const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2026-08-25T12:00:00.000Z');
const DATA_KEY = Buffer.alloc(32, 9).toString('base64url');
const DATA_KEY_B = Buffer.alloc(32, 17).toString('base64url');
const BASIS: TelegramCampaignContactBasis = 'existing_relationship';

async function audiencePreparation(db:SqliteD1) {
  addCompany(db,{id:'aud_one',username:'AudienceOne'});
  addCompany(db,{id:'aud_two',username:'AudienceTwo'});
  const account=await connectedAccount(db);
  const resolvedRows=db.rows<{id:string;telegram_contact_json:string}>(
    "SELECT id,telegram_contact_json FROM lead_radar_companies WHERE id IN ('aud_one','aud_two') ORDER BY id",
  );
  assert.deepEqual([...await verifiedResolvedCorporateCompanies({db:db.asD1(),orgId:ORG_A,
    companies:resolvedRows.map((row)=>({companyId:row.id,contact:JSON.parse(row.telegram_contact_json)})),now:NOW})].sort(),['aud_one','aud_two']);
  for(const companyId of ['aud_one','aud_two']) await authorizeTelegramCampaignContact({
    db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,companyId,contactBasis:BASIS,
    evidenceReference:`fixture-audience-${companyId}`,expiresAt:'2026-09-01T12:00:00.000Z',
    reviewerId:'owner@example.test',idempotencyKey:`audience_authorization_${companyId}`,now:NOW,
  });
  const saved=await new AudienceStore(db.asD1()).save(ORG_A,{id:'aud_'+'a'.repeat(32),name:'Mixed searches',version:0,companyIds:['aud_one','aud_two']},NOW);
  const input={db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,accountId:account.id,
    searchId:'search_aud_one',audience:{audienceId:saved.id,audienceVersion:saved.version},companyIds:saved.companyIds,
    template:'Здравствуйте, {company_name}. Согласованный пример.',operatorId:'owner@example.test',
    contactBasis:BASIS,idempotencyKey:'audience_prepare_0001',minIntervalSeconds:120,now:NOW};
  const prepared=await prepareTelegramCampaign(input);
  return {...input,idempotencyKey:'audience_create_0001',approvalToken:prepared.approvalToken,
    expectedSelectionDigest:prepared.selectionDigest,expectedContentDigest:prepared.contentDigest};
}

test('audience campaigns freeze mixed-search membership and recover independently, without sending',async()=>{
  const db=database([...MIGRATIONS,'0051_lead_radar_audiences.sql','0053_lead_radar_audience_selection.sql']);
  const input=await audiencePreparation(db);
  const created=await createApprovedTelegramCampaign(input);
  assert.equal(created.campaign.status,'approved');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lead_radar_tg_campaign_recipients WHERE campaign_id=?').get(created.campaign.id)!.n,2);
  const snapshot=db.sqlite.prepare('SELECT * FROM lead_radar_audience_campaigns WHERE org_id=?').get(ORG_A)!;
  assert.equal(snapshot.audience_version,1);assert.deepEqual(JSON.parse(String(snapshot.company_ids_json)),['aud_one','aud_two']);
  assert.equal((await createApprovedTelegramCampaign(input)).replayed,true);
  assert.equal((await getTelegramCampaignRecovery({db:db.asD1(),orgId:ORG_A,audienceId:input.audience.audienceId,now:NOW})).active?.id,created.campaign.id);
  assert.equal((await getTelegramCampaignRecovery({db:db.asD1(),orgId:ORG_A,searchId:'search_aud_one',now:NOW})).active,null);
  assert.equal((await getTelegramCampaignRecovery({db:db.asD1(),orgId:ORG_B,audienceId:input.audience.audienceId,now:NOW})).active,null);
});
test('audience edits invalidate the exact approval even if an operator supplies the new version',async()=>{
  const db=database([...MIGRATIONS,'0051_lead_radar_audiences.sql','0053_lead_radar_audience_selection.sql']);const input=await audiencePreparation(db);
  const store=new AudienceStore(db.asD1());
  await store.save(ORG_A,{id:input.audience.audienceId,name:'Changed',version:1,companyIds:['aud_one','aud_two']},NOW);
  await assert.rejects(createApprovedTelegramCampaign(input),/audience_version_conflict/);
  await assert.rejects(createApprovedTelegramCampaign({...input,audience:{...input.audience,audienceVersion:2}}));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lead_radar_tg_campaigns').get()!.n,0);
});
test('audience version race at approval consumption rolls back the entire transaction',async()=>{
  const db=database([...MIGRATIONS,'0051_lead_radar_audiences.sql','0053_lead_radar_audience_selection.sql']);const input=await audiencePreparation(db);
  const batch=db.batch.bind(db);
  db.batch=async(statements)=>{
    if(statements.some((statement)=>statement.sql.includes('UPDATE lead_radar_tg_campaign_approvals'))) {
      db.sqlite.prepare('UPDATE lead_radar_audiences SET version=version+1 WHERE org_id=?').run(ORG_A);
    }
    return batch(statements);
  };
  await assert.rejects(createApprovedTelegramCampaign(input));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lead_radar_tg_campaigns').get()!.n,0);
  assert.equal(db.sqlite.prepare('SELECT consumed_at FROM lead_radar_tg_campaign_approvals').get()!.consumed_at,null);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lead_radar_audience_campaigns').get()!.n,0);
});

test('a 50-contact audience stays inside the D1 statement budget with API headroom',async(context)=>{
  const db=database([...MIGRATIONS,'0051_lead_radar_audiences.sql','0053_lead_radar_audience_selection.sql']);
  const account=await connectedAccount(db);
  const companyIds=Array.from({length:50},(_,index)=>`aud_budget_${index}`);
  for(const [index,companyId] of companyIds.entries()) {
    addCompany(db,{id:companyId,username:`AudienceBudget${index}`});
    await authorizeTelegramCampaignContact({db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,companyId,
      contactBasis:BASIS,evidenceReference:`fixture-${companyId}`,expiresAt:'2026-09-01T12:00:00.000Z',
      reviewerId:'owner@example.test',idempotencyKey:`authorization_${companyId}`,now:NOW});
  }
  await bridgeVerifyBusinessCompanies(db,account.id,ORG_A,companyIds);
  const extraIds=Array.from({length:10},(_,i)=>`aaa_extra_${i}`);
  extraIds.forEach((id,i)=>addCompany(db,{id,username:`ExtraAudience${i}`}));
  const audience=await new AudienceStore(db.asD1()).save(ORG_A,{id:'aud_'+'b'.repeat(32),name:'Sixty contacts, fifty in campaign',version:0,companyIds:[...extraIds,...companyIds]},NOW);
  let statements=0;
  const originalPrepare=db.prepare.bind(db),originalBatch=db.batch.bind(db);
  db.prepare=(sql)=>{
    const statement=originalPrepare(sql);
    for(const method of ['first','all','run'] as const) {
      const original=statement[method].bind(statement);
      // Count execution, not preparation; batch execution is counted below.
      Object.defineProperty(statement,method,{value:async()=>{statements++;return original();}});
    }
    return statement;
  };
  db.batch=async(items)=>{statements+=items.length;return originalBatch(items);};
  const input={db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,accountId:account.id,searchId:'search_aud_budget_0',
    audience:{audienceId:audience.id,audienceVersion:audience.version},companyIds,
    template:'Здравствуйте, {company_name}. Согласованный пример.',operatorId:'owner@example.test',
    contactBasis:BASIS,idempotencyKey:'audience_budget_prepare',minIntervalSeconds:120,now:NOW};
  const prepared=await prepareTelegramCampaign(input);
  const preparationStatements=statements;statements=0;
  const created=await createApprovedTelegramCampaign({...input,idempotencyKey:'audience_budget_create',
    approvalToken:prepared.approvalToken,expectedSelectionDigest:prepared.selectionDigest,expectedContentDigest:prepared.contentDigest});
  context.diagnostic(`50-contact audience: prepare=${preparationStatements}, create=${statements}; 15 statements reserved for API guards`);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients WHERE campaign_id=?',created.campaign.id),50);
  assert.equal(audience.companyIds.length,60);
  assert.equal(JSON.parse(String(db.value('SELECT company_ids_json FROM lead_radar_audience_campaigns'))).length,50);
  assert.ok(preparationStatements+15<=50,`audience prepare D1 budget: ${preparationStatements}+15`);
  assert.ok(statements+15<=50,`audience create D1 budget: ${statements}+15`);
});

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

function setVerifiedCorporateDomain(
  db: SqliteD1,
  companyId: string,
  hostname: string,
  canonicalKey?: string,
): void {
  const website = `https://${hostname}/`;
  db.sqlite.prepare(`UPDATE lead_radar_companies
    SET website = ?, domain = ?, canonical_key = COALESCE(?, canonical_key), updated_at = ?
    WHERE org_id = ? AND id = ?`)
    .run(website, hostname, canonicalKey ?? null, NOW.toISOString(), ORG_A, companyId);
  db.sqlite.prepare(`UPDATE lead_radar_evidence SET source_url = ?
    WHERE org_id = ? AND company_id = ? AND field_path = 'web.telegram.business'`)
    .run(`${website}contact`, ORG_A, companyId);
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence (
    id, org_id, company_id, field_path, value, source_url, source_type,
    observed_at, confidence, classification
  ) VALUES (?, ?, ?, 'web.website', ?, ?, 'company_website', ?, 0.95, 'fact')`)
    .run(
      `evidence_domain_${companyId}`,
      ORG_A,
      companyId,
      website,
      `${website}contact`,
      NOW.toISOString(),
    );
}

test('all published candidates advance durably past a failed and a negative first pair',async()=>{
  const db=database([...MIGRATIONS,'0050_lead_radar_contact_discovery.sql']);
  const account=await connectedAccount(db);
  addCompany(db,{id:'progress',username:'clinic_first'}); setVerifiedCorporateDomain(db,'progress','progress.example');
  for (const [i,username] of ['clinic_second','clinic_third'].entries()) db.sqlite.prepare(`INSERT INTO lead_radar_evidence
    (id,org_id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification)
    VALUES (?,?,'progress','web.telegram.business',?,'https://progress.example/contact','company_website',?,.95,'fact')`)
    .run(`more_${i}`,ORG_A,`https://t.me/${username}`,NOW.toISOString());
  const selection={db:db.asD1(),orgId:ORG_A,companyId:'progress',accountId:account.id,now:NOW.toISOString()};
  const visited:string[]=[];
  for (let step=0;step<3;step++) {
    const next=await nextTelegramContactCandidate(selection); assert.ok(next.candidateKey);
    visited.push(next.candidateKey);
    await checkCorporateTelegramContact({...selection,searchId:'search_progress',candidateKey:next.candidateKey,
      resolve:async()=>step===0 ? {status:'failed',username:null,reason:'temporary_failure',retryAfterSeconds:null}
        : step===1 ? {status:'unsupported',username:null,reason:'not_regular_user',retryAfterSeconds:null}
          : {status:'resolved',username:'clinic_third',reason:'regular_user_resolved',retryAfterSeconds:null}});
  }
  assert.equal(new Set(visited).size,3);
  assert.deepEqual(await nextTelegramContactCandidate(selection),{pending:false});
  assert.equal(JSON.parse(String(db.value("SELECT telegram_contact_json FROM lead_radar_companies WHERE id='progress'"))).username,'clinic_third');
});

test('a public OSM username can be type-checked without granting corporate ownership',async()=>{
  const db=database([...MIGRATIONS,'0050_lead_radar_contact_discovery.sql']);
  addCompany(db,{id:'typecheck',username:'unconfirmed_user',type:'unknown'});
  db.exec("UPDATE lead_radar_companies SET website=NULL WHERE id='typecheck'");
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence(id,org_id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification)
    VALUES ('public_osm',?,'typecheck','web.telegram.unknown','https://t.me/unconfirmed_user','https://www.openstreetmap.org/node/123','openstreetmap',?,.4,'model_inference')`).run(ORG_A,NOW.toISOString());
  const account=await connectedAccount(db);
  const base={db:db.asD1(),orgId:ORG_A,companyId:'typecheck',accountId:account.id,now:NOW.toISOString()};
  const next=await nextTelegramContactCandidate(base);assert.ok(next.candidateKey);
  const result=await checkCorporateTelegramContact({...base,searchId:'search_typecheck',candidateKey:next.candidateKey,
    resolve:async()=>({status:'resolved',username:'unconfirmed_user',reason:'regular_user_resolved',retryAfterSeconds:null})});
  assert.equal(result.reason,'username_exists_ownership_unconfirmed');
  const saved=JSON.parse(String(db.value("SELECT telegram_contact_json FROM lead_radar_companies WHERE id='typecheck'")));
  assert.equal(saved.type,'unknown');
  assert.equal(await countResolvedCorporateContacts(db.asD1(),ORG_A,'search_typecheck',NOW.toISOString()),0);
  assert.equal((await verifiedResolvedCorporateCompanies({db:db.asD1(),orgId:ORG_A,companies:[{companyId:'typecheck',contact:saved}],now:NOW})).size,0);
  assert.deepEqual(await nextTelegramContactCandidate(base),{pending:false});
});

test('listing-bound user without a website reaches sender proof but never bypasses authorization or changed identity',async()=>{
  const db=database([...MIGRATIONS,'0050_lead_radar_contact_discovery.sql','0052_lead_radar_contact_sources.sql']);
  addCompany(db,{id:'listing',username:'old_unknown',type:'unknown'});
  db.exec("UPDATE lead_radar_companies SET website=NULL,phone='+998711234567' WHERE id='listing'");
  const identity={name:'Company listing',city:'Tashkent',address:null,phone:'+998711234567'};
  const source=await extractPublicBusinessContacts('https://clinics.uz/catalog/company-listing',
    `<script type="application/ld+json">${JSON.stringify({'@type':'Dentist',name:identity.name,telephone:identity.phone,sameAs:'https://t.me/listing_booking'})}</script>`,identity,NOW.toISOString());
  assert.ok(source);
  db.sqlite.prepare(`INSERT INTO lead_radar_contact_enrichments(org_id,company_id,job_id,identity_digest,status,reason,sources_json,checked_at,expires_at)
    VALUES (?,'listing','fixture',?,'complete','public_contact_candidates',?,?,?)`).run(ORG_A,await contactIdentityDigest(identity),JSON.stringify([source]),NOW.toISOString(),new Date(NOW.getTime()+86400_000).toISOString());
  const account=await connectedAccount(db);
  const result=await checkCorporateTelegramContact({db:db.asD1(),orgId:ORG_A,companyId:'listing',searchId:'search_listing',candidateKey:source.candidates[0].key,accountId:account.id,now:NOW.toISOString(),
    resolve:async()=>({status:'resolved',username:'listing_booking',reason:'regular_user_resolved',retryAfterSeconds:null})});
  assert.equal(result.status,'resolved');
  const contact=JSON.parse(String(db.value("SELECT telegram_contact_json FROM lead_radar_companies WHERE id='listing'")));
  const input={db:db.asD1(),orgId:ORG_A,companies:[{companyId:'listing',contact}],now:NOW};
  assert.ok((await verifiedResolvedCorporateCompanies(input)).has('listing'));
  assert.ok(await buildVerifiedTelegramCorporateDraftLink({db:db.asD1(),orgId:ORG_A,companyId:'listing',contact,website:null,draft:'fixture',now:NOW}));
  assert.equal((await evaluateTelegramCampaignSelection({db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,accountId:account.id,companyIds:['listing'],now:NOW})).automatic,0);
  db.exec("UPDATE lead_radar_companies SET name='Different business' WHERE id='listing'");
  assert.equal((await verifiedResolvedCorporateCompanies(input)).size,0);
});

test('listing name-only evidence permits type checking but never qualifies for the sender',async()=>{
  const db=database([...MIGRATIONS,'0050_lead_radar_contact_discovery.sql','0052_lead_radar_contact_sources.sql']);
  addCompany(db,{id:'weak_listing',username:'old_unknown',type:'unknown'});
  db.exec("UPDATE lead_radar_companies SET website=NULL,phone=NULL WHERE id='weak_listing'");
  const identity={name:'Company weak_listing',city:'Tashkent',address:null,phone:null};
  const source={id:'lrcs_fixture',kind:'business_listing',url:'https://top.uz/company/weak-listing',observedAt:NOW.toISOString(),
    candidates:[{key:'telegram:https://t.me/review_user',kind:'telegram',value:'https://t.me/review_user',phoneType:null,
      ownership:'unconfirmed',lookupEligible:true,reason:'ownership_unconfirmed',sourceUrl:'https://top.uz/company/weak-listing',evidenceIds:['lrcs_fixture'],observedAt:NOW.toISOString()}]};
  db.sqlite.prepare(`INSERT INTO lead_radar_contact_enrichments(org_id,company_id,job_id,identity_digest,status,reason,sources_json,checked_at,expires_at)
    VALUES (?,'weak_listing','fixture',?,'complete','public_contact_candidates',?,?,?)`).run(ORG_A,await contactIdentityDigest(identity),JSON.stringify([source]),NOW.toISOString(),new Date(NOW.getTime()+86400_000).toISOString());
  const account=await connectedAccount(db);
  const result=await checkCorporateTelegramContact({db:db.asD1(),orgId:ORG_A,companyId:'weak_listing',searchId:'search_weak_listing',candidateKey:source.candidates[0].key,accountId:account.id,now:NOW.toISOString(),
    resolve:async()=>({status:'resolved',username:'review_user',reason:'regular_user_resolved',retryAfterSeconds:null})});
  assert.equal(result.reason,'username_exists_ownership_unconfirmed');
  const contact=JSON.parse(String(db.value("SELECT telegram_contact_json FROM lead_radar_companies WHERE id='weak_listing'")));
  assert.equal(contact.type,'unknown');assert.equal(contact.messageable,false);
  assert.equal((await verifiedResolvedCorporateCompanies({db:db.asD1(),orgId:ORG_A,companies:[{companyId:'weak_listing',contact}],now:NOW})).size,0);
  assert.equal(await countResolvedCorporateContacts(db.asD1(),ORG_A,'search_weak_listing',NOW.toISOString()),0);
});

for (const withoutUsername of [false,true]) test(`published mobile resolves durably and retains all guards (no username: ${withoutUsername})`, async () => {
  const db = database([...MIGRATIONS, '0050_lead_radar_contact_discovery.sql']);
  addCompany(db, { id: 'mobile', username: 'old_unknown', type: 'unknown' });
  setVerifiedCorporateDomain(db, 'mobile', 'mobile.example');
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence (id,org_id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification)
    VALUES ('mobile-phone',?,'mobile','company_contacts.phone','+998901234567','https://mobile.example/contact','company_website',?,0.9,'company_data')`).run(ORG_A,NOW.toISOString());
  const account = await connectedAccount(db);
  let lookups = 0;
  const input = { db: db.asD1(), orgId: ORG_A, companyId: 'mobile', searchId: 'search_mobile', candidateKey: 'phone:+998901234567', accountId: account.id, now: NOW.toISOString(),
    resolve: async () => { lookups++; return { status: 'resolved' as const, username: withoutUsername ? null : 'clinic_verified', ...(withoutUsername ? {peerRef:`lrpeer:${'a'.repeat(32)}`} : {}), reason: 'regular_user_resolved', retryAfterSeconds: null }; } };
  assert.equal((await checkCorporateTelegramContact(input)).status, 'resolved');
  await checkCorporateTelegramContact(input);
  assert.equal(lookups, 1, 'retry reuses the stored resolution, never sends or imports a contact');
  assert.equal(db.value('SELECT attempts_today FROM lead_radar_contact_checks'), 1);
  assert.equal(await countResolvedCorporateContacts(db.asD1(),ORG_A,'search_mobile',NOW.toISOString()), 1);
  const resolved = JSON.parse(String(db.value("SELECT telegram_contact_json FROM lead_radar_companies WHERE id='mobile'")));
  assert.equal(resolved.sourceKey,'phone:+998901234567');
  const proofInput = { db: db.asD1(), orgId: ORG_A, companies: [{ companyId: 'mobile', contact: resolved }], now: NOW };
  assert.ok((await verifiedResolvedCorporateCompanies(proofInput)).has('mobile'));
  const link=await buildVerifiedTelegramCorporateDraftLink({ db: db.asD1(), orgId: ORG_A, companyId: 'mobile', website: 'https://mobile.example/', contact: resolved, draft: 'fixture', now: NOW });
  assert.equal(Boolean(link),!withoutUsername,'opaque peers must never be turned into public links');
  const selection = await evaluateTelegramCampaignSelection({ db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id, companyIds: ['mobile'], now: NOW });
  assert.equal(selection.automatic, 0, 'resolution is not outreach authorization');
  assert.equal(selection.verified, 1);
  assert.deepEqual(selection.verifiedCompanyIds, ['mobile']);
  await authorizeTelegramCampaignContact({db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,companyId:'mobile',contactBasis:BASIS,
    evidenceReference:'fixture-explicit-contact-approval',expiresAt:'2026-09-24T12:00:00.000Z',reviewerId:'owner@example.test',idempotencyKey:'mobile_authorization_0001',now:NOW});
  const approved=await evaluateTelegramCampaignSelection({db:db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,contactBasis:BASIS,companyIds:['mobile'],now:NOW});
  assert.equal(approved.automatic,1,'phone peer may qualify only after explicit authorization');
  const forged={...resolved,peerRef:`lrpeer:${'b'.repeat(32)}`};
  assert.equal((await verifiedResolvedCorporateCompanies({...proofInput,companies:[{companyId:'mobile',contact:forged}]})).size,0);
  assert.equal((await checkCorporateTelegramContact({ ...input, orgId: ORG_B })).status, 'failed');
  assert.equal(lookups, 1);
  db.exec("UPDATE lead_radar_evidence SET value='+998901234568' WHERE id='mobile-phone'");
  assert.equal((await verifiedResolvedCorporateCompanies(proofInput)).size, 0, 'changed public source invalidates the resolved endpoint');
  db.exec("UPDATE lead_radar_evidence SET value='+998901234567' WHERE id='mobile-phone'; UPDATE lead_radar_companies SET suppressed=1 WHERE id='mobile'");
  assert.equal((await verifiedResolvedCorporateCompanies(proofInput)).size, 0);
  assert.equal((await checkCorporateTelegramContact(input)).status, 'failed');
  await new ContactDiscoveryStore(db.asD1()).purgeExpired(NOW.toISOString());
  assert.equal(db.value('SELECT result_json FROM lead_radar_contact_checks'), null, 'DNC also purges the cached identifier');
});

test('contact rechecks consume a daily budget and late callbacks cannot overwrite a terminal result', async () => {
  const db = database([...MIGRATIONS, '0050_lead_radar_contact_discovery.sql']);
  addCompany(db, { id:'mobile',username:'old_unknown',type:'unknown' });
  setVerifiedCorporateDomain(db,'mobile','mobile.example');
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence (id,org_id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification)
    VALUES ('mobile-phone',?,'mobile','company_contacts.phone','+998901234567','https://mobile.example/contact','company_website',?,0.9,'company_data')`).run(ORG_A,NOW.toISOString());
  const account = await connectedAccount(db);
  let calls = 0;
  const input = { db:db.asD1(),orgId:ORG_A,companyId:'mobile',searchId:'search_mobile',candidateKey:'phone:+998901234567',accountId:account.id,now:NOW.toISOString(),
    resolve:async () => { calls++; return {status:'failed' as const,username:null,reason:'bridge_offline',retryAfterSeconds:null}; } };
  await checkCorporateTelegramContact(input);
  await checkCorporateTelegramContact(input);
  assert.equal(calls,1);
  db.exec('UPDATE lead_radar_contact_checks SET attempts_today=199');
  await checkCorporateTelegramContact({...input,now:new Date(NOW.getTime()+61_000).toISOString()});
  assert.equal(calls,2);
  assert.equal(db.value('SELECT attempts_today FROM lead_radar_contact_checks'),200);
  const capped = await checkCorporateTelegramContact({...input,now:new Date(NOW.getTime()+122_000).toISOString()});
  assert.equal(capped.reason,'daily_check_limit');
  assert.equal(calls,2);
  const nextDay = new Date(NOW.getTime()+86400_000).toISOString();
  const terminal = {status:'unresolved',username:null,reason:'check_expired',retryAfterSeconds:null};
  const outcome = await checkCorporateTelegramContact({...input,now:nextDay,resolve:async () => {
    db.sqlite.prepare("UPDATE lead_radar_contact_checks SET status='unresolved',result_json=?").run(JSON.stringify(terminal));
    return {status:'resolved',username:'late_callback',reason:'regular_user_resolved',retryAfterSeconds:null};
  }});
  assert.deepEqual(outcome,terminal);
  assert.equal(db.value('SELECT attempts_today FROM lead_radar_contact_checks'),1);
  assert.equal(JSON.parse(String(db.value("SELECT telegram_contact_json FROM lead_radar_companies WHERE id='mobile'"))).type,'unknown');
});

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

async function stagePartialBeginDispatch(
  db: SqliteD1,
  suffix: string,
  dispatchingRecipient = false,
) {
  const companyId = `company_partial_${suffix}`;
  addCompany(db, { id: companyId, username: `Partial${suffix.slice(-15)}` });
  const created = await approvedCampaign(db, [companyId], `campaign_partial_${suffix}_0001`);
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: `campaign_partial_${suffix}_start`, now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  const row = db.rows<{ recipient_id: string; effect_id: string; endpoint_digest: string }>(
    `SELECT recipient.id AS recipient_id, effect.id AS effect_id, recipient.endpoint_digest
     FROM lead_radar_tg_campaign_recipients recipient
     JOIN lead_radar_tg_campaign_effects effect
       ON effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
     WHERE recipient.org_id = ? AND recipient.campaign_id = ?`,
    ORG_A,
    created.campaign.id,
  )[0];
  assert.ok(row);
  const quotaDay = NOW.toISOString().slice(0, 10);
  const nextDispatchAt = new Date(NOW.getTime() + 120_000).toISOString();
  const insert = db.sqlite.prepare(`INSERT INTO lead_radar_tg_contact_history (
    org_id, identity_type, identity_key, company_id, endpoint_digest, state,
    campaign_id, recipient_id, effect_id, reservation_quota_day,
    reservation_next_dispatch_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, ?, ?, ?)`);
  for (const [identityType, identityKey] of [
    ['company', companyId],
    ['endpoint', row.endpoint_digest],
  ] as const) {
    insert.run(
      ORG_A, identityType, identityKey, companyId, row.endpoint_digest,
      created.campaign.id, row.recipient_id, row.effect_id,
      quotaDay, nextDispatchAt, NOW.toISOString(), NOW.toISOString(),
    );
  }
  for (const identity of db.rows<{ identity_digest: string }>(
    `SELECT identity_digest FROM lead_radar_tg_recipient_business_identities
     WHERE org_id = ? AND recipient_id = ? ORDER BY identity_digest`,
    ORG_A,
    row.recipient_id,
  )) {
    insert.run(
      ORG_A, 'business', identity.identity_digest, companyId, row.endpoint_digest,
      created.campaign.id, row.recipient_id, row.effect_id,
      quotaDay, nextDispatchAt, NOW.toISOString(), NOW.toISOString(),
    );
  }
  db.sqlite.prepare(`UPDATE lead_radar_tg_user_accounts
    SET quota_day = ?, daily_reserved_count = daily_reserved_count + 1,
      next_dispatch_at = ?, updated_at = ?
    WHERE org_id = ? AND dispatch_lease_campaign_id = ?
      AND dispatch_lease_digest IS NOT NULL`)
    .run(quotaDay, nextDispatchAt, NOW.toISOString(), ORG_A, created.campaign.id);
  if (dispatchingRecipient) {
    db.sqlite.prepare(`UPDATE lead_radar_tg_campaign_recipients
      SET status = 'dispatching', attempt_count = 1,
        dispatching_at = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND status = 'claimed'`)
      .run(NOW.toISOString(), NOW.toISOString(), ORG_A, row.recipient_id);
  }
  return { companyId, campaignId: created.campaign.id, claim, ...row };
}

test('0045 through 0048 have an exact read-only schema contract and no session/credential columns', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  assert.deepEqual(await auditTelegramCampaignSchema(db.asD1()), {
    status: 'pass',
    readOnly: true,
    contractVersion: 'lead-radar-telegram-campaign-v6',
    issues: [],
  });
  assert.equal(await hasTelegramCampaignSchema(db.asD1()), true);
  assert.doesNotThrow(() => db.exec(readFileSync(
    path.join(ROOT, 'migrations', '0047_lead_radar_telegram_campaign_media.sql'),
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
    .run('0048_lead_radar_telegram_media_quota.sql');
  assert.equal((await auditTelegramCampaignSchema(db.asD1())).status, 'blocked');
});

test('runtime campaign schema contract is exact, fail-closed and bounded to four D1 statements', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  let queryCount = 0;
  const countedDb = {
    prepare(sql: string) {
      queryCount += 1;
      return db.prepare(sql);
    },
    batch(statements: readonly D1PreparedStatement[]) {
      return db.batch(statements);
    },
  } as unknown as D1Database;

  assert.equal(await hasTelegramCampaignSchema(countedDb), true);
  assert.equal(queryCount, 4);
  assert.equal(await hasTelegramCampaignSchema(countedDb), true);
  assert.equal(queryCount, 4, 'a successful binding contract is cached per isolate');

  const missingLedger = database();
  t.after(() => missingLedger.sqlite.close());
  missingLedger.sqlite.prepare('DELETE FROM d1_migrations WHERE name = ?')
    .run('0048_lead_radar_telegram_media_quota.sql');
  assert.equal(await hasTelegramCampaignSchema(missingLedger.asD1()), false);
});

test('campaign integrity remains checked when global shared-database PRAGMAs cannot run', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const queries: string[] = [];
  const scopedDb = {
    prepare(sql: string) {
      queries.push(sql);
      if (/^PRAGMA\s+(?:quick_check|foreign_key_check)\s*$/i.test(sql.trim())) {
        throw new Error('SQLITE_NOMEM: shared-database global audit unavailable');
      }
      return db.prepare(sql);
    },
  } as unknown as D1Database;
  assert.equal(await hasTelegramCampaignSchema(scopedDb), true);
  assert.equal(queries.length, 4);
  assert.ok(queries.some((sql) => sql.includes('pragma_quick_check(s.name)')));
  assert.ok(queries.some((sql) => sql.includes('pragma_foreign_key_check(s.name)')));
  assert.equal((await auditTelegramCampaignSchema(scopedDb)).status, 'pass');

  // A broken campaign FK must still fail, even though unrelated tables are out of scope.
  db.exec('PRAGMA foreign_keys = OFF');
  db.sqlite.prepare(`INSERT INTO lead_radar_tg_account_safety (
    org_id, account_id, state, created_at, updated_at
  ) VALUES (?, ?, 'ready', ?, ?)`)
    .run(ORG_A, `lrtgua_${'f'.repeat(32)}`, NOW.toISOString(), NOW.toISOString());
  const freshDb = { prepare: (sql: string) => db.prepare(sql) } as unknown as D1Database;
  assert.equal(await hasTelegramCampaignSchema(freshDb), false);
});

test('0047 upgrade backfills a fail-closed sentinel for legacy campaign state', async (t) => {
  const db = database(MIGRATIONS.slice(0, MIGRATIONS.indexOf('0047_lead_radar_telegram_campaign_media.sql')));
  t.after(() => db.sqlite.close());
  db.sqlite.prepare(`INSERT INTO lead_radar_tg_user_accounts (
    id, org_id, masked_label, status, auth_request_digest,
    request_idempotency_digest, request_fingerprint, created_at, updated_at
  ) VALUES (?, ?, 'Legacy account', 'pending', ?, ?, ?, ?, ?)`)
    .run(
      `lrtgua_${'1'.repeat(32)}`,
      ORG_A,
      'a'.repeat(64),
      'b'.repeat(64),
      'c'.repeat(64),
      NOW.toISOString(),
      NOW.toISOString(),
    );
  db.sqlite.prepare(`UPDATE lead_radar_tg_user_accounts
    SET status = 'connected', gateway_account_ref = ?,
      gateway_account_ref_digest = ?, connected_at = ?, last_health_at = ?
    WHERE org_id = ?`)
    .run(
      'gateway_legacy_reference_1234',
      'd'.repeat(64),
      NOW.toISOString(),
      NOW.toISOString(),
      ORG_A,
    );
  db.exec(readFileSync(
    path.join(ROOT, 'migrations', '0047_lead_radar_telegram_campaign_media.sql'),
    'utf8',
  ));
  db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)')
    .run('0047_lead_radar_telegram_campaign_media.sql');
  db.exec(readFileSync(
    path.join(ROOT, 'migrations', '0048_lead_radar_telegram_media_quota.sql'),
    'utf8',
  ));
  db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)')
    .run('0048_lead_radar_telegram_media_quota.sql');
  assert.equal(db.value(`SELECT key_fingerprint FROM lead_radar_tg_data_key_state
    WHERE org_id = ?`, ORG_A), null);
  assert.equal(db.value(`SELECT key_fingerprint FROM lead_radar_tg_routing_key_state
    WHERE org_id = ?`, ORG_A), null);
  assert.equal(await getTelegramCampaignDataKeyIdentityState({
    db: db.asD1(), orgId: ORG_A, dataKey: DATA_KEY,
  }), 'legacy_unbound');
  assert.deepEqual(await auditTelegramCampaignSchema(db.asD1()), {
    status: 'pass', readOnly: true,
    contractVersion: 'lead-radar-telegram-campaign-v6', issues: [],
  });
});

test('legacy unbound key sentinel never auto-binds from a runtime request', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_legacy_key', username: 'LegacyKeyClinic' });
  db.sqlite.prepare(`INSERT INTO lead_radar_tg_data_key_state (
    org_id, key_fingerprint, established_at, created_at, updated_at
  ) VALUES (?, NULL, NULL, ?, ?)`)
    .run(ORG_A, NOW.toISOString(), NOW.toISOString());

  await assert.rejects(
    authorizeTelegramCampaignContact({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
      companyId: 'company_legacy_key', contactBasis: BASIS,
      evidenceReference: 'legacy-proof-0001',
      expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
      idempotencyKey: 'legacy_key_authorization_0001', now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_not_configured',
  );
  assert.equal(db.value(`SELECT key_fingerprint FROM lead_radar_tg_data_key_state
    WHERE org_id = ?`, ORG_A), null);
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_authorizations
    WHERE org_id = ?`, ORG_A), 0);
});

test('missing key sentinel with existing campaign account state is legacy-unbound', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  await createTelegramUserAccountPending({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    authRequestReference: 'gateway_auth_missing_sentinel',
    idempotencyKey: 'missing_sentinel_account_0001', now: NOW,
  });
  db.sqlite.prepare('DELETE FROM lead_radar_tg_data_key_state WHERE org_id = ?').run(ORG_A);
  assert.equal(await getTelegramCampaignDataKeyIdentityState({
    db: db.asD1(), orgId: ORG_A, dataKey: DATA_KEY,
  }), 'legacy_unbound');
});

test('domain rejects a 31/day quota and pacing below 120 seconds before any effect', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  await assert.rejects(
    prepareTelegramCampaign({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
      accountId: `lrtgua_${'a'.repeat(32)}`, searchId: 'search_policy_floor',
      companyIds: ['company_policy_floor'], template: 'Safe text',
      operatorId: 'owner@example.test', idempotencyKey: 'policy_floor_prepare_0001',
      contactBasis: BASIS, minIntervalSeconds: 119, now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_invalid_input',
  );
  let providerCalls = 0;
  await assert.rejects(
    dispatchClaimedTelegramCampaignRecipient({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
      claim: {
        campaignId: `lrtgcp_${'b'.repeat(32)}`,
        recipientId: `lrtgcr_${'c'.repeat(32)}`,
        claimToken: `lrtg_claim_${'d'.repeat(32)}`,
        leaseExpiresAt: NOW.toISOString(),
      },
      dailyLimit: 31,
      sender: { async send() { providerCalls += 1; return { kind: 'ambiguous' }; } },
      now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_invalid_input',
  );
  assert.equal(providerCalls, 0);
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
  assert.equal(expired.items[0]?.reasonCode, 'corporate_endpoint_unverified');
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
  await assert.rejects(
    createTelegramUserAccountPending({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
      authRequestReference: 'gateway_auth_request_unsafe_label',
      idempotencyKey: 'account_connect_unsafe_label_0001',
      maskedLabel: '@open_username',
      now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_invalid_input',
  );
  await stageTelegramUserAccountConnection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    accountId: first.account.id, gatewayAccountRef: 'gateway_account_reference_a',
    expectedVersion: first.account.stateVersion,
    maskedLabel: '@ab•••yz',
    providerConnectedAt: NOW.toISOString(), now: NOW,
  });
  const connected = await completeTelegramUserAccountConnection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    accountId: first.account.id, gatewayAccountRef: 'gateway_account_reference_a',
    expectedVersion: first.account.stateVersion, maskedLabel: '@ab•••yz', now: NOW,
  });
  assert.equal(connected.status, 'connected');
  assert.equal(connected.maskedLabel, '@ab•••yz');
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
  assert.equal(selection.verified, 1, 'the connected Bridge fixture resolved the corporate username');
  assert.deepEqual(selection.verifiedCompanyIds, ['company_auto']);

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

test('fifty-recipient prepare and create stay below the Workers Free D1 query budget', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const account = await connectedAccount(db);
  const companyIds = Array.from({ length: 50 }, (_, index) => (
    `company_budget_${String(index + 1).padStart(2, '0')}`
  ));
  for (const [index, companyId] of companyIds.entries()) {
    addCompany(db, { id: companyId, username: `BudgetClinic${String(index + 1).padStart(2, '0')}` });
    await authorizeTelegramCampaignContact({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, companyId,
      contactBasis: BASIS, evidenceReference: `budget-evidence-${index}`,
      expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
      idempotencyKey: `authorize_budget_company_${String(index).padStart(2, '0')}`,
      now: NOW,
    });
  }
  await bridgeVerifyBusinessCompanies(db, account.id, ORG_A, companyIds);
  let queryCount = 0;
  const countedDb = {
    prepare(sql: string) {
      queryCount += 1;
      return db.prepare(sql);
    },
    batch(statements: readonly D1PreparedStatement[]) {
      return db.batch(statements);
    },
  } as unknown as D1Database;
  const template = 'Здравствуйте, {company_name}! Проверка бюджета D1.';
  const prepared = await prepareTelegramCampaign({
    db: countedDb, dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_campaign_fixture', companyIds, template,
    operatorId: 'owner@example.test', idempotencyKey: 'budget_50_prepare_0001',
    contactBasis: BASIS, minIntervalSeconds: 120, now: NOW,
  });
  assert.equal(prepared.recipientCount, 50);
  assert.ok(queryCount < 50, `prepare used ${queryCount} D1 statements`);

  queryCount = 0;
  const created = await createApprovedTelegramCampaign({
    db: countedDb, dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_campaign_fixture', companyIds, template,
    operatorId: 'owner@example.test', contactBasis: BASIS,
    approvalToken: prepared.approvalToken,
    expectedSelectionDigest: prepared.selectionDigest,
    expectedContentDigest: prepared.contentDigest,
    idempotencyKey: 'budget_50_create_0001', minIntervalSeconds: 120, now: NOW,
  });
  assert.equal(created.campaign.counts.total, 50);
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients
    WHERE org_id = ? AND campaign_id = ?`, ORG_A, created.campaign.id), 50);
  assert.ok(queryCount < 50, `create used ${queryCount} D1 statements`);
});

test('media expiry and deletion barriers never downgrade an approved photo campaign to text', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const companyId = 'company_media_barrier';
  addCompany(db, { id: companyId, username: 'MediaBarrierClinic' });
  const account = await connectedAccount(db);
  await authorizeTelegramCampaignContact({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, companyId,
    contactBasis: BASIS, evidenceReference: 'fixture-media-barrier-evidence',
    expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
    idempotencyKey: 'authorize_media_barrier_0001', now: NOW,
  });
  const store = new LeadRadarTelegramCampaignStore(db.asD1());
  const digest = 'a'.repeat(64);
  const boundaryMediaId = `lrtgcm_${'1'.repeat(32)}`;
  assert.equal(await store.registerCampaignMediaObject(ORG_A, {
    mediaId: boundaryMediaId,
    mediaDigest: digest,
    expiresAt: NOW.toISOString(),
    now: NOW.toISOString(),
  }), true);
  await assert.rejects(
    prepareTelegramCampaign({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
      searchId: 'search_media_boundary_equal', companyIds: [companyId],
      template: 'Exact caption', operatorId: 'owner@example.test', contactBasis: BASIS,
      attachment: { mediaId: boundaryMediaId, mediaDigest: digest },
      idempotencyKey: 'prepare_media_boundary_equal', now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_storage_conflict',
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals'), 0);

  const futureMediaId = `lrtgcm_${'2'.repeat(32)}`;
  assert.equal(await store.registerCampaignMediaObject(ORG_A, {
    mediaId: futureMediaId,
    mediaDigest: digest,
    expiresAt: new Date(NOW.getTime() + 1).toISOString(),
    now: NOW.toISOString(),
  }), true);
  const prepared = await prepareTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_media_boundary_future', companyIds: [companyId],
    template: 'Exact caption', operatorId: 'owner@example.test', contactBasis: BASIS,
    attachment: { mediaId: futureMediaId, mediaDigest: digest },
    idempotencyKey: 'prepare_media_boundary_future', now: NOW,
  });
  assert.equal(prepared.attachment?.mediaId, futureMediaId);
  await assert.rejects(
    createApprovedTelegramCampaign({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
      searchId: 'search_media_boundary_future', companyIds: [companyId],
      template: 'Exact caption', operatorId: 'owner@example.test', contactBasis: BASIS,
      attachment: { mediaId: futureMediaId, mediaDigest: digest },
      approvalToken: prepared.approvalToken,
      expectedSelectionDigest: prepared.selectionDigest,
      expectedContentDigest: prepared.contentDigest,
      idempotencyKey: 'create_media_boundary_expired',
      now: new Date(NOW.getTime() + 2),
    }),
    (error) => errorCode(error) === 'telegram_campaign_storage_conflict',
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaigns'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_effects'), 0);
  assert.equal(db.value(`SELECT consumed_at FROM lead_radar_tg_campaign_approvals
    WHERE idempotency_key_digest IS NOT NULL LIMIT 1`), null);

  const deletingMediaId = `lrtgcm_${'3'.repeat(32)}`;
  assert.equal(await store.registerCampaignMediaObject(ORG_A, {
    mediaId: deletingMediaId,
    mediaDigest: digest,
    expiresAt: '2026-09-24T12:00:00.000Z',
    now: NOW.toISOString(),
  }), true);
  const deletingPrepared = await prepareTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_media_deleting_barrier', companyIds: [companyId],
    template: 'Frozen photo caption', operatorId: 'owner@example.test', contactBasis: BASIS,
    attachment: { mediaId: deletingMediaId, mediaDigest: digest },
    idempotencyKey: 'prepare_media_deleting_barrier', now: NOW,
  });
  db.sqlite.prepare(`UPDATE lead_radar_tg_media_objects
    SET status = 'deleting', updated_at = ? WHERE org_id = ? AND media_id = ?`)
    .run(new Date(NOW.getTime() + 1).toISOString(), ORG_A, deletingMediaId);
  await assert.rejects(
    createApprovedTelegramCampaign({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
      searchId: 'search_media_deleting_barrier', companyIds: [companyId],
      template: 'Frozen photo caption', operatorId: 'owner@example.test', contactBasis: BASIS,
      attachment: { mediaId: deletingMediaId, mediaDigest: digest },
      approvalToken: deletingPrepared.approvalToken,
      expectedSelectionDigest: deletingPrepared.selectionDigest,
      expectedContentDigest: deletingPrepared.contentDigest,
      idempotencyKey: 'create_media_deleting_barrier', now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_storage_conflict',
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaigns'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_media'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_effects'), 0);
});

test('exact text validation rejects unsafe scalars before approval and preserves a photo caption byte-for-byte', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const companyId = 'company_exact_caption';
  addCompany(db, { id: companyId, username: 'ExactCaptionClinic' });
  const account = await connectedAccount(db);
  await authorizeTelegramCampaignContact({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, companyId,
    contactBasis: BASIS, evidenceReference: 'fixture-exact-caption-evidence',
    expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
    idempotencyKey: 'authorize_exact_caption_0001', now: NOW,
  });
  const mediaId = `lrtgcm_${'4'.repeat(32)}`;
  const mediaDigest = 'b'.repeat(64);
  const attachment = { mediaId, mediaDigest };
  const store = new LeadRadarTelegramCampaignStore(db.asD1());
  await store.registerCampaignMediaObject(ORG_A, {
    mediaId,
    mediaDigest,
    expiresAt: '2026-09-24T12:00:00.000Z',
    now: NOW.toISOString(),
  });
  const unsafe = ['\u0001', '\r', '\u000b', '\u007f', '\ud800', '\udfff'];
  let attempt = 0;
  for (const value of unsafe) {
    for (const candidateAttachment of [undefined, attachment] as const) {
      attempt += 1;
      await assert.rejects(
        prepareTelegramCampaign({
          db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
          searchId: `search_exact_reject_${attempt}`, companyIds: [companyId],
          template: `unsafe${value}text`, operatorId: 'owner@example.test',
          contactBasis: BASIS, attachment: candidateAttachment,
          idempotencyKey: `prepare_exact_reject_${attempt}`, now: NOW,
        }),
        (error) => errorCode(error) === 'telegram_campaign_invalid_input',
      );
    }
  }
  await assert.rejects(
    prepareTelegramCampaign({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
      searchId: 'search_caption_1025', companyIds: [companyId],
      template: 'я'.repeat(1_025), operatorId: 'owner@example.test', contactBasis: BASIS,
      attachment, idempotencyKey: 'prepare_caption_1025', now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_invalid_input',
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals'), 0);

  const template = [
    '  Здравствуйте, {company_name}! Салом ва ассалом.',
    '',
    'O‘zbekcha 🇺🇿 👩‍💻 e\u0301',
    '\t*markdown* <b>html</b> https://example.uz/path?q=1',
    '',
    'Финал.  ',
  ].join('\n');
  const prepared = await prepareTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_exact_caption', companyIds: [companyId], template,
    operatorId: 'owner@example.test', contactBasis: BASIS, attachment,
    idempotencyKey: 'prepare_exact_caption_0001', now: NOW,
  });
  const created = await createApprovedTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_exact_caption', companyIds: [companyId], template,
    operatorId: 'owner@example.test', contactBasis: BASIS, attachment,
    approvalToken: prepared.approvalToken,
    expectedSelectionDigest: prepared.selectionDigest,
    expectedContentDigest: prepared.contentDigest,
    idempotencyKey: 'create_exact_caption_0001', now: NOW,
  });
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'start_exact_caption_0001', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  const expected = template.replaceAll('{company_name}', `Company ${companyId}`);
  let providerText = '';
  let providerMediaId = '';
  const result = await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, now: NOW,
    mediaReader: {
      async read(readOrgId, reference) {
        assert.equal(readOrgId, ORG_A);
        assert.deepEqual(reference, attachment);
        return {
          ...attachment,
          filename: 'макет.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 4,
          width: 1,
          height: 1,
          expiresAt: '2026-09-24T12:00:00.000Z',
          objectKey: `lead-radar/campaign-media/${ORG_A}/${attachment.mediaId}`,
        };
      },
    },
    sender: {
      async send(input) {
        providerText = input.text;
        providerMediaId = input.media?.mediaId ?? '';
        return { kind: 'sent', providerMessageId: 'exact-caption-message' };
      },
    },
  });
  assert.equal(result.status, 'sent');
  assert.equal(providerText, expected);
  assert.equal(providerText.startsWith('  '), true);
  assert.equal(providerText.endsWith('  '), true);
  assert.equal(new TextEncoder().encode(providerText).toString(), new TextEncoder().encode(expected).toString());
  assert.equal(providerMediaId, mediaId);
  assert.match(providerText, /\*markdown\* <b>html<\/b> https:\/\/example\.uz/u);
  assert.match(providerText, /\n\n/u);
  assert.match(providerText, /\t/u);
});

test('definitive media rejection pauses the frozen campaign after one attempt and releases quota and guards', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const companyId = 'company_invalid_media';
  addCompany(db, { id: companyId, username: 'InvalidMediaClinic' });
  const account = await connectedAccount(db);
  await authorizeTelegramCampaignContact({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, companyId,
    contactBasis: BASIS, evidenceReference: 'fixture-invalid-media-evidence',
    expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
    idempotencyKey: 'authorize_invalid_media_0001', now: NOW,
  });
  const attachment = {
    mediaId: `lrtgcm_${'5'.repeat(32)}`,
    mediaDigest: 'c'.repeat(64),
  };
  await new LeadRadarTelegramCampaignStore(db.asD1()).registerCampaignMediaObject(ORG_A, {
    ...attachment,
    expiresAt: '2026-09-24T12:00:00.000Z',
    now: NOW.toISOString(),
  });
  const input = {
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, accountId: account.id,
    searchId: 'search_invalid_media', companyIds: [companyId],
    template: 'Frozen invalid photo caption', operatorId: 'owner@example.test',
    contactBasis: BASIS, attachment, now: NOW,
  } as const;
  const prepared = await prepareTelegramCampaign({
    ...input,
    idempotencyKey: 'prepare_invalid_media_0001',
  });
  const created = await createApprovedTelegramCampaign({
    ...input,
    approvalToken: prepared.approvalToken,
    expectedSelectionDigest: prepared.selectionDigest,
    expectedContentDigest: prepared.contentDigest,
    idempotencyKey: 'create_invalid_media_0001',
  });
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'start_invalid_media_0001', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  let providerCalls = 0;
  const mediaReader = {
    async read() {
      return {
        ...attachment,
        filename: 'corrupt.png',
        mimeType: 'image/png' as const,
        sizeBytes: 4,
        width: 1,
        height: 1,
        expiresAt: '2026-09-24T12:00:00.000Z',
        objectKey: `lead-radar/campaign-media/${ORG_A}/${attachment.mediaId}`,
      };
    },
  };
  const first = await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, now: NOW,
    mediaReader,
    sender: {
      async send() {
        providerCalls += 1;
        return { kind: 'rejected', code: 'media_invalid' };
      },
    },
  });
  assert.equal(first.status, 'failed');
  assert.equal(first.campaign.status, 'paused');
  assert.equal(first.campaign.pauseReason, 'provider_error');
  assert.equal(first.campaign.lastErrorCode, 'media_invalid');
  assert.equal(first.campaign.resumeBlockedReason, 'review_required');
  assert.equal(providerCalls, 1);
  assert.equal(db.value(`SELECT daily_reserved_count FROM lead_radar_tg_user_accounts
    WHERE org_id = ?`, ORG_A), 0);
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
    WHERE org_id = ?`, ORG_A), 0);
  assert.equal(db.value(`SELECT state FROM lead_radar_tg_account_safety
    WHERE org_id = ?`, ORG_A), 'ready', 'a corrupt campaign must not restrict the account');

  const replay = await consumeTelegramCampaignQueueMessage({
    db: db.asD1(), dataKey: DATA_KEY,
    raw: {
      schema: 'gptbot.lead-radar.telegram-campaign.v1',
      campaign_id: created.campaign.id,
      org_id: ORG_A,
      state_version: Number(db.value(
        'SELECT state_version FROM lead_radar_tg_campaigns WHERE id = ?',
        created.campaign.id,
      )),
    },
    mediaReader,
    sender: {
      async send() {
        providerCalls += 1;
        return { kind: 'sent', providerMessageId: 'must-not-send' };
      },
    },
    now: new Date(NOW.getTime() + 1_000),
  });
  assert.equal(replay.disposition, 'stale');
  assert.equal(providerCalls, 1);
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

test('default atomic account quota blocks the thirty-first attempt and pauses to next UTC day', async (t) => {
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
    SET quota_day = ?, daily_reserved_count = 30
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
  ), 30);
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
  let providerCalls = 0;
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
    sender: { async send() { providerCalls += 1; throw new Error('timeout after provider boundary'); } },
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
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
    WHERE org_id = ? AND state = 'ambiguous'`, ORG_A), 4);
  const blockedFollowUp = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyIds: ['company_ambiguous'], contactBasis: BASIS,
    now: new Date(NOW.getTime() + 60_000),
  });
  assert.equal(blockedFollowUp.automatic, 0);
  assert.equal(blockedFollowUp.items[0]?.reasonCode, 'corporate_endpoint_unverified');
  assert.equal(providerCalls, 1, 'ambiguous history must prevent a second provider effect');
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

test('exact missing private account releases quota and no-repeat guards before provider', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const companyId = 'company_missing_private_account';
  addCompany(db, { id: companyId, username: 'MissingPrivateAccount' });
  const created = await approvedCampaign(
    db,
    [companyId],
    'campaign_missing_private_account_0001',
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_missing_private_account_start', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  const result = await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, now: NOW,
    sender: {
      async send() {
        return { kind: 'rejected', code: 'account_session_missing' };
      },
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.campaign.status, 'paused');
  assert.equal(result.campaign.pauseReason, 'account_restricted');
  assert.equal(result.campaign.lastErrorCode, 'account_session_missing');
  assert.equal(db.value(`SELECT daily_reserved_count FROM lead_radar_tg_user_accounts
    WHERE org_id = ?`, ORG_A), 0);
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
    WHERE org_id = ?`, ORG_A), 0);
  assert.equal(db.value(`SELECT state FROM lead_radar_tg_account_safety
    WHERE org_id = ?`, ORG_A), 'restricted');
  const followUp = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyIds: [companyId], contactBasis: BASIS,
    now: new Date(NOW.getTime() + 60_000),
  });
  assert.equal(followUp.automatic, 0, 'a missing account must require reconnect and a fresh Bridge proof');
  assert.equal(followUp.items[0]?.reasonCode, 'corporate_endpoint_unverified');
});

test('permanent no-repeat blocks either company or endpoint but remains tenant scoped', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_history_original', username: 'SharedHistoryClinic' });
  const first = await approvedCampaign(
    db,
    ['company_history_original'],
    'campaign_history_first_0001',
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: first.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_history_first_start', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: first.campaign.id, now: NOW,
  });
  assert.ok(claim);
  let providerCalls = 0;
  const delivered = await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, now: NOW,
    sender: {
      async send() {
        providerCalls += 1;
        return { kind: 'sent', providerMessageId: 'history-first-message' };
      },
    },
  });
  assert.equal(delivered.status, 'sent');
  assert.equal(providerCalls, 1);
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
    WHERE org_id = ? AND state = 'sent'`, ORG_A), 4);

  // Same company, changed Telegram endpoint: company identity still blocks.
  const replacementEvidence = 'evidence_sharedhistoryclinic';
  db.sqlite.prepare(`UPDATE lead_radar_evidence
    SET value = ?, source_url = ?, observed_at = ?
    WHERE org_id = ? AND company_id = ? AND id = ?`)
    .run(
      'https://t.me/ReplacementHistoryClinic',
      'https://company_history_original.example/contact-new',
      NOW.toISOString(),
      ORG_A,
      'company_history_original',
      replacementEvidence,
    );
  db.sqlite.prepare(`UPDATE lead_radar_companies
    SET telegram_contact_json = ?, updated_at = ? WHERE org_id = ? AND id = ?`)
    .run(
      JSON.stringify(contact('ReplacementHistoryClinic', 'business', replacementEvidence)),
      NOW.toISOString(),
      ORG_A,
      'company_history_original',
    );
  const accountA = await getTelegramUserAccount(db.asD1(), ORG_A);
  assert.ok(accountA);
  await bridgeVerifyBusinessCompanies(db, accountA.id, ORG_A, ['company_history_original']);
  const changedEndpoint = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyIds: ['company_history_original'], contactBasis: BASIS, now: NOW,
  });
  assert.equal(changedEndpoint.automatic, 0);
  assert.equal(changedEndpoint.items[0]?.reasonCode, 'already_contacted');

  // Different company, same original endpoint: endpoint identity still blocks.
  addCompany(db, {
    id: 'company_history_reused_endpoint',
    username: 'SharedHistoryClinic',
    evidenceId: 'evidence_sharedhistoryclinic_reused_company',
  });
  await bridgeVerifyBusinessCompanies(db, accountA.id, ORG_A, ['company_history_reused_endpoint']);
  const reusedEndpoint = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyIds: ['company_history_reused_endpoint'], contactBasis: BASIS, now: NOW,
  });
  assert.equal(reusedEndpoint.automatic, 0);
  assert.equal(reusedEndpoint.items[0]?.reasonCode, 'already_contacted');
  assert.equal(providerCalls, 1, 'excluded follow-up selections made no provider call');

  // The same endpoint in a different tenant is independent and can be
  // authorized normally.
  addCompany(db, {
    id: 'company_history_cross_tenant',
    username: 'SharedHistoryClinic',
    orgId: ORG_B,
    evidenceId: 'evidence_sharedhistoryclinic_org_b',
  });
  await connectedAccount(db, ORG_B);
  await authorizeTelegramCampaignContact({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_B,
    companyId: 'company_history_cross_tenant', contactBasis: BASIS,
    evidenceReference: 'fixture-cross-tenant-history',
    expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
    idempotencyKey: 'authorize_cross_tenant_history_0001', now: NOW,
  });
  const crossTenant = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_B,
    companyIds: ['company_history_cross_tenant'], contactBasis: BASIS, now: NOW,
  });
  assert.equal(crossTenant.automatic, 1);
  assert.equal(crossTenant.items[0]?.classification, 'automatic');
});

test('stable business aliases block rediscovery without false-blocking distinct domains', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_alias_original', username: 'AliasOriginalClinic' });
  setVerifiedCorporateDomain(
    db,
    'company_alias_original',
    'stable-alias-clinic.example',
    'stable:clinic:identity',
  );
  const first = await approvedCampaign(
    db,
    ['company_alias_original'],
    'campaign_business_alias_original_0001',
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: first.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_business_alias_original_start', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: first.campaign.id, now: NOW,
  });
  assert.ok(claim);
  let providerCalls = 0;
  assert.equal((await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, now: NOW,
    sender: {
      async send() {
        providerCalls += 1;
        return { kind: 'sent', providerMessageId: 'stable-business-alias-message' };
      },
    },
  })).status, 'sent');
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
    WHERE org_id = ? AND identity_type = 'business' AND state = 'sent'`, ORG_A), 2);

  // A new lead id and Telegram username still represent the same verified
  // business through its canonical key and official corporate domain.
  addCompany(db, { id: 'company_alias_rediscovered', username: 'AliasRenamedClinic' });
  setVerifiedCorporateDomain(
    db,
    'company_alias_rediscovered',
    'stable-alias-clinic.example',
    'stable:clinic:identity',
  );
  const account = await getTelegramUserAccount(db.asD1(), ORG_A);
  assert.ok(account);
  await bridgeVerifyBusinessCompanies(db, account.id, ORG_A, ['company_alias_rediscovered']);
  const rediscovered = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyIds: ['company_alias_rediscovered'], contactBasis: BASIS, now: NOW,
  });
  assert.equal(rediscovered.automatic, 0);
  assert.equal(rediscovered.items[0]?.reasonCode, 'already_contacted');

  // A matching display name is not an identity. Different canonical/domain
  // evidence remains independently eligible after explicit authorization.
  addCompany(db, { id: 'company_alias_distinct', username: 'AliasDistinctClinic' });
  setVerifiedCorporateDomain(
    db,
    'company_alias_distinct',
    'distinct-alias-clinic.example',
    'stable:distinct:identity',
  );
  await bridgeVerifyBusinessCompanies(db, account.id, ORG_A, ['company_alias_distinct']);
  db.sqlite.prepare(`UPDATE lead_radar_companies SET name = ?
    WHERE org_id = ? AND id IN (?, ?)`)
    .run(
      'Same display name',
      ORG_A,
      'company_alias_original',
      'company_alias_distinct',
    );
  await authorizeTelegramCampaignContact({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyId: 'company_alias_distinct', contactBasis: BASIS,
    evidenceReference: 'distinct-domain-authorization',
    expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
    idempotencyKey: 'authorize_distinct_business_alias', now: NOW,
  });
  const distinct = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyIds: ['company_alias_distinct'], contactBasis: BASIS, now: NOW,
  });
  assert.equal(distinct.automatic, 1);
  assert.equal(distinct.items[0]?.reasonCode, 'verified_corporate_authorized');
  assert.equal(providerCalls, 1);
});

test('generic multi-tenant website hosts never become cross-company identity guards', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_generic_host_a', username: 'GenericHostClinicA' });
  setVerifiedCorporateDomain(db, 'company_generic_host_a', 'linktr.ee');
  const first = await approvedCampaign(
    db,
    ['company_generic_host_a'],
    'campaign_generic_host_a_0001',
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: first.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_generic_host_a_start', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: first.campaign.id, now: NOW,
  });
  assert.ok(claim);
  await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, now: NOW,
    sender: { async send() { return { kind: 'sent', providerMessageId: 'generic-host-a' }; } },
  });
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
    WHERE org_id = ? AND identity_type = 'business'`, ORG_A), 1,
  'only the type-scoped canonical alias is frozen');

  addCompany(db, { id: 'company_generic_host_b', username: 'GenericHostClinicB' });
  setVerifiedCorporateDomain(db, 'company_generic_host_b', 'linktr.ee');
  const account = await getTelegramUserAccount(db.asD1(), ORG_A);
  assert.ok(account);
  await bridgeVerifyBusinessCompanies(db, account.id, ORG_A, ['company_generic_host_b']);
  await authorizeTelegramCampaignContact({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyId: 'company_generic_host_b', contactBasis: BASIS,
    evidenceReference: 'generic-host-b-authorization',
    expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
    idempotencyKey: 'authorize_generic_host_b', now: NOW,
  });
  const second = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyIds: ['company_generic_host_b'], contactBasis: BASIS, now: NOW,
  });
  assert.equal(second.automatic, 1);
  assert.equal(second.items[0]?.reasonCode, 'verified_corporate_authorized');
});

test('terminal retention purges encrypted outreach relations but permanent aliases still block', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_retention_original', username: 'RetentionClinic' });
  const originalCanonical = 'fixture:company_retention_original';
  const created = await approvedCampaign(
    db,
    ['company_retention_original'],
    'campaign_terminal_retention_0001',
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_terminal_retention_start', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  let providerCalls = 0;
  await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, now: NOW,
    sender: {
      async send() {
        providerCalls += 1;
        return { kind: 'sent', providerMessageId: 'retention-message' };
      },
    },
  });
  await maintainTelegramCampaigns({
    db: db.asD1(), orgId: ORG_A,
    now: new Date(NOW.getTime() + 61 * 24 * 60 * 60_000),
  });
  assert.equal(db.value(`SELECT template_ciphertext FROM lead_radar_tg_campaigns
    WHERE org_id = ? AND id = ?`, ORG_A, created.campaign.id), 'purged_________________');
  assert.equal(db.value(`SELECT sent_count FROM lead_radar_tg_campaigns
    WHERE org_id = ? AND id = ?`, ORG_A, created.campaign.id), 1);
  for (const table of [
    'lead_radar_tg_campaign_recipients',
    'lead_radar_tg_campaign_effects',
    'lead_radar_tg_recipient_eligibility',
    'lead_radar_tg_recipient_business_identities',
    'lead_radar_tg_campaign_safety',
  ]) {
    assert.equal(db.value(`SELECT COUNT(*) FROM ${table} WHERE org_id = ?`, ORG_A), 0, table);
  }
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
    WHERE org_id = ? AND state = 'sent'`, ORG_A), 4);

  // The standalone ledger no longer pins the source company/search through a
  // foreign key, while its opaque alias remains usable after rediscovery.
  db.sqlite.prepare(`DELETE FROM lead_radar_companies WHERE org_id = ? AND id = ?`)
    .run(ORG_A, 'company_retention_original');
  db.sqlite.prepare(`DELETE FROM lead_radar_searches WHERE org_id = ? AND id = ?`)
    .run(ORG_A, 'search_company_retention_original');
  addCompany(db, { id: 'company_retention_rediscovered', username: 'RetentionClinicNew' });
  db.sqlite.prepare(`UPDATE lead_radar_companies SET canonical_key = ?
    WHERE org_id = ? AND id = ?`)
    .run(originalCanonical, ORG_A, 'company_retention_rediscovered');
  const rediscoveredAt = new Date(NOW.getTime() + 61 * 24 * 60 * 60_000);
  const refreshedContact = contact('RetentionClinicNew');
  refreshedContact.verifiedAt = rediscoveredAt.toISOString();
  db.sqlite.prepare(`UPDATE lead_radar_companies
    SET telegram_contact_json = ?, updated_at = ? WHERE org_id = ? AND id = ?`)
    .run(
      JSON.stringify(refreshedContact),
      rediscoveredAt.toISOString(),
      ORG_A,
      'company_retention_rediscovered',
    );
  db.sqlite.prepare(`UPDATE lead_radar_evidence SET observed_at = ?
    WHERE org_id = ? AND company_id = ?`)
    .run(rediscoveredAt.toISOString(), ORG_A, 'company_retention_rediscovered');
  const retentionAccount = await getTelegramUserAccount(db.asD1(), ORG_A);
  assert.ok(retentionAccount);
  await bridgeVerifyBusinessCompanies(
    db, retentionAccount.id, ORG_A, ['company_retention_rediscovered'], rediscoveredAt,
  );
  const rediscovered = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyIds: ['company_retention_rediscovered'], contactBasis: BASIS,
    now: rediscoveredAt,
  });
  assert.equal(rediscovered.automatic, 0);
  assert.equal(rediscovered.items[0]?.reasonCode, 'already_contacted');
  assert.equal(providerCalls, 1);
});

test('routing key fingerprint binds once and legacy routed accounts never auto-bind', async (t) => {
  const empty = database();
  t.after(() => empty.sqlite.close());
  const emptyStore = new LeadRadarTelegramCampaignStore(empty.asD1());
  const fingerprintA = 'a'.repeat(64);
  const fingerprintB = 'b'.repeat(64);
  assert.equal(await emptyStore.getRoutingKeyFingerprintState(ORG_A, fingerprintA), 'uninitialized');
  assert.equal(await emptyStore.ensureRoutingKeyFingerprint(
    ORG_A,
    fingerprintA,
    NOW.toISOString(),
  ), 'ready');
  assert.equal(await emptyStore.getRoutingKeyFingerprintState(ORG_A, fingerprintB), 'mismatch');

  const legacy = database();
  t.after(() => legacy.sqlite.close());
  await connectedAccount(legacy);
  const legacyStore = new LeadRadarTelegramCampaignStore(legacy.asD1());
  assert.equal(await legacyStore.getRoutingKeyFingerprintState(ORG_A, fingerprintA), 'legacy_unbound');
  assert.equal(await legacyStore.ensureRoutingKeyFingerprint(
    ORG_A,
    fingerprintA,
    NOW.toISOString(),
  ), 'legacy_unbound');
  assert.equal(legacy.value(`SELECT COUNT(*) FROM lead_radar_tg_routing_key_state
    WHERE org_id = ?`, ORG_A), 0);
});

test('campaign identity key rotation blocks endpoint-repeat bypass before claim or provider', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_key_a_sent', username: 'StableEndpointClinic' });
  const first = await approvedCampaign(db, ['company_key_a_sent'], 'campaign_key_a_sent_0001');
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: first.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_key_a_sent_start', now: NOW,
  });
  const firstClaim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: first.campaign.id, now: NOW,
  });
  assert.ok(firstClaim);
  let providerCalls = 0;
  const sender: TelegramCampaignSender = {
    async send() {
      providerCalls += 1;
      return { kind: 'sent', providerMessageId: 'stable-key-message' };
    },
  };
  await dispatchClaimedTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    claim: firstClaim, sender, now: NOW,
  });
  addCompany(db, {
    id: 'company_key_b_alias',
    username: 'StableEndpointClinic',
    evidenceId: 'evidence_stable_endpoint_alias',
  });
  const account = await getTelegramUserAccount(db.asD1(), ORG_A);
  assert.ok(account);
  await bridgeVerifyBusinessCompanies(db, account.id, ORG_A, ['company_key_b_alias']);

  await assert.rejects(
    evaluateTelegramCampaignSelection({
      db: db.asD1(), dataKey: DATA_KEY_B, orgId: ORG_A,
      companyIds: ['company_key_b_alias'], contactBasis: BASIS, now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_not_configured',
  );
  const underOriginalKey = await evaluateTelegramCampaignSelection({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    companyIds: ['company_key_b_alias'], contactBasis: BASIS, now: NOW,
  });
  assert.equal(underOriginalKey.items[0]?.reasonCode, 'already_contacted');

  addCompany(db, { id: 'company_key_claim_guard', username: 'KeyClaimGuardClinic' });
  const pending = await approvedCampaign(
    db,
    ['company_key_claim_guard'],
    'campaign_key_claim_guard_0001',
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: pending.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_key_claim_guard_start', now: NOW,
  });
  await assert.rejects(
    claimNextTelegramCampaignRecipient({
      db: db.asD1(), dataKey: DATA_KEY_B, orgId: ORG_A,
      campaignId: pending.campaign.id, now: NOW,
    }),
    (error) => errorCode(error) === 'telegram_campaign_not_configured',
  );
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_campaign_recipients
    WHERE org_id = ? AND campaign_id = ?`, ORG_A, pending.campaign.id), 'pending');
  assert.equal(providerCalls, 1);
});

test('concurrent dispatch reserves both identities once and makes one provider effect', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  addCompany(db, { id: 'company_concurrent_guard', username: 'ConcurrentGuardClinic' });
  const created = await approvedCampaign(
    db,
    ['company_concurrent_guard'],
    'campaign_concurrent_guard_0001',
  );
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_concurrent_guard_start', now: NOW,
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: created.campaign.id, now: NOW,
  });
  assert.ok(claim);
  let providerCalls = 0;
  const sender: TelegramCampaignSender = {
    async send() {
      providerCalls += 1;
      await Promise.resolve();
      return { kind: 'sent', providerMessageId: 'concurrent-only-message' };
    },
  };
  const outcomes = await Promise.allSettled([
    dispatchClaimedTelegramCampaignRecipient({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, sender, now: NOW,
    }),
    dispatchClaimedTelegramCampaignRecipient({
      db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A, claim, sender, now: NOW,
    }),
  ]);
  assert.equal(providerCalls, 1);
  assert.ok(outcomes.some((outcome) => (
    outcome.status === 'fulfilled' && outcome.value.status === 'sent'
  )));
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
    WHERE org_id = ? AND state = 'sent'`, ORG_A), 4);
});

test('operator stop and maintenance DNC compensate a claimed partial dispatch exactly', async () => {
  for (const mode of ['stop', 'dnc'] as const) {
    const db = database();
    try {
      const staged = await stagePartialBeginDispatch(db, `terminal_${mode}`);
      if (mode === 'stop') {
        await transitionTelegramCampaign({
          db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
          campaignId: staged.campaignId, action: 'stop', operatorId: 'owner@example.test',
          idempotencyKey: 'campaign_partial_stop_terminal', now: NOW,
        });
        assert.equal(db.value(`SELECT status FROM lead_radar_tg_campaign_recipients
          WHERE org_id = ? AND id = ?`, ORG_A, staged.recipient_id), 'stopped');
      } else {
        db.sqlite.prepare(`UPDATE lead_radar_companies
          SET suppressed = 1, lifecycle = 'do_not_contact', updated_at = ?
          WHERE org_id = ? AND id = ?`)
          .run(NOW.toISOString(), ORG_A, staged.companyId);
        await maintainTelegramCampaigns({ db: db.asD1(), orgId: ORG_A, now: NOW });
        assert.equal(db.value(`SELECT status FROM lead_radar_tg_campaign_recipients
          WHERE org_id = ? AND id = ?`, ORG_A, staged.recipient_id), 'skipped_dnc');
      }
      assert.equal(db.value(`SELECT status FROM lead_radar_tg_campaign_effects
        WHERE org_id = ? AND id = ?`, ORG_A, staged.effect_id), 'canceled', mode);
      assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
        WHERE org_id = ? AND effect_id = ?`, ORG_A, staged.effect_id), 0, mode);
      assert.equal(db.value(`SELECT daily_reserved_count FROM lead_radar_tg_user_accounts
        WHERE org_id = ?`, ORG_A), 0, mode);
    } finally {
      db.sqlite.close();
    }
  }
});

test('operator stop never releases a dispatching uncertain effect', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const staged = await stagePartialBeginDispatch(db, 'terminal_dispatching', true);
  await transitionTelegramCampaign({
    db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
    campaignId: staged.campaignId, action: 'stop', operatorId: 'owner@example.test',
    idempotencyKey: 'campaign_partial_dispatching_stop', now: NOW,
  });
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_campaign_recipients
    WHERE org_id = ? AND id = ?`, ORG_A, staged.recipient_id), 'dispatching');
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_campaign_effects
    WHERE org_id = ? AND id = ?`, ORG_A, staged.effect_id), 'reserved');
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
    WHERE org_id = ? AND effect_id = ?`, ORG_A, staged.effect_id), 4);
  assert.equal(db.value(`SELECT daily_reserved_count FROM lead_radar_tg_user_accounts
    WHERE org_id = ?`, ORG_A), 1);

  const expired = new Date(NOW.getTime() - 1_000).toISOString();
  db.sqlite.prepare(`UPDATE lead_radar_tg_campaign_recipients
    SET lease_expires_at = ? WHERE org_id = ? AND id = ?`)
    .run(expired, ORG_A, staged.recipient_id);
  const recovered = await recoverTelegramCampaignLease({
    db: db.asD1(), orgId: ORG_A, campaignId: staged.campaignId,
    now: new Date(NOW.getTime() + 10 * 60_000),
  });
  assert.deepEqual(recovered, { released: 0, ambiguous: 1 });
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_campaign_effects
    WHERE org_id = ? AND id = ?`, ORG_A, staged.effect_id), 'ambiguous');
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
    WHERE org_id = ? AND effect_id = ? AND state = 'ambiguous'`,
  ORG_A, staged.effect_id), 4);
});

test('lease recovery compensates every claimed beginDispatch crash point and suppresses dispatching', async () => {
  for (const stage of [1, 2, 3, 4, 5, 6] as const) {
    const db = database();
    try {
      const companyId = `company_begin_crash_${stage}`;
      addCompany(db, { id: companyId, username: `BeginCrashClinic${stage}` });
      const created = await approvedCampaign(
        db,
        [companyId],
        `campaign_begin_crash_${stage}_0001`,
      );
      await transitionTelegramCampaign({
        db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
        campaignId: created.campaign.id, action: 'start', operatorId: 'owner@example.test',
        idempotencyKey: `campaign_begin_crash_${stage}_start`, now: NOW,
      });
      const claim = await claimNextTelegramCampaignRecipient({
        db: db.asD1(), dataKey: DATA_KEY, orgId: ORG_A,
        campaignId: created.campaign.id, now: NOW,
      });
      assert.ok(claim);
      const row = db.rows<{
        recipient_id: string;
        effect_id: string;
        endpoint_digest: string;
      }>(`SELECT recipient.id AS recipient_id, effect.id AS effect_id,
        recipient.endpoint_digest
        FROM lead_radar_tg_campaign_recipients recipient
        JOIN lead_radar_tg_campaign_effects effect
          ON effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
        WHERE recipient.org_id = ? AND recipient.campaign_id = ?`, ORG_A, created.campaign.id)[0];
      assert.ok(row);
      const nextDispatchAt = new Date(NOW.getTime() + 30_000).toISOString();
      const insertGuard = db.sqlite.prepare(`INSERT INTO lead_radar_tg_contact_history (
        org_id, identity_type, identity_key, company_id, endpoint_digest, state,
        campaign_id, recipient_id, effect_id, reservation_quota_day,
        reservation_next_dispatch_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, ?, ?, ?)`);
      insertGuard.run(
        ORG_A, 'company', companyId, companyId, row.endpoint_digest,
        created.campaign.id, row.recipient_id, row.effect_id,
        NOW.toISOString().slice(0, 10), nextDispatchAt, NOW.toISOString(), NOW.toISOString(),
      );
      if (stage >= 2) {
        insertGuard.run(
          ORG_A, 'endpoint', row.endpoint_digest, companyId, row.endpoint_digest,
          created.campaign.id, row.recipient_id, row.effect_id,
          NOW.toISOString().slice(0, 10), nextDispatchAt, NOW.toISOString(), NOW.toISOString(),
        );
      }
      if (stage >= 3) {
        for (const identity of db.rows<{ identity_digest: string }>(
          `SELECT identity_digest FROM lead_radar_tg_recipient_business_identities
           WHERE org_id = ? AND recipient_id = ? ORDER BY identity_digest`,
          ORG_A,
          row.recipient_id,
        )) {
          insertGuard.run(
            ORG_A, 'business', identity.identity_digest, companyId, row.endpoint_digest,
            created.campaign.id, row.recipient_id, row.effect_id,
            NOW.toISOString().slice(0, 10), nextDispatchAt,
            NOW.toISOString(), NOW.toISOString(),
          );
        }
      }
      if (stage >= 4) {
        db.sqlite.prepare(`UPDATE lead_radar_tg_user_accounts
          SET quota_day = ?, daily_reserved_count = daily_reserved_count + 1,
            next_dispatch_at = ?, updated_at = ? WHERE org_id = ?`)
          .run(
            NOW.toISOString().slice(0, 10),
            nextDispatchAt,
            NOW.toISOString(),
            ORG_A,
          );
      }
      if (stage >= 5) {
        db.sqlite.prepare(`UPDATE lead_radar_tg_campaign_recipients
          SET status = 'dispatching', attempt_count = 1,
            dispatching_at = ?, updated_at = ? WHERE org_id = ? AND id = ?`)
          .run(NOW.toISOString(), NOW.toISOString(), ORG_A, row.recipient_id);
      }
      if (stage >= 6) {
        db.sqlite.prepare(`UPDATE lead_radar_tg_campaign_effects
          SET status = 'dispatching', updated_at = ? WHERE org_id = ? AND id = ?`)
          .run(NOW.toISOString(), ORG_A, row.effect_id);
      }
      const expired = new Date(NOW.getTime() - 1_000).toISOString();
      db.sqlite.prepare(`UPDATE lead_radar_tg_user_accounts
        SET dispatch_lease_expires_at = ? WHERE org_id = ?`).run(expired, ORG_A);
      db.sqlite.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET lease_expires_at = ? WHERE org_id = ? AND id = ?`)
        .run(expired, ORG_A, row.recipient_id);

      const recovered = await recoverTelegramCampaignLease({
        db: db.asD1(), orgId: ORG_A, campaignId: created.campaign.id,
        now: new Date(NOW.getTime() + 10 * 60_000),
      });
      if (stage <= 4) {
        assert.deepEqual(recovered, { released: 1, ambiguous: 0 }, `stage ${stage}`);
        assert.equal(db.value(
          'SELECT status FROM lead_radar_tg_campaign_recipients WHERE id = ?',
          row.recipient_id,
        ), 'pending', `stage ${stage}`);
        assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
          WHERE org_id = ? AND effect_id = ?`, ORG_A, row.effect_id), 0, `stage ${stage}`);
        assert.equal(db.value(`SELECT daily_reserved_count FROM lead_radar_tg_user_accounts
          WHERE org_id = ?`, ORG_A), 0, `stage ${stage}`);
      } else {
        assert.deepEqual(recovered, { released: 0, ambiguous: 1 }, `stage ${stage}`);
        assert.equal(db.value(
          'SELECT status FROM lead_radar_tg_campaign_recipients WHERE id = ?',
          row.recipient_id,
        ), 'ambiguous', `stage ${stage}`);
        assert.equal(db.value(
          'SELECT status FROM lead_radar_tg_campaign_effects WHERE id = ?',
          row.effect_id,
        ), 'ambiguous', `stage ${stage}`);
        assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_contact_history
          WHERE org_id = ? AND effect_id = ? AND state = 'ambiguous'`,
        ORG_A, row.effect_id), 4, `stage ${stage}`);
        assert.equal(db.value(`SELECT daily_reserved_count FROM lead_radar_tg_user_accounts
          WHERE org_id = ?`, ORG_A), 1, `stage ${stage}`);
      }
    } finally {
      db.sqlite.close();
    }
  }
});

// Local regression acceptance for defects first reproduced on f662848.
// Synthetic SQLite + blocked network. No production acceptance is implied.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { SqliteD1 } from '../../../tests/helpers/sqlite-d1';
import { LeadRadarStore } from '../../../functions/platform/lead-radar/store';
import { resumeStalledLeadRadarSearches } from '../../../functions/platform/lead-radar/queue';
import { robotsAllows } from '../../../functions/platform/lead-radar/sources';
import { createContactSourceQueueDependencies } from '../../../functions/platform/lead-radar/contact-source-worker';
import { confirmCompanyWebsiteOwnership } from '../../../functions/platform/lead-radar/ownership-confirmation';
import type { StoredLeadInput } from '../../../functions/platform/lead-radar/types';

const ROOT = resolve(import.meta.dirname, '../../..');
const ORG = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = new Date('2026-08-30T12:00:00.000Z');
const OLD = '2026-08-29T12:00:00.000Z';
const TOP_POLICY = 'User-agent: *\nDisallow: */search/\n';
function database() {
  const db = new SqliteD1();
  db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
  for (const file of ['0036_lead_radar.sql', '0041_lead_radar_search_leases.sql',
    '0042_lead_radar_decision_makers.sql', '0043_lead_radar_async_funnel.sql',
    '0050_lead_radar_contact_discovery.sql', '0052_lead_radar_contact_sources.sql',
    '0054_lead_radar_candidate_pool_resume.sql']) {
    db.exec(readFileSync(resolve(ROOT, 'migrations', file), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(file);
  }
  db.sqlite.prepare(`INSERT INTO lead_radar_searches(id,org_id,input_json,status,phase,created_at)
    VALUES ('audit_search',?,?,'running','enriching',?)`).run(ORG,
    JSON.stringify({niche:'dentist',city:'Ташкент',country:'UZ',desiredCount:5,searchGoal:'telegram_contacts'}), OLD);
  return db;
}
function lead(): StoredLeadInput {
  return {canonicalKey:'audit_company',name:'Audit Fixture Corporation',category:'dentist',
    city:'Ташкент',country:'UZ',address:'Ташкент',website:'https://example.org',phone:null,
    genericEmail:null,telegramUrl:null,telegramContact:null,decisionMakers:[],
    enrichmentStatus:'terminal',enrichmentReason:'no_website',enrichmentAttempts:0,
    score:10,confidence:0.8,priority:'P3',lifecycle:'new',suppressed:false,
    scoreComponents:[],signals:[],evidence:[],discoveredAt:OLD,lastVerifiedAt:OLD};
}

test('CY-02: actual robots rule denies the hard-coded top.uz search path', () => {
  assert.equal(robotsAllows(TOP_POLICY,new URL('https://top.uz/search/?text=fixture')),false);
  assert.equal(robotsAllows(TOP_POLICY,new URL('https://top.uz/company/fixture')),true);
});

test('CY-02: unavailable free source must not be stored as complete/no-match', async (t) => {
  const db=database(); t.after(()=>db.sqlite.close());
  const store=new LeadRadarStore(db.asD1());
  const fixtureLead=lead();
  const companyId=await store.insertLead(ORG,'audit_search',fixtureLead); assert.ok(companyId);
  const job=await store.createJob(ORG,'audit_search',companyId,'enrichment',`contact-resolve:audit_search:${companyId}`,NOW.toISOString());
  db.sqlite.prepare(`UPDATE lead_radar_jobs SET status='running',lease_owner='audit',lease_generation=1,lease_expires_at=? WHERE id=?`)
    .run('2026-08-30T13:00:00.000Z',job.id);
  const prior=globalThis.fetch; let networkCalls=0;
  globalThis.fetch=async()=>{networkCalls++;throw new Error('offline audit: no network');};
  t.after(()=>{globalThis.fetch=prior;});
  const deps=await createContactSourceQueueDependencies({},db.asD1(),ORG,{now:()=>NOW,robots:async()=>TOP_POLICY,readPage:async()=>null});
  await deps.discoverLeadContactSources!({...job,status:'running',leaseOwner:'audit',leaseGeneration:1},fixtureLead as never);
  assert.equal(networkCalls,0);
  const row=db.rows<{status:string;reason:string;sources_json:string}>('SELECT status,reason,sources_json FROM lead_radar_contact_enrichments')[0];
  assert.deepEqual({...row},{status:'unavailable',reason:'free_catalog_page_1_unavailable',sources_json:'[]'});
});

test('unsupported free catalog coverage is visible and does not block existing contact resolution on every delivery',async(t)=>{
  const db=database();t.after(()=>db.sqlite.close());const store=new LeadRadarStore(db.asD1());
  const fixtureLead={...lead(),category:'unverified_niche'};
  const companyId=await store.insertLead(ORG,'audit_search',fixtureLead);assert.ok(companyId);
  const job=await store.createJob(ORG,'audit_search',companyId,'enrichment',`contact-resolve:audit_search:${companyId}`,NOW.toISOString());
  db.sqlite.prepare("UPDATE lead_radar_jobs SET status='running',lease_owner='audit',lease_generation=1,lease_expires_at=? WHERE id=?")
    .run('2026-08-30T13:00:00.000Z',job.id);
  let policyReads=0;
  const deps=await createContactSourceQueueDependencies({},db.asD1(),ORG,{now:()=>NOW,
    robots:async()=>{policyReads++;return TOP_POLICY;},readPage:async()=>{throw new Error('unsupported category must not be fetched');}});
  const active={...job,status:'running' as const,leaseOwner:'audit',leaseGeneration:1};
  const first=await deps.discoverLeadContactSources!(active,fixtureLead as never);
  assert.equal(first.retryAfterSeconds,15,'unsupported adapter must not add a 15-minute delay before existing candidates');
  assert.equal(db.value('SELECT reason FROM lead_radar_contact_enrichments'),'free_catalog_niche_not_supported');
  assert.deepEqual(await deps.discoverLeadContactSources!(active,fixtureLead as never),{pending:false});
  assert.equal(policyReads,1);
});

test('CY-03: regenerated queued budget job allows resume and watchdog actually rotates',async(t)=>{
  const db=database();t.after(()=>db.sqlite.close());
  const store=new LeadRadarStore(db.asD1());
  const companyId=await store.insertLead(ORG,'audit_search',lead());assert.ok(companyId);
  const discovery=await store.createJob(ORG,'audit_search',null,'discovery','discovery:audit_search',OLD);
  db.sqlite.prepare("UPDATE lead_radar_jobs SET status='completed',completed_at=? WHERE id=?").run(OLD,discovery.id);
  const child=await store.createJob(ORG,'audit_search',companyId,'enrichment',`contact-resolve:audit_search:${companyId}`,NOW.toISOString());
  db.sqlite.prepare("UPDATE lead_radar_jobs SET last_error_code='contact_sources_search_budget_exhausted' WHERE id=?").run(child.id);
  db.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools(org_id,search_id,candidates_json,candidate_count,cursor,target,stop_reason,created_at,expires_at,updated_at)
    VALUES (?,'audit_search',NULL,25,10,5,'time_limit',?,?,?)`).run(ORG,OLD,OLD,OLD);
  await resumeStalledLeadRadarSearches(db.asD1(),NOW);
  await resumeStalledLeadRadarSearches(db.asD1(),new Date(NOW.getTime()+900000));
  assert.equal(db.value('SELECT resume_count FROM lead_radar_candidate_pools'),1);
  assert.equal(db.value('SELECT updated_at FROM lead_radar_candidate_pools'),NOW.toISOString());
});

test('CY-05: R4 refuses model-inferred endpoints and never promotes sibling links',async(t)=>{
  const db=database();t.after(()=>db.sqlite.close());
  const store=new LeadRadarStore(db.asD1());
  const companyId=await store.insertLead(ORG,'audit_search',lead());assert.ok(companyId);
  const insert=db.sqlite.prepare(`INSERT INTO lead_radar_evidence(id,org_id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification)
    VALUES (?,?,?,'web.telegram.unknown',?,'https://example.org/contact','company_website','2026-01-01T00:00:00.000Z',0.4,'model_inference')`);
  insert.run('ev_audit_one',ORG,companyId,'https://t.me/audit_fixture_one');
  insert.run('ev_audit_two',ORG,companyId,'https://t.me/audit_fixture_two');
  const result=await confirmCompanyWebsiteOwnership({db:db.asD1(),orgId:ORG,companyId,operatorId:'offline-audit',now:NOW,
    candidateKey:'telegram:https://t.me/audit_fixture_one',readPage:async()=>{throw new Error('must reject before fetch');}});
  assert.equal(result.confirmedEndpoints,0);
  assert.equal(db.value("SELECT count(*) FROM lead_radar_evidence WHERE field_path='web.telegram.business'"),0);
});

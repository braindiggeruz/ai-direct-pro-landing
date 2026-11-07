import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { SqliteD1 } from './helpers/sqlite-d1';
import { ingestOutreachInboxEvent, listOutreachInbox, maintainOutreachInbox, classifyOutreachInbox, parseOutreachInboxEvent } from '../functions/platform/lead-radar/outreach-inbox';
import { OutreachInboxStore, hasPendingOutreachOptOut } from '../functions/platform/lead-radar/outreach-inbox-store';
import { handleOutreachInboxIngest, readOutreachInboxJson } from '../functions/platform/lead-radar/outreach-inbox-http';
import { onRequest as ownerInbox } from '../functions/api/admin/lead-radar/inbox';
import { callRoute, platformToken, OWNER_EMAIL } from './helpers/bormi-admin-fixture';
import { ownerOrgId } from '../functions/platform/lead-radar';
import type { Env } from '../functions/_types';
import type { LeadRadarInboxEvent } from '../src/shared/lead-radar-inbox';

const A='org_'+'a'.repeat(32),B='org_'+'b'.repeat(32),NOW=new Date('2026-11-07T10:00:00.000Z');
const KEY=Buffer.alloc(32,9).toString('base64url'),TOKEN=Buffer.alloc(32,17).toString('base64url');
const hex=(n:number)=>n.toString(16).padStart(32,'0');
const ACCOUNT='lrtgua_'+hex(1),EFFECT='lrtgce_'+hex(1);
const MIGRATIONS=['0036_lead_radar.sql','0041_lead_radar_search_leases.sql','0042_lead_radar_decision_makers.sql','0043_lead_radar_async_funnel.sql','0044_lead_radar_telegram_business.sql','0045_lead_radar_telegram_campaigns.sql','0046_lead_radar_telegram_campaign_safety.sql','0047_lead_radar_telegram_campaign_media.sql','0048_lead_radar_telegram_media_quota.sql','0050_lead_radar_contact_discovery.sql','0054_lead_radar_candidate_pool_resume.sql','0080_lead_radar_outreach_inbox.sql'];

function put(db:SqliteD1,table:string,values:Record<string,string|number|null>) {
  db.sqlite.prepare(`INSERT INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(()=>'?').join(',')})`).run(...Object.values(values));
}
function company(db:SqliteD1,id:string,orgId=A,domain=id+'.example') {
  put(db,'lead_radar_searches',{id:'search_'+id,org_id:orgId,input_json:'{}',status:'ready',created_at:NOW.toISOString()});
  put(db,'lead_radar_companies',{id,org_id:orgId,search_id:'search_'+id,canonical_key:'fixture:'+id,name:'Company '+id,category:'services',city:'Tashkent',country:'UZ',score:70,confidence:.9,priority:'P2',score_components_json:'[]',signals_json:'[]',discovered_at:NOW.toISOString(),last_verified_at:NOW.toISOString(),updated_at:NOW.toISOString(),website:'https://'+domain,domain,name_city_key:id+':tashkent',phone:'+998711234567',phone_digits:'998711234567'});
}
function campaign(db:SqliteD1,n=1,orgId=A) {
  const stamp=NOW.toISOString(),digest=hex(n).repeat(2),account='lrtgua_'+hex(n),approval='lrtgap_'+hex(n),campaign='lrtgcp_'+hex(n),recipient='lrtgcr_'+hex(n),effect='lrtgce_'+hex(n);
  company(db,'company_'+n,orgId);
  put(db,'lead_radar_tg_user_accounts',{id:account,org_id:orgId,masked_label:'Fixture',status:'connected',gateway_account_ref:'fixture_account_'+hex(n),gateway_account_ref_digest:digest,auth_request_digest:digest,request_idempotency_digest:digest,request_fingerprint:digest,connected_at:stamp,created_at:stamp,updated_at:stamp});
  put(db,'lead_radar_tg_campaign_approvals',{id:approval,org_id:orgId,account_id:account,token_digest:digest,idempotency_key_digest:digest,selection_digest:digest,content_digest:digest,request_fingerprint:digest,operator_digest:digest,contact_basis:'existing_relationship',recipient_count:1,expires_at:'2026-11-08T10:00:00.000Z',created_at:stamp});
  put(db,'lead_radar_tg_campaigns',{id:campaign,org_id:orgId,account_id:account,approval_id:approval,idempotency_key_digest:digest,request_fingerprint:digest,selection_digest:digest,content_digest:digest,operator_digest:digest,contact_basis:'existing_relationship',template_ciphertext:'a'.repeat(24),template_iv:'a'.repeat(16),status:'running',recipient_count:1,min_interval_seconds:120,next_send_at:stamp,approved_at:stamp,created_at:stamp,updated_at:stamp});
  put(db,'lead_radar_tg_campaign_recipients',{id:recipient,org_id:orgId,campaign_id:campaign,company_id:'company_'+n,sequence_no:1,endpoint_ciphertext:'a'.repeat(24),endpoint_iv:'a'.repeat(16),endpoint_digest:digest,payload_ciphertext:'a'.repeat(24),payload_iv:'a'.repeat(16),rendered_content_digest:digest,contact_fingerprint:digest,status:'sent',provider_message_digest:digest,sent_at:stamp,completed_at:stamp,created_at:stamp,updated_at:stamp});
  put(db,'lead_radar_tg_campaign_effects',{id:effect,org_id:orgId,campaign_id:campaign,recipient_id:recipient,effect_key_digest:digest,payload_digest:digest,status:'sent',provider_message_digest:digest,created_at:stamp,updated_at:stamp,completed_at:stamp});
}
function fixture(orgId=A) {
  const db=new SqliteD1();
  db.exec('CREATE TABLE organizations (id TEXT PRIMARY KEY)');
  for(const name of MIGRATIONS)db.exec(readFileSync(path.join(import.meta.dirname,'..','migrations',name),'utf8'));
  campaign(db,1,orgId);campaign(db,2,B);return db;
}
function event(changes:Partial<LeadRadarInboxEvent>={}):LeadRadarInboxEvent {return {schemaVersion:1,orgId:A,accountId:ACCOUNT,outboundEffectId:EFFECT,externalEventId:'telegram:message:100',kind:'reply',occurredAt:NOW.toISOString(),text:'Здравствуйте. Пришлите предложение.',...changes};}
const ingest=(db:SqliteD1,changes:Partial<LeadRadarInboxEvent>={},now=NOW)=>ingestOutreachInboxEvent({db:db.asD1(),dataKey:KEY,event:event(changes),now});

test('real reply is encrypted, tenant-scoped, linked to sent effect and idempotent',async()=>{
  const db=fixture(),first=await ingest(db),second=await ingest(db);
  assert.equal(first.replayed,false);assert.equal(second.replayed,true);assert.equal(first.id,second.id);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_outreach_inbox'),1);
  const stored=db.rows<Record<string,unknown>>('SELECT * FROM lead_radar_outreach_inbox')[0];
  assert.ok(!JSON.stringify(stored).includes(event().text!));assert.equal(stored.company_id,'company_1');
  assert.ok(String(stored.body_ciphertext).length>20);assert.equal(stored.body_iv?.toString().length,16);
  const page=await listOutreachInbox({db:db.asD1(),orgId:A,dataKey:KEY,now:NOW});
  assert.equal(page.items[0].text,event().text);assert.equal(page.items[0].bodyState,'available');
  assert.equal(db.value("SELECT lifecycle FROM lead_radar_companies WHERE id='company_1'"),'replied');
  assert.deepEqual((await listOutreachInbox({db:db.asD1(),orgId:B,dataKey:KEY,now:NOW})).items,[]);
});

test('changed payload, kind, effect or timestamp on replay is a conflict with no side effects',async()=>{
  const db=fixture();await ingest(db);
  for(const change of [{text:'Другое'},{kind:'opt_out' as const},{outboundEffectId:'lrtgce_'+hex(2)},{occurredAt:'2026-11-07T10:00:01.000Z'}])await assert.rejects(ingest(db,change),/inbox_conflict/);
  assert.equal(db.value("SELECT suppressed FROM lead_radar_companies WHERE id='company_1'"),0);
  assert.equal(await hasPendingOutreachOptOut(db.asD1(),A,ACCOUNT),false);
});

test('foreign org/account, missing and non-sent effects are rejected; arbitrary company ids rejected',async()=>{
  const db=fixture();
  for(const change of [{orgId:B},{accountId:'lrtgua_'+hex(2)},{outboundEffectId:'lrtgce_'+hex(99)}])await assert.rejects(ingest(db,change),/inbox_effect_unavailable/);
  assert.throws(()=>parseOutreachInboxEvent({...event(),companyId:'company_2'},NOW),/inbox_invalid_event/);
  db.exec("UPDATE lead_radar_tg_campaign_effects SET status='failed',provider_message_digest=NULL");
  await assert.rejects(ingest(db),/inbox_effect_unavailable/);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_outreach_inbox'),0);
});

test('reply only promotes new/contacted and never downgrades later stages or DNC',async()=>{
  for(const stage of ['new','contacted','replied','qualified','meeting','won','lost','do_not_contact']) {
    const db=fixture();db.sqlite.prepare("UPDATE lead_radar_companies SET lifecycle=?,suppressed=? WHERE id='company_1'").run(stage,stage==='do_not_contact'?1:0);
    await ingest(db);assert.equal(db.value("SELECT lifecycle FROM lead_radar_companies WHERE id='company_1'"),['new','contacted'].includes(stage)?'replied':stage);db.sqlite.close();
  }
});

test('concurrent duplicate ingestion writes one event and one replay',async()=>{
  const db=fixture(),results=await Promise.all([ingest(db),ingest(db)]);
  assert.deepEqual(results.map((r)=>r.replayed).sort(),[false,true]);assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_outreach_inbox'),1);
});

test('provider seconds precision allows the same second but never an earlier unrelated reply',async()=>{
  const db=fixture();db.exec("UPDATE lead_radar_tg_campaign_effects SET created_at='2026-11-07T10:00:00.900Z'");
  await ingest(db);assert.equal(db.value('SELECT occurred_at FROM lead_radar_outreach_inbox'),NOW.toISOString());
  await assert.rejects(ingest(db,{externalEventId:'older',occurredAt:'2026-11-07T09:59:59.000Z'}),/inbox_effect_unavailable/);
});

test('explicit opt-out uses org-wide historical alias suppression and never touches another org safety',async()=>{
  const db=fixture();company(db,'history',A,'company_1.example');
  put(db,'lead_radar_tg_account_safety',{org_id:A,account_id:ACCOUNT,state:'restricted',reason_code:'account_restricted',created_at:NOW.toISOString(),updated_at:NOW.toISOString()});
  const result=await ingest(db,{kind:'opt_out',text:'Больше не пишите'});
  assert.equal(result.workflowState,'applied');
  assert.equal(db.value("SELECT COUNT(*) FROM lead_radar_companies WHERE org_id=? AND suppressed=1",A),2);
  assert.equal(db.value("SELECT suppressed FROM lead_radar_companies WHERE org_id=?",B),0);
  assert.equal(db.value('SELECT state FROM lead_radar_tg_account_safety'),'restricted');
  assert.ok(Number(db.value('SELECT COUNT(*) FROM lead_radar_suppressions WHERE org_id=?',A))>0);
  assert.equal(await hasPendingOutreachOptOut(db.asD1(),A,ACCOUNT),false);
});

test('crash before DNC leaves durable account barrier, and replay completes it',async()=>{
  const db=fixture(),original=db.batch.bind(db);let fail=true;
  db.batch=async(statements)=>{if(fail && statements.some((s)=>s.sql.includes('INSERT INTO lead_radar_suppressions'))){fail=false;throw new Error('simulated');}return original(statements);};
  await assert.rejects(ingest(db,{kind:'opt_out'}));
  assert.equal(await hasPendingOutreachOptOut(db.asD1(),A,ACCOUNT),true);
  assert.equal(await hasPendingOutreachOptOut(db.asD1(),B,'lrtgua_'+hex(2)),false);
  assert.equal(db.value("SELECT suppressed FROM lead_radar_companies WHERE id='company_1'"),0);
  assert.equal((await ingest(db,{kind:'opt_out'})).replayed,true);
  assert.equal(await hasPendingOutreachOptOut(db.asD1(),A,ACCOUNT),false);
});

test('crash after DNC keeps gate closed and maintenance resumes without reverting unrelated safety',async()=>{
  const db=fixture(),original=db.prepare.bind(db);let fail=true;
  put(db,'lead_radar_tg_account_safety',{org_id:A,account_id:ACCOUNT,state:'cooldown',reason_code:'flood_wait',blocked_until:'2026-11-08T10:00:00.000Z',created_at:NOW.toISOString(),updated_at:NOW.toISOString()});
  db.prepare=(sql)=>{const statement=original(sql);if(fail && sql.includes("AND kind='opt_out' AND workflow_state='pending'" ) && sql.includes('UPDATE lead_radar_outreach_inbox')){statement.run=async()=>{fail=false;throw new Error('simulated after DNC');};}return statement;};
  await assert.rejects(ingest(db,{kind:'opt_out'}));
  assert.equal(db.value("SELECT suppressed FROM lead_radar_companies WHERE id='company_1'"),1);
  assert.equal(await hasPendingOutreachOptOut(db.asD1(),A,ACCOUNT),true);
  assert.deepEqual(await maintainOutreachInbox({db:db.asD1(),orgId:A,now:NOW}),{applied:1,pending:0,purgedBodies:0});
  assert.equal(await hasPendingOutreachOptOut(db.asD1(),A,ACCOUNT),false);assert.equal(db.value('SELECT state FROM lead_radar_tg_account_safety'),'cooldown');
});

test('body TTL purges ciphertext but preserves replay and pending opt-out gate',async()=>{
  const db=fixture(),original=db.batch.bind(db);db.batch=async(statements)=>{if(statements.some((s)=>s.sql.includes('INSERT INTO lead_radar_suppressions')))throw new Error('DNC interrupted');return original(statements);};
  await assert.rejects(ingest(db,{kind:'opt_out'}));
  const later=new Date('2026-11-15T10:00:00.000Z');
  const before=await listOutreachInbox({db:db.asD1(),orgId:A,dataKey:KEY,now:later});assert.equal(before.items[0].text,null);assert.equal(before.items[0].bodyState,'expired');
  assert.equal(await new OutreachInboxStore(db.asD1()).purgeExpiredBodies(A,later.toISOString()),1);
  assert.equal(db.value('SELECT body_ciphertext FROM lead_radar_outreach_inbox'),null);
  assert.equal(await hasPendingOutreachOptOut(db.asD1(),A,ACCOUNT,{schemaRequired:false}),true);
  db.batch=original;assert.equal((await ingest(db,{kind:'opt_out'},later)).replayed,true);
  assert.equal(db.value('SELECT body_ciphertext FROM lead_radar_outreach_inbox'),null);
});

test('old event never stores expired text and wrong key never exposes ciphertext',async()=>{
  const db=fixture();await ingest(db,{},new Date('2026-11-15T10:00:00.000Z'));assert.equal(db.value('SELECT body_ciphertext FROM lead_radar_outreach_inbox'),null);
  const other=fixture();await ingest(other);
  assert.equal((await listOutreachInbox({db:other.asD1(),orgId:A,dataKey:Buffer.alloc(32,4).toString('base64url'),now:NOW})).items[0].bodyState,'unavailable');
});

test('manual classification is tenant scoped and never grants consent, DNC or lifecycle',async()=>{
  const db=fixture(),result=await ingest(db);
  await classifyOutreachInbox({db:db.asD1(),orgId:A,id:result.id,classification:'interested',now:NOW});
  assert.equal(db.value('SELECT classification FROM lead_radar_outreach_inbox'),'interested');
  assert.equal(db.value("SELECT lifecycle FROM lead_radar_companies WHERE id='company_1'"),'replied');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_contact_authorizations'),0);
  await assert.rejects(classifyOutreachInbox({db:db.asD1(),orgId:B,id:result.id,classification:'declined'}),/inbox_not_found/);
  await assert.rejects(classifyOutreachInbox({db:db.asD1(),orgId:A,id:result.id,classification:'won'}),/inbox_invalid_classification/);
  const optout=await ingest(db,{externalEventId:'optout2',kind:'opt_out'});
  await assert.rejects(classifyOutreachInbox({db:db.asD1(),orgId:A,id:optout.id,classification:'needs_reply'}),/inbox_not_found/);
});

test('keyset pagination is stable for equal received timestamps and rejects malformed cursor',async()=>{
  const db=fixture();for(let i=0;i<5;i++)await ingest(db,{externalEventId:'reply'+i});
  const ids:string[]=[];let cursor:string|undefined;
  do {const page=await listOutreachInbox({db:db.asD1(),orgId:A,dataKey:KEY,now:NOW,limit:2,cursor});ids.push(...page.items.map((r)=>r.id));cursor=page.nextCursor??undefined;}while(cursor);
  assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);
  await assert.rejects(listOutreachInbox({db:db.asD1(),orgId:A,cursor:'not_a_cursor'}),/inbox_invalid_cursor/);
});

test('schema missing is closed when required; disabling ingestion cannot bypass installed pending barrier',async()=>{
  const db=new SqliteD1();assert.equal(await hasPendingOutreachOptOut(db.asD1(),A,ACCOUNT,{schemaRequired:false}),false);
  await assert.rejects(hasPendingOutreachOptOut(db.asD1(),A,ACCOUNT),/schema_unavailable/);
  db.prepare=()=>{throw new Error('storage unavailable');};await assert.rejects(hasPendingOutreachOptOut(db.asD1(),A,ACCOUNT,{schemaRequired:false}),/storage unavailable/);
});

test('internal ingress is default-off, independently authenticated, allowlisted and no-store',async()=>{
  const db=fixture(),env={GPTBOT_DRAFTS_DB:db.asD1(),LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY:KEY,LEAD_RADAR_OUTREACH_INBOX_TOKEN:TOKEN,LEAD_RADAR_ALLOWED_ORGS:A} as Env;
  const request=(token=TOKEN)=>new Request('https://gptbot.uz/api/internal/lead-radar-inbox',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(event())});
  assert.equal((await handleOutreachInboxIngest(request(),env)).status,503);env.LEAD_RADAR_OUTREACH_INBOX_ENABLED='true';
  assert.equal((await handleOutreachInboxIngest(request('wrong'),env)).status,401);
  const denied=await handleOutreachInboxIngest(request(),{...env,LEAD_RADAR_ALLOWED_ORGS:B});assert.equal(denied.status,403);
  const response=await handleOutreachInboxIngest(request(),env);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal((await handleOutreachInboxIngest(new Request(request().url),env)).status,405);
});

test('streaming byte cap rejects oversized requests before JSON parsing, even without content-length',async()=>{
  const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('x'.repeat(25_000)));controller.close();}});
  await assert.rejects(readOutreachInboxJson(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body,duplex:'half'} as RequestInit)),/inbox_invalid_event/);
  assert.throws(()=>parseOutreachInboxEvent(event({text:'x'.repeat(4097)}),NOW),/inbox_invalid_event/);
  assert.throws(()=>parseOutreachInboxEvent(event({occurredAt:'2026-11-07T10:10:00.000Z'}),NOW),/inbox_invalid_event/);
});

test('owner inbox enforces owner role, derived tenant, origin and honest disabled state',async()=>{
  const orgId=await ownerOrgId(OWNER_EMAIL),db=fixture(orgId),token=await platformToken('platform_owner'),env={LEAD_RADAR_ALLOWED_ORGS:orgId,LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY:KEY};
  assert.equal((await callRoute(ownerInbox,db,'/api/admin/lead-radar/inbox',{token:await platformToken('support_readonly'),env})).status,403);
  const empty=await callRoute(ownerInbox,db,'/api/admin/lead-radar/inbox',{token,env});assert.equal(empty.status,200);assert.equal(empty.body.availability,'disabled');assert.equal(empty.headers.get('Cache-Control'),'no-store');
  const first=await ingest(db,{orgId});
  const options={token,env,method:'PATCH',body:{id:first.id,classification:'interested'}};
  assert.equal((await callRoute(ownerInbox,db,'/api/admin/lead-radar/inbox',{...options,headers:{Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await callRoute(ownerInbox,db,'/api/admin/lead-radar/inbox',{...options,headers:{Origin:'https://gptbot.uz'}})).status,200);
});

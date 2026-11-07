import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import * as route from '../functions/api/admin/lead-radar/[[path]]';
import { connectOutreachAccount, probeOutreachAccount } from '../functions/platform/lead-radar/outreach-account';
import { tgSenderConfiguration, configuredTgSender } from '../functions/platform/lead-radar/outreach-transport';
import { createTelegramUserAccountPending, getTelegramUserAccount } from '../functions/platform/lead-radar/telegram-campaign';
import { ownerOrgId } from '../functions/platform/lead-radar';
import { TG_SENDER_SCHEMA, TG_SENDER_PREFIX } from '../functions/platform/lead-radar/tg-sender-contract';
import { OutreachAccountStore } from '../functions/platform/lead-radar/outreach-account-store';
import { connectedAccount, approvedCampaign, addCompany, ORG_A, DATA_KEY, NOW } from './helpers/lead-radar-outreach-fixture';
import { freshAdminDb, migrationFiles, platformToken, OWNER_EMAIL, callRoute } from './helpers/bormi-admin-fixture';
import type { Env } from '../functions/_types';

const KEY=Buffer.alloc(32,37).toString('base64url'),TOKEN=Buffer.alloc(32,39).toString('base64url');
const ACCOUNT='lrtgua_'+'7'.repeat(32),REF='tgs_fixture_account_reference',FINGERPRINT='7'.repeat(64);
async function fixture(orgIdOverride?:string,dataKey=KEY) {
  const db=freshAdminDb(),orgId=orgIdOverride??await ownerOrgId(OWNER_EMAIL);
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE)');
  for(const name of migrationFiles())db.sqlite.prepare('INSERT OR IGNORE INTO d1_migrations(name) VALUES (?)').run(name);
  const binding={org_id:orgId,account_id:ACCOUNT,account_ref:REF,sender_fingerprint:FINGERPRINT};
  const env={GPTBOT_DRAFTS_DB:db.asD1(),LEAD_RADAR_ALLOWED_ORGS:orgId,LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED:'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED:'true',LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED:'false',
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE:'tg_sender',LEAD_RADAR_TG_SENDER_ORIGIN:'https://fixture-sender.up.railway.app',
    LEAD_RADAR_TG_SENDER_TOKEN:TOKEN,LEAD_RADAR_TG_SENDER_BINDING_JSON:JSON.stringify(binding),
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY:dataKey} as Env;
  return {db,orgId,binding,env};
}
function status(binding:Record<string,string>,overrides:Record<string,unknown>={}) {
  return {schema:TG_SENDER_SCHEMA,binding,ready:true,reason_code:null,checked_at:new Date().toISOString(),provider_verified_at:new Date().toISOString(),retry_after_seconds:null,
    masked_label:'TG Sender fixture',capabilities:{text:true,media:false,durable_idempotency:true,sender_lock:true,persisted_cooldown:true,
      independent_scheduler:false,opaque_peer_refs:true,username_resolution:true,public_business_inquiry:false},...overrides};
}
function mockSender(context:TestContext,binding:Record<string,string>,body?:()=>unknown,requestBinding?:()=>Record<string,string>) {
  const calls:{url:string;method:string}[]=[];
  context.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);calls.push({url,method:init?.method??'GET'});
    const probe=url.endsWith('/session/probe');
    assert.equal(url,`https://fixture-sender.up.railway.app${TG_SENDER_PREFIX}${probe?'/session/probe':'/status'}`);
    assert.equal(init?.method,probe?'POST':'GET');
    if(probe)assert.deepEqual(JSON.parse(String(init?.body)),{schema:TG_SENDER_SCHEMA,binding:requestBinding?.()??binding});
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+TOKEN);
    assert.equal(init?.redirect,'error');
    return Response.json(body?body():status(binding));
  });return calls;
}

test('remote account is pinned, freshly attested, idempotent and does not dispatch a message',async(context)=>{
  const {db,orgId,binding,env}=await fixture(),calls=mockSender(context,binding);
  const input={env,db:db.asD1(),orgId,dataKey:KEY,idempotencyKey:'remote_connect_fixture_0001'};
  const first=await connectOutreachAccount(input),second=await connectOutreachAccount(input);
  assert.equal(first.id,ACCOUNT);assert.equal(first.status,'connected');assert.equal(second.id,first.id);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id=?',orgId),1);
  assert.ok(calls.length>=3);assert.ok(calls.some((call)=>call.method==='POST'&&call.url.endsWith('/session/probe')));
  assert.ok(!JSON.stringify(first).includes(REF));assert.ok(!JSON.stringify(first).includes(TOKEN));
  assert.equal((await probeOutreachAccount({...input,account:first})).ready,true);
});

test('remote connection rejects foreign tenant, host/token tampering and existing legacy account',async(context)=>{
  const {db,orgId,binding,env}=await fixture();mockSender(context,binding);
  assert.equal(tgSenderConfiguration(env,'org_'+'f'.repeat(32)),null);
  for(const origin of ['http://fixture-sender.up.railway.app','https://evil.example','https://fixture-sender.up.railway.app.evil.example','https://fixture-sender.up.railway.app/api','https://u:p@fixture-sender.up.railway.app/'])assert.equal(tgSenderConfiguration({...env,LEAD_RADAR_TG_SENDER_ORIGIN:origin},orgId),null);
  assert.equal(configuredTgSender({...env,LEAD_RADAR_TG_SENDER_TOKEN:'short'},orgId),null);
  assert.equal(tgSenderConfiguration({...env,LEAD_RADAR_TG_SENDER_BINDING_JSON:JSON.stringify({...binding,extra:true})},orgId),null);
  const old=await createTelegramUserAccountPending({db:db.asD1(),dataKey:KEY,orgId,authRequestReference:'legacy_auth_reference_1234',idempotencyKey:'legacy_fixture_pending_0001'});
  await assert.rejects(connectOutreachAccount({env,db:db.asD1(),orgId,dataKey:KEY,idempotencyKey:'remote_conflict_fixture_0001'}),/tg_sender_binding_mismatch/);
  assert.equal((await getTelegramUserAccount(db.asD1(),orgId))?.id,old.account.id);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id=?',orgId),1);
});

test('changed encryption key and wrong or stale provider attestation fail closed',async(context)=>{
  const {db,orgId,binding,env}=await fixture();let response:Record<string,unknown>|null=null;
  mockSender(context,binding,()=>response??status(binding));
  const input={env,db:db.asD1(),orgId,dataKey:KEY,idempotencyKey:'remote_fresh_fixture_0001'};
  await connectOutreachAccount(input);
  await assert.rejects(connectOutreachAccount({...input,dataKey:Buffer.alloc(32,41).toString('base64url')}),/campaign_data_key_mismatch/);
  response=status({...binding,account_id:'lrtgua_'+'8'.repeat(32)});
  await assert.rejects(connectOutreachAccount(input),/tg_sender_unavailable/);
  response=status(binding,{checked_at:new Date(Date.now()-120_000).toISOString()});
  await assert.rejects(connectOutreachAccount(input),/tg_sender_unavailable/);
  response=status(binding,{provider_verified_at:null});
  await assert.rejects(connectOutreachAccount(input),/tg_sender_unavailable/);
  response=status(binding,{provider_verified_at:new Date(Date.now()-120_000).toISOString()});
  await assert.rejects(connectOutreachAccount(input),/tg_sender_unavailable/);
});

test('changing only the server-pinned sender fingerprint cannot adopt a different Telegram session',async(context)=>{
  const {db,orgId,binding,env}=await fixture();let providerBinding=binding;
  mockSender(context,binding,()=>status(providerBinding),()=>providerBinding);
  const input={env,db:db.asD1(),orgId,dataKey:KEY,idempotencyKey:'remote_identity_fixture_0001'};
  const connected=await connectOutreachAccount(input);
  providerBinding={...binding,sender_fingerprint:'8'.repeat(64)};
  const changed={...env,LEAD_RADAR_TG_SENDER_BINDING_JSON:JSON.stringify(providerBinding)};
  await assert.rejects(connectOutreachAccount({...input,env:changed}),/tg_sender_binding_mismatch/);
  await assert.rejects(probeOutreachAccount({...input,env:changed,account:connected}),/tg_sender_binding_mismatch/);
  assert.equal((await getTelegramUserAccount(db.asD1(),orgId))?.id,connected.id);
});

test('staged connection recovers after the final readiness proof is temporarily unavailable',async(context)=>{
  const {db,orgId,binding,env}=await fixture();let call=0;
  mockSender(context,binding,()=>status(binding,++call===2?{ready:false,reason_code:'unavailable'}:{}));
  const input={env,db:db.asD1(),orgId,dataKey:KEY,idempotencyKey:'remote_recover_fixture_0001'};
  await assert.rejects(connectOutreachAccount(input),/tg_sender_unavailable/);
  assert.equal((await getTelegramUserAccount(db.asD1(),orgId))?.status,'pending');
  assert.equal((await connectOutreachAccount(input)).status,'connected');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id=?',orgId),1);
});

test('owner remote connect requires exact path, empty payload, owner role and idempotency',async(context)=>{
  const {db,orgId,binding,env}=await fixture();const calls=mockSender(context,binding),token=await platformToken('platform_owner');
  const path='/api/admin/lead-radar/telegram-account/tg-sender/connect';
  const options={method:'POST',token,env,params:{path:'telegram-account/tg-sender/connect'},body:{},headers:{'Idempotency-Key':'remote_owner_connect_0001',Origin:'https://gptbot.uz'}};
  const valid=await callRoute(route.onRequestPost,db,path,options);
  assert.equal(valid.status,200,JSON.stringify(valid.body));assert.equal(valid.body.status,'connected');
  for(const secret of [TOKEN,KEY,REF,FINGERPRINT])assert.ok(!JSON.stringify(valid.body).includes(secret));
  assert.equal(valid.headers.get('Cache-Control'),'no-store');
  for(const extra of ['/extra','/../connect','suffix']){
    const response=await callRoute(route.onRequestPost,db,path+extra,{...options,params:{path:'telegram-account/tg-sender/connect'+extra}});
    assert.equal(response.status,404);
  }
  assert.equal((await callRoute(route.onRequestPost,db,path,{...options,body:{host:'https://evil.invalid'}})).status,400);
  assert.equal((await callRoute(route.onRequestPost,db,path,{...options,headers:{}})).status,400);
  assert.equal((await callRoute(route.onRequestPost,db,path,{...options,token:await platformToken('support_readonly')})).status,403);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id=?',orgId),1);
  assert.ok(calls.every((call)=>call.method==='GET'||call.url.endsWith('/session/probe')));
});

test('explicit cutover rejects a stale target without retiring the current account',async(context)=>{
  const {db,orgId,binding,env}=await fixture(ORG_A,DATA_KEY);mockSender(context,binding);
  const old=await connectedAccount(db,orgId);
  await assert.rejects(connectOutreachAccount({env,db:db.asD1(),orgId,dataKey:DATA_KEY,
    idempotencyKey:'remote_stale_cutover_0001',replaceAccountId:'lrtgua_'+'f'.repeat(32)}),/tg_sender_binding_mismatch/);
  assert.equal((await getTelegramUserAccount(db.asD1(),orgId))?.id,old.id);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_outreach_account_cutovers'),0);
  assert.equal(db.value('SELECT status FROM lead_radar_tg_user_accounts WHERE id=?',old.id),'connected');
});

test('active campaigns block explicit cutover; completed history survives exact idempotent transition',async(context)=>{
  context.mock.timers.enable({apis:['Date'],now:NOW.getTime()});
  const {db,orgId,binding,env}=await fixture(ORG_A,DATA_KEY);mockSender(context,binding);
  addCompany(db,{id:'cutover_company',username:'CutoverCompany'});
  const old=await connectedAccount(db,orgId),created=await approvedCampaign(db,['cutover_company']);
  const campaignId=created.campaign.id;
  const input={env,db:db.asD1(),orgId,dataKey:DATA_KEY,idempotencyKey:'remote_explicit_cutover_0001',replaceAccountId:old.id};
  const original=db.rows('SELECT request_idempotency_digest,request_fingerprint,auth_request_digest FROM lead_radar_tg_user_accounts WHERE id=?',old.id);
  await assert.rejects(connectOutreachAccount(input),/tg_sender_active_campaign/);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_outreach_account_cutovers'),0);
  assert.equal((await getTelegramUserAccount(db.asD1(),orgId))?.id,old.id);
  db.sqlite.prepare("UPDATE lead_radar_tg_campaigns SET status='stopped',stopped_at=? WHERE id=?").run(NOW.toISOString(),campaignId);
  db.sqlite.prepare(`UPDATE lead_radar_tg_user_accounts SET dispatch_lease_campaign_id=?,dispatch_lease_digest=?,dispatch_lease_expires_at=? WHERE id=?`)
    .run(campaignId,'a'.repeat(64),NOW.toISOString(),old.id);
  await assert.rejects(connectOutreachAccount(input),/tg_sender_active_campaign/);
  db.sqlite.prepare('UPDATE lead_radar_tg_user_accounts SET dispatch_lease_campaign_id=NULL,dispatch_lease_digest=NULL,dispatch_lease_expires_at=NULL WHERE id=?').run(old.id);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_effects WHERE campaign_id=?',campaignId),1);
  db.sqlite.prepare("UPDATE lead_radar_tg_campaign_effects SET status='reserved',completed_at=NULL WHERE campaign_id=?").run(campaignId);
  await assert.rejects(connectOutreachAccount(input),/tg_sender_active_campaign/);
  db.sqlite.prepare("UPDATE lead_radar_tg_campaign_effects SET status='canceled',completed_at=? WHERE campaign_id=?").run(NOW.toISOString(),campaignId);
  const first=await connectOutreachAccount(input),replay=await connectOutreachAccount(input);
  assert.equal(first.id,ACCOUNT);assert.equal(first.status,'connected');assert.equal(replay.id,first.id);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_outreach_account_cutovers'),1);
  assert.equal(db.value('SELECT status FROM lead_radar_tg_user_accounts WHERE id=?',old.id),'revoked');
  assert.equal(db.value('SELECT account_id FROM lead_radar_tg_campaigns WHERE id=?',campaignId),old.id);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients WHERE campaign_id=?',campaignId),1);
  assert.deepEqual(db.rows('SELECT request_idempotency_digest,request_fingerprint,auth_request_digest FROM lead_radar_tg_user_accounts WHERE id=?',old.id),original);
  for(const change of [{replaceAccountId:'lrtgua_'+'f'.repeat(32)},{idempotencyKey:'remote_different_cutover_0001'}]){
    await assert.rejects(connectOutreachAccount({...input,...change}),/tg_sender_binding_mismatch/);
  }
});

test('cutover proof and retirement are atomic, tenant scoped and recover after archive-before-create',async(context)=>{
  const {db,orgId,binding,env}=await fixture(ORG_A,DATA_KEY);mockSender(context,binding);
  const old=await connectedAccount(db,orgId),store=new OutreachAccountStore(db.asD1()),digest='a'.repeat(64),now=new Date().toISOString();
  db.exec("CREATE TRIGGER fail_cutover BEFORE UPDATE OF status ON lead_radar_tg_user_accounts WHEN NEW.status='revoked' BEGIN SELECT RAISE(ABORT,'fixture_retire_crash'); END");
  await assert.rejects(store.retireUnusedAccount(orgId,old.id,old.stateVersion,ACCOUNT,digest,now),/fixture_retire_crash/);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_outreach_account_cutovers'),0);
  assert.equal(db.value('SELECT status FROM lead_radar_tg_user_accounts WHERE id=?',old.id),'connected');
  db.exec('DROP TRIGGER fail_cutover');
  assert.equal(await store.retireUnusedAccount('org_'+'f'.repeat(32),old.id,old.stateVersion,ACCOUNT,digest,now),false);
  db.exec("CREATE TRIGGER fail_new_account BEFORE INSERT ON lead_radar_tg_user_accounts WHEN NEW.id='"+ACCOUNT+"' BEGIN SELECT RAISE(ABORT,'fixture_create_crash'); END");
  const input={env,db:db.asD1(),orgId,dataKey:DATA_KEY,idempotencyKey:'remote_cutover_recover_0001',replaceAccountId:old.id};
  await assert.rejects(connectOutreachAccount(input),/telegram_campaign_storage_conflict/);
  assert.equal(db.value('SELECT status FROM lead_radar_tg_user_accounts WHERE id=?',old.id),'revoked');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_outreach_account_cutovers'),1);
  const savedDigest=String(db.value('SELECT request_digest FROM lead_radar_outreach_account_cutovers'));
  assert.equal(await store.hasCutover(orgId,old.id,ACCOUNT,savedDigest),true);
  assert.equal(await store.hasCutover('org_'+'f'.repeat(32),old.id,ACCOUNT,savedDigest),false);
  assert.equal(await store.hasCutover(orgId,old.id,ACCOUNT,digest),false);
  db.exec('DROP TRIGGER fail_new_account');
  assert.equal((await connectOutreachAccount(input)).status,'connected');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id=?',orgId),2);
});

test('concurrent exact cutover requests archive once and cannot reuse proof for another target or key',async()=>{
  const {db,orgId}=await fixture(ORG_A,DATA_KEY),old=await connectedAccount(db,orgId);
  const store=new OutreachAccountStore(db.asD1()),digest='c'.repeat(64),now=new Date().toISOString();
  assert.deepEqual(await Promise.all([1,2].map(()=>store.retireUnusedAccount(orgId,old.id,old.stateVersion,ACCOUNT,digest,now))),[true,true]);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_outreach_account_cutovers'),1);
  assert.equal(db.value('SELECT state_version FROM lead_radar_tg_user_accounts WHERE id=?',old.id),old.stateVersion+1);
  assert.equal(await store.hasCutover(orgId,old.id,'lrtgua_'+'e'.repeat(32),digest),false);
  assert.equal(await store.hasCutover(orgId,old.id,ACCOUNT,'d'.repeat(64)),false);
});

test('owner API accepts only explicit exact cutover and preserves its archived account on replay',async(context)=>{
  const {db,orgId,binding,env}=await fixture(undefined,DATA_KEY);mockSender(context,binding);
  const old=await connectedAccount(db,orgId),token=await platformToken('platform_owner');
  const path='/api/admin/lead-radar/telegram-account/tg-sender/connect';
  const options={method:'POST',token,env,params:{path:'telegram-account/tg-sender/connect'},body:{replaceAccountId:old.id},
    headers:{'Idempotency-Key':'remote_owner_cutover_0001',Origin:'https://gptbot.uz'}};
  assert.equal((await callRoute(route.onRequestPost,db,path,{...options,body:{replaceAccountId:'lrtgua_'+'f'.repeat(32)}})).status,409);
  assert.equal((await callRoute(route.onRequestPost,db,path,{...options,body:{replaceAccountId:old.id,confirm:true}})).status,400);
  const result=await callRoute(route.onRequestPost,db,path,options),replay=await callRoute(route.onRequestPost,db,path,options);
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(replay.status,200,JSON.stringify(replay.body));
  assert.equal(result.body.status,'connected');assert.equal(result.headers.get('Cache-Control'),'no-store');
  assert.equal(db.value('SELECT status FROM lead_radar_tg_user_accounts WHERE id=?',old.id),'revoked');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id=?',orgId),2);
  for(const secret of [TOKEN,DATA_KEY,REF,FINGERPRINT])assert.ok(!JSON.stringify(result.body).includes(secret));
  assert.equal((await callRoute(route.onRequestPost,db,path,{...options,headers:{...options.headers,'Idempotency-Key':'changed_owner_cutover_0001'}})).status,409);
});

test('owner status remains truthful during a later sender outage and exposes no session material',async(context)=>{
  const {db,orgId,binding,env}=await fixture();let ready=true;
  mockSender(context,binding,()=>status(binding,ready?{}:{ready:false,reason_code:'account_session_missing'}));
  await connectOutreachAccount({env,db:db.asD1(),orgId,dataKey:KEY,idempotencyKey:'remote_status_fixture_0001'});
  ready=false;
  const response=await callRoute(route.onRequestGet,db,'/api/admin/lead-radar/telegram-account',{token:await platformToken('platform_owner'),env,params:{path:'telegram-account'}});
  assert.equal(response.status,200);assert.equal(response.body.status,'connected');
  assert.equal((response.body.readiness as {status:string}).status,'blocked');
  for(const secret of [TOKEN,KEY,REF,FINGERPRINT])assert.ok(!JSON.stringify(response.body).includes(secret));
});

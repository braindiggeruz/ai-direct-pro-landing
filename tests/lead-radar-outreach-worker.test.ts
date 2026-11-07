import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import worker from '../workers/automation-worker';
import { database,addCompany,applyPublicMigration,MIGRATIONS,ORG_A,NOW,DATA_KEY } from './helpers/lead-radar-outreach-fixture';
import { authorizeTelegramCampaignContact,createTelegramUserAccountPending,stageTelegramUserAccountConnection,
  completeTelegramUserAccountConnection,prepareTelegramCampaign,createApprovedTelegramCampaign,transitionTelegramCampaign } from '../functions/platform/lead-radar/telegram-campaign';
import { checkCorporateTelegramContact } from '../functions/platform/lead-radar/contact-resolution';
import { hasPendingOutreachOptOut } from '../functions/platform/lead-radar/outreach-inbox-store';
import type { TgSenderBinding } from '../functions/platform/lead-radar/tg-sender-contract';

async function fixture() {
  const db=database([...MIGRATIONS,'0080_lead_radar_outreach_inbox.sql']);applyPublicMigration(db);
  db.exec(readFileSync(path.resolve(import.meta.dirname,'../migrations/0082_lead_radar_outreach_receipts.sql'),'utf8'));
  db.exec("INSERT INTO d1_migrations(name) VALUES ('0082_lead_radar_outreach_receipts.sql')");
  addCompany(db,{id:'worker_public',username:'WorkerPublic'});
  const binding:TgSenderBinding={org_id:ORG_A,account_id:`lrtgua_${'a'.repeat(32)}`,account_ref:'remote_gateway_reference_0001',sender_fingerprint:'b'.repeat(64)};
  const base={db:db.asD1(),orgId:ORG_A,dataKey:DATA_KEY,now:NOW};
  const pending=await createTelegramUserAccountPending({...base,requestedAccountId:binding.account_id,
    authRequestReference:`tgs-${binding.sender_fingerprint}`,idempotencyKey:'worker_public_connect'});
  await stageTelegramUserAccountConnection({...base,accountId:binding.account_id,gatewayAccountRef:binding.account_ref,
    expectedVersion:pending.account.stateVersion,providerConnectedAt:NOW.toISOString()});
  await completeTelegramUserAccountConnection({...base,accountId:binding.account_id,gatewayAccountRef:binding.account_ref,expectedVersion:pending.account.stateVersion});
  const resolved=await checkCorporateTelegramContact({...base,now:NOW.toISOString(),companyId:'worker_public',searchId:'search_worker_public',
    accountId:binding.account_id,candidateKey:'telegram:https://t.me/workerpublic',resolve:async()=>({status:'resolved',
      username:'workerpublic',peerRef:`lrpeer:${'c'.repeat(32)}`,reason:'regular_user_resolved',retryAfterSeconds:null})});
  assert.equal(resolved.status,'resolved');
  await authorizeTelegramCampaignContact({...base,companyId:'worker_public',contactBasis:'public_business_inquiry',
    evidenceReference:'https://worker_public.example/contact',expiresAt:'2026-09-01T12:00:00.000Z',reviewerId:'owner@example.test',
    idempotencyKey:'worker_public_authorize',publicBusinessInquiryEnabled:true});
  const input={...base,accountId:binding.account_id,searchId:'search_worker_public',companyIds:['worker_public'],
    template:'Здравствуйте, {company_name}. Актуальна автоматизация?',operatorId:'owner@example.test',contactBasis:'public_business_inquiry' as const,
    publicBusinessInquiryEnabled:true,idempotencyKey:'worker_public_prepare',minIntervalSeconds:120};
  const prepared=await prepareTelegramCampaign(input);
  const created=await createApprovedTelegramCampaign({...input,idempotencyKey:'worker_public_create',approvalToken:prepared.approvalToken,
    expectedSelectionDigest:prepared.selectionDigest,expectedContentDigest:prepared.contentDigest});
  await transitionTelegramCampaign({...base,campaignId:created.campaign.id,action:'start',operatorId:'owner@example.test',
    idempotencyKey:'worker_public_start',publicBusinessInquiryEnabled:true});
  const state=Number(db.value('SELECT state_version FROM lead_radar_tg_campaigns'));
  return {db,binding,envelope:{schema:'gptbot.lead-radar.telegram-campaign.v1',org_id:ORG_A,campaign_id:created.campaign.id,state_version:state}};
}
function status(binding:TgSenderBinding) {return {schema:'gptbot.lead-radar.tg-sender.v1',binding,ready:true,reason_code:null,
  checked_at:NOW.toISOString(),provider_verified_at:NOW.toISOString(),retry_after_seconds:null,masked_label:'Pinned Worker',capabilities:{text:true,media:false,
    durable_idempotency:true,sender_lock:true,persisted_cooldown:true,independent_scheduler:false,opaque_peer_refs:true,
    username_resolution:true,public_business_inquiry:true}};}

async function run(f:Awaited<ReturnType<typeof fixture>>,binding=f.binding) {
  let statements=0,acks=0,retries=0;const sql:string[]=[];
  const coldDb={prepare:(query:string)=>{
    const statement=f.db.prepare(query);sql.push(query);
    for(const method of ['first','all','run'] as const) {
      const original=statement[method].bind(statement);
      Object.defineProperty(statement,method,{value:async()=>{statements++;return original();}});
    }
    return statement;
  },batch:async(items:Parameters<typeof f.db.batch>[0])=>{statements+=items.length;return f.db.batch(items);}} as unknown as D1Database;
  const queue={send:async()=>undefined,sendBatch:async()=>undefined} as unknown as Queue;
  const env={GPTBOT_DRAFTS_DB:coldDb,AUTOMATION_QUEUE:queue,AUTOMATION_DLQ:queue,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE:'tg_sender',LEAD_RADAR_TG_SENDER_ORIGIN:'https://tg-sender-v2.braindigger-uz.workers.dev',
    LEAD_RADAR_TG_SENDER_TOKEN:'t'.repeat(43),LEAD_RADAR_TG_SENDER_BINDING_JSON:JSON.stringify(binding),
    LEAD_RADAR_ALLOWED_ORGS:ORG_A,LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED:'true',LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED:'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED:'true',LEAD_RADAR_PUBLIC_BUSINESS_INQUIRY_ENABLED:'true',
    LEAD_RADAR_OUTREACH_INBOX_ENABLED:'true',LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY:DATA_KEY,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT:'30',LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS:'120'} as Parameters<typeof worker.queue>[1];
  const message={id:'cold-worker-test',timestamp:NOW,body:f.envelope,attempts:1,ack(){acks++;},retry(){retries++;}} as Message;
  await worker.queue({queue:'test',messages:[message],ackAll(){message.ack();},retryAll(){message.retry();}} as MessageBatch,env);
  return {statements,acks,retries,sql};
}

test('whole cold public TGS Worker sends once with receipt custody and <=50 D1 statements',async(context)=>{
  context.mock.timers.enable({apis:['Date'],now:NOW.getTime()});const f=await fixture();let effects=0;
  context.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(String(input).endsWith('/status'))return Response.json(status(f.binding));
    assert.ok(String(input).endsWith('/effects'));effects++;
    const command=JSON.parse(String(init?.body));assert.equal(command.authorization.basis,'public_business_inquiry');
    assert.equal(f.db.value('SELECT payload_sha256 FROM lead_radar_outreach_receipts'),command.payload_sha256);
    return Response.json({schema:command.schema,binding:command.binding,effect_id:command.effect_id,
      payload_sha256:command.payload_sha256,state:'accepted',provider_message_id:'4567'});
  });
  const result=await run(f);context.diagnostic(`whole cold Worker D1: ${result.statements}`);
  assert.equal(result.acks,1);assert.equal(result.retries,0);assert.equal(effects,1);
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_recipients'),'sent');
  assert.ok(result.statements<=50,`D1=${result.statements}`);
});

for(const mismatch of ['account_id','account_ref','sender_fingerprint','stored_auth','stored_key'] as const) test(`Worker ${mismatch} mismatch never claims or reserves`,async(context)=>{
  context.mock.timers.enable({apis:['Date'],now:NOW.getTime()});const f=await fixture();let effects=0;
  const binding={...f.binding};
  if(mismatch==='stored_key')f.db.sqlite.prepare('UPDATE lead_radar_tg_data_key_state SET key_fingerprint=?').run('f'.repeat(64));
  else if(mismatch==='stored_auth')f.db.sqlite.prepare('UPDATE lead_radar_tg_user_accounts SET auth_request_digest=?').run('f'.repeat(64));
  else binding[mismatch]=mismatch==='account_id'?`lrtgua_${'f'.repeat(32)}`:mismatch==='account_ref'?'other_remote_reference_0001':'f'.repeat(64);
  context.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
    if(String(input).endsWith('/status'))return Response.json(status(binding));effects++;throw new Error('must not dispatch');
  });
  const result=await run(f,binding);assert.equal(result.acks,1);assert.equal(effects,0);
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_recipients'),'pending');
  assert.equal(f.db.value('SELECT attempt_count FROM lead_radar_tg_campaign_recipients'),0);
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_effects'),'reserved');
  assert.equal(f.db.value('SELECT daily_reserved_count FROM lead_radar_tg_user_accounts'),0);
  assert.equal(f.db.value('SELECT COUNT(*) FROM lead_radar_outreach_receipts'),0);
});

test('cached inbox presence never suppresses a pending read error after table loss',async()=>{
  const db=database([...MIGRATIONS,'0080_lead_radar_outreach_inbox.sql']);
  assert.equal(await hasPendingOutreachOptOut(db.asD1(),ORG_A,`lrtgua_${'a'.repeat(32)}`,{schemaRequired:true}),false);
  db.exec('DROP TABLE lead_radar_outreach_inbox');
  await assert.rejects(hasPendingOutreachOptOut(db.asD1(),ORG_A,`lrtgua_${'a'.repeat(32)}`,{schemaRequired:false}));
});

for(const verification of ['missing','stale'] as const) test(`Worker ${verification} provider verification never claims`,async(context)=>{
  context.mock.timers.enable({apis:['Date'],now:NOW.getTime()});const f=await fixture();let probes=0,effects=0;
  context.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
    if(String(input).endsWith('/status')) {probes++;return Response.json({...status(f.binding),
      provider_verified_at:verification==='missing'?null:new Date(NOW.getTime()-86400001).toISOString()});}
    effects++;throw new Error('must not dispatch');
  });
  const result=await run(f);assert.equal(result.acks,1);assert.equal(result.retries,0);assert.equal(probes,1);assert.equal(effects,0);
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_recipients'),'pending');
  assert.equal(f.db.value('SELECT attempt_count FROM lead_radar_tg_campaign_recipients'),0);
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_effects'),'reserved');
  assert.equal(f.db.value('SELECT daily_reserved_count FROM lead_radar_tg_user_accounts'),0);
  assert.equal(f.db.value('SELECT COUNT(*) FROM lead_radar_outreach_receipts'),0);
});


for(const outcome of ['ambiguous','flood_wait','paid_message_required'] as const) test(`whole cold Worker ${outcome} stays bounded and never retries transport`,async(context)=>{
  context.mock.timers.enable({apis:['Date'],now:NOW.getTime()});const f=await fixture();let effects=0;
  context.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(String(input).endsWith('/status'))return Response.json(status(f.binding));
    assert.ok(String(input).endsWith('/effects'));effects++;
    if(outcome==='ambiguous')return new Response(null,{status:503});
    const command=JSON.parse(String(init?.body));
    return Response.json({schema:command.schema,binding:command.binding,effect_id:command.effect_id,
      payload_sha256:command.payload_sha256,state:'rejected',code:outcome,...(outcome==='flood_wait'?{retry_after_seconds:90000}:{})});
  });
  const result=await run(f);context.diagnostic(`whole cold Worker ${outcome} D1: ${result.statements}`);
  assert.equal(result.acks,1);assert.equal(result.retries,0);assert.equal(effects,1);
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_recipients'),outcome==='ambiguous'?'ambiguous':'failed');
  assert.ok(result.statements<=50,`${outcome} D1=${result.statements}`);
});

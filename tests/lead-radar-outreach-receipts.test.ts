import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { database,addCompany,approvedCampaign,applyPublicMigration,MIGRATIONS,ORG_A,ORG_B,NOW,DATA_KEY } from './helpers/lead-radar-outreach-fixture';
import { claimNextTelegramCampaignRecipient,dispatchClaimedTelegramCampaignRecipient,transitionTelegramCampaign, type TelegramCampaignSender } from '../functions/platform/lead-radar/telegram-campaign';
import { createDurableOutreachSender,reconcileOutreachReceipts,hasOutreachReceiptSchema } from '../functions/platform/lead-radar/outreach-receipts';
import { OutreachReceiptStore,outreachReceiptSchemaFingerprint,OUTREACH_RECEIPT_SCHEMA_FINGERPRINT } from '../functions/platform/lead-radar/outreach-receipts-store';
import { TG_SENDER_SCHEMA,tgSenderCommandDigest,type TgSenderCommand,type TgSenderEffectKey,type TgSenderReceipt } from '../functions/platform/lead-radar/tg-sender-contract';
import { SqliteD1 } from './helpers/sqlite-d1';

function receiptSchema(db:SqliteD1) {
  db.exec(readFileSync(path.resolve(import.meta.dirname,'../migrations/0082_lead_radar_outreach_receipts.sql'),'utf8'));
  db.exec("INSERT INTO d1_migrations(name) VALUES ('0082_lead_radar_outreach_receipts.sql')");
}
async function running() {
  const db=database([...MIGRATIONS,'0080_lead_radar_outreach_inbox.sql']);applyPublicMigration(db);receiptSchema(db);
  addCompany(db,{id:'receipt_company',username:'ReceiptCompany'});
  const created=await approvedCampaign(db,['receipt_company']);
  const base={db:db.asD1(),orgId:ORG_A,dataKey:DATA_KEY,now:NOW,campaignId:created.campaign.id};
  await transitionTelegramCampaign({...base,action:'start',operatorId:'owner@example.test',idempotencyKey:'receipt_start_0001'});
  const claim=await claimNextTelegramCampaignRecipient(base);assert.ok(claim);
  return {db,base,claim};
}
async function command(payload:Parameters<TelegramCampaignSender['send']>[0]):Promise<TgSenderCommand> {
  assert.ok(payload.authorization);
  const draft={schema:TG_SENDER_SCHEMA,binding:{org_id:payload.orgId,account_id:payload.accountId,
    account_ref:payload.gatewayAccountRef,sender_fingerprint:'a'.repeat(64)},effect_id:payload.randomId,
    recipient:payload.username,text:payload.text,authorization:{basis:payload.authorization.basis,
      reference:payload.authorization.reference,expires_at:payload.authorization.expiresAt},
    paid_message_policy:'reject' as const,allow_paid_floodskip:false as const,parse_mode:'None' as const};
  return {...draft,payload_sha256:await tgSenderCommandDigest(draft)};
}
function accepted(key:TgSenderEffectKey):TgSenderReceipt{return {...key,state:'accepted',provider_message_id:'1234567'};}

test('0082 receipt schema fingerprint',async()=>{
  const db=database();receiptSchema(db);
  assert.equal(await outreachReceiptSchemaFingerprint(db.asD1()),OUTREACH_RECEIPT_SCHEMA_FINGERPRINT);
  assert.equal(await hasOutreachReceiptSchema(db.asD1()),true);
});


async function ambiguousFixture() {
  const f=await running();let calls=0;let key:TgSenderEffectKey|undefined;
  const sender=createDurableOutreachSender({db:f.db.asD1(),now:()=>NOW,sender:{prepare:command,
    receipt:async()=>null,send:async(payload)=>{
      calls++;const prepared=await command(payload);key={schema:prepared.schema,binding:prepared.binding,
        effect_id:prepared.effect_id,payload_sha256:prepared.payload_sha256};
      assert.equal(f.db.value('SELECT payload_sha256 FROM lead_radar_outreach_receipts'),prepared.payload_sha256);
      return {kind:'ambiguous'};
    }}});
  const delivered=await dispatchClaimedTelegramCampaignRecipient({...f.base,claim:f.claim,sender});
  assert.equal(delivered.status,'ambiguous');assert.ok(key);assert.equal(calls,1);
  return {...f,key,calls:()=>calls};
}

test('custody survives accepted provider response loss; exact receipt settles once without send or quota release',async()=>{
  const f=await ambiguousFixture();
  const quota=f.db.value('SELECT daily_reserved_count FROM lead_radar_tg_user_accounts');
  const input={db:f.db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,now:NOW,sender:{receipt:async(key:TgSenderEffectKey)=>accepted(key)}};
  assert.deepEqual(await reconcileOutreachReceipts(input),{checked:1,accepted:1});
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_recipients'),'sent');
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_effects'),'sent');
  assert.equal(f.db.value('SELECT ambiguous_count FROM lead_radar_tg_campaigns'),0);
  assert.equal(f.db.value('SELECT sent_count FROM lead_radar_tg_campaigns'),1);
  assert.equal(f.db.value('SELECT daily_reserved_count FROM lead_radar_tg_user_accounts'),quota);
  assert.equal(f.db.value("SELECT COUNT(*) FROM lead_radar_tg_contact_history WHERE state='sent'"),4);
  const snapshot=JSON.stringify(f.db.rows('SELECT * FROM lead_radar_outreach_receipts'));
  assert.deepEqual(await reconcileOutreachReceipts(input),{checked:0,accepted:0});
  assert.equal(JSON.stringify(f.db.rows('SELECT * FROM lead_radar_outreach_receipts')),snapshot);assert.equal(f.calls(),1);
});

for(const invalid of ['binding','effect','payload','unknown','not_found','rejected'] as const) test(`receipt ${invalid} cannot settle or permit resend`,async()=>{
  const f=await ambiguousFixture();
  const result=await reconcileOutreachReceipts({db:f.db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,now:NOW,
    sender:{receipt:async(key)=>{
      const receipt=accepted(key);
      if(invalid==='binding')return {...receipt,binding:{...key.binding,org_id:ORG_B}};
      if(invalid==='effect')return {...receipt,effect_id:`lrtgce_${'f'.repeat(32)}`};
      if(invalid==='payload')return {...receipt,payload_sha256:'f'.repeat(64)};
      if(invalid==='unknown'||invalid==='not_found')return {...key,state:invalid};
      if(invalid==='rejected')return {...key,state:'rejected',code:'peer_invalid'};
      return receipt;
    }}});
  assert.deepEqual(result,{checked:1,accepted:0});assert.equal(f.calls(),1);
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_effects'),'ambiguous');
  assert.equal(f.db.value('SELECT check_attempts FROM lead_radar_outreach_receipts'),1);
  assert.ok(String(f.db.value('SELECT next_check_at FROM lead_radar_outreach_receipts'))>NOW.toISOString());
});

test('wrong tenant/key or an active lease cannot perform receipt lookup',async()=>{
  const f=await ambiguousFixture();let lookups=0;
  const sender={receipt:async(key:TgSenderEffectKey)=>{lookups++;return accepted(key);}};
  assert.deepEqual(await reconcileOutreachReceipts({db:f.db.asD1(),dataKey:DATA_KEY,orgId:ORG_B,now:NOW,sender}),{checked:0,accepted:0});
  assert.deepEqual(await reconcileOutreachReceipts({db:f.db.asD1(),dataKey:Buffer.alloc(32,4).toString('base64url'),orgId:ORG_A,now:NOW,sender}),{checked:0,accepted:0});
  f.db.sqlite.prepare(`UPDATE lead_radar_tg_user_accounts SET dispatch_lease_campaign_id=?,dispatch_lease_digest=?,dispatch_lease_expires_at=?`)
    .run(f.base.campaignId,'a'.repeat(64),new Date(NOW.getTime()+60_000).toISOString());
  assert.deepEqual(await reconcileOutreachReceipts({db:f.db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,now:NOW,sender}),{checked:0,accepted:0});
  assert.equal(lookups,0);
});

test('inflight provider rows require existing lease recovery before accepted settlement',async()=>{
  const f=await ambiguousFixture();let calls=0;
  f.db.exec("UPDATE lead_radar_tg_campaign_effects SET status='dispatching',completed_at=NULL");
  f.db.sqlite.prepare(`UPDATE lead_radar_tg_campaign_recipients SET status='dispatching',claim_digest=?,lease_expires_at=?,completed_at=NULL`)
    .run('b'.repeat(64),new Date(NOW.getTime()-1000).toISOString());
  assert.deepEqual(await reconcileOutreachReceipts({db:f.db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,now:NOW,
    sender:{receipt:async(key)=>{calls++;return accepted(key);}}}),{checked:0,accepted:0});
  assert.equal(calls,0);
});

test('receipt schema is required before provider and checksum conflicts never send',async()=>{
  const f=await running();let calls=0;
  f.db.exec('DROP TABLE lead_radar_outreach_receipts');
  const sender=createDurableOutreachSender({db:f.db.asD1(),now:()=>NOW,sender:{prepare:command,receipt:async()=>null,
    send:async()=>{calls++;return {kind:'sent',providerMessageId:'123'};}}});
  await dispatchClaimedTelegramCampaignRecipient({...f.base,claim:f.claim,sender});
  assert.equal(calls,0);
  const second=await running();
  const conflict=createDurableOutreachSender({db:second.db.asD1(),now:()=>NOW,sender:{prepare:async(payload)=>{
    const prepared=await command(payload);
    assert.equal(await new OutreachReceiptStore(second.db.asD1()).reserve(prepared,NOW.toISOString()),true);
    return {...prepared,payload_sha256:'f'.repeat(64)};
  },receipt:async()=>null,send:async()=>{calls++;return {kind:'sent',providerMessageId:'123'};}}});
  await dispatchClaimedTelegramCampaignRecipient({...second.base,claim:second.claim,sender:conflict});assert.equal(calls,0);
});

test('settlement transaction failure leaves both ambiguous ledgers and quota intact',async()=>{
  const f=await ambiguousFixture();const before=JSON.stringify(f.db.rows('SELECT * FROM lead_radar_tg_campaign_recipients'));
  f.db.exec(`CREATE TRIGGER receipt_test_failure BEFORE UPDATE OF status ON lead_radar_tg_campaign_effects
    WHEN NEW.status='sent' BEGIN SELECT RAISE(ABORT,'fixture_atomic_failure'); END;`);
  const result=await reconcileOutreachReceipts({db:f.db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,now:NOW,
    sender:{receipt:async(key)=>accepted(key)}});
  assert.deepEqual(result,{checked:1,accepted:0});
  assert.equal(JSON.stringify(f.db.rows('SELECT * FROM lead_radar_tg_campaign_recipients')),before);
  assert.equal(f.db.value('SELECT state FROM lead_radar_outreach_receipts'),'pending');
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_effects'),'ambiguous');
});

test('concurrent exact receipt settlement changes the delivery pair once',async()=>{
  const f=await ambiguousFixture();
  const input={db:f.db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,now:NOW,sender:{receipt:async(key:TgSenderEffectKey)=>accepted(key)}};
  const results=await Promise.all([reconcileOutreachReceipts(input),reconcileOutreachReceipts(input)]);
  assert.equal(results.reduce((total,result)=>total+result.accepted,0),1);
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_effects'),'sent');
  assert.equal(f.db.value('SELECT sent_count FROM lead_radar_tg_campaigns'),1);assert.equal(f.calls(),1);
});


test('an accepted receipt cannot overwrite contradictory local provider proof',async()=>{
  const f=await ambiguousFixture();
  f.db.sqlite.prepare("UPDATE lead_radar_tg_campaign_effects SET status='sent',provider_message_digest=?").run('f'.repeat(64));
  f.db.sqlite.prepare("UPDATE lead_radar_tg_campaign_recipients SET status='sent',provider_message_digest=?,sent_at=?")
    .run('f'.repeat(64),NOW.toISOString());
  const result=await reconcileOutreachReceipts({db:f.db.asD1(),dataKey:DATA_KEY,orgId:ORG_A,now:NOW,sender:{receipt:async(key)=>accepted(key)}});
  assert.deepEqual(result,{checked:1,accepted:0});
  assert.equal(f.db.value('SELECT provider_message_digest FROM lead_radar_tg_campaign_effects'),'f'.repeat(64));
  assert.equal(f.db.value('SELECT status FROM lead_radar_tg_campaign_recipients'),'sent');
});

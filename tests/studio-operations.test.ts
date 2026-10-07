import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paidDatabase,paidOrder,paidEnv,NOW,DAY,requestId} from './helpers/studio-paid';
import {StudioOperationsStore} from '../functions/lib/studio/operations-store';
import {StudioStore} from '../functions/lib/studio/store';
import {maintainStudio} from '../functions/lib/studio/maintenance';
import {studioOperation} from '../functions/lib/studio/refund';
import {VerificationStore,VERIFICATION_LEASE_MS,challengeHash} from '../functions/lib/studio/verification-store';
import {STUDIO_OPERATIONS_DDL,STUDIO_PAID_OPERATIONS_DDL} from '../functions/lib/studio/operations-schema';
import {STUDIO_CLICK_OWNERSHIP_DDL} from '../functions/lib/studio/click-ownership';
import {STUDIO_PAYME_OWNERSHIP_DDL} from '../functions/lib/studio/payme-ownership';
import type {BillingEnv} from '../functions/lib/gpt-chat/billing-config';

test('0076 DDL matches its runtime statements and replays safely',async()=>{
  const db=await paidDatabase();
  const sql=readFileSync(new URL('../migrations/0076_studio_operations.sql',import.meta.url),'utf8').replace(/\r\n/g,'\n').replace(/^--.*$/gm,'').trim();
  assert.equal(sql,[...STUDIO_OPERATIONS_DDL,...STUDIO_PAID_OPERATIONS_DDL,...STUDIO_PAYME_OWNERSHIP_DDL].join(';\n\n')+';');
  db.exec(sql);db.exec(sql);
  assert.equal(db.value("SELECT tbl_name FROM sqlite_master WHERE name='idx_studio_orders_v2_budget_report'"),'studio_orders_v2');
  assert.deepEqual(db.rows<{name:string}>("PRAGMA index_info('idx_studio_orders_v2_budget_report')").map(row=>row.name),['org_id','owner_test','created_at','id']);
});
test('refund preserves the quota snapshot at application, including an expired unused pack',async()=>{
  const db=await paidDatabase(); const order=await paidOrder(db,{plan:'oylik',paidAt:NOW});
  const ops=new StudioOperationsStore(db.asD1()); const store=new StudioStore(db.asD1());
  const snapshot=await ops.refundRequest(order.id,NOW+DAY);
  db.exec(`UPDATE studio_entitlements SET presentations_used=2 WHERE order_id='${order.id}'`);
  assert.deepEqual(await ops.refundRequest(order.id,NOW+16*DAY),snapshot);
  const result=await store.recordRefund(order.id,{method:'transfer',reference:'bank-confirmation',requestedAt:snapshot.requested_at,unusedSnapshot:{presentations:snapshot.presentations_unused,photos:snapshot.photos_unused},now:NOW+16*DAY});
  assert.equal(result.refund.amount,order.amount); assert.equal(result.refund.receipt_state,'due');
  assert.ok((await store.orderEntitlements(order.id))[0].revoked_at);
  await assert.rejects(()=>store.recordRefund(order.id,{method:'transfer',reference:'duplicate',now:NOW+16*DAY}),/refund_exists/);
  const daily=await paidOrder(db,{plan:'kunlik',userId:'daily',paidAt:NOW});
  assert.equal((await ops.refundRequest(daily.id,NOW+2*DAY)).presentations_unused,1);
  const late=await paidOrder(db,{plan:'kunlik',userId:'late',paidAt:NOW});
  await assert.rejects(()=>ops.refundRequest(late.id,NOW+15*DAY),/refund_window/);
  await assert.rejects(()=>new StudioOperationsStore(db.asD1(),'other').refundRequest(daily.id,NOW+DAY),/refund_window/);
});
test('credit: one request once, cap ten, expired right gets 24 h, revoked parent gets nothing',async()=>{
  const db=await paidDatabase();const order=await paidOrder(db,{plan:'kunlik',paidAt:NOW});const ops=new StudioOperationsStore(db.asD1());
  const first=await ops.credit(order.id,'credit_request_1','presentation_full','failed_export',NOW+2*DAY);
  assert.deepEqual(await ops.credit(order.id,'credit_request_1','presentation_full','failed_export',NOW+2*DAY),first);
  assert.equal(db.value('SELECT ends_at FROM studio_entitlements WHERE id=?',first.entitlement_id),NOW+3*DAY);
  for(let i=2;i<=10;i++) await ops.credit(order.id,`credit_request_${i}`,'presentation_full','failed_export',NOW+2*DAY);
  await assert.rejects(()=>ops.credit(order.id,'credit_request_11','presentation_full','failed_export',NOW+2*DAY),/credit_cap/);
  assert.equal(db.value("SELECT COUNT(*) FROM studio_entitlements WHERE plan='credit'"),10);
  await new StudioStore(db.asD1()).refundFull(order.id,{method:'payme_cancel',reference:'provider',now:NOW+2*DAY});
  await assert.rejects(()=>ops.credit(order.id,'after_refund','presentation_full','failed_export',NOW+2*DAY),/credit_cap/);
});
test('extend is bounded, scoped and applies each outage window once',async()=>{
  const db=await paidDatabase(); const order=await paidOrder(db,{plan:'oylik',paidAt:NOW});const ops=new StudioOperationsStore(db.asD1());
  const before=Number(db.value('SELECT ends_at FROM studio_entitlements WHERE id=?',order.id));
  assert.deepEqual(await ops.extend(NOW+1000,NOW+5000,NOW+6000),{extended:1,more:false});
  assert.deepEqual(await ops.extend(NOW+1000,NOW+5000,NOW+6000),{extended:0,more:false});
  assert.equal(db.value('SELECT ends_at FROM studio_entitlements WHERE id=?',order.id),before+4000);
  assert.deepEqual(await new StudioOperationsStore(db.asD1(),'other').extend(NOW,NOW+1000,NOW+6000),{extended:0,more:false});
  await assert.rejects(()=>ops.extend(NOW,NOW+4*DAY,NOW+5*DAY),/invalid/);
});
test('maintenance: switches off means zero D1; retention keeps receipts/orders and excludes owner orders in report',async()=>{
  const throwing=new Proxy({},{get(){throw new Error('D1 touched');}}) as D1Database;
  assert.deepEqual(await maintainStudio({GPTBOT_DRAFTS_DB:throwing} as BillingEnv),{skipped:true});
  const db=await paidDatabase();const order=await paidOrder(db,{paidAt:NOW}); const ops=new StudioOperationsStore(db.asD1());
  assert.equal((await ops.report(NOW-DAY,NOW+DAY)).orders.length,1);
  await new StudioStore(db.asD1()).markOwnerTest(order.id);
  assert.equal((await ops.report(NOW-DAY,NOW+DAY)).orders.length,0);
  await ops.maintain(NOW+400*DAY);
  assert.equal(db.value('SELECT COUNT(*) FROM studio_orders_v2'),1);
  assert.equal(db.value('SELECT COUNT(*) FROM gpt_fiscal_receipts'),1);
  assert.ok(db.value('SELECT attrib_purged_at FROM studio_orders_v2'));
});
test('operator endpoints authenticate before D1 and never record money without explicit evidence',async()=>{
  const db=await paidDatabase();const env=paidEnv(db) as BillingEnv;
  const req=(body:object,authorized=false)=>new Request('https://gptbot.uz/api/internal/studio-refund-record',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:`Bearer ${env.GPT_BILLING_MAINTENANCE_SECRET}`}:{})},body:JSON.stringify(body)});
  assert.equal((await studioOperation(req({}),env,'refund-record')).status,401);
  const order=await paidOrder(db,{paidAt:Date.now()});
  assert.equal((await studioOperation(req({orderId:order.id,method:'transfer',reference:'bank-record'},true),env,'refund-record')).status,400);
  assert.equal(db.value('SELECT COUNT(*) FROM studio_refunds'),0);
  const ops=new StudioOperationsStore(db.asD1());
  db.exec(`UPDATE studio_orders_v2 SET provider='click' WHERE id='${order.id}'`);
  assert.equal(await ops.beginReversal(order.id,requestId(),'12345',order.version),true);
  await ops.reversalResult(order.id,'unknown');
  assert.equal(await ops.beginReversal(order.id,requestId(),'12345',order.version),false);
});
test('verification leases cap concurrent work, preserve consumed tokens, expire and isolate orgs',async()=>{
  const db=await paidDatabase(); const store=new VerificationStore(db.asD1());
  const ids=[];for(let i=0;i<4;i++) ids.push(await store.claim('ip','token-'+i,NOW));
  assert.ok(ids.every(Boolean));assert.equal(await store.claim('ip','fifth',NOW),null);
  await store.release(ids[0]!);assert.ok(await store.claim('ip','new',NOW));
  assert.equal(await store.claim('other-ip','token-0',NOW),null);
  assert.ok(await new VerificationStore(db.asD1(),'other-org').claim('ip','token-0',NOW));
  assert.ok(await store.claim('ip','after-expiry',NOW+VERIFICATION_LEASE_MS));
  await store.release(ids[1]!);
  assert.equal(db.value("SELECT lease_until FROM studio_verifications WHERE token_hash='after-expiry'"),NOW+2*VERIFICATION_LEASE_MS);
  assert.notEqual(await challengeHash('test-secret','same'),await challengeHash('another-secret','same'));
});

test('old revoked rights do not hide a running purchase; prepared Click remains payable after invoice expiry',async()=>{
  const db=await paidDatabase();const store=new StudioStore(db.asD1());
  const current=await paidOrder(db,{plan:'kunlik',userId:'buyer',paidAt:NOW});
  for(let i=0;i<10;i++){
    const old=await paidOrder(db,{plan:'oylik',userId:'buyer',paidAt:NOW});
    await store.refundFull(old.id,{method:'payme_cancel',reference:'old-'+i,now:NOW+1});
  }
  assert.deepEqual((await store.entitlements('buyer','live',NOW+1000)).map(row=>row.id),[current.id]);
  const input={userId:'click-buyer',plan:'kunlik' as const,termsVersion:current.terms_version,provider:'click' as const,serviceId:'107999',mode:'live' as const,requestId:requestId(),consent:{version:current.terms_version,url:'https://gptbot.uz/ru/oferta/',locale:'ru' as const},now:NOW};
  const pending=(await store.createOrder(input)).order;
  await store.prepare(pending.id,{externalId:'late-click',providerTime:NOW,method:'click_prepare',now:NOW});
  await assert.rejects(()=>store.createOrder({...input,requestId:requestId(),now:NOW+DAY}),/order_open/);
  assert.equal((await store.markPaid(pending.id,{method:'click_complete',now:NOW+DAY})).order.state,'paid');
});


test('0077 Click ownership DDL matches runtime and replays safely',async()=>{
  const db=await paidDatabase();
  const sql=readFileSync(new URL('../migrations/0077_studio_shared_click.sql',import.meta.url),'utf8').replace(/\r\n/g,'\n').replace(/^--.*$/gm,'').trim();
  assert.equal(sql,STUDIO_CLICK_OWNERSHIP_DDL.join(';\n\n')+';');
  db.exec(sql);db.exec(sql);
  assert.equal(db.value("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN ('studio_click_chat_owner','studio_click_studio_owner')"),2);
});

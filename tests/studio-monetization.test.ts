import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { paidDatabase, paidOrder, paidEnv, pendingOrder, NOW, DAY, requestId } from './helpers/studio-paid';
import { SqliteD1 } from './helpers/sqlite-d1';
import { StudioStore } from '../functions/lib/studio/store';
import { STUDIO_ORG } from '../functions/lib/studio/schema';
import { StudioMonetizationStore } from '../functions/lib/studio/monetization-store';
import { FiscalHealthStore, renderFiscalHealth } from '../functions/lib/gpt-chat/fiscal-health-store';
import { renderAlertMessage } from '../functions/lib/gpt-chat/alert-policy';
import { contribution, type StudioMonetizationData } from '../src/shared/studio-admin';
import { StudioMonetizationCard } from '../src/admin/components/ai-chat/StudioMonetizationCard';
import { offerOrder, perPresentation } from '../src/gpt-chat/parts/studio-offer-model';
import { onRequestGet, onRequestPost } from '../functions/api/admin/ai-chat/studio';
import { signToken } from '../functions/lib/jwt';
import type { BillingEnv } from '../functions/lib/gpt-chat/billing-config';

function job(db:SqliteD1, id:string, org=STUDIO_ORG, tool='presentation', parts=1, shape='free', entitlement:string|null=null) {
  db.sqlite.prepare(`INSERT INTO studio_unit_ledger(org_id,id,request_id,tool,unit,source,entitlement_id,subject,input_mac,state,parts_total,parts_done,shape,cost_micro,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,'done',1,?,?,100000,?,?)`)
    .run(org,id,id,tool,tool==='photo'?'photo_task':shape==='full'?'presentation_full':'presentation_free',entitlement?'entitlement':'free',entitlement,'fixture-subject','fixture-mac',parts,shape,NOW,NOW+DAY);
}

test('read-only report: schema missing stays unknown, without bootstrap or writes',async()=>{
  const db=new SqliteD1();const store=new StudioMonetizationStore(db.asD1());
  assert.deepEqual(await store.report(STUDIO_ORG,7,NOW),{ok:false,error:'schema_pending',data:null});
  assert.equal(db.value("SELECT COUNT(*) FROM sqlite_master WHERE type='table'"),0);
  await assert.rejects(()=>store.report(STUDIO_ORG,31,NOW),/invalid_window/);
});

test('actual ledger money: live only, owner-test excluded, refunds by operation date, safe sources, org isolation',async()=>{
  const db=await paidDatabase();
  const live=await paidOrder(db,{plan:'kunlik',paidAt:NOW});
  await paidOrder(db,{plan:'oylik',userId:'test-only',mode:'test',paidAt:NOW});
  const owner=await paidOrder(db,{plan:'oylik',userId:'owner-test',paidAt:NOW});
  db.sqlite.prepare('UPDATE studio_orders_v2 SET owner_test=1 WHERE id=?').run(owner.id);
  await pendingOrder(db,{userId:'pending-only',plan:'kunlik',now:NOW});
  db.sqlite.prepare('UPDATE studio_orders_v2 SET utm_source=? WHERE id=?').run('private-user@example.test',live.id);
  const old=await paidOrder(db,{plan:'kunlik',userId:'old-refund',paidAt:NOW-10*DAY});
  await new StudioStore(db.asD1()).refundFull(old.id,{method:'payme_cancel',reference:'fixture-refund',now:NOW});
  // A real foreign-org order goes through the same store, not a response mock.
  const foreign=new StudioStore(db.asD1(),'foreign-org');
  const other=(await foreign.createOrder({userId:'foreign',plan:'kunlik',termsVersion:live.terms_version,provider:'payme',serviceId:null,mode:'live',requestId:requestId(),consent:{version:live.terms_version,url:'https://gptbot.uz/ru/oferta/',locale:'ru'},now:NOW})).order;
  await foreign.prepare(other.id,{externalId:'foreign-payment',providerTime:NOW,method:'payme_create',now:NOW});
  await foreign.markPaid(other.id,{method:'payme_perform',now:NOW});
  const before=db.value('SELECT total_changes()');
  const section=await new StudioMonetizationStore(db.asD1()).report(STUDIO_ORG,7,NOW);
  assert.ok(section.ok);assert.equal(db.value('SELECT total_changes()'),before);
  assert.deepEqual(section.data.money,{grossUzs:5900,refundsUzs:5900,netReceiptsUzs:0,estimatedAiUsd:0});
  assert.equal(section.data.orders.reduce((n,r)=>n+r.count,0),2);
  assert.deepEqual({...section.data.sources.find(r=>r.source==='other')},{source:'other',count:1,paid:1,grossUzs:5900});
  assert.doesNotMatch(JSON.stringify(section),/private-user|foreign-payment|acct_studio|stu_/);
});

test('jobs: completion requires all delivered parts; cost includes photo, never other org or owner-test',async()=>{
  const db=await paidDatabase(), order=await paidOrder(db,{plan:'kunlik',paidAt:NOW});
  const entitlement=String(db.value('SELECT id FROM studio_entitlements WHERE order_id=?',order.id));
  job(db,'free');job(db,'photo',STUDIO_ORG,'photo');job(db,'full',STUDIO_ORG,'presentation',1,'full',entitlement);
  job(db,'partial',STUDIO_ORG,'presentation',0,'full',entitlement);job(db,'foreign','foreign-org');
  const owner=await paidOrder(db,{plan:'kunlik',userId:'owner-jobs',paidAt:NOW});
  db.sqlite.prepare('UPDATE studio_orders_v2 SET owner_test=1 WHERE id=?').run(owner.id);
  job(db,'owner-job',STUDIO_ORG,'presentation',1,'full',String(db.value('SELECT id FROM studio_entitlements WHERE order_id=?',owner.id)));
  const section=await new StudioMonetizationStore(db.asD1()).report(STUDIO_ORG,7,NOW);
  assert.ok(section.ok);assert.equal(section.data.money.estimatedAiUsd,0.4);
  assert.equal(section.data.jobs.reduce((n,r)=>n+r.fullDelivered,0),1);
  assert.equal(section.data.jobs.reduce((n,r)=>n+r.count,0),4);
});

test('fiscal health: paid live org rows only, coarse errors, no sensitive provider response',async()=>{
  const db=await paidDatabase(), live=await paidOrder(db,{plan:'kunlik',paidAt:NOW});
  db.sqlite.prepare('UPDATE gpt_fiscal_receipts SET status_code=-1,last_error=?,attempts=8 WHERE order_id=?').run('payment_id:click_-12',live.id);
  const rows=await new FiscalHealthStore(db.asD1()).pending(STUDIO_ORG);
  assert.deepEqual(rows,[{product:'studio',provider:'payme',error:'payment_id:click_-12',queued:1,attempts:8,oldestPaidAt:NOW}]);
  assert.deepEqual(await new FiscalHealthStore(db.asD1()).pending('foreign-org'),[]);
  db.sqlite.prepare('UPDATE gpt_fiscal_receipts SET last_error=? WHERE order_id=?').run('card and private full response',live.id);
  assert.equal((await new FiscalHealthStore(db.asD1()).pending(STUDIO_ORG))[0].error,'unknown');
  const text=renderAlertMessage([{code:'click_fiscal_failed',count:1}],[],['click/chat: payment_id:click_-12; попыток 8.']);
  assert.match(text,/payment_id:click_-12/);assert.match(text,/Merchant API/);assert.doesNotMatch(text,/OpenRouter|баланс/);
});

test('Click fiscal alerts distinguish lookup refusal from an ambiguous receipt submission',()=>{
  const base={product:'chat' as const,provider:'click',queued:1,attempts:10,oldestPaidAt:NOW};
  const lookup=renderFiscalHealth({...base,error:'payment_id:click_-12'});
  const text=renderAlertMessage([{code:'click_fiscal_failed',count:1}],[],[lookup]);
  assert.match(text,/данные поставщика \(-12\)/);
  assert.match(text,/поиск платежа не выполнен/);
  assert.match(text,/обработок очереди 10/);
  assert.match(text,/подтверждение чека ОФД не получено/);
  assert.doesNotMatch(text,/чек ОФД не пробит|payment_id:click_-12|10 попыток/);
  const unknown=renderFiscalHealth({...base,error:'submit_unknown'});
  assert.match(unknown,/только сверка с ОФД/);
  assert.match(unknown,/повторная отправка заблокирована/);
  assert.doesNotMatch(unknown,/поиск платежа не выполнен/);
  const other=renderFiscalHealth({...base,provider:'uzum',error:'ofd:http_503'});
  assert.match(other,/ofd:http_503/);
  assert.doesNotMatch(other,/данные поставщика/);
});

test('events: unique views per qualifier, org filter; report never returns view ids',async()=>{
  const db=await paidDatabase();const stmt=db.sqlite.prepare('INSERT INTO gpt_ui_events(org_id,id,type,view_id,detail,created_at) VALUES(?,?,?,?,?,?)');
  stmt.run(STUDIO_ORG,'a','studio_upgrade_viewed','private-view','single',NOW);
  stmt.run(STUDIO_ORG,'b','studio_upgrade_viewed','private-view','single',NOW);
  stmt.run('foreign-org','c','studio_upgrade_viewed','foreign-view','single',NOW);
  const section=await new StudioMonetizationStore(db.asD1()).report(STUDIO_ORG,7,NOW);
  assert.ok(section.ok);assert.deepEqual(section.data.funnel.map(row=>({...row})),[{event:'studio_upgrade_viewed',detail:'single',count:2,views:1}]);
  assert.doesNotMatch(JSON.stringify(section),/private-view|foreign-view/);
});

test('economics: unknown is not zero, explicit expenses, positive FX required for AI; offers honest',()=>{
  const data={money:{netReceiptsUzs:5900,estimatedAiUsd:0.1}} as StudioMonetizationData;
  assert.equal(contribution(data,null,0,12000),null);assert.equal(contribution(data,0,0,null),null);
  assert.equal(contribution(data,0,0,0),null);assert.equal(contribution(data,1000,200,12000),3500);
  assert.equal(contribution(data,-1,0,12000),null);assert.equal(contribution(data,0,NaN,12000),null);
  assert.deepEqual(offerOrder(false),['kunlik','oylik']);assert.deepEqual(offerOrder(true),['oylik','kunlik']);
  assert.equal(perPresentation(39900,10),3990);assert.equal(perPresentation(5900,1),null);
});

test('admin view handles errors and empty data without inventing profit or successful receipt',()=>{
  (globalThis as unknown as {React:typeof React}).React=React;
  const pending=renderToStaticMarkup(React.createElement(StudioMonetizationCard,{report:{request_id:'fixture',studio:{ok:false,error:'query_failed',data:null}},days:7,onDays:()=>{}}));
  assert.match(pending,/query_failed/);assert.doesNotMatch(pending,/Поступления/);
});

test('owner endpoint denies before touching storage, refuses mutation methods',async()=>{
  const ctx={request:new Request('https://gptbot.uz/api/admin/ai-chat/studio'),env:{},params:{},data:{},waitUntil:()=>{}};
  const response=await onRequestGet(ctx as never);assert.equal(response.status,401);
  assert.equal((await onRequestPost(ctx as never)).status,405);
});

test('owner report endpoint: authenticated read, support denied, bounded window, no writes',async()=>{
  const db=await paidDatabase(),env=paidEnv(db,{JWT_SECRET:'monetization-owner-test-signing-input'}) as BillingEnv;
  const owner=await signToken(env,{email:'owner@example.invalid',role:'platform_owner'});
  const support=await signToken(env,{email:'support@example.invalid',role:'support_readonly'});
  const call=(token:string,query='')=>onRequestGet({request:new Request(`https://gptbot.uz/api/admin/ai-chat/studio${query}`,{headers:{Authorization:`Bearer ${token}`}}),env,params:{},data:{},waitUntil:()=>{}} as never);
  const before=db.value('SELECT total_changes()');
  assert.equal((await call(support)).status,403);
  for(const query of ['?days=0','?days=31','?days=wrong']) assert.equal((await call(owner,query)).status,400);
  const response=await call(owner,'?days=14');assert.equal(response.status,200);
  const body=await response.json() as {studio:{ok:boolean;data:StudioMonetizationData}};
  assert.ok(body.studio.ok);assert.equal(body.studio.data.days,14);
  assert.match(response.headers.get('Cache-Control')??'',/no-store/);
  assert.equal(db.value('SELECT total_changes()'),before);
});

test('read failure stays query_failed, never a zero-revenue result',async t=>{
  const db=await paidDatabase();t.mock.method(db,'batch',async()=>{throw new Error('fixture D1 unavailable');});
  assert.deepEqual(await new StudioMonetizationStore(db.asD1()).report(STUDIO_ORG,7,NOW),{ok:false,error:'query_failed',data:null});
});

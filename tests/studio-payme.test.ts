import { test } from "node:test";
import assert from "node:assert/strict";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import { pendingOrder } from "./helpers/studio-paid";
import { StudioStore, ensureStudioPaidSchema } from "../functions/lib/studio/store";
import { STUDIO_ORG } from "../functions/lib/studio/schema";
import { STUDIO_ORDER_TTL_MS, entitlementEndsAt, planOfVersion } from "../functions/lib/studio/plans";

async function fixture() {
  const f = await billingFixture();
  Object.assign(f.env, { GPT_BILLING_MODE: "", GPT_BILLING_MODE_PAYME: "test", GPT_FISCAL_IKPU: "10305008002000000", GPT_FISCAL_PACKAGE_CODE: "1514296", GPT_FISCAL_VAT_PERCENT: "12", STUDIO_RUNTIME_CONFIG_JSON: '{}' });
  await ensureStudioPaidSchema(f.binding);
  return { ...f, studio: new StudioStore(f.binding) };
}

for (const order of ['chat-first','studio-first','parallel'] as const) test(`one Payme transaction can belong to only one product: ${order}`, async () => {
  const f=await fixture(); const now=Date.now();
  const studio=await pendingOrder(f.db,{mode:'test',now});
  const chat=await f.store.createOrder('collision-user','payme','test',crypto.randomUUID());
  const create=(id:string,amount:number)=>f.rpc('CreateTransaction',{account:{order_id:id},amount,id:'shared-tx',time:now});
  const results=order==='parallel'
    ? await Promise.all([create(chat.id,2000000),create(studio.id,studio.amount)])
    : order==='chat-first'
      ? [await create(chat.id,2000000),await create(studio.id,studio.amount)]
      : [await create(studio.id,studio.amount),await create(chat.id,2000000)];
  assert.equal(results.filter(r=>r.result?.state===1).length,1);
  assert.equal(results.filter(r=>r.error?.code===-31008).length,1);
  assert.equal(Number(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders WHERE external_id='shared-tx'"))+Number(f.db.value("SELECT COUNT(*) FROM studio_orders_v2 WHERE external_id='shared-tx'")),1);
  await Promise.all(f.background);
});

for (const plan of ["kunlik", "oylik"] as const) test(`Payme ${plan}: authenticated shared route grants once, settles with sales off, fiscalizes and revokes`, async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("network forbidden"); });
  const f = await fixture();
  const now = Date.now();
  const row = await pendingOrder(f.db, { plan, mode: "test", now });
  const p = { account: { order_id: row.id }, amount: row.amount, id: `tx_${plan}`, time: now };
  assert.equal((await f.rpc("CheckPerformTransaction", { ...p, amount: row.amount + 1 })).error.code, -31001);
  const check = await f.rpc("CheckPerformTransaction", p);
  assert.equal(check.result.allow, true);
  assert.equal(check.result.detail.items[0].price, plan === "kunlik" ? 590000 : 3990000);
  assert.equal(check.result.detail.items[0].vat_percent, 12);
  const created = await f.rpc("CreateTransaction", p);
  assert.equal(created.result.state, 1);
  assert.deepEqual(await f.rpc("CreateTransaction", p), created);
  assert.equal((await f.rpc("CreateTransaction", { ...p, id: 'another' })).error.code, -31008);
  const paid = await f.rpc("PerformTransaction", { id: p.id });
  assert.equal(paid.result.state, 2);
  assert.deepEqual(await f.rpc("PerformTransaction", { id: p.id }), paid);
  const rights = await f.studio.orderEntitlements(row.id);
  assert.equal(rights.length, 1);
  assert.equal(rights[0].presentations_limit, plan === "kunlik" ? 1 : 10);
  assert.equal(rights[0].ends_at, entitlementEndsAt(planOfVersion(row.plan_version, plan)!, paid.result.perform_time));
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 0);
  assert.equal(f.db.value("SELECT provider FROM gpt_fiscal_receipts WHERE order_id=?", row.id), "payme");
  const fiscal = { id: p.id, type: "PERFORM", fiscal_data: { status_code: 0, receipt_id: 12345, qr_code_url: "https://ofd.soliq.uz/receipt/test" } };
  assert.equal((await f.rpc("SetFiscalData", fiscal)).result.success, true);
  assert.equal((await f.rpc("SetFiscalData", fiscal)).result.success, true);
  assert.equal((await f.studio.byId(row.id))?.provider_doc_id, "12345");
  const cancelled = await f.rpc("CancelTransaction", { id: p.id, reason: 1 });
  assert.equal(cancelled.result.state, -2);
  assert.deepEqual(await f.rpc("CancelTransaction", { id: p.id, reason: 1 }), cancelled);
  assert.equal((await f.studio.byId(row.id))?.state, "refunded");
  assert.ok((await f.studio.orderEntitlements(row.id))[0].revoked_at);
  assert.equal(f.db.value("SELECT amount FROM studio_refunds WHERE order_id=?", row.id), row.amount);
  await Promise.all(f.background);
});

test("Payme Studio: unknown/mode isolation, timeout and mixed inclusive statement", async () => {
  const f = await fixture();
  const now = Date.now();
  const live = await pendingOrder(f.db, { userId: 'live', mode: 'live', now });
  assert.equal((await f.rpc('CheckPerformTransaction', { account: { order_id: live.id }, amount: live.amount })).error.code, -31050);
  assert.equal((await f.rpc('CheckPerformTransaction', { account: { order_id: 'stu_missing' }, amount: 590000 })).error.code, -31050);
  const row = await pendingOrder(f.db, { userId: 'test', mode: 'test', now });
  const old = now - STUDIO_ORDER_TTL_MS - 1;
  await f.studio.prepare(row.id, { externalId: 'expired', providerTime: old, method: 'CreateTransaction', now: old });
  const expired = await f.rpc('CheckTransaction', { id: 'expired' });
  assert.equal(expired.result.state, -1);
  assert.equal(expired.result.reason, 4);
  const chat = await f.store.createOrder('chat-user', 'payme', 'test', crypto.randomUUID());
  assert.equal((await f.rpc('CheckPerformTransaction', { account: { order_id: chat.id }, amount: 2000000 })).result.detail.items[0].price, 2000000);
  await f.rpc('CreateTransaction', { account: { order_id: chat.id }, amount: 2000000, id: 'chat', time: now });
  const statement = await f.rpc('GetStatement', { from: old, to: now });
  assert.deepEqual(statement.result.transactions.map((r: {id: string}) => r.id), ['expired', 'chat']);
  assert.equal(await new StudioStore(f.binding, 'foreign-org').byId(row.id), null);
  await Promise.all(f.background);
});

test("Payme statement includes more than 500 accepted Studio transactions", async () => {
  const f = await fixture(); const now = Date.now();
  const row = await pendingOrder(f.db, { mode: 'test', now });
  await f.studio.prepare(row.id, { externalId: 't0', providerTime: now, method: 'CreateTransaction' });
  const columns = f.db.rows<{ name: string }>('PRAGMA table_info(studio_orders_v2)').map(r => r.name).filter(n => n !== 'seq');
  const source = f.db.rows<Record<string, string | number | null>>('SELECT * FROM studio_orders_v2 WHERE id=?', row.id)[0];
  for (let i=1;i<=500;i++) {
    const copy = { ...source, id: `stu_extra_${i}`, user_id: `user_${i}`, request_id: `request_${i}`, external_id: `t${i}`, event_id: `e${i}` };
    f.db.sqlite.prepare(`INSERT INTO studio_orders_v2(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(c => copy[c]));
  }
  const statement = await f.rpc('GetStatement', { from: now, to: now });
  assert.equal(statement.result.transactions.length, 501);
  assert.equal(f.db.value('SELECT COUNT(*) FROM studio_orders_v2 WHERE org_id=?', STUDIO_ORG), 501);
});

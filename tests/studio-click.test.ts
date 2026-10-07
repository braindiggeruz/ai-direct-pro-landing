import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paidDatabase, paidEnv, paidOrder, pendingOrder, studioJson } from "./helpers/studio-paid";
import { handleStudioClick } from "../functions/lib/studio/click-studio";
import { clickSignature } from "../functions/lib/gpt-chat/payment-protocol";
import { clickMerchantAuth, FiscalStore, fiscalizeDue } from "../functions/lib/gpt-chat/fiscal-store";
import { clickReceiptItem } from "../functions/lib/gpt-chat/click-merchant";
import type { BillingEnv } from "../functions/lib/gpt-chat/billing-config";
import { planOfVersion } from "../functions/lib/studio/plans";
import { onRequestPost as sharedClick } from "../functions/api/payments/click";
import { BillingStore } from "../functions/lib/gpt-chat/billing-store";
import { fakeClickMerchant } from "./helpers/click-merchant-fake";

const SHARED_CLICK = { service_id: "107654", merchant_id: "4444", merchant_user_id: "3333", secret_key: "shared-click-secret-for-tests" };
const sharedConfig = studioJson({ STUDIO_CLICK_USE_CHAT_SERVICE: "true", STUDIO_CLICK_AMOUNTS_CONFIRMED: "true", STUDIO_PAYMENT_PROVIDERS: "click" });
function sharedEnv(db: Awaited<ReturnType<typeof paidDatabase>>, mode: "test" | "live" = "test"): BillingEnv {
  return paidEnv(db, {
    STUDIO_RUNTIME_CONFIG_JSON: sharedConfig,
    GPT_BILLING_MODE_CLICK: mode,
    GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ [mode]: SHARED_CLICK }),
  }) as BillingEnv;
}
function signedForm(order: { id: string; seq: number; amount: number }, action = "0", extra: Record<string, string> = {}): URLSearchParams {
  const fields = { click_trans_id: "918273", click_paydoc_id: "192837", service_id: SHARED_CLICK.service_id, merchant_trans_id: order.id, amount: String(order.amount / 100), sign_time: "2026-10-07 15:00:00", error: "0", action, ...(action === "1" ? { merchant_prepare_id: String(order.seq) } : {}), ...extra };
  return new URLSearchParams({ ...fields, sign_string: clickSignature(fields, SHARED_CLICK.secret_key) });
}
async function sharedCall(env: BillingEnv, body: URLSearchParams, background: Promise<unknown>[] = []) {
  const response = await sharedClick({ request: new Request("https://gptbot.uz/api/payments/click", { method: "POST", body }), env, waitUntil: (task: Promise<unknown>) => background.push(task) } as never);
  return { status: response.status, body: await response.json() as { error: number; merchant_prepare_id?: number } };
}

for (const plan of ["kunlik", "oylik"] as const) test(`shared Click ${plan}: existing callback settles once with sales off, chat amount cannot buy Studio`, async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("network forbidden"); });
  const db = await paidDatabase(); const env = sharedEnv(db);
  env.STUDIO_RUNTIME_CONFIG_JSON = JSON.stringify({ STUDIO_CLICK_USE_CHAT_SERVICE: "true", STUDIO_PAYMENTS: "off" });
  const row = await pendingOrder(db, { provider: "click", serviceId: SHARED_CLICK.service_id, plan, mode: "test", now: Date.now() });
  const background: Promise<unknown>[] = [];
  assert.equal((await sharedCall(env, signedForm(row, "0", { amount: "20000" }), background)).body.error, -2);
  const prepared = await sharedCall(env, signedForm(row), background);
  assert.equal(prepared.body.error, 0);
  assert.deepEqual((await sharedCall(env, signedForm(row), background)).body, prepared.body);
  assert.equal((await sharedCall(env, signedForm(row, "1"), background)).body.error, 0);
  assert.equal((await sharedCall(env, signedForm(row, "1"), background)).body.error, -4);
  assert.equal(db.value("SELECT COUNT(*) FROM studio_entitlements WHERE order_id=?", row.id), 1);
  assert.equal(db.value("SELECT COUNT(*) FROM gpt_subscriptions"), 0);
  assert.equal(db.value("SELECT last_error FROM gpt_fiscal_receipts WHERE order_id=?", row.id), "skipped_test");
  assert.equal(clickMerchantAuth(env, "test", row.id)?.serviceId, SHARED_CLICK.service_id);
  await Promise.all(background);
});

test("shared Click authenticates and rejects ambiguous bodies before any D1 access", async () => {
  const db = await paidDatabase(); const env = sharedEnv(db);
  let touched = 0;
  env.GPTBOT_DRAFTS_DB = { prepare: () => { touched++; throw new Error("unexpected D1"); }, batch: () => { touched++; throw new Error("unexpected D1"); } } as unknown as D1Database;
  const row = { id: `stu_${"a".repeat(32)}`, seq: 1, amount: 590000 };
  const badSign = signedForm(row); badSign.set("sign_string", "invalid");
  assert.equal((await sharedCall(env, badSign)).body.error, -1);
  assert.equal((await sharedCall(env, signedForm(row, "0", { service_id: "99999" }))).body.error, -1);
  const duplicated = signedForm(row); duplicated.append("merchant_trans_id", "pay_other");
  assert.equal((await sharedCall(env, duplicated)).body.error, -8);
  const tooLarge = signedForm(row); tooLarge.append("unused", "x".repeat(8192));
  assert.equal((await sharedCall(env, tooLarge)).body.error, -8);
  assert.equal((await sharedCall({ ...env, GPT_BILLING_MODE_CLICK: "live" }, signedForm(row))).status, 404);
  assert.equal((await sharedCall({ ...env, GPT_PAYMENT_PROVIDERS: "payme" }, signedForm(row))).status, 404);
  assert.equal(touched, 0);
});

for (const first of ["chat", "studio", "concurrent"] as const) test(`shared Click external transaction ownership: ${first} Prepare wins at most once across products`, async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("network forbidden"); });
  const db = await paidDatabase(); const env = sharedEnv(db); const background: Promise<unknown>[] = [];
  const studio = await pendingOrder(db, { provider: "click", serviceId: SHARED_CLICK.service_id, mode: "test", now: Date.now() });
  db.exec(readFileSync(new URL("../migrations/0065_gpt_uzum_payments.sql", import.meta.url), "utf8"));
  const chatStore = new BillingStore(db.asD1(), "gptbot-consumer");
  const chat = await chatStore.createOrder("acct_chat_shared_buyer", "click", "test", crypto.randomUUID());
  assert.equal(chat.amount, 2000000);
  const rows = first === "studio" ? [studio, chat] : [chat, studio];
  const replies = first === "concurrent"
    ? await Promise.all(rows.map(row => sharedCall(env, signedForm(row), background)))
    : [await sharedCall(env, signedForm(rows[0]), background), await sharedCall(env, signedForm(rows[1]), background)];
  assert.deepEqual(replies.map(reply => reply.body.error).sort((a, b) => a - b), [-8, 0]);
  const winner = rows[replies.findIndex(reply => reply.body.error === 0)];
  const loser = rows.find(row => row.id !== winner.id)!;
  assert.equal((await sharedCall(env, signedForm(loser, "1"), background)).body.error, -6);
  assert.equal((await sharedCall(env, signedForm(winner, "1"), background)).body.error, 0);
  assert.equal((await sharedCall(env, signedForm(winner, "1"), background)).body.error, -4);
  assert.equal(Number(db.value("SELECT COUNT(*) FROM studio_entitlements")) + Number(db.value("SELECT COUNT(*) FROM gpt_access_periods")), 1);
  await Promise.all(background);
});

for (const policy of ["true", "false", ""] as const) test(`shared Studio fiscal uses chat policy '${policy}', shared authentication and the tariff receipt line`, async t => {
  const db = await paidDatabase(); const env = sharedEnv(db, "live");
  env.GPT_CLICK_AUTOFISCAL = policy;
  env.STUDIO_RUNTIME_CONFIG_JSON = studioJson({ STUDIO_CLICK_USE_CHAT_SERVICE: "true", STUDIO_CLICK_AUTOFISCAL: policy === "true" ? "false" : "true" });
  const { fake, restore } = fakeClickMerchant([{ serviceId: SHARED_CLICK.service_id, merchantUserId: SHARED_CLICK.merchant_user_id, secretKey: SHARED_CLICK.secret_key }]);
  t.after(restore);
  const now = Date.now();
  const row = await paidOrder(db, { provider: "click", serviceId: SHARED_CLICK.service_id, plan: "kunlik", mode: "live", paidAt: now });
  fake.pay(row.id, row.provider_time);
  await fiscalizeDue(env, { now: now + 1000 });
  assert.equal(fake.count("POST", "submit_items"), policy === "false" ? 1 : 0);
  if (policy === "false") {
    const submit = fake.calls.find(call => call.method === "POST" && call.path.includes("submit_items"))!;
    const items = submit.body?.items as Array<Record<string, unknown>>;
    assert.equal(items[0].Name, planOfVersion(row.plan_version, "kunlik")!.receiptName);
    assert.equal(items[0].Price, row.amount);
  } else {
    assert.equal(db.value("SELECT last_error FROM gpt_fiscal_receipts WHERE order_id=?", row.id), policy === "true" ? "auto_pending" : "auto_wait");
  }
});

for (const plan of ['kunlik','oylik'] as const) test(`Studio Click ${plan}: separate signed service, amount, prepare/complete/repeats, test receipt`, async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network forbidden'); });
  const db = await paidDatabase();
  const creds = { service_id: '117777', merchant_user_id: '3333', secret_key: 'studio-click-tests-secret' };
  const env = paidEnv(db, { STUDIO_RUNTIME_CONFIG_JSON: '{}', STUDIO_CLICK_CREDENTIALS_JSON: JSON.stringify({ test: creds }) }) as BillingEnv;
  const row = await pendingOrder(db, { provider: 'click', serviceId: creds.service_id, plan, mode: 'test', now: Date.now() });
  const background: Promise<unknown>[]=[];
  const p = { click_trans_id: '12345', click_paydoc_id: '56789', service_id: creds.service_id, merchant_trans_id: row.id, amount: String(row.amount/100), sign_time: '2026-10-07 15:00:00', error: '0', action: '0' };
  const call = async (extra: Record<string,string>={}) => {
    const fields={...p,...extra};
    const body=new URLSearchParams({...fields, sign_string: clickSignature(fields,creds.secret_key)});
    return (await handleStudioClick(new Request('https://gptbot.uz/api/payments/click-studio',{method:'POST',body}),env, task=>background.push(task))).json();
  };
  assert.equal((await call({amount:'20000'})).error,-2);
  assert.equal((await call({action:'1',merchant_prepare_id:String(row.seq)})).error,-6);
  const prepared=await call();assert.equal(prepared.error,0);assert.deepEqual(await call(),prepared);
  assert.equal((await call({action:'1',merchant_prepare_id:'999999'})).error,-6);
  assert.equal((await call({action:'1',merchant_prepare_id:String(row.seq)})).error,0);
  assert.equal((await call({action:'1',merchant_prepare_id:String(row.seq)})).error,-4);
  assert.equal(db.value('SELECT COUNT(*) FROM studio_entitlements WHERE order_id=?',row.id),1);
  assert.equal(db.value('SELECT last_error FROM gpt_fiscal_receipts WHERE order_id=?',row.id),'skipped_test');
  const fiscal = await new FiscalStore(db.asD1(), 'gptbot-consumer').clickOrder(row.id);
  assert.equal(fiscal?.amount,row.amount);
  assert.equal(clickMerchantAuth(env,'test',row.id)?.serviceId,creds.service_id);
  const tariff=planOfVersion(row.plan_version,plan)!;
  assert.equal(clickReceiptItem({ikpu:'10305008002000000',packageCode:'1514296',vatPercent:12},'310618348',row.amount,tariff.receiptName).Name,tariff.receiptName);
  await Promise.all(background);
});

test('Studio Click: no credentials is 404; signed cancellation does not grant; foreign service cannot settle', async () => {
  const db=await paidDatabase();
  const request=()=>new Request('https://gptbot.uz/api/payments/click-studio',{method:'POST',body:new URLSearchParams()});
  assert.equal((await handleStudioClick(request(),{} as BillingEnv,()=>{})).status,404);
  const creds={service_id:'777',secret_key:'studio-click-test-secret'};
  const env=paidEnv(db,{STUDIO_CLICK_CREDENTIALS_JSON:JSON.stringify({test:creds})}) as BillingEnv;
  const row=await pendingOrder(db,{provider:'click',serviceId:'777',mode:'test',now:Date.now()});
  const p={click_trans_id:'789',click_paydoc_id:'456',service_id:'777',merchant_trans_id:row.id,amount:String(row.amount/100),sign_time:'delayed',error:'-1',action:'0'};
  const send=async(fields:typeof p)=>(await handleStudioClick(new Request(request().url,{method:'POST',body:new URLSearchParams({...fields,sign_string:clickSignature(fields,creds.secret_key)})}),env,()=>{})).json();
  assert.equal((await send({...p,service_id:'778'})).error,-1);
  assert.equal((await send(p)).error,-9);
  assert.equal((await send({...p,error:'0'})).error,-9);
  assert.equal(db.value('SELECT COUNT(*) FROM studio_entitlements'),0);
});

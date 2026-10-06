// Payme Merchant API (functions/api/payments/payme.ts) against every check of
// Payme's sandbox (developer.help.paycom.uz/pesochnitsa): wrong authorization
// -32504, wrong amount -31001, an unknown or unpayable order -31050 with
// data "order_id", repeats of CreateTransaction / PerformTransaction /
// CancelTransaction answering as the first time, a second transaction for an
// order -31008, cancelling before and after PerformTransaction, the fields of
// CheckTransaction, GetStatement's range and the 12-hour timeout. Then the
// receipt `detail`, SetFiscalData, the checkout page (payme-checkout.ts),
// subscribe in a rehearsal session, the owner's notice of a live refund and
// the receipt queue that never prints a Payme order.
// Random keys and ids only; nothing here reaches Payme or any network.
// Run: node --import tsx --test tests/gpt-payme.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import {
  BILLING_ORG,
  PAYMENT_TTL_MS,
  PRICE_TIYIN,
  type BillingEnv,
} from "../functions/lib/gpt-chat/billing-config";
import { maintainBilling } from "../functions/lib/gpt-chat/billing-maintenance-store";
import { fiscalizeDue } from "../functions/lib/gpt-chat/fiscal-store";
import {
  PAYME_CHECKOUT_BASE,
  paymeCheckoutUrl,
  paymeReceiptDetail,
} from "../functions/lib/gpt-chat/payme-checkout";
import { mintRehearsal, REHEARSAL_COOKIE } from "../functions/lib/gpt-chat/rehearsal";
import { onRequest as paymeOther, onRequestPost as payme } from "../functions/api/payments/payme";
import { onRequestGet as account } from "../functions/api/gpt/account";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { allowedCheckoutUrl } from "../src/gpt-chat/types";

type Rpc = { id: unknown; result?: Record<string, unknown>; error?: { code: number; message: unknown; data: unknown } };

const FISCAL = {
  GPT_FISCAL_IKPU: "10305008002000000",
  GPT_FISCAL_PACKAGE_CODE: "1514296",
  GPT_FISCAL_VAT_PERCENT: "12",
  GPT_FISCAL_TIN: "310618348",
};
/** The receipt line CheckPerformTransaction must carry (PAYME-REQUIREMENTS 3.1). */
const DETAIL = {
  receipt_type: 0,
  items: [
    {
      title: "AI paket 300 (xizmat, 1 oy)",
      price: 2000000,
      count: 1,
      code: "10305008002000000",
      package_code: "1514296",
      vat_percent: 12,
    },
  ],
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Payme's transaction ids are 24 hex characters. */
const txId = () => randomBytes(12).toString("hex");
const bomb = {
  prepare() {
    throw new Error("DB touched");
  },
  batch() {
    throw new Error("DB touched");
  },
};

/** The fixture as production runs Payme: its own mode "test", nothing global. */
async function setup(extra: Partial<BillingEnv> = {}) {
  const f = await billingFixture();
  Object.assign(f.env, { GPT_BILLING_MODE: "", GPT_BILLING_MODE_PAYME: "test", ...FISCAL, ...extra });
  const auth = (key = f.env.GPT_PAYME_TEST_KEY!, login = "Paycom") => `Basic ${btoa(`${login}:${key}`)}`;
  /** One JSON-RPC call as Payme sends it; `body` goes as it is when it is a string. */
  const send = async (
    body: unknown,
    options: { authorization?: string | null; env?: BillingEnv } = {},
  ): Promise<{ status: number; body: Rpc }> => {
    const headers: Record<string, string> = { "Content-Type": "text/json; charset=UTF-8" };
    const authorization = options.authorization === undefined ? auth() : options.authorization;
    if (authorization !== null) headers.Authorization = authorization;
    const response = await payme({
      request: new Request("https://gptbot.uz/api/payments/payme", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      env: options.env ?? f.env,
      waitUntil: (task: Promise<unknown>) => f.background.push(task),
    } as unknown as Parameters<typeof payme>[0]);
    return { status: response.status, body: (await response.json()) as Rpc };
  };
  let seq = 100;
  /** A call with a fresh id, checked to come back with that id and HTTP 200. */
  const call = async (method: string, params: Record<string, unknown>) => {
    const id = ++seq;
    const answer = await send({ jsonrpc: "2.0", id, method, params });
    assert.equal(answer.status, 200, method);
    assert.equal(answer.body.id, id, `${method}: the answer carries the request's id`);
    return answer.body;
  };
  /** A fresh test order of its own account (one open invoice per account, U7). */
  const order = (user = `acct_${randomUUID().replace(/-/g, "")}`, mode: "test" | "live" = "test") =>
    f.store.createOrder(user, "payme", mode, randomUUID());
  const settle = async () => {
    while (f.background.length) await Promise.allSettled(f.background.splice(0));
  };
  return { ...f, auth, send, call, order, settle };
}

const code = (answer: Rpc) => answer.error?.code;

test("wrong authorization: -32504 on every method, with the request's id, before any database read", async () => {
  const f = await setup();
  const env = { ...f.env, GPTBOT_DRAFTS_DB: bomb } as unknown as BillingEnv;
  const methods = [
    "CheckPerformTransaction",
    "CreateTransaction",
    "PerformTransaction",
    "CancelTransaction",
    "CheckTransaction",
    "GetStatement",
    "SetFiscalData",
    "ChangePassword",
  ];
  const wrong = [
    null,
    "",
    f.auth(randomBytes(18).toString("hex")),
    f.auth(f.env.GPT_PAYME_TEST_KEY, "paycom"),
    f.auth(f.env.GPT_PAYME_TEST_KEY, "Merchant"),
    `Basic ${btoa(f.env.GPT_PAYME_TEST_KEY!)}`,
    "Basic !!!not-base64!!!",
    `Bearer ${f.env.GPT_PAYME_TEST_KEY}`,
    `Basic ${btoa(`Paycom:${f.env.GPT_PAYME_TEST_KEY}x`)}`,
  ];
  let id = 9000;
  for (const method of methods)
    for (const authorization of wrong) {
      id++;
      const answer = await f.send({ id, method, params: { account: { order_id: "pay_x" }, amount: 1 } }, { authorization, env });
      assert.equal(answer.status, 200);
      assert.equal(answer.body.id, id, `${method}: the id comes back`);
      assert.equal(code(answer.body), -32504, `${method} ${authorization}`);
      assert.deepEqual(answer.body.error?.message, {
        ru: "Недостаточно привилегий для выполнения метода",
        uz: "Usulni bajarish uchun huquq yetarli emas",
        en: "Insufficient privileges to perform this method",
      });
      assert.equal(answer.body.result, undefined);
    }
  // In test, the production key is refused too, and in live the test key.
  f.env.GPT_PAYME_KEY = randomBytes(18).toString("hex");
  assert.equal(code((await f.send({ id: 1, method: "CheckTransaction", params: { id: txId() } }, { authorization: f.auth(f.env.GPT_PAYME_KEY), env })).body), -32504);
  const live = { ...env, GPT_BILLING_MODE_PAYME: "live", GPT_PAYME_KEY: f.env.GPT_PAYME_KEY } as BillingEnv;
  assert.equal(code((await f.send({ id: 1, method: "CheckTransaction", params: { id: txId() } }, { env: live })).body), -32504);
  // Basic in any letter case with the right key passes authentication (then -31003, from D1).
  const right = await f.send({ id: 5, method: "CheckTransaction", params: { id: txId() } }, { authorization: `basic   ${btoa(`Paycom:${f.env.GPT_PAYME_TEST_KEY}`)} ` });
  assert.equal(code(right.body), -31003);
});

test("the route exists only with Payme's mode and key; the envelope's own errors", async () => {
  const f = await setup();
  let bodyRead = false;
  const probe = (env: Record<string, unknown>) =>
    payme({
      request: new Request("https://gptbot.uz/api/payments/payme", {
        method: "POST",
        headers: { Authorization: f.auth() },
        body: new ReadableStream({ pull(controller) { bodyRead = true; controller.enqueue(new TextEncoder().encode("{}")); controller.close(); } }, { highWaterMark: 0 }),
        duplex: "half",
      } as RequestInit),
      env: { ...env, GPTBOT_DRAFTS_DB: bomb },
      waitUntil() {},
    } as unknown as Parameters<typeof payme>[0]);
  for (const change of [
    { GPT_PAYMENT_PROVIDERS: "click,uzum" },
    { GPT_BILLING_MODE_PAYME: "" },
    { GPT_BILLING_MODE_PAYME: "off", GPT_BILLING_MODE: "test" },
    { GPT_BILLING_MODE_PAYME: "TEST" },
    { GPT_PAYME_TEST_KEY: "" },
    { GPT_PAYME_TEST_KEY: "too-short" },
    { GPT_BILLING_MODE_PAYME: "live" },
  ]) {
    const response = await probe({ ...f.env, ...change });
    assert.equal(response.status, 404, JSON.stringify(change));
    assert.equal(bodyRead, false, "a missing route reads no body");
  }
  // The global mode still opens it when Payme's own is empty (as for Click and
  // Uzum): the key is right, the empty request is not (-32600), before D1.
  assert.equal(((await (await probe({ ...f.env, GPT_BILLING_MODE_PAYME: "", GPT_BILLING_MODE: "test" })).json()) as Rpc).error?.code, -32600);
  // Not POST: -32300, HTTP 200.
  const get = await paymeOther({ request: new Request("https://gptbot.uz/api/payments/payme"), env: f.env } as unknown as Parameters<typeof paymeOther>[0]);
  assert.equal(get.status, 200);
  assert.equal(((await get.json()) as Rpc).error?.code, -32300);
  // Broken JSON -32700 (no id to return); a request without its fields -32600.
  assert.deepEqual(await f.send("{nope").then((a) => [a.status, a.body.id, code(a.body)]), [200, null, -32700]);
  assert.deepEqual(await f.send("x".repeat(20_000)).then((a) => [a.status, code(a.body)]), [200, -32700]);
  assert.deepEqual(await f.send([]).then((a) => [a.body.id, code(a.body)]), [null, -32600]);
  assert.deepEqual(await f.send({ id: 3, method: "CheckTransaction" }).then((a) => [a.body.id, code(a.body)]), [3, -32600]);
  assert.deepEqual(await f.send({ id: 4, method: 7, params: {} }).then((a) => [a.body.id, code(a.body)]), [4, -32600]);
  assert.deepEqual(await f.send({ id: "x", method: "CheckTransaction", params: {} }).then((a) => [a.body.id, code(a.body)]), [null, -32600]);
  // An unknown method (ChangePassword is not implemented): -32601 naming it.
  const unknown = await f.call("ChangePassword", { password: "x" });
  assert.deepEqual([unknown.error?.code, unknown.error?.data], [-32601, "ChangePassword"]);
});

test("sandbox scenario 1: wrong amount, unknown order, CheckPerform with the receipt detail, create (twice), a second transaction, cancel before perform", async () => {
  const f = await setup();
  const o = await f.order();
  const time = Date.now();
  const tx = txId();
  const account = { order_id: o.id };
  // "Неверная сумма": -31001 on both methods.
  for (const method of ["CheckPerformTransaction", "CreateTransaction"]) {
    const answer = await f.call(method, { id: tx, time, amount: 20000, account });
    assert.equal(code(answer), -31001, method);
    assert.deepEqual(answer.error?.message, { ru: "Неверная сумма", uz: "Noto‘g‘ri summa", en: "Incorrect amount" });
  }
  // "Несуществующий счёт": -31050 with data "order_id" and a message for the payer.
  for (const method of ["CheckPerformTransaction", "CreateTransaction"])
    for (const bad of [{ order_id: `pay_${"0".repeat(32)}` }, { order_id: 197 }, {}, null, { order_id: "x".repeat(100) }]) {
      const answer = await f.call(method, { id: tx, time, amount: PRICE_TIYIN, account: bad });
      assert.deepEqual([answer.error?.code, answer.error?.data], [-31050, "order_id"], `${method} ${JSON.stringify(bad)}`);
      assert.deepEqual(answer.error?.message, {
        ru: "Заказ не найден или его нельзя оплатить",
        uz: "Buyurtma topilmadi yoki uni to‘lab bo‘lmaydi",
        en: "Order not found or cannot be paid",
      });
    }
  // A Click order or a live order is not this cash desk's test order.
  const clickOrder = await f.store.createOrder(`acct_${randomUUID()}`, "click", "test", randomUUID());
  const liveOrder = await f.order(undefined, "live");
  for (const other of [clickOrder, liveOrder])
    assert.equal(code(await f.call("CheckPerformTransaction", { amount: PRICE_TIYIN, account: { order_id: other.id } })), -31050);
  // CheckPerformTransaction: allowed, with the fiscal receipt line.
  assert.deepEqual((await f.call("CheckPerformTransaction", { amount: PRICE_TIYIN, account })).result, { allow: true, detail: DETAIL });
  // CreateTransaction, and Payme's repeat of it: the same answer.
  const created = await f.call("CreateTransaction", { id: tx, time, amount: PRICE_TIYIN, account });
  assert.equal(created.result?.state, 1);
  assert.equal(created.result?.transaction, o.id);
  assert.ok(Number(created.result?.create_time) >= time - 1000);
  assert.deepEqual((await f.call("CreateTransaction", { id: tx, time, amount: PRICE_TIYIN, account })).result, created.result);
  assert.deepEqual((await f.call("CheckTransaction", { id: tx })).result, {
    create_time: created.result?.create_time,
    perform_time: 0,
    cancel_time: 0,
    transaction: o.id,
    state: 1,
    reason: null,
  });
  // "CreateTransaction с новой транзакцией ... «В ожидании оплаты»": -31008.
  const second = await f.call("CreateTransaction", { id: txId(), time: Date.now(), amount: PRICE_TIYIN, account });
  assert.equal(code(second), -31008);
  assert.deepEqual(second.error?.message, { ru: "Невозможно выполнить операцию", uz: "Amalni bajarib bo‘lmaydi", en: "Unable to perform the operation" });
  // The same id with another time is not a repeat either.
  assert.equal(code(await f.call("CreateTransaction", { id: tx, time: time - 1, amount: PRICE_TIYIN, account })), -31008);
  // While Payme holds the order, CheckPerformTransaction still allows it (gap G11, unchanged).
  assert.equal((await f.call("CheckPerformTransaction", { amount: PRICE_TIYIN, account })).result?.allow, true);
  // CancelTransaction of the unperformed transaction: state -1, and its repeats
  // (even with another reason) answer the same; CheckTransaction says why.
  const cancelled = await f.call("CancelTransaction", { id: tx, reason: 3 });
  assert.equal(cancelled.result?.state, -1);
  assert.equal(cancelled.result?.transaction, o.id);
  assert.ok(Number(cancelled.result?.cancel_time) > 0);
  assert.deepEqual((await f.call("CancelTransaction", { id: tx, reason: 3 })).result, cancelled.result);
  assert.deepEqual((await f.call("CancelTransaction", { id: tx, reason: 1 })).result, cancelled.result);
  assert.deepEqual((await f.call("CheckTransaction", { id: tx })).result, {
    create_time: created.result?.create_time,
    perform_time: 0,
    cancel_time: cancelled.result?.cancel_time,
    transaction: o.id,
    state: -1,
    reason: 3,
  });
  // A cancelled transaction is never performed, re-created or paid for again.
  assert.equal(code(await f.call("PerformTransaction", { id: tx })), -31008);
  assert.equal(code(await f.call("CreateTransaction", { id: tx, time, amount: PRICE_TIYIN, account })), -31008);
  assert.equal(code(await f.call("CheckPerformTransaction", { amount: PRICE_TIYIN, account })), -31050);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE order_id=?", o.id), 0);
  // Unknown transactions; a cancel reason Payme does not have.
  for (const method of ["PerformTransaction", "CancelTransaction", "CheckTransaction"])
    assert.equal(code(await f.call(method, { id: txId(), reason: 1 })), -31003, method);
  const fresh = await f.order();
  const tx2 = txId();
  await f.call("CreateTransaction", { id: tx2, time: Date.now(), amount: PRICE_TIYIN, account: { order_id: fresh.id } });
  assert.equal(code(await f.call("CancelTransaction", { id: tx2, reason: 7 })), -32600);
  assert.equal(code(await f.call("CancelTransaction", { id: tx2 })), -32600);
  // Every journal step is the provider's own, never "user" or "owner".
  assert.deepEqual(
    f.db.rows<{ actor: string; method: string; to_state: string }>("SELECT actor,method,to_state FROM gpt_payment_journal WHERE order_id=? ORDER BY created_at,rowid", o.id).map((r) => ({ ...r })),
    [
      { actor: "account", method: "checkout", to_state: "pending" },
      { actor: "payme", method: "CreateTransaction", to_state: "prepared" },
      { actor: "payme", method: "CancelTransaction", to_state: "cancelled" },
    ],
  );
  await f.settle();
});

test("sandbox scenario 2: create, perform (twice), a second transaction, cancel the performed one (a refund closes the pack)", async () => {
  const f = await setup();
  const user = f.user;
  const o = await f.order(user);
  const tx = txId();
  const time = Date.now();
  const account = { order_id: o.id };
  assert.equal((await f.call("CheckPerformTransaction", { amount: PRICE_TIYIN, account })).result?.allow, true);
  const created = await f.call("CreateTransaction", { id: tx, time, amount: PRICE_TIYIN, account });
  assert.deepEqual((await f.call("CreateTransaction", { id: tx, time, amount: PRICE_TIYIN, account })).result, created.result);
  assert.equal(code(await f.call("CreateTransaction", { id: txId(), time, amount: PRICE_TIYIN, account })), -31008);
  // PerformTransaction and its repeats, also in parallel: one pack, one answer.
  const performed = await f.call("PerformTransaction", { id: tx });
  assert.equal(performed.result?.state, 2);
  assert.equal(performed.result?.transaction, o.id);
  assert.ok(Number(performed.result?.perform_time) >= Number(created.result?.create_time));
  const repeats = await Promise.all(Array.from({ length: 4 }, () => f.call("PerformTransaction", { id: tx })));
  for (const repeat of repeats) assert.deepEqual(repeat.result, performed.result);
  assert.deepEqual((await f.call("CheckTransaction", { id: tx })).result, {
    create_time: created.result?.create_time,
    perform_time: performed.result?.perform_time,
    cancel_time: 0,
    transaction: o.id,
    state: 2,
    reason: null,
  });
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE order_id=? AND revoked_at IS NULL", o.id), 1);
  assert.ok(await f.store.access(user, "test"));
  // A paid order takes no other transaction and is no longer payable.
  assert.equal(code(await f.call("CreateTransaction", { id: txId(), time: Date.now(), amount: PRICE_TIYIN, account })), -31008);
  assert.equal(code(await f.call("CheckPerformTransaction", { amount: PRICE_TIYIN, account })), -31050);
  // CancelTransaction after PerformTransaction: the money goes back, state -2,
  // the pack closes; repeats answer the same; it is never performed again.
  const refunded = await f.call("CancelTransaction", { id: tx, reason: 5 });
  assert.equal(refunded.result?.state, -2);
  assert.deepEqual((await f.call("CancelTransaction", { id: tx, reason: 5 })).result, refunded.result);
  assert.deepEqual((await f.call("CheckTransaction", { id: tx })).result, {
    create_time: created.result?.create_time,
    perform_time: performed.result?.perform_time,
    cancel_time: refunded.result?.cancel_time,
    transaction: o.id,
    state: -2,
    reason: 5,
  });
  assert.equal(await f.store.access(user, "test"), null);
  assert.equal(code(await f.call("PerformTransaction", { id: tx })), -31008);
  assert.equal((await f.store.order(o.id))?.state, "refunded");
  // Payme prints the sale and refund receipts itself: our queue holds nothing for it.
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts WHERE order_id=?", o.id), 0);
  await f.settle();
});

test("the 12-hour timeout counts from Payme's own time and cancels with reason 4", async () => {
  const f = await setup();
  // A transaction Payme created more than 12 hours ago is refused and not stored.
  const o = await f.order();
  const account = { order_id: o.id };
  const stale = txId();
  assert.equal(code(await f.call("CreateTransaction", { id: stale, time: Date.now() - PAYMENT_TTL_MS - 1, amount: PRICE_TIYIN, account })), -31008);
  assert.equal(code(await f.call("CheckTransaction", { id: stale })), -31003);
  assert.equal((await f.store.order(o.id))?.state, "pending");
  // A time in the future (beyond a minute of clock skew) is not a valid request.
  assert.equal(code(await f.call("CreateTransaction", { id: txId(), time: Date.now() + 3_600_000, amount: PRICE_TIYIN, account })), -32600);
  // Created just inside the 12 hours: Payme's repeat after the limit cancels it.
  const tx = txId();
  const time = Date.now() - PAYMENT_TTL_MS + 150;
  assert.equal((await f.call("CreateTransaction", { id: tx, time, amount: PRICE_TIYIN, account })).result?.state, 1);
  await sleep(250);
  assert.equal(code(await f.call("CreateTransaction", { id: tx, time, amount: PRICE_TIYIN, account })), -31008);
  const check = (await f.call("CheckTransaction", { id: tx })).result;
  assert.deepEqual([check?.state, check?.reason, check?.perform_time], [-1, 4, 0]);
  // A transaction that ran out of time is never performed.
  const o2 = await f.order();
  const tx2 = txId();
  await f.call("CreateTransaction", { id: tx2, time: Date.now() - 1000, amount: PRICE_TIYIN, account: { order_id: o2.id } });
  f.db.prepare("UPDATE gpt_payment_orders SET provider_time=?, expires_at=? WHERE id=?").bind(Date.now() - PAYMENT_TTL_MS - 1, Date.now() - 1, o2.id).runSync();
  assert.equal(code(await f.call("PerformTransaction", { id: tx2 })), -31008);
  const expired = (await f.call("CheckTransaction", { id: tx2 })).result;
  assert.deepEqual([expired?.state, expired?.reason], [-1, 4]);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE order_id=?", o2.id), 0);
  // Our own invoice expired before Payme created anything: not payable (-31050).
  const o3 = await f.order();
  f.db.prepare("UPDATE gpt_payment_orders SET expires_at=? WHERE id=?").bind(Date.now() - 1, o3.id).runSync();
  for (const method of ["CheckPerformTransaction", "CreateTransaction"])
    assert.deepEqual(
      await f.call(method, { id: txId(), time: Date.now(), amount: PRICE_TIYIN, account: { order_id: o3.id } }).then((a) => [a.error?.code, a.error?.data]),
      [-31050, "order_id"],
      method,
    );
  await f.settle();
});

test("GetStatement: every created transaction by Payme's time, both ends included, in order; failed creates and others out", async () => {
  const f = await setup();
  const now = Date.now();
  const at = [now - 50_000, now - 40_000, now - 30_000, now - 20_000];
  const orders = await Promise.all(at.map(() => f.order()));
  const txs = at.map(() => txId());
  // Created out of order on purpose; the statement sorts by Payme's time.
  for (const i of [2, 0, 1, 3])
    await f.call("CreateTransaction", { id: txs[i], time: at[i], amount: PRICE_TIYIN, account: { order_id: orders[i].id } });
  await f.call("PerformTransaction", { id: txs[1] });
  await f.call("CancelTransaction", { id: txs[0], reason: 2 });
  // A create that failed (wrong amount) is never in the statement.
  const failed = await f.order();
  await f.call("CreateTransaction", { id: txId(), time: at[1], amount: 1, account: { order_id: failed.id } });
  const statement = await f.call("GetStatement", { from: at[0], to: at[2] });
  const rows = statement.result?.transactions as Array<Record<string, unknown>>;
  assert.deepEqual(rows.map((r) => r.id), [txs[0], txs[1], txs[2]]);
  for (const [i, row] of rows.entries()) {
    const check = (await f.call("CheckTransaction", { id: txs[i] })).result!;
    assert.deepEqual(row, {
      id: txs[i],
      time: at[i],
      amount: PRICE_TIYIN,
      account: { order_id: orders[i].id },
      ...check,
    });
  }
  assert.deepEqual(rows.map((r) => r.state), [-1, 2, 1]);
  const edge = (await f.call("GetStatement", { from: at[3], to: at[3] })).result?.transactions as Array<Record<string, unknown>>;
  assert.deepEqual(edge.map((r) => [r.id, r.time, r.state]), [[txs[3], at[3], 1]]);
  assert.equal(((await f.call("GetStatement", { from: 0, to: now })).result?.transactions as unknown[]).length, 4);
  assert.deepEqual((await f.call("GetStatement", { from: at[3] + 1, to: now })).result, { transactions: [] });
  for (const bad of [{ from: at[2], to: at[0] }, { from: -1, to: 5 }, { from: "1", to: 2 }, {}])
    assert.equal(code(await f.call("GetStatement", bad)), -32600, JSON.stringify(bad));
  await f.settle();
});

test("the receipt detail: the pack's one line from GPT_FISCAL_*, sum equal to the amount; without the codes CheckPerform is -32400", async () => {
  const f = await setup();
  const detail = paymeReceiptDetail(f.env)!;
  assert.deepEqual(detail, DETAIL);
  assert.equal(detail.items.reduce((sum, item) => sum + item.price * item.count, 0), PRICE_TIYIN);
  // The honest product name (decision L16): no GPT, ChatGPT or subscription.
  assert.doesNotMatch(detail.items[0].title, /gpt|chatgpt|plus|obuna|подписк/i);
  const o = await f.order();
  for (const missing of ["GPT_FISCAL_IKPU", "GPT_FISCAL_PACKAGE_CODE", "GPT_FISCAL_VAT_PERCENT"] as const) {
    const env = { ...f.env, [missing]: "" } as BillingEnv;
    assert.equal(paymeReceiptDetail(env), null);
    const answer = await f.send({ id: 11, method: "CheckPerformTransaction", params: { amount: PRICE_TIYIN, account: { order_id: o.id } } }, { env });
    assert.deepEqual([answer.body.id, code(answer.body)], [11, -32400], missing);
  }
  // The TIN is not on Payme's line (the cash desk is the seller's own).
  assert.deepEqual(paymeReceiptDetail({ ...f.env, GPT_FISCAL_TIN: "" } as BillingEnv), DETAIL);
  await f.settle();
});

test("SetFiscalData: Payme's receipt is kept, its link shown, never queued for printing; bad params name themselves", async () => {
  const f = await setup();
  const o = await f.order(f.user);
  const tx = txId();
  await f.call("CreateTransaction", { id: tx, time: Date.now(), amount: PRICE_TIYIN, account: { order_id: o.id } });
  await f.call("PerformTransaction", { id: tx });
  const qr = "https://ofd.soliq.uz/check?t=EP000000000025&r=1234&c=20261006120000&s=123456789012";
  const fiscal = (type: string, data: Record<string, unknown>) => f.call("SetFiscalData", { id: tx, type, fiscal_data: data });
  assert.deepEqual(
    (await fiscal("PERFORM", { receipt_id: 1234, status_code: 0, message: "Успешно", terminal_id: "EP000000000025", fiscal_sign: "123456789012", qr_code_url: qr, date: "20261006120000" })).result,
    { success: true },
  );
  assert.deepEqual(
    { ...f.db.rows("SELECT order_id,kind,transaction_id,status_code,message,receipt_id,terminal_id,fiscal_sign,qr_code_url,fiscal_date FROM gpt_payme_fiscal")[0] as object },
    { order_id: o.id, kind: "PERFORM", transaction_id: tx, status_code: 0, message: "Успешно", receipt_id: "1234", terminal_id: "EP000000000025", fiscal_sign: "123456789012", qr_code_url: qr, fiscal_date: "20261006120000" },
  );
  assert.deepEqual(
    { ...f.db.rows("SELECT kind,provider,status_code,receipt_url,attempts,next_at FROM gpt_fiscal_receipts WHERE order_id=?", o.id)[0] as object },
    { kind: "PERFORM", provider: "payme", status_code: 0, receipt_url: qr, attempts: 0, next_at: 0 },
  );
  // The rehearsal session's panel links the receipt (ofd.soliq.uz only).
  const view = (await (await account(f.ctx(new Request("https://gptbot.uz/api/gpt/account", { headers: { cookie: f.testCookie } })))).json()) as { receipts: unknown[] };
  assert.deepEqual(view.receipts, [{ kind: "PERFORM", receipt_url: qr }]);
  // The queue claims Click and Uzum rows only: the Payme row is never touched.
  await fiscalizeDue(f.env);
  assert.deepEqual(
    { ...f.db.rows("SELECT provider,status_code,attempts,next_at,lease_until,last_error FROM gpt_fiscal_receipts WHERE order_id=?", o.id)[0] as object },
    { provider: "payme", status_code: 0, attempts: 0, next_at: 0, lease_until: 0, last_error: null },
  );
  // The sandbox's sample link ("fiscal receipt url") is accepted and not kept;
  // the cancellation is a receipt of its own.
  await f.call("CancelTransaction", { id: tx, reason: 5 });
  assert.deepEqual((await fiscal("CANCEL", { status_code: 0, qr_code_url: "fiscal receipt url", receipt_id: "x\u0000y" })).result, { success: true });
  assert.deepEqual(
    f.db.rows<{ kind: string; receipt_url: string | null }>("SELECT kind,receipt_url FROM gpt_fiscal_receipts WHERE order_id=? ORDER BY kind", o.id).map((r) => ({ ...r })),
    [{ kind: "CANCEL", receipt_url: null }, { kind: "PERFORM", receipt_url: qr }],
  );
  assert.equal(f.db.value("SELECT receipt_id FROM gpt_payme_fiscal WHERE kind='CANCEL'"), null);
  // A repeat replaces the report; a failed print is kept with its code.
  await fiscal("PERFORM", { status_code: 5, message: "Ошибка" });
  assert.equal(f.db.value("SELECT status_code FROM gpt_payme_fiscal WHERE kind='PERFORM'"), 5);
  // Errors: an unknown receipt -32001, bad params -32602 naming the parameter.
  assert.equal(code(await f.call("SetFiscalData", { id: txId(), type: "PERFORM", fiscal_data: { status_code: 0 } })), -32001);
  for (const [params, name] of [
    [{ type: "PERFORM", fiscal_data: { status_code: 0 } }, "id"],
    [{ id: tx, type: "REFUND", fiscal_data: { status_code: 0 } }, "type"],
    [{ id: tx, type: "PERFORM" }, "fiscal_data"],
    [{ id: tx, type: "PERFORM", fiscal_data: { status_code: "0" } }, "fiscal_data.status_code"],
  ] as Array<[Record<string, unknown>, string]>) {
    const answer = await f.call("SetFiscalData", params);
    assert.deepEqual([answer.error?.code, answer.error?.data, answer.error?.message], [-32602, name, `Invalid params: ${name}`]);
  }
  // Our own receipt queue never got a row for this order.
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts WHERE order_id=? AND provider<>'payme'", o.id), 0);
  await f.settle();
});

test("a live Payme payment and its refund reach the owner like Click's; the test ones never do", async () => {
  const f = await setup({
    GPT_BILLING_MODE_PAYME: "live",
    GPT_PAYME_KEY: randomBytes(18).toString("hex"),
    GPT_NOTIFY_BOT_TOKEN: `123:${randomBytes(16).toString("hex")}`,
    GPT_NOTIFY_CHAT_ID: "424242",
  });
  const sent: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.telegram.org/")) {
      sent.push(String(JSON.parse(String(init?.body ?? "{}")).text ?? ""));
      return Response.json({ ok: true, result: { message_id: sent.length } });
    }
    return Response.json({ ok: false }, { status: 503 });
  }) as typeof fetch;
  try {
    const liveCall = async (method: string, params: Record<string, unknown>) =>
      (await f.send({ id: 1, method, params }, { authorization: f.auth(f.env.GPT_PAYME_KEY) })).body;
    const o = await f.order(f.user, "live");
    const tx = txId();
    assert.deepEqual((await liveCall("CheckPerformTransaction", { amount: PRICE_TIYIN, account: { order_id: o.id } })).result, { allow: true, detail: DETAIL });
    await liveCall("CreateTransaction", { id: tx, time: Date.now(), amount: PRICE_TIYIN, account: { order_id: o.id } });
    assert.equal((await liveCall("PerformTransaction", { id: tx })).result?.state, 2);
    assert.ok(await f.store.access(f.user, "live"));
    // A live pack is a subscription row too; our receipt queue still holds nothing.
    assert.equal(f.db.value("SELECT status FROM gpt_subscriptions WHERE id=?", o.id), "active");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts WHERE order_id=?", o.id), 0);
    assert.equal((await liveCall("CancelTransaction", { id: tx, reason: 5 })).result?.state, -2);
    assert.equal(await f.store.access(f.user, "live"), null);
    assert.equal(f.db.value("SELECT status FROM gpt_subscriptions WHERE id=?", o.id), "cancelled");
    await f.settle();
    await maintainBilling(f.env);
    assert.deepEqual(
      f.db.rows<{ event: string; delivered: number }>("SELECT event, delivered_at IS NOT NULL AS delivered FROM gpt_billing_outbox WHERE order_id=? ORDER BY created_at,rowid", o.id).map((r) => ({ ...r })),
      [{ event: "paid", delivered: 1 }, { event: "refunded", delivered: 1 }],
    );
    assert.ok(sent.some((text) => text.includes("AI paket: paid\npayme · 20 000 UZS")), JSON.stringify(sent));
    assert.ok(sent.some((text) => text.includes("AI paket: refunded\npayme · 20 000 UZS")), JSON.stringify(sent));
    for (const text of sent) assert.ok(!text.includes(tx), "Payme's transaction id is not in the notice");
    // A test order of the sandbox never reaches the owner's chat.
    const before = sent.length;
    f.env.GPT_BILLING_MODE_PAYME = "test";
    f.env.GPT_BILLING_MODE_CLICK = "live";
    const t = await f.order();
    const ttx = txId();
    await f.call("CreateTransaction", { id: ttx, time: Date.now(), amount: PRICE_TIYIN, account: { order_id: t.id } });
    await f.call("PerformTransaction", { id: ttx });
    await f.call("CancelTransaction", { id: ttx, reason: 5 });
    await f.settle();
    await maintainBilling(f.env);
    assert.equal(sent.length, before);
  } finally {
    globalThis.fetch = original;
  }
});

test("the checkout page: base64 of Payme's GET parameters, the sandbox in test, checkout.paycom.uz live", () => {
  const env = { GPT_PAYME_MERCHANT_ID: "587f72c72cac0d162c722ae2" } as BillingEnv;
  const order = `pay_${"0123456789abcdef".repeat(2)}`;
  const test = paymeCheckoutUrl(env, "test", order, "ru", "https://gptbot.uz/ru/gpt-chat/?pay=return")!;
  // PAYME-REQUIREMENTS section 4, the docs' sample cash desk and a fake order.
  assert.equal(
    test,
    "https://test.paycom.uz/bT01ODdmNzJjNzJjYWMwZDE2MmM3MjJhZTI7YWMub3JkZXJfaWQ9cGF5XzAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmO2E9MjAwMDAwMDtjPWh0dHBzOi8vZ3B0Ym90LnV6L3J1L2dwdC1jaGF0Lz9wYXk9cmV0dXJuO2w9cnU7Y3Q9MTUwMDA=",
  );
  // The docs' own example decodes the same way.
  assert.equal(atob("bT01ODdmNzJjNzJjYWMwZDE2MmM3MjJhZTI7YWMub3JkZXJfaWQ9MTk3O2E9NTAw"), "m=587f72c72cac0d162c722ae2;ac.order_id=197;a=500");
  const live = new URL(paymeCheckoutUrl(env, "live", order, "uz", "https://gptbot.uz/uz/gpt-uzbek-tilida/?pay=return")!);
  assert.equal(live.origin, PAYME_CHECKOUT_BASE.live);
  assert.equal(
    atob(live.pathname.slice(1)),
    `m=587f72c72cac0d162c722ae2;ac.order_id=${order};a=2000000;c=https://gptbot.uz/uz/gpt-uzbek-tilida/?pay=return;l=uz;ct=15000`,
  );
  // No page without a cash desk id of Payme's format, or with a value that
  // would break the key=value;… format.
  for (const merchant of [undefined, "", "1", "587f72c72cac0d162c722ae", "587f72c72cac0d162c722ae2;a=1"])
    assert.equal(paymeCheckoutUrl({ GPT_PAYME_MERCHANT_ID: merchant } as BillingEnv, "test", order, "ru", "https://gptbot.uz/"), null, String(merchant));
  assert.equal(paymeCheckoutUrl(env, "test", `${order};a=1`, "ru", "https://gptbot.uz/"), null);
  assert.equal(paymeCheckoutUrl(env, "test", order, "ru", "https://gptbot.uz/;a=1"), null);
  // The browser goes only to Payme's own hosts.
  assert.equal(allowedCheckoutUrl(test), test);
  assert.equal(allowedCheckoutUrl(live.href), live.href);
  for (const bad of ["http://test.paycom.uz/x", "https://test.paycom.uz.evil.example/x", "https://user:pw@test.paycom.uz/x", "https://paycom.uz.test/x", "https://evil.example/test.paycom.uz"])
    assert.equal(allowedCheckoutUrl(bad), null, bad);
});

test("subscribe: Payme in a rehearsal session sends a signed-in payer to the sandbox; a held order is followed, not reopened", async () => {
  const f = await setup();
  const buy = (cookie: string, locale: "ru" | "uz", requestId = randomUUID()) =>
    subscribe(f.ctx(new Request("https://gptbot.uz/api/gpt/subscribe", {
      method: "POST",
      headers: { cookie, Origin: "https://gptbot.uz", "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "payme", requestId, locale, acceptTerms: true, termsVersion: f.env.GPT_BILLING_TERMS_VERSION }),
    })));
  // Outside a rehearsal session Payme does not exist (decision L7).
  assert.equal((await buy(f.cookie, "uz")).status, 404);
  // A rehearsal without an account: sign in first (Payme is never a guest's).
  const rehearsal = `${REHEARSAL_COOKIE}=${(await mintRehearsal(f.env))!.token}`;
  assert.equal((await buy(rehearsal, "uz")).status, 401);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders"), 0);
  const requestId = randomUUID();
  const opened = (await (await buy(f.testCookie, "uz", requestId)).json()) as { mode: string; checkoutUrl: string; attemptId: string };
  assert.equal(opened.mode, "checkout");
  const page = new URL(opened.checkoutUrl);
  assert.equal(page.origin, "https://test.paycom.uz");
  assert.equal(
    atob(page.pathname.slice(1)),
    `m=${f.env.GPT_PAYME_MERCHANT_ID};ac.order_id=${opened.attemptId};a=2000000;c=https://gptbot.uz/uz/gpt-uzbek-tilida/?pay=return;l=uz;ct=15000`,
  );
  assert.equal(allowedCheckoutUrl(opened.checkoutUrl), opened.checkoutUrl);
  // The order the page names is the one Payme's sandbox then checks and pays.
  assert.equal((await f.call("CheckPerformTransaction", { amount: PRICE_TIYIN, account: { order_id: opened.attemptId } })).result?.allow, true);
  // Back before Payme took it: the same order, the same page.
  assert.equal(((await (await buy(f.testCookie, "uz", requestId)).json()) as { checkoutUrl: string }).checkoutUrl, opened.checkoutUrl);
  // Payme holds a transaction for it: the visitor follows its status instead
  // of a second page Payme would refuse (-31008).
  await f.call("CreateTransaction", { id: txId(), time: Date.now(), amount: PRICE_TIYIN, account: { order_id: opened.attemptId } });
  const held = (await (await buy(f.testCookie, "uz", requestId)).json()) as { mode: string; attemptId: string; checkoutUrl?: string };
  assert.deepEqual([held.mode, held.attemptId, held.checkoutUrl], ["status", opened.attemptId, undefined]);
  await f.settle();
});

test("Payme's error messages: every code in Russian, Uzbek (o‘ with U+2018) and English", async () => {
  const f = await setup();
  const o = await f.order();
  const answers = [
    await f.call("CheckPerformTransaction", { amount: 1, account: { order_id: o.id } }),
    await f.call("CheckPerformTransaction", { amount: PRICE_TIYIN, account: { order_id: "pay_none" } }),
    await f.call("PerformTransaction", { id: txId() }),
    await f.call("Nope", {}),
    (await f.send({ id: 1, method: "CheckTransaction", params: {} }, { authorization: null })).body,
  ];
  for (const answer of answers) {
    const message = answer.error?.message as Record<string, string>;
    assert.deepEqual(Object.keys(message).sort(), ["en", "ru", "uz"], JSON.stringify(answer));
    assert.match(message.ru, /[а-яё]/i);
    assert.doesNotMatch(message.uz, /['`’]/, message.uz);
  }
  await f.settle();
});

test("Payme orders live in the shared ledger table and the org boundary holds", async () => {
  const f = await setup();
  const o = await f.order();
  const tx = txId();
  await f.call("CreateTransaction", { id: tx, time: Date.now(), amount: PRICE_TIYIN, account: { order_id: o.id } });
  // Another org sees neither the order nor the transaction (AGENTS §3).
  const { BillingStore } = await import("../functions/lib/gpt-chat/billing-store");
  const other = new BillingStore(f.binding, "other-org");
  assert.equal(await other.order(o.id), null);
  assert.equal(await other.external("payme", "test", tx), null);
  assert.equal(f.db.value("SELECT org_id FROM gpt_payment_orders WHERE id=?", o.id), BILLING_ORG);
  await f.settle();
});

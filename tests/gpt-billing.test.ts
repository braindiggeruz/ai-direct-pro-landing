import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import {
  BILLING_ORG,
  addCalendarMonth,
} from "../functions/lib/gpt-chat/billing-config";
import {
  BillingStore,
  PendingElsewhereError,
  type AccessPeriod,
} from "../functions/lib/gpt-chat/billing-store";
import { ACCOUNT_FREE_ID, TurnStore } from "../functions/lib/gpt-chat/turn-store";
import { resolveConfig } from "../functions/lib/gpt-chat/config";
import {
  md5,
  parseClickAmount,
} from "../functions/lib/gpt-chat/payment-protocol";
import { onRequestPost as payme } from "../functions/api/payments/payme";
import { onRequestPost as click } from "../functions/api/payments/click";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { onRequestGet as account, onRequestPost as accountAction } from "../functions/api/gpt/account";
import { renderMarkdown } from "../src/gpt-chat/markdown";
import { strings } from "../src/gpt-chat/i18n";
import { accountStrings } from "../src/gpt-chat/account-strings";
import { BILLING_DDL, UZUM_BILLING_DDL } from "../functions/lib/gpt-chat/billing-schema";

/**
 * The account's free answers of the day, spent just now (as a pack holder's,
 * ACCOUNT_FREE_ID): its next answers come from a pack (decision R2).
 */
function spendFreeDay(f: Awaited<ReturnType<typeof billingFixture>>, cfg: { freeDailyLimit: number }, now = Date.now()) {
  for (let i = 0; i < cfg.freeDailyLimit; i++)
    f.db
      .prepare(
        "INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at) VALUES(?,?,?,?,NULL,'done',?,?)",
      )
      .bind(BILLING_ORG, ACCOUNT_FREE_ID + crypto.randomUUID(), f.user, "ip", now, now + 120_000)
      .runSync();
}

test("Click MD5 matches independent Node reference, exact amount parser", () => {
  for (const text of [
    "",
    "abc",
    "я люблю o‘zbekcha",
    randomBytes(300).toString("hex"),
  ])
    assert.equal(md5(text), createHash("md5").update(text).digest("hex"));
  assert.equal(parseClickAmount("20000.00"), 2000000);
  assert.equal(parseClickAmount("20000"), 2000000);
  for (const bad of ["2e4", "20000.001", "-20000", "20000,00", "Infinity"])
    assert.equal(parseClickAmount(bad), null);
});
test("inert providers are a missing route before the body or D1; configured ones authenticate first", async () => {
  const bomb = {
    prepare() {
      throw new Error("DB touched");
    },
    batch() {
      throw new Error("DB touched");
    },
  };
  let bodyRead = false;
  const invoke = (
    handler: typeof payme,
    env: Record<string, unknown>,
    body: string,
    headers: Record<string, string>,
  ) =>
    handler({
      request: new Request("https://gpt.test", {
        method: "POST",
        headers,
        // highWaterMark 0: the stream is pulled only when the handler reads it.
        body: new ReadableStream(
          {
            pull(controller) {
              bodyRead = true;
              controller.enqueue(new TextEncoder().encode(body));
              controller.close();
            },
          },
          { highWaterMark: 0 },
        ),
        duplex: "half",
      } as RequestInit),
      env: { GPTBOT_DRAFTS_DB: bomb, ...env },
      waitUntil() {},
    } as unknown as Parameters<typeof payme>[0]);
  const form = { "Content-Type": "application/x-www-form-urlencoded" };
  const clickTest = {
    GPT_CLICK_TEST_SECRET: randomBytes(32).toString("hex"),
    GPT_CLICK_TEST_SERVICE_ID: "12345",
  };
  const paymeTest = { GPT_PAYME_TEST_KEY: randomBytes(32).toString("hex") };
  // Off, not allowed, switched off alone, or without the mode's credentials.
  for (const [handler, env] of [
    [click, {}],
    [click, { GPT_BILLING_MODE: "live", ...clickTest }],
    [click, { GPT_BILLING_MODE: "test", GPT_CLICK_TEST_SECRET: clickTest.GPT_CLICK_TEST_SECRET }],
    [click, { GPT_BILLING_MODE: "test", GPT_BILLING_MODE_CLICK: "off", ...clickTest }],
    [click, { GPT_BILLING_MODE: "test", GPT_PAYMENT_PROVIDERS: "uzum", ...clickTest }],
    [click, { GPT_BILLING_MODE: "test", GPT_CLICK_CREDENTIALS_JSON: "{broken", ...clickTest }],
    // Payme is off by default (decision L17), whatever its key says.
    [payme, { GPT_BILLING_MODE: "test", ...paymeTest }],
    [payme, { GPT_BILLING_MODE: "test", GPT_PAYMENT_PROVIDERS: "click,payme" }],
  ] as Array<[typeof payme, Record<string, unknown>]>) {
    const response = await invoke(handler, env, "action=0", form);
    assert.equal(response.status, 404, JSON.stringify(Object.keys(env)));
    assert.equal(bodyRead, false);
  }
  // Configured: the protocol answers, still before any D1 access.
  assert.equal(
    (
      await (
        await invoke(payme, { GPT_BILLING_MODE: "test", GPT_PAYMENT_PROVIDERS: "click,payme", ...paymeTest }, "{}", {
          "Content-Type": "application/json",
        })
      ).json()
    ).error.code,
    -32504,
  );
  assert.equal(
    (await (await invoke(click, { GPT_BILLING_MODE: "test", ...clickTest }, "action=0", form)).json()).error,
    -8,
  );
  assert.equal(bodyRead, true, "the probe sees a body that is read");
  // Click's own mode wins over the global one; the credentials secret wins
  // over the legacy variables.
  const fromJson = {
    GPT_BILLING_MODE_CLICK: "test",
    GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ test: { service_id: 777, secret_key: randomBytes(16).toString("hex") } }),
  };
  assert.equal((await (await invoke(click, fromJson, "action=0", form)).json()).error, -8);
});

test("Payme wrong amount, idempotent Create/Perform, statement and refund", async () => {
  const f = await billingFixture();
  const o = await f.store.createOrder(
    f.user,
    "payme",
    "test",
    crypto.randomUUID(),
  );
  const tx = crypto.randomUUID(),
    params = {
      id: tx,
      time: Date.now(),
      amount: 2000000,
      account: { order_id: o.id },
    };
  assert.equal(
    (await f.rpc("CreateTransaction", { ...params, amount: 20000 })).error.code,
    -31001,
  );
  const created = await f.rpc("CreateTransaction", params);
  assert.equal(created.result.state, 1);
  assert.deepEqual(
    (await f.rpc("CreateTransaction", params)).result,
    created.result,
  );
  const results = await Promise.all(
    Array.from({ length: 8 }, () => f.rpc("PerformTransaction", { id: tx })),
  );
  for (const result of results)
    assert.deepEqual(result.result, results[0].result);
  assert.equal(results[0].result.state, 2);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 1);
  assert.equal(
    f.db.value(
      "SELECT COUNT(*) FROM gpt_payment_journal WHERE to_state='paid'",
    ),
    1,
  );
  assert.equal(
    (await f.rpc("GetStatement", { from: params.time, to: params.time })).result
      .transactions.length,
    1,
  );
  assert.ok(await f.store.access(f.user, "test"));
  // Payme cancelling a performed transaction is the money going back: the pack closes.
  const cancelled = await f.rpc("CancelTransaction", { id: tx, reason: 1 });
  assert.equal(cancelled.result.state, -2);
  assert.deepEqual(
    (await f.rpc("CancelTransaction", { id: tx, reason: 1 })).result,
    cancelled.result,
  );
  assert.equal(await f.store.access(f.user, "test"), null);
  assert.equal(
    (await f.rpc("PerformTransaction", { id: tx })).error.code,
    -31008,
  );
});
test("Payme rejects external ID reuse, other org/order, expires prepared transaction", async () => {
  const f = await billingFixture();
  const a = await f.store.createOrder(
    f.user,
    "payme",
    "test",
    crypto.randomUUID(),
  );
  const b = await f.store.createOrder(
    "other-user",
    "payme",
    "test",
    crypto.randomUUID(),
  );
  const tx = crypto.randomUUID();
  const p = {
    id: tx,
    time: Date.now(),
    amount: 2000000,
    account: { order_id: a.id },
  };
  await f.rpc("CreateTransaction", p);
  assert.equal(
    (await f.rpc("CreateTransaction", { ...p, account: { order_id: b.id } }))
      .error.code,
    -31008,
  );
  assert.equal(
    await new BillingStore(f.binding, "other-org").order(a.id),
    null,
  );
  await f.binding
    .prepare("UPDATE gpt_payment_orders SET provider_time=? WHERE id=?")
    .bind(Date.now() - 43200001, a.id)
    .run();
  assert.equal(
    (await f.rpc("PerformTransaction", { id: tx })).error.code,
    -31008,
  );
  assert.equal((await f.rpc("CheckTransaction", { id: tx })).result.state, -1);
});
test("a repeat purchase starts at once, side by side; turns draw from the pack that ends first", async () => {
  const f = await billingFixture();
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  const day = 86400_000;
  const t0 = Date.now() - 10 * day;
  const t1 = Date.now() - 1000;
  const pay = async (provider: "click" | "payme", now: number) => {
    const order = await f.store.createOrder(f.user, provider, "test", crypto.randomUUID(), now);
    await f.store.transition(order.id, "prepared", "prepare", { externalId: crypto.randomUUID(), now });
    return f.store.transition(order.id, "paid", "perform", { now });
  };
  const first = await pay("click", t0);
  const second = await pay("payme", t1);
  const period = (order: string) => ({
    ...f.db.rows<{ starts_at: number; ends_at: number }>(
      "SELECT starts_at,ends_at FROM gpt_access_periods WHERE order_id=?",
      order,
    )[0],
  });
  // Each pack is one calendar month from its own payment: no queue.
  assert.deepEqual(period(first.id), { starts_at: t0, ends_at: addCalendarMonth(t0) });
  assert.deepEqual(period(second.id), { starts_at: t1, ends_at: addCalendarMonth(t1) });
  assert.equal((await f.store.access(f.user, "test"))?.order_id, first.id);
  // The first pack spent: the second one carries on at once. (The free day
  // is spent first: a holder's turns are free answers before the pack's.)
  spendFreeDay(f, cfg);
  await f.binding
    .prepare("UPDATE gpt_access_periods SET message_limit=1 WHERE order_id=?")
    .bind(first.id)
    .run();
  const turn = await turns.reserve(f.user, "ip", (await f.store.access(f.user, "test"))!, cfg);
  await turns.finish(turn.id!, { outcome: "answered", charged: true });
  assert.equal((await f.store.access(f.user, "test"))?.order_id, second.id);
});

test("the panel asks to renew only when the last running pack ends soon", async () => {
  const f = await billingFixture();
  const day = 86400_000;
  const pay = async (provider: "click" | "payme") => {
    const order = await f.store.createOrder(f.user, provider, "test", crypto.randomUUID());
    await f.store.transition(order.id, "prepared", "prepare", { externalId: crypto.randomUUID() });
    return f.store.transition(order.id, "paid", "perform");
  };
  // The rehearsal session sees the test packs.
  const view = async () =>
    ((await (await account(f.ctx(new Request("https://gpt.test/api/gpt/account", { headers: { cookie: f.testCookie } })))).json()) as {
      access: { order_id: string; renewSoon: boolean; paidThrough: number } | null;
    }).access;
  const first = await pay("click");
  await f.binding
    .prepare("UPDATE gpt_access_periods SET ends_at=? WHERE order_id=?")
    .bind(Date.now() + 2 * day, first.id)
    .run();
  assert.deepEqual(await view().then((a) => [a?.order_id, a?.renewSoon]), [first.id, true]);
  // Renewed early: turns still draw from the first pack, and nothing asks to pay again.
  const second = await pay("payme");
  assert.equal((await view())?.paidThrough, addCalendarMonth(second.perform_time));
  assert.deepEqual(await view().then((a) => [a?.order_id, a?.renewSoon]), [first.id, false]);
  // A revoked later pack does not count.
  await f.binding
    .prepare("UPDATE gpt_access_periods SET revoked_at=? WHERE order_id=?")
    .bind(Date.now(), second.id)
    .run();
  assert.deepEqual(await view().then((a) => [a?.order_id, a?.renewSoon]), [first.id, true]);
});

test("the Paketim panel: what is left in the pack, what its day cap still lets through today, and the free answers that come first (WP-17, R2)", async () => {
  const f = await billingFixture();
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  // A free answer earlier today, before the pack: the account's free day
  // counts it; the pack's day counts only the pack's own answers.
  const free = await turns.reserve(f.user, "ip", null, cfg);
  await turns.finish(free.id!, { outcome: "answered", charged: true });
  const order = await f.store.createOrder(f.user, "click", "test", crypto.randomUUID());
  await f.store.transition(order.id, "prepared", "prepare", { externalId: crypto.randomUUID() });
  await f.store.transition(order.id, "paid", "perform");
  const view = async () => {
    const body = (await (await account(f.ctx(new Request("https://gpt.test/api/gpt/account", { headers: { cookie: f.testCookie } })))).json()) as {
      remaining: number;
      access: { remaining: number; dayRemaining: number; message_limit: number; freeRemaining: number; freeHourRemaining: number };
    };
    const { access } = body;
    assert.equal(body.remaining, access.remaining, "the chat's count is the pack's");
    return [access.remaining, access.dayRemaining, access.message_limit, access.freeRemaining, access.freeHourRemaining];
  };
  const turn = async (outcome: "answered" | "truncated" = "answered") => {
    const reserved = await turns.reserve(f.user, "ip", (await f.store.access(f.user, "test"))!, cfg);
    if (!reserved.id) return reserved.limit.reason;
    await turns.finish(reserved.id, { outcome, charged: outcome === "answered" });
    return reserved.bucket;
  };
  assert.deepEqual(await view(), [300, 50, 300, 14, 4]);
  // Free answers first (decision R2): the rest of the free hour leaves the pack whole.
  for (let i = 0; i < 4; i++) assert.equal(await turn(), "free");
  assert.deepEqual(await view(), [300, 50, 300, 10, 0]);
  for (let i = 0; i < 3; i++) assert.equal(await turn(), "pack");
  // A released answer (cut at the length limit, a provider error) gives its place back.
  assert.equal(await turn("truncated"), "pack");
  assert.deepEqual(await view(), [297, 47, 300, 10, 0]);
  // Near the end of the pack, today's room is never more than what is left in it.
  await f.binding.prepare("UPDATE gpt_access_periods SET message_limit=5 WHERE order_id=?").bind(order.id).run();
  assert.deepEqual((await view()).slice(0, 3), [2, 2, 5]);
  // The same numbers reserve() goes by: with the free hour spent, the pack's
  // day cap refuses its 51st answer of the day.
  await f.binding.prepare("UPDATE gpt_access_periods SET message_limit=300 WHERE order_id=?").bind(order.id).run();
  for (let i = 0; i < 47; i++) assert.equal(await turn(), "pack");
  assert.deepEqual(await view(), [250, 0, 300, 10, 0]);
  const period = (await f.store.access(f.user, "test"))!;
  assert.equal((await turns.reserve(f.user, "ip", period, cfg)).limit?.reason, "pack_daily");
});

/** `n` answers of pack `order` already given (status done), as TurnStore writes them. */
function spend(f: Awaited<ReturnType<typeof billingFixture>>, order: string, n: number, at = Date.now() - 2 * 86400_000) {
  for (let i = 0; i < n; i++)
    f.db
      .prepare(
        "INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at) VALUES(?,?,?,?,?,'done',?,?)",
      )
      .bind(BILLING_ORG, crypto.randomUUID(), f.user, "ip", order, at + i, at + i + 120_000)
      .runSync();
}

test("two packs side by side: the panel and the chat count every running pack, paid through the latest end (WP-24)", async () => {
  const f = await billingFixture();
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  const day = 86400_000;
  const pay = async (provider: "click" | "payme", now: number) => {
    const order = await f.store.createOrder(f.user, provider, "test", crypto.randomUUID(), now);
    await f.store.transition(order.id, "prepared", "prepare", { externalId: crypto.randomUUID(), now });
    return f.store.transition(order.id, "paid", "perform", { now });
  };
  const first = await pay("click", Date.now() - 10 * day);
  const second = await pay("payme", Date.now() - 1000);
  spend(f, first.id, 180);
  const view = async () =>
    (await (await account(f.ctx(new Request("https://gpt.test/api/gpt/account", { headers: { cookie: f.testCookie } })))).json()) as {
      remaining: number;
      access: { order_id: string; ends_at: number; remaining: number; dayRemaining: number; packs: number; totalLimit: number; paidThrough: number; firstRemaining: number; message_limit: number };
    };
  const both = await view();
  assert.deepEqual(both.access, {
    ...both.access,
    order_id: first.id,
    ends_at: addCalendarMonth(first.perform_time),
    message_limit: 300,
    remaining: 420,
    dayRemaining: 50,
    packs: 2,
    totalLimit: 600,
    paidThrough: addCalendarMonth(second.perform_time),
    firstRemaining: 120,
  });
  assert.equal(both.remaining, 420);
  // The chat's own count after a turn is the same total (TurnStore.allowance).
  const period = (await f.store.access(f.user, "test"))!;
  assert.equal(period.order_id, first.id);
  // A pack answer: the free day is spent (free answers come first, R2).
  spendFreeDay(f, cfg);
  const turn = await turns.reserve(f.user, "ip", period, cfg);
  if (!turn.id) throw new Error("the turn was refused");
  assert.deepEqual([turn.bucket, turn.remaining], ["pack", 419]);
  await turns.finish(turn.id, { outcome: "answered", charged: true });
  assert.deepEqual((await turns.allowance(f.user, "ip", period, cfg)), {
    remaining: 419,
    hourRemaining: null,
    dayRemaining: 49,
    freeRemaining: 0,
    freeHourRemaining: 0,
  });
  // The first pack spent: one pack left, its own numbers again.
  spend(f, first.id, 119);
  const one = await view();
  assert.deepEqual(
    [one.access.order_id, one.access.remaining, one.access.packs, one.access.totalLimit, one.access.firstRemaining],
    [second.id, 300, 1, 300, 300],
  );
  // Another org sees none of it.
  assert.deepEqual(await new BillingStore(f.binding, "other-org").usablePacks(f.user, "test"), []);
});

test("a paid pack is not refundable (WP-25): no refund request, the pack keeps working; only the Seller's refund closes it", async () => {
  const f = await billingFixture();
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  const order = await f.store.createOrder(f.user, "click", "test", crypto.randomUUID());
  await f.store.transition(order.id, "prepared", "prepare", { externalId: crypto.randomUUID() });
  await f.store.transition(order.id, "paid", "perform");
  spend(f, order.id, 100);
  const post = (body: unknown) =>
    accountAction(
      f.ctx(
        new Request("https://gpt.test/api/gpt/account", {
          method: "POST",
          headers: { Origin: "https://gpt.test", "Content-Type": "application/json", cookie: f.testCookie },
          body: JSON.stringify(body),
        }),
      ),
    );
  // The buyer has no way to ask: the account's one action is closing an unseen invoice.
  const asked = await post({ action: "refund_request", orderId: order.id });
  assert.deepEqual([asked.status, ((await asked.json()) as { code: string }).code], [400, "bad_request"]);
  assert.equal("requestRefund" in f.store, false);
  assert.equal("refundable" in f.store, false);
  // Nothing changed: the pack answers on, and no buyer row reached the journal or the owner.
  const period = (await f.store.access(f.user, "test"))!;
  assert.equal(period.order_id, order.id);
  assert.deepEqual(Object.keys(period).sort(), ["ends_at", "message_limit", "order_id", "starts_at"]);
  spendFreeDay(f, cfg);
  const turn = await turns.reserve(f.user, "ip", period, cfg);
  assert.ok(turn.id);
  assert.deepEqual([turn.bucket, turn.remaining], ["pack", 199]);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_journal WHERE order_id=? AND actor='user'", order.id), 0);
  assert.deepEqual(f.db.rows<{ event: string }>("SELECT event FROM gpt_billing_outbox WHERE order_id=?", order.id).map((row) => row.event), ["paid"]);
  // The account view offers no refund: no list of refundable packs, no refund days.
  const view = (await (await account(f.ctx(new Request("https://gpt.test/api/gpt/account", { headers: { cookie: f.testCookie } })))).json()) as Record<string, unknown> & {
    pack: Record<string, unknown>;
    access: Record<string, unknown>;
  };
  assert.equal("refundable" in view, false);
  assert.equal("refundDays" in view.pack, false);
  assert.equal("refund_requested_at" in view.access, false);
  // Money taken by mistake (the offer's exception): the Seller returns it and records it
  // (internal/gpt-click-refund-record), and only that closes the pack.
  await f.store.transition(order.id, "cancelled", "owner_refund_record:click-ref-1", { reason: 5 });
  assert.equal((await f.store.order(order.id))!.state, "refunded");
  assert.equal(await f.store.access(f.user, "test"), null);
  assert.equal((await turns.reserve(f.user, "ip", period, cfg)).limit?.reason, "monthly");
  await Promise.all(f.background);
});

test("the account closes its own invoice no provider has seen, never one a provider holds (U7, WP-24)", async () => {
  const f = await billingFixture();
  const post = (body: unknown, cookie = f.testCookie, origin = "https://gpt.test") =>
    accountAction(
      f.ctx(
        new Request("https://gpt.test/api/gpt/account", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json", cookie },
          body: JSON.stringify(body),
        }),
      ),
    );
  const view = async () =>
    ((await (await account(f.ctx(new Request("https://gpt.test/api/gpt/account", { headers: { cookie: f.testCookie } })))).json()) as {
      payment: { id: string; state: string; cancellable: boolean };
    }).payment;
  const click = await f.store.createOrder(f.user, "click", "test", crypto.randomUUID());
  // Click never saw it (no Prepare): the window may close it.
  assert.deepEqual(await view(), { ...(await view()), id: click.id, state: "pending", cancellable: true });
  assert.equal((await post({ action: "cancel_invoice", orderId: click.id }, f.testCookie, "https://evil.example")).status, 403);
  // A visitor outside the rehearsal does not see test orders; another account none.
  assert.equal((await post({ action: "cancel_invoice", orderId: click.id }, f.cookie)).status, 404);
  assert.equal(await f.store.cancelInvoice("acct_other", "test", click.id), "not_found");
  assert.equal(await new BillingStore(f.binding, "other-org").cancelInvoice(f.user, "test", click.id), "not_found");
  const closed = await post({ action: "cancel_invoice", orderId: click.id });
  assert.equal(closed.status, 200);
  assert.deepEqual(await view(), { ...(await view()), id: click.id, state: "cancelled", cancellable: false });
  assert.deepEqual(
    { ...f.db.rows<Record<string, unknown>>("SELECT actor,method,from_state,to_state FROM gpt_payment_journal WHERE order_id=? AND to_state='cancelled'", click.id)[0] },
    { actor: "user", method: "invoice_cancelled", from_state: "pending", to_state: "cancelled" },
  );
  // A repeat is the same answer; now another provider may be paid at once.
  assert.equal((await post({ action: "cancel_invoice", orderId: click.id })).status, 200);
  const payme = await f.store.createOrder(f.user, "payme", "test", crypto.randomUUID());
  // Payme took it up (CreateTransaction -> prepared): it stays.
  await f.store.transition(payme.id, "prepared", "CreateTransaction", { externalId: crypto.randomUUID() });
  assert.equal((await view()).cancellable, false);
  const held = await post({ action: "cancel_invoice", orderId: payme.id });
  assert.deepEqual([held.status, ((await held.json()) as { code: string }).code], [409, "invoice_in_progress"]);
  assert.equal((await f.store.order(payme.id))!.state, "prepared");
  // A registration landing between the read and the write wins as well.
  await f.store.transition(payme.id, "cancelled", "invoice_expired");
  const raced = await f.store.createOrder(f.user, "click", "test", crypto.randomUUID());
  f.db.prepare("UPDATE gpt_payment_orders SET external_id=? WHERE id=?").bind("ext-1", raced.id).runSync();
  await assert.rejects(
    f.store.transition(raced.id, "cancelled", "invoice_cancelled", { from: ["pending"], unseen: true }),
    /state/,
  );
  assert.equal(await f.store.cancelInvoice(f.user, "test", raced.id), "in_progress");
  assert.equal((await f.store.order(raced.id))!.state, "pending");
  await Promise.all(f.background);
});

test("one open invoice per account across providers (U7); a synthetic rehearsal account never buys live", async () => {
  const f = await billingFixture();
  const now = Date.now();
  const click = await f.store.createOrder(f.user, "click", "test", crypto.randomUUID(), now);
  // The same provider resumes its open invoice; another one is refused.
  assert.equal((await f.store.createOrder(f.user, "click", "test", crypto.randomUUID(), now)).id, click.id);
  await assert.rejects(
    f.store.createOrder(f.user, "payme", "test", crypto.randomUUID(), now),
    (error: unknown) =>
      error instanceof PendingElsewhereError && error.orderId === click.id && error.provider === "click",
  );
  // Live and test ledgers, other accounts and other orgs are separate.
  assert.ok(await f.store.createOrder(f.user, "payme", "live", crypto.randomUUID(), now));
  assert.ok(await f.store.createOrder("acct_other", "payme", "test", crypto.randomUUID(), now));
  assert.ok(await new BillingStore(f.binding, "other-org").createOrder(f.user, "payme", "test", crypto.randomUUID(), now));
  // An expired invoice no longer blocks.
  const later = click.expires_at + 1;
  const payme = await f.store.createOrder(f.user, "payme", "test", crypto.randomUUID(), later);
  assert.equal(payme.provider, "payme");
  assert.equal(
    f.db.value("SELECT COUNT(*) FROM gpt_payment_orders WHERE org_id=? AND user_id=? AND mode='test'", BILLING_ORG, f.user),
    2,
  );
  // Two tabs opening two providers at once: the INSERT itself re-checks, one wins.
  const raced = await Promise.allSettled(
    (["click", "payme"] as const).map((provider) =>
      f.store.createOrder("acct_race", provider, "test", crypto.randomUUID(), now),
    ),
  );
  assert.deepEqual(raced.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  assert.ok(raced.some((r) => r.status === "rejected" && r.reason instanceof PendingElsewhereError));
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders WHERE user_id='acct_race'"), 1);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_journal WHERE order_id NOT IN (SELECT id FROM gpt_payment_orders_all)"), 0);
  await assert.rejects(
    f.store.createOrder("acct_rh_0123456789abcdef0123456789abcdef", "click", "live", crypto.randomUUID()),
    /rehearsal_live/,
  );
  assert.ok(await f.store.createOrder("acct_rh_0123456789abcdef0123456789abcdef", "click", "test", crypto.randomUUID()));
});

test("Click Prepare/Complete, repeat -4, cancellation -9 and amount tampering", async () => {
  const f = await billingFixture();
  const o = await f.store.createOrder(
    f.user,
    "click",
    "test",
    crypto.randomUUID(),
  );
  const tx = String(randomBytes(4).readUInt32BE(0));
  assert.equal(
    (await f.clickCall(o.id, "0", { amount: "19999.99" })).error,
    -2,
  );
  const prepared = await f.clickCall(o.id, "0", { click_trans_id: tx });
  assert.equal(prepared.error, 0);
  assert.equal(
    (
      await f.clickCall(o.id, "1", {
        click_trans_id: tx,
        merchant_prepare_id: String(o.seq + 1),
      })
    ).error,
    -6,
  );
  const calls = await Promise.all(
    Array.from({ length: 5 }, () =>
      f.clickCall(o.id, "1", {
        click_trans_id: tx,
        merchant_prepare_id: String(o.seq),
      }),
    ),
  );
  assert.ok(calls.every((r) => r.error === 0 || r.error === -4));
  assert.equal(
    (
      await f.clickCall(o.id, "1", {
        click_trans_id: tx,
        merchant_prepare_id: String(o.seq),
      })
    ).error,
    -4,
  );
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 1);
  const cancelled = await f.store.createOrder(
    f.user,
    "click",
    "test",
    crypto.randomUUID(),
  );
  assert.equal(
    (await f.clickCall(cancelled.id, "0", { error: "-1" })).error,
    -9,
  );
  assert.equal((await f.clickCall(cancelled.id, "0")).error, -9);
  // Two Prepares with different click_trans_id race for one order: one wins,
  // the other gets -4 as if it came second, and nobody is paged.
  const raced = await f.store.createOrder(f.user, "click", "test", crypto.randomUUID());
  const answers = await Promise.all([f.clickCall(raced.id, "0"), f.clickCall(raced.id, "0")]);
  assert.deepEqual(answers.map((r) => r.error).sort(), [-4, 0]);
  await Promise.all(f.background);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE code='click_processing'"), 0);
});
test("test checkout is dark, authenticates account, ignores client amount and never returns live URL", async () => {
  const f = await billingFixture();
  const id = crypto.randomUUID();
  const request = (cookie = f.testCookie) =>
    new Request("https://gpt.test/api/gpt/subscribe", {
      method: "POST",
      headers: {
        cookie,
        Origin: "https://gpt.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "payme",
        requestId: id,
        acceptTerms: true,
        termsVersion: f.env.GPT_BILLING_TERMS_VERSION,
        amount: 1,
      }),
    });
  // Without the rehearsal cookie a test provider does not exist (decision L7).
  const outside = await subscribe(f.ctx(request(f.cookie)));
  assert.equal(outside.status, 404);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders"), 0);
  const forged = await subscribe(f.ctx(request(`${f.cookie}; __Host-gpt_rehearsal=v1.${Date.now() + 60_000}.${"0".repeat(32)}.${"0".repeat(64)}`)));
  assert.equal(forged.status, 404);
  const first = await (await subscribe(f.ctx(request()))).json();
  assert.equal(first.mode, "test");
  assert.equal(first.amount, 2000000);
  assert.equal(first.checkoutUrl, undefined);
  assert.equal(
    (await (await subscribe(f.ctx(request()))).json()).attemptId,
    first.attemptId,
  );
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders"), 1);
  // The open Payme invoice keeps Click closed until it is settled or expires (U7).
  const other = await subscribe(f.ctx(new Request("https://gpt.test/api/gpt/subscribe", {
    method: "POST",
    headers: { cookie: f.testCookie, Origin: "https://gpt.test", "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "click", requestId: crypto.randomUUID(), acceptTerms: true, termsVersion: f.env.GPT_BILLING_TERMS_VERSION }),
  })));
  assert.equal(other.status, 409);
  const { message, ...refused } = (await other.json()) as Record<string, unknown>;
  assert.equal(typeof message, "string");
  assert.deepEqual(refused, { ok: false, code: "pending_elsewhere", attemptId: first.attemptId, provider: "payme" });
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders"), 1);
});
test("identity is stable across devices; challenge is one-use; logout invalidates cookie", async () => {
  const f = await billingFixture();
  const identity = randomBytes(32).toString("hex");
  const a = await f.identity.login(identity),
    b = await f.identity.login(identity);
  const request = (token: string) =>
    new Request("https://gpt.test", {
      headers: { cookie: `__Host-gpt_account=${token}` },
    });
  assert.equal(
    await f.identity.user(request(a)),
    await f.identity.user(request(b)),
  );
  await f.identity.challenge("state", "verifier", "uz");
  const claims = await Promise.all([
    f.identity.claim("state"),
    f.identity.claim("state"),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  await f.identity.logout(request(a));
  assert.equal(await f.identity.user(request(a)), null);
  assert.ok(await f.identity.user(request(b)));
});
test("atomic quota admits only two parallel turns, releases failures and keeps paid attempt cost guard", async () => {
  const f = await billingFixture();
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  const decisions = await Promise.all(
    Array.from({ length: 25 }, () => turns.reserve(f.user, "ip", null, cfg)),
  );
  const accepted = decisions.filter((d) => d.id);
  assert.equal(accepted.length, 2);
  await turns.finish(accepted[0].id!, { outcome: "upstream_error", charged: false });
  await turns.finish(accepted[1].id!, { outcome: "answered", charged: true });
  assert.equal((await turns.allowance(f.user, "ip", null, cfg)).remaining, 14);
  const o = await f.store.createOrder(
    f.user,
    "payme",
    "test",
    crypto.randomUUID(),
  );
  await f.store.transition(o.id, "prepared", "prepare");
  await f.store.transition(o.id, "paid", "perform");
  const period = (await f.store.access(f.user, "test"))!;
  const tiny = { ...period, message_limit: 1 };
  // The free day spent: the turns below are the pack's (free answers first, R2).
  spendFreeDay(f, cfg);
  assert.deepEqual(
    await Promise.all(
      Array.from({ length: 10 }, () => turns.admitModelAttempt(tiny)),
    ),
    [true, true, true, false, false, false, false, false, false, false],
  );
  const paid = await turns.reserve(f.user, "new-ip", tiny, cfg);
  assert.ok(paid.id);
  assert.equal(paid.bucket, "pack");
  await turns.finish(paid.id!, { outcome: "answered", charged: true });
  assert.equal(
    (await turns.reserve(f.user, "another-ip", tiny, cfg)).limit?.reason,
    "monthly",
  );
});
test("a pack turn draws from the valid pack with answers left that ends first; a spent one is not offered", async () => {
  const f = await billingFixture();
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  const now = Date.now();
  const day = 86400_000;
  const period = (order: string, endsIn: number, limit: number, revokedAt: number | null = null) =>
    f.db
      .prepare(
        "INSERT INTO gpt_access_periods(org_id,order_id,user_id,mode,starts_at,ends_at,message_limit,revoked_at) VALUES(?,?,?,'test',?,?,?,?)",
      )
      .bind(BILLING_ORG, order, f.user, now - day, now + endsIn, limit, revokedAt)
      .runSync();
  const pack = (order: string) =>
    f.db.rows<AccessPeriod>(
      "SELECT order_id,starts_at,ends_at,message_limit FROM gpt_access_periods WHERE order_id=?",
      order,
    )[0];
  const spend = async (order: string) => {
    const turn = await turns.reserve(f.user, "ip", pack(order), cfg);
    await turns.finish(turn.id!, { outcome: "answered", charged: true });
  };
  // The free day spent: these turns are the packs' (free answers first, R2).
  spendFreeDay(f, cfg);
  period("later", 20 * day, 300);
  period("sooner-spent", 5 * day, 1);
  period("sooner-revoked", 2 * day, 300, now - 1000);
  period("ended", -1, 300);
  await spend("sooner-spent");
  assert.equal((await f.store.access(f.user, "test"))?.order_id, "later");
  // A turn in flight holds its answer; a released one gives it back.
  period("soonest", 3 * day, 1);
  const inFlight = await turns.reserve(f.user, "ip", pack("soonest"), cfg);
  assert.equal((await f.store.access(f.user, "test"))?.order_id, "later");
  await turns.finish(inFlight.id!, { outcome: "upstream_error", charged: false });
  assert.equal((await f.store.access(f.user, "test"))?.order_id, "soonest");
  await spend("soonest");
  assert.equal((await f.store.access(f.user, "test"))?.order_id, "later");
  assert.equal(await f.store.access(f.user, "live"), null);
  assert.equal(await new BillingStore(f.binding, "other-org").access(f.user, "test"), null);
});
test("calendar month handles January 31 and leap years", () => {
  assert.equal(
    new Date(addCalendarMonth(Date.UTC(2028, 0, 31))).toISOString(),
    "2028-02-29T00:00:00.000Z",
  );
});
test("markdown preserves repeated code lines, table scroll and escapes malicious HTML", () => {
  const html = renderMarkdown(
    "```html\n<img src=x onerror=alert(1)>\na\na\n```\n| X | Y |\n| --- | --- |\n| 1 | 2 |\n1. first\n2. second",
  );
  assert.ok(html.includes("gpt-code"));
  assert.ok(html.includes("a\na"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("gpt-table-scroll"));
  assert.ok(html.includes("<ol"));
  assert.ok(html.includes('tabindex="0"'));
});
test("Uzbek new copy has proper letter apostrophes and no ASCII apostrophes", () => {
  // The chat's pack lines and the pack window's copy (lazy part chat-account).
  const copy = JSON.stringify([strings("uz").premium, accountStrings("uz")]);
  assert.ok(!copy.includes("'"));
  assert.ok(!/[og]’/i.test(copy));
  assert.ok(copy.includes("o‘"));
});
test("migration and runtime billing schema match", () => {
  const migration = readFileSync(
    new URL("../migrations/0064_gpt_consumer_billing.sql", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  for (const ddl of BILLING_DDL) assert.ok(migration.includes(ddl + ";"));
});
test("0065 migration and runtime Uzum schema match", () => {
  const migration = readFileSync(
    new URL("../migrations/0065_gpt_uzum_payments.sql", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  for (const ddl of UZUM_BILLING_DDL) assert.ok(migration.includes(ddl + ";"));
});

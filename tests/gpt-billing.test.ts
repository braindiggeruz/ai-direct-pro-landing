import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import {
  BILLING_ORG,
  addCalendarMonth,
} from "../functions/lib/gpt-chat/billing-config";
import { BillingStore } from "../functions/lib/gpt-chat/billing-store";
import { TurnStore } from "../functions/lib/gpt-chat/turn-store";
import { resolveConfig } from "../functions/lib/gpt-chat/config";
import {
  md5,
  parseClickAmount,
} from "../functions/lib/gpt-chat/payment-protocol";
import { onRequestPost as payme } from "../functions/api/payments/payme";
import { onRequestPost as click } from "../functions/api/payments/click";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { renderMarkdown } from "../src/gpt-chat/markdown";
import { strings } from "../src/gpt-chat/i18n";
import { BILLING_DDL } from "../functions/lib/gpt-chat/billing-schema";

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
test("unauthenticated provider calls cannot touch D1", async () => {
  const bomb = {
    prepare() {
      throw new Error("DB touched");
    },
    batch() {
      throw new Error("DB touched");
    },
  };
  const env = {
    GPT_BILLING_MODE: "test",
    GPT_PAYME_TEST_KEY: randomBytes(32).toString("hex"),
    GPT_CLICK_TEST_SECRET: randomBytes(32).toString("hex"),
    GPTBOT_DRAFTS_DB: bomb,
  };
  const invoke = (
    handler: typeof payme,
    body: string,
    headers: Record<string, string>,
  ) =>
    handler({
      request: new Request("https://gpt.test", {
        method: "POST",
        headers,
        body,
      }),
      env,
    } as unknown as Parameters<typeof payme>[0]);
  assert.equal(
    (
      await (
        await invoke(payme, "{}", { "Content-Type": "application/json" })
      ).json()
    ).error.code,
    -32504,
  );
  assert.equal(
    (
      await (
        await invoke(click, "action=0", {
          "Content-Type": "application/x-www-form-urlencoded",
        })
      ).json()
    ).error,
    -8,
  );
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
  assert.equal(await f.store.requestRefund(f.user, o.id), true);
  assert.ok(await f.store.access(f.user, "test"));
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
test("two simultaneous different paid invoices extend without overlap", async () => {
  const f = await billingFixture();
  const now = Date.UTC(2026, 8, 5);
  const rows = await Promise.all(
    ["click", "payme"].map((p) =>
      f.store.createOrder(
        f.user,
        p as "click" | "payme",
        "test",
        crypto.randomUUID(),
      ),
    ),
  );
  await Promise.all(
    rows.map((o) =>
      f.store.transition(o.id, "prepared", "prepare", {
        externalId: crypto.randomUUID(),
      }),
    ),
  );
  await Promise.all(
    rows.map((o) => f.store.transition(o.id, "paid", "perform", { now })),
  );
  const periods = f.db.rows<{ starts_at: number; ends_at: number }>(
    "SELECT starts_at,ends_at FROM gpt_access_periods ORDER BY starts_at",
  );
  assert.equal(periods.length, 2);
  assert.equal(periods[0].starts_at, now);
  assert.equal(periods[0].ends_at, periods[1].starts_at);
  assert.equal(periods[1].ends_at, addCalendarMonth(addCalendarMonth(now)));
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
});
test("test checkout authenticates account, ignores client amount and never returns live URL", async () => {
  const f = await billingFixture();
  const id = crypto.randomUUID();
  const request = () =>
    new Request("https://gpt.test/api/gpt/subscribe", {
      method: "POST",
      headers: {
        cookie: f.cookie,
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
  const first = await (await subscribe(f.ctx(request()))).json();
  assert.equal(first.mode, "test");
  assert.equal(first.amount, 2000000);
  assert.equal(first.checkoutUrl, undefined);
  assert.equal(
    (await (await subscribe(f.ctx(request()))).json()).attemptId,
    first.attemptId,
  );
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
  await turns.finish(accepted[0].id!, false);
  await turns.finish(accepted[1].id!, true);
  assert.equal(await turns.remaining(f.user, null, cfg), 14);
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
  assert.deepEqual(
    await Promise.all(
      Array.from({ length: 10 }, () => turns.admitModelAttempt(tiny)),
    ),
    [true, true, true, false, false, false, false, false, false, false],
  );
  const paid = await turns.reserve(f.user, "new-ip", tiny, cfg);
  assert.ok(paid.id);
  await turns.finish(paid.id!, true);
  assert.equal(
    (await turns.reserve(f.user, "another-ip", tiny, cfg)).reason,
    "monthly",
  );
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
  const copy = JSON.stringify(strings("uz").premium);
  assert.ok(!copy.includes("'"));
  assert.ok(!/[og]’/i.test(copy));
  assert.ok(copy.includes("o‘"));
});
test("migration and runtime billing schema match", () => {
  const migration = readFileSync(
    new URL("../migrations/0064_gpt_consumer_billing.sql", import.meta.url),
    "utf8",
  );
  for (const ddl of BILLING_DDL) assert.ok(migration.includes(ddl + ";"));
});

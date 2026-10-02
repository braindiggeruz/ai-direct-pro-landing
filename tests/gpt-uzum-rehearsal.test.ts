// Uzum rehearsal on simulated callbacks (plan WP-15): the steps of
// scripts/uzum-sandbox-rehearsal.ts played in process against the webhook
// route with a database write that really fails half-way, the same script over
// HTTP against the site's handlers on 127.0.0.1 (its "--simulate local"
// mode), and a Checkout sequence of one account: success, a late duplicate,
// a decline, a callback lost while the visitor comes back, one lost while
// nobody does, and a refund. Real SQLite; nothing leaves the machine.
// Run: node --import tsx --test tests/gpt-uzum-rehearsal.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { uzumFixture } from "./helpers/uzum-fixture";
import {
  httpSender,
  rehearsalCode,
  rehearseMerchant,
  startLocalSite,
  type WebhookSend,
} from "../scripts/uzum-sandbox-rehearsal";
import { onRequestPost as uzumMerchant } from "../functions/api/payments/uzum-merchant/[op]";
import { BILLING_ORG } from "../functions/lib/gpt-chat/billing-config";
import { UzumStore, UZUM_REASON_TIMEOUT, UZUM_SESSION_EXPIRED_MS } from "../functions/lib/gpt-chat/uzum-store";
import { maintainUzum } from "../functions/lib/gpt-chat/uzum-maintenance";

test("Merchant API: every step of the rehearsal script passes in process, with a /confirm that really fails half-way", async () => {
  const f = await uzumFixture({ mode: "test", api: "merchant" });
  try {
    const code = await f.paymentCode();
    let failNextBatch = false;
    const inner = f.binding;
    f.env.GPTBOT_DRAFTS_DB = new Proxy(inner, {
      get(target, prop) {
        if (prop === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (failNextBatch) {
              failNextBatch = false;
              throw new Error("D1 unavailable");
            }
            return target.batch(statements);
          };
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const send: WebhookSend = async (op, body, authorization) => {
      const response = await uzumMerchant(
        f.ctx(
          new Request(`https://gptbot.uz/api/payments/uzum-merchant/${op}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authorization },
            body: JSON.stringify(body),
          }),
          { op },
        ),
      );
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    const transIds: string[] = [];
    const steps = await rehearseMerchant({
      send,
      credentials: f.merchant,
      code,
      transId: () => {
        transIds.push(randomUUID());
        return transIds.at(-1)!;
      },
      loseConfirm: async (confirm) => {
        failNextBatch = true;
        const lost = await confirm();
        assert.deepEqual([lost.status, lost.body.errorCode], [500, "99999"]);
      },
    });
    assert.deepEqual(steps.filter((s) => !s.ok), []);
    assert.equal(steps.length, 22);
    await f.drain();
    // The ledger agrees with what Uzum was told.
    const store = new UzumStore(f.binding, BILLING_ORG);
    const [a, b, d, unknown] = transIds;
    const state = async (transId: string) => {
      const row = (await store.external("test", transId))!;
      return { state: row.state, reason: row.reason, confirmed: row.confirm_requested_at !== null };
    };
    assert.deepEqual(await state(a), { state: "refunded", reason: 5, confirmed: true });
    assert.deepEqual(await state(b), { state: "cancelled", reason: UZUM_REASON_TIMEOUT, confirmed: false });
    assert.deepEqual(await state(d), { state: "refunded", reason: 5, confirmed: true });
    assert.equal(await store.external("test", unknown), null);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_uzum_orders"), 3);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE revoked_at IS NULL"), 0);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_journal WHERE to_state='paid'"), 2);
    assert.ok(f.alerts().includes("uzum_processing"));
    assert.equal(JSON.stringify(f.db.rows("SELECT * FROM gpt_uzum_orders")).includes("998900000000"), false);
  } finally {
    f.restore();
  }
});

test("the rehearsal script over HTTP: --simulate local passes every step against the site's own handlers", async () => {
  const local = await startLocalSite();
  try {
    assert.match(local.site, /^http:\/\/127\.0\.0\.1:\d+$/);
    const code = await rehearsalCode(local.site, local.maintenanceSecret);
    assert.match(code, /^[1-9]\d{8}$/);
    const steps = await rehearseMerchant({ send: httpSender(local.site), credentials: local.credentials, code });
    assert.deepEqual(steps.filter((s) => !s.ok), []);
    // Without the Bearer secret no rehearsal session, hence no code.
    await assert.rejects(rehearsalCode(local.site, "wrong-secret"), /rehearsal session: HTTP 403/);
  } finally {
    await local.close();
  }
});

test("Checkout: success, a late duplicate, a decline, two lost callbacks and a refund settle one account exactly", async () => {
  const f = await uzumFixture();
  try {
    const store = new UzumStore(f.binding, BILLING_ORG);
    const hint = (row: { id: string; external_id: string | null }, operationType = "COMPLETE", operationState = "SUCCESS") =>
      f.callback({ orderId: row.external_id, operationState, operationType, orderNumber: row.id });
    const start = async () => (await store.order(String((await f.subscribeUzum(randomUUID())).body.attemptId)))!;

    const paid = await start();
    f.settleAtUzum(paid.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    assert.equal((await hint(paid)).status, 200);
    assert.equal((await hint(paid)).status, 200, "a late duplicate changes nothing");

    const declined = await start();
    f.settleAtUzum(declined.external_id!, { status: "DECLINED" });
    await hint(declined, "AUTHORIZE", "FAIL");

    // Lost callback, the visitor comes back: the panel's pull settles it.
    const returning = await start();
    f.settleAtUzum(returning.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    assert.equal(((await f.accountView()).payment as { state: string }).state, "paid");

    // Lost callback, nobody comes back: the maintenance tick settles it.
    const silent = await start();
    f.settleAtUzum(silent.external_id!, { status: "COMPLETED", completedAmount: 2000000 });
    f.db.sqlite.prepare("UPDATE gpt_uzum_orders SET provider_time=provider_time-? WHERE id=?").run(UZUM_SESSION_EXPIRED_MS + 60_000, silent.id);
    assert.equal((await maintainUzum(f.env))!.settled, 1);

    // The first pack is refunded: Uzum's REFUNDED is what revokes it.
    assert.equal((await f.refundCall({ orderId: paid.id, confirmRefund: true })).status, 200);
    assert.equal((await store.order(paid.id))!.state, "paid");
    f.settleAtUzum(paid.external_id!, { status: "REFUNDED", refundedAmount: 2000000 });
    await hint(paid, "REFUND");

    const states = await Promise.all([paid, declined, returning, silent].map(async (row) => (await store.order(row.id))!.state));
    assert.deepEqual(states, ["refunded", "cancelled", "paid", "paid"]);
    assert.deepEqual(
      f.db.rows<{ order_id: string; revoked: number }>("SELECT order_id,revoked_at IS NOT NULL AS revoked FROM gpt_access_periods ORDER BY starts_at").map((r) => [r.order_id, r.revoked]),
      [[paid.id, 1], [returning.id, 0], [silent.id, 0]],
    );
    for (const row of [paid, returning, silent])
      assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_journal WHERE order_id=? AND to_state='paid'", row.id), 1, row.id);
    await f.drain();
    const { maintainBilling } = await import("../functions/lib/gpt-chat/billing-maintenance-store");
    await maintainBilling(f.env);
    await maintainBilling(f.env);
    const events = f.telegram.map((m) => m.text.split("\n")[0]).sort();
    assert.deepEqual(events, [
      "GPTBot.uz · AI paket: cancelled",
      "GPTBot.uz · AI paket: paid",
      "GPTBot.uz · AI paket: paid",
      "GPTBot.uz · AI paket: paid",
      "GPTBot.uz · AI paket: refunded",
    ]);
  } finally {
    f.restore();
  }
});

// Uzum Merchant API (plan WP-15: U1, U8, U9, U10, and U7 for the app): a
// payment inside the Uzum Bank app by the account's permanent payment code.
// /check finds the account, /create opens its order on the fly, /confirm
// records that it arrived before it marks the order paid, /status finishes
// what a failed /confirm left, /reverse returns the money. Real SQLite, random
// credentials, a fake Uzum behind fetch; no request leaves the process.
// Run: node --import tsx --test tests/gpt-uzum-merchant.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { uzumFixture } from "./helpers/uzum-fixture";
import { onRequestPost as uzumMerchant } from "../functions/api/payments/uzum-merchant/[op]";
import { BILLING_ORG } from "../functions/lib/gpt-chat/billing-config";
import { BillingStore } from "../functions/lib/gpt-chat/billing-store";
import { ensureUzumSchema } from "../functions/lib/gpt-chat/billing-schema";
import {
  luhnDigit,
  PaymentCodeStore,
  paymentCodeFromAccount,
  validPaymentCode,
} from "../functions/lib/gpt-chat/payment-code-store";
import { merchantAuthorized } from "../functions/lib/gpt-chat/uzum-config";
import { UzumStore, UZUM_REASON_TIMEOUT } from "../functions/lib/gpt-chat/uzum-store";
import { maintainUzum } from "../functions/lib/gpt-chat/uzum-maintenance";
import { isUrgentAlert } from "../functions/lib/gpt-chat/alert-policy";

type Fixture = Awaited<ReturnType<typeof uzumFixture>>;
const MIN = 60_000;
const PRICE = 2_000_000;
const OPS = ["check", "create", "confirm", "reverse", "status"];
const bomb = {
  prepare() {
    throw new Error("DB touched");
  },
  batch() {
    throw new Error("DB touched");
  },
};

/** A request body that fails the test if anything reads it. */
const unreadable = () =>
  new ReadableStream({
    pull() {
      throw new Error("body read");
    },
  });

/** The fixture's D1 behind a switch that fails the next batch once (a dropped write). */
function breakable(f: Fixture) {
  let armed = false;
  const inner = f.binding;
  f.env.GPTBOT_DRAFTS_DB = new Proxy(inner, {
    get(target, prop) {
      if (prop === "batch")
        return async (statements: D1PreparedStatement[]) => {
          if (armed) {
            armed = false;
            throw new Error("D1 unavailable");
          }
          return target.batch(statements);
        };
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  return () => {
    armed = true;
  };
}

const create = (f: Fixture, code: string, transId = randomUUID(), amount = PRICE) =>
  f.merchantCall("create", { transId, amount, params: { account: code } });
const confirm = (f: Fixture, transId: string) =>
  f.merchantCall("confirm", { transId, paymentSource: "UZCARD", phone: "998901234567" });

test("payment codes: nine digits ending in a Luhn check digit, read as a number or a string", async () => {
  assert.equal(luhnDigit("7992739871"), 3);
  assert.equal(validPaymentCode("100000009"), luhnDigit("10000000") === 9);
  for (let i = 0; i < 50; i++) {
    const body = String(10_000_000 + Math.floor(Math.random() * 90_000_000));
    const code = `${body}${luhnDigit(body)}`;
    assert.ok(validPaymentCode(code), code);
    // Every single-digit typo is caught by the check digit.
    const typo = `${code.slice(0, 3)}${(Number(code[3]) + 1) % 10}${code.slice(4)}`;
    assert.equal(validPaymentCode(typo), false, typo);
    assert.equal(paymentCodeFromAccount(Number(code)), code);
    assert.equal(paymentCodeFromAccount(`${code.slice(0, 4)} ${code.slice(4, 8)} ${code.slice(8)}`), code);
    assert.equal(paymentCodeFromAccount(`${code.slice(0, 4)}-${code.slice(4)}`), code);
  }
  for (const bad of [null, undefined, true, {}, [], "", "12345678", "0123456789", "1234567890", 1.5, -123456789, "x".repeat(40), `uzm_${"0".repeat(32)}`])
    assert.equal(paymentCodeFromAccount(bad), null, String(bad));

  const f = await uzumFixture({ api: "merchant" });
  try {
    await ensureUzumSchema(f.binding);
    const codes = new PaymentCodeStore(f.binding, BILLING_ORG);
    const consent = { version: "fixture-v1", url: "https://gptbot.uz/ru/terms/", locale: "ru" as const };
    // Concurrent first requests of one account end with one code.
    const issued = await Promise.all([codes.issue(f.user, consent, 1000), codes.issue(f.user, consent, 1000)]);
    assert.equal(issued[0], issued[1]);
    assert.ok(validPaymentCode(issued[0]));
    // A later acceptance keeps the code and records the new terms.
    assert.equal(await codes.issue(f.user, { ...consent, version: "fixture-v2", locale: "uz" }, 2000), issued[0]);
    assert.deepEqual(
      { ...(await codes.byCode(issued[0]))! },
      { code: issued[0], user_id: f.user, created_at: 1000, terms_version: "fixture-v2", terms_url: consent.url, terms_locale: "uz", terms_accepted_at: 2000 },
    );
    // A random code that is already taken is drawn again.
    const original = crypto.getRandomValues.bind(crypto);
    const taken = Number(issued[0].slice(0, 8)) - 10_000_000;
    let draws = 0;
    crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T) => {
      draws++;
      if (draws === 1 && array instanceof Uint32Array) {
        array[0] = taken;
        return array;
      }
      return original(array as never) as T;
    }) as typeof crypto.getRandomValues;
    try {
      const second = await codes.issue("acct_second", consent);
      assert.notEqual(second, issued[0]);
      assert.ok(draws >= 2);
    } finally {
      crypto.getRandomValues = original;
    }
    // Tenant isolation: another org neither sees this code nor collides with it.
    const other = new PaymentCodeStore(f.binding, "org_other");
    assert.equal(await other.byCode(issued[0]), null);
    assert.equal(await other.forUser(f.user), null);
    await f.binding
      .prepare("INSERT INTO gpt_payment_codes(org_id,code,user_id,created_at) VALUES('org_other',?,?,1)")
      .bind(issued[0], "acct_elsewhere")
      .run();
    assert.equal((await codes.byCode(issued[0]))!.user_id, f.user);
  } finally {
    f.restore();
  }
});

test("U9: Basic in any letter case and spacing, compared after decoding; anything else is 10001 before the body or D1", async () => {
  const creds = { login: "merchant-login", password: randomBytes(12).toString("hex") };
  const encoded = btoa(`${creds.login}:${creds.password}`);
  for (const header of [`Basic ${encoded}`, `basic ${encoded}`, `BASIC   ${encoded}`, ` Basic ${encoded} `])
    assert.equal(merchantAuthorized(header, creds), true, header);
  for (const header of [null, "", `Bearer ${encoded}`, `Basic ${btoa(`${creds.login}:${creds.password}x`)}`, `Basic ${btoa(`${creds.login}x:${creds.password}`)}`, "Basic ###", "Basic", `Basic${encoded}`, `Basic ${encoded} extra`])
    assert.equal(merchantAuthorized(header, creds), false, String(header));

  const f = await uzumFixture({ mode: "test", api: "merchant" });
  try {
    for (const op of OPS) {
      const response = await uzumMerchant({
        request: new Request(`https://gpt.test/api/payments/uzum-merchant/${op}`, {
          method: "POST",
          headers: { Authorization: f.basic(f.merchant.login, "wrong-password") },
          body: unreadable(),
          duplex: "half",
        } as RequestInit),
        env: { ...f.env, GPTBOT_DRAFTS_DB: bomb },
        params: { op },
        waitUntil() {},
      } as never);
      assert.deepEqual([response.status, ((await response.json()) as { errorCode: string }).errorCode], [400, "10001"], op);
    }
    const lower = await f.merchantCall("check", { params: { account: await f.paymentCode() } }, `basic  ${btoa(`${f.merchant.login}:${f.merchant.password}`)}`);
    assert.equal(lower.body.status, "OK");
  } finally {
    f.restore();
  }
});

test("U1: /check finds the account by its code, /create opens the order on the fly with the code's consent", async () => {
  const f = await uzumFixture({ mode: "test", api: "merchant" });
  try {
    const code = await f.paymentCode();
    const consent = { ...(await new PaymentCodeStore(f.binding, BILLING_ORG).byCode(code))! };
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_uzum_orders"), 0, "showing the code opens no order");
    for (const account of [code, Number(code), `${code.slice(0, 4)} ${code.slice(4, 8)} ${code.slice(8)}`]) {
      const checked = await f.merchantCall("check", { params: { account } });
      assert.equal(checked.status, 200);
      assert.deepEqual(
        { status: checked.body.status, serviceId: checked.body.serviceId, data: checked.body.data },
        { status: "OK", serviceId: f.merchant.serviceId, data: { account: { value: code }, product: { value: "AI paket 300" } } },
      );
      assert.equal(typeof checked.body.timestamp, "number");
    }
    assert.equal((await f.merchantCall("check", {})).body.errorCode, "10005");
    assert.equal((await f.merchantCall("check", { params: {} })).body.errorCode, "10005");
    assert.equal((await f.merchantCall("check", { params: { account: `${code.slice(0, 8)}${(Number(code[8]) + 1) % 10}` } })).body.errorCode, "10007");
    assert.equal((await f.merchantCall("check", { params: { account: "100000009" === code ? "100000017" : "100000009" } })).body.errorCode, "10007");
    assert.equal((await f.merchantCall("check", { serviceId: f.merchant.serviceId + 1, params: { account: code } })).body.errorCode, "10006");
    assert.equal((await f.merchantCall("pay", { params: { account: code } })).body.errorCode, "10003");

    const transId = randomUUID();
    assert.equal((await create(f, code, transId, PRICE - 100)).body.errorCode, "10011");
    assert.equal((await create(f, code, transId, PRICE + 100)).body.errorCode, "10011");
    const created = await create(f, code, transId);
    assert.equal(created.status, 200);
    const row = (await new UzumStore(f.binding, BILLING_ORG).external("test", transId))!;
    assert.deepEqual(created.body, { serviceId: f.merchant.serviceId, transId, status: "CREATED", transTime: row.create_time, amount: PRICE });
    assert.deepEqual(
      { user: row.user_id, request: row.request_id, api: row.api, state: row.state, mode: row.mode, autofiscal: row.autofiscal, amount: row.amount },
      { user: f.user, request: transId, api: "merchant", state: "prepared", mode: "test", autofiscal: null, amount: PRICE },
    );
    assert.equal(row.provider_time !== null && row.create_time > 0, true);
    // The order carries the terms its owner accepted when the code was shown.
    assert.deepEqual(
      { ...f.db.rows("SELECT version,url,locale,accepted_at,user_id FROM gpt_payment_consents WHERE order_id=?", row.id)[0] as object },
      { version: consent.terms_version, url: consent.terms_url, locale: "uz", accepted_at: consent.terms_accepted_at, user_id: f.user },
    );
    // The same transId again is 10010, before anything else (AGENTS §4).
    assert.equal((await create(f, code, transId)).body.errorCode, "10010");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_uzum_orders"), 1);
    assert.equal((await f.merchantCall("status", { transId })).body.status, "CREATED");
    const confirmed = await confirm(f, transId);
    assert.deepEqual(
      { status: confirmed.body.status, amount: confirmed.body.amount, transId: confirmed.body.transId },
      { status: "CONFIRMED", amount: PRICE, transId },
    );
    assert.equal(confirmed.body.confirmTime, (await new UzumStore(f.binding, BILLING_ORG).order(row.id))!.perform_time);
    assert.ok(await f.store.access(f.user, "test"));
    assert.equal(f.db.value("SELECT actor FROM gpt_payment_journal WHERE order_id=? AND to_state='paid'", row.id), "uzum");
    assert.equal(JSON.stringify(f.db.rows("SELECT * FROM gpt_uzum_orders")).includes("998901234567"), false, "phone is never stored");
    assert.equal(JSON.stringify(f.db.rows("SELECT * FROM gpt_payment_journal")).includes("998901234567"), false);
    // The account view shows the same code and the app flow.
    const view = await f.accountView();
    assert.deepEqual([view.uzumFlow, view.paymentCode], ["code", code]);
    assert.equal((view.payment as { provider: string; state: string }).state, "paid");
    await f.drain();
  } finally {
    f.restore();
  }
});

test("/check and /create refuse what nobody may pay: a stale offer, sales paused, a rehearsal account in live, another org", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const code = await f.paymentCode();
    assert.equal((await f.merchantCall("check", { params: { account: code } })).body.status, "OK");
    // The offer changed: the code waits until its owner accepts the new one on the site.
    f.env.GPT_BILLING_TERMS_VERSION = "fixture-v2";
    assert.equal((await f.merchantCall("check", { params: { account: code } })).body.errorCode, "10007");
    assert.equal((await create(f, code)).body.errorCode, "10007");
    assert.equal((await f.accountView()).paymentCode, null);
    assert.equal(await f.paymentCode(), code);
    assert.equal((await f.merchantCall("check", { params: { account: code } })).body.status, "OK");
    // Sales paused (live switch off): no new app payment, existing ones still settle.
    const open = randomUUID();
    assert.equal((await create(f, code, open)).body.status, "CREATED");
    f.env.GPT_BILLING_LIVE_READY = "false";
    const paused = await f.merchantCall("check", { params: { account: code } });
    assert.deepEqual([paused.status, paused.body.errorCode], [400, "99999"]);
    assert.equal((await create(f, code)).body.errorCode, "99999");
    assert.equal((await confirm(f, open)).body.status, "CONFIRMED");
    f.env.GPT_BILLING_LIVE_READY = "true";
    // A synthetic rehearsal account never pays live.
    const rehearsal = await new PaymentCodeStore(f.binding, BILLING_ORG).issue(
      "acct_rh_0123456789abcdef0123456789abcdef",
      { version: "fixture-v2", url: "https://gptbot.uz/ru/terms/", locale: "ru" },
    );
    assert.equal((await f.merchantCall("check", { params: { account: rehearsal } })).body.errorCode, "10007");
    assert.equal((await create(f, rehearsal)).body.errorCode, "10007");
    // Tenant isolation: another org's code and transaction are unknown here.
    const foreign = await new PaymentCodeStore(f.binding, "org_other").issue(f.user, {
      version: "fixture-v2",
      url: "https://gptbot.uz/ru/terms/",
      locale: "ru",
    });
    if (foreign !== code) assert.equal((await f.merchantCall("check", { params: { account: foreign } })).body.errorCode, "10007");
    const foreignStore = new UzumStore(f.binding, "org_other");
    const foreignTrans = randomUUID();
    const foreignOrder = await foreignStore.createOrder(f.user, "live", randomUUID(), "merchant");
    await foreignStore.billing.transition(foreignOrder.id, "prepared", "uzum_create", { externalId: foreignTrans });
    assert.equal((await f.merchantCall("status", { transId: foreignTrans })).body.errorCode, "10014");
    assert.equal((await confirm(f, foreignTrans)).body.errorCode, "10014");
    assert.equal((await f.merchantCall("reverse", { transId: foreignTrans })).body.errorCode, "10014");
    assert.equal((await foreignStore.order(foreignOrder.id))!.state, "prepared");
    await f.drain();
  } finally {
    f.restore();
  }
});

test("U8: a /confirm that fails half-way is finished by /status, never failed; a repeat finds it confirmed", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const code = await f.paymentCode();
    const breakNext = breakable(f);
    const store = new UzumStore(f.binding, BILLING_ORG);
    const transId = randomUUID();
    assert.equal((await create(f, code, transId)).body.status, "CREATED");
    breakNext();
    const failed = await confirm(f, transId);
    assert.deepEqual([failed.status, failed.body.status, failed.body.errorCode], [500, "FAILED", "99999"]);
    await f.drain();
    let row = (await store.external("live", transId))!;
    assert.equal(row.state, "prepared");
    assert.ok(row.confirm_requested_at, "the confirm was recorded before the failure");
    assert.ok(f.alerts().includes("uzum_processing"));
    // Even past the 30-minute rule: Uzum has debited the payer, so /status finishes it.
    f.db.sqlite.prepare("UPDATE gpt_uzum_orders SET create_time=create_time-? WHERE id=?").run(31 * MIN, row.id);
    const status = await f.merchantCall("status", { transId });
    assert.equal(status.body.status, "CONFIRMED");
    row = (await store.external("live", transId))!;
    assert.deepEqual([row.state, status.body.confirmTime], ["paid", row.perform_time]);
    assert.ok(await f.store.access(f.user, "live"));
    assert.equal((await confirm(f, transId)).body.errorCode, "10016");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE order_id=?", row.id), 1);
    // A repeated /confirm after a half-way failure finishes it the same way.
    const second = randomUUID();
    assert.equal((await create(f, code, second)).body.status, "CREATED");
    breakNext();
    assert.equal((await confirm(f, second)).status, 500);
    assert.equal((await confirm(f, second)).body.status, "CONFIRMED");
    await f.drain();
  } finally {
    f.restore();
  }
});

test("a /create that failed half-way is taken up by Uzum's retry of the same transId, not refused", async () => {
  const f = await uzumFixture({ mode: "test", api: "merchant" });
  try {
    const code = await f.paymentCode();
    const store = new UzumStore(f.binding, BILLING_ORG);
    const transId = randomUUID();
    // The order was opened with its consent, the answer never left: it is
    // pending under this transId.
    const holder = (await new PaymentCodeStore(f.binding, BILLING_ORG).byCode(code))!;
    const half = await store.createOrder(f.user, "test", transId, "merchant", Date.now(), {
      version: holder.terms_version!,
      url: holder.terms_url!,
      locale: "uz",
      acceptedAt: holder.terms_accepted_at!,
    });
    const created = await create(f, code, transId);
    assert.equal(created.body.status, "CREATED");
    const row = (await store.external("test", transId))!;
    assert.deepEqual([row.id, row.state], [half.id, "prepared"]);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_uzum_orders"), 1);
    assert.equal((await create(f, code, transId)).body.errorCode, "10010");
  } finally {
    f.restore();
  }
});

test("the 30-minute rule: an unconfirmed transaction fails at /confirm and /status and is closed by the maintenance tick", async () => {
  const f = await uzumFixture({ mode: "test", api: "merchant" });
  try {
    const code = await f.paymentCode();
    const store = new UzumStore(f.binding, BILLING_ORG);
    const age = (transId: string) =>
      f.db.sqlite.prepare("UPDATE gpt_uzum_orders SET create_time=create_time-? WHERE external_id=?").run(31 * MIN, transId);
    const late = randomUUID();
    await create(f, code, late);
    age(late);
    assert.equal((await confirm(f, late)).body.errorCode, "10015");
    assert.deepEqual([(await store.external("test", late))!.state, (await store.external("test", late))!.reason], ["cancelled", UZUM_REASON_TIMEOUT]);
    const failed = await f.merchantCall("status", { transId: late });
    assert.deepEqual([failed.status, failed.body.status, failed.body.errorCode], [400, "FAILED", "10015"]);
    assert.equal(failed.body.transTime, (await store.external("test", late))!.create_time);
    const quiet = randomUUID();
    await create(f, code, quiet);
    age(quiet);
    assert.deepEqual(await maintainUzum(f.env), { settled: 0, receipts: 0, expired: 1, recovered: 0 });
    assert.equal((await store.external("test", quiet))!.state, "cancelled");
    assert.equal((await f.merchantCall("status", { transId: quiet })).body.errorCode, "10015");
    assert.equal((await f.merchantCall("status", { transId: randomUUID() })).body.errorCode, "10014");
    assert.equal((await confirm(f, randomUUID())).body.errorCode, "10014");
    await f.drain();
  } finally {
    f.restore();
  }
});

test("U10/U7: one payment per account at a time; a newer app payment replaces an unconfirmed one; a seen invoice blocks", async () => {
  const f = await uzumFixture({ mode: "test", api: "merchant" });
  try {
    const code = await f.paymentCode();
    const store = new UzumStore(f.binding, BILLING_ORG);
    const check = async () => (await f.merchantCall("check", { params: { account: code } })).body;
    // An unconfirmed app transaction does not block: the next one replaces it.
    const first = randomUUID();
    await create(f, code, first);
    assert.equal((await check()).status, "OK");
    const second = randomUUID();
    assert.equal((await create(f, code, second)).body.status, "CREATED");
    const replaced = (await store.external("test", first))!;
    assert.deepEqual([replaced.state, replaced.reason], ["cancelled", UZUM_REASON_TIMEOUT]);
    assert.equal(f.db.value("SELECT method FROM gpt_payment_journal WHERE order_id=? AND to_state='cancelled'", replaced.id), "uzum_superseded");
    assert.equal((await confirm(f, first)).body.errorCode, "10015");
    assert.equal((await f.merchantCall("status", { transId: first })).body.errorCode, "10015");
    // A confirm in flight blocks: that money is already taken.
    await f.binding.prepare("UPDATE gpt_uzum_orders SET confirm_requested_at=? WHERE external_id=?").bind(Date.now(), second).run();
    assert.equal((await check()).errorCode, "10008");
    assert.equal((await create(f, code)).body.errorCode, "10008");
    assert.equal((await confirm(f, second)).body.status, "CONFIRMED");
    assert.equal((await check()).status, "OK");
    // A Click invoice Click never saw is closed by the app payment...
    const click = new BillingStore(f.binding, BILLING_ORG);
    const unseen = await click.createOrder(f.user, "click", "test", randomUUID());
    assert.equal((await check()).status, "OK");
    const third = randomUUID();
    assert.equal((await create(f, code, third)).body.status, "CREATED");
    assert.equal((await click.order(unseen.id))!.state, "cancelled");
    assert.deepEqual(
      { ...f.db.rows("SELECT actor,method FROM gpt_payment_journal WHERE order_id=? AND to_state='cancelled'", unseen.id)[0] as object },
      { actor: "system", method: "invoice_superseded" },
    );
    assert.equal((await confirm(f, third)).body.status, "CONFIRMED");
    // ...while one Click is processing (Prepare done) blocks until it settles.
    const seen = await click.createOrder(f.user, "click", "test", randomUUID());
    await click.transition(seen.id, "prepared", "Prepare", { externalId: String(randomBytes(4).readUInt32BE(0)) });
    assert.equal((await check()).errorCode, "10008");
    assert.equal((await create(f, code)).body.errorCode, "10008");
    await click.transition(seen.id, "cancelled", "Complete", { reason: -5017 });
    assert.equal((await check()).status, "OK");
    // Two packs bought in the app run side by side.
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE user_id=? AND revoked_at IS NULL", f.user), 2);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("reverse: before payment it cancels, after payment it refunds, revokes the pack and queues the refund receipt", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const code = await f.paymentCode();
    const store = new UzumStore(f.binding, BILLING_ORG);
    const open = randomUUID();
    await create(f, code, open);
    const cancelled = await f.merchantCall("reverse", { transId: open });
    assert.deepEqual([cancelled.body.status, cancelled.body.amount], ["REVERSED", PRICE]);
    assert.equal((await store.external("live", open))!.state, "cancelled");
    assert.equal((await f.merchantCall("status", { transId: open })).body.status, "REVERSED");
    assert.equal(f.receipt((await store.external("live", open))!.id), undefined, "no sale, no receipt");

    const paid = randomUUID();
    await create(f, code, paid);
    assert.equal((await confirm(f, paid)).body.status, "CONFIRMED");
    await f.drain();
    const row = (await store.external("live", paid))!;
    assert.equal(f.receipt(row.id).status_code, 0, "the sale receipt printed right after the confirm");
    const reversed = await f.merchantCall("reverse", { transId: paid });
    assert.equal(reversed.body.status, "REVERSED");
    assert.equal(reversed.body.reverseTime, (await store.order(row.id))!.cancel_time);
    assert.equal((await store.order(row.id))!.state, "refunded");
    assert.equal(await f.store.access(f.user, "live"), null);
    await f.drain();
    assert.equal(f.receipt(row.id, "CANCEL").status_code, 0, "and the refund receipt after the reverse");
    assert.equal((await f.merchantCall("reverse", { transId: paid })).body.errorCode, "10018");
    const status = await f.merchantCall("status", { transId: paid });
    assert.deepEqual([status.body.status, status.body.reverseTime], ["REVERSED", (await store.order(row.id))!.cancel_time]);
    assert.equal((await confirm(f, paid)).body.errorCode, "10015");
    // The owner heard of the payment and of the refund once each.
    assert.deepEqual(
      f.telegram.map((m) => m.text.split("\n")[0]).filter((line) => line.startsWith("GPTBot.uz · AI paket")).sort(),
      ["GPTBot.uz · AI paket: cancelled", "GPTBot.uz · AI paket: paid", "GPTBot.uz · AI paket: refunded"],
    );
  } finally {
    f.restore();
  }
});

test("the maintenance tick finishes a confirm Uzum debited when /status never came, and tells the owner", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const code = await f.paymentCode();
    const breakNext = breakable(f);
    const transId = randomUUID();
    await create(f, code, transId);
    breakNext();
    assert.equal((await confirm(f, transId)).status, 500);
    await f.drain();
    f.env.GPTBOT_DRAFTS_DB = f.binding;
    // Not yet: Uzum's own /status retries come first.
    assert.deepEqual(await maintainUzum(f.env), { settled: 0, receipts: 0, expired: 0, recovered: 0 });
    f.db.sqlite.prepare("UPDATE gpt_uzum_orders SET confirm_requested_at=confirm_requested_at-? WHERE external_id=?").run(11 * MIN, transId);
    assert.deepEqual(await maintainUzum(f.env), { settled: 0, receipts: 0, expired: 0, recovered: 1 });
    const row = (await new UzumStore(f.binding, BILLING_ORG).external("live", transId))!;
    assert.equal(row.state, "paid");
    assert.equal(f.db.value("SELECT method FROM gpt_payment_journal WHERE order_id=? AND to_state='paid'", row.id), "uzum_confirm_recovered");
    assert.ok(f.alerts().includes("uzum_confirm_recovered"));
    assert.ok(isUrgentAlert("uzum_confirm_recovered"));
    assert.equal((await f.merchantCall("status", { transId })).body.status, "CONFIRMED");
  } finally {
    f.restore();
  }
});

test("owner refunds of app payments: Uzum returns them; only a record of Uzum's own refund is accepted", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const code = await f.paymentCode();
    const transId = randomUUID();
    await create(f, code, transId);
    await confirm(f, transId);
    await f.drain();
    const row = (await new UzumStore(f.binding, BILLING_ORG).external("live", transId))!;
    const asked = await f.refundCall({ orderId: row.id, confirmRefund: true });
    assert.deepEqual([asked.status, asked.body.code], [409, "uzum_merchant_refund"]);
    assert.equal(f.calls.filter((c) => c.path.startsWith("/api/v1/")).length, 0, "no Checkout call for an app payment");
    assert.equal((await f.refundCall({ orderId: row.id, merchantRefundReference: "uzum-ticket-7", confirmedRefund: true }, "")).status, 403);
    const recorded = await f.refundCall({ orderId: row.id, merchantRefundReference: "uzum-ticket-7", confirmedRefund: true });
    assert.deepEqual([recorded.status, recorded.body.state], [200, "refunded"]);
    assert.equal(f.db.value("SELECT actor FROM gpt_payment_journal WHERE order_id=? AND to_state='refunded'", row.id), "owner");
    assert.equal(await f.store.access(f.user, "live"), null);
    await f.drain();
    assert.equal(f.receipt(row.id, "CANCEL").status_code, 0);
    // A repeat changes nothing; Uzum's late /reverse of it is 10018.
    assert.equal((await f.refundCall({ orderId: row.id, merchantRefundReference: "uzum-ticket-7", confirmedRefund: true })).body.state, "refunded");
    assert.equal((await f.merchantCall("reverse", { transId })).body.errorCode, "10018");
  } finally {
    f.restore();
  }
});

test("not configured: every operation is a missing route before the body or D1", async () => {
  const f = await uzumFixture({ api: "merchant" });
  try {
    const off = [
      { UZUM_API: "" },
      { UZUM_API: "checkout" },
      { GPT_BILLING_MODE_UZUM: "off" },
      { GPT_PAYMENT_PROVIDERS: "click" },
      { UZUM_CREDENTIALS_JSON: JSON.stringify({ merchant: { test: f.merchant } }) },
    ];
    for (const change of off)
      for (const op of [...OPS, "unknown"]) {
        const response = await uzumMerchant({
          request: new Request(`https://gpt.test/api/payments/uzum-merchant/${op}`, {
            method: "POST",
            headers: { Authorization: f.basic() },
            body: unreadable(),
            duplex: "half",
          } as RequestInit),
          env: { ...f.env, ...change, GPTBOT_DRAFTS_DB: bomb },
          params: { op },
          waitUntil() {},
        } as never);
        assert.equal(response.status, 404, `${op} ${JSON.stringify(Object.keys(change))}`);
      }
  } finally {
    f.restore();
  }
});

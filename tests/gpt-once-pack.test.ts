// The 3-day AI pack (5 000 UZS, 30 answers, 72 hours; owner's order of
// 2026-11-17): functions/lib/gpt-chat/packs.ts, migrations/0085 and every
// place that had one price, one size and one order table.
//
// What must hold: the pack is sold only while GPT_PACK_ONCE offers it; its
// money comes from the catalog and then from the order's own row; its orders
// live in their own table and are found by every reader the monthly pack's
// are found by; the two packs stack and never replace each other; and the
// monthly pack's path is what it was.
//
// Runtime-only random protocol fixtures, never real merchant credentials.
// Run: node --import tsx --test tests/gpt-once-pack.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { billingFixture, liveSettings } from "./helpers/gpt-billing-fixture";
import { fakeClickMerchant } from "./helpers/click-merchant-fake";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { ensureSchema } from "../functions/lib/gpt-chat/schema";
import { BILLING_DDL, ONCE_BILLING_DDL, ensureBillingSchema } from "../functions/lib/gpt-chat/billing-schema";
import { BILLING_ORG, PAID_MESSAGES, PRICE_TIYIN, addCalendarMonth, type BillingEnv } from "../functions/lib/gpt-chat/billing-config";
import { BillingStore, PendingElsewhereError } from "../functions/lib/gpt-chat/billing-store";
import { IdentityStore, isGuestAccount } from "../functions/lib/gpt-chat/identity-store";
import { ONCE_ORDERS, ONCE_PREFIX, PACKS, isOnceOrder, offeredPacks, oncePackMode, packBySku, packEnd, packOfOrder, packSpanMs } from "../functions/lib/gpt-chat/packs";
import { PACK_RECEIPT_NAME, includedVat } from "../functions/lib/gpt-chat/fiscal-config";
import { paymeCheckoutUrl, paymeReceiptDetail } from "../functions/lib/gpt-chat/payme-checkout";
import { clickSignature } from "../functions/lib/gpt-chat/payment-protocol";
import { FiscalStore, fiscalizeDue } from "../functions/lib/gpt-chat/fiscal-store";
import { FiscalHealthStore } from "../functions/lib/gpt-chat/fiscal-health-store";
import { findOrder } from "../functions/lib/gpt-chat/guest-restore";
import { maintainBilling } from "../functions/lib/gpt-chat/billing-maintenance-store";
import { ensureStudioPaidSchema } from "../functions/lib/studio/store";
import { RUNTIME_CONFIG_KEYS } from "../functions/lib/runtime-config";
import { BILLING_SETTINGS } from "../scripts/release/live-gate";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { onRequestGet as account, onRequestPost as accountAction } from "../functions/api/gpt/account";
import { onRequestPost as clickRoute } from "../functions/api/payments/click";

type Fixture = Awaited<ReturnType<typeof billingFixture>>;
const ORIGIN = "https://gpt.test";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ONCE_TIYIN = 500_000;
const digits = () => String(randomBytes(4).readUInt32BE(0));
const txId = () => randomBytes(12).toString("hex");
const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

/** A fixture whose rehearsal session is offered the 3-day pack (GPT_PACK_ONCE "test"). */
async function onceFixture(flag: string | null = "test") {
  const f = await billingFixture();
  // null: the variable is not set at all.
  if (flag === null) delete f.env.GPT_PACK_ONCE;
  else f.env.GPT_PACK_ONCE = flag;
  f.env.GPT_GUEST_CHECKOUT = "true";
  f.env.GPT_BILLING_MAINTENANCE_SECRET = randomBytes(32).toString("hex");
  return f;
}

const checkout = (f: Fixture, body: Record<string, unknown>, cookie = f.testCookie, ip = "198.51.100.9") =>
  subscribe(f.ctx(new Request(`${ORIGIN}/api/gpt/subscribe`, {
    method: "POST",
    headers: { cookie, Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ requestId: randomUUID(), acceptTerms: true, termsVersion: f.env.GPT_BILLING_TERMS_VERSION, locale: "ru", ...body }),
  })));

const view = async (f: Fixture, cookie = f.testCookie) =>
  (await (await account(f.ctx(new Request(`${ORIGIN}/api/gpt/account`, { headers: { cookie } })))).json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A test Click order of the 3-day pack, opened through the route. */
async function onceClick(f: Fixture, body: Record<string, unknown> = {}, cookie = f.testCookie) {
  const response = await checkout(f, { provider: "click", sku: "once", ...body }, cookie);
  const answer = (await response.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { response, answer, id: String(answer.attemptId ?? "") };
}

/** Click's Prepare and Complete of one transaction, for the sum the page showed. */
async function clickPays(f: Fixture, order: string, amount = "5000.00") {
  const tx = digits();
  const doc = digits();
  const table = isOnceOrder(order) ? ONCE_ORDERS : "gpt_payment_orders";
  const prepare = await f.clickCall(order, "0", { click_trans_id: tx, click_paydoc_id: doc, amount });
  const seq = f.db.value(`SELECT seq FROM ${table} WHERE id=?`, order) as number;
  const complete = prepare.error === 0
    ? await f.clickCall(order, "1", { click_trans_id: tx, click_paydoc_id: doc, amount, merchant_prepare_id: String(seq) })
    : null;
  return { prepare, complete, tx, doc };
}

// ------------------------------------------------------------------ the catalog and the switch

test("the catalog: two packs, the 3-day one 5 000 UZS for 30 answers and 72 hours; an order's pack is read from its id", () => {
  assert.deepEqual(Object.keys(PACKS), ["month", "once"]);
  assert.deepEqual({ ...PACKS.month }, { sku: "month", amountTiyin: PRICE_TIYIN, answers: PAID_MESSAGES, term: { months: 1 }, planId: "ai_paket", receiptName: PACK_RECEIPT_NAME });
  assert.deepEqual({ ...PACKS.once }, { sku: "once", amountTiyin: ONCE_TIYIN, answers: 30, term: { hours: 72 }, planId: "ai_paket_once", receiptName: "AI paket 30 (xizmat, 3 kun)" });
  assert.equal(PRICE_TIYIN, 2_000_000);
  assert.ok(Object.isFrozen(PACKS) && Object.isFrozen(PACKS.once) && Object.isFrozen(PACKS.month));
  // The receipt line: a service, within Click's and Payme's 63 characters, none of the words a receipt must not carry.
  assert.ok(PACKS.once.receiptName.length <= 63);
  assert.doesNotMatch(PACKS.once.receiptName, /gpt|plus|pro\b|obuna|подписк/i);
  // A request names a pack by its sku only.
  assert.equal(packBySku("once"), PACKS.once);
  assert.equal(packBySku("month"), PACKS.month);
  for (const value of [undefined, null, "", "ONCE", "year", 5000, {}, ["once"]]) assert.equal(packBySku(value), null, String(value));
  // An order's pack and table follow from its id.
  assert.equal(ONCE_PREFIX, "pk_");
  assert.equal(ONCE_ORDERS, "gpt_payment_orders_v2");
  assert.equal(packOfOrder(`pk_${"a".repeat(32)}`), PACKS.once);
  for (const id of [`pay_${"a".repeat(32)}`, `uzm_${"a".repeat(32)}`, "anything"]) assert.equal(packOfOrder(id), PACKS.month, id);
  // The term: exactly 72 hours from the payment; the monthly pack its calendar month.
  const paid = Date.UTC(2026, 10, 17, 9, 30, 15, 250);
  assert.equal(packEnd(PACKS.once, paid), paid + 72 * HOUR);
  assert.equal(packEnd(PACKS.month, paid), addCalendarMonth(paid));
  assert.equal(packSpanMs(PACKS.once), 72 * HOUR);
  assert.equal(packSpanMs(PACKS.month), 31 * DAY);
});

test("GPT_PACK_ONCE: live sells to everyone, test only inside a rehearsal session, anything else to nobody; the name is a reviewed billing setting", () => {
  for (const [value, mode] of [["live", "live"], ["test", "test"], [" live ", "live"], ["off", null], ["", null], ["true", null], ["LIVE", null], [undefined, null]] as const)
    assert.equal(oncePackMode({ GPT_PACK_ONCE: value }), mode, String(value));
  assert.deepEqual(offeredPacks({ GPT_PACK_ONCE: "live" }, "live"), [PACKS.month, PACKS.once]);
  assert.deepEqual(offeredPacks({ GPT_PACK_ONCE: "live" }, "test"), [PACKS.month, PACKS.once]);
  assert.deepEqual(offeredPacks({ GPT_PACK_ONCE: "test" }, "test"), [PACKS.month, PACKS.once]);
  assert.deepEqual(offeredPacks({ GPT_PACK_ONCE: "test" }, "live"), [PACKS.month], "a test switch shows an ordinary visitor nothing");
  for (const value of ["off", "", undefined, "true"]) assert.deepEqual(offeredPacks({ GPT_PACK_ONCE: value }, "live"), [PACKS.month]);
  // Wired like every billing setting: hydrated from the packed config, refused as a Pages variable.
  assert.ok((RUNTIME_CONFIG_KEYS as readonly string[]).includes("GPT_PACK_ONCE"));
  assert.ok(BILLING_SETTINGS.has("GPT_PACK_ONCE"));
});

test("the committed configuration: the 3-day pack sells to everyone (live) or is taken back (off), the same in the packed config and in the table, under the offer edition that describes it", () => {
  const toml = read("wrangler.toml");
  const packed = JSON.parse(/GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(toml)![1]) as Record<string, string>;
  // "live" since offer edition v6. "off" is the rollback: the same value in both places, then a guarded deploy.
  const flag = packed.GPT_PACK_ONCE;
  assert.ok(flag === "live" || flag === "off", flag);
  assert.deepEqual([...toml.matchAll(/^GPT_PACK_ONCE = "([^"]*)"\r?$/gm)].map((match) => match[1]), [flag], "the table says what the packed config says");
  assert.equal([...toml.matchAll(/^GPT_PACK_ONCE = /gm)].length, 1);
  assert.deepEqual(offeredPacks({ GPT_PACK_ONCE: flag }, "live"), flag === "live" ? [PACKS.month, PACKS.once] : [PACKS.month]);
  // Both offers of that edition name the pack as its receipt does; the release gate refuses "live" otherwise
  // (scripts/release/live-gate.ts, tests/legal-oferta.test.ts).
  assert.equal(packed.GPT_BILLING_TERMS_VERSION, "ai-paket-2026-11-v6");
  for (const locale of ["ru", "uz"]) assert.ok(read(`content/pages/${locale}/oferta.json`).includes(PACKS.once.receiptName), locale);
});

// ------------------------------------------------------------------ the table

test("migrations/0085: additive, the same objects the runtime bootstrap makes, and a table that refuses any other sum for the 3-day pack", async () => {
  const migration = read("migrations/0085_gpt_once_pack.sql");
  const statements = migration.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").split(";").map((sql) => sql.replace(/\s+/g, " ").trim()).filter(Boolean);
  assert.deepEqual(statements, ONCE_BILLING_DDL.map((sql) => sql.replace(/\s+/g, " ").trim()), "the migration and the bootstrap are one text");
  for (const sql of statements) assert.match(sql, /^CREATE (TABLE|INDEX|UNIQUE INDEX|VIEW) IF NOT EXISTS /, sql.slice(0, 60));
  assert.doesNotMatch(statements.join(";"), /\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i, "nothing existing is touched");
  // The monthly pack's table is what it was: one sum, fixed.
  assert.ok(BILLING_DDL.some((sql) => /CREATE TABLE IF NOT EXISTS gpt_payment_orders \(/.test(sql) && /CHECK\(amount=2000000\)/.test(sql)));

  // A database the bootstrap alone has seen: the table, its three indexes and the view are there.
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  assert.equal(db.value("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('gpt_payment_orders_v2','idx_gpt_orders_v2_user','idx_gpt_orders_v2_pending','idx_gpt_orders_v2_statement','gpt_payment_orders_all2')"), 5);
  // And the migration file runs on it without an error (every statement is IF NOT EXISTS).
  db.exec(migration);
  const insert = (over: Record<string, unknown> = {}) => {
    const row = { org_id: BILLING_ORG, id: `pk_${randomBytes(16).toString("hex")}`, user_id: "u1", provider: "click", mode: "test", request_id: randomUUID(), sku: "once", amount: ONCE_TIYIN, currency: "UZS", state: "pending", created_at: 1, expires_at: 2, ...over };
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO gpt_payment_orders_v2(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`).bind(...Object.values(row)).runSync();
  };
  insert();
  assert.equal(db.value("SELECT COUNT(*) FROM gpt_payment_orders_v2"), 1);
  for (const [why, over] of [
    ["the monthly sum under the 3-day sku", { amount: PRICE_TIYIN }],
    ["one tiyin less", { amount: ONCE_TIYIN - 1 }],
    ["zero", { amount: 0 }],
    ["an id without pk_", { id: `pay_${randomBytes(16).toString("hex")}` }],
    ["Uzum", { provider: "uzum" }],
    ["another currency", { currency: "USD" }],
    ["an unknown state", { state: "done" }],
    ["another sku above the ceiling", { sku: "later", amount: 100_000_001 }],
  ] as const) assert.throws(() => insert(over), /CHECK constraint failed|constraint/i, why);
  // One open invoice per provider of an account, as in the monthly table.
  assert.throws(() => insert({ user_id: "u1", provider: "click" }), /UNIQUE constraint failed/);
  insert({ user_id: "u1", provider: "payme" });
});

// ------------------------------------------------------------------ the switch at the routes

test("off (the rollback value, and an absent one): the 3-day pack is a missing route, the account view names one pack, the monthly order is what it was", async () => {
  for (const flag of ["off", null, "true"]) {
    const f = await onceFixture(flag);
    const refused = await checkout(f, { provider: "click", sku: "once" });
    assert.equal(refused.status, 404, String(flag));
    assert.equal(((await refused.json()) as { code: string }).code, "not_found");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders_v2"), 0);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders"), 0, "a refused pack opens no order of the other one");
    const seen = await view(f);
    assert.equal(seen.pack.more, undefined, "the one-pack window");
    assert.equal(seen.packOffers, undefined);
    assert.deepEqual({ price: seen.pack.priceUzs, answers: seen.pack.messageLimit, months: seen.pack.months }, { price: 20000, answers: 300, months: 1 });
    // No sku is the monthly pack, as every client before this release sends; so is sku "month".
    const first = (await (await checkout(f, { provider: "click" })).json()) as { attemptId: string; amount: number; mode: string };
    assert.match(first.attemptId, /^pay_[0-9a-f]{32}$/);
    assert.equal(first.amount, PRICE_TIYIN);
    assert.deepEqual(f.db.rows("SELECT amount,provider,state FROM gpt_payment_orders").map((row) => ({ ...(row as object) })), [{ amount: PRICE_TIYIN, provider: "click", state: "pending" }]);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders_v2"), 0);
  }
});

test("a pack is named by a sku of the closed list: anything else is a bad request, and Uzum never takes the 3-day pack", async () => {
  const f = await onceFixture();
  for (const sku of ["ONCE", "year", "", 5000, null, { sku: "once" }]) {
    const response = await checkout(f, { provider: "click", sku });
    assert.equal(response.status, 400, JSON.stringify(sku));
  }
  assert.equal((await checkout(f, { provider: "uzum", sku: "once" })).status, 404);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders_v2") as number + (f.db.value("SELECT COUNT(*) FROM gpt_payment_orders") as number), 0);
  // sku "month" is the monthly pack in its own table.
  const month = (await (await checkout(f, { provider: "click", sku: "month" })).json()) as { attemptId: string };
  assert.match(month.attemptId, /^pay_/);
});

test("offered: the account view lists both packs, and a tap on the 3-day one opens an order of 5 000 UZS in its own table", async () => {
  const f = await onceFixture();
  const seen = await view(f);
  // Beside the monthly pack, inside the same field every card already reads.
  assert.deepEqual(seen.pack, { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: null,
    more: [{ sku: "once", priceUzs: 5000, messageLimit: 30, dailyLimit: 50, hours: 72, vat: null }] });
  // With the fiscal codes set, each offer carries the VAT inside its own price.
  Object.assign(f.env, { GPT_FISCAL_IKPU: "10305008002000000", GPT_FISCAL_PACKAGE_CODE: "1514296", GPT_FISCAL_VAT_PERCENT: "12", GPT_FISCAL_TIN: "310618348" });
  const taxed = await view(f);
  assert.deepEqual([taxed.pack.vat, taxed.pack.more[0].vat], [
    { percent: 12, includedTiyin: includedVat(PRICE_TIYIN, 12) }, { percent: 12, includedTiyin: includedVat(ONCE_TIYIN, 12) },
  ]);
  assert.equal(includedVat(ONCE_TIYIN, 12), 53_571);

  const { response, answer, id } = await onceClick(f);
  assert.equal(response.status, 200);
  assert.match(id, /^pk_[0-9a-f]{32}$/);
  assert.deepEqual({ mode: answer.mode, amount: answer.amount, currency: answer.currency }, { mode: "test", amount: ONCE_TIYIN, currency: "UZS" });
  assert.deepEqual({ ...(f.db.rows("SELECT sku,amount,currency,provider,mode,state,user_id FROM gpt_payment_orders_v2")[0] as object) },
    { sku: "once", amount: ONCE_TIYIN, currency: "UZS", provider: "click", mode: "test", state: "pending", user_id: f.user });
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders"), 0, "nothing in the monthly table");
  // The acceptance of the offer and the journal are the order's, as for any order.
  assert.equal(f.db.value("SELECT version FROM gpt_payment_consents WHERE order_id=?", id), f.env.GPT_BILLING_TERMS_VERSION);
  assert.equal(f.db.value("SELECT to_state FROM gpt_payment_journal WHERE order_id=? AND method='checkout'", id), "pending");
  // The view of the three tables finds it; the newest order of the account is this one, with its own pack.
  assert.equal(f.db.value("SELECT amount FROM gpt_payment_orders_all2 WHERE id=?", id), ONCE_TIYIN);
  const after = await view(f);
  assert.deepEqual({ id: after.payment.id, sku: after.payment.sku, priceUzs: after.payment.priceUzs, messageLimit: after.payment.messageLimit, state: after.payment.state, cancellable: after.payment.cancellable },
    { id, sku: "once", priceUzs: 5000, messageLimit: 30, state: "pending", cancellable: true });
});

// ------------------------------------------------------------------ Click

test("Click: Prepare and Complete for 5 000.00 open a pack of 30 answers for exactly 72 hours; any other sum is refused with an alert", async () => {
  const f = await onceFixture();
  const { id } = await onceClick(f);
  // The monthly sum on the 3-day order, and a tiyin off: -2, the order untouched.
  for (const amount of ["20000.00", "4999.99", "5000.01", "500000"]) {
    const wrong = await f.clickCall(id, "0", { amount });
    assert.equal(wrong.error, -2, amount);
  }
  assert.equal(f.db.value("SELECT state FROM gpt_payment_orders_v2 WHERE id=?", id), "pending");
  await Promise.all(f.background);
  assert.ok((f.db.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE code='click_amount_mismatch'") as number) >= 1);

  const before = Date.now();
  const paid = await clickPays(f, id);
  assert.equal(paid.prepare.error, 0);
  assert.equal(paid.complete?.error, 0);
  assert.equal(paid.complete?.merchant_trans_id, id);
  const row = f.db.rows<Record<string, unknown>>("SELECT state,external_id,provider_doc_id,perform_time FROM gpt_payment_orders_v2 WHERE id=?", id)[0];
  assert.deepEqual({ state: row.state, external_id: row.external_id, provider_doc_id: row.provider_doc_id }, { state: "paid", external_id: paid.tx, provider_doc_id: paid.doc });
  const period = f.db.rows<{ starts_at: number; ends_at: number; message_limit: number; user_id: string }>("SELECT starts_at,ends_at,message_limit,user_id FROM gpt_access_periods WHERE order_id=?", id)[0];
  assert.equal(period.message_limit, 30);
  assert.equal(period.ends_at - period.starts_at, 72 * HOUR, "72 hours to the millisecond");
  assert.ok(period.starts_at >= before && period.starts_at <= Date.now());
  assert.equal(period.user_id, f.user);
  // A test order is never printed, and it is said so on its receipt row.
  assert.deepEqual({ ...(f.db.rows("SELECT provider,last_error FROM gpt_fiscal_receipts WHERE order_id=?", id)[0] as object) }, { provider: "click", last_error: "skipped_test" });
  // Click's repeats: a second Complete and a new Prepare are "already" (-4), nothing is granted twice.
  assert.equal((await f.clickCall(id, "1", { click_trans_id: paid.tx, click_paydoc_id: paid.doc, amount: "5000.00", merchant_prepare_id: String(f.db.value("SELECT seq FROM gpt_payment_orders_v2 WHERE id=?", id)) })).error, -4);
  assert.equal((await f.clickCall(id, "0", { amount: "5000.00" })).error, -4);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE order_id=?", id), 1);
  // The pack is what a turn draws from.
  const access = await f.store.access(f.user, "test");
  assert.deepEqual({ order: access?.order_id, limit: access?.message_limit }, { order: id, limit: 30 });
});

test("Click: the monthly order still takes only 20 000.00, and one Click transaction never settles two orders across the two tables", async () => {
  const f = await onceFixture();
  // A monthly order refuses the 3-day sum.
  const month = (await (await checkout(f, { provider: "click" })).json()) as { attemptId: string };
  assert.equal((await f.clickCall(month.attemptId, "0", { amount: "5000.00" })).error, -2);
  const tx = digits();
  assert.equal((await f.clickCall(month.attemptId, "0", { click_trans_id: tx, amount: "20000.00" })).error, 0);
  // The same Click transaction id on an order of the other table: refused, whoever signs it.
  const other = await billingFixture();
  void other;
  const guest = await f.identity.login(randomBytes(32).toString("hex"));
  const cookie = `__Host-gpt_account=${guest}; ${f.rehearsal}`;
  const { id } = await onceClick(f, {}, cookie);
  assert.match(id, /^pk_/);
  assert.equal((await f.clickCall(id, "0", { click_trans_id: tx, amount: "5000.00" })).error, -8, "trans_reused");
  assert.equal(f.db.value("SELECT state FROM gpt_payment_orders_v2 WHERE id=?", id), "pending");
  // An unknown pk_ id is an unknown order, not a crash.
  assert.equal((await f.clickCall(`pk_${"0".repeat(32)}`, "0", { amount: "5000.00" })).error, -5);
});

// ------------------------------------------------------------------ Payme

test("Payme: the link, the receipt line and the transaction all carry the order's own 500 000 tiyin; the statement lists both packs in time order", async () => {
  const f = await onceFixture();
  Object.assign(f.env, { GPT_FISCAL_IKPU: "10305008002000000", GPT_FISCAL_PACKAGE_CODE: "1514296", GPT_FISCAL_VAT_PERCENT: "12", GPT_FISCAL_TIN: "310618348" });
  const response = await checkout(f, { provider: "payme", sku: "once", returnPath: "/ru/gpt-chat/" });
  const answer = (await response.json()) as { mode: string; checkoutUrl: string; attemptId: string };
  assert.equal(answer.mode, "checkout");
  const id = answer.attemptId;
  assert.match(id, /^pk_[0-9a-f]{32}$/);
  const page = new URL(answer.checkoutUrl);
  assert.equal(page.origin, "https://test.paycom.uz");
  const pairs = atob(page.pathname.slice(1)).split(";");
  assert.ok(pairs.includes(`a=${ONCE_TIYIN}`) && pairs.includes(`ac.order_id=${id}`) && pairs.includes(`m=${f.env.GPT_PAYME_MERCHANT_ID}`), pairs.join(";"));
  assert.ok(!pairs.includes(`a=${PRICE_TIYIN}`));
  assert.ok(!page.pathname.slice(1).includes("/"), "one path segment");

  // The sum is the order's: the monthly sum, or any other, is -31001.
  for (const amount of [PRICE_TIYIN, ONCE_TIYIN - 1, 5000, "500000"])
    assert.equal((await f.rpc("CheckPerformTransaction", { amount, account: { order_id: id } })).error?.code, -31001, String(amount));
  const check = await f.rpc("CheckPerformTransaction", { amount: ONCE_TIYIN, account: { order_id: id } });
  assert.deepEqual(check.result, {
    allow: true,
    detail: { receipt_type: 0, items: [{ title: "AI paket 30 (xizmat, 3 kun)", price: ONCE_TIYIN, count: 1, code: "10305008002000000", package_code: "1514296", vat_percent: 12 }] },
  });
  // The monthly order's receipt line is the one it always was.
  assert.deepEqual(paymeReceiptDetail(f.env)?.items[0], { title: PACK_RECEIPT_NAME, price: PRICE_TIYIN, count: 1, code: "10305008002000000", package_code: "1514296", vat_percent: 12 });
  assert.equal(paymeReceiptDetail(f.env, { id: `pay_${"a".repeat(32)}`, amount: PRICE_TIYIN })?.items[0].title, PACK_RECEIPT_NAME);
  // A row whose sum is not its pack's is never given a receipt line.
  assert.equal(paymeReceiptDetail(f.env, { id, amount: PRICE_TIYIN }), null);
  assert.equal(paymeReceiptDetail(f.env, { id: `pay_${"a".repeat(32)}`, amount: ONCE_TIYIN }), null);

  const tx = txId();
  const time = Date.now();
  const created = await f.rpc("CreateTransaction", { id: tx, time, amount: ONCE_TIYIN, account: { order_id: id } });
  assert.deepEqual({ transaction: created.result?.transaction, state: created.result?.state }, { transaction: id, state: 1 });
  // Payme's repeat of the same CreateTransaction is the same answer; another transaction on the order is -31008.
  assert.equal((await f.rpc("CreateTransaction", { id: tx, time, amount: ONCE_TIYIN, account: { order_id: id } })).result?.transaction, id);
  assert.equal((await f.rpc("CreateTransaction", { id: txId(), time, amount: ONCE_TIYIN, account: { order_id: id } })).error?.code, -31008);
  assert.equal((await f.rpc("CheckTransaction", { id: tx })).result?.state, 1);
  const performed = await f.rpc("PerformTransaction", { id: tx });
  assert.deepEqual({ transaction: performed.result?.transaction, state: performed.result?.state }, { transaction: id, state: 2 });
  assert.equal((await f.rpc("PerformTransaction", { id: tx })).result?.state, 2, "a repeat is the same answer");
  const period = f.db.rows<{ starts_at: number; ends_at: number; message_limit: number }>("SELECT starts_at,ends_at,message_limit FROM gpt_access_periods WHERE order_id=?", id)[0];
  assert.deepEqual({ limit: period.message_limit, span: period.ends_at - period.starts_at }, { limit: 30, span: 72 * HOUR });
  // Payme prints its own receipt: our queue holds no row for it.
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_fiscal_receipts WHERE order_id=?", id), 0);

  // A monthly Payme order of another account, created later: one statement, Payme's own order of time.
  const second = await f.identity.login(randomBytes(32).toString("hex"));
  const monthly = (await (await checkout(f, { provider: "payme" }, `__Host-gpt_account=${second}; ${f.rehearsal}`)).json()) as { attemptId: string };
  const tx2 = txId();
  assert.equal((await f.rpc("CreateTransaction", { id: tx2, time: time + 1000, amount: PRICE_TIYIN, account: { order_id: monthly.attemptId } })).result?.state, 1);
  const statement = await f.rpc("GetStatement", { from: time - 1, to: time + 5000 });
  assert.deepEqual(statement.result.transactions.map((row: { id: string; amount: number; account: { order_id: string } }) => [row.id, row.amount, row.account.order_id]),
    [[tx, ONCE_TIYIN, id], [tx2, PRICE_TIYIN, monthly.attemptId]]);
  // A refund of the 3-day pack by Payme closes its pack.
  assert.equal((await f.rpc("CancelTransaction", { id: tx, reason: 5 })).result?.state, -2);
  assert.equal(f.db.value("SELECT state FROM gpt_payment_orders_v2 WHERE id=?", id), "refunded");
  assert.ok((f.db.value("SELECT revoked_at FROM gpt_access_periods WHERE order_id=?", id) as number) > 0);
});

test("the Payme link: the order's sum whatever the page, never a slash, and no link for a sum that is not a positive whole number", () => {
  const env = { GPT_PAYME_MERCHANT_ID: "a".repeat(24) } as BillingEnv;
  const id = `pk_${"b".repeat(32)}`;
  for (const path of ["/ru/gpt-chat/", "/uz/gpt-uzbek-tilida/", "/uz/kirill-lotin/", "/ru/kalkulyator/", "/uz/ai-sher-yozish/"]) {
    const url = paymeCheckoutUrl(env, "live", id, "uz", `https://gptbot.uz${path}?pay=return`, ONCE_TIYIN)!;
    const segment = new URL(url).pathname.slice(1);
    assert.ok(!segment.includes("/"), path);
    assert.ok(atob(segment).split(";").includes(`a=${ONCE_TIYIN}`), path);
  }
  // Without an amount it is the monthly pack's, as every caller before this release passed nothing.
  assert.ok(atob(new URL(paymeCheckoutUrl(env, "live", `pay_${"b".repeat(32)}`, "ru", "https://gptbot.uz/ru/gpt-chat/?pay=return")!).pathname.slice(1)).split(";").includes(`a=${PRICE_TIYIN}`));
  for (const amount of [0, -1, 1.5, Number.NaN]) assert.equal(paymeCheckoutUrl(env, "live", id, "ru", "https://gptbot.uz/ru/gpt-chat/?pay=return", amount), null, String(amount));
});

// ------------------------------------------------------------------ choosing the other pack

test("the other pack: an invoice no provider has seen gives way silently; one a provider holds stays, and the new order waits for it", async () => {
  const f = await onceFixture();
  // Tapped 20 000 with Click, never reached Click, then tapped 5 000 with Click.
  const month = (await (await checkout(f, { provider: "click" })).json()) as { attemptId: string };
  const outbox = () => f.db.value("SELECT COUNT(*) FROM gpt_billing_outbox") as number;
  const quiet = outbox();
  const { response, id } = await onceClick(f);
  assert.equal(response.status, 200);
  assert.deepEqual({ ...(f.db.rows("SELECT state,reason FROM gpt_payment_orders WHERE id=?", month.attemptId)[0] as object) }, { state: "cancelled", reason: null });
  assert.equal(f.db.value("SELECT method FROM gpt_payment_journal WHERE order_id=? AND to_state='cancelled'", month.attemptId), "invoice_superseded");
  assert.equal(outbox(), quiet, "no notice to the owner: no money moved");
  // And back: 5 000 not yet seen by a provider, then 20 000 with Payme (another provider too).
  const back = await checkout(f, { provider: "payme" });
  assert.equal(back.status, 200);
  assert.equal(f.db.value("SELECT state FROM gpt_payment_orders_v2 WHERE id=?", id), "cancelled");
  assert.equal(f.db.value("SELECT method FROM gpt_payment_journal WHERE order_id=? AND to_state='cancelled'", id), "invoice_superseded");
  const payme = ((await back.json()) as { attemptId: string }).attemptId;

  // Payme holds the monthly invoice now (CreateTransaction): the 3-day pack waits for it, with either provider.
  assert.equal((await f.rpc("CreateTransaction", { id: txId(), time: Date.now(), amount: PRICE_TIYIN, account: { order_id: payme } })).result?.state, 1);
  for (const provider of ["click", "payme"]) {
    const held = await checkout(f, { provider, sku: "once" });
    assert.equal(held.status, 409, provider);
    assert.deepEqual(await held.json().then((body) => ({ code: (body as { code: string }).code, attemptId: (body as { attemptId: string }).attemptId, provider: (body as { provider: string }).provider })),
      { code: "pending_elsewhere", attemptId: payme, provider: "payme" });
  }
  assert.equal(f.db.value("SELECT state FROM gpt_payment_orders WHERE id=?", payme), "prepared", "the held invoice is not touched");
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders_v2 WHERE state IN ('pending','prepared')"), 0);
});

test("the same pack: the open invoice is reused, another provider waits (U7), and a request key belongs to one pack", async () => {
  const f = await onceFixture();
  const key = randomUUID();
  const first = await onceClick(f, { requestId: key });
  // The same key again, and a new key with the same provider: the same order.
  assert.equal((await onceClick(f, { requestId: key })).id, first.id);
  assert.equal((await onceClick(f)).id, first.id);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders_v2"), 1);
  // The same pack with the other provider while this invoice is open: the rule of the monthly pack.
  const elsewhere = await checkout(f, { provider: "payme", sku: "once" });
  assert.equal(elsewhere.status, 409);
  assert.equal(((await elsewhere.json()) as { code: string }).code, "pending_elsewhere");
  // The key of the 3-day order cannot open the monthly pack: a conflict, and nothing is closed for it.
  const conflict = await checkout(f, { provider: "click", requestId: key });
  assert.equal(conflict.status, 409);
  assert.equal(((await conflict.json()) as { code: string }).code, "pack_changed");
  assert.equal(f.db.value("SELECT state FROM gpt_payment_orders_v2 WHERE id=?", first.id), "pending");
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders"), 0);
  // The store says it the same way, both directions.
  const store = new BillingStore(f.binding, BILLING_ORG);
  await assert.rejects(store.createOrder(f.user, "click", "test", key, Date.now(), undefined, undefined, PACKS.month), /pack_conflict/);
  const monthKey = randomUUID();
  const other = await f.identity.login(randomBytes(32).toString("hex"));
  const otherUser = (await f.identity.user(new Request(ORIGIN, { headers: { cookie: `__Host-gpt_account=${other}` } })))!;
  const monthly = await store.createOrder(otherUser, "click", "test", monthKey);
  assert.match(monthly.id, /^pay_/);
  await assert.rejects(store.createOrder(otherUser, "click", "test", monthKey, Date.now(), undefined, undefined, PACKS.once), /pack_conflict/);
  // Uzum's store never makes a 3-day order.
  await assert.rejects(new BillingStore(f.binding, BILLING_ORG, "gpt_uzum_orders").createOrder(f.user, "uzum", "test", randomUUID(), Date.now(), undefined, "checkout", PACKS.once), /provider_table/);
  // An expired invoice of the other pack is closed as expired, and the new order opens.
  const stale = await store.createOrder(otherUser, "click", "test", randomUUID(), Date.now() + 13 * HOUR, undefined, undefined, PACKS.once);
  assert.match(stale.id, /^pk_/);
  assert.equal(f.db.value("SELECT method FROM gpt_payment_journal WHERE order_id=? AND to_state='cancelled'", monthly.id), "invoice_expired");
  void PendingElsewhereError;
});

// ------------------------------------------------------------------ two packs at once

test("two packs stack: each runs its own term, answers add up, turns draw from the one that ends first, and «ends soon» follows the pack that ends last", async () => {
  const f = await onceFixture();
  const store = new BillingStore(f.binding, BILLING_ORG);
  const pay = async (pack: typeof PACKS.month | typeof PACKS.once, at: number) => {
    const order = await store.createOrder(f.user, "click", "test", randomUUID(), at, undefined, undefined, pack);
    await store.transition(order.id, "prepared", "Prepare", { externalId: digits(), providerTime: at, now: at });
    await store.transition(order.id, "paid", "Complete", { now: at });
    return order.id;
  };
  const now = Date.now();
  // A monthly pack bought 10 days ago, then the 3-day pack an hour ago.
  const month = await pay(PACKS.month, now - 10 * DAY);
  const once = await pay(PACKS.once, now - HOUR);
  const periods = f.db.rows<{ order_id: string; starts_at: number; ends_at: number; message_limit: number }>("SELECT order_id,starts_at,ends_at,message_limit FROM gpt_access_periods ORDER BY starts_at");
  assert.deepEqual(periods.map((p) => ({ ...p })), [
    { order_id: month, starts_at: now - 10 * DAY, ends_at: addCalendarMonth(now - 10 * DAY), message_limit: 300 },
    { order_id: once, starts_at: now - HOUR, ends_at: now - HOUR + 72 * HOUR, message_limit: 30 },
  ]);
  // Nothing was shortened, restarted or merged; the 3-day pack ends first, so it is drawn first.
  assert.equal((await store.access(f.user, "test", now))?.order_id, once);
  assert.deepEqual((await store.usablePacks(f.user, "test", now)).map((p) => [p.order_id, p.remaining]), [[once, 30], [month, 300]]);
  const seen = await view(f);
  assert.deepEqual({ packs: seen.access.packs, total: seen.access.totalLimit, first: seen.access.order_id, firstRemaining: seen.access.firstRemaining, remaining: seen.access.remaining },
    { packs: 2, total: 330, first: once, firstRemaining: 30, remaining: 330 });
  assert.equal(seen.access.paidThrough, addCalendarMonth(now - 10 * DAY));
  assert.equal(seen.access.renewSoon, false, "the pack that ends last is the month, with weeks left");
  assert.deepEqual({ sku: seen.payment.sku, priceUzs: seen.payment.priceUzs }, { sku: "once", priceUzs: 5000 }, "the newest order");
  // Once the 3-day pack is over, the month goes on, untouched.
  assert.equal((await store.access(f.user, "test", now + 4 * DAY))?.order_id, month);
  // The subscription rows are test-free (live only), and the plan of each order would be its pack's.
  assert.equal(PACKS.once.planId, "ai_paket_once");
});

test("«ends soon»: the last day of a 3-day pack, the last three days of a month", async () => {
  const days = async (pack: typeof PACKS.month | typeof PACKS.once, ago: number) => {
    const f = await onceFixture();
    const store = new BillingStore(f.binding, BILLING_ORG);
    const at = Date.now() - ago;
    const order = await store.createOrder(f.user, "click", "test", randomUUID(), at, undefined, undefined, pack);
    await store.transition(order.id, "prepared", "Prepare", { externalId: digits(), providerTime: at, now: at });
    await store.transition(order.id, "paid", "Complete", { now: at });
    return (await view(f)).access?.renewSoon as boolean | undefined;
  };
  assert.equal(await days(PACKS.once, HOUR), false, "just bought: not at once");
  assert.equal(await days(PACKS.once, 47 * HOUR), false);
  assert.equal(await days(PACKS.once, 49 * HOUR), true, "the last 24 hours");
  assert.equal(await days(PACKS.month, 10 * DAY), false);
  const month = addCalendarMonth(Date.now()) - Date.now();
  assert.equal(await days(PACKS.month, month - 4 * DAY), false);
  assert.equal(await days(PACKS.month, month - 2 * DAY), true, "the last three days, as before");
});

test("an ended pack: no access, and the view says the account held one; an unpaid new invoice does not take that back, a refund does", async () => {
  const now = Date.now();
  const pay = async (f: Fixture, at: number) => {
    const store = new BillingStore(f.binding, BILLING_ORG);
    const order = await store.createOrder(f.user, "click", "test", randomUUID(), at, undefined, undefined, PACKS.once);
    await store.transition(order.id, "prepared", "Prepare", { externalId: digits(), providerTime: at, now: at });
    await store.transition(order.id, "paid", "Complete", { now: at });
    return order.id;
  };
  // A pack that runs needs no word: the view has its access.
  const running = await onceFixture();
  assert.equal((await view(running)).hadPack, undefined, "never bought");
  await pay(running, now - HOUR);
  const held = await view(running);
  assert.ok(held.access);
  assert.equal(held.hadPack, undefined);

  // Bought four days ago: the 72 hours are over. The newest order is the paid one, nothing runs.
  const f = await onceFixture();
  const paid = await pay(f, now - 4 * DAY);
  const ended = await view(f);
  assert.equal(ended.access, null);
  assert.deepEqual({ id: ended.payment.id, state: ended.payment.state }, { id: paid, state: "paid" });
  assert.equal(ended.hadPack, true);
  assert.equal(typeof ended.remaining, "number", "the free tier applies again");

  // A new invoice, left unpaid: the newest order is no longer the paid one, and the account still held a pack.
  const again = await new BillingStore(f.binding, BILLING_ORG).createOrder(f.user, "click", "test", randomUUID(), now, undefined, undefined, PACKS.once);
  const unpaid = await view(f);
  assert.deepEqual({ id: unpaid.payment.id, state: unpaid.payment.state }, { id: again.id, state: "pending" });
  assert.equal(unpaid.access, null);
  assert.equal(unpaid.hadPack, true);

  // The read is the account's own: not another account's, another mode's or another organisation's.
  const store = new BillingStore(f.binding, BILLING_ORG);
  assert.equal(await store.hadPack(f.user, "test"), true);
  assert.equal(await store.hadPack(`${f.user}-other`, "test"), false);
  assert.equal(await store.hadPack(f.user, "live"), false);
  assert.equal(await new BillingStore(f.binding, "another-org").hadPack(f.user, "test"), false);

  // A refund the Seller made revokes the period: the account held nothing.
  f.db.exec(`UPDATE gpt_access_periods SET revoked_at=${now} WHERE order_id='${paid}'`);
  assert.equal((await view(f)).hadPack, undefined);

  // A read that fails takes nothing down: the view goes without the word.
  assert.match(read("functions/api/gpt/account.ts"), /\.\.\.\(!access && \(await store\.hadPack\(user, context\)\.catch\(\(\) => false\)\) \? \{ hadPack: true \} : \{\}\),/);
});

// ------------------------------------------------------------------ the readers that must find it

test("a guest's 3-day pack: bought without signing in, kept by Telegram with its order, and found by support under either number", async () => {
  const f = await onceFixture();
  const bought = await checkout(f, { provider: "click", sku: "once" }, f.rehearsal, "198.51.100.31");
  assert.equal(bought.status, 200);
  const token = /__Host-gpt_account=([a-f0-9]{64})/.exec(bought.headers.get("Set-Cookie") || "")?.[1];
  assert.ok(token, "the guest's session cookie");
  const id = ((await bought.json()) as { attemptId: string }).attemptId;
  const paid = await clickPays(f, id);
  assert.equal(paid.complete?.error, 0);
  const guest = f.db.value("SELECT user_id FROM gpt_payment_orders_v2 WHERE id=?", id) as string;
  assert.ok(isGuestAccount(guest));
  // Support finds the order by our number, by Click's payment number and by Click's transaction id.
  for (const query of [id, paid.doc, paid.tx]) {
    const found = await findOrder(f.binding, query);
    assert.deepEqual({ id: found?.id, provider: found?.provider, user: found?.user_id, limit: found?.message_limit, doc: found?.provider_doc_id }, { id, provider: "click", user: guest, limit: 30, doc: paid.doc }, query);
  }
  // A monthly order is still found the same way.
  const month = await new BillingStore(f.binding, BILLING_ORG).createOrder(f.user, "payme", "test", randomUUID());
  assert.equal((await findOrder(f.binding, month.id))?.id, month.id);

  // Signing in through Telegram from that browser: the order, its pack and its acceptance move.
  const hash = randomBytes(32).toString("hex");
  await f.identity.login(hash);
  const telegram = f.db.value("SELECT id FROM gpt_accounts WHERE identity_hash=?", hash) as string;
  await new IdentityStore(f.binding, BILLING_ORG).adoptGuest(new Request(ORIGIN, { headers: { cookie: `__Host-gpt_account=${token}` } }), hash);
  assert.equal(f.db.value("SELECT user_id FROM gpt_payment_orders_v2 WHERE id=?", id), telegram);
  assert.equal(f.db.value("SELECT user_id FROM gpt_access_periods WHERE order_id=?", id), telegram);
  assert.equal(f.db.value("SELECT user_id FROM gpt_payment_consents WHERE order_id=?", id), telegram);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_auth_sessions WHERE user_id=?", guest), 0, "the guest account is left with no session");
  assert.equal((await new BillingStore(f.binding, BILLING_ORG).access(telegram, "test"))?.order_id, id);
});

test("a guest's open 3-day invoice that a provider holds keeps the guest account in place: sign-in does not strand it", async () => {
  const f = await onceFixture();
  const bought = await checkout(f, { provider: "click", sku: "once" }, f.rehearsal, "198.51.100.32");
  const token = /__Host-gpt_account=([a-f0-9]{64})/.exec(bought.headers.get("Set-Cookie") || "")![1];
  const id = ((await bought.json()) as { attemptId: string }).attemptId;
  const hash = randomBytes(32).toString("hex");
  const session = await f.identity.login(hash);
  const telegram = f.db.value("SELECT id FROM gpt_accounts WHERE identity_hash=?", hash) as string;
  // The Telegram account has its own 3-day invoice at Click, and Click has taken it up.
  const own = await onceClick(f, {}, `__Host-gpt_account=${session}; ${f.rehearsal}`);
  assert.equal((await f.clickCall(own.id, "0", { amount: "5000.00" })).error, 0);
  await assert.rejects(new IdentityStore(f.binding, BILLING_ORG).adoptGuest(new Request(ORIGIN, { headers: { cookie: `__Host-gpt_account=${token}` } }), hash), /guest_not_moved/);
  assert.notEqual(f.db.value("SELECT user_id FROM gpt_payment_orders_v2 WHERE id=?", id), telegram);
  assert.equal(f.db.value("SELECT state FROM gpt_payment_orders_v2 WHERE id=?", own.id), "prepared");
});

test("Click prints the 3-day pack's receipt from its own table: one line named after the pack, for 5 000, and the owner is told the sum", async (t) => {
  const f = await onceFixture("live");
  const live = { service_id: 41001, merchant_id: 32002, secret_key: randomBytes(16).toString("hex"), merchant_user_id: 50003 };
  Object.assign(f.env, liveSettings(), { GPT_BILLING_MODE_CLICK: "live", GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ live }) });
  const { fake, restore } = fakeClickMerchant([{ serviceId: String(live.service_id), merchantUserId: String(live.merchant_user_id), secretKey: live.secret_key }]);
  t.after(restore);
  const store = new BillingStore(f.binding, BILLING_ORG);
  const order = await store.createOrder(f.user, "click", "live", randomUUID(), Date.now(), undefined, undefined, PACKS.once);
  assert.match(order.id, /^pk_[0-9a-f]{32}$/);
  assert.equal(order.amount, ONCE_TIYIN);
  const paymentId = fake.pay(order.id, Date.now());
  // Prepare and Complete through the route, signed as Click signs them, for 5 000.00.
  const tx = digits();
  const call = async (action: "0" | "1") => {
    const p = {
      // Click's payment id is the click_paydoc_id it sends (live service, 22.11.2026).
      click_trans_id: tx, click_paydoc_id: String(paymentId), service_id: String(live.service_id), merchant_trans_id: order.id, amount: "5000.00", action,
      sign_time: "2026-11-17 14:00:00", error: "0", ...(action === "1" ? { merchant_prepare_id: String(order.seq) } : {}),
    };
    const body = new URLSearchParams({ ...p, sign_string: clickSignature(p, live.secret_key) });
    return (await (await clickRoute(f.ctx(new Request("https://gptbot.uz/api/payments/click", { method: "POST", body })))).json()) as { error: number };
  };
  assert.equal((await call("0")).error, 0);
  assert.equal((await call("1")).error, 0);
  await Promise.all(f.background);
  // Queued for a live order, and the reader finds it in its own table.
  const facts = await new FiscalStore(f.binding, BILLING_ORG).clickOrder(order.id);
  assert.deepEqual({ id: facts?.id, state: facts?.state, mode: facts?.mode, amount: facts?.amount }, { id: order.id, state: "paid", mode: "live", amount: ONCE_TIYIN });
  assert.equal(f.db.value("SELECT status_code FROM gpt_fiscal_receipts WHERE order_id=? AND kind='PERFORM'", order.id), -1);
  // The owner's health summary counts it while it waits (a 3-day order is a chat order).
  await ensureStudioPaidSchema(f.binding);
  assert.deepEqual((await new FiscalHealthStore(f.binding).pending(BILLING_ORG)).map((row) => [row.product, row.provider, row.queued]), [["chat", "click", 1]]);
  // Ten minutes after the payment Click still has no receipt of its own: ours goes out.
  const paidAt = (await store.order(order.id))!.perform_time;
  await fiscalizeDue(f.env, { now: paidAt + 10 * 60_000 });
  const submit = fake.calls.find((entry) => entry.method === "POST" && entry.path.includes("submit_items"));
  assert.ok(submit, "our receipt line was sent");
  assert.deepEqual(submit!.body, {
    service_id: live.service_id,
    payment_id: paymentId,
    items: [{ Name: "AI paket 30 (xizmat, 3 kun)", SPIC: "10305008002000000", PackageCode: "1514296", Price: ONCE_TIYIN, Amount: 1, VAT: 53_571, VATPercent: 12, CommissionInfo: { TIN: "310618348" } }],
    received_ecash: 0,
    received_cash: 0,
    received_card: ONCE_TIYIN,
  });
  assert.equal(f.db.value("SELECT status_code FROM gpt_fiscal_receipts WHERE order_id=? AND kind='PERFORM'", order.id), 0, "printed");
  // A live pack is a subscription row of its own plan, and the owner's notice names the sum that was paid.
  assert.equal(f.db.value("SELECT plan FROM gpt_subscriptions WHERE id=?", order.id), "ai_paket_once");
  await maintainBilling(f.env);
  assert.ok(fake.telegram.some((text) => text.includes(`AI paket: paid\nclick · 5 000 UZS\n${order.id}`)), JSON.stringify(fake.telegram));
  assert.ok(!fake.telegram.some((text) => text.includes("20 000 UZS")));
});

test("the account closes its own open 3-day invoice while no provider has seen it; one a provider holds is left alone", async () => {
  const f = await onceFixture();
  const close = (orderId: string) => accountAction(f.ctx(new Request(`${ORIGIN}/api/gpt/account`, {
    method: "POST",
    headers: { cookie: f.testCookie, Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cancel_invoice", orderId }),
  })));
  const first = await onceClick(f);
  assert.equal((await close(first.id)).status, 200);
  assert.equal(f.db.value("SELECT state FROM gpt_payment_orders_v2 WHERE id=?", first.id), "cancelled");
  assert.equal(f.db.value("SELECT method FROM gpt_payment_journal WHERE order_id=? AND to_state='cancelled'", first.id), "invoice_cancelled");
  // Closed, so the other provider opens at once.
  const second = await checkout(f, { provider: "payme", sku: "once" });
  assert.equal(second.status, 200);
  const id = ((await second.json()) as { attemptId: string }).attemptId;
  assert.notEqual(id, first.id);
  // Payme takes it up: the account can no longer close it.
  assert.equal((await f.rpc("CreateTransaction", { id: txId(), time: Date.now(), amount: ONCE_TIYIN, account: { order_id: id } })).result?.state, 1);
  const held = await close(id);
  assert.equal(held.status, 409);
  assert.equal(((await held.json()) as { code: string }).code, "invoice_in_progress");
  assert.equal(f.db.value("SELECT state FROM gpt_payment_orders_v2 WHERE id=?", id), "prepared");
  // Another account's invoice is not found.
  const stranger = await f.identity.login(randomBytes(32).toString("hex"));
  const theirs = await accountAction(f.ctx(new Request(`${ORIGIN}/api/gpt/account`, {
    method: "POST",
    headers: { cookie: `__Host-gpt_account=${stranger}; ${f.rehearsal}`, Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cancel_invoice", orderId: id }),
  })));
  assert.equal(theirs.status, 404);
});

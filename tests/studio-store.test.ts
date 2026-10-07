// The paid studio's order store (functions/lib/studio/store.ts; BUILD-PLAN
// 07.10.2026 stream B, DECISIONS §4, §12; spec §9): every transition of a
// studio order is one D1 batch guarded by the order's version and journaled
// in gpt_payment_journal; what a payment gives and a refund takes away.
// Real SQLite (tests/helpers/sqlite-d1.ts); no remote database.
// Run: node --import tsx --test tests/studio-store.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteD1 } from "./helpers/sqlite-d1";
import {
  CONSENT,
  DAY,
  EDITION,
  EDITION_VERSION,
  HOUR,
  NOW,
  editionPlan,
  journal,
  paidDatabase,
  paidOrder,
  pendingOrder,
  randomHex,
  requestId,
} from "./helpers/studio-paid";
import {
  REFUND_METHODS,
  STUDIO_ORDER_ID,
  StudioStore,
  StudioStoreError,
  refundReceiptState,
  unusedUnits,
  type StudioOrder,
} from "../functions/lib/studio/store";
import { FISCAL_QUEUED, FISCAL_SKIPPED, FiscalStore } from "../functions/lib/gpt-chat/fiscal-store";
import { addCalendarMonth } from "../functions/lib/gpt-chat/billing-config";
import { REFUND_WINDOW_MS, STUDIO_ORDER_TTL_MS, refundValueTiyin } from "../functions/lib/studio/plans";
import { STUDIO_ORG } from "../functions/lib/studio/schema";

const PAYME_TX = "6f00a1b2c3d4e5f6a7b8c9d0";

const store = (db: SqliteD1) => new StudioStore(db.asD1());

async function refused(promise: Promise<unknown>, code: string): Promise<StudioStoreError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof StudioStoreError, String(error));
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected ${code}`);
}

const count = (db: SqliteD1, sql: string, ...params: unknown[]) => Number(db.value(sql, ...params));

// ── createOrder ─────────────────────────────────────────────────────────────

test("an order: the price of the edition's quota version, pending for 12 hours, journaled with the offer acceptance", async () => {
  const db = await paidDatabase();
  const id = requestId();
  const made = await store(db).createOrder({
    userId: "acct_studio_a", plan: "kunlik", termsVersion: EDITION, provider: "payme", serviceId: null, mode: "live",
    requestId: id, consent: { version: EDITION, url: "https://gptbot.uz/uz/ommaviy-oferta/", locale: "uz" }, now: NOW,
  });
  assert.equal(made.kind, "created");
  const order = made.order;
  assert.match(order.id, STUDIO_ORDER_ID);
  assert.deepEqual(
    {
      user: order.user_id, plan: order.plan, version: order.plan_version, terms: order.terms_version, provider: order.provider,
      service: order.service_id, mode: order.mode, request: order.request_id, amount: order.amount, currency: order.currency,
      state: order.state, created: order.created_at, expires: order.expires_at, ga4: order.ga4_state, owner: order.owner_test,
    },
    {
      user: "acct_studio_a", plan: "kunlik", version: EDITION_VERSION, terms: EDITION, provider: "payme", service: null,
      mode: "live", request: id, amount: 590_000, currency: "UZS", state: "pending", created: NOW,
      expires: NOW + STUDIO_ORDER_TTL_MS, ga4: "none", owner: 0,
    },
  );
  assert.equal(STUDIO_ORDER_TTL_MS, 12 * HOUR);
  assert.deepEqual(journal(db, order.id), [{ actor: "account", method: "studio_checkout", from_state: null, to_state: "pending" }]);
  const consent = db.rows("SELECT user_id, version, url, locale, accepted_at FROM gpt_payment_consents WHERE org_id=? AND order_id=?", STUDIO_ORG, order.id);
  assert.deepEqual({ ...(consent[0] as object) }, { user_id: "acct_studio_a", version: EDITION, url: "https://gptbot.uz/uz/ommaviy-oferta/", locale: "uz", accepted_at: NOW });
  const oylik = await pendingOrder(db, { userId: "acct_studio_b", plan: "oylik" });
  assert.equal(oylik.amount, 3_990_000);
});

test("an edition that sells no studio tariff is refused before anything is written", async () => {
  const db = await paidDatabase();
  for (const termsVersion of ["ai-paket-2026-10-v2", "", "__proto__", "constructor"])
    await refused(store(db).createOrder({ userId: "acct_studio_a", plan: "oylik", termsVersion, provider: "payme", serviceId: null, mode: "live", requestId: requestId(), consent: CONSENT, now: NOW }), "terms_unsold");
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_orders_v2"), 0);
  assert.equal(count(db, "SELECT COUNT(*) FROM gpt_payment_journal"), 0);
});

test("the attribution the order keeps: sanitized ids and tags only", async () => {
  const db = await paidDatabase();
  const order = await pendingOrder(db, {
    attribution: {
      touch: "last", gclid: "Cj0KCQ-abc_1", gbraid: null, wbraid: null, yclid: "778899", utmSource: "google", utmMedium: "cpc",
      utmCampaign: "studio_uz", utmTerm: "taqdimot", utmContent: null, landingPath: "/uz/taqdimot-ai/", referrerHost: "www.google.com",
      firstSeenAt: "2026-10-01T10:00:00.000Z", gaClientId: "123.456", gaSessionId: "1760000000", ymClientId: "17600000001",
    },
  });
  const row = db.rows<Record<string, unknown>>(
    "SELECT touch, gclid, yclid, utm_source, utm_medium, utm_campaign, utm_term, landing_path, referrer_host, first_seen_at, ga_client_id, ga_session_id, ym_client_id FROM studio_orders_v2 WHERE id=?",
    order.id,
  )[0];
  assert.deepEqual({ ...row }, {
    touch: "last", gclid: "Cj0KCQ-abc_1", yclid: "778899", utm_source: "google", utm_medium: "cpc", utm_campaign: "studio_uz",
    utm_term: "taqdimot", landing_path: "/uz/taqdimot-ai/", referrer_host: "www.google.com", first_seen_at: "2026-10-01T10:00:00.000Z",
    ga_client_id: "123.456", ga_session_id: "1760000000", ym_client_id: "17600000001",
  });
});

test("the same request id is the same order; with another plan, provider or mode it is refused", async () => {
  const db = await paidDatabase();
  const id = requestId();
  const input = { userId: "acct_studio_a", plan: "oylik" as const, termsVersion: EDITION, provider: "payme" as const, serviceId: null, mode: "live" as const, requestId: id, consent: CONSENT, now: NOW };
  const first = await store(db).createOrder(input);
  const again = await store(db).createOrder({ ...input, now: NOW + 5_000 });
  assert.equal(again.kind, "replayed");
  assert.equal(again.order.id, first.order.id);
  await refused(store(db).createOrder({ ...input, plan: "kunlik" }), "idempotency_conflict");
  await refused(store(db).createOrder({ ...input, provider: "click", serviceId: "1" }), "idempotency_conflict");
  // Even after the order closed, its request id stays its own.
  await store(db).cancel(first.order.id, { method: "invoice_cancelled", now: NOW + 10_000 });
  const closed = await store(db).createOrder({ ...input, now: NOW + 20_000 });
  assert.equal(closed.kind, "replayed");
  assert.equal(closed.order.state, "cancelled");
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_orders_v2"), 1);
});

test("one open order per buyer: the same tariff is the same invoice, another is order_open; an expired one is closed first", async () => {
  const db = await paidDatabase();
  const open = await pendingOrder(db, { userId: "acct_studio_a", plan: "oylik" });
  const same = await store(db).createOrder({ userId: "acct_studio_a", plan: "oylik", termsVersion: EDITION, provider: "payme", serviceId: null, mode: "live", requestId: requestId(), consent: CONSENT, now: NOW + HOUR });
  assert.equal(same.kind, "open");
  assert.equal(same.order.id, open.id);
  const other = await refused(store(db).createOrder({ userId: "acct_studio_a", plan: "kunlik", termsVersion: EDITION, provider: "payme", serviceId: null, mode: "live", requestId: requestId(), consent: CONSENT, now: NOW + HOUR }), "order_open");
  assert.equal(other.order?.id, open.id);
  // A test-mode order is another slot (a local rehearsal).
  const test = await pendingOrder(db, { userId: "acct_studio_a", plan: "kunlik", mode: "test" });
  assert.equal(test.state, "pending");
  // Twelve hours later the open order has expired: it is closed (reason 4) and a new one opens.
  const later = NOW + STUDIO_ORDER_TTL_MS + 1;
  const fresh = await store(db).createOrder({ userId: "acct_studio_a", plan: "kunlik", termsVersion: EDITION, provider: "payme", serviceId: null, mode: "live", requestId: requestId(), consent: CONSENT, now: later });
  assert.equal(fresh.kind, "created");
  const expired = (await store(db).byId(open.id))!;
  assert.equal(expired.state, "cancelled");
  assert.equal(expired.reason, 4);
  assert.equal(expired.cancel_time, later);
  assert.deepEqual(journal(db, open.id).at(-1), { actor: "system", method: "invoice_expired", from_state: "pending", to_state: "cancelled" });
});

test("two tabs ordering at once never leave two open orders of one buyer", async () => {
  const db = await paidDatabase();
  const tries = await Promise.allSettled(
    ["oylik", "kunlik", "oylik", "kunlik"].map((plan) =>
      store(db).createOrder({ userId: "acct_studio_a", plan: plan as "oylik" | "kunlik", termsVersion: EDITION, provider: "payme", serviceId: null, mode: "live", requestId: requestId(), consent: CONSENT, now: NOW })),
  );
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_orders_v2 WHERE state IN ('pending','prepared')"), 1);
  for (const outcome of tries) {
    if (outcome.status === "rejected") assert.equal((outcome.reason as StudioStoreError).code, "order_open");
  }
});

// ── prepare / markPaid / cancel ─────────────────────────────────────────────

test("prepare: the provider's transaction takes the order up; a repeat is the same; another transaction or order is refused", async () => {
  const db = await paidDatabase();
  const order = await pendingOrder(db);
  const providerTime = NOW + 30_000;
  const prepared = await store(db).prepare(order.id, { externalId: PAYME_TX, providerTime, method: "payme_create", now: NOW + 31_000 });
  assert.equal(prepared.state, "prepared");
  assert.equal(prepared.external_id, PAYME_TX);
  assert.equal(prepared.provider_time, providerTime);
  assert.equal(prepared.create_time, NOW + 31_000);
  // A Payme order's time runs from Payme's own transaction time.
  assert.equal(prepared.expires_at, providerTime + STUDIO_ORDER_TTL_MS);
  assert.equal(prepared.version, order.version + 1);
  const again = await store(db).prepare(order.id, { externalId: PAYME_TX, providerTime, method: "payme_create", now: NOW + 40_000 });
  assert.equal(again.version, prepared.version);
  assert.equal(journal(db, order.id).length, 2);
  await refused(store(db).prepare(order.id, { externalId: "7f00a1b2c3d4e5f6a7b8c9d0", providerTime, method: "payme_create" }), "conflict");
  const second = await pendingOrder(db, { userId: "acct_studio_b" });
  await refused(store(db).prepare(second.id, { externalId: PAYME_TX, providerTime, method: "payme_create" }), "external_taken");
  assert.equal((await store(db).byExternal("payme", "live", PAYME_TX))?.id, order.id);
  assert.equal(await store(db).byExternal("payme", "test", PAYME_TX), null);
  assert.equal(await store(db).byExternal("click", "live", PAYME_TX), null);
  await refused(store(db).prepare("stu_00000000000000000000000000000000", { externalId: "x", providerTime, method: "payme_create" }), "not_found");
});

test("prepare of a Click order keeps the payment number once and the order's own time", async () => {
  const db = await paidDatabase();
  const order = await pendingOrder(db, { provider: "click", serviceId: "107999" });
  const prepared = await store(db).prepare(order.id, { externalId: "4100200", docId: "5100300", providerTime: NOW, method: "click_prepare", now: NOW });
  assert.equal(prepared.provider_doc_id, "5100300");
  assert.equal(prepared.expires_at, order.expires_at);
  await store(db).setDocId(order.id, "9999999");
  assert.equal((await store(db).byId(order.id))?.provider_doc_id, "5100300");
  assert.deepEqual((await store(db).byDocId("5100300")).map((row) => row.id), [order.id]);
});

test("markPaid: the entitlement of the order's quota version, the sale's receipt row and the GA4 mark, in one move", async () => {
  const db = await paidDatabase();
  const order = await pendingOrder(db, { plan: "kunlik" });
  await store(db).prepare(order.id, { externalId: PAYME_TX, providerTime: NOW, method: "payme_create", now: NOW });
  const paidAt = NOW + 60_000;
  const { order: paid, entitlement } = await store(db).markPaid(order.id, { method: "payme_perform", now: paidAt });
  assert.equal(paid.state, "paid");
  assert.equal(paid.perform_time, paidAt);
  assert.equal(paid.ga4_state, "pending");
  assert.deepEqual(
    { id: entitlement.id, order: entitlement.order_id, user: entitlement.user_id, mode: entitlement.mode, plan: entitlement.plan, version: entitlement.plan_version, starts: entitlement.starts_at, ends: entitlement.ends_at, presentations: entitlement.presentations_limit, photos: entitlement.photos_limit, revoked: entitlement.revoked_at },
    { id: order.id, order: order.id, user: order.user_id, mode: "live", plan: "kunlik", version: EDITION_VERSION, starts: paidAt, ends: paidAt + 24 * HOUR, presentations: editionPlan("kunlik").presentationFull, photos: editionPlan("kunlik").photoTask, revoked: null },
  );
  // Payme prints and reports its own receipt (SetFiscalData): our queue never claims this row.
  const receipt = db.rows<Record<string, unknown>>("SELECT kind, provider, status_code, last_error FROM gpt_fiscal_receipts WHERE org_id=? AND order_id=?", STUDIO_ORG, order.id);
  assert.deepEqual(receipt.map((row) => ({ ...row })), [{ kind: "PERFORM", provider: "payme", status_code: FISCAL_QUEUED, last_error: null }]);
  assert.equal(await new FiscalStore(db.asD1(), STUDIO_ORG).claim(paidAt + DAY), null);
  assert.deepEqual(journal(db, order.id).map((row) => [row.actor, row.method, row.from_state, row.to_state]), [
    ["account", "studio_checkout", null, "pending"],
    ["payme", "payme_create", "pending", "prepared"],
    ["payme", "payme_perform", "prepared", "paid"],
  ]);
  // A repeat (Payme asks again) gives the same order and entitlement, nothing new.
  const again = await store(db).markPaid(order.id, { method: "payme_perform", now: paidAt + 5_000 });
  assert.equal(again.entitlement.ends_at, entitlement.ends_at);
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_entitlements"), 1);
  assert.equal(journal(db, order.id).length, 3);
});

test("markPaid: Oylik runs one calendar month; a Click sale in live waits for our receipt queue, a test one is skipped", async () => {
  const db = await paidDatabase();
  const jan31 = Date.UTC(2027, 0, 31, 10);
  const live = await paidOrder(db, { provider: "click", serviceId: "107999", paidAt: jan31 });
  const ent = db.rows<{ ends_at: number; presentations_limit: number; photos_limit: number }>("SELECT ends_at, presentations_limit, photos_limit FROM studio_entitlements WHERE id=?", live.id)[0];
  assert.equal(ent.ends_at, addCalendarMonth(jan31));
  assert.equal(new Date(ent.ends_at).toISOString().slice(0, 10), "2027-02-28");
  assert.deepEqual([ent.presentations_limit, ent.photos_limit], [10, editionPlan("oylik").photoTask]);
  const test = await paidOrder(db, { userId: "acct_studio_t", provider: "click", serviceId: "107999", mode: "test" });
  const rows = db.rows<{ order_id: string; provider: string; status_code: number; last_error: string | null }>("SELECT order_id, provider, status_code, last_error FROM gpt_fiscal_receipts ORDER BY rowid");
  assert.deepEqual(rows.map((row) => [row.order_id, row.provider, row.status_code, row.last_error]), [
    [live.id, "click", FISCAL_QUEUED, null],
    [test.id, "click", FISCAL_SKIPPED, "skipped_test"],
  ]);
  // A test sale never goes to GA4.
  assert.equal(test.ga4_state, "none");
  assert.equal(live.ga4_state, "pending");
});

test("markPaid gives the quotas of the order's own quota version, whatever is sold now", async () => {
  const db = await paidDatabase();
  const order = await pendingOrder(db, { plan: "oylik" });
  // The order was made under the presentations-only edition (DECISIONS §13 п. 8).
  db.exec(`UPDATE studio_orders_v2 SET plan_version='studio-2026-10-decks-v1' WHERE id='${order.id}'`);
  await store(db).prepare(order.id, { externalId: PAYME_TX, providerTime: NOW, method: "payme_create", now: NOW });
  const { entitlement } = await store(db).markPaid(order.id, { method: "payme_perform", now: NOW });
  assert.deepEqual([entitlement.plan_version, entitlement.presentations_limit, entitlement.photos_limit], ["studio-2026-10-decks-v1", 10, 0]);
  // An unknown quota version is never paid blindly.
  const odd = await pendingOrder(db, { userId: "acct_studio_odd" });
  db.exec(`UPDATE studio_orders_v2 SET plan_version='studio-1999-v0' WHERE id='${odd.id}'`);
  await store(db).prepare(odd.id, { externalId: "7f00a1b2c3d4e5f6a7b8c9d0", providerTime: NOW, method: "payme_create", now: NOW });
  await refused(store(db).markPaid(odd.id, { method: "payme_perform", now: NOW }), "plan_unknown");
  assert.equal((await store(db).byId(odd.id))?.state, "prepared");
});

test("markPaid only from prepared: a pending, cancelled or refunded order is refused", async () => {
  const db = await paidDatabase();
  const pending = await pendingOrder(db);
  await refused(store(db).markPaid(pending.id, { method: "payme_perform", now: NOW }), "state");
  await store(db).cancel(pending.id, { method: "payme_cancel", reason: 3, now: NOW });
  await refused(store(db).markPaid(pending.id, { method: "payme_perform", now: NOW }), "state");
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_entitlements"), 0);
});

test("two payments of one order at once: one entitlement, one 'paid' in the journal", async () => {
  const db = await paidDatabase();
  const order = await pendingOrder(db);
  await store(db).prepare(order.id, { externalId: PAYME_TX, providerTime: NOW, method: "payme_create", now: NOW });
  const results = await Promise.all([1, 2, 3].map((n) => store(db).markPaid(order.id, { method: "payme_perform", now: NOW + n })));
  assert.equal(new Set(results.map((result) => result.entitlement.ends_at)).size, 1);
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_entitlements"), 1);
  assert.equal(count(db, "SELECT COUNT(*) FROM gpt_fiscal_receipts"), 1);
  assert.equal(journal(db, order.id).filter((row) => row.to_state === "paid").length, 1);
});

test("a move that lost its race writes nothing: the journal guard rolls the whole batch back", async () => {
  const db = await paidDatabase();
  const order = await pendingOrder(db);
  await store(db).prepare(order.id, { externalId: PAYME_TX, providerTime: NOW, method: "payme_create", now: NOW });
  // Another request moves the order between our read and our batch, every time.
  const d1 = db.asD1();
  const racing = {
    prepare: d1.prepare.bind(d1),
    batch: async (statements: D1PreparedStatement[]) => {
      db.exec(`UPDATE studio_orders_v2 SET version=version+1 WHERE id='${order.id}'`);
      return d1.batch(statements);
    },
  } as unknown as D1Database;
  await refused(new StudioStore(racing).markPaid(order.id, { method: "payme_perform", now: NOW }), "busy");
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_entitlements"), 0);
  assert.equal(count(db, "SELECT COUNT(*) FROM gpt_fiscal_receipts"), 0);
  assert.equal((await store(db).byId(order.id))?.state, "prepared");
  assert.equal(journal(db, order.id).length, 2);
  // Losing once is fine: the move reads again and lands.
  let races = 1;
  const once = {
    prepare: d1.prepare.bind(d1),
    batch: async (statements: D1PreparedStatement[]) => {
      if (races-- > 0) db.exec(`UPDATE studio_orders_v2 SET version=version+1 WHERE id='${order.id}'`);
      return d1.batch(statements);
    },
  } as unknown as D1Database;
  const { order: paid } = await new StudioStore(once).markPaid(order.id, { method: "payme_perform", now: NOW });
  assert.equal(paid.state, "paid");
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_entitlements"), 1);
});

test("cancel: pending or prepared → cancelled with the reason; a closed order is answered as it is; a paid one is not cancelled", async () => {
  const db = await paidDatabase();
  const order = await pendingOrder(db);
  await store(db).prepare(order.id, { externalId: PAYME_TX, providerTime: NOW, method: "payme_create", now: NOW });
  const cancelled = await store(db).cancel(order.id, { method: "payme_cancel", reason: 3, now: NOW + 1_000 });
  assert.deepEqual([cancelled.state, cancelled.reason, cancelled.cancel_time], ["cancelled", 3, NOW + 1_000]);
  const again = await store(db).cancel(order.id, { method: "payme_cancel", reason: 3, now: NOW + 2_000 });
  assert.equal(again.version, cancelled.version);
  assert.deepEqual(journal(db, order.id).at(-1), { actor: "payme", method: "payme_cancel", from_state: "prepared", to_state: "cancelled" });
  const paid = await paidOrder(db, { userId: "acct_studio_b" });
  await refused(store(db).cancel(paid.id, { method: "payme_cancel", reason: 5, now: NOW }), "state");
  // `from` limits the states a caller may close.
  const open = await pendingOrder(db, { userId: "acct_studio_c" });
  await refused(store(db).cancel(open.id, { method: "timeout", from: ["prepared"], now: NOW }), "state");
});

test("the buyer closes only their own pending order that no provider holds", async () => {
  const db = await paidDatabase();
  const order = await pendingOrder(db, { userId: "acct_studio_a" });
  assert.equal(await store(db).cancelOwn("acct_studio_b", order.id, NOW), "not_found");
  assert.equal(await store(db).cancelOwn("acct_studio_a", "stu_00000000000000000000000000000000", NOW), "not_found");
  assert.equal(await store(db).cancelOwn("acct_studio_a", order.id, NOW), "cancelled");
  assert.equal(await store(db).cancelOwn("acct_studio_a", order.id, NOW), "cancelled");
  assert.deepEqual(journal(db, order.id).at(-1), { actor: "account", method: "invoice_cancelled", from_state: "pending", to_state: "cancelled" });
  const held = await pendingOrder(db, { userId: "acct_studio_a" });
  await store(db).prepare(held.id, { externalId: PAYME_TX, providerTime: NOW, method: "payme_create", now: NOW });
  assert.equal(await store(db).cancelOwn("acct_studio_a", held.id, NOW), "in_progress");
  const paid = await paidOrder(db, { userId: "acct_studio_c" });
  assert.equal(await store(db).cancelOwn("acct_studio_c", paid.id, NOW), "in_progress");
});

// ── Refunds ─────────────────────────────────────────────────────────────────

test("refundFull (Payme cancels a paid transaction): refunded, every entitlement revoked, one studio_refunds row, receipt by Payme", async () => {
  const db = await paidDatabase();
  const order = await paidOrder(db, { plan: "oylik" });
  // One presentation and three photos used; a returned unit (credit) of the same order.
  db.exec(`UPDATE studio_entitlements SET presentations_used=1, photos_used=MIN(3,photos_limit) WHERE id='${order.id}'`);
  db.sqlite.prepare("INSERT INTO studio_entitlements(org_id,id,order_id,user_id,mode,plan,plan_version,starts_at,ends_at,presentations_limit,photos_limit) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(STUDIO_ORG, `${order.id}_c1`, order.id, order.user_id, "live", "credit", order.plan_version, NOW, NOW + DAY, 1, 0);
  const at = NOW + 2 * DAY;
  const { order: refunded, refund, replay } = await store(db).refundFull(order.id, { method: "payme_cancel", reference: PAYME_TX, reason: 5, now: at });
  assert.equal(replay, false);
  assert.deepEqual([refunded.state, refunded.reason, refunded.cancel_time, refunded.ga4_refund_state], ["refunded", 5, at, "pending"]);
  assert.match(refund.id, /^sr_[0-9a-f]{32}$/);
  assert.deepEqual(
    { amount: refund.amount, method: refund.method, reference: refund.reference, presentations: refund.presentations_unused, photos: refund.photos_unused, receipt: refund.receipt_state, requested: refund.requested_at },
    { amount: 3_990_000, method: "payme_cancel", reference: PAYME_TX, presentations: 10, photos: Math.max(0,editionPlan("oylik").photoTask-3), receipt: "provider", requested: at },
  );
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_entitlements WHERE order_id=? AND revoked_at=?", order.id, at), 2);
  assert.deepEqual(journal(db, order.id).at(-1), { actor: "payme", method: "payme_cancel", from_state: "paid", to_state: "refunded" });
  // Payme asks again: the first answer; anything else is a second refund.
  const repeat = await store(db).refundFull(order.id, { method: "payme_cancel", reference: PAYME_TX, reason: 5, now: at + 1 });
  assert.equal(repeat.replay, true);
  assert.equal(repeat.refund.id, refund.id);
  await refused(store(db).refundFull(order.id, { method: "click_cabinet", reference: "x", now: at + 2 }), "refund_exists");
  await refused(store(db).recordRefund(order.id, { method: "transfer", reference: "p2p", now: at + 2 }), "refund_exists");
  assert.equal(count(db, "SELECT COUNT(*) FROM studio_refunds"), 1);
});

test("recordRefund on request: the unused units at their published value, by transfer with our receipt due, within 14 days", async () => {
  const db = await paidDatabase();
  const kunlik = await paidOrder(db, { plan: "kunlik" });
  db.exec(`UPDATE studio_entitlements SET photos_used=MIN(2,photos_limit) WHERE id='${kunlik.id}'`);
  const asked = NOW + 3 * DAY;
  const { refund } = await store(db).recordRefund(kunlik.id, { method: "transfer", reference: "p2p-2026-10-17-1", requestedAt: asked, now: asked + HOUR });
  // The edition's Kunlik: its one presentation and the photo tasks left after 2 (none in a decks-only edition).
  const photosUnused = Math.max(0, editionPlan("kunlik").photoTask - 2);
  assert.equal(refund.amount, refundValueTiyin(EDITION_VERSION, "kunlik", 1, photosUnused));
  // With photos: 1 presentation (4 720) and 3 photo tasks (3 × 236); decks only: the whole 5 900.
  assert.equal(refund.amount, photosUnused ? 472_000 + photosUnused * 23_600 : 590_000);
  assert.deepEqual([refund.method, refund.receipt_state, refund.presentations_unused, refund.photos_unused, refund.requested_at], ["transfer", "due", 1, photosUnused, asked]);
  assert.equal(refundReceiptState("transfer"), "due");
  for (const method of REFUND_METHODS.filter((name) => name !== "transfer")) assert.equal(refundReceiptState(method), "provider");
  assert.equal((await store(db).byId(kunlik.id))?.state, "refunded");
  assert.deepEqual(journal(db, kunlik.id).at(-1), { actor: "owner", method: "transfer", from_state: "paid", to_state: "refunded" });
});

test("recordRefund: the 14-day window, an explicit amount up to the price, nothing left, and a mistaken charge outside the window", async () => {
  const db = await paidDatabase();
  const late = await paidOrder(db, { userId: "acct_studio_late" });
  await refused(store(db).recordRefund(late.id, { method: "transfer", reference: "r", requestedAt: NOW + REFUND_WINDOW_MS + 1 }), "refund_window");
  assert.equal((await store(db).byId(late.id))?.state, "paid");
  // Asked on day 14, recorded a week later: the day of the request counts.
  const onTime = await store(db).recordRefund(late.id, { method: "transfer", reference: "r", requestedAt: NOW + REFUND_WINDOW_MS, now: NOW + REFUND_WINDOW_MS + 7 * DAY });
  assert.equal(onTime.refund.amount, 3_990_000);
  const big = await paidOrder(db, { userId: "acct_studio_big", plan: "kunlik" });
  await refused(store(db).recordRefund(big.id, { method: "transfer", reference: "r", amountTiyin: 590_001, now: NOW }), "refund_amount");
  await refused(store(db).recordRefund(big.id, { method: "transfer", reference: "r", amountTiyin: 0, now: NOW }), "refund_amount");
  await refused(store(db).recordRefund(big.id, { method: "transfer", reference: "r", amountTiyin: 1.5, now: NOW }), "refund_amount");
  const spent = await paidOrder(db, { userId: "acct_studio_spent", plan: "kunlik" });
  db.exec(`UPDATE studio_entitlements SET presentations_used=1, photos_used=photos_limit WHERE id='${spent.id}'`);
  await refused(store(db).recordRefund(spent.id, { method: "transfer", reference: "r", now: NOW }), "nothing_to_refund");
  // A mistaken charge (DECISIONS §4 п. 5): the whole amount, whenever.
  const mistaken = await store(db).recordRefund(spent.id, { method: "transfer", reference: "r", amountTiyin: 590_000, skipWindow: true, now: NOW + 40 * DAY });
  assert.equal(mistaken.refund.amount, 590_000);
  const pending = await pendingOrder(db, { userId: "acct_studio_pending" });
  await refused(store(db).recordRefund(pending.id, { method: "transfer", reference: "r", now: NOW }), "state");
});

test("unused units count every entitlement of the order, returned units included, never below zero", () => {
  const row = (presentations: [number, number], photos: [number, number]) => ({
    id: "e", order_id: "o", user_id: "u", mode: "live" as const, plan: "oylik" as const, plan_version: "v", starts_at: 0, ends_at: 1,
    presentations_limit: presentations[0], presentations_used: presentations[1], photos_limit: photos[0], photos_used: photos[1],
    extended_ms: 0, revoked_at: null,
  });
  assert.deepEqual(unusedUnits([row([10, 4], [40, 40]), row([1, 0], [0, 0]), row([1, 3], [0, 0])]), { presentations: 7, photos: 0 });
  assert.deepEqual(unusedUnits([]), { presentations: 0, photos: 0 });
});

// ── Lookups, the owner's purchases ──────────────────────────────────────────

test("statement: the provider's transactions of a mode in a period, by the provider's time, untaken orders left out", async () => {
  const db = await paidDatabase();
  const a = await paidOrder(db, { userId: "acct_studio_a", paidAt: NOW + 10 * 60_000 });
  const b = await paidOrder(db, { userId: "acct_studio_b", paidAt: NOW + 5 * 60_000 });
  await pendingOrder(db, { userId: "acct_studio_c" });
  await paidOrder(db, { userId: "acct_studio_d", provider: "click", serviceId: "1" });
  await paidOrder(db, { userId: "acct_studio_e", mode: "test" });
  const listed = await store(db).statement("payme", "live", NOW, NOW + HOUR);
  assert.deepEqual(listed.map((order: StudioOrder) => order.id), [b.id, a.id]);
  assert.deepEqual((await store(db).statement("payme", "live", NOW + 6 * 60_000, NOW + HOUR)).map((order) => order.id), [a.id]);
});

test("the owner's own purchase leaves reports and GA4; journaled once", async () => {
  const db = await paidDatabase();
  const order = await paidOrder(db);
  assert.equal(order.ga4_state, "pending");
  const marked = await store(db).markOwnerTest(order.id, NOW + 1);
  assert.deepEqual([marked.owner_test, marked.ga4_state, marked.state], [1, "skipped", "paid"]);
  const again = await store(db).markOwnerTest(order.id, NOW + 2);
  assert.equal(again.version, marked.version);
  assert.deepEqual(journal(db, order.id).at(-1), { actor: "owner", method: "owner_order", from_state: "paid", to_state: "paid" });
  // A purchase GA4 already has keeps its mark.
  const sent = await paidOrder(db, { userId: "acct_studio_sent" });
  db.exec(`UPDATE studio_orders_v2 SET ga4_state='sent' WHERE id='${sent.id}'`);
  assert.equal((await store(db).markOwnerTest(sent.id, NOW)).ga4_state, "sent");
});

test("ids: orders are stu_ + 32 hex, refunds sr_ + 32 hex; Payme transaction ids are 24 hex", async () => {
  assert.match(`stu_${randomHex(32)}`, STUDIO_ORDER_ID);
  assert.doesNotMatch("pay_0123456789abcdef0123456789abcdef", STUDIO_ORDER_ID);
  assert.doesNotMatch("stu_0123", STUDIO_ORDER_ID);
});

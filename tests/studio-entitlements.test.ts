// What a paid studio order gives and how it is spent (spec §2.2, §2.3, §2.6;
// BUILD-PLAN 07.10.2026 stream B; DECISIONS §4, §13): the entitlement of the
// order's quota version, the unit taken from the live entitlement that ends
// soonest, races for the last unit, the free and the paid deck kept apart,
// a refunded tariff spent no more. Real SQLite; no remote database.
// Run: node --import tsx --test tests/studio-entitlements.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { DAY, HOUR, NOW, paidDatabase, paidOrder, randomHex, requestId } from "./helpers/studio-paid";
import { StudioStore, photoUnitSource } from "../functions/lib/studio/store";
import { LedgerStore } from "../functions/lib/studio/ledger";
import { startJob } from "../functions/lib/studio/jobs";
import { parseStudioConfig } from "../functions/lib/studio/config";
import { STUDIO_ORG } from "../functions/lib/studio/schema";
import { STUDIO_PLANS, entitlementEndsAt, planOfVersion } from "../functions/lib/studio/plans";
import { addCalendarMonth } from "../functions/lib/gpt-chat/billing-config";

const config = parseStudioConfig(JSON.stringify({ STUDIO_PAID_SERVICE: "on", STUDIO_FULL_DECK: "true" }));
const ledger = (db: SqliteD1) => new LedgerStore(db.asD1());

function addEntitlement(db: SqliteD1, row: { id: string; user?: string; mode?: "live" | "test"; starts?: number; ends: number; presentations?: [number, number]; photos?: [number, number]; revoked?: number | null; plan?: string }) {
  const [pLimit, pUsed] = row.presentations ?? [1, 0];
  const [fLimit, fUsed] = row.photos ?? [0, 0];
  db.sqlite
    .prepare("INSERT INTO studio_entitlements(org_id,id,order_id,user_id,mode,plan,plan_version,starts_at,ends_at,presentations_limit,presentations_used,photos_limit,photos_used,revoked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(STUDIO_ORG, row.id, row.id.replace(/_c\d+$/, ""), row.user ?? "acct_studio_a", row.mode ?? "live", row.plan ?? "oylik", "studio-2026-11-v1", row.starts ?? NOW - HOUR, row.ends, pLimit, pUsed, fLimit, fUsed, row.revoked ?? null);
}

const used = (db: SqliteD1, id: string) =>
  db.rows<{ p: number; f: number }>("SELECT presentations_used AS p, photos_used AS f FROM studio_entitlements WHERE id=?", id).map((row) => [row.p, row.f])[0];

test("the two quota versions: Kunlik 1 deck (+5 photos), Oylik 10 decks (+40 photos); 24 hours or one calendar month", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(STUDIO_PLANS).map(([version, plans]) => [version, [plans.kunlik.presentationFull, plans.kunlik.photoTask, plans.oylik.presentationFull, plans.oylik.photoTask]])),
    { "studio-2026-10-decks-v1": [1, 0, 10, 0], "studio-2026-11-v1": [1, 5, 10, 40] },
  );
  const kunlik = planOfVersion("studio-2026-11-v1", "kunlik")!;
  const oylik = planOfVersion("studio-2026-10-decks-v1", "oylik")!;
  assert.equal(entitlementEndsAt(kunlik, NOW), NOW + 24 * HOUR);
  assert.equal(entitlementEndsAt(oylik, NOW), addCalendarMonth(NOW));
  assert.equal(planOfVersion("studio-2026-11-v1", "credit"), null);
  assert.equal(planOfVersion("hasOwnProperty", "oylik"), null);
});

test("a paid order's entitlement is spent: the presentation unit comes off it and only off it", async () => {
  const db = await paidDatabase();
  const order = await paidOrder(db, { userId: "acct_studio_a", plan: "kunlik" });
  const started = await startJob(db.asD1(), {
    config, subject: "a:acct_studio_a", requestId: requestId(), tool: "presentation", shape: "full", slides: 12,
    inputMac: randomHex(32), source: { kind: "entitlement", userId: "acct_studio_a", mode: "live" }, now: NOW + HOUR,
  });
  assert.ok(started.ok, JSON.stringify(started));
  assert.equal(started.job.entitlementId, order.id);
  assert.equal(started.job.source, "entitlement");
  assert.deepEqual(used(db, order.id), [1, 0]);
  // The deck went out whole (a job that expires undelivered gives its unit back).
  db.exec(`UPDATE studio_unit_ledger SET state='done', parts_done=31, settled_at=${NOW + HOUR + 60_000} WHERE id='${started.job.id}'`);
  // Kunlik had one deck: the next start finds none (402 upstream).
  const second = await startJob(db.asD1(), {
    config, subject: "a:acct_studio_a", requestId: requestId(), tool: "presentation", shape: "full", slides: 12,
    inputMac: randomHex(32), source: { kind: "entitlement", userId: "acct_studio_a", mode: "live" }, now: NOW + HOUR + 20 * 60_000,
  });
  assert.equal(second.ok, false);
  assert.equal(!second.ok && second.code, "no_units");
  // The free counter of the person was never touched by the paid deck.
  assert.equal(db.value("SELECT COUNT(*) FROM studio_free_usage WHERE unit IN ('presentation_free','photo_task')"), 0);
});

test("the free deck never takes a paid unit, and a paid deck never a free one", async () => {
  const db = await paidDatabase();
  const order = await paidOrder(db, { userId: "acct_studio_a", plan: "oylik" });
  // The paid deck on the free source is refused before any unit moves.
  const mixed = await startJob(db.asD1(), {
    config, subject: "a:acct_studio_a", requestId: requestId(), tool: "presentation", shape: "full", slides: 12,
    inputMac: randomHex(32), source: { kind: "free", young: false, address: "a".repeat(64) }, now: NOW,
  });
  assert.equal(!mixed.ok && mixed.code, "invalid");
  // The free shape on an entitlement is refused too.
  const free = await startJob(db.asD1(), {
    config, subject: "a:acct_studio_a", requestId: requestId(), tool: "presentation", shape: "free",
    inputMac: randomHex(32), source: { kind: "entitlement", userId: "acct_studio_a", mode: "live" }, now: NOW,
  });
  assert.equal(!free.ok && free.code, "invalid");
  assert.deepEqual(used(db, order.id), [0, 0]);
});

test("the unit comes from the live entitlement that ends soonest; revoked, other-mode, future, ended and spent ones are passed over", async () => {
  const db = await paidDatabase();
  const at = NOW;
  addEntitlement(db, { id: "stu_late", ends: at + 20 * DAY, presentations: [10, 0], photos: [40, 0] });
  addEntitlement(db, { id: "stu_soon", ends: at + 2 * HOUR, presentations: [1, 0], photos: [5, 0] });
  addEntitlement(db, { id: "stu_soon_c1", ends: at + HOUR, presentations: [1, 1], photos: [0, 0], plan: "credit" });
  addEntitlement(db, { id: "stu_revoked", ends: at + 30 * 60_000, presentations: [10, 0], photos: [40, 0], revoked: at - 1 });
  addEntitlement(db, { id: "stu_test", mode: "test", ends: at + 10 * 60_000, presentations: [10, 0], photos: [40, 0] });
  addEntitlement(db, { id: "stu_future", starts: at + HOUR, ends: at + 5 * 60_000 + HOUR, presentations: [10, 0], photos: [40, 0] });
  addEntitlement(db, { id: "stu_ended", ends: at, presentations: [10, 0], photos: [40, 0] });
  addEntitlement(db, { id: "stu_other", user: "acct_studio_b", ends: at + 60_000, presentations: [10, 0], photos: [40, 0] });
  assert.equal(await ledger(db).pickEntitlement("acct_studio_a", "live", "presentation_full", at), "stu_soon");
  assert.equal(await ledger(db).pickEntitlement("acct_studio_a", "live", "photo_task", at), "stu_soon");
  assert.equal(await ledger(db).pickEntitlement("acct_studio_a", "test", "photo_task", at), "stu_test");
  assert.ok(await ledger(db).debitEntitlement("stu_soon", "presentation_full", at));
  assert.equal(await ledger(db).pickEntitlement("acct_studio_a", "live", "presentation_full", at), "stu_late");
  assert.equal(await ledger(db).pickEntitlement("acct_studio_a", "live", "photo_task", at), "stu_soon");
  // Past the soonest end, the next one serves.
  assert.equal(await ledger(db).pickEntitlement("acct_studio_a", "live", "photo_task", at + 3 * HOUR), "stu_late");
  // A revoked or ended entitlement is never debited, even when named directly.
  assert.equal(await ledger(db).debitEntitlement("stu_revoked", "photo_task", at), false);
  assert.equal(await ledger(db).debitEntitlement("stu_ended", "photo_task", at), false);
  assert.deepEqual(used(db, "stu_revoked"), [0, 0]);
});

test("a race for the last unit: one start gets it, the other gets the next entitlement or nothing; never below the limit", async () => {
  const db = await paidDatabase();
  addEntitlement(db, { id: "stu_one", ends: NOW + DAY, presentations: [1, 0] });
  const tries = await Promise.all([1, 2, 3, 4].map(() => ledger(db).debitEntitlement("stu_one", "presentation_full", NOW)));
  assert.equal(tries.filter(Boolean).length, 1);
  assert.deepEqual(used(db, "stu_one"), [1, 0]);
  // Two paid starts of two subjects of one account at once (two devices): one deck each only while units last.
  addEntitlement(db, { id: "stu_two", user: "acct_studio_two", ends: NOW + DAY, presentations: [1, 0] });
  const starts = await Promise.all(["x", "y"].map((device) =>
    startJob(db.asD1(), {
      config, subject: `a:acct_studio_two${device === "x" ? "" : "_alt"}`, requestId: requestId(), tool: "presentation", shape: "full", slides: 8,
      inputMac: randomHex(32), source: { kind: "entitlement", userId: "acct_studio_two", mode: "live" }, now: NOW,
    })));
  assert.equal(starts.filter((start) => start.ok).length, 1);
  assert.deepEqual(starts.filter((start) => !start.ok).map((start) => !start.ok && start.code), ["no_units"]);
  assert.deepEqual(used(db, "stu_two"), [1, 0]);
});

test("a refunded tariff is spent no more: refundFull revokes it and the next start finds no unit", async () => {
  const db = await paidDatabase();
  const order = await paidOrder(db, { userId: "acct_studio_r", plan: "oylik" });
  await new StudioStore(db.asD1()).refundFull(order.id, { method: "payme_cancel", reference: "6f00a1b2c3d4e5f6a7b8c9d0", now: NOW + HOUR });
  assert.equal(await ledger(db).pickEntitlement("acct_studio_r", "live", "presentation_full", NOW + 2 * HOUR), null);
  const start = await startJob(db.asD1(), {
    config, subject: "a:acct_studio_r", requestId: requestId(), tool: "presentation", shape: "full", slides: 12,
    inputMac: randomHex(32), source: { kind: "entitlement", userId: "acct_studio_r", mode: "live" }, now: NOW + 2 * HOUR,
  });
  assert.equal(!start.ok && start.code, "no_units");
});

test("several purchases run side by side; units of the one ending first go first and the rest burn at its end", async () => {
  const db = await paidDatabase();
  const oylik = await paidOrder(db, { userId: "acct_studio_m", plan: "oylik", paidAt: NOW - 10 * DAY });
  // Kunlik bought later (after the Oylik order closed as paid).
  const kunlik = await paidOrder(db, { userId: "acct_studio_m", plan: "kunlik", paidAt: NOW });
  const pick = (at: number) => ledger(db).pickEntitlement("acct_studio_m", "live", "presentation_full", at);
  assert.equal(await pick(NOW + HOUR), kunlik.id);
  assert.ok(await ledger(db).debitEntitlement(kunlik.id, "presentation_full", NOW + HOUR));
  assert.equal(await pick(NOW + 2 * HOUR), oylik.id);
  assert.equal(await ledger(db).pickEntitlement("acct_studio_m", "live", "photo_task", NOW + 2 * HOUR), null);
  assert.equal(await ledger(db).pickEntitlement("acct_studio_m", "live", "photo_task", NOW + 25 * HOUR), null);
});

test("free first (spec §2.3): a photo takes today's free unit before a paid one; a buyer skips Turnstile; a paid unit never stands in for a missing token", () => {
  const cases: Array<[Parameters<typeof photoUnitSource>[0], ReturnType<typeof photoUnitSource>]> = [
    // Free photos left today.
    [{ freeLeft: 2, entitled: false, turnstileToken: true }, { source: "free", turnstile: true }],
    [{ freeLeft: 1, entitled: true, turnstileToken: false }, { source: "free", turnstile: false }],
    [{ freeLeft: 1, entitled: true, turnstileToken: true }, { source: "free", turnstile: false }],
    // No entitlement and no token: 403, never a paid unit instead.
    [{ freeLeft: 2, entitled: false, turnstileToken: false }, { refuse: "turnstile_required" }],
    // Nothing free left: the entitlement that ends soonest, or the limit.
    [{ freeLeft: 0, entitled: true, turnstileToken: false }, { source: "entitlement" }],
    [{ freeLeft: 0, entitled: false, turnstileToken: true }, { refuse: "free_limit" }],
    [{ freeLeft: -1, entitled: false, turnstileToken: false }, { refuse: "free_limit" }],
  ];
  for (const [input, expected] of cases) assert.deepEqual(photoUnitSource(input), expected, JSON.stringify(input));
});

test("entitled: the account holds a running, unrevoked entitlement of the mode, used up or not", async () => {
  const db = await paidDatabase();
  const store = new StudioStore(db.asD1());
  addEntitlement(db, { id: "stu_spent", ends: NOW + DAY, presentations: [1, 1], photos: [5, 5] });
  addEntitlement(db, { id: "stu_revoked", user: "acct_studio_r", ends: NOW + DAY, revoked: NOW - 1 });
  addEntitlement(db, { id: "stu_test", user: "acct_studio_t", mode: "test", ends: NOW + DAY });
  addEntitlement(db, { id: "stu_ended", user: "acct_studio_e", ends: NOW });
  assert.equal(await store.hasRunningEntitlement("acct_studio_a", "live", NOW), true);
  assert.equal(await store.hasRunningEntitlement("acct_studio_r", "live", NOW), false);
  assert.equal(await store.hasRunningEntitlement("acct_studio_t", "live", NOW), false);
  assert.equal(await store.hasRunningEntitlement("acct_studio_t", "test", NOW), true);
  assert.equal(await store.hasRunningEntitlement("acct_studio_e", "live", NOW), false);
  assert.equal(await store.hasRunningEntitlement("acct_studio_nobody", "live", NOW), false);
});

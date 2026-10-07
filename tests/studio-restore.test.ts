// Restoring a studio tariff to a new browser and marking the owner's own
// purchase (functions/lib/studio/restore.ts, /api/internal/studio-restore-link,
// /api/studio/restore, /api/internal/studio-owner-order; spec §5.3, §9.6;
// DECISIONS §8, §14 п. 3): the order number or the payment number, the
// amount and the date (±1 day), never the card's digits; a single-use link
// for 48 hours; one restore per order in 7 days; the order, its
// entitlements and its offer acceptance move in one guarded batch.
// Real SQLite; no network, no remote database.
// Run: node --import tsx --test tests/studio-restore.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteD1 } from "./helpers/sqlite-d1";
import {
  DAY,
  HOUR,
  IDENTITY_KEY,
  MAINTENANCE_KEY,
  NOW,
  call,
  journal,
  paidDatabase,
  paidEnv,
  paidOrder,
  setCookies,
  studioJson,
} from "./helpers/studio-paid";
import {
  RESTORE_QUERY,
  STUDIO_RESTORE_GAP_MS,
  STUDIO_RESTORE_LINK_MS,
  findRestorable,
  ordersFor,
  sameDayish,
  studioRestoreLink,
  tashkentDay,
  verifyStudioRestoreToken,
} from "../functions/lib/studio/restore";
import { StudioStore } from "../functions/lib/studio/store";
import { STUDIO_ACCOUNT_COOKIE, createStudioAccount } from "../functions/lib/studio/account";
import { onRequestPost as linkEndpoint } from "../functions/api/internal/studio-restore-link";
import { onRequestPost as ownerEndpoint } from "../functions/api/internal/studio-owner-order";
import { onRequestGet as restoreGet, onRequestPost as restorePost } from "../functions/api/studio/restore";
import { STUDIO_ORG } from "../functions/lib/studio/schema";

const PAYME_TX = "6f00a1b2c3d4e5f6a7b8c9d0";
const store = (db: SqliteD1) => new StudioStore(db.asD1());

async function buyer(db: SqliteD1, now = Date.now()) {
  const made = await createStudioAccount(db.asD1(), now);
  return { userId: made.account.userId, cookie: made.cookie.split(";")[0] };
}

function internal(path: string, body: unknown, bearer: string | null = MAINTENANCE_KEY): Request {
  return new Request(`https://gptbot.uz${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
}

function restoreForm(token: string, cookie?: string, options: { origin?: string | null; path?: string } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", "CF-Connecting-IP": "203.0.113.9" };
  const origin = options.origin === undefined ? "https://gptbot.uz" : options.origin;
  if (origin) headers.Origin = origin;
  if (cookie) headers.cookie = cookie;
  return new Request(`https://gptbot.uz${options.path ?? "/api/studio/restore"}`, { method: "POST", headers, body: new URLSearchParams({ t: token }).toString() });
}

const tokenOf = (url: string) => new URL(url).searchParams.get("t") ?? "";

test("the number support may type: our order number, a Payme transaction id, digits of Click; never a card", () => {
  for (const ok of ["stu_0123456789abcdef0123456789abcdef", PAYME_TX, "4100200", "R1".replace("R", "1")]) assert.match(ok, RESTORE_QUERY);
  for (const bad of ["8600 1234 5678 9012", "860012345678901234567", "stu_xyz", "pay_0123456789abcdef0123456789abcdef", "' OR 1=1", ""]) assert.doesNotMatch(bad, RESTORE_QUERY);
});

test("the date: the Tashkent day of the payment, a day either way", () => {
  // 23:30 UTC on 13.10 is already 14.10 in Tashkent.
  const at = Date.UTC(2026, 9, 13, 23, 30);
  assert.equal(tashkentDay(at), "2026-10-14");
  for (const day of ["2026-10-13", "2026-10-14", "2026-10-15"]) assert.ok(sameDayish(day, at), day);
  for (const day of ["2026-10-12", "2026-10-16", "14.10.2026", "2026-13-01"]) assert.ok(!sameDayish(day, at), day);
});

test("findRestorable: the order by its number or its payment number, the amount and the date; not refunded, not ended, not twice a week", async () => {
  const db = await paidDatabase();
  const now = Date.now();
  const order = await paidOrder(db, { userId: "acct_studio_old", plan: "oylik", paidAt: now - HOUR, externalId: PAYME_TX });
  await store(db).setDocId(order.id, "777001");
  const day = tashkentDay(now - HOUR);
  for (const query of [order.id, PAYME_TX, "777001"]) {
    const found = await findRestorable(store(db), { query, amountUzs: 39_900, paidDate: day }, now);
    assert.ok(found.ok, query);
    assert.equal(found.ok && found.target.order.id, order.id);
    assert.equal(found.ok && found.target.endsAt, Number(db.value("SELECT ends_at FROM studio_entitlements WHERE id=?", order.id)));
  }
  assert.deepEqual(await findRestorable(store(db), { query: order.id, amountUzs: 5_900, paidDate: day }, now), { ok: false, code: "not_found" });
  assert.deepEqual(await findRestorable(store(db), { query: order.id, amountUzs: 39_900, paidDate: tashkentDay(now - 3 * DAY) }, now), { ok: false, code: "not_found" });
  assert.deepEqual(await findRestorable(store(db), { query: "4100200", amountUzs: 39_900, paidDate: day }, now), { ok: false, code: "not_found" });
  // A test order is never restored (a rehearsal); an ended tariff has nothing to move.
  const rehearsal = await paidOrder(db, { userId: "acct_studio_t", mode: "test", paidAt: now - HOUR });
  assert.equal((await ordersFor(store(db), rehearsal.id)).length, 0);
  const kunlik = await paidOrder(db, { userId: "acct_studio_k", plan: "kunlik", paidAt: now - 2 * DAY });
  assert.deepEqual(await findRestorable(store(db), { query: kunlik.id, amountUzs: 5_900, paidDate: tashkentDay(now - 2 * DAY) }, now), { ok: false, code: "invalid_order" });
  await store(db).refundFull(order.id, { method: "payme_cancel", reference: PAYME_TX, now });
  assert.deepEqual(await findRestorable(store(db), { query: order.id, amountUzs: 39_900, paidDate: day }, now), { ok: false, code: "invalid_order" });
});

test("the link: 48 hours at most and never past the tariff; it names the order's present holder, so it works once", async () => {
  const db = await paidDatabase();
  const now = Date.now();
  const order = await paidOrder(db, { userId: "acct_studio_old", plan: "kunlik", paidAt: now - HOUR });
  const found = await findRestorable(store(db), { query: order.id, amountUzs: 5_900, paidDate: tashkentDay(now - HOUR) }, now);
  assert.ok(found.ok);
  const link = await studioRestoreLink(IDENTITY_KEY, found.target, now);
  assert.equal(STUDIO_RESTORE_LINK_MS, 48 * HOUR);
  // Kunlik ends in 23 hours: the link with it.
  assert.equal(link.expiresAt, found.target.endsAt);
  assert.match(link.url, /^https:\/\/gptbot\.uz\/api\/studio\/restore\?t=v1\.\d{13}\.stu_[0-9a-f]{32}\.[0-9a-f]{64}$/);
  const token = tokenOf(link.url);
  assert.ok(await verifyStudioRestoreToken(store(db), IDENTITY_KEY, token, now));
  assert.equal(await verifyStudioRestoreToken(store(db), "another-identity-key-of-the-same-length-x", token, now), null);
  assert.equal(await verifyStudioRestoreToken(store(db), IDENTITY_KEY, token.replace(/.$/, (c) => (c === "0" ? "1" : "0")), now), null);
  assert.equal(await verifyStudioRestoreToken(store(db), IDENTITY_KEY, token, link.expiresAt), null);
  assert.equal(await verifyStudioRestoreToken(store(db), IDENTITY_KEY, "", now), null);
  // Once the order moves, the same link no longer matches.
  assert.ok(await store(db).moveToAccount(order.id, "acct_studio_old", "acct_studio_new", now));
  assert.equal(await verifyStudioRestoreToken(store(db), IDENTITY_KEY, token, now), null);
});

test("POST /api/internal/studio-restore-link: bearer only; number, amount, date; the link is answered, never logged", async (context) => {
  const db = await paidDatabase();
  const env = paidEnv(db);
  const now = Date.now();
  const order = await paidOrder(db, { userId: "acct_studio_old", plan: "oylik", paidAt: now - HOUR, externalId: PAYME_TX });
  const logs: string[] = [];
  context.mock.method(console, "log", (line: string) => logs.push(String(line)));
  assert.equal((await call(linkEndpoint, internal("/api/internal/studio-restore-link", { order: PAYME_TX, amountUzs: 39_900, paidDate: tashkentDay(now) }, null), env)).status, 401);
  assert.equal((await call(linkEndpoint, internal("/api/internal/studio-restore-link", { order: PAYME_TX, amountUzs: 39_900, paidDate: tashkentDay(now) }, "wrong-bearer"), env)).status, 401);
  for (const body of [{ order: "8600123456789012345678", amountUzs: 39_900, paidDate: "2026-10-14" }, { order: PAYME_TX, amountUzs: "39900", paidDate: "2026-10-14" }, { order: PAYME_TX, amountUzs: 39_900, paidDate: "14.10" }])
    assert.equal((await call(linkEndpoint, internal("/api/internal/studio-restore-link", body), env)).status, 400, JSON.stringify(body));
  const response = await call(linkEndpoint, internal("/api/internal/studio-restore-link", { order: PAYME_TX, amountUzs: 39_900, paidDate: tashkentDay(now - HOUR) }), env);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; orderId: string; provider: string; url: string; expiresAt: number };
  assert.deepEqual([body.ok, body.orderId, body.provider], [true, order.id, "payme"]);
  assert.ok(body.expiresAt <= now + STUDIO_RESTORE_LINK_MS + 5_000);
  assert.ok(logs.every((line) => !line.includes(body.url) && !line.includes("restore?t=")), logs.join("\n"));
  const missing = await call(linkEndpoint, internal("/api/internal/studio-restore-link", { order: PAYME_TX, amountUzs: 5_900, paidDate: tashkentDay(now) }), env);
  assert.equal(missing.status, 404);
});

test("the buyer's end: GET shows one button and moves nothing; the POST moves the order, its entitlements and its consent to this browser's account", async () => {
  const db = await paidDatabase();
  const env = paidEnv(db);
  const now = Date.now();
  const order = await paidOrder(db, { userId: "acct_studio_old", plan: "oylik", paidAt: now - HOUR });
  db.sqlite.prepare("INSERT INTO studio_entitlements(org_id,id,order_id,user_id,mode,plan,plan_version,starts_at,ends_at,presentations_limit,photos_limit) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(STUDIO_ORG, `${order.id}_c1`, order.id, "acct_studio_old", "live", "credit", order.plan_version, now, now + DAY, 1, 0);
  const found = await findRestorable(store(db), { query: order.id, amountUzs: 39_900, paidDate: tashkentDay(now - HOUR) }, now);
  assert.ok(found.ok);
  const token = tokenOf((await studioRestoreLink(IDENTITY_KEY, found.target, now)).url);
  const page = await call(restoreGet, new Request(`https://gptbot.uz/api/studio/restore?t=${token}`), env);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(page.headers.get("x-robots-tag") ?? "", /noindex/);
  const html = await page.text();
  assert.match(html, /<form method="post" action="\/api\/studio\/restore">/);
  assert.equal((await store(db).byId(order.id))?.user_id, "acct_studio_old");
  // Another site's form, or none at all: nothing moves.
  const fresh = await buyer(db, now);
  assert.equal((await call(restorePost, restoreForm(token, fresh.cookie, { origin: "https://evil.example" }), env)).status, 410);
  assert.equal((await call(restorePost, restoreForm(token, fresh.cookie, { origin: null }), env)).status, 410);
  assert.equal((await store(db).byId(order.id))?.user_id, "acct_studio_old");
  // The button.
  const moved = await call(restorePost, restoreForm(token, fresh.cookie), env);
  assert.equal(moved.status, 200);
  assert.match(await moved.text(), /Tarif shu brauzerga qaytarildi/);
  const after = (await store(db).byId(order.id))!;
  assert.equal(after.user_id, fresh.userId);
  assert.ok(after.restored_at && after.restored_at >= now);
  assert.equal(db.value("SELECT COUNT(*) FROM studio_entitlements WHERE order_id=? AND user_id=?", order.id, fresh.userId), 2);
  assert.equal(db.value("SELECT user_id FROM gpt_payment_consents WHERE order_id=?", order.id), fresh.userId);
  assert.deepEqual(journal(db, order.id).at(-1), { actor: "owner", method: "studio_restore", from_state: "paid", to_state: "paid" });
  // The same button again in the same browser: done already. In a third browser: the link is spent.
  assert.equal((await call(restorePost, restoreForm(token, fresh.cookie), env)).status, 200);
  const third = await buyer(db, now);
  assert.equal((await call(restorePost, restoreForm(token, third.cookie), env)).status, 410);
  assert.equal((await store(db).byId(order.id))?.user_id, fresh.userId);
  // One restore per order in 7 days.
  assert.equal(STUDIO_RESTORE_GAP_MS, 7 * DAY);
  assert.deepEqual(await findRestorable(store(db), { query: order.id, amountUzs: 39_900, paidDate: tashkentDay(now - HOUR) }, now + HOUR), { ok: false, code: "restore_recent" });
  const later = await findRestorable(store(db), { query: order.id, amountUzs: 39_900, paidDate: tashkentDay(now - HOUR) }, now + STUDIO_RESTORE_GAP_MS + HOUR);
  assert.ok(later.ok);
});

test("a browser without a studio account gets one first (paced), then the same POST moves the order; cookies refused: nothing moves", async () => {
  const db = await paidDatabase();
  const env = paidEnv(db);
  const now = Date.now();
  const order = await paidOrder(db, { userId: "acct_studio_old", plan: "kunlik", paidAt: now - HOUR });
  const found = await findRestorable(store(db), { query: order.id, amountUzs: 5_900, paidDate: tashkentDay(now - HOUR) }, now);
  assert.ok(found.ok);
  const token = tokenOf((await studioRestoreLink(IDENTITY_KEY, found.target, now)).url);
  const first = await call(restorePost, restoreForm(token), env);
  assert.equal(first.status, 307);
  assert.equal(first.headers.get("location"), "/api/studio/restore?account=1");
  const [cookie] = setCookies(first);
  assert.match(cookie, new RegExp(`^${STUDIO_ACCOUNT_COOKIE}=[0-9a-f]{64}$`));
  assert.equal((await store(db).byId(order.id))?.user_id, "acct_studio_old");
  assert.equal(db.value("SELECT COUNT(*) FROM gpt_rate_limits WHERE action='studio_account'"), 1);
  // The browser repeats the POST with its new cookie.
  const second = await call(restorePost, restoreForm(token, cookie, { path: "/api/studio/restore?account=1" }), env);
  assert.equal(second.status, 200);
  assert.notEqual((await store(db).byId(order.id))?.user_id, "acct_studio_old");
  // A browser that drops cookies comes back without one: told so, nothing moves, no endless loop.
  const other = await paidOrder(db, { userId: "acct_studio_x", plan: "kunlik", paidAt: now - HOUR });
  const otherFound = await findRestorable(store(db), { query: other.id, amountUzs: 5_900, paidDate: tashkentDay(now - HOUR) }, now);
  assert.ok(otherFound.ok);
  const otherToken = tokenOf((await studioRestoreLink(IDENTITY_KEY, otherFound.target, now)).url);
  const dropped = await call(restorePost, restoreForm(otherToken, undefined, { path: "/api/studio/restore?account=1" }), env);
  assert.equal(dropped.status, 400);
  assert.equal((await store(db).byId(other.id))?.user_id, "acct_studio_x");
});

test("the restore page exists only while the paid service is on, on gptbot.uz", async () => {
  const db = await paidDatabase();
  const off = { ...paidEnv(db), STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAID_SERVICE: "off" }) };
  assert.equal((await call(restoreGet, new Request("https://gptbot.uz/api/studio/restore?t=x"), off)).status, 404);
  assert.equal((await call(restoreGet, new Request("https://gptbot-ai.pages.dev/api/studio/restore?t=x"), paidEnv(db))).status, 404);
  assert.equal((await call(restoreGet, new Request("https://gptbot.uz/api/studio/restore?t=x"), paidEnv(db))).status, 410);
});

test("POST /api/internal/studio-owner-order: the owner's purchase by its number, out of reports and GA4; bearer only", async () => {
  const db = await paidDatabase();
  const env = paidEnv(db);
  const order = await paidOrder(db, { userId: "acct_studio_owner", plan: "kunlik", paidAt: NOW, externalId: PAYME_TX });
  assert.equal((await call(ownerEndpoint, internal("/api/internal/studio-owner-order", { order: PAYME_TX }, null), env)).status, 401);
  assert.equal((await call(ownerEndpoint, internal("/api/internal/studio-owner-order", { order: "8600 1234" }), env)).status, 400);
  assert.equal((await call(ownerEndpoint, internal("/api/internal/studio-owner-order", { order: "7f00a1b2c3d4e5f6a7b8c9d0" }), env)).status, 404);
  const response = await call(ownerEndpoint, internal("/api/internal/studio-owner-order", { order: PAYME_TX }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, orderId: order.id, state: "paid", ownerTest: true });
  const row = (await store(db).byId(order.id))!;
  assert.deepEqual([row.owner_test, row.ga4_state], [1, "skipped"]);
});

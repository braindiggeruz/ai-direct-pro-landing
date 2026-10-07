// The studio account (functions/lib/studio/account.ts; spec §5.3, §6 /me;
// DECISIONS §8; BUILD-PLAN 07.10.2026 stream B): its own cookie that the
// chat never reads, its own pace buckets, a session that never ends before
// the tariff, and «Mening paketim» in GET /api/studio/me.
// Real SQLite; no network, no remote database.
// Run: node --import tsx --test tests/studio-account.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { DAY, EDITION, HOUR, NOW, bidCookie, call, editionPlan, paidDatabase, paidEnv, paidOrder, studioJson } from "./helpers/studio-paid";
import {
  SESSION_AFTER_TARIFF_MS,
  STUDIO_ACCOUNT_COOKIE,
  STUDIO_ACCOUNT_MS,
  STUDIO_ACCOUNT_RATE,
  accountCookie,
  createStudioAccount,
  extendStudioSession,
  hasAccountCookie,
  paceCheckout,
  paceStudioAccount,
  readStudioAccount,
} from "../functions/lib/studio/account";
import { onRequest as meEndpoint } from "../functions/api/studio/me";
import { IdentityStore } from "../functions/lib/gpt-chat/identity-store";
import { sha256Hex } from "../functions/lib/gpt-chat/hash";
import { StudioStore } from "../functions/lib/studio/store";
import { STUDIO_ORG } from "../functions/lib/studio/schema";

const ADDRESS = "a".repeat(64);

function withCookie(cookie: string, path = "/api/studio/me"): Request {
  return new Request(`https://gptbot.uz${path}`, { headers: { cookie } });
}

async function account(db: SqliteD1, now = NOW) {
  const made = await createStudioAccount(db.asD1(), now);
  return { ...made, header: made.cookie.split(";")[0] };
}

test("a new account: acct_studio_…, a year's session stored hashed, its own __Host- cookie", async () => {
  const db = await paidDatabase();
  const { account: made, cookie, header } = await account(db);
  assert.match(made.userId, /^acct_studio_[0-9a-f]{32}$/);
  assert.equal(made.expiresAt, NOW + STUDIO_ACCOUNT_MS);
  assert.equal(STUDIO_ACCOUNT_MS, 365 * DAY);
  assert.equal(cookie, `${STUDIO_ACCOUNT_COOKIE}=${made.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
  assert.equal(header, `__Host-studio_account=${made.token}`);
  const session = db.rows<{ token_hash: string; user_id: string; expires_at: number }>("SELECT token_hash, user_id, expires_at FROM gpt_auth_sessions")[0];
  assert.deepEqual({ ...session }, { token_hash: await sha256Hex(made.token), user_id: made.userId, expires_at: NOW + STUDIO_ACCOUNT_MS });
  assert.equal(db.value("SELECT COUNT(*) FROM gpt_auth_sessions WHERE token_hash=?", made.token), 0);
  assert.equal(db.value("SELECT identity_hash FROM gpt_accounts WHERE id=?", made.userId), `synthetic:${made.userId}`);
});

test("reading the account: only a live session of a studio account behind a well-formed cookie", async () => {
  const db = await paidDatabase();
  const { account: made, header } = await account(db);
  const read = await readStudioAccount(withCookie(`x=1; ${header}`), db.asD1(), NOW + HOUR);
  assert.deepEqual(read, { userId: made.userId, token: made.token, tokenHash: await sha256Hex(made.token), expiresAt: NOW + STUDIO_ACCOUNT_MS });
  assert.equal(await readStudioAccount(withCookie(header), db.asD1(), NOW + STUDIO_ACCOUNT_MS), null);
  assert.equal(hasAccountCookie(withCookie(header)), true);
  // Malformed cookies are refused before D1.
  const throwing = new Proxy({}, { get: () => { throw new Error("D1 touched"); } }) as D1Database;
  for (const cookie of ["", `${STUDIO_ACCOUNT_COOKIE}=`, `${STUDIO_ACCOUNT_COOKIE}=${"g".repeat(64)}`, `${STUDIO_ACCOUNT_COOKIE}=${made.token}0`]) {
    assert.equal(hasAccountCookie(withCookie(cookie)), false, cookie);
    assert.equal(await readStudioAccount(withCookie(cookie), throwing, NOW), null);
  }
  // A chat account's session behind the studio's cookie name is no studio account.
  const chat = await new IdentityStore(db.asD1(), STUDIO_ORG).syntheticLogin("acct_guest_", DAY, NOW);
  assert.equal(await readStudioAccount(withCookie(`${STUDIO_ACCOUNT_COOKIE}=${chat.token}`), db.asD1(), NOW), null);
});

test("the chat never sees the studio account and the studio never sees the chat's", async () => {
  const db = await paidDatabase();
  const { header, account: made } = await account(db);
  const identity = new IdentityStore(db.asD1(), STUDIO_ORG);
  assert.equal(await identity.user(withCookie(header), NOW), null);
  // The same token under the chat's cookie name would be read by the chat, which is why the names differ.
  assert.equal(await identity.user(withCookie(`__Host-gpt_account=${made.token}`), NOW), made.userId);
  const chat = await identity.syntheticLogin("acct_guest_", DAY, NOW);
  assert.equal(await readStudioAccount(withCookie(`__Host-gpt_account=${chat.token}`), db.asD1(), NOW), null);
});

test("the studio's own buckets: 5 new accounts an hour per address and 60 on the site; 10 checkouts an hour per account", async () => {
  assert.deepEqual(STUDIO_ACCOUNT_RATE, {
    address: { action: "studio_account", limit: 5, windowMs: HOUR },
    site: { action: "studio_account_global", limit: 60, windowMs: HOUR },
    checkout: { action: "studio_checkout", limit: 10, windowMs: HOUR },
  });
  const db = await paidDatabase();
  for (let n = 0; n < 5; n++) assert.deepEqual(await paceStudioAccount(db.asD1(), ADDRESS, NOW), { ok: true });
  const sixth = await paceStudioAccount(db.asD1(), ADDRESS, NOW);
  assert.equal(sixth.ok, false);
  assert.equal(!sixth.ok && sixth.code, "rate_limited");
  // An hour later the address may again.
  assert.deepEqual(await paceStudioAccount(db.asD1(), ADDRESS, NOW + HOUR), { ok: true });
  // The site's bucket: 60 an hour, whatever the addresses (it counts only what an address let through).
  const site = await paidDatabase();
  for (let n = 0; n < 60; n++) assert.ok((await paceStudioAccount(site.asD1(), n.toString(16).padStart(64, "0"), NOW)).ok, `account ${n}`);
  assert.equal((await paceStudioAccount(site.asD1(), "f".repeat(64), NOW)).ok, false);
  for (let n = 0; n < 10; n++) assert.ok((await paceCheckout(db.asD1(), "acct_studio_x", NOW)).ok);
  assert.equal((await paceCheckout(db.asD1(), "acct_studio_x", NOW)).ok, false);
  assert.ok((await paceCheckout(db.asD1(), "acct_studio_y", NOW)).ok);
  const actions = db.rows<{ action: string }>("SELECT DISTINCT action FROM gpt_rate_limits ORDER BY action").map((row) => row.action);
  assert.deepEqual(actions, ["studio_account", "studio_account_global", "studio_checkout"]);
});

test("the session never ends before the tariff: it moves to the tariff's end + 30 days, by its own key, and the cookie is sent again", async () => {
  const db = await paidDatabase();
  const { account: made } = await account(db);
  // A year-long session covers a month's tariff: nothing is written.
  assert.equal(await extendStudioSession(db.asD1(), made, NOW + 31 * DAY, NOW), null);
  // A tariff ending past the session's end (a session made long ago).
  const tariffEnd = made.expiresAt + 10 * DAY;
  const now = made.expiresAt - DAY;
  const cookie = await extendStudioSession(db.asD1(), made, tariffEnd, now);
  const until = tariffEnd + SESSION_AFTER_TARIFF_MS;
  assert.equal(cookie, accountCookie(made.token, (until - now) / 1000));
  assert.match(cookie ?? "", new RegExp(`Max-Age=${(until - now) / 1000}$`));
  assert.equal(db.value("SELECT expires_at FROM gpt_auth_sessions WHERE token_hash=?", made.tokenHash), until);
  // Never shortened.
  assert.equal(await extendStudioSession(db.asD1(), { ...made, expiresAt: NOW }, NOW + DAY, NOW), accountCookie(made.token, (NOW + DAY + SESSION_AFTER_TARIFF_MS - NOW) / 1000));
  assert.equal(db.value("SELECT expires_at FROM gpt_auth_sessions WHERE token_hash=?", made.tokenHash), until);
});

// ── GET /api/studio/me: «Mening paketim» ────────────────────────────────────

async function me(env: Record<string, unknown>, cookie = "") {
  const response = await call(meEndpoint, withCookie(cookie), env);
  return { response, body: (await response.json()) as Record<string, any> };
}

test("/me without a studio account: the paid part is empty and no D1 is read for it", async () => {
  const throwing = new Proxy({}, { get: () => { throw new Error("D1 touched"); } });
  const { response, body } = await me({ ...paidEnv(null), GPTBOT_DRAFTS_DB: throwing });
  assert.equal(response.status, 200);
  assert.deepEqual({ account: body.account, entitlements: body.entitlements, latestOrder: body.latestOrder, receipts: body.receipts }, { account: null, entitlements: [], latestOrder: null, receipts: [] });
  assert.equal(body.identity, false);
});

test("/me with an account: running tariffs with what is left, the newest order and its number, printed receipts only", async () => {
  const db = await paidDatabase();
  const { account: made, header } = await account(db, Date.now());
  const now = Date.now();
  const oylik = await paidOrder(db, { userId: made.userId, plan: "oylik", paidAt: now - DAY, externalId: "6f00a1b2c3d4e5f6a7b8c9d0" });
  db.exec(`UPDATE studio_entitlements SET presentations_used=3, photos_used=7 WHERE id='${oylik.id}'`);
  await new StudioStore(db.asD1()).setDocId(oylik.id, "R-123456");
  // An ended tariff and a refunded one are not shown.
  const ended = await paidOrder(db, { userId: made.userId, plan: "kunlik", paidAt: now - 3 * DAY });
  const refunded = await paidOrder(db, { userId: made.userId, plan: "kunlik", paidAt: now - HOUR });
  await new StudioStore(db.asD1()).refundFull(refunded.id, { method: "payme_cancel", reference: "x", now: now - 30 * 60_000 });
  // Receipts: one printed with a link on ofd.soliq.uz, one link off the allowed hosts, one not printed.
  db.sqlite.prepare("INSERT INTO gpt_fiscal_receipts(org_id,order_id,kind,provider,receipt_url,status_code,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(org_id,order_id,kind) DO UPDATE SET receipt_url=excluded.receipt_url,status_code=excluded.status_code")
    .run(STUDIO_ORG, oylik.id, "PERFORM", "payme", "https://ofd.soliq.uz/check?t=UZ1&r=1&c=2&s=3", 0, now);
  db.sqlite.prepare("INSERT INTO gpt_fiscal_receipts(org_id,order_id,kind,provider,receipt_url,status_code,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(org_id,order_id,kind) DO UPDATE SET receipt_url=excluded.receipt_url,status_code=excluded.status_code")
    .run(STUDIO_ORG, refunded.id, "CANCEL", "payme", "https://evil.example/receipt", 0, now);
  const { response, body } = await me(paidEnv(db), header);
  assert.equal(response.status, 200);
  assert.deepEqual(body.account, { signedIn: true });
  assert.deepEqual(body.entitlements.map((row: { id: string }) => row.id), [oylik.id]);
  const [tariff] = body.entitlements;
  // Oylik of the edition sold: 10 decks with 3 used; 40 photo tasks with 7 used, or none at all (decks-only edition).
  const plan = editionPlan("oylik");
  assert.deepEqual(
    { plan: tariff.plan, orderId: tariff.orderId, presentationsLeft: tariff.presentationsLeft, presentationsLimit: tariff.presentationsLimit, photosLeft: tariff.photosLeft, photosLimit: tariff.photosLimit, regen: tariff.regenAvailable },
    { plan: "oylik", orderId: oylik.id, presentationsLeft: plan.presentationFull - 3, presentationsLimit: plan.presentationFull, photosLeft: Math.max(0, plan.photoTask - 7), photosLimit: plan.photoTask, regen: [] },
  );
  assert.equal(Date.parse(tariff.endsAt), db.value("SELECT ends_at FROM studio_entitlements WHERE id=?", oylik.id));
  assert.equal(body.latestOrder.id, refunded.id);
  assert.deepEqual(
    { state: body.latestOrder.state, plan: body.latestOrder.plan, provider: body.latestOrder.provider, amountUzs: body.latestOrder.amountUzs, cancellable: body.latestOrder.cancellable },
    { state: "refunded", plan: "kunlik", provider: "payme", amountUzs: 5_900, cancellable: false },
  );
  assert.deepEqual(body.receipts, [{ orderId: oylik.id, kind: "PERFORM", url: "https://ofd.soliq.uz/check?t=UZ1&r=1&c=2&s=3" }]);
  assert.ok(ended.id);
  // No Set-Cookie: the year-long session already covers the tariff.
  assert.equal(response.headers.get("set-cookie"), null);
  // Nothing that names the buyer or a secret.
  assert.doesNotMatch(JSON.stringify(body), /acct_studio_|6f00a1b2c3d4e5f6a7b8c9d0|token/);
});

test("/me shows the newest order's number while it waits and whether the buyer may still close it", async () => {
  const db = await paidDatabase();
  const { account: made, header } = await account(db, Date.now());
  const store = new StudioStore(db.asD1());
  const made1 = await store.createOrder({ userId: made.userId, plan: "kunlik", termsVersion: EDITION, provider: "payme", serviceId: null, mode: "live", requestId: "o_me_000001", consent: { version: EDITION, url: "https://gptbot.uz/uz/ommaviy-oferta/", locale: "uz" } });
  const { body } = await me(paidEnv(db), header);
  assert.deepEqual({ id: body.latestOrder.id, state: body.latestOrder.state, cancellable: body.latestOrder.cancellable, paidAt: body.latestOrder.paidAt }, { id: made1.order.id, state: "pending", cancellable: true, paidAt: null });
  assert.deepEqual(body.entitlements, []);
});

test("/me moves the session past the tariff's end and sends the cookie again", async () => {
  const db = await paidDatabase();
  const now = Date.now();
  // A session that would end in two days, under a tariff of a month.
  const minted = await new IdentityStore(db.asD1(), STUDIO_ORG).syntheticLogin("acct_studio_", 2 * DAY, now);
  const order = await paidOrder(db, { userId: minted.id, plan: "oylik", paidAt: now - HOUR });
  const ends = Number(db.value("SELECT ends_at FROM studio_entitlements WHERE id=?", order.id));
  const { response } = await me(paidEnv(db), `${STUDIO_ACCOUNT_COOKIE}=${minted.token}`);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, new RegExp(`^${STUDIO_ACCOUNT_COOKIE}=${minted.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=\\d+$`));
  const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
  assert.ok(Math.abs(maxAge - (ends + SESSION_AFTER_TARIFF_MS - now) / 1000) < 5, String(maxAge));
  assert.equal(db.value("SELECT expires_at FROM gpt_auth_sessions WHERE user_id=?", minted.id), ends + SESSION_AFTER_TARIFF_MS);
});

test("/me's paid part only while STUDIO_PAID_SERVICE is on; test entitlements only in a local rehearsal", async () => {
  const db = await paidDatabase();
  const { account: made, header } = await account(db, Date.now());
  await paidOrder(db, { userId: made.userId, plan: "kunlik", paidAt: Date.now() - HOUR });
  await paidOrder(db, { userId: made.userId, plan: "oylik", mode: "test", paidAt: Date.now() - HOUR });
  const off = await me({ ...paidEnv(db), STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAID_SERVICE: "off" }) }, header);
  assert.deepEqual([off.body.account, off.body.entitlements], [null, []]);
  const live = await me(paidEnv(db), header);
  assert.deepEqual(live.body.entitlements.map((row: { plan: string }) => row.plan), ["kunlik"]);
  const local = new Request("http://localhost:8788/api/studio/me", { headers: { cookie: header } });
  const rehearsal = await call(meEndpoint, local, { ...paidEnv(db), STUDIO_LOCAL_DEV: "true", STUDIO_RUNTIME_CONFIG_JSON: studioJson({ STUDIO_PAYMENTS: "test" }) });
  const body = (await rehearsal.json()) as { entitlements: Array<{ plan: string }> };
  assert.deepEqual(body.entitlements.map((row) => row.plan), ["oylik"]);
});

test("/me with a browser identity and an account: the free part and the paid part side by side", async () => {
  const db = await paidDatabase();
  const { account: made, header } = await account(db, Date.now());
  await paidOrder(db, { userId: made.userId, plan: "kunlik", paidAt: Date.now() - HOUR });
  const { response, body } = await me(paidEnv(db), `${await bidCookie(Date.now())}; ${header}`);
  assert.equal(response.status, 200);
  assert.equal(body.identity, true);
  assert.equal(body.free.presentation.limit, 1);
  assert.equal(body.entitlements.length, 1);
});

test("/me lists the account's own finished decks that may be made once more (24 hours, one regeneration each)", async () => {
  const db = await paidDatabase();
  const { account: made, header } = await account(db, Date.now());
  const now = Date.now();
  const order = await paidOrder(db, { userId: made.userId, plan: "oylik", paidAt: now - 2 * DAY });
  const job = (id: string, extra: { subject?: string; settled?: number; source?: string; regenOf?: string | null; state?: string } = {}) =>
    db.sqlite
      .prepare("INSERT INTO studio_unit_ledger(org_id,id,request_id,tool,unit,source,entitlement_id,subject,regen_of,input_mac,state,parts_total,parts_done,shape,created_at,expires_at,settled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(STUDIO_ORG, id, `r_${id}`, "presentation", "presentation_full", extra.source ?? "entitlement", order.id, extra.subject ?? `a:${made.userId}`, extra.regenOf ?? null, "0".repeat(32), extra.state ?? "done", 4, 15, "full", now - DAY, now - DAY + 600_000, extra.settled ?? now - HOUR);
  const fresh = `sj_${"1".repeat(32)}`;
  const regenerated = `sj_${"2".repeat(32)}`;
  const old = `sj_${"3".repeat(32)}`;
  const foreign = `sj_${"4".repeat(32)}`;
  job(fresh);
  job(regenerated);
  job(`sj_${"5".repeat(32)}`, { source: "regen", regenOf: regenerated });
  job(old, { settled: now - 25 * HOUR });
  // A deck made by the account that held this order before a support restore.
  job(foreign, { subject: "a:acct_studio_previous" });
  const { body } = await me(paidEnv(db), header);
  assert.deepEqual(body.entitlements[0].regenAvailable, [fresh]);
});

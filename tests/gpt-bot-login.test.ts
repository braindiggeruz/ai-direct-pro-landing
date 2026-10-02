// Sign-in on gptbot.uz through the bot @gptbotuz_bot, the site's end (plan
// WP-16, decision L11): POST /api/gpt/auth/bot/start and /status, the store
// behind them (functions/lib/gpt-chat/bot-login-store.ts), the identity key
// shared with Telegram's OIDC, the account view's loginMethods and the
// maintenance sweep. The bot's end is tests/telegram-web-login.test.ts.
//
// Run: node --import tsx --test tests/gpt-bot-login.test.ts
//
// Real SQLite through the billing fixture (tests/helpers/gpt-billing-fixture.ts):
// billing in test, so only the rehearsal session is offered a provider and
// therefore sign-in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import { onRequestPost as start } from "../functions/api/gpt/auth/bot/start";
import { onRequestPost as status } from "../functions/api/gpt/auth/bot/status";
import { onRequestGet as callback } from "../functions/api/gpt/auth/callback";
import { onRequestGet as account } from "../functions/api/gpt/account";
import { BILLING_ORG, loginMethods } from "../functions/lib/gpt-chat/billing-config";
import {
  BOT_LOGIN_MAX_ACTIVE,
  BOT_LOGIN_TTL_MS,
  BotLoginStore,
  loginChoices,
  loginCode,
} from "../functions/lib/gpt-chat/bot-login-store";
import { browserLabel } from "../functions/lib/gpt-chat/bot-login";
import { IdentityStore } from "../functions/lib/gpt-chat/identity-store";
import { telegramIdentityHash, telegramUserId } from "../functions/lib/gpt-chat/telegram-identity";
import { maintainBilling } from "../functions/lib/gpt-chat/billing-maintenance-store";
import { resolveConfig } from "../functions/lib/gpt-chat/config";
import { hashIp } from "../functions/lib/gpt-chat/hash";
import { TurnStore } from "../functions/lib/gpt-chat/turn-store";
import * as C from "../functions/lib/telegram/i18n";

const ORIGIN = "https://gptbot.uz";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const TELEGRAM_ID = 700_300_400;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** The billing fixture with the bot configured (its two secrets and its username). */
async function setup(extra: Record<string, string> = {}) {
  const f = await billingFixture();
  Object.assign(f.env, {
    TELEGRAM_ASSISTANT_BOT_TOKEN: "assistant-token",
    TELEGRAM_ASSISTANT_WEBHOOK_SECRET: "hook-secret",
    GPT_HANDOFF_BOT_USERNAME: "gptbotuz_bot",
    ...extra,
  });
  const tgHash = (await telegramIdentityHash(f.env.GPT_IDENTITY_SECRET!, TELEGRAM_ID))!;
  return { ...f, tgHash, logins: new BotLoginStore(f.binding, BILLING_ORG) };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

type Handler = typeof start;
function call(
  f: Fixture,
  handler: Handler,
  path: string,
  body: unknown,
  { cookie = f.rehearsal, origin = ORIGIN, ip = "203.0.113.7" }: { cookie?: string; origin?: string; ip?: string } = {},
) {
  return handler(f.ctx(new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", cookie, "CF-Connecting-IP": ip, "User-Agent": ANDROID_CHROME },
    body: JSON.stringify(body),
  })) as unknown as Parameters<Handler>[0]);
}

/** The cookie a Set-Cookie list gives `name`, or undefined. */
function cookieFrom(response: Response, name: string): string | undefined {
  const line = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  return line?.slice(name.length + 1).split(";")[0];
}

interface Started { id: string; mode: string; code: string | null; deepLink: string; expiresAt: number; nonce: string; cookie: string }
async function begin(f: Fixture, over: { cookie?: string; locale?: string; ip?: string } = {}): Promise<Started> {
  const response = await call(f, start, "/api/gpt/auth/bot/start", { locale: over.locale ?? "uz", consent: true }, over);
  const body = (await response.json()) as Omit<Started, "nonce" | "cookie">;
  assert.equal(response.status, 200, JSON.stringify(body));
  const browser = cookieFrom(response, "__Host-gpt_botlogin")!;
  const nonce = new URL(body.deepLink).searchParams.get("start")!.slice("login_".length);
  return { ...body, nonce, cookie: `${over.cookie ?? f.rehearsal}; __Host-gpt_botlogin=${browser}` };
}
async function poll(f: Fixture, attempt: Started, extra: Record<string, unknown> = {}, cookie = attempt.cookie) {
  const response = await call(f, status, "/api/gpt/auth/bot/status", { id: attempt.id, ...extra }, { cookie });
  return { response, body: (await response.json()) as { ok: boolean; status?: string; code?: string } };
}

// ── who is offered sign-in ──────────────────────────────────────────────────

test("sign-in is offered only with a provider: otherwise a missing route, before the body and D1", async () => {
  const f = await setup();
  const view = async (cookie?: string) =>
    (await (await account(f.ctx(new Request(`${ORIGIN}/api/gpt/account`, { headers: cookie ? { cookie } : {} })))).json()) as {
      loginAvailable: boolean;
      loginMethods: string[];
    };
  // Billing is in test: a rehearsal session is offered the bot (and OIDC, configured too).
  assert.deepEqual((await view(f.rehearsal)).loginMethods, ["bot", "oidc"]);
  // Everybody else is offered no provider, so no sign-in either.
  const guest = await view();
  assert.equal(guest.loginAvailable, false);
  assert.deepEqual(guest.loginMethods, []);
  const bomb = { prepare() { throw new Error("DB touched"); }, batch() { throw new Error("DB touched"); } };
  const db = f.env.GPTBOT_DRAFTS_DB;
  f.env.GPTBOT_DRAFTS_DB = bomb as unknown as D1Database;
  for (const [handler, path] of [[start, "/api/gpt/auth/bot/start"], [status, "/api/gpt/auth/bot/status"]] as const)
    assert.equal((await call(f, handler, path, { consent: true, id: "0".repeat(16) }, { cookie: "" })).status, 404, path);
  f.env.GPTBOT_DRAFTS_DB = db;
  // Any other GPT_BOT_LOGIN_MODE turns the bot off; OIDC stays.
  f.env.GPT_BOT_LOGIN_MODE = "off";
  assert.deepEqual((await view(f.rehearsal)).loginMethods, ["oidc"]);
  assert.equal((await call(f, start, "/api/gpt/auth/bot/start", { consent: true })).status, 404);
  f.env.GPT_BOT_LOGIN_MODE = "code";
  assert.deepEqual(loginMethods(f.env), ["bot", "oidc"]);
  // The bot answers only with both of its secrets, and needs a username Telegram accepts.
  for (const broken of [{ TELEGRAM_ASSISTANT_WEBHOOK_SECRET: "" }, { GPT_HANDOFF_BOT_USERNAME: "@x" }, { GPT_IDENTITY_SECRET: "short" }])
    assert.ok(!loginMethods({ ...f.env, ...broken }).includes("bot"), JSON.stringify(broken));
});

// ── start ───────────────────────────────────────────────────────────────────

test("start: same origin and consent first; the answer, the cookie, and only hashes stored", async () => {
  const f = await setup();
  assert.equal((await call(f, start, "/api/gpt/auth/bot/start", { consent: true }, { origin: "https://evil.example" })).status, 403);
  const refused = await call(f, start, "/api/gpt/auth/bot/start", { consent: false });
  assert.equal(refused.status, 400);
  assert.equal(((await refused.json()) as { code: string }).code, "consent_required");

  const before = Date.now();
  const response = await call(f, start, "/api/gpt/auth/bot/start", { locale: "uz", consent: true });
  const body = (await response.json()) as Started;
  assert.equal(response.status, 200);
  assert.match(body.id, /^[0-9a-f]{16}$/);
  assert.equal(body.mode, "pick");
  assert.match(body.code!, /^[1-9]\d$/);
  assert.match(body.deepLink, /^https:\/\/t\.me\/gptbotuz_bot\?start=login_[0-9a-f]{32}$/);
  assert.ok(body.expiresAt >= before + BOT_LOGIN_TTL_MS && body.expiresAt <= Date.now() + BOT_LOGIN_TTL_MS);
  const [line] = response.headers.getSetCookie();
  assert.match(line, /^__Host-gpt_botlogin=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");

  const browser = cookieFrom(response, "__Host-gpt_botlogin")!;
  const nonce = new URL(body.deepLink).searchParams.get("start")!.slice(6);
  const row = f.db.rows<Record<string, unknown>>("SELECT * FROM gpt_bot_logins WHERE id=?", body.id)[0];
  assert.deepEqual(
    { nonce_hash: row.nonce_hash, browser_hash: row.browser_hash, mode: row.mode, code: row.code, locale: row.locale, client: row.client, status: row.status, tg_hash: row.tg_hash },
    { nonce_hash: sha256(nonce), browser_hash: sha256(browser), mode: "pick", code: body.code, locale: "uz", client: "Chrome, Android", status: "pending", tg_hash: null },
  );
  const stored = JSON.stringify(f.db.rows("SELECT * FROM gpt_bot_logins"));
  assert.ok(!stored.includes(nonce) && !stored.includes(browser), "neither the nonce nor the browser's secret is stored");
  assert.ok((row.choices as string).split(",").includes(body.code!));

  // The same browser keeps its secret for its next attempt.
  const again = await call(f, start, "/api/gpt/auth/bot/start", { consent: true }, { cookie: `${f.rehearsal}; __Host-gpt_botlogin=${browser}` });
  assert.equal(cookieFrom(again, "__Host-gpt_botlogin"), browser);
});

test("at most five attempts in flight per browser and ten starts an hour per IP hash", async () => {
  const f = await setup();
  const first = await begin(f);
  for (let i = 1; i < BOT_LOGIN_MAX_ACTIVE; i++) await begin(f, { cookie: first.cookie });
  const sixth = await call(f, start, "/api/gpt/auth/bot/start", { consent: true }, { cookie: first.cookie });
  assert.equal(sixth.status, 429);
  // Another browser behind the same address: four more, then the IP's hour is spent.
  for (let i = 0; i < 4; i++) await begin(f);
  assert.equal((await call(f, start, "/api/gpt/auth/bot/start", { consent: true })).status, 429);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_bot_logins"), 9);
  // Another address is not affected.
  await begin(f, { ip: "198.51.100.9" });
});

// ── status ──────────────────────────────────────────────────────────────────

test("status: only the browser holding the attempt's cookie learns anything", async () => {
  const f = await setup();
  const attempt = await begin(f);
  assert.equal((await call(f, status, "/api/gpt/auth/bot/status", { id: attempt.id }, { cookie: attempt.cookie, origin: "https://evil.example" })).status, 403);
  assert.equal((await poll(f, attempt, {}, f.rehearsal)).response.status, 403, "no cookie");
  assert.equal((await poll(f, attempt, {}, `${f.rehearsal}; __Host-gpt_botlogin=nothex`)).response.status, 403);
  // Another browser's cookie: as if the attempt did not exist.
  assert.deepEqual((await poll(f, attempt, {}, `${f.rehearsal}; __Host-gpt_botlogin=${"c".repeat(64)}`)).body, { ok: true, status: "expired" });
  for (const bad of [{ id: "XYZ" }, { id: attempt.id, code: "12345" }, { id: attempt.id, code: 123456 }]) {
    const response = await call(f, status, "/api/gpt/auth/bot/status", bad, { cookie: attempt.cookie });
    assert.equal(response.status, 400, JSON.stringify(bad));
  }
  assert.deepEqual((await poll(f, attempt)).body, { ok: true, status: "pending" });
});

test("pick: pending, claimed, confirmed, then done exactly once with a new session and the cookies cleared", async () => {
  const f = await setup();
  // This browser is signed in to another account already: that session ends.
  const attempt = await begin(f, { cookie: f.testCookie });
  const oldSession = f.db.value("SELECT COUNT(*) FROM gpt_auth_sessions WHERE user_id=?", f.user);
  assert.equal(oldSession, 1);
  assert.equal((await f.logins.openByNonce(attempt.nonce, f.tgHash)).result, "claimed");
  assert.deepEqual((await poll(f, attempt)).body, { ok: true, status: "claimed" });
  assert.deepEqual(await f.logins.decide(attempt.id, f.tgHash, attempt.code!), { result: "confirmed", locale: "uz" });

  const { response, body } = await poll(f, attempt);
  assert.deepEqual(body, { ok: true, status: "done" });
  const lines = response.headers.getSetCookie();
  assert.match(lines[0], /^__Host-gpt_account=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
  for (const name of ["__Host-gpt_botlogin", "gpt_sid", "gpt_sat"])
    assert.ok(lines.includes(`${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`), name);
  const token = cookieFrom(response, "__Host-gpt_account")!;
  const user = await new IdentityStore(f.binding, BILLING_ORG).user(new Request(ORIGIN, { headers: { cookie: `__Host-gpt_account=${token}` } }));
  assert.equal(f.db.value("SELECT identity_hash FROM gpt_accounts WHERE id=?", user), f.tgHash);
  assert.notEqual(user, f.user);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_auth_sessions WHERE user_id=?", f.user), 0, "the browser's previous session ended");
  assert.equal(f.db.value("SELECT status FROM gpt_bot_logins WHERE id=?", attempt.id), "consumed");

  // A replay of the same cookie gets nothing.
  const sessions = f.db.value("SELECT COUNT(*) FROM gpt_auth_sessions");
  assert.deepEqual((await poll(f, attempt)).body, { ok: true, status: "expired" });
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_auth_sessions"), sessions);

  // Two polls at once (the timer and the tab coming back): one signs in.
  const next = await begin(f);
  await f.logins.openByNonce(next.nonce, f.tgHash);
  await f.logins.decide(next.id, f.tgHash, next.code!);
  const both = await Promise.all([poll(f, next), poll(f, next)]);
  assert.deepEqual(both.map((result) => result.body.status).sort(), ["done", "expired"]);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_auth_sessions"), Number(sessions) + 1);
  // The store settles the race itself: both read "confirmed", one UPDATE wins.
  const raced = await begin(f);
  await f.logins.openByNonce(raced.nonce, f.tgHash);
  await f.logins.decide(raced.id, f.tgHash, raced.code!);
  const browserHash = sha256(raced.cookie.split("__Host-gpt_botlogin=")[1]);
  const results = await Promise.all([f.logins.consume(raced.id, browserHash), f.logins.consume(raced.id, browserHash)]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["done", "expired"]);
});

test("one press: a wrong number or «not me» rejects for good; a foreign or late press changes nothing", async () => {
  const f = await setup();
  const other = (await telegramIdentityHash(f.env.GPT_IDENTITY_SECRET!, TELEGRAM_ID + 1))!;
  const a = await begin(f);
  await f.logins.openByNonce(a.nonce, f.tgHash);
  assert.equal((await f.logins.openByNonce(a.nonce, other)).result, "taken");
  assert.equal((await f.logins.decide(a.id, other, a.code!)).result, "foreign");
  assert.equal((await f.logins.reject(a.id, other)).result, "foreign");
  const wrong = loginChoices(a.code!).split(",").find((n) => n !== a.code)!;
  assert.deepEqual(await f.logins.decide(a.id, f.tgHash, wrong), { result: "rejected", locale: "uz" });
  assert.equal((await f.logins.decide(a.id, f.tgHash, a.code!)).result, "repeat");
  assert.deepEqual((await poll(f, a)).body, { ok: true, status: "rejected" });
  assert.equal((await f.logins.openByNonce(a.nonce, f.tgHash)).result, "stale");

  const b = await begin(f);
  await f.logins.openByNonce(b.nonce, f.tgHash);
  assert.deepEqual(await f.logins.reject(b.id, f.tgHash), { result: "rejected", locale: "uz" });
  assert.equal((await f.logins.reject(b.id, f.tgHash)).result, "repeat");
  assert.deepEqual((await poll(f, b)).body, { ok: true, status: "rejected" });

  // Past its 10 minutes: nothing can be decided or collected.
  const c = await begin(f);
  await f.logins.openByNonce(c.nonce, f.tgHash);
  const late = Date.now() + BOT_LOGIN_TTL_MS + 1;
  assert.equal((await f.logins.decide(c.id, f.tgHash, c.code!, late)).result, "stale");
  assert.equal((await f.logins.openByNonce(c.nonce, f.tgHash, late)).result, "stale");
  assert.deepEqual(await f.logins.consume(c.id, sha256(c.cookie.split("__Host-gpt_botlogin=")[1]), late), { status: "expired" });
  f.db.exec(`UPDATE gpt_bot_logins SET expires_at=${Date.now() - 1} WHERE id='${c.id}'`);
  assert.deepEqual((await poll(f, c)).body, { ok: true, status: "expired" });
});

test("code mode: the code goes to the bot only, is typed in once, and is not spent before the bot is opened", async () => {
  const f = await setup({ GPT_BOT_LOGIN_MODE: "code" });
  const a = await begin(f);
  assert.equal(a.mode, "code");
  assert.equal(a.code, null, "the site never shows the code");
  const code = f.db.value("SELECT code FROM gpt_bot_logins WHERE id=?", a.id) as string;
  assert.match(code, /^[1-9]\d{5}$/);
  assert.equal(f.db.value("SELECT choices FROM gpt_bot_logins WHERE id=?", a.id), null);
  // Typed before anybody opened the link: nothing to sign in to, the try is kept.
  assert.deepEqual((await poll(f, a, { code })).body, { ok: true, status: "pending" });
  await f.logins.openByNonce(a.nonce, f.tgHash);
  // A number press cannot confirm a code attempt.
  assert.equal((await f.logins.decide(a.id, f.tgHash, code.slice(0, 2))).result, "repeat");
  const wrong = code === "999999" ? "100000" : String(Number(code) + 1);
  assert.deepEqual((await poll(f, a, { code: wrong })).body, { ok: true, status: "rejected" });
  assert.deepEqual((await poll(f, a, { code })).body, { ok: true, status: "rejected" }, "one try");

  const b = await begin(f);
  await f.logins.openByNonce(b.nonce, f.tgHash);
  const right = f.db.value("SELECT code FROM gpt_bot_logins WHERE id=?", b.id) as string;
  const { response, body } = await poll(f, b, { code: right });
  assert.deepEqual(body, { ok: true, status: "done" });
  assert.match(cookieFrom(response, "__Host-gpt_account")!, /^[a-f0-9]{64}$/);
  assert.equal(f.db.value("SELECT status FROM gpt_bot_logins WHERE id=?", b.id), "consumed");
});

// ── isolation, sign-out, sweep ──────────────────────────────────────────────

test("org B sees nothing of org A (AGENTS §3)", async () => {
  const f = await setup();
  const a = await begin(f);
  const browserHash = sha256(a.cookie.split("__Host-gpt_botlogin=")[1]);
  const orgB = new BotLoginStore(f.binding, "org-b");
  assert.equal((await orgB.openByNonce(a.nonce, f.tgHash)).result, "stale");
  assert.deepEqual(await orgB.consume(a.id, browserHash), { status: "expired" });
  await f.logins.openByNonce(a.nonce, f.tgHash);
  assert.equal((await orgB.decide(a.id, f.tgHash, a.code!)).result, "stale");
  assert.equal((await orgB.reject(a.id, f.tgHash)).result, "stale");
  assert.equal(f.db.value("SELECT status FROM gpt_bot_logins WHERE id=?", a.id), "claimed");
  // Org A's sessions and attempts are out of org B's reach.
  await new IdentityStore(f.binding, BILLING_ORG).login(f.tgHash);
  assert.deepEqual(await orgB.revokeSessions(f.tgHash), { attempts: 0, sessions: 0 });
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_auth_sessions s JOIN gpt_accounts a ON a.id=s.user_id WHERE a.identity_hash=?", f.tgHash), 1);
  // Org A's attempts do not count toward org B's cap.
  for (let i = 0; i < BOT_LOGIN_MAX_ACTIVE; i++)
    assert.ok(await orgB.create({ nonce: randomBytes(16).toString("hex"), browserHash, mode: "pick", locale: "ru", client: null }));
});

test("sign out everywhere: the account's sessions and its attempts in flight end; again, nothing more", async () => {
  const f = await setup();
  const identity = new IdentityStore(f.binding, BILLING_ORG);
  await identity.login(f.tgHash);
  await identity.login(f.tgHash);
  const a = await begin(f);
  await f.logins.openByNonce(a.nonce, f.tgHash);
  await f.logins.decide(a.id, f.tgHash, a.code!);
  assert.deepEqual(await f.logins.revokeSessions(f.tgHash), { attempts: 1, sessions: 2 });
  assert.deepEqual((await poll(f, a)).body, { ok: true, status: "rejected" }, "the confirmed attempt is never collected");
  assert.deepEqual(await f.logins.revokeSessions(f.tgHash), { attempts: 0, sessions: 0 });
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_auth_sessions WHERE user_id=?", f.user), 1, "other accounts keep theirs");
  // Nobody behind the hash yet: nothing to end, and no error.
  assert.deepEqual(await f.logins.revokeSessions("f".repeat(64)), { attempts: 0, sessions: 0 });
});

test("the maintenance tick sweeps attempts a day after they expire", async () => {
  const f = await setup();
  const now = Date.now();
  for (const [nonce, at] of [["a", now - 2 * 86400_000], ["b", now - 3600_000]] as const)
    await f.logins.create({ nonce: nonce.repeat(32), browserHash: "d".repeat(64), mode: "pick", locale: "ru", client: null }, at);
  await maintainBilling(f.env, now);
  assert.deepEqual(
    f.db.rows<{ nonce_hash: string }>("SELECT nonce_hash FROM gpt_bot_logins").map((row) => row.nonce_hash),
    [sha256("b".repeat(32))],
  );
});

// ── the free allowance and the one account ──────────────────────────────────

test("signing in through the bot leaves the free allowance as it was", async () => {
  const f = await setup();
  const ip = "203.0.113.50";
  const cfg = resolveConfig(f.env);
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const guest = await hashIp(ip, cfg);
  for (let i = 0; i < 3; i++) {
    const turn = await turns.reserve(guest, guest, null, cfg);
    assert.ok(turn.id);
    await turns.finish(turn.id, { outcome: "answered", charged: true });
  }
  const attempt = await begin(f, { ip });
  await f.logins.openByNonce(attempt.nonce, f.tgHash);
  await f.logins.decide(attempt.id, f.tgHash, attempt.code!);
  const { response } = await poll(f, attempt);
  const token = cookieFrom(response, "__Host-gpt_account")!;
  const view = (await (await account(f.ctx(new Request(`${ORIGIN}/api/gpt/account`, {
    headers: { cookie: `${f.rehearsal}; __Host-gpt_account=${token}`, "CF-Connecting-IP": ip },
  })))).json()) as { user: unknown; remaining: number };
  assert.ok(view.user);
  assert.equal(view.remaining, cfg.freeDailyLimit - 3);
});

test("the bot and Telegram's OIDC sign the same person in to one account", async () => {
  const f = await setup();
  const attempt = await begin(f);
  await f.logins.openByNonce(attempt.nonce, f.tgHash);
  await f.logins.decide(attempt.id, f.tgHash, attempt.code!);
  const viaBot = cookieFrom((await poll(f, attempt)).response, "__Host-gpt_account")!;
  const identity = new IdentityStore(f.binding, BILLING_ORG);
  const botUser = await identity.user(new Request(ORIGIN, { headers: { cookie: `__Host-gpt_account=${viaBot}` } }));

  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "local-fixture", alg: "RS256" };
  const token = await new SignJWT({ id: TELEGRAM_ID })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setSubject("oidc-subject-is-not-the-telegram-id")
    .setIssuer("https://oauth.telegram.org")
    .setAudience(f.env.GPT_TELEGRAM_CLIENT_ID!)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input).endsWith("/token") ? Response.json({ id_token: token }) : Response.json({ keys: [jwk] })) as typeof fetch;
  try {
    const state = randomBytes(32).toString("hex");
    await identity.challenge(state, randomBytes(32).toString("hex"), "ru");
    const response = await callback(f.ctx(new Request(`${ORIGIN}/api/gpt/auth/callback?state=${state}&code=fixture`, {
      headers: { cookie: `__Host-gpt_login=${state}` },
    })) as unknown as Parameters<typeof callback>[0]);
    const viaOidc = cookieFrom(response, "__Host-gpt_account")!;
    assert.match(viaOidc, /^[a-f0-9]{64}$/);
    assert.equal(await identity.user(new Request(ORIGIN, { headers: { cookie: `__Host-gpt_account=${viaOidc}` } })), botUser);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_accounts WHERE identity_hash=?", f.tgHash), 1);
  } finally {
    globalThis.fetch = original;
  }
});

// ── small parts ─────────────────────────────────────────────────────────────

test("the identity key: HMAC of tg:<id>, the same for a number and its digits, nothing for anything else", async () => {
  const secret = randomBytes(32).toString("hex");
  const hash = await telegramIdentityHash(secret, 12345);
  assert.equal(hash, createHmac("sha256", secret).update("tg:12345").digest("hex"));
  assert.equal(await telegramIdentityHash(secret, "12345"), hash);
  assert.notEqual(await telegramIdentityHash(randomBytes(32).toString("hex"), 12345), hash);
  for (const bad of [0, -5, 1.5, "12ab", "012", "", null, undefined, 2 ** 53, "9007199254740993"])
    assert.equal(telegramUserId(bad), null, String(bad));
  assert.equal(await telegramIdentityHash("", 12345), null);
});

test("numbers and codes come from the CSPRNG in range; the three choices are distinct and hold the code", () => {
  for (let i = 0; i < 300; i++) {
    const code = loginCode("pick");
    assert.match(code, /^[1-9]\d$/);
    const choices = loginChoices(code).split(",");
    assert.equal(choices.length, 3);
    assert.equal(new Set(choices).size, 3);
    assert.ok(choices.includes(code));
    assert.ok(choices.every((choice) => /^[1-9]\d$/.test(choice)));
    assert.match(loginCode("code"), /^[1-9]\d{5}$/);
  }
});

test("the bot shows the browser family and OS only", () => {
  const cases: Array<[string | null, string | null]> = [
    [ANDROID_CHROME, "Chrome, Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari, iOS"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1", "Chrome, iOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0", "Edge, Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 YaBrowser/24.10 Safari/537.36", "Yandex Browser, Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox, macOS"],
    ["Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36", "Samsung Internet, Android"],
    ["curl/8.4.0", null],
    [null, null],
  ];
  for (const [ua, label] of cases) assert.equal(browserLabel(ua), label, String(ua));
});

test("the bot's copy is plain and in both languages: no price, plan or link", () => {
  const texts = [
    C.loginPrompt("ru", "Chrome, Android", Date.UTC(2026, 9, 3, 9, 7)),
    C.loginPrompt("uz", null, Date.UTC(2026, 9, 3, 9, 7)),
    C.loginCodePrompt("ru", null, 0, "123456"),
    C.loginCodePrompt("uz", null, 0, "123456"),
    ...[C.LOGIN_CONFIRMED, C.LOGIN_REJECTED, C.LOGIN_DENIED, C.LOGIN_STALE, C.LOGIN_TAKEN, C.LOGIN_LIMITED, C.LOGIN_FAILED, C.LOGIN_REVOKED]
      .flatMap((copy) => [copy.ru, copy.uz]),
    ...Object.values(C.LOGIN_TOAST.ru), ...Object.values(C.LOGIN_TOAST.uz),
  ];
  for (const text of texts) {
    assert.doesNotMatch(text, /\d[\d\s\u00a0]*\s?(UZS|сум|so[‘'`ʻ]?m)|Plus|\bPro\b|obuna|подписк|тариф|tarif|https?:|gptbot\.uz\//i, text);
    assert.doesNotMatch(text, /o'|g'/, "o‘ and g‘ use U+2018");
  }
  // 12:07 in Tashkent is 07:07 UTC.
  assert.match(C.loginPrompt("ru", "Chrome, Android", Date.UTC(2026, 9, 3, 7, 7)), /Время запроса: 12:07 по Ташкенту/);
  assert.match(C.loginPrompt("uz", null, 0), /Brauzer: aniqlanmadi/);
  for (const toast of [...Object.values(C.LOGIN_TOAST.ru), ...Object.values(C.LOGIN_TOAST.uz)]) assert.ok(toast.length <= 200);
  const keys = [...C.loginPickKeyboard("uz", "f".repeat(16), ["10", "55", "99"]), ...C.loginCodeKeyboard("ru", "f".repeat(16))].flat();
  for (const key of keys) assert.ok(Buffer.byteLength(key.callback_data!) <= 64, key.callback_data);
});

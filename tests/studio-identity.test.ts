// The studio's signed browser identity (functions/lib/studio/identity.ts), its
// fail-closed Turnstile (turnstile.ts), POST /api/studio/identity and
// GET /api/studio/config. Spec §5.1, §5.2, §6. Real SQLite for the counters
// (tests/helpers/sqlite-d1.ts); Siteverify is a mocked fetch; no network.
// Run: node --import tsx --test tests/studio-identity.test.ts
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { ensureSchema } from "../functions/lib/gpt-chat/schema";
import { ensureBillingSchema } from "../functions/lib/gpt-chat/billing-schema";
import { ensureStudioSchema } from "../functions/lib/studio/schema";
import {
  IDENTITY_YOUNG_MS,
  STUDIO_BID_COOKIE,
  STUDIO_BID_MAX_AGE,
  identityConfigured,
  identityCookie,
  isYoung,
  mintIdentity,
  readIdentity,
  verifyIdentityValue,
} from "../functions/lib/studio/identity";
import { repeatingLocalTestWidget, TURNSTILE_TEST_SECRETS, studioTurnstileConfigured, verifyStudioTurnstile } from "../functions/lib/studio/turnstile";
import { STUDIO_RATE } from "../functions/lib/studio/limits";
import { TERMS_PLAN } from "../functions/lib/studio/plans";
import { publicPlans } from "../functions/lib/studio/checkout";
import { onRequest as identityEndpoint } from "../functions/api/studio/identity";
import { onRequest as configEndpoint } from "../functions/api/studio/config";

const HOUR = 3_600_000;
// Test-only keys, never used anywhere else (letters only, so no scanner reads them as keys).
const IDENTITY_KEY = "studio-identity-test-signing-material-only-for-tests";
const OTHER_KEY = "another-studio-identity-test-signing-material-entirely";
const WIDGET_KEY = "studio-turnstile-test-widget-material";
const KEYS = { GPT_IDENTITY_SECRET: IDENTITY_KEY };
const NOW = Date.UTC(2026, 9, 14, 9, 30);
const API_ON = JSON.stringify({ STUDIO_API: "on" });
test("repeating dummy tokens are allowed only on explicitly enabled local hosts", () => {
  const env = { STUDIO_LOCAL_DEV: 'true', STUDIO_TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRETS[0] };
  assert.equal(repeatingLocalTestWidget(new Request('http://localhost:8791/'), env), true);
  assert.equal(repeatingLocalTestWidget(new Request('https://gptbot.uz/'), env), false);
  assert.equal(repeatingLocalTestWidget(new Request('https://example.com/'), env), false);
  assert.equal(repeatingLocalTestWidget(new Request('http://localhost:8791/'), { ...env, STUDIO_LOCAL_DEV: 'false' }), false);
  assert.equal(repeatingLocalTestWidget(new Request('http://localhost:8791/'), { ...env, STUDIO_TURNSTILE_SECRET_KEY: 'real-secret' }), false);
});
const BID_SHAPE = /^v1\.[A-Za-z0-9_-]{22}\.\d+\.[A-Za-z0-9_-]{22}$/;

// ── The value and the cookie ───────────────────────────────────────────────

test("format v1.<id>.<mintedHour>.<sig>; the cookie is __Host-, HttpOnly, Secure, Lax, Path=/ and lives a year", async () => {
  const minted = await mintIdentity(KEYS, NOW);
  assert.ok(minted);
  assert.match(minted.value, BID_SHAPE);
  const [, id, hour, sig] = minted.value.split(".");
  assert.equal(Buffer.from(id, "base64url").length, 16);
  assert.equal(Buffer.from(sig, "base64url").length, 16);
  assert.equal(Number(hour), Math.floor(NOW / HOUR));
  assert.equal(STUDIO_BID_MAX_AGE, 31_536_000);
  assert.equal(minted.cookie, `__Host-studio_bid=${minted.value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
  assert.equal(identityCookie(minted.value), minted.cookie);
  assert.doesNotMatch(minted.cookie, /Domain=/i);
  // A fresh identity is young; its subject is "b:" + 32 hex and does not carry the id.
  assert.equal(minted.identity.young, true);
  assert.match(minted.identity.subject, /^b:[0-9a-f]{32}$/);
  assert.ok(!minted.identity.subject.includes(id));
});

test("a minted value verifies to the same subject; every mint is a new browser", async () => {
  const one = (await mintIdentity(KEYS, NOW))!;
  const two = (await mintIdentity(KEYS, NOW))!;
  assert.notEqual(one.value, two.value);
  assert.notEqual(one.identity.subject, two.identity.subject);
  const again = await verifyIdentityValue(one.value, KEYS, NOW + 5 * HOUR);
  assert.deepEqual(again, { subject: one.identity.subject, mintedHour: Math.floor(NOW / HOUR), young: true });
  // The cookie is found among others.
  const request = new Request("https://gptbot.uz/api/studio/me", { headers: { cookie: `a=1; ${STUDIO_BID_COOKIE}=${one.value}; gpt_sid=x` } });
  assert.equal((await readIdentity(request, KEYS, NOW))?.subject, one.identity.subject);
  assert.equal(await readIdentity(new Request("https://gptbot.uz/"), KEYS, NOW), null);
});

test("forged, truncated, re-dated or foreign-key values prove nothing", async () => {
  const { value } = (await mintIdentity(KEYS, NOW))!;
  const [v, id, hour, sig] = value.split(".");
  const flip = (text: string, at: number) => text.slice(0, at) + (text[at] === "A" ? "B" : "A") + text.slice(at + 1);
  const bad = [
    "",
    "v1",
    `${v}.${id}.${hour}`,
    `${v}.${id}.${hour}.${sig}.x`,
    `v2.${id}.${hour}.${sig}`,
    `V1.${id}.${hour}.${sig}`,
    `${v}.${flip(id, 3)}.${hour}.${sig}`,
    `${v}.${id}.${hour}.${flip(sig, 5)}`,
    `${v}.${id}.${Number(hour) - 1}.${sig}`,
    `${v}.${id}.${hour}.${sig.slice(0, 21)}`,
    `${v}.${id.slice(0, 21)}.${hour}.${sig}`,
    `${v}.${id}.${hour}.${sig}A`,
    ` ${value}`,
    `${value} `,
    `${v}.${id}.-${hour}.${sig}`,
  ];
  for (const candidate of bad) assert.equal(await verifyIdentityValue(candidate, KEYS, NOW), null, candidate);
  // Signed with another secret: nothing.
  assert.equal(await verifyIdentityValue(value, { GPT_IDENTITY_SECRET: OTHER_KEY }, NOW), null);
  const foreign = (await mintIdentity({ GPT_IDENTITY_SECRET: OTHER_KEY }, NOW))!;
  assert.equal(await verifyIdentityValue(foreign.value, KEYS, NOW), null);
  // The real one still passes.
  assert.ok(await verifyIdentityValue(value, KEYS, NOW));
});

test("fail-closed without a usable GPT_IDENTITY_SECRET: nothing is minted, nothing verifies", async () => {
  const { value } = (await mintIdentity(KEYS, NOW))!;
  for (const env of [{}, { GPT_IDENTITY_SECRET: "" }, { GPT_IDENTITY_SECRET: "short-key" }, { GPT_IDENTITY_SECRET: IDENTITY_KEY.slice(0, 31) }]) {
    assert.equal(identityConfigured(env), false);
    assert.equal(await mintIdentity(env, NOW), null);
    assert.equal(await verifyIdentityValue(value, env, NOW), null);
  }
  assert.equal(identityConfigured(KEYS), true);
});

test("time: an hour of clock slack ahead; nothing older than the cookie's year", async () => {
  const { value } = (await mintIdentity(KEYS, NOW))!;
  const minted = Math.floor(NOW / HOUR) * HOUR;
  // Seen by an isolate whose clock is an hour behind: still fine. Two hours: refused.
  assert.ok(await verifyIdentityValue(value, KEYS, minted - HOUR));
  assert.equal(await verifyIdentityValue(value, KEYS, minted - 2 * HOUR), null);
  // A year later the browser has dropped it; a replayed copy is refused too.
  assert.ok(await verifyIdentityValue(value, KEYS, minted + STUDIO_BID_MAX_AGE * 1000));
  assert.equal(await verifyIdentityValue(value, KEYS, minted + STUDIO_BID_MAX_AGE * 1000 + 2 * HOUR), null);
});

test("young: less than a day after the start of the minting hour; old from then on", async () => {
  const minted = (await mintIdentity(KEYS, NOW))!;
  const start = minted.identity.mintedHour * HOUR;
  assert.equal(IDENTITY_YOUNG_MS, 86_400_000);
  assert.equal((await verifyIdentityValue(minted.value, KEYS, start + IDENTITY_YOUNG_MS - 1))?.young, true);
  assert.equal((await verifyIdentityValue(minted.value, KEYS, start + IDENTITY_YOUNG_MS))?.young, false);
  assert.equal((await verifyIdentityValue(minted.value, KEYS, start + 30 * 86_400_000))?.young, false);
  assert.equal(isYoung(10, 10 * HOUR), true);
  assert.equal(isYoung(10, 34 * HOUR), false);
});

// ── Turnstile, fail-closed ──────────────────────────────────────────────────

interface SiteverifyCall {
  secret: string;
  response: string;
  remoteip: string | null;
}

/** Siteverify answers `answer` (or throws when it is an Error); the calls are recorded. */
function siteverify(context: TestContext, answer: Record<string, unknown> | Error | number) {
  const calls: SiteverifyCall[] = [];
  context.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const form = init?.body as FormData;
    calls.push({ secret: String(form.get("secret")), response: String(form.get("response")), remoteip: form.get("remoteip") as string | null });
    if (answer instanceof Error) throw answer;
    if (typeof answer === "number") return new Response("{}", { status: answer });
    return Response.json(answer);
  });
  return calls;
}

const PASS = { success: true, action: "studio_identity", hostname: "gptbot.uz" };
const turnstileEnv = (extra: Record<string, string> = {}) => ({ STUDIO_RUNTIME_CONFIG_JSON: API_ON, STUDIO_TURNSTILE_SECRET_KEY: WIDGET_KEY, ...extra });
const site = (path = "/api/studio/identity", host = "https://gptbot.uz") =>
  new Request(`${host}${path}`, { method: "POST", headers: { "CF-Connecting-IP": "203.0.113.7" } });

test("no studio secret: refused as not configured, even though the chat's own check would pass everybody", async (context) => {
  const calls = siteverify(context, PASS);
  for (const env of [{}, { STUDIO_TURNSTILE_SECRET_KEY: "" }, { STUDIO_TURNSTILE_SECRET_KEY: "   " }, { TURNSTILE_SECRET_KEY: WIDGET_KEY }]) {
    assert.equal(studioTurnstileConfigured(site(), env), false);
    assert.deepEqual(await verifyStudioTurnstile(site(), env, "token", "studio_identity"), { ok: false, code: "studio_not_configured" });
  }
  assert.equal(calls.length, 0);
});

test("a token carries the path's action and the request's host; anything else is refused", async (context) => {
  const calls = siteverify(context, PASS);
  assert.deepEqual(await verifyStudioTurnstile(site(), turnstileEnv(), "token-ok", "studio_identity"), { ok: true });
  assert.deepEqual(calls, [{ secret: WIDGET_KEY, response: "token-ok", remoteip: "203.0.113.7" }]);
  // The same answer for another action, or Siteverify naming another host: refused.
  assert.deepEqual(await verifyStudioTurnstile(site(), turnstileEnv(), "token-ok", "studio_free_deck"), { ok: false, code: "turnstile_failed" });
  context.mock.restoreAll();
  siteverify(context, { ...PASS, hostname: "evil.example" });
  assert.deepEqual(await verifyStudioTurnstile(site(), turnstileEnv(), "token-ok", "studio_identity"), { ok: false, code: "turnstile_failed" });
});

test("no token, a rejected token, an oversized token: 403; Siteverify down: 503, never a pass", async (context) => {
  let calls = siteverify(context, { success: false });
  for (const token of [undefined, null, "", "   ", 42, {}]) {
    assert.deepEqual(await verifyStudioTurnstile(site(), turnstileEnv(), token, "studio_identity"), { ok: false, code: "turnstile_required" }, String(token));
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await verifyStudioTurnstile(site(), turnstileEnv(), "token-bad", "studio_identity"), { ok: false, code: "turnstile_failed" });
  assert.deepEqual(await verifyStudioTurnstile(site(), turnstileEnv(), "t".repeat(2049), "studio_identity"), { ok: false, code: "turnstile_failed" });
  assert.equal(calls.length, 1);
  for (const answer of [new Error("network down"), 500]) {
    context.mock.restoreAll();
    calls = siteverify(context, answer);
    assert.deepEqual(await verifyStudioTurnstile(site(), turnstileEnv(), "token-ok", "studio_identity"), { ok: false, code: "studio_busy" });
    assert.equal(calls.length, 1);
  }
});

test("Cloudflare's test secrets count only on a local host under STUDIO_LOCAL_DEV; on gptbot.uz they are no secret", async (context) => {
  const calls = siteverify(context, { success: true, hostname: "example.com", action: "" });
  const [alwaysPass] = TURNSTILE_TEST_SECRETS;
  const local = turnstileEnv({ STUDIO_TURNSTILE_SECRET_KEY: alwaysPass, STUDIO_LOCAL_DEV: "true" });
  assert.equal(studioTurnstileConfigured(site(), local), false);
  assert.deepEqual(await verifyStudioTurnstile(site(), local, "XXXX.DUMMY.TOKEN.XXXX", "studio_identity"), { ok: false, code: "studio_not_configured" });
  const localRequest = site("/api/studio/identity", "http://localhost:8788");
  assert.equal(studioTurnstileConfigured(localRequest, local), true);
  assert.deepEqual(await verifyStudioTurnstile(localRequest, local, "XXXX.DUMMY.TOKEN.XXXX", "studio_identity"), { ok: true });
  // Without STUDIO_LOCAL_DEV a local host is no studio host at all.
  const plain = turnstileEnv({ STUDIO_TURNSTILE_SECRET_KEY: alwaysPass });
  assert.equal(studioTurnstileConfigured(localRequest, plain), false);
  assert.equal(calls.length, 1);
});

// ── POST /api/studio/identity ───────────────────────────────────────────────

async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  await ensureStudioSchema(db.asD1());
  return db;
}

function endpointEnv(db: SqliteD1 | null, extra: Record<string, unknown> = {}) {
  return {
    STUDIO_RUNTIME_CONFIG_JSON: API_ON,
    GPT_IDENTITY_SECRET: IDENTITY_KEY,
    STUDIO_TURNSTILE_SECRET_KEY: WIDGET_KEY,
    GPTBOT_DRAFTS_DB: db?.asD1(),
    ...extra,
  };
}

function identityRequest(options: { host?: string; origin?: string | null; body?: unknown; cookie?: string; ip?: string; method?: string } = {}) {
  const host = options.host ?? "https://gptbot.uz";
  const headers: Record<string, string> = { "Content-Type": "application/json", "CF-Connecting-IP": options.ip ?? "203.0.113.7" };
  const origin = options.origin === undefined ? host : options.origin;
  if (origin) headers.Origin = origin;
  if (options.cookie) headers.cookie = options.cookie;
  const method = options.method ?? "POST";
  return new Request(`${host}/api/studio/identity`, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(options.body ?? { turnstileToken: "token-ok" }) : undefined,
  });
}

function call(handler: (context: never) => Response | Promise<Response>, request: Request, env: Record<string, unknown>): Promise<Response> {
  return handler({
    request, env, params: {}, data: {}, functionPath: new URL(request.url).pathname,
    waitUntil: () => undefined, passThroughOnException: () => undefined,
    next: () => { throw new Error("next() called"); },
  } as never) as Promise<Response>;
}

test("identity is issued only after Turnstile, as a valid year-long cookie, with no row about it", async (context) => {
  const calls = siteverify(context, PASS);
  const db = await database();
  const response = await call(identityEndpoint, identityRequest(), endpointEnv(db));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const cookie = response.headers.get("set-cookie") ?? "";
  const value = /^__Host-studio_bid=([^;]+); Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000$/.exec(cookie)?.[1];
  assert.ok(value && BID_SHAPE.test(value), cookie);
  assert.ok(await verifyIdentityValue(value, KEYS));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].secret, WIDGET_KEY);
  // Only the hourly counters of the address were written (its tries and its
  // identities); nothing in the studio tables.
  assert.equal(db.value("SELECT COUNT(*) FROM studio_free_usage"), 0);
  const rows = db.rows<{ action: string; subject: string; count: number }>("SELECT action, subject, count FROM gpt_rate_limits ORDER BY action");
  assert.deepEqual(rows.map((row) => [row.action, row.count]), [["studio_identity", 1]]);
  for (const row of rows) {
    assert.match(row.subject, /^[0-9a-f]{64}$/);
    assert.ok(!row.subject.includes("203.0.113.7"));
  }
});

test("a valid cookie already: {ok} without a new cookie, Turnstile or D1", async (context) => {
  const calls = siteverify(context, PASS);
  const { value } = (await mintIdentity(KEYS))!;
  const throwing = new Proxy({}, { get: () => { throw new Error("D1 touched"); } });
  const response = await call(identityEndpoint, identityRequest({ cookie: `${STUDIO_BID_COOKIE}=${value}`, body: {} }), { ...endpointEnv(null), GPTBOT_DRAFTS_DB: throwing });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(calls.length, 0);
  // A forged cookie is no cookie: Turnstile again.
  const db = await database();
  const tampered = value.slice(0, -3) + (value.at(-3) === "A" ? "B" : "A") + value.slice(-2);
  const forged = await call(identityEndpoint, identityRequest({ cookie: `${STUDIO_BID_COOKIE}=${tampered}`, body: {} }), endpointEnv(db));
  assert.equal(forged.status, 403);
  assert.equal((await forged.json()).code, "turnstile_required");
});

test("Turnstile refused, missing or unreachable: no cookie", async (context) => {
  const db = await database();
  const calls = siteverify(context, { success: false });
  const failed = await call(identityEndpoint, identityRequest(), endpointEnv(db));
  assert.equal(failed.status, 403);
  assert.equal((await failed.json()).code, "turnstile_failed");
  assert.equal(failed.headers.get("set-cookie"), null);
  const missing = await call(identityEndpoint, identityRequest({ body: { other: 1 } }), endpointEnv(db));
  assert.equal(missing.status, 403);
  assert.equal((await missing.json()).code, "turnstile_required");
  assert.equal(calls.length, 1);
  context.mock.restoreAll();
  const downCalls = siteverify(context, new Error("down"));
  const down = await call(identityEndpoint, identityRequest({body:{turnstileToken:"new-down-token"}}), endpointEnv(db));
  assert.equal(down.status, 503);
  assert.equal((await down.json()).code, "studio_busy");
  assert.equal(down.headers.get("set-cookie"), null);
  assert.equal(downCalls.length, 1);
});

test("fail-closed: no Turnstile secret, no identity secret or no D1 → 503 studio_not_configured before Siteverify", async (context) => {
  const calls = siteverify(context, PASS);
  const db = await database();
  for (const env of [
    endpointEnv(db, { STUDIO_TURNSTILE_SECRET_KEY: undefined }),
    endpointEnv(db, { STUDIO_TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRETS[0] }),
    endpointEnv(db, { GPT_IDENTITY_SECRET: undefined }),
    endpointEnv(db, { GPT_IDENTITY_SECRET: "too-short" }),
    endpointEnv(null),
  ]) {
    const response = await call(identityEndpoint, identityRequest(), env);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "studio_not_configured");
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal(calls.length, 0);
  assert.equal(db.value("SELECT COUNT(*) FROM gpt_rate_limits"), 0);
});

test("60 identities an hour per address, counted after Turnstile and read before it; an IPv6 /64 is one address", async (context) => {
  const calls = siteverify(context, PASS);
  const db = await database();
  assert.equal(STUDIO_RATE.identity.limit, 60);
  for (let i = 0; i < 60; i++) {
    const response = await call(identityEndpoint, identityRequest({ ip: `2001:db8:1:2:${i.toString(16)}::1`, body: { turnstileToken: `valid-${i}` } }), endpointEnv(db));
    assert.equal(response.status, 200, `request ${i}`);
  }
  const over = await call(identityEndpoint, identityRequest({ ip: "2001:db8:1:2:ffff::9" }), endpointEnv(db));
  assert.equal(over.status, 429);
  assert.equal((await over.json()).code, "rate_limited");
  assert.ok(Number(over.headers.get("retry-after")) > 0);
  // The full hour is read before Turnstile: the 61st costs no Siteverify call.
  assert.equal(calls.length, 60);
  assert.equal(db.value("SELECT count FROM gpt_rate_limits WHERE action='studio_identity'"), 60);
  // Another network is not affected.
  assert.equal((await call(identityEndpoint, identityRequest({ ip: "2001:db8:1:3::1" }), endpointEnv(db))).status, 200);
});

/** Siteverify that passes "token-ok" only; every other token fails. */
function siteverifyByToken(context: TestContext) {
  const calls: string[] = [];
  context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    const response = String((init?.body as FormData).get("response"));
    calls.push(response);
    return Response.json(response === "token-ok" ? PASS : { success: false, "error-codes": ["invalid-input-response"] });
  });
  return calls;
}

test("requests without a valid token never fill the address's identities: a neighbour behind the same NAT still gets one", async (context) => {
  const calls = siteverifyByToken(context);
  const db = await database();
  const shared = "203.0.113.77";
  // 70 posts with no token at all: refused before Siteverify, never counted as identities.
  for (let i = 0; i < 70; i++) {
    const response = await call(identityEndpoint, identityRequest({ ip: shared, body: { turnstileToken: "" } }), endpointEnv(db));
    assert.equal(response.status, 403, `tokenless ${i}`);
    assert.equal((await response.json()).code, "turnstile_required");
  }
  assert.equal(calls.length, 0);
  // Malformed tokens cost a Siteverify call each, and are refused there; they are not identities either.
  for (let i = 0; i < 5; i++) {
    const response = await call(identityEndpoint, identityRequest({ ip: shared, body: { turnstileToken: `garbage-${i}` } }), endpointEnv(db));
    assert.equal((await response.json()).code, "turnstile_failed");
  }
  assert.equal(calls.length, 5);
  assert.equal(db.value("SELECT COUNT(*) FROM gpt_rate_limits WHERE action='studio_identity'"), 0);
  assert.equal(db.value("SELECT count FROM gpt_rate_limits WHERE action='studio_identity_try'"), null);
  // A real visitor behind the same address passes Turnstile and gets an identity.
  const visitor = await call(identityEndpoint, identityRequest({ ip: shared }), endpointEnv(db));
  assert.equal(visitor.status, 200);
  assert.match(visitor.headers.get("set-cookie") ?? "", /^__Host-studio_bid=v1\./);
  assert.equal(calls.length, 6);
  assert.deepEqual(calls.slice(-1), ["token-ok"]);
  assert.equal(db.value("SELECT count FROM gpt_rate_limits WHERE action='studio_identity'"), 1);
});

test("600 unique failed tokens leave no NAT debt for the next verified neighbour", async (context) => {
  const calls=siteverifyByToken(context); const db=await database();
  for(let i=0;i<600;i++) {
    const response=await call(identityEndpoint,identityRequest({ip:"203.0.113.78",body:{turnstileToken:`invalid-${i}`}}),endpointEnv(db));
    assert.equal(response.status,403);
  }
  const next=await call(identityEndpoint,identityRequest({ip:"203.0.113.78"}),endpointEnv(db));
  assert.equal(next.status,200);assert.equal(calls.length,601);
  assert.equal(db.value("SELECT count FROM gpt_rate_limits WHERE action='studio_identity'"),1);
  assert.equal(db.value("SELECT COUNT(*) FROM studio_unit_ledger"),0);
});

test("a counter D1 cannot write refuses (503): degraded is never a pass", async (context) => {
  const calls = siteverify(context, PASS);
  const db = await database();
  db.exec("DROP TABLE gpt_rate_limits");
  db.exec("CREATE TABLE gpt_rate_limits (action TEXT)"); // the bootstrap keeps it; every write fails
  const response = await call(identityEndpoint, identityRequest(), endpointEnv(db));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "studio_busy");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(calls.length, 0);
});

test("POST from this origin only, JSON bodies only, POST only", async (context) => {
  siteverify(context, PASS);
  const db = await database();
  for (const origin of ["https://evil.example", "null", null, "http://gptbot.uz", "https://www.gptbot.uz"]) {
    const response = await call(identityEndpoint, identityRequest({ origin }), endpointEnv(db));
    assert.equal(response.status, 400, String(origin));
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const notJson = new Request("https://gptbot.uz/api/studio/identity", { method: "POST", headers: { Origin: "https://gptbot.uz" }, body: "{" });
  assert.equal((await (await call(identityEndpoint, notJson, endpointEnv(db))).json()).code, "bad_json");
  const array = await call(identityEndpoint, identityRequest({ body: ["token-ok"] }), endpointEnv(db));
  assert.equal((await array.json()).code, "bad_json");
  const huge = await call(identityEndpoint, identityRequest({ body: { turnstileToken: "t".repeat(5000) } }), endpointEnv(db));
  assert.equal(huge.status, 413);
  const get = await call(identityEndpoint, identityRequest({ method: "GET" }), endpointEnv(db));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
});

test("switch off or a preview host: 404 before the body, D1 or Turnstile", async (context) => {
  const calls = siteverify(context, PASS);
  const db = await database();
  const cases: Array<[string, Record<string, unknown>]> = [
    ["https://gptbot.uz", endpointEnv(db, { STUDIO_RUNTIME_CONFIG_JSON: undefined })],
    ["https://gptbot.uz", endpointEnv(db, { STUDIO_RUNTIME_CONFIG_JSON: JSON.stringify({ STUDIO_PAID_SERVICE: "on" }) })],
    ["https://ai-direct-pro-landing.pages.dev", endpointEnv(db)],
    ["https://abc123.ai-direct-pro-landing.pages.dev", endpointEnv(db)],
    ["http://localhost:8788", endpointEnv(db)],
  ];
  for (const [host, env] of cases) {
    const request = identityRequest({ host });
    const response = await call(identityEndpoint, request, env);
    assert.equal(response.status, 404, host);
    assert.equal(request.bodyUsed, false);
  }
  assert.equal(calls.length, 0);
  assert.equal(db.value("SELECT COUNT(*) FROM gpt_rate_limits"), 0);
});

test("local rehearsal: localhost under STUDIO_LOCAL_DEV with Cloudflare's always-pass key issues an identity", async (context) => {
  siteverify(context, { success: true, hostname: "example.com", action: "" });
  const db = await database();
  const env = endpointEnv(db, { STUDIO_LOCAL_DEV: "true", STUDIO_TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRETS[0] });
  const response = await call(identityEndpoint, identityRequest({ host: "http://localhost:8788", body: { turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" } }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-studio_bid=v1\./);
});

// ── GET /api/studio/config ──────────────────────────────────────────────────

/** An env whose D1 and AI bindings throw on any use, and that carries no secret. */
function noBackendEnv(json: string | undefined, extra: Record<string, unknown> = {}) {
  const throwing = new Proxy({}, { get: () => { throw new Error("backend touched"); } });
  return { STUDIO_RUNTIME_CONFIG_JSON: json, GPTBOT_DRAFTS_DB: throwing, AI: throwing, ...extra };
}
const getConfig = (host = "https://gptbot.uz") => new Request(`${host}/api/studio/config`);

test("/config: the public settings, the same for everybody, without D1, cookies or secrets", async () => {
  const response = await call(configEndpoint, getConfig(), noBackendEnv(JSON.stringify({ STUDIO_API: "on", STUDIO_FREE_DECK: "true" })));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    tools: { freeDeck: true, fullDeck: false, photo: false },
    // Who sells is STUDIO_PAYMENT_PROVIDERS and the cash desks' state (lib/studio/checkout.ts readyProviders): nobody by default.
    payments: { mode: null, providers: [] },
    plans: [],
    free: { presentation: 1, photo: 2, resetsAt: "05:00 Asia/Tashkent" },
    shapes: {
      free: { minSlides: 4, maxSlides: 6, images: 2, imageRetries: 2, notes: false, palettes: 1 },
      full: { minSlides: 6, maxSlides: 12, images: 8, notes: true, palettes: 3 },
    },
    turnstileSiteKey: null,
    termsVersion: null,
    terms: { ru: null, uz: null },
    aiLabel: true,
  });
});

test("/config: prices only while payments are on, and only those of an edition that sells", async () => {
  // The edition TERMS_PLAN sells (stream F names it), never pinned here.
  const EDITION = Object.keys(TERMS_PLAN)[0] ?? "";
  const live = {
    STUDIO_API: "on", STUDIO_PAID_SERVICE: "on", STUDIO_FULL_DECK: "true", STUDIO_PHOTO: "true", STUDIO_PAYMENTS: "live",
    STUDIO_TERMS_VERSION: EDITION, STUDIO_TERMS_RU: "https://gptbot.uz/ru/oferta/", STUDIO_TERMS_UZ: "https://gptbot.uz/uz/oferta/",
    STUDIO_TURNSTILE_SITE_KEY: "0x4AAAAAAAStudioSiteKey", STUDIO_MAX_SLIDES: "15", STUDIO_AI_LABEL: "false",
  };
  const body = await (await call(configEndpoint, getConfig(), noBackendEnv(JSON.stringify(live)))).json();
  assert.deepEqual(body.tools, { freeDeck: false, fullDeck: true, photo: true });
  // No provider is listed (STUDIO_PAYMENT_PROVIDERS ""), so none sells: tests/studio-checkout.test.ts covers who does.
  assert.deepEqual(body.payments, { mode: "live", providers: [] });
  // The edition's own tariffs (checkout.ts publicPlans); prices and deck counts are the same in every quota version.
  assert.deepEqual(body.plans, publicPlans(EDITION));
  assert.deepEqual(
    body.plans.map((plan: { id: string; itemId: string; amountTiyin: number; amountUzs: number; presentationFull: number; regenPerUnit: number }) => [plan.id, plan.itemId, plan.amountTiyin, plan.amountUzs, plan.presentationFull, plan.regenPerUnit]),
    [["kunlik", "studio_kunlik", 590_000, 5_900, 1, 1], ["oylik", "studio_oylik", 3_990_000, 39_900, 10, 1]],
  );
  assert.equal(body.shapes.full.maxSlides, 15);
  assert.equal(body.turnstileSiteKey, "0x4AAAAAAAStudioSiteKey");
  assert.equal(body.termsVersion, EDITION);
  assert.deepEqual(body.terms, { ru: "https://gptbot.uz/ru/oferta/", uz: "https://gptbot.uz/uz/oferta/" });
  assert.equal(body.aiLabel, false);
  // An edition without a quota version sells nothing.
  const chatTerms = await (await call(configEndpoint, getConfig(), noBackendEnv(JSON.stringify({ ...live, STUDIO_TERMS_VERSION: "ai-paket-2026-10-v2" })))).json();
  assert.deepEqual(chatTerms.plans, []);
  // Payments off: no prices at all, whatever the edition.
  const off = await (await call(configEndpoint, getConfig(), noBackendEnv(JSON.stringify({ ...live, STUDIO_PAYMENTS: "off" })))).json();
  assert.deepEqual([off.payments.mode, off.plans], [null, []]);
  // "test" payments exist only on a local host.
  const test = { ...live, STUDIO_PAYMENTS: "test" };
  assert.equal((await (await call(configEndpoint, getConfig(), noBackendEnv(JSON.stringify(test)))).json()).payments.mode, null);
  const local = await (await call(configEndpoint, getConfig("http://127.0.0.1:8788"), noBackendEnv(JSON.stringify(test), { STUDIO_LOCAL_DEV: "true" }))).json();
  assert.equal(local.payments.mode, "test");
  assert.equal(local.plans.length, 2);
});

test("/config: 404 with the switches off or on a preview host; GET only", async () => {
  assert.equal((await call(configEndpoint, getConfig(), noBackendEnv(undefined))).status, 404);
  assert.equal((await call(configEndpoint, getConfig(), noBackendEnv(JSON.stringify({ STUDIO_FREE_DECK: "true" })))).status, 404);
  assert.equal((await call(configEndpoint, getConfig("https://ai-direct-pro-landing.pages.dev"), noBackendEnv(API_ON))).status, 404);
  assert.equal((await call(configEndpoint, getConfig(), noBackendEnv(JSON.stringify({ STUDIO_PAID_SERVICE: "on" })))).status, 200);
  const post = await call(configEndpoint, new Request("https://gptbot.uz/api/studio/config", { method: "POST" }), noBackendEnv(API_ON));
  assert.equal(post.status, 405);
});

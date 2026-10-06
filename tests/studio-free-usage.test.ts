// The free daily units (functions/lib/studio/free-usage.ts), the brakes around
// them (limits.ts) and GET /api/studio/me. Spec §2.6, §4.3, §5.4.
// Real SQLite (tests/helpers/sqlite-d1.ts); no network, no remote database.
// Run: node --import tsx --test tests/studio-free-usage.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { ensureSchema } from "../functions/lib/gpt-chat/schema";
import { ensureBillingSchema } from "../functions/lib/gpt-chat/billing-schema";
import { STUDIO_ORG, ensureStudioSchema } from "../functions/lib/studio/schema";
import { parseStudioConfig } from "../functions/lib/studio/config";
import {
  FREE_RESETS_AT,
  FreeUsageStore,
  RETURNED_DAILY_CAP,
  SITE_SUBJECT,
  admitFreeUnit,
  freeDay,
  freeLeft,
  ipSubject,
  nextFreeResetAt,
  type FreeAdmissionInput,
} from "../functions/lib/studio/free-usage";
import {
  STUDIO_FREE_BUCKET,
  STUDIO_RATE,
  freeBudgetGate,
  paceIdentity,
  paceJobStart,
  recordStudioAlerts,
  studioAddress,
} from "../functions/lib/studio/limits";
import { STUDIO_BID_COOKIE, mintIdentity, verifyIdentityValue } from "../functions/lib/studio/identity";
import { onRequest as meEndpoint } from "../functions/api/studio/me";
import { onRequest as identityEndpoint } from "../functions/api/studio/identity";

/** 2026-10-14 10:00 in Tashkent (UTC+5). */
const NOW = Date.UTC(2026, 9, 14, 5, 0);
const ADDRESS = "a".repeat(64);
const OTHER_ADDRESS = "b".repeat(64);
const subject = (n: number) => `b:${n.toString(16).padStart(32, "0")}`;
const config = (values: Record<string, string> = {}) => parseStudioConfig(JSON.stringify({ STUDIO_API: "on", STUDIO_FREE_DECK: "true", STUDIO_PHOTO: "true", ...values }));
const OPEN = config({ STUDIO_RAMP_DECKS_DAILY: "" });

async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  await ensureStudioSchema(db.asD1());
  return db;
}

function admit(db: SqliteD1 | D1Database, input: Partial<FreeAdmissionInput> & { subject: string }) {
  const d1 = db instanceof SqliteD1 ? db.asD1() : db;
  return admitFreeUnit(d1, { config: OPEN, young: false, address: ADDRESS, unit: "presentation_free", now: NOW, ...input });
}

const counter = (db: SqliteD1, who: string, unit: string, day = freeDay(NOW)) =>
  Number(db.value("SELECT used FROM studio_free_usage WHERE org_id=? AND day=? AND subject=? AND unit=?", STUDIO_ORG, day, who, unit) ?? 0);

function spend(db: SqliteD1, reservedMicro: number, actualMicro = 0, day = freeDay(NOW), bucket = STUDIO_FREE_BUCKET) {
  db.exec("DELETE FROM gpt_model_spend");
  db.sqlite
    .prepare("INSERT INTO gpt_model_spend(org_id,day,bucket,reserved_micro,actual_micro,attempts) VALUES(?,?,?,?,?,1)")
    .run(STUDIO_ORG, day, bucket, reservedMicro, actualMicro);
}

// ── The day ─────────────────────────────────────────────────────────────────

test("the free day is the UTC date: it turns at 05:00 in Tashkent, not at midnight", () => {
  const before = Date.parse("2026-10-14T04:59:59+05:00");
  const at = Date.parse("2026-10-14T05:00:00+05:00");
  assert.equal(freeDay(before), "2026-10-13");
  assert.equal(freeDay(at), "2026-10-14");
  assert.equal(freeDay(Date.parse("2026-10-14T00:30:00+05:00")), "2026-10-13");
  assert.equal(nextFreeResetAt(before), at);
  assert.equal(nextFreeResetAt(at), Date.parse("2026-10-15T05:00:00+05:00"));
  assert.equal(FREE_RESETS_AT, "05:00 Asia/Tashkent");
});

test("one free deck a day: the second at 04:59 is refused until the unit returns at 05:00", async () => {
  const db = await database();
  const evening = Date.parse("2026-10-13T20:00:00+05:00");
  const lastMinute = Date.parse("2026-10-14T04:59:00+05:00");
  const reset = Date.parse("2026-10-14T05:00:00+05:00");
  assert.deepEqual(await admit(db, { subject: subject(1), now: evening }), { ok: true, day: "2026-10-13", alerts: [] });
  const refused = await admit(db, { subject: subject(1), now: lastMinute });
  assert.deepEqual(refused, { ok: false, code: "free_limit", resetsAt: new Date(reset).toISOString(), retryAfterSeconds: 60, alerts: [] });
  assert.deepEqual(await admit(db, { subject: subject(1), now: reset }), { ok: true, day: "2026-10-14", alerts: [] });
  // Two photos a day, apart from the deck.
  const photo = { subject: subject(1), unit: "photo_task" as const, now: reset };
  assert.equal((await admit(db, photo)).ok, true);
  assert.equal((await admit(db, photo)).ok, true);
  const third = await admit(db, photo);
  assert.equal(third.ok ? "" : third.code, "free_limit");
});

test("20 parallel requests of one person: exactly the daily limit passes", async () => {
  const db = await database();
  const decks = await Promise.all(Array.from({ length: 20 }, () => admit(db, { subject: subject(7) })));
  assert.equal(decks.filter((result) => result.ok).length, 1);
  assert.ok(decks.filter((result) => !result.ok).every((result) => !result.ok && result.code === "free_limit"));
  const photos = await Promise.all(Array.from({ length: 20 }, () => admit(db, { subject: subject(7), unit: "photo_task" })));
  assert.equal(photos.filter((result) => result.ok).length, 2);
  assert.equal(counter(db, subject(7), "presentation_free"), 1);
  assert.equal(counter(db, subject(7), "photo_task"), 2);
  // The site counter counts the units handed out, not the refusals.
  assert.equal(counter(db, SITE_SUBJECT, "presentation_free"), 1);
  assert.equal(counter(db, SITE_SUBJECT, "photo_task"), 2);
});

test("the IP ceiling binds young identities only, atomically, and a refusal costs the person nothing", async () => {
  const db = await database();
  const ceiling = config({ STUDIO_RAMP_DECKS_DAILY: "", STUDIO_IP_YOUNG_DECKS: "5" });
  const young = await Promise.all(
    Array.from({ length: 20 }, (_, i) => admit(db, { config: ceiling, subject: subject(100 + i), young: true })),
  );
  assert.equal(young.filter((result) => result.ok).length, 5);
  const refused = young.filter((result) => !result.ok);
  assert.equal(refused.length, 15);
  assert.ok(refused.every((result) => !result.ok && result.code === "ip_ceiling" && result.retryAfterSeconds > 0));
  assert.equal(counter(db, ipSubject(ADDRESS), "presentation_free"), 5);
  // Each refused person still has their deck for today.
  const left = await Promise.all(Array.from({ length: 20 }, (_, i) => freeLeft(db.asD1(), subject(100 + i), NOW)));
  assert.equal(left.filter((value) => value.presentation.left === 1).length, 15);
  // Old identities behind the same address are not counted against it at all.
  for (let i = 0; i < 20; i++) assert.equal((await admit(db, { config: ceiling, subject: subject(200 + i), young: false })).ok, true);
  assert.equal(counter(db, ipSubject(ADDRESS), "presentation_free"), 5);
  // Another address has its own ceiling; photos have theirs (40).
  assert.equal((await admit(db, { config: ceiling, subject: subject(300), young: true, address: OTHER_ADDRESS })).ok, true);
  assert.equal((await admit(db, { config: ceiling, subject: subject(100), young: true, unit: "photo_task" })).ok, true);
  assert.equal(counter(db, SITE_SUBJECT, "presentation_free"), 26);
  // Only hashes in the table: "ip:" + the hash, "b:" + the identity's HMAC.
  const subjects = db.rows<{ subject: string }>("SELECT DISTINCT subject FROM studio_free_usage").map((row) => row.subject);
  assert.ok(subjects.every((value) => /^(b:[0-9a-f]{32}|ip:[0-9a-f]{64}|all)$/.test(value)), subjects.join());
});

test("the ramp's ceiling: past STUDIO_RAMP_DECKS_DAILY decks a day the site is busy; photos are not ramped", async () => {
  const db = await database();
  const ramp = config({ STUDIO_RAMP_DECKS_DAILY: "3" });
  for (let i = 0; i < 3; i++) assert.equal((await admit(db, { config: ramp, subject: subject(i) })).ok, true);
  const fourth = await admit(db, { config: ramp, subject: subject(3) });
  assert.deepEqual(fourth, { ok: false, code: "studio_busy", retryAfterSeconds: 60, alerts: ["studio_ramp_full"] });
  assert.equal(counter(db, subject(3), "presentation_free"), 0);
  assert.equal(counter(db, SITE_SUBJECT, "presentation_free"), 3);
  for (let i = 0; i < 10; i++) assert.equal((await admit(db, { config: ramp, subject: subject(i), unit: "photo_task" })).ok, true);
  // The committed default is the 48-hour ramp of 50; "" lifts it.
  assert.equal(config().rampDecksDaily, 50);
  for (let i = 10; i < 70; i++) assert.equal((await admit(db, { config: OPEN, subject: subject(i) })).ok, true);
});

test("the site counter alerts once when it reaches STUDIO_FREE_ALERT_DECKS, and only alerts", async () => {
  const db = await database();
  const alerting = config({ STUDIO_RAMP_DECKS_DAILY: "", STUDIO_FREE_ALERT_DECKS: "3", STUDIO_FREE_ALERT_PHOTOS: "2" });
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await admit(db, { config: alerting, subject: subject(i) }));
  assert.deepEqual(results.map((result) => result.ok), [true, true, true, true, true]);
  assert.deepEqual(results.map((result) => result.alerts), [[], [], ["studio_free_decks_high"], [], []]);
  const photos = [await admit(db, { config: alerting, subject: subject(0), unit: "photo_task" }), await admit(db, { config: alerting, subject: subject(1), unit: "photo_task" })];
  assert.deepEqual(photos.map((result) => result.alerts), [[], ["studio_free_photos_high"]]);
});

test("the free budget: spent → busy for all; from 80% young identities are refused and the owner is told", async () => {
  const db = await database();
  const budget = config({ STUDIO_RAMP_DECKS_DAILY: "", STUDIO_FREE_DAILY_USD: "0.3" }); // 300 000 micro-USD
  spend(db, 239_999);
  assert.deepEqual(await freeBudgetGate(db.asD1(), budget, true, NOW), { ok: true, alerts: [] });
  spend(db, 200_000, 40_000);
  assert.deepEqual(await freeBudgetGate(db.asD1(), budget, true, NOW), { ok: false, code: "studio_busy", alerts: ["studio_free_budget_80"] });
  assert.deepEqual(await freeBudgetGate(db.asD1(), budget, false, NOW), { ok: true, alerts: ["studio_free_budget_80"] });
  const youngRefused = await admit(db, { config: budget, subject: subject(1), young: true });
  assert.deepEqual(youngRefused, { ok: false, code: "studio_busy", retryAfterSeconds: 60, alerts: ["studio_free_budget_80"] });
  assert.equal(counter(db, subject(1), "presentation_free"), 0);
  assert.deepEqual(await admit(db, { config: budget, subject: subject(2) }), { ok: true, day: freeDay(NOW), alerts: ["studio_free_budget_80"] });
  spend(db, 0, 300_000);
  for (const young of [true, false]) {
    assert.deepEqual(await admit(db, { config: budget, subject: subject(3), young }), { ok: false, code: "studio_busy", retryAfterSeconds: 60, alerts: ["studio_free_budget_spent"] });
  }
  // Another day's or another bucket's spend does not count.
  spend(db, 300_000, 0, "2026-10-13");
  assert.equal((await freeBudgetGate(db.asD1(), budget, true, NOW)).ok, true);
  spend(db, 300_000, 0, freeDay(NOW), "studio_paid");
  assert.equal((await freeBudgetGate(db.asD1(), budget, true, NOW)).ok, true);
  // A budget of 0 hands out nothing; an unreadable budget refuses.
  assert.equal((await freeBudgetGate(db.asD1(), config({ STUDIO_FREE_DAILY_USD: "0" }), false, NOW)).ok, false);
  db.exec("DROP TABLE gpt_model_spend");
  assert.deepEqual(await freeBudgetGate(db.asD1(), budget, false, NOW), { ok: false, code: "studio_busy", alerts: [] });
});

test("handing a unit back: the person's own counter only, plus 'returned'; 5 a day, then try_later", async () => {
  const db = await database();
  const store = new FreeUsageStore(db.asD1());
  const day = freeDay(NOW);
  const person = subject(9);
  assert.equal((await admit(db, { subject: person, young: true })).ok, true);
  assert.deepEqual([counter(db, person, "presentation_free"), counter(db, ipSubject(ADDRESS), "presentation_free"), counter(db, SITE_SUBJECT, "presentation_free")], [1, 1, 1]);
  await store.release(day, person, "presentation_free");
  // The address and the site keep what was taken: whatever the attempt cost, it cost.
  assert.deepEqual(
    [counter(db, person, "presentation_free"), counter(db, ipSubject(ADDRESS), "presentation_free"), counter(db, SITE_SUBJECT, "presentation_free"), counter(db, person, "returned")],
    [0, 1, 1, 1],
  );
  // Never below zero.
  await store.release(day, person, "presentation_free");
  assert.equal(counter(db, person, "presentation_free"), 0);
  assert.equal(counter(db, person, "returned"), 2);
  for (let i = 2; i < RETURNED_DAILY_CAP; i++) {
    assert.equal((await admit(db, { subject: person })).ok, true);
    await store.release(day, person, "presentation_free");
  }
  assert.equal(counter(db, person, "returned"), 5);
  const tired = await admit(db, { subject: person });
  assert.equal(tired.ok ? "" : tired.code, "try_later");
  assert.equal(counter(db, person, "presentation_free"), 0);
  // A paid unit handed back counts too (the ledger credits the entitlement itself).
  await store.noteReturned(day, subject(10));
  assert.equal(counter(db, subject(10), "returned"), 1);
  // Only a person's counter is ever handed back.
  await assert.rejects(store.release(day, SITE_SUBJECT, "presentation_free"));
  await assert.rejects(store.release(day, ipSubject(ADDRESS), "presentation_free"));
  await assert.rejects(store.noteReturned(day, "all"));
});

/** The database, but statements whose SQL and bindings match `fails` throw like a failing D1. */
function failingD1(db: SqliteD1, fails: (sql: string, args: unknown[]) => boolean): D1Database {
  return {
    prepare(sql: string) {
      const inner = db.prepare(sql);
      let args: unknown[] = [];
      const check = () => {
        if (fails(sql, args)) throw new Error("D1_ERROR: simulated");
      };
      const statement = {
        bind(...values: unknown[]) {
          args = values;
          inner.bind(...values);
          return statement;
        },
        async first() { check(); return inner.first(); },
        async run() { check(); return inner.run(); },
        async all() { check(); return inner.all(); },
      };
      return statement;
    },
    async batch() {
      throw new Error("D1_ERROR: simulated");
    },
  } as unknown as D1Database;
}

test("a D1 failure is a refusal at every step, and what the call took is given back", async () => {
  const db = await database();
  const down = failingD1(db, () => true);
  assert.deepEqual(await admit(down, { subject: subject(1) }), { ok: false, code: "studio_busy", retryAfterSeconds: 60, alerts: [] });
  // The address counter fails after the person's unit was taken: the unit comes back.
  const ipDown = failingD1(db, (sql, args) => /^\s*INSERT/.test(sql) && String(args[2]).startsWith("ip:"));
  assert.equal((await admit(ipDown, { subject: subject(2), young: true })).ok ? "" : "refused", "refused");
  assert.equal(counter(db, subject(2), "presentation_free"), 0);
  // The site counter fails: both earlier counters come back.
  const siteDown = failingD1(db, (sql, args) => /^\s*INSERT/.test(sql) && args[2] === SITE_SUBJECT);
  const result = await admit(siteDown, { subject: subject(3), young: true });
  assert.equal(result.ok ? "" : result.code, "studio_busy");
  assert.deepEqual([counter(db, subject(3), "presentation_free"), counter(db, ipSubject(ADDRESS), "presentation_free")], [0, 0]);
  // The 'returned' read fails: refused, nothing taken.
  const returnedDown = failingD1(db, (sql, args) => /^\s*SELECT used/.test(sql) && args[3] === "returned");
  assert.equal((await admit(returnedDown, { subject: subject(4) })).ok, false);
  assert.equal(counter(db, subject(4), "presentation_free"), 0);
  // A subject that is not a person never reaches D1.
  await assert.rejects(admit(db, { subject: "all" }));
  await assert.rejects(admit(db, { subject: `ip:${ADDRESS}` }));
  assert.throws(() => ipSubject("203.0.113.7"));
});

// ── Rate buckets ────────────────────────────────────────────────────────────

test("job starts: 6 in 10 minutes per subject (429), STUDIO_JOB_GLOBAL_PER_MIN for the site (503); degraded refuses", async () => {
  const db = await database();
  const site = config({ STUDIO_JOB_GLOBAL_PER_MIN: "20" });
  assert.deepEqual(STUDIO_RATE.job, { action: "studio_job", limit: 6, windowMs: 600_000 });
  for (let i = 0; i < 6; i++) assert.deepEqual(await paceJobStart(db.asD1(), subject(1), site, NOW + i * 1000), { ok: true });
  const seventh = await paceJobStart(db.asD1(), subject(1), site, NOW + 7000);
  assert.equal(seventh.ok ? "" : seventh.code, "rate_limited");
  // The subject's refusal did not count for the site: 6 used of 20.
  assert.equal(db.value("SELECT count FROM gpt_rate_limits WHERE action='studio_job_global'"), 6);
  const busy = config({ STUDIO_JOB_GLOBAL_PER_MIN: "3" });
  const fresh = await database();
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await paceJobStart(fresh.asD1(), subject(10 + i), busy, NOW));
  assert.deepEqual(results.map((result) => (result.ok ? "ok" : result.code)), ["ok", "ok", "ok", "studio_busy"]);
  // The next minute opens again.
  assert.deepEqual(await paceJobStart(fresh.asD1(), subject(20), busy, NOW + 60_000), { ok: true });
  fresh.exec("DROP TABLE gpt_rate_limits");
  const degraded = await paceJobStart(fresh.asD1(), subject(21), busy, NOW);
  assert.deepEqual(degraded, { ok: false, code: "studio_busy", retryAfterSeconds: 60 });
  assert.deepEqual(await paceIdentity(fresh.asD1(), ADDRESS, NOW), { ok: false, code: "studio_busy", retryAfterSeconds: 60 });
});

test("the address key is the chat's IP hash of the /64, never the address", async () => {
  const request = (ip: string) => new Request("https://gptbot.uz/api/studio/identity", { headers: { "CF-Connecting-IP": ip } });
  const one = await studioAddress(request("2001:db8:5:6:1::1"), {}, NOW);
  assert.equal(one, await studioAddress(request("2001:db8:5:6:ffff::2"), {}, NOW));
  assert.notEqual(one, await studioAddress(request("2001:db8:5:7::1"), {}, NOW));
  assert.match(one, /^[0-9a-f]{64}$/);
  assert.match(await studioAddress(request("203.0.113.7"), {}, NOW), /^[0-9a-f]{64}$/);
  assert.match(ipSubject(one), /^ip:[0-9a-f]{64}$/);
});

test("alerts are recorded once an hour per code, with nothing but the code; a failure is swallowed", async (context) => {
  context.mock.method(console, "warn", () => undefined);
  const db = await database();
  await recordStudioAlerts({ GPTBOT_DRAFTS_DB: db.asD1() }, ["studio_free_budget_80", "studio_free_budget_80", "studio_ramp_full"], NOW);
  await recordStudioAlerts({ GPTBOT_DRAFTS_DB: db.asD1() }, ["studio_free_budget_80"], NOW + 60_000);
  const rows = db.rows<{ org_id: string; code: string }>("SELECT org_id, code FROM gpt_service_alerts ORDER BY code");
  assert.deepEqual(rows.map((row) => row.code), ["studio_free_budget_80", "studio_ramp_full"]);
  assert.ok(rows.every((row) => row.org_id === STUDIO_ORG));
  db.exec("DROP TABLE gpt_service_alerts");
  await recordStudioAlerts({ GPTBOT_DRAFTS_DB: db.asD1() }, ["studio_ramp_full"], NOW);
  await recordStudioAlerts({}, ["studio_ramp_full"], NOW);
});

// ── GET /api/studio/me ──────────────────────────────────────────────────────

const IDENTITY_KEY = "studio-identity-test-signing-material-only-for-tests";
const WIDGET_KEY = "studio-turnstile-test-widget-material";
const API_ON = JSON.stringify({ STUDIO_API: "on", STUDIO_FREE_DECK: "true" });

function call(handler: (context: never) => Response | Promise<Response>, request: Request, env: Record<string, unknown>): Promise<Response> {
  return handler({
    request, env, params: {}, data: {}, functionPath: new URL(request.url).pathname,
    waitUntil: () => undefined, passThroughOnException: () => undefined,
    next: () => { throw new Error("next() called"); },
  } as never) as Promise<Response>;
}

const me = (cookie?: string, host = "https://gptbot.uz") =>
  new Request(`${host}/api/studio/me`, { headers: cookie ? { cookie: `${STUDIO_BID_COOKIE}=${cookie}` } : {} });

test("/me without an identity: the full limits, without D1", async () => {
  const throwing = new Proxy({}, { get: () => { throw new Error("D1 touched"); } });
  const response = await call(meEndpoint, me(), { STUDIO_RUNTIME_CONFIG_JSON: API_ON, GPT_IDENTITY_SECRET: IDENTITY_KEY, GPTBOT_DRAFTS_DB: throwing });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    identity: false,
    free: { presentation: { left: 1, limit: 1 }, photo: { left: 2, limit: 2 }, resetsAt: "05:00 Asia/Tashkent" },
    account: null,
    entitlements: [],
    latestOrder: null,
    receipts: [],
  });
});

test("acceptance: identity → /me shows what is left today; a unit taken shows; 404 when off or on a preview", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ success: true, action: "studio_identity", hostname: "gptbot.uz" }));
  const db = await database();
  const env = { STUDIO_RUNTIME_CONFIG_JSON: API_ON, GPT_IDENTITY_SECRET: IDENTITY_KEY, STUDIO_TURNSTILE_SECRET_KEY: WIDGET_KEY, GPTBOT_DRAFTS_DB: db.asD1() };
  const issued = await call(identityEndpoint, new Request("https://gptbot.uz/api/studio/identity", {
    method: "POST",
    headers: { Origin: "https://gptbot.uz", "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
    body: JSON.stringify({ turnstileToken: "token-ok" }),
  }), env);
  assert.equal(issued.status, 200);
  const value = /__Host-studio_bid=([^;]+)/.exec(issued.headers.get("set-cookie") ?? "")?.[1];
  assert.ok(value);

  const before = await (await call(meEndpoint, me(value), env)).json();
  assert.equal(before.identity, true);
  assert.deepEqual(before.free, { presentation: { left: 1, limit: 1 }, photo: { left: 2, limit: 2 }, resetsAt: "05:00 Asia/Tashkent" });

  const person = (await verifyIdentityValue(value, { GPT_IDENTITY_SECRET: IDENTITY_KEY }))!.subject;
  const identity = (await mintIdentity({ GPT_IDENTITY_SECRET: IDENTITY_KEY }))!;
  assert.equal((await admitFreeUnit(db.asD1(), { config: OPEN, subject: person, young: true, address: ADDRESS, unit: "presentation_free" })).ok, true);
  assert.equal((await admitFreeUnit(db.asD1(), { config: OPEN, subject: person, young: true, address: ADDRESS, unit: "photo_task" })).ok, true);
  const after = await (await call(meEndpoint, me(value), env)).json();
  assert.deepEqual(after.free, { presentation: { left: 0, limit: 1 }, photo: { left: 1, limit: 2 }, resetsAt: "05:00 Asia/Tashkent" });
  // Somebody else's identity sees their own counters.
  assert.deepEqual((await (await call(meEndpoint, me(identity.value), env)).json()).free.presentation, { left: 1, limit: 1 });

  // Switches off, the paid switch alone, a preview host.
  assert.equal((await call(meEndpoint, me(value), { ...env, STUDIO_RUNTIME_CONFIG_JSON: undefined })).status, 404);
  assert.equal((await call(meEndpoint, me(value), { ...env, STUDIO_RUNTIME_CONFIG_JSON: JSON.stringify({ STUDIO_PAID_SERVICE: "on" }) })).status, 200);
  assert.equal((await call(meEndpoint, me(value, "https://ai-direct-pro-landing.pages.dev"), env)).status, 404);
  assert.equal((await call(meEndpoint, new Request("https://gptbot.uz/api/studio/me", { method: "POST" }), env)).status, 405);
});

test("/me with an identity and a broken D1: 503, never made-up numbers", async () => {
  const db = await database();
  const { value } = (await mintIdentity({ GPT_IDENTITY_SECRET: IDENTITY_KEY }))!;
  const env = { STUDIO_RUNTIME_CONFIG_JSON: API_ON, GPT_IDENTITY_SECRET: IDENTITY_KEY, GPTBOT_DRAFTS_DB: failingD1(db, () => true) };
  const response = await call(meEndpoint, me(value), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "studio_busy");
  const unbound = await call(meEndpoint, me(value), { STUDIO_RUNTIME_CONFIG_JSON: API_ON, GPT_IDENTITY_SECRET: IDENTITY_KEY });
  assert.equal(unbound.status, 503);
  assert.equal((await unbound.json()).code, "studio_not_configured");
});

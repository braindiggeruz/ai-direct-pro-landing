// Regeneration at the level of the ledger (spec §2.4): one per spent paid
// unit, of the same task (input_mac), within 24 hours of the result and the
// entitlement's term, never of a regeneration, in the full form of the first
// generation, and never refused for want of units. Then the endpoint
// (T3.1): POST /api/studio/presentations/:job/regenerate, end to end with
// the full deck's own steps (tests/helpers/studio-full.ts).
// Real SQLite (tests/helpers/sqlite-d1.ts); no network, no remote database.
// Run: node --import tsx --test tests/studio-regen.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { ensureSchema } from "../functions/lib/gpt-chat/schema";
import { ensureBillingSchema } from "../functions/lib/gpt-chat/billing-schema";
import { STUDIO_ORG, ensureStudioSchema } from "../functions/lib/studio/schema";
import { parseStudioConfig } from "../functions/lib/studio/config";
import { STUDIO_PAID_BUCKET } from "../functions/lib/studio/limits";
import { INPUT_MAC_PREFIX, deckInputMac, photoInputMac, type DeckInput, type LedgerJob } from "../functions/lib/studio/ledger";
import {
  OUTLINE_BIT,
  REGEN_WINDOW_MS,
  failPart,
  handOut,
  jobMeter,
  maxSteps,
  regenVerdict,
  releaseJob,
  slidePartBit,
  startJob,
  type StartJobInput,
} from "../functions/lib/studio/jobs";
import { bucketOf } from "../functions/lib/studio/spend";
import { onRequest as createEndpoint } from "../functions/api/studio/presentations/index";
import { onRequest as outlineEndpoint } from "../functions/api/studio/presentations/[job]/outline";
import { onRequest as slidesEndpoint } from "../functions/api/studio/presentations/[job]/slides";
import { onRequest as regenerateEndpoint } from "../functions/api/studio/presentations/[job]/regenerate";
import { browser, call, createBody, deckAnswer, post, studioSite, type Site } from "./helpers/studio-site";
import { FULL_TASK, PAID, buyer, presentationsUsed, routeZai, sentFor, type Buyer } from "./helpers/studio-full";

const NOW = Date.UTC(2026, 9, 20, 7, 0);
const HOUR = 3_600_000;
const ENV = { GPT_IDENTITY_SECRET: "studio-regen-test-mac-material-only-for-tests" };
const OTHER_ENV = { GPT_IDENTITY_SECRET: "another-regen-test-mac-material-entirely-else" };
const CONFIG = parseStudioConfig(JSON.stringify({ STUDIO_PAID_SERVICE: "on", STUDIO_FULL_DECK: "true", STUDIO_API: "on", STUDIO_PHOTO: "true" }));
const USER = "acct_studio_77";
const SUBJECT = `a:${USER}`;
const DECK: DeckInput = { topic: "Amir Temur davlati", locale: "uz", audience: "maktab", slides: 12, palette: 2, shape: "full" };
let requests = 0;
const requestId = () => `rq_${(++requests).toString().padStart(8, "0")}`;

async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  await ensureStudioSchema(db.asD1());
  return db;
}

function grant(db: SqliteD1, id: string, over: { presentations?: number; photos?: number; endsAt?: number; revokedAt?: number | null } = {}) {
  db.sqlite
    .prepare(
      `INSERT INTO studio_entitlements(org_id,id,order_id,user_id,mode,plan,plan_version,starts_at,ends_at,presentations_limit,photos_limit,revoked_at)
       VALUES(?,?,?,?,'live','kunlik','studio-2026-11-v1',?,?,?,?,?)`,
    )
    .run(STUDIO_ORG, id, id, USER, NOW - HOUR, over.endsAt ?? NOW + 24 * HOUR, over.presentations ?? 1, over.photos ?? 5, over.revokedAt ?? null);
}

const used = (db: SqliteD1, id: string, column = "presentations_used") =>
  Number(db.value(`SELECT ${column} FROM studio_entitlements WHERE org_id=? AND id=?`, STUDIO_ORG, id));
const returned = (db: SqliteD1, day: string) =>
  Number(db.value("SELECT used FROM studio_free_usage WHERE org_id=? AND day=? AND subject=? AND unit='returned'", STUDIO_ORG, day, SUBJECT) ?? 0);

async function mac(input: Partial<DeckInput> = {}): Promise<string> {
  return (await deckInputMac(ENV, { ...DECK, ...input }))!;
}

function start(db: SqliteD1, over: Partial<StartJobInput>) {
  return startJob(db.asD1(), {
    config: CONFIG,
    subject: SUBJECT,
    requestId: requestId(),
    tool: "presentation",
    shape: "full",
    slides: 12,
    inputMac: "",
    source: { kind: "entitlement", userId: USER, mode: "live" },
    now: NOW,
    ...over,
  });
}

/** A full deck of 12 slides bought with one unit and delivered to the end at `doneAt`. */
async function doneDeck(db: SqliteD1, doneAt = NOW + 60_000, entitlement = "stu_regen_1"): Promise<LedgerJob> {
  grant(db, entitlement);
  const result = await start(db, { inputMac: await mac() });
  assert.ok(result.ok, result.ok ? "" : result.code);
  for (const bit of [OUTLINE_BIT, slidePartBit(1), slidePartBit(2), slidePartBit(3)]) assert.ok((await handOut(db.asD1(), result.job, bit, "text", doneAt)).ok);
  assert.equal(used(db, entitlement), 1);
  return result.job;
}

function regen(db: SqliteD1, original: LedgerJob, over: Partial<StartJobInput> = {}) {
  return (async () =>
    start(db, { inputMac: await mac(), source: { kind: "regen", regenOf: original.id }, now: NOW + 2 * HOUR, ...over }))();
}

// ── input_mac ───────────────────────────────────────────────────────────────

test("input_mac: the same task gives the same MAC whatever its spelling; any other field changes it", async () => {
  const base = await mac();
  assert.match(base, /^[0-9a-f]{32}$/);
  assert.equal(INPUT_MAC_PREFIX, "studio-input-v1:");
  // NFC, trimmed, single spaces, lower case.
  assert.equal(await mac({ topic: "  AMIR   temur DAVLATI " }), base);
  assert.equal(await mac({ topic: "Amir Temur davlati".normalize("NFD") }), base);
  const changed = await Promise.all([
    mac({ topic: "Amir Temur davlati tarixi" }),
    mac({ locale: "ru" }),
    mac({ audience: "talaba" }),
    mac({ slides: 15 }),
    mac({ palette: 3 }),
    mac({ shape: "free" }),
  ]);
  for (const value of changed) assert.notEqual(value, base);
  assert.equal(new Set(changed).size, changed.length);
  // Field boundaries cannot be shifted: the fields travel as a JSON array.
  assert.notEqual(await mac({ topic: "a\",\"uz" }), await mac({ topic: "a" }));
  // Another deployment's key gives another MAC; no key, no MAC.
  assert.notEqual(await deckInputMac(OTHER_ENV, DECK), base);
  assert.equal(await deckInputMac({ GPT_IDENTITY_SECRET: "short" }, DECK), null);
  assert.equal(await deckInputMac({ GPT_IDENTITY_SECRET: undefined }, DECK), null);
});

test("input_mac of a photo: the same cleaned bytes give the same MAC, other bytes another; a deck never collides", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4, 0xff, 0xd9]);
  const same = await photoInputMac(ENV, bytes.slice());
  assert.equal(await photoInputMac(ENV, bytes), same);
  assert.equal(await photoInputMac(ENV, bytes.buffer.slice(0)), same);
  const other = bytes.slice();
  other[5] ^= 1;
  assert.notEqual(await photoInputMac(ENV, other), same);
  assert.match(same!, /^[0-9a-f]{32}$/);
  assert.notEqual(same, await mac());
  assert.equal(await photoInputMac({ GPT_IDENTITY_SECRET: "" }, bytes), null);
});

// ── Regeneration ────────────────────────────────────────────────────────────

test("a regeneration of a spent unit runs in the full form and needs no unit", async () => {
  const db = await database();
  const original = await doneDeck(db);
  // The entitlement had one unit and it is spent: money cannot refuse the regeneration.
  const result = await regen(db, original);
  assert.ok(result.ok, result.ok ? "" : result.code);
  const job = result.job;
  assert.equal(job.source, "regen");
  assert.equal(job.regenOf, original.id);
  assert.equal(job.entitlementId, original.entitlementId);
  assert.equal(job.unit, "presentation_full");
  assert.equal(job.shape, "full");
  assert.equal(job.partsTotal, original.partsTotal);
  assert.equal(maxSteps(job), maxSteps(original));
  assert.equal(job.inputMac, original.inputMac);
  assert.equal(bucketOf(job.source), STUDIO_PAID_BUCKET);
  assert.equal(used(db, "stu_regen_1"), 1);
  // It runs like the first one: every model call it may make, then all parts → done.
  const meter = jobMeter(db.asD1(), CONFIG, job, "part", () => NOW + 2 * HOUR + 1000);
  let calls = 0;
  while ((await meter.admit({ model: "zai/glm-5.3-flash", maxTokens: 1300, attempt: 1 })) === "ok") calls++;
  assert.equal(calls, maxSteps(original));
  for (const bit of [OUTLINE_BIT, slidePartBit(1), slidePartBit(2), slidePartBit(3)]) assert.ok((await handOut(db.asD1(), job, bit, "text", NOW + 2 * HOUR + 5000)).ok);
  const row = db.rows<{ state: string; source: string }>("SELECT state, source FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, job.id)[0];
  assert.equal(row.state, "done");
  assert.equal(used(db, "stu_regen_1"), 1);
});

test("a regeneration of a regeneration, and a second one of the same unit: 409 regen_used", async () => {
  const db = await database();
  const original = await doneDeck(db);
  const first = await regen(db, original);
  assert.ok(first.ok);
  // The first is still open: a second one is refused by the index, not by the one-open-job rule alone.
  await releaseJob(db.asD1(), first.job, "expired_empty", NOW + 2 * HOUR + 1); // nothing went out yet: handed back
  const again = await regen(db, original, { now: NOW + 2 * HOUR + 2 });
  assert.ok(again.ok, "a released regeneration does not use up the unit's one");
  for (const bit of [OUTLINE_BIT, slidePartBit(1), slidePartBit(2), slidePartBit(3)]) await handOut(db.asD1(), again.job, bit, "text", NOW + 2 * HOUR + 3);
  const second = await regen(db, original, { now: NOW + 3 * HOUR });
  assert.equal(second.ok ? "" : second.code, "regen_used");
  const ofRegen = await regen(db, again.job, { now: NOW + 3 * HOUR });
  assert.equal(ofRegen.ok ? "" : ofRegen.code, "regen_used");
  assert.equal(db.value("SELECT COUNT(*) FROM studio_unit_ledger WHERE regen_of=?", original.id), 2);
});

test("two regenerations at once of one unit: exactly one starts", async () => {
  const db = await database();
  const original = await doneDeck(db);
  const inputMac = await mac();
  // Two tabs of the same person, past the one-open-job check at the same moment.
  const results = await Promise.all([0, 1].map(() => start(db, { inputMac, source: { kind: "regen", regenOf: original.id }, now: NOW + 2 * HOUR })));
  assert.equal(results.filter((result) => result.ok).length, 1);
  const refused = results.find((result) => !result.ok);
  assert.ok(refused && !refused.ok && ["regen_used", "job_in_progress"].includes(refused.code));
  assert.equal(db.value("SELECT COUNT(*) FROM studio_unit_ledger WHERE regen_of=?", original.id), 1);
});

test("another task: 409 regen_mismatch; a photo needs the same photo", async () => {
  const db = await database();
  const original = await doneDeck(db);
  for (const changed of [{ topic: "Mirzo Ulug‘bek" }, { slides: 15 }, { palette: 1 }, { audience: "talaba" as const }, { locale: "ru" as const }]) {
    const result = await regen(db, original, { inputMac: await mac(changed) });
    assert.equal(result.ok ? "" : result.code, "regen_mismatch", JSON.stringify(changed));
  }
  // A photo: another photo is another task. Its entitlement ends first, so the photo takes its unit.
  grant(db, "stu_regen_photo", { endsAt: NOW + 20 * HOUR });
  const photo = new Uint8Array([0xff, 0xd8, 9, 9, 9, 0xff, 0xd9]);
  const first = await start(db, { tool: "photo", shape: "photo", slides: undefined, consentVersion: "photo-v1", inputMac: (await photoInputMac(ENV, photo))!, now: NOW + 10 * 60_000 });
  assert.ok(first.ok);
  await handOut(db.asD1(), first.job, OUTLINE_BIT, "answer", NOW + 10 * 60_000 + 1);
  const otherPhoto = (await photoInputMac(ENV, new Uint8Array([0xff, 0xd8, 9, 9, 8, 0xff, 0xd9])))!;
  const mismatch = await regen(db, first.job, { tool: "photo", shape: "photo", inputMac: otherPhoto });
  assert.equal(mismatch.ok ? "" : mismatch.code, "regen_mismatch");
  assert.equal(first.job.entitlementId, "stu_regen_photo");
  const same = await regen(db, first.job, { tool: "photo", shape: "photo", inputMac: (await photoInputMac(ENV, photo))! });
  assert.ok(same.ok);
  assert.equal(same.job.consentVersion, "photo-v1");
  assert.equal(used(db, "stu_regen_photo", "photos_used"), 1);
});

test("24 hours after the result, or once the entitlement ended or was revoked: 409 regen_window", async () => {
  const db = await database();
  const doneAt = NOW + 60_000;
  const original = await doneDeck(db, doneAt);
  // An Oylik-like term, so only the 24 hours decide here.
  db.exec(`UPDATE studio_entitlements SET ends_at=${NOW + 30 * 24 * HOUR}`);
  const late = await regen(db, original, { now: doneAt + REGEN_WINDOW_MS });
  assert.equal(late.ok ? "" : late.code, "regen_window");
  assert.ok((await regen(db, original, { now: doneAt + REGEN_WINDOW_MS - 1 })).ok);

  const ended = await database();
  const endedOriginal = await doneDeck(ended, doneAt);
  ended.exec(`UPDATE studio_entitlements SET ends_at=${NOW + HOUR}`);
  const afterTerm = await regen(ended, endedOriginal, { now: NOW + HOUR });
  assert.equal(afterTerm.ok ? "" : afterTerm.code, "regen_window");

  const revoked = await database();
  const revokedOriginal = await doneDeck(revoked, doneAt);
  revoked.exec(`UPDATE studio_entitlements SET revoked_at=${NOW + 90_000}`);
  const refunded = await regen(revoked, revokedOriginal);
  assert.equal(refunded.ok ? "" : refunded.code, "regen_window");
});

test("only a done paid job of the same person can be made again", async () => {
  const db = await database();
  grant(db, "stu_regen_rules", { presentations: 5 });
  const open = await start(db, { inputMac: await mac() });
  assert.ok(open.ok);
  // Not done yet (and later released by a fault): job_state.
  assert.equal(regenVerdict(open.job, null, { subject: SUBJECT, inputMac: open.job.inputMac, now: NOW }), "job_state");
  await handOut(db.asD1(), open.job, OUTLINE_BIT, "outline", NOW + 1000);
  await failPart(db.asD1(), open.job, slidePartBit(1), "model_failed", NOW + 2000);
  assert.equal(await releaseJob(db.asD1(), open.job, "fault", NOW + 3000), true);
  const ofReleased = await regen(db, open.job, { now: NOW + 4000 });
  assert.equal(ofReleased.ok ? "" : ofReleased.code, "job_state");
  // Another person's job, or no job: 404.
  const original = await doneDeck(db, NOW + 60_000, "stu_regen_other");
  const foreign = await regen(db, original, { subject: "a:acct_studio_78" });
  assert.equal(foreign.ok ? "" : foreign.code, "not_found");
  const missing = await start(db, { inputMac: await mac(), source: { kind: "regen", regenOf: "sj_" + "0".repeat(32) }, now: NOW + 2 * HOUR });
  assert.equal(missing.ok ? "" : missing.code, "not_found");
  // A free deck has no regeneration (Bepul).
  const free = await startJob(db.asD1(), {
    config: CONFIG,
    subject: "b:" + "1".repeat(32),
    requestId: requestId(),
    tool: "presentation",
    shape: "free",
    inputMac: await mac({ shape: "free", slides: 6 }),
    source: { kind: "free", young: false, address: "c".repeat(64) },
    now: NOW,
  });
  assert.ok(free.ok);
  await handOut(db.asD1(), free.job, OUTLINE_BIT, "deck", NOW + 1000);
  const ofFree = await startJob(db.asD1(), {
    config: CONFIG,
    subject: "b:" + "1".repeat(32),
    requestId: requestId(),
    tool: "presentation",
    shape: "free",
    inputMac: await mac({ shape: "free", slides: 6 }),
    source: { kind: "regen", regenOf: free.job.id },
    now: NOW + HOUR,
  });
  assert.equal(ofFree.ok ? "" : ofFree.code, "regen_window");
});

test("a regeneration left open past its life frees the unit's one regeneration: the retry starts, the old row is released", async () => {
  const db = await database();
  const original = await doneDeck(db);
  const first = await regen(db, original);
  assert.ok(first.ok);
  // The tab closed mid-generation: nothing delivered, nobody released it, no sweep ran.
  const later = NOW + 2 * HOUR + 11 * 60_000;
  const retry = await regen(db, original, { now: later });
  assert.ok(retry.ok, retry.ok ? "" : retry.code);
  assert.notEqual(retry.job.id, first.job.id);
  const old = db.rows<{ state: string; reason: string }>("SELECT state, reason FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, first.job.id)[0];
  assert.deepEqual({ ...old }, { state: "released", reason: "expired_empty" });
  assert.equal(used(db, "stu_regen_1"), 1);
});

test("an expired regeneration that delivered without a fault is done: the unit's one regeneration is used", async () => {
  const db = await database();
  const original = await doneDeck(db);
  const first = await regen(db, original);
  assert.ok(first.ok);
  // The outline and two parts went out, then the person left.
  for (const bit of [OUTLINE_BIT, slidePartBit(1), slidePartBit(2)]) assert.ok((await handOut(db.asD1(), first.job, bit, "text", NOW + 2 * HOUR + 1000)).ok);
  const retry = await regen(db, original, { now: NOW + 2 * HOUR + 16 * 60_000 });
  assert.equal(retry.ok ? "" : retry.code, "regen_used");
  const old = db.rows<{ state: string }>("SELECT state FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, first.job.id)[0];
  assert.equal(old.state, "done");
});

test("a paid start whose only unit an expired empty job holds gets it back and starts", async () => {
  const db = await database();
  grant(db, "stu_regen_only", { presentations: 1 });
  const dropped = await start(db, { inputMac: await mac() });
  assert.ok(dropped.ok);
  assert.equal(used(db, "stu_regen_only"), 1);
  // Before its expiry the one-open-job rule answers; after it, the unit is back and taken again.
  const early = await start(db, { inputMac: await mac(), now: NOW + 60_000 });
  assert.equal(early.ok ? "" : early.code, "job_in_progress");
  const next = await start(db, { inputMac: await mac(), now: NOW + 11 * 60_000 });
  assert.ok(next.ok, next.ok ? "" : next.code);
  assert.equal(next.job.entitlementId, "stu_regen_only");
  assert.equal(used(db, "stu_regen_only"), 1, "one back, one taken: unchanged net");
  const old = db.rows<{ state: string; reason: string }>("SELECT state, reason FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, dropped.job.id)[0];
  assert.deepEqual({ ...old }, { state: "released", reason: "expired_empty" });
});

test("a regeneration handed back credits no unit; it counts as a returned attempt", async () => {
  const db = await database();
  const original = await doneDeck(db);
  const result = await regen(db, original);
  assert.ok(result.ok);
  assert.equal(await releaseJob(db.asD1(), result.job, "expired_empty", NOW + 2 * HOUR + 1000), true);
  assert.equal(used(db, "stu_regen_1"), 1);
  assert.equal(returned(db, "2026-10-20"), 1);
  // The same request id again after its release: the same (closed) job, not a new one.
  const replay = await start(db, { requestId: result.job.requestId, inputMac: await mac(), source: { kind: "regen", regenOf: original.id }, now: NOW + 2 * HOUR + 2000 });
  assert.ok(replay.ok && replay.replay);
  assert.equal(replay.job.id, result.job.id);
  assert.equal(replay.job.state, "released");
});

// ── The endpoint (T3.1) ─────────────────────────────────────────────────────

const pathOf = (job: string, step: string) => `/api/studio/presentations/${job}/${step}`;

/** A full deck made to the end by `who` through the endpoints: its job id. */
async function madeDeck(site: Site, who: Buyer, over: Record<string, unknown> = {}): Promise<string> {
  const created = await call(site, createEndpoint, post("/api/studio/presentations", { requestId: requestId(), ...FULL_TASK, shape: "full", ...over }, { cookie: who.cookie }));
  assert.equal(created.status, 201);
  const { jobId } = (await created.json()) as { jobId: string };
  return runDeck(site, who, jobId, { ...FULL_TASK, ...over });
}

/** The outline and every part of job `jobId`, at once: the job id once it is done. */
async function runDeck(site: Site, who: Buyer, jobId: string, task: Record<string, unknown> = FULL_TASK): Promise<string> {
  const outline = await call(site, outlineEndpoint, post(pathOf(jobId, "outline"), task, { cookie: who.cookie }), { job: jobId });
  assert.equal(outline.status, 200);
  const plan = (await outline.json()) as { outline: unknown; sig: string; parts: number };
  const parts = await Promise.all(
    Array.from({ length: plan.parts }, (_, i) =>
      call(site, slidesEndpoint, post(pathOf(jobId, "slides"), { ...task, part: i + 1, outline: plan.outline, sig: plan.sig }, { cookie: who.cookie }), { job: jobId }),
    ),
  );
  for (const answer of parts) assert.equal(answer.status, 200);
  return jobId;
}

async function regenerate(site: Site, who: Pick<Buyer, "cookie">, jobId: string, over: Record<string, unknown> = {}) {
  const body = { requestId: requestId(), ...FULL_TASK, shape: "full", ...over };
  const response = await call(site, regenerateEndpoint, post(pathOf(jobId, "regenerate"), body, { cookie: who.cookie }), { job: jobId });
  return { response, body: (await response.json()) as Record<string, unknown>, sent: body };
}

test("the endpoint: the same task once more, without a unit, made like the first (outline, parts at once, proofreading); a second time 409 regen_used", async (context) => {
  const site = await studioSite(context, { config: PAID });
  routeZai(site, 80);
  const who = await buyer(site, { presentations: 1 });
  const original = await madeDeck(site, who);
  assert.equal(presentationsUsed(site, who.entitlementId), 1);
  const proofsBefore = sentFor(site, "proof").length;

  const again = await regenerate(site, who, original);
  assert.equal(again.response.status, 201, JSON.stringify(again.body));
  assert.equal(again.body.source, "regen");
  assert.equal(again.body.regenOf, original);
  assert.equal(again.body.next, "outline");
  assert.deepEqual(again.body.shape, { slides: 12, images: 8, notes: true, palette: 2, parts: 4 });
  // The same request id again: the same job.
  const replay = await call(site, regenerateEndpoint, post(pathOf(original, "regenerate"), again.sent, { cookie: who.cookie }), { job: original });
  assert.equal(replay.status, 201);
  assert.equal(((await replay.json()) as { jobId: string }).jobId, again.body.jobId);

  // It runs exactly like the first generation, proofreading included, and takes no unit even with none left.
  await runDeck(site, who, again.body.jobId as string);
  assert.equal(sentFor(site, "proof").length - proofsBefore, 3);
  assert.equal(presentationsUsed(site, who.entitlementId), 1);
  const row = site.db.rows<Record<string, unknown>>("SELECT state, source, regen_of, entitlement_id FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, again.body.jobId)[0];
  assert.deepEqual({ ...row }, { state: "done", source: "regen", regen_of: original, entitlement_id: who.entitlementId });

  // One per unit; a regeneration has none of its own.
  assert.equal((await regenerate(site, who, original)).body.code, "regen_used");
  assert.equal((await regenerate(site, who, again.body.jobId as string)).body.code, "regen_used");
});

test("the endpoint: another task is 409 regen_mismatch, another buyer's job 404, a job still open 409, a free deck 404", async (context) => {
  const site = await studioSite(context, { config: PAID });
  routeZai(site, 80);
  const who = await buyer(site);
  const original = await madeDeck(site, who);
  for (const over of [{ topic: "Amir Temur davlati" }, { palette: 1 }, { slides: 10 }, { audience: "talaba" }, { locale: "ru" }]) {
    const answer = await regenerate(site, who, original, over);
    assert.equal(answer.response.status, 409, JSON.stringify(over));
    assert.equal(answer.body.code, "regen_mismatch", JSON.stringify(over));
  }
  const stranger = await buyer(site);
  const foreign = await regenerate(site, stranger, original);
  assert.equal(foreign.response.status, 404);
  assert.equal(foreign.body.code, "not_found");
  assert.equal((await regenerate(site, { cookie: (await browser()).cookie }, original)).response.status, 404);
  // (Six starts in ten minutes per buyer, refused ones included: the rest asks as other buyers.)
  assert.equal((await regenerate(site, stranger, `sj_${"c".repeat(32)}`)).body.code, "not_found");
  // A free-deck body is not a regeneration.
  assert.equal((await regenerate(site, who, original, { shape: "free", slides: 6, palette: 1 })).body.code, "invalid");

  // A deck still being made cannot be made again yet.
  const maker = await buyer(site);
  const open = await call(site, createEndpoint, post("/api/studio/presentations", { requestId: requestId(), ...FULL_TASK, topic: "Fotosintez", shape: "full" }, { cookie: maker.cookie }));
  const { jobId: openJob } = (await open.json()) as { jobId: string };
  const early = await regenerate(site, maker, openJob, { topic: "Fotosintez" });
  assert.equal(early.response.status, 409);
  assert.ok(["job_state", "job_in_progress"].includes(early.body.code as string), String(early.body.code));

  // A free deck (Bepul has no regeneration): its owner is a browser, never a buyer.
  const free = await studioSite(context, { config: PAID });
  const visitor = await browser();
  const created = await call(free, createEndpoint, post("/api/studio/presentations", createBody(), { cookie: visitor.cookie }));
  const { jobId: freeJob } = (await created.json()) as { jobId: string };
  free.zai.push(deckAnswer());
  const freeTask = { topic: "Oddiy kasrlar", locale: "uz", audience: "maktab", slides: 6, palette: 1 };
  assert.equal((await call(free, slidesEndpoint, post(pathOf(freeJob, "slides"), freeTask, { cookie: visitor.cookie }), { job: freeJob })).status, 200);
  const freeBuyer = await buyer(free);
  const notTheirs = await regenerate(free, freeBuyer, freeJob, { topic: "Oddiy kasrlar", slides: 6, palette: 1 });
  assert.equal(notTheirs.body.code, "not_found");
});

test("the endpoint: 404 before the body while STUDIO_PAID_SERVICE or STUDIO_FULL_DECK is off", async (context) => {
  for (const config of [{ ...PAID, STUDIO_PAID_SERVICE: "off" }, { ...PAID, STUDIO_FULL_DECK: "false" }]) {
    const site = await studioSite(context, { config });
    const who = await buyer(site);
    const job = `sj_${"d".repeat(32)}`;
    const request = post(pathOf(job, "regenerate"), { requestId: requestId(), ...FULL_TASK, shape: "full" }, { cookie: who.cookie });
    assert.equal((await call(site, regenerateEndpoint, request, { job })).status, 404);
    assert.equal(request.bodyUsed, false);
  }
});

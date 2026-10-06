// The ledger of generations (functions/lib/studio/ledger.ts), the job rules
// (jobs.ts) and the spend guards (spend.ts). Spec §2.3, §2.5, §4.3, §5.4.
// Real SQLite (tests/helpers/sqlite-d1.ts); no network, no remote database.
// Run: node --import tsx --test tests/studio-ledger.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { ensureSchema } from "../functions/lib/gpt-chat/schema";
import { ensureBillingSchema } from "../functions/lib/gpt-chat/billing-schema";
import { STUDIO_ORG, ensureStudioSchema } from "../functions/lib/studio/schema";
import { parseStudioConfig, type StudioConfig } from "../functions/lib/studio/config";
import { RETURNED_DAILY_CAP, SITE_SUBJECT, freeDay, ipSubject } from "../functions/lib/studio/free-usage";
import { STUDIO_FREE_BUCKET, STUDIO_PAID_BUCKET, freeBudgetGate } from "../functions/lib/studio/limits";
import { maxJobModelCalls } from "../functions/lib/studio/plans";
import type { CallRecord } from "../functions/lib/studio/llm";
import {
  JOB_TTL_DELIVERED_MS,
  JOB_TTL_MS,
  LedgerStore,
  faultCode,
  faultMask,
  type LedgerJob,
} from "../functions/lib/studio/ledger";
import {
  OUTLINE_BIT,
  expireDueJobs,
  expiryOutcome,
  failPart,
  fullMask,
  handOut,
  jobMeter,
  maxSteps,
  partsTotalOf,
  refuseJob,
  releaseJob,
  slidePartBit,
  startJob,
  type StartJobInput,
} from "../functions/lib/studio/jobs";
import { JobSpend, billedMicro, bucketCapMicro, bucketOf, textCallMicro } from "../functions/lib/studio/spend";

/** 2026-10-14 10:00 in Tashkent (UTC+5). */
const NOW = Date.UTC(2026, 9, 14, 5, 0);
const MINUTE = 60_000;
const ADDRESS = "a".repeat(64);
const MAC = "0123456789abcdef0123456789abcdef";
const OTHER_MAC = "fedcba9876543210fedcba9876543210";
const subject = (n: number) => `b:${n.toString(16).padStart(32, "0")}`;
const account = (n: number) => `a:acct_studio_${n}`;
const config = (values: Record<string, string> = {}): StudioConfig =>
  parseStudioConfig(JSON.stringify({ STUDIO_API: "on", STUDIO_FREE_DECK: "true", STUDIO_PHOTO: "true", STUDIO_RAMP_DECKS_DAILY: "", STUDIO_FREE_DAILY_USD: "3", ...values }));
const OPEN = config();
let requests = 0;
const requestId = () => `req_${(++requests).toString().padStart(8, "0")}`;

async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  await ensureStudioSchema(db.asD1());
  return db;
}

function start(db: SqliteD1 | D1Database, over: Partial<StartJobInput> & { subject: string }) {
  const d1 = db instanceof SqliteD1 ? db.asD1() : db;
  return startJob(d1, {
    config: OPEN,
    requestId: requestId(),
    tool: "presentation",
    shape: "free",
    inputMac: MAC,
    source: { kind: "free", young: false, address: ADDRESS },
    now: NOW,
    ...over,
  });
}

async function started(db: SqliteD1, over: Partial<StartJobInput> & { subject: string }): Promise<LedgerJob> {
  const result = await start(db, over);
  assert.ok(result.ok, `start refused: ${result.ok ? "" : result.code}`);
  return result.job;
}

function grant(db: SqliteD1, id: string, user: string, over: { presentations?: number; photos?: number; endsAt?: number; startsAt?: number; revokedAt?: number | null; mode?: string } = {}) {
  db.sqlite
    .prepare(
      `INSERT INTO studio_entitlements(org_id,id,order_id,user_id,mode,plan,plan_version,starts_at,ends_at,presentations_limit,photos_limit,revoked_at)
       VALUES(?,?,?,?,?,'oylik','studio-2026-11-v1',?,?,?,?,?)`,
    )
    .run(STUDIO_ORG, id, id, user, over.mode ?? "live", over.startsAt ?? NOW - 3_600_000, over.endsAt ?? NOW + 30 * 86_400_000, over.presentations ?? 10, over.photos ?? 40, over.revokedAt ?? null);
}

const counter = (db: SqliteD1, who: string, unit: string, day = freeDay(NOW)) =>
  Number(db.value("SELECT used FROM studio_free_usage WHERE org_id=? AND day=? AND subject=? AND unit=?", STUDIO_ORG, day, who, unit) ?? 0);
const used = (db: SqliteD1, id: string, column = "presentations_used") =>
  Number(db.value(`SELECT ${column} FROM studio_entitlements WHERE org_id=? AND id=?`, STUDIO_ORG, id));
const row = (db: SqliteD1, id: string) =>
  db.rows<Record<string, unknown>>("SELECT * FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, id)[0];
/** gpt_model_spend of a day: reserved_micro is the committed total (open + settled), actual_micro the settled part inside it. */
const bucket = (db: SqliteD1, day: string, name: string) => {
  const found = db.rows<{ reserved_micro: number; actual_micro: number }>("SELECT reserved_micro, actual_micro FROM gpt_model_spend WHERE org_id=? AND day=? AND bucket=?", STUDIO_ORG, day, name)[0];
  return found ? { reserved_micro: Number(found.reserved_micro), actual_micro: Number(found.actual_micro) } : null;
};
const reload = async (db: SqliteD1, job: LedgerJob) => (await new LedgerStore(db.asD1()).get(job.id))!;

/** A D1 whose statements matching `pattern` fail like a D1 error. */
function failingOn(db: SqliteD1, pattern: RegExp): D1Database {
  const d1 = db.asD1();
  return new Proxy(d1, {
    get(target, key, receiver) {
      if (key !== "prepare") return Reflect.get(target, key, receiver);
      return (sql: string) => {
        if (!pattern.test(sql)) return target.prepare(sql);
        const fail = async () => {
          throw new Error("D1_ERROR: simulated failure");
        };
        const statement = { bind: () => statement, run: fail, first: fail, all: fail };
        return statement;
      };
    },
  });
}

function call(over: Partial<CallRecord> = {}): CallRecord {
  return { model: "zai/glm-5.3-flash", maxTokens: 1100, outcome: "ok", valid: true, finishReason: "stop", usage: { input: 900, cachedInput: 0, output: 700, reasoning: 4 }, costMicro: 485, ms: 10, ...over };
}

// ── Rules ───────────────────────────────────────────────────────────────────

test("parts, bits and the step caps follow the deck's shape (spec §7.1)", () => {
  assert.equal(partsTotalOf("free"), 1);
  assert.equal(partsTotalOf("photo"), 1);
  assert.equal(partsTotalOf("full", 12), 4);
  assert.equal(partsTotalOf("full", 15), 5);
  assert.equal(partsTotalOf("full", 6), 3);
  assert.equal(fullMask(4), 0b1111);
  assert.deepEqual([1, 2, 3, 4].map(slidePartBit), [2, 4, 8, 16]);
  assert.throws(() => slidePartBit(5));
  for (const slides of [6, 12, 15]) assert.equal(maxSteps({ shape: "full", partsTotal: partsTotalOf("full", slides) }), maxJobModelCalls("full", slides));
  assert.equal(maxSteps({ shape: "free", partsTotal: 1 }), maxJobModelCalls("free", 6));
  assert.equal(maxSteps({ shape: "full", partsTotal: 4 }), 2 + 2 * 3 + 4);
  assert.equal(maxSteps({ shape: "photo", partsTotal: 1 }), 3);
  assert.deepEqual(expiryOutcome({ partsDone: 0, fault: null }), { kind: "release", reason: "expired_empty" });
  assert.deepEqual(expiryOutcome({ partsDone: 0, fault: "1:timeout" }), { kind: "release", reason: "expired_empty" });
  assert.deepEqual(expiryOutcome({ partsDone: 1, fault: "4:model_failed" }), { kind: "release", reason: "fault" });
  assert.deepEqual(expiryOutcome({ partsDone: 3, fault: null }), { kind: "done" });
  assert.equal(faultMask("6:busy"), 6);
  assert.equal(faultCode("6:busy"), "busy");
  assert.equal(faultMask(null), 0);
  assert.equal(faultCode(null), null);
});

// ── Transitions ─────────────────────────────────────────────────────────────

test("a free deck: reserved → its one part handed out → done; the unit stays spent", async () => {
  const db = await database();
  const job = await started(db, { subject: subject(1) });
  assert.equal(job.state, "reserved");
  assert.equal(job.source, "free");
  assert.equal(job.unit, "presentation_free");
  assert.equal(job.partsTotal, 1);
  assert.equal(job.expiresAt, NOW + JOB_TTL_MS);
  assert.equal(job.reserveDay, "2026-10-14");
  assert.equal(counter(db, subject(1), "presentation_free"), 1);
  assert.equal(row(db, job.id).state, "reserved");

  const out = await handOut(db.asD1(), job, OUTLINE_BIT, { deck: "slides" }, NOW + 30_000);
  assert.deepEqual(out, { ok: true, content: { deck: "slides" }, state: "done", partsDone: 1 });
  const done = row(db, job.id);
  assert.equal(done.state, "done");
  assert.equal(done.settled_at, NOW + 30_000);
  assert.equal(done.total_ms, 30_000);
  // The first delivery lets pictures follow for 15 minutes from the start.
  assert.equal(done.expires_at, NOW + JOB_TTL_DELIVERED_MS);

  // Done is final: no second hand-out, no release, no refusal.
  assert.deepEqual(await handOut(db.asD1(), job, OUTLINE_BIT, "again", NOW + 40_000), { ok: false, code: "job_state" });
  assert.equal(await releaseJob(db.asD1(), job, "fault", NOW + 41_000), false);
  assert.equal(await refuseJob(db.asD1(), job, "topic_refused", NOW + 42_000), false);
  assert.equal(counter(db, subject(1), "presentation_free"), 1);
  assert.equal(counter(db, subject(1), "returned"), 0);
});

test("content never leaves without its write", async () => {
  const db = await database();
  const job = await started(db, { subject: subject(2), tool: "photo", shape: "photo", consentVersion: "photo-v1" });
  // Another person's job, a bit the job does not have, a malformed bit.
  assert.deepEqual(await handOut(db.asD1(), { id: job.id, subject: subject(3) }, OUTLINE_BIT, "answer", NOW), { ok: false, code: "job_state" });
  assert.deepEqual(await handOut(db.asD1(), job, 2, "answer", NOW), { ok: false, code: "job_state" });
  assert.deepEqual(await handOut(db.asD1(), job, 3, "answer", NOW), { ok: false, code: "job_state" });
  // D1 down: no content, a busy answer.
  assert.deepEqual(await handOut(failingOn(db, /UPDATE studio_unit_ledger/), job, OUTLINE_BIT, "answer", NOW), { ok: false, code: "studio_busy" });
  // Expired: no content, even though the sweep has not run yet.
  assert.deepEqual(await handOut(db.asD1(), job, OUTLINE_BIT, "answer", NOW + JOB_TTL_MS), { ok: false, code: "job_state" });
  assert.equal(row(db, job.id).parts_done, 0);

  // Released or refused: no content either.
  const refused = await started(db, { subject: subject(4), tool: "photo", shape: "photo" });
  assert.equal(await refuseJob(db.asD1(), refused, "unreadable", NOW + 1000), true);
  assert.deepEqual(await handOut(db.asD1(), refused, OUTLINE_BIT, "answer", NOW + 2000), { ok: false, code: "job_state" });
  const refusedRow = row(db, refused.id);
  assert.equal(refusedRow.state, "refused");
  assert.equal(refusedRow.reason, "unreadable");
  assert.equal(refusedRow.parts_done, 0);
});

test("a full deck's parts: the outline first, then parts in any order; all bits → done", async () => {
  const db = await database();
  grant(db, "stu_ent_parts", "acct_studio_9");
  const job = await started(db, { subject: account(9), shape: "full", slides: 12, source: { kind: "entitlement", userId: "acct_studio_9", mode: "live" } });
  assert.equal(job.partsTotal, 4);
  assert.equal(used(db, "stu_ent_parts"), 1);
  // A part before the outline: refused, no content.
  assert.deepEqual(await handOut(db.asD1(), job, slidePartBit(1), "part 1", NOW + 1000), { ok: false, code: "job_state" });
  // A part the deck does not have (12 slides: parts 1..3).
  assert.deepEqual(await handOut(db.asD1(), job, slidePartBit(4), "part 4", NOW + 1000), { ok: false, code: "job_state" });
  assert.deepEqual(await handOut(db.asD1(), job, OUTLINE_BIT, "outline", NOW + 15_000), { ok: true, content: "outline", state: "delivering", partsDone: 1 });
  assert.equal(row(db, job.id).state, "delivering");
  assert.equal((await handOut(db.asD1(), job, slidePartBit(3), "part 3", NOW + 40_000)).ok, true);
  // The same part again (its answer was lost on the way): written again, still open.
  assert.deepEqual(await handOut(db.asD1(), job, slidePartBit(3), "part 3", NOW + 41_000), { ok: true, content: "part 3", state: "delivering", partsDone: 0b1001 });
  assert.equal((await handOut(db.asD1(), job, slidePartBit(1), "part 1", NOW + 42_000)).ok, true);
  assert.deepEqual(await handOut(db.asD1(), job, slidePartBit(2), "part 2", NOW + 43_000), { ok: true, content: "part 2", state: "done", partsDone: 0b1111 });
  assert.equal(row(db, job.id).total_ms, 43_000);
  assert.equal(used(db, "stu_ent_parts"), 1);

  // 15 slides: five bits, part 4 exists.
  const big = await started(db, { subject: account(9), shape: "full", slides: 15, source: { kind: "entitlement", userId: "acct_studio_9", mode: "live" }, now: NOW + MINUTE });
  assert.equal(big.partsTotal, 5);
  await handOut(db.asD1(), big, OUTLINE_BIT, "outline", NOW + MINUTE + 1);
  assert.equal((await handOut(db.asD1(), big, slidePartBit(4), "part 4", NOW + MINUTE + 2)).ok, true);
});

test("a start is idempotent by request id, and a person has one open job at a time", async () => {
  const db = await database();
  const id = requestId();
  const first = await start(db, { subject: subject(5), requestId: id, tool: "photo", shape: "photo" });
  assert.ok(first.ok && !first.replay);
  const again = await start(db, { subject: subject(5), requestId: id, tool: "photo", shape: "photo" });
  assert.ok(again.ok && again.replay);
  assert.equal(again.job.id, first.job.id);
  assert.equal(counter(db, subject(5), "photo_task"), 1);
  // The same id for another task is not a replay.
  assert.equal((await start(db, { subject: subject(5), requestId: id, tool: "photo", shape: "photo", inputMac: OTHER_MAC })).ok, false);
  // A second job while the first is open.
  const second = await start(db, { subject: subject(5), tool: "photo", shape: "photo", now: NOW + 1000 });
  assert.deepEqual(second, { ok: false, code: "job_in_progress", alerts: [] });
  assert.equal(counter(db, subject(5), "photo_task"), 1);
  // Once it is done, the next one starts.
  await handOut(db.asD1(), first.job, OUTLINE_BIT, "answer", NOW + 2000);
  assert.equal((await start(db, { subject: subject(5), tool: "photo", shape: "photo", now: NOW + 3000 })).ok, true);
  assert.equal(counter(db, subject(5), "photo_task"), 2);
  // An expired job no longer blocks, even before the sweep.
  const third = await start(db, { subject: subject(6), tool: "photo", shape: "photo" });
  assert.ok(third.ok);
  assert.equal((await start(db, { subject: subject(6), tool: "photo", shape: "photo", now: NOW + JOB_TTL_MS })).ok, true);
});

test("invalid starts: shapes the source cannot buy, bad ids, a bad consent", async () => {
  const db = await database();
  assert.equal((await start(db, { subject: subject(7), shape: "full", slides: 12 })).ok, false); // a full deck is never free
  assert.equal((await start(db, { subject: "ip:" + ADDRESS })).ok, false);
  assert.equal((await start(db, { subject: subject(7), requestId: "short" })).ok, false);
  assert.equal((await start(db, { subject: subject(7), inputMac: "not-a-mac" })).ok, false);
  assert.equal((await start(db, { subject: subject(7), tool: "photo", shape: "photo", consentVersion: "yes" })).ok, false);
  assert.equal((await start(db, { subject: subject(7), tool: "photo", shape: "free" })).ok, false);
  grant(db, "stu_ent_inv", "acct_studio_7");
  const paid = { kind: "entitlement" as const, userId: "acct_studio_7", mode: "live" as const };
  assert.equal((await start(db, { subject: account(7), shape: "full", slides: 3, source: paid })).ok, false);
  assert.equal((await start(db, { subject: account(7), shape: "full", slides: 16, source: paid })).ok, false);
  assert.equal((await start(db, { subject: account(7), shape: "free", source: paid })).ok, false); // the free deck is never paid
  assert.equal(used(db, "stu_ent_inv"), 0);
  assert.equal(db.value("SELECT COUNT(*) FROM studio_unit_ledger"), 0);
});

test("a server fault on a part: the job stays open for a retry; at expiry the unit goes back", async () => {
  const db = await database();
  grant(db, "stu_ent_fault", "acct_studio_10");
  const job = await started(db, { subject: account(10), shape: "full", slides: 12, source: { kind: "entitlement", userId: "acct_studio_10", mode: "live" } });
  await handOut(db.asD1(), job, OUTLINE_BIT, "outline", NOW + 15_000);
  // Part 2 fails; parts 1 and 3 arrive after it. Their success must not clear part 2's fault.
  assert.deepEqual(await failPart(db.asD1(), job, slidePartBit(2), "model_failed", NOW + 30_000), { marked: true, released: false });
  assert.equal(row(db, job.id).fault, "4:model_failed");
  await handOut(db.asD1(), job, slidePartBit(1), "part 1", NOW + 31_000);
  await handOut(db.asD1(), job, slidePartBit(3), "part 3", NOW + 32_000);
  assert.equal(row(db, job.id).fault, "4:model_failed");
  assert.equal(row(db, job.id).state, "delivering");
  // A second fault, on part 1 which already went out, changes nothing.
  await failPart(db.asD1(), job, slidePartBit(1), "timeout", NOW + 33_000);
  assert.equal(row(db, job.id).fault, "4:model_failed");
  // The person gives up; the job expires; the sweep hands the unit back.
  const sweep = await expireDueJobs(db.asD1(), NOW + JOB_TTL_DELIVERED_MS);
  assert.deepEqual(sweep, { scanned: 1, released: 1, done: 0, converted: 0, failed: 0, more: false });
  const closed = row(db, job.id);
  assert.equal(closed.state, "released");
  assert.equal(closed.reason, "fault");
  assert.equal(used(db, "stu_ent_fault"), 0);
  assert.equal(counter(db, account(10), "returned"), 1);
});

test("a fault cleared by its own part's retry: delivered and abandoned → done, the unit is spent", async () => {
  const db = await database();
  grant(db, "stu_ent_left", "acct_studio_11");
  const job = await started(db, { subject: account(11), shape: "full", slides: 12, source: { kind: "entitlement", userId: "acct_studio_11", mode: "live" } });
  await handOut(db.asD1(), job, OUTLINE_BIT, "outline", NOW + 15_000);
  await failPart(db.asD1(), job, slidePartBit(1), "timeout", NOW + 30_000);
  await failPart(db.asD1(), job, slidePartBit(2), "busy", NOW + 30_500);
  assert.equal(row(db, job.id).fault, "6:busy");
  await handOut(db.asD1(), job, slidePartBit(1), "part 1", NOW + 50_000);
  assert.equal(row(db, job.id).fault, "4:busy");
  await handOut(db.asD1(), job, slidePartBit(2), "part 2", NOW + 51_000);
  assert.equal(row(db, job.id).fault, null);
  // Part 3 is never asked for: the person closed the page.
  assert.equal(await releaseJob(db.asD1(), job, "fault", NOW + 52_000), false);
  const sweep = await expireDueJobs(db.asD1(), NOW + JOB_TTL_DELIVERED_MS);
  assert.equal(sweep.done, 1);
  const closed = row(db, job.id);
  assert.equal(closed.state, "done");
  assert.equal(closed.parts_done, 0b0111);
  assert.equal(closed.settled_at, NOW + JOB_TTL_DELIVERED_MS);
  assert.equal(used(db, "stu_ent_left"), 1);
  assert.equal(counter(db, account(11), "returned"), 0);
});

test("delivered and abandoned → done; nothing delivered → released at expiry", async () => {
  const db = await database();
  const left = await started(db, { subject: subject(12), tool: "photo", shape: "photo" });
  const empty = await started(db, { subject: subject(13), tool: "photo", shape: "photo" });
  // The free deck's outline bit is its only part: a full-deck-like partial state needs a full deck.
  grant(db, "stu_ent_abandon", "acct_studio_12");
  const deck = await started(db, { subject: account(12), shape: "full", slides: 6, source: { kind: "entitlement", userId: "acct_studio_12", mode: "live" } });
  await handOut(db.asD1(), deck, OUTLINE_BIT, "outline", NOW + 10_000);
  await handOut(db.asD1(), left, OUTLINE_BIT, "answer", NOW + 10_000);
  // Not yet expired: the sweep leaves them alone.
  assert.equal((await expireDueJobs(db.asD1(), NOW + JOB_TTL_MS - 1)).scanned, 0);
  const sweep = await expireDueJobs(db.asD1(), NOW + JOB_TTL_DELIVERED_MS);
  assert.equal(sweep.scanned, 2);
  assert.equal(sweep.done, 1);
  assert.equal(sweep.released, 1);
  assert.equal(row(db, deck.id).state, "done");
  assert.equal(used(db, "stu_ent_abandon"), 1);
  assert.equal(row(db, empty.id).state, "released");
  assert.equal(row(db, empty.id).reason, "expired_empty");
  assert.equal(counter(db, subject(13), "photo_task"), 0);
  assert.equal(counter(db, subject(13), "returned"), 1);
  // The finished photo was done before; its unit stays spent.
  assert.equal(row(db, left.id).state, "done");
  assert.equal(counter(db, subject(12), "photo_task"), 1);
  // A second sweep finds nothing.
  assert.equal((await expireDueJobs(db.asD1(), NOW + 2 * JOB_TTL_DELIVERED_MS)).scanned, 0);
});

test("the request and the sweep return the same unit at once: it comes back exactly once", async () => {
  const db = await database();
  // A free photo and a paid photo, both reserved and past their expiry.
  const free = await started(db, { subject: subject(14), tool: "photo", shape: "photo" });
  grant(db, "stu_ent_race", "acct_studio_14");
  const paid = await started(db, { subject: account(14), tool: "photo", shape: "photo", source: { kind: "entitlement", userId: "acct_studio_14", mode: "live" } });
  assert.equal(used(db, "stu_ent_race", "photos_used"), 1);
  const late = NOW + JOB_TTL_MS + 1;

  // The sweep read its list before the request released the job (a stale view).
  const store = new LedgerStore(db.asD1());
  const stale = await store.due(late);
  assert.equal(stale.length, 2);
  assert.equal(await releaseJob(db.asD1(), free, "fault", late), true);
  assert.equal(await store.close(stale.find((job) => job.id === free.id)!, "released", "expired_empty", late), false);
  assert.equal(counter(db, subject(14), "photo_task"), 0);
  assert.equal(counter(db, subject(14), "returned"), 1);
  assert.equal(row(db, free.id).reason, "fault");

  // Both at once, plus a refusal racing them: one wins.
  const results = await Promise.all([
    releaseJob(db.asD1(), paid, "fault", late),
    expireDueJobs(db.asD1(), late),
    refuseJob(db.asD1(), paid, "photo_refused", late),
    releaseJob(db.asD1(), paid, "expired_empty", late),
  ]);
  const wins = [results[0], (results[1] as { released: number }).released > 0, results[2], results[3]].filter(Boolean).length;
  assert.equal(wins, 1);
  assert.equal(used(db, "stu_ent_race", "photos_used"), 0);
  assert.equal(counter(db, account(14), "returned"), 1);
});

test("a release lowers only the person's own counter: never the address, the site or the spend", async () => {
  const db = await database();
  const job = await started(db, { subject: subject(15), source: { kind: "free", young: true, address: ADDRESS } });
  assert.equal(counter(db, ipSubject(ADDRESS), "presentation_free"), 1);
  assert.equal(counter(db, SITE_SUBJECT, "presentation_free"), 1);
  // One model call reserved and settled on the free bucket.
  const meter = jobMeter(db.asD1(), OPEN, job, "free", () => NOW + 1000);
  assert.equal(await meter.admit({ model: "zai/glm-5.3-flash", maxTokens: 1100, attempt: 1 }), "ok");
  await meter.settle([call()]);
  const spent = bucket(db, "2026-10-14", STUDIO_FREE_BUCKET);
  assert.deepEqual(spent, { reserved_micro: 485, actual_micro: 485 });

  assert.equal(await releaseJob(db.asD1(), job, "fault", NOW + 2000), true);
  assert.equal(counter(db, subject(15), "presentation_free"), 0);
  assert.equal(counter(db, subject(15), "returned"), 1);
  assert.equal(counter(db, ipSubject(ADDRESS), "presentation_free"), 1);
  assert.equal(counter(db, SITE_SUBJECT, "presentation_free"), 1);
  assert.deepEqual(bucket(db, "2026-10-14", STUDIO_FREE_BUCKET), spent);
  assert.equal(row(db, job.id).cost_micro, 485);
});

test("five units handed back in a day: the sixth start waits for 05:00 (429 try_later)", async () => {
  const db = await database();
  for (let i = 0; i < RETURNED_DAILY_CAP; i++) {
    const job = await started(db, { subject: subject(16), tool: "photo", shape: "photo", now: NOW + i * 1000 });
    assert.equal(await releaseJob(db.asD1(), job, "fault", NOW + i * 1000 + 500), true);
  }
  assert.equal(counter(db, subject(16), "returned"), RETURNED_DAILY_CAP);
  assert.equal(counter(db, subject(16), "photo_task"), 0);
  const sixth = await start(db, { subject: subject(16), tool: "photo", shape: "photo", now: NOW + 10_000 });
  assert.equal(sixth.ok ? "" : sixth.code, "try_later");
  assert.equal(sixth.ok ? "" : sixth.resetsAt, "2026-10-15T00:00:00.000Z");
  // A paid start of the same person waits too.
  grant(db, "stu_ent_cap", "acct_studio_16");
  for (let i = 0; i < RETURNED_DAILY_CAP; i++) {
    const job = await started(db, { subject: account(16), tool: "photo", shape: "photo", source: { kind: "entitlement", userId: "acct_studio_16", mode: "live" }, now: NOW + i * 1000 });
    await refuseJob(db.asD1(), job, "unreadable", NOW + i * 1000 + 500);
  }
  const paid = await start(db, { subject: account(16), tool: "photo", shape: "photo", source: { kind: "entitlement", userId: "acct_studio_16", mode: "live" }, now: NOW + 20_000 });
  assert.equal(paid.ok ? "" : paid.code, "try_later");
  assert.equal(used(db, "stu_ent_cap", "photos_used"), 0);
  // The next day starts afresh.
  assert.equal((await start(db, { subject: subject(16), tool: "photo", shape: "photo", now: Date.UTC(2026, 9, 15, 0, 0) })).ok, true);
});

test("a refusal hands the unit back, keeps only the category, and refuses unknown reasons", async () => {
  const db = await database();
  const job = await started(db, { subject: subject(17) });
  assert.equal(await refuseJob(db.asD1(), job, "Amir Temur haqida", NOW + 1000), false);
  assert.equal(row(db, job.id).state, "reserved");
  assert.equal(await refuseJob(db.asD1(), job, "safety_S12", NOW + 1000), true);
  const closed = row(db, job.id);
  assert.equal(closed.state, "refused");
  assert.equal(closed.reason, "safety_S12");
  assert.equal(counter(db, subject(17), "presentation_free"), 0);
  assert.equal(counter(db, subject(17), "returned"), 1);
  // A refusal also closes a deck mid-way (a part the provider refused) and returns its unit.
  grant(db, "stu_ent_refuse", "acct_studio_17");
  const deck = await started(db, { subject: account(17), shape: "full", slides: 12, source: { kind: "entitlement", userId: "acct_studio_17", mode: "live" } });
  await handOut(db.asD1(), deck, OUTLINE_BIT, "outline", NOW + 2000);
  assert.equal(await refuseJob(db.asD1(), deck, "provider_refused", NOW + 3000), true);
  assert.equal(used(db, "stu_ent_refuse"), 0);
});

test("the step cap: a job makes at most its calls, and none once it closed", async () => {
  const db = await database();
  const job = await started(db, { subject: subject(18) });
  const meter = jobMeter(db.asD1(), OPEN, job, "free", () => NOW + 1000);
  const admitted = [];
  for (let attempt = 1; attempt <= 6; attempt++) admitted.push(await meter.admit({ model: "openrouter:google/gemma-4-31b-it:free", maxTokens: 1100, attempt }));
  assert.deepEqual(admitted, ["ok", "ok", "ok", "ok", "stop", "stop"]);
  assert.equal(row(db, job.id).steps, maxSteps(job));
  // A ':free' model reserves nothing.
  assert.equal(bucket(db, "2026-10-14", STUDIO_FREE_BUCKET), null);

  // A model without a shadow price is never called: its cost could not be capped.
  const unpriced = await started(db, { subject: subject(47) });
  assert.equal(await jobMeter(db.asD1(), OPEN, unpriced, "free", () => NOW + 1000).admit({ model: "zai/glm-9-unknown", maxTokens: 1100, attempt: 1 }), "busy");
  assert.equal(row(db, unpriced.id).reserved_micro, 0);

  const other = await started(db, { subject: subject(19) });
  await refuseJob(db.asD1(), other, "provider_refused", NOW + 500);
  const closedMeter = jobMeter(db.asD1(), OPEN, other, "free", () => NOW + 1000);
  assert.equal(await closedMeter.admit({ model: "zai/glm-5.3-flash", maxTokens: 1100, attempt: 1 }), "stop");
  assert.equal(row(db, other.id).steps, 0);
});

test("a fault with no call left releases the job at once, without waiting for expiry", async () => {
  const db = await database();
  const job = await started(db, { subject: subject(20) });
  const store = new LedgerStore(db.asD1());
  for (let i = 0; i < maxSteps(job) - 1; i++) assert.ok(await store.takeStep(job.id, job.subject, maxSteps(job), NOW + 1000));
  assert.deepEqual(await failPart(db.asD1(), job, OUTLINE_BIT, "invalid_output", NOW + 2000), { marked: true, released: false });
  assert.ok(await store.takeStep(job.id, job.subject, maxSteps(job), NOW + 3000));
  assert.deepEqual(await failPart(db.asD1(), job, OUTLINE_BIT, "model_failed", NOW + 4000), { marked: true, released: true });
  const closed = row(db, job.id);
  assert.equal(closed.state, "released");
  assert.equal(closed.reason, "fault");
  assert.equal(closed.fault, "1:model_failed");
  assert.equal(counter(db, subject(20), "presentation_free"), 0);
  // Another person's job cannot be failed or released by this subject.
  const foreign = await started(db, { subject: subject(21) });
  assert.deepEqual(await failPart(db.asD1(), { ...foreign, subject: subject(20) }, OUTLINE_BIT, "timeout", NOW), { marked: false, released: false });
  assert.equal(row(db, foreign.id).fault, null);
});

test("a row that cannot be written gives the unit back", async () => {
  const db = await database();
  const broken = failingOn(db, /^\s*INSERT INTO studio_unit_ledger/);
  const free = await start(broken, { subject: subject(22) });
  assert.deepEqual(free, { ok: false, code: "studio_busy", alerts: [] });
  assert.equal(counter(db, subject(22), "presentation_free"), 0);
  grant(db, "stu_ent_broken", "acct_studio_22");
  const paid = await start(broken, { subject: account(22), shape: "full", slides: 12, source: { kind: "entitlement", userId: "acct_studio_22", mode: "live" } });
  assert.equal(paid.ok ? "" : paid.code, "studio_busy");
  assert.equal(used(db, "stu_ent_broken"), 0);
  // D1 down before anything was taken: busy, nothing taken.
  const down = await start(failingOn(db, /studio_unit_ledger/), { subject: subject(23) });
  assert.equal(down.ok ? "" : down.code, "studio_busy");
  assert.equal(counter(db, subject(23), "presentation_free"), 0);
});

// ── Paid units ──────────────────────────────────────────────────────────────

test("a paid unit comes from the live entitlement that ends soonest; the last one goes to one start", async () => {
  const db = await database();
  const user = "acct_studio_30";
  grant(db, "stu_late", user, { presentations: 10, endsAt: NOW + 20 * 86_400_000 });
  grant(db, "stu_soon", user, { presentations: 1, endsAt: NOW + 86_400_000 });
  grant(db, "stu_ended", user, { presentations: 10, endsAt: NOW - 1 });
  grant(db, "stu_revoked", user, { presentations: 10, endsAt: NOW + 2 * 86_400_000, revokedAt: NOW - 10 });
  grant(db, "stu_test", user, { presentations: 10, endsAt: NOW + 3600_000, mode: "test" });
  const source = { kind: "entitlement" as const, userId: user, mode: "live" as const };
  const first = await started(db, { subject: account(30), shape: "full", slides: 12, source });
  assert.equal(first.entitlementId, "stu_soon");
  await handOut(db.asD1(), first, OUTLINE_BIT, "outline", NOW + 1);
  for (const part of [1, 2, 3]) await handOut(db.asD1(), first, slidePartBit(part), "part", NOW + 2);
  const second = await started(db, { subject: account(30), shape: "full", slides: 12, source, now: NOW + 10 });
  assert.equal(second.entitlementId, "stu_late");
  assert.equal(used(db, "stu_ended"), 0);
  assert.equal(used(db, "stu_revoked"), 0);
  assert.equal(used(db, "stu_test"), 0);

  // Two people's parallel starts for one last unit: one gets it, the other 402 no_units.
  grant(db, "stu_last", "acct_studio_31", { presentations: 1 });
  const race = await Promise.all([
    start(db, { subject: account(31), shape: "full", slides: 12, source: { kind: "entitlement", userId: "acct_studio_31", mode: "live" } }),
    start(db, { subject: account(32), shape: "full", slides: 12, source: { kind: "entitlement", userId: "acct_studio_31", mode: "live" } }),
  ]);
  assert.equal(race.filter((result) => result.ok).length, 1);
  assert.deepEqual(race.filter((result) => !result.ok).map((result) => !result.ok && result.code), ["no_units"]);
  assert.equal(used(db, "stu_last"), 1);
  // Without any entitlement: 402.
  const none = await start(db, { subject: account(33), tool: "photo", shape: "photo", source: { kind: "entitlement", userId: "acct_studio_33", mode: "live" } });
  assert.equal(none.ok ? "" : none.code, "no_units");
});

// ── Spend ───────────────────────────────────────────────────────────────────

test("spend is reserved and settled on the job's reserve day, not on the day it settles", async () => {
  const db = await database();
  // 04:59:30 in Tashkent: the last free day of the 13th; the calls run after 05:00.
  const start13 = Date.parse("2026-10-14T04:59:30+05:00");
  const job = await started(db, { subject: subject(40), now: start13 });
  assert.equal(job.reserveDay, "2026-10-13");
  const after = Date.parse("2026-10-14T05:00:10+05:00");
  const meter = jobMeter(db.asD1(), OPEN, job, "free", () => after);
  assert.equal(await meter.admit({ model: "zai/glm-5.3-flash", maxTokens: 1100, attempt: 1 }), "ok");
  const reserved = textCallMicro("zai/glm-5.3-flash", "free", 1100);
  assert.deepEqual(bucket(db, "2026-10-13", STUDIO_FREE_BUCKET), { reserved_micro: reserved, actual_micro: 0 });
  assert.equal(row(db, job.id).reserved_micro, reserved);
  await meter.settle([call()]);
  assert.deepEqual(bucket(db, "2026-10-13", STUDIO_FREE_BUCKET), { reserved_micro: 485, actual_micro: 485 });
  assert.equal(bucket(db, "2026-10-14", STUDIO_FREE_BUCKET), null);
  const settled = row(db, job.id);
  assert.equal(settled.reserved_micro, 0);
  assert.equal(settled.cost_micro, 485);
  assert.equal(settled.model, "zai/glm-5.3-flash");
  assert.equal(settled.tokens_in, 900);
  assert.equal(settled.tokens_out, 700);
  assert.equal(settled.reasoning_tokens, 4);
});

test("free jobs spend on studio_free, paid ones on studio_paid; a full bucket fails the call as busy with an alert", async () => {
  const db = await database();
  assert.equal(bucketOf("free"), STUDIO_FREE_BUCKET);
  assert.equal(bucketOf("entitlement"), STUDIO_PAID_BUCKET);
  assert.equal(bucketOf("regen"), STUDIO_PAID_BUCKET);
  assert.equal(bucketCapMicro(OPEN, STUDIO_FREE_BUCKET), 3_000_000);
  assert.equal(bucketCapMicro(OPEN, STUDIO_PAID_BUCKET), 20_000_000);
  const reserve = textCallMicro("zai/glm-5.3-flash", "free", 1100);

  const tight = config({ STUDIO_FREE_DAILY_USD: "0.001" }); // 1 000 micro: one call fits, the next does not
  const job = await started(db, { subject: subject(41), config: tight });
  const meter = jobMeter(db.asD1(), tight, job, "free", () => NOW + 1000);
  assert.equal(await meter.admit({ model: "zai/glm-5.3-flash", maxTokens: 1100, attempt: 1 }), "ok");
  assert.equal(await meter.admit({ model: "zai/glm-5.3-flash", maxTokens: 1650, attempt: 2 }), "busy");
  assert.deepEqual(meter.alerts, ["studio_free_budget_spent"]);
  assert.equal(row(db, job.id).reserved_micro, reserve);

  grant(db, "stu_ent_stop", "acct_studio_41");
  const stop = config({ STUDIO_PAID_DAILY_USD_STOP: "1" });
  db.sqlite.prepare("INSERT INTO gpt_model_spend(org_id,day,bucket,reserved_micro,actual_micro,attempts) VALUES(?,?,?,?,?,1)").run(STUDIO_ORG, "2026-10-14", STUDIO_PAID_BUCKET, 1_000_000, 1_000_000);
  const paid = await started(db, { subject: account(41), shape: "full", slides: 12, source: { kind: "entitlement", userId: "acct_studio_41", mode: "live" } });
  const paidMeter = jobMeter(db.asD1(), stop, paid, "outline", () => NOW + 1000);
  assert.equal(await paidMeter.admit({ model: "zai/glm-5.3-flash", maxTokens: 1300, attempt: 1 }), "busy");
  assert.deepEqual(paidMeter.alerts, ["studio_paid_stop"]);
  assert.equal(row(db, paid.id).reserved_micro, 0);
  assert.deepEqual(bucket(db, "2026-10-14", STUDIO_PAID_BUCKET), { reserved_micro: 1_000_000, actual_micro: 1_000_000 });
});

test("a settled cost counts once against the free budget; an overrun is counted in full", async () => {
  const db = await database();
  const tight = config({ STUDIO_FREE_DAILY_USD: "0.001" }); // 1 000 micro; 80% = 800
  const job = await started(db, { subject: subject(46), config: tight });
  const meter = jobMeter(db.asD1(), tight, job, "free", () => NOW + 1000);
  assert.equal(await meter.admit({ model: "zai/glm-5.3-flash", maxTokens: 1100, attempt: 1 }), "ok");
  // While open, the worst case (775) counts: under 80%.
  assert.deepEqual(await freeBudgetGate(db.asD1(), tight, true, NOW + 1000), { ok: true, alerts: [] });
  await meter.settle([call()]);
  // Settled at 485: counted once (485), not as reserved plus actual (970, past 80%).
  assert.deepEqual(await freeBudgetGate(db.asD1(), tight, true, NOW + 2000), { ok: true, alerts: [] });
  // A call that cost more than its reservation raises the committed total by the overrun.
  const spend = new JobSpend(db.asD1(), job);
  assert.deepEqual(await spend.reserve(100, tight, NOW + 3000), { ok: true });
  assert.equal(await spend.settle(100, 400, null), true);
  assert.deepEqual(bucket(db, "2026-10-14", STUDIO_FREE_BUCKET), { reserved_micro: 885, actual_micro: 885 });
  assert.equal(row(db, job.id).cost_micro, 885);
  const young = await freeBudgetGate(db.asD1(), tight, true, NOW + 4000);
  assert.deepEqual(young, { ok: false, code: "studio_busy", alerts: ["studio_free_budget_80"] });
});

test("what a call cost: usage when reported, nothing when refused before an answer, the reservation when nobody knows", () => {
  assert.equal(billedMicro(call(), 900), 485);
  assert.equal(billedMicro(call({ outcome: "length", usage: null, costMicro: 700 }), 900), 700);
  assert.equal(billedMicro(call({ outcome: "rate_limit", usage: null, costMicro: 0 }), 900), 0);
  assert.equal(billedMicro(call({ outcome: "unavailable", usage: null, costMicro: 0 }), 900), 0);
  assert.equal(billedMicro(call({ outcome: "refused", usage: null, costMicro: 0 }), 900), 0);
  assert.equal(billedMicro(call({ outcome: "timeout", usage: null, costMicro: 0 }), 900), 900);
  assert.equal(billedMicro(call({ outcome: "provider_error", usage: null, costMicro: 0 }), 900), 900);
  assert.equal(billedMicro(call({ outcome: "aborted", usage: null, costMicro: 0 }), 900), 900);
});

test("the sweep turns a forgotten reservation into spend, and a late settlement is not counted twice", async () => {
  const db = await database();
  const job = await started(db, { subject: subject(42) });
  const spend = new JobSpend(db.asD1(), job);
  assert.deepEqual(await spend.reserve(1000, OPEN, NOW + 1000), { ok: true });
  assert.deepEqual(bucket(db, "2026-10-14", STUDIO_FREE_BUCKET), { reserved_micro: 1000, actual_micro: 0 });
  // The isolate died mid-call: nobody settles. The job expires.
  const sweep = await expireDueJobs(db.asD1(), NOW + JOB_TTL_MS);
  assert.equal(sweep.converted, 1);
  assert.deepEqual(bucket(db, "2026-10-14", STUDIO_FREE_BUCKET), { reserved_micro: 1000, actual_micro: 1000 });
  assert.equal(row(db, job.id).cost_micro, 1000);
  assert.equal(row(db, job.id).reserved_micro, 0);
  // The call comes back after all: its reservation is gone, nothing moves.
  assert.equal(await spend.settle(1000, 400, null), false);
  assert.deepEqual(bucket(db, "2026-10-14", STUDIO_FREE_BUCKET), { reserved_micro: 1000, actual_micro: 1000 });
  // A reservation on a closed job is given back at once.
  assert.deepEqual(await spend.reserve(500, OPEN, NOW + JOB_TTL_MS + 1), { ok: false, kind: "closed" });
  assert.deepEqual(bucket(db, "2026-10-14", STUDIO_FREE_BUCKET), { reserved_micro: 1000, actual_micro: 1000 });
  // Pictures follow a done job: a reservation on it is allowed while it lives.
  const photo = await started(db, { subject: subject(43) });
  await handOut(db.asD1(), photo, OUTLINE_BIT, "deck", NOW + 2000);
  assert.deepEqual(await new JobSpend(db.asD1(), (await reload(db, photo))).reserve(700, OPEN, NOW + 3000), { ok: true });
  assert.equal(row(db, photo.id).reserved_micro, 700);
});

test("the picture cap: only after bit 0, while the job lives, never past the cap", async () => {
  const db = await database();
  const job = await started(db, { subject: subject(44) });
  const store = new LedgerStore(db.asD1());
  assert.equal(await store.takeImageCall(job.id, job.subject, 4, NOW + 1000), null);
  await handOut(db.asD1(), job, OUTLINE_BIT, "deck", NOW + 2000);
  const calls = await Promise.all(Array.from({ length: 8 }, () => store.takeImageCall(job.id, job.subject, 4, NOW + 3000)));
  assert.deepEqual(calls.filter((value) => value !== null).sort(), [1, 2, 3, 4]);
  assert.equal(await store.takeImageCall(job.id, subject(45), 9, NOW + 3000), null);
  assert.equal(await store.takeImageCall(job.id, job.subject, 9, NOW + JOB_TTL_DELIVERED_MS), null);
});

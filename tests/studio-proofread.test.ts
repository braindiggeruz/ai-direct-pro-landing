// The proofreading pass of paid Uzbek decks (functions/lib/studio/
// proofread.ts; DECISIONS 07.10 §13 item 4, §16; MEASURE-30 §6): when it
// runs, what it may change field by field, what it reads, and that it is
// metered on the job under its own allowance and can never cost the unit.
// Real SQLite for the meter (tests/helpers/sqlite-d1.ts), a mocked fetch for
// Z.ai. No network, no remote database, no key.
// Run: node --import tsx --test tests/studio-proofread.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { ensureSchema } from "../functions/lib/gpt-chat/schema";
import { ensureBillingSchema } from "../functions/lib/gpt-chat/billing-schema";
import { STUDIO_ORG, ensureStudioSchema } from "../functions/lib/studio/schema";
import { parseStudioConfig } from "../functions/lib/studio/config";
import { ZAI_ENDPOINT } from "../functions/lib/gpt-chat/zai-chat";
import { STUDIO_PAID_BUCKET } from "../functions/lib/studio/limits";
import { deckInputMac, type LedgerJob } from "../functions/lib/studio/ledger";
import { maxSteps, proofSteps, startJob } from "../functions/lib/studio/jobs";
import { STEP_LIMITS, maxJobModelCalls } from "../functions/lib/studio/plans";
import { PROOF_SYSTEM, PROOF_TEMPERATURE, proofMessages, pythonJson } from "../functions/lib/studio/prompts";
import type { PartSlide } from "../functions/lib/studio/deck-schema";
import { textCallMicro } from "../functions/lib/studio/spend";
import { modelPrice, tokenCostMicro } from "../functions/lib/studio/pricing";
import {
  PROOF_BOUNDS,
  acceptField,
  checkProof,
  proofTextOf,
  proofreadPart,
  proofreadWanted,
  type ProofPart,
} from "../functions/lib/studio/proofread";
import { SUV, writtenPart } from "./helpers/studio-full";
import { zaiStream } from "./helpers/studio-site";

const ENV = { ZAI_API_KEY: "zai-placeholder-for-tests", OPENROUTER_API_KEY: "openrouter-placeholder-for-tests" };
const MAC_ENV = { GPT_IDENTITY_SECRET: "studio-proofread-test-mac-material-only-for-tests" };
const CONFIG = parseStudioConfig(JSON.stringify({ STUDIO_PAID_SERVICE: "on", STUDIO_FULL_DECK: "true", STUDIO_MAX_SLIDES: "15" }));
const CONTEXT = { locale: "uz", topic: SUV.topic } as const;
const USER = "acct_studio_proof";
const HOUR = 3_600_000;

/** Part 2 of the measured deck as the part step hands it out. */
const PART: ProofPart = { slides: writtenPart(1) };
const INDEXES = SUV.parts[1].indexes;

/** The part, as the model would send it back, with `edit` applied to a copy of its slides. */
function answer(edit: (slides: Array<{ index: number; title: string; bullets: string[]; notes: string }>) => void, head: Record<string, unknown> = {}) {
  const slides = structuredClone(PART.slides.map((slide) => ({ ...slide, bullets: [...slide.bullets] })));
  edit(slides);
  return { ...head, slides };
}

// ── When ────────────────────────────────────────────────────────────────────

test("it runs for Uzbek paid decks only (a unit of an entitlement, or its regeneration), while STUDIO_PAID_PROOFREAD is on", () => {
  const on = { paidProofread: true };
  assert.equal(proofreadWanted(on, "uz", "entitlement"), true);
  assert.equal(proofreadWanted(on, "uz", "regen"), true);
  assert.equal(proofreadWanted(on, "uz", "free"), false);
  assert.equal(proofreadWanted(on, "ru", "entitlement"), false);
  assert.equal(proofreadWanted({ paidProofread: false }, "uz", "entitlement"), false);
  // The switch reads on unless exactly "false" (config.ts, Build-0).
  assert.equal(parseStudioConfig("{}").paidProofread, true);
  assert.equal(parseStudioConfig(JSON.stringify({ STUDIO_PAID_PROOFREAD: "false" })).paidProofread, false);
  assert.equal(parseStudioConfig(JSON.stringify({ STUDIO_PAID_PROOFREAD: "off" })).paidProofread, true);
});

// ── What it reads ───────────────────────────────────────────────────────────

test("what it reads: PROOF_SYSTEM, then the part as measure30.py sent it ({\"slides\": …}, json.dumps separators); part 1 also the cover", () => {
  const messages = proofMessages(proofTextOf(PART));
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], { role: "system", content: PROOF_SYSTEM });
  assert.equal(messages[1].role, "user");
  const slides = PART.slides.map((slide) => ({ index: slide.index, title: slide.title, bullets: [...slide.bullets], notes: slide.notes }));
  assert.equal(messages[1].content, pythonJson({ slides }));
  assert.match(messages[1].content, /^\{"slides": \[\{"index": 5, "title": /);
  const first = proofMessages(proofTextOf({ title: SUV.outline.title, subtitle: SUV.outline.subtitle, slides: writtenPart(0) }));
  assert.deepEqual(Object.keys(JSON.parse(first[1].content)), ["title", "subtitle", "slides"]);
  assert.equal(PROOF_TEMPERATURE, 0.2);
});

// ── What it may change ──────────────────────────────────────────────────────

test("acceptField: the same numbers in the same order, near the original's length, and a talk keeps its number of sentences", () => {
  const notes = "Temur 1336-yilda tug‘ilgan. U barlos qabilasidan bo‘lgan. Bolaligidan jasur o‘sgan.";
  assert.equal(acceptField(notes, notes), true);
  assert.equal(acceptField(notes, notes.replace("jasur", "botir"), { sentences: true }), true);
  assert.equal(acceptField(notes, notes.replace("1336", "1337")), false, "a changed number");
  assert.equal(acceptField(notes, notes.replace("1336-yilda ", "")), false, "a dropped number");
  assert.equal(acceptField("3/5 va 25%", "25% va 3/5"), false, "numbers in another order");
  assert.equal(acceptField(notes, notes.replace(" Bolaligidan jasur o‘sgan.", ""), { sentences: true }), false, "a sentence dropped");
  assert.equal(acceptField(notes, `${notes} Yana bir gap.`, { sentences: true }), false, "a sentence added");
  assert.equal(acceptField(notes, ""), false, "emptied");
  const short = "Suv aylanishi";
  assert.equal(acceptField(short, "Suvning tabiatdagi aylanishi"), true, "within the slack of short texts");
  assert.equal(acceptField(notes, notes.slice(0, Math.floor(notes.length * PROOF_BOUNDS.minRatio) - PROOF_BOUNDS.slackChars - 5)), false, "cut short");
  assert.equal(acceptField(short, short.repeat(4)), false, "grown too long");
});

test("checkProof: a corrected word is taken; a changed number, a lost bullet or a new sentence keeps that field as written", () => {
  const fixed = checkProof(
    answer((slides) => {
      slides[0].title = `${slides[0].title}lar`;
      slides[1].bullets[1] = slides[1].bullets[1].replace(/\p{L}+$/u, (word) => `${word}lar`);
      slides[2].notes = slides[2].notes.replace(/\d+/, (digits) => String(Number(digits) + 1));
      slides[3].bullets = slides[3].bullets.slice(1);
    }),
    PART,
    { ...CONTEXT },
  );
  assert.ok(fixed.ok, fixed.ok ? "" : fixed.problems.join());
  const out = fixed.value;
  assert.equal(out.slides[0].title, `${PART.slides[0].title}lar`);
  assert.equal(out.slides[1].bullets[1], PART.slides[1].bullets[1].replace(/\p{L}+$/u, (word) => `${word}lar`));
  if (/\d/.test(PART.slides[2].notes)) assert.equal(out.slides[2].notes, PART.slides[2].notes);
  assert.deepEqual(out.slides[3].bullets, PART.slides[3].bullets);
  assert.equal(out.changed, 2);
  assert.ok(out.kept >= 1);
  // The plan indexes stay the part's, whatever the answer numbered.
  assert.deepEqual(out.slides.map((slide) => slide.index), INDEXES);
});

test("checkProof: the answer goes through the part's own check: Uzbek normalized, Cyrillic, links, a brand, the slide count refused", () => {
  const apostrophes = checkProof(answer((slides) => void (slides[0].bullets[0] = "O'quvchilar suvni tejaydi")), PART, CONTEXT);
  assert.ok(apostrophes.ok);
  assert.equal(apostrophes.value.slides[0].bullets[0], "O‘quvchilar suvni tejaydi");
  for (const [name, edit] of [
    ["cyrillic", (slides: Array<{ notes: string }>) => slides.forEach((slide) => void (slide.notes = "Сув табиатда айланади ва яна қайтади. Бу жараён доимий. Қуёш нури асосий куч.")) ],
    ["link", (slides: Array<{ notes: string }>) => void (slides[0].notes = `${slides[0].notes} https://example.com`)],
    ["brand", (slides: Array<{ notes: string }>) => void (slides[0].notes = slides[0].notes.replace(/\.$/, ", dedi ChatGPT."))],
    ["count", (slides: Array<unknown>) => void slides.pop()],
  ] as const) {
    const checked = checkProof(answer(edit as never), PART, CONTEXT);
    assert.equal(checked.ok, false, name);
  }
  for (const raw of [null, [], "text", { slides: "x" }]) assert.equal(checkProof(raw, PART, CONTEXT).ok, false);
});

test("checkProof: the cover of part 1 is read too; a cover the checks refuse stays as written", () => {
  const first: ProofPart = { title: SUV.outline.title, subtitle: SUV.outline.subtitle, slides: writtenPart(0) };
  const raw = { title: `${first.title}i`, subtitle: first.subtitle, slides: first.slides.map((slide) => ({ ...slide })) };
  const taken = checkProof(raw, first, CONTEXT);
  assert.ok(taken.ok);
  assert.equal(taken.value.title, `${first.title}i`);
  assert.equal(taken.value.subtitle, first.subtitle);
  for (const title of ["https://example.com", "Сув айланиши", 42, "x".repeat(200)]) {
    const kept = checkProof({ ...raw, title }, first, CONTEXT);
    assert.ok(kept.ok, String(title));
    assert.equal(kept.value.title, first.title, String(title));
  }
  // Parts after the first carry no cover, and none is made up.
  const later = checkProof(answer(() => undefined, { title: "Yangi sarlavha" }), PART, CONTEXT);
  assert.ok(later.ok);
  assert.ok(!("title" in later.value));
});

// ── Metered on the job, never costing the unit ──────────────────────────────

async function paidJob(): Promise<{ db: SqliteD1; job: LedgerJob }> {
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  await ensureBillingSchema(db.asD1());
  await ensureStudioSchema(db.asD1());
  const now = Date.now();
  db.sqlite
    .prepare(
      `INSERT INTO studio_entitlements(org_id,id,order_id,user_id,mode,plan,plan_version,starts_at,ends_at,presentations_limit,photos_limit)
       VALUES(?,?,?,?,'live','kunlik','studio-2026-10-decks-v1',?,?,1,0)`,
    )
    .run(STUDIO_ORG, "se_proof", "se_proof", USER, now - HOUR, now + 24 * HOUR);
  const inputMac = (await deckInputMac(MAC_ENV, { topic: SUV.topic, locale: "uz", audience: "maktab", slides: 12, palette: 1, shape: "full" }))!;
  const started = await startJob(db.asD1(), {
    config: CONFIG,
    subject: `a:${USER}`,
    requestId: "proof_request_1",
    tool: "presentation",
    shape: "full",
    slides: 12,
    inputMac,
    source: { kind: "entitlement", userId: USER, mode: "live" },
    now,
  });
  assert.ok(started.ok);
  return { db, job: started.job };
}

function fetchOf(replies: Array<() => Response>) {
  const sent: Array<Record<string, unknown>> = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), ZAI_ENDPOINT, "a paid pass never leaves Z.ai");
    sent.push(JSON.parse(String(init?.body)));
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected call");
    return reply();
  }) as typeof fetch;
  return { fn, sent };
}

const steps = (db: SqliteD1, id: string) => Number(db.value("SELECT steps FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, id));

test("proofreadPart: one call at 0.2 on the paid bucket; the corrected part comes back with what changed", async () => {
  const { db, job } = await paidJob();
  const corrected = answer((slides) => void (slides[0].title = `${slides[0].title}lar`));
  const { fn, sent } = fetchOf([() => zaiStream(JSON.stringify(corrected))]);
  const outcome = await proofreadPart({ env: ENV, config: CONFIG, db: db.asD1(), job, context: CONTEXT, part: PART, fetch: fn });
  assert.equal(outcome.status, "proofread");
  assert.equal(outcome.changed, 1);
  assert.equal(outcome.part.slides[0].title, `${PART.slides[0].title}lar`);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].temperature, 0.2);
  assert.equal(sent[0].max_tokens, STEP_LIMITS.proof.maxTokens);
  assert.equal(steps(db, job.id), 1);
  const bucket = db.rows<{ actual_micro: number }>("SELECT actual_micro FROM gpt_model_spend WHERE org_id=? AND bucket=?", STUDIO_ORG, STUDIO_PAID_BUCKET)[0];
  assert.ok(bucket && bucket.actual_micro > 0);
});

test("proofreadPart: whatever goes wrong, the part comes back exactly as written, after one call at most", async () => {
  const failures: Array<[string, () => Response]> = [
    ["provider error", () => new Response("{}", { status: 500 })],
    ["1302", () => new Response(JSON.stringify({ error: { code: "1302" } }), { status: 429, headers: { "content-type": "application/json" } })],
    ["1301 refusal", () => zaiStream("", { finish: "sensitive" })],
    ["prose", () => zaiStream("Matn to‘g‘ri.")],
    ["cut off", () => zaiStream("{\"slides\": [", { finish: "length" })],
    ["one slide lost", () => zaiStream(JSON.stringify(answer((slides) => void slides.pop())))],
    ["a thrown fetch", () => { throw new Error("socket closed"); }],
  ];
  for (const [name, reply] of failures) {
    const { db, job } = await paidJob();
    const { fn, sent } = fetchOf([reply, reply]);
    const outcome = await proofreadPart({ env: ENV, config: CONFIG, db: db.asD1(), job, context: CONTEXT, part: PART, fetch: fn });
    assert.equal(outcome.status, "failed", name);
    assert.deepEqual(outcome.part, PART, name);
    assert.equal(sent.length, 1, name);
    // The job is untouched: no fault, no release.
    const row = db.rows<{ state: string; fault: string | null }>("SELECT state, fault FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, job.id)[0];
    assert.deepEqual({ ...row }, { state: "reserved", fault: null }, name);
  }
});

test("its own allowance: past the parts' cap a pass still runs, one call a part at most beyond it, then it stops without a call", async () => {
  const { db, job } = await paidJob();
  const parts = job.partsTotal - 1;
  assert.equal(proofSteps(job), parts * STEP_LIMITS.proof.attempts);
  assert.equal(maxSteps(job) + proofSteps(job), maxJobModelCalls("full", 12, true));
  // The outline and the parts used every call they may make.
  db.exec(`UPDATE studio_unit_ledger SET steps=${maxSteps(job)} WHERE id='${job.id}'`);
  const reply = () => zaiStream(JSON.stringify(answer(() => undefined)));
  const { fn, sent } = fetchOf(Array.from({ length: parts + 1 }, () => reply));
  for (let i = 0; i < parts; i++) {
    const outcome = await proofreadPart({ env: ENV, config: CONFIG, db: db.asD1(), job, context: CONTEXT, part: PART, fetch: fn });
    assert.equal(outcome.status, "proofread", `pass ${i + 1}`);
  }
  assert.equal(steps(db, job.id), maxSteps(job) + proofSteps(job));
  const over = await proofreadPart({ env: ENV, config: CONFIG, db: db.asD1(), job, context: CONTEXT, part: PART, fetch: fn });
  assert.equal(over.status, "failed");
  assert.deepEqual(over.part, PART);
  assert.equal(sent.length, parts, "no call past the allowance");
});

test("a paid day's bucket that is full stops the pass before its call: the part goes out as written, the owner is alerted", async () => {
  const { db, job } = await paidJob();
  const full = parseStudioConfig(JSON.stringify({ STUDIO_PAID_SERVICE: "on", STUDIO_FULL_DECK: "true", STUDIO_PAID_DAILY_USD_STOP: "1" }));
  db.sqlite
    .prepare("INSERT INTO gpt_model_spend(org_id,day,bucket,reserved_micro,actual_micro) VALUES(?,?,?,?,0)")
    .run(STUDIO_ORG, job.reserveDay, STUDIO_PAID_BUCKET, 1_000_000);
  const { fn, sent } = fetchOf([() => zaiStream("{}")]);
  const outcome = await proofreadPart({ env: ENV, config: full, db: db.asD1(), job, context: CONTEXT, part: PART, fetch: fn });
  assert.equal(outcome.status, "failed");
  assert.deepEqual(outcome.part, PART);
  assert.deepEqual(outcome.alerts, ["studio_paid_stop"]);
  assert.equal(sent.length, 0);
});

test("the measured part passes its own check unchanged: a pass that changes nothing changes nothing", () => {
  const same = checkProof(answer(() => undefined), PART, CONTEXT);
  assert.ok(same.ok);
  assert.equal(same.value.changed, 0);
  assert.equal(same.value.kept, 0);
  const slides: readonly PartSlide[] = same.value.slides;
  assert.deepEqual(slides, PART.slides);
});

test("its price: a call at its ceiling (PROOF_SYSTEM and a part in, as long as a part out) at the shadow price of glm-5.3-flash", () => {
  const price = modelPrice("zai/glm-5.3-flash")!;
  assert.ok(price);
  const ceiling = tokenCostMicro(price, { input: STEP_LIMITS.proof.inputTokens, output: STEP_LIMITS.proof.maxTokens });
  assert.equal(textCallMicro("zai/glm-5.3-flash", "proof", STEP_LIMITS.proof.maxTokens), ceiling);
  // Under a part's own ceiling: proofreading never reserves more than the part it reads.
  assert.ok(ceiling <= textCallMicro("zai/glm-5.3-flash", "part", STEP_LIMITS.part.lengthRetryMaxTokens));
  assert.throws(() => textCallMicro("openrouter:google/gemma-4-31b-it:free-unknown", "proof", 1300));
});

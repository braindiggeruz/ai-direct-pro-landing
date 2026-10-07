// The full deck (T3.1; spec §2.3, §6, §7.1; DECISIONS 07.10 §13 item 4–5):
// POST /api/studio/presentations {shape:"full"}, /:job/outline, /:job/slides
// {part, outline, sig} and /:job/images, end to end on SQLite with the real
// schema, a fake Workers AI binding and a Z.ai stand-in that answers each
// request by what it asks for (tests/helpers/studio-full.ts). No network, no
// remote database, no key.
// Run: node --import tsx --test tests/studio-full-deck.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as createEndpoint } from "../functions/api/studio/presentations/index";
import { onRequest as outlineEndpoint } from "../functions/api/studio/presentations/[job]/outline";
import { onRequest as slidesEndpoint } from "../functions/api/studio/presentations/[job]/slides";
import { onRequest as imagesEndpoint } from "../functions/api/studio/presentations/[job]/images";
import { STUDIO_ORG } from "../functions/lib/studio/schema";
import { maxSteps, proofSteps } from "../functions/lib/studio/jobs";
import { DECK_SHAPES, STEP_LIMITS, maxJobModelCalls } from "../functions/lib/studio/plans";
import { PROMPT_GUARD_MODEL } from "../functions/lib/studio/pricing";
import { PROOF_SYSTEM, outlineMessages } from "../functions/lib/studio/prompts";
import { signImagePrompt } from "../functions/lib/studio/sign";
import { STUDIO_PAID_BUCKET } from "../functions/lib/studio/limits";
import { IDENTITY_KEY, OPENROUTER_PLACEHOLDER, browser, call, post, studioSite, zaiError, zaiStream, type Site } from "./helpers/studio-site";
import {
  FULL_TASK,
  PAID,
  PROCENTY,
  PROOF_MARK,
  RU_TASK,
  SUV,
  buyer,
  partAnswer,
  presentationsUsed,
  routeZai,
  sentFor,
  writtenPart,
  type Buyer,
} from "./helpers/studio-full";

const CREATE = "/api/studio/presentations";
const at = (job: string, step: string) => `/api/studio/presentations/${job}/${step}`;

let requests = 0;
const requestId = () => `full_${(++requests).toString().padStart(10, "0")}`;
const fullBody = (over: Record<string, unknown> = {}) => ({ requestId: requestId(), ...FULL_TASK, shape: "full", ...over });

type Json = Record<string, unknown>;

async function paidSite(context: Parameters<typeof studioSite>[0], config: Record<string, string> = {}, env: Record<string, unknown> = {}) {
  return studioSite(context, { config: { ...PAID, ...config }, env });
}

async function start(site: Site, who: Pick<Buyer, "cookie">, over: Record<string, unknown> = {}) {
  const response = await call(site, createEndpoint, post(CREATE, fullBody(over), { cookie: who.cookie }));
  return { response, body: (await response.json()) as Json };
}

async function outline(site: Site, who: Pick<Buyer, "cookie">, job: string, task: Json = FULL_TASK) {
  const response = await call(site, outlineEndpoint, post(at(job, "outline"), task, { cookie: who.cookie }), { job });
  return { response, body: (await response.json()) as Json };
}

interface OutlineBody {
  outline: { title: string; subtitle: string; slides: Array<{ index: number; title: string; point: string }> };
  sig: string;
  images: Array<{ index: number; prompt: string; sig: string }>;
  parts: number;
}

async function part(site: Site, who: Pick<Buyer, "cookie">, job: string, number: number, plan: OutlineBody, task: Json = FULL_TASK) {
  const response = await call(site, slidesEndpoint, post(at(job, "slides"), { ...task, part: number, outline: plan.outline, sig: plan.sig }, { cookie: who.cookie }), { job });
  return { response, body: (await response.json()) as Json };
}

async function image(site: Site, who: Pick<Buyer, "cookie">, job: string, picture: { index: number; prompt: string; sig: string }) {
  return call(site, imagesEndpoint, post(at(job, "images"), picture, { cookie: who.cookie }), { job });
}

const ledger = (site: Site, id: string) =>
  site.db.rows<Record<string, unknown>>("SELECT * FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, id)[0];

function everyStoredText(site: Site): string {
  const tables = site.db.rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name);
  return tables.flatMap((table) => site.db.rows<Json>(`SELECT * FROM "${table}"`).flatMap((row) => Object.values(row).map(String))).join("\n");
}

/** A started job with its outline delivered. */
async function planned(site: Site, who: Buyer, task: Json = FULL_TASK): Promise<{ jobId: string; plan: OutlineBody }> {
  const started = await start(site, who, task === FULL_TASK ? {} : { ...task });
  assert.equal(started.response.status, 201, JSON.stringify(started.body));
  const jobId = started.body.jobId as string;
  const answer = await outline(site, who, jobId, task);
  assert.equal(answer.response.status, 200, JSON.stringify(answer.body));
  return { jobId, plan: answer.body as unknown as OutlineBody };
}

// ── The happy path ──────────────────────────────────────────────────────────

test("the full deck end to end: a unit of the entitlement, the outline, pictures only after it, every part at once with proofreading, done", async (context) => {
  const site = await paidSite(context);
  routeZai(site);
  const who = await buyer(site, { presentations: 10 });

  const started = await start(site, who);
  assert.equal(started.response.status, 201, JSON.stringify(started.body));
  const jobId = started.body.jobId as string;
  assert.deepEqual(
    { ...started.body, expiresAt: typeof started.body.expiresAt },
    {
      ok: true,
      jobId,
      source: "entitlement",
      entitlementId: who.entitlementId,
      shape: { slides: 12, images: 8, notes: true, palette: 2, parts: 4 },
      next: "outline",
      expiresAt: "string",
    },
  );
  // Paid generations go by the buyer's session: no Turnstile.
  assert.equal(site.siteverify.length, 0);
  assert.equal(presentationsUsed(site, who.entitlementId), 1);
  assert.equal(ledger(site, jobId).subject, who.subject);

  // A picture before the outline went out: 409 job_state, no Flux call.
  const early = { index: 1, prompt: SUV.outline.slides[0].image_prompt, sig: (await signImagePrompt({ GPT_IDENTITY_SECRET: IDENTITY_KEY }, jobId, 1, SUV.outline.slides[0].image_prompt))! };
  const tooEarly = await image(site, who, jobId, early);
  assert.equal(tooEarly.status, 409);
  assert.equal(((await tooEarly.json()) as Json).code, "job_state");
  assert.equal(site.ai.calls.length, 0);

  // The outline: asked as measured, the plan without picture prompts, signed, the prompts signed one by one.
  const planAnswer = await outline(site, who, jobId);
  assert.equal(planAnswer.response.status, 200, JSON.stringify(planAnswer.body));
  const plan = planAnswer.body as unknown as OutlineBody;
  const [outlineSent] = sentFor(site, "outline");
  assert.deepEqual(outlineSent.body.messages, outlineMessages(FULL_TASK));
  assert.equal(outlineSent.body.temperature, 0.3);
  assert.equal(outlineSent.body.max_tokens, STEP_LIMITS.outline.maxTokens);
  assert.equal(plan.parts, 3);
  assert.equal(plan.outline.slides.length, 12);
  for (const slide of plan.outline.slides) assert.deepEqual(Object.keys(slide), ["index", "title", "point"]);
  assert.match(plan.sig, /^[A-Za-z0-9_-]{20,}$/);
  assert.ok(plan.images.length > 0 && plan.images.length <= DECK_SHAPES.full.images, String(plan.images.length));
  for (const picture of plan.images) assert.equal(picture.prompt, SUV.outline.slides[picture.index - 1].image_prompt);
  assert.equal(site.ai.count(PROMPT_GUARD_MODEL), 1);
  assert.equal(ledger(site, jobId).parts_done, 1);
  assert.equal(ledger(site, jobId).state, "delivering");

  // Pictures may start now, while the parts are written.
  const first = await image(site, who, jobId, plan.images[0]);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "image/jpeg");

  // Every part at once.
  const parts = await Promise.all([1, 2, 3].map((number) => part(site, who, jobId, number, plan)));
  for (const [i, answer] of parts.entries()) {
    assert.equal(answer.response.status, 200, JSON.stringify(answer.body));
    const deck = answer.body.deck as { title?: string; subtitle?: string; slides: Array<{ index: number; bullets: string[]; notes?: string; layout: string }> };
    assert.equal(answer.body.part, i + 1);
    assert.deepEqual(deck.slides.map((slide) => slide.index), SUV.parts[i].indexes);
    for (const slide of deck.slides) {
      assert.ok(slide.notes && slide.notes.length > 40, `notes of ${slide.index}`);
      // Proofread (the stand-in marks the first bullet), then laid out as text: the browser places the pictures.
      assert.ok(slide.bullets[0].endsWith(PROOF_MARK), `proofread ${slide.index}`);
      assert.equal(slide.layout, "title-bullets");
    }
    // The cover comes with part 1, proofread with it.
    if (i === 0) assert.equal(deck.title, SUV.outline.title);
    else assert.ok(!("title" in deck));
  }
  assert.deepEqual(parts.map((answer) => answer.body.done).filter(Boolean), [true]);

  // Three parts, three proofreading calls: «fix the language only», T 0.2, as long as a part.
  const proofs = sentFor(site, "proof");
  assert.equal(sentFor(site, "part").length, 3);
  assert.equal(proofs.length, 3);
  for (const proof of proofs) {
    const messages = proof.body.messages as Array<{ role: string; content: string }>;
    assert.equal(messages[0].content, PROOF_SYSTEM);
    assert.equal(proof.body.temperature, 0.2);
    assert.equal(proof.body.max_tokens, STEP_LIMITS.proof.maxTokens);
    assert.equal(proof.body.model, "glm-5.3-flash");
  }
  const cover = proofs.map((proof) => JSON.parse((proof.body.messages as Array<{ content: string }>)[1].content)).filter((input) => "title" in input);
  assert.equal(cover.length, 1);

  // The unit is spent; every call settled on the paid bucket.
  const row = ledger(site, jobId);
  assert.equal(row.state, "done");
  assert.equal(row.parts_done, 15);
  assert.equal(row.fault, null);
  assert.equal(row.steps, 1 + 3 + 3);
  assert.ok(Number(row.steps) <= maxSteps({ shape: "full", partsTotal: 4 }) + proofSteps({ shape: "full", partsTotal: 4 }));
  assert.equal(maxSteps({ shape: "full", partsTotal: 4 }) + proofSteps({ shape: "full", partsTotal: 4 }), maxJobModelCalls("full", 12, true));
  assert.equal(row.reserved_micro, 0);
  assert.ok(Number(row.cost_micro) > 0);
  const bucket = site.db.rows<{ reserved_micro: number; actual_micro: number }>("SELECT reserved_micro, actual_micro FROM gpt_model_spend WHERE org_id=? AND bucket=?", STUDIO_ORG, STUDIO_PAID_BUCKET)[0];
  assert.ok(bucket && bucket.actual_micro > 0);
  assert.equal(site.db.value("SELECT COUNT(*) FROM gpt_model_spend WHERE org_id=? AND bucket='studio_free'", STUDIO_ORG), 0);
  assert.equal(presentationsUsed(site, who.entitlementId), 1);

  // Nothing of the topic, the plan or the slides is in D1; logs are {event, code} only.
  const stored = everyStoredText(site).toLowerCase();
  for (const text of ["suvning", SUV.parts[0].slides[0].bullets[0].toLowerCase(), SUV.outline.slides[0].image_prompt.toLowerCase()]) assert.ok(!stored.includes(text), text);
  for (const line of site.logs) {
    assert.deepEqual(Object.keys(JSON.parse(line)), ["event", "code"]);
    assert.doesNotMatch(line.toLowerCase(), /suv|aylanish/);
  }
});

test("a part that fails is asked again on its own: the fault is marked, the retry delivers it, the deck is done and the fault cleared", async (context) => {
  const site = await paidSite(context);
  // Part 2 answers twice with prose (not JSON): one step, two attempts, invalid_output.
  routeZai(site, 40, (asked, body, nth) => (asked === "part" && JSON.stringify(body).includes("Write ONLY slides 5, 6, 7, 8") && nth <= 3 ? zaiStream("Here are your slides.") : undefined));
  const who = await buyer(site);
  const { jobId, plan } = await planned(site, who);
  const [one, two, three] = await Promise.all([1, 2, 3].map((number) => part(site, who, jobId, number, plan)));
  assert.equal(one.response.status, 200);
  assert.equal(three.response.status, 200);
  assert.equal(two.response.status, 422);
  assert.deepEqual(two.body, { ok: false, code: "invalid_output", error: two.body.error, retry: true });
  assert.ok(!("deck" in two.body));
  let row = ledger(site, jobId);
  assert.equal(row.state, "delivering");
  assert.match(String(row.fault), /^4:invalid_output$/);

  // The browser asks for part 2 again: only that part, and the deck is done.
  const again = await part(site, who, jobId, 2, plan);
  assert.equal(again.response.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.done, true);
  row = ledger(site, jobId);
  assert.equal(row.state, "done");
  assert.equal(row.fault, null);
  assert.equal(presentationsUsed(site, who.entitlementId), 1);
  // A part already delivered is never written twice.
  const twice = await part(site, who, jobId, 1, plan);
  assert.equal(twice.response.status, 409);
  assert.equal(twice.body.code, "job_state");
});

test("a part that faults with no call left gives the unit back at once", async (context) => {
  const site = await paidSite(context);
  routeZai(site, 60, (asked, body) => (asked === "part" && JSON.stringify(body).includes("Write ONLY slides 9, 10, 11, 12") ? zaiStream("not json") : undefined));
  const who = await buyer(site, { presentations: 1 });
  const { jobId, plan } = await planned(site, who);
  for (const number of [1, 2]) assert.equal((await part(site, who, jobId, number, plan)).response.status, 200);
  // Part 3 fails every time: 2 attempts a call, until the job's cap (outline 1 + parts 2 + proofs 2 + …).
  let last: Awaited<ReturnType<typeof part>> | null = null;
  for (let call = 0; call < 6; call++) {
    last = await part(site, who, jobId, 3, plan);
    if (last.body.retry !== true) break;
  }
  assert.ok(last);
  assert.equal(last.body.retry, false);
  const row = ledger(site, jobId);
  assert.equal(row.state, "released");
  assert.equal(row.reason, "fault");
  // Parts and outline stop at maxSteps; the proofreading pass took its own allowance on top.
  assert.ok(Number(row.steps) <= maxJobModelCalls("full", 12, true));
  assert.equal(presentationsUsed(site, who.entitlementId), 0);
});

// ── Proofreading ────────────────────────────────────────────────────────────

test("proofreading: only Uzbek decks, only paid ones, and off when STUDIO_PAID_PROOFREAD is exactly \"false\"", async (context) => {
  // A Russian paid deck: no pass.
  const ru = await paidSite(context);
  routeZai(ru, 40, (asked, body) => (asked === "part" ? partAnswer(body, PROCENTY) : asked === "outline" ? zaiStream(JSON.stringify(PROCENTY.outline)) : undefined));
  const ruBuyer = await buyer(ru);
  const ruJob = await planned(ru, ruBuyer, RU_TASK);
  const ruParts = await Promise.all([1, 2, 3].map((number) => part(ru, ruBuyer, ruJob.jobId, number, ruJob.plan, RU_TASK)));
  for (const answer of ruParts) assert.equal(answer.response.status, 200, JSON.stringify(answer.body));
  assert.equal(sentFor(ru, "proof").length, 0);
  assert.equal(ledger(ru, ruJob.jobId).state, "done");

  // The switch off: an Uzbek paid deck goes out as the part step wrote it.
  const off = await paidSite(context, { STUDIO_PAID_PROOFREAD: "false" });
  routeZai(off);
  const offBuyer = await buyer(off);
  const offJob = await planned(off, offBuyer);
  const offParts = await Promise.all([1, 2, 3].map((number) => part(off, offBuyer, offJob.jobId, number, offJob.plan)));
  for (const [i, answer] of offParts.entries()) {
    assert.equal(answer.response.status, 200);
    const slides = (answer.body.deck as { slides: Array<{ bullets: string[]; notes: string }> }).slides;
    assert.deepEqual(slides.map(({ bullets, notes }) => ({ bullets, notes })), writtenPart(i).map(({ bullets, notes }) => ({ bullets, notes })));
  }
  assert.equal(sentFor(off, "proof").length, 0);

  // Anything but exactly "false" keeps it on.
  const typo = await paidSite(context, { STUDIO_PAID_PROOFREAD: "no" });
  routeZai(typo);
  const typoBuyer = await buyer(typo);
  const typoJob = await planned(typo, typoBuyer);
  assert.equal((await part(typo, typoBuyer, typoJob.jobId, 1, typoJob.plan)).response.status, 200);
  assert.equal(sentFor(typo, "proof").length, 1);
});

test("a proofreading pass that fails leaves the part as written and the unit as it is: an error, 1302, prose, a changed number", async (context) => {
  const failures: Array<[string, () => Response]> = [
    ["provider error", () => zaiError(500, "500")],
    ["rate limit 1302", () => zaiError(429, "1302")],
    ["no balance 1113", () => zaiError(429, "1113")],
    ["prose", () => zaiStream("I fixed the text.")],
    ["cut off", () => zaiStream("{\"slides\": [", { finish: "length" })],
  ];
  for (const [name, failure] of failures) {
    const site = await paidSite(context);
    routeZai(site, 40, (asked) => (asked === "proof" ? failure() : undefined));
    const who = await buyer(site);
    const { jobId, plan } = await planned(site, who);
    const answers = await Promise.all([1, 2, 3].map((number) => part(site, who, jobId, number, plan)));
    for (const [i, answer] of answers.entries()) {
      assert.equal(answer.response.status, 200, `${name}: ${JSON.stringify(answer.body)}`);
      const slides = (answer.body.deck as { slides: Array<{ title: string; bullets: string[]; notes: string }> }).slides;
      assert.deepEqual(slides.map(({ title, bullets, notes }) => ({ title, bullets, notes })), writtenPart(i).map(({ title, bullets, notes }) => ({ title, bullets, notes })), name);
    }
    // ONE call a part, never a second try (STEP_LIMITS.proof.attempts = 1, DECISIONS §16).
    assert.equal(sentFor(site, "proof").length, 3, name);
    const row = ledger(site, jobId);
    assert.equal(row.state, "done", name);
    assert.equal(row.fault, null, name);
    assert.equal(presentationsUsed(site, who.entitlementId), 1, name);
  }

  // A correction that changes a number is not taken: that field stays as written.
  const site = await paidSite(context);
  routeZai(site, 40, (asked, body) => {
    if (asked !== "proof") return undefined;
    const input = JSON.parse((body.messages as Array<{ content: string }>)[1].content) as { slides: Array<{ notes: string }> };
    const slides = input.slides.map((slide) => ({ ...slide, notes: slide.notes.replace(/\d+/, (digits) => String(Number(digits) + 1)) }));
    return zaiStream(JSON.stringify({ ...input, slides }));
  });
  const who = await buyer(site);
  const { jobId, plan } = await planned(site, who);
  const answers = await Promise.all([1, 2, 3].map((number) => part(site, who, jobId, number, plan)));
  for (const [i, answer] of answers.entries()) {
    const slides = (answer.body.deck as { slides: Array<{ notes: string }> }).slides;
    assert.deepEqual(slides.map((slide) => slide.notes), writtenPart(i).map((slide) => slide.notes));
  }
});

// ── Never another model, never another person ───────────────────────────────

test("a paid deck never goes to OpenRouter: 1302 is studio_busy at once, 1113 a fault without any other model", async (context) => {
  const site = await paidSite(context, {}, { OPENROUTER_API_KEY: OPENROUTER_PLACEHOLDER });
  const who = await buyer(site);
  const started = await start(site, who);
  const jobId = started.body.jobId as string;

  site.zai.push(zaiError(429, "1302"));
  const busy = await outline(site, who, jobId);
  assert.equal(busy.response.status, 503);
  assert.equal(busy.body.code, "studio_busy");
  assert.equal(site.sent.filter((item) => item.url.includes("z.ai")).length, 1);

  site.zai.push(zaiError(429, "1113"));
  const broke = await outline(site, who, jobId);
  assert.equal(broke.response.status, 503);
  assert.equal(broke.body.code, "model_unavailable");
  assert.equal(site.sent.filter((item) => item.url.includes("z.ai")).length, 2);

  assert.equal(site.openRouter.length, 0);
  assert.equal(site.sent.filter((item) => item.url.includes("openrouter")).length, 0);
  // The unit is still the buyer's: it comes back when the job is released (a fault, nothing delivered).
  assert.match(String(ledger(site, jobId).fault), /^1:/);
});

test("the outline travels signed: a changed, foreign or missing outline is 400 outline_tampered and nothing is called", async (context) => {
  const site = await paidSite(context);
  routeZai(site);
  const who = await buyer(site);
  const { jobId, plan } = await planned(site, who);
  const other = await planned(site, await buyer(site));
  const before = site.sent.length;
  const changed = structuredClone(plan);
  changed.outline.slides[3].point = "Boshqa narsa";
  for (const [name, sent] of [
    ["changed", changed],
    ["foreign", { ...plan, sig: other.plan.sig }],
    ["unsigned", { ...plan, sig: "" }],
  ] as const) {
    const answer = await part(site, who, jobId, 1, sent as OutlineBody);
    assert.equal(answer.response.status, 400, name);
    assert.equal(answer.body.code, "outline_tampered", name);
  }
  // Another task under this job (its input_mac) is refused too.
  const wrongTask = await part(site, who, jobId, 1, plan, { ...FULL_TASK, topic: "Amir Temur" });
  assert.equal(wrongTask.response.status, 400);
  assert.equal(wrongTask.body.code, "invalid");
  // A part the deck does not have.
  for (const number of [0, 4, 1.5]) assert.equal((await part(site, who, jobId, number, plan)).body.code, "invalid");
  assert.equal(site.sent.length - before, 0);
});

test("only the buyer's own job: another account, a browser identity or no cookie → 404; no account at the start → 402 no_units", async (context) => {
  const site = await paidSite(context);
  routeZai(site);
  const who = await buyer(site);
  const { jobId, plan } = await planned(site, who);
  const stranger = await buyer(site);
  const visitor = await browser();
  for (const cookie of [stranger.cookie, visitor.cookie, "__Host-studio_account=" + "0".repeat(64)]) {
    assert.equal((await outline(site, { cookie }, jobId)).response.status, 404);
    assert.equal((await part(site, { cookie }, jobId, 1, plan)).response.status, 404);
    assert.equal((await image(site, { cookie }, jobId, plan.images[0])).status, 404);
  }

  // Never bought: no unit to spend, nothing taken, no row.
  const rows = site.db.value("SELECT COUNT(*) FROM studio_unit_ledger");
  const none = await start(site, { cookie: visitor.cookie });
  assert.equal(none.response.status, 402);
  assert.equal(none.body.code, "no_units");
  // An entitlement spent, ended or of the other mode: 402 too.
  const spent = await buyer(site, { presentations: 1 });
  site.db.exec(`UPDATE studio_entitlements SET presentations_used=1 WHERE id='${spent.entitlementId}'`);
  assert.equal((await start(site, spent)).body.code, "no_units");
  const ended = await buyer(site, { endsAt: Date.now() - 1 });
  assert.equal((await start(site, ended)).body.code, "no_units");
  const rehearsal = await buyer(site, { mode: "test" });
  assert.equal((await start(site, rehearsal)).body.code, "no_units");
  assert.equal(site.db.value("SELECT COUNT(*) FROM studio_unit_ledger"), rows);
});

test("switches: the full deck's paths are 404 before the body while STUDIO_PAID_SERVICE or STUDIO_FULL_DECK is off, or off the site", async (context) => {
  const jobId = `sj_${"b".repeat(32)}`;
  for (const [config, host] of [
    [{ STUDIO_PAID_SERVICE: "off" }, "https://gptbot.uz"],
    [{ STUDIO_FULL_DECK: "false" }, "https://gptbot.uz"],
    [{}, "https://ai-direct-pro-landing.pages.dev"],
  ] as const) {
    const site = await paidSite(context, config);
    const who = await buyer(site);
    const request = post(at(jobId, "outline"), FULL_TASK, { cookie: who.cookie, host });
    assert.equal((await call(site, outlineEndpoint, request, { job: jobId })).status, 404, JSON.stringify(config));
    assert.equal(request.bodyUsed, false);
    // A full start under a free-only release: 404 (the body names the deck, its own switches decide).
    const created = await call(site, createEndpoint, post(CREATE, fullBody(), { cookie: who.cookie, host }));
    assert.equal(created.status, 404, JSON.stringify(config));
  }
  // The slider stops at STUDIO_MAX_SLIDES: 15 is refused under 12.
  const twelve = await paidSite(context, { STUDIO_MAX_SLIDES: "12" });
  const who = await buyer(twelve);
  assert.equal((await start(twelve, who, { slides: 15 })).body.code, "invalid");
  assert.equal((await start(twelve, who, { slides: 12 })).response.status, 201);
});

// ── The local measurement's arithmetic (apps/studio/scripts/deck-measure.ts) ──

test("deck-measure: nearest-rank quantiles, the word spans the proofreading changed, the slider's verdict", async () => {
  const { parseArgs, quantile, summarize, wordChanges } = await import("../apps/studio/scripts/deck-measure");
  assert.equal(quantile([5, 1, 4, 2, 3], 0.5), 3);
  assert.equal(quantile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.9), 90);
  assert.ok(Number.isNaN(quantile([], 0.9)));
  assert.deepEqual(wordChanges("Bu suvlar bulok‘lar va quduqlardan chiqadi.", "Bu suvlar buloqlar va quduqlardan chiqadi."), [{ from: "bulok‘lar", to: "buloqlar" }]);
  assert.deepEqual(wordChanges("Tatir suv zaxirasi juda oz", "Chuchuk suv zaxirasi juda oz"), [{ from: "Tatir", to: "Chuchuk" }]);
  assert.deepEqual(wordChanges("bir ikki uch", "bir ikki uch"), []);
  assert.deepEqual(wordChanges("bir uch", "bir ikki uch"), [{ from: "", to: "ikki" }]);
  const deck = (id: string, ready: number, ok = true) => ({
    id, topic: id, ok, times: { outline: 15_000, text: ready - 1_000, ready }, parts: [{ part: 1, ms: 20_000, calls: 1, code: "ok" }],
    pictures: { asked: 8, drawn: 8, none: 0 }, ledger: { state: "done", steps: 9, costUzs: 110, tokensIn: 1, tokensOut: 1 }, zai: [], logs: { "studio_proof.corrected": 4 }, proof: { inputs: 4, changes: [] },
    ...(ok ? {} : { code: "part:model_failed" }),
  });
  const fast = summarize(Array.from({ length: 10 }, (_, i) => deck(`d${i}`, 40_000 + i * 2_000)));
  assert.equal(fast.readyMs.p90, 56_000);
  assert.equal(fast.recommendation, 15);
  assert.deepEqual(fast.proof.codes, { corrected: 40 });
  const slow = summarize(Array.from({ length: 10 }, (_, i) => deck(`d${i}`, 50_000 + i * 2_000)));
  assert.equal(slow.readyMs.p90, 66_000);
  assert.equal(slow.recommendation, 12);
  const broken = summarize([...Array.from({ length: 9 }, (_, i) => deck(`d${i}`, 40_000)), deck("d9", 40_000, false)]);
  assert.equal(broken.recommendation, 12, "a failed deck keeps the slider at 12");
  assert.deepEqual(broken.failures, { "part:model_failed": 1 });
  assert.throws(() => parseArgs([]), /--out/);
  assert.throws(() => parseArgs(["--out", "tests"]), /outside the repository/);
  assert.deepEqual(parseArgs(["--out", "C:/tmp/measure", "--decks", "3", "--proofread", "off", "--no-images"]).proofread, false);
});

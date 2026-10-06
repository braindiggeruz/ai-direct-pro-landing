// The free deck's API (T2.1; spec §6, §7.1, §2.3, §5.4, §10.2):
// POST /api/studio/presentations, /:job/slides and /api/studio/event, end to
// end on SQLite with the real schema, a fake Workers AI binding and mocked
// Siteverify / Z.ai / OpenRouter (tests/helpers/studio-site.ts). No network,
// no remote database, no key.
// Run: node --import tsx --test tests/studio-presentations.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as createEndpoint } from "../functions/api/studio/presentations/index";
import { onRequest as slidesEndpoint } from "../functions/api/studio/presentations/[job]/slides";
import { onRequest as eventEndpoint } from "../functions/api/studio/event";
import { ZAI_ENDPOINT } from "../functions/lib/gpt-chat/zai-chat";
import { OPENROUTER_ENDPOINT } from "../functions/lib/gpt-chat/openrouter-chat";
import { STUDIO_ORG } from "../functions/lib/studio/schema";
import { JOB_TTL_MS } from "../functions/lib/studio/ledger";
import { expireDueJobs } from "../functions/lib/studio/jobs";
import { freeDay, nextFreeResetAt } from "../functions/lib/studio/free-usage";
import { freeMessages } from "../functions/lib/studio/prompts";
import { STEP_LIMITS } from "../functions/lib/studio/plans";
import { PROMPT_GUARD_MODEL } from "../functions/lib/studio/pricing";
import { STUDIO_EVENTS_PER_HOUR } from "../functions/lib/studio/events";
import { readCreateRequest, readDeckTask } from "../functions/lib/studio/presentation";
import { parseStudioConfig } from "../functions/lib/studio/config";
import {
  KASRLAR,
  OPENROUTER_PLACEHOLDER,
  TASK,
  browser,
  call,
  createBody,
  deckAnswer,
  post,
  studioSite,
  zaiError,
  type Site,
} from "./helpers/studio-site";

const CREATE = "/api/studio/presentations";
const slidesPath = (job: string) => `/api/studio/presentations/${job}/slides`;

async function create(site: Site, cookie: string, over: Record<string, unknown> = {}, options: { ip?: string } = {}) {
  const response = await call(site, createEndpoint, post(CREATE, createBody(over), { cookie, ...options }));
  return { response, body: (await response.json()) as Record<string, unknown> };
}

async function slides(site: Site, cookie: string, job: string, task: Record<string, unknown> = TASK) {
  const response = await call(site, slidesEndpoint, post(slidesPath(job), task, { cookie }), { job });
  return { response, body: (await response.json()) as Record<string, unknown> };
}

const ledger = (site: Site, id: string) =>
  site.db.rows<Record<string, unknown>>("SELECT * FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, id)[0];
const used = (site: Site, subject: string, unit = "presentation_free") =>
  Number(site.db.value("SELECT used FROM studio_free_usage WHERE org_id=? AND day=? AND subject=? AND unit=?", STUDIO_ORG, freeDay(Date.now()), subject, unit) ?? 0);
const spend = (site: Site) =>
  site.db.rows<{ reserved_micro: number; actual_micro: number }>("SELECT reserved_micro, actual_micro FROM gpt_model_spend WHERE org_id=? AND bucket='studio_free'", STUDIO_ORG)[0];

/** Every text value of every row of every table, for "no topic was stored". */
function everyStoredText(site: Site): string {
  const tables = site.db.rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name);
  return tables.flatMap((table) => site.db.rows<Record<string, unknown>>(`SELECT * FROM "${table}"`).flatMap((row) => Object.values(row).map(String))).join("\n");
}

// ── The happy path ──────────────────────────────────────────────────────────

test("the free deck end to end: a job, then the deck, then the unit is spent; nothing of the topic is kept", async (context) => {
  const site = await studioSite(context);
  const { cookie, subject } = await browser();
  const started = await create(site, cookie);
  assert.equal(started.response.status, 201);
  assert.equal(started.response.headers.get("cache-control"), "no-store");
  const jobId = started.body.jobId as string;
  assert.match(jobId, /^sj_[0-9a-f]{32}$/);
  assert.deepEqual(
    { ...started.body, expiresAt: typeof started.body.expiresAt },
    { ok: true, jobId, source: "free", shape: { slides: 6, images: 2, notes: false, palette: 1, parts: 1 }, next: "slides", expiresAt: "string" },
  );
  assert.ok(Date.parse(started.body.expiresAt as string) > Date.now() + JOB_TTL_MS - 60_000);
  assert.equal(site.siteverify.length, 1);
  assert.equal(ledger(site, jobId).state, "reserved");
  assert.equal(used(site, subject), 1);

  site.zai.push(deckAnswer());
  const deck = await slides(site, cookie, jobId);
  assert.equal(deck.response.status, 200, JSON.stringify(deck.body));
  // The model was asked exactly as measured: FREE_V3, glm-5.3-flash, 0.3, 1100 tokens.
  assert.equal(site.sent.length, 1);
  const sent = site.sent[0].body;
  assert.equal(sent.model, "glm-5.3-flash");
  assert.equal(sent.temperature, 0.3);
  assert.equal(sent.max_tokens, STEP_LIMITS.free.maxTokens);
  assert.deepEqual(sent.messages, freeMessages(TASK));

  const body = deck.body as { ok: boolean; part: number; done: boolean; deck: { title: string; subtitle: string; slides: Array<Record<string, unknown>> }; images: Array<{ index: number; prompt: string; sig: string }> };
  assert.equal(body.ok, true);
  assert.equal(body.part, 1);
  assert.equal(body.done, true);
  assert.equal(body.deck.title, KASRLAR.title);
  assert.equal(body.deck.slides.length, 6);
  for (const [i, slide] of body.deck.slides.entries()) {
    assert.equal(slide.index, i + 1);
    assert.ok(!("image_prompt" in slide) && !("imagePrompt" in slide) && !("notes" in slide));
  }
  // Two pictures: the first two prompts that pass the word lists, signed, their slides laid out for a picture.
  assert.deepEqual(body.images.map((image) => image.index), [1, 2]);
  assert.deepEqual(body.images.map((image) => image.prompt), [KASRLAR.slides[0].image_prompt, KASRLAR.slides[1].image_prompt]);
  for (const image of body.images) assert.match(image.sig, /^[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(body.deck.slides.map((slide) => slide.layout), ["image-right", "image-right", "title-bullets", "title-bullets", "title-bullets", "title-bullets"]);
  // ONE Llama Guard call over both prompts.
  assert.equal(site.ai.count(PROMPT_GUARD_MODEL), 1);
  assert.match(JSON.stringify(site.ai.calls[0].inputs), /1\. pizza sliced/);

  // The unit is spent: the row is done, its cost settled on studio_free.
  const row = ledger(site, jobId);
  assert.equal(row.state, "done");
  assert.equal(row.parts_done, 1);
  assert.equal(row.steps, 1);
  assert.equal(row.reserved_micro, 0);
  assert.ok(Number(row.cost_micro) > 0);
  assert.equal(row.model, "zai/glm-5.3-flash");
  assert.equal(row.tokens_out, 700);
  const bucket = spend(site);
  assert.equal(bucket.reserved_micro, bucket.actual_micro);
  assert.equal(bucket.actual_micro, Number(row.cost_micro));
  assert.equal(used(site, subject), 1);

  // The topic, the deck and the prompts are nowhere in D1; logs are {event, code} only.
  const stored = everyStoredText(site).toLowerCase();
  for (const text of ["kasr", KASRLAR.slides[0].bullets[0].toLowerCase(), "pizza"]) assert.ok(!stored.includes(text), text);
  for (const line of site.logs) {
    assert.deepEqual(Object.keys(JSON.parse(line)), ["event", "code"]);
    assert.doesNotMatch(line.toLowerCase(), /kasr|pizza/);
  }
});

test("the same request id again answers the same job: no second unit, no second Turnstile; another task under it is refused", async (context) => {
  const site = await studioSite(context);
  const { cookie, subject } = await browser();
  const body = createBody();
  const first = await call(site, createEndpoint, post(CREATE, body, { cookie }));
  const again = await call(site, createEndpoint, post(CREATE, { ...body, turnstileToken: "spent-token" }, { cookie }));
  assert.equal(first.status, 201);
  assert.equal(again.status, 201);
  assert.deepEqual(await again.json(), await first.json());
  assert.equal(site.siteverify.length, 1);
  assert.equal(used(site, subject), 1);
  assert.equal(site.db.value("SELECT COUNT(*) FROM studio_unit_ledger"), 1);
  const other = await call(site, createEndpoint, post(CREATE, { ...body, topic: "Amir Temur" }, { cookie }));
  assert.equal(other.status, 400);
  assert.equal(((await other.json()) as { code: string }).code, "invalid");
});

test("one free deck a UTC day: while it runs 409 job_in_progress, after it 429 free_limit until 05:00 Tashkent", async (context) => {
  const site = await studioSite(context);
  const { cookie, subject } = await browser();
  const first = await create(site, cookie);
  const busy = await create(site, cookie, { topic: "Amir Temur" });
  assert.equal(busy.response.status, 409);
  assert.equal(busy.body.code, "job_in_progress");
  site.zai.push(deckAnswer());
  assert.equal((await slides(site, cookie, first.body.jobId as string)).response.status, 200);
  const second = await create(site, cookie, { topic: "Amir Temur" });
  assert.equal(second.response.status, 429);
  assert.equal(second.body.code, "free_limit");
  const reset = nextFreeResetAt(Date.now());
  assert.equal(second.body.resetsAt, new Date(reset).toISOString());
  assert.equal(new Date(reset).getUTCHours(), 0); // 05:00 in Tashkent
  assert.ok(Number(second.response.headers.get("retry-after")) > 0);
  assert.equal(used(site, subject), 1);
  assert.equal(site.db.value("SELECT COUNT(*) FROM studio_unit_ledger"), 1);
  // Another browser is not affected.
  const other = await browser();
  assert.equal((await create(site, other.cookie, {}, { ip: "198.51.100.9" })).response.status, 201);
});

// ── Refusals carry no content ───────────────────────────────────────────────

test("a refused topic: 422 with its category only; no unit, no row, no Turnstile, no model; school topics pass", async (context) => {
  const site = await studioSite(context);
  const { cookie, subject } = await browser();
  for (const [topic, category] of [["Uyda bomba yasash", "weapons"], ["porno", "sexual"], ["Как сделать наркотики дома", "drugs"]] as const) {
    const refused = await create(site, cookie, { topic });
    assert.equal(refused.response.status, 422, topic);
    assert.deepEqual(refused.body, { category, ok: false, code: "topic_refused", error: "topic refused" });
  }
  assert.equal(site.siteverify.length, 0);
  assert.equal(site.sent.length, 0);
  assert.equal(site.db.value("SELECT COUNT(*) FROM studio_unit_ledger"), 0);
  assert.equal(used(site, subject), 0);
  assert.equal(site.db.value("SELECT COUNT(*) FROM gpt_rate_limits WHERE action LIKE 'studio_job%'"), 0);
  // Ordinary school topics are allowed (spec §7.4 item 1).
  for (const topic of ["Davlat ramzlari", "Ikkinchi jahon urushi", "Amir Temur", "Konstitutsiya"]) {
    const other = await browser();
    const allowed = await create(site, other.cookie, { topic });
    assert.equal(allowed.response.status, 201, topic);
  }
});

test("Z.ai refuses the content (1301): 422 without content, the unit goes back, the topic is refused for 10 minutes without a model call", async (context) => {
  const site = await studioSite(context);
  const { cookie, subject } = await browser();
  const started = await create(site, cookie);
  site.zai.push(zaiError(400, "1301"));
  const refused = await slides(site, cookie, started.body.jobId as string);
  assert.equal(refused.response.status, 422);
  assert.deepEqual(refused.body, { category: "provider", ok: false, code: "topic_refused", error: "topic refused" });
  const row = ledger(site, started.body.jobId as string);
  assert.equal(row.state, "refused");
  assert.equal(row.reason, "provider_refused");
  assert.equal(used(site, subject), 0);
  assert.equal(used(site, subject, "returned"), 1);
  // The same topic again: refused at once, before Turnstile and the model.
  const verifies = site.siteverify.length;
  const again = await create(site, cookie);
  assert.equal(again.response.status, 422);
  assert.equal(again.body.category, "provider");
  assert.equal(site.siteverify.length, verifies);
  assert.equal(site.sent.length, 1);
  // Another topic is a new task: the unit came back, so it may start.
  assert.equal((await create(site, cookie, { topic: "Quyosh sistemasi" })).response.status, 201);
});

// ── Faults hand the unit back ───────────────────────────────────────────────

test("a model fault: 502 with retry; the browser asks once more; with no call left the unit goes back at once", async (context) => {
  const site = await studioSite(context);
  const { cookie, subject } = await browser();
  const started = await create(site, cookie);
  const jobId = started.body.jobId as string;
  site.zai.push(zaiError(500, "1234"), zaiError(500, "1234"));
  const first = await slides(site, cookie, jobId);
  assert.equal(first.response.status, 502);
  assert.deepEqual(first.body, { retry: true, ok: false, code: "model_failed", error: "model failed" });
  assert.equal(ledger(site, jobId).state, "reserved");
  assert.match(String(ledger(site, jobId).fault), /^1:model_failed$/);
  site.zai.push(zaiError(500, "1234"), zaiError(500, "1234"));
  const second = await slides(site, cookie, jobId);
  assert.equal(second.response.status, 502);
  assert.equal(second.body.retry, false);
  const row = ledger(site, jobId);
  assert.equal(row.state, "released");
  assert.equal(row.reason, "fault");
  assert.equal(row.steps, 4);
  assert.equal(used(site, subject), 0);
  assert.equal(used(site, subject, "returned"), 1);
  assert.equal(site.sent.length, 4);
  const closed = await slides(site, cookie, jobId);
  assert.equal(closed.response.status, 409);
  assert.equal(closed.body.code, "job_state");
  assert.equal(site.sent.length, 4);
  // Every call settled: nothing is left open on the row, and the bucket counts
  // what the row counts (a 5xx may still be billed: spend.ts fails closed).
  assert.equal(row.reserved_micro, 0);
  assert.equal(spend(site).actual_micro, Number(row.cost_micro));
  assert.equal(spend(site).reserved_micro, spend(site).actual_micro);
  // The unit is back: a new deck may start.
  assert.equal((await create(site, cookie)).response.status, 201);
});

test("an invalid answer is asked once more; a cut-off answer is asked again with ×1.5 tokens", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const started = await create(site, cookie);
  site.zai.push(deckAnswer((all) => all.slice(0, 5)), deckAnswer());
  const deck = await slides(site, cookie, started.body.jobId as string);
  assert.equal(deck.response.status, 200);
  assert.equal(ledger(site, started.body.jobId as string).steps, 2);
  const other = await browser();
  const second = await create(site, other.cookie, {}, { ip: "198.51.100.10" });
  const cutOff = () =>
    new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "{\"title\"" }, finish_reason: "length" }] })}\n\ndata: [DONE]\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
  site.zai.push(cutOff, () => deckAnswer());
  const cut = await slides(site, other.cookie, second.body.jobId as string);
  assert.equal(cut.response.status, 200);
  assert.deepEqual(site.sent.slice(-2).map((entry) => entry.body.max_tokens), [STEP_LIMITS.free.maxTokens, STEP_LIMITS.free.lengthRetryMaxTokens]);
});

test("only the free deck falls back to OpenRouter ':free' when Z.ai fails", async (context) => {
  const site = await studioSite(context, { env: { OPENROUTER_API_KEY: OPENROUTER_PLACEHOLDER } });
  const { cookie } = await browser();
  const started = await create(site, cookie);
  site.zai.push(zaiError(500, "1234"));
  site.openRouter.push(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(KASRLAR) }, finish_reason: "stop" }], usage: { prompt_tokens: 800, completion_tokens: 600 } }), { headers: { "content-type": "application/json" } }));
  const deck = await slides(site, cookie, started.body.jobId as string);
  assert.equal(deck.response.status, 200);
  assert.deepEqual(site.sent.map((entry) => entry.url), [ZAI_ENDPOINT, OPENROUTER_ENDPOINT]);
  assert.equal((site.sent[1].body.provider as { data_collection: string }).data_collection, "deny");
  assert.equal(ledger(site, started.body.jobId as string).model, "openrouter:google/gemma-4-31b-it:free");
});

test("1302 (Z.ai busy) is studio_busy at once: no retry, the part is marked, the browser may try again", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const started = await create(site, cookie);
  site.zai.push(zaiError(429, "1302"));
  const busy = await slides(site, cookie, started.body.jobId as string);
  assert.equal(busy.response.status, 503);
  assert.equal(busy.body.code, "studio_busy");
  assert.equal(busy.body.retry, true);
  assert.equal(site.sent.length, 1);
});

// ── The task, the owner, the state ──────────────────────────────────────────

test("the task is sent again and must hash to the job's input_mac; another browser's job is not found; a delivered job is not written twice", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const started = await create(site, cookie);
  const jobId = started.body.jobId as string;
  for (const task of [
    { ...TASK, topic: "Amir Temur" },
    { ...TASK, slides: 5 },
    { ...TASK, audience: "talaba" },
    { ...TASK, locale: "ru" },
    { topic: TASK.topic },
    {},
  ]) {
    const wrong = await slides(site, cookie, jobId, task);
    assert.equal(wrong.response.status, 400, JSON.stringify(task));
    assert.equal(wrong.body.code, "invalid");
  }
  assert.equal(site.sent.length, 0);
  // The same task typed differently (spaces, case) is the same task.
  site.zai.push(deckAnswer());
  const stranger = await browser();
  const foreign = await slides(site, stranger.cookie, jobId);
  assert.equal(foreign.response.status, 404);
  const same = await slides(site, cookie, jobId, { ...TASK, topic: "  oddiy   KASRLAR " });
  assert.equal(same.response.status, 200);
  const twice = await slides(site, cookie, jobId);
  assert.equal(twice.response.status, 409);
  assert.equal(twice.body.code, "job_state");
  assert.equal(site.sent.length, 1);
  const missing = await slides(site, cookie, `sj_${"f".repeat(32)}`);
  assert.equal(missing.response.status, 404);
  const malformed = await call(site, slidesEndpoint, post(slidesPath("sj_x"), TASK, { cookie }), { job: "sj_x" });
  assert.equal(malformed.status, 404);
});

test("an expired job that never got its deck gives the unit back (the sweep), and its deck can no longer be written", async (context) => {
  const site = await studioSite(context);
  const { cookie, subject } = await browser();
  const started = await create(site, cookie);
  const sweep = await expireDueJobs(site.db.asD1(), Date.now() + JOB_TTL_MS + 1000);
  assert.equal(sweep.released, 1);
  const row = ledger(site, started.body.jobId as string);
  assert.equal(row.state, "released");
  assert.equal(row.reason, "expired_empty");
  assert.equal(used(site, subject), 0);
  const late = await slides(site, cookie, started.body.jobId as string);
  assert.equal(late.response.status, 409);
  assert.equal(site.sent.length, 0);
});

// ── Pictures dropped, text kept ─────────────────────────────────────────────

test("Llama Guard refuses, fails or the AI binding is missing: the deck goes out without pictures", async (context) => {
  for (const [label, setup] of [
    ["unsafe", (site: Site) => site.ai.queue(PROMPT_GUARD_MODEL, { response: "unsafe\nS1" })],
    ["error", (site: Site) => site.ai.queue(PROMPT_GUARD_MODEL, new Error("down"))],
    ["no binding", (site: Site) => delete site.env.AI],
  ] as const) {
    const site = await studioSite(context);
    setup(site);
    const { cookie } = await browser();
    const started = await create(site, cookie);
    site.zai.push(deckAnswer());
    const deck = await slides(site, cookie, started.body.jobId as string);
    assert.equal(deck.response.status, 200, label);
    const body = deck.body as { images: unknown[]; deck: { slides: Array<{ layout: string }> } };
    assert.deepEqual(body.images, [], label);
    assert.ok(body.deck.slides.every((slide) => slide.layout === "title-bullets"), label);
    assert.equal(ledger(site, started.body.jobId as string).state, "done", label);
    for (const line of site.logs) assert.doesNotMatch(line, /pizza|S1\b.*pizza/);
    context.mock.restoreAll();
  }
});

test("prompts that break the word lists give their place to the next slide", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const started = await create(site, cookie);
  site.zai.push(deckAnswer((all) => {
    all[0].image_prompt = "portrait of a teacher at a blackboard";
    all[1].image_prompt = "flag of Uzbekistan over a city square";
    return all;
  }));
  const deck = await slides(site, cookie, started.body.jobId as string);
  assert.equal(deck.response.status, 200);
  assert.deepEqual((deck.body.images as Array<{ index: number }>).map((image) => image.index), [3, 4]);
});

// ── Fail closed ─────────────────────────────────────────────────────────────

test("identity, configuration and Turnstile fail closed; nothing is taken", async (context) => {
  const site = await studioSite(context);
  const { cookie, subject } = await browser();
  const anonymous = post(CREATE, createBody());
  const noIdentity = await call(site, createEndpoint, anonymous);
  assert.equal(noIdentity.status, 401);
  assert.equal(((await noIdentity.json()) as { code: string }).code, "identity_required");
  assert.equal(anonymous.bodyUsed, false);
  for (const env of [{ STUDIO_TURNSTILE_SECRET_KEY: undefined }, { GPTBOT_DRAFTS_DB: undefined }, { STUDIO_TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" }]) {
    const saved = { ...site.env };
    Object.assign(site.env, env);
    const response = await call(site, createEndpoint, post(CREATE, createBody(), { cookie }));
    assert.equal(response.status, 503, JSON.stringify(env));
    assert.equal(((await response.json()) as { code: string }).code, "studio_not_configured");
    Object.assign(site.env, saved);
  }
  const missing = await create(site, cookie, { turnstileToken: undefined });
  assert.equal(missing.response.status, 403);
  assert.equal(missing.body.code, "turnstile_required");
  site.turnstile = { success: false };
  const failed = await create(site, cookie);
  assert.equal(failed.response.status, 403);
  assert.equal(failed.body.code, "turnstile_failed");
  site.turnstile = { success: true, action: "studio_identity", hostname: "gptbot.uz" };
  const otherAction = await create(site, cookie);
  assert.equal(otherAction.body.code, "turnstile_failed");
  assert.equal(used(site, subject), 0);
  assert.equal(site.db.value("SELECT COUNT(*) FROM studio_unit_ledger"), 0);
  // The deck path without a usable signing secret: 503 before D1 and the model.
  const saved = { ...site.env };
  site.turnstile = { success: true, action: "studio_free_deck", hostname: "gptbot.uz" };
  const started = await create(site, cookie);
  Object.assign(site.env, { GPT_IDENTITY_SECRET: "too-short" });
  const noKey = await call(site, slidesEndpoint, post(slidesPath(started.body.jobId as string), TASK, { cookie }), { job: started.body.jobId as string });
  assert.equal(noKey.status, 401); // the identity cannot be verified without the secret either
  Object.assign(site.env, saved);
});

test("switches and host: off, a preview host or a full deck → 404; malformed requests → 400; POST from this origin only", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  for (const [config, host] of [
    [{ STUDIO_FREE_DECK: "false" }, "https://gptbot.uz"],
    [{ STUDIO_API: "off" }, "https://gptbot.uz"],
    [{}, "https://ai-direct-pro-landing.pages.dev"],
    [{}, "http://localhost:8788"],
  ] as const) {
    const off = await studioSite(context, { config });
    const request = post(CREATE, createBody(), { cookie, host });
    const response = await call(off, createEndpoint, request);
    assert.equal(response.status, 404, `${JSON.stringify(config)} ${host}`);
    assert.equal(request.bodyUsed, false);
    const slidesRequest = post(slidesPath(`sj_${"a".repeat(32)}`), TASK, { cookie, host });
    assert.equal((await call(off, slidesEndpoint, slidesRequest, { job: `sj_${"a".repeat(32)}` })).status, 404);
    assert.equal(slidesRequest.bodyUsed, false);
  }
  // The full deck is T3.1's: 404 even with its switches on.
  const paid = await studioSite(context, { config: { STUDIO_PAID_SERVICE: "on", STUDIO_FULL_DECK: "true" } });
  const full = await create(paid, cookie, { shape: "full", slides: 8 });
  assert.equal(full.response.status, 404);
  const onlyFull = await studioSite(context, { config: { STUDIO_FREE_DECK: "false", STUDIO_PAID_SERVICE: "on", STUDIO_FULL_DECK: "true" } });
  assert.equal((await create(onlyFull, cookie)).response.status, 404);
  for (const over of [
    { topic: "ab" },
    { topic: "x".repeat(201) },
    { topic: 42 },
    { locale: "en" },
    { audience: "boshqa" },
    { slides: 7 },
    { slides: 3 },
    { slides: 5.5 },
    { palette: 2 },
    { palette: 0 },
    { shape: "huge" },
    { requestId: "short" },
    { turnstileToken: 42 },
  ]) {
    const bad = await create(site, cookie, over);
    assert.equal(bad.response.status, 400, JSON.stringify(over));
    assert.equal(bad.body.code, "invalid");
  }
  for (const origin of ["https://evil.example", null]) {
    const response = await call(site, createEndpoint, post(CREATE, createBody(), { cookie, origin }));
    assert.equal(response.status, 400);
  }
  const get = await call(site, createEndpoint, post(CREATE, null, { cookie, method: "GET" }));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  assert.equal(site.siteverify.length, 0);
});

test("the site's start pace (STUDIO_JOB_GLOBAL_PER_MIN) answers 503 studio_busy before Turnstile", async (context) => {
  const site = await studioSite(context, { config: { STUDIO_JOB_GLOBAL_PER_MIN: "1" } });
  const one = await browser();
  const two = await browser();
  assert.equal((await create(site, one.cookie)).response.status, 201);
  const second = await create(site, two.cookie, {}, { ip: "198.51.100.20" });
  assert.equal(second.response.status, 503);
  assert.equal(second.body.code, "studio_busy");
  assert.ok(Number(second.response.headers.get("retry-after")) > 0);
  assert.equal(site.siteverify.length, 1);
});

test("the request reader: the cleaned topic, the free shape's limits, unknown fields ignored", () => {
  const config = parseStudioConfig("{}");
  const read = readCreateRequest({ ...createBody({ topic: "  Oddiy​ kasrlar.  ", extra: "ignored" }) }, config);
  assert.ok(read);
  assert.equal(read.task.topic, "Oddiy kasrlar");
  assert.equal(read.task.shape, "free");
  assert.equal(readDeckTask({ ...TASK }, config, "free")?.slides, 6);
  // The full deck stops at STUDIO_MAX_SLIDES (12 by default).
  assert.equal(readDeckTask({ ...TASK, slides: 12, palette: 3 }, config, "full")?.slides, 12);
  assert.equal(readDeckTask({ ...TASK, slides: 13, palette: 3 }, config, "full"), null);
  assert.equal(readDeckTask({ ...TASK, slides: 15, palette: 3 }, parseStudioConfig(JSON.stringify({ STUDIO_MAX_SLIDES: "15" })), "full")?.slides, 15);
  assert.equal(readDeckTask({ ...TASK, topic: "\u0000\u0001ab" }, config, "free"), null);
});

// ── Funnel events ───────────────────────────────────────────────────────────

const EVENT = "/api/studio/event";
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

test("events: closed lists, one row per event id, no visitor data; 204 either way", async (context) => {
  const site = await studioSite(context);
  const sent = await call(site, eventEndpoint, post(EVENT, { id: uuid(1), type: "studio_tool_started", detail: "presentation", viewId: uuid(99), topic: "Oddiy kasrlar" }));
  assert.equal(sent.status, 204);
  assert.equal(await sent.text(), "");
  assert.equal(sent.headers.get("cache-control"), "no-store");
  const again = await call(site, eventEndpoint, post(EVENT, { id: uuid(1), type: "studio_tool_started", detail: "presentation" }));
  assert.equal(again.status, 204);
  const rows = site.db.rows<Record<string, unknown>>("SELECT * FROM gpt_ui_events");
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0], created_at: typeof rows[0].created_at }, {
    org_id: STUDIO_ORG, id: uuid(1), type: "studio_tool_started", view_id: uuid(99), detail: "presentation", created_at: "number",
  });
  for (const body of [
    { id: uuid(2), type: "studio_tool_started", detail: "essay" },
    { id: uuid(2), type: "pack_viewed", detail: "header" },
    { id: "not-a-uuid", type: "studio_result_ready", detail: "free" },
    { id: uuid(2), type: "studio_result_ready", detail: "free", viewId: "x" },
    [],
  ]) {
    const response = await call(site, eventEndpoint, post(EVENT, body));
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  // A purchase step while payments are off: accepted, not written.
  assert.equal((await call(site, eventEndpoint, post(EVENT, { id: uuid(3), type: "studio_checkout_started", detail: "kunlik" }))).status, 204);
  assert.equal(site.db.value("SELECT COUNT(*) FROM gpt_ui_events"), 1);
  for (const [n, type, detail] of [[10, "studio_result_ready", "free"], [11, "studio_tariffs_viewed", "limit"]] as const) {
    assert.equal((await call(site, eventEndpoint, post(EVENT, { id: uuid(n), type, detail }))).status, 204);
  }
  assert.equal(site.db.value("SELECT COUNT(*) FROM gpt_ui_events"), 3);
});

test("events: 60 an hour per address, then 204 without a row; switched off → 404 before the body", async (context) => {
  const site = await studioSite(context);
  for (let i = 0; i < STUDIO_EVENTS_PER_HOUR + 5; i++) {
    const response = await call(site, eventEndpoint, post(EVENT, { id: uuid(1000 + i), type: "studio_result_ready", detail: "free" }));
    assert.equal(response.status, 204);
  }
  assert.equal(site.db.value("SELECT COUNT(*) FROM gpt_ui_events"), STUDIO_EVENTS_PER_HOUR);
  // Another address is counted on its own.
  await call(site, eventEndpoint, post(EVENT, { id: uuid(5000), type: "studio_result_ready", detail: "free" }, { ip: "198.51.100.77" }));
  assert.equal(site.db.value("SELECT COUNT(*) FROM gpt_ui_events"), STUDIO_EVENTS_PER_HOUR + 1);
  for (const config of [{ STUDIO_EVENTS: "false" }, { STUDIO_API: "off" }] as Array<Record<string, string>>) {
    const off = await studioSite(context, { config });
    const request = post(EVENT, { id: uuid(7), type: "studio_result_ready", detail: "free" });
    assert.equal((await call(off, eventEndpoint, request)).status, 404);
    assert.equal(request.bodyUsed, false);
  }
  const foreign = await call(site, eventEndpoint, post(EVENT, { id: uuid(8), type: "studio_result_ready", detail: "free" }, { origin: "https://evil.example" }));
  assert.equal(foreign.status, 400);
});

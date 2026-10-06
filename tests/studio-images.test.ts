// The pictures of a deck (T2.1; spec §6, §7.4, §7.5): POST
// /api/studio/presentations/:job/images and functions/lib/studio/{images,
// image-check}.ts. JPEG bytes with noindex, only after the deck's text went
// out, only from a prompt signed for the job and slide, under the job's cap;
// the finished picture's check keeps back a person, text or a flag; Flux and
// check failures fail closed and never touch the unit. SQLite, a fake Workers
// AI binding and a mocked Z.ai (tests/helpers/studio-site.ts); no network.
// Run: node --import tsx --test tests/studio-images.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as createEndpoint } from "../functions/api/studio/presentations/index";
import { onRequest as slidesEndpoint } from "../functions/api/studio/presentations/[job]/slides";
import { onRequest as imagesEndpoint } from "../functions/api/studio/presentations/[job]/images";
import { ZAI_ENDPOINT } from "../functions/lib/gpt-chat/zai-chat";
import { STUDIO_ORG } from "../functions/lib/studio/schema";
import { DECK_SHAPES, STEP_LIMITS } from "../functions/lib/studio/plans";
import { FLUX_MICRO_PER_IMAGE, FLUX_MODEL, imageCheckMicro } from "../functions/lib/studio/pricing";
import { CHECK_PROMPT_V2, TAIL_A } from "../functions/lib/studio/prompts";
import { imageCallCap, signImagePrompt } from "../functions/lib/studio/sign";
import { IMAGE_VERDICT_KEYS } from "../functions/lib/studio/safety";
import { base64Bytes, drawPicture, fluxInput, isJpeg, MAX_PICTURE_BYTES, PICTURE_HEADERS } from "../functions/lib/studio/images";
import { checkAnswerText, checkPicture, workersAiCheckInput, zaiCheckBody } from "../functions/lib/studio/image-check";
import {
  FakeAi,
  GEMMA,
  IDENTITY_KEY,
  JPEG,
  JPEG_BASE64,
  SAFE_VERDICT,
  TASK,
  ZAI_PLACEHOLDER,
  browser,
  call,
  createBody,
  deckAnswer,
  post,
  studioSite,
  type Site,
} from "./helpers/studio-site";

interface Picture {
  index: number;
  prompt: string;
  sig: string;
}

/** A job of `cookie` whose deck went out; its signed pictures. */
async function deliveredDeck(site: Site, cookie: string, options: { ip?: string } = {}): Promise<{ jobId: string; images: Picture[] }> {
  const created = await call(site, createEndpoint, post("/api/studio/presentations", createBody(), { cookie, ...options }));
  assert.equal(created.status, 201);
  const { jobId } = (await created.json()) as { jobId: string };
  site.zai.push(deckAnswer());
  const deck = await call(site, slidesEndpoint, post(`/api/studio/presentations/${jobId}/slides`, TASK, { cookie }), { job: jobId });
  assert.equal(deck.status, 200);
  const { images } = (await deck.json()) as { images: Picture[] };
  assert.equal(images.length, 2);
  return { jobId, images };
}

function draw(site: Site, cookie: string, jobId: string, picture: unknown) {
  return call(site, imagesEndpoint, post(`/api/studio/presentations/${jobId}/images`, picture, { cookie }), { job: jobId });
}

const ledger = (site: Site, id: string) =>
  site.db.rows<Record<string, unknown>>("SELECT * FROM studio_unit_ledger WHERE org_id=? AND id=?", STUDIO_ORG, id)[0];
const spend = (site: Site) =>
  site.db.rows<{ reserved_micro: number; actual_micro: number }>("SELECT reserved_micro, actual_micro FROM gpt_model_spend WHERE org_id=? AND bucket='studio_free'", STUDIO_ORG)[0];
const verdict = (patch: Record<string, boolean>) => ({ response: JSON.stringify({ ...JSON.parse(SAFE_VERDICT), ...patch }) });

// ── The endpoint ────────────────────────────────────────────────────────────

test("a picture is image/jpeg bytes, no-store and noindex; drawn with tail A at 4 steps and checked as measured", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const { jobId, images } = await deliveredDeck(site, cookie);
  const unitBefore = site.db.rows("SELECT * FROM studio_free_usage ORDER BY subject, unit");
  const response = await draw(site, cookie, jobId, images[0]);
  assert.equal(response.status, 200);
  for (const [name, value] of Object.entries(PICTURE_HEADERS)) assert.equal(response.headers.get(name), value, name);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.equal(response.headers.get("content-length"), String(JPEG.length));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), JPEG);
  const flux = site.ai.calls.filter((entry) => entry.model === FLUX_MODEL);
  assert.deepEqual(flux.map((entry) => entry.inputs), [{ prompt: `${images[0].prompt}${TAIL_A}`, steps: 4 }]);
  const check = site.ai.calls.filter((entry) => entry.model === GEMMA);
  assert.deepEqual(check.map((entry) => entry.inputs), [workersAiCheckInput(JPEG_BASE64)]);
  // One Flux call counted on the row; a picture never touches the unit.
  const row = ledger(site, jobId);
  assert.equal(row.images, 1);
  assert.equal(row.state, "done");
  assert.deepEqual(site.db.rows("SELECT * FROM studio_free_usage ORDER BY subject, unit"), unitBefore);
  // Spend: Flux and the check, reserved and settled on studio_free; nothing left open.
  assert.equal(row.reserved_micro, 0);
  const bucket = spend(site);
  assert.equal(bucket.reserved_micro, bucket.actual_micro);
  assert.equal(bucket.actual_micro, Number(row.cost_micro));
  // The bytes are kept nowhere and logged nowhere.
  for (const line of site.logs) assert.deepEqual(Object.keys(JSON.parse(line)), ["event", "code"]);
  assert.ok(!site.logs.join("").includes(JPEG_BASE64));
});

test("no picture before the deck's text went out (409 job_state), and none from another browser's job (404)", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const created = await call(site, createEndpoint, post("/api/studio/presentations", createBody(), { cookie }));
  const { jobId } = (await created.json()) as { jobId: string };
  const prompt = "pizza sliced into equal parts on wooden table";
  const sig = (await signImagePrompt({ GPT_IDENTITY_SECRET: IDENTITY_KEY }, jobId, 1, prompt)) as string;
  const early = await draw(site, cookie, jobId, { index: 1, prompt, sig });
  assert.equal(early.status, 409);
  assert.equal(((await early.json()) as { code: string }).code, "job_state");
  assert.equal(site.ai.count(FLUX_MODEL), 0);
  assert.equal(ledger(site, jobId).images, 0);
  site.zai.push(deckAnswer());
  await call(site, slidesEndpoint, post(`/api/studio/presentations/${jobId}/slides`, TASK, { cookie }), { job: jobId });
  const stranger = await browser();
  const foreign = await draw(site, stranger.cookie, jobId, { index: 1, prompt, sig });
  assert.equal(foreign.status, 404);
  assert.equal(site.ai.count(FLUX_MODEL), 0);
  assert.equal((await draw(site, cookie, jobId, { index: 1, prompt, sig })).status, 200);
});

test("only a prompt signed for this job and slide is drawn: anything else is 400 bad_sig before D1 and Flux", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const { jobId, images } = await deliveredDeck(site, cookie);
  const [first, second] = images;
  const other = await deliveredDeck(site, (await browser()).cookie, { ip: "198.51.100.30" });
  for (const forged of [
    { ...first, prompt: `${first.prompt} with a crowd of people` },
    { ...first, prompt: "a portrait of the president" },
    { ...first, index: second.index },
    { ...first, sig: second.sig },
    { ...first, sig: other.images[0].sig },
    { index: first.index, prompt: first.prompt },
    { index: String(first.index), prompt: first.prompt, sig: first.sig },
    { ...first, prompt: "x".repeat(401) },
    {},
  ]) {
    const response = await draw(site, cookie, jobId, forged);
    assert.equal(response.status, 400, JSON.stringify(forged).slice(0, 80));
    assert.equal(((await response.json()) as { code: string }).code, "bad_sig");
  }
  // The other job's own picture, sent under this job's id: not this job's signature.
  assert.equal((await draw(site, cookie, jobId, other.images[0])).status, 400);
  assert.equal(site.ai.count(FLUX_MODEL), 0);
  assert.equal(ledger(site, jobId).images, 0);
});

test("the finished picture's check keeps back a person, a face, text, a flag, a weapon, nudity or blood: 422 image_refused, no bytes", async (context) => {
  const site = await studioSite(context);
  const cases = [...IMAGE_VERDICT_KEYS.map((key) => verdict({ [key]: true })), { response: "I see a pizza." }, { response: { person: false } }];
  for (const answer of cases) {
    const { cookie } = await browser();
    const { jobId, images } = await deliveredDeck(site, cookie);
    site.ai.queue(GEMMA, answer);
    const response = await draw(site, cookie, jobId, images[0]);
    assert.equal(response.status, 422, JSON.stringify(answer));
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    assert.deepEqual(await response.json(), { ok: false, code: "image_refused", error: "image refused" });
  }
  const codes = site.logs.map((line) => JSON.parse(line).code);
  for (const key of IMAGE_VERDICT_KEYS) assert.ok(codes.includes(`refused_${key}`), key);
  assert.ok(codes.includes("refused_unreadable"));
});

test("Flux fails, refuses or answers no JPEG; the check is unavailable: 502 image_failed or 422 image_refused, and the slot may be drawn again", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const { jobId, images } = await deliveredDeck(site, cookie);
  site.ai.queue(FLUX_MODEL, new Error("3040: Capacity temporarily exceeded"));
  const failed = await draw(site, cookie, jobId, images[0]);
  assert.equal(failed.status, 502);
  assert.equal(((await failed.json()) as { code: string }).code, "image_failed");
  site.ai.queue(FLUX_MODEL, new Error("8007: Input prompt contains NSFW content"));
  const nsfw = await draw(site, cookie, jobId, images[0]);
  assert.equal(nsfw.status, 422);
  assert.equal(((await nsfw.json()) as { code: string }).code, "image_refused");
  site.ai.queue(FLUX_MODEL, { image: Buffer.from("GIF89a not a jpeg").toString("base64") });
  const notJpeg = await draw(site, cookie, jobId, images[0]);
  assert.equal(notJpeg.status, 502);
  site.ai.queue(GEMMA, new Error("check down"));
  const unchecked = await draw(site, cookie, jobId, images[1]);
  assert.equal(unchecked.status, 502);
  assert.equal(((await unchecked.json()) as { code: string }).code, "image_failed");
  // Four Flux calls: the free job's cap (2 pictures + 2 redraws) is used up.
  assert.equal(ledger(site, jobId).images, imageCallCap("free"));
  const over = await draw(site, cookie, jobId, images[1]);
  assert.equal(over.status, 409);
  assert.equal(((await over.json()) as { code: string }).code, "image_cap");
  assert.equal(site.ai.count(FLUX_MODEL), 4);
  // The deck stays done; the unit is not touched by pictures.
  assert.equal(ledger(site, jobId).state, "done");
  for (const line of site.logs) assert.doesNotMatch(line, /Capacity|NSFW|check down/);
});

test("the cap: 2 pictures + 2 redraws for a free deck; parallel requests cannot pass it", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const { jobId, images } = await deliveredDeck(site, cookie);
  assert.equal(imageCallCap("free"), DECK_SHAPES.free.images + DECK_SHAPES.free.imageRetries);
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => draw(site, cookie, jobId, images[i % 2])));
  const statuses = responses.map((response) => response.status).sort();
  assert.deepEqual(statuses, [200, 200, 200, 200, 409, 409, 409, 409]);
  assert.equal(site.ai.count(FLUX_MODEL), 4);
  assert.equal(ledger(site, jobId).images, 4);
});

test("a full spend bucket refuses the picture before Flux (image_failed) and tells the owner", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const { jobId, images } = await deliveredDeck(site, cookie);
  site.db.exec(`UPDATE gpt_model_spend SET reserved_micro=3000000 WHERE bucket='studio_free'`);
  const response = await draw(site, cookie, jobId, images[0]);
  assert.equal(response.status, 502);
  assert.equal(((await response.json()) as { code: string }).code, "image_failed");
  assert.equal(site.ai.count(FLUX_MODEL), 0);
  await Promise.all(site.waits);
  assert.equal(site.db.value("SELECT code FROM gpt_service_alerts"), "studio_free_budget_spent");
});

test("an expired job draws nothing; a done job draws until it expires", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const { jobId, images } = await deliveredDeck(site, cookie);
  assert.equal((await draw(site, cookie, jobId, images[0])).status, 200);
  site.db.exec(`UPDATE studio_unit_ledger SET expires_at=${Date.now() - 1}`);
  const late = await draw(site, cookie, jobId, images[1]);
  assert.equal(late.status, 409);
  assert.equal(((await late.json()) as { code: string }).code, "job_state");
  assert.equal(site.ai.count(FLUX_MODEL), 1);
});

test("switches, identity and configuration: 404 before the body when off; 401 without identity; 503 without the AI binding", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const { jobId, images } = await deliveredDeck(site, cookie);
  for (const config of [{ STUDIO_FREE_DECK: "false" }, { STUDIO_API: "off" }] as Array<Record<string, string>>) {
    const off = await studioSite(context, { config });
    const request = post(`/api/studio/presentations/${jobId}/images`, images[0], { cookie });
    assert.equal((await call(off, imagesEndpoint, request, { job: jobId })).status, 404);
    assert.equal(request.bodyUsed, false);
  }
  context.mock.restoreAll();
  const again = await studioSite(context);
  Object.assign(again.env, { GPTBOT_DRAFTS_DB: site.db.asD1(), AI: site.ai });
  const anonymous = await call(again, imagesEndpoint, post(`/api/studio/presentations/${jobId}/images`, images[0]), { job: jobId });
  assert.equal(anonymous.status, 401);
  delete again.env.AI;
  const noAi = await draw(again, cookie, jobId, images[0]);
  assert.equal(noAi.status, 503);
  assert.equal(((await noAi.json()) as { code: string }).code, "studio_not_configured");
  const get = await call(site, imagesEndpoint, post(`/api/studio/presentations/${jobId}/images`, null, { cookie, method: "GET" }), { job: jobId });
  assert.equal(get.status, 405);
});

// ── The library ─────────────────────────────────────────────────────────────

test("drawPicture: base64 JPEG only, under 2 MB; an NSFW refusal is a refusal; a hang is a timeout", async () => {
  const ai = new FakeAi();
  assert.deepEqual(fluxInput("apples on a table"), { prompt: `apples on a table${TAIL_A}`, steps: 4 });
  const ok = await drawPicture(ai, "apples on a table");
  assert.ok(ok.ok);
  assert.deepEqual(ok.ok && ok.bytes, JPEG);
  ai.queue(FLUX_MODEL, { image: "not base64!" }, { image: 42 }, {}, { image: Buffer.from([1, 2, 3, 4]).toString("base64") });
  for (let i = 0; i < 4; i++) assert.deepEqual(await drawPicture(ai, "apples"), { ok: false, reason: "failed", billed: true });
  ai.queue(FLUX_MODEL, new Error("Input prompt contains NSFW content"), new Error("internal error"));
  assert.deepEqual(await drawPicture(ai, "apples"), { ok: false, reason: "refused", billed: false });
  assert.deepEqual(await drawPicture(ai, "apples"), { ok: false, reason: "failed", billed: false });
  ai.queue(FLUX_MODEL, "hang");
  assert.deepEqual(await drawPicture(ai, "apples", 20), { ok: false, reason: "timeout", billed: true });
  const huge = new Uint8Array(MAX_PICTURE_BYTES + 10);
  huge.set([0xff, 0xd8, 0xff]);
  ai.queue(FLUX_MODEL, { image: Buffer.from(huge).toString("base64") });
  assert.equal((await drawPicture(ai, "apples")).ok, false);
  assert.equal(isJpeg(JPEG), true);
  assert.equal(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
  assert.equal(base64Bytes("abc"), null);
  assert.deepEqual(base64Bytes(JPEG_BASE64), JPEG);
});

test("the Workers AI check: the measured input; answers as a string, an object or choices; fails closed", async () => {
  const input = workersAiCheckInput(JPEG_BASE64) as { messages: Array<{ content: Array<Record<string, unknown>> }>; max_tokens: number; temperature: number; chat_template_kwargs: unknown };
  assert.deepEqual(input.messages[0].content, [
    { type: "text", text: CHECK_PROMPT_V2 },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${JPEG_BASE64}` } },
  ]);
  assert.equal(input.max_tokens, STEP_LIMITS.imageCheck.maxTokens);
  assert.equal(input.temperature, 0);
  assert.deepEqual(input.chat_template_kwargs, { enable_thinking: false });
  assert.equal(checkAnswerText({ response: "{}" }), "{}");
  assert.equal(checkAnswerText({ response: { person: true } }), '{"person":true}');
  assert.equal(checkAnswerText({ choices: [{ message: { content: "x" } }] }), "x");
  assert.equal(checkAnswerText(null), null);

  const ai = new FakeAi();
  const deps = { ai, env: {} };
  const cost = imageCheckMicro(GEMMA);
  assert.deepEqual(await checkPicture(deps, GEMMA, JPEG_BASE64), { ok: true, safe: true, verdict: JSON.parse(SAFE_VERDICT), costMicro: cost });
  ai.queue(GEMMA, { choices: [{ message: { content: `\`\`\`json\n${JSON.stringify({ ...JSON.parse(SAFE_VERDICT), text: true })}\n\`\`\`` } }] });
  const texty = await checkPicture(deps, GEMMA, JPEG_BASE64);
  assert.ok(texty.ok && !texty.safe && texty.verdict?.text === true);
  ai.queue(GEMMA, { response: "no json here" }, new Error("down"), "hang");
  const unreadable = await checkPicture(deps, GEMMA, JPEG_BASE64);
  assert.deepEqual(unreadable, { ok: true, safe: false, verdict: null, costMicro: cost });
  assert.deepEqual(await checkPicture(deps, GEMMA, JPEG_BASE64), { ok: false, reason: "provider_error", costMicro: 0 });
  assert.deepEqual(await checkPicture(deps, GEMMA, JPEG_BASE64, 20), { ok: false, reason: "timeout", costMicro: cost });
  assert.deepEqual(await checkPicture({ ai: null, env: {} }, GEMMA, JPEG_BASE64), { ok: false, reason: "unavailable", costMicro: 0 });
});

test("the glm-5.3-flash check (the owner's alternative): JSON mode on Z.ai, billed by usage; a refusal before an answer costs nothing", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const replies: Response[] = [];
  const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(url), ZAI_ENDPOINT);
    sent.push(JSON.parse(String(init?.body)));
    return replies.shift() as Response;
  }) as typeof fetch;
  const deps = { ai: null, env: { ZAI_API_KEY: ZAI_PLACEHOLDER }, fetch: fetchFn };
  const glm = "zai/glm-5.3-flash" as const;
  replies.push(Response.json({ choices: [{ message: { content: SAFE_VERDICT } }], usage: { prompt_tokens: 1000, completion_tokens: 40 } }));
  const ok = await checkPicture(deps, glm, JPEG_BASE64);
  assert.deepEqual(ok, { ok: true, safe: true, verdict: JSON.parse(SAFE_VERDICT), costMicro: Math.ceil(1000 * 0.15 + 40 * 0.5) });
  assert.deepEqual(sent[0], zaiCheckBody(glm, JPEG_BASE64));
  assert.equal(sent[0].model, "glm-5.3-flash");
  assert.equal(sent[0].stream, false);
  assert.deepEqual(sent[0].response_format, { type: "json_object" });
  replies.push(new Response(JSON.stringify({ error: { code: "1302", message: "busy" } }), { status: 429 }));
  assert.deepEqual(await checkPicture(deps, glm, JPEG_BASE64), { ok: false, reason: "unavailable", costMicro: 0 });
  assert.deepEqual(await checkPicture({ ...deps, env: {} }, glm, JPEG_BASE64), { ok: false, reason: "unavailable", costMicro: 0 });
  assert.equal(sent.length, 2);
});

test("spend of one picture: Flux and the check reserved before, settled after; an unbilled Flux error costs the check nothing", async (context) => {
  const site = await studioSite(context);
  const { cookie } = await browser();
  const { jobId, images } = await deliveredDeck(site, cookie);
  const before = Number(ledger(site, jobId).cost_micro);
  assert.equal((await draw(site, cookie, jobId, images[0])).status, 200);
  const afterOne = Number(ledger(site, jobId).cost_micro);
  assert.equal(afterOne - before, FLUX_MICRO_PER_IMAGE + imageCheckMicro(GEMMA));
  site.ai.queue(FLUX_MODEL, new Error("internal error"));
  assert.equal((await draw(site, cookie, jobId, images[1])).status, 502);
  assert.equal(Number(ledger(site, jobId).cost_micro), afterOne);
  assert.equal(ledger(site, jobId).reserved_micro, 0);
});

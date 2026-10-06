// The studio's model client (functions/lib/studio/llm.ts; spec §7.2,
// MEASURE-30 §9): 1302 → studio_busy at once; paid steps never fall back;
// the free deck falls back to OpenRouter ':free'; finish_reason=length is
// asked again with more room; one repair of an invalid answer; Z.ai's own
// refusal is a refusal. Provider calls are a mocked fetch; no network.
// Run: node --import tsx --test tests/studio-llm.test.ts
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { CALL_TIMEOUT_MS, MAX_ANSWER_BYTES, MAX_STREAM_BYTES, runTextStep, textChain, type StepOptions } from "../functions/lib/studio/llm";
import { checkOutline, type Outline } from "../functions/lib/studio/deck-schema";
import { parseStudioConfig } from "../functions/lib/studio/config";
import { STEP_LIMITS } from "../functions/lib/studio/plans";
import { outlineMessages } from "../functions/lib/studio/prompts";
import { tokenCostMicro, MODEL_PRICES } from "../functions/lib/studio/pricing";
import { ZAI_ENDPOINT } from "../functions/lib/gpt-chat/zai-chat";
import { OPENROUTER_ENDPOINT } from "../functions/lib/gpt-chat/openrouter-chat";

// Placeholder credentials for the mocked providers (no scanner reads them as keys).
const ENV = { ZAI_API_KEY: "zai-placeholder-for-tests", OPENROUTER_API_KEY: "openrouter-placeholder-for-tests" };
const CONFIG = parseStudioConfig("{}");
const TOPIC = "Oddiy kasrlar";
const REQUEST = { topic: TOPIC, locale: "uz", audience: "maktab", slides: 3 } as const;

const OUTLINE = {
  title: "Oddiy kasrlar",
  subtitle: "5-sinf",
  slides: [
    { title: "Kasr nima?", point: "Butunning bir qismi", image_prompt: "apple slices on a wooden table" },
    { title: "Surat va maxraj", point: "Ikki son bitta chiziq", image_prompt: "pizza cut into equal slices" },
    { title: "Xulosa", point: "Kasrlar hamma joyda", image_prompt: "orange segments on a white plate" },
  ],
};

interface Sent {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

type Reply = Response | ((init: RequestInit) => Promise<Response>);

function mockFetch(replies: Reply[]) {
  const sent: Sent[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body)), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected call");
    return typeof reply === "function" ? reply(init ?? {}) : reply;
  }) as typeof fetch;
  return { fn, sent };
}

/** A Z.ai stream: the content in a few deltas, reasoning text that must be ignored, then finish and usage. */
function zaiStream(content: string, options: { finish?: string; usage?: object; split?: number } = {}): Response {
  const usage = options.usage ?? { prompt_tokens: 900, completion_tokens: 700, prompt_tokens_details: { cached_tokens: 100 }, completion_tokens_details: { reasoning_tokens: 3 } };
  const pieces = content.match(/[\s\S]{1,40}/g) ?? [""];
  const events = [
    { choices: [{ delta: { reasoning_content: "thinking about the plan" } }] },
    ...pieces.map((piece) => ({ choices: [{ delta: { content: piece } }] })),
    { choices: [{ delta: {}, finish_reason: options.finish ?? "stop" }], usage },
  ];
  const wire = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  // Cut the wire anywhere, even inside a line or a UTF-8 character.
  const bytes = new TextEncoder().encode(wire);
  const size = options.split ?? 7;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += size) controller.enqueue(bytes.slice(at, at + size));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const zaiError = (status: number, code: string) =>
  new Response(JSON.stringify({ error: { code, message: `echo of ${TOPIC}` } }), { status, headers: { "content-type": "application/json" } });

const openRouterAnswer = (content: string, finish = "stop") =>
  new Response(JSON.stringify({
    choices: [{ message: { content }, finish_reason: finish }],
    usage: { prompt_tokens: 800, completion_tokens: 600 },
  }), { status: 200, headers: { "content-type": "application/json" } });

/** Waits until the call's signal aborts, then fails like fetch does. */
const hang = (init: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });

function step(fetchFn: typeof fetch, patch: Partial<StepOptions<unknown>> = {}) {
  return runTextStep({
    env: ENV,
    config: CONFIG,
    tier: "paid",
    step: "outline",
    messages: outlineMessages(REQUEST),
    check: (raw) => checkOutline(raw, { locale: "uz", topic: TOPIC, slides: 3 }),
    fetch: fetchFn,
    ...patch,
  });
}

function captureLogs(t: TestContext): string[] {
  const lines: string[] = [];
  t.mock.method(console, "log", (...args: unknown[]) => void lines.push(args.map(String).join(" ")));
  return lines;
}

test("the Z.ai request is the measured one: glm-5.3-flash, streamed, low effort, JSON mode, 0.3, the step's max_tokens", async () => {
  for (const [name, maxTokens] of [["outline", 1300], ["part", 1300], ["free", 1100]] as const) {
    const { fn, sent } = mockFetch([zaiStream(JSON.stringify(OUTLINE))]);
    await step(fn, { step: name });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, ZAI_ENDPOINT);
    assert.equal(sent[0].headers.authorization, `Bearer ${ENV.ZAI_API_KEY}`);
    assert.deepEqual(Object.keys(sent[0].body).sort(), ["max_tokens", "messages", "model", "reasoning_effort", "response_format", "stream", "temperature"]);
    assert.equal(sent[0].body.model, "glm-5.3-flash");
    assert.equal(sent[0].body.stream, true);
    assert.equal(sent[0].body.reasoning_effort, "low");
    assert.deepEqual(sent[0].body.response_format, { type: "json_object" });
    assert.equal(sent[0].body.temperature, 0.3);
    assert.equal(sent[0].body.max_tokens, maxTokens);
    assert.equal(STEP_LIMITS[name].maxTokens, maxTokens);
  }
  assert.equal(CALL_TIMEOUT_MS, 45_000);
});

test("a valid streamed answer: the checked value, the model, tokens and the shadow cost (cached input at its price)", async () => {
  const { fn } = mockFetch([zaiStream(JSON.stringify(OUTLINE), { split: 3 })]);
  const result = await step(fn);
  assert.ok(result.ok);
  assert.equal(result.model, "zai/glm-5.3-flash");
  const outline = result.value as Outline;
  assert.equal(outline.slides.length, 3);
  assert.equal(outline.slides[1].imagePrompt, "pizza cut into equal slices");
  assert.equal(result.calls.length, 1);
  assert.deepEqual(result.calls[0].usage, { input: 900, cachedInput: 100, output: 700, reasoning: 3 });
  const cost = tokenCostMicro(MODEL_PRICES["zai/glm-5.3-flash"], { input: 900, cachedInput: 100, output: 700 });
  assert.equal(cost, 473);
  assert.equal(result.costMicro, 473);
  assert.deepEqual([result.tokensIn, result.tokensOut, result.reasoningTokens], [900, 700, 3]);
});

test("1302 → studio_busy at once: no retry, no fallback, even for the free deck", async () => {
  for (const tier of ["paid", "free"] as const) {
    const { fn, sent } = mockFetch([zaiError(429, "1302")]);
    const result = await step(fn, { tier, step: tier === "free" ? "free" : "outline" });
    assert.equal(sent.length, 1, tier);
    assert.ok(!result.ok && result.kind === "fault");
    assert.equal(result.fault, "busy");
    assert.equal(result.code, "studio_busy");
    assert.equal(result.costMicro, 0, "a refused request is not billed");
  }
  // The same code inside the stream.
  const inStream = new Response(`data: ${JSON.stringify({ error: { code: "1302" } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
  const { fn, sent } = mockFetch([inStream]);
  const result = await step(fn, { tier: "free", step: "free" });
  assert.equal(sent.length, 1);
  assert.ok(!result.ok && result.kind === "fault" && result.code === "studio_busy");
});

test("1113 on a paid step: a server fault without any other model", async () => {
  const { fn, sent } = mockFetch([zaiError(429, "1113")]);
  const result = await step(fn, { tier: "paid" });
  assert.equal(sent.length, 1);
  assert.ok(sent.every((call) => call.url === ZAI_ENDPOINT));
  assert.ok(!result.ok && result.kind === "fault");
  assert.equal(result.fault, "model_failed");
  assert.equal(result.code, "model_unavailable");
});

test("the free deck falls back to OpenRouter ':free' at a price of 0, never keeping the text", async () => {
  const freeDeck = { title: "Oddiy kasrlar", subtitle: "", slides: OUTLINE.slides.map((slide) => ({ title: slide.title, bullets: ["Bir", "Ikki", "Uch"], image_prompt: slide.image_prompt })) };
  for (const failure of [zaiError(429, "1113"), zaiError(500, "1234"), zaiError(401, "1001")]) {
    const { fn, sent } = mockFetch([failure, openRouterAnswer(JSON.stringify(freeDeck))]);
    const result = await runTextStep({
      env: ENV,
      config: CONFIG,
      tier: "free",
      step: "free",
      messages: outlineMessages(REQUEST),
      check: (raw) => ({ ok: true, value: raw, soft: [], fixes: {} }),
      fetch: fn,
    });
    assert.equal(sent.length, 2);
    assert.equal(sent[1].url, OPENROUTER_ENDPOINT);
    assert.equal(sent[1].headers.authorization, `Bearer ${ENV.OPENROUTER_API_KEY}`);
    assert.equal(sent[1].body.model, "google/gemma-4-31b-it:free");
    assert.deepEqual(sent[1].body.provider, { allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 }, data_collection: "deny" });
    assert.equal(sent[1].body.temperature, 0.3);
    assert.equal(sent[1].body.max_tokens, 1100);
    assert.deepEqual(sent[1].body.response_format, { type: "json_object" });
    assert.ok(result.ok);
    assert.equal(result.model, "openrouter:google/gemma-4-31b-it:free");
    assert.equal(result.costMicro, 0);
  }
});

test("no Z.ai key: the free deck goes to the fallback, a paid step fails without a call", async () => {
  const keyless = { OPENROUTER_API_KEY: ENV.OPENROUTER_API_KEY };
  assert.deepEqual(textChain(CONFIG, "free", keyless), ["openrouter:google/gemma-4-31b-it:free"]);
  assert.deepEqual(textChain(CONFIG, "paid", keyless), []);
  assert.deepEqual(textChain(CONFIG, "paid", ENV), ["zai/glm-5.3-flash"]);
  assert.deepEqual(textChain(parseStudioConfig(JSON.stringify({ STUDIO_FREE_TEXT_FALLBACK: "" })), "free", ENV), ["zai/glm-5.3-flash"]);
  const { fn, sent } = mockFetch([]);
  const result = await step(fn, { env: keyless, tier: "paid" });
  assert.equal(sent.length, 0);
  assert.ok(!result.ok && result.kind === "fault" && result.code === "model_unavailable");
});

test("finish_reason=length is never a result: asked again with ×1.5 max_tokens", async () => {
  const { fn, sent } = mockFetch([zaiStream(JSON.stringify(OUTLINE).slice(0, 120), { finish: "length" }), zaiStream(JSON.stringify(OUTLINE))]);
  const result = await step(fn);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((call) => call.body.max_tokens), [1300, 1950]);
  assert.equal(STEP_LIMITS.outline.lengthRetryMaxTokens, 1950);
  assert.ok(result.ok);
  assert.equal(result.calls[0].outcome, "length");
  assert.ok(result.calls[0].costMicro > 0, "a cut-off answer is billed");
  // Even valid JSON cut by length is not taken.
  const { fn: fn2, sent: sent2 } = mockFetch([zaiStream(JSON.stringify(OUTLINE), { finish: "length" }), zaiStream(JSON.stringify(OUTLINE), { finish: "length" })]);
  const twice = await step(fn2);
  assert.equal(sent2.length, 2);
  assert.ok(!twice.ok && twice.kind === "fault" && twice.fault === "invalid_output" && twice.code === "invalid_output");
});

test("an answer that is not the step's JSON is asked once more, then invalid_output", async () => {
  const wrongCount = JSON.stringify({ ...OUTLINE, slides: OUTLINE.slides.slice(0, 2) });
  const { fn, sent } = mockFetch([zaiStream('{"title": "Oddiy kasrlar", "slides": ['), zaiStream(JSON.stringify(OUTLINE))]);
  const repaired = await step(fn);
  assert.equal(sent.length, 2);
  assert.ok(repaired.ok);
  assert.equal(repaired.calls[0].valid, false);
  const { fn: fn2, sent: sent2 } = mockFetch([zaiStream(wrongCount), zaiStream("Mana sizning rejangiz")]);
  const failed = await step(fn2);
  assert.equal(sent2.length, STEP_LIMITS.outline.attempts);
  assert.ok(!failed.ok && failed.kind === "fault");
  assert.equal(failed.fault, "invalid_output");
  assert.equal(failed.code, "invalid_output");
});

test("a provider error is retried on a paid step (2 attempts at most); a timeout is a fault", async () => {
  const { fn, sent } = mockFetch([zaiError(500, "1234"), zaiStream(JSON.stringify(OUTLINE))]);
  assert.ok((await step(fn)).ok);
  assert.equal(sent.length, 2);
  assert.ok(sent.every((call) => call.url === ZAI_ENDPOINT));
  const { fn: fn2, sent: sent2 } = mockFetch([hang, hang]);
  const timedOut = await step(fn2, { timeoutMs: 20 });
  assert.equal(sent2.length, 2);
  assert.ok(!timedOut.ok && timedOut.kind === "fault");
  assert.equal(timedOut.fault, "timeout");
  assert.equal(timedOut.code, "model_failed");
});

test("Z.ai's own refusal (1301, finish_reason sensitive) is a refusal: no retry, no fallback, no content", async () => {
  for (const reply of [zaiError(400, "1301"), zaiStream("", { finish: "sensitive" })]) {
    const { fn, sent } = mockFetch([reply]);
    const result = await step(fn, { tier: "free", step: "free" });
    assert.equal(sent.length, 1);
    assert.ok(!result.ok && result.kind === "refused");
    assert.equal(result.code, "topic_refused");
    assert.equal(result.reason, "provider_refused");
    assert.ok(!("value" in result));
  }
});

test("the person went away: the call is cut and the step ends", async () => {
  const controller = new AbortController();
  const { fn, sent } = mockFetch([(init) => {
    queueMicrotask(() => controller.abort());
    return hang(init);
  }]);
  const result = await step(fn, { signal: controller.signal });
  assert.equal(sent.length, 1);
  assert.ok(!result.ok && result.kind === "fault" && result.fault === "timeout");
});

test("admit() is asked before every call: busy → studio_busy, stop → job_state, both without a call", async () => {
  const asked: unknown[] = [];
  const { fn, sent } = mockFetch([zaiStream("nope"), zaiStream(JSON.stringify(OUTLINE))]);
  const ok = await step(fn, { admit: async (call) => (asked.push(call), "ok") });
  assert.ok(ok.ok);
  assert.deepEqual(asked, [
    { model: "zai/glm-5.3-flash", maxTokens: 1300, attempt: 1 },
    { model: "zai/glm-5.3-flash", maxTokens: 1300, attempt: 2 },
  ]);
  assert.equal(sent.length, 2);
  const { fn: idle, sent: none } = mockFetch([]);
  const busy = await step(idle, { admit: async () => "busy" });
  assert.ok(!busy.ok && busy.kind === "fault" && busy.fault === "busy" && busy.code === "studio_busy");
  const stopped = await step(idle, { admit: async () => "stop" });
  assert.ok(!stopped.ok && stopped.kind === "halted" && stopped.code === "job_state");
  assert.equal(none.length, 0);
});

test("an answer larger than any of ours is a provider error, not read to the end", async () => {
  const huge = JSON.stringify({ ...OUTLINE, title: "x".repeat(70_000) });
  const { fn } = mockFetch([zaiStream(huge, { split: 4096 }), zaiStream(huge, { split: 4096 })]);
  const result = await step(fn);
  assert.ok(!result.ok && result.kind === "fault" && result.code === "model_failed");
  assert.deepEqual(result.calls.map((call) => call.outcome), ["provider_error", "provider_error"]);
});

/** A stream shaped like Z.ai's: one SSE event per token with its id, time and model, reasoning first. */
function tokenStream(content: string, reasoningTokens = 40, padding = 0): Response {
  const meta = { id: "20261006130000a1b2c3d4e5f6a7b8c9d0e1f2", object: "chat.completion.chunk", created: 1_791_000_000, model: "glm-5.3-flash" };
  const event = (delta: object, extra: object = {}) =>
    `data: ${JSON.stringify({ ...meta, choices: [{ index: 0, delta, ...extra }], ...(padding ? { pad: "p".repeat(padding) } : {}) })}\n\n`;
  const tokens = content.match(/[\s\S]{1,4}/g) ?? [];
  const wire = [
    ...Array.from({ length: reasoningTokens }, () => event({ role: "assistant", reasoning_content: "hm" })),
    ...tokens.map((token) => event({ role: "assistant", content: token })),
    event({}, { finish_reason: "stop" }),
    `data: ${JSON.stringify({ ...meta, choices: [], usage: { prompt_tokens: 950, completion_tokens: tokens.length + reasoningTokens } })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
  return new Response(wire, { status: 200, headers: { "content-type": "text/event-stream" } });
}

test("a real-sized stream (one event per token, far more wire than answer) is read to its answer; a runaway one is cut", async () => {
  // The T2.1 local run found it: a 6-slide deck is ≈5 KB of content but well over 64 KB on the wire.
  const answer = JSON.stringify(OUTLINE);
  const real = tokenStream(answer.repeat(1), 200, 120);
  const wire = (await real.clone().text()).length;
  assert.ok(wire > MAX_ANSWER_BYTES, `wire ${wire}`);
  const { fn } = mockFetch([real]);
  const result = await step(fn);
  assert.ok(result.ok, JSON.stringify(!result.ok && result.calls));
  assert.equal(result.calls[0].outcome, "ok");
  // Past MAX_STREAM_BYTES the stream is cut, whatever its content.
  const runaway = tokenStream(answer, 4000, 600);
  assert.ok((await runaway.clone().text()).length > MAX_STREAM_BYTES);
  const { fn: runawayFetch } = mockFetch([runaway, tokenStream(answer, 4000, 600)]);
  const cut = await step(runawayFetch);
  assert.ok(!cut.ok);
  assert.deepEqual(cut.calls.map((call) => call.outcome), ["provider_error", "provider_error"]);
});

test("logs carry {event, code} only: never the topic, the answer or a key", async (t) => {
  const lines = captureLogs(t);
  const { fn } = mockFetch([zaiStream("Oddiy kasrlar haqida matn"), zaiError(429, "1302")]);
  await step(fn);
  assert.ok(lines.length >= 2);
  for (const line of lines) {
    const entry = JSON.parse(line);
    assert.deepEqual(Object.keys(entry).sort(), ["code", "event"]);
    assert.equal(entry.event, "studio_llm");
    assert.doesNotMatch(line, /kasr|placeholder|echo/i);
  }
  assert.deepEqual(lines.map((line) => JSON.parse(line).code), ["outline.invalid_output", "outline.rate_limit"]);
});

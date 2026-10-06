// Safety for a children's audience (functions/lib/studio/safety.ts; spec
// §7.4, MEASURE-30 §7): the narrow topic list, the wide image-prompt lists,
// one Llama Guard call per job (a stub), the finished-picture verdict and the
// 10-minute refusal cache. Measured data: the 408 outline prompts of the 30
// topics and Gemma 4's answers on the 118 measured pictures with the agent's
// own review (tests/fixtures/studio/). No network, no Workers AI.
// Run: node --import tsx --test tests/studio-safety.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  GUARD_TIMEOUT_MS,
  IMAGE_RULES,
  IMAGE_VERDICT_KEYS,
  PROMPT_PLACES,
  REFUSAL_TTL_MS,
  RefusalCache,
  fluxPrompt,
  guardImagePrompts,
  guardInput,
  imagePromptDrop,
  imageSafe,
  normalizeTopic,
  parseGuard,
  parseImageVerdict,
  pickImagePrompts,
  refusalKey,
  screenTopic,
  type AiRunner,
} from "../functions/lib/studio/safety";
import { PROMPT_GUARD_MODEL } from "../functions/lib/studio/pricing";
import { TAIL_A } from "../functions/lib/studio/prompts";

const FIXTURES = path.join(import.meta.dirname, "fixtures/studio");
const MEASURE = JSON.parse(readFileSync(path.join(FIXTURES, "measure30.json"), "utf8"));
const VERDICTS = JSON.parse(readFileSync(path.join(FIXTURES, "image-verdicts.json"), "utf8"));
// Test-only signing material (letters only, so no scanner reads it as a key).
const SECRET = "studio-safety-test-signing-material-only-for-tests";

// ── Topics ──────────────────────────────────────────────────────────────────

test("school topics pass: the spec's four, the 36 measured ones, prevention and history", () => {
  for (const topic of ["Davlat ramzlari", "Konstitutsiya", "Ikkinchi jahon urushi", "Amir Temur"]) assert.deepEqual(screenTopic(topic), { ok: true }, topic);
  for (const deck of [...MEASURE.decks, ...MEASURE.free]) assert.deepEqual(screenTopic(deck.topic), { ok: true }, deck.topic);
  for (const topic of [
    "Giyohvandlikning zarari", "Giyohvandlik haqida taqdimot tayyorlash", "Наркомания и её последствия", "Terrorizmga qarshi kurash",
    "Qurol-yarog‘ tarixi", "Porox ixtirosi", "Бомбардировка Хиросимы", "Jinsiy tarbiya", "Ko‘payish tizimi", "Hujayra tuzilishi",
    "Teaching methods and how to use them", "Guncha yasash", "Nashriyot ishi", "Sekstant", "Секстант и навигация", "Yassaviy ijodi",
  ])
    assert.deepEqual(screenTopic(topic), { ok: true }, topic);
});

test("the narrow refusal list: sexual content, self-harm, drug and weapon instructions, hate — category only", () => {
  const cases: Array<[string, string]> = [
    ["Porno", "sexual"], ["Seks haqida", "sexual"], ["Эротика", "sexual"], ["nude photos", "sexual"],
    ["Suitsid usullari", "self_harm"], ["O‘z joniga qasd qilish", "self_harm"], ["Как покончить с собой", "self_harm"],
    ["Narkotik qanday tayyorlanadi", "drugs"], ["Где купить наркотики", "drugs"], ["How to make meth", "drugs"], ["Закладки", "drugs"],
    ["Bomba yasash", "weapons"], ["Как сделать бомбу", "weapons"], ["How to make a gun at home", "weapons"], ["Uyda porox tayyorlash", "weapons"],
    ["Слава Гитлеру", "hate"], ["Жиды", "hate"], ["Ruslar o‘lsin", "hate"],
  ];
  for (const [topic, category] of cases) assert.deepEqual(screenTopic(topic), { ok: false, category }, topic);
  // Case and apostrophe signs do not matter.
  assert.deepEqual(screenTopic("BOMBA YASASH"), { ok: false, category: "weapons" });
  assert.deepEqual(screenTopic("o'z joniga qasd"), { ok: false, category: "self_harm" });
});

// ── Image prompts ───────────────────────────────────────────────────────────

const PROMPTS: Array<{ deck: string; index: number; prompt: string }> = MEASURE.decks.flatMap((deck: { id: string; outline: { slides: Array<{ image_prompt: string }> } }) =>
  deck.outline.slides.map((slide, i) => ({ deck: deck.id, index: i + 1, prompt: slide.image_prompt })));

test("acceptance: the 408 measured prompts — 37 dropped by the current words, 100 with EXTRA (MEASURE-30 §7.5)", () => {
  assert.equal(PROMPTS.length, 408);
  const reasons = PROMPTS.map((item) => imagePromptDrop(item.prompt));
  const among = (list: readonly string[]) => reasons.filter((reason) => reason !== null && list.includes(reason)).length;
  assert.equal(among(["people", "text", "state"]), 37);
  assert.equal(among(["people", "text", "state", "extra"]), 100);
  // Proper names outside the places drop 13 more (London, Moscow Kremlin, Saint Petersburg, Normandy …;
  // Gur-e Amir and Kyrgyzstan stay); nothing slips out of English.
  assert.equal(among(["proper_name"]), 13);
  assert.equal(among(["translit", "empty"]), 0);
  // The two prompts whose pictures broke the rules in T0.1 are dropped.
  const by = (text: string) => PROMPTS.find((item) => item.prompt.includes(text))!;
  assert.equal(imagePromptDrop(by("artillery").prompt), "extra");
  assert.equal(imagePromptDrop(by("wooden blocks").prompt), "extra");
  // The last violation of T0.1: a tiny flag at the Neva (ru08 slide 7) — its prompt names Saint Petersburg.
  const neva = PROMPTS.find((item) => item.deck === "ru08-vtoraya-mirovaya" && item.index === 7)!;
  assert.match(neva.prompt, /Neva/);
  assert.equal(imagePromptDrop(neva.prompt), "proper_name");
});

test("the spec's examples are dropped; places and the first word may be capitalised", () => {
  assert.equal(imagePromptDrop("poet at desk with candle"), "people");
  assert.equal(imagePromptDrop("silhouette of monument at dusk"), "people");
  assert.equal(imagePromptDrop("map of the Silk Road"), "text");
  assert.equal(imagePromptDrop("green chalkboard in empty room"), "text");
  assert.equal(imagePromptDrop("old flags over a castle"), "state");
  assert.equal(imagePromptDrop("odamlar bozorda"), "translit");
  assert.equal(imagePromptDrop("Photo of Samarkand domes under the Sun"), null);
  assert.equal(imagePromptDrop("ribbed turquoise dome of Gur-e Amir mausoleum against sky"), null);
  assert.equal(imagePromptDrop("courtyard of Amir palace"), "proper_name", "Amir alone is a person");
  assert.equal(imagePromptDrop("vintage Newton cradle on oak desk"), "proper_name");
  assert.equal(imagePromptDrop("   "), "empty");
  assert.ok(PROMPT_PLACES.has("Tashkent") && !PROMPT_PLACES.has("London"));
});

test("acceptance: with tail A, the final filter and the picture check, no measured violation would reach a slide", () => {
  // Every measured picture: its slot's prompt, Gemma 4's answer, the agent's review.
  const unsafe = new Set<string>(VERDICTS.unsafe);
  let tailA = 0;
  const delivered: string[] = [];
  for (const [file, text] of Object.entries(VERDICTS.answers as Record<string, string>)) {
    const match = /^(.*)-s(\d\d)-([abr])\d\.jpg$/.exec(file);
    assert.ok(match, file);
    if (match[3] === "b") continue; // tail B was measured and rejected (MEASURE-30 §7.2)
    tailA++;
    const prompt = PROMPTS.find((item) => item.deck === match[1] && item.index === Number(match[2]))!.prompt;
    if (unsafe.has(file) && imageSafe(parseImageVerdict(text)) && imagePromptDrop(prompt) === null) delivered.push(file);
  }
  assert.equal(tailA, 57);
  assert.deepEqual(delivered, []);
});

test("the first prompts that pass, in slide order, up to the cap; Flux gets tail A", () => {
  const slides = [
    { index: 1, imagePrompt: "portrait of a king" },
    { index: 2, imagePrompt: "apple slices on a wooden table" },
    { index: 3, imagePrompt: "map of Asia" },
    { index: 4, imagePrompt: " clay pots in sunlight " },
    { index: 5, imagePrompt: "mountain lake at dawn" },
  ];
  assert.deepEqual(pickImagePrompts(slides, 2), [
    { index: 2, prompt: "apple slices on a wooden table" },
    { index: 4, prompt: "clay pots in sunlight" },
  ]);
  assert.equal(pickImagePrompts(slides, 8).length, 3);
  assert.equal(fluxPrompt("clay pots"), `clay pots${TAIL_A}`);
  assert.deepEqual(IMAGE_RULES.perDeck, { free: 2, full: 8 });
  assert.equal(IMAGE_RULES.concurrency, 4);
  assert.equal(IMAGE_RULES.deadlineAfterOutlineMs, 35_000);
  assert.equal(IMAGE_RULES.redraws, 1);
});

// ── Llama Guard ─────────────────────────────────────────────────────────────

function stubAi(answer: unknown | (() => Promise<unknown>)): AiRunner & { calls: Array<{ model: string; inputs: Record<string, unknown> }> } {
  const calls: Array<{ model: string; inputs: Record<string, unknown> }> = [];
  return {
    calls,
    async run(model, inputs) {
      calls.push({ model, inputs });
      return typeof answer === "function" ? (answer as () => Promise<unknown>)() : answer;
    },
  };
}

test("Llama Guard: one call over all prompts of a job, as measured", async () => {
  const ai = stubAi({ response: "\n\nsafe" });
  assert.deepEqual(await guardImagePrompts(ai, ["apple on a table", "river valley"]), { ok: true });
  assert.equal(ai.calls.length, 1);
  assert.equal(ai.calls[0].model, PROMPT_GUARD_MODEL);
  assert.equal(PROMPT_GUARD_MODEL, "@cf/meta/llama-guard-3-8b");
  assert.deepEqual(ai.calls[0].inputs, guardInput(["apple on a table", "river valley"]));
  assert.deepEqual(guardInput(["a", "b"]), {
    messages: [{ role: "user", content: "Image prompts for a school presentation:\n1. a\n2. b" }],
    max_tokens: 20,
  });
  // No prompt: no call.
  const idle = stubAi({ response: "safe" });
  assert.deepEqual(await guardImagePrompts(idle, []), { ok: true });
  assert.equal(idle.calls.length, 0);
});

test("Llama Guard: any category drops the pictures; the ledger gets only the category; failures fail closed", async () => {
  const unsafe = await guardImagePrompts(stubAi({ response: "\n\nunsafe\nS12,S1" }), ["a quiet beach"]);
  assert.deepEqual(unsafe, { ok: false, reason: "safety_S12" });
  assert.ok(!JSON.stringify(unsafe).includes("beach"));
  assert.deepEqual(await guardImagePrompts(stubAi({ response: { safe: false, categories: ["S10"] } }), ["x"]), { ok: false, reason: "safety_S10" });
  assert.deepEqual(await guardImagePrompts(stubAi({ response: "unsafe" }), ["x"]), { ok: false, reason: "safety_unknown" });
  assert.deepEqual(await guardImagePrompts(stubAi({ response: "maybe" }), ["x"]), { ok: false, reason: "guard_unavailable" });
  assert.deepEqual(await guardImagePrompts(stubAi(() => Promise.reject(new Error("3040"))), ["x"]), { ok: false, reason: "guard_unavailable" });
  assert.deepEqual(await guardImagePrompts(null, ["x"]), { ok: false, reason: "guard_unavailable" });
  const slow = stubAi(() => new Promise((resolve) => setTimeout(() => resolve({ response: "safe" }), 200)));
  assert.deepEqual(await guardImagePrompts(slow, ["x"], 20), { ok: false, reason: "guard_unavailable" });
  assert.equal(GUARD_TIMEOUT_MS, 10_000);
});

test("parseGuard reads both answer shapes and only the 14 categories", () => {
  assert.deepEqual(parseGuard({ response: "\n\nsafe" }), { safe: true });
  assert.deepEqual(parseGuard({ response: "unsafe\nS1, S14, S15, S2" }), { safe: false, categories: ["S1", "S14", "S2"] });
  assert.deepEqual(parseGuard({ response: { safe: true, categories: [] } }), { safe: true });
  assert.equal(parseGuard({ response: 7 }), null);
  assert.equal(parseGuard(null), null);
});

// ── The finished picture ────────────────────────────────────────────────────

test("acceptance: Gemma 4's answers on the 118 measured pictures parse strictly; 42 of 48 violations caught, 1 false alarm in 70", () => {
  const unsafe = new Set<string>(VERDICTS.unsafe);
  const answers = Object.entries(VERDICTS.answers as Record<string, string>);
  assert.equal(answers.length, 118);
  let caught = 0;
  let falseAlarms = 0;
  for (const [file, text] of answers) {
    const verdict = parseImageVerdict(text);
    assert.ok(verdict, `${file} parses`);
    const flagged = !imageSafe(verdict);
    if (flagged && unsafe.has(file)) caught++;
    if (flagged && !unsafe.has(file)) falseAlarms++;
  }
  assert.equal(unsafe.size, 48);
  assert.equal(caught, 42);
  assert.equal(falseAlarms, 1);
});

test("a picture goes out only with a readable verdict that is false on every key", () => {
  const all = (value: boolean) => JSON.stringify(Object.fromEntries(IMAGE_VERDICT_KEYS.map((key) => [key, value])));
  assert.equal(imageSafe(parseImageVerdict(all(false))), true);
  assert.equal(imageSafe(parseImageVerdict(`\`\`\`json\n${all(false)}\n\`\`\``)), true);
  for (const key of IMAGE_VERDICT_KEYS) {
    const one = JSON.parse(all(false));
    one[key] = true;
    assert.equal(imageSafe(parseImageVerdict(JSON.stringify(one))), false, key);
    const missing = JSON.parse(all(false));
    delete missing[key];
    assert.equal(parseImageVerdict(JSON.stringify(missing)), null, `${key} missing`);
  }
  assert.equal(parseImageVerdict(all(false).replace("false", '"no"')), null);
  assert.equal(parseImageVerdict("I cannot see the image."), null);
  assert.equal(parseImageVerdict(undefined), null);
  assert.equal(imageSafe(null), false);
});

// ── The refusal cache ───────────────────────────────────────────────────────

test("a refused topic is remembered per subject for 10 minutes, under an HMAC key that does not hold the topic", async () => {
  const cache = new RefusalCache();
  const key = await refusalKey(SECRET, "b:0123456789abcdef0123456789abcdef", "  Bomba   YASASH ");
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.equal(key, await refusalKey(SECRET, "b:0123456789abcdef0123456789abcdef", "bomba yasash"));
  assert.notEqual(key, await refusalKey(SECRET, "b:ffffffffffffffffffffffffffffffff", "bomba yasash"), "per subject");
  const now = 1_000_000;
  cache.set(key, "weapons", now);
  assert.equal(cache.get(key, now + REFUSAL_TTL_MS - 1), "weapons");
  assert.equal(cache.get(key, now + REFUSAL_TTL_MS), null);
  assert.equal(REFUSAL_TTL_MS, 600_000);
  assert.equal(normalizeTopic("  Amir   TEMUR "), "amir temur");
});

test("the cache is bounded: the oldest entry goes first", () => {
  const cache = new RefusalCache(60_000, 3);
  for (const key of ["a", "b", "c", "d"]) cache.set(key, "hate", 0);
  assert.equal(cache.size, 3);
  assert.equal(cache.get("a", 1), null);
  assert.equal(cache.get("d", 1), "hate");
});

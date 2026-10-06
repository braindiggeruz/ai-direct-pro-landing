// The shape of model answers (functions/lib/studio/deck-schema.ts; spec §7.3,
// MEASURE-30 §4, §9): the 30 measured outlines, 106 parts and 6 free decks
// pass; the cut-off JSON of uz02 does not; every refusal rule fires.
// Fixture: tests/fixtures/studio/measure30.json (parsed model outputs only).
// Run: node --import tsx --test tests/studio-deck-schema.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DECK_LIMITS,
  checkFreeDeck,
  checkOutline,
  checkPart,
  parseModelJson,
  withLayouts,
} from "../functions/lib/studio/deck-schema";

const FIXTURE = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/studio/measure30.json"), "utf8"));
const UZ = { locale: "uz", topic: "Oddiy kasrlar" } as const;
const RU = { locale: "ru", topic: "Проценты" } as const;
const cp = (code: number) => String.fromCodePoint(code);

const slide = (index: number, extra: Record<string, unknown> = {}) => ({
  index,
  title: `Kasr ${index}`,
  bullets: ["Surat yuqorida", "Maxraj pastda", "Kasr chizig‘i", "Misol: 3/4"],
  notes: "Kasr butunning qismi. Surat yuqorida turadi. Maxraj pastda turadi.",
  ...extra,
});
const part = (indexes: number[], extra: Record<string, unknown> = {}) => ({ slides: indexes.map((index) => slide(index, extra)) });
const problems = (result: { ok: boolean; problems?: readonly string[] }) => (result.ok ? [] : [...(result.problems ?? [])]);

test("acceptance: the 30 measured outlines and 106 parts pass, with 9 soft talks of 2 or 5 sentences", () => {
  let parts = 0;
  const soft: string[] = [];
  for (const deck of FIXTURE.decks) {
    const context = { locale: deck.lang, topic: deck.topic };
    const outline = checkOutline(deck.outline, { ...context, slides: deck.slides });
    assert.ok(outline.ok, `${deck.id}: ${problems(outline)}`);
    assert.equal(outline.value.slides.length, deck.slides);
    for (const item of deck.parts) {
      const result = checkPart({ slides: item.slides }, { ...context, indexes: item.indexes });
      assert.ok(result.ok, `${deck.id} ${item.indexes}: ${problems(result)}`);
      assert.deepEqual(result.value.slides.map((entry) => entry.index), item.indexes);
      soft.push(...result.soft);
      parts++;
    }
  }
  assert.equal(FIXTURE.decks.length, 30);
  assert.equal(parts, 106);
  assert.equal(soft.length, 9);
  assert.ok(soft.every((note) => note.startsWith("sentences:")));
});

test("acceptance: the 6 measured free decks pass; pilot, T=0.3 and proof-read parts pass", () => {
  for (const deck of FIXTURE.free) {
    const result = checkFreeDeck(deck.deck, { locale: deck.lang, topic: deck.topic, slides: deck.slides });
    assert.ok(result.ok, `${deck.id}: ${problems(result)}`);
    assert.ok(result.value.slides.every((entry) => entry.imagePrompt.length > 0));
  }
  for (const variant of FIXTURE.variants)
    for (const item of variant.parts) {
      const result = checkPart({ slides: item.slides }, { locale: variant.lang, topic: variant.topic, indexes: item.indexes });
      assert.ok(result.ok, `${variant.kind} ${variant.id}: ${problems(result)}`);
    }
});

test("acceptance: the cut-off JSON of uz02 (the one retry of T0.1) is no answer; a fenced one is", () => {
  assert.equal(FIXTURE.invalid.length, 1);
  assert.equal(parseModelJson(FIXTURE.invalid[0].content), undefined);
  assert.deepEqual(parseModelJson('```json\n{"slides": []}\n```'), { slides: [] });
  assert.equal(parseModelJson("Mana reja: {}"), undefined);
  assert.equal(parseModelJson("[1, 2]"), undefined);
  assert.equal(parseModelJson(""), undefined);
});

test("structure: exact slide count, required fields, types", () => {
  const deck = FIXTURE.decks.find((item: { id: string }) => item.id === "uz02-kasrlar");
  const outline = { ...deck.outline, slides: deck.outline.slides.slice(0, -1) };
  assert.ok(problems(checkOutline(outline, { ...UZ, slides: deck.slides })).includes("count:slides"));
  assert.ok(problems(checkOutline({ ...deck.outline, title: "" }, { ...UZ, slides: deck.slides })).includes("empty:title"));
  assert.ok(problems(checkOutline({ ...deck.outline, title: 7 }, { ...UZ, slides: deck.slides })).includes("type:title"));
  assert.deepEqual(problems(checkOutline("{}", { ...UZ, slides: 4 })), ["not_object"]);
  const noPrompt = { ...deck.outline, slides: deck.outline.slides.map((entry: object, i: number) => (i === 2 ? { ...entry, image_prompt: "" } : entry)) };
  assert.ok(problems(checkOutline(noPrompt, { ...UZ, slides: deck.slides })).includes("empty:slide.3.image_prompt"));
  assert.ok(problems(checkPart(part([1, 2, 3]), { ...UZ, indexes: [1, 2, 3, 4] })).includes("count:slides"));
  assert.ok(problems(checkPart(part([1], { notes: "" }), { ...UZ, indexes: [1] })).includes("empty:slide.1.notes"));
  // A subtitle may be missing.
  const noSubtitle = checkOutline({ ...deck.outline, subtitle: null }, { ...UZ, slides: deck.slides });
  assert.ok(noSubtitle.ok);
  assert.equal(noSubtitle.value.subtitle, "");
});

test("lengths: title ≤ 70, bullet ≤ 110, talk ≤ 600; 2..5 bullets, 2 and 5 only a soft note", () => {
  assert.ok(problems(checkPart(part([1], { title: "x".repeat(DECK_LIMITS.slideTitle + 1) }), { ...UZ, indexes: [1] })).includes("long:slide.1.title"));
  assert.ok(problems(checkPart(part([1], { bullets: ["a", "b".repeat(111)] }), { ...UZ, indexes: [1] })).includes("long:slide.1.bullets.2"));
  assert.ok(problems(checkPart(part([1], { notes: "Gap. ".repeat(130) }), { ...UZ, indexes: [1] })).includes("long:slide.1.notes"));
  assert.ok(problems(checkPart(part([1], { bullets: ["yolg‘iz"] }), { ...UZ, indexes: [1] })).includes("count:slide.1.bullets"));
  assert.ok(problems(checkPart(part([1], { bullets: ["1", "2", "3", "4", "5", "6"] }), { ...UZ, indexes: [1] })).includes("count:slide.1.bullets"));
  const five = checkPart(part([1], { bullets: ["1", "2", "3", "4", "5"] }), { ...UZ, indexes: [1] });
  assert.ok(five.ok);
  assert.deepEqual(five.soft, ["bullets:slide.1.bullets"]);
});

test("language: Uzbek with > 5% Cyrillic, any link, the model naming itself — refused", () => {
  const cyrillic = "Кириллица ".repeat(3);
  assert.ok(problems(checkPart(part([1], { notes: `${cyrillic}. Bu gap. Yana gap.` }), { ...UZ, indexes: [1] })).includes("uz_cyrillic"));
  assert.ok(checkPart(part([1], { title: "Процент", notes: "Это часть. Это целое. Это дробь." }), { ...RU, indexes: [1] }).ok, "Russian is Cyrillic");
  assert.ok(problems(checkPart(part([1], { notes: "Batafsil: https://example.com. Ikki. Uch." }), { ...UZ, indexes: [1] })).includes("link"));
  assert.ok(problems(checkPart(part([1], { title: "www.kasr.uz" }), { ...UZ, indexes: [1] })).includes("link"));
  assert.ok(problems(checkPart(part([1], { notes: "Men ChatGPT, sizga yordam beraman. Ikki. Uch." }), { ...UZ, indexes: [1] })).includes("brand"));
  assert.ok(problems(checkPart(part([1], { title: "OpenAI modeli" }), { ...UZ, indexes: [1] })).includes("brand"));
  assert.ok(problems(checkPart(part([1], { title: "Подготовлено ChatGPT" }), { ...RU, indexes: [1] })).includes("brand"));
  // A deck about ChatGPT may name it, never as its author; GPTBot.uz is not «GPT».
  const about = { locale: "uz", topic: "ChatGPT nima va u qanday ishlaydi" } as const;
  assert.ok(checkPart(part([1], { title: "ChatGPT tarixi" }), { ...about, indexes: [1] }).ok);
  assert.ok(checkPart(part([1], { title: "ChatGPT yordamida insho yozish" }), { ...about, indexes: [1] }).ok);
  assert.ok(problems(checkPart(part([1], { notes: "Salom! Men ChatGPT. Ikki. Uch." }), { ...about, indexes: [1] })).includes("brand"));
  const aboutRu = { locale: "ru", topic: "Как работает ChatGPT" } as const;
  assert.ok(problems(checkPart(part([1], { title: "Как работает", notes: "Эта презентация подготовлена с помощью ChatGPT. Два. Три." }), { ...aboutRu, indexes: [1] })).includes("brand"));
  assert.ok(problems(checkPart(part([1], { notes: "Bu taqdimot ChatGPT tomonidan tayyorlandi. Ikki. Uch." }), { ...about, indexes: [1] })).includes("brand"));
  assert.ok(checkPart(part([1], { title: "GPTBot.uz bilan" }), { ...UZ, indexes: [1] }).ok);
});

test("Uzbek text is normalized (and counted); English image prompts are not", () => {
  const raw = {
    title: "O'zbekiston tabiati",
    subtitle: "6-sinf",
    slides: [{ title: "Avlodalari", point: "ravnaqga yo'l", image_prompt: "farmer's cotton field at dawn" }],
  };
  const result = checkOutline(raw, { ...UZ, slides: 1 });
  assert.ok(result.ok);
  assert.equal(result.value.title, "O‘zbekiston tabiati");
  assert.equal(result.value.slides[0].title, "Avlodlari");
  assert.equal(result.value.slides[0].point, "ravnaqqa yo‘l");
  assert.equal(result.value.slides[0].imagePrompt, "farmer's cotton field at dawn");
  assert.deepEqual(result.fixes, { "ok-gk-apostrophe": 2, "dative-after-q-k": 1, "word:Avlodalari": 1 });
  // Russian is never touched by the Uzbek rules.
  const ru = checkOutline({ ...raw, title: "Узбекистан" }, { ...RU, slides: 1 });
  assert.ok(ru.ok);
  assert.equal(ru.value.slides[0].point, "ravnaqga yo'l");
  // An image prompt in Cyrillic is not English.
  const cyr = { ...raw, slides: [{ ...raw.slides[0], image_prompt: `photo of ${cp(0x434)}${cp(0x43e)}${cp(0x43c)}` }] };
  assert.ok(problems(checkOutline(cyr, { ...UZ, slides: 1 })).includes("cyrillic:slide.1.image_prompt"));
});

test("bullets lose a list glyph and a final full stop; text loses control characters and double spaces", () => {
  const result = checkPart(part([1], { bullets: ["• Surat  yuqorida.", "- Maxraj pastda", "Davom etadi...", `Kasr${cp(0x200b)}chizig‘i`] }), { ...UZ, indexes: [1] });
  assert.ok(result.ok);
  assert.deepEqual(result.value.slides[0].bullets, ["Surat yuqorida", "Maxraj pastda", "Davom etadi...", "Kasr chizig‘i"]);
});

test("a part whose plan indexes the model renumbered keeps the asked ones (soft note)", () => {
  const result = checkPart(part([1, 2, 3]), { ...UZ, indexes: [5, 6, 7] });
  assert.ok(result.ok);
  assert.deepEqual(result.value.slides.map((entry) => entry.index), [5, 6, 7]);
  assert.ok(result.soft.includes("indexes"));
});

test("the free deck has no talk: an answer that writes one is refused", () => {
  const free = FIXTURE.free[0];
  const context = { locale: free.lang, topic: free.topic, slides: free.slides };
  const withNotes = { ...free.deck, slides: free.deck.slides.map((entry: object, i: number) => (i === 0 ? { ...entry, notes: "Gap." } : entry)) };
  assert.ok(problems(checkFreeDeck(withNotes, context)).includes("notes:slide.1"));
  const emptyNotes = { ...free.deck, slides: free.deck.slides.map((entry: object) => ({ ...entry, notes: "" })) };
  assert.ok(checkFreeDeck(emptyNotes, context).ok);
});

test("layouts: a pictured slide with ≤ 4 bullets is image-right, every other title-bullets; the talk stays", () => {
  const slides = [
    { index: 1, title: "A", bullets: ["1", "2", "3", "4"], notes: "Gap." },
    { index: 2, title: "B", bullets: ["1", "2", "3", "4", "5"] },
    { index: 3, title: "C", bullets: ["1", "2"] },
  ];
  const laid = withLayouts(slides, new Set([1, 2]));
  assert.deepEqual(laid.map((entry) => entry.layout), ["image-right", "title-bullets", "title-bullets"]);
  assert.equal(laid[0].notes, "Gap.");
  assert.ok(!("notes" in laid[1]));
});

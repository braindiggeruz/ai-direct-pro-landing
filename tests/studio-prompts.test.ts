// The studio's prompts (functions/lib/studio/prompts.ts) are the measured
// prompt v3 of T0.1, verbatim (spec §7.2, MEASURE-30 appendix A). The hashes
// below were computed by studio/measure/measure30.py build_system(),
// user_line() and compact_plan() on 06.10.2026; an edit to a prompt is a new
// measurement, not a fix, and fails here.
// Run: node --import tsx --test tests/studio-prompts.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CHECK_PROMPT_V2,
  FREE_V3,
  GLOSSARY_UZ,
  OUTLINE_V3,
  PART_V3,
  PROOF_SYSTEM,
  PROOF_TEMPERATURE,
  STUDIO_TEMPERATURE,
  TAIL_A,
  buildSystem,
  cleanTopic,
  compactPlan,
  detectSubject,
  freeMessages,
  levelLine,
  outlineMessages,
  partIndexes,
  partMessages,
  proofMessages,
  pythonJson,
  userLine,
  type GlossarySubject,
} from "../functions/lib/studio/prompts";

const FIXTURE = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/studio/measure30.json"), "utf8"));
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** measure30.py, 06.10.2026: sha256 of build_system(template, lang, subject, n). */
const MEASURED: Record<string, string> = {
  "OUTLINE_V3|uz|math|15": "238a5508c71a60b0d72e9bd1bc6b3502cc01f7316e009525fd19c77557f3e98b",
  "OUTLINE_V3|uz|history|15": "1071463fe984a55b6c9b92592cf1f2361d9bac896699ed100d46da7995af0c38",
  "OUTLINE_V3|uz|literature|15": "199ba78e587e7370dc0f18d7fd15ef0249ea0a2ab62cc5b71991ca29097a09c7",
  "OUTLINE_V3|uz|none|15": "2c50659a0fc349e9c8df42c5025e6a665d9e56c5cc731d4451a2aca33c10b450",
  "OUTLINE_V3|ru|math|15": "53a654cff0dfd438e97a2deb8e4b824843916478d9311057b4d5eaa9bc0e96db",
  "OUTLINE_V3|ru|none|15": "53a654cff0dfd438e97a2deb8e4b824843916478d9311057b4d5eaa9bc0e96db",
  "PART_V3|uz|math|": "41e0e53891af5426a4456d7b42d011b0d0a85c716f367002602402268bf48945",
  "PART_V3|uz|history|": "da94e319256a27b5ca541a83190a03fa320a159c3ac3b3ee46ef6db89680232e",
  "PART_V3|uz|literature|": "fd1464145a605bf4cd11c1bd0d5c9b870926d57d526dc7f32d7b50ceb3d156c8",
  "PART_V3|uz|none|": "8e746db5ed9caafe96028e6066cc0922e4e6baf46c18feb24169e33e0522b6c7",
  "PART_V3|ru|math|": "8564da5c00d3ee1ce084d2de6b23d372df55e56f02b22722b9bd515d7c783027",
  "FREE_V3|uz|math|6": "8ef9c31d1cdb3d04cdbb234eba39ed452ee278fad6f6c4dece7a1bcdc76dd63c",
  "FREE_V3|uz|history|6": "00a512215410e1d9aa907b42d0e08b1a89091284fd4b717f0e3b178d999a2f90",
  "FREE_V3|uz|literature|6": "966721b2cda1aee5322f5dacf7894ba26afd5a89e27e33aac307d2dd7d4a2b21",
  "FREE_V3|uz|none|6": "2eb70c15da2913f367a565b3f0f3e096aa731e1424c3bad6a41bf7c4cf4a46d2",
  "FREE_V3|ru|math|6": "b87fafe365999638d0217146d83ab12987e6c1e0d45c6942f4cff5e9004a9d1e",
};
const TEMPLATES: Record<string, string> = { OUTLINE_V3, PART_V3, FREE_V3 };

test("every built system prompt is the measured one, byte for byte", () => {
  for (const [key, hash] of Object.entries(MEASURED)) {
    const [template, locale, subject, n] = key.split("|");
    const built = buildSystem(TEMPLATES[template], locale as "uz" | "ru", subject === "none" ? null : (subject as GlossarySubject), n ? Number(n) : undefined);
    assert.equal(sha(built), hash, key);
    assert.doesNotMatch(built, /\{(n|image_rule|facts_rule|numbers_rule|lang_rule|glossary)\}/, key);
  }
});

test("the part prompt carries the measured user line and compact plan (uz02, slides 5–8)", () => {
  const deck = FIXTURE.decks.find((item: { id: string }) => item.id === "uz02-kasrlar");
  const line = userLine({ topic: deck.topic, level: deck.level, slides: deck.slides, locale: "uz" });
  assert.equal(sha(line), "e1013936f4c81abfc56d5001126adc0e720c1a8ad3d734b1fed6ee355c78dd55");
  const plan = compactPlan(deck.outline);
  assert.equal(sha(plan), "e63318846f068fb44b34164770f94b4f943dfdbafc77957c9654dd13dc3ff4de");
  const user = `${line}\nReja (JSON): ${plan}\nWrite ONLY slides 5, 6, 7, 8 (plan indexes), with the same index values.`;
  assert.equal(sha(user), "7b2cb73743d3414bd90d081027fdc6af74f4e16f2e1f850cb10167b9ba0527ce");
  // partMessages builds the same shape from the form's fields.
  const messages = partMessages({ topic: deck.topic, locale: "uz", audience: "maktab", slides: 15 }, deck.outline, [5, 6, 7, 8]);
  assert.equal(messages[0].content, buildSystem(PART_V3, "uz", "math"));
  assert.equal(
    messages[1].content,
    `Mavzu: Oddiy kasrlar. Maktab o‘quvchilari. Slaydlar soni: 15.\nReja (JSON): ${plan}\nWrite ONLY slides 5, 6, 7, 8 (plan indexes), with the same index values.`,
  );
});

test("outline and free messages: system prompt with n and the glossary of the topic's subject, then the user line", () => {
  const outline = outlineMessages({ topic: "Amir Temur", locale: "uz", audience: "maktab", slides: 12 });
  assert.deepEqual(outline.map((message) => message.role), ["system", "user"]);
  assert.equal(outline[0].content, buildSystem(OUTLINE_V3, "uz", "history", 12));
  assert.match(outline[0].content, /EXACTLY 12 items/);
  assert.ok(outline[0].content.endsWith(`\n9. ${GLOSSARY_UZ.history}`));
  assert.equal(outline[1].content, "Mavzu: Amir Temur. Maktab o‘quvchilari. Slaydlar soni: 12.");
  const free = freeMessages({ topic: "Проценты", locale: "ru", audience: "talaba", slides: 6 });
  assert.equal(free[0].content, buildSystem(FREE_V3, "ru", null, 6));
  assert.ok(!free[0].content.includes("Uzbek school"), "Russian prompts carry no Uzbek glossary");
  assert.equal(free[1].content, "Тема: Проценты. Студенты. Количество слайдов: 6.");
  assert.equal(levelLine("umumiy", "uz"), "Umumiy auditoriya");
  assert.equal(levelLine("umumiy", "ru"), "Широкая аудитория");
});

test("the subject of each measured Uzbek topic is the one T0.1 used; topics without a glossary get none", () => {
  const topics = [...FIXTURE.decks, ...FIXTURE.free, ...FIXTURE.variants.filter((item: { kind: string }) => item.kind === "pilot")]
    .filter((item: { lang: string }) => item.lang === "uz");
  assert.ok(topics.length >= 25);
  for (const item of topics) {
    const expected = item.subject in GLOSSARY_UZ ? item.subject : null;
    assert.equal(detectSubject(item.topic), expected, item.topic);
  }
  assert.equal(detectSubject("Davlat ramzlari"), null);
  assert.equal(detectSubject("Konstitutsiya"), null);
  assert.equal(detectSubject("Ikkinchi jahon urushi"), "history");
  assert.equal(detectSubject("Om qonuni"), "physics", "qonun is not qon");
  assert.equal(detectSubject("Kuchli davlat"), null);
  assert.equal(detectSubject("To'g'ri burchakli uchburchak"), "geometry", "ASCII apostrophes compare as ‘");
});

test("the measured constants: temperature 0.3, style tail A, picture check v2", () => {
  assert.equal(STUDIO_TEMPERATURE, 0.3);
  assert.equal(TAIL_A, ", realistic photo, quiet empty scene, soft daylight, clean composition");
  assert.ok(!/\bno\b/i.test(TAIL_A), "the tail is positive only: Flux has no negative prompt");
  assert.equal(sha(CHECK_PROMPT_V2), sha(
    'Look at the image. Answer ONLY with one JSON object, no markdown: {"person": bool, "face": bool, "text": bool, "flag": bool, '
      + '"weapon": bool, "nudity": bool, "blood": bool}. person = any human or human-like figure, statue, mannequin, silhouette, hand '
      + "or other body part, even tiny or far away; face = any face, including painted, drawn or sculpted faces; text = any letters, "
      + "digits, signs, writing or writing-like marks, even small or blurred; flag = any flag, coat of arms, star emblem or state "
      + "emblem; weapon = any gun, cannon, artillery, tank, sword, military helmet or other military equipment.",
  ));
  for (const template of [OUTLINE_V3, PART_V3, FREE_V3]) assert.match(template, /Never mention ChatGPT, GPT or OpenAI/);
});

test("parts of ≤ 4 slides: 15 → 4 parts, 12 → 3, 6 → 2", () => {
  assert.deepEqual(partIndexes(15), [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15]]);
  assert.equal(partIndexes(12).length, 3);
  assert.deepEqual(partIndexes(6), [[1, 2, 3, 4], [5, 6]]);
});

test("cleanTopic: NFC, no control characters, single spaces, no final full stop, ≤ 200 characters", () => {
  assert.equal(cleanTopic(`  Amir${String.fromCodePoint(0)} Temur.\n `), "Amir Temur");
  assert.equal(cleanTopic(`Fotosintez${String.fromCodePoint(0x2028)}jarayoni`), "Fotosintez jarayoni");
  assert.equal(cleanTopic(`o${String.fromCodePoint(0x308)}zbek`), "özbek", "NFC composes");
  assert.equal(cleanTopic("x".repeat(500)).length, 200);
});

test("pythonJson matches json.dumps(ensure_ascii=False) separators", () => {
  assert.equal(pythonJson({ a: 1, b: ["x", "o‘"], c: { d: null } }), '{"a": 1, "b": ["x", "o‘"], "c": {"d": null}}');
});

test("the proofreading pass of paid Uzbek decks: PROOF_SYSTEM is measure30.py's, byte for byte, at 0.2 (MEASURE-30 §6)", () => {
  // sha256 of measure30.py PROOF_SYSTEM (lines 781–785, its line breaks included), 07.10.2026.
  assert.equal(sha(PROOF_SYSTEM), "dea8d7f27ecd4d9f70f3b571444485eedd8437177bb597569f61bf46a9d237b5");
  assert.equal(PROOF_SYSTEM.split("\n").length, 5);
  assert.equal(PROOF_TEMPERATURE, 0.2);
  // mode_proof sent json.dumps({"slides": part["slides"]}, ensure_ascii=False) as the user message.
  const uz = FIXTURE.decks.find((deck: { id: string }) => deck.id === "uz02-kasrlar");
  const part = uz.parts[1];
  const messages = proofMessages({ slides: part.slides });
  assert.deepEqual(messages, [
    { role: "system", content: PROOF_SYSTEM },
    { role: "user", content: pythonJson({ slides: part.slides.map((slide: { index: number; title: string; bullets: string[]; notes: string }) => ({ index: slide.index, title: slide.title, bullets: slide.bullets, notes: slide.notes })) }) },
  ]);
  assert.ok(!messages[1].content.includes("\\u"), "ensure_ascii=False: letters as they are");
  assert.match(messages[1].content, /‘/);
});

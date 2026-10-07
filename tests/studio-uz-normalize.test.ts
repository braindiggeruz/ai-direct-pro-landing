// Deterministic Uzbek fixes (functions/lib/studio/uz-normalize.ts; spec §7.3,
// MEASURE-30 §9). The acceptance check of T1.3: every Uzbek text of the 30
// measured topics (and the pilot, the T=0.3 parts, the proof-read parts and
// the free decks) goes through the normalizer and only the reviewed fixes
// happen; the word list never fires on the site's own content/ and src/.
// Fixture: tests/fixtures/studio/measure30.json (parsed model outputs only).
// Run: node --import tsx --test tests/studio-uz-normalize.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  DATIVE_EXCEPTIONS,
  UZ_CHAR_RULES,
  UZ_CONTEXT_PAIRS,
  UZ_WORD_FIXES,
  UZ_WORD_RULES,
  addFixes,
  normalizeUz,
  normalizeUzText,
} from "../functions/lib/studio/uz-normalize";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/studio/measure30.json"), "utf8"));
const cp = (code: number) => String.fromCodePoint(code);

/** Every Uzbek text value of the measurement (never image prompts). */
function measuredUzbekTexts(): string[] {
  const texts: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string") texts.push(value);
  };
  for (const item of [...FIXTURE.decks, ...FIXTURE.variants, ...FIXTURE.free]) {
    if (item.lang !== "uz") continue;
    if (item.outline) {
      push(item.outline.title);
      push(item.outline.subtitle);
      for (const slide of item.outline.slides) {
        push(slide.title);
        push(slide.point);
      }
    }
    for (const part of item.parts ?? [])
      for (const slide of part.slides) {
        push(slide.title);
        (slide.bullets ?? []).forEach(push);
        push(slide.notes);
      }
    if (item.deck) {
      push(item.deck.title);
      push(item.deck.subtitle);
      for (const slide of item.deck.slides) {
        push(slide.title);
        (slide.bullets ?? []).forEach(push);
      }
    }
  }
  return texts;
}

/**
 * What the normalizer does to the measured texts, rule by rule. Each fix was
 * checked by hand against the review (studio/measure/review.json): the 35
 * apostrophes, ravnaqga, the Turkish ı, the soft hyphen and the Cyrillic а
 * of MEASURE-30 §9, the 40 dictionary words, and 9 of the 13 words of the
 * 07.10 language review (studio/launch-2026-10-07/LANG-uz-decks.md; the other
 * 4 come from the rehearsal decks and are tested below).
 */
const MEASURED_FIXES: Record<string, number> = {
  "ok-gk-apostrophe": 23,
  "glottal-apostrophe": 12,
  "turkish-dotless-i": 1,
  "soft-hyphen": 1,
  "cyrillic-homoglyph-in-latin-word": 1,
  "dative-after-q-k": 1,
  "word:Avlodalari": 9,
  "word:Madarislar": 1,
  "word:Mavarounnahr": 2,
  "word:Temurlar sulolasi": 1,
  "word:Temur tuzoqlari": 5,
  "word:Quvnatli saltanat": 1,
  "word:gumbasti": 2,
  "word:minoyalar": 1,
  "word:meridiian": 1,
  "word:zonalarari": 1,
  "word:zonaslar": 1,
  "word:Muhofoza": 1,
  "word:Jadvlda": 1,
  "word:jarayandan": 1,
  "word:gaslar": 1,
  "word:Klapapan": 8,
  "word:Pulsl": 3,
  "word:qontalanish": 4,
  "word:inertsionlik": 12,
  "word:domennomi": 3,
  "word:obrozi": 2,
  "word:ma’suliyat": 1,
  "word:totlik": 1,
  "word:yeish": 2,
  "word:Bulohlar": 2,
  "word:Bulok‘": 2,
  "word:o‘zgarinsa": 1,
  "word:ko‘paytsak": 1,
  "word:Issiganda": 1,
  "word:ta’siz": 1,
  "word:tekkananda": 1,
  "word:tekishanda": 1,
  "word:to‘rttan": 1,
  "word:hayot beringadi": 1,
  "word:Chiroyi havoda": 1,
  "word:bir-ketin": 2,
  "word:ta’lib olgan": 1,
  "word:Jim jism": 4,
  "word:Tasodifiy kuchlar muvozanati": 4,
  "word:Kumushbeka": 10,
  "word:namoyonda": 2,
  "word:Tatir suv": 2,
  "word:oqizloq": 1,
  "word:ustadbekar": 1,
  "word:kattasha borsa": 1,
  "word:erta turarish": 1,
  "word:yuza maydalaridan": 2,
  "word:katta likda": 1,
  "word:o‘zgarmaydan": 1,
};

test("acceptance: on the 30 measured topics only the reviewed fixes happen (no false corrections)", () => {
  const texts = measuredUzbekTexts();
  assert.ok(texts.length > 3000, `${texts.length} Uzbek texts`);
  const total: Record<string, number> = {};
  const apostrophesOnly = (a: string, b: string) => a.replace(/[‘’'`ʻʼ]/g, "") === b.replace(/[‘’'`ʻʼ]/g, "");
  for (const text of texts) {
    const result = normalizeUz(text);
    addFixes(total, result.fixes);
    // A text the rules leave alone comes back unchanged, byte for byte (NFC included).
    if (!Object.keys(result.fixes).length) assert.equal(result.text, text);
    // Apostrophe rules change nothing but the sign.
    const onlySigns = Object.keys(result.fixes).every((id) => id.endsWith("-apostrophe"));
    if (onlySigns) assert.ok(apostrophesOnly(text, result.text));
  }
  assert.deepEqual(total, MEASURED_FIXES);
  // MEASURE-30 §9: 35 apostrophes, 1 ravnaqga, 1 ı, 1 soft hyphen, 1 Cyrillic letter, all 40 words;
  // plus the 9 words of the 07.10 review that come from these texts.
  assert.equal(total["ok-gk-apostrophe"] + total["glottal-apostrophe"], 35);
  assert.equal(Object.keys(total).filter((id) => id.startsWith("word:")).length, 49);
});

test("acceptance: the word list never fires on the site's own content/ and src/; site Uzbek text gets only apostrophe signs", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === "node_modules" ? [] : walk(full);
      return /\.(md|mdx|json|ts|tsx|ya?ml)$/.test(name) ? [full] : [];
    });
  const files = [...walk(path.join(ROOT, "content")), ...walk(path.join(ROOT, "src"))];
  assert.ok(files.length > 400, `${files.length} site files`);
  const strings: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const rule of UZ_WORD_RULES)
      assert.ok(!new RegExp(rule.pattern.source, rule.pattern.flags).test(text), `${rule.id} in ${path.relative(ROOT, file)}`);
    if (file.endsWith(".json") && file.split(path.sep).includes("uz")) {
      const collect = (value: unknown) => {
        if (typeof value === "string") strings.push(value);
        else if (value && typeof value === "object") Object.values(value).forEach(collect);
      };
      collect(JSON.parse(text));
    }
  }
  assert.ok(strings.length > 5000, `${strings.length} Uzbek strings`);
  for (const value of strings) {
    const fixed = normalizeUz(value);
    for (const id of Object.keys(fixed.fixes)) assert.ok(id.endsWith("-apostrophe"), `${id} on the site's own Uzbek`);
  }
});

test("o‘ and g‘ take U+2018, the glottal stop U+2019, from any apostrophe sign", () => {
  assert.equal(normalizeUzText("o'quvchi g`oya O'zbekiston to'g'ri"), "o‘quvchi g‘oya O‘zbekiston to‘g‘ri");
  assert.equal(normalizeUzText(`bo${cp(0x2019)}ladi yo${cp(0x2bb)}l Og${cp(0x2bc)}irlik`), "bo‘ladi yo‘l Og‘irlik");
  assert.equal(normalizeUzText("ta'sir ma`ruza san'at Qur'on"), "ta’sir ma’ruza san’at Qur’on");
  assert.equal(normalizeUzText("o‘quvchi ma’ruza"), "o‘quvchi ma’ruza", "already right: untouched");
  // A quote mark is not an apostrophe: it is not between two letters.
  assert.equal(normalizeUzText("'Xamsa' dostoni"), "'Xamsa' dostoni");
});

test("character rules: ı, soft hyphen, Cyrillic twins inside Latin words", () => {
  assert.equal(normalizeUzText(`shaharlar${cp(0x131)}`), "shaharlari");
  assert.equal(normalizeUzText(`almash${cp(0xad)}tirish`), "almashtirish");
  assert.equal(normalizeUzText(`kattals${cp(0x430)} va k${cp(0x43e)}rinish ${cp(0x443)}il`), `kattalsa va korinish ${cp(0x443)}il`);
  // As measured: one twin between Latin letters (or at the end of a Latin word). Two in a row are left
  // to the language check, which refuses an Uzbek answer with more than 5% Cyrillic.
  const pair = `k${cp(0x43e)}${cp(0x440)}inish`;
  assert.equal(normalizeUzText(pair), pair);
  // A Cyrillic word stays Cyrillic: only a twin next to Latin letters is a typo.
  const russian = `${cp(0x441)}${cp(0x43e)}${cp(0x43a)}`;
  assert.equal(normalizeUzText(russian), russian);
  assert.deepEqual(normalizeUz(`kattals${cp(0x430)}`).fixes, { "cyrillic-homoglyph-in-latin-word": 1 });
});

test("dative after a final q or k is -qa / -ka; other -ga and the exceptions list stay", () => {
  assert.equal(normalizeUzText("ravnaqga sharqga yurakga bo‘lakga"), "ravnaqqa sharqqa yurakka bo‘lakka");
  assert.equal(normalizeUzText("kitobga tog‘ga maktabga Volga"), "kitobga tog‘ga maktabga Volga");
  assert.equal(normalizeUzText("Iroqga"), "Iroqqa");
  assert.equal(normalizeUzText("QGA"), "QGA", "lower case only, as measured");
  assert.equal(DATIVE_EXCEPTIONS.size, 0, "no exception is known yet; a native speaker's find goes into the list and a test here");
  const rule = UZ_CHAR_RULES.find((item) => item.id === "dative-after-q-k")!;
  assert.equal(rule.replace("sharqga", "shar", "q"), "sharqqa");
});

test("each of the 53 words: any case, keeps its suffix; Pulsl and unutmamiz only as whole words", () => {
  assert.equal(UZ_WORD_FIXES.length, 53);
  for (const fix of UZ_WORD_FIXES) {
    const lower = fix.wrong.charAt(0).toLowerCase() + fix.wrong.slice(1);
    const capital = fix.wrong.charAt(0).toUpperCase() + fix.wrong.slice(1);
    const right = (first: (letter: string) => string) => first(fix.right.charAt(0)) + fix.right.slice(1);
    assert.equal(normalizeUzText(`${lower} `), `${right((letter) => letter.toLowerCase())} `, fix.wrong);
    assert.equal(normalizeUzText(`(${capital})`), `(${right((letter) => letter.toUpperCase())})`, fix.wrong);
    if (!fix.whole) assert.equal(normalizeUzText(`${capital}dan`), `${right((letter) => letter.toUpperCase())}dan`, `${fix.wrong} + suffix`);
  }
  assert.equal(normalizeUzText("gaslardan"), "gazlardan");
  assert.equal(normalizeUzText("KUMUSHBEKA"), "KUMUSHBIBI");
  assert.equal(normalizeUzText("Pulsl tez"), "Puls tez");
  assert.equal(normalizeUzText("pulslar"), "pulslar", "puls + lar is a real word");
  assert.equal(normalizeUzText("namoyondalari oqizloqlardan"), "namoyandalari soylardan");
  // Inside another word nothing happens.
  assert.equal(normalizeUzText("ogaslar"), "ogaslar");
});

test("07.10 review: the slips of the rehearsal's free decks (prompt as launched, T = 0.3) are fixed", () => {
  // studio/launch-2026-10-07/rehearsal/decks-text.txt, the Uzbek decks.
  assert.equal(normalizeUzText("Vijon erkinligi va so‘z erkinligi"), "Vijdon erkinligi va so‘z erkinligi");
  assert.equal(normalizeUzText("Yashil o‘simliklarning qozirilish jarayoni haqida taqdimot"), "Yashil o‘simliklarning oziqlanish jarayoni haqida taqdimot");
  assert.equal(normalizeUzText("Javobni qisqartirishni unutmamiz"), "Javobni qisqartirishni unutmaymiz");
  assert.equal(normalizeUzText("Amir Temur 1336-yilda Xoja Ilg'or qishlog‘ida tug‘ilgan"), "Amir Temur 1336-yilda Xo‘ja Ilg‘or qishlog‘ida tug‘ilgan");
  // Only the village: Xoja as a name part stays (Xoja Ahmad Yassaviy).
  assert.equal(normalizeUzText("Xoja Ahmad Yassaviy maqbarasi"), "Xoja Ahmad Yassaviy maqbarasi");
  assert.equal(normalizeUzText("unutmamizdan"), "unutmamizdan", "whole word only");
});

test("context-dependent pairs (auto=false) are never replaced", () => {
  assert.equal(UZ_CONTEXT_PAIRS.length, 13);
  for (const [wrong] of UZ_CONTEXT_PAIRS) assert.equal(normalizeUzText(wrong), wrong);
});

test("fixes are counted by rule id only; the text itself is never in them", () => {
  const result = normalizeUz("Avlodalari o'z ta'sirini ko‘rsatdi");
  assert.equal(result.text, "Avlodlari o‘z ta’sirini ko‘rsatdi");
  assert.deepEqual(result.fixes, { "ok-gk-apostrophe": 1, "glottal-apostrophe": 1, "word:Avlodalari": 1 });
});

// The studio's model prompts (spec §7.2), verbatim from the 30-topic
// measurement T0.1: prompt v3 of studio/measure/measure30.py (lines 178–289),
// the Flux style tail A and the picture check v2 (studio/MEASURE-30.md,
// appendix A). tests/studio-prompts.test.ts pins every built system prompt
// to the hash of the measured one, so an edit here is a new measurement,
// not a fix.
//
// v3 = v2 plus an English image_prompt on every outline slide, «never name
// works or dates outside the textbook», and a talk of 3–4 sentences. The app
// adds the sources slide itself («Manbalar: …», T2.2), so the model never
// writes one. Temperature 0.3 for every text step (MEASURE-30 §6); the
// proofreading pass of paid Uzbek decks (PROOF_SYSTEM) runs at 0.2.
//
// Only the topic a person typed reaches the model, cleaned by cleanTopic();
// nothing here is logged or stored.

/** Text steps' temperature: 33 errors on 4 Uzbek decks against 42 at 0.6, same time and tokens (MEASURE-30 §6). */
export const STUDIO_TEMPERATURE = 0.3;

// ── Appendix A, verbatim ─────────────────────────────────────────────────────

export const STUDY_HELPER =
  `You are a study helper for school and university students in Uzbekistan. You give a plan, key points and a short talk the student learns from, not a finished work to hand in.`;

export const FACTS_RULE =
  `Facts: only well-established school-textbook facts. Never name books, works, titles, quotes or exact dates unless they are in the school textbook; if you are not sure, leave it out.`;

export const NUMBERS_RULE =
  `Numbers, fractions, percents and formulas: digits and symbols (3/5, 1 1/2, 25%, a² + b² = c²), never in words.`;

export const IMAGE_RULE =
  `"image_prompt": REQUIRED on every slide, in ENGLISH, 6 to 14 words: a photo of real things — objects, buildings, plants, animals, nature or landscapes. Never people or body parts, statues, monuments or silhouettes; never anything with writing (text, letters, numbers, maps, diagrams, charts, arrows, labels, signs, posters, boards, book pages, manuscripts, scrolls, coins, banknotes, clocks, keyboards, screens that are on); never flags, coats of arms, soldiers, weapons, war or blood. For a slide about a person show the place, buildings or objects of that time. For math show everyday objects (fruit, pizza slices, wooden blocks).`;

export const OUTLINE_V3 = STUDY_HELPER + ` Step 1 of 2: write only the PLAN of the presentation.

Output ONLY one JSON object, no markdown, exactly this shape:
{"title": string, "subtitle": string, "slides": [{"title": string, "point": string, "image_prompt": string}, ...]}

Rules:
1. "slides" has EXACTLY {n} items (the cover is built from "title" and "subtitle" and is not counted). Slide 1 introduces the topic, the last slide is the conclusion. No sources or bibliography slide: the app adds it.
2. "title": at most 60 characters. "subtitle": at most 80 characters (for example the grade and subject).
3. Slide "title": at most 6 words. "point": the one key idea of the slide, at most 8 words. No two slides cover the same thing.
4. {image_rule}
5. {facts_rule}
6. {numbers_rule}
7. Language: every text value except "image_prompt" is in {lang_rule}
8. Never mention ChatGPT, GPT or OpenAI.{glossary}`;

export const PART_V3 = STUDY_HELPER + ` Step 2 of 2: the plan is ready; write ONLY the slides you are asked for.

Output ONLY one JSON object, no markdown, exactly this shape:
{"slides": [{"index": number, "title": string, "bullets": [string, ...], "notes": string}, ...]}

Rules:
1. Write exactly the requested slides, in order, with their plan "index". Keep the plan title (at most 60 characters) and develop the plan point. Do not repeat what other slides of the plan cover.
2. "bullets": 3 or 4 per slide, each a short phrase of at most 12 words, no numbering, no full stop at the end.
3. "notes": what the student says aloud for this slide: 3 or 4 simple sentences, at most 60 words, suitable for the audience. Do not repeat the bullets word for word.
4. {facts_rule}
5. {numbers_rule}
6. Language: every text value is in {lang_rule}
7. Never mention ChatGPT, GPT or OpenAI. No links, no list of sources.{glossary}`;

export const FREE_V3 = STUDY_HELPER + ` Write a short presentation in one go.

Output ONLY one JSON object, no markdown, exactly this shape:
{"title": string, "subtitle": string, "slides": [{"title": string, "bullets": [string, ...], "image_prompt": string}, ...]}

Rules:
1. "slides" has EXACTLY {n} items (the cover is built from "title" and "subtitle" and is not counted). Slide 1 introduces the topic, the last slide is the conclusion. No sources slide.
2. "title": at most 60 characters; "subtitle": at most 80 characters. Slide "title": at most 6 words.
3. "bullets": 3 or 4 per slide, each a short phrase of at most 12 words, no numbering, no full stop at the end.
4. {image_rule}
5. {facts_rule}
6. {numbers_rule}
7. Language: every text value except "image_prompt" is in {lang_rule}
8. Never mention ChatGPT, GPT or OpenAI. No links.{glossary}`;

export const LANG_RULE = {
  uz:
    `Uzbek, Latin script only (never Cyrillic, no Russian words). Write o‘ and g‘ with the character ‘ (U+2018) and the glottal stop with ’ (U+2019), for example: o‘quvchi, g‘oya, ma’ruza, san’at. Use the literary standard of Uzbek school textbooks and common words; if you are not sure a word exists in Uzbek, use a simpler word. Never translate Russian phrases word for word. After a final q or k the dative suffix is -qa / -ka (sharqqa, yurakka), never -ga. Use only Uzbek Latin letters: never ı, ş, ç, ğ, ö, ü, ə and never Russian endings such as -sky or -skiy. Write names as Uzbek textbooks do (Amir Temur, Alisher Navoiy, Mirzo Ulug‘bek).`,
  ru:
    `Russian, the literary standard of school textbooks in Uzbekistan. Write names as Russian textbooks do (Амир Темур, Алишер Навои).`,
} as const;

export const GLOSSARY_UZ = {
  math:
    `Uzbek school math terms (use exactly these): kasr, surat (numerator), maxraj (denominator), to‘g‘ri kasr, noto‘g‘ri kasr, aralash son (mixed number; never "qo‘shma son", which means composite number), umumiy maxraj, kasrni qisqartirish, foiz, tenglama, ildiz, diskriminant, koeffitsiyent, qo‘shish, ayirish, ko‘paytirish, bo‘lish. The fraction 3/5 is read "beshdan uch" (denominator with -dan first, then numerator); never "uch beshdan". Never use "plus" or "minus" in Uzbek text: write qo‘shish, ayirish or the symbols + and −.`,
  geometry:
    `Uzbek school geometry terms (use exactly these): to‘g‘ri burchakli uchburchak, to‘g‘ri burchak, gipotenuza, katet, kvadrat, yuza, perimetr, teorema, isbot. Write formulas with symbols: a² + b² = c².`,
  physics:
    `Uzbek school physics terms (use exactly these): kuch, massa, tezlik, tezlanish, inersiya, ishqalanish kuchi, og‘irlik kuchi, elektr toki, tok kuchi, kuchlanish, qarshilik, o‘tkazgich, elektr zanjiri. Units with symbols: N, kg, m/s², A, V, Om. Formulas with symbols: F = m · a, I = U / R.`,
  geography:
    `Uzbek school geography terms (use exactly these): iqlim, relyef, tekislik, tog‘, cho‘l, vodiy, daryo, ko‘l, qo‘shni davlatlar, chorraha (crossroads; never "choring‘i"), saksovul (never "saqsoqov").`,
  biology:
    `Uzbek school biology terms (use exactly these): hujayra, hujayra qobig‘i, sitoplazma, yadro, xloroplast, fotosintez, karbonat angidrid gazi, kislorod, to‘qima, organ, yurak, arteriya, vena, kapillyar, katta va kichik qon aylanish doirasi.`,
  history:
    `Uzbek history terms (use exactly these): gumbaz (dome), minora (minaret), peshtoq (portal), koshin (glazed tile), madrasa, maqbara, masjid, rasadxona, karvonsaroy, Go‘ri Amir maqbarasi, Bibixonim masjidi, Registon maydoni, Buyuk ipak yo‘li, Movarounnahr, sulola, saltanat.`,
  literature:
    `Uzbek literature terms (use exactly these): g‘azal, ruboiy, doston, devon, «Xamsa» (five dostons), roman, qissa, hikoya, she’r, shoir (a poet; "shoira" is only a woman poet), adib, ijod, asar.`,
  chemistry:
    `Uzbek school chemistry terms (use exactly these): kimyoviy element, davriy jadval, atom, atom massasi, davr, guruh, metall, metallmas, modda, kimyoviy formula.`,
} as const;

/**
 * The proofreading pass of paid Uzbek decks (MEASURE-30 §6, appendix A
 * PROOF_SYSTEM; measure30.py lines 781–785, line breaks included): a second
 * call per part that fixes only the language. Measured: −67% Uzbek errors,
 * facts untouched, one error of its own in four decks. The owner turned it
 * on for paid decks on 07.10 (DECISIONS §13 item 4).
 */
export const PROOF_SYSTEM = `You are an editor of Uzbek school texts (Uzbek Latin script, the literary standard of school textbooks).
You get a JSON object with presentation slides. Fix ONLY language mistakes in the Uzbek text: words that do not exist,
wrong word choices, misspellings, wrong case endings and broken sentences. Use ‘ (U+2018) in o‘ and g‘ and ’ (U+2019)
for the glottal stop. Do not add or remove facts, slides, bullets or sentences; keep "index" values; keep numbers and formulas.
Output ONLY the corrected JSON object with exactly the same shape, no comments.`;

/** The proofreading pass runs at 0.2, as measured (MEASURE-30 §6). */
export const PROOF_TEMPERATURE = 0.2;

export const TAIL_A = `, realistic photo, quiet empty scene, soft daylight, clean composition`;

export const CHECK_PROMPT_V2 =
  `Look at the image. Answer ONLY with one JSON object, no markdown: {"person": bool, "face": bool, "text": bool, "flag": bool, "weapon": bool, "nudity": bool, "blood": bool}. person = any human or human-like figure, statue, mannequin, silhouette, hand or other body part, even tiny or far away; face = any face, including painted, drawn or sculpted faces; text = any letters, digits, signs, writing or writing-like marks, even small or blurred; flag = any flag, coat of arms, star emblem or state emblem; weapon = any gun, cannon, artillery, tank, sword, military helmet or other military equipment.`;

// ── Building the messages ────────────────────────────────────────────────────

export type StudioLocale = "uz" | "ru";
export type StudioAudience = "maktab" | "talaba" | "umumiy";
export type GlossarySubject = keyof typeof GLOSSARY_UZ;

export interface ChatMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

/**
 * A system prompt as measure30.py build_system() builds it: the rules filled
 * in, {n} replaced, and for Uzbek the subject's glossary appended as the next
 * numbered rule (for Russian, and for a topic without a glossary, nothing).
 */
export function buildSystem(template: string, locale: StudioLocale, subject: GlossarySubject | null, n?: number): string {
  const glossary = locale === "uz" && subject ? GLOSSARY_UZ[subject] : "";
  const numbers = [...template.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1]));
  const nextRule = Math.max(...numbers) + 1;
  let text = template
    .replaceAll("{image_rule}", IMAGE_RULE)
    .replaceAll("{facts_rule}", FACTS_RULE)
    .replaceAll("{numbers_rule}", NUMBERS_RULE)
    .replaceAll("{lang_rule}", LANG_RULE[locale])
    .replaceAll("{glossary}", glossary ? `\n${nextRule}. ${glossary}` : "");
  if (n !== undefined) text = text.replaceAll("{n}", String(n));
  return text;
}

const LEVEL: Record<StudioLocale, Record<StudioAudience, string>> = {
  uz: { maktab: "Maktab o‘quvchilari", talaba: "Talabalar", umumiy: "Umumiy auditoriya" },
  ru: { maktab: "Школьники", talaba: "Студенты", umumiy: "Широкая аудитория" },
};

/** The audience as the user line names it (the measurement used e.g. «7-sinf, tarix»; the form has three choices). */
export function levelLine(audience: StudioAudience, locale: StudioLocale): string {
  return LEVEL[locale][audience];
}

/**
 * The topic as it may reach a prompt: NFC, no control or format characters,
 * single spaces, no trailing full stop (the user line adds its own), at most
 * 200 characters. Length rules (3–200) belong to the endpoint.
 */
export function cleanTopic(topic: string): string {
  return topic
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "")
    .slice(0, 200);
}

/** measure30.py user_line(): «Mavzu: …. <level>. Slaydlar soni: n.» */
export function userLine(input: { topic: string; level: string; slides: number; locale: StudioLocale }): string {
  return input.locale === "uz"
    ? `Mavzu: ${input.topic}. ${input.level}. Slaydlar soni: ${input.slides}.`
    : `Тема: ${input.topic}. ${input.level}. Количество слайдов: ${input.slides}.`;
}

/** Python's json.dumps(..., ensure_ascii=False) with its default ", " / ": " separators, as the measured part prompts carried. */
export function pythonJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}: ${pythonJson(item)}`).join(", ")}}`;
  }
  throw new TypeError("not JSON");
}

export interface PlanForPrompt {
  readonly title: string;
  readonly subtitle: string;
  readonly slides: ReadonlyArray<{ readonly title: string; readonly point: string }>;
}

/** measure30.py compact_plan(): the outline without image prompts, slides numbered from 1. */
export function compactPlan(outline: PlanForPrompt): string {
  return pythonJson({
    title: outline.title,
    subtitle: outline.subtitle,
    slides: outline.slides.map((slide, i) => ({ index: i + 1, title: slide.title, point: slide.point })),
  });
}

export interface DeckRequest {
  readonly topic: string;
  readonly locale: StudioLocale;
  readonly audience: StudioAudience;
  readonly slides: number;
}

function opening(request: DeckRequest) {
  const topic = cleanTopic(request.topic);
  return {
    subject: detectSubject(topic),
    line: userLine({ topic, level: levelLine(request.audience, request.locale), slides: request.slides, locale: request.locale }),
  };
}

/** Step 1 of the full deck: the plan with an image prompt per slide. */
export function outlineMessages(request: DeckRequest): ChatMessage[] {
  const { subject, line } = opening(request);
  return [
    { role: "system", content: buildSystem(OUTLINE_V3, request.locale, subject, request.slides) },
    { role: "user", content: line },
  ];
}

/** Step 2: the slides `indexes` (1-based plan indexes) of a signed outline. */
export function partMessages(request: DeckRequest, outline: PlanForPrompt, indexes: readonly number[]): ChatMessage[] {
  const { subject, line } = opening(request);
  const label = request.locale === "uz" ? "Reja" : "План";
  return [
    { role: "system", content: buildSystem(PART_V3, request.locale, subject) },
    {
      role: "user",
      content: `${line}\n${label} (JSON): ${compactPlan(outline)}\nWrite ONLY slides ${indexes.join(", ")} (plan indexes), with the same index values.`,
    },
  ];
}

/** The free deck: every slide in one call, no talk. */
export function freeMessages(request: DeckRequest): ChatMessage[] {
  const { subject, line } = opening(request);
  return [
    { role: "system", content: buildSystem(FREE_V3, request.locale, subject, request.slides) },
    { role: "user", content: line },
  ];
}

/** One slide of a part as the proofreading pass gets it back (the part's own fields, in the model's order). */
export interface ProofSlide {
  readonly index: number;
  readonly title: string;
  readonly bullets: readonly string[];
  readonly notes: string;
}

/** What one proofreading call reads: a part's slides, and for the first part also the deck's title and subtitle. */
export interface ProofText {
  readonly title?: string;
  readonly subtitle?: string;
  readonly slides: readonly ProofSlide[];
}

/**
 * The proofreading pass of one part: PROOF_SYSTEM, then the part as
 * measure30.py mode_proof sent it, json.dumps({"slides": …},
 * ensure_ascii=False). The first part also carries the deck's title and
 * subtitle (the cover), ahead of its slides, so the cover is read too
 * without one more call.
 */
export function proofMessages(text: ProofText): ChatMessage[] {
  const slides = text.slides.map((slide) => ({ index: slide.index, title: slide.title, bullets: [...slide.bullets], notes: slide.notes }));
  const body = text.title !== undefined ? { title: text.title, subtitle: text.subtitle ?? "", slides } : { slides };
  return [
    { role: "system", content: PROOF_SYSTEM },
    { role: "user", content: pythonJson(body) },
  ];
}

/** The plan indexes of each part of an n-slide deck: 15 → [1..4] [5..8] [9..12] [13..15]. */
export function partIndexes(slides: number, perPart = 4): number[][] {
  const parts: number[][] = [];
  for (let start = 1; start <= slides; start += perPart)
    parts.push(Array.from({ length: Math.min(perPart, slides - start + 1) }, (_, i) => start + i));
  return parts;
}

// ── The subject of a topic, for the Uzbek glossary ───────────────────────────
// The measurement knew each topic's subject; the form asks only for a topic,
// so the subject is read from it. First match wins, in this order (a name or
// a narrow term before a broad one: «Pifagor teoremasi» is geometry, not
// math; «qon aylanishi» is biology, «Om qonuni» is not). Every keyword
// matches at the start of a word and may take suffixes; apostrophes compare
// as one sign. A topic without a match gets no glossary, as «informatics» or
// «civics» did in T0.1. Only Uzbek prompts carry a glossary, so the keywords
// are Uzbek.

const SUBJECT_KEYWORDS: ReadonlyArray<readonly [GlossarySubject, readonly string[]]> = [
  ["literature", [
    "adabiyot", "navoiy", "qodiriy", "cho'lpon", "oybek", "furqat", "mashrab", "ogahiy", "muqimiy", "zulfiya",
    "she'r", "doston", "g'azal", "ruboiy", "hikoya", "qissa", "roman", "shoir", "adib", "ijod", "xamsa",
    "o'tkan kunlar",
  ]],
  ["geometry", [
    "geometr", "teorema", "pifagor", "uchburchak", "to'rtburchak", "ko'pburchak", "burchak", "aylana", "doira",
    "perimetr", "parallelogramm", "trapetsiya", "romb", "katet", "gipotenuza", "piramida", "prizma", "silindr",
  ]],
  ["chemistry", [
    "kimyo", "davriy jadval", "mendeleyev", "molekula", "kislota", "ishqor", "oksid", "reaksiya", "valentlik",
  ]],
  ["physics", [
    "fizik", "nyuton", "tezlik", "tezlanish", "elektr", "om qonun", "magnit", "energiya", "inersiya", "ishqalanish",
    "bosim", "arximed", "optika", "yorug'lik", "tovush", "issiqlik", "quyosh sistema", "sayyora", "astronom",
    "gravitatsiya", "tortishish", "kuchlanish",
  ]],
  ["math", [
    "matematik", "kasr", "foiz", "tenglama", "tengsizlik", "algebra", "arifmetik", "ildiz", "diskriminant", "funksiya",
    "proporsiya", "logarifm", "trigonometr", "progressiya", "hosila", "integral", "natural son",
  ]],
  ["biology", [
    "biolog", "hujayra", "fotosintez", "yurak", "yurag", "qon aylanish", "qon tomir", "o'simlik", "hayvon", "organizm",
    "ekolog", "atrof-muhit", "nafas", "skelet", "suyak", "genetik", "irsiyat", "mikrob", "bakteriya", "anatom",
    "suvning tabiatda", "suv aylanish", "hazm",
  ]],
  ["geography", [
    "geograf", "iqlim", "relyef", "tabiat", "daryo", "tog'", "cho'l", "materik", "okean", "dengiz", "vodiy",
    "aholi", "mintaqa", "qit'a", "foydali qazilma", "ob-havo",
  ]],
  ["history", [
    "tarix", "temur", "ipak yo'li", "xonlik", "sulola", "imperiya", "qadimgi", "o'rta asr", "ulug'bek", "bobur",
    "somoniy", "qoraxoniy", "xorazmshoh", "jadid", "urush", "arxeolog", "sivilizatsiya",
  ]],
];

const oneApostrophe = (text: string) => text.replace(/[‘’'`ʻʼ]/g, "'");
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SUBJECT_PATTERNS: ReadonlyArray<readonly [GlossarySubject, RegExp]> = SUBJECT_KEYWORDS.map(([subject, words]) => [
  subject,
  new RegExp(`(?<![\\p{L}\\p{N}'])(?:${words.map(escapeRegExp).join("|")})`, "u"),
]);

/** The glossary subject of a topic, or null. */
export function detectSubject(topic: string): GlossarySubject | null {
  const text = oneApostrophe(topic.normalize("NFC").toLowerCase());
  for (const [subject, pattern] of SUBJECT_PATTERNS) if (pattern.test(text)) return subject;
  return null;
}

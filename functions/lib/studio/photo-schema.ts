// The photo explanation's answer (spec §8.3) and its check: the JSON the
// model writes becomes a PhotoVerdict, or a list of problems the step asks
// again about. Nothing here keeps text; a value is cleaned, measured and
// handed on.
//
//   unreadable: true   the photo holds no readable task: the caller refuses
//                      the job (422 unreadable) and every content field is
//                      dropped here already, so no text from the picture
//                      can travel on a refusal (spec §8.1 item 6).
//   subject            one of PHOTO_SUBJECTS; anything else is "boshqa" (soft).
//   given / answer / check  cut at their limits (soft); empty is a problem.
//   steps              1..12, each cut at 400 characters (soft); none is a problem.
//   confidence         high | medium | low; anything else is "medium" (soft).
// An Uzbek answer is Uzbek-normalized (uz-normalize.ts) and must be in the
// Latin script: an answer written in Cyrillic or in English is a problem, so
// the step asks again (spec §8.2: the fallback once answered in English); a
// few Cyrillic words quoted from a Russian task are not.
import type { Checked } from "./deck-schema";
import type { StudioLocale } from "./prompts";
import { addFixes, normalizeUz } from "./uz-normalize";

export const PHOTO_SUBJECTS = ["matematika", "fizika", "kimyo", "ona_tili", "ingliz_tili", "boshqa"] as const;
export type PhotoSubject = (typeof PHOTO_SUBJECTS)[number];
export const PHOTO_CONFIDENCES = ["high", "medium", "low"] as const;
export type PhotoConfidence = (typeof PHOTO_CONFIDENCES)[number];

/** Lengths of spec §8.3, in characters (code points). */
export const PHOTO_LIMITS = {
  given: 600,
  steps: { min: 1, max: 12, each: 400 },
  answer: 300,
  check: 300,
} as const;

export interface PhotoAnswer {
  readonly subject: PhotoSubject;
  readonly given: string;
  readonly steps: readonly string[];
  readonly answer: string;
  readonly check: string;
  readonly confidence: PhotoConfidence;
}

/** What the step hands to the endpoint: an answer, or the word that there is none. */
export type PhotoVerdict = { readonly unreadable: true } | { readonly unreadable: false; readonly answer: PhotoAnswer };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const length = (text: string) => Array.from(text).length;

/** NFC, no control or format characters, single spaces, trimmed. */
function cleanText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cut(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("").trimEnd();
}

const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LATIN = /\p{Script=Latin}/gu;
/** Cyrillic letters above this share of all letters: the answer is written in Russian, not quoting a Russian task. */
const CYRILLIC_SHARE = 1 / 3;
/** Words that mark an English sentence; an Uzbek answer has none of them as whole words. */
const ENGLISH_WORDS = /\b(?:the|and|is|are|was|were|of|to|we|then|so|therefore|answer|step|first|second|find|given|check|which|with|this|that|from|by|for)\b/gi;
/** Words that mark an Uzbek sentence (Latin script). */
const UZBEK_WORDS = /(?:^|[^\p{L}])(?:va|bu|uchun|bilan|bo‘ladi|bo‘lsin|teng|demak|javob|berilgan|topish|topamiz|hisoblaymiz|kerak|ya’ni|yoki|qadam|tekshirish|masala|son|soni)(?=$|[^\p{L}])/giu;

/**
 * Why `text` is not an Uzbek Latin text, or null: written in Cyrillic (a
 * third or more of its letters; a Russian task quoted inside an Uzbek
 * explanation is fine), or more English than Uzbek words.
 */
export function uzbekLatinProblem(text: string): "cyrillic" | "not_uzbek" | null {
  const cyrillic = (text.match(CYRILLIC) ?? []).length;
  const latin = (text.match(LATIN) ?? []).length;
  if (cyrillic > 0 && cyrillic >= (cyrillic + latin) * CYRILLIC_SHARE) return "cyrillic";
  const english = (text.match(ENGLISH_WORDS) ?? []).length;
  const uzbek = (text.match(UZBEK_WORDS) ?? []).length;
  return english >= 3 && english > uzbek ? "not_uzbek" : null;
}

/**
 * The model's JSON against spec §8.3. For "uz" the text is Uzbek-normalized
 * and must be Uzbek in the Latin script. Pure.
 */
export function checkPhotoAnswer(raw: unknown, context: { readonly locale: StudioLocale }): Checked<PhotoVerdict> {
  if (!isRecord(raw)) return { ok: false, problems: ["not an object"] };
  if (raw.unreadable === true) return { ok: true, value: { unreadable: true }, soft: [], fixes: {} };

  const problems: string[] = [];
  const soft: string[] = [];
  let fixes: Record<string, number> = {};
  const field = (name: "given" | "answer" | "check", max: number): string => {
    const value = raw[name];
    if (typeof value !== "string") {
      problems.push(`${name}: not a string`);
      return "";
    }
    let text = cleanText(value);
    if (context.locale === "uz") {
      const normalized = normalizeUz(text);
      text = normalized.text;
      fixes = addFixes(fixes, normalized.fixes);
    }
    if (!text) problems.push(`${name}: empty`);
    if (length(text) > max) {
      soft.push(`${name}: cut at ${max}`);
      text = cut(text, max);
    }
    return text;
  };

  const given = field("given", PHOTO_LIMITS.given);
  const answer = field("answer", PHOTO_LIMITS.answer);
  const check = field("check", PHOTO_LIMITS.check);

  let steps: string[] = [];
  if (!Array.isArray(raw.steps)) problems.push("steps: not a list");
  else {
    steps = raw.steps
      .filter((step): step is string => typeof step === "string")
      .map((step) => {
        let text = cleanText(step);
        if (context.locale === "uz") {
          const normalized = normalizeUz(text);
          text = normalized.text;
          fixes = addFixes(fixes, normalized.fixes);
        }
        return text;
      })
      .filter((step) => step.length > 0);
    if (steps.length < PHOTO_LIMITS.steps.min) problems.push("steps: none");
    if (steps.length > PHOTO_LIMITS.steps.max) {
      soft.push(`steps: ${steps.length} cut to ${PHOTO_LIMITS.steps.max}`);
      steps = steps.slice(0, PHOTO_LIMITS.steps.max);
    }
    steps = steps.map((step) => {
      if (length(step) <= PHOTO_LIMITS.steps.each) return step;
      soft.push(`step: cut at ${PHOTO_LIMITS.steps.each}`);
      return cut(step, PHOTO_LIMITS.steps.each);
    });
  }

  let subject: PhotoSubject = "boshqa";
  if ((PHOTO_SUBJECTS as readonly unknown[]).includes(raw.subject)) subject = raw.subject as PhotoSubject;
  else soft.push("subject: unknown, boshqa");

  let confidence: PhotoConfidence = "medium";
  if ((PHOTO_CONFIDENCES as readonly unknown[]).includes(raw.confidence)) confidence = raw.confidence as PhotoConfidence;
  else soft.push("confidence: unknown, medium");

  if (context.locale === "uz" && !problems.length) {
    const language = uzbekLatinProblem([given, ...steps, answer, check].join(" "));
    if (language) problems.push(`language: ${language}`);
  }
  if (problems.length) return { ok: false, problems };
  return { ok: true, value: { unreadable: false, answer: { subject, given, steps, answer, check, confidence } }, soft, fixes };
}

// The shape of a model answer, checked before anything reaches a browser
// (spec §7.3; limits from the 30-topic measurement, MEASURE-30 §4, §9).
//
// Three answers: the full deck's outline (step 1), a part of ≤ 4 slides with
// the talk (step 2), and the free deck in one call. Each check:
//   1. parses the JSON (a ```json fence is tolerated; T0.1 saw none in 173);
//   2. checks the structure: exact slide count, required fields, types;
//   3. cleans every text (NFC, single spaces, no list glyphs or final full
//      stop on bullets) and, for Uzbek, runs uz-normalize (never on image
//      prompts, which are English);
//   4. checks lengths and language: for Uzbek more than 5% Cyrillic letters,
//      a link, or the model naming itself ChatGPT / GPT / OpenAI refuse the
//      answer (a deck ABOUT ChatGPT may mention it, but never as its author).
// A refused answer is one failed attempt (llm.ts retries once). Problems are
// coarse codes for tests, never text; nothing here logs.
//
// Soft notes (2 or 5 bullets, a talk of 2 or 5 sentences, plan indexes
// renumbered) do not refuse: T0.1 asked for 3–4 and got exactly 4 bullets on
// all 408 slides, and 9 talks out of 408 had 2 or 5 sentences.
import { addFixes, normalizeUz } from "./uz-normalize";
import type { StudioLocale } from "./prompts";

/** Hard limits (characters). The measured maxima were far below: titles 42 / 40, bullets 64, talk 296. */
export const DECK_LIMITS = {
  deckTitle: 90,
  subtitle: 120,
  slideTitle: 70,
  point: 160,
  imagePrompt: 300,
  bullet: 110,
  minBullets: 2,
  maxBullets: 5,
  /** Slides that carry a picture show at most this many bullets. */
  maxBulletsWithImage: 4,
  notes: 600,
  /** An Uzbek answer with more Cyrillic letters than this share is refused. */
  uzCyrillicShare: 0.05,
} as const;

export type SlideLayout = "title-bullets" | "image-right" | "image-full" | "two-columns";

export interface OutlineSlide {
  /** 1-based plan index. */
  readonly index: number;
  readonly title: string;
  /** The one key idea of the slide. */
  readonly point: string;
  /** English, for Flux; never shown, never normalized as Uzbek. */
  readonly imagePrompt: string;
}

export interface Outline {
  readonly title: string;
  readonly subtitle: string;
  readonly slides: readonly OutlineSlide[];
}

export interface PartSlide {
  readonly index: number;
  readonly title: string;
  readonly bullets: readonly string[];
  /** «Qisqa ma’ruza matni»: 3–4 sentences. */
  readonly notes: string;
}

export interface FreeDeckSlide {
  readonly index: number;
  readonly title: string;
  readonly bullets: readonly string[];
  readonly imagePrompt: string;
}

export interface FreeDeck {
  readonly title: string;
  readonly subtitle: string;
  readonly slides: readonly FreeDeckSlide[];
}

/** A slide as the API hands it to the island (spec §7.3 Deck). */
export interface DeckSlide {
  readonly index: number;
  readonly title: string;
  readonly bullets: readonly string[];
  readonly notes?: string;
  readonly layout: SlideLayout;
}

export type Checked<T> =
  | {
      readonly ok: true;
      readonly value: T;
      /** Soft notes: kept, counted, never a refusal. */
      readonly soft: readonly string[];
      /** uz-normalize counts for the whole answer. */
      readonly fixes: Readonly<Record<string, number>>;
    }
  | { readonly ok: false; readonly problems: readonly string[] };

export interface CheckContext {
  readonly locale: StudioLocale;
  /** The person's topic: a deck about ChatGPT may name it. */
  readonly topic: string;
}

/**
 * The JSON object in a model answer, or undefined. A ```json … ``` fence
 * around it is removed; anything else (prose, two objects, an array) is not
 * an answer.
 */
export function parseModelJson(content: string): Record<string, unknown> | undefined {
  let text = content.trim();
  const fenced = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/.exec(text);
  if (fenced) text = fenced[1];
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const length = (text: string) => Array.from(text).length;

/** NFC, no control or format characters, single spaces, trimmed. */
function cleanText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A bullet without a leading list glyph or one final full stop (the prompt asks for neither). */
function cleanBullet(value: string): string {
  return cleanText(value)
    .replace(/^[•●▪◦·*–—-]\s+/u, "")
    .replace(/(?<!\.)\.$/, "")
    .trim();
}

const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LETTER = /\p{L}/gu;
const LINK = /https?:\/\/|www\./i;
const BRAND = /chatgpt|openai|(?<![\p{L}\p{N}])gpt(?![\p{L}\p{N}])/iu;
/**
 * The model presenting itself, or the deck, as ChatGPT / GPT / OpenAI. Kept
 * narrow: a deck about ChatGPT may say «ChatGPT yordamida insho yozish».
 */
const SELF_NAMING: readonly RegExp[] = [
  /(?<![\p{L}])(?:men|biz)\s+(?:chatgpt|gpt|openai)/iu,
  /(?<![\p{L}])i\s*(?:am|'m|’m)\s+(?:chatgpt|gpt)/iu,
  /(?<![\p{L}])я\s*(?:[—–-]\s*)?(?:chatgpt|gpt)/iu,
  /(?:taqdimot|slayd)\p{L}*\s+(?:chatgpt|openai|gpt)\S*\s+(?:tomonidan|yordamida)/iu,
  /(?:презентаци|слайд)\p{L}*\s+(?:создан|подготовлен|сгенерирован|написан)\p{L}*\s+(?:с\s+помощью\s+|при\s+помощи\s+)?(?:chatgpt|openai|gpt)/iu,
  /(?:presentation|deck|slides?)\s+(?:was\s+|were\s+)?(?:made|generated|written|created|prepared)\s+(?:by|with|using)\s+(?:chatgpt|openai|gpt)/iu,
];

/** Problems of the language of every text value of an answer (image prompts excluded). */
function languageProblems(texts: readonly string[], context: CheckContext): string[] {
  const joined = texts.join("\n");
  const problems: string[] = [];
  if (context.locale === "uz") {
    const letters = joined.match(LETTER)?.length ?? 0;
    const cyrillic = joined.match(CYRILLIC)?.length ?? 0;
    if (letters && cyrillic / letters > DECK_LIMITS.uzCyrillicShare) problems.push("uz_cyrillic");
  }
  if (LINK.test(joined)) problems.push("link");
  const topicNamesBrand = BRAND.test(context.topic);
  if ((!topicNamesBrand && BRAND.test(joined)) || SELF_NAMING.some((pattern) => pattern.test(joined))) problems.push("brand");
  return problems;
}

/** Collects problems and Uzbek fixes while an answer is read. */
class Reader {
  readonly problems: string[] = [];
  readonly soft: string[] = [];
  readonly fixes: Record<string, number> = {};
  readonly texts: string[] = [];

  constructor(private readonly context: CheckContext) {}

  /** A required text value, cleaned and (for Uzbek) normalized; "" after a problem. */
  text(value: unknown, where: string, max: number, options: { bullet?: boolean; optional?: boolean } = {}): string {
    if ((value === undefined || value === null) && options.optional) return "";
    if (typeof value !== "string") {
      this.problems.push(`type:${where}`);
      return "";
    }
    let text = options.bullet ? cleanBullet(value) : cleanText(value);
    if (this.context.locale === "uz") {
      const fixed = normalizeUz(text);
      text = fixed.text;
      addFixes(this.fixes, fixed.fixes);
    }
    if (!text && !options.optional) this.problems.push(`empty:${where}`);
    if (length(text) > max) this.problems.push(`long:${where}`);
    if (text) this.texts.push(text);
    return text;
  }

  /** An English image prompt: cleaned, never normalized as Uzbek, no Cyrillic. */
  imagePrompt(value: unknown, where: string): string {
    if (typeof value !== "string") {
      this.problems.push(`type:${where}`);
      return "";
    }
    const text = cleanText(value);
    if (!text) this.problems.push(`empty:${where}`);
    else if (/\p{Script=Cyrillic}/u.test(text)) this.problems.push(`cyrillic:${where}`);
    if (length(text) > DECK_LIMITS.imagePrompt) this.problems.push(`long:${where}`);
    return text;
  }

  bullets(value: unknown, where: string): string[] {
    if (!Array.isArray(value)) {
      this.problems.push(`type:${where}`);
      return [];
    }
    const bullets = value.map((item, i) => this.text(item, `${where}.${i + 1}`, DECK_LIMITS.bullet, { bullet: true }));
    if (bullets.length < DECK_LIMITS.minBullets || bullets.length > DECK_LIMITS.maxBullets) this.problems.push(`count:${where}`);
    else if (bullets.length < 3 || bullets.length > 4) this.soft.push(`bullets:${where}`);
    return bullets;
  }

  slides(raw: Record<string, unknown>, count: number): Record<string, unknown>[] {
    const slides = raw.slides;
    if (!Array.isArray(slides)) {
      this.problems.push("type:slides");
      return [];
    }
    if (slides.length !== count) this.problems.push("count:slides");
    return slides.map((slide, i) => {
      if (isRecord(slide)) return slide;
      this.problems.push(`type:slide.${i + 1}`);
      return {};
    });
  }

  finish<T>(value: T): Checked<T> {
    this.problems.push(...languageProblems(this.texts, this.context));
    return this.problems.length
      ? { ok: false, problems: [...new Set(this.problems)] }
      : { ok: true, value, soft: this.soft, fixes: this.fixes };
  }
}

const SENTENCE = /[^.!?…]+[.!?…]+/g;

/** Step 1: the outline of an n-slide full deck. */
export function checkOutline(raw: unknown, context: CheckContext & { readonly slides: number }): Checked<Outline> {
  if (!isRecord(raw)) return { ok: false, problems: ["not_object"] };
  const read = new Reader(context);
  const title = read.text(raw.title, "title", DECK_LIMITS.deckTitle);
  const subtitle = read.text(raw.subtitle, "subtitle", DECK_LIMITS.subtitle, { optional: true });
  const slides = read.slides(raw, context.slides).map((slide, i) => ({
    index: i + 1,
    title: read.text(slide.title, `slide.${i + 1}.title`, DECK_LIMITS.slideTitle),
    point: read.text(slide.point, `slide.${i + 1}.point`, DECK_LIMITS.point),
    imagePrompt: read.imagePrompt(slide.image_prompt, `slide.${i + 1}.image_prompt`),
  }));
  return read.finish({ title, subtitle, slides });
}

/**
 * Step 2: the slides `indexes` of a full deck, each with its talk. The count
 * must match; plan indexes the model renumbered are put back in order (a
 * soft note), since the part was asked for exactly these slides.
 */
export function checkPart(raw: unknown, context: CheckContext & { readonly indexes: readonly number[] }): Checked<{ slides: PartSlide[] }> {
  if (!isRecord(raw)) return { ok: false, problems: ["not_object"] };
  const read = new Reader(context);
  const items = read.slides(raw, context.indexes.length);
  if (items.length === context.indexes.length && items.some((slide, i) => slide.index !== context.indexes[i])) read.soft.push("indexes");
  const slides = items.map((slide, i) => {
    const where = `slide.${context.indexes[i] ?? i + 1}`;
    const notes = read.text(slide.notes, `${where}.notes`, DECK_LIMITS.notes);
    const sentences = notes.match(SENTENCE)?.length ?? 0;
    if (notes && (sentences < 3 || sentences > 4)) read.soft.push(`sentences:${where}`);
    return {
      index: context.indexes[i] ?? i + 1,
      title: read.text(slide.title, `${where}.title`, DECK_LIMITS.slideTitle),
      bullets: read.bullets(slide.bullets, `${where}.bullets`),
      notes,
    };
  });
  return read.finish({ slides });
}

/** The free deck: n slides with bullets and an image prompt each, and no talk. */
export function checkFreeDeck(raw: unknown, context: CheckContext & { readonly slides: number }): Checked<FreeDeck> {
  if (!isRecord(raw)) return { ok: false, problems: ["not_object"] };
  const read = new Reader(context);
  const title = read.text(raw.title, "title", DECK_LIMITS.deckTitle);
  const subtitle = read.text(raw.subtitle, "subtitle", DECK_LIMITS.subtitle, { optional: true });
  const slides = read.slides(raw, context.slides).map((slide, i) => {
    const where = `slide.${i + 1}`;
    // The free deck has no talk (spec §2.1); an answer that writes one is refused.
    if (typeof slide.notes === "string" ? slide.notes.trim() !== "" : slide.notes !== undefined && slide.notes !== null)
      read.problems.push(`notes:${where}`);
    return {
      index: i + 1,
      title: read.text(slide.title, `${where}.title`, DECK_LIMITS.slideTitle),
      bullets: read.bullets(slide.bullets, `${where}.bullets`),
      imagePrompt: read.imagePrompt(slide.image_prompt, `${where}.image_prompt`),
    };
  });
  return read.finish({ title, subtitle, slides });
}

/**
 * The layout of each slide: a slide that gets a picture and has ≤ 4 bullets
 * is "image-right"; every other one "title-bullets". "image-full" and
 * "two-columns" are the browser's to choose for variety (T2.2).
 */
export function withLayouts(
  slides: ReadonlyArray<{ index: number; title: string; bullets: readonly string[]; notes?: string }>,
  pictured: ReadonlySet<number>,
): DeckSlide[] {
  return slides.map((slide) => ({
    index: slide.index,
    title: slide.title,
    bullets: slide.bullets,
    ...(slide.notes ? { notes: slide.notes } : {}),
    layout: pictured.has(slide.index) && slide.bullets.length <= DECK_LIMITS.maxBulletsWithImage ? "image-right" : "title-bullets",
  }));
}

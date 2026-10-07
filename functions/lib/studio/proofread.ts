// The proofreading pass of paid Uzbek decks (DECISIONS 07.10 §13 item 4;
// MEASURE-30 §6; spec §7.3).
//
// After a part of a paid full deck is written and checked (deck-schema.ts
// checkPart), a second call reads it again with PROOF_SYSTEM ("fix ONLY
// language mistakes", temperature 0.2) and the corrected text goes through
// the same check and the same server-side Uzbek normalization (uz-normalize
// via checkPart). Measured on four Uzbek decks: −67% language errors, facts
// untouched, one error of its own; ≈ +11 s a part (the parts run in
// parallel, so ≈ +15 s a deck) and ≈ +24 so‘m a deck.
//
// When: Uzbek only, paid jobs only (an entitlement or its regeneration),
// while STUDIO_PAID_PROOFREAD is not exactly "false". The free deck and
// Russian decks never get it.
//
// What it may change, field by field. A corrected title, bullet or talk is
// taken only if it keeps the original's numbers (every digit run, in order),
// stays within PROOF_BOUNDS of its length and, for the talk, keeps its
// number of sentences; otherwise that field stays as the part step wrote
// it. A bullet list whose length changed stays as it was. The first part
// also carries the deck's title and subtitle (the cover), read the same way.
//
// It never costs the unit. The pass is metered on the job (jobs.ts
// jobMeter "proof": a step under the job's cap plus its own allowance, the
// paid day's spend bucket), and whatever goes wrong (a fault, 1302, an
// answer that is not the part, the cap, the bucket, a refusal) leaves the
// part exactly as the part step wrote it: the deck goes out unproofread,
// never not at all. Logs carry {event, code} only.
import type { StudioConfig } from "./config";
import { checkPart, DECK_LIMITS, type CheckContext, type Checked, type PartSlide } from "./deck-schema";
import { studioLog } from "./http";
import { jobMeter } from "./jobs";
import type { LedgerJob, LedgerSource } from "./ledger";
import type { StudioAlert } from "./limits";
import { runTextStep, type LlmEnv } from "./llm";
import { proofMessages, type ProofText, type StudioLocale } from "./prompts";
import { addFixes, normalizeUz } from "./uz-normalize";

/** How far a corrected field may move from the original's length (characters) before the original is kept. */
export const PROOF_BOUNDS = { minRatio: 0.6, maxRatio: 1.6, slackChars: 12 } as const;

/** A part as the proofreading pass reads and returns it. */
export interface ProofPart {
  readonly title?: string;
  readonly subtitle?: string;
  readonly slides: readonly PartSlide[];
}

export interface ProofChecked extends ProofPart {
  /** Fields the pass changed and the bounds let through. */
  readonly changed: number;
  /** Fields the pass changed but the bounds refused: they stay as the part step wrote them. */
  readonly kept: number;
}

export type ProofStatus = "proofread" | "off" | "failed";

export interface ProofOutcome {
  /** The part to hand out: corrected, or the original when the pass did not run or failed. */
  readonly part: ProofPart;
  readonly status: ProofStatus;
  readonly changed: number;
  readonly kept: number;
  /** studio_paid_stop when the paid day's bucket refused the call. */
  readonly alerts: readonly StudioAlert[];
}

/** The pass runs for Uzbek paid decks while STUDIO_PAID_PROOFREAD is on. */
export function proofreadWanted(
  config: Pick<StudioConfig, "paidProofread">,
  locale: StudioLocale,
  source: LedgerSource,
): boolean {
  return locale === "uz" && source !== "free" && config.paidProofread;
}

const length = (text: string) => Array.from(text).length;
const digitRuns = (text: string) => (text.match(/\d+/g) ?? []).join(" ");
const SENTENCE = /[^.!?…]+[.!?…]+/g;
const sentences = (text: string) => text.match(SENTENCE)?.length ?? 0;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LINK = /https?:\/\/|www\./i;
const BRAND = /chatgpt|openai|(?<![\p{L}\p{N}])gpt(?![\p{L}\p{N}])/iu;

/** A corrected text is taken only if it keeps the original's numbers and stays near its length. */
export function acceptField(original: string, corrected: string, options: { readonly sentences?: boolean } = {}): boolean {
  if (!corrected || corrected === original) return corrected === original;
  if (digitRuns(corrected) !== digitRuns(original)) return false;
  const before = length(original);
  const after = length(corrected);
  if (after < before * PROOF_BOUNDS.minRatio - PROOF_BOUNDS.slackChars) return false;
  if (after > before * PROOF_BOUNDS.maxRatio + PROOF_BOUNDS.slackChars) return false;
  return !options.sentences || sentences(corrected) === sentences(original);
}

/** NFC, no control or format characters, single spaces, trimmed (as deck-schema.ts cleans every text). */
function cleanText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The cover's title or subtitle as corrected, or null when it cannot be
 * taken (not a string, too long, a link, Cyrillic, a brand the topic does
 * not name). Normalized as Uzbek, like every Uzbek text the server hands out.
 */
function coverField(value: unknown, max: number, context: CheckContext, fixes: Record<string, number>): string | null {
  if (typeof value !== "string") return null;
  const fixed = normalizeUz(cleanText(value));
  addFixes(fixes, fixed.fixes);
  const text = fixed.text;
  if (length(text) > max || LINK.test(text) || CYRILLIC.test(text)) return null;
  if (!BRAND.test(context.topic) && BRAND.test(text)) return null;
  return text;
}

/**
 * The proofreading answer for `original`, checked. The slides go through
 * checkPart (shape, lengths, Uzbek normalization, Cyrillic, links, brand)
 * against the original's plan indexes; then every field is taken or kept by
 * acceptField. A refused answer is one failed attempt of the step.
 */
export function checkProof(raw: unknown, original: ProofPart, context: CheckContext): Checked<ProofChecked> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, problems: ["not_object"] };
  const answer = raw as Record<string, unknown>;
  const indexes = original.slides.map((slide) => slide.index);
  const part = checkPart({ slides: answer.slides }, { ...context, indexes });
  if (!part.ok) return part;

  let changed = 0;
  let kept = 0;
  const pick = (before: string, after: string, options: { sentences?: boolean } = {}): string => {
    if (after === before) return before;
    if (acceptField(before, after, options)) {
      changed++;
      return after;
    }
    kept++;
    return before;
  };

  const keep = <T>(value: T): T => {
    kept++;
    return value;
  };

  const slides = original.slides.map((before, i): PartSlide => {
    const after = part.value.slides[i];
    const bullets = after.bullets.length === before.bullets.length
      ? before.bullets.map((bullet, at) => pick(bullet, after.bullets[at]))
      : keep([...before.bullets]);
    return {
      index: before.index,
      title: pick(before.title, after.title),
      bullets,
      notes: pick(before.notes, after.notes, { sentences: true }),
    };
  });

  const fixes: Record<string, number> = { ...part.fixes };
  const head: { title?: string; subtitle?: string } = {};
  if (original.title !== undefined) {
    const title = coverField(answer.title, DECK_LIMITS.deckTitle, context, fixes);
    head.title = title === null ? keep(original.title) : pick(original.title, title);
    const subtitle = coverField(answer.subtitle, DECK_LIMITS.subtitle, context, fixes);
    const before = original.subtitle ?? "";
    head.subtitle = subtitle === null ? keep(before) : pick(before, subtitle);
  }
  return { ok: true, value: { ...head, slides, changed, kept }, soft: part.soft, fixes };
}

export interface ProofreadInput {
  readonly env: LlmEnv;
  readonly config: StudioConfig;
  readonly db: D1Database;
  readonly job: LedgerJob;
  readonly context: CheckContext;
  readonly part: ProofPart;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof fetch;
}

/** The text the pass reads: the part's own fields (and the cover for the first part). */
export function proofTextOf(part: ProofPart): ProofText {
  return {
    ...(part.title !== undefined ? { title: part.title, subtitle: part.subtitle ?? "" } : {}),
    slides: part.slides.map((slide) => ({ index: slide.index, title: slide.title, bullets: slide.bullets, notes: slide.notes })),
  };
}

/**
 * One proofreading pass over `part`, metered on the job. Never throws and
 * never fails the part: anything but a checked answer gives the part back
 * as it was (status "failed").
 */
export async function proofreadPart(input: ProofreadInput): Promise<ProofOutcome> {
  const { part } = input;
  const meter = jobMeter(input.db, input.config, input.job, "proof");
  let outcome: ProofOutcome;
  try {
    const result = await runTextStep({
      env: input.env,
      config: input.config,
      tier: "paid",
      step: "proof",
      messages: proofMessages(proofTextOf(part)),
      check: (raw) => checkProof(raw, part, input.context),
      admit: meter.admit,
      signal: input.signal,
      ...(input.fetch ? { fetch: input.fetch } : {}),
    });
    await meter.settle(result.calls);
    if (result.ok) {
      const { changed, kept, ...corrected } = result.value;
      studioLog("studio_proof", changed ? "corrected" : "unchanged");
      outcome = { part: corrected, status: "proofread", changed, kept, alerts: meter.alerts };
    } else {
      studioLog("studio_proof", result.kind === "fault" ? result.fault : result.kind);
      outcome = { part, status: "failed", changed: 0, kept: 0, alerts: meter.alerts };
    }
  } catch {
    // runTextStep never throws for a provider's sake; this is D1 or a bug. The part goes out as written.
    studioLog("studio_proof", "error");
    outcome = { part, status: "failed", changed: 0, kept: 0, alerts: meter.alerts };
  }
  return outcome;
}

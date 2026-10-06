// What the presentation endpoints read and answer (spec §6, §7.1, §7.3).
//
// The server keeps no text of a deck: not the topic, not the slides
// (spec §4.1). A job row holds only input_mac, an HMAC of the task (the
// topic as normalizeTopic sees it, language, audience, slides, palette and
// kind). So the browser sends the task again with the request that needs it
// (the free deck's /slides; T3.1's parts), and the server accepts it only if
// it hashes to the job's input_mac: the model is never asked about anything
// but the task the unit was reserved for, and a job cannot be reused for
// another topic. The topic is cleaned once, here (prompts.ts cleanTopic),
// and that cleaned form is what the MAC, the filters and the prompt all see.
import { ensureBillingSchema } from "../gpt-chat/billing-schema";
import { ensureSchema } from "../gpt-chat/schema";
import type { StudioConfig } from "./config";
import { withLayouts, type DeckSlide, type FreeDeck } from "./deck-schema";
import { expiryOutcome } from "./jobs";
import { LedgerStore, REQUEST_ID, type LedgerJob } from "./ledger";
import { JobSpend } from "./spend";
import { DECK_SHAPES, type DeckShapeName } from "./plans";
import { cleanTopic, type StudioAudience, type StudioLocale } from "./prompts";
import { ensureStudioSchema } from "./schema";
import type { SignedImagePrompt } from "./sign";

/**
 * The tables a deck request touches, once per isolate: gpt_rate_limits (the
 * chat's bootstrap; no migration creates it), gpt_model_spend,
 * gpt_service_alerts and gpt_ui_events (the billing bootstrap, = 0064–0068)
 * and the studio's own (0073). Called only after the switches let the
 * request in, so a studio that is off never reaches D1.
 */
export async function ensureDeckSchema(db: D1Database): Promise<void> {
  await ensureSchema(db);
  await ensureBillingSchema(db);
  await ensureStudioSchema(db);
}

/** The topic, in characters after cleanTopic (spec §6: 3–200). */
export const TOPIC_MIN = 3;
export const TOPIC_MAX = 200;
/** A raw topic longer than this is refused before it is cleaned. */
const TOPIC_RAW_MAX = 400;
/** A Turnstile token is at most 2 048 characters. */
const TOKEN_MAX = 2048;

export const STUDIO_LOCALES: readonly StudioLocale[] = ["uz", "ru"];
export const STUDIO_AUDIENCES: readonly StudioAudience[] = ["maktab", "talaba", "umumiy"];
export const DECK_SHAPE_NAMES: readonly DeckShapeName[] = ["free", "full"];

/** What makes a deck: the fields the input_mac covers (ledger.ts DeckInput). */
export interface DeckTask {
  /** cleanTopic of what the person typed. */
  readonly topic: string;
  readonly locale: StudioLocale;
  readonly audience: StudioAudience;
  readonly slides: number;
  readonly palette: number;
  readonly shape: DeckShapeName;
}

export interface CreateRequest {
  readonly requestId: string;
  readonly task: DeckTask;
  /** Absent or "" when the browser sent none. */
  readonly turnstileToken: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** The slides a deck of `shape` may have under these settings (the full slider stops at STUDIO_MAX_SLIDES). */
export function slideRange(config: Pick<StudioConfig, "maxSlides">, shape: DeckShapeName): { readonly min: number; readonly max: number } {
  return shape === "free"
    ? { min: DECK_SHAPES.free.minSlides, max: DECK_SHAPES.free.maxSlides }
    : { min: DECK_SHAPES.full.minSlides, max: Math.min(config.maxSlides, DECK_SHAPES.full.maxSlides) };
}

/**
 * The deck task in `value`, or null unless every field is well formed. Only
 * topic, locale, audience, slides, palette (and shape, when `shape` is not
 * given) are read; anything else in the body is ignored.
 */
export function readDeckTask(value: unknown, config: Pick<StudioConfig, "maxSlides">, shape?: DeckShapeName): DeckTask | null {
  if (!isRecord(value)) return null;
  const kind = shape ?? oneOf(value.shape, DECK_SHAPE_NAMES);
  if (!kind) return null;
  if (typeof value.topic !== "string" || value.topic.length > TOPIC_RAW_MAX) return null;
  // cleanTopic cuts at 200; a longer topic is refused, never silently cut.
  if (Array.from(value.topic.normalize("NFC").replace(/\s+/g, " ").trim()).length > TOPIC_MAX) return null;
  const topic = cleanTopic(value.topic);
  const length = Array.from(topic).length;
  if (length < TOPIC_MIN || length > TOPIC_MAX) return null;
  const locale = oneOf(value.locale, STUDIO_LOCALES);
  const audience = oneOf(value.audience, STUDIO_AUDIENCES);
  if (!locale || !audience) return null;
  const { min, max } = slideRange(config, kind);
  const slides = value.slides;
  if (typeof slides !== "number" || !Number.isInteger(slides) || slides < min || slides > max) return null;
  const palette = value.palette;
  if (typeof palette !== "number" || !Number.isInteger(palette) || palette < 1 || palette > DECK_SHAPES[kind].palettes) return null;
  return { topic, locale, audience, slides, palette, shape: kind };
}

/** POST /api/studio/presentations: {requestId, topic, locale, audience, slides, shape, palette, turnstileToken?}. */
export function readCreateRequest(value: unknown, config: Pick<StudioConfig, "maxSlides">): CreateRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.requestId !== "string" || !REQUEST_ID.test(value.requestId)) return null;
  const token = value.turnstileToken;
  if (token !== undefined && token !== null && (typeof token !== "string" || token.length > TOKEN_MAX)) return null;
  const task = readDeckTask(value, config);
  return task ? { requestId: value.requestId, task, turnstileToken: typeof token === "string" ? token : "" } : null;
}

/** How far back a start looks for the person's own expired jobs (a job lives 15 minutes at most). */
export const OWN_EXPIRY_LOOKBACK_MS = 24 * 3_600_000;

/**
 * Closes the person's own expired open jobs by the expiry rules of spec §2.3
 * item 5 (jobs.ts expiryOutcome), through the same guarded transitions the
 * site-wide sweep uses (jobs.ts expireDueJobs, run by the maintenance tick
 * from T4.3 on), so a unit comes back exactly once whoever gets there
 * first. Run at a new start, it gives a person whose last job faulted or
 * was never written their unit back before the free day's counter is read,
 * even while no sweep runs. One indexed read (≤ 20 rows); a close only for
 * an expired job. Never throws: the start goes on either way.
 */
export async function expireOwnJobs(db: D1Database, subject: string, now: number): Promise<number> {
  const store = new LedgerStore(db);
  let closed = 0;
  try {
    const recent = await store.recent(subject, now - OWN_EXPIRY_LOOKBACK_MS);
    for (const row of recent) {
      if ((row.state !== "reserved" && row.state !== "delivering") || row.expiresAt > now) continue;
      const job = await store.get(row.id);
      if (!job || job.subject !== subject) continue;
      const outcome = expiryOutcome(job);
      const changed = outcome.kind === "done" ? await store.expireDone(job.id, now) : await store.close(job, "released", outcome.reason, now);
      if (changed) closed++;
      if (job.reservedMicro > 0) await new JobSpend(db, job).convertOpen();
    }
  } catch {
    // The expiry sweep closes whatever is left.
  }
  return closed;
}

/** The 201 answer of a created (or replayed) job. */
export function createdAnswer(job: Pick<LedgerJob, "id" | "source" | "entitlementId" | "partsTotal" | "expiresAt">, task: DeckTask) {
  const shape = DECK_SHAPES[task.shape];
  return {
    ok: true as const,
    jobId: job.id,
    source: job.source,
    ...(job.entitlementId ? { entitlementId: job.entitlementId } : {}),
    shape: { slides: task.slides, images: shape.images, notes: shape.notes, palette: task.palette, parts: job.partsTotal },
    next: task.shape === "free" ? ("slides" as const) : ("outline" as const),
    expiresAt: new Date(job.expiresAt).toISOString(),
  };
}

export interface FreeDeckContent {
  /** The free deck is one part. */
  readonly part: 1;
  readonly deck: { readonly title: string; readonly subtitle: string; readonly slides: readonly DeckSlide[] };
  /** The signed prompts the browser may draw (≤ 2), in slide order. */
  readonly images: readonly SignedImagePrompt[];
}

/** The free deck as the browser gets it: no image prompts inside the slides, a layout per slide. */
export function freeDeckContent(deck: FreeDeck, images: readonly SignedImagePrompt[]): FreeDeckContent {
  const pictured = new Set(images.map((image) => image.index));
  const slides = withLayouts(
    deck.slides.map((slide) => ({ index: slide.index, title: slide.title, bullets: slide.bullets })),
    pictured,
  );
  return { part: 1, deck: { title: deck.title, subtitle: deck.subtitle, slides }, images };
}

/**
 * The free deck from submit to pictures (STUDIO-SPEC §6, §7.1), without
 * React, so the order of calls can be tested in node with a fake API.
 *
 *   1. /config and /me (asked on the first focus; awaited here). The studio
 *      off, the free deck off or no Turnstile key → "busy", nothing else is
 *      called. No free deck left today → the limit, without Turnstile; when
 *      an open job still holds it (/me openUntil) → "try after HH:MM", not
 *      "used for today": it comes back when that job expires.
 *   2. No identity → Turnstile `studio_identity` → POST /identity.
 *   3. Turnstile `studio_free_deck` → POST /presentations with a fresh
 *      request id. No answer → once more with the SAME id and token (the
 *      server answers the job it made, before it checks Turnstile).
 *      401 identity_required (the cookie was lost) → step 2, then once more.
 *   4. POST /:job/slides with the task, the same job up to SLIDES_CALLS
 *      times: again after a fault the server marks `retry`, and again when
 *      the request got no answer (`network`, `timeout`: a locked phone, a
 *      switched app), unless the person cancelled. The server's own cap of
 *      calls still applies. A retry the server answers `job_state` after a
 *      lost answer means the job closed or was delivered to the lost
 *      request: `job_lost`, not "busy". After any failure once the job
 *      exists, /me is asked again on the next try (refreshMe).
 *   5. The deck is shown; the pictures (/:job/images, the signed prompts the
 *      deck came with) are drawn in parallel, each redrawn once after
 *      image_refused / image_failed / no answer, then the slide goes
 *      without. PICTURE_DEADLINE_MS after the deck, whatever is still being
 *      drawn goes without too, so the file can be saved. A picture never
 *      costs the person anything.
 */
import type { CreatedJob, Deck, DeckSlide, DeckTask, Result, SignedImagePrompt, StudioApi, StudioAudience, StudioLocale } from '../../api';
import type { StudioSession } from '../../config';
import { obtainIdentity, type StudioTurnstileAction, type TokenResult } from '../../identity';
import { fullUnitsLeft, type FullDeckApi, type OutlineAnswer, type PartAnswer } from './api';

export const TOPIC_MIN = 3;
export const TOPIC_MAX = 200;
export const FREE_SLIDES = { min: 4, max: 6, initial: 6 } as const;
export const FREE_PALETTE = 1;
/** Pictures drawn at the same time (the server caps a free deck at 2 anyway). */
export const PICTURE_CONCURRENCY = 4;
/** Calls of /:job/slides for one job at most (the server caps the model calls at 4). */
export const SLIDES_CALLS = 3;
/**
 * After the deck arrives, pictures not drawn by then are skipped and the file
 * can be saved (functions/lib/studio/safety.ts IMAGE_RULES.deadlineAfterOutlineMs;
 * tests/studio-island.test.ts holds them equal).
 */
export const PICTURE_DEADLINE_MS = 35_000;

export interface FormInput {
  readonly topic: string;
  readonly audience: StudioAudience;
  readonly slides: number;
}

/**
 * The topic as the server cleans it (functions/lib/studio/prompts.ts
 * cleanTopic, without its cut at 200: a longer topic is refused, never cut).
 */
export function normalizeTopic(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
}

/** The reason a topic cannot be sent, or null: 3–200 characters, as the server counts them. */
export function topicProblem(raw: string): 'topic_length' | null {
  const length = Array.from(normalizeTopic(raw)).length;
  const sent = Array.from(raw.normalize('NFC').replace(/\s+/g, ' ').trim()).length;
  return length < TOPIC_MIN || length > TOPIC_MAX || sent > TOPIC_MAX ? 'topic_length' : null;
}

export type Phase = 'check' | 'write';

/**
 * `free_closed`: the server's studio_busy that lasts the rest of the free day
 * (the ramp is full, the budget spent): it carries the reset time.
 */
export type LimitCode = 'free_limit' | 'ip_ceiling' | 'try_later' | 'free_closed';

export type StartOutcome =
  | { readonly kind: 'ready'; readonly job: CreatedJob; readonly task: DeckTask; readonly deck: Deck; readonly images: readonly SignedImagePrompt[]; readonly aiLabel: boolean }
  | { readonly kind: 'limit'; readonly code: LimitCode; readonly resetsAt?: string }
  | { readonly kind: 'refused'; readonly category?: string }
  /** job_in_progress carries when the open job expires (resetsAt). */
  | { readonly kind: 'error'; readonly code: string; readonly resetsAt?: string };

export interface StartDeps {
  readonly api: Pick<StudioApi, 'identity' | 'createPresentation' | 'freeSlides'>;
  /** refreshMe: after a failure once a job exists, the next try reads /me again. */
  readonly session: Pick<StudioSession, 'config' | 'me'> & Partial<Pick<StudioSession, 'refreshMe'>>;
  /** A fresh Turnstile token for `action` with this site key. */
  readonly token: (action: StudioTurnstileAction, siteKey: string) => Promise<TokenResult>;
  readonly requestId: () => string;
  readonly onPhase?: (phase: Phase) => void;
  readonly signal?: AbortSignal;
}

const LIMIT_CODES = new Set(['free_limit', 'ip_ceiling', 'try_later']);
const LOST = new Set(['network', 'timeout']);

function outcomeOf(failure: Extract<Result<unknown>, { ok: false }>): StartOutcome {
  const resetsAt = failure.resetsAt ? { resetsAt: failure.resetsAt } : {};
  if (LIMIT_CODES.has(failure.code)) return { kind: 'limit', code: failure.code as LimitCode, ...resetsAt };
  // A studio_busy with a reset time lasts the day: say so, never "shortly".
  if (failure.code === 'studio_busy' && failure.resetsAt) return { kind: 'limit', code: 'free_closed', resetsAt: failure.resetsAt };
  if (failure.code === 'topic_refused') return { kind: 'refused', ...(failure.category ? { category: failure.category } : {}) };
  return { kind: 'error', code: failure.code, ...resetsAt };
}

/** A request id the ledger accepts (REQUEST_ID: [A-Za-z0-9_-]{8,64}). */
export function newRequestId(random: () => string): string {
  return `r_${random().replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 64);
}

export async function startFreeDeck(input: FormInput, locale: StudioLocale, deps: StartDeps): Promise<StartOutcome> {
  const problem = topicProblem(input.topic);
  if (problem) return { kind: 'error', code: problem };
  const task: DeckTask = {
    topic: normalizeTopic(input.topic),
    locale,
    audience: input.audience,
    slides: Math.min(FREE_SLIDES.max, Math.max(FREE_SLIDES.min, Math.round(input.slides))),
    palette: FREE_PALETTE,
  };

  deps.onPhase?.('check');
  const config = await deps.session.config();
  if (!config.ok) return { kind: 'error', code: config.code };
  const siteKey = config.data.turnstileSiteKey;
  if (!config.data.tools.freeDeck || !siteKey) return { kind: 'error', code: 'studio_busy' };
  const me = await deps.session.me();
  if (me.ok && me.data.free.presentation.left <= 0) {
    // A job of this person still holds today's unit: it comes back when the job expires.
    const openUntil = me.data.free.presentation.openUntil;
    return openUntil ? { kind: 'error', code: 'job_in_progress', resetsAt: openUntil } : { kind: 'limit', code: 'free_limit' };
  }

  const token = (action: StudioTurnstileAction) => deps.token(action, siteKey);
  if (!me.ok || !me.data.identity) {
    const identity = await obtainIdentity(deps.api, token);
    if (!identity.ok) return { kind: 'error', code: identity.code };
  }

  const pass = await token('studio_free_deck');
  if (!pass.ok) return { kind: 'error', code: pass.code };
  const body = { ...task, requestId: deps.requestId(), shape: 'free' as const, turnstileToken: pass.token };
  const options = { signal: deps.signal };
  let created = await deps.api.createPresentation(body, options);
  if (!created.ok && (created.code === 'network' || created.code === 'timeout')) created = await deps.api.createPresentation(body, options);
  if (!created.ok && created.code === 'identity_required') {
    const identity = await obtainIdentity(deps.api, token);
    if (!identity.ok) return { kind: 'error', code: identity.code };
    created = await deps.api.createPresentation(body, options);
  }
  if (!created.ok) return outcomeOf(created);

  deps.onPhase?.('write');
  const job = created.data;
  let slides = await deps.api.freeSlides(job.jobId, task, options);
  let lost = false;
  for (let calls = 1; !slides.ok && calls < SLIDES_CALLS && !deps.signal?.aborted; calls++) {
    const dropped = LOST.has(slides.code);
    if (!dropped && slides.retry !== true) break;
    lost ||= dropped;
    slides = await deps.api.freeSlides(job.jobId, task, options);
  }
  if (!slides.ok) {
    // The job exists: its unit is held (or given back) on the server; the next try asks /me again.
    deps.session.refreshMe?.();
    // After an answer was lost, job_state means the job closed or went to that lost request.
    if (lost && slides.code === 'job_state') return { kind: 'error', code: 'job_lost' };
    return outcomeOf(slides);
  }
  return { kind: 'ready', job, task, deck: slides.data.deck, images: slides.data.images, aiLabel: config.data.aiLabel };
}

const REDRAW = new Set(['image_refused', 'image_failed', 'network', 'timeout', 'studio_busy']);

/**
 * Draws every picture of a deck, at most PICTURE_CONCURRENCY at a time;
 * `onPicture` gets each slide's bytes, or null when it stays without one,
 * exactly once per picture. It resolves when every picture is settled, or
 * `deadlineMs` after the call (PICTURE_DEADLINE_MS): then the pictures still
 * being drawn are cancelled and settle as null, and a late answer is
 * ignored, so the file never waits longer. `signal` (a newer deck replaced
 * this one) cancels the rest the same way.
 */
export async function drawPictures(
  api: Pick<StudioApi, 'image'>,
  jobId: string,
  images: readonly SignedImagePrompt[],
  onPicture: (index: number, picture: Blob | null) => void,
  signal?: AbortSignal,
  deadlineMs: number = PICTURE_DEADLINE_MS,
): Promise<void> {
  // The run's own signal: the caller's, or the deadline, whichever comes first.
  const stop = new AbortController();
  const onAbort = () => stop.abort();
  if (signal?.aborted) stop.abort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const settled = new Set<number>();
  const settle = (index: number, picture: Blob | null) => {
    if (settled.has(index)) return;
    settled.add(index);
    onPicture(index, picture);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      stop.abort();
      resolve();
    }, deadlineMs);
  });
  const queue = [...images];
  const worker = async () => {
    for (let image = queue.shift(); image; image = queue.shift()) {
      if (stop.signal.aborted) break;
      let result = await api.image(jobId, image, { signal: stop.signal });
      if (!result.ok && REDRAW.has(result.code) && !stop.signal.aborted) result = await api.image(jobId, image, { signal: stop.signal });
      if (!stop.signal.aborted) settle(image.index, result.ok ? result.data : null);
    }
  };
  try {
    await Promise.race([Promise.all(Array.from({ length: Math.min(PICTURE_CONCURRENCY, images.length) }, worker)), deadline]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    stop.abort();
  }
  // Whatever is still being drawn goes without.
  for (const image of images) settle(image.index, null);
}

// ── The full deck (T3.1) ─────────────────────────────────────────────────────
//
//   1. /config (the full deck on) and /me (full decks left; none → the
//      tariffs, nothing else is called).
//   2. POST /presentations {shape:"full"} with a fresh request id, no
//      Turnstile (paid generations go by the buyer's session); no answer →
//      once more with the SAME id. 402 no_units → the tariffs.
//      A regeneration: POST /:job/regenerate of the original instead.
//   3. POST /:job/outline with the task, up to OUTLINE_CALLS times (again
//      after a fault the server marks `retry`, or no answer). The signed
//      picture prompts come with it: `onOutline` starts the pictures now,
//      while the parts are written.
//   4. POST /:job/slides {part, outline, sig} for every part AT ONCE, each
//      up to PART_CALLS times the same way. A part that still fails ends
//      the run: the job keeps the fault, so its unit comes back.
//   5. The deck: the cover from part 1 (proofread with it on a paid Uzbek
//      deck), the slides of every part in plan order.

export const FULL_PALETTES: readonly number[] = [1, 2, 3];
/** The full deck's slider starts here (or at the most STUDIO_MAX_SLIDES allows). */
export const FULL_SLIDES_INITIAL = 12;
/** Calls of /:job/outline for one job at most (the server caps the model calls anyway). */
export const OUTLINE_CALLS = 3;
/** Calls of /:job/slides for one part at most. */
export const PART_CALLS = 3;

export interface FullInput extends FormInput {
  readonly palette: number;
}

export type FullPhase = 'check' | 'outline' | 'write';

export interface FullProgress {
  readonly phase: FullPhase;
  /** Parts written so far, and how many there are (0 until the outline is in). */
  readonly partsDone: number;
  readonly parts: number;
}

export type FullOutcome =
  | {
      readonly kind: 'ready';
      readonly job: CreatedJob;
      readonly task: DeckTask;
      readonly deck: Deck;
      readonly images: readonly SignedImagePrompt[];
      readonly aiLabel: boolean;
      /** Set for a regeneration: the job it made again. */
      readonly regenOf?: string;
    }
  /** No full deck left (or never bought): the island shows the tariffs. */
  | { readonly kind: 'no_units' }
  | { readonly kind: 'refused'; readonly category?: string }
  /** `afterJob`: the job existed (the plan or a part failed): a server fault there gives the unit back. */
  | { readonly kind: 'error'; readonly code: string; readonly resetsAt?: string; readonly afterJob?: boolean };

export interface FullDeps {
  readonly api: Pick<StudioApi, 'createPresentation'>;
  readonly full: FullDeckApi;
  readonly session: Pick<StudioSession, 'config' | 'me'> & Partial<Pick<StudioSession, 'refreshMe'>>;
  readonly requestId: () => string;
  readonly onProgress?: (progress: FullProgress) => void;
  /** The outline is in: its signed picture prompts may be drawn now. */
  readonly onOutline?: (jobId: string, images: readonly SignedImagePrompt[]) => void;
  readonly signal?: AbortSignal;
}

function fullFailure(failure: Extract<Result<unknown>, { ok: false }>, lost = false, afterJob = false): FullOutcome {
  if (failure.code === 'no_units') return { kind: 'no_units' };
  if (failure.code === 'topic_refused') return { kind: 'refused', ...(failure.category ? { category: failure.category } : {}) };
  const job = afterJob ? { afterJob: true } : {};
  // After an answer was lost, job_state means the job closed or went to that lost request.
  if (lost && failure.code === 'job_state') return { kind: 'error', code: 'job_lost', ...job };
  return { kind: 'error', code: failure.code, ...(failure.resetsAt ? { resetsAt: failure.resetsAt } : {}), ...job };
}

/**
 * Calls `once` up to `calls` times: again after a fault the server marks
 * `retry`, and again when the request got no answer, unless the run was
 * cancelled. `lost` tells whether an answer went missing on the way.
 */
async function withRetries<T>(once: () => Promise<Result<T>>, calls: number, signal?: AbortSignal): Promise<{ readonly result: Result<T>; readonly lost: boolean }> {
  let result = await once();
  let lost = false;
  for (let call = 1; !result.ok && call < calls && !signal?.aborted; call++) {
    const dropped = LOST.has(result.code);
    if (!dropped && result.retry !== true) break;
    lost ||= dropped;
    result = await once();
  }
  return { result, lost };
}

/** The deck of a run: the cover from part 1 (or the outline), the slides of every part in plan order. */
export function assembleDeck(outline: OutlineAnswer['outline'], parts: readonly PartAnswer[]): Deck {
  const first = parts.find((part) => part.part === 1);
  const slides: DeckSlide[] = parts.flatMap((part) => [...part.deck.slides]).sort((a, b) => a.index - b.index);
  return {
    title: first?.deck.title || outline.title,
    subtitle: first?.deck.subtitle ?? outline.subtitle,
    slides,
  };
}

/** Steps 3–5 for a job that exists (a start or a regeneration). */
async function runFullJob(job: CreatedJob, task: DeckTask, aiLabel: boolean, deps: FullDeps, regenOf?: string): Promise<FullOutcome> {
  const options = { signal: deps.signal };
  deps.onProgress?.({ phase: 'outline', partsDone: 0, parts: 0 });
  const outline = await withRetries(() => deps.full.outline(job.jobId, task, options), OUTLINE_CALLS, deps.signal);
  if (!outline.result.ok) {
    deps.session.refreshMe?.();
    return fullFailure(outline.result, outline.lost, true);
  }
  const { outline: plan, sig, images, parts } = outline.result.data;
  deps.onOutline?.(job.jobId, images);
  let done = 0;
  deps.onProgress?.({ phase: 'write', partsDone: 0, parts });
  const runs = Array.from({ length: parts }, async (_, i) => {
    const run = await withRetries(() => deps.full.part(job.jobId, task, i + 1, plan, sig, options), PART_CALLS, deps.signal);
    if (run.result.ok) deps.onProgress?.({ phase: 'write', partsDone: ++done, parts });
    return run;
  });
  const results = await Promise.all(runs);
  deps.session.refreshMe?.();
  for (const run of results) {
    // The job keeps the fault: its unit comes back. The next try reads /me again.
    if (!run.result.ok) return fullFailure(run.result, run.lost, true);
  }
  const answers = results.flatMap((run) => (run.result.ok ? [run.result.data] : []));
  return { kind: 'ready', job, task, deck: assembleDeck(plan, answers), images, aiLabel, ...(regenOf ? { regenOf } : {}) };
}

/** The task of a full deck from the form, inside what /config allows. */
export function fullTask(input: FullInput, locale: StudioLocale, maxSlides: number, minSlides = 6): DeckTask {
  const top = Math.max(minSlides, maxSlides);
  return {
    topic: normalizeTopic(input.topic),
    locale,
    audience: input.audience,
    slides: Math.min(top, Math.max(minSlides, Math.round(input.slides))),
    palette: FULL_PALETTES.includes(input.palette) ? input.palette : 1,
  };
}

export async function startFullDeck(input: FullInput, locale: StudioLocale, deps: FullDeps): Promise<FullOutcome> {
  const problem = topicProblem(input.topic);
  if (problem) return { kind: 'error', code: problem };
  deps.onProgress?.({ phase: 'check', partsDone: 0, parts: 0 });
  const config = await deps.session.config();
  if (!config.ok) return { kind: 'error', code: config.code };
  if (!config.data.tools.fullDeck) return { kind: 'error', code: 'studio_busy' };
  const me = await deps.session.me();
  if (me.ok && fullUnitsLeft(me.data) === 0) return { kind: 'no_units' };

  const full = config.data.shapes.full;
  const task = fullTask(input, locale, full.maxSlides, full.minSlides);
  const body = { ...task, requestId: deps.requestId(), shape: 'full' as const, turnstileToken: '' };
  const options = { signal: deps.signal };
  let created = await deps.api.createPresentation(body, options);
  if (!created.ok && LOST.has(created.code)) created = await deps.api.createPresentation(body, options);
  if (!created.ok) return fullFailure(created);
  return runFullJob(created.data, task, config.data.aiLabel, deps);
}

/** One regeneration of a full deck the buyer made: the same task, a new job (no unit). */
export async function regenerateFullDeck(original: { readonly jobId: string; readonly task: DeckTask }, deps: FullDeps): Promise<FullOutcome> {
  deps.onProgress?.({ phase: 'check', partsDone: 0, parts: 0 });
  const config = await deps.session.config();
  if (!config.ok) return { kind: 'error', code: config.code };
  if (!config.data.tools.fullDeck) return { kind: 'error', code: 'studio_busy' };
  const body = { ...original.task, requestId: deps.requestId(), shape: 'full' as const };
  const options = { signal: deps.signal };
  let created = await deps.full.regenerate(original.jobId, body, options);
  if (!created.ok && LOST.has(created.code)) created = await deps.full.regenerate(original.jobId, body, options);
  if (!created.ok) return fullFailure(created);
  return runFullJob(created.data, original.task, config.data.aiLabel, deps, original.jobId);
}

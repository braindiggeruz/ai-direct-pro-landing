/**
 * The free deck from submit to pictures (STUDIO-SPEC §6, §7.1), without
 * React, so the order of calls can be tested in node with a fake API.
 *
 *   1. /config and /me (asked on the first focus; awaited here). The studio
 *      off, the free deck off or no Turnstile key → "busy", nothing else is
 *      called. No free deck left today → the limit, without Turnstile.
 *   2. No identity → Turnstile `studio_identity` → POST /identity.
 *   3. Turnstile `studio_free_deck` → POST /presentations with a fresh
 *      request id. No answer → once more with the SAME id and token (the
 *      server answers the job it made, before it checks Turnstile).
 *      401 identity_required (the cookie was lost) → step 2, then once more.
 *   4. POST /:job/slides with the task. A fault the server marks `retry`
 *      → once more (the server's own cap of calls still applies).
 *   5. The deck is shown; the pictures (/:job/images, the signed prompts the
 *      deck came with) are drawn in parallel, each redrawn once after
 *      image_refused / image_failed / no answer, then the slide goes
 *      without. A picture never costs the person anything.
 */
import type { CreatedJob, Deck, DeckTask, Result, SignedImagePrompt, StudioApi, StudioAudience, StudioLocale } from '../../api';
import type { StudioSession } from '../../config';
import { obtainIdentity, type StudioTurnstileAction, type TokenResult } from '../../identity';

export const TOPIC_MIN = 3;
export const TOPIC_MAX = 200;
export const FREE_SLIDES = { min: 4, max: 6, initial: 6 } as const;
export const FREE_PALETTE = 1;
/** Pictures drawn at the same time (the server caps a free deck at 2 anyway). */
export const PICTURE_CONCURRENCY = 4;

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

export type StartOutcome =
  | { readonly kind: 'ready'; readonly job: CreatedJob; readonly task: DeckTask; readonly deck: Deck; readonly images: readonly SignedImagePrompt[]; readonly aiLabel: boolean }
  | { readonly kind: 'limit'; readonly code: 'free_limit' | 'ip_ceiling' | 'try_later'; readonly resetsAt?: string }
  | { readonly kind: 'refused'; readonly category?: string }
  | { readonly kind: 'error'; readonly code: string };

export interface StartDeps {
  readonly api: Pick<StudioApi, 'identity' | 'createPresentation' | 'freeSlides'>;
  readonly session: Pick<StudioSession, 'config' | 'me'>;
  /** A fresh Turnstile token for `action` with this site key. */
  readonly token: (action: StudioTurnstileAction, siteKey: string) => Promise<TokenResult>;
  readonly requestId: () => string;
  readonly onPhase?: (phase: Phase) => void;
  readonly signal?: AbortSignal;
}

const LIMIT_CODES = new Set(['free_limit', 'ip_ceiling', 'try_later']);

function outcomeOf(failure: Extract<Result<unknown>, { ok: false }>): StartOutcome {
  if (LIMIT_CODES.has(failure.code)) {
    return { kind: 'limit', code: failure.code as 'free_limit' | 'ip_ceiling' | 'try_later', ...(failure.resetsAt ? { resetsAt: failure.resetsAt } : {}) };
  }
  if (failure.code === 'topic_refused') return { kind: 'refused', ...(failure.category ? { category: failure.category } : {}) };
  return { kind: 'error', code: failure.code };
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
  if (me.ok && me.data.free.presentation.left <= 0) return { kind: 'limit', code: 'free_limit' };

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
  if (!slides.ok && slides.retry === true) slides = await deps.api.freeSlides(job.jobId, task, options);
  if (!slides.ok) return outcomeOf(slides);
  return { kind: 'ready', job, task, deck: slides.data.deck, images: slides.data.images, aiLabel: config.data.aiLabel };
}

const REDRAW = new Set(['image_refused', 'image_failed', 'network', 'timeout', 'studio_busy']);

/**
 * Draws every picture of a deck, at most PICTURE_CONCURRENCY at a time;
 * `onPicture` gets each slide's bytes, or null when it stays without one.
 */
export async function drawPictures(
  api: Pick<StudioApi, 'image'>,
  jobId: string,
  images: readonly SignedImagePrompt[],
  onPicture: (index: number, picture: Blob | null) => void,
  signal?: AbortSignal,
): Promise<void> {
  const queue = [...images];
  const worker = async () => {
    for (let image = queue.shift(); image; image = queue.shift()) {
      let result = await api.image(jobId, image, { signal });
      if (!result.ok && REDRAW.has(result.code) && !signal?.aborted) result = await api.image(jobId, image, { signal });
      onPicture(image.index, result.ok ? result.data : null);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PICTURE_CONCURRENCY, images.length) }, worker));
}

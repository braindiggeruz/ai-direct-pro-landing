/**
 * The full deck's own calls (STUDIO-SPEC §6, §7.1; functions/lib/studio/
 * full-deck.ts): the outline, the parts and the regeneration. The start
 * (POST /presentations with shape "full") and the pictures are the shared
 * api.ts calls.
 *
 * Same rules as api.ts: same-origin relative paths only, cookies
 * `same-origin` (the Studio account's session cookie goes with them), every
 * call resolves and never rejects, a failure is `{ ok: false, code }` with
 * the server's code or the browser's own (`network`, `timeout`, `aborted`).
 * The topic and the outline travel only in these bodies; nothing is logged.
 */
import { JOB_ID, STUDIO_API_BASE, type CallOptions, type CreatedJob, type DeckSlide, type DeckTask, type Failure, type Result, type SignedImagePrompt } from '../../api';

/** The outline as the server signed it: titles and key points, no picture prompts. */
export interface SignedOutline {
  readonly title: string;
  readonly subtitle: string;
  readonly slides: ReadonlyArray<{ readonly index: number; readonly title: string; readonly point: string }>;
}

/** POST /:job/outline. */
export interface OutlineAnswer {
  readonly outline: SignedOutline;
  readonly sig: string;
  readonly images: readonly SignedImagePrompt[];
  /** Slide parts to ask for: 1..parts. */
  readonly parts: number;
}

/** POST /:job/slides of a full deck: one part; part 1 also carries the cover. */
export interface PartAnswer {
  readonly part: number;
  readonly deck: { readonly title?: string; readonly subtitle?: string; readonly slides: readonly DeckSlide[] };
  readonly done: boolean;
}

/** POST /:job/regenerate: a new job of the same task. */
export interface RegeneratedJob extends CreatedJob {
  readonly regenOf: string;
}

export interface RegenerateBody extends DeckTask {
  readonly requestId: string;
  readonly shape: 'full';
}

/**
 * How long each call may take (ms). The server makes at most 2 model calls
 * of ≤ 45 s for the outline (plus the Llama Guard check), and for a part 2
 * calls plus, for a paid Uzbek deck, 2 of the proofreading pass.
 */
export const FULL_TIMEOUTS = {
  outline: 120_000,
  part: 200_000,
  regenerate: 30_000,
} as const;

export interface FullDeckApi {
  outline(jobId: string, task: DeckTask, options?: CallOptions): Promise<Result<OutlineAnswer>>;
  part(jobId: string, task: DeckTask, part: number, outline: SignedOutline, sig: string, options?: CallOptions): Promise<Result<PartAnswer>>;
  regenerate(jobId: string, body: RegenerateBody, options?: CallOptions): Promise<Result<RegeneratedJob>>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const CODE = /^[a-z][a-z0-9_]{1,40}$/;

function codeFromStatus(status: number): string {
  if (status === 404) return 'not_found';
  if (status === 402) return 'no_units';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'studio_busy';
  return 'invalid';
}

async function failureOf(response: Response): Promise<Failure> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not the studio's JSON: the status says enough.
  }
  const fields = isRecord(body) ? body : {};
  const retryAfter = Number(response.headers.get('Retry-After'));
  return {
    ok: false,
    status: response.status,
    code: typeof fields.code === 'string' && CODE.test(fields.code) ? fields.code : codeFromStatus(response.status),
    ...(typeof fields.retry === 'boolean' ? { retry: fields.retry } : {}),
    ...(typeof fields.resetsAt === 'string' ? { resetsAt: fields.resetsAt } : {}),
    ...(typeof fields.category === 'string' && CODE.test(fields.category) ? { category: fields.category } : {}),
    ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {}),
  };
}

/** Exactly the task's fields: the server hashes them against the job's input_mac. */
const taskFields = (task: DeckTask): DeckTask => ({ topic: task.topic, locale: task.locale, audience: task.audience, slides: task.slides, palette: task.palette });

const isSlide = (value: unknown): boolean =>
  isRecord(value) && typeof value.index === 'number' && typeof value.title === 'string' && Array.isArray(value.bullets);

export function createFullDeckApi(fetchImpl?: Fetch, timeouts: typeof FULL_TIMEOUTS = FULL_TIMEOUTS): FullDeckApi {
  const doFetch: Fetch = fetchImpl ?? ((input, init) => fetch(input, init));

  async function post<T>(path: string, body: unknown, timeout: number, signal: AbortSignal | undefined, accept: (data: Record<string, unknown>) => T | null): Promise<Result<T>> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    let response: Response;
    try {
      response = await doFetch(STUDIO_API_BASE + path, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) return await failureOf(response);
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        return { ok: false, status: response.status, code: 'invalid_output' };
      }
      const value = isRecord(data) && data.ok === true ? accept(data) : null;
      return value === null ? { ok: false, status: response.status, code: 'invalid_output' } : { ok: true, status: response.status, data: value };
    } catch {
      return { ok: false, status: 0, code: timedOut ? 'timeout' : signal?.aborted ? 'aborted' : 'network' };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  const badJob: Failure = { ok: false, status: 0, code: 'invalid' };

  return {
    outline: (jobId, task, options) => {
      if (!JOB_ID.test(jobId)) return Promise.resolve(badJob);
      return post(`presentations/${jobId}/outline`, taskFields(task), timeouts.outline, options?.signal, (data) =>
        isRecord(data.outline) && Array.isArray(data.outline.slides) && typeof data.sig === 'string' && Array.isArray(data.images) && typeof data.parts === 'number'
          ? (data as unknown as OutlineAnswer)
          : null,
      );
    },
    part: (jobId, task, part, outline, sig, options) => {
      if (!JOB_ID.test(jobId)) return Promise.resolve(badJob);
      return post(`presentations/${jobId}/slides`, { ...taskFields(task), part, outline, sig }, timeouts.part, options?.signal, (data) =>
        typeof data.part === 'number' && isRecord(data.deck) && Array.isArray(data.deck.slides) && data.deck.slides.every(isSlide)
          ? (data as unknown as PartAnswer)
          : null,
      );
    },
    regenerate: (jobId, body, options) => {
      if (!JOB_ID.test(jobId)) return Promise.resolve(badJob);
      const sent = { ...taskFields(body), requestId: body.requestId, shape: 'full' as const };
      return post(`presentations/${jobId}/regenerate`, sent, timeouts.regenerate, options?.signal, (data) =>
        typeof data.jobId === 'string' && JOB_ID.test(data.jobId) && isRecord(data.shape) ? (data as unknown as RegeneratedJob) : null,
      );
    },
  };
}

/**
 * Full decks the buyer has left, from /me (T3.2: `entitlements[].presentationsLeft`),
 * or null when /me says nothing about it (the paid part is off, or unknown):
 * the server then decides (402 no_units).
 */
export function fullUnitsLeft(me: unknown): number | null {
  if (!isRecord(me) || !Array.isArray(me.entitlements)) return null;
  let left = 0;
  for (const entitlement of me.entitlements) {
    if (isRecord(entitlement) && typeof entitlement.presentationsLeft === 'number' && entitlement.presentationsLeft > 0) left += Math.floor(entitlement.presentationsLeft);
  }
  return left;
}

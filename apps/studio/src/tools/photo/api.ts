/**
 * The photo tool's browser side without React (T3.3; spec §8.1): the
 * one-time consent kept in localStorage, the picture shrunk through a
 * canvas (which also drops EXIF), and the multipart call to
 * POST /api/studio/photo. Same origin only, cookies same-origin, no-store.
 *
 * Every call resolves, never rejects: a failure is `{ ok: false, code }`
 * with the server's code (functions/lib/studio/http.ts) or one of the
 * browser's own (`network`, `timeout`, `aborted`). Nothing of the picture
 * is logged or kept once the answer is in.
 */
/// <reference lib="dom" />
import type { Failure, Result, StudioLocale } from '../../api';
import { STUDIO_API_BASE } from '../../api';
import type { PhotoModeChoice } from './texts';

/** The consent the person gives once (functions/lib/studio/photo.ts PHOTO_CONSENT_VERSION). */
export const PHOTO_CONSENT_VERSION = 'photo-v1';
/** localStorage: the consent version given in this browser (spec §8.1 item 1). */
export const PHOTO_CONSENT_KEY = 'studio-photo-consent';
/** The longest side after shrinking (spec §8.1 item 3). */
export const PHOTO_MAX_SIDE = 1600;
/** JPEG quality steps: 0.8 first, lower only when the file is still over the target. */
export const PHOTO_QUALITIES: readonly number[] = [0.8, 0.7, 0.6, 0.5];
/** What the shrunk file should weigh at most (spec §8.1: ≈ 600 KB). */
export const PHOTO_TARGET_BYTES = 600_000;
/** What the server accepts at most (functions/lib/studio/image-meta.ts MAX_PHOTO_BYTES). */
export const PHOTO_MAX_BYTES = 1_048_576;
export const PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
/** The whole call: shrinking is done before; the server makes at most three model calls of ≤ 45 s. */
export const PHOTO_TIMEOUT_MS = 120_000;

export type PhotoSubject = 'matematika' | 'fizika' | 'kimyo' | 'ona_tili' | 'ingliz_tili' | 'boshqa';
export type PhotoConfidence = 'high' | 'medium' | 'low';

export interface PhotoAnswerView {
  readonly subject: PhotoSubject;
  readonly given: string;
  readonly steps: readonly string[];
  readonly answer: string;
  readonly check: string;
  readonly confidence: PhotoConfidence;
}

/** What POST /api/studio/photo answers with 200. */
export interface PhotoResult {
  readonly jobId: string;
  readonly source: 'free' | 'entitlement' | 'regen';
  readonly entitlementId?: string;
  readonly answer: PhotoAnswerView;
  readonly regenAvailable: boolean;
}

export interface PhotoCall {
  /** The shrunk picture. */
  readonly image: Blob;
  readonly requestId: string;
  readonly mode: PhotoModeChoice;
  readonly locale: StudioLocale;
  readonly turnstileToken?: string;
  readonly regenOf?: string;
}

export interface PhotoApi {
  explain(call: PhotoCall, options?: { readonly signal?: AbortSignal }): Promise<Result<PhotoResult>>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const CODE = /^[a-z][a-z0-9_]{1,40}$/;
const JOB_ID = /^sj_[0-9a-f]{32}$/;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The person gave the current consent in this browser before. False when storage is absent or blocked. */
export function consentStored(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(PHOTO_CONSENT_KEY) === PHOTO_CONSENT_VERSION;
  } catch {
    return false;
  }
}

/** Remembers the consent; a blocked storage only means the question is asked again next time. */
export function storeConsent(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(PHOTO_CONSENT_KEY, PHOTO_CONSENT_VERSION);
  } catch {
    // Private mode or a full storage: asked again next time.
  }
}

/** A file the tool takes: by its declared type, or by the extension when the browser declares none. */
export function acceptedPhoto(file: { readonly type: string; readonly name?: string }): boolean {
  if (PHOTO_TYPES.includes(file.type)) return true;
  return !file.type && /\.(?:jpe?g|png|webp)$/i.test(file.name ?? '');
}

/** The size a picture of width × height is drawn at: the longest side at most PHOTO_MAX_SIDE, the ratio kept, never enlarged. */
export function shrinkPlan(width: number, height: number, maxSide: number = PHOTO_MAX_SIDE): { readonly width: number; readonly height: number } {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { width: 1, height: 1 };
  if (longest <= maxSide) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface ShrinkDeps {
  readonly decode: (file: Blob) => Promise<{ readonly width: number; readonly height: number; draw(context: CanvasRenderingContext2D, width: number, height: number): void; close?(): void }>;
  readonly canvas: (width: number, height: number) => HTMLCanvasElement | OffscreenCanvas;
}

async function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality));
}

const browserDeps: ShrinkDeps = {
  decode: async (file) => {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height),
      close: () => bitmap.close(),
    };
  },
  canvas: (width, height) => {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    return element;
  },
};

/**
 * The picture as a JPEG of ≤ 1 600 px on its longest side, re-encoded (so
 * EXIF is gone) at 0.8, then lower until it weighs ≤ PHOTO_TARGET_BYTES.
 * Null when the browser cannot decode or encode it (the form says so).
 */
export async function shrinkPhoto(file: Blob, deps: ShrinkDeps = browserDeps): Promise<Blob | null> {
  let decoded: Awaited<ReturnType<ShrinkDeps['decode']>>;
  try {
    decoded = await deps.decode(file);
  } catch {
    return null;
  }
  try {
    const { width, height } = shrinkPlan(decoded.width, decoded.height);
    const canvas = deps.canvas(width, height);
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    decoded.draw(context, width, height);
    let smallest: Blob | null = null;
    for (const quality of PHOTO_QUALITIES) {
      const blob = await toBlob(canvas, quality);
      if (!blob) return smallest;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= PHOTO_TARGET_BYTES) return blob;
    }
    return smallest && smallest.size <= PHOTO_MAX_BYTES ? smallest : null;
  } catch {
    return null;
  } finally {
    decoded.close?.();
  }
}

function retryAfter(response: Response): number | undefined {
  const value = Number(response.headers.get('Retry-After'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function codeFromStatus(status: number): string {
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 401) return 'identity_required';
  if (status === 403) return 'turnstile_failed';
  if (status === 413) return 'payload_too_large';
  if (status === 415) return 'unsupported_media';
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
  const code = typeof fields.code === 'string' && CODE.test(fields.code) ? fields.code : codeFromStatus(response.status);
  return {
    ok: false,
    status: response.status,
    code,
    ...(typeof fields.retry === 'boolean' ? { retry: fields.retry } : {}),
    ...(typeof fields.resetsAt === 'string' ? { resetsAt: fields.resetsAt } : {}),
    ...(retryAfter(response) ? { retryAfter: retryAfter(response) } : {}),
  };
}

const SUBJECTS: readonly string[] = ['matematika', 'fizika', 'kimyo', 'ona_tili', 'ingliz_tili', 'boshqa'];
const CONFIDENCES: readonly string[] = ['high', 'medium', 'low'];

/** The server's 200 as a PhotoResult, or null when it is not one. */
export function readPhotoResult(data: unknown): PhotoResult | null {
  if (!isRecord(data) || data.ok !== true) return null;
  if (typeof data.jobId !== 'string' || !JOB_ID.test(data.jobId)) return null;
  if (data.source !== 'free' && data.source !== 'entitlement' && data.source !== 'regen') return null;
  const answer = data.answer;
  if (!isRecord(answer)) return null;
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  const given = text(answer.given);
  const final = text(answer.answer);
  const check = text(answer.check);
  if (given === null || final === null || check === null || !Array.isArray(answer.steps)) return null;
  const steps = answer.steps.filter((step): step is string => typeof step === 'string');
  return {
    jobId: data.jobId,
    source: data.source,
    ...(typeof data.entitlementId === 'string' ? { entitlementId: data.entitlementId } : {}),
    answer: {
      subject: (SUBJECTS.includes(String(answer.subject)) ? answer.subject : 'boshqa') as PhotoSubject,
      given,
      steps,
      answer: final,
      check,
      confidence: (CONFIDENCES.includes(String(answer.confidence)) ? answer.confidence : 'medium') as PhotoConfidence,
    },
    regenAvailable: data.regenAvailable === true,
  };
}

/** The multipart body of one call: exactly the server's fields (functions/api/studio/photo.ts readPhotoRequest). */
export function photoFormData(call: PhotoCall): FormData {
  const form = new FormData();
  form.set('image', call.image, 'photo.jpg');
  form.set('requestId', call.requestId);
  form.set('mode', call.mode);
  form.set('locale', call.locale);
  form.set('consent', PHOTO_CONSENT_VERSION);
  if (call.turnstileToken) form.set('turnstileToken', call.turnstileToken);
  if (call.regenOf) form.set('regenOf', call.regenOf);
  return form;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** The photo API over `fetchImpl` (the page's fetch by default; tests pass their own). */
export function createPhotoApi(fetchImpl?: Fetch, timeoutMs: number = PHOTO_TIMEOUT_MS): PhotoApi {
  const doFetch: Fetch = fetchImpl ?? ((input, init) => fetch(input, init));
  return {
    async explain(call, options) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const onAbort = () => controller.abort();
      if (options?.signal?.aborted) controller.abort();
      else options?.signal?.addEventListener('abort', onAbort, { once: true });
      let response: Response;
      try {
        // No Content-Type header: the browser writes the multipart boundary itself.
        const request = doFetch(`${STUDIO_API_BASE}photo`, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          body: photoFormData(call),
          signal: controller.signal,
        });
        // The abort ends the wait even for a fetch that ignores its signal.
        const aborted = new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        response = await Promise.race([request, aborted]);
        request.catch(() => undefined);
      } catch {
        return { ok: false, status: 0, code: timedOut ? 'timeout' : options?.signal?.aborted ? 'aborted' : 'network' };
      } finally {
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', onAbort);
      }
      if (!response.ok) return failureOf(response);
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { ok: false, status: response.status, code: 'invalid_output' };
      }
      const result = readPhotoResult(body);
      return result ? { ok: true, status: response.status, data: result } : { ok: false, status: response.status, code: 'invalid_output' };
    },
  };
}

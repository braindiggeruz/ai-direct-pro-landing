// The pictures of a deck (spec §7.1, §7.4, §7.5; measured in T0.1,
// MEASURE-30 §7).
//
// A picture is drawn only from an image prompt the server signed for this
// job and slide (sign.ts), only after the deck's text went out (bit 0 of the
// ledger row) and only under the job's cap of Flux calls (2 + 2 redraws for
// the free deck, 8 + 4 for a full one), taken with a guarded
// images = images + 1. Then:
//   1. the picture's worst case (Flux and its check) is reserved on the
//      job's daily spend bucket (spend.ts); a full bucket is image_failed;
//   2. Flux-1-schnell draws it: the prompt plus the positive style tail A,
//      4 steps, 1024×1024, 20 s at most; an error is image_failed, Flux's own
//      NSFW refusal image_refused;
//   3. the vision check (image-check.ts) must answer all-false, else
//      image_refused: the picture is not handed out;
//   4. the reservation is settled at what the calls cost.
// Whatever happens to a picture, the unit is not touched: the browser redraws
// a slot once, then the slide goes without a picture. The browser also stops
// waiting 35 s after the text (IMAGE_RULES.deadlineAfterOutlineMs, mirrored
// in the island as flow.ts PICTURE_DEADLINE_MS: drawPictures cancels what is
// still being drawn, the slide goes without and the file can be saved); the
// server's limit is the job's own life (15 minutes from its start).
//
// The bytes go to the browser as image/jpeg and are never written anywhere:
// not to D1, not to a log, not to R2.
//
// Before any of that, the deck's image prompts get ONE Llama Guard call per
// job (screenPicturePrompts), metered on the same bucket. A refusal, a full
// bucket or a failed call drop every picture of the job; the text still goes out.
import type { Env } from "../../_types";
import type { StudioConfig } from "./config";
import { studioLog } from "./http";
import { verdictCode, checkPicture, type CheckDeps } from "./image-check";
import type { StudioAlert } from "./limits";
import type { LedgerJob } from "./ledger";
import { FLUX_MICRO_PER_IMAGE, FLUX_MODEL } from "./pricing";
import { IMAGE_RULES, fluxPrompt, guardImagePrompts, type AiRunner } from "./safety";
import { JobSpend, imageCallMicro, promptGuardMicro, type SpendConfig } from "./spend";

/** A 1024² Flux JPEG weighs ≈0.3–1 MB (T2.1 local run: 292–958 KB); anything far larger is not one. */
export const MAX_PICTURE_BYTES = 2 * 1024 * 1024;

/** The headers of a picture answer: bytes nobody caches, indexes or sniffs. */
export const PICTURE_HEADERS = {
  "Content-Type": "image/jpeg",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
} as const;

/** Standard base64 (as Workers AI answers) to bytes, or null when it is not base64. */
export function base64Bytes(base64: string): Uint8Array<ArrayBuffer> | null {
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The bytes start like a JPEG (SOI and a marker). */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export type DrawResult =
  | { readonly ok: true; readonly base64: string; readonly bytes: Uint8Array<ArrayBuffer> }
  | {
      readonly ok: false;
      /** refused: Flux's own NSFW refusal; timeout: no answer in time; failed: an error or not a JPEG. */
      readonly reason: "refused" | "timeout" | "failed";
      /** The call may have been billed (an answer, or an unknown outcome). */
      readonly billed: boolean;
    };

/** The Flux input of one picture. */
export function fluxInput(prompt: string): { prompt: string; steps: number } {
  return { prompt: fluxPrompt(prompt), steps: IMAGE_RULES.steps };
}

/** One Flux picture of `prompt` (the style tail is added here). Never throws. */
export async function drawPicture(ai: AiRunner, prompt: string, timeoutMs: number = IMAGE_RULES.fluxTimeoutMs): Promise<DrawResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      ai.run(FLUX_MODEL, fluxInput(prompt)),
      new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), Math.max(1, timeoutMs)))),
    ]);
    if (result === "timeout") return { ok: false, reason: "timeout", billed: true };
    const base64 = typeof result === "object" && result !== null ? (result as { image?: unknown }).image : undefined;
    const bytes = typeof base64 === "string" && base64.length <= Math.ceil((MAX_PICTURE_BYTES * 4) / 3) + 4 ? base64Bytes(base64) : null;
    if (!bytes || !isJpeg(bytes) || bytes.length > MAX_PICTURE_BYTES) return { ok: false, reason: "failed", billed: true };
    return { ok: true, base64: base64 as string, bytes };
  } catch (error) {
    // Flux 8007 «Input prompt contains NSFW content». The message is matched, never logged.
    const nsfw = /nsfw/i.test(error instanceof Error ? error.message : String(error));
    return { ok: false, reason: nsfw ? "refused" : "failed", billed: false };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type PictureResult =
  | { readonly ok: true; readonly bytes: Uint8Array<ArrayBuffer>; readonly alerts: readonly StudioAlert[] }
  | {
      readonly ok: false;
      /** image_refused / image_failed: the slide may be redrawn once; job_state: the job closed meanwhile. */
      readonly code: "image_refused" | "image_failed" | "job_state";
      readonly alerts: readonly StudioAlert[];
    };

export interface PaintInput {
  readonly db: D1Database;
  readonly config: SpendConfig & Pick<StudioConfig, "imageCheckModel">;
  /** The job the Flux call was taken for (LedgerStore.takeImageCall). */
  readonly job: Pick<LedgerJob, "id" | "source" | "reserveDay">;
  readonly ai: AiRunner;
  readonly env: Pick<Env, "ZAI_API_KEY">;
  /** The signed prompt, verified by the caller. */
  readonly prompt: string;
  readonly fetch?: typeof fetch;
  readonly fluxTimeoutMs?: number;
  readonly checkTimeoutMs?: number;
}

/**
 * Draws and checks one picture of a job, metered on its spend bucket. The
 * caller has verified the prompt's signature and taken the Flux call under
 * the job's cap. Never throws; logs {event, code} only.
 */
export async function paintPicture(input: PaintInput): Promise<PictureResult> {
  const spend = new JobSpend(input.db, input.job);
  const reserved = imageCallMicro(input.config);
  const admission = await spend.reserve(reserved, input.config);
  if (!admission.ok) {
    studioLog("studio_image", admission.kind === "closed" ? "job_closed" : "budget");
    return { ok: false, code: admission.kind === "closed" ? "job_state" : "image_failed", alerts: admission.kind === "busy" && admission.alert ? [admission.alert] : [] };
  }
  let actual = 0;
  try {
    const drawn = await drawPicture(input.ai, input.prompt, input.fluxTimeoutMs);
    if (drawn.ok || drawn.billed) actual += FLUX_MICRO_PER_IMAGE;
    if (!drawn.ok) {
      studioLog("studio_image", `flux_${drawn.reason}`);
      return { ok: false, code: drawn.reason === "refused" ? "image_refused" : "image_failed", alerts: [] };
    }
    const deps: CheckDeps = { ai: input.ai, env: input.env, fetch: input.fetch };
    const check = await checkPicture(deps, input.config.imageCheckModel, drawn.base64, input.checkTimeoutMs);
    actual += check.costMicro;
    if (!check.ok) {
      studioLog("studio_image", `check_${check.reason}`);
      return { ok: false, code: "image_failed", alerts: [] };
    }
    if (!check.safe) {
      studioLog("studio_image", `refused_${verdictCode(check.verdict)}`);
      return { ok: false, code: "image_refused", alerts: [] };
    }
    studioLog("studio_image", "ok");
    return { ok: true, bytes: drawn.bytes, alerts: [] };
  } finally {
    await spend.settle(reserved, actual, null);
  }
}

export type PromptScreen =
  | { readonly ok: true }
  /** reason: safety_S<n>, safety_unknown, guard_unavailable or budget. Never a prompt. */
  | { readonly ok: false; readonly reason: string; readonly alerts: readonly StudioAlert[] };

/**
 * The one Llama Guard call over every image prompt of a job (spec §7.4 item
 * 3), metered on the job's bucket. Without the AI binding nothing is called
 * and the pictures are dropped.
 */
export async function screenPicturePrompts(
  db: D1Database,
  config: SpendConfig,
  job: Pick<LedgerJob, "id" | "source" | "reserveDay">,
  ai: AiRunner | null,
  prompts: readonly string[],
): Promise<PromptScreen> {
  if (!prompts.length) return { ok: true };
  if (!ai) return { ok: false, reason: "guard_unavailable", alerts: [] };
  const spend = new JobSpend(db, job);
  const reserved = promptGuardMicro();
  const admission = await spend.reserve(reserved, config);
  if (!admission.ok) return { ok: false, reason: "budget", alerts: admission.kind === "busy" && admission.alert ? [admission.alert] : [] };
  try {
    const verdict = await guardImagePrompts(ai, prompts);
    return verdict.ok ? { ok: true } : { ok: false, reason: verdict.reason, alerts: [] };
  } finally {
    // Usage is not reported: the call counts at its ceiling.
    await spend.settle(reserved, reserved, null);
  }
}

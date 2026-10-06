// Signatures of what the server hands out and must get back unchanged
// (spec §7.1): the outline of a full deck and each image prompt.
//
// The server keeps no text of a deck (it is the person's text, spec §4.1).
// The browser holds the outline and sends it back with each part request;
// HMAC(job | outline) proves it is the outline this job's model wrote, so a
// changed outline is 400 outline_tampered and the part prompt only ever
// carries what our own model produced. A picture is drawn only from a prompt
// signed for this job and slide, HMAC(job | index | prompt), so nobody can
// draw arbitrary pictures through us (400 bad_sig).
//
// Key: GPT_IDENTITY_SECRET under its own domain prefixes, like the browser
// identity (identity.ts); no new secret. A signature is the first 16 bytes
// of HMAC-SHA256, base64url (22 characters), compared in constant time.
// Checking needs no D1; what a job may still draw (bit 0 delivered, the
// picture cap) is checkImageRequest() over the ledger row the caller read.
import type { BillingEnv } from "../gpt-chat/billing-config";
import { DECK_SHAPES, type DeckShapeName } from "./plans";
import { pythonJson } from "./prompts";

export type SignEnv = Pick<BillingEnv, "GPT_IDENTITY_SECRET">;

/** A shorter GPT_IDENTITY_SECRET counts as unset, as everywhere else in the code. */
const MIN_SECRET_LENGTH = 32;
const SIG_BYTES = 16;
const SIG = /^[A-Za-z0-9_-]{22}$/;

export const OUTLINE_SIG_PREFIX = "studio-outline-v1:";
export const IMAGE_SIG_PREFIX = "studio-image-v1:";

function secretOf(env: SignEnv): string | null {
  const value = env.GPT_IDENTITY_SECRET || "";
  return value.length >= MIN_SECRET_LENGTH ? value : null;
}

/** GPT_IDENTITY_SECRET can sign: without it the deck paths answer 503 studio_not_configured. */
export function signingConfigured(env: SignEnv): boolean {
  return secretOf(env) !== null;
}

let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

/** HMAC-SHA256 of `message` under `secret` (the key is imported once per isolate). */
export async function hmacBytes(secret: string, message: string): Promise<Uint8Array> {
  if (cachedKey?.secret !== secret) {
    cachedKey = {
      secret,
      key: crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    };
  }
  return new Uint8Array(await crypto.subtle.sign("HMAC", await cachedKey.key, new TextEncoder().encode(message)));
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Equal strings, compared in time that does not depend on where they differ. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(secret: string, message: string): Promise<string> {
  return base64url((await hmacBytes(secret, message)).slice(0, SIG_BYTES));
}

// ── The outline ─────────────────────────────────────────────────────────────

/** The outline as the browser gets it and sends it back (image prompts travel signed on their own). */
export interface SignedOutline {
  readonly title: string;
  readonly subtitle: string;
  readonly slides: ReadonlyArray<{ readonly index: number; readonly title: string; readonly point: string }>;
}

const JOB_ID = /^sj_[0-9a-f]{32}$/;

/** The one text a signature covers: the fields the part prompt uses, in a fixed order. */
export function canonicalOutline(outline: SignedOutline): string {
  return pythonJson({
    title: outline.title,
    subtitle: outline.subtitle,
    slides: outline.slides.map((slide) => ({ index: slide.index, title: slide.title, point: slide.point })),
  });
}

/** The outline in `value`, read field by field (anything else in it is ignored), or null. */
export function readOutline(value: unknown, maxSlides = DECK_SHAPES.full.maxSlides): SignedOutline | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.title !== "string" || typeof raw.subtitle !== "string" || !Array.isArray(raw.slides)) return null;
  if (raw.slides.length < 1 || raw.slides.length > maxSlides) return null;
  const slides: Array<{ index: number; title: string; point: string }> = [];
  for (const [i, item] of raw.slides.entries()) {
    if (typeof item !== "object" || item === null) return null;
    const slide = item as Record<string, unknown>;
    if (slide.index !== i + 1 || typeof slide.title !== "string" || typeof slide.point !== "string") return null;
    slides.push({ index: i + 1, title: slide.title, point: slide.point });
  }
  return { title: raw.title, subtitle: raw.subtitle, slides };
}

/** The signature of `outline` for job `jobId`, or null without a usable secret. */
export async function signOutline(env: SignEnv, jobId: string, outline: SignedOutline): Promise<string | null> {
  const secret = secretOf(env);
  if (!secret) return null;
  return sign(secret, `${OUTLINE_SIG_PREFIX}${jobId}|${canonicalOutline(outline)}`);
}

export type OutlineCheck =
  | { readonly ok: true; readonly outline: SignedOutline }
  | { readonly ok: false; readonly code: "outline_tampered" | "studio_not_configured" };

/**
 * The outline a part request carries, if its signature is this job's.
 * Malformed, changed, signed for another job or with another key: 400
 * outline_tampered.
 */
export async function verifyOutline(env: SignEnv, jobId: string, outline: unknown, sig: unknown): Promise<OutlineCheck> {
  const secret = secretOf(env);
  if (!secret) return { ok: false, code: "studio_not_configured" };
  const read = readOutline(outline);
  if (!read || !JOB_ID.test(jobId) || typeof sig !== "string" || !SIG.test(sig)) return { ok: false, code: "outline_tampered" };
  const expected = await sign(secret, `${OUTLINE_SIG_PREFIX}${jobId}|${canonicalOutline(read)}`);
  return sameText(expected, sig) ? { ok: true, outline: read } : { ok: false, code: "outline_tampered" };
}

// ── Image prompts ───────────────────────────────────────────────────────────

export interface SignedImagePrompt {
  readonly index: number;
  readonly prompt: string;
  readonly sig: string;
}

const imageMessage = (jobId: string, index: number, prompt: string) => `${IMAGE_SIG_PREFIX}${jobId}|${index}|${prompt}`;

/** The signature of `prompt` for slide `index` of job `jobId`, or null without a usable secret. */
export async function signImagePrompt(env: SignEnv, jobId: string, index: number, prompt: string): Promise<string | null> {
  const secret = secretOf(env);
  if (!secret) return null;
  return sign(secret, imageMessage(jobId, index, prompt));
}

/** Signs every prompt the safety checks kept, or null without a usable secret. */
export async function signImagePrompts(
  env: SignEnv,
  jobId: string,
  prompts: ReadonlyArray<{ readonly index: number; readonly prompt: string }>,
): Promise<SignedImagePrompt[] | null> {
  const signed: SignedImagePrompt[] = [];
  for (const { index, prompt } of prompts) {
    const sig = await signImagePrompt(env, jobId, index, prompt);
    if (!sig) return null;
    signed.push({ index, prompt, sig });
  }
  return signed;
}

/** The prompt was signed for this job and slide with our key (no D1). */
export async function verifyImagePrompt(env: SignEnv, jobId: string, index: unknown, prompt: unknown, sig: unknown): Promise<boolean> {
  const secret = secretOf(env);
  if (!secret || !JOB_ID.test(jobId)) return false;
  if (!Number.isInteger(index) || (index as number) < 1 || (index as number) > DECK_SHAPES.full.maxSlides) return false;
  if (typeof prompt !== "string" || !prompt || prompt.length > 400 || typeof sig !== "string" || !SIG.test(sig)) return false;
  return sameText(await sign(secret, imageMessage(jobId, index as number, prompt)), sig);
}

// ── What a job may still draw ───────────────────────────────────────────────

/** Flux calls a job may make: its pictures plus one redraw for some of them (plans.ts DECK_SHAPES). */
export function imageCallCap(shape: DeckShapeName): number {
  return DECK_SHAPES[shape].images + DECK_SHAPES[shape].imageRetries;
}

export interface ImageJobView {
  readonly shape: DeckShapeName;
  readonly state: "reserved" | "delivering" | "done" | "released" | "refused";
  /** studio_unit_ledger.parts_done: bit 0 is the outline, or the free deck's only part. */
  readonly partsDone: number;
  /** studio_unit_ledger.images: Flux calls made so far. */
  readonly images: number;
  readonly expiresAt: number;
}

/**
 * Whether a signed image request may draw now (spec §7.1, §7.5): only after
 * the outline (bit 0) went out, only while the job is open, and only under
 * the job's cap of Flux calls. The caller then takes the call with a guarded
 * `images = images + 1 … WHERE images < cap` (T2.1), so two requests at once
 * cannot both take the last one.
 */
export function checkImageRequest(job: ImageJobView, now: number): null | "job_state" | "image_cap" {
  // A done job may still draw: its pictures follow its text (bit 0 is set either way).
  if (job.state !== "delivering" && job.state !== "done") return "job_state";
  if ((job.partsDone & 1) === 0 || job.expiresAt <= now) return "job_state";
  if (job.images >= imageCallCap(job.shape)) return "image_cap";
  return null;
}

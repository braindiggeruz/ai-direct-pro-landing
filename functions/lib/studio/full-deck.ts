// The full deck (T3.1; spec §2.3, §6, §7.1): who may make one, its outline,
// its parts and what each answer carries.
//
//   POST /presentations {shape:"full"}     a unit of the buyer's entitlement
//                                          that ends soonest, the row in
//                                          'reserved' (jobs.ts startJob)
//   POST /:job/outline {task}              the plan + an English picture
//                                          prompt per slide; ONE Llama Guard
//                                          call; the outline signed for the
//                                          job, each kept prompt signed for
//                                          its slide; bit 0
//   POST /:job/slides {task, part, outline, sig}
//                                          part 1..P of ≤ 4 slides, all at
//                                          once, each against the signed
//                                          outline (400 outline_tampered);
//                                          the proofreading pass for a paid
//                                          Uzbek deck (proofread.ts); bit `part`
//   POST /:job/images                      pictures, only after bit 0 (≤ 8)
//   POST /:job/regenerate {task}           one regeneration of a spent unit,
//                                          the same task, within 24 hours
//
// The buyer. A paid job belongs to the Studio account, never to a browser:
// its subject is "a:" + the account id of the session in
// __Host-studio_account (spec §5.3: an account made at the first checkout
// by IdentityStore.syntheticLogin("acct_studio_", 365 days); gpt_auth_sessions
// unchanged). Read here by the session's token hash only, one primary-key
// read; the account file of T3.2 (account.ts) makes, extends and restores
// the session. An entitlement's mode is the mode payments run in on this
// host: "test" only where STUDIO_PAYMENTS=test may run (a local host under
// STUDIO_LOCAL_DEV), "live" everywhere else, whatever STUDIO_PAYMENTS says
// now: an entitlement bought live stays usable after sales are switched off.
//
// The server keeps no text of the deck (spec §4.1): the browser holds the
// task, the signed outline and the parts, and sends back what a step needs.
import { cookieValue } from "../gpt-chat/identity-store";
import { sha256Hex } from "../gpt-chat/hash";
import type { StudioConfig } from "./config";
import { withLayouts, type DeckSlide, type Outline, type PartSlide } from "./deck-schema";
import type { EntitlementMode, LedgerJob } from "./ledger";
import { DECK_SHAPES } from "./plans";
import { partIndexes } from "./prompts";
import { pickImagePrompts } from "./safety";
import { STUDIO_ORG } from "./schema";
import type { SignedImagePrompt, SignedOutline } from "./sign";

/** The Studio account's own cookie (spec §5.3); the chat reads only __Host-gpt_account. */
export const STUDIO_ACCOUNT_COOKIE = "__Host-studio_account";
/** Studio accounts are made with this id prefix (IdentityStore.syntheticLogin). */
export const STUDIO_ACCOUNT_PREFIX = "acct_studio_";
/** IdentityStore's session token: 32 random bytes as hex. */
const ACCOUNT_TOKEN = /^[a-f0-9]{64}$/;
const ACCOUNT_ID = /^acct_studio_[A-Za-z0-9_]{1,60}$/;

/** The session token of the request's Studio account cookie, or null. Format only: no D1. */
export function accountToken(request: Request): string | null {
  const token = cookieValue(request, STUDIO_ACCOUNT_COOKIE);
  return ACCOUNT_TOKEN.test(token) ? token : null;
}

/**
 * The Studio account whose live session `token` is, or null (unknown,
 * expired, or a session of a chat account). One read by primary key.
 */
export async function readBuyer(db: D1Database, token: string, now: number): Promise<string | null> {
  if (!ACCOUNT_TOKEN.test(token)) return null;
  const row = await db
    .prepare("SELECT user_id FROM gpt_auth_sessions WHERE org_id=? AND token_hash=? AND expires_at>?")
    .bind(STUDIO_ORG, await sha256Hex(token), now)
    .first<{ user_id: string }>();
  return row && ACCOUNT_ID.test(row.user_id) ? row.user_id : null;
}

/** The ledger subject of an account's jobs. */
export function buyerSubject(userId: string): string {
  return `a:${userId}`;
}

/** The mode of the entitlements a paid job may spend on this request's host (see the header). */
export function entitlementMode(config: Pick<StudioConfig, "payments">): EntitlementMode {
  return config.payments === "test" ? "test" : "live";
}

// ── The outline ─────────────────────────────────────────────────────────────

/** The outline as the browser holds it and signs it back: no picture prompts (they travel signed on their own). */
export function signedOutlineOf(outline: Outline): SignedOutline {
  return {
    title: outline.title,
    subtitle: outline.subtitle,
    slides: outline.slides.map((slide) => ({ index: slide.index, title: slide.title, point: slide.point })),
  };
}

/** The picture prompts to screen: in slide order, the first 8 that pass the word lists (safety.ts). */
export function outlinePicturePicks(outline: Outline): Array<{ index: number; prompt: string }> {
  return pickImagePrompts(outline.slides.map((slide) => ({ index: slide.index, imagePrompt: slide.imagePrompt })), DECK_SHAPES.full.images);
}

/** POST /:job/outline answers this (with ok): the outline, its signature, the signed prompts and the number of parts. */
export interface OutlineContent {
  readonly outline: SignedOutline;
  readonly sig: string;
  readonly images: readonly SignedImagePrompt[];
  /** Slide parts to ask for: 1..parts. */
  readonly parts: number;
}

// ── The parts ───────────────────────────────────────────────────────────────

/** Part `part` of `job` (1..partsTotal−1) for a deck of `slides` slides: its plan indexes, or null. */
export function partPlan(job: Pick<LedgerJob, "shape" | "partsTotal">, slides: number, part: unknown): { readonly part: number; readonly indexes: readonly number[] } | null {
  if (job.shape !== "full" || typeof part !== "number" || !Number.isInteger(part)) return null;
  const plan = partIndexes(slides);
  if (plan.length !== job.partsTotal - 1 || part < 1 || part > plan.length) return null;
  return { part, indexes: plan[part - 1] };
}

/** POST /:job/slides of a full deck answers this (with ok and done). */
export interface PartContent {
  readonly part: number;
  readonly deck: {
    /** The cover, on part 1 only (proofread with it for a paid Uzbek deck). */
    readonly title?: string;
    readonly subtitle?: string;
    readonly slides: readonly DeckSlide[];
  };
}

/**
 * A part as the browser gets it. Layouts are text layouts here: the server
 * keeps no picture list, and the browser lays out each slide from the
 * pictures that actually arrived (pptx/layouts.ts chooseLayouts).
 */
export function partContent(part: number, slides: readonly PartSlide[], cover?: { readonly title: string; readonly subtitle: string }): PartContent {
  return {
    part,
    deck: {
      ...(cover ? { title: cover.title, subtitle: cover.subtitle } : {}),
      slides: withLayouts(slides, new Set()),
    },
  };
}

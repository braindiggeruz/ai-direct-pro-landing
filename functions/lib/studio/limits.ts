// The studio's brakes outside the daily free units (spec §5.4).
//
//   studio_identity_try identity requests that reach the token check: 600 an
//                       hour per address (IPv6 by its /64, hash.ts
//                       addressKey), counted BEFORE Turnstile, a missing or
//                       malformed token included → 429. It only keeps
//                       Siteverify from being hammered and never feeds the
//                       counter below.
//   studio_identity     identities issued: 60 an hour per address, read
//                       before Turnstile (a full hour costs no Siteverify
//                       call) and counted only AFTER Turnstile passed → 429.
//                       So a client without a token cannot fill it, and one
//                       host behind a mobile operator's NAT cannot lock its
//                       neighbours out. No daily cap per address: it would
//                       lock out newcomers behind a NAT or a school's Wi-Fi.
//   studio_job          job starts: 6 in 10 minutes per subject, counted
//                       before Turnstile (a person only slows themselves) → 429
//   studio_job_global   job starts across the site: STUDIO_JOB_GLOBAL_PER_MIN
//                       a minute (set from Z.ai's 1302 threshold) → 503.
//                       Read (never counted) before Turnstile for an early
//                       503; counted only for a start that passed Turnstile,
//                       the one-open-job rule and the person's own daily
//                       unit (jobs.ts startJob `sitePace`), so neither a
//                       request without a token nor a refused start fills it
//                       for everybody.
//   free budget         gpt_model_spend bucket "studio_free" of the UTC day
//                       against STUDIO_FREE_DAILY_USD: spent → 503 for all
//                       until 05:00 Tashkent (resetsAt); from 80% an alert,
//                       and young identities are refused until then
//   ramp                STUDIO_RAMP_DECKS_DAILY free decks a day across the
//                       site (the "all" counter, free-usage.ts) → 503 until
//                       05:00 Tashkent (resetsAt)
//
// The counters are the chat's gpt_rate_limits through consumeRateLimit
// (rate-limit.ts, unchanged). That function answers allowed + degraded when
// D1 fails, so a broken counter never blocks a chat lead. The studio reads
// degraded as a refusal, like the chat's checkout: when the database is in
// trouble nothing free is handed out. Its own reads (peekCount) refuse on a
// failure too.
//
// Alerts are coarse codes recorded through the chat's recordServiceAlert in
// gpt_service_alerts; they carry no subject, address or text. alert-policy.ts
// makes every studio code urgent and daily: one row per code per UTC day, and
// deliverServiceAlerts pages the owner with it once.
import type { Env } from "../../_types";
import type { BillingEnv } from "../gpt-chat/billing-config";
import { recordServiceAlert } from "../gpt-chat/billing-maintenance-store";
import { addressKey, getClientIp, hashIp, resolveHashSalt } from "../gpt-chat/hash";
import { spendDay } from "../gpt-chat/model-spend-store";
import { consumeRateLimit, HOUR_MS, windowStart, type RateLimitResult } from "../gpt-chat/rate-limit";
import type { StudioConfig } from "./config";
import type { StudioErrorCode } from "./http";
import type { StudioUnit } from "./plans";
import { STUDIO_ORG } from "./schema";

/** gpt_model_spend buckets of the studio (spend.ts reserves into them, through ModelSpendStore). */
export const STUDIO_FREE_BUCKET = "studio_free";
export const STUDIO_PAID_BUCKET = "studio_paid";

/** The gpt_rate_limits buckets this file owns. */
export const STUDIO_RATE = {
  identityTry: { action: "studio_identity_try", limit: 600, windowMs: HOUR_MS },
  identity: { action: "studio_identity", limit: 60, windowMs: HOUR_MS },
  job: { action: "studio_job", limit: 6, windowMs: 10 * 60_000 },
  jobGlobal: { action: "studio_job_global", windowMs: 60_000 },
} as const;

/** The share of the free budget from which young identities are refused and the owner is told. */
export const FREE_BUDGET_ALERT_SHARE = 0.8;

export type StudioAlert =
  | "studio_free_budget_80"
  | "studio_free_budget_spent"
  | "studio_ramp_full"
  | "studio_free_decks_high"
  | "studio_free_photos_high"
  /** STUDIO_PAID_DAILY_USD_STOP reached (spend.ts): an error or an attack, paid calls fail as a server fault. */
  | "studio_paid_stop";

export type LimitVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: StudioErrorCode; readonly retryAfterSeconds: number };

/** The subject of the site-wide start counter. */
const SITE_RATE_SUBJECT = "all";

/** Seconds a refusal caused by a D1 failure asks the browser to wait. */
const DEGRADED_RETRY_SECONDS = 60;

/**
 * The stored key of the request's address: the chat's hashIp of its /64 (IPv6)
 * or the address itself (IPv4), salted from GPT_HASH_SALT_SINCE on. Never the
 * raw address.
 */
export function studioAddress(request: Request, env: Pick<Env, "GPT_HASH_SALT" | "GPT_HASH_SALT_SINCE">, now = Date.now()): Promise<string> {
  return hashIp(addressKey(getClientIp(request)), resolveHashSalt(env), now);
}

function verdict(result: RateLimitResult, over: StudioErrorCode): LimitVerdict {
  if (result.degraded) return { ok: false, code: "studio_busy", retryAfterSeconds: DEGRADED_RETRY_SECONDS };
  return result.allowed ? { ok: true } : { ok: false, code: over, retryAfterSeconds: result.retryAfterSeconds };
}

/**
 * The counter of (`action`, `subject`) in the window that holds `now`,
 * read without counting; null when D1 cannot be read. Unlike the chat's
 * peekRateLimit (0 on a failure) a failure shows, so the caller refuses.
 */
async function peekCount(db: D1Database, action: string, subject: string, windowMs: number, now: number): Promise<number | null> {
  try {
    const row = await db
      .prepare("SELECT count FROM gpt_rate_limits WHERE action=? AND subject=? AND window_start=?")
      .bind(action, subject, windowStart(new Date(now), windowMs))
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  } catch {
    return null;
  }
}

/** Seconds until the window of `windowMs` that holds `now` rolls over. */
function untilRollover(now: number, windowMs: number): number {
  const start = Math.floor(now / windowMs) * windowMs;
  return Math.max(1, Math.ceil((start + windowMs - now) / 1000));
}

/** A counter read against its limit: full → `over`; unreadable → studio_busy (fail closed). */
function roomVerdict(count: number | null, limit: number, windowMs: number, now: number, over: StudioErrorCode): LimitVerdict {
  if (count === null) return { ok: false, code: "studio_busy", retryAfterSeconds: DEGRADED_RETRY_SECONDS };
  return count >= limit ? { ok: false, code: over, retryAfterSeconds: untilRollover(now, windowMs) } : { ok: true };
}

/**
 * One more identity request from this address (studioAddress), before its
 * Turnstile token is read: 429 rate_limited past 600 an hour. Every request
 * counts, a missing or malformed token too; it never counts as an identity.
 */
export async function paceIdentityTry(db: D1Database, address: string, now = Date.now()): Promise<LimitVerdict> {
  const { action, limit, windowMs } = STUDIO_RATE.identityTry;
  return verdict(await consumeRateLimit(db, action, address, { limit, windowMs }, new Date(now)), "rate_limited");
}

/** May this address still get an identity this hour? A read only, nothing counted: before Turnstile. */
export async function identityRoom(db: D1Database, address: string, now = Date.now()): Promise<LimitVerdict> {
  const { action, limit, windowMs } = STUDIO_RATE.identity;
  return roomVerdict(await peekCount(db, action, address, windowMs, now), limit, windowMs, now, "rate_limited");
}

/**
 * One more identity issued to this address (studioAddress): call it only
 * after Turnstile passed, so a client without a token never fills it.
 * 429 rate_limited past 60 an hour.
 */
export async function paceIdentity(db: D1Database, address: string, now = Date.now()): Promise<LimitVerdict> {
  const { action, limit, windowMs } = STUDIO_RATE.identity;
  return verdict(await consumeRateLimit(db, action, address, { limit, windowMs }, new Date(now)), "rate_limited");
}

/**
 * One more job start for `subject`: 429 rate_limited past 6 starts in 10
 * minutes. Counted before Turnstile: whoever fills it slows only themselves.
 * The site's counter is apart (siteJobRoom, paceSiteJobStart).
 */
export async function paceJobStart(db: D1Database, subject: string, now = Date.now()): Promise<LimitVerdict> {
  const job = STUDIO_RATE.job;
  return verdict(await consumeRateLimit(db, job.action, subject, { limit: job.limit, windowMs: job.windowMs }, new Date(now)), "rate_limited");
}

/** Room for one more start across the site this minute? A read only, before Turnstile: 503 studio_busy when full. */
export async function siteJobRoom(db: D1Database, config: StudioConfig, now = Date.now()): Promise<LimitVerdict> {
  const { action, windowMs } = STUDIO_RATE.jobGlobal;
  return roomVerdict(await peekCount(db, action, SITE_RATE_SUBJECT, windowMs, now), config.jobGlobalPerMin, windowMs, now, "studio_busy");
}

/**
 * One more start across the site: 503 studio_busy past
 * STUDIO_JOB_GLOBAL_PER_MIN a minute. Only for a start that passed
 * Turnstile and the start's own cheap refusals (jobs.ts startJob
 * `sitePace`): a refused request never fills it for everybody.
 */
export async function paceSiteJobStart(db: D1Database, config: StudioConfig, now = Date.now()): Promise<LimitVerdict> {
  const { action, windowMs } = STUDIO_RATE.jobGlobal;
  return verdict(await consumeRateLimit(db, action, SITE_RATE_SUBJECT, { limit: config.jobGlobalPerMin, windowMs }, new Date(now)), "studio_busy");
}

export type BudgetVerdict =
  | { readonly ok: true; readonly alerts: readonly StudioAlert[] }
  | {
      readonly ok: false;
      readonly code: "studio_busy";
      readonly alerts: readonly StudioAlert[];
      /** True when the refusal holds until the free day ends (05:00 Tashkent); false for a D1 failure. */
      readonly forTheDay: boolean;
    };

/**
 * The free tier's budget of the UTC day (gpt_model_spend "studio_free",
 * micro-USD) against STUDIO_FREE_DAILY_USD. ModelSpendStore keeps the
 * committed total in reserved_micro: open reservations plus every settled
 * cost (settle() lowers it only by the unused part of a reservation).
 * actual_micro is a separate tally of the settled part, already inside
 * reserved_micro, so it is not added again:
 *   - spent, or a budget of 0: refused for everybody until the day ends;
 *   - 80% or more: an alert, and a young identity is refused until the day
 *     ends while older ones are still served;
 *   - unreadable: refused for now (money fails closed).
 * This is the check before a unit is reserved. The model call itself still
 * reserves its own worst case on the bucket (spend.ts), which cannot pass the cap.
 */
export async function freeBudgetGate(db: D1Database, config: StudioConfig, young: boolean, now = Date.now()): Promise<BudgetVerdict> {
  const cap = Math.round(config.freeDailyUsd * 1_000_000);
  if (cap <= 0) return { ok: false, code: "studio_busy", alerts: [], forTheDay: true };
  let spent: number;
  try {
    const row = await db
      .prepare("SELECT reserved_micro FROM gpt_model_spend WHERE org_id=? AND day=? AND bucket=?")
      .bind(STUDIO_ORG, spendDay(now), STUDIO_FREE_BUCKET)
      .first<{ reserved_micro: number }>();
    spent = Number(row?.reserved_micro ?? 0);
  } catch {
    return { ok: false, code: "studio_busy", alerts: [], forTheDay: false };
  }
  if (spent >= cap) return { ok: false, code: "studio_busy", alerts: ["studio_free_budget_spent"], forTheDay: true };
  if (spent >= cap * FREE_BUDGET_ALERT_SHARE) {
    const alerts: StudioAlert[] = ["studio_free_budget_80"];
    return young ? { ok: false, code: "studio_busy", alerts, forTheDay: true } : { ok: true, alerts };
  }
  return { ok: true, alerts: [] };
}

/** The ramp's ceiling on free units of `unit` across the site a day; null: none. Photos have none. */
export function rampCeiling(config: StudioConfig, unit: StudioUnit): number | null {
  return unit === "presentation_free" ? config.rampDecksDaily : null;
}

/** The IP ceiling of young identities a day (spec §5.4: 20 decks, 40 photos). */
export function ipCeiling(config: StudioConfig, unit: StudioUnit): number {
  return unit === "photo_task" ? config.ipYoungPhotos : config.ipYoungDecks;
}

/** At this many free units of `unit` across the site a day the owner is told (only told). */
export function siteAlertAt(config: StudioConfig, unit: StudioUnit): number {
  return unit === "photo_task" ? config.freeAlertPhotos : config.freeAlertDecks;
}

/** The alert code of the site's free counter of `unit`. */
export function siteAlertCode(unit: StudioUnit): StudioAlert {
  return unit === "photo_task" ? "studio_free_photos_high" : "studio_free_decks_high";
}

/**
 * Record each alert once per UTC day (gpt_service_alerts; alert-policy.ts
 * makes every studio code urgent and daily, so deliverServiceAlerts pages the
 * owner once a day while the state lasts). Best-effort: a failed write never
 * fails the visitor's request. Pass it to waitUntil.
 */
export async function recordStudioAlerts(env: Pick<Env, "GPTBOT_DRAFTS_DB">, alerts: readonly StudioAlert[], now = Date.now()): Promise<void> {
  for (const code of new Set(alerts)) {
    try {
      // recordServiceAlert reads only GPTBOT_DRAFTS_DB of the env.
      await recordServiceAlert(env as BillingEnv, code, now);
    } catch {
      /* best-effort */
    }
  }
}

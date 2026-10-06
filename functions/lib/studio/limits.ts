// The studio's brakes outside the daily free units (spec §5.4).
//
//   studio_identity     identities issued: 60 an hour per address
//                       (IPv6 by its /64, hash.ts addressKey). No daily cap
//                       per address: it would lock out newcomers behind a
//                       mobile operator's NAT or a school's Wi-Fi.
//   studio_job          job starts: 6 in 10 minutes per subject → 429
//   studio_job_global   job starts across the site: STUDIO_JOB_GLOBAL_PER_MIN
//                       a minute (set from Z.ai's 1302 threshold) → 503
//   free budget         gpt_model_spend bucket "studio_free" of the UTC day
//                       against STUDIO_FREE_DAILY_USD: spent → 503 for all;
//                       from 80% an alert, and young identities are refused
//   ramp                STUDIO_RAMP_DECKS_DAILY free decks a day across the
//                       site (the "all" counter, free-usage.ts) → 503
//
// The counters are the chat's gpt_rate_limits through consumeRateLimit
// (rate-limit.ts, unchanged). That function answers allowed + degraded when
// D1 fails, so a broken counter never blocks a chat lead. The studio reads
// degraded as a refusal, like the chat's checkout: when the database is in
// trouble nothing free is handed out.
//
// Alerts are coarse codes recorded through the chat's recordServiceAlert
// (one row per code per hour in gpt_service_alerts); they carry no subject,
// address or text.
import type { Env } from "../../_types";
import type { BillingEnv } from "../gpt-chat/billing-config";
import { recordServiceAlert } from "../gpt-chat/billing-maintenance-store";
import { addressKey, getClientIp, hashIp, resolveHashSalt } from "../gpt-chat/hash";
import { spendDay } from "../gpt-chat/model-spend-store";
import { consumeRateLimit, HOUR_MS, type RateLimitResult } from "../gpt-chat/rate-limit";
import type { StudioConfig } from "./config";
import type { StudioErrorCode } from "./http";
import type { StudioUnit } from "./plans";
import { STUDIO_ORG } from "./schema";

/** gpt_model_spend buckets of the studio (spend.ts reserves into them, through ModelSpendStore). */
export const STUDIO_FREE_BUCKET = "studio_free";
export const STUDIO_PAID_BUCKET = "studio_paid";

/** The gpt_rate_limits buckets this file owns. */
export const STUDIO_RATE = {
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
  | "studio_free_photos_high";

export type LimitVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: StudioErrorCode; readonly retryAfterSeconds: number };

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

/** One more identity for this address (studioAddress)? 429 rate_limited past 60 an hour. */
export async function paceIdentity(db: D1Database, address: string, now = Date.now()): Promise<LimitVerdict> {
  const { action, limit, windowMs } = STUDIO_RATE.identity;
  return verdict(await consumeRateLimit(db, action, address, { limit, windowMs }, new Date(now)), "rate_limited");
}

/**
 * One more job start for `subject`, then for the site. 429 rate_limited past
 * 6 starts in 10 minutes; 503 studio_busy past STUDIO_JOB_GLOBAL_PER_MIN a
 * minute. A start the subject's own limit refuses does not count for the site.
 */
export async function paceJobStart(db: D1Database, subject: string, config: StudioConfig, now = Date.now()): Promise<LimitVerdict> {
  const at = new Date(now);
  const job = STUDIO_RATE.job;
  const own = verdict(await consumeRateLimit(db, job.action, subject, { limit: job.limit, windowMs: job.windowMs }, at), "rate_limited");
  if (!own.ok) return own;
  const site = STUDIO_RATE.jobGlobal;
  return verdict(await consumeRateLimit(db, site.action, "all", { limit: config.jobGlobalPerMin, windowMs: site.windowMs }, at), "studio_busy");
}

export type BudgetVerdict =
  | { readonly ok: true; readonly alerts: readonly StudioAlert[] }
  | { readonly ok: false; readonly code: "studio_busy"; readonly alerts: readonly StudioAlert[] };

/**
 * The free tier's budget of the UTC day (gpt_model_spend "studio_free",
 * reserved + actual, micro-USD) against STUDIO_FREE_DAILY_USD:
 *   - spent, or a budget of 0: refused for everybody;
 *   - 80% or more: an alert, and a young identity is refused while older
 *     ones are still served;
 *   - unreadable: refused (money fails closed).
 * This is the check before a unit is reserved. The model call itself still
 * reserves its own worst case on the bucket (spend.ts), which cannot pass the cap.
 */
export async function freeBudgetGate(db: D1Database, config: StudioConfig, young: boolean, now = Date.now()): Promise<BudgetVerdict> {
  const cap = Math.round(config.freeDailyUsd * 1_000_000);
  if (cap <= 0) return { ok: false, code: "studio_busy", alerts: [] };
  let spent: number;
  try {
    const row = await db
      .prepare("SELECT reserved_micro, actual_micro FROM gpt_model_spend WHERE org_id=? AND day=? AND bucket=?")
      .bind(STUDIO_ORG, spendDay(now), STUDIO_FREE_BUCKET)
      .first<{ reserved_micro: number; actual_micro: number }>();
    spent = Number(row?.reserved_micro ?? 0) + Number(row?.actual_micro ?? 0);
  } catch {
    return { ok: false, code: "studio_busy", alerts: [] };
  }
  if (spent >= cap) return { ok: false, code: "studio_busy", alerts: ["studio_free_budget_spent"] };
  if (spent >= cap * FREE_BUDGET_ALERT_SHARE) {
    const alerts: StudioAlert[] = ["studio_free_budget_80"];
    return young ? { ok: false, code: "studio_busy", alerts } : { ok: true, alerts };
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
 * Record each alert once per hour (gpt_service_alerts). Best-effort: a failed
 * write never fails the visitor's request. Pass it to waitUntil.
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

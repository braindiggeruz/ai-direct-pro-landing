// Jobs: how a generation starts, what it may still do, when it ends, and
// when it may be made again (spec §2.3, §2.4, §5.4, §7.1). The SQL is in
// ledger.ts; this file holds the rules and strings the transitions together.
//
// Start (startJob)
//   1. the same request id again: the same job, no second unit (idempotent);
//   2. one open job per person (409 job_in_progress);
//   3. the unit: free (free-usage.ts admitFreeUnit: daily units, the IP
//      ceiling of young identities, the ramp, the budget, 5 returns a day),
//      an entitlement (the live one that ends soonest, 402 no_units), or a
//      regeneration (no unit: the rules below);
//   4. the row in 'reserved' for 10 minutes. If it cannot be written, the
//      unit this start took goes back.
//   The endpoint paces starts (limits.ts paceJobStart) and checks Turnstile
//   before calling this.
//
// Steps (jobMeter): every model call takes a step under the job's cap
//   (outline 2 + 2 per part + 4 spare for a full deck, spec §7.1; 2 + 2 for
//   the free deck; 2 + 1 length retry for a photo) and reserves its worst
//   case on the day's spend bucket (spend.ts). A call the cap or the bucket
//   refuses is not made.
//
// Delivery (handOut): content leaves only after its part's bit was written.
// Faults (failPart): the part's bit goes into the fault mask; when the job
//   has no call left it is released at once, without waiting for expiry.
//   Only server faults count: a request the person aborted is not a fault.
// Refusals (refuseJob): a filter, the provider or an unreadable photo; the
//   unit goes back and the answer carries no content (422).
// Expiry (expireDueJobs, the maintenance tick):
//   nothing delivered                         → released, expired_empty
//   something delivered, a faulted part left  → released, fault
//   something delivered, no fault             → done: the person left, the unit is spent
//   and whatever is still reserved on the row becomes spend.
//
// Regeneration (spec §2.4): one per spent paid unit, of the same task, within
// 24 hours of the result and the entitlement's term, never of a
// regeneration. It runs exactly like the first generation (the same shape,
// parts and caps) and needs no unit, so money never refuses it.
import type { AdmitCall, CallRecord, LedgerFault, TextStep } from "./llm";
import type { StudioConfig } from "./config";
import type { StudioErrorCode } from "./http";
import { studioLog } from "./http";
import type { StudioAlert } from "./limits";
import {
  admitFreeUnit,
  freeDay,
  FreeUsageStore,
  isPersonSubject,
  nextFreeResetAt,
  RETURNED_DAILY_CAP,
  RETURNED_UNIT,
} from "./free-usage";
import {
  JOB_TTL_DELIVERED_MS,
  JOB_TTL_MS,
  LedgerStore,
  REQUEST_ID,
  isPartBit,
  newJobId,
  type EntitlementMode,
  type EntitlementTerm,
  type JobShape,
  type LedgerJob,
  type NewJob,
  type PaidUnit,
} from "./ledger";
import { DECK_SHAPES, SPARE_PART_CALLS, STEP_LIMITS, deckParts, type StudioTool, type StudioUnit } from "./plans";
import { JobSpend, billedMicro, photoCallMicro, reserveDayOf, textCallMicro, usageOf, type SpendConfig } from "./spend";

/** A regeneration is allowed this long after the result. */
export const REGEN_WINDOW_MS = 24 * 3_600_000;
/** Bit 0: the outline of a full deck, or the only part of a free deck or a photo. */
export const OUTLINE_BIT = 1;

const INPUT_MAC = /^[0-9a-f]{32}$/;
const CONSENT = /^photo-v\d{1,3}$/;

// ── Rules ───────────────────────────────────────────────────────────────────

/** The unit a tool and shape spend, or null for a combination that does not exist. */
export function unitOf(tool: StudioTool, shape: JobShape): StudioUnit | null {
  if (tool === "presentation" && shape === "free") return "presentation_free";
  if (tool === "presentation" && shape === "full") return "presentation_full";
  if (tool === "photo" && shape === "photo") return "photo_task";
  return null;
}

/** Bits a job delivers: one for a free deck or a photo; the outline plus one per part of ≤ 4 slides for a full deck. */
export function partsTotalOf(shape: JobShape, slides = 0): number {
  return shape === "full" ? 1 + deckParts(slides) : 1;
}

/** The bit of slide part `part` (1..4) of a full deck. */
export function slidePartBit(part: number): number {
  if (!Number.isInteger(part) || part < 1 || part > 4) throw new Error("studio job: slide part 1..4");
  return 1 << part;
}

/** All bits of a job with `partsTotal` parts: the job is done when parts_done equals it. */
export function fullMask(partsTotal: number): number {
  return (1 << partsTotal) - 1;
}

/** The most model calls the job may make (its `steps` cap; plans.ts maxJobModelCalls for decks). */
export function maxSteps(job: Pick<LedgerJob, "shape" | "partsTotal">): number {
  switch (job.shape) {
    case "full":
      return STEP_LIMITS.outline.attempts + STEP_LIMITS.part.attempts * (job.partsTotal - 1) + SPARE_PART_CALLS.full;
    case "free":
      return STEP_LIMITS.free.attempts + SPARE_PART_CALLS.free;
    case "photo":
      return STEP_LIMITS.photo.attempts + STEP_LIMITS.photo.lengthRetries;
  }
}

/** An open job (it may still deliver). */
export function isOpen(job: Pick<LedgerJob, "state" | "expiresAt">, now: number): boolean {
  return (job.state === "reserved" || job.state === "delivering") && job.expiresAt > now;
}

export type ExpiryOutcome =
  | { readonly kind: "done" }
  | { readonly kind: "release"; readonly reason: "expired_empty" | "fault" };

/** What an expired open job becomes (spec §2.3 item 5). */
export function expiryOutcome(job: Pick<LedgerJob, "partsDone" | "fault">): ExpiryOutcome {
  if (job.partsDone === 0) return { kind: "release", reason: "expired_empty" };
  if (job.fault !== null) return { kind: "release", reason: "fault" };
  return { kind: "done" };
}

export type RegenRefusal = Extract<StudioErrorCode, "not_found" | "job_state" | "regen_used" | "regen_window" | "regen_mismatch">;

/**
 * Whether `original` may be made again now by `subject` with `inputMac`
 * (spec §2.4), apart from the one-per-unit rule the partial unique index
 * enforces at the insert. Null: allowed.
 *   not someone's own job              → not_found
 *   a regeneration itself              → regen_used (its unit's one regeneration is that one)
 *   a free unit (Bepul has none)       → regen_window
 *   not done (released, refused, open) → job_state
 *   another task                       → regen_mismatch
 *   24 h after the result, or the entitlement ended or was revoked → regen_window
 */
export function regenVerdict(
  original: LedgerJob | null,
  entitlement: EntitlementTerm | null,
  request: { readonly subject: string; readonly inputMac: string; readonly now: number },
): RegenRefusal | null {
  if (!original || original.subject !== request.subject) return "not_found";
  if (original.regenOf !== null || original.source === "regen") return "regen_used";
  if (original.source !== "entitlement") return "regen_window";
  if (original.state !== "done") return "job_state";
  if (original.inputMac !== request.inputMac) return "regen_mismatch";
  if (original.settledAt === null || request.now - original.settledAt >= REGEN_WINDOW_MS) return "regen_window";
  if (!entitlement || entitlement.id !== original.entitlementId || entitlement.revokedAt !== null || entitlement.endsAt <= request.now) return "regen_window";
  return null;
}

// ── Start ───────────────────────────────────────────────────────────────────

export type JobSourceInput =
  | {
      readonly kind: "free";
      /** identity.ts isYoung: the IP ceiling and the 80% budget rule apply. */
      readonly young: boolean;
      /** limits.ts studioAddress of the request. */
      readonly address: string;
    }
  | { readonly kind: "entitlement"; readonly userId: string; readonly mode: EntitlementMode }
  | { readonly kind: "regen"; readonly regenOf: string };

export interface StartJobInput {
  readonly config: StudioConfig;
  /** b:<hmac> or a:<account>. */
  readonly subject: string;
  /** The browser's idempotency key. */
  readonly requestId: string;
  /** For a regeneration these two must describe the original; the input_mac decides. */
  readonly tool: StudioTool;
  readonly shape: JobShape;
  /** A full deck's slides (the parts follow from it). */
  readonly slides?: number;
  /** ledger.ts deckInputMac / photoInputMac of the request. */
  readonly inputMac: string;
  /** Photos: the consent the person saw, e.g. "photo-v1". */
  readonly consentVersion?: string | null;
  readonly source: JobSourceInput;
  readonly now?: number;
}

export type StartRefusal = Extract<
  StudioErrorCode,
  | "invalid"
  | "job_in_progress"
  | "free_limit"
  | "ip_ceiling"
  | "try_later"
  | "studio_busy"
  | "no_units"
  | "not_found"
  | "job_state"
  | "regen_used"
  | "regen_window"
  | "regen_mismatch"
>;

export type StartJobResult =
  | {
      readonly ok: true;
      readonly job: LedgerJob;
      /** The same request id came again: the job it made then, no second unit. */
      readonly replay: boolean;
      readonly alerts: readonly StudioAlert[];
    }
  | {
      readonly ok: false;
      readonly code: StartRefusal;
      /** free_limit, ip_ceiling, try_later: the next 05:00 in Tashkent, ISO. */
      readonly resetsAt?: string;
      readonly retryAfterSeconds?: number;
      readonly alerts: readonly StudioAlert[];
    };

/** The job a fresh row is, without reading it back. */
function reservedJob(job: NewJob): LedgerJob {
  return Object.freeze({
    ...job,
    state: "reserved",
    fault: null,
    reason: null,
    partsDone: 0,
    steps: 0,
    images: 0,
    costMicro: 0,
    reservedMicro: 0,
    expiresAt: job.createdAt + JOB_TTL_MS,
    settledAt: null,
  });
}

function sameStart(earlier: LedgerJob, input: StartJobInput): boolean {
  if (earlier.inputMac !== input.inputMac || earlier.source !== input.source.kind) return false;
  return input.source.kind === "regen" ? earlier.regenOf === input.source.regenOf : earlier.tool === input.tool;
}

async function hasOpenJob(store: LedgerStore, subject: string, now: number): Promise<boolean> {
  const recent = await store.recent(subject, now - JOB_TTL_DELIVERED_MS);
  return recent.some((job) => isOpen(job, now));
}

/** The person had RETURNED_DAILY_CAP attempts handed back today: new paid starts wait for 05:00 too. */
async function returnedCapReached(db: D1Database, subject: string, now: number): Promise<boolean> {
  return (await new FreeUsageStore(db).used(freeDay(now), subject, RETURNED_UNIT)) >= RETURNED_DAILY_CAP;
}

/**
 * Starts a job: one unit reserved (or none for a regeneration) and its row
 * in 'reserved'. Never throws; a D1 failure is 503 studio_busy with the unit
 * given back.
 */
export async function startJob(db: D1Database, input: StartJobInput): Promise<StartJobResult> {
  const now = input.now ?? Date.now();
  const alerts: StudioAlert[] = [];
  const refuse = (code: StartRefusal, extra: { resetsAt?: string; retryAfterSeconds?: number } = {}): StartJobResult => ({
    ok: false,
    code,
    ...extra,
    alerts,
  });
  const untilReset = () => ({
    resetsAt: new Date(nextFreeResetAt(now)).toISOString(),
    retryAfterSeconds: Math.max(1, Math.ceil((nextFreeResetAt(now) - now) / 1000)),
  });

  const { subject, requestId, source } = input;
  if (!isPersonSubject(subject) || !REQUEST_ID.test(requestId) || !INPUT_MAC.test(input.inputMac)) return refuse("invalid");
  const consentVersion = input.consentVersion ?? null;
  if (consentVersion !== null && !CONSENT.test(consentVersion)) return refuse("invalid");

  const store = new LedgerStore(db);
  const replayOrBusy = async (): Promise<StartJobResult> => {
    try {
      const earlier = await store.byRequest(subject, requestId);
      if (earlier && sameStart(earlier, input)) return { ok: true, job: earlier, replay: true, alerts };
    } catch {
      /* fall through */
    }
    return refuse("studio_busy");
  };

  try {
    const earlier = await store.byRequest(subject, requestId);
    if (earlier) return sameStart(earlier, input) ? { ok: true, job: earlier, replay: true, alerts } : refuse("invalid");
    if (await hasOpenJob(store, subject, now)) return refuse("job_in_progress");
  } catch {
    return refuse("studio_busy");
  }

  const base = { id: newJobId(), requestId, subject, inputMac: input.inputMac, reserveDay: reserveDayOf(now), createdAt: now };

  if (source.kind === "regen") {
    let original: LedgerJob | null;
    let term: EntitlementTerm | null;
    try {
      if (await returnedCapReached(db, subject, now)) return refuse("try_later", untilReset());
      original = await store.get(source.regenOf);
      term = original?.entitlementId ? await store.entitlement(original.entitlementId) : null;
    } catch {
      return refuse("studio_busy");
    }
    const verdict = regenVerdict(original, term, { subject, inputMac: input.inputMac, now });
    if (verdict || !original) return refuse(verdict ?? "not_found");
    // The full form of the first generation: same tool, unit, shape and parts.
    const job: NewJob = {
      ...base,
      tool: original.tool,
      unit: original.unit,
      source: "regen",
      entitlementId: original.entitlementId,
      regenOf: original.id,
      consentVersion: original.tool === "photo" ? consentVersion ?? original.consentVersion : null,
      partsTotal: original.partsTotal,
      shape: original.shape,
    };
    try {
      await store.insert(job);
    } catch (error) {
      const replay = await replayOrBusy();
      if (replay.ok) return replay;
      // idx_studio_ledger_one_regen: this unit's regeneration exists already.
      return refuse(/regen_of/.test(String(error)) ? "regen_used" : "studio_busy");
    }
    return { ok: true, job: reservedJob(job), replay: false, alerts };
  }

  const unit = unitOf(input.tool, input.shape);
  if (!unit) return refuse("invalid");
  if (input.shape === "full") {
    const slides = input.slides ?? 0;
    if (!Number.isInteger(slides) || slides < DECK_SHAPES.full.minSlides || slides > DECK_SHAPES.full.maxSlides) return refuse("invalid");
  }
  const common = {
    ...base,
    tool: input.tool,
    unit,
    regenOf: null,
    consentVersion: input.tool === "photo" ? consentVersion : null,
    partsTotal: partsTotalOf(input.shape, input.slides),
    shape: input.shape,
  };

  if (source.kind === "free") {
    if (unit === "presentation_full") return refuse("invalid");
    const admission = await admitFreeUnit(db, { config: input.config, subject, young: source.young, address: source.address, unit, now });
    alerts.push(...admission.alerts);
    if (!admission.ok) {
      return refuse(admission.code, { retryAfterSeconds: admission.retryAfterSeconds, ...(admission.resetsAt ? { resetsAt: admission.resetsAt } : {}) });
    }
    const job: NewJob = { ...common, source: "free", entitlementId: null };
    try {
      await store.insert(job);
    } catch {
      try {
        await new FreeUsageStore(db).untake(admission.day, subject, unit);
      } catch {
        studioLog("studio_job", "free_untake_failed");
      }
      return replayOrBusy();
    }
    return { ok: true, job: reservedJob(job), replay: false, alerts };
  }

  // A paid unit: the live entitlement that ends soonest (spec §2.3); a race
  // for its last unit gets one more pick.
  if (unit === "presentation_free") return refuse("invalid");
  const paidUnit: PaidUnit = unit;
  let entitlementId: string | null = null;
  try {
    if (await returnedCapReached(db, subject, now)) return refuse("try_later", untilReset());
    for (let round = 0; round < 2 && !entitlementId; round++) {
      const candidate = await store.pickEntitlement(source.userId, source.mode, paidUnit, now);
      if (!candidate) break;
      if (await store.debitEntitlement(candidate, paidUnit, now)) entitlementId = candidate;
    }
  } catch {
    return refuse("studio_busy");
  }
  if (!entitlementId) return refuse("no_units");
  const job: NewJob = { ...common, source: "entitlement", entitlementId };
  try {
    await store.insert(job);
  } catch {
    try {
      await store.undoDebit(entitlementId, paidUnit);
    } catch {
      studioLog("studio_job", "paid_undo_failed");
    }
    return replayOrBusy();
  }
  return { ok: true, job: reservedJob(job), replay: false, alerts };
}

// ── While it runs ───────────────────────────────────────────────────────────

/** The job `id` if it is `subject`'s, else null (another person's job is as good as none). */
export async function loadJob(db: D1Database, id: string, subject: string): Promise<LedgerJob | null> {
  const job = await new LedgerStore(db).get(id);
  return job && job.subject === subject ? job : null;
}

export interface JobMeter {
  /** llm.ts runTextStep's admit: a step under the job's cap, then the call's worst case on the spend bucket. */
  readonly admit: AdmitCall;
  /** After the step: each admitted call's reservation replaced by what it cost. */
  settle(calls: readonly CallRecord[]): Promise<void>;
  /** studio_free_budget_spent / studio_paid_stop when a bucket refused; record them (limits.ts recordStudioAlerts). */
  readonly alerts: readonly StudioAlert[];
}

/**
 * The meter of one step of `job`: `kind` is the text step (outline, part,
 * free) or "photo". Pass `admit` to the model client and call `settle` with
 * the step's calls when it returns, whatever the result.
 */
export function jobMeter(db: D1Database, config: SpendConfig, job: LedgerJob, kind: TextStep | "photo", clock: () => number = Date.now): JobMeter {
  const store = new LedgerStore(db);
  const spend = new JobSpend(db, job);
  const cap = maxSteps(job);
  const reservations: number[] = [];
  const alerts: StudioAlert[] = [];
  return {
    alerts,
    async admit({ model, maxTokens }) {
      let steps: number | null;
      try {
        steps = await store.takeStep(job.id, job.subject, cap, clock());
      } catch {
        return "busy";
      }
      if (steps === null) return "stop";
      let micro: number;
      try {
        micro = kind === "photo" ? photoCallMicro(model, maxTokens) : textCallMicro(model, kind, maxTokens);
      } catch {
        // A model without a shadow price is never called: its cost could not be capped.
        studioLog("studio_job", "unpriced_model");
        return "busy";
      }
      const admission = await spend.reserve(micro, config, clock());
      if (!admission.ok) {
        if (admission.kind === "closed") return "stop";
        if (admission.alert) alerts.push(admission.alert);
        return "busy";
      }
      reservations.push(Math.max(0, micro));
      return "ok";
    },
    async settle(calls) {
      // The client makes exactly one call per admitted attempt, in order.
      const pending = reservations.splice(0);
      for (const [index, reserved] of pending.entries()) {
        const call = calls[index];
        await spend.settle(reserved, call ? billedMicro(call, reserved) : reserved, call ? usageOf(call) : null);
      }
    },
  };
}

export type HandOut<T> =
  | { readonly ok: true; readonly content: T; readonly state: "delivering" | "done"; readonly partsDone: number }
  | { readonly ok: false; readonly code: "job_state" | "studio_busy" };

/**
 * The only way content leaves: part `bit` of the job is written first, and
 * `content` comes back only if that write returned its row. A closed,
 * expired or foreign job, a slide part before its outline, or a D1 failure
 * gives no content.
 */
export async function handOut<T>(db: D1Database, job: Pick<LedgerJob, "id" | "subject">, bit: number, content: T, now = Date.now()): Promise<HandOut<T>> {
  if (!isPartBit(bit)) return { ok: false, code: "job_state" };
  try {
    const written = await new LedgerStore(db).deliver(job.id, job.subject, bit, now);
    return written ? { ok: true, content, state: written.state, partsDone: written.partsDone } : { ok: false, code: "job_state" };
  } catch {
    return { ok: false, code: "studio_busy" };
  }
}

/**
 * Part `bit` ended in a server fault (llm.ts StepResult kind "fault"). It is
 * marked; a job with no call left cannot finish and is released at once.
 * `released`: this call handed the unit back.
 */
export async function failPart(db: D1Database, job: LedgerJob, bit: number, fault: LedgerFault, now = Date.now()): Promise<{ readonly marked: boolean; readonly released: boolean }> {
  const store = new LedgerStore(db);
  try {
    const marked = await store.markFault(job.id, job.subject, bit, fault);
    if (!marked) return { marked: false, released: false };
    if (marked.steps < maxSteps(job)) return { marked: true, released: false };
    return { marked: true, released: await store.close(job, "released", "fault", now) };
  } catch {
    studioLog("studio_job", "fault_unrecorded");
    return { marked: false, released: false };
  }
}

/**
 * A refusal closes the job and hands the unit back: topic_refused,
 * provider_refused, unreadable, photo_refused or safety_S<n>. The answer
 * carries no content. True when this call closed it.
 */
export async function refuseJob(db: D1Database, job: LedgerJob, reason: string, now = Date.now()): Promise<boolean> {
  try {
    return await new LedgerStore(db).close(job, "refused", reason, now);
  } catch {
    studioLog("studio_job", "refusal_unrecorded");
    return false;
  }
}

/**
 * Hands the unit back now: nothing went out yet, or a fault left a part
 * undelivered. Anything else stays as it is (a delivered job without a fault
 * is the person's to finish or leave). True when this call released it.
 */
export async function releaseJob(db: D1Database, job: LedgerJob, reason: "fault" | "expired_empty", now = Date.now()): Promise<boolean> {
  try {
    return await new LedgerStore(db).close(job, "released", reason, now);
  } catch {
    studioLog("studio_job", "release_failed");
    return false;
  }
}

export interface ExpirySweep {
  readonly scanned: number;
  readonly released: number;
  readonly done: number;
  /** Jobs whose open reservation became spend. */
  readonly converted: number;
  readonly failed: number;
  /** More expired jobs may be waiting: run again. */
  readonly more: boolean;
}

/**
 * The maintenance tick's sweep (T4.3 calls it behind its switch): up to 50
 * expired open jobs, each closed by expiryOutcome through the same guarded
 * transitions the requests use, so a request and the sweep at once return a
 * unit only once. Never throws.
 */
export async function expireDueJobs(db: D1Database, now = Date.now()): Promise<ExpirySweep> {
  const store = new LedgerStore(db);
  let due: LedgerJob[];
  try {
    due = await store.due(now);
  } catch {
    return { scanned: 0, released: 0, done: 0, converted: 0, failed: 1, more: true };
  }
  let released = 0;
  let done = 0;
  let converted = 0;
  let failed = 0;
  for (const job of due) {
    try {
      const outcome = expiryOutcome(job);
      if (outcome.kind === "done") {
        if (await store.expireDone(job.id, now)) done++;
      } else if (await store.close(job, "released", outcome.reason, now)) {
        released++;
      }
      if (job.reservedMicro > 0 && (await new JobSpend(db, job).convertOpen())) converted++;
    } catch {
      failed++;
    }
  }
  return { scanned: due.length, released, done, converted, failed, more: due.length >= 50 };
}

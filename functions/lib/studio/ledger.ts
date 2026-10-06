// The ledger of generations, studio_unit_ledger (spec §2.3, §2.4, §4.2, §4.3).
//
// One row per job. A unit and the counters behind it change only together
// with a guarded state change of its row:
//
//   reserve   free: the daily counters first (free-usage.ts admitFreeUnit),
//             then the row in 'reserved'. Paid: the entitlement's used+1,
//             guarded by its limit, term and revocation, then the row. A
//             regeneration: only the row; the partial unique index
//             idx_studio_ledger_one_regen keeps it to one per spent unit.
//             If the row cannot be written, the caller gives the unit back
//             (jobs.ts startJob).
//   deliver   a part's bit into parts_done, guarded by owner, open state and
//             expiry. Content leaves the server only when this write returned
//             its row (jobs.ts handOut). All bits → 'done': the unit is spent.
//   fault     the undelivered part's bit into the fault mask.
//   release / refuse
//             ONE D1 transaction: the person's free counter of the job's day
//             (or the entitlement's used) −1 and 'returned' +1, each
//             conditioned on the row still being releasable, and last the
//             guarded transition itself. Whoever runs it first (the request
//             or the expiry sweep) returns the unit; the other changes
//             nothing. The address and site counters and the money spent are
//             never lowered (spec §4.3).
//   expire    done when parts went out and no undelivered part faulted
//             (the person left); otherwise a release (jobs.ts).
//
// The fault column holds "<mask>:<code>": the mask of undelivered parts whose
// last attempt was a server fault, and the latest fault code. The parts of a
// full deck run in parallel, so a success of one part must not clear the
// fault of another: delivering a bit clears only that bit, and the column is
// NULL exactly when no undelivered part faulted. That keeps the offer's rule
// (О-7) for parallel parts: a deck shown only in part because of a fault
// costs no unit.
//
// No topic, outline, slide, answer or picture is ever written here: the
// input is kept only as input_mac, an HMAC under GPT_IDENTITY_SECRET.
import type { LedgerFault } from "./llm";
import { freeDay, isPersonSubject, RETURNED_UNIT } from "./free-usage";
import type { StudioTool, StudioUnit } from "./plans";
import type { StudioAudience, StudioLocale } from "./prompts";
import { normalizeTopic } from "./safety";
import { STUDIO_ORG } from "./schema";
import { hex, hmacBytes, type SignEnv } from "./sign";

export type LedgerState = "reserved" | "delivering" | "done" | "released" | "refused";
export type LedgerSource = "free" | "entitlement" | "regen";
/** studio_unit_ledger.shape. */
export type JobShape = "free" | "full" | "photo";
export type EntitlementMode = "test" | "live";
/** studio_entitlements units: presentation_free is never bought. */
export type PaidUnit = Exclude<StudioUnit, "presentation_free">;

/** A job lives this long from its start. */
export const JOB_TTL_MS = 10 * 60_000;
/** Once a part went out, until this long after the start: pictures and the other parts follow. */
export const JOB_TTL_DELIVERED_MS = 15 * 60_000;
/** Bit 0 and up to four slide parts (15 slides in parts of 4). */
export const MAX_PARTS_TOTAL = 5;
/** Expired jobs one sweep closes at most (spec §4.3). */
export const DUE_BATCH = 50;

const JOB_ID = /^sj_[0-9a-f]{32}$/;
/** The browser's idempotency key of a start. */
export const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const INPUT_MAC = /^[0-9a-f]{32}$/;
const CONSENT = /^photo-v\d{1,3}$/;
/** Coarse closing reasons. Never a topic, an answer or a prompt. */
const REASON = /^(?:fault|expired_empty|topic_refused|provider_refused|unreadable|photo_refused|safety_[A-Za-z0-9]{1,12})$/;
const FAULTS: readonly LedgerFault[] = ["model_failed", "invalid_output", "timeout", "busy"];
/** A shorter GPT_IDENTITY_SECRET counts as unset, as everywhere else in the code. */
const MIN_SECRET_LENGTH = 32;

export interface LedgerJob {
  readonly id: string;
  readonly requestId: string;
  readonly tool: StudioTool;
  readonly unit: StudioUnit;
  readonly source: LedgerSource;
  readonly entitlementId: string | null;
  /** b:<hmac> (a browser) or a:<account>. */
  readonly subject: string;
  readonly regenOf: string | null;
  readonly inputMac: string;
  readonly consentVersion: string | null;
  readonly state: LedgerState;
  /** "<mask>:<code>" or null; read it with faultMask() / faultCode(). */
  readonly fault: string | null;
  readonly reason: string | null;
  readonly partsTotal: number;
  readonly partsDone: number;
  readonly steps: number;
  readonly images: number;
  readonly shape: JobShape;
  readonly costMicro: number;
  readonly reservedMicro: number;
  /** The gpt_model_spend day every reservation of this job is made and settled on. */
  readonly reserveDay: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly settledAt: number | null;
}

interface JobRow {
  id: string;
  request_id: string;
  tool: StudioTool;
  unit: StudioUnit;
  source: LedgerSource;
  entitlement_id: string | null;
  subject: string;
  regen_of: string | null;
  input_mac: string;
  consent_version: string | null;
  state: LedgerState;
  fault: string | null;
  reason: string | null;
  parts_total: number;
  parts_done: number;
  steps: number;
  images: number;
  shape: JobShape;
  cost_micro: number;
  reserved_micro: number;
  reserve_day: string;
  created_at: number;
  expires_at: number;
  settled_at: number | null;
}

const JOB_COLUMNS =
  "id, request_id, tool, unit, source, entitlement_id, subject, regen_of, input_mac, consent_version, state, fault, reason, parts_total, parts_done, steps, images, shape, cost_micro, reserved_micro, reserve_day, created_at, expires_at, settled_at";

function toJob(row: JobRow): LedgerJob {
  return Object.freeze({
    id: row.id,
    requestId: row.request_id,
    tool: row.tool,
    unit: row.unit,
    source: row.source,
    entitlementId: row.entitlement_id ?? null,
    subject: row.subject,
    regenOf: row.regen_of ?? null,
    inputMac: row.input_mac,
    consentVersion: row.consent_version ?? null,
    state: row.state,
    fault: row.fault ?? null,
    reason: row.reason ?? null,
    partsTotal: Number(row.parts_total),
    partsDone: Number(row.parts_done),
    steps: Number(row.steps),
    images: Number(row.images),
    shape: row.shape,
    costMicro: Number(row.cost_micro),
    reservedMicro: Number(row.reserved_micro),
    reserveDay: row.reserve_day,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    settledAt: row.settled_at === null || row.settled_at === undefined ? null : Number(row.settled_at),
  });
}

/** A fresh job id: 'sj_' + 32 hex. */
export function newJobId(): string {
  return `sj_${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
}

export function isJobId(value: unknown): value is string {
  return typeof value === "string" && JOB_ID.test(value);
}

/** The undelivered parts whose last attempt was a server fault (0 when none). */
export function faultMask(fault: string | null): number {
  const mask = fault === null ? 0 : Number.parseInt(fault, 10);
  return Number.isFinite(mask) && mask > 0 ? mask : 0;
}

/** The latest server fault of a job, for reports; null when none is open. */
export function faultCode(fault: string | null): LedgerFault | null {
  const code = fault?.slice(fault.indexOf(":") + 1) ?? "";
  return (FAULTS as readonly string[]).includes(code) ? (code as LedgerFault) : null;
}

/** A single part bit: 1 (bit 0) … 16 (bit 4). */
export function isPartBit(bit: number): boolean {
  return Number.isInteger(bit) && bit >= 1 && bit < 1 << MAX_PARTS_TOTAL && (bit & (bit - 1)) === 0;
}

// ── input_mac (spec §2.4) ───────────────────────────────────────────────────

/** What makes two deck requests "the same task": a regeneration must match it exactly. */
export interface DeckInput {
  readonly topic: string;
  readonly locale: StudioLocale;
  readonly audience: StudioAudience;
  readonly slides: number;
  readonly palette: number;
  readonly shape: "free" | "full";
}

export const INPUT_MAC_PREFIX = "studio-input-v1:";

function secretOf(env: SignEnv): string | null {
  const value = env.GPT_IDENTITY_SECRET || "";
  return value.length >= MIN_SECRET_LENGTH ? value : null;
}

async function inputMac(env: SignEnv, fields: readonly (string | number)[]): Promise<string | null> {
  const secret = secretOf(env);
  if (!secret) return null;
  // A JSON array: no field can run into the next one.
  return hex((await hmacBytes(secret, INPUT_MAC_PREFIX + JSON.stringify(fields))).slice(0, 16));
}

/**
 * HMAC of a deck request: the topic as safety.ts normalizeTopic sees it (NFC,
 * trimmed, single spaces, lower case), language, audience, slides, palette
 * and the kind of deck. 32 hex; null without a usable GPT_IDENTITY_SECRET.
 */
export function deckInputMac(env: SignEnv, input: DeckInput): Promise<string | null> {
  return inputMac(env, ["deck", normalizeTopic(input.topic), input.locale, input.audience, input.slides, input.palette, input.shape]);
}

/** HMAC of the SHA-256 of a photo's bytes after the server stripped its metadata. The bytes are not kept. */
export async function photoInputMac(env: SignEnv, cleanedImage: Uint8Array | ArrayBuffer): Promise<string | null> {
  if (!secretOf(env)) return null;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(cleanedImage)));
  return inputMac(env, ["photo", hex(digest)]);
}

// ── The store ───────────────────────────────────────────────────────────────

export interface NewJob {
  readonly id: string;
  readonly requestId: string;
  readonly tool: StudioTool;
  readonly unit: StudioUnit;
  readonly source: LedgerSource;
  readonly entitlementId: string | null;
  readonly subject: string;
  readonly regenOf: string | null;
  readonly inputMac: string;
  readonly consentVersion: string | null;
  readonly partsTotal: number;
  readonly shape: JobShape;
  readonly reserveDay: string;
  readonly createdAt: number;
}

export interface EntitlementTerm {
  readonly id: string;
  readonly userId: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly revokedAt: number | null;
}

export interface Delivered {
  readonly state: "delivering" | "done";
  readonly partsDone: number;
  readonly expiresAt: number;
}

export interface FaultMarked {
  readonly fault: string | null;
  readonly steps: number;
  readonly partsDone: number;
  readonly partsTotal: number;
}

export interface ModelUsage {
  /** The model that answered; null for pictures and conversions. */
  readonly model: string | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly reasoningTokens: number;
}

/**
 * Every SQL statement of studio_unit_ledger, each by a full key or with a
 * LIMIT. The releasable guard of close() is spelled out in each of its
 * statements, so the D1 linter reads them whole:
 *   (state='reserved' OR (state='delivering' AND (fault IS NOT NULL OR ?=1)))
 * nothing went out, or a fault left a part undelivered; a refusal (?=1) also
 * closes a job mid-way.
 */
export class LedgerStore {
  constructor(
    readonly db: D1Database,
    readonly org: string = STUDIO_ORG,
  ) {}

  /** The job `id`, or null. */
  async get(id: string): Promise<LedgerJob | null> {
    if (!isJobId(id)) return null;
    const row = await this.db
      .prepare(`SELECT ${JOB_COLUMNS} FROM studio_unit_ledger WHERE org_id=? AND id=?`)
      .bind(this.org, id)
      .first<JobRow>();
    return row ? toJob(row) : null;
  }

  /** The job a start with this request id already made (idempotency), or null. */
  async byRequest(subject: string, requestId: string): Promise<LedgerJob | null> {
    const row = await this.db
      .prepare(`SELECT ${JOB_COLUMNS} FROM studio_unit_ledger WHERE org_id=? AND subject=? AND request_id=?`)
      .bind(this.org, subject, requestId)
      .first<JobRow>();
    return row ? toJob(row) : null;
  }

  /** The subject's jobs started after `since`, newest first (at most 20). */
  async recent(subject: string, since: number): Promise<Array<Pick<LedgerJob, "id" | "state" | "expiresAt" | "unit" | "source">>> {
    const { results } = await this.db
      .prepare("SELECT id, state, expires_at, unit, source FROM studio_unit_ledger WHERE org_id=? AND subject=? AND created_at>? ORDER BY created_at DESC LIMIT 20")
      .bind(this.org, subject, since)
      .all<{ id: string; state: LedgerState; expires_at: number; unit: StudioUnit; source: LedgerSource }>();
    return (results ?? []).map((row) => ({ id: row.id, state: row.state, expiresAt: Number(row.expires_at), unit: row.unit, source: row.source }));
  }

  /** Writes a job in 'reserved', expiring JOB_TTL_MS after its start. Throws on a constraint (request replay, a second regeneration). */
  async insert(job: NewJob): Promise<void> {
    if (!isJobId(job.id) || !REQUEST_ID.test(job.requestId) || !INPUT_MAC.test(job.inputMac)) throw new Error("studio_unit_ledger: malformed job");
    if (!isPersonSubject(job.subject)) throw new Error("studio_unit_ledger: not a person's subject");
    if (job.consentVersion !== null && !CONSENT.test(job.consentVersion)) throw new Error("studio_unit_ledger: malformed consent");
    if (!Number.isInteger(job.partsTotal) || job.partsTotal < 1 || job.partsTotal > MAX_PARTS_TOTAL) throw new Error("studio_unit_ledger: parts");
    await this.db
      .prepare(
        `INSERT INTO studio_unit_ledger(org_id,id,request_id,tool,unit,source,entitlement_id,subject,regen_of,input_mac,consent_version,state,parts_total,shape,reserve_day,created_at,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'reserved',?,?,?,?,?)`,
      )
      .bind(
        this.org, job.id, job.requestId, job.tool, job.unit, job.source, job.entitlementId, job.subject, job.regenOf,
        job.inputMac, job.consentVersion, job.partsTotal, job.shape, job.reserveDay, job.createdAt, job.createdAt + JOB_TTL_MS,
      )
      .run();
  }

  // ── Entitlements (the paid unit behind a job) ──

  /** The person's live entitlement with a unit of `unit` left that ends soonest (spec §2.3), or null. */
  async pickEntitlement(userId: string, mode: EntitlementMode, unit: PaidUnit, now: number): Promise<string | null> {
    const sql = unit === "presentation_full"
      ? "SELECT id FROM studio_entitlements WHERE org_id=? AND user_id=? AND mode=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>? AND presentations_used<presentations_limit ORDER BY ends_at,id LIMIT 1"
      : "SELECT id FROM studio_entitlements WHERE org_id=? AND user_id=? AND mode=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>? AND photos_used<photos_limit ORDER BY ends_at,id LIMIT 1";
    const row = await this.db.prepare(sql).bind(this.org, userId, mode, now, now).first<{ id: string }>();
    return row?.id ?? null;
  }

  /** One unit off entitlement `id` if it still has one, is live and not revoked; false when another start took the last one. */
  async debitEntitlement(id: string, unit: PaidUnit, now: number): Promise<boolean> {
    const sql = unit === "presentation_full"
      ? "UPDATE studio_entitlements SET presentations_used=presentations_used+1 WHERE org_id=? AND id=? AND presentations_used<presentations_limit AND revoked_at IS NULL AND starts_at<=? AND ends_at>? RETURNING id"
      : "UPDATE studio_entitlements SET photos_used=photos_used+1 WHERE org_id=? AND id=? AND photos_used<photos_limit AND revoked_at IS NULL AND starts_at<=? AND ends_at>? RETURNING id";
    return !!(await this.db.prepare(sql).bind(this.org, id, now, now).first<{ id: string }>());
  }

  /** Gives back a unit this same start took when its row could not be written (never below zero). */
  async undoDebit(id: string, unit: PaidUnit): Promise<void> {
    const sql = unit === "presentation_full"
      ? "UPDATE studio_entitlements SET presentations_used=presentations_used-1 WHERE org_id=? AND id=? AND presentations_used>0"
      : "UPDATE studio_entitlements SET photos_used=photos_used-1 WHERE org_id=? AND id=? AND photos_used>0";
    await this.db.prepare(sql).bind(this.org, id).run();
  }

  /** The term of entitlement `id` (a regeneration needs it live), or null. */
  async entitlement(id: string): Promise<EntitlementTerm | null> {
    const row = await this.db
      .prepare("SELECT id, user_id, starts_at, ends_at, revoked_at FROM studio_entitlements WHERE org_id=? AND id=?")
      .bind(this.org, id)
      .first<{ id: string; user_id: string; starts_at: number; ends_at: number; revoked_at: number | null }>();
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      startsAt: Number(row.starts_at),
      endsAt: Number(row.ends_at),
      revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : Number(row.revoked_at),
    };
  }

  // ── Transitions ──

  /**
   * Records that part `bit` of the job goes out now. Returns the row after
   * the write, or null: not this subject's job, closed, expired, a bit the
   * job does not have, or a slide part before the outline (bit 0). Only a
   * returned row lets the content leave. The first delivery stretches the
   * job's life to JOB_TTL_DELIVERED_MS from its start.
   */
  async deliver(id: string, subject: string, bit: number, now: number): Promise<Delivered | null> {
    if (!isPartBit(bit)) return null;
    const row = await this.db
      .prepare(
        `UPDATE studio_unit_ledger SET parts_done=parts_done|?1,
        fault=CASE WHEN (COALESCE(CAST(fault AS INTEGER),0)&~(parts_done|?1))=0 THEN NULL
          ELSE ((CAST(fault AS INTEGER)&~(parts_done|?1))||substr(fault,instr(fault,':'))) END,
        state=CASE WHEN (parts_done|?1)=(1<<parts_total)-1 THEN 'done' ELSE 'delivering' END,
        settled_at=CASE WHEN (parts_done|?1)=(1<<parts_total)-1 THEN ?2 ELSE settled_at END,
        total_ms=CASE WHEN (parts_done|?1)=(1<<parts_total)-1 THEN ?2-created_at ELSE total_ms END,
        expires_at=MAX(expires_at,created_at+?3)
      WHERE org_id=?4 AND id=?5 AND subject=?6 AND state IN ('reserved','delivering') AND expires_at>?2
        AND ?1<(1<<parts_total) AND (?1=1 OR (parts_done&1)=1)
      RETURNING state, parts_done, expires_at`,
      )
      .bind(bit, now, JOB_TTL_DELIVERED_MS, this.org, id, subject)
      .first<{ state: "delivering" | "done"; parts_done: number; expires_at: number }>();
    return row ? { state: row.state, partsDone: Number(row.parts_done), expiresAt: Number(row.expires_at) } : null;
  }

  /**
   * The last attempt of part `bit` ended in a server fault. An open job of
   * this subject gets the bit in its fault mask and the code as the latest
   * fault; a part already delivered changes nothing. Returns the counters the caller needs to
   * decide whether the job can still finish, or null when it is not open.
   */
  async markFault(id: string, subject: string, bit: number, code: LedgerFault): Promise<FaultMarked | null> {
    if (!isPartBit(bit) || !FAULTS.includes(code)) return null;
    const row = await this.db
      .prepare(
        `UPDATE studio_unit_ledger SET fault=CASE WHEN (?1&parts_done)<>0 THEN fault
          ELSE (((COALESCE(CAST(fault AS INTEGER),0)|?1)&~parts_done)||':'||?2) END
      WHERE org_id=?3 AND id=?4 AND subject=?5 AND state IN ('reserved','delivering') AND ?1<(1<<parts_total)
      RETURNING fault, steps, parts_done, parts_total`,
      )
      .bind(bit, code, this.org, id, subject)
      .first<{ fault: string | null; steps: number; parts_done: number; parts_total: number }>();
    return row
      ? { fault: row.fault ?? null, steps: Number(row.steps), partsDone: Number(row.parts_done), partsTotal: Number(row.parts_total) }
      : null;
  }

  /** One more model call for an open job under `maxSteps`; the count after, or null. */
  async takeStep(id: string, subject: string, maxSteps: number, now: number): Promise<number | null> {
    const row = await this.db
      .prepare(
        "UPDATE studio_unit_ledger SET steps=steps+1 WHERE org_id=? AND id=? AND subject=? AND state IN ('reserved','delivering') AND steps<? AND expires_at>? RETURNING steps",
      )
      .bind(this.org, id, subject, maxSteps, now)
      .first<{ steps: number }>();
    return row ? Number(row.steps) : null;
  }

  /**
   * One more picture (Flux call) for a job whose bit 0 went out, while it
   * lives, under `cap` (sign.ts imageCallCap). Two requests at once cannot
   * both take the last one. The count after, or null.
   */
  async takeImageCall(id: string, subject: string, cap: number, now: number): Promise<number | null> {
    const row = await this.db
      .prepare(
        "UPDATE studio_unit_ledger SET images=images+1 WHERE org_id=? AND id=? AND subject=? AND state IN ('delivering','done') AND (parts_done&1)=1 AND images<? AND expires_at>? RETURNING images",
      )
      .bind(this.org, id, subject, cap, now)
      .first<{ images: number }>();
    return row ? Number(row.images) : null;
  }

  /**
   * Closes `job` as 'released' (a server fault, or nothing delivered) or
   * 'refused' (a filter, the provider, an unreadable photo), handing its unit
   * back. One transaction: the counters move only if the guarded transition
   * of the same transaction happens. True when this call closed the job.
   */
  async close(job: LedgerJob, state: "released" | "refused", reason: string, now: number): Promise<boolean> {
    if (!REASON.test(reason)) throw new Error("studio_unit_ledger: reason");
    const refusal = state === "refused" ? 1 : 0;
    const day = freeDay(job.createdAt);
    const releasable = [this.org, job.id, refusal] as const;
    const statements: D1PreparedStatement[] = [];
    if (job.source === "free") {
      statements.push(
        this.db
          .prepare(
            `UPDATE studio_free_usage SET used=used-1 WHERE org_id=? AND day=? AND subject=? AND unit=? AND used>0
          AND EXISTS (SELECT 1 FROM studio_unit_ledger WHERE org_id=? AND id=? AND (state='reserved' OR (state='delivering' AND (fault IS NOT NULL OR ?=1))))`,
          )
          .bind(this.org, day, job.subject, job.unit, ...releasable),
      );
    } else if (job.source === "entitlement" && job.entitlementId) {
      const sql = job.unit === "presentation_full"
        ? `UPDATE studio_entitlements SET presentations_used=presentations_used-1 WHERE org_id=? AND id=? AND presentations_used>0
          AND EXISTS (SELECT 1 FROM studio_unit_ledger WHERE org_id=? AND id=? AND (state='reserved' OR (state='delivering' AND (fault IS NOT NULL OR ?=1))))`
        : `UPDATE studio_entitlements SET photos_used=photos_used-1 WHERE org_id=? AND id=? AND photos_used>0
          AND EXISTS (SELECT 1 FROM studio_unit_ledger WHERE org_id=? AND id=? AND (state='reserved' OR (state='delivering' AND (fault IS NOT NULL OR ?=1))))`;
      statements.push(this.db.prepare(sql).bind(this.org, job.entitlementId, ...releasable));
    }
    // A regeneration took no unit; like any handed-back attempt it counts in 'returned'.
    statements.push(
      this.db
        .prepare(
          `INSERT INTO studio_free_usage(org_id,day,subject,unit,used) VALUES(?,?,?,?,0)
        ON CONFLICT(org_id,day,subject,unit) DO NOTHING`,
        )
        .bind(this.org, day, job.subject, RETURNED_UNIT),
      this.db
        .prepare(
          `UPDATE studio_free_usage SET used=used+1 WHERE org_id=? AND day=? AND subject=? AND unit=?
        AND EXISTS (SELECT 1 FROM studio_unit_ledger WHERE org_id=? AND id=? AND (state='reserved' OR (state='delivering' AND (fault IS NOT NULL OR ?=1))))`,
        )
        .bind(this.org, day, job.subject, RETURNED_UNIT, ...releasable),
      this.db
        .prepare(
          `UPDATE studio_unit_ledger SET state=?, reason=?, settled_at=?
        WHERE org_id=? AND id=? AND (state='reserved' OR (state='delivering' AND (fault IS NOT NULL OR ?=1))) RETURNING state`,
        )
        .bind(state, reason, now, ...releasable),
    );
    const results = await this.db.batch(statements);
    return (results[results.length - 1]?.results?.length ?? 0) > 0;
  }

  /** An expired job with parts delivered and no faulted part left: the person left, the unit is spent. */
  async expireDone(id: string, now: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        "UPDATE studio_unit_ledger SET state='done', settled_at=? WHERE org_id=? AND id=? AND state='delivering' AND fault IS NULL AND parts_done>0 AND expires_at<=? RETURNING state",
      )
      .bind(now, this.org, id, now)
      .first<{ state: string }>();
    return !!row;
  }

  /** Open jobs past their expiry, oldest first, at most DUE_BATCH (idx_studio_ledger_due). */
  async due(now: number): Promise<LedgerJob[]> {
    const { results } = await this.db
      .prepare(`SELECT ${JOB_COLUMNS} FROM studio_unit_ledger WHERE org_id=? AND state IN ('reserved','delivering') AND expires_at<=? ORDER BY expires_at LIMIT 50`)
      .bind(this.org, now)
      .all<JobRow>();
    return (results ?? []).map(toJob);
  }

  // ── Spend mirror (spend.ts) ──

  /** Adds `micro` to the job's open reservation while it lives (pictures follow a done job); its reserve day, or null. */
  async addReserve(id: string, micro: number, now: number): Promise<string | null> {
    const row = await this.db
      .prepare(
        "UPDATE studio_unit_ledger SET reserved_micro=reserved_micro+? WHERE org_id=? AND id=? AND state IN ('reserved','delivering','done') AND expires_at>? RETURNING reserve_day",
      )
      .bind(micro, this.org, id, now)
      .first<{ reserve_day: string }>();
    return row?.reserve_day ?? null;
  }

  /**
   * Moves `reservedMicro` of the open reservation into cost_micro as
   * `actualMicro`, with the call's usage. Whatever the job's state: a call
   * may end after its job closed. Null when that much is no longer reserved
   * (the sweep already converted it): the caller must not settle it twice.
   */
  async settleReserve(id: string, reservedMicro: number, actualMicro: number, usage: ModelUsage | null): Promise<string | null> {
    const row = await this.db
      .prepare(
        `UPDATE studio_unit_ledger SET reserved_micro=reserved_micro-?, cost_micro=cost_micro+?, model=COALESCE(?,model),
        tokens_in=COALESCE(tokens_in,0)+?, tokens_out=COALESCE(tokens_out,0)+?, reasoning_tokens=COALESCE(reasoning_tokens,0)+?
      WHERE org_id=? AND id=? AND reserved_micro>=? RETURNING reserve_day`,
      )
      .bind(
        reservedMicro, actualMicro, usage?.model ?? null, usage?.tokensIn ?? 0, usage?.tokensOut ?? 0, usage?.reasoningTokens ?? 0,
        this.org, id, reservedMicro,
      )
      .first<{ reserve_day: string }>();
    return row?.reserve_day ?? null;
  }
}

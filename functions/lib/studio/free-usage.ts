// The free daily units (spec §2.6, §4.3, §5.4): studio_free_usage.
//
// The day is the UTC date, 05:00–05:00 in Tashkent, like the offer's «Сутки»
// and like gpt_model_spend. Rows are (org, day, subject, unit) → used:
//   b:<hmac>   a browser identity (identity.ts), the person's own units
//   a:<id>     an account without a browser identity (T3.2)
//   ip:<hash>  the address of YOUNG identities only (the IP ceiling)
//   all        the whole site: the ramp's ceiling on decks, and an alert
//   unit 'returned' counts the units handed back to a subject that day
//
// Taking a unit is one conditional upsert per counter, in this order:
//   1. the subject's own unit  (STUDIO_FREE_DAILY)            → 429 free_limit
//   2. young only: the address (STUDIO_IP_YOUNG_*)            → 429 ip_ceiling
//   3. the site                (STUDIO_RAMP_DECKS_DAILY, decks) → 503 studio_busy
// Each counter refuses at its limit inside the statement, so any number of
// parallel requests in any number of isolates cannot pass it. A step that
// refuses gives back what the earlier steps of the same call took: a refused
// request costs nobody a unit, and the site counter never counts refusals.
// Before that, the budget (limits.ts) and the 'returned' cap (5 a day) are read.
//
// Handing a unit back after a reservation (the ledger, T1.4) lowers only the
// subject's own counter and adds one to 'returned'. The address and site
// counters and the money spent are never lowered: whatever the attempt cost,
// it cost (spec §4.3).
//
// Any D1 failure is a refusal (503 studio_busy): nothing free is handed out
// while the database is in trouble.
import { STUDIO_FREE_DAILY } from "./plans";
import type { StudioConfig } from "./config";
import type { StudioErrorCode } from "./http";
import { freeBudgetGate, ipCeiling, rampCeiling, siteAlertAt, siteAlertCode, type StudioAlert } from "./limits";
import { STUDIO_ORG } from "./schema";

/** What /config and /me say about the reset, and the offer's «Сутки». */
export const FREE_RESETS_AT = "05:00 Asia/Tashkent";

export type FreeUnit = keyof typeof STUDIO_FREE_DAILY;
export const FREE_UNITS: readonly FreeUnit[] = ["presentation_free", "photo_task"];
/** The counter of units handed back to a subject that day. */
export const RETURNED_UNIT = "returned";
/** Units handed back to one subject a day before new starts answer 429 try_later. */
export const RETURNED_DAILY_CAP = 5;
/** The subject of the site-wide counters. */
export const SITE_SUBJECT = "all";

const DAY_MS = 86_400_000;
const PERSON = /^(?:b:[0-9a-f]{32}|a:[A-Za-z0-9_]{1,80})$/;
const ADDRESS = /^[0-9A-Za-z_]{16,80}$/;

/** The free day of `now`: its UTC date ('2026-10-14' from 05:00 on the 14th in Tashkent). */
export function freeDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** When the free day of `now` ends: the next 00:00 UTC (05:00 in Tashkent), in ms. */
export function nextFreeResetAt(now: number): number {
  return (Math.floor(now / DAY_MS) + 1) * DAY_MS;
}

/** A person's subject: a browser (b:) or an account (a:). Never an address or the site. */
export function isPersonSubject(subject: string): boolean {
  return PERSON.test(subject);
}

/** The counter subject of an address (limits.ts studioAddress, already hashed). */
export function ipSubject(address: string): string {
  if (!ADDRESS.test(address)) throw new Error("studio_free_usage: not a hashed address");
  return `ip:${address}`;
}

export type FreeCounterUnit = FreeUnit | typeof RETURNED_UNIT;

/** The SQL of studio_free_usage. Every statement names its full primary key. */
export class FreeUsageStore {
  constructor(
    readonly db: D1Database,
    readonly org: string = STUDIO_ORG,
  ) {}

  /** One more `unit` for `subject` on `day` unless it would pass `limit`; the count after, or null when refused. */
  async take(day: string, subject: string, unit: FreeCounterUnit, limit: number): Promise<number | null> {
    if (!(limit >= 1)) return null;
    const row = await this.db
      .prepare(
        `INSERT INTO studio_free_usage(org_id,day,subject,unit,used) VALUES(?,?,?,?,1)
      ON CONFLICT(org_id,day,subject,unit) DO UPDATE SET used=used+1 WHERE used<? RETURNING used`,
      )
      .bind(this.org, day, subject, unit, limit)
      .first<{ used: number }>();
    return row ? Number(row.used) : null;
  }

  /** One more `unit` for `subject` on `day`, without a limit; the count after. */
  async count(day: string, subject: string, unit: FreeCounterUnit): Promise<number> {
    const row = await this.db
      .prepare(
        `INSERT INTO studio_free_usage(org_id,day,subject,unit,used) VALUES(?,?,?,?,1)
      ON CONFLICT(org_id,day,subject,unit) DO UPDATE SET used=used+1 RETURNING used`,
      )
      .bind(this.org, day, subject, unit)
      .first<{ used: number }>();
    return Number(row?.used ?? 1);
  }

  /** Give back one `unit` taken by this same call; never below zero. */
  async untake(day: string, subject: string, unit: FreeCounterUnit): Promise<void> {
    await this.db
      .prepare("UPDATE studio_free_usage SET used=used-1 WHERE org_id=? AND day=? AND subject=? AND unit=? AND used>0")
      .bind(this.org, day, subject, unit)
      .run();
  }

  /** How many `unit` `subject` has used on `day` (0 without a row). */
  async used(day: string, subject: string, unit: FreeCounterUnit): Promise<number> {
    const row = await this.db
      .prepare("SELECT used FROM studio_free_usage WHERE org_id=? AND day=? AND subject=? AND unit=?")
      .bind(this.org, day, subject, unit)
      .first<{ used: number }>();
    return Number(row?.used ?? 0);
  }

  /** Both free units of `subject` on `day`, in one round trip. */
  async usedFree(day: string, subject: string): Promise<Record<FreeUnit, number>> {
    const read = (unit: FreeUnit) =>
      this.db
        .prepare("SELECT used FROM studio_free_usage WHERE org_id=? AND day=? AND subject=? AND unit=?")
        .bind(this.org, day, subject, unit);
    const [decks, photos] = await this.db.batch<{ used: number }>([read("presentation_free"), read("photo_task")]);
    return {
      presentation_free: Number(decks.results?.[0]?.used ?? 0),
      photo_task: Number(photos.results?.[0]?.used ?? 0),
    };
  }

  /**
   * Hand back a free unit after its reservation was released (the ledger
   * calls this only when its guarded transition returned a row): the
   * subject's own counter of `day` goes down by one, never below zero, and
   * 'returned' goes up, in one batch. Address and site counters stay.
   */
  async release(day: string, subject: string, unit: FreeUnit): Promise<void> {
    if (!isPersonSubject(subject)) throw new Error("studio_free_usage: release needs a person's subject");
    await this.db.batch([
      this.db
        .prepare("UPDATE studio_free_usage SET used=used-1 WHERE org_id=? AND day=? AND subject=? AND unit=? AND used>0")
        .bind(this.org, day, subject, unit),
      this.returnedStatement(day, subject),
    ]);
  }

  /** One more 'returned' for `subject` on `day` (a paid unit handed back: the entitlement is credited by the ledger). */
  async noteReturned(day: string, subject: string): Promise<void> {
    if (!isPersonSubject(subject)) throw new Error("studio_free_usage: returned needs a person's subject");
    await this.returnedStatement(day, subject).run();
  }

  private returnedStatement(day: string, subject: string): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO studio_free_usage(org_id,day,subject,unit,used) VALUES(?,?,?,?,1)
      ON CONFLICT(org_id,day,subject,unit) DO UPDATE SET used=used+1`,
      )
      .bind(this.org, day, subject, RETURNED_UNIT);
  }
}

export interface FreeAdmissionInput {
  readonly config: StudioConfig;
  /** b:… (identity.ts) or a:…. */
  readonly subject: string;
  /** The identity is younger than a day (identity.ts isYoung): the IP ceiling and the 80% budget rule apply. */
  readonly young: boolean;
  /** limits.ts studioAddress of the request; counted only for a young identity. */
  readonly address: string;
  readonly unit: FreeUnit;
  readonly now?: number;
}

export type FreeAdmission =
  | { readonly ok: true; readonly day: string; readonly alerts: readonly StudioAlert[] }
  | {
      readonly ok: false;
      readonly code: Extract<StudioErrorCode, "free_limit" | "ip_ceiling" | "try_later" | "studio_busy">;
      /** For free_limit, ip_ceiling and try_later: the next reset (00:00 UTC), ISO. */
      readonly resetsAt?: string;
      readonly retryAfterSeconds: number;
      readonly alerts: readonly StudioAlert[];
    };

const BUSY_RETRY_SECONDS = 60;

/**
 * Take one free `unit` for a person (spec §5.4), or say why not. On success
 * the unit is reserved on `day`; the caller ties it to a ledger row, which
 * hands it back through FreeUsageStore.release when the job owes it.
 */
export async function admitFreeUnit(db: D1Database, input: FreeAdmissionInput): Promise<FreeAdmission> {
  const { config, subject, young, address, unit } = input;
  const now = input.now ?? Date.now();
  if (!isPersonSubject(subject)) throw new Error("studio_free_usage: admission needs a person's subject");
  const day = freeDay(now);
  const resetAt = nextFreeResetAt(now);
  const untilReset = Math.max(1, Math.ceil((resetAt - now) / 1000));
  const store = new FreeUsageStore(db);
  const alerts: StudioAlert[] = [];
  const refuse = (code: "free_limit" | "ip_ceiling" | "try_later" | "studio_busy"): FreeAdmission =>
    code === "studio_busy"
      ? { ok: false, code, retryAfterSeconds: BUSY_RETRY_SECONDS, alerts }
      : { ok: false, code, resetsAt: new Date(resetAt).toISOString(), retryAfterSeconds: untilReset, alerts };

  const budget = await freeBudgetGate(db, config, young, now);
  alerts.push(...budget.alerts);
  if (!budget.ok) return refuse("studio_busy");

  // What this call took, to give back if a later step refuses or D1 fails.
  const taken: Array<[subject: string, unit: FreeUnit]> = [];
  const giveBack = async () => {
    for (const [who, what] of taken.reverse()) {
      try {
        await store.untake(day, who, what);
      } catch {
        /* best-effort: the counter expires with its day */
      }
    }
  };
  try {
    if ((await store.used(day, subject, RETURNED_UNIT)) >= RETURNED_DAILY_CAP) return refuse("try_later");

    if ((await store.take(day, subject, unit, STUDIO_FREE_DAILY[unit])) === null) return refuse("free_limit");
    taken.push([subject, unit]);

    if (young) {
      const ip = ipSubject(address);
      if ((await store.take(day, ip, unit, ipCeiling(config, unit))) === null) {
        await giveBack();
        return refuse("ip_ceiling");
      }
      taken.push([ip, unit]);
    }

    const ramp = rampCeiling(config, unit);
    const site = ramp === null ? await store.count(day, SITE_SUBJECT, unit) : await store.take(day, SITE_SUBJECT, unit, ramp);
    if (site === null) {
      alerts.push("studio_ramp_full");
      await giveBack();
      return refuse("studio_busy");
    }
    if (site === siteAlertAt(config, unit)) alerts.push(siteAlertCode(unit));
    return { ok: true, day, alerts };
  } catch {
    await giveBack();
    return refuse("studio_busy");
  }
}

export interface FreeLeft {
  readonly presentation: { readonly left: number; readonly limit: number };
  readonly photo: { readonly left: number; readonly limit: number };
  readonly resetsAt: string;
}

/** What /me shows: the free units a subject has left today (the full limits without a subject). */
export async function freeLeft(db: D1Database | null, subject: string | null, now = Date.now()): Promise<FreeLeft> {
  const used = db && subject ? await new FreeUsageStore(db).usedFree(freeDay(now), subject) : { presentation_free: 0, photo_task: 0 };
  const left = (unit: FreeUnit) => ({ left: Math.max(0, STUDIO_FREE_DAILY[unit] - used[unit]), limit: STUDIO_FREE_DAILY[unit] });
  return { presentation: left("presentation_free"), photo: left("photo_task"), resetsAt: FREE_RESETS_AT };
}

// Rekey of the hashes stored before GPT_HASH_SALT_SINCE (plan WP-07, decision
// L8; the scheme is in hash.ts). v2 = "h2_" + HMAC(salt, legacy), so a stored
// legacy value converts without the IP or the Telegram id behind it.
//
// The maintenance tick (functions/api/internal/gpt-billing-maintenance.ts)
// calls rekeySaltedHashes once SINCE has passed. Each tick takes one batch of
// at most REKEY_BATCH legacy rows per table, NEWEST first, and stops starting
// tables once TICK_ROWS rows were rewritten: that bounds the HMAC work inside
// the Workers Free CPU limit, and the quota tables go first because the last
// hour's turns decide who may write now. Until a turn is rewritten the new v2
// key does not see it, so the first tick after SINCE undercounts at most that
// hour (the risk the plan accepts).
//
// Late legacy writes: a request that hashed just before SINCE may store its
// key a little after it (a bot reply logs its events once the model has
// answered, seconds later). So a table is scanned up to SINCE + SETTLE_MS,
// not only up to SINCE, and it counts as finished only by a scan that ran
// after that instant; an earlier complete scan leaves the cursor at SINCE +
// SETTLE_MS for one more pass. v2 values never have the legacy shape, so the
// newer rows cost a read, never a rewrite.
//
// Idempotent and checkable: a row is picked only while its value still has
// the legacy shape (64 or 32 lowercase hex), every UPDATE is conditional on
// the value it read, and "h2_" never has that shape, so nothing is keyed
// twice and a rerun changes nothing. Per table a cursor in gpt_billing_ops
// (task 'salt_rekey:<table>', next_at = the time of the oldest row rewritten
// so far, SINCE + SETTLE_MS for the settle pass, 0 = finished) keeps each
// pick on the time index instead of rescanning converted rows; one lease
// (task 'salt_rekey') keeps two ticks from doing the same batch. A table's
// batch and its cursor commit together.
//
// Not rewritten here:
//   gpt_sessions.anon_token  a hash of a random token, never salted (hash.ts)
//   gpt_rate_limits          counter windows of at most a day; the maintenance
//                            sweep deletes closed ones (billing-maintenance-store.ts)
//   gpt_usage_daily          legacy, nothing reads or writes it any more; its
//                            rows up to SINCE are deleted instead
import type { Env } from "../../_types";
import { BILLING_ORG } from "./billing-config";
import {
  activeSalt,
  resolveHashSalt,
  saltedIpHash,
  saltedPseudo,
  type HashSalt,
} from "./hash";

/** Legacy rows rewritten per table and tick, newest first. */
export const REKEY_BATCH = 200;
/** No further table is started in a tick once this many rows were rewritten. */
export const TICK_ROWS = 400;
/** How long after SINCE a legacy key may still land (see above). */
export const SETTLE_MS = 10 * 60_000;
const LEASE_MS = 2 * 60_000;
/** Cursor of a finished table: no row is older than the epoch. */
const DONE = 0;
const LEASE_TASK = "salt_rekey";
const cursorTask = (table: string) => `${LEASE_TASK}:${table}`;

type Shape = "ip" | "pseudo";
const LEGACY: Record<Shape, { length: number; re: RegExp }> = {
  ip: { length: 64, re: /^[0-9a-f]{64}$/ },
  pseudo: { length: 32, re: /^[0-9a-f]{32}$/ },
};
/** SQL twin of LEGACY[shape].re: exactly the bare-hex length. */
function legacySql(column: string, shape: Shape): string {
  return `(length(${column})=${LEGACY[shape].length} AND ${column} NOT GLOB '*[^0-9a-f]*')`;
}

/** A picked row: key k (and r), time t, the hash values a and b. */
interface Row {
  k: string;
  r?: string;
  t: number | string;
  a: string | null;
  b?: string | null;
}
/** Legacy value → v2, anything else unchanged (accounts, v2, NULL). */
type Rekey = (value: string | null | undefined) => Promise<string | null>;

interface Target {
  /** Table name; also the cursor task suffix and the key in the report. */
  table: string;
  /** Time column holds epoch ms; otherwise an ISO string. */
  ms: boolean;
  /** Scoped to the consumer org: binds org_id first (AGENTS §3). */
  org: boolean;
  shape: Shape;
  /** Binds [org,] upper time bound (inclusive), limit; legacy rows, newest first. */
  pick: string;
  write(db: D1Database, row: Row, rekey: Rekey): Promise<D1PreparedStatement[]>;
}

// Quota tables first (see above), then the rest by volume.
const TARGETS: Target[] = [
  {
    table: "gpt_turn_reservations",
    ms: true,
    org: true,
    shape: "ip",
    // Anonymous turns carry the IP hash as subject too; accounts (acct_…) keep theirs.
    pick: `SELECT id AS k,created_at AS t,ip_hash AS a,subject AS b FROM gpt_turn_reservations
      WHERE org_id=? AND created_at<=? AND (${legacySql("ip_hash", "ip")} OR ${legacySql("subject", "ip")})
      ORDER BY created_at DESC LIMIT ?`,
    write: async (db, row, rekey) => [
      db
        .prepare(
          "UPDATE gpt_turn_reservations SET ip_hash=?,subject=? WHERE org_id=? AND id=? AND ip_hash=? AND subject=?",
        )
        .bind(await rekey(row.a), await rekey(row.b), BILLING_ORG, row.k, row.a, row.b),
    ],
  },
  {
    table: "gpt_limit_hits",
    ms: true,
    org: true,
    shape: "ip",
    pick: `SELECT day AS k,reason AS r,first_at AS t,subject AS a FROM gpt_limit_hits
      WHERE org_id=? AND first_at<=? AND ${legacySql("subject", "ip")}
      ORDER BY first_at DESC LIMIT ?`,
    // The v2 row of the same day and reason may exist already (SINCE inside a
    // UTC day): merge into it instead of colliding with its primary key.
    write: async (db, row, rekey) => {
      const key = [BILLING_ORG, row.k, row.r, row.a];
      return [
        db
          .prepare(
            `INSERT INTO gpt_limit_hits(org_id,day,reason,tier,subject,n,first_at)
            SELECT org_id,day,reason,tier,?,n,first_at FROM gpt_limit_hits WHERE org_id=? AND day=? AND reason=? AND subject=?
            ON CONFLICT(org_id,day,reason,subject) DO UPDATE SET n=n+excluded.n,first_at=MIN(first_at,excluded.first_at)`,
          )
          .bind(await rekey(row.a), ...key),
        db
          .prepare("DELETE FROM gpt_limit_hits WHERE org_id=? AND day=? AND reason=? AND subject=?")
          .bind(...key),
      ];
    },
  },
  {
    table: "gpt_sessions",
    ms: false,
    org: false,
    shape: "ip",
    pick: `SELECT id AS k,created_at AS t,hashed_ip AS a FROM gpt_sessions
      WHERE created_at<=? AND ${legacySql("hashed_ip", "ip")} ORDER BY created_at DESC LIMIT ?`,
    write: async (db, row, rekey) => [
      db
        .prepare("UPDATE gpt_sessions SET hashed_ip=? WHERE id=? AND hashed_ip=?")
        .bind(await rekey(row.a), row.k, row.a),
    ],
  },
  {
    table: "telegram_events",
    ms: false,
    org: false,
    shape: "pseudo",
    pick: `SELECT id AS k,created_at AS t,pseudo_user AS a FROM telegram_events
      WHERE created_at<=? AND ${legacySql("pseudo_user", "pseudo")} ORDER BY created_at DESC LIMIT ?`,
    write: async (db, row, rekey) => [
      db
        .prepare("UPDATE telegram_events SET pseudo_user=? WHERE id=? AND pseudo_user=?")
        .bind(await rekey(row.a), row.k, row.a),
    ],
  },
  {
    // claimed_by is written when the link is redeemed, so claimed_at dates it.
    table: "gpt_handoffs",
    ms: false,
    org: false,
    shape: "pseudo",
    pick: `SELECT token_hash AS k,claimed_at AS t,claimed_by AS a FROM gpt_handoffs
      WHERE claimed_at<=? AND ${legacySql("claimed_by", "pseudo")} ORDER BY claimed_at DESC LIMIT ?`,
    write: async (db, row, rekey) => [
      db
        .prepare("UPDATE gpt_handoffs SET claimed_by=? WHERE token_hash=? AND claimed_by=?")
        .bind(await rekey(row.a), row.k, row.a),
    ],
  },
  {
    // The redeemed-link event repeats the pseudonym in its payload
    // (telegram/web-handoff.ts notifyOwnerOfArrival).
    table: "gpt_events",
    ms: false,
    org: false,
    shape: "pseudo",
    pick: `SELECT k,t,a FROM (SELECT id AS k,created_at AS t,
        CASE WHEN json_valid(payload_json) THEN json_extract(payload_json,'$.claimedBy') END AS a
        FROM gpt_events WHERE event_name='GPTChatHandoffClaimed' AND created_at<=?)
      WHERE ${legacySql("a", "pseudo")} ORDER BY t DESC LIMIT ?`,
    write: async (db, row, rekey) => [
      db
        .prepare(
          `UPDATE gpt_events SET payload_json=json_set(payload_json,'$.claimedBy',?)
          WHERE id=? AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json,'$.claimedBy') END=?`,
        )
        .bind(await rekey(row.a), row.k, row.a),
    ],
  },
];
const USAGE_TABLE = "gpt_usage_daily";

export type RekeyStatus =
  /** No usable GPT_HASH_SALT: hashes stay legacy. */
  | "off"
  /**
   * A salt, but GPT_HASH_SALT_SINCE is empty or not a UTC instant ending in
   * Z: hashes stay legacy for good. Fix the value before relying on SINCE.
   */
  | "no_since"
  /** A salt and a valid GPT_HASH_SALT_SINCE that is still ahead. */
  | "waiting"
  /** Another tick holds the lease. */
  | "busy"
  /** This tick ran; `pending` tables are not finished yet. */
  | "ran"
  /** Every table is converted. */
  | "done";

export interface RekeyRun {
  status: RekeyStatus;
  /** Rows rewritten (deleted for gpt_usage_daily) in this tick, per table. Counts only. */
  rows: Record<string, number>;
  /** Tables not finished yet. */
  pending: string[];
}

/** SQLite/D1 wording for a table that was never created in this database. */
function missingTable(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

function timeMs(value: number | string): number | null {
  const ms = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Legacy value → v2 for one shape, memoised per tick (turns repeat IPs). */
function rekeyer(salt: string, shape: Shape): Rekey {
  const memo = new Map<string, Promise<string>>();
  return async (value) => {
    if (typeof value !== "string" || !LEGACY[shape].re.test(value)) return value ?? null;
    let next = memo.get(value);
    if (!next) {
      next = shape === "ip" ? saltedIpHash(salt, value) : saltedPseudo(salt, value);
      memo.set(value, next);
    }
    return next;
  };
}

/**
 * Rewrite one batch of a table and move its cursor, in one D1 batch. A scan
 * that reaches the table's end leaves `scanned` as the cursor: DONE, or SINCE
 * + SETTLE_MS while late legacy writes may still land. A table this database
 * never created holds nothing to rewrite: it is finished, and whatever creates
 * it later writes v2.
 */
async function rekeyTable(
  db: D1Database,
  target: Target,
  bound: number,
  limit: number,
  rekey: Rekey,
  scanned: number,
): Promise<{ rows: number; done: boolean }> {
  let rows: Row[];
  try {
    const picked = await db
      .prepare(target.pick)
      .bind(
        ...(target.org ? [BILLING_ORG] : []),
        target.ms ? bound : new Date(bound).toISOString(),
        limit,
      )
      .all<Row>();
    rows = picked.results ?? [];
  } catch (error) {
    if (!missingTable(error)) throw error;
    await setCursor(db, target.table, DONE).run();
    return { rows: 0, done: true };
  }
  const statements: D1PreparedStatement[] = [];
  for (const row of rows) statements.push(...(await target.write(db, row, rekey)));
  // Rows at the cursor's own instant stay in the next pick (<=); the ones
  // rewritten here no longer have the legacy shape.
  const cursor =
    rows.length < limit ? scanned : (timeMs(rows[rows.length - 1].t) ?? bound);
  statements.push(setCursor(db, target.table, cursor));
  await db.batch(statements);
  return { rows: rows.length, done: cursor === DONE };
}

function setCursor(db: D1Database, table: string, cursor: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO gpt_billing_ops(org_id,task,next_at) VALUES(?,?,?)
      ON CONFLICT(org_id,task) DO UPDATE SET next_at=excluded.next_at`,
    )
    .bind(BILLING_ORG, cursorTask(table), cursor);
}

/** gpt_usage_daily has no reader: its legacy rows are dropped, not rewritten. */
async function dropLegacyUsage(
  db: D1Database,
  since: number,
): Promise<{ rows: number; done: boolean }> {
  let rows: number;
  try {
    const deleted = await db
      .prepare(
        `DELETE FROM ${USAGE_TABLE} WHERE rowid IN (SELECT rowid FROM ${USAGE_TABLE} WHERE date_utc<=? LIMIT ?)`,
      )
      .bind(new Date(since - 1).toISOString().slice(0, 10), REKEY_BATCH)
      .run();
    rows = deleted.meta?.changes ?? 0;
  } catch (error) {
    if (!missingTable(error)) throw error;
    rows = 0;
  }
  if (rows < REKEY_BATCH) await setCursor(db, USAGE_TABLE, DONE).run();
  return { rows, done: rows < REKEY_BATCH };
}

/**
 * One rekey pass, after GPT_HASH_SALT_SINCE. Counts only in the result: no
 * hash, id or text leaves this function. Throws only on a D1 failure.
 */
export async function rekeySaltedHashes(
  env: Env,
  now = Date.now(),
): Promise<RekeyRun> {
  const cfg: HashSalt = resolveHashSalt(env);
  const tables = [...TARGETS.map((t) => t.table), USAGE_TABLE];
  const db = env.GPTBOT_DRAFTS_DB;
  if (!cfg.hashSalt || !db) return { status: "off", rows: {}, pending: [] };
  if (cfg.hashSaltSince === null)
    return { status: "no_since", rows: {}, pending: tables };
  const salt = activeSalt(cfg, now);
  if (!salt) return { status: "waiting", rows: {}, pending: tables };
  const since = cfg.hashSaltSince;
  const settle = since + SETTLE_MS;
  const scanned = now >= settle ? DONE : settle;

  const stored = await db
    .prepare("SELECT task,next_at FROM gpt_billing_ops WHERE org_id=? AND task GLOB ?")
    .bind(BILLING_ORG, `${LEASE_TASK}:*`)
    .all<{ task: string; next_at: number }>();
  const cursors = new Map((stored.results ?? []).map((r) => [r.task, r.next_at]));
  const open = tables.filter((table) => cursors.get(cursorTask(table)) !== DONE);
  if (!open.length) return { status: "done", rows: {}, pending: [] };

  const lease = await db
    .prepare(
      `INSERT INTO gpt_billing_ops(org_id,task,next_at) VALUES(?,?,?)
      ON CONFLICT(org_id,task) DO UPDATE SET next_at=excluded.next_at WHERE next_at<=? RETURNING task`,
    )
    .bind(BILLING_ORG, LEASE_TASK, now + LEASE_MS, now)
    .first();
  if (!lease) return { status: "busy", rows: {}, pending: open };

  const rows: Record<string, number> = {};
  const pending: string[] = [];
  const rekeys: Record<Shape, Rekey> = {
    ip: rekeyer(salt, "ip"),
    pseudo: rekeyer(salt, "pseudo"),
  };
  let spent = 0;
  try {
    for (const target of TARGETS) {
      if (!open.includes(target.table)) continue;
      if (spent >= TICK_ROWS) {
        pending.push(target.table);
        continue;
      }
      const done = await rekeyTable(
        db,
        target,
        cursors.get(cursorTask(target.table)) ?? settle,
        Math.min(REKEY_BATCH, TICK_ROWS - spent),
        rekeys[target.shape],
        scanned,
      );
      rows[target.table] = done.rows;
      spent += done.rows;
      if (!done.done) pending.push(target.table);
    }
    if (open.includes(USAGE_TABLE)) {
      const done = await dropLegacyUsage(db, since);
      rows[USAGE_TABLE] = done.rows;
      if (!done.done) pending.push(USAGE_TABLE);
    }
  } finally {
    // Free the lease so the next call (a manual one during the release) can go on.
    await db
      .prepare("UPDATE gpt_billing_ops SET next_at=? WHERE org_id=? AND task=?")
      .bind(now, BILLING_ORG, LEASE_TASK)
      .run();
  }
  return { status: pending.length ? "ran" : "done", rows, pending };
}

// P3.1 owner audit trail.
//
// Every mutation prepares an INSERT OR IGNORE and executes it in the same D1
// batch as the guarded domain write. The domain statement depends on the new
// event id, so a retried mutation records one event and a failed mutation
// cannot leave a ghost audit.
import {
  OWNER_LIMITS,
  OwnerValidationError,
  safeJson,
  type OwnerAuditAction,
  type OwnerReasonCode,
} from './validation';

/**
 * `product` was added by migration 0033. A listing action is performed on a
 * product, not on the store that holds it, and recording it as a store would
 * leave `idx_owner_audit_target` unable to answer what happened to a listing.
 */
export type OwnerAuditTargetType = 'store' | 'automation_job' | 'product';

export interface OwnerAuditInput {
  actorEmail: string;
  actorRole: 'platform_owner' | 'support_readonly';
  action: OwnerAuditAction;
  targetType: OwnerAuditTargetType;
  targetId: string;
  orgId?: string | null;
  reasonCode: OwnerReasonCode;
  requestId: string;
  idempotencyKey: string;
  /** Allowlisted metadata only. Never a request body, never buyer content. */
  before?: unknown;
  after?: unknown;
}

export interface OwnerAuditEvent {
  eventId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  orgId: string | null;
  reasonCode: string;
  requestId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface OwnerAuditInsertPlan {
  eventId: string;
  input: OwnerAuditInput;
  statement: D1PreparedStatement;
}

type D1WriteResult = { meta?: { changes?: number; rows_written?: number } };

function changes(result: unknown): number {
  const meta = (result as D1WriteResult).meta;
  return Number(meta?.changes ?? meta?.rows_written ?? 0);
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS owner_audit_events (
    event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 120),
    actor_email TEXT NOT NULL CHECK (length(actor_email) BETWEEN 1 AND 200),
    actor_role TEXT NOT NULL CHECK (actor_role IN ('platform_owner', 'support_readonly')),
    action TEXT NOT NULL CHECK (action IN (
      'store.suspend', 'store.restore', 'pilot.activate', 'pilot.pause', 'automation.replay',
      'seller.bind', 'seller.unbind',
      'listing.publish', 'listing.unpublish', 'listing.archive'
    )),
    target_type TEXT NOT NULL CHECK (target_type IN ('store', 'automation_job', 'product')),
    target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 120),
    org_id TEXT CHECK (org_id IS NULL OR length(org_id) BETWEEN 1 AND 120),
    reason_code TEXT NOT NULL CHECK (reason_code IN (
      'pilot_onboarding', 'pilot_paused_by_owner', 'seller_request', 'policy_violation',
      'suspected_abuse', 'data_quality', 'incident_response', 'operator_error_recovery'
    )),
    request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 120),
    idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
    before_json TEXT CHECK (before_json IS NULL OR length(CAST(before_json AS BLOB)) <= 2048),
    after_json TEXT CHECK (after_json IS NULL OR length(CAST(after_json AS BLOB)) <= 2048),
    created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
    UNIQUE (idempotency_key)
  )`,
  `CREATE TABLE IF NOT EXISTS owner_pilot_stores (
    org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 120),
    store_id TEXT NOT NULL CHECK (length(store_id) BETWEEN 1 AND 120),
    state TEXT NOT NULL DEFAULT 'inactive' CHECK (state IN ('inactive', 'active', 'paused')),
    activated_at TEXT CHECK (activated_at IS NULL OR length(activated_at) BETWEEN 1 AND 64),
    paused_at TEXT CHECK (paused_at IS NULL OR length(paused_at) BETWEEN 1 AND 64),
    updated_by TEXT NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 200),
    updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    PRIMARY KEY (org_id, store_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_owner_audit_created ON owner_audit_events (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_owner_audit_target ON owner_audit_events (target_type, target_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_owner_audit_actor ON owner_audit_events (actor_email, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_owner_pilot_state ON owner_pilot_stores (state, updated_at DESC)`,
] as const;

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

/** Migration 0025 owns production; this keeps tests and local runs in parity. */
export function ensureOwnerAuditSchema(db: D1Database): Promise<void> {
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      for (const statement of DDL) await db.prepare(statement).run();
    })().catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}

function rowToEvent(row: Record<string, unknown>): OwnerAuditEvent {
  const parse = (value: unknown): unknown => {
    if (typeof value !== 'string' || !value) return null;
    try { return JSON.parse(value); } catch { return null; }
  };
  return {
    eventId: String(row.event_id),
    actorEmail: String(row.actor_email),
    actorRole: String(row.actor_role),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    orgId: row.org_id === null || row.org_id === undefined ? null : String(row.org_id),
    reasonCode: String(row.reason_code),
    requestId: String(row.request_id),
    before: parse(row.before_json),
    after: parse(row.after_json),
    createdAt: String(row.created_at),
  };
}

function assertReplayMatches(stored: OwnerAuditEvent, input: OwnerAuditInput): void {
  const sameOperation =
    stored.actorEmail === input.actorEmail
    && stored.actorRole === input.actorRole
    && stored.action === input.action
    && stored.targetType === input.targetType
    && stored.targetId === input.targetId
    && stored.orgId === (input.orgId ?? null)
    && stored.reasonCode === input.reasonCode;
  if (!sameOperation) throw new OwnerValidationError('idempotency_conflict');
}

function validateAuditInput(input: OwnerAuditInput): void {
  if (!input.actorEmail || input.actorEmail.length > OWNER_LIMITS.emailLength) {
    throw new OwnerValidationError('invalid_actor');
  }
  if (!input.requestId || input.requestId.length > OWNER_LIMITS.requestIdLength) {
    throw new OwnerValidationError('invalid_request_id');
  }
}

export async function findOwnerAuditReplay(
  db: D1Database,
  input: OwnerAuditInput,
): Promise<OwnerAuditEvent | null> {
  await ensureOwnerAuditSchema(db);
  validateAuditInput(input);
  const stored = await db.prepare(
    'SELECT * FROM owner_audit_events WHERE idempotency_key = ?',
  ).bind(input.idempotencyKey).first<Record<string, unknown>>();
  if (!stored) return null;
  const event = rowToEvent(stored);
  assertReplayMatches(event, input);
  return event;
}

/**
 * Prepare an audit insert whose guard is evaluated inside the same D1 batch as
 * the domain mutation. Callers must make the domain statement depend on the
 * generated event id, so either both writes happen or neither does.
 */
export function prepareOwnerAuditInsert(
  db: D1Database,
  input: OwnerAuditInput,
  now: string,
  guardSql = '1 = 1',
  guardBindings: unknown[] = [],
): OwnerAuditInsertPlan {
  validateAuditInput(input);
  const eventId = `oaudit_${crypto.randomUUID().replaceAll('-', '')}`;
  const statement = db.prepare(
    `INSERT OR IGNORE INTO owner_audit_events (
       event_id, actor_email, actor_role, action, target_type, target_id, org_id,
       reason_code, request_id, idempotency_key, before_json, after_json, created_at
     )
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE ${guardSql}`,
  ).bind(
    eventId,
    input.actorEmail,
    input.actorRole,
    input.action,
    input.targetType,
    input.targetId,
    input.orgId ?? null,
    input.reasonCode,
    input.requestId,
    input.idempotencyKey,
    safeJson(input.before),
    safeJson(input.after),
    now,
    ...guardBindings,
  );
  return { eventId, input, statement };
}

export async function resolveOwnerAuditInsert(
  db: D1Database,
  plan: OwnerAuditInsertPlan,
  result: unknown,
): Promise<{ outcome: 'recorded' | 'duplicate'; event: OwnerAuditEvent } | null> {
  const stored = await db.prepare(
    'SELECT * FROM owner_audit_events WHERE idempotency_key = ?',
  ).bind(plan.input.idempotencyKey).first<Record<string, unknown>>();
  if (!stored) return null;
  const event = rowToEvent(stored);
  assertReplayMatches(event, plan.input);
  return {
    outcome: changes(result) === 1 && event.eventId === plan.eventId ? 'recorded' : 'duplicate',
    event,
  };
}

export async function listOwnerAuditEvents(
  db: D1Database,
  options: {
    limit: number;
    offset: number;
    action?: string | null;
    targetId?: string | null;
    actorEmail?: string | null;
    actorRole?: string | null;
  },
): Promise<OwnerAuditEvent[]> {
  await ensureOwnerAuditSchema(db);
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (options.action) { clauses.push('action = ?'); binds.push(options.action); }
  if (options.targetId) { clauses.push('target_id = ?'); binds.push(options.targetId); }
  if (options.actorEmail) { clauses.push('LOWER(actor_email) = ?'); binds.push(options.actorEmail); }
  if (options.actorRole) { clauses.push('actor_role = ?'); binds.push(options.actorRole); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.prepare(
    `SELECT * FROM owner_audit_events ${where}
     ORDER BY created_at DESC, event_id DESC
     LIMIT ? OFFSET ?`,
  ).bind(...binds, options.limit, options.offset).all<Record<string, unknown>>();
  return (rows.results ?? []).map(rowToEvent);
}

export async function countOwnerAuditEvents(
  db: D1Database,
  options: {
    action?: string | null;
    targetId?: string | null;
    actorEmail?: string | null;
    actorRole?: string | null;
  } = {},
): Promise<number> {
  await ensureOwnerAuditSchema(db);
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (options.action) { clauses.push('action = ?'); binds.push(options.action); }
  if (options.targetId) { clauses.push('target_id = ?'); binds.push(options.targetId); }
  if (options.actorEmail) { clauses.push('LOWER(actor_email) = ?'); binds.push(options.actorEmail); }
  if (options.actorRole) { clauses.push('actor_role = ?'); binds.push(options.actorRole); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM owner_audit_events ${where}`)
    .bind(...binds).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export type PilotState = 'inactive' | 'active' | 'paused';

export interface PilotRecord {
  orgId: string;
  storeId: string;
  state: PilotState;
  activatedAt: string | null;
  pausedAt: string | null;
  updatedBy: string;
  updatedAt: string;
  version: number;
}

function rowToPilot(row: Record<string, unknown>): PilotRecord {
  return {
    orgId: String(row.org_id),
    storeId: String(row.store_id),
    state: String(row.state) as PilotState,
    activatedAt: row.activated_at === null || row.activated_at === undefined ? null : String(row.activated_at),
    pausedAt: row.paused_at === null || row.paused_at === undefined ? null : String(row.paused_at),
    updatedBy: String(row.updated_by),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
  };
}

export async function getPilotRecord(
  db: D1Database,
  orgId: string,
  storeId: string,
): Promise<PilotRecord | null> {
  await ensureOwnerAuditSchema(db);
  const row = await db.prepare(
    'SELECT * FROM owner_pilot_stores WHERE org_id = ? AND store_id = ?',
  ).bind(orgId, storeId).first<Record<string, unknown>>();
  return row ? rowToPilot(row) : null;
}

export async function transitionPilotStateWithAudit(
  db: D1Database,
  input: {
    orgId: string;
    storeId: string;
    state: PilotState;
    updatedBy: string;
    expectedStoreStatus: string;
    expectedPilot: PilotRecord | null;
    audit: OwnerAuditInput;
  },
  now: string = new Date().toISOString(),
): Promise<{
  outcome: 'recorded' | 'duplicate' | 'conflict';
  auditEvent: OwnerAuditEvent | null;
  pilot: PilotRecord | null;
}> {
  await ensureOwnerAuditSchema(db);
  const pilotGuard = input.expectedPilot
    ? `EXISTS (
         SELECT 1 FROM owner_pilot_stores
         WHERE org_id = ? AND store_id = ? AND state = ? AND version = ?
       )`
    : `NOT EXISTS (
         SELECT 1 FROM owner_pilot_stores WHERE org_id = ? AND store_id = ?
       )`;
  const pilotGuardBindings = input.expectedPilot
    ? [input.orgId, input.storeId, input.expectedPilot.state, input.expectedPilot.version]
    : [input.orgId, input.storeId];
  const auditPlan = prepareOwnerAuditInsert(
    db,
    input.audit,
    now,
    `EXISTS (
       SELECT 1 FROM sotuvchi_stores WHERE id = ? AND org_id = ? AND status = ?
     ) AND ${pilotGuard}`,
    [input.storeId, input.orgId, input.expectedStoreStatus, ...pilotGuardBindings],
  );
  const activated = input.state === 'active' ? now : null;
  const paused = input.state === 'paused' ? now : null;
  const pilotStatement = input.expectedPilot
    ? db.prepare(
      `UPDATE owner_pilot_stores
       SET state = ?, activated_at = COALESCE(?, activated_at),
           paused_at = COALESCE(?, paused_at), updated_by = ?, updated_at = ?,
           version = version + 1
       WHERE org_id = ? AND store_id = ? AND state = ? AND version = ?
         AND EXISTS (SELECT 1 FROM owner_audit_events WHERE event_id = ?)`,
    ).bind(
      input.state, activated, paused, input.updatedBy, now,
      input.orgId, input.storeId, input.expectedPilot.state, input.expectedPilot.version,
      auditPlan.eventId,
    )
    : db.prepare(
      `INSERT OR IGNORE INTO owner_pilot_stores (
         org_id, store_id, state, activated_at, paused_at, updated_by, updated_at, version
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, 1
       WHERE EXISTS (SELECT 1 FROM owner_audit_events WHERE event_id = ?)`,
    ).bind(
      input.orgId, input.storeId, input.state, activated, paused,
      input.updatedBy, now, auditPlan.eventId,
    );

  const results = await db.batch([auditPlan.statement, pilotStatement]);
  const audit = await resolveOwnerAuditInsert(db, auditPlan, results[0]);
  const pilot = await getPilotRecord(db, input.orgId, input.storeId);
  if (!audit) return { outcome: 'conflict', auditEvent: null, pilot };
  if (audit.outcome === 'duplicate') {
    return { outcome: 'duplicate', auditEvent: audit.event, pilot };
  }
  if (changes(results[1]) !== 1) throw new Error('owner_pilot_atomic_write_failed');
  return { outcome: 'recorded', auditEvent: audit.event, pilot };
}

export async function listPilotRecords(
  db: D1Database,
  options: { limit: number; offset: number; state?: PilotState | null },
): Promise<PilotRecord[]> {
  await ensureOwnerAuditSchema(db);
  const where = options.state ? 'WHERE state = ?' : '';
  const binds: unknown[] = options.state ? [options.state] : [];
  const rows = await db.prepare(
    `SELECT * FROM owner_pilot_stores ${where}
     ORDER BY updated_at DESC, store_id ASC
     LIMIT ? OFFSET ?`,
  ).bind(...binds, options.limit, options.offset).all<Record<string, unknown>>();
  return (rows.results ?? []).map(rowToPilot);
}

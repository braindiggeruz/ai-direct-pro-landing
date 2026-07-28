import type { PiiSafePayload, PlatformEvent } from '../contracts';
import { validatePiiSafePayload } from './pii';

const EVENT_COLUMNS =
  'id, idempotency_key, org_id, agent_id, type, aggregate_ref, payload_json, occurred_at, created_at, processed_at';

// Canonical SQL lives only in this repository module. schema.ts supplies the
// isolate-level bootstrap guard and delegates execution back here.
const PLATFORM_EVENTS_DDL = [
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    org_id TEXT,
    agent_id TEXT,
    type TEXT NOT NULL,
    aggregate_ref TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    processed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_org_created ON events (org_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_events_type_created ON events (type, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON events (processed_at, created_at)`,
] as const;

interface PlatformEventRow {
  id: string;
  idempotency_key: string;
  org_id: string | null;
  agent_id: string | null;
  type: string;
  aggregate_ref: string;
  payload_json: string;
  occurred_at: string;
  created_at: string;
  processed_at: string | null;
}

export interface StoredPlatformEvent extends PlatformEvent {
  idempotencyKey: string;
  createdAt: string;
  processedAt: string | null;
}

export interface AppendEventInput {
  event: PlatformEvent;
  idempotencyKey: string;
  createdAt?: string;
}

export interface AppendEventResult {
  status: 'created' | 'duplicate';
  event: StoredPlatformEvent;
}

export type MarkProcessedResult = 'processed' | 'already_processed' | 'missing';

export class CorruptPlatformEventError extends Error {
  readonly eventId: string;

  constructor(eventId: string) {
    super(`stored platform event is invalid: ${eventId}`);
    this.name = 'CorruptPlatformEventError';
    this.eventId = eventId;
  }
}

export class PlatformEventPersistenceError extends Error {
  constructor(code: 'write_conflict') {
    super(`platform event persistence failed: ${code}`);
    this.name = 'PlatformEventPersistenceError';
  }
}

function parsePayload(row: PlatformEventRow): PiiSafePayload {
  try {
    return validatePiiSafePayload(JSON.parse(row.payload_json));
  } catch {
    throw new CorruptPlatformEventError(row.id);
  }
}

function fromRow(row: PlatformEventRow): StoredPlatformEvent {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    type: row.type,
    occurredAt: row.occurred_at,
    orgId: row.org_id,
    agentId: row.agent_id,
    aggregate: row.aggregate_ref,
    payload: parsePayload(row),
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

/** Runtime DDL executor used only by schema.ts. */
export async function bootstrapPlatformEventsStore(db: D1Database): Promise<void> {
  for (const statement of PLATFORM_EVENTS_DDL) await db.prepare(statement).run();
}

async function getEventByIdempotencyKey(
  db: D1Database,
  idempotencyKey: string,
): Promise<StoredPlatformEvent | null> {
  const row = await db
    .prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE idempotency_key = ?`)
    .bind(idempotencyKey)
    .first<PlatformEventRow>();
  return row ? fromRow(row) : null;
}

export async function appendEvent(
  db: D1Database,
  input: AppendEventInput,
): Promise<AppendEventResult> {
  const payload = validatePiiSafePayload(input.event.payload);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const result = await db
    .prepare(`INSERT OR IGNORE INTO events (
      id, idempotency_key, org_id, agent_id, type, aggregate_ref,
      payload_json, occurred_at, created_at, processed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
    .bind(
      input.event.id,
      input.idempotencyKey,
      input.event.orgId,
      input.event.agentId,
      input.event.type,
      input.event.aggregate,
      JSON.stringify(payload),
      input.event.occurredAt,
      createdAt,
    )
    .run();

  const created = (result.meta?.changes ?? 0) > 0;
  const stored = created
    ? {
        ...input.event,
        payload,
        idempotencyKey: input.idempotencyKey,
        createdAt,
        processedAt: null,
      }
    : await getEventByIdempotencyKey(db, input.idempotencyKey);
  if (!stored) throw new PlatformEventPersistenceError('write_conflict');
  return { status: created ? 'created' : 'duplicate', event: stored };
}

/** Platform-internal lookup. Tenant-facing repositories arrive in P0.4. */
export async function getEventById(
  db: D1Database,
  eventId: string,
): Promise<StoredPlatformEvent | null> {
  const row = await db
    .prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = ?`)
    .bind(eventId)
    .first<PlatformEventRow>();
  return row ? fromRow(row) : null;
}

/** Cross-org dispatcher feed; no dispatcher is implemented in P0.3. */
export async function listUnprocessed(
  db: D1Database,
  limit = 100,
): Promise<StoredPlatformEvent[]> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 500));
  const rows = await db
    .prepare(`SELECT ${EVENT_COLUMNS}
              FROM events
              WHERE processed_at IS NULL
              ORDER BY created_at ASC, id ASC
              LIMIT ?`)
    .bind(safeLimit)
    .all<PlatformEventRow>();
  return (rows.results ?? []).map(fromRow);
}

export interface CountEventsInput {
  orgId: string;
  /** Closed list supplied by the caller; never user input. */
  types: readonly string[];
  /** ISO-8601 lower bound, inclusive. */
  since: string;
}

/**
 * Tenant-scoped bounded aggregate read for reporting.
 *
 * Every predicate is parameterized, `org_id` is always present so the query
 * uses idx_events_org_created, and only counts leave the store: no payload,
 * aggregate reference or event id is returned. Types missing from the result
 * read as 0.
 */
export async function countEventsByType(
  db: D1Database,
  input: CountEventsInput,
): Promise<Readonly<Record<string, number>>> {
  const types = [...new Set(input.types)].filter(
    (type) => typeof type === 'string' && type.length > 0 && type.length <= 120,
  );
  const counts: Record<string, number> = {};
  for (const type of types) counts[type] = 0;
  if (
    !input.orgId
    || types.length === 0
    || types.length > 20
    || !Number.isFinite(Date.parse(input.since))
  ) {
    return counts;
  }
  const placeholders = types.map(() => '?').join(', ');
  const rows = await db
    .prepare(`SELECT type, COUNT(*) AS total
              FROM events
              WHERE org_id = ?
                AND created_at >= ?
                AND type IN (${placeholders})
              GROUP BY type`)
    .bind(input.orgId, input.since, ...types)
    .all<{ type: string; total: number }>();
  for (const row of rows.results ?? []) {
    if (row.type in counts) counts[row.type] = Number(row.total ?? 0);
  }
  return counts;
}

export async function markProcessed(
  db: D1Database,
  eventId: string,
  processedAt = new Date().toISOString(),
): Promise<MarkProcessedResult> {
  const result = await db
    .prepare('UPDATE events SET processed_at = ? WHERE id = ? AND processed_at IS NULL')
    .bind(processedAt, eventId)
    .run();
  if ((result.meta?.changes ?? 0) > 0) return 'processed';
  return await getEventById(db, eventId) ? 'already_processed' : 'missing';
}

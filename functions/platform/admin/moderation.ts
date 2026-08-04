/**
 * Classifieds moderation for the Bormi Admin.
 *
 * Four decisions on a listing — approve, reject, restrict, remove — and two on
 * a report. All six go through one command so no screen can invent a seventh,
 * and none of them writes a status the caller chose: the operator names a
 * decision, and the decision decides the states.
 *
 * The two rows a decision touches are `market_listing_moderation.state` and
 * `sotuvchi_products.status`. They are written together in one D1 batch with
 * the audit event, guarded on the moderation version the operator was shown, so
 * a stale screen produces a 409 rather than a decision about content somebody
 * else already ruled on.
 */
import {
  firstParam,
  ownerError,
  ownerJson,
  readOwnerBody,
  type OwnerHandlerContext,
} from './http';
import { OwnerValidationError, requireIdentifier } from './validation';

export const MODERATION_DECISIONS = ['approve', 'reject', 'restrict', 'remove'] as const;
export type ModerationDecision = (typeof MODERATION_DECISIONS)[number];

export const REPORT_RESOLUTIONS = ['resolve', 'dismiss'] as const;
export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number];

export const MODERATION_STATES = [
  'pending', 'approved', 'rejected', 'restricted', 'removed',
] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

/**
 * Reason codes an operator may choose. `new_seller_review` and
 * `high_risk_category` are deliberately absent: those are why a listing entered
 * the queue, not why a person decided something about it.
 */
export const MODERATION_REASONS = [
  'prohibited_item',
  'suspected_fraud',
  'duplicate_listing',
  'misleading_content',
  'unsafe_contact',
  'personal_data',
  'seller_request',
  'appeal_upheld',
  'other_policy',
] as const;
export type ModerationReason = (typeof MODERATION_REASONS)[number];

const MAX_NOTE_LENGTH = 500;

interface Transition {
  moderationState: ModerationState;
  /** Null leaves the product status alone. */
  productStatus: 'draft' | 'published' | 'archived' | null;
  action: string;
  allowedFrom: readonly ModerationState[];
  /** Approving is the only decision that does not need a reason. */
  reasonRequired: boolean;
}

const TRANSITIONS: Readonly<Record<ModerationDecision, Transition>> = {
  // The one transition that puts a listing in front of buyers. It is also the
  // only place `status = 'published'` is ever written for a private listing.
  approve: {
    moderationState: 'approved',
    productStatus: 'published',
    action: 'listing.approved',
    allowedFrom: ['pending'],
    reasonRequired: false,
  },
  reject: {
    moderationState: 'rejected',
    productStatus: 'draft',
    action: 'listing.rejected',
    allowedFrom: ['pending'],
    reasonRequired: true,
  },
  // Restricting and removing both take a listing out of discovery. They differ
  // in what the seller is told and whether a correction is invited.
  restrict: {
    moderationState: 'restricted',
    productStatus: 'draft',
    action: 'listing.restricted',
    allowedFrom: ['pending', 'approved', 'restricted'],
    reasonRequired: true,
  },
  remove: {
    moderationState: 'removed',
    productStatus: 'draft',
    action: 'listing.removed',
    allowedFrom: ['pending', 'approved', 'restricted', 'rejected'],
    reasonRequired: true,
  },
};

export interface ModerationQueueEntry {
  listing_id: string;
  name: string;
  price_minor: number;
  currency: string;
  media_count: number;
  state: ModerationState;
  reason_code: string | null;
  submitted_at: string;
  decided_at: string | null;
  version: number;
  seller_display_name: string | null;
  seller_type: string | null;
  seller_verification: string | null;
  category_name_ru: string | null;
  district_name_ru: string | null;
  open_reports: number;
}

const QUEUE_SELECT = `
  SELECT
    product.id AS listing_id,
    product.name,
    product.price_minor,
    product.currency,
    json_array_length(product.media_refs_json) AS media_count,
    moderation.state,
    moderation.reason_code,
    moderation.submitted_at,
    moderation.decided_at,
    moderation.version,
    seller.public_display_name AS seller_display_name,
    seller.seller_type,
    seller.verification_state AS seller_verification,
    category.name_ru AS category_name_ru,
    district.name_ru AS district_name_ru,
    (
      SELECT COUNT(*) FROM market_listing_reports AS report
      WHERE report.product_id = product.id AND report.status = 'open'
    ) AS open_reports
  FROM market_listing_moderation AS moderation
  JOIN sotuvchi_products AS product ON product.id = moderation.product_id
  LEFT JOIN listing_ownerships AS ownership
    ON ownership.product_id = product.id AND ownership.status = 'active'
  LEFT JOIN seller_profiles AS seller ON seller.id = ownership.seller_profile_id
  LEFT JOIN market_listing_taxonomy AS taxonomy ON taxonomy.product_id = product.id
  LEFT JOIN market_global_categories AS category ON category.id = taxonomy.global_category_id
  LEFT JOIN market_listing_locations AS location ON location.product_id = product.id
  LEFT JOIN market_districts AS district ON district.id = location.district_id
`;

export async function listModerationQueue(
  db: D1Database,
  filters: { state: ModerationState | null; limit: number; offset: number },
): Promise<ModerationQueueEntry[]> {
  const where = filters.state ? 'WHERE moderation.state = ?' : '';
  const binds: unknown[] = filters.state ? [filters.state] : [];
  const result = await db.prepare(`
    ${QUEUE_SELECT}
    ${where}
    ORDER BY moderation.submitted_at ASC, product.id
    LIMIT ? OFFSET ?
  `).bind(...binds, filters.limit, filters.offset).all<ModerationQueueEntry>();
  return result.results ?? [];
}

export async function countModerationQueue(
  db: D1Database,
  state: ModerationState | null,
): Promise<number> {
  const row = state
    ? await db.prepare(
      'SELECT COUNT(*) AS n FROM market_listing_moderation WHERE state = ?',
    ).bind(state).first<{ n: number }>()
    : await db.prepare('SELECT COUNT(*) AS n FROM market_listing_moderation')
      .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function moderationSummary(db: D1Database): Promise<Record<string, number>> {
  const result = await db.prepare(`
    SELECT state, COUNT(*) AS n FROM market_listing_moderation GROUP BY state
  `).all<{ state: string; n: number }>();
  const summary: Record<string, number> = Object.fromEntries(
    MODERATION_STATES.map((state) => [state, 0]),
  );
  for (const row of result.results ?? []) summary[row.state] = Number(row.n);
  summary.open_reports = Number((await db.prepare(
    `SELECT COUNT(*) AS n FROM market_listing_reports WHERE status = 'open'`,
  ).first<{ n: number }>())?.n ?? 0);
  return summary;
}

export interface ModerationDetail extends ModerationQueueEntry {
  description: string | null;
  media_refs: string[];
  condition: string | null;
  region_name_ru: string | null;
  locality_text: string | null;
  contact_mode: string | null;
  product_status: string;
  history: Array<{
    action: string;
    actor_type: string;
    reason_code: string | null;
    from_state: string | null;
    to_state: string | null;
    created_at: string;
  }>;
  reports: Array<{
    id: string;
    reason_code: string;
    status: string;
    created_at: string;
  }>;
}

export async function getModerationDetail(
  db: D1Database,
  listingId: string,
): Promise<ModerationDetail | null> {
  const row = await db.prepare(`
    ${QUEUE_SELECT}
    WHERE product.id = ?
    LIMIT 1
  `).bind(listingId).first<ModerationQueueEntry & {
    description: string | null;
  }>();
  if (!row) return null;
  const extra = await db.prepare(`
    SELECT product.description, product.media_refs_json, product.status AS product_status,
      taxonomy.condition, region.name_ru AS region_name_ru,
      location.locality_text, channel.contact_mode
    FROM sotuvchi_products AS product
    LEFT JOIN market_listing_taxonomy AS taxonomy ON taxonomy.product_id = product.id
    LEFT JOIN market_listing_locations AS location ON location.product_id = product.id
    LEFT JOIN market_regions AS region ON region.id = location.region_id
    LEFT JOIN market_listing_channels AS channel ON channel.product_id = product.id
    WHERE product.id = ?
  `).bind(listingId).first<{
    description: string | null;
    media_refs_json: string;
    product_status: string;
    condition: string | null;
    region_name_ru: string | null;
    locality_text: string | null;
    contact_mode: string | null;
  }>();
  const history = await db.prepare(`
    SELECT action, actor_type, reason_code, from_state, to_state, created_at
    FROM market_moderation_audit
    WHERE product_id = ?
    ORDER BY created_at DESC, event_id
    LIMIT 50
  `).bind(listingId).all<ModerationDetail['history'][number]>();
  // Report notes are deliberately not selected. A moderator sees that a report
  // exists and why it was filed from the closed reason list; the reporter's own
  // words stay between them and the report table.
  const reports = await db.prepare(`
    SELECT id, reason_code, status, created_at
    FROM market_listing_reports
    WHERE product_id = ?
    ORDER BY created_at DESC, id
    LIMIT 50
  `).bind(listingId).all<ModerationDetail['reports'][number]>();

  let mediaRefs: string[] = [];
  try {
    const parsed = JSON.parse(extra?.media_refs_json ?? '[]') as unknown;
    if (Array.isArray(parsed)) {
      mediaRefs = parsed.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    mediaRefs = [];
  }

  return {
    ...row,
    description: extra?.description ?? null,
    media_refs: mediaRefs,
    condition: extra?.condition ?? null,
    region_name_ru: extra?.region_name_ru ?? null,
    locality_text: extra?.locality_text ?? null,
    contact_mode: extra?.contact_mode ?? null,
    product_status: extra?.product_status ?? 'draft',
    history: history.results ?? [],
    reports: reports.results ?? [],
  };
}

interface ModerationCommandBody {
  decision: ModerationDecision;
  reasonCode: ModerationReason | null;
  note: string | null;
  idempotencyKey: string;
  expectedVersion: number;
}

const COMMAND_KEYS = [
  'decision', 'reason_code', 'note', 'idempotency_key', 'expected_version',
];

/**
 * Parse a moderation command. The key set is closed and the note is bounded, so
 * an operator cannot smuggle a target status, a seller id or an unbounded blob
 * into an audited decision.
 */
export function parseModerationCommand(raw: unknown): ModerationCommandBody {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new OwnerValidationError('invalid_body');
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!COMMAND_KEYS.includes(key)) throw new OwnerValidationError('unexpected_field');
  }
  const decision = record.decision;
  if (
    typeof decision !== 'string'
    || !(MODERATION_DECISIONS as readonly string[]).includes(decision)
  ) {
    throw new OwnerValidationError('invalid_decision');
  }
  const transition = TRANSITIONS[decision as ModerationDecision];
  let reasonCode: ModerationReason | null = null;
  if (record.reason_code !== undefined && record.reason_code !== null) {
    if (
      typeof record.reason_code !== 'string'
      || !(MODERATION_REASONS as readonly string[]).includes(record.reason_code)
    ) {
      throw new OwnerValidationError('invalid_reason_code');
    }
    reasonCode = record.reason_code as ModerationReason;
  }
  // A refusal a seller cannot act on is not a decision, it is a dead end.
  if (transition.reasonRequired && !reasonCode) {
    throw new OwnerValidationError('invalid_reason_code');
  }
  let note: string | null = null;
  if (record.note !== undefined && record.note !== null && record.note !== '') {
    if (typeof record.note !== 'string' || record.note.length > MAX_NOTE_LENGTH) {
      throw new OwnerValidationError('invalid_note');
    }
    note = record.note.trim() || null;
  }
  const expectedVersion = record.expected_version;
  if (
    typeof expectedVersion !== 'number'
    || !Number.isInteger(expectedVersion)
    || expectedVersion < 1
  ) {
    throw new OwnerValidationError('invalid_expected_version');
  }
  return {
    decision: decision as ModerationDecision,
    reasonCode,
    note,
    idempotencyKey: requireIdentifier(record.idempotency_key, 'invalid_idempotency_key'),
    expectedVersion,
  };
}

/**
 * Apply one moderation decision.
 *
 * Ordering mirrors the store lifecycle command: resolve the replay before
 * looking at the current state, because the first attempt already moved it and
 * a retry must return the original outcome rather than a transition error.
 */
export async function handleModerationDecision(
  ctx: OwnerHandlerContext,
): Promise<Response> {
  const listingId = requireIdentifier(firstParam(ctx.params, 'id'), 'invalid_listing_id');
  const body = parseModerationCommand(await readOwnerBody(ctx.request));
  const transition = TRANSITIONS[body.decision];
  const auditKey = `moderation:${body.idempotencyKey}`;

  const replay = await ctx.db.prepare(
    'SELECT event_id, action FROM market_moderation_audit WHERE idempotency_key = ?',
  ).bind(auditKey).first<{ event_id: string; action: string }>();
  if (replay) {
    if (replay.action !== transition.action) {
      return ownerError('idempotency_conflict', ctx.requestId, 409);
    }
    return ownerJson({
      outcome: 'duplicate',
      listing: await getModerationDetail(ctx.db, listingId),
      audit_event_id: replay.event_id,
    }, ctx.requestId);
  }

  const current = await ctx.db.prepare(
    'SELECT state, version FROM market_listing_moderation WHERE product_id = ?',
  ).bind(listingId).first<{ state: ModerationState; version: number }>();
  if (!current) return ownerError('listing_not_found', ctx.requestId, 404);
  if (Number(current.version) !== body.expectedVersion) {
    return ownerError('moderation_version_conflict', ctx.requestId, 409);
  }
  if (!transition.allowedFrom.includes(current.state)) {
    return ownerError('invalid_moderation_transition', ctx.requestId, 409);
  }

  const now = new Date().toISOString();
  const eventId = `mod_${crypto.randomUUID().replaceAll('-', '')}`;
  const guard = 'EXISTS (SELECT 1 FROM market_listing_moderation WHERE product_id = ? AND version = ?)';
  const guardArgs = [listingId, body.expectedVersion];

  const statements: D1PreparedStatement[] = [
    // The audit row is written first and guarded on the same version as the
    // mutation, so D1's atomic batch cannot leave a decision without a record
    // or a record without a decision.
    ctx.db.prepare(`INSERT INTO market_moderation_audit(
      event_id, product_id, report_id, actor_type, actor_identity_id, actor_email,
      action, reason_code, request_id, idempotency_key, from_state, to_state,
      created_at
    ) SELECT ?, ?, NULL, 'moderator', NULL, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`)
      .bind(
        eventId, listingId, ctx.actor.email, transition.action, body.reasonCode,
        ctx.requestId, auditKey, current.state, transition.moderationState, now,
        ...guardArgs,
      ),
  ];
  if (transition.productStatus) {
    statements.push(ctx.db.prepare(
      `UPDATE sotuvchi_products SET status = ?, updated_at = ? WHERE id = ? AND ${guard}`,
    ).bind(transition.productStatus, now, listingId, ...guardArgs));
  }
  // Last, because every statement above is guarded on the version it advances.
  statements.push(ctx.db.prepare(
    `UPDATE market_listing_moderation
     SET state = ?, reason_code = ?, decision_source = 'moderator',
       decided_at = ?, version = version + 1, last_operation_key = ?, updated_at = ?
     WHERE product_id = ? AND version = ?`,
  ).bind(
    transition.moderationState, body.reasonCode, now, auditKey, now,
    listingId, body.expectedVersion,
  ));

  const results = await ctx.db.batch(statements);
  if (Number(results.at(-1)?.meta?.changes ?? 0) !== 1) {
    return ownerError('moderation_version_conflict', ctx.requestId, 409);
  }

  // Refetched rather than assembled from what we intended to write, so the
  // screen shows the row that exists and not an optimistic guess at it.
  return ownerJson({
    outcome: 'applied',
    listing: await getModerationDetail(ctx.db, listingId),
    audit_event_id: eventId,
  }, ctx.requestId);
}

interface ReportCommandBody {
  resolution: ReportResolution;
  reasonCode: ModerationReason | null;
  idempotencyKey: string;
  expectedVersion: number;
}

const REPORT_KEYS = ['resolution', 'reason_code', 'idempotency_key', 'expected_version'];

export function parseReportCommand(raw: unknown): ReportCommandBody {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new OwnerValidationError('invalid_body');
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!REPORT_KEYS.includes(key)) throw new OwnerValidationError('unexpected_field');
  }
  const resolution = record.resolution;
  if (
    typeof resolution !== 'string'
    || !(REPORT_RESOLUTIONS as readonly string[]).includes(resolution)
  ) {
    throw new OwnerValidationError('invalid_resolution');
  }
  let reasonCode: ModerationReason | null = null;
  if (record.reason_code !== undefined && record.reason_code !== null) {
    if (
      typeof record.reason_code !== 'string'
      || !(MODERATION_REASONS as readonly string[]).includes(record.reason_code)
    ) {
      throw new OwnerValidationError('invalid_reason_code');
    }
    reasonCode = record.reason_code as ModerationReason;
  }
  const expectedVersion = record.expected_version;
  if (
    typeof expectedVersion !== 'number'
    || !Number.isInteger(expectedVersion)
    || expectedVersion < 1
  ) {
    throw new OwnerValidationError('invalid_expected_version');
  }
  return {
    resolution: resolution as ReportResolution,
    reasonCode,
    idempotencyKey: requireIdentifier(record.idempotency_key, 'invalid_idempotency_key'),
    expectedVersion,
  };
}

export async function listReports(
  db: D1Database,
  filters: { status: string | null; limit: number; offset: number },
): Promise<Array<Record<string, unknown>>> {
  const where = filters.status ? 'WHERE report.status = ?' : '';
  const binds: unknown[] = filters.status ? [filters.status] : [];
  // `note` and every reporter reference are absent by construction: the queue
  // shows what was reported and why, never who reported it.
  const result = await db.prepare(`
    SELECT report.id, report.product_id, product.name AS listing_name,
      report.reason_code, report.status, report.moderation_action,
      report.version, report.created_at,
      moderation.state AS listing_state
    FROM market_listing_reports AS report
    JOIN sotuvchi_products AS product ON product.id = report.product_id
    LEFT JOIN market_listing_moderation AS moderation
      ON moderation.product_id = report.product_id
    ${where}
    ORDER BY report.created_at ASC, report.id
    LIMIT ? OFFSET ?
  `).bind(...binds, filters.limit, filters.offset).all<Record<string, unknown>>();
  return result.results ?? [];
}

export async function handleReportResolution(
  ctx: OwnerHandlerContext,
): Promise<Response> {
  const reportId = requireIdentifier(firstParam(ctx.params, 'id'), 'invalid_report_id');
  const body = parseReportCommand(await readOwnerBody(ctx.request));
  const action = body.resolution === 'resolve' ? 'report.resolved' : 'report.dismissed';
  const nextStatus = body.resolution === 'resolve' ? 'resolved' : 'dismissed';
  const auditKey = `report:${body.idempotencyKey}`;

  const replay = await ctx.db.prepare(
    'SELECT event_id, action FROM market_moderation_audit WHERE idempotency_key = ?',
  ).bind(auditKey).first<{ event_id: string; action: string }>();
  if (replay) {
    if (replay.action !== action) {
      return ownerError('idempotency_conflict', ctx.requestId, 409);
    }
    return ownerJson({ outcome: 'duplicate', audit_event_id: replay.event_id }, ctx.requestId);
  }

  const report = await ctx.db.prepare(
    'SELECT id, product_id, status, version FROM market_listing_reports WHERE id = ?',
  ).bind(reportId).first<{
    id: string; product_id: string; status: string; version: number;
  }>();
  if (!report) return ownerError('report_not_found', ctx.requestId, 404);
  if (Number(report.version) !== body.expectedVersion) {
    return ownerError('report_version_conflict', ctx.requestId, 409);
  }
  if (report.status === 'resolved' || report.status === 'dismissed') {
    return ownerError('invalid_report_transition', ctx.requestId, 409);
  }

  const now = new Date().toISOString();
  const eventId = `rep_${crypto.randomUUID().replaceAll('-', '')}`;
  const guard = 'EXISTS (SELECT 1 FROM market_listing_reports WHERE id = ? AND version = ?)';
  const guardArgs = [reportId, body.expectedVersion];

  const results = await ctx.db.batch([
    ctx.db.prepare(`INSERT INTO market_moderation_audit(
      event_id, product_id, report_id, actor_type, actor_identity_id, actor_email,
      action, reason_code, request_id, idempotency_key, from_state, to_state,
      created_at
    ) SELECT ?, ?, ?, 'moderator', NULL, ?, ?, ?, ?, ?, NULL, NULL, ? WHERE ${guard}`)
      .bind(
        eventId, report.product_id, reportId, ctx.actor.email, action,
        body.reasonCode, ctx.requestId, auditKey, now, ...guardArgs,
      ),
    ctx.db.prepare(
      `UPDATE market_listing_reports
       SET status = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).bind(nextStatus, now, reportId, body.expectedVersion),
  ]);
  if (Number(results.at(-1)?.meta?.changes ?? 0) !== 1) {
    return ownerError('report_version_conflict', ctx.requestId, 409);
  }
  return ownerJson({ outcome: 'applied', audit_event_id: eventId }, ctx.requestId);
}

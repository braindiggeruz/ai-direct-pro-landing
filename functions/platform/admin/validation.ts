// P3.1 request validation.
//
// Every owner mutation must arrive with a closed-list reason code, an
// idempotency key and — for high-impact actions — a typed confirmation that
// echoes the exact target. Pagination and filters are bounded here so no
// endpoint can be talked into an unbounded scan.
export const OWNER_REASON_CODES = [
  'pilot_onboarding',
  'pilot_paused_by_owner',
  'seller_request',
  'policy_violation',
  'suspected_abuse',
  'data_quality',
  'incident_response',
  'operator_error_recovery',
] as const;
export type OwnerReasonCode = (typeof OWNER_REASON_CODES)[number];

export const OWNER_AUDIT_ACTIONS = [
  'store.suspend',
  'store.restore',
  'pilot.activate',
  'pilot.pause',
  'automation.replay',
  // An owner-assisted grant of seller authority to a Telegram identity, and the
  // withdrawal that reverses it. Paired like pilot.activate/pilot.pause. Both
  // are recorded against the store, which is the thing being granted access to.
  'seller.bind',
  'seller.unbind',
] as const;
export type OwnerAuditAction = (typeof OWNER_AUDIT_ACTIONS)[number];

/** Actions that additionally require a typed confirmation of the target id. */
const TYPED_CONFIRMATION_ACTIONS: ReadonlySet<OwnerAuditAction> = new Set<OwnerAuditAction>([
  'store.suspend',
  'pilot.activate',
  'pilot.pause',
  'automation.replay',
]);

export const OWNER_LIMITS = Object.freeze({
  bodyBytes: 2_048,
  identifierLength: 120,
  idempotencyKeyLength: 200,
  requestIdLength: 120,
  emailLength: 200,
  safeJsonBytes: 2_048,
  pageSizeDefault: 25,
  pageSizeMax: 100,
  pageOffsetMax: 100_000,
});

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;

export class OwnerValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'OwnerValidationError';
  }
}

function bounded(value: unknown, max: number, code: string): string {
  if (typeof value !== 'string') throw new OwnerValidationError(code);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || !SAFE_IDENTIFIER.test(trimmed)) {
    throw new OwnerValidationError(code);
  }
  return trimmed;
}

export function requireIdentifier(value: unknown, code = 'invalid_identifier'): string {
  return bounded(value, OWNER_LIMITS.identifierLength, code);
}

export function requireIdempotencyKey(value: unknown): string {
  return bounded(value, OWNER_LIMITS.idempotencyKeyLength, 'invalid_idempotency_key');
}

export function requireReasonCode(value: unknown): OwnerReasonCode {
  if (typeof value !== 'string' || !(OWNER_REASON_CODES as readonly string[]).includes(value)) {
    throw new OwnerValidationError('invalid_reason_code');
  }
  return value as OwnerReasonCode;
}

export function requireActorEmailFilter(value: unknown): string {
  if (typeof value !== 'string') throw new OwnerValidationError('invalid_actor_email');
  const trimmed = value.trim().toLowerCase();
  if (
    !trimmed
    || trimmed.length > OWNER_LIMITS.emailLength
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
  ) {
    throw new OwnerValidationError('invalid_actor_email');
  }
  return trimmed;
}

export function requiresTypedConfirmation(action: OwnerAuditAction): boolean {
  return TYPED_CONFIRMATION_ACTIONS.has(action);
}

/**
 * High-impact actions require the operator to retype the target id. The check
 * is exact: a trimmed, case-sensitive match against the resolved target, so a
 * mis-clicked row cannot be confirmed by a near-miss.
 */
export function requireTypedConfirmation(
  action: OwnerAuditAction,
  confirmation: unknown,
  targetId: string,
): void {
  if (!requiresTypedConfirmation(action)) return;
  if (typeof confirmation !== 'string' || confirmation.trim() !== targetId) {
    throw new OwnerValidationError('confirmation_mismatch');
  }
}

export interface OwnerMutationBody {
  reasonCode: OwnerReasonCode;
  idempotencyKey: string;
  confirmation?: string;
}

const MUTATION_KEYS = ['confirmation', 'idempotency_key', 'reason_code'];

/**
 * Parse a mutation body. The key set is closed: an unexpected field is a
 * rejection rather than something silently ignored, so a caller cannot smuggle
 * an org override or a free-text note into an audited action.
 */
export function parseOwnerMutationBody(raw: unknown): OwnerMutationBody {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new OwnerValidationError('invalid_body');
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!MUTATION_KEYS.includes(key)) throw new OwnerValidationError('unexpected_field');
  }
  const body: OwnerMutationBody = {
    reasonCode: requireReasonCode(record.reason_code),
    idempotencyKey: requireIdempotencyKey(record.idempotency_key),
  };
  if (record.confirmation !== undefined) {
    if (typeof record.confirmation !== 'string') {
      throw new OwnerValidationError('invalid_confirmation');
    }
    body.confirmation = record.confirmation;
  }
  return body;
}

export interface Pagination {
  limit: number;
  offset: number;
}

/** Bounded pagination. A missing, negative or oversized value is clamped. */
export function parsePagination(url: URL): Pagination {
  const rawLimit = Number(url.searchParams.get('limit') ?? OWNER_LIMITS.pageSizeDefault);
  const rawOffset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(OWNER_LIMITS.pageSizeMax, Math.max(1, Math.floor(rawLimit)))
    : OWNER_LIMITS.pageSizeDefault;
  const offset = Number.isFinite(rawOffset)
    ? Math.min(OWNER_LIMITS.pageOffsetMax, Math.max(0, Math.floor(rawOffset)))
    : 0;
  return { limit, offset };
}

/**
 * Validate a filter against a closed list. An unrecognised value is rejected,
 * not coerced to "all", so a typo cannot silently widen a query.
 */
export function parseEnumFilter<T extends string>(
  url: URL,
  param: string,
  allowed: readonly T[],
): T | null {
  const value = url.searchParams.get(param);
  if (value === null || value === '' || value === 'all') return null;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new OwnerValidationError(`invalid_${param}`);
  }
  return value as T;
}

/** Bound the safe-metadata snapshots the audit trail stores. */
export function safeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).byteLength > OWNER_LIMITS.safeJsonBytes) {
    throw new OwnerValidationError('metadata_too_large');
  }
  return text;
}

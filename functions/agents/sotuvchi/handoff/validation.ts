import type { Locale } from '../../../platform/contracts';
import { requireCatalogId } from '../catalog';
import { HandoffValidationError } from './errors';
import {
  HANDOFF_REASONS,
  HANDOFF_STATUSES,
  SELLER_REPLY_STATES,
  type HandoffReason,
  type HandoffStatus,
  type SellerReplyState,
  type SellerReplyWorkflowPayload,
} from './types';

export const HANDOFF_LIMITS = Object.freeze({
  questionMin: 2,
  questionMax: 1_000,
  replyMin: 1,
  replyMax: 1_000,
  listLimit: 10,
  /** Seven days of retention for question and reply content. */
  contentTtlMs: 7 * 24 * 60 * 60 * 1000,
  /** A reply target expires well before the content does. */
  replySessionTtlMs: 24 * 60 * 60 * 1000,
});

const STATUSES = new Set<string>(HANDOFF_STATUSES);
const REASONS = new Set<string>(HANDOFF_REASONS);
const REPLY_STATES = new Set<string>(SELLER_REPLY_STATES);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  return Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export function requireHandoffId(value: unknown): string {
  try {
    return requireCatalogId(value);
  } catch {
    throw new HandoffValidationError('invalid_id');
  }
}

export function requireHandoffLocale(value: unknown): Locale {
  if (value !== 'ru' && value !== 'uz') {
    throw new HandoffValidationError('invalid_context');
  }
  return value;
}

/** Plain bounded text. Markup, control characters and empties are rejected. */
function normalizeContent(
  value: unknown,
  min: number,
  max: number,
  code: 'invalid_question' | 'invalid_reply',
): string {
  if (typeof value !== 'string') throw new HandoffValidationError(code);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < min
    || normalized.length > max
    || hasControlCharacters(normalized)
  ) {
    throw new HandoffValidationError(code);
  }
  return normalized;
}

export function normalizeHandoffQuestion(value: unknown): string {
  return normalizeContent(
    value,
    HANDOFF_LIMITS.questionMin,
    HANDOFF_LIMITS.questionMax,
    'invalid_question',
  );
}

export function normalizeHandoffReply(value: unknown): string {
  return normalizeContent(
    value,
    HANDOFF_LIMITS.replyMin,
    HANDOFF_LIMITS.replyMax,
    'invalid_reply',
  );
}

export function requireHandoffStatus(value: unknown): HandoffStatus {
  if (typeof value !== 'string' || !STATUSES.has(value)) {
    throw new HandoffValidationError('invalid_state');
  }
  return value as HandoffStatus;
}

export function requireHandoffReason(value: unknown): HandoffReason {
  if (typeof value !== 'string' || !REASONS.has(value)) {
    throw new HandoffValidationError('invalid_reason');
  }
  return value as HandoffReason;
}

export function requireSellerReplyState(value: unknown): SellerReplyState {
  if (typeof value !== 'string' || !REPLY_STATES.has(value)) {
    throw new HandoffValidationError('invalid_state');
  }
  return value as SellerReplyState;
}

export function requireHandoffVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new HandoffValidationError('invalid_version');
  }
  return Number(value);
}

export function requireHandoffLimit(value: unknown, fallback: number): number {
  const candidate = value === undefined ? fallback : value;
  if (
    !Number.isInteger(candidate)
    || Number(candidate) < 1
    || Number(candidate) > HANDOFF_LIMITS.listLimit
  ) {
    throw new HandoffValidationError('invalid_input');
  }
  return Number(candidate);
}

/** Workflow payload carries the handoff reference only — never content. */
export function validateSellerReplyPayload(
  value: unknown,
): SellerReplyWorkflowPayload {
  if (!isPlainObject(value) || !hasExactKeys(value, new Set(['handoffId']))) {
    throw new HandoffValidationError('invalid_input');
  }
  return { handoffId: requireHandoffId(value.handoffId) };
}

export function expiryFrom(createdAt: string, ttlMs: number): string {
  const base = Date.parse(createdAt);
  if (!Number.isFinite(base)) {
    throw new HandoffValidationError('invalid_context');
  }
  return new Date(base + ttlMs).toISOString();
}

export function isExpiredAt(expiresAt: string, now: string): boolean {
  const expiry = Date.parse(expiresAt);
  const current = Date.parse(now);
  if (!Number.isFinite(expiry) || !Number.isFinite(current)) return true;
  return expiry <= current;
}

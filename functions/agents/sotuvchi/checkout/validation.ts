import type { Locale } from '../../../platform/contracts';
import { requireCatalogId } from '../catalog';
import { CheckoutValidationError } from './errors';
import {
  CHECKOUT_AVAILABILITIES,
  CHECKOUT_ORDER_STATUSES,
  CHECKOUT_STATES,
  type CheckoutAvailability,
  type CheckoutIdentityContext,
  type CheckoutOrderStatus,
  type CheckoutState,
  type CheckoutWorkflowPayload,
} from './types';

export const CHECKOUT_LIMITS = Object.freeze({
  quantityMin: 1,
  quantityMax: 99,
  nameMin: 2,
  nameMax: 80,
  addressMin: 5,
  addressMax: 240,
  commentMax: 240,
  totalMinor: 99_000_000_000_000,
});

/** Uzbekistan only in P2.4: +998 plus nine national digits. */
export const CHECKOUT_PHONE_PREFIX = '+998';

const ORDER_NUMBER = /^S-[2-9A-HJ-NP-Z]{6}$/;
const BOT_USERNAME = /^[a-z][a-z0-9_]{4,31}$/;
const STATES = new Set<string>(CHECKOUT_STATES);
const STATUSES = new Set<string>(CHECKOUT_ORDER_STATUSES);
const AVAILABILITIES = new Set<string>(CHECKOUT_AVAILABILITIES);
const IDENTITY_CONTEXT_KEYS = new Set([
  'identityId',
  'botUsername',
  'requestId',
  'locale',
]);

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

export function requireCheckoutId(value: unknown): string {
  try {
    return requireCatalogId(value);
  } catch {
    throw new CheckoutValidationError('invalid_id');
  }
}

export function requireCheckoutLocale(value: unknown): Locale {
  if (value !== 'ru' && value !== 'uz') {
    throw new CheckoutValidationError('invalid_context');
  }
  return value;
}

export function requireCheckoutBotUsername(value: unknown): string {
  if (typeof value !== 'string' || !BOT_USERNAME.test(value)) {
    throw new CheckoutValidationError('invalid_context');
  }
  return value;
}

export function normalizeCheckoutIdentityContext(
  value: unknown,
): CheckoutIdentityContext {
  if (!isPlainObject(value) || !hasExactKeys(value, IDENTITY_CONTEXT_KEYS)) {
    throw new CheckoutValidationError('invalid_context');
  }
  return {
    identityId: requireCheckoutId(value.identityId),
    botUsername: requireCheckoutBotUsername(value.botUsername),
    requestId: requireCheckoutId(value.requestId),
    locale: requireCheckoutLocale(value.locale),
  };
}

export function normalizeCheckoutQuantity(value: unknown): number {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < CHECKOUT_LIMITS.quantityMin
    || value > CHECKOUT_LIMITS.quantityMax
  ) {
    throw new CheckoutValidationError('invalid_quantity');
  }
  return value;
}

/** Buyer text is accepted only as one or two ASCII digits. */
export function parseCheckoutQuantityText(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[0-9]{1,2}$/.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return quantity >= CHECKOUT_LIMITS.quantityMin
    && quantity <= CHECKOUT_LIMITS.quantityMax
    ? quantity
    : null;
}

export function normalizeBuyerName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new CheckoutValidationError('invalid_name');
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < CHECKOUT_LIMITS.nameMin
    || normalized.length > CHECKOUT_LIMITS.nameMax
    || hasControlCharacters(normalized)
  ) {
    throw new CheckoutValidationError('invalid_name');
  }
  return normalized;
}

/**
 * Accepts +998XXXXXXXXX, 998XXXXXXXXX and XXXXXXXXX with optional spaces,
 * dashes or parentheses. Stores the E.164 Uzbekistan form. No other country
 * code is supported in P2.4.
 */
export function normalizeBuyerPhone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 32) {
    throw new CheckoutValidationError('invalid_phone');
  }
  const compact = value.trim().replace(/[\s()-]/g, '');
  const national = /^\+?998([1-9][0-9]{8})$/.exec(compact)?.[1]
    ?? /^([1-9][0-9]{8})$/.exec(compact)?.[1];
  if (!national) throw new CheckoutValidationError('invalid_phone');
  return `${CHECKOUT_PHONE_PREFIX}${national}`;
}

export function maskBuyerPhone(value: unknown): string {
  const phone = normalizeBuyerPhone(value);
  return `${CHECKOUT_PHONE_PREFIX} ** *** ** ${phone.slice(-2)}`;
}

export function normalizeBuyerAddress(value: unknown): string {
  if (typeof value !== 'string') {
    throw new CheckoutValidationError('invalid_address');
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < CHECKOUT_LIMITS.addressMin
    || normalized.length > CHECKOUT_LIMITS.addressMax
    || hasControlCharacters(normalized)
  ) {
    throw new CheckoutValidationError('invalid_address');
  }
  return normalized;
}

export function normalizeBuyerComment(value: unknown): string {
  if (typeof value !== 'string') {
    throw new CheckoutValidationError('invalid_comment');
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < 1
    || normalized.length > CHECKOUT_LIMITS.commentMax
    || hasControlCharacters(normalized)
  ) {
    throw new CheckoutValidationError('invalid_comment');
  }
  return normalized;
}

export function requireOrderNumber(value: unknown): string {
  if (typeof value !== 'string' || !ORDER_NUMBER.test(value)) {
    throw new CheckoutValidationError('invalid_order_number');
  }
  return value;
}

export function requireOrderStatus(value: unknown): CheckoutOrderStatus {
  if (typeof value !== 'string' || !STATUSES.has(value)) {
    throw new CheckoutValidationError('invalid_state');
  }
  return value as CheckoutOrderStatus;
}

export function requireCheckoutState(value: unknown): CheckoutState {
  if (typeof value !== 'string' || !STATES.has(value)) {
    throw new CheckoutValidationError('invalid_state');
  }
  return value as CheckoutState;
}

export function requireCheckoutAvailability(
  value: unknown,
): CheckoutAvailability {
  if (typeof value !== 'string' || !AVAILABILITIES.has(value)) {
    throw new CheckoutValidationError('invalid_state');
  }
  return value as CheckoutAvailability;
}

export function requireCheckoutVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new CheckoutValidationError('invalid_version');
  }
  return Number(value);
}

export function requireCheckoutTotal(value: unknown): number {
  if (
    !Number.isInteger(value)
    || Number(value) < 0
    || Number(value) > CHECKOUT_LIMITS.totalMinor
  ) {
    throw new CheckoutValidationError('invalid_quantity');
  }
  return Number(value);
}

/** Workflow payload carries the order reference only — never buyer PII. */
export function validateCheckoutPayload(
  value: unknown,
): CheckoutWorkflowPayload {
  if (!isPlainObject(value) || !hasExactKeys(value, new Set(['orderId']))) {
    throw new CheckoutValidationError('invalid_input');
  }
  return { orderId: requireCheckoutId(value.orderId) };
}

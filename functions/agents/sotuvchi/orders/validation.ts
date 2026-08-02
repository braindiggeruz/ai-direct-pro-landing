import type { Locale } from '../../../platform/contracts';
import { requireCatalogId } from '../catalog';
import { SellerOrdersValidationError } from './errors';
import {
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
  ORDER_FULFILLMENT_STATUSES,
  SELLER_ORDER_STATUSES,
  SELLER_ORDER_TRANSITIONS,
  type NotificationAudience,
  type NotificationStatus,
  type NotificationType,
  type OrderFulfillmentStatus,
  type SellerContext,
  type SellerOrderStatus,
  type SellerOrderTransition,
} from './types';

export const SELLER_ORDER_LIMITS = Object.freeze({
  /**
   * One page of the seller queue. The cabinet pages through the day's work, so
   * the ceiling has to hold a real day rather than the five rows the first
   * dashboard showed; anything beyond a page is fetched with a cursor.
   */
  listLimit: 50,
  maxNotificationAttempts: 100,
});

const STATUSES = new Set<string>(SELLER_ORDER_STATUSES);
const TRANSITIONS = new Set<string>(SELLER_ORDER_TRANSITIONS);
const FULFILLMENTS = new Set<string>(ORDER_FULFILLMENT_STATUSES);
const AUDIENCES = new Set<string>(NOTIFICATION_AUDIENCES);
const NOTIFICATIONS = new Set<string>(NOTIFICATION_TYPES);
const NOTIFICATION_STATE = new Set<string>(NOTIFICATION_STATUSES);
const CONTEXT_KEYS = new Set([
  'identityId',
  'orgId',
  'storeId',
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

export function requireSellerId(value: unknown): string {
  try {
    return requireCatalogId(value);
  } catch {
    throw new SellerOrdersValidationError('invalid_id');
  }
}

export function requireSellerLocale(value: unknown): Locale {
  if (value !== 'ru' && value !== 'uz') {
    throw new SellerOrdersValidationError('invalid_context');
  }
  return value;
}

export function normalizeSellerContext(value: unknown): SellerContext {
  if (!isPlainObject(value) || !hasExactKeys(value, CONTEXT_KEYS)) {
    throw new SellerOrdersValidationError('invalid_context');
  }
  return {
    identityId: requireSellerId(value.identityId),
    orgId: requireSellerId(value.orgId),
    storeId: requireSellerId(value.storeId),
    requestId: requireSellerId(value.requestId),
    locale: requireSellerLocale(value.locale),
  };
}

export function requireSellerOrderStatus(value: unknown): SellerOrderStatus {
  if (typeof value !== 'string' || !STATUSES.has(value)) {
    throw new SellerOrdersValidationError('invalid_state');
  }
  return value as SellerOrderStatus;
}

export function requireSellerTransition(value: unknown): SellerOrderTransition {
  if (typeof value !== 'string' || !TRANSITIONS.has(value)) {
    throw new SellerOrdersValidationError('invalid_state');
  }
  return value as SellerOrderTransition;
}

export function requireFulfillmentStatus(
  value: unknown,
): OrderFulfillmentStatus {
  if (typeof value !== 'string' || !FULFILLMENTS.has(value)) {
    throw new SellerOrdersValidationError('invalid_state');
  }
  return value as OrderFulfillmentStatus;
}

export function requireNotificationAudience(
  value: unknown,
): NotificationAudience {
  if (typeof value !== 'string' || !AUDIENCES.has(value)) {
    throw new SellerOrdersValidationError('invalid_state');
  }
  return value as NotificationAudience;
}

export function requireNotificationType(value: unknown): NotificationType {
  if (typeof value !== 'string' || !NOTIFICATIONS.has(value)) {
    throw new SellerOrdersValidationError('invalid_state');
  }
  return value as NotificationType;
}

export function requireNotificationStatus(value: unknown): NotificationStatus {
  if (typeof value !== 'string' || !NOTIFICATION_STATE.has(value)) {
    throw new SellerOrdersValidationError('invalid_state');
  }
  return value as NotificationStatus;
}

export function requireSellerVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new SellerOrdersValidationError('invalid_version');
  }
  return Number(value);
}

/**
 * Opaque keyset cursor for the seller order queue.
 *
 * The queue is ordered by `placed_at DESC, id ASC`, so a page boundary needs
 * both halves of that key. The value is opaque to the client on purpose: it
 * carries no store, no identity and no offset arithmetic a caller could walk
 * into another store's rows.
 */
export interface SellerOrderCursor {
  placedAt: string;
  orderId: string;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - value.length % 4) % 4);
    return new TextDecoder().decode(
      Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

export function encodeSellerOrderCursor(cursor: SellerOrderCursor): string {
  return encodeBase64Url(JSON.stringify({
    p: cursor.placedAt,
    i: cursor.orderId,
  }));
}

export function requireSellerOrderCursor(value: unknown): SellerOrderCursor | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new SellerOrdersValidationError('invalid_input');
  }
  const decoded = decodeBase64Url(value);
  if (!decoded) throw new SellerOrdersValidationError('invalid_input');
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new SellerOrdersValidationError('invalid_input');
  }
  if (
    !isPlainObject(parsed)
    || !hasExactKeys(parsed, new Set(['p', 'i']))
    || typeof parsed.p !== 'string'
    || !ISO_TIMESTAMP.test(parsed.p)
    || Number.isNaN(Date.parse(parsed.p))
  ) {
    throw new SellerOrdersValidationError('invalid_input');
  }
  return { placedAt: parsed.p, orderId: requireSellerId(parsed.i) };
}

export function requireSellerStatusFilter(
  value: unknown,
): SellerOrderStatus | null {
  if (value === undefined || value === null || value === '') return null;
  return requireSellerOrderStatus(value);
}

export function requireSellerLimit(value: unknown, fallback: number): number {
  const candidate = value === undefined ? fallback : value;
  if (
    !Number.isInteger(candidate)
    || Number(candidate) < 1
    || Number(candidate) > SELLER_ORDER_LIMITS.listLimit
  ) {
    throw new SellerOrdersValidationError('invalid_input');
  }
  return Number(candidate);
}

/**
 * Derives the seller lifecycle from the P2.4 status plus the additive
 * fulfillment column. Any other pair is a corrupt row, not a new state.
 */
export function toSellerOrderStatus(
  status: string,
  fulfillment: string,
): SellerOrderStatus {
  if (status === 'cancelled' && fulfillment === 'none') return 'cancelled';
  if (status === 'placed') {
    if (fulfillment === 'none') return 'placed';
    if (fulfillment === 'confirmed') return 'confirmed';
    if (fulfillment === 'done') return 'done';
  }
  throw new SellerOrdersValidationError('invalid_state');
}

export function isAllowedSellerTransition(
  from: SellerOrderStatus,
  transition: SellerOrderTransition,
): boolean {
  if (transition === 'confirm') return from === 'placed';
  if (transition === 'cancel') return from === 'placed';
  return from === 'confirmed';
}

export function transitionTarget(
  transition: SellerOrderTransition,
): SellerOrderStatus {
  if (transition === 'confirm') return 'confirmed';
  if (transition === 'cancel') return 'cancelled';
  return 'done';
}

import type { WorkflowJsonValue } from '../../../platform/contracts';
import {
  STORE_DELIVERY_MODES,
  STORE_PAYMENT_METHODS,
  type SotuvchiIdentityContext,
  type SotuvchiOnboardingDraft,
  type StoreDeliveryMode,
  type StorePaymentMethod,
  type SubmitOnboardingStepInput,
} from '../types';
import { SotuvchiOnboardingError } from './errors';

const DELIVERY_MODES = new Set<string>(STORE_DELIVERY_MODES);
const PAYMENT_METHODS = new Set<string>(STORE_PAYMENT_METHODS);
const CONTEXT_KEYS = new Set([
  'identityId',
  'botUsername',
  'requestId',
  'locale',
]);
const DRAFT_KEYS = new Set([
  'storeName',
  'locale',
  'deliveryMode',
  'paymentMethods',
]);
const STEP_KEYS = new Set([
  'step',
  'value',
  'expectedVersion',
  'idempotencyKey',
]);
const BOT_USERNAME = /^[a-z][a-z0-9_]{4,31}$/;
const STOREFRONT_CODE = /^s-[a-z2-7]{16}$/;
const SAFE_IDEMPOTENCY_KEY = /^[a-zA-Z0-9:._-]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
): boolean {
  return Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function requireBoundedId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SotuvchiOnboardingError('invalid_context');
  }
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > 120
    || hasControlCharacters(normalized)
  ) {
    throw new SotuvchiOnboardingError('invalid_context');
  }
  return normalized;
}

export function normalizeSotuvchiIdentityContext(
  value: unknown,
): SotuvchiIdentityContext {
  if (!isPlainObject(value) || !hasExactKeys(value, CONTEXT_KEYS)) {
    throw new SotuvchiOnboardingError('invalid_context');
  }
  if (
    typeof value.botUsername !== 'string'
    || !BOT_USERNAME.test(value.botUsername)
  ) {
    throw new SotuvchiOnboardingError('invalid_context');
  }
  if (value.locale !== 'ru' && value.locale !== 'uz') {
    throw new SotuvchiOnboardingError('invalid_context');
  }
  return {
    identityId: requireBoundedId(value.identityId),
    botUsername: value.botUsername,
    requestId: requireBoundedId(value.requestId),
    locale: value.locale,
  };
}

export function normalizeStoreName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SotuvchiOnboardingError('invalid_name');
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < 2
    || normalized.length > 80
    || hasControlCharacters(normalized)
    || /^(?:https?:\/\/|www\.)\S+$/iu.test(normalized)
  ) {
    throw new SotuvchiOnboardingError('invalid_name');
  }
  return normalized;
}

export function normalizeStoreLocale(value: unknown): 'ru' | 'uz' {
  if (value !== 'ru' && value !== 'uz') {
    throw new SotuvchiOnboardingError('invalid_locale');
  }
  return value;
}

export function normalizeDeliveryMode(value: unknown): StoreDeliveryMode {
  if (typeof value !== 'string' || !DELIVERY_MODES.has(value)) {
    throw new SotuvchiOnboardingError('invalid_delivery');
  }
  return value as StoreDeliveryMode;
}

export function normalizePaymentMethods(
  value: unknown,
): readonly StorePaymentMethod[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > STORE_PAYMENT_METHODS.length
  ) {
    throw new SotuvchiOnboardingError('invalid_payment');
  }
  const methods = value.map((method) => {
    if (typeof method !== 'string' || !PAYMENT_METHODS.has(method)) {
      throw new SotuvchiOnboardingError('invalid_payment');
    }
    return method as StorePaymentMethod;
  });
  if (new Set(methods).size !== methods.length) {
    throw new SotuvchiOnboardingError('invalid_payment');
  }
  return methods;
}

export function validateOnboardingDraft(
  value: unknown,
): SotuvchiOnboardingDraft {
  if (!isPlainObject(value) || !hasExactKeys(value, DRAFT_KEYS)) {
    throw new SotuvchiOnboardingError('invalid_step');
  }
  return {
    storeName: value.storeName === null
      ? null
      : normalizeStoreName(value.storeName),
    locale: value.locale === null
      ? null
      : normalizeStoreLocale(value.locale),
    deliveryMode: value.deliveryMode === null
      ? null
      : normalizeDeliveryMode(value.deliveryMode),
    paymentMethods: normalizeOptionalPaymentMethods(value.paymentMethods),
  };
}

function normalizeOptionalPaymentMethods(
  value: unknown,
): readonly StorePaymentMethod[] {
  if (Array.isArray(value) && value.length === 0) return [];
  return normalizePaymentMethods(value);
}

function requireExpectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new SotuvchiOnboardingError('invalid_version');
  }
  return Number(value);
}

function requireIdempotencyKey(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 240
    || !SAFE_IDEMPOTENCY_KEY.test(value)
  ) {
    throw new SotuvchiOnboardingError('invalid_idempotency_key');
  }
  return value;
}

export function normalizeSubmitStepInput(
  value: unknown,
): SubmitOnboardingStepInput {
  if (!isPlainObject(value) || !hasExactKeys(value, STEP_KEYS)) {
    throw new SotuvchiOnboardingError('invalid_step');
  }
  const expectedVersion = requireExpectedVersion(value.expectedVersion);
  const idempotencyKey = requireIdempotencyKey(value.idempotencyKey);
  switch (value.step) {
    case 'name':
      return {
        step: 'name',
        value: normalizeStoreName(value.value),
        expectedVersion,
        idempotencyKey,
      };
    case 'locale':
      return {
        step: 'locale',
        value: normalizeStoreLocale(value.value),
        expectedVersion,
        idempotencyKey,
      };
    case 'delivery':
      return {
        step: 'delivery',
        value: normalizeDeliveryMode(value.value),
        expectedVersion,
        idempotencyKey,
      };
    case 'payment':
      return {
        step: 'payment',
        value: normalizePaymentMethods(value.value),
        expectedVersion,
        idempotencyKey,
      };
    default:
      throw new SotuvchiOnboardingError('invalid_step');
  }
}

export function requireStorefrontCode(value: unknown): string {
  if (typeof value !== 'string' || !STOREFRONT_CODE.test(value)) {
    throw new SotuvchiOnboardingError('invalid_storefront_code');
  }
  return value;
}

export function isStorefrontCode(value: string): boolean {
  return STOREFRONT_CODE.test(value);
}

export function triggerString<TValue extends string>(
  value: WorkflowJsonValue | undefined,
  normalizer: (input: unknown) => TValue,
): TValue {
  if (!isPlainObject(value) || Object.keys(value).length !== 1) {
    throw new SotuvchiOnboardingError('invalid_step');
  }
  return normalizer(value.value);
}

export function triggerPayments(
  value: WorkflowJsonValue | undefined,
): readonly StorePaymentMethod[] {
  if (!isPlainObject(value) || Object.keys(value).length !== 1) {
    throw new SotuvchiOnboardingError('invalid_step');
  }
  return normalizePaymentMethods(value.value);
}

export function emptyOnboardingDraft(): SotuvchiOnboardingDraft {
  return {
    storeName: null,
    locale: null,
    deliveryMode: null,
    paymentMethods: [],
  };
}

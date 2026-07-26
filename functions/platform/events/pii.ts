import type { EventValue, PiiSafePayload } from '../contracts';

export const MAX_EVENT_PAYLOAD_DEPTH = 5;
export const MAX_EVENT_PAYLOAD_BYTES = 8_192;

type PayloadErrorCode =
  | 'forbidden_key'
  | 'invalid_type'
  | 'invalid_number'
  | 'too_deep'
  | 'too_large'
  | 'circular_reference';

const FORBIDDEN_KEYS = new Set([
  'text',
  'message',
  'body',
  'prompt',
  'email',
  'phone',
  'username',
  'firstname',
  'lastname',
  'address',
  'fullname',
  'raw',
  'content',
  'transcript',
  'telegramid',
  'telegramuserid',
  'chatid',
  'fileid',
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isForbiddenKey(key: string): boolean {
  if (FORBIDDEN_KEYS.has(normalizedKey(key))) return true;
  const tokens = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some((token) => FORBIDDEN_KEYS.has(token));
}

export class EventPayloadValidationError extends Error {
  readonly code: PayloadErrorCode;
  readonly path: string;

  constructor(code: PayloadErrorCode, path: string) {
    super(`event payload rejected: ${code} at ${path}`);
    this.name = 'EventPayloadValidationError';
    this.code = code;
    this.path = path;
  }
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateValue(
  value: unknown,
  path: string,
  depth: number,
  seen: WeakSet<object>,
  maxDepth: number,
): EventValue {
  if (depth > maxDepth) throw new EventPayloadValidationError('too_deep', path);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new EventPayloadValidationError('invalid_number', path);
    return value;
  }
  if (typeof value !== 'object') throw new EventPayloadValidationError('invalid_type', path);
  if (seen.has(value)) throw new EventPayloadValidationError('circular_reference', path);
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => validateValue(item, `${path}[${index}]`, depth + 1, seen, maxDepth));
    }
    if (!isPlainObject(value)) throw new EventPayloadValidationError('invalid_type', path);
    const safe: Record<string, EventValue> = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = path === '$' ? `$.${key}` : `${path}.${key}`;
      if (isForbiddenKey(key)) {
        throw new EventPayloadValidationError('forbidden_key', childPath);
      }
      safe[key] = validateValue(child, childPath, depth + 1, seen, maxDepth);
    }
    return safe;
  } catch (error) {
    if (error instanceof EventPayloadValidationError) throw error;
    throw new EventPayloadValidationError('invalid_type', path);
  } finally {
    seen.delete(value);
  }
}

/** Runtime guardrail, not a DLP system. It rejects known dangerous keys,
 * unsupported JSON values, deep/circular structures and oversized payloads.
 * Errors contain a key path but never the rejected value. */
export function validatePiiSafePayload(
  value: unknown,
  options: { maxDepth?: number; maxBytes?: number } = {},
): PiiSafePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isPlainObject(value)) {
    throw new EventPayloadValidationError('invalid_type', '$');
  }
  const safe = validateValue(
    value,
    '$',
    0,
    new WeakSet<object>(),
    options.maxDepth ?? MAX_EVENT_PAYLOAD_DEPTH,
  ) as PiiSafePayload;
  const encoded = new TextEncoder().encode(JSON.stringify(safe));
  if (encoded.byteLength > (options.maxBytes ?? MAX_EVENT_PAYLOAD_BYTES)) {
    throw new EventPayloadValidationError('too_large', '$');
  }
  return safe;
}

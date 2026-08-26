export const TELEGRAM_ACCOUNT_SERVICE_SCHEMA = 'gptbot.lead-radar.telegram-account-service.v1' as const;
export const TDLIB_CONTAINER_SCHEMA = 'gptbot.lead-radar.tdlib-container.v1' as const;

export const INTERNAL_SERVICE_ORIGIN = 'https://lead-radar-telegram-account.internal';
export const INTERNAL_ACCOUNT_ORIGIN = 'https://lead-radar-telegram-account-do.internal';

export const AUTH_ID_PATTERN = /^[A-Za-z0-9:_-]{16,160}$/u;
export const ACCOUNT_REF_PATTERN = /^lracct_[A-Za-z0-9_-]{32,96}$/u;
export const OPERATION_ID_PATTERN = /^[A-Za-z0-9:_-]{8,160}$/u;
export const ORG_ID_PATTERN = /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/u;
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/u;
export const SAFE_REASON_PATTERN = /^[a-z][a-z0-9_]{2,79}$/u;
export const PAYLOAD_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
export const QR_LOGIN_URL_PATTERN = /^tg:\/\/login\?token=[A-Za-z0-9_-]{16,512}={0,2}$/u;
export const MAX_REQUEST_BYTES = 24_000;
export const MAX_MEDIA_BYTES = 5_000_000;
export const MAX_MEDIA_BASE64_CHARACTERS = Math.ceil(MAX_MEDIA_BYTES / 3) * 4;
export const MAX_SEND_REQUEST_BYTES = MAX_MEDIA_BASE64_CHARACTERS + 32_000;
export const MAX_MEDIA_VALIDATE_REQUEST_BYTES = MAX_SEND_REQUEST_BYTES;
export const MAX_MESSAGE_CHARACTERS = 4_096;
export const MAX_MEDIA_CAPTION_CHARACTERS = 1_024;
export const MEDIA_ID_PATTERN = /^lrtgcm_[a-f0-9]{32}$/u;

export type JsonRecord = Record<string, unknown>;

export interface TelegramTransportMedia extends JsonRecord {
  media_id: string;
  media_digest: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  size_bytes: number;
  base64: string;
}

export type SafeProviderEnvelope =
  | {
    schema: typeof TELEGRAM_ACCOUNT_SERVICE_SCHEMA;
    status: 'sent';
    provider_message_id: string;
  }
  | {
    schema: typeof TELEGRAM_ACCOUNT_SERVICE_SCHEMA;
    status: 'rejected';
    code:
      | 'peer_invalid'
      | 'privacy_restricted'
      | 'flood_wait'
      | 'flood_premium_wait'
      | 'slow_mode'
      | 'account_restricted'
      | 'paid_message_required'
      | 'media_invalid'
      | 'provider_rejected';
    retry_after_seconds?: number;
  }
  | {
    schema: typeof TELEGRAM_ACCOUNT_SERVICE_SCHEMA;
    status: 'ambiguous';
  };

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function hasExactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 20
    && value.length <= 64
    && Number.isFinite(Date.parse(value));
}

export async function readBoundedJson(
  request: Request,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<JsonRecord | null> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return null;
  }
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function validSchema(value: JsonRecord): boolean {
  return value.schema === TELEGRAM_ACCOUNT_SERVICE_SCHEMA;
}

export function validOrgId(value: unknown): value is string {
  return typeof value === 'string' && ORG_ID_PATTERN.test(value);
}

export function validOperationId(value: unknown): value is string {
  return typeof value === 'string' && OPERATION_ID_PATTERN.test(value);
}

export function idempotencyHeaderMatches(request: Request, operationId: string): boolean {
  return validOperationId(operationId)
    && request.headers.get('Idempotency-Key') === operationId;
}

export function validAuthId(value: unknown): value is string {
  return typeof value === 'string' && AUTH_ID_PATTERN.test(value);
}

export function validAccountRef(value: unknown): value is string {
  return typeof value === 'string' && ACCOUNT_REF_PATTERN.test(value);
}

export function validUsername(value: unknown): value is string {
  return typeof value === 'string' && USERNAME_PATTERN.test(value);
}

export function validMessage(
  value: unknown,
  maximumCharacters = MAX_MESSAGE_CHARACTERS,
): value is string {
  if (typeof value !== 'string') return false;
  const length = [...value].length;
  return length >= 1
    && length <= maximumCharacters
    && ![...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (code < 32 && character !== '\n' && character !== '\t')
        || code === 127
        || (code >= 0xd800 && code <= 0xdfff);
    });
}

function transportMediaMagicMatches(
  bytes: Uint8Array,
  mimeType: TelegramTransportMedia['mime_type'],
): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.byteLength >= 3
      && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.byteLength >= signature.length
      && signature.every((byte, index) => bytes[index] === byte);
  }
  return bytes.byteLength >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
}

function strictBase64Bytes(value: string): Uint8Array | null {
  if (value.length < 4
    || value.length > MAX_MEDIA_BASE64_CHARACTERS
    || value.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return null;
  try {
    const raw = atob(value);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) {
      bytes[index] = raw.charCodeAt(index);
    }
    return btoa(raw) === value ? bytes : null;
  } catch {
    return null;
  }
}

/** Validates transport bytes again before the private Durable Object boundary. */
export async function validatedTransportMedia(
  value: unknown,
): Promise<TelegramTransportMedia | null> {
  if (!isRecord(value)
    || !hasExactKeys(value, ['media_id', 'media_digest', 'mime_type', 'size_bytes', 'base64'])
    || typeof value.media_id !== 'string'
    || !MEDIA_ID_PATTERN.test(value.media_id)
    || typeof value.media_digest !== 'string'
    || !PAYLOAD_DIGEST_PATTERN.test(value.media_digest)
    || (value.mime_type !== 'image/jpeg'
      && value.mime_type !== 'image/png'
      && value.mime_type !== 'image/webp')
    || typeof value.size_bytes !== 'number'
    || !Number.isSafeInteger(value.size_bytes)
    || value.size_bytes < 1
    || value.size_bytes > MAX_MEDIA_BYTES
    || typeof value.base64 !== 'string') return null;
  const bytes = strictBase64Bytes(value.base64);
  if (!bytes
    || bytes.byteLength !== value.size_bytes
    || !transportMediaMagicMatches(bytes, value.mime_type)) return null;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes.slice().buffer as ArrayBuffer,
  );
  const digestHex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return digestHex === value.media_digest ? value as TelegramTransportMedia : null;
}

export function validPhoneNumber(value: unknown): value is string {
  return typeof value === 'string' && /^\+[1-9]\d{6,14}$/u.test(value);
}

export function validAuthenticationCode(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9A-Za-z_-]{3,16}$/u.test(value);
}

export function validPassword(value: unknown): value is string {
  return typeof value === 'string'
    && [...value].length >= 1
    && [...value].length <= 256
    && ![...value].some((character) => character.charCodeAt(0) === 0);
}

export function validQrLoginUrl(value: unknown): value is string {
  return typeof value === 'string' && QR_LOGIN_URL_PATTERN.test(value);
}

export function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function noContentResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export function safeErrorResponse(
  reasonCode: string,
  status = 400,
  authId?: string,
): Response {
  const safeReason = SAFE_REASON_PATTERN.test(reasonCode) ? reasonCode : 'gateway_error';
  return jsonResponse({
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    status: 'error',
    ...(authId ? { auth_id: authId } : {}),
    reason_code: safeReason,
  }, status);
}

export function providerEnvelope(value: unknown): SafeProviderEnvelope | null {
  if (!isRecord(value)
    || value.schema !== TDLIB_CONTAINER_SCHEMA
    || typeof value.status !== 'string') return null;
  if (value.status === 'sent'
    && hasExactKeys(value, ['schema', 'status', 'provider_message_id'])
    && typeof value.provider_message_id === 'string'
    && value.provider_message_id.length >= 1
    && value.provider_message_id.length <= 256) {
    return {
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: 'sent',
      provider_message_id: value.provider_message_id,
    };
  }
  if (value.status === 'ambiguous' && hasExactKeys(value, ['schema', 'status'])) {
    return { schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' };
  }
  if (value.status !== 'rejected'
    || !(hasExactKeys(value, ['schema', 'status', 'code'])
      || hasExactKeys(value, ['schema', 'status', 'code', 'retry_after_seconds']))
    || typeof value.code !== 'string') return null;
  const codes = new Set([
    'peer_invalid',
    'privacy_restricted',
    'flood_wait',
    'flood_premium_wait',
    'slow_mode',
    'account_restricted',
    'paid_message_required',
    'media_invalid',
    'provider_rejected',
  ]);
  if (!codes.has(value.code)) return null;
  const retryAfter = value.retry_after_seconds;
  if (retryAfter !== undefined
    && (typeof retryAfter !== 'number'
      || !Number.isSafeInteger(retryAfter)
      || retryAfter < 1
      || retryAfter > 31_536_000)) return null;
  return {
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    status: 'rejected',
    code: value.code as SafeProviderEnvelope extends { status: 'rejected'; code: infer Code }
      ? Code
      : never,
    ...(typeof retryAfter === 'number' ? { retry_after_seconds: retryAfter } : {}),
  };
}

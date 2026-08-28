import {
  exactTelegramBridgeCapabilities,
  isLeadRadarTelegramBridgeE2eEnvelope,
  LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_ID_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_SECRET_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_NONCE_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_PAIRING_ID_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS,
  LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA,
  LEAD_RADAR_TELEGRAM_BRIDGE_SECRET_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_SIGNATURE_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_VERSION_PATTERN,
  type LeadRadarTelegramBridgeCommandKind,
  type LeadRadarTelegramBridgeResultStatus,
} from '../../src/shared/lead-radar-telegram-bridge';

const encoder = new TextEncoder();
const BRIDGE_PATH_PATTERN = /^\/v1\/bridge\/(?:register|poll|commands\/lrtgbc_[a-f0-9]{32}\/(?:result|media))$/u;
const SAFE_RESULT_CODE_PATTERN = /^[a-z][a-z0-9_]{2,79}$/u;
const ORG_ID_PATTERN = /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/u;
const ACCOUNT_REF_PATTERN = /^lracct_[A-Za-z0-9_-]{43}$/u;
const AUTH_ID_PATTERN = /^[A-Za-z0-9:_-]{16,160}$/u;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9:_-]{8,160}$/u;
const KEY_ID_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_BRIDGE_JSON_BYTES = 256_000;
const CLOCK_SKEW_SECONDS = 90;

function validSafeLabel(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 40
    && ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    });
}

export const BRIDGE_SCHEMA = LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA;
export function isFinalizedConnectedAuthRecoverable(
  state: string,
  finalized: boolean,
): boolean {
  return state === 'connected' && finalized;
}
export function bridgeAuthChallengeMayBeCancelled(input: {
  state: string;
  adopted: boolean;
  finalized: boolean;
  expiresAt: string;
  nowMs?: number;
}): boolean {
  if (input.finalized || input.state === 'connected' || input.state === 'revoked') return false;
  if (!input.adopted) return true;
  const expiresAtMs = Date.parse(input.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= (input.nowMs ?? Date.now());
}
export const BRIDGE_COMMAND_KINDS: readonly LeadRadarTelegramBridgeCommandKind[] = [
  'connect', 'connect_phone', 'submit_auth', 'cancel_auth', 'submit_password',
  'disconnect', 'probe', 'resolve_contact', 'validate_media', 'send',
];

export interface BridgeJsonRecord { [key: string]: unknown }

export interface VerifiedBridgeDeviceRequest {
  deviceId: string;
  deviceSecret: Uint8Array;
  nonce: string;
  timestamp: number;
  rawBody: Uint8Array;
  body: BridgeJsonRecord;
}

interface BridgeBodyRequest {
  headers: Headers;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export function bridgeExactKeys(value: BridgeJsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

export function bridgeRecord(value: unknown): value is BridgeJsonRecord {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function bridgeBase64UrlBytes(value: string, expectedBytes?: number): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(
    Math.ceil(value.length / 4) * 4,
    '=',
  );
  try {
    const raw = atob(padded);
    const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
    if ((expectedBytes !== undefined && bytes.byteLength !== expectedBytes)
      || bytesToBase64Url(bytes) !== value) return null;
    return bytes;
  } catch {
    return null;
  }
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function bridgeSha256Hex(value: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', value.slice().buffer as ArrayBuffer)));
}

async function hmac(keyBytes: Uint8Array, value: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes.slice().buffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, value.slice().buffer as ArrayBuffer));
}

async function timingSafeEqual(left: Uint8Array, right: Uint8Array): Promise<boolean> {
  if (left.byteLength !== right.byteLength) return false;
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean;
  };
  if (typeof subtle.timingSafeEqual === 'function') return subtle.timingSafeEqual(left, right);
  // WebCrypto HMAC verification is the constant-time fallback. The left bytes
  // become key material and both sides are compared only inside SubtleCrypto.
  const key = await crypto.subtle.importKey(
    'raw', left.slice().buffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
  const probe = encoder.encode('lead-radar-bridge-timing-safe-equality-v1');
  const signature = await crypto.subtle.sign('HMAC', key, probe);
  const candidateKey = await crypto.subtle.importKey(
    'raw', right.slice().buffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  return crypto.subtle.verify('HMAC', candidateKey, signature, probe);
}

export async function readBridgeJson(request: BridgeBodyRequest): Promise<{
  body: BridgeJsonRecord;
  rawBody: Uint8Array;
} | null> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BRIDGE_JSON_BYTES) return null;
  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return null;
  }
  if (buffer.byteLength < 2 || buffer.byteLength > MAX_BRIDGE_JSON_BYTES) return null;
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return bridgeRecord(parsed) ? { body: parsed, rawBody: new Uint8Array(buffer) } : null;
  } catch {
    return null;
  }
}

function validBridgePath(url: URL): boolean {
  return url.search === '' && url.hash === '' && BRIDGE_PATH_PATTERN.test(url.pathname);
}

export async function verifyBridgeDeviceRequest(input: {
  request: Request;
  tokenDigest: string;
  nowMs?: number;
}): Promise<VerifiedBridgeDeviceRequest | null> {
  const url = new URL(input.request.url);
  const parsed = await readBridgeJson(input.request.clone());
  const deviceId = input.request.headers.get('X-Lead-Radar-Device-Id') ?? '';
  const encodedSecret = input.request.headers.get('X-Lead-Radar-Device-Token') ?? '';
  const timestampText = input.request.headers.get('X-Lead-Radar-Timestamp') ?? '';
  const nonce = input.request.headers.get('X-Lead-Radar-Nonce') ?? '';
  const encodedSignature = input.request.headers.get('X-Lead-Radar-Signature') ?? '';
  if (!parsed
    || input.request.method !== 'POST'
    || !validBridgePath(url)
    || !LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_ID_PATTERN.test(deviceId)
    || !LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_SECRET_PATTERN.test(encodedSecret)
    || !/^\d{10}$/u.test(timestampText)
    || !LEAD_RADAR_TELEGRAM_BRIDGE_NONCE_PATTERN.test(nonce)
    || !LEAD_RADAR_TELEGRAM_BRIDGE_SIGNATURE_PATTERN.test(encodedSignature)) return null;
  const timestamp = Number(timestampText);
  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isSafeInteger(timestamp)
    || Math.abs(Math.floor(nowMs / 1_000) - timestamp) > CLOCK_SKEW_SECONDS) return null;
  const secret = bridgeBase64UrlBytes(encodedSecret, 32);
  const signature = bridgeBase64UrlBytes(encodedSignature, 32);
  if (!secret || !signature || !/^[a-f0-9]{64}$/u.test(input.tokenDigest)) return null;
  const actualDigest = await bridgeSha256Hex(secret);
  const storedDigest = Uint8Array.from(input.tokenDigest.match(/../gu) ?? [], (part) => Number.parseInt(part, 16));
  const candidateDigest = Uint8Array.from(actualDigest.match(/../gu) ?? [], (part) => Number.parseInt(part, 16));
  if (!await timingSafeEqual(storedDigest, candidateDigest)) return null;
  const bodyHash = await bridgeSha256Hex(parsed.rawBody);
  const canonical = encoder.encode([
    'LRTG-BRIDGE-V1',
    'DEVICE-TO-SERVER',
    deviceId,
    timestampText,
    nonce,
    'POST',
    url.pathname,
    bodyHash,
  ].join('\n'));
  const expected = await hmac(secret, canonical);
  if (!await timingSafeEqual(expected, signature)) return null;
  return { deviceId, deviceSecret: secret, nonce, timestamp, ...parsed };
}

export async function signedBridgeResponse(input: {
  body: BodyInit;
  status?: number;
  contentType: string;
  deviceId: string;
  deviceSecret: Uint8Array;
  requestNonce: string;
  path: string;
  commandId: string;
  sequence: number;
  expiresAt: string;
  nowMs?: number;
  /** Prevalidated immutable R2 digest/size for zero-copy media streaming. */
  bodyDigest?: string;
  bodyLength?: number;
}): Promise<Response> {
  const precomputed = input.bodyDigest !== undefined || input.bodyLength !== undefined;
  if (precomputed && (typeof input.bodyDigest !== 'string'
    || !/^[a-f0-9]{64}$/u.test(input.bodyDigest)
    || typeof input.bodyLength !== 'number'
    || !Number.isSafeInteger(input.bodyLength)
    || input.bodyLength < 0)) throw new Error('bridge_response_digest_invalid');
  const raw = precomputed
    ? null
    : typeof input.body === 'string'
      ? encoder.encode(input.body)
      : input.body instanceof Uint8Array
        ? input.body
        : new Uint8Array(await new Response(input.body).arrayBuffer());
  const timestamp = Math.floor((input.nowMs ?? Date.now()) / 1_000);
  const digest = input.bodyDigest ?? await bridgeSha256Hex(raw as Uint8Array);
  const canonical = encoder.encode([
    'LRTG-BRIDGE-V1',
    'SERVER-TO-DEVICE',
    input.deviceId,
    input.requestNonce,
    String(timestamp),
    input.path,
    input.commandId,
    String(input.sequence),
    input.expiresAt,
    digest,
  ].join('\n'));
  const signature = bytesToBase64Url(await hmac(input.deviceSecret, canonical));
  return new Response(raw ?? input.body, {
    status: input.status ?? 200,
    headers: {
      'Content-Type': input.contentType,
      'Content-Length': String(input.bodyLength ?? (raw as Uint8Array).byteLength),
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-Lead-Radar-Server-Timestamp': String(timestamp),
      'X-Lead-Radar-Request-Nonce': input.requestNonce,
      'X-Lead-Radar-Server-Signature': signature,
    },
  });
}

export async function signedRegistrationResponse(input: {
  responseBody: string;
  requestBody: Uint8Array;
  pairingId: string;
  deviceId: string;
  deviceSecret: Uint8Array;
  nowMs?: number;
}): Promise<Response> {
  const timestamp = Math.floor((input.nowMs ?? Date.now()) / 1_000);
  const canonical = encoder.encode([
    'LRTG-BRIDGE-V1',
    'SERVER-TO-DEVICE-REGISTER',
    input.pairingId,
    input.deviceId,
    String(timestamp),
    await bridgeSha256Hex(input.requestBody),
    await bridgeSha256Hex(encoder.encode(input.responseBody)),
  ].join('\n'));
  return new Response(input.responseBody, {
    status: 201,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-Lead-Radar-Server-Timestamp': String(timestamp),
      'X-Lead-Radar-Registration-Signature': bytesToBase64Url(
        await hmac(input.deviceSecret, canonical),
      ),
    },
  });
}

export function validBridgeRegistration(value: BridgeJsonRecord): boolean {
  return bridgeExactKeys(value, [
    'schema', 'pairing_id', 'pairing_code', 'device_secret', 'label', 'version',
    'encryption_public_key_spki',
  ])
    && value.schema === BRIDGE_SCHEMA
    && typeof value.pairing_id === 'string'
    && LEAD_RADAR_TELEGRAM_BRIDGE_PAIRING_ID_PATTERN.test(value.pairing_id)
    && typeof value.pairing_code === 'string'
    && LEAD_RADAR_TELEGRAM_BRIDGE_SECRET_PATTERN.test(value.pairing_code)
    && typeof value.device_secret === 'string'
    && LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_SECRET_PATTERN.test(value.device_secret)
    && typeof value.label === 'string'
    && validSafeLabel(value.label)
    && value.label.trim() === value.label
    && typeof value.version === 'string'
    && LEAD_RADAR_TELEGRAM_BRIDGE_VERSION_PATTERN.test(value.version)
    && typeof value.encryption_public_key_spki === 'string'
    && LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN.test(value.encryption_public_key_spki);
}

export function validBridgePoll(value: BridgeJsonRecord): boolean {
  return bridgeExactKeys(value, ['schema', 'version', 'capabilities'])
    && value.schema === BRIDGE_SCHEMA
    && typeof value.version === 'string'
    && LEAD_RADAR_TELEGRAM_BRIDGE_VERSION_PATTERN.test(value.version)
    && exactTelegramBridgeCapabilities(value.capabilities);
}

export function validBridgeResult(value: BridgeJsonRecord, commandId: string): value is BridgeJsonRecord & {
  sequence: number;
  status: LeadRadarTelegramBridgeResultStatus;
  result_code: string;
  result: BridgeJsonRecord;
} {
  return bridgeExactKeys(value, ['schema', 'command_id', 'sequence', 'status', 'result_code', 'result'])
    && value.schema === BRIDGE_SCHEMA
    && value.command_id === commandId
    && LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN.test(commandId)
    && typeof value.sequence === 'number'
    && Number.isSafeInteger(value.sequence)
    && value.sequence >= 1
    && value.sequence <= 32
    && (value.status === 'progress'
      || value.status === 'succeeded'
      || value.status === 'failed'
      || value.status === 'ambiguous')
    && typeof value.result_code === 'string'
    && SAFE_RESULT_CODE_PATTERN.test(value.result_code)
    && bridgeRecord(value.result);
}

export function validBridgePairingRequest(value: BridgeJsonRecord): boolean {
  return bridgeExactKeys(value, ['schema', 'org_id', 'operation_id', 'label', 'enrollment_code'])
    && value.schema === 'gptbot.lead-radar.telegram-account-service.v1'
    && typeof value.org_id === 'string'
    && ORG_ID_PATTERN.test(value.org_id)
    && typeof value.operation_id === 'string'
    && OPERATION_ID_PATTERN.test(value.operation_id)
    && typeof value.label === 'string'
    && validSafeLabel(value.label)
    && value.label.trim() === value.label
    && typeof value.enrollment_code === 'string'
    && LEAD_RADAR_TELEGRAM_BRIDGE_SECRET_PATTERN.test(value.enrollment_code);
}

export function validBridgeBrowserKey(value: unknown): value is BridgeJsonRecord {
  return bridgeRecord(value)
    && bridgeExactKeys(value, ['alg', 'key_id', 'spki', 'expires_at'])
    && value.alg === 'RSA-OAEP-256'
    && typeof value.key_id === 'string'
    && KEY_ID_PATTERN.test(value.key_id)
    && typeof value.spki === 'string'
    && LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN.test(value.spki)
    && typeof value.expires_at === 'string'
    && Number.isFinite(Date.parse(value.expires_at))
    && Date.parse(value.expires_at) > Date.now() - 5_000
    && Date.parse(value.expires_at) <= Date.now()
      + LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS * 1_000 + 5_000;
}

export function validBridgeE2eEnvelope(value: unknown): boolean {
  return isLeadRadarTelegramBridgeE2eEnvelope(value);
}

export function validBridgeAccountRef(value: unknown): value is string {
  return typeof value === 'string' && ACCOUNT_REF_PATTERN.test(value);
}

export function validBridgeAuthId(value: unknown): value is string {
  return typeof value === 'string' && AUTH_ID_PATTERN.test(value);
}

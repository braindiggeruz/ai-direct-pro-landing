import {
  isLeadRadarTelegramBridgeE2eEnvelope,
  LEAD_RADAR_TELEGRAM_BRIDGE_PAIRING_ID_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_KEY_ID_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS,
  LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA,
  type LeadRadarTelegramBridgeE2eEnvelope,
} from '../../shared/lead-radar-telegram-bridge';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const QR_URL_PATTERN = /^tg:\/\/login\?token=[A-Za-z0-9_-]{16,512}={0,2}$/u;
const QR_DATA_URL_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u;
const CONTEXT_ID_PATTERN = /^[A-Za-z0-9:_-]{8,160}$/u;
const DEVICE_ID_PATTERN = /^lrtgbd_[0-9a-f]{32}$/u;

/** Public HMAC-only Bridge origin; it exposes no owner or account API. */
export const LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN =
  'https://gptbot-lead-radar-telegram-account.braindigger-uz.workers.dev' as const;

export interface TelegramBridgeBrowserKey {
  publicKey: {
    alg: 'RSA-OAEP-256';
    key_id: string;
    spki: string;
    expires_at: string;
  };
  privateKey: CryptoKey;
  expiresAt: string;
}

export interface TelegramBridgeQrPayload {
  authId: string;
  qrCodeDataUrl: string;
  qrLoginUrl: string;
  expiresAt: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('telegram_bridge_crypto_invalid');
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('telegram_bridge_crypto_invalid');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    ? record
    : null;
}

function relayExpiry(value: unknown, now: Date, upperBound: string): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  const upper = Date.parse(upperBound);
  return Number.isFinite(parsed)
    && Number.isFinite(upper)
    && parsed > now.getTime() - 5_000
    && parsed <= now.getTime() + LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS * 1_000
    && parsed <= upper;
}

export function createTelegramBridgeEnrollmentCode(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

export function telegramBridgeEnrollmentUri(input: {
  pairingId: string;
  origin: string;
}): string {
  if (!LEAD_RADAR_TELEGRAM_BRIDGE_PAIRING_ID_PATTERN.test(input.pairingId)) {
    throw new Error('telegram_bridge_pairing_invalid');
  }
  const origin = new URL(input.origin);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('telegram_bridge_pairing_invalid');
  }
  const fragment = new URLSearchParams({
    id: input.pairingId,
    origin: origin.origin,
  });
  return `gptbot-lead-radar://pair#${fragment.toString()}`;
}

/**
 * Generates the one-use browser key used only for a single QR ceremony. The
 * caller must retain `privateKey` in React memory and discard the whole object
 * on terminal state, expiry or unmount; it is intentionally non-exportable.
 */
export async function createTelegramBridgeBrowserKey(
  now = new Date(),
): Promise<TelegramBridgeBrowserKey> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  const spkiBytes = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const spki = bytesToBase64Url(spkiBytes);
  if (!LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN.test(spki)) {
    throw new Error('telegram_bridge_crypto_invalid');
  }
  // WebCrypto applies the generateKey extractability flag to the whole pair.
  // Re-import the private half as non-exportable before returning it; the
  // transient PKCS#8 bytes are overwritten immediately.
  const privatePkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let privateKey: CryptoKey;
  try {
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privatePkcs8,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt'],
    );
  } finally {
    privatePkcs8.fill(0);
  }
  const expiresAt = new Date(
    now.getTime() + LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS * 1_000,
  ).toISOString();
  return {
    publicKey: {
      alg: 'RSA-OAEP-256',
      // The Bridge independently derives the same identifier from the SPKI;
      // accepting a caller-declared id would let a valid envelope be rebound
      // to the wrong ephemeral key.
      key_id: hex(new Uint8Array(await crypto.subtle.digest('SHA-256', spkiBytes))),
      spki,
      expires_at: expiresAt,
    },
    privateKey,
    expiresAt,
  };
}

async function unwrapEnvelope(
  privateKey: CryptoKey,
  envelope: LeadRadarTelegramBridgeE2eEnvelope,
): Promise<string> {
  if (!isLeadRadarTelegramBridgeE2eEnvelope(envelope)) {
    throw new Error('telegram_bridge_crypto_invalid');
  }
  const wrapped = base64UrlToBytes(envelope.wrapped_key);
  const iv = base64UrlToBytes(envelope.iv);
  const ciphertext = base64UrlToBytes(envelope.ciphertext);
  // 131,072 base64url characters decode to at most 98,304 bytes. This is the
  // shared relay ceiling; the decrypted PNG data URL is then checked against
  // the tighter 90,000-character product bound below.
  if (iv.byteLength !== 12 || ciphertext.byteLength < 17 || ciphertext.byteLength > 98_304) {
    throw new Error('telegram_bridge_crypto_invalid');
  }
  let rawKey: ArrayBuffer;
  try {
    rawKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrapped);
  } finally {
    wrapped.fill(0);
  }
  const rawBytes = new Uint8Array(rawKey);
  if (rawBytes.byteLength !== 32) {
    rawBytes.fill(0);
    throw new Error('telegram_bridge_crypto_invalid');
  }
  try {
    const key = await crypto.subtle.importKey('raw', rawBytes, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      ciphertext,
    );
    return decoder.decode(plaintext);
  } catch {
    throw new Error('telegram_bridge_crypto_invalid');
  } finally {
    rawBytes.fill(0);
    iv.fill(0);
    ciphertext.fill(0);
  }
}

export async function decryptTelegramBridgeQrEnvelope(input: {
  browserKey: TelegramBridgeBrowserKey;
  envelope: LeadRadarTelegramBridgeE2eEnvelope;
  orgId: string;
  deviceId: string;
  commandId: string;
  authId: string;
  now?: Date;
}): Promise<TelegramBridgeQrPayload> {
  if (input.envelope.key_id !== input.browserKey.publicKey.key_id
    || !CONTEXT_ID_PATTERN.test(input.orgId)
    || !DEVICE_ID_PATTERN.test(input.deviceId)
    || !CONTEXT_ID_PATTERN.test(input.commandId)
    || !CONTEXT_ID_PATTERN.test(input.authId)) {
    throw new Error('telegram_bridge_crypto_invalid');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(await unwrapEnvelope(input.browserKey.privateKey, input.envelope));
  } catch {
    throw new Error('telegram_bridge_crypto_invalid');
  }
  const value = exactRecord(decoded, [
    'schema', 'purpose', 'org_id', 'device_id', 'command_id', 'auth_id',
    'expires_at', 'qr_code_data_url', 'qr_login_url',
  ]);
  const now = input.now ?? new Date();
  if (!value
    || value.schema !== LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA
    || value.purpose !== 'qr'
    || value.org_id !== input.orgId
    || value.device_id !== input.deviceId
    || value.command_id !== input.commandId
    || value.auth_id !== input.authId
    || !relayExpiry(value.expires_at, now, input.browserKey.expiresAt)
    || typeof value.qr_login_url !== 'string'
    || !QR_URL_PATTERN.test(value.qr_login_url)
    || typeof value.qr_code_data_url !== 'string'
    || value.qr_code_data_url.length > 90_000
    || !QR_DATA_URL_PATTERN.test(value.qr_code_data_url)) {
    throw new Error('telegram_bridge_crypto_invalid');
  }
  return {
    authId: input.authId,
    qrCodeDataUrl: value.qr_code_data_url,
    qrLoginUrl: value.qr_login_url,
    expiresAt: value.expires_at,
  };
}

export async function encryptTelegramBridgePassword(input: {
  bridgePublicKeySpki: string;
  keyId: string;
  password: string;
  orgId: string;
  deviceId: string;
  commandId: string;
  authId: string;
  expiresAt: string;
  now?: Date;
}): Promise<LeadRadarTelegramBridgeE2eEnvelope> {
  const now = input.now ?? new Date();
  if (!LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN.test(input.bridgePublicKeySpki)
    || !LEAD_RADAR_TELEGRAM_BRIDGE_KEY_ID_PATTERN.test(input.keyId)
    || !CONTEXT_ID_PATTERN.test(input.orgId)
    || !DEVICE_ID_PATTERN.test(input.deviceId)
    || !CONTEXT_ID_PATTERN.test(input.commandId)
    || !CONTEXT_ID_PATTERN.test(input.authId)
    || !relayExpiry(input.expiresAt, now, input.expiresAt)
    || input.password.length < 1
    || encoder.encode(input.password).byteLength > 256
    || [...input.password].some((character) => character === '\u0000')) {
    throw new Error('telegram_bridge_crypto_invalid');
  }
  const publicKey = await crypto.subtle.importKey(
    'spki',
    base64UrlToBytes(input.bridgePublicKeySpki),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify({
    schema: LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA,
    purpose: 'password',
    org_id: input.orgId,
    device_id: input.deviceId,
    command_id: input.commandId,
    auth_id: input.authId,
    expires_at: input.expiresAt,
    password: input.password,
  }));
  try {
    const aesKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
    const [wrappedKey, ciphertext] = await Promise.all([
      crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawKey),
      crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, plaintext),
    ]);
    return {
      alg: 'RSA-OAEP-256+A256GCM',
      key_id: input.keyId,
      wrapped_key: bytesToBase64Url(new Uint8Array(wrappedKey)),
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    };
  } finally {
    rawKey.fill(0);
    iv.fill(0);
    plaintext.fill(0);
  }
}

export async function encryptTelegramBridgeAuthInput(input: {
  bridgePublicKeySpki: string;
  keyId: string;
  action: 'phone' | 'code';
  value: string;
  orgId: string;
  deviceId: string;
  commandId: string;
  authId: string;
  expiresAt: string;
  now?: Date;
}): Promise<LeadRadarTelegramBridgeE2eEnvelope> {
  const now = input.now ?? new Date();
  const valueValid = input.action === 'phone'
    ? /^\+[1-9]\d{6,14}$/u.test(input.value)
    : /^[0-9A-Za-z_-]{3,16}$/u.test(input.value);
  if (!LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN.test(input.bridgePublicKeySpki)
    || !LEAD_RADAR_TELEGRAM_BRIDGE_KEY_ID_PATTERN.test(input.keyId)
    || !CONTEXT_ID_PATTERN.test(input.orgId)
    || !DEVICE_ID_PATTERN.test(input.deviceId)
    || !CONTEXT_ID_PATTERN.test(input.commandId)
    || !CONTEXT_ID_PATTERN.test(input.authId)
    || !relayExpiry(input.expiresAt, now, input.expiresAt)
    || !valueValid) throw new Error('telegram_bridge_crypto_invalid');
  const publicKey = await crypto.subtle.importKey(
    'spki',
    base64UrlToBytes(input.bridgePublicKeySpki),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify({
    schema: LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA,
    purpose: input.action,
    org_id: input.orgId,
    device_id: input.deviceId,
    command_id: input.commandId,
    auth_id: input.authId,
    expires_at: Math.floor(Date.parse(input.expiresAt) / 1_000),
    value: input.value,
  }));
  try {
    const aesKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
    const [wrappedKey, ciphertext] = await Promise.all([
      crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawKey),
      crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, plaintext),
    ]);
    return {
      alg: 'RSA-OAEP-256+A256GCM',
      key_id: input.keyId,
      wrapped_key: bytesToBase64Url(new Uint8Array(wrappedKey)),
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    };
  } finally {
    rawKey.fill(0);
    iv.fill(0);
    plaintext.fill(0);
  }
}

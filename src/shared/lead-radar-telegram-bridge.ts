export const LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA =
  'gptbot.lead-radar.telegram-bridge.v1' as const;
export const LEAD_RADAR_TELEGRAM_BRIDGE_POLL_SECONDS = 15;
export const LEAD_RADAR_TELEGRAM_BRIDGE_CLOCK_SKEW_SECONDS = 90;
export const LEAD_RADAR_TELEGRAM_BRIDGE_NONCE_TTL_SECONDS = 300;
export const LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_LEASE_SECONDS = 90;
// A browser input envelope is consumed by the local Bridge within a few
// seconds. Keep this substantially shorter than the human login ceremony and
// below the Bridge's 90-second anti-replay ceiling.
export const LEAD_RADAR_TELEGRAM_BRIDGE_AUTH_INPUT_TTL_SECONDS = 60;
// Human login input remains E2E encrypted and one-use, but a person must have
// enough time to open Telegram, read the code and complete optional 2FA.
export const LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS = 10 * 60;

export const LEAD_RADAR_TELEGRAM_BRIDGE_CAPABILITIES = [
  'qr',
  'phone_code',
  'two_factor_password',
  'text',
  'image',
] as const;

export type LeadRadarTelegramBridgeCapability =
  (typeof LEAD_RADAR_TELEGRAM_BRIDGE_CAPABILITIES)[number];

export type LeadRadarTelegramBridgeCommandKind =
  | 'connect'
  | 'connect_phone'
  | 'submit_auth'
  | 'cancel_auth'
  | 'submit_password'
  | 'disconnect'
  | 'probe'
  | 'resolve_contact'
  | 'validate_media'
  | 'send';

export type LeadRadarTelegramBridgeResultStatus =
  | 'progress'
  | 'succeeded'
  | 'failed'
  | 'ambiguous';

export interface LeadRadarTelegramBridgeE2eEnvelope {
  alg: 'RSA-OAEP-256+A256GCM';
  key_id: string;
  wrapped_key: string;
  iv: string;
  ciphertext: string;
}

export interface LeadRadarTelegramBridgeRegisterRequest {
  schema: typeof LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA;
  pairing_id: string;
  pairing_code: string;
  device_secret: string;
  label: string;
  version: string;
  encryption_public_key_spki: string;
}

export interface LeadRadarTelegramBridgeBrowserKey {
  alg: 'RSA-OAEP-256';
  /** Lowercase SHA-256 hex digest of the exact SPKI DER bytes. */
  key_id: string;
  spki: string;
  /** Absolute browser-key deadline; Bridge QR expiry must never exceed it. */
  expires_at: string;
}

export interface LeadRadarTelegramBridgePollRequest {
  schema: typeof LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA;
  version: string;
  capabilities: LeadRadarTelegramBridgeCapability[];
}

export interface LeadRadarTelegramBridgeResultRequest {
  schema: typeof LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA;
  command_id: string;
  sequence: number;
  status: LeadRadarTelegramBridgeResultStatus;
  result_code: string;
  result: Record<string, unknown>;
}

export const LEAD_RADAR_TELEGRAM_BRIDGE_PAIRING_ID_PATTERN = /^lrtgbp_[0-9a-f]{32}$/u;
export const LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_ID_PATTERN = /^lrtgbd_[0-9a-f]{32}$/u;
export const LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN = /^lrtgbc_[0-9a-f]{32}$/u;
export const LEAD_RADAR_TELEGRAM_BRIDGE_SECRET_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
export const LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
export const LEAD_RADAR_TELEGRAM_BRIDGE_NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
export const LEAD_RADAR_TELEGRAM_BRIDGE_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
/** Canonical lowercase SHA-256 digest of the exact RSA SPKI DER bytes. */
export const LEAD_RADAR_TELEGRAM_BRIDGE_KEY_ID_PATTERN = /^[a-f0-9]{64}$/u;
export const LEAD_RADAR_TELEGRAM_BRIDGE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/u;
export const LEAD_RADAR_TELEGRAM_BRIDGE_SAFE_CODE_PATTERN = /^[a-z][a-z0-9_]{2,79}$/u;
export const LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN = /^[A-Za-z0-9_-]{300,1024}$/u;

export function exactTelegramBridgeCapabilities(
  value: unknown,
): value is LeadRadarTelegramBridgeCapability[] {
  return Array.isArray(value)
    && value.length === LEAD_RADAR_TELEGRAM_BRIDGE_CAPABILITIES.length
    && value.every((item, index) => item === LEAD_RADAR_TELEGRAM_BRIDGE_CAPABILITIES[index]);
}

export function isLeadRadarTelegramBridgeE2eEnvelope(
  value: unknown,
): value is LeadRadarTelegramBridgeE2eEnvelope {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  return Object.keys(envelope).sort().join(',') === 'alg,ciphertext,iv,key_id,wrapped_key'
    && envelope.alg === 'RSA-OAEP-256+A256GCM'
    && typeof envelope.key_id === 'string'
    && LEAD_RADAR_TELEGRAM_BRIDGE_KEY_ID_PATTERN.test(envelope.key_id)
    && typeof envelope.wrapped_key === 'string'
    && /^[A-Za-z0-9_-]{300,512}$/u.test(envelope.wrapped_key)
    && typeof envelope.iv === 'string'
    && /^[A-Za-z0-9_-]{16}$/u.test(envelope.iv)
    && typeof envelope.ciphertext === 'string'
    && /^[A-Za-z0-9_-]{22,131072}$/u.test(envelope.ciphertext);
}

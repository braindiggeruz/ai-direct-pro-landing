import type {
  TelegramCampaignProviderResult,
  TelegramCampaignSender,
} from './telegram-campaign';
import type { LeadRadarMediaValidation } from '../../../src/shared/lead-radar-media-validation';
import {
  telegramCampaignMediaObjectKey,
  type TelegramCampaignResolvedMedia,
} from './telegram-campaign-media';
import type {
  LeadRadarTelegramAccountReadiness,
  LeadRadarTelegramAccountReadinessBlocker,
} from '../../../src/shared/lead-radar';
import {
  isLeadRadarTelegramBridgeE2eEnvelope,
  LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_ID_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_PAIRING_ID_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS,
  LEAD_RADAR_TELEGRAM_BRIDGE_SECRET_PATTERN,
  type LeadRadarTelegramBridgeBrowserKey,
  type LeadRadarTelegramBridgeE2eEnvelope,
} from '../../../src/shared/lead-radar-telegram-bridge';

const INTERNAL_ORIGIN = 'https://lead-radar-telegram-account.internal';
const SERVICE_SCHEMA = 'gptbot.lead-radar.telegram-account-service.v1' as const;
const MAX_RESPONSE_BYTES = 400_000;
// These are outer budgets. The private gateway owns stricter inner budgets
// (75s control / 120s send), leaving time for the Service Binding response to
// propagate while keeping every caller bounded.
export const TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS = 80_000;
export const TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS = 125_000;
export const TELEGRAM_ACCOUNT_HEALTH_REQUEST_TIMEOUT_MS = 5_000;
const AUTH_ID_PATTERN = /^[A-Za-z0-9:_-]{16,160}$/u;
const ACCOUNT_REF_PATTERN = /^[A-Za-z0-9:_-]{16,160}$/u;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9:_-]{8,160}$/u;
const ORG_ID_PATTERN = /^[A-Za-z0-9:_-]{1,80}$/u;
const SAFE_REASON_PATTERN = /^[a-z][a-z0-9_]{2,79}$/u;
const SAFE_GATEWAY_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,80}$/u;
const ROUTING_KEY_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;
const CAMPAIGN_MEDIA_ID_PATTERN = /^lrtgcm_[a-f0-9]{32}$/u;
const CAMPAIGN_MEDIA_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const CAMPAIGN_MEDIA_MAX_BYTES = 5_000_000;
const INTERNAL_SERVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const BRIDGE_KEY_ID_PATTERN = /^[a-f0-9]{64}$/u;

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

interface TelegramServiceTransportMedia {
  source_object_key: string;
  media_id: string;
  media_digest: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  size_bytes: number;
}

export type TelegramAccountServiceErrorCode =
  | 'telegram_campaign_gateway_unavailable'
  | 'telegram_campaign_bridge_offline'
  | 'telegram_campaign_media_validation_failed'
  | 'telegram_campaign_gateway_not_configured'
  | 'telegram_campaign_gateway_invalid_response'
  | 'telegram_campaign_gateway_not_found'
  | 'telegram_campaign_gateway_conflict'
  | 'telegram_campaign_auth_rate_limited';

export class TelegramAccountServiceError extends Error {
  constructor(readonly code: TelegramAccountServiceErrorCode) {
    super(code);
    this.name = 'TelegramAccountServiceError';
  }
}

export interface TelegramAccountConnectChallenge {
  status: 'connecting';
  authState:
    | 'starting'
    | 'awaiting_phone'
    | 'awaiting_qr'
    | 'awaiting_code'
    | 'awaiting_password';
  authId: string;
  bridgeCommandId: string;
  deviceId: string;
  qrEnvelope: LeadRadarTelegramBridgeE2eEnvelope | null;
  inputCommandId: string | null;
  inputAction: 'phone' | 'code' | null;
  passwordCommandId: string | null;
  bridgeEncryptionKey: Omit<LeadRadarTelegramBridgeBrowserKey, 'expires_at'> | null;
  expiresAt: string;
  reasonCode: string | null;
  pendingAction?: 'phone' | 'code' | 'password' | null;
}

export type TelegramAccountConnectionPoll =
  | TelegramAccountConnectChallenge
  | {
    status: 'connected';
    authId: string;
    accountRef: string;
    maskedLabel: string;
    connectedAt: string;
  }
  | {
    status: 'restricted' | 'reauth_required' | 'revoked' | 'error';
    authId: string;
    reasonCode: string;
  };

interface ServiceEnvelope {
  schema: typeof SERVICE_SCHEMA;
  status: string;
  [key: string]: unknown;
}

function exactRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length
    && actual.every((key, index) => key === sorted[index]);
}

function validIso(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 20
    && value.length <= 64
    && Number.isFinite(Date.parse(value));
}

function validChallengeExpiry(value: unknown): value is string {
  if (!validIso(value)) return false;
  const expiresAt = Date.parse(value);
  const now = Date.now();
  return expiresAt > now - 5_000 && expiresAt <= now + 15 * 60_000;
}

function validRelayExpiry(value: unknown): value is string {
  if (!validIso(value)) return false;
  const expiresAt = Date.parse(value);
  const now = Date.now();
  return expiresAt > now - 5_000
    && expiresAt <= now + LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS * 1_000 + 5_000;
}

function validMaskedLabel(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim() === value
    && value.length >= 3
    && value.length <= 40
    && !hasControlCharacters(value)
    && (/^@(?:[A-Za-z0-9_]•{3,5}[A-Za-z0-9_]|[A-Za-z0-9_]{2}•{3,5}[A-Za-z0-9_]{2})$/u.test(value)
      || /^Telegram (?:••••\d{4}|[\p{L}](?:·[\p{L}])?|account)$/u.test(value));
}

function assertRequestScope(orgId: string, operationId?: string): void {
  if (!ORG_ID_PATTERN.test(orgId)
    || (operationId !== undefined && !OPERATION_ID_PATTERN.test(operationId))) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
}

function resolvedMediaEnvelope(
  media: TelegramCampaignResolvedMedia,
  orgId: string,
): TelegramServiceTransportMedia | null {
  const expectedObjectKey = telegramCampaignMediaObjectKey(orgId, media.mediaId);
  if (!expectedObjectKey
    || media.objectKey !== expectedObjectKey
    || !CAMPAIGN_MEDIA_ID_PATTERN.test(media.mediaId)
    || !CAMPAIGN_MEDIA_DIGEST_PATTERN.test(media.mediaDigest)
    || (media.mimeType !== 'image/jpeg'
      && media.mimeType !== 'image/png'
      && media.mimeType !== 'image/webp')
    || media.sizeBytes < 1
    || media.sizeBytes > CAMPAIGN_MEDIA_MAX_BYTES) return null;
  return {
    source_object_key: media.objectKey,
    media_id: media.mediaId,
    media_digest: media.mediaDigest,
    mime_type: media.mimeType,
    size_bytes: media.sizeBytes,
  };
}

function configured(service: Fetcher | undefined): service is Fetcher {
  return Boolean(service && typeof service.fetch === 'function');
}

export function hasPrivateTelegramAccountService(service: Fetcher | undefined): service is Fetcher {
  return configured(service);
}

interface ResponseDeadline {
  expiresAt: number;
  controller: AbortController;
  callerSignal?: AbortSignal;
}

const responseDeadlines = new WeakMap<Response, ResponseDeadline>();

class TelegramAccountServiceTimeoutError extends Error {
  constructor() {
    super('telegram_account_service_timeout');
    this.name = 'TelegramAccountServiceTimeoutError';
  }
}

async function fetchWithDeadline(
  service: Fetcher,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let callerAbort: (() => void) | undefined;
  const expiresAt = Date.now() + timeoutMs;
  const aborted = new Promise<never>((_resolve, reject) => {
    const abort = () => {
      controller.abort();
      reject(new TelegramAccountServiceTimeoutError());
    };
    timeoutId = setTimeout(abort, timeoutMs);
    if (callerSignal) {
      callerAbort = abort;
      if (callerSignal.aborted) abort();
      else callerSignal.addEventListener('abort', abort, { once: true });
    }
  });
  try {
    const response = await Promise.race([
      service.fetch(url, { ...init, signal: controller.signal }),
      aborted,
    ]);
    responseDeadlines.set(response, {
      expiresAt,
      controller,
      ...(callerSignal ? { callerSignal } : {}),
    });
    return response;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (callerSignal && callerAbort) {
      callerSignal.removeEventListener('abort', callerAbort);
    }
  }
}

async function responseTextBeforeDeadline(response: Response): Promise<string> {
  const deadline = responseDeadlines.get(response);
  if (!deadline) return response.text();
  const remainingMs = deadline.expiresAt - Date.now();
  if (remainingMs <= 0) {
    deadline.controller.abort();
    responseDeadlines.delete(response);
    throw new TelegramAccountServiceTimeoutError();
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let callerAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      response.text(),
      new Promise<never>((_resolve, reject) => {
        const abort = () => {
          deadline.controller.abort();
          reject(new TelegramAccountServiceTimeoutError());
        };
        timeoutId = setTimeout(abort, remainingMs);
        if (deadline.callerSignal) {
          callerAbort = abort;
          if (deadline.callerSignal.aborted) abort();
          else deadline.callerSignal.addEventListener('abort', abort, { once: true });
        }
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (deadline.callerSignal && callerAbort) {
      deadline.callerSignal.removeEventListener('abort', callerAbort);
    }
    responseDeadlines.delete(response);
  }
}

async function serviceFetch(
  service: Fetcher | undefined,
  pathname: string,
  init: RequestInit,
  internalServiceToken?: string,
  timeoutMs = TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  if (!configured(service)
    || !INTERNAL_SERVICE_TOKEN_PATTERN.test(internalServiceToken ?? '')) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_unavailable');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${internalServiceToken}`);
  try {
    return await fetchWithDeadline(
      service,
      `${INTERNAL_ORIGIN}${pathname}`,
      { ...init, headers },
      timeoutMs,
    );
  } catch {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_unavailable');
  }
}

function statusError(response: Response): never {
  if (response.status === 404) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_not_found');
  }
  if (response.status === 409) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_conflict');
  }
  if (response.status === 429 || response.status >= 500) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_unavailable');
  }
  throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
}

async function responseEnvelope(response: Response): Promise<ServiceEnvelope> {
  if (!response.ok) {
    // Preserve only closed reason codes, never an untrusted raw error body.
    let reason: unknown;
    try {
      const raw = await responseTextBeforeDeadline(response);
      if (raw.length <= 4096) {
        const error = JSON.parse(raw) as Record<string, unknown>;
        if (error.schema === SERVICE_SCHEMA && error.status === 'error') reason = error.reason_code;
      }
    } catch { /* Unknown failures retain their HTTP classification. */ }
    if (reason === 'bridge_offline') throw new TelegramAccountServiceError('telegram_campaign_bridge_offline');
    if (reason === 'bridge_media_validation_failed') throw new TelegramAccountServiceError('telegram_campaign_media_validation_failed');
    if (reason === 'gateway_not_configured') throw new TelegramAccountServiceError('telegram_campaign_gateway_not_configured');
    statusError(response);
  }
  const declared = Number(response.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  let raw: string;
  try {
    raw = await responseTextBeforeDeadline(response);
  } catch {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_unavailable');
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  if (!exactRecord(parsed)
    || parsed.schema !== SERVICE_SCHEMA
    || typeof parsed.status !== 'string') {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  return parsed as ServiceEnvelope;
}

const GATEWAY_CONFIGURATION_BLOCKERS = new Set<LeadRadarTelegramAccountReadinessBlocker>([
  'gateway_internal_token_missing',
  'gateway_account_keys_missing',
  'gateway_storage_missing',
  'gateway_runtime_config_invalid',
]);

export interface TelegramAccountGatewayConfigurationProbe {
  readiness: LeadRadarTelegramAccountReadiness;
  /** Non-secret, domain-separated SHA-256 sentinel; never returned to a browser. */
  routingKeyFingerprint: string | null;
}

function blockedGatewayProbe(
  blocker: LeadRadarTelegramAccountReadinessBlocker,
): TelegramAccountGatewayConfigurationProbe {
  return {
    readiness: { status: 'blocked', blockers: [blocker] },
    routingKeyFingerprint: null,
  };
}

/**
 * Probe only the private gateway's non-secret setup contract. The response is
 * deliberately reduced to closed-list blocker classes before it reaches the
 * Pages owner API; credential values, resource identifiers and upstream error
 * bodies never cross this boundary.
 */
export async function probeTelegramAccountGatewayConfiguration(
  service: Fetcher | undefined,
  internalServiceToken?: string,
): Promise<TelegramAccountGatewayConfigurationProbe> {
  if (!configured(service)
    || !INTERNAL_SERVICE_TOKEN_PATTERN.test(internalServiceToken ?? '')) {
    return blockedGatewayProbe('gateway_binding_missing');
  }
  let response: Response;
  try {
    response = await fetchWithDeadline(
      service,
      `${INTERNAL_ORIGIN}/v1/health`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${internalServiceToken}`,
        },
      },
      TELEGRAM_ACCOUNT_HEALTH_REQUEST_TIMEOUT_MS,
    );
  } catch {
    return blockedGatewayProbe('gateway_unavailable');
  }
  if (response.status !== 200 && response.status !== 503) {
    return blockedGatewayProbe('gateway_unavailable');
  }
  const declared = Number(response.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    return blockedGatewayProbe('gateway_unavailable');
  }
  let raw: string;
  try {
    raw = await responseTextBeforeDeadline(response);
  } catch {
    return blockedGatewayProbe('gateway_unavailable');
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    return blockedGatewayProbe('gateway_unavailable');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return blockedGatewayProbe('gateway_unavailable');
  }
  if (!exactRecord(parsed)
    || !exactKeys(parsed, [
      'schema', 'status', 'contract_version', 'gateway_version', 'auth_modes',
      'provider', 'tdlib_source_commit', 'session_storage', 'public_routes',
      'configured', 'blockers', 'routing_key_fingerprint', 'bridge_public_origin',
    ])
    || parsed.schema !== SERVICE_SCHEMA
    || (parsed.status !== 'configured' && parsed.status !== 'degraded')
    || parsed.contract_version !== 'v1'
    || typeof parsed.gateway_version !== 'string'
    || !SAFE_GATEWAY_VERSION_PATTERN.test(parsed.gateway_version)
    || !Array.isArray(parsed.auth_modes)
    || parsed.auth_modes.length !== 2
    || parsed.auth_modes[0] !== 'qr'
    || parsed.auth_modes[1] !== 'phone_code_password'
    || parsed.provider !== 'local_bridge_telethon'
    || parsed.tdlib_source_commit !== 'not_applicable'
    || parsed.session_storage !== 'local_windows_dpapi'
    || parsed.public_routes !== true
    || typeof parsed.bridge_public_origin !== 'string'
    || (() => {
      try {
        const origin = new URL(parsed.bridge_public_origin as string);
        return origin.protocol !== 'https:' || origin.origin !== parsed.bridge_public_origin;
      } catch {
        return true;
      }
    })()
    || typeof parsed.configured !== 'boolean'
    || (parsed.routing_key_fingerprint !== null
      && (typeof parsed.routing_key_fingerprint !== 'string'
        || !ROUTING_KEY_FINGERPRINT_PATTERN.test(parsed.routing_key_fingerprint)))
    || !Array.isArray(parsed.blockers)
    || parsed.blockers.length > GATEWAY_CONFIGURATION_BLOCKERS.size
    || parsed.blockers.some((blocker) => (
      typeof blocker !== 'string'
      || !GATEWAY_CONFIGURATION_BLOCKERS.has(blocker as LeadRadarTelegramAccountReadinessBlocker)
    ))
    || new Set(parsed.blockers).size !== parsed.blockers.length
    || ((parsed.gateway_version === 'unconfigured')
      && !parsed.blockers.includes('gateway_runtime_config_invalid'))
    || (response.status === 200) !== parsed.configured
    || (parsed.configured && (parsed.status !== 'configured' || parsed.blockers.length !== 0))
    || (parsed.configured && typeof parsed.routing_key_fingerprint !== 'string')
    || (!parsed.blockers.includes('gateway_account_keys_missing')
      && parsed.routing_key_fingerprint === null)
    || (!parsed.configured && (parsed.status !== 'degraded' || parsed.blockers.length === 0))) {
    return blockedGatewayProbe('gateway_unavailable');
  }
  const readiness: LeadRadarTelegramAccountReadiness = parsed.configured
    // Configuration does not prove that this tenant's Durable Object,
    // Container, TDLib process or encrypted session can boot. The first
    // account operation is the bounded operational probe.
    ? { status: 'probe_required', blockers: [] }
    : {
      status: 'blocked',
      blockers: parsed.blockers as LeadRadarTelegramAccountReadinessBlocker[],
      };
  return {
    readiness,
    routingKeyFingerprint: typeof parsed.routing_key_fingerprint === 'string'
      ? parsed.routing_key_fingerprint
      : null,
  };
}

export async function getTelegramAccountGatewayReadiness(
  service: Fetcher | undefined,
  internalServiceToken?: string,
): Promise<LeadRadarTelegramAccountReadiness> {
  return (await probeTelegramAccountGatewayConfiguration(service, internalServiceToken)).readiness;
}

function detailedChallenge(envelope: ServiceEnvelope): TelegramAccountConnectChallenge {
  const authStates: readonly TelegramAccountConnectChallenge['authState'][] = [
    'starting',
    'awaiting_phone',
    'awaiting_qr',
    'awaiting_code',
    'awaiting_password',
  ];
  const inputState = envelope.status === 'awaiting_phone' || envelope.status === 'awaiting_code';
  const passwordState = envelope.status === 'awaiting_password';
  const secretState = inputState || passwordState;
  const hasInputFields = Object.hasOwn(envelope, 'input_command_id')
    || Object.hasOwn(envelope, 'input_action');
  const expected = [
    'schema', 'status', 'auth_id', 'bridge_command_id', 'device_id', 'expires_at',
    'qr_envelope',
    ...(hasInputFields ? ['input_command_id', 'input_action'] : []),
    'password_command_id', 'reason_code',
    ...(Object.hasOwn(envelope, 'pending_action') ? ['pending_action'] : []),
    ...(secretState ? ['bridge_encryption_key'] : []),
  ];
  if (!exactKeys(envelope, expected)
    || (envelope.pending_action != null
      && envelope.pending_action !== (passwordState ? 'password'
        : inputState ? envelope.input_action : null))
    || !authStates.includes(envelope.status as TelegramAccountConnectChallenge['authState'])
    || typeof envelope.auth_id !== 'string'
    || !AUTH_ID_PATTERN.test(envelope.auth_id)
    || typeof envelope.bridge_command_id !== 'string'
    || !LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN.test(envelope.bridge_command_id)
    || typeof envelope.device_id !== 'string'
    || !LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_ID_PATTERN.test(envelope.device_id)
    || (envelope.status === 'awaiting_qr') !== isLeadRadarTelegramBridgeE2eEnvelope(envelope.qr_envelope)
    || (inputState && !hasInputFields)
    || (hasInputFields && inputState !== (
      typeof envelope.input_command_id === 'string'
      && LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN.test(envelope.input_command_id)
      && envelope.input_action === (envelope.status === 'awaiting_phone' ? 'phone' : 'code')
    ))
    || (hasInputFields && !inputState
      && (envelope.input_command_id !== null || envelope.input_action !== null))
    || (envelope.status === 'awaiting_password') !== (
      typeof envelope.password_command_id === 'string'
      && LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN.test(envelope.password_command_id)
    )
    || (!passwordState && envelope.password_command_id !== null)
    || (secretState && (!exactRecord(envelope.bridge_encryption_key)
      || !exactKeys(envelope.bridge_encryption_key, ['alg', 'key_id', 'spki'])
      || envelope.bridge_encryption_key.alg !== 'RSA-OAEP-256'
      || typeof envelope.bridge_encryption_key.key_id !== 'string'
      || !BRIDGE_KEY_ID_PATTERN.test(envelope.bridge_encryption_key.key_id)
      || typeof envelope.bridge_encryption_key.spki !== 'string'
      || !LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN.test(envelope.bridge_encryption_key.spki)))
    || (envelope.reason_code !== null
      && (typeof envelope.reason_code !== 'string'
        || !SAFE_REASON_PATTERN.test(envelope.reason_code)))
    || ((envelope.status === 'awaiting_qr' || secretState)
      ? !validRelayExpiry(envelope.expires_at)
      : !validChallengeExpiry(envelope.expires_at))) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  return {
    status: 'connecting',
    authState: envelope.status as TelegramAccountConnectChallenge['authState'],
    authId: envelope.auth_id,
    bridgeCommandId: envelope.bridge_command_id as string,
    deviceId: envelope.device_id as string,
    qrEnvelope: isLeadRadarTelegramBridgeE2eEnvelope(envelope.qr_envelope)
      ? envelope.qr_envelope : null,
    inputCommandId: typeof envelope.input_command_id === 'string'
      ? envelope.input_command_id : null,
    inputAction: envelope.input_action === 'phone' || envelope.input_action === 'code'
      ? envelope.input_action : null,
    passwordCommandId: typeof envelope.password_command_id === 'string'
      ? envelope.password_command_id : null,
    bridgeEncryptionKey: secretState
      ? {
        alg: 'RSA-OAEP-256',
        key_id: (envelope.bridge_encryption_key as Record<string, unknown>).key_id as string,
        spki: (envelope.bridge_encryption_key as Record<string, unknown>).spki as string,
      }
      : null,
    expiresAt: envelope.expires_at as string,
    reasonCode: envelope.reason_code as string | null,
    pendingAction: (envelope.pending_action ?? null) as TelegramAccountConnectChallenge['pendingAction'],
  };
}

const challenge = detailedChallenge;

export interface TelegramBridgePairing {
  pairingId: string;
  expiresAt: string;
}

export interface TelegramBridgeStatus {
  status: 'unpaired' | 'online' | 'offline' | 'pending_revocation' | 'revoked';
  deviceId: string | null;
  label: string | null;
  version: string | null;
  lastSeenAt: string | null;
  encryptionKey: Omit<LeadRadarTelegramBridgeBrowserKey, 'expires_at'> | null;
}

export async function resolveTelegramContact(input: {
  service?: Fetcher; internalServiceToken?: string; orgId: string; gatewayAccountRef: string;
  operationId: string; target: import('../../../src/shared/lead-radar-contact-resolution').TelegramContactTarget;
}): Promise<import('../../../src/shared/lead-radar-contact-resolution').TelegramContactResolution> {
  const { validTelegramContactTarget, validTelegramContactResolution } = await import('../../../src/shared/lead-radar-contact-resolution');
  assertRequestScope(input.orgId, input.operationId);
  if (!ACCOUNT_REF_PATTERN.test(input.gatewayAccountRef) || !validTelegramContactTarget(input.target)) throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  const response = await serviceFetch(input.service, '/v1/contacts/resolve', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.operationId },
    body: JSON.stringify({ schema: SERVICE_SCHEMA, org_id: input.orgId, account_ref: input.gatewayAccountRef, operation_id: input.operationId, target: input.target }),
  }, input.internalServiceToken);
  const envelope = await responseEnvelope(response);
  const result = { status: envelope.status, username: envelope.username, reason: envelope.reason, retryAfterSeconds: envelope.retryAfterSeconds,
    ...(envelope.peerRef !== undefined ? {peerRef:envelope.peerRef} : {}) };
  if (!(exactKeys(envelope, ['schema','status','username','reason','retryAfterSeconds']) || exactKeys(envelope, ['schema','status','username','reason','retryAfterSeconds','peerRef']))
    || !validTelegramContactResolution(result)) throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  return result;
}

export async function createTelegramBridgePairing(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  operationId: string;
  label: string;
  enrollmentCode: string;
}): Promise<TelegramBridgePairing> {
  assertRequestScope(input.orgId, input.operationId);
  if (input.label.trim() !== input.label
    || input.label.length < 1
    || input.label.length > 40
    || hasControlCharacters(input.label)
    || !LEAD_RADAR_TELEGRAM_BRIDGE_SECRET_PATTERN.test(input.enrollmentCode)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  const response = await serviceFetch(input.service, '/v1/bridge/pairings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': input.operationId,
    },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      operation_id: input.operationId,
      label: input.label,
      enrollment_code: input.enrollmentCode,
    }),
  }, input.internalServiceToken);
  const envelope = await responseEnvelope(response);
  if (!exactKeys(envelope, ['schema', 'status', 'pairing_id', 'expires_at'])
    || envelope.status !== 'pending'
    || typeof envelope.pairing_id !== 'string'
    || !LEAD_RADAR_TELEGRAM_BRIDGE_PAIRING_ID_PATTERN.test(envelope.pairing_id)
    || !validChallengeExpiry(envelope.expires_at)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  return { pairingId: envelope.pairing_id, expiresAt: envelope.expires_at };
}

export async function getTelegramBridgeStatus(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
}): Promise<TelegramBridgeStatus> {
  assertRequestScope(input.orgId);
  const response = await serviceFetch(input.service, '/v1/bridge/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ schema: SERVICE_SCHEMA, org_id: input.orgId }),
  }, input.internalServiceToken);
  const envelope = await responseEnvelope(response);
  const statuses: readonly TelegramBridgeStatus['status'][] = [
    'unpaired', 'online', 'offline', 'pending_revocation', 'revoked',
  ];
  if (!exactKeys(envelope, [
    'schema', 'status', 'device_id', 'label', 'version', 'last_seen_at',
    'encryption_public_key_spki', 'encryption_key_id',
  ])
    || !statuses.includes(envelope.status as TelegramBridgeStatus['status'])
    || (envelope.device_id !== null && (typeof envelope.device_id !== 'string'
      || !LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_ID_PATTERN.test(envelope.device_id)))
    || (envelope.label !== null && (typeof envelope.label !== 'string'
      || envelope.label.length < 1 || envelope.label.length > 40
      || hasControlCharacters(envelope.label)))
    || (envelope.version !== null && (typeof envelope.version !== 'string'
      || !SAFE_GATEWAY_VERSION_PATTERN.test(envelope.version)))
    || (envelope.last_seen_at !== null && !validIso(envelope.last_seen_at))
    || ((envelope.encryption_public_key_spki === null) !== (envelope.encryption_key_id === null))
    || (envelope.encryption_public_key_spki !== null
      && (typeof envelope.encryption_public_key_spki !== 'string'
        || !LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN.test(envelope.encryption_public_key_spki)
        || typeof envelope.encryption_key_id !== 'string'
        || !BRIDGE_KEY_ID_PATTERN.test(envelope.encryption_key_id)))) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  return {
    status: envelope.status as TelegramBridgeStatus['status'],
    deviceId: envelope.device_id as string | null,
    label: envelope.label as string | null,
    version: envelope.version as string | null,
    lastSeenAt: envelope.last_seen_at as string | null,
    encryptionKey: typeof envelope.encryption_public_key_spki === 'string'
      ? {
        alg: 'RSA-OAEP-256',
        key_id: envelope.encryption_key_id as string,
        spki: envelope.encryption_public_key_spki,
      }
      : null,
  };
}

export async function revokeTelegramBridge(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  operationId: string;
  deviceId: string;
}): Promise<void> {
  assertRequestScope(input.orgId, input.operationId);
  if (!LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_ID_PATTERN.test(input.deviceId)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  const response = await serviceFetch(input.service, '/v1/bridge/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': input.operationId,
    },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      operation_id: input.operationId,
      device_id: input.deviceId,
    }),
  }, input.internalServiceToken);
  const envelope = await responseEnvelope(response);
  if (!exactKeys(envelope, ['schema', 'status']) || envelope.status !== 'revoked') {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
}

export async function beginTelegramAccountConnection(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  operationId: string;
  browserKey: {
    alg: 'RSA-OAEP-256';
    keyId: string;
    spki: string;
    expiresAt: string;
  };
}): Promise<TelegramAccountConnectChallenge> {
  assertRequestScope(input.orgId, input.operationId);
  if (!validRelayExpiry(input.browserKey.expiresAt)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  const response = await serviceFetch(input.service, '/v1/accounts/connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': input.operationId,
    },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      operation_id: input.operationId,
      browser_key: {
        alg: input.browserKey.alg,
        key_id: input.browserKey.keyId,
        spki: input.browserKey.spki,
        expires_at: input.browserKey.expiresAt,
      },
    }),
  }, input.internalServiceToken);
  return challenge(await responseEnvelope(response));
}

export async function beginTelegramAccountPhoneConnection(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  operationId: string;
}): Promise<TelegramAccountConnectChallenge> {
  assertRequestScope(input.orgId, input.operationId);
  const response = await serviceFetch(input.service, '/v1/accounts/connect/phone/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': input.operationId,
    },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      operation_id: input.operationId,
    }),
  }, input.internalServiceToken);
  return detailedChallenge(await responseEnvelope(response));
}

export async function getActiveTelegramAccountConnection(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
}): Promise<TelegramAccountConnectionPoll> {
  assertRequestScope(input.orgId);
  const response = await serviceFetch(
    input.service,
    `/v1/accounts/connect/active?org_id=${encodeURIComponent(input.orgId)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    input.internalServiceToken,
  );
  return connectionPoll(await responseEnvelope(response));
}

/**
 * Cancels only the still-active authentication challenge named by `authId`.
 * A missing challenge is already terminal; a changed or connected challenge
 * is a conflict and must never fall back to an account-wide disconnect.
 */
export async function cancelTelegramAccountConnection(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  authId: string;
}): Promise<void> {
  assertRequestScope(input.orgId);
  if (!AUTH_ID_PATTERN.test(input.authId)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_not_found');
  }
  const response = await serviceFetch(input.service, '/v1/accounts/connect/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      auth_id: input.authId,
    }),
  }, input.internalServiceToken);
  // Cancellation is idempotent only for this exact short-lived auth id.
  if (response.status === 204 || response.status === 404) return;
  statusError(response);
}

/** Marks the exact private auth challenge as owned by a committed D1 row. */
export async function adoptTelegramAccountConnection(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  authId: string;
}): Promise<void> {
  assertRequestScope(input.orgId);
  if (!AUTH_ID_PATTERN.test(input.authId)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_not_found');
  }
  const response = await serviceFetch(input.service, '/v1/accounts/connect/adopt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      auth_id: input.authId,
    }),
  }, input.internalServiceToken);
  if (response.status === 204) return;
  statusError(response);
}

/**
 * Releases the private provisional-login alarm only after Pages has durably
 * committed the connected account reference. Until this handshake succeeds,
 * the tenant DO remains responsible for revoking the session at auth expiry.
 */
export async function finalizeTelegramAccountConnection(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  authId: string;
}): Promise<boolean> {
  assertRequestScope(input.orgId);
  if (!AUTH_ID_PATTERN.test(input.authId)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_not_found');
  }
  const response = await serviceFetch(input.service, '/v1/accounts/connect/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      auth_id: input.authId,
    }),
  }, input.internalServiceToken);
  if (response.status === 204) return true;
  // The Bridge probe is queued, not yet acknowledged. Never promote D1 to
  // connected until a later poll observes the provider-confirmed 204.
  if (response.status === 202) return false;
  statusError(response);
}

export async function pollTelegramAccountConnection(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  authId: string;
}): Promise<TelegramAccountConnectionPoll> {
  assertRequestScope(input.orgId);
  if (!AUTH_ID_PATTERN.test(input.authId)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_not_found');
  }
  const response = await serviceFetch(input.service, '/v1/accounts/connect/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      auth_id: input.authId,
    }),
  }, input.internalServiceToken);
  return connectionPoll(await responseEnvelope(response), input.authId);
}

function connectionPoll(
  envelope: ServiceEnvelope,
  expectedAuthId?: string,
): TelegramAccountConnectionPoll {
  if (envelope.status === 'connecting') {
    const parsed = challenge(envelope);
    if (expectedAuthId !== undefined && parsed.authId !== expectedAuthId) {
      throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
    }
    return parsed;
  }
  if (envelope.status === 'starting'
    || envelope.status === 'awaiting_phone'
    || envelope.status === 'awaiting_qr'
    || envelope.status === 'awaiting_code'
    || envelope.status === 'awaiting_password') {
    const parsed = detailedChallenge(envelope);
    if (expectedAuthId !== undefined && parsed.authId !== expectedAuthId) {
      throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
    }
    return parsed;
  }
  if (envelope.status === 'connected') {
    if (!exactKeys(envelope, [
      'schema', 'status', 'auth_id', 'account_ref', 'masked_label', 'connected_at',
    ])
      || (expectedAuthId !== undefined && envelope.auth_id !== expectedAuthId)
      || typeof envelope.auth_id !== 'string'
      || !AUTH_ID_PATTERN.test(envelope.auth_id)
      || typeof envelope.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(envelope.account_ref)
      || !validMaskedLabel(envelope.masked_label)
      || !validIso(envelope.connected_at)) {
      throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
    }
    return {
      status: 'connected',
      authId: envelope.auth_id,
      accountRef: envelope.account_ref,
      maskedLabel: envelope.masked_label,
      connectedAt: envelope.connected_at,
    };
  }
  if (envelope.status === 'restricted'
    || envelope.status === 'reauth_required'
    || envelope.status === 'revoked'
    || envelope.status === 'error') {
    if (!exactKeys(envelope, ['schema', 'status', 'auth_id', 'reason_code'])
      || (expectedAuthId !== undefined && envelope.auth_id !== expectedAuthId)
      || typeof envelope.auth_id !== 'string'
      || !AUTH_ID_PATTERN.test(envelope.auth_id)
      || typeof envelope.reason_code !== 'string'
      || !SAFE_REASON_PATTERN.test(envelope.reason_code)) {
      throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
    }
    return {
      status: envelope.status,
      authId: envelope.auth_id,
      reasonCode: envelope.reason_code,
    };
  }
  throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
}

export function validTelegramAccountPassword(value: string): boolean {
  return [...value].length >= 1
    && [...value].length <= 256
    && !value.includes('\u0000');
}

export async function submitTelegramAccountAuthInput(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  authId: string;
  inputCommandId: string;
  inputAction: 'phone' | 'code';
  inputEnvelope: LeadRadarTelegramBridgeE2eEnvelope;
}): Promise<TelegramAccountConnectionPoll> {
  assertRequestScope(input.orgId);
  if (!AUTH_ID_PATTERN.test(input.authId)
    || !LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN.test(input.inputCommandId)
    || !isLeadRadarTelegramBridgeE2eEnvelope(input.inputEnvelope)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  const response = await serviceFetch(input.service, '/v1/accounts/connect/input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      auth_id: input.authId,
      input_command_id: input.inputCommandId,
      input_action: input.inputAction,
      input_envelope: input.inputEnvelope,
    }),
  }, input.internalServiceToken);
  if (response.status === 429) {
    throw new TelegramAccountServiceError('telegram_campaign_auth_rate_limited');
  }
  const envelope = await responseEnvelope(response);
  if (['starting', 'awaiting_phone', 'awaiting_qr', 'awaiting_code', 'awaiting_password']
    .includes(envelope.status)) return detailedChallenge(envelope);
  if (['connected', 'restricted', 'reauth_required', 'revoked', 'error'].includes(envelope.status)) {
    return pollTelegramAccountConnection({
      service: input.service,
      internalServiceToken: input.internalServiceToken,
      orgId: input.orgId,
      authId: input.authId,
    });
  }
  throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
}

/**
 * Forwards only a browser-to-Bridge hybrid ciphertext. Plaintext 2FA exists in
 * browser memory and the DPAPI-protected local process only; Pages, Worker,
 * Durable Object, logs and D1 never receive it.
 */
export async function submitTelegramAccountPassword(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  authId: string;
  passwordCommandId: string;
  passwordEnvelope: LeadRadarTelegramBridgeE2eEnvelope;
}): Promise<TelegramAccountConnectionPoll> {
  assertRequestScope(input.orgId);
  if (!AUTH_ID_PATTERN.test(input.authId)
    || !LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN.test(input.passwordCommandId)
    || !isLeadRadarTelegramBridgeE2eEnvelope(input.passwordEnvelope)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  const response = await serviceFetch(input.service, '/v1/accounts/connect/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      auth_id: input.authId,
      password_command_id: input.passwordCommandId,
      password_envelope: input.passwordEnvelope,
    }),
  }, input.internalServiceToken);
  if (response.status === 429) {
    throw new TelegramAccountServiceError('telegram_campaign_auth_rate_limited');
  }
  const envelope = await responseEnvelope(response);
  if (envelope.status === 'starting'
    || envelope.status === 'awaiting_phone'
    || envelope.status === 'awaiting_qr'
    || envelope.status === 'awaiting_code'
    || envelope.status === 'awaiting_password') {
    return detailedChallenge(envelope);
  }
  // A successful password check first reports TDLib's connected auth state.
  // A separate bounded state read performs identity verification and snapshot
  // persistence in the private DO before any account reference reaches Pages.
  if (envelope.status === 'connected'
    || envelope.status === 'restricted'
    || envelope.status === 'reauth_required'
    || envelope.status === 'revoked'
    || envelope.status === 'error') {
    return pollTelegramAccountConnection({
      service: input.service,
      internalServiceToken: input.internalServiceToken,
      orgId: input.orgId,
      authId: input.authId,
    });
  }
  throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
}

/**
 * Performs the authoritative Pillow decode/sanitize check inside the private
 * container before a campaign can be approved. This path has no Telegram
 * account/session/provider side effect; only the closed valid/invalid result
 * crosses back to Pages.
 */
export async function validateTelegramCampaignMedia(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  operationId: string;
  media: TelegramCampaignResolvedMedia;
}): Promise<'valid' | 'invalid'> {
  assertRequestScope(input.orgId, input.operationId);
  const media = resolvedMediaEnvelope(input.media, input.orgId);
  if (!media) return 'invalid';
  const response = await serviceFetch(input.service, '/v1/media/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': input.operationId,
    },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      operation_id: input.operationId,
      media,
    }),
  }, input.internalServiceToken);
  const envelope = await responseEnvelope(response);
  if (exactKeys(envelope, ['schema', 'status']) && envelope.status === 'valid') {
    return 'valid';
  }
  if (exactKeys(envelope, ['schema', 'status', 'code'])
    && envelope.status === 'rejected'
    && envelope.code === 'media_invalid') {
    return 'invalid';
  }
  throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
}

/** Starts or reads the same bounded media operation; never waits for the desktop. */
export async function checkTelegramCampaignMedia(input: Parameters<typeof validateTelegramCampaignMedia>[0]): Promise<LeadRadarMediaValidation> {
  assertRequestScope(input.orgId, input.operationId);
  const media = resolvedMediaEnvelope(input.media, input.orgId);
  if (!media) return { status: 'invalid' };
  const response = await serviceFetch(input.service, '/v1/media/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Idempotency-Key': input.operationId },
    body: JSON.stringify({ schema: SERVICE_SCHEMA, org_id: input.orgId, operation_id: input.operationId, media }),
  }, input.internalServiceToken, 8_000);
  const envelope = await responseEnvelope(response);
  if (exactKeys(envelope, ['schema', 'status']) && envelope.status === 'valid') return { status: 'valid' };
  if (exactKeys(envelope, ['schema', 'status', 'code']) && envelope.status === 'rejected' && envelope.code === 'media_invalid') return { status: 'invalid' };
  if (exactKeys(envelope, ['schema', 'status', 'code', 'retry_after_seconds']) && envelope.status === 'pending'
    && (envelope.code === 'bridge_offline' || envelope.code === 'media_validation_pending')
    && typeof envelope.retry_after_seconds === 'number' && Number.isInteger(envelope.retry_after_seconds)
    && envelope.retry_after_seconds >= 1 && envelope.retry_after_seconds <= 30) {
    return { status: 'pending', reason: envelope.code, retryAfterSeconds: envelope.retry_after_seconds };
  }
  throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
}

export async function disconnectTelegramAccountService(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  operationId: string;
  /** Exact server-only D1 route for an already-connected account. */
  gatewayAccountRef?: string;
}): Promise<void> {
  assertRequestScope(input.orgId, input.operationId);
  if (input.gatewayAccountRef !== undefined
    && !ACCOUNT_REF_PATTERN.test(input.gatewayAccountRef)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  const response = await serviceFetch(input.service, '/v1/accounts/disconnect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': input.operationId,
    },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      operation_id: input.operationId,
      ...(input.gatewayAccountRef
        ? { account_ref: input.gatewayAccountRef }
        : {}),
    }),
  }, input.internalServiceToken);
  if (response.status === 204) return;
  // For a pre-connection cleanup there is no durable private reference and a
  // 404 is the idempotent already-absent outcome. Once D1 stores an exact
  // account_ref, however, 404 is a custody failure—not proof of revocation.
  if (response.status === 404 && input.gatewayAccountRef === undefined) return;
  if (response.status === 404) statusError(response);
  const envelope = await responseEnvelope(response);
  if (!exactKeys(envelope, ['schema', 'status']) || envelope.status !== 'revoked') {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
}

/**
 * Checks only that the exact D1-held Durable Object route still owns private
 * account state. It does not start TDLib or expose the opaque route upstream.
 */
export async function getTelegramAccountRoutePresence(input: {
  service?: Fetcher;
  internalServiceToken?: string;
  orgId: string;
  gatewayAccountRef: string;
}): Promise<'present' | 'missing'> {
  assertRequestScope(input.orgId);
  if (!configured(input.service)
    || !INTERNAL_SERVICE_TOKEN_PATTERN.test(input.internalServiceToken ?? '')) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_unavailable');
  }
  if (!ACCOUNT_REF_PATTERN.test(input.gatewayAccountRef)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  let response: Response;
  try {
    response = await fetchWithDeadline(
      input.service,
      `${INTERNAL_ORIGIN}/v1/accounts/health?org_id=${encodeURIComponent(input.orgId)}&account_ref=${encodeURIComponent(input.gatewayAccountRef)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${input.internalServiceToken}`,
        },
      },
      TELEGRAM_ACCOUNT_HEALTH_REQUEST_TIMEOUT_MS,
    );
  } catch {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_unavailable');
  }
  const envelope = await responseEnvelope(response);
  if (!exactKeys(envelope, [
    'schema', 'status', 'account_status', 'reason_code', 'provider_blocked_until',
    'snapshot_present', 'active_effect', 'container_running', 'bridge_status',
  ])
    || envelope.status !== 'ok'
    || typeof envelope.account_status !== 'string'
    || !['not_connected', 'new', 'connected', 'restricted', 'reauth_required', 'revoked', 'error']
      .includes(envelope.account_status)
    || (envelope.reason_code !== null
      && (typeof envelope.reason_code !== 'string'
        || !SAFE_REASON_PATTERN.test(envelope.reason_code)))
    || (envelope.provider_blocked_until !== null
      && !validIso(envelope.provider_blocked_until))
    || typeof envelope.snapshot_present !== 'boolean'
    || typeof envelope.active_effect !== 'boolean'
    || typeof envelope.container_running !== 'boolean') {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  if (!['unpaired', 'online', 'offline', 'pending_revocation', 'revoked']
    .includes(String(envelope.bridge_status))) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  return envelope.account_status === 'not_connected' ? 'missing' : 'present';
}

/**
 * Provider adapter for the private service binding. Once the request crosses
 * this boundary, every transport/parse uncertainty is ambiguous and is never
 * surfaced as a retryable exception.
 */
export class PrivateTelegramCampaignSender implements TelegramCampaignSender {
  constructor(
    private readonly service: Fetcher,
    private readonly internalServiceToken?: string,
  ) {}

  async send(input: Parameters<TelegramCampaignSender['send']>[0]): Promise<TelegramCampaignProviderResult> {
    if (!INTERNAL_SERVICE_TOKEN_PATTERN.test(this.internalServiceToken ?? '')) {
      return { kind: 'ambiguous' };
    }
    const media = input.media ? resolvedMediaEnvelope(input.media, input.orgId) : null;
    if (input.media && !media) return { kind: 'ambiguous' };
    let response: Response;
    try {
      response = await fetchWithDeadline(
        this.service,
        `${INTERNAL_ORIGIN}/v1/messages/send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.internalServiceToken}`,
            'Content-Type': 'application/json; charset=utf-8',
            'Idempotency-Key': input.randomId,
          },
          body: JSON.stringify({
            schema: SERVICE_SCHEMA,
            org_id: input.orgId,
            account_ref: input.gatewayAccountRef,
            username: input.username,
            text: input.text,
            random_id: input.randomId,
            media,
            paid_message_policy: 'reject',
            allow_paid_floodskip: false,
          }),
        },
        TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS,
      );
    } catch {
      return { kind: 'ambiguous' };
    }
    if (response.status === 404) {
      // The private gateway authenticates and validates account_ref before the
      // tenant DO checks storage. Its exact account_not_found response occurs
      // before reserveEffect/provider I/O, so this one closed outcome can
      // safely release D1 quota and no-repeat reservations. Any malformed or
      // uncertain 404 remains ambiguous.
      try {
        const raw = await responseTextBeforeDeadline(response);
        if (new TextEncoder().encode(raw).byteLength <= MAX_RESPONSE_BYTES) {
          const missing = JSON.parse(raw) as unknown;
          if (exactRecord(missing)
            && exactKeys(missing, ['schema', 'status', 'reason_code'])
            && missing.schema === SERVICE_SCHEMA
            && missing.status === 'error'
            && missing.reason_code === 'account_not_found') {
            return { kind: 'rejected', code: 'account_session_missing' };
          }
        }
      } catch {
        // An unreadable/malformed response is on the provider boundary.
      }
      return { kind: 'ambiguous' };
    }
    let envelope: ServiceEnvelope;
    try {
      envelope = await responseEnvelope(response);
    } catch {
      return { kind: 'ambiguous' };
    }
    if (envelope.status === 'sent'
      && exactKeys(envelope, ['schema', 'status', 'provider_message_id'])
      && typeof envelope.provider_message_id === 'string'
      && envelope.provider_message_id.length >= 1
      && envelope.provider_message_id.length <= 256) {
      return { kind: 'sent', providerMessageId: envelope.provider_message_id };
    }
    if (envelope.status === 'ambiguous'
      && exactKeys(envelope, ['schema', 'status'])) {
      return { kind: 'ambiguous' };
    }
    if (envelope.status === 'rejected'
      && (exactKeys(envelope, ['schema', 'status', 'code'])
        || exactKeys(envelope, ['schema', 'status', 'code', 'retry_after_seconds']))
      && typeof envelope.code === 'string') {
      const code = envelope.code;
      if (code === 'peer_invalid' || code === 'privacy_restricted'
        || code === 'account_restricted' || code === 'paid_message_required'
        || code === 'media_invalid'
        || code === 'provider_rejected') {
        return { kind: 'rejected', code };
      }
      if ((code === 'flood_wait' || code === 'flood_premium_wait' || code === 'slow_mode')
        && (envelope.retry_after_seconds === undefined
          || (typeof envelope.retry_after_seconds === 'number'
            && Number.isSafeInteger(envelope.retry_after_seconds)
            && envelope.retry_after_seconds >= 1))) {
        return {
          kind: 'rejected',
          code,
          ...(typeof envelope.retry_after_seconds === 'number'
            ? { retryAfterSeconds: envelope.retry_after_seconds }
            : {}),
        };
      }
      // Every unknown provider rejection is terminal and never triggers a
      // second request or a Stars payment.
      return { kind: 'rejected', code: 'provider_rejected' };
    }
    return { kind: 'ambiguous' };
  }
}

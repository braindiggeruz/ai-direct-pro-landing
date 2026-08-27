import { DurableObject } from 'cloudflare:workers';

import {
  accountRefForOrg,
  decryptBridgePayload,
  encryptBridgePayload,
  parseMasterKey,
  randomOpaqueId,
  sha256Hex,
  type EncryptedBridgePayload,
} from './crypto';
import {
  BRIDGE_COMMAND_KINDS,
  BRIDGE_SCHEMA,
  bridgeBase64UrlBytes,
  bridgeExactKeys,
  bridgeRecord,
  bridgeSha256Hex,
  readBridgeJson,
  signedBridgeResponse,
  signedRegistrationResponse,
  validBridgeAccountRef,
  validBridgeBrowserKey,
  validBridgeE2eEnvelope,
  validBridgePoll,
  validBridgeRegistration,
  validBridgeResult,
  verifyBridgeDeviceRequest,
  bridgeAuthChallengeMayBeCancelled,
  isFinalizedConnectedAuthRecoverable,
  type BridgeJsonRecord,
  type VerifiedBridgeDeviceRequest,
} from './bridge-protocol';
import {
  ACCOUNT_REF_PATTERN,
  AUTH_ID_PATTERN,
  INTERNAL_ACCOUNT_ORIGIN,
  OPERATION_ID_PATTERN,
  ORG_ID_PATTERN,
  TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
  USERNAME_PATTERN,
  hasExactKeys,
  jsonResponse,
  noContentResponse,
  readBoundedJson,
  safeErrorResponse,
  validMessage,
  type JsonRecord,
} from './protocol';
import { telegramMessagePayloadDigest } from './message-effect';
import { LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS } from '../../src/shared/lead-radar-telegram-bridge';


const PUBLIC_BRIDGE_ORIGIN_FALLBACK =
  'https://gptbot-lead-radar-telegram-account.braindigger-uz.workers.dev';
const MAILBOX_NAME = 'global-v1';
const PAIRING_TTL_MS = 5 * 60_000;
const AUTH_TTL_MS = 10 * 60_000;
const RELAY_TTL_MS = LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS * 1_000;
const HEARTBEAT_FRESH_MS = 95_000;
const COMMAND_LEASE_MS = 90_000;
const COMMAND_TTL_MS = 24 * 60 * 60_000;
const NONCE_TTL_MS = 5 * 60_000;
const TERMINAL_PAYLOAD_RETENTION_MS = 24 * 60 * 60_000;
const WAIT_POLL_MS = 200;
const MAX_COMMAND_ATTEMPTS = 32;
const MAX_MEDIA_BYTES = 5_000_000;
const CLEANUP_CURSOR_KEY = 'bridge:cleanup-cursors:v1';

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

type DeviceState = 'online' | 'offline' | 'pending_revocation' | 'revoked';
type CommandStatus = 'queued' | 'leased' | 'progress' | 'succeeded' | 'failed' | 'ambiguous';
type AuthState = 'starting' | 'awaiting_phone' | 'awaiting_qr' | 'awaiting_code'
  | 'awaiting_password' | 'connected'
  | 'restricted' | 'reauth_required' | 'revoked' | 'error';

interface PairingRecord {
  version: 1;
  pairingId: string;
  orgId: string;
  accountRef: string;
  operationId: string;
  requestDigest: string;
  codeDigest: string;
  label: string;
  status: 'pending' | 'used' | 'expired';
  deviceId: string | null;
  createdAt: string;
  expiresAt: string;
}

interface DeviceRecord {
  version: 1;
  deviceId: string;
  orgId: string;
  accountRef: string;
  tokenDigest: string;
  label: string;
  bridgeVersion: string;
  encryptionPublicKeySpki: string;
  encryptionKeyId: string;
  state: DeviceState;
  registeredAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

interface AuthRecord {
  version: 1;
  authId: string;
  orgId: string;
  accountRef: string;
  deviceId: string;
  operationId: string;
  mode: 'qr' | 'phone';
  connectCommandId: string;
  inputCommandId: string | null;
  previousInputCommandId: string | null;
  inputAction: 'phone' | 'code' | null;
  passwordCommandId: string | null;
  previousPasswordCommandId: string | null;
  state: AuthState;
  adopted: boolean;
  finalized: boolean;
  finalizeCommandId?: string;
  qrEnvelope: BridgeJsonRecord | null;
  relayExpiresAt: string | null;
  maskedLabel: string | null;
  connectedAt: string | null;
  reasonCode: string | null;
  expiresAt: string;
  updatedAt: string;
}

interface AccountRecord {
  version: 1;
  orgId: string;
  accountRef: string;
  authId: string;
  deviceId: string;
  state: 'connected' | 'restricted' | 'reauth_required' | 'revoked';
  finalized: boolean;
  maskedLabel: string;
  connectedAt: string;
  reasonCode: string | null;
  providerBlockedUntil: string | null;
  updatedAt: string;
}

interface MediaReference {
  objectKey: string;
  mediaId: string;
  mediaDigest: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
}

interface CommandRecord {
  version: 1;
  commandId: string;
  orgId: string;
  accountRef: string;
  deviceId: string;
  kind: (typeof BRIDGE_COMMAND_KINDS)[number];
  operationId: string;
  requestDigest: string;
  payload: EncryptedBridgePayload;
  status: CommandStatus;
  attempt: number;
  leaseExpiresAt: string | null;
  lastSequence: number;
  resultStatus: 'progress' | 'succeeded' | 'failed' | 'ambiguous' | null;
  resultCode: string | null;
  result: EncryptedBridgePayload | null;
  resultDigest: string | null;
  media: MediaReference | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
}

interface EffectRecord {
  version: 1;
  effectId: string;
  accountRef: string;
  payloadDigest: string;
  commandId: string;
  status: 'in_flight' | 'sent' | 'rejected' | 'ambiguous';
  response: EncryptedBridgePayload | null;
  createdAt: string;
  updatedAt: string;
}

interface NonceRecord { expiresAt: string }

interface CleanupCursors {
  pairings: string | null;
  nonces: string | null;
  commands: string | null;
  auth: string | null;
  effects: string | null;
}

export interface TelegramBridgeGatewayEnv {
  TELEGRAM_ACCOUNTS: DurableObjectNamespace<LeadRadarTelegramBridgeMailbox>;
  LEAD_RADAR_CAMPAIGN_MEDIA: R2Bucket;
  LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY: string;
  LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY: string;
  LEAD_RADAR_TELEGRAM_ACCOUNT_KEY_VERSION: string;
  LEAD_RADAR_TELEGRAM_GATEWAY_VERSION: string;
  LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: string;
  LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN?: string;
}

class MailboxFault extends Error {
  constructor(readonly code: string, readonly status = 503) {
    super(code);
    this.name = 'MailboxFault';
  }
}

function nowIso(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString();
}

function isTerminal(status: CommandStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'ambiguous';
}

function pairingKey(pairingId: string): string { return `bridge:pairing:${pairingId}`; }
function pairingOperationKey(orgId: string, operationId: string): string {
  return `bridge:pairing-op:${orgId}:${operationId}`;
}
function deviceKey(deviceId: string): string { return `bridge:device:${deviceId}`; }
function orgDeviceKey(orgId: string): string { return `bridge:org-device:${orgId}`; }
function authKey(authId: string): string { return `bridge:auth:${authId}`; }
function orgAuthKey(orgId: string): string { return `bridge:org-auth:${orgId}`; }
function accountKey(accountRef: string): string { return `bridge:account:${accountRef}`; }
function commandKey(commandId: string): string { return `bridge:command:${commandId}`; }
function commandQueueKey(deviceId: string, createdAt: string, commandId: string): string {
  return `bridge:queue:${deviceId}:${String(Date.parse(createdAt)).padStart(13, '0')}:${commandId}`;
}
function commandOperationKey(orgId: string, operationId: string): string {
  return `bridge:command-op:${orgId}:${operationId}`;
}
function effectKey(effectId: string): string { return `bridge:effect:${effectId}`; }
function resultApplicationKey(commandId: string, sequence: number): string {
  return `bridge:result-application:${commandId}:${sequence}`;
}
function nonceKey(deviceId: string, nonce: string): string { return `bridge:nonce:${deviceId}:${nonce}`; }

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validMaskedLabel(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 3
    && value.length <= 40
    && !hasControlCharacters(value)
    && (/^@(?:[A-Za-z0-9_]•{3,5}[A-Za-z0-9_]|[A-Za-z0-9_]{2}•{3,5}[A-Za-z0-9_]{2})$/u.test(value)
      || /^Telegram (?:••••\d{4}|[\p{L}](?:·[\p{L}])?|account)$/u.test(value));
}

function publicOrigin(env: TelegramBridgeGatewayEnv): string {
  const configured = env.LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN ?? PUBLIC_BRIDGE_ORIGIN_FALLBACK;
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new MailboxFault('bridge_public_origin_invalid');
  }
  return url.origin;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class LeadRadarTelegramBridgeMailbox extends DurableObject<TelegramBridgeGatewayEnv> {
  private readonly master: Uint8Array;

  constructor(ctx: DurableObjectState, env: TelegramBridgeGatewayEnv) {
    super(ctx, env);
    const key = parseMasterKey(env.LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY);
    if (!key) throw new Error('bridge_data_key_invalid');
    this.master = key;
  }

  private async encrypt(commandId: string, purpose: string, value: BridgeJsonRecord): Promise<EncryptedBridgePayload> {
    return encryptBridgePayload({
      master: this.master,
      scope: `${commandId}:${purpose}`,
      plaintext: JSON.stringify(value),
    });
  }

  private async decrypt(commandId: string, purpose: string, value: EncryptedBridgePayload): Promise<BridgeJsonRecord> {
    const raw = await decryptBridgePayload({ master: this.master, scope: `${commandId}:${purpose}`, envelope: value });
    const parsed = JSON.parse(raw) as unknown;
    if (!bridgeRecord(parsed)) throw new MailboxFault('bridge_payload_invalid');
    return parsed;
  }

  private async accountRef(orgId: string): Promise<string> {
    const routing = parseMasterKey(this.env.LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY);
    if (!routing) throw new MailboxFault('gateway_not_configured');
    return accountRefForOrg(routing, orgId);
  }

  private async activeDevice(orgId: string): Promise<DeviceRecord | null> {
    const deviceId = await this.ctx.storage.get<string>(orgDeviceKey(orgId));
    if (!deviceId) return null;
    const device = await this.ctx.storage.get<DeviceRecord>(deviceKey(deviceId));
    return device ?? null;
  }

  private deviceStatus(device: DeviceRecord | null, nowMs = Date.now()): string {
    if (!device) return 'unpaired';
    if (device.state === 'revoked') return 'revoked';
    if (device.state === 'pending_revocation') return 'pending_revocation';
    if (device.state === 'offline') return 'offline';
    return Date.parse(device.lastSeenAt) >= nowMs - HEARTBEAT_FRESH_MS ? 'online' : 'offline';
  }

  private async scheduleAlarm(nowMs = Date.now()): Promise<void> {
    const desired = nowMs + 60_000;
    const scheduled = await this.ctx.storage.getAlarm();
    if (scheduled === null || scheduled > desired) await this.ctx.storage.setAlarm(desired);
  }

  private async createPairing(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'label', 'enrollment_code'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.operation_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.operation_id)
      || typeof body.label !== 'string'
      || body.label.trim() !== body.label
      || body.label.length < 1
      || body.label.length > 40
      || hasControlCharacters(body.label)
      || typeof body.enrollment_code !== 'string'
      || !/^[A-Za-z0-9_-]{22}$/u.test(body.enrollment_code)) {
      return safeErrorResponse('invalid_request');
    }
    const current = await this.activeDevice(body.org_id);
    if (current && current.state !== 'revoked') return safeErrorResponse('bridge_already_paired', 409);
    const requestDigest = await sha256Hex([
      body.org_id, body.operation_id, body.label, body.enrollment_code,
    ]);
    const operationKey = pairingOperationKey(body.org_id, body.operation_id);
    const priorId = await this.ctx.storage.get<string>(operationKey);
    if (priorId) {
      const prior = await this.ctx.storage.get<PairingRecord>(pairingKey(priorId));
      if (!prior || prior.requestDigest !== requestDigest) return safeErrorResponse('pairing_conflict', 409);
      return jsonResponse({
        schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
        status: prior.status === 'pending' ? 'pending' : prior.status,
        pairing_id: prior.pairingId,
        expires_at: prior.expiresAt,
      }, prior.status === 'pending' ? 201 : 200);
    }
    const pairingId = `lrtgbp_${crypto.randomUUID().replaceAll('-', '')}`;
    const createdAt = nowIso();
    const expiresAt = nowIso(Date.now() + PAIRING_TTL_MS);
    const codeDigest = await bridgeSha256Hex(new TextEncoder().encode(
      `lead-radar-bridge-pairing-v1\0${pairingId}\0${body.enrollment_code}`,
    ));
    const record: PairingRecord = {
      version: 1,
      pairingId,
      orgId: body.org_id,
      accountRef: await this.accountRef(body.org_id),
      operationId: body.operation_id,
      requestDigest,
      codeDigest,
      label: body.label,
      status: 'pending',
      deviceId: null,
      createdAt,
      expiresAt,
    };
    await this.ctx.storage.transaction(async (storage) => {
      const raced = await storage.get<string>(operationKey);
      if (raced) throw new MailboxFault('pairing_conflict', 409);
      await storage.put({ [pairingKey(pairingId)]: record, [operationKey]: pairingId });
    });
    await this.scheduleAlarm();
    return jsonResponse({
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: 'pending',
      pairing_id: pairingId,
      expires_at: expiresAt,
    }, 201);
  }

  private async bridgeStatus(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)) return safeErrorResponse('invalid_request');
    const device = await this.activeDevice(body.org_id);
    return jsonResponse({
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: this.deviceStatus(device),
      device_id: device?.deviceId ?? null,
      label: device?.label ?? null,
      version: device?.bridgeVersion ?? null,
      last_seen_at: device?.lastSeenAt ?? null,
      encryption_public_key_spki: device?.state !== 'revoked'
        ? device?.encryptionPublicKeySpki ?? null
        : null,
      encryption_key_id: device?.state !== 'revoked' ? device?.encryptionKeyId ?? null : null,
    });
  }

  private async revokeBridge(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'device_id'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.operation_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.operation_id)
      || typeof body.device_id !== 'string'
      || !/^lrtgbd_[a-f0-9]{32}$/u.test(body.device_id)) {
      return safeErrorResponse('invalid_request');
    }
    const currentDeviceId = await this.ctx.storage.get<string>(orgDeviceKey(body.org_id));
    const device = currentDeviceId
      ? await this.ctx.storage.get<DeviceRecord>(deviceKey(currentDeviceId))
      : null;
    if (!device || device.deviceId !== body.device_id || device.orgId !== body.org_id) {
      return safeErrorResponse('bridge_not_found', 404);
    }
    if (device.state === 'revoked') {
      return jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'revoked' });
    }
    const orgId = body.org_id;
    const authId = await this.ctx.storage.get<string>(orgAuthKey(orgId));
    const auth = authId ? await this.ctx.storage.get<AuthRecord>(authKey(authId)) : null;
    const account = await this.ctx.storage.get<AccountRecord>(accountKey(device.accountRef));
    const liveAuth = auth && !['revoked', 'error'].includes(auth.state);
    const liveAccount = account && account.state !== 'revoked';
    if (liveAuth || liveAccount || device.state === 'pending_revocation') {
      // Owner unpair cannot strand an MTProto authorization. Connected or
      // provisional custody must first complete its authenticated local
      // cancel/logout command while the device credential remains pollable.
      return safeErrorResponse('bridge_custody_active', 409);
    }
    await this.ctx.storage.transaction(async (storage) => {
      const mapped = await storage.get<string>(orgDeviceKey(orgId));
      const current = await storage.get<DeviceRecord>(deviceKey(device.deviceId));
      if (mapped !== device.deviceId || !current || current.state === 'pending_revocation') {
        throw new MailboxFault('bridge_custody_active', 409);
      }
      await storage.put(deviceKey(device.deviceId), {
        ...current,
        state: 'revoked',
        revokedAt: nowIso(),
      } satisfies DeviceRecord);
    });
    return jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'revoked' });
  }

  private async register(request: Request): Promise<Response> {
    const parsed = await readBridgeJson(request);
    if (!parsed || !validBridgeRegistration(parsed.body)) {
      return new Response('Invalid request', { status: 400 });
    }
    const pairing = await this.ctx.storage.get<PairingRecord>(pairingKey(parsed.body.pairing_id as string));
    if (!pairing) {
      return new Response('Pairing unavailable', { status: 410 });
    }
    if (parsed.body.label !== pairing.label) return new Response('Pairing unavailable', { status: 409 });
    const secret = bridgeBase64UrlBytes(parsed.body.device_secret as string, 32);
    const spki = bridgeBase64UrlBytes(parsed.body.encryption_public_key_spki as string);
    if (!secret || !spki || spki.byteLength < 256 || spki.byteLength > 1024) {
      return new Response('Invalid request', { status: 400 });
    }
    const codeDigest = await bridgeSha256Hex(new TextEncoder().encode(
      `lead-radar-bridge-pairing-v1\0${pairing.pairingId}\0${parsed.body.pairing_code as string}`,
    ));
    if (codeDigest !== pairing.codeDigest) return new Response('Pairing unavailable', { status: 401 });
    if (pairing.status === 'used' && pairing.deviceId) {
      const existing = await this.ctx.storage.get<DeviceRecord>(deviceKey(pairing.deviceId));
      if (!existing
        || existing.orgId !== pairing.orgId
        || existing.label !== parsed.body.label
        || existing.bridgeVersion !== parsed.body.version
        || existing.encryptionPublicKeySpki !== parsed.body.encryption_public_key_spki
        || existing.encryptionKeyId !== await bridgeSha256Hex(spki)
        || existing.tokenDigest !== await bridgeSha256Hex(secret)) {
        return new Response('Pairing unavailable', { status: 409 });
      }
      const responseBody = JSON.stringify({
        schema: BRIDGE_SCHEMA,
        status: 'registered',
        device_id: existing.deviceId,
        poll_after_seconds: 15,
      });
      return signedRegistrationResponse({
        responseBody,
        requestBody: parsed.rawBody,
        pairingId: pairing.pairingId,
        deviceId: existing.deviceId,
        deviceSecret: secret,
      });
    }
    if (pairing.status !== 'pending' || Date.parse(pairing.expiresAt) <= Date.now()) {
      return new Response('Pairing unavailable', { status: 410 });
    }
    const deviceId = `lrtgbd_${crypto.randomUUID().replaceAll('-', '')}`;
    const now = nowIso();
    const device: DeviceRecord = {
      version: 1,
      deviceId,
      orgId: pairing.orgId,
      accountRef: pairing.accountRef,
      tokenDigest: await bridgeSha256Hex(secret),
      label: pairing.label,
      bridgeVersion: parsed.body.version as string,
      encryptionPublicKeySpki: parsed.body.encryption_public_key_spki as string,
      encryptionKeyId: await bridgeSha256Hex(spki),
      // Registration is not operational confirmation: the signed 201 may be
      // lost before the local vault records device_id. Only the first valid
      // HMAC poll promotes this record online.
      state: 'offline',
      registeredAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    const updatedPairing: PairingRecord = { ...pairing, status: 'used', deviceId };
    await this.ctx.storage.transaction(async (storage) => {
      const current = await storage.get<PairingRecord>(pairingKey(pairing.pairingId));
      const currentDevice = await storage.get<string>(orgDeviceKey(pairing.orgId));
      const currentDeviceRecord = currentDevice
        ? await storage.get<DeviceRecord>(deviceKey(currentDevice))
        : null;
      if (!current
        || current.status !== 'pending'
        || (currentDevice !== undefined && currentDeviceRecord?.state !== 'revoked')) {
        throw new MailboxFault('pairing_conflict', 409);
      }
      await storage.put({
        [pairingKey(pairing.pairingId)]: updatedPairing,
        [deviceKey(deviceId)]: device,
        [orgDeviceKey(pairing.orgId)]: deviceId,
      });
    });
    const responseBody = JSON.stringify({
      schema: BRIDGE_SCHEMA,
      status: 'registered',
      device_id: deviceId,
      poll_after_seconds: 15,
    });
    return signedRegistrationResponse({
      responseBody,
      requestBody: parsed.rawBody,
      pairingId: pairing.pairingId,
      deviceId,
      deviceSecret: secret,
    });
  }

  private async authenticated(request: Request): Promise<{
    verified: VerifiedBridgeDeviceRequest;
    device: DeviceRecord;
  } | null> {
    const deviceId = request.headers.get('X-Lead-Radar-Device-Id') ?? '';
    const device = await this.ctx.storage.get<DeviceRecord>(deviceKey(deviceId));
    const path = new URL(request.url).pathname;
    const revokedResultRetry = device?.state === 'revoked'
      && /^\/v1\/bridge\/commands\/lrtgbc_[a-f0-9]{32}\/result$/u.test(path);
    if (!device || (device.state === 'revoked' && !revokedResultRetry)) return null;
    const verified = await verifyBridgeDeviceRequest({ request, tokenDigest: device.tokenDigest });
    if (!verified || verified.deviceId !== device.deviceId) return null;
    const nonceStorageKey = nonceKey(device.deviceId, verified.nonce);
    const existing = await this.ctx.storage.get<NonceRecord>(nonceStorageKey);
    if (existing && Date.parse(existing.expiresAt) > Date.now()) return null;
    const updated: DeviceRecord = {
      ...device,
      bridgeVersion: typeof verified.body.version === 'string'
        ? verified.body.version
        : device.bridgeVersion,
      lastSeenAt: nowIso(),
      state: device.state === 'offline' ? 'online' : device.state,
    };
    await this.ctx.storage.put({
      [nonceStorageKey]: { expiresAt: nowIso(Date.now() + NONCE_TTL_MS) } satisfies NonceRecord,
      [deviceKey(device.deviceId)]: updated,
    });
    await this.scheduleAlarm();
    return { verified, device: updated };
  }

  private async commandPayload(command: CommandRecord): Promise<BridgeJsonRecord> {
    return this.decrypt(command.commandId, 'payload', command.payload);
  }

  private async nextCommand(device: DeviceRecord): Promise<CommandRecord | null> {
    const queued = await this.ctx.storage.list<string>({
      prefix: `bridge:queue:${device.deviceId}:`,
      limit: 128,
    });
    const candidates: CommandRecord[] = [];
    for (const [queueKey, commandId] of queued) {
      const command = await this.ctx.storage.get<CommandRecord>(commandKey(commandId));
      if (!command || isTerminal(command.status)) {
        await this.ctx.storage.delete(queueKey);
        continue;
      }
      if (Date.parse(command.expiresAt) <= Date.now() && command.kind !== 'disconnect') continue;
      if ((command.status === 'leased' || command.status === 'progress')
        && command.leaseExpiresAt
        && Date.parse(command.leaseExpiresAt) > Date.now()) {
        // Do not make the local bridge execute an in-flight command twice.
        // A progress connect continues locally, while a separately queued 2FA
        // command remains deliverable. After a crash the expired lease causes
        // a safe redelivery and exact local outbox replay/recovery.
        continue;
      }
      if (device.state !== 'pending_revocation' || command.kind === 'disconnect') candidates.push(command);
    }
    const command = candidates[0];
    if (!command) return null;
    if (command.attempt >= MAX_COMMAND_ATTEMPTS && command.kind !== 'disconnect') {
      const terminal: CommandRecord = {
        ...command,
        status: 'ambiguous',
        resultStatus: 'ambiguous',
        resultCode: 'bridge_delivery_exhausted',
        leaseExpiresAt: null,
        updatedAt: nowIso(),
      };
      await this.ctx.storage.put(commandKey(command.commandId), terminal);
      return null;
    }
    const leased: CommandRecord = {
      ...command,
      status: command.status === 'progress' ? 'progress' : 'leased',
      attempt: command.kind === 'disconnect' && command.attempt >= MAX_COMMAND_ATTEMPTS
        ? 1
        : command.attempt + 1,
      leaseExpiresAt: nowIso(Date.now() + COMMAND_LEASE_MS),
      updatedAt: nowIso(),
    };
    await this.ctx.storage.put(commandKey(command.commandId), leased);
    return leased;
  }

  private async poll(request: Request, auth: {
    verified: VerifiedBridgeDeviceRequest;
    device: DeviceRecord;
  }): Promise<Response> {
    if (!validBridgePoll(auth.verified.body)) return new Response('Invalid request', { status: 400 });
    const command = await this.nextCommand(auth.device);
    const activeId = await this.ctx.storage.get<string>(orgAuthKey(auth.device.orgId));
    const active = activeId ? await this.ctx.storage.get<AuthRecord>(authKey(activeId)) : null;
    const [major, minor] = auth.device.bridgeVersion.split('.').map(Number);
    const supportsFastPoll = major > 1 || (major === 1 && minor >= 2);
    const interactive = active && active.deviceId === auth.device.deviceId
      && !active.finalized && Date.parse(active.expiresAt) > Date.now()
      && !['revoked', 'error', 'restricted', 'reauth_required'].includes(active.state);
    // Older installed Bridges reject delays below 15 seconds. Keep the rollout
    // backward-compatible while the 1.2 client serves interactive auth promptly.
    const pollSeconds = supportsFastPoll && interactive ? 2 : 15;
    const responseBody = command
      ? JSON.stringify({
        schema: BRIDGE_SCHEMA,
        status: 'command',
        server_time: Math.floor(Date.now() / 1_000),
        poll_after_seconds: pollSeconds,
        command: {
          id: command.commandId,
          kind: command.kind,
          attempt: command.attempt,
          lease_expires_at: command.leaseExpiresAt,
          payload: await this.commandPayload(command),
        },
      })
      : JSON.stringify({
        schema: BRIDGE_SCHEMA,
        status: 'idle',
        server_time: Math.floor(Date.now() / 1_000),
        poll_after_seconds: pollSeconds,
        command: null,
      });
    return signedBridgeResponse({
      body: responseBody,
      contentType: 'application/json; charset=utf-8',
      deviceId: auth.device.deviceId,
      deviceSecret: auth.verified.deviceSecret,
      requestNonce: auth.verified.nonce,
      path: new URL(request.url).pathname,
      commandId: command?.commandId ?? 'idle',
      sequence: command?.attempt ?? 0,
      expiresAt: command?.leaseExpiresAt ?? 'none',
    });
  }

  private async applyConnectResult(
    command: CommandRecord,
    body: BridgeJsonRecord,
    applicationKey: string,
    digest: string,
  ): Promise<void> {
    const authId = (await this.commandPayload(command)).auth_id;
    if (typeof authId !== 'string') throw new MailboxFault('bridge_result_invalid', 400);
    const auth = await this.ctx.storage.get<AuthRecord>(authKey(authId));
    if (!auth || auth.deviceId !== command.deviceId || auth.connectCommandId !== command.commandId) {
      throw new MailboxFault('bridge_result_conflict', 409);
    }
    const result = body.result as BridgeJsonRecord;
    if (body.status === 'progress' && body.result_code === 'awaiting_qr') {
      if (!bridgeExactKeys(result, ['auth_id', 'auth_state', 'qr_envelope', 'expires_at'])
        || result.auth_id !== auth.authId
        || result.auth_state !== 'awaiting_qr'
        || !validBridgeE2eEnvelope(result.qr_envelope)
        || !validIso(result.expires_at)
        || Date.parse(result.expires_at) > Date.now() + RELAY_TTL_MS + 5_000
        || Date.parse(result.expires_at) > Date.parse(auth.expiresAt)) {
        throw new MailboxFault('bridge_result_invalid', 400);
      }
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'awaiting_qr',
          qrEnvelope: result.qr_envelope as BridgeJsonRecord,
          relayExpiresAt: result.expires_at as string,
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    if (body.status === 'progress' && body.result_code === 'awaiting_password') {
      if (!bridgeExactKeys(result, ['auth_id', 'auth_state', 'expires_at'])
        || result.auth_id !== auth.authId
        || result.auth_state !== 'awaiting_password'
        || !validIso(result.expires_at)
        || Date.parse(result.expires_at) <= Date.now() - 5_000
        || Date.parse(result.expires_at) > Date.now() + RELAY_TTL_MS + 5_000
        || Date.parse(result.expires_at) > Date.parse(auth.expiresAt)) {
        throw new MailboxFault('bridge_result_invalid', 400);
      }
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'awaiting_password',
          passwordCommandId: auth.passwordCommandId ?? `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`,
          qrEnvelope: null,
          relayExpiresAt: result.expires_at as string,
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    if (body.status === 'succeeded' && body.result_code === 'connected') {
      if (!bridgeExactKeys(result, [
        'auth_id', 'account_ref', 'masked_label', 'connected_at',
      ])
        || result.auth_id !== auth.authId
        || result.account_ref !== auth.accountRef
        || !validMaskedLabel(result.masked_label)
        || !validIso(result.connected_at)) throw new MailboxFault('bridge_result_invalid', 400);
      const updated: AuthRecord = {
        ...auth,
        state: 'connected',
        qrEnvelope: null,
        relayExpiresAt: null,
        maskedLabel: result.masked_label,
        connectedAt: result.connected_at,
        updatedAt: nowIso(),
      };
      const account: AccountRecord = {
        version: 1,
        orgId: auth.orgId,
        accountRef: auth.accountRef,
        authId: auth.authId,
        deviceId: auth.deviceId,
        state: 'connected',
        finalized: false,
        maskedLabel: result.masked_label,
        connectedAt: result.connected_at,
        reasonCode: null,
        providerBlockedUntil: null,
        updatedAt: nowIso(),
      };
      await this.ctx.storage.put({
        [authKey(auth.authId)]: updated,
        [accountKey(auth.accountRef)]: account,
        [applicationKey]: digest,
      });
      return;
    }
    if (body.status === 'failed' || body.status === 'ambiguous') {
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'error',
          qrEnvelope: null,
          relayExpiresAt: null,
          reasonCode: body.result_code as string,
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    throw new MailboxFault('bridge_result_invalid', 400);
  }

  private async applyPhoneConnectResult(
    command: CommandRecord,
    body: BridgeJsonRecord,
    applicationKey: string,
    digest: string,
  ): Promise<void> {
    const authId = (await this.commandPayload(command)).auth_id;
    if (typeof authId !== 'string') throw new MailboxFault('bridge_result_invalid', 400);
    const auth = await this.ctx.storage.get<AuthRecord>(authKey(authId));
    if (!auth || auth.deviceId !== command.deviceId
      || auth.connectCommandId !== command.commandId || auth.mode !== 'phone') {
      throw new MailboxFault('bridge_result_conflict', 409);
    }
    const result = body.result as BridgeJsonRecord;
    if (body.status === 'succeeded' && body.result_code === 'awaiting_phone'
      && bridgeExactKeys(result, ['auth_id', 'auth_state', 'expires_at'])
      && result.auth_id === auth.authId
      && result.auth_state === 'awaiting_phone'
      && validIso(result.expires_at)
      && Date.parse(result.expires_at) > Date.now() - 5_000
      && Date.parse(result.expires_at) <= Date.now() + RELAY_TTL_MS + 5_000
      && Date.parse(result.expires_at) <= Date.parse(auth.expiresAt)) {
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'awaiting_phone',
          inputCommandId: `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`,
          previousInputCommandId: null,
          inputAction: 'phone',
          relayExpiresAt: result.expires_at,
          reasonCode: null,
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    if (body.status === 'failed' || body.status === 'ambiguous') {
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'error',
          inputCommandId: null,
          inputAction: null,
          relayExpiresAt: null,
          reasonCode: String(body.result_code ?? 'authorization_failed'),
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    throw new MailboxFault('bridge_result_invalid', 400);
  }

  private async applyAuthInputResult(
    command: CommandRecord,
    body: BridgeJsonRecord,
    applicationKey: string,
    digest: string,
  ): Promise<void> {
    const payload = await this.commandPayload(command);
    const authId = payload.auth_id;
    const action = payload.action;
    if (typeof authId !== 'string' || !['phone', 'code'].includes(String(action))) {
      throw new MailboxFault('bridge_result_invalid', 400);
    }
    const auth = await this.ctx.storage.get<AuthRecord>(authKey(authId));
    if (!auth || auth.deviceId !== command.deviceId
      || auth.inputCommandId !== command.commandId || auth.inputAction !== action) {
      throw new MailboxFault('bridge_result_conflict', 409);
    }
    const result = body.result as BridgeJsonRecord;
    const validRelay = bridgeExactKeys(result, ['auth_id', 'auth_state', 'expires_at'])
      && result.auth_id === auth.authId
      && validIso(result.expires_at)
      && Date.parse(result.expires_at) > Date.now() - 5_000
      && Date.parse(result.expires_at) <= Date.now() + RELAY_TTL_MS + 5_000
      && Date.parse(result.expires_at) <= Date.parse(auth.expiresAt);

    if (action === 'phone' && body.status === 'succeeded' && body.result_code === 'awaiting_code'
      && validRelay && result.auth_state === 'awaiting_code') {
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'awaiting_code',
          inputCommandId: `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`,
          previousInputCommandId: command.commandId,
          inputAction: 'code',
          relayExpiresAt: result.expires_at as string,
          reasonCode: null,
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    if (action === 'code' && body.status === 'succeeded' && body.result_code === 'awaiting_password'
      && validRelay && result.auth_state === 'awaiting_password') {
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'awaiting_password',
          inputCommandId: null,
          previousInputCommandId: command.commandId,
          inputAction: null,
          passwordCommandId: `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`,
          relayExpiresAt: result.expires_at as string,
          reasonCode: null,
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    if (action === 'code' && body.status === 'succeeded' && body.result_code === 'connected') {
      if (!bridgeExactKeys(result, ['auth_id', 'account_ref', 'masked_label', 'connected_at'])
        || result.auth_id !== auth.authId
        || result.account_ref !== auth.accountRef
        || !validMaskedLabel(result.masked_label)
        || !validIso(result.connected_at)) throw new MailboxFault('bridge_result_invalid', 400);
      const connectedAt = result.connected_at as string;
      const maskedLabel = result.masked_label as string;
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'connected',
          inputCommandId: null,
          previousInputCommandId: command.commandId,
          inputAction: null,
          relayExpiresAt: null,
          maskedLabel,
          connectedAt,
          reasonCode: null,
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [accountKey(auth.accountRef)]: {
          version: 1,
          orgId: auth.orgId,
          accountRef: auth.accountRef,
          authId: auth.authId,
          deviceId: auth.deviceId,
          state: 'connected',
          finalized: false,
          maskedLabel,
          connectedAt,
          reasonCode: null,
          providerBlockedUntil: null,
          updatedAt: nowIso(),
        } satisfies AccountRecord,
        [applicationKey]: digest,
      });
      return;
    }
    if (body.status === 'failed'
      && ((action === 'phone' && body.result_code === 'phone_invalid')
        || (action === 'code' && body.result_code === 'code_invalid'))
      && bridgeExactKeys(result, [])) {
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: action === 'phone' ? 'awaiting_phone' : 'awaiting_code',
          inputCommandId: `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`,
          previousInputCommandId: command.commandId,
          inputAction: action,
          relayExpiresAt: nowIso(Math.min(Date.now() + RELAY_TTL_MS, Date.parse(auth.expiresAt))),
          reasonCode: body.result_code as string,
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    if (body.status === 'failed' && action === 'code' && body.result_code === 'code_expired'
      && bridgeExactKeys(result, [])) {
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'error',
          inputCommandId: null,
          inputAction: null,
          relayExpiresAt: null,
          reasonCode: 'code_expired',
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    if (body.status === 'ambiguous') {
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'error',
          inputCommandId: null,
          inputAction: null,
          reasonCode: body.result_code === 'telegram_timeout' ? 'telegram_timeout' : 'auth_input_outcome_unknown',
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    throw new MailboxFault('bridge_result_invalid', 400);
  }

  private async applyPasswordResult(
    command: CommandRecord,
    body: BridgeJsonRecord,
    applicationKey: string,
    digest: string,
  ): Promise<void> {
    const payload = await this.commandPayload(command);
    const authId = payload.auth_id;
    if (typeof authId !== 'string') throw new MailboxFault('bridge_result_invalid', 400);
    const auth = await this.ctx.storage.get<AuthRecord>(authKey(authId));
    if (!auth) throw new MailboxFault('bridge_result_conflict', 409);
    if (auth.passwordCommandId !== command.commandId) {
      // Crash-idempotency boundary: password_invalid rotates the one-use slot
      // before the CommandRecord terminal write. The exact old result may then
      // be retried and must finish that write without rotating again.
      if (body.status === 'failed'
        && body.result_code === 'password_invalid'
        && auth.previousPasswordCommandId === command.commandId
        && auth.state === 'awaiting_password'
        && auth.reasonCode === 'password_invalid') {
        await this.ctx.storage.put(applicationKey, digest);
        return;
      }
      throw new MailboxFault('bridge_result_conflict', 409);
    }
    if (body.status === 'succeeded' && body.result_code === 'connected') {
      const result = body.result as BridgeJsonRecord;
      if (!bridgeExactKeys(result, ['auth_id', 'account_ref', 'masked_label', 'connected_at'])
        || result.auth_id !== auth.authId
        || result.account_ref !== auth.accountRef
        || !validMaskedLabel(result.masked_label)
        || !validIso(result.connected_at)) throw new MailboxFault('bridge_result_invalid', 400);
      const updated: AuthRecord = {
        ...auth,
        state: 'connected',
        qrEnvelope: null,
        relayExpiresAt: null,
        maskedLabel: result.masked_label,
        connectedAt: result.connected_at,
        updatedAt: nowIso(),
      };
      await this.ctx.storage.put({
        [authKey(auth.authId)]: updated,
        [accountKey(auth.accountRef)]: {
          version: 1,
          orgId: auth.orgId,
          accountRef: auth.accountRef,
          authId: auth.authId,
          deviceId: auth.deviceId,
          state: 'connected',
          finalized: false,
          maskedLabel: result.masked_label,
          connectedAt: result.connected_at,
          reasonCode: null,
          providerBlockedUntil: null,
          updatedAt: nowIso(),
        } satisfies AccountRecord,
        [applicationKey]: digest,
      });
      return;
    }
    if (body.status === 'failed' && body.result_code === 'password_invalid'
      && bridgeExactKeys(body.result as BridgeJsonRecord, [])) {
      const nextRelayExpiry = nowIso(Math.min(
        Date.now() + RELAY_TTL_MS,
        Date.parse(auth.expiresAt),
      ));
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'awaiting_password',
          passwordCommandId: `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`,
          previousPasswordCommandId: command.commandId,
          relayExpiresAt: nextRelayExpiry,
          reasonCode: 'password_invalid',
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    if (body.status === 'ambiguous') {
      await this.ctx.storage.put({
        [authKey(auth.authId)]: {
          ...auth,
          state: 'error',
          reasonCode: body.result_code === 'telegram_timeout' ? 'telegram_timeout' : 'password_outcome_unknown',
          updatedAt: nowIso(),
        } satisfies AuthRecord,
        [applicationKey]: digest,
      });
      return;
    }
    throw new MailboxFault('bridge_result_invalid', 400);
  }

  private async applyProbeResult(
    command: CommandRecord,
    body: BridgeJsonRecord,
    applicationKey: string,
    digest: string,
  ): Promise<void> {
    const payload = await this.commandPayload(command);
    const result = body.result as BridgeJsonRecord;
    if (body.status === 'ambiguous' && bridgeExactKeys(result, [])) {
      // A network timeout proves neither authorization nor revocation. Close
      // the read-only probe; a later finalization poll may enqueue another.
      await this.ctx.storage.put(applicationKey, digest);
      return;
    }
    if (body.status !== 'succeeded'
      || body.result_code !== 'probed'
      || !bridgeExactKeys(result, ['account_ref', 'state', 'masked_label', 'checked_at'])
      || result.account_ref !== command.accountRef
      || !['connected', 'restricted', 'reauth_required', 'revoked'].includes(String(result.state))
      || !validMaskedLabel(result.masked_label)
      || !validIso(result.checked_at)) throw new MailboxFault('bridge_result_invalid', 400);
    const account = await this.ctx.storage.get<AccountRecord>(accountKey(command.accountRef));
    if (!account || account.deviceId !== command.deviceId) throw new MailboxFault('bridge_result_conflict', 409);
    const finalized = typeof payload.finalize_auth_id === 'string';
    if (finalized && payload.finalize_auth_id !== account.authId) {
      throw new MailboxFault('bridge_result_conflict', 409);
    }
    const state = result.state as AccountRecord['state'];
    const writes: Record<string, unknown> = {
      [accountKey(account.accountRef)]: {
      ...account,
      state,
      finalized: finalized && state === 'connected' ? true : account.finalized,
      reasonCode: state === 'connected' ? null : state,
      updatedAt: nowIso(),
      } satisfies AccountRecord,
      [applicationKey]: digest,
    };
    if (finalized) {
      const auth = await this.ctx.storage.get<AuthRecord>(authKey(account.authId));
      if (auth) writes[authKey(auth.authId)] = {
        ...auth,
        state,
        finalized: state === 'connected',
        reasonCode: state === 'connected' ? null : state,
        updatedAt: nowIso(),
      } satisfies AuthRecord;
    }
    await this.ctx.storage.put(writes);
  }

  private async applyDisconnectResult(
    command: CommandRecord,
    body: BridgeJsonRecord,
    applicationKey: string,
    digest: string,
  ): Promise<void> {
    const account = await this.ctx.storage.get<AccountRecord>(accountKey(command.accountRef));
    const device = await this.ctx.storage.get<DeviceRecord>(deviceKey(command.deviceId));
    const auth = account
      ? await this.ctx.storage.get<AuthRecord>(authKey(account.authId))
      : null;
    if (!account || !device || !auth
      || account.authId !== (await this.commandPayload(command)).auth_id
      || auth.deviceId !== device.deviceId
      || auth.accountRef !== account.accountRef) {
      throw new MailboxFault('bridge_result_conflict', 409);
    }
    if (body.status === 'progress' && body.result_code === 'logout_retrying') {
      await this.ctx.storage.put(applicationKey, digest);
      return;
    }
    if (body.status !== 'succeeded' || body.result_code !== 'revoked'
      || !bridgeExactKeys(body.result as BridgeJsonRecord, [])) {
      throw new MailboxFault('bridge_result_invalid', 400);
    }
    await this.ctx.storage.put({
      [accountKey(account.accountRef)]: {
        ...account,
        state: 'revoked',
        finalized: false,
        reasonCode: 'revoked',
        updatedAt: nowIso(),
      } satisfies AccountRecord,
      [deviceKey(device.deviceId)]: {
        ...device,
        state: 'revoked',
        revokedAt: nowIso(),
      } satisfies DeviceRecord,
      [authKey(account.authId)]: {
        ...auth,
        state: 'revoked',
        finalized: false,
        qrEnvelope: null,
        relayExpiresAt: null,
        reasonCode: 'revoked',
        updatedAt: nowIso(),
      } satisfies AuthRecord,
      [applicationKey]: digest,
    });
  }

  private async effectResponse(command: CommandRecord, body: BridgeJsonRecord): Promise<JsonRecord> {
    const result = body.result as BridgeJsonRecord;
    const effectId = result.effect_id;
    if (typeof effectId !== 'string' || effectId !== command.operationId) {
      throw new MailboxFault('bridge_result_invalid', 400);
    }
    if (body.status === 'succeeded' && body.result_code === 'sent') {
      if (!bridgeExactKeys(result, ['effect_id', 'provider_message_id'])
        || typeof result.provider_message_id !== 'string'
        || !/^[1-9]\d{0,19}$/u.test(result.provider_message_id)) {
        throw new MailboxFault('bridge_result_invalid', 400);
      }
      return {
        schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
        status: 'sent',
        provider_message_id: result.provider_message_id,
      };
    }
    if (body.status === 'failed') {
      if (!(bridgeExactKeys(result, ['effect_id', 'retryable'])
        || bridgeExactKeys(result, ['effect_id', 'retryable', 'retry_after_seconds']))
        || result.retryable !== false) throw new MailboxFault('bridge_result_invalid', 400);
      const codeMap: Record<string, string> = {
        peer_invalid: 'peer_invalid',
        privacy_restricted: 'privacy_restricted',
        flood_wait: 'flood_wait',
        flood_premium_wait: 'flood_premium_wait',
        slow_mode: 'slow_mode',
        account_restricted: 'account_restricted',
        paid_message_required: 'paid_message_required',
        media_invalid: 'media_invalid',
        provider_rejected: 'provider_rejected',
      };
      const code = codeMap[body.result_code as string] ?? 'provider_rejected';
      return {
        schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
        status: 'rejected',
        code,
        ...(typeof result.retry_after_seconds === 'number'
          && Number.isSafeInteger(result.retry_after_seconds)
          && result.retry_after_seconds >= 1
          && result.retry_after_seconds <= 86_400
          ? { retry_after_seconds: result.retry_after_seconds }
          : {}),
      };
    }
    if (body.status === 'ambiguous'
      && body.result_code === 'provider_outcome_unknown'
      && bridgeExactKeys(result, ['effect_id'])) {
      return { schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' };
    }
    throw new MailboxFault('bridge_result_invalid', 400);
  }

  private async applyResult(
    command: CommandRecord,
    body: BridgeJsonRecord,
    applicationKey: string,
    digest: string,
  ): Promise<void> {
    if (command.kind === 'connect') await this.applyConnectResult(command, body, applicationKey, digest);
    else if (command.kind === 'connect_phone') {
      await this.applyPhoneConnectResult(command, body, applicationKey, digest);
    } else if (command.kind === 'submit_auth') {
      await this.applyAuthInputResult(command, body, applicationKey, digest);
    }
    else if (command.kind === 'submit_password') {
      await this.applyPasswordResult(command, body, applicationKey, digest);
    } else if (command.kind === 'probe') await this.applyProbeResult(command, body, applicationKey, digest);
    else if (command.kind === 'disconnect') {
      await this.applyDisconnectResult(command, body, applicationKey, digest);
    }
    else if (command.kind === 'cancel_auth') {
      if (body.status !== 'succeeded'
        || body.result_code !== 'cancelled'
        || !bridgeExactKeys(body.result as BridgeJsonRecord, [])) {
        throw new MailboxFault('bridge_result_invalid', 400);
      }
      const authId = (await this.commandPayload(command)).auth_id;
      if (typeof authId === 'string') {
        const auth = await this.ctx.storage.get<AuthRecord>(authKey(authId));
        if (auth && !auth.finalized) {
          await this.ctx.storage.put({
            [authKey(authId)]: {
              ...auth,
              state: 'revoked',
              reasonCode: 'cancelled',
              qrEnvelope: null,
              updatedAt: nowIso(),
            } satisfies AuthRecord,
            [applicationKey]: digest,
          });
        } else await this.ctx.storage.put(applicationKey, digest);
      }
    } else if (command.kind === 'send') {
      const response = await this.effectResponse(command, body);
      const effect = await this.ctx.storage.get<EffectRecord>(effectKey(command.operationId));
      if (!effect || effect.commandId !== command.commandId) throw new MailboxFault('effect_conflict', 409);
      await this.ctx.storage.put({
        [effectKey(effect.effectId)]: {
          ...effect,
          status: response.status === 'sent' ? 'sent' : response.status === 'rejected' ? 'rejected' : 'ambiguous',
          response: await this.encrypt(command.commandId, 'effect-response', response),
          updatedAt: nowIso(),
        } satisfies EffectRecord,
        [applicationKey]: digest,
      });
    } else if (command.kind === 'validate_media') {
      if (!((body.status === 'succeeded' && body.result_code === 'media_valid')
        || (body.status === 'failed' && body.result_code === 'media_invalid'))
        || !bridgeExactKeys(body.result as BridgeJsonRecord, [])) {
        throw new MailboxFault('bridge_result_invalid', 400);
      }
      await this.ctx.storage.put(applicationKey, digest);
    }
  }

  private async result(request: Request, auth: {
    verified: VerifiedBridgeDeviceRequest;
    device: DeviceRecord;
  }, commandId: string): Promise<Response> {
    if (!validBridgeResult(auth.verified.body, commandId)) return new Response('Invalid request', { status: 400 });
    const command = await this.ctx.storage.get<CommandRecord>(commandKey(commandId));
    if (!command || command.deviceId !== auth.device.deviceId) return new Response('Not found', { status: 404 });
    if (auth.device.state === 'revoked' && command.kind !== 'disconnect') {
      return new Response('Unauthorized', { status: 401 });
    }
    const digest = await bridgeSha256Hex(auth.verified.rawBody);
    if (auth.verified.body.sequence <= command.lastSequence) {
      if (auth.verified.body.sequence === command.lastSequence && digest === command.resultDigest) {
        return this.resultAck(request, auth, commandId, auth.verified.body.sequence);
      }
      return new Response('Result conflict', { status: 409 });
    }
    if (auth.verified.body.sequence !== command.lastSequence + 1 || isTerminal(command.status)) {
      return new Response('Result conflict', { status: 409 });
    }
    const applicationKey = resultApplicationKey(command.commandId, auth.verified.body.sequence);
    const appliedDigest = await this.ctx.storage.get<string>(applicationKey);
    if (appliedDigest && appliedDigest !== digest) return new Response('Result conflict', { status: 409 });
    if (!appliedDigest) {
      await this.applyResult(command, auth.verified.body, applicationKey, digest);
    }
    const resultStatus = auth.verified.body.status;
    const updated: CommandRecord = {
      ...command,
      status: resultStatus,
      lastSequence: auth.verified.body.sequence,
      resultStatus,
      resultCode: auth.verified.body.result_code,
      result: await this.encrypt(command.commandId, `result:${auth.verified.body.sequence}`, auth.verified.body),
      resultDigest: digest,
      leaseExpiresAt: resultStatus === 'progress'
        ? nowIso(Date.now() + COMMAND_LEASE_MS)
        : null,
      updatedAt: nowIso(),
    };
    await this.ctx.storage.put(commandKey(command.commandId), updated);
    // R2 media lifecycle is campaign/quota-owned. A command may be one of many
    // recipients referencing the same immutable bytes, so a terminal delivery
    // must never delete media from the transport layer.
    if (isTerminal(updated.status)) {
      await this.ctx.storage.delete(commandQueueKey(
        updated.deviceId,
        updated.createdAt,
        updated.commandId,
      ));
    }
    return this.resultAck(request, auth, commandId, auth.verified.body.sequence);
  }

  private async resultAck(request: Request, auth: {
    verified: VerifiedBridgeDeviceRequest;
    device: DeviceRecord;
  }, commandId: string, sequence: number): Promise<Response> {
    return signedBridgeResponse({
      body: JSON.stringify({ schema: BRIDGE_SCHEMA, status: 'accepted', command_id: commandId, sequence }),
      contentType: 'application/json; charset=utf-8',
      deviceId: auth.device.deviceId,
      deviceSecret: auth.verified.deviceSecret,
      requestNonce: auth.verified.nonce,
      path: new URL(request.url).pathname,
      commandId,
      sequence,
      expiresAt: 'ack',
    });
  }

  private async media(request: Request, auth: {
    verified: VerifiedBridgeDeviceRequest;
    device: DeviceRecord;
  }, commandId: string): Promise<Response> {
    if (!bridgeExactKeys(auth.verified.body, ['schema', 'command_id'])
      || auth.verified.body.schema !== BRIDGE_SCHEMA
      || auth.verified.body.command_id !== commandId) return new Response('Invalid request', { status: 400 });
    const command = await this.ctx.storage.get<CommandRecord>(commandKey(commandId));
    if (!command
      || command.deviceId !== auth.device.deviceId
      || !command.media
      || isTerminal(command.status)
      || !command.leaseExpiresAt
      || Date.parse(command.leaseExpiresAt) <= Date.now()) return new Response('Not found', { status: 404 });
    const object = await this.env.LEAD_RADAR_CAMPAIGN_MEDIA.get(command.media.objectKey);
    const metadata = object?.customMetadata ?? {};
    if (!object
      || object.size !== command.media.sizeBytes
      || object.size > MAX_MEDIA_BYTES
      || object.httpMetadata?.contentType !== command.media.mimeType
      || metadata.sha256 !== command.media.mediaDigest
      || metadata.mime_type !== command.media.mimeType
      || metadata.size_bytes !== String(command.media.sizeBytes)) {
      return new Response('Not found', { status: 404 });
    }
    return signedBridgeResponse({
      body: object.body,
      contentType: command.media.mimeType,
      deviceId: auth.device.deviceId,
      deviceSecret: auth.verified.deviceSecret,
      requestNonce: auth.verified.nonce,
      path: new URL(request.url).pathname,
      commandId,
      sequence: command.attempt,
      expiresAt: command.leaseExpiresAt,
      bodyDigest: command.media.mediaDigest,
      bodyLength: command.media.sizeBytes,
    });
  }

  private async publicRoute(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== publicOrigin(this.env) || request.method !== 'POST' || url.search || url.hash) {
      return new Response('Not Found', { status: 404 });
    }
    if (url.pathname === '/v1/bridge/register') return this.register(request);
    const auth = await this.authenticated(request);
    if (!auth) return new Response('Unauthorized', { status: 401 });
    if (url.pathname === '/v1/bridge/poll') return this.poll(request, auth);
    const match = /^\/v1\/bridge\/commands\/(lrtgbc_[a-f0-9]{32})\/(result|media)$/u.exec(url.pathname);
    if (!match) return new Response('Not Found', { status: 404 });
    return match[2] === 'result'
      ? this.result(request, auth, match[1] as string)
      : this.media(request, auth, match[1] as string);
  }

  private async enqueue(input: {
    orgId: string;
    accountRef: string;
    device: DeviceRecord;
    kind: CommandRecord['kind'];
    operationId: string;
    payload: BridgeJsonRecord;
    commandId?: string;
    media?: MediaReference | null;
    ttlMs?: number;
    effect?: { effectId: string; payloadDigest: string };
    initialAuth?: AuthRecord;
  }): Promise<CommandRecord> {
    if (input.device.state === 'revoked'
      || (input.device.state === 'pending_revocation' && input.kind !== 'disconnect')) {
      throw new MailboxFault('bridge_offline', 503);
    }
    const requestDigest = await sha256Hex([
      input.orgId, input.accountRef, input.kind, input.operationId, JSON.stringify(input.payload),
    ]);
    const opKey = commandOperationKey(input.orgId, input.operationId);
    const priorId = await this.ctx.storage.get<string>(opKey);
    if (priorId) {
      const prior = await this.ctx.storage.get<CommandRecord>(commandKey(priorId));
      if (!prior || prior.requestDigest !== requestDigest) throw new MailboxFault('command_conflict', 409);
      return prior;
    }
    const commandId = input.commandId ?? `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`;
    const now = nowIso();
    const command: CommandRecord = {
      version: 1,
      commandId,
      orgId: input.orgId,
      accountRef: input.accountRef,
      deviceId: input.device.deviceId,
      kind: input.kind,
      operationId: input.operationId,
      requestDigest,
      payload: await this.encrypt(commandId, 'payload', input.payload),
      status: 'queued',
      attempt: 0,
      leaseExpiresAt: null,
      lastSequence: 0,
      resultStatus: null,
      resultCode: null,
      result: null,
      resultDigest: null,
      media: input.media ?? null,
      createdAt: now,
      expiresAt: nowIso(Date.now() + (input.ttlMs ?? COMMAND_TTL_MS)),
      updatedAt: now,
    };
    await this.ctx.storage.transaction(async (storage) => {
      const raced = await storage.get<string>(opKey);
      if (raced) throw new MailboxFault('command_conflict', 409);
      const writes: Record<string, unknown> = {
        [commandKey(commandId)]: command,
        [opKey]: commandId,
        [commandQueueKey(input.device.deviceId, now, commandId)]: commandId,
      };
      if (input.initialAuth) {
        if (input.initialAuth.connectCommandId !== commandId
          || input.initialAuth.operationId !== input.operationId
          || input.initialAuth.orgId !== input.orgId
          || input.initialAuth.deviceId !== input.device.deviceId) {
          throw new MailboxFault('auth_conflict', 409);
        }
        const racedAuth = await storage.get<string>(orgAuthKey(input.orgId));
        if (racedAuth) {
          const priorAuth = await storage.get<AuthRecord>(authKey(racedAuth));
          if (!priorAuth || !['revoked', 'error'].includes(priorAuth.state)) {
            throw new MailboxFault('auth_conflict', 409);
          }
        }
        writes[authKey(input.initialAuth.authId)] = input.initialAuth;
        writes[orgAuthKey(input.orgId)] = input.initialAuth.authId;
      }
      if (input.effect) {
        const racedEffect = await storage.get<EffectRecord>(effectKey(input.effect.effectId));
        if (racedEffect) throw new MailboxFault('effect_conflict', 409);
        writes[effectKey(input.effect.effectId)] = {
            version: 1,
            effectId: input.effect.effectId,
            accountRef: input.accountRef,
            payloadDigest: input.effect.payloadDigest,
            commandId,
            status: 'in_flight',
            response: null,
            createdAt: now,
            updatedAt: now,
          } satisfies EffectRecord;
      }
      await storage.put(writes);
    });
    await this.scheduleAlarm();
    return command;
  }

  private async waitFor(commandId: string, timeoutMs: number): Promise<CommandRecord> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const command = await this.ctx.storage.get<CommandRecord>(commandKey(commandId));
      if (!command) throw new MailboxFault('command_not_found', 404);
      if (command.lastSequence > 0) return command;
      await sleep(WAIT_POLL_MS);
    }
    throw new MailboxFault('bridge_offline', 503);
  }

  private async waitTerminal(commandId: string, timeoutMs: number): Promise<CommandRecord> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const command = await this.ctx.storage.get<CommandRecord>(commandKey(commandId));
      if (!command) throw new MailboxFault('command_not_found', 404);
      if (isTerminal(command.status)) return command;
      await sleep(WAIT_POLL_MS);
    }
    throw new MailboxFault('bridge_offline', 503);
  }

  private authEnvelope(auth: AuthRecord): Response {
    if (auth.state === 'connected') {
      return jsonResponse({
        schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
        status: 'connected',
        auth_id: auth.authId,
        account_ref: auth.accountRef,
        masked_label: auth.maskedLabel ?? 'Telegram account',
        connected_at: auth.connectedAt ?? auth.updatedAt,
      });
    }
    if (auth.state === 'restricted'
      || auth.state === 'reauth_required'
      || auth.state === 'revoked'
      || auth.state === 'error') {
      return jsonResponse({
        schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
        status: auth.state,
        auth_id: auth.authId,
        reason_code: auth.reasonCode ?? 'authorization_failed',
      });
    }
    return jsonResponse({
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: auth.state,
      auth_id: auth.authId,
      bridge_command_id: auth.connectCommandId,
      device_id: auth.deviceId,
      expires_at: auth.relayExpiresAt ?? auth.expiresAt,
      qr_envelope: auth.state === 'awaiting_qr' ? auth.qrEnvelope : null,
      input_command_id: auth.state === 'awaiting_phone' || auth.state === 'awaiting_code'
        ? auth.inputCommandId : null,
      input_action: auth.state === 'awaiting_phone' ? 'phone'
        : auth.state === 'awaiting_code' ? 'code' : null,
      password_command_id: auth.state === 'awaiting_password' ? auth.passwordCommandId : null,
      reason_code: auth.reasonCode,
    });
  }

  private async detailedAuthEnvelope(auth: AuthRecord): Promise<Response> {
    if (!['awaiting_phone', 'awaiting_code', 'awaiting_password'].includes(auth.state)) {
      return this.authEnvelope(auth);
    }
    const device = await this.ctx.storage.get<DeviceRecord>(deviceKey(auth.deviceId));
    if (!device || device.state === 'revoked') return safeErrorResponse('bridge_offline', 503);
    const inputId = auth.state === 'awaiting_password' ? auth.passwordCommandId : auth.inputCommandId;
    const input = inputId ? await this.ctx.storage.get<CommandRecord>(commandKey(inputId)) : null;
    return jsonResponse({
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: auth.state,
      auth_id: auth.authId,
      bridge_command_id: auth.connectCommandId,
      device_id: auth.deviceId,
      expires_at: auth.relayExpiresAt ?? auth.expiresAt,
      qr_envelope: null,
      input_command_id: auth.state === 'awaiting_phone' || auth.state === 'awaiting_code'
        ? auth.inputCommandId : null,
      input_action: auth.state === 'awaiting_phone' ? 'phone'
        : auth.state === 'awaiting_code' ? 'code' : null,
      password_command_id: auth.passwordCommandId,
      bridge_encryption_key: {
        alg: 'RSA-OAEP-256',
        key_id: device.encryptionKeyId,
        spki: device.encryptionPublicKeySpki,
      },
      reason_code: auth.reasonCode,
      pending_action: input && !isTerminal(input.status)
        ? (auth.state === 'awaiting_password' ? 'password' : auth.inputAction) : null,
    });
  }

  private async beginConnection(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'account_ref', 'browser_key'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.operation_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.operation_id)
      || typeof body.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(body.account_ref)
      || !validBridgeBrowserKey(body.browser_key)) return safeErrorResponse('invalid_request');
    const device = await this.activeDevice(body.org_id);
    if (!device || this.deviceStatus(device) !== 'online') return safeErrorResponse('bridge_offline', 503);
    if (device.accountRef !== body.account_ref) return safeErrorResponse('routing_conflict', 409);
    const existingAuthId = await this.ctx.storage.get<string>(orgAuthKey(body.org_id));
    if (existingAuthId) {
      const existing = await this.ctx.storage.get<AuthRecord>(authKey(existingAuthId));
      if (existing && isFinalizedConnectedAuthRecoverable(existing.state, existing.finalized)) {
        // Finalized local custody can outlive the short QR ceremony. Pages may
        // crash after Bridge finalize but before committing D1; keep the exact
        // account recoverable and never replace it with a new auth flow.
        return existing.operationId === body.operation_id
          ? this.detailedAuthEnvelope(existing)
          : safeErrorResponse('auth_conflict', 409);
      }
      if (existing && existing.operationId === body.operation_id && Date.parse(existing.expiresAt) > Date.now()) {
        const original = await this.ctx.storage.get<CommandRecord>(commandKey(existing.connectCommandId));
        const originalPayload = original ? await this.commandPayload(original) : null;
        if (!originalPayload
          || JSON.stringify(originalPayload.browser_key) !== JSON.stringify(body.browser_key)) {
          // A regenerated browser key is a distinct ceremony. Returning an old
          // ciphertext under the same operation id would wedge the owner for
          // the full auth TTL, so fail closed and require a fresh operation.
          return safeErrorResponse('auth_key_conflict', 409);
        }
        const browserExpiresAt = Date.parse(
          ((originalPayload.browser_key as BridgeJsonRecord | undefined)?.expires_at as string | undefined) ?? '',
        );
        if (!Number.isFinite(browserExpiresAt) || browserExpiresAt <= Date.now()) {
          return safeErrorResponse('auth_key_expired', 409);
        }
        return this.detailedAuthEnvelope(existing);
      }
      if (existing && !['revoked', 'error'].includes(existing.state)) {
        if (Date.parse(existing.expiresAt) > Date.now()) {
          const original = await this.ctx.storage.get<CommandRecord>(commandKey(existing.connectCommandId));
          const originalPayload = original ? await this.commandPayload(original) : null;
          const originalBrowserKey = bridgeRecord(originalPayload?.browser_key)
            ? originalPayload.browser_key
            : null;
          const browserExpiresAt = typeof originalBrowserKey?.expires_at === 'string'
            ? Date.parse(originalBrowserKey.expires_at)
            : Number.NaN;
          const staleQrCeremony = ['starting', 'awaiting_qr'].includes(existing.state)
            && Number.isFinite(browserExpiresAt)
            && browserExpiresAt <= Date.now();
          if (!staleQrCeremony) return safeErrorResponse('auth_conflict', 409);
          const cancel = await this.enqueue({
            orgId: existing.orgId,
            accountRef: existing.accountRef,
            device,
            kind: 'cancel_auth',
            operationId: `cancel:${existing.authId}`,
            payload: { auth_id: existing.authId },
          });
          const cancelled = await this.waitTerminal(cancel.commandId, 70_000);
          const released = await this.ctx.storage.get<AuthRecord>(authKey(existing.authId));
          if (cancelled.status !== 'succeeded' || released?.state !== 'revoked') {
            return safeErrorResponse('bridge_cancel_failed', 503);
          }
        } else {
          await this.ctx.storage.put(authKey(existing.authId), {
            ...existing,
            state: 'error',
            qrEnvelope: null,
            relayExpiresAt: null,
            reasonCode: 'authorization_expired',
            updatedAt: nowIso(),
          } satisfies AuthRecord);
        }
      }
    }
    const authId = randomOpaqueId('auth_', 18);
    // Browser QR keys are one-use and <=90 seconds, while provisional MTProto
    // custody must remain recoverable through a slower 2FA/finalize ceremony.
    // Each encrypted relay is separately capped to its own <=90 second key.
    const expiresAt = nowIso(Date.now() + AUTH_TTL_MS);
    const commandId = `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`;
    const auth: AuthRecord = {
      version: 1,
      authId,
      orgId: body.org_id,
      accountRef: body.account_ref,
      deviceId: device.deviceId,
      operationId: body.operation_id,
      mode: 'qr',
      connectCommandId: commandId,
      inputCommandId: null,
      previousInputCommandId: null,
      inputAction: null,
      passwordCommandId: null,
      previousPasswordCommandId: null,
      state: 'starting',
      adopted: false,
      finalized: false,
      qrEnvelope: null,
      relayExpiresAt: null,
      maskedLabel: null,
      connectedAt: null,
      reasonCode: null,
      expiresAt,
      updatedAt: nowIso(),
    };
    const command = await this.enqueue({
      orgId: body.org_id,
      accountRef: body.account_ref,
      device,
      kind: 'connect',
      operationId: body.operation_id,
      commandId,
      payload: {
        org_id: body.org_id,
        auth_id: authId,
        account_ref: body.account_ref,
        browser_key: body.browser_key,
        expires_at: expiresAt,
      },
      ttlMs: AUTH_TTL_MS,
      initialAuth: auth,
    });
    await this.waitFor(command.commandId, 70_000);
    const updated = await this.ctx.storage.get<AuthRecord>(authKey(authId));
    if (!updated) throw new MailboxFault('auth_not_found', 404);
    return this.detailedAuthEnvelope(updated);
  }

  private async beginPhoneConnection(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'account_ref'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.operation_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.operation_id)
      || typeof body.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(body.account_ref)) return safeErrorResponse('invalid_request');
    const orgId = body.org_id as string;
    const operationId = body.operation_id as string;
    const accountRef = body.account_ref as string;
    const device = await this.activeDevice(orgId);
    if (!device || this.deviceStatus(device) !== 'online') return safeErrorResponse('bridge_offline', 503);
    if (device.accountRef !== accountRef) return safeErrorResponse('routing_conflict', 409);

    const existingAuthId = await this.ctx.storage.get<string>(orgAuthKey(orgId));
    if (existingAuthId) {
      const existing = await this.ctx.storage.get<AuthRecord>(authKey(existingAuthId));
      if (existing && isFinalizedConnectedAuthRecoverable(existing.state, existing.finalized)) {
        return existing.operationId === operationId
          ? this.detailedAuthEnvelope(existing)
          : safeErrorResponse('auth_conflict', 409);
      }
      if (existing && existing.operationId === operationId
        && existing.mode === 'phone' && Date.parse(existing.expiresAt) > Date.now()) {
        return this.detailedAuthEnvelope(existing);
      }
      if (existing && bridgeAuthChallengeMayBeCancelled({
        state: existing.state,
        adopted: existing.adopted,
        finalized: existing.finalized,
        expiresAt: existing.expiresAt,
      })) {
        const cancel = await this.enqueue({
          orgId: existing.orgId,
          accountRef: existing.accountRef,
          device,
          kind: 'cancel_auth',
          operationId: `cancel:${existing.authId}`,
          payload: { auth_id: existing.authId },
        });
        const cancelled = await this.waitTerminal(cancel.commandId, 70_000);
        const released = await this.ctx.storage.get<AuthRecord>(authKey(existing.authId));
        if (cancelled.status !== 'succeeded' || released?.state !== 'revoked') {
          return safeErrorResponse('bridge_cancel_failed', 503);
        }
      } else if (existing && !['revoked', 'error'].includes(existing.state)) {
        return safeErrorResponse('auth_conflict', 409);
      }
    }

    const authId = randomOpaqueId('auth_', 18);
    const expiresAt = nowIso(Date.now() + AUTH_TTL_MS);
    const commandId = `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`;
    const auth: AuthRecord = {
      version: 1,
      authId,
      orgId,
      accountRef,
      deviceId: device.deviceId,
      operationId,
      mode: 'phone',
      connectCommandId: commandId,
      inputCommandId: null,
      previousInputCommandId: null,
      inputAction: null,
      passwordCommandId: null,
      previousPasswordCommandId: null,
      state: 'starting',
      adopted: false,
      finalized: false,
      qrEnvelope: null,
      relayExpiresAt: null,
      maskedLabel: null,
      connectedAt: null,
      reasonCode: null,
      expiresAt,
      updatedAt: nowIso(),
    };
    await this.enqueue({
      orgId,
      accountRef,
      device,
      kind: 'connect_phone',
      operationId,
      commandId,
      payload: { org_id: orgId, auth_id: authId, account_ref: accountRef, expires_at: expiresAt },
      ttlMs: AUTH_TTL_MS,
      initialAuth: auth,
    });
    // Starting a phone login must not hold the browser request open while the
    // desktop Bridge waits for its next poll. Return the durable `starting`
    // challenge immediately; the owner UI already polls the exact auth id and
    // will render the phone field as soon as the Bridge reports
    // `awaiting_phone`. This also makes cold-start/offline failures visible as
    // state instead of leaving the button spinning for the 70-second control
    // deadline.
    return this.detailedAuthEnvelope(auth);
  }

  private async activeAuth(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)) return safeErrorResponse('invalid_request');
    const authId = await this.ctx.storage.get<string>(orgAuthKey(body.org_id));
    if (!authId) return safeErrorResponse('auth_not_found', 404);
    const auth = await this.ctx.storage.get<AuthRecord>(authKey(authId));
    // `active` is a recovery locator, not an auth history endpoint. Returning
    // a cancelled/error record here lets a fresh owner connect adopt that
    // terminal auth id, persist a new pending D1 row for it, and immediately
    // surface the old `revoked` state without ever enqueueing a Bridge command.
    if (!auth || ['revoked', 'error'].includes(auth.state)
      || (Date.parse(auth.expiresAt) <= Date.now()
      && !isFinalizedConnectedAuthRecoverable(auth.state, auth.finalized))) {
      return safeErrorResponse('auth_not_found', 404);
    }
    return this.detailedAuthEnvelope(auth);
  }

  private async authState(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'auth_id'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.auth_id !== 'string'
      || !AUTH_ID_PATTERN.test(body.auth_id)) return safeErrorResponse('invalid_request');
    const auth = await this.ctx.storage.get<AuthRecord>(authKey(body.auth_id));
    if (!auth || auth.orgId !== body.org_id) return safeErrorResponse('auth_not_found', 404);
    return this.detailedAuthEnvelope(auth);
  }

  private async submitPassword(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, [
      'schema', 'org_id', 'auth_id', 'password_command_id', 'password_envelope',
    ])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.auth_id !== 'string'
      || !AUTH_ID_PATTERN.test(body.auth_id)
      || typeof body.password_command_id !== 'string'
      || !/^lrtgbc_[a-f0-9]{32}$/u.test(body.password_command_id)
      || !validBridgeE2eEnvelope(body.password_envelope)) return safeErrorResponse('invalid_request');
    const auth = await this.ctx.storage.get<AuthRecord>(authKey(body.auth_id));
    if (!auth
      || auth.orgId !== body.org_id
      || auth.state !== 'awaiting_password'
      || auth.passwordCommandId !== body.password_command_id
      || !auth.relayExpiresAt
      || Date.parse(auth.relayExpiresAt) <= Date.now()
      || Date.parse(auth.relayExpiresAt) > Date.parse(auth.expiresAt)) {
      return safeErrorResponse('auth_conflict', 409);
    }
    const device = await this.ctx.storage.get<DeviceRecord>(deviceKey(auth.deviceId));
    if (!device || this.deviceStatus(device) !== 'online') return safeErrorResponse('bridge_offline', 503);
    await this.enqueue({
      orgId: auth.orgId,
      accountRef: auth.accountRef,
      device,
      kind: 'submit_password',
      operationId: `password:${auth.authId}:${auth.passwordCommandId}`,
      commandId: auth.passwordCommandId,
      payload: {
        org_id: auth.orgId,
        auth_id: auth.authId,
        password_envelope: body.password_envelope,
      },
      ttlMs: Math.max(1_000, Date.parse(auth.relayExpiresAt) - Date.now()),
    });
    const updated = await this.ctx.storage.get<AuthRecord>(authKey(auth.authId));
    if (!updated) throw new MailboxFault('auth_not_found', 404);
    return this.detailedAuthEnvelope(updated);
  }

  private async submitAuthInput(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, [
      'schema', 'org_id', 'auth_id', 'input_command_id', 'input_action', 'input_envelope',
    ])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.auth_id !== 'string'
      || !AUTH_ID_PATTERN.test(body.auth_id)
      || typeof body.input_command_id !== 'string'
      || !/^lrtgbc_[a-f0-9]{32}$/u.test(body.input_command_id)
      || !['phone', 'code'].includes(String(body.input_action))
      || !validBridgeE2eEnvelope(body.input_envelope)) return safeErrorResponse('invalid_request');
    const auth = await this.ctx.storage.get<AuthRecord>(authKey(body.auth_id));
    if (!auth
      || auth.orgId !== body.org_id
      || auth.inputCommandId !== body.input_command_id
      || auth.inputAction !== body.input_action
      || auth.state !== (body.input_action === 'phone' ? 'awaiting_phone' : 'awaiting_code')
      || !auth.relayExpiresAt
      || Date.parse(auth.relayExpiresAt) <= Date.now()
      || Date.parse(auth.relayExpiresAt) > Date.parse(auth.expiresAt)) {
      return safeErrorResponse('auth_conflict', 409);
    }
    const device = await this.ctx.storage.get<DeviceRecord>(deviceKey(auth.deviceId));
    if (!device || this.deviceStatus(device) !== 'online') return safeErrorResponse('bridge_offline', 503);
    await this.enqueue({
      orgId: auth.orgId,
      accountRef: auth.accountRef,
      device,
      kind: 'submit_auth',
      operationId: `${body.input_action}:${auth.authId}:${auth.inputCommandId}`,
      commandId: auth.inputCommandId,
      payload: {
        org_id: auth.orgId,
        auth_id: auth.authId,
        action: body.input_action,
        auth_envelope: body.input_envelope,
      },
      ttlMs: Math.max(1_000, Date.parse(auth.relayExpiresAt) - Date.now()),
    });
    const updated = await this.ctx.storage.get<AuthRecord>(authKey(auth.authId));
    if (!updated) throw new MailboxFault('auth_not_found', 404);
    return this.detailedAuthEnvelope(updated);
  }

  private async adoptAuth(body: JsonRecord): Promise<Response> {
    const auth = await this.exactAuth(body);
    if (auth instanceof Response) return auth;
    if (auth.finalized || ['revoked', 'error'].includes(auth.state)) {
      return safeErrorResponse('auth_conflict', 409);
    }
    await this.ctx.storage.put(authKey(auth.authId), { ...auth, adopted: true, updatedAt: nowIso() });
    return noContentResponse();
  }

  private async finalizeAuth(body: JsonRecord): Promise<Response> {
    const auth = await this.exactAuth(body);
    if (auth instanceof Response) return auth;
    if (!auth.adopted || auth.state !== 'connected') return safeErrorResponse('auth_conflict', 409);
    if (auth.finalized) {
      const account = await this.ctx.storage.get<AccountRecord>(accountKey(auth.accountRef));
      return account
        && account.orgId === auth.orgId
        && account.authId === auth.authId
        && account.deviceId === auth.deviceId
        && account.finalized
        && account.state === 'connected'
        ? noContentResponse()
        : safeErrorResponse('bridge_finalize_failed', 503);
    }
    const device = await this.ctx.storage.get<DeviceRecord>(deviceKey(auth.deviceId));
    if (!device || this.deviceStatus(device) !== 'online') return safeErrorResponse('bridge_offline', 503);
    let command = auth.finalizeCommandId
      ? await this.ctx.storage.get<CommandRecord>(commandKey(auth.finalizeCommandId)) : undefined;
    if (!command || (isTerminal(command.status) && command.status !== 'succeeded')) {
      command = await this.enqueue({
        orgId: auth.orgId,
        accountRef: auth.accountRef,
        device,
        kind: 'probe',
        operationId: command ? `finalize:${auth.authId}:${command.commandId}` : `finalize:${auth.authId}`,
        payload: { account_ref: auth.accountRef, finalize_auth_id: auth.authId },
      });
      const commandId = command.commandId;
      await this.ctx.storage.transaction(async (storage) => {
        const current = await storage.get<AuthRecord>(authKey(auth.authId));
        if (current) await storage.put(authKey(auth.authId), { ...current, finalizeCommandId: commandId });
      });
    }
    if (!isTerminal(command.status)) return new Response(null, { status: 202 });
    if (command.status !== 'succeeded') return safeErrorResponse('bridge_finalize_failed', 503);
    const updated = await this.ctx.storage.get<AuthRecord>(authKey(auth.authId));
    const account = await this.ctx.storage.get<AccountRecord>(accountKey(auth.accountRef));
    if (!updated?.finalized
      || !account?.finalized
      || account.orgId !== auth.orgId
      || account.authId !== auth.authId
      || account.deviceId !== auth.deviceId
      || account.state !== 'connected') return safeErrorResponse('bridge_finalize_failed', 503);
    return noContentResponse();
  }

  private async exactAuth(body: JsonRecord): Promise<AuthRecord | Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'auth_id'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.auth_id !== 'string'
      || !AUTH_ID_PATTERN.test(body.auth_id)) return safeErrorResponse('invalid_request');
    const auth = await this.ctx.storage.get<AuthRecord>(authKey(body.auth_id));
    return !auth || auth.orgId !== body.org_id ? safeErrorResponse('auth_not_found', 404) : auth;
  }

  private async cancelAuth(body: JsonRecord): Promise<Response> {
    const auth = await this.exactAuth(body);
    if (auth instanceof Response) return auth;
    if (auth.state === 'revoked') return noContentResponse();
    if (!bridgeAuthChallengeMayBeCancelled({
      state: auth.state,
      adopted: auth.adopted,
      finalized: auth.finalized,
      expiresAt: auth.expiresAt,
    })) return safeErrorResponse('auth_adopted', 409);
    const device = await this.ctx.storage.get<DeviceRecord>(deviceKey(auth.deviceId));
    if (!device || device.state === 'revoked') return safeErrorResponse('bridge_offline', 503);
    const command = await this.enqueue({
      orgId: auth.orgId,
      accountRef: auth.accountRef,
      device,
      kind: 'cancel_auth',
      operationId: `cancel:${auth.authId}`,
      payload: { auth_id: auth.authId },
    });
    const terminal = await this.waitTerminal(command.commandId, 70_000);
    return terminal.status === 'succeeded' ? noContentResponse() : safeErrorResponse('bridge_cancel_failed', 503);
  }

  private async disconnect(body: JsonRecord): Promise<Response> {
    if (!((hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'account_ref']))
      || hasExactKeys(body, ['schema', 'org_id', 'operation_id']))
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.operation_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.operation_id)) return safeErrorResponse('invalid_request');
    const accountRef = typeof body.account_ref === 'string'
      ? body.account_ref
      : await this.accountRef(body.org_id);
    if (!validBridgeAccountRef(accountRef)) return safeErrorResponse('invalid_request');
    const account = await this.ctx.storage.get<AccountRecord>(accountKey(accountRef));
    if (!account || account.orgId !== body.org_id) return safeErrorResponse('account_not_found', 404);
    if (account.state === 'revoked') return jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'revoked' });
    const device = await this.ctx.storage.get<DeviceRecord>(deviceKey(account.deviceId));
    if (!device || device.state === 'revoked') return safeErrorResponse('bridge_revocation_unconfirmed', 503);
    await this.ctx.storage.put(deviceKey(device.deviceId), {
      ...device,
      state: 'pending_revocation',
    } satisfies DeviceRecord);
    const command = await this.enqueue({
      orgId: account.orgId,
      accountRef,
      device: { ...device, state: 'pending_revocation' },
      kind: 'disconnect',
      operationId: body.operation_id,
      payload: { account_ref: accountRef, auth_id: account.authId },
      ttlMs: 365 * 24 * 60 * 60_000,
    });
    const terminal = await this.waitTerminal(command.commandId, 70_000);
    return terminal.status === 'succeeded'
      ? jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'revoked' })
      : safeErrorResponse('bridge_revocation_unconfirmed', 503);
  }

  private async health(): Promise<Response> {
    return jsonResponse({
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: 'ok',
      account_status: 'not_connected',
      reason_code: null,
      provider_blocked_until: null,
      snapshot_present: false,
      active_effect: false,
      container_running: false,
    });
  }

  private async accountHealth(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'account_ref'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(body.account_ref)
      || body.account_ref !== await this.accountRef(body.org_id)) return safeErrorResponse('invalid_request');
    const account = await this.ctx.storage.get<AccountRecord>(accountKey(body.account_ref));
    if (account && account.orgId !== body.org_id) return safeErrorResponse('routing_conflict', 409);
    const device = await this.activeDevice(body.org_id);
    return jsonResponse({
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: 'ok',
      account_status: account?.state ?? 'not_connected',
      reason_code: account?.reasonCode ?? (device ? null : 'bridge_not_paired'),
      provider_blocked_until: account?.providerBlockedUntil ?? null,
      snapshot_present: false,
      active_effect: false,
      container_running: false,
      bridge_status: this.deviceStatus(device),
    });
  }

  private async validateMedia(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'account_ref', 'media_ref'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.operation_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.operation_id)
      || typeof body.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(body.account_ref)
      || body.account_ref !== await this.accountRef(body.org_id)
      || !bridgeRecord(body.media_ref)) return safeErrorResponse('invalid_request');
    const device = await this.activeDevice(body.org_id);
    if (!device || this.deviceStatus(device) !== 'online') return safeErrorResponse('bridge_offline', 503);
    if (device.accountRef !== body.account_ref) return safeErrorResponse('routing_conflict', 409);
    const media = this.parseMediaReference(body.media_ref, body.org_id);
    if (!media) return safeErrorResponse('invalid_request');
    const commandId = `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`;
    const command = await this.enqueue({
      orgId: body.org_id,
      accountRef: body.account_ref,
      device,
      kind: 'validate_media',
      operationId: body.operation_id,
      commandId,
      payload: {
        media: {
          media_id: media.mediaId,
          media_digest: media.mediaDigest,
          mime_type: media.mimeType,
          size_bytes: media.sizeBytes,
          download_path: `/v1/bridge/commands/${commandId}/media`,
        },
      },
      media,
    });
    const terminal = await this.waitTerminal(command.commandId, 70_000);
    return terminal.status === 'succeeded' && terminal.resultCode === 'media_valid'
      ? jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'valid' })
      : terminal.status === 'failed' && terminal.resultCode === 'media_invalid'
        ? jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'rejected', code: 'media_invalid' })
        : safeErrorResponse('bridge_media_validation_failed', 503);
  }

  private parseMediaReference(value: BridgeJsonRecord, orgId: string): MediaReference | null {
    if (!bridgeExactKeys(value, ['object_key', 'media_id', 'media_digest', 'mime_type', 'size_bytes'])
      || typeof value.object_key !== 'string'
      || typeof value.media_id !== 'string'
      || !/^lrtgcm_[a-f0-9]{32}$/u.test(value.media_id)
      || value.object_key !== `lead-radar/campaign-media/${orgId}/${value.media_id}`
      || typeof value.media_digest !== 'string'
      || !/^[a-f0-9]{64}$/u.test(value.media_digest)
      || !['image/jpeg', 'image/png', 'image/webp'].includes(String(value.mime_type))
      || typeof value.size_bytes !== 'number'
      || !Number.isSafeInteger(value.size_bytes)
      || value.size_bytes < 1
      || value.size_bytes > MAX_MEDIA_BYTES) return null;
    return {
      objectKey: value.object_key,
      mediaId: value.media_id,
      mediaDigest: value.media_digest,
      mimeType: value.mime_type as MediaReference['mimeType'],
      sizeBytes: value.size_bytes,
    };
  }

  private async sendMessage(body: JsonRecord): Promise<Response> {
    const base = [
      'schema', 'org_id', 'account_ref', 'username', 'text', 'random_id',
      'paid_message_policy', 'allow_paid_floodskip',
    ];
    if (!(hasExactKeys(body, base) || hasExactKeys(body, [...base, 'media_ref']))
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(body.account_ref)
      || body.account_ref !== await this.accountRef(body.org_id)
      || typeof body.username !== 'string'
      || !USERNAME_PATTERN.test(body.username)
      || !validMessage(body.text, body.media_ref ? 1_024 : 4_096)
      || typeof body.random_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.random_id)
      || body.paid_message_policy !== 'reject'
      || body.allow_paid_floodskip !== false) return safeErrorResponse('invalid_request');
    const account = await this.ctx.storage.get<AccountRecord>(accountKey(body.account_ref));
    if (!account) return safeErrorResponse('account_not_found', 404);
    if (account.orgId !== body.org_id) return safeErrorResponse('routing_conflict', 409);
    if (!account.finalized || account.state !== 'connected') {
      return jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'rejected', code: 'account_restricted' });
    }
    const device = await this.ctx.storage.get<DeviceRecord>(deviceKey(account.deviceId));
    if (!device || this.deviceStatus(device) !== 'online') {
      return jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' });
    }
    const media = body.media_ref && bridgeRecord(body.media_ref)
      ? this.parseMediaReference(body.media_ref, account.orgId)
      : null;
    if (body.media_ref && !media) return safeErrorResponse('invalid_request');
    const payloadDigest = await telegramMessagePayloadDigest({
      accountRef: body.account_ref,
      username: body.username,
      text: body.text as string,
      randomId: body.random_id,
      media: media ? {
        media_id: media.mediaId,
        media_digest: media.mediaDigest,
        mime_type: media.mimeType,
        size_bytes: media.sizeBytes,
      } : null,
    });
    const existing = await this.ctx.storage.get<EffectRecord>(effectKey(body.random_id));
    if (existing) {
      if (existing.payloadDigest !== payloadDigest || existing.accountRef !== body.account_ref) {
        return safeErrorResponse('effect_conflict', 409);
      }
      if (existing.response) return jsonResponse(await this.decrypt(existing.commandId, 'effect-response', existing.response));
      const command = await this.ctx.storage.get<CommandRecord>(commandKey(existing.commandId));
      if (command && isTerminal(command.status)) return jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' });
      try {
        await this.waitTerminal(existing.commandId, 115_000);
      } catch {
        return jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' });
      }
      const finished = await this.ctx.storage.get<EffectRecord>(effectKey(body.random_id));
      return finished?.response
        ? jsonResponse(await this.decrypt(finished.commandId, 'effect-response', finished.response))
        : jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' });
    }
    const commandId = `lrtgbc_${crypto.randomUUID().replaceAll('-', '')}`;
    const command = await this.enqueue({
      orgId: account.orgId,
      accountRef: account.accountRef,
      device,
      kind: 'send',
      operationId: body.random_id,
      commandId,
      payload: {
        effect_id: body.random_id,
        account_ref: account.accountRef,
        endpoint: body.username,
        text: body.text,
        link_preview: false,
        paid_message_policy: 'reject',
        allow_paid_floodskip: false,
        media: media ? {
          media_id: media.mediaId,
          media_digest: media.mediaDigest,
          mime_type: media.mimeType,
          size_bytes: media.sizeBytes,
          download_path: `/v1/bridge/commands/${commandId}/media`,
        } : null,
      },
      media,
      effect: { effectId: body.random_id, payloadDigest },
    });
    try {
      await this.waitTerminal(command.commandId, 115_000);
    } catch {
      return jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' });
    }
    const effect = await this.ctx.storage.get<EffectRecord>(effectKey(body.random_id));
    return effect?.response
      ? jsonResponse(await this.decrypt(effect.commandId, 'effect-response', effect.response))
      : jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' });
  }

  private async reconcile(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'account_ref', 'random_id', 'payload_digest'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.org_id !== 'string'
      || !ORG_ID_PATTERN.test(body.org_id)
      || typeof body.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(body.account_ref)
      || body.account_ref !== await this.accountRef(body.org_id)
      || typeof body.random_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.random_id)
      || typeof body.payload_digest !== 'string'
      || !/^[a-f0-9]{64}$/u.test(body.payload_digest)) return safeErrorResponse('invalid_request');
    const effect = await this.ctx.storage.get<EffectRecord>(effectKey(body.random_id));
    if (!effect) return safeErrorResponse('effect_not_found', 404);
    if (effect.accountRef !== body.account_ref || effect.payloadDigest !== body.payload_digest) {
      return safeErrorResponse('effect_conflict', 409);
    }
    return effect.response
      ? jsonResponse(await this.decrypt(effect.commandId, 'effect-response', effect.response))
      : jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' });
  }

  private async internalRoute(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== INTERNAL_ACCOUNT_ORIGIN || request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }
    const body = await readBoundedJson(request, 64_000);
    if (!body) return safeErrorResponse('invalid_request');
    switch (url.pathname) {
      case '/internal/bridge/pairings': return this.createPairing(body);
      case '/internal/bridge/status': return this.bridgeStatus(body);
      case '/internal/bridge/revoke': return this.revokeBridge(body);
      case '/internal/accounts/connect/qr': return this.beginConnection(body);
      case '/internal/accounts/connect/phone/start': return this.beginPhoneConnection(body);
      case '/internal/accounts/connect/input': return this.submitAuthInput(body);
      case '/internal/accounts/connect/active': return this.activeAuth(body);
      case '/internal/accounts/connect/state': return this.authState(body);
      case '/internal/accounts/connect/status': return this.authState(body);
      case '/internal/accounts/connect/password': return this.submitPassword(body);
      case '/internal/accounts/connect/adopt': return this.adoptAuth(body);
      case '/internal/accounts/connect/finalize': return this.finalizeAuth(body);
      case '/internal/accounts/connect/cancel': return this.cancelAuth(body);
      case '/internal/accounts/disconnect': return this.disconnect(body);
      case '/internal/accounts/health': return this.accountHealth(body);
      case '/internal/health': return this.health();
      case '/internal/media/validate': return this.validateMedia(body);
      case '/internal/messages/send': return this.sendMessage(body);
      case '/internal/messages/reconcile': return this.reconcile(body);
      default: return new Response('Not Found', { status: 404 });
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const terminalBefore = now - TERMINAL_PAYLOAD_RETENTION_MS;
    const cursors = await this.ctx.storage.get<CleanupCursors>(CLEANUP_CURSOR_KEY) ?? {
      pairings: null,
      nonces: null,
      commands: null,
      auth: null,
      effects: null,
    };
    const nextCursor = <T>(rows: Map<string, T>, limit: number): string | null => (
      rows.size === limit ? ([...rows.keys()].at(-1) ?? null) : null
    );
    const pairings = await this.ctx.storage.list<PairingRecord>({
      prefix: 'bridge:pairing:',
      ...(cursors.pairings ? { startAfter: cursors.pairings } : {}),
      limit: 128,
    });
    for (const [key, pairing] of pairings) {
      if (pairing.status === 'pending' && Date.parse(pairing.expiresAt) <= now) {
        await this.ctx.storage.put(key, { ...pairing, status: 'expired' } satisfies PairingRecord);
      } else if (pairing.status !== 'pending' && Date.parse(pairing.createdAt) <= terminalBefore) {
        await this.ctx.storage.delete(key);
      }
    }
    cursors.pairings = nextCursor(pairings, 128);
    const nonces = await this.ctx.storage.list<NonceRecord>({
      prefix: 'bridge:nonce:',
      ...(cursors.nonces ? { startAfter: cursors.nonces } : {}),
      limit: 256,
    });
    const expiredNonces = [...nonces.entries()]
      .filter(([, nonce]) => Date.parse(nonce.expiresAt) <= now)
      .map(([key]) => key);
    if (expiredNonces.length > 0) await this.ctx.storage.delete(expiredNonces);
    cursors.nonces = nextCursor(nonces, 256);
    const commands = await this.ctx.storage.list<CommandRecord>({
      prefix: 'bridge:command:',
      ...(cursors.commands ? { startAfter: cursors.commands } : {}),
      limit: 256,
    });
    for (const [key, command] of commands) {
      if (!isTerminal(command.status)
        && command.kind !== 'disconnect'
        && Date.parse(command.expiresAt) <= now) {
        await this.ctx.storage.put(commandKey(command.commandId), {
          ...command,
          status: command.kind === 'send' ? 'ambiguous' : 'failed',
          resultStatus: command.kind === 'send' ? 'ambiguous' : 'failed',
          resultCode: 'command_expired',
          leaseExpiresAt: null,
          updatedAt: nowIso(),
        } satisfies CommandRecord);
        await this.ctx.storage.delete(commandQueueKey(
          command.deviceId,
          command.createdAt,
          command.commandId,
        ));
        // Media retention/quota sweep owns R2 deletion after all command
        // references expire; command cleanup only closes mailbox state.
      } else if (isTerminal(command.status) && Date.parse(command.updatedAt) <= terminalBefore) {
        const applications = await this.ctx.storage.list<string>({
          prefix: `bridge:result-application:${command.commandId}:`,
          limit: 256,
        });
        if (applications.size > 0) await this.ctx.storage.delete([...applications.keys()]);
        await this.ctx.storage.delete(key);
      }
    }
    cursors.commands = nextCursor(commands, 256);
    const authRecords = await this.ctx.storage.list<AuthRecord>({
      prefix: 'bridge:auth:',
      ...(cursors.auth ? { startAfter: cursors.auth } : {}),
      limit: 128,
    });
    for (const [key, auth] of authRecords) {
      if (Date.parse(auth.expiresAt) <= now && (auth.qrEnvelope || auth.relayExpiresAt)) {
        await this.ctx.storage.put(key, { ...auth, qrEnvelope: null, relayExpiresAt: null } satisfies AuthRecord);
      }
    }
    cursors.auth = nextCursor(authRecords, 128);
    const effects = await this.ctx.storage.list<EffectRecord>({
      prefix: 'bridge:effect:',
      ...(cursors.effects ? { startAfter: cursors.effects } : {}),
      limit: 256,
    });
    for (const [key, effect] of effects) {
      if (effect.status !== 'in_flight'
        && effect.response
        && Date.parse(effect.updatedAt) <= terminalBefore) {
        // Keep the digest/status tombstone permanently so a replay can never
        // create a second provider call, but discard the encrypted response.
        await this.ctx.storage.put(key, { ...effect, response: null } satisfies EffectRecord);
      }
    }
    cursors.effects = nextCursor(effects, 256);
    await this.ctx.storage.put(CLEANUP_CURSOR_KEY, cursors);
    await this.scheduleAlarm(now);
  }

  async alarm(): Promise<void> {
    await this.cleanup();
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const origin = new URL(request.url).origin;
      return origin === INTERNAL_ACCOUNT_ORIGIN
        ? await this.internalRoute(request)
        : await this.publicRoute(request);
    } catch (error) {
      if (error instanceof MailboxFault) return safeErrorResponse(error.code, error.status);
      return safeErrorResponse('bridge_gateway_error', 503);
    }
  }
}

export const BRIDGE_MAILBOX_OBJECT_NAME = MAILBOX_NAME;
